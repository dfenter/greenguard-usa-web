/* sw-template.js — copy to /play/<slug>/sw.js and fill SLUG, VERSION, ASSETS.
 * Offline-after-first-load per the UX/PWA gate. Cache-first for same-origin
 * GETs under /play/<slug>/ and /play/_shared/; network passthrough otherwise.
 * Bump VERSION on every deploy of the game to invalidate stale caches.
 */
const SLUG = 'driftlands';
const VERSION = '1.2.0';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/driftlands/',
  '/play/driftlands/index.html',
  '/play/driftlands/art.js',
  '/play/driftlands/world.js',
  '/play/driftlands/game.js',
  '/play/driftlands/manifest.json',
  '/play/driftlands/icon.png',
  '/play/driftlands/icon512.png',
  '/play/driftlands/favicon.png',
  '/play/driftlands/assets/img/tiny-town.png',
  '/play/driftlands/assets/img/tiny-dungeon.png',
  '/play/driftlands/assets/audio/m_deep.mp3',
  '/play/driftlands/assets/audio/m_isle.mp3',
  '/play/driftlands/assets/audio/m_tide.mp3',
  '/play/driftlands/assets/audio/m_title.mp3',
  '/play/driftlands/assets/audio/s_boss.mp3',
  '/play/driftlands/assets/audio/s_chop.mp3',
  '/play/driftlands/assets/audio/s_door.mp3',
  '/play/driftlands/assets/audio/s_heart.mp3',
  '/play/driftlands/assets/audio/s_hit.mp3',
  '/play/driftlands/assets/audio/s_hurt.mp3',
  '/play/driftlands/assets/audio/s_kill.mp3',
  '/play/driftlands/assets/audio/s_pickup.mp3',
  '/play/driftlands/assets/audio/s_relic.mp3',
  '/play/driftlands/assets/audio/s_reveal.mp3',
  '/play/driftlands/assets/audio/s_sealed.mp3',
  '/play/driftlands/assets/audio/s_sigil.mp3',
  '/play/driftlands/assets/audio/s_step_grass.mp3',
  '/play/driftlands/assets/audio/s_step_sand.mp3',
  '/play/driftlands/assets/audio/s_step_stone.mp3',
  '/play/driftlands/assets/audio/s_swing.mp3',
  '/play/driftlands/assets/audio/s_ui.mp3',
  '/play/driftlands/assets/audio/s_win.mp3',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js'
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
