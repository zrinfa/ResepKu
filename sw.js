/* ResepKu SW: offline app-shell */
const CACHE = 'resepku-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).then(r => {
        const c = r.clone();
        caches.open(CACHE).then(cache => cache.put('./index.html', c));
        return r;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }
  e.respondWith(
    caches.match(request, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      return fetch(request).then(r => {
        if (r.ok) {
          const c = r.clone();
          caches.open(CACHE).then(cache => cache.put(request, c));
        }
        return r;
      }).catch(() => hit);
    })
  );
});
