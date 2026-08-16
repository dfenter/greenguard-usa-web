/* Generated from /play/_shared/sw-template.js. */
const SLUG = 'meadow-solitaire';
const VERSION = '2026-08-16-aaa1-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/meadow-solitaire/',
  '/play/meadow-solitaire/index.html',
  '/play/meadow-solitaire/game.js',
  '/play/meadow-solitaire/manifest.json',
  '/play/meadow-solitaire/LICENSES.md',
  '/play/meadow-solitaire/icon.png',
  '/play/meadow-solitaire/icon512.png',
  '/play/meadow-solitaire/favicon.png',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js',
  '/play/meadow-solitaire/assets/music-spring.mp3',
  '/play/meadow-solitaire/assets/music-summer.mp3',
  '/play/meadow-solitaire/assets/music-harvest.mp3',
  '/play/meadow-solitaire/assets/music-frost.mp3',
  '/play/meadow-solitaire/assets/music-moon.mp3',
  '/play/meadow-solitaire/assets/music-rain.mp3',
  '/play/meadow-solitaire/assets/sfx-tap.mp3',
  '/play/meadow-solitaire/assets/sfx-flip.mp3',
  '/play/meadow-solitaire/assets/sfx-draw.mp3',
  '/play/meadow-solitaire/assets/sfx-streak.mp3',
  '/play/meadow-solitaire/assets/sfx-peak.mp3',
  '/play/meadow-solitaire/assets/sfx-undo.mp3',
  '/play/meadow-solitaire/assets/sfx-hint.mp3',
  '/play/meadow-solitaire/assets/sfx-clear.mp3',
  '/play/meadow-solitaire/assets/sfx-fail.mp3',
  '/play/meadow-solitaire/assets/sfx-grow.mp3',
  '/play/meadow-solitaire/assets/sfx-boundary.mp3'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('gg-' + SLUG + '-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
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
