/* Ridgeline Rumble service worker, authored from /play/_shared/sw-template.js. */
const SLUG = 'ridgeline-rumble';
const VERSION = '2026.08.10-aaa-2';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/ridgeline-rumble/',
  '/play/ridgeline-rumble/index.html',
  '/play/ridgeline-rumble/style.css',
  '/play/ridgeline-rumble/game.js',
  '/play/ridgeline-rumble/manifest.json',
  '/play/ridgeline-rumble/icon.png',
  '/play/ridgeline-rumble/icon512.png',
  '/play/ridgeline-rumble/favicon.png',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js',
  '/play/ridgeline-rumble/assets/select.mp3',
  '/play/ridgeline-rumble/assets/confirm.mp3',
  '/play/ridgeline-rumble/assets/cancel.mp3',
  '/play/ridgeline-rumble/assets/move.mp3',
  '/play/ridgeline-rumble/assets/attack.mp3',
  '/play/ridgeline-rumble/assets/hit.mp3',
  '/play/ridgeline-rumble/assets/kill.mp3',
  '/play/ridgeline-rumble/assets/warning.mp3',
  '/play/ridgeline-rumble/assets/wave.mp3',
  '/play/ridgeline-rumble/assets/ability.mp3',
  '/play/ridgeline-rumble/assets/tower.mp3',
  '/play/ridgeline-rumble/assets/victory.mp3',
  '/play/ridgeline-rumble/assets/defeat.mp3',
  '/play/ridgeline-rumble/assets/ridge-bed.mp3'
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
