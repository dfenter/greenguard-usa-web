/* Terrace Tales service worker. Cache entries are all shipped files. */
const SLUG = 'terrace-tales';
const VERSION = 'aaa-20260811-fix2-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/terrace-tales/',
  '/play/terrace-tales/index.html',
  '/play/terrace-tales/game.js',
  '/play/terrace-tales/sw.js',
  '/play/terrace-tales/LICENSES.md',
  '/play/terrace-tales/manifest.json',
  '/play/terrace-tales/icon.png',
  '/play/terrace-tales/icon512.png',
  '/play/terrace-tales/favicon.png',
  '/play/terrace-tales/assets/ui.mp3',
  '/play/terrace-tales/assets/swap.mp3',
  '/play/terrace-tales/assets/invalid.mp3',
  '/play/terrace-tales/assets/match.mp3',
  '/play/terrace-tales/assets/cascade.mp3',
  '/play/terrace-tales/assets/special.mp3',
  '/play/terrace-tales/assets/fall.mp3',
  '/play/terrace-tales/assets/goal.mp3',
  '/play/terrace-tales/assets/reveal.mp3',
  '/play/terrace-tales/assets/build.mp3',
  '/play/terrace-tales/assets/fail.mp3',
  '/play/terrace-tales/assets/garden.mp3',
  '/play/terrace-tales/assets/board.mp3',
  '/play/terrace-tales/assets/meta.mp3',
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
