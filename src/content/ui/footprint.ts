import { activeOf, backfill, dayKey, firstOf, levelOf, levelThresholds, loadActivity, secondsOf, sourceOf, type Activity, type DayRecord } from '../footprint/store';
import { h, icon, ICONS } from './dom';
import { every } from '../sched';

/** 时长来源：本机后台计时 / B 站观看历史估算 */
const SRC = { local: '本机记录', history: '历史估算' } as const;
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const fmt = (sec: number) => {
  const s = Math.round(sec || 0), hr = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  if (s > 0 && s < 60) return '不到 1 分钟';
  return hr ? `${hr} 小时 ${m} 分` : `${m} 分钟`;
};

const BF_KEY = 'margin:activity-bf';
const VIEW_KEY = 'margin:fp-view';
const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK_1 = ['日', '一', '二', '三', '四', '五', '六'];

function smoothWheelScroll(strip: HTMLElement) {
  let target: number | null = null, frame = 0, scrollBehavior = '';
  strip.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
        target = null;
        strip.style.scrollBehavior = scrollBehavior;
      }
      return;
    }
    const delta = e.deltaY * (e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? strip.clientWidth : 1);
    const max = Math.max(0, strip.scrollWidth - strip.clientWidth);
    const next = Math.max(0, Math.min(max, (target ?? strip.scrollLeft) + delta));
    if (next === (target ?? strip.scrollLeft) && !frame) return;
    e.preventDefault();
    if (target === null) {
      scrollBehavior = strip.style.scrollBehavior;
      strip.style.scrollBehavior = 'auto';
      target = strip.scrollLeft;
    }
    target = next;
    if (frame) return;
    let lastTime = 0, position = strip.scrollLeft;
    const animate = (now: number) => {
      const finish = () => { frame = 0; target = null; strip.style.scrollBehavior = scrollBehavior; };
      if (!strip.isConnected) { finish(); return; }
      const remaining = (target ?? position) - position;
      if (Math.abs(remaining) < 0.5) {
        strip.scrollLeft = target ?? strip.scrollLeft;
        finish();
        return;
      }
      const elapsed = lastTime ? Math.min(32, now - lastTime) : 16;
      lastTime = now;
      // 连续滚轮输入合并到同一条缓动曲线上，避免每个事件重启原生平滑滚动。
      // 保留小数位置，避免浏览器取整后缓动停在终点前一像素。
      position += remaining * (1 - Math.exp(-elapsed / 90));
      strip.scrollLeft = position;
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
  }, { passive: false });
}

/** 首页上的「B 站足迹」卡片：近一年每天首次打开时间与停留时长的热力图 */
export function createFootprintCard(): HTMLElement {
  const el = h('section', { class: 'fp-card', 'aria-label': 'B 站足迹' });
  const tip = h('div', { class: 'fp-tip', hidden: '' });
  let note = '时长按页面可见且 90 秒内有操作、或正在播放时计算；满 1 分钟才算打开过';

  const refresh = async () => { try { paint(await loadActivity()); } catch { /* 扩展已重载 */ } };
  (async () => {
    await refresh();
    // 观看历史补全：每 6 小时最多一次
    const last = ((await chrome.storage.local.get(BF_KEY))[BF_KEY] as number | undefined) ?? 0;
    if (Date.now() - last < 6 * 3600e3) { note = '没有本机记录的日子用 B 站观看历史估算'; return refresh(); }
    const since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - 364 - since.getDay());
    const r = await backfill(since);
    if (r === 'ok') await chrome.storage.local.set({ [BF_KEY]: Date.now() });
    note = r === 'ok' ? '没有本机记录的日子用 B 站观看历史估算（每条最多算 20 分钟）'
      : r === 'nologin' ? '登录 B 站后可以用观看历史补全过去的天数' : '观看历史暂时读取失败，只显示本地记录';
    refresh();
  })();
  every(60_000, refresh); // 页面隐藏时不刷新
  let ro: ResizeObserver | null = null;
  // 21st「Glass Calendar」：年 / 月两种视图，月视图是一条可横向滑动的日期条，点哪天看哪天
  let view: 'year' | 'month' = (() => { try { return localStorage.getItem(VIEW_KEY) === 'month' ? 'month' : 'year'; } catch { return 'year'; } })();
  let monthAt = new Date(); monthAt.setDate(1); monthAt.setHours(0, 0, 0, 0);
  let picked: string | null = null;
  let activity: Activity = {};
  let renderedKey = '', renderedCells: HTMLElement[] = [];
  let thr: [number, number, number] = [900, 2700, 5400];
  const lv = (rec: DayRecord | undefined) => String(levelOf(secondsOf(rec), thr));

  function paint(data: Activity) {
    activity = data;
    tip.hidden = true;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const key = `${dayKey(today)}|${view}|${monthAt.getFullYear()}-${monthAt.getMonth()}`;
    const sameView = renderedKey === key;
    const start = new Date(today); start.setDate(start.getDate() - 364 - today.getDay());
    const cells: HTMLElement[] = [];
    const months: [number, number][] = [];
    let active = 0, total = 0, best = 0, run = 0, lastMonth = -1;
    const n = Math.round((+today - +start) / 864e5) + 1 + (6 - today.getDay());
    // 分档阈值跟着自己近一年的分布走（活跃日不到 14 天时用 15 / 45 / 90 分钟）
    const yearAgo = dayKey(new Date(+today - 364 * 864e5)), todayK = dayKey(today);
    thr = levelThresholds(Object.keys(data).filter((k) => k >= yearAgo && k <= todayK).map((k) => secondsOf(data[k])));
    for (let i = 0; i < n; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const k = dayKey(d), rec = data[k], s = secondsOf(rec), future = d > today;
      const on = !future && activeOf(rec);
      if (!future) { if (on) { active++; total += s; run++; best = Math.max(best, run); } else run = 0; }
      if (d.getDate() <= 7 && d.getDay() === 0 && d.getMonth() !== lastMonth) { months.push([Math.floor(i / 7), d.getMonth() + 1]); lastMonth = d.getMonth(); }
      if (view === 'year') {
        const c = (sameView && renderedCells[i]) || h('i', { class: `fp-cell${future ? ' future' : ''}${+d === +today ? ' today' : ''}` });
        if (c.dataset.k !== k) c.dataset.k = k;
        const l = future ? '0' : lv(rec);
        if (c.dataset.l !== l) c.dataset.l = l;
        cells.push(c);
      }
    }
    let streak = 0;
    for (let i = 0; ; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const r = data[dayKey(d)];
      if (activeOf(r)) streak++;
      else if (i > 0) break;
    }
    const pk = view === 'month' && picked ? picked : dayKey(today);
    const t = data[pk];
    const pd = new Date(`${pk}T00:00:00`);
    const pLabel = pk === dayKey(today) ? '今日' : `${pd.getMonth() + 1}月${pd.getDate()}日`;
    if (sameView) {
      const text = (selector: string, value: string) => {
        const node = el.querySelector(selector)!;
        if (node.textContent !== value) node.textContent = value;
      };
      text('.fp-head', `${active} 天打开过 B 站`);
      [firstOf(t) ?? '—', fmt(secondsOf(t)), fmt(total), `${streak} 天`].forEach((v, i) => text(`.fp-stat:nth-child(${i + 1}) b`, v));
      text('.fp-stat:nth-child(1) small', `${pLabel}首次打开`);
      text('.fp-stat:nth-child(2) small', `${pLabel}时长`);
      text('.fp-stat:last-child small', `当前连续 · 最长 ${best} 天`);
      text('.fp-foot > span:first-child', note);
      el.querySelectorAll<HTMLElement>('.fp-day-b').forEach((b) => {
        const rec = data[b.dataset.k!];
        const l = b.hasAttribute('disabled') ? '0' : lv(rec);
        if (b.dataset.l !== l) b.dataset.l = l;
        const pressed = String(picked === b.dataset.k);
        if (b.getAttribute('aria-pressed') !== pressed) b.setAttribute('aria-pressed', pressed);
      });
      if (view === 'month') {
        const selected = el.querySelector<HTMLElement>(picked ? '.fp-day-b[aria-pressed="true"]' : '.fp-day-b[data-today]');
        if (selected) requestAnimationFrame(() => {
          const col = selected.parentElement!, strip = col.parentElement!;
          strip.scrollLeft = col.offsetLeft - strip.clientWidth / 2 + col.offsetWidth / 2;
        });
      }
      return;
    }
    renderedKey = key; renderedCells = cells;
    const weeks = Math.ceil(cells.length / 7);
    const stat = (v: string, label: string) => h('div', { class: 'fp-stat' }, h('b', {}, v), h('small', {}, label));
    const legend = h('span', { class: 'fp-legend' }, '少', ...[0, 1, 2, 3, 4].map((l) => { const c = h('i', { class: 'fp-cell' }); c.dataset.l = String(l); return c; }), '多');
    const graph = h('div', { class: 'fp-graph' },
      h('div', { class: 'fp-months', style: `width:calc(${weeks} * (var(--c) + var(--gp)))` },
        // 最后不足 3 周的月份放不下标签（窄屏格子小时会和上一个月叠在一起），干脆不标，同 GitHub 贡献图
        ...months.filter(([w]) => weeks - w >= 3).map(([w, m]) => h('span', { style: `left:calc(${w} * (var(--c) + var(--gp)))` }, `${m}月`))),
      h('div', { class: 'fp-days' }, ...['', '一', '', '三', '', '五', ''].map((x) => h('span', {}, x))),
      h('div', { class: 'fp-cells' }, ...cells),
    );
    const segBtn = (v: 'year' | 'month', label: string) => h('button', { type: 'button', class: 'fp-seg-b', 'aria-pressed': String(view === v), onclick: () => { if (view === v) return; view = v; try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ } paint(activity); } }, label);
    const seg = h('div', { class: 'fp-seg', role: 'group', 'aria-label': '视图' }, segBtn('year', '年'), segBtn('month', '月'));
    el.dataset.view = view;
    el.replaceChildren(
      h('div', { class: 'fp-side' },
        h('div', { class: 'fp-top' },
          h('div', { class: 'eyebrow' }, h('span', { class: 'en' }, 'Footprint'), h('span', {}, view === 'year' ? '近一年' : '按月')),
          seg),
        h('h3', { class: 'fp-head' }, `${active} 天打开过 B 站`),
        h('div', { class: 'fp-stats' },
        stat(firstOf(t) ?? '—', `${pLabel}首次打开`),
        stat(fmt(secondsOf(t)), `${pLabel}时长`),
        stat(fmt(total), '近一年累计'),
        stat(`${streak} 天`, `当前连续 · 最长 ${best} 天`))),
      h('div', { class: 'fp-main' }, view === 'year' ? graph : monthView(data, today), h('div', { class: 'fp-foot' }, h('span', {}, note), legend)),
      tip,
    );
    const fit = () => {
      const w = (graph.parentElement as HTMLElement).clientWidth;
      tip.hidden = true;
      // v0.50：窄屏时间距 3→2、格子最小 6px，让一整年放得下，不再横向裁掉左边
      const per = Math.floor((w - 34) / weeks);
      const gp = per < 12 ? 2 : 3;
      const cs = Math.max(6, Math.min(18, per - gp));
      graph.style.setProperty('--c', `${cs}px`);
      graph.style.setProperty('--gp', `${gp}px`);
      // 滚到最右放到下一帧：改完格子尺寸立刻读 scrollWidth 会在同一帧里再排一次版（v0.44）
      requestAnimationFrame(() => { graph.scrollLeft = graph.scrollWidth; });
    };
    ro?.disconnect();
    if (view === 'year') { requestAnimationFrame(fit); ro = new ResizeObserver(fit); ro.observe(el); }
    graph.onpointerover = (e) => {
      const c = (e.target as HTMLElement).closest<HTMLElement>('.fp-cells .fp-cell');
      if (!c || c.classList.contains('future')) { tip.hidden = true; return; }
      const r = activity[c.dataset.k!], d = new Date(`${c.dataset.k}T00:00:00`), s = secondsOf(r), f = firstOf(r);
      tip.replaceChildren(h('b', {}, `${d.getMonth() + 1}月${d.getDate()}日 ${WEEK[d.getDay()]}`), h('br'),
        ...(s || f ? [`首次打开 ${f ?? '—'} · 时长 ${fmt(s)}`, h('br'),
          h('small', { class: `fp-src fp-src-${sourceOf(r) ?? 'local'}` }, `${SRC[sourceOf(r) ?? 'local']}${activeOf(r) ? '' : ' · 不计入打开天数'}`)]
          : [h('small', {}, '没有打开 B 站')]));
      tip.hidden = false;
      // 夹在卡片内：最右一列（今天）居中会被卡片的 overflow 裁掉，顶部放不下就翻到格子下方
      const b = c.getBoundingClientRect(), card = el.getBoundingClientRect(), pad = 8, gap = 8;
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      const cx = b.left + b.width / 2 - card.left - el.clientLeft;
      const left = Math.max(pad, Math.min(el.clientWidth - tw - pad, cx - tw / 2));
      const above = b.top - card.top - el.clientTop - gap - th;
      const top = above >= pad ? above : b.bottom - card.top - el.clientTop + gap;
      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(top)}px`;
    };
    graph.onpointerleave = () => { tip.hidden = true; };
    graph.onscroll = () => { tip.hidden = true; };
  }
  function monthView(data: Activity, today: Date): HTMLElement {
    const y = monthAt.getFullYear(), m = monthAt.getMonth();
    const days = new Date(y, m + 1, 0).getDate();
    const isThisMonth = y === today.getFullYear() && m === today.getMonth();
    const strip = h('div', { class: 'fp-strip' });
    let sel: HTMLElement | null = null;
    for (let i = 1; i <= days; i++) {
      const d = new Date(y, m, i), k = dayKey(d), future = d > today, rec = data[k], s = secondsOf(rec);
      const b = h('button', { type: 'button', class: 'fp-day-b', disabled: future, 'aria-pressed': String(picked === k), title: `${m + 1}月${i}日` }, String(i));
      b.dataset.l = future ? '0' : lv(rec);
      if (!future && s) b.title = `${m + 1}月${i}日 · ${fmt(s)} · ${SRC[sourceOf(rec) ?? 'local']}`;
      b.dataset.k = k;
      if (+d === +today) b.dataset.today = '';
      b.onclick = () => { picked = picked === k ? null : k; paint(activity); };
      const col = h('div', { class: 'fp-day' }, h('span', {}, WEEK_1[d.getDay()]), b);
      if (picked === k || (!picked && +d === +today)) sel = col;
      strip.append(col);
    }
    const go = (dm: number) => { monthAt = new Date(y, m + dm, 1); picked = null; paint(activity); };
    const nextOff = isThisMonth;
    const prevOff = +new Date(y, m, 1) <= +new Date(today.getFullYear() - 1, today.getMonth(), 1);
    requestAnimationFrame(() => { if (sel) strip.scrollLeft = sel.offsetLeft - strip.clientWidth / 2 + sel.offsetWidth / 2; });
    smoothWheelScroll(strip);
    return h('div', { class: 'fp-month' },
      h('div', { class: 'fp-mhead' },
        h('p', { class: 'fp-mname' }, h('span', { class: 'en' }, MONTH_EN[m]), h('small', {}, `${y} 年 ${m + 1} 月`)),
        h('div', { class: 'fp-mnav' },
          h('button', { type: 'button', 'aria-label': '上个月', disabled: prevOff, onclick: () => go(-1) }, icon(ICONS.back)),
          h('button', { type: 'button', 'aria-label': '下个月', disabled: nextOff, onclick: () => go(1) }, icon(ICONS.chevronRight)))),
      strip);
  }
  return el;
}
