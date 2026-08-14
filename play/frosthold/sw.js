/* Frosthold service worker. Cache only files that ship with this title. */
const SLUG = 'frosthold';
const VERSION = 'aaa-f9-3';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/frosthold/',
  '/play/frosthold/index.html',
  '/play/frosthold/game.js',
  '/play/frosthold/manifest.json',
  '/play/frosthold/icon.png',
  '/play/frosthold/icon512.png',
  '/play/frosthold/favicon.png',
  '/play/frosthold/assets/wind.mp3',
  '/play/frosthold/assets/furnace.mp3',
  '/play/frosthold/assets/build.mp3',
  '/play/frosthold/assets/horn.mp3',
  '/play/frosthold/assets/medal.mp3',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js'
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
  if (!url.pathname.startsWith('/play/frosthold/') && !url.pathname.startsWith('/play/_shared/')) return;
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request).then((response) => {
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  })));
});
