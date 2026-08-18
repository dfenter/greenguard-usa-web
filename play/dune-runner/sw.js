/* sw-template.js - Dune Runner cache manifest. VERSION changes with each ship. */
const SLUG = 'dune-runner';
const VERSION = '2026-08-11-ggracer-1-2026-08-17-density-rollback';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/dune-runner/',
  '/play/dune-runner/index.html',
  '/play/dune-runner/game.js',
  '/play/dune-runner/tracks/dawn-dune-sea-checkpoint-raid.json',
  '/play/dune-runner/tracks/dawn-dune-sea-arch-sprint.json',
  '/play/dune-runner/tracks/dawn-dune-sea-cinder-salvage.json',
  '/play/dune-runner/tracks/redglass-wash-time-attack.json',
  '/play/dune-runner/tracks/redglass-wash-wreck-raid.json',
  '/play/dune-runner/tracks/white-salt-flat-salvage-run.json',
  '/play/dune-runner/tracks/white-salt-flat-needle-sprint.json',
  '/play/dune-runner/tracks/night-oasis-ring-night-raid.json',
  '/play/dune-runner/tracks/night-oasis-ring-oasis-loop.json',
  '/play/dune-runner/tracks/night-oasis-ring-showcase-raid.json',
  '/play/dune-runner/manifest.json',
  '/play/dune-runner/icon.png',
  '/play/dune-runner/icon512.png',
  '/play/dune-runner/favicon.png',
  '/play/dune-runner/assets/engine.mp3',
  '/play/dune-runner/assets/wind.mp3',
  '/play/dune-runner/assets/sand.mp3',
  '/play/dune-runner/assets/oasis.mp3',
  '/play/dune-runner/assets/low-fuel.mp3',
  '/play/dune-runner/assets/impact.mp3',
  '/play/dune-runner/assets/medal.mp3',
  '/play/dune-runner/assets/air.mp3',
  '/play/dune-runner/assets/land.mp3',
  '/play/dune-runner/assets/menu.mp3',
  '/play/dune-runner/assets/drive.mp3',
  '/play/_shared/ggkit.js',
  '/play/_shared/three/three.module.min.js'
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
