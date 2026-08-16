const SLUG = 'molehunt-manor';
const VERSION = 'aaa-20260816-01';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/molehunt-manor/',
  '/play/molehunt-manor/index.html',
  '/play/molehunt-manor/game.js',
  '/play/molehunt-manor/manifest.json',
  '/play/molehunt-manor/icon.png',
  '/play/molehunt-manor/icon512.png',
  '/play/molehunt-manor/favicon.png',
  '/play/molehunt-manor/assets/music_manor.mp3',
  '/play/molehunt-manor/assets/music_tension.mp3',
  '/play/molehunt-manor/assets/sfx_tap.mp3',
  '/play/molehunt-manor/assets/sfx_move.mp3',
  '/play/molehunt-manor/assets/sfx_task.mp3',
  '/play/molehunt-manor/assets/sfx_sight.mp3',
  '/play/molehunt-manor/assets/sfx_clue.mp3',
  '/play/molehunt-manor/assets/sfx_alarm.mp3',
  '/play/molehunt-manor/assets/sfx_vote.mp3',
  '/play/molehunt-manor/assets/sfx_catch.mp3',
  '/play/molehunt-manor/assets/sfx_wrong.mp3',
  '/play/molehunt-manor/assets/sfx_reveal.mp3',
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
