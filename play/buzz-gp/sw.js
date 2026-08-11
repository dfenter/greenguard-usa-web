/* Buzz Grand Prix service worker. Cache only real title and shared files. */
const SLUG = 'buzz-gp';
const VERSION = '2026-08-11-aaa-build1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/buzz-gp/', '/play/buzz-gp/index.html', '/play/buzz-gp/game.js', '/play/buzz-gp/manifest.json', '/play/buzz-gp/icon.svg', '/play/buzz-gp/favicon.svg', '/play/buzz-gp/sw.js',
  '/play/buzz-gp/tracks/garden-sprint.json', '/play/buzz-gp/tracks/picnic-chicane.json', '/play/buzz-gp/tracks/compost-canyon.json', '/play/buzz-gp/tracks/gutter-run.json',
  '/play/buzz-gp/tracks/toolshed-twilight.json', '/play/buzz-gp/tracks/pond-skim.json', '/play/buzz-gp/tracks/anthill-spiral.json', '/play/buzz-gp/tracks/queens-throne.json',
  '/play/buzz-gp/tracks/firefly-loop.json', '/play/buzz-gp/tracks/hosepipe-heights.json', '/play/buzz-gp/tracks/seed-packet-speedway.json', '/play/buzz-gp/tracks/wheelbarrow-wilds.json',
  '/play/buzz-gp/tracks/battle-lily-pad.json', '/play/buzz-gp/tracks/battle-toolshed.json',
  '/play/buzz-gp/assets/music_menu.mp3', '/play/buzz-gp/assets/music_race_a.mp3', '/play/buzz-gp/assets/music_race_b.mp3',
  '/play/buzz-gp/assets/sfx_item.mp3', '/play/buzz-gp/assets/sfx_hit.mp3', '/play/buzz-gp/assets/sfx_drift.mp3', '/play/buzz-gp/assets/sfx_boost.mp3', '/play/buzz-gp/assets/sfx_jump.mp3', '/play/buzz-gp/assets/sfx_pickup.mp3', '/play/buzz-gp/assets/sfx_shield.mp3', '/play/buzz-gp/assets/sfx_hornet.mp3', '/play/buzz-gp/assets/sfx_sap.mp3', '/play/buzz-gp/assets/sfx_swarm.mp3', '/play/buzz-gp/assets/sfx_pebble.mp3', '/play/buzz-gp/assets/sfx_lap.mp3', '/play/buzz-gp/assets/sfx_fanfare.mp3', '/play/buzz-gp/assets/sfx_ui.mp3',
  '/play/_shared/ggkit.js', '/play/_shared/three/three.module.min.js', '/play/_shared/racer/engine.js', '/play/_shared/racer/track.js', '/play/_shared/racer/env.js', '/play/_shared/racer/carkit.js', '/play/_shared/racer/fx.js',
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
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request).then((response) => { if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone())); return response; })));
});
