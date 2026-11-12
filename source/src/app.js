import * as G from './geo.js';
import { STOPS, NIGHT_OPTIONS, DEFAULT_NIGHTS, POIS, LABELS, WILDLIFE, GUIDE, HELP } from './content.js';
import * as W from './weather.js';
import { createScene, envFrom } from './scene.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DAY0 = Date.parse('2026-11-13T00:00:00+13:00');
const DAYCOLS = ['#ffb454', '#ff7d5c', '#f472b6', '#b79cff', '#6fe0ff'];
const DEFAULT_STARTS = ['10:30', '09:00', '08:00', '08:30', '08:30'];
const KEY = 'qct-2026-v3', OLD_KEY = 'qct-2026-v2';
const KIND = {
  view: { label: 'Lookout', color: '#ffd27a', path: '<path d="M8 2 15 14H1z"/>' },
  history: { label: 'History', color: '#f9a8c8', path: '<path d="M8 1l7 7-7 7-7-7z"/>' },
  nature: { label: 'Nature', color: '#8ee6a0', path: '<circle cx="8" cy="8" r="6.5"/>' },
  rest: { label: 'Rest stop', color: '#9fd0ff', path: '<rect x="2" y="2" width="12" height="12" rx="2.5"/>' },
  boat: { label: 'Water taxi', color: '#ff9c8f', path: '<path d="M1.5 9h13l-2.2 4.5H3.7zM8 8V2l4.5 6z"/>' }
};
// Facility badges, with the colours of the printed route guide.
const FAC = {
  lodge: { c: '#3d4a8f', label: 'Lodge', p: '<path d="M3.5 8 8 4l4.5 4v4.5h-9z" fill="#fff" stroke="none"/>' },
  shelter: { c: '#4b4266', label: 'Shelter', p: '<path d="M3 8.2 8 4.5l5 3.7M5 8.5v4M11 8.5v4"/>' },
  water: { c: '#2f7fd1', label: 'Drinking water', p: '<path d="M8 3.5c2 2.4 3 3.9 3 5.4a3 3 0 0 1-6 0c0-1.5 1-3 3-5.4z" fill="#fff" stroke="none"/>' },
  toilet: { c: '#3f9a4a', label: 'Toilet', p: '<circle cx="5.8" cy="5" r="1.2" fill="#fff" stroke="none"/><circle cx="10.2" cy="5" r="1.2" fill="#fff" stroke="none"/><path d="M5.8 7.4v4.8M10.2 7.4v4.8" stroke-width="2"/>' },
  picnic: { c: '#c9951c', label: 'Picnic place', p: '<path d="M4 6.5h8M5.5 6.5 4 12M10.5 6.5 12 12M3 9.3h10"/>' },
  camp: { c: '#d0453c', label: 'Campsite', p: '<path d="M3 12 8 4l5 8z" fill="#fff" stroke="none"/>' },
  view: { c: '#8e2f4f', label: 'Lookout', p: '<circle cx="5.6" cy="8.5" r="2.1"/><circle cx="10.4" cy="8.5" r="2.1"/>' },
  boat: { c: '#c23b3b', label: 'Water taxi', p: '<path d="M3 9.5h10l-1.6 3H4.6z" fill="#fff" stroke="none"/><path d="M8 9V4l3 4"/>' }
};
const facInner = f => `<circle cx="8" cy="8" r="8" fill="${FAC[f].c}"/><g fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${FAC[f].p}</g>`;
const badge = f => `<svg class="bdg" viewBox="0 0 16 16" role="img" aria-label="${FAC[f].label}">${facInner(f)}</svg>`;
const badges = list => (list || []).map(badge).join('');
const poiFac = p => (p.kind === 'view' ? ['view'] : p.kind === 'boat' ? ['boat'] : []).concat(p.fac || []);
const glyph = k => `<svg viewBox="0 0 16 16" fill="${KIND[k].color}" stroke="#06181c" stroke-width="1.2">${KIND[k].path}</svg>`;
const kmTxt = m => (m / 1000).toFixed(1);
const durTxt = h => { const m = Math.round(h * 60); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + W.p2(m % 60); };

// ---------- saved data (this device only)
const S = Object.assign({ nights: DEFAULT_NIGHTS.slice(), starts: DEFAULT_STARTS.slice(), boat: '16:00', checkins: [], moments: [], spotted: {}, wx: null, tab: 'days', said: {} }, (() => {
  try {
    const cur = localStorage.getItem(KEY);
    if (cur) return JSON.parse(cur);
    const old = JSON.parse(localStorage.getItem(OLD_KEY) || '{}'); // keep check-ins from the first version, take the new start times
    delete old.starts; return old;
  } catch (e) { return {}; }
})());
let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage is not available */ } }, 300);
}
if (S.wx && S.wx.zones && Date.parse(S.wx.fetched) > Date.parse(W.WX.fetched)) W.setWX(S.wx);

// ---------- places
for (const p of POIS) {
  if (p.side && G.SIDES[p.side]) { p.km = G.SIDES[p.side].km; p.off = G.SIDES[p.side].len; }
  else { const s = G.nearestOnTrack(p.lat, p.lon); p.km = s.km; p.off = s.off; }
  Object.assign(p, G.world(p, 0.6));
}
function pt(lat, lon, ele, side) {
  const x = G.toX(lon), z = G.toZ(lat);
  return { lat, lon, ele, side, x, z, y: G.groundY(x, z) + 0.3 };
}

// ---------- the plan
let days = [];
function buildDays() {
  const seq = ['shipcove', ...S.nights, 'anakiwa'];
  days = [];
  for (let i = 0; i < seq.length - 1; i++) {
    const from = STOPS[seq[i]], to = STOPS[seq[i + 1]];
    const sOut = from.leave ? G.SIDES[from.leave] : null, sIn = to.arrive ? G.SIDES[to.arrive] : null;
    const fromKm = sOut ? sOut.km : 0, toKm = Math.min(sIn ? sIn.km : G.TOTAL_KM, G.TOTAL_KM);
    const pts = [];
    if (sOut) for (let k = sOut.pts.length - 1; k > 0; k--) { const p = sOut.pts[k]; pts.push(pt(p.lat, p.lon, p.ele, 1)); }
    const mainFrom = pts.length;
    for (let k = G.kmIndex(fromKm); k <= G.kmIndex(toKm); k++) { const p = G.TRACK[k]; const o = pt(p.lat, p.lon, p.ele, 0); o.km = p.km; pts.push(o); }
    const mainTo = pts.length;
    if (sIn) for (let k = 1; k < sIn.pts.length; k++) { const p = sIn.pts[k]; pts.push(pt(p.lat, p.lon, p.ele, 2)); }
    let d = 0, up = 0, ref = pts[0].ele;
    pts[0].d = 0;
    for (let k = 1; k < pts.length; k++) {
      d += pts[k].km !== undefined && pts[k - 1].km !== undefined ? (pts[k].km - pts[k - 1].km) * 1000 : G.distM(pts[k - 1].lat, pts[k - 1].lon, pts[k].lat, pts[k].lon); pts[k].d = d;
      if (pts[k].ele - ref > 6) { up += pts[k].ele - ref; ref = pts[k].ele; } else if (ref - pts[k].ele > 6) ref = pts[k].ele;
    }
    const guide = GUIDE[seq[i] + '>' + seq[i + 1]] || null;
    const hours = guide ? guide.h[1] : (d / 4000 + up / 600) * 1.2, date = DAY0 + i * W.DAYMS;
    const [sh, sm] = (S.starts[i] || '08:30').split(':').map(Number);
    const tStart = date + (sh * 60 + sm) * 60e3, tEnd = tStart + hours * W.HOUR;
    const [bh, bm] = (S.boat || '16:00').split(':').map(Number), boat = seq[i + 1] === 'anakiwa' ? date + (bh * 60 + bm) * 60e3 : null;
    const mid = (fromKm + toKm) / 2, outLen = pts[mainFrom].d;
    const pois = POIS.filter(p => !p.far && p.km >= fromKm - 0.05 && p.km <= toKm + 0.05)
      .map(p => ({ p, d: outLen + (p.km - fromKm) * 1000 })).sort((a, b) => a.d - b.d);
    days.push({ i, from, to, fromId: seq[i], toId: seq[i + 1], fromKm, toKm, pts, mainFrom, mainTo, dist: d, up, hours, date, tStart, tEnd, guide, boat,
      zone: mid < 30 ? 0 : mid < 52 ? 1 : 2, pois, color: DAYCOLS[i % 5] });
  }
  let off = 0;
  for (const d of days) { d.off = off; off += d.dist; }
  days.total = off;
}
function posOnDay(day, d) {
  const p = day.pts; d = Math.max(0, Math.min(day.dist, d));
  let lo = 0, hi = p.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m].d <= d) lo = m; else hi = m; }
  const a = p[lo], b = p[hi], u = b.d > a.d ? (d - a.d) / (b.d - a.d) : 0;
  const a2 = p[Math.max(0, lo - 5)], b2 = p[Math.min(p.length - 1, hi + 5)];
  let hx = b2.x - a2.x, hz = b2.z - a2.z; const hl = Math.hypot(hx, hz) || 1;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u, lat: a.lat + (b.lat - a.lat) * u, lon: a.lon + (b.lon - a.lon) * u,
    ele: a.ele + (b.ele - a.ele) * u, d, hx: hx / hl, hz: hz / hl };
}
function nearestOnDay(day, lat, lon) {
  let best = 1e12, bd = 0;
  for (const p of day.pts) { const m = G.distM(lat, lon, p.lat, p.lon); if (m < best) { best = m; bd = p.d; } }
  return { d: bd, off: best };
}
const todayIndex = () => { const i = Math.floor((Date.now() - DAY0) / W.DAYMS); return i >= 0 && i < days.length ? i : null; };
const dayOfTime = t => { const i = Math.floor((t - DAY0) / W.DAYMS); return i >= 0 && i < days.length ? i : null; };

// ---------- state
buildDays();
let sel = todayIndex() ?? 0;
let mode = 'live', simT = Date.now(), curWx = null, me = null, lastEnvT = 0, lastUiT = 0, lastZone = -1;
const R = { src: 'plan', day: 'all', playing: false, speed: 1, p: 0, segs: [], lastD: 0, lastSeg: -1 };
const scene = createScene($('gl'), $('labels'));
const zoneAt = t => { const i = dayOfTime(t); return days[i ?? sel].zone; };

// ---------- map content
function drawRoutes() {
  const segs = [];
  for (const day of days) {
    const dim = day.i !== sel, p = day.pts;
    if (day.mainFrom > 0) segs.push({ pts: p.slice(0, day.mainFrom + 1), color: day.color, dim, side: true });
    segs.push({ pts: p.slice(day.mainFrom, day.mainTo), color: day.color, dim });
    if (day.mainTo < p.length) segs.push({ pts: p.slice(day.mainTo - 1), color: day.color, dim, side: true });
  }
  for (const k of ['eatwell', 'onahau']) {
    const s = G.SIDES[k];
    segs.push({ pts: s.pts.map(q => pt(q.lat, q.lon, q.ele)), color: '#ffffff', dim: true, side: true });
  }
  scene.setRoutes(segs);
  drawWalked();
}
function drawWalked() {
  const out = [];
  for (const day of days) {
    let mx = 0;
    for (const c of S.checkins) if (c.day === day.i) mx = Math.max(mx, c.d);
    if (mx > 30) { const pts = day.pts.filter(p => p.d <= mx); pts.push(posOnDay(day, mx)); out.push(pts); }
  }
  scene.setWalked(out);
}
function mkEl(cls, html) { const el = document.createElement('div'); el.className = 'mk ' + cls; el.innerHTML = html; return el; }
function buildStopMarkers() {
  scene.clearMarkers('stops'); scene.clearLodgeLights();
  const seq = ['shipcove', ...S.nights, 'anakiwa'];
  seq.forEach((id, n) => {
    const s = STOPS[id], w = G.world(s, 1.2);
    const el = mkEl('stop', `<button><i></i>${esc(s.short)}</button>`);
    el.firstChild.addEventListener('click', () => showCard({
      kindHtml: n === 0 ? 'Start' : n === seq.length - 1 ? 'Finish' : 'Night ' + n, title: s.name, text: s.note, x: w.x, z: w.z,
      meta: n > 0 && n < seq.length - 1 ? 'Day ' + n + ' ends here. ' + kmTxt(days[n - 1].dist) + ' km walk.' : ''
    }));
    scene.addMarker({ el, ...w, pri: 100 - n, group: 'stops', w: s.short.length * 7 + 34, h: 28, force: true, noOcc: true });
    scene.addLodgeLight(w);
  });
}
function buildStaticMarkers() {
  for (const p of POIS) {
    const el = mkEl('poi', `<button aria-label="${esc(p.name)}"><span>${esc(p.name)}</span>${glyph(p.kind)}</button>`);
    el.dataset.z = '1'; p.el = el;
    el.firstChild.addEventListener('click', () => showPoi(p));
    scene.addMarker({ el, x: p.x, y: p.y, z: p.z, pri: p.kind === 'rest' ? 20 : 40, far: p.kind === 'rest' ? 130 : 420, group: 'poi' });
  }
  for (const l of LABELS) {
    if (l.water) {
      let bx = G.toX(l.lon), bz = G.toZ(l.lat), bh = G.heightM(bx, bz); const x0 = bx, z0 = bz;
      const rr = l.big ? 24 : 8;
      for (let dx = -rr; dx <= rr; dx += 2) for (let dz = -rr; dz <= rr; dz += 2) {
        const h = G.heightM(x0 + dx, z0 + dz) + Math.hypot(dx, dz) * 0.6;
        if (h < bh) { bh = h; bx = x0 + dx; bz = z0 + dz; }
      }
      l.lon = G.toLon(bx); l.lat = G.toLat(bz);
    }
    const w = G.world(l, l.water ? 0.2 : 1.5);
    const el = mkEl('lab' + (l.water ? ' water' : '') + (l.big ? ' big' : ''), `<span>${esc(l.name)}${l.sub ? `<small>${esc(l.sub)}</small>` : ''}</span>`);
    scene.addMarker({ el, ...w, pri: l.big ? 60 : 10, near: l.big ? 70 : 40, far: l.big ? 1e9 : 380, group: 'lab', noOcc: true, w: l.name.length * (l.water ? 9.5 : 8.5) + 10, h: l.sub ? 34 : 20 });
  }
}
let meMarker = null;
function drawMe() {
  if (R.playing || mode === 'replay') return;
  if (!me || !G.inBounds(me.lat, me.lon)) { scene.setWalker(null); if (meMarker) meMarker.el.style.visibility = 'hidden'; return; }
  const w = G.world(me, 0.3);
  scene.setWalker(w);
  if (!meMarker) meMarker = scene.addMarker({ el: mkEl('me', '<span>You</span>'), ...w, pri: 200, group: 'me', noOcc: true });
  meMarker.el.style.visibility = ''; meMarker.x = w.x; meMarker.y = w.y + 1.5; meMarker.z = w.z;
}
function buildMomentMarkers() {
  scene.clearMarkers('moments');
  S.moments.forEach(m => {
    const w = G.world(m, 0.8), el = mkEl('moment', '<button aria-label="Moment"></button>');
    el.firstChild.addEventListener('click', () => showCard({ kindHtml: 'Moment · ' + W.fmtDay(m.t) + ' ' + W.fmtTime(m.t), title: m.text, text: '', x: w.x, z: w.z }));
    scene.addMarker({ el, ...w, pri: 50, far: 300, group: 'moments' });
  });
}

// ---------- card and toast
let selPoi = null;
function showCard(o) {
  $('cardKind').innerHTML = o.kindHtml; $('cardTitle').textContent = o.title;
  if (o.html) $('cardText').innerHTML = o.html; else $('cardText').textContent = o.text || '';
  $('cardText').hidden = !o.text && !o.html; $('cardMeta').textContent = o.meta || ''; $('card').hidden = false;
  if (o.x !== undefined && o.fly !== false) scene.flyTo({ x: o.x, z: o.z, dist: Math.min(scene.getSpherical().r, 60), dur: 1100 });
}
function hideCard() { $('card').hidden = true; if (selPoi) { selPoi.el.classList.remove('sel'); selPoi = null; } }
function showPoi(p) {
  if (selPoi) selPoi.el.classList.remove('sel');
  selPoi = p; p.el.classList.add('sel');
  let meta = 'km ' + p.km.toFixed(1) + ' from Ship Cove';
  if (p.side) meta += ' · side track ' + Math.round(p.off / 10) * 10 + ' m';
  else if (p.off > 250) meta += ' · ' + (p.off > 1500 ? (p.off / 1000).toFixed(1) + ' km' : Math.round(p.off / 50) * 50 + ' m') + ' from the track';
  const day = days[trackDay()];
  if (me && me.day === day.i) { const e = day.pois.find(q => q.p === p); if (e) meta += e.d > me.d ? ' · ' + kmTxt(e.d - me.d) + ' km ahead of you' : ' · behind you'; }
  const fl = poiFac(p).filter(f => f !== 'view' && f !== 'boat');
  showCard({ kindHtml: glyph(p.kind) + KIND[p.kind].label, title: p.name, text: p.text, x: p.x, z: p.z,
    html: esc(p.text) + (fl.length ? `<span class="facrow">${fl.map(f => badge(f) + FAC[f].label).join(' &nbsp; ')}</span>` : ''), meta });
}
let toastTimer = 0;
function toast(msg, ms = 3200) {
  const t = $('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}

// ---------- header and time bar
function updateHud() {
  const d = days[sel];
  $('dayTitle').textContent = 'Day ' + (d.i + 1) + ' · ' + W.fmtDay(d.date);
  $('daySub').textContent = d.from.short + ' to ' + d.to.short + ' · ' + kmTxt(d.dist) + ' km';
}
const windArrow = deg => `<svg viewBox="0 0 16 16" style="transform:rotate(${Math.round(deg + 180)}deg)" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 14V2M3.5 6.5 8 2l4.5 4.5"/></svg>`;
function isDay(t) { return W.sunPos(t).alt > -0.01; }
function updateTimeUI(force) {
  const w = curWx; if (!w) return;
  $('timeLabel').textContent = W.fmtDay(simT) + ' · ' + W.fmtTime(simT);
  $('timeWx').textContent = w.inRange ? `${W.describe(w.code)} · ${Math.round(w.wind)} km/h ${W.compass(w.dir)}, gusts ${Math.round(w.gust)}` : 'No forecast for this time';
  $('wxChip').innerHTML = W.icon(w.code, isDay(simT)) + `<span><b class="num">${w.inRange ? Math.round(w.temp) + '°' : '–'}</b></span><small>${w.rain >= 0.1 ? w.rain.toFixed(1) + ' mm/h' : Math.round(w.prob) + '% rain'}<br>${['Outer sound', 'Ridge', 'Inner sound'][zoneAt(simT)]}</small>`;
  $('liveBtn').classList.toggle('on', mode === 'live');
  $('liveBtn').textContent = mode === 'live' ? 'Now' : 'Go to now';
  if (force || document.activeElement !== $('scrub')) $('scrub').value = Math.round((simT - W.T0) / 600e3);
}
function applyEnv() {
  const z = zoneAt(simT);
  curWx = W.wxAt(simT, z); lastEnvT = simT; lastZone = z;
  scene.setEnv(envFrom(simT, curWx));
}
function setTime(t, m) {
  mode = m; simT = t; applyEnv(); updateTimeUI(true);
  if (m !== 'replay') drawMe();
}
function buildTimebar() {
  const sc = $('scrub'); sc.max = Math.round((W.tEnd() - W.T0) / 600e3);
  const nd = Math.round((W.tEnd() - W.T0) / W.DAYMS) || 1;
  let h = '';
  for (let i = 0; i < nd; i++) { const t = W.T0 + i * W.DAYMS + 12 * W.HOUR; h += `<span class="${dayOfTime(t) !== null ? 'trip' : ''}">${W.fmtWd(t)} ${W.nz(t).d}</span>`; }
  $('ticks').innerHTML = h;
  // The slider track shows night and rain.
  const c = document.createElement('canvas'), n = nd * 48; c.width = n; c.height = 1;
  const x = c.getContext('2d');
  for (let i = 0; i < n; i++) {
    const t = W.T0 + (i + 0.5) * (W.tEnd() - W.T0) / n, alt = W.sunPos(t).alt * 57.3, w = W.wxAt(t, zoneAt(t));
    const dl = Math.max(0, Math.min(1, (alt + 6) / 12)), r = Math.min(1, w.rain / 1.5);
    const cr = 18 + dl * (86 - 18), cg = 30 + dl * (128 - 30), cb = 52 + dl * (138 - 52);
    x.fillStyle = `rgb(${Math.round(cr + r * (60 - cr))},${Math.round(cg + r * (150 - cg))},${Math.round(cb + r * (255 - cb))})`;
    x.fillRect(i, 0, 1, 1);
  }
  try { sc.style.setProperty('--scrub-bg', `url(${c.toDataURL()})`); } catch (e) { /* keep the plain track */ }
}

// ---------- Days panel
let planOpen = false;
function profileSvg(day) {
  const Wd = 340, Hh = 104, L = 28, Rr = 8, T = 8, Bm = 18, ymax = 500, pw = Wd - L - Rr, ph = Hh - T - Bm;
  const X = d => L + d / day.dist * pw, Y = e => T + ph - Math.min(e, ymax) / ymax * ph;
  const step = Math.max(1, Math.floor(day.pts.length / 170));
  let line = '';
  for (let i = 0; i < day.pts.length; i += step) line += (i ? 'L' : 'M') + X(day.pts[i].d).toFixed(1) + ' ' + Y(day.pts[i].ele).toFixed(1);
  const last = day.pts[day.pts.length - 1]; line += 'L' + X(last.d).toFixed(1) + ' ' + Y(last.ele).toFixed(1);
  let g = '';
  for (const v of [0, 250, 500]) g += `<line x1="${L}" x2="${Wd - Rr}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(255,255,255,.1)"/><text x="${L - 4}" y="${Y(v) + 3}" text-anchor="end">${v}</text>`;
  for (let k = 0; k <= day.dist / 1000; k += 5) g += `<text x="${X(k * 1000)}" y="${Hh - 4}" text-anchor="middle">${k}${k === 0 ? ' km' : ''}</text>`;
  let pm = '';
  for (const e of day.pois) if (e.p.kind !== 'rest') { const q = posOnDay(day, e.d); pm += `<circle cx="${X(e.d).toFixed(1)}" cy="${Y(q.ele).toFixed(1)}" r="3" fill="${KIND[e.p.kind].color}" stroke="#06181c"/>`; }
  const meX = me && me.day === day.i ? `<line x1="${X(me.d)}" x2="${X(me.d)}" y1="${T}" y2="${T + ph}" stroke="#fff" stroke-width="1.5"/><circle cx="${X(me.d)}" cy="${Y(posOnDay(day, me.d).ele)}" r="4" fill="#fff"/>` : '';
  return `<svg class="profile" id="profile" viewBox="0 0 ${Wd} ${Hh}" role="img" aria-label="Height profile of day ${day.i + 1}. Highest point ${Math.round(Math.max(...day.pts.map(p => p.ele)))} metres.">
    <defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${day.color}" stop-opacity=".55"/><stop offset="1" stop-color="${day.color}" stop-opacity=".03"/></linearGradient></defs>
    ${g}<path d="${line}L${X(day.dist)} ${Y(0)}L${L} ${Y(0)}Z" fill="url(#pg)"/><path d="${line}" fill="none" stroke="${day.color}" stroke-width="1.8" stroke-linejoin="round"/>
    ${pm}${meX}<line id="pcur" x1="0" x2="0" y1="${T}" y2="${T + ph}" stroke="#9ff3e6" stroke-width="1.5" visibility="hidden"/>
    <text id="pread" x="${Wd - Rr}" y="${T + 9}" text-anchor="end" style="fill:#ecf4f0;font-weight:600">m above sea</text></svg>`;
}
function renderDays() {
  const day = days[sel], s = W.summarize(day.tStart, day.tEnd, day.zone);
  const pills = days.map(d => `<button class="pill" aria-pressed="${d.i === sel}" data-day="${d.i}"><b><i style="background:${d.color}"></i>${W.fmtWd(d.date)} ${W.nz(d.date).d}</b><small>${kmTxt(d.dist)} km</small></button>`).join('');
  const warn = s.gust >= 75 || s.rain >= 3;
  const pois = day.pois.map((e, n) => `<li><button data-poi="${n}"><span class="km num">${kmTxt(e.d)} km${day.guide && e.p.inH ? `<small>${e.p.inH}</small>` : ''}</span>${glyph(e.p.kind)}<span class="nm">${esc(e.p.name)}<span class="bd">${badges(e.p.fac)}</span></span>${me && me.day === day.i && e.d > me.d && e.d - me.d < 3000 ? `<span class="away num">${kmTxt(e.d - me.d)} km</span>` : ''}</button></li>`).join('');
  const opts = (n) => {
    const prevKm = n === 0 ? 0 : G.SIDES[STOPS[S.nights[n - 1]].leave].km;
    return NIGHT_OPTIONS.filter(id => G.SIDES[STOPS[id].arrive].km > prevKm + 2).map(id => `<option value="${id}" ${S.nights[n] === id ? 'selected' : ''}>${esc(STOPS[id].name)}</option>`).join('') + `<option value="" ${S.nights[n] ? '' : 'selected'}>Walk out to Anakiwa</option>`;
  };
  let plan = '';
  if (planOpen) {
    plan = '<div class="plan"><h3 class="t">Where you sleep</h3>';
    for (let n = 0; n < 4 && n <= S.nights.length; n++) plan += `<label for="night${n}">Night ${n + 1}<select id="night${n}" data-night="${n}">${opts(n)}</select></label>`;
    plan += '<p class="fine">Distances, times and the forecast zone change with your plan. The dates are 13 to 17 November 2026.</p></div>';
  }
  $('p-days').innerHTML = `
    <div class="pills">${pills}</div>
    <h2 class="t">${esc(day.from.short)} to ${esc(day.to.name)}</h2>
    <div class="stats">
      <div><b class="num">${kmTxt(day.dist)}</b><span>km</span></div>
      <div><b class="num">${Math.round(day.up / 10) * 10}</b><span>m of climb</span></div>
      <div><b class="num">${day.guide ? (day.guide.h[0] === day.guide.h[1] ? day.guide.h[0] + ' h' : day.guide.h[0] + '–' + day.guide.h[1] + ' h') : durTxt(day.hours)}</b><span>${day.guide ? 'route guide time' : 'walk time'}</span></div>
    </div>
    <label class="startrow" for="startTime"><span>Start</span><input type="time" id="startTime" value="${S.starts[day.i] || '08:30'}"><span class="num">Arrive about ${W.fmtTime(day.tEnd)}${day.guide && day.guide.km ? '. Route guide: ' + day.guide.km + ' km' : ''}</span></label>
    ${day.boat ? `<label class="startrow boatrow ${day.tEnd > day.boat - 20 * 60e3 ? 'late' : ''}" for="boatTime"><span>Boat</span><input type="time" id="boatTime" value="${S.boat}"><span class="num">${day.tEnd > day.boat ? 'Your plan arrives after the boat. Start earlier.' : 'Water taxi from Anakiwa. Your plan has ' + durTxt((day.boat - day.tEnd) / W.HOUR) + ' spare.' + (day.boat - day.tEnd < 45 * 60e3 ? ' Start earlier if you can.' : '')}</span></label>` : ''}
    <button class="verdict ${warn ? 'warn' : ''}" id="verdict" style="text-align:left">${W.icon(s.code, true)}<span><b class="num">${Math.round(s.tmin)}° to ${Math.round(s.tmax)}° · ${s.rain >= 0.3 ? s.rain.toFixed(1) + ' mm rain' : 'no rain'} · gusts ${Math.round(s.gust)}</b>${esc(s.verdict.join(' '))}</span></button>
    ${profileSvg(day)}
    <div class="btns"><button class="btn pri" id="flyDay">Fly this day</button><button class="btn" id="showDay">Show on map</button><button class="btn" id="editPlan">${planOpen ? 'Close plan' : 'Change plan'}</button></div>
    ${plan}
    ${day.guide ? `<h3 class="t">Know before you go</h3><ul class="notes">${day.guide.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    <h3 class="t">On the way</h3>
    <ol class="list">${pois}</ol>
    <div class="tonight"><b>${day.toId === 'anakiwa' ? 'Finish' : 'Tonight'}: ${esc(day.to.name)}</b><p>${esc(day.to.note)}</p></div>
    <p class="fine">Times, facilities and route notes: Wilderness Guides route guide. Distances are measured on this map. Use Change plan if your lodges are different. Track line and places: OpenStreetMap contributors.</p>`;
}
function wireDays() {
  const p = $('p-days');
  p.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.day !== undefined) selectDay(+b.dataset.day);
    else if (b.dataset.poi !== undefined) showPoi(days[sel].pois[+b.dataset.poi].p);
    else if (b.id === 'flyDay') { R.src = 'plan'; R.day = sel; setTab('replay'); startReplay(true); }
    else if (b.id === 'showDay') scene.frame(days[sel].pts);
    else if (b.id === 'editPlan') { planOpen = !planOpen; renderDays(); }
    else if (b.id === 'verdict') { const d = days[sel]; setTime(Math.min(Math.max((d.tStart + d.tEnd) / 2, W.T0), W.tEnd()), 'scrub'); toast('The map now shows ' + W.fmtDay(simT) + ' at ' + W.fmtTime(simT)); }
  });
  p.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'startTime' && t.value) { S.starts[sel] = t.value; save(); buildDays(); renderDays(); }
    if (t.id === 'boatTime' && t.value) { S.boat = t.value; save(); buildDays(); renderDays(); }
    if (t.dataset.night !== undefined) {
      const n = +t.dataset.night;
      S.nights = S.nights.slice(0, n); if (t.value) S.nights.push(t.value);
      save(); buildDays(); sel = Math.min(sel, days.length - 1);
      buildStopMarkers(); drawRoutes(); updateHud(); renderAll(); buildTimebar(); applyEnv(); updateTimeUI(true);
    }
  });
  // Move a finger on the height profile to move a light on the map.
  const move = e => {
    const svg = e.target.closest('#profile'); if (!svg) return;
    const r = svg.getBoundingClientRect(), day = days[sel];
    const fx = ((e.clientX - r.left) / r.width * 340 - 28) / (340 - 36), d = Math.max(0, Math.min(1, fx)) * day.dist, q = posOnDay(day, d);
    scene.setGhost(q);
    const cur = svg.querySelector('#pcur'), x = 28 + d / day.dist * (340 - 36);
    cur.setAttribute('x1', x); cur.setAttribute('x2', x); cur.setAttribute('visibility', 'visible');
    svg.querySelector('#pread').textContent = kmTxt(d) + ' km · ' + Math.round(q.ele) + ' m';
  };
  p.addEventListener('pointerdown', move); p.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'touch') move(e); });
}
function selectDay(i, fly = true) {
  sel = Math.max(0, Math.min(days.length - 1, i));
  hideCard(); scene.setGhost(null); drawRoutes(); updateHud(); renderAll();
  if (mode !== 'replay') { applyEnv(); updateTimeUI(); }
  if (fly) scene.frame(days[sel].pts);
}

// ---------- Weather panel
let wxStatus = '';
function renderSky() {
  const day = days[sel], t0 = day.date;
  const pills = days.map(d => { const s = W.summarize(d.date + 8 * W.HOUR, d.date + 17 * W.HOUR, d.zone);
    return `<button class="pill" aria-pressed="${d.i === sel}" data-day="${d.i}"><b>${W.fmtWd(d.date)} ${W.nz(d.date).d}</b>${W.icon(s.code, true)}<small class="num">${Math.round(s.tmax)}° · ${s.rain >= 0.3 ? s.rain.toFixed(0) + ' mm' : 'dry'}</small></button>`; }).join('');
  let hrs = '';
  for (let h = 5; h <= 22; h++) {
    const t = t0 + h * W.HOUR, w = W.wxAt(t, day.zone), dl = isDay(t), walk = t >= day.tStart - 1800e3 && t <= day.tEnd;
    const cur = Math.abs(simT - t) < 1800e3;
    hrs += `<button class="hr num ${walk ? 'walk' : ''} ${dl ? '' : 'nt'} ${cur ? 'cur' : ''}" data-t="${t}" aria-label="${W.p2(h)}:00, ${W.describe(w.code)}, ${Math.round(w.temp)} degrees">
      <span>${W.p2(h)}</span>${W.icon(w.code, dl)}<b>${Math.round(w.temp)}°</b>
      <span class="bar"><i style="height:${Math.min(100, w.rain / 3 * 100)}%"></i></span><span class="mm">${w.rain >= 0.1 ? w.rain.toFixed(1) : ''}</span>
      <span class="wd">${windArrow(w.dir)}</span><span>${Math.round(w.wind)}</span><span class="gu ${w.gust >= 60 ? 'hi' : ''}">${Math.round(w.gust)}</span></button>`;
  }
  const sun = W.sunTimes(t0), f = Date.parse(W.WX.fetched);
  $('p-sky').innerHTML = `
    <div class="pills">${pills}</div>
    <div class="row" style="justify-content:space-between"><h2 class="t">${W.fmtDay(t0)} · ${['outer sound', 'ridge, 330 m', 'inner sound'][day.zone]}</h2></div>
    <div class="hours" id="hours">${hrs}</div>
    <p class="fine">Rows: hour, sky, °C, rain in mm, wind direction, wind and gusts in km/h. The pale band is your walk time. Touch an hour to see it on the map.</p>
    <p class="big num">Sunrise ${sun.rise ? W.fmtTime(sun.rise) : '–'} · Sunset ${sun.set ? W.fmtTime(sun.set) : '–'}</p>
    <div class="row"><button class="btn" id="wxRefresh">Update forecast</button><span class="fine" style="flex:1">${esc(wxStatus || 'Forecast model: Open-Meteo. Read ' + W.fmtDay(f) + ' at ' + W.fmtTime(f) + '.')}</span></div>`;
  const cur = $('hours').querySelector('.walk'); if (cur) $('hours').scrollLeft = Math.max(0, cur.offsetLeft - 20);
}
async function refreshWx(silent) {
  if (!silent) { wxStatus = 'Reading the forecast…'; renderSky(); }
  try {
    const w = await W.fetchLive();
    W.setWX(w); S.wx = w; save(); wxStatus = '';
    buildTimebar(); applyEnv(); updateTimeUI(true); renderAll();
    if (!silent) toast('Forecast updated');
  } catch (e) {
    if (!silent) { wxStatus = 'Update failed. There is no connection to Open-Meteo from here. The stored forecast stays in use.'; renderSky(); }
  }
}
function wireSky() {
  $('p-sky').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.day !== undefined) { const d = days[+b.dataset.day]; sel = d.i; setTime(d.date + 12 * W.HOUR, 'scrub'); selectDay(d.i); }
    else if (b.dataset.t) { setTime(+b.dataset.t, 'scrub'); renderSky(); }
    else if (b.id === 'wxRefresh') refreshWx(false);
  });
}

// ---------- heart rate from a watch (Web Bluetooth: Chrome on Android)
const HR = { dev: null, bpm: null, t: 0, max: 0, state: 'off', tries: 0 };
const hasBle = () => !!(navigator.bluetooth && navigator.bluetooth.requestDevice);
function hrUi() {
  const pill = $('hrPill'), live = HR.state === 'on' && HR.bpm;
  pill.hidden = HR.state === 'off';
  pill.textContent = live ? '♥ ' + HR.bpm : HR.state === 'wait' ? '♥ …' : '♥ –';
  const el = $('hrLine');
  if (el) el.textContent = live ? HR.bpm + ' beats each minute now. Highest today: ' + HR.max + '.' : HR.state === 'wait' ? 'Connecting to the watch…' : HR.state === 'lost' ? 'The watch connection stopped. Touch Connect watch again.' : '';
  const b = $('hrBtn'); if (b) b.textContent = HR.state === 'on' || HR.state === 'wait' ? 'Disconnect watch' : 'Connect watch';
}
async function hrLink() {
  const srv = await HR.dev.gatt.connect();
  const ch = await (await srv.getPrimaryService('heart_rate')).getCharacteristic('heart_rate_measurement');
  ch.addEventListener('characteristicvaluechanged', e => {
    const v = e.target.value, bpm = v.getUint8(0) & 1 ? v.getUint16(1, true) : v.getUint8(1);
    if (bpm > 20 && bpm < 250) { HR.bpm = bpm; HR.t = Date.now(); HR.max = Math.max(HR.max, bpm); HR.state = 'on'; HR.tries = 0; hrUi(); }
  });
  await ch.startNotifications();
}
async function hrConnect() {
  try {
    HR.dev = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
    HR.state = 'wait'; hrUi();
    HR.dev.addEventListener('gattserverdisconnected', async () => {
      if (HR.state === 'off') return;
      HR.bpm = null; HR.state = 'wait'; hrUi();
      while (HR.state === 'wait' && HR.tries < 5) { // the watch went out of range: try again
        HR.tries++; await new Promise(r => setTimeout(r, 4000));
        try { await hrLink(); return; } catch (e) { /* try again */ }
      }
      if (HR.state === 'wait') { HR.state = 'lost'; hrUi(); }
    });
    await hrLink();
  } catch (e) {
    HR.state = HR.dev && e.name !== 'NotFoundError' ? 'lost' : 'off'; hrUi();
    toast(e.name === 'NotFoundError' ? 'No watch selected. Start Broadcast Heart Rate on the watch first.' : 'The watch did not connect. Start Broadcast Heart Rate on the watch and try again.', 6000);
  }
}
function hrDisconnect() { HR.state = 'off'; HR.bpm = null; try { HR.dev && HR.dev.gatt.disconnect(); } catch (e) { /* ignore */ } hrUi(); }

// ---------- Track me panel
let watchId = null, gpsMsg = '', wake = null, manualD = null, wantFly = false, clearArmed = false;
const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';
const SHELL = ['./', 'index.html', 'app.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
async function updateApp() {
  toast('Downloading the app again…', 8000);
  try {
    // Get all files from the network first. The stored copy changes only when all of them arrive.
    const fresh = await Promise.all(SHELL.map(async u => { const r = await fetch(u, { cache: 'reload' }); if (!r.ok) throw new Error(u); return [new URL(u, location.href).href, r]; }));
    if (window.caches) for (const k of await caches.keys()) { const c = await caches.open(k); for (const [u, r] of fresh) await c.put(u, r.clone()); }
    try { const reg = await navigator.serviceWorker.getRegistration(); if (reg) reg.update(); } catch (e) { /* ignore */ }
    toast('Done. The app starts again now.'); setTimeout(() => location.reload(), 900);
  } catch (e) { toast('No connection. The app stays as it is. Try again when you have signal.', 6000); }
}
function clearDay(i) {
  S.checkins = S.checkins.filter(c => c.day !== i);
  for (const k of Object.keys(S.said)) if (k.startsWith(i + ':')) delete S.said[k];
  me = null; manualD = null; save(); drawWalked(); drawMe(); scene.setGhost(null); renderAll();
  toast('Day ' + (i + 1) + ' tracking is clear.' + (watchId !== null ? ' GPS is still on.' : ''), 4000);
}
const flyToMe = () => { const w = G.world(me); scene.flyTo({ x: w.x, z: w.z, dist: 38, polar: 1.0, dur: 1400 }); };
const gpsUi = () => { $('locBtn').classList.toggle('on', watchId !== null); renderTrack(); };
const trackDay = () => todayIndex() ?? sel;
function setMe(lat, lon, acc, src, forceDay, speed) {
  const ti = forceDay ?? todayIndex(), t = Date.now();
  if (ti === null || ti === undefined) { // not a walk day: show the position only
    const s = G.nearestOnTrack(lat, lon);
    me = { lat, lon, acc, src, t, day: null, d: 0, off: s.off, km: s.km };
  } else {
    const day = days[ti], s = nearestOnDay(day, lat, lon);
    me = { lat, lon, acc, src, t, day: ti, d: s.d, off: s.off };
    if (src === 'gps' && s.off < 300) manualD = s.d;
    if (src === 'manual' || (s.off < 300 && !(speed > 3.3))) { // not from a boat: near the route and at walk speed
      const last = S.checkins[S.checkins.length - 1];
      if (src === 'manual' || !last || last.day !== ti || t - last.t > 40e3 || Math.abs(s.d - last.d) > 25) {
        const ci = { t, lat: +lat.toFixed(5), lon: +lon.toFixed(5), day: ti, d: Math.round(s.d), src: src === 'manual' ? 'm' : 'g' };
        if (HR.bpm && t - HR.t < 15e3) ci.hr = HR.bpm;
        S.checkins.push(ci);
        save(); drawWalked(); announceNear(day);
      }
    }
  }
  drawMe(); renderTrack();
  if (S.tab === 'days') renderDays();
}
function announceNear(day) {
  for (const e of day.pois) {
    const k = day.i + ':' + e.p.id;
    if (!S.said[k] && Math.abs(e.d - me.d) < 220) { S.said[k] = 1; save(); toast('Near you: ' + e.p.name, 5000); try { navigator.vibrate && navigator.vibrate(120); } catch (er) { /* no vibration */ } break; }
  }
}
function startGps() {
  if (!navigator.geolocation) { gpsMsg = 'This browser has no location service. Set your position by hand.'; renderTrack(); return; }
  gpsMsg = 'Waiting for GPS…'; renderTrack();
  try {
    watchId = navigator.geolocation.watchPosition(p => {
      const c = p.coords;
      if (c.accuracy > 200) { gpsMsg = 'GPS signal is weak (' + Math.round(c.accuracy) + ' m). Wait for a better fix.'; renderTrack(); return; }
      gpsMsg = ''; setMe(c.latitude, c.longitude, c.accuracy, 'gps', undefined, c.speed);
      if (wantFly) {
        wantFly = false;
        if (G.inBounds(me.lat, me.lon)) flyToMe(); else toast('You are outside this map, ' + Math.round(me.off / 1000) + ' km from the track.', 5000);
      }
    }, err => {
      gpsMsg = err.code === 1 ? 'Location is blocked here. Open the app from your home screen and allow location, or set your position by hand.'
        : err.code === 2 ? 'No GPS signal. Go to a place with open sky.' : 'GPS is slow. Wait, or set your position by hand.';
      if (err.code === 1) { stopGps(true); S.gps = false; save(); }
      if (S.tab !== 'track' || wantFly) toast(gpsMsg, 6000);
      wantFly = false; gpsUi();
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 45000 });
  } catch (e) { gpsMsg = 'Location is not available here. Set your position by hand.'; watchId = null; toast(gpsMsg, 5000); }
  gpsUi();
}
function stopGps(keepMsg) {
  if (watchId !== null) { try { navigator.geolocation.clearWatch(watchId); } catch (e) { /* ignore */ } }
  watchId = null; if (!keepMsg) gpsMsg = ''; gpsUi();
}
function paceInfo(day) {
  if (!me || me.day !== day.i || (me.off > 300 && me.src !== 'manual')) return null;
  const now = Date.now(), rec = S.checkins.filter(c => c.day === day.i && now - c.t < 45 * 60e3 && now - c.t >= 0);
  let mph = null;
  if (rec.length >= 2) { const a = rec[0], b = rec[rec.length - 1]; if (b.t - a.t > 6 * 60e3 && b.d - a.d > 250) mph = (b.d - a.d) / ((b.t - a.t) / W.HOUR); }
  const togo = Math.max(0, day.dist - me.d);
  const hoursLeft = mph ? togo / mph : togo / day.dist * day.hours;
  return { mph, togo, eta: now + hoursLeft * W.HOUR, hoursLeft };
}
function renderTrack() {
  const day = days[trackDay()], on = watchId !== null, isToday = todayIndex() !== null, pi = paceInfo(day);
  const oldTxt = $('momentTxt') ? $('momentTxt').value : '', hadFocus = document.activeElement && document.activeElement.id === 'momentTxt';
  let status;
  if (gpsMsg) status = gpsMsg;
  else if (me && me.day === null) status = me.off > 3000 ? 'You are ' + Math.round(me.off / 1000) + ' km from the track.' : 'You are at km ' + me.km.toFixed(1) + ' of the track.';
  else if (me && me.day === day.i && me.off > 300 && me.src !== 'manual') status = 'GPS is on. You are ' + (me.off < 1000 ? Math.round(me.off / 10) * 10 + ' m' : (me.off / 1000).toFixed(1) + ' km') + ' from the route of day ' + (day.i + 1) + '. The map shows your position. Nothing is recorded until you are on the route.';
  else if (me && me.day === day.i) status = (me.off > 300 && me.src !== 'manual' ? Math.round(me.off / 10) * 10 + ' m off the route. ' : 'On the route. ') + kmTxt(me.d) + ' km done, ' + kmTxt(day.dist - me.d) + ' km to ' + day.to.short + '.';
  else if (on) status = 'Tracking is on.';
  else if (!isToday) { const h = (DAY0 - Date.now()) / W.HOUR; status = h > 0 ? 'The walk starts in ' + (h > 48 ? Math.round(h / 24) + ' days.' : Math.round(h) + ' hours.') : 'The walk is complete. Open Replay to see it again.'; }
  else status = 'Tracking is off.';
  const sun = W.sunTimes(day.date), light = sun.set ? (sun.set - Date.now()) / W.HOUR : null;
  if (manualD === null || manualD > day.dist) manualD = me && me.day === day.i ? me.d : 0;
  const mp = posOnDay(day, manualD), nearPoi = day.pois.reduce((b, e) => Math.abs(e.d - manualD) < Math.abs((b ? b.d : 1e9) - manualD) ? e : b, null);
  $('p-track').innerHTML = `
    <p class="big">${esc(status)}</p>
    <div class="btns"><button class="btn ${on ? '' : 'pri'}" id="gpsBtn">${on ? 'Stop tracking' : 'Start tracking'}</button>${me && G.inBounds(me.lat, me.lon) ? '<button class="btn" id="findMe">Show me on map</button>' : ''}</div>
    <div class="stats">
      <div><b class="num">${pi ? kmTxt(me.d) : '–'}</b><span>km done</span></div>
      <div><b class="num">${pi ? kmTxt(pi.togo) : kmTxt(day.dist)}</b><span>km to go</span></div>
      <div><b class="num">${pi && pi.mph ? (pi.mph / 1000).toFixed(1) : '–'}</b><span>km/h now</span></div>
      <div><b class="num">${pi && isToday ? W.fmtTime(pi.eta) : '–'}</b><span>at ${esc(day.to.short)}</span></div>
    </div>
    ${day.boat && isToday ? (() => { const eta = pi ? pi.eta : day.tEnd, sp = (day.boat - eta) / 60e3; return `<p class="boatline ${sp < 20 ? 'late' : ''} num">${badge('boat')}Boat leaves Anakiwa at ${W.fmtTime(day.boat)}. ${sp >= 0 ? 'At this speed you have ' + durTxt(sp / 60) + ' spare.' : 'At this speed you are ' + durTxt(-sp / 60) + ' late. Call the office: ' + HELP.office + '.'}</p>`; })() : ''}
    ${isToday && light !== null && light > 0 ? `<p class="fine num">Sunset is at ${W.fmtTime(sun.set)}. You have ${durTxt(light)} of daylight.</p>` : ''}
    <h3 class="t">Set your position by hand · day ${day.i + 1}</h3>
    <input type="range" class="plain" id="manual" min="0" max="${Math.round(day.dist)}" step="50" value="${Math.round(manualD)}" aria-label="Position on the route">
    <div class="row" style="justify-content:space-between"><span class="num" id="manualTxt">${kmTxt(manualD)} km · ${Math.round(mp.ele)} m${nearPoi && Math.abs(nearPoi.d - manualD) < 400 ? ' · ' + esc(nearPoi.p.name) : ''}</span><button class="btn sea" id="checkin">Check in here</button></div>
    <h3 class="t">Save a moment</h3>
    <div class="row"><input class="txt" id="momentTxt" maxlength="80" placeholder="Dolphins from the jetty" aria-label="Note for this place"><button class="btn" id="momentBtn">Save</button></div>
    <h3 class="t">Heart rate from a watch</h3>
    ${hasBle() ? `<div class="row"><button class="btn" id="hrBtn">Connect watch</button><span class="fine num" id="hrLine" style="flex:1"></span></div>
    <p class="fine">Garmin: start Broadcast Heart Rate on the watch (Settings, Sensors, Wrist Heart Rate), then touch Connect watch and select it. Broadcast uses more watch battery.</p>`
    : '<p class="fine">Live heart rate needs Chrome on an Android phone and a watch that can broadcast heart rate with Bluetooth. This browser cannot do it.</p>'}
    <h3 class="t">Reset</h3>
    <div class="btns"><button class="btn danger" id="clearDay">${clearArmed ? 'Touch again to clear day ' + (day.i + 1) : 'Clear day ' + (day.i + 1) + ' tracking'}</button><button class="btn" id="updBtn">Update app</button></div>
    <p class="fine num">${S.checkins.filter(c => c.day === day.i).length} check-ins on day ${day.i + 1}. Clear removes them and the white walked line. Your notes stay. App version: ${BUILD}.</p>
    <label class="chk" for="wake"><input type="checkbox" id="wake" ${wake ? 'checked' : ''}>Keep the screen on</label>
    <p class="fine">A web app records your position only while it is open on the screen. Open it at each stop. Replay joins your check-ins along the track. Check-ins stay on this phone.</p>`;
  hrUi();
  if (oldTxt) $('momentTxt').value = oldTxt;
  if (hadFocus) { const el = $('momentTxt'); el.focus(); try { el.setSelectionRange(oldTxt.length, oldTxt.length); } catch (e) { /* ignore */ } }
}
function wireTrack() {
  const p = $('p-track');
  p.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id !== 'clearDay' && clearArmed) clearArmed = false;
    if (b.id === 'clearDay') { if (!clearArmed) { clearArmed = true; renderTrack(); } else { clearArmed = false; clearDay(trackDay()); } }
    else if (b.id === 'updBtn') updateApp();
    else if (b.id === 'hrBtn') { HR.state === 'on' || HR.state === 'wait' ? hrDisconnect() : hrConnect(); }
    else if (b.id === 'gpsBtn') { if (watchId !== null) { stopGps(); S.gps = false; } else { wantFly = true; startGps(); S.gps = true; } save(); }
    else if (b.id === 'findMe') flyToMe();
    else if (b.id === 'checkin') { const day = days[trackDay()], q = posOnDay(day, manualD); setMe(q.lat, q.lon, 0, 'manual', day.i); toast('Checked in at ' + kmTxt(manualD) + ' km'); }
    else if (b.id === 'momentBtn') {
      const txt = $('momentTxt').value.trim(); if (!txt) { toast('Write a short note first'); return; }
      const day = days[trackDay()], q = me && me.day === day.i ? me : posOnDay(day, manualD);
      S.moments.push({ t: Date.now(), lat: +q.lat.toFixed(5), lon: +q.lon.toFixed(5), day: day.i, d: Math.round(q.d), text: txt });
      $('momentTxt').value = ''; save(); buildMomentMarkers(); renderTrack(); toast('Moment saved');
    }
  });
  p.addEventListener('input', e => {
    if (e.target.id !== 'manual') return;
    manualD = +e.target.value; const day = days[trackDay()], q = posOnDay(day, manualD);
    scene.setGhost(q);
    const np = day.pois.reduce((b, x) => Math.abs(x.d - manualD) < Math.abs((b ? b.d : 1e9) - manualD) ? x : b, null);
    $('manualTxt').textContent = kmTxt(manualD) + ' km · ' + Math.round(q.ele) + ' m' + (np && Math.abs(np.d - manualD) < 400 ? ' · ' + np.p.name : '');
  });
  p.addEventListener('change', async e => {
    if (e.target.id !== 'wake') return;
    if (e.target.checked) {
      try { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
      catch (er) { wake = null; e.target.checked = false; toast('This browser cannot keep the screen on'); }
    } else if (wake) { try { await wake.release(); } catch (er) { /* ignore */ } wake = null; }
  });
}

// ---------- Profile panel: the whole track
const PF = { PX: 17, L: 30, R: 26, TOP: 92, PH: 104, B: 20 };
function profilePlaces() {
  const out = [], seen = {};
  const seq = ['shipcove', ...S.nights, 'anakiwa'];
  seq.forEach((id, n) => {
    const d = n === 0 ? days[0] : days[n - 1], D = n === 0 ? 0 : d.off + d.dist;
    out.push({ D, ele: n === 0 ? days[0].pts[0].ele : d.pts[d.pts.length - 1].ele, name: STOPS[id].short, fac: n === 0 ? ['boat', 'toilet'] : n === seq.length - 1 ? ['boat', 'toilet'] : ['lodge'], pri: 3, stop: id });
  });
  for (const d of days) for (const e of d.pois) {
    if (seen[e.p.id] || e.p.kind === 'boat') continue; seen[e.p.id] = 1;
    out.push({ D: d.off + e.d, ele: posOnDay(d, e.d).ele, name: e.p.short || e.p.name, fac: poiFac(e.p), pri: e.p.prof === false ? 0 : (e.p.fac || []).includes('shelter') ? 2 : 1, poi: e.p });
  }
  return out;
}
function renderProfile() {
  const { PX, L, R, TOP, PH, B } = PF, total = days.total, Wd = L + R + total / 1000 * PX, Hh = TOP + PH + B;
  const X = D => L + D / 1000 * PX, Y = e => TOP + PH - Math.min(e, 500) / 500 * PH;
  let g = '';
  for (const v of [0, 125, 250, 375, 500]) g += `<line x1="${L}" x2="${Wd - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(255,255,255,${v ? 0.09 : 0.25})"/>`;
  for (let k = 0; k <= total / 1000; k += 5) g += `<text x="${X(k * 1000)}" y="${Hh - 5}" text-anchor="middle">${k} km</text><line x1="${X(k * 1000)}" x2="${X(k * 1000)}" y1="${TOP + PH}" y2="${TOP + PH + 4}" stroke="rgba(255,255,255,.4)"/>`;
  let areas = '';
  for (const d of days) {
    const step = Math.max(1, Math.floor(d.pts.length / 200)); let line = '';
    for (let i = 0; i < d.pts.length; i += step) line += (i ? 'L' : 'M') + X(d.off + d.pts[i].d).toFixed(1) + ' ' + Y(d.pts[i].ele).toFixed(1);
    const last = d.pts[d.pts.length - 1]; line += 'L' + X(d.off + last.d).toFixed(1) + ' ' + Y(last.ele).toFixed(1);
    const s = W.summarize(d.tStart, d.tEnd, d.zone);
    areas += `<path d="${line}L${X(d.off + d.dist).toFixed(1)} ${Y(0)}L${X(d.off).toFixed(1)} ${Y(0)}Z" fill="${d.color}" fill-opacity="${d.i === sel ? 0.5 : 0.28}"/><path d="${line}" fill="none" stroke="${d.color}" stroke-width="1.8" stroke-linejoin="round"/>
      <line x1="${X(d.off)}" x2="${X(d.off)}" y1="16" y2="${TOP + PH}" stroke="rgba(255,255,255,.3)" stroke-dasharray="3 3"/>
      <rect x="${X(d.off) + 1}" y="0" width="${d.dist / 1000 * PX - 2}" height="15" rx="4" fill="${d.color}" fill-opacity="${d.i === sel ? 0.95 : 0.6}"/>
      <text x="${X(d.off) + 6}" y="11" style="fill:#1b1206;font-weight:700">Day ${d.i + 1} · ${W.fmtWd(d.date)} · ${kmTxt(d.dist)} km${d.guide ? ' · ' + d.guide.h[1] + ' h' : ''}${s.rain >= 1 ? ' · rain' : ''}${s.gust >= 70 ? ' · wind' : ''}</text>`;
    for (const v of [250, 500]) areas += `<text x="${X(d.off) + 3}" y="${Y(v) - 2}" style="fill:rgba(236,244,240,.55)">${v} m</text>`;
  }
  // labels in three rows; a place with no free row keeps only its dot
  const places = profilePlaces().sort((a, b) => b.pri - a.pri || a.D - b.D), rows = [[], [], []], rowY = [30, 52, 74];
  let marks = '';
  for (const pl of places) {
    const x = X(pl.D), y = Y(pl.ele), w = pl.name.length * 5.5 + pl.fac.length * 12 + 8;
    let r = -1;
    if (pl.pri > 0) for (let k = 0; k < 3 && r < 0; k++) if (!rows[k].some(b => x - 3 < b[1] && x + w > b[0])) r = k;
    if (r >= 0) {
      rows[r].push([x - 3, x + w]);
      marks += `<line x1="${x}" x2="${x}" y1="${rowY[r] + 4}" y2="${y - 3}" stroke="rgba(255,255,255,.35)"/><text x="${x + 2}" y="${rowY[r]}" style="fill:#ecf4f0;font-weight:${pl.pri === 3 ? 700 : 500}">${esc(pl.name)}</text>`;
      pl.fac.forEach((f, n) => { marks += `<g transform="translate(${x + 4 + pl.name.length * 5.5 + n * 12},${rowY[r] - 9}) scale(0.66)">${facInner(f)}</g>`; });
    }
    marks += `<circle cx="${x}" cy="${y}" r="${pl.pri === 3 ? 4 : 2.6}" fill="${pl.pri === 3 ? '#ffb454' : '#fff'}" stroke="#06181c"/>`;
  }
  const meD = me && me.day !== null && days[me.day] ? days[me.day].off + me.d : null;
  const meX = meD !== null ? `<line x1="${X(meD)}" x2="${X(meD)}" y1="${TOP - 6}" y2="${TOP + PH}" stroke="#fff" stroke-width="1.5"/><circle cx="${X(meD)}" cy="${Y(posOnDay(days[me.day], me.d).ele)}" r="4.5" fill="#fff" stroke="#06181c"/><text x="${X(meD) + 5}" y="${TOP + PH - 4}" style="fill:#fff;font-weight:700">You</text>` : '';
  const hi = Math.max(...days.flatMap(d => d.pts.map(p => p.ele)));
  $('p-profile').innerHTML = `
    <p class="fine num" id="pfRead">Ship Cove to Anakiwa. Slide the profile sideways. Touch it to see that point on the map.</p>
    <div class="hscroll" id="pfScroll"><svg class="profile wide" id="pfSvg" style="width:${Math.round(Wd)}px;height:${Hh}px" width="${Math.round(Wd)}" height="${Hh}" viewBox="0 0 ${Wd.toFixed(0)} ${Hh}" role="img" aria-label="Height profile of the whole track. Highest point ${Math.round(hi)} metres.">
      ${g}${areas}${marks}${meX}<line id="pfCur" x1="0" x2="0" y1="${TOP - 6}" y2="${TOP + PH}" stroke="#9ff3e6" stroke-width="1.5" visibility="hidden"/></svg></div>
    <div class="legend">${Object.keys(FAC).map(f => `<span>${badge(f)}${FAC[f].label}</span>`).join('')}</div>
    <p class="fine num">${kmTxt(total)} km on this map, with the side tracks to your lodges. The official track length is 73.5 km. Heights are in metres above sea level. The printed route guide shows Anakiwa on the left. Here the profile runs in your walk direction.</p>`;
  const sc = $('pfScroll'), focus = meD !== null ? meD : days[sel].off;
  sc.scrollLeft = Math.max(0, X(focus) - 40);
}
function wireProfile() {
  $('p-profile').addEventListener('click', e => {
    const svg = e.target.closest('#pfSvg'); if (!svg) return;
    const r = svg.getBoundingClientRect(), D = Math.max(0, Math.min(days.total, (e.clientX - r.left - PF.L) / PF.PX * 1000));
    let day = days[days.length - 1];
    for (const d of days) if (D <= d.off + d.dist) { day = d; break; }
    const q = posOnDay(day, D - day.off), cur = $('pfCur'), x = PF.L + D / 1000 * PF.PX;
    cur.setAttribute('x1', x); cur.setAttribute('x2', x); cur.setAttribute('visibility', 'visible');
    $('pfRead').textContent = `Day ${day.i + 1} · ${kmTxt(D)} km from Ship Cove · ${Math.round(q.ele)} m above sea level`;
    if (day.i !== sel) { sel = day.i; drawRoutes(); updateHud(); }
    scene.setGhost(q); scene.flyTo({ x: q.x, z: q.z, y: q.y, dist: 52, polar: 1.0, az: Math.atan2(-q.hx, -q.hz), dur: 1200 });
  });
}
function showHelp() {
  showCard({ kindHtml: badge('boat') + 'Help', title: 'If something goes wrong', fly: false,
    html: `<ul class="notes">${HELP.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
      <span class="facrow"><a class="btn pri" href="tel:111">Call 111</a> <a class="btn" href="tel:${HELP.office.replace(/ /g, '')}">Office ${HELP.office}</a></span>
      <span class="facrow"><button class="btn" id="updBtn2">Update app</button> App version: ${BUILD}</span>
      <span class="facrow">Office from an overseas phone: ${HELP.officeIntl}. Luggage for the boat: 15 kg at most. There are no rubbish bins on the track: carry all waste out.</span>` });
}

// ---------- Spot panel
function renderSpot() {
  const n = WILDLIFE.filter(w => S.spotted[w.id]).length;
  $('p-spot').innerHTML = `<p class="big num">${n} of ${WILDLIFE.length} seen</p>
    <div class="spot">${WILDLIFE.map(w => `<button aria-pressed="${!!S.spotted[w.id]}" data-id="${w.id}"><i></i><span><b>${esc(w.name)}</b><small>${S.spotted[w.id] ? 'Seen ' + W.fmtDay(S.spotted[w.id]) + ' ' + W.fmtTime(S.spotted[w.id]) : esc(w.tip)}</small></span></button>`).join('')}</div>`;
}
function wireSpot() {
  $('p-spot').addEventListener('click', e => {
    const b = e.target.closest('button[data-id]'); if (!b) return;
    if (S.spotted[b.dataset.id]) delete S.spotted[b.dataset.id]; else S.spotted[b.dataset.id] = Date.now();
    save(); renderSpot();
  });
}

// ---------- Replay
const SEG_DUR = 34;
let wipeArmed = false;
function buildReplay() {
  const list = R.day === 'all' ? days : [days[Math.min(R.day, days.length - 1)]];
  R.segs = list.map(day => {
    const cs = S.checkins.filter(c => c.day === day.i).sort((a, b) => a.t - b.t);
    if (R.src === 'mine' && cs.length >= 2) return { day, mine: true, t0: cs[0].t, t1: cs[cs.length - 1].t, keys: cs.map(c => [c.t, c.d]) };
    return { day, mine: false, t0: day.tStart, t1: day.tEnd, keys: [[day.tStart, 0], [day.tEnd, day.dist]] };
  });
}
function replayAt(p) {
  const n = R.segs.length; p = Math.max(0, Math.min(n - 1e-4, p));
  const si = Math.floor(p), seg = R.segs[si], u = p - si;
  const t = seg.t0 + u * (seg.t1 - seg.t0), k = seg.keys;
  let j = 0; while (j < k.length - 2 && k[j + 1][0] < t) j++;
  const span = k[j + 1][0] - k[j][0], d = k[j][1] + (span > 0 ? (t - k[j][0]) / span : 0) * (k[j + 1][1] - k[j][1]);
  return { si, seg, t, d, pos: posOnDay(seg.day, d) };
}
function showReplayFrame(dt, snap) {
  const f = replayAt(R.p);
  if (f.si !== R.lastSeg) {
    R.lastSeg = f.si; R.lastD = f.d;
    if (sel !== f.seg.day.i) { sel = f.seg.day.i; drawRoutes(); updateHud(); }
    toast('Day ' + (f.seg.day.i + 1) + ' · ' + f.seg.day.from.short + ' to ' + f.seg.day.to.short + (f.seg.mine ? '' : ' · the plan'), 2600);
  }
  scene.setWalker(f.pos);
  if (snap) scene.flyTo({ x: f.pos.x, z: f.pos.z, y: f.pos.y, dist: 46, polar: 1.06, az: Math.atan2(-f.pos.hx, -f.pos.hz), dur: 1200 });
  else if (dt) scene.chase(f.pos, f.pos.hx, f.pos.hz, dt);
  if (dt && f.d > R.lastD) {
    for (const e of f.seg.day.pois) if (e.d > R.lastD && e.d <= f.d && e.p.kind !== 'rest') toast(e.p.name, 2600);
    for (const m of S.moments) if (m.day === f.seg.day.i && m.d > R.lastD && m.d <= f.d) toast('“' + m.text + '”', 3400);
  }
  R.lastD = f.d;
  mode = 'replay'; simT = f.t;
  if (Math.abs(simT - lastEnvT) > 4 * 60e3) applyEnv();
  const info = $('rinfo');
  if (info) info.textContent = `${W.fmtDay(f.t)} ${W.fmtTime(f.t)} · ${kmTxt(f.d)} of ${kmTxt(f.seg.day.dist)} km · ${Math.round(f.pos.ele)} m`;
  const rp = $('rpos'); if (rp && document.activeElement !== rp) rp.value = Math.round(R.p / R.segs.length * 1000);
}
function startReplay(fromStart) {
  buildReplay();
  if (fromStart || R.p >= R.segs.length - 0.001) R.p = 0;
  R.lastSeg = -1; R.playing = true; hideCard(); scene.setGhost(null);
  if (meMarker) meMarker.el.style.visibility = 'hidden';
  renderReplay(); showReplayFrame(0, true);
}
function stopReplay() { R.playing = false; renderReplay(); }
function renderReplay() {
  buildReplay();
  const nMine = S.checkins.length, daysMine = new Set(S.checkins.map(c => c.day)).size;
  const usingPlan = R.src === 'mine' && !R.segs.some(s => s.mine);
  const pills = `<button class="pill" aria-pressed="${R.day === 'all'}" data-rday="all"><b>All days</b><small>${kmTxt(days.reduce((a, d) => a + d.dist, 0))} km</small></button>` +
    days.map(d => `<button class="pill" aria-pressed="${R.day === d.i}" data-rday="${d.i}"><b><i style="background:${d.color}"></i>Day ${d.i + 1}</b><small>${W.fmtWd(d.date)}</small></button>`).join('');
  const moments = S.moments.map(m => `<li><button data-mom="${m.t}"><span class="km num">D${m.day + 1}</span><span class="nm">${esc(m.text)}</span><span class="away num">${W.fmtTime(m.t)}</span></button></li>`).join('');
  $('p-replay').innerHTML = `
    <div class="row" style="justify-content:space-between">
      <div class="seg" role="group" aria-label="What to replay"><button aria-pressed="${R.src === 'mine'}" data-src="mine">My walk</button><button aria-pressed="${R.src === 'plan'}" data-src="plan">The plan</button></div>
      <div class="seg" role="group" aria-label="Speed">${[1, 2, 4].map(s => `<button aria-pressed="${R.speed === s}" data-speed="${s}">${s}×</button>`).join('')}</div>
    </div>
    <div class="pills">${pills}</div>
    <div class="row"><button class="btn pri" id="rplay" style="min-width:84px">${R.playing ? 'Pause' : 'Play'}</button><input type="range" class="plain" id="rpos" min="0" max="1000" value="${Math.round(R.p / Math.max(R.segs.length, 1) * 1000)}" style="flex:1" aria-label="Position in the replay"></div>
    <p class="fine num" id="rinfo">${usingPlan ? 'There are no check-ins yet. Replay shows the plan.' : R.src === 'mine' ? nMine + ' check-ins on ' + daysMine + (daysMine === 1 ? ' day.' : ' days.') + ' Days without check-ins show the plan.' : 'The camera follows the planned walk. Sun and weather follow the forecast for each hour.'}</p>
    ${moments ? `<h3 class="t">Moments</h3><ol class="list">${moments}</ol>` : ''}
    <div class="btns"><button class="btn danger" id="wipe">${wipeArmed ? 'Touch again to delete' : 'Delete all my check-ins and moments'}</button></div>`;
}
function wireReplay() {
  const p = $('p-replay');
  p.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id !== 'wipe') wipeArmed = false;
    if (b.dataset.src) { R.src = b.dataset.src; R.p = 0; R.playing = false; renderReplay(); }
    else if (b.dataset.speed) { R.speed = +b.dataset.speed; renderReplay(); }
    else if (b.dataset.rday) { R.day = b.dataset.rday === 'all' ? 'all' : +b.dataset.rday; R.p = 0; R.playing = false; renderReplay(); if (R.day !== 'all') selectDay(R.day); }
    else if (b.id === 'rplay') { R.playing ? stopReplay() : startReplay(false); }
    else if (b.dataset.mom) { const m = S.moments.find(x => x.t === +b.dataset.mom); if (m) { const w = G.world(m); showCard({ kindHtml: 'Moment · ' + W.fmtDay(m.t) + ' ' + W.fmtTime(m.t), title: m.text, text: '', x: w.x, z: w.z }); } }
    else if (b.id === 'wipe') {
      if (!wipeArmed) { wipeArmed = true; renderReplay(); return; }
      wipeArmed = false; S.checkins = []; S.moments = []; S.said = {}; me = null; save();
      drawWalked(); buildMomentMarkers(); drawMe(); renderAll(); toast('Deleted');
    }
  });
  p.addEventListener('input', e => {
    if (e.target.id !== 'rpos') return;
    R.playing = false; R.p = +e.target.value / 1000 * R.segs.length; R.lastSeg = -2;
    const f = replayAt(R.p); R.lastD = f.d; showReplayFrame(0.25);
    const b = $('rplay'); if (b) b.textContent = 'Play';
  });
}

// ---------- shell
function renderAll() {
  if (S.tab === 'days') renderDays(); else if (S.tab === 'profile') renderProfile(); else if (S.tab === 'sky') renderSky(); else if (S.tab === 'track') renderTrack(); else if (S.tab === 'spot') renderSpot(); else renderReplay();
}
function setTab(tab, toggle) {
  const sheet = $('sheet');
  if (toggle && S.tab === tab && sheet.dataset.open === '1') sheet.dataset.open = '0';
  else sheet.dataset.open = '1';
  S.tab = tab; save();
  for (const b of $('tabs').children) b.setAttribute('aria-selected', b.dataset.tab === tab);
  for (const p of $('panels').children) p.hidden = p.id !== 'p-' + tab;
  if (tab !== 'track' && tab !== 'days' && tab !== 'profile') scene.setGhost(null);
  renderAll(); $('panels').scrollTop = 0; layout();
}
function layout() {
  const sh = $('sheet').offsetHeight, top = document.querySelector('.hud').offsetHeight - 26;
  document.documentElement.style.setProperty('--sheet-h', sh + 'px');
  scene.setSize(window.innerWidth, window.innerHeight, sh, top);
}

function init() {
  if (!['days', 'profile', 'sky', 'track', 'spot', 'replay'].includes(S.tab)) S.tab = 'days';
  if (S.nights.some(id => !STOPS[id])) S.nights = DEFAULT_NIGHTS.slice();
  buildDays(); sel = Math.min(sel, days.length - 1);
  buildStaticMarkers(); buildStopMarkers(); buildMomentMarkers(); drawRoutes(); updateHud(); buildTimebar();
  wireDays(); wireSky(); wireTrack(); wireSpot(); wireReplay(); wireProfile();
  $('helpBtn').addEventListener('click', showHelp);
  $('hrPill').addEventListener('click', () => setTab('track'));
  $('locBtn').addEventListener('click', () => {
    if (watchId === null) { wantFly = true; S.gps = true; save(); startGps(); toast('Looking for your position…', 4000); }
    else if (me && me.src !== 'manual' && G.inBounds(me.lat, me.lon)) flyToMe();
    else if (me && me.src !== 'manual') toast('You are outside this map, ' + Math.round(me.off / 1000) + ' km from the track.', 5000);
    else toast(gpsMsg || 'Waiting for GPS…', 4000);
  });
  const last = S.checkins[S.checkins.length - 1];
  if (last && last.day === trackDay() && Date.now() - last.t < 18 * W.HOUR) me = { lat: last.lat, lon: last.lon, t: last.t, day: last.day, d: last.d, off: 0, src: last.src === 'm' ? 'manual' : 'gps' };
  setTab(S.tab);
  applyEnv(); updateTimeUI(true); drawMe();

  $('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setTab(b.dataset.tab, true); });
  $('scrub').addEventListener('input', e => { R.playing = false; setTime(W.T0 + +e.target.value * 600e3, 'scrub'); if (S.tab === 'replay') renderReplay(); });
  $('liveBtn').addEventListener('click', () => { R.playing = false; setTime(Date.now(), 'live'); renderAll(); });
  $('wxChip').addEventListener('click', () => setTab('sky'));
  $('compass').addEventListener('click', () => scene.resetNorth());
  $('cardClose').addEventListener('click', hideCard);
  $('card').addEventListener('click', e => { if (e.target.id === 'updBtn2') updateApp(); });
  window.addEventListener('resize', layout);
  if (window.ResizeObserver) new ResizeObserver(layout).observe($('sheet'));
  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden && wake === null && $('wake') && $('wake').checked) { try { wake = await navigator.wakeLock.request('screen'); } catch (e) { /* ignore */ } }
    if (!document.hidden && navigator.onLine !== false && Date.now() - Date.parse(W.WX.fetched) > 3 * W.HOUR) refreshWx(true);
  });
  layout();
  scene.flyTo({ x: 0, z: 0, dist: 520, az: 0.5, polar: 0.75, dur: 0 });
  setTimeout(() => { if (performance.now() - scene.lastTouch() > 1e8 || scene.lastTouch() < 0) scene.frame(days[sel].pts, { dur: 2600 }); }, 700);
  refreshWx(true);
  if (S.gps) startGps(); // tracking was on the last time: start it again
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    const had = !!navigator.serviceWorker.controller; let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !reloaded) { reloaded = true; location.reload(); } }); // a new version is ready
    navigator.serviceWorker.register('sw.js').then(r => r.update && r.update()).catch(() => { /* not allowed in this frame */ });
  }

  let lastFrame = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (document.hidden) return;
    const busy = R.playing || now - scene.lastTouch() < 4000;
    if (!busy && now - lastFrame < 31) return; // 30 frames each second when nothing moves
    const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
    if (R.playing) {
      R.p += dt * R.speed / SEG_DUR;
      if (R.p >= R.segs.length) { R.p = R.segs.length; R.playing = false; showReplayFrame(dt); renderReplay(); toast('End of replay'); }
      else showReplayFrame(dt);
    } else if (mode === 'live') {
      simT = Date.now();
      if (Math.abs(simT - lastEnvT) > 60e3) applyEnv();
    }
    if (now - lastUiT > 500) { lastUiT = now; updateTimeUI(); }
    $('needle').style.transform = `rotate(${scene.azimuth()}rad)`;
    scene.tick(now, dt);
  }
  requestAnimationFrame(loop);
  window.__qct = { scene, days, setTime, selectDay, setTab, startReplay, S };
}
init();
