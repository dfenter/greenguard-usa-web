/* sw.js generated from /play/_shared/sw-template.js. */
const SLUG = 'galecrests';
const VERSION = 'aaa-f15-20260813-1-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/galecrests/',
  '/play/galecrests/index.html',
  '/play/galecrests/game.js',
  '/play/galecrests/manifest.json',
  '/play/galecrests/NOTES.md',
  '/play/galecrests/LICENSES.md',
  '/play/galecrests/icon.png',
  '/play/galecrests/icon512.png',
  '/play/galecrests/favicon.png',
  '/play/galecrests/assets/theme.mp3',
  '/play/galecrests/assets/race.mp3',
  '/play/galecrests/assets/cup.mp3',
  '/play/galecrests/assets/tap.mp3',
  '/play/galecrests/assets/train.mp3',
  '/play/galecrests/assets/strain.mp3',
  '/play/galecrests/assets/rest.mp3',
  '/play/galecrests/assets/bond.mp3',
  '/play/galecrests/assets/gate.mp3',
  '/play/galecrests/assets/call_good.mp3',
  '/play/galecrests/assets/call_late.mp3',
  '/play/galecrests/assets/surge.mp3',
  '/play/galecrests/assets/block.mp3',
  '/play/galecrests/assets/wall.mp3',
  '/play/galecrests/assets/win.mp3',
  '/play/galecrests/assets/lose.mp3',
  '/play/galecrests/assets/unlock.mp3',
  '/play/galecrests/assets/legacy.mp3',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return cache.addAll(ASSETS);
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) {
      return key.indexOf('gg-' + SLUG + '-') === 0 && key !== CACHE;
    }).map(function (key) { return caches.delete(key); }));
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
