/* Shout It! service worker - generated from /play/_shared/sw-template.js.
 * Offline after first load. Bump VERSION on every deploy.
 */
const SLUG = 'shout-it';
const VERSION = '1.2.0';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/shout-it/',
  '/play/shout-it/index.html',
  '/play/shout-it/game.js',
  '/play/shout-it/content.js',
  '/play/shout-it/manifest.json',
  '/play/shout-it/icon.png',
  '/play/shout-it/icon512.png',
  '/play/shout-it/assets/audio/music_lobby.mp3',
  '/play/shout-it/assets/audio/music_round.mp3',
  '/play/shout-it/assets/audio/sfx_tap.mp3',
  '/play/shout-it/assets/audio/sfx_select.mp3',
  '/play/shout-it/assets/audio/sfx_back.mp3',
  '/play/shout-it/assets/audio/sfx_got.mp3',
  '/play/shout-it/assets/audio/sfx_pass.mp3',
  '/play/shout-it/assets/audio/sfx_tick.mp3',
  '/play/shout-it/assets/audio/sfx_tick_hi.mp3',
  '/play/shout-it/assets/audio/sfx_buzzer.mp3',
  '/play/shout-it/assets/audio/sfx_fanfare.mp3',
  '/play/shout-it/assets/audio/sfx_win.mp3',
  '/play/shout-it/assets/audio/sfx_card.mp3',
  '/play/shout-it/assets/audio/sfx_shuffle.mp3',
  '/play/shout-it/assets/audio/sfx_handoff.mp3',
  '/play/shout-it/assets/audio/sfx_unlock.mp3',
  '/play/shout-it/assets/audio/sfx_countdown.mp3',
  '/play/shout-it/assets/audio/sfx_crowd.mp3',
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
