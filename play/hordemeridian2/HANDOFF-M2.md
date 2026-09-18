# HANDOFF M2: open arena + background (2026-09-17)

Status: **Phase A DONE and committed. Phase B NOT STARTED, blocked on the lane gate.**

## Phase A (done)

Commits on branch `calendar-dnd`, not pushed:
- `282171be` HM2 M2: hm2_world.js SDF arena + terrain hooks with node test
- `caf61e1a` HM2 M2: hm2_background.js 4-layer parallax + hm2_world_probe.mjs

Only these four new files were created. No existing file was touched.

### hm2_world.js
UMD module, `window.HM2_WORLD` plus `module.exports`, no Phaser globals at load.

```
WORLD: 12600
EDGE_BAND: 340
REGIONS: 6 x {key, name, cx, cy, rx, ry, tint, palette:{deep, nebula, mid, dust}}
sdf(x, y) -> number
clampToField(x, y, r) -> {x, y, clamped}
edgeGlowFactor(x, y) -> number [0,1]
regionAt(x, y) -> region key
FEATURES_BY_REGION: { [regionKey]: Array<{type, region, ...params}> }  // 5 per region
featureHooks(type) -> {spawn, collide, projectile, visibility} | null
```

Region keys: `aurelion-graveyard, void-rift, meridian-verge, ember-drift, crystal-shoals, solar-crown`
(the sixth is new). Terrain types: `asteroid_field, gravity_well, nebula, derelict_hulk, solar_flare`.

Union of 6 overlapping ellipses via polynomial smooth-min, `SMIN_K = 420`. `clampToField` walks the
numeric gradient up to 24 iterations with a degenerate-gradient fallback toward the nearest region
centre; always finite. All four terrain hooks are pure functions taking a single `ctx` object and use
`ctx.rand`, never `Math.random`.

### hm2_world.test.mjs
`node play/hordemeridian2/hm2_world.test.mjs` -> 20 cases, 0 failures, exit 0. Re-verified by the
orchestrator after its own two Sonnet implementer lanes (world, background) committed. M4a and M1 had NOT committed at that point and no HANDOFF-M4a.md or HANDOFF-M1.md existed. Covers SDF continuity and finiteness, union connectivity,
clampToField never leaving the field over 5000 random points including far-outside inputs,
edgeGlowFactor range, and finite returns from every terrain hook in every region.

Note from the implementer: sampling the boundary along the axis toward an overlapping neighbour gives
a much more negative SDF because smooth-min pulls it in, so the edge-glow test samples perpendicular
to the region chain. That is expected smooth-min behaviour, not a bug.

### hm2_background.js
`window.HM2_BACKGROUND.create(scene, worldApi) -> {layers, update(cam, dt), setRegion(id), destroy()}`.
Four procedurally generated parallax layers (Phaser graphics -> generateTexture, cached by key, no new
binary assets):

| layer | depth | scrollFactor |
| --- | --- | --- |
| deep galaxy | -140 | 0.05 |
| additive nebula | -130 | 0.18 |
| mid asteroid silhouettes | -120 | 0.45 |
| near dust | -110 | 0.80 |

All four sit below game.js's existing background floor of -100, so they do not collide with its
-99/-98/-97/-94 usage. Bloom is applied only to the additive nebula layer via `postFX.addBloom` when
WebGL and FX are available, wrapped in try/catch, silent no-op on CANVAS. `setRegion(id)` cross-fades
tints over 0.6s from `worldApi.REGIONS[i].palette`.

Palette luminance as computed by the implementer: galaxy ~0.14, nebula peak ~0.22, asteroid ~0.05,
dust ~0.10, against enemy/projectile tints at ~0.72 and above, so the readability delta is roughly 0.5
versus the 0.18 floor from reference_track_readability. This is a static palette calculation, NOT a
measured screenshot gate. The real measured gate is the probe's job in Phase B and has not run.

### hm2_world_probe.mjs
`node hm2_world_probe.mjs [port] [outdir]`, 390x844 at deviceScaleFactor 2, loads with `?perf`. Per
region: teleport, screenshot `region_<key>.png`, sample backdrop luminance by in-page canvas readback,
compare against enemy and projectile tints for delta >= 0.18, read the fps watchdog against the floor
of 50, capture console, write `report.json`, exit 1 on failure.

Ran end to end against `python3 -m http.server 8791` and correctly printed **PHASE A DRY RUN** with all
checks SKIPPED and exit 0, because the integration hooks do not exist yet. The server was killed after
the run. No screenshots and no luminance or fps numbers exist yet.

## Phase B (not started)

Blocked. The hard rule requires all of the following, and none were met after roughly 40 minutes of
foreground blocking waits:

- `play/hordemeridian2/HANDOFF-M4a.md` exists: **no**
- `play/hordemeridian2/HANDOFF-M1.md` exists: **no**
- `play/hordemeridian2/.m2_phase_b_go` exists: **no** (added mid-lane by the coordinator; another
  session deploys the M4a/M1 state first and creates this file when the deploy hash arrives)
- `game.js`, `index.html`, `hm_data.js` clean: **no**, all three still show as modified by the
  concurrent M1 and M4a lanes

Remaining Phase B work, unchanged from the brief:
1. Wait for all four conditions, then read HANDOFF-M4a.md and HANDOFF-M1.md before editing anything.
2. Replace the radial EDGE clamp with the SDF clamp. `EDGE` is defined at `game.js:26` and read at
   roughly lines 1590, 1656, 1671, 1684-1714, 2740, 3139, 3198-3230, 3850-3851, 4195-4211, 4800. The
   boundary and regionWalls graphics at 1684-1714 draw a rectangle and vertical band walls and need to
   become an SDF edge glow driven by `edgeGlowFactor`.
3. Swap the background builder. Current one is the ground tileSprite, `buildSkyTextures`, the three
   `regionBackground` parallax discs and the landmark pool at roughly `game.js:1505-1610`.
4. Wire the terrain hooks into the enemy and projectile update paths.
5. Add the `?perf` fps watchdog readout.
6. Add the debug hooks the probe needs, none of which exist today:
   - `window.__HORDE.debug.teleportToRegion(key)`
   - `window.__HORDE.debug.getEnemyTints()`
   - `window.__HORDE.debug.getProjectileTints()`
   - fps watchdog at `window.__HM_DEBUG_STATE.watchdog` or `window.__HORDE.game.debugState.watchdog`
7. Run hm2_world_probe.mjs for real, then spawn a separate Opus LOW gate agent for a RELEASE verdict at
   390x844: per-region screenshots, measured luminance gate, fps floor 50, console clean, no em dashes
   in user-facing strings. Fix and commit.

## Residuals and cautions

- The six region keys in hm2_world.js do not match the five region keys in `hm_data.js` REGIONS. The
  integration must map old to new, and M4a's rewritten `levels/*.js` may reference region keys, so read
  HANDOFF-M4a.md before deciding the mapping.
- hm_data.js REGIONS are horizontal bands with minX/maxX. hm2_world.js regions are ellipses with
  cx/cy/rx/ry. Anything computing a region from x alone, such as `game.js:1589` and the regionWalls
  code, has to move to `regionAt(x, y)`.
- No em dashes in any of the four new files, verified by grep.
- No Co-Authored-By trailers on either commit.
- Nothing deployed and nothing pushed by this lane.
- The tree carries unrelated dirty razorfin and redesign files. Never `git add -A`.
