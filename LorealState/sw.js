// Loreal State: primero busca lo nuevo; sin conexión usa lo guardado
const CACHE = 'loreal-estate-v4';
const BASE = ['./', 'index.html', 'styles.css', 'app.js', 'config.js', 'data/zonas.json', 'vendor/leaflet/leaflet.css', 'vendor/leaflet/leaflet.js', 'icon-192.png'];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).catch(() => {})); });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
