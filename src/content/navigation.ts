/** 应用窗口内的站内入口留在当前窗口，浏览器普通标签页仍沿用新开行为。 */
function appWindow(): boolean {
  return matchMedia('(display-mode: standalone), (display-mode: minimal-ui), (display-mode: window-controls-overlay)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

type OpenGesture = Pick<MouseEvent, 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'> & { button?: number };
function appUrl(url: string, e?: OpenGesture): string | null {
  if (!appWindow() || (e && ((e.button != null && e.button !== 0) || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey))) return null;
  try {
    const u = new URL(url, location.href);
    return u.protocol === 'https:' && (u.hostname === 'bilibili.com' || u.hostname.endsWith('.bilibili.com')) ? u.href : null;
  } catch { return null; }
}

export function openBili(url: string, target = '_blank', features = 'noopener', e?: OpenGesture): Window | null {
  const same = target === '_blank' ? appUrl(url, e) : null;
  if (same) { location.assign(same); return null; }
  return window.open(url, target, features);
}

let installed = false;
let on = false;
export function installAppNavigation(enabled: boolean): void {
  on = enabled;
  if (installed) return;
  installed = true;
  document.addEventListener('click', (e) => {
    if (!on || e.defaultPrevented) return;
    const a = e.composedPath().find((n): n is HTMLAnchorElement => n instanceof HTMLAnchorElement);
    if (!a || a.target !== '_blank' || a.hasAttribute('download')) return;
    const same = appUrl(a.href, e);
    if (!same) return;
    e.preventDefault();
    location.assign(same);
  }, true);
}
