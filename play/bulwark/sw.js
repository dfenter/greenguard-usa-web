/* Bulwark service worker. Derived from /play/_shared/sw-template.js. */
const SLUG = 'bulwark';
const VERSION = 'aaa-20260810-3';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/bulwark/',
  '/play/bulwark/index.html',
  '/play/bulwark/engine.js',
  '/play/bulwark/game.js',
  '/play/bulwark/manifest.json',
  '/play/bulwark/icon.png',
  '/play/bulwark/icon512.png',
  '/play/bulwark/favicon.ico',
  '/play/bulwark/assets/audio/build.mp3',
  '/play/bulwark/assets/audio/select.mp3',
  '/play/bulwark/assets/audio/fire.mp3',
  '/play/bulwark/assets/audio/hit.mp3',
  '/play/bulwark/assets/audio/leak.mp3',
  '/play/bulwark/assets/audio/wave-clear.mp3',
  '/play/bulwark/assets/audio/boss.mp3',
  '/play/bulwark/assets/audio/victory.mp3',
  '/play/bulwark/assets/audio/ambient.mp3',
  '/play/bulwark/assets/audio/danger.mp3',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js'
];
self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) { return key.indexOf('gg-' + SLUG + '-') === 0 && key !== CACHE; }).map(function (key) { return caches.delete(key); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.indexOf('/play/bulwark/') !== 0 && url.pathname.indexOf('/play/_shared/') !== 0) return;
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then(function (hit) {
    return hit || fetch(event.request).then(function (response) {
      if (response.ok) { var copy = response.clone(); caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); }); }
      return response;
    });
  }));
});
