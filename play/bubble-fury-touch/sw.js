/* sw-template.js — copy to /play/<slug>/sw.js and fill SLUG, VERSION, ASSETS.
 * Offline-after-first-load per the UX/PWA gate. Cache-first for same-origin
 * GETs under /play/<slug>/ and /play/_shared/; network passthrough otherwise.
 * Bump VERSION on every deploy of the game to invalidate stale caches.
 */
const SLUG = 'bubble-fury-touch';
const VERSION = '2026-08-10-declutter1-2026-08-17-webkit-encoding-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/bubble-fury-touch/',
  '/play/bubble-fury-touch/index.html',
  '/play/bubble-fury-touch/game.js',
  '/play/bubble-fury-touch/bf_data.js',
  '/play/bubble-fury-touch/manifest.json',
  '/play/bubble-fury-touch/icon.png',
  '/play/bubble-fury-touch/icon512.png',
  '/play/bubble-fury-touch/favicon.png',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js',
  '/play/bubble-fury-touch/assets/amb_arena.mp3',
  '/play/bubble-fury-touch/assets/atlas.json',
  '/play/bubble-fury-touch/assets/atlas.png',
  '/play/bubble-fury-touch/assets/disc.png',
  '/play/bubble-fury-touch/assets/floor_choke.jpg',
  '/play/bubble-fury-touch/assets/floor_furnace.jpg',
  '/play/bubble-fury-touch/assets/floor_night.jpg',
  '/play/bubble-fury-touch/assets/floor_plaza.jpg',
  '/play/bubble-fury-touch/assets/floor_yard.jpg',
  '/play/bubble-fury-touch/assets/logo.png',
  '/play/bubble-fury-touch/assets/music_arena.mp3',
  '/play/bubble-fury-touch/assets/music_boss.mp3',
  '/play/bubble-fury-touch/assets/nightmask.png',
  '/play/bubble-fury-touch/assets/p_ember.png',
  '/play/bubble-fury-touch/assets/p_ring.png',
  '/play/bubble-fury-touch/assets/p_shard.png',
  '/play/bubble-fury-touch/assets/p_smoke.png',
  '/play/bubble-fury-touch/assets/p_spark.png',
  '/play/bubble-fury-touch/assets/p_star.png',
  '/play/bubble-fury-touch/assets/sfx_boss_death.mp3',
  '/play/bubble-fury-touch/assets/sfx_boss_hit.mp3',
  '/play/bubble-fury-touch/assets/sfx_boss_roar.mp3',
  '/play/bubble-fury-touch/assets/sfx_dash.mp3',
  '/play/bubble-fury-touch/assets/sfx_defeat.mp3',
  '/play/bubble-fury-touch/assets/sfx_elite_death.mp3',
  '/play/bubble-fury-touch/assets/sfx_enemy_death.mp3',
  '/play/bubble-fury-touch/assets/sfx_enemy_shoot.mp3',
  '/play/bubble-fury-touch/assets/sfx_fire_beam.mp3',
  '/play/bubble-fury-touch/assets/sfx_fire_bounce.mp3',
  '/play/bubble-fury-touch/assets/sfx_fire_flak.mp3',
  '/play/bubble-fury-touch/assets/sfx_fire_rail.mp3',
  '/play/bubble-fury-touch/assets/sfx_fire_spread.mp3',
  '/play/bubble-fury-touch/assets/sfx_hurt.mp3',
  '/play/bubble-fury-touch/assets/sfx_medal.mp3',
  '/play/bubble-fury-touch/assets/sfx_pickup_health.mp3',
  '/play/bubble-fury-touch/assets/sfx_pickup_mult.mp3',
  '/play/bubble-fury-touch/assets/sfx_pickup_weapon.mp3',
  '/play/bubble-fury-touch/assets/sfx_ui_select.mp3',
  '/play/bubble-fury-touch/assets/sfx_ui_tick.mp3',
  '/play/bubble-fury-touch/assets/sfx_unlock.mp3',
  '/play/bubble-fury-touch/assets/sfx_victory.mp3',
  '/play/bubble-fury-touch/assets/sfx_wave_clear.mp3',
  '/play/bubble-fury-touch/assets/sfx_wave_start.mp3',
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
        // fetch() hands us the DECODED bytes, so the transport headers no
        // longer describe this body: content-encoding (gzip/br), the
        // compressed content-length and transfer-encoding are now lies.
        // WebKit honours them when the cache replays the response and fails
        // to decode the page - a controlled navigation dies with no console
        // and the title "does not start" on iPhone - while Chrome ignores
        // them, which is why every headless gate reported READY. Strip them.
        const headers = new Headers(res.headers);
        headers.delete('content-encoding');
        headers.delete('content-length');
        headers.delete('transfer-encoding');
        await c.put(u, new Response(await res.blob(), {
          status: 200, statusText: 'OK', headers: headers,
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
