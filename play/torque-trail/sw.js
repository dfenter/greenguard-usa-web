/* sw-template.js filled for Torque Trail. */
const SLUG = 'torque-trail';
const VERSION = '2026-08-11-gt1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/torque-trail/',
  '/play/torque-trail/index.html',
  '/play/torque-trail/game.js',
  '/play/torque-trail/manifest.json',
  '/play/torque-trail/icon.png',
  '/play/torque-trail/icon512.png',
  '/play/torque-trail/tracks/frontier-main.json',
  '/play/torque-trail/tracks/job-mire-seals.json',
  '/play/torque-trail/tracks/job-ridge-lanterns.json',
  '/play/torque-trail/tracks/job-silt-medicine.json',
  '/play/torque-trail/tracks/job-survey-cores.json',
  '/play/torque-trail/tracks/job-field-radios.json',
  '/play/torque-trail/tracks/job-mire-fuel.json',
  '/play/torque-trail/tracks/job-quarry-bearings.json',
  '/play/torque-trail/tracks/job-quarry-relays.json',
  '/play/torque-trail/tracks/job-stone-samples.json',
  '/play/torque-trail/tracks/job-lantern-batteries.json',
  '/play/torque-trail/tracks/job-ridge-mesh.json',
  '/play/torque-trail/tracks/job-long-haul.json',
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
