/* Hearth & Halls service worker. Derived from /play/_shared/sw-template.js. */
const SLUG = 'hearth-halls';
const VERSION = 'aaa-2026-08-10-fix1-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/hearth-halls/',
  '/play/hearth-halls/index.html',
  '/play/hearth-halls/game.js',
  '/play/hearth-halls/styles.css',
  '/play/hearth-halls/manifest.json',
  '/play/hearth-halls/icon.png',
  '/play/hearth-halls/icon512.png',
  '/play/hearth-halls/favicon.png',
  '/play/hearth-halls/sw.js',
  '/play/_shared/ggkit.js',
  '/play/_shared/phaser.min.js',
  '/play/hearth-halls/assets/audio/music-home.mp3',
  '/play/hearth-halls/assets/audio/music-board.mp3',
  '/play/hearth-halls/assets/audio/tap.mp3',
  '/play/hearth-halls/assets/audio/select.mp3',
  '/play/hearth-halls/assets/audio/invalid.mp3',
  '/play/hearth-halls/assets/audio/swap-tick.mp3',
  '/play/hearth-halls/assets/audio/match-chime.mp3',
  '/play/hearth-halls/assets/audio/cascade.mp3',
  '/play/hearth-halls/assets/audio/hint.mp3',
  '/play/hearth-halls/assets/audio/goal.mp3',
  '/play/hearth-halls/assets/audio/reveal-sting.mp3',
  '/play/hearth-halls/assets/audio/character-vocal.mp3',
  '/play/hearth-halls/assets/audio/room-complete.mp3',
  '/play/hearth-halls/assets/audio/ui-confirm.mp3',
  '/play/hearth-halls/assets/audio/comfort-place.mp3'
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
