/* apexdrift service worker. Cache only files that ship with this title. */
const SLUG = 'apexdrift';
const VERSION = '2026-08-11-a-2026-08-16-offline-fix';
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
