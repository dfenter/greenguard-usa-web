/* Gravemarch service worker, derived from /play/_shared/sw-template.js. */
const SLUG = 'gravemarch';
const VERSION = 'aaa-2026-08-10-v2';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/gravemarch/',
  '/play/gravemarch/index.html',
  '/play/gravemarch/styles.css',
  '/play/gravemarch/game.js',
  '/play/gravemarch/manifest.json',
  '/play/gravemarch/LICENSES.md',
  '/play/gravemarch/icon.png',
  '/play/gravemarch/icon512.png',
  '/play/gravemarch/favicon.png',
  '/play/gravemarch/assets/pulse-cast.mp3',
  '/play/gravemarch/assets/hook-clank.mp3',
  '/play/gravemarch/assets/hit-impact.mp3',
  '/play/gravemarch/assets/boss-roar.mp3',
  '/play/gravemarch/assets/music-crypt.mp3',
  '/play/gravemarch/assets/music-danger.mp3',
  '/play/gravemarch/assets/dodge-whoosh.mp3',
  '/play/gravemarch/assets/enemy-shot.mp3',
  '/play/gravemarch/assets/summon-chime.mp3',
  '/play/gravemarch/assets/relic-pickup.mp3',
  '/play/gravemarch/assets/puzzle-click.mp3',
  '/play/gravemarch/assets/altar-heal.mp3',
  '/play/gravemarch/assets/clear-chime.mp3',
  '/play/gravemarch/assets/door-open.mp3',
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
  if (!url.pathname.startsWith('/play/' + SLUG + '/') && !url.pathname.startsWith('/play/_shared/') && !url.pathname.startsWith('/play/_assets/')) return;
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request).then((response) => {
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  })));
});
