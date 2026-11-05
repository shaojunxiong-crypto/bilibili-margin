import { every } from '../sched';
import type { Settings } from '../../shared/settings';
import { saveSettings } from '../../shared/settings';
import { h, ICONS, guardTyping } from './dom';
import { toast } from './controls';
import { addWatchLater } from '../api/search';
import { createFavorites } from './favorites';
import { createHeader, type Header, SITE_LINKS } from './header';
import { attachPreview } from './preview';
import { createSettingsPanel, type SettingsPanel } from './settings-panel';
import type { Sheet } from './sheet';
import { attachGlass, filtersIn } from './liquid-glass';
import { createFloatingMenu } from './floating-menu';
import { createCommandPalette, type Command } from './command-palette';
import { createContextMenu } from './context-menu';
import { bindCardMenu } from './card-menu';
import { createLaterDrawer } from './drawer';
import { createScrollRuler } from './scroll-ruler';
import { skinComments } from './comment-skin';
import css from '../styles/index';
import { BackgroundLayer } from '../bg/background';
import { startTriple } from './triple';
import { startWatchCard } from './watch-card';
import { reducedMotion } from '../motion';
import { FilterRuntime } from '../filter-runtime';
import { openBili } from '../navigation';

export type SkinKind = 'watch' | 'search' | 'page' | 'live';

/**
 * 播放页：不替换 B 站原生播放器、弹幕、评论，只做两件事——
 * 1) 换上和首页一致的顶栏（Shadow DOM）；
 * 2) 用全局样式重写 B 站的主题变量和版式（变量能穿透评论区的 Shadow DOM）。
 */
export class WatchSkin {
  readonly host: HTMLElement;
  readonly filter: FilterRuntime;
  private bg = new BackgroundLayer();
  private bgApp: HTMLElement;
  private app: HTMLElement;
  private head: Header;
  private panel: SettingsPanel;
  private fav: Sheet;
  private screenSync?: () => void;
  private autoDone = '';
  private wideDone = '';
  private media = matchMedia('(prefers-color-scheme: dark)');

  constructor(private settings: Settings, private kind: SkinKind = 'watch') {
    const de = document.documentElement;
    const isWatch = kind === 'watch';
    // 全局换皮样式（watch.css + pages.css）由入口脚本在 document_start 挂上（见 main.ts skinStyle），这里只补类名
    de.classList.add('margin-skin', `margin-${kind}`);

    // Shader 背景：独立宿主，fixed 铺满、z-index -1，在 B 站内容之下、画布底色之上
    const bgHost = h('div', { id: 'margin-bg' });
    const bgRoot = bgHost.attachShadow({ mode: 'open' });
    bgRoot.append(h('style', {}, css));
    this.bgApp = h('div', { class: 'app bgwrap' }, this.bg.el);
    bgRoot.append(this.bgApp);
    de.append(bgHost);

    this.host = h('div', { id: 'margin-watch-top' });
    const root = this.host.attachShadow({ mode: 'open' });
    guardTyping(this.host);
    root.append(h('style', {}, css));
    // 搜索页本身有大号搜索框，顶栏那个就不再重复（Ctrl+K / / 仍可唤出命令面板）
    if (kind === 'search') root.append(h('style', {}, '.top .search { visibility: hidden; pointer-events: none; }'));

    this.filter = new FilterRuntime(settings);
    this.panel = createSettingsPanel(() => this.settings, () => this.bg.shader);
    this.fav = createFavorites((g) => attachPreview(g, () => this.settings.hoverPreview), () => this.settings.favDirect, this.filter);
    const open = (u: string) => openBili(u);
    const clickSel = (sel: string) => (document.querySelector(sel) as HTMLElement | null)?.click();
    const later = createLaterDrawer(() => this.app, this.filter);
    const watchCmds: Command[] = isWatch ? [
      { id: 'w-top', title: '回到顶部', cat: '操作', icon: ICONS.top, run: () => scrollTo({ top: 0, behavior: 'smooth' }) },
      { id: 'w-comments', title: '看评论', cat: '跳转', icon: ICONS.message, keys: ['评论'], run: () => document.querySelector('#commentapp, bili-comments, .comment-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) },
      { id: 'w-web', title: '网页全屏', cat: '操作', icon: ICONS.image, keys: ['全屏'], run: () => clickSel('.bpx-player-ctrl-web') },
      { id: 'w-wide', title: '宽屏模式', cat: '操作', icon: ICONS.image, keys: ['宽屏'], run: () => clickSel('.bpx-player-ctrl-wide') },
      { id: 'w-later', title: '把这个视频加入稍后再看', cat: '操作', icon: ICONS.later, keys: ['稍后'], run: async () => { const bv = location.href.match(/BV\w+/)?.[0]; if (!bv) return; const r = await addWatchLater(bv); toast(this.app, r.msg, r.ok ? { label: '查看', run: () => later.open() } : undefined); } },
      { id: 'w-copy', title: '复制视频链接', cat: '操作', icon: ICONS.link, keys: ['分享'], run: () => navigator.clipboard.writeText(location.href.split('?')[0]).then(() => toast(this.app, '链接已复制')) },
    ] : [{ id: 'w-top', title: '回到顶部', cat: '操作', icon: ICONS.top, run: () => scrollTo({ top: 0, behavior: 'smooth' }) }];
    const palette = createCommandPalette([
      ...watchCmds,
      { id: 'fav', title: '打开收藏夹', cat: '操作', icon: ICONS.fav, keys: ['收藏'], run: () => this.fav.open() },
      { id: 'theme', title: '切换亮色 / 暗色', cat: '操作', icon: ICONS.moon, keys: ['主题', '夜间'], run: () => this.toggleTheme() },
      { id: 'settings', title: '打开设置', cat: '操作', icon: ICONS.gear, run: () => this.panel.sheet.open() },
      { id: 'home', title: '回首页', cat: '跳转', icon: ICONS.logo, run: () => { location.href = 'https://www.bilibili.com/'; } },
      { id: 'later', title: '稍后再看', cat: '跳转', icon: ICONS.later, keys: ['watchlater'], run: () => later.open() },
      { id: 'history', title: '观看历史', cat: '跳转', icon: ICONS.history, run: () => open('https://www.bilibili.com/history') },
      { id: 'off', title: '本次回到 B 站原版', cat: '操作', icon: ICONS.exit, keys: ['原版'], run: () => { sessionStorage.setItem('margin:off', '1'); location.reload(); } },
    ]);
    const cm = createContextMenu();
    this.head = createHeader({
      onTheme: () => this.toggleTheme(),
      onSettings: () => this.panel.sheet.open(),
      onSearch: (q) => palette.open(q),
      msgRemind: () => this.settings.msgRemind,
      filter: this.filter,
      tabs: [
        ...SITE_LINKS,
        'separator',
        { title: '收藏', icon: ICONS.fav, run: () => this.fav.open() },
        { title: '稍后', icon: ICONS.later, run: () => later.open() },
        { title: '原版', icon: ICONS.exit, run: () => { sessionStorage.setItem('margin:off', '1'); location.reload(); } },
      ],
    });
    const click = (sel: string) => (document.querySelector(sel) as HTMLElement | null)?.click();
    const quick = isWatch ? createFloatingMenu([
      { label: '回到顶部', en: 'Back to Top', run: () => scrollTo({ top: 0, behavior: 'smooth' }) },
      { label: '看评论', en: 'Comments', run: () => document.querySelector('#commentapp, bili-comments, .comment-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) },
      { label: '网页全屏', en: 'Web Fullscreen', run: () => click('.bpx-player-ctrl-web') },
      { label: '宽屏模式', en: 'Wide Mode', run: () => click('.bpx-player-ctrl-wide') },
      { label: '收藏夹', en: 'Favorites', run: () => this.fav.open() },
    ]) : null;
    this.app = h('div', { class: 'app wt', 'data-bg': 'off','data-glass':settings.glass,'data-kind':kind }, this.head.el, quick?.el ?? null, createScrollRuler(), this.panel.sheet.el, this.fav.el, palette.el, later.el, cm.el);
    // 标记抽屉状态；大面板使用实底，可见背景保持动态。
    this.app.addEventListener('margin:sheet', () => { const on = !!this.app.querySelector('.sheet-layer[data-open="true"]'); this.app.classList.toggle('sheeted', on); });
    root.append(this.app);
    if (isWatch) { skinComments(); alignAuthorCard(); }
    const lg = filtersIn(root);
    this.head.glass.forEach((g) => attachGlass(g, lg));
    attachGlass(this.head.thumb, lg, { blur: 2, strength: 0.4 });
    const favGrid = this.fav.el.querySelector('.fav-grid') as HTMLElement | null;
    if (favGrid) bindCardMenu(favGrid, cm, () => this.app, { onLater: () => later.open() });
    de.append(this.host);

    this.applyTheme(false);
    this.media.addEventListener('change', () => this.applyTheme(false));
    // 搜索页没有播放器；普通视频、番剧、列表等换皮页都运行播放器相关设置
    if (kind !== 'search') this.watchScreen();
    if (isWatch) { startTriple(); podProgress(); startWatchCard(); }
  }

  update(s: Settings): void {
    this.app.dataset.glass = s.glass;
    const prev = this.settings;
    this.settings = s;
    this.filter.update(s);
    if (prev.reduceMotion !== s.reduceMotion || prev.theme !== s.theme || JSON.stringify(prev.bg) !== JSON.stringify(s.bg)) this.applyTheme(false);
    if (prev.webScroll !== s.webScroll || prev.wide !== s.wide || prev.autoWeb !== s.autoWeb) {
      this.autoDone = '';
      this.wideDone = '';
      this.screenSync?.();
    }
    this.head.setMsgRemind(s.msgRemind);
    this.panel.sync(s);
  }

  private resolved(): 'light' | 'dark' {
    const t = this.settings.theme;
    return t === 'auto' ? (this.media.matches ? 'dark' : 'light') : t;
  }

  private applyTheme(animate: boolean): void {
    const t = this.resolved();
    document.documentElement.dataset.marginTheme = t;
    this.app.dataset.theme = t;
    this.bgApp.dataset.theme = t;
    this.app.classList.toggle('margin-reduce', this.settings.reduceMotion);
    this.bgApp.classList.toggle('margin-reduce', this.settings.reduceMotion);
    this.head.sunMoon.set(t, animate && !reducedMotion());
    const mode = this.settings.bg.mode;
    document.documentElement.classList.toggle('margin-has-bg', mode !== 'off');
    this.bg.apply(this.settings.bg, t, this.settings.palette).then(() => {
      document.documentElement.classList.toggle('margin-has-bg', this.bg.el.dataset.mode !== 'off');
      this.panel.sync(this.settings);
    });
  }

  private async toggleTheme(): Promise<void> {
    const next = this.resolved() === 'dark' ? 'light' : 'dark';
    this.settings = { ...this.settings, theme: next };
    this.applyTheme(true);
    await saveSettings({ theme: next });
  }

  /** 网页全屏 / 全屏时收起顶栏，不挡播放器 */
  private watchScreen(): void {
    // B 站有两代播放器：新版的 .bpx-player-container[data-screen]，旧版依赖包裹层 class
    const player = () => document.querySelector<HTMLElement>('.bpx-player-container, #bilibili-player, #bilibili-player-wrap, .bilibili-player-wrap');
    const playerScreen = (): string => {
      const bpx = document.querySelector('.bpx-player-container');
      if (bpx) return bpx.getAttribute('data-screen') ?? 'normal';
      const wrap = document.querySelector<HTMLElement>('#bilibili-player-wrap, .bilibili-player-wrap, .player-wrap');
      if (wrap) {
        if (wrap.classList.contains('bilibili-player-webscreen') || wrap.classList.contains('mode-webscreen')) return 'web';
        if (wrap.classList.contains('bilibili-player-widescreen') || wrap.classList.contains('mode-widescreen')) return 'wide';
      }
      return 'normal';
    };
    let lastScreen = '';
    const sync = (force = false) => {
      const screen = playerScreen();
      // 状态没变且不在全屏时不做重复重排；设置变化时 force 强制重算
      if (!force && screen === lastScreen && !document.fullscreenElement) return;
      lastScreen = screen;
      const hide = screen === 'web' || screen === 'full' || !!document.fullscreenElement;
      this.host.toggleAttribute('hidden', hide);
      webScroll(screen === 'web' && !document.fullscreenElement && this.settings.webScroll);
      this.bg.hold('screen', hide);
      document.documentElement.classList.toggle('margin-webscreen', hide);
      // 小窗只移动播放器本体，文档仍沿用进入小窗前的宽屏布局。
      wide(screen === 'wide' || (screen === 'mini' && de.classList.contains('margin-wide')));
    };
    // 宽屏：按右栏实际内容对齐，扣除原生内层已有的让位，避免重复叠加高度。
    let ro: ResizeObserver | null = null;
    let sideObserver: MutationObserver | null = null;
    let placeFrame = 0;
    const de = document.documentElement;
    const schedulePlace = () => {
      if (placeFrame || !de.classList.contains('margin-wide')) return;
      placeFrame = requestAnimationFrame(() => { placeFrame = 0; place(); });
    };
    const place = () => {
      if (!de.classList.contains('margin-wide')) return;
      const pl = player(), rc = document.querySelector<HTMLElement>('.right-container');
      if (!pl) return;
      ro?.observe(pl);
      const mini = playerScreen() === 'mini';
      const anchor = mini ? document.querySelector<HTMLElement>('#playerWrap') : pl;
      if (!anchor) return;
      ro?.observe(anchor);
      // 小窗尺寸与页面布局无关，读取原文档占位并沿用宽屏标题宽度。
      if (!mini) {
        const width = `${pl.getBoundingClientRect().width}px`;
        if (de.style.getPropertyValue('--m-wide-width') !== width) de.style.setProperty('--m-wide-width', width);
      }
      if (!rc) return;
      ro?.observe(rc);
      const inner = rc.querySelector('.right-container-inner') ?? rc;
      const first = [...inner.children].find((el) => el.getClientRects().length) ?? inner;
      if (!first.getClientRects().length) return;
      const current = parseFloat(getComputedStyle(rc).paddingTop) || 0;
      const pad = `${Math.max(0, Math.round(current + anchor.getBoundingClientRect().bottom - first.getBoundingClientRect().top + 24))}px`;
      if (de.style.getPropertyValue('--m-wide-pad') !== pad) de.style.setProperty('--m-wide-pad', pad);
    };
    const wide = (on: boolean) => {
      de.classList.toggle('margin-wide', on);
      if (on) {
        schedulePlace();
        if (!ro) ro = new ResizeObserver(schedulePlace);
        const pl = player();
        if (pl) ro.observe(pl);
        // 合集侧栏可晚于播放器挂载；只观察侧栏的内容变化，出现后立即重新定位。
        sideObserver ??= new MutationObserver((records) => {
          if (records.some((r) => (r.target as Element).closest?.('.right-container') ||
            [...r.addedNodes].some((n) => n instanceof Element && (n.matches('.right-container, .bpx-player-container') || n.querySelector('.right-container, .bpx-player-container'))))) schedulePlace();
        });
        sideObserver.observe(document.body, { childList: true, subtree: true });
        addEventListener('resize', schedulePlace, { passive: true });
      } else {
        ro?.disconnect(); sideObserver?.disconnect();
        removeEventListener('resize', schedulePlace);
        cancelAnimationFrame(placeFrame); placeFrame = 0;
        de.style.removeProperty('--m-wide-pad');
        de.style.removeProperty('--m-wide-width');
      }
    };
    // v0.43 网页全屏可滚动：播放器改成贴在文档顶端的 absolute，下面的评论接着排
    const webScroll = (on: boolean) => {
      if (!on) {
        if (de.classList.contains('margin-webscroll')) { de.classList.remove('margin-webscroll'); for (const k of ['y', 'x', 'w', 'h']) de.style.removeProperty(`--m-ws-${k}`); }
        return;
      }
      const wrap = document.querySelector<HTMLElement>('.player-wrap, #bilibili-player-wrap, .bilibili-player-wrap');
      if (!wrap) return;
      const was = de.classList.contains('margin-webscroll');
      requestAnimationFrame(() => {
        if (!was) de.classList.add('margin-webscroll');
        // 先按 0 偏移算 player-wrap 的文档坐标，再把播放器拉回文档左上角
        de.style.setProperty('--m-ws-h', 'auto');
        const r = wrap.getBoundingClientRect();
        const top = r.top + scrollY, left = r.left + scrollX;
        de.style.setProperty('--m-ws-y', `${-top}px`);
        de.style.setProperty('--m-ws-x', `${-left}px`);
        de.style.setProperty('--m-ws-w', `${de.clientWidth}px`);
        de.style.setProperty('--m-ws-h', `${Math.max(0, innerHeight - top)}px`);
        if (!was) scrollTo({ top: 0 });
      });
    };
    // v0.48 网页全屏可滚动时，B 站原生「滚轮调音量」被页面滚动吃掉（B 站评论反馈）。
    // 播放器铺满视口（还没往下滚）时：画面上滚轮 = 调音量；控制栏那一条（底部 96px）滚轮 = 往下看评论；
    // 已经滚下去以后一律正常滚动。B 站自己处理了的话（音量已变）不重复调。
    addEventListener('wheel', (e) => {
      if (!de.classList.contains('margin-webscroll') || e.ctrlKey || e.deltaY === 0) return;
      const t = e.target as Element | null;
      if (!t?.closest?.('.bpx-player-video-area, .bpx-player-video-wrap, .bilibili-player-video-wrap')) return;
      if (t.closest('.bpx-player-ctrl-setting-box, .bpx-player-ctrl-volume, .bpx-player-dm-wrap input')) return;
      // 想往下看评论（已经滚下去了，或者在底部控制栏那一条）：只滚页面，不让 B 站顺手把音量也调了
      if (scrollY > 4 || e.clientY > innerHeight - 96) { e.stopPropagation(); return; }
      const v = document.querySelector<HTMLVideoElement>('.bpx-player-video-wrap video, .bilibili-player-video video, video');
      if (!v) return;
      e.preventDefault();
      const v0 = v.volume, m0 = v.muted, up = e.deltaY < 0;
      setTimeout(() => {
        if (v.volume !== v0 || v.muted !== m0) return;
        const n = Math.min(1, Math.max(0, Math.round((v0 + (up ? 0.1 : -0.1)) * 10) / 10));
        if (up && v.muted) v.muted = false;
        v.volume = n;
        volTip(`音量 ${Math.round(n * 100)}%`);
      }, 0);
    }, { passive: false, capture: true });
    let tipEl: HTMLElement | null = null, tipT = 0;
    const volTip = (text: string) => {
      const host = document.querySelector<HTMLElement>('.bpx-player-video-area') ?? document.body;
      if (!tipEl || !tipEl.isConnected) {
        tipEl = document.createElement('div');
        tipEl.className = 'm-voltip';
        host.appendChild(tipEl);
      }
      tipEl.textContent = text;
      tipEl.classList.add('on');
      clearTimeout(tipT); tipT = window.setTimeout(() => tipEl?.classList.remove('on'), 900);
    };
    // v0.49 无极倍速（B 站评论建议）：X 减 0.1×、C 加 0.1×（0.1–16×），Z 在当前倍速和 1× 之间来回切
    let lastRate = 1;
    document.addEventListener('keydown', (e) => {
      if (!this.settings.speedKeys || e.ctrlKey || e.metaKey || e.altKey || e.repeat && e.key.toLowerCase() === 'z') return;
      const k = e.key.toLowerCase();
      if (k !== 'x' && k !== 'c' && k !== 'z') return;
      const t = e.composedPath()[0] as HTMLElement | undefined;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const v = document.querySelector<HTMLVideoElement>('.bpx-player-video-wrap video, .bilibili-player-video video, video');
      if (!v) return;
      e.preventDefault(); e.stopPropagation();
      const cur = Math.round(v.playbackRate * 10) / 10;
      let n: number;
      if (k === 'z') { if (cur === 1) n = lastRate === 1 ? 1 : lastRate; else { lastRate = cur; n = 1; } }
      else n = Math.min(16, Math.max(0.1, Math.round((cur + (k === 'c' ? 0.1 : -0.1)) * 10) / 10));
      if (k !== 'z' && n !== 1) lastRate = n;
      v.playbackRate = n;
      volTip(`${n.toFixed(1)}×`);
    }, true);
    this.screenSync = () => sync(true);
    addEventListener('resize', () => { if (de.classList.contains('margin-webscroll')) webScroll(true); });
    new MutationObserver(() => sync()).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-screen'] });
    every(1000, sync); // 旧版播放器只改 class、不发 data-screen 变化，兜底轮询
    // v0.43 自动网页全屏；v0.47 宽屏模式：每个视频进来一次，用户自己退出后同一视频不再强开
    const keyOf = () => location.pathname.match(/BV\w+|ep\d+|ss\d+/)?.[0] ?? location.search;
    const webBtn = () => document.querySelector<HTMLElement>('.bpx-player-ctrl-web, .bilibili-player-video-btn-webscreen, [aria-label="网页全屏"]');
    const wideBtn = () => document.querySelector<HTMLElement>('.bpx-player-ctrl-wide, .bilibili-player-video-btn-widescreen, [aria-label="宽屏"]');
    const video = () => document.querySelector<HTMLVideoElement>('.bpx-player-video-wrap video, .bpx-player-video-wrap bwp-video, #bilibili-player video, .bilibili-player video');
    every(800, () => {
      const bv = keyOf();
      // 自动网页全屏优先；和宽屏同时开启时不再点宽屏
      if (this.settings.autoWeb && bv !== this.autoDone) {
        const p = player(), btn = webBtn(), v = video();
        if (!p || !btn || !v || (v as HTMLVideoElement).readyState < 1) return;
        this.autoDone = bv;
        if (playerScreen() === 'normal' && !document.fullscreenElement) btn.click();
        return;
      }
      if (!this.settings.wide || this.settings.autoWeb) return;
      if (bv === this.wideDone) return;
      const btn = wideBtn();
      if (!btn || !player()) return;
      this.wideDone = bv;
      if (playerScreen() === 'normal' && !document.fullscreenElement) btn.click();
    });
    document.addEventListener('fullscreenchange', () => sync());
    sync();
  }
}

/** 普通模式下对齐 UP 卡片与播放器；标题换行、懒挂载和模式切换后按帧合并重算。 */
function alignAuthorCard(): void {
  const de = document.documentElement;
  let frame = 0;
  const observed = new Set<Element>();
  const schedule = () => { if (!frame) frame = requestAnimationFrame(place); };
  const ro = new ResizeObserver(schedule);
  const place = () => {
    frame = 0;
    if (de.classList.contains('margin-wide') || de.classList.contains('margin-webscreen')) { de.style.removeProperty('--m-author-pad'); return; }
    // 原生吸顶也会移动左栏；滚动期间保留首屏间距，回到顶部再校准。
    if (scrollY > 1) return;
    // 浮动小窗会移动播放器本体；对齐它在文档中的占位，不能追随小窗的屏幕坐标。
    const player = document.querySelector('#playerWrap') ?? document.querySelector('.bpx-player-container');
    const right = document.querySelector<HTMLElement>('.right-container');
    const panel = right?.querySelector('.up-panel-container');
    if (!player || !right || !panel) return;
    if (getComputedStyle(player).position === 'fixed') return;
    for (const el of observed) if (!el.isConnected) { ro.unobserve(el); observed.delete(el); }
    for (const el of [player, right, document.querySelector('.video-info-container')]) {
      if (el && !observed.has(el)) { ro.observe(el); observed.add(el); }
    }
    const current = parseFloat(getComputedStyle(right).paddingTop) || 0;
    const pad = `${Math.max(0, Math.round(current + player.getBoundingClientRect().top - panel.getBoundingClientRect().top))}px`;
    if (de.style.getPropertyValue('--m-author-pad') !== pad) de.style.setProperty('--m-author-pad', pad);
  };
  new MutationObserver(schedule).observe(de, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver((records) => {
    if (records.some((r) => [...r.addedNodes].some((n) => n instanceof Element &&
      (n.matches('.up-panel-container, .right-container, .video-info-container, .bpx-player-container') || n.querySelector('.up-panel-container, .right-container, .video-info-container, .bpx-player-container'))))) schedule();
  }).observe(de, { childList: true, subtree: true });
  addEventListener('resize', schedule, { passive: true });
  addEventListener('scroll', () => { if (scrollY <= 1) schedule(); }, { passive: true });
  schedule();
}

/** 选集进度条：把「（3/14）」换算成 0–1 写到 .video-pod__header 的 --pod-p。
 *  只在切集时变，所以每 2 秒读一次那行文字（页面隐藏时不跑），不挂 MutationObserver。 */
function podProgress(): void {
  let last = '';
  every(2000, () => {
    const amt = document.querySelector<HTMLElement>('.video-pod__header .amt');
    const t = amt?.textContent ?? '';
    if (t === last) return;
    last = t;
    const m = t.match(/(\d+)\s*\/\s*(\d+)/);
    const head = amt?.closest<HTMLElement>('.video-pod__header');
    if (!head) return;
    if (m) head.style.setProperty('--pod-p', String(Math.min(1, +m[1] / Math.max(1, +m[2]))));
    else head.style.removeProperty('--pod-p');
  }, { immediate: true });
}
