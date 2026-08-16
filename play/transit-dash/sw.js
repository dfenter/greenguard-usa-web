/* Transit Dash service worker authored from /play/_shared/sw-template.js. */
const SLUG = 'transit-dash';
const VERSION = 'aaa-rebuild-2';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/transit-dash/',
  '/play/transit-dash/index.html',
  '/play/transit-dash/style.css',
  '/play/transit-dash/manifest.json',
  '/play/transit-dash/favicon.png',
  '/play/transit-dash/icon.png',
  '/play/transit-dash/icon512.png',
  '/play/transit-dash/js/core.js',
  '/play/transit-dash/js/game.js',
  '/play/transit-dash/js/main.js',
  '/play/transit-dash/assets/music-yard.mp3',
  '/play/transit-dash/assets/music-tube.mp3',
  '/play/transit-dash/assets/music-river.mp3',
  '/play/transit-dash/assets/music-harbour.mp3',
  '/play/transit-dash/assets/sfx-lane.mp3',
  '/play/transit-dash/assets/sfx-vault.mp3',
  '/play/transit-dash/assets/sfx-roll.mp3',
  '/play/transit-dash/assets/sfx-ramp.mp3',
  '/play/transit-dash/assets/sfx-token.mp3',
  '/play/transit-dash/assets/sfx-power.mp3',
  '/play/transit-dash/assets/sfx-crate.mp3',
  '/play/transit-dash/assets/sfx-near.mp3',
  '/play/transit-dash/assets/sfx-shield.mp3',
  '/play/transit-dash/assets/sfx-hit.mp3',
  '/play/transit-dash/assets/sfx-mission.mp3',
  '/play/transit-dash/assets/sfx-finish.mp3',
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
  e.respondWith(caches.match(e.request, {ignoreSearch:true}).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  })));
});
