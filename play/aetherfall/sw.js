/* Aetherfall service worker. VERSION changes invalidate only this title. */
const SLUG = 'aetherfall';
const VERSION = 'aaa-f8-3';
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
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (!url.pathname.startsWith('/play/aetherfall/') && !url.pathname.startsWith('/play/_shared/')) return;
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request).then((response) => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, copy)); }
    return response;
  })));
});
