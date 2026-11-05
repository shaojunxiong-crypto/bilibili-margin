/* eslint-disable @typescript-eslint/no-explicit-any */
/** 天气：Open-Meteo（免密钥、CORS 开放）+ ipwho.is 按 IP 粗定位；城市可手动改（Open-Meteo 地理编码）。 */

export type WeatherKind = 'clear' | 'partly' | 'cloud' | 'rain' | 'drizzle' | 'storm' | 'snow' | 'sleet' | 'mist' | 'windy' | 'heat';
export interface Loc { name: string; lat: number; lon: number; manual?: boolean; region?: string }
export interface WxHour { label: string; hour: number; kind: WeatherKind; temp: number }
export interface WxDay { name: string; kind: WeatherKind; low: number; high: number }
export interface Wx {
  loc: Loc; temp: number; feels: number; wind: number; rainPct: number; kind: WeatherKind; condition: string;
  offset: number; hours: WxHour[]; days: WxDay[]; at: number;
}

const LOC_KEY = 'margin:weather-loc';
const CACHE_KEY = 'margin:weather-cache';
const TTL = 30 * 60e3;
let locRevision = 0;

/** WMO 天气代码 → 天空种类 + 中文 */
export function wmo(code: number): [WeatherKind, string] {
  if (code === 0) return ['clear', '晴'];
  if (code === 1) return ['partly', '晴间多云'];
  if (code === 2) return ['partly', '多云'];
  if (code === 3) return ['cloud', '阴'];
  if (code === 45 || code === 48) return ['mist', '雾'];
  if (code >= 51 && code <= 55) return ['drizzle', '毛毛雨'];
  if (code === 56 || code === 57 || code === 66 || code === 67) return ['sleet', '冻雨'];
  if (code === 61) return ['rain', '小雨'];
  if (code === 63) return ['rain', '中雨'];
  if (code === 65) return ['rain', '大雨'];
  if (code >= 71 && code <= 77) return ['snow', code >= 75 ? '大雪' : '雪'];
  if (code >= 80 && code <= 82) return ['rain', '阵雨'];
  if (code === 85 || code === 86) return ['snow', '阵雪'];
  if (code >= 95) return ['storm', '雷雨'];
  return ['cloud', '多云'];
}

export function savedLoc(): Loc | null {
  try { return JSON.parse(localStorage.getItem(LOC_KEY) || 'null'); } catch { return null; }
}

export function setLoc(loc: Loc): void {
  locRevision++;
  localStorage.setItem(LOC_KEY, JSON.stringify({ ...loc, manual: true }));
  localStorage.removeItem(CACHE_KEY);
  dispatchEvent(new Event('margin:wx-loc'));
}
/** 回到按 IP 自动定位（#3：移动宽带的 IP 定位常常不准，所以设置里可以手动选城市，也能退回自动） */
export function clearLoc(): void {
  locRevision++;
  localStorage.removeItem(LOC_KEY);
  localStorage.removeItem(CACHE_KEY);
  dispatchEvent(new Event('margin:wx-loc'));
}

async function ipLoc(): Promise<Loc> {
  try {
    const r = await (await fetch('https://ipwho.is/?lang=zh-CN&fields=success,city,latitude,longitude')).json();
    if (r?.success && typeof r.latitude === 'number') return { name: r.city || '当前位置', lat: r.latitude, lon: r.longitude };
  } catch { /* 落到默认 */ }
  return { name: '上海', lat: 31.23, lon: 121.47 };
}

export interface Place extends Loc { region: string }
/** 城市候选：同名城市很多（如「朝阳」），带上省份 / 国家给人挑 */
export async function geocodeList(q: string, n = 6): Promise<Place[]> {
  const query = q.trim();
  if (!query) return [];
  const queries = [query];
  if (/^[\u3400-\u9fff]{2,}$/.test(query) && !/(?:省|市|区|县|自治州|盟|旗|镇|乡|村)$/.test(query)) queries.push(`${query}市`);
  const results = await Promise.allSettled(queries.map(async name => {
    const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=${n}&language=zh&name=${encodeURIComponent(name)}`);
    if (!response.ok) throw new Error(`城市搜索失败（HTTP ${response.status}）`);
    const data = await response.json();
    if (data?.error) throw new Error(data.reason || '城市搜索暂时不可用');
    return (data?.results ?? []) as any[];
  }));
  const successful = results.filter(result => result.status === 'fulfilled');
  if (!successful.length) throw new Error('城市搜索暂时不可用');
  const places = new Map<string, Place>();
  for (const g of successful.flatMap(result => result.value)) {
    if (typeof g.name !== 'string' || !Number.isFinite(g.latitude) || !Number.isFinite(g.longitude)) continue;
    const key = `${g.latitude},${g.longitude}`;
    if (places.has(key)) continue;
    const region = [...new Set([g.admin1, g.admin2, g.country].filter((part: unknown) => typeof part === 'string' && part && part !== g.name))].join(' · ');
    places.set(key, { name: g.name, lat: g.latitude, lon: g.longitude, region });
  }
  return [...places.values()];
}

const WEEK = '日一二三四五六';

export async function weather(): Promise<Wx> {
  const revision = locRevision;
  let loc = savedLoc();
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') as Wx | null;
    if (loc && c?.loc?.lat === loc.lat && c.loc.lon === loc.lon && Date.now() - c.at < TTL) return { ...c, loc };
  } catch { /* 重新取 */ }
  if (!loc) {
    const located = await ipLoc();
    const current = savedLoc();
    if (revision !== locRevision || current?.manual) throw new DOMException('天气位置已更改', 'AbortError');
    // 并发首次加载时，沿用另一请求已保存的自动定位。
    loc = current ?? located;
    if (!current) localStorage.setItem(LOC_KEY, JSON.stringify(loc));
  }
  const locationSnapshot = localStorage.getItem(LOC_KEY);
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&timezone=auto&forecast_days=7`
    + '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m'
    + '&hourly=temperature_2m,weather_code,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min';
  const d: any = await (await fetch(u)).json();
  if (revision !== locRevision || localStorage.getItem(LOC_KEY) !== locationSnapshot) throw new DOMException('天气位置已更改', 'AbortError');
  if (!d?.current) throw new Error('天气暂时取不到');
  const offset = Number(d.utc_offset_seconds) || 0;
  const nowIso: string = d.current.time; // 当地时间 "2026-10-29T01:15"
  const nowH = new Date(`${nowIso.slice(0, 13)}:00Z`).getTime();
  const times: string[] = d.hourly.time;
  let i0 = times.findIndex((t) => new Date(`${t}Z`).getTime() >= nowH);
  if (i0 < 0) i0 = 0;
  const hours: WxHour[] = [];
  for (let k = 0; k < 6; k++) {
    const i = i0 + k * 3;
    if (i >= times.length) break;
    const hr = Number(times[i].slice(11, 13));
    hours.push({ label: k === 0 ? '现在' : String(hr).padStart(2, '0'), hour: hr, kind: wmo(d.hourly.weather_code[i])[0], temp: d.hourly.temperature_2m[i] });
  }
  const days: WxDay[] = (d.daily.time as string[]).map((t, i) => ({
    name: i === 0 ? '今天' : i === 1 ? '明天' : `周${WEEK[new Date(`${t}T00:00Z`).getUTCDay()]}`,
    kind: wmo(d.daily.weather_code[i])[0], low: d.daily.temperature_2m_min[i], high: d.daily.temperature_2m_max[i],
  }));
  const [kind, condition] = wmo(d.current.weather_code);
  const wx: Wx = {
    loc, temp: d.current.temperature_2m, feels: d.current.apparent_temperature, wind: d.current.wind_speed_10m,
    rainPct: d.hourly.precipitation_probability?.[i0] ?? 0, kind, condition, offset, hours, days, at: Date.now(),
  };
  localStorage.setItem(CACHE_KEY, JSON.stringify(wx));
  return wx;
}
