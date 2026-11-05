import type { Settings } from '../../shared/settings';
import { openBili } from '../navigation';
import { nav } from '../api/http';
import { clearHistory, deleteHistory, historyList, historyPaused, historySearch, setHistoryPaused, type Cursor, type HistItem, type HistKind } from '../api/history';
import { bvidFromHref } from '../tags';
import { dayBucket, fmtDuration, h, icon, ICONS } from './dom';
import { segmented, toast } from './controls';
import { PageShell } from './shell';
import { targetOfHistory } from '../filter-targets';

const KINDS: [HistKind, string][] = [['all', '全部'], ['archive', '视频'], ['live', '直播'], ['article', '专栏']];
const KIND_LABEL: Record<string, string> = { archive: 'VIDEO', pgc: 'BANGUMI', live: 'LIVE', article: 'ARTICLE', 'article-list': 'ARTICLE', cheese: 'COURSE' };
const ext = { target: '_blank', rel: 'noopener' };
const img = (src: string, w: number, hh: number) => h('img', { src: src ? `${src}@${w}w_${hh}h_1c.webp` : '', alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
const clock = (ts: number) => { const d = new Date(ts * 1000); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const histData = new WeakMap<Element, HistItem>();

/**
 * 历史记录：21st「Activity Timeline」(olewandowski1, 28340) 的结构——按天分组的分隔标签，
 * 每组一条竖向细轨，条目挂在轨上（时间 · 圆点 · 内容）。卡片沿用首页 / 空间列表的封面 + 衬线标题。
 */
export class HistoryApp {
  readonly shell: PageShell;
  private kind: HistKind = 'all';
  private keyword = '';
  private cursor: Cursor | null = null;
  private page = 1;
  private done = false;
  private loading = false;
  private gen = 0;
  private bucket = '';
  private group: HTMLElement | null = null;
  private list!: HTMLElement;
  private status!: HTMLElement;
  private sentinel!: HTMLElement;
  private count!: HTMLElement;
  private total = 0;

  constructor(settings: Settings) {
    this.shell = new PageShell(settings, 'hist');
    document.title = '历史记录 · 映间';
    this.render();
  }

  update(s: Settings): void { this.shell.update(s); }

  private render(): void {
    const s = this.shell;
    const rec = h('button', { class: 'hi-rec', type: 'button', role: 'switch', 'aria-checked': 'true' }, h('i'), h('span', {}, '记录历史'));
    rec.addEventListener('click', async () => {
      const on = rec.getAttribute('aria-checked') !== 'true';
      rec.setAttribute('aria-checked', String(on));
      try { await setHistoryPaused(!on); toast(s.app, on ? '已恢复记录观看历史' : '已暂停记录，之后看的视频不会出现在这里'); }
      catch (e) { rec.setAttribute('aria-checked', String(!on)); toast(s.app, `操作失败：${(e as Error).message}`); }
    });
    historyPaused().then((p) => rec.setAttribute('aria-checked', String(!p))).catch(() => { /* 未登录 */ });

    const input = h('input', { class: 'hi-input', type: 'search', placeholder: '搜索标题或 UP 主', enterkeyhint: 'search' });
    let t = 0;
    input.addEventListener('input', () => { clearTimeout(t); t = window.setTimeout(() => { this.keyword = input.value.trim(); this.reload(); }, 350); });
    const search = h('label', { class: 'hi-search' }, icon(ICONS.search), input);

    const clear = h('button', { class: 'ghost small', type: 'button' }, '清空历史');
    clear.addEventListener('click', async () => {
      if (!confirm('清空全部观看历史？\n清空后无法恢复。')) return;
      try { await clearHistory(); this.reload(); toast(s.app, '历史记录已清空'); } catch (e) { toast(s.app, `清空失败：${(e as Error).message}`); }
    });

    this.count = h('span', {});
    const seg = segmented<HistKind>(KINDS, this.kind, (v) => { this.kind = v; this.reload(); });
    const head = h('header', { class: 'hi-head' },
      h('div', {},
        h('div', { class: 'eyebrow' }, h('span', { class: 'en' }, 'History'), this.count),
        h('h1', { class: 'hi-h1' }, '历史记录')),
      h('div', { class: 'hi-tools' }, rec, clear));
    // #2：除时间线外加一个「网格」模式，接近 B 站原版排版，一屏看得更多；记在本机
    const DKEY = 'margin:hist-view';
    const wrap = h('div', { class: 'hs' });
    const applyView = (v: string) => wrap.classList.toggle('dense', v === 'grid');
    const view = segmented<string>([['line', '时间线'], ['grid', '网格']], localStorage.getItem(DKEY) || 'line', (v) => { localStorage.setItem(DKEY, v); applyView(v); });
    applyView(localStorage.getItem(DKEY) || 'line');
    const bar = h('div', { class: 'hi-bar' }, seg, h('div', { class: 'hi-bar-r' }, view, search));
    this.list = h('div', { class: 'hi-list' });
    this.status = h('div', { class: 'status' });
    this.sentinel = h('div', { class: 'sentinel' });
    wrap.append(head, bar, this.list, this.status, this.sentinel);
    s.main.append(wrap);
    new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) this.load(); }, { root: s.app, rootMargin: '900px 0px' }).observe(this.sentinel);
    this.shell.filter.onChange(() => this.applyFilters());

    nav().then((n) => {
      if (!n?.isLogin) {
        this.done = true;
        this.list.replaceChildren(h('div', { class: 'ms-empty' }, h('p', {}, '登录后查看观看历史'), h('a', { class: 'sp-follow', href: 'https://passport.bilibili.com/login', ...ext }, '去登录')));
        return;
      }
      this.load();
    }).catch(() => this.load());
  }

  private reload(): void {
    this.gen++;
    this.cursor = null; this.page = 1; this.done = false; this.loading = false;
    this.bucket = ''; this.group = null; this.total = 0; this.count.textContent = '';
    this.list.replaceChildren();
    this.status.textContent = '';
    this.load();
  }

  private async load(): Promise<void> {
    if (this.loading || this.done) return;
    this.loading = true;
    const gen = this.gen;
    const sk = Array.from({ length: this.total ? 2 : 5 }, () => h('div', { class: 'hi-row sk' }, h('span', { class: 'hi-time' }), h('i', { class: 'hi-dot' }), h('div', { class: 'hi-card' }, h('span', { class: 'hi-cover' }), h('div', {}, h('div', { class: 'line' }), h('div', { class: 'line short' })))));
    this.list.append(...sk);
    try {
      let items: HistItem[];
      if (this.keyword) {
        const r = await historySearch(this.keyword, this.page);
        items = r.list; this.page++; this.done = !r.more;
      } else {
        const r = await historyList(this.kind, this.cursor);
        items = r.list; this.cursor = r.cursor; this.done = !r.cursor;
      }
      if (gen !== this.gen) return;
      // 关键词也要能命中视频标签：先预热这批记录的标签
      await this.shell.filter.prepare(items.map((it) => bvidFromHref(it.url)));
      if (gen !== this.gen) return;
      sk.forEach((n) => n.remove());
      for (const it of items) this.add(it);
      this.applyFilters();
      this.total += items.length;
      this.count.textContent = this.total ? (this.done ? `${this.total} 条` : `${this.total}+ 条`) : '';
      if (!this.total) this.list.append(h('div', { class: 'ms-empty' }, h('p', {}, this.keyword ? `没有找到「${this.keyword}」` : '这里还空着')));
      else if (this.done) this.status.textContent = '— 到底了 —';
    } catch (e) {
      if (gen !== this.gen) return;
      sk.forEach((n) => n.remove());
      this.done = true;
      this.status.replaceChildren(h('span', {}, `加载失败：${(e as Error).message}`));
    } finally {
      if (gen === this.gen) this.loading = false;
    }
  }

  private add(it: HistItem): void {
    const b = dayBucket(it.viewAt, true);
    if (b !== this.bucket || !this.group) {
      this.bucket = b;
      this.group = h('ol', { class: 'hi-group' });
      this.list.append(h('div', { class: 'ms-day hi-day' }, h('span', {}, b)), this.group);
    }
    this.group.append(this.row(it));
  }

  private row(it: HistItem): HTMLElement {
    const done = it.progress === -1 || (it.duration > 0 && it.progress >= it.duration - 3);
    const pct = it.duration > 0 ? (done ? 100 : Math.max(2, Math.min(100, (it.progress / it.duration) * 100))) : 0;
    const prog = it.kind === 'live' ? (it.live ? '直播中' : '已下播')
      : it.duration ? (done ? '已看完' : `看到 ${fmtDuration(Math.max(0, it.progress))} / ${fmtDuration(it.duration)}`) : '';
    const cover = h('span', { class: 'hi-cover' }, img(it.cover, 320, 180),
      it.duration && it.kind !== 'live' ? h('span', { class: 'dur' }, fmtDuration(it.duration)) : null,
      it.live ? h('span', { class: 'hi-live' }, 'LIVE') : null,
      pct ? h('span', { class: 'hi-prog' }, h('i', { style: `width:${pct}%` })) : null);
    const del = h('button', { class: 'hi-del', type: 'button', 'aria-label': '删除这条记录', title: '删除这条记录' }, icon(ICONS.close));
    const li = h('li', { class: 'hi-row' },
      h('time', { class: 'hi-time' }, clock(it.viewAt)),
      h('i', { class: 'hi-dot' }),
      h('a', { class: 'hi-card', href: it.url, ...ext },
        cover,
        h('span', { class: 'hi-body' },
          h('span', { class: 'hi-title' }, it.title),
          h('span', { class: 'hi-meta' },
            it.face ? h('img', { class: 'hi-face', src: `${it.face}@48w_48h_1c.webp`, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null,
            upLink(it.author, it.mid),
            it.badge ? h('span', { class: 'hi-badge' }, it.badge) : null),
          h('span', { class: 'hi-note' }, h('span', { class: 'hi-kind' }, KIND_LABEL[it.kind] ?? it.kind.toUpperCase()), h('span', {}, it.device), prog ? h('span', {}, prog) : null))),
      del);
    del.addEventListener('click', async (e) => {
      e.preventDefault();
      li.classList.add('out');
      try {
        await deleteHistory(it.kid);
        setTimeout(() => { const g = li.parentElement; li.remove(); if (g && !g.children.length) { g.previousElementSibling?.remove(); g.remove(); } }, 260);
      } catch (err) { li.classList.remove('out'); toast(this.shell.app, `删除失败：${(err as Error).message}`); }
    });
    histData.set(li, it);
    li.toggleAttribute('data-margin-filtered', !this.shell.filter.allows(targetOfHistory(it)));
    return li;
  }

  /** 标记命中屏蔽词的记录，并藏掉没有可见行的日期分组 */
  private applyFilters(): void {
    const filter = this.shell.filter;
    const items = [...this.list.querySelectorAll<HTMLElement>('.hi-row')]
      .map((li) => histData.get(li))
      .filter((it): it is HistItem => !!it);
    void filter.prepare(items.map((it) => bvidFromHref(it.url))).then(() => {
      this.list.querySelectorAll<HTMLElement>('.hi-row').forEach((li) => {
        const it = histData.get(li);
        if (it) li.toggleAttribute('data-margin-filtered', !filter.allows(targetOfHistory(it)));
      });
      this.list.querySelectorAll<HTMLElement>('.hi-group').forEach((group) => {
        const hide = !group.querySelector('.hi-row:not([data-margin-filtered])');
        group.hidden = hide;
        const day = group.previousElementSibling;
        if (day?.classList.contains('hi-day')) (day as HTMLElement).hidden = hide;
      });
    });
  }
}

/** 卡片本身是链接，UP 主名不能再嵌一个 <a>；做成可聚焦的 role=link，点了去空间（#2） */
function upLink(name: string, mid: number): HTMLElement {
  const el = h('span', { class: `hi-up${mid ? ' link' : ''}` }, name || ' ');
  if (!mid) return el;
  el.setAttribute('role', 'link');
  el.tabIndex = 0;
  el.title = `${name} 的个人空间`;
  const go = (e: Event) => { e.preventDefault(); e.stopPropagation(); openBili(`https://space.bilibili.com/${mid}`, '_blank', 'noopener', e instanceof MouseEvent || e instanceof KeyboardEvent ? e : undefined); };
  el.addEventListener('click', go);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(e); });
  return el;
}
