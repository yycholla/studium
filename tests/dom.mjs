// Fast interaction checks against real Topcoat output when a browser cannot launch.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate as settle } from 'node:timers/promises';

const { JSDOM } = await import(process.env.JSDOM_MODULE || 'jsdom');
const html = await readFile(new URL('../dist/chatpendium/index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');

function setup({ query = '', saved = '[]', blockedStorage = false, clipboardFails = false } = {}) {
  const dom = new JSDOM(html, { url: `https://studium.test/chatpendium${query}`, runScripts: 'outside-only' });
  const { window } = dom;
  const doc = window.document;
  const writes = [];
  window.localStorage.setItem('xiv-chatbook:favorites:v1', saved);
  if (blockedStorage) Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { async writeText(text) { if (clipboardFails) throw new Error('denied'); writes.push(text); } },
  });
  const dialog = doc.querySelector('#copy-dialog');
  dialog.showModal = () => { dialog.open = true; };
  window.eval(script);
  const shown = () => [...doc.querySelectorAll('.expression-card')].filter((card) => !card.hidden);
  const click = (selector) => doc.querySelector(selector).click();
  const search = (text) => {
    doc.querySelector('#search').value = text;
    doc.querySelector('#search').dispatchEvent(new window.Event('input'));
  };
  return { window, doc, writes, shown, click, search, close: () => window.close() };
}

test('search combines aliases, categories, ASCII filter, and clear state', () => {
  const app = setup();
  try {
    assert.equal(app.shown().length, 12);
    app.search('cat');
    assert.equal(app.shown().length, 2);
    app.click('#ascii-only');
    assert.equal(app.shown().length, 0);
    assert.equal(app.doc.querySelector('#empty-state').hidden, false);
    app.click('#reset-filters');
    app.search('gg');
    assert.equal(app.shown().length, 2);
    app.click('.filter[data-category="happy"]');
    assert.equal(app.shown().length, 1);
    assert.match(app.window.location.search, /category=happy/);
    app.search('<script>alert(1)</script>');
    assert.equal(app.shown().length, 0);
    app.click('#reset-filters');
    app.click('#show-more');
    assert.equal(app.shown().length, 24);
  } finally { app.close(); }
});

test('favorites persist, reject unknown IDs, and have a useful empty state', () => {
  const app = setup({ saved: '["wave", "not-a-real-id"]' });
  try {
    assert.equal(app.doc.querySelector('#favorite-count').textContent, '1');
    app.click('#favorites-filter');
    assert.deepEqual(app.shown().map((card) => card.dataset.id), ['wave']);
    app.click('[data-id="wave"] [data-action="favorite"]');
    assert.equal(app.doc.querySelector('#empty-title').textContent, 'Your favorites start here');
    assert.equal(app.window.localStorage.getItem('xiv-chatbook:favorites:v1'), '[]');
    app.click('#reset-filters');
    app.click('[data-id="joy"] [data-action="favorite"]');
    assert.equal(app.window.localStorage.getItem('xiv-chatbook:favorites:v1'), '["joy"]');
  } finally { app.close(); }
});

test('copy preserves raw Unicode and highlights the expression', async () => {
  const app = setup();
  try {
    app.click('[data-id="joy"] [data-action="copy"]');
    await settle();
    assert.deepEqual(app.writes, ['(^ω^)']);
    assert.equal(app.doc.querySelector('[data-id="joy"]').dataset.selected, 'true');
    assert.equal(app.doc.querySelector('#preview-text'), null);
    app.click('[data-id="joy"] [data-action="copy"]');
    await settle();
    assert.deepEqual(app.writes, ['(^ω^)', '(^ω^)']);
    assert.equal(app.doc.querySelector('#toast').hidden, false);
  } finally { app.close(); }
});

test('denied clipboard offers selected text for manual copying', async () => {
  const app = setup({ clipboardFails: true });
  try {
    app.click('[data-id="wave"] [data-action="copy"]');
    await settle();
    assert.equal(app.doc.querySelector('#copy-dialog').open, true);
    const input = app.doc.querySelector('#manual-copy');
    assert.equal(input.value, '(^_^)/');
    assert.equal(input.selectionEnd - input.selectionStart, 6);
  } finally { app.close(); }
});

test('blocked or malformed storage does not break search or session favorites', () => {
  for (const options of [{ blockedStorage: true }, { saved: '{broken' }, { saved: '{}' }]) {
    const app = setup(options);
    try {
      app.click('[data-id="wave"] [data-action="favorite"]');
      app.click('#favorites-filter');
      assert.equal(app.shown().length, 1);
      assert.equal(app.doc.querySelector('#favorite-count').textContent, '1');
    } finally { app.close(); }
  }
});

test('URL state and keyboard shortcuts restore and clear search', () => {
  const app = setup({ query: '?q=gg&category=happy&ascii=1' });
  try {
    assert.equal(app.shown().length, 1);
    assert.equal(app.doc.querySelector('#search').value, 'gg');
    app.doc.body.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: '/', bubbles: true }));
    assert.equal(app.doc.activeElement.id, 'search');
    app.doc.activeElement.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(app.doc.querySelector('#search').value, '');
    assert.equal(app.doc.querySelector('#ascii-only').checked, true);
  } finally { app.close(); }
});


test('grid/list preference survives initialization, preserves filters and handles blocked storage', () => {
  for (const blockedStorage of [false, true]) {
    const app = setup({ blockedStorage });
    try {
      app.search('cat');
      const before = app.shown().map((card) => card.dataset.id);
      app.click('[data-view="list"]');
      assert.equal(app.doc.querySelector('#results').dataset.view, 'list');
      assert.equal(app.doc.querySelector('button[data-view="list"]').getAttribute('aria-pressed'), 'true');
      assert.deepEqual(app.shown().map((card) => card.dataset.id), before);
      if (!blockedStorage) {
        assert.equal(app.window.localStorage.getItem('xiv-chatbook:view:v1'), 'list');
        app.window.localStorage.setItem('xiv-chatbook:view:v1', 'grid');
        app.window.dispatchEvent(new app.window.StorageEvent('storage', { key: 'xiv-chatbook:view:v1', newValue: 'grid' }));
        assert.equal(app.doc.querySelector('#results').dataset.view, 'grid');
      }
      app.click('[data-view="grid"]');
      assert.equal(app.doc.querySelector('#results').dataset.view, 'grid');
      assert.deepEqual(app.shown().map((card) => card.dataset.id), before);
    } finally { app.close(); }
  }
});

test('view is restored on reload and favorite icon remains accessible', () => {
  const app = setup();
  try {
    app.click('[data-view="list"]');
    app.click('[data-id="wave"] [data-action="favorite"]');
    const favorite = app.doc.querySelector('[data-id="wave"] [data-action="favorite"]');
    assert.equal(favorite.getAttribute('aria-label'), 'Unfavorite Hello there');
    assert.equal(favorite.querySelector('use').getAttribute('href'), '/assets/icons.svg#star-fill');
    // A separate window starts from the persisted preference and favorite state.
    const reloaded = new JSDOM(html, { url: 'https://studium.test/chatpendium', runScripts: 'outside-only' });
    try {
      reloaded.window.localStorage.setItem('xiv-chatbook:view:v1', app.window.localStorage.getItem('xiv-chatbook:view:v1'));
      reloaded.window.localStorage.setItem('xiv-chatbook:favorites:v1', app.window.localStorage.getItem('xiv-chatbook:favorites:v1'));
      reloaded.window.eval(script);
      assert.equal(reloaded.window.document.querySelector('#results').dataset.view, 'list');
      assert.equal(reloaded.window.document.querySelector('#favorite-count').textContent, '1');
      reloaded.window.dispatchEvent(new reloaded.window.StorageEvent('storage', { key: null }));
      assert.equal(reloaded.window.document.querySelector('#results').dataset.view, 'grid');
      assert.equal(reloaded.window.document.querySelector('#favorite-count').textContent, '0');
    } finally { reloaded.window.close(); }
  } finally { app.close(); }
});
