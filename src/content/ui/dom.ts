import { ICON_PATHS } from './icon-library';

type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

/**
 * 把扩展自带的静态标记（图标 SVG、固定结构）解析成节点。用 DOMParser 而不是 innerHTML：
 * 解析出的文档是惰性的（脚本不执行、资源不加载），再导入当前文档。不要把网络来的 HTML 传进来，
 * B 站接口返回的高亮片段走 highlight()。
 */
const parser = new DOMParser();
function nodes(markup: string, inSvg: boolean): Node[] {
  const doc = parser.parseFromString(inSvg ? `<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>` : markup, 'text/html');
  const host = inSvg ? doc.body.firstElementChild! : doc.body;
  return [...host.childNodes].map((n) => document.importNode(n, true));
}
/** 用静态标记替换 el 的全部子节点；el 是 SVG 元素（defs / filter / svg）时按 SVG 解析 */
export function setMarkup(el: Element, markup: string): void {
  el.replaceChildren(...nodes(markup, el instanceof SVGElement));
}
/** 在 el 末尾追加静态标记 */
export function appendMarkup(el: Element, markup: string): void {
  el.append(...nodes(markup, el instanceof SVGElement));
}
/**
 * B 站搜索联想返回带 <em class="suggest_high_light"> 的 HTML。只保留高亮，其余一律当纯文本：
 * 拆成文本节点和 <mark>，不把接口内容当 HTML 插入。
 */
export function highlight(el: Element, html: string): void {
  const text = (s: string) => parser.parseFromString(s.replace(/<[^>]*>/g, ''), 'text/html').body.textContent ?? '';
  const out: Node[] = [];
  html.split(/(<em class="suggest_high_light">[\s\S]*?<\/em>)/).forEach((part, i) => {
    if (!part) return;
    if (i % 2) { const m = document.createElement('mark'); m.textContent = text(part); out.push(m); }
    else out.push(document.createTextNode(text(part)));
  });
  el.replaceChildren(...out);
}

export function svg(markup: string): Node {
  return nodes(markup.trim(), false)[0];
}

// 同一个图标只解析一次，之后克隆（v0.44：首页每张卡片都要建几个图标，DOMParser 很贵）
const iconCache = new Map<string, Node>();
export const icon = (paths: string) => {
  let t = iconCache.get(paths);
  if (!t) { t = svg(`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${paths.includes('data-iconmcp') ? ' data-icon-source="IconMCP"' : ''}>${paths}</svg>`); iconCache.set(paths, t); }
  return t.cloneNode(true);
};

export const ICONS = {
  logo: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M8 5v14M16 5v14M3 12h18"/>',
  ...ICON_PATHS,
};

export function fmtCount(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1).replace(/\.0$/, '')}亿`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1).replace(/\.0$/, '')}万`;
  return String(n);
}

export function fmtDuration(s: number): string {
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${mm}:${p(ss)}`;
}

/**
 * 绝对发布时间，形如 `2026-11-03 20:41:05`。B 站各接口给的 pubdate 都是秒级时间戳，
 * 所以精确到秒；没有时间就返回空串，由调用方决定不渲染。
 */
export function fmtDateTime(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function fmtAgo(ts: number): string {
  if (!ts) return '';
  const d = Date.now() / 1000 - ts;
  if (d < 3600) return `${Math.max(1, Math.floor(d / 60))} 分钟前`;
  if (d < 86400) return `${Math.floor(d / 3600)} 小时前`;
  if (d < 86400 * 30) return `${Math.floor(d / 86400)} 天前`;
  const t = new Date(ts * 1000);
  return `${t.getFullYear() === new Date().getFullYear() ? '' : `${t.getFullYear()}-`}${t.getMonth() + 1}-${t.getDate()}`;
}

/** 按自然日分组的标签：今天 / 昨天 / 本周/ 更早（或具体日期） */
export function dayBucket(ts: number, exact = false): string {
  if (!ts) return '更早';
  const day = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const diff = Math.round((day(Date.now()) - day(ts * 1000)) / 86400000);
  if (diff <= 0) return '今天';
  if (diff === 1) return '昨天';
  if (exact) { const t = new Date(ts * 1000); return `${t.getMonth() + 1} 月 ${t.getDate()} 日`; }
  return diff < 7 ? '本周' : '更早';
}

/**
 * 在映间 Shadow DOM 里的输入框打字时，不让按键冒泡到 B 站页面（v0.50，B 站评论反馈：
 * 播放页搜索按空格会播放视频）。B 站播放器在 document 上听快捷键，只看 event.target，
 * 而 shadow 里的输入框对外 target 是宿主 div，它就当成没在打字。宿主上拦住冒泡即可，
 * 不影响输入框自己的处理（Enter / 方向键）和我们在 window 捕获阶段的 Ctrl+K。
 */
export function guardTyping(host: HTMLElement): void {
  const stop = (e: Event) => {
    const t = e.composedPath()[0];
    const typing = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable);
    if (typing && !(e as KeyboardEvent).ctrlKey && !(e as KeyboardEvent).metaKey) e.stopPropagation();
  };
  for (const ty of ['keydown', 'keyup', 'keypress']) host.addEventListener(ty, stop);
}
