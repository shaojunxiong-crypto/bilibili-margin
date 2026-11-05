import { createFolder, deleteFolder, folderVideos, folders, type Folder } from '../api/fav';
import { videoCard, skeleton, cardData } from './card';
import { h, icon, ICONS } from './dom';
import { glassFolder, type GFFile, type GlassFolderApi } from './glass-folder';
import type { ArtPreset } from './folder-art';
import type { Video } from '../api/feed';
import { createSheet, type Sheet } from './sheet';
import type { FilterRuntime } from '../filter-runtime';
import { targetOfVideo } from '../filter-targets';
import { openBili } from '../navigation';
import { loadSettings,onSettingsChange } from '../../shared/settings';

/** 收藏夹抽屉：玻璃文件夹 → 视频网格（无限加载） */
export function createFavorites(onRender: (grid: HTMLElement) => void, direct: () => boolean = () => true, filter?: FilterRuntime): Sheet {
  let loaded = false;
  const shelf = h('div', { class: 'shelf' });
  const grid = h('div', { class: 'grid fav-grid' });
  const status = h('div', { class: 'status' });
  const sentinel = h('div', { class: 'sentinel' });
  const crumb = h('div', { class: 'crumb' });
  let current: Folder | null = null;
  let page = 1;
  let more = false;
  let busy = false;
  let gen = 0;
  let folderList: Folder[] = [];

  const sheet = createSheet({ title: '收藏夹', eyebrow: 'Favorites', width: 820, onOpen: () => { if (!loaded) init(); } });
  sheet.body.classList.add('fav-body');
  sheet.body.append(shelf, crumb, grid, status, sentinel);
  const setColumns = (columns:number) => shelf.style.setProperty('--fav-cols',String(columns));
  loadSettings().then((s) => setColumns(s.favColumns)).catch(() => {});
  onSettingsChange((next,prev) => { if (next.favColumns !== prev.favColumns) setColumns(next.favColumns); });
  onRender(grid);

  async function init() {
    loaded = true;
    shelf.replaceChildren(...Array.from({ length: 4 }, () => h('div', { class: 'gf-sk sk' })));
    try {
      const list = await folders();
      if (!list) {
        shelf.replaceChildren(h('div', { class: 'empty' }, h('p', {}, '登录后才能看到你的收藏夹'), h('a', { class: 'user', href: 'https://passport.bilibili.com/login', target: '_blank', rel: 'noopener' }, '去登录')));
        return;
      }
      folderList = list;
      shelf.replaceChildren(...list.map((f, i) => folderCard(f, i)), newTile());
      if (list[0]) open(list[0]);
    } catch (e) {
      loaded = false;
      shelf.replaceChildren(h('div', { class: 'empty' }, h('p', {}, `加载失败：${(e as Error).message}`)));
    }
  }

  const ARTS: ArtPreset[] = ['aurora', 'ember', 'dusk', 'glacier', 'verdant'];
  const firstPage = new Map<number, Promise<{ list: Video[]; more: boolean }>>();
  const page1 = (id: number) => { let p = firstPage.get(id); if (!p) { p = folderVideos(id, 1); p.catch(() => firstPage.delete(id)); firstPage.set(id, p); } return p; };
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  // 文件夹预览的原始数据：屏蔽词变化时只重算扇形文件，不重新请求
  const previews = new Map<number, { gf: GlassFolderApi; raw: Video[] }>();
  const paintPreview = (id: number) => {
    const entry = previews.get(id);
    if (!entry) return;
    const paint = () => {
      const visible = filter ? entry.raw.filter((v) => filter.allows(targetOfVideo(v))) : entry.raw;
      const files: GFFile[] = visible.slice(0, 4).reverse().map((v) => ({
        name: v.title, meta: v.duration ? mmss(v.duration) : undefined,
        image: v.cover ? `${v.cover}@544w_368h_1c.webp` : undefined, art: v.cover ? undefined : ARTS[v.mid % ARTS.length],
        href: `https://www.bilibili.com/video/${v.bvid}`,
      }));
      entry.gf.setFiles(files);
    };
    // 关键词也要能命中视频标签：先预热标签（没有关键词时立即返回）
    if (filter) void filter.prepare(entry.raw.map((v) => v.bvid)).then(paint);
    else paint();
  };

  /** 玻璃文件夹（按 21st「Glass Folder Cards」源码原生移植）：
   *  后板是收藏夹封面（没有封面就生成液态纹理），口袋里是最近收藏的 4 个视频，
   *  点开后视频扇形升起、可直接点进去；··· 菜单里是查看全部 / 在 B 站打开 */
  function folderCard(f: Folder, i: number): HTMLElement {
    const gf = glassFolder({
      label: f.title,
      meta: `${f.count} 个视频`,
      image: f.cover ? `${f.cover}@728w_592h_1c.webp` : undefined,
      art: ARTS[f.id % ARTS.length],
      seed: f.id % 997,
      width: 236,
      appearDelay: i * 140,
      onOpenChange: (o) => { if (o) open(f); },
      direct,
      onDirect: () => { open(f); requestAnimationFrame(() => crumb.scrollIntoView({ behavior: 'smooth', block: 'start' })); },
      menu: [
        { label: '查看全部视频', onSelect: () => { open(f); crumb.scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
        { label: '在 B 站打开', onSelect: () => openBili(`https://space.bilibili.com/${f.mid}/favlist?fid=${f.id}`) },
        ...(f.isDefault ? [] : [{ label: '删除收藏夹', danger: true, onSelect: () => remove(f) }]),
      ],
    });
    gf.el.dataset.id = String(f.id);
    previews.set(f.id, { gf, raw: [] });
    page1(f.id).then((r) => {
      const entry = previews.get(f.id);
      if (!entry) return;
      entry.raw = r.list;
      paintPreview(f.id);
    }).catch(() => {});
    return gf.el;
  }

  /** 末尾的「新建收藏夹」卡：点开变成表单，标题 + 公开/私密 */
  function newTile(): HTMLElement {
    const tile = h('div', { class: 'fav-new' });
    const idle = () => {
      tile.removeAttribute('data-form');
      tile.replaceChildren(h('button', { class: 'fav-new-btn', type: 'button', onclick: form }, h('span', { class: 'fav-new-plus' }, icon(ICONS.folder)), h('b', {}, '新建收藏夹'), h('small', {}, '最多 20 个字')));
    };
    const form = () => {
      tile.setAttribute('data-form', '');
      const input = h('input', { class: 'fav-new-input', type: 'text', maxlength: '20', placeholder: '收藏夹名称', 'aria-label': '收藏夹名称', autocomplete: 'off' }) as HTMLInputElement;
      const priv = h('input', { type: 'checkbox' }) as HTMLInputElement;
      const count = h('small', { class: 'fav-new-count' }, '0/20');
      const err = h('p', { class: 'fav-new-err', role: 'alert' });
      const submit = h('button', { class: 'fav-new-ok', type: 'submit', disabled: '' }, '创建') as HTMLButtonElement;
      input.addEventListener('input', () => { const n = [...input.value].length; count.textContent = `${n}/20`; submit.disabled = !input.value.trim(); err.textContent = ''; });
      input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') idle(); });
      const el = h('form', { class: 'fav-new-form', onsubmit: async (e: Event) => {
        e.preventDefault();
        const title = input.value.trim();
        if (!title) return;
        if (folderList.some((f) => f.title === title)) { err.textContent = '已经有同名的收藏夹了'; return; }
        submit.disabled = true; submit.textContent = '创建中…';
        try {
          const f = await createFolder(title, priv.checked);
          folderList.push(f);
          tile.before(folderCard(f, 0));
          idle();
          open(f);
        } catch (x) {
          err.textContent = `创建失败：${(x as Error).message}`;
          submit.disabled = false; submit.textContent = '创建';
        }
      } },
        h('div', { class: 'fav-new-head' }, h('b', {}, '新建收藏夹'), count),
        input,
        h('label', { class: 'fav-new-priv' }, priv, h('span', {}, '设为私密'), h('small', {}, '只有自己能看到')),
        err,
        h('div', { class: 'fav-new-acts' }, h('button', { class: 'fav-new-cancel', type: 'button', onclick: idle }, '取消'), submit));
      tile.replaceChildren(el);
      input.focus();
    };
    idle();
    return tile;
  }

  async function remove(f: Folder) {
    if (!confirm(`删除收藏夹「${f.title}」？\n里面的 ${f.count} 个收藏会一起删除，无法恢复。`)) return;
    try {
      await deleteFolder(f.id);
    } catch (x) {
      alert(`删除失败：${(x as Error).message}`);
      return;
    }
    folderList = folderList.filter((x) => x.id !== f.id);
    firstPage.delete(f.id);
    previews.delete(f.id);
    shelf.querySelector<HTMLElement>(`.gf-root[data-id="${f.id}"]`)?.remove();
    if (current?.id === f.id) { current = null; if (folderList[0]) open(folderList[0]); else { crumb.replaceChildren(); grid.replaceChildren(); status.replaceChildren(); } }
  }

  function open(f: Folder) {
    if (current?.id === f.id && grid.children.length) return;
    current = f;
    gen++;
    page = 1;
    more = true;
    busy = false;
    shelf.querySelectorAll<HTMLElement>('.gf-root').forEach((el) => el.toggleAttribute('data-current', el.dataset.id === String(f.id)));
    crumb.replaceChildren(h('span', {}, f.title), h('small', {}, `${f.count} 个视频`));
    grid.replaceChildren();
    status.replaceChildren();
    sheet.body.scrollTo({ top: 0 });
    load();
  }

  async function load() {
    if (!current || busy || !more) return;
    busy = true;
    const g = gen;
    const sk = [...skeleton(page === 1 ? 6 : 3).childNodes];
    grid.append(...sk);
    try {
      const r = await (page === 1 ? page1(current.id) : folderVideos(current.id, page)); page++;
      if (g !== gen) return;
      await filter?.prepare(r.list.map((v) => v.bvid));
      if (g !== gen) return;
      sk.forEach((n) => (n as Element).remove());
      const start = grid.children.length;
      r.list.forEach((v, i) => {
        const card = videoCard(v, start + i, { compact: true });
        card.toggleAttribute('data-margin-filtered', filter ? !filter.allows(targetOfVideo(v)) : false);
        grid.append(card);
      });
      more = r.more;
      if (!more) status.replaceChildren(h('span', {}, grid.children.length ? '到底了' : '这个收藏夹是空的'));
    } catch (e) {
      if (g !== gen) return;
      sk.forEach((n) => (n as Element).remove());
      status.replaceChildren(h('span', {}, `加载失败：${(e as Error).message}`));
    } finally {
      if (g === gen) busy = false;
    }
  }

  new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) load(); }, { root: sheet.body, rootMargin: '600px 0px' }).observe(sentinel);
  filter?.onChange(() => {
    const f = filter;
    if (!f) return;
    const vids = [...grid.querySelectorAll<HTMLElement>('.card')].map((card) => cardData.get(card)?.bvid);
    void f.prepare(vids).then(() => {
      grid.querySelectorAll<HTMLElement>('.card').forEach((card) => {
        const v = cardData.get(card);
        if (v) card.toggleAttribute('data-margin-filtered', !f.allows(targetOfVideo(v)));
      });
      for (const id of previews.keys()) paintPreview(id);
    });
  });
  // 顶栏「收藏夹」弹窗里的「全部收藏」：本页有收藏夹面板就直接打开，不再新开标签页
  addEventListener('margin:open-fav', (e) => { e.preventDefault(); sheet.open(); });
  return sheet;
}
