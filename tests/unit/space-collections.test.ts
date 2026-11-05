import { beforeEach, describe, expect, it, vi } from 'vitest';
import { spaceCollections, spaceCollectionVideos, type SpaceCollection } from '../../src/content/api/space';
import { getJSON } from '../../src/content/api/http';

vi.mock('../../src/content/api/http', () => ({ getJSON: vi.fn(), getWbi: vi.fn() }));
beforeEach(() => { vi.mocked(getJSON).mockReset(); });
const collection: SpaceCollection = { id: 9, kind: 'season', name: '测试', cover: '', total: 30 };

describe('空间合集和系列', () => {
  it('合并两类列表，保留各自 ID 并回退系列封面', async () => {
    vi.mocked(getJSON).mockResolvedValue({ items_lists: { page: { total: 12 }, seasons_list: [{ meta: { season_id: 9, name: '合集', total: 10, cover: '//i0.hdslb.com/a.jpg' } }], series_list: [{ meta: { series_id: 9, name: '系列', total: 2 }, archives: [{ pic: 'http://i0.hdslb.com/b.jpg' }] }] } });
    const r = await spaceCollections(2, 3);
    expect(getJSON).toHaveBeenCalledWith('/x/polymer/web-space/seasons_series_list', { mid: 2, page_num: 3, page_size: 20 });
    expect(r.total).toBe(12);
    expect(r.list).toEqual([{ ...collection, name: '合集', total: 10, cover: 'https://i0.hdslb.com/a.jpg' }, { ...collection, kind: 'series', name: '系列', total: 2, cover: 'https://i0.hdslb.com/b.jpg' }]);
  });
  it('没有合集或封面时返回可展示的空状态', async () => {
    vi.mocked(getJSON).mockResolvedValue({ items_lists: { page: { total: 0 }, seasons_list: [], series_list: [] } });
    expect(await spaceCollections(2, 1)).toEqual({ list: [], total: 0 });
  });
  it.each(['season', 'series'] as const)('%s 请求正确页码并转换视频字段', async kind => {
    vi.mocked(getJSON).mockResolvedValue({ page: { total: 42 }, archives: [{ aid: 123, bvid: 'BV1test', title: '测试视频', pic: '//i0.hdslb.com/test.jpg', duration: 70, pubdate: 12345, stat: { view: 99, danmaku: 2 } }] });
    const r = await spaceCollectionVideos(2, { ...collection, kind }, 2);
    const [path, params] = vi.mocked(getJSON).mock.calls[0];
    expect(path).toBe(kind === 'season' ? '/x/polymer/web-space/seasons_archives_list' : '/x/series/archives');
    expect(params).toMatchObject(kind === 'season' ? { season_id: 9, page_num: 2, page_size: 30 } : { series_id: 9, pn: 2, ps: 30 });
    expect(r).toMatchObject({ total: 42, list: [{ bvid: 'BV1test', mid: 2, title: '测试视频', cover: 'https://i0.hdslb.com/test.jpg', duration: 70, views: 99, danmaku: 2 }] });
  });
  it('请求失败交由 UI 重试，不能伪装成空列表', async () => {
    vi.mocked(getJSON).mockRejectedValue(new Error('网络错误'));
    await expect(spaceCollections(2, 1)).rejects.toThrow('网络错误');
    await expect(spaceCollectionVideos(2, collection, 1)).rejects.toThrow('网络错误');
  });
  it('系列收录其他 UP 的视频时保留实际投稿人', async () => {
    vi.mocked(getJSON).mockResolvedValue({ page: { total: 1 }, archives: [{ bvid: 'BVother', title: '联合视频', upMid: 147166910 }] });
    const r = await spaceCollectionVideos(546195, { ...collection, kind: 'series' }, 1);
    expect(r.list[0].mid).toBe(147166910);
  });
});
