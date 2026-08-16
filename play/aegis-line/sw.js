/* sw-template.js - copy to /play/<slug>/sw.js and fill SLUG, VERSION, ASSETS.
 * Offline-after-first-load per the UX/PWA gate. Cache-first for same-origin
 * GETs under /play/<slug>/ and /play/_shared/; network passthrough otherwise.
 * Bump VERSION on every deploy of the game to invalidate stale caches.
 */
const SLUG = 'aegis-line';
const VERSION = '2026-08-13-aaa-1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/aegis-line/',
  '/play/aegis-line/index.html',
  '/play/aegis-line/manifest.json',
  '/play/aegis-line/icon.png',
  '/play/aegis-line/icon512.png',
  '/play/aegis-line/al_data.js',
  '/play/aegis-line/al_art.js',
  '/play/aegis-line/al_core.js',
  '/play/aegis-line/al_play.js',
  '/play/aegis-line/al_paint.js',
  '/play/aegis-line/game.js',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js',
  '/play/aegis-line/assets/music_command.mp3',
  '/play/aegis-line/assets/music_field.mp3',
  '/play/aegis-line/assets/music_siege.mp3',
  '/play/aegis-line/assets/sfx_advance.mp3',
  '/play/aegis-line/assets/sfx_alarm.mp3',
  '/play/aegis-line/assets/sfx_boss_kill.mp3',
  '/play/aegis-line/assets/sfx_burst.mp3',
  '/play/aegis-line/assets/sfx_clear.mp3',
  '/play/aegis-line/assets/sfx_confirm.mp3',
  '/play/aegis-line/assets/sfx_crit.mp3',
  '/play/aegis-line/assets/sfx_fail.mp3',
  '/play/aegis-line/assets/sfx_hit.mp3',
  '/play/aegis-line/assets/sfx_hurt.mp3',
  '/play/aegis-line/assets/sfx_kill.mp3',
  '/play/aegis-line/assets/sfx_perfect.mp3',
  '/play/aegis-line/assets/sfx_reload.mp3',
  '/play/aegis-line/assets/sfx_shield.mp3',
  '/play/aegis-line/assets/sfx_shot.mp3',
  '/play/aegis-line/assets/sfx_shot_heavy.mp3',
  '/play/aegis-line/assets/sfx_ui.mp3',
  '/play/aegis-line/assets/sfx_unlock.mp3',
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
