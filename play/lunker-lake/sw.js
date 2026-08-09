const SLUG = 'lunker-lake';
const VERSION = 'aaa-art2-20260808-2';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/lunker-lake/', '/play/lunker-lake/index.html', '/play/lunker-lake/data.js', '/play/lunker-lake/game.js',
  '/play/lunker-lake/manifest.json', '/play/lunker-lake/icon.png', '/play/lunker-lake/icon512.png', '/play/lunker-lake/favicon.png',
  '/play/_shared/phaser.min.js', '/play/_shared/ggkit.js',
  '/play/lunker-lake/assets/fish_blue.png', '/play/lunker-lake/assets/fish_brown.png', '/play/lunker-lake/assets/fish_green.png', '/play/lunker-lake/assets/fish_grey.png', '/play/lunker-lake/assets/fish_grey_long_a.png', '/play/lunker-lake/assets/fish_orange.png', '/play/lunker-lake/assets/fish_pink.png', '/play/lunker-lake/assets/fish_red.png', '/play/lunker-lake/assets/rock_a.png', '/play/lunker-lake/assets/rock_b.png', '/play/lunker-lake/assets/seaweed_c.png', '/play/lunker-lake/assets/seaweed_f.png', '/play/lunker-lake/assets/bubble_a.png', '/play/lunker-lake/assets/bubble_b.png', '/play/lunker-lake/assets/bubble_c.png',
  '/play/lunker-lake/assets/dawn_loop.mp3', '/play/lunker-lake/assets/expedition_loop.mp3', '/play/lunker-lake/assets/sfx_cast.mp3', '/play/lunker-lake/assets/sfx_splash.mp3', '/play/lunker-lake/assets/sfx_twitch.mp3', '/play/lunker-lake/assets/sfx_hook.mp3', '/play/lunker-lake/assets/sfx_reel.mp3', '/play/lunker-lake/assets/sfx_snap.mp3', '/play/lunker-lake/assets/sfx_land.mp3', '/play/lunker-lake/assets/sfx_ui.mp3', '/play/lunker-lake/assets/sfx_bubble.mp3', '/play/lunker-lake/assets/sfx_break.mp3'
];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('gg-' + SLUG + '-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (!url.pathname.startsWith('/play/' + SLUG + '/') && !url.pathname.startsWith('/play/_shared/') && !url.pathname.startsWith('/play/_assets/')) return;
  e.respondWith(caches.open(CACHE).then((cache) => cache.match(e.request, { ignoreSearch:true }).then((hit) => hit || fetch(e.request).then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; }))));
});
