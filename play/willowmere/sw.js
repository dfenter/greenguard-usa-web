/* Authored from /play/_shared/sw-template.js. */
const SLUG = 'willowmere';
const VERSION = '2026-08-16-aaa-rebuild-1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/willowmere/',
  '/play/willowmere/index.html',
  '/play/willowmere/manifest.json',
  '/play/willowmere/icon.png',
  '/play/willowmere/icon512.png',
  '/play/willowmere/favicon.png',
  '/play/willowmere/js/willowmere.js',
  '/play/willowmere/audio/music_spring.mp3',
  '/play/willowmere/audio/music_summer.mp3',
  '/play/willowmere/audio/music_autumn.mp3',
  '/play/willowmere/audio/music_winter.mp3',
  '/play/willowmere/audio/music_night.mp3',
  '/play/willowmere/audio/sfx_ui.mp3',
  '/play/willowmere/audio/sfx_step.mp3',
  '/play/willowmere/audio/sfx_gather.mp3',
  '/play/willowmere/audio/sfx_craft.mp3',
  '/play/willowmere/audio/sfx_gift.mp3',
  '/play/willowmere/audio/sfx_heart.mp3',
  '/play/willowmere/audio/sfx_place.mp3',
  '/play/willowmere/audio/sfx_rotate.mp3',
  '/play/willowmere/audio/sfx_day.mp3',
  '/play/willowmere/audio/sfx_festival.mp3',
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
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  })));
});
