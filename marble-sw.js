// Marble Mania service worker.
//
// IMPORTANT: this file is served from the site root, so its scope is "/". It is
// therefore written to be deliberately inert for everything that is not the
// game: any request outside the whitelist below falls straight through to the
// network with no respondWith() call, so the rest of the site behaves exactly
// as if no worker were installed.

const VERSION = 'marble-v1';
const CACHE = VERSION;

// Same-origin paths the game needs. /marble is the clean URL, /marble.html the
// underlying file, and "/" only matters for a standalone local copy.
const GAME_PATHS = new Set(['/marble', '/marble.html', '/marble-manifest.json']);

// Cross-origin runtime dependency (three.js module from the CDN).
const CDN_HOSTS = new Set(['unpkg.com']);

const PRECACHE = ['/marble', '/marble-manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Cache entries individually so one failure cannot abort the install.
    await Promise.all(PRECACHE.map(url => cache.add(url).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('marble-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isGameRequest(url) {
  if (CDN_HOSTS.has(url.hostname)) return true;
  if (url.origin !== self.location.origin) return false;
  return GAME_PATHS.has(url.pathname);
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch (_) { return; }
  if (!isGameRequest(url)) return;              // everything else: untouched

  const isHtml = request.mode === 'navigate';

  if (isHtml) {
    // Network first so a redeploy is picked up immediately; cache is the
    // offline fallback only.
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      } catch (_) {
        const cached = await caches.match(request);
        return cached || caches.match('/marble') || Response.error();
      }
    })());
    return;
  }

  // Assets: cache first, then network, then whatever we have.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && (response.ok || response.type === 'opaque')) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    } catch (_) {
      return caches.match(request) || Response.error();
    }
  })());
});
