/* sw.js generated from /play/_shared/sw-template.js. */
const SLUG = 'vault-raiders';
const VERSION = 'aaa-f3-20260810-2';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/vault-raiders/',
  '/play/vault-raiders/index.html',
  '/play/vault-raiders/styles.css',
  '/play/vault-raiders/game.js',
  '/play/vault-raiders/manifest.json',
  '/play/vault-raiders/icon.png',
  '/play/vault-raiders/icon512.png',
  '/play/vault-raiders/favicon.png',
  '/play/vault-raiders/assets/tap.mp3',
  '/play/vault-raiders/assets/reel_spin.mp3',
  '/play/vault-raiders/assets/coin_payout.mp3',
  '/play/vault-raiders/assets/dig_reveal.mp3',
  '/play/vault-raiders/assets/ladder_fanfare.mp3',
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
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then(function (hit) {
    return hit || fetch(event.request).then(function (response) {
      if (response.ok) {
        var copy = response.clone();
        caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); });
      }
      return response;
    });
  }));
});
