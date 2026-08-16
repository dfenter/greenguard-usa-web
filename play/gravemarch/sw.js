/* Gravemarch service worker, derived from /play/_shared/sw-template.js. */
const SLUG = 'gravemarch';
const VERSION = 'aaa-2026-08-10-v2-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/gravemarch/',
  '/play/gravemarch/index.html',
  '/play/gravemarch/styles.css',
  '/play/gravemarch/game.js',
  '/play/gravemarch/manifest.json',
  '/play/gravemarch/LICENSES.md',
  '/play/gravemarch/icon.png',
  '/play/gravemarch/icon512.png',
  '/play/gravemarch/favicon.png',
  '/play/gravemarch/assets/pulse-cast.mp3',
  '/play/gravemarch/assets/hook-clank.mp3',
  '/play/gravemarch/assets/hit-impact.mp3',
  '/play/gravemarch/assets/boss-roar.mp3',
  '/play/gravemarch/assets/music-crypt.mp3',
  '/play/gravemarch/assets/music-danger.mp3',
  '/play/gravemarch/assets/dodge-whoosh.mp3',
  '/play/gravemarch/assets/enemy-shot.mp3',
  '/play/gravemarch/assets/summon-chime.mp3',
  '/play/gravemarch/assets/relic-pickup.mp3',
  '/play/gravemarch/assets/puzzle-click.mp3',
  '/play/gravemarch/assets/altar-heal.mp3',
  '/play/gravemarch/assets/clear-chime.mp3',
  '/play/gravemarch/assets/door-open.mp3',
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
