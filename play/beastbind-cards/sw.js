/* sw.js generated from /play/_shared/sw-template.js. */
const SLUG = 'beastbind-cards';
const VERSION = 'aaa-f13-20260813-1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/beastbind-cards/',
  '/play/beastbind-cards/index.html',
  '/play/beastbind-cards/cards.js',
  '/play/beastbind-cards/engine.js',
  '/play/beastbind-cards/game.js',
  '/play/beastbind-cards/manifest.json',
  '/play/beastbind-cards/NOTES.md',
  '/play/beastbind-cards/LICENSES.md',
  '/play/beastbind-cards/icon.png',
  '/play/beastbind-cards/icon512.png',
  '/play/beastbind-cards/favicon.png',
  '/play/beastbind-cards/assets/crit.mp3',
  '/play/beastbind-cards/assets/deal.mp3',
  '/play/beastbind-cards/assets/defeat.mp3',
  '/play/beastbind-cards/assets/energy.mp3',
  '/play/beastbind-cards/assets/error.mp3',
  '/play/beastbind-cards/assets/fanfare.mp3',
  '/play/beastbind-cards/assets/hit.mp3',
  '/play/beastbind-cards/assets/ko.mp3',
  '/play/beastbind-cards/assets/pack.mp3',
  '/play/beastbind-cards/assets/place.mp3',
  '/play/beastbind-cards/assets/rare.mp3',
  '/play/beastbind-cards/assets/retreat.mp3',
  '/play/beastbind-cards/assets/reveal.mp3',
  '/play/beastbind-cards/assets/tap.mp3',
  '/play/beastbind-cards/assets/theme_bind.mp3',
  '/play/beastbind-cards/assets/theme_champion.mp3',
  '/play/beastbind-cards/assets/theme_duel.mp3',
  '/play/beastbind-cards/assets/undo.mp3',
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
