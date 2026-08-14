/* Crestfall offline shell. Generated from /play/_shared/sw-template.js. */
const SLUG = 'crestfall';
const VERSION = '2026-08-10-aaa4';
const CACHE = `gg-${SLUG}-${VERSION}`;
const ASSETS = [
  '/play/crestfall/',
  '/play/crestfall/index.html',
  '/play/crestfall/manifest.json',
  '/play/crestfall/icon.png',
  '/play/crestfall/icon512.png',
  '/play/crestfall/favicon.png',
  '/play/crestfall/src/constants.js',
  '/play/crestfall/src/enemies.js',
  '/play/crestfall/src/game.js',
  '/play/crestfall/src/hud.js',
  '/play/crestfall/src/input.js',
  '/play/crestfall/src/map-data.js',
  '/play/crestfall/src/overworld.js',
  '/play/crestfall/src/player.js',
  '/play/crestfall/src/rng.js',
  '/play/crestfall/src/save.js',
  '/play/crestfall/src/sideview.js',
  '/play/crestfall/src/sprites.js',
  '/play/crestfall/src/town.js',
  '/play/crestfall/assets/field-loop.m4a',
  '/play/crestfall/assets/danger-loop.m4a',
  '/play/crestfall/assets/sword-clash.m4a',
  '/play/crestfall/assets/rune-chime.m4a',
  '/play/crestfall/assets/town-ambience.m4a',
  '/play/crestfall/assets/guardian-roar.m4a',
  '/play/crestfall/assets/pickup.m4a',
  '/play/crestfall/assets/damage.m4a',
  '/play/crestfall/assets/thunder.m4a',
  '/play/crestfall/assets/jump.m4a',
  '/play/crestfall/assets/menu.m4a',
  '/play/_shared/ggkit.js',
  '/play/_shared/phaser.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith(`gg-${SLUG}-`) && key !== CACHE).map((key) => caches.delete(key)),
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (!url.pathname.startsWith(`/play/${SLUG}/`) && !url.pathname.startsWith('/play/_shared/')) return;
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request).then((response) => {
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  })));
});
