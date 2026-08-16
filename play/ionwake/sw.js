/* Ionwake service worker, authored from /play/_shared/sw-template.js. */
const SLUG = 'ionwake';
const VERSION = '3-2026-08-16-offline-fix';
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
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const ROOT = '/play/' + SLUG;
  // The deployed site serves the title at the NO-TRAILING-SLASH url and
  // 308-redirects the slash form onto it. The old scope test required
  // ROOT + '/', so the canonical navigation was never in scope, the worker
  // never answered it, and offline died on EVERY title in the fleet while
  // still reporting a registered service worker. Accept both forms.
  const inScope = url.pathname === ROOT || url.pathname.startsWith(ROOT + '/')
    || url.pathname.startsWith('/play/_shared/') || url.pathname.startsWith('/play/_assets/');
  if (!inScope) return;
  const isRoot = url.pathname === ROOT || url.pathname === ROOT + '/';
  const INDEX = ROOT + '/index.html';
  e.respondWith(
    caches.match(isRoot ? INDEX : e.request, { ignoreSearch: true })
      .then((hit) => hit || caches.match(e.request, { ignoreSearch: true }))
      .then((hit) =>
        hit ||
        fetch(e.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        }).catch(() =>
          e.request.mode === 'navigate' ? caches.match(INDEX) : Promise.reject(new Error('offline'))
        )
      )
  );
});
