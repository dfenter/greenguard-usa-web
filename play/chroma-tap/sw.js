/* sw-template.js: copy to /play/<slug>/sw.js and fill SLUG, VERSION, ASSETS.
 * Offline-after-first-load per the UX/PWA gate. Cache-first for same-origin
 * GETs under /play/<slug>/ and /play/_shared/; network passthrough otherwise.
 * Bump VERSION on every deploy of the game to invalidate stale caches.
 */
const SLUG = 'chroma-tap';
const VERSION = '2026-08-11-fix-round-1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/chroma-tap/',
  '/play/chroma-tap/index.html',
  '/play/chroma-tap/ct_data.js',
  '/play/chroma-tap/ct_sim.js',
  '/play/chroma-tap/ct_art.js',
  '/play/chroma-tap/ct_game.js',
  '/play/chroma-tap/manifest.json',
  '/play/chroma-tap/sw.js',
  '/play/chroma-tap/favicon.png',
  '/play/chroma-tap/icon.png',
  '/play/chroma-tap/icon512.png',
  '/play/chroma-tap/assets/tap.mp3',
  '/play/chroma-tap/assets/cascade.mp3',
  '/play/chroma-tap/assets/charge.mp3',
  '/play/chroma-tap/assets/combo.mp3',
  '/play/chroma-tap/assets/goal.mp3',
  '/play/chroma-tap/assets/rescue.mp3',
  '/play/chroma-tap/assets/win.mp3',
  '/play/chroma-tap/assets/lose.mp3',
  '/play/chroma-tap/assets/ui.mp3',
  '/play/chroma-tap/assets/invalid.mp3',
  '/play/chroma-tap/assets/blast.mp3',
  '/play/chroma-tap/assets/clunk.mp3',
  '/play/chroma-tap/assets/m_board.mp3',
  '/play/chroma-tap/assets/m_menu.mp3',
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
