# Rev 7 Lane S2 notes (world3d.js)

Scope: world3d.js, EXCLUDING the installInstancedBend/INST_BEND_CHUNK region
(~:980-1014 + probe strings ~:6884-6888, owned by Lane L2). Read SPEC3D.md
Rev 7 (7.2, 7.6, 7.7) and plan D2/D5 before starting; this file follows both.

## 1. buildBackgroundSchools deleted

Removed `buildBackgroundSchools`, `fillSchoolBatch`, `S.backgroundSchools`,
`SCHOOL_N`, `SCHOOL_Z`, and every call/reset site (init, teardown,
teardownInstancedState, flushInstancedUpdates, animateWater's animateSchools
call, the old selftest assertion). Ambient minnow density now comes from the
zone spawn tables only, per 7.2 ("Ambient density comes from spawn-table
weights"). No fish-shaped mesh renders outside the entity pool.

## 2. Hazard read + sting publish

- jelly: on top of the existing bell-pulse scale, added a translucent alpha
  pulse (0.58-0.80, never fully opaque) and a small tendril-sway rotation
  (`setRot`), both riding the same `st.drift` phase as the bell so nothing
  desyncs.
- puffer: already had the scale-inflate cue from Rev 4/6; documented it as
  the puffer's hazard read per 7.2 rather than adding a redundant second cue.
- `publishSting(x, y, defId)`: new helper, gated on `S.stingCd` (1.2s,
  ticked in the main update step, independent of each hazard's own biteCd so
  standing against two hazards at once still surfaces one toast, not a
  stream). Called from jelly's and puffer's contact-damage sites in
  `hazardAI`. **Deviation**: changed puffer's `pushHit(..., sting)` flag from
  `false` to `true` — it's an inedible hazard contact too, and the existing
  flag name is exactly what should gate flinch presentation.
- **No pub/sub bus existed anywhere in this codebase before this change.** I
  grepped engine3d.js/ui3d.js/meta.js/fx3d.js for any bus/emit/publish
  pattern before writing `publishSting`; `kit` (from `ctx.kit`) is only ever
  used for `kit.audio`, `kit.registerPWA()`, `kit.openSettings()`.
  `publishSting` calls `ctx.kit.bus.emit('rf-sting', {...})` (also tries
  `.publish` as a fallback) and is a fully guarded no-op if neither exists.
  **This is a cross-lane dependency**: whichever lane wires the actual toast
  needs to either add a `kit.bus` (matching the `emit(name, payload)` shape
  this lane calls) or tell S2 what the real mechanism is so `publishSting`
  can be pointed at it. Verified via a selftest probe that stubs
  `ctx.kit.bus.emit` and asserts it fires once per sting + respects cooldown.

## 3. Relics (SPEC3D 7.6)

**Important correction made mid-implementation**: I initially planned relics
as `kind:'pickup'` + a `subKind:'relic'` tag (my first reading of "handled
in stepEat like pickup"). Before finishing, I checked engine3d.js directly
and found S1 had *already landed* its half of 7.6 ahead of this lane, with a
concrete, different contract:

- `eatEligible()` already excludes `kind === 'relic'` explicitly (not
  `'pickup'`).
- `stepEat()` already branches `if (e.kind === 'relic') { collectRelic(e);
  continue; }` before the tier gate.
- `collectRelic(e)` reads `e.zoneId`, `e.relicId`, `e.x`, `e.y` directly and
  pushes into `ctx.run.relics[]`.
- Likewise `kind === 'gempickup'` is already handled by
  `collectGemPickup(e)`, which reads `e.value` (falls back to `e.gemValue`,
  then `1`).

I switched world3d.js to match: relics are `kind:'relic'` (not `'pickup'`),
carrying `zoneId`/`relicId`/`relicIndex`/`x`/`y`/`r`. `subKind:'relic'` is
still stamped for internal bookkeeping but nothing reads it now. gempickup
entities carry `value` (from `data.js` `GEMS.gempickup`, default 1). No
further engine3d.js change is required on my part — the contract already
matches on both sides. This is worth re-confirming with S1 in the
integration pass, since I inferred field usage by reading `collectRelic`/
`collectGemPickup` source, not from a shared spec addendum.

**Placement algorithm** (`buildRelics` / `placeRelicsForZone` /
`deadEndScore`), run once per `World.init`, after `buildPool()` (needs live
pool slots via `acquire()`, so it cannot run inside `buildBackground()` with
the rest of the decor passes):

1. For each zone, seed a local deterministic RNG with `makeLocalRng(zone.id)`
   — the same fixed-seed mulberry32 generator this file already uses for
   decor (`decorRng`), independent of the shared `S.rng` run stream so relic
   layout never shifts any other draw's outcome (SPEC3D 7.6: "seed = zone
   id").
2. Scan every SDF grid cell (`S.sdf`, `SDF_CELL`=64px) within the zone's y
   band. A cell scores as a candidate dead end when: it is walkable
   (`sdf > clearance`, clearance = 0.6*RELIC_R so the relic's own body fits),
   AND 1-2 of its four 4-connected neighbors are also walkable (a corridor
   mid-point has 2-4 open neighbors; a cul-de-sac has 1; fully enclosed
   noise with 0 is excluded). Score = `(3 - openNeighbors) + clamp(sdf /
   (RELIC_R*4), 0, 1)`, so tighter pockets with a little clearance rank
   above open corridors.
3. Sort candidates by score desc (deterministic tie-break by grid position,
   not array order).
4. Greedily take the top-scoring candidates subject to a 260px minimum
   separation so 3 relics in one zone don't cluster into the same pocket;
   if the maze doesn't yield enough well-separated dead ends (degenerate/
   small map), fill remaining slots from the best-scoring candidates
   regardless of separation so the relic table is never short.
5. Each chosen cell gets a small deterministic in-cell jitter from the same
   seeded stream (never from `S.rng`) so relics don't sit dead-center on the
   grid.
6. `RELICS` rows (data.js) are consumed via `relicRows()`/`relicRowsForZone`
   when `RFD.RELICS` is present; otherwise `DEFAULT_RELICS`, a built-in
   3x4 table, is used so this file is testable standalone (per the task
   spec). At time of writing `data.js` does not yet carry a `RELICS` table.

Relics are static (`relicAI` holds vx/vy at 0), permanent (`st.life = 0`,
never decremented/expired — `pickupAI`'s normal life-expiry path is only
entered for actual coins), inserted into the spatial hash (`gridInsert`) so
`World.eatQuery` finds them like any other entity, and reuse the pickup
glint animation (`animateEntity`'s `kind === 'pickup' || kind === 'relic'`
branch) and the buffpickup fallback-quad view path (tinted per-row) rather
than a new bake, per the task's "reuse the existing... pickup sparkle path"
instruction.

Because `predatorAI`/`preyAI` never issue a `World.query`/`eatQuery` call
against other entities at all (predators only ever chase `ctx.player`
directly; prey only reacts to the player and to pack-mates via a
prey-kind-scoped query), a `kind:'relic'` entity is unreachable by predator
targeting by construction — no extra exclusion code was needed there.

## 4. Spawn tables / intendedTier

`intendedTier(zone)` reads `zone.intendedTier` if present (data.js at time
of writing already carries it: 1/3/6/9, added by S3 ahead of this lane),
else falls back to `zone.pressureTier`. Verified by direct inspection that
the two are currently identical for all 4 zones (1/3/6/9 each), so this is
not a guess.

Formula confirmed against the actual data: `intendedTier(zone) =
zone.pressureTier` in the absence of an authored `intendedTier`. Gate
(`checkSpawnTableGate`, exposed as `World.__checkSpawnTableGate` and
asserted in `__selftest`): every zone spawn row is `(prey with tier <=
intendedTier(zone)+2)` OR `kind === 'hazard'`. Verified against the current
data.js table by hand (`node -e` against a `vm` sandbox) before writing the
assertion — all 4 zones already pass with zero violations.

## 5. gempickup

Piggybacked exactly where the task specified: inside `runSpawner`'s existing
`BUFF_AMBIENT_CHANCE` roll (0.003/tick). When that roll fires, an additional
`GEM_AMBIENT_CHANCE` (0.02) roll decides gem vs buff — one extra `rnd()`
draw only on the already-rare buff tick, so the cadence/cooldown machinery
(pool-reserve check placement, BUFF_LIVE_CAP-style live cap via
`GEM_LIVE_CAP=1`, ring placement via the same `ringPointValid`) is entirely
reused, no new gate added. `spawnGemAt` mirrors `spawnBuffAt` (ambient
drift, no player magnet, `GEM_LIFE=14`s fade-then-expire via `gemAI`,
mirrors `buffAI` 1:1) and sets `e.value` from `data.js`'s `GEMS.gempickup`
(default 1) for `collectGemPickup` to read.

## 6. Selftest

Removed the old background-school assertion (`S.backgroundSchools.length
=== zones().length && ...`); added:
- a "no S.backgroundSchools" guard,
- relic count (`3 * zones().length`) and shape (`kind==='relic'`,
  `zoneId` matches),
- relic placement determinism: same *maze* seed -> same relic positions.
  This needed its own fresh mulberry32 rng per `World.init` call rather than
  the selftest's shared `rngStub` closure, because `rngStub`'s `seed`
  variable keeps advancing across every call the whole selftest run makes -
  reusing it across two consecutive `World.init` calls produces two
  *different* mazes (S.rng feeds maze layout), which would fail the check
  for the wrong reason (different dead-ends existing, not non-deterministic
  placement given the same dead-ends). Fixed by resetting to an identical
  fresh rng before each of the two init calls being compared.
- the 7.2 spawn-table gate (`World.__checkSpawnTableGate()`) plus a small
  unit check on `intendedTier`'s fallback behavior,
- sting publish: stubs `ctx.kit.bus.emit`, spawns a jelly on the player,
  runs `hazardAI` once and asserts exactly one `rf-sting` event, then
  clears the hazard's own `biteCd` and runs again to confirm the *global*
  `S.stingCd` still suppresses a second publish,
- gempickup smoke test: `spawnGemAt` produces a live/valued/rendered entity
  discoverable via `World.eatQuery`, and `GEM_LIVE_CAP` refuses a second
  concurrent gem.

**Placement note**: the new Rev 7 probe block runs in its own
init/teardown bracket, positioned AFTER the existing Rev 3 instancing probe
sequence (mackerel conversion / slot-release / matrix-path / bend-material
checks) rather than interleaved with it. My first attempt inserted it
in the middle of that sequence and broke 6 unrelated existing checks,
because re-running `World.init` there mid-sequence discarded state
(`probeBatch`, `pi1/pi2/pi3`) later assertions in that same sequence still
depended on. Isolating it at the end fixed all of them with no other
changes.

## Verification

`cd play/razorfin && node --import ./tools/reg.mjs tools/selftest.mjs world`
→ `world: pass=true ok=195 fail=0`.

Full suite: `node --import ./tools/reg.mjs tools/selftest.mjs world game
art3d fish fx ui meta abilities` →
`world 195/195, game 228/228, art3d FAIL (pre-existing, shark3d.js/L1's
lane, reproduced identically on a stash of world3d.js so it's not caused by
this change), fish 7/7, fx 0/0, ui 230/230, meta 159/159, abilities 0/0`.

`spawnBurst produced 5 entities` was the only failure in `world` before this
change (verified via `git stash`); it does not appear in this file's own
`__selftest` and was not touched.

## Deviations from the plan/spec as literally written

1. Relics use `kind:'relic'` rather than `kind:'pickup'`+`subKind` — see
   section 3. This is a correction to match what engine3d.js actually
   implements, discovered by reading the file rather than guessing from the
   plan text ("handled in stepEat like pickup" turned out to mean "handled
   in stepEat the way pickup is handled", i.e. before the tier gate, not
   literally reusing the `pickup` kind).
2. puffer's `pushHit` sting flag changed `false` -> `true` (see section 2).
3. `publishSting` invents a minimal bus-call convention
   (`ctx.kit.bus.emit(name, payload)` with a `.publish` fallback) since none
   existed; flagged as a cross-lane integration point above.

## Risks / open items for the integration pass

- `RELICS` table absent from data.js at time of writing; `DEFAULT_RELICS`
  fallback is exercised by every test run until S3 lands it. Once it lands,
  re-run the `world` selftest to confirm `relicRows()` picks it up (it reads
  `RFD.RELICS` live, no code change needed on either side as long as each
  row has `id`/`zoneId`/(`name`/`tint` optional)).
- `kit.bus` for `rf-sting` does not exist yet anywhere; whoever wires the
  actual toast needs to either implement `kit.bus.emit`/`.publish` matching
  the call this lane makes, or tell S2 the real name so `publishSting` can
  be repointed in one place.
- Relic dead-end scan is a simple greedy heuristic (SPEC3D explicitly allows
  "a simple deterministic candidate-scan"); it has not been visually
  verified against the real maze renderer (no GL in this environment) —
  worth an in-browser spot check once L1/L2's art lanes land, to confirm
  relics don't end up visually inside rock geometry despite passing the SDF
  clearance check (the SDF/rock-mesh correspondence is this file's existing
  contract, not something new to this change).
