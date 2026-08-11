/* Ionwake service worker, authored from /play/_shared/sw-template.js. */
const SLUG = 'ionwake';
const VERSION = '3';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/ionwake/',
  '/play/ionwake/index.html',
  '/play/ionwake/game.js',
  '/play/ionwake/machines.js',
  '/play/ionwake/audio.js',
  '/play/ionwake/manifest.json',
  '/play/ionwake/icon.svg',
  '/play/ionwake/favicon.svg',
  '/play/ionwake/tracks/voltspire.json',
  '/play/ionwake/tracks/cinder-highroad.json',
  '/play/ionwake/tracks/mirror-orbit.json',
  '/play/ionwake/tracks/neon-artery.json',
  '/play/ionwake/tracks/suncut-switchbacks.json',
  '/play/ionwake/tracks/halo-dive.json',
  '/play/ionwake/tracks/blackline-crest.json',
  '/play/ionwake/tracks/ion-reef.json',
  '/play/ionwake/tracks/last-light-ring.json',
  '/play/_shared/ggkit.js',
  '/play/_shared/three/three.module.min.js',
  '/play/_shared/racer/engine.js',
  '/play/_shared/racer/track.js',
  '/play/_shared/racer/env.js',
  '/play/_shared/racer/carkit.js',
  '/play/_shared/racer/fx.js'
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('gg-' + SLUG + '-') && key !== CACHE).map((key) => caches.delete(key))
  )).then(() => self.clients.claim()));
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
