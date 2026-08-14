/* sw-template.js - generated for Blast Radius.
 * Cache-first for this title and the shared Phaser/GGKit runtime. Bump
 * VERSION whenever the title payload changes.
 */
const SLUG = 'blast-radius';
const VERSION = '2026-08-10t-ui-declutter-1';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/blast-radius/',
  '/play/blast-radius/index.html',
  '/play/blast-radius/game.js',
  '/play/blast-radius/sw.js',
  '/play/blast-radius/manifest.json',
  '/play/blast-radius/icon.png',
  '/play/blast-radius/icon512.png',
  '/play/blast-radius/favicon.png',
  '/play/blast-radius/assets/fuse_tick.mp3',
  '/play/blast-radius/assets/blast_boom_a.mp3',
  '/play/blast-radius/assets/blast_boom_b.mp3',
  '/play/blast-radius/assets/blast_chain.mp3',
  '/play/blast-radius/assets/chaser_growl.mp3',
  '/play/blast-radius/assets/pickup_chime.mp3',
  '/play/blast-radius/assets/banner_sting.mp3',
  '/play/blast-radius/assets/score_ping.mp3',
  '/play/blast-radius/assets/music_base.mp3',
  '/play/blast-radius/assets/music_heat.mp3',
  '/play/blast-radius/assets/player_idle.svg',
  '/play/blast-radius/assets/player_move.svg',
  '/play/blast-radius/assets/player_hit.svg',
  '/play/blast-radius/assets/chaser_idle.svg',
  '/play/blast-radius/assets/chaser_hunt.svg',
  '/play/blast-radius/assets/chaser_hit.svg',
  '/play/blast-radius/assets/chaser_boss.svg',
  '/play/blast-radius/assets/bomb.svg',
  '/play/blast-radius/assets/blast.svg',
  '/play/blast-radius/assets/block_intact.svg',
  '/play/blast-radius/assets/block_crumble_a.svg',
  '/play/blast-radius/assets/block_crumble_b.svg',
  '/play/blast-radius/assets/crate.svg',
  '/play/blast-radius/assets/drop.svg',
  '/play/_shared/phaser.min.js',
  '/play/_shared/ggkit.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('gg-' + SLUG + '-') && key !== CACHE).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (!url.pathname.startsWith('/play/' + SLUG + '/') && !url.pathname.startsWith('/play/_shared/')) return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }))
  );
});
