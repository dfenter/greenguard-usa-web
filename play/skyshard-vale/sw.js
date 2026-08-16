/* Generated from /play/_shared/sw-template.js. */
const SLUG = 'skyshard-vale';
const VERSION = 'aaa-f12-20260811-02-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/skyshard-vale/',
  '/play/skyshard-vale/index.html',
  '/play/skyshard-vale/game.js',
  '/play/skyshard-vale/manifest.json',
  '/play/skyshard-vale/icon.png',
  '/play/skyshard-vale/icon512.png',
  '/play/skyshard-vale/favicon.png',
  '/play/skyshard-vale/assets/attack.mp3',
  '/play/skyshard-vale/assets/hurt.mp3',
  '/play/skyshard-vale/assets/chest-open.mp3',
  '/play/skyshard-vale/assets/party-swap.mp3',
  '/play/skyshard-vale/assets/skill-cast.mp3',
  '/play/skyshard-vale/assets/elemental-combo.mp3',
  '/play/skyshard-vale/assets/shrine-unlock.mp3',
  '/play/skyshard-vale/assets/boss-roar.mp3',
  '/play/skyshard-vale/assets/trial-start.mp3',
  '/play/skyshard-vale/assets/trial-medal.mp3',
  '/play/skyshard-vale/assets/vale-ambient.mp3',
  '/play/skyshard-vale/assets/meadow-ambient.mp3',
  '/play/skyshard-vale/assets/lake-ambient.mp3',
  '/play/skyshard-vale/assets/ruin-ambient.mp3',
  '/play/skyshard-vale/assets/peak-ambient.mp3',
  '/play/skyshard-vale/assets/footstep.mp3',
  '/play/skyshard-vale/assets/gate.mp3',
  '/play/skyshard-vale/assets/portal-open.mp3',
  '/play/skyshard-vale/assets/secret.mp3',
  '/play/skyshard-vale/assets/ui.mp3',
  '/play/_shared/ggkit.js',
  '/play/_shared/phaser.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('gg-' + SLUG + '-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
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
