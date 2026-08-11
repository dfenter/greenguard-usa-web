/* sw-template.js - Dune Runner cache manifest. VERSION changes with each ship. */
const SLUG = 'dune-runner';
const VERSION = '2026-08-11-ggracer-1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/dune-runner/',
  '/play/dune-runner/index.html',
  '/play/dune-runner/game.js',
  '/play/dune-runner/tracks/dawn-dune-sea-checkpoint-raid.json',
  '/play/dune-runner/tracks/dawn-dune-sea-arch-sprint.json',
  '/play/dune-runner/tracks/dawn-dune-sea-cinder-salvage.json',
  '/play/dune-runner/tracks/redglass-wash-time-attack.json',
  '/play/dune-runner/tracks/redglass-wash-wreck-raid.json',
  '/play/dune-runner/tracks/white-salt-flat-salvage-run.json',
  '/play/dune-runner/tracks/white-salt-flat-needle-sprint.json',
  '/play/dune-runner/tracks/night-oasis-ring-night-raid.json',
  '/play/dune-runner/tracks/night-oasis-ring-oasis-loop.json',
  '/play/dune-runner/tracks/night-oasis-ring-showcase-raid.json',
  '/play/dune-runner/manifest.json',
  '/play/dune-runner/icon.png',
  '/play/dune-runner/icon512.png',
  '/play/dune-runner/favicon.png',
  '/play/dune-runner/assets/engine.mp3',
  '/play/dune-runner/assets/wind.mp3',
  '/play/dune-runner/assets/sand.mp3',
  '/play/dune-runner/assets/oasis.mp3',
  '/play/dune-runner/assets/low-fuel.mp3',
  '/play/dune-runner/assets/impact.mp3',
  '/play/dune-runner/assets/medal.mp3',
  '/play/dune-runner/assets/air.mp3',
  '/play/dune-runner/assets/land.mp3',
  '/play/dune-runner/assets/menu.mp3',
  '/play/dune-runner/assets/drive.mp3',
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
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  })));
});
