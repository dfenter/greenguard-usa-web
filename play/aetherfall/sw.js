/* Aetherfall service worker. VERSION changes invalidate only this title. */
const SLUG = 'aetherfall';
const VERSION = 'aaa-f8-3-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/aetherfall/',
  '/play/aetherfall/index.html',
  '/play/aetherfall/game.js',
  '/play/aetherfall/manifest.json',
  '/play/aetherfall/icon.png',
  '/play/aetherfall/icon512.png',
  '/play/aetherfall/favicon.png',
  '/play/aetherfall/sw.js',
  '/play/aetherfall/assets/plaza.mp3',
  '/play/aetherfall/assets/reactor.mp3',
  '/play/aetherfall/assets/warden.mp3',
  '/play/aetherfall/assets/ui.mp3',
  '/play/aetherfall/assets/hit.mp3',
  '/play/aetherfall/assets/cast.mp3',
  '/play/aetherfall/assets/door.mp3',
  '/play/aetherfall/assets/crystal.mp3',
  '/play/aetherfall/assets/hurt.mp3',
  '/play/aetherfall/assets/pickup.mp3',
  '/play/aetherfall/assets/secret.mp3',
  '/play/aetherfall/assets/step.mp3',
  '/play/aetherfall/assets/sword.mp3',
  '/play/aetherfall/assets/telegraph.mp3',
  '/play/aetherfall/assets/victory.mp3',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js'
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
