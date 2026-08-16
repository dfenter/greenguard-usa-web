/* Descent Protocol service worker. Generated from /play/_shared/sw-template.js. */
const SLUG = 'descent-protocol';
const VERSION = '2026.08.16.1-2026-08-16-offline-fix-2026-08-16-gate-repair';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/descent-protocol/',
  '/play/descent-protocol/index.html',
  '/play/descent-protocol/game.js',
  '/play/descent-protocol/manifest.json',
  '/play/descent-protocol/icon.png',
  '/play/descent-protocol/icon512.png',
  '/play/descent-protocol/favicon.svg',
  '/play/descent-protocol/assets/ambient_hum.mp3',
  '/play/descent-protocol/assets/weapon_fire_1.mp3',
  '/play/descent-protocol/assets/weapon_fire_2.mp3',
  '/play/descent-protocol/assets/weapon_fire_3.mp3',
  '/play/descent-protocol/assets/door_chime.mp3',
  '/play/descent-protocol/assets/keycard_chime.mp3',
  '/play/descent-protocol/assets/hit_impact.mp3',
  '/play/descent-protocol/assets/boss_phase.mp3',
  '/play/descent-protocol/assets/danger_intensity.mp3',
  '/play/descent-protocol/assets/reload_click.mp3',
  '/play/descent-protocol/assets/pickup_ping.mp3',
  '/play/descent-protocol/assets/warning_beep.mp3',
  '/play/descent-protocol/assets/room_clear.mp3',
  '/play/descent-protocol/assets/victory_fanfare.mp3',
  '/play/descent-protocol/assets/floor-panel.svg',
  '/play/descent-protocol/assets/room-panel.svg',
  '/play/descent-protocol/assets/cover-crate.svg',
  '/play/descent-protocol/assets/door-panel.svg',
  '/play/descent-protocol/assets/keycard.svg',
  '/play/descent-protocol/assets/lift-panel.svg',
  '/play/descent-protocol/assets/vent-panel.svg',
  '/play/descent-protocol/assets/operator-idle.svg',
  '/play/descent-protocol/assets/operator-move.svg',
  '/play/descent-protocol/assets/operator-fire.svg',
  '/play/descent-protocol/assets/enemy-scout.svg',
  '/play/descent-protocol/assets/enemy-gunner.svg',
  '/play/descent-protocol/assets/enemy-flanker.svg',
  '/play/descent-protocol/assets/enemy-bruiser.svg',
  '/play/descent-protocol/assets/enemy-turret.svg',
  '/play/descent-protocol/assets/enemy-sentinel.svg',
  '/play/descent-protocol/assets/pickup-health.svg',
  '/play/descent-protocol/assets/pickup-armor.svg',
  '/play/descent-protocol/assets/pickup-ammo.svg',
  '/play/descent-protocol/assets/pickup-mod.svg',
  '/play/_shared/ggkit.js',
  '/play/_shared/phaser.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('gg-' + SLUG + '-') && key !== CACHE).map((key) => caches.delete(key))
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
