import xml.etree.ElementTree as ET, math, heapq, json, glob
import numpy as np
def hav(a, b):
    la1, lo1 = a; la2, lo2 = b
    return math.hypot((lo2 - lo1) * 111320 * math.cos(math.radians((la1 + la2) / 2)), (la2 - la1) * 111050)
def load_graph(files):
    nodes = {}; adj = {}; ways = []
    for f in files:
        r = ET.parse(f).getroot()
        for n in r.findall('node'): nodes[n.get('id')] = (float(n.get('lat')), float(n.get('lon')))
        for w in r.findall('way'):
            ids = [x.get('ref') for x in w.findall('nd')]
            tags = {t.get('k'): t.get('v') for t in w.findall('tag')}
            ways.append((w.get('id'), ids, tags))
    for wid, ids, tags in ways:
        for a, b in zip(ids, ids[1:]):
            if a not in nodes or b not in nodes or a == b: continue
            d = hav(nodes[a], nodes[b])
            adj.setdefault(a, {})[b] = d; adj.setdefault(b, {})[a] = d
    return nodes, adj, ways
def nearest(nodes, ids, pt):
    best = None; bd = 1e18
    for i in ids:
        d = hav(nodes[i], pt)
        if d < bd: bd = d; best = i
    return best, bd
def dijkstra(adj, a, b, banned=()):
    dist = {a: 0}; prev = {}; pq = [(0, a)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == b: break
        if d > dist.get(u, 1e18): continue
        for v, w in adj[u].items():
            if (u, v) in banned: continue
            nd = d + w
            if nd < dist.get(v, 1e18): dist[v] = nd; prev[v] = u; heapq.heappush(pq, (nd, v))
    if b not in dist: return None, None
    path = [b]
    while path[-1] != a: path.append(prev[path[-1]])
    return path[::-1], dist[b]
def huts_near(pts, maxd=500):
    """DOC huts and campsites within maxd metres of a polyline (list of (lat,lon))."""
    from scipy.spatial import cKDTree
    lat0 = sum(p[0] for p in pts) / len(pts); kx = 111320 * math.cos(math.radians(lat0)); ky = 111050
    tree = cKDTree(np.array([(p[1] * kx, p[0] * ky) for p in pts]))
    out = []
    for kind, f in (('hut', 'data/DOC_Huts.json'), ('camp', 'data/DOC_Campsites.json')):
        for ft in json.load(open(f))['features']:
            g = ft.get('geometry')
            if not g: continue
            lon, lat = g['coordinates'][:2]
            if abs(lat - lat0) > 1.5: continue
            d, i = tree.query((lon * kx, lat * ky))
            if d <= maxd: out.append(dict(kind=kind, name=ft['properties']['name'], lat=lat, lon=lon, off=float(d), idx=int(i), props=ft['properties']))
    return out
