/* Derived from /play/_shared/sw-template.js. Cache first, offline after the first load. */
const SLUG = 'ironsight-ops';
const VERSION = '2026-08-13-aaa-1-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/ironsight-ops/',
  '/play/ironsight-ops/index.html',
  '/play/ironsight-ops/game.js',
  '/play/ironsight-ops/io_content.js',
  '/play/ironsight-ops/io_art.js',
  '/play/ironsight-ops/io_sim.js',
  '/play/ironsight-ops/io_rules.js',
  '/play/ironsight-ops/manifest.json',
  '/play/ironsight-ops/icon.png',
  '/play/ironsight-ops/icon512.png',
  '/play/ironsight-ops/favicon.png',
  '/play/ironsight-ops/favicon.ico',
  '/play/ironsight-ops/LICENSES.md',
  '/play/ironsight-ops/NOTES.md',
  '/play/ironsight-ops/assets/alarm.mp3',
  '/play/ironsight-ops/assets/breach.mp3',
  '/play/ironsight-ops/assets/down.mp3',
  '/play/ironsight-ops/assets/empty.mp3',
  '/play/ironsight-ops/assets/explode.mp3',
  '/play/ironsight-ops/assets/flash.mp3',
  '/play/ironsight-ops/assets/hit_body.mp3',
  '/play/ironsight-ops/assets/hit_wall.mp3',
  '/play/ironsight-ops/assets/hurt.mp3',
  '/play/ironsight-ops/assets/kill.mp3',
  '/play/ironsight-ops/assets/m_contact.mp3',
  '/play/ironsight-ops/assets/m_menu.mp3',
  '/play/ironsight-ops/assets/m_ops.mp3',
  '/play/ironsight-ops/assets/medal.mp3',
  '/play/ironsight-ops/assets/objective.mp3',
  '/play/ironsight-ops/assets/ping.mp3',
  '/play/ironsight-ops/assets/reload.mp3',
  '/play/ironsight-ops/assets/shot_ar.mp3',
  '/play/ironsight-ops/assets/shot_dmr.mp3',
  '/play/ironsight-ops/assets/shot_pistol.mp3',
  '/play/ironsight-ops/assets/shot_sg.mp3',
  '/play/ironsight-ops/assets/shot_smg.mp3',
  '/play/ironsight-ops/assets/swap.mp3',
  '/play/ironsight-ops/assets/ui.mp3',
  '/play/ironsight-ops/assets/vault.mp3',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((k) => k.startsWith('gg-' + SLUG + '-') && k !== CACHE).map((k) => caches.delete(k))
  )).then(() => self.clients.claim()));
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
