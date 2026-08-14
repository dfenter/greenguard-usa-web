/* Versioned cache for Reef Tiles. Keep ASSETS limited to files that ship. */
const SLUG = 'reef-tiles';
const VERSION = 'aaa-2026-08-11-v2';
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
self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.indexOf('/play/reef-tiles/') !== 0 && url.pathname.indexOf('/play/_shared/') !== 0) return;
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then(function (hit) { return hit || fetch(event.request).then(function (response) { if (response.ok) { var copy = response.clone(); caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); }); } return response; }); }));
});
