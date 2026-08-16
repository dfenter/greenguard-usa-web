/* sw-template.js — copy to /play/<slug>/sw.js and fill SLUG, VERSION, ASSETS.
 * Offline-after-first-load per the UX/PWA gate. Cache-first for same-origin
 * GETs under /play/<slug>/ and /play/_shared/; network passthrough otherwise.
 * Bump VERSION on every deploy of the game to invalidate stale caches.
 */
const SLUG = 'skyfall-command';
const VERSION = '2026-08-08-uplift-round2-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/skyfall-command/',
  '/play/skyfall-command/index.html',
  '/play/skyfall-command/game.js',
  '/play/skyfall-command/manifest.json',
  '/play/skyfall-command/icon.png',
  '/play/skyfall-command/icon512.png',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js',
  '/play/skyfall-command/assets/atlas.json',
  '/play/skyfall-command/assets/atlas.png',
  '/play/skyfall-command/assets/aurora.png',
  '/play/skyfall-command/assets/city_far.png',
  '/play/skyfall-command/assets/city_mid.png',
  '/play/skyfall-command/assets/city_near.png',
  '/play/skyfall-command/assets/clouds.png',
  '/play/skyfall-command/assets/digits.json',
  '/play/skyfall-command/assets/digits.png',
  '/play/skyfall-command/assets/disc.png',
  '/play/skyfall-command/assets/ground.png',
  '/play/skyfall-command/assets/logo.png',
  '/play/skyfall-command/assets/music_alert.mp3',
  '/play/skyfall-command/assets/music_night.mp3',
  '/play/skyfall-command/assets/neb.png',
  '/play/skyfall-command/assets/p_ember.png',
  '/play/skyfall-command/assets/p_fire.png',
  '/play/skyfall-command/assets/p_flare.png',
  '/play/skyfall-command/assets/p_ribbon.png',
  '/play/skyfall-command/assets/p_shard.png',
  '/play/skyfall-command/assets/p_smoke.png',
  '/play/skyfall-command/assets/p_spark.png',
  '/play/skyfall-command/assets/sfx_airburst.mp3',
  '/play/skyfall-command/assets/sfx_armor.mp3',
  '/play/skyfall-command/assets/sfx_buy.mp3',
  '/play/skyfall-command/assets/sfx_clear.mp3',
  '/play/skyfall-command/assets/sfx_cruiser.mp3',
  '/play/skyfall-command/assets/sfx_defeat.mp3',
  '/play/skyfall-command/assets/sfx_district.mp3',
  '/play/skyfall-command/assets/sfx_dry.mp3',
  '/play/skyfall-command/assets/sfx_impact.mp3',
  '/play/skyfall-command/assets/sfx_launch.mp3',
  '/play/skyfall-command/assets/sfx_pod.mp3',
  '/play/skyfall-command/assets/sfx_reload.mp3',
  '/play/skyfall-command/assets/sfx_shield.mp3',
  '/play/skyfall-command/assets/sfx_siren.mp3',
  '/play/skyfall-command/assets/sfx_splinter.mp3',
  '/play/skyfall-command/assets/sfx_ui.mp3',
  '/play/skyfall-command/assets/sfx_wraith.mp3',
  '/play/skyfall-command/assets/stars.png',
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
  const ROOT = '/play/' + SLUG;
  // The deployed site serves the title at the NO-TRAILING-SLASH url and
  // 308-redirects the slash form onto it. The old scope test required
  // ROOT + '/', so the canonical navigation was never in scope, the worker
  // never answered it, and offline died on EVERY title in the fleet while
  // still reporting a registered service worker. Accept both forms.
  const inScope = url.pathname === ROOT || url.pathname.startsWith(ROOT + '/')
    || url.pathname.startsWith('/play/_shared/') || url.pathname.startsWith('/play/_assets/');
  if (!inScope) return;
  const isRoot = url.pathname === ROOT || url.pathname === ROOT + '/';
  const INDEX = ROOT + '/index.html';
  e.respondWith(
    caches.match(isRoot ? INDEX : e.request, { ignoreSearch: true })
      .then((hit) => hit || caches.match(e.request, { ignoreSearch: true }))
      .then((hit) =>
        hit ||
        fetch(e.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        }).catch(() =>
          e.request.mode === 'navigate' ? caches.match(INDEX) : Promise.reject(new Error('offline'))
        )
      )
  );
});
