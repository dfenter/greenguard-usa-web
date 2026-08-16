/* Wayfarer Courts service worker. VERSION changes invalidate only this title. */
const SLUG = 'wayfarer-courts';
const VERSION = 'aaa-f15-1-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/wayfarer-courts/',
  '/play/wayfarer-courts/index.html',
  '/play/wayfarer-courts/game.js',
  '/play/wayfarer-courts/manifest.json',
  '/play/wayfarer-courts/icon.png',
  '/play/wayfarer-courts/icon512.png',
  '/play/wayfarer-courts/favicon.png',
  '/play/wayfarer-courts/sw.js',
  '/play/wayfarer-courts/assets/art.mp3',
  '/play/wayfarer-courts/assets/back.mp3',
  '/play/wayfarer-courts/assets/battle.mp3',
  '/play/wayfarer-courts/assets/bond.mp3',
  '/play/wayfarer-courts/assets/celestial.mp3',
  '/play/wayfarer-courts/assets/court.mp3',
  '/play/wayfarer-courts/assets/craft.mp3',
  '/play/wayfarer-courts/assets/defeat.mp3',
  '/play/wayfarer-courts/assets/encounter.mp3',
  '/play/wayfarer-courts/assets/field.mp3',
  '/play/wayfarer-courts/assets/guard.mp3',
  '/play/wayfarer-courts/assets/heal.mp3',
  '/play/wayfarer-courts/assets/hurt.mp3',
  '/play/wayfarer-courts/assets/quest.mp3',
  '/play/wayfarer-courts/assets/rank.mp3',
  '/play/wayfarer-courts/assets/reward.mp3',
  '/play/wayfarer-courts/assets/step.mp3',
  '/play/wayfarer-courts/assets/strike.mp3',
  '/play/wayfarer-courts/assets/town.mp3',
  '/play/wayfarer-courts/assets/ui.mp3',
  '/play/wayfarer-courts/assets/victory.mp3',
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
