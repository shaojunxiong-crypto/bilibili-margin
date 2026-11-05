import { h, icon, ICONS } from './dom';

/**
 * 图组查看器（v0.47.2，GitHub #8：动态页点小图直接开新标签，不能连续看图组）。
 * 挂在卡片所在的 Shadow Root 里；← → 切换、Esc / 点空白关闭，底部缩略图条，右上角「原图」新标签打开。
 * 背景是实底遮罩，不用 backdrop-filter。
 */
let cur: { close: () => void } | null = null;

const imageSource = (p: string, width: number) => /^https:\/\/[^/]+\.(?:hdslb|biliimg)\.com\/[^?@#]+$/.test(p) && !/\.gif$/i.test(p) ? `${p}@${width}w.webp` : p;

export function openLightbox(pics: string[], start: number, root: Node): void {
  cur?.close();
  if (!pics.length) return;
  let i = Math.max(0, Math.min(pics.length - 1, start));
  const big = h('img', { class: 'lb-img', alt: '', referrerpolicy: 'no-referrer', decoding: 'async' }) as HTMLImageElement;
  const count = h('span', { class: 'lb-count' });
  const raw = h('a', { class: 'lb-btn lb-raw', target: '_blank', rel: 'noopener' }, '原图');
  const thumbs = pics.length > 1 ? h('div', { class: 'lb-thumbs' }, ...pics.map((p, k) => h('button', { type: 'button', class: 'lb-th', 'aria-label': `第 ${k + 1} 张`, onclick: (e: Event) => { e.stopPropagation(); go(k); } },
    h('img', { src: imageSource(p, 96), alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' })))) : null;
  const prev = h('button', { type: 'button', class: 'lb-nav prev', 'aria-label': '上一张', onclick: (e: Event) => { e.stopPropagation(); go(i - 1); } }, icon(ICONS.back));
  const next = h('button', { type: 'button', class: 'lb-nav next', 'aria-label': '下一张', onclick: (e: Event) => { e.stopPropagation(); go(i + 1); } }, icon(ICONS.chevronRight));
  const shut = h('button', { type: 'button', class: 'lb-btn', 'aria-label': '关闭', onclick: () => close() }, '关闭');
  const el = h('div', { class: 'lb', role: 'dialog', 'aria-modal': 'true', 'aria-label': '查看图片' },
    h('div', { class: 'lb-top' }, count, h('span', { class: 'lb-sp' }), raw, shut),
    h('div', { class: 'lb-stage' }, pics.length > 1 ? prev : null, big, pics.length > 1 ? next : null),
    thumbs);
  // 大图用 B 站图床缩放到 2000 宽以内的 webp，比原图小得多；预取相邻两张
  const src = (p: string) => imageSource(p, 2000);
  const pre = (k: number) => { if (k >= 0 && k < pics.length) { const im = new Image(); im.referrerPolicy = 'no-referrer'; im.src = src(pics[k]); } };
  function go(k: number): void {
    i = (k + pics.length) % pics.length;
    big.src = src(pics[i]);
    raw.setAttribute('href', pics[i]);
    count.textContent = pics.length > 1 ? `${i + 1} / ${pics.length}` : '';
    thumbs?.querySelectorAll('.lb-th').forEach((t, n) => t.toggleAttribute('data-on', n === i));
    (thumbs?.children[i] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest', inline: 'center' });
    pre(i + 1); pre(i - 1);
  }
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); go(i - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); go(i + 1); }
  };
  function close(): void {
    removeEventListener('keydown', key, true);
    el.removeAttribute('data-open');
    setTimeout(() => el.remove(), 200);
    document.documentElement.style.removeProperty('overflow');
    cur = null;
  }
  el.addEventListener('click', (e) => { if (e.target === el || (e.target as HTMLElement).classList.contains('lb-stage')) close(); });
  addEventListener('keydown', key, true);
  const host = root instanceof ShadowRoot ? root : document.body;
  (host.querySelector('.app') ?? host).append(el);
  go(i);
  requestAnimationFrame(() => el.setAttribute('data-open', ''));
  cur = { close };
}
