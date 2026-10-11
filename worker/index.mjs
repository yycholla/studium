// Small server-side adapter for the Rust-rendered site. No provider tokens reach the browser.
const PROVIDER = 'https://xivauth.net';
const SCOPES = 'user character:all';
const SESSION_SECONDS = 8 * 60 * 60;
const FLOW_SECONDS = 10 * 60;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const now = () => Math.floor(Date.now() / 1000);
const randomToken = () => encode(crypto.getRandomValues(new Uint8Array(32)));
function encode(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
async function digest(value) {
  return encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
}
function cookieValue(request, name) {
  const values = (request.headers.get('Cookie') || '').split(';').map(s => s.trim()).filter(s => s.startsWith(`${name}=`));
  return values.length === 1 ? values[0].slice(name.length + 1) : '';
}
function settings(env) {
  const url = new URL(env.SITE_ORIGIN);
  const local = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((!local && url.protocol !== 'https:') || url.origin !== env.SITE_ORIGIN) throw new Error('Invalid site origin');
  return { origin: url.origin, secure: !local, prefix: local ? 'studium_' : '__Host-studium_' };
}
function cookie(config, key, value, seconds) {
  return `${config.prefix}${key}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${config.secure ? '; Secure' : ''}`;
}
function reply(body, status = 200, extra = {}) {
  const headers = new Headers(extra);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Pragma', 'no-cache');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Vary', 'Cookie');
  return new Response(JSON.stringify(body), { status, headers });
}
function redirect(location, cookies = []) {
  const response = reply(null, 303, { Location: location });
  for (const value of cookies) response.headers.append('Set-Cookie', value);
  return response;
}
function stmt(env, sql, ...args) { return env.DB.prepare(sql).bind(...args); }
async function session(request, env, config) {
  const raw = cookieValue(request, `${config.prefix}session`);
  if (!tokenPattern.test(raw)) return null;
  return stmt(env, 'SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?', await digest(raw), now()).first();
}
function validString(value, max = 200) { return typeof value === 'string' && value.length > 0 && value.length <= max; }
function normalizeProfile(user, input) {
  if (!validString(user?.id, 128) || !validString(user?.display_name) || !Array.isArray(input) || input.length > 100) {
    throw new Error('Unexpected provider response');
  }
  const keys = new Set();
  const characters = input.filter(c => c && typeof c.verified_at === 'string' && Number.isFinite(Date.parse(c.verified_at))).map(c => {
    const id = String(c.lodestone_id);
    if (!validString(c.persistent_key, 128) || !/^[1-9][0-9]{0,15}$/.test(id) ||
        !validString(c.name) || !validString(c.home_world) || !validString(c.data_center) || keys.has(c.persistent_key)) {
      throw new Error('Unexpected character response');
    }
    keys.add(c.persistent_key);
    return { persistent_key: c.persistent_key, lodestone_id: id, name: c.name,
      home_world: c.home_world, data_center: c.data_center, verified_at: c.verified_at };
  });
  return { id: user.id, display_name: user.display_name, characters };
}
const oauthErrors = new Set(['invalid_client', 'invalid_grant', 'invalid_request', 'invalid_scope',
  'unauthorized_client', 'unsupported_grant_type', 'server_error', 'temporarily_unavailable']);
class SignInFailure extends Error {
  constructor(stage, reason, status = null, oauthError = null) {
    super('Sign-in failed');
    this.diagnostic = { stage, reason, status, oauth_error: oauthError };
    this.reference = [stage, reason, status, oauthError].filter(value => value !== null).join('-');
  }
}
function reportFailure(error, stage) {
  const failure = error instanceof SignInFailure ? error : new SignInFailure(stage, 'failed');
  // Only constants, HTTP status and allowlisted OAuth codes; never raw exceptions or bodies.
  console.error(JSON.stringify({ event: 'studium_auth_failure', reference: failure.reference, ...failure.diagnostic }));
  return failure.reference;
}
async function providerJson(fetcher, stage, path, init = {}) {
  let response, text;
  try {
    response = await fetcher(`${PROVIDER}${path}`, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) });
    text = await response.text();
  } catch { throw new SignInFailure(stage, 'network'); }
  if (text.length > 200000) throw new SignInFailure(stage, 'size', response.status);
  let body;
  try { body = JSON.parse(text); }
  catch {
    throw new SignInFailure(stage, response.ok ? 'json' : 'http', response.status);
  }
  if (!response.ok) {
    const code = stage === 'token' && oauthErrors.has(body?.error) ? body.error : null;
    throw new SignInFailure(stage, 'http', response.status, code);
  }
  return body;
}
async function snapshot(env, current) {
  const account = await stmt(env, 'SELECT * FROM accounts WHERE id = ?', current.account_id).first();
  if (!account) return null;
  const { results } = await stmt(env, 'SELECT persistent_key, lodestone_id, name, home_world, data_center, verified_at FROM characters WHERE account_id = ? ORDER BY name', account.id).all();
  return { display_name: account.display_name, characters: results,
    selected_character_key: account.selected_character_key, linked_at: account.updated_at };
}
async function callback(request, env, config, fetcher) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  const binding = cookieValue(request, `${config.prefix}oauth`);
  const clear = cookie(config, 'oauth', '', 0);
  if (!tokenPattern.test(state) || !tokenPattern.test(binding) || url.searchParams.getAll('state').length !== 1) {
    return redirect('/account?error=invalid_state', [clear]);
  }
  // DELETE RETURNING consumes a flow atomically, including simultaneous callbacks.
  const flow = await stmt(env, 'DELETE FROM oauth_flows WHERE state_hash = ? AND binding_hash = ? AND expires_at > ? RETURNING verifier',
    await digest(state), await digest(binding), now()).first();
  if (!flow) return redirect('/account?error=invalid_state', [clear]);
  if (url.searchParams.has('error')) return redirect('/account?error=cancelled', [clear]);
  const code = url.searchParams.get('code');
  if (!validString(code, 2048) || url.searchParams.getAll('code').length !== 1) return redirect('/account?error=invalid_state', [clear]);
  let accessToken;
  let stage = 'token';
  try {
    const token = await providerJson(fetcher, 'token', '/oauth/token', { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: env.XIVAUTH_CLIENT_ID,
        client_secret: env.XIVAUTH_CLIENT_SECRET, code, code_verifier: flow.verifier,
        redirect_uri: `${config.origin}/auth/callback` }) });
    if (!validString(token?.access_token, 4096) || String(token?.token_type).toLowerCase() !== 'bearer') throw new SignInFailure('token', 'response');
    accessToken = token.access_token;
    const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };
    const [user, characters] = await Promise.all([
      providerJson(fetcher, 'user', '/api/v1/user', { headers }),
      providerJson(fetcher, 'characters', '/api/v1/characters', { headers }),
    ]);
    stage = 'profile';
    const profile = normalizeProfile(user, characters);
    stage = 'database';
    const raw = randomToken();
    const previous = await session(request, env, config);
    const timestamp = now();
    const statements = [
      stmt(env, 'INSERT INTO accounts (id, display_name, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at', profile.id, profile.display_name, timestamp),
      stmt(env, 'DELETE FROM characters WHERE account_id = ?', profile.id),
      ...profile.characters.map(c => stmt(env, 'INSERT INTO characters (account_id, persistent_key, lodestone_id, name, home_world, data_center, verified_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        profile.id, c.persistent_key, c.lodestone_id, c.name, c.home_world, c.data_center, c.verified_at)),
      stmt(env, 'UPDATE accounts SET selected_character_key = ? WHERE id = ? AND (selected_character_key IS NULL OR selected_character_key NOT IN (SELECT persistent_key FROM characters WHERE account_id = ?))',
        profile.characters[0]?.persistent_key ?? null, profile.id, profile.id),
      stmt(env, 'INSERT INTO sessions (token_hash, account_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)', await digest(raw), profile.id, randomToken(), timestamp + SESSION_SECONDS),
    ];
    if (previous) statements.push(stmt(env, 'DELETE FROM sessions WHERE token_hash = ?', previous.token_hash));
    await env.DB.batch(statements);
    return redirect('/account', [clear, cookie(config, 'session', raw, SESSION_SECONDS)]);
  } catch (error) {
    const reference = reportFailure(error, stage);
    return redirect(`/account?error=provider&ref=${reference}`, [clear]);
  } finally {
    // Profile access is needed only during sign-in. No access/refresh token is stored.
    if (accessToken) {
      try {
        await fetcher(`${PROVIDER}/oauth/revoke`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
          body: new URLSearchParams({ token: accessToken, client_id: env.XIVAUTH_CLIENT_ID, client_secret: env.XIVAUTH_CLIENT_SECRET }) });
      } catch { /* The token is discarded even when the provider cannot revoke it. */ }
    }
  }
}

export async function handle(request, env, fetcher = fetch) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/auth/') && !url.pathname.startsWith('/api/auth/')) {
    return env.ASSETS.fetch(request);
  }
  const configured = Boolean(env.DB && env.XIVAUTH_CLIENT_ID && env.XIVAUTH_CLIENT_SECRET && env.SITE_ORIGIN);
  if (!configured) return reply({ configured: false, account: null, error: 'Sign-in is not available yet.' }, url.pathname === '/api/auth/session' ? 200 : 503);
  const config = settings(env);
  if (url.origin !== config.origin) return reply({ error: 'Use the configured Studium address.' }, 400);
  const path = url.pathname;
  if (request.method === 'GET' && path === '/auth/login') {
    const state = randomToken(); const binding = randomToken(); const verifier = randomToken();
    await env.DB.batch([
      stmt(env, 'DELETE FROM oauth_flows WHERE expires_at <= ?', now()),
      stmt(env, 'DELETE FROM sessions WHERE expires_at <= ?', now()),
      stmt(env, 'INSERT INTO oauth_flows (state_hash, binding_hash, verifier, expires_at) VALUES (?, ?, ?, ?)', await digest(state), await digest(binding), verifier, now() + FLOW_SECONDS),
    ]);
    const authorize = new URL('/oauth/authorize', PROVIDER);
    authorize.search = new URLSearchParams({ response_type: 'code', client_id: env.XIVAUTH_CLIENT_ID,
      redirect_uri: `${config.origin}/auth/callback`, scope: SCOPES, state,
      code_challenge: await digest(verifier), code_challenge_method: 'S256', prompt: 'consent' }).toString();
    return redirect(authorize.href, [cookie(config, 'oauth', binding, FLOW_SECONDS)]);
  }
  if (request.method === 'GET' && path === '/auth/callback') return callback(request, env, config, fetcher);
  const current = await session(request, env, config);
  if (request.method === 'GET' && path === '/api/auth/session') {
    const account = current ? await snapshot(env, current) : null;
    return reply({ configured: true, account, csrf_token: account ? current.csrf_token : null });
  }
  if (!['/api/auth/character', '/api/auth/logout', '/api/auth/account'].includes(path)) return reply({ error: 'Not found.' }, 404);
  if (request.method !== 'POST') return reply({ error: 'Use POST.' }, 405, { Allow: 'POST' });
  if (!current) return reply({ error: 'Please sign in again.' }, 401);
  if (request.headers.get('Origin') !== config.origin || request.headers.get('X-CSRF-Token') !== current.csrf_token) {
    return reply({ error: 'Please refresh this page and try again.' }, 403);
  }
  if (path === '/api/auth/logout' || path === '/api/auth/account') {
    const pending = cookieValue(request, `${config.prefix}oauth`);
    await env.DB.batch([
      path === '/api/auth/account'
        ? stmt(env, 'DELETE FROM accounts WHERE id = ?', current.account_id)
        : stmt(env, 'DELETE FROM sessions WHERE token_hash = ?', current.token_hash),
      stmt(env, 'DELETE FROM oauth_flows WHERE binding_hash = ?', await digest(pending)),
    ]);
    const response = reply({ ok: true });
    response.headers.append('Set-Cookie', cookie(config, 'session', '', 0));
    response.headers.append('Set-Cookie', cookie(config, 'oauth', '', 0));
    return response;
  }
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reply({ error: 'Expected JSON.' }, 415);
  const body = await request.text();
  if (body.length > 1024) return reply({ error: 'Request too large.' }, 413);
  let input;
  try { input = JSON.parse(body); } catch { return reply({ error: 'Invalid JSON.' }, 400); }
  if (!validString(input?.persistent_key, 128)) return reply({ error: 'Choose a linked character.' }, 400);
  // Selection must belong to the authenticated account, regardless of browser input.
  const changed = await stmt(env, 'UPDATE accounts SET selected_character_key = ? WHERE id = ? AND EXISTS (SELECT 1 FROM characters WHERE account_id = ? AND persistent_key = ?) RETURNING id',
    input.persistent_key, current.account_id, current.account_id, input.persistent_key).first();
  return changed ? reply({ ok: true }) : reply({ error: 'That character is not linked to your account.' }, 403);
}

export default {
  async fetch(request, env) {
    try { return await handle(request, env); }
    catch (error) {
      reportFailure(error, 'request');
      return reply({ error: 'Account services are temporarily unavailable. Please try again.' }, 503);
    }
  },
};
