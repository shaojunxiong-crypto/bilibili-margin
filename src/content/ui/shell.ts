import type { Settings } from '../../shared/settings';
import { saveSettings } from '../../shared/settings';
import { BackgroundLayer } from '../bg/background';
import { h, ICONS, guardTyping } from './dom';
import { createHeader, type Header, SITE_LINKS } from './header';
import { createSettingsPanel, type SettingsPanel } from './settings-panel';
import { attachGlass, filtersIn } from './liquid-glass';
import { createLaterDrawer } from './drawer';
import { createHistoryDrawer } from './history-drawer';
import { createFavorites } from './favorites';
import { attachPreview } from './preview';
import type { SunMoon } from './sun-moon';
import { FilterRuntime } from '../filter-runtime';
import { reducedMotion } from '../motion';
import css from '../styles/index';
import pagesCss from '../takeover.css?inline';

/**
 * 接管式页面（个人空间、消息中心）的公共外壳：Shadow DOM、映间顶栏、背景、主题切换、设置/收藏/稍后再看。
 * 首页 MarginApp 自成一体不动；新页面都从这里起步，保证顶栏、配色和昼夜动画完全一致。
 */
export class PageShell {
  readonly host: HTMLElement;
  readonly root: ShadowRoot;
  readonly app: HTMLElement;
  readonly main: HTMLElement;
  readonly head: Header;
  readonly filter: FilterRuntime;
  private sunMoon: SunMoon;
  private bg = new BackgroundLayer();
  private panel: SettingsPanel;
  private fadeTimer = 0;
  private media = matchMedia('(prefers-color-scheme: dark)');

  constructor(public settings: Settings, kind: string) {
    this.host = h('div', { id: 'margin-root' });
    this.root = this.host.attachShadow({ mode: 'open' });
    guardTyping(this.host);
    this.root.append(h('style', {}, css + '\n' + pagesCss));
    this.filter = new FilterRuntime(settings);
    this.panel = createSettingsPanel(() => this.settings, () => this.bg.shader);
    const fav = createFavorites((g) => attachPreview(g, () => this.settings.hoverPreview), () => this.settings.favDirect, this.filter);
    const later = createLaterDrawer(() => this.app, this.filter);
    const hist = createHistoryDrawer();
    panels.fav = fav;
    panels.later = later;
    panels.hist = hist;
    this.head = createHeader({
      onTheme: () => this.toggleTheme(),
      onSettings: () => this.panel.sheet.open(),
      msgRemind: () => this.settings.msgRemind,
      filter: this.filter,
      tabs: [
        ...SITE_LINKS,
        'separator',
        { title: '收藏', icon: ICONS.fav, run: () => fav.open() },
        { title: '稍后', icon: ICONS.later, run: () => later.open() },
      ],
    });
    this.sunMoon = this.head.sunMoon;
    this.main = h('main', { class: `main tk tk-${kind}` });
    const exit = h('button', { class: 'ghost small', type: 'button', onclick: () => { sessionStorage.setItem('margin:off', '1'); location.reload(); } }, '本次回到 B 站原版');
    this.app = h('div', { class: 'app','data-glass':settings.glass },
      this.bg.el, this.head.el, this.main,
      h('footer', { class: 'foot tk-foot' }, exit, h('span', {}, '映间 MARGIN · 非 B 站官方')),
      this.panel.sheet.el, fav.el, later.el, hist.el,
    );
    // 标记抽屉状态；大面板使用实底，可见背景保持动态。
    this.app.addEventListener('margin:sheet', () => { const on = !!this.app.querySelector('.sheet-layer[data-open="true"]'); this.app.classList.toggle('sheeted', on); });
    this.root.append(this.app);
    const lg = filtersIn(this.root);
    this.head.glass.forEach((g) => attachGlass(g, lg));
    attachGlass(this.head.thumb, lg, { blur: 2, strength: 0.4 });
    this.applyTheme();
    this.media.addEventListener('change', () => this.applyTheme());
  }

  /** 页面里的胶囊控件也做成液态玻璃 */
  glass(el: HTMLElement): void { attachGlass(el, filtersIn(this.root)); }

  update(s: Settings): void {
    this.app.dataset.glass = s.glass;
    const prev = this.settings;
    this.settings = s;
    this.filter.update(s);
    if (prev.reduceMotion !== s.reduceMotion || prev.theme !== s.theme || prev.palette !== s.palette || JSON.stringify(prev.bg) !== JSON.stringify(s.bg)) this.applyTheme();
    this.head.setMsgRemind(s.msgRemind);
    this.panel.sync(s);
  }

  resolved(): 'light' | 'dark' {
    const t = this.settings.theme;
    return t === 'auto' ? (this.media.matches ? 'dark' : 'light') : t;
  }

  private applyTheme(): void {
    const t = this.resolved();
    this.app.dataset.theme = t;
    this.app.dataset.palette = this.settings.palette;
    this.app.dataset.bg = this.settings.bg.mode;
    this.app.classList.toggle('margin-reduce', this.settings.reduceMotion);
    document.documentElement.style.background = t === 'dark' ? '#111' : '#f5f4f1';
    this.sunMoon.set(t, !reducedMotion());
    this.bg.apply(this.settings.bg, t, this.settings.palette).then(() => this.panel.sync(this.settings));
  }

  private async toggleTheme(): Promise<void> {
    const next = this.resolved() === 'dark' ? 'light' : 'dark';
    if (!reducedMotion()) {
      this.app.classList.add('theme-fading');
      this.app.style.setProperty('--fade', `${this.sunMoon.duration}ms`);
      clearTimeout(this.fadeTimer);
      this.fadeTimer = window.setTimeout(() => this.app.classList.remove('theme-fading'), this.sunMoon.duration + 100);
    }
    this.settings = { ...this.settings, theme: next };
    this.applyTheme();
    await saveSettings({ theme: next });
  }
}

/** B 站的 csrf：bili_jct cookie */
export const csrf = () => document.cookie.match(/(?:^|;\s*)bili_jct=([^;]+)/)?.[1] ?? '';
export const https = (u: string | undefined) => String(u ?? '').replace(/^\/\//, 'https://').replace(/^http:/, 'https:');

/** 空间页等外部页面复用顶栏已有的抽屉（收藏夹 / 稍后再看） */
export const panels: { fav?: { open(): void }; later?: { open(): void }; hist?: { open(): void } } = {};
