/* Steamline service worker, authored from /play/_shared/sw-template.js. */
const SLUG = 'steamline';
const VERSION = 'aaa-f2-20260810-3-2026-08-16-offline-fix';
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
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const ROOT = '/play/' + SLUG;
  // The deployed site serves the title at the NO-TRAILING-SLASH url and
  // 308-redirects the slash form onto it. The old scope test required
  // ROOT + '/', so the canonical navigation was never in scope, the worker
  // never answered it, and offline died on EVERY title in the fleet while
  // still reporting a registered service worker. Accept both forms.
  const inScope = url.pathname === ROOT || url.pathname.startsWith(ROOT + '/')
    || url.pathname.startsWith('/play/_shared/') || url.pathname.startsWith('/play/_assets/');
  if (!inScope) return;
  const isRoot = url.pathname === ROOT || url.pathname === ROOT + '/';
  const INDEX = ROOT + '/index.html';
  e.respondWith(
    caches.match(isRoot ? INDEX : e.request, { ignoreSearch: true })
      .then((hit) => hit || caches.match(e.request, { ignoreSearch: true }))
      .then((hit) =>
        hit ||
        fetch(e.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        }).catch(() =>
          e.request.mode === 'navigate' ? caches.match(INDEX) : Promise.reject(new Error('offline'))
        )
      )
  );
});
