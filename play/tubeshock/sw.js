/* sw.js — authored from /play/_shared/sw-template.js.
 * Offline-after-first-load per the UX/PWA gate. Cache-first for same-origin
 * GETs under /play/tubeshock/ and /play/_shared/; network passthrough otherwise.
 * Bump VERSION on every deploy of the game to invalidate stale caches.
 *
 * ASSETS lists ONLY files that exist in this directory. Tubeshock generates
 * every sprite and every audio cue procedurally at boot, so there is no
 * assets/ directory to precache and no missing entry can fail addAll().
 */
const SLUG = 'tubeshock';
const VERSION = '2026-08-10-ui-declutter-1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/tubeshock/',
  '/play/tubeshock/index.html',
  '/play/tubeshock/ts_data.js',
  '/play/tubeshock/game.js',
  '/play/tubeshock/manifest.json',
  '/play/tubeshock/icon.png',
  '/play/tubeshock/icon512.png',
  '/play/tubeshock/favicon.ico',
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
