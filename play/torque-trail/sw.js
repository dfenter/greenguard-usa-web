/* sw-template.js filled for Torque Trail. */
const SLUG = 'torque-trail';
const VERSION = '2026-08-07-fix1c';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/torque-trail/',
  '/play/torque-trail/index.html',
  '/play/torque-trail/game.js',
  '/play/torque-trail/manifest.json',
  '/play/torque-trail/icon.png',
  '/play/torque-trail/icon512.png',
  '/play/torque-trail/assets/cars/SUV.obj',
  '/play/torque-trail/assets/cars/SUV.mtl',
  '/play/torque-trail/assets/music/quiet-range.mp3',
  '/play/torque-trail/assets/music/open-trail.mp3',
  '/play/torque-trail/assets/sfx/click.mp3',
  '/play/torque-trail/assets/sfx/confirm.mp3',
  '/play/torque-trail/assets/sfx/back.mp3',
  '/play/torque-trail/assets/sfx/open.mp3',
  '/play/torque-trail/assets/sfx/drop.mp3',
  '/play/torque-trail/assets/sfx/select.mp3',
  '/play/torque-trail/assets/sfx/winch.mp3',
  '/play/torque-trail/assets/sfx/mud.mp3',
  '/play/torque-trail/assets/sfx/wood.mp3',
  '/play/torque-trail/assets/sfx/payout.mp3',
  '/play/_shared/ggkit.js',
  '/play/_shared/three/three.module.min.js',
  '/play/_shared/three/OBJLoader.js'
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
  const isCode = url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname.endsWith('.json');
  if (isCode) {
    event.respondWith(fetch(event.request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
      return response;
    }).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request).then((response) => {
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  })));
});
