/* Descent Protocol service worker. Generated from /play/_shared/sw-template.js. */
const SLUG = 'descent-protocol';
const VERSION = '2026.08.10.4';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/descent-protocol/',
  '/play/descent-protocol/index.html',
  '/play/descent-protocol/game.js',
  '/play/descent-protocol/manifest.json',
  '/play/descent-protocol/icon.png',
  '/play/descent-protocol/icon512.png',
  '/play/descent-protocol/favicon.svg',
  '/play/descent-protocol/assets/ambient_hum.mp3',
  '/play/descent-protocol/assets/weapon_fire_1.mp3',
  '/play/descent-protocol/assets/weapon_fire_2.mp3',
  '/play/descent-protocol/assets/weapon_fire_3.mp3',
  '/play/descent-protocol/assets/door_chime.mp3',
  '/play/descent-protocol/assets/keycard_chime.mp3',
  '/play/descent-protocol/assets/hit_impact.mp3',
  '/play/descent-protocol/assets/boss_phase.mp3',
  '/play/descent-protocol/assets/danger_intensity.mp3',
  '/play/descent-protocol/assets/reload_click.mp3',
  '/play/descent-protocol/assets/pickup_ping.mp3',
  '/play/descent-protocol/assets/warning_beep.mp3',
  '/play/descent-protocol/assets/room_clear.mp3',
  '/play/descent-protocol/assets/victory_fanfare.mp3',
  '/play/descent-protocol/assets/floor-panel.svg',
  '/play/descent-protocol/assets/room-panel.svg',
  '/play/descent-protocol/assets/cover-crate.svg',
  '/play/descent-protocol/assets/door-panel.svg',
  '/play/descent-protocol/assets/keycard.svg',
  '/play/descent-protocol/assets/lift-panel.svg',
  '/play/descent-protocol/assets/vent-panel.svg',
  '/play/descent-protocol/assets/operator-idle.svg',
  '/play/descent-protocol/assets/operator-move.svg',
  '/play/descent-protocol/assets/operator-fire.svg',
  '/play/descent-protocol/assets/enemy-scout.svg',
  '/play/descent-protocol/assets/enemy-gunner.svg',
  '/play/descent-protocol/assets/enemy-flanker.svg',
  '/play/descent-protocol/assets/enemy-bruiser.svg',
  '/play/descent-protocol/assets/enemy-turret.svg',
  '/play/descent-protocol/assets/enemy-sentinel.svg',
  '/play/descent-protocol/assets/pickup-health.svg',
  '/play/descent-protocol/assets/pickup-armor.svg',
  '/play/descent-protocol/assets/pickup-ammo.svg',
  '/play/descent-protocol/assets/pickup-mod.svg',
  '/play/_shared/ggkit.js',
  '/play/_shared/phaser.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('gg-' + SLUG + '-') && key !== CACHE).map((key) => caches.delete(key))
  )).then(() => self.clients.claim()));
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
