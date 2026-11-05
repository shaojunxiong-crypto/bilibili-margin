import type { BgMode, HomeBit, HomeSection, Settings, ShaderId, Theme } from '../../shared/settings';
import { BG_IMAGE_KEY, cleanFont, HOME_BITS, HOME_SECTION_NAMES, normalizeHomeOrder, replaceSettings, sanitizeSettings, saveSettings } from '../../shared/settings';
import { ACTIVITY_KEY, sanitizeActivity, type FpMessage } from '../../shared/activity';
import { compressImage } from '../bg/background';
import { SHADER_IDS, SHADER_NAMES } from '../bg/shaders';
import { cachedThumb, shaderThumb } from '../bg/program';
import { block, chipInput, pillToggles, rangeSlider, row, segmented, stepSlider, toast, toggle } from './controls';
import { fmtCount, h, icon, ICONS } from './dom';
import { createSheet, type Sheet } from './sheet';
import { SITE_LINKS } from './header';
import { appPoll, appQr, appRevoke, appState } from '../api/appfeed';
import { clearLoc, geocodeList, savedLoc, setLoc as setLocWithName } from '../api/weather';

export interface SettingsPanel { sheet: Sheet; sync(s: Settings): void }

/** 设置面板第一次打开时才建内容（约 220 个节点、几十个控件），页面加载时只放一个空抽屉（v0.44） */
export function createSettingsPanel(get: () => Settings, currentShader: () => ShaderId | null): SettingsPanel {
  let inner: SettingsPanel | null = null;
  const sheet: Sheet = createSheet({ title: '设置', eyebrow: 'Preferences', width: 420, onOpen: () => {
    if (!inner) inner = buildSettingsPanel(sheet, get, currentShader);
    else inner.sync(get());
  } });
  return { sheet, sync(s) { inner?.sync(s); } };
}

function buildSettingsPanel(sheet: Sheet, get: () => Settings, currentShader: () => ShaderId | null): SettingsPanel {
  const save = (patch: Partial<Settings>) => saveSettings(patch);
  const say = (t: string) => toast((sheet.el.closest('.app') as HTMLElement | null) ?? sheet.el, t);
  const s0 = get();

  const theme = segmented<Theme>([['auto', '跟随系统'], ['light', '亮色'], ['dark', '暗色']], s0.theme, (v) => save({ theme: v }));
  const watch = toggle(s0.watch, '其他页面重设计', (v) => save({ watch: v }));
  const preview = toggle(s0.hoverPreview, '悬停预览', (v) => save({ hoverPreview: v }));
  const intro = toggle(s0.intro, '开场动画', (v) => save({ intro: v }));
  const reduceM = toggle(s0.reduceMotion, '减少动画', (v) => save({ reduceMotion: v }));
  const foot = toggle(s0.footprint, '足迹热力图', (v) => save({ footprint: v }));
  const wxT = toggle(s0.weather, '天气', (v) => save({ weather: v }));
  // v0.43 首页组件开关：存的是「隐藏了哪些」，界面上是「显示哪些」
  const hideSet = (k: HomeBit, show: boolean) => {
    const cur = new Set(get().homeHide);
    if (show) cur.delete(k); else cur.add(k);
    return save({ homeHide: HOME_BITS.filter((b) => cur.has(b)) });
  };
  const partT = (k: HomeBit, label: string) => toggle(!s0.homeHide.includes(k), label, (v) => hideSet(k, v));
  const searchT = partT('search', '搜索框');
  const dateT = partT('date', '日期栏');
  const refreshT = partT('refresh', '换一批');
  const CARD_BITS: [HomeBit, string][] = [['author', 'UP 主'], ['views', '播放'], ['danmaku', '弹幕'], ['ago', '发布时间'], ['dur', '时长'], ['reason', '推荐理由']];
  const shownCard = (hide: HomeBit[]) => CARD_BITS.map(([k]) => k).filter((k) => !hide.includes(k));
  const cardBits = pillToggles<HomeBit>(CARD_BITS, shownCard(s0.homeHide), (on) => {
    const keep = get().homeHide.filter((k) => !CARD_BITS.some(([c]) => c === k));
    const off = CARD_BITS.map(([k]) => k).filter((k) => !on.includes(k));
    return save({ homeHide: HOME_BITS.filter((b) => keep.includes(b) || off.includes(b)) });
  });
  // 首页版块顺序（v0.47）：上移 / 下移，保存后 MarginApp 立即移动节点
  const orderBox = h('div', { class: 'home-order' });
  let order = normalizeHomeOrder(s0.homeOrder);
  function paintOrder() {
    const active = (orderBox.getRootNode() as Document | ShadowRoot).activeElement as HTMLElement | null;
    const focusKey = active?.dataset.focus ?? '';
    orderBox.replaceChildren(...order.map((id, i) => {
      const name = HOME_SECTION_NAMES[id];
      const up = h('button', {
        type: 'button', class: 'home-order-btn', 'aria-label': `上移${name}`, title: '上移',
        disabled: i === 0, 'data-focus': `${id}:up`,
      }, '↑');
      const down = h('button', {
        type: 'button', class: 'home-order-btn', 'aria-label': `下移${name}`, title: '下移',
        disabled: i === order.length - 1, 'data-focus': `${id}:down`,
      }, '↓');
      up.addEventListener('click', () => move(id, -1));
      down.addEventListener('click', () => move(id, 1));
      return h('div', { class: 'home-order-row', 'data-section': id },
        h('span', { class: 'home-order-name' }, name),
        h('span', { class: 'home-order-btns' }, up, down));
    }));
    if (focusKey) orderBox.querySelector<HTMLElement>(`[data-focus="${focusKey}"]`)?.focus();
  }
  function move(id: HomeSection, dir: -1 | 1) {
    const i = order.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    order = next;
    paintOrder();
    save({ homeOrder: next });
  }
  paintOrder();
  // 天气城市（#3）：输入后列出候选，点一个就固定；「自动」回到 IP 定位
  const cityIn = h('input', { class: 'city-in', type: 'search', placeholder: '自动定位', 'aria-label': '天气城市', autocomplete: 'off' }) as HTMLInputElement;
  const cityList = h('ul', { class: 'city-list', role: 'listbox', 'aria-label': '城市候选', hidden: '' });
  const cityAuto = h('button', { class: 'city-auto', type: 'button' }, '自动');
  const paintCity = () => { const l = savedLoc(); cityIn.value = l?.manual ? l.name : ''; cityAuto.hidden = !l?.manual; };
  let cityT = 0, citySeq = 0;
  cityIn.addEventListener('keydown', (e) => e.stopPropagation());
  cityIn.addEventListener('input', () => {
    clearTimeout(cityT);
    const q = cityIn.value.trim();
    if (!q) { cityList.hidden = true; return; }
    cityT = window.setTimeout(async () => {
      const seq = ++citySeq;
      const list = await geocodeList(q).catch(() => []);
      if (seq !== citySeq) return;
      cityList.replaceChildren(...(list.length ? list.map((p) => {
        const li = h('li', { role: 'option', tabindex: '0' }, h('b', {}, p.name), p.region ? h('small', {}, p.region) : null);
        const pick = () => { setLocWithName(p); cityList.hidden = true; paintCity(); say(`天气城市：${p.name}`); };
        li.addEventListener('click', pick);
        li.addEventListener('keydown', (e) => { if (e.key === 'Enter') pick(); });
        return li;
      }) : [h('li', { class: 'empty' }, '没有找到这个城市')]));
      cityList.hidden = false;
    }, 300);
  });
  cityAuto.addEventListener('click', () => { clearLoc(); paintCity(); say('天气改回按 IP 自动定位'); });
  paintCity();
  const cityBox = h('div', { class: 'city-box' }, h('div', { class: 'city-row' }, cityIn, cityAuto), cityList);
  const cols = segmented<string>([['0', '自动'], ['4', '4 个'], ['5', '5 个'], ['6', '6 个']], String(s0.cols), (v) => save({ cols: Number(v) as 0 | 4 | 5 | 6 }));
  const fontS = segmented<'serif' | 'sans'>([['serif', '衬线'], ['sans', '无衬线']], s0.titleFont, (v) => save({ titleFont: v }));
  const monoT = toggle(s0.monoNum, '数字用等宽字体', (v) => save({ monoNum: v }));
  const fontIn = h('input', { type: 'text', class: 'city-in font-in', value: s0.bodyFont, placeholder: '比如 微软雅黑、HarmonyOS Sans SC', 'aria-label': '自定义字体', spellcheck: 'false' }) as HTMLInputElement;
  const fontReset = h('button', { type: 'button', class: 'ghost small' }, h('span', {}, '默认'));
  let fontT = 0;
  const saveFont = () => { clearTimeout(fontT); const v = cleanFont(fontIn.value); if (v !== get().bodyFont) { save({ bodyFont: v }); say(v ? `正文字体：${v}${document.fonts.check(`14px "${v}"`) ? '' : '（本机可能没装这个字体）'}` : '正文字体改回默认'); } };
  fontIn.addEventListener('input', () => { clearTimeout(fontT); fontT = window.setTimeout(saveFont, 700); });
  fontIn.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') saveFont(); });
  fontIn.addEventListener('blur', saveFont);
  fontReset.addEventListener('click', () => { fontIn.value = ''; saveFont(); });
  const fontBox = h('div', { class: 'city-box' }, h('div', { class: 'city-row' }, fontIn, fontReset));
  // 顶栏入口（v0.47.1）：每行一个开关；B 站入口可以上下调顺序
  const OWN: [string, string][] = [['收藏', ICONS.fav], ['稍后', ICONS.later], ['足迹', ICONS.heat], ['原版', ICONS.exit]];
  const headList = h('div', { class: 'hl', role: 'list', 'aria-label': '顶栏入口' });
  const siteOrder = (st: Settings) => [...st.headOrder.filter((t) => SITE_LINKS.some((l) => l.title === t)), ...SITE_LINKS.map((l) => l.title).filter((t) => !st.headOrder.includes(t))];
  const paintHead = () => {
    const st = get();
    const order = siteOrder(st);
    const mkRow = (title: string, ic: string, i: number | null) => {
      const on = !st.headHide.includes(title);
      const sw = toggle(on, `顶栏显示${title}`, (v) => save({ headHide: v ? get().headHide.filter((x) => x !== title) : [...get().headHide, title] }).then(paintHead));
      const mv = (d: number, label: string, ch: string) => {
        const b = h('button', { type: 'button', class: 'hl-mv', 'aria-label': `${title}${label}`, title: label }, ch) as HTMLButtonElement;
        if (i === null || i + d < 0 || i + d >= order.length) b.disabled = true;
        else b.onclick = () => { const o = [...order]; [o[i], o[i + d]] = [o[i + d], o[i]]; save({ headOrder: o }).then(paintHead); };
        return b;
      };
      const r = h('div', { class: 'hl-row', role: 'listitem' }, icon(ic), h('span', {}, title), i === null ? h('span') : mv(-1, '上移', '↑'), i === null ? h('span') : mv(1, '下移', '↓'), sw);
      if (!on) r.dataset.off = '';
      return r;
    };
    headList.replaceChildren(
      ...order.map((t, i) => mkRow(t, SITE_LINKS.find((l) => l.title === t)!.icon, i)),
      h('div', { class: 'hl-sep', 'aria-hidden': 'true' }),
      ...OWN.map(([t, ic]) => mkRow(t, ic, null)));
  };
  paintHead();
  const headReset = h('button', { type: 'button', class: 'ghost small', onclick: () => save({ headHide: [], headOrder: [] }).then(paintHead) }, h('span', {}, '恢复默认'));
  const zoomS = segmented<string>([['100', '100%'], ['110', '110%'], ['120', '120%']], String(s0.zoom), (v) => save({ zoom: Number(v) as 100 | 110 | 120 }));
  const radS = segmented<string>([['0', '直角'], ['50', '小'], ['100', '默认'], ['150', '大']], String(s0.radius), (v) => save({ radius: Number(v) as 0 | 50 | 100 | 150 }));
  const cfsS = segmented<string>([['14', '14'], ['15', '15'], ['16', '16'], ['17', '17']], String(s0.commentSize), (v) => save({ commentSize: Number(v) as 14 | 15 | 16 | 17 }));
  const hoverT = toggle(s0.headHover, '顶栏悬停展开文字', (v) => save({ headHover: v }));
  const cmdKT = toggle(s0.cmdK, 'Ctrl+K 打开命令面板', (v) => save({ cmdK: v }));
  // 视频 CDN 节点（v0.47.2）：列表 + 延迟测速；选中后新打开的视频生效
  const CDNS: [string, string][] = [
    ['', 'B 站默认'],
    ['upos-sz-mirrorali.bilivideo.com', '阿里云'], ['upos-sz-mirroralib.bilivideo.com', '阿里云 B'],
    ['upos-sz-mirrorcos.bilivideo.com', '腾讯云'], ['upos-sz-mirrorcosb.bilivideo.com', '腾讯云 B'],
    ['upos-sz-mirrorhw.bilivideo.com', '华为云'], ['upos-sz-mirrorhwb.bilivideo.com', '华为云 B'],
    ['upos-sz-mirror08c.bilivideo.com', '华为云 08c'], ['upos-sz-mirrorbd.bilivideo.com', '百度云'],
    ['upos-sz-mirroraliov.bilivideo.com', '阿里云 海外'], ['upos-sz-mirrorcosov.bilivideo.com', '腾讯云 海外'],
    ['upos-hz-mirrorakam.akamaized.net', 'Akamai 海外'],
  ];
  const cdnMs = new Map<string, number>();
  const cdnList = h('div', { class: 'hl cdn', role: 'radiogroup', 'aria-label': '视频 CDN 节点' });
  const paintCdn = () => {
    const cur = get().cdn;
    cdnList.replaceChildren(...CDNS.map(([host, name]) => {
      const ms = cdnMs.get(host);
      const b = h('button', { type: 'button', class: 'hl-row cdn-row', role: 'radio', 'aria-checked': String(cur === host), onclick: () => save({ cdn: host }).then(paintCdn) },
        h('i', { class: 'cdn-dot', 'aria-hidden': 'true' }), h('span', {}, name), h('small', { class: 'cdn-host' }, host || '自动分配'),
        h('span', { class: 'cdn-ms', 'data-q': ms === undefined ? '' : ms < 0 ? 'bad' : ms < 120 ? 'good' : ms < 300 ? 'ok' : 'bad' }, ms === undefined ? '' : ms < 0 ? '超时' : `${ms} ms`), h('span'));
      return b;
    }));
  };
  paintCdn();
  const ping = async (host: string): Promise<number> => {
    let best = Infinity;
    for (let k = 0; k < 3; k++) {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 3000);
      const t0 = performance.now();
      try { await fetch(`https://${host}/?margin-ping=${Date.now()}`, { mode: 'no-cors', cache: 'no-store', signal: c.signal, credentials: 'omit' }); best = Math.min(best, performance.now() - t0); } catch { /* 超时或拒绝 */ }
      clearTimeout(t);
    }
    return best === Infinity ? -1 : Math.round(best);
  };
  const cdnTest = h('button', { type: 'button', class: 'ghost small', onclick: async () => {
    cdnTest.setAttribute('disabled', ''); cdnTest.textContent = '测速中…';
    await Promise.all(CDNS.filter(([x]) => x).map(async ([x]) => { cdnMs.set(x, await ping(x)); paintCdn(); }));
    cdnTest.removeAttribute('disabled'); cdnTest.textContent = '重新测速';
  } }, '测速');
  const idD = toggle(s0.idDrag, '账号卡片可拖拽', (v) => save({ idDrag: v }));
  const favD = toggle(s0.favDirect, '收藏夹直接展开', (v) => save({ favDirect: v }));
  const wideT = toggle(s0.wide, '宽屏模式', (v) => save({ wide: v }));
  const autoW = toggle(s0.autoWeb, '自动网页全屏', (v) => save({ autoWeb: v }));
  const webS = toggle(s0.webScroll, '网页全屏可滚动', (v) => save({ webScroll: v }));
  const spdK = toggle(s0.speedKeys, '倍速快捷键', (v) => save({ speedKeys: v }));
  const treeT = toggle(s0.replyTree, '楼中楼对话树', (v) => save({ replyTree: v }));
  const msgT = toggle(s0.msgRemind, '消息提醒', (v) => save({ msgRemind: v }));
  const tabRefreshT = toggle(s0.tabRefresh, '点击分类标签刷新列表', (v) => save({ tabRefresh: v }));

  const kw = chipInput(s0.filters.keywords, '输入关键词，回车添加；/正则/ 也可以', (v) => save({ filters: { ...get().filters, keywords: v } }));
  const ups = chipInput(s0.filters.ups, 'UP 主昵称或 MID', (v) => save({ filters: { ...get().filters, ups: v } }));
  const views = stepSlider([0, 1000, 10000, 50000, 100000, 1000000], s0.filters.minViews, (n) => (n ? `≥ ${fmtCount(n)}` : '不限'), (v) => save({ filters: { ...get().filters, minViews: v } }), '最低播放量');
  const dur = segmented<string>([['0', '不限'], ['60', '1 分钟'], ['180', '3 分钟'], ['600', '10 分钟']], String(s0.filters.minDuration), (v) => save({ filters: { ...get().filters, minDuration: Number(v) } }));
  const adsT = toggle(s0.hideAds, '隐藏广告', (v) => save({ hideAds: v }));

  const mode = segmented<BgMode>([['random', '随机'], ['fixed', '固定'], ['image', '图片'], ['off', '关闭']], s0.bg.mode, (v) => {
    if (v === 'image') { file.click(); return; }
    save({ bg: { ...get().bg, mode: v } });
  });
  const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': '背景样式' });
  const paintSwatches = () => {
    const s = get();
    const on = s.bg.mode === 'fixed' ? s.bg.shader : s.bg.mode === 'random' ? currentShader() : null;
    swatches.querySelectorAll<HTMLElement>('.sw-item').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === on)));
    // 用真实渲染的缩略图替换 CSS 色块（主题变了就重画）
    paintThumbs();
  };
  // 缩略图：缓存里有的立刻贴上；没有的等面板可见时再一帧画一张，不在页面加载时编译着色器
  let thumbsVisible = false;
  let thumbJob = 0;
  const paintThumbs = () => {
    const t = (swatches.closest('.app') as HTMLElement | null)?.dataset.theme === 'light' ? 'light' : 'dark';
    if (swatches.dataset.thumbs === t) return;
    const chips = [...swatches.querySelectorAll<HTMLElement>('.sw-chip')];
    const todo: HTMLElement[] = [];
    for (const c of chips) { const url = cachedThumb(c.dataset.id as ShaderId, t); if (url) c.style.backgroundImage = `url(${url})`; else todo.push(c); }
    if (!todo.length) { swatches.dataset.thumbs = t; return; }
    if (!thumbsVisible) return;
    clearTimeout(thumbJob); cancelAnimationFrame(thumbJob);
    const step = () => {
      const c = todo.shift();
      if (!c) { swatches.dataset.thumbs = t; return; }
      const url = shaderThumb(c.dataset.id as ShaderId, t);
      if (url) c.style.backgroundImage = `url(${url})`;
      thumbJob = requestAnimationFrame(step);
    };
    thumbJob = window.setTimeout(step, 480);  // 等面板滑入动画结束再编译，免得动画卡
  };
  new IntersectionObserver((es) => { thumbsVisible = es.some((e) => e.isIntersecting); if (thumbsVisible) paintThumbs(); }).observe(swatches);
  for (const id of SHADER_IDS) {
    const b = h('button', { type: 'button', class: 'sw-item', role: 'radio', onclick: () => save({ bg: { ...get().bg, mode: 'fixed', shader: id } }) },
      h('span', { class: `sw-chip sw-${id}`, 'data-id': id }), h('span', {}, SHADER_NAMES[id]));
    b.dataset.v = id;
    swatches.append(b);
  }
  // 随机范围：点掉不想随机到的样式（至少留一个）
  const poolBox = h('div', { class: 'pool-chips', role: 'group', 'aria-label': '随机范围' });
  let poolCur: ShaderId[] | null = null;  // 连点时 get() 可能还没收到上一次保存，先用本地值
  const poolOf = () => { const p = poolCur ?? get().bg.pool ?? []; return p.length ? p : SHADER_IDS; };
  const paintPool = () => { const p = poolOf(); poolBox.querySelectorAll<HTMLElement>('button').forEach((b) => b.setAttribute('aria-pressed', String(p.includes(b.dataset.v as ShaderId)))); };
  for (const id of SHADER_IDS) {
    const b = h('button', { type: 'button', class: 'pool-chip', onclick: () => {
      const p = poolOf();
      const next = p.includes(id) ? p.filter((x) => x !== id) : [...p, id];
      if (!next.length) return;
      poolCur = next.length === SHADER_IDS.length ? [] : next;
      save({ bg: { ...get().bg, pool: poolCur } });
      paintPool();
    } }, SHADER_NAMES[id]);
    b.dataset.v = id;
    poolBox.append(b);
  }
  paintPool();
  const intensity = rangeSlider(s0.bg.intensity, (n) => `${Math.round(n * 100)}%`, (v) => save({ bg: { ...get().bg, intensity: v } }), '背景强度');
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true, 'aria-label': '选择背景图片' });
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) { mode.set(get().bg.mode); return; }
    const url = await compressImage(f);
    await chrome.storage.local.set({ [BG_IMAGE_KEY]: url });
    save({ bg: { ...get().bg, mode: 'image' } });
    // 已经是 image 模式时设置对象没变，storage.onChanged 不会触发，背景层得靠这个事件重读（#31）
    dispatchEvent(new CustomEvent('margin:bg-image'));
    say('背景图已更新');
  });
  const upload = h('button', { type: 'button', class: 'ghost small', onclick: () => file.click() }, icon(ICONS.image), h('span', {}, '上传图片'));

  // ── 数据：导出 / 导入设置与足迹（JSON 文件，只在本机处理） ──
  const exportData = async () => {
    const v = await chrome.storage.local.get(ACTIVITY_KEY);
    const data = { app: 'margin', format: 1, version: chrome.runtime.getManifest().version, exportedAt: new Date().toISOString(), settings: get(), activity: v[ACTIVITY_KEY] ?? {} };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `margin-backup-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    say(`已导出设置和 ${Object.keys(data.activity).length} 天足迹`);
  };
  const json = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, 'aria-label': '选择要导入的备份文件' });
  json.addEventListener('change', async () => {
    const f = json.files?.[0];
    json.value = '';
    if (!f) return;
    let raw: Record<string, unknown>;
    try {
      if (f.size > 5e6) throw new Error('文件太大');
      raw = JSON.parse(await f.text());
      if (!raw || typeof raw !== 'object' || raw.app !== 'margin') throw new Error('不是映间导出的备份文件');
    } catch (e) { say(`导入失败：${(e as Error).message || '文件格式不对'}`); return; }
    const settings = raw.settings === undefined ? null : sanitizeSettings(raw.settings);
    const activity = raw.activity === undefined ? null : sanitizeActivity(raw.activity);
    if (!settings && !activity) { say('导入失败：备份里没有可用的设置或足迹'); return; }
    const days = activity ? Object.keys(activity).length : 0;
    const parts = [settings ? '用备份覆盖当前设置（主题、背景、过滤）' : '', days ? `合并 ${days} 天足迹（同一天取较长时长、较早首次打开）` : ''].filter(Boolean);
    const when = typeof raw.exportedAt === 'string' ? `（${raw.exportedAt.slice(0, 10)} 导出）` : '';
    if (!confirm(`导入映间备份${when}：\n· ${parts.join('\n· ')}\n\n继续吗？`)) return;
    if (activity && days) await chrome.runtime.sendMessage({ margin: 'fp', op: 'import', days: activity } satisfies FpMessage);
    if (settings) await replaceSettings(settings);
    say(`已导入${settings ? '设置' : ''}${settings && days ? '和' : ''}${days ? ` ${days} 天足迹` : ''}`);
  });
  const exportBtn = h('button', { type: 'button', class: 'ghost small', onclick: exportData }, h('span', {}, '导出'));
  const importBtn = h('button', { type: 'button', class: 'ghost small', onclick: () => json.click() }, h('span', {}, '导入'));


  /* ---------- 实验功能：App 推荐流（v0.48） ---------- */
  const appT = toggle(s0.appFeed, 'App 推荐流', (v) => save({ appFeed: v }));
  const rankT = toggle(s0.rerank, 'X 式重排', (v) => save({ rerank: v }));
  const appStat = h('small', { class: 'af-stat' }, '…');
  const appQrBox = h('div', { class: 'af-qr', hidden: true });
  const appQrNote = h('small', { class: 'af-note' });
  const appBtn = h('button', { type: 'button', class: 'ghost small' }, h('span', {}, '扫码授权')) as HTMLButtonElement;
  const appOff = h('button', { type: 'button', class: 'ghost small', hidden: true }, h('span', {}, '取消授权')) as HTMLButtonElement;
  let pollT = 0;
  let authed = false;
  const stopPoll = () => { window.clearTimeout(pollT); pollT = 0; };
  const paintApp = async () => {
    const st = await appState().catch(() => null);
    authed = !!st?.authed;
    appStat.textContent = authed ? `已授权 · UID ${st!.mid}${st!.exp ? ` · ${new Date(st!.exp * 1000).toLocaleDateString()} 到期` : ''}` : '未授权：推荐来自 App，但不是你的个性化推荐';
    appBtn.querySelector('span')!.textContent = authed ? '重新扫码' : '扫码授权';
    appOff.hidden = !authed;
    drawers.forEach((f) => f());
  };
  const drawQr = (text: string) => import('qrcode-generator').then(({ default: qrcode }) => {
    const q = qrcode(0, 'M'); q.addData(text); q.make();
    const n = q.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    const svg = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges" role="img" aria-label="授权二维码"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#111"/></svg>`, 'image/svg+xml').documentElement;
    appQrBox.replaceChildren(document.importNode(svg, true));
  });
  appBtn.onclick = async () => {
    stopPoll();
    appBtn.disabled = true;
    const r = await appQr().catch((e) => ({ ok: false, error: String(e) } as { ok: boolean; url?: string; code?: string; error?: string }));
    appBtn.disabled = false;
    if (!r.ok || !r.url || !r.code) { say(`拿不到二维码：${r.error || '网络错误'}`); return; }
    await drawQr(r.url);
    appQrBox.hidden = false;
    appQrNote.textContent = '用手机 B 站 App 扫一扫，在手机上点「确认登录」';
    const code = r.code;
    const started = Date.now();
    const tick = async () => {
      if (!sheet.el.isConnected || Date.now() - started > 180_000) { appQrBox.hidden = true; appQrNote.textContent = '二维码已过期，再点一次「扫码授权」'; return; }
      const p = await appPoll(code).catch(() => null);
      if (p?.state === 'done') { appQrBox.hidden = true; appQrNote.textContent = ''; say('授权好了，推荐换成你手机上的那套'); if (!get().appFeed) await save({ appFeed: true }); await paintApp(); return; }
      if (p?.state === 'expired') { appQrBox.hidden = true; appQrNote.textContent = '二维码已过期，再点一次「扫码授权」'; return; }
      if (p?.state === 'scanned') appQrNote.textContent = '已扫码，请在手机上确认';
      pollT = window.setTimeout(tick, 2000);
    };
    pollT = window.setTimeout(tick, 2000);
  };
  appOff.onclick = async () => { stopPoll(); await appRevoke(); say('已取消授权，本机的授权凭证已删除'); await paintApp(); };
  paintApp();

  /**
   * 抽屉（v0.47.4，用户：非必要的设置收进抽屉）：标题行 + 当前值摘要 + 箭头，点开后高度用 grid 0fr→1fr 过渡，
   * 不读布局；收起时内容 inert，不进 Tab 顺序。参考 21st「Accordion」(coss.com) 与「Disclosure」(hero_ui) 的结构与键盘行为，原生重写。
   */
  const drawers: (() => void)[] = [];
  const drawer = (title: string, sum: () => string, ...kids: (Node | null)[]) => {
    const id = `sd-${drawers.length}`;
    const note = h('small', { class: 'sd-sum' });
    const inner = h('div', { class: 'sd-in' }, ...kids.filter(Boolean) as Node[]);
    const panel = h('div', { class: 'sd-panel', id, role: 'region' }, inner);
    const btn = h('button', { type: 'button', class: 'sd-head', 'aria-expanded': 'false', 'aria-controls': id },
      h('span', { class: 'sd-t' }, title), note, h('span', { class: 'sd-chev', 'aria-hidden': 'true' })) as HTMLButtonElement;
    btn.querySelector('.sd-chev')!.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const set = (open: boolean) => { btn.setAttribute('aria-expanded', String(open)); wrap.toggleAttribute('data-open', open); inner.toggleAttribute('inert', !open); };
    btn.onclick = () => set(btn.getAttribute('aria-expanded') !== 'true');
    const wrap = h('div', { class: 'sd' }, btn, panel);
    const paint = () => { note.textContent = sum(); };
    drawers.push(paint); paint(); set(false);
    return wrap;
  };
  sheet.body.append(
    h('section', { class: 'group' }, h('h3', {}, '外观'),
      block('明暗', null, theme),
      row('封面悬停预览', '鼠标停留半秒后静音播放', preview),
      row('减少动画', '暂停背景、天气和悬停动画，并减少界面过渡；系统减少动态效果始终生效', reduceM),
      row('其他页面重设计', '播放页、搜索页、空间、动态等，只换外观不改功能', watch),
      drawer('字体与缩放', () => { const st = get(); return [st.titleFont === 'sans' ? '无衬线标题' : '衬线标题', st.bodyFont || '', st.zoom !== 100 ? `${st.zoom}%` : ''].filter(Boolean).join(' · '); },
        block('标题字体', '页面标题和大号文字用衬线（宋体）还是无衬线（黑体）', fontS),
        block('正文字体', '填本机已经装好的字体名；标题选「无衬线」时标题也用它。留空 = 映间默认', fontBox),
        row('数字用等宽字体', '播放量、时间、UID 这些小字；关掉后和正文字体一致', monoT),
        block('内容缩放', '字太小时放大首页、空间、消息、历史、动态的内容区；播放页和搜索页用浏览器缩放（Ctrl +）', zoomS),
        block('评论字号', '视频和动态评论区的正文大小（px）', cfsS)),
      drawer('布局与细节', () => { const st = get(); return [st.cols ? `每行 ${st.cols} 个` : '每行自动', st.radius === 0 ? '直角' : st.radius === 50 ? '小圆角' : st.radius === 150 ? '大圆角' : ''].filter(Boolean).join(' · '); },
        block('圆角', '卡片、按钮、面板的圆角大小；头像这类圆形不受影响', radS),
        block('首页每行视频', '自动按窗口宽度排 6–8 个；也可以固定 4 / 5 / 6 个，卡片更大', cols),
        row('开场动画', '每次打开浏览器后第一次进首页播放，点一下可跳过', intro),
        row('收藏夹直接展开', '点收藏夹直接列出全部视频，不再先弹出最近 4 个', favD),
        row('账号卡片可拖拽', '关掉后头像下的卡片固定挂着，不能甩动，点一下仍可翻面', idD))),
    h('section', { class: 'group' }, h('h3', {}, '顶栏'),
      row('Ctrl+K 打开命令面板', 'B 站自己没有 Ctrl+K；和浏览器或其他扩展冲突时关掉，按 / 照样能打开', cmdKT),
      row('悬停展开文字', '鼠标移到顶栏图标上就展开名字；关掉后只在点击时展开', hoverT),
      drawer('顶栏入口', () => { const n = get().headHide.length; return n ? `已隐藏 ${n} 个` : '全部显示'; },
        h('p', { class: 'sd-note' }, '关掉的入口不在顶栏显示；YouTube 模式下这些入口在左侧导航里隐藏 / 排序。B 站入口可以用箭头调顺序。「设置」始终保留'), headList, h('div', { class: 'hl-foot' }, headReset))),
    h('section', { class: 'group' }, h('h3', {}, '播放页'),
      row('宽屏模式', '有播放器时自动进入宽屏；番剧、列表和稍后再看等页面同样生效；和自动网页全屏同时开启时优先网页全屏', wideT),
      row('自动网页全屏', '有播放器的页面打开后自动铺满浏览器窗口，按 Esc 退出', autoW),
      row('网页全屏时可滚动', '网页全屏下往下滚就能看评论，播放器跟着滚走', webS),
      row('倍速快捷键', 'X 减速、C 加速（每次 0.1×），Z 在当前倍速和 1× 之间切换', spdK),
      row('楼中楼对话树', '展开的楼中楼按「谁回复谁」缩进排列，用细线连起来，最多缩进三层', treeT),
      drawer('视频 CDN 节点', () => CDNS.find(([x]) => x === get().cdn)?.[1] ?? 'B 站默认',
        h('p', { class: 'sd-note' }, '卡顿或加载慢时换一个节点试试；测的是连接延迟，数字越小越好。新打开的视频生效'), cdnList, h('div', { class: 'hl-foot' }, cdnTest))),
    h('section', { class: 'group' }, h('h3', {}, '通知'),
      row('消息提醒', '关闭后顶栏不再显示消息未读数，动态角标不受影响', msgT)),
    h('section', { class: 'group' }, h('h3', {}, '首页组件'),
      row('搜索框', '关掉后用顶栏的小搜索框', searchT),
      row('日期栏', '推荐上方的日期和「For You」', dateT),
      row('换一批按钮', null, refreshT),
      row('点击分类标签刷新列表', null, tabRefreshT),
      row('足迹热力图', '关掉只是不显示，足迹照样在本机记录', foot),
      row('天气', '关掉后不再请求天气和城市定位', wxT),
      drawer('天气城市与卡片信息', () => { const l = savedLoc(); return l?.manual ? l.name : '自动定位'; },
        block('天气城市', 'IP 定位不准时手动选一个；留空 = 自动定位', cityBox),
        block('卡片信息', '首页视频卡片下面显示哪些，点一下开关', cardBits)),
      block('版块顺序', '上移 / 下移调整首页版块；修改后立即生效', orderBox)),
    h('section', { class: 'group' }, h('h3', {}, '背景'),
      block('模式', '随机：每次打开换一款，不连续重复', mode),
      block('样式', null, swatches),
      drawer('随机范围', () => { const n = get().bg.pool?.length ?? 0; return n ? `${n} / ${SHADER_IDS.length} 款` : '全部'; },
        h('p', { class: 'sd-note' }, '随机模式只在点亮的样式里挑；太花的点掉就不会再随机到'), poolBox),
      drawer('强度与自定义图片', () => '',
        block('强度', null, intensity),
        h('div', { class: 'row' }, h('div', { class: 'row-label' }, h('span', {}, '自定义图片'), h('small', {}, '压缩后只保存在本机')), upload, file))),
    h('section', { class: 'group' }, h('h3', {}, '内容过滤'),
      block('屏蔽关键词', '标题或视频标签包含即隐藏（首页、搜索、播放页推荐、动态等全站生效）', kw),
      block('屏蔽 UP 主', '卡片右上角也能一键屏蔽', ups),
      drawer('播放量与时长', () => '',
        block('最低播放量', null, views),
        block('最短时长', null, dur)),
      row('隐藏广告', '隐藏播放页、搜索页、热门排行和番剧页的推广内容', adsT)),
    h('section', { class: 'group' }, h('h3', {}, '实验功能'),
      row('App 推荐流', '首页「推荐」改用手机 App 的推荐；关掉就是网页版原来的推荐', appT),
      drawer('App 授权', () => (authed ? '已授权' : '未授权'),
        h('p', { class: 'sd-note' }, '用 B 站 App 扫一次码，推荐就和你手机上一样。授权凭证只存在本机，随时可以取消'),
        h('div', { class: 'af-row' }, appStat, h('div', { class: 'data-acts' }, appBtn, appOff)), appQrBox, appQrNote),
      row('X 式重排', '按你的观看历史重新排：常看完的 UP 往前，秒退和「不感兴趣」的往后，混入关注的人 48 小时内的新稿，看过的不再出现。只在本机计算，可和 App 推荐流一起用', rankT)),
    h('section', { class: 'group' }, h('h3', {}, '数据'),
      h('div', { class: 'row' }, h('div', { class: 'row-label' }, h('span', {}, '备份与迁移'), h('small', {}, '设置和足迹导出成 JSON 文件；不含自定义背景图片')),
        h('div', { class: 'data-acts' }, exportBtn, importBtn), json)),
  );

  return {
    sheet,
    sync(s) {
      poolCur = null;
      drawers.forEach((f) => f());
      paintPool();
      theme.set(s.theme);
      preview.setAttribute('aria-checked', String(s.hoverPreview));
      intro.setAttribute('aria-checked', String(s.intro));
      reduceM.setAttribute('aria-checked', String(s.reduceMotion));
      appT.setAttribute('aria-checked', String(s.appFeed));
      rankT.setAttribute('aria-checked', String(s.rerank));
      watch.setAttribute('aria-checked', String(s.watch));
      foot.setAttribute('aria-checked', String(s.footprint));
      wxT.setAttribute('aria-checked', String(s.weather));
      searchT.setAttribute('aria-checked', String(!s.homeHide.includes('search')));
      dateT.setAttribute('aria-checked', String(!s.homeHide.includes('date')));
      refreshT.setAttribute('aria-checked', String(!s.homeHide.includes('refresh')));
      tabRefreshT.setAttribute('aria-checked', String(s.tabRefresh));
      cardBits.set(shownCard(s.homeHide));
      order = normalizeHomeOrder(s.homeOrder);
      paintOrder();
      favD.setAttribute('aria-checked', String(s.favDirect));
      wideT.setAttribute('aria-checked', String(s.wide));
      autoW.setAttribute('aria-checked', String(s.autoWeb));
      webS.setAttribute('aria-checked', String(s.webScroll));
      spdK.setAttribute('aria-checked', String(s.speedKeys));
      treeT.setAttribute('aria-checked', String(s.replyTree));
      msgT.setAttribute('aria-checked', String(s.msgRemind));
      adsT.setAttribute('aria-checked', String(s.hideAds));
      cols.set(String(s.cols));
      fontS.set(s.titleFont);
      monoT.setAttribute('aria-checked', String(s.monoNum));
      zoomS.set(String(s.zoom));
      radS.set(String(s.radius));
      cfsS.set(String(s.commentSize));
      hoverT.setAttribute('aria-checked', String(s.headHover));
      cmdKT.setAttribute('aria-checked', String(s.cmdK));
      paintCdn();
      paintHead();
      if (!fontIn.matches(':focus')) fontIn.value = s.bodyFont;
      idD.setAttribute('aria-checked', String(s.idDrag));
      kw.set(s.filters.keywords);
      ups.set(s.filters.ups);
      mode.set(s.bg.mode);
      paintSwatches();
    },
  };
}
