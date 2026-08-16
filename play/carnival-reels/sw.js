/* sw.js generated from /play/_shared/sw-template.js. */
const SLUG = 'carnival-reels';
const VERSION = 'aaa-f16-20260813-1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/carnival-reels/',
  '/play/carnival-reels/index.html',
  '/play/carnival-reels/styles.css',
  '/play/carnival-reels/machines.js',
  '/play/carnival-reels/meta.js',
  '/play/carnival-reels/art.js',
  '/play/carnival-reels/game.js',
  '/play/carnival-reels/manifest.json',
  '/play/carnival-reels/icon.png',
  '/play/carnival-reels/icon512.png',
  '/play/carnival-reels/favicon.png',
  '/play/carnival-reels/assets/mus_menu.mp3',
  '/play/carnival-reels/assets/mus_parlour.mp3',
  '/play/carnival-reels/assets/mus_feature.mp3',
  '/play/carnival-reels/assets/mus_finale.mp3',
  '/play/carnival-reels/assets/sfx_tap.mp3',
  '/play/carnival-reels/assets/sfx_spin_start.mp3',
  '/play/carnival-reels/assets/sfx_reel_stop.mp3',
  '/play/carnival-reels/assets/sfx_near_miss.mp3',
  '/play/carnival-reels/assets/sfx_win_small.mp3',
  '/play/carnival-reels/assets/sfx_win_mid.mp3',
  '/play/carnival-reels/assets/sfx_win_big.mp3',
  '/play/carnival-reels/assets/sfx_coin_lock.mp3',
  '/play/carnival-reels/assets/sfx_cascade_pop.mp3',
  '/play/carnival-reels/assets/sfx_wheel_tick.mp3',
  '/play/carnival-reels/assets/sfx_wheel_stop.mp3',
  '/play/carnival-reels/assets/sfx_level_up.mp3',
  '/play/carnival-reels/assets/sfx_collect.mp3',
  '/play/carnival-reels/assets/sfx_denied.mp3',
  '/play/carnival-reels/assets/sfx_toss.mp3',
  '/play/carnival-reels/assets/sfx_fanfare.mp3',
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
    return Promise.all(keys.filter(function (k) {
      return k.indexOf('gg-' + SLUG + '-') === 0 && k !== CACHE;
    }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (event) {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.indexOf('/play/' + SLUG + '/') !== 0 &&
      url.pathname.indexOf('/play/_shared/') !== 0 &&
      url.pathname.indexOf('/play/_assets/') !== 0) return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(function (hit) {
      return hit || fetch(event.request).then(function (res) {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(event.request, copy); });
        }
        return res;
      });
    })
  );
});
