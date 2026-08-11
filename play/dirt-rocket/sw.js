/* sw.js - Dirt Rocket, built from /play/_shared/sw-template.js. */
const SLUG = 'dirt-rocket';
const VERSION = '6';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/dirt-rocket/',
  '/play/dirt-rocket/index.html',
  '/play/dirt-rocket/game.js',
  '/play/dirt-rocket/track.js',
  '/play/dirt-rocket/bike.js',
  '/play/dirt-rocket/sw.js',
  '/play/dirt-rocket/manifest.json',
  '/play/dirt-rocket/tracks/big-air.json',
  '/play/dirt-rocket/tracks/event-1-track-1.json',
  '/play/dirt-rocket/tracks/event-1-track-2.json',
  '/play/dirt-rocket/tracks/event-1-track-3.json',
  '/play/dirt-rocket/tracks/event-2-track-1.json',
  '/play/dirt-rocket/tracks/event-2-track-2.json',
  '/play/dirt-rocket/tracks/event-2-track-3.json',
  '/play/dirt-rocket/tracks/event-3-track-1.json',
  '/play/dirt-rocket/tracks/event-3-track-2.json',
  '/play/dirt-rocket/tracks/event-3-track-3.json',
  '/play/dirt-rocket/tracks/event-4-track-1.json',
  '/play/dirt-rocket/tracks/event-4-track-2.json',
  '/play/dirt-rocket/tracks/event-4-track-3.json',
  '/play/dirt-rocket/tracks/event-5-track-1.json',
  '/play/dirt-rocket/tracks/event-5-track-2.json',
  '/play/dirt-rocket/tracks/event-5-track-3.json',
  '/play/dirt-rocket/tracks/event-6-track-1.json',
  '/play/dirt-rocket/tracks/event-6-track-2.json',
  '/play/dirt-rocket/tracks/event-6-track-3.json',
  '/play/dirt-rocket/tracks/event-7-track-1.json',
  '/play/dirt-rocket/tracks/event-7-track-2.json',
  '/play/dirt-rocket/tracks/event-7-track-3.json',
  '/play/dirt-rocket/tracks/event-8-track-1.json',
  '/play/dirt-rocket/tracks/event-8-track-2.json',
  '/play/dirt-rocket/tracks/event-8-track-3.json',
  '/play/dirt-rocket/icon.png',
  '/play/dirt-rocket/icon512.png',
  '/play/dirt-rocket/favicon.png',
  '/play/dirt-rocket/assets/audio/engine.mp3',
  '/play/dirt-rocket/assets/audio/boost.mp3',
  '/play/dirt-rocket/assets/audio/land.mp3',
  '/play/dirt-rocket/assets/audio/crash.mp3',
  '/play/dirt-rocket/assets/audio/pickup.mp3',
  '/play/dirt-rocket/assets/audio/ui.mp3',
  '/play/dirt-rocket/assets/audio/medal.mp3',
  '/play/dirt-rocket/assets/audio/bigair.mp3',
  '/play/dirt-rocket/assets/audio/skid.mp3',
  '/play/dirt-rocket/assets/audio/surface.mp3',
  '/play/dirt-rocket/assets/audio/menu.mp3',
  '/play/dirt-rocket/assets/audio/drive.mp3',
  '/play/_shared/ggkit.js',
  '/play/_shared/three/three.module.min.js',
];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('gg-' + SLUG + '-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
const CODE = /\.(?:html|js|json)$|\/$/i;
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (!url.pathname.startsWith('/play/' + SLUG + '/') && !url.pathname.startsWith('/play/_shared/')) return;
  if (CODE.test(url.pathname)) {
    e.respondWith(fetch(e.request).then(res => { if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone())); return res; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
  } else {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => { if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone())); return res; })));
  }
});
