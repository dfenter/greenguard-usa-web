/* sw.js — Redline GT. Built from /play/_shared/sw-template.js.
 * Offline-after-first-load per the UX/PWA gate. Cache-first for same-origin
 * GETs under /play/redline-gt/ and /play/_shared/; network passthrough otherwise.
 * Bump VERSION on every deploy of the game to invalidate stale caches.
 */
const SLUG = 'redline-gt';
// Bump on every deploy that changes a cached file. Frame-budget restoration
// keeps the polished look while moving cars/backgrounds onto cheap paths.
const VERSION = '12';
const CACHE = 'gg-' + SLUG + '-' + VERSION;
const ASSETS = [
  '/play/redline-gt/',
  '/play/redline-gt/index.html',
  '/play/redline-gt/game.js',
  '/play/redline-gt/track.js',
  '/play/redline-gt/sw.js',
  '/play/redline-gt/cars.js',
  '/play/redline-gt/fx.js',
  '/play/redline-gt/audio.js',
  '/play/redline-gt/hud.js',
  '/play/redline-gt/manifest.json',
  '/play/redline-gt/icon.png',
  '/play/redline-gt/assets/cars/SportsCar.obj',
  '/play/redline-gt/assets/cars/SportsCar.mtl',
  '/play/redline-gt/assets/cars/SportsCar2.obj',
  '/play/redline-gt/assets/cars/SportsCar2.mtl',
  '/play/redline-gt/assets/cars/NormalCar1.obj',
  '/play/redline-gt/assets/cars/NormalCar1.mtl',
  '/play/redline-gt/assets/cars/NormalCar2.obj',
  '/play/redline-gt/assets/cars/NormalCar2.mtl',
  '/play/redline-gt/assets/cars/SUV.obj',
  '/play/redline-gt/assets/cars/SUV.mtl',
  '/play/redline-gt/assets/cars/Taxi.obj',
  '/play/redline-gt/assets/cars/Taxi.mtl',
  '/play/redline-gt/assets/sfx/collide.mp3',
  '/play/redline-gt/assets/sfx/scrape.mp3',
  '/play/redline-gt/assets/sfx/skid.mp3',
  '/play/redline-gt/assets/sfx/uitick.mp3',
  '/play/redline-gt/assets/sfx/uiselect.mp3',
  '/play/redline-gt/assets/sfx/checkpoint.mp3',
  '/play/redline-gt/assets/sfx/gearshift.mp3',
  '/play/redline-gt/assets/sfx/beep.mp3',
  '/play/redline-gt/assets/sfx/boost.mp3',
  '/play/redline-gt/assets/sfx/fanfare.mp3',
  '/play/redline-gt/assets/sfx/lapchime.mp3',
  '/play/redline-gt/assets/music/menu.mp3',
  '/play/redline-gt/assets/music/race_a.mp3',
  '/play/redline-gt/assets/music/race_b.mp3',
  '/play/_shared/ggkit.js',
  '/play/_shared/three/three.module.min.js',
  '/play/_shared/three/OBJLoader.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('gg-' + SLUG + '-') && k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});
// Code is network-first, content is cache-first.
//
// A purely cache-first worker keeps serving an entire stale build for as long
// as the cache survives, so a deploy that forgets the VERSION bump is
// invisible to every existing install. HTML and JavaScript now go to the
// network first with a short timeout and fall back to the cache, so a shipped
// fix reaches a returning player on the next load even when VERSION did not
// move, while the offline guarantee is unchanged: the cached copy answers the
// moment the network does not.
//
// Binary content (models, audio, icons) stays cache-first: it is immutable for
// a given build, it is the bulk of the payload, and re-validating it on every
// load would undo the offline win for no benefit.
const CODE_RE = /\.(?:html|js|mjs|json)$|\/$/i;
const NET_TIMEOUT = 2500;

function fromNetwork(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), NET_TIMEOUT);
    fetch(request).then((res) => {
      clearTimeout(timer);
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
      }
      resolve(res);
    }).catch((err) => { clearTimeout(timer); reject(err); });
  });
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Scope note: a worker registered at /play/redline-gt/ controls the game
  // PAGE, and a controlled page's fetches are dispatched to it whatever their
  // path, so caching /play/_shared/ from here is correct and does not need a
  // wider registration scope.
  if (!url.pathname.startsWith('/play/' + SLUG + '/')
    && !url.pathname.startsWith('/play/_shared/')
    && !url.pathname.startsWith('/play/_assets/')) return;

  if (CODE_RE.test(url.pathname)) {
    e.respondWith(
      fromNetwork(e.request)
        .catch(() => caches.match(e.request, { ignoreSearch: true }))
        .then((res) => res || fetch(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) =>
      hit ||
      fetch(e.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
    )
  );
});
