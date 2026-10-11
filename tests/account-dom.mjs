import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate as settle } from 'node:timers/promises';
const { JSDOM } = await import(process.env.JSDOM_MODULE || 'jsdom');
const html = await readFile(new URL('../dist/account/index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../assets/account.js', import.meta.url), 'utf8');
const signedIn = () => ({ configured: true, csrf_token: 'csrf-test', account: {
  display_name: '<img src=x onerror=alert(1)>', selected_character_key: 'one', linked_at: 1791662400,
  characters: [{ persistent_key: 'one', name: '<b>Alice</b>', home_world: 'Balmung', data_center: 'Crystal', avatar_url: 'https://img2.finalfantasyxiv.com/f/headshot.jpg' },
    { persistent_key: 'two', name: 'Bob', home_world: 'Mateus', data_center: 'Crystal' }],
} });
async function setup(t, { data = signedIn(), query = '', fail = false, confirm = true, page = 'account/index.html', postError = null, expired = false } = {}) {
  const dom = new JSDOM(page === 'account/index.html' ? html : await readFile(new URL(`../dist/${page}`, import.meta.url), 'utf8'), { url: `https://studium.yycholla.com/account${query}`, runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const calls = []; const { window } = dom;
  window.confirm = () => confirm;
  window.fetch = async (path, init = {}) => {
    calls.push({ path, init });
    if (fail) throw new Error('Offline');
    if (init.method === 'POST') {
      assert.equal(init.headers['X-CSRF-Token'], data.csrf_token);
      if (expired) { data = { configured: true, account: null, csrf_token: null }; return Response.json({ error: 'Your session expired.' }, { status: 401 }); }
      if (postError) return Response.json({ error: postError }, { status: 503 });
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
  assert.equal(document.querySelector('#header-character-name').textContent, '<b>Alice</b>');
  assert.equal(document.querySelector('#header-character-name b'), null);
  document.querySelectorAll('.account-character button')[1].click(); await settle();
  assert.equal(document.querySelector('#header-character-name').textContent, 'Bob');
  assert.equal(document.querySelectorAll('.account-character button')[1].getAttribute('aria-pressed'), 'true');
  assert.equal(calls.find(c => c.init.method === 'POST').path, '/api/auth/character');
});
test('sign-out switches to anonymous view without navigating away', async t => {
  const { document } = await setup(t);
  document.querySelector('#account-logout').click(); await settle();
  assert.equal(document.querySelector('#account-signed-in').hidden, true);
  assert.equal(document.querySelector('#account-signed-out').hidden, false);
  assert.equal(document.querySelector('#header-guest-label').textContent, 'Sign in');
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

test('sign-in failure shows a safe support reference and clears it from the URL', async t => {
  const data = { configured: true, account: null };
  const valid = await setup(t, { data, query: '?error=provider&ref=token-http-401-invalid_client' });
  assert.match(valid.document.querySelector('#account-status').textContent, /Reference: token-http-401-invalid_client/);
  assert.equal(valid.window.location.search, '');
  const invalid = await setup(t, { data, query: '?error=provider&ref=private-token%3Cscript%3E' });
  assert.doesNotMatch(invalid.document.querySelector('#account-status').textContent, /Reference:|private-token/);
  assert.equal(invalid.window.location.search, '');
});


test('header works on the hub with keyboard dismissal, switching and protected sign-out', async t => {
  const { document, window, calls } = await setup(t, { page: 'index.html' });
  const trigger = document.querySelector('#header-account-trigger');
  const menu = document.querySelector('#header-account-menu');
  assert.equal(trigger.hidden, false);
  trigger.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  assert.equal(menu.hidden, false);
  assert.equal(document.activeElement.dataset.characterKey, 'two');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(menu.hidden, true); assert.equal(document.activeElement, trigger);
  trigger.click(); document.querySelector('[data-character-key="two"]').click();
  document.querySelector('[data-character-key="two"]').click(); await settle();
  assert.equal(calls.filter(c => c.init.method === 'POST').length, 1);
  assert.equal(document.querySelector('#header-character-name').textContent, 'Bob');
  assert.equal(document.querySelector('#header-character-world').textContent, 'Mateus · Crystal');
  assert.equal(menu.hidden, true); assert.equal(document.activeElement, trigger);
  trigger.click(); document.querySelector('#header-account-logout').click(); await settle();
  assert.equal(trigger.hidden, true); assert.equal(menu.hidden, true);
  assert.equal(document.querySelector('#header-character-avatar img'), null);
  assert.equal(document.querySelector('#header-account-name').textContent, '');
  assert.equal(document.querySelector('#account-link').getAttribute('href'), '/auth/login');
  assert.equal(calls.filter(c => c.init.method === 'POST').length, 2);
});

test('portraits load decoratively and fall back safely on failure or hostile URLs', async t => {
  const { document, window } = await setup(t);
  let image = document.querySelector('#header-character-avatar img');
  assert.equal(image.referrerPolicy, 'no-referrer'); assert.equal(image.alt, '');
  image.dispatchEvent(new window.Event('load'));
  assert.equal(image.hidden, false);
  assert.equal(document.querySelector('#header-character-avatar .character-initials').hidden, true);
  image.dispatchEvent(new window.Event('error'));
  assert.equal(document.querySelector('#header-character-avatar img'), null);
  assert.equal(document.querySelector('#header-character-avatar .character-initials').hidden, false);
  const data = signedIn(); data.account.characters[0].avatar_url = 'https://evil.test/track';
  const hostile = await setup(t, { data });
  assert.equal(hostile.document.querySelector('#header-character-avatar img'), null);
  const fallback = signedIn(); fallback.account.characters[0].avatar_url = null;
  fallback.account.characters[0].portrait_url = 'https://img2.finalfantasyxiv.com/f/portrait.jpg';
  const portrait = await setup(t, { data: fallback });
  assert.match(portrait.document.querySelector('#header-character-avatar img').src, /portrait.jpg/);
});

test('empty accounts and failed selection keep the menu useful', async t => {
  const data = signedIn(); data.account.characters = []; data.account.selected_character_key = null;
  const empty = await setup(t, { data });
  assert.equal(empty.document.querySelector('#header-no-characters').hidden, false);
  assert.equal(empty.document.querySelector('#header-account-trigger').hidden, false);
  assert.equal(empty.document.querySelector('#header-character-world').textContent, 'Choose a character');
  const failed = await setup(t, { page: 'chatpendium/index.html', postError: 'Please try again.' });
  failed.document.querySelector('#header-account-trigger').click();
  failed.document.querySelector('[data-character-key="two"]').click(); await settle();
  assert.equal(failed.document.querySelector('#header-character-name').textContent, '<b>Alice</b>');
  assert.equal(failed.document.querySelector('#header-account-menu').hidden, false);
  assert.equal(failed.document.querySelector('[data-character-key="two"]').disabled, false);
  assert.match(failed.document.querySelector('#header-menu-status').textContent, /Please try again/);
  failed.document.body.click();
  assert.equal(failed.document.querySelector('#header-account-menu').hidden, true);
});


test('expired sessions clear portrait and account identity and return focus to sign-in', async t => {
  const { document } = await setup(t, { expired: true });
  document.querySelector('#header-account-trigger').click();
  document.querySelector('[data-character-key="two"]').click(); await settle();
  assert.equal(document.querySelector('#header-account-trigger').hidden, true);
  assert.equal(document.querySelector('#header-account-trigger').hasAttribute('aria-label'), false);
  assert.equal(document.querySelector('#header-account-menu').hidden, true);
  assert.equal(document.querySelector('#header-character-avatar').textContent, '');
  assert.equal(document.querySelector('#account-characters').textContent, '');
  assert.equal(document.querySelector('#account-greeting').textContent, '');
  assert.equal(document.activeElement, document.querySelector('#account-link'));
  assert.match(document.querySelector('#account-status').textContent, /expired/);
});
