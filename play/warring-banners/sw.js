/* Warring Banners service worker. Derived from /play/_shared/sw-template.js. */
const SLUG = 'warring-banners';
const VERSION = 'aaa-20260813-1-2026-08-16-offline-fix';
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
