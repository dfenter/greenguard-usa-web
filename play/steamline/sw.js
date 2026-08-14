/* Steamline service worker, authored from /play/_shared/sw-template.js. */
const SLUG = 'steamline';
const VERSION = 'aaa-f2-20260810-3';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/steamline/',
  '/play/steamline/index.html',
  '/play/steamline/game.js',
  '/play/steamline/rail.js',
  '/play/steamline/manifest.json',
  '/play/steamline/icon.png',
  '/play/steamline/icon512.png',
  '/play/steamline/favicon.png',
  '/play/steamline/assets/train_states.svg',
  '/play/steamline/assets/station_states.svg',
  '/play/steamline/assets/yard_tile.svg',
  '/play/steamline/assets/music_route.mp3',
  '/play/steamline/assets/music_danger.mp3',
  '/play/steamline/assets/sfx_steam_chug.mp3',
  '/play/steamline/assets/sfx_whistle.mp3',
  '/play/steamline/assets/sfx_station_bell.mp3',
  '/play/steamline/assets/sfx_crowd_murmur.mp3',
  '/play/steamline/assets/sfx_danger.mp3',
  '/play/steamline/assets/sfx_miss.mp3',
  '/play/steamline/assets/sfx_pickup.mp3',
  '/play/steamline/assets/sfx_ui_select.mp3',
  '/play/steamline/assets/sfx_switch_throw.mp3',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('gg-' + SLUG + '-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.indexOf('/play/' + SLUG + '/') !== 0 && url.pathname.indexOf('/play/_shared/') !== 0 && url.pathname.indexOf('/play/_assets/') !== 0) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
    return hit || fetch(e.request).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); }
      return res;
    });
  }));
});
