/* sw-template.js — copy to /play/<slug>/sw.js and fill SLUG, VERSION, ASSETS.
 * Offline-after-first-load per the UX/PWA gate. Cache-first for same-origin
 * GETs under /play/<slug>/ and /play/_shared/; network passthrough otherwise.
 * Bump VERSION on every deploy of the game to invalidate stale caches.
 */
const SLUG = 'skyfall-command';
const VERSION = '2026-08-08-uplift-round2-2026-08-17-webkit-encoding-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/skyfall-command/',
  '/play/skyfall-command/index.html',
  '/play/skyfall-command/game.js',
  '/play/skyfall-command/manifest.json',
  '/play/skyfall-command/icon.png',
  '/play/skyfall-command/icon512.png',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js',
  '/play/skyfall-command/assets/atlas.json',
  '/play/skyfall-command/assets/atlas.png',
  '/play/skyfall-command/assets/aurora.png',
  '/play/skyfall-command/assets/city_far.png',
  '/play/skyfall-command/assets/city_mid.png',
  '/play/skyfall-command/assets/city_near.png',
  '/play/skyfall-command/assets/clouds.png',
  '/play/skyfall-command/assets/digits.json',
  '/play/skyfall-command/assets/digits.png',
  '/play/skyfall-command/assets/disc.png',
  '/play/skyfall-command/assets/ground.png',
  '/play/skyfall-command/assets/logo.png',
  '/play/skyfall-command/assets/music_alert.mp3',
  '/play/skyfall-command/assets/music_night.mp3',
  '/play/skyfall-command/assets/neb.png',
  '/play/skyfall-command/assets/p_ember.png',
  '/play/skyfall-command/assets/p_fire.png',
  '/play/skyfall-command/assets/p_flare.png',
  '/play/skyfall-command/assets/p_ribbon.png',
  '/play/skyfall-command/assets/p_shard.png',
  '/play/skyfall-command/assets/p_smoke.png',
  '/play/skyfall-command/assets/p_spark.png',
  '/play/skyfall-command/assets/sfx_airburst.mp3',
  '/play/skyfall-command/assets/sfx_armor.mp3',
  '/play/skyfall-command/assets/sfx_buy.mp3',
  '/play/skyfall-command/assets/sfx_clear.mp3',
  '/play/skyfall-command/assets/sfx_cruiser.mp3',
  '/play/skyfall-command/assets/sfx_defeat.mp3',
  '/play/skyfall-command/assets/sfx_district.mp3',
  '/play/skyfall-command/assets/sfx_dry.mp3',
  '/play/skyfall-command/assets/sfx_impact.mp3',
  '/play/skyfall-command/assets/sfx_launch.mp3',
  '/play/skyfall-command/assets/sfx_pod.mp3',
  '/play/skyfall-command/assets/sfx_reload.mp3',
  '/play/skyfall-command/assets/sfx_shield.mp3',
  '/play/skyfall-command/assets/sfx_siren.mp3',
  '/play/skyfall-command/assets/sfx_splinter.mp3',
  '/play/skyfall-command/assets/sfx_ui.mp3',
  '/play/skyfall-command/assets/sfx_wraith.mp3',
  '/play/skyfall-command/assets/stars.png',
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
