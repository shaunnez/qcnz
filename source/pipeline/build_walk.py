"""Build the map pack of one walk: python3 build_walk.py <id> [stage ...]
Stages: route dem tiles vt rasters topo feat pack. No stage = all, with files kept between runs."""
import sys, os, json, math, subprocess, glob, base64, re, collections
import numpy as np, pyproj
from concurrent.futures import ThreadPoolExecutor
from scipy import ndimage
from scipy.spatial import cKDTree
from PIL import Image, ImageDraw
import gwlib
from walks_cfg import CFG
Image.MAX_IMAGE_PIXELS = None
ID = sys.argv[1]; C = CFG[ID]; STAGES = sys.argv[2:]
D = f'data/{ID}/'; OUT = f'out/{ID}/'; os.makedirs(D, exist_ok=True); os.makedirs(OUT, exist_ok=True)
KEY = os.environ.get('LINZ_KEY', '')
S3 = 'https://nz-elevation.s3.ap-southeast-2.amazonaws.com/'
TR = pyproj.Transformer.from_crs(4326, 2193, always_xy=True)
def want(s): return not STAGES or s in STAGES
def log(*a): print(f'[{ID}]', *a, flush=True)

# ---------------------------------------------------------------- route
def comp_of(adj, a):
    seen = {a}; st = [a]
    while st:
        u = st.pop()
        for v in adj[u]:
            if v not in seen: seen.add(v); st.append(v)
    return seen
def build_route():
    line = []
    for leg in C['legs']:
        nodes, adj, ways = gwlib.load_graph([f'data/{f}' for f in leg['files']])
        big = max((comp_of(adj, i) for i in [gwlib.nearest(nodes, list(adj), leg['via'][0])[0]]), key=len)
        ids = list(big)
        via = list(leg['via'])
        if leg.get('start2'):  # a loop that is open at the start: take the end that is nearer to the first hut along the track
            a = gwlib.nearest(nodes, ids, via[0])[0]; b = gwlib.nearest(nodes, ids, leg['start2'])[0]; h = gwlib.nearest(nodes, ids, via[1])[0]
            if gwlib.dijkstra(adj, b, h)[1] < gwlib.dijkstra(adj, a, h)[1]: via[0], via[-1] = leg['start2'], leg['via'][0]
            else: via[-1] = leg['start2']
        snap = [gwlib.nearest(nodes, ids, p) for p in via]
        for (a, da), (b, db) in zip(snap, snap[1:]):
            path, d = gwlib.dijkstra(adj, a, b)
            if path is None: raise SystemExit(f'no path between {nodes[a]} and {nodes[b]}')
            seg = [nodes[i] for i in path]
            line += seg if not line else seg[1:]
        log('leg', leg['files'], 'snap m', [int(d) for _, d in snap])
    # one point each STEP metres
    cum = [0.0]
    for a, b in zip(line, line[1:]): cum.append(cum[-1] + gwlib.hav(a, b))
    total = cum[-1]; step = C.get('step', 30)
    n = int(total // step) + 1; out = []; j = 0
    for i in range(n):
        d = i * step
        while j < len(cum) - 2 and cum[j + 1] < d: j += 1
        u = (d - cum[j]) / max(cum[j + 1] - cum[j], 1e-9)
        out.append((line[j][0] + (line[j + 1][0] - line[j][0]) * u, line[j][1] + (line[j + 1][1] - line[j][1]) * u))
    log('route km', round(total / 1000, 2), 'points', len(out))
    return out, step
def build_sides(track):
    """Side tracks to huts that are away from the main track: {key: {km, len, line}} from the junction to the place."""
    sides = {}
    tree_pts = track
    for key, sd in (C.get('sides') or {}).items():
        nodes, adj, ways = gwlib.load_graph([f'data/{f}' for f in sd['files']])
        # only paths
        keep = set()
        for wid, ids, tags in ways:
            if tags.get('highway') in ('path', 'footway', 'track', 'steps'): keep.update(ids)
        ids = [i for i in adj if i in keep]
        a = gwlib.nearest(nodes, ids, sd['at'])[0]
        # the node of the same graph that is nearest to the main track
        best = None
        comp = comp_of(adj, a)
        lat0 = track[0][0]; kx = 111320 * math.cos(math.radians(lat0)); ky = 111050
        tt = cKDTree(np.array([(p[1] * kx, p[0] * ky) for p in track]))
        cand = [i for i in comp if i in keep]
        dd, ii = tt.query(np.array([(nodes[i][1] * kx, nodes[i][0] * ky) for i in cand]))
        near = [c for c, d in zip(cand, dd) if d < 25]
        bestp = None
        for b in near:
            p, d = gwlib.dijkstra(adj, b, a)
            if p and (bestp is None or d < bestp[1]): bestp = (p, d, b)
        if not bestp: raise SystemExit('no side path for ' + key)
        line = [nodes[i] for i in bestp[0]]
        j = int(tt.query((line[0][1] * kx, line[0][0] * ky))[1])
        sides[key] = dict(idx=j, len=round(bestp[1]), line=line)
        log('side', key, 'len m', round(bestp[1]), 'junction index', j)
    return sides

# ---------------------------------------------------------------- bounds and scale
def make_bounds(track, extra=()):
    lats = [p[0] for p in track] + [p[0] for p in extra]; lons = [p[1] for p in track] + [p[1] for p in extra]
    lat0 = (min(lats) + max(lats)) / 2; kx = 111320 * math.cos(math.radians(lat0)); ky = 111050
    ex = (max(lons) - min(lons)) * kx; ey = (max(lats) - min(lats)) * ky
    m = max(3500, C.get('margin', 0.2) * max(ex, ey))
    W_, H_ = ex + 2 * m, ey + 2 * m
    if W_ < 0.62 * H_: W_ = 0.62 * H_
    if H_ < 0.56 * W_: H_ = 0.56 * W_
    cx = (min(lons) + max(lons)) / 2; cy = lat0
    b = dict(w=round(cx - W_ / 2 / kx, 5), e=round(cx + W_ / 2 / kx, 5), n=round(cy + H_ / 2 / ky, 5), s=round(cy - H_ / 2 / ky, 5))
    unit = round(max(W_, H_) / 410, 1)
    gw = int(round(W_ / (0.93 * unit))); gh = int(round(H_ / (0.93 * unit)))
    return b, unit, gw, gh, W_, H_

# ---------------------------------------------------------------- heights
ROWS = [a + c for a, cs in (('A', 'STUVWXYZ'), ('B', 'ABCDEFGHJKLMNPQRSTUVWXYZ'), ('C', 'ABCDEFGHJK')) for c in cs]
def sheet(E, N): return ROWS[int((6234000 - N) // 36000)] + '%02d' % (28 + int((E - 1660000) // 24000))
def build_dem(b):
    import rasterio
    from rasterio.windows import from_bounds
    from rasterio.enums import Resampling
    xs, ys = TR.transform([b['w'], b['e'], b['w'], b['e']], [b['n'], b['n'], b['s'], b['s']])
    E0 = math.floor((min(xs) - 300) / 16) * 16; E1 = math.ceil((max(xs) + 300) / 16) * 16
    N0 = math.floor((min(ys) - 300) / 16) * 16; N1 = math.ceil((max(ys) + 300) / 16) * 16
    RES = 8 if (E1 - E0) * (N1 - N0) < 2.3e9 else 16
    Wd = (E1 - E0) // RES; Hh = (N1 - N0) // RES
    have = {k.split('/')[-1][:-5] for k, _ in json.load(open('/home/claude/qct/data/dem_index.json'))['c8']}
    sheets = sorted({sheet(E, N) for E in list(range(E0, E1, 8000)) + [E1 - 1] for N in list(range(N0 + 1, N1, 8000)) + [N1 - 1]} & have)
    os.makedirs('data/c8', exist_ok=True)
    def get(s):
        f = f'data/c8/{s}.tiff'
        if not os.path.exists(f) or os.path.getsize(f) < 1000:
            subprocess.run(['curl', '-s', '-m', '600', '--retry', '3', '-o', f, S3 + f'new-zealand/new-zealand-contour/dem_8m/2193/{s}.tiff'], check=True)
        return f
    with ThreadPoolExecutor(4) as ex: files = list(ex.map(get, sheets))
    dem = np.full((Hh, Wd), np.nan, np.float32)
    for f in files:
        with rasterio.open(f) as ds:
            bb = ds.bounds
            l, r, bt, tp = max(bb.left, E0), min(bb.right, E1), max(bb.bottom, N0), min(bb.top, N1)
            if l >= r or bt >= tp: continue
            c0 = int((l - E0) // RES); c1 = int(-(-(r - E0) // RES)); r0 = int((N1 - tp) // RES); r1 = int(-(-(N1 - bt) // RES))
            win = from_bounds(E0 + c0 * RES, N1 - r1 * RES, E0 + c1 * RES, N1 - r0 * RES, ds.transform)
            a = ds.read(1, window=win, out_shape=(r1 - r0, c1 - c0), resampling=Resampling.average, boundless=True, fill_value=np.nan, masked=True)
            a = a.astype(np.float32).filled(np.nan)
            if ds.nodata is not None: a[a == ds.nodata] = np.nan
            a[a < -100] = np.nan
            m = ~np.isnan(a); dem[r0:r1, c0:c1][m] = a[m]
    log('dem', dem.shape, 'res', RES, 'sheets', sheets, 'valid %', round(float((~np.isnan(dem)).mean() * 100), 1), 'max', float(np.nanmax(dem)))
    np.save(D + 'dem.npy', dem); json.dump(dict(E0=E0, N1=N1, RES=RES), open(D + 'dem.json', 'w'))

# ---------------------------------------------------------------- tiles
def tile_xy(lat, lon, z):
    n = 2 ** z; return (lon + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
def tile_lat(y, z): return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / 2 ** z))))
def fetch(jobs):
    def one(j):
        url, f = j
        if os.path.exists(f) and os.path.getsize(f) > 0: return 0
        for k in range(4):
            r = subprocess.run(['curl', '-s', '-m', '60', '-o', f, '-w', '%{http_code}', url], capture_output=True, text=True)
            if r.stdout.strip() == '200' and os.path.getsize(f) > 0: return 1
            if r.stdout.strip() in ('204', '404'): open(f + '.none', 'w').close(); os.path.exists(f) and os.remove(f); return 0
        raise SystemExit('download failed ' + url.split('?')[0])
    jobs = [j for j in jobs if not os.path.exists(j[1] + '.none')]
    with ThreadPoolExecutor(10) as ex: n = sum(ex.map(one, jobs))
    return n
def build_tiles(b, track):
    # topo raster
    zr = 14
    while zr > 11 and (tile_xy(b['n'], b['e'], zr)[0] - tile_xy(b['n'], b['w'], zr)[0]) > 30: zr -= 1
    x0, y0 = map(int, tile_xy(b['n'], b['w'], zr)); x1, y1 = map(int, tile_xy(b['s'], b['e'], zr))
    os.makedirs(D + 'topo', exist_ok=True); os.makedirs(D + 'vt', exist_ok=True)
    jobs = [(f'https://basemaps.linz.govt.nz/v1/tiles/topo-raster/WebMercatorQuad/{zr}/{x}/{y}.webp?api={KEY}', f'{D}topo/{zr}_{x}_{y}.webp') for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]
    log('raster z', zr, 'tiles', len(jobs), 'new', fetch(jobs))
    # vector: z12 for the full map, z14 near the track
    X0, Y0 = map(int, tile_xy(b['n'], b['w'], 12)); X1, Y1 = map(int, tile_xy(b['s'], b['e'], 12))
    jobs = [(f'https://basemaps.linz.govt.nz/v1/tiles/topographic/WebMercatorQuad/12/{x}/{y}.pbf?api={KEY}', f'{D}vt/12_{x}_{y}.pbf') for x in range(X0, X1 + 1) for y in range(Y0, Y1 + 1)]
    near = set()
    for la, lo in track[::8]:
        for dla in (-0.022, 0, 0.022):
            for dlo in (-0.03, 0, 0.03):
                x, y = tile_xy(la + dla, lo + dlo, 14); near.add((int(x), int(y)))
    jobs += [(f'https://basemaps.linz.govt.nz/v1/tiles/topographic/WebMercatorQuad/14/{x}/{y}.pbf?api={KEY}', f'{D}vt/14_{x}_{y}.pbf') for x, y in sorted(near)]
    log('vector tiles', len(jobs), 'new', fetch(jobs))
    json.dump(dict(zr=zr, x0=x0, y0=y0, x1=x1, y1=y1), open(D + 'tiles.json', 'w'))
    subprocess.run(['node', 'vt_extract2.mjs', D + 'vt', D + 'vt_features.jsonl'], check=True)

# ---------------------------------------------------------------- rasters
def load_feats():
    return [json.loads(l) for l in open(D + 'vt_features.jsonl')]
def polys(f): return [f['c']] if f['t'] == 'Polygon' else f['c'] if f['t'] == 'MultiPolygon' else []
def raster_mask(F, b, TW, TH, test):
    layer = Image.new('L', (TW, TH), 0); dr = ImageDraw.Draw(layer)
    def px(c): return [((lo - b['w']) / (b['e'] - b['w']) * TW, (b['n'] - la) / (b['n'] - b['s']) * TH) for lo, la in c]
    for f in F:
        if not test(f): continue
        for poly in polys(f):
            if len(poly[0]) < 3: continue
            dr.polygon(px(poly[0]), fill=255)
            for hole in poly[1:]:
                if len(hole) >= 3: dr.polygon(px(hole), fill=0)
    return np.asarray(layer) > 0
def build_rasters(b, track, gw, gh, step):
    dem = np.load(D + 'dem.npy'); dj = json.load(open(D + 'dem.json')); E0, N1, RES = dj['E0'], dj['N1'], dj['RES']
    F = load_feats()
    Fz12 = [f for f in F if f['z'] == 12]
    ext_x = (b['e'] - b['w']) * 111320 * math.cos(math.radians((b['n'] + b['s']) / 2)); ext_y = (b['n'] - b['s']) * 111050
    if ext_x >= ext_y: TW = 2048; TH = int(round(2048 * ext_y / ext_x / 4)) * 4
    else: TH = 2048; TW = int(round(2048 * ext_x / ext_y / 4)) * 4
    def grid(w, h):
        lon = b['w'] + (np.arange(w) + 0.5) * (b['e'] - b['w']) / w; lat = b['n'] - (np.arange(h) + 0.5) * (b['n'] - b['s']) / h
        return np.meshgrid(lon, lat)
    # land, from the coastline polygons of the topo data
    land = raster_mask(Fz12, b, TW, TH, lambda f: f['l'] == 'coastline')
    if land.mean() < 0.02: raise SystemExit('no land polygons')
    lake = raster_mask(Fz12, b, TW, TH, lambda f: f['l'] == 'water' and f['p'].get('class') in ('lake', 'river', 'lagoon', 'pond', 'reservoir'))
    rock = raster_mask(Fz12, b, TW, TH, lambda f: f['l'] == 'landcover' and f['p'].get('class') in ('scree', 'moraine', 'rock', 'shingle', 'boulders'))
    ice = raster_mask(Fz12, b, TW, TH, lambda f: f['l'] == 'landcover' and f['p'].get('class') in ('ice', 'snow'))
    wood = raster_mask(Fz12, b, TW, TH, lambda f: f['l'] == 'landcover' and f['p'].get('class') == 'wood')
    scrub = raster_mask(Fz12, b, TW, TH, lambda f: f['l'] == 'landcover' and f['p'].get('class') == 'grass' and f['p'].get('natural') == 'scrub')
    wm = ~land
    wm = ndimage.median_filter(wm.astype(np.uint8), 3).astype(bool)
    # heights: fill holes (lakes, sea) from the nearest valid cell
    valid = ~np.isnan(dem)
    idx = ndimage.distance_transform_edt(~valid, return_distances=False, return_indices=True)
    filled = dem[tuple(idx)]
    def sample(lon, lat, arr=filled, order=1):
        e, n = TR.transform(lon, lat)
        c = (np.asarray(e) - E0) / RES - 0.5; r = (N1 - np.asarray(n)) / RES - 0.5
        return ndimage.map_coordinates(arr, [r, c], order=order, mode='nearest')
    LON, LAT = grid(TW, TH)
    ht = sample(LON.ravel(), LAT.ravel()).reshape(TH, TW)
    ht = np.where(wm, 0, np.maximum(ht, 0.6))
    ht = ndimage.gaussian_filter(ht, 0.7) * (~wm)
    hmax_real = float(ht.max()); div = 50 if hmax_real < 1290 else 20 if hmax_real < 3250 else 16
    v16 = np.clip(np.round(ht * div), 0, 65535).astype(np.uint16)
    cov = np.zeros((TH, TW), np.uint8); cov[scrub] = 128; cov[wood] = 255; cov[wm] = 0
    rgb = np.zeros((TH, TW, 3), np.uint8); rgb[..., 0] = v16 >> 8; rgb[..., 1] = v16 & 255; rgb[..., 2] = cov
    Image.fromarray(rgb).save(OUT + 'heights.webp', lossless=True, quality=100, method=6)
    lake &= ~wm
    has_cover = bool(lake.mean() > 0.0005 or rock.mean() > 0.002 or ice.mean() > 0.0005)
    if has_cover:
        cw, ch = TW // 2, TH // 2
        cimg = np.zeros((TH, TW, 3), np.uint8); cimg[..., 0] = lake * 255; cimg[..., 1] = (rock & ~lake) * 255; cimg[..., 2] = (ice & ~lake) * 255
        Image.fromarray(cimg).resize((cw, ch), Image.LANCZOS).save(OUT + 'cover.png', optimize=True)
    log('heights', (TW, TH), 'max m', round(hmax_real), 'div', div, 'sea %', round(float(wm.mean() * 100), 1), 'forest %', round(float(wood.mean() * 100), 1), 'scrub %', round(float(scrub.mean() * 100), 1),
        'lake %', round(float(lake.mean() * 100), 2), 'rock %', round(float(rock.mean() * 100), 2), 'ice %', round(float(ice.mean() * 100), 2), 'bytes', os.path.getsize(OUT + 'heights.webp'))
    # mesh
    def small(mask): return np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).resize((gw, gh), Image.BILINEAR)) > 127
    wmc = small(wm)
    cell = max(ext_x / gw, ext_y / gh)
    sm = ndimage.gaussian_filter(filled, max(0.5, cell / RES * 0.45))
    LONc, LATc = grid(gw, gh)
    hc = sample(LONc.ravel(), LATc.ravel(), sm).reshape(gh, gw)
    landh = np.where(wmc, 0, np.maximum(hc, 1.2))
    HMAX = float(math.ceil(max(landh.max(), 100) / 10) * 10)
    dist = ndimage.distance_transform_edt(wmc)
    v = np.where(wmc, 40 - np.clip(np.round(dist), 1, 40), 40 + np.round(np.sqrt(np.clip(landh, 0, HMAX) / HMAX) * 215)).astype(np.uint8)
    # track heights
    lat = np.array([p[0] for p in track]); lon = np.array([p[1] for p in track])
    raw = sample(lon, lat)
    ele = ndimage.uniform_filter1d(raw, 5 if not C.get('paddle') else 41, mode='nearest'); ele = np.maximum(ele, 1)
    if C.get('paddle'): ele = np.minimum.accumulate(ele)  # a river goes down only
    up = 0; ref = ele[0]
    for x in ele:
        if x - ref > 5: up += x - ref; ref = x
        elif ref - x > 5: ref = x
    log('mesh', (gw, gh), 'hmax', HMAX, 'track ele', round(float(ele.min())), 'to', round(float(ele.max())), 'climb m', round(float(up)))
    np.save(D + 'ele.npy', ele)
    json.dump(dict(terrain=base64.b64encode(v.tobytes()).decode(), hmax=HMAX, htDiv=div, cover=has_cover, TW=TW, TH=TH), open(D + 'mesh.json', 'w'))

# ---------------------------------------------------------------- topo image
def build_topo(b):
    t = json.load(open(D + 'tiles.json')); z, x0, y0, x1, y1 = t['zr'], t['x0'], t['y0'], t['x1'], t['y1']
    big = Image.new('RGB', ((x1 - x0 + 1) * 256, (y1 - y0 + 1) * 256), (255, 255, 255))
    miss = 0
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            f = f'{D}topo/{z}_{x}_{y}.webp'
            if os.path.exists(f):
                try: big.paste(Image.open(f).convert('RGB'), ((x - x0) * 256, (y - y0) * 256))
                except Exception: miss += 1
            else: miss += 1
    # crop to the bounds; rows change from Mercator to equal steps of latitude
    fx0, fy0 = tile_xy(b['n'], b['w'], z); fx1, fy1 = tile_xy(b['s'], b['e'], z)
    px0 = (fx0 - x0) * 256; px1 = (fx1 - x0) * 256
    ext_x = (b['e'] - b['w']) * 111320 * math.cos(math.radians((b['n'] + b['s']) / 2)); ext_y = (b['n'] - b['s']) * 111050
    if ext_x >= ext_y: OW = 4096; OH = int(round(4096 * ext_y / ext_x / 8)) * 8
    else: OH = 4096; OW = int(round(4096 * ext_x / ext_y / 8)) * 8
    src = np.asarray(big)
    lat = b['n'] - (np.arange(OH) + 0.5) * (b['n'] - b['s']) / OH
    rows = np.array([(tile_xy(la, b['w'], z)[1] - y0) * 256 for la in lat])
    cols = px0 + (np.arange(OW) + 0.5) * (px1 - px0) / OW
    # box filter by a blur before sampling, when the output is smaller
    scale = (px1 - px0) / OW
    if scale > 1.3:
        im2 = big.filter(__import__('PIL.ImageFilter', fromlist=['x']).GaussianBlur(radius=scale * 0.4)); src = np.asarray(im2)
    R, Cc = np.meshgrid(rows, cols, indexing='ij')
    out = np.stack([ndimage.map_coordinates(src[..., k], [R - 0.5, Cc - 0.5], order=1, mode='nearest') for k in range(3)], axis=-1).astype(np.uint8)
    q = 82
    while True:
        Image.fromarray(out).save(OUT + 'topo.webp', quality=q, method=6)
        if os.path.getsize(OUT + 'topo.webp') < 2.6e6 or q <= 60: break
        q -= 6
    log('topo', (OW, OH), 'zoom', z, 'missing tiles', miss, 'quality', q, 'bytes', os.path.getsize(OUT + 'topo.webp'))

# ---------------------------------------------------------------- names from OpenStreetMap (Nominatim), kept in a file
GEO_F = 'data/geocode.json'
def geocode(name, b):
    import time, urllib.parse
    cache = json.load(open(GEO_F)) if os.path.exists(GEO_F) else {}
    key = ID + '|' + name
    if key not in cache:
        url = 'https://nominatim.openstreetmap.org/search?format=json&limit=5&bounded=1&viewbox=%s,%s,%s,%s&q=%s' % (b['w'], b['n'], b['e'], b['s'], urllib.parse.quote(name))
        r = subprocess.run(['curl', '-s', '-m', '30', '-A', 'qcnz-build/1.0 (walk map packs)', url], capture_output=True, text=True); time.sleep(1.1)
        try: j = json.loads(r.stdout)
        except Exception: j = []
        def norm(t): return re.sub(r'[^a-z ]', '', t.lower().replace('ā', 'a').replace('ē', 'e').replace('ī', 'i').replace('ō', 'o').replace('ū', 'u'))
        ok = [x for x in j if norm(name) in norm(x.get('display_name', '').split(',')[0]) and x.get('class') != 'highway']
        cache[key] = [float(ok[0]['lat']), float(ok[0]['lon']), ok[0].get('display_name', '')[:60]] if ok else None
        json.dump(cache, open(GEO_F, 'w'), ensure_ascii=False, indent=0)
    return cache[key]

# ---------------------------------------------------------------- features, stops, pack
def clean(s): return re.sub(r'\s+', ' ', s or '').strip()
def facilities(txt):
    items = [x.strip() for x in (txt or '').split(',') if x.strip()]
    out = []; low = ' '.join(items).lower()
    def add(x):
        if x not in out: out.append(x)
    for it in items:
        l = it.lower()
        if l.startswith('toilets -'): add(l.replace('toilets - ', '') + ' toilets')
        elif l == 'toilets':
            if 'toilets -' not in low: add('toilets')
        elif 'boil before use' in l or 'not treated' in l: pass
        elif l.startswith('water from tap'): add('tap water')
        elif l.startswith('water from stream'): add('water from a stream')
        elif l == 'water supply':
            if 'water from' not in low: add('water')
        elif l.startswith('fire pit'): add('fire place')
        elif l.startswith('non-powered'): pass
        elif l.startswith('shelter for cooking'): add('cooking shelter')
        else: add(l)
    boil = 'boil' in low or 'not treated' in low
    return out, boil
def build_pack(b, unit, gw, gh, track, step, sides):
    from shapely.geometry import LineString
    from shapely.ops import unary_union
    F = load_feats(); mesh = json.load(open(D + 'mesh.json')); ele = np.load(D + 'ele.npy')
    lat0 = (b['n'] + b['s']) / 2; KX = 111320 * math.cos(math.radians(lat0)); KY = 111050
    def xy(lon, lat): return (lon * KX, lat * KY)
    main = np.array([xy(p[1], p[0]) for p in track]); mtree = cKDTree(main)
    route = LineString(main)
    stepkm = step / 1000; total_km = (len(track) - 1) * stepkm
    paddle = bool(C.get('paddle'))
    def near(coords):
        d, _ = mtree.query(np.array([xy(*c) for c in coords])); return float(d.min()), float((d < 30).mean())
    def lines(f): return [f['c']] if f['t'] == 'LineString' else f['c'] if f['t'] == 'MultiLineString' else []
    def simp(c, tol=6):
        ls = LineString([xy(*p) for p in c]).simplify(tol)
        return [round(v, 5) for x, y in ls.coords for v in (x / KX, y / KY)]
    out = {'streams': [], 'roads': [], 'tracks': [], 'pts': [], 'cross': []}
    seen = set(); stream_geoms = []
    sdist = 1500 if not paddle else 900
    for f in F:
        if f['z'] != 14: continue
        cl = f['p'].get('class')
        if f['l'] == 'waterway' and cl in ('river', 'stream') and f['t'].endswith('LineString'):
            for c in lines(f):
                if len(c) < 2: continue
                d, _ = near(c)
                if d < sdist:
                    key = (round(c[0][0], 5), round(c[0][1], 5), round(c[-1][0], 5), round(c[-1][1], 5), len(c))
                    if key in seen: continue
                    seen.add(key); out['streams'].append(simp(c)); stream_geoms.append((LineString([xy(*p) for p in c]), f['p'].get('name')))
        elif f['l'] == 'transportation' and cl in ('track', 'secondary', 'motorway', 'primary', 'trunk') and f['t'].endswith('LineString'):
            for c in lines(f):
                if len(c) < 2: continue
                d, frac = near(c)
                if d > 2500: continue
                if cl == 'track' and frac > 0.7: continue  # the walk itself
                key = (round(c[0][0], 5), round(c[0][1], 5), round(c[-1][0], 5), round(c[-1][1], 5), len(c))
                if key in seen: continue
                seen.add(key); out['tracks' if cl == 'track' else 'roads'].append(simp(c))
    if not paddle:
        cr = []
        for ls, nm in stream_geoms:
            x = ls.intersection(route)
            if x.is_empty: continue
            for p in ([x] if x.geom_type == 'Point' else [q for q in getattr(x, 'geoms', []) if q.geom_type == 'Point']):
                d, i = mtree.query([p.x, p.y]); cr.append((i * stepkm, p.x / KX, p.y / KY, nm))
        cr.sort(); merged = []
        for km, lo, la, nm in cr:
            if merged and km - merged[-1]['km'] < 0.08:
                if nm and not merged[-1].get('n'): merged[-1]['n'] = nm
                continue
            m = {'km': round(km, 2), 'lo': round(lo, 5), 'la': round(la, 5)}
            if nm: m['n'] = nm
            merged.append(m)
        out['cross'] = merged
    def addpt(k, lon, lat, **kw):
        for q in out['pts']:
            if q['k'] == k and abs(q['lo'] - lon) < 0.0006 and abs(q['la'] - lat) < 0.0005: return
        out['pts'].append(dict(k=k, lo=round(lon, 5), la=round(lat, 5), **{a: v for a, v in kw.items() if v not in (None, '', 0)}))
    lim = {'wharf': 1500, 'peak': 3000, 'trig': 3000, 'homestead': 2500, 'hut': 2500, 'shelter': 1500, 'beacon': 3000, 'wreck': 3000, 'monument': 2500, 'historic_site': 2500, 'waterfall_pt': 1500, 'boatramp': 1500}
    def centre(f):
        if f['t'] == 'Point': return f['c']
        if f['t'] == 'LineString': return list(np.mean(np.array(f['c']), axis=0))
        if f['t'] == 'Polygon': return list(np.mean(np.array(f['c'][0]), axis=0))
        return None
    for f in F:
        cl = f['p'].get('class')
        if cl not in lim or f['l'] not in ('poi', 'contours', 'waterway'): continue
        c = centre(f)
        if not c: continue
        lon, lat = c
        if not (b['w'] < lon < b['e'] and b['s'] < lat < b['n']): continue
        d, _ = mtree.query(xy(lon, lat))
        if d > lim[cl]: continue
        addpt(cl, float(lon), float(lat), n=clean(f['p'].get('name') or f['p'].get('ref') or ''), e=f['p'].get('elevation') or f['p'].get('height'))
    # keep the spot heights apart
    pk = sorted([p for p in out['pts'] if p['k'] == 'peak'], key=lambda p: -(p.get('e') or 0)); keep = []
    for p in pk:
        if all(math.hypot((p['lo'] - q['lo']) * KX, (p['la'] - q['la']) * KY) > 900 for q in keep): keep.append(p)
    out['pts'] = [p for p in out['pts'] if p['k'] != 'peak'] + keep[:70]
    json.dump(out, open(OUT + 'topofeat.json', 'w'), separators=(',', ':'), ensure_ascii=False)
    log('features', {k: len(v) for k, v in out.items()}, dict(collections.Counter(p['k'] for p in out['pts'])), 'bytes', os.path.getsize(OUT + 'topofeat.json'))

    # ---- stops: DOC huts and campsites on the track, the start and the end
    def km_of(lat, lon):
        d, i = mtree.query(xy(lon, lat)); return i * stepkm, float(d)
    raw = gwlib.huts_near(track, 650)
    groups = {}
    for h in raw:
        nm = clean(h['name']); stem = re.sub(r'\s+(Hut|Campsite|Campground|Great Walk Campsite|Shelter Campsite|Marae/kāinga Campsite|Marae/kāinga)$', '', nm)
        if nm in C.get('skip', ()) or stem in C.get('skip', ()): continue
        g = groups.setdefault(stem, dict(stem=stem, items=[]))
        if not any(x['name'] == nm for x in g['items']): g['items'].append(dict(h, name=nm))
    stops = {}; order = []
    def sid(name):
        s = re.sub(r'[^a-z0-9]+', '', name.lower().replace('ā', 'a').replace('ē', 'e').replace('ī', 'i').replace('ō', 'o').replace('ū', 'u'))[:18]
        while s in stops: s += 'x'
        return s
    for stem, g in groups.items():
        huts = [x for x in g['items'] if x['kind'] == 'hut']; camps = [x for x in g['items'] if x['kind'] == 'camp']
        main_it = (huts or camps)[0]; kind = 'hut' if huts else 'camp'
        km, off = km_of(main_it['lat'], main_it['lon'])
        if C.get('loop') and km < 0.4: continue
        fac, boil = facilities(main_it['props'].get('facilities'))
        if huts and camps: name = stem + ' Hut and Campsite'
        else: name = main_it['name']
        name = C.get('rename', {}).get(name, name)
        note = ('DOC hut' if huts else 'DOC campsite') + (' and campsite' if huts and camps else '') + '.'
        n_sites = camps[0]['props'].get('numberOfUnpoweredSites') if camps else None
        if camps and n_sites: note += f' {n_sites} tent sites.'
        if (main_it['props'].get('bookable') or '').lower().startswith('y'): note += ' You must book before you go.'
        if fac: note += ' Facilities: ' + ', '.join(fac) + '.'
        if boil: note += ' Boil the water before you drink it.'
        if off > 150: note += f' It is {int(round(off / 50) * 50)} m from the track line on this map.'
        i = sid(stem); stops[i] = dict(name=name, stem=stem, short=C.get('short', {}).get(stem, stem + (' Hut' if huts else ' Campsite')), lat=round(main_it['lat'], 5), lon=round(main_it['lon'], 5), km=round(km, 2), kind=kind, note=note)
    for x in C.get('extra_stops', []):
        km, off = km_of(x['lat'], x['lon']) if 'km' not in x else (x['km'], 0)
        i = sid(x['short']); stops[i] = dict(name=x['name'], short=x['short'], lat=x['lat'], lon=x['lon'], km=round(km, 2), kind=x.get('kind', 'lodge'), note=x.get('note', ''))
    side_out = {}
    for key, sd in sides.items():
        km = sd['idx'] * stepkm
        ln = sd['line']; sele = [float(x) for x in np.interp(np.linspace(0, 1, len(ln)), [0, 1], [ele[sd['idx']], ele[sd['idx']]])]
        side_out[key] = dict(km=round(km, 2), len=sd['len'], line=[[round(p[1], 5), round(p[0], 5)] for p in ln], ele=[round(x) for x in sele])
        cfg = C['sides'][key]
        i = sid(cfg['short']); stops[i] = dict(name=cfg['name'], short=cfg['short'], lat=cfg['at'][0], lon=cfg['at'][1], arrive=key, leave=key, kind=cfg.get('kind', 'hut'), note=cfg.get('note', ''))
    s0 = C['start']; s1 = C['end']
    stops['start'] = dict(name=s0['name'], short=s0.get('short', s0['name']), lat=round(track[0][0], 5), lon=round(track[0][1], 5), km=0, kind='start', note=s0.get('note', ''))
    stops['end'] = dict(name=s1['name'], short=s1.get('short', s1['name']), lat=round(track[-1][0], 5), lon=round(track[-1][1], 5), km=round(total_km, 2), kind='end', note=s1.get('note', ''))
    def skm(i): return side_out[stops[i]['arrive']]['km'] if stops[i].get('arrive') else stops[i]['km']
    opts = sorted([i for i in stops if i not in ('start', 'end') and 1.0 < skm(i) < total_km - 1.0], key=skm)
    by_name = {}
    for i in stops: by_name[stops[i]['short'].lower()] = i; by_name[stops[i]['name'].lower()] = i; by_name[stops[i].get('stem', stops[i]['short']).lower()] = i
    for i in stops: stops[i].pop('stem', None)
    nights = []
    for nm in C['nights']:
        if nm.lower() not in by_name: raise SystemExit(f'night stop not found: {nm}; have {sorted(by_name)}')
        nights.append(by_name[nm.lower()])
    log('stops', [(i, stops[i]['short'], round(skm(i), 1)) for i in ['start'] + opts + ['end']])
    log('nights', nights)

    # ---- points of interest
    pois = []; used = set()
    def addpoi(kind, name, lat, lon, text, fac=None, short=None, stop=None):
        key = name.lower()
        if key in used: return
        km, off = km_of(lat, lon)
        used.add(key); p = dict(id='p' + str(len(pois)), kind=kind, name=name, lat=round(lat, 5), lon=round(lon, 5), text=text)
        if fac: p['fac'] = fac
        if short: p['short'] = short
        if stop: p['stop'] = stop
        pois.append(p)
    notes = C.get('poi_notes', {})
    names_seen = {}
    for f in F:
        nm = clean(f['p'].get('name') or ''); cl = f['p'].get('class'); c = centre(f)
        if not nm or not c: continue
        lon, lat = c
        if not (b['w'] < lon < b['e'] and b['s'] < lat < b['n']): continue
        d = float(mtree.query(xy(lon, lat))[0])
        names_seen.setdefault(nm, []).append((d, f['l'], cl, lat, lon, f['p']))
    for nm, lst in names_seen.items():
        lst.sort(key=lambda t: t[0])
    def find(nm):
        return names_seen.get(nm, [None])[0]
    for nm, (kind, text) in notes.items():
        alias = nm.split('|'); hit = None
        for a in alias:
            hit = find(a)
            if hit: break
        if hit and hit[0] > 6000: hit = None
        if not hit:
            for a in alias:
                g = geocode(a, b)
                if g and float(mtree.query(xy(g[1], g[0]))[0]) < 6000: hit = (0, 'osm', '', g[0], g[1], {}); break
        if not hit: log('  note not placed:', nm); continue
        addpoi(kind, alias[0], hit[3], hit[4], text)
    if C.get('high'):
        hn, hk, ht_ = C['high']; i = int(np.argmax(ele)) if 'high_km' not in C else int(C['high_km'] / stepkm)
        addpoi(hk, hn, track[i][0], track[i][1], ht_.replace('{ele}', str(int(round(float(ele[i]) / 10) * 10))))
    for x in C.get('extra_pois', []):
        if 'km' in x:
            i = int((x['km'] if x['km'] >= 0 else total_km + x['km']) / stepkm); i = max(0, min(len(track) - 1, i)); x = dict(x, lat=track[i][0], lon=track[i][1])
        addpoi(x['kind'], x['name'], x['lat'], x['lon'], x['text'], x.get('fac'))
    for f in F:
        cl = f['p'].get('class'); nm = clean(f['p'].get('name') or ''); c = centre(f)
        if not c or not nm: continue
        lon, lat = c; d = float(mtree.query(xy(lon, lat))[0])
        if f['l'] == 'poi' and cl == 'shelter' and d < 400:
            addpoi('rest', nm, lat, lon, 'Shelter from the Topo50 data. A place to rest out of the rain.', ['shelter'])
        elif f['l'] == 'waterway' and cl in ('waterfall_pt', 'waterfall_ln') and d < 700:
            h = f['p'].get('height') or 0
            addpoi('nature', nm, lat, lon, f'Waterfall, about {int(h)} m high.' if h else 'Waterfall.')
        elif f['l'] == 'place' and cl == 'geo' and f['p'].get('natural') in ('saddle', 'pass') and d < 300:
            e = float(ndimage.map_coordinates(np.asarray(ele, float), [[mtree.query(xy(lon, lat))[1]]], order=0)[0])
            addpoi('view', nm, lat, lon, f'The track goes over this point at about {int(round(e / 10) * 10)} m.')
        elif f['l'] == 'poi' and cl == 'hut' and d < 500 and not any(nm.lower().startswith(stops[i]['short'].lower()[:8]) for i in stops):
            addpoi('rest', nm, lat, lon, 'Hut from the Topo50 data. It is not a DOC Great Walk hut. It can be private or locked.')
    for i in opts:  # huts and campsites are rest places too
        s = stops[i]
        if s.get('arrive'): continue
        addpoi('rest', s['name'], s['lat'], s['lon'], s['note'], ['hut', 'toilet', 'water'] if s['kind'] == 'hut' else ['camp', 'toilet'] if s['kind'] == 'camp' else ['lodge'], s['short'], i)
    log('pois', len(pois), [p['name'] for p in pois if p['kind'] != 'rest'])

    # ---- labels: lakes, the sea, peaks and places
    labels = []
    def far_from_labels(lat, lon, m): return all(math.hypot((lon - l['lon']) * KX, (lat - l['lat']) * KY) > m for l in labels)
    span = max((b['e'] - b['w']) * KX, (b['n'] - b['s']) * KY)
    areas = {}
    for f in F:
        if f['z'] != 12 or f['l'] != 'water' or f['p'].get('class') not in ('lake', 'lagoon'): continue
        nm = clean(f['p'].get('name') or '')
        if not nm: continue
        for poly in polys(f):
            a = np.array(poly[0]); x = a[:, 0] * KX; y = a[:, 1] * KY
            ar = abs(float(np.sum(x[:-1] * y[1:] - x[1:] * y[:-1])) / 2)
            cur = areas.setdefault(nm, [0, None, 0])
            cur[0] += ar
            if ar > cur[2]: cur[2] = ar; cur[1] = (float(a[:, 1].mean()), float(a[:, 0].mean()))
    for nm, (ar, c, _) in sorted(areas.items(), key=lambda t: -t[1][0])[:6]:
        if nm in C.get('skip_labels', ()): continue
        mgn = 0.04
        if not (b['w'] + (b['e'] - b['w']) * mgn < c[1] < b['e'] - (b['e'] - b['w']) * mgn and b['s'] + (b['n'] - b['s']) * mgn < c[0] < b['n'] - (b['n'] - b['s']) * mgn): continue
        if ar > 3e5 and far_from_labels(c[0], c[1], span * 0.07): labels.append(dict(name=nm, lat=round(c[0], 4), lon=round(c[1], 4), water=True, big=ar > 2e7))
    for x in C.get('labels', []):
        if isinstance(x, str):
            g = geocode(x, b)
            if not g: log('  label not placed:', x); continue
            x = dict(name=x, lat=round(g[0], 4), lon=round(g[1], 4))
        labels.append(x)
    geo = []
    for f in F:
        if f['l'] == 'place' and f['t'] == 'Point' and clean(f['p'].get('name') or ''):
            lon, lat = f['c']
            if b['w'] < lon < b['e'] and b['s'] < lat < b['n']: geo.append((float(mtree.query(xy(lon, lat))[0]), clean(f['p']['name']), lat, lon, f['p']))
    geo.sort(key=lambda t: t[0]); seen_n = {l['name'] for l in labels} | {p['name'] for p in pois}
    for d, nm, lat, lon, p in geo:
        if len(labels) >= 16: break
        if nm in C.get('skip_labels', ()): continue
        if nm in seen_n or nm.split('/')[0].strip() in {n_.split('/')[0].strip() for n_ in seen_n} or not far_from_labels(lat, lon, span * 0.06): continue
        seen_n.add(nm)
        wat = p.get('water') not in (None, '0', 0, '') or p.get('natural') in ('bay', 'strait', 'sound', 'fiord', 'water')
        labels.append(dict(name=nm, lat=round(lat, 4), lon=round(lon, 4), **({'water': True} if wat else {})))
    log('labels', [l['name'] for l in labels])

    # ---- forecast zones
    zones = []
    for fr in (1 / 6, 1 / 2, 5 / 6):
        i = int(fr * (len(track) - 1)); km = i * stepkm
        ns = min(stops, key=lambda s: abs(skm(s) - km)); e = float(ele[i])
        zones.append(dict(lat=round(track[i][0], 3), lon=round(track[i][1], 3), ele=int(round(e)), name=f"near {stops[ns]['short']}, {int(round(e / 10) * 10)} m", short=re.sub(r' (Hut|Campsite|Lodge|School Hut)$', '', stops[ns]['short'])))
    geo_out = dict(bounds=b, gw=gw, gh=gh, hmax=mesh['hmax'], terrain=mesh['terrain'], step=step, unit=unit, htDiv=mesh['htDiv'],
                   track=[v for p, e in zip(track, ele) for v in (round(p[1], 5), round(p[0], 5), round(float(e)))], sides=side_out)
    meta = dict(ht='heights.webp', lat=round(lat0, 3), lon=round((b['w'] + b['e']) / 2, 3), bush=C.get('bush', 1000), cover=mesh['cover'], notes=C.get('notes', []), loop=bool(C.get('loop')), mapKm=round(total_km, 1))
    pack = dict(meta=meta, geo=geo_out, stops=stops, start='start', end='end', nightOptions=opts, defaultNights=nights, pois=pois, labels=labels, zones=zones)
    json.dump(pack, open(OUT + 'pack.json', 'w'), separators=(',', ':'), ensure_ascii=False)
    log('pack.json', os.path.getsize(OUT + 'pack.json'), 'total MB', round(sum(os.path.getsize(OUT + f) for f in os.listdir(OUT)) / 1e6, 2))

# ---------------------------------------------------------------- run
rf = D + 'route.json'
if want('route') or not os.path.exists(rf):
    track, step = build_route(); sides = build_sides(track)
    json.dump(dict(track=track, step=step, sides=sides), open(rf, 'w'))
r = json.load(open(rf)); track = [tuple(p) for p in r['track']]; step = r['step']; sides = r['sides']
b, unit, gw, gh, Wm, Hm = make_bounds(track, [tuple(p) for s in sides.values() for p in s['line']])
log('bounds', b, 'km', round(Wm / 1000, 1), 'x', round(Hm / 1000, 1), 'unit m', unit, 'mesh', gw, gh)
if want('dem') and (STAGES or not os.path.exists(D + 'dem.npy')): build_dem(b)
if want('tiles') and (STAGES or not os.path.exists(D + 'vt_features.jsonl')): build_tiles(b, track)
if want('rasters'): build_rasters(b, track, gw, gh, step)
if want('topo') and (STAGES or not os.path.exists(OUT + 'topo.webp')): build_topo(b)
if want('pack'): build_pack(b, unit, gw, gh, track, step, sides)
