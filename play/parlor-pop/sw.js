/* Parlor Pop offline cache. Keep this list limited to files that exist. */
const SLUG = 'parlor-pop';
const VERSION = '2026.08.10.5-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/parlor-pop/',
  '/play/parlor-pop/index.html',
  '/play/parlor-pop/manifest.json',
  '/play/parlor-pop/favicon.png',
  '/play/parlor-pop/icon.png',
  '/play/parlor-pop/icon512.png',
  '/play/parlor-pop/levels.js',
  '/play/parlor-pop/engine.js',
  '/play/parlor-pop/meta.js',
  '/play/parlor-pop/audio.js',
  '/play/parlor-pop/game.js',
  '/play/parlor-pop/assets/swap_tick.mp3',
  '/play/parlor-pop/assets/invalid_move.mp3',
  '/play/parlor-pop/assets/match_pop.mp3',
  '/play/parlor-pop/assets/crate_smash.mp3',
  '/play/parlor-pop/assets/ivy_threat.mp3',
  '/play/parlor-pop/assets/booster_payoff.mp3',
  '/play/parlor-pop/assets/goal_clear.mp3',
  '/play/parlor-pop/assets/room_reveal.mp3',
  '/play/parlor-pop/assets/ui_click.mp3',
  '/play/parlor-pop/assets/room_theme.mp3',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js'
];
self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (key) { return key.indexOf('gg-' + SLUG + '-') === 0 && key !== CACHE; }).map(function (key) { return caches.delete(key); })); }).then(function () { return self.clients.claim(); }));
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
