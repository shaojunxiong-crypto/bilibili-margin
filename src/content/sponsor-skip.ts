import { every } from './sched';
import { sponsorRanges, type SponsorSegment, type SponsorMessage } from '../shared/sponsor';

let stop: (() => void) | null = null;
const pageVideo = () => {
  if (location.hostname !== 'www.bilibili.com') return null;
  const bvid = location.pathname.match(/\/video\/(BV[0-9A-Za-z]{10})(?:\/|$)/)?.[1];
  const p = new URLSearchParams(location.search).get('p') ?? '1';
  return bvid && /^[1-9]\d*$/.test(p) ? { bvid, p: Number(p), key: `${bvid}:${p}` } : null;
};

/** 使用原生 video 的 timeupdate 事件，无逐帧扫描、额外播放器或统计上报。 */
export function setSponsorSkip(enabled: boolean): void {
  if (!enabled) { stop?.(); stop = null; return; }
  if (stop || !pageVideo()) return;
  let key = '', gen = 0, cid = '';
  let video: HTMLVideoElement | null = null;
  let segments: SponsorSegment[] = [];
  const ignored = new Set<string>();
  let notice: HTMLElement | null = null, timer = 0;
  let request: AbortController | null = null;
  const clearNotice = () => { clearTimeout(timer); notice?.remove(); notice = null; };
  const tick = () => {
    const v = video;
    if (!v || v.paused || v.ended || v.seeking || pageVideo()?.key !== key) return;
    const range = sponsorRanges(segments, cid, v.duration).find((s) => v.currentTime >= s.start && v.currentTime < s.end && !ignored.has(`${s.start}:${s.end}`));
    if (!range) return;
    const resume = v.currentTime, source = v, generation = gen;
    v.currentTime = range.end;
    clearNotice();
    const host = document.createElement('div'); host.id = 'margin-sponsor-notice';
    host.style.cssText = 'position:absolute;left:20px;bottom:64px;z-index:100;pointer-events:auto';
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = ':host{font:13px/1.5 system-ui;color:#fff}div{display:flex;gap:12px;align-items:center;padding:10px 14px;border-radius:10px;background:#202124;box-shadow:0 2px 12px #0004}button{font:inherit;border:0;border-radius:6px;padding:4px 8px;background:#fff;color:#202124;cursor:pointer}button:focus-visible{outline:2px solid #00aeec;outline-offset:2px}';
    const row = document.createElement('div'); row.setAttribute('role', 'status');
    const text = document.createElement('span'); text.textContent = '已跳过广告 · 小电视空降助手';
    const undo = document.createElement('button'); undo.type = 'button'; undo.textContent = '撤销跳过';
    undo.addEventListener('click', () => {
      if (video === source && gen === generation && pageVideo()?.key === key) {
        ignored.add(`${range.start}:${range.end}`);
        source.currentTime = resume;
      }
      clearNotice();
    });
    row.append(text, undo); root.append(style, row);
    // 放在播放器内部，网页全屏 / 原生全屏仍能看到撤销入口。
    const player = v.closest<HTMLElement>('.bpx-player-video-area, .bpx-player-container');
    if (player) { player.append(host); notice = host; timer = window.setTimeout(clearNotice, 10_000); }
  };
  const sync = () => {
    const current = pageVideo();
    const next = current ? document.querySelector<HTMLVideoElement>('.bpx-player-video-wrap video, .bpx-player-container video') : null;
    if (next !== video) {
      clearNotice();
      video?.removeEventListener('timeupdate', tick); video?.removeEventListener('loadedmetadata', tick);
      video = next; video?.addEventListener('timeupdate', tick); video?.addEventListener('loadedmetadata', tick);
    }
    if ((current?.key ?? '') === key) return;
    key = current?.key ?? ''; const g = ++gen;
    segments = []; cid = ''; ignored.clear(); clearNotice(); request?.abort();
    if (!current) return;
    request = new AbortController();
    // 当前分 P 的 CID 从 B 站元数据取得，禁止把另一 P 的广告套过来。
    Promise.all([
      fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${current.bvid}`, { credentials: 'include', signal: request.signal }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json();
      }),
      chrome.runtime.sendMessage({ margin: 'sponsor', bvid: current.bvid } satisfies SponsorMessage),
    ]).then(([meta, result]) => {
      if (g !== gen || meta.code !== 0 || !result?.ok || !Array.isArray(result.segments)) return;
      const part = meta.data?.pages?.find((p: { page: number }) => p.page === current.p);
      if (!part?.cid) return;
      cid = String(part.cid); segments = result.segments; tick();
    }).catch(() => { /* 接口失败时保留原生播放，不重试轰炸服务 */ });
  };
  const cancel = every(1000, sync, { hidden: true });
  stop = () => {
    ++gen; request?.abort(); cancel(); clearNotice();
    video?.removeEventListener('timeupdate', tick); video?.removeEventListener('loadedmetadata', tick);
  };
  sync();
}
