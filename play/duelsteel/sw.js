const SLUG = 'duelsteel';
const VERSION = '2026-08-11-aa02';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/duelsteel/',
  '/play/duelsteel/index.html',
  '/play/duelsteel/game.js',
  '/play/duelsteel/manifest.json',
  '/play/duelsteel/assets/icon-192.png',
  '/play/duelsteel/assets/icon-512.png',
  '/play/duelsteel/icon.svg',
  '/play/duelsteel/favicon.svg',
  '/play/duelsteel/audio/music-forge.mp3',
  '/play/duelsteel/audio/music-veil.mp3',
  '/play/duelsteel/audio/sfx-whoosh.mp3',
  '/play/duelsteel/audio/sfx-heavy.mp3',
  '/play/duelsteel/audio/sfx-dagger.mp3',
  '/play/duelsteel/audio/sfx-clash.mp3',
  '/play/duelsteel/audio/sfx-guard.mp3',
  '/play/duelsteel/audio/sfx-parry.mp3',
  '/play/duelsteel/audio/sfx-hit.mp3',
  '/play/duelsteel/audio/sfx-kick.mp3',
  '/play/duelsteel/audio/sfx-ringout.mp3',
  '/play/duelsteel/audio/sfx-crowd.mp3',
  '/play/duelsteel/audio/sfx-ui.mp3',
  '/play/_shared/ggkit.js',
  '/play/_shared/three/three.module.min.js'
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
