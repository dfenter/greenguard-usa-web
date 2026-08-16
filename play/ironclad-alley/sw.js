/* Ironclad Alley service worker, authored from /play/_shared/sw-template.js. */
const SLUG = 'ironclad-alley';
const VERSION = 'aaa-2026-08-10-04-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/ironclad-alley/',
  '/play/ironclad-alley/index.html',
  '/play/ironclad-alley/game.js',
  '/play/ironclad-alley/manifest.json',
  '/play/ironclad-alley/icon.png',
  '/play/ironclad-alley/icon512.png',
  '/play/ironclad-alley/favicon.png',
  '/play/ironclad-alley/assets/engine-idle.mp3',
  '/play/ironclad-alley/assets/engine-rev.mp3',
  '/play/ironclad-alley/assets/cannon.mp3',
  '/play/ironclad-alley/assets/ricochet.mp3',
  '/play/ironclad-alley/assets/explosion.mp3',
  '/play/ironclad-alley/assets/pickup.mp3',
  '/play/ironclad-alley/assets/arena-surface.svg',
  '/play/ironclad-alley/assets/wall-plate.svg',
  '/play/ironclad-alley/assets/wall-angle.svg',
  '/play/ironclad-alley/assets/tank-player-idle.svg',
  '/play/ironclad-alley/assets/tank-player-drive.svg',
  '/play/ironclad-alley/assets/tank-player-hit.svg',
  '/play/ironclad-alley/assets/tank-player-wreck.svg',
  '/play/ironclad-alley/assets/tank-scout.svg',
  '/play/ironclad-alley/assets/tank-brawler.svg',
  '/play/ironclad-alley/assets/tank-sniper.svg',
  '/play/ironclad-alley/assets/tank-siege.svg',
  '/play/ironclad-alley/assets/tank-hit.svg',
  '/play/ironclad-alley/assets/tank-wreck.svg',
  '/play/ironclad-alley/assets/pickup-mine.svg',
  '/play/ironclad-alley/assets/pickup-armor.svg',
  '/play/ironclad-alley/assets/pickup-shell.svg',
  '/play/ironclad-alley/assets/pickup-smoke.svg',
  '/play/ironclad-alley/assets/pickup-speed.svg',
  '/play/ironclad-alley/assets/shell.svg',
  '/play/ironclad-alley/assets/fx-spark.svg',
  '/play/ironclad-alley/assets/fx-dust.svg',
  '/play/ironclad-alley/assets/fx-smoke.svg',
  '/play/ironclad-alley/assets/fx-ring.svg',
  '/play/ironclad-alley/assets/fx-shard.svg',
  '/play/ironclad-alley/assets/fx-glint.svg',
  '/play/_shared/ggkit.js',
  '/play/_shared/phaser.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((k) => k.startsWith('gg-' + SLUG + '-') && k !== CACHE).map((k) => caches.delete(k))
  )).then(() => self.clients.claim()));
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
