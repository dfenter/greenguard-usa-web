/* sw-template.js - Towerline Duel cache. Generated from /play/_shared/sw-template.js. */
const SLUG = 'towerline-duel';
const VERSION = '2026-08-10-aaa-fix-2-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/towerline-duel/',
  '/play/towerline-duel/index.html',
  '/play/towerline-duel/game.js',
  '/play/towerline-duel/style.css',
  '/play/towerline-duel/manifest.json',
  '/play/towerline-duel/sw.js',
  '/play/towerline-duel/icon.png',
  '/play/towerline-duel/icon512.png',
  '/play/towerline-duel/favicon.png',
  '/play/towerline-duel/assets/deploy_thud.mp3',
  '/play/towerline-duel/assets/clash_clang.mp3',
  '/play/towerline-duel/assets/spell_cast.mp3',
  '/play/towerline-duel/assets/victory_fanfare.mp3',
  '/play/towerline-duel/assets/select_click.mp3',
  '/play/towerline-duel/assets/confirm_ping.mp3',
  '/play/towerline-duel/assets/cancel_tick.mp3',
  '/play/towerline-duel/assets/hit_snap.mp3',
  '/play/towerline-duel/assets/kill_crack.mp3',
  '/play/towerline-duel/assets/warning_pulse.mp3',
  '/play/towerline-duel/assets/wave_clear.mp3',
  '/play/towerline-duel/assets/music_bed.mp3',
  '/play/towerline-duel/assets/danger_layer.mp3',
  '/play/towerline-duel/assets/victory_layer.mp3',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('gg-' + SLUG + '-') && key !== CACHE).map((key) => caches.delete(key))
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
