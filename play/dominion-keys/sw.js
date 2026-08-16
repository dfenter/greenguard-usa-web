/* Authored from /play/_shared/sw-template.js. */
const SLUG = 'dominion-keys';
const VERSION = '2026-08-13-aaa-r1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/dominion-keys/',
  '/play/dominion-keys/index.html',
  '/play/dominion-keys/sim.js',
  '/play/dominion-keys/levels.js',
  '/play/dominion-keys/game.js',
  '/play/dominion-keys/manifest.json',
  '/play/dominion-keys/favicon.png',
  '/play/dominion-keys/icon.png',
  '/play/dominion-keys/icon512.png',
  '/play/dominion-keys/assets/music_vault.mp3',
  '/play/dominion-keys/assets/music_keep.mp3',
  '/play/dominion-keys/assets/sfx_tap.mp3',
  '/play/dominion-keys/assets/sfx_pull.mp3',
  '/play/dominion-keys/assets/sfx_coin.mp3',
  '/play/dominion-keys/assets/sfx_steam.mp3',
  '/play/dominion-keys/assets/sfx_ignite.mp3',
  '/play/dominion-keys/assets/sfx_slay.mp3',
  '/play/dominion-keys/assets/sfx_burn.mp3',
  '/play/dominion-keys/assets/sfx_fail.mp3',
  '/play/dominion-keys/assets/sfx_win.mp3',
  '/play/dominion-keys/assets/sfx_build.mp3',
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
