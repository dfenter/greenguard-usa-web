const SLUG = 'slice-rush';
const VERSION = '2026-08-16-f17-aaa1';
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
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (!url.pathname.startsWith('/play/' + SLUG + '/') && !url.pathname.startsWith('/play/_shared/')) return;
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request).then((response) => {
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  })));
});
