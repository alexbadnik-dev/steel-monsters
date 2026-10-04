// Service worker: страница — сеть-прежде-кэша (обновления подтягиваются сразу,
// в т.ч. в установленной PWA), остальное — кэш-прежде-сети. Офлайн работает.
const CACHE = 'steel-monsters-v80';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isPage(req){
  if (req.mode === 'navigate') return true;
  const url = new URL(req.url);
  return url.origin === self.location.origin &&
         (url.pathname.endsWith('/index.html') || url.pathname.endsWith('/'));
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (isPage(e.request)) {
    // свежая страница из сети; кэш — только когда сети нет
    e.respondWith(
      fetch(e.request).then(resp => {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return resp;
      }).catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(hit => {
      if (hit) return hit;
      return fetch(e.request).then(resp => {
        // Докэшируем удачные ответы (в т.ч. шрифт с Google Fonts) для оффлайна.
        if (resp && (resp.ok || resp.type === 'opaque')) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return resp;
      });
    })
  );
});
