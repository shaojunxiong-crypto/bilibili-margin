/** 小电视空降助手公开 API 数据；仅处理 sponsor / skip，不使用其他类型。 */
export interface SponsorSegment { cid: string; start: number; end: number; duration: number }
export interface SponsorRange { start: number; end: number }
export type SponsorMessage = { margin: 'sponsor'; bvid: string };

export function parseSponsorSegments(raw: unknown, bvid: string): SponsorSegment[] {
  if (!Array.isArray(raw)) return [];
  const video = raw.find((x) => x?.videoID === bvid);
  if (!Array.isArray(video?.segments)) return [];
  return video.segments.flatMap((x: any): SponsorSegment[] => {
    if (x?.category !== 'sponsor' || x.actionType !== 'skip' || (typeof x.votes === 'number' && x.votes < 0)) return [];
    const [start, end] = Array.isArray(x.segment) ? x.segment : [];
    const duration = x.videoDuration;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start ||
      !Number.isFinite(duration) || duration < 0 || !/^\d+$/.test(String(x.cid))) return [];
    return [{ cid: String(x.cid), start, end, duration }];
  });
}

/** CID 必须一致；换源后时长偏差超过接口约定的 2 秒时不自动跳。合并重叠片段，撤销时一起放行。 */
export function sponsorRanges(segments: SponsorSegment[], cid: string, duration: number): SponsorRange[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const out: SponsorRange[] = [];
  for (const s of segments.filter((s) => s.cid === cid && s.end <= duration && (!s.duration || Math.abs(s.duration - duration) <= 2)).sort((a, b) => a.start - b.start)) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ start: s.start, end: s.end });
  }
  return out;
}
