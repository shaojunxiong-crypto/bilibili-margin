import { h, icon } from './dom';
import { loadSettings, onSettingsChange } from '../../shared/settings';

// 关闭悬停预览后，滑块只在点选时移动。
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

/** 21st「Expandable Tabs」的原生移植；按钮保持固定宽度，滑块预览悬停项。 */
export function createExpandableTabs(items: TabItem[], onChange?: (i: number | null) => void): ExpandableTabs {
  const el = h('nav', { class: 'et', 'aria-label': '快捷入口' });
  // 液态玻璃滑块：事件发生时定位，CSS 负责可打断的短过渡。
  const thumb = h('span', { class: 'et-thumb', 'aria-hidden': 'true' });
  el.append(thumb);
  const buttons: HTMLElement[] = [];
  const byId = new Map<string, HTMLElement>();
  let selected: number | null = null;
  let hoverT = 0;
  /** 悬停预览的项（-1 = 没有）：只移动指示条，不选中、不改变任何宽度（#11） */
  let hover = -1;

  const place = () => {
    const i = hover >= 0 ? hover : selected;
    const b = i === null ? null : buttons[i];
    if (!b || !b.getClientRects().length) return;
    const r = b.getBoundingClientRect(), o = el.getBoundingClientRect();
    thumb.style.translate = `${r.left - o.left - el.clientLeft}px 0`;
    thumb.style.width = `${r.width}px`;
  };

  const select = (i: number | null) => {
    if (i === selected) return;
    selected = i;
    buttons.forEach((b, j) => b.toggleAttribute('data-selected', j === i));
    if (i === null) thumb.removeAttribute('data-on');
    else {
      place();
      thumb.setAttribute('data-on', '');
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
    b.addEventListener('click', () => { clearTimeout(hoverT); hover = -1; if (selected === idx) place(); else select(idx); it.run?.(); });
    // 悬停只预览，不执行动作；离开后回到点选的那一项。
    b.addEventListener('pointerenter', (e) => {
      if ((e as PointerEvent).pointerType === 'touch' || !hoverOn) return;
      clearTimeout(hoverT);
      hover = idx;
      thumb.setAttribute('data-on', '');
      place();
    });
    if (it.id) byId.set(it.id, b);
    buttons.push(b);
    el.append(b);
  }

  el.addEventListener('pointerleave', () => {
    clearTimeout(hoverT);
    hoverT = window.setTimeout(() => {
      hover = -1;
      if (selected === null) thumb.removeAttribute('data-on');
      else place();
    }, 120);
  });

  // useOnClickOutside：shadow DOM 里要看 composedPath
  addEventListener('pointerdown', (e) => { if (selected !== null && !e.composedPath().includes(el)) select(null); }, true);
  new ResizeObserver(place).observe(el);

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
