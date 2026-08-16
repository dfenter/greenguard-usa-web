/* Verge Protocol service worker. Derived from /play/_shared/sw-template.js. */
const SLUG = 'verge-protocol';
const VERSION = 'aaa-20260813-1';
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
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.indexOf('/play/' + SLUG + '/') !== 0 && url.pathname.indexOf('/play/_shared/') !== 0) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
    return hit || fetch(e.request).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); }
      return res;
    });
  }));
});
