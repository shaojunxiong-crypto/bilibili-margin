/**
 * 映间后台 service worker：只做一件事——足迹计时。
 * 各标签页在活跃时发心跳（一段时间区间），这里串行地读-改-写 chrome.storage.local，
 * 多标签页同时打开也不会互相覆盖或重复累计（v0.30 及更早是各页面自己读改写，会丢数据）。
 */
import { APP, APP_AUTH_KEY, FEED_BASE, appSign, toAppItem, type AppAuth, type AppItem, type AppMessage } from '../shared/app-feed';
import { ACTIVITY_KEY, SLOTS_KEY, applyBeat, dayKey, hhmm, mergeActivity, sanitizeActivity, type Activity, type FpMessage } from '../shared/activity';
import { getSponsorSegments } from './sponsor';
import type { SponsorMessage } from '../shared/sponsor';

let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; };

async function handle(m: FpMessage): Promise<unknown> {
  const v = await chrome.storage.local.get([ACTIVITY_KEY, SLOTS_KEY]);
  const data = (v[ACTIVITY_KEY] as Activity | undefined) ?? {};
  const now = Date.now();
  if (m.op === 'open') {
    const d = new Date(Math.min(m.at || now, now));
    const day = (data[dayKey(d)] ??= { s: 0 });
    if (day.f) return { ok: true };
    day.f = hhmm(d);
    await chrome.storage.local.set({ [ACTIVITY_KEY]: data });
    return { ok: true };
  }
  if (m.op === 'beat') {
    const to = Math.min(Number(m.to) || 0, now + 5_000);
    const from = Math.max(Number(m.from) || 0, to - 70_000);
    if (!(to > from)) return { ok: false };
    const slots = (v[SLOTS_KEY] as Record<string, number[]> | undefined) ?? {};
    const added = applyBeat(data, slots, from, to);
    if (added) await chrome.storage.local.set({ [ACTIVITY_KEY]: data, [SLOTS_KEY]: slots });
    return { ok: true, added };
  }
  if (m.op === 'merge') {
    for (const [k, x] of Object.entries(m.days ?? {})) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
      const day = (data[k] ??= { s: 0 });
      day.h = Math.max(0, Math.round(Number(x.h) || 0));
      if (x.hf) day.hf = x.hf;
    }
    await chrome.storage.local.set({ [ACTIVITY_KEY]: data });
    return { ok: true };
  }
  if (m.op === 'import') {
    const add = sanitizeActivity(m.days);
    if (!add) return { ok: false };
    mergeActivity(data, add);
    await chrome.storage.local.set({ [ACTIVITY_KEY]: data });
    return { ok: true, days: Object.keys(add).length };
  }
  return { ok: false };
}

/* ---------- App 推荐流（v0.48 实验） ---------- */
async function auth(): Promise<AppAuth | null> {
  const a = (await chrome.storage.local.get(APP_AUTH_KEY))[APP_AUTH_KEY] as AppAuth | undefined;
  if (!a?.key) return null;
  if (a.exp && a.exp * 1000 < Date.now()) { await chrome.storage.local.remove(APP_AUTH_KEY); return null; }
  return a;
}
async function getJ(url: string): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = await fetch(url, { credentials: 'omit' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function handleApp(m: AppMessage): Promise<unknown> {
  if (m.op === 'state') { const a = await auth(); return { ok: true, authed: !!a, mid: a?.mid ?? 0, exp: a?.exp ?? 0 }; }
  if (m.op === 'revoke') { await chrome.storage.local.remove(APP_AUTH_KEY); return { ok: true }; }
  if (m.op === 'save') {
    const key = String(m.key || '').replace(/[^0-9a-zA-Z_-]/g, '').slice(0, 128);
    if (!key) return { ok: false };
    const a: AppAuth = { key, mid: Math.max(0, Math.floor(Number(m.mid) || 0)), exp: Math.floor(Date.now() / 1000) + Math.max(0, Number(m.expiresIn) || 0) };
    await chrome.storage.local.set({ [APP_AUTH_KEY]: a });
    return { ok: true };
  }
  if (m.op === 'feed') {
    const a = await auth();
    const q: Record<string, string | number> = { ...FEED_BASE, idx: Math.max(0, Math.floor(Number(m.idx) || 0)), pull: m.idx ? 0 : 1, flush: 0, column: 4, fnval: 272 };
    if (a) q.access_key = a.key;
    const d = await getJ(`${APP.feed}?${appSign(q)}`);
    if (d.code === -101 || d.code === 62011) { await chrome.storage.local.remove(APP_AUTH_KEY); return { ok: false, error: '授权已失效，请在设置里重新扫码', expired: true }; }
    if (d.code !== 0) return { ok: false, error: d.message || `code ${d.code}` };
    const raw = (d.data?.items ?? []) as unknown[];
    const items = raw.map(toAppItem).filter((x): x is AppItem => !!x);
    const last = raw.length ? Number((raw[raw.length - 1] as { idx?: number }).idx) || 0 : 0;
    return { ok: true, items, next: last, personal: !!a };
  }
  if (m.op === 'dislike') {
    const a = await auth();
    if (!a) return { ok: false, error: '未授权' };
    const d = await getJ(`${m.cancel ? APP.undislike : APP.dislike}?${appSign({ ...FEED_BASE, access_key: a.key, goto: 'av', id: m.aid, mid: m.mid, reason_id: m.reason })}`);
    return { ok: d.code === 0, error: d.message };
  }
  return { ok: false };
}

chrome.runtime.onMessage.addListener((m: FpMessage | AppMessage | SponsorMessage, _sender, reply) => {
  if (m && m.margin === 'sponsor') { getSponsorSegments(m.bvid).then((segments) => reply({ ok: true, segments }), () => reply({ ok: false })); return true; }
  if (m && m.margin === 'app') { handleApp(m).then(reply, (e) => reply({ ok: false, error: String((e as Error)?.message || e) })); return true; }
  if (!m || m.margin !== 'fp') return;
  serial(() => handle(m)).then(reply, (e) => reply({ ok: false, error: String(e) }));
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  // v0.30 及更早的页面级节流戳，已不再使用
  chrome.storage.local.remove('margin:activity-tick').catch(() => {});
});
