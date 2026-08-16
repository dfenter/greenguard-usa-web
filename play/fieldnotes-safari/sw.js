/* Fieldnotes Safari service worker. Authored from /play/_shared/sw-template.js. */
const SLUG = 'fieldnotes-safari';
const VERSION = 'aaa-f18-20260816-01-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/fieldnotes-safari/',
  '/play/fieldnotes-safari/index.html',
  '/play/fieldnotes-safari/styles.css',
  '/play/fieldnotes-safari/game.js',
  '/play/fieldnotes-safari/manifest.json',
  '/play/fieldnotes-safari/sw.js',
  '/play/fieldnotes-safari/icon.png',
  '/play/fieldnotes-safari/icon512.png',
  '/play/fieldnotes-safari/favicon.png',
  '/play/fieldnotes-safari/assets/music-delta.mp3',
  '/play/fieldnotes-safari/assets/music-crater.mp3',
  '/play/fieldnotes-safari/assets/step.mp3',
  '/play/fieldnotes-safari/assets/rustle.mp3',
  '/play/fieldnotes-safari/assets/approach.mp3',
  '/play/fieldnotes-safari/assets/bait.mp3',
  '/play/fieldnotes-safari/assets/lure.mp3',
  '/play/fieldnotes-safari/assets/ring.mp3',
  '/play/fieldnotes-safari/assets/throw.mp3',
  '/play/fieldnotes-safari/assets/catch.mp3',
  '/play/fieldnotes-safari/assets/miss.mp3',
  '/play/fieldnotes-safari/assets/flee.mp3',
  '/play/fieldnotes-safari/assets/photo.mp3',
  '/play/fieldnotes-safari/assets/journal.mp3',
  '/play/fieldnotes-safari/assets/unlock.mp3',
  '/play/fieldnotes-safari/assets/boundary.mp3',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js'
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
