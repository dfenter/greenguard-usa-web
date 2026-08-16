/* sw.js generated from /play/_shared/sw-template.js. */
const SLUG = 'meridian-row';
const VERSION = 'aaa-f3-20260811-2-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/meridian-row/',
  '/play/meridian-row/index.html',
  '/play/meridian-row/game.js',
  '/play/meridian-row/manifest.json',
  '/play/meridian-row/NOTES.md',
  '/play/meridian-row/LICENSES.md',
  '/play/meridian-row/icon.png',
  '/play/meridian-row/icon512.png',
  '/play/meridian-row/favicon.png',
  '/play/meridian-row/assets/tap.mp3',
  '/play/meridian-row/assets/dice_roll.mp3',
  '/play/meridian-row/assets/coin_collect.mp3',
  '/play/meridian-row/assets/sticker_reveal.mp3',
  '/play/meridian-row/assets/spire_fanfare.mp3',
  '/play/meridian-row/assets/build.mp3',
  '/play/meridian-row/assets/block.mp3',
  '/play/meridian-row/assets/heist.mp3',
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
