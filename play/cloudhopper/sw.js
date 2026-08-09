/* sw-template.js - Cloudhopper offline shell. */
const SLUG = 'cloudhopper';
const VERSION = '1.2.1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/cloudhopper/', '/play/cloudhopper/index.html', '/play/cloudhopper/style.css', '/play/cloudhopper/game.js',
  '/play/cloudhopper/manifest.json', '/play/cloudhopper/LICENSES.md', '/play/cloudhopper/icon.png', '/play/cloudhopper/icon512.png',
  '/play/cloudhopper/assets/ui_confirm.mp3', '/play/cloudhopper/assets/ui_select.mp3',
  '/play/cloudhopper/assets/ring_pass.mp3', '/play/cloudhopper/assets/cargo_pickup.mp3',
  '/play/cloudhopper/assets/stall_warn.mp3', '/play/cloudhopper/assets/fuel_low.mp3',
  '/play/cloudhopper/assets/landing.mp3', '/play/cloudhopper/assets/crash.mp3', '/play/cloudhopper/assets/engine.mp3',
  '/play/cloudhopper/assets/flight_dawn.mp3', '/play/cloudhopper/assets/flight_sunset.mp3',
  '/play/_shared/ggkit.js', '/play/_shared/three/three.module.min.js'
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
  const isShell = /\.(html|js|css|json)$/.test(url.pathname) || url.pathname.endsWith('/');
  if (isShell) {
    event.respondWith(fetch(event.request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
      return response;
    }).catch(() => caches.match(event.request).then((hit) => hit || caches.match('/play/' + SLUG + '/index.html'))));
  } else {
    event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
      return response;
    })));
  }
});
