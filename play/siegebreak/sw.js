/* Siegebreak offline shell. Generated from /play/_shared/sw-template.js. */
const SLUG = 'siegebreak';
const VERSION = '2026-08-10-r4';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/siegebreak/',
  '/play/siegebreak/index.html',
  '/play/siegebreak/game.js',
  '/play/siegebreak/manifest.json',
  '/play/siegebreak/icon.png',
  '/play/siegebreak/icon512.png',
  '/play/siegebreak/favicon.png',
  '/play/siegebreak/assets/steel.m4a',
  '/play/siegebreak/assets/horn.m4a',
  '/play/siegebreak/assets/oil.m4a',
  '/play/siegebreak/assets/drum.m4a',
  '/play/siegebreak/assets/impact.m4a',
  '/play/siegebreak/assets/kick.m4a',
  '/play/siegebreak/assets/sweep.m4a',
  '/play/siegebreak/assets/ladder.m4a',
  '/play/siegebreak/assets/rope.m4a',
  '/play/siegebreak/assets/ram.m4a',
  '/play/siegebreak/assets/tower.m4a',
  '/play/siegebreak/assets/rally.m4a',
  '/play/siegebreak/assets/march.m4a',
  '/play/siegebreak/assets/danger.m4a',
  '/play/siegebreak/assets/victory.m4a',
  '/play/_shared/ggkit.js',
  '/play/_shared/phaser.min.js'
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
