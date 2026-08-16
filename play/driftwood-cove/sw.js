/* Driftwood Cove service worker. Cache entries are all shipped files. */
const SLUG = 'driftwood-cove';
const VERSION = 'aaa-20260813-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/driftwood-cove/',
  '/play/driftwood-cove/index.html',
  '/play/driftwood-cove/game.js',
  '/play/driftwood-cove/sw.js',
  '/play/driftwood-cove/manifest.json',
  '/play/driftwood-cove/LICENSES.md',
  '/play/driftwood-cove/icon.png',
  '/play/driftwood-cove/icon512.png',
  '/play/driftwood-cove/favicon.png',
  '/play/driftwood-cove/assets/ui.mp3',
  '/play/driftwood-cove/assets/pick.mp3',
  '/play/driftwood-cove/assets/drop.mp3',
  '/play/driftwood-cove/assets/invalid.mp3',
  '/play/driftwood-cove/assets/merge.mp3',
  '/play/driftwood-cove/assets/mergebig.mp3',
  '/play/driftwood-cove/assets/chain.mp3',
  '/play/driftwood-cove/assets/spawn.mp3',
  '/play/driftwood-cove/assets/bubble.mp3',
  '/play/driftwood-cove/assets/order.mp3',
  '/play/driftwood-cove/assets/chapter.mp3',
  '/play/driftwood-cove/assets/fanfare.mp3',
  '/play/driftwood-cove/assets/cove.mp3',
  '/play/driftwood-cove/assets/deep.mp3',
  '/play/driftwood-cove/assets/storm.mp3',
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
