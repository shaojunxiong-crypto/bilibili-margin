import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { installMocks } from './mocks.mjs';

const ext = resolve(process.env.SMOKE_EXT || 'dist');
const out = resolve(process.env.SMOKE_OUT || 'tests/artifacts/watch-card-startup');
mkdirSync(out, { recursive: true });
const results = [], errors = [];
const left = `<div class="left-container">
  <div class="video-info-container"><h1 class="video-title">播放器启动回归</h1></div>
  <div id="playerWrap"><div class="bpx-player-container" data-screen="normal">
    <div class="bpx-player-primary-area"><div class="bpx-player-video-area"><video muted playsinline></video></div></div>
  </div></div>
  <div class="video-toolbar-container">原生操作栏</div>
  <div class="video-desc-container">原生简介</div><div class="video-tag-container">原生标签</div>
  <div id="commentapp"></div>
</div>`;
const fixture = scenario => `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0}.video-container-v1{width:1200px;margin:auto;display:flex;gap:24px}
  .left-container{width:900px;flex:none}.right-container{width:276px}
  #playerWrap,.bpx-player-container{height:506px}.bpx-player-container{background:#000}
  .bpx-player-container[data-screen="wide"]{width:1200px}
  .bpx-player-container[data-screen="mini"]{position:fixed;bottom:20px;right:20px;width:320px;height:180px}
  .bpx-player-video-area,video{width:100%;height:460px}
  #commentapp{min-height:600px}
</style></head><body><div id="app" ${scenario === 'hydration' ? 'data-server-rendered="true"' : ''}>
  <div class="video-container-v1">${scenario === 'late-container' ? `<template id="late-left">${left}</template>` : left}
    <div class="right-container"><div class="up-panel-container">UP 主</div><div id="danmukuBox">弹幕列表</div></div>
  </div></div><script>
  window.cardProbe = { bootAt: null, eligibleAt: null, cardAt: null, player: null, video: null };
  const probe = window.cardProbe;
  const observe = () => {
    if (probe.bootAt === null && document.getElementById('margin-watch-top')) probe.bootAt = performance.now();
    if (!probe.player) { probe.player = document.querySelector('.bpx-player-container'); probe.video = document.querySelector('video'); }
    if (probe.eligibleAt === null && probe.bootAt !== null && probe.player && !document.querySelector('[data-server-rendered]')) probe.eligibleAt = performance.now();
    const card = document.querySelector('.m-wcard');
    if (probe.cardAt === null && card && card.style.height && !card.hidden) probe.cardAt = performance.now();
  };
  new MutationObserver(observe).observe(document.documentElement, { childList:true, subtree:true, attributes:true });
  observe();
</script></body></html>`;

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'margin-card-startup-')), {
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chromium' }),
  headless: true, args: ['--headless=new', '--no-sandbox', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  viewport: { width: 1440, height: 1000 }, locale: 'zh-CN',
});
try {
  await installMocks(context);
  let scenario = 'hydrated';
  await context.route('https://www.bilibili.com/video/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture(scenario) }));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  await worker.evaluate(() => chrome.storage.local.set({ 'margin:settings': {
    intro: false, wide: false, autoWeb: false, webScroll: false, theme: 'dark', bg: { mode: 'off' },
  } }));
  for (scenario of ['hydrated', 'late-container', 'hydration']) {
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const result = { scenario, ok: false };
    results.push(result);
    try {
      await page.goto('https://www.bilibili.com/video/BV1mdxN68E7F/', { waitUntil: 'domcontentloaded' });
      await page.locator('#margin-watch-top .top').waitFor();
      if (scenario !== 'hydrated') {
        await page.waitForTimeout(150);
        assert.equal(await page.locator('.m-wcard').count(), 0, 'card inserted before native DOM was ready');
        await page.evaluate(scenario => {
          window.cardProbe.eligibleAt = performance.now();
          if (scenario === 'hydration') document.getElementById('app').removeAttribute('data-server-rendered');
          else {
            const template = document.getElementById('late-left');
            template.replaceWith(template.content);
          }
        }, scenario);
      }
      await page.waitForFunction(() => window.cardProbe.cardAt !== null, null, { timeout: 4000 });
      result.timing = await page.evaluate(() => {
        const { bootAt, eligibleAt, cardAt } = window.cardProbe;
        return { bootAt, eligibleAt, cardAt, delay: cardAt - eligibleAt };
      });
      result.identity = await page.evaluate(() => ({
        player: window.cardProbe.player === document.querySelector('.bpx-player-container'),
        video: window.cardProbe.video === document.querySelector('video'),
        last: document.querySelector('.left-container').lastElementChild.matches('.m-wcard'),
      }));
      assert.deepEqual(result.identity, { player: true, video: true, last: true });
      assert(result.timing.delay < 500, `card waited ${result.timing.delay.toFixed(1)}ms after the native page was ready`);
      result.ok = true;
      console.log(`PASS ${scenario}: ${result.timing.delay.toFixed(1)}ms`);
    } catch (error) {
      result.error = error.message;
      console.log(`FAIL ${scenario}: ${error.message}`);
    } finally {
      await page.screenshot({ path: join(out, `${scenario}.png`) });
      await page.close();
    }
  }

  scenario = 'hydrated';
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const result = { scenario: 'replacement-and-modes', ok: false, modes: [] };
  results.push(result);
  try {
    await page.goto('https://www.bilibili.com/video/BV1mdxN68E7F/');
    await page.waitForFunction(() => document.querySelector('.m-wcard')?.style.height);
    await page.evaluate(() => {
      const old = document.querySelector('.left-container');
      const replacement = document.createElement('div'); replacement.className = 'left-container';
      for (const child of [...old.children]) if (!child.matches('.m-wcard')) replacement.append(child);
      old.replaceWith(replacement);
    });
    await page.waitForFunction(() => document.querySelector('.left-container > .m-wcard')?.style.height, null, { timeout: 4000 });
    for (const mode of ['wide', 'mini', 'web', 'full', 'normal']) {
      await page.locator('.bpx-player-container').evaluate((player, mode) => { player.dataset.screen = mode; }, mode);
      await page.waitForTimeout(100);
      const state = await page.evaluate(() => {
        const card = document.querySelector('.m-wcard');
        return { hidden: card.hidden, fromPlayer: card.classList.contains('from-player'), count: document.querySelectorAll('.m-wcard').length,
          player: window.cardProbe.player === document.querySelector('.bpx-player-container'), video: window.cardProbe.video === document.querySelector('video') };
      });
      result.modes.push({ mode, ...state });
      assert.equal(state.count, 1);
      assert(state.player && state.video, `${mode}: native media node was replaced`);
      assert.equal(state.hidden, mode === 'web' || mode === 'full');
      if (!state.hidden) assert.equal(state.fromPlayer, mode === 'normal');
    }
    result.ok = true;
    console.log('PASS replacement-and-modes');
  } catch (error) { result.error = error.message; console.log(`FAIL replacement-and-modes: ${error.message}`); }
  finally { await page.screenshot({ path: join(out, 'replacement-and-modes.png') }); await page.close(); }

  scenario = 'hydration';
  const delayed = await context.newPage();
  delayed.on('pageerror', error => errors.push(error.message));
  const timeoutResult = { scenario: 'hydration-after-window', ok: false };
  results.push(timeoutResult);
  try {
    await delayed.goto('https://www.bilibili.com/video/BV1mdxN68E7F/');
    await delayed.locator('#margin-watch-top .top').waitFor();
    // Browser virtual time includes extension isolated-world timers, unlike page timer mocks.
    const cdp = await context.newCDPSession(delayed);
    const advance = async budget => {
      const expired = new Promise(resolve => cdp.once('Emulation.virtualTimeBudgetExpired', resolve));
      await cdp.send('Emulation.setVirtualTimePolicy', { policy: 'advance', budget, maxVirtualTimeTaskStarvationCount: 100 });
      await expired;
    };
    await advance(10_100);
    assert.equal(await delayed.locator('.m-wcard').count(), 0, 'card inserted while SSR marker remained');
    await delayed.evaluate(() => {
      window.cardProbe.eligibleAt = performance.now();
      document.getElementById('app').removeAttribute('data-server-rendered');
    });
    await advance(1800);
    timeoutResult.state = await delayed.evaluate(() => ({
      cards: document.querySelectorAll('.left-container > .m-wcard').length,
      player: window.cardProbe.player === document.querySelector('.bpx-player-container'),
      video: window.cardProbe.video === document.querySelector('video'),
      hydrationAt: window.cardProbe.eligibleAt - window.cardProbe.bootAt,
    }));
    assert.equal(timeoutResult.state.cards, 1, 'fallback polling did not bind after startup observation ended');
    assert(timeoutResult.state.player && timeoutResult.state.video);
    assert(timeoutResult.state.hydrationAt >= 10_000);
    timeoutResult.ok = true;
    console.log('PASS hydration-after-window');
  } catch (error) { timeoutResult.error = error.message; console.log(`FAIL hydration-after-window: ${error.message}`); }
  finally { await delayed.close(); }
} finally {
  writeFileSync(join(out, 'results.json'), JSON.stringify({ results, errors }, null, 2));
  await context.close();
}
if (results.some(result => !result.ok) || errors.length) process.exitCode = 1;
