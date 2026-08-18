/* Buzz Grand Prix service worker. Cache only real title and shared files. */
const SLUG = 'buzz-gp';
const VERSION = '2026-08-11-aaa-build1-2026-08-17-density-rollback';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/buzz-gp/', '/play/buzz-gp/index.html', '/play/buzz-gp/game.js', '/play/buzz-gp/manifest.json', '/play/buzz-gp/icon.svg', '/play/buzz-gp/favicon.svg', '/play/buzz-gp/sw.js',
  '/play/buzz-gp/tracks/garden-sprint.json', '/play/buzz-gp/tracks/picnic-chicane.json', '/play/buzz-gp/tracks/compost-canyon.json', '/play/buzz-gp/tracks/gutter-run.json',
  '/play/buzz-gp/tracks/toolshed-twilight.json', '/play/buzz-gp/tracks/pond-skim.json', '/play/buzz-gp/tracks/anthill-spiral.json', '/play/buzz-gp/tracks/queens-throne.json',
  '/play/buzz-gp/tracks/firefly-loop.json', '/play/buzz-gp/tracks/hosepipe-heights.json', '/play/buzz-gp/tracks/seed-packet-speedway.json', '/play/buzz-gp/tracks/wheelbarrow-wilds.json',
  '/play/buzz-gp/tracks/battle-lily-pad.json', '/play/buzz-gp/tracks/battle-toolshed.json',
  '/play/buzz-gp/assets/music_menu.mp3', '/play/buzz-gp/assets/music_race_a.mp3', '/play/buzz-gp/assets/music_race_b.mp3',
  '/play/buzz-gp/assets/sfx_item.mp3', '/play/buzz-gp/assets/sfx_hit.mp3', '/play/buzz-gp/assets/sfx_drift.mp3', '/play/buzz-gp/assets/sfx_boost.mp3', '/play/buzz-gp/assets/sfx_jump.mp3', '/play/buzz-gp/assets/sfx_pickup.mp3', '/play/buzz-gp/assets/sfx_shield.mp3', '/play/buzz-gp/assets/sfx_hornet.mp3', '/play/buzz-gp/assets/sfx_sap.mp3', '/play/buzz-gp/assets/sfx_swarm.mp3', '/play/buzz-gp/assets/sfx_pebble.mp3', '/play/buzz-gp/assets/sfx_lap.mp3', '/play/buzz-gp/assets/sfx_fanfare.mp3', '/play/buzz-gp/assets/sfx_ui.mp3',
  '/play/_shared/ggkit.js', '/play/_shared/three/three.module.min.js', '/play/_shared/racer/engine.js', '/play/_shared/racer/track.js', '/play/_shared/racer/env.js', '/play/_shared/racer/carkit.js', '/play/_shared/racer/fx.js',
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
