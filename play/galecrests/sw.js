/* sw.js generated from /play/_shared/sw-template.js. */
const SLUG = 'galecrests';
const VERSION = 'aaa-f15-20260813-1';
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
