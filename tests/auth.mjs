import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import worker, { handle } from '../worker/index.mjs';

const origin = 'https://studium.yycholla.com';
const hash = value => createHash('sha256').update(value).digest('base64url');
const character = (key, extra = {}) => ({ persistent_key: key, lodestone_id: 12345,
  name: `Character ${key}`, home_world: 'Balmung', data_center: 'Crystal', verified_at: '2026-10-01T12:00:00Z', ...extra });
function fixture(t) {
  const logs = [];
  t.mock.method(console, 'error', line => logs.push(JSON.parse(line)));
  const db = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../migrations/', import.meta.url)).filter(f => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
  t.after(() => db.close());
  const wrap = (sql, args = []) => ({
    bind: (...values) => wrap(sql, values),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => db.prepare(sql).run(...args),
    execute: () => db.prepare(sql).all(...args),
  });
  const env = { SITE_ORIGIN: origin, XIVAUTH_CLIENT_ID: 'test-client-id', XIVAUTH_CLIENT_SECRET: 'test-private-secret',
    ASSETS: { fetch: async () => new Response('static asset') },
    DB: { prepare: wrap, batch: async statements => {
      db.exec('BEGIN');
      try { const result = statements.map(s => s.execute()); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    } },
  };
  const calls = [];
  let profile = { id: 'user-a', display_name: 'Adventurer', email: 'private@example.com' };
  let characters = [character('a'), character('b'), character('unverified', { verified_at: null })];
  let failure;
  let failureResponse;
  const fetcher = async (url, init) => {
    const path = new URL(url).pathname; calls.push({ path, init });
    if (failure === path) {
      if (failureResponse instanceof Error) throw failureResponse;
      return failureResponse || Response.json({ error: 'sensitive upstream failure' }, { status: 500 });
    }
    if (path === '/oauth/token') return Response.json({ access_token: 'provider-private-token', token_type: 'Bearer', refresh_token: 'unused-refresh' });
    if (path === '/api/v1/user') return Response.json(profile);
    if (path === '/api/v1/characters') return Response.json(characters);
    if (path === '/oauth/revoke') return Response.json({});
    throw new Error(`Unexpected provider URL: ${url}`);
  };
  const request = (path, init = {}) => handle(new Request(`${origin}${path}`, init), env, fetcher);
  const start = async () => {
    const response = await request('/auth/login');
    const location = new URL(response.headers.get('Location'));
    const cookie = response.headers.getSetCookie()[0].split(';')[0];
    return { response, location, cookie, state: location.searchParams.get('state') };
  };
  const finish = async (flow, extraCookie = '') => request(`/auth/callback?state=${flow.state}&code=valid-code`, { headers: { Cookie: `${flow.cookie}${extraCookie ? `; ${extraCookie}` : ''}` } });
  const login = async (extraCookie = '') => {
    const response = await finish(await start(), extraCookie);
    assert.equal(response.headers.get('Location'), '/account');
    const cookie = response.headers.getSetCookie().find(c => c.startsWith('__Host-studium_session=')).split(';')[0];
    const data = await (await request('/api/auth/session', { headers: { Cookie: cookie } })).json();
    return { response, cookie, data };
  };
  const post = (path, signed, body = {}, headers = {}) => request(path, { method: 'POST', headers: {
    Cookie: signed.cookie, Origin: origin, 'Content-Type': 'application/json', 'X-CSRF-Token': signed.data.csrf_token, ...headers,
  }, body: JSON.stringify(body) });
  return { db, env, calls, logs, request, start, finish, login, post,
    setProfile: value => { profile = value; }, setCharacters: value => { characters = value; },
    fail: (path, response) => { failure = path; failureResponse = response; } };
}

test('login uses S256, browser-bound state, fixed callback, minimal scopes and secure cookies', async t => {
  const f = fixture(t); const flow = await f.start();
  assert.equal(flow.response.status, 303);
  assert.equal(flow.location.origin, 'https://xivauth.net');
  assert.equal(flow.location.searchParams.get('redirect_uri'), `${origin}/auth/callback`);
  assert.equal(flow.location.searchParams.get('scope'), 'user character:all');
  assert.equal(flow.location.searchParams.get('code_challenge_method'), 'S256');
  const stored = f.db.prepare('SELECT * FROM oauth_flows').get();
  assert.equal(stored.state_hash, hash(flow.state));
  assert.equal(stored.binding_hash, hash(flow.cookie.split('=')[1]));
  assert.equal(flow.location.searchParams.get('code_challenge'), hash(stored.verifier));
  assert.match(flow.response.headers.get('Set-Cookie'), /Path=\/; HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
  assert.equal(flow.response.headers.get('Cache-Control'), 'private, no-store');
});

test('callback stores verified characters only, hashes sessions and discards provider secrets', async t => {
  const f = fixture(t); const signed = await f.login();
  assert.equal(signed.data.account.display_name, 'Adventurer');
  assert.deepEqual(signed.data.account.characters.map(c => c.persistent_key), ['a', 'b']);
  assert.equal(signed.data.account.selected_character_key, 'a');
  const stored = f.db.prepare('SELECT * FROM sessions').get();
  assert.equal(stored.token_hash, hash(signed.cookie.split('=')[1]));
  assert.equal(stored.csrf_token, signed.data.csrf_token);
  const storedData = JSON.stringify(['accounts', 'characters', 'sessions', 'oauth_flows'].map(table => f.db.prepare(`SELECT * FROM ${table}`).all()));
  for (const secret of ['provider-private-token', 'unused-refresh', 'test-private-secret', 'private@example.com']) {
    assert.ok(!storedData.includes(secret)); assert.ok(!JSON.stringify(signed.data).includes(secret));
  }
  assert.equal(f.calls.at(-1).path, '/oauth/revoke');
  const exchange = f.calls.find(c => c.path === '/oauth/token').init.body;
  assert.equal(exchange.get('grant_type'), 'authorization_code');
  assert.equal(exchange.get('client_secret'), f.env.XIVAUTH_CLIENT_SECRET);
  assert.match(exchange.get('code_verifier'), /^[\w-]{43}$/);
});

test('missing, wrong, duplicate, expired and replayed state cannot exchange a token', async t => {
  const f = fixture(t); const flow = await f.start();
  for (const [query, cookie] of [
    [`state=${flow.state}&code=x`, ''],
    [`state=${'x'.repeat(43)}&code=x`, flow.cookie],
    [`state=${flow.state}&state=${flow.state}&code=x`, flow.cookie],
    [`state=${flow.state}&code=x`, `${flow.cookie}; ${flow.cookie}`],
  ]) {
    const response = await f.request(`/auth/callback?${query}`, { headers: { Cookie: cookie } });
    assert.equal(response.headers.get('Location'), '/account?error=invalid_state');
  }
  assert.equal(f.calls.length, 0);
  await f.finish(flow);
  const calls = f.calls.length;
  assert.equal((await f.finish(flow)).headers.get('Location'), '/account?error=invalid_state');
  assert.equal(f.calls.length, calls);
  const expired = await f.start(); f.db.exec('UPDATE oauth_flows SET expires_at = 0');
  assert.equal((await f.finish(expired)).headers.get('Location'), '/account?error=invalid_state');
  assert.equal(f.calls.length, calls);
});

test('simultaneous callbacks consume the flow once', async t => {
  const f = fixture(t); const flow = await f.start();
  const responses = await Promise.all([f.finish(flow), f.finish(flow)]);
  assert.deepEqual(responses.map(r => r.headers.get('Location')).sort(), ['/account', '/account?error=invalid_state']);
  assert.equal(f.calls.filter(c => c.path === '/oauth/token').length, 1);
});

test('provider denial and failure give generic errors and no account session', async t => {
  const f = fixture(t); const flow = await f.start();
  const denied = await f.request(`/auth/callback?state=${flow.state}&error=access_denied&error_description=private`, { headers: { Cookie: flow.cookie } });
  assert.equal(denied.headers.get('Location'), '/account?error=cancelled');
  assert.equal(f.calls.length, 0);
  f.fail('/api/v1/characters');
  const response = await f.finish(await f.start());
  assert.equal(response.headers.get('Location'), '/account?error=provider&ref=characters-http-500');
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM sessions').get().n, 0);
  assert.equal(f.calls.at(-1).path, '/oauth/revoke');
});

test('token rejection reports only allowlisted codes and consumes the failed flow', async t => {
  const f = fixture(t);
  f.fail('/oauth/token', Response.json({ error: 'invalid_client', error_description: 'private-secret echoed here' }, { status: 401 }));
  const flow = await f.start();
  const response = await f.finish(flow);
  assert.equal(response.headers.get('Location'), '/account?error=provider&ref=token-http-401-invalid_client');
  assert.deepEqual(f.logs, [{ event: 'studium_auth_failure', reference: 'token-http-401-invalid_client',
    stage: 'token', reason: 'http', status: 401, oauth_error: 'invalid_client' }]);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM sessions').get().n, 0);
  assert.equal((await f.finish(flow)).headers.get('Location'), '/account?error=invalid_state');
  assert.equal(f.calls.length, 1);
});

test('unexpected response bodies and network exceptions never enter logs or redirects', async t => {
  const f = fixture(t);
  for (const [response, reference] of [
    [Response.json({ error: 'private-secret', access_token: 'private-token' }, { status: 400 }), 'token-http-400'],
    [new Response('<html>private-secret</html>', { status: 403 }), 'token-http-403'],
    [new Response('private-token'), 'token-json-200'],
    [new Error('private-secret'), 'token-network'],
    [Response.json(null), 'token-response'],
  ]) {
    f.fail('/oauth/token', response);
    const result = await f.finish(await f.start());
    assert.equal(result.headers.get('Location'), `/account?error=provider&ref=${reference}`);
    assert.equal(f.logs.at(-1).reference, reference);
  }
  assert.doesNotMatch(JSON.stringify(f.logs), /private-secret|private-token|valid-code|test-private-secret/);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM accounts').get().n, 0);
});

test('profile and database failures remain distinct and revoke the provider token', async t => {
  const f = fixture(t);
  f.setProfile({ id: 'user-a', display_name: null });
  assert.equal((await f.finish(await f.start())).headers.get('Location'), '/account?error=provider&ref=profile-failed');
  assert.equal(f.calls.at(-1).path, '/oauth/revoke');
  f.setProfile({ id: 'user-a', display_name: 'Adventurer' });
  const flow = await f.start();
  f.env.DB.batch = async () => { throw new Error('private database error'); };
  assert.equal((await f.finish(flow)).headers.get('Location'), '/account?error=provider&ref=database-failed');
  assert.equal(f.calls.at(-1).path, '/oauth/revoke');
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM sessions').get().n, 0);
  assert.doesNotMatch(JSON.stringify(f.logs), /private database error/);
});

test('refresh reconciles shared characters and preserves only valid selection', async t => {
  const f = fixture(t); let signed = await f.login();
  assert.equal((await f.post('/api/auth/character', signed, { persistent_key: 'b' })).status, 200);
  signed = await f.login(signed.cookie);
  assert.equal(signed.data.account.selected_character_key, 'b');
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM sessions').get().n, 1);
  f.setCharacters([character('a')]); signed = await f.login(signed.cookie);
  assert.equal(signed.data.account.selected_character_key, 'a');
  assert.equal(signed.data.account.characters.length, 1);
  f.setCharacters([]); signed = await f.login(signed.cookie);
  assert.equal(signed.data.account.selected_character_key, null);
  assert.deepEqual(signed.data.account.characters, []);
});

test('all mutations require a session, same origin and CSRF; selection is account-scoped', async t => {
  const f = fixture(t); const a = await f.login();
  f.setProfile({ id: 'user-b', display_name: 'Other' }); f.setCharacters([character('other')]);
  const b = await f.login();
  assert.equal((await f.post('/api/auth/character', a, { persistent_key: 'other' })).status, 403);
  assert.equal((await f.post('/api/auth/character', b, { persistent_key: 'a' })).status, 403);
  for (const path of ['/api/auth/character', '/api/auth/logout', '/api/auth/account']) {
    assert.equal((await f.post(path, a, {}, { Origin: 'https://evil.test' })).status, 403);
    assert.equal((await f.post(path, a, {}, { 'X-CSRF-Token': '' })).status, 403);
    assert.equal((await f.post(path, a, {}, { Cookie: '' })).status, 401);
    assert.equal((await f.request(path)).status, 405);
  }
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM accounts').get().n, 2);
});

test('logout revokes the current session and pending flow; account deletion cascades all sessions', async t => {
  const f = fixture(t); const one = await f.login(); const two = await f.login(); const pending = await f.start();
  const response = await f.post('/api/auth/logout', one, {}, { Cookie: `${one.cookie}; ${pending.cookie}` });
  assert.equal(response.status, 200);
  assert.equal(response.headers.getSetCookie().length, 2);
  assert.equal((await f.request('/api/auth/session', { headers: { Cookie: one.cookie } }).then(r => r.json())).account, null);
  assert.equal((await f.finish(pending)).headers.get('Location'), '/account?error=invalid_state');
  await f.login();
  assert.equal((await f.post('/api/auth/account', two)).status, 200);
  for (const table of ['accounts', 'characters', 'sessions']) assert.equal(f.db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0);
});

test('expired sessions cannot read profiles or mutate, and wrong origins are rejected', async t => {
  const f = fixture(t); const signed = await f.login(); f.db.exec('UPDATE sessions SET expires_at = 0');
  const response = await f.request('/api/auth/session', { headers: { Cookie: signed.cookie } });
  assert.equal((await response.json()).account, null);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal((await f.post('/api/auth/account', signed)).status, 401);
  assert.equal((await handle(new Request('https://other.test/auth/login'), f.env)).status, 400);
});

test('unconfigured auth and failed databases leave static tools usable', async t => {
  const f = fixture(t); delete f.env.XIVAUTH_CLIENT_SECRET;
  assert.equal((await f.request('/api/auth/session').then(r => r.json())).configured, false);
  assert.equal((await f.request('/auth/login')).status, 503);
  assert.equal(await (await f.request('/chatpendium')).text(), 'static asset');
  f.env.XIVAUTH_CLIENT_SECRET = 'test'; f.env.DB = { prepare() { throw new Error('private details'); } };
  const response = await worker.fetch(new Request(`${origin}/auth/login`), f.env);
  assert.equal(response.status, 503); assert.ok(!(await response.text()).includes('private details'));
});


test('provider portraits are retained, refreshed and restricted to official HTTPS image hosts', async t => {
  const f = fixture(t);
  const avatar = 'https://img2.finalfantasyxiv.com/f/headshot.jpg?123';
  const portrait = 'https://img2.finalfantasyxiv.com/f/portrait.jpg?123';
  f.setCharacters([character('a', { avatar_url: avatar, portrait_url: portrait }), character('b')]);
  let signed = await f.login();
  assert.equal(signed.data.account.characters[0].avatar_url, avatar);
  assert.equal(signed.data.account.characters[0].portrait_url, portrait);
  assert.equal(signed.data.account.characters[1].avatar_url, null);
  await f.post('/api/auth/character', signed, { persistent_key: 'b' });
  for (const unsafe of ['javascript:alert(1)', 'http://img2.finalfantasyxiv.com/f/a.jpg',
    'https://img2.finalfantasyxiv.com.evil.test/a', 'https://private@img2.finalfantasyxiv.com/a',
    'https://img2.finalfantasyxiv.com:8443/a', 'not-a-url']) {
    f.setCharacters([character('a', { avatar_url: unsafe, portrait_url: unsafe }), character('b', { avatar_url: avatar })]);
    signed = await f.login(signed.cookie);
    assert.equal(signed.data.account.selected_character_key, 'b');
    assert.equal(signed.data.account.characters[0].avatar_url, null);
    assert.equal(signed.data.account.characters[0].portrait_url, null);
    assert.equal(signed.data.account.characters[1].avatar_url, avatar);
  }
});

test('portrait migration preserves pre-existing characters with nullable images', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(readFileSync(new URL('../migrations/0001_accounts.sql', import.meta.url), 'utf8'));
    db.exec("INSERT INTO accounts (id, display_name, updated_at) VALUES ('old', 'Existing user', 1)");
    db.exec("INSERT INTO characters (account_id, persistent_key, lodestone_id, name, home_world, data_center, verified_at) VALUES ('old', 'old-character', '123', 'Existing Character', 'Balmung', 'Crystal', '2026-10-01')");
    db.exec(readFileSync(new URL('../migrations/0002_character_images.sql', import.meta.url), 'utf8'));
    const row = db.prepare('SELECT * FROM characters').get();
    assert.equal(row.name, 'Existing Character');
    assert.equal(row.avatar_url, null); assert.equal(row.portrait_url, null);
  } finally { db.close(); }
});
