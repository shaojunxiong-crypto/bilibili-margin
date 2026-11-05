/* eslint-disable @typescript-eslint/no-explicit-any */
import { getJSON, postForm, postJSON } from './http';

/** 一条动态，抽成渲染需要的最小结构 */
export interface DynText { text: string; emoji?: string }
export interface Dyn {
  id: string; type: string; author: string; face: string; mid: number; ts: number; time: string;
  text: string; richText?: DynText[]; title?: string;
  video?: { bvid: string; title: string; cover: string; dur: string; play: string; desc: string; ad?: boolean };
  pics: string[];
  article?: { title: string; cover: string; desc: string; url: string };
  /** 直播（开播提醒 LIVE_RCMD / 直播间分享 LIVE），#4 */
  live?: { title: string; cover: string; url: string; on: boolean; meta: string };
  /** 其它带卡片的类型（合集、番剧、课程、音乐、通用卡片），统一成链接卡 */
  link?: { title: string; cover: string; desc: string; url: string; kind: string };
  orig?: Dyn | null;
  stat: { comment: number; forward: number; like: number };
  url: string;
  /** v0.50 动态页直接互动：自己是否已赞、评论区 type/oid */
  liked?: boolean; cmtType?: number; cmtOid?: string;
}

const https = (u: unknown) => String(u ?? '').replace(/^\/\//, 'https://').replace(/^http:/, 'https:');

export function toDyn(it: any): Dyn | null {
  if (!it?.modules) return null;
  const m = it.modules, a = m.module_author ?? {}, d = m.module_dynamic ?? {}, s = m.module_stat ?? {};
  const major = d.major ?? {};
  const opus = major.opus;
  const desc = opus?.summary?.text != null ? opus.summary : d.desc;
  const text = (desc?.text ?? '').trim();
  const nodes: DynText[] = (desc?.rich_text_nodes ?? []).map((n: any) => {
    const emoji = https(n.emoji?.icon_url);
    return { text: String(n.text ?? n.orig_text ?? n.emoji?.text ?? ''),
      ...(n.type === 'RICH_TEXT_NODE_TYPE_EMOJI' && /^https:\/\//.test(emoji) ? { emoji } : {}) };
  });
  const out: Dyn = {
    id: it.id_str, type: it.type, author: a.name ?? '', face: https(a.face), mid: a.mid ?? 0, ts: a.pub_ts ?? 0, time: a.pub_time ?? '',
    text, richText: nodes.length && nodes.map((n) => n.text).join('').trim() === text ? nodes : undefined,
    title: opus?.title || undefined, pics: [],
    stat: { comment: s.comment?.count ?? 0, forward: s.forward?.count ?? 0, like: s.like?.count ?? 0 },
    url: `https://www.bilibili.com/opus/${it.id_str}`,
    liked: s.like?.status === true, cmtType: Number(it.basic?.comment_type) || undefined, cmtOid: it.basic?.comment_id_str || undefined,
  };
  if (major.archive) {
    const v = major.archive;
    const ad = v.is_ad === true || Boolean(v.ad_info) || Boolean(v.business_info) || undefined;
    out.video = { bvid: v.bvid, title: v.title, cover: https(v.cover), dur: v.duration_text ?? '', play: v.stat?.play ?? '', desc: v.desc ?? '', ad };
    out.url = `https://www.bilibili.com/video/${v.bvid}`;
    if (!out.cmtType && !out.cmtOid && v.aid) { out.cmtType = 1; out.cmtOid = String(v.aid); }
  }
  if (opus?.pics) out.pics = opus.pics.map((p: any) => https(p.url));
  else if (major.draw?.items) out.pics = major.draw.items.map((p: any) => https(p.src));
  if (major.article) {
    const r = major.article;
    out.article = { title: r.title, cover: https(r.covers?.[0]), desc: r.desc ?? '', url: https(r.jump_url) };
  }
  if (major.live_rcmd) {
    let c: any = {};
    try { c = JSON.parse(major.live_rcmd.content || '{}'); } catch { /* ignore */ }
    const li = c.live_play_info ?? {};
    const url = https(li.link || (li.room_id ? `https://live.bilibili.com/${li.room_id}` : ''));
    out.live = { title: li.title ?? '', cover: https(li.cover), url, on: li.live_status === 1 || c.live_status === 1 || !!li.live_start_time, meta: [li.area_name, li.watched_show?.text_large].filter(Boolean).join(' · ') };
    if (url) out.url = url;
  } else if (major.live) {
    const l = major.live;
    out.live = { title: l.title ?? '', cover: https(l.cover), url: https(l.jump_url), on: l.live_state === 1, meta: [l.desc_first, l.desc_second].filter(Boolean).join(' · ') };
    if (out.live.url) out.url = out.live.url;
  }
  const lk = major.ugc_season ?? major.pgc ?? major.courses ?? major.music ?? major.common;
  if (!out.video && !out.live && !out.article && lk) {
    const kind = major.ugc_season ? '合集' : major.pgc ? '番剧' : major.courses ? '课程' : major.music ? '音乐' : (lk.badge?.text || '');
    out.link = { title: lk.title ?? '', cover: https(lk.cover), desc: lk.desc ?? lk.sub_title ?? lk.label ?? '', url: https(lk.jump_url), kind };
    if (out.link.url) out.url = out.link.url;
  }
  if (it.orig) out.orig = toDyn(it.orig);
  return out;
}

export async function spaceDynamics(mid: number, offset: string): Promise<{ list: Dyn[]; offset: string; more: boolean }> {
  const d = await getJSON<any>('/x/polymer/web-dynamic/v1/feed/space', { host_mid: mid, offset, timezone_offset: -480, features: 'itemOpusStyle' });
  return { list: (d.items ?? []).map(toDyn).filter(Boolean) as Dyn[], offset: d.offset ?? '', more: !!d.has_more };
}

export type FeedType = 'all' | 'video' | 'pgc' | 'article';
/** 关注动态流；hostMid 只看某个 UP */
export async function followFeed(type: FeedType, offset: string, hostMid = 0): Promise<{ list: Dyn[]; offset: string; more: boolean; baseline: string }> {
  const p: Record<string, string | number> = { type, offset, timezone_offset: -480, features: 'itemOpusStyle' };
  if (hostMid) p.host_mid = hostMid;
  const d = await getJSON<any>('/x/polymer/web-dynamic/v1/feed/all', p);
  return { list: (d.items ?? []).map(toDyn).filter(Boolean) as Dyn[], offset: d.offset ?? '', more: !!d.has_more, baseline: d.update_baseline ?? '' };
}

export interface Up { mid: number; name: string; face: string; fresh: boolean }
export interface LiveUp { mid: number; name: string; face: string; title: string; url: string }
/** 顶部「最常访问」头像条 + 正在直播 */
export async function portal(): Promise<{ ups: Up[]; live: LiveUp[]; liveCount: number }> {
  const d = await getJSON<any>('/x/polymer/web-dynamic/v1/portal');
  // v0.49：B 站把 up_list 从 { items } 改成了直接的数组，旧写法拿到空列表，动态页头像条整条消失（B 站评论反馈）
  const rawUps: any[] = Array.isArray(d.up_list) ? d.up_list : (d.up_list?.items ?? []);
  const ups = rawUps.map((u: any) => ({ mid: u.mid, name: u.uname, face: https(u.face), fresh: !!u.has_update }));
  const live = (d.live_users?.items ?? []).map((u: any) => ({ mid: u.mid, name: u.uname, face: https(u.face), title: u.title ?? '', url: https(u.jump_url || `https://live.bilibili.com/${u.room_id}`) }));
  return { ups, live, liveCount: d.live_users?.count ?? live.length };
}

/** #16：关注列表分页（动态页左侧「关注」区用），按最近互动排序 */
export async function followings(me: number, pn: number, ps = 30): Promise<{ list: Up[]; hasMore: boolean; total: number }> {
  const d = await getJSON<any>('/x/relation/followings', { vmid: me, pn, ps, order: 'mtime' });
  const list = (d.list ?? []).map((u: any) => ({ mid: u.mid, name: u.uname, face: https(u.face), fresh: false }));
  return { list, hasMore: list.length >= ps, total: d.total ?? 0 };
}

/** v0.49：在自己的关注里按昵称搜 UP（关注多时头像条翻不完，B 站评论反馈） */
export async function searchFollowing(me: number, name: string): Promise<Up[]> {
  const d = await getJSON<any>('/x/relation/followings/search', { vmid: me, pn: 1, ps: 30, name });
  return (d.list ?? []).map((u: any) => ({ mid: u.mid, name: u.uname, face: https(u.face), fresh: false }));
}

/* ---- v0.50 动态页直接点赞 / 转发 / 评论（B 站评论建议：不用跳详情页）---- */
/** 点赞 / 取消赞，接口同 B 站动态页（bilibili-API-collect：dynamic/action） */
export async function dynLike(id: string, on: boolean): Promise<void> {
  await postJSON('/x/dynamic/feed/dyn/thumb', { dyn_id_str: id, up: on ? 1 : 2, spmid: '333.1365.0.0' });
}
/** 转发（可带一句话）；空文字时和 B 站一样只转发 */
export async function dynRepost(id: string, text: string): Promise<void> {
  await postJSON('/x/dynamic/feed/create/dyn', {
    dyn_req: { content: { contents: text ? [{ raw_text: text, type: 1, biz_id: '' }] : [] }, scene: 4, attach_card: null, meta: { app_meta: { from: 'create.dynamic.web', mobi_app: 'web' } } },
    web_repost_src: { dyn_id_str: id },
  }, { platform: 'web' });
}
/** 列表接口偶尔省略 basic，点开评论时才补详情，不为整页动态预取。 */
export async function dynCommentTarget(d: Dyn): Promise<{ type: number; oid: string } | null> {
  if (d.cmtType && d.cmtOid) return { type: d.cmtType, oid: d.cmtOid };
  const detail = await getJSON<any>('/x/polymer/web-dynamic/v1/detail', { id: d.id });
  const item = toDyn(detail.item);
  if (!item?.cmtType || !item.cmtOid) return null;
  d.cmtType = item.cmtType; d.cmtOid = item.cmtOid;
  return { type: item.cmtType, oid: item.cmtOid };
}

export interface Reply { rpid: number; name: string; face: string; mid: number; text: string; richText?: DynText[]; like: number; ts: number; rcount: number }
/** 热门评论第一页（旧版 /x/v2/reply 不要 wbi 签名） */
export async function dynReplies(type: number, oid: string, ps = 8): Promise<{ list: Reply[]; count: number }> {
  const d = await getJSON<any>('/x/v2/reply', { type, oid, sort: 1, ps, pn: 1 });
  const seen = new Set<number>();
  const list = [...(d.top_replies ?? []), ...(d.upper?.top ? [d.upper.top] : []), ...(d.replies ?? [])].filter((r: any) => !seen.has(r.rpid) && seen.add(r.rpid)).slice(0, ps).map((r: any) => ({
    rpid: r.rpid, name: r.member?.uname ?? '', face: https(r.member?.avatar), mid: Number(r.mid) || 0,
    text: r.content?.message ?? '',
    richText: String(r.content?.message ?? '').split(/(\[[^\]\r\n]+\])/g).filter(Boolean).map((text) => {
      const emoji = https(r.content?.emote?.[text]?.url);
      return { text, ...(/^https:\/\//.test(emoji) ? { emoji } : {}) };
    }),
    like: r.like ?? 0, ts: r.ctime ?? 0, rcount: r.rcount ?? 0,
  }));
  return { list, count: d.page?.acount ?? d.page?.count ?? list.length };
}
export async function dynReply(type: number, oid: string, message: string): Promise<void> {
  await postForm('/x/v2/reply/add', { type, oid, message, plat: 1 });
}
