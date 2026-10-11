import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
});
const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
const appUrl = `${base}/chatpendium`;
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
async function interceptPreview(context) {
  if (!process.env.PREVIEW_DIR) return;
  // Exercise Topcoat-rendered files without binding a port in restricted environments.
  await context.route(`${base}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const files = {
      '/': ['index.html', 'text/html'],
      '/chatpendium': ['chatpendium/index.html', 'text/html'],
      '/chatpendium/': ['chatpendium/index.html', 'text/html'],
      '/assets/app.css': ['assets/app.css', 'text/css'],
      '/assets/app.js': ['assets/app.js', 'text/javascript'],
    };
    if (!files[path] && path.startsWith('/assets/')) {
      const type = path.endsWith('.webp') ? 'image/webp' : path.endsWith('.ttf') ? 'font/ttf' : path.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript';
      return route.fulfill({ status: 200, contentType: type, body: await readFile(resolve(process.env.PREVIEW_DIR, path.slice(1))) });
    }
    if (!files[path]) return route.fulfill({ status: 404, body: 'Not found' });
    const [file, contentType] = files[path];
    await route.fulfill({ status: 200, contentType, body: await readFile(resolve(process.env.PREVIEW_DIR, file)) });
  });
}
await interceptPreview(context);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await mkdir('test-results', { recursive: true });
const shown = () => page.locator('.expression-card:visible');

try {
  await page.goto(base);
  assert.equal(await page.title(), 'The Studium · Little tools for life in Eorzea');
  await page.locator('.tool-card[href="/chatpendium"]').click();
  await page.waitForFunction(() => !document.querySelector('#search').disabled);
  assert.equal(await shown().count(), 12);
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });

  // Search includes aliases and can combine with category and ASCII filters.
  await page.locator('#search').fill('cat');
  assert.equal(await shown().count(), 2);
  await page.locator('#ascii-only').check();
  assert.equal(await shown().count(), 0);
  assert.equal(await page.locator('#empty-state').isVisible(), true);
  await page.locator('#reset-filters').click();
  await page.locator('#search').fill('gg');
  assert.equal(await shown().count(), 2);
  await page.locator('.filter[data-category="happy"]').click();
  assert.equal(await shown().count(), 1);
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('#search').disabled);
  assert.equal(await shown().count(), 1);
  assert.equal(await page.locator('#search').inputValue(), 'gg');

  // Back to all results; favorites survive reload and filter to exact entries.
  await page.goto(appUrl);
  await page.locator('[data-id="wave"] [data-action="favorite"]').click();
  await page.reload();
  await page.locator('#favorites-filter').click();
  assert.equal(await shown().count(), 1);
  assert.equal(await shown().first().getAttribute('data-id'), 'wave');
  assert.equal(await page.locator('#favorite-count').textContent(), '1');

  // Clipboard receives only the raw expression, with no variation selector or label.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('[data-id="wave"] [data-action="copy"]').click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '(^_^)/');
  assert.equal(await page.locator('[data-id="wave"]').getAttribute('data-selected'), 'true');
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.reload();
  assert.equal(await page.locator('#results').getAttribute('data-view'), 'list');
  await page.getByRole('button', { name: 'Grid', exact: true }).click();

  // Clipboard rejection provides selected text for manual copy.
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true, value: () => Promise.reject(new Error('Permission denied')),
    });
  });
  await page.locator('[data-id="wave"] [data-action="copy"]').click();
  await page.locator('#copy-dialog').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#manual-copy').inputValue(), '(^_^)/');
  assert.equal(await page.locator('#manual-copy').evaluate((input) => input.selectionEnd - input.selectionStart), 6);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator('[data-id="wave"] [data-action="favorite"]').click();
  assert.equal(await page.locator('#empty-title').textContent(), 'Your favorites start here');
  await page.locator('#reset-filters').click();

  // Keyboard search and literal expressions, including characters that need HTML escaping.
  await page.locator('#search').blur();
  await page.keyboard.press('/');
  assert.equal(await page.locator('#search').evaluate((el) => el === document.activeElement), true);
  await page.keyboard.type('hug');
  assert.ok(await shown().count() > 0);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#search').inputValue(), '');
  await page.locator('#search').fill('<script>alert(1)</script>');
  assert.equal(await shown().count(), 0);
  await page.locator('#reset-filters').click();

  await page.locator('#show-more').click();
  assert.equal(await shown().count(), 24);

  // No viewport overflow at common mobile widths; interactive controls stay usable.
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(base);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `hub overflow at ${width}px`);
    await page.screenshot({ path: `test-results/hub-${width}.png`, fullPage: true });
    await page.goto(appUrl);
    await page.waitForFunction(() => !document.querySelector('#search').disabled);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}px`);
    await page.screenshot({ path: `test-results/mobile-${width}.png`, fullPage: true });
  }

  const noJs = await browser.newContext({ javaScriptEnabled: false });
  await interceptPreview(noJs);
  const fallback = await noJs.newPage();
  await fallback.goto(appUrl);
  assert.equal(await fallback.locator('.expression-card').count(), 54);
  assert.equal(await fallback.locator('noscript').isVisible(), true);
  assert.equal(await fallback.locator('[data-id="hug"] .expression-text').textContent(), '(>^_^)> <(^_^<)');
  await noJs.close();
  assert.deepEqual(errors, []);
  console.log('Browser checks passed: search, filters, favorites, clipboard, fallback, keyboard, URLs, pagination, mobile, no-JS.');
} finally {
  await browser.close();
}
