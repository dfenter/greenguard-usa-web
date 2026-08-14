/* sw-template.js - copy to /play/<slug>/sw.js and fill SLUG, VERSION, ASSETS.
 * Offline-after-first-load per the UX/PWA gate. Cache-first for same-origin
 * GETs under /play/<slug>/ and /play/_shared/; network passthrough otherwise.
 * Bump VERSION on every deploy of the game to invalidate stale caches.
 */
const SLUG = 'spire-ascent';
const VERSION = '2026-08-10-ui-declutter-1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/spire-ascent/',
  '/play/spire-ascent/index.html',
  '/play/spire-ascent/game.js',
  '/play/spire-ascent/manifest.json',
  '/play/spire-ascent/icon.png',
  '/play/spire-ascent/icon512.png',
  '/play/spire-ascent/favicon.png',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js',
  '/play/spire-ascent/assets/atlas.json',
  '/play/spire-ascent/assets/atlas.png',
  '/play/spire-ascent/assets/digits.json',
  '/play/spire-ascent/assets/digits.png',
  '/play/spire-ascent/assets/far_0.png',
  '/play/spire-ascent/assets/far_1.png',
  '/play/spire-ascent/assets/far_2.png',
  '/play/spire-ascent/assets/far_3.png',
  '/play/spire-ascent/assets/lava.png',
  '/play/spire-ascent/assets/logo.png',
  '/play/spire-ascent/assets/music_climb.mp3',
  '/play/spire-ascent/assets/music_peril.mp3',
  '/play/spire-ascent/assets/near_0.png',
  '/play/spire-ascent/assets/near_1.png',
  '/play/spire-ascent/assets/near_2.png',
  '/play/spire-ascent/assets/near_3.png',
  '/play/spire-ascent/assets/sfx_best.mp3',
  '/play/spire-ascent/assets/sfx_charge.mp3',
  '/play/spire-ascent/assets/sfx_combo0.mp3',
  '/play/spire-ascent/assets/sfx_combo1.mp3',
  '/play/spire-ascent/assets/sfx_combo2.mp3',
  '/play/spire-ascent/assets/sfx_combo3.mp3',
  '/play/spire-ascent/assets/sfx_combo4.mp3',
  '/play/spire-ascent/assets/sfx_crack.mp3',
  '/play/spire-ascent/assets/sfx_crumble.mp3',
  '/play/spire-ascent/assets/sfx_dash.mp3',
  '/play/spire-ascent/assets/sfx_death.mp3',
  '/play/spire-ascent/assets/sfx_ember.mp3',
  '/play/spire-ascent/assets/sfx_jump.mp3',
  '/play/spire-ascent/assets/sfx_jump_big.mp3',
  '/play/spire-ascent/assets/sfx_land.mp3',
  '/play/spire-ascent/assets/sfx_medal.mp3',
  '/play/spire-ascent/assets/sfx_milestone.mp3',
  '/play/spire-ascent/assets/sfx_rumble.mp3',
  '/play/spire-ascent/assets/sfx_spike.mp3',
  '/play/spire-ascent/assets/sfx_spring.mp3',
  '/play/spire-ascent/assets/sfx_start.mp3',
  '/play/spire-ascent/assets/sfx_ui.mp3',
  '/play/spire-ascent/assets/sfx_unlock.mp3',
  '/play/spire-ascent/assets/sfx_wallkick.mp3',
  '/play/spire-ascent/assets/sfx_wind.mp3',
  '/play/spire-ascent/assets/sky_0.png',
  '/play/spire-ascent/assets/sky_1.png',
  '/play/spire-ascent/assets/sky_2.png',
  '/play/spire-ascent/assets/sky_3.png',
  '/play/spire-ascent/assets/vignette.png',
  '/play/spire-ascent/assets/wall_0.png',
  '/play/spire-ascent/assets/wall_1.png',
  '/play/spire-ascent/assets/wall_2.png',
  '/play/spire-ascent/assets/wall_3.png',
  '/play/spire-ascent/assets/windfield.png',
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
