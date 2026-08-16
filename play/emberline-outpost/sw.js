/* Derived from /play/_shared/sw-template.js. */
const SLUG = 'emberline-outpost';
const VERSION = 'aaa-20260816-1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/emberline-outpost/',
  '/play/emberline-outpost/index.html',
  '/play/emberline-outpost/manifest.json',
  '/play/emberline-outpost/icon.png',
  '/play/emberline-outpost/icon512.png',
  '/play/emberline-outpost/favicon.ico',
  '/play/emberline-outpost/js/data.js',
  '/play/emberline-outpost/js/game.js',
  '/play/emberline-outpost/assets/ashfall.mp3',
  '/play/emberline-outpost/assets/flooded.mp3',
  '/play/emberline-outpost/assets/cinder.mp3',
  '/play/emberline-outpost/assets/core.mp3',
  '/play/emberline-outpost/assets/danger-ash.mp3',
  '/play/emberline-outpost/assets/danger-flood.mp3',
  '/play/emberline-outpost/assets/danger-cinder.mp3',
  '/play/emberline-outpost/assets/danger-core.mp3',
  '/play/emberline-outpost/assets/select.mp3',
  '/play/emberline-outpost/assets/confirm.mp3',
  '/play/emberline-outpost/assets/cancel.mp3',
  '/play/emberline-outpost/assets/place.mp3',
  '/play/emberline-outpost/assets/move.mp3',
  '/play/emberline-outpost/assets/attack.mp3',
  '/play/emberline-outpost/assets/hit.mp3',
  '/play/emberline-outpost/assets/kill.mp3',
  '/play/emberline-outpost/assets/warning.mp3',
  '/play/emberline-outpost/assets/wave.mp3',
  '/play/emberline-outpost/assets/skill.mp3',
  '/play/emberline-outpost/assets/victory.mp3',
  '/play/emberline-outpost/assets/promote.mp3',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js'
];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('gg-' + SLUG + '-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (!url.pathname.startsWith('/play/' + SLUG + '/') && !url.pathname.startsWith('/play/_shared/') && !url.pathname.startsWith('/play/_assets/')) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => { if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone())); return res; })));
});
