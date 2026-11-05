// UI workload comparison. UI counters are collected in the extension isolated world;
// headless timings do not represent the user's physical GPU frame rate.
import { chromium } from 'playwright';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { apiBody, installMocks } from './mocks.mjs';

const ext = resolve(process.env.SMOKE_EXT || 'dist');
const out = resolve(process.env.SMOKE_OUT || 'tests/artifacts/performance-ui');
mkdirSync(out, { recursive: true });
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'margin-perf-')), {
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chromium' }), headless: true,
  args: ['--headless=new', '--no-sandbox', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', colorScheme: 'dark',
});
const results = [];
const assertPerformance = process.env.PERF_BASELINE !== '1';
try {
  let uniqueBatch = false;
  await installMocks(ctx, (url) => {
    if (uniqueBatch && url.includes('/feed/rcmd')) {
      const body = apiBody(url);
      body.data.item = body.data.item.map((v, i) => ({ ...v, bvid: `BV1prf${String(i).padStart(6, '0')}` }));
      return body;
    }
  });
  await ctx.addInitScript(() => sessionStorage.setItem('margin:intro-played', '1'));
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  await sw.evaluate(() => chrome.storage.local.set({ 'margin:settings': { theme: 'dark', intro: false } }));
  const page = ctx.pages()[0];
  let feedRequests = 0;
  page.on('request', r => { if (r.url().includes('/feed/rcmd')) feedRequests++; });
  const cdp = await ctx.newCDPSession(page), worlds = new Map();
  cdp.on('Runtime.executionContextCreated', ({ context }) => worlds.set(context.id, context));
  cdp.on('Runtime.executionContextDestroyed', ({ executionContextId }) => worlds.delete(executionContextId));
  cdp.on('Runtime.executionContextsCleared', () => worlds.clear());
  await cdp.send('Runtime.enable'); await cdp.send('Performance.enable');
  const origin = sw.url().split('/').slice(0, 3).join('/');
  const evaluate = async (expression) => {
    const world = [...worlds.values()].find(w => w.origin === origin);
    assert(world, 'extension isolated world missing');
    const r = await cdp.send('Runtime.evaluate', { contextId: world.id, expression, returnByValue: true, awaitPromise: true });
    assert(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value;
  };
  const instrument = async () => evaluate(`(() => {
    window.perfCounts = { rebuilds: {}, created: 0, folderReads: 0, artQueries: 0, tabReads: 0 };
    const replace = Element.prototype.replaceChildren, rect = Element.prototype.getBoundingClientRect, query = Element.prototype.querySelectorAll;
    Element.prototype.replaceChildren = function(...nodes) {
      if (this.matches('.hl,.home-order,.chips')) { const key = this.className; perfCounts.rebuilds[key] = (perfCounts.rebuilds[key] || 0) + 1; }
      return replace.apply(this, nodes);
    };
    const create = Document.prototype.createElement;
    Document.prototype.createElement = function(...args) { perfCounts.created++; return create.apply(this, args); };
    Element.prototype.getBoundingClientRect = function() {
      if (this.matches('.gf-root')) perfCounts.folderReads++;
      if (this.matches('.et,.et-btn')) perfCounts.tabReads++;
      return rect.call(this);
    };
    Element.prototype.querySelectorAll = function(s) { if (s === '.gf-art') perfCounts.artQueries++; return query.call(this, s); };
  })()`);
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const run = async (name, action) => {
    await evaluate('perfCounts = { rebuilds: {}, created: 0, folderReads: 0, artQueries: 0, tabReads: 0 }');
    const requestsBefore = feedRequests;
    const before = await metrics(); await action(); const after = await metrics();
    const counts = await evaluate('perfCounts');
    const delta = Object.fromEntries(['TaskDuration', 'LayoutDuration', 'RecalcStyleDuration', 'LayoutCount', 'RecalcStyleCount'].map(k => [k, after[k] - before[k]]));
    const r = { name, ...counts, feedRequests: feedRequests - requestsBefore, metrics: delta }; results.push(r); console.log(JSON.stringify(r)); return r;
  };
  for (const [name, url, host] of [
    ['home-theme', 'https://www.bilibili.com/', '#margin-root'],
    ['watch-theme', 'https://www.bilibili.com/video/BV1mdxN68E7F/', '#margin-watch-top'],
  ]) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const settings = page.locator(`${host} .top [aria-label="设置"]`);
    await settings.waitFor(); await page.waitForTimeout(700);
    await settings.click(); await page.locator(`${host} .sheet[aria-label="设置"] .sheet-x`).click();
    await page.waitForTimeout(500); await instrument();
    const r = await run(name, async () => {
      for (let i = 0; i < 8; i++) {
        await page.locator(`${host} button[aria-label^="切换到"]`).click();
        await page.waitForTimeout(350);
      }
    });
    assert.equal(await page.locator(`${host} button[aria-label^="切换到"]`).getAttribute('aria-checked'), 'true', `${name}: theme did not complete eight toggles`);
    if (assertPerformance) assert.equal(Object.values(r.rebuilds).reduce((a,b) => a+b, 0), 0, `${name}: unrelated hidden lists rebuilt`);
  }
  await page.goto('https://www.bilibili.com/', { waitUntil: 'domcontentloaded' });
  await page.locator('#margin-root .top [aria-label="收藏"]').click();
  const folder = page.locator('#margin-root .gf-root').first(); await folder.waitFor();
  await page.waitForTimeout(1200); await instrument();
  const box = await folder.boundingBox();
  const hover = await run('favorite-hover', async () => {
    for (let i = 0; i < 100; i++) {
      await page.mouse.move(box.x + box.width * (.25 + .5 * (i % 20) / 19), box.y + box.height * .65);
      await page.waitForTimeout(16);
    }
    await page.mouse.move(10, 500); await page.waitForTimeout(300);
  });
  if (assertPerformance) { assert(hover.folderReads < 10, 'folder geometry read each pointer frame'); assert.equal(hover.artQueries, 0, 'art queried each pointer frame'); }
  if (assertPerformance) assert(hover.feedRequests <= 40, 'duplicate recommendations caused a tight fetch/skeleton loop');
  await page.screenshot({ path: join(out, 'favorites.png') });
  const checkTilt = async () => {
    const r = await folder.boundingBox(), x = r.x + r.width * .7, y = r.y + r.height * .65;
    await page.mouse.move(x, y); await page.waitForTimeout(80);
    const tilt = await folder.evaluate((e, { x, y }) => {
      const r = e.getBoundingClientRect(), m = new DOMMatrix(e.querySelector('.gf-tilt').style.transform);
      return { dx: m.m41 - ((x-r.left)/r.width*2-1)*3, dy: m.m42 - ((y-r.top)/r.height*2-1)*2 };
    }, { x, y });
    assert(Math.abs(tilt.dx) < .02 && Math.abs(tilt.dy) < .02, `stale folder geometry: ${JSON.stringify(tilt)}`);
  };
  await checkTilt();
  await page.locator('#margin-root .sheet[aria-label="收藏夹"] .sheet-body').evaluate(e => { e.scrollTop += 20; });
  await checkTilt();
  await page.setViewportSize({ width: 1280, height: 1000 }); await page.waitForTimeout(250); await checkTilt();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const headerHover = await run('header-hover', async () => {
    for (const label of ['动态', '消息', '收藏', '稍后']) {
      await page.locator(`#margin-root .top .et-btn[aria-label^="${label}"]`).hover(); await page.waitForTimeout(650);
    }
  });
  if (assertPerformance) assert(headerHover.tabReads <= 20, 'header hover keeps polling layout after the pointer stops');
  const header = page.locator('#margin-root .top .et');
  for (const label of ['动态', '消息', '收藏', '稍后', '收藏']) {
    await page.locator(`#margin-root .top .et-btn[aria-label^="${label}"]`).hover();
  }
  await page.waitForTimeout(250);
  const alignment = await header.evaluate(e => {
    const b = e.querySelector('[aria-label^="收藏"]').getBoundingClientRect(), t = e.querySelector('.et-thumb').getBoundingClientRect();
    return { left: Math.abs(b.left-t.left), width: Math.abs(b.width-t.width) };
  });
  assert(alignment.left < 1 && alignment.width < 1, `interrupted header slide misses final target: ${JSON.stringify(alignment)}`);
  await page.setViewportSize({ width: 1280, height: 1000 }); await page.waitForTimeout(250);
  const resized = await header.evaluate(e => Math.abs(e.querySelector('[aria-label^="收藏"]').getBoundingClientRect().left-e.querySelector('.et-thumb').getBoundingClientRect().left));
  assert(resized < 1, 'header thumb loses alignment after resizing');
  const cardsBefore = await page.locator('#margin-root .grid .card:not(.sk)').count();
  uniqueBatch = true;
  await page.waitForFunction(n => document.getElementById('margin-root')?.shadowRoot?.querySelectorAll('.grid .card:not(.sk)').length > n, cardsBefore, { timeout: 6000 });
  console.log('PASS: recommendation loading recovers when fresh videos arrive');
} finally {
  writeFileSync(join(out, 'results.json'), JSON.stringify({ extension: ext, scope: 'isolated Chromium; mocked Bilibili; UI CPU/layout counts, not physical GPU FPS', results }, null, 2));
  await ctx.close();
}
