const SLUG = 'slice-rush';
const VERSION = '2026-08-16-f17-aaa1-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/slice-rush/',
  '/play/slice-rush/index.html',
  '/play/slice-rush/styles.css',
  '/play/slice-rush/game.js',
  '/play/slice-rush/manifest.json',
  '/play/slice-rush/icon.png',
  '/play/slice-rush/icon512.png',
  '/play/slice-rush/favicon.png',
  '/play/slice-rush/assets/music-cart.mp3',
  '/play/slice-rush/assets/music-corner.mp3',
  '/play/slice-rush/assets/music-plaza.mp3',
  '/play/slice-rush/assets/music-pier.mp3',
  '/play/slice-rush/assets/music-flagship.mp3',
  '/play/slice-rush/assets/sfx-tap.mp3',
  '/play/slice-rush/assets/sfx-dough.mp3',
  '/play/slice-rush/assets/sfx-topping.mp3',
  '/play/slice-rush/assets/sfx-reject.mp3',
  '/play/slice-rush/assets/sfx-serve.mp3',
  '/play/slice-rush/assets/sfx-upgrade.mp3',
  '/play/slice-rush/assets/sfx-unlock.mp3',
  '/play/slice-rush/assets/sfx-walkout.mp3',
  '/play/slice-rush/assets/sfx-reopen.mp3',
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
