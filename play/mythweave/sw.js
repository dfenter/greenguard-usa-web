/* Mythweave service worker. VERSION changes invalidate only this title. */
const SLUG = 'mythweave';
const VERSION = 'aaa-f13-1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/mythweave/',
  '/play/mythweave/index.html',
  '/play/mythweave/content.js',
  '/play/mythweave/game.js',
  '/play/mythweave/manifest.json',
  '/play/mythweave/icon.png',
  '/play/mythweave/icon512.png',
  '/play/mythweave/favicon.png',
  '/play/mythweave/sw.js',
  '/play/mythweave/assets/arcana.mp3',
  '/play/mythweave/assets/bind.mp3',
  '/play/mythweave/assets/break.mp3',
  '/play/mythweave/assets/defeat.mp3',
  '/play/mythweave/assets/guard.mp3',
  '/play/mythweave/assets/heal.mp3',
  '/play/mythweave/assets/hurt.mp3',
  '/play/mythweave/assets/intent.mp3',
  '/play/mythweave/assets/lantern.mp3',
  '/play/mythweave/assets/loom.mp3',
  '/play/mythweave/assets/pick.mp3',
  '/play/mythweave/assets/shrine.mp3',
  '/play/mythweave/assets/star.mp3',
  '/play/mythweave/assets/steppe.mp3',
  '/play/mythweave/assets/strike.mp3',
  '/play/mythweave/assets/ui.mp3',
  '/play/mythweave/assets/unpick.mp3',
  '/play/mythweave/assets/unravel.mp3',
  '/play/mythweave/assets/victory.mp3',
  '/play/mythweave/assets/weave.mp3',
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
