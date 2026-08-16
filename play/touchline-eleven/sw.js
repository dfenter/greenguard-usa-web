/* Derived from /play/_shared/sw-template.js. Cache-first, offline after first load. */
const SLUG = 'touchline-eleven';
const VERSION = '2026-08-13-aaa-1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/touchline-eleven/',
  '/play/touchline-eleven/index.html',
  '/play/touchline-eleven/te_core.js',
  '/play/touchline-eleven/te_content.js',
  '/play/touchline-eleven/te_art.js',
  '/play/touchline-eleven/game.js',
  '/play/touchline-eleven/manifest.json',
  '/play/touchline-eleven/icon.png',
  '/play/touchline-eleven/icon512.png',
  '/play/touchline-eleven/favicon.ico',
  '/play/touchline-eleven/LICENSES.md',
  '/play/touchline-eleven/NOTES.md',
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
