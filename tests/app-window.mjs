// 使用真实 --app 窗口的 standalone 模式，不覆盖 matchMedia。
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { installMocks } from './mocks.mjs';

const ext = resolve(process.env.SMOKE_EXT || 'dist');
for (const app of [false, true]) {
  const dir = mkdtempSync(join(tmpdir(), 'margin-app-test-'));
  const ctx = await chromium.launchPersistentContext(dir, {
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chromium' }),
    headless: true, viewport: { width: 1440, height: 900 },
    args: [...(app ? ['--app=data:text/html,margin-app-test'] : []), `--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  try {
    await installMocks(ctx);
    await ctx.addInitScript(() => sessionStorage.setItem('margin:intro-played', '1'));
    const page = ctx.pages()[0] ?? await ctx.newPage();
    await page.goto('https://www.bilibili.com/', { waitUntil: 'domcontentloaded' });
    await page.locator('#margin-root .grid .card .cover').first().waitFor();
    assert.equal(await page.evaluate(() => matchMedia('(display-mode: standalone)').matches), app);
    if (!app) {
      const [popup] = await Promise.all([page.waitForEvent('popup'), page.locator('#margin-root .grid .card .cover').first().click()]);
      await popup.waitForLoadState('domcontentloaded');
      assert.match(popup.url(), /bilibili\.com\/video\//);
      assert.equal(page.url(), 'https://www.bilibili.com/'); await popup.close();
      console.log('PASS normal browser keeps new-tab video links');
    } else {
      const input = page.locator('#margin-root .hero-search input');
      await input.fill('映间');
      await Promise.all([page.waitForURL('https://search.bilibili.com/**'), input.press('Enter')]);
      assert.equal(ctx.pages().length, 1);
      assert.equal(await page.evaluate(() => matchMedia('(display-mode: standalone)').matches), true);
      console.log('PASS app search stays in the same application window');
      const space = page.locator('#margin-watch-top .user.in');
      await space.waitFor();
      await Promise.all([page.waitForURL('https://space.bilibili.com/**'), space.click()]);
      assert.equal(ctx.pages().length, 1);
      await page.locator('#margin-root main').waitFor();
      console.log('PASS app profile link crosses subdomains in the same window');
      await page.goto('https://www.bilibili.com/', { waitUntil: 'domcontentloaded' });
      await Promise.all([page.waitForURL('https://www.bilibili.com/video/**'), page.locator('#margin-root .grid .card .cover').first().click()]);
      assert.equal(ctx.pages().length, 1);
      console.log('PASS app video link stays in the same window');
      await page.goto('https://www.bilibili.com/', { waitUntil: 'domcontentloaded' });
      // --app 的原生新标签可能交给独立浏览器，未必产生 Playwright popup。
      // 在冒泡阶段记录扩展是否拦截，再由测试取消默认操作，验证交还浏览器的边界。
      const observeClick = () => page.evaluate(() => document.addEventListener('click', (e) => {
        window.marginNativeClick = { ctrlKey: e.ctrlKey, prevented: e.defaultPrevented }; e.preventDefault();
      }, { once: true }));
      await observeClick();
      await page.locator('#margin-root .grid .card .cover').first().click({ modifiers: ['Control'] });
      assert.deepEqual(await page.evaluate(() => window.marginNativeClick), { ctrlKey: true, prevented: false });
      assert.equal(page.url(), 'https://www.bilibili.com/');
      console.log('PASS modified app clicks are not intercepted by the extension');
      await page.goto('https://www.bilibili.com/?margin=off', { waitUntil: 'domcontentloaded' });
      await page.locator('main.native').waitFor();
      await page.evaluate(() => {
        const a = document.createElement('a'); a.id = 'native-test-link'; a.href = 'https://space.bilibili.com/2/'; a.target = '_blank'; a.textContent = '原生链接'; document.body.append(a);
      });
      await observeClick(); await page.locator('#native-test-link').click();
      assert.deepEqual(await page.evaluate(() => window.marginNativeClick), { ctrlKey: false, prevented: false });
      assert.equal(page.url(), 'https://www.bilibili.com/?margin=off');
      console.log('PASS margin=off leaves native link handling untouched');
    }
  } finally { await ctx.close(); rmSync(dir, { recursive: true, force: true }); }
}
