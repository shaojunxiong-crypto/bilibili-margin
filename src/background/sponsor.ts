import { loadSettings } from '../shared/settings';
import { parseSponsorSegments, type SponsorSegment } from '../shared/sponsor';

const cache = new Map<string, { at: number; data: SponsorSegment[] }>();
const pending = new Map<string, Promise<SponsorSegment[]>>();

/** 只允许固定服务的只读查询，不接受页面提供的 URL；不开功能就不联网。 */
export async function getSponsorSegments(bvid: string): Promise<SponsorSegment[]> {
  if (!/^BV[0-9A-Za-z]{10}$/.test(bvid)) throw new Error('无效视频');
  const s = await loadSettings();
  if (!s.enabled || !s.sponsorSkip) return [];
  const hit = cache.get(bvid);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.data;
  const active = pending.get(bvid);
  if (active) return active;
  const task = (async () => {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bvid));
    const prefix = [...new Uint8Array(hash)].slice(0, 2).map((n) => n.toString(16).padStart(2, '0')).join('');
    const q = new URLSearchParams({ categories: '["sponsor"]', actionTypes: '["skip"]' });
    const r = await fetch(`https://bsbsb.top/api/skipSegments/${prefix}?${q}`, {
      credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(5000),
      headers: { 'x-ext-version': `MARGIN/${chrome.runtime.getManifest().version}` },
    });
    if (!r.ok && r.status !== 404) throw new Error(`HTTP ${r.status}`);
    const data = r.status === 404 ? [] : parseSponsorSegments(await r.json(), bvid);
    if (cache.size >= 32) cache.delete(cache.keys().next().value!);
    cache.set(bvid, { at: Date.now(), data });
    return data;
  })();
  pending.set(bvid, task);
  try { return await task; } finally { pending.delete(bvid); }
}
