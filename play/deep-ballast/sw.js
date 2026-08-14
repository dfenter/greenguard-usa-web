/* sw-template.js - Deep Ballast offline shell. VERSION changes invalidate old caches. */
const SLUG = 'deep-ballast';
const VERSION = '2026-08-10-aaa-f1-fix1-ui-declutter1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/deep-ballast/',
  '/play/deep-ballast/index.html',
  '/play/deep-ballast/game.js',
  '/play/deep-ballast/manifest.json',
  '/play/deep-ballast/icon.png',
  '/play/deep-ballast/icon512.png',
  '/play/deep-ballast/favicon.png',
  '/play/deep-ballast/assets/sonar.mp3',
  '/play/deep-ballast/assets/hull-creak.mp3',
  '/play/deep-ballast/assets/fauna-call.mp3',
  '/play/deep-ballast/assets/deep-drone.mp3',
  '/play/deep-ballast/assets/dry-dock.mp3',
  '/play/deep-ballast/assets/salvage.mp3',
  '/play/deep-ballast/assets/air-pickup.mp3',
  '/play/deep-ballast/assets/survey.mp3',
  '/play/deep-ballast/assets/rescue.mp3',
  '/play/deep-ballast/assets/surface.mp3',
  '/play/deep-ballast/assets/failure.mp3',
  '/play/deep-ballast/assets/upgrade.mp3',
  '/play/_shared/ggkit.js',
  '/play/_shared/three/three.module.min.js'
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
    if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
    return res;
  })));
});
