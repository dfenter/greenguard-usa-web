/* sw-template.js - copy to /play/<slug>/sw.js and fill SLUG, VERSION, ASSETS.
 * Offline-after-first-load per the UX/PWA gate. Cache-first for same-origin
 * GETs under /play/<slug>/ and /play/_shared/; network passthrough otherwise.
 * Bump VERSION on every deploy of the game to invalidate stale caches.
 */
const SLUG = 'spire-ascent';
const VERSION = '2026-08-10-ui-declutter-1-2026-08-17-density-rollback';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/spire-ascent/',
  '/play/spire-ascent/index.html',
  '/play/spire-ascent/game.js',
  '/play/spire-ascent/manifest.json',
  '/play/spire-ascent/icon.png',
  '/play/spire-ascent/icon512.png',
  '/play/spire-ascent/favicon.png',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js',
  '/play/spire-ascent/assets/atlas.json',
  '/play/spire-ascent/assets/atlas.png',
  '/play/spire-ascent/assets/digits.json',
  '/play/spire-ascent/assets/digits.png',
  '/play/spire-ascent/assets/far_0.png',
  '/play/spire-ascent/assets/far_1.png',
  '/play/spire-ascent/assets/far_2.png',
  '/play/spire-ascent/assets/far_3.png',
  '/play/spire-ascent/assets/lava.png',
  '/play/spire-ascent/assets/logo.png',
  '/play/spire-ascent/assets/music_climb.mp3',
  '/play/spire-ascent/assets/music_peril.mp3',
  '/play/spire-ascent/assets/near_0.png',
  '/play/spire-ascent/assets/near_1.png',
  '/play/spire-ascent/assets/near_2.png',
  '/play/spire-ascent/assets/near_3.png',
  '/play/spire-ascent/assets/sfx_best.mp3',
  '/play/spire-ascent/assets/sfx_charge.mp3',
  '/play/spire-ascent/assets/sfx_combo0.mp3',
  '/play/spire-ascent/assets/sfx_combo1.mp3',
  '/play/spire-ascent/assets/sfx_combo2.mp3',
  '/play/spire-ascent/assets/sfx_combo3.mp3',
  '/play/spire-ascent/assets/sfx_combo4.mp3',
  '/play/spire-ascent/assets/sfx_crack.mp3',
  '/play/spire-ascent/assets/sfx_crumble.mp3',
  '/play/spire-ascent/assets/sfx_dash.mp3',
  '/play/spire-ascent/assets/sfx_death.mp3',
  '/play/spire-ascent/assets/sfx_ember.mp3',
  '/play/spire-ascent/assets/sfx_jump.mp3',
  '/play/spire-ascent/assets/sfx_jump_big.mp3',
  '/play/spire-ascent/assets/sfx_land.mp3',
  '/play/spire-ascent/assets/sfx_medal.mp3',
  '/play/spire-ascent/assets/sfx_milestone.mp3',
  '/play/spire-ascent/assets/sfx_rumble.mp3',
  '/play/spire-ascent/assets/sfx_spike.mp3',
  '/play/spire-ascent/assets/sfx_spring.mp3',
  '/play/spire-ascent/assets/sfx_start.mp3',
  '/play/spire-ascent/assets/sfx_ui.mp3',
  '/play/spire-ascent/assets/sfx_unlock.mp3',
  '/play/spire-ascent/assets/sfx_wallkick.mp3',
  '/play/spire-ascent/assets/sfx_wind.mp3',
  '/play/spire-ascent/assets/sky_0.png',
  '/play/spire-ascent/assets/sky_1.png',
  '/play/spire-ascent/assets/sky_2.png',
  '/play/spire-ascent/assets/sky_3.png',
  '/play/spire-ascent/assets/vignette.png',
  '/play/spire-ascent/assets/wall_0.png',
  '/play/spire-ascent/assets/wall_1.png',
  '/play/spire-ascent/assets/wall_2.png',
  '/play/spire-ascent/assets/wall_3.png',
  '/play/spire-ascent/assets/windfield.png',
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
