import { every } from '../sched';
import { introActive } from './intro/gate';
import { appendMarkup, h } from './dom';
import { weather, setLoc, savedLoc, type Wx } from '../api/weather';
import { createCityPicker } from './city-picker';
import { WEATHER_SKIES, WEATHER_SKY_LAYERS, moonAge, weatherScene, glyphSvg, SKY_PITCH, FRAME } from './dotsky';
import { onMotionChange, reducedMotion } from '../motion';

/**
 * 首页天气卡：21st「Weather Widget」（vijayksingh）的横版排法——
 * 左边下沉的点阵天空（太阳按当地钟点走弧线、夜里月相 + 星星、云雨雪雾风都会动），地面上放像素体温度和天气；
 * 右边城市 + Live 指示灯 + 当地时钟，未来 6 个时段（每 3 小时），再下面 3 天的低温→高温点条。
 * 点城市名可以改城市。动画只在卡片可见、页面没在滚动、没开「减少动态效果」时跑。
 */

const GRID = { cols: 30, rows: 26, horizon: 19 };
const deg = (n: number) => `${Math.round(n)}°`;

export function createWeather(): HTMLElement {
  const el = h('section', { class: 'wx', 'aria-label': '天气' });
  el.append(h('div', { class: 'wx-sky sk' }), h('div', { class: 'wx-side' }));
  let wx: Wx | null = null;
  let tick = 0, visible = false;
  let stop: (() => void) | null = null;

  const localHour = () => {
    const d = new Date(Date.now() + (wx?.offset ?? 0) * 1000);
    return d.getUTCHours() + d.getUTCMinutes() / 60;
  };
  const clock = () => {
    const d = new Date(Date.now() + (wx?.offset ?? 0) * 1000);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  };

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${GRID.cols * SKY_PITCH} ${GRID.rows * SKY_PITCH}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMax slice');
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('aria-hidden', 'true');
  // 每层一个固定的 <path>，每帧只改变了的 d：以前整段 innerHTML 重写，6 次/秒重建节点 + 重新布局
  const layers = new Map<string, SVGPathElement>();
  for (const l of WEATHER_SKY_LAYERS) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', `s-${l}`);
    layers.set(l, path); svg.append(path);
  }
  const paint = () => {
    if (!wx) return;
    const p = weatherScene({ ...GRID, hour: localHour(), sky: { ...WEATHER_SKIES[wx.kind], moonPhase: moonAge(new Date()) }, tick }) as unknown as Record<string, string>;
    for (const [l, path] of layers) {
      const d = p[l] || '';
      if (path.getAttribute('d') !== d) { if (d) path.setAttribute('d', d); else path.removeAttribute('d'); }
    }
  };
  const clockEl = h('span', { class: 'wx-clock' });
  // 时钟单独一个 15 秒的周期任务（v0.47，评论区：右上角时间停在打开页面那一刻）：
  // 以前跟着天空动画走，滚动中、打开面板、系统开了「减少动画」时动画暂停，时钟也跟着不动了。
  // 「减少动画」时天空不逐帧动，但太阳 / 月亮位置仍按当地时间每 15 秒重画一次。
  let stopClock: (() => void) | null = null;
  let fetchedAt = 0;
  const minute = () => {
    clockEl.textContent = clock();
    if (reducedMotion()) paint();
    if (Date.now() - fetchedAt > 30 * 60_000) { fetchedAt = Date.now(); load(true); } // 天气数据半小时刷新一次
  };
  const run = () => {
    stop?.(); stop = null;
    stopClock?.(); stopClock = null;
    const app = el.closest('.app');
    if (!wx || !visible || document.hidden) return;
    minute();
    stopClock = every(15_000, minute);
    if (reducedMotion()) return;
    stop = every(FRAME, () => {
      if (app?.classList.contains('scrolling') || app?.classList.contains('sheeted') || introActive()) return;
      tick++; paint();
    });
  };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; run(); }).observe(el);
  document.addEventListener('visibilitychange', run);
  onMotionChange(run);
  addEventListener('margin:wx-loc', () => load());

  let closeCity: (() => void) | null = null;
  const editCity = (place: HTMLElement) => {
    closeCity?.();
    const picker = createCityPicker(loc => { closeCity?.(); setLoc(loc); });
    picker.el.classList.add('wx-city-picker');
    picker.input.value = wx?.loc.name ?? '';
    closeCity = () => { closeCity = null; picker.cancel(); picker.el.remove(); };
    picker.el.addEventListener('keydown', event => {
      if (event.key === 'Escape') { closeCity?.(); place.focus(); }
    });
    picker.el.addEventListener('focusout', event => {
      if (!(event.relatedTarget instanceof Node) || !picker.el.contains(event.relatedTarget)) closeCity?.();
    });
    el.append(picker.el);
    picker.input.focus(); picker.input.select();
  };

  const render = () => {
    if (!wx) return;
    closeCity?.();
    const w = wx;
    const sky = h('div', { class: 'wx-sky', role: 'img', 'aria-label': `${w.loc.name}：${w.condition}，${deg(w.temp)}` },
      svg,
      h('div', { class: 'wx-now' },
        h('span', { class: 'wx-temp' }, deg(w.temp)),
        h('span', { class: 'wx-cond' }, w.condition)));
    const place = h('button', { class: 'wx-city', type: 'button', title: [w.loc.region, '点击更换城市'].filter(Boolean).join(' · ') }, w.loc.name);
    place.onclick = () => editCity(place);
    clockEl.textContent = clock();
    const hours = h('ol', { class: 'wx-hours', 'aria-label': '未来几个时段' },
      ...w.hours.map((x) => {
        const li = h('li', { 'aria-label': `${x.label} ${deg(x.temp)}` }, h('span', { class: 'wx-hl' }, x.label));
        appendMarkup(li, glyphSvg(x.kind, x.hour));
        li.append(h('b', {}, deg(x.temp)));
        return li;
      }));
    // 3 天：低温→高温点条，共用一个刻度（原 Weather.Week）
    const days = w.days.slice(0, 3);
    const lo = Math.floor(Math.min(...days.map((d) => d.low), w.temp));
    const hi = Math.ceil(Math.max(...days.map((d) => d.high), w.temp));
    const span = Math.max(1, Math.min(20, hi - lo));
    const bar = (low: number, high: number, now?: number) => {
      let off = '', lit = '', cur = '';
      for (let t = lo; t <= lo + span; t++) {
        const d = `M${(t - lo) * 8 + 1} 0h6v6h-6Z`;
        if (now !== undefined && t === Math.round(now)) cur += d;
        else if (t >= Math.round(low) && t <= Math.round(high)) lit += d;
        else off += d;
      }
      return `<svg class="wx-bar" viewBox="0 0 ${(span + 1) * 8} 6" preserveAspectRatio="none" shape-rendering="crispEdges" aria-hidden="true"><path class="b-off" d="${off}"/><path class="b-lit" d="${lit}"/><path class="b-now" d="${cur}"/></svg>`;
    };
    const week = h('ul', { class: 'wx-week', 'aria-label': '未来三天' },
      ...days.map((d, i) => {
        const li = h('li', { 'aria-label': `${d.name} ${deg(d.low)} 到 ${deg(d.high)}`, 'data-kind': d.kind }, h('span', { class: 'wx-dn' }, d.name));
        appendMarkup(li, glyphSvg(d.kind));
        li.append(h('span', { class: 'wx-lo' }, deg(d.low)));
        appendMarkup(li, bar(d.low, d.high, i === 0 ? w.temp : undefined));
        li.append(h('span', { class: 'wx-hi' }, deg(d.high)));
        return li;
      }));
    const side = h('div', { class: 'wx-side' },
      h('header', { class: 'wx-head' },
        h('div', { class: 'wx-place' }, place, h('small', {}, `体感 ${deg(w.feels)} · 降水 ${w.rainPct}% · ${Math.round(w.wind)} km/h`)),
        h('div', { class: 'wx-live' }, h('i', { class: 'wx-led' }), h('span', {}, 'Live'), clockEl)),
      hours, week);
    el.replaceChildren(sky, side);
    paint();
    run();
  };

  let loadSequence = 0, retryTimer = 0;
  const load = (quiet = false, retry = 0) => {
    const request = ++loadSequence;
    clearTimeout(retryTimer);
    if (!quiet) fetchedAt = Date.now();
    weather().then((x) => { if (request === loadSequence) { wx = x; render(); } }).catch((err) => {
      if (request !== loadSequence) return;
      console.warn('[margin] weather', err);
      if (quiet && wx) return; // 后台刷新失败：保留旧数据
      if (retry < 2) { retryTimer = window.setTimeout(() => load(quiet, retry + 1), 4000 * (retry + 1)); return; }
      closeCity?.();
      el.replaceChildren(h('p', { class: 'wx-empty', title: String(err) }, `天气暂时取不到${savedLoc()?.name ? `（${savedLoc()!.name}）` : ''}`));
    });
  };
  load();
  return el;
}
