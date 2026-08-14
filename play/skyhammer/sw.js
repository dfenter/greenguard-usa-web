/* sw-template.js - copy to /play/<slug>/sw.js and fill SLUG, VERSION, ASSETS.
 * Offline-after-first-load per the UX/PWA gate. Cache-first for same-origin
 * GETs under /play/<slug>/ and /play/_shared/; network passthrough otherwise.
 * Bump VERSION on every deploy of the game to invalidate stale caches.
 *
 * ASSETS lists ONLY files that actually exist on disk. A precache entry for a
 * missing file makes addAll reject and the whole install fail, which silently
 * leaves the title with no offline mode at all.
 */
const SLUG = 'skyhammer';
const VERSION = '2026-08-10-ui-declutter';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/skyhammer/',
  '/play/skyhammer/index.html',
  '/play/skyhammer/game.js',
  '/play/skyhammer/sh_art.js',
  '/play/skyhammer/sh_content.js',
  '/play/skyhammer/manifest.json',
  '/play/skyhammer/icon.png',
  '/play/skyhammer/icon512.png',
  '/play/skyhammer/favicon.png',
  '/play/skyhammer/favicon.ico',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js',
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
