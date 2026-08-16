/* Orbit Hearts service worker. Cache only files shipped by this title. */
const SLUG = 'orbit-hearts';
const VERSION = '2026-08-13-aaa-f14-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/orbit-hearts/',
  '/play/orbit-hearts/index.html',
  '/play/orbit-hearts/story.js',
  '/play/orbit-hearts/game.js',
  '/play/orbit-hearts/manifest.json',
  '/play/orbit-hearts/icon.png',
  '/play/orbit-hearts/icon512.png',
  '/play/orbit-hearts/favicon.png',
  '/play/orbit-hearts/assets/music-drift.mp3',
  '/play/orbit-hearts/assets/music-orbit.mp3',
  '/play/orbit-hearts/assets/music-station.mp3',
  '/play/orbit-hearts/assets/sfx-chapter.mp3',
  '/play/orbit-hearts/assets/sfx-choose.mp3',
  '/play/orbit-hearts/assets/sfx-deny.mp3',
  '/play/orbit-hearts/assets/sfx-ending.mp3',
  '/play/orbit-hearts/assets/sfx-good.mp3',
  '/play/orbit-hearts/assets/sfx-heart.mp3',
  '/play/orbit-hearts/assets/sfx-lock.mp3',
  '/play/orbit-hearts/assets/sfx-memory.mp3',
  '/play/orbit-hearts/assets/sfx-miss.mp3',
  '/play/orbit-hearts/assets/sfx-page.mp3',
  '/play/orbit-hearts/assets/sfx-perfect.mp3',
  '/play/orbit-hearts/assets/sfx-tap.mp3',
  '/play/orbit-hearts/assets/sfx-thrust.mp3',
  '/play/orbit-hearts/assets/sfx-type.mp3',
  '/play/orbit-hearts/assets/sfx-ui.mp3',
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
