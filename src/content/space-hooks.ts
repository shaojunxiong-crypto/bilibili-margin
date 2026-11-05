import css from './styles/index';
import { createFavorites } from './ui/favorites';
import { createLaterDrawer } from './ui/drawer';
import { createHistoryDrawer } from './ui/history-drawer';
import { loadSettings, onSettingsChange } from '../shared/settings';

/**
 * 空间页「原生模式」的钩子（GitHub #52 / #38 后续）。
 *
 * space.bilibili.com 的子页（收藏夹 / 历史 / 稍后再看…）映间不接管，走 B 站原生页面
 * （见 main.ts 的 spaceNative），所以在 ui/space.ts 里改按钮对这里无效。
 * 这里用事件委托拦住原生入口的 <a>，改成开映间自己的抽屉；抽屉放在独立的 shadow root 里，
 * 并注入整份 app CSS，否则拿不到主题变量，也没 .dw-* 的样式。
 */
let installed = false;
let favDirect = false;
let built: { fav: { open(): void }; hist: { open(): void }; later: { open(): void } } | null = null;

function ensure() {
  if (built) return built;
  const host = document.createElement('div');
  host.id = 'margin-space-hooks';
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483000';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = css + '\n.app > .dw { pointer-events: auto; }';
  const app = document.createElement('div');
  app.className = 'app';
  // 只由打开的抽屉接收点击；容器透明，关闭后原生页面仍可操作。
  app.style.cssText = 'background:transparent;pointer-events:none;overflow:visible';
  root.append(style, app);
  document.body.append(host);

  const fav = createFavorites(() => { /* 空间页不做悬停预览 */ }, () => favDirect);
  const hist = createHistoryDrawer();
  const later = createLaterDrawer(() => app);
  app.append(fav.el as HTMLElement, hist.el, later.el);
  built = { fav: fav as unknown as { open(): void }, hist, later };
  return built;
}

export function installSpaceHooks(): void {
  if (installed) return;
  installed = true;
  loadSettings().then((s) => { favDirect = s.favDirect; }).catch(() => {});
  onSettingsChange((s) => { favDirect = s.favDirect; });
  document.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement | null;
    const a = t?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a || a.target === '_blank') return;
    const href = a.href || '';
    const kind = /medialist|#fav/i.test(href) ? 'fav'
      : /\/history/i.test(href) ? 'hist'
        : /watchlater|#later/i.test(href) ? 'later' : null;
    if (!kind) return;
    // 只处理本站链接，外链放行
    try {
      if (new URL(href, location.href).hostname !== location.hostname) return;
    } catch { return; }
    ev.preventDefault();
    ev.stopPropagation();
    try { ensure()[kind].open(); } catch (e) {
      console.warn('[映间] 原生空间入口打开抽屉失败，放行原链接', e);
      location.href = href;
    }
  }, true);
}
