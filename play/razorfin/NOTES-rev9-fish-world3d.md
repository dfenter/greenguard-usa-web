# Rev 9 fish lane — world3d.js / engine3d.js patch notes (NOT applied here)

This lane owns `fish3d.js` only and may not edit `world3d.js` or
`engine3d.js`. It does not need to today: `RF.Art3D.buildFish(def)` kept
its exact synchronous signature and `{geometry, palette}` return shape, so
`world3d.js`'s existing `buildFishSources()` (world3d.js:1207) and
`fishBuildSource()` (world3d.js:1029) consumers work unchanged against Rev
9 fish3d.js — confirmed by `node --import ./tools/reg.mjs tools/selftest.mjs
fish world`, both passing with zero world3d.js edits.

## Why a future patch may still want this

Before `RF.Art3D.preloadFish()` resolves, `buildFish()` serves the
placeholder (Rev 6-8 procedural loft geometry) for every asset-backed
species — see `NOTES-rev9-fish.md` "preloadFish() / synchronous
buildFish()". That means the very first frame(s) after
`world3d.js:6714 buildFishSources()` runs (called from `World.init`, before
any GLB has had a chance to fetch/parse) will show the old procedural
lofts for minnow/reeffish/mackerel/etc., then silently upgrade to the real
GLB-asset shapes on whatever later frame first calls `buildFish(def)`
again for that id (world3d.js never re-calls `buildFish` after the initial
`buildFishSources()` pass today, so in practice the placeholder would
stick for the whole run until the next zone/level reload calls
`buildFishSources()` again).

This mirrors the Rev 9.2 shark rig contract exactly ("engine boot awaits
[preload] before showMenu") — sharks got the await, fish did not (fish3d.js
was not asked to be async-required, only async-capable). If a future lane
wants the fish roster to render its real GLB shapes from frame one instead
of upgrading mid-run, the fix is a two-line addition in `engine3d.js`'s
`boot()` (engine3d.js:3425-3486): await `RF.Art3D.preloadFish()` (if
present) before the first `uiCall('showMenu')`, same guard style the
Rev 9.2 shark preload note would use for `RF.Art3D.preload()`.

## Exact snippet (engine3d.js boot(), NOT applied by this lane)

```js
function boot() {
  var g = ggkit();
  if (!g || !g.create) {
    if (root.console && console.error) console.error('[Razorfin] GGKit missing; cannot boot');
    return null;
  }
  kit = g.create({ /* ...unchanged... */ });

  // Rev 9 fish lane: RF.Art3D.buildFish() is synchronous and always
  // returns usable geometry (falls back to the Rev 6-8 procedural loft as
  // a placeholder for asset-backed species until their GLB base has been
  // parsed), so this await is OPTIONAL -- boot works today without it.
  // Add it only if the fish roster must render real GLB shapes on the
  // very first frame instead of upgrading mid-run once buildFishSources()
  // is called again (e.g. on a zone change).
  var fishPreload = (RF.Art3D && typeof RF.Art3D.preloadFish === 'function')
    ? RF.Art3D.preloadFish() : Promise.resolve();
  fishPreload.then(function () {
    // First screen: the 2D build's Phaser Menu scene auto-started here; the
    // DOM menu must be shown explicitly or the boot lands on empty water.
    uiCall('showMenu');

    lastNow = 0;
    if (root.requestAnimationFrame) rafId = root.requestAnimationFrame(frame);
  });

  return { renderer: renderer, scene: scene3, camera: camera };
}
```

Note `boot()` currently returns `{renderer, scene, camera}` synchronously
for callers that inspect the return value immediately (e.g. selftest
probes) -- deferring `showMenu`/`requestAnimationFrame` behind the
`.then()` keeps that return shape intact, at the cost of `showMenu` no
longer being synchronous with `boot()` returning. Any selftest/probe code
in engine3d.js's own `__selftest()` that currently assumes `showMenu` ran
synchronously inside `boot()` would need re-checking before this is
applied -- out of scope for the fish lane to verify, called out here so
whichever lane picks this up knows to check `engine3d.js`'s own selftest
around `boot()`/`showMenu` ordering first.

If GLTFLoader-based shark preload (SPEC3D 9.2) lands in the same boot
sequence later, the two preloads should be combined
(`Promise.all([RF.Art3D.preload(), RF.Art3D.preloadFish()])`) rather than
chained, so neither blocks the other's fetch.
