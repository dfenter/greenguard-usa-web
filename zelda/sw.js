// Nuclear-reset worker: clears all zelda caches, forces client reload, unregisters.
// Replace with a real caching SW once the game is confirmed working.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const c of clients) c.navigate(c.url);
    await self.registration.unregister();
  })());
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request));
});
