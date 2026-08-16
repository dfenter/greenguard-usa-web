/* Derived from /play/_shared/sw-template.js. Full first-load cache for the
 * title and its same-origin CC0 audio dependencies. Bump VERSION per release.
 */
const SLUG = 'stomp-circuit';
const VERSION = '2026-08-16-round2-polish-a1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/stomp-circuit/',
  '/play/stomp-circuit/index.html',
  '/play/stomp-circuit/game.js',
  '/play/stomp-circuit/manifest.json',
  '/play/stomp-circuit/icon.png',
  '/play/stomp-circuit/icon512.png',
  '/play/stomp-circuit/assets/engine.mp3',
  '/play/stomp-circuit/assets/sfx_crowd.mp3',
  '/play/stomp-circuit/assets/impact.mp3',
  '/play/stomp-circuit/assets/land.mp3',
  '/play/stomp-circuit/assets/launch.mp3',
  '/play/stomp-circuit/assets/boost.mp3',
  '/play/stomp-circuit/assets/cargo_pickup.mp3',
  '/play/stomp-circuit/assets/fanfare.mp3',
  '/play/stomp-circuit/assets/uiselect.mp3',
  '/play/stomp-circuit/assets/uitick.mp3',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.startsWith('gg-' + SLUG + '-') && k !== CACHE).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Own directory + the shared runtime only. The sibling-title paths this
  // list used to carry are gone: every asset now lives under this title.
  if (!url.pathname.startsWith('/play/stomp-circuit/') &&
      !url.pathname.startsWith('/play/_shared/')) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
      return res;
    }))
  );
});
