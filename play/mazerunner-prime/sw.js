/* Mazerunner Prime service worker. Authored from /play/_shared/sw-template.js. */
const SLUG = 'mazerunner-prime';
const VERSION = 'aaa-2026-08-10-03';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/mazerunner-prime/',
  '/play/mazerunner-prime/index.html',
  '/play/mazerunner-prime/game.js',
  '/play/mazerunner-prime/manifest.json',
  '/play/mazerunner-prime/icon.png',
  '/play/mazerunner-prime/icon512.png',
  '/play/mazerunner-prime/favicon.ico',
  '/play/mazerunner-prime/favicon.png',
  '/play/mazerunner-prime/sw.js',
  '/play/mazerunner-prime/assets/pellet-chomp.mp3',
  '/play/mazerunner-prime/assets/power-siren.mp3',
  '/play/mazerunner-prime/assets/chase-stem.mp3',
  '/play/mazerunner-prime/assets/fright-stem.mp3',
  '/play/mazerunner-prime/assets/catch-stinger.mp3',
  '/play/mazerunner-prime/assets/danger-stem.mp3',
  '/play/mazerunner-prime/assets/turn-click.mp3',
  '/play/mazerunner-prime/assets/multiplier-rise.mp3',
  '/play/mazerunner-prime/assets/shield-pop.mp3',
  '/play/mazerunner-prime/assets/life-chime.mp3',
  '/play/mazerunner-prime/assets/gate-whoosh.mp3',
  '/play/mazerunner-prime/assets/danger-warning.mp3',
  '/play/mazerunner-prime/assets/completion-fanfare.mp3',
  '/play/mazerunner-prime/assets/floor.svg',
  '/play/mazerunner-prime/assets/wall.svg',
  '/play/mazerunner-prime/assets/pellet.svg',
  '/play/mazerunner-prime/assets/power.svg',
  '/play/mazerunner-prime/assets/boost.svg',
  '/play/mazerunner-prime/assets/shard.svg',
  '/play/mazerunner-prime/assets/runner-idle.svg',
  '/play/mazerunner-prime/assets/runner-move.svg',
  '/play/mazerunner-prime/assets/runner-power.svg',
  '/play/mazerunner-prime/assets/runner-caught.svg',
  '/play/mazerunner-prime/assets/chaser.svg',
  '/play/mazerunner-prime/assets/chaser-frightened.svg',
  '/play/mazerunner-prime/assets/chaser-caught.svg',
  '/play/_shared/ggkit.js',
  '/play/_shared/phaser.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('gg-' + SLUG + '-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (!url.pathname.startsWith('/play/' + SLUG + '/') && !url.pathname.startsWith('/play/_shared/')) return;
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request).then((response) => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, copy)); }
    return response;
  })));
});
