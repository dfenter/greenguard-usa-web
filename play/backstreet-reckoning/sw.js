/* Offline cache for Backstreet Reckoning. Generated from play/_shared/sw-template.js. */
const SLUG = 'backstreet-reckoning';
const VERSION = 'aaa-f7-20260810-5';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/backstreet-reckoning/',
  '/play/backstreet-reckoning/index.html',
  '/play/backstreet-reckoning/game.js',
  '/play/backstreet-reckoning/manifest.json',
  '/play/backstreet-reckoning/icon.png',
  '/play/backstreet-reckoning/icon512.png',
  '/play/backstreet-reckoning/favicon.png',
  '/play/backstreet-reckoning/assets/audio/punch.mp3',
  '/play/backstreet-reckoning/assets/audio/grab.mp3',
  '/play/backstreet-reckoning/assets/audio/weapon.mp3',
  '/play/backstreet-reckoning/assets/audio/crowd.mp3',
  '/play/backstreet-reckoning/assets/audio/clear.mp3',
  '/play/_shared/ggkit.js',
  '/play/_shared/phaser.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((k) => k.startsWith('gg-' + SLUG + '-') && k !== CACHE).map((k) => caches.delete(k))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (!url.pathname.startsWith('/play/' + SLUG + '/') && !url.pathname.startsWith('/play/_shared/')) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
    return res;
  })));
});
