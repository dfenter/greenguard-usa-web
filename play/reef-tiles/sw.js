/* Versioned cache for Reef Tiles. Keep ASSETS limited to files that ship. */
const SLUG = 'reef-tiles';
const VERSION = 'aaa-2026-08-11-v2-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/reef-tiles/',
  '/play/reef-tiles/index.html',
  '/play/reef-tiles/game.js',
  '/play/reef-tiles/manifest.json',
  '/play/reef-tiles/icon.png',
  '/play/reef-tiles/icon512.png',
  '/play/reef-tiles/favicon.png',
  '/play/reef-tiles/assets/reef-ambience.mp3',
  '/play/reef-tiles/assets/swap.mp3',
  '/play/reef-tiles/assets/match.mp3',
  '/play/reef-tiles/assets/cascade.mp3',
  '/play/reef-tiles/assets/feed.mp3',
  '/play/reef-tiles/assets/ui.mp3',
  '/play/reef-tiles/assets/reward.mp3',
  '/play/reef-tiles/assets/unlock.mp3',
  '/play/reef-tiles/assets/invalid.mp3',
  '/play/reef-tiles/assets/reef-meta.mp3',
  '/play/_shared/ggkit.js',
  '/play/_shared/phaser.min.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (key) { return key.indexOf('gg-' + SLUG + '-') === 0 && key !== CACHE; }).map(function (key) { return caches.delete(key); })); }).then(function () { return self.clients.claim(); }));
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
