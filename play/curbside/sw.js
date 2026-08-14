/* sw.js - Curbside. Authored from /play/_shared/sw-template.js.
 * Offline-after-first-load per the UX/PWA gate. Cache-first for same-origin
 * GETs under /play/<slug>/ and /play/_shared/; network passthrough otherwise.
 * Bump VERSION on every deploy of the game to invalidate stale caches.
 */
const SLUG = 'curbside';
const VERSION = '2026-08-10-ui-declutter1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
// Precache list generated from the shipped directory: every entry below is
// a file that actually exists, so addAll() can never reject and leave the
// install permanently failed. Regenerate whenever a file is added.
const ASSETS = [
  '/play/curbside/',
  '/play/curbside/index.html',
  '/play/curbside/cb_data.js',
  '/play/curbside/cb_world.js',
  '/play/curbside/favicon.png',
  '/play/curbside/game.js',
  '/play/curbside/icon.png',
  '/play/curbside/icon512.png',
  '/play/curbside/manifest.json',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js',
  '/play/curbside/assets/atlas.json',
  '/play/curbside/assets/atlas.png',
  '/play/curbside/assets/bg_boardwalk_far.png',
  '/play/curbside/assets/bg_boardwalk_near.png',
  '/play/curbside/assets/bg_downtown_far.png',
  '/play/curbside/assets/bg_downtown_near.png',
  '/play/curbside/assets/bg_mile_far.png',
  '/play/curbside/assets/bg_mile_near.png',
  '/play/curbside/assets/bg_plaza_far.png',
  '/play/curbside/assets/bg_plaza_near.png',
  '/play/curbside/assets/bg_railyard_far.png',
  '/play/curbside/assets/bg_railyard_near.png',
  '/play/curbside/assets/ground.png',
  '/play/curbside/assets/logo.png',
  '/play/curbside/assets/surface_deck.svg',
  '/play/curbside/assets/surface_ledge.svg',
  '/play/curbside/assets/surface_ramp.svg',
  '/play/curbside/assets/surface_rail.svg',
  '/play/curbside/assets/surface_step.svg',
  '/play/curbside/assets/music_menu.mp3',
  '/play/curbside/assets/music_night.mp3',
  '/play/curbside/assets/music_street.mp3',
  '/play/curbside/assets/p_chalk.png',
  '/play/curbside/assets/p_dust.png',
  '/play/curbside/assets/p_glow.png',
  '/play/curbside/assets/p_ring.png',
  '/play/curbside/assets/p_smoke.png',
  '/play/curbside/assets/p_spark.png',
  '/play/curbside/assets/sfx_bail.mp3',
  '/play/curbside/assets/sfx_bank.mp3',
  '/play/curbside/assets/sfx_boost.mp3',
  '/play/curbside/assets/sfx_combo.mp3',
  '/play/curbside/assets/sfx_district.mp3',
  '/play/curbside/assets/sfx_fail.mp3',
  '/play/curbside/assets/sfx_gap.mp3',
  '/play/curbside/assets/sfx_grind.mp3',
  '/play/curbside/assets/sfx_horn.mp3',
  '/play/curbside/assets/sfx_land_clean.mp3',
  '/play/curbside/assets/sfx_land_sketchy.mp3',
  '/play/curbside/assets/sfx_medal.mp3',
  '/play/curbside/assets/sfx_pickup.mp3',
  '/play/curbside/assets/sfx_pop.mp3',
  '/play/curbside/assets/sfx_prompt.mp3',
  '/play/curbside/assets/sfx_roll.mp3',
  '/play/curbside/assets/sfx_trick.mp3',
  '/play/curbside/assets/sfx_ui.mp3',
  '/play/curbside/assets/sfx_wobble.mp3',
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
