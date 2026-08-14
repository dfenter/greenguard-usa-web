/* sw.js - authored from /play/_shared/sw-template.js.
 * Offline-after-first-load per the UX/PWA gate. Cache-first for same-origin
 * GETs under /play/breach-brick/ and /play/_shared/; network passthrough
 * otherwise. Bump VERSION on every deploy of the game.
 *
 * ASSETS lists ONLY files that actually exist on disk in this directory. A
 * precache entry for a missing file rejects addAll and leaves the whole title
 * uncached, which is a shipped defect class in this fleet. This title has no
 * assets/ directory: all art and all audio are generated at runtime.
 */
const SLUG = 'breach-brick';
const VERSION = '2026-08-10-aaa-r3';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/breach-brick/',
  '/play/breach-brick/index.html',
  '/play/breach-brick/game.js',
  '/play/breach-brick/bb_data.js',
  '/play/breach-brick/bb_audio.js',
  '/play/breach-brick/manifest.json',
  '/play/breach-brick/icon.png',
  '/play/breach-brick/icon512.png',
  '/play/breach-brick/favicon.ico',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('gg-' + SLUG + '-') && k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (!url.pathname.startsWith('/play/' + SLUG + '/') && !url.pathname.startsWith('/play/_shared/') && !url.pathname.startsWith('/play/_assets/')) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) =>
      hit ||
      fetch(e.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
    )
  );
});
