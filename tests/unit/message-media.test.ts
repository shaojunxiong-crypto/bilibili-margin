import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messageEmotes, messages, sendImage, sendText, uploadMessageImage, validateMessageImage } from '../../src/content/api/msg';

let calls: { url: string; init?: RequestInit }[];
let result: unknown;
beforeEach(() => {
  calls = []; result = { code: 0 };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init }); return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('原版私信图片与表情协议', () => {
  it('图片上传使用原版 im 通道、文件和 CSRF，返回真实图片尺寸', async () => {
    const file = new File(['image'], 'test.png', { type: 'image/png' });
    result = { code: 0, data: { image_url: '//message.biliimg.com/bfs/im_new/test.png', image_width: 600, image_height: 400, img_size: 12.5 } };
    const image = await uploadMessageImage(file, 'csrf');
    expect(calls[0].url).toBe('https://api.bilibili.com/x/dynamic/feed/draw/upload_bfs');
    const body = calls[0].init?.body as FormData;
    expect(body.get('file_up')).toBeInstanceOf(File); expect(body.get('biz')).toBe('im'); expect(body.get('csrf')).toBe('csrf');
    expect(image).toEqual({ url: 'https://message.biliimg.com/bfs/im_new/test.png', width: 600, height: 400, size: 12.5, imageType: 'png', original: 1 });
    result = { code: 0 };
    expect(await sendImage(10, 20, image, 'csrf')).toBe(true);
    const sent = calls[1].init?.body as URLSearchParams;
    expect(sent.get('msg[msg_type]')).toBe('2'); expect(sent.get('msg[receiver_id]')).toBe('20');
    expect(JSON.parse(sent.get('msg[content]')!)).toEqual(image);
    expect(sent.get('csrf_token')).toBe('csrf');
  });
  it('无效类型、空文件、超过20MB或超过1MB的GIF在上传前拒绝', () => {
    expect(() => validateMessageImage({ type: 'text/html', size: 50 })).toThrow('图片');
    expect(() => validateMessageImage({ type: 'image/png', size: 0 })).toThrow();
    expect(() => validateMessageImage({ type: 'image/png', size: 20 * 1024 * 1024 + 1 })).toThrow('20 MB');
    expect(() => validateMessageImage({ type: 'image/gif', size: 1024 * 1024 + 1 })).toThrow('1 MB');
    expect(() => validateMessageImage({ type: 'image/gif', size: 1024 * 1024 })).not.toThrow();
    expect(calls).toHaveLength(0);
  });
  it('上传或发送失败不伪报成功，不接受第三方地址与缺失尺寸', async () => {
    const file = new File(['image'], 'test.png', { type: 'image/png' });
    result = { code: -111, message: 'csrf failed' };
    await expect(uploadMessageImage(file, 'csrf')).rejects.toThrow('csrf failed');
    result = { code: 0, data: { image_url: 'https://example.com/a.png', image_width: 10, image_height: 10 } };
    await expect(uploadMessageImage(file, 'csrf')).rejects.toThrow('不完整');
    result = { code: 0, data: { image_url: 'https://message.biliimg.com/a.png' } };
    await expect(uploadMessageImage(file, 'csrf')).rejects.toThrow('不完整');
    expect(() => sendImage(1, 2, { url: 'javascript:alert(1)', width: 1, height: 1, original: 1, size: 1, imageType: 'png' }, 'csrf')).toThrow();
    result = { code: -6 };
    expect(await sendText(1, 2, 'hello', 'csrf')).toBe(false);
  });
  it('获取原版表情包，过滤不可用表情并保留真实图片', async () => {
    result = { code: 0, data: { packages: [{ id: 1, text: '小电视', emote: [
      { text: '[tv_doge]', url: '//i0.hdslb.com/a.gif', flags: { unlocked: true } },
      { text: '[锁定]', url: 'https://i0.hdslb.com/locked.png', flags: { unlocked: false } },
      { text: '[无效]', url: 'javascript:alert(1)' },
    ] }] } };
    expect(await messageEmotes()).toEqual([{ id: 1, name: '小电视', emotes: [{ text: '[tv_doge]', url: 'https://i0.hdslb.com/a.gif' }] }]);
    expect(new URL(calls[0].url).searchParams.get('business')).toBe('reply');
    result = { code: 0 }; await sendText(1, 2, 'hi[tv_doge]', 'csrf', true);
    expect((calls[1].init?.body as URLSearchParams).get('msg[new_face_version]')).toBe('1');
    expect(JSON.parse((calls[1].init?.body as URLSearchParams).get('msg[content]')!).content).toBe('hi[tv_doge]');
  });
  it('收到的文字使用服务端表情元数据，GIF保持原图地址', async () => {
    result = { code: 0, data: { messages: [{ sender_uid: 2, msg_type: 1, content: JSON.stringify({ content: 'hi[tv_doge]' }), timestamp: 1, msg_key: '1', msg_seqno: 1 }], e_infos: [{ text: '[tv_doge]', uri: '//i0.hdslb.com/a.png', gif_url: '//i0.hdslb.com/a.gif' }] } };
    expect((await messages(2))[0]).toMatchObject({ text: 'hi[tv_doge]', emotes: [{ text: '[tv_doge]', url: 'https://i0.hdslb.com/a.gif' }] });
  });
});
