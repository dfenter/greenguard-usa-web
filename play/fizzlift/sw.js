/* Authored from /play/_shared/sw-template.js.
 * Offline-after-first-load per the UX/PWA gate. Cache-first for same-origin
 * GETs under /play/fizzlift/ and /play/_shared/; network passthrough otherwise.
 * ASSETS lists only files that actually exist: one 404 fails the whole
 * addAll() and the install never completes.
 * Bump VERSION on every deploy of the game to invalidate stale caches.
 */
const SLUG = 'fizzlift';
const VERSION = '2026-08-11-aaa-fix-round-1-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/fizzlift/',
  '/play/fizzlift/index.html',
  '/play/fizzlift/manifest.json',
  '/play/fizzlift/icon.png',
  '/play/fizzlift/icon512.png',
  '/play/fizzlift/favicon.png',
  '/play/fizzlift/js/core.js',
  '/play/fizzlift/js/data.js',
  '/play/fizzlift/js/board.js',
  '/play/fizzlift/js/art.js',
  '/play/fizzlift/js/game.js',
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
