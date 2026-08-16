/* Fieldnotes Safari service worker. Authored from /play/_shared/sw-template.js. */
const SLUG = 'fieldnotes-safari';
const VERSION = 'aaa-f18-20260816-01';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/fieldnotes-safari/',
  '/play/fieldnotes-safari/index.html',
  '/play/fieldnotes-safari/styles.css',
  '/play/fieldnotes-safari/game.js',
  '/play/fieldnotes-safari/manifest.json',
  '/play/fieldnotes-safari/sw.js',
  '/play/fieldnotes-safari/icon.png',
  '/play/fieldnotes-safari/icon512.png',
  '/play/fieldnotes-safari/favicon.png',
  '/play/fieldnotes-safari/assets/music-delta.mp3',
  '/play/fieldnotes-safari/assets/music-crater.mp3',
  '/play/fieldnotes-safari/assets/step.mp3',
  '/play/fieldnotes-safari/assets/rustle.mp3',
  '/play/fieldnotes-safari/assets/approach.mp3',
  '/play/fieldnotes-safari/assets/bait.mp3',
  '/play/fieldnotes-safari/assets/lure.mp3',
  '/play/fieldnotes-safari/assets/ring.mp3',
  '/play/fieldnotes-safari/assets/throw.mp3',
  '/play/fieldnotes-safari/assets/catch.mp3',
  '/play/fieldnotes-safari/assets/miss.mp3',
  '/play/fieldnotes-safari/assets/flee.mp3',
  '/play/fieldnotes-safari/assets/photo.mp3',
  '/play/fieldnotes-safari/assets/journal.mp3',
  '/play/fieldnotes-safari/assets/unlock.mp3',
  '/play/fieldnotes-safari/assets/boundary.mp3',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js'
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
