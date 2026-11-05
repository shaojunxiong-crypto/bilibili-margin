import { addWatchLater } from '../api/search';
import type { Video } from '../api/feed';
import { cardData } from './card';
import type { ContextMenu, MenuEntry } from './context-menu';
import { toast } from './controls';
import { ICONS } from './dom';
import { openBili } from '../navigation';

/** 视频卡片右键菜单：新标签打开、稍后再看、复制链接 / BV 号、UP 主空间、屏蔽 UP */
export function bindCardMenu(container: HTMLElement, cm: ContextMenu, toastRoot: () => HTMLElement, opts: { onBlock?: (v: Video) => void; onLater?: () => void; onDislike?: (v: Video, card: HTMLElement) => void } = {}): void {
  container.addEventListener('contextmenu', (e) => {
    if (e.shiftKey) return;
    const card = (e.target as Element).closest('.card');
    const v = card && cardData.get(card);
    if (!v) return;
    e.preventDefault();
    const url = `https://www.bilibili.com/video/${v.bvid}`;
    const copy = (text: string, msg: string) => navigator.clipboard.writeText(text).then(() => toast(toastRoot(), msg), () => toast(toastRoot(), '复制失败'));
    const items: MenuEntry[] = [
      { label: '新标签页打开', icon: ICONS.arrow, shortcut: '↵', run: () => window.open(url, '_blank', 'noopener') },
      { label: '稍后再看', icon: ICONS.later, run: async () => { const r = await addWatchLater(v.bvid).catch(() => ({ ok: false, msg: '没加上，稍后再试' })); toast(toastRoot(), r.msg, r.ok && opts.onLater ? { label: '查看', run: opts.onLater } : undefined); } },
      'separator',
      { label: '复制链接', icon: ICONS.link, run: () => copy(url, '链接已复制') },
      { label: '复制 BV 号', icon: ICONS.copy, run: () => copy(v.bvid, `${v.bvid} 已复制`) },
      { label: `打开「${v.author}」的空间`, icon: ICONS.user, run: () => openBili(`https://space.bilibili.com/${v.mid}`) },
    ];
    const neg: MenuEntry[] = [];
    if (opts.onDislike && v.trackId) neg.push({ label: '不感兴趣', icon: ICONS.close, run: () => opts.onDislike!(v, card as HTMLElement) });
    if (opts.onBlock) neg.push({ label: `不看「${v.author}」`, icon: ICONS.block, danger: true, run: () => opts.onBlock!(v) });
    if (neg.length) items.push('separator', ...neg);
    cm.show(e.clientX, e.clientY, items);
  });
}
