/* Scrapper Squad service worker. Derived from /play/_shared/sw-template.js. */
const SLUG = 'scrapper-squad';
const VERSION = '2026-08-11-aaa2';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/scrapper-squad/',
  '/play/scrapper-squad/index.html',
  '/play/scrapper-squad/style.css',
  '/play/scrapper-squad/js/game.js',
  '/play/scrapper-squad/manifest.json',
  '/play/scrapper-squad/icon.png',
  '/play/scrapper-squad/icon512.png',
  '/play/scrapper-squad/favicon.png',
  '/play/scrapper-squad/assets/sfx_shot_fire.mp3',
  '/play/scrapper-squad/assets/sfx_gem_pickup.mp3',
  '/play/scrapper-squad/assets/sfx_super_roar.mp3',
  '/play/scrapper-squad/assets/sfx_victory_fanfare.mp3',
  '/play/scrapper-squad/assets/music_arena.mp3',
  '/play/scrapper-squad/assets/music_danger.mp3',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js'
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
