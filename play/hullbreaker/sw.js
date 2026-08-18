/* sw-template.js — copy to /play/<slug>/sw.js and fill SLUG, VERSION, ASSETS.
 * Offline-after-first-load per the UX/PWA gate. Cache-first for same-origin
 * GETs under /play/<slug>/ and /play/_shared/; network passthrough otherwise.
 * Bump VERSION on every deploy of the game to invalidate stale caches.
 */
const SLUG = 'hullbreaker';
const VERSION = '2026-08-16-round2-polish1-2026-08-17-offline-redirect-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/hullbreaker/',
  '/play/hullbreaker/index.html',
  '/play/hullbreaker/manifest.json',
  '/play/hullbreaker/icon.png',
  '/play/hullbreaker/icon512.png',
  '/play/hullbreaker/hb_data.js',
  '/play/hullbreaker/game.js',
  '/play/hullbreaker/hb_menu.js',
  '/play/hullbreaker/hb_play.js',
  '/play/hullbreaker/hb_hud.js',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js',
  '/play/hullbreaker/assets/atlas.json',
  '/play/hullbreaker/assets/atlas.png',
  '/play/hullbreaker/assets/atlas2.json',
  '/play/hullbreaker/assets/atlas2.png',
  '/play/hullbreaker/assets/favicon.png',
  '/play/hullbreaker/assets/logo.png',
  '/play/hullbreaker/assets/music_boss.mp3',
  '/play/hullbreaker/assets/music_field.mp3',
  '/play/hullbreaker/assets/music_intensity.mp3',
  '/play/hullbreaker/assets/neb.png',
  '/play/hullbreaker/assets/sfx_banner.mp3',
  '/play/hullbreaker/assets/sfx_boss.mp3',
  '/play/hullbreaker/assets/sfx_critical.mp3',
  '/play/hullbreaker/assets/sfx_dash.mp3',
  '/play/hullbreaker/assets/sfx_engine.mp3',
  '/play/hullbreaker/assets/sfx_frac_big.mp3',
  '/play/hullbreaker/assets/sfx_frac_med.mp3',
  '/play/hullbreaker/assets/sfx_frac_small.mp3',
  '/play/hullbreaker/assets/sfx_homing.mp3',
  '/play/hullbreaker/assets/sfx_laser.mp3',
  '/play/hullbreaker/assets/sfx_lose.mp3',
  '/play/hullbreaker/assets/sfx_medal.mp3',
  '/play/hullbreaker/assets/sfx_ore.mp3',
  '/play/hullbreaker/assets/sfx_overheat.mp3',
  '/play/hullbreaker/assets/sfx_pickup.mp3',
  '/play/hullbreaker/assets/sfx_pulse.mp3',
  '/play/hullbreaker/assets/sfx_shield.mp3',
  '/play/hullbreaker/assets/sfx_spread.mp3',
  '/play/hullbreaker/assets/sfx_ui.mp3',
  '/play/hullbreaker/assets/sfx_upgrade.mp3',
  '/play/hullbreaker/assets/stars.png',
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
