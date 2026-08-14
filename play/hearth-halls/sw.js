/* Hearth & Halls service worker. Derived from /play/_shared/sw-template.js. */
const SLUG = 'hearth-halls';
const VERSION = 'aaa-2026-08-10-fix1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/hearth-halls/',
  '/play/hearth-halls/index.html',
  '/play/hearth-halls/game.js',
  '/play/hearth-halls/styles.css',
  '/play/hearth-halls/manifest.json',
  '/play/hearth-halls/icon.png',
  '/play/hearth-halls/icon512.png',
  '/play/hearth-halls/favicon.png',
  '/play/hearth-halls/sw.js',
  '/play/_shared/ggkit.js',
  '/play/_shared/phaser.min.js',
  '/play/hearth-halls/assets/audio/music-home.mp3',
  '/play/hearth-halls/assets/audio/music-board.mp3',
  '/play/hearth-halls/assets/audio/tap.mp3',
  '/play/hearth-halls/assets/audio/select.mp3',
  '/play/hearth-halls/assets/audio/invalid.mp3',
  '/play/hearth-halls/assets/audio/swap-tick.mp3',
  '/play/hearth-halls/assets/audio/match-chime.mp3',
  '/play/hearth-halls/assets/audio/cascade.mp3',
  '/play/hearth-halls/assets/audio/hint.mp3',
  '/play/hearth-halls/assets/audio/goal.mp3',
  '/play/hearth-halls/assets/audio/reveal-sting.mp3',
  '/play/hearth-halls/assets/audio/character-vocal.mp3',
  '/play/hearth-halls/assets/audio/room-complete.mp3',
  '/play/hearth-halls/assets/audio/ui-confirm.mp3',
  '/play/hearth-halls/assets/audio/comfort-place.mp3'
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
