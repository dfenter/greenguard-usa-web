/* sw-template.js — copy to /play/<slug>/sw.js and fill SLUG, VERSION, ASSETS.
 * Offline-after-first-load per the UX/PWA gate. Cache-first for same-origin
 * GETs under /play/<slug>/ and /play/_shared/; network passthrough otherwise.
 * Bump VERSION on every deploy of the game to invalidate stale caches.
 */
const SLUG = 'ace-vector';
const VERSION = '2026-08-07b';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/ace-vector/',
  '/play/ace-vector/index.html',
  '/play/ace-vector/game.js',
  '/play/ace-vector/manifest.json',
  '/play/ace-vector/LICENSES.md',
  '/play/ace-vector/icon.png',
  '/play/ace-vector/icon512.png',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js',
  '/play/ace-vector/assets/air.json',
  '/play/ace-vector/assets/air.png',
  '/play/ace-vector/assets/clouds.png',
  '/play/ace-vector/assets/disc.png',
  '/play/ace-vector/assets/font_body.woff2',
  '/play/ace-vector/assets/font_display.woff2',
  '/play/ace-vector/assets/music_combat.mp3',
  '/play/ace-vector/assets/music_cruise.mp3',
  '/play/ace-vector/assets/p_fire.png',
  '/play/ace-vector/assets/p_flare.png',
  '/play/ace-vector/assets/p_smoke.png',
  '/play/ace-vector/assets/p_spark.png',
  '/play/ace-vector/assets/p_wisp.png',
  '/play/ace-vector/assets/ridge_far.png',
  '/play/ace-vector/assets/ridge_near.png',
  '/play/ace-vector/assets/sfx_ace_kill.mp3',
  '/play/ace-vector/assets/sfx_clear.mp3',
  '/play/ace-vector/assets/sfx_click.mp3',
  '/play/ace-vector/assets/sfx_eject.mp3',
  '/play/ace-vector/assets/sfx_fail.mp3',
  '/play/ace-vector/assets/sfx_flare.mp3',
  '/play/ace-vector/assets/sfx_foe_gun.mp3',
  '/play/ace-vector/assets/sfx_gun.mp3',
  '/play/ace-vector/assets/sfx_gun_wing.mp3',
  '/play/ace-vector/assets/sfx_hit.mp3',
  '/play/ace-vector/assets/sfx_hurt.mp3',
  '/play/ace-vector/assets/sfx_kill.mp3',
  '/play/ace-vector/assets/sfx_lock.mp3',
  '/play/ace-vector/assets/sfx_missile.mp3',
  '/play/ace-vector/assets/sfx_rank.mp3',
  '/play/ace-vector/assets/sfx_select.mp3',
  '/play/ace-vector/assets/sfx_sortie.mp3',
  '/play/ace-vector/assets/ui.json',
  '/play/ace-vector/assets/ui.png',
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
