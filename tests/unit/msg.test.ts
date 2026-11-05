import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import * as api from '../../src/content/api/msg';

let calls: {url:string;init?:RequestInit}[];
let route: (url:URL,init?:RequestInit) => unknown;
beforeEach(() => {
  calls = [];
  route = () => ({code:0,data:{}});
  vi.stubGlobal('fetch',vi.fn(async (input:string,init?:RequestInit) => {
    calls.push({url:input,init});
    return new Response(JSON.stringify(route(new URL(input),init)),{status:200,headers:{'content-type':'application/json'}});
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('消息未读处理',() => {
  it('拒绝把失败的私信 ACK 计为成功',async () => {
    route = () => ({code:-111,message:'csrf failed'});
    await expect(api.ackSession(8,12,'csrf')).rejects.toThrow('csrf failed');
  });
  it('会话分页超过25页仍处理到末页',async () => {
    let page = 0;
    route = (url) => url.pathname.endsWith('get_sessions') ? {code:0,data:{has_more:++page<26,session_list:[{talker_id:page,session_type:1,unread_count:1,max_seqno:10,session_ts:1000-page}]}} : {code:0};
    expect(await api.readAllSessions('csrf',() => {})).toBe(26);
    expect(calls.filter(c=>c.url.includes('update_ack'))).toHaveLength(26);
  });
  it('不传进度回调也会返回已处理数量',async () => {
    route = (url) => url.pathname.endsWith('get_sessions') ? {code:0,data:{has_more:false,session_list:[{talker_id:1,session_type:1,unread_count:1,max_seqno:10}]}} : {code:0};
    expect(await api.readAllSessions('csrf')).toBe(1);
  });
  it('拒绝把停滞的分页误报为全部完成',async () => {
    route = () => ({code:0,data:{has_more:true,session_list:[{session_ts:100,session_type:1,unread_count:0}]}});
    await expect(api.readAllSessions('csrf')).rejects.toThrow('未完成');
    expect(calls).toHaveLength(2);
  });
  it('系统未读游标取个人通知与公告中的最新值并保留精度',async () => {
    route = (url) => ({code:0,data:{system_notify_list:url.pathname.includes('unified') ? [{id:2,cursor:'9007199254740995',time_at:'2026-11-01 10:00:00'}] : [{id:1,cursor:'9007199254740993',time_at:'2026-11-02 10:00:00'}]}});
    const page = await api.system('csrf',null);
    expect(page.top).toBe('9007199254740995');
    await api.systemRead(page.top!,'csrf');
    expect(new URL(calls.at(-1)!.url).searchParams.get('cursor')).toBe('9007199254740995');
  });
  it('不拿系统通知ID充当已读游标',async () => {
    route = () => ({code:0,data:{system_notify_list:[{id:999,time_at:'2026-11-01 10:00:00'}]}});
    const page = await api.system('csrf',null);
    await api.systemRead(page.top!,'csrf');
    expect(calls.some(c=>c.url.includes('update_cursor'))).toBe(false);
  });
  it('全部已读覆盖五类且只提交获取到的游标',async () => {
    route = (url) => url.pathname.includes('query_') ? {code:0,data:{system_notify_list:[{cursor:'123'}]}} : {code:0,data:{}};
    expect(await api.readAllMessages('csrf')).toEqual([]);
    for (const path of ['/x/msgfeed/reply','/x/msgfeed/at','/x/msgfeed/like','/session_svr/v1/session_svr/get_sessions','/x/sys-msg/update_cursor']) expect(calls.some(c=>new URL(c.url).pathname===path)).toBe(true);
    for (const c of calls.filter(c=>c.url.includes('/x/msgfeed/'))) expect(new URL(c.url).searchParams.get('platform')).toBe('web');
  });
  it('分类失败不会阻止其他类别，失败类别被返回',async () => {
    route = (url) => url.pathname.endsWith('/like') || url.pathname.includes('query_unified') ? {code:-1,message:'unavailable'} : {code:0,data:{}};
    expect((await api.readAllMessages('csrf')).sort()).toEqual(['like','system']);
    expect(calls.some(c=>c.url.includes('/at?'))).toBe(true);
  });
  it('读取未读失败时不伪造零未读',async () => {
    route = () => ({code:-101,message:'not logged in'});
    await expect(api.unread()).rejects.toThrow('not logged in');
  });
});
