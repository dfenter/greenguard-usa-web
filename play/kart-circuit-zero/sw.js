/* sw.js - Kart Circuit Zero, authored from /play/_shared/sw-template.js. */
const SLUG = 'kart-circuit-zero';
const VERSION = 'aaa-f2-8-ggracer';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/kart-circuit-zero/',
  '/play/kart-circuit-zero/index.html',
  '/play/kart-circuit-zero/game.js',
  '/play/kart-circuit-zero/tracks/coastline-sprint.json',
  '/play/kart-circuit-zero/tracks/canyon-switchbacks.json',
  '/play/kart-circuit-zero/tracks/neon-night-loop.json',
  '/play/kart-circuit-zero/tracks/circuit-zero.json',
  '/play/kart-circuit-zero/manifest.json',
  '/play/kart-circuit-zero/LICENSES.md',
  '/play/kart-circuit-zero/icon.png',
  '/play/kart-circuit-zero/icon512.png',
  '/play/kart-circuit-zero/favicon.png',
  '/play/kart-circuit-zero/icon.svg',
  '/play/kart-circuit-zero/assets/audio/engine.mp3',
  '/play/kart-circuit-zero/assets/audio/menu.mp3',
  '/play/kart-circuit-zero/assets/audio/collision.mp3',
  '/play/kart-circuit-zero/assets/audio/drift.mp3',
  '/play/kart-circuit-zero/assets/audio/boost.mp3',
  '/play/kart-circuit-zero/assets/audio/checkpoint.mp3',
  '/play/kart-circuit-zero/assets/audio/ui.mp3',
  '/play/kart-circuit-zero/assets/audio/clear.mp3',
  '/play/_shared/ggkit.js',
  '/play/_shared/three/three.module.min.js',
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
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  })));
});
