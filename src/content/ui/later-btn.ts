import { addWatchLater } from '../api/search';
import { h, icon, ICONS } from './dom';

/** 封面右上角「稍后再看」（#2：首页、空间、动态的视频封面都有），悬停出现；已加入后变成对勾 */
export function laterButton(bvid: string): HTMLElement {
  const b = h('button', { class: 'card-later', type: 'button', title: '稍后再看', 'aria-label': '加入稍后再看' }, icon(ICONS.later)) as HTMLButtonElement;
  b.addEventListener('click', async (e) => {
    e.preventDefault(); e.stopPropagation();
    if (b.dataset.state === 'ok' || b.dataset.state === 'busy') return;
    b.dataset.state = 'busy';
    const r = await addWatchLater(bvid).catch(() => ({ ok: false, msg: '没加上，稍后再试' }));
    b.dataset.state = r.ok ? 'ok' : '';
    b.title = r.msg;
    b.setAttribute('aria-label', r.msg);
    if (r.ok) b.replaceChildren(icon(ICONS.check));
    else { b.classList.add('err'); setTimeout(() => b.classList.remove('err'), 1600); }
  });
  return b;
}
