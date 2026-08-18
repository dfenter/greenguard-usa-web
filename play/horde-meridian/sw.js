/* sw-template.js — copy to /play/<slug>/sw.js and fill SLUG, VERSION, ASSETS.
 * Offline-after-first-load per the UX/PWA gate. Cache-first for same-origin
 * GETs under /play/<slug>/ and /play/_shared/; network passthrough otherwise.
 * Bump VERSION on every deploy of the game to invalidate stale caches.
 */
const SLUG = 'horde-meridian';
const VERSION = '2026-08-17-diag-gated-2026-08-17-offline-redirect-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/horde-meridian/',
  '/play/horde-meridian/index.html',
  '/play/horde-meridian/hm_data.js',
  '/play/horde-meridian/levels/level1.js',
  '/play/horde-meridian/levels/level2.js',
  '/play/horde-meridian/levels/level3.js',
  '/play/horde-meridian/levels/level4.js',
  '/play/horde-meridian/levels/level5.js',
  '/play/horde-meridian/levels/level6.js',
  '/play/horde-meridian/levels/level7.js',
  '/play/horde-meridian/levels/level8.js',
  '/play/horde-meridian/levels/level9.js',
  '/play/horde-meridian/hm_campaign_ui.js',
  '/play/horde-meridian/game.js',
  '/play/horde-meridian/sw.js',
  '/play/horde-meridian/manifest.json',
  '/play/horde-meridian/icon.png',
  '/play/horde-meridian/icon512.png',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js',
  '/play/horde-meridian/assets/atlas.json',
  '/play/horde-meridian/assets/atlas.png',
  '/play/horde-meridian/assets/disc.png',
  '/play/horde-meridian/assets/edge.png',
  '/play/horde-meridian/assets/hm_display.woff2',
  '/play/horde-meridian/assets/hm_body.woff2',
  '/play/horde-meridian/assets/ground.png',
  '/play/horde-meridian/assets/music_base.mp3',
  '/play/horde-meridian/assets/music_heat.mp3',
  '/play/horde-meridian/assets/p_flare.png',
  '/play/horde-meridian/assets/p_magic.png',
  '/play/horde-meridian/assets/p_muzzle.png',
  '/play/horde-meridian/assets/p_smoke.png',
  '/play/horde-meridian/assets/p_spark.png',
  '/play/horde-meridian/assets/p_star.png',
  '/play/horde-meridian/assets/sfx_boss_death.mp3',
  '/play/horde-meridian/assets/sfx_click.mp3',
  '/play/horde-meridian/assets/sfx_death.mp3',
  '/play/horde-meridian/assets/sfx_elite_death.mp3',
  '/play/horde-meridian/assets/sfx_enemy_shoot.mp3',
  '/play/horde-meridian/assets/sfx_gem.mp3',
  '/play/horde-meridian/assets/sfx_hit.mp3',
  '/play/horde-meridian/assets/sfx_hurt.mp3',
  '/play/horde-meridian/assets/sfx_levelup.mp3',
  '/play/horde-meridian/assets/sfx_pulse.mp3',
  '/play/horde-meridian/assets/sfx_select.mp3',
  '/play/horde-meridian/assets/sfx_shoot.mp3',
  '/play/horde-meridian/assets/sfx_telegraph.mp3',
  '/play/horde-meridian/assets/sfx_unlock.mp3',
  '/play/horde-meridian/assets/sfx_wave.mp3',
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
