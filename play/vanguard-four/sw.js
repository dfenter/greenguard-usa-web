/* Vanguard Four service worker. Generated from /play/_shared/sw-template.js. */
const SLUG = 'vanguard-four';
const VERSION = '2026-08-10-aaa-f2-r3-2026-08-16-offline-fix';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/vanguard-four/',
  '/play/vanguard-four/index.html',
  '/play/vanguard-four/game.js',
  '/play/vanguard-four/sw.js',
  '/play/vanguard-four/manifest.json',
  '/play/vanguard-four/icon.png',
  '/play/vanguard-four/icon512.png',
  '/play/vanguard-four/favicon.png',
  '/play/vanguard-four/favicon.svg',
  '/play/vanguard-four/assets/vf-chrome.svg',
  '/play/vanguard-four/assets/room-entry.svg',
  '/play/vanguard-four/assets/room-foundry.svg',
  '/play/vanguard-four/assets/room-rampart.svg',
  '/play/vanguard-four/assets/room-warden.svg',
  '/play/vanguard-four/assets/room-finale.svg',
  '/play/vanguard-four/assets/hero-blade.svg',
  '/play/vanguard-four/assets/hero-gravity.svg',
  '/play/vanguard-four/assets/hero-lantern.svg',
  '/play/vanguard-four/assets/hero-storm.svg',
  '/play/vanguard-four/assets/enemy-husk.svg',
  '/play/vanguard-four/assets/enemy-skitter.svg',
  '/play/vanguard-four/assets/enemy-lobber.svg',
  '/play/vanguard-four/assets/enemy-bracer.svg',
  '/play/vanguard-four/assets/enemy-sapper.svg',
  '/play/vanguard-four/assets/enemy-warden.svg',
  '/play/vanguard-four/assets/pickup-super.svg',
  '/play/vanguard-four/assets/pickup-health.svg',
  '/play/vanguard-four/assets/pickup-score.svg',
  '/play/vanguard-four/assets/fx-slash.svg',
  '/play/vanguard-four/assets/fx-spark.svg',
  '/play/vanguard-four/assets/fx-burst.svg',
  '/play/vanguard-four/assets/fx-ring.svg',
  '/play/vanguard-four/assets/fx-link.svg',
  '/play/vanguard-four/assets/fx-pip.svg',
  '/play/vanguard-four/assets/fx-flare.svg',
  '/play/vanguard-four/assets/fx-hazard.svg',
  '/play/vanguard-four/assets/fx-bolt.svg',
  '/play/vanguard-four/assets/music-base.mp3',
  '/play/vanguard-four/assets/music-danger.mp3',
  '/play/vanguard-four/assets/strike-hit.mp3',
  '/play/vanguard-four/assets/super-charge.mp3',
  '/play/vanguard-four/assets/super-release.mp3',
  '/play/vanguard-four/assets/revive-chime.mp3',
  '/play/vanguard-four/assets/warden-roar.mp3',
  '/play/vanguard-four/assets/room-clear.mp3',
  '/play/vanguard-four/assets/dash-step.mp3',
  '/play/vanguard-four/assets/gravity-pull.mp3',
  '/play/vanguard-four/assets/arc-cast.mp3',
  '/play/vanguard-four/assets/chain-zap.mp3',
  '/play/vanguard-four/assets/formation-shift.mp3',
  '/play/vanguard-four/assets/hero-hurt.mp3',
  '/play/vanguard-four/assets/pickup-chime.mp3',
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
