/* Driftwood Cove service worker. Cache entries are all shipped files. */
const SLUG = 'driftwood-cove';
const VERSION = 'aaa-20260813';
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
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (!url.pathname.startsWith('/play/driftwood-cove/') && !url.pathname.startsWith('/play/_shared/')) return;
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    }
    return response;
  })));
});
