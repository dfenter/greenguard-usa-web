const SLUG = 'silkwind';
const VERSION = '2026-08-13-aa01-2026-08-16-offline-fix';
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
