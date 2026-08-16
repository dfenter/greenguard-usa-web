/* sw-template.js - generated for Blast Radius.
 * Cache-first for this title and the shared Phaser/GGKit runtime. Bump
 * VERSION whenever the title payload changes.
 */
const SLUG = 'blast-radius';
const VERSION = '2026-08-16-round2-polish-1-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/blast-radius/',
  '/play/blast-radius/index.html',
  '/play/blast-radius/game.js',
  '/play/blast-radius/sw.js',
  '/play/blast-radius/manifest.json',
  '/play/blast-radius/icon.png',
  '/play/blast-radius/icon512.png',
  '/play/blast-radius/favicon.png',
  '/play/blast-radius/assets/fuse_tick.mp3',
  '/play/blast-radius/assets/blast_boom_a.mp3',
  '/play/blast-radius/assets/blast_boom_b.mp3',
  '/play/blast-radius/assets/blast_chain.mp3',
  '/play/blast-radius/assets/chaser_growl.mp3',
  '/play/blast-radius/assets/pickup_chime.mp3',
  '/play/blast-radius/assets/banner_sting.mp3',
  '/play/blast-radius/assets/score_ping.mp3',
  '/play/blast-radius/assets/music_base.mp3',
  '/play/blast-radius/assets/music_heat.mp3',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('gg-' + SLUG + '-') && key !== CACHE).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const ROOT = '/play/' + SLUG;
  // The deployed site serves the title at the NO-TRAILING-SLASH url and
  // 308-redirects the slash form onto it. The old scope test required
  // ROOT + '/', so the canonical navigation was never in scope, the worker
  // never answered it, and offline died on EVERY title in the fleet while
  // still reporting a registered service worker. Accept both forms.
  const inScope = url.pathname === ROOT || url.pathname.startsWith(ROOT + '/')
    || url.pathname.startsWith('/play/_shared/') || url.pathname.startsWith('/play/_assets/');
  if (!inScope) return;
  const isRoot = url.pathname === ROOT || url.pathname === ROOT + '/';
  const INDEX = ROOT + '/index.html';
  e.respondWith(
    caches.match(isRoot ? INDEX : e.request, { ignoreSearch: true })
      .then((hit) => hit || caches.match(e.request, { ignoreSearch: true }))
      .then((hit) =>
        hit ||
        fetch(e.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        }).catch(() =>
          e.request.mode === 'navigate' ? caches.match(INDEX) : Promise.reject(new Error('offline'))
        )
      )
  );
});
