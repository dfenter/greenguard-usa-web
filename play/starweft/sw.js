/* Starweft service worker, generated from /play/_shared/sw-template.js. */
const SLUG = 'starweft';
const VERSION = '2026.08.11.1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/starweft/',
  '/play/starweft/index.html',
  '/play/starweft/styles.css',
  '/play/starweft/game.js',
  '/play/starweft/manifest.json',
  '/play/starweft/icon.png',
  '/play/starweft/icon512.png',
  '/play/starweft/favicon.png',
  '/play/starweft/assets/theme.mp3',
  '/play/starweft/assets/skill.mp3',
  '/play/starweft/assets/break.mp3',
  '/play/starweft/assets/ultimate.mp3',
  '/play/starweft/assets/victory.mp3',
  '/play/_shared/ggkit.js',
  '/play/_shared/phaser.min.js',
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
  if (!url.pathname.startsWith('/play/' + SLUG + '/') && !url.pathname.startsWith('/play/_shared/') && !url.pathname.startsWith('/play/_assets/')) return;
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request).then((response) => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, copy)); }
    return response;
  })));
});
