// Offline cache for the Queen Charlotte Track app.
const CACHE = 'qct-v12';
const SHELL = ['./', 'index.html', 'app.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'heights.png', 'topofeat.json', 'topo.webp'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // Only the app files and the fonts come from the cache. The forecast and shared positions always come from the network.
  if (e.request.method !== 'GET' || (u.origin !== location.origin && !/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(u.hostname))) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: u.origin === location.origin }).then(hit => {
    const net = fetch(e.request).then(r => {
      if (r && (r.ok || r.type === 'opaque')) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => hit);
    return hit || net;
  }));
});
