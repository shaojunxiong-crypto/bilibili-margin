// 空间页抽屉回归：真实 CSS、鼠标命中、快速重开和接口进度单位。
import assert from 'node:assert/strict';
import { build } from 'vite';
import { chromium } from 'playwright';
import { installMocks } from './mocks.mjs';

const bundle = await build({ configFile: false, publicDir: false, logLevel: 'error', build: {
  write: false, minify: false, lib: { entry: 'tests/drawers-entry.ts', name: 'review', formats: ['iife'] },
} });
const code = (Array.isArray(bundle) ? bundle[0] : bundle).output.find((x) => x.type === 'chunk').code;
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chromium' }) });
const failures = [];
const check = (name, actual, expected) => {
  try { assert.deepEqual(actual, expected); console.log(`PASS ${name}`); }
  catch { failures.push(`${name}: actual=${JSON.stringify(actual)}, expected=${JSON.stringify(expected)}`); }
};
try {
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
    // 此用例把抽屉源码注入普通页面，补齐原生空间入口新增的设置读取接口。
    await ctx.addInitScript(() => {
      globalThis.chrome ??= {};
      chrome.storage = { local: { get: async () => ({}) }, onChanged: { addListener() {} } };
    });
    await installMocks(ctx);
    await ctx.route('**/x/web-interface/history/cursor?**', (route) => route.fulfill({ json: { code: 0, data: {
      cursor: null, list: [[-1, 200], [312, 600], [45, 200], [0, 0]].map(([progress, duration], i) => ({
        title: `历史 ${i}`, progress, duration, history: { business: 'archive', oid: i, bvid: `BVtest${i}` },
      })),
    } } }));
    const page = await ctx.newPage();
    await page.goto('https://space.bilibili.com/1/favlist');
    await page.addScriptTag({ content: code });
    await page.evaluate(() => {
      document.body.replaceChildren();
      const button = document.createElement('button'); button.id = 'native-control';
      button.style.cssText = 'position:fixed;left:20px;top:80px;width:160px;height:40px';
      document.body.append(button);
      for (const kind of ['fav', 'later', 'hist']) {
        const link = document.createElement('a'); link.id = kind; link.href = kind === 'hist' ? '#/history' : `#${kind}`; document.body.append(link);
      }
      review.installSpaceHooks(); document.getElementById('fav').click();
    });
    for (const kind of ['fav', 'later', 'hist']) {
      if (kind !== 'fav') await page.evaluate((kind) => document.getElementById(kind).click(), kind);
      await page.waitForTimeout(900);
      check(`${theme} native ${kind} clickable`, await page.evaluate((kind) => {
        const host = document.getElementById('margin-space-hooks');
        const panel = host.shadowRoot.querySelector(kind === 'fav' ? '.sheet' : kind === 'later' ? '.dw-panel' : 'aside[aria-label="历史记录"]');
        const rect = panel.getBoundingClientRect();
        return { onTop: document.elementFromPoint(rect.x + 50, 100) === host, interactive: getComputedStyle(panel).pointerEvents === 'auto' };
      }, kind), { onTop: true, interactive: true });
      await page.evaluate((kind) => document.getElementById('margin-space-hooks').shadowRoot.querySelector(kind === 'fav' ? '.sheet-x' : kind === 'later' ? '.dw .dw-close' : 'aside[aria-label="历史记录"] .dw-close').click(), kind);
      await page.waitForTimeout(1000);
      check(`${theme} native ${kind} close restores page`, await page.evaluate(() => ({
        hit: document.elementFromPoint(100, 100)?.id,
        background: getComputedStyle(document.getElementById('margin-space-hooks').shadowRoot.querySelector('.app')).backgroundColor,
      })), { hit: 'native-control', background: 'rgba(0, 0, 0, 0)' });
    }
    await page.evaluate((theme) => {
      document.body.replaceChildren();
      const host = document.createElement('div'); host.id = 'test-app'; const root = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style'); style.textContent = review.css;
      const app = document.createElement('div'); app.className = 'app'; app.dataset.theme = theme;
      const trigger = document.createElement('button'); trigger.id = 'trigger'; app.append(trigger);
      root.append(style, app); document.body.append(host); trigger.focus();
      window.hist = review.createHistoryDrawer(); app.append(hist.el); hist.open();
    }, theme);
    await page.waitForFunction(() => hist.el.querySelectorAll('i').length === 4);
    await page.waitForTimeout(400);
    check(`${theme} history scope and stacking`, await page.evaluate(() => {
      const root = document.getElementById('test-app').shadowRoot;
      return { inShadow: root.contains(hist.el), hit: root.elementFromPoint(1300, 100)?.closest('aside')?.getAttribute('aria-label'), scrollLocked: root.querySelector('.app').style.overflow === 'hidden', bodyLocked: document.body.style.overflow === 'hidden' };
    }), { inShadow: true, hit: '历史记录', scrollLocked: true, bodyLocked: true });
    check(`${theme} history progress units`, await page.evaluate(() => [...hist.el.querySelectorAll('i')].map((x) => x.style.width)), ['100%', '52%', '22.5%', '0%']);
    await page.evaluate(() => hist.close()); await page.waitForTimeout(80);
    await page.evaluate(() => hist.open()); await page.waitForTimeout(450);
    check(`${theme} history rapid reopen`, await page.evaluate(() => ({ connected: hist.el.isConnected, hidden: hist.el.hidden })), { connected: true, hidden: false });
    await page.evaluate(() => hist.close()); await page.waitForTimeout(400);
    check(`${theme} history restores scrolling and focus`, await page.evaluate(() => {
      const root = document.getElementById('test-app').shadowRoot;
      return { overflow: root.querySelector('.app').style.overflow, bodyOverflow: document.body.style.overflow, focus: root.activeElement?.id };
    }), { overflow: '', bodyOverflow: '', focus: 'trigger' });
    check(`${theme} history immediate close cancels open frame`, await page.evaluate(async () => {
      const app = document.getElementById('test-app').shadowRoot.querySelector('.app');
      app.style.overflow = 'scroll'; hist.open(); hist.close(); hist.close();
      await new Promise((resolve) => setTimeout(resolve, 400));
      return { hidden: hist.el.hidden, overflow: app.style.overflow, transform: hist.el.querySelector('aside').style.transform };
    }), { hidden: true, overflow: 'scroll', transform: 'translateX(102%)' });
    await ctx.close();
  }
} finally { await browser.close(); }
assert.deepEqual(failures, [], failures.join('\n'));
