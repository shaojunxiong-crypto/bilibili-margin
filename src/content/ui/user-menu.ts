import { loadSettings, onSettingsChange } from '../../shared/settings';
import { account, accountStat, dynamicUpdates, logout, resetDynamicBaseline, unreadTotal, type Account } from '../api/account';
import { fmtCount, h, icon, ICONS, setMarkup } from './dom';
import { reducedMotion } from '../motion';

/**
 * 头像卡片：移植用户贴来的 21st「ID Card Lanyard」——
 * 悬停头像，一条挂绳从头像下方垂下一张工牌（Verlet 绳子 13 个点、重力 .55、摩擦 .98、约束迭代 6 次），
 * 可以拖着甩、点一下翻面，鼠标在卡上时按位置倾斜并打一层高光。
 * 正面：B 站标识、等级 / 会员 / 硬币三行、头像照片、名字、经验、UID / 关注 / 粉丝 / 硬币·B 币、装饰二维码。
 * 背面：条码、个人空间二维码区、原来菜单里的全部入口（个人空间、投稿管理、大会员、钱包、账号设置、退出登录）、签名。
 * 原组件的 Archivo / JetBrains Mono / Caveat 换成站内字体，不从 Google Fonts 拉字。
 */

const NUM_POINTS = 13;
const REST_LENGTH = 70;
const CARD_SCALE = 1.1;
const SEGMENT_LENGTH = REST_LENGTH / (NUM_POINTS - 1);
const GRAVITY = 0.55;
const FRICTION = 0.97;
const CONSTRAINT_ITERATIONS = 6;
const TAP_THRESHOLD = 6;
const MAX_TILT = 9;
const HINT_KEY = 'margin:idcl-hint';

type Pt = { x: number; y: number; oldx: number; oldy: number; pinned: boolean };

/** 真二维码：手机扫一下打开个人空间。用 SVG 画，白底留静区，缩放不糊 */
function qr(text: string, small = false): HTMLElement {
  const el = h('div', { class: small ? 'idcl-qr idcl-small' : 'idcl-qr', title: text });
  // 二维码库（约 44KB）按需加载：卡片挂上后才画
  // 空闲时再画（首页加载时生成两张码约 40ms，v0.44）
  const idle = (globalThis.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1500))) as (f: () => void, o?: { timeout: number }) => void;
  idle(() => import('qrcode-generator').then(({ default: qrcode }) => {
    const q = qrcode(0, 'M');
    q.addData(text); q.make();
    const n = q.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    setMarkup(el, `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" aria-hidden="true"><path d="${d}"/></svg>`);
  }).catch(() => {}), { timeout: 4000 });
  return el;
}

function barcode(mid: number): HTMLElement {
  const el = h('div', { class: 'idcl-barcode', 'aria-hidden': 'true' });
  const s = String(mid).padStart(10, '0');
  for (let i = 0; i < 30; i++) {
    const k = (i * 37 + Number(s[i % s.length]) * 11) % 100;
    el.append(h('span', { style: `height:${k > 40 ? 100 : 55}%` }));
  }
  return el;
}

// 设置「账号卡片可拖拽」（v0.46，B 站评论建议）：关掉后卡片固定挂着，只能点击翻面
let idDrag = false;
// 消息提醒（v0.47）：关闭后账号卡片不再请求未读总数和新动态
let msgRemind = true;
const msgCards = new Set<(on: boolean) => void>();
loadSettings().then((s) => { idDrag = s.idDrag; msgRemind = s.msgRemind; }).catch(() => {});
onSettingsChange((s) => {
  idDrag = s.idDrag;
  const on = s.msgRemind;
  if (on !== msgRemind) { msgRemind = on; msgCards.forEach((f) => f(on)); }
});

export function createUserMenu(a: Account): HTMLElement {
  const face = (px: number) => `${a.face}@${px}w_${px}h_1c.webp`;
  const trigger = h('a', { class: 'user in', href: `https://space.bilibili.com/${a.mid}`, target: '_blank', rel: 'noopener', 'aria-haspopup': 'dialog', 'aria-label': a.name },
    h('img', { src: face(80), alt: '', referrerpolicy: 'no-referrer' }));
  const wrap = h('div', { class: 'um-wrap' }, trigger);
  // 账号卡片（约 150 个节点 + 两张大头像 + 物理画布）等第一次悬停 / 聚焦时才建（v0.44：页面加载省约 40ms 和两张图片请求）
  let built = false;
  const first = (e: Event) => {
    if (built) return;
    built = true;
    wrap.removeEventListener('pointerenter', first);
    wrap.removeEventListener('focusin', first);
    mountCard(a, wrap, trigger, face);
    wrap.dispatchEvent(e.type === 'focusin' ? new FocusEvent('focusin', e as FocusEvent) : new PointerEvent('pointerenter', e as PointerEvent));
  };
  wrap.addEventListener('pointerenter', first);
  wrap.addEventListener('focusin', first);
  return wrap;
}

function mountCard(a: Account, wrap: HTMLElement, trigger: HTMLElement, face: (px: number) => string): void {
  /* ── 卡面 ───────────────────────────────────────── */
  const space = `https://space.bilibili.com/${a.mid}`;
  const n = (v: string) => h('b', {}, v);
  const following = n('–'), follower = n('–');
  const unreadN = n('–'), dynN = n('–');
  const dynLink = h('a', { href: 'https://t.bilibili.com/', target: '_blank', rel: 'noopener' }, h('span', {}, '新动态'), dynN);
  dynLink.addEventListener('click', () => { resetDynamicBaseline(); dynN.textContent = '0'; });
  const mark = (el: HTMLElement, v: number) => { el.textContent = v > 99 ? '99+' : String(v); el.classList.toggle('hot', v > 0); };
  const pct = a.next > 0 ? Math.min(100, (a.exp / a.next) * 100) : 100;
  const name = h('h2', { class: 'idcl-name' }, a.name);
  if (a.vip && a.vipColor) name.style.color = a.vipColor;
  const role = a.vipLabel || (a.level >= 1 ? '正式会员' : '注册会员');

  const front = h('div', { class: 'idcl-face idcl-front' },
    h('div', { class: 'idcl-hole' }),
    h('div', { class: 'idcl-holo' }),
    h('div', { class: 'idcl-header' },
      h('div', { class: 'idcl-brand' },
        h('span', { class: 'idcl-brand-mark' }, '▲'),
        h('div', { class: 'idcl-brand-text' }, h('b', {}, 'BILIBILI'), h('small', {}, 'Margin · 映间'))),
      h('div', { class: 'idcl-pillars' },
        h('span', {}, `LV${a.level}`), h('span', {}, `UID ${a.mid}`), h('i'))),
    h('div', { class: 'idcl-photo' },
      // 背景用 24px 小图放大，靠插值自然变糊，不再用 filter: blur（随卡片每帧旋转时 Firefox 要重新栅格化）
      h('img', { class: 'idcl-photo-bg', src: face(24), alt: '', referrerpolicy: 'no-referrer' }),
      h('img', { class: 'idcl-photo-face', src: face(240), alt: '', referrerpolicy: 'no-referrer' }),
      a.vip ? h('span', { class: 'idcl-verified', title: role }, svgCheck()) : ''),
    name,
    h('div', { class: 'idcl-roleline' },
      h('p', { class: 'idcl-role' }, role),
      h('span', { class: 'idcl-expnum' }, a.next > 0 ? `${a.exp} / ${a.next}` : 'MAX')),
    h('div', { class: 'idcl-exp', title: a.next > 0 ? `经验 ${a.exp} / ${a.next}` : '已满级' },
      h('i', { style: `width:${pct}%` })),
    h('div', { class: 'idcl-stats' },
      h('a', { href: `${space}/relation/follow`, target: '_blank', rel: 'noopener' }, following, h('span', {}, '关注')),
      h('a', { href: `${space}/relation/fans`, target: '_blank', rel: 'noopener' }, follower, h('span', {}, '粉丝')),
      h('div', {}, n(String(a.coins)), h('span', {}, '硬币'))),
    h('div', { class: 'idcl-idrow' },
      h('div', { class: 'idcl-idrow-labels' },
        h('div', {}, h('span', {}, '等级'), n(`LV${a.level}${a.next > 0 ? ` · 还差 ${Math.max(0, a.next - a.exp)}` : ' · 满级'}`)),
        h('div', {}, h('span', {}, 'B币'), n(String(a.bcoin))),
        h('div', {}, h('span', {}, '扫码'), n('个人空间'))),
      qr(space, true)),
    h('div', { class: 'idcl-footer' },
      h('a', { href: 'https://message.bilibili.com/', target: '_blank', rel: 'noopener' }, h('span', {}, '未读消息'), unreadN),
      h('i'),
      dynLink),
  );

  const link = (label: string, ic: string, href: string) => h('a', { class: 'idcl-link', href, target: '_blank', rel: 'noopener' }, icon(ic), h('span', {}, label));
  const dot = (label: string, ic: string, href: string) => h('a', { href, target: '_blank', rel: 'noopener', title: label, 'aria-label': label }, icon(ic));
  const out = h('button', { class: 'idcl-out', type: 'button' }, icon(ICONS.exit), h('span', {}, '退出登录'));
  out.addEventListener('click', async () => {
    if (!confirm('退出当前 B 站账号？')) return;
    out.setAttribute('aria-disabled', 'true');
    if (await logout()) location.reload(); else out.removeAttribute('aria-disabled');
  });
  const back = h('div', { class: 'idcl-face idcl-back' },
    h('div', { class: 'idcl-hole' }),
    h('div', { class: 'idcl-holo' }),
    h('div', { class: 'idcl-stripe' }),
    h('div', { class: 'idcl-idnum' }, h('span', {}, `NO. ${a.mid}`), h('em', {}, `LV${a.level}`)),
    barcode(a.mid),
    h('div', { class: 'idcl-backrow' },
      qr(space),
      h('div', { class: 'idcl-scan' }, h('b', {}, '个人空间'), `space.bilibili.com/${a.mid}`, h('br'), '手机扫码直达')),
    h('div', { class: 'idcl-eyebrow' }, 'ACCOUNT', h('span', {}, '账号')),
    h('div', { class: 'idcl-links' },
      link('个人空间', ICONS.user, space),
      link('投稿管理', ICONS.upload, 'https://member.bilibili.com/platform/upload-manager/article'),
      link('大会员', ICONS.vip, 'https://account.bilibili.com/big'),
      link('我的钱包', ICONS.wallet, 'https://pay.bilibili.com/'),
      link('消息中心', ICONS.message, 'https://message.bilibili.com/'),
      link('账号设置', ICONS.gear, 'https://account.bilibili.com/account/home')),
    h('div', { class: 'idcl-connect' },
      h('span', {}, '快捷入口'),
      h('div', { class: 'idcl-connect-icons' },
        dot('收藏', ICONS.fav, 'https://www.bilibili.com/#fav'),
        dot('历史记录', ICONS.history, 'https://www.bilibili.com/account/history'),
        dot('稍后再看', ICONS.later, 'https://www.bilibili.com/#later'),
        dot('动态', ICONS.moments, 'https://t.bilibili.com/'),
        dot('直播', ICONS.live, 'https://live.bilibili.com/'))),
    h('div', { class: 'idcl-sig' },
      h('div', { class: 'idcl-script' }, a.name),
      h('div', { class: 'idcl-sigline' }, h('small', {}, 'Authorized Signature'), out)),
  );

  const flipper = h('div', { class: 'idcl-flipper' }, front, back);
  const card = h('div', { class: 'idcl-card', role: 'dialog', 'aria-label': `${a.name} 的账号卡片` }, flipper);
  const hint = h('div', { class: 'idcl-hint' }, h('span', {}, '拖动摇晃 · 点击翻面'));
  const canvas = h('canvas', { class: 'idcl-chain' }) as HTMLCanvasElement;
  const stage = h('div', { class: 'idcl-stage', hidden: '' }, card, canvas);
  if (/firefox/i.test(navigator.userAgent)) stage.classList.add('idcl-lite');
  if (idDrag && !localStorage.getItem(HINT_KEY)) card.append(hint);

  /* ── 物理（原组件逻辑） ─────────────────────────── */
  const ctx = canvas.getContext('2d')!;
  const anchor = { x: 0, y: 0 };
  const points: Pt[] = [];
  // 链长会随视口/头像位置变化：头像贴右边缘时静止点被夹回视口内，链子必须同步变长，
  // 否则水平重力过大，卡片会被甩到页面中间（YouTube 顶栏暴露了这个边界情况）
  let restLen = REST_LENGTH, segLen = SEGMENT_LENGTH;
  let dragging = false, flipped = false, interacted = false;
  let downPos = { x: 0, y: 0 }, pointer = { x: 0, y: 0 }, lastPointer = { x: 0, y: 0 };
  const velocity = { x: 0, y: 0 };
  let flipTarget = 0, flipCurrent = 0;
  const tiltTarget = { x: 0, y: 0 }, tiltCurrent = { x: 0, y: 0 };
  let mouse = { x: -9999, y: -9999 };
  let raf = 0, isOpen = false, dpr = 1, t = 0, restX = 0, gx = 0, restAngle = 0;
  const syncMsgRemind = (on: boolean) => {
    if (!on) {
      unreadN.textContent = '—'; unreadN.classList.remove('hot');
      dynN.textContent = '—'; dynN.classList.remove('hot');
    } else if (isOpen) {
      unreadTotal().then((v) => mark(unreadN, v)).catch(() => {});
      dynamicUpdates().then((v) => mark(dynN, v)).catch(() => {});
    }
  };
  msgCards.add(syncMsgRemind);

  const resize = () => {
    const r = trigger.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    canvas.style.width = `${innerWidth}px`; canvas.style.height = `${innerHeight}px`;
    dirty = { l: 0, t: 0, r: innerWidth, b: innerHeight };
    // 珠链从头像底部垂下，穿进工牌顶上的孔；卡片太靠右会出视口，就让链子静止时往左斜一点
    anchor.x = r.left + r.width / 2;
    anchor.y = r.bottom - 3;
    restX = Math.min(anchor.x, innerWidth - (236 * CARD_SCALE) / 2 - 20);
    const dx = restX - anchor.x;
    restLen = Math.max(REST_LENGTH, Math.hypot(dx, REST_LENGTH * 0.65));
    const dy = Math.sqrt(Math.max(1, restLen ** 2 - dx * dx));
    segLen = restLen / (NUM_POINTS - 1);
    gx = GRAVITY * dx / dy;
    restAngle = Math.atan2(dy, dx) - Math.PI / 2;
  };
  const clamp = (p: { x: number; y: number }) => {
    p.x = Math.max(18, Math.min(innerWidth - 18, p.x));
    p.y = Math.max(anchor.y + 20, Math.min(innerHeight - 30, p.y));
    return p;
  };
  const updatePoints = () => {
    for (let i = 1; i < points.length; i++) {
      if (dragging && i === points.length - 1) continue;
      const p = points[i];
      const vx = (p.x - p.oldx) * FRICTION, vy = (p.y - p.oldy) * FRICTION;
      p.oldx = p.x; p.oldy = p.y;
      // 重力方向朝静止点微微倾斜，绳子静止时是一条直的斜线
      p.x += vx + gx; p.y += vy + GRAVITY;
    }
  };
  const applyConstraints = () => {
    points[0].x = anchor.x; points[0].y = anchor.y;
    if (dragging) { const last = points[points.length - 1]; last.x = pointer.x; last.y = pointer.y; }
    for (let iter = 0; iter < CONSTRAINT_ITERATIONS; iter++) {
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i], p2 = points[i + 1];
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
        const diff = (segLen - dist) / dist;
        const offX = dx * diff * 0.5, offY = dy * diff * 0.5;
        if (!p1.pinned) { p1.x -= offX; p1.y -= offY; }
        if (!(dragging && i + 1 === points.length - 1)) { p2.x += offX; p2.y += offY; }
      }
    }
    for (let i = 1; i < points.length; i++) clamp(points[i]);
  };
  // 珠链：沿绳子每 4.4px 一颗金属小珠，珠子之间一根细连杆
  const BEAD_GAP = 4.4, BEAD_R = 1.9;
  let dirty = { l: 0, t: 0, r: 0, b: 0 };
  const drawChain = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 只擦上一帧画过的范围（整屏 clearRect 在高分屏上每帧要清几百万像素）
    ctx.clearRect(dirty.l, dirty.t, dirty.r - dirty.l, dirty.b - dirty.t);
    const dark = stage.closest('.app')?.getAttribute('data-theme') === 'dark';
    const beads: { x: number; y: number }[] = [];
    let carry = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      let d = carry;
      while (d <= len) { const k = d / len; beads.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }); d += BEAD_GAP; }
      carry = d - len;
    }
    const last = points[points.length - 1];
    beads.push({ x: last.x, y: last.y });
    // 连杆
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.strokeStyle = dark ? 'rgba(200,204,210,.55)' : 'rgba(90,94,100,.6)'; ctx.lineWidth = 0.8; ctx.stroke();
    // 珠子
    for (const b of beads) {
      ctx.beginPath(); ctx.arc(b.x + 0.6, b.y + 1.2, BEAD_R, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fill();
      const g = ctx.createRadialGradient(b.x - 0.7, b.y - 0.8, 0.2, b.x, b.y, BEAD_R);
      if (dark) { g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#c9ccd2'); g.addColorStop(1, '#6d7178'); }
      else { g.addColorStop(0, '#fafbfc'); g.addColorStop(0.45, '#a9adb4'); g.addColorStop(1, '#4f535a'); }
      ctx.beginPath(); ctx.arc(b.x, b.y, BEAD_R, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    }
    // 末端扣环：穿过工牌的孔
    ctx.save(); ctx.translate(last.x, last.y);
    const prev = points[points.length - 2]; ctx.rotate(Math.atan2(last.y - prev.y, last.x - prev.x) - Math.PI / 2);
    ctx.beginPath(); ctx.ellipse(0, 1.5, 3.2, 4.6, 0, 0, Math.PI * 2);
    ctx.strokeStyle = dark ? '#d5d8dd' : '#7c8087'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.restore();
    let l = Infinity, r = -Infinity, tp = Infinity, bt = -Infinity;
    for (const p of points) { l = Math.min(l, p.x); r = Math.max(r, p.x); tp = Math.min(tp, p.y); bt = Math.max(bt, p.y); }
    dirty = { l: l - 8, t: tp - 8, r: r + 8, b: bt + 10 };
  };
  const HOLE_Y = 20.5; // 孔中心离卡片顶部的距离（未缩放）
  // 卡片几何缓存：以前每帧先写 left/top 再读 offsetLeft/offsetWidth，强制同步重排，Firefox 上尤其卡（用户反馈）
  let cardW = 236, cardH = 460, cardX = 0, cardY = 0;
  const measure = () => { cardW = card.offsetWidth || 236; cardH = card.offsetHeight || 460; };
  const positionCard = () => {
    const last = points[points.length - 1], prev = points[points.length - 2];
    // 减去静止时绳子的斜角，卡片静止时保持竖直，甩动时照常转
    const angle = Math.atan2(last.y - prev.y, last.x - prev.x) - Math.PI / 2 - restAngle;
    cardX = last.x - cardW / 2; cardY = last.y - HOLE_Y;
    card.style.transform = `translate3d(${cardX.toFixed(2)}px,${cardY.toFixed(2)}px,0) rotate(${angle.toFixed(4)}rad) scale(${CARD_SCALE})`;
  };
  let hovering = false, overControl = false, lastMx = '', lastMy = '';
  const updateTilt = () => {
    flipCurrent += (flipTarget - flipCurrent) * 0.16;
    const over = !dragging && mouse.x > -1000;
    if (over) {
      const cx = cardX + cardW / 2, cy = cardY + cardH / 2;
      const dx = Math.max(-1, Math.min(1, (mouse.x - cx) / (cardW / 2)));
      const dy = Math.max(-1, Math.min(1, (mouse.y - cy) / (cardH / 2)));
      // v0.49：固定模式（默认）不再跟着鼠标倾斜，只保留高光（B 站评论：卡片动效没必要）
      if (stage.classList.contains('idcl-fixed')) { tiltTarget.x = 0; tiltTarget.y = 0; }
      else if (overControl) { tiltTarget.x = tiltCurrent.x; tiltTarget.y = tiltCurrent.y; }
      else { tiltTarget.y = dx * MAX_TILT; tiltTarget.x = -dy * MAX_TILT; }
      const mx = `${Math.round(Math.max(0, Math.min(100, ((mouse.x - cardX) / cardW) * 100)))}%`;
      const my = `${Math.round(Math.max(0, Math.min(100, ((mouse.y - cardY) / cardH) * 100)))}%`;
      if (mx !== lastMx) { card.style.setProperty('--mx', mx); lastMx = mx; }
      if (my !== lastMy) { card.style.setProperty('--my', my); lastMy = my; }
    } else {
      tiltTarget.x = 0; tiltTarget.y = 0;
    }
    if (over !== hovering) { hovering = over; card.classList.toggle('idcl-hovering', over); }
    tiltCurrent.x += (tiltTarget.x - tiltCurrent.x) * 0.12;
    tiltCurrent.y += (tiltTarget.y - tiltCurrent.y) * 0.12;
    flipper.style.transform = `rotateY(${(flipCurrent + tiltCurrent.y).toFixed(3)}deg) rotateX(${tiltCurrent.x.toFixed(3)}deg)`;
  };
  // 链子和卡片停稳后就不再每帧重算重画（以前打开期间一直 60fps 跑），指针一动或翻面再唤醒
  let still = 0;
  const settled = () => {
    if (dragging) return false;
    for (const p of points) if (Math.abs(p.x - p.oldx) + Math.abs(p.y - p.oldy) > 0.02) return false;
    return Math.abs(flipTarget - flipCurrent) < 0.05 && Math.abs(tiltTarget.x - tiltCurrent.x) + Math.abs(tiltTarget.y - tiltCurrent.y) < 0.01;
  };
  const loop = () => {
    if (stage.classList.contains('idcl-fixed')) {
      // 固定模式不参与重力求解，否则即使初速度为零，约束误差仍会把卡片慢慢拉走。
      const dx = restX - anchor.x, dy = Math.sqrt(Math.max(0, restLen ** 2 - dx * dx));
      points.forEach((p, i) => {
        const k = i / (NUM_POINTS - 1);
        p.x = p.oldx = anchor.x + dx * k; p.y = p.oldy = anchor.y + dy * k;
      });
    } else if (overControl && !dragging) {
      // 链接下方的卡片不继续滑动或倾斜，避免光标在链接与拖拽表面间反复切换。
      for (const p of points) { p.oldx = p.x; p.oldy = p.y; }
    } else { updatePoints(); applyConstraints(); }
    positionCard(); drawChain(); updateTilt();
    still = settled() ? still + 1 : 0;
    raf = still > 20 ? 0 : requestAnimationFrame(loop);
  };
  const wake = () => { still = 0; if (isOpen && !raf) raf = requestAnimationFrame(loop); };

  /* ── 指针 ──────────────────────────────────────── */
  const pos = (e: PointerEvent) => ({ x: e.clientX, y: e.clientY });
  card.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('a, button')) return;
    overControl = false;
    e.preventDefault();
    if (stage.classList.contains('idcl-fixed')) { downPos = pos(e); tapDown = true; return; }
    dragging = true; wake();
    if (!interacted) { interacted = true; hint.classList.add('idcl-hint-hidden'); localStorage.setItem(HINT_KEY, '1'); }
    card.setPointerCapture(e.pointerId);
    // 记住抓的位置相对绳端的偏移，免得一按下卡片顶端就跳到鼠标处（原组件会跳）
    const raw = pos(e), last = points[points.length - 1];
    grab = { x: raw.x - last.x, y: raw.y - last.y };
    const p = { x: last.x, y: last.y };
    pointer = p; lastPointer = p; downPos = raw;
  });
  // 是否还在「头像 + 绳子 + 卡片」范围里：卡片会甩到鼠标下面又甩走，用 pointerleave 判断会误收
  const inside = (x: number, y: number) => {
    const pad = 16;
    const hit = (r: DOMRect) => x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
    if (hit(trigger.getBoundingClientRect()) || hit(card.getBoundingClientRect())) return true;
    let l = anchor.x, r = anchor.x, t = anchor.y, b = anchor.y;
    for (const p of points) { l = Math.min(l, p.x); r = Math.max(r, p.x); t = Math.min(t, p.y); b = Math.max(b, p.y); }
    return x >= l - 28 && x <= r + 28 && y >= t - 28 && y <= b + 4;
  };
  let away = false, tapDown = false;
  let grab = { x: 0, y: 0 };
  const onMove = (e: PointerEvent) => {
    if (!e.isTrusted) return; // 页面脚本派发的合成事件不算
    wake();
    mouse = pos(e);
    overControl = !dragging && e.composedPath().some((n) => n instanceof Element && card.contains(n) && !!n.closest('a, button'));
    if (!dragging) {
      const out = !inside(mouse.x, mouse.y);
      if (out && !away) scheduleClose();
      if (!out && away) clearTimeout(t);
      away = out;
      return;
    }
    const p = clamp({ x: mouse.x - grab.x, y: mouse.y - grab.y });
    velocity.x = p.x - lastPointer.x; velocity.y = p.y - lastPointer.y;
    lastPointer = p; pointer = p;
  };
  const onUp = (e: PointerEvent) => {
    if (tapDown) {
      tapDown = false;
      const p = pos(e);
      if (Math.hypot(p.x - downPos.x, p.y - downPos.y) < TAP_THRESHOLD) { flipped = !flipped; flipTarget = flipped ? 180 : 0; wake(); }
      return;
    }
    if (!dragging) return;
    dragging = false;
    const p = pos(e);
    const last = points[points.length - 1];
    if (Math.hypot(p.x - downPos.x, p.y - downPos.y) < TAP_THRESHOLD) {
      flipped = !flipped; flipTarget = flipped ? 180 : 0; wake();
      last.oldx = last.x; last.oldy = last.y;
      return;
    }
    last.oldx = last.x - velocity.x; last.oldy = last.y - velocity.y;
    away = !inside(p.x, p.y);
    if (away) scheduleClose();
  };
  // 鼠标离开窗口时只取消倾斜；回到页面并移出范围时再收起
  const onOut = () => { mouse = { x: -9999, y: -9999 }; overControl = false; wake(); };

  /* ── 打开 / 收起：在头像上停 200ms 才垂下（划过不弹），，离开头像和卡片 .4s 后收起 ── */
  let loaded = false;
  const open = () => {
    clearTimeout(t);
    if (isOpen) return;
    isOpen = true;
    overControl = false;
    away = false;
    if (!stage.isConnected) (wrap.closest('.app') ?? wrap.getRootNode() as ShadowRoot).append(stage);
    resize();
    points.length = 0;
    const fixed = !idDrag || reducedMotion();
    // 按原长沿静止方向摆直，再给一点横向初速度，挂出来时轻轻晃一下
    {
      const dx = restX - anchor.x, dy = Math.sqrt(Math.max(0, restLen ** 2 - dx * dx));
      for (let i = 0; i < NUM_POINTS; i++) {
        const k = i / (NUM_POINTS - 1), x = anchor.x + dx * k, y = anchor.y + dy * k;
        points.push({ x, y, oldx: fixed ? x : x + k * 1.5, oldy: y, pinned: i === 0 });
      }
    }
    flipped = false; flipTarget = 0; flipCurrent = 0;
    stage.hidden = false;
    stage.classList.remove('idcl-leaving');
    stage.classList.toggle('idcl-fixed', fixed);
    if (fixed) hint.remove();
    measure();
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp);
    addEventListener('resize', resize); addEventListener('resize', wake);
    addEventListener('blur', onOut);
    cancelAnimationFrame(raf); loop();
    wrap.setAttribute('data-open', '');
    // 未读和新动态每次打开都刷新（会变）；关闭消息提醒时两者都不请求
    if (msgRemind) {
      unreadTotal().then((v) => mark(unreadN, v)).catch(() => {});
      dynamicUpdates().then((v) => mark(dynN, v)).catch(() => {});
    } else {
      unreadN.textContent = '—'; unreadN.classList.remove('hot');
      dynN.textContent = '—'; dynN.classList.remove('hot');
    }
    if (!loaded) {
      loaded = true;
      accountStat().then((s) => { following.textContent = fmtCount(s.following); follower.textContent = fmtCount(s.follower); }).catch(() => { loaded = false; });
    }
  };
  const close = () => {
    if (!isOpen || dragging) return;
    isOpen = false;
    wrap.removeAttribute('data-open');
    stage.classList.add('idcl-leaving');
    window.setTimeout(() => {
      if (isOpen) return;
      stage.hidden = true;
      cancelAnimationFrame(raf);
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', onUp);
      removeEventListener('resize', resize); removeEventListener('resize', wake);
      removeEventListener('blur', onOut);
    }, 220);
  };
  const scheduleClose = () => { clearTimeout(t); t = window.setTimeout(close, 500); };

  wrap.addEventListener('pointerenter', (e) => { if ((e as PointerEvent).pointerType !== 'touch') { clearTimeout(t); t = window.setTimeout(open, 200); } });
  wrap.addEventListener('pointerleave', () => { if (!isOpen) clearTimeout(t); });
  wrap.addEventListener('focusin', open);
  card.addEventListener('focusout', (e) => { if (!card.contains((e as FocusEvent).relatedTarget as Node)) scheduleClose(); });
  const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && isOpen) { dragging = false; close(); trigger.focus(); } };
  wrap.addEventListener('keydown', esc);
  card.addEventListener('keydown', esc);
}

function svgCheck(): SVGElement {
  return icon(ICONS.check) as SVGElement;
}

export { account };
