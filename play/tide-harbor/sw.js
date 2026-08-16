/* Tide Harbor service worker. Cache-first after the first load. */
const SLUG = 'tide-harbor';
const VERSION = 'aaa-round2-20260816-1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/tide-harbor/',
  '/play/tide-harbor/index.html',
  '/play/tide-harbor/game.js',
  '/play/tide-harbor/sea.js',
  '/play/tide-harbor/ship.js',
  '/play/tide-harbor/world.js',
  '/play/tide-harbor/fx.js',
  '/play/tide-harbor/economy.js',
  '/play/tide-harbor/bake.js',
  '/play/tide-harbor/manifest.json',
  '/play/tide-harbor/icon.png',
  '/play/tide-harbor/icon512.png',
  '/play/tide-harbor/favicon.png',
  '/play/tide-harbor/assets/boost.mp3',
  '/play/tide-harbor/assets/buy.mp3',
  '/play/tide-harbor/assets/cache.mp3',
  '/play/tide-harbor/assets/creak.mp3',
  '/play/tide-harbor/assets/dock.mp3',
  '/play/tide-harbor/assets/gulls.mp3',
  '/play/tide-harbor/assets/market.mp3',
  '/play/tide-harbor/assets/reef.mp3',
  '/play/tide-harbor/assets/sell.mp3',
  '/play/tide-harbor/assets/storm.mp3',
  '/play/tide-harbor/assets/trim.mp3',
  '/play/tide-harbor/assets/upgrade.mp3',
  '/play/tide-harbor/assets/victory.mp3',
  '/play/tide-harbor/assets/wind.mp3',
  '/play/_shared/ggkit.js',
  '/play/_shared/three/three.module.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('gg-' + SLUG + '-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (!url.pathname.startsWith('/play/' + SLUG + '/') && !url.pathname.startsWith('/play/_shared/')) return;
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request).then((response) => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, copy)); }
    return response;
  })));
});
