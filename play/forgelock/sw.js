/* Authored from /play/_shared/sw-template.js. */
const SLUG = 'forgelock';
const VERSION = '2026-08-10-aaa-r3';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/forgelock/',
  '/play/forgelock/index.html',
  '/play/forgelock/game.js',
  '/play/forgelock/favicon.png',
  '/play/forgelock/icon.png',
  '/play/forgelock/icon512.png',
  '/play/forgelock/manifest.json',
  '/play/forgelock/assets/sfx_push.mp3',
  '/play/forgelock/assets/sfx_lock.mp3',
  '/play/forgelock/assets/sfx_belt.mp3',
  '/play/forgelock/assets/sfx_clear.mp3',
  '/play/forgelock/assets/sfx_ui.mp3',
  '/play/forgelock/assets/sfx_fanfare.mp3',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js'
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
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  })));
});
