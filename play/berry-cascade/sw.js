/* EMERGENCY RECOVERY WORKER — 2026-08-17.
 *
 * A previous worker cached responses whose transport headers (content-encoding
 * gzip/br) no longer described their already-decoded bodies. WebKit honours
 * those headers, fails to decode, and the navigation dies with no console
 * error. That state is SELF-SUSTAINING: the broken worker keeps serving the
 * broken response, so the page never runs long enough to pick up a fix, and a
 * VERSION bump alone cannot rescue a client that is already stuck.
 *
 * This worker exists only to undo that. It claims control, deletes every
 * cache, unregisters itself, and reloads open windows back onto the network.
 * It deliberately has NO fetch handler, so it never intercepts anything.
 *
 * Offline support is off until this has rolled through the fleet. Restore the
 * real worker from _shared/sw-template.js (kept intact) only after the
 * recovery is confirmed on a real iPhone.
 */
const VERSION = '2026-08-17-recovery';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (err) {}
    try { await self.clients.claim(); } catch (err) {}
    try { await self.registration.unregister(); } catch (err) {}
    // Deliberately NO client.navigate() here. GGKit re-registers sw.js on
    // every load, so this worker installs, clears, unregisters and would then
    // navigate - which re-registers it - which navigates again. That is an
    // infinite reload loop. Clearing the poisoned state is enough; the next
    // ordinary load comes straight off the network.
  })());
});
