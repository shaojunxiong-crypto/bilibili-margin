// 真实扩展后台 + 原生媒体播放/seek；只把 B 站和社区网络接口替换为离线样本。
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { installMocks } from './mocks.mjs';

const bvid = 'BV1mdxN68E7F', watch = `https://www.bilibili.com/video/${bvid}/`;
const dir = mkdtempSync(join(tmpdir(), 'margin-sponsor-test-'));
const ext = resolve(process.env.SMOKE_EXT || 'dist');
const ctx = await chromium.launchPersistentContext(dir, {
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chromium' }),
  headless: true, viewport: { width: 1440, height: 900 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--autoplay-policy=no-user-gesture-required'],
});
try {
  await installMocks(ctx, (u) => u.includes('/x/web-interface/view?') ? { code: 0, data: { pages: [{ page: 1, cid: 101 }, { page: 2, cid: 102 }] } } : null);
  await ctx.addInitScript(() => sessionStorage.setItem('margin:intro-played', '1'));
  let providerCalls = 0;
  let providerSeen;
  const firstProvider = new Promise((resolve) => { providerSeen = resolve; });
  await ctx.route('https://bsbsb.top/api/**', async (route) => {
    providerCalls++;
    const req = route.request(), url = new URL(req.url());
    assert.equal(req.method(), 'GET'); assert.equal(req.headers().cookie, undefined);
    assert.match(url.pathname, /^\/api\/skipSegments\/[0-9a-f]{4}$/);
    assert.equal(url.searchParams.get('videoID'), null);
    assert.match(req.headers()['x-ext-version'], /^MARGIN\//);
    const seg = (cid, start, end, duration = 60) => ({ cid: String(cid), category: 'sponsor', actionType: 'skip', segment: [start, end], videoDuration: duration, votes: 2 });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
      { videoID: 'BV14741127BN', segments: [seg(101, 1, 55)] },
      { videoID: bvid, segments: [seg(101, 10, 20), seg(101, 18, 25), seg(102, 30, 40), seg(101, 45, 50, 120)] },
    ]) });
    providerSeen();
  });
  // 一分钟静音 WAV，浏览器真正解码、播放并 seek，不覆盖媒体属性或事件。
  const wav = Buffer.alloc(44 + 60 * 8000 * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  await ctx.route('https://www.bilibili.com/margin-test.wav', (route) => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? '');
    const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
    return route.fulfill({ status: range ? 206 : 200, contentType: 'audio/wav',
      headers: { 'accept-ranges': 'bytes', ...(range ? { 'content-range': `bytes ${start}-${end}/${wav.length}` } : {}) }, body: wav.subarray(start, end + 1) });
  });
  const page = ctx.pages()[0];
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const sw = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent('serviceworker');
  const settings = (patch) => sw.evaluate(async (p) => {
    const current = (await chrome.storage.local.get('margin:settings'))['margin:settings'] ?? {};
    await chrome.storage.local.set({ 'margin:settings': { ...current, ...p } });
  }, patch);
  await settings({ bg: { mode: 'off' }, intro: false });
  await page.goto(watch, { waitUntil: 'domcontentloaded' });
  await page.locator('#margin-watch-top header.top').waitFor();
  await page.evaluate(async () => {
    const v = document.querySelector('video'); v.src = '/margin-test.wav'; v.load();
    await new Promise((resolve) => v.addEventListener('loadedmetadata', resolve, { once: true }));
  });
  await page.waitForTimeout(1200);
  await page.waitForFunction(() => { const v = document.querySelector('video'); return v.readyState === 4 && v.seekable.length && v.seekable.end(0) >= 60; });
  assert.equal(providerCalls, 0);
  await page.locator('#margin-watch-top .top [aria-label="设置"]').click();
  const toggle = page.locator('#margin-watch-top [role="switch"][aria-label="跳过视频内广告"]');
  assert.equal(await toggle.getAttribute('aria-checked'), 'false');
  await page.evaluate(() => document.getElementById('margin-watch-top').shadowRoot.querySelector('[role="switch"][aria-label="跳过视频内广告"]').click());
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('video').duration === 60);
  await Promise.race([firstProvider,page.waitForTimeout(5000)]);
  assert.equal(providerCalls, 1);
  console.log('PASS off by default; enabling uses one cookie-free hash-prefix request');
  await page.evaluate(() => { document.querySelector('video').currentTime = 11; });
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#margin-sponsor-notice').count(), 0);
  await page.evaluate(() => document.querySelector('video').play());
  await page.locator('#margin-sponsor-notice button').waitFor();
  let time = await page.evaluate(() => document.querySelector('video').currentTime);
  assert.ok(time >= 25 && time < 28, `overlap skip ended at ${time}`);
  assert.equal(await page.evaluate(() => document.querySelector('video').paused), false);
  console.log('PASS native playback skips the merged advertisement range, never a different video');
  await page.locator('#margin-sponsor-notice button').click();
  await page.waitForTimeout(900);
  time = await page.evaluate(() => document.querySelector('video').currentTime);
  assert.ok(time >= 11 && time < 15, `undo returned to ${time}`);
  assert.equal(await page.locator('#margin-sponsor-notice').count(), 0);
  console.log('PASS undo restores playback and exempts overlapping marks for this video');
  await page.evaluate(() => { document.querySelector('video').currentTime = 46; });
  await page.waitForTimeout(500);
  assert.ok(await page.evaluate(() => document.querySelector('video').currentTime < 49));
  console.log('PASS replaced-source duration mismatch does not skip');
  await page.evaluate(() => { history.pushState({}, '', '?p=2'); document.querySelector('video').currentTime = 11; });
  await page.waitForTimeout(1300);
  assert.ok(await page.evaluate(() => document.querySelector('video').currentTime < 15));
  await page.evaluate(() => { document.querySelector('video').currentTime = 31; });
  await page.locator('#margin-sponsor-notice button').waitFor();
  assert.ok(await page.evaluate(() => document.querySelector('video').currentTime >= 40));
  assert.equal(providerCalls, 1);
  console.log('PASS SPA part changes use the matching CID and cached community data');
  await settings({ sponsorSkip: false });
  await page.waitForFunction(() => !document.getElementById('margin-sponsor-notice'));
  await page.evaluate(() => { document.querySelector('video').currentTime = 31; });
  await page.waitForTimeout(500);
  assert.ok(await page.evaluate(() => document.querySelector('video').currentTime < 35));
  assert.equal(providerCalls, 1);
  assert.deepEqual(errors, []);
  console.log('PASS disabling immediately removes the notice and stops skipping');
} finally { await ctx.close(); rmSync(dir, { recursive: true, force: true }); }
