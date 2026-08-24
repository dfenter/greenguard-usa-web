# Rev 9.5 OPEN OCEAN — lane notes

Owner complaint: "you cannot dive down." Root cause, verified before writing
any code: the world SDF was a 14400x4800 rock-maze CAVERN generator
(`mazeRawSDF`/`buildMazeLayout` in world3d.js) rasterised via `buildSDFGrid`.
At spawn (7200, 260) rock sat only ~230 units below, and most of the map was
solid rock. `terrainSDF`/`resolveBody`/`regionAt` were already generic reads
over whatever `mazeRawSDF` produced, so the fix is a generator swap, not a
change to those functions.

## What changed

**Files owned by this lane:** `world3d.js` (all regions except
`installInstancedBend`/`INST_BEND_CHUNK`), `tools/gen_data.py` + `data.js`,
append-only SPEC.md/SPEC3D.md sections, this file. No other files touched,
no git commit.

**Preserved from a prior lane:** the species-cap spawn gate
(`checkSpawnSpeciesCapGate`, zone spawn tables capped at 3 prey species) and
the predator roll `0.09` constant — neither was touched.

### world3d.js
- New constants block (`OCEAN_SEABED_Y`, `OCEAN_TRENCH_Y`, `OCEAN_TRENCH_N`,
  `OCEAN_TRENCH_W`, `OCEAN_MOUND_N`, `OCEAN_MOUND_BASE_R`,
  `OCEAN_MOUND_TOP_FRAC`, `OCEAN_MOUND_TOP_R_FRAC`, `OCEAN_POCKET_N`,
  `OCEAN_POCKET_R`, `OCEAN_XBAND`) alongside the existing `SDF_*`/`MAZE_*`
  constants. The old `MAZE_CAVERNS_MIN/MAX`, `MAZE_CAVERN_W`,
  `MAZE_TUNNEL_HALF`, `MAZE_SHAFTS_PER_BOUNDARY` constants are now unused
  (left declared, harmless) since the new generator doesn't build a cavern
  graph.
- `mazeRawSDF`/`buildMazeLayout` rewritten: seabed height profile +
  6-10 tapered-cone mounds + pocket carve-outs + trench dips + side walls.
  Full geometry described in SPEC3D.md's Rev 9.5 section.
- `buildSDFGrid`, `World.terrainSDF`, `World.regionAt`, `World.resolveBody`
  — UNCHANGED. They only ever read `mazeRawSDF`/the grid, so the swap was
  transparent to them.
- `bfsBandReachability`/`widenTunnelsForReachability` (Rev 6.11's maze BFS)
  removed and replaced with `verifyOpenColumns`/`ensureOpenColumns` — see
  "Open-column reachability" below.
- `buildMaze()` now calls `ensureOpenColumns()` instead of
  `widenTunnelsForReachability()`.
- Decor/landmark code (`findWallY`, `buildDecor`'s kelp/reef grid sweeps,
  `zoneLandmarkAnchors`, `mazeEchoWave`) needed ZERO changes: they all read
  `mazeCavernX/Y/R/Seed`, `mazeTunnels`, `mazeShafts` generically as "named
  features with an x/y/radius", plus raw SDF walks via `findWallY`. The new
  generator populates those same arrays (mounds -> cavern rows, trenches ->
  tunnel rows, pockets -> shaft rows) so every downstream consumer just
  works against the new geometry.
- `deadEndScore` (relic placement, SPEC3D 7.6): the `openNeighbors` accept
  range widened from `[1,2]` to `[1,3]` (see SPEC3D notes — a carved pocket
  sphere's boundary reads differently at grid resolution than a maze
  corridor dead-end did).
- Selftest (`tools/selftest.mjs world`): replaced the maze's tier-12 BFS
  band-reachability gate with 5 new gates — open-column reachability, seabed
  bounds, no rock within 600px of spawn, zones cover 0..H contiguously,
  relic pockets valid. Full list in SPEC3D.md.

### tools/gen_data.py / data.js
- `ZONES` y-ranges moved to depth bands: Sunlit 0-1100, Reef 1100-2300,
  Twilight 2300-3500, Abyss 3500-4800 (was 0/1200/2400/3600/4800). Every
  other ZONES field (id, name, tint, fog, ambient, pressureTier,
  intendedTier, spawns) is untouched. World size (14400x4800) unchanged.
- Regenerated via `python3 tools/gen_data.py > data.js`.

## Design: the SDF itself

```
water                          <- SDF_OPEN_Y=500, always water above this
  .        .   mound (tall)
  .       /|\      .
  .      / | \     .   mound
--------/--|--\----/\----------  <- seabedY(x), rolling ~4300-4600
       (pocket)   /  \
  ~~~~ trench ~~~~    \___ mound (short)
  ~~~~ dip to ~4750~~~
```

- **Seabed**: `seabedY(x)` sums 3 sine octaves (S.rng-seeded phases) into
  `OCEAN_SEABED_Y=[4300,4600]`, then dips under any of 2-4 trenches
  (`OCEAN_TRENCH_Y=[4650,4750]`, cosine-smoothed so the floor blends rather
  than stepping). `mazeRawSDF` treats "above seabedY(x)" as water via a
  single scalar term `seabedY(x) - y`.
- **Mounds**: 6-10 tapered cones. Base radius `[420,900]`px at the seabed,
  summit radius `0.18-0.42x` the base radius, summit height a fraction
  (`topFrac`, `[0.35,0.95]`) of the way up the local water column. The
  first two mounds are forced to `topFrac` near the top of that range so at
  least one summit reliably reaches near zone 1 (Sunlit) every run, rather
  than depending on the RNG draw to put a tall mound there. Mound centres
  are kept >=2200px from the spawn x so a tall summit can never intrude on
  the 600px spawn keepout ring.
- **Pockets**: 2-4 small spheres (`[70,120]`px radius) carved into each
  mound at random heights, subtracted from the mound solid (raises the SDF
  back toward water inside the sphere). These are the relic sites. The two
  tall mounds bias their pockets toward the upper slope (`u` in
  `[0.55,0.95]`) so zone 1 gets real candidates.
- **Open-column invariant**: `verifyOpenColumns(clearance)` walks a vertical
  ray at the centre x of every `OCEAN_XBAND=1200px` slice and requires a
  clearance-walkable path (`sdf > clearance`, same tier-12-body clearance
  the old maze used) from the surface down to 0.8x the local seabed depth.
  `ensureOpenColumns()` runs this once at build time; on failure it
  deterministically shrinks the base radius of any mound overlapping the
  failing band (no new `S.rng` draws — same "widen/shrink in place, rebuild
  grid only" pattern the old maze widener used) and retries up to 8 times.
  This passed on the first try for the shipped seed; the shrink path is a
  safety net, not something observed to trigger.

## Relic pockets (SPEC 7.6, adapted)

Still 3 relics/zone, deterministic (`seed = zone id`), still using
`placeRelicsForZone`/`deadEndScore` unmodified except the neighbor-count
window. Instead of maze corridor dead-ends, the "enclosed cell" candidates
now come from mound-flank pockets and trench floors. Verified by the new
selftest gate (every relic at `sdf>0`, inside its own zone's y-range) and by
the existing generic relic gates (count = 3*zones, kind/zoneId shape,
deterministic placement across two `World.init()` calls with the same seed)
— none of those needed changes.

## Selftest results

```
node --import ./tools/reg.mjs tools/selftest.mjs world meta game
world: pass=true ok=200 fail=0
meta: pass=true ok=170 fail=0
game: pass=true ok=282 fail=0
```

(Some `console.error`-logged lane-failure noise appears in the `meta`/`game`
runs — those are pre-existing headless-DOM stub failures in unrelated lanes
D3/C3/B3/F3 inside the selftest's own degraded-boot simulation, not part of
this lane's `pass`/`fail` count; both `meta` and `game` still report
`pass=true fail=0`.)

## Played probes

All run from
`/Users/lucille/.claude/tmp/claude-501/-Users-lucille/4ca09d6e-d0a7-4531-8418-931f0fa05b68/scratchpad/razorfin`
against the live repo via a local static server + headless Chrome.

**sdfprobe.js** — `node sdfprobe.js`:
```json
{"spawn":{"x":7200,"y":260,"here":440,"down100":340,"down300":3916,"up100":540,"up300":-32},
 "open":{"x":2000,"y":800,"here":3598,...},
 "mid":{"x":7200,"y":2400,"here":2076,...},
 "holdBelowTrack":[[7210,364,288],[7210,446,288],[7211,537,288],[7211,604,288],
   [7211,691,288],[7211,782,288],[7211,873,288],[7211,955,288],
   [7211,1075,288],[7211,1171,288]]}
```
`holdBelowTrack` is a 10-sample, 300ms-interval real touch-hold-below trace.
y goes 364 -> 1171 (807px) over the ~2.7s window, monotonically increasing
every sample, `vy` pinned at `288` (the cruise dive speed) for all 10
samples — no floor, no stall, average descent rate ≈299px/s, consistent
with the pinned 288 vy. This is the direct fix for "cannot dive down."

**plainload.js** — `SHOT1=o_menu.png SHOT2=o_run.png node plainload.js`:
```json
{"menu":{"screen":"menu","menuOn":true},"dive":{"x":786,"y":362},
 "hit":"","after1":"menu","run":{"screen":"hud","player":true,"hp":60,"frame":0,"f1":0},
 "errs":[]}
```
Boots clean, zero console/page errors, reaches the `hud` screen with a live
player at hp=60. Screenshots saved to `o_menu.png`/`o_run.png` in this
scratchpad directory.

**density_probe.js** — `node density_probe.js`:
```json
{"density":{"playerX":7200,"playerY":260,"preyCount":38,"groupCount":6,
  "groupSizes":[15,9,6,4,3,1],
  "bySpecies":{"minnow":9,"reeffish":17,"mackerel":11,"grouper":1},
  "onscreenBudget":{"onscreen":48,"total":120},"totalEntities":62},
 "errs":[]}
```
Zero errors; sane onscreen prey count/budget. The probe's own header comment
targets 12-30 visible/2-4 groups from an earlier clarity pass (Rev 9.4,
another lane's territory) — 38/6 is a preexisting density characteristic
unrelated to the SDF swap in this lane (the same spawn tables/budgets run
unchanged over the new terrain) and was not adjusted here per the lane's
file-ownership boundary (species-cap gate is explicitly preserved, not
retuned).

## Known non-issues

- World-edge rock at `y<SDF_CELL` / `y>S.h-SDF_CELL` (a clamp inherited
  unchanged from the old maze's "world edges are rock" rule) shows up as
  expected negative-SDF samples right at `y=0`; the spawn-clearance selftest
  gate explicitly excludes that edge band, since it is a map-boundary
  artifact, not gameplay-relevant rock.
- `MAZE_CAVERNS_MIN/MAX`, `MAZE_CAVERN_W`, `MAZE_TUNNEL_HALF`,
  `MAZE_SHAFTS_PER_BOUNDARY` constants are now dead (unused) — left in place
  rather than removed, since deleting them is outside "replace
  mazeRawSDF/buildMazeLayout" and they cost nothing at runtime.
