import { h, icon, ICONS } from './dom';

/** 滑动滑块的分段选择器（参考 21st「Segmented Control」，原生重写） */
export function segmented<T extends string>(options: [T, string][], value: T, onChange: (v: T) => void): HTMLElement & { set(v: T): void } {
  const thumb = h('span', { class: 'seg-thumb', 'aria-hidden': 'true' });
  const wrap = h('div', { class: 'seg', role: 'radiogroup' }, thumb) as unknown as HTMLElement & { set(v: T): void };
  const btns = options.map(([v, label]) => {
    const b = h('button', { type: 'button', role: 'radio', class: 'seg-opt', onclick: () => { wrap.set(v); onChange(v); } }, label);
    b.dataset.v = v;
    wrap.append(b);
    return b;
  });
  const place = () => {
    const on = btns.find((b) => b.getAttribute('aria-checked') === 'true');
    if (!on || !on.offsetWidth) return;
    thumb.style.width = `${on.offsetWidth}px`;
    thumb.style.transform = `translateX(${on.offsetLeft - 3}px)`;
  };
  // ResizeObserver / IntersectionObserver 都在布局完成后回调，这时读 offsetWidth 不会强制重排；
  // 只有用户切换选项时才在下一帧量一次（v0.44：页面加载时在 rAF 里量会把整页排版提前，空间页约 500ms）
  let queued = 0, ready = false;
  const visible = () => wrap.checkVisibility?.({ visibilityProperty: true }) ?? true;
  const now = () => { if (visible()) place(); };
  wrap.set = (v: T) => {
    const cur = btns.find((b) => b.getAttribute('aria-checked') === 'true')?.dataset.v;
    if (cur === v) return;
    btns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === v)));
    if (ready && cur !== v && !queued) queued = requestAnimationFrame(() => { queued = 0; now(); });
  };
  new ResizeObserver(now).observe(wrap);
  new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) now(); }).observe(wrap);
  wrap.set(value);
  ready = true;
  return wrap;
}

export function toggle(value: boolean, label: string, onChange: (v: boolean) => void): HTMLButtonElement {
  const b = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': String(value), 'aria-label': label });
  b.addEventListener('click', () => {
    const v = b.getAttribute('aria-checked') !== 'true';
    b.setAttribute('aria-checked', String(v));
    onChange(v);
  });
  return b;
}

/** 回车添加的标签输入（参考 21st「Chip Group」的动效） */
export function chipInput(values: string[], placeholder: string, onChange: (v: string[]) => void): HTMLElement & { set(v: string[]): void } {
  let list = [...values];
  const input = h('input', { type: 'text', placeholder, 'aria-label': placeholder });
  const wrap = h('div', { class: 'chips', onclick: () => input.focus() }) as unknown as HTMLElement & { set(v: string[]): void };
  const render = (animateLast = false) => {
    wrap.replaceChildren(...list.map((v, i) => {
      const chip = h('span', { class: `chip${animateLast && i === list.length - 1 ? ' pop' : ''}` }, h('span', {}, v),
        h('button', { type: 'button', title: '移除', 'aria-label': `移除 ${v}`, onclick: (e: Event) => { e.stopPropagation(); list.splice(i, 1); render(); onChange(list); } }, icon(ICONS.close)));
      return chip;
    }), input);
  };
  const add = () => {
    const parts = input.value.split(/[,，\n]/).map((s) => s.trim()).filter((s) => s && !list.includes(s));
    input.value = '';
    if (!parts.length) return;
    list.push(...parts);
    render(true);
    onChange(list);
    input.focus();
  };
  input.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
    else if (e.key === 'Backspace' && !input.value && list.length) { list.pop(); render(); onChange(list); input.focus(); }
  });
  input.addEventListener('blur', add);
  wrap.set = (v) => { if (v.length === list.length && v.every((s, i) => s === list[i])) return; list = [...v]; render(); };
  render();
  return wrap;
}

/** 细线滑杆：按档位取值（参考 21st「Minimal Slider」的 hairline 样式） */
export function stepSlider(steps: number[], value: number, fmt: (n: number) => string, onChange: (v: number) => void, label = ''): HTMLElement {
  const idx = Math.max(0, steps.findIndex((s) => s >= value));
  const out = h('output', {}, fmt(steps[idx]));
  const range = h('input', { type: 'range', min: 0, max: steps.length - 1, step: 1, value: idx, 'aria-valuetext': fmt(steps[idx]), 'aria-label': label || undefined });
  const paint = () => range.style.setProperty('--p', `${(Number(range.value) / (steps.length - 1)) * 100}%`);
  range.addEventListener('input', () => { out.textContent = fmt(steps[Number(range.value)]); range.setAttribute('aria-valuetext', out.textContent); paint(); });
  range.addEventListener('change', () => onChange(steps[Number(range.value)]));
  paint();
  return h('div', { class: 'slider' }, range, out);
}

export function rangeSlider(value: number, fmt: (n: number) => string, onChange: (v: number) => void, label = '', onPreview?: (v: number) => void): HTMLElement {
  const out = h('output', {}, fmt(value));
  const range = h('input', { type: 'range', min: 0, max: 100, step: 1, value: Math.round(value * 100), 'aria-label': label || undefined, 'aria-valuetext': fmt(value) });
  const paint = () => range.style.setProperty('--p', `${range.value}%`);
  range.addEventListener('input', () => { out.textContent = fmt(Number(range.value) / 100); range.setAttribute('aria-valuetext', out.textContent); paint(); onPreview?.(Number(range.value) / 100); });
  range.addEventListener('change', () => onChange(Number(range.value) / 100));
  paint();
  return h('div', { class: 'slider' }, range, out);
}

export function row(label: string, hint: string | Node | null, control: Node): HTMLElement {
  return h('div', { class: 'row' }, h('div', { class: 'row-label' }, h('span', {}, label), hint ? h('small', {}, hint) : null), control);
}

export function block(label: string, hint: string | null, control: Node): HTMLElement {
  return h('div', { class: 'block' }, h('div', { class: 'row-label' }, h('span', {}, label), hint ? h('small', {}, hint) : null), control);
}

let toastTimer = 0;
export function toast(root: HTMLElement, text: string, action?: { label: string; run: () => void }): void {
  root.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast', role: 'status' }, h('span', {}, text),
    action ? h('button', { type: 'button', onclick: () => { action.run(); t.remove(); } }, action.label) : null);
  root.append(t);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 4200);
}

/** 多选小胶囊：每个都能单独开关（首页「卡片信息」用）。value 是打开的项 */
export function pillToggles<T extends string>(options: [T, string][], value: T[], onChange: (on: T[]) => void): HTMLElement & { set(on: T[]): void } {
  const wrap = h('div', { class: 'pills', role: 'group' }) as unknown as HTMLElement & { set(on: T[]): void };
  const btns = options.map(([v, label]) => {
    const b = h('button', { type: 'button', class: 'pill', 'aria-pressed': 'false', onclick: () => {
      b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
      onChange(btns.filter((x) => x.getAttribute('aria-pressed') === 'true').map((x) => x.dataset.v as T));
    } }, label);
    b.dataset.v = v;
    wrap.append(b);
    return b;
  });
  wrap.set = (on: T[]) => btns.forEach((b) => b.setAttribute('aria-pressed', String(on.includes(b.dataset.v as T))));
  wrap.set(value);
  return wrap;
}
