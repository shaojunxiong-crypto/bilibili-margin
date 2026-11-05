/**
 * 入口脚本（document_start 注入所有 B 站页面）：只做路由判断、读设置、注册字体、足迹心跳、
 * 先藏原版 / 拦原版脚本。各页面的界面代码按路由从 dist/pages/*.js 动态 import（和 flux.js 同一套做法），
 * 不再把整站代码塞进一个 447KB 的 content.js。
 */
import { loadSettings, onSettingsChange, type Settings } from '../shared/settings';
import { startTracking } from './footprint/beat';
import { injectFonts } from './fonts';
import { muteNative, setGuard, guardEnabled } from './native-guard';
import type { SkinKind } from './ui/watch';
import watchCss from './watch.css?inline';
import pagesCss from './pages.css?inline';
import detailCss from './detail.css?inline';
import liveCss from './live.css?inline';
import globalCss from './global.css?inline';
import { setUserReducedMotion } from './motion';
import { startNativeFilter } from './native-filter';

// Firefox：内容脚本自带的 fetch 以扩展身份发请求，B 站接口收不到登录 cookie（一直显示未登录）。
// Firefox 另给了页面身份的 content.fetch，B 站自家域名的请求改走它；其他域名（天气等）照旧。Chrome 没有 content，不受影响。
const ffPage = (globalThis as { content?: { fetch?: typeof fetch } }).content;
if (typeof ffPage?.fetch === 'function') {
  const extFetch = globalThis.fetch.bind(globalThis);
  const pageFetch = ffPage.fetch.bind(ffPage);
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return /^https:\/\/([\w-]+\.)*(bilibili\.com|hdslb\.com|biliapi\.net)\//.test(url) ? pageFetch(input, init) : extFetch(input, init);
  };
}

type Pages = {
  home: typeof import('./pages/home');
  watch: typeof import('./pages/watch');
  space: typeof import('./pages/space');
  message: typeof import('./pages/message');
  history: typeof import('./pages/history');
  feed: typeof import('./pages/feed');
  detail: typeof import('./pages/detail');
};
/** 按需加载页面模块；content script 不能是 ES module，但可以动态 import 扩展里的 ES 模块 */
const load = <K extends keyof Pages>(name: K): Promise<Pages[K]> => import(/* @vite-ignore */ chrome.runtime.getURL(`pages/${name}.js`));

const HIDE_CSS = 'html{background:#111!important;overflow:hidden!important}body{display:none!important}@media (prefers-color-scheme: light){html{background:#f5f4f1!important}}';

/** 文档级全局 CSS：过滤标记、广告规则、减少动画；和换皮 CSS 分开注入 */
const GLOBAL_CSS_ID = 'margin-global-css';
function mountGlobalCss(): void {
  if (document.getElementById(GLOBAL_CSS_ID)) return;
  const st = document.createElement('style');
  st.id = GLOBAL_CSS_ID;
  st.textContent = globalCss;
  document.documentElement.append(st);
}

/** 设置开关映射到文档级 class；HTML 只负责命中 CSS，具体逻辑在各自组件里 */
function applyGlobalUi(s: Settings): void {
  document.documentElement.classList.toggle('margin-ads-hide', s.enabled && s.hideAds);
  setUserReducedMotion(s.enabled && s.reduceMotion);
}
/** document_start 时先把原页面藏起来，避免闪一下原版 */
function hideOriginal(): HTMLStyleElement {
  const hide = document.createElement('style');
  hide.id = 'margin-hide';
  hide.textContent = HIDE_CSS;
  document.documentElement.append(hide);
  return hide;
}

const isHome = () => location.hostname === 'www.bilibili.com' && /^\/(?:[a-z]{2}(?:-[A-Za-z]{2,4})?\/?)?(?:index\.html)?$/.test(location.pathname);

const isWatch = () => location.hostname === 'www.bilibili.com' && /^\/(?:[a-z]{2}(?:-[A-Za-z]{2,4})?\/)?(?:video\/(?:BV|av)|list\/(?:ml\d|watchlater|\d))/i.test(location.pathname);
const isSearch = () => location.hostname === 'search.bilibili.com';
/** 直播间（v0.47.2）：live.bilibili.com/房间号，只在顶层页面；活动页里嵌的 blanc 房间不管 */
const isLive = () => location.hostname === 'live.bilibili.com' && /^\/\d+\/?$/.test(location.pathname) && window.top === window;
/** 其他接管的页面：除首页、播放页外的 B 站页面（空间、番剧、动态、历史、专栏、稍后再看…） */
const SKIP = /^\/(?:[a-z]{2}(?:-[A-Za-z]{2,4})?\/)?(?:blackboard|correspond|v\/topic|festival|bnj|ssr)/;
const isPage = () => /^(www|space|t)\.bilibili\.com$/.test(location.hostname) && !SKIP.test(location.pathname) && window.top === window;
const LOC = '(?:[a-z]{2}(?:-[A-Za-z]{2,4})?/)?';
const spaceMatch = () => location.hostname === 'space.bilibili.com' ? location.pathname.match(new RegExp(`^/${LOC}(\\d+)(?:/(video|upload/video|dynamic|upload))?/?$`)) : null;
const isMessage = () => location.hostname === 'message.bilibili.com' && window.top === window;
const isHistory = () => location.hostname === 'www.bilibili.com' && /^\/(?:account\/)?history\/?$/.test(location.pathname) && window.top === window;
const isFeed = () => location.hostname === 't.bilibili.com' && /^\/?$/.test(location.pathname) && window.top === window;
/** 详情页：单条动态 / 图文 opus / 专栏 / 番剧播放（和 ui/detail.ts detailKind 保持一致） */
type DetailKind = 'opus' | 'dyn' | 'read' | 'bangumi';
function detailKind(): DetailKind | null {
  const h = location.hostname, p = location.pathname;
  if (h === 't.bilibili.com' && /^\/\d+\/?$/.test(p)) return 'dyn';
  if (h !== 'www.bilibili.com') return null;
  const m = p.match(new RegExp(`^/${LOC}(opus/\\d|read/cv\\d|bangumi/play/(?:ep|ss)\\d)`));
  return m ? (m[1].startsWith('opus') ? 'opus' : m[1].startsWith('read') ? 'read' : 'bangumi') : null;
}
const offByUrl = () => new URLSearchParams(location.search).get('margin') === 'off';

/**
 * 播放页 / 搜索页等换皮页面的全局样式。入口脚本里同步挂上（用 localStorage 里上次设置的镜像判断开没开），
 * 不等页面模块加载，避免先闪一下原版。
 */
const SKIN_KEY = 'margin:skin';
function skinMirror(): string | null { try { return localStorage.getItem(SKIN_KEY); } catch { return null; } }
function setSkinMirror(v: string): void { try { if (skinMirror() !== v) localStorage.setItem(SKIN_KEY, v); } catch { /* 隐私模式 */ } }
function skinStyle(kind: SkinKind, theme: string): HTMLStyleElement {
  const de = document.documentElement;
  de.classList.add('margin-skin', `margin-${kind}`);
  const dk = kind === 'page' ? detailKind() : null;
  if (dk) { de.classList.add('margin-detail'); de.dataset.marginDetail = dk; }
  de.dataset.marginTheme = theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
  let st = document.getElementById('margin-watch-css') as HTMLStyleElement | null;
  if (!st) {
    st = document.createElement('style');
    st.id = 'margin-watch-css';
    st.textContent = watchCss + '\n' + pagesCss + '\n' + detailCss + '\n' + liveCss;
    de.append(st);
  }
  return st;
}
function unskin(kind: SkinKind): void {
  const de = document.documentElement;
  document.getElementById('margin-watch-css')?.remove();
  de.classList.remove('margin-skin', `margin-${kind}`, 'margin-has-bg', 'margin-detail', 'margin-detail-narrow');
  delete de.dataset.marginTheme;
  delete de.dataset.marginDetail;
}

async function startWatch(kind: SkinKind = 'watch'): Promise<void> {
  if (sessionStorage.getItem('margin:off') || offByUrl()) { backPill(); return; }
  // 设置和页面模块并行读取
  const mod = load('watch');
  mod.catch(() => {});
  const mirror = skinMirror();
  if (mirror && mirror !== '0') skinStyle(kind, mirror);
  const settings = await loadSettings();
  // 屏蔽词在原生页面独立生效；即使关闭了「其他页面重设计」，只开过滤也能用
  if (settings.enabled && kind !== 'live') startNativeFilter(kind, settings);
  const on = settings.enabled && settings.watch;
  setSkinMirror(on ? settings.theme : '0');
  if (!on) { unskin(kind); return; }
  skinStyle(kind, settings.theme);
  const skin = await guarded('watch', () => mod.then((m) => new m.WatchSkin(settings, kind)), () => unskin(kind));
  if (!skin) return;
  // 详情页：右侧作者栏 / 目录 / 操作区按需加载；出错只影响侧栏，换皮照常
  const dk = kind === 'page' ? detailKind() : null;
  if (dk) {
    load('detail').then((m) => m.mountDetail(dk, skin.filter)).catch((e) => {
      console.error('[MARGIN] 详情页侧栏加载失败：', e);
      document.getElementById('margin-aside')?.remove();
      document.documentElement.classList.add('margin-detail-narrow');
    });
  }
  if (kind === 'page' && location.hostname === 'space.bilibili.com') spaceNative();
  onSettingsChange((next, prev) => {
    if (next.enabled !== prev.enabled || next.watch !== prev.watch) location.reload();
    else skin.update(next);
  });
}

/**
 * 空间页里映间没接管的子页（收藏夹、追番、关注/粉丝、设置…）用 B 站原生页面 + 映间配色（v0.50.1，GitHub #30）。
 * 原生空间是单页应用：在这里点「主页 / 动态 / 投稿」只改地址不刷新，映间的空间页就挂不上，要刷新才有样式。
 * 地址一变成映间接管的空间路径就整页跳转。Chrome 用 Navigation API，Firefox 没有，退回到地址轮询（只比字符串，很便宜）。
 */
function spaceNative(): void {
  document.documentElement.classList.add('margin-space-native');
  // 原生空间子页：拦截收藏夹 / 历史 / 稍后再看的入口，改成开映间抽屉（#52 后续）
  void import('./space-hooks').then((mod) => mod.installSpaceHooks()).catch(() => { /* 抽屉可缺省 */ });
  let last = location.href;
  const check = (href: string) => {
    if (href === last) return;
    last = href;
    const u = new URL(href, location.href);
    if (u.hostname !== 'space.bilibili.com') return;
    if (new RegExp(`^/${LOC}(\\d+)(?:/(video|upload/video|dynamic|upload))?/?$`).test(u.pathname)) location.assign(u.href);
  };
  const nav = (window as unknown as { navigation?: EventTarget }).navigation;
  if (nav) nav.addEventListener('navigatesuccess', () => check(location.href));
  else setInterval(() => check(location.href), 400);
  addEventListener('popstate', () => check(location.href));
}

/**
 * 点了「原版」之后这一页是 B 站原版，左下角留一个小按钮可以切回映间（v0.47.2，GitHub #6：回去之后没按钮切回来）。
 * 只在用户手动切回原版时出现；?margin=off 的链接不显示。
 */
function backPill(): void {
  const manual = sessionStorage.getItem('margin:off') === '1';
  sessionStorage.removeItem('margin:off');
  if (!manual || window.top !== window) return;
  const put = () => {
    if (document.getElementById('margin-back')) return;
    const b = document.createElement('button');
    b.id = 'margin-back';
    b.type = 'button';
    b.textContent = '回到映间';
    b.title = '刚才切回了 B 站原版，点这里换回映间';
    b.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2147483000;height:32px;padding:0 14px;border:0;border-radius:16px;'
      + 'background:#17181a;color:#fff;font:500 13px/32px system-ui,"PingFang SC","Microsoft YaHei",sans-serif;cursor:pointer;'
      + 'box-shadow:0 0 0 1px rgb(255 255 255/.12),0 4px 12px rgb(0 0 0/.18);opacity:.88;transition:opacity .15s';
    b.onmouseenter = () => { b.style.opacity = '1'; };
    b.onmouseleave = () => { b.style.opacity = '.88'; };
    b.onclick = () => location.reload();
    document.body.append(b);
  };
  if (document.body) put(); else addEventListener('DOMContentLoaded', put, { once: true });
}

/** 键盘导航模式：按 Tab 后在映间的 Shadow DOM 宿主上标记 data-kbd，指针一按就撤销；样式里用 :host([data-kbd]) 给输入框外层画聚焦环 */
function trackKeyboard(): void {
  const hosts = () => ['margin-root', 'margin-watch-top'].map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
  addEventListener('keydown', (e) => { if (e.key === 'Tab') hosts().forEach((x) => { if (!('kbd' in x.dataset)) x.dataset.kbd = ''; }); }, true);
  addEventListener('pointerdown', () => hosts().forEach((x) => { if ('kbd' in x.dataset) delete x.dataset.kbd; }), true);
}

async function start(): Promise<void> {
  mountGlobalCss();
  // hideAds 默认开启：先在 document_start 挂上，避免等异步设置时闪一下广告
  if (!offByUrl() && !sessionStorage.getItem('margin:off')) document.documentElement.classList.add('margin-ads-hide');
  injectFonts();
  trackKeyboard();
  startTracking(); // 足迹在所有 B 站页面记录，不只首页
  if (isWatch()) return startWatch();
  const sm = spaceMatch();
  // 空间页的投稿接口依赖原版脚本写的指纹 cookie，不拦会 412
  if (sm) return takeover(load('space'), (m, st) => new m.SpaceApp(st, Number(sm[1]), sm[2] === 'dynamic' ? 'dynamic' : 'video'), false);
  if (isMessage()) return takeover(load('message'), (m, st) => new m.MessageApp(st));
  if (isHistory()) return takeover(load('history'), (m, st) => new m.HistoryApp(st));
  if (isFeed()) return takeover(load('feed'), (m, st) => new m.FeedApp(st));
  if (isSearch()) return startWatch('search');
  if (isLive()) return startWatch('live');
  if (!isHome() && isPage()) return startWatch('page');
  if (!isHome()) return;
  if (sessionStorage.getItem('margin:off') || offByUrl()) { backPill(); return; }
  // Hide the original page as early as possible to avoid a flash.
  const hide = hideOriginal();
  const unmute = muteNative();
  const mod = load('home');
  mod.catch(() => {});

  const settings = await loadSettings();
  if (!settings.enabled) { hide.remove(); unmute(); return disabledAfterMute(); }
  setGuard(true);

  const app = await guarded('home', () => mod.then((m) => {
    const a = new m.MarginApp(settings);
    document.documentElement.append(a.host);
    return a;
  }), () => restoreNative(hide, guardEnabled()));
  if (!app) return;

  onSettingsChange((next, prev) => {
    if (next.enabled !== prev.enabled) location.reload();
    else app.update(next);
  });
}

/** 接管式页面：先藏原版，再挂映间页面；设置里关掉「其他页面重设计」就保留原版 */
async function takeover<M>(mod: Promise<M>, make: (m: M, s: Settings) => { shell: { host: HTMLElement }; update(s: Settings): void }, mute = true): Promise<void> {
  mod.catch(() => {});
  if (sessionStorage.getItem('margin:off') || offByUrl()) { backPill(); return; }
  const hide = hideOriginal();
  const unmute = mute ? muteNative() : () => {};
  const settings = await loadSettings();
  if (!settings.enabled || !settings.watch) { hide.remove(); unmute(); return mute ? disabledAfterMute() : undefined; }
  if (mute) setGuard(true);
  const name = location.hostname.split('.')[0] + location.pathname;
  const page = await guarded(name, () => mod.then((m) => {
    const p = make(m, settings);
    document.documentElement.append(p.shell.host);
    return p;
  }), () => restoreNative(hide, mute && guardEnabled()));
  if (!page) return;
  onSettingsChange((next, prev) => {
    if (next.enabled !== prev.enabled || next.watch !== prev.watch) location.reload();
    else page.update(next);
  });
}

/**
 * 页面模块加载或挂载出错时：记日志、拆掉映间注入的界面，把这一页还给 B 站原版，而不是留一张空白页。
 * 调试钩子：localStorage['margin:test-throw'] 写页面名（home / watch / www/account/history …）时故意抛错，冒烟测试用。
 */
async function guarded<T>(name: string, mount: () => Promise<T>, restore: () => void): Promise<T | null> {
  try {
    let t: string | null = null;
    try { t = localStorage.getItem('margin:test-throw'); } catch { /* ignore */ }
    if (t && name.startsWith(t)) throw new Error(`margin:test-throw ${name}`);
    return await mount();
  } catch (e) {
    console.error('[MARGIN] 页面模块挂载失败，这一页回到 B 站原版：', name, e);
    for (const id of ['margin-root', 'margin-watch-top', 'margin-bg']) document.getElementById(id)?.remove();
    try { restore(); } catch { /* ignore */ }
    return null;
  }
}

/** 撤掉遮罩；原版脚本已经被拦掉的话只能刷新一次（只这一次加载不接管），让原版完整加载 */
function restoreNative(hide: HTMLStyleElement, muted: boolean): void {
  hide.remove();
  document.documentElement.style.removeProperty('background');
  // 挂载失败时连全局过滤/减少动画状态一起撤掉，真正回到原版
  document.documentElement.classList.remove('margin-ads-hide', 'margin-reduce');
  document.getElementById('margin-global-css')?.remove();
  if (!muted) return;
  sessionStorage.setItem('margin:off', 'err');
  location.reload();
}

/** 映间被关掉但原版脚本已被拦：记下来，刷新一次让原版完整加载 */
function disabledAfterMute(): void {
  if (!guardEnabled()) return;
  setGuard(false);
  location.reload();
}

/**
 * 字体（v0.46 标题字体；v0.47 加自定义正文字体、数字等宽开关）：在 html 上设继承变量，
 * 首页 / 接管页（Shadow DOM）和换皮页的 --sans / --mono / --serif 都先读它们。
 */
const SANS = '"Geist", "Margin Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
function applyFont(s: Settings): void {
  const de = document.documentElement;
  const on = s.enabled;
  const custom = on && s.bodyFont ? `"${s.bodyFont}", ` : '';
  const sans = custom + SANS;
  const set = (k: string, v: string | null) => { if (v) de.style.setProperty(k, v); else de.style.removeProperty(k); };
  set('--margin-sans', custom ? sans : null);
  set('--margin-title', on && s.titleFont === 'sans' ? sans : null);
  set('--margin-mono', on && !s.monoNum ? sans : null);
  // 视频 CDN 节点：页面主环境的 cdn.js 同步读 localStorage（v0.47.2）
  try { if (on && s.cdn) localStorage.setItem('margin:cdn', s.cdn); else localStorage.removeItem('margin:cdn'); } catch { /* 隐私模式 */ }
  set('--margin-zoom', on && s.zoom !== 100 ? String(s.zoom / 100) : null);
  set('--margin-rk', on && s.radius !== 100 ? String(s.radius / 100) : null);
  set('--margin-cfs', on && s.commentSize !== 14 ? `${s.commentSize}px` : null);
}
if (!offByUrl() && !sessionStorage.getItem('margin:off')) {
  loadSettings().then((s) => { applyFont(s); applyGlobalUi(s); }).catch(() => {});
  onSettingsChange((n) => { applyFont(n); applyGlobalUi(n); });
}

/**
 * 扩展冲突提示（v0.47，评论区：Edge 上只有搜索页生效）：BewlyBewly 之类的整站重做扩展也在 document_start 接管页面，
 * 两个一起开会互相盖掉 / 互相拦脚本。检测到就在页面顶端提示一次，可以关掉不再提示。
 */
const CONFLICTS: [string, () => boolean][] = [
  ['BewlyBewly', () => !!document.getElementById('bewly') || document.documentElement.classList.contains('bewly-design')],
];
function checkConflicts(): void {
  if (window.top !== window) return;
  const KEY = 'margin:conflict-ok';
  const run = () => {
    const hit = CONFLICTS.filter(([, f]) => { try { return f(); } catch { return false; } }).map(([n]) => n);
    if (!hit.length) return;
    try { if (localStorage.getItem(KEY) === hit.join(',')) return; } catch { /* ignore */ }
    console.warn('[MARGIN] 检测到同类扩展：', hit.join('、'));
    const bar = document.createElement('div');
    bar.setAttribute('role', 'alert');
    bar.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483647;display:flex;gap:12px;align-items:center;max-width:min(640px,calc(100vw - 32px));padding:12px 16px;border-radius:14px;background:#17181a;color:#fff;font:13px/1.5 system-ui,"Microsoft YaHei",sans-serif;box-shadow:0 8px 32px rgb(0 0 0/.28)';
    const text = document.createElement('span');
    text.textContent = `检测到 ${hit.join('、')} 也在改 B 站页面，和映间同时开启会互相覆盖，部分页面会显示成原版。请在浏览器扩展管理里停用其中一个。`;
    const close = document.createElement('button');
    close.type = 'button'; close.textContent = '知道了';
    close.style.cssText = 'flex:none;border:0;border-radius:99em;padding:6px 12px;background:#fff;color:#17181a;font:inherit;cursor:pointer';
    close.onclick = () => { try { localStorage.setItem(KEY, hit.join(',')); } catch { /* ignore */ } bar.remove(); };
    bar.append(text, close);
    document.documentElement.append(bar);
  };
  const later = () => setTimeout(run, 2500);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', later, { once: true }); else later();
}
if (!offByUrl()) checkConflicts();

start().catch((e) => console.error("[MARGIN]", e));
