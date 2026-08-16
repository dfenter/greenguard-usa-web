const SLUG = 'silkwind';
const VERSION = '2026-08-13-aa01';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/silkwind/',
  '/play/silkwind/index.html',
  '/play/silkwind/game.js',
  '/play/silkwind/manifest.json',
  '/play/silkwind/icon.png',
  '/play/silkwind/icon512.png',
  '/play/silkwind/favicon.png',
  '/play/silkwind/assets/audio/music-grove.mp3',
  '/play/silkwind/assets/audio/music-lake.mp3',
  '/play/silkwind/assets/audio/music-menu.mp3',
  '/play/silkwind/assets/audio/music-peak.mp3',
  '/play/silkwind/assets/audio/music-temple.mp3',
  '/play/silkwind/assets/audio/sfx-block.mp3',
  '/play/silkwind/assets/audio/sfx-break.mp3',
  '/play/silkwind/assets/audio/sfx-burst.mp3',
  '/play/silkwind/assets/audio/sfx-clash.mp3',
  '/play/silkwind/assets/audio/sfx-dash.mp3',
  '/play/silkwind/assets/audio/sfx-gong.mp3',
  '/play/silkwind/assets/audio/sfx-grab.mp3',
  '/play/silkwind/assets/audio/sfx-heavy.mp3',
  '/play/silkwind/assets/audio/sfx-hit.mp3',
  '/play/silkwind/assets/audio/sfx-ko.mp3',
  '/play/silkwind/assets/audio/sfx-lose.mp3',
  '/play/silkwind/assets/audio/sfx-parry.mp3',
  '/play/silkwind/assets/audio/sfx-stance.mp3',
  '/play/silkwind/assets/audio/sfx-ui.mp3',
  '/play/silkwind/assets/audio/sfx-whoosh.mp3',
  '/play/silkwind/assets/audio/sfx-win.mp3',
  '/play/_shared/ggkit.js',
  '/play/_shared/phaser.min.js'
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
  if (!url.pathname.startsWith('/play/' + SLUG + '/') && !url.pathname.startsWith('/play/_shared/')) return;
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
