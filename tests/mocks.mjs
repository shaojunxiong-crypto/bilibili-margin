// 冒烟测试用的离线 B 站：页面文档、接口、图片全部在本地伪造，CI 不依赖外网。
// 接口数据沿用开发时的 tools/mocks.py（同一份热门视频样本 tests/fixtures/pop.json）。
import { readFileSync } from 'node:fs';

const P = JSON.parse(readFileSync(new URL('./fixtures/pop.json', import.meta.url), 'utf8'));
const NOW = Math.floor(Date.now() / 1000);
/** 视频标签：给第 5 个样本挂一个「隐藏标签词」，用来测关键词命中视频标签 */
const TAGS = { [P[4].bvid]: ['隐藏标签词'] };
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const https = (u) => String(u).replace(/^http:/, 'https:');

const arc = (v, i) => ({
  bvid: v.bvid, cid: 1000 + i, title: v.title, pic: https(v.pic), duration: v.dur, pubdate: v.pub,
  owner: { name: v.name, mid: v.mid, face: v.face }, stat: { view: v.play, danmaku: 100 + i },
});

function feedItem(i, kind) {
  const v = P[i];
  const m = {
    module_author: { name: '映间编辑部', face: P[0].face, mid: 1, pub_ts: NOW - 3600 * (i * 7 + 2) },
    module_stat: { comment: { count: 120 + i * 31 }, forward: { count: 8 + i }, like: { count: 2400 + i * 97 } },
    module_dynamic: {},
  };
  const d = m.module_dynamic;
  if (kind === 'av') { d.desc = { text: '新视频上线：这期把三家播放器的进度条拆开来看。' }; d.major = { archive: { bvid: v.bvid, title: v.title, cover: v.pic, duration_text: mmss(v.dur), stat: { play: `${(v.play / 1e4).toFixed(1)}万` }, desc: v.desc } }; }
  if (kind === 'draw') d.major = { opus: { title: '这周的字体笔记', summary: { text: '霞鹜新致宋的标点挤压做得很舒服。' }, pics: [0, 1, 2].map((j) => ({ url: P[i + j].pic })) } };
  if (kind === 'word') d.major = { opus: { summary: {
    text: '有人问映间为什么没有 logo。[开心]因为页面本身就是名片。',
    rich_text_nodes: [{ text: '有人问映间为什么没有 logo。' },
      { type: 'RICH_TEXT_NODE_TYPE_EMOJI', text: '[开心]', emoji: { icon_url: 'https://i0.hdslb.com/bfs/emote/happy.gif' } },
      { text: '因为页面本身就是名片。' }],
  } } };
  return { id_str: String(900000 + i), type: kind, modules: m };
}
function feedItems() {
  const items = [feedItem(1, 'av'), feedItem(2, 'draw'), feedItem(3, 'word'), feedItem(4, 'av')];
  const fw = feedItem(5, 'word');
  fw.modules.module_dynamic.desc = { text: '转给大家看看' };
  fw.orig = feedItem(6, 'av');
  items.splice(2, 0, fw);
  return items;
}

function historyList() {
  const ago = [600, 2400, 5200, 9000, 26000, 90000, 96000, 99000, 180000, 185000, 270000, 280000, 300000, 360000];
  const prog = [-1, 312, 45, 0, 800, -1, 60, 1200, 30, -1, 500, 10, 99, -1];
  return ago.map((a, i) => {
    const v = P[i], live = i === 3;
    return {
      title: live ? '今晚通宵剪片 · 映间编辑部' : v.title, cover: v.pic, author_name: v.name, author_mid: v.mid, author_face: v.face,
      view_at: NOW - a, progress: prog[i], duration: live ? 0 : v.dur, badge: i === 6 ? '番剧' : '', live_status: live ? 1 : 0,
      history: { business: live ? 'live' : 'archive', oid: i, bvid: v.bvid, dt: 2 },
    };
  });
}

function weatherBody() {
  const t0 = new Date(); t0.setMinutes(0, 0, 0);
  const iso = (d) => d.toISOString().slice(0, 16);
  const hours = Array.from({ length: 48 }, (_, k) => new Date(+t0 + k * 3600e3));
  const days = Array.from({ length: 7 }, (_, k) => new Date(+t0 + k * 864e5).toISOString().slice(0, 10));
  return {
    utc_offset_seconds: 0,
    current: { time: iso(t0), temperature_2m: 21, apparent_temperature: 20, weather_code: 2, wind_speed_10m: 9 },
    hourly: { time: hours.map(iso), temperature_2m: hours.map((_, k) => 18 + (k % 6)), weather_code: hours.map((_, k) => [0, 1, 2, 3, 61, 2][k % 6]), precipitation_probability: hours.map((_, k) => (k * 7) % 60) },
    daily: { time: days, weather_code: [2, 3, 61, 0, 1, 2, 3], temperature_2m_max: [24, 23, 20, 25, 26, 22, 21], temperature_2m_min: [16, 15, 14, 17, 18, 15, 14] },
  };
}

/** 返回 JSON body；null 表示交给下一个规则 */
export function apiBody(u) {
  if (u.includes('/x/web-interface/wbi/index/top/feed/rcmd')) {
    const items = P.map((v, i) => ({ goto: 'av', ...arc(v, i), is_ad: i === 2, rcmd_reason: i % 4 === 0 ? { content: '已关注' } : undefined }));
    items.push({ goto: 'av', ...arc(P[0], 99), bvid: 'BV1ad0000000', title: '广告推广视频', is_ad: true });
    return { code: 0, data: { item: items } };
  }
  if (u.includes('/x/web-interface/popular')) return { code: 0, data: { list: P.map(arc), no_more: true } };
  if (u.includes('/x/tag/archive/tags')) {
    const bvid = new URL(u).searchParams.get('bvid') ?? '';
    return { code: 0, data: (TAGS[bvid] ?? []).map((name, i) => ({ tag_id: i + 1, tag_name: name })) };
  }
  if (u.includes('fav/folder/created/list')) return { code: 0, data: { count: 3, list: [{ id: 101, title: '默认收藏夹', media_count: 42, cover: P[1].pic, attr: 0 }, { id: 202, title: '动效参考', media_count: 17, cover: P[4].pic, attr: 2 }, { id: 303, title: '字体与排版', media_count: 8, cover: '', attr: 3 }] } };
  if (u.includes('fav/resource/list')) return { code: 0, data: { has_more: false, medias: P.slice(0, 8).map((v) => ({ type: 2, attr: 0, bvid: v.bvid, title: v.title, cover: v.pic, duration: v.dur, upper: { name: v.name, mid: v.mid, face: v.face }, cnt_info: { play: v.play, danmaku: 100 }, fav_time: v.pub })) } };
  if (u.includes('fav/folder/')) return { code: 0, data: 0 };
  if (u.includes('nav/stat')) return { code: 0, data: { following: 218, follower: 1342, dynamic_count: 57 } };
  if (u.includes('/x/relation/followings')) return { code: 0, data: { total: 12,
    list: P.slice(0, 12).map((v, i) => ({ mid: 100 + i, uname: v.name, face: v.face })),
  } };
  if (u.includes('feed/all/update')) return { code: 0, data: { update_num: 6 } };
  if (u.includes('web-dynamic/v1/detail')) return { code: 0, data: { item: {
    ...feedItem(1, 'av'), basic: { comment_type: 17, comment_id_str: '900001' },
  } } };
  if (u.includes('/x/v2/reply/add')) return { code: 0, data: {} };
  if (u.includes('/x/v2/reply?')) return { code: 0, data: {
    top_replies: [{ rpid: 11, member: { uname: '置顶作者', mid: 1 }, content: {
      message: '置顶评论[开心]', emote: { '[开心]': { url: 'https://i0.hdslb.com/bfs/emote/happy.gif' } },
    } }], replies: [{ rpid: 12, member: { uname: '热评作者', mid: 2 }, content: { message: '热门评论' } }], page: { count: 2 },
  } };
  if (u.includes('web-dynamic/v1/feed/all')) return { code: 0, data: { update_baseline: '1000', items: feedItems(), has_more: false, offset: '' } };
  if (u.includes('web-dynamic/v1/feed/space')) return { code: 0, data: { items: feedItems(), offset: '', has_more: false } };
  if (u.includes('web-dynamic/v1/portal')) return { code: 0, data: { up_list: { items: P.slice(0, 12).map((v, i) => ({ mid: v.mid, uname: v.name, face: v.face, has_update: i % 3 === 0 })) }, live_users: { count: 2, items: P.slice(12, 14).map((v, i) => ({ mid: v.mid, uname: v.name, face: v.face, title: ['今晚通宵剪片', '字体设计直播'][i], room_id: 1000 + i })) } } };
  if (u.includes('search/square')) return { code: 0, data: { trending: { list: ['S16 全球总决赛', '液态玻璃效果怎么做', '万字细嗦警匪片', '塔图姆 40 分', '一位大学老师的 36 岁'].map((k) => ({ keyword: k, show_name: k })) } } };
  if (u.includes('history/shadow') && !u.includes('set')) return { code: 0, data: false };
  if (u.includes('history/cursor') || u.includes('history/search')) return { code: 0, data: { cursor: { max: 0, view_at: 0, business: '' }, list: historyList(), page: { total: 14 } } };
  if (u.includes('history/toview')) return { code: 0, data: { count: 2, list: P.slice(2, 4).map((v, i) => ({ ...arc(v, i), progress: 30 })) } };
  if (u.includes('history/')) return { code: 0, data: 0 };
  if (u.includes('/x/web-interface/nav')) return { code: 0, data: { isLogin: true, mid: 1, uname: '玖阳', face: P[3].face, level_info: { current_level: 5, current_exp: 14820, next_exp: 28800 }, money: 326.5, wallet: { bcoin_balance: 5 }, vipStatus: 1, vip: { nickname_color: '#FB7299' }, vip_label: { text: '年度大会员' }, wbi_img: { img_url: 'https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png', sub_url: 'https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png' } } };
  if (u.includes('acc/info')) return { code: 0, data: { name: '映间编辑部', face: P[0].face, sign: '把 B 站读成一本杂志。', level: 6, top_photo: '', official: { title: 'bilibili 知名设计 UP 主' }, vip: { label: { text: '年度大会员' } }, is_followed: false } };
  if (u.includes('relation/stat')) return { code: 0, data: { following: 218, follower: 1284000 } };
  if (u.includes('upstat')) return { code: 0, data: { likes: 3620000, archive: { view: 98700000 } } };
  if (u.includes('navnum')) return { code: 0, data: { video: P.length } };
  if (u.includes('arc/search')) return { code: 0, data: { list: { vlist: P.map((v, i) => ({ bvid: v.bvid, title: v.title, pic: v.pic, length: mmss(v.dur), author: '映间编辑部', mid: 1, play: v.play, video_review: 100, created: v.pub, elec_arc_badge: i % 3 === 0 ? '充电专属' : '', is_charging_arc: i % 3 === 0 ? 1 : 0 })) }, page: { count: P.length } } };
  if (u.includes('msgfeed/unread')) return { code: 0, data: { at: 2, chat: 0, like: 18, reply: 5, sys_msg: 1, up: 0 } };
  if (u.includes('single_unread')) return { code: 0, data: { follow_unread: 3, unfollow_unread: 0 } };
  if (u.includes('msgfeed/reply')) return { code: 0, data: { cursor: { is_end: true }, items: [0, 1, 2].map((i) => ({ id: i, user: { mid: P[i].mid, nickname: P[i].name, avatar: P[i].face }, item: { type: 'video', title: P[i + 5].title, image: P[i + 5].pic, uri: `https://www.bilibili.com/video/${P[i + 5].bvid}`, source_content: ['这个缓动曲线太舒服了', '那个转场是怎么做的？', 'up 的字体搭配真的绝'][i], target_reply_content: '' }, reply_time: NOW - 1800 * (i + 1) })) } };
  if (u.includes('msgfeed/at')) return { code: 0, data: { cursor: { is_end: true }, items: [] } };
  if (u.includes('msgfeed/like')) return { code: 0, data: { total: { cursor: { is_end: true }, items: [] } } };
  if (u.includes('query_user_notify')) return { code: 0, data: { system_notify_list: [{ id: 1, title: '你的稿件已通过审核', content: '你投稿的视频已通过审核。', time_at: '2026-10-27 21:14:05' }] } };
  if (u.includes('get_sessions')) return { code: 0, data: { session_list: [0, 1].map((i) => ({ talker_id: P[i].mid, session_type: 1, unread_count: 1 - i, session_ts: (NOW - 600 * (i + 1)) * 1e6, last_msg: { msg_type: 1, content: JSON.stringify({ content: ['周末的分享会你来吗？', '好的，源码我发你邮箱了'][i] }), timestamp: NOW - 600 * (i + 1) } })) } };
  if (u.includes('user/cards')) return { code: 0, data: P.slice(0, 4).map((v) => ({ mid: v.mid, name: v.name, face: v.face })) };
  if (u.includes('fetch_session_msgs')) return { code: 0, data: { messages: [] } };
  if (u.includes('s.search.bilibili.com/main/suggest')) return { code: 0, result: { tag: [] } };
  if (u.includes('/x/web-interface/card')) return { code: 0, data: { card: { mid: '1', name: '映间编辑部', face: P[0].face, sign: '把 B 站读成一本杂志。', fans: 1284000, Official: { title: '' } }, following: false } };
  if (u.includes('ipwho.is')) return { success: true, city: '上海', latitude: 31.23, longitude: 121.47 };
  if (u.includes('geocoding-api.open-meteo.com')) return { results: [{ name: '上海', latitude: 31.23, longitude: 121.47 }] };
  if (u.includes('api.open-meteo.com')) return weatherBody();
  if (/api(\.vc)?\.bilibili\.com|message\.bilibili\.com\/x\//.test(u)) return { code: 0, data: {} };
  return null;
}

/** 占位封面：按 URL 取一个色相的渐变 SVG */
function placeholder(u) {
  let h = 0;
  for (const c of u) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = h % 360, b = (a + 40) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${a} 45% 62%)"/><stop offset="1" stop-color="hsl(${b} 50% 38%)"/></linearGradient></defs><rect width="320" height="200" fill="url(#g)"/></svg>`;
}

const watchRec = (k, title, up, views, dur) => `<div class="video-page-card-small" data-k="${k}">
  <div class="title">${title}</div><div class="upname">${up}</div>
  ${views ? `<div class="playinfo">${views}播放</div>` : ''}${dur ? `<div class="duration">${dur}</div>` : ''}
</div>`;

const searchCard = (k, title, up, views, dur) => `<div class="bili-video-card" data-k="${k}">
  <div class="bili-video-card__info--tit">${title}</div><div class="bili-video-card__info--author">${up}</div>
  <div class="bili-video-card__stats">${views ? `<span class="bili-video-card__stats--item">${views}</span>` : ''}${dur ? `<span class="bili-video-card__stats__duration">${dur}</span>` : ''}</div>
</div>`;

const watchHtml = () => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>哔哩哔哩 (゜-゜)つロ 干杯~-bilibili</title></head><body>
<div id="app"><div class="video-container-v1"><div class="left-container"><div class="video-info-container"><h1 class="video-title">离线冒烟测试视频</h1></div>
<div class="bpx-player-container" data-screen="normal" style="width:100%;aspect-ratio:16/9;background:#000">
  <div class="bpx-player-video-wrap"><video muted playsinline></video></div>
  <button class="bpx-player-ctrl-wide" type="button">宽屏</button>
  <button class="bpx-player-ctrl-web" type="button">网页全屏</button>
</div>
<div id="commentapp"></div></div><div class="right-container"><div id="danmukuBox"></div><div class="recommend-list-v1">
  ${watchRec('normal', '普通推荐视频', '正常UP', '12.3万', '10:00')}
  ${watchRec('keyword', '屏蔽词测试视频', '正常UP', '12.3万', '10:00')}
  ${watchRec('up', '被屏蔽 UP 的视频', '坏UP', '12.3万', '10:00')}
  ${watchRec('low', '低播放视频', '正常UP', '12', '1:00')}
  ${watchRec('missing', '缺播放量视频', '正常UP', '', '2:00')}
</div><div class="video-card-ad-small" data-k="watch-ad">推广位</div></div></div>
<script>
  const pc = document.querySelector('.bpx-player-container');
  document.querySelector('.bpx-player-ctrl-wide').addEventListener('click', () => { pc.dataset.screen = 'wide'; });
  document.querySelector('.bpx-player-ctrl-web').addEventListener('click', () => { pc.dataset.screen = 'web'; });
</script></body></html>`;

const searchHtml = () => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>搜索 - bilibili</title></head><body>
<div id="app"><div class="search-content"><div class="video-list">
  ${searchCard('normal', '普通搜索结果', '正常UP', '12.3万', '10:00')}
  ${searchCard('keyword', '屏蔽词测试结果', '正常UP', '12.3万', '10:00')}
  ${searchCard('up', '被屏蔽 UP 的结果', '坏UP', '12.3万', '10:00')}
  ${searchCard('low', '低播放结果', '正常UP', '12', '1:00')}
  ${searchCard('missing', '缺播放量结果', '正常UP', '', '2:00')}
  <div class="bili-video-card" data-k="tag"><a href="https://www.bilibili.com/video/${P[4].bvid}"><div class="bili-video-card__info--tit">标签命中结果</div></a><div class="bili-video-card__info--author">正常UP</div><div class="bili-video-card__stats"><span class="bili-video-card__stats--item">12.3万</span><span class="bili-video-card__stats__duration">10:00</span></div></div>
  <div class="video-list-item" data-k="ad"><div class="bili-video-card">
    <div class="bili-video-card__info--tit">广告搜索结果</div><div class="bili-video-card__info--author">推广账号</div>
    <div class="bili-video-card__info--ad">广告</div>
  </div></div>
</div></div></div></body></html>`;

const popularHtml = () => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>热门 - bilibili</title></head><body>
<div id="app"><div class="popular-video-container">
  <div class="video-card" data-k="normal"><div class="video-name">普通热门视频</div><div class="up-name">正常UP</div><div class="video-stat">12.3万播放</div><div class="duration">10:00</div></div>
  <div class="video-card" data-k="keyword"><div class="video-name">屏蔽词热门视频</div><div class="up-name">正常UP</div><div class="video-stat">12.3万播放</div><div class="duration">10:00</div></div>
</div></div></body></html>`;

/** 原版页面的最小骨架：映间会把它藏起来或在上面换皮 */
function stubHtml(u) {
  if (/\/opus\/\d/.test(u)) return opusHtml();
  if (/search\.bilibili\.com/.test(u)) return searchHtml();
  if (/\/v\/popular/.test(u)) return popularHtml();
  if (/\/video\//.test(u)) return watchHtml();
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>哔哩哔哩 (゜-゜)つロ 干杯~-bilibili</title></head><body>
<div id="app"><div class="bili-header"></div><main class="native">原版页面</main></div></body></html>`;
}

/** 图文详情页骨架：和真实 opus 页的 SSR 结构一致（.opus-detail / .opus-module-* / 原生侧边工具条），带两个小标题测目录 */
function opusHtml() {
  const para = (t) => `<p><span>${t}</span></p>`;
  const body = ['一', '二', '三'].map((n, i) => `<h2>第${n}节 · 排版的节奏</h2>` + para('正文段落：留白、字距和行高决定了阅读的呼吸感。'.repeat(6)) + para('第二段落用来撑出滚动距离。'.repeat(8))).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>离线冒烟测试图文 - 哔哩哔哩</title></head><body>
<header id="bili-header-container" style="height:64px"><div class="z-top-container"></div></header>
<div id="app"><div class="bgc"></div><div class="bg"></div><div class="opus-detail"><div class="bili-opus-view">
<div class="opus-module-top"><div class="opus-module-top__album"><div class="opus-module-top__album__cover" style="height:228px"><div class="b-img"><img src="https://i0.hdslb.com/bfs/article/cover.jpg" style="width:100%;height:228px"></div></div></div></div>
<div class="opus-module-title"><div class="opus-module-title__inner"><span class="opus-module-title__text">离线冒烟测试图文</span></div></div>
<div class="opus-module-author"><div class="opus-module-author__left"><div class="opus-module-author__avatar"></div></div><div class="opus-module-author__center"><div class="opus-module-author__name-row"><div class="opus-module-author__name">映间编辑部</div></div><div class="opus-module-author__pub"><div class="opus-module-author__pub__text">2026年10月29日 21:00</div></div></div></div>
<div class="opus-module-content opus-paragraph-children">${body}</div>
</div><div class="bili-tabs opus-tabs"><div class="bili-tabs__header"><div class="bili-tabs__nav"><div class="bili-tabs__nav__item is-active">评论 12</div></div></div><div class="bili-tabs__content"><div class="comment-wrap" style="height:400px"></div></div></div>
<div class="right-sidebar-wrap"><div class="side-toolbar" style="position:fixed;right:40px;top:180px"><div class="side-toolbar__box">
${[['like', '3.3万'], ['coin', '2656'], ['favorite', '1.8万'], ['forward', '175'], ['comment', '12']].map(([k, n]) => `<div class="side-toolbar__action ${k}"><div class="side-toolbar__action__text">${n}</div></div>`).join('')}
</div></div></div></div>
<script>window.__INITIAL_STATE__={"detail":{"modules":[{"module_author":{"mid":1,"name":"映间编辑部"}}]}};(function(){})();</script></div></body></html>`;
}

/** 给 BrowserContext 装上离线路由 */
export async function installMocks(ctx, override) {
  await ctx.route(/^https?:\/\//, async (route) => {
    const req = route.request();
    const u = req.url();
    const body = (await override?.(u)) ?? apiBody(u);
    const origin = req.headers().origin || 'https://www.bilibili.com';
    if (body) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true' }, body: JSON.stringify(body) });
    const type = req.resourceType();
    if (type === 'document' && /\.bilibili\.com\//.test(u)) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: stubHtml(u) });
    if (type === 'image' || /hdslb\.com\/bfs\//.test(u)) return route.fulfill({ status: 200, contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' }, body: placeholder(u) });
    return route.fulfill({ status: 404, contentType: 'text/plain', body: '' });
  });
}
