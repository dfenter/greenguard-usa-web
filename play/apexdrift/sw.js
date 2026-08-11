/* apexdrift service worker. Cache only files that ship with this title. */
const SLUG = 'apexdrift';
const VERSION = '2026-08-11-a';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/apexdrift/',
  '/play/apexdrift/index.html',
  '/play/apexdrift/game.js',
  '/play/apexdrift/manifest.json',
  '/play/apexdrift/icon-192.svg',
  '/play/apexdrift/icon-512.svg',
  '/play/apexdrift/favicon.svg',
  '/play/apexdrift/tracks/tideglass-180.json',
  '/play/apexdrift/tracks/sunline-causeway.json',
  '/play/apexdrift/tracks/harbor-rise.json',
  '/play/apexdrift/tracks/cobalt-switchback.json',
  '/play/apexdrift/tracks/summit-run.json',
  '/play/apexdrift/tracks/cliffside-needle.json',
  '/play/apexdrift/tracks/neon-overpass.json',
  '/play/apexdrift/tracks/metro-spiral.json',
  '/play/apexdrift/tracks/midnight-boulevard.json',
  '/play/apexdrift/audio/menu.mp3',
  '/play/apexdrift/audio/drive-a.mp3',
  '/play/apexdrift/audio/drive-b.mp3',
  '/play/apexdrift/audio/countdown.mp3',
  '/play/apexdrift/audio/drift-start.mp3',
  '/play/apexdrift/audio/drift.mp3',
  '/play/apexdrift/audio/clean-exit.mp3',
  '/play/apexdrift/audio/nitro.mp3',
  '/play/apexdrift/audio/pickup.mp3',
  '/play/apexdrift/audio/charge.mp3',
  '/play/apexdrift/audio/wall-tap.mp3',
  '/play/apexdrift/audio/lap.mp3',
  '/play/apexdrift/audio/finish.mp3',
  '/play/apexdrift/audio/podium.mp3',
  '/play/_shared/ggkit.js',
  '/play/_shared/three/three.module.min.js',
  '/play/_shared/racer/engine.js',
  '/play/_shared/racer/track.js',
  '/play/_shared/racer/env.js',
  '/play/_shared/racer/carkit.js',
  '/play/_shared/racer/fx.js',
  '/play/_assets/GGRACER_SPEC.md',
  '/play/_assets/ART_vehicle3d.md',
  '/play/_assets/UI_LAW.md'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('gg-' + SLUG + '-') && key !== CACHE).map((key) => caches.delete(key)),
    )).then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (!url.pathname.startsWith('/play/apexdrift/') && !url.pathname.startsWith('/play/_shared/') && !url.pathname.startsWith('/play/_assets/')) return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
      return response;
    })),
  );
});
