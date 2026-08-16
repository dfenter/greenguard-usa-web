/* sw.js - Kart Circuit Zero, authored from /play/_shared/sw-template.js. */
const SLUG = 'kart-circuit-zero';
const VERSION = 'aaa-f2-8-ggracer-2026-08-16-offline-fix';
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
