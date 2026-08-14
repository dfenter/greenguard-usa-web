/* Cube Cascade service worker. Generated from /play/_shared/sw-template.js. */
const SLUG = 'cube-cascade';
const VERSION = 'aaa-20260810-6';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/cube-cascade/',
  '/play/cube-cascade/index.html',
  '/play/cube-cascade/game.js',
  '/play/cube-cascade/sw.js',
  '/play/cube-cascade/manifest.json',
  '/play/cube-cascade/icon.png',
  '/play/cube-cascade/icon512.png',
  '/play/cube-cascade/assets/move.mp3',
  '/play/cube-cascade/assets/drop.mp3',
  '/play/cube-cascade/assets/hold.mp3',
  '/play/cube-cascade/assets/match.mp3',
  '/play/cube-cascade/assets/cascade.mp3',
  '/play/cube-cascade/assets/combo.mp3',
  '/play/cube-cascade/assets/warning.mp3',
  '/play/cube-cascade/assets/overflow.mp3',
  '/play/cube-cascade/assets/music-base.mp3',
  '/play/cube-cascade/assets/music-danger.mp3',
  '/play/cube-cascade/favicon.png',
  '/play/cube-cascade/assets/hop.mp3',
  '/play/cube-cascade/assets/light.mp3',
  '/play/cube-cascade/assets/hit.mp3',
  '/play/cube-cascade/assets/clear.mp3',
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
