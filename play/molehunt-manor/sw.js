const SLUG = 'molehunt-manor';
const VERSION = 'aaa-20260816-01-2026-08-16-offline-fix-2026-08-16-gate-repair';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/molehunt-manor/',
  '/play/molehunt-manor/index.html',
  '/play/molehunt-manor/game.js',
  '/play/molehunt-manor/manifest.json',
  '/play/molehunt-manor/icon.png',
  '/play/molehunt-manor/icon512.png',
  '/play/molehunt-manor/favicon.png',
  '/play/molehunt-manor/assets/music_manor.mp3',
  '/play/molehunt-manor/assets/music_tension.mp3',
  '/play/molehunt-manor/assets/sfx_tap.mp3',
  '/play/molehunt-manor/assets/sfx_move.mp3',
  '/play/molehunt-manor/assets/sfx_task.mp3',
  '/play/molehunt-manor/assets/sfx_sight.mp3',
  '/play/molehunt-manor/assets/sfx_clue.mp3',
  '/play/molehunt-manor/assets/sfx_alarm.mp3',
  '/play/molehunt-manor/assets/sfx_vote.mp3',
  '/play/molehunt-manor/assets/sfx_catch.mp3',
  '/play/molehunt-manor/assets/sfx_wrong.mp3',
  '/play/molehunt-manor/assets/sfx_reveal.mp3',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('gg-' + SLUG + '-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
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
