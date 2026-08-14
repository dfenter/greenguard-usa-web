/* Generated from /play/_shared/sw-template.js. */
const SLUG = 'deadline-dungeon';
const VERSION = 'aaa-2026-08-10-v5';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/deadline-dungeon/',
  '/play/deadline-dungeon/index.html',
  '/play/deadline-dungeon/game.js',
  '/play/deadline-dungeon/manifest.json',
  '/play/deadline-dungeon/icon.png',
  '/play/deadline-dungeon/icon512.png',
  '/play/deadline-dungeon/favicon.png',
  '/play/deadline-dungeon/favicon.svg',
  '/play/deadline-dungeon/sw.js',
  '/play/deadline-dungeon/assets/ambient-drone.mp3',
  '/play/deadline-dungeon/assets/crypt-theme.mp3',
  '/play/deadline-dungeon/assets/cistern-theme.mp3',
  '/play/deadline-dungeon/assets/forge-theme.mp3',
  '/play/deadline-dungeon/assets/vault-theme.mp3',
  '/play/deadline-dungeon/assets/danger-sting.mp3',
  '/play/deadline-dungeon/assets/slash.mp3',
  '/play/deadline-dungeon/assets/dash.mp3',
  '/play/deadline-dungeon/assets/hit.mp3',
  '/play/deadline-dungeon/assets/hurt.mp3',
  '/play/deadline-dungeon/assets/pickup.mp3',
  '/play/deadline-dungeon/assets/gate.mp3',
  '/play/deadline-dungeon/assets/medal.mp3',
  '/play/deadline-dungeon/assets/step.mp3',
  '/play/deadline-dungeon/assets/secret.mp3',
  '/play/deadline-dungeon/assets/ui.mp3',
  '/play/deadline-dungeon/assets/danger.mp3',
  '/play/_shared/ggkit.js',
  '/play/_shared/phaser.min.js'
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
  if (!url.pathname.startsWith('/play/' + SLUG + '/') && !url.pathname.startsWith('/play/_shared/')) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  })));
});
