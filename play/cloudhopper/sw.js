/* sw-template.js - Cloudhopper offline shell. */
const SLUG = 'cloudhopper';
const VERSION = '1.2.1-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/cloudhopper/', '/play/cloudhopper/index.html', '/play/cloudhopper/style.css', '/play/cloudhopper/game.js',
  '/play/cloudhopper/manifest.json', '/play/cloudhopper/LICENSES.md', '/play/cloudhopper/icon.png', '/play/cloudhopper/icon512.png',
  '/play/cloudhopper/assets/ui_confirm.mp3', '/play/cloudhopper/assets/ui_select.mp3',
  '/play/cloudhopper/assets/ring_pass.mp3', '/play/cloudhopper/assets/cargo_pickup.mp3',
  '/play/cloudhopper/assets/stall_warn.mp3', '/play/cloudhopper/assets/fuel_low.mp3',
  '/play/cloudhopper/assets/landing.mp3', '/play/cloudhopper/assets/crash.mp3', '/play/cloudhopper/assets/engine.mp3',
  '/play/cloudhopper/assets/flight_dawn.mp3', '/play/cloudhopper/assets/flight_sunset.mp3',
  '/play/_shared/ggkit.js', '/play/_shared/three/three.module.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('gg-' + SLUG + '-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const ROOT = '/play/' + SLUG;
  // The deployed site serves the title at the NO-TRAILING-SLASH url and
  // 308-redirects the slash form onto it. The old scope test required
  // ROOT + '/', so the canonical navigation was never in scope, the worker
  // never answered it, and offline died on EVERY title in the fleet while
  // still reporting a registered service worker. Accept both forms.
  const inScope = url.pathname === ROOT || url.pathname.startsWith(ROOT + '/')
    || url.pathname.startsWith('/play/_shared/') || url.pathname.startsWith('/play/_assets/');
  if (!inScope) return;
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
          e.request.mode === 'navigate' ? caches.match(INDEX) : Promise.reject(new Error('offline'))
        )
      )
  );
});
