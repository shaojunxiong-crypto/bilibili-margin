/* eslint-disable @typescript-eslint/no-explicit-any */
import { getJSON, getWbi } from './http';
import type { Video } from './feed';

export interface SpaceInfo {
  mid: number; name: string; face: string; sign: string; level: number;
  banner: string; official: string; vip: string; following: number; follower: number;
  likes: number; views: number; isFollowing: boolean; videoCount: number;
}

/** 直播状态独立加载，资料接口回退或统计请求较慢时也能显示开播入口。 */
export async function spaceLive(mid: number): Promise<number | null> {
  const response = await fetch(`https://api.live.bilibili.com/room/v1/Room/getRoomInfoOld?mid=${mid}`, { credentials: 'omit' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const { code, data, message } = await response.json();
  if (code !== 0) throw new Error(message || `code ${code}`);
  const room = Number(data?.roomid);
  return Number(data?.liveStatus) === 1 && Number.isSafeInteger(room) && room > 0 ? room : null;
}

/** 图片地址补全：// 开头、http:、以及 acc/info 老字段 top_photo 那种不带域名的 bfs/space/xxx.png（v0.47：空间头图不显示） */
const https = (u: unknown) => {
  const s = String(u ?? '').trim();
  if (!s) return '';
  if (/^bfs\//.test(s) || /^\/bfs\//.test(s)) return `https://i0.hdslb.com/${s.replace(/^\//, '')}`;
  return s.replace(/^\/\//, 'https://').replace(/^http:/, 'https:');
};

export async function spaceInfo(mid: number, onBasic?: (info: SpaceInfo) => void): Promise<SpaceInfo> {
  const stats = Promise.all([
    getJSON<any>('/x/relation/stat', { vmid: mid }).catch(() => null),
    getJSON<any>('/x/space/upstat', { mid }).catch(() => null),
    getJSON<any>('/x/space/navnum', { mid }).catch(() => null),
  ]);
  const acc0 = await getWbi<any>('/x/space/wbi/acc/info', { mid }).catch((e) => { console.warn('[MARGIN] acc/info', e); return null; });
  // acc/info 被风控（-352 / -403）时退回 web-interface/card：名字、头像、签名、头图都有（v0.47）
  let acc = acc0;
  let card: any = null;
  if (!acc?.name) card = await getJSON<any>('/x/web-interface/card', { mid, photo: 'true' }).catch(() => null);
  if (!acc?.name) {
    const c = card?.card;
    if (!c) throw new Error('资料接口暂时不可用');
    acc = { name: c.name, face: c.face, sign: c.sign, level: c.level_info?.current_level, official: { title: c.Official?.title }, vip: c.vip, is_followed: card.following };
  }
  const banner = acc.top_photo_v2?.l_img || acc.top_photo || card?.space?.l_img || card?.space?.s_img;
  const basic: SpaceInfo = {
    mid, name: acc.name, face: https(acc.face), sign: acc.sign ?? '', level: acc.level ?? 0,
    banner: https(banner),
    official: acc.official?.title ?? '', vip: acc.vip?.label?.text ?? '',
    following: 0, follower: 0, likes: 0, views: 0,
    isFollowing: !!acc.is_followed, videoCount: 0,
  };
  // 名字、头像与操作入口不等待粉丝数、获赞、投稿数量等独立统计。
  onBasic?.(basic);
  const bannerFallback = banner || card ? Promise.resolve(card) : getJSON<any>('/x/web-interface/card', { mid, photo: 'true' }).catch(() => null);
  const [[rel, up, nav], bannerCard] = await Promise.all([stats, bannerFallback]);
  return { ...basic, banner: https(banner || bannerCard?.space?.l_img || bannerCard?.space?.s_img), following: rel?.following ?? 0, follower: rel?.follower ?? 0,
    likes: up?.likes ?? 0, views: up?.archive?.view ?? 0, videoCount: nav?.video ?? 0 };
}

export type VideoOrder = 'pubdate' | 'click';

export interface SpaceCollection {
  id: number; kind: 'season' | 'series'; name: string; cover: string; total: number;
}

export async function spaceCollections(mid: number, page: number): Promise<{ list: SpaceCollection[]; total: number }> {
  const d = await getJSON<any>('/x/polymer/web-space/seasons_series_list', { mid, page_num: page, page_size: 20 });
  const items = d.items_lists;
  const list: SpaceCollection[] = [];
  for (const [kind, entries] of [['season', items.seasons_list], ['series', items.series_list]] as const) {
    for (const entry of entries ?? []) {
      const meta = entry.meta;
      list.push({ id: Number(kind === 'season' ? meta.season_id : meta.series_id), kind,
        name: meta.name, cover: https(meta.cover || entry.archives?.[0]?.pic), total: Number(meta.total) || 0 });
    }
  }
  return { list, total: items.page?.total ?? list.length };
}

export async function spaceCollectionVideos(mid: number, collection: SpaceCollection, page: number): Promise<{ list: Video[]; total: number }> {
  const d = collection.kind === 'season'
    ? await getJSON<any>('/x/polymer/web-space/seasons_archives_list', { mid, season_id: collection.id, page_num: page, page_size: 30, sort_reverse: 'false' })
    : await getJSON<any>('/x/series/archives', { mid, series_id: collection.id, pn: page, ps: 30, only_normal: 'true', sort: 'asc' });
  const list: Video[] = (d.archives ?? []).map((v: any) => ({
    bvid: v.bvid || `av${v.aid}`, cid: 0, title: v.title, cover: https(v.pic), duration: Number(v.duration) || 0,
    author: v.owner?.name ?? '', mid: v.owner?.mid ?? v.upMid ?? mid, face: https(v.owner?.face),
    views: v.stat?.view ?? 0, danmaku: v.stat?.danmaku ?? 0, pubdate: v.pubdate ?? v.ctime ?? 0,
  }));
  return { list, total: d.page?.total ?? d.meta?.total ?? collection.total };
}

export async function spaceVideos(mid: number, pn: number, order: VideoOrder, keyword = ''): Promise<{ list: Video[]; total: number }> {
  const d = await getWbi<any>('/x/space/wbi/arc/search', { mid, ps: 30, pn, order, tid: 0, keyword, order_avoided: 'true', platform: 'web', web_location: 1550101 });
  const list: Video[] = (d.list?.vlist ?? []).map((v: any) => ({
    bvid: v.bvid, cid: 0, title: v.title, cover: https(v.pic), duration: parseLen(v.length),
    author: v.author, mid: v.mid, face: '', views: Number(v.play) || 0, danmaku: v.video_review ?? 0, pubdate: v.created ?? 0,
    coop: v.is_union_video === 1 || undefined,
    // v0.51：充电专属等封面角标（B 站评论：插件页看不到充电专属标记）——接口给 elec_arc_badge 文案，
    // 老接口只给 is_charging_arc 时兜底成「充电专属」
    badge: String(v.elec_arc_badge || '').trim() || (v.is_charging_arc === 1 ? '充电专属' : undefined),
  }));
  return { list, total: d.page?.count ?? list.length };
}

/** 最近投币 / 最近点赞的视频（v0.47，评论区：主页下方没有最近投币和点赞了）。对方没公开时 B 站返回 53013，这里返回 null，界面就不显示那个标签 */
export type Recent = 'coin' | 'like';
export async function spaceRecent(mid: number, kind: Recent): Promise<Video[] | null> {
  const r = await fetch(`https://api.bilibili.com/x/space/${kind}/video?vmid=${mid}`, { credentials: 'include' });
  const j = await r.json().catch(() => null);
  if (!j || j.code !== 0) return null;
  const arr: any[] = Array.isArray(j.data) ? j.data : (j.data?.list ?? []);
  return arr.filter((v) => v && (v.bvid || v.aid)).map((v) => ({
    bvid: v.bvid || `av${v.aid}`, cid: v.cid ?? 0, title: v.title ?? '', cover: https(v.pic), duration: Number(v.duration) || 0,
    author: v.owner?.name ?? '', mid: v.owner?.mid ?? 0, face: https(v.owner?.face), views: v.stat?.view ?? 0, danmaku: v.stat?.danmaku ?? 0, pubdate: v.pubdate ?? 0,
  }));
}

function parseLen(s: string): number {
  return String(s || '').split(':').reduce((a, x) => a * 60 + (Number(x) || 0), 0);
}

/** 关注 / 取关（act 1 关注，2 取关） */
export async function follow(mid: number, on: boolean, csrf: string): Promise<boolean> {
  const body = new URLSearchParams({ fid: String(mid), act: on ? '1' : '2', re_src: '11', csrf });
  const r = await fetch('https://api.bilibili.com/x/relation/modify', { method: 'POST', credentials: 'include', body });
  const j = await r.json().catch(() => ({}));
  return j.code === 0;
}

/** v0.49：关注分组（B 站评论反馈：主页关注后不能选分组，再点一下就直接取关了） */
export interface FollowTag { id: number; name: string; count: number }
export async function followTags(): Promise<FollowTag[]> {
  const r = await fetch('https://api.bilibili.com/x/relation/tags', { credentials: 'include' }).then((x) => x.json()).catch(() => ({}));
  return (r.data ?? []).filter((t: any) => t.tagid !== -10).map((t: any) => ({ id: Number(t.tagid), name: String(t.name), count: Number(t.count) || 0 }));
}
/** 这个 UP 当前所在的分组 id（默认分组为空） */
export async function userTags(mid: number): Promise<number[]> {
  const r = await fetch(`https://api.bilibili.com/x/relation/tag/user?fid=${mid}`, { credentials: 'include' }).then((x) => x.json()).catch(() => ({}));
  return Object.keys(r.data ?? {}).map(Number).filter((n) => n > 0);
}
/** 设置分组（覆盖式；空数组 = 回到默认分组） */
export async function setUserTags(mid: number, tags: number[], csrf: string): Promise<boolean> {
  const body = new URLSearchParams({ fids: String(mid), tagids: tags.length ? tags.join(',') : '0', csrf });
  const r = await fetch('https://api.bilibili.com/x/relation/tags/addUsers', { method: 'POST', credentials: 'include', body });
  return ((await r.json().catch(() => ({}))) as any).code === 0;
}
/** 拉黑 / 移出黑名单（relation/modify act 5 / 6；B 站评论反馈：空间页少了拉黑按钮） */
export async function block(mid: number, on: boolean, csrf: string): Promise<boolean> {
  const body = new URLSearchParams({ fid: String(mid), act: on ? '5' : '6', re_src: '11', csrf });
  const r = await fetch('https://api.bilibili.com/x/relation/modify', { method: 'POST', credentials: 'include', body });
  return ((await r.json().catch(() => ({}))) as any).code === 0;
}

/**
 * 「关注老片」（v0.47.2，评论区 wsxszzz：想看关注的 UP 以前的高播放视频）：
 * 每批随机挑 4 位关注的 UP，取各自「最多播放」第一页里发布超过 90 天的前 3 条，打乱后返回。
 * 关注列表只拉一次（最多 250 人），用完一轮就结束。
 */
let followPool: number[] | null = null;
export async function followClassics(me: number): Promise<{ list: Video[]; done: boolean }> {
  if (!followPool) {
    const mids: number[] = [];
    for (let pn = 1; pn <= 5; pn++) {
      const d = await getJSON<any>('/x/relation/followings', { vmid: me, pn, ps: 50, order: 'desc' }).catch(() => null);
      const l: any[] = d?.list ?? [];
      mids.push(...l.map((x) => Number(x.mid)).filter(Boolean));
      if (l.length < 50) break;
    }
    if (!mids.length) throw new Error('还没有关注的 UP 主，或关注列表不公开');
    followPool = mids.sort(() => Math.random() - 0.5);
  }
  const pick = followPool.splice(0, 4);
  const old = Date.now() / 1000 - 90 * 86400;
  const lists = await Promise.all(pick.map((mid, i) => new Promise<Video[]>((res) => setTimeout(() => spaceVideos(mid, 1, 'click').then((r) => res(r.list.filter((v) => v.pubdate && v.pubdate < old).slice(0, 3))).catch(() => res([])), i * 250))));
  // v0.50：每批按发布时间从新到旧排（B 站评论建议，原来是打乱）
  const list = lists.flat().sort((a, b) => b.pubdate - a.pubdate);
  return { list, done: followPool.length === 0 };
}
export const resetClassics = () => { followPool = null; };
