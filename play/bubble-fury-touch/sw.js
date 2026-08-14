/* sw-template.js — copy to /play/<slug>/sw.js and fill SLUG, VERSION, ASSETS.
 * Offline-after-first-load per the UX/PWA gate. Cache-first for same-origin
 * GETs under /play/<slug>/ and /play/_shared/; network passthrough otherwise.
 * Bump VERSION on every deploy of the game to invalidate stale caches.
 */
const SLUG = 'bubble-fury-touch';
const VERSION = '2026-08-10-declutter1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/bubble-fury-touch/',
  '/play/bubble-fury-touch/index.html',
  '/play/bubble-fury-touch/game.js',
  '/play/bubble-fury-touch/bf_data.js',
  '/play/bubble-fury-touch/manifest.json',
  '/play/bubble-fury-touch/icon.png',
  '/play/bubble-fury-touch/icon512.png',
  '/play/bubble-fury-touch/favicon.png',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js',
  '/play/bubble-fury-touch/assets/amb_arena.mp3',
  '/play/bubble-fury-touch/assets/atlas.json',
  '/play/bubble-fury-touch/assets/atlas.png',
  '/play/bubble-fury-touch/assets/disc.png',
  '/play/bubble-fury-touch/assets/floor_choke.jpg',
  '/play/bubble-fury-touch/assets/floor_furnace.jpg',
  '/play/bubble-fury-touch/assets/floor_night.jpg',
  '/play/bubble-fury-touch/assets/floor_plaza.jpg',
  '/play/bubble-fury-touch/assets/floor_yard.jpg',
  '/play/bubble-fury-touch/assets/logo.png',
  '/play/bubble-fury-touch/assets/music_arena.mp3',
  '/play/bubble-fury-touch/assets/music_boss.mp3',
  '/play/bubble-fury-touch/assets/nightmask.png',
  '/play/bubble-fury-touch/assets/p_ember.png',
  '/play/bubble-fury-touch/assets/p_ring.png',
  '/play/bubble-fury-touch/assets/p_shard.png',
  '/play/bubble-fury-touch/assets/p_smoke.png',
  '/play/bubble-fury-touch/assets/p_spark.png',
  '/play/bubble-fury-touch/assets/p_star.png',
  '/play/bubble-fury-touch/assets/sfx_boss_death.mp3',
  '/play/bubble-fury-touch/assets/sfx_boss_hit.mp3',
  '/play/bubble-fury-touch/assets/sfx_boss_roar.mp3',
  '/play/bubble-fury-touch/assets/sfx_dash.mp3',
  '/play/bubble-fury-touch/assets/sfx_defeat.mp3',
  '/play/bubble-fury-touch/assets/sfx_elite_death.mp3',
  '/play/bubble-fury-touch/assets/sfx_enemy_death.mp3',
  '/play/bubble-fury-touch/assets/sfx_enemy_shoot.mp3',
  '/play/bubble-fury-touch/assets/sfx_fire_beam.mp3',
  '/play/bubble-fury-touch/assets/sfx_fire_bounce.mp3',
  '/play/bubble-fury-touch/assets/sfx_fire_flak.mp3',
  '/play/bubble-fury-touch/assets/sfx_fire_rail.mp3',
  '/play/bubble-fury-touch/assets/sfx_fire_spread.mp3',
  '/play/bubble-fury-touch/assets/sfx_hurt.mp3',
  '/play/bubble-fury-touch/assets/sfx_medal.mp3',
  '/play/bubble-fury-touch/assets/sfx_pickup_health.mp3',
  '/play/bubble-fury-touch/assets/sfx_pickup_mult.mp3',
  '/play/bubble-fury-touch/assets/sfx_pickup_weapon.mp3',
  '/play/bubble-fury-touch/assets/sfx_ui_select.mp3',
  '/play/bubble-fury-touch/assets/sfx_ui_tick.mp3',
  '/play/bubble-fury-touch/assets/sfx_unlock.mp3',
  '/play/bubble-fury-touch/assets/sfx_victory.mp3',
  '/play/bubble-fury-touch/assets/sfx_wave_clear.mp3',
  '/play/bubble-fury-touch/assets/sfx_wave_start.mp3',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('gg-' + SLUG + '-') && k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (!url.pathname.startsWith('/play/' + SLUG + '/') && !url.pathname.startsWith('/play/_shared/') && !url.pathname.startsWith('/play/_assets/')) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) =>
      hit ||
      fetch(e.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
    )
  );
});
