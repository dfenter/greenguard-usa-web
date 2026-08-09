const VERSION = 'zc-v16';
const CACHE = VERSION;
const PRECACHE = [
  './?v=16',
  'index.html?v=16',
  'manifest.json?v=16',
  'js/engine.js?v=16',
  'js/sound.js?v=16',
  'js/sprites.js?v=16',
  'js/tiles.js?v=16',
  'js/world.js?v=16',
  'js/dungeon.js?v=16',
  'js/entities.js?v=16',
  'js/items.js?v=16',
  'js/game.js?v=16',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const isHtml = request.mode === 'navigate' || url.pathname.endsWith('.html');
  const isStatic = url.pathname.includes('/js/') || url.pathname.endsWith('/manifest.json');

  if (isHtml) {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match(request).then(cached =>
      cached || caches.match(new URL('index.html?v=16', self.location).href)
    )));
    return;
  }

  if (isStatic) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    })));
  }
});
