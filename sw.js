// FIYODIGGER Lite: abre al toque y se actualiza sola (primero busca lo nuevo en internet; sin conexion, usa lo guardado)
const CACHE = 'fiyodigger-lite';
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', 'index.html', 'lists.js', 'version.js', 'i18n.js', 'web.js', 'mob.js', 'manual.html', 'manual-en.html', 'android.css', 'logo.png', 'metal.jpg', 'grain.png', 'wear.png', 'scratch.png', 'vt323.woff2', 'rc-400.woff2', 'rc-700.woff2']).catch(() => {}))) });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // Discogs y YouTube van directo
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); return r }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
