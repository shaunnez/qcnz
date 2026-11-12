import WX0 from './wx.json';

export const HOUR = 3600e3, DAYMS = 86400e3, TZ = 13 * HOUR; // NZDT
const parseLocal = s => Date.parse(s.length === 16 ? s + ':00+13:00' : s);
export let WX = WX0;
export let T0 = parseLocal(WX.t0);
export const tEnd = () => T0 + (WX.n - 1) * HOUR;
export function setWX(w) { WX = w; T0 = parseLocal(w.t0); }

// Date parts in New Zealand time, for any device time zone.
export function nz(ts) {
  const d = new Date(ts + TZ);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), wd: d.getUTCDay() };
}
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const p2 = n => String(n).padStart(2, '0');
export const fmtTime = ts => { const t = nz(ts); return p2(t.h) + ':' + p2(t.mi); };
export const fmtDay = ts => { const t = nz(ts); return WD[t.wd] + ' ' + t.d + ' ' + MO[t.mo]; };
export const fmtWd = ts => WD[nz(ts).wd];

export function wxAt(ts, zone) {
  const z = WX.zones[Math.max(0, Math.min(WX.zones.length - 1, zone))];
  let f = (ts - T0) / HOUR;
  const inRange = f >= 0 && f <= WX.n - 1;
  f = Math.max(0, Math.min(WX.n - 1.001, f));
  const i = Math.floor(f), u = f - i;
  const L = k => { const a = z[k][i] ?? 0, b = z[k][i + 1] ?? a; return a + (b - a) * u; };
  const a = z.wind_direction_10m[i] ?? 0, b = z.wind_direction_10m[i + 1] ?? a;
  const dd = ((b - a + 540) % 360) - 180;
  return {
    inRange, temp: L('temperature_2m'), feels: L('apparent_temperature'), rain: L('precipitation'),
    prob: L('precipitation_probability'), cloud: L('cloud_cover') / 100, wind: L('wind_speed_10m'),
    gust: L('wind_gusts_10m'), dir: (a + dd * u + 360) % 360, uv: L('uv_index'),
    code: z.weather_code[u < 0.5 ? i : i + 1] ?? 0
  };
}

export function describe(code) {
  if (code === 0) return 'Clear';
  if (code === 1) return 'Mostly clear';
  if (code === 2) return 'Part cloud';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 67) return code >= 65 ? 'Heavy rain' : 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Cloud';
}
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compass = deg => COMPASS[Math.round(deg / 45) % 8];

// Small line icons. Stroke colour comes from CSS.
export function icon(code, day = true) {
  const sun = '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7 7 17M17 7l1.7-1.7"/>';
  const moon = '<path d="M19.5 14.2A8 8 0 0 1 9.8 4.5a8 8 0 1 0 9.7 9.7z"/>';
  const cloud = '<path d="M7 18.5h9.5a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 6.5 11.6 3.5 3.5 0 0 0 7 18.5z"/>';
  const smallSun = '<circle cx="8" cy="8" r="2.8"/><path d="M8 2v1.6M2 8h1.6M3.8 3.8l1.1 1.1M12.2 3.8l-1.1 1.1"/>';
  const smallMoon = '<path d="M11.5 6.6A4.6 4.6 0 0 1 6 3a4.6 4.6 0 1 0 5.5 3.6z"/>';
  const lowCloud = '<path d="M8.5 19h8.3a3.6 3.6 0 0 0 .5-7.16A5 5 0 0 0 8 12.7 3.2 3.2 0 0 0 8.5 19z"/>';
  const hiCloud = '<path d="M7 15.5h9.5a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 6.5 8.6 3.5 3.5 0 0 0 7 15.5z"/>';
  let g;
  if (code <= 1) g = day ? sun : moon;
  else if (code === 2) g = (day ? smallSun : smallMoon) + lowCloud;
  else if (code === 3) g = cloud;
  else if (code === 45 || code === 48) g = hiCloud + '<path d="M5 18.5h14M7 21.5h10"/>';
  else if (code >= 51 && code <= 57) g = hiCloud + '<path d="M9 18.3v.01M12 19.8v.01M15 18.3v.01M10.5 21.5v.01M13.5 21.5v.01" stroke-width="2.2"/>';
  else if (code >= 95) g = hiCloud + '<path d="M12.5 16.5l-2.2 3.2h3l-1.6 2.8"/>';
  else if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) g = hiCloud + '<path d="M9 18l-1 3.2M12.5 18l-1 3.2M16 18l-1 3.2"/>';
  else g = cloud;
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + g + '</svg>';
}

// Sun position. Azimuth is from north, clockwise. Angles in radians.
export function sunPos(ts, lat = -41.17, lon = 174.08) {
  const rad = Math.PI / 180, d = ts / DAYMS - 0.5 + 2440588 - 2451545;
  const M = rad * (357.5291 + 0.98560028 * d);
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const Ls = M + C + rad * 102.9372 + Math.PI, e = rad * 23.4397;
  const dec = Math.asin(Math.sin(e) * Math.sin(Ls)), ra = Math.atan2(Math.sin(Ls) * Math.cos(e), Math.cos(Ls));
  const phi = rad * lat, th = rad * (280.16 + 360.9856235 * d) + rad * lon, Hh = th - ra;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(Hh));
  const az = Math.atan2(Math.sin(Hh), Math.cos(Hh) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI;
  return { alt, az };
}
export function sunTimes(dayStart) {
  // Search for the times when the sun crosses -0.83 degrees.
  let rise = null, set = null, prev = sunPos(dayStart).alt;
  const lim = -0.833 * Math.PI / 180;
  for (let m = 2; m <= 1440; m += 2) {
    const a = sunPos(dayStart + m * 60e3).alt;
    if (prev < lim && a >= lim && rise === null) rise = dayStart + m * 60e3;
    if (prev >= lim && a < lim) set = dayStart + m * 60e3;
    prev = a;
  }
  return { rise, set };
}

// Forecast summary for a walk window.
export function summarize(t0, t1, zone) {
  const s = { tmin: 99, tmax: -99, rain: 0, prob: 0, gust: 0, wind: 0, uv: 0, cloud: 0, n: 0, firstRain: null, codes: {} };
  for (let t = t0; t <= t1; t += HOUR) {
    const w = wxAt(t, zone);
    s.tmin = Math.min(s.tmin, w.temp); s.tmax = Math.max(s.tmax, w.temp); s.rain += w.rain;
    s.prob = Math.max(s.prob, w.prob); s.gust = Math.max(s.gust, w.gust); s.wind = Math.max(s.wind, w.wind);
    s.uv = Math.max(s.uv, w.uv); s.cloud += w.cloud; s.n++;
    if (w.rain >= 0.2 && s.firstRain === null) s.firstRain = t;
    s.codes[w.code] = (s.codes[w.code] || 0) + 1;
  }
  s.cloud /= Math.max(s.n, 1);
  s.code = +Object.keys(s.codes).sort((a, b) => s.codes[b] - s.codes[a])[0];
  if (s.rain >= 1) s.code = Math.max(...Object.keys(s.codes).map(Number).filter(c => c >= 51), s.code);
  const mid = wxAt((t0 + t1) / 2, zone);
  s.dir = mid.dir;
  const v = [];
  if (s.rain < 0.3 && s.prob < 35) v.push('Dry walk.');
  else if (s.rain < 1) v.push('A light shower is possible.');
  else if (s.firstRain !== null && s.firstRain - t0 >= 2 * HOUR) v.push('Rain from about ' + fmtTime(s.firstRain) + ', ' + s.rain.toFixed(0) + ' mm. Start early.');
  else v.push('Wet walk, about ' + s.rain.toFixed(0) + ' mm. Pack a rain jacket and a dry layer.');
  if (s.gust >= 75) v.push('Gusts to ' + Math.round(s.gust) + ' km/h from the ' + compass(s.dir) + '. Take care on open ridge.');
  else if (s.gust >= 50) v.push('Gusts to ' + Math.round(s.gust) + ' km/h from the ' + compass(s.dir) + '.');
  if (s.uv >= 8) v.push('UV is very high at midday. Use a hat and sunscreen.');
  else if (s.uv >= 6 && s.cloud < 0.85) v.push('UV is high. Use sunscreen.');
  s.verdict = v;
  return s;
}

const API = 'https://api.open-meteo.com/v1/forecast?latitude=-41.10,-41.19,-41.24&longitude=174.20,174.07,173.95&elevation=60,330,180&hourly=temperature_2m,apparent_temperature,precipitation,precipitation_probability,cloud_cover,wind_speed_10m,wind_gusts_10m,wind_direction_10m,weather_code,uv_index&timezone=Pacific%2FAuckland&start_date=2026-11-12&end_date=2026-11-18';
export async function fetchLive() {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(API, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!Array.isArray(j) || j.length < 3 || !j[0].hourly) throw new Error('Unexpected data');
    const keys = Object.keys(WX0.zones[0]);
    const out = { fetched: new Date().toISOString(), t0: j[0].hourly.time[0], n: j[0].hourly.time.length, zones: j.map(z => { const o = {}; for (const k of keys) o[k] = z.hourly[k]; return o; }) };
    if (out.n < 48) throw new Error('Unexpected data');
    return out;
  } finally { clearTimeout(timer); }
}
