/* sw-template.js — copy to /play/<slug>/sw.js and fill SLUG, VERSION, ASSETS.
 * Offline-after-first-load per the UX/PWA gate. Cache-first for same-origin
 * GETs under /play/<slug>/ and /play/_shared/; network passthrough otherwise.
 * Bump VERSION on every deploy of the game to invalidate stale caches.
 */
const SLUG = 'hullbreaker';
const VERSION = '2026-08-10-ui-declutter1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/hullbreaker/',
  '/play/hullbreaker/index.html',
  '/play/hullbreaker/manifest.json',
  '/play/hullbreaker/icon.png',
  '/play/hullbreaker/icon512.png',
  '/play/hullbreaker/hb_data.js',
  '/play/hullbreaker/game.js',
  '/play/hullbreaker/hb_menu.js',
  '/play/hullbreaker/hb_play.js',
  '/play/hullbreaker/hb_hud.js',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js',
  '/play/hullbreaker/assets/atlas.json',
  '/play/hullbreaker/assets/atlas.png',
  '/play/hullbreaker/assets/atlas2.json',
  '/play/hullbreaker/assets/atlas2.png',
  '/play/hullbreaker/assets/favicon.png',
  '/play/hullbreaker/assets/logo.png',
  '/play/hullbreaker/assets/music_boss.mp3',
  '/play/hullbreaker/assets/music_field.mp3',
  '/play/hullbreaker/assets/music_intensity.mp3',
  '/play/hullbreaker/assets/neb.png',
  '/play/hullbreaker/assets/sfx_banner.mp3',
  '/play/hullbreaker/assets/sfx_boss.mp3',
  '/play/hullbreaker/assets/sfx_critical.mp3',
  '/play/hullbreaker/assets/sfx_dash.mp3',
  '/play/hullbreaker/assets/sfx_engine.mp3',
  '/play/hullbreaker/assets/sfx_frac_big.mp3',
  '/play/hullbreaker/assets/sfx_frac_med.mp3',
  '/play/hullbreaker/assets/sfx_frac_small.mp3',
  '/play/hullbreaker/assets/sfx_homing.mp3',
  '/play/hullbreaker/assets/sfx_laser.mp3',
  '/play/hullbreaker/assets/sfx_lose.mp3',
  '/play/hullbreaker/assets/sfx_medal.mp3',
  '/play/hullbreaker/assets/sfx_ore.mp3',
  '/play/hullbreaker/assets/sfx_overheat.mp3',
  '/play/hullbreaker/assets/sfx_pickup.mp3',
  '/play/hullbreaker/assets/sfx_pulse.mp3',
  '/play/hullbreaker/assets/sfx_shield.mp3',
  '/play/hullbreaker/assets/sfx_spread.mp3',
  '/play/hullbreaker/assets/sfx_ui.mp3',
  '/play/hullbreaker/assets/sfx_upgrade.mp3',
  '/play/hullbreaker/assets/stars.png',
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
