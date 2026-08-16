/* sw.js generated from /play/_shared/sw-template.js. */
const SLUG = 'lantern-bingo';
const VERSION = 'aaa-f16-20260813-1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/lantern-bingo/',
  '/play/lantern-bingo/index.html',
  '/play/lantern-bingo/game.js',
  '/play/lantern-bingo/manifest.json',
  '/play/lantern-bingo/icon.png',
  '/play/lantern-bingo/icon512.png',
  '/play/lantern-bingo/favicon.png',
  '/play/lantern-bingo/assets/back.mp3',
  '/play/lantern-bingo/assets/bingo.mp3',
  '/play/lantern-bingo/assets/call.mp3',
  '/play/lantern-bingo/assets/charge.mp3',
  '/play/lantern-bingo/assets/chip.mp3',
  '/play/lantern-bingo/assets/daub.mp3',
  '/play/lantern-bingo/assets/miss.mp3',
  '/play/lantern-bingo/assets/music_hall.mp3',
  '/play/lantern-bingo/assets/music_lantern.mp3',
  '/play/lantern-bingo/assets/music_skyfire.mp3',
  '/play/lantern-bingo/assets/oneaway.mp3',
  '/play/lantern-bingo/assets/rivalwin.mp3',
  '/play/lantern-bingo/assets/souvenir.mp3',
  '/play/lantern-bingo/assets/start.mp3',
  '/play/lantern-bingo/assets/streak.mp3',
  '/play/lantern-bingo/assets/tap.mp3',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('gg-' + SLUG + '-') && k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (!url.pathname.startsWith('/play/' + SLUG + '/') && !url.pathname.startsWith('/play/_shared/') && !url.pathname.startsWith('/play/_assets/')) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) =>
      hit ||
      fetch(e.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
    )
  );
});
