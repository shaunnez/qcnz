import * as G from './geo.js';
import { STOPS, NIGHT_OPTIONS, DEFAULT_NIGHTS, POIS, LABELS, WILDLIFE, GUIDE, HELP, WALK, START, END, REV, ZONES } from './content.js';
import * as W from './weather.js';
import { createScene, envFrom } from './scene.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PACK = globalThis.__PACK__, BASE = PACK.base || '', QCT = WALK.id === 'qct', PADDLE = WALK.mode === 'paddle';
let DAY0 = 0; // the start of day 1, New Zealand time
const DAYCOLS = ['#ffb454', '#ff7d5c', '#f472b6', '#b79cff', '#6fe0ff'];
const DEFAULT_STARTS = QCT ? ['10:30', '09:00', '08:00', '08:30', '08:30'] : ['09:00', '08:30', '08:30', '08:30', '08:30', '08:30', '08:30'];
const KEY = PACK.key, OLD_KEY = QCT ? 'qct-2026-v2' : '';
const KIND = {
  view: { label: 'Lookout', color: '#ffd27a', path: '<path d="M8 2 15 14H1z"/>' },
  history: { label: 'History', color: '#f9a8c8', path: '<path d="M8 1l7 7-7 7-7-7z"/>' },
  nature: { label: 'Nature', color: '#8ee6a0', path: '<circle cx="8" cy="8" r="6.5"/>' },
  rest: { label: 'Rest stop', color: '#9fd0ff', path: '<rect x="2" y="2" width="12" height="12" rx="2.5"/>' },
  boat: { label: 'Water taxi', color: '#ff9c8f', path: '<path d="M1.5 9h13l-2.2 4.5H3.7zM8 8V2l4.5 6z"/>' }
};
// Facility badges, with the colours of the printed route guide.
const FAC = {
  hut: { c: '#3d4a8f', label: 'Hut', p: '<path d="M3.5 8 8 4l4.5 4v4.5h-9z" fill="#fff" stroke="none"/><path d="M7 12.5v-3h2v3" stroke="#3d4a8f"/>' },
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
const S = Object.assign({ nights: DEFAULT_NIGHTS.slice(), starts: DEFAULT_STARTS.slice(), boat: '16:00', checkins: [], moments: [], spotted: {}, wx: null, tab: 'days', said: {}, layers: { topo: false, contours: true, feat: true }, photoBy: '', share: null, peers: {}, shareName: '', devId: '', plan: {}, date: '' }, (() => {
  try {
    const cur = localStorage.getItem(KEY);
    if (cur) return JSON.parse(cur);
    if (!OLD_KEY) { // a walk that is new on this device: take the name and the map layers from the Queen Charlotte data
      const q = JSON.parse(localStorage.getItem('qct-2026-v3') || '{}');
      return { shareName: q.shareName || '', photoBy: q.photoBy || '', layers: q.layers || undefined, devId: q.devId || '' };
    }
    const old = JSON.parse(localStorage.getItem(OLD_KEY) || '{}'); // keep check-ins from the first version, take the new start times
    delete old.starts; return old;
  } catch (e) { return {}; }
})());
let saveTimer = 0;
function saveNow() { clearTimeout(saveTimer); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage is not available */ } }
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage is not available */ } }, 300);
}
if (!S.devId) S.devId = Math.random().toString(36).slice(2, 10);
if (!S.layers) S.layers = { topo: false, contours: true, feat: true };
if (!S.plan || typeof S.plan !== 'object') S.plan = {};
if (!/^\d{4}-\d\d-\d\d$/.test(S.date || '')) S.date = QCT ? '2026-11-13' : W.isoDate(Date.now() + W.DAYMS);
DAY0 = W.dayStart(S.date);

// ---------- places
for (const p of POIS) {
  if (p.side && G.SIDES[p.side]) { p.km = G.SIDES[p.side].km; p.off = G.SIDES[p.side].len; }
  else { const s = G.nearestOnTrack(p.lat, p.lon); p.km = s.km; p.off = s.off; }
  Object.assign(p, G.world(p, 0.6));
}
// Distance of each stop along the track, in the walk direction. A lodge with a side track uses its junction.
for (const id in STOPS) { const s = STOPS[id]; s.id = id; if (s.km !== undefined) s.km = G.planKm(s.km); else if (!s.arrive && !s.leave) s.km = G.nearestOnTrack(s.lat, s.lon).km; }
const stopKm = (s, role) => { const side = G.SIDES[role === 'leave' ? (s.leave || s.arrive) : (s.arrive || s.leave)]; return side ? side.km : s.km; };
function pt(lat, lon, ele, side) {
  const x = G.toX(lon), z = G.toZ(lat);
  return { lat, lon, ele, side, x, z, y: G.groundY(x, z) + 0.3 };
}

// ---------- the plan
let days = [];
// The first and last place of the plan. The default is the full track.
const planFrom = () => (S.plan.from && STOPS[S.plan.from] ? S.plan.from : START), planTo = () => (S.plan.to && STOPS[S.plan.to] ? S.plan.to : END);
const planSeq = () => [planFrom(), ...S.nights, planTo()];
function fixPlan() { // keep only the nights that are between the first and the last place, in track order
  if (stopKm(STOPS[planTo()], 'arrive') - stopKm(STOPS[planFrom()], 'leave') < 1) { S.plan.from = null; S.plan.to = null; }
  const a = stopKm(STOPS[planFrom()], 'leave'), b = stopKm(STOPS[planTo()], 'arrive'); let prev = a;
  S.nights = S.nights.filter(id => { const s = STOPS[id]; if (!s) return false; const k = stopKm(s, 'arrive'); if (k > prev + 0.5 && k < b - 0.5) { prev = stopKm(s, 'leave'); return true; } return false; });
}
const zoneOfKm = km => { const f = REV ? G.TOTAL_KM - km : km, z = PACK.zoneKm || [G.TOTAL_KM / 3, G.TOTAL_KM * 2 / 3]; return f < z[0] ? 0 : f < z[1] ? 1 : 2; };
function buildDays() {
  const seq = planSeq();
  days = [];
  for (let i = 0; i < seq.length - 1; i++) {
    const from = STOPS[seq[i]], to = STOPS[seq[i + 1]];
    const sOut = from.leave ? G.SIDES[from.leave] : null, sIn = to.arrive ? G.SIDES[to.arrive] : null;
    const fromKm = sOut ? sOut.km : (from.km ?? 0), toKm = Math.min(sIn ? sIn.km : (to.km ?? G.TOTAL_KM), G.TOTAL_KM);
    const pts = [];
    if (sOut) for (let k = sOut.pts.length - 1; k > 0; k--) { const p = sOut.pts[k]; pts.push(pt(p.lat, p.lon, p.ele, 1)); }
    const mainFrom = pts.length;
    for (let k = G.kmIndex(fromKm); k <= G.kmIndex(toKm); k++) { const p = G.TRACK[k]; const o = pt(p.lat, p.lon, p.ele, 0); o.km = p.km; pts.push(o); }
    const mainTo = pts.length;
    if (sIn) for (let k = 1; k < sIn.pts.length; k++) { const p = sIn.pts[k]; pts.push(pt(p.lat, p.lon, p.ele, 2)); }
    let d = 0, up = 0, down = 0, ref = pts[0].ele;
    pts[0].d = 0;
    for (let k = 1; k < pts.length; k++) {
      d += pts[k].km !== undefined && pts[k - 1].km !== undefined ? (pts[k].km - pts[k - 1].km) * 1000 : G.distM(pts[k - 1].lat, pts[k - 1].lon, pts[k].lat, pts[k].lon); pts[k].d = d;
      if (pts[k].ele - ref > 5) { up += pts[k].ele - ref; ref = pts[k].ele; } else if (ref - pts[k].ele > 5) { down += ref - pts[k].ele; ref = pts[k].ele; }
    }
    const gRev = !GUIDE[seq[i] + '>' + seq[i + 1]] && GUIDE[seq[i + 1] + '>' + seq[i]], guide = GUIDE[seq[i] + '>' + seq[i + 1]] || gRev || null;
    const est = PADDLE ? d / 5500 : QCT ? (d / 4000 + up / 600) * 1.2 : (d / 4000 + up / 600 + down / 1500) * 1.18;
    const hours = guide ? guide.h[1] : est, date = DAY0 + i * W.DAYMS;
    const [sh, sm] = (S.starts[i] || '08:30').split(':').map(Number);
    const tStart = date + (sh * 60 + sm) * 60e3, tEnd = tStart + hours * W.HOUR;
    const [bh, bm] = (S.boat || '16:00').split(':').map(Number), boat = WALK.boat && !REV && seq[i + 1] === END ? date + (bh * 60 + bm) * 60e3 : null;
    const mid = (fromKm + toKm) / 2, outLen = pts[mainFrom].d;
    const pois = POIS.filter(p => !p.far && p.km >= fromKm - 0.05 && p.km <= toKm + 0.05)
      .map(p => ({ p, d: outLen + (p.km - fromKm) * 1000 })).sort((a, b) => a.d - b.d);
    days.push({ i, from, to, fromId: seq[i], toId: seq[i + 1], fromKm, toKm, pts, mainFrom, mainTo, dist: d, up, down, hours, date, tStart, tEnd, guide, gRev: !!gRev, boat,
      zone: zoneOfKm(mid), pois, color: DAYCOLS[i % 5] });
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

// The forecast frame: from one day before day 1 to one day after the last day.
function wxFrame() {
  const t0 = DAY0 - W.DAYMS, n = (days.length + 2) * 24;
  const ok = w => w && w.zones && w.zones.length && W.parseLocal(w.t0) === t0;
  if (ok(PACK.wx)) W.setWX(ok(S.wx) && Date.parse(S.wx.fetched) > Date.parse(PACK.wx.fetched) ? S.wx : PACK.wx);
  else if (ok(S.wx) && S.wx.n === n) W.setWX(S.wx);
  else W.setWX(W.blankWX(t0, n));
}

// ---------- state
fixPlan(); buildDays(); wxFrame();
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
  for (const k of (PACK.extraSides || [])) {
    const s = G.SIDES[k];
    if (s) segs.push({ pts: s.pts.map(q => pt(q.lat, q.lon, q.ele)), color: '#ffffff', dim: true, side: true });
  }
  // the parts of the track that are not in the plan
  const a = G.kmIndex(days[0].fromKm), b = G.kmIndex(days[days.length - 1].toKm);
  for (const [i0, i1] of [[0, a], [b, G.TN - 1]]) if (i1 - i0 > 3) segs.push({ pts: G.TRACK.slice(i0, i1 + 1).map(q => pt(q.lat, q.lon, q.ele)), color: '#ffffff', dim: true, side: true });
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
  const seq = planSeq();
  for (const p of POIS) if (p.stop && p.el) p.el.classList.toggle('off', seq.includes(p.stop)); // the stop marker shows this place
  seq.forEach((id, n) => {
    const s = STOPS[id], w = G.world(s, 1.2);
    const el = mkEl('stop', `<button><i></i>${esc(s.short)}</button>`);
    el.firstChild.addEventListener('click', () => showCard({
      kindHtml: n === 0 ? 'Start' : n === seq.length - 1 ? 'Finish' : 'Night ' + n, title: s.name, text: s.note || '', x: w.x, z: w.z,
      meta: n > 0 && n < seq.length - 1 ? 'Day ' + n + ' ends here. ' + kmTxt(days[n - 1].dist) + ' km' + (PADDLE ? '.' : ' walk.') : ''
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
  let meta = 'km ' + p.km.toFixed(1) + ' from ' + STOPS[START].short;
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
  $('wxChip').innerHTML = W.icon(w.code, isDay(simT)) + `<span><b class="num">${w.inRange ? Math.round(w.temp) + '°' : '–'}</b></span><small>${w.rain >= 0.1 ? w.rain.toFixed(1) + ' mm/h' : Math.round(w.prob) + '% rain'}<br>${esc((ZONES[zoneAt(simT)] || {}).short || '')}</small>`;
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
const YMAX = [250, 500, 1000, 1500, 2000, 2500, 3000].find(v => v >= Math.max(...G.TRACK.map(p => p.ele))) || 3000; // top of the height profiles
function profileSvg(day) {
  const Wd = 340, Hh = 104, L = 28, Rr = 8, T = 8, Bm = 18, ymax = YMAX, pw = Wd - L - Rr, ph = Hh - T - Bm;
  const X = d => L + d / day.dist * pw, Y = e => T + ph - Math.min(e, ymax) / ymax * ph;
  const step = Math.max(1, Math.floor(day.pts.length / 170));
  let line = '';
  for (let i = 0; i < day.pts.length; i += step) line += (i ? 'L' : 'M') + X(day.pts[i].d).toFixed(1) + ' ' + Y(day.pts[i].ele).toFixed(1);
  const last = day.pts[day.pts.length - 1]; line += 'L' + X(last.d).toFixed(1) + ' ' + Y(last.ele).toFixed(1);
  let g = '';
  for (const v of [0, YMAX / 2, YMAX]) g += `<line x1="${L}" x2="${Wd - Rr}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(255,255,255,.1)"/><text x="${L - 4}" y="${Y(v) + 3}" text-anchor="end">${v}</text>`;
  for (let k = 0, ks = day.dist > 30000 ? 10 : 5; k <= day.dist / 1000; k += ks) g += `<text x="${X(k * 1000)}" y="${Hh - 4}" text-anchor="middle">${k}${k === 0 ? ' km' : ''}</text>`;
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
  const warn = !s.none && (s.gust >= 75 || s.rain >= 3);
  const pois = day.pois.map((e, n) => `<li><button data-poi="${n}"><span class="km num">${kmTxt(e.d)} km${day.guide && e.p.inH ? `<small>${e.p.inH}</small>` : ''}</span>${glyph(e.p.kind)}<span class="nm">${esc(e.p.name)}<span class="bd">${badges(e.p.fac)}</span></span>${me && me.day === day.i && e.d > me.d && e.d - me.d < 3000 ? `<span class="away num">${kmTxt(e.d - me.d)} km</span>` : ''}</button></li>`).join('');
  const kmOf = id => stopKm(STOPS[id], 'arrive'), endKm = kmOf(planTo()), verb = PADDLE ? 'Paddle' : 'Walk';
  const opts = (n) => {
    const prevKm = stopKm(STOPS[n === 0 ? planFrom() : S.nights[n - 1]], 'leave');
    return NIGHT_OPTIONS.filter(id => kmOf(id) > prevKm + 2 && kmOf(id) < endKm - 0.5).map(id => `<option value="${id}" ${S.nights[n] === id ? 'selected' : ''}>${esc(STOPS[id].name)} · ${Math.round(kmOf(id) - prevKm)} km</option>`).join('') + `<option value="" ${S.nights[n] ? '' : 'selected'}>${verb} out to ${esc(STOPS[planTo()].short)}</option>`;
  };
  let plan = '';
  if (planOpen) {
    const all = Object.keys(STOPS).filter(id => STOPS[id].km !== undefined || STOPS[id].arrive || STOPS[id].leave).sort((a, b) => kmOf(a) - kmOf(b));
    const fromKm = stopKm(STOPS[planFrom()], 'leave');
    const o = (list, cur) => list.map(id => `<option value="${id}" ${id === cur ? 'selected' : ''}>${esc(STOPS[id].name)} · km ${Math.round(kmOf(id))}</option>`).join('');
    plan = `<div class="plan"><h3 class="t">Your ${PADDLE ? 'trip' : 'walk'}</h3>
      <label for="planDir">Direction<select id="planDir"><option value="0" ${REV ? '' : 'selected'}>${esc(STOPS[REV ? END : START].short)} to ${esc(STOPS[REV ? START : END].short)}</option><option value="1" ${REV ? 'selected' : ''}>${esc(STOPS[REV ? START : END].short)} to ${esc(STOPS[REV ? END : START].short)}</option></select></label>
      <label for="planFrom">Start at<select id="planFrom">${o(all.filter(id => kmOf(id) < endKm - 1), planFrom())}</select></label>
      <label for="planTo">Stop at<select id="planTo">${o(all.filter(id => kmOf(id) > fromKm + 1), planTo())}</select></label>
      <label for="planDate">Day 1<input type="date" id="planDate" value="${S.date}"></label>
      <h3 class="t">Where you sleep</h3>`;
    for (let n = 0; n < 8 && n <= S.nights.length; n++) { const op = opts(n); if (n === S.nights.length && !/value="[a-z]/.test(op)) break; plan += `<label for="night${n}">Night ${n + 1}<select id="night${n}" data-night="${n}">${op}</select></label>`; }
    plan += '<p class="fine">Distances, times and the forecast change with your plan. A change of direction starts the map again.</p></div>';
  }
  const notes = day.guide && !day.gRev ? day.guide.notes : (WALK.notes || []);
  $('p-days').innerHTML = `
    <div class="pills">${pills}</div>
    <h2 class="t">${esc(day.from.short)} to ${esc(day.to.name)}</h2>
    <div class="stats">
      <div><b class="num">${kmTxt(day.dist)}</b><span>km</span></div>
      <div><b class="num">${Math.round(day.up / 10) * 10}</b><span>m of climb</span></div>
      <div><b class="num">${day.guide ? (day.guide.h[0] === day.guide.h[1] ? day.guide.h[0] + ' h' : day.guide.h[0] + '–' + day.guide.h[1] + ' h') : durTxt(day.hours)}</b><span>${day.guide ? 'route guide time' : PADDLE ? 'paddle time, estimate' : 'walk time, estimate'}</span></div>
    </div>
    <label class="startrow" for="startTime"><span>Start</span><input type="time" id="startTime" value="${S.starts[day.i] || '08:30'}"><span class="num">Arrive about ${W.fmtTime(day.tEnd)}${day.guide && day.guide.km ? '. Route guide: ' + day.guide.km + ' km' : ''}</span></label>
    ${day.boat ? `<label class="startrow boatrow ${day.tEnd > day.boat - 20 * 60e3 ? 'late' : ''}" for="boatTime"><span>Boat</span><input type="time" id="boatTime" value="${S.boat}"><span class="num">${day.tEnd > day.boat ? 'Your plan arrives after the boat. Start earlier.' : 'Water taxi from ' + esc(day.to.short) + '. Your plan has ' + durTxt((day.boat - day.tEnd) / W.HOUR) + ' spare.' + (day.boat - day.tEnd < 45 * 60e3 ? ' Start earlier if you can.' : '')}</span></label>` : ''}
    <button class="verdict ${warn ? 'warn' : ''}" id="verdict" style="text-align:left">${W.icon(s.code, true)}<span>${s.none ? '<b>No forecast for this day yet</b>The forecast starts about 16 days before the day. Touch Update forecast in the Weather tab when you are nearer the date.' : `<b class="num">${Math.round(s.tmin)}° to ${Math.round(s.tmax)}° · ${s.rain >= 0.3 ? s.rain.toFixed(1) + ' mm rain' : 'no rain'} · gusts ${Math.round(s.gust)}</b>${esc(s.verdict.join(' '))}`}</span></button>
    ${profileSvg(day)}
    <div class="btns"><button class="btn pri" id="flyDay">Fly this day</button><button class="btn" id="showDay">Show on map</button><button class="btn" id="editPlan">${planOpen ? 'Close plan' : 'Change plan'}</button></div>
    ${plan}
    ${notes.length ? `<h3 class="t">Know before you go</h3><ul class="notes">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    <h3 class="t">On the way</h3>
    <ol class="list">${pois}</ol>
    ${FEAT.data ? `<p class="fine num">${FEAT.data.cross.filter(c => c.km >= day.fromKm && c.km <= day.toKm).length} mapped streams cross the track on this day. Zoom in on the map to see them as blue dots.</p>` : ''}
    <div class="tonight"><b>${day.i === days.length - 1 ? 'Finish' : 'Tonight'}: ${esc(day.to.name)}</b><p>${esc(day.to.note || '')}</p></div>
    <p class="fine">${QCT ? 'Times, facilities and route notes: Wilderness Guides route guide. Distances are measured on this map. Use Change plan if your lodges are different. Track line and places: OpenStreetMap contributors.' : 'Times are estimates from the distance and the climb. They are not DOC times. Distances are measured on this map. Track line: OpenStreetMap contributors. Huts and campsites: Department of Conservation, CC BY 4.0.'} Heights, Topo50 map and topo features: sourced from LINZ, CC BY 4.0.</p>`;
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
      replan();
    }
    if (t.id === 'planFrom' || t.id === 'planTo') { S.plan[t.id === 'planFrom' ? 'from' : 'to'] = t.value; replan(); }
    if (t.id === 'planDate' && t.value) { S.date = t.value; DAY0 = W.dayStart(S.date); for (const c of S.checkins) c.day = Math.floor((c.t - DAY0) / W.DAYMS); replan(); }
    if (t.id === 'planDir' && (t.value === '1') !== REV) { // the track data is put in the new direction when the app starts again
      const a = planFrom(), b = planTo();
      S.plan = { rev: !REV, from: b === END ? null : b, to: a === START ? null : a, redo: 1 }; S.nights.reverse();
      saveNow(); location.reload();
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
function replan() { // the plan changed: days, markers, forecast frame
  fixPlan(); buildDays(); sel = Math.min(sel, days.length - 1);
  for (const c of S.checkins) if (days[c.day]) c.d = nearestOnDay(days[c.day], c.lat, c.lon).d;
  const had = W.WX; wxFrame(); save();
  buildStopMarkers(); drawRoutes(); updateHud(); renderAll(); buildTimebar(); applyEnv(); updateTimeUI(true);
  if (W.WX !== had && navigator.onLine !== false) refreshWx(true);
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
    if (!w.inRange) { hrs += `<button class="hr num ${walk ? 'walk' : ''} ${dl ? '' : 'nt'} ${cur ? 'cur' : ''}" data-t="${t}" aria-label="${W.p2(h)}:00, no forecast"><span>${W.p2(h)}</span><b>–</b></button>`; continue; }
    hrs += `<button class="hr num ${walk ? 'walk' : ''} ${dl ? '' : 'nt'} ${cur ? 'cur' : ''}" data-t="${t}" aria-label="${W.p2(h)}:00, ${W.describe(w.code)}, ${Math.round(w.temp)} degrees">
      <span>${W.p2(h)}</span>${W.icon(w.code, dl)}<b>${Math.round(w.temp)}°</b>
      <span class="bar"><i style="height:${Math.min(100, w.rain / 3 * 100)}%"></i></span><span class="mm">${w.rain >= 0.1 ? w.rain.toFixed(1) : ''}</span>
      <span class="wd">${windArrow(w.dir)}</span><span>${Math.round(w.wind)}</span><span class="gu ${w.gust >= 60 ? 'hi' : ''}">${Math.round(w.gust)}</span></button>`;
  }
  const sun = W.sunTimes(t0), f = Date.parse(W.WX.fetched), noWx = !W.WX.fetched;
  $('p-sky').innerHTML = `
    <div class="pills">${pills}</div>
    <div class="row" style="justify-content:space-between"><h2 class="t">${W.fmtDay(t0)} · ${esc((ZONES[day.zone] || {}).name || '')}</h2></div>
    <div class="hours" id="hours">${hrs}</div>
    <p class="fine">Rows: hour, sky, °C, rain in mm, wind direction, wind and gusts in km/h. The pale band is your walk time. Touch an hour to see it on the map.</p>
    <p class="big num">Sunrise ${sun.rise ? W.fmtTime(sun.rise) : '–'} · Sunset ${sun.set ? W.fmtTime(sun.set) : '–'}</p>
    <div class="row"><button class="btn" id="wxRefresh">Update forecast</button><span class="fine" style="flex:1">${esc(wxStatus || (noWx ? 'No forecast is stored for these dates. Touch Update forecast.' : 'Forecast model: Open-Meteo. Read ' + W.fmtDay(f) + ' at ' + W.fmtTime(f) + '.'))}</span></div>`;
  const cur = $('hours').querySelector('.walk'); if (cur) $('hours').scrollLeft = Math.max(0, cur.offsetLeft - 20);
}
async function refreshWx(silent) {
  if (!silent) { wxStatus = 'Reading the forecast…'; renderSky(); }
  try {
    const w = await W.fetchLive(ZONES, DAY0 - W.DAYMS, (days.length + 2) * 24);
    W.setWX(w); S.wx = w; save(); wxStatus = '';
    buildTimebar(); applyEnv(); updateTimeUI(true); renderAll();
    if (!silent) toast('Forecast updated');
  } catch (e) {
    if (!silent) { wxStatus = e && e.message === 'early' ? 'No forecast yet. Open-Meteo gives a forecast for the next 16 days only.' : e && e.message === 'old' ? 'These dates are too far in the past for the forecast service.' : 'Update failed. There is no connection to Open-Meteo from here. The stored forecast stays in use.'; renderSky(); }
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

// ---------- grid reference: NZTM2000, the system of the Topo50 maps
function nztm(lat, lon) {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, e2 = 2 * f - f * f, phi = lat * Math.PI / 180, w = (lon - 173) * Math.PI / 180;
  const A0 = 1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256, A2 = 3 / 8 * (e2 + e2 * e2 / 4 + 15 * e2 ** 3 / 128), A4 = 15 / 256 * (e2 * e2 + 3 * e2 ** 3 / 4), A6 = 35 * e2 ** 3 / 3072;
  const m = a * (A0 * phi - A2 * Math.sin(2 * phi) + A4 * Math.sin(4 * phi) - A6 * Math.sin(6 * phi));
  const sn = Math.sin(phi), c = Math.cos(phi), t = Math.tan(phi), t2 = t * t, rho = a * (1 - e2) / Math.pow(1 - e2 * sn * sn, 1.5), nu = a / Math.sqrt(1 - e2 * sn * sn), psi = nu / rho;
  const E = 1600000 + k0 * nu * w * c * (1 + w * w / 6 * c * c * (psi - t2) + w ** 4 / 120 * c ** 4 * (4 * psi ** 3 * (1 - 6 * t2) + psi * psi * (1 + 8 * t2) - psi * 2 * t2 + t2 * t2) + w ** 6 / 5040 * c ** 6 * (61 - 479 * t2 + 179 * t2 * t2 - t2 ** 3));
  const N = 10000000 + k0 * (m + nu * sn * c * (w * w / 2 + w ** 4 / 24 * c * c * (4 * psi * psi + psi - t2) + w ** 6 / 720 * c ** 4 * (8 * psi ** 4 * (11 - 24 * t2) - 28 * psi ** 3 * (1 - 6 * t2) + psi * psi * (1 - 32 * t2) - psi * 2 * t2 + t2 * t2) + w ** 8 / 40320 * c ** 6 * (1385 - 3111 * t2 + 543 * t2 * t2 - t2 ** 3)));
  return { e: E, n: N };
}
// Topo50 sheets are 24 km wide and 36 km high. The rows have two letters, with no I and no O.
const SHEET_ROWS = (() => { const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ', out = []; for (const c of 'STUVWXYZ') out.push('A' + c); for (const c of L) out.push('B' + c); for (const c of 'ABCDEFGHJK') out.push('C' + c); return out; })();
function gridRef(lat, lon) {
  const g = nztm(lat, lon), E = Math.round(g.e), N = Math.round(g.n);
  const col = 28 + Math.floor((E - 1660000) / 24000), row = SHEET_ROWS[Math.floor((6234000 - N) / 36000)] || '';
  const six = String(Math.floor(E / 100) % 1000).padStart(3, '0') + ' ' + String(Math.floor(N / 100) % 1000).padStart(3, '0');
  return { E, N, sheet: row && col >= 4 && col <= 45 ? row + String(col).padStart(2, '0') : '', six };
}
function posText(lat, lon) {
  const g = gridRef(lat, lon);
  return `NZTM E ${g.E} N ${g.N}` + (g.sheet ? ` · Topo50 ${g.sheet} ${g.six}` : '') + ` · ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

// ---------- map layers: Topo50 skin, contour lines, topo features
const FEAT = { data: null, kinds: {
  wharf: { label: 'Wharf', far: 95, text: 'Wharf or jetty from the Topo50 data. Many are private. With no phone signal, you can hail a passing boat from a jetty.' },
  boatramp: { label: 'Boat ramp', far: 95, text: 'Boat ramp from the Topo50 data.' },
  peak: { label: 'Spot height', far: 170 }, trig: { label: 'Trig station', far: 200, text: 'Survey mark from the Topo50 data.' },
  homestead: { label: 'Homestead', far: 150, text: 'Homestead from the Topo50 data. This is private land.' },
  beacon: { label: 'Light', far: 220, text: 'Navigation light for boats.' }, wreck: { label: 'Wreck', far: 220, text: 'Shipwreck from the Topo50 data.' },
  waterfall_pt: { label: 'Waterfall', far: 150, text: 'Waterfall from the Topo50 data.' },
  hut: { label: 'Hut', far: 150, text: 'Hut from the Topo50 data. It can be private or locked.' }, shelter: { label: 'Shelter', far: 120, text: 'Shelter from the Topo50 data.' },
  monument: { label: 'Monument', far: 150, text: 'Monument from the Topo50 data.' }, historic_site: { label: 'Historic site', far: 150, text: 'Historic site from the Topo50 data.' },
  cross: { label: 'Stream', far: 60, text: 'A mapped stream crosses the track here. Small streams can be dry in summer. Treat water from streams before you drink it.' } } };
function applyLayers(first) {
  const L = S.layers;
  scene.setLayers({ topo: L.topo, contours: L.contours }, st => {
    if (st === 'loading') toast('Loading the Topo50 map…', 6000);
    else if (st === 'ready') toast('Topo50 map is on', 2500);
    else if (st === 'error') { S.layers.topo = false; save(); toast('The Topo50 map did not load. Try again with a connection.', 5000); }
  });
  scene.showFeatureLines(L.feat && !L.topo);
  if (!first) drawFeatures();
}
async function loadFeatures() {
  try { const r = await fetch(BASE + 'topofeat.json'); if (!r.ok) return; FEAT.data = await r.json(); for (const c of FEAT.data.cross) c.km = +G.planKm(c.km).toFixed(2); } catch (e) { return; }
  const d = FEAT.data, seg = list => { const out = []; for (const ln of list) for (let i = 0; i + 3 < ln.length; i += 2) { const a = G.world({ lon: ln[i], lat: ln[i + 1] }, 0.22), b = G.world({ lon: ln[i + 2], lat: ln[i + 3] }, 0.22); out.push(a.x, a.y, a.z, b.x, b.y, b.z); } return out; };
  scene.setFeatureLines([{ seg: seg(d.streams), color: '#7cc8ff', width: 1.3, opacity: 0.85 }, { seg: seg(d.roads), color: '#f4e7bd', width: 2, opacity: 0.9 }, { seg: seg(d.tracks), color: '#f4e7bd', width: 1.4, opacity: 0.9, dashed: true }]);
  scene.showFeatureLines(S.layers.feat && !S.layers.topo);
  drawFeatures(); if (S.tab === 'days') renderDays();
}
function drawFeatures() {
  scene.clearMarkers('feat');
  if (!FEAT.data || !S.layers.feat) return;
  const add = (k, p, name, ele) => {
    const K = FEAT.kinds[k]; if (!K) return;
    const w = G.world({ lat: p.la, lon: p.lo }, 0.7), tap = !!K.text;
    const inner = k === 'peak' ? `<span>${Math.round(ele)}</span>` : k === 'trig' ? `<button><svg viewBox="0 0 12 12"><path d="M6 1.5 11 10.5H1z" fill="none" stroke="#fff" stroke-width="1.4"/><circle cx="6" cy="7.4" r="1" fill="#fff"/></svg>${ele ? Math.round(ele) : ''}</button>`
      : k === 'wharf' || k === 'boatramp' ? '<button aria-label="Wharf"><i class="wh"></i></button>' : k === 'cross' ? '<button aria-label="Stream"><i class="st"></i></button>' : `<button>${esc(name || K.label)}</button>`;
    const el = mkEl('feat f-' + k, inner);
    if (tap && el.firstChild.tagName === 'BUTTON') el.firstChild.addEventListener('click', () => showCard({ kindHtml: K.label + ' · Topo50', title: name && k !== 'trig' ? name : K.label + (ele ? ' ' + Math.round(ele) + ' m' : ''), text: K.text + (k === 'cross' ? ' Track km ' + p.km + '.' : ''), meta: posText(p.la, p.lo), x: w.x, z: w.z }));
    scene.addMarker({ el, ...w, pri: k === 'peak' || k === 'trig' ? 8 : 5, far: K.far, group: 'feat', w: k === 'peak' ? 26 : 0, h: 14 });
  };
  for (const p of FEAT.data.pts) add(p.k, p, p.n, p.e);
  for (const c of FEAT.data.cross) add('cross', c, c.n);
}
function showLayers() {
  const L = S.layers, sw = (id, on, a, b) => `<span class="seg" role="group"><button data-lay="${id}:1" aria-pressed="${on}">${a}</button><button data-lay="${id}:0" aria-pressed="${!on}">${b}</button></span>`;
  showCard({ kindHtml: 'Map layers', title: 'What the map shows', fly: false,
    html: `<span class="layrow"><b>Map</b>${sw('topo', L.topo, 'Topo50', 'Painted')}</span>
      <span class="layrow"><b>Contour lines</b>${sw('contours', L.contours, 'On', 'Off')}</span>
      <span class="layrow"><b>Topo features</b>${sw('feat', L.feat, 'On', 'Off')}</span>
      <span class="facrow">Topo50 is the LINZ 1:50,000 map. It has its own contour lines, so the app draws its lines only on the painted map: a thin line each ${PACK.geo.hmax > 1250 ? 50 : 20} m and a strong line each ${PACK.geo.hmax > 1250 ? 250 : 100} m. Topo features are streams, roads, other tracks, wharves and spot heights. Zoom in to see them. Sourced from LINZ. CC BY 4.0.</span>` });
}

// ---------- photos: read time and GPS, pin them to the trail
const PH = { db: null, mem: new Map(), list: [], url: {}, big: {}, busy: '', view: -1, armed: false, flashT: 0 };
const pdbOpen = () => new Promise(res => { try { const r = indexedDB.open('qcnz-photos', 1); r.onupgradeneeded = () => r.result.createObjectStore('p', { keyPath: 'id' }); r.onsuccess = () => { PH.db = r.result; res(); }; r.onerror = () => res(); } catch (e) { res(); } });
const pdbAll = () => !PH.db ? Promise.resolve([...PH.mem.values()]) : new Promise(res => { try { const q = PH.db.transaction('p').objectStore('p').getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); } catch (e) { res([]); } });
const pdbTx = fn => !PH.db ? Promise.resolve() : new Promise(res => { try { const tx = PH.db.transaction('p', 'readwrite'); fn(tx.objectStore('p')); tx.oncomplete = res; tx.onerror = res; tx.onabort = res; } catch (e) { res(); } });
async function readExif(file) {
  const out = {};
  try {
    const buf = new DataView(await file.slice(0, 384 * 1024).arrayBuffer());
    if (buf.byteLength < 12 || buf.getUint16(0) !== 0xFFD8) return out;
    let o = 2;
    while (o + 10 < buf.byteLength) {
      const marker = buf.getUint16(o), size = buf.getUint16(o + 2);
      if ((marker & 0xFF00) !== 0xFF00) break;
      if (marker === 0xFFE1 && buf.getUint32(o + 4) === 0x45786966) {
        const tiff = o + 10, le = buf.getUint16(tiff) === 0x4949, end = Math.min(buf.byteLength, o + 2 + size);
        const u16 = q => buf.getUint16(q, le), u32 = q => buf.getUint32(q, le);
        const ifd = (off, cb) => { const q = tiff + off; if (!off || q + 2 > end) return; const n = u16(q); for (let i = 0; i < n; i++) { const e = q + 2 + i * 12; if (e + 12 > end) return; cb(u16(e), u32(e + 4), e + 8); } };
        const str = (count, vp) => { const q = count > 4 ? tiff + u32(vp) : vp; let t = ''; for (let i = 0; i < count - 1 && q + i < end; i++) t += String.fromCharCode(buf.getUint8(q + i)); return t; };
        const dms = vp => { const q = tiff + u32(vp); if (q + 24 > end) return null; const r = i => u32(q + i * 8) / (u32(q + i * 8 + 4) || 1); return r(0) + r(1) / 60 + r(2) / 3600; };
        let ex = 0, gp = 0;
        ifd(u32(tiff + 4), (tag, count, vp) => { if (tag === 0x8769) ex = u32(vp); else if (tag === 0x8825) gp = u32(vp); else if (tag === 0x0132) out.dt0 = str(count, vp); });
        ifd(ex, (tag, count, vp) => { if (tag === 0x9003) out.dt = str(count, vp); else if (tag === 0x9011) out.tz = str(count, vp); });
        let latR, lonR, lat = null, lon = null;
        ifd(gp, (tag, count, vp) => { if (tag === 1) latR = String.fromCharCode(buf.getUint8(vp)); else if (tag === 2) lat = dms(vp); else if (tag === 3) lonR = String.fromCharCode(buf.getUint8(vp)); else if (tag === 4) lon = dms(vp); });
        if (lat !== null && lon !== null && (lat || lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) { out.lat = latR === 'S' ? -lat : lat; out.lon = lonR === 'W' ? -lon : lon; }
        break;
      }
      o += 2 + size;
    }
  } catch (e) { /* no metadata */ }
  return out;
}
function exifTime(x, file) {
  const m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(x.dt || x.dt0 || '');
  if (m) { const tz = /^[+-]\d\d:\d\d$/.test(x.tz || '') ? x.tz : '+13:00', t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${tz}`); if (!isNaN(t)) return { t, exact: true }; }
  return { t: file.lastModified || Date.now(), exact: false };
}
async function shrink(file) {
  let src;
  try { src = await createImageBitmap(file); }
  catch (e) { src = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(file); }); }
  const draw = (from, max, q) => { const w = from.width, h = from.height, k = Math.min(1, max / Math.max(w, h)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k)); c.getContext('2d').drawImage(from, 0, 0, c.width, c.height); return new Promise(r => c.toBlob(b => r([b, c]), 'image/jpeg', q)); };
  const [img, canvas] = await draw(src, 1400, 0.8), [thumb] = await draw(canvas, 260, 0.72);
  if (!img || !thumb) throw new Error('decode');
  return { img, thumb };
}
// Where was the walker at this time? Use the check-ins of that day, or the plan.
function posAtTime(t) {
  const i = dayOfTime(t); if (i === null) return null;
  const day = days[i], cs = S.checkins.filter(c => c.day === i).sort((a, b) => a.t - b.t);
  if (cs.length >= 2 && t >= cs[0].t - 15 * 60e3 && t <= cs[cs.length - 1].t + 15 * 60e3) {
    if (t <= cs[0].t) return { day: i, d: cs[0].d }; if (t >= cs[cs.length - 1].t) return { day: i, d: cs[cs.length - 1].d };
    let j = 0; while (j < cs.length - 2 && cs[j + 1].t < t) j++;
    return { day: i, d: cs[j].d + (cs[j + 1].d - cs[j].d) * (t - cs[j].t) / Math.max(1, cs[j + 1].t - cs[j].t) };
  }
  const u = (t - day.tStart) / (day.tEnd - day.tStart);
  return { day: i, d: Math.max(0, Math.min(1, u)) * day.dist };
}
function placePhoto(p) { // set day, distance on the route and map position
  if (p.glat !== undefined) {
    let i = dayOfTime(p.t), best = null;
    for (const d of days) { const n = nearestOnDay(d, p.glat, p.glon); if (!best || (d.i === i ? n.off - 400 : n.off) < best.score) best = { day: d.i, d: n.d, off: n.off, score: d.i === i ? n.off - 400 : n.off }; }
    p.lat = p.glat; p.lon = p.glon; p.pos = 'gps';
    if (best && best.off < 600) { p.day = best.day; p.d = best.d; } else { p.day = i === null ? undefined : i; p.d = undefined; }
  } else {
    const q = posAtTime(p.t);
    if (q) { const w = posOnDay(days[q.day], q.d); p.day = q.day; p.d = q.d; p.lat = w.lat; p.lon = w.lon; p.pos = 'time'; }
    else { p.day = undefined; p.d = undefined; p.lat = undefined; p.lon = undefined; p.pos = 'none'; }
  }
}
async function addPhotos(files) {
  const by = ($('phBy') ? $('phBy').value.trim() : '') || S.photoBy || S.shareName || '';
  S.photoBy = by; save();
  let ok = 0, gps = 0, dup = 0, bad = 0, n = 0;
  for (const f of files) {
    PH.busy = 'Reading photo ' + (++n) + ' of ' + files.length + '…'; const st = $('phStatus'); if (st) st.textContent = PH.busy;
    const id = (f.name + ':' + f.size + ':' + f.lastModified).replace(/[^\w:.-]/g, '_');
    if (PH.list.some(p => p.id === id)) { dup++; continue; }
    try {
      const x = await readExif(f), tm = exifTime(x, f), im = await shrink(f);
      const p = { id, walk: WALK.id, t: tm.t, exact: tm.exact, by, name: f.name, img: im.img, thumb: im.thumb };
      if (x.lat !== undefined) { p.glat = +x.lat.toFixed(6); p.glon = +x.lon.toFixed(6); gps++; }
      placePhoto(p); PH.mem.set(id, p); await pdbTx(st2 => st2.put(p));
      PH.list.push(p); PH.url[id] = URL.createObjectURL(p.thumb); ok++;
    } catch (e) { bad++; }
  }
  PH.busy = ''; PH.list.sort((a, b) => a.t - b.t);
  drawPhotos(); renderAll(); albumSync(true);
  toast(ok + (ok === 1 ? ' photo' : ' photos') + ' added. ' + gps + ' with GPS, ' + (ok - gps) + ' placed by time.' + (dup ? ' ' + dup + ' already here.' : '') + (bad ? ' ' + bad + ' could not be read.' : ''), 6000);
}
async function loadPhotos() {
  await pdbOpen();
  PH.list = (await pdbAll()).filter(p => (p.walk || 'qct') === WALK.id).sort((a, b) => a.t - b.t); // each walk has its own photos
  for (const p of PH.list) { placePhoto(p); try { PH.url[p.id] = URL.createObjectURL(p.thumb); } catch (e) { /* skip */ } }
  drawPhotos(); if (S.tab === 'photos' || S.tab === 'profile') renderAll();
  albumLoop(); albumSync(false);
}
function drawPhotos() {
  scene.clearMarkers('photos');
  PH.list.forEach((p, n) => {
    if (p.lat === undefined || !G.inBounds(p.lat, p.lon) || !PH.url[p.id]) return;
    const w = G.world(p, 1.0), el = mkEl('photo', `<button aria-label="Photo"><img src="${PH.url[p.id]}" alt=""></button>`);
    el.firstChild.addEventListener('click', () => openPhoto(n));
    scene.addMarker({ el, ...w, pri: 30, far: 300, group: 'photos', w: 36, h: 36, noOcc: true });
  });
}
function photoCaption(p) {
  let c = W.fmtDay(p.t) + ' ' + W.fmtTime(p.t);
  if (p.day !== undefined && p.d !== undefined) c += ' · day ' + (p.day + 1) + ', ' + kmTxt(p.d) + ' km';
  c += p.pos === 'gps' ? ' · GPS position' : p.pos === 'time' ? ' · position from the time' : ' · no position';
  if (p.by) c += ' · ' + p.by;
  return c;
}
function openPhoto(n) {
  const p = PH.list[n]; if (!p) return;
  PH.view = n; PH.armed = false;
  if (!PH.big[p.id]) { try { PH.big[p.id] = p.img ? URL.createObjectURL(p.img) : p.path ? sbFile(p.path + '.jpg') : PH.url[p.id]; } catch (e) { PH.big[p.id] = PH.url[p.id]; } }
  $('pvImg').onerror = () => { $('pvImg').onerror = null; $('pvImg').src = PH.url[p.id]; };
  $('pvImg').src = PH.big[p.id]; $('pvCap').textContent = photoCaption(p) + ' · ' + (n + 1) + ' of ' + PH.list.length;
  $('pvDel').textContent = 'Delete'; $('pvMap').disabled = p.lat === undefined || !G.inBounds(p.lat, p.lon);
  $('photoView').hidden = false;
}
function photoFlash(p) {
  const el = $('photoFlash'); if (!PH.url[p.id]) return;
  $('pfImg').src = PH.url[p.id]; $('pfCap').textContent = W.fmtTime(p.t) + (p.by ? ' · ' + p.by : '');
  el.hidden = false; el.classList.add('on'); clearTimeout(PH.flashT);
  PH.flashT = setTimeout(() => { el.classList.remove('on'); setTimeout(() => { el.hidden = true; }, 400); }, 3600 / R.speed + 900);
}
function renderPhotos() {
  const groups = days.map(d => ({ title: 'Day ' + (d.i + 1) + ' · ' + W.fmtDay(d.date), items: [] })); const other = { title: 'Other days and places', items: [] };
  PH.list.forEach((p, n) => (p.day !== undefined && groups[p.day] ? groups[p.day] : other).items.push(n));
  const grid = g => g.items.length ? `<h3 class="t">${g.title} · ${g.items.length}</h3><div class="pgrid">${g.items.map(n => `<button data-ph="${n}" aria-label="Photo, ${esc(photoCaption(PH.list[n]))}"><img src="${PH.url[PH.list[n].id] || ''}" alt="" loading="lazy">${PH.list[n].pos === 'gps' ? '' : '<i></i>'}</button>`).join('')}</div>` : '';
  $('p-photos').innerHTML = `
    ${albumHtml()}
    <div class="row"><button class="btn pri" id="phAdd">Add photos</button><input class="txt" id="phBy" maxlength="20" placeholder="Photos by (name)" value="${esc(S.photoBy || S.shareName || '')}" aria-label="Name of the person who made the photos"><input type="file" id="phInput" accept="image/*" multiple hidden></div>
    <p class="fine num" id="phStatus">${esc(PH.busy || (PH.list.length ? 'Photos: ' + PH.list.length + '. With a GPS position: ' + PH.list.filter(p => p.pos === 'gps').length + '. A dot on a photo shows that its position comes from the time.' : 'Add photos from this phone. The app reads the time and the GPS position in each photo and puts it on the map, the profile and Replay.'))}</p>
    ${groups.map(grid).join('')}${grid(other)}
    <p class="fine">${album() ? 'Each photo you add goes to the shared album in a smaller size. Each person with the link can see it and add photos. Delete removes a photo from this phone only.' : 'Photos stay on this phone, in a smaller size, until the shared album is on.'} Photos that come through WhatsApp or most chat apps have no GPS position, so the app places them by time. On iPhone, touch Options in the photo picker and keep Location on.</p>
    ${PH.list.length ? `<div class="btns"><button class="btn danger" id="phWipe">${PH.armed ? 'Touch again to delete all photos' : 'Delete all photos'}</button></div>` : ''}`;
}
function wirePhotos() {
  const p = $('p-photos');
  p.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id !== 'phWipe') PH.armed = false;
    if (b.id === 'phAdd') $('phInput').click();
    else if (b.id === 'albCode') { const a = crypto.getRandomValues(new Uint8Array(12)); shareStart([...a].map(x => CODE_CHARS[x % 32]).join(''), S.photoBy || S.shareName || ''); S.share.send = false; save(); albumLoop(); renderPhotos(); albumSync(true); shareLink(); }
    else if (b.id === 'albSend') shareLink();
    else if (b.id === 'albNow') albumSync(true);
    else if (b.dataset.ph !== undefined) openPhoto(+b.dataset.ph);
    else if (b.id === 'phWipe') {
      if (!PH.armed) { PH.armed = true; renderPhotos(); return; }
      PH.armed = false; for (const q of PH.list) if (q.remote) (S.hidePh = S.hidePh || []).push(q.remote); save();
      PH.list = []; PH.mem.clear(); pdbTx(st => st.clear()); drawPhotos(); renderPhotos(); toast('Photos deleted from this phone');
    }
  });
  p.addEventListener('change', e => {
    if (e.target.id === 'phInput' && e.target.files && e.target.files.length) addPhotos([...e.target.files]);
    if (e.target.id === 'phBy') { S.photoBy = e.target.value.trim(); save(); }
  });
  $('photoView').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) { if (e.target.id === 'photoView') $('photoView').hidden = true; return; }
    const p = PH.list[PH.view];
    if (b.id === 'pvClose') $('photoView').hidden = true;
    else if (b.id === 'pvPrev') openPhoto((PH.view - 1 + PH.list.length) % PH.list.length);
    else if (b.id === 'pvNext') openPhoto((PH.view + 1) % PH.list.length);
    else if (b.id === 'pvMap' && p) { $('photoView').hidden = true; const w = G.world(p); if (p.day !== undefined && p.day !== sel) selectDay(p.day, false); scene.flyTo({ x: w.x, z: w.z, dist: 34, polar: 1.0, dur: 1300 }); }
    else if (b.id === 'pvDel' && p) {
      if (!PH.armed) { PH.armed = true; b.textContent = 'Touch again to delete'; return; }
      PH.armed = false; PH.list.splice(PH.view, 1); PH.mem.delete(p.id); pdbTx(st => st.delete(p.id)); if (p.remote) { (S.hidePh = S.hidePh || []).push(p.remote); save(); } drawPhotos(); renderAll();
      if (PH.list.length) openPhoto(Math.min(PH.view, PH.list.length - 1)); else $('photoView').hidden = true;
    }
  });
}

// ---------- shared album: photos in Supabase storage, one album for each share code
// The key below is the public (publishable) key of the project. Row rules in the database limit what it can do.
const SB = { url: 'https://eogjcbfnxvkpmptnbeyw.supabase.co', key: typeof __SBKEY__ === 'string' ? __SBKEY__ : '' };
const ALB = { busy: false, status: '', err: '', last: 0, timer: 0 };
const album = () => SB.url && SB.key && S.share && window.crypto && crypto.subtle ? SB : null;
const sbHead = extra => Object.assign({ apikey: SB.key, Authorization: 'Bearer ' + SB.key }, extra || {});
const sbFile = path => `${SB.url}/storage/v1/object/public/qct/${path}`;
const cx = v => String(v).replace(/[^\w:.-]/g, '_').slice(0, 120);
async function sbErr(r) { let m = 'HTTP ' + r.status; try { const j = await r.json(); m = j.message || j.error || m; } catch (e) { /* no body */ } return new Error(m); }
async function albumUpload(p) {
  const k = await shareKeys();
  if (!p.path) { p.path = k.topic + '/' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); await pdbTx(st => st.put(p)); }
  for (const [blob, suffix] of [[p.thumb, '_t.jpg'], [p.img, '.jpg']]) {
    const r = await fetch(`${SB.url}/storage/v1/object/qct/${p.path}${suffix}`, { method: 'POST', headers: sbHead({ 'Content-Type': 'image/jpeg' }), body: blob });
    if (!r.ok && r.status !== 409) { const e = await sbErr(r); if (!/exist|duplicate/i.test(e.message)) throw e; }
  }
  const row = { id: k.topic + ':' + cx(p.id), album: k.topic, t: p.t, exact: !!p.exact, by: (p.by || '').slice(0, 24), path: p.path };
  if (p.glat !== undefined) { row.lat = p.glat; row.lon = p.glon; }
  const r = await fetch(`${SB.url}/rest/v1/qct_photos`, { method: 'POST', headers: sbHead({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }), body: JSON.stringify(row) });
  if (!r.ok && r.status !== 409) throw await sbErr(r);
  p.remote = row.id; await pdbTx(st => st.put(p));
}
async function albumSync(manual) {
  if (!album() || ALB.busy || (document.hidden && !manual)) return;
  ALB.busy = true; ALB.err = ''; let added = 0, sent = 0;
  const say = t => { ALB.status = t; const el = $('albStatus'); if (el) el.textContent = t; };
  try {
    const mine = PH.list.filter(p => !p.remote && p.img);
    for (const p of mine) { say('Sending photo ' + (sent + 1) + ' of ' + mine.length + ' to the album…'); await albumUpload(p); sent++; }
    say('Reading the album…');
    const k = await shareKeys();
    const r = await fetch(`${SB.url}/rest/v1/rpc/qct_list`, { method: 'POST', headers: sbHead({ 'Content-Type': 'application/json' }), body: JSON.stringify({ p_album: k.topic }) });
    if (!r.ok) throw await sbErr(r);
    for (const x of await r.json()) {
      if ((S.hidePh || []).includes(x.id) || PH.list.some(p => p.remote === x.id)) continue;
      const p = { id: 'r:' + x.id, walk: WALK.id, remote: x.id, path: x.path, t: +x.t, exact: !!x.exact, by: x.by || '', album: 1 };
      if (typeof x.lat === 'number' && typeof x.lon === 'number') { p.glat = x.lat; p.glon = x.lon; }
      try { const tr = await fetch(sbFile(x.path + '_t.jpg')); if (!tr.ok) continue; p.thumb = await tr.blob(); } catch (e) { continue; }
      placePhoto(p); PH.mem.set(p.id, p); await pdbTx(st => st.put(p)); PH.list.push(p); PH.url[p.id] = URL.createObjectURL(p.thumb); added++;
    }
    ALB.last = Date.now();
  } catch (e) { ALB.err = /Failed to fetch|NetworkError|Load failed/i.test(String(e.message)) ? 'No connection to the album. The app tries again later.' : 'Album problem: ' + String(e.message); }
  ALB.busy = false; ALB.status = '';
  if (added || sent) { PH.list.sort((x, y) => x.t - y.t); drawPhotos(); }
  if (added || sent || manual || ALB.err) { if (S.tab === 'photos' || S.tab === 'profile') renderAll(); }
  if (added) toast(added + (added === 1 ? ' new photo' : ' new photos') + ' from the album', 4000);
}
function albumLoop() { clearInterval(ALB.timer); if (album()) ALB.timer = setInterval(() => albumSync(false), 120e3); }
function albumHtml() {
  if (!window.crypto || !crypto.subtle) return '';
  if (!SB.key) return `<div class="tonight"><b>Shared album: not on yet</b><p>The online album is in preparation. Photos that you add now stay on this phone and go to the album when it is on.</p></div>`;
  if (!S.share) return `<div class="tonight"><b>Shared album</b><p>Make a share code, or open the link from a friend. Each person with the code sees all photos and can add photos.</p><div class="btns" style="margin-top:8px"><button class="btn sea" id="albCode">Make a code</button></div></div>`;
  const nAlb = PH.list.filter(p => p.remote).length, wait = PH.list.filter(p => !p.remote && p.img).length;
  return `<div class="tonight"><b>Shared album is on · code ${prettyCode(S.share.code)}</b>
    <p class="num" id="albStatus">${esc(ALB.status || ALB.err || (nAlb + ' photos in the album.' + (wait ? ' ' + wait + ' wait for a connection.' : '') + (ALB.last ? ' Last check ' + W.fmtTime(ALB.last) + '.' : '')))}</p>
    <div class="btns" style="margin-top:8px"><button class="btn sea" id="albSend">Send the link</button><button class="btn" id="albNow">Check now</button></div></div>`;
}

// ---------- share positions with a code
// Messages go through the public relay ntfy.sh. They are encrypted on the phone with a key made from the share code.
const RELAY = 'https://ntfy.sh/', CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SH = { keys: null, lastPub: 0, lastPos: null, pending: false, status: '', seen: {}, timer: 0, armed: false };
const b64 = u8 => btoa(String.fromCharCode(...u8)), unb64 = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));
const cleanCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const prettyCode = c => cleanCode(c).replace(/(.{4})(?=.)/g, '$1-');
const ago = t => { const m = Math.round((Date.now() - t) / 60e3); return m < 1 ? 'now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.floor(m / 60) + ' h ' + W.p2(m % 60) + ' ago' : Math.round(m / 1440) + ' days ago'; };
async function shareKeys() {
  if (!S.share) return null;
  if (SH.keys && SH.keys.code === S.share.code) return SH.keys;
  const enc = new TextEncoder(), h = async t => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(t)));
  const tb = await h('qcnz-topic:' + S.share.code);
  SH.keys = { code: S.share.code, topic: 'qcnz' + [...tb.slice(0, 12)].map(x => x.toString(16).padStart(2, '0')).join(''),
    key: await crypto.subtle.importKey('raw', await h('qcnz-key:' + S.share.code), 'AES-GCM', false, ['encrypt', 'decrypt']) };
  return SH.keys;
}
async function sharePublish(force) {
  if (!S.share || !S.share.send || !me || me.src === 'manual' && !force) return;
  const now = Date.now(), moved = SH.lastPos ? G.distM(me.lat, me.lon, SH.lastPos[0], SH.lastPos[1]) : 1e9;
  if (!force && !(now - SH.lastPub > 3 * 60e3 && moved > 50) && !(now - SH.lastPub > 12 * 60e3)) return;
  if (SH.pending) return;
  SH.pending = true;
  try {
    const k = await shareKeys(), day = me.day !== null && days[me.day] ? days[me.day] : null, on = day && (me.off < 300 || me.src === 'manual');
    const o = { v: 1, id: S.devId, n: S.share.name || 'Walker', t: me.t, la: +me.lat.toFixed(5), lo: +me.lon.toFixed(5) };
    if (on) { o.dy = day.i; o.d = Math.round(me.d); o.of = Math.round(day.dist); o.to = day.to.short; }
    if (HR.bpm && now - HR.t < 60e3) o.hr = HR.bpm;
    const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k.key, new TextEncoder().encode(JSON.stringify(o))));
    const body = new Uint8Array(12 + ct.length); body.set(iv); body.set(ct, 12);
    const r = await fetch(RELAY + k.topic, { method: 'POST', body: b64(body) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    SH.lastPub = now; SH.lastPos = [me.lat, me.lon]; S.share.sent = now; SH.status = ''; save();
  } catch (e) { SH.status = 'Your position did not send. The app tries again when there is signal.'; }
  SH.pending = false; shareUi();
}
async function sharePoll() {
  if (!S.share || document.hidden) return;
  try {
    const k = await shareKeys(), since = S.share.since ? S.share.since - 1 : '12h';
    const r = await fetch(RELAY + k.topic + '/json?poll=1&since=' + since, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    let changed = false;
    for (const line of (await r.text()).split('\n')) {
      if (!line.trim()) continue;
      let m; try { m = JSON.parse(line); } catch (e) { continue; }
      if (m.event !== 'message' || SH.seen[m.id]) continue;
      SH.seen[m.id] = 1; S.share.since = Math.max(+S.share.since || 0, m.time);
      try {
        const raw = unb64(m.message), o = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, k.key, raw.slice(12))));
        if (!o || o.id === S.devId || typeof o.la !== 'number') continue;
        const p = S.peers[o.id] || (S.peers[o.id] = { trail: [] });
        if (o.t >= (p.t || 0)) Object.assign(p, { n: String(o.n || 'Walker').slice(0, 24), t: o.t, lat: o.la, lon: o.lo, day: o.dy, d: o.d, of: o.of, to: o.to, hr: o.hr });
        if (!p.trail.some(q => q[0] === o.t)) { p.trail.push([o.t, o.la, o.lo]); p.trail.sort((x, y) => x[0] - y[0]); if (p.trail.length > 300) p.trail.shift(); }
        changed = true;
      } catch (e) { /* not for this code */ }
    }
    S.share.polled = Date.now(); if (SH.status.startsWith('No connection')) SH.status = '';
    if (changed) save();
  } catch (e) { SH.status = 'No connection to the share service. This is the last position that arrived.'; }
  drawPeers(); shareUi();
}
function drawPeers() {
  scene.clearMarkers('peers');
  const lines = [];
  if (!S.share) { scene.setPeerTrails([]); return; }
  for (const id of Object.keys(S.peers)) {
    const p = S.peers[id]; if (!G.inBounds(p.lat, p.lon)) continue;
    const w = G.world(p, 1.4), el = mkEl('peer', `<button><i></i>${esc(p.n)} · ${ago(p.t)}</button>`);
    el.firstChild.addEventListener('click', () => showPeer(id));
    scene.addMarker({ el, ...w, pri: 190, group: 'peers', noOcc: true, force: true, w: 120, h: 28 });
    const tr = p.trail.filter(q => G.inBounds(q[1], q[2])).map(q => G.world({ lat: q[1], lon: q[2] }, 0.45));
    if (tr.length > 1) lines.push(tr);
  }
  scene.setPeerTrails(lines);
}
function peerLine(p) {
  let t = ago(p.t);
  if (p.day !== undefined && p.d !== undefined) t += ` · day ${p.day + 1}: ${kmTxt(p.d)} km done, ${kmTxt(Math.max(0, p.of - p.d))} km to ${p.to || 'the end'}`;
  else if (!G.inBounds(p.lat, p.lon)) t += ' · outside this map';
  else t += ' · not on the route';
  if (p.hr) t += ' · ♥ ' + p.hr;
  return t;
}
function showPeer(id) {
  const p = S.peers[id]; if (!p) return;
  const w = G.inBounds(p.lat, p.lon) ? G.world(p) : null;
  showCard({ kindHtml: 'Shared position', title: p.n, text: 'Last position: ' + W.fmtDay(p.t) + ' at ' + W.fmtTime(p.t) + ', ' + peerLine(p) + '. ' + posText(p.lat, p.lon) + '.', x: w ? w.x : undefined, z: w ? w.z : undefined });
}
function shareHtml() {
  if (!window.crypto || !crypto.subtle) return '<p class="fine">Position sharing needs the app at its web address. It cannot work in this preview.</p>';
  if (!S.share) return `<p class="fine">Make a code and send it to your partner. Each person with the code sees the others on the map. The position goes out each time the app is open and has signal.</p>
    <div class="row"><input class="txt" id="shName" maxlength="20" placeholder="Your name" value="${esc(S.shareName || '')}" aria-label="Your name"><button class="btn sea" id="shNew">Make a code</button></div>
    <div class="row"><input class="txt" id="shCode" maxlength="20" placeholder="Code from your partner" autocapitalize="characters" autocomplete="off" aria-label="Share code"><button class="btn" id="shJoin">Join</button></div>`;
  const peers = Object.keys(S.peers).sort((a, b) => S.peers[b].t - S.peers[a].t).map(id => `<li><button data-peer="${id}"><span class="nm"><b>${esc(S.peers[id].n)}</b><br><span class="fine num">${esc(peerLine(S.peers[id]))}</span></span><span class="away">Map</span></button></li>`).join('');
  return `<p class="big num" style="letter-spacing:.06em">${prettyCode(S.share.code)}</p>
    <div class="btns"><button class="btn sea" id="shSend">Send the link</button><button class="btn" id="shNow">Send my position now</button><button class="btn danger" id="shStop">${SH.armed ? 'Touch again to stop' : 'Stop sharing'}</button></div>
    <div class="row"><input class="txt" id="shName" maxlength="20" placeholder="Your name" value="${esc(S.share.name || '')}" aria-label="Your name"><label class="chk" for="shSendOn"><input type="checkbox" id="shSendOn" ${S.share.send ? 'checked' : ''}>Send mine</label></div>
    <p class="fine num" id="shStatus">${esc(SH.status || (S.share.send ? (S.share.sent ? 'Your position went out ' + ago(S.share.sent) + '.' : watchId === null ? 'Touch the target button on the map to start GPS. Then your position goes out.' : 'Waiting for the first GPS position.') : 'You only watch. Your position does not go out.'))}</p>
    ${peers ? `<ol class="list">${peers}</ol>` : '<p class="fine">No other person has sent a position with this code in the last 12 hours.</p>'}
    <p class="fine">Positions go through the public service ntfy.sh, which keeps them for 12 hours. They are encrypted with the code. Each person who has the code can see them.</p>`;
}
function shareUi() { const el = $('shareBox'); if (el && !el.contains(document.activeElement)) el.innerHTML = shareHtml(); else if ($('shStatus') && SH.status) $('shStatus').textContent = SH.status; }
function shareStart(code, name) {
  S.share = { code: cleanCode(code), name: (name || '').trim() || S.shareName || '', send: true, since: 0 };
  S.shareName = S.share.name; S.peers = {}; SH.seen = {}; SH.keys = null; SH.lastPub = 0; SH.status = ''; save();
  shareLoop(); sharePoll(); if (me && me.src !== 'manual') sharePublish(true);
  albumLoop(); albumSync(true);
}
function shareLoop() { clearInterval(SH.timer); if (S.share) SH.timer = setInterval(sharePoll, 60e3); }
async function shareLink() {
  const url = location.origin + location.pathname + (QCT ? '' : '?walk=' + WALK.id) + '#join-' + S.share.code, text = 'Our ' + WALK.name + ' map and photo album. Open this link to see where I am and to add your photos. Code: ' + prettyCode(S.share.code);
  try { if (navigator.share) { await navigator.share({ title: WALK.name + ' 3D', text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text + ' ' + url); toast('Link copied. Paste it into a message.', 4000); }
  catch (e) { showCard({ kindHtml: 'Share link', title: prettyCode(S.share.code), text: url, fly: false }); }
}
function wireShare() {
  const p = $('p-track');
  p.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id !== 'shStop') SH.armed = false;
    const name = $('shName') ? $('shName').value : '';
    if (b.id === 'shNew') { const a = crypto.getRandomValues(new Uint8Array(12)); shareStart([...a].map(x => CODE_CHARS[x % 32]).join(''), name); renderTrack(); shareLink(); }
    else if (b.id === 'shJoin') { const c = cleanCode($('shCode').value); if (c.length < 8) { toast('Write the full code first'); return; } shareStart(c, name); renderTrack(); toast('Joined. Positions show on the map when they arrive.', 4000); }
    else if (b.id === 'shSend') shareLink();
    else if (b.id === 'shNow') { if (me && me.src !== 'manual') { sharePublish(true); toast('Sending your position…'); } else { $('locBtn').click(); } sharePoll(); }
    else if (b.id === 'shStop') { if (!SH.armed) { SH.armed = true; shareUi(); } else { SH.armed = false; S.share = null; S.peers = {}; save(); shareLoop(); drawPeers(); renderTrack(); toast('Sharing is off'); } }
    else if (b.dataset.peer) showPeer(b.dataset.peer);
  });
  p.addEventListener('change', e => {
    if (e.target.id === 'shName') { S.shareName = e.target.value.trim(); if (S.share) { S.share.name = S.shareName; sharePublish(true); } save(); }
    if (e.target.id === 'shSendOn' && S.share) { S.share.send = e.target.checked; save(); if (S.share.send) sharePublish(true); shareUi(); }
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
const SHELL = ['./', 'index.html', 'app.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'heights.png', 'topofeat.json', 'topo.webp'].concat(BASE ? ['pack.json', WALK.ht || 'heights.png', 'topofeat.json', 'topo.webp'].concat(WALK.cover ? ['cover.png'] : []).map(f => BASE + f) : []);
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
    if (src === 'manual' || (s.off < 300 && !(speed > (PADDLE ? 6 : 3.3)))) { // not from a boat: near the route and at walk speed
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
  if (S.share) sharePublish(src === 'manual');
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
  const keep = {}, focusId = document.activeElement && document.activeElement.id;
  for (const id of ['shName', 'shCode']) if ($(id)) keep[id] = $(id).value;
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
    ${day.boat && isToday ? (() => { const eta = pi ? pi.eta : day.tEnd, sp = (day.boat - eta) / 60e3; return `<p class="boatline ${sp < 20 ? 'late' : ''} num">${badge('boat')}Boat leaves ${esc(day.to.short)} at ${W.fmtTime(day.boat)}. ${sp >= 0 ? 'At this speed you have ' + durTxt(sp / 60) + ' spare.' : 'At this speed you are ' + durTxt(-sp / 60) + ' late. Call the office: ' + HELP.office + '.'}</p>`; })() : ''}
    ${isToday && light !== null && light > 0 ? `<p class="fine num">Sunset is at ${W.fmtTime(sun.set)}. You have ${durTxt(light)} of daylight.</p>` : ''}
    <h3 class="t">Share my position</h3>
    <div id="shareBox" class="sharebox">${shareHtml()}</div>
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
  for (const id in keep) if ($(id)) { $(id).value = keep[id]; if (focusId === id) { $(id).focus(); try { $(id).setSelectionRange(keep[id].length, keep[id].length); } catch (e) { /* ignore */ } } }
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
  const seq = planSeq();
  seq.forEach((id, n) => {
    const d = n === 0 ? days[0] : days[n - 1], D = n === 0 ? 0 : d.off + d.dist, k = STOPS[id].kind;
    out.push({ D, ele: n === 0 ? days[0].pts[0].ele : d.pts[d.pts.length - 1].ele, name: STOPS[id].short, fac: QCT ? (n === 0 || n === seq.length - 1 ? ['boat', 'toilet'] : ['lodge']) : k === 'hut' || k === 'camp' || k === 'lodge' ? [k] : [], pri: 3, stop: id });
  });
  for (const d of days) for (const e of d.pois) {
    if (seen[e.p.id] || e.p.kind === 'boat') continue; seen[e.p.id] = 1;
    out.push({ D: d.off + e.d, ele: posOnDay(d, e.d).ele, name: e.p.short || e.p.name, fac: poiFac(e.p), pri: e.p.prof === false ? 0 : (e.p.fac || []).includes('shelter') ? 2 : 1, poi: e.p });
  }
  return out;
}
function renderProfile() {
  const { PX, L, R, TOP, PH: PHh, B } = PF, total = days.total, Wd = L + R + total / 1000 * PX, Hh = TOP + PHh + B;
  const X = D => L + D / 1000 * PX, Y = e => TOP + PHh - Math.min(e, YMAX) / YMAX * PHh;
  let g = '';
  for (const v of [0, YMAX / 4, YMAX / 2, YMAX * 3 / 4, YMAX]) g += `<line x1="${L}" x2="${Wd - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(255,255,255,${v ? 0.09 : 0.25})"/>`;
  for (let k = 0; k <= total / 1000; k += 5) g += `<text x="${X(k * 1000)}" y="${Hh - 5}" text-anchor="middle">${k} km</text><line x1="${X(k * 1000)}" x2="${X(k * 1000)}" y1="${TOP + PHh}" y2="${TOP + PHh + 4}" stroke="rgba(255,255,255,.4)"/>`;
  let areas = '';
  for (const d of days) {
    const step = Math.max(1, Math.floor(d.pts.length / 200)); let line = '';
    for (let i = 0; i < d.pts.length; i += step) line += (i ? 'L' : 'M') + X(d.off + d.pts[i].d).toFixed(1) + ' ' + Y(d.pts[i].ele).toFixed(1);
    const last = d.pts[d.pts.length - 1]; line += 'L' + X(d.off + last.d).toFixed(1) + ' ' + Y(last.ele).toFixed(1);
    const s = W.summarize(d.tStart, d.tEnd, d.zone);
    areas += `<path d="${line}L${X(d.off + d.dist).toFixed(1)} ${Y(0)}L${X(d.off).toFixed(1)} ${Y(0)}Z" fill="${d.color}" fill-opacity="${d.i === sel ? 0.5 : 0.28}"/><path d="${line}" fill="none" stroke="${d.color}" stroke-width="1.8" stroke-linejoin="round"/>
      <line x1="${X(d.off)}" x2="${X(d.off)}" y1="16" y2="${TOP + PHh}" stroke="rgba(255,255,255,.3)" stroke-dasharray="3 3"/>
      <rect x="${X(d.off) + 1}" y="0" width="${d.dist / 1000 * PX - 2}" height="15" rx="4" fill="${d.color}" fill-opacity="${d.i === sel ? 0.95 : 0.6}"/>
      <text x="${X(d.off) + 6}" y="11" style="fill:#1b1206;font-weight:700">Day ${d.i + 1} · ${W.fmtWd(d.date)} · ${kmTxt(d.dist)} km${d.guide ? ' · ' + d.guide.h[1] + ' h' : ''}${s.rain >= 1 ? ' · rain' : ''}${s.gust >= 70 ? ' · wind' : ''}</text>`;
    for (const v of [YMAX / 2, YMAX]) areas += `<text x="${X(d.off) + 3}" y="${Y(v) - 2}" style="fill:rgba(236,244,240,.55)">${v} m</text>`;
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
  for (const ph of PH.list) if (ph.day !== undefined && ph.d !== undefined && days[ph.day]) marks += `<rect x="${(X(days[ph.day].off + ph.d) - 2.5).toFixed(1)}" y="${TOP + PHh - 7}" width="5" height="5" rx="1" fill="#fff" stroke="#06181c" stroke-width=".6"/>`;
  const meD = me && me.day !== null && days[me.day] ? days[me.day].off + me.d : null;
  const meX = meD !== null ? `<line x1="${X(meD)}" x2="${X(meD)}" y1="${TOP - 6}" y2="${TOP + PHh}" stroke="#fff" stroke-width="1.5"/><circle cx="${X(meD)}" cy="${Y(posOnDay(days[me.day], me.d).ele)}" r="4.5" fill="#fff" stroke="#06181c"/><text x="${X(meD) + 5}" y="${TOP + PHh - 4}" style="fill:#fff;font-weight:700">You</text>` : '';
  const hi = Math.max(...days.flatMap(d => d.pts.map(p => p.ele)));
  $('p-profile').innerHTML = `
    <p class="fine num" id="pfRead">${esc(days[0].from.short)} to ${esc(days[days.length - 1].to.short)}. Slide the profile sideways. Touch it to see that point on the map.</p>
    <div class="hscroll" id="pfScroll"><svg class="profile wide" id="pfSvg" style="width:${Math.round(Wd)}px;height:${Hh}px" width="${Math.round(Wd)}" height="${Hh}" viewBox="0 0 ${Wd.toFixed(0)} ${Hh}" role="img" aria-label="Height profile of the whole track. Highest point ${Math.round(hi)} metres.">
      ${g}${areas}${marks}${meX}<line id="pfCur" x1="0" x2="0" y1="${TOP - 6}" y2="${TOP + PHh}" stroke="#9ff3e6" stroke-width="1.5" visibility="hidden"/></svg></div>
    <div class="legend">${Object.keys(FAC).filter(f => QCT ? f !== 'hut' : f !== 'lodge' && f !== 'boat').map(f => `<span>${badge(f)}${FAC[f].label}</span>`).join('')}</div>
    <p class="fine num">${kmTxt(total)} km on this map${QCT ? ', with the side tracks to your lodges' : ''}. ${WALK.km ? 'The official length is ' + WALK.km + ' km. ' : ''}Heights are in metres above sea level.${QCT ? ' The printed route guide shows Anakiwa on the left. Here the profile runs in your walk direction.' : ''}</p>`;
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
    $('pfRead').textContent = `Day ${day.i + 1} · ${kmTxt(D)} km from ${days[0].from.short} · ${Math.round(q.ele)} m above sea level`;
    if (day.i !== sel) { sel = day.i; drawRoutes(); updateHud(); }
    scene.setGhost(q); scene.flyTo({ x: q.x, z: q.z, y: q.y, dist: 52, polar: 1.0, az: Math.atan2(-q.hx, -q.hz), dur: 1200 });
  });
}
// ---------- the list of walks
function showWalks() {
  if (+$('sheet').dataset.open === 1) setSheet(0, true); // room for the list
  const rows = PACK.walks.map(w => `<button class="walkrow ${w.id === WALK.id ? 'cur' : ''}" data-walk="${w.id}"><b>${esc(w.name)}</b><small class="num">${esc(w.region)} · ${w.km} km · ${esc(w.days)} days${w.mode === 'paddle' ? ' · by canoe' : ''}${w.id === WALK.id ? ' · open now' : ''}</small></button>`).join('');
  showCard({ kindHtml: 'Walks', title: 'Select a walk', fly: false,
    html: `<span class="walks">${rows}</span><span class="fine">Each walk has its own map pack of about 5 MB. The app downloads a pack the first time that you open the walk. After that, the walk works with no signal. Your plan, track and photos are kept for each walk.</span>` });
}
function openWalk(id) {
  if (id === WALK.id) { hideCard(); return; }
  saveNow(); try { localStorage.setItem('gw-walk', id); } catch (e) { /* ignore */ }
  toast('Opening the walk…', 8000); location.href = location.pathname;
}
function showHelp() {
  showCard({ kindHtml: badge('boat') + 'Help', title: 'If something goes wrong', fly: false,
    html: `<ul class="notes">${HELP.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
      <span class="facrow posrow"><b>Your position</b><span class="num" id="helpPos">${me && me.src !== 'manual' ? esc(posText(me.lat, me.lon)) + ' · GPS ' + ago(me.t) : 'Touch the target button on the map to start GPS. Your grid reference then shows here.'}</span>${me && me.src !== 'manual' ? '<button class="btn" id="posCopy">Copy position</button>' : ''}</span>
      <span class="facrow"><a class="btn pri" href="tel:111">Call 111</a> ${HELP.office ? `<a class="btn" href="tel:${HELP.office.replace(/ /g, '')}">${esc(HELP.officeName || 'Office')} ${HELP.office}</a>` : ''}</span>
      <span class="facrow"><button class="btn" id="updBtn2">Update app</button> App version: ${BUILD}</span>
      <span class="facrow">${esc(HELP.foot || '')}</span>` });
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
    for (const ph of PH.list) if (ph.day === f.seg.day.i && ph.d !== undefined && ph.d > R.lastD && ph.d <= f.d) { photoFlash(ph); break; }
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
  if (S.tab === 'days') renderDays(); else if (S.tab === 'photos') renderPhotos(); else if (S.tab === 'profile') renderProfile(); else if (S.tab === 'sky') renderSky(); else if (S.tab === 'track') renderTrack(); else if (S.tab === 'spot') renderSpot(); else renderReplay();
}
function setSheet(v, anim) { // v: 1 open, 0 bar, -1 hidden (full-screen map)
  const sheet = $('sheet'), h0 = sheet.offsetHeight, cur = +sheet.dataset.open;
  if (v === cur) { if (anim) settle(sheet, 0); return; }
  sheet.dataset.open = String(v); S.sheet = v; save();
  $('grab').setAttribute('aria-expanded', v >= 0);
  const h1 = sheet.offsetHeight; layout();
  if (anim) settle(sheet, h1 - h0);
}
function settle(sheet, dh) { // continue from the finger position, then slide to the new position
  const m = /translateY\(([-\d.]+)px\)/.exec(sheet.style.transform), from = (m ? +m[1] : 0) + dh;
  sheet.classList.remove('drag', 'settle'); sheet.style.transform = `translateY(${from}px)`;
  void sheet.offsetHeight; sheet.classList.add('settle'); sheet.style.transform = '';
  setTimeout(() => sheet.classList.remove('settle'), 300);
}
function wireSheet() {
  const sheet = $('sheet'), panels = $('panels');
  let g = null;
  const start = (x, y, target) => {
    if (target.closest('#scrub')) return;
    const inPanel = !!target.closest('#panels');
    if (inPanel && panels.scrollTop > 0) return;
    g = { x, y, dy: 0, on: false, inPanel, t: performance.now(), h: sheet.offsetHeight, grab: !!target.closest('#grab') };
  };
  const move = (x, y, ev) => {
    if (!g) return;
    const dx = x - g.x, dy = y - g.y;
    if (g.inPanel && dy > 0 && ev && ev.cancelable) ev.preventDefault(); // the panel is at its top: the pull moves the sheet
    if (!g.on) {
      if (Math.abs(dy) < 9 || Math.abs(dy) < Math.abs(dx) * 1.3) { if (Math.abs(dx) > 14) g = null; return; }
      if (g.inPanel && dy < 0) { g = null; return; } // the panel scrolls up as usual
      g.on = true; sheet.classList.add('drag');
    }
    g.dy = dy;
    if (ev && ev.cancelable) ev.preventDefault();
    sheet.style.transform = `translateY(${dy > 0 ? Math.min(dy, g.h - 20) : Math.max(dy, -24) * 0.4}px)`;
  };
  const end = () => {
    if (!g) return;
    const { dy, on, h, grab } = g, v = +sheet.dataset.open, fast = performance.now() - g.t < 260; g = null;
    if (!on) { if (grab) setSheet(v === -1 ? 1 : v === 1 ? 0 : -1, true); return; }
    const lim = fast ? 24 : 56;
    let nv = v;
    if (dy > lim) nv = dy > h * 0.62 || v === 0 ? -1 : v === 1 ? 0 : -1;
    else if (dy < -lim) nv = v === -1 ? (fast ? 1 : 0) : 1;
    if (nv === v) settle(sheet, 0); else setSheet(nv, true);
    sheet.dataset.noclick = String(performance.now());
  };
  sheet.addEventListener('touchstart', e => { if (e.touches.length === 1) start(e.touches[0].clientX, e.touches[0].clientY, e.target); else g = null; }, { passive: true });
  sheet.addEventListener('touchmove', e => move(e.touches[0].clientX, e.touches[0].clientY, e), { passive: false });
  sheet.addEventListener('touchend', end); sheet.addEventListener('touchcancel', end);
  let mouse = false; // a mouse on a desktop computer
  sheet.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button === 0) { mouse = true; start(e.clientX, e.clientY, e.target); } });
  window.addEventListener('pointermove', e => { if (mouse && e.pointerType === 'mouse') move(e.clientX, e.clientY); });
  window.addEventListener('pointerup', e => { if (mouse && e.pointerType === 'mouse') { mouse = false; end(); } });
  // a drag must not also count as a touch on a tab or a button
  sheet.addEventListener('click', e => { if (performance.now() - (+sheet.dataset.noclick || 0) < 350) { e.stopPropagation(); e.preventDefault(); } }, true);
  $('grab').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const v = +sheet.dataset.open; setSheet(v === -1 ? 1 : v === 1 ? 0 : -1, true); } });
}
function setTab(tab, toggle) {
  const sheet = $('sheet'), was = +sheet.dataset.open;
  const v = toggle && S.tab === tab && was === 1 ? 0 : 1;
  S.tab = tab; save();
  for (const b of $('tabs').children) b.setAttribute('aria-selected', b.dataset.tab === tab);
  for (const p of $('panels').children) p.hidden = p.id !== 'p-' + tab;
  if (tab !== 'track' && tab !== 'days' && tab !== 'profile') scene.setGhost(null);
  renderAll(); $('panels').scrollTop = 0;
  if (v !== was) setSheet(v, toggle); else layout();
}
function layout() {
  const sh = $('sheet').offsetHeight, top = document.querySelector('.hud').offsetHeight - 26;
  document.documentElement.style.setProperty('--sheet-h', sh + 'px');
  scene.setSize(window.innerWidth, window.innerHeight, sh, top);
}

function init() {
  if (!['days', 'profile', 'sky', 'track', 'photos', 'spot', 'replay'].includes(S.tab)) S.tab = 'days';
  if (S.plan.redo) { delete S.plan.redo; for (const c of S.checkins) if (days[c.day]) c.d = nearestOnDay(days[c.day], c.lat, c.lon).d; save(); }
  sel = Math.min(sel, days.length - 1);
  buildStaticMarkers(); buildStopMarkers(); buildMomentMarkers(); drawRoutes(); updateHud(); buildTimebar();
  wireDays(); wireSky(); wireTrack(); wireSpot(); wireReplay(); wireProfile(); wireShare(); wirePhotos(); loadPhotos();
  if (!S.layers || typeof S.layers !== 'object') S.layers = { topo: false, contours: true, feat: true };
  scene.loadHeights(); applyLayers(true); loadFeatures();
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
  const jm = /^#join-([A-Za-z0-9-]{8,24})$/.exec(location.hash);
  if (jm && window.crypto && crypto.subtle) {
    const c = cleanCode(jm[1]);
    if (!S.share || S.share.code !== c) { S.share = { code: c, name: S.shareName || '', send: false, since: 0 }; S.peers = {}; S.tab = 'track'; save(); setTimeout(() => toast('You joined the share code. Write your name in the Track tab.', 6000), 1500); }
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
  }
  if (location.search) { try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* ignore */ } }
  $('walkBtn').addEventListener('click', showWalks);
  if (PACK.failed) setTimeout(() => toast('The map pack for that walk did not load. There is no connection, or it is not on this phone yet.', 7000), 1200);
  if (!W.WX.fetched && navigator.onLine !== false) refreshWx(true);
  wireSheet(); setTab(S.tab);
  if (S.sheet === 0 || S.sheet === -1) setSheet(S.sheet);
  applyEnv(); updateTimeUI(true); drawMe();
  if (S.share && window.crypto && crypto.subtle) { drawPeers(); shareLoop(); sharePoll(); } else if (S.share) S.share = null;
  window.addEventListener('online', () => { if (S.share) { sharePoll(); sharePublish(true); } albumSync(false); });

  $('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setTab(b.dataset.tab, true); });
  $('scrub').addEventListener('input', e => { R.playing = false; setTime(W.T0 + +e.target.value * 600e3, 'scrub'); if (S.tab === 'replay') renderReplay(); });
  $('liveBtn').addEventListener('click', () => { R.playing = false; setTime(Date.now(), 'live'); renderAll(); });
  $('wxChip').addEventListener('click', () => setTab('sky'));
  $('compass').addEventListener('click', () => scene.resetNorth());
  $('cardClose').addEventListener('click', hideCard);
  $('card').addEventListener('click', async e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.id === 'updBtn2') updateApp();
    else if (t.id === 'posCopy' && me) { try { await navigator.clipboard.writeText('My position: ' + posText(me.lat, me.lon) + ' (' + W.fmtDay(me.t) + ' ' + W.fmtTime(me.t) + ')'); toast('Position copied'); } catch (er) { toast('Copy did not work. Read the numbers from the card.'); } }
    else if (t.dataset.walk) openWalk(t.dataset.walk);
    else if (t.dataset.lay) { const [k, v] = t.dataset.lay.split(':'); S.layers[k] = v === '1'; save(); applyLayers(); showLayers(); }
  });
  $('layBtn').addEventListener('click', showLayers);
  window.addEventListener('resize', layout);
  if (window.ResizeObserver) new ResizeObserver(layout).observe($('sheet'));
  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden && wake === null && $('wake') && $('wake').checked) { try { wake = await navigator.wakeLock.request('screen'); } catch (e) { /* ignore */ } }
    if (!document.hidden && navigator.onLine !== false && !(Date.now() - Date.parse(W.WX.fetched) < 3 * W.HOUR)) refreshWx(true);
    if (!document.hidden) albumSync(false);
    if (!document.hidden && S.share) { sharePoll(); SH.lastPub = Math.min(SH.lastPub, Date.now() - 11 * 60e3); } // send again soon after the app comes back
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
  window.__qct = { scene, get days() { return days; }, setTime, selectDay, setTab, startReplay, S, nztm, applyLayers };
}
init();
