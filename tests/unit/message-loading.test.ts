import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fillPeople, sessions, type Session } from '../../src/content/api/msg';

let urls: string[], response: (url: URL) => unknown | Promise<unknown>;
beforeEach(() => {
  urls = []; response = () => ({ code: 0, data: [] });
  vi.stubGlobal('fetch', vi.fn(async (raw: string) => {
    urls.push(raw); return new Response(JSON.stringify(await response(new URL(raw))), { headers: { 'content-type': 'application/json' } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('非阻塞会话资料', () => {
  it('返回会话列表不等待可选昵称头像请求', async () => {
    response = u => u.pathname.endsWith('get_sessions') ? { code: 0, data: { session_list: [{ talker_id: 991001, session_type: 1, unread_count: 3, session_ts: 1000, last_msg: { msg_type: 1, content: '{"content":"预览消息"}' } }] } } : new Promise(() => {});
    const page = await sessions();
    expect(page.list[0]).toMatchObject({ talker: 991001, unread: 3, last: '预览消息' });
    expect(urls).toHaveLength(1);
  });
  it('批量资料先显示，单个慢资料不拖住其他昵称', async () => {
    let release!: (value: unknown) => void;
    const slow = new Promise(r => { release = r; });
    response = u => u.pathname.endsWith('/cards') ? { code: 0, data: [{ mid: 991101, name: '已返回的联系人', face: '//i0.hdslb.com/one.png' }] } : slow;
    const list: Session[] = [991101, 991102].map(talker => ({ talker, unread: 0, last: '', ts: 0 }));
    const updates: string[][] = [];
    const task = fillPeople(list, () => updates.push(list.map(s => s.person?.name || '')));
    await vi.waitFor(() => expect(list[0].person?.name).toBe('已返回的联系人'));
    expect(list[1].person).toBeUndefined(); expect(updates).toContainEqual(['已返回的联系人', '']);
    release({ code: 0, data: { card: { name: '稍后返回的联系人', face: '//i0.hdslb.com/two.png' } } }); await task;
    expect(list[1].person?.name).toBe('稍后返回的联系人');
  });
  it('当前页面再次进入已补齐的会话时复用资料，不重复请求', async () => {
    response = () => ({ code: 0, data: [{ mid: 991201, name: '缓存联系人', face: '' }] });
    const make = (): Session[] => [{ talker: 991201, unread: 0, last: '', ts: 0 }];
    await fillPeople(make()); const count = urls.length, next = make();
    await fillPeople(next);
    expect(next[0].person?.name).toBe('缓存联系人'); expect(urls).toHaveLength(count);
  });
});
