// The native loading player has no data-screen until its initialization completes.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { installMocks } from './mocks.mjs';

const ext = resolve(process.env.SMOKE_EXT || 'dist');
const out = resolve(process.env.SMOKE_OUT || 'tests/artifacts/watch-startup');
mkdirSync(out, { recursive: true });
const results = [], errors = [];
const fixture = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;background:#eee}.video-container-v1{display:flex;width:1200px;margin:auto;gap:24px}
  .left-container{width:900px;flex:none}.right-container{width:276px}
  #playerWrap{height:552px}.bpx-player-container{width:900px;height:552px}
  .bpx-player-primary-area{height:100%}.bpx-player-video-area{height:506px;position:relative;background:#000;overflow:hidden}
  .bpx-player-loading-panel{position:absolute;inset:0;background:#000;color:white;display:grid;place-items:center}
  video{width:100%;height:100%}.bpx-player-sending-area{height:46px;background:#222}
  .bpx-player-container[data-screen="wide"]{width:1200px}
  .bpx-player-container[data-screen="mini"]{position:fixed;bottom:20px;right:20px;width:320px;height:226px}
  .bpx-player-container[data-screen="mini"] .bpx-player-video-area{height:180px}
</style></head><body><div id="app" data-server-rendered="true"><div class="video-container-v1">
  <div class="left-container"><h1 class="video-title">加载中</h1><div id="playerWrap"><div id="bilibili-player">
    <div class="bpx-docker bpx-docker-major"><div class="bpx-player-container" data-revision="1" data-locale="zh-Hans">
      <div class="bpx-player-primary-area"><div class="bpx-player-video-area"><video muted></video>
        <div class="bpx-player-loading-panel bpx-state-loading">视频加载中</div>
      </div><div class="bpx-player-sending-area"></div></div>
    </div></div></div></div><div class="video-toolbar-container">互动</div><div class="video-desc-container">简介</div>
    <div class="video-tag-container">标签</div><div id="commentapp"></div></div>
  <div class="right-container"><div class="up-panel-container">UP 主</div><div id="danmukuBox">弹幕列表</div></div>
</div></div><script>window.originalPlayer=document.querySelector('.bpx-player-container');window.originalVideo=document.querySelector('video');</script></body></html>`;

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'margin-watch-startup-')), {
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chromium' }),
  headless: true, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  viewport: { width: 1440, height: 1000 }, locale: 'zh-CN',
});
try {
  await installMocks(context);
  await context.route('https://www.bilibili.com/video/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture }));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  await worker.evaluate(() => chrome.storage.local.set({ 'margin:settings': {
    intro: false, wide: false, autoWeb: false, webScroll: false, radius: 100, theme: 'dark', bg: { mode: 'off' },
  } }));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('https://www.bilibili.com/video/BV1mdxN68E7F/', { waitUntil: 'domcontentloaded' });
  await page.locator('#margin-watch-top .top').waitFor();
  const sample = () => page.evaluate(() => {
    const player = document.querySelector('.bpx-player-container');
    const area = player.querySelector('.bpx-player-video-area');
    const style = getComputedStyle(area);
    return { radius: parseFloat(style.borderTopLeftRadius), mask: style.maskImage, overflow: style.overflow,
      width: player.getBoundingClientRect().width, wrapperOverflow: getComputedStyle(document.getElementById('playerWrap')).overflow,
      player: player === window.originalPlayer, video: document.querySelector('video') === window.originalVideo };
  });
  const check = async (name, radius, rounded, width) => {
    const result = { name, ...await sample(), ok: false };
    results.push(result);
    try {
      assert.equal(result.radius, radius, `${name}: loading surface radius`);
      assert.equal(result.mask !== 'none', rounded, `${name}: loading surface clipping`);
      assert(result.player && result.video, `${name}: native media identity changed`);
      if (width) assert.equal(result.width, width, `${name}: player width`);
      assert.equal(result.wrapperOverflow, 'visible', `${name}: wrapper clips wide or mini player`);
      result.ok = true;
      console.log(`PASS ${name}`);
    } catch (error) { result.error = error.message; console.log(`FAIL ${name}: ${error.message}`); }
  };
  await check('initial-loading-without-screen', 16, true, 900);
  await page.screenshot({ path: join(out, 'initial-loading.png') });
  assert.equal(await page.locator('.m-wcard').count(), 0, 'decoration inserted before hydration');
  for (const radius of [0, 50, 150, 100]) {
    await worker.evaluate(async radius => {
      const stored = await chrome.storage.local.get('margin:settings');
      await chrome.storage.local.set({ 'margin:settings': { ...stored['margin:settings'], radius } });
    }, radius);
    await page.waitForFunction(radius => Number(getComputedStyle(document.documentElement).getPropertyValue('--margin-rk').trim() || 1) === radius / 100, radius);
    await check(`loading-radius-${radius}`, 16 * radius / 100, true, 900);
  }
  await page.locator('#app').evaluate(element => element.removeAttribute('data-server-rendered'));
  await page.waitForFunction(() => document.documentElement.classList.contains('margin-wcard'));
  await check('hydrated-without-screen', 20, true, 900);
  for (const mode of ['normal', 'wide', 'mini', 'web', 'full', 'normal']) {
    await page.locator('.bpx-player-container').evaluate((element, mode) => { element.dataset.screen = mode; }, mode);
    await page.waitForTimeout(120);
    await check(`mode-${mode}`, mode === 'normal' ? 20 : mode === 'wide' ? 16 : 0,
      mode === 'normal' || mode === 'wide', mode === 'wide' ? 1200 : mode === 'mini' ? 320 : 900);
  }
  await page.screenshot({ path: join(out, 'hydrated-loading.png') });
  await page.goto('https://www.bilibili.com/video/BV1mdxN68E7F/?margin=off');
  await page.waitForTimeout(300);
  await check('page-bypass', 0, false, 900);
} finally {
  writeFileSync(join(out, 'results.json'), JSON.stringify({ results, errors }, null, 2));
  await context.close();
}
if (results.some(result => !result.ok) || errors.length) process.exitCode = 1;
