import { loadSettings, onSettingsChange } from '../../shared/settings';
import { openBili } from '../navigation';
import { forgetSearch, hotSearch, rememberSearch, searchHistory, searchUrl, suggest } from '../api/search';
import { h, highlight, icon, ICONS } from './dom';

/**
 * 命令面板：21st「Command Palette」（rafa-porto，Raycast 风格）的原生移植。
 * v0.10：改成两栏——左边只管搜索（联想 / 最近 / 热搜），右边一栏放命令；搜索框里不再混命令。
 * 弹簧缩放入场、↑↓ 选择、↵ 执行、Esc 关闭、按使用次数排序的命令历史。
 * 内容换成 B 站：搜索联想、最近搜索、bilibili 热搜，加上 MARGIN 自己的命令。
 */
export type Cat = '搜索' | '跳转' | '操作';
export interface Command { id: string; title: string; desc?: string; cat: Exclude<Cat, '搜索'>; icon: string; keys?: string[]; shortcut?: string; run: () => void }
interface Row { id: string; title: string; titleHtml?: string; desc?: string; cat: Cat; icon: string; shortcut?: string; run: () => void; remove?: () => void }

const USE_KEY = 'margin:cmd-usage';
const usage = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(USE_KEY) || '{}'); } catch { return {}; } };
const bump = (id: string) => { const u = usage(); u[id] = (u[id] ?? 0) + 1; localStorage.setItem(USE_KEY, JSON.stringify(u)); };
const strip = (s: string) => s.replace(/<[^>]+>/g, '');
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export interface Palette { el: HTMLElement; open: (q?: string) => void; close: () => void; isOpen: () => boolean }

export function createCommandPalette(commands: Command[]): Palette {
  const input = h('input', { type: 'text', placeholder: '搜索视频、UP 主', autocomplete: 'off', spellcheck: 'false', 'aria-label': '搜索', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'cp-list' }) as HTMLInputElement;
  const list = h('div', { class: 'cp-list', id: 'cp-list', role: 'listbox', 'aria-label': '搜索' });
  const side = h('div', { class: 'cp-side', role: 'listbox', 'aria-label': '命令' });
  const panel = h('div', { class: 'cp-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': '搜索与命令' },
    h('div', { class: 'cp-input' }, icon(ICONS.search), input, h('kbd', {}, 'Esc')),
    h('div', { class: 'cp-body' }, list, side),
    h('div', { class: 'cp-foot' },
      h('span', { class: 'cp-hint' }, h('kbd', {}, 'Ctrl'), h('i', {}, '+'), h('kbd', {}, 'K'), h('span', {}, '随时唤出')),
      h('span', { class: 'cp-hint' }, h('span', {}, '选择'), h('kbd', {}, '↑'), h('kbd', {}, '↓'), h('b', {}, '|'), h('span', {}, '切换搜索 / 命令'), h('kbd', {}, 'Tab'), h('b', {}, '|'), h('span', {}, '执行'), h('kbd', {}, '↵')),
    ),
  );
  const el = h('div', { class: 'cp', 'data-open': 'false', hidden: '' }, h('div', { class: 'cp-scrim' }), panel);

  // 左栏 = 搜索（联想 / 最近 / 热搜），右栏 = 命令；两栏各自一套选中，Tab 切换当前栏
  let pane: 'l' | 'r' = 'l';
  let rows: Row[] = [];
  let cmds: Row[] = [];
  let sel = 0;
  let csel = 0;
  let sugg: Row[] = [];
  let hot: Row[] = [];
  let ctrl: AbortController | null = null;
  let timer = 0;
  let lastFocus: Element | null = null;

  const go = (q: string) => { rememberSearch(q); openBili(searchUrl(q)); close(); };
  const searchRow = (q: string, kind: 'history' | 'hot' | 'sugg', html?: string, n?: number): Row => ({
    id: `${kind}:${q}`, title: q, titleHtml: html, cat: '搜索',
    icon: kind === 'history' ? ICONS.history : ICONS.search,
    desc: kind === 'hot' && n ? String(n) : undefined,
    run: () => go(q),
    remove: kind === 'history' ? () => { forgetSearch(q); render(); } : undefined,
  });
  const cmdRow = (c: Command): Row => ({ id: c.id, title: c.title, desc: c.desc, cat: c.cat, icon: c.icon, shortcut: c.shortcut, run: () => { bump(c.id); close(); c.run(); } });

  function searchSections(): [string, Row[]][] {
    const q = input.value.trim();
    const out: [string, Row[]][] = [];
    if (!q) {
      const hist = searchHistory().slice(0, 5).map((s) => searchRow(s, 'history'));
      if (hist.length) out.push(['最近搜索', hist]);
      if (hot.length) out.push(['bilibili 热搜', hot]);
    } else {
      out.push(['搜索', [
        { id: 'go', title: `搜索「${q}」`, cat: '搜索', icon: ICONS.search, shortcut: '↵', run: () => go(q) },
        ...sugg.filter((s) => s.title !== q),
      ]]);
    }
    return out.filter(([, r]) => r.length);
  }
  function cmdSections(): [string, Row[]][] {
    const lq = input.value.trim().toLowerCase();
    const u = usage();
    if (lq) {
      const hits = commands.filter((c) => [c.title, c.desc ?? '', ...(c.keys ?? [])].some((t) => t.toLowerCase().includes(lq))).map(cmdRow);
      if (hits.length) return [['匹配的命令', hits]];
    }
    const recent = commands.filter((c) => u[c.id]).sort((a, b) => u[b.id] - u[a.id]).slice(0, 3);
    const rest = commands.filter((c) => !recent.includes(c));
    const out: [string, Row[]][] = [];
    if (recent.length) out.push(['常用', recent.map(cmdRow)]);
    for (const k of ['跳转', '操作'] as const) {
      const r = rest.filter((c) => c.cat === k).map(cmdRow);
      if (r.length) out.push([k, r]);
    }
    return out;
  }

  function item(row: Row, idx: number, key: 'cp' | 'cc', compact: boolean): HTMLElement {
    const t = h('span', { class: 'cp-t' });
    if (row.titleHtml) highlight(t, row.titleHtml); else t.textContent = row.title;
    const p = key === 'cp' ? 'l' : 'r';
    return h('div', { class: 'cp-item', role: 'option', id: `${key}-${idx}`,
      onpointermove: () => { if (pane !== p || (p === 'l' ? sel : csel) !== idx) { pane = p; if (p === 'l') sel = idx; else csel = idx; mark(); } },
      onclick: () => row.run(),
    },
    row.desc && row.cat === '搜索' && /^\d+$/.test(row.desc) ? h('span', { class: 'cp-n', 'data-top': String(Number(row.desc) <= 3) }, row.desc) : h('span', { class: 'cp-ic' }, icon(row.icon)),
    t,
    !compact && row.desc && !/^\d+$/.test(row.desc) ? h('span', { class: 'cp-d' }, row.desc) : null,
    h('span', { class: 'cp-r' },
      row.shortcut ? h('kbd', {}, row.shortcut) : null,
      row.remove ? h('button', { type: 'button', class: 'cp-x', title: '删除这条记录', 'aria-label': '删除这条记录', onclick: (e: Event) => { e.stopPropagation(); row.remove!(); input.focus(); } }, icon(ICONS.close)) : null),
    );
  }
  const group = (title: string, n: number, kids: HTMLElement[]) => h('div', { class: 'cp-group' }, h('div', { class: 'cp-gt' }, h('span', {}, title), h('i', {}, String(n))), ...kids);

  function render(): void {
    const ls = searchSections();
    const rs = cmdSections();
    rows = ls.flatMap(([, r]) => r);
    cmds = rs.flatMap(([, r]) => r);
    sel = Math.min(sel, Math.max(0, rows.length - 1));
    csel = Math.min(csel, Math.max(0, cmds.length - 1));
    if (pane === 'l' && !rows.length && cmds.length) pane = 'r';
    if (pane === 'r' && !cmds.length && rows.length) pane = 'l';
    let i = 0;
    list.replaceChildren(...ls.map(([t, r]) => group(t, r.length, r.map((row) => item(row, i++, 'cp', false)))));
    if (!rows.length) list.append(h('div', { class: 'cp-empty' }, icon(ICONS.search), h('p', {}, '输入关键词搜索视频和 UP 主')));
    let j = 0;
    side.replaceChildren(...rs.map(([t, r]) => group(t, r.length, r.map((row) => item(row, j++, 'cc', true)))));
    if (!cmds.length) side.append(h('div', { class: 'cp-empty' }, h('p', {}, '没有匹配的命令')));
    mark();
  }
  function mark(): void {
    list.querySelectorAll<HTMLElement>('.cp-item').forEach((n, i) => n.setAttribute('aria-selected', String(pane === 'l' && i === sel)));
    side.querySelectorAll<HTMLElement>('.cp-item').forEach((n, i) => n.setAttribute('aria-selected', String(pane === 'r' && i === csel)));
    list.dataset.active = String(pane === 'l'); side.dataset.active = String(pane === 'r');
    const id = pane === 'l' ? `cp-${sel}` : `cc-${csel}`;
    input.setAttribute('aria-activedescendant', id);
    ((pane === 'l' ? list : side).querySelector(`#${id}`) as HTMLElement | null)?.scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('input', () => {
    sel = 0; csel = 0; pane = 'l'; sugg = []; render();
    clearTimeout(timer); ctrl?.abort();
    const q = input.value.trim();
    if (!q) return;
    timer = window.setTimeout(async () => {
      ctrl = new AbortController();
      try {
        const s = await suggest(q, ctrl.signal);
        if (input.value.trim() !== q) return;
        sugg = s.map((x) => searchRow(x.term, 'sugg', x.html)); render();
      } catch { /* 联想失败不影响搜索 */ }
    }, 120);
  });
  input.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    const n = pane === 'l' ? rows.length : cmds.length;
    const step = (d: number) => { if (!n) return; if (pane === 'l') sel = (sel + d + n) % n; else csel = (csel + d + n) % n; mark(); };
    if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); (pane === 'l' ? rows[sel] : cmds[csel])?.run(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') { e.preventDefault(); const to = pane === 'l' ? 'r' : 'l'; if ((to === 'l' ? rows : cmds).length) { pane = to; mark(); } }
  });
  el.querySelector('.cp-scrim')!.addEventListener('click', () => close());

  function open(q = ''): void {
    if (el.dataset.open === 'true') { input.focus(); return; }
    lastFocus = (el.getRootNode() as ShadowRoot).activeElement ?? document.activeElement;
    el.hidden = false;
    input.value = q; pane = 'l'; sel = 0; csel = 0; sugg = [];
    render();
    requestAnimationFrame(() => { el.dataset.open = 'true'; input.focus(); input.setSelectionRange(q.length, q.length); });
    if (q) input.dispatchEvent(new Event('input'));
    hotSearch().then((list2) => { hot = list2.map((x, n) => ({ ...searchRow(x.keyword, 'hot', esc(x.name), n + 1) })); if (el.dataset.open === 'true' && !input.value.trim()) render(); });
  }
  function close(): void {
    if (el.dataset.open !== 'true') return;
    el.dataset.open = 'false';
    ctrl?.abort();
    setTimeout(() => { if (el.dataset.open === 'false') el.hidden = true; }, 220);
    (lastFocus as HTMLElement | null)?.blur?.();
  }

  let cmdK = true;
  loadSettings().then((st) => { cmdK = st.cmdK; }).catch(() => {});
  onSettingsChange((n) => { cmdK = n.cmdK; });
  addEventListener('keydown', (e) => {
    if (cmdK && (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); el.dataset.open === 'true' ? close() : open(); return; }
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || el.dataset.open === 'true') return;
    const typing = e.composedPath().some((n) => n instanceof HTMLInputElement || n instanceof HTMLTextAreaElement || (n instanceof HTMLElement && n.isContentEditable));
    if (typing) return;
    e.preventDefault(); open();
  }, true);

  return { el, open, close, isOpen: () => el.dataset.open === 'true' };
}
void strip;
