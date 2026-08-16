/* Verge Protocol service worker. Derived from /play/_shared/sw-template.js. */
const SLUG = 'verge-protocol';
const VERSION = 'aaa-20260813-1-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/verge-protocol/',
  '/play/verge-protocol/index.html',
  '/play/verge-protocol/content.js',
  '/play/verge-protocol/game.js',
  '/play/verge-protocol/manifest.json',
  '/play/verge-protocol/icon.png',
  '/play/verge-protocol/icon512.png',
  '/play/verge-protocol/favicon.ico',
  '/play/verge-protocol/assets/audio/select.mp3',
  '/play/verge-protocol/assets/audio/place.mp3',
  '/play/verge-protocol/assets/audio/upgrade.mp3',
  '/play/verge-protocol/assets/audio/cancel.mp3',
  '/play/verge-protocol/assets/audio/fire.mp3',
  '/play/verge-protocol/assets/audio/hit.mp3',
  '/play/verge-protocol/assets/audio/kill.mp3',
  '/play/verge-protocol/assets/audio/breach.mp3',
  '/play/verge-protocol/assets/audio/ability.mp3',
  '/play/verge-protocol/assets/audio/warning.mp3',
  '/play/verge-protocol/assets/audio/wave-clear.mp3',
  '/play/verge-protocol/assets/audio/victory.mp3',
  '/play/verge-protocol/assets/audio/defeat.mp3',
  '/play/verge-protocol/assets/audio/music-bed.mp3',
  '/play/verge-protocol/assets/audio/music-danger.mp3',
  '/play/verge-protocol/assets/audio/music-base.mp3',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) {
      return k.indexOf('gg-' + SLUG + '-') === 0 && k !== CACHE;
    }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
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
