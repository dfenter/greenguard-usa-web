/* Aftergate service worker - authored from /play/_shared/sw-template.js.
 * Offline-after-first-load. Cache-first for same-origin GETs under
 * /play/aftergate/ and /play/_shared/; network passthrough otherwise.
 * Bump VERSION on every deploy. Precache lists ONLY files that exist.
 */
const SLUG = 'aftergate';
const VERSION = '2026-08-11-aaa-fix1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/aftergate/',
  '/play/aftergate/index.html',
  '/play/aftergate/ag_data.js',
  '/play/aftergate/ag_art.js',
  '/play/aftergate/ag_ui.js',
  '/play/aftergate/ag_run.js',
  '/play/aftergate/ag_base.js',
  '/play/aftergate/game.js',
  '/play/aftergate/manifest.json',
  '/play/aftergate/icon.png',
  '/play/aftergate/icon512.png',
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
