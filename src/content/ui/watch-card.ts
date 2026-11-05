import { every } from '../sched';

/**
 * v0.41.0 播放页「一张卡片」（参考 21st Post Card，shadcnui-blocks card-06）：
 * 播放器 + 互动条 + 简介 + 标签合成一张表面卡片。B 站这些节点由 Vue 管理，不能挪进新容器，
 * 所以在 .left-container 里垫一块绝对定位的底板，按播放器顶到标签底的范围对齐；
 * 只在左栏尺寸变化时重算（ResizeObserver），宽屏 / 网页全屏 / 全屏时底板只从互动条开始或隐藏。
 * 同时在视频画面左上角放播放量 / 弹幕数胶囊，跟控制坞一起出现。
 */
const PAD = 0;

export function startWatchCard(): void {
  let card: HTMLElement | null = null;
  let host: HTMLElement | null = null;
  let ro: ResizeObserver | null = null;
  let startup: MutationObserver | null = null;
  let bindFrame = 0, startupTimer = 0;
  const watched = new WeakSet<Element>();

  const place = () => {
    if (!host || !card) return;
    const de = document.documentElement;
    const screen = document.querySelector('.bpx-player-container')?.getAttribute('data-screen') ?? 'normal';
    const ws = screen === 'web' && de.classList.contains('margin-webscroll');
    if ((screen === 'web' && !ws) || screen === 'full') { card.hidden = true; return; }
    const base = host.getBoundingClientRect();
    const pw = document.querySelector('#playerWrap');
    const tb = document.querySelector('.video-toolbar-container');
    const last = document.querySelector('.video-tag-container') ?? document.querySelector('.video-desc-container') ?? tb;
    if (!last) { card.hidden = true; return; }
    const wide = de.classList.contains('margin-wide');
    const startEl = !wide && !ws && pw && host.contains(pw) ? pw : tb;
    if (!startEl) { card.hidden = true; return; }
    const top = startEl.getBoundingClientRect().top - base.top - PAD;
    const bottom = last.getBoundingClientRect().bottom - base.top;
    card.hidden = false;
    card.className = startEl === pw ? 'm-wcard from-player' : 'm-wcard';
    card.style.top = `${Math.round(top)}px`;
    card.style.height = `${Math.max(0, Math.round(bottom - top))}px`;
    de.classList.toggle('margin-wcard', startEl === pw);
  };

  const stopStartup = () => {
    startup?.disconnect(); startup = null;
    cancelAnimationFrame(bindFrame); bindFrame = 0;
    clearTimeout(startupTimer);
    removeEventListener('pagehide', stopStartup);
  };

  const bind = () => {
    const lc = document.querySelector<HTMLElement>('.left-container');
    if (!lc) return;
    // v0.48 修复（评论区 K-aloy：打开视频开头 1 秒会播两遍）：B 站 SSR 页面水合前往 .left-container 里插节点，
    // Vue 会判定 DOM 不匹配、整页重新渲染，播放器被 checkBofqi 重建一次。水合完成时 Vue 会去掉 data-server-rendered，之后再插。
    if (document.querySelector('[data-server-rendered]')) return;
    stopStartup();
    // B 站是 SSR + 水合，按位置认领子节点：插在最前面会被当成标题区「认领」掉，所以放最后，并在被改写时重建
    if (card && !card.classList.contains('m-wcard')) { card = null; host = null; }
    if (host !== lc) {
      host = lc;
      card?.remove();
      card = document.createElement('div');
      card.className = 'm-wcard';
      card.setAttribute('aria-hidden', 'true');
      lc.append(card);
      ro?.disconnect();
      // ResizeObserver 在布局之后回调，这时读位置不会强制布局；不再绕一圈 rAF（v0.44）
      ro = new ResizeObserver(() => place());
    }
    if (card && !card.isConnected) lc.append(card);
    // 新挂上的元素 observe 时 ResizeObserver 会先回调一次，不用每 1.5 秒主动量一遍（那会在 B 站页面变化时强制布局）
    for (const sel of ['.left-container', '#playerWrap', '.video-toolbar-container', '.video-desc-container', '.video-tag-container']) {
      const el = document.querySelector(sel);
      if (el && !watched.has(el)) { watched.add(el); ro!.observe(el); }
    }
  };

  let q = 0;
  const soon = () => { if (!q) q = requestAnimationFrame(() => { q = 0; place(); }); };
  new MutationObserver(soon).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', soon, { passive: true });
  bind();
  // 首次挂载前按帧等待左栏与 SSR 水合；成功或 10 秒后停止全树观察，迟到页面由轮询兜底。
  if (!host) {
    startup = new MutationObserver(() => {
      if (!bindFrame) bindFrame = requestAnimationFrame(() => { bindFrame = 0; bind(); });
    });
    startup.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-server-rendered'] });
    startupTimer = window.setTimeout(stopStartup, 10_000);
    addEventListener('pagehide', stopStartup, { once: true });
  }
  every(1500, bind);
}
