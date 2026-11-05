export type Theme = 'auto' | 'light' | 'dark';
/** 只保留经典配色（雾蓝 / 夜蓝已按用户要求移除） */
export type Palette = 'classic';
export type ShaderId = 'aurora' | 'silk' | 'mesh' | 'grain' | 'ice' | 'veil' | 'smoke' | 'neuro' | 'flow' | 'rays' | 'blend' | 'flux' | 'gate';
export type BgMode = 'random' | 'fixed' | 'image' | 'off';

/** 首页可以隐藏的部件（v0.43）：首页顶部的搜索框、日期栏、换一批按钮，以及卡片上的各项信息 */
export type HomeBit = 'search' | 'date' | 'refresh' | 'author' | 'views' | 'danmaku' | 'ago' | 'dur' | 'reason';
export const HOME_BITS: HomeBit[] = ['search', 'date', 'refresh', 'author', 'views', 'danmaku', 'ago', 'dur', 'reason'];

/** 首页可排序的板块（v0.47）：搜索区、足迹+天气、分类栏、视频流、页脚 */
export type HomeSection = 'hero' | 'dash' | 'toolbar' | 'feed' | 'footer';
export const HOME_SECTIONS: HomeSection[] = ['hero', 'dash', 'toolbar', 'feed', 'footer'];
export const HOME_SECTION_NAMES: Record<HomeSection, string> = {
  hero: '搜索区',
  dash: '足迹与天气',
  toolbar: '分类栏',
  feed: '视频列表',
  footer: '页脚',
};

export interface Filters {
  /** 标题关键词；写成 /正则/ 时按正则匹配 */
  keywords: string[];
  /** UP 主昵称或 MID */
  ups: string[];
  minViews: number;
  /** 秒 */
  minDuration: number;
}

export interface Background {
  mode: BgMode;
  shader: ShaderId;
  /** 0–1 */
  intensity: number;
  /** 随机模式只在这些里面挑（v0.48，评论区 K-aloy：有些样式太花，想禁掉一部分）；空 = 全部 */
  pool?: ShaderId[];
}

export interface Settings {
  enabled: boolean;
  theme: Theme;
  palette: Palette;
  hoverPreview: boolean;
  /** 重新设计视频播放页（保留 B 站原生播放器与评论） */
  watch: boolean;
  /** 首页开场动画（每次打开浏览器后首次进入首页播放一次） */
  intro: boolean;
  /** YouTube 风格首页（可选，默认关）：只借布局结构，配色和主题不变；只影响首页 */
  /** 首页顶部「B 站足迹」热力图（关掉只是不显示，后台照样记录） */
  footprint: boolean;
  /** 首页顶部天气卡（关掉就不请求天气和定位） */
  weather: boolean;
  /** 点收藏夹直接展开全部视频（关掉时先扇形弹出最近 4 个） */
  favDirect: boolean;
  /** 播放页打开后自动进入网页全屏 */
  autoWeb: boolean;
  /** 网页全屏时可以往下滚动看评论（播放器跟着滚走） */
  webScroll: boolean;
  /** v0.49：播放页 X / C 减速加速 0.1×、Z 在当前倍速与 1× 之间切换（B 站评论建议） */
  speedKeys: boolean;
  /** v0.49：楼中楼按回复关系缩进成对话树（参考 BewlyCat，B 站评论建议） */
  replyTree: boolean;
  /** 首页每行几个视频：0 = 按窗口宽度自动，4 / 5 = 固定 */
  cols: 0 | 4 | 5 | 6;
  /** 点击「推荐 / 热门 / 关注老片」分类标签刷新列表 */
  tabRefresh: boolean;
  /** 首页隐藏的部件；空 = 全部显示 */
  homeHide: HomeBit[];
  /** 标题字体（v0.46，B 站评论建议）：衬线 = 宋体系，无衬线 = 黑体系 */
  titleFont: 'serif' | 'sans';
  /** 数字、时间、UID 这些小字用等宽字体（v0.47，评论区：关掉宋体和 mono 少点 AI 味）；关掉后跟正文字体一致 */
  monoNum: boolean;
  /** 顶栏入口（v0.47.1，评论区：想隐藏分区、大会员这些、调顺序）：隐藏的入口名；B 站入口的顺序 */
  headHide: string[];
  headOrder: string[];
  /** 内容缩放（v0.47.1，评论区：字有点小）：首页和接管页正文区整体放大，100 / 110 / 120 */
  zoom: 100 | 110 | 120;
  /** Ctrl+K 打开命令面板（v0.47.2，评论区：和浏览器 / 其他扩展的 Ctrl+K 冲突时可以关掉，/ 键仍可用） */
  cmdK: boolean;
  /** 视频 CDN 节点（v0.47.2，评论区：想像 bilisail 那样选节点）：'' = B 站默认 */
  cdn: string;
  /** 自定义正文字体（v0.47）：填本机已装的字体名，比如「微软雅黑」「HarmonyOS Sans SC」；空 = 映间默认 */
  bodyFont: string;
  /** 账号卡片可以拖拽甩动（v0.46）：关掉后卡片固定挂着，只能点击翻面 */
  idDrag: boolean;
  /** 低配设备减少动画（v0.47）：暂停背景/天气/悬停动画并压缩过渡 */
  reduceMotion: boolean;
  /** 有 B 站播放器时自动进入宽屏（v0.47），番剧、列表等页面同样生效 */
  wide: boolean;
  /** 隐藏广告与推广（v0.47），默认开启；只做展示层过滤 */
  hideAds: boolean;
  /** 顶栏消息未读轮询与消息角标（v0.47）；动态角标不受影响 */
  msgRemind: boolean;
  /** 首页板块顺序（v0.47） */
  homeOrder: HomeSection[];
  /** App 推荐流（v0.48 实验，默认关）：首页「推荐」改走手机 App 的推荐接口，扫码授权后与手机同一套个性化推荐 */
  appFeed: boolean;
  /** X 式重排（v0.48 实验，默认关）：按本机算的偏好给推荐重新排序，混入关注新稿，看过的不再出现 */
  rerank: boolean;
  /** 圆角强度（v0.50，B 站评论建议）：0 直角 / 50 小 / 100 默认 / 150 大；构建时所有 px 圆角乘 --margin-rk */
  radius: 0 | 50 | 100 | 150;
  /** 评论正文字号（v0.50，B 站评论：评论字太小）：14 默认 / 15 / 16 / 17 */
  commentSize: 14 | 15 | 16 | 17;
  /** 顶栏图标悬停展开文字（v0.50，B 站评论：想要悬停不展开）；关掉后只在点选时展开 */
  headHover: boolean;
  filters: Filters;
  bg: Background;
}

/** 保留用户顺序，去掉不认识的项，再把缺失的板块按默认顺序补回末尾 */
export function normalizeHomeOrder(value: unknown): HomeSection[] {
  const out: HomeSection[] = [];
  const add = (v: unknown) => {
    if (typeof v !== 'string') return;
    const s = v as HomeSection;
    if (HOME_SECTIONS.includes(s) && !out.includes(s)) out.push(s);
  };
  if (Array.isArray(value)) value.forEach(add);
  HOME_SECTIONS.forEach(add);
  return out;
}

export const DEFAULTS: Settings = {
  enabled: true,
  theme: 'auto',
  palette: 'classic',
  hoverPreview: true,
  watch: true,
  intro: true,
  footprint: true,
  weather: true,
  favDirect: false,
  autoWeb: false,
  webScroll: true,
  speedKeys: true,
  replyTree: true,
  cols: 0,
  tabRefresh: false,
  homeHide: [],
  titleFont: 'serif',
  monoNum: true,
  headHide: [],
  headOrder: [],
  zoom: 100,
  cmdK: true,
  cdn: '',
  bodyFont: '',
  idDrag: false,
  reduceMotion: false,
  wide: false,
  hideAds: true,
  msgRemind: true,
  homeOrder: [...HOME_SECTIONS],
  appFeed: false,
  rerank: false,
  radius: 100,
  commentSize: 14,
  headHover: true,
  filters: { keywords: [], ups: [], minViews: 0, minDuration: 0 },
  bg: { mode: 'random', shader: 'aurora', intensity: 0.6 },
};

/** 字体名只留字母、数字、中日韩文字、空格和 - _ .，最长 64 个字：会拼进 CSS font-family，不能带引号分号 */
export function cleanFont(v: unknown): string {
  return typeof v === 'string' ? v.replace(/[^\p{L}\p{N} ._-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 64) : '';
}

/** 只接受 bilivideo / akamaized / hdslb 的主机名，防止把视频流导到别处 */
export function cleanHost(v: unknown): string {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.(bilivideo\.com|bilivideo\.cn|akamaized\.net)$/.test(s) ? s : '';
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length <= 16))].slice(0, 20) : [];
}

const KEY = 'margin:settings';
export const BG_IMAGE_KEY = 'margin:bg-image';

function merge(raw: Partial<Settings> | undefined): Settings {
  const r = raw ?? {};
  return {
    ...DEFAULTS,
    ...r,
    filters: { ...DEFAULTS.filters, ...(r.filters ?? {}) },
    bg: { ...DEFAULTS.bg, ...(r.bg ?? {}) },
    homeHide: Array.isArray(r.homeHide) ? HOME_BITS.filter((b) => r.homeHide!.includes(b)) : [],
    titleFont: r.titleFont === 'sans' ? 'sans' : 'serif',
    theme: r.theme === 'light' || r.theme === 'dark' ? r.theme : 'auto',
    monoNum: r.monoNum !== false,
    headHide: strList(r.headHide),
    headOrder: strList(r.headOrder),
    zoom: r.zoom === 110 || r.zoom === 120 ? r.zoom : 100,
    tabRefresh: r.tabRefresh === true,
    cmdK: r.cmdK !== false,
    cdn: cleanHost(r.cdn),
    bodyFont: cleanFont(r.bodyFont),
    idDrag: r.idDrag === true,
    reduceMotion: r.reduceMotion === true,
    wide: r.wide === true,
    hideAds: r.hideAds !== false,
    msgRemind: r.msgRemind !== false,
    homeOrder: normalizeHomeOrder(r.homeOrder),
    appFeed: r.appFeed === true,
    rerank: r.rerank === true,
    radius: r.radius === 0 || r.radius === 50 || r.radius === 150 ? r.radius : 100,
    commentSize: r.commentSize === 15 || r.commentSize === 16 || r.commentSize === 17 ? r.commentSize : 14,
    headHover: r.headHover !== false,
    palette: 'classic', // 旧版存过 mist，统一回到经典
  };
}

export async function loadSettings(): Promise<Settings> {
  const r = await chrome.storage.local.get(KEY);
  return merge(r[KEY] as Partial<Settings> | undefined);
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = merge({ ...(await loadSettings()), ...patch });
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export function onSettingsChange(cb: (s: Settings, prev: Settings) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[KEY]) return;
    cb(merge(changes[KEY].newValue as Partial<Settings>), merge(changes[KEY].oldValue as Partial<Settings>));
  });
}

/**
 * 校验导入的设置：只取认识的字段、类型不对的丢掉，其余用默认值补齐。整体不是对象时返回 null。
 */
export function sanitizeSettings(raw: unknown): Settings | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: Partial<Settings> = {};
  const bool = (k: 'enabled' | 'hoverPreview' | 'watch' | 'intro' | 'footprint' | 'weather' | 'favDirect' | 'autoWeb' | 'webScroll' | 'speedKeys' | 'replyTree' | 'idDrag' | 'monoNum' | 'reduceMotion' | 'wide' | 'hideAds' | 'msgRemind' | 'appFeed' | 'rerank' | 'headHover' | 'tabRefresh') => { if (typeof r[k] === 'boolean') out[k] = r[k] as boolean; };
  bool('enabled'); bool('hoverPreview'); bool('watch'); bool('intro'); bool('footprint'); bool('weather'); bool('favDirect'); bool('autoWeb'); bool('webScroll'); bool('speedKeys'); bool('replyTree'); bool('idDrag'); bool('monoNum');
  bool('reduceMotion'); bool('wide'); bool('hideAds'); bool('msgRemind'); bool('appFeed'); bool('rerank'); bool('headHover'); bool('tabRefresh');
  if (r.radius === 0 || r.radius === 50 || r.radius === 100 || r.radius === 150) out.radius = r.radius;
  if (r.commentSize === 14 || r.commentSize === 15 || r.commentSize === 16 || r.commentSize === 17) out.commentSize = r.commentSize;
  if (typeof r.bodyFont === 'string') out.bodyFont = cleanFont(r.bodyFont);
  if (Array.isArray(r.headHide)) out.headHide = strList(r.headHide);
  if (Array.isArray(r.headOrder)) out.headOrder = strList(r.headOrder);
  if (typeof r.cmdK === 'boolean') out.cmdK = r.cmdK;
  if (typeof r.cdn === 'string') out.cdn = cleanHost(r.cdn);
  if (r.zoom === 100 || r.zoom === 110 || r.zoom === 120) out.zoom = r.zoom;
  if (r.titleFont === 'serif' || r.titleFont === 'sans') out.titleFont = r.titleFont;
  if (r.cols === 0 || r.cols === 4 || r.cols === 5 || r.cols === 6) out.cols = r.cols;
  if (Array.isArray(r.homeHide)) out.homeHide = HOME_BITS.filter((b) => (r.homeHide as unknown[]).includes(b));
  if (Array.isArray(r.homeOrder)) out.homeOrder = normalizeHomeOrder(r.homeOrder);
  if (r.theme === 'auto' || r.theme === 'light' || r.theme === 'dark') out.theme = r.theme;
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length <= 200).slice(0, 500) : undefined);
  const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : undefined);
  const f = (r.filters && typeof r.filters === 'object' ? r.filters : {}) as Record<string, unknown>;
  out.filters = { ...DEFAULTS.filters };
  out.filters.keywords = strs(f.keywords) ?? DEFAULTS.filters.keywords;
  out.filters.ups = strs(f.ups) ?? DEFAULTS.filters.ups;
  out.filters.minViews = num(f.minViews, 1e10) ?? DEFAULTS.filters.minViews;
  out.filters.minDuration = num(f.minDuration, 86400) ?? DEFAULTS.filters.minDuration;
  const b = (r.bg && typeof r.bg === 'object' ? r.bg : {}) as Record<string, unknown>;
  const SHADERS: ShaderId[] = ['aurora', 'silk', 'mesh', 'grain', 'ice', 'veil', 'smoke', 'neuro', 'flow', 'rays', 'blend', 'flux', 'gate'];
  out.bg = {
    mode: (['random', 'fixed', 'image', 'off'] as BgMode[]).includes(b.mode as BgMode) ? (b.mode as BgMode) : DEFAULTS.bg.mode,
    shader: SHADERS.includes(b.shader as ShaderId) ? (b.shader as ShaderId) : DEFAULTS.bg.shader,
    intensity: num(b.intensity, 1) ?? DEFAULTS.bg.intensity,
    pool: Array.isArray(b.pool) ? SHADERS.filter((x) => (b.pool as unknown[]).includes(x)) : [],
  };
  return merge(out);
}

/** 整份替换设置（导入用） */
export async function replaceSettings(next: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: merge(next) });
}
