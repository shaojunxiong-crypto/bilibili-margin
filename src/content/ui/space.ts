import type { Settings } from '../../shared/settings';
import { block, follow, followTags, setUserTags, userTags, spaceInfo, spaceRecent, spaceVideos, type SpaceInfo, type VideoOrder } from '../api/space';
import { spaceDynamics } from '../api/dyn';
import { videoCard, skeleton } from './card';
import { dynCard, dynData } from './dyn';
import { segmented, toast } from './controls';
import { fmtAgo, fmtCount, fmtDuration, h, icon, ICONS } from './dom';
import type { Video } from '../api/feed';
import { cardData } from './card';
import { attachPreview } from './preview';
import { csrf, PageShell } from './shell';
import { createFavorites } from './favorites';
import { createLaterDrawer } from './drawer';
import { createHistoryDrawer } from './history-drawer';
import { account } from '../api/account';
import { targetOfVideo, targetOfDyn } from '../filter-targets';
import type { FilterTarget } from '../filter';

type Tab = 'video' | 'dynamic' | 'coin' | 'like';
type Layout = 'grid' | 'list';
const LAYOUT_KEY = 'margin:space-layout';

/** 个人空间：封面 + 编辑部式身份栏 + 视频 / 动态 两栏切换 */
type LocalDrawers = { fav: { open: () => void }; hist: { open: () => void }; later: { open: () => void } };
let local: LocalDrawers | null = null;
/** 空间页自己的三个抽屉：挂在页面根节点上，不依赖顶层 Shell */
function drawers(root: HTMLElement): LocalDrawers {
  if (local) return local;
  const fav = createFavorites(() => { /* 空间页不做悬停预览 */ });
  const hist = createHistoryDrawer();
  const later = createLaterDrawer(() => root);
  root.append(fav.el, hist.el, later.el);
  local = { fav: fav as unknown as LocalDrawers['fav'], hist, later };
  return local;
}

export class SpaceApp {
  readonly shell: PageShell;
  private tab: Tab;
  private order: VideoOrder = 'pubdate';
  private page = 1;
  private offset = '';
  private done = false;
  private loading = false;
  private gen = 0;
  private list!: HTMLElement;
  private status!: HTMLElement;
  private sentinel!: HTMLElement;
  private sort!: HTMLElement;
  private layoutSeg!: HTMLElement;
  private layout: Layout = (localStorage.getItem(LAYOUT_KEY) as Layout) === 'list' ? 'list' : 'grid';
  private info: SpaceInfo | null = null;
  /** 投稿搜索词（v0.47，评论区：进了 UP 主页没法搜他的视频） */
  private q = '';
  private searchBox!: HTMLElement;
  /** 最近投币 / 点赞：进页面时各请求一次，对方公开了才出标签 */
  private recent: Partial<Record<'coin' | 'like', Video[]>> = {};

  constructor(settings: Settings, private mid: number, initial: Tab) {
    this.shell = new PageShell(settings, 'space');
    this.tab = initial;
    this.render();
  }

  update(s: Settings): void { this.shell.update(s); }

  private render(): void {
    const s = this.shell;
    const hero = h('section', { class: 'sp-hero' }, h('div', { class: 'sp-banner' }), h('div', { class: 'sp-id sk-id' },
      h('div', { class: 'sp-who' }, h('div', { class: 'line eb' }), h('div', { class: 'line' }), h('div', { class: 'line short' }))));
    const tabs = h('div', { class: 'tabs', role: 'tablist' });
    const mk = (id: Tab, label: string) => {
      const b = h('button', { class: 'tab', role: 'tab', type: 'button', 'aria-selected': String(id === this.tab), onclick: () => this.switchTab(id) }, label);
      b.dataset.tab = id;
      return b;
    };
    tabs.append(mk('video', '视频'), mk('dynamic', '动态'));
    const input = h('input', { type: 'search', class: 'sp-q-in', placeholder: '搜索 TA 的视频', 'aria-label': '搜索 TA 的视频', autocomplete: 'off' }) as HTMLInputElement;
    let qt = 0;
    const apply = () => { const v = input.value.trim(); if (v === this.q) return; this.q = v; this.reload(); };
    input.addEventListener('input', () => { clearTimeout(qt); qt = window.setTimeout(apply, 400); });
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { clearTimeout(qt); apply(); } if (e.key === 'Escape') { input.value = ''; clearTimeout(qt); apply(); } });
    this.searchBox = h('label', { class: 'sp-q' }, icon(ICONS.search), input);
    this.sort = segmented<VideoOrder>([['pubdate', '最新发布'], ['click', '最多播放']], this.order, (v) => { this.order = v; this.reload(); });
    this.sort.classList.add('sp-sort');
    this.layoutSeg = segmented<Layout>([['grid', '网格'], ['list', '列表']], this.layout, (v) => { this.layout = v; localStorage.setItem(LAYOUT_KEY, v); this.reload(); });
    this.layoutSeg.classList.add('sp-sort', 'sp-layout');
    const bar = h('div', { class: 'bar sp-bar' }, h('div', { class: 'bar-row' }, tabs, h('div', { class: 'sp-tools' }, this.searchBox, this.sort, this.layoutSeg)));
    this.list = h('section', { class: 'grid' });
    this.status = h('div', { class: 'status' });
    this.sentinel = h('div', { class: 'sentinel' });
    attachPreview(this.list, () => s.settings.hoverPreview);
    // 吸顶时标签变成和首页一样的玻璃胶囊，不再直接压在封面上（v0.47.1）
    const barMark = h('div', { class: 'bar-mark', 'aria-hidden': 'true' });
    s.main.append(hero, barMark, bar, this.list, this.status, this.sentinel);
    new IntersectionObserver(([e]) => { bar.classList.toggle('stuck', !e.isIntersecting && e.boundingClientRect.top < 80); }, { root: s.app, rootMargin: '-72px 0px 0px 0px', threshold: 0 }).observe(barMark);

    spaceInfo(this.mid).then((info) => { this.info = info; hero.replaceWith(this.hero(info)); document.title = `${info.name} · 映间`; this.paintTabs(tabs); })
      .catch((e) => hero.replaceWith(h('section', { class: 'sp-hero' }, h('div', { class: 'sp-banner' }), h('div', { class: 'sp-id' }, h('div', { class: 'sp-who' }, h('h1', {}, `UID ${this.mid}`), h('p', { class: 'sp-sign' }, `资料加载失败：${(e as Error).message}`))))));
    new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) this.load(); }, { root: s.app, rootMargin: '900px 0px' }).observe(this.sentinel);
    this.shell.filter.onChange(() => this.applyFilters());
    this.applyTabUi();
    this.load();
    for (const [k, label] of [['coin', '最近投币'], ['like', '最近点赞']] as const) {
      spaceRecent(this.mid, k).then((list) => {
        if (!list?.length) { if (this.tab === k) this.switchTab('video'); return; }
        this.recent[k] = list;
        const b = mk(k, label);
        b.append(h('span', { class: 'tab-n' }, String(list.length)));
        const after = k === 'like' ? tabs.querySelector('[data-tab=coin]') ?? tabs.querySelector('[data-tab=dynamic]') : tabs.querySelector('[data-tab=dynamic]');
        after?.after(b);
        b.setAttribute('aria-selected', String(this.tab === k));
      }).catch(() => {});
    }
  }

  /** 用户明确点进某个 UP 的空间：只保留「隐藏广告」，关键词 / UP / 播放量 / 时长 / 标签等全局过滤都不套用 */
  private allows(t: FilterTarget): boolean {
    return !(this.shell.settings.hideAds && t.ad === true);
  }

  /** 屏蔽设置变化后重新标记已渲染的卡片（空间页只受「隐藏广告」影响） */
  private applyFilters(): void {
    this.list.querySelectorAll<HTMLElement>('.card').forEach((card) => {
      const v = cardData.get(card);
      if (v) card.toggleAttribute('data-margin-filtered', !this.allows(targetOfVideo(v)));
    });
    this.list.querySelectorAll<HTMLElement>('.dy').forEach((card) => {
      const d = dynData.get(card);
      if (d) card.toggleAttribute('data-margin-filtered', !this.allows(targetOfDyn(d)));
    });
  }

  private paintTabs(tabs: HTMLElement): void {
    const v = tabs.querySelector('[data-tab=video]');
    if (v && this.info?.videoCount) v.append(h('span', { class: 'tab-n' }, fmtCount(this.info.videoCount)));
  }

  private hero(i: SpaceInfo): HTMLElement {
    const followBtn = h('button', { class: `sp-follow${i.isFollowing ? ' on' : ''}`, type: 'button' }, i.isFollowing ? '已关注' : '+ 关注');
    // v0.49：已关注时点按钮弹菜单（设置分组 / 取消关注），不再一点就取关；关注成功后直接弹出分组；「⋯」里可以拉黑
    const menu = h('div', { class: 'sp-menu', role: 'menu', hidden: '' });
    const closeMenu = () => { menu.hidden = true; document.removeEventListener('pointerdown', outside, true); };
    const outside = (e: Event) => { if (!e.composedPath().some((n) => n === menu || n === followBtn || n === moreBtn)) closeMenu(); };
    const openMenu = (nodes: Node[]) => {
      menu.replaceChildren(...nodes);
      menu.hidden = false;
      setTimeout(() => document.addEventListener('pointerdown', outside, true));
    };
    menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); followBtn.focus(); } });
    const item = (label: string, fn: () => void, danger = false) => h('button', { class: `sp-mi${danger ? ' danger' : ''}`, type: 'button', role: 'menuitem', onclick: fn }, label);
    const setFollowing = (on: boolean) => { followBtn.classList.toggle('on', on); followBtn.textContent = on ? '已关注' : '+ 关注'; };
    const groups = async () => {
      const token = csrf();
      openMenu([h('div', { class: 'sp-mh' }, '设置分组'), h('div', { class: 'sp-mload' }, '加载中…')]);
      const [tags, mine] = await Promise.all([followTags(), userTags(i.mid)]);
      const picked = new Set(mine);
      const boxes = tags.filter((t) => t.id > 0 || t.id === -10).map((t) => {
        const cb = h('input', { type: 'checkbox' }) as HTMLInputElement;
        cb.checked = picked.has(t.id);
        cb.addEventListener('change', () => { if (cb.checked) picked.add(t.id); else picked.delete(t.id); });
        return h('label', { class: 'sp-mc' }, cb, h('span', {}, t.name), h('i', {}, String(t.count)));
      });
      const save = h('button', { class: 'sp-msave', type: 'button' }, '保存');
      save.addEventListener('click', async () => {
        save.setAttribute('disabled', '');
        const ok = await setUserTags(i.mid, [...picked], token).catch(() => false);
        toast(this.shell.app, ok ? (picked.size ? '已设置分组' : '已移到默认分组') : '设置失败，请稍后再试');
        if (ok) closeMenu(); else save.removeAttribute('disabled');
      });
      openMenu([h('div', { class: 'sp-mh' }, '设置分组'), boxes.length ? h('div', { class: 'sp-mlist' }, ...boxes) : h('div', { class: 'sp-mload' }, '还没有自建分组，未选即默认分组'), h('div', { class: 'sp-mfoot' }, save)]);
      (menu.querySelector('input,button') as HTMLElement | null)?.focus();
    };
    followBtn.setAttribute('aria-haspopup', 'menu');
    followBtn.addEventListener('click', async () => {
      const token = csrf();
      if (!token) { window.open('https://passport.bilibili.com/login', '_blank', 'noopener'); return; }
      if (followBtn.classList.contains('on')) {
        if (!menu.hidden) { closeMenu(); return; }
        openMenu([
          item('设置分组', () => { groups(); }),
          item('取消关注', async () => {
            closeMenu();
            const ok = await follow(i.mid, false, token).catch(() => false);
            if (!ok) { toast(this.shell.app, '操作失败，请稍后再试'); return; }
            setFollowing(false);
          }, true),
        ]);
        (menu.querySelector('button') as HTMLElement | null)?.focus();
        return;
      }
      followBtn.disabled = true;
      const ok = await follow(i.mid, true, token).catch(() => false);
      followBtn.disabled = false;
      if (!ok) { toast(this.shell.app, '操作失败，请稍后再试'); return; }
      setFollowing(true);
      groups();
    });
    const moreBtn = h('button', { class: 'sp-more', type: 'button', 'aria-label': '更多操作', 'aria-haspopup': 'menu', title: '更多' }, icon('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'));
    moreBtn.addEventListener('click', () => {
      if (!menu.hidden) { closeMenu(); return; }
      const token = csrf();
      if (!token) { window.open('https://passport.bilibili.com/login', '_blank', 'noopener'); return; }
      openMenu([item(`拉黑 ${i.name}`, async () => {
        closeMenu();
        if (!confirm(`确定把 ${i.name} 加入黑名单？拉黑后对方不能关注你、给你发私信和评论。`)) return;
        const ok = await block(i.mid, true, token).catch(() => false);
        toast(this.shell.app, ok ? '已加入黑名单，可在 B 站设置 → 黑名单管理里移出' : '操作失败，请稍后再试');
        if (ok) setFollowing(false);
      }, true)]);
      (menu.querySelector('button') as HTMLElement | null)?.focus();
    });
    const stat = (n: number, label: string, href?: string) => {
      const inner = [h('b', {}, fmtCount(n)), h('span', {}, label)];
      return href ? h('a', { class: 'sp-stat', href, target: '_blank', rel: 'noopener' }, ...inner) : h('div', { class: 'sp-stat' }, ...inner);
    };
    const acts = h('div', { class: 'sp-acts' },
      followBtn,
      h('a', { class: 'sp-msg', href: `https://message.bilibili.com/#/whisper/mid${i.mid}`, target: '_blank', rel: 'noopener' }, icon(ICONS.message), '私信'),
      moreBtn, menu);
    // 自己的空间：关注 / 私信换成收藏夹、历史记录、稍后再看（用户反馈：不想每次去顶栏找）
    account().then((me) => {
      if (!me || me.mid !== i.mid) return;
      // 21st「Glass Button」(jahed, 4922)：玻璃胶囊 + 图标底片，hover 微抬。抽屉在这里本地创建，
      // 不依赖 shell（空间页是独立 PageShell，顶层 Shell 可能没构造，panels 为空会导致点了没反应）
      const openPanel = (kind: 'fav' | 'hist' | 'later', fallback: string) => {
        try { drawers(this.shell.app)[kind].open(); }
        catch (e) { console.warn('[映间] 抽屉打开失败，退回原页面', e); window.open(fallback, '_blank', 'noopener'); }
      };
      const tile = (label: string, ic: string, run: () => void) => {
        const b = h('button', {
          class: 'sp-tile', type: 'button', onclick: run,
          style: 'display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:13px;border:1px solid rgba(255,255,255,.14);'
            + 'background:rgba(255,255,255,.06);color:inherit;font:inherit;font-size:13px;cursor:pointer;'
            + 'backdrop-filter:blur(14px) saturate(1.3);-webkit-backdrop-filter:blur(14px) saturate(1.3);'
            + 'transition:transform .18s cubic-bezier(.22,.61,.36,1),background .18s,border-color .18s,box-shadow .18s',
        },
          h('span', { style: 'display:grid;place-items:center;width:24px;height:24px;border-radius:9px;background:rgba(255,255,255,.1)' }, icon(ic)),
          label);
        b.onmouseenter = () => { b.style.transform = 'translateY(-2px)'; b.style.background = 'rgba(255,255,255,.13)'; b.style.borderColor = 'rgba(255,255,255,.28)'; b.style.boxShadow = '0 8px 24px rgba(0,0,0,.28)'; };
        b.onmouseleave = () => { b.style.transform = ''; b.style.background = 'rgba(255,255,255,.06)'; b.style.borderColor = 'rgba(255,255,255,.14)'; b.style.boxShadow = ''; };
        return b;
      };
      acts.replaceChildren(
        tile('收藏夹', ICONS.fav, () => openPanel('fav', 'https://www.bilibili.com/#fav')),
        tile('历史记录', ICONS.history, () => openPanel('hist', 'https://www.bilibili.com/history')),
        tile('稍后再看', ICONS.later, () => openPanel('later', 'https://www.bilibili.com/#later')));
      acts.classList.add('sp-acts-self');
    }).catch(() => {});
    return h('section', { class: 'sp-hero' },
      h('div', { class: `sp-banner${i.banner ? ' has' : ''}`, style: i.banner ? `--img:url("${i.banner}@1600w.webp")` : '' }),
      h('div', { class: 'sp-id' },
        h('div', { class: 'sp-who' },
          h('div', { class: 'sp-kicker' },
            h('img', { class: 'sp-face', src: `${i.face}@120w_120h_1c.webp`, alt: '', referrerpolicy: 'no-referrer' }),
            h('div', { class: 'eyebrow' }, h('span', { class: 'en' }, 'Space'), h('span', { class: 'caps' }, `UID ${i.mid}`), h('span', { class: 'no' }, `LV${i.level}`), i.vip ? h('span', { class: 'sp-vip' }, i.vip) : null)),
          h('h1', {}, i.name),
          i.official ? h('p', { class: 'sp-official' }, i.official) : null,
          i.sign ? h('p', { class: 'sp-sign' }, i.sign) : null),
        h('div', { class: 'sp-side' },
          h('div', { class: 'sp-stats' },
            stat(i.follower, '粉丝', `https://space.bilibili.com/${i.mid}/fans/fans`),
            stat(i.following, '关注', `https://space.bilibili.com/${i.mid}/fans/follow`),
            i.likes ? stat(i.likes, '获赞') : null,
            i.views ? stat(i.views, '播放') : null),
          acts)),
    );
  }

  /** 列表视图的一行：编号 + 小封面 + 衬线标题 + 右侧小注（21st Editorial service list 的版式） */
  private row(v: Video, n: number): HTMLElement {
    const href = `https://www.bilibili.com/video/${v.bvid}`;
    const ext = { target: '_blank', rel: 'noopener' };
    const el = h('article', { class: 'card vrow' },
      h('span', { class: 'vr-no' }, String(n).padStart(2, '0')),
      h('a', { class: 'cover', href, ...ext, title: v.title },
        h('img', { src: v.cover ? `${v.cover}@320w_180h_1c.webp` : '', alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }),
        v.duration ? h('span', { class: 'dur' }, fmtDuration(v.duration)) : null,
        v.badge ? h('span', { class: 'tag-charge', title: v.badge }, v.badge) : null),
      h('a', { class: 'vr-title', href, ...ext }, v.title),
      h('span', { class: 'vr-note' }, h('span', {}, `${fmtCount(v.views)} 播放`), h('span', {}, fmtAgo(v.pubdate))),
      h('a', { class: 'vr-go', href, ...ext, 'aria-label': '打开' }, icon(ICONS.arrow)));
    cardData.set(el, v);
    return el;
  }

  private switchTab(t: Tab): void {
    if (t === this.tab) return;
    this.tab = t;
    history.replaceState(null, '', `/${this.mid}${t === 'dynamic' ? '/dynamic' : ''}`);
    this.applyTabUi();
    this.reload();
  }

  private applyTabUi(): void {
    this.shell.main.querySelectorAll<HTMLElement>('.sp-bar .tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === this.tab)));
    const vid = this.tab !== 'dynamic';
    this.sort.hidden = this.tab !== 'video';
    this.searchBox.hidden = this.tab !== 'video';
    this.layoutSeg.hidden = !vid;
    this.list.className = vid ? (this.layout === 'list' ? 'vlist' : 'grid') : 'dy-list';
  }

  private reload(): void {
    this.gen++;
    this.page = 1; this.offset = ''; this.done = false; this.loading = false;
    this.list.replaceChildren();
    this.status.replaceChildren();
    this.applyTabUi();
    this.load();
  }

  private async load(): Promise<void> {
    if (this.loading || this.done) return;
    this.loading = true;
    const gen = this.gen;
    const vid = this.tab !== 'dynamic';
    const listMode = vid && this.layout === 'list';
    const sk = listMode ? h('div', { class: 'vrow sk' }, h('div', { class: 'line' })) : vid ? skeleton(this.list.children.length ? 5 : 15) : h('div', { class: 'dy sk' }, h('div', { class: 'line' }), h('div', { class: 'line' }), h('div', { class: 'line short' }));
    const skNodes = sk instanceof DocumentFragment ? [...sk.childNodes] : [sk];
    this.list.append(sk);
    try {
      if (this.tab === 'coin' || this.tab === 'like') {
        const list = this.recent[this.tab] ?? (await spaceRecent(this.mid, this.tab)) ?? [];
        if (gen !== this.gen) return;
        skNodes.forEach((n) => (n as Element).remove());
        list.forEach((v, i) => this.list.append(listMode ? this.row(v, i + 1) : videoCard(v, i, { compact: false })));
        this.done = true;
        if (!list.length) this.status.replaceChildren(h('span', {}, '对方没有公开，或者最近没有'));
      } else if (this.tab === 'video') {
        const r = await spaceVideos(this.mid, this.page++, this.order, this.q);
        if (gen !== this.gen) return;
        skNodes.forEach((n) => (n as Element).remove());
        const start = this.list.children.length;
        r.list.forEach((v, i) => {
          const card = listMode ? this.row(v, start + i + 1) : videoCard(v, start + i, { compact: false });
          card.toggleAttribute('data-margin-filtered', !this.allows(targetOfVideo(v)));
          this.list.append(card);
        });
        this.done = r.list.length === 0 || this.list.children.length >= r.total;
        if (!this.list.children.length) this.status.replaceChildren(h('span', {}, this.q ? `没有找到「${this.q}」相关的视频` : '还没有投稿'));
      } else {
        const r = await spaceDynamics(this.mid, this.offset);
        if (gen !== this.gen) return;
        skNodes.forEach((n) => (n as Element).remove());
        this.offset = r.offset;
        r.list.forEach((d) => {
          const card = dynCard(d);
          card.toggleAttribute('data-margin-filtered', !this.allows(targetOfDyn(d)));
          this.list.append(card);
        });
        this.done = !r.more;
        if (!this.list.children.length) this.status.replaceChildren(h('span', {}, '还没有动态'));
      }
      if (this.done && this.list.children.length) this.status.replaceChildren(h('span', {}, '没有更多了'));
    } catch (err) {
      if (gen !== this.gen) return;
      skNodes.forEach((n) => (n as Element).remove());
      this.status.replaceChildren(h('span', {}, `加载失败：${(err as Error).message}`), h('button', { class: 'ghost small', type: 'button', onclick: () => this.load() }, '重试'));
    } finally {
      if (gen === this.gen) this.loading = false;
    }
    requestAnimationFrame(() => {
      if (!this.done && !this.loading && this.sentinel.getBoundingClientRect().top < innerHeight + 900) this.load();
    });
  }
}
