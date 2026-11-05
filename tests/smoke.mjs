// 冒烟测试：加载构建好的扩展（dist/），在离线伪造的 B 站上依次打开各个接管页面，
// 断言扩展没有抛未捕获错误、关键元素都在，并保存亮 / 暗两套 1440 截图。
//   npm run build && node tests/smoke.mjs
// 环境变量：CHROMIUM_PATH 指定浏览器（默认用 Playwright 自带的 chromium），SMOKE_OUT 截图目录（默认 tests/artifacts），
// SMOKE_THEMES=light,dark，SMOKE_ONLY=home,watch 只跑部分页面。
import { chromium } from 'playwright';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { installMocks } from './mocks.mjs';

const EXT = resolve(process.env.SMOKE_EXT || 'dist');
const OUT = resolve(process.env.SMOKE_OUT || 'tests/artifacts');
const THEMES = (process.env.SMOKE_THEMES || 'light,dark').split(',');
const ONLY = process.env.SMOKE_ONLY ? process.env.SMOKE_ONLY.split(',') : null;
if (!existsSync(join(EXT, 'manifest.json'))) { console.error('dist/ 不存在，先 npm run build'); process.exit(2); }
mkdirSync(OUT, { recursive: true });

const R = "document.getElementById('margin-root')?.shadowRoot";
/** 每个页面：地址 + 在页面里求值、返回缺失项列表的检查 */
const PAGES = [
  ['home', 'https://www.bilibili.com/', `(() => { const r = ${R}; if (!r) return ['#margin-root'];
    const miss = []; if (r.querySelectorAll('.grid .card').length < 4) miss.push('.grid .card ×4');
    for (const s of ['header', '.fp-card .fp-cells', '.hero-search, .hs', '.dash']) if (!r.querySelector(s)) miss.push(s);
    // 发布时间的绝对时间要单独一行显示
    const dates = [...r.querySelectorAll('.grid .card .pubtime')].map((e) => e.textContent.trim())
      .filter((t) => t.length === 19 && t[4] === '-' && t[10] === ' ' && t[13] === ':' && t[16] === ':');
    if (dates.length < 4) miss.push('card publish time missing');
    return miss; })()`],
  ['watch', 'https://www.bilibili.com/video/BV1mdxN68E7F/', `(() => { const miss = [];
    if (!document.documentElement.classList.contains('margin-watch')) miss.push('html.margin-watch');
    if (!document.getElementById('margin-watch-css')) miss.push('#margin-watch-css');
    const t = document.getElementById('margin-watch-top')?.shadowRoot; if (!t || !t.querySelector('header')) miss.push('#margin-watch-top header');
    return miss; })()`],
  ['search', 'https://search.bilibili.com/all?keyword=%E6%98%A0%E9%97%B4', `(() => {
    const miss = []; if (!document.documentElement.classList.contains('margin-search')) miss.push('html.margin-search');
    if (!document.getElementById('margin-watch-top')) miss.push('#margin-watch-top'); return miss; })()`],
  ['space', 'https://space.bilibili.com/2/video', `(() => { const r = ${R}; if (!r) return ['#margin-root'];
    const miss = []; if (!r.querySelector('main.tk')) miss.push('main.tk'); if (!r.querySelector('header')) miss.push('header'); return miss; })()`],
  ['message', 'https://message.bilibili.com/', `(() => { const r = ${R}; if (!r) return ['#margin-root'];
    const miss = []; if (!r.querySelector('main.tk')) miss.push('main.tk'); return miss; })()`],
  ['history', 'https://www.bilibili.com/account/history', `(() => { const r = ${R}; if (!r) return ['#margin-root'];
    const miss = []; if (!r.querySelector('main.tk')) miss.push('main.tk');
    const rows = [...r.querySelectorAll('.hi-row:not(.sk)')].map((e) => e.getBoundingClientRect());
    if (rows.length < 3) miss.push('.hi-row ×3');
    // v0.31.1 回归：条目曾因和首页搜索的 .hs-row 同名被压成 54px 高、互相重叠
    for (let i = 1; i < rows.length; i++) if (rows[i].top < rows[i - 1].bottom - 1) { miss.push('.hi-row ' + i + ' overlaps previous'); break; }
    return miss; })()`],
  ['opus', 'https://www.bilibili.com/opus/1005142803949289489', `(() => { const miss = []; const de = document.documentElement;
    if (de.dataset.marginDetail !== 'opus') miss.push('html[data-margin-detail=opus]');
    const a = document.getElementById('margin-aside'); const r = a?.shadowRoot; if (!r) return [...miss, '#margin-aside'];
    if (a.hidden) miss.push('#margin-aside hidden at 1440');
    if (!r.querySelector('.author .who b')?.textContent?.trim()) miss.push('.author name');
    if (r.querySelectorAll('.toc a').length < 3) miss.push('.toc ×3');
    if (r.querySelectorAll('.acts .act:not([hidden])').length < 5) miss.push('.acts ×5');
    // 侧栏和正文不能重叠
    const m = document.querySelector('.opus-detail')?.getBoundingClientRect(), s = a.getBoundingClientRect();
    if (m && s.left < m.right + 40) miss.push('aside overlaps article');
    return miss; })()`],
  ['feed', 'https://t.bilibili.com/', `(() => { const r = ${R}; if (!r) return ['#margin-root'];
    const miss = []; if (!r.querySelector('main.tk')) miss.push('main.tk'); return miss; })()`],
].filter(([n]) => !ONLY || ONLY.includes(n));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
let failed = 0;

for (const theme of THEMES) {
  const dir = mkdtempSync(join(tmpdir(), 'margin-smoke-'));
  const exe = process.env.SMOKE_BUNDLED ? undefined : process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const ctx = await chromium.launchPersistentContext(dir, {
    ...(exe ? { executablePath: exe } : { channel: 'chromium' }),
    headless: true,
    args: ['--headless=new', '--no-sandbox', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--autoplay-policy=no-user-gesture-required'],
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    colorScheme: theme,
  });
  await installMocks(ctx);
  await ctx.addInitScript(() => { try { sessionStorage.setItem('margin:intro-played', '1'); } catch { /* */ } });
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 10_000 }).catch(() => null);

  const page = ctx.pages()[0] ?? await ctx.newPage();
  let requests = [];
  page.on('request', (r) => requests.push(r.url()));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Runtime.enable');
  let errors = [];
  const fromExt = (s) => /chrome-extension:\/\/|\[MARGIN\]/.test(s);
  cdp.on('Runtime.exceptionThrown', (e) => {
    const d = e.exceptionDetails; const text = `${d.exception?.description || d.text} @ ${d.url || ''}`;
    if (fromExt(text) || fromExt(JSON.stringify(d.stackTrace || ''))) errors.push(text.slice(0, 400));
  });
  page.on('console', (m) => { if (m.type() === 'error' && fromExt(m.text() + (m.location()?.url || ''))) errors.push(m.text().slice(0, 400)); });

  for (const [name, url, check] of PAGES) {
    errors = [];
    const t0 = Date.now();
    let miss = ['(未执行)'];
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      for (let i = 0; i < 40; i++) {
        miss = await page.evaluate(check).catch((e) => [`evaluate: ${e.message}`]);
        if (!miss.length) break;
        await sleep(250);
      }
      await sleep(2500);
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT, `${name}-${theme}.png`), Buffer.from(shot.data, 'base64'));
    } catch (e) { miss = [`goto: ${e.message}`]; }
    const ok = !miss.length && !errors.length;
    if (!ok) failed++;
    results.push({ theme, name, ok, ms: Date.now() - t0, miss, errors });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${theme.padEnd(5)} ${name.padEnd(8)} ${Date.now() - t0}ms${miss.length ? ` missing: ${miss.join(', ')}` : ''}${errors.length ? `\n      errors: ${errors.join('\n              ')}` : ''}`);
  }

  // v0.47 新功能：设置种子都通过 service worker 写入 chrome.storage.local
  if (theme === THEMES[0] && sw) {
    const HOME = 'https://www.bilibili.com/';
    const WATCH = 'https://www.bilibili.com/video/BV1mdxN68E7F/';
    const SEARCH = 'https://search.bilibili.com/all?keyword=%E6%98%A0%E9%97%B4';
    const POPULAR = 'https://www.bilibili.com/v/popular/all';
    const MESSAGE = 'https://message.bilibili.com/';
    const seed = async (patch) => {
      await sw.evaluate(async (p) => {
        const cur = (await chrome.storage.local.get('margin:settings'))['margin:settings'] ?? {};
        await chrome.storage.local.set({ 'margin:settings': { ...cur, ...p } });
      }, patch);
    };
    const reset = async () => {
      await sw.evaluate(async () => { await chrome.storage.local.remove('margin:settings'); });
    };
    const feature = async (name, fn) => {
      const t0 = Date.now();
      let miss = [];
      try { miss = await fn(); } catch (e) { miss = [e.message]; }
      const ok = !miss.length;
      if (!ok) failed++;
      results.push({ theme, name, ok, miss, ms: Date.now() - t0 });
      console.log(`${ok ? 'PASS' : 'FAIL'} ${theme.padEnd(5)} ${name.padEnd(18)} ${Date.now() - t0}ms${miss.length ? ` problems: ${miss.join(', ')}` : ''}`);
    };
    const filterOff = { keywords: [], ups: [], minViews: 0, minDuration: 0 };

    await feature('home-order', async () => {
      await reset();
      await seed({ homeOrder: ['feed', 'hero', 'dash', 'toolbar', 'footer'] });
      await page.goto(HOME, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.getElementById('margin-root')?.shadowRoot?.querySelector('.grid .card:not(.sk)'), null, { timeout: 15_000 });
      await sleep(500);
      return page.evaluate(() => {
        const r = document.getElementById('margin-root')?.shadowRoot;
        const main = r?.querySelector('main');
        if (!main) return ['main'];
        const kids = [...main.children], miss = [];
        const idx = (sel) => { const el = main.querySelector(sel); return el ? kids.indexOf(el) : -1; };
        const seq = ['.grid', '.hs-slot', '.dash', '.bar-mark', '.foot'];
        for (let i = 1; i < seq.length; i++) if (idx(seq[i - 1]) < 0 || idx(seq[i]) < 0 || idx(seq[i - 1]) >= idx(seq[i])) miss.push(`${seq[i - 1]}<${seq[i]}`);
        if (main.querySelector('.bar-mark')?.nextElementSibling !== main.querySelector('.bar')) miss.push('bar-mark+bar adjacency');
        if (main.querySelector('.grid')?.nextElementSibling !== main.querySelector('.status')) miss.push('grid+status adjacency');
        if (main.querySelector('.status')?.nextElementSibling !== main.querySelector('.sentinel')) miss.push('status+sentinel adjacency');
        return miss;
      });
    });

    await feature('settings-panel', async () => {
      await reset();
      await page.goto(HOME, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.getElementById('margin-root')?.shadowRoot?.querySelector('.grid .card:not(.sk)'), null, { timeout: 15_000 });
      await page.evaluate(() => {
        const r = document.getElementById('margin-root')?.shadowRoot;
        r?.querySelector('.hd-settings')?.click();
      });
      await page.waitForFunction(() => document.getElementById('margin-root')?.shadowRoot?.querySelector('.home-order-row'), null, { timeout: 8000 }).catch(() => {});
      await sleep(300);
      const miss = await page.evaluate(() => {
        const r = document.getElementById('margin-root')?.shadowRoot;
        const m = [];
        const rows = [...r?.querySelectorAll('.home-order-row') ?? []];
        if (rows.length !== 5) m.push(`order rows ${rows.length}`);
        if (!r?.querySelector('[data-focus="hero:down"]')) m.push('hero down button missing');
        if (![...r?.querySelectorAll('.row-label span') ?? []].some((e) => e.textContent === '减少动画')) m.push('reduce motion row missing');
        if (![...r?.querySelectorAll('.row-label span') ?? []].some((e) => e.textContent === '宽屏模式')) m.push('wide row missing');
        if (![...r?.querySelectorAll('.row-label span') ?? []].some((e) => e.textContent === '消息提醒')) m.push('message row missing');
        if (![...r?.querySelectorAll('.row-label span') ?? []].some((e) => e.textContent === '隐藏广告')) m.push('ads row missing');
        if (![...r?.querySelectorAll('.row-label span') ?? []].some((e) => e.textContent === '点击分类标签刷新列表')) m.push('tab-refresh row missing');
        return m;
      });
      await page.evaluate(() => {
        const r = document.getElementById('margin-root')?.shadowRoot;
        r?.querySelector('[data-focus="hero:down"]')?.click();
      });
      await sleep(500);
      miss.push(...await page.evaluate(() => {
        const r = document.getElementById('margin-root')?.shadowRoot;
        const main = r?.querySelector('main');
        const kids = [...main?.children ?? []];
        const idx = (sel) => { const el = main?.querySelector(sel); return el ? kids.indexOf(el) : -1; };
        return idx('.dash') >= 0 && idx('.dash') < idx('.hs-slot') ? [] : ['order button did not move hero down'];
      }));
      return miss;
    });

    await feature('tab-refresh', async () => {
      await reset();
      await seed({ tabRefresh: true });
      await page.goto(HOME, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.getElementById('margin-root')?.shadowRoot?.querySelector('.grid .card:not(.sk)'), null, { timeout: 15_000 });
      await sleep(500);
      const state = () => page.evaluate(() => {
        const r = document.getElementById('margin-root').shadowRoot;
        return {
          backHidden: r.querySelector('.refresh.back')?.hidden,
          cards: r.querySelectorAll('.grid .card:not(.sk)').length,
          sel: r.querySelector('.tab[aria-selected="true"]')?.dataset.tab,
        };
      });
      const before = await state();
      // 打开设置后，点当前分类标签应该等于换一批
      await page.evaluate(() => document.getElementById('margin-root').shadowRoot.querySelector('.tab[data-tab=rcmd]')?.click());
      await sleep(1800);
      const after = await state();
      const m = [];
      if (before.backHidden !== true) m.push('back button visible before refreshing');
      if (after.backHidden !== false) m.push('back button missing after clicking the active tab');
      if (after.sel !== 'rcmd') m.push(`tab changed unexpectedly: ${after.sel}`);
      if (!after.cards) m.push('no cards after refreshing');
      await reset();
      return m;
    });

    await feature('home-filter', async () => {
      await reset();
      await seed({ filters: { ...filterOff, keywords: ['芯片'] } });
      await page.goto(HOME, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.getElementById('margin-root')?.shadowRoot?.querySelector('.grid .card:not(.sk)'), null, { timeout: 15_000 });
      await sleep(500);
      return page.evaluate(() => {
        const r = document.getElementById('margin-root')?.shadowRoot;
        const titles = [...r?.querySelectorAll('.grid .card .title') ?? []].map((e) => e.textContent ?? '');
        const miss = [];
        if (!titles.length) miss.push('no cards');
        if (titles.some((t) => t.includes('芯片'))) miss.push('keyword card still shown');
        if (titles.some((t) => t.includes('广告推广视频'))) miss.push('data-level ad shown with hideAds default');
        return miss;
      });
    });

    await feature('space-charge-badge', async () => {
      await reset();
      await page.goto('https://space.bilibili.com/2/video', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.getElementById('margin-root')?.shadowRoot?.querySelector('.grid .card:not(.sk)'), null, { timeout: 15_000 });
      await sleep(400);
      return page.evaluate(() => {
        const r = document.getElementById('margin-root')?.shadowRoot;
        const badges = [...r?.querySelectorAll('.grid .card .tag-charge') ?? []].map((e) => e.textContent ?? '');
        const miss = [];
        if (!badges.length) miss.push('no .tag-charge on space cards');
        if (badges.some((t) => t !== '充电专属')) miss.push('unexpected badge text');
        return miss;
      });
    });

    await feature('settings-btn', async () => {
      await page.goto('about:blank');
      await reset();
      await seed({ ytHome: true });
      await page.goto(HOME, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.getElementById('margin-root')?.shadowRoot?.querySelector('.hd-settings'), null, { timeout: 15_000 });
      await page.evaluate(() => {
        document.getElementById('margin-root')?.shadowRoot?.querySelector('.hd-settings')?.click();
      });
      await page.waitForFunction(() => document.getElementById('margin-root')?.shadowRoot?.querySelector('.home-order-row'), null, { timeout: 8_000 }).catch(() => {});
      const miss = await page.evaluate(() => {
        const r = document.getElementById('margin-root')?.shadowRoot;
        const m = [];
        if (!r?.querySelector('.hd-settings')) m.push('settings button missing');
        if (!r?.querySelector('.home-order-row')) m.push('settings panel not open');
        return m;
      });
      await page.goto('about:blank');
      await seed({ ytHome: false });
      return miss;
    });

    await feature('tag-filter-home', async () => {
      await reset();
      await seed({ filters: { ...filterOff, keywords: ['隐藏标签词'] } });
      await page.goto(HOME, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.getElementById('margin-root')?.shadowRoot?.querySelector('.grid .card:not(.sk)'), null, { timeout: 15_000 });
      await sleep(800);
      return page.evaluate(() => {
        const r = document.getElementById('margin-root')?.shadowRoot;
        const titles = [...r?.querySelectorAll('.grid .card .title') ?? []].map((e) => e.textContent ?? '');
        const miss = [];
        if (!titles.length) miss.push('no cards');
        // 《胡闹厨房》的标题不含屏蔽词，但视频标签是「隐藏标签词」
        if (titles.some((t) => t.includes('胡闹厨房'))) miss.push('tag-blocked card shown');
        return miss;
      });
    });

    await feature('space-no-filter', async () => {
      await reset();
      await seed({ filters: { ...filterOff, keywords: ['旗舰手机芯片'], minDuration: 600 } });
      await page.goto('https://space.bilibili.com/1/video', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.getElementById('margin-root')?.shadowRoot?.querySelector('.grid .card:not(.sk)'), null, { timeout: 15_000 });
      await sleep(600);
      const miss = await page.evaluate(() => {
        const r = document.getElementById('margin-root')?.shadowRoot;
        const cards = [...r?.querySelectorAll('.grid .card:not(.sk)') ?? []];
        const m = [];
        if (cards.length < 4) m.push(`space cards ${cards.length}`);
        if (cards.some((c) => c.hasAttribute('data-margin-filtered'))) m.push('space video filtered');
        if (!cards.some((c) => (c.querySelector('.title')?.textContent ?? '').includes('旗舰手机芯片'))) m.push('keyword-matched video hidden');
        return m;
      });
      await page.evaluate(() => {
        const r = document.getElementById('margin-root')?.shadowRoot;
        r?.querySelector('.sp-bar .tab[data-tab="dynamic"]')?.click();
      });
      await page.waitForFunction(() => document.getElementById('margin-root')?.shadowRoot?.querySelector('.dy:not(.sk)'), null, { timeout: 15_000 }).catch(() => {});
      await sleep(400);
      miss.push(...await page.evaluate(() => {
        const r = document.getElementById('margin-root')?.shadowRoot;
        const dyn = [...r?.querySelectorAll('.dy:not(.sk)') ?? []];
        if (!dyn.length) return ['space dynamics empty'];
        return dyn.some((d) => d.hasAttribute('data-margin-filtered')) ? ['space dynamic filtered'] : [];
      }));
      return miss;
    });

    await feature('native-tag-filter', async () => {
      await reset();
      await seed({ filters: { ...filterOff, keywords: ['隐藏标签词'] } });
      await page.goto(SEARCH, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-k="tag"]');
        return !!el && getComputedStyle(el).display === 'none';
      }, null, { timeout: 12_000 }).catch(() => {});
      await sleep(200);
      return page.evaluate(() => {
        const el = document.querySelector('[data-k="tag"]');
        const normal = document.querySelector('[data-k="normal"]');
        const m = [];
        if (!el || getComputedStyle(el).display !== 'none') m.push('tag card not hidden');
        if (normal && getComputedStyle(normal).display === 'none') m.push('normal card hidden');
        return m;
      });
    });

    await feature('refresh-keeps-scroll', async () => {
      // #39：滚到下面点「换一批」，列表重建后不该被拽回顶部
      await reset();
      await seed({ filters: filterOff });
      await page.goto(HOME, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => (document.getElementById('margin-root')?.shadowRoot?.querySelectorAll('.grid .card:not(.sk)').length ?? 0) >= 8, null, { timeout: 15_000 });
      const before = await page.evaluate(() => {
        const app = document.getElementById('margin-root')?.shadowRoot?.querySelector('.app');
        if (!app) return -1;
        app.scrollTop = app.scrollHeight;
        return app.scrollTop;
      });
      if (before < 300) return [`page too short to scroll: ${before}`];
      await page.evaluate(() => document.getElementById('margin-root')?.shadowRoot?.querySelector('.ghost.refresh:not(.back)')?.click());
      await page.waitForFunction(() => (document.getElementById('margin-root')?.shadowRoot?.querySelectorAll('.grid .card:not(.sk)').length ?? 0) >= 8, null, { timeout: 15_000 });
      await sleep(500);
      const after = await page.evaluate(() => document.getElementById('margin-root')?.shadowRoot?.querySelector('.app')?.scrollTop ?? 0);
      return after > before * 0.5 ? [] : [`scroll jumped to top: ${before} -> ${after}`];
    });

    await feature('extension-filters', async () => {
      await reset();
      await seed({ filters: { ...filterOff, keywords: ['芯片'] } });
      const miss = [];
      // 个人空间视频
      await page.goto('https://space.bilibili.com/2/video', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.getElementById('margin-root')?.shadowRoot?.querySelector('.grid .card:not(.sk)'), null, { timeout: 15_000 });
      await sleep(500);
      miss.push(...await page.evaluate(() => {
        const r = document.getElementById('margin-root')?.shadowRoot;
        const cards = [...r?.querySelectorAll('.grid .card:not(.sk)') ?? []];
        const titles = cards.filter((c) => !c.hasAttribute('data-margin-filtered')).map((c) => c.querySelector('.title')?.textContent ?? '');
        const out = [];
        if (!cards.length) out.push('space no cards');
        // v0.5x：进了 UP 主页就不再套用关键词 / 时长等全局过滤（只保留隐藏广告）
        if (!titles.some((t) => t.includes('芯片'))) out.push('space keyword card hidden (should be exempt)');
        if (cards.some((c) => c.hasAttribute('data-margin-filtered'))) out.push('space card filtered');
        return out;
      }));
      // 历史记录
      await page.goto('https://www.bilibili.com/account/history', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.getElementById('margin-root')?.shadowRoot?.querySelector('.hi-row:not(.sk)'), null, { timeout: 15_000 });
      await sleep(500);
      miss.push(...await page.evaluate(() => {
        const r = document.getElementById('margin-root')?.shadowRoot;
        const titles = [...r?.querySelectorAll('.hi-row:not([data-margin-filtered]) .hi-title') ?? []].map((e) => e.textContent ?? '');
        return titles.some((t) => t.includes('芯片')) ? ['history keyword row shown'] : [];
      }));
      // 动态首页的视频卡
      await page.goto('https://t.bilibili.com/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.getElementById('margin-root')?.shadowRoot?.querySelector('.dy'), null, { timeout: 15_000 });
      await sleep(500);
      miss.push(...await page.evaluate(() => {
        const r = document.getElementById('margin-root')?.shadowRoot;
        const titles = [...r?.querySelectorAll('.dy:not([data-margin-filtered]) .dy-vtitle') ?? []].map((e) => e.textContent ?? '');
        return titles.some((t) => t.includes('芯片')) ? ['feed keyword card shown'] : [];
      }));
      return miss;
    });

    await feature('native-filter-search', async () => {
      await reset();
      await seed({ filters: { keywords: ['屏蔽词'], ups: ['坏UP'], minViews: 1000, minDuration: 0 } });
      await page.goto(SEARCH, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-margin-filtered="native"]', { state: 'attached', timeout: 12_000 }).catch(() => {});
      await sleep(400);
      const miss = await page.evaluate(() => {
        const q = (k) => document.querySelector(`[data-k="${k}"]`);
        const hidden = (el) => !!el && getComputedStyle(el).display === 'none';
        const m = [];
        if (!q('normal') || hidden(q('normal'))) m.push('normal hidden');
        if (!q('keyword') || !hidden(q('keyword'))) m.push('keyword not hidden');
        if (!q('up') || !hidden(q('up'))) m.push('UP not hidden');
        if (!q('low') || !hidden(q('low'))) m.push('low views not hidden');
        if (!q('missing') || hidden(q('missing'))) m.push('missing views should pass');
        if (!q('ad') || !hidden(q('ad'))) m.push('search ad not hidden');
        for (const k of ['normal', 'keyword', 'up', 'low', 'missing', 'ad']) if (!q(k)?.isConnected) m.push(`${k} removed from DOM`);
        return m;
      });
      // 清空过滤后原生卡片恢复，且节点没有被删除
      await seed({ filters: filterOff });
      await page.waitForFunction(() => !document.querySelector('[data-k="keyword"]')?.hasAttribute('data-margin-filtered'), null, { timeout: 8000 }).catch(() => {});
      await sleep(300);
      miss.push(...await page.evaluate(() => {
        const el = document.querySelector('[data-k="keyword"]');
        const m = [];
        if (!el?.isConnected) m.push('keyword removed');
        if (el && (el.hasAttribute('data-margin-filtered') || getComputedStyle(el).display === 'none')) m.push('keyword still hidden after clear');
        return m;
      }));
      return miss;
    });

    await feature('native-filter-popular', async () => {
      await reset();
      await seed({ filters: { ...filterOff, keywords: ['屏蔽词'] } });
      await page.goto(POPULAR, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-margin-filtered="native"]', { state: 'attached', timeout: 12_000 }).catch(() => {});
      await sleep(300);
      return page.evaluate(() => {
        const q = (k) => document.querySelector(`[data-k="${k}"]`);
        const hidden = (el) => !!el && getComputedStyle(el).display === 'none';
        const m = [];
        if (!q('normal') || hidden(q('normal'))) m.push('popular normal hidden');
        if (!q('keyword') || !hidden(q('keyword'))) m.push('popular keyword not hidden');
        return m;
      });
    });

    await feature('ads-toggle', async () => {
      await reset();
      await seed({ hideAds: true });
      await page.goto(SEARCH, { waitUntil: 'domcontentloaded' });
      await sleep(1200);
      const miss = await page.evaluate(() => {
        const el = document.querySelector('[data-k="ad"]');
        return el && getComputedStyle(el).display === 'none' ? [] : ['ad not hidden when hideAds=true'];
      });
      await seed({ hideAds: false });
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-k="ad"]');
        return !!el && getComputedStyle(el).display !== 'none';
      }, null, { timeout: 8000 }).catch(() => {});
      miss.push(...await page.evaluate(() => {
        const el = document.querySelector('[data-k="ad"]');
        return el && getComputedStyle(el).display !== 'none' ? [] : ['ad still hidden when hideAds=false'];
      }));
      return miss;
    });

    await feature('ads-home-data', async () => {
      await reset();
      await seed({ hideAds: true });
      await page.goto(HOME, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.getElementById('margin-root')?.shadowRoot?.querySelector('.grid .card:not(.sk)'), null, { timeout: 15_000 });
      await sleep(600);
      const miss = await page.evaluate(() => {
        const r = document.getElementById('margin-root')?.shadowRoot;
        const titles = [...r?.querySelectorAll('.grid .card .title') ?? []].map((e) => e.textContent ?? '');
        return titles.some((t) => t.includes('广告推广视频')) ? ['data-level ad shown'] : [];
      });
      await seed({ hideAds: false });
      await page.waitForFunction(() => {
        const r = document.getElementById('margin-root')?.shadowRoot;
        return [...r?.querySelectorAll('.grid .card .title') ?? []].some((e) => (e.textContent ?? '').includes('广告推广视频'));
      }, null, { timeout: 8000 }).catch(() => {});
      miss.push(...await page.evaluate(() => {
        const r = document.getElementById('margin-root')?.shadowRoot;
        return [...r?.querySelectorAll('.grid .card .title') ?? []].some((e) => (e.textContent ?? '').includes('广告推广视频')) ? [] : ['data-level ad not revealed'];
      }));
      return miss;
    });

    await feature('reduced-motion', async () => {
      await reset();
      await seed({ reduceMotion: true });
      await page.goto(HOME, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.getElementById('margin-root')?.shadowRoot, null, { timeout: 15_000 });
      await page.waitForFunction(() => document.documentElement.classList.contains('margin-reduce'), null, { timeout: 8000 }).catch(() => {});
      await sleep(400);
      const miss = await page.evaluate(() => {
        const r = document.getElementById('margin-root')?.shadowRoot;
        const app = r?.querySelector('.app');
        const m = [];
        if (!document.documentElement.classList.contains('margin-reduce')) m.push('html class missing');
        if (!app?.classList.contains('margin-reduce')) m.push('shadow app class missing');
        const card = r?.querySelector('.grid .card:not(.sk)');
        if (card) {
          const d = parseFloat(getComputedStyle(card).animationDuration) || 0;
          if (d > 0.01) m.push(`card animation ${getComputedStyle(card).animationDuration}`);
        }
        return m;
      });
      await seed({ reduceMotion: false });
      await page.waitForFunction(() => !document.documentElement.classList.contains('margin-reduce'), null, { timeout: 8000 }).catch(() => {});
      miss.push(...await page.evaluate(() => document.documentElement.classList.contains('margin-reduce') ? ['class not removed'] : []));
      return miss;
    });

    await feature('message-remind', async () => {
      await reset();
      requests = [];
      await seed({ msgRemind: false });
      await page.goto(HOME, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3200);
      const miss = [];
      if (requests.some((u) => u.includes('msgfeed/unread') || u.includes('single_unread'))) miss.push('message unread still requested');
      if (requests.some((u) => u.includes('web-dynamic/v1/feed/all'))) miss.push('dynamic updates still requested');
      miss.push(...await page.evaluate(() => {
        const r = document.getElementById('margin-root')?.shadowRoot;
        const msg = [...r?.querySelectorAll('.et-btn') ?? []].find((b) => (b.getAttribute('aria-label') ?? '').startsWith('消息'));
        const dyn = [...r?.querySelectorAll('.et-btn') ?? []].find((b) => (b.getAttribute('aria-label') ?? '').startsWith('动态'));
        return [
          ...(msg?.querySelector('.et-badge') ? ['message badge still shown'] : []),
          ...(dyn?.querySelector('.et-badge') ? ['dynamic badge still shown'] : []),
        ];
      }));
      // 消息页自身仍要显示未读数（开关只控制主动提醒）
      requests = [];
      await page.goto(MESSAGE, { waitUntil: 'domcontentloaded' });
      // 未读数要等 /nav 返回后才请求；CI 上伪造接口偶尔要 2~3 秒才回 /nav，固定等 2.2s 会误报，改为等计数出现（最多 10s）
      await page.waitForFunction(() => {
        const r = document.getElementById('margin-root')?.shadowRoot;
        return [...r?.querySelectorAll('.ms-n') ?? []].some((n) => n.textContent?.trim());
      }, null, { timeout: 10_000 }).catch(() => {});
      if (!requests.some((u) => u.includes('msgfeed/unread') || u.includes('single_unread'))) miss.push('message page own unread not requested');
      miss.push(...await page.evaluate(() => {
        const r = document.getElementById('margin-root')?.shadowRoot;
        const counts = [...r?.querySelectorAll('.ms-n') ?? []].map((n) => n.textContent?.trim()).filter(Boolean);
        return counts.length ? [] : ['message page counts empty'];
      }));
      return miss;
    });

    await feature('wide-mode', async () => {
      await reset();
      await seed({ wide: true });
      await page.goto(WATCH, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.documentElement.classList.contains('margin-wide') &&
        document.querySelector('.bpx-player-container')?.getAttribute('data-screen') === 'wide', null, { timeout: 12_000 }).catch(() => {});
      const miss = await page.evaluate(() => {
        const m = [];
        if (!document.documentElement.classList.contains('margin-wide')) m.push('margin-wide missing');
        if (document.querySelector('.bpx-player-container')?.getAttribute('data-screen') !== 'wide') m.push('player not wide');
        return m;
      });
      await seed({ wide: false });
      await page.goto(WATCH, { waitUntil: 'domcontentloaded' });
      await sleep(2500);
      miss.push(...await page.evaluate(() => {
        const m = [];
        if (document.documentElement.classList.contains('margin-wide')) m.push('margin-wide still present');
        if (document.querySelector('.bpx-player-container')?.getAttribute('data-screen') !== 'normal') m.push('player auto-widened');
        return m;
      }));
      return miss;
    });

    await reset();
  }

  // 模块挂载失败时回到原版：用调试钩子 margin:test-throw 让模块故意抛错
  if (theme === THEMES[0] && !ONLY) for (const [name, url, key] of [
    ['fallback-home', 'https://www.bilibili.com/', 'home'],
    ['fallback-watch', 'https://www.bilibili.com/video/BV1mdxN68E7F/', 'watch'],
    ['fallback-space', 'https://space.bilibili.com/2/video', 'space'],
  ]) {
    errors = [];
    let miss = [];
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.evaluate((k) => localStorage.setItem('margin:test-throw', k), key);
      await page.goto(url, { waitUntil: 'load' });
      await sleep(2500);
      miss = await page.evaluate(() => {
        const m = [];
        for (const id of ['margin-root', 'margin-watch-top', 'margin-hide', 'margin-watch-css']) if (document.getElementById(id)) m.push(`#${id} still present`);
        if (document.documentElement.classList.contains('margin-skin')) m.push('html.margin-skin still present');
        if (!document.body || getComputedStyle(document.body).display === 'none') m.push('native body hidden');
        localStorage.removeItem('margin:test-throw');
        return m;
      });
    } catch (e) { miss = [`goto: ${e.message}`]; }
    const expected = errors.filter((e) => e.includes('test-throw'));
    const unexpected = errors.filter((e) => !e.includes('test-throw'));
    if (!expected.length) miss.push('no [MARGIN] mount-failure log');
    const ok = !miss.length && !unexpected.length;
    if (!ok) failed++;
    results.push({ theme, name, ok, miss, errors: unexpected });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${theme.padEnd(5)} ${name.padEnd(15)}${miss.length ? ` problems: ${miss.join(', ')}` : ' native page restored'}${unexpected.length ? `\n      errors: ${unexpected.join('\n              ')}` : ''}`);
  }

  // 足迹热力图：不到 60 秒的日子不点亮；没有本机记录的日子用历史估算，提示里标明来源
  if (sw && theme === THEMES[0] && (!ONLY || ONLY.includes('home'))) {
    let miss = [];
    try {
      await sw.evaluate(async () => {
        const p = (n) => String(n).padStart(2, '0'), k = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
        const a = {}, ago = (i) => { const d = new Date(); d.setDate(d.getDate() - i); return k(d); };
        a[ago(2)] = { s: 1800, f: '08:30' }; a[ago(3)] = { s: 30, f: '09:00' }; a[ago(4)] = { s: 0, h: 1200, hf: '21:00' };
        await chrome.storage.local.set({ 'margin:activity': a, 'margin:activity-bf': Date.now() });
      });
      await page.goto('https://www.bilibili.com/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.getElementById('margin-root')?.shadowRoot?.querySelector('.fp-cells .fp-cell'), null, { timeout: 15000 });
      await sleep(800);
      miss = await page.evaluate(() => {
        const r = document.getElementById('margin-root').shadowRoot, m = [];
        const p = (n) => String(n).padStart(2, '0'), ago = (i) => { const d = new Date(); d.setDate(d.getDate() - i); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
        const cell = (i) => r.querySelector(`.fp-cell[data-k="${ago(i)}"]`);
        if (cell(3)?.dataset.l !== '0') m.push('30s day should not light');
        if (cell(2)?.dataset.l === '0') m.push('30min local day should light');
        if (cell(4)?.dataset.l === '0') m.push('history-only day should light');
        const tip = (i) => { cell(i).dispatchEvent(new PointerEvent('pointerover', { bubbles: true })); return r.querySelector('.fp-tip').textContent; };
        if (!tip(2).includes('本机记录')) m.push('tooltip local source');
        if (!tip(4).includes('历史估算')) m.push('tooltip history source');
        return m;
      });
    } catch (e) { miss = [`footprint-ui: ${e.message}`]; }
    const ok = !miss.length;
    if (!ok) failed++;
    results.push({ theme, name: 'footprint-ui', ok, miss });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${theme.padEnd(5)} footprint-ui${miss.length ? ` problems: ${miss.join(', ')}` : ' 60s threshold + source tooltip'}`);
  }

  // 足迹计时在后台 service worker：打开过页面后今天应该有首次打开时间
  if (sw) {
    const today = await sw.evaluate(async () => {
      const d = new Date(), p = (n) => String(n).padStart(2, '0');
      const k = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      return (await chrome.storage.local.get('margin:activity'))['margin:activity']?.[k] ?? null;
    }).catch((e) => ({ error: e.message }));
    const ok = !!today?.f;
    if (!ok) failed++;
    results.push({ theme, name: 'footprint-sw', ok, today });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${theme.padEnd(5)} footprint service worker recorded first open: ${JSON.stringify(today)}`);
  } else {
    failed++;
    results.push({ theme, name: 'service-worker', ok: false });
    console.log(`FAIL ${theme} background service worker not running`);
  }
  await ctx.close();
  rmSync(dir, { recursive: true, force: true });
}

writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2));
console.log(failed ? `\n${failed} check(s) failed` : '\nall smoke checks passed');
process.exit(failed ? 1 : 0);
