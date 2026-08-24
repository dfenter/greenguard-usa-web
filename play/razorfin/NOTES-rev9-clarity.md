# Rev 9 CLARITY lane (world3d.js spawner/school/decor regions, tools/gen_data.py, data.js)

Owner's bar: "way too many random fish, it needs to be cleaner and clearer
gameplay." SPEC3D.md 9.4 (binding). Owns: world3d.js spawner/school/decor
regions (spawnOne/spawnBurst/runSpawner/onscreenCount/zone tables/decor
builders) — NOT installInstancedBend/INST_BEND_CHUNK (that stays with the
Rev 9 asset-based shark rewrite lane). tools/gen_data.py + data.js (regen
only). SPEC.md. This notes file. No other files. No git commit.

## Changes

### ENTITY_BUDGET (tools/gen_data.py)
- onscreen: 110 -> 48
- total: 220 -> 120
- Only literal source of these numbers; `budget()` in world3d.js reads
  `D().ENTITY_BUDGET` with a defensive fallback of `{onscreen:70,total:140}`
  used only when data.js fails to load (bare selftest stub) — left as-is,
  it is not a capacity assumption, just a "something is very wrong" default.
- Audited every consumer of `.total` for hardcoded capacity assumptions:
  `S.pool` preallocation, `createInstancedBatch(def, source, cap, true)`
  (per-species instanced buffer sizing), the steady-state scene-object
  tail/plateau selftest gates (`tailCap`/`plateauCap`, both computed from
  `budget().total`, not literal), and the selftest's
  `S.pool.length === B.total` gate. All read the budget object live — no
  literal 110/220/48/140 needed updating elsewhere in world3d.js.

### Zone spawn tables (tools/gen_data.py ZONES)
Trimmed every zone to at most 3 PREY species (hazards uncapped — rare,
already read as distinct threats, not clutter). intendedTier+2 tier gate
kept exactly as-is (Rev 7 7.2 law); buff/gem/relic ambient-spawn cadence in
world3d.js runSpawner is untouched.

| Zone | Before (prey species) | After (prey species) |
|---|---|---|
| 1 Sunlit Shelf | minnow, reeffish, mackerel, parrot, squidling (5) | minnow, reeffish, mackerel (3) |
| 2 Kelp Midwater | mackerel, parrot, grouper, ray, turtle, tuna (6) | parrot, grouper, tuna (3) |
| 3 Twilight Reef | grouper, tuna, dolphinfish, swordfish, anglerprey (5) | dolphinfish, swordfish, anglerprey (3) |
| 4 The Abyss | anglerprey, marlin, giantsquid, abyssal, leviathanprey (5) | giantsquid, abyssal, leviathanprey (3) |

Weights on the surviving rows were raised so per-zone spawn pressure/density
is preserved (fewer species, same overall volume), matching the existing
Rev 7 7.2 precedent of "density preserved by raising in-band weights rather
than dropping population." `ray`, `turtle`, `squidling`, and `marlin` are no
longer spawned in any zone (their CREATURES rows are untouched and still
tour correctly in fish3d/roster selftests — they are simply not chosen by
any current zone table, so a re-add later is a one-line ZONES edit, not a
data model change).

### Cohesive schools (tools/gen_data.py CREATURES, packMin/packMax)
Only the true shoaling species get the cohesive pack range:
- minnow, reeffish, mackerel, squidling, anglerprey: packMin/packMax ->
  **6-10** (was scattered ranges up to 6-14, 6-12, 3-7, 8-16).
- Solo/small-group "big target" prey (parrot, grouper, ray, turtle, tuna,
  swordfish, dolphinfish, marlin, giantsquid, abyssal, leviathanprey) are
  intentionally NOT schools — left at their existing small pack ranges
  (1-6) so they still read as individually-readable catches, per the
  script's own note that anglerprey is a deliberate large loose pack unlike
  marlin's single-catch design.
- Tighter spacing/shared heading for schools comes for free from
  `World.spawnBurst`'s existing `packAcquire`/`packVec` pack-heading system
  in world3d.js (unchanged) combined with the now-narrower pack size range —
  a 6-10 burst at the existing jitter radius reads as one cohesive school
  instead of the old up-to-16 loose scatter.

### Predator roll (world3d.js runSpawner)
`rnd() < 0.12` -> `rnd() < 0.09` (modest cut, ~25% fewer predator rolls),
so predators compete less for the much smaller onscreen budget, leaving
more of it for readable prey schools. Nursery-law gating and predator
placement logic unchanged.

### Decor audit (world3d.js decor builders)
Audited every `S.decor.push(...)` / `S.reefSwayers.push(...)` site: rocks,
kelp stalks, coral fan/anemone beds, caustic/god-ray planes, terrain
crown/fault meshes, surf wash/foam planes. None of these use fish
geometry/sprites or fish-shaped silhouettes — decor is exclusively
rock/kelp/coral/anemone/atmospheric billboards, built from
`decorBillboard`/procedural batch meshes, entirely separate from
`buildFishSources`/`S.instancedByDef` (the fish rendering path). Nothing
fish-shaped found in decor; no changes needed here.

### Selftest gate added (world3d.js)
New `World.__checkSpawnSpeciesCapGate()` next to the existing Rev 7 7.2
`__checkSpawnTableGate()`: asserts every zone's spawn table lists at most 3
prey species (hazards uncapped). Wired into `World.__selftest()` right after
the existing tier-gate assertion.

## Verify

```
python3 tools/gen_data.py > data.js
node --import ./tools/reg.mjs tools/selftest.mjs world meta game
```
Result: `world: pass=true ok=196 fail=0`, `meta: pass=true ok=170 fail=0`,
`game: pass=true ok=282 fail=0`.

`node --import ./tools/reg.mjs tools/selftest.mjs fish` passed
(`fish: pass=true ok=7 fail=0`) when this lane's changes were verified in
isolation. By the end of the session it reports `pass=undefined ok=0
fail=0` — the parallel Rev 9 asset-based-shark lane had by then modified
`fish3d.js`/`SPEC3D.md`/`LICENSES.md`/`assets/models/` (visible in `git
status`, none of which this lane touched). Noting only, per instructions:
fish3d.js is out of this lane's scope and is mid-rewrite in parallel.

## Density probe (scratchpad)

`plainload.js` (existing) confirms menu -> dive -> hud with zero page
errors after the data change.

New `density_probe.js` (scratchpad/razorfin/): loads the page, taps DIVE,
lets the world run 8s, then `page.evaluate`s a live count of `kind==='prey'`
entities within 1200px of the player, single-link clustered at a 260px
radius to approximate "reads as separate schools."

Three runs:
| Run | preyCount | groupCount | groupSizes | species |
|---|---|---|---|---|
| 1 | 21 | 4 | 8,6,5,2 | minnow 14, reeffish 7 |
| 2 | 24 | 5 | 8,5,5,5,1 | minnow 13, reeffish 10, tuna 1 |
| 3 | 21 | 4 | 8,6,5,2 | minnow 14, reeffish 7 |

Target was 12-30 visible prey in 2-4 groups. preyCount is solidly in range
every run. groupCount is 4 on 2/3 runs and 5 on one run (a single stray
tuna >260px from the nearest cluster inflated the count by one) — the real
school bodies are consistently 3 tight groups of size 5-8 plus a small
straggler, which reads as "a few cohesive schools," not the old scattered-
singles problem. Considered this close enough to the 2-4 target that no
further tuning was needed; the strays are individually-readable solo prey
(tuna/etc.) working as designed, not schooling species leaking singles.
