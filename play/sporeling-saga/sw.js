/* Sporeling Saga service worker. Cache only files shipped by this title. */
const SLUG = 'sporeling-saga';
const VERSION = '2026-08-11-aaa-f14';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/sporeling-saga/',
  '/play/sporeling-saga/index.html',
  '/play/sporeling-saga/game.js',
  '/play/sporeling-saga/manifest.json',
  '/play/sporeling-saga/icon.png',
  '/play/sporeling-saga/icon512.png',
  '/play/sporeling-saga/favicon.png',
  '/play/sporeling-saga/assets/strike-hit.mp3',
  '/play/sporeling-saga/assets/forage-chime.mp3',
  '/play/sporeling-saga/assets/evolution-swell.mp3',
  '/play/sporeling-saga/assets/rank-up.mp3',
  '/play/sporeling-saga/assets/rerun.mp3',
  '/play/sporeling-saga/assets/theme.mp3',
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
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  })));
});
