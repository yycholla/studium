import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate as settle } from 'node:timers/promises';
const { JSDOM } = await import(process.env.JSDOM_MODULE || 'jsdom');
const html = await readFile(new URL('../dist/account/index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../assets/account.js', import.meta.url), 'utf8');
const signedIn = () => ({ configured: true, csrf_token: 'csrf-test', account: {
  display_name: '<img src=x onerror=alert(1)>', selected_character_key: 'one', linked_at: 1791662400,
  characters: [{ persistent_key: 'one', name: '<b>Alice</b>', home_world: 'Balmung', data_center: 'Crystal' },
    { persistent_key: 'two', name: 'Bob', home_world: 'Mateus', data_center: 'Crystal' }],
} });
async function setup(t, { data = signedIn(), query = '', fail = false, confirm = true } = {}) {
  const dom = new JSDOM(html, { url: `https://studium.yycholla.com/account${query}`, runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const calls = []; const { window } = dom;
  window.confirm = () => confirm;
  window.fetch = async (path, init = {}) => {
    calls.push({ path, init });
    if (fail) throw new Error('Offline');
    if (init.method === 'POST') {
      assert.equal(init.headers['X-CSRF-Token'], data.csrf_token);
      if (path === '/api/auth/character') data.account.selected_character_key = JSON.parse(init.body).persistent_key;
      else data = { configured: true, account: null, csrf_token: null };
      return Response.json({ ok: true });
    }
    return Response.json(data);
  };
  window.eval(script); await settle();
  return { dom, window, document: window.document, calls };
}
test('renders real account output, escapes names and selects a character with CSRF', async t => {
  const { document, calls } = await setup(t);
  assert.equal(document.querySelector('#account-signed-in').hidden, false);
  assert.equal(document.querySelector('#account-signed-out').hidden, true);
  assert.equal(document.querySelector('#account-greeting img'), null);
  assert.equal(document.querySelector('#account-link').textContent, '<b>Alice</b>');
  assert.equal(document.querySelector('#account-link b'), null);
  document.querySelectorAll('.account-character button')[1].click(); await settle();
  assert.equal(document.querySelector('#account-link').textContent, 'Bob');
  assert.equal(document.querySelectorAll('.account-character button')[1].getAttribute('aria-pressed'), 'true');
  assert.equal(calls.find(c => c.init.method === 'POST').path, '/api/auth/character');
});
test('sign-out switches to anonymous view without navigating away', async t => {
  const { document } = await setup(t);
  document.querySelector('#account-logout').click(); await settle();
  assert.equal(document.querySelector('#account-signed-in').hidden, true);
  assert.equal(document.querySelector('#account-signed-out').hidden, false);
  assert.equal(document.querySelector('#account-link').textContent, 'Account');
  assert.match(document.querySelector('#account-status').textContent, /Signed out/);
});
test('account removal requires confirmation and sends a protected POST', async t => {
  const cancelled = await setup(t, { confirm: false });
  cancelled.document.querySelector('#account-delete').click(); await settle();
  assert.equal(cancelled.calls.length, 1);
  const accepted = await setup(t);
  accepted.document.querySelector('#account-delete').click(); await settle();
  assert.equal(accepted.calls.find(c => c.init.method === 'POST').path, '/api/auth/account');
  assert.match(accepted.document.querySelector('#account-status').textContent, /removed/);
});
test('unconfigured auth, provider cancellation and offline responses remain understandable', async t => {
  const unconfigured = await setup(t, { data: { configured: false, account: null } });
  assert.equal(unconfigured.document.querySelector('#account-signed-out').hidden, true);
  assert.match(unconfigured.document.querySelector('#account-status').textContent, /not available yet/);
  const cancelled = await setup(t, { data: { configured: true, account: null }, query: '?error=cancelled' });
  assert.match(cancelled.document.querySelector('#account-status').textContent, /cancelled/);
  assert.equal(cancelled.window.location.search, '');
  const offline = await setup(t, { fail: true });
  assert.match(offline.document.querySelector('#account-status').textContent, /still use Chatpendium/);
});
