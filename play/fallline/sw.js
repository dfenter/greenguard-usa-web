/* sw.js - Fallline offline shell, authored from /play/_shared/sw-template.js. */
const SLUG = 'fallline';
const VERSION = '2026-08-10-fix1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/fallline/',
  '/play/fallline/index.html',
  '/play/fallline/styles.css',
  '/play/fallline/game.js',
  '/play/fallline/manifest.json',
  '/play/fallline/icon.png',
  '/play/fallline/icon512.png',
  '/play/fallline/favicon.png',
  '/play/fallline/assets/audio/gunfire.mp3',
  '/play/fallline/assets/audio/reload.mp3',
  '/play/fallline/assets/audio/storm.mp3',
  '/play/fallline/assets/audio/victory.mp3',
  '/play/fallline/assets/audio/impact.mp3',
  '/play/fallline/assets/audio/pickup.mp3',
  '/play/fallline/assets/audio/hurt.mp3',
  '/play/fallline/assets/audio/switch.mp3',
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
  if (!url.pathname.startsWith('/play/' + SLUG + '/') && !url.pathname.startsWith('/play/_shared/')) return;
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request).then((response) => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, copy)); }
    return response;
  })));
});
