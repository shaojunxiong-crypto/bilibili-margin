import { afterEach, describe, expect, it, vi } from 'vitest';
import { spaceLive } from '../../src/content/api/space';

afterEach(() => vi.unstubAllGlobals());

describe('空间页直播状态', () => {
  it('读取公开状态并返回直播间编号', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0, data: { liveStatus: 1, roomid: 7734200 } })));
    vi.stubGlobal('fetch', fetcher);
    expect(await spaceLive(50329118)).toBe(7734200);
    expect(fetcher).toHaveBeenCalledWith('https://api.live.bilibili.com/room/v1/Room/getRoomInfoOld?mid=50329118', { credentials: 'omit' });
  });
  it.each([{ liveStatus: 0, roomid: 7734200 }, { liveStatus: 2, roomid: 7734200 }, { liveStatus: 1, roomid: 0 }, { liveStatus: 1, roomid: 'invalid' }, {}])('未开播或无有效房间时没有入口 %j', async data => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0, data }))));
    expect(await spaceLive(50329118)).toBeNull();
  });
  it('接口失败交由界面降级', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: -500, message: '暂时不可用' }))));
    await expect(spaceLive(50329118)).rejects.toThrow('暂时不可用');
  });
});
