/* Cube Cascade service worker. Generated from /play/_shared/sw-template.js. */
const SLUG = 'cube-cascade';
const VERSION = 'aaa-20260810-6-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/cube-cascade/',
  '/play/cube-cascade/index.html',
  '/play/cube-cascade/game.js',
  '/play/cube-cascade/sw.js',
  '/play/cube-cascade/manifest.json',
  '/play/cube-cascade/icon.png',
  '/play/cube-cascade/icon512.png',
  '/play/cube-cascade/assets/move.mp3',
  '/play/cube-cascade/assets/drop.mp3',
  '/play/cube-cascade/assets/hold.mp3',
  '/play/cube-cascade/assets/match.mp3',
  '/play/cube-cascade/assets/cascade.mp3',
  '/play/cube-cascade/assets/combo.mp3',
  '/play/cube-cascade/assets/warning.mp3',
  '/play/cube-cascade/assets/overflow.mp3',
  '/play/cube-cascade/assets/music-base.mp3',
  '/play/cube-cascade/assets/music-danger.mp3',
  '/play/cube-cascade/favicon.png',
  '/play/cube-cascade/assets/hop.mp3',
  '/play/cube-cascade/assets/light.mp3',
  '/play/cube-cascade/assets/hit.mp3',
  '/play/cube-cascade/assets/clear.mp3',
  '/play/_shared/ggkit.js',
  '/play/_shared/phaser.min.js'
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('gg-' + SLUG + '-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
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
