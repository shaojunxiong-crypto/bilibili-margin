import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadSettings, saveSettings, sanitizeSettings, normalizeHomeOrder,
  cleanFont, cleanHost, DEFAULTS,
} from '../../src/shared/settings';

/** chrome.storage.local 的最小模拟：loadSettings / saveSettings 只用到 get(KEY) / set */
const store = new Map<string, unknown>();
const setChromeMock = () => {
  (globalThis as Record<string, unknown>).chrome = {
    storage: {
      local: {
        get: async (key: string) => (store.has(key) ? { [key]: store.get(key) } : {}),
        set: async (obj: Record<string, unknown>) => { for (const [k, v] of Object.entries(obj)) store.set(k, v); },
      },
      onChanged: { addListener: () => {} },
    },
  };
};

describe('settings 迁移（merge / loadSettings）', () => {
  beforeEach(() => { store.clear(); setChromeMock(); });

  it('空存储 → 全部默认值', async () => {
    const s = await loadSettings();
    expect(s).toEqual(DEFAULTS);
  });

  it('撤回的播放页评论布局选项不再导入或作为默认设置', () => {
    expect(DEFAULTS).not.toHaveProperty('watchComments');
    expect(DEFAULTS).not.toHaveProperty('commentInput');
    const s = sanitizeSettings({watchComments:'side',commentInput:'comfortable'});
    expect(s).not.toHaveProperty('watchComments');
    expect(s).not.toHaveProperty('commentInput');
  });

  it('新安装默认直接打开收藏夹，已有选择保留；列数枚举安全回落', async () => {
    expect(DEFAULTS.favDirect).toBe(true);
    store.set('margin:settings',{favDirect:false,favColumns:9});
    expect(await loadSettings()).toMatchObject({favDirect:false,favColumns:3});
    expect(sanitizeSettings({favColumns:4})).toMatchObject({favColumns:4});
  });

  it('强调色与玻璃设置默认沿用经典色并使用柔和效果，非法枚举回落',async () => {
    expect(DEFAULTS.accent).toBe('classic');expect(DEFAULTS.glass).toBe('soft');
    expect(sanitizeSettings({accent:'pink',glass:'liquid'})).toMatchObject({accent:'pink',glass:'liquid'});
    store.set('margin:settings',{accent:'bad',glass:'bad'});
    expect(await loadSettings()).toMatchObject({accent:'classic',glass:'soft'});
  });

  it('部分存储：给什么用什么，缺的补默认', async () => {
    store.set('margin:settings', { theme: 'dark', zoom: 110 });
    const s = await loadSettings();
    expect(s.theme).toBe('dark');
    expect(s.zoom).toBe(110);
    expect(s.radius).toBe(100);
    expect(s.filters.minViews).toBe(0);
  });

  it('旧版 palette=mist 一律回落 classic', async () => {
    store.set('margin:settings', { palette: 'mist' });
    expect((await loadSettings()).palette).toBe('classic');
  });

  it('枚举外字段回落默认：zoom / radius / commentSize / titleFont / theme', async () => {
    store.set('margin:settings', { zoom: 999, radius: 37, commentSize: 42, titleFont: 'wrong', theme: 'blue' });
    const s = await loadSettings();
    expect(s.zoom).toBe(100);
    expect(s.radius).toBe(100);
    expect(s.commentSize).toBe(14);
    expect(s.titleFont).toBe('serif');
    expect(s.theme).toBe('auto');
  });

  it('枚举内的合法值全部保留（0 是 radius 的合法值，不能被吞）', async () => {
    store.set('margin:settings', { radius: 0, commentSize: 17, zoom: 120, theme: 'light' });
    const s = await loadSettings();
    expect(s.radius).toBe(0);
    expect(s.commentSize).toBe(17);
    expect(s.zoom).toBe(120);
    expect(s.theme).toBe('light');
  });

  it('filters 深合并：只给 keywords 不会把 minViews 冲成 undefined', async () => {
    store.set('margin:settings', { filters: { keywords: ['屏蔽词'] } });
    const s = await loadSettings();
    expect(s.filters.keywords).toEqual(['屏蔽词']);
    expect(s.filters.minViews).toBe(0);
    expect(s.filters.minDuration).toBe(0);
  });

  it('bg 深合并 + 强度保持数值', async () => {
    store.set('margin:settings', { bg: { mode: 'fixed', shader: 'silk' } });
    const s = await loadSettings();
    expect(s.bg.mode).toBe('fixed');
    expect(s.bg.shader).toBe('silk');
    expect(s.bg.intensity).toBe(0.6);
  });

  it('homeHide 只保留认识的部件名', async () => {
    store.set('margin:settings', { homeHide: ['search', 'bogus', 'dur'] });
    expect((await loadSettings()).homeHide).toEqual(['search', 'dur']);
  });

  it('saveSettings 落盘并可回读，patch 不清掉其他字段', async () => {
    await saveSettings({ theme: 'light' });
    await saveSettings({ monoNum: false });
    const s = await loadSettings();
    expect(s.theme).toBe('light');
    expect(s.monoNum).toBe(false);
    expect(store.get('margin:settings')).toBeTruthy();
  });

  it('广告片段跳过默认关闭，仅显式布尔值开启，支持备份导入', async () => {
    expect((await loadSettings()).sponsorSkip).toBe(false);
    store.set('margin:settings', { sponsorSkip: 'true' });
    expect((await loadSettings()).sponsorSkip).toBe(false);
    await saveSettings({ sponsorSkip: true });
    expect((await loadSettings()).sponsorSkip).toBe(true);
    expect(sanitizeSettings({ sponsorSkip: true })?.sponsorSkip).toBe(true);
    expect(sanitizeSettings({ sponsorSkip: 'true' })?.sponsorSkip).toBe(false);
  });
});

describe('sanitizeSettings（导入备份的校验）', () => {
  beforeEach(() => { store.clear(); setChromeMock(); });

  it('非对象一律 null', () => {
    expect(sanitizeSettings(null)).toBeNull();
    expect(sanitizeSettings('xx')).toBeNull();
    expect(sanitizeSettings([1, 2])).toBeNull();
  });

  it('类型不对的字段丢弃、用默认值补齐，boolean 只收 boolean', () => {
    const s = sanitizeSettings({ enabled: 'yes', watch: false, radius: 150, commentSize: 'big' })!;
    expect(s.enabled).toBe(true);   // 默认
    expect(s.watch).toBe(false);    // 合法 boolean，保留
    expect(s.radius).toBe(150);
    expect(s.commentSize).toBe(14); // 字符串丢弃 → 默认
  });

  it('修复出坏数据后仍能走一次 save/load 往返', async () => {
    const s = sanitizeSettings({ theme: 'dark', junk: 'x' })!;
    await saveSettings(s);
    const back = await loadSettings();
    expect(back.theme).toBe('dark');
    expect((back as unknown as Record<string, unknown>).junk).toBeUndefined();
  });
});

describe('normalizeHomeOrder（首页板块排序）', () => {
  it('保留用户顺序，丢弃未知项，缺失板块按默认顺序补尾', () => {
    expect(normalizeHomeOrder(['feed', 'bogus', 'hero'])).toEqual(['feed', 'hero', 'dash', 'toolbar', 'footer']);
  });

  it('空 / 非数组 → 完全默认顺序', () => {
    expect(normalizeHomeOrder(undefined)).toEqual(['hero', 'dash', 'toolbar', 'feed', 'footer']);
    expect(normalizeHomeOrder('nope')).toEqual(['hero', 'dash', 'toolbar', 'feed', 'footer']);
  });

  it('重复项只算一次', () => {
    expect(normalizeHomeOrder(['feed', 'feed', 'hero'])).toEqual(['feed', 'hero', 'dash', 'toolbar', 'footer']);
  });
});

describe('cleanFont / cleanHost（拼进 CSS 和视频流的两个白名单）', () => {
  it('cleanFont：剥掉引号分号等危险字符，压缩空白，截断 64', () => {
    expect(cleanFont('Font";color:red')).toBe('Fontcolorred');
    expect(cleanFont('  a   b  ')).toBe('a b');
    expect(cleanFont('x'.repeat(80)).length).toBe(64);
    expect(cleanFont(42)).toBe('');
  });

  it('cleanHost：只认 bilivideo / akamaized，其他一律空', () => {
    expect(cleanHost('XY.Akamaized.net')).toBe('xy.akamaized.net');
    expect(cleanHost('cdn.bilivideo.com')).toBe('cdn.bilivideo.com');
    expect(cleanHost('evil.example.com')).toBe('');
    expect(cleanHost('a b.bilivideo.com')).toBe('');
    expect(cleanHost('')).toBe('');
  });
});
