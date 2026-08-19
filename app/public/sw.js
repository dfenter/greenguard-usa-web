/* GreenGuard portal service worker.
 *
 * Deliberately conservative because the portal serves authenticated, per-user
 * data: it NEVER caches HTML pages or /api responses (that would risk showing
 * one user stale or another user's data). It only cache-firsts immutable static
 * assets, and falls back to an offline page for navigations when the network is
 * down. */

const VERSION = 'v3'
const STATIC_CACHE = `gg-static-${VERSION}`
const OFFLINE_URL = '/offline.html'

const PRECACHE = [OFFLINE_URL, '/manifest.json', '/icon-192.png', '/icon-512.png', '/favicon.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// Immutable static assets that are safe to cache-first.
function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/images/') ||
    url.pathname.startsWith('/system-icons/') ||
    /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?|css)$/.test(url.pathname) ||
    url.pathname === '/manifest.json'
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // let cross-origin pass through
  if (url.pathname.startsWith('/api/')) return // never cache API/auth responses

  // Static assets — cache-first, populate on first fetch.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((hit) => {
        if (hit) return hit
        return fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy))
          }
          return res
        })
      })
    )
    return
  }

  // Page navigations — network-first; show offline page when truly offline.
  // HTML itself is never cached, so users never get a stale/wrong-user page.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)))
  }
})
