/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 详情页（单条动态 t.bilibili.com/{id}、图文 opus、专栏 read/cv、番剧播放页）的映间版式。
 *
 * 版式骨架移植 21st「Article With Author Sidebar」(olewandowski1/article-5)：
 * max-w-5xl 两栏网格，左边正文，右边 17rem 粘性侧栏（作者卡 → 相关 → 分隔线 → 底部操作区）。
 * 正文、评论、投币 / 收藏弹窗都还是 B 站原生的（不拦原版脚本），这里只：
 *  1) 用全局样式重排原生正文（detail.css，入口脚本同步挂上，不闪）；
 *  2) 在右边挂一个 Shadow DOM 侧栏：作者卡（关注）、目录 + 阅读进度、UP 主最近投稿、点赞 / 投币 / 收藏 / 转发 / 评论。
 *     操作按钮转发点击给被藏起来的原生侧边工具条，计数和点亮状态从它那儿同步，行为和原版完全一致。
 */
import { h, icon, ICONS, fmtCount, guardTyping } from './dom';
import { getJSON } from '../api/http';
import { spaceVideos, follow } from '../api/space';
import { csrf, https } from './shell';
import { skinComments } from './comment-skin';
import type { Video } from '../api/feed';
import type { FilterRuntime } from '../filter-runtime';
import { targetOfVideo } from '../filter-targets';

export type DetailKind = 'opus' | 'dyn' | 'read' | 'bangumi';

/** 路由判断：返回详情页类型，不是详情页返回 null */
export function detailKind(loc: Location = location): DetailKind | null {
  const { hostname: host, pathname: p } = loc;
  const L = '(?:[a-z]{2}(?:-[A-Za-z]{2,4})?/)?';
  if (host === 't.bilibili.com' && /^\/\d+\/?$/.test(p)) return 'dyn';
  if (host !== 'www.bilibili.com') return null;
  if (new RegExp(`^/${L}opus/\\d+`).test(p)) return 'opus';
  if (new RegExp(`^/${L}read/cv\\d+`).test(p)) return 'read';
  if (new RegExp(`^/${L}bangumi/play/(?:ep|ss)\\d+`).test(p)) return 'bangumi';
  return null;
}

interface Author { mid: number; name: string; face: string; sign: string; fans: number; following: boolean; official: string }

const ACTIONS = [
  { key: 'like', label: '点赞', path: ICONS.like },
  { key: 'coin', label: '投币', path: ICONS.coin },
  { key: 'favorite', label: '收藏', path: ICONS.star },
  { key: 'forward', label: '转发', path: ICONS.forward },
  { key: 'comment', label: '评论', path: ICONS.comment },
] as const;

const CSS = `
:host { all: initial; position: fixed; top: 96px; z-index: 30; width: 272px; display: block; color: var(--m-ink); font: 14px/1.5 "Geist", "Margin Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
:host([hidden]) { display: none; }
* { box-sizing: border-box; }
a { color: inherit; text-decoration: none; }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
:focus-visible { outline: 2px solid var(--m-accent); outline-offset: 2px; border-radius: 8px; }
aside { display: flex; flex-direction: column; gap: 32px; max-height: calc(100vh - 120px); overflow: auto; scrollbar-width: none; padding: 2px; }
aside::-webkit-scrollbar { display: none; }

/* 作者卡：rounded border p-5，头像 44、名字 14 semibold、副标题 12、简介 14、描边小按钮 */
.author { display: flex; flex-direction: column; gap: 16px; padding: 20px; border-radius: 20px; border: 1px solid var(--m-line);
  background: color-mix(in srgb, var(--m-surface) 72%, transparent); backdrop-filter: blur(20px) saturate(1.4); box-shadow: var(--sh-xs); }
.who { display: flex; align-items: center; gap: 12px; min-width: 0; }
.who img { width: 44px; height: 44px; flex: none; border-radius: 999px; object-fit: cover; box-shadow: 0 0 0 1px var(--m-line); background: var(--m-chip); }
.who div { display: flex; flex-direction: column; min-width: 0; }
.who b { font-weight: 600; font-size: 14px; line-height: 20px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.who small { font-size: 12px; line-height: 16px; color: var(--m-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.who small .num { font-family: var(--m-mono); }
.sign { margin: 0; font-size: 14px; line-height: 20px; color: var(--m-muted); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.row { display: flex; gap: 8px; }
.btn { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 10px; font-size: 13px; font-weight: 500;
  border: 1px solid var(--m-line); background: var(--m-surface); color: var(--m-ink); box-shadow: var(--sh-xs); transition: background-color .15s, color .15s, border-color .15s, transform .15s cubic-bezier(.23,1,.32,1); }
.btn:hover { background: var(--m-chip); }
.btn:active { transform: scale(.97); }
.btn.solid { background: var(--m-ink); color: var(--m-canvas); border-color: transparent; }
.btn.solid:hover { background: color-mix(in srgb, var(--m-ink) 86%, transparent); }
.btn svg { width: 16px; height: 16px; }

/* 小节标题：12px 大写字距（中文标签 + mono 英文） */
.sec { display: flex; flex-direction: column; gap: 12px; }
.sec h3 { margin: 0; display: flex; align-items: baseline; gap: 8px; font-size: 12px; line-height: 16px; font-weight: 600; letter-spacing: .08em; color: var(--m-muted); }
.sec h3 i { font: normal 500 10px/16px var(--m-mono); letter-spacing: .2em; color: var(--m-faint); text-transform: uppercase; }
.sec h3 .pct { margin-left: auto; font: 500 11px/16px var(--m-mono); letter-spacing: .04em; color: var(--m-muted); }
.bar { height: 2px; border-radius: 2px; background: var(--m-line); overflow: hidden; }
.bar i { display: block; height: 100%; width: 100%; transform-origin: left; transform: scaleX(var(--p, 0)); background: var(--m-ink); transition: transform .2s linear; }

/* 目录 */
.toc { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.toc a { display: block; padding: 6px 0 6px 12px; border-left: 2px solid var(--m-line); font-size: 13px; line-height: 20px; color: var(--m-muted); transition: color .15s, border-color .15s; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.toc a[data-lv="3"], .toc a[data-lv="4"] { padding-left: 24px; }
.toc a:hover { color: var(--m-ink); }
.toc a.on { color: var(--m-ink); border-left-color: var(--m-ink); font-weight: 500; }

/* 相关：标题 14 medium + 12 次要信息，悬停变淡 */
.rel { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 16px; }
.rel a { display: grid; grid-template-columns: 88px 1fr; gap: 12px; align-items: start; }
.rel img { width: 88px; height: 56px; border-radius: 8px; object-fit: cover; background: var(--m-chip); box-shadow: 0 0 0 1px var(--m-line); }
.rel span { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.rel b { font-size: 13px; line-height: 20px; font-weight: 500; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; transition: color .15s; }
.rel a:hover b { color: var(--m-muted); }
.rel small { font: 11px/16px var(--m-mono); color: var(--m-muted); }

hr { margin: 0; border: 0; height: 1px; background: var(--m-line); }

/* 底部操作区（原组件的订阅表单位置） */
.acts { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; padding: 4px; border-radius: 16px; background: var(--m-chip); box-shadow: var(--ring); }
.act[hidden] { display: none; }
.act { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 0 6px; border-radius: 12px; color: var(--m-muted); transition: background-color .15s, color .15s, transform .15s cubic-bezier(.23,1,.32,1); }
.act:hover { background: var(--m-surface); color: var(--m-ink); box-shadow: var(--sh-xs); }
.act:active { transform: scale(.95); }
.act svg { width: 20px; height: 20px; }
.act small { font: 11px/16px var(--m-mono); }
.act.on { color: var(--m-accent); }
.act.on svg { fill: color-mix(in srgb, currentColor 18%, transparent); }
.hint { margin: 0; font-size: 12px; line-height: 16px; color: var(--m-muted); }
.hint kbd { font: 11px/1 var(--m-mono); padding: 2px 6px; border-radius: 6px; border: 1px solid var(--m-line); }

:host([data-motion="reduced"]) *,
:host([data-motion="reduced"]) *::before,
:host([data-motion="reduced"]) *::after {
  animation-duration: .001ms !important;
  animation-delay: 0s !important;
  animation-iteration-count: 1 !important;
  transition-duration: .001ms !important;
  transition-delay: 0s !important;
}
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation-duration: .001ms !important; animation-iteration-count: 1 !important; }
}
`;

const MAIN: Record<Exclude<DetailKind, 'bangumi'>, string> = {
  opus: '.opus-detail',
  read: '.opus-detail, .article-container, .article-detail, #app > .container',
  dyn: '#app .content',
};
const BODY: Record<Exclude<DetailKind, 'bangumi'>, string> = {
  opus: '.opus-module-content',
  read: '.opus-module-content, #read-article-holder, .article-content',
  dyn: '.bili-dyn-item__body',
};

/** 动态 / 图文 id → 作者 mid：先读页面里 SSR 的 __INITIAL_STATE__，没有再问动态详情接口 */
async function authorMid(kind: DetailKind): Promise<number> {
  for (const s of document.scripts) {
    const t = s.textContent ?? '';
    if (!t.includes('__INITIAL_STATE__')) continue;
    const m = t.match(/"module_author":\{[^]*?"mid":(\d+)/) ?? t.match(/"author":\{[^}]*?"mid":(\d+)/);
    if (m) return Number(m[1]);
  }
  const id = location.pathname.match(/(\d{6,})/)?.[1];
  if (id && kind !== 'read') {
    const d = await getJSON<any>('/x/polymer/web-dynamic/v1/detail', { id, features: 'itemOpusStyle' }).catch(() => null);
    const mid = d?.item?.modules?.module_author?.mid;
    if (mid) return Number(mid);
  }
  const a = document.querySelector<HTMLAnchorElement>('.bili-dyn-item__avatar a[href*="space.bilibili.com"], .up-name[href*="space.bilibili.com"], a.up-face[href*="space.bilibili.com"]');
  return Number(a?.href.match(/space\.bilibili\.com\/(?:[a-z-]+\/)?(\d+)/i)?.[1] ?? 0);
}

async function authorCard(mid: number): Promise<Author | null> {
  const d = await getJSON<any>('/x/web-interface/card', { mid, photo: 'false' }).catch(() => null);
  if (!d?.card) return null;
  const c = d.card;
  return { mid, name: c.name, face: https(c.face), sign: c.sign ?? '', fans: c.fans ?? d.follower ?? 0, following: !!d.following, official: c.Official?.title || c.official_verify?.desc || '' };
}

export class DetailAside {
  readonly host = h('div', { id: 'margin-aside' });
  private root: ShadowRoot;
  private aside = h('aside', { 'aria-label': '作者与目录' });
  private main: HTMLElement | null = null;
  private toolbar: HTMLElement | null = null;
  private acts = new Map<string, HTMLButtonElement>();
  private disposers: (() => void)[] = [];

  constructor(private kind: Exclude<DetailKind, 'bangumi'>, private filter?: FilterRuntime) {
    this.root = this.host.attachShadow({ mode: 'open' });
    guardTyping(this.host);
    this.root.append(h('style', {}, CSS), this.aside);
    this.host.hidden = true;
    const syncMotion = () => {
      this.host.dataset.motion = document.documentElement.classList.contains('margin-reduce') ? 'reduced' : '';
    };
    syncMotion();
    document.addEventListener('margin:motion', syncMotion);
    document.documentElement.append(this.host);
    this.waitMain();
  }

  /** 等原生正文出现（opus 是 SSR，动态详情是前端渲染），最多 20 秒 */
  private waitMain(): void {
    const t0 = performance.now();
    const tick = () => {
      this.main = document.querySelector<HTMLElement>(MAIN[this.kind]);
      if (this.main && this.main.getBoundingClientRect().height > 40) return this.ready();
      if (performance.now() - t0 < 20000) setTimeout(tick, 250);
    };
    tick();
  }

  private ready(): void {
    const main = this.main!;
    // 定位：侧栏贴在正文右边 48px（gap-12），顶栏下 24px 固定，等价于 lg:sticky lg:top
    const place = () => {
      const r = main.getBoundingClientRect();
      const left = Math.round(r.right + 48);
      const fits = left + 272 <= innerWidth - 16;
      this.host.hidden = !fits;
      document.documentElement.classList.toggle('margin-detail-narrow', !fits);
      if (fits) this.host.style.left = `${left}px`;
    };
    const ro = new ResizeObserver(place);
    ro.observe(main);
    ro.observe(document.documentElement);
    addEventListener('resize', place, { passive: true });
    this.disposers.push(() => ro.disconnect());
    place();

    this.aside.append(this.authorSkeleton(), this.tocSection(), this.relatedSection(), h('hr'), this.actionSection());
    void this.loadAuthor();
  }

  // ── 作者卡 ──
  private authorEl = h('div', { class: 'author' });
  private authorSkeleton(): HTMLElement {
    this.authorEl.append(h('div', { class: 'who' }, h('img', { alt: '' }), h('div', {}, h('b', {}, ' '), h('small', {}, ' '))));
    return this.authorEl;
  }

  private async loadAuthor(): Promise<void> {
    const mid = await authorMid(this.kind).catch(() => 0);
    if (!mid) { this.authorEl.remove(); this.relEl.remove(); return; }
    const a = await authorCard(mid);
    if (!a) { this.authorEl.remove(); return; }
    const space = `https://space.bilibili.com/${a.mid}`;
    const followBtn = h('button', { class: `btn${a.following ? '' : ' solid'}`, type: 'button' }, a.following ? '已关注' : '关注');
    followBtn.addEventListener('click', async () => {
      const token = csrf();
      if (!token) { location.href = 'https://passport.bilibili.com/login?gourl=' + encodeURIComponent(location.href); return; }
      followBtn.disabled = true;
      const ok = await follow(a.mid, !a.following, token).catch(() => false);
      followBtn.disabled = false;
      if (!ok) return;
      a.following = !a.following;
      followBtn.textContent = a.following ? '已关注' : '关注';
      followBtn.classList.toggle('solid', !a.following);
    });
    const sub = h('small', {}, a.official || '', a.official ? ' · ' : '', h('span', { class: 'num' }, fmtCount(a.fans)), ' 粉丝');
    this.authorEl.replaceChildren(
      h('a', { class: 'who', href: space, target: '_blank', rel: 'noopener' }, h('img', { src: a.face + '@96w_96h_1c.webp', alt: a.name, loading: 'lazy' }), h('div', {}, h('b', {}, a.name), sub)),
      a.sign ? h('p', { class: 'sign' }, a.sign) : '',
      h('div', { class: 'row' }, followBtn, h('a', { class: 'btn', href: space, target: '_blank', rel: 'noopener' }, '空间')),
    );
    void this.loadRelated(a.mid);
  }

  // ── 目录 + 阅读进度 ──
  private tocSection(): HTMLElement {
    const body = document.querySelector<HTMLElement>(BODY[this.kind]);
    const sec = h('div', { class: 'sec' });
    const pct = h('span', { class: 'pct' }, '0%');
    const bar = h('div', { class: 'bar' }, h('i'));
    const chars = (body?.innerText ?? '').replace(/\s/g, '').length;
    const mins = Math.max(1, Math.round(chars / 400));
    sec.append(h('h3', {}, '阅读', h('i', {}, `${mins} MIN`), pct), bar);

    const heads = body ? [...body.querySelectorAll<HTMLElement>('h1, h2, h3, h4')].filter((x) => x.innerText.trim()) : [];
    const links: [HTMLElement, HTMLAnchorElement][] = [];
    if (heads.length >= 2) {
      const ul = h('ul', { class: 'toc' });
      for (const el of heads.slice(0, 24)) {
        const a = h('a', { href: '#', 'data-lv': el.tagName[1] }, el.innerText.trim());
        a.addEventListener('click', (e) => { e.preventDefault(); scrollTo({ top: el.getBoundingClientRect().top + scrollY - 96, behavior: 'smooth' }); });
        ul.append(h('li', {}, a));
        links.push([el, a]);
      }
      sec.append(ul);
    }
    // 滚动时更新进度和当前小节（rAF 节流）
    let pending = false;
    const update = () => {
      pending = false;
      if (!body) return;
      const r = body.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (innerHeight * 0.6 - r.top) / Math.max(1, r.height)));
      (bar.firstElementChild as HTMLElement).style.setProperty('--p', p.toFixed(3));
      pct.textContent = `${Math.round(p * 100)}%`;
      let cur: HTMLAnchorElement | null = null;
      for (const [el, a] of links) if (el.getBoundingClientRect().top < 140) cur = a;
      for (const [, a] of links) a.classList.toggle('on', a === cur);
    };
    const onScroll = () => { if (!pending) { pending = true; requestAnimationFrame(update); } };
    addEventListener('scroll', onScroll, { passive: true });
    this.disposers.push(() => removeEventListener('scroll', onScroll));
    update();
    return sec;
  }

  // ── 相关：UP 主最近投稿 ──
  private relEl = h('div', { class: 'sec' });
  private relVideos: Video[] = [];
  private relatedSection(): HTMLElement { this.relEl.hidden = true; return this.relEl; }
  private async loadRelated(mid: number): Promise<void> {
    const r = await spaceVideos(mid, 1, 'pubdate').catch(() => null);
    this.relVideos = r?.list.slice(0, 3) ?? [];
    if (!this.relVideos.length) { this.relEl.remove(); return; }
    this.filter?.onChange(() => this.paintRelated());
    this.paintRelated();
  }
  private paintRelated(): void {
    const list = this.relVideos.filter((v) => this.filter?.allows(targetOfVideo(v)) ?? true);
    if (!list.length) { this.relEl.hidden = true; return; }
    const ul = h('ul', { class: 'rel' });
    for (const v of list) {
      ul.append(h('li', {}, h('a', { href: `https://www.bilibili.com/video/${v.bvid}`, target: '_blank', rel: 'noopener' },
        h('img', { src: v.cover + '@176w_112h_1c.webp', alt: '', loading: 'lazy' }),
        h('span', {}, h('b', {}, v.title), h('small', {}, `${fmtCount(v.views)} 播放`)))));
    }
    this.relEl.replaceChildren(h('h3', {}, 'UP 主最近', h('i', {}, 'Related')), ul);
    this.relEl.hidden = false;
  }

  // ── 操作区：转发给原生侧边工具条 ──
  private actionSection(): HTMLElement {
    const sec = h('div', { class: 'sec' });
    const grid = h('div', { class: 'acts' });
    for (const a of ACTIONS) {
      const b = h('button', { class: 'act', type: 'button', 'aria-label': a.label, title: a.label, 'data-k': a.key }, icon(a.path), h('small', {}, a.label));
      b.addEventListener('click', () => {
        if (a.key === 'comment') { document.querySelector('.bili-tabs, #comment-module, bili-comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
        this.native(a.key)?.click();
      });
      this.acts.set(a.key, b);
      grid.append(b);
    }
    sec.append(grid, h('p', { class: 'hint' }, '投币、收藏、转发用的是 B 站原生弹窗'));
    this.syncToolbar();
    return sec;
  }

  private native(key: string): HTMLElement | null {
    this.toolbar ??= document.querySelector<HTMLElement>('.side-toolbar');
    return this.toolbar?.querySelector<HTMLElement>(`.side-toolbar__action.${key}`) ?? null;
  }

  /** 计数和点亮状态跟随原生工具条；原生没有这个按钮（比如单条动态没有投币）就藏掉 */
  private syncToolbar(): void {
    const sync = () => {
      for (const [key, b] of this.acts) {
        if (key === 'comment') {
          const n = this.native('comment');
          const t = n?.querySelector('.side-toolbar__action__text')?.textContent?.trim();
          if (t && /\d/.test(t)) (b.lastElementChild as HTMLElement).textContent = t;
          continue;
        }
        const n = this.native(key);
        b.hidden = !n;
        if (!n) continue;
        const t = n.querySelector('.side-toolbar__action__text')?.textContent?.trim();
        (b.lastElementChild as HTMLElement).textContent = t && /\d/.test(t) ? t : ACTIONS.find((x) => x.key === key)!.label;
        const on = /\b(?:is-active|active|on|is-on|liked|selected)\b/.test(n.className) || n.classList.contains('side-toolbar__action--active');
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      }
      const visible = [...this.acts.values()].filter((b) => !b.hidden).length;
      (this.acts.get('like')!.parentElement as HTMLElement).style.gridTemplateColumns = `repeat(${visible}, 1fr)`;
    };
    let mo: MutationObserver | null = null;
    const attach = () => {
      this.toolbar = document.querySelector<HTMLElement>('.side-toolbar');
      if (!this.toolbar) { setTimeout(attach, 500); return; }
      sync();
      mo = new MutationObserver(sync);
      mo.observe(this.toolbar, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] });
    };
    attach();
    this.disposers.push(() => mo?.disconnect());
  }
}

/** 挂载详情页增强；番剧页只补评论区皮肤（版式在 detail.css 里） */
export function mountDetail(kind: DetailKind, filter?: FilterRuntime): DetailAside | null {
  // 详情页的「评论 / 赞与转发」标签已经写了评论数，评论区自己的大标题就不再重复
  skinComments(kind === 'bangumi' ? undefined : { 'bili-comments-header-renderer': '#title { display: none !important; } #sort-actions { margin-left: 0 !important; } #navbar { padding-top: 20px !important; }' });
  if (location.hash === '#comment') {
    // 从动态卡片的「评论」点进来：评论区出现后滚过去（它是异步渲染的，最多等 10 秒）
    let n = 0;
    const tryScroll = () => {
      const c = document.querySelector('bili-comments, #comment-module, .bili-comment-container');
      if (c && c.getBoundingClientRect().height > 40) { c.scrollIntoView({ block: 'start' }); scrollBy(0, -80); return; }
      if (++n < 40) setTimeout(tryScroll, 250);
    };
    setTimeout(tryScroll, 300);
  }
  if (kind === 'bangumi') return null;
  return new DetailAside(kind, filter);
}
