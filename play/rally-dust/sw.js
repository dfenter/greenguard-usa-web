/* sw.js — Rally Dust. Built from /play/_shared/sw-template.js.
 * Offline-after-first-load per the UX/PWA gate. Cache-first for same-origin
 * GETs under /play/rally-dust/ and /play/_shared/; network passthrough
 * otherwise. Bump VERSION on every deploy of the game.
 *
 * The document is the one exception: it is network-first, so a deploy that
 * forgets the VERSION bump can still recover. A stale cache-first document had
 * no way back at all, because the page that would register the new worker was
 * itself being served from the old cache.
 */
const SLUG = 'rally-dust';
const VERSION = '5';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/rally-dust/',
  '/play/rally-dust/index.html',
  '/play/rally-dust/game.js',
  '/play/rally-dust/stage.js',
  '/play/rally-dust/cars.js',
  '/play/rally-dust/audio.js',
  '/play/rally-dust/hud.js',
  '/play/rally-dust/sw.js',
  '/play/rally-dust/manifest.json',
  '/play/rally-dust/icon.png',
  '/play/rally-dust/icon512.png',
  '/play/rally-dust/tracks/r1s1.json',
  '/play/rally-dust/tracks/r1s2.json',
  '/play/rally-dust/tracks/r1s3.json',
  '/play/rally-dust/tracks/r1s4.json',
  '/play/rally-dust/tracks/r2s1.json',
  '/play/rally-dust/tracks/r2s2.json',
  '/play/rally-dust/tracks/r2s3.json',
  '/play/rally-dust/tracks/r2s4.json',
  '/play/rally-dust/tracks/r3s1.json',
  '/play/rally-dust/tracks/r3s2.json',
  '/play/rally-dust/tracks/r3s3.json',
  '/play/rally-dust/tracks/r3s4.json',
  '/play/rally-dust/tracks/r4s1.json',
  '/play/rally-dust/tracks/r4s2.json',
  '/play/rally-dust/tracks/r4s3.json',
  '/play/rally-dust/tracks/r4s4.json',
  '/play/rally-dust/assets/sfx/impact.mp3',
  '/play/rally-dust/assets/sfx/gravel.mp3',
  '/play/rally-dust/assets/sfx/slide.mp3',
  '/play/rally-dust/assets/sfx/note.mp3',
  '/play/rally-dust/assets/sfx/uitick.mp3',
  '/play/rally-dust/assets/sfx/uiselect.mp3',
  '/play/rally-dust/assets/sfx/beep.mp3',
  '/play/rally-dust/assets/sfx/launch.mp3',
  '/play/rally-dust/assets/sfx/split.mp3',
  '/play/rally-dust/assets/sfx/stageclear.mp3',
  '/play/rally-dust/assets/sfx/fanfare.mp3',
  '/play/rally-dust/assets/sfx/reset.mp3',
  '/play/rally-dust/assets/sfx/land.mp3',
  '/play/rally-dust/assets/music/menu.mp3',
  '/play/rally-dust/assets/music/stage_a.mp3',
  '/play/rally-dust/assets/music/stage_b.mp3',
  '/play/_shared/ggkit.js',
  '/play/_shared/three/three.module.min.js',
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

  // Network-first for the document, falling back to the cache offline. Only the
  // entry point: every other file stays cache-first so the game still boots in
  // one round trip and works with no connection at all.
  const isDoc = e.request.mode === 'navigate'
    || url.pathname === '/play/' + SLUG + '/'
    || url.pathname === '/play/' + SLUG + '/index.html';
  if (isDoc) {
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match(e.request, { ignoreSearch: true })
        .then((hit) => hit || caches.match('/play/' + SLUG + '/index.html')))
    );
    return;
  }

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
