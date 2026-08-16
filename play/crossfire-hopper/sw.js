/* sw-template.js: copy to /play/<slug>/sw.js and fill SLUG, VERSION, ASSETS.
 * Offline-after-first-load per the UX/PWA gate. Cache-first for same-origin
 * GETs under /play/<slug>/ and /play/_shared/; network passthrough otherwise.
 * Bump VERSION on every deploy of the game to invalidate stale caches.
 */
const SLUG = 'crossfire-hopper';
const VERSION = '2026-08-10-aaa-r3-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/crossfire-hopper/',
  '/play/crossfire-hopper/index.html',
  '/play/crossfire-hopper/game.js',
  '/play/crossfire-hopper/ch_data.js',
  '/play/crossfire-hopper/manifest.json',
  '/play/crossfire-hopper/icon.png',
  '/play/crossfire-hopper/icon512.png',
  '/play/crossfire-hopper/favicon.png',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js',
  '/play/crossfire-hopper/assets/music_calm.mp3',
  '/play/crossfire-hopper/assets/music_storm.mp3',
  '/play/crossfire-hopper/assets/sfx_banner.mp3',
  '/play/crossfire-hopper/assets/sfx_coin.mp3',
  '/play/crossfire-hopper/assets/sfx_crash.mp3',
  '/play/crossfire-hopper/assets/sfx_fail.mp3',
  '/play/crossfire-hopper/assets/sfx_hop.mp3',
  '/play/crossfire-hopper/assets/sfx_horn.mp3',
  '/play/crossfire-hopper/assets/sfx_land.mp3',
  '/play/crossfire-hopper/assets/sfx_medal.mp3',
  '/play/crossfire-hopper/assets/sfx_near.mp3',
  '/play/crossfire-hopper/assets/sfx_screech.mp3',
  '/play/crossfire-hopper/assets/sfx_splash.mp3',
  '/play/crossfire-hopper/assets/sfx_ui.mp3',
  '/play/crossfire-hopper/assets/sfx_unlock.mp3',
  '/play/crossfire-hopper/assets/sfx_warn.mp3',
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
