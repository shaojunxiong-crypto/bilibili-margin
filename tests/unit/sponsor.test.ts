import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { parseSponsorSegments, sponsorRanges } from '../../src/shared/sponsor';

const bvid = 'BV14741127BN';
const segment = (patch = {}) => ({ cid: '101', category: 'sponsor', actionType: 'skip', segment: [10, 20], videoDuration: 60, votes: 1, ...patch });
const payload = (segments: unknown[]) => [{ videoID: bvid, segments }];
describe('社区片段过滤', () => {
  it('只选择当前 BVID 的广告跳过片段', () => {
    expect(parseSponsorSegments(payload([segment(), segment({ category: 'intro' }), segment({ actionType: 'mute' }), segment({ votes: -1 })]), bvid)).toEqual([{ cid: '101', start: 10, end: 20, duration: 60 }]);
    expect(parseSponsorSegments(payload([segment()]), 'BV1mdxN68E7F')).toEqual([]);
  });
  it('不把错误格式、负时间或无效 CID 当片段', () => {
    expect(parseSponsorSegments(payload([null, segment({ segment: [20, 10] }), segment({ segment: [-1, 20] }), segment({ segment: ['10', 20] }), segment({ cid: '' }), segment({ videoDuration: NaN })]), bvid)).toEqual([]);
    expect(parseSponsorSegments({}, bvid)).toEqual([]);
  });
  it('分 P 和换源时长严格匹配', () => {
    const data = parseSponsorSegments(payload([segment()]), bvid);
    expect(sponsorRanges(data, '102', 60)).toEqual([]);
    expect(sponsorRanges(data, '101', 63)).toEqual([]);
    expect(sponsorRanges(data, '101', 19)).toEqual([]);
    expect(sponsorRanges(data, '101', NaN)).toEqual([]);
    expect(sponsorRanges(data, '101', 62)).toEqual([{ start: 10, end: 20 }]);
  });
  it('重叠广告合并，独立广告保留，未知源时长仍需 CID 一致', () => {
    const data = parseSponsorSegments(payload([segment(), segment({ segment: [18, 25] }), segment({ segment: [40, 50], videoDuration: 0 })]), bvid);
    expect(sponsorRanges(data, '101', 60)).toEqual([{ start: 10, end: 25 }, { start: 40, end: 50 }]);
  });
});

let enabled = false, optIn = false;
const fetchMock = vi.fn();
let getSponsorSegments: typeof import('../../src/background/sponsor').getSponsorSegments;
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); enabled = true; optIn = true;
  vi.stubGlobal('chrome', { storage: { local: { get: async () => ({ 'margin:settings': { enabled, sponsorSkip: optIn } }) } }, runtime: { getManifest: () => ({ version: '0.52.0' }) } });
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => payload([segment()]) });
  ({ getSponsorSegments } = await import('../../src/background/sponsor'));
});
afterEach(() => vi.unstubAllGlobals());
describe('社区 API 查询', () => {
  it('功能或总开关关闭时不发送请求，包括已有缓存', async () => {
    optIn = false; expect(await getSponsorSegments(bvid)).toEqual([]); expect(fetchMock).not.toHaveBeenCalled();
    optIn = true; await getSponsorSegments(bvid); expect(fetchMock).toHaveBeenCalledTimes(1);
    enabled = false; expect(await getSponsorSegments(bvid)).toEqual([]); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('只把四位哈希前缀发送给固定主机，不带 Cookie 或页面引用', async () => {
    await getSponsorSegments(bvid);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('https://bsbsb.top/api/skipSegments/5759?');
    expect(url).not.toContain(bvid);
    expect(options).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer', headers: { 'x-ext-version': 'MARGIN/0.52.0' } });
  });
  it('同时请求去重且缓存结果，不发送统计或投票', async () => {
    const [a, b] = await Promise.all([getSponsorSegments(bvid), getSponsorSegments(bvid)]);
    expect(a).toEqual(b); await getSponsorSegments(bvid);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('404 按无标记缓存，其他错误不缓存', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(getSponsorSegments(bvid)).rejects.toThrow('503');
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
    expect(await getSponsorSegments(bvid)).toEqual([]); await getSponsorSegments(bvid);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('不接受任意 URL 或非法视频标识', async () => {
    await expect(getSponsorSegments('https://example.com')).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
