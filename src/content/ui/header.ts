import { every } from '../sched';
import { loadSettings, onSettingsChange, type Settings } from '../../shared/settings';
import { account, dynamicUpdates, resetDynamicBaseline, unreadTotal } from '../api/account';
import { onMsgRead } from '../api/msg';
import { h, icon, ICONS, setMarkup } from './dom';
import { createExpandableTabs, type TabItem, type TabSpec } from './expandable-tabs';
import { createUserMenu } from './user-menu';
import { createSunMoon, type SunMoon } from './sun-moon';
import { attachTooltips } from './tooltip';
import { BILI_TIGHT } from './intro/logo';
import { liveTv } from './tv-eyes';
import { attachHoverList, POPS, type PopHandle } from './dyn-pop';
import { createSettingsButton } from './settings-btn';
import type { FilterRuntime } from '../filter-runtime';
import { openBili } from '../navigation';

/** 顶栏左上角的小电视：开场动画结束时图标就飞落到这里 */
function tv(): HTMLElement { const s = h('span', { class: 'tv', 'aria-hidden': 'true' }); setMarkup(s, BILI_TIGHT); liveTv(s); return s; }

export interface Header {
  el: HTMLElement;
  input: HTMLInputElement;
  sunMoon: SunMoon;
  /** 液态玻璃块：搜索框、快捷入口胶囊、选中滑块 */
  glass: HTMLElement[];
  thumb: HTMLElement;
  /** 消息提醒开关（v0.47）：关闭时不再轮询 unread / 动态更新，并清掉两个角标 */
  setMsgRemind(on: boolean): void;
}

/** B 站原版顶栏的那组入口：直播、大会员、消息、动态、历史、创作中心（消息和动态带未读角标） */
export const SITE_LINKS: TabSpec[] = [
  { title: '分区', icon: ICONS.zone, href: 'https://www.bilibili.com/anime/' },
  { title: '直播', icon: ICONS.live, href: 'https://live.bilibili.com/' },
  { title: '大会员', icon: ICONS.vip, href: 'https://account.bilibili.com/big' },
  { title: '消息', icon: ICONS.message, href: 'https://message.bilibili.com/', id: 'msg' },
  { title: '动态', icon: ICONS.moments, href: 'https://t.bilibili.com/', id: 'dyn', run: resetDynamicBaseline },
  { title: '历史', icon: ICONS.history, href: 'https://www.bilibili.com/history' },
  { title: '创作中心', icon: ICONS.creator, href: 'https://member.bilibili.com/platform/home' },
];

/** 首页和播放页共用的顶栏：标志、搜索、Expandable Tabs、日月主题按钮、投稿、头像 */
export function createHeader(o: { tabs: TabItem[]; onTheme: () => void; onSearch?: (q: string) => void; onSettings?: () => void; msgRemind?: () => boolean; filter?: FilterRuntime }): Header {
  let msgOn = o.msgRemind?.() ?? true;
  const user = h('a', { class: 'user', href: 'https://passport.bilibili.com/login', target: '_blank', rel: 'noopener' }, '登录');
  const userSlot = h('div', { class: 'um-wrap' }, user);
  const upload = h('a', { class: 'upload', href: 'https://member.bilibili.com/platform/upload/video/frame', target: '_blank', rel: 'noopener' }, icon(ICONS.upload), h('span', {}, '投稿'));

  const input = h('input', { type: 'search', placeholder: '搜索视频、UP 主', autocomplete: 'off', 'aria-label': '搜索' }) as HTMLInputElement;
  const search = h('form', {
    class: 'search', role: 'search',
    onsubmit: (e: Event) => {
      e.preventDefault();
      const q = input.value.trim();
      if (q) openBili(`https://search.bilibili.com/all?keyword=${encodeURIComponent(q)}`);
    },
  }, icon(ICONS.search), input, h('kbd', {}, '/'));
  if (o.onSearch) {
    // 顶栏搜索框只做入口：点一下、或开始打字，就交给命令面板
    input.readOnly = true;
    const openP = () => { const q = input.value; input.value = ''; input.blur(); o.onSearch!(q); };
    search.addEventListener('pointerdown', (e) => { e.preventDefault(); openP(); });
    input.addEventListener('focus', openP);
  }

  const tabsNav = createExpandableTabs(o.tabs);
  // 点顶栏「消息」或悬停面板里的分类行都会开新标签页：先乐观清掉本页角标，
  // 消息页读完列表后广播 margin:msg-read，onMsgRead 再按服务端真值对齐（含误清纠正）
  addEventListener('click', (e) => {
    if (e.composedPath().some((n) => n instanceof HTMLAnchorElement && /^https:\/\/message\.bilibili\.com\//.test(n.href))) tabsNav.badge('msg', 0);
  }, true);
  // 直播 / 消息 / 动态 / 历史 / 收藏 / 稍后：停留 1.5 秒弹出悬停列表
  let msgPop: PopHandle | null = null;
  const popHandles: PopHandle[] = [];
  for (const b of tabsNav.buttons) {
    const label = b.getAttribute('aria-label') ?? '';
    const mk = POPS[label];
    if (!mk) continue;
    const pop = attachHoverList(b, mk({ onDyn: () => { resetDynamicBaseline(); tabsNav.badge('dyn', 0); }, msgRemind: () => msgOn }), o.filter);
    popHandles.push(pop);
    if (label === '消息') msgPop = pop;
  }
  // 默认保留旧版顺序；自定义排序包含个人入口时，各项按同一序列排列。
  const applyPrefs = (st: Settings) => {
    upload.hidden = st.headHide.includes('投稿');
    const siteIdx = new Map(SITE_LINKS.map((l, i) => [l.title, i]));
    const titles = tabsNav.buttons.map((b) => b.querySelector('span')?.textContent ?? '');
    const personal = st.headOrder.some((t) => titles.includes(t) && !siteIdx.has(t));
    const available = personal ? titles : SITE_LINKS.map((l) => l.title);
    const order = [...st.headOrder.filter((t) => available.includes(t)),...available.filter((t) => !st.headOrder.includes(t))];
    for (const b of tabsNav.buttons) {
      const t = b.querySelector('span')?.textContent ?? '';
      b.hidden = t !== '设置' && st.headHide.includes(t);
      b.style.order = personal || siteIdx.has(t) ? String(order.indexOf(t)) : '30';
    }
    tabsNav.el.querySelectorAll<HTMLElement>('.et-sep').forEach((x) => { x.style.order = '20'; x.hidden = personal || tabsNav.buttons.every((b) => b.hidden || !siteIdx.has(b.querySelector('span')?.textContent ?? '')); });
    tabsNav.el.querySelector<HTMLElement>('.et-thumb')?.style.setProperty('order', '-1');
  };
  loadSettings().then(applyPrefs).catch(() => {});
  onSettingsChange((n, p) => { if (n.headHide.join() !== p.headHide.join() || n.headOrder.join() !== p.headOrder.join()) applyPrefs(n); });
  // 屏蔽词/隐藏广告变化后，悬停列表的 60 秒缓存要失效
  o.filter?.onChange(() => popHandles.forEach((p) => p.invalidate()));
  const sunMoon = createSunMoon(o.onTheme);
  const el = h('header', { class: 'top' },
    h('a', { class: 'brand', href: 'https://www.bilibili.com/', title: '首页', 'aria-label': '首页' }, tv()),
    search,
    h('div', { class: 'acts' }, tabsNav.el, sunMoon.el, o.onSettings ? createSettingsButton(o.onSettings) : null, upload, userSlot),
  );

  account().then((a) => {
    if (!a) return;
    userSlot.replaceWith(createUserMenu(a));
    // 消息中心里点开消息后（v0.46）重新拉一次未读，顶栏角标立刻跟上；关闭消息提醒时完全忽略
    let unreadT = 0;
    addEventListener('margin:unread', (e) => {
      if (!msgOn) return;
      clearTimeout(unreadT);
      // 事件里带了刚取到的未读总数（下拉面板 / 消息页）：直接用，避免再发一次请求、口径或时点又对不上
      const total = (e as CustomEvent<{ total?: number }>).detail?.total;
      if (typeof total === 'number') { tabsNav.badge('msg', total); return; }
      unreadT = window.setTimeout(() => unreadTotal().then((n) => tabsNav.badge('msg', n)).catch(() => {}), 600);
    });
    // 未读角标：页面可见时每 2 分钟问一次；切回标签页时立即刷新。
    // 消息提醒同时管动态：关闭后消息和动态的角标都不再轮询。
    let polled = 0;
    const pollMsg = (force = false) => {
      if (!msgOn || (document.hidden && !force)) return;
      polled = Date.now();
      unreadTotal().then((n) => tabsNav.badge('msg', n)).catch(() => {});
    };
    const pollDyn = () => {
      if (!msgOn || document.hidden) return;
      polled = Date.now();
      dynamicUpdates().then((n) => tabsNav.badge('dyn', n)).catch(() => {});
    };
    const poll = () => { pollDyn(); pollMsg(); };
    poll();
    every(120_000, poll);
    // 消息在别的标签页被读掉：立刻按服务端真值对齐（隐藏页也更新，切回来不会挂着旧数字）
    onMsgRead(() => pollMsg(true));
    // 刚在别的标签读完消息也要更新；只合并同一次恢复触发的 focus / visibility 事件。
    const onReturn = () => { if (Date.now() - polled > 500) poll(); };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) onReturn(); });
    addEventListener('focus', onReturn);
  }).catch(() => {});

  const setMsgRemind = (on: boolean) => {
    if (msgOn === on) return;
    msgOn = on;
    if (!on) {
      tabsNav.badge('msg', 0);
      tabsNav.badge('dyn', 0);
      msgPop?.close();
    } else if (!document.hidden) {
      unreadTotal().then((n) => tabsNav.badge('msg', n)).catch(() => {});
      dynamicUpdates().then((n) => tabsNav.badge('dyn', n)).catch(() => {});
    }
  };

  if (!user.classList.contains('in')) user.dataset.tip = '登录 B 站';
  search.dataset.tip = '搜索';
  search.dataset.kbd = o.onSearch ? 'Ctrl K' : '/';
  attachTooltips(el);

  if (!o.onSearch) addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const typing = e.composedPath().some((n) => n instanceof HTMLInputElement || n instanceof HTMLTextAreaElement || (n instanceof HTMLElement && n.isContentEditable));
    if (typing) return;
    e.preventDefault();
    input.focus();
  });
  return { el, input, sunMoon, glass: [search, tabsNav.el], thumb: tabsNav.thumb, setMsgRemind };
}
