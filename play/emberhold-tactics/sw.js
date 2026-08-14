/* sw-template.js - Emberhold Tactics offline cache. */
const SLUG = 'emberhold-tactics';
const VERSION = '2026-08-10-aaa-f2-fix1-ui1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/emberhold-tactics/',
  '/play/emberhold-tactics/index.html',
  '/play/emberhold-tactics/game.js',
  '/play/emberhold-tactics/sim.js',
  '/play/emberhold-tactics/sw.js',
  '/play/emberhold-tactics/manifest.json',
  '/play/emberhold-tactics/icon.png',
  '/play/emberhold-tactics/icon512.png',
  '/play/emberhold-tactics/favicon.png',
  '/play/emberhold-tactics/assets/ambient_hum.mp3',
  '/play/emberhold-tactics/assets/ambient_intensity.mp3',
  '/play/emberhold-tactics/assets/sfx_select.mp3',
  '/play/emberhold-tactics/assets/sfx_move.mp3',
  '/play/emberhold-tactics/assets/sfx_clash.mp3',
  '/play/emberhold-tactics/assets/sfx_damage.mp3',
  '/play/emberhold-tactics/assets/sfx_confirm.mp3',
  '/play/emberhold-tactics/assets/sfx_victory.mp3',
  '/play/emberhold-tactics/assets/sfx_defeat.mp3',
  '/play/emberhold-tactics/assets/sfx_pickup.mp3',
  '/play/emberhold-tactics/assets/unit_player.svg',
  '/play/emberhold-tactics/assets/unit_enemy.svg',
  '/play/emberhold-tactics/assets/unit_boss.svg',
  '/play/emberhold-tactics/assets/tile_grass.svg',
  '/play/emberhold-tactics/assets/tile_stone.svg',
  '/play/emberhold-tactics/assets/tile_sand.svg',
  '/play/emberhold-tactics/assets/tile_water.svg',
  '/play/emberhold-tactics/assets/pickup_heal.svg',
  '/play/emberhold-tactics/assets/pickup_buff.svg',
  '/play/emberhold-tactics/assets/fx_spark.svg',
  '/play/emberhold-tactics/assets/fx_ember.svg',
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
  e.respondWith(caches.match(e.request, {ignoreSearch:true}).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  })));
});
