import { historyList, type Cursor, type HistItem } from '../api/history';
import { fmtAgo, h, icon, ICONS } from './dom';

/**
 * 历史记录抽屉（空间页用）。不复用 drawer.ts 的弹簧实现——那边绑死了「稍后再看」的数据源；
 * 这里用 CSS transition 做右侧滑出，样式内联，避免和 .dw-* 的尺寸假设耦合。
 */
const WIDTH = 420;

export interface Panel { el: HTMLElement; open: () => void; close: () => void }

export function createHistoryDrawer(): Panel {
  const count = h('span', { class: 'dw-count' });
  const body = h('div', { style: 'flex:1;overflow:auto;padding:12px 14px;display:flex;flex-direction:column;gap:8px' });
  const more = h('button', {
    type: 'button', class: 'ghost', style: 'margin:10px 14px;display:none',
  }, '加载更多');
  const closeBtn = h('button', {
    type: 'button', class: 'dw-close', 'aria-label': '关闭', title: '关闭 (Esc)',
    style: 'background:none;border:0;color:inherit;cursor:pointer;padding:6px',
    onclick: () => close(),
  }, icon(ICONS.close));
  const head = h('div', {
    class: 'dw-head',
    style: 'display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08)',
  }, h('div', {}, h('h2', { style: 'margin:0;font-size:15px;font-weight:600' }, '历史记录', count)), closeBtn);
  const foot = h('a', {
    href: 'https://www.bilibili.com/history', target: '_blank', rel: 'noopener',
    style: 'display:block;padding:12px 16px;border-top:1px solid rgba(255,255,255,.08);font-size:12px;opacity:.7;text-decoration:none;color:inherit',
  }, '在 B 站打开完整历史 →');
  const col = h('div', { style: 'display:flex;flex-direction:column;flex:1;min-height:0' }, body, more, foot);
  const panel = h('aside', {
    role: 'dialog', 'aria-modal': 'true', 'aria-label': '历史记录', tabindex: '-1',
    style: `position:fixed;top:0;right:0;height:100vh;width:min(${WIDTH}px,92vw);display:flex;flex-direction:column;`
      + 'background:var(--surface,#1b1d21);color:var(--ink,#eee);box-shadow:-24px 0 60px rgba(0,0,0,.45);'
      + 'transform:translateX(102%);transition:transform .34s cubic-bezier(.22,.61,.36,1);z-index:61',
  }, head, col);
  const scrim = h('div', {
    style: 'position:fixed;inset:0;background:rgba(0,0,0,.42);opacity:0;pointer-events:none;transition:opacity .3s;z-index:60',
  });
  const el = h('div', { hidden: '' }, scrim, panel);

  let cursor: Cursor | null = null;
  let loaded = false;
  let loading = false;
  let done = false;
  let returnTo: HTMLElement | null = null;
  let isOpen = false;
  let closeTimer = 0;
  let openFrame = 0;
  let scrollRoot: HTMLElement | null = null;
  let previousOverflow = '';
  let previousBodyOverflow = '';

  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };

  function open(): void {
    if (isOpen) return;
    isOpen = true;
    clearTimeout(closeTimer);
    closeTimer = 0;
    returnTo = (el.getRootNode() as ShadowRoot | Document).activeElement as HTMLElement | null;
    scrollRoot = el.closest<HTMLElement>('.app') ?? document.body;
    previousOverflow = scrollRoot.style.overflow;
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    scrollRoot.style.overflow = 'hidden';
    el.hidden = false;
    el.inert = false;
    el.style.pointerEvents = 'auto';
    openFrame = requestAnimationFrame(() => {
      openFrame = 0;
      panel.style.transform = 'translateX(0)'; scrim.style.opacity = '1'; scrim.style.pointerEvents = 'auto';
    });
    document.addEventListener('keydown', onKey, true);
    scrim.onclick = () => close();
    panel.focus({ preventScroll: true });
    if (!loaded) void load();
  }
  function close(): void {
    if (!isOpen) return;
    isOpen = false;
    cancelAnimationFrame(openFrame);
    openFrame = 0;
    panel.style.transform = 'translateX(102%)';
    scrim.style.opacity = '0';
    scrim.style.pointerEvents = 'none';
    document.removeEventListener('keydown', onKey, true);
    el.inert = true;
    el.style.pointerEvents = 'none';
    if (scrollRoot) scrollRoot.style.overflow = previousOverflow;
    document.body.style.overflow = previousBodyOverflow;
    closeTimer = window.setTimeout(() => { el.hidden = true; closeTimer = 0; }, 360);
    returnTo?.focus?.({ preventScroll: true });
  }

  function row(it: HistItem): HTMLElement {
    const cover = h('img', {
      src: it.cover ? `${it.cover}@224w_126h_1c.webp` : '', alt: '', loading: 'lazy', decoding: 'async',
      referrerpolicy: 'no-referrer',
      style: 'width:96px;height:54px;object-fit:cover;border-radius:8px;flex:none;background:rgba(255,255,255,.06)',
    });
    const pct = it.progress === -1 ? 100 : it.duration > 0 ? Math.max(0, Math.min(100, it.progress / it.duration * 100)) : 0;
    const prog = h('span', {
      style: 'position:absolute;left:0;right:0;bottom:0;height:2px;background:rgba(255,255,255,.2)',
    }, h('i', { style: `display:block;height:100%;width:${pct}%;background:var(--accent,#7aa2ff)` }));
    return h('a', {
      href: it.url, target: '_blank', rel: 'noopener',
      style: 'display:flex;gap:10px;align-items:flex-start;padding:6px;border-radius:10px;text-decoration:none;color:inherit',
      onmouseenter: (e: Event) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.05)'; },
      onmouseleave: (e: Event) => { (e.currentTarget as HTMLElement).style.background = ''; },
    },
      h('span', { style: 'position:relative;flex:none;line-height:0' }, cover, prog),
      h('span', { style: 'display:flex;flex-direction:column;gap:4px;min-width:0' },
        h('b', { style: 'font-size:13px;font-weight:500;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden' }, it.title),
        h('small', { style: 'opacity:.6;font-size:11px' }, [it.author, it.viewAt ? fmtAgo(it.viewAt) : ''].filter(Boolean).join(' · '))));
  }

  async function load(): Promise<void> {
    if (loading || done) return;
    loading = true;
    more.textContent = '加载中…';
    try {
      const r = await historyList('all', cursor);
      cursor = r.cursor;
      if (!r.list.length && !body.children.length) {
        body.append(h('p', { style: 'opacity:.6;font-size:13px;padding:20px 4px' }, '还没有观看记录'));
      }
      for (const it of r.list) body.append(row(it));
      count.textContent = ` ${body.querySelectorAll('a').length}`;
      done = r.cursor === null;
      loaded = true;
      more.style.display = done ? 'none' : 'block';
      more.textContent = '加载更多';
    } catch {
      body.append(h('p', { style: 'opacity:.6;font-size:13px;padding:20px 4px' }, '没取到历史记录，登录 B 站后再试'));
      done = true;
      more.style.display = 'none';
    } finally {
      loading = false;
    }
  }

  more.onclick = () => { more.style.display = 'none'; void load(); };
  return { el, open, close };
}
