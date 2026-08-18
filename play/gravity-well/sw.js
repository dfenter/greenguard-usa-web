/* sw-template.js - Gravity Well cache manifest, derived from /play/_shared/sw-template.js. */
const SLUG = 'gravity-well';
const VERSION = '2026-08-16-aaa-round-2-gravity-depth-2026-08-17-offline-redirect-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/gravity-well/',
  '/play/gravity-well/index.html',
  '/play/gravity-well/game.js',
  '/play/gravity-well/manifest.json',
  '/play/gravity-well/icon.png',
  '/play/gravity-well/icon512.png',
  '/play/gravity-well/favicon.ico',
  '/play/gravity-well/assets/ambient.mp3',
  '/play/gravity-well/assets/intensity.mp3',
  '/play/gravity-well/assets/thrust.mp3',
  '/play/gravity-well/assets/refuel.mp3',
  '/play/gravity-well/assets/crash-soft.mp3',
  '/play/gravity-well/assets/crash-hard.mp3',
  '/play/gravity-well/assets/beacon.mp3',
  '/play/gravity-well/assets/pickup.mp3',
  '/play/gravity-well/assets/shield.mp3',
  '/play/gravity-well/assets/shortcut.mp3',
  '/play/gravity-well/assets/warning.mp3',
  '/play/gravity-well/assets/lander-idle.svg',
  '/play/gravity-well/assets/lander-thrust.svg',
  '/play/gravity-well/assets/lander-damaged.svg',
  '/play/gravity-well/assets/hazard-crystal.svg',
  '/play/gravity-well/assets/hazard-ice.svg',
  '/play/gravity-well/assets/hazard-vent.svg',
  '/play/gravity-well/assets/hazard-machine.svg',
  '/play/gravity-well/assets/hazard-core.svg',
  '/play/gravity-well/assets/pickup-fuel.svg',
  '/play/gravity-well/assets/pickup-shield.svg',
  '/play/gravity-well/assets/pickup-crystal.svg',
  '/play/gravity-well/assets/pickup-bubble.svg',
  '/play/gravity-well/assets/refuel-pad.svg',
  '/play/gravity-well/assets/shortcut-chute.svg',
  '/play/gravity-well/assets/beacon-core.svg',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js'
];

self.addEventListener('install', (e) => {
  // Cache entries INDIVIDUALLY, and strip redirects.
  //
  // Two traps, both of which silently killed offline for the ENTIRE fleet and
  // both invisible on a local static server:
  //   1. cache.addAll is ATOMIC. One unreachable path and NOTHING is cached,
  //      while the worker still installs and reports healthy.
  //   2. The deployed site 308-redirects '/play/<slug>/' and
  //      '/play/<slug>/index.html' onto the bare '/play/<slug>'. cache.put
  //      THROWS on a redirected response, so those two entries alone were
  //      enough to reject the whole addAll. python -m http.server serves the
  //      slash form directly with a 200, which is why every local gate passed.
  // Rebuilding the response strips the redirect flag and keeps the body.
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(ASSETS.map(async (u) => {
      try {
        const res = await fetch(u, { redirect: 'follow' });
        if (!res || !res.ok) return;
        await c.put(u, new Response(await res.blob(), {
          status: 200, statusText: 'OK', headers: res.headers,
        }));
      } catch (err) { /* one asset must never sink the whole precache */ }
    }));
    await self.skipWaiting();
  })());
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
  // ROOT + '/', so the canonical navigation was not in scope at all, the
  // worker never answered it, and offline died on EVERY title in the fleet
  // while still reporting a registered service worker. Accept both forms.
  const inScope = url.pathname === ROOT || url.pathname.startsWith(ROOT + '/')
    || url.pathname.startsWith('/play/_shared/') || url.pathname.startsWith('/play/_assets/');
  if (!inScope) return;
  // Both spellings of the root map to the one cached index.html, since the
  // precache lists the slash form and the browser asks for the bare one.
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
          // Offline and uncached: a navigation still has to land somewhere,
          // so fall back to the app shell rather than a browser error page.
          e.request.mode === 'navigate' ? caches.match(INDEX) : Promise.reject(new Error('offline'))
        )
      )
  );
});
