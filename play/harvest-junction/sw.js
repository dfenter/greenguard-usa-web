/* Harvest Junction service worker. Generated from /play/_shared/sw-template.js. */
const SLUG = 'harvest-junction';
const VERSION = '2026-08-10-fix1-f3';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/harvest-junction/',
  '/play/harvest-junction/index.html',
  '/play/harvest-junction/style.css',
  '/play/harvest-junction/game.js',
  '/play/harvest-junction/sw.js',
  '/play/harvest-junction/manifest.json',
  '/play/harvest-junction/icon.png',
  '/play/harvest-junction/icon512.png',
  '/play/harvest-junction/favicon.ico',
  '/play/harvest-junction/assets/plant_rustle.mp3',
  '/play/harvest-junction/assets/harvest_chime.mp3',
  '/play/harvest-junction/assets/factory_clank.mp3',
  '/play/harvest-junction/assets/departure_horn.mp3',
  '/play/harvest-junction/assets/ui_tick.mp3',
  '/play/harvest-junction/assets/water_splash.mp3',
  '/play/harvest-junction/assets/crop_ready.mp3',
  '/play/harvest-junction/assets/building_chime.mp3',
  '/play/harvest-junction/assets/farm_theme.mp3',
  '/play/harvest-junction/assets/town_theme.mp3',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('gg-' + SLUG + '-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
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
