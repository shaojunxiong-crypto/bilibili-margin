import type { Settings } from '../../shared/settings';
import { nav } from '../api/http';
import { ackSession, ats, fillPeople, likes, messages, readAllSessions, replies, sendText, sessions, system, systemRead, unread, type MsgCard, type Notice, type Page, type Session } from '../api/msg';
import { dayBucket, fmtAgo, h, icon, ICONS, svg } from './dom';
import { openLightbox } from './lightbox';
import { toast } from './controls';
import { csrf, PageShell } from './shell';
import { targetOfMsgCard } from '../filter-targets';

const msgCardData = new WeakMap<Element, MsgCard>();

/**
 * 系统通知正文 → 节点：B 站用 #{文字}{"链接"} 嵌链接，正文里也会直接放 https 链接；以前全被剥成纯文字点不了（B 站评论反馈）。
 * 只认 http(s) 链接，其余照纯文本输出。
 */
function noticeNodes(text: string): Node[] {
  const out: Node[] = [];
  const re = /#\{([^}]*)\}\{"?([^}"]*)"?\}|(https?:\/\/[^\s<>"'，。）)]+)/g;
  let i = 0, m: RegExpExecArray | null;
  const link = (label: string, href: string) => /^https?:\/\//.test(href)
    ? h('a', { href: href.replace(/^http:/, 'https:'), target: '_blank', rel: 'noopener' }, label) : document.createTextNode(label);
  while ((m = re.exec(text))) {
    if (m.index > i) out.push(document.createTextNode(text.slice(i, m.index)));
    out.push(m[3] ? link(m[3].length > 48 ? `${m[3].slice(0, 46)}…` : m[3], m[3]) : link(m[1], m[2]));
    i = m.index + m[0].length;
  }
  if (i < text.length) out.push(document.createTextNode(text.slice(i)));
  return out;
}

type View = 'whisper' | 'reply' | 'at' | 'like' | 'system';
const VIEWS: [View, string, string][] = [
  ['whisper', '我的消息', 'Chat'], ['reply', '回复我的', 'Reply'], ['at', '@ 我的', 'Mention'], ['like', '收到的赞', 'Like'], ['system', '系统通知', 'System'],
];
/** B 站原版的 hash 路由 → 我们的视图 */
const HASH: Record<string, View> = { whisper: 'whisper', reply: 'reply', at: 'at', love: 'like', system: 'system' };
const HASH_OF: Record<View, string> = { whisper: 'whisper', reply: 'reply', at: 'at', like: 'love', system: 'system' };

/** 消息中心：左侧目录（带未读数）+ 右侧阅读栏；私信是会话列表 + 对话 */
export class MessageApp {
  readonly shell: PageShell;
  private view: View;
  private nav!: HTMLElement;
  private pane!: HTMLElement;
  private me = 0;
  private gen = 0;
  /** 上次刷新当前视图的时间：标签页切回来太久没刷就自动重拉（点赞/回复不刷新的反馈） */
  private shownAt = 0;
  /** 已推过已读游标的视图：15 秒轮询会反复走 feed()，游标只推一次 */
  private marked = new Set<View>();

  constructor(settings: Settings) {
    this.shell = new PageShell(settings, 'msg');
    const m = location.hash.match(/^#\/?(\w+)/);
    this.view = HASH[m?.[1] ?? ''] ?? 'reply';
    // 预渲染防护：Chrome 会对「可能要访问的页面」提前预渲染（悬停链接 / 地址栏联想），取数发生在激活前，
    // 激活后看到的就是取数那一刻的旧列表——新开标签必旧、页内切换必新、F5 必新的元凶。
    // ① 还在预渲染：挂起，等激活（prerenderingchange）再开始渲染取数；② 已激活但 activationStart 很大（泡了很久）：自刷新一次。
    const doc = document as Document & { prerendering?: boolean };
    const nav0 = performance.getEntriesByType('navigation')[0] as (PerformanceNavigationTiming & { activationStart?: number }) | undefined;
    const act = nav0?.activationStart ?? 0;
    if (doc.prerendering === true) {
      // 事件 fire 在 document 上且不冒泡，挂在 window 上永远收不到（会停在挂起分支不渲染）
      document.addEventListener('prerenderingchange', () => this.boot(), { once: true });
      return;
    }
    this.boot(act);
  }

  /** 预渲染激活（或正常加载）后启动：所有取数都发生在激活之后，保证是当下数据 */
  private boot(act = 0): void {
    if (act > 3000) {
      // 这页在预渲染池里泡了很久（取数发生在激活前），自刷新一次换当下数据（reload 后 activationStart=0，不会循环）
      location.reload();
      return;
    }
    // 从顶栏消息面板进来的链接带 ?margin-fresh=1：立刻自刷新一次（先剥掉参数再 reload，不会循环）
    if (new URLSearchParams(location.search).has('margin-fresh')) {
      history.replaceState(null, '', location.pathname + location.hash);
      location.reload();
      return;
    }
    this.shell.filter.onChange(() => this.applyFilters());
    this.render();
    // 进入页面（广义）就强制取数：① 标签页切走超过 10 秒后切回；② bfcache 前进/后退恢复（DOM 是旧的）；
    // ③ 页面开着时每 15 秒检查一次；④ 窗口获得焦点（部分标签页恢复路径不发 visibilitychange，focus 兜底）。
    // 私信视图不自动刷（会冲掉正在输入的草稿）；重拉后滚动位置原样还回去。
    let hiddenAt = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > 10_000) { hiddenAt = 0; this.hardRefresh('切回标签页'); }
    });
    addEventListener('pageshow', (e) => { if ((e as PageTransitionEvent).persisted) this.hardRefresh('bfcache 恢复'); });
    addEventListener('focus', () => this.hardRefresh('窗口焦点'));
    setInterval(() => { if (!document.hidden) this.hardRefresh('轮询'); }, 15_000);
  }

  /** 强制重拉当前视图（广义的「进入页面」都会走到这里）；10 秒内不重复，私信视图不刷（护住输入中的草稿） */
  private hardRefresh(why: string): void {
    if (this.view === 'whisper' || Date.now() - this.shownAt < 10_000) return;
    const y = scrollY;
    this.refreshUnread();
    this.show();
    scrollTo({ top: y });
  }

  /** 只标记私信里的分享卡片，不动聊天文字、通知行和时间 */
  private applyFilters(): void {
    this.shell.main.querySelectorAll<HTMLElement>('.wh-card').forEach((card) => {
      const c = msgCardData.get(card);
      if (c) card.toggleAttribute('data-margin-filtered', !this.shell.filter.allows(targetOfMsgCard(c)));
    });
  }

  update(s: Settings): void { this.shell.update(s); }

  private render(): void {
    this.nav = h('nav', { class: 'ms-nav' },
      h('div', { class: 'eyebrow' }, h('span', { class: 'en' }, 'Inbox')),
      h('h1', { class: 'ms-h1' }, '消息'),
      ...VIEWS.map(([id, label]) => {
        const b = h('button', { class: 'ms-item', type: 'button', onclick: () => this.go(id) }, h('span', {}, label), h('b', { class: 'ms-n' }));
        b.dataset.view = id;
        return b;
      }));
    this.pane = h('section', { class: 'ms-pane' });
    this.shell.main.append(h('div', { class: 'ms' }, this.nav, this.pane));
    // hash 变化：切到已知视图就重渲染；hash 被清空 = 从顶栏「消息」重新进入本页
    // （顶栏链接没有 # 号，浏览器视为同文档导航、不刷新页面，列表会一直是上次的数据）→ 强制重拉
    addEventListener('hashchange', () => {
      const m = location.hash.match(/^#\/?(\w+)/);
      const v = HASH[m?.[1] ?? ''];
      if (v && v !== this.view) { this.view = v; this.show(); }
      else if (!v && this.shownAt) this.hardRefresh('顶栏重新进入');
    });
    nav().then((n) => {
      if (!n?.isLogin) { this.pane.replaceChildren(this.empty('登录后查看消息', h('a', { class: 'sp-follow', href: 'https://passport.bilibili.com/login', target: '_blank', rel: 'noopener' }, '去登录'))); return; }
      this.me = n.mid ?? 0;
      this.refreshUnread();
      this.show();
    }).catch(() => this.show());
  }

  /**
   * 私信面板铺满到视口底部（评论区 K-aloy：小屏上面板太矮、整页还能滚）。
   * 只在窗口尺寸变化时量一次位置，不在滚动里读布局。
   */
  private fitWhisper(wh: HTMLElement): void {
    const fit = () => {
      if (!wh.isConnected) { removeEventListener('resize', onResize); return; }
      const top = wh.getBoundingClientRect().top + scrollY;
      wh.style.height = `${Math.max(360, Math.round(innerHeight - top - 24))}px`;
    };
    let q = 0;
    const onResize = () => { if (!q) q = requestAnimationFrame(() => { q = 0; fit(); }); };
    requestAnimationFrame(fit);
    addEventListener('resize', onResize, { passive: true });
  }

  private async refreshUnread(): Promise<void> {
    const u = await unread().catch(() => null);
    if (!u) return;
    const n: Record<View, number> = { whisper: u.chat, reply: u.reply, at: u.at, like: u.like, system: u.system };
    this.nav.querySelectorAll<HTMLElement>('.ms-item').forEach((b) => { const v = b.dataset.view as View; const c = v === this.view && v !== 'whisper' ? 0 : n[v]; b.querySelector('.ms-n')!.textContent = c ? (c > 99 ? '99+' : String(c)) : ''; });
    // 顶栏角标同步：直接带上本次取到的未读总数，避免顶栏另发一次请求拿到不同口径的数字
    dispatchEvent(new CustomEvent('margin:unread', { detail: { total: u.reply + u.at + u.like + u.system + u.chat } }));
  }

  /** 左侧分类的未读数（v0.46：点开后立刻清掉 / 减掉，顶栏消息角标跟着刷新，不用等刷新页面） */
  private setCount(v: View, f: (n: number) => number): void {
    const el = this.nav.querySelector<HTMLElement>(`.ms-item[data-view="${v}"] .ms-n`);
    if (!el) return;
    const cur = el.textContent === '99+' ? 100 : Number(el.textContent) || 0;
    const n = Math.max(0, f(cur));
    el.textContent = n ? (n > 99 ? '99+' : String(n)) : '';
    dispatchEvent(new CustomEvent('margin:unread'));
  }

  private go(v: View): void {
    if (v === this.view) {
      // 重选当前分类 = 手动要求刷新（原先直接忽略，用户只能切走再切回来）
      if (!location.hash.includes('/mid')) this.hardRefresh('重选当前分类');
      return;
    }
    this.view = v;
    this.marked.delete(v);
    history.replaceState(null, '', `#/${HASH_OF[v]}`);
    this.show();
  }

  private show(): void {
    this.gen++;
    this.shownAt = Date.now();
    this.nav.querySelectorAll<HTMLElement>('.ms-item').forEach((b) => b.toggleAttribute('data-selected', b.dataset.view === this.view));
    const [, label, eb] = VIEWS.find((x) => x[0] === this.view)!;
    // 刷新按钮：列表更新偶尔慢半拍，手动一下立刻重拉
    this.pane.replaceChildren(h('header', { class: 'ms-head' },
      h('div', { class: 'eyebrow' }, h('span', { class: 'en' }, eb)), h('h2', {}, label),
      this.view !== 'whisper' ? h('button', { class: 'ghost small ms-refresh', type: 'button', title: '重新拉取最新消息', onclick: () => this.show() }, '刷新') : null));
    if (this.view === 'whisper') this.whisper();
    else this.feed();
  }

  private empty(text: string, extra?: Node): HTMLElement {
    return h('div', { class: 'ms-empty' }, h('p', {}, text), extra ?? null);
  }

  // ---- 通知流 ----
  private feed(): void {
    const gen = this.gen;
    const list = h('div', { class: 'ms-list' });
    const more = h('button', { class: 'ghost small ms-more', type: 'button' }, '加载更多');
    this.pane.append(list, more);
    let cursor: Page['cursor'] = null;
    let bucket = '';
    const fetcher = (c: Page['cursor']) => this.view === 'reply' ? replies(c) : this.view === 'at' ? ats(c) : this.view === 'like' ? likes(c) : system(csrf(), c);
    const load = async () => {
      more.disabled = true;
      list.append(...Array.from({ length: cursor ? 2 : 5 }, () => h('div', { class: 'ms-row sk' }, h('div', { class: 'ms-face' }), h('div', {}, h('div', { class: 'line' }), h('div', { class: 'line short' })))));
      try {
        const p = await fetcher(cursor);
        if (gen !== this.gen) return;
        const first = !cursor;
        list.querySelectorAll('.sk').forEach((n) => n.remove());
        p.list.forEach((n) => {
          const b = dayBucket(n.time, true);
          if (b !== bucket) { bucket = b; list.append(h('div', { class: 'ms-day' }, h('span', {}, b))); }
          list.append(this.row(n));
        });
        if (!cursor) {
          // 第一页拉到就算看过了：B 站在拉列表时已经记了已读，系统通知还要把游标推到最新
          const v = this.view;
          // 15 秒轮询会反复走 feed()，system 的已读游标只推一次（切分类回来会重新计）
          if (v === 'system' && p.top && !this.marked.has(v)) {
            this.marked.add(v);
            systemRead(p.top, csrf()).catch(() => {}).finally(() => this.setCount(v, () => 0));
          } else this.setCount(v, () => 0);
        }
        cursor = p.cursor;
        more.hidden = !cursor;
        if (!list.children.length) list.append(this.empty('这里还空着'));
      } catch (e) {
        if (gen !== this.gen) return;
        list.querySelectorAll('.sk').forEach((n) => n.remove());
        list.append(this.empty(`加载失败：${(e as Error).message}`));
        more.hidden = true;
      } finally { more.disabled = false; }
    };
    more.addEventListener('click', load);
    load();
  }

  private row(n: Notice): HTMLElement {
    const ext = { target: '_blank', rel: 'noopener' };
    if (n.kind === 'system') {
      return h('article', { class: 'ms-row sys' },
        h('div', { class: 'ms-main' },
          h('div', { class: 'ms-line' }, h('b', { class: 'ms-title' }, n.title), h('time', {}, fmtAgo(n.time))),
          h('p', { class: 'ms-text' }, ...noticeNodes(n.content)),
          n.url ? h('a', { class: 'ms-sys-go', href: n.url, ...ext }, '查看详情') : null));
    }
    const u = n.users[0];
    const names = n.users.slice(0, 2).map((x) => h('a', { class: 'ms-name', href: `https://space.bilibili.com/${x.mid}`, ...ext }, x.name));
    const who: Node[] = [];
    names.forEach((a, i) => { if (i) who.push(document.createTextNode('、')); who.push(a); });
    if (n.more > 0) who.push(h('span', { class: 'ms-more-n' }, ` 等 ${n.more + names.length} 人`));
    const badge = n.kind === 'like' ? svg('<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.1A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.8c0 5.5-7.5 10.1-7.5 10.1Z"/></svg>')
      : n.kind === 'at' ? document.createTextNode('@') : icon(ICONS.message);
    const showQuote = n.quote && n.quote !== n.title;
    return h('article', { class: `ms-row ${n.kind}` },
      h('a', { class: 'ms-faces', href: u ? `https://space.bilibili.com/${u.mid}` : '#', 'aria-label': u ? `${u.name} 的个人空间` : '个人空间', ...ext },
        ...n.users.slice(0, n.kind === 'like' ? 3 : 1).map((x) => h('img', { class: 'ms-face', src: x.face ? `${x.face}@80w_80h_1c.webp` : '', alt: '', referrerpolicy: 'no-referrer', loading: 'lazy' })),
        h('i', { class: 'ms-badge' }, badge)),
      h('div', { class: 'ms-main' },
        h('div', { class: 'ms-line' },
          h('p', { class: 'ms-sent' }, h('span', { class: 'ms-who' }, ...who), ' ', h('span', { class: 'ms-verb' }, n.verb),
            n.title ? h('a', { class: 'ms-obj', href: n.url || '#', ...ext }, n.title) : null),
          h('time', {}, fmtAgo(n.time))),
        // 先给上下文（你被回复 / @ 的那条），再给对方说的话；引用用左侧细线而不是同样的正文，避免短句看起来像两句回复（评论区 K-aloy）
        showQuote ? h('a', { class: 'ms-quote', href: n.url || '#', ...ext }, h('span', { class: 'ms-q-k' }, n.kind === 'reply' ? '你的评论' : '原文'), n.quote) : null,
        n.content ? h('p', { class: 'ms-text' }, n.content) : null,
        n.kind === 'reply' && n.url ? h('div', { class: 'ms-acts' }, h('a', { class: 'ms-act ghost', href: n.url, ...ext }, icon(ICONS.message), '去回复')) : null),
      n.image ? h('a', { class: 'ms-thumb', href: n.url || '#', 'aria-label': n.title ? `打开「${n.title}」` : '打开原内容', ...ext }, h('img', { src: `${n.image}@240w_150h_1c.webp`, alt: '', referrerpolicy: 'no-referrer', loading: 'lazy' })) : null);
  }

  // ---- 私信 ----
  private whisper(): void {
    const gen = this.gen;
    const list = h('div', { class: 'wh-list' });
    const chat = h('div', { class: 'wh-chat' }, this.empty('选一个会话开始聊天'));
    const wh = h('div', { class: 'wh' }, list, chat);
    this.pane.append(wh);
    this.fitWhisper(wh);
    const want = Number(location.hash.match(/mid(\d+)/)?.[1] || 0);
    // v0.49：会话分页（每页 20 个，滚到底自动加载下一页）+ 一键全部已读
    let endTs = 0, more = true, busy = false, bucket = '', first = true;
    const sentinel = h('button', { class: 'wh-more', type: 'button' }, '加载更多会话');
    sentinel.addEventListener('click', () => page());
    const readAll = h('button', { class: 'ghost small wh-readall', type: 'button', title: '把所有私信会话标为已读' }, '全部已读');
    readAll.addEventListener('click', async () => {
      readAll.setAttribute('disabled', '');
      readAll.textContent = '处理中…';
      try {
        const n = await readAllSessions(csrf(), (k) => { readAll.textContent = `已读 ${k}…`; });
        list.querySelectorAll('.wh-dot').forEach((d) => d.remove());
        this.setCount('whisper', () => 0);
        toast(this.shell.app, n ? `已把 ${n} 个会话标为已读` : '没有未读的私信');
      } catch { toast(this.shell.app, '操作失败，稍后再试'); }
      readAll.textContent = '全部已读';
      readAll.removeAttribute('disabled');
    });
    list.append(h('div', { class: 'wh-bar' }, h('span', {}, '会话'), readAll));
    const page = async () => {
      if (busy || !more || gen !== this.gen) return;
      busy = true;
      sentinel.textContent = '加载中…';
      try {
        const p = await sessions(endTs);
        if (gen !== this.gen) return;
        const ss = p.list;
        more = p.more; endTs = p.endTs;
        let target: Session | undefined;
        if (first) {
          first = false;
          if (!ss.length && !want) { sentinel.remove(); list.append(this.empty('还没有私信')); return; }
          target = ss.find((s) => s.talker === want);
          if (want && !target) {
            // 要打开的会话不在第一页：单独补昵称，不再显示成 UID（B 站评论反馈）
            target = { talker: want, unread: 0, last: '', ts: 0 };
            await fillPeople([target]);
            ss.unshift(target);
          }
        }
        ss.forEach((s) => {
          if (list.querySelector(`[data-talker="${s.talker}"]`)) return;
          const b = s.ts ? dayBucket(s.ts) : '';
          if (b && b !== bucket) { bucket = b; sentinel.before(h('div', { class: 'wh-day' }, b)); }
          sentinel.before(this.sessionRow(s, chat, list));
        });
        if (target) (list.querySelector(`[data-talker="${target.talker}"]`) as HTMLElement)?.click();
        if (!more) sentinel.remove();
      } catch (e) {
        if (gen === this.gen) { more = false; sentinel.replaceWith(this.empty(`加载失败：${(e as Error).message}`)); }
      } finally { busy = false; sentinel.textContent = '加载更多会话'; }
      // 重新观察一次：哨兵一直在可视区里时 IO 不会再回调（之前滚到底不加载就是这个原因）
      if (more && gen === this.gen && sentinel.isConnected) { io.unobserve(sentinel); io.observe(sentinel); }
    };
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) page(); }, { root: list, rootMargin: '0px 0px 300px 0px' });
    list.append(sentinel);
    io.observe(sentinel);
    page();
  }

  private sessionRow(s: Session, chat: HTMLElement, list: HTMLElement): HTMLElement {
    const name = s.person?.name || `UID ${s.talker}`;
    const b = h('button', { class: 'wh-s', type: 'button' },
      s.person?.face ? h('img', { class: 'ms-face', src: `${s.person.face}@80w_80h_1c.webp`, alt: '', referrerpolicy: 'no-referrer' }) : h('span', { class: 'ms-face wh-noface', 'aria-hidden': 'true' }, icon(ICONS.message)),
      h('span', { class: 'wh-sb' }, h('span', { class: 'wh-sn' }, h('b', {}, name), h('time', {}, s.ts ? fmtAgo(s.ts) : '')), h('span', { class: 'wh-sl' }, s.last)),
      s.unread ? h('i', { class: 'wh-dot' }, String(s.unread)) : null);
    b.dataset.talker = String(s.talker);
    b.addEventListener('click', () => {
      list.querySelectorAll('.wh-s').forEach((x) => x.toggleAttribute('data-selected', x === b));
      b.querySelector('.wh-dot')?.remove();
      history.replaceState(null, '', `#/whisper/mid${s.talker}`);
      this.openChat(s, name, chat);
    });
    return b;
  }

  private async openChat(s: Session, name: string, chat: HTMLElement): Promise<void> {
    const log = h('div', { class: 'wh-log' });
    const input = h('textarea', { class: 'wh-input', rows: 1, placeholder: `发消息给 ${name}`, maxlength: 500 }) as HTMLTextAreaElement;
    const send = h('button', { class: 'wh-send', type: 'button' }, '发送');
    chat.replaceChildren(
      h('header', { class: 'wh-head' }, h('a', { href: `https://space.bilibili.com/${s.talker}`, target: '_blank', rel: 'noopener' }, name), h('span', { class: 'eyebrow' }, `UID ${s.talker}`)),
      log, h('div', { class: 'wh-compose' }, input, send));
    const paint = (list: Awaited<ReturnType<typeof messages>>) => {
      const face = s.person?.face ? `${s.person.face}@80w_80h_1c.webp` : '';
      log.replaceChildren(...list.map((m, i) => {
        if (m.type === 18) return h('div', { class: 'wh-tip' }, m.text);
        const me = m.sender === this.me;
        const c = m.card;
        const card = c ? h(c.url ? 'a' : 'div', { class: 'wh-card', ...(c.url ? { href: c.url, target: '_blank', rel: 'noopener' } : {}) },
          c.cover ? h('img', { class: 'wh-card-cover', src: c.cover.includes('hdslb.com') ? `${c.cover}@480w.webp` : c.cover, alt: '', referrerpolicy: 'no-referrer', loading: 'lazy' }) : null,
          h('div', { class: 'wh-card-b' },
            c.title ? h('b', {}, c.title) : null,
            c.desc ? h('span', { class: 'wh-card-d' }, c.desc) : null,
            c.rows.length ? h('dl', {}, ...c.rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])) : null,
            c.url ? h('span', { class: 'wh-card-go' }, c.action || '查看详情') : null)) : null;
        if (card && c) {
          msgCardData.set(card, c);
          card.toggleAttribute('data-margin-filtered', !this.shell.filter.allows(targetOfMsgCard(c)));
        }
        // 对方的连续消息只在第一条前放头像（#2）
        const showFace = !me && (i === 0 || list[i - 1].sender !== m.sender || list[i - 1].type === 18);
        return h('div', { class: `wh-m${me ? ' me' : ''}${!me ? ' them' : ''}` },
          !me ? h('a', { class: `wh-mface${showFace ? '' : ' ghost'}`, href: `https://space.bilibili.com/${s.talker}`, target: '_blank', rel: 'noopener', 'aria-label': `${name} 的个人空间`, tabindex: showFace ? '0' : '-1' },
            showFace && face ? h('img', { src: face, alt: '', referrerpolicy: 'no-referrer' }) : null) : null,
          h('div', { class: 'wh-mb' },
            m.image ? h('a', { class: 'wh-mimg', href: m.image, target: '_blank', rel: 'noopener', 'aria-label': '查看图片', onclick: (ev: Event) => { const e = ev as MouseEvent;
              if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              const pics = list.filter((x) => x.image).map((x) => x.image as string);
              openLightbox(pics, pics.indexOf(m.image as string), log.getRootNode());
            } }, h('img', { src: /\.gif(\?|$)/i.test(m.image) ? m.image : `${m.image}@360w.webp`, alt: '', referrerpolicy: 'no-referrer', loading: 'lazy' })) : null,
            m.text ? h('p', {}, m.text) : null,
            card,
            h('time', {}, fmtAgo(m.ts))));
      }));
      log.scrollTop = log.scrollHeight;
    };
    try {
      const list = await messages(s.talker);
      paint(list);
      const seq = list.reduce((m, x) => Math.max(m, x.seq), 0);
      if (seq) ackSession(s.talker, seq, csrf()).catch(() => {});
      if (s.unread) { const n = s.unread; s.unread = 0; this.setCount('whisper', (c) => c - n); }
    } catch (e) { log.replaceChildren(this.empty(`加载失败：${(e as Error).message}`)); }
    const go = async () => {
      const text = input.value.trim();
      if (!text) return;
      send.disabled = true;
      const ok = await sendText(this.me, s.talker, text, csrf()).catch(() => false);
      send.disabled = false;
      if (!ok) { toast(this.shell.app, '发送失败'); return; }
      input.value = '';
      paint(await messages(s.talker).catch(() => []));
    };
    send.addEventListener('click', go);
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); go(); } });
    input.focus();
  }
}

