/* sw-template.js - Towerline Duel cache. Generated from /play/_shared/sw-template.js. */
const SLUG = 'towerline-duel';
const VERSION = '2026-08-10-aaa-fix-2';
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
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (!url.pathname.startsWith('/play/' + SLUG + '/') && !url.pathname.startsWith('/play/_shared/')) return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
      return response;
    }))
  );
});
