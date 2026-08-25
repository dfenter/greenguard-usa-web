# Rev 12 12.1 — world3d.js LEVELS lane (sky/seabed/prey mix per level)

Scope: `play/razorfin/world3d.js` only, per SPEC3D 12.1/12.6 ("World:
world3d.js (levels: sky layer, seabed type, color script, prey mix; AFTER
the Rev 11 env lane lands)"). No other file touched, no git commit made.

## What changed

### 1. Level resolution (`World.init`)
`World.init(scene3, ctx)` now resolves `ctx.level` (falling back to
`ctx.run.level`, then the first `RFD.LEVELS` row, then a hardcoded `'hawaii'`
id) into `S.level` via `resolveLevel(ctx)`. `S.levelZones` is built once per
init by `buildLevelZones(level)`: a clone of `RFD.ZONES` with the level's
water colour script and prey-mix overlay applied. `zones()` — the ONE
function every consumer in this ~10k-line module already calls (spawner,
`applyZoneAtmo`, every decor anchor, both selftest gates) — now returns
`S.levelZones` when present and `RFD.ZONES` verbatim otherwise, so the whole
existing pipeline picks up level data with no signature changes anywhere
else. `S.skyTheme` is also resolved at init (`{top, horizon, themeId,
seabed}`) for the sky backdrop and for `World.activeSkyTheme()`.

Mound/SDF seeding: `buildMazeLayout()` draws from the SHARED `S.rng` stream,
and existing comments document that any change to its draw COUNT would shift
every later `S.rng` draw in the same init (several selftests assert exact
byte-identical outcomes downstream). So the "deterministic seed = level id"
requirement is implemented as a SEPARATE local deterministic stream
(`levelSeedHash(level.id)`, FNV-1a hash) run in `applyLevelMoundSeed()`
AFTER `buildMazeLayout()` has finished drawing from `S.rng` — it perturbs the
already-generated mound base/top radii and heights by a small
seabed-characteristic bias (`SEABED_SHAPE_BIAS`: volcanic/rock read taller
and narrower, ice reads broader/lower) without touching `S.rng` at all, so
the shared stream's draw count and every value it produces is unaffected.
`ensureOpenColumns()` (already called right after, inside `buildMaze()`)
re-verifies the open-column navigation gate against the perturbed layout on
every level, which is what the per-level open-column selftest checks.

### 2. Above-water sky backdrop (`buildSkyBackdrop`)
New builder, called from `buildBackground()`, adds 3 merged draw calls at a
new farthest-back parallax depth `Z_SKY = -600`:
1. one sky-gradient quad (level's `sky.horizon` at the waterline lerping up
   to `sky.top`),
2. one sun-disc + two cloud-puff batch,
3. one horizon-silhouette batch, built from a per-theme function
   (`HORIZON_THEME_BUILDERS`, keyed by the EXACT `horizonTheme` id strings
   `gen_data.py` authors: `volcano_palms`, `cliffs_cacti_ruins`,
   `barrier_reef_cays`, `atolls_overwater_huts`, `fjords_snow`,
   `glaciers_icebergs`, `peaks_lagoon`, `volcanic_isles`,
   `temples_rice_terraces`, `divi_trees_beach`, `green_hills`,
   `cliffs_pier_kelp`) that pushes 2-6 simple rotated/scaled quads (volcano
   cone + vent glow + palms, cliffs + pyramid + cactus, atoll ring + huts,
   fjord peaks + snow caps, glacier wall + icebergs, temple tiers + rice
   terrace band, divi tree + beach, pier deck + pilings, etc), repeated 3x
   across the 14400px world width. Total: 3 draws, well under the "~6 draws"
   budget in the brief.

### 3. Seabed accent decor (`buildSeabedAccents`)
A `SEABED_THEME` table maps each `seabed` value (`sand/reef/rock/ice/kelp/
volcanic`) to a decor `family` and one merged accent batch layered ON TOP of
the existing proven reef/rock/kelp builders (not replacing them, so the SDF
navigation and PERF-03 draw-budget guarantees those already pass stay
untouched): icebergs hanging from the surface + pale-blue mound-flank cards
for `ice`; black rock spires + orange vent glow on every mound top for
`volcanic`; low ruin-block silhouettes on mound flanks for `rock`
(mexico/newzealand); extra kelp-tip motes through the shelf/mid band for
`kelp` (california). `sand`/`reef` levels rely on the existing coral/rock
decor (already fully data-driven off zone tint) and add no extra batch. One
draw call when a family is active, zero otherwise.

### 4. Water colour script + prey mix overlay (`buildLevelZones`)
- **Water**: each cloned zone's `tint` is replaced by the level's
  `water.bands[i]` (falling back to `water.surface` for zone 0), and `fog` is
  the band tint lerped 45% toward the level's single `haze` colour — NOT the
  flat haze value alone (an earlier draft set `fog = haze` uniformly across
  all 4 zones, which silently broke the ATMO-01 "shelf and abyss differ in
  fog" selftest gate; fixed by deriving fog per-band). `atmoScriptFor()` now
  prefers a zone's own `tint`/`fog` (when a level supplied one) over the
  built-in `ATMO_ZONE_SCRIPT` table, so `applyZoneAtmo`'s fog/clear/light
  lerp — the sole atmosphere-owner per ATMO-01 — actually recolours per
  level, not just the seabed decor.
- **Prey mix**: `checkSpawnSpeciesCapGate` caps every zone at 3 prey species
  (hazards uncapped). The level's `preyWeights` REPLACES a zone's prey rows
  (rather than appending on top of them, which blew the cap the first time a
  level supplied 3 prey ids of its own) with up to 3 weighted prey defs that
  fit that zone's existing `intendedTier+2` gate; the zone's hazard rows
  (`jelly`/`puffer`/`mine`) are always kept verbatim, since the level table
  only ever describes prey/specials, never hazards. A zone with zero
  qualifying preyWeights entries keeps its base prey rows (defensive
  fallback, not exercised by any authored level today).
- **Specials**: each level's `special` creatures (seal/orca for alaska,
  sealion for california, ray for belize/maldives/tahiti/bali/jamaica, etc)
  are appended to the DEEPEST zone whose `intendedTier+2` covers the
  special's tier — matching the existing difficulty gate exactly, so a
  level's specials never trip `checkSpawnTableGate`. If that zone is already
  at the 3-species cap, the special swaps in for the lowest-weighted existing
  prey row rather than breaking the cap.

### 5. Selftest coverage
`World.__selftest` gained a new Rev 12 block (runs after the existing
schooling-probe block) that iterates every `RFD.LEVELS` row (falls back to
one synthetic `testland` row when LEVELS has not landed, so the block still
exercises `resolveLevel`/`buildLevelZones`/`buildSkyBackdrop` standalone) and
asserts, per level:
- `World.init` completes without throwing,
- `World.activeLevel().id` resolves to the requested level,
- `World.activeSkyTheme().themeId` matches `horizonThemeFor(level)` and
  `.seabed` matches the level's `seabed`,
- at least one sky/silhouette batch (vertex z <= `Z_SKY + 10`) is actually in
  `S.decor`,
- every preyWeights/special entry that fits some zone's tier gate appears
  somewhere in that level's zone spawn tables,
- `checkSpawnTableGate()` and `checkSpawnSpeciesCapGate()` both still pass
  (the overlay must never itself trip either gate — this is the same
  assertion the regressions below were caught by),
- the open-column navigation gate holds (every 800px-wide x-slice keeps a
  clear vertical path near the surface, mirroring `ensureOpenColumns()`),
- draw calls <= 120 and a triangle estimate <= 60,000 (counted the same way
  the shared PERF-03 environment gate counts them: walking `S.decor`'s
  drawable meshes and summing vertex-attribute counts / 3).

New public exports for the engine/selftest: `World.activeLevel()`,
`World.activeSkyTheme()`, `World.__resolveLevel`, `World.__buildLevelZones`.

## Regressions found and fixed during this pass

Two existing selftest gates broke on the first pass and were fixed before
landing (both caught by re-running `tools/selftest.mjs world` after the
initial implementation, both root-caused above):

1. **Species cap gate** (`checkSpawnSpeciesCapGate`): the first `preyWeights`
   overlay implementation APPENDED level rows onto the base zone spawn list;
   every level supplies exactly 3 preyWeights ids and every base zone already
   carries up to 3 prey rows, so appending pushed every zone to 4-7 species.
   Fixed by having the overlay REPLACE the prey portion of the spawn table
   instead (section 4 above).
2. **ATMO-01 "shelf and abyss differ in fog" gate**: the first fog
   implementation set `zone.fog = level.water.haze` verbatim for all 4
   zones, so every zone in a level shared one identical fog colour and the
   shelf-vs-abyss crossing stopped reading as a depth change. Fixed by
   deriving fog per-band (band tint lerped toward haze) instead of using the
   flat haze value directly.

## Verification

```
node --import ./tools/reg.mjs tools/selftest.mjs world game
  -> world: pass=true ok=379 fail=0   (was 210 before this pass, +169 checks:
                                        12 levels x ~14 assertions each)
  -> game:  pass=true ok=296 fail=0   (unchanged — this lane touches nothing
                                        engine3d.js/game.js own)
```

In-browser probe (`scratchpad/razorfin/levelsprobe.js`, puppeteer-core +
CDP): for each of the 12 levels — `RF.Game.profile.levels[id].unlocked =
true` (probe-only bypass of the real coin/score unlock gate, out of this
lane's scope), `RF.Game.selectLevel(id)`, `RF.Game.startRun('reef')`,
teleport the player to `y=150` (near-surface per the task), re-send the CDP
device/orientation override, `Page.captureScreenshot` into
`scratchpad/razorfin/shotsLevels/level_<id>.png`, read
`renderer.info.render.{calls,triangles}` for the budget check. All 12
resolved correctly (`resolvedLevelId === id`), all 12 stayed inside budget:

| level      | seabed   | themeId                  | draws | tris   |
|------------|----------|---------------------------|-------|--------|
| hawaii     | sand     | volcano_palms              | 70    | 42,483 |
| mexico     | rock     | cliffs_cacti_ruins         | 79    | 42,717 |
| belize     | reef     | barrier_reef_cays          | 72    | 41,777 |
| maldives   | sand     | atolls_overwater_huts      | 66    | 29,995 |
| newzealand | rock     | fjords_snow                | 75    | 43,069 |
| alaska     | ice      | glaciers_icebergs          | 74    | 19,937 |
| tahiti     | reef     | peaks_lagoon               | 73    | 32,729 |
| azores     | volcanic | volcanic_isles             | 72    | 43,473 |
| bali       | reef     | temples_rice_terraces      | 72    | 37,469 |
| aruba      | sand     | divi_trees_beach           | 68    | 43,553 |
| jamaica    | reef     | green_hills                | 72    | 42,973 |
| california | kelp     | cliffs_pier_kelp           | 76    | 42,883 |

(budgets: draws <= 120, tris <= 60,000 — every level has comfortable
headroom; `results.json` in the same directory holds the full per-level
`skyTheme`/`stats` dump.)

Screenshots were taken with the camera at `y=150` (just below the surface,
per the task brief), where the surface wash/UI HUD banner occupies most of
the visible frame — the water TINT difference between levels (e.g. Alaska's
cooler teal-gray vs Hawaii's warm sandy-teal) is clearly visible in the
captures; the full sky/silhouette layer is most visible during an actual
breach above y=0, which this probe did not additionally capture (out of the
task's explicit y=150 instruction).

Memory: `S.geoQuad`/`envOwned`/`S.matCache` disposal (LIFE-01) already
covers every new batch this lane adds — they are ordinary entries in
`S.decor` and `envOwned.{mats,geos}`, exercised by the shared teardown
selftest section unchanged.
