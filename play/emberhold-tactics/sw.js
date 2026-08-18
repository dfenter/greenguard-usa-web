/* sw-template.js - Emberhold Tactics offline cache. */
const SLUG = 'emberhold-tactics';
const VERSION = '2026-08-16-aaa-round2-tactics2-2026-08-17-density-rollback';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/emberhold-tactics/',
  '/play/emberhold-tactics/index.html',
  '/play/emberhold-tactics/game.js',
  '/play/emberhold-tactics/sim.js',
  '/play/emberhold-tactics/sw.js',
  '/play/emberhold-tactics/manifest.json',
  '/play/emberhold-tactics/icon.png',
  '/play/emberhold-tactics/icon512.png',
  '/play/emberhold-tactics/favicon.png',
  '/play/emberhold-tactics/assets/ambient_hum.mp3',
  '/play/emberhold-tactics/assets/ambient_intensity.mp3',
  '/play/emberhold-tactics/assets/sfx_select.mp3',
  '/play/emberhold-tactics/assets/sfx_move.mp3',
  '/play/emberhold-tactics/assets/sfx_clash.mp3',
  '/play/emberhold-tactics/assets/sfx_damage.mp3',
  '/play/emberhold-tactics/assets/sfx_confirm.mp3',
  '/play/emberhold-tactics/assets/sfx_victory.mp3',
  '/play/emberhold-tactics/assets/sfx_defeat.mp3',
  '/play/emberhold-tactics/assets/sfx_pickup.mp3',
  '/play/emberhold-tactics/assets/unit_player.svg',
  '/play/emberhold-tactics/assets/unit_enemy.svg',
  '/play/emberhold-tactics/assets/unit_boss.svg',
  '/play/emberhold-tactics/assets/tile_grass.svg',
  '/play/emberhold-tactics/assets/tile_stone.svg',
  '/play/emberhold-tactics/assets/tile_sand.svg',
  '/play/emberhold-tactics/assets/tile_water.svg',
  '/play/emberhold-tactics/assets/pickup_heal.svg',
  '/play/emberhold-tactics/assets/pickup_buff.svg',
  '/play/emberhold-tactics/assets/fx_spark.svg',
  '/play/emberhold-tactics/assets/fx_ember.svg',
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
