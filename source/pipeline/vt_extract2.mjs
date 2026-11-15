// Read LINZ vector tiles (z12 and z14) and write the features that the map pack uses, one JSON for each line.
import fs from 'fs'; import zlib from 'zlib';
import { VectorTile } from '/home/claude/qct/node_modules/@mapbox/vector-tile/index.js';
import { createRequire } from 'module'; const require = createRequire('/home/claude/qct/'); const Pbf = require('pbf');
const [dir, outFile] = process.argv.slice(2);
const out = fs.createWriteStream(outFile);
const COVER = ['wood', 'grass', 'ice', 'snow', 'scree', 'moraine', 'rock', 'shingle', 'boulders', 'sand'];
let n = 0;
for (const f of fs.readdirSync(dir)) {
  const m = /^(\d+)_(\d+)_(\d+)\.pbf$/.exec(f); if (!m) continue;
  const z = +m[1]; let buf = fs.readFileSync(dir + '/' + f); if (buf.length < 20) continue;
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  let vt; try { vt = new VectorTile(new Pbf(buf)); } catch (e) { continue; }
  for (const ln in vt.layers) {
    const L = vt.layers[ln];
    for (let i = 0; i < L.length; i++) {
      const ft = L.feature(i), p = ft.properties, c = p.class;
      let keep = false;
      if (z === 12) keep = ln === 'coastline' || (ln === 'landcover' && ft.type === 3 && COVER.includes(c)) || (ln === 'water' && ft.type === 3) || ln === 'place' || (ln === 'poi' && ['hut', 'shelter'].includes(c)) || (ln === 'water' && c === 'spring');
      else keep = ln === 'transportation' || ln === 'waterway' || ln === 'poi' || (ln === 'contours' && c === 'peak') || ln === 'place';
      if (!keep) continue;
      const g = ft.toGeoJSON(+m[2], +m[3], z).geometry;
      const r = c2 => typeof c2[0] === 'number' ? [+c2[0].toFixed(6), +c2[1].toFixed(6)] : c2.map(r);
      out.write(JSON.stringify({ z, l: ln, p, t: g.type, c: r(g.coordinates) }) + '\n'); n++;
    }
  }
}
out.end(() => console.log('features', n));
