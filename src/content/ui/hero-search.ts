import { every } from '../sched';
import { openBili } from '../navigation';
import { forgetSearch, hotSearch, rememberSearch, searchHistory, searchUrl, suggest, type Hot } from '../api/search';
import { h, highlight, icon, ICONS } from './dom';
import { onMotionChange, reducedMotion } from '../motion';

/**
 * 首页主搜索 v0.23.0
 * 参考：21st「Placeholders And Vanish Input」（Aceternity，热搜词轮播占位 + 回车后文字化成粒子散去）、
 * 21st「Morphing Search」（输入框本身向下长成联想面板，不另弹浮层）、
 * @vponamariov「聚焦压暗」（输入时整页暗下去，只留搜索）。
 */
export interface HeroSearch { el: HTMLElement; scrim: HTMLElement; focus: () => void }

const strip = (s: string) => s.replace(/<[^>]+>/g, '');

export function createHeroSearch(app: () => HTMLElement, _onPalette?: () => void): HeroSearch {
  const input = h('input', {
    class: 'hs-input', type: 'search', autocomplete: 'off', spellcheck: 'false', 'aria-label': '搜索视频、UP 主',
    role: 'combobox', 'aria-expanded': 'false', 'aria-controls': 'hs-list', 'aria-autocomplete': 'list',
  }) as HTMLInputElement;
  const ph = h('div', { class: 'hs-ph', 'aria-hidden': 'true' });
  const canvas = h('canvas', { class: 'hs-vanish', 'aria-hidden': 'true' }) as HTMLCanvasElement;
  const clear = h('button', { class: 'hs-clear', type: 'button', title: '清空', 'aria-label': '清空' }, icon(ICONS.close));
  const list = h('div', { class: 'hs-list', id: 'hs-list', role: 'listbox', 'aria-label': '搜索建议' });
  const box = h('form', { class: 'hero-search', role: 'search', 'data-open': 'false' },
    h('div', { class: 'hs-row' },
      icon(ICONS.search),
      h('div', { class: 'hs-field' }, input, ph, canvas),
      clear,
      h('button', { class: 'hs-btn', type: 'submit' }, '搜索')),
    h('div', { class: 'hs-drop' }, h('div', { class: 'hs-drop-in' }, list)),
  );
  const el = h('div', { class: 'hs-slot' }, box);
  const scrim = h('div', { class: 'hs-scrim', 'aria-hidden': 'true' });

  // ── 热搜词轮播占位 ──
  let hot: Hot[] = [];
  let hi = 0;
  let rot: (() => void) | null = null;
  const phWord = (text: string, cls = '') => h('span', { class: `hs-ph-w ${cls}` }, text);
  const phWords = h('span', { class: 'hs-ph-ws' });
  ph.append(h('span', { class: 'hs-ph-pre' }, '搜索视频、UP 主'), phWords);
  const current = () => hot[hi]?.keyword ?? '';
  function showHot(first = false) {
    const k = hot[hi]?.name || current();
    if (!k) return;
    const prev = phWords.querySelector('.hs-ph-w:not(.out)');
    const next = phWord(k, first || reducedMotion() ? '' : 'in');
    phWords.append(next);
    if (prev) { prev.classList.add('out'); if (reducedMotion()) prev.remove(); else setTimeout(() => prev.remove(), 420); }
  }
  const stopRot = () => { rot?.(); rot = null; };
  const startRot = () => {
    stopRot();
    if (reducedMotion() || !hot.length) return;
    rot = every(3200, () => {
      if (input.value) return;
      hi = (hi + 1) % hot.length;
      showHot();
    });
  };
  onMotionChange(() => {
    if (reducedMotion()) stopRot();
    else if (!rot) startRot();
  });
  hotSearch().then((x) => {
    hot = x.slice(0, 10);
    if (!hot.length) return;
    ph.firstElementChild!.textContent = '大家都在搜';
    ph.classList.add('has-hot');
    showHot(true);
    startRot();
    if (isOpen()) render();
  }).catch(() => {});

  // ── 联想面板 ──
  let opts: HTMLElement[] = [];
  let sel = -1;
  let sugg: { term: string; html: string }[] = [];
  let ctrl: AbortController | null = null;
  let timer = 0;
  const isOpen = () => box.dataset.open === 'true';

  const go = (q: string) => {
    q = q.trim();
    if (!q) { input.focus(); return; }
    rememberSearch(q);
    openBili(searchUrl(q));
  };
  const opt = (cls: string, run: () => void, ...kids: (Node | string)[]) => {
    const o = h('div', { class: `hs-opt ${cls}`, role: 'option', 'aria-selected': 'false' }, ...kids);
    o.addEventListener('pointerdown', (e) => e.preventDefault()); // 不让输入框失焦
    o.addEventListener('click', () => { run(); close(); });
    o.addEventListener('pointermove', () => setSel(opts.indexOf(o)));
    return o;
  };
  function setSel(i: number) {
    sel = i;
    opts.forEach((o, j) => o.setAttribute('aria-selected', String(j === i)));
    if (i >= 0) { opts[i].scrollIntoView({ block: 'nearest' }); input.setAttribute('aria-activedescendant', `hs-o${i}`); }
    else input.removeAttribute('aria-activedescendant');
  }

  function render() {
    const q = input.value.trim();
    list.replaceChildren();
    let n = 0;
    const stag = (o: HTMLElement) => { o.style.setProperty('--i', String(n)); o.id = `hs-o${n}`; n++; return o; };
    if (!q) {
      const hist = searchHistory().slice(0, 8);
      if (hist.length) {
        const chips = h('div', { class: 'hs-chips' });
        for (const s of hist) {
          const c = opt('hs-chip', () => go(s), h('span', {}, s));
          const x = h('button', { class: 'hs-chip-x', type: 'button', 'aria-label': `删除 ${s}` }, icon(ICONS.close));
          x.addEventListener('pointerdown', (e) => e.preventDefault());
          x.addEventListener('click', (e) => { e.stopPropagation(); forgetSearch(s); render(); });
          c.append(x);
          chips.append(stag(c));
        }
        const wipe = h('button', { class: 'hs-wipe', type: 'button' }, '清空');
        wipe.addEventListener('pointerdown', (e) => e.preventDefault());
        wipe.addEventListener('click', () => { forgetSearch(); render(); });
        list.append(h('div', { class: 'hs-sec' }, h('div', { class: 'hs-head' }, h('span', {}, '最近搜索'), h('span', { class: 'en' }, 'Recent'), wipe), chips));
      }
      if (hot.length) {
        const grid = h('div', { class: 'hs-hot' });
        hot.forEach((x, i) => grid.append(stag(opt('hs-hot-i', () => go(x.keyword),
          h('span', { class: `hs-no${i < 3 ? ' lead' : ''}` }, String(i + 1).padStart(2, '0')),
          h('span', { class: 'hs-t' }, x.name)))));
        list.append(h('div', { class: 'hs-sec' }, h('div', { class: 'hs-head' }, h('span', {}, 'bilibili 热搜'), h('span', { class: 'en' }, 'Trending')), grid));
      }
    } else {
      const rows = h('div', { class: 'hs-rows' });
      rows.append(stag(opt('hs-row-i hs-go', () => submit(), icon(ICONS.search), h('span', { class: 'hs-t' }, `搜索「${q}」`), h('kbd', {}, '↵'))));
      for (const s of sugg) {
        if (s.term === q) continue;
        const t = h('span', { class: 'hs-t' });
        highlight(t, s.html);
        if (!t.textContent) t.textContent = strip(s.term);
        rows.append(stag(opt('hs-row-i', () => go(s.term), icon(ICONS.search), t, icon(ICONS.arrow))));
      }
      list.append(rows);
    }
    opts = [...list.querySelectorAll<HTMLElement>('.hs-opt')];
    sel = -1;
    if (q) setSel(0);
    box.classList.toggle('has-list', opts.length > 0);
  }

  function open() {
    if (isOpen()) return;
    render();
    box.dataset.open = 'true';
    input.setAttribute('aria-expanded', 'true');
    app().classList.add('hs-open');
  }
  function close() {
    if (!isOpen()) return;
    box.dataset.open = 'false';
    input.setAttribute('aria-expanded', 'false');
    app().classList.remove('hs-open');
    ctrl?.abort();
  }

  const sync = () => {
    box.classList.toggle('has-value', !!input.value);
  };
  input.addEventListener('focus', open);
  input.addEventListener('blur', () => setTimeout(() => { if (!box.contains(document.activeElement)) close(); }, 0));
  input.addEventListener('input', () => {
    sync();
    if (!isOpen()) open();
    const q = input.value.trim();
    clearTimeout(timer);
    ctrl?.abort();
    if (!q) { sugg = []; render(); return; }
    render();
    timer = window.setTimeout(async () => {
      ctrl = new AbortController();
      try { sugg = await suggest(q, ctrl.signal); if (input.value.trim() === q) render(); } catch { /* 取消或网络失败 */ }
    }, 120);
  });
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.isComposing) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!isOpen()) open();
      if (!opts.length) return;
      e.preventDefault();
      const d = e.key === 'ArrowDown' ? 1 : -1;
      setSel(sel < 0 ? (d > 0 ? 0 : opts.length - 1) : (sel + d + opts.length) % opts.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isOpen() && sel >= 0 && opts[sel]) { opts[sel].click(); return; }
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (input.value && isOpen()) { input.value = ''; sync(); render(); } else { close(); input.blur(); }
    }
  });
  clear.addEventListener('pointerdown', (e) => e.preventDefault());
  clear.addEventListener('click', () => { input.value = ''; sync(); sugg = []; render(); input.focus(); });
  scrim.addEventListener('click', () => { close(); input.blur(); });
  box.addEventListener('submit', (e) => { e.preventDefault(); submit(); });

  function submit() {
    const typed = input.value.trim();
    const q = typed || current();
    if (!q) { input.focus(); return; }
    go(q);
    if (typed) vanish(); else close();
  }

  // ── 回车后文字化成粒子散去（21st Placeholders And Vanish Input 的原生 canvas 版） ──
  function vanish() {
    const text = input.value;
    if (reducedMotion() || !text) { input.value = ''; sync(); close(); return; }
    const field = canvas.parentElement!;
    const W = field.clientWidth, H = field.clientHeight, dpr = 2;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) { input.value = ''; sync(); close(); return; }
    const cs = getComputedStyle(input);
    ctx.scale(dpr, dpr);
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    ctx.fillStyle = cs.color;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, H / 2);
    const img = ctx.getImageData(0, 0, W * dpr, H * dpr).data;
    const pts: { x: number; y: number; r: number; c: string; vx: number; vy: number }[] = [];
    for (let y = 0; y < H * dpr; y += 2) for (let x = 0; x < W * dpr; x += 2) {
      const k = (y * W * dpr + x) * 4;
      if (img[k + 3] > 90) pts.push({ x: x / dpr, y: y / dpr, r: 1, c: `rgba(${img[k]},${img[k + 1]},${img[k + 2]},`, vx: 0, vy: 0 });
    }
    const maxX = pts.reduce((m, p) => Math.max(m, p.x), 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    box.classList.add('vanishing');
    input.value = '';
    sync();
    const t0 = performance.now();
    const D = 700;
    const step = (now: number) => {
      const t = (now - t0) / D;
      ctx.clearRect(0, 0, W, H);
      for (const p of pts) {
        // 从右往左逐个吹散：右边的字先走
        const start = (1 - p.x / (maxX || 1)) * 0.45;
        const lt = Math.max(0, (t - start) / (1 - start));
        if (lt <= 0) { ctx.fillStyle = `${p.c}1)`; ctx.fillRect(p.x, p.y, 1, 1); continue; }
        if (!p.vx) { p.vx = 0.6 + Math.random() * 1.6; p.vy = (Math.random() - 0.5) * 1.4; }
        const a = 1 - lt;
        if (a <= 0) continue;
        ctx.fillStyle = `${p.c}${a.toFixed(2)})`;
        const s = p.r * (1 - lt * 0.6);
        ctx.fillRect(p.x + p.vx * lt * 28, p.y + p.vy * lt * 18, s, s);
      }
      if (t < 1.02) requestAnimationFrame(step);
      else { ctx.clearRect(0, 0, W, H); box.classList.remove('vanishing'); }
    };
    requestAnimationFrame(step);
    close();
  }

  return { el, scrim, focus: () => input.focus() };
}
