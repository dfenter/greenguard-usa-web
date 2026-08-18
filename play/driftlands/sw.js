/* sw-template.js — copy to /play/<slug>/sw.js and fill SLUG, VERSION, ASSETS.
 * Offline-after-first-load per the UX/PWA gate. Cache-first for same-origin
 * GETs under /play/<slug>/ and /play/_shared/; network passthrough otherwise.
 * Bump VERSION on every deploy of the game to invalidate stale caches.
 */
const SLUG = 'driftlands';
const VERSION = '1.2.0-2026-08-17-density-rollback';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/driftlands/',
  '/play/driftlands/index.html',
  '/play/driftlands/art.js',
  '/play/driftlands/world.js',
  '/play/driftlands/game.js',
  '/play/driftlands/manifest.json',
  '/play/driftlands/icon.png',
  '/play/driftlands/icon512.png',
  '/play/driftlands/favicon.png',
  '/play/driftlands/assets/img/tiny-town.png',
  '/play/driftlands/assets/img/tiny-dungeon.png',
  '/play/driftlands/assets/audio/m_deep.mp3',
  '/play/driftlands/assets/audio/m_isle.mp3',
  '/play/driftlands/assets/audio/m_tide.mp3',
  '/play/driftlands/assets/audio/m_title.mp3',
  '/play/driftlands/assets/audio/s_boss.mp3',
  '/play/driftlands/assets/audio/s_chop.mp3',
  '/play/driftlands/assets/audio/s_door.mp3',
  '/play/driftlands/assets/audio/s_heart.mp3',
  '/play/driftlands/assets/audio/s_hit.mp3',
  '/play/driftlands/assets/audio/s_hurt.mp3',
  '/play/driftlands/assets/audio/s_kill.mp3',
  '/play/driftlands/assets/audio/s_pickup.mp3',
  '/play/driftlands/assets/audio/s_relic.mp3',
  '/play/driftlands/assets/audio/s_reveal.mp3',
  '/play/driftlands/assets/audio/s_sealed.mp3',
  '/play/driftlands/assets/audio/s_sigil.mp3',
  '/play/driftlands/assets/audio/s_step_grass.mp3',
  '/play/driftlands/assets/audio/s_step_sand.mp3',
  '/play/driftlands/assets/audio/s_step_stone.mp3',
  '/play/driftlands/assets/audio/s_swing.mp3',
  '/play/driftlands/assets/audio/s_ui.mp3',
  '/play/driftlands/assets/audio/s_win.mp3',
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
