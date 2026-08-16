/* Derived from /play/_shared/sw-template.js. Cache first, offline after first load. */
const SLUG = 'pennant-nine';
const VERSION = '2026-08-13-aaa-1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/pennant-nine/',
  '/play/pennant-nine/index.html',
  '/play/pennant-nine/pn_data.js',
  '/play/pennant-nine/pn_sim.js',
  '/play/pennant-nine/pn_art.js',
  '/play/pennant-nine/game.js',
  '/play/pennant-nine/manifest.json',
  '/play/pennant-nine/icon.png',
  '/play/pennant-nine/icon512.png',
  '/play/pennant-nine/favicon.ico',
  '/play/pennant-nine/LICENSES.md',
  '/play/pennant-nine/NOTES.md',
  '/play/pennant-nine/assets/music-day.mp3',
  '/play/pennant-nine/assets/music-final.mp3',
  '/play/pennant-nine/assets/music-night.mp3',
  '/play/pennant-nine/assets/sfx-bell.mp3',
  '/play/pennant-nine/assets/sfx-call.mp3',
  '/play/pennant-nine/assets/sfx-cheer.mp3',
  '/play/pennant-nine/assets/sfx-crack.mp3',
  '/play/pennant-nine/assets/sfx-deny.mp3',
  '/play/pennant-nine/assets/sfx-foul.mp3',
  '/play/pennant-nine/assets/sfx-groan.mp3',
  '/play/pennant-nine/assets/sfx-homer.mp3',
  '/play/pennant-nine/assets/sfx-mitt.mp3',
  '/play/pennant-nine/assets/sfx-out.mp3',
  '/play/pennant-nine/assets/sfx-pitch.mp3',
  '/play/pennant-nine/assets/sfx-reward.mp3',
  '/play/pennant-nine/assets/sfx-step.mp3',
  '/play/pennant-nine/assets/sfx-tap.mp3',
  '/play/pennant-nine/assets/sfx-whiff.mp3',
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
