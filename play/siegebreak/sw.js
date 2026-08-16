/* Siegebreak offline shell. Generated from /play/_shared/sw-template.js. */
const SLUG = 'siegebreak';
const VERSION = '2026-08-10-r4-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/siegebreak/',
  '/play/siegebreak/index.html',
  '/play/siegebreak/game.js',
  '/play/siegebreak/manifest.json',
  '/play/siegebreak/icon.png',
  '/play/siegebreak/icon512.png',
  '/play/siegebreak/favicon.png',
  '/play/siegebreak/assets/steel.m4a',
  '/play/siegebreak/assets/horn.m4a',
  '/play/siegebreak/assets/oil.m4a',
  '/play/siegebreak/assets/drum.m4a',
  '/play/siegebreak/assets/impact.m4a',
  '/play/siegebreak/assets/kick.m4a',
  '/play/siegebreak/assets/sweep.m4a',
  '/play/siegebreak/assets/ladder.m4a',
  '/play/siegebreak/assets/rope.m4a',
  '/play/siegebreak/assets/ram.m4a',
  '/play/siegebreak/assets/tower.m4a',
  '/play/siegebreak/assets/rally.m4a',
  '/play/siegebreak/assets/march.m4a',
  '/play/siegebreak/assets/danger.m4a',
  '/play/siegebreak/assets/victory.m4a',
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
