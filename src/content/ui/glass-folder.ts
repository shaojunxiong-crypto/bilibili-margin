/**
 * 玻璃文件夹 —— 按 21st「Glass Folder Cards」源码原生移植（无 React）。
 *
 * 三层：后板（封面或生成的液态纹理）→ 文件夹里的视频（真实元素）→ 毛玻璃前板。
 * - 静止：合上，视频只露出一点顶边
 * - 悬停 / 聚焦：前板沿底边铰链前倾，视频从口袋里略微升起
 * - 打开（点击 / Enter / Space）：前板继续前倒，视频升起并扇形展开，每张都能点
 * - ···：毛玻璃菜单，可键盘操作（↑↓ Home End Esc）
 * - 首次进入视口时自己组装；指针移动带视差与光斑；尊重 prefers-reduced-motion
 */
import { fanSlot, hashString, paint, recipeOf, rng, type ArtPreset } from './folder-art';
import { h, setMarkup, icon, ICONS } from './dom';
import { reducedMotion } from '../motion';

export interface GFFile { name: string; meta?: string; image?: string; art?: ArtPreset; href?: string }
export interface GFMenuItem { label: string; onSelect?: () => void; danger?: boolean }
export interface GFOptions {
  label: string;
  meta?: string;
  image?: string;
  art?: ArtPreset | 'none';
  seed?: number;
  files?: GFFile[];
  menu?: GFMenuItem[];
  width?: number;
  appearDelay?: number;
  onOpenChange?: (open: boolean) => void;
  /** 返回 true 时点击不弹出扇形文件，改为调用 onDirect（设置「收藏夹直接展开」） */
  direct?: () => boolean;
  onDirect?: () => void;
  onFileSelect?: (file: GFFile, index: number) => void;
}
export interface GlassFolderApi { el: HTMLElement; setFiles(files: GFFile[]): void; setOpen(open: boolean): void; isOpen(): boolean }

const NS = 'http://www.w3.org/2000/svg';
const W = 340;
const H = 272;
const HEADROOM = 90; // 打开时 4 张视频叠起最高到 -90px，整张都留在卡片自己的区域里，不压到上一行
const FRONT_TOP = 74;
const FRONT_H = H - FRONT_TOP;
const SHEET_W = 272;
const SHEET_H = 184;
const MAX_VISIBLE = 4;
const BACK_PATH = 'M0 56A22 22 0 0 1 22 34L146 34C170 34 172 0 198 0L318 0A22 22 0 0 1 340 22L340 250A22 22 0 0 1 318 272L22 272A22 22 0 0 1 0 250Z';
const FRONT_PATH = `M0 22A22 22 0 0 1 22 0L118 0C144 0 146 32 172 32L318 32A22 22 0 0 1 340 54L340 ${FRONT_H - 22}A22 22 0 0 1 318 ${FRONT_H}L22 ${FRONT_H}A22 22 0 0 1 0 ${FRONT_H - 22}Z`;
let uidSeq = 0;

function svg(cls: string, w: number, hh: number, d: string, stroke?: string, defs?: SVGElement): SVGSVGElement {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('class', cls);
  s.setAttribute('viewBox', `0 0 ${w} ${hh}`);
  s.setAttribute('aria-hidden', 'true');
  if (defs) s.append(defs);
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', d);
  if (stroke) p.setAttribute('stroke', stroke);
  s.append(p);
  return s;
}

/** 生成纹理画布：先占位模糊，画好后淡入（全页共用一个分帧绘制队列） */
function artCanvas(art: ArtPreset, seed: number, w: number, hh: number, density: number, priority: number, cls: string, onReady?: () => void): HTMLCanvasElement {
  const c = h('canvas', { class: cls, 'aria-hidden': 'true', style: `width:${w}px;height:${hh}px;max-width:none` }) as HTMLCanvasElement;
  paint(recipeOf(art), seed, Math.round(w * density), Math.round(hh * density), priority).then((src) => {
    c.width = src.width;
    c.height = src.height;
    c.getContext('2d')?.drawImage(src, 0, 0);
    c.dataset.ready = '';
    onReady?.();
  });
  return c;
}

export function glassFolder(o: GFOptions): GlassFolderApi {
  const uid = `gf${++uidSeq}`;
  const width = o.width ?? W;
  let k = width / W;
  const density = Math.min(1.5, Math.max(1, devicePixelRatio || 1)) * k;
  let open = false;
  let menuOpen = false;
  let files: GFFile[] = [];

  const root = h('div', { class: 'gf-root', 'data-place': 'bottom-left', style: `width:${width}px;height:${(H + HEADROOM) * k}px` });
  const stage = h('div', { class: 'gf-stage', style: `transform:translateY(${HEADROOM * k}px) scale(${k})` });
  const tilt = h('div', { class: 'gf-tilt' });

  // 后板与封面
  const back = h('div', { class: 'gf-back', style: `clip-path:path('${BACK_PATH}')`, 'aria-hidden': 'true' });
  if (o.image) back.append(h('img', { class: 'gf-art', src: o.image, alt: '', width: W + 24, height: H + 24, draggable: 'false', referrerpolicy: 'no-referrer' }));
  else if (o.art && o.art !== 'none') back.append(artCanvas(o.art, o.seed ?? 3, W + 24, H + 24, density, 0, 'gf-art', () => syncFrost()));
  back.append(h('div', { class: 'gf-back-sheen' }));

  // 毛玻璃前板（底边铰链）
  const grad = document.createElementNS(NS, 'defs');
  setMarkup(grad, `<linearGradient id="${uid}-rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".35" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity=".12"/></linearGradient>`);
  const hit = h('button', { type: 'button', class: 'gf-hit', 'aria-expanded': 'false' }) as HTMLButtonElement;
  const metaEl = h('span', { class: 'gf-meta' });
  // 毛玻璃不用 backdrop-filter：Chromium 里它在缩放 / 变换 / 滚动容器中会只模糊一块矩形，
  // 图片从玻璃里漏出来。改成把后板和视频复制一份放进前板里，用普通 filter 模糊这份副本
  // （与液态玻璃的「副本折射」同一思路），所有浏览器表现一致。
  const frost = h('div', { class: 'gf-frost', 'aria-hidden': 'true' });
  const specEl = h('div', { class: 'gf-spec', 'aria-hidden': 'true' });
  const front = h('div', { class: 'gf-front', style: `clip-path:path('${FRONT_PATH}')` },
    frost,
    h('div', { class: 'gf-tint', 'aria-hidden': 'true' }),
    specEl,
    svg('gf-rim gf-front-rim', W, FRONT_H, FRONT_PATH, `url(#${uid}-rim)`, grad),
    hit,
    h('div', { class: 'gf-label' }, h('span', { class: 'gf-title' }, o.label), metaEl),
  );

  // 内容：Tab 顺序在玻璃之后，画面上在玻璃之下
  const filesEl = h('div', { class: 'gf-files', role: 'list', 'aria-label': `${o.label} 内容` });
  filesEl.toggleAttribute('inert', true);

  // ··· 键与菜单
  const key = h('button', { type: 'button', class: 'gf-key gf-key--more', 'aria-label': `${o.label} 更多操作`, 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': `${uid}-menu` }) as HTMLButtonElement;
  const glyph = icon(ICONS.more) as SVGElement;
  glyph.setAttribute('class', 'gf-glyph gf-glyph--more');
  glyph.setAttribute('aria-hidden', 'true');
  key.append(glyph);
  const menu = h('div', { class: 'gf-menu', role: 'menu', id: `${uid}-menu`, 'aria-label': `${o.label} 选项` });

  const shadowEl = h('div', { class: 'gf-shadow', 'aria-hidden': 'true' });
  tilt.append(shadowEl, back, svg('gf-rim gf-back-rim', W, H, BACK_PATH), front, filesEl, key, menu);
  stage.append(tilt);
  root.append(stage);

  let arts = [...root.querySelectorAll<HTMLElement>('.gf-art')];
  let frostRaf = 0;
  function syncFrost() {
    if (frostRaf) return;
    frostRaf = requestAnimationFrame(() => {
      frostRaf = 0;
      const b = back.cloneNode(true) as HTMLElement;
      const f = filesEl.cloneNode(true) as HTMLElement;
      f.removeAttribute('role');
      f.toggleAttribute('inert', true);
      for (const [src, dst] of [[back, b], [filesEl, f]] as const) {
        const a = src.querySelectorAll('canvas');
        const c = dst.querySelectorAll('canvas');
        a.forEach((cv, i) => { const d = c[i]; d.width = cv.width; d.height = cv.height; if (cv.width > 1) d.getContext('2d')?.drawImage(cv, 0, 0); });
      }
      frost.replaceChildren(b, f);
      arts = [...root.querySelectorAll<HTMLElement>('.gf-art')];
    });
  }

  let metaNode = metaEl;
  const setMeta = (text: string) => {
    const n = metaNode.cloneNode() as HTMLElement; // 换新节点让数字滚入动画重放
    n.textContent = text;
    metaNode.replaceWith(n);
    metaNode = n;
  };

  function renderMenu() {
    const items: GFMenuItem[] = [{ label: open ? '收起文件夹' : '打开文件夹', onSelect: () => setOpen(!open) }, ...(o.menu ?? [])];
    menu.replaceChildren(...items.map((it) => h('button', {
      type: 'button', role: 'menuitem', class: `gf-menu-item${it.danger ? ' gf-menu-item--danger' : ''}`,
      tabindex: menuOpen ? -1 : undefined, disabled: menuOpen ? undefined : '',
      onclick: () => { setMenu(false); key.focus(); it.onSelect?.(); },
    }, it.label)));
  }

  function setMenu(next: boolean) {
    menuOpen = next;
    menu.toggleAttribute('data-open', next);
    key.setAttribute('aria-expanded', String(next));
    renderMenu();
    if (next) menu.querySelector<HTMLElement>('[role=menuitem]')?.focus();
    listen();
  }

  function setOpen(next: boolean) {
    if (open === next) return;
    open = next;
    root.toggleAttribute('data-open', next);
    hit.setAttribute('aria-expanded', String(next));
    filesEl.toggleAttribute('inert', !next);
    label();
    if (menuOpen) renderMenu();
    listen();
    o.onOpenChange?.(next);
  }

  function label() {
    const n = o.meta ?? `${files.length} 项`;
    hit.setAttribute('aria-label', `${open ? '收起' : '打开'}${o.label}，${n}`);
  }

  function setFiles(next: GFFile[]) {
    const first = !files.length;
    files = next;
    const start = Math.max(0, files.length - MAX_VISIBLE);
    const visible = files.slice(start);
    filesEl.replaceChildren(...visible.map((file, v) => {
      const jitter = rng(hashString(file.name) + start + v);
      const picture = !!(file.art || file.image);
      const inner: (Node | null)[] = [
        file.image
          ? h('img', { class: 'gf-sheet-art', src: file.image, alt: '', width: SHEET_W, height: SHEET_H, draggable: 'false', loading: 'lazy', referrerpolicy: 'no-referrer' })
          : file.art
            ? artCanvas(file.art, hashString(file.name) % 997, SHEET_W, SHEET_H, Math.min(density, 1.25), 1, 'gf-sheet-art', () => syncFrost())
            : h('span', { class: 'gf-lines', 'aria-hidden': 'true' }, ...[86, 92, 64, 88, 42].map((w) => h('i', { style: `width:${w}%` }))),
        h('span', { class: 'gf-sheet-head' }, h('span', { class: 'gf-sheet-name' }, file.name), file.meta ? h('span', { class: 'gf-sheet-meta' }, file.meta) : null),
      ];
      const style = `--gf-slot:${fanSlot(v, visible.length)};--gf-depth:${visible.length - 1 - v};--gf-jx:${((jitter() - 0.5) * 10).toFixed(2)}px;--gf-jr:${((jitter() - 0.5) * 3.2).toFixed(2)}deg;z-index:${v + 1}${first ? `;animation-delay:${0.1 + v * 0.09}s` : ''}`;
      const cls = `gf-sheet${picture ? ' gf-sheet--art' : ''}${first ? ' gf-sheet--drop' : ''}`;
      const sel = () => o.onFileSelect?.(file, start + v);
      const el = file.href
        ? h('a', { class: cls, style, href: file.href, target: '_blank', rel: 'noopener', title: file.name, onclick: sel }, ...inner)
        : h('button', { class: cls, style, type: 'button', onclick: sel }, ...inner);
      el.addEventListener('animationend', () => el.classList.remove('gf-sheet--drop'), { once: true });
      return h('div', { role: 'listitem', class: 'gf-sheet-slot' }, el);
    }));
    if (!o.meta) setMeta(`${files.length} 项`);
    label();
    syncFrost();
  }

  // 指针：光斑与视差跟随，不触发重排
  let raf = 0;
  let px = 0;
  let py = 0;
  let pointerX = 0, pointerY = 0, tracking = false;
  let pointerRect: DOMRect | null = null;
  let pointerScope: Document | ShadowRoot | null = null;
  const invalidatePointer = () => {
    pointerRect = null;
    if (tracking && !raf) raf = requestAnimationFrame(write);
  };
  const write = () => {
    raf = 0;
    if (reducedMotion()) {
      tilt.style.transform = '';
      shadowEl.style.transform = '';
      specEl.style.transform = '';
      arts.forEach((a) => { a.style.transform = ''; });
      return;
    }
    if (tracking) {
      const r = pointerRect ??= root.getBoundingClientRect();
      px = ((pointerX - r.left) / r.width) * 2 - 1;
      py = ((pointerY - r.top) / r.height) * 2 - 1;
    } else px = py = 0;
    // v0.45：直接写这几层的 transform，不再改根上的 CSS 变量（那会让整棵子树连同模糊副本一起重算样式，
    // 光斑也不再改渐变位置而是平移，免得每次移动都重绘）
    tilt.style.transform = px || py ? `translate(${(px * 3).toFixed(2)}px, ${(py * 2).toFixed(2)}px)` : '';
    shadowEl.style.transform = px ? `translateX(${(px * -8).toFixed(2)}px)` : '';
    const art = px || py ? `translate(${(px * -7).toFixed(2)}px, ${(py * -6).toFixed(2)}px) scale(1.02)` : '';
    arts.forEach((a) => { a.style.transform = art; });
    specEl.style.transform = px || py ? `translate(${(px * W * 0.46).toFixed(1)}px, ${(py * FRONT_H * 0.4).toFixed(1)}px)` : '';
  };
  root.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || reducedMotion()) return;
    if (!tracking) {
      pointerRect = null;
      pointerScope = root.getRootNode() as Document | ShadowRoot;
      pointerScope.addEventListener('scroll', invalidatePointer, { capture: true, passive: true });
      addEventListener('scroll', invalidatePointer, { capture: true, passive: true });
      addEventListener('resize', invalidatePointer, { passive: true });
    }
    pointerX = e.clientX; pointerY = e.clientY; tracking = true;
    if (!raf) raf = requestAnimationFrame(write);
  });
  root.addEventListener('pointerleave', () => {
    tracking = false; pointerRect = null;
    pointerScope?.removeEventListener('scroll', invalidatePointer, true);
    pointerScope = null;
    removeEventListener('scroll', invalidatePointer, true);
    removeEventListener('resize', invalidatePointer);
    if (!raf) raf = requestAnimationFrame(write);
  });

  hit.addEventListener('click', () => { setMenu(false); if (o.direct?.()) { if (open) setOpen(false); o.onDirect?.(); return; } setOpen(!open); });
  key.addEventListener('click', () => setMenu(!menuOpen));
  menu.addEventListener('keydown', (e) => {
    const items = [...menu.querySelectorAll<HTMLElement>('[role=menuitem]')];
    const active = (root.getRootNode() as Document | ShadowRoot).activeElement as HTMLElement;
    const at = items.indexOf(active);
    const go = (i: number) => { e.preventDefault(); items[(i + items.length) % items.length]?.focus(); };
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key === 'Tab') setMenu(false);
  });

  // Esc 与点外面：关掉当前打开的（菜单优先）。影子 DOM 里要用 composedPath 判断
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation(); // 先关文件夹，不要连抽屉一起关
    if (menuOpen) { setMenu(false); key.focus(); } else { setOpen(false); hit.focus(); }
  };
  const onDown = (e: PointerEvent) => {
    const path = e.composedPath();
    if (menuOpen && !path.includes(menu) && !path.includes(key)) setMenu(false);
    if (open && !menuOpen && !path.includes(root)) setOpen(false);
  };
  let listening = false;
  function listen() {
    const want = open || menuOpen;
    if (want === listening) return;
    listening = want;
    const m = want ? 'addEventListener' : 'removeEventListener';
    document[m]('keydown', onKey as EventListener);
    document[m]('pointerdown', onDown as EventListener);
  }

  // 首次进入视口时组装
  const io = new IntersectionObserver((es) => {
    if (!es.some((e) => e.isIntersecting)) return;
    io.disconnect();
    setTimeout(() => root.toggleAttribute('data-entered', true), o.appearDelay ?? 0);
  }, { threshold: 0.25 });
  io.observe(root);
  let measuredWidth = width;
  new ResizeObserver(([entry]) => {
    const w = entry.contentRect.width;
    if (!w || Math.abs(w - measuredWidth) < .5) return;
    measuredWidth = w;k = w / W;
    invalidatePointer();
    root.style.height = `${(H + HEADROOM) * k}px`;
    stage.style.transform = `translateY(${HEADROOM * k}px) scale(${k})`;
  }).observe(root);

  const api = { el: root, setFiles, setOpen, isOpen: () => open };
  if (o.meta) setMeta(o.meta);
  renderMenu();
  setFiles(o.files ?? []);
  return api;
}
