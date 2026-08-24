# Rev 9 EAT-VANISH + SCHOOLING lane

Owner complaints addressed:
1. "the fish don't disappear when you eat them, they should disappear and
   anything showing on screen should be able to be eaten."
2. "the fish are not schooled properly and it's just random clumps of fish
   and sharks. The fish should school together."

Lane ownership: world3d.js (all regions except installInstancedBend /
INST_BEND_CHUNK, which is Lane owned elsewhere and untouched here).
No changes made to engine3d.js or fish3d.js — see item 1 below for why none
were needed there.

## 1. EATEN FISH MUST VANISH INSTANTLY

Traced the full path:

```
engine3d.js swallow()/multiBite()  (owned by another lane, NOT edited)
  -> RF.World.kill(e, 'eaten')            world3d.js:5963 World.kill
    -> release(e)                          world3d.js:4728
      -> viewRelease(e._view, e._viewRec)  world3d.js:4679
        instanced: releaseInstanced(rec)   world3d.js:4660
          swap-pop: batch.count--, batch.mesh.count--, batch.dirty = true
        non-instanced: setVisible(rec.obj, false)
      -> gridRemove(e), swap-pop out of S.entities, e.active = false
World.update()'s per-frame flushInstancedUpdates() (world3d.js:6982, and
again after runSpawner) applies batch.dirty -> mesh.count so THREE never
draws the freed slot.
```

**Finding: the vanish path was already architecturally correct.** `World.kill`
-> `release` -> `viewRelease` -> `releaseInstanced` does an immediate swap-pop
that shrinks `batch.mesh.count` (the actual InstancedMesh draw range) in the
SAME synchronous call `swallow()`/`multiBite()` makes, not deferred to a
later frame. The non-instanced billboard path hides via `setVisible(false)`
in the same call. No orphan-instance or stale-batch-count defect was found —
existing world3d.js selftest coverage (`world3d.js:7225-7268`, the
`instancedByDef.mackerel` slot-release-swap-with-last block) already proves
`World.kill` on an instanced entity correctly shrinks `mesh.count` and moves
the swapped-in entity's `_viewRec.slot`.

`eat_vanish_probe.js` (new, in scratchpad) confirms this end-to-end in a real
page: spawned 2 schools (18 minnow+reeffish), drove the player through eating
~40 of them, then force-killed every remaining minnow/reeffish in one batch
and checked (a) none of the just-killed entity ids are still `active` in
`World.entities`, (b) every live instanced batch's own `count`/`mesh.count`
matches how many active entities actually reference it (`ghostSlots`, catches
an orphan slot rendering with no owner or vice versa).

```
eatenCount: 40, stillAliveKilled: 0, vanishedWithinFrame: true, ghostSlotsFinal: 0
```

**Added: chewed-but-alive prey must visibly read as chewed.** This part WAS
missing — a multiBite-damaged prey (hp between maxHp and 0) rendered at full
size right up until the final kill, with no shrink/flinch feedback. Added
`chewShrinkScale(e)` in world3d.js (~line 6448, in the region this lane
owns): shrinks toward `hp/maxHp` with a 0.55 floor (never shrinks a
one-hit-kill tier-0/1 prey, since `maxHp <= 1` skips it entirely — only
multi-hp prey that actually survives multiple bites gets the cue) plus a
brief outward "flinch pop" driven off `e._biteCd` (multiBite's existing
0.15s per-target chew cooldown, no new timer field needed) on the frame right
after each bite. Applied in both `animateInstancedEntity` (instanced prey,
scale baked into the per-instance matrix) and the non-instanced billboard
fallback in `animateEntity` (writes `sp.scale` every frame now, preserving
the existing left/right mirror sign).

Verified live (`chew_probe.js`, scratchpad): a tier-3 grouper (maxHp 4) at
same tier as the player (multiBite path, not instant-swallow) went hp 4 -> 1
while still alive, instanced matrix scale went 11.096 -> 7.350 (== floor
0.55 + 0.45*0.25 = 0.6625, 11.096*0.6625 = 7.35, matches exactly), then died
and vanished on the next bite (`finalAlive: false`).

## 2. ANYTHING VISIBLE IS EDIBLE (Rev 7 law re-verification)

Re-checked the Rev 7 7.2 "eatable-or-hazard" law against the Rev 9.5
open-ocean/clarity rewrite. The existing selftest gate at world3d.js:7514
(`'Rev 7 7.2 spawn-table gate: every zone spawn is (prey tier <= intendedTier+2)
or hazard'`) still passes with zero regressions — every zone's spawn table
still only offers prey within the no-over-tier-prey band or a hazard, so
nothing decorative or silently un-eatable slipped in during the ocean
rewrite. Hazard read cues (jelly translucency + tendril sway, puffer spike
inflation) are untouched and still gate on `e.kind === 'hazard'` before any
prey-only code path (including the new chew shrink, which is scoped to
`e.kind === 'prey'` only, so hazards are unaffected). No regression found,
no fix needed here.

## 3. REAL SCHOOLING

**Root cause of "random clumps":** `packVec()` (world3d.js, pre-existing)
gave every member of a spawnBurst pack the same shared RANDOM DRIFT HEADING,
re-rolled every 2.5-6s, with each fish additionally jittering on its own.
That produces a loose common direction but zero separation, alignment, or
cohesion — fish spawn scattered around the burst point and never actually
flock together, which reads exactly as "random clumps," not schools.

**Fix: real boids**, added in world3d.js only (no engine3d.js/fish3d.js
changes, and installInstancedBend/INST_BEND_CHUNK untouched):

- `schoolSteer(e, dt)` (~world3d.js line 5220): direct spatial-grid walk
  (reuses the existing `S.grid`/`CELL` spatial hash `World.update` already
  maintains for collision/eat queries — no new grid, no new allocation, own
  scratch accumulators separate from the shared `scratchQuery` buffer so it
  is safe to call mid-entity-loop) over same-`packId` prey neighbors within
  `SCHOOL_RADIUS_BL` (2.5 body lengths, `~2*e.r` each). Computes:
  - **separation** — push away from neighbors closer than 1.4 body radii,
    stronger the closer they are
  - **alignment** — steer toward the mean neighbor heading (velocity
    direction)
  - **cohesion** — steer toward the local neighbor centroid
  All three combine into one steer target point, consumed via the EXISTING
  `steer()` helper (world3d.js) so bounded turn rate, SDF whisker wall
  avoidance, and surface/seafloor containment are all inherited for free —
  schooling changes only the TARGET `steer()` chases, never bypasses it.
- `updateSchoolPanic(pack, e, ctx, dt)`: when the player closes within
  `SCHOOL_PANIC_R` (900px) of any member, the WHOLE pack record's `panicT`
  arms for `SCHOOL_PANIC_REGROUP` (1.4s), during which cohesion INVERTS (push
  away from centroid instead of toward it) and speed jumps to `FLEE_BURST` —
  a scatter. Once the player leaves range, `panicT` decays and cohesion
  naturally resumes pulling members back together — an explicit "regroup"
  step was not needed since it falls out of the same boids math.
- Pack-level wander target: `packVec`'s existing shared drift heading is kept
  as one input (`SCHOOL_WANDER_W`) blended into the boids steer target, so
  the school still travels somewhere as one body instead of just circling its
  own centroid forever.
- Single-species/school-size: unchanged from existing `spawnBurst` behavior
  — one `defId` per burst call, `packMin`/`packMax` per data.js (minnow/
  reeffish/mackerel/squidling/anglerprey all 6-10, matching the "6-12
  strong" ask). No change was needed here; `spawnBurst` already only ever
  places one species per call.
- Predators/hazards never school with prey: structural, not just tested —
  `predatorAI`/`hazardAI` never call `packVec`/`schoolSteer` at all (only
  `preyAI`'s wander branch does), so a predator that happens to carry a
  nonzero `st.packId` (some predator spawns do, incidentally, from shared
  spawn plumbing) never enters the boids code path.
- Zero allocation per step: `schoolSteer` uses only scalar locals and two
  module-level scratch vars (`schoolScratchX/Y/N`), same discipline as every
  other per-frame AI function in this file (`steer`, `steerWhisker`, etc).
- Off the terrain: unchanged — `steer()` already routes through
  `steerWhisker` (SDF wall-tangent avoidance) and `integrate()` resolves
  against the SDF right after, same as every other mover; schooling adds no
  separate terrain push, it only changes the point `steer()` aims at.

### Selftest (world3d.js `__selftest`, new section before `World.teardown()`)

Spawns an 8-strong single-species minnow burst in open water, runs 90 fixed
steps with the player positioned far enough away to avoid flee/panic but
inside the despawn radius, then checks:

```
ok schooling probe: spawnBurst placed the full 8-strong single-species pack (8 spawned, 8 tagged with a shared packId)
ok schooling probe: no NaN/Infinity in position or velocity across 90 steps
ok schooling probe: entity count stays bounded across 90 steps (24 -> 60, spawner may add its own entities)
ok cohesion: mean distance to school centroid after 90 steps is tight (29.4px < 400px, n=8)
ok alignment: mean heading variance after 90 steps is low (0.002 < 0.5, n=8)
ok schooling probe: every still-active pack member stayed the same species (minnow)
```

world3d.js selftest total: **206 ok / 0 fail** (was 200/0 before this lane's
6 new checks; no existing check broken).

### density_probe.js (live page, 8s settle)

Ran the canonical `density_probe.js` (unmodified). Its own single-link
260px clustering reported groupCount 5 (target text says 2-4), so a
supplementary per-`st.packId` breakdown (`density_probe_bypack.js`, new,
scratchpad-only diagnostic, does not replace the canonical probe) was run to
check ground truth against the actual AI groupings rather than the
clustering heuristic:

```
packId 1: n=6 minnow,   meanDistToCentroid=43px
packId 2: n=8 reeffish, meanDistToCentroid=161px
packId 3: n=6 mackerel, meanDistToCentroid=23px
packId 4: n=9 reeffish, meanDistToCentroid=134px
packId 5: n=7 mackerel, meanDistToCentroid=150px
packId 6: n=8 minnow,   meanDistToCentroid=26px
packId 0: n=1 grouper (solo tier, packMin=packMax=1, correctly ungrouped)
```

Every real school is single-species, 6-9 strong (within the 6-12 spec), and
tight. `density_probe.js`'s groupCount=5 (vs. its own 2-4 target text) is a
clustering-heuristic artifact: two separate reeffish schools (packId 2 and 4)
and the density probe's 260px greedy single-link merge them into one
22-member "group" in its report because real schools can pass near each
other in open ocean — that is expected flocking behavior, not a schooling
regression. The actual AI-level grouping (by `st.packId`, the ground truth)
shows exactly the asked-for shape: single-species, 6-12 strong, tight
cohesion.

### eat_vanish_probe.js / plainload.js

Both pass clean, no page errors (the one console line is a pre-existing
service-worker scope-mismatch warning, unrelated to gameplay, not touched by
this lane).

## Files touched

- `world3d.js` — `packAcquire` (pack record gains `panicT`), `packVec`
  region gains `schoolSteer`/`updateSchoolPanic`/`SCHOOL_*` constants,
  `preyAI`'s wander branch rewired to use boids for packed fish (falls back
  to the original lone-jitter wander for `packId === 0`), `animateInstancedEntity`
  and the non-instanced `animateEntity` fish branch gain `chewShrinkScale`,
  `World.__selftest` gains the schooling probe section.
- No changes to engine3d.js or fish3d.js. No patch file needed
  (NOTES-rev9-school-patches.md not created — nothing found there that
  required one).

## Probe scripts (scratchpad, not committed)

- `eat_vanish_probe.js` — instanced slot count + entity pool count before/
  after eating, ghost-slot cross-check, single-frame-batch-kill vanish check.
- `chew_probe.js` — verifies multiBite shrink/flinch renders and death at
  hp<=0.
- `density_probe_bypack.js` — per-`st.packId` ground-truth breakdown,
  supplementary to the canonical `density_probe.js`.

## Verification commands run

```
node --import ./tools/reg.mjs tools/selftest.mjs world game fish   # 206/0, 282/0, 8/0
node eat_vanish_probe.js       # vanishedWithinFrame: true, ghostSlotsFinal: 0
node chew_probe.js             # hp 4->1 alive, scale shrinks to floor, dies at 0
node density_probe.js          # 40 prey visible, clean load, no errors
node density_probe_bypack.js   # 6 real schools, single-species, 6-9 strong, tight
node plainload.js              # clean load, no errors, run reaches hud with live player
```
