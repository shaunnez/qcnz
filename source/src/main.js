// Start: find the walk to open, load its data pack, then start the app.
import QGEO from './geo.json';
import QWX from './wx.json';
import * as Q from './content_qct.js';
import { WALKS, wildlifeFor, GENERIC_HELP } from './walks.js';

const $ = id => document.getElementById(id);
const stateKey = id => id === 'qct' ? 'qct-2026-v3' : 'gw-' + id + '-v1';
function readPlan(id) { try { return (JSON.parse(localStorage.getItem(stateKey(id)) || '{}').plan) || {}; } catch (e) { return {}; } }

function qctPack() {
  return {
    meta: WALKS.find(w => w.id === 'qct'), geo: QGEO, wx: QWX, base: '',
    stops: Q.STOPS, start: 'shipcove', end: 'anakiwa', nightOptions: Q.NIGHT_OPTIONS, defaultNights: Q.DEFAULT_NIGHTS,
    guide: Q.GUIDE, help: Q.HELP, pois: Q.POIS, labels: Q.LABELS, wildlife: Q.WILDLIFE,
    zones: [{ lat: -41.10, lon: 174.20, ele: 60, name: 'outer sound', short: 'Outer sound' }, { lat: -41.19, lon: 174.07, ele: 330, name: 'ridge, 330 m', short: 'Ridge' }, { lat: -41.24, lon: 173.95, ele: 180, name: 'inner sound', short: 'Inner sound' }],
    zoneKm: [30, 52], extraSides: ['eatwell', 'onahau']
  };
}
async function loadPack(id) {
  if (id === 'qct') return qctPack();
  const meta = WALKS.find(w => w.id === id);
  if (!meta) throw new Error('Unknown walk');
  const r = await fetch('walks/' + id + '/pack.json');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const p = await r.json();
  p.meta = Object.assign({}, p.meta, meta); p.base = 'walks/' + id + '/';
  p.help = p.help || GENERIC_HELP; p.wildlife = wildlifeFor(p.meta);
  return p;
}
(async () => {
  let id = 'qct';
  try { const q = new URLSearchParams(location.search).get('walk'); id = q || localStorage.getItem('gw-walk') || 'qct'; } catch (e) { /* storage is not available */ }
  let pack, failed = '';
  try { pack = await loadPack(id); }
  catch (e) { failed = id; id = 'qct'; pack = qctPack(); }
  try { localStorage.setItem('gw-walk', id); } catch (e) { /* ignore */ }
  pack.plan = readPlan(id); pack.key = stateKey(id); pack.walks = WALKS; pack.failed = failed;
  globalThis.__PACK__ = pack;
  document.title = pack.meta.name + ' 3D';
  const eb = $('walkBtn'); if (eb) eb.firstChild.textContent = pack.meta.name;
  await import('./app.js');
})();
