// High-contrast backgrounds must not reveal a full-width header tint or blur edge.
import { chromium } from 'playwright';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { installMocks } from './mocks.mjs';

const ext = resolve(process.env.SMOKE_EXT || 'dist'), out = resolve(process.env.SMOKE_OUT || 'tests/artifacts/header-surface');
mkdirSync(out, { recursive: true });
const baseline = process.env.HEADER_BASELINE === '1', results = [], errors = [];
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'margin-header-')), {
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chromium' }), headless: true,
  args: ['--headless=new', '--no-sandbox', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  viewport: { width: 1440, height: 1000 }, locale: 'zh-CN',
});
try {
  await installMocks(ctx);
  await ctx.addInitScript(() => sessionStorage.setItem('margin:intro-played', '1'));
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker'), page = ctx.pages()[0];
  page.on('pageerror', e => errors.push(e.message));
  for (const theme of ['light', 'dark']) for (const glass of ['soft', 'liquid']) {
    await sw.evaluate(s => chrome.storage.local.set({ 'margin:settings': s }), { theme, glass, intro: false });
    for (const [name, url, host] of [
      ['home', 'https://www.bilibili.com/', '#margin-root'],
      ['watch', 'https://www.bilibili.com/video/BV1mdxN68E7F/', '#margin-watch-top'],
      ['message', 'https://message.bilibili.com/#/whisper', '#margin-root'],
    ]) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      const app = page.locator(`${host} .app`), header = page.locator(`${host} .top`);
      await header.waitFor();
      await page.waitForFunction(({ host, theme, glass }) => {
        const app = document.querySelector(host)?.shadowRoot?.querySelector('.app');
        return app?.getAttribute('data-theme') === theme && app?.getAttribute('data-glass') === glass;
      }, { host, theme, glass });
      await app.evaluate(e => {
        e.dataset.bg = 'image'; e.scrollTop = 240;
        const probe = document.createElement('div');
        probe.style.cssText = 'position:fixed;inset:0;z-index:4;pointer-events:none;background:repeating-linear-gradient(90deg,#fff 0 48px,#aaa 48px 96px)';
        e.append(probe);
      });
      if (name === 'watch') await page.evaluate(() => { document.body.style.minHeight = '2000px'; scrollTo(0, 240); });
      await page.waitForTimeout(250);
      const styles = await header.evaluate(e => {
        const s = getComputedStyle(e), p = getComputedStyle(e, '::before'), capsule = getComputedStyle(e.querySelector('.et'));
        return { background: s.backgroundImage, color: s.backgroundColor, backdrop: s.backdropFilter, before: p.content, capsuleBackdrop: capsule.backdropFilter, top: e.getBoundingClientRect().top };
      });
      const screenshot = await page.screenshot({ path: join(out, `${name}-${theme}-${glass}.png`), clip: { x: 0, y: 0, width: 1440, height: 120 } });
      const pixels = await page.evaluate(async base64 => {
        const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
        const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
        const g = c.getContext('2d'); g.drawImage(image, 0, 0);
        return [16, 48, 70, 73, 83, 100].map(y => ({ y, rgba: [...g.getImageData(8, y, 1, 1).data] }));
      }, screenshot.toString('base64'));
      const clean = pixels.every(p => p.rgba.every(v => v === 255));
      const result = { name, theme, glass, ...styles, clean, pixels }; results.push(result);
      if (!baseline) {
        assert(clean, `${name}/${theme}/${glass}: full-width header changes the background ${JSON.stringify(pixels)}`);
        assert.equal(styles.background, 'none'); assert.equal(styles.color, 'rgba(0, 0, 0, 0)');
        assert.equal(styles.backdrop, 'none'); assert(['none', 'normal'].includes(styles.before));
        assert.notEqual(styles.capsuleBackdrop, 'none', 'individual glass controls lost their backdrop');
        assert(Math.abs(styles.top) < 1, 'header no longer stays at the top during scrolling');
      }
      console.log(`${clean ? 'PASS' : 'TRACE'} ${name} ${theme} ${glass}`);
    }
  }
  assert.deepEqual(errors, []);
} finally {
  writeFileSync(join(out, 'results.json'), JSON.stringify({ results, errors }, null, 2));
  await ctx.close();
}
