const SLUG = 'corridor-crawl';
const VERSION = 'aaa-20260810-f7';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/corridor-crawl/',
  '/play/corridor-crawl/index.html',
  '/play/corridor-crawl/core.js',
  '/play/corridor-crawl/dungeon.js',
  '/play/corridor-crawl/game.js',
  '/play/corridor-crawl/manifest.json',
  '/play/corridor-crawl/sw.js',
  '/play/corridor-crawl/icon.png',
  '/play/corridor-crawl/icon512.png',
  '/play/corridor-crawl/favicon.png',
  '/play/corridor-crawl/assets/corridor-atlas.svg',
  '/play/corridor-crawl/assets/audio/step.mp3',
  '/play/corridor-crawl/assets/audio/hit.mp3',
  '/play/corridor-crawl/assets/audio/hurt.mp3',
  '/play/corridor-crawl/assets/audio/pickup.mp3',
  '/play/corridor-crawl/assets/audio/item-use.mp3',
  '/play/corridor-crawl/assets/audio/stairs.mp3',
  '/play/corridor-crawl/assets/audio/crown.mp3',
  '/play/corridor-crawl/assets/audio/death.mp3',
  '/play/corridor-crawl/assets/audio/escape.mp3',
  '/play/corridor-crawl/assets/audio/telegraph.mp3',
  '/play/corridor-crawl/assets/audio/ambience-warrens.mp3',
  '/play/corridor-crawl/assets/audio/ambience-flooded.mp3',
  '/play/corridor-crawl/assets/audio/ambience-forge.mp3',
  '/play/corridor-crawl/assets/audio/ambience-vault.mp3',
  '/play/_shared/ggkit.js',
  '/play/_shared/phaser.min.js'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('gg-' + SLUG + '-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (!url.pathname.startsWith('/play/' + SLUG + '/') && !url.pathname.startsWith('/play/_shared/')) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  })));
});
