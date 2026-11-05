// The native share count reserves 56px for its hover label. The capsule should fit both states.
import { chromium } from 'playwright';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { installMocks } from './mocks.mjs';

const ext = resolve(process.env.SMOKE_EXT || 'dist');
const out = resolve(process.env.SMOKE_OUT || 'tests/artifacts/watch-share');
mkdirSync(out, { recursive: true });
const results = [];
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'margin-share-')), {
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chromium' }),
  headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  viewport: { width: 1440, height: 900 }, locale: 'zh-CN',
});
try {
  await installMocks(context);
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const page = context.pages()[0];
  await worker.evaluate(() => chrome.storage.local.set({ 'margin:settings': { intro: false, theme: 'light', wide: false } }));
  await page.goto('https://www.bilibili.com/video/BV1mdxN68E7F/', { waitUntil: 'domcontentloaded' });
  await page.locator('#margin-watch-top .top').waitFor();
  await page.evaluate(() => {
    const fixture = document.createElement('div');
    fixture.id = 'share-regression';
    fixture.style.cssText = 'position:fixed;top:200px;left:100px;z-index:99999;background:white;padding:30px';
    fixture.innerHTML = `<style>
      #share-regression .video-toolbar-left-item { display:flex;align-items:center;width:92px; }
      #share-regression .video-share { display:flex;align-items:center; }
      #share-regression svg { width:28px;height:28px;margin-right:8px; }
      #share-regression .video-share-info { position:relative;width:56px;height:28px;line-height:28px;overflow:hidden; }
      #share-regression .video-share-info-text { position:absolute;top:0;left:0; }
    </style><div class="video-share-wrap video-toolbar-left-item"><span>
      <div class="video-share" tabindex="0"><svg viewBox="0 0 28 28"><path d="M4 14h20M17 7l7 7-7 7" fill="none" stroke="currentColor"/></svg>
      <div class="video-share-info video-toolbar-item-text"><span class="video-share-info-text">201</span></div></div>
    </span></div>`;
    document.body.append(fixture);
  });
  for (const zoom of [1, 1.25, 1.5]) {
    await worker.evaluate(async zoom => {
      const [tab] = await chrome.tabs.query({ active: true });
      await chrome.tabs.setZoom(tab.id, zoom);
    }, zoom);
    for (const text of ['201', '1.2万', '点击复制']) {
      const label = page.locator('#share-regression .video-share-info-text');
      await label.evaluate((element, value) => { element.textContent = value; }, text);
      const result = await label.evaluate(element => {
        const text = element.getBoundingClientRect();
        const slot = element.parentElement.getBoundingClientRect();
        const button = element.closest('.video-share-wrap').getBoundingClientRect();
        return { textWidth: text.width, slotWidth: slot.width, buttonWidth: button.width, rightPadding: button.right - text.right, height: slot.height };
      });
      results.push({ zoom, text, ...result });
      assert(Math.abs(result.slotWidth - result.textWidth) < 1, `${zoom}/${text}: share count has unused reserved width`);
      assert(Math.abs(result.rightPadding - 16) < 1, `${zoom}/${text}: share capsule has uneven padding`);
      assert.equal(result.height, 28, `${zoom}/${text}: copy label wraps`);
    }
    await page.locator('#share-regression').screenshot({ path: join(out, `share-${zoom}.png`) });
  }
  console.log(JSON.stringify(results));
} finally {
  writeFileSync(join(out, 'results.json'), JSON.stringify(results, null, 2));
  await context.close();
}
