import GEO from './geo.json';

export const B = GEO.bounds, GW = GEO.gw, GH = GEO.gh;
const LAT0 = (B.n + B.s) / 2, LON0 = (B.w + B.e) / 2;
// World units: 1 unit = 100 m. North is -z, east is +x.
const KX = 111.32 * Math.cos(LAT0 * Math.PI / 180) * 10, KZ = 111.05 * 10;
export const VEX = 1.6;
export const toX = lon => (lon - LON0) * KX, toZ = lat => (LAT0 - lat) * KZ;
export const toLon = x => x / KX + LON0, toLat = z => LAT0 - z / KZ;
export const WORLD_W = (B.e - B.w) * KX, WORLD_D = (B.n - B.s) * KZ;
export const yOf = m => m / 100 * VEX;

const raw = Uint8Array.from(atob(GEO.terrain), c => c.charCodeAt(0));
// Height in metres. Negative values are water depth.
export const H = new Float32Array(GW * GH);
for (let i = 0; i < raw.length; i++) {
  const v = raw[i];
  H[i] = v < 40 ? -Math.min((40 - v) * 6, 80) : Math.pow((v - 40) / 215, 2) * GEO.hmax;
}
const dLon = (B.e - B.w) / GW, dLat = (B.n - B.s) / GH;
export const cellX = i => toX(B.w + (i + 0.5) * dLon), cellZ = j => toZ(B.n - (j + 0.5) * dLat);

export function heightM(x, z) {
  const fi = (toLon(x) - B.w) / dLon - 0.5, fj = (B.n - toLat(z)) / dLat - 0.5;
  const i = Math.max(0, Math.min(GW - 2, Math.floor(fi))), j = Math.max(0, Math.min(GH - 2, Math.floor(fj)));
  const u = Math.max(0, Math.min(1, fi - i)), v = Math.max(0, Math.min(1, fj - j));
  const a = H[j * GW + i], b = H[j * GW + i + 1], c = H[(j + 1) * GW + i], d = H[(j + 1) * GW + i + 1];
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
export const groundY = (x, z) => yOf(Math.max(heightM(x, z), 0));
export const inBounds = (lat, lon) => lat < B.n && lat > B.s && lon > B.w && lon < B.e;

export function distM(lat1, lon1, lat2, lon2) {
  const dx = (lon2 - lon1) * KX * 100, dz = (lat2 - lat1) * KZ * 100;
  return Math.hypot(dx, dz);
}

// Main track, one point each 30 m from Ship Cove to Anakiwa.
const T = GEO.track;
export const TN = T.length / 3, STEP_KM = GEO.step / 1000;
export const TRACK = [];
for (let i = 0; i < TN; i++) TRACK.push({ lon: T[i * 3], lat: T[i * 3 + 1], ele: T[i * 3 + 2], km: i * STEP_KM });
export const TOTAL_KM = (TN - 1) * STEP_KM;
export const kmIndex = km => Math.max(0, Math.min(TN - 1, Math.round(km / STEP_KM)));

// Side trails. Each line goes from the track junction to the place.
export const SIDES = {};
for (const k in GEO.sides) {
  const s = GEO.sides[k];
  SIDES[k] = { km: s.km, len: s.len, pts: s.line.map((p, i) => ({ lon: p[0], lat: p[1], ele: s.ele[i] })) };
}

export function world(p, lift = 0) {
  const x = toX(p.lon), z = toZ(p.lat);
  return { x, y: groundY(x, z) + lift, z };
}

export function nearestOnTrack(lat, lon) {
  let best = 1e12, bi = 0;
  for (let i = 0; i < TN; i++) {
    const d = distM(lat, lon, TRACK[i].lat, TRACK[i].lon);
    if (d < best) { best = d; bi = i; }
  }
  return { km: bi * STEP_KM, off: best };
}
