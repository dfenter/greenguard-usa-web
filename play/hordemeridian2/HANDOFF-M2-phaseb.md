# HANDOFF M2 Phase B (partial): background swap + debug hooks landed; SDF gameplay clamp deferred

## Landed this pass

- index.html: added `hm2_world.js` and `hm2_background.js` script tags before
  the dynamic `game.js` loader script block.
- game.js `PlayScene.create`: additively creates `HM2_BACKGROUND.create(this, HM2_WORLD)`
  guarded in try/catch, stored as `this.hm2Background`. The legacy `regionBackground`
  discs / skyObjects / marks / debris stack was NOT removed (see finding below on why).
- game.js `updateRegionPresentation`: calls `this.hm2Background.update({x:cmx,y:cmy}, dt)`
  every frame the region presentation refreshes (dt falls back to 1/60, cosmetic only).
- game.js `enterRegion`: calls `this.hm2Background.setRegion(region.key)` on region change,
  using the SAME key strings hm_data.js already uses (aurelion-graveyard, void-rift,
  meridian-verge, ember-drift, crystal-shoals) — no remapping needed, confirmed working
  in the probe.
- Debug hooks added at the bottom of game.js, `window.__HORDE.debug`:
  `teleportToRegion(key)`, `getEnemyTints()`, `getProjectileTints()`, `getBackdropSample()`.
  `getBackdropSample()` is a region-palette-based approximation (not a live canvas
  readback) since a true pixel snapshot round trip is already done probe-side.
- `window.__HM_DEBUG_STATE = HM_DEBUG_STATE` exposed globally so the probe's
  `window.__HM_DEBUG_STATE.watchdog` path resolves (was previously only reachable via
  `Game.debugState`, itself only set on the scene instance, not globally).
- `?perf` query param now starts a 2s-interval console log of `watchdog.maxStepMs` /
  `lastBeatAgoMs`, gated behind `window.__HM_PERF_WATCHDOG`.

## Probe results (measured, not dry-run)

`node hm2_world_probe.mjs 8791 <outdir>` — **exit 0**, `summary: "PASS: all checked
regions and metrics within gate."` `missingHooks: []`. All 6 regions (r0..r5, teleported
via `teleportToRegion`) report `luminance 0.0608`, `delta 0.2075`, `pass: true` — the
>= 0.18 gate clears with margin. fps: `maxStepMs 3.1ms`, `lastBeatAgoMs 115ms` — nowhere
near the floor-50-fps failure threshold. Console was NOT fully clean: pre-existing
`__MISSING deco_plate` / `__MISSING gem0` / `__MISSING ic_armor` / `__MISSING ring_thick`
/ `__MISSING elite_crown` texture-atlas warnings and a service-worker scope error fire
regardless of this session's changes (present before hm2_background/world were wired in;
not something this pass introduced). The probe's own summary/exit code treat these as
non-fatal; flagging them as a residual since the spec calls for "console clean."

Campaign regression: `node hm2_campaign_probe.mjs http://127.0.0.1:8791/play/hordemeridian2/ /tmp/shots 3`
— **55/55 assertions passed**, no regression. Bot medians: L1 150s, L5 92s, L10 55s,
L15 156s — in line with the HM4a numbers, confirming the additive background/debug
wiring did not touch sim/gameplay.

## NOT done — the big one: architecture mismatch, read this before touching EDGE sites

The task brief assumed the arena is the ellipse-cluster SDF world (`HM2_WORLD.sdf`,
`clampToField`, 6 elliptical regions). It is not, in the current game.js/hm_data.js.

`game.js` and `hm_data.js` implement a **1D linear band layout**: `REGIONS` each carry
`minX`/`maxX`, `regionAtX(x)` looks up the owning region purely from the player's X
coordinate, and `EDGE` (`WORLD/2 - 40`) is a **square** clamp, not a field boundary.
Every one of the ~100 `EDGE` call sites in game.js (player spawn/clamp at 3153, enemy
spawn rings at 3212/3243/3874/4219/4234/4873-5038, world-extent uses at 1656/1671/1687-
1717/2751) is written against this linear-band geometry: `clamp(x, -EDGE+n, EDGE-n)`,
ring sampling around the player position, boundary rectangles drawn from `-EDGE` to
`EDGE` on both axes, and `regionWalls` drawing VERTICAL band dividers at each region's
`maxX`.

`HM2_WORLD`'s SDF is a totally different mental model: 6 elliptical blobs unioned via
smooth-min, `regionAt(x,y)` does a 2D nearest-ellipse lookup, `clampToField(x,y,r)`
projects onto the union boundary. Swapping `EDGE`-based clamps for `clampToField` at
the ~15 real call sites is mechanical in isolation, but it silently changes what
"inside the arena" means for every one of the 15 campaign missions, all of which were
tuned (per HANDOFF-M4a) against the current linear layout's `regionAtX`/`minX`/`maxX`
geometry and against `HOT_START` ring sampling that assumes the player can freely
move away from a region boundary along Y with no field falloff. There is no
reconciliation step in Phase A's contract that maps a linear `minX..maxX` band onto a
2D ellipse; that mapping needs to be designed, not assumed, before any EDGE site is
touched.

**Recommendation for the next session:** do not attempt the wholesale
EDGE-to-clampToField replacement as a single pass. First decide (with Dan, since this
changes traversal): does the game convert to a true 2D SDF field (region centers become
`cx,cy`, `regionAtX` becomes `regionAt(x,y)`, and all 15 levels' region assignments and
HOT_START ring math get re-validated against ellipse boundaries), or does the SDF stay
purely cosmetic/hazard-only (terrain hooks + background) while gameplay containment
keeps the existing linear EDGE model? The background swap done in this pass is
compatible with EITHER answer since it never reads region geometry, only the region
key. Terrain hooks (asteroid_field, gravity_well, nebula, derelict_hulk, solar_flare)
are similarly safe to wire against `regionAt`/`sdf` for COSMETIC/visibility purposes
(nebula hide radius, glow) without deciding the clamp question, but hazard *collision*
figures (gravity pull magnitude, block radius) do assume real 2D positions relative to
the SDF, which is exactly the geometry the game does not currently use to place enemies.

## EDGE sites reviewed, left untouched, and why

All ~100 sites in game.js: reviewed via `grep -n EDGE game.js`. None were changed.
They fall into three groups, none of which is safe to touch without the architecture
decision above:
- **Square clamp on player/enemy/decoy/cluster positions** (3153, 3212-3244, 3874-3875,
  4219-4235, 4873-5038): these keep entities inside `[-EDGE, EDGE]` on both axes. Left
  as-is; this is the actual gameplay containment and changing it changes traversal for
  all 15 missions.
- **World-extent scalars for parallax/star field placement** (1656, 1659, 1671, 1674,
  2751): `EDGE * 1.5`/`EDGE * 2.1` used purely to size star/debris scatter fields, no
  gameplay effect. Left in place since the legacy sky/star machinery was kept (not
  deleted, see below) and still reads these.
- **Boundary/regionWalls visuals** (1687-1717): the rectangle boundary graphic and the
  vertical band dividers. NOT replaced with an SDF edge-glow draw as the spec asked,
  because doing so without the architecture decision would draw a glow that lies about
  where the real (still-square) clamp is. Left in place rather than deleting with
  nothing correct to put in its place.

## Terrain hooks — not wired

`featureHooks` (asteroid_field/gravity_well/nebula/derelict_hulk/solar_flare) from
hm2_world.js are NOT yet called from the enemy or projectile update loops. Same
blocker: hooks operate on 2D SDF-relative positions and the enemy/projectile pools
currently only carry positions meaningful in the linear-band model. Wiring the
COSMETIC half (nebula hide, glow) is low-risk and can be done next without resolving
the clamp question, by calling `HM2_WORLD.regionAt(x,y)`/`sdf(x,y)` read-only against
existing enemy x/y (they are real world coordinates regardless of clamp shape) and
using the result only for rendering (tint/alpha), never to reposition or collide.

## Files touched this pass

- `/Users/lucille/greenguard-usa-web/play/hordemeridian2/index.html`
- `/Users/lucille/greenguard-usa-web/play/hordemeridian2/game.js`

`hm2_weapons.js` was never opened or staged.

## Next session should

1. Get the architecture decision (linear-band clamp stays vs. real 2D SDF clamp)
   before touching any EDGE site.
2. If cosmetic-only: wire nebula/solar_flare visibility + glow hooks read-only off
   existing x/y, leave collision/pull hooks for later, replace the boundary+regionWalls
   graphics with something that matches whichever clamp shape was decided on.
3. Investigate the residual missing-texture console warnings (`deco_plate`, `gem0`,
   `ic_armor`, `ring_thick`, `elite_crown`) — pre-existing, not introduced here, but
   blocking a true "console clean" pass of hm2_world_probe.mjs.
