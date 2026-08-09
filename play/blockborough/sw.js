/* Blockborough service worker, generated from /play/_shared/sw-template.js. */
const SLUG = 'blockborough';
const VERSION = '2026.08.06.2';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/blockborough/', '/play/blockborough/index.html', '/play/blockborough/game.js', '/play/blockborough/sim.js',
  '/play/blockborough/manifest.json', '/play/blockborough/icon.png', '/play/blockborough/icon512.png',
  '/play/blockborough/assets/town-sheet.png', '/play/blockborough/assets/blockborough-atlas.svg', '/play/blockborough/assets/blockborough-atlas.json',
  '/play/blockborough/assets/audio/city-dawn.mp3', '/play/blockborough/assets/audio/city-rush.mp3',
  '/play/blockborough/assets/audio/select_001.mp3', '/play/blockborough/assets/audio/error_008.mp3',
  '/play/blockborough/assets/audio/bong_001.mp3', '/play/blockborough/assets/audio/drop_004.mp3',
  '/play/blockborough/assets/audio/open_002.mp3', '/play/blockborough/assets/audio/back_004.mp3',
  '/play/blockborough/assets/audio/toggle_002.mp3', '/play/blockborough/assets/audio/scroll_002.mp3',
  '/play/_shared/ggkit.js', '/play/_shared/phaser.min.js'
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
  if (!url.pathname.startsWith('/play/' + SLUG + '/') && !url.pathname.startsWith('/play/_shared/') && !url.pathname.startsWith('/play/_assets/')) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  })));
});
