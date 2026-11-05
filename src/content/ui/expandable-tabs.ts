import { h, icon } from './dom';
import { reducedMotion } from '../motion';
import { loadSettings, onSettingsChange } from '../../shared/settings';

// 悬停展开文字可以关（v0.50，B 站评论建议）：关掉后只在点选时展开
let hoverOn = true;
loadSettings().then((s) => { hoverOn = s.headHover; }).catch(() => {});
onSettingsChange((s) => { hoverOn = s.headHover; });

export interface TabSpec {
  title: string;
  icon: string;
  /** 有 href 时渲染为新标签页打开的链接 */
  href?: string;
  run?: () => void;
  /** 用来挂未读角标 */
  id?: string;
}
export type TabItem = TabSpec | 'separator';

export interface ExpandableTabs {
  el: HTMLElement;
  thumb: HTMLElement;
  buttons: HTMLElement[];
  select(i: number | null): void;
  /** 角标：0 隐藏；数字超过 99 显示 99+；dot=true 只显示小圆点 */
  badge(id: string, n: number, dot?: boolean): void;
}

/**
 * 21st「Expandable Tabs」的原生移植：平时只露图标，选中项弹性展开出文字；
 * 点组件外任意处收起。原版用 framer-motion 动 width:auto，这里通过
 * max-width 和间距过渡展开文字（500ms / 无延迟 / 无回弹）。
 */
export function createExpandableTabs(items: TabItem[], onChange?: (i: number | null) => void): ExpandableTabs {
  const el = h('nav', { class: 'et', 'aria-label': '快捷入口' });
  // 液态玻璃滑块（21st「Apple Liquid glass switcher」的 toggler）：跟随选中项移动，移动时弹一下
  const thumb = h('span', { class: 'et-thumb', 'aria-hidden': 'true' });
  el.append(thumb);
  const buttons: HTMLElement[] = [];
  const byId = new Map<string, HTMLElement>();
  let selected: number | null = null;
  let pinned: number | null = null, hoverT = 0;
  let raf = 0, until = 0, x = 0, w = 0, shown = false;
  /** 悬停预览的项（-1 = 没有）：只移动指示条，不选中、不改变任何宽度（#11） */
  let hover = -1;

  const target = () => {
    const i = hover >= 0 ? hover : selected;
    const b = i === null ? null : buttons[i];
    if (!b) return null;
    const r = b.getBoundingClientRect(), o = el.getBoundingClientRect();
    return { x: r.left - o.left - el.clientLeft, w: r.width };
  };
  const paint = () => { thumb.style.translate = `${x}px 0`; thumb.style.width = `${w}px`; };
  const follow = (t: number) => {
    const g = target();
    if (g) {
      const k = reducedMotion() ? 1 : 0.2;
      x += (g.x - x) * k; w += (g.w - w) * k;
      paint();
    }
    if (t < until || (g && (Math.abs(g.x - x) > 0.3 || Math.abs(g.w - w) > 0.3))) raf = requestAnimationFrame(follow);
    else raf = 0;
  };

  const select = (i: number | null) => {
    if (i === selected) return;
    const prev = selected;
    selected = i;
    buttons.forEach((b, j) => b.toggleAttribute('data-selected', j === i));
    if (i === null) { thumb.removeAttribute('data-on'); shown = false; }
    else {
      const g = target();
      if (!shown && g) { x = g.x; w = g.w; paint(); }
      thumb.setAttribute('data-on', '');
      if (shown && prev !== null && !reducedMotion()) {
        thumb.animate([{ scale: '1 1' }, { scale: '1.18 1.12', offset: 0.45 }, { scale: '1 1' }], { duration: 520, easing: 'cubic-bezier(.3, 0, .2, 1)' });
      }
      shown = true;
      until = performance.now() + 600; // 跟随按钮 500ms 展开动画，并留少量缓动余量
      if (!raf) raf = requestAnimationFrame(follow);
    }
    onChange?.(i);
  };

  for (const it of items) {
    if (it === 'separator') { el.append(h('div', { class: 'et-sep', 'aria-hidden': 'true' })); continue; }
    const idx = buttons.length;
    const label = h('span', {}, it.title);
    const b = it.href
      ? h('a', { class: 'act et-btn', href: it.href, target: '_blank', rel: 'noopener', 'aria-label': it.title, title: it.title }, icon(it.icon), label)
      : h('button', { class: 'act et-btn', type: 'button', 'aria-label': it.title, title: it.title }, icon(it.icon), label);
    b.addEventListener('click', () => { clearTimeout(hoverT); hover = -1; pinned = idx; select(idx); it.run?.(); });
    // 悬停即展开文字（不执行动作），离开后回到点选的那一项
    b.addEventListener('pointerenter', (e) => {
      if ((e as PointerEvent).pointerType === 'touch' || !hoverOn) return;
      clearTimeout(hoverT);
      hover = idx;
      thumb.setAttribute('data-on', '');
      shown = true;
      until = performance.now() + 400;
      if (!raf) raf = requestAnimationFrame(follow);
    });
    if (it.id) byId.set(it.id, b);
    buttons.push(b);
    el.append(b);
  }

  el.addEventListener('pointerleave', () => {
    clearTimeout(hoverT);
    hoverT = window.setTimeout(() => {
      hover = -1;
      if (selected === null) { thumb.removeAttribute('data-on'); shown = false; }
      until = performance.now() + 400;
      if (!raf) raf = requestAnimationFrame(follow);
    }, 120);
  });

  // useOnClickOutside：shadow DOM 里要看 composedPath
  addEventListener('pointerdown', (e) => { if (selected !== null && !e.composedPath().includes(el)) { pinned = null; select(null); } }, true);

  const badge = (id: string, n: number, dot = false) => {
    const b = byId.get(id);
    if (!b) return;
    let m = b.querySelector<HTMLElement>('.et-badge');
    if (n <= 0) { m?.remove(); b.setAttribute('aria-label', b.querySelector('span')?.textContent ?? ''); return; }
    if (!m) { m = h('i', { class: 'et-badge', 'aria-hidden': 'true' }); b.append(m); }
    m.toggleAttribute('data-dot', dot);
    m.textContent = dot ? '' : n > 99 ? '99+' : String(n);
    b.setAttribute('aria-label', `${b.querySelector('span')?.textContent ?? ''}（${n > 99 ? '99+' : n} 条新）`);
  };

  return { el, thumb, buttons, select, badge };
}
