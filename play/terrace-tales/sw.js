/* Terrace Tales service worker. Cache entries are all shipped files. */
const SLUG = 'terrace-tales';
const VERSION = 'aaa-20260811-fix2';
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
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (!url.pathname.startsWith('/play/terrace-tales/') && !url.pathname.startsWith('/play/_shared/')) return;
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request).then((response) => {
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  })));
});
