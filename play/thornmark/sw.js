/* Thornmark service worker, derived from /play/_shared/sw-template.js.
 * Offline-after-first-load per the UX/PWA gate. Cache-first for same-origin
 * GETs under /play/<slug>/ and /play/_shared/; network passthrough otherwise.
 * Bump VERSION on every deploy of the game to invalidate stale caches.
 */
const SLUG = 'thornmark';
const VERSION = 'aaa-2026-08-13-v1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/thornmark/',
  '/play/thornmark/index.html',
  '/play/thornmark/styles.css',
  '/play/thornmark/game.js',
  '/play/thornmark/manifest.json',
  '/play/thornmark/LICENSES.md',
  '/play/thornmark/icon.png',
  '/play/thornmark/icon512.png',
  '/play/thornmark/favicon.png',
  '/play/thornmark/assets/music-keep.mp3',
  '/play/thornmark/assets/music-undercroft.mp3',
  '/play/thornmark/assets/music-wilds.mp3',
  '/play/thornmark/assets/sfx-arc.mp3',
  '/play/thornmark/assets/sfx-bind.mp3',
  '/play/thornmark/assets/sfx-boss.mp3',
  '/play/thornmark/assets/sfx-burst.mp3',
  '/play/thornmark/assets/sfx-cast.mp3',
  '/play/thornmark/assets/sfx-crit.mp3',
  '/play/thornmark/assets/sfx-dodge.mp3',
  '/play/thornmark/assets/sfx-enhance-fail.mp3',
  '/play/thornmark/assets/sfx-enhance-ok.mp3',
  '/play/thornmark/assets/sfx-hit.mp3',
  '/play/thornmark/assets/sfx-hurt.mp3',
  '/play/thornmark/assets/sfx-levelup.mp3',
  '/play/thornmark/assets/sfx-loot.mp3',
  '/play/thornmark/assets/sfx-quest.mp3',
  '/play/thornmark/assets/sfx-swing.mp3',
  '/play/thornmark/assets/sfx-telegraph.mp3',
  '/play/thornmark/assets/sfx-ui.mp3',
  '/play/_shared/ggkit.js',
  '/play/_shared/phaser.min.js'
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
