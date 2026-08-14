/* sw-template.js — copy to /play/<slug>/sw.js and fill SLUG, VERSION, ASSETS.
 * Offline-after-first-load per the UX/PWA gate. Cache-first for same-origin
 * GETs under /play/<slug>/ and /play/_shared/; network passthrough otherwise.
 * Bump VERSION on every deploy of the game to invalidate stale caches.
 */
const SLUG = 'stacklock';
const VERSION = '2026-08-10-ui-declutter-1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/stacklock/',
  '/play/stacklock/index.html',
  '/play/stacklock/favicon.png',
  '/play/stacklock/game.js',
  '/play/stacklock/icon.png',
  '/play/stacklock/icon512.png',
  '/play/stacklock/manifest.json',
  '/play/stacklock/sl_data.js',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js',
  '/play/stacklock/assets/atlas.json',
  '/play/stacklock/assets/atlas.png',
  '/play/stacklock/assets/disc.png',
  '/play/stacklock/assets/logo.png',
  '/play/stacklock/assets/music_board.mp3',
  '/play/stacklock/assets/music_rush.mp3',
  '/play/stacklock/assets/p_beam.png',
  '/play/stacklock/assets/p_ember.png',
  '/play/stacklock/assets/p_ring.png',
  '/play/stacklock/assets/p_shard.png',
  '/play/stacklock/assets/p_spark.png',
  '/play/stacklock/assets/sfx_bomb.mp3',
  '/play/stacklock/assets/sfx_clear1.mp3',
  '/play/stacklock/assets/sfx_clear2.mp3',
  '/play/stacklock/assets/sfx_clear3.mp3',
  '/play/stacklock/assets/sfx_combo.mp3',
  '/play/stacklock/assets/sfx_deny.mp3',
  '/play/stacklock/assets/sfx_goal.mp3',
  '/play/stacklock/assets/sfx_hard.mp3',
  '/play/stacklock/assets/sfx_hold.mp3',
  '/play/stacklock/assets/sfx_level.mp3',
  '/play/stacklock/assets/sfx_lock.mp3',
  '/play/stacklock/assets/sfx_move.mp3',
  '/play/stacklock/assets/sfx_over.mp3',
  '/play/stacklock/assets/sfx_pickup.mp3',
  '/play/stacklock/assets/sfx_quad.mp3',
  '/play/stacklock/assets/sfx_rotate.mp3',
  '/play/stacklock/assets/sfx_soft.mp3',
  '/play/stacklock/assets/sfx_tick.mp3',
  '/play/stacklock/assets/sfx_ui.mp3',
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
