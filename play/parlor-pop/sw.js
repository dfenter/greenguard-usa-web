/* Parlor Pop offline cache. Keep this list limited to files that exist. */
const SLUG = 'parlor-pop';
const VERSION = '2026.08.10.5';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/parlor-pop/',
  '/play/parlor-pop/index.html',
  '/play/parlor-pop/manifest.json',
  '/play/parlor-pop/favicon.png',
  '/play/parlor-pop/icon.png',
  '/play/parlor-pop/icon512.png',
  '/play/parlor-pop/levels.js',
  '/play/parlor-pop/engine.js',
  '/play/parlor-pop/meta.js',
  '/play/parlor-pop/audio.js',
  '/play/parlor-pop/game.js',
  '/play/parlor-pop/assets/swap_tick.mp3',
  '/play/parlor-pop/assets/invalid_move.mp3',
  '/play/parlor-pop/assets/match_pop.mp3',
  '/play/parlor-pop/assets/crate_smash.mp3',
  '/play/parlor-pop/assets/ivy_threat.mp3',
  '/play/parlor-pop/assets/booster_payoff.mp3',
  '/play/parlor-pop/assets/goal_clear.mp3',
  '/play/parlor-pop/assets/room_reveal.mp3',
  '/play/parlor-pop/assets/ui_click.mp3',
  '/play/parlor-pop/assets/room_theme.mp3',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js'
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
  if (url.pathname.indexOf('/play/' + SLUG + '/') !== 0 && url.pathname.indexOf('/play/_shared/') !== 0) return;
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then(function (hit) {
    return hit || fetch(event.request).then(function (response) {
      if (response.ok) caches.open(CACHE).then(function (cache) { cache.put(event.request, response.clone()); });
      return response;
    });
  }));
});
