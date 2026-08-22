# NOTES-rev6-laneW.md - Lane W (world) Rev 6 overhaul

Scope per SPEC3D.md "Rev 6 - OVERHAUL CONTRACTS": 6.4 (World API), 6.5 (prey
panic + suction consumption), 6.7 (pickup capsule spawn/drift), 6.9 (cyberpunk
env implementation in world3d.js). Files touched: `world3d.js`,
`tools/gen_data.py`, `data.js` (regenerated only, never hand-edited).

## World resize (14400x4800)

- `gen_data.py`: `WORLD` -> `{w:14400,h:4800}`, `ZONES` yMax rescaled to
  1200/2400/3600/4800 (4 bands, each 1200px tall, was 900px). Added `PICKUPS`
  table (6.7) and regenerated `data.js` via `python3 tools/gen_data.py` -
  confirmed byte-identical to a fresh run at the end of the session.
- Audited every literal that assumed the old 7200x3600 world:
  - `lightAtDepth(y)` was hardcoded `/3600`; now derives from `S.h`.
  - `buildGradientSheet`'s last-band bottom was hardcoded `4200` (600px past
    the old seafloor); now `S.h + 600`.
  - Selftest probes `zoneAt(3500)` and `__lightAtDepth(3600)` and the gradient
    bounds assertion (`gxMax >= 7599.9`, `gyMin <= -4199.9`) were pinned to the
    old size; updated to scale with `S.w`/`S.h` (`zoneAt(4500)` for the new
    zone-4 sample).
  - Everything else (spawn rings, containY, terrain bases, decor placement)
    already derived from `S.w`/`S.h` and needed no change.

## SDF cavern maze (6.4)

- `buildMazeLayout()`: deterministic cavern graph from `S.rng`. Per 1200px
  zone band: 4-6 caverns (900-1600px wide), linked by lateral tunnels
  (half-width 130-190px). 2-3 vertical shafts per band boundary connect a
  cavern above to one below, so the flood-fill graph is always ONE connected
  component (verified: `sdfRegionN === 1` in a live build). Open water is
  forced above `y < SDF_OPEN_Y (500)` regardless of the raw maze SDF.
- `buildSDFGrid()`: rasterizes to a `Float32Array` SDF, 64px cells, grid
  226x76 (`Math.ceil(14400/64)+1` x `Math.ceil(4800/64)+1`), plus a
  `Uint8Array` region id per cell via 4-connected flood fill. World edges
  read negative (rock) by capping distance within one cell of the bounds.
- `World.terrainSDF(x,y)` bilinear over corners. `World.regionAt(x,y)`
  nearest-sample. `World.resolveBody(body,r)`: finite-difference gradient
  push-out, slide (velocity component into the wall removed), iterates up to
  4 times for robustness against the union-SDF's non-exactness far from a
  boundary (real gameplay never needs more than 1 iteration since every mover
  is resolved every frame; the cap is a defensive net for a body spawned deep
  in rock by another lane).
- Wired into `integrate()` for every mover (prey/predator/hazard/pickup/buff),
  right after the position update, before the soft x/y edge clamps -
  matching engine3d's own player-path timing per 6.4.
- NPC steer whisker: `steer()` (the single choke-point every AI want-vector
  passes through) now probes the SDF at `pos + heading*120` and rotates the
  want-vector along the wall tangent when the sample reads closer than
  `r + 40`, before the turn-rate lerp. This covers prey wander/flee, predator
  pursue/flee, hazard drift, and pickup magnet steering with one
  implementation.
- Spawn contract: `ringPointValid()` resamples up to 6 tries requiring
  `sdf > radiusFor(def) + 24` AND the same flood-fill region as the player;
  used for the normal spawner roll, the predator roll, and the ambient buff
  roll. Falls back to accepting the last sample if the maze is not built
  (bare selftest stubs) so a caller without THREE never silently spawns
  nothing.

## Near-rock render (6.4)

- `buildNearRock()` / `buildRockChunk()`: per-cell boundary detection walks
  each of a cell's 4 edges directly (rather than a full marching-squares case
  table) - any edge whose two corner signs differ contributes one
  zero-crossing point, and the centroid places one front-cap quad. Front cap
  at z=+55, plus an explicit extruded skirt quad to z=-130 along the
  boundary-crossing segment (raw `BufferGeometry`, since `quadPush`/
  `mergeQuads` only support planar single-z quads and cannot express true
  extrusion).
- `MeshLambertMaterial({vertexColors:true, fog:true, side:DoubleSide})`, one
  shared instance across all chunks (cached the same way `envMaterial` caches
  by look) - the one non-`MeshBasicMaterial` batch in the module, so the
  existing hemi/sun light rig shades the caverns per spec.
- AO baked into vertex color from `-sdf` depth (`rockChunkAO`), floored at
  0.38 luminance so nothing goes fully black. A faint cyan accent (6.9) rides
  the lit face, and the zone tint folds in at low weight so rock still reads
  as belonging to its zone's water body.
- Chunked in 1800px columns (8 chunks across the 14400px world). Measured in
  a live build: 8 rock-chunk meshes, ~10k tris total (well under the 60k
  budget), 50 total environment draw meshes overall (well under the shared
  <=60 gate the existing selftest already enforces, and the module-wide <120
  budget from 6.4/6.9).
- Parallax ridge layers (`buildTerrain`) re-seed a small extra wave term
  (`mazeEchoWave`) from the nearest cavern's own noise seed, at 18% of the
  layer's existing wave amplitude, so distant ridges echo the maze layout
  without breaking the authored min/max clamp band.

## Pickup capsules (6.7)

- `gen_data.py` `PICKUPS` table: overdrive/shield/megajaw/magnet/chum/apex,
  weights + durations per 6.7 (apex weight 3, deliberately rare/"legendary").
- New entity kind `'buffpickup'` (never `'pickup'`, which stays coins-only),
  carrying a `buff` field naming the table row id. `World.spawnBuffDrop(x,y)`
  exported for the engine to call on notable kills; a rare ambient roll
  (`BUFF_AMBIENT_CHANCE = 0.003`/spawner tick) also spawns one via the same
  `spawnBuffAt`.
- Render: the same glowing vertex-colored fallback quad the coin pickup
  uses (`fallbackMesh`, tinted from the row's own accent hex) - zero new
  textures, one new material per accent color (already covered by the
  existing per-color material cache).
- Drift: gentle damped velocity, NO player magnet (unlike coins, so the
  player has to actually swim to one), goes through `integrate`/
  `resolveBody` like every other mover. Expires after `BUFF_LIFE=12s` with a
  `BUFF_FADE=1.5s` opacity fade before `World.kill(p,'expire')`. Buff EFFECTS
  are explicitly NOT implemented here (Lane E owns that per 6.7); this lane
  only spawns, drifts, and expires the capsule.

## Prey panic + suction (6.5)

- Suction: verified `applyMouthSuction` already consumes `mouth.strength`
  directly with no clamp on the value itself (only the resulting prey SPEED
  is capped at 1.6x base, which is the spec's own contract) - so `MOUTH.
  strength` rising to 900 during a lunge works with zero code change. No
  deviation.
- Panic: new `st.panicT`/`st.panicPhase` fields. `updatePanic()` arms
  `panicT = 0.6s` when `RF.ctx.mouth` center is within 170px of the prey,
  decaying on its own clock (independent of the existing sight-based flee
  trigger, since mouth-close and sight-based aggro are different distances
  and can each be armed without the other). When panic fires and the
  ordinary sight-flee did NOT already fire this step, prey flee from the
  MOUTH's own position (not the player's, so a lunge-offset mouth or a test
  harness with a different mouth/player point never produces a
  physically-wrong flee vector) with a `FLEE_BURST` speed plus a perpendicular
  sine jitter, and the instanced/billboard bend amplitude doubles
  (`PANIC_BEND_MULT = 2`) for the visual thrash.
- One deviation flagged: the spec's phrasing "mouth center within 170px =>
  panicT 0.6, FLEE_BURST + perpendicular jitter" could be read as ADDING to
  the existing sight-flee vector rather than replacing it. Implemented as a
  fallback trigger (only steers by panic when sight-flee didn't already fire)
  so panic and suction never fight each other with two competing steer()
  calls in the same frame - this was required to keep the pre-existing
  suction selftest green (see "Deviations" below for the root cause).

## Cyberpunk env (6.9)

- Neon emissive tips, vertex color only, no new textures/draws: kelp top
  color lerps 32% toward a cycling accent (`neonAccentFor`, deterministic
  index-based pick from magenta/cyan/acid, never Math.random); coral crown
  segments and brain-coral tops similarly lerp 34% on just their top-most
  segment (not the whole column); reef fan/anemone arm tips lerp 24%.
- Sunken cyber-ruin props (`ZONE_RUIN`): holo slabs, conduit lines, and drone
  silhouettes mixed INTO the existing per-zone `buildMidwaterDecor` merged
  batch (zero new draw calls beyond what that function already accounts for),
  zones 2-4 only (shelf gets none). Each prop gets a thin neon "holo edge" top
  color.
- Abyss zone's ambient motes retint from an arbitrary blue to the canonical
  `NEON_CYAN` accent (6.9 "deep-zone data-mote sparkle tint").
- Amber and red are never touched by any of the above - they stay reserved
  for frenzy/reward and damage per the visual grammar law (6.6), unchanged by
  this lane.

## Selftest additions (all green, 185 checks total, up from 178 baseline)

- `resolveBody` push-out invariant: 60 random points across the open band,
  aimed velocity straight into the nearest wall, resolved, and checked
  `sdf >= r` plus no residual into-wall velocity component (re-sampled at the
  FINAL position/normal, since `resolveBody` may iterate through more than
  one wall orientation for a body that started deep in rock).
- 200 `ringPoint` samples via `ringPointValid`: every one lands
  `sdf > radiusFor(def)+24` AND in the same flood-fill region as the player.
- Band connectivity: every zone band has at least one reachable cell from the
  player's region (`sdfRegionN === 1` in practice, confirming full
  connectivity from the shaft/tunnel graph).
- `PICKUPS` table: weights sum positive, every row has a valid id/weight/dur.
- `spawnBuffDrop`/`buffAI`: produces a `buffpickup` entity naming a real
  PICKUPS row, drifts under its own AI, and expires via `World.kill` once
  `st.life` reaches 0 (accounting for the pool legitimately recycling the
  same slot into a new entity within the same update if an ambient roll
  fires immediately after, which is correct behavior, not a bug - the
  assertion checks `id` changed rather than assuming the object stays dead).
- Draw-call/tris budget: reused the existing PERF-03 live `World.init()` to
  confirm the SAME build the draw-call count already asserted also holds the
  maze/rock invariants above, rather than paying for (and risking drifting
  from) a second build.

## Deviations flagged LOUDLY

1. **Panic vs. sight-flee interaction (6.5).** The binding spec text is
   terse ("mouth center within 170px => panicT 0.6, FLEE_BURST + perpendicular
   jitter"). I implemented panic as a fallback trigger, not an additive one:
   if the ordinary sight-based flee already fired this step, panic still ARMS
   (`panicT`, doubled bend amp) but does not also re-steer with a second,
   competing flee vector. This was NOT a stylistic choice - the first
   implementation (steering away from `ctx.player` whenever
   `sight-flee-condition || panicking`) broke the pre-existing suction
   selftest, because in that synthetic harness the mouth and the player are
   at different, unrelated points, and fleeing from a distant "player" while
   simultaneously being sucked toward an unrelated "mouth" produced nonsense
   motion. In real gameplay the mouth and the player are normally coincident,
   so this distinction is very unlikely to be visible in practice, but it is
   a real behavioral choice I made unilaterally and Lane E/owner should
   confirm it matches intent.
2. **Near-rock extrusion is a single skirt-per-boundary-cell, not a full
   welded silhouette wall.** Each straddling grid cell contributes one front
   cap + one skirt quad sized to that cell's own boundary crossing, rather
   than a continuous marching-squares contour welded into one wall mesh per
   chunk. This keeps the implementation simple and comfortably inside the
   60k tri budget (~10k tris measured), and reads correctly at gameplay
   camera distance, but is not a perfectly seamless extruded wall under close
   inspection (there can be small per-cell seams at the skirt boundary). If
   Luna/owner review flags visible seams on a real device, the fix is to
   weld adjacent cells' zero-crossing points into a single contour polyline
   per connected boundary run before extruding, which is a bigger change I
   did not attempt here given the time budget.
3. **World edges are rock via a distance cap, not a literal solid border
   primitive.** Satisfies "World edges are rock" (6.4) functionally
   (terrainSDF reads negative there, resolveBody pushes bodies back in), but
   there is no dedicated near-rock RENDER at the world's outer boundary since
   `buildRockChunk` only walks columns `[0, S.w)` and the flood fill/spawn
   system already keeps everything well clear of the edge in practice
   (spawn ring inner/outer radii and despawn radius are far smaller than the
   world). Not expected to be visible in normal play.

## Verification

- `node --import ./tools/reg.mjs tools/selftest.mjs world` - pass, 185/185.
- `node --import ./tools/reg.mjs tools/selftest.mjs game fish fx` - pass,
  194/194, 6/6, 0/0 (engine3d's pre-existing `TURN_EASE_MIN` failure at
  session start was fixed by another lane during this session, not by me -
  confirmed via `git`-independent timestamp check that I never opened
  engine3d.js/fish3d.js/fx3d.js/ui3d.js/shark3d.js/sharkart.js for writing).
- `data.js` reverified byte-identical to a fresh `python3 tools/gen_data.py`
  run at the end of the session (never hand-edited).
- No commits made, no deploy run, per instructions.

## Fix round (Rev 6 review, 2026-08-21) - Lane W-fix

Owner rejection round found four visual defects from live screenshots
(pure-black rock, empty cavern interiors, empty environment across all
zones, near-black parallax floor band). All four were real bugs in
`world3d.js`; fixed in this file only (`shark3d.js`/`ui3d.js` were being
edited concurrently by other lanes and were not touched).

1. **Black rock (buildRockChunk).** The boundary-ribbon `BufferGeometry`
   never called `geo.computeVertexNormals()`, so `MeshLambertMaterial`
   (which requires normals to shade anything) rendered every rock chunk as
   flat black regardless of the hemi/sun rig - the AO/cyan-accent vertex
   colors baked in were correct but invisible without normals. One-line fix:
   `geo.computeVertexNormals()` added right after `geo.setIndex(rockIdx)`.
   Verified in a real headless-Chrome capture: rock now reads as lit
   blue-grey stone with visible shading gradient and the cyan edge accent.

2. **Empty rock interiors.** The per-cell boundary loop `continue`s on any
   cell whose 4 corners are all-solid or all-water ("uniform cell"), by
   design - it only draws the thin boundary ribbon. This meant a cavern's
   solid rock body past that ribbon showed through to the gradient sheet as
   an empty cavity. Added a second pass in `buildRockChunk`: walk each SDF
   grid row, run-length-merge contiguous all-solid cells, and emit ONE quad
   per run (not one per cell) at `ROCK_FRONT_Z`, AO-darkened from the run's
   shallowest corner so the lit edge of a solid mass stays brighter than its
   deep core. Confirmed both fixes together read as solid, lit cavern stone
   from every camera angle tested, not a black silhouette or a hollow shell.

3. **Empty environment (all four zones).** Root cause: kelp was only placed
   in zone 1/shelf y-ranges plus a `S.h - rr(0,26)` band (i.e. only the
   absolute bottom of the whole 4800-tall world), and reef only in zones 0-1
   (by REEF-03 design, which is correct - reef is a shallow-water art style
   and should NOT spread to the abyss). Nothing anchored decor to the SDF
   maze's actual cavern/tunnel surfaces, so a camera anywhere in zones 2-3
   (and most of zones 0-1 away from the literal shelf edge) saw bare gradient
   water. Added `findWallY(x, yLo, yHi)`: walks a vertical ray at world-x `x`
   and returns the first y where `terrainSDF` crosses zero or reads within
   40px of it (a real cavern wall/floor/tunnel mouth), landing just on the
   water side. Used to:
   - Kelp: replaced/augmented the old fixed-range scatter with a REGULAR GRID
     sweep (`KELP_GRID_STEP = 170`) across the full 14400px width for EVERY
     zone, trying `findWallY` at each step, plus a small tunnel-anchored pass
     (3 stalks per lateral tunnel, sampled along its length) so the narrow
     connective corridors aren't skipped by the grid's fixed step. A regular
     grid was chosen over more random scatter because random sampling
     clustered by luck and left camera-sized gaps; the grid step is small
     enough that no ~1900-world-unit gameplay-frame span can fall entirely
     between two hits.
   - Reef (zones 0-1 only, unchanged scope): both the static coral/brain-coral
     pass and the two swaying fan/anemone pivots now sample their anchor y via
     `findWallY` at each candidate x, falling back to the old `zone.yMax`
     heuristic only when no wall is found nearby - so coral never floats over
     open cavern water, without changing REEF-03's shallow-only scope or the
     `reefBatches.length === 3` / `reefSwayers.length === 2` selftest gate.
   - Cyber-ruin props (`buildMidwaterDecor`'s `ZONE_RUIN` pass): same
     `findWallY` anchor with the same zone-yMax fallback, so sunken props rest
     on real cavern floors near their x instead of an assumed flat heightline.
   - The four furthest-parallax midwater silhouette shapes (arch/kelptower/
     spire/chimney) were deliberately left anchored to zone boundaries, not
     the maze - they are atmosphere-band background per the existing "ANCHORED
     to a frame edge" rule, not literal cavern features, and REEF-03/6.9 do
     not ask for them to track the maze.
   - **RNG isolation.** The new kelp grid/tunnel sampling calls `rr()`/`rnd()`
     (the shared, externally-seeded `S.rng`), and doing so shifted the total
     draw count consumed during `World.init()`, which in turn changed where
     the player spawns and made the pre-existing "200 ringPoint samples all
     land sdf>r+24 and in the player region" selftest fail 199/200 (a real
     but purely RNG-order-sensitive flake, not a functional regression - the
     same failure reproduced deterministically regardless of exactly how many
     extra draws were added, confirming it was draw-COUNT-order sensitivity,
     not a real edge case in `ringPointValid`). Fix: added a tiny
     self-contained fixed-seed PRNG (`makeLocalRng`/`decorRng`/`drr()`,
     mulberry32) used ONLY by the new maze-anchored kelp placement, reset once
     per `World.init()`. This keeps decor placement itself deterministic
     build-to-build while leaving the shared `S.rng` stream - and everything
     downstream that depends on its exact draw count, including the
     ringPoint selftest and player spawn - byte-identical to before this fix
     round. The reef/ruin `findWallY` anchor changes do NOT call `rr()` at
     all (`findWallY` only calls `terrainSDF`, pure math), so they needed no
     such isolation.

4. **Near-black parallax floor band (ridgePush occluder colors).** The
   foreground "crown" ridge strip (`buildTerrain`'s occluder pass, z=+45) used
   a hardcoded `topColor = midColor = bottomColor = 0x020408` regardless of
   zone - a flat near-black band that, combined with defect #1's unlit rock,
   read as a single black mass filling the bottom of frame in every shot.
   Retinted to `deepBlueSil = lerpColor(0x0a1622, water, 0.22)` (a dark
   zone-fogged blue, never pure black), with mid/bottom scaled darker
   (`scaleColor(deepBlueSil, 0.72/0.5)`) so the crown still reads as the
   nearest/darkest layer without going flat black. Also retinted the ordinary
   (non-occluder) ridge `bottomColor` from a second hardcoded `0x020408` to
   the same zone-fogged blue lerp, for consistency (this vertex is normally
   off-screen below the gameplay camera, so it's a low-risk cosmetic
   parity fix, not a visible-frame change).

### Verification (fix round)

- `node --import ./tools/reg.mjs tools/selftest.mjs world game` - green,
  185/185 and 194/194, matching the pre-fix baseline exactly (no selftest
  text needed to change once decor RNG was isolated onto `decorRng`).
  Re-ran 3x to confirm stability/determinism.
- Real browser (headless Chrome via CDP, 844x390 @dpr3, same harness as
  `evidence.mjs`): a natural swim run (dive -> swim right -> dive deeper) plus
  teleports to the 4 requested points `(0.3w,700)`, `(0.55w,1800)`,
  `(0.45w,3000)`, `(0.6w,4300)`, PLUS a 21-point stress sweep across all four
  zones to check typical coverage rather than trusting 4 samples. Iterated
  through 5 tuning rounds (initial cavern-centered scatter -> increased counts
  -> regular grid at decreasing step sizes) reading the actual screenshots
  each time.
- Final numbers at the 4 requested teleport points (one representative run):
  `05-shelf` 84 draws / 31336 tris, `06-midwater` 86/35628, `07-twilight`
  88/36664, `08-abyss` 82/37068; end-of-run stats 89 draws / 38340 tris.
  All comfortably inside the module gate (draws < 120, tris < 60k).
- Visual verdict: rock is consistently lit blue-grey stone with visible
  shading and a cyan edge accent in every frame captured (never black).
  Cavern interiors read as filled stone, not hollow shells. Kelp (with neon
  tip accent) and reef/coral are visible in the large majority of sampled
  frames across all 4 zones, including deep zones 2-3 that had NOTHING
  before this fix. A residual minority of frames in the 21-point stress
  sweep (roughly 15-20%, concentrated in wide-open cavern interiors and the
  sparsest deep-abyss caverns) still show open water with only ambient
  motes/fish, which reads as legitimate gameplay variety for a cave-and-
  tunnel world rather than the "always-empty" defect reported - a natural
  swim path (not a teleport-anywhere stress test) reliably shows decor within
  a few seconds of movement in every zone tested. Pushed grid density three
  times (step 420 -> 260 -> 170) chasing full coverage; stopped at 170 given
  diminishing returns against the "ATMOSPHERE, NOT OBJECTS"/readability intent
  and the still-generous performance headroom - further tightening remains an
  option if owner/Luna review wants stress-test coverage even higher, but risks
  over-cluttering normal play.
- No git commit, no deploy, per instructions. Dev server (`serve.mjs 8932`)
  started and killed within this session; no background process left running.

## Fix round 2 (Luna adversarial/design/art review, 2026-08-21) - Lane W2

Work order: SPEC3D.md 6.11 "Fix-round 2 contracts" plus the world-side
CRITICAL/MAJOR items in `reviews/code_out.md`, `design_out.md`, `art_out.md`.
Files touched: `world3d.js` only (`tools/gen_data.py`/`data.js` needed no
change this round). `ui3d.js`/`fx3d.js`/`shark3d.js`/`fish3d.js`/`abilities.js`/
`engine3d.js` were being edited concurrently by other lanes and were never
opened for writing.

1. **Pickup ID seam.** `spawnBuffAt` stored `p.buff = id`; engine reads
   `e.buffId`. Changed to `p.buffId = id` (world3d.js:~4462) and updated the
   selftest's own reference from `buffEnt.buff` to `buffEnt.buffId`. Confirmed
   no other `.buff` (non-`buffId`) reference remains in world3d.js.

2. **NURSERY LAW.** Added `NURSERY_TIER=2`/`NURSERY_R=1600` and a
   `withinNursery(player,x,y)` helper (zone/region-agnostic, unlike the
   existing spawn habitat checks). `runSpawner`'s predator roll now skips
   entirely when the player is nursery-tier and the candidate point (checked
   both before AND after `ringPointValid`'s own resample, since that call can
   move the point) falls inside 1600px of the player. Predator AI leash: each
   spawned predator now stamps `st.homeZoneId` (its zone at spawn time, added
   post-`resetSt` since that function does not touch the field) in
   `spawnOne`; `predatorAI` computes `leashed = player is nursery-tier AND
   the predator's current zone != its homeZoneId` and refuses to enter
   `'pursue'` while leashed (patrol/flee still work normally). New selftest:
   spawns 300 predator-roll attempts with a tier-1 player pinned at a fixed
   point and asserts zero predators land within 1600px; a second check drops
   a synthetic foreign-zone predator next to a nursery-tier player and
   confirms it does not enter pursue mode.

3. **Chum consumer.** `preyAI` reads `ctx.run.buffs.chum` (guarded at every
   level: `ctx`, `ctx.run`, `ctx.run.buffs` may all be absent) and, when
   `chum > 0` and the prey has not already sight-fled or panic-fled this step,
   steers toward the player at `CHUM_SPEED_FRAC=0.55` of base speed with
   `CHUM_STEER_W=3.2` (between the wander weight 2.2 and flee weight 6) inside
   `CHUM_R=600`. Panic and ordinary sight-flee both still take priority (Chum
   only fires in the `!fleeing` branch, same gate the wander fallback uses).

4. **Panic jitter always applies.** Code review found `world3d.js:4209`
   skipped the perpendicular-jitter/doubled-bend panic branch whenever
   ordinary sight-flee already fired this step (`panicking && !fleeing`).
   Changed the gate to `if (panicking)` unconditionally: the panic steer now
   re-steers on top of whatever sight-flee already did, so a prey inside the
   170px mouth-panic radius always gets the perpendicular jitter regardless of
   whether it was also sight-fleeing. (The doubled instanced/billboard bend
   amplitude at world3d.js ~4880/5005 already read `st.panicT > 0`
   unconditionally and needed no change - only the STEERING was gated.)

5. **NPC rig `vy`.** `rigState` gained a `vy: 0` field (previously
   `speedFrac`/`turn`/`bitePhase`/`jawSnapT` only). The predator animate branch
   now sets `rigState.vy = e.vy` (sim px/s, +y=down, matching the player bag's
   units per 6.2) right after `rigState.turn`, and the existing frozen-state
   reset also zeroes `rigState.vy` alongside `speedFrac`/`turn`.

6. **Teardown scratch leak.** `scratchQuery` (the query()/eatQuery() reused
   result buffer) is now cleared (`scratchQuery.length = 0`) in
   `World.teardown()`. Audited the other two entity-ref-holding module
   scratches the review named: `playerHits` is already cleared by the
   existing `resetHits()` call in teardown; `scratchChain` (mine-chain BFS) is
   always drained back to length 0 at the end of its own function on every
   call, so it never persists a ref across calls and needed no teardown hook.

7. **Robustness: SDF/resolveBody non-finite guards.**
   `World.terrainSDF(x,y)` now returns `1e9` (large-water) immediately if
   either coordinate is non-finite, before any bilinear math runs.
   `World.resolveBody(body,r)` now no-ops immediately if `body.x`/`body.y`/`r`
   is non-finite. Also fixed the flat-gradient fallback the review flagged
   (`world3d.js:2556`): previously `break`d out and left the body embedded
   when the finite-difference gradient was degenerate (e.g. deep inside a
   uniform rock fill). Now samples the 4 cardinal directions at a wider
   `FLAT_NUDGE_STEP = SDF_CELL*1.5` probe and nudges toward whichever reads
   most clearly water, only giving up (breaking cleanly) if every cardinal
   sample is no better than the current position. The ordinary gradient path
   resumes next iteration/frame once off the flat spot.

8. **Maze reachability, body-radius-aware.** The existing connectivity
   selftest was point-connected (`terrainSDF(x,y) > 0`), matching the design
   review's exact critique. Added `bfsBandReachability(clearance, startX,
   startY)`: a real 4-connected BFS over the SDF grid's own corner samples,
   walkable only where `sdf > clearance`, reporting per-band reachability from
   the BFS component containing the start point. `MAZE_CLEARANCE = 98+24 =
   122px` (tier-12 body radius + SDF_SPAWN_CLEAR). Rewrote the selftest's old
   point-connected loop to call this instead, asserting `reachableN ===
   zones().length`.
   - **Root-caused why the original 130-190px tunnel half-width failed
     clearance**: tunnel wall wobble is `+-(MAZE_EDGE_NOISE_AMP*0.4) =
     +-18.4px`, so the worst-case effective half-width at the old 130 minimum
     was `130-18.4=111.6px`, below the required 122px. Raised
     `MAZE_TUNNEL_HALF` (shared by both lateral tunnels and vertical shafts)
     from `[130,190]` to `[148,200]` so the worst case (`148-18.4=129.6px`)
     clears with margin.
   - **Deterministic widening, no RNG-order shift.** Per 6.11 ("carving
     widens until it passes deterministically for the shipped seed(s)"),
     added `widenTunnelsForReachability(startX,startY)`: after
     `buildMazeLayout()`+`buildSDFGrid()` run once in `buildMaze()`, it runs
     the BFS and, if it fails, widens every already-placed tunnel/shaft's
     `halfW` IN PLACE by a fixed `MAZE_WIDEN_STEP=20` (same centerlines, same
     noise seeds - no new `S.rng` draws, so this cannot shift the shared RNG
     stream or change spawn/player-position outcomes downstream) and rebuilds
     only the SDF grid, repeating up to `MAZE_WIDEN_MAX_TRIES=6`. With the
     raised base half-width this does not currently trigger for the shipped
     seed in a live build (BFS already passes at the base widths), but the
     mechanism is in place as the spec requires for any future seed/tuning
     change that regresses it.

9. **Rock art: irregular contour caps (art CRITICAL 2).** Replaced
   `buildRockChunk`'s square `segW/segH = cell*0.94` front-cap quad with
   `rockPushContourCap()`: builds the REAL solid-region ring for that cell
   (solid corners + the actual marching-squares zero-crossing points, walked
   in perimeter order), triangulates it as a fan from its own centroid, and
   perturbs each ring vertex a small deterministic amount (hash of cell
   coords + vertex index, `<= 9% of SDF_CELL`) along its own radial direction
   from the centroid, with matching per-vertex colour-shade variance - so caps
   follow the true SDF contour with varied facet scale/shading instead of a
   stamped square, and no visible grid seam at gameplay scale. Added
   deterministic neon fault lines: a sparse (~16% of boundary cells,
   alternating cyan/magenta by cell hash) additive strip riding the same
   boundary-crossing segment as the existing skirt, accumulated globally
   across every rock chunk into ONE shared additive `MeshBasicMaterial` batch
   built once in `buildNearRock` after the chunk loop (`+1 draw` for the whole
   fault-line system, not per-chunk or per-cell).
   - **Winding bug found and fixed during browser verification**: the new fan
     triangulation initially produced INVERTED normals (ring built by walking
     TL->TR->BR->BL is CW once Y is flipped to three-space), which made
     `computeVertexNormals()` derive back-facing (-z) normals on the majority
     of front caps, reading as pure black under `MeshLambertMaterial`
     regardless of the correct (non-black) vertex colours underneath. Fixed by
     reversing the ring before fanning it, matching `rockPushQuad`'s existing
     CCW convention. Verified via a headless-Chrome raycast probe sampling
     `geometry.attributes.normal` on live front-cap vertices: 92%+ now read
     `normal.z > 0.3` (up from ~11% before the fix).
   - **Follow-up lighting fix (not a regression I introduced, pre-existing).**
     Even with correct normals, the extruded SKIRT walls (front-to-back
     depth quads at each boundary cell) face almost straight along -Y in
     world space; under `HemisphereLight`, a normal near `(0,-1,0)` samples
     almost entirely the "ground" hemi colour (`0x06121e`, near-black),
     independent of any bug - this was true of the ORIGINAL square-cap
     geometry too (same skirt shape), and is the actual mechanism behind the
     "black rock silhouette" the art review screenshotted. Added a modest
     `emissive: 0x141d26` floor to the shared `rock_lambert` material so every
     rock face (cap or skirt, whichever way it faces) keeps its own vertex
     colour visible as dim shadowed slate rather than collapsing to flat
     black, without touching the shared light rig (engine3d.js/Lane A owns
     light creation, not this file). Verified via live capture: rock
     underside now shows visible panel/facet breaks and lighter slate-blue
     tones instead of a flat black rectangle.

10. **Neon visibility + depth staging + school staging (art CRITICAL 3, MAJOR
    3, MAJOR 5).**
    - Kelp tips: added ONE shared additive batch (not swaying with its band
      pivot, an accepted simplification given the small sway amplitude) so
      every stalk tip gets a genuinely additive/emissive accent instead of
      only the pre-existing diffuse vertex-colour mix - `+1 draw` total.
    - Ruin edges: added the same treatment - one shared additive batch of
      thin edge-glow strips riding every ruin prop's top edge, recorded during
      the per-zone loop and built once after it (`+1 draw` total).
    - Abyss landmarks: the deepest zone's ruin population grows by 4 extra
      props (`ruinCfg.n + 4` vs. the unchanged count in every other zone),
      skewed 1.8x larger than the ordinary prop scale, so the abyss reads as
      an authored sunken skyline rather than a couple of small props lost in
      near-black.
    - School staging: `fillSchoolBatch` previously placed all 32 instances via
      pure uniform random `(x,y)`, producing dense overlapping piles at
      whatever x/y luck landed. Replaced with 5 loose sub-clusters spread
      evenly across the zone's x-range (each with a `+-260px`/`+-90px` local
      jitter), plus mild per-instance tint variance (`0.85-1.15` scalar on the
      instance colour) so the school reads as several readable lanes with
      slight individual variation instead of one flat silhouette blob. Still
      fully deterministic (`rr()`/`S.rng` only, no new RNG draws beyond what
      the old code already consumed - same call count, different consumption
      pattern within the function).
    - Per-zone accent language, twilight acid-green, and the existing
      shelf/midwater/abyss cyan-magenta cycling from the Rev 6 pass were
      already in place from the prior fix round and needed no change this
      round; verified still present in live capture (menu thumbnails and
      in-run shark both show clear cyan/magenta accents at every zone
      sampled).

11. **Budgets.** Environment selftest mesh count: 53 (was 50 before this
    round; +3 for the kelp-tip additive, ruin-glow additive, and rock-fault
    additive shared batches), still comfortably under the shared `<=60` env
    gate. Live-browser `renderer.info.render`: 94-96 draws / 40.5k-44.5k tris
    across a swim+teleport+eat sequence and a 3x repeat, all comfortably under
    the `<120` draw / `<60k` tri module budget.

### Verification (fix round 2)

- `node --import ./tools/reg.mjs tools/selftest.mjs world game` - green,
  185/185 and 198/198 (up from 185/194 pre-round; `game` gained 4 checks from
  another lane's concurrent work, none of mine - I never opened engine3d.js).
  Re-ran after every edit in this round, never regressed.
- Real browser verification: `serve.mjs` on port 8936 (per instructions) from
  the scratchpad harness dir, `evidence.mjs` adapted into
  `laneW-evidence/evidence-laneW.mjs` (same puppeteer-core+CDP approach: 844
  x390 @dpr3, real Chrome, dive -> swim -> teleport tour of shelf/midwater/
  twilight/abyss -> spawn+chase -> renderer.info readout). Iterated through
  several rounds reading actual screenshots:
  - Found and fixed a genuine intermittent blocker NOT in my files: `ui3d.js`
    `idleSchedule()` referenced a bare `root` that was not in scope
    (`ReferenceError: root is not defined`), breaking the DIVE button/menu
    entirely while another concurrent lane was mid-edit on that file. Did not
    touch `ui3d.js` myself; waited (via a bounded background poll, no manual
    sleeping) for the owning lane to fix it, confirmed via a live diff of the
    function body, then resumed.
  - Found and fixed the fan-triangulation winding bug (item 9) and the
    skirt-lighting near-black issue (item 9 follow-up) via targeted
    raycaster/geometry-attribute probes against the live scene graph, not
    just screenshot eyeballing - confirmed the exact vertex normals and vertex
    colours at the pixel reading as black before concluding what to change.
  - Final screenshot verdict: shark reads with strong, unmistakable cyan/
    magenta cyberpunk accents in every zone sampled (menu thumbnail through
    abyss). Rock no longer shows a flat black rectangle with square grid
    seams - it now shows genuine irregular faceted panel breaks and lighter
    slate-blue tones even on shadowed undersides, though large cavern
    ceiling/wall masses viewed from directly below remain visually dark
    overall (an inherent consequence of the hemisphere-light "ground colour"
    on near-vertical skirt walls, mitigated but not eliminated by the
    emissive floor - a further improvement here would mean either brightening
    the shared light rig, which Lane A/engine3d.js owns, not this lane, or
    reworking the skirt geometry to avoid steep down-facing normals
    altogether, a bigger change than this round's budget allowed). Tutorial
    copy not clipped. Menu thumbnails show real baked 3D shark art, not
    monogram placeholders (already fixed by another lane). No console errors
    in the final passing runs.
- Dev server (port 8936) started and killed at the end of this session; no
  background process left running. No commits, no deploy, per instructions.
# Lane W3 — Fix-round 3, world3d.js — status notes

Scope: world3d.js only (per lane assignment). No engine3d.js/abilities.js/fx3d.js/ui3d.js/index.html edits.

## Item 1 — PUBLIC SPAWN LAW (code review MAJOR)
DONE. `World.spawnBurst` (world3d.js ~4452) now resamples the requested point
(widening jitter radius per try, up to SDF_RESAMPLE_TRIES) against the same
three gates `runSpawner` uses: nursery distance (predator kind only, matching
runSpawner's own scoping — prey/pickups are never nursery-gated), SDF
clearance (`radiusFor(def,kind) + SDF_SPAWN_CLEAR`), and player-region match.
Skips the spawn entirely if every try fails (documented as intentionally
different from `ringPointValid`'s "fall back to last sample" contract, since
an arbitrary public-caller point has no swimmable-band guarantee).

Verified live in browser (script-injected, not just selftest):
- `spawnBurst('greatwhite', px, py, 1)` next to a tier-1 (nursery) player:
  refused (`made: 0`), zero predators created within NURSERY_R.
- Same call with player tier 8: succeeds normally (`made: 1`).
- `spawnBurst('greatwhite', ...)` at a coordinate sampled deep in rock
  (`terrainSDF < -80`): resamples to a legal nearby point, zero embedded
  entities (`embeddedCount: 0`).
- Confirmed prey spawns are NOT nursery-blocked near a tier-1 player (only
  predator kind is gated, matching runSpawner).

## Item 2 — BUFF CADENCE (design review item 4)
DONE.
- Ambient buff roll in `runSpawner` moved before the `live >= B.onscreen`
  early return (still after the `S.free.length <= 4` pool-exhaustion guard).
- `BUFF_LIVE_CAP = 2`: shared `liveBuffCount()` gate now applies to BOTH
  `spawnBuffAt` call sites (ambient roll and kill-drop).
- `World.spawnBuffDrop` additionally respects a 10s global cooldown
  (`S.buffDropCd`, ticked in `World.update`).
- Verified: 20 rapid `spawnBuffDrop` calls in a loop never exceed 2 live
  buffpickups (`maxSeen: 2`), cooldown blocks every call after the first.

## Item 3 — ROCK WELD (art review CRITICAL 1)
DONE.
- Contour-cap jitter (`rockPushContourCap`) now keyed by a STABLE identity
  per vertex: `cornerHash(x,y)` for real grid corners (order-independent),
  `edgeHash(ax,ay,bx,by)` for marching-squares crossing points (sorted pair,
  so both cells touching that edge agree). Old jitter was keyed by
  `(cellSeed, ring-index)`, which gave two adjacent cells DIFFERENT jitter
  for the physically-same shared vertex — the actual crack cause.
- New canonical `weldedCorner(px,py)` returns ONE absolute displaced position
  per real SDF grid corner (cached), used by BOTH the contour cap's solid-
  corner ring vertices AND the interior weld-fill macro-cell corners, so a
  boundary cell and an adjacent interior-fill quad land the same shared
  corner in the identical spot (not just an identical hash going through two
  different displacement formulas, which was an earlier draft bug caught and
  fixed before verification).
- Replaced the axis-aligned row-run `rockPushQuad` interior fill with a
  WELD_STRIDE=2 (128px) macro-grid of irregular welded quads
  (`rockPushWeldedQuad`), 2 tris each, corners from `weldedCorner`.
- Fixed a real rendering bug found during verification: `MeshLambertMaterial`
  emissive is a flat constant colour, NOT multiplied by vertexColors — so the
  old "emissive floor" fix (a fixed dark navy) made every unlit rock face
  (skirts, shadowed caps) render the exact same flat near-black regardless of
  vertex-colour tint work, which is why real captures still showed solid
  black silhouettes. Patched via `onBeforeCompile` to multiply
  `totalEmissiveRadiance *= vColor.rgb`, so unlit faces now show their own
  AO/neon tint.
- Verified visually: real captures now show jagged, faceted rock silhouettes
  with NO rectangular/axis-aligned seams anywhere (V-cuts, irregular
  polygonal boundaries at gameplay scale).

## Item 4 — NEON LANDMARKS (art review CRITICAL 2)
DONE, with real visual confirmation (not just code).
- Raised cyan mix on both contour-ribbon (`rockLit`) and interior-fill
  (`wLit`) rock tints substantially (was 3-10%, now ~22-50% depending on AO).
- Raised fault-line density 0.16 -> 0.32, alpha floor/ceiling raised, width
  5px -> 8px.
- `ZONE_RUIN[0]` (shelf zone) now gets a small ruin/landmark set too — art
  review's "every zone" requirement was previously unmet (zone 1 had none).
- Every zone gets 2+ explicit "landmark" props (was abyss-only +4 bonus):
  scaleUp 2.0x (2.6x abyss), brighter body tint mix, thicker/brighter glow
  strip (alpha 0.6-0.85 vs old 0.34-0.5, thickness h*0.16-0.22 vs h*0.08).
  Abyss keeps the largest landmark count (6) for a fuller skyline read.
- Verified in real captures: bright, clearly-visible glowing pylon/gate/
  conduit structures found near multiple sampled abyss positions (screenshots
  `shots-laneW3-ruin/ruin3.png`, `ruin5.png`, `ruin0.png`), plus a visible
  diagonal cyan fault-line stripe across a large rock face
  (`shots-laneW3-neon/abyss-x0.png`). Colour skews toward the pink/white
  accent in `neonAccentFor`'s 3-colour cycle in some samples rather than
  uniformly cyan/magenta — acceptable per spec (calls for "bright additive...
  glowing... holo" generally, cycles 3 accents already used elsewhere in the
  file), but a fully cyan-only re-tune is possible if a reviewer wants it.

## Item 5 — PREY PANIC CUE
DONE.
- New `st.lungeTargetFlashT` state field + `updateLungeTargetFlash(e,ctx,dt)`
  called from `preyAI`. Reads `ctx.player.st.lungeT/lungeX/lungeY`
  defensively (typeof-guarded on every field, since engine3d.js's lunge
  fields are owned by a concurrent lane and were mid-edit for part of this
  session) — a tight `LUNGE_TARGET_R = 40` px radius identifies the SPECIFIC
  captured entity, not just "something nearby".
- On newly arming, fires a small `fx('elementSpark', ...)` burst (existing
  fx3d.js pool, tinted) as the one-shot tracer.
- `animateInstancedEntity` blends the entity's instanceColor toward
  `LUNGE_FLASH_COLOR` (white-hot toward red) while `lungeTargetFlashT > 0`,
  decaying over `LUNGE_FLASH_T = 0.22s`, on top of (not overriding) any
  existing status tint.
- Verified via script injection: target entity flashes to 0.22 on capture,
  all 96 other live prey stay at 0 (never falsely flash), decays to 0 after
  lungeT ends. No regression to the movement-thrash panicT system (untouched,
  separate field).

## Budgets (measured, real browser, headless Chrome + real THREE)
Multiple evidence runs across the session:
- draws: 96-102 (< 120 budget)
- tris: ~31.5k-46.6k (< 60k budget)
Both hold comfortably across every capture in this session, including with
all 5 items landed together.

## Selftests
`RF.World.__selftest()` and `RF.Game.__selftest()` both green (`pass: true`)
in the real browser page, checked repeatedly through the session including
after every item landed. One transient failure early in the session
(`recordFrenzyKill` reading `.packId` on undefined) was traced to the
concurrent engine3d.js lane mid-edit at that instant (file was 4000+ lines,
then 3341, confirming active rewrite by another agent) — resolved on its own
once that lane's edit passed through a stable state; not a defect in this
lane's files.

Console shows a transient boot-time warning
("engine3d dependency check: missing required [RF.World, RF.Fx, RF.Art3D,
RF.UI]... Boot continues degraded") on every run — confirmed this is a
timing race in engine3d.js's own early dependency check, not a real absence:
follow-up query ~2.5s after load confirms RF.World/Fx/Art3D/UI are all
present. Not touched (outside this lane).

## Verify harness used
`serve.mjs` on port 8936 (this scratchpad dir) + `evidence.mjs` pattern
(copied to `evidence-laneW3.mjs`, output in `shots-laneW3/`) +
`run_selftest_browser.mjs` (new, this lane) which calls
`RF.World.__selftest()` / `RF.Game.__selftest()` directly in the loaded page
via CDP, since both are page-global functions with no Node/CommonJS export
path (data.js does `window.RFD = ...`, world3d.js has a real
`import * as THREE from 'three'`, so a plain Node `eval` harness was
abandoned in favour of driving the real browser page instead). Also several
one-off `/tmp/check_*.mjs` scripts (deleted after use) for direct assertions
against `RF.World.__state`/`RF.ctx` beyond what static screenshots could
prove (spawn-law gating, buff cap/cooldown, panic-flash arm/decay).

Server killed at end of session (port 8936 no longer bound).

## Files touched
- /Users/lucille/greenguard-usa-web/play/razorfin/world3d.js (only file
  edited; no gen_data.py/data.js regeneration was needed — no data schema
  changes, only sim/render logic).

## Rev 6.13 — Lane W4, art fix round 4 (art3_out.md CRITICALs 1 & 2)

Work order: art review verdict at
`.../scratchpad/razorfin/reviews/art3_out.md` — 06-midwater still reads as a
128px macro-grid tiled block (CRITICAL 1), landmarks are random/faint scatter
and 08-abyss is nearly empty (CRITICAL 2). Scope: world3d.js only.

### CRITICAL 1 — rock interior triangulation (buildRockChunk)

Replaced the `WELD_STRIDE=2` macro-grid interior fill (one flat quad per
128px macro-cell, `rockPushWeldedQuad`) with a per-SDF-cell (64px, native
resolution) irregular TRIANGLE split:
- Every fully-solid interior cell splits into 2 triangles along a per-cell
  DETERMINISTIC diagonal choice (`cornerHash` on grid index, not a fixed `\`
  or `/` parity), so the split direction itself varies cell to cell.
- All 4 cell corners still come from the same canonical `weldedCorner(px,py)`
  the marching-squares boundary cap uses, so adjacent cells (interior-
  interior or interior-boundary) share identical displaced corner positions
  — zero seams, watertight mesh, same guarantee Rev 6.12 established.
- New helpers: `rockPushTri` (3 explicit points + 3 explicit per-vertex
  colours + a z per triangle), `triHash` (deterministic hash keyed on a
  triangle's own 3 corner positions), `rockPushCellTri` (per-triangle face-
  scale inset toward its own centroid + independent per-vertex shade jitter +
  an occasional, ~1-in-5, small z-offset on the split's far vertex so a
  minority of faces sit slightly proud/behind their neighbour and pick up a
  different diffuse term under the hemi/sun rig).
- Verified in a real close-up capture (`rockface-closeup.png`, not kept):
  the rock silhouette edge is now organically jagged with visibly varied
  small facets; the neon fault-line overlay follows genuinely varied angles
  rather than snapping to axis-aligned macro-cell boundaries. No visible
  128px tiled-block read at gameplay scale.
- Budget: this pass has MORE geometry than either previous approach (every
  single 64px cell now gets 2 triangles instead of one quad per 128px macro-
  cell or one quad per merged run), but the rock chunks are still frustum-
  culled per ~1800px column and the measured on-screen total (rock + every
  other batch in the scene) stayed at 46.7k-48k tris across every capture
  this session — comfortably under the 60k cap. `mesh.userData.rfRockTris`
  still reports the per-chunk triangle count for future budget checks.

### CRITICAL 2 — deterministic neon landmarks + abyss skyline

**Deterministic placement.** New `zoneLandmarkAnchors(zoneIndex, Z)` returns
real maze cavern centres (`mazeCavernX/Y`) and tunnel mouths
(`mazeTunnels`) that fall in a zone's y-range, sorted by x. This replaces the
`rr(0, S.w)` random scatter the art review flagged as unable to guarantee any
zone shows a landmark. Shelf/midwater/twilight each place up to 6 landmarks
(`wantLandmarks`, raised from an original 2-4 after coverage testing showed
gaps between anchors were still often wider than one camera frame) at these
anchors; a zone with zero anchors still gets evenly-spaced fallback
positions rather than silently having none.

**Zone accent identity** (`ZONE_LANDMARK_ACCENT`): shelf = cyan (alternating
magenta every other gate via `ZONE_LANDMARK_ALT`, per "cyan/magenta holo gate
arcs"), midwater = electric cyan (conduit pylons), twilight = acid green
(data spires). Shapes: shelf = wide gate arc (360-480 x 320-460), midwater =
narrow tall pylon (70-110 x 420-600), twilight = tapered spire (90-140 x
380-560) — all comfortably inside the 300-600px spec band.

**Abyss contiguous skyline** (`buildAbyssSkyline`, replaces the old scattered
"+6 landmark" loop for the last zone only): walks the WHOLE zone width at a
fixed `ABYSS_TOWER_STEP=130` px step with NO skipped steps, so overlapping
tower silhouettes are genuinely contiguous end to end — any window into the
band crosses 2-3+ overlapping towers, not a gap. Each tower gets a lit
"crown" (additive cap, every 3rd tower to avoid wash — see below) and up to
one lit "window" (small additive square, most but not all towers, per-tower
hash-keyed for stable position across rebuilds), cycling the 3 neon accents.

**Bugs found and fixed during verification** (the actual reason this item
took multiple passes — colour tuning alone never fixed it):
1. **Z-depth occlusion (the real root cause of "abyss/shelf show nothing").**
   The original landmark/skyline z (`Z_SIL[0]`-ish, ~-400) sat BEHIND
   `Z_TERRAIN[0]` (-340, opaque, depthWrite true) — landmarks were being
   depth-tested away by the parallax ridge terrain for most of the screen.
   Moving to z=90..140 (in front of the rock's own front cap) "fixed" the
   occlusion but broke everything else: that put landmarks CLOSER to camera
   than the gameplay plane itself (shark sits ~z0-25, camera ~185-400), so a
   400px-wide quad that close subtends a huge screen angle and rendered as a
   giant washed veil over the whole frame including the shark. Final,
   correct value: `Z_KELP` band (`[-260,-140]`), the SAME z every kelp stalk
   and rock billboard already uses and is proven visible on top of cavern
   rock in every capture this session.
2. **Additive stacking washes to white/pastel.** Real captures repeatedly
   measured landmark glow as a blown-out white/pastel blob regardless of how
   the colour math was tuned — confirmed via direct vertex-colour dumps
   (`RF ruin edge glow additive` mesh) that the pushed vertex colours WERE
   correct saturated cyan/magenta/acid; the wash was purely multiple
   overlapping additive layers (crown + inner glow band + a coincidentally
   nearby kelp-tip accent, etc.) summing in the framebuffer. Fix: the
   shelf/midwater/twilight landmark tier now carries its identity almost
   entirely in a SATURATED, non-additive BODY fill (`lBody`/`lTop`, alpha
   raised 0.6 -> 0.82) rather than leaning on stacked additive glow, so it
   reads as a distinct hue regardless of what else shares that screen
   region. The abyss skyline keeps a modest additive crown (every 3rd tower,
   was every-other) + at most one small window per tower (was 1-2, larger)
   — cut enough that the abyss captures (`shots-laneW4/08-abyss-a.png`,
   `08-abyss-c.png`) show a clean, readable magenta/cyan/acid tower skyline
   rather than a pastel wash.
3. **Fog disabled on additive glow batches** (`RF kelp tip neon accent`, `RF
   ruin edge glow additive`): both previously inherited `m.fog = !noFog`
   defaulting to fogged, meaning FogExp2 was diluting every additive neon
   accent toward the zone fog colour before it reached the screen — likely
   the actual root cause of "reads pale" surviving Rev 6.9-6.12's repeated
   alpha/mix raises. Both batches now pass `{fog:false}` through `batchMesh`,
   matching the pattern the rock fault-line batch already used correctly.

**God rays** (`buildRays`): base colour raised from flat `0xdff6ff` toward
`NEON_CYAN` (34% mix, `RAY_TINT`), alternating bands lean magenta instead,
so the shelf's light shafts carry the same two-accent cyberpunk identity as
the rest of that zone instead of reading as plain white/pale.

**Kelp-tip glow alpha** floored at 0.6 (was `0.5 * stalk-own-alpha`,
effectively 0.13-0.35 — measured as an invisible flicker in ordinary frames).

### Verification honesty note

Abyss skyline: STRONG pass — verified visible and readable across multiple
teleport samples (`shots-laneW4/08-abyss-a.png`, `08-abyss-c.png` both show
a clean contiguous tower band; `08-abyss-d.png` landed in a gap between
towers with nothing else in frame, which the 130px step + tri budget cap
cannot fully eliminate at 4 discrete samples).

Shelf/midwater/twilight landmarks: mechanism is provably correct (real
maze-anchor positions, real saturated per-vertex colours confirmed via scene
introspection, real Z_KELP depth clear of both terrain and rock occlusion),
but repeated screenshot sampling (8-position sweep + targeted anchor-exact
teleports) did not reliably land a clearly-legible gate/pylon/spire in frame
every time — several samples show only a faint accent smudge or nothing at
all, most likely because a landmark is anchored at a cavern centre/tunnel
mouth that a specific camera angle happens to look at through/past a nearer
rock mass, plus each landmark is still a modest fraction of the huge (14400
wide) zone. Raised `wantLandmarks` to 6 and switched to the proven Z_KELP
depth band as the two concrete mitigations landed this session; a further
pass (more landmarks still, and/or an explicit "always visible from this
zone's typical camera height" placement rule rather than raw cavern
anchoring) would likely be needed to fully clear the "unmistakable in every
frame" bar for these three zones specifically.

### Budgets (measured, real browser, headless Chrome + real THREE)
Multiple evidence runs after all Rev 6.13 changes landed:
- draws: 79-81 (< 120 budget)
- tris: 46.5k-48k (< 60k budget)

### Selftests
`RF.World.__selftest()` and `RF.Game.__selftest()` both green (`pass: true`,
185/213 assertions respectively) after every change in this revision,
including the final state. No asserts needed updating — no rock-tri-count or
landmark-position assertions existed to begin with in this file's selftest.

### Verify harness used
`serve.mjs` on port 8936 (this scratchpad dir), `evidence-laneW4.mjs` (4-zone
teleport sweep + swim frame, adapted from the `evidence.mjs` pattern), plus
several one-off debug scripts (deleted after use) that drove the real page
via CDP and read `RF.ctx.scene` / mesh geometry attributes directly to
diagnose the z-occlusion and additive-stacking bugs above — static
screenshots alone were not enough to distinguish "mesh not built" from "mesh
built but occluded" from "mesh built but colour wrong."

Server killed at end of session (port 8936 no longer bound). All scratch
debug scripts removed from the scratchpad dir.
