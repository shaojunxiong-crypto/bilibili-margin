import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let app = false;
let click: (event: any) => void;
let nav: typeof import('../../src/content/navigation');
const assign = vi.fn(); const open = vi.fn();
class Anchor {
  target = '_blank'; download = false;
  constructor(public href: string) {}
  hasAttribute(name: string) { return name === 'download' && this.download; }
}
const event = (anchor: Anchor, patch = {}) => ({ button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
  defaultPrevented: false, preventDefault: vi.fn(), composedPath: () => [anchor], ...patch });
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); app = false;
  vi.stubGlobal('matchMedia', () => ({ matches: app }));
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('location', { href: 'https://www.bilibili.com/', assign });
  vi.stubGlobal('window', { open });
  vi.stubGlobal('HTMLAnchorElement', Anchor);
  vi.stubGlobal('document', { addEventListener: (_: string, cb: typeof click) => { click = cb; } });
  nav = await import('../../src/content/navigation');
});
afterEach(() => vi.unstubAllGlobals());

describe('应用窗口站内导航', () => {
  it('普通浏览器保留新标签页', () => {
    nav.openBili('https://search.bilibili.com/all?keyword=test');
    expect(open).toHaveBeenCalled(); expect(assign).not.toHaveBeenCalled();
  });
  it.each(['https://search.bilibili.com/all?keyword=test', 'https://space.bilibili.com/1', '/video/BVtest'])('应用窗口留在同一窗口：%s', (url) => {
    app = true; nav.openBili(url);
    expect(assign).toHaveBeenCalledWith(new URL(url, 'https://www.bilibili.com/').href); expect(open).not.toHaveBeenCalled();
  });
  it.each(['https://example.com/', 'https://bilibili.com.evil.test/', 'javascript:alert(1)'])('外部地址不套用站内规则：%s', (url) => {
    app = true; nav.openBili(url); expect(assign).not.toHaveBeenCalled(); expect(open).toHaveBeenCalled();
  });
  it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }])('显式新开手势不改成当前页：%j', (patch) => {
    app = true; nav.openBili('/video/BVtest', '_blank', 'noopener', event(new Anchor(''), patch));
    expect(assign).not.toHaveBeenCalled(); expect(open).toHaveBeenCalled();
  });
  it('处理跨 Shadow DOM 的链接，并跟随扩展开关', () => {
    app = true; nav.installAppNavigation(true);
    const e = event(new Anchor('https://space.bilibili.com/1')); click(e);
    expect(e.preventDefault).toHaveBeenCalled(); expect(assign).toHaveBeenCalledTimes(1);
    nav.installAppNavigation(false); click(e); expect(assign).toHaveBeenCalledTimes(1);
  });
  it('下载链接和已处理事件交给原有处理器', () => {
    app = true; nav.installAppNavigation(true);
    const a = new Anchor('https://www.bilibili.com/'); a.download = true;
    click(event(a)); a.download = false; click(event(a, { defaultPrevented: true }));
    expect(assign).not.toHaveBeenCalled();
  });
});
