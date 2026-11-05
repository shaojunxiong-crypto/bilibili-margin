import { every } from '../sched';
import { loadSettings, onSettingsChange } from '../../shared/settings';
// B 站原生评论（bili-comments，lit 组件，多层 open shadow root）外层 CSS 进不去：
// 找到关键组件后往它们的 shadowRoot 里追加一张样式表，变量从 html 继承（--m-*）。
const TAG_SKIN = `
  :host-context(html[data-margin-theme="light"]) .tag {
    color: #757575 !important;
    background-color: #f4f4f4 !important;
  }
  :host-context(html[data-margin-theme="dark"]) .tag {
    color: #939393 !important;
    background-color: #1e1e1e !important;
  }
`;

const SKINS: Record<string, string> = {
  'bili-comments-header-renderer': `
    #navbar { align-items: center !important; margin: 0 0 20px !important; padding-top: 0 !important; }
    #title { display: flex !important; align-items: baseline !important; gap: 8px !important; }
    #title h2 { margin: 0 !important; font: 400 24px/1.2 var(--m-serif, serif) !important; letter-spacing: .04em !important; color: var(--m-ink) !important; }
    #count { font: 400 13px/1 var(--m-mono, monospace) !important; color: var(--m-faint) !important; margin: 0 !important; }
    #sort-actions { display: inline-flex !important; align-items: center !important; gap: 2px !important; margin-left: 20px !important; padding: 3px !important; border-radius: 999px !important; background: var(--m-chip) !important; box-shadow: var(--ring) !important; }
    #sort-actions .sort-div { display: none !important; }
    #sort-actions bili-text-button { display: inline-flex; align-items: center; height: 28px; padding: 0 14px; border-radius: 999px; font-size: 13px; color: var(--m-muted); --bili-text-button-color: var(--m-muted); --bili-text-button-hover-color: var(--m-ink); cursor: pointer; transition: background .2s, color .2s, box-shadow .2s; }
    #sort-actions bili-text-button:hover { color: var(--m-ink); }
    #sort-actions.hot bili-text-button:first-of-type, #sort-actions:not(.hot) bili-text-button:last-of-type { background: var(--m-surface); color: var(--m-ink); --bili-text-button-color: var(--m-ink); box-shadow: var(--ring), var(--sh-xs); }
    #disabled-commentbox #edit { border: 0 !important; border-radius: 14px !important; background: var(--m-chip) !important; box-shadow: var(--ring) !important; color: var(--m-muted) !important; }
    #disabled-commentbox #edit button { border-radius: 999px !important; }
  `,
  'bili-comment-box': `
    #editor { background: var(--m-chip) !important; border: 0 !important; border-radius: 14px !important; box-shadow: var(--ring) !important; padding: 10px 14px !important; transition: box-shadow .2s, background .2s !important; }
    #editor:hover { background: color-mix(in srgb, var(--m-ink) 7%, transparent) !important; }
    #editor:focus-within, #editor.active { background: var(--m-surface) !important; box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--m-accent) 55%, transparent), var(--sh-xs) !important; }
    #footer .tool-btn { border-radius: 8px !important; }
    #pub button { border-radius: 999px !important; padding: 0 18px !important; }
  `,
  'bili-comment-rich-textarea': `
    #input, .brt-root, .brt-editor { background: transparent !important; color: var(--m-ink) !important; font-size:var(--margin-cfs,14px)!important;line-height:1.6!important; }
    .brt-placeholder, [data-placeholder]::before { color: var(--m-faint) !important; }
  `,
};

const done = new WeakSet<ShadowRoot>();
const watched = new WeakSet<ShadowRoot>();
let extra: Record<string, string> = {};
const sheets = new Map<string, CSSStyleSheet>();

function skin(root: ParentNode, depth = 0): void {
  if (depth > 6) return;
  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    const sr = el.shadowRoot;
    if (!sr) continue;
    const tag = el.tagName.toLowerCase();
    if (tag === 'bili-comment-replies-renderer') watchReplies(sr);
    // tag 位于每条评论自己的嵌套 Shadow DOM；主题规则需要注入到包含它的那一层。
    const css = (SKINS[tag] ?? '') + TAG_SKIN + (extra[tag] ?? '');
    if (!done.has(sr)) {
      let s = sheets.get(tag);
      if (!s) { s = new CSSStyleSheet(); s.replaceSync(css); sheets.set(tag, s); }
      sr.adoptedStyleSheets = [...sr.adoptedStyleSheets, s];
      done.add(sr);
    }
    // 评论项也是 Web Component，继续遍历所有 open shadow root，直到找到 tag 所在层级。
    if (!watched.has(sr)) {
      watched.add(sr);
      // 评论是异步、分批插入的；监听当前 root，避免等下一轮 1 秒补扫才显示正确主题。
      new MutationObserver(() => skin(sr, depth + 1)).observe(sr, { childList: true, subtree: true });
    }
    skin(sr, depth + 1);
  }
}

/** extra：按页面追加到某个组件皮肤后面的样式（详情页隐藏评论区重复的大标题） */
export function skinComments(more: Record<string, string> = {}): void {
  enterToSend();
  extra = more;
  loadSettings().then((st) => { treeOn = st.replyTree; run(); }).catch(() => {});
  onSettingsChange((st) => { if (st.replyTree !== treeOn) { treeOn = st.replyTree; retreeAll(); } });
  const containers = new WeakSet<Element>();
  let updateFrame = 0;
  const run = () => {
    const bc = document.querySelector('bili-comments');
    if (bc) { skin(bc.parentElement ?? document); tree(bc); }
    treeOld();
    const container = document.querySelector('#commentapp, .comment-container');
    if (container && !containers.has(container)) {
      containers.add(container);
      new MutationObserver(() => {
        if (!updateFrame) updateFrame = requestAnimationFrame(() => { updateFrame = 0; run(); });
      }).observe(container, { childList: true, subtree: true });
    }
  };
  // 前 90 秒每秒补一次（评论区是懒加载的 Web Components）；页面隐藏时暂停
  let n = 0;
  const stop = every(1000, () => { run(); if (++n > 90) stop(); });
  let pending = 0;
  addEventListener('scroll', () => { if (pending) return; pending = window.setTimeout(() => { pending = 0; run(); }, 400); }, { passive: true });
}

/**
 * 楼中楼对话树（v0.49，B 站评论建议，参考 BewlyCat 的回复美化；样式参考 21st klyv-ui Comment Thread：
 * 限深缩进 + 细引导线）。B 站展开后的楼中楼是按时间平铺的，每条 reply 的 data.parent 指向它回复的那条。
 * 不移动 DOM（lit 管着这些节点，挪了会乱）：容器改成 flex 列，用 CSS order 按深度优先排，
 * data-m-depth 控制缩进（最多 3 层），父评论不在当前页时按时间留在原位。
 */
let treeOn = true;
const TREE_CSS = `
  #expander-contents[hidden], #expander-contents[data-margin-replies-collapsed] { display: none !important; }
  #expander-contents { display: flex !important; flex-direction: column !important; }
  #expander-contents > #expander-footer { order: 99999 !important; }
  bili-comment-reply-renderer[data-m-depth] { --m-tl: color-mix(in srgb, var(--m-ink, #888) 18%, transparent); }
  bili-comment-reply-renderer[data-m-depth="1"] { margin-left: 4px; padding-left: 24px; background: linear-gradient(var(--m-tl), var(--m-tl)) 0 0 / 1px 100% no-repeat; }
  bili-comment-reply-renderer[data-m-depth="2"] { margin-left: 4px; padding-left: 52px; background: linear-gradient(var(--m-tl), var(--m-tl)) 0 0 / 1px 100% no-repeat, linear-gradient(var(--m-tl), var(--m-tl)) 28px 0 / 1px 100% no-repeat; }
  bili-comment-reply-renderer[data-m-depth="3"] { margin-left: 4px; padding-left: 80px; background: linear-gradient(var(--m-tl), var(--m-tl)) 0 0 / 1px 100% no-repeat, linear-gradient(var(--m-tl), var(--m-tl)) 28px 0 / 1px 100% no-repeat, linear-gradient(var(--m-tl), var(--m-tl)) 56px 0 / 1px 100% no-repeat; }
`;
let treeSheet: CSSStyleSheet | null = null;
const treeRoots = new Set<ShadowRoot>();
const treeSeen = new WeakSet<ShadowRoot>();
const retry = new WeakMap<ShadowRoot, number>();

function layout(sr: ShadowRoot): void {
  const reps = [...sr.querySelectorAll<HTMLElement & { data?: any }>('#expander-contents > bili-comment-reply-renderer')];
  if (!treeOn || reps.length < 2) {
    for (const r of reps) { r.style.removeProperty('order'); delete r.dataset.mDepth; }
    return;
  }
  // 内容脚本在隔离世界里拿不到 lit 的 .data，只能读 DOM：作者名 + 正文开头的「回复 @某人 :」。
  // 父评论 = 在它之前、作者是「某人」的最近一条；没有前缀的是直接回复楼主（第 0 层）。
  const info = reps.map((r) => {
    const rs = r.shadowRoot;
    const ui = rs?.querySelector('bili-comment-user-info')?.shadowRoot;
    const name = (ui?.querySelector('#user-name')?.textContent ?? '').trim();
    const text = (rs?.querySelector('bili-rich-text')?.shadowRoot?.querySelector('#contents')?.textContent ?? '').trim();
    return { name, to: /^回复\s*@(.+?)\s*[:：]/.exec(text)?.[1]?.trim() ?? '' , ok: !!name && !!text };
  });
  if (info.some((x) => !x.ok)) {
    const t = (retry.get(sr) ?? 0) + 1;
    retry.set(sr, t);
    if (t <= 20) setTimeout(() => layout(sr), 150);
    return;
  }
  retry.delete(sr);
  nest(reps, info);
}

/** 按「回复 @名」把平铺的回复排成深度优先：CSS order + data-m-depth（最多 3 层），不动 DOM */
function nest(reps: HTMLElement[], info: { name: string; to: string }[]): void {
  const kids = new Map<number, number[]>();
  const tops: number[] = [];
  info.forEach((x, i) => {
    let p = -1;
    if (x.to) for (let j = i - 1; j >= 0; j--) if (info[j].name === x.to) { p = j; break; }
    if (p < 0) tops.push(i); else { const k = kids.get(p) ?? []; k.push(i); kids.set(p, k); }
  });
  let n = 0;
  const walk = (i: number, d: number) => {
    const r = reps[i];
    r.style.order = String(n++);
    if (d) r.dataset.mDepth = String(Math.min(d, 3)); else delete r.dataset.mDepth;
    for (const k of kids.get(i) ?? []) walk(k, d + 1);
  };
  for (const t of tops) walk(t, 0);
}

/**
 * 旧版评论区（v0.50）：B 站仍给一部分账号下发非 Web Components 的老评论（.reply-item / .sub-reply-list），
 * v0.49 的对话树只认 bili-comments，这些用户开了也没效果。老评论在普通 DOM 里，直接按同样规则排。
 */
const OLD_CSS = `
  .sub-reply-list[hidden], .sub-reply-list[data-margin-replies-collapsed], .sub-reply-list.m-tree[data-margin-replies-collapsed] { display: none !important; }
  .sub-reply-list.m-tree { display: flex !important; flex-direction: column !important; }
  .sub-reply-list.m-tree > :not(.sub-reply-item) { order: 99999 !important; }
  .sub-reply-item[data-m-depth] { --m-tl: color-mix(in srgb, var(--m-ink, #888) 18%, transparent); background-repeat: no-repeat !important; }
  .sub-reply-item[data-m-depth="1"] { margin-left: 4px !important; padding-left: 24px !important; background-image: linear-gradient(var(--m-tl), var(--m-tl)) !important; background-position: 0 0 !important; background-size: 1px 100% !important; }
  .sub-reply-item[data-m-depth="2"] { margin-left: 4px !important; padding-left: 52px !important; background-image: linear-gradient(var(--m-tl), var(--m-tl)), linear-gradient(var(--m-tl), var(--m-tl)) !important; background-position: 0 0, 28px 0 !important; background-size: 1px 100%, 1px 100% !important; }
  .sub-reply-item[data-m-depth="3"] { margin-left: 4px !important; padding-left: 80px !important; background-image: linear-gradient(var(--m-tl), var(--m-tl)), linear-gradient(var(--m-tl), var(--m-tl)), linear-gradient(var(--m-tl), var(--m-tl)) !important; background-position: 0 0, 28px 0, 56px 0 !important; background-size: 1px 100%, 1px 100%, 1px 100% !important; }
`;
const oldSeen = new WeakSet<Element>();
function treeOld(): void {
  const lists = document.querySelectorAll<HTMLElement>('.sub-reply-list');
  if (!lists.length) return;
  if (!document.getElementById('m-tree-old')) { const st = document.createElement('style'); st.id = 'm-tree-old'; st.textContent = OLD_CSS; document.head.append(st); }
  for (const l of lists) {
    if (oldSeen.has(l)) continue;
    oldSeen.add(l);
    treeLists.add(l);
    let raf = 0;
    const kick = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; layoutOld(l); replyCollapse(l); }); };
    new MutationObserver(kick).observe(l, { childList: true });
    kick();
  }
}
const treeLists = new Set<HTMLElement>();
function layoutOld(l: HTMLElement): void {
  const reps = [...l.querySelectorAll<HTMLElement>(':scope > .sub-reply-item')];
  if (!treeOn || reps.length < 2) {
    l.classList.remove('m-tree');
    for (const r of reps) { r.style.removeProperty('order'); delete r.dataset.mDepth; }
    return;
  }
  l.classList.add('m-tree');
  nest(reps, reps.map((r) => {
    const name = (r.querySelector('.sub-user-name')?.textContent ?? '').trim();
    const text = (r.querySelector('.reply-content')?.textContent ?? '').trim();
    return { name, to: /^回复\s*@(.+?)\s*[:：]/.exec(text)?.[1]?.trim() ?? '' };
  }));
}

function tree(bc: Element): void {
  const root = bc.shadowRoot;
  if (!root) return;
  for (const t of root.querySelectorAll('bili-comment-thread-renderer')) {
    const sr = t.shadowRoot?.querySelector('bili-comment-replies-renderer')?.shadowRoot;
    if (sr) watchReplies(sr);
  }
}

function watchReplies(sr: ShadowRoot): void {
  if (treeSeen.has(sr)) return;
  treeSeen.add(sr); treeRoots.add(sr);
  if (!treeSheet) { treeSheet = new CSSStyleSheet(); treeSheet.replaceSync(TREE_CSS); }
  sr.adoptedStyleSheets = [...sr.adoptedStyleSheets, treeSheet];
  let raf = 0;
  const kick = () => { if (!raf) raf = requestAnimationFrame(() => {
    raf = 0; layout(sr);
    const contents = sr.querySelector<HTMLElement>('#expander-contents');
    if (contents) replyCollapse(contents);
  }); };
  new MutationObserver(kick).observe(sr, { childList: true, subtree: true });
  kick();
}

const replyControls = new WeakMap<HTMLElement, HTMLButtonElement>();
/** 只折叠现有 DOM，保留原生分页、输入框和 lit 的节点归属。 */
function replyCollapse(list: HTMLElement): void {
  let button = replyControls.get(list);
  const hasReplies = !!list.querySelector('bili-comment-reply-renderer, .sub-reply-item');
  if (!hasReplies) { if (button) { button.hidden = true; button.style.display = 'none'; } return; }
  if (!button) {
    button = document.createElement('button');
    button.type = 'button'; button.className = 'margin-replies-toggle';
    button.style.cssText = 'display:block;position:sticky;top:80px;z-index:2;margin:8px 0;padding:6px 12px;border:0;border-radius:999px;'
      + 'background:var(--m-surface,#fff);color:var(--m-muted,#666);font:500 12px/1.5 var(--m-sans,system-ui);cursor:pointer;scroll-margin-top:88px';
    button.textContent = '收起回复'; button.setAttribute('aria-expanded', 'true');
    button.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const collapsed = list.toggleAttribute('data-margin-replies-collapsed');
      button!.textContent = collapsed ? '展开回复' : '收起回复';
      button!.setAttribute('aria-expanded', String(!collapsed));
      button!.scrollIntoView({ block: 'nearest' });
    });
    replyControls.set(list, button);
  }
  if (button.nextElementSibling !== list) list.before(button);
  // 原生尚未展开时不显示扩展按钮；我们自己折叠后仍保留重开入口。
  const visible = list.hasAttribute('data-margin-replies-collapsed') || getComputedStyle(list).display !== 'none';
  button.style.display = visible ? 'block' : 'none';
  button.hidden = !visible;
}

function retreeAll(): void {
  for (const sr of treeRoots) { if (sr.host.isConnected) layout(sr); else treeRoots.delete(sr); }
  for (const l of treeLists) { if (l.isConnected) layoutOld(l); else treeLists.delete(l); }
}

/**
 * 回车直接发评论（v0.47.4，用户要求）：B 站原生评论框里回车只换行，要点「发布」。
 * 改成：回车发送，Shift+回车换行；输入法选字中（isComposing / keyCode 229）、正在打 @ 某人时不发送，交给原生处理。
 * 评论框在多层 shadow root 里，用 composedPath 找到所在的 bili-comment-box，再点它自己的发布按钮。
 */
let enterHooked = false;
export function enterToSend(): void {
  if (enterHooked) return;
  enterHooked = true;
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.keyCode === 229) return;
    const path = e.composedPath();
    const editable = path.find((n): n is HTMLElement => n instanceof HTMLElement && (n.isContentEditable || n.tagName === 'TEXTAREA'));
    if (!editable) return;
    const box = path.find((n): n is HTMLElement => n instanceof HTMLElement && n.tagName === 'BILI-COMMENT-BOX');
    if (!box?.shadowRoot) return;
    const text = (editable as HTMLTextAreaElement).value ?? editable.innerText ?? '';
    if (!text.trim()) return;
    // 正在输入 @用户名：回车留给原生的候选列表
    const sel = (editable.getRootNode() as ShadowRoot & { getSelection?: () => Selection | null }).getSelection?.() ?? getSelection();
    const before = sel && sel.anchorNode ? (sel.anchorNode.textContent ?? '').slice(0, sel.anchorOffset) : '';
    if (/@[^\s@]{0,20}$/.test(before)) return;
    const btn = box.shadowRoot.querySelector<HTMLElement>('#pub button') ?? box.shadowRoot.querySelector<HTMLElement>('#pub');
    if (!btn || btn.hasAttribute('disabled')) return;
    e.preventDefault();
    e.stopPropagation();
    btn.click();
  }, true);
}
