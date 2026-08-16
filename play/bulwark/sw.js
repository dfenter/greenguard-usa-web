/* Bulwark service worker. Derived from /play/_shared/sw-template.js. */
const SLUG = 'bulwark';
const VERSION = 'aaa-20260810-3-2026-08-16-offline-fix-2026-08-16-gate-repair';
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
