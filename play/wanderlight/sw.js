const SLUG = 'wanderlight';
const VERSION = 'aaa-2026-08-07-06-2026-08-17-webkit-encoding-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/wanderlight/',
  '/play/wanderlight/index.html',
  '/play/wanderlight/manifest.json',
  '/play/wanderlight/assets/icon.png',
  '/play/wanderlight/assets/icon512.png',
  '/play/wanderlight/assets/favicon.png',
  '/play/wanderlight/js/engine.js',
  '/play/wanderlight/js/sound.js',
  '/play/wanderlight/js/sprites.js',
  '/play/wanderlight/js/tiles.js',
  '/play/wanderlight/js/world.js',
  '/play/wanderlight/js/dungeon.js',
  '/play/wanderlight/js/entities.js',
  '/play/wanderlight/js/items.js',
  '/play/wanderlight/js/game.js',
  '/play/wanderlight/js/view.js',
  '/play/wanderlight/assets/town_tiles.png',
  '/play/wanderlight/assets/dungeon_tiles.png',
  '/play/wanderlight/assets/spark.png',
  '/play/wanderlight/assets/magic.png',
  '/play/wanderlight/assets/flame.png',
  '/play/wanderlight/assets/music-explore.mp3',
  '/play/wanderlight/assets/music-dungeon.mp3',
  '/play/wanderlight/assets/sfx-beam.mp3',
  '/play/wanderlight/assets/sfx-bomb.mp3',
  '/play/wanderlight/assets/sfx-die.mp3',
  '/play/wanderlight/assets/sfx-enemy-die.mp3',
  '/play/wanderlight/assets/sfx-enemy-hit.mp3',
  '/play/wanderlight/assets/sfx-hurt.mp3',
  '/play/wanderlight/assets/sfx-item.mp3',
  '/play/wanderlight/assets/sfx-lowbeat.mp3',
  '/play/wanderlight/assets/sfx-rupee.mp3',
  '/play/wanderlight/assets/sfx-secret.mp3',
  '/play/wanderlight/assets/sfx-select.mp3',
  '/play/wanderlight/assets/sfx-stairs.mp3',
  '/play/wanderlight/assets/sfx-sword.mp3',
  '/play/wanderlight/assets/sfx-text.mp3',
  '/play/wanderlight/assets/sfx-whistle.mp3',
  '/play/_shared/ggkit.js',
  '/play/_shared/phaser.min.js'
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
