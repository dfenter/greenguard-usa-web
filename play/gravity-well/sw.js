/* sw-template.js - Gravity Well cache manifest, derived from /play/_shared/sw-template.js. */
const SLUG = 'gravity-well';
const VERSION = '2026-08-10-aaa-fix-2-ui-declutter';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/gravity-well/',
  '/play/gravity-well/index.html',
  '/play/gravity-well/game.js',
  '/play/gravity-well/manifest.json',
  '/play/gravity-well/icon.png',
  '/play/gravity-well/icon512.png',
  '/play/gravity-well/favicon.ico',
  '/play/gravity-well/assets/ambient.mp3',
  '/play/gravity-well/assets/intensity.mp3',
  '/play/gravity-well/assets/thrust.mp3',
  '/play/gravity-well/assets/refuel.mp3',
  '/play/gravity-well/assets/crash-soft.mp3',
  '/play/gravity-well/assets/crash-hard.mp3',
  '/play/gravity-well/assets/beacon.mp3',
  '/play/gravity-well/assets/pickup.mp3',
  '/play/gravity-well/assets/shield.mp3',
  '/play/gravity-well/assets/shortcut.mp3',
  '/play/gravity-well/assets/warning.mp3',
  '/play/gravity-well/assets/lander-idle.svg',
  '/play/gravity-well/assets/lander-thrust.svg',
  '/play/gravity-well/assets/lander-damaged.svg',
  '/play/gravity-well/assets/hazard-crystal.svg',
  '/play/gravity-well/assets/hazard-ice.svg',
  '/play/gravity-well/assets/hazard-vent.svg',
  '/play/gravity-well/assets/hazard-machine.svg',
  '/play/gravity-well/assets/hazard-core.svg',
  '/play/gravity-well/assets/pickup-fuel.svg',
  '/play/gravity-well/assets/pickup-shield.svg',
  '/play/gravity-well/assets/pickup-crystal.svg',
  '/play/gravity-well/assets/pickup-bubble.svg',
  '/play/gravity-well/assets/refuel-pad.svg',
  '/play/gravity-well/assets/shortcut-chute.svg',
  '/play/gravity-well/assets/beacon-core.svg',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((k) => k.startsWith('gg-' + SLUG + '-') && k !== CACHE).map((k) => caches.delete(k))
  )).then(() => self.clients.claim()));
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
