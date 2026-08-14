/* Gridfall service worker authored from /play/_shared/sw-template.js. */
const SLUG = 'gridfall';
const VERSION = '2026-08-10-aaa4';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/gridfall/',
  '/play/gridfall/index.html',
  '/play/gridfall/game.js',
  '/play/gridfall/main.js',
  '/play/gridfall/sw.js',
  '/play/gridfall/manifest.json',
  '/play/gridfall/icon.png',
  '/play/gridfall/icon512.png',
  '/play/gridfall/favicon.png',
  '/play/gridfall/assets/theme.mp3',
  '/play/gridfall/assets/tap.mp3',
  '/play/gridfall/assets/clear.mp3',
  '/play/gridfall/assets/cascade.mp3',
  '/play/gridfall/assets/reward.mp3',
  '/play/gridfall/assets/invalid.mp3',
  '/play/gridfall/assets/ui.mp3',
  '/play/_shared/ggkit.js',
  '/play/_shared/phaser.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.startsWith('gg-' + SLUG + '-') && k !== CACHE).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (!url.pathname.startsWith('/play/' + SLUG + '/') && !url.pathname.startsWith('/play/_shared/')) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) =>
    hit || fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    })
  ));
});
