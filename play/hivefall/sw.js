/* Hivefall service worker, authored from /play/_shared/sw-template.js.
 * Every path below is verified to exist in the shipped directory. */
const SLUG = 'hivefall';
const VERSION = '2026-08-13-aaa1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/hivefall/',
  '/play/hivefall/index.html',
  '/play/hivefall/manifest.json',
  '/play/hivefall/sw.js',
  '/play/hivefall/favicon.png',
  '/play/hivefall/icon.png',
  '/play/hivefall/icon512.png',
  '/play/hivefall/js/content.js',
  '/play/hivefall/js/sim.js',
  '/play/hivefall/js/art.js',
  '/play/hivefall/js/fx.js',
  '/play/hivefall/js/ui.js',
  '/play/hivefall/js/play.js',
  '/play/hivefall/js/main.js',
  '/play/hivefall/assets/boss.mp3',
  '/play/hivefall/assets/breach.mp3',
  '/play/hivefall/assets/cascade.mp3',
  '/play/hivefall/assets/clear.mp3',
  '/play/hivefall/assets/click.mp3',
  '/play/hivefall/assets/defeat.mp3',
  '/play/hivefall/assets/flare.mp3',
  '/play/hivefall/assets/impact.mp3',
  '/play/hivefall/assets/invalid.mp3',
  '/play/hivefall/assets/kill.mp3',
  '/play/hivefall/assets/match.mp3',
  '/play/hivefall/assets/repair.mp3',
  '/play/hivefall/assets/salvage.mp3',
  '/play/hivefall/assets/shot.mp3',
  '/play/hivefall/assets/swap.mp3',
  '/play/hivefall/assets/theme_shelter.mp3',
  '/play/hivefall/assets/theme_siege.mp3',
  '/play/hivefall/assets/theme_watch.mp3',
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
