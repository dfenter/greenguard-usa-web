/* sw.js - authored from /play/_shared/sw-template.js.
 * Offline-after-first-load per the UX/PWA gate. Cache-first for same-origin
 * GETs under /play/serpentine/ and /play/_shared/; network passthrough
 * otherwise. Bump VERSION on every deploy to invalidate stale caches.
 *
 * Every path below is a file that actually exists in this directory or in
 * /play/_shared/. Authored SVG and MP3 files are listed explicitly so the
 * installed game remains playable offline after the first load.
 */
const SLUG = 'serpentine';
const VERSION = '2026-08-10-ui-declutter-1-2026-08-17-webkit-encoding-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/serpentine/',
  '/play/serpentine/index.html',
  '/play/serpentine/sp_data.js',
  '/play/serpentine/game.js',
  '/play/serpentine/sw.js',
  '/play/serpentine/manifest.json',
  '/play/serpentine/favicon.png',
  '/play/serpentine/icon.png',
  '/play/serpentine/icon512.png',
  '/play/serpentine/assets/board-detail.svg',
  '/play/serpentine/assets/body.svg',
  '/play/serpentine/assets/pip.svg',
  '/play/serpentine/assets/shield-pip.svg',
  '/play/serpentine/assets/pad.svg',
  '/play/serpentine/assets/gate.svg',
  '/play/serpentine/assets/core.svg',
  '/play/serpentine/assets/glow.svg',
  '/play/serpentine/assets/spark.svg',
  '/play/serpentine/assets/star.svg',
  '/play/serpentine/assets/flare.svg',
  '/play/serpentine/assets/jet.svg',
  '/play/serpentine/assets/guide.svg',
  '/play/serpentine/assets/head-arrow-idle.svg',
  '/play/serpentine/assets/head-arrow-turn.svg',
  '/play/serpentine/assets/head-arrow-damage.svg',
  '/play/serpentine/assets/head-visor-idle.svg',
  '/play/serpentine/assets/head-visor-turn.svg',
  '/play/serpentine/assets/head-visor-damage.svg',
  '/play/serpentine/assets/head-crown-idle.svg',
  '/play/serpentine/assets/head-crown-turn.svg',
  '/play/serpentine/assets/head-crown-damage.svg',
  '/play/serpentine/assets/head-halo-idle.svg',
  '/play/serpentine/assets/head-halo-turn.svg',
  '/play/serpentine/assets/head-halo-damage.svg',
  '/play/serpentine/assets/audio/turn.mp3',
  '/play/serpentine/assets/audio/pip.mp3',
  '/play/serpentine/assets/audio/boost.mp3',
  '/play/serpentine/assets/audio/gatewarn.mp3',
  '/play/serpentine/assets/audio/gate.mp3',
  '/play/serpentine/assets/audio/crash.mp3',
  '/play/serpentine/assets/audio/save.mp3',
  '/play/serpentine/assets/audio/shield.mp3',
  '/play/serpentine/assets/audio/surge.mp3',
  '/play/serpentine/assets/audio/clear.mp3',
  '/play/serpentine/assets/audio/unlock.mp3',
  '/play/serpentine/assets/audio/click.mp3',
  '/play/serpentine/assets/audio/storm.mp3',
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
