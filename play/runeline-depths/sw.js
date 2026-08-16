/* Runeline Depths service worker, authored from /play/_shared/sw-template.js.
 * Every path below is verified to exist in the shipped directory. */
const SLUG = 'runeline-depths';
const VERSION = '2026-08-13-aaa1-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/runeline-depths/',
  '/play/runeline-depths/index.html',
  '/play/runeline-depths/manifest.json',
  '/play/runeline-depths/sw.js',
  '/play/runeline-depths/favicon.png',
  '/play/runeline-depths/icon.png',
  '/play/runeline-depths/icon512.png',
  '/play/runeline-depths/js/content.js',
  '/play/runeline-depths/js/sim.js',
  '/play/runeline-depths/js/art.js',
  '/play/runeline-depths/js/fx.js',
  '/play/runeline-depths/js/ui.js',
  '/play/runeline-depths/js/boot.js',
  '/play/runeline-depths/js/menu.js',
  '/play/runeline-depths/js/play.js',
  '/play/runeline-depths/js/main.js',
  '/play/runeline-depths/assets/bind.mp3',
  '/play/runeline-depths/assets/boss_down.mp3',
  '/play/runeline-depths/assets/cascade.mp3',
  '/play/runeline-depths/assets/combo.mp3',
  '/play/runeline-depths/assets/enemy_hit.mp3',
  '/play/runeline-depths/assets/evolve.mp3',
  '/play/runeline-depths/assets/fail.mp3',
  '/play/runeline-depths/assets/heal.mp3',
  '/play/runeline-depths/assets/invalid.mp3',
  '/play/runeline-depths/assets/match.mp3',
  '/play/runeline-depths/assets/orb_move.mp3',
  '/play/runeline-depths/assets/orb_pick.mp3',
  '/play/runeline-depths/assets/recruit.mp3',
  '/play/runeline-depths/assets/room_clear.mp3',
  '/play/runeline-depths/assets/shield_break.mp3',
  '/play/runeline-depths/assets/strike.mp3',
  '/play/runeline-depths/assets/ui_click.mp3',
  '/play/runeline-depths/assets/music_vault.mp3',
  '/play/runeline-depths/assets/music_deep.mp3',
  '/play/runeline-depths/assets/music_hall.mp3',
  '/play/_shared/ggkit.js',
  '/play/_shared/phaser.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.startsWith('gg-' + SLUG + '-') && k !== CACHE).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
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
