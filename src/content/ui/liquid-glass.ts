import barMap from '../assets/glass-bar.webp?inline';
import thumbMap from '../assets/glass-thumb.webp?inline';
import { setMarkup } from './dom';

/**
 * 液态玻璃：21st「Apple Liquid glass switcher」（dennysdionigi / Den Dionigi）的原生移植。
 * 原版用两张固定的位移图（按 344×76 的胶囊画的）。顶栏的搜索框、快捷入口更扁更长，
 * 拉伸后会在中间拖出横向糊影，所以这里按每块玻璃的实际尺寸用光学公式现算位移图
 * （squircle 斜面 + 斯涅尔折射，n=1.5），原版位移图只作首帧兜底。
 * backdrop-filter: blur() url(#id) saturate() —— 扩展只跑在 Chrome / Edge，url() 可用。
 */
const NS = 'http://www.w3.org/2000/svg';
let seq = 0;

function bendCurve(): (x: number) => number {
  const raw = (x: number) => {
    const t = Math.max(1e-4, Math.min(1, x));
    const slope = (1 - t) ** 3 / Math.max(1e-6, (1 - (1 - t) ** 4)) ** 0.75;
    const ti = Math.atan(slope);
    const tt = Math.asin(Math.sin(ti) / 1.5);
    return Math.sin(ti - tt);
  };
  const max = raw(1e-4);
  return (x) => raw(x) / max;
}
const bend = bendCurve();

/** 圆角矩形位移图：R/G = 128 ± 法线方向 × 弯折量（往中心取样 → 边缘压缩、提亮） */
function makeMap(w: number, h: number, radius: number, bezel: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const cx = w / 2, cy = h / 2, r = Math.min(radius, w / 2, h / 2);
  const ix = w / 2 - r, iy = h / 2 - r;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - cx, py = y + 0.5 - cy;
      const qx = Math.abs(px) - ix, qy = Math.abs(py) - iy;
      let nx = 0, ny = 0, sdf: number;
      if (qx > 0 && qy > 0) {
        const l = Math.hypot(qx, qy) || 1;
        nx = (qx / l) * Math.sign(px); ny = (qy / l) * Math.sign(py);
        sdf = l - r;
      } else if (qx > qy) { nx = Math.sign(px); sdf = qx - r; }
      else { ny = Math.sign(py); sdf = qy - r; }
      const depth = -sdf;
      const k = depth <= 0 ? 0 : bend(depth / bezel);
      const i = (y * w + x) * 4;
      img.data[i] = Math.round(128 - nx * k * 127);
      img.data[i + 1] = Math.round(128 - ny * k * 127);
      img.data[i + 2] = 128; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** 同尺寸同圆角的位移图全站共用一张（顶栏几个按钮尺寸相同），只算一次（v0.44） */
const maps = new Map<string, Promise<string | null>>();
function mapUrl(w: number, h: number, radius: number, bezel: number): Promise<string | null> {
  const k = `${w}x${h}r${radius}b${bezel}`;
  let p = maps.get(k);
  if (!p) {
    p = new Promise((res) => makeMap(w, h, radius, bezel).toBlob((b) => res(b ? URL.createObjectURL(b) : null)));
    maps.set(k, p);
  }
  return p;
}

export interface GlassOpts { blur?: number; strength?: number; sat?: string }

/** 给元素挂一块会按尺寸重算的玻璃滤镜；filters 是放滤镜的 <svg>（与元素同一个 shadow root） */
export function attachGlass(el: HTMLElement, filters: SVGSVGElement, o: GlassOpts = {}): void {
  const id = `lg-${++seq}`;
  const f = document.createElementNS(NS, 'filter');
  f.id = id;
  for (const [k, v] of Object.entries({ x: '0', y: '0', width: '1', height: '1', filterUnits: 'objectBoundingBox', 'color-interpolation-filters': 'sRGB' })) f.setAttribute(k, v);
  const img = document.createElementNS(NS, 'feImage');
  for (const [k, v] of Object.entries({ result: 'map', x: '0', y: '0', preserveAspectRatio: 'none' })) img.setAttribute(k, v);
  const disp = document.createElementNS(NS, 'feDisplacementMap');
  for (const [k, v] of Object.entries({ in: 'SourceGraphic', in2: 'map', xChannelSelector: 'R', yChannelSelector: 'G' })) disp.setAttribute(k, v);
  f.append(img, disp);
  filters.append(f);

  let url = '', lastKey = '', timer = 0, building = false;
  const de = document.documentElement;
  const transparency = matchMedia('(prefers-reduced-transparency: reduce)');
  let liquid = de.dataset.marginGlass === 'liquid' && !transparency.matches;
  const paint = () => {
    el.style.backdropFilter = transparency.matches ? 'none' : liquid && url
      ? `blur(${o.blur ?? 6}px) url(#${id}) saturate(${o.sat ?? '150%'})`
      : el.classList.contains('et-thumb') ? 'none' : 'blur(16px) saturate(110%)';
  };
  // 尺寸来自 ResizeObserver 的 borderBoxSize，不读 offsetWidth（避免强制布局）
  let W = 0, H = 0;
  const build = () => {
    const w = W, h = H;
    if (!liquid || w < 4 || h < 4) return;
    const key = `${w}x${h}`;
    if (key === lastKey) return;
    lastKey = key;
    building = true;
    const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || h / 2;
    const bezel = Math.min(h / 2, w / 2, 22);
    void mapUrl(w, h, radius, bezel).then((u) => {
      building = false;
      if (!liquid || key !== lastKey) return;
      if (!u) return;
      url = u;
      img.setAttribute('href', url);
      paint();
    });
  };
  const resize = (en?: ResizeObserverEntry) => {
    const b = en?.borderBoxSize?.[0];
    if (b) { W = Math.round(b.inlineSize); H = Math.round(b.blockSize); }
    if (!liquid) return;
    const w = W, h = H;
    if (w < 4 || h < 4) return;
    // Keep the existing map stretched with the control during its width animation.
    // Generate exact optics once the dimensions settle instead of on every frame.
    img.setAttribute('width', String(w)); img.setAttribute('height', String(h));
    disp.setAttribute('scale', String(Math.round(h * (o.strength ?? 0.55))));
    clearTimeout(timer);
    if (!url && !building) build();
    else if (`${w}x${h}` !== lastKey) timer = window.setTimeout(build, 80);
  };
  new ResizeObserver(([en]) => resize(en)).observe(el);
  const sync = () => {
    const next = de.dataset.marginGlass === 'liquid' && !transparency.matches;
    if (next !== liquid) {
      liquid = next;clearTimeout(timer);lastKey = '';building = false;
      if (liquid) resize();
    }
    paint();
  };
  new MutationObserver(sync).observe(de,{attributes:true,attributeFilter:['data-margin-glass']});
  transparency.addEventListener('change',sync);
  paint();
}

/** 原版两张位移图（兜底 / 首帧），CSS 里可用 url(#lg-bar) / url(#lg-thumb) */
export function glassFilters(): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  for (const [id, map, sd] of [['lg-bar', barMap, '0.008 0.05'], ['lg-thumb', thumbMap, '0.006 0.02']] as const) {
    const f = document.createElementNS(NS, 'filter');
    f.id = id;
    f.setAttribute('primitiveUnits', 'objectBoundingBox');
    f.setAttribute('color-interpolation-filters', 'sRGB');
    setMarkup(f, `<feImage result="map" width="100%" height="100%" x="0" y="0" preserveAspectRatio="none" href="${map}"/><feGaussianBlur in="SourceGraphic" stdDeviation="${sd}" result="blur"/><feDisplacementMap in="blur" in2="map" scale="0.5" xChannelSelector="R" yChannelSelector="G"/>`);
    svg.append(f);
  }
  return svg;
}

/** 在 shadow root 里找到（或建好）滤镜容器 */
export function filtersIn(root: ShadowRoot): SVGSVGElement {
  return (root.querySelector('svg[aria-hidden="true"]') as SVGSVGElement | null) ?? root.appendChild(glassFilters());
}
