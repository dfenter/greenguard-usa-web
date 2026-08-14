/* sw.js generated from /play/_shared/sw-template.js. */
const SLUG = 'meridian-row';
const VERSION = 'aaa-f3-20260811-2';
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
self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.indexOf('/play/' + SLUG + '/') !== 0 && url.pathname.indexOf('/play/_shared/') !== 0) return;
  event.respondWith(caches.match(event.request, {ignoreSearch: true}).then(function (hit) {
    return hit || fetch(event.request).then(function (response) {
      if (response.ok) {
        var copy = response.clone();
        caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); });
      }
      return response;
    });
  }));
});
