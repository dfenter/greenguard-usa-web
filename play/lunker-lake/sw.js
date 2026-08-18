const SLUG = 'lunker-lake';
const VERSION = 'aaa-art2-20260808-2-2026-08-17-density-rollback';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/lunker-lake/', '/play/lunker-lake/index.html', '/play/lunker-lake/data.js', '/play/lunker-lake/game.js',
  '/play/lunker-lake/manifest.json', '/play/lunker-lake/icon.png', '/play/lunker-lake/icon512.png', '/play/lunker-lake/favicon.png',
  '/play/_shared/phaser.min.js', '/play/_shared/ggkit.js',
  '/play/lunker-lake/assets/fish_blue.png', '/play/lunker-lake/assets/fish_brown.png', '/play/lunker-lake/assets/fish_green.png', '/play/lunker-lake/assets/fish_grey.png', '/play/lunker-lake/assets/fish_grey_long_a.png', '/play/lunker-lake/assets/fish_orange.png', '/play/lunker-lake/assets/fish_pink.png', '/play/lunker-lake/assets/fish_red.png', '/play/lunker-lake/assets/rock_a.png', '/play/lunker-lake/assets/rock_b.png', '/play/lunker-lake/assets/seaweed_c.png', '/play/lunker-lake/assets/seaweed_f.png', '/play/lunker-lake/assets/bubble_a.png', '/play/lunker-lake/assets/bubble_b.png', '/play/lunker-lake/assets/bubble_c.png',
  '/play/lunker-lake/assets/dawn_loop.mp3', '/play/lunker-lake/assets/expedition_loop.mp3', '/play/lunker-lake/assets/sfx_cast.mp3', '/play/lunker-lake/assets/sfx_splash.mp3', '/play/lunker-lake/assets/sfx_twitch.mp3', '/play/lunker-lake/assets/sfx_hook.mp3', '/play/lunker-lake/assets/sfx_reel.mp3', '/play/lunker-lake/assets/sfx_snap.mp3', '/play/lunker-lake/assets/sfx_land.mp3', '/play/lunker-lake/assets/sfx_ui.mp3', '/play/lunker-lake/assets/sfx_bubble.mp3', '/play/lunker-lake/assets/sfx_break.mp3'
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
