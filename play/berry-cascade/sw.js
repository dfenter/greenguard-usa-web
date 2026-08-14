/* Berry Cascade service worker, authored from /play/_shared/sw-template.js.
 * Every path below is verified to exist in the shipped directory. */
const SLUG = 'berry-cascade';
const VERSION = '2026-08-11-aaa2';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/berry-cascade/',
  '/play/berry-cascade/index.html',
  '/play/berry-cascade/manifest.json',
  '/play/berry-cascade/sw.js',
  '/play/berry-cascade/favicon.png',
  '/play/berry-cascade/icon.png',
  '/play/berry-cascade/icon512.png',
  '/play/berry-cascade/js/sim.js',
  '/play/berry-cascade/js/content.js',
  '/play/berry-cascade/js/art.js',
  '/play/berry-cascade/js/fx.js',
  '/play/berry-cascade/js/ui.js',
  '/play/berry-cascade/js/play.js',
  '/play/berry-cascade/js/main.js',
  '/play/berry-cascade/assets/acorn.mp3',
  '/play/berry-cascade/assets/cascade.mp3',
  '/play/berry-cascade/assets/combo.mp3',
  '/play/berry-cascade/assets/crown.mp3',
  '/play/berry-cascade/assets/detonate.mp3',
  '/play/berry-cascade/assets/goal.mp3',
  '/play/berry-cascade/assets/invalid.mp3',
  '/play/berry-cascade/assets/match.mp3',
  '/play/berry-cascade/assets/medal.mp3',
  '/play/berry-cascade/assets/special.mp3',
  '/play/berry-cascade/assets/swap_tick.mp3',
  '/play/berry-cascade/assets/syrup.mp3',
  '/play/berry-cascade/assets/theme_grove.mp3',
  '/play/berry-cascade/assets/theme_summit.mp3',
  '/play/berry-cascade/assets/ui_click.mp3',
  '/play/_shared/ggkit.js',
  '/play/_shared/phaser.min.js'
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
  if (!url.pathname.startsWith('/play/' + SLUG + '/') && !url.pathname.startsWith('/play/_shared/')) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) =>
    hit || fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    })
  ));
});
