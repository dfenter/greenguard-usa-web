/* Warring Banners service worker. Derived from /play/_shared/sw-template.js. */
const SLUG = 'warring-banners';
const VERSION = 'aaa-20260813-1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/warring-banners/',
  '/play/warring-banners/index.html',
  '/play/warring-banners/engine.js',
  '/play/warring-banners/art.js',
  '/play/warring-banners/game.js',
  '/play/warring-banners/manifest.json',
  '/play/warring-banners/icon.png',
  '/play/warring-banners/icon512.png',
  '/play/warring-banners/favicon.ico',
  '/play/warring-banners/assets/audio/arrow.mp3',
  '/play/warring-banners/assets/audio/attack.mp3',
  '/play/warring-banners/assets/audio/cancel.mp3',
  '/play/warring-banners/assets/audio/card.mp3',
  '/play/warring-banners/assets/audio/claim.mp3',
  '/play/warring-banners/assets/audio/defeat.mp3',
  '/play/warring-banners/assets/audio/endturn.mp3',
  '/play/warring-banners/assets/audio/heal.mp3',
  '/play/warring-banners/assets/audio/hit.mp3',
  '/play/warring-banners/assets/audio/kill.mp3',
  '/play/warring-banners/assets/audio/move.mp3',
  '/play/warring-banners/assets/audio/music-battle.mp3',
  '/play/warring-banners/assets/audio/music-campaign.mp3',
  '/play/warring-banners/assets/audio/music-siege.mp3',
  '/play/warring-banners/assets/audio/select.mp3',
  '/play/warring-banners/assets/audio/victory.mp3',
  '/play/warring-banners/assets/audio/warn.mp3',
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
  if (url.pathname.indexOf('/play/warring-banners/') !== 0 && url.pathname.indexOf('/play/_shared/') !== 0) return;
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then(function (hit) {
    return hit || fetch(event.request).then(function (response) {
      if (response.ok) { var copy = response.clone(); caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); }); }
      return response;
    });
  }));
});
