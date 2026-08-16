/* Ridgeline Rumble service worker, authored from /play/_shared/sw-template.js. */
const SLUG = 'ridgeline-rumble';
const VERSION = '2026.08.10-aaa-2-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/ridgeline-rumble/',
  '/play/ridgeline-rumble/index.html',
  '/play/ridgeline-rumble/style.css',
  '/play/ridgeline-rumble/game.js',
  '/play/ridgeline-rumble/manifest.json',
  '/play/ridgeline-rumble/icon.png',
  '/play/ridgeline-rumble/icon512.png',
  '/play/ridgeline-rumble/favicon.png',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js',
  '/play/ridgeline-rumble/assets/select.mp3',
  '/play/ridgeline-rumble/assets/confirm.mp3',
  '/play/ridgeline-rumble/assets/cancel.mp3',
  '/play/ridgeline-rumble/assets/move.mp3',
  '/play/ridgeline-rumble/assets/attack.mp3',
  '/play/ridgeline-rumble/assets/hit.mp3',
  '/play/ridgeline-rumble/assets/kill.mp3',
  '/play/ridgeline-rumble/assets/warning.mp3',
  '/play/ridgeline-rumble/assets/wave.mp3',
  '/play/ridgeline-rumble/assets/ability.mp3',
  '/play/ridgeline-rumble/assets/tower.mp3',
  '/play/ridgeline-rumble/assets/victory.mp3',
  '/play/ridgeline-rumble/assets/defeat.mp3',
  '/play/ridgeline-rumble/assets/ridge-bed.mp3'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('gg-' + SLUG + '-') && key !== CACHE).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
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
