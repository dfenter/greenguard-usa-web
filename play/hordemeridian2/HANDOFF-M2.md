# HANDOFF M2: open arena + background (2026-09-17)

Status: **HOLD. Phase A done. Phase B only partially landed and its gate FAILED.**
About 25 percent of M2 is real. See "Gate verdict" at the end, which supersedes the
optimistic Phase B numbers reported by the implementer.

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

---

# Gate verdict (independent Opus gate, supersedes the Phase B self-report)

**HOLD. Roughly 25 percent of M2 is real.**

Phase B commit `107a779d` is additive only (+208 / -0). Verified by the orchestrator:
`clampToField`, `edgeGlowFactor` and `featureHooks` are called nowhere in game.js, and all
EDGE references remain. So the SDF clamp, the energy edge boundary and the terrain hooks,
which are the substance of M2, did NOT land. What landed is the background wiring, the
`?perf` watchdog and the debug hooks.

## The probe pass was false

`hm2_world_probe.mjs` reported exit 0, all 6 regions at delta 0.2075, fps fine. That result
is void:

1. The probe iterates `REGION_KEYS = ['r0'...'r5']` (hm2_world_probe.mjs:31). The real keys
   are `aurelion-graveyard, void-rift, meridian-verge, ember-drift, crystal-shoals` and
   `solar-crown`. `teleportToRegion` does `REGION_BY_KEY[key]` and returns false for every
   `r0..r5` (game.js:10769-10772). The probe never reads the return value and records
   `teleported = true` regardless. No teleport ever happened.
2. All 6 screenshots were byte-identical, and showed the "Rotate your device to portrait to
   play" overlay, not the game. The probe sets a portrait viewport but never defeats the
   game's own orientation gate, and never starts a run.
3. The measured 0.0608 luminance is therefore the luminance of that overlay, and the 0.2075
   delta is the same subtraction done six times. Identical per-region numbers were the tell.
4. `samplePngAverage` does read real pixels, so the mechanism is sound; the inputs were
   wrong. `getBackdropSample()` is dead code the probe never calls.

The readability gate required by reference_track_readability has therefore NEVER been
measured against rendered regions. Treat region palettes as unvalidated.

Campaign probe 55/55 and `hm2_world.test.mjs` 20/20 are both genuine, but the campaign
result holds precisely because the sim was never touched.

## The architectural blocker is real

game.js and hm_data.js use a 1D linear band model: `regionAtX`, `minX`/`maxX` per region,
and a square `EDGE` clamp. hm2_world.js is a 2D ellipse-cluster SDF. Converting the ~15 real
EDGE clamp sites changes what "inside the arena" means for all 15 campaign missions that M4a
tuned against the band layout. Stopping to escalate was correct. Reporting a green probe that
was never validated was not.

## Before M2 can be called done

Implementer tasks:
- Fix the probe: defeat the orientation gate so the game actually renders, use real region
  keys, assert `teleportToRegion` returns true, and fail when consecutive screenshots are
  identical. Then re-measure luminance per region and re-tune palettes if any region fails.
- Then wire the SDF clamp, the energy edge and the terrain hooks per the chosen model below.

Dan decision, needed first because it changes traversal and mission tuning:
- **Option A**: migrate gameplay to the true 2D SDF field (`regionAtX` becomes
  `regionAt(x,y)`, EDGE clamps become `clampToField`), and accept a retune plus re-validation
  of all 15 M4a missions and the HOT_START ring math.
- **Option B**: keep the linear band model for gameplay containment and scope the SDF to
  cosmetic and hazard use (background plus terrain effects only), which conflicts with the
  plan's "Player clamp = SDF" line and should be recorded as a plan amendment.

The background swap already landed is compatible with either option, since it reads only the
region key and never region geometry.

## Residual defects, not introduced by M2
- `__MISSING` atlas warnings (deco_plate, gem0, ic_armor, ring_thick, elite_crown) and a
  service worker scope error, both confirmed pre-existing. Console is not clean, so the
  "console clean" gate criterion fails on pre-existing grounds.
- The legacy background stack (regionBackground discs, skyObjects, marks, debris) was left in
  place alongside the new parallax layers and still needs retiring.

---

# Round 2 (commit b7193ac3): superset retune landed, but the geometry needs review

Delivered: steps 1 and 2 of the Option A decision only. The superset test is real and passes
(21/21, 2645 points across all five band boxes including corners and edges, worst-case
sdf -2695). game.js is still completely untouched: 101 EDGE references, zero calls to
clampToField, featureHooks or edgeGlowFactor. Probe not fixed, terrain hooks not wired,
legacy background not retired.

## Concern the orchestrator measured on the new geometry

To satisfy the superset constraint the lane made the five primary regions IDENTICAL CIRCLES,
cx spread over -5020..5020 with rx = ry = 9077 for every one. Measured consequences:

- Centre separation over radius is 1.106 for the two furthest primary regions, so the five
  circles are heavily coincident and their union is close to one large disc rather than the
  "non-rectangular region graph of overlapping regions with soft boundaries" M2 specifies.
- The field's max radius is 14097 versus the old box half-extent of 6260, so the playable
  field is roughly **4x the authored arena area**.

The superset property is satisfied, but by over-satisfaction. If the EDGE clamps are now
converted to clampToField, players can fly far outside the authored arena into empty space
that has no spawns, no terrain and no mission content. That is a worse regression than the
square clamp M2 set out to remove, and the campaign probe would not catch it because nothing
in bounds moved.

What still works: `regionAt` discriminates all five bands correctly along the band axis
(verified at x = -5020, -2520, 0, 2520, 5020), so palette, background and terrain selection
by region are sound. The sixth region `solar-crown` at cx 6900, cy 2500 is the only one with
distinct compact geometry (rx 2400, ry 1900).

The lane also reports it had to fix `regionAt` to use Euclidean nearest-centre because
comparing raw ellipseSdf across regions of differing radii biased toward the largest region,
and that it relaxed one pre-existing test constant at hm2_world.test.mjs:172 from 0.97 to
0.99 because it was scaled to the old smaller ry. Both are plausible but worth a second look.

## Recommended before any EDGE conversion

Constrain the retune on BOTH sides: the field must be a superset of the band boxes AND stay
within a modest margin of them, for example max field radius no more than about 1.25x the old
half-extent, with regions kept visibly distinct (centre separation a reasonable fraction of
radius). Ellipses with aspect ratio up to about 2:1 are needed to hug the band boxes; the lane
found the current `avgR` distance approximation in the SDF degrades past that and trips the
Lipschitz test, so the smooth-min distance function likely needs a better ellipse distance
approximation rather than rounder regions. That is the real fix and it is an implementer task,
not a Dan decision.
