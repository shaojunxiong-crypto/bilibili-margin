/* eslint-disable @typescript-eslint/no-explicit-any */
const https = (u: unknown) => String(u ?? '').replace(/^\/\//, 'https://').replace(/^http:/, 'https:');
const BASE = { build: '0', mobi_app: 'web' };

/** 跨标签页「消息已读」信号。顶栏消息入口是 target=_blank，页内 CustomEvent 传不过去，
 *  消息在另一个标签页被读掉后，原页面的角标只能等 2 分钟轮询——借 chrome.storage.onChanged 广播。 */
const MSG_READ_KEY = 'margin:msg-read';
let lastMark = 0;
/** 消息页有未读被清零时调用（10 秒节流，轮询/首屏补拉不会反复写） */
export function markMsgRead(): void {
  const now = Date.now();
  if (now - lastMark < 10_000) return;
  lastMark = now;
  void chrome.storage.local.set({ [MSG_READ_KEY]: now + Math.random() }).catch(() => {});
}
/** 收到已读信号：立刻重拉一次，1.5 秒后再拉一次（B 站服务端落库有延迟，两次覆盖竞态） */
export function onMsgRead(cb: () => void): void {
  let t = 0;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[MSG_READ_KEY]) return;
    clearTimeout(t);
    cb();
    t = window.setTimeout(cb, 1500);
  });
}

async function get<T>(url: string, params: Record<string, string | number> = {}): Promise<T> {
  // _t 时间戳打散 URL：实测 msgfeed 的响应会被某层按 URL 为 key 的缓存（TTL 约半小时）冻住，
  // cache: 'no-cache' 的重新验证会被 304 糊弄回去，同 URL 21 秒内两次都吐同一份 29 分钟前的旧数据。
  // 每次请求 URL 都不同，任何缓存层都无从匹配，只能回源。
  const q = new URLSearchParams({ ...BASE, _t: String(Date.now()), ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  const r = await fetch(`${url}?${q}`, { credentials: 'include', cache: 'no-cache' });
  const j = await r.json();
  if (j.code !== 0) throw new Error(j.message || j.msg || `code ${j.code}`);
  return j.data as T;
}

export interface Person { mid: number; name: string; face: string }
export interface Notice {
  id: number; kind: 'reply' | 'at' | 'like' | 'system';
  users: Person[]; more: number; time: number;
  verb: string; content: string; quote: string; title: string; image: string; url: string;
}
export interface Page { list: Notice[]; cursor: { id: number; time: number } | null; top?: string }
export interface Unread { reply: number; at: number; like: number; system: number; chat: number }

/**
 * 通知跳转链接：B 站 msgfeed 的 uri 现在返回裸链接（不再拼 #reply 锚点），点过去定位不到那条评论。
 * rpid 从两处兜底取：① item 的 id 字段（source_id=对方的新评论，target_id / root_id=我的评论）；
 * ② native_uri 的 comment_secondary_id / comment_root_id 参数（like 接口的 id 字段已被删光，rpid 只在这里）。
 * 已带锚点的链接和非主站链接原样返回。
 */
function jumpUrl(kind: 'reply' | 'at' | 'like', item: any): string {
  const u = https(item?.uri);
  if (!u || !/^https:\/\/www\.bilibili\.com\//.test(u) || /#reply\d+/.test(u)) return u;
  const n = String(item?.native_uri ?? '');
  const ids = kind === 'like' ? [] : [item.source_id, item.target_id, item.root_id];
  const rpid = [...ids.map(Number), Number(/comment_secondary_id=(\d+)/.exec(n)?.[1]), Number(/comment_root_id=(\d+)/.exec(n)?.[1])]
    .find((x) => Number.isInteger(x) && x > 0) ?? 0;
  return rpid ? `${u}#reply${rpid}` : u;
}

const person = (u: any): Person => ({ mid: u?.mid ?? 0, name: u?.nickname ?? u?.name ?? '', face: https(u?.avatar ?? u?.face) });
const VERB: Record<string, string> = { video: '视频', reply: '评论', dynamic: '动态', article: '专栏', album: '动态' };

export async function unread(): Promise<Unread> {
  const [a, b] = await Promise.all([
    // v0.48：和 B 站网页顶栏用同一个新接口（旧接口偶尔会多算一条已经读掉的系统通知，B 站评论反馈「永远剩一个」）
    get<any>('https://api.vc.bilibili.com/x/im/web/msgfeed/unread', { build: 0, mobi_app: 'web' })
      .catch(() => get<any>('https://api.bilibili.com/x/msgfeed/unread')),
    get<any>('https://api.vc.bilibili.com/session_svr/v1/session_svr/single_unread', { unread_type: 0, show_unfollow_list: 1, show_dustbin: 1 }),
  ]);
  return { reply: a.reply ?? 0, at: a.at ?? 0, like: a.like ?? 0, system: a.sys_msg ?? 0, chat: (b.follow_unread ?? 0) + (b.unfollow_unread ?? 0) };
}

export async function replies(c: Page['cursor']): Promise<Page> {
  const d = await get<any>('https://api.bilibili.com/x/msgfeed/reply', c ? { id: c.id, reply_time: c.time, platform: 'web' } : { platform: 'web' });
  return {
    list: (d.items ?? []).map((x: any): Notice => ({
      id: x.id, kind: 'reply', users: [person(x.user)], more: 0, time: x.reply_time,
      verb: `回复了我的${VERB[x.item?.type] ?? '内容'}`, content: x.item?.source_content ?? '',
      quote: x.item?.target_reply_content || x.item?.root_reply_content || x.item?.title || '',
      title: x.item?.title ?? '', image: https(x.item?.image), url: jumpUrl('reply', x.item),
    })),
    cursor: d.cursor && !d.cursor.is_end ? { id: d.cursor.id, time: d.cursor.time } : null,
  };
}

export async function ats(c: Page['cursor']): Promise<Page> {
  const d = await get<any>('https://api.bilibili.com/x/msgfeed/at', { platform:'web', ...(c ? { id:c.id,at_time:c.time } : {}) });
  return {
    list: (d.items ?? []).map((x: any): Notice => ({
      id: x.id, kind: 'at', users: [person(x.user)], more: 0, time: x.at_time,
      verb: `在${VERB[x.item?.type] ?? '内容'}中 @ 了我`, content: x.item?.source_content ?? '', quote: x.item?.title ?? '',
      title: x.item?.title ?? '', image: https(x.item?.image), url: jumpUrl('at', x.item),
    })),
    cursor: d.cursor && !d.cursor.is_end ? { id: d.cursor.id, time: d.cursor.time } : null,
  };
}

export async function likes(c: Page['cursor']): Promise<Page> {
  const d = await get<any>('https://api.bilibili.com/x/msgfeed/like', { platform:'web', ...(c ? { id:c.id,like_time:c.time } : {}) });
  const t = d.total ?? {};
  return {
    list: (t.items ?? []).map((x: any): Notice => ({
      id: x.id, kind: 'like', users: (x.users ?? []).map(person), more: Math.max(0, (x.counts ?? 0) - (x.users ?? []).length), time: x.like_time,
      verb: `赞了我的${VERB[x.item?.type] ?? '内容'}`, content: '', quote: x.item?.title ?? '',
      title: x.item?.title ?? '', image: https(x.item?.image), url: jumpUrl('like', x.item),
    })),
    cursor: t.cursor && !t.cursor.is_end ? { id: t.cursor.id, time: t.cursor.time } : null,
  };
}

/** 系统通知正文：保留 B 站的 #{文字}{"链接"} 写法（界面里渲染成可点链接）；全站公告的 content 是 {"web": "..."} */
function noticeText(raw: unknown): string {
  let t = String(raw ?? '');
  if (t.startsWith('{')) { try { const j = JSON.parse(t); t = String(j.web ?? j.content ?? j.text ?? t); } catch { /* 原样 */ } }
  return t;
}

function latestSystemCursor(items: any[]): string {
  return items.reduce((max, x) => { const cursor = String(x?.cursor ?? '0'); return /^\d+$/.test(cursor) && BigInt(cursor) > BigInt(max) ? cursor : max; }, '0');
}

export async function system(csrf: string, c: Page['cursor']): Promise<Page> {
  // v0.49：B 站消息中心同时拉「个人通知」和「全站公告」（隐私政策修订等）两个接口，以前只拉了前一个，会漏（B 站评论反馈）
  const [d, u] = await Promise.all([
    get<any>('https://message.bilibili.com/x/sys-msg/query_user_notify', { csrf, page_size: 20, ...(c ? { cursor: c.id } : {}) }),
    c ? Promise.resolve(null) : get<any>('https://message.bilibili.com/x/sys-msg/query_unified_notify', { csrf, page_size: 10 }).catch(() => null),
  ]);
  const conv = (x: any, uni: boolean): Notice => ({
    id: x.id, kind: 'system', users: [], more: 0, time: Date.parse(String(x.time_at).replace(' ', 'T') + '+08:00') / 1000 || 0,
    verb: uni ? 'unified' : '', content: noticeText(x.content), quote: '', title: x.title ?? '', image: '', url: https(x.card_link || ''),
  });
  const own: Notice[] = (d.system_notify_list ?? []).map((x: any) => conv(x, false));
  const last = own[own.length - 1];
  const cursor = own.length >= 20 && last ? { id: last.id, time: last.time } : null;
  let list = own;
  if (u?.system_notify_list?.length) {
    // 只并入落在这一页时间范围内的公告（更早的留到翻到那一页之前一并显示，避免插到最前面）
    const floor = cursor ? last.time : 0;
    list = [...own, ...u.system_notify_list.map((x: any) => conv(x, true)).filter((n: Notice) => n.time >= floor)].sort((a, b) => b.time - a.time);
  }
  return { list, cursor, top: latestSystemCursor([...(d.system_notify_list ?? []),...(u?.system_notify_list ?? [])]) };
}

/** 系统通知标为已读（v0.46，与 B 站消息中心同一个接口：把已读游标推到最新一条） */
export async function systemRead(cursor: string, csrf: string): Promise<void> {
  if (cursor && cursor !== '0') await get('https://message.bilibili.com/x/sys-msg/update_cursor', { cursor, has_up: 0, csrf });
}

/** 私信会话标为已读（v0.46）：B 站网页版打开会话时发的 update_ack */
export async function ackSession(talker: number, seq: number, csrf: string): Promise<void> {
  const body = new URLSearchParams({ talker_id: String(talker), session_type: '1', ack_seqno: String(seq), build: '0', mobi_app: 'web', csrf_token: csrf, csrf });
  const response = await fetch('https://api.vc.bilibili.com/session_svr/v1/session_svr/update_ack', { method: 'POST', credentials: 'include', body });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const result = await response.json();
  if (result.code !== 0) throw new Error(result.message || result.msg || `code ${result.code}`);
}

// ---- 私信 ----
export interface Session { talker: number; unread: number; last: string; ts: number; maxSeq?: number; person?: Person }
export interface MsgCard { title: string; desc: string; cover: string; url: string; rows: [string, string][]; action: string }
export interface Msg { sender: number; type: number; text: string; image: string; ts: number; key: string; seq: number; card?: MsgCard; emotes?: MessageEmote[] }
export interface MessageEmote { text: string; url: string }
export interface EmotePack { id: number; name: string; emotes: MessageEmote[] }
export interface MessageImage { url: string; width: number; height: number; imageType: string; original: number; size: number }

/* #2：私信里的卡片 / 通知 / 分享等特殊类型以前只显示标题，现在拆成卡片（标题、正文、封面、明细行、跳转） */
const VIDEO_URL = (c: any) => (c.bvid ? `https://www.bilibili.com/video/${c.bvid}` : c.id && c.source === 5 ? `https://www.bilibili.com/video/av${c.id}` : '');
/** 系统提示（msg_type 18）：content 可能是 [{text,color_day,...}] 数组或其 JSON 字符串（B 站评论反馈：以前原样显示成一串 JSON） */
function tipText(c: any): string {
  let v = c;
  if (v && !Array.isArray(v) && typeof v === 'object') v = v.content ?? v.text ?? '';
  if (typeof v === 'string' && v.trim().startsWith('[')) { try { v = JSON.parse(v); } catch { /* 原样 */ } }
  const t = Array.isArray(v) ? v.map((x: any) => String(x?.text ?? '')).join('') : String(v ?? '');
  return t.replace(/#\{([^}]*)\}\{[^}]*\}/g, '$1');
}
export function msgText(type: number, raw: string): { text: string; image: string; card?: MsgCard } {
  let c: any = {};
  try { c = JSON.parse(raw); } catch { return { text: raw, image: '' }; }
  if (type === 1) return { text: c.content ?? '', image: '' };
  if (type === 2) return { text: '', image: https(c.url) };
  if (type === 5) return { text: '撤回了一条消息', image: '' };
  if (type === 6) return { text: '', image: https(c.url) };
  if (type === 18 || Array.isArray(c)) return { text: tipText(c), image: '' };
  const rows: [string, string][] = Array.isArray(c.modules) ? c.modules.map((m: any) => [String(m.title ?? ''), String(m.detail ?? m.text ?? '')] as [string, string]).filter((r: [string, string]) => r[0] || r[1]) : [];
  const card: MsgCard = {
    title: String(c.title ?? c.main_title ?? c.name ?? ''),
    desc: String(c.text ?? c.summary ?? c.desc ?? c.sub_title ?? c.content ?? c.author ?? '').replace(/#\{([^}]*)\}\{[^}]*\}/g, '$1'),
    cover: https(c.cover ?? c.thumb ?? c.pic_url ?? c.image_urls?.[0] ?? ''),
    url: https(c.jump_uri ?? c.jump_url ?? c.url ?? c.uri ?? VIDEO_URL(c)),
    rows, action: String(c.jump_text ?? c.jump_text_2 ?? ''),
  };
  if (!card.title && !card.desc && !card.cover) return { text: '[暂不支持的消息类型]', image: '' };
  return { text: '', image: '', card };
}

export interface SessionPage { list: Session[]; more: boolean; endTs: number }
/** 私信会话一页 20 个（v0.49：以前只拉第一页，后面的会话看不到、未读也清不掉，顶栏红点一直在；B 站评论反馈） */
export async function sessions(endTs = 0): Promise<SessionPage> {
  const d = await get<any>('https://api.vc.bilibili.com/session_svr/v1/session_svr/get_sessions', { session_type: 1, group_fold: 1, unfollow_fold: 0, sort_rule: 2, ...(endTs ? { end_ts: endTs } : {}) });
  const raw: any[] = d.session_list ?? [];
  const list: Session[] = raw.filter((s: any) => s.session_type === 1).map((s: any) => ({
    talker: s.talker_id, unread: s.unread_count ?? 0, ts: s.session_ts ? Math.floor(s.session_ts / 1e6) : s.last_msg?.timestamp ?? 0, maxSeq: Number(s.max_seqno) || 0,
    last: s.last_msg ? (() => { const t = msgText(s.last_msg.msg_type, s.last_msg.content); return t.text || (t.card ? `[卡片] ${t.card.title || t.card.desc}` : '[图片]'); })() : '',
    person: s.account_info?.name ? { mid: s.talker_id, name: String(s.account_info.name), face: https(s.account_info.pic_url ?? '') } as Person : s.talker_id === 0 ? { mid: 0, name: '系统提示', face: '' } as Person : undefined,
  }));
  const lastTs = raw.length ? Number(raw[raw.length - 1].session_ts) || 0 : 0;
  return { list, more: !!d.has_more && !!lastTs, endTs: lastTs };
}

const peopleCache = new Map<number, Person>();
/** 资料分批补齐，不阻塞会话与聊天；缓存只留在当前页面内存。 */
export async function fillPeople(list: Session[], onUpdate?: () => void): Promise<void> {
  const apply = () => {
    let changed = false;
    list.forEach(s => { const p = peopleCache.get(s.talker); if (!s.person && p?.name) { s.person = p; changed = true; } });
    if (changed) onUpdate?.();
  };
  apply();
  const need = list.filter((s) => !s.person && s.talker).map((s) => s.talker);
  if (!need.length) return;
  const cards = await get<any[]>('https://api.vc.bilibili.com/account/v1/user/cards', { uids: need.slice(0, 50).join(',') }).catch(() => []);
  for (const c of Array.isArray(cards) ? cards : []) { const p = person(c); if (p.name) peopleCache.set(p.mid, p); }
  apply();
  const miss = need.filter((m) => !peopleCache.get(m)?.name).slice(0, 10);
  await Promise.all(miss.map(async (mid) => {
    const c = await get<any>('https://api.bilibili.com/x/web-interface/card', { mid }).catch(() => null);
    if (c?.card?.name) { peopleCache.set(mid, { mid, name: String(c.card.name), face: https(c.card.face ?? '') }); apply(); }
  }));
}

/** 翻完会话分页，只在 update_ack 成功后累计；游标停滞时报告未完成。 */
export async function readAllSessions(csrf: string, onProgress?: (n: number) => void): Promise<number> {
  let endTs = 0, done = 0;
  for (;;) {
    const d = await get<any>('https://api.vc.bilibili.com/session_svr/v1/session_svr/get_sessions', { session_type: 1, group_fold: 1, unfollow_fold: 0, sort_rule: 2, ...(endTs ? { end_ts: endTs } : {}) });
    const raw: any[] = d.session_list ?? [];
    for (const s of raw) {
      if (s.session_type !== 1 || !s.unread_count || !s.max_seqno) continue;
      await ackSession(s.talker_id, Number(s.max_seqno), csrf);
      done++;
      onProgress?.(done);
    }
    if (!d.has_more) break;
    const next = raw.length ? Number(raw[raw.length - 1].session_ts) || 0 : 0;
    if (!next || next === endTs) throw new Error('会话列表未完成，请稍后重试');
    endTs = next;
  }
  return done;
}

/** 按原生消息中心的读取协议处理五类未读；失败类别由界面保留并提示。 */
export async function readAllMessages(csrf: string): Promise<(keyof Unread)[]> {
  const tasks: [keyof Unread, Promise<unknown>][] = [
    ['reply',replies(null)], ['at',ats(null)], ['like',likes(null)], ['chat',readAllSessions(csrf)],
    ['system',Promise.all([
      get<any>('https://message.bilibili.com/x/sys-msg/query_user_notify', { csrf,page_size:20 }),
      get<any>('https://message.bilibili.com/x/sys-msg/query_unified_notify', { csrf,page_size:10 }),
    ]).then(([own,unified]) => systemRead(latestSystemCursor([...(own.system_notify_list ?? []),...(unified.system_notify_list ?? [])]),csrf))],
  ];
  const results = await Promise.allSettled(tasks.map(([,task]) => task));
  return tasks.filter((_,i) => results[i].status === 'rejected').map(([key]) => key);
}

export async function messages(talker: number): Promise<Msg[]> {
  const d = await get<any>('https://api.vc.bilibili.com/svr_sync/v1/svr_sync/fetch_session_msgs', { talker_id: talker, session_type: 1, size: 30 });
  const emotes = (d.e_infos ?? []).map((e: any): MessageEmote => ({ text: String(e.text ?? ''), url: https(e.gif_url || e.uri || '') })).filter((e: MessageEmote) => e.text && /^https:\/\//.test(e.url));
  return (d.messages ?? []).map((m: any): Msg => ({ sender: m.sender_uid, type: m.msg_type, ...msgText(m.msg_type, m.content), ts: m.timestamp, key: String(m.msg_key), seq: Number(m.msg_seqno) || 0, emotes })).reverse();
}

/** 原版私信的表情面板也使用 reply 场景，按当前登录账号返回可用表情包。 */
export async function messageEmotes(): Promise<EmotePack[]> {
  const d = await get<any>('https://api.bilibili.com/x/emote/user/panel/web', { business: 'reply' });
  return (d.packages ?? []).map((p: any): EmotePack => ({ id: p.id, name: String(p.text || '表情'),
    emotes: (p.emote ?? []).filter((e: any) => e.flags?.unlocked !== false && e.flags?.unlocked !== 0).map((e: any): MessageEmote => ({ text: String(e.text ?? ''), url: https(e.url) })).filter((e: MessageEmote) => e.text && /^https:\/\//.test(e.url))
  })).filter((p: EmotePack) => p.emotes.length);
}

export function validateMessageImage(file: Pick<File, 'type' | 'size'>): void {
  if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) throw new Error('请选择 JPG、PNG、GIF 或 WebP 图片');
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('图片大小不能超过 20 MB');
  if (file.type === 'image/gif' && file.size > 1024 * 1024) throw new Error('GIF 图片不能超过 1 MB');
}

/** 与原版消息页相同的上传通道；仅在用户点击发送后调用。 */
export async function uploadMessageImage(file: File, csrf: string, signal?: AbortSignal): Promise<MessageImage> {
  validateMessageImage(file);
  const body = new FormData(); body.append('file_up', file); body.append('biz', 'im'); body.append('csrf', csrf); body.append('csrf_token', csrf);
  const response = await fetch('https://api.bilibili.com/x/dynamic/feed/draw/upload_bfs', { method: 'POST', credentials: 'include', body, signal });
  if (!response.ok) throw new Error(`图片上传失败（HTTP ${response.status}）`);
  const j = await response.json();
  if (j.code !== 0) throw new Error(j.message || '图片上传失败');
  const d = j.data, url = https(d?.image_url);
  if (!isMessageImageUrl(url) || !(d?.image_width > 0 && d?.image_height > 0)) throw new Error('图片上传结果不完整，请重试');
  return { url, width: d.image_width, height: d.image_height, imageType: file.type.split('/')[1], original: 1, size: Number.isFinite(d.img_size) ? d.img_size : file.size / 1024 };
}

function isMessageImageUrl(raw: string): boolean {
  try { const u = new URL(raw); return u.protocol === 'https:' && /(^|\.)(biliimg\.com|hdslb\.com)$/.test(u.hostname); } catch { return false; }
}

export function sendText(me: number, to: number, text: string, csrf: string, newFace = false): Promise<boolean> {
  return sendMessage(me, to, 1, { content: text }, csrf, newFace);
}
export function sendImage(me: number, to: number, image: MessageImage, csrf: string): Promise<boolean> {
  if (!isMessageImageUrl(image.url) || !(image.width > 0 && image.height > 0)) throw new Error('图片信息无效，请重新选择');
  return sendMessage(me, to, 2, image, csrf);
}
async function sendMessage(me: number, to: number, type: 1 | 2, content: object, csrf: string, newFace = false): Promise<boolean> {
  const dev = crypto.randomUUID().toUpperCase();
  const body = new URLSearchParams({
    'msg[sender_uid]': String(me), 'msg[receiver_type]': '1', 'msg[receiver_id]': String(to), 'msg[msg_type]': String(type), 'msg[msg_status]': '0',
    'msg[content]': JSON.stringify(content), 'msg[new_face_version]': newFace ? '1' : '0', 'msg[dev_id]': dev, 'msg[timestamp]': String(Math.floor(Date.now() / 1000)),
    from_firework: '0', build: '0', mobi_app: 'web', csrf_token: csrf, csrf,
  });
  const r = await fetch('https://api.vc.bilibili.com/web_im/v1/web_im/send_msg', { method: 'POST', credentials: 'include', body });
  if (!r.ok) return false;
  const j = await r.json().catch(() => ({}));
  return j.code === 0;
}
