/* Vertol Rescue service worker. Cache-first after the first load. */
const SLUG = 'vertol-rescue';
const VERSION = 'aaa-f1-20260810-v3';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/vertol-rescue/',
  '/play/vertol-rescue/index.html',
  '/play/vertol-rescue/game.js',
  '/play/vertol-rescue/manifest.json',
  '/play/vertol-rescue/icon.png',
  '/play/vertol-rescue/icon512.png',
  '/play/vertol-rescue/favicon.png',
  '/play/vertol-rescue/assets/rotor.mp3',
  '/play/vertol-rescue/assets/night.mp3',
  '/play/vertol-rescue/assets/wind.mp3',
  '/play/vertol-rescue/assets/radio.mp3',
  '/play/vertol-rescue/assets/cry.mp3',
  '/play/vertol-rescue/assets/secure.mp3',
  '/play/vertol-rescue/assets/impact.mp3',
  '/play/vertol-rescue/assets/medal.mp3',
  '/play/vertol-rescue/assets/pickup.mp3',
  '/play/vertol-rescue/assets/landing.mp3',
  '/play/vertol-rescue/assets/tailwash.mp3',
  '/play/_shared/ggkit.js',
  '/play/_shared/three/three.module.min.js'
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
