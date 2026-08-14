/* Ridge Glider service worker. Authored from /play/_shared/sw-template.js. */
const SLUG = 'ridge-glider';
const VERSION = 'aaa-20260810-03';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/ridge-glider/', '/play/ridge-glider/index.html', '/play/ridge-glider/game.js', '/play/ridge-glider/world.js',
  '/play/ridge-glider/manifest.json', '/play/ridge-glider/icon.png', '/play/ridge-glider/icon512.png', '/play/ridge-glider/favicon.png',
  '/play/ridge-glider/assets/wind_loop.mp3', '/play/ridge-glider/assets/canopy_flutter.mp3', '/play/ridge-glider/assets/thermal_chime.mp3', '/play/ridge-glider/assets/landing_thud.mp3',
  '/play/_shared/ggkit.js', '/play/_shared/three/three.module.min.js'
];
self.addEventListener('install', (event) => { event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (event) => { event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('gg-' + SLUG + '-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (!url.pathname.startsWith('/play/' + SLUG + '/') && !url.pathname.startsWith('/play/_shared/')) return;
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request).then((response) => { if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone())); return response; })));
});
