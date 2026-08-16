/* Tide Harbor service worker. Cache-first after the first load. */
const SLUG = 'tide-harbor';
const VERSION = 'aaa-round2-20260816-1-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/tide-harbor/',
  '/play/tide-harbor/index.html',
  '/play/tide-harbor/game.js',
  '/play/tide-harbor/sea.js',
  '/play/tide-harbor/ship.js',
  '/play/tide-harbor/world.js',
  '/play/tide-harbor/fx.js',
  '/play/tide-harbor/economy.js',
  '/play/tide-harbor/bake.js',
  '/play/tide-harbor/manifest.json',
  '/play/tide-harbor/icon.png',
  '/play/tide-harbor/icon512.png',
  '/play/tide-harbor/favicon.png',
  '/play/tide-harbor/assets/boost.mp3',
  '/play/tide-harbor/assets/buy.mp3',
  '/play/tide-harbor/assets/cache.mp3',
  '/play/tide-harbor/assets/creak.mp3',
  '/play/tide-harbor/assets/dock.mp3',
  '/play/tide-harbor/assets/gulls.mp3',
  '/play/tide-harbor/assets/market.mp3',
  '/play/tide-harbor/assets/reef.mp3',
  '/play/tide-harbor/assets/sell.mp3',
  '/play/tide-harbor/assets/storm.mp3',
  '/play/tide-harbor/assets/trim.mp3',
  '/play/tide-harbor/assets/upgrade.mp3',
  '/play/tide-harbor/assets/victory.mp3',
  '/play/tide-harbor/assets/wind.mp3',
  '/play/_shared/ggkit.js',
  '/play/_shared/three/three.module.min.js'
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
