import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../src/content/api/http', () => ({ getJSON: vi.fn(), postForm: vi.fn(), postJSON: vi.fn() }));
import { getJSON } from '../../src/content/api/http';
import { dynCommentTarget, dynReplies, toDyn } from '../../src/content/api/dyn';

const get = vi.mocked(getJSON);
const item = (dynamic: object = {}, basic?: object) => ({ id_str: '900001234567890123', type: 'DYNAMIC_TYPE_WORD', basic,
  modules: { module_author: { mid: 1 }, module_dynamic: dynamic } });
const emoji = { type: 'RICH_TEXT_NODE_TYPE_EMOJI', text: '[开心]', emoji: { icon_url: '//i0.hdslb.com/happy.gif' } };
beforeEach(() => vi.resetAllMocks());

describe('动态正文与表情', () => {
  it('保留正文、换行和原始 GIF 表情地址', () => {
    const d = toDyn(item({ desc: { text: '你好[开心]\n世界', rich_text_nodes: [{ text: '你好' }, emoji, { text: '\n世界' }] } }))!;
    expect(d.text).toBe('你好[开心]\n世界');
    expect(d.richText).toEqual([{ text: '你好' }, { text: '[开心]', emoji: 'https://i0.hdslb.com/happy.gif' }, { text: '\n世界' }]);
  });
  it('opus summary 的正文和表情来自同一份数据', () => {
    const d = toDyn(item({ major: { opus: { summary: { text: '[开心]', rich_text_nodes: [emoji] } } }, desc: { text: '旧文字' } }))!;
    expect(d.text).toBe('[开心]'); expect(d.richText?.[0].emoji).toContain('happy.gif');
  });
  it('summary 没有 text 时保留 desc', () => {
    expect(toDyn(item({ major: { opus: { summary: {} } }, desc: { text: '文字' } }))?.text).toBe('文字');
  });
  it('未知节点作为文字，非法图片协议不进入图片节点', () => {
    const d = toDyn(item({ desc: { text: '[开心]@作者', rich_text_nodes: [
      { ...emoji, emoji: { icon_url: 'javascript:alert(1)' } }, { type: 'UNKNOWN', text: '@作者' },
    ] } }))!;
    expect(d.richText).toEqual([{ text: '[开心]' }, { text: '@作者' }]);
  });
  it('节点不完整时回退整段正文，不丢字', () => {
    expect(toDyn(item({ desc: { text: '完整正文', rich_text_nodes: [{ text: '不完整' }] } }))?.richText).toBeUndefined();
  });
  it('转发中的原动态保留自己的表情', () => {
    const original = item({ desc: { text: '[开心]', rich_text_nodes: [emoji] } });
    expect(toDyn({ ...item(), orig: original })?.orig?.richText?.[0].emoji).toContain('happy.gif');
  });
});

describe('评论标识与置顶评论', () => {
  it('已有评论标识不请求详情，保留大整数字符串', async () => {
    const d = toDyn(item({}, { comment_type: 17, comment_id_str: '900001234567890123' }))!;
    expect(await dynCommentTarget(d)).toEqual({ type: 17, oid: '900001234567890123' });
    expect(get).not.toHaveBeenCalled();
  });
  it('视频动态缺少 basic 时使用明确的 aid', async () => {
    const d = toDyn(item({ major: { archive: { aid: 123, bvid: 'BVtest' } } }))!;
    expect(await dynCommentTarget(d)).toEqual({ type: 1, oid: '123' }); expect(get).not.toHaveBeenCalled();
  });
  it('缺少标识时点开才查详情，成功后复用结果', async () => {
    const d = toDyn(item())!;
    get.mockResolvedValue({ item: item({}, { comment_type: 17, comment_id_str: '1001' }) });
    expect(await dynCommentTarget(d)).toEqual({ type: 17, oid: '1001' });
    await dynCommentTarget(d);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/x/polymer/web-dynamic/v1/detail', { id: d.id });
  });
  it('不支持的动态不猜测评论类型，失败交给界面回退', async () => {
    get.mockResolvedValue({ item: item() });
    expect(await dynCommentTarget(toDyn(item())!)).toBeNull();
    get.mockRejectedValue(new Error('HTTP 412'));
    await expect(dynCommentTarget(toDyn(item())!)).rejects.toThrow('HTTP 412');
  });
  it('置顶优先并去重，评论表情保留原始地址', async () => {
    const reply = (rpid: number) => ({ rpid, content: { message: '赞[开心]', emote: { '[开心]': { url: '//i0.hdslb.com/happy.png' } } } });
    get.mockResolvedValue({ top_replies: [reply(2)], upper: { top: reply(2) }, replies: [reply(1), reply(2)], page: { acount: 8 } });
    const r = await dynReplies(17, '1001');
    expect(r.list.map((x) => x.rpid)).toEqual([2, 1]); expect(r.count).toBe(8);
    expect(r.list[0].richText).toEqual([{ text: '赞' }, { text: '[开心]', emoji: 'https://i0.hdslb.com/happy.png' }]);
  });
});
