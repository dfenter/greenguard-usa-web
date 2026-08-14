const SLUG = 'bastionworks';
const VERSION = 'aaa-20260811-02';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/bastionworks/',
  '/play/bastionworks/index.html',
  '/play/bastionworks/styles.css',
  '/play/bastionworks/game.js',
  '/play/bastionworks/manifest.json',
  '/play/bastionworks/icon.png',
  '/play/bastionworks/icon512.png',
  '/play/bastionworks/favicon.png',
  '/play/bastionworks/assets/audio/build-thud.mp3',
  '/play/bastionworks/assets/audio/troop-march.mp3',
  '/play/bastionworks/assets/audio/raid-horn.mp3',
  '/play/bastionworks/assets/audio/victory-fanfare.mp3',
  '/play/bastionworks/assets/audio/hit.mp3',
  '/play/bastionworks/assets/audio/collapse.mp3',
  '/play/bastionworks/assets/audio/medal.mp3',
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
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  })));
});
