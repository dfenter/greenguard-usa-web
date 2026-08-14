/* Ricochet Range service worker. Generated from /play/_shared/sw-template.js. */
const SLUG = 'ricochet-range';
const VERSION = '2026-08-10-aa-03';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/ricochet-range/',
  '/play/ricochet-range/index.html',
  '/play/ricochet-range/game.js',
  '/play/ricochet-range/manifest.json',
  '/play/ricochet-range/icon.png',
  '/play/ricochet-range/icon512.png',
  '/play/ricochet-range/favicon.svg',
  '/play/ricochet-range/assets/ball.svg',
  '/play/ricochet-range/assets/particle.svg',
  '/play/ricochet-range/assets/range-seal.svg',
  '/play/ricochet-range/sw.js',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('gg-' + SLUG + '-') && key !== CACHE)
      .map((key) => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (!url.pathname.startsWith('/play/' + SLUG + '/') && !url.pathname.startsWith('/play/_shared/') && !url.pathname.startsWith('/play/_assets/')) return;
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    }
    return response;
  })));
});
