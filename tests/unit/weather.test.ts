import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLoc, geocodeList, savedLoc, setLoc, weather } from '../../src/content/api/weather';

const LOC_KEY = 'margin:weather-loc';
const CACHE_KEY = 'margin:weather-cache';
const shandong = { name: '珠海', lat: 35.87124, lon: 119.99638 };
const guangdong = { name: '珠海市', lat: 22.27694, lon: 113.56778 };
const northPlace = { name: shandong.name, latitude: shandong.lat, longitude: shandong.lon, admin1: '山东省', admin2: '青岛市', country: '中国' };
const southPlace = { name: guangdong.name, latitude: guangdong.lat, longitude: guangdong.lon, admin1: '广东省', admin2: '珠海市', country: '中国' };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const forecast = (temp: number) => ({
  utc_offset_seconds: 28800,
  current: { time: '2026-11-05T20:00', temperature_2m: temp, apparent_temperature: temp, weather_code: 3, wind_speed_10m: 9 },
  hourly: { time: ['2026-11-05T20:00'], temperature_2m: [temp], weather_code: [3], precipitation_probability: [20] },
  daily: { time: ['2026-11-05'], weather_code: [3], temperature_2m_min: [temp - 2], temperature_2m_max: [temp + 2] },
});
function deferredResponse() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
  vi.stubGlobal('dispatchEvent', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe('天气城市候选', () => {
  it('合并原词和市后缀查询，显示省市信息并按坐标去重', async () => {
    const fetcher = vi.fn(async (url: string) => {
      const query = new URL(url).searchParams.get('name');
      return response({ results: query === '珠海' ? [northPlace] : [southPlace, northPlace] });
    });
    vi.stubGlobal('fetch', fetcher);
    expect(await geocodeList(' 珠海 ')).toEqual([
      { ...shandong, region: '山东省 · 青岛市 · 中国' },
      { ...guangdong, region: '广东省 · 中国' },
    ]);
    expect(fetcher.mock.calls.map(([url]) => new URL(url).searchParams.get('name'))).toEqual(['珠海', '珠海市']);
    expect(savedLoc()).toBeNull();
  });
  it.each(['珠海市', '黄岛区', '云和县', '阿拉善盟', '阿坝藏族羌族自治州', 'London'])('已有后缀或非中文输入只查询原词 %s', async query => {
    const fetcher = vi.fn().mockResolvedValue(response({ results: [] }));
    vi.stubGlobal('fetch', fetcher);
    expect(await geocodeList(query)).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('广州等名称中的州字仍允许补查市后缀', async () => {
    const fetcher = vi.fn(async (_url: string) => response({ results: [] })); vi.stubGlobal('fetch', fetcher);
    await geocodeList('广州');
    expect(fetcher.mock.calls.map(([url]) => new URL(url).searchParams.get('name'))).toEqual(['广州', '广州市']);
  });
  it('空输入不发请求', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect(await geocodeList('  ')).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('一条查询失败时仍返回另一条成功结果', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (new URL(url).searchParams.get('name') === '珠海') throw new Error('offline');
      return response({ results: [southPlace] });
    }));
    expect(await geocodeList('珠海')).toEqual([{ ...guangdong, region: '广东省 · 中国' }]);
  });
  it('全部HTTP失败会抛错，区别于成功的空结果', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ reason: 'Unavailable' }, 503)));
    await expect(geocodeList('珠海')).rejects.toThrow();
    vi.stubGlobal('fetch', vi.fn(async () => response({ results: [] })));
    expect(await geocodeList('珠海')).toEqual([]);
  });
  it('原词空结果且补查失败时返回成功的空结果', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (new URL(url).searchParams.get('name') === '珠海市') throw new Error('offline');
      return response({});
    }));
    expect(await geocodeList('珠海')).toEqual([]);
  });
});

describe('天气位置与缓存', () => {
  it('兼容没有region的旧手动位置，保持原坐标直到用户重选', async () => {
    localStorage.setItem(LOC_KEY, JSON.stringify({ ...shandong, manual: true }));
    const fetcher = vi.fn(async (_url: string) => response(forecast(12))); vi.stubGlobal('fetch', fetcher);
    const result = await weather();
    expect(result.loc).toEqual({ ...shandong, manual: true });
    expect(savedLoc()).toEqual({ ...shandong, manual: true });
    expect(new URL(fetcher.mock.calls[0][0]).searchParams.get('latitude')).toBe(String(shandong.lat));
  });
  it('相同坐标复用缓存，并采用当前位置名称和地区信息', async () => {
    setLoc(shandong);
    vi.stubGlobal('fetch', vi.fn(async () => response(forecast(12))));
    const cached = await weather();
    setLoc({ ...shandong, name: '珠海街道', region: '山东省 · 青岛市 · 中国' });
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const result = await weather();
    expect(result.loc.name).toBe('珠海街道');
    expect(result.loc.region).toBe('山东省 · 青岛市 · 中国');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('缓存未过期但坐标不符时重新请求天气', async () => {
    setLoc(shandong);
    vi.stubGlobal('fetch', vi.fn(async () => response(forecast(12))));
    const cached = await weather();
    setLoc(guangdong);
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
    const fetcher = vi.fn(async () => response(forecast(25))); vi.stubGlobal('fetch', fetcher);
    const result = await weather();
    expect(result.loc.lat).toBe(guangdong.lat);
    expect(result.temp).toBe(25);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('换城后较慢的旧天气响应不能覆盖新缓存', async () => {
    const old = deferredResponse();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new URL(url).searchParams.get('latitude') === String(shandong.lat) ? old.promise : response(forecast(25))));
    setLoc(shandong);
    const pending = weather();
    setLoc(guangdong);
    await weather();
    const discarded = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    old.resolve(response(forecast(12))); await discarded;
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY)!);
    expect(cache.loc.lat).toBe(guangdong.lat);
    expect(cache.temp).toBe(25);
  });
  it.each([false, true])('清除定位后旧天气不得回写，包含重选相同坐标 %s', async reselect => {
    const old = deferredResponse(); vi.stubGlobal('fetch', vi.fn(() => old.promise));
    setLoc(shandong);
    const pending = weather();
    clearLoc(); if (reselect) setLoc(shandong);
    const discarded = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    old.resolve(response(forecast(12))); await discarded;
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });
  it('较慢的IP定位不能覆盖随后选中的手动城市', async () => {
    const ip = deferredResponse();
    const fetcher = vi.fn(async (url: string) => url.includes('ipwho.is') ? ip.promise : response(forecast(25)));
    vi.stubGlobal('fetch', fetcher);
    const pending = weather();
    setLoc(guangdong); await weather();
    const discarded = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    ip.resolve(response({ success: true, city: '上海', latitude: 31.23, longitude: 121.47 })); await discarded;
    expect(savedLoc()).toEqual({ ...guangdong, manual: true });
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)!).loc.lat).toBe(guangdong.lat);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('选择城市再恢复自动定位后，最初的IP请求也已过期', async () => {
    const ip = deferredResponse();
    const fetcher = vi.fn(async (url: string) => url.includes('ipwho.is') ? ip.promise : response(forecast(25)));
    vi.stubGlobal('fetch', fetcher);
    const pending = weather();
    setLoc(guangdong); clearLoc();
    const discarded = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    ip.resolve(response({ success: true, city: '上海', latitude: 31.23, longitude: 121.47 })); await discarded;
    expect(savedLoc()).toBeNull();
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('其他页面更新保存位置后，旧响应不能回写缓存', async () => {
    const old = deferredResponse(); vi.stubGlobal('fetch', vi.fn(() => old.promise));
    setLoc(shandong);
    const pending = weather();
    localStorage.setItem(LOC_KEY, JSON.stringify({ ...guangdong, manual: true }));
    const discarded = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    old.resolve(response(forecast(12))); await discarded;
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });
  it('同时首次加载时复用已完成的自动定位，较慢IP结果不能改写它', async () => {
    const first = deferredResponse(), second = deferredResponse();
    let ipCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('ipwho.is')) return ipCount++ === 0 ? first.promise : second.promise;
      return response(forecast(25));
    }));
    const firstLoad = weather(), secondLoad = weather();
    first.resolve(response({ success: true, city: '上海', latitude: 31.23, longitude: 121.47 }));
    await firstLoad;
    second.resolve(response({ success: true, city: '北京', latitude: 39.9, longitude: 116.4 }));
    const result = await secondLoad;
    expect(result.loc.name).toBe('上海');
    expect(savedLoc()?.name).toBe('上海');
  });
});
