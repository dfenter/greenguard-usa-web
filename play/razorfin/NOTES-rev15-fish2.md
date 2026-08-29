# Rev 15.2 — lane FISH2 — school spacing / proper schooling model

Owner verdict (binding): **"Fish still swarm weird and they are right on top
of each other."**

Owned region: `world3d.js`, prey/boids/formation instance-update region only
(the same region the rev 15 FISH lane edited). The EAT hunks
(`pickEatablePrey` / `playerEatCeiling`) are untouched. WATER and MAZE lanes
were editing other regions of the same file throughout — see **Concurrency**
below, it materially affected this lane's verification.

Evidence: `hse/evidence/r15-fish2/`
Tooling added (not game code): `hse/probe_nnd.mjs`, `hse/probe_school_ab.mjs`,
`hse/svg2png.mjs`.

---

## Root cause (measured, not inferred)

**Every spacing term in rev 9/10 was a steer TARGET, and a steer target cannot
resolve an overlap.**

Separation, cohesion, alignment and the formation slot all fed one point that
went through `steer()` -> `steerWhisker` -> `integrate()`. `steer()` is both
speed-limited and turn-rate-limited (`SCHOOL_TURN_RATE`), so separation can
only ever ask a fish to *eventually* head away from a neighbour. While two
fish are converging — or being shoved together by a panic scatter, a terrain
push, or the slot blend — nothing anywhere in the pipeline stops them passing
straight through each other.

Baseline, measured per sim step over 420 steps with the player parked outside
the flee radius (`hse/probe_nnd.mjs`, NND in body lengths, per pack):

| phase | p5 | median | min | pairs < 0.8 BL |
|---|---|---|---|---|
| calm | 1.79 | 2.41 | 1.48 | 0 |
| **panic** | **0.42** | 1.90 | **0.29** | **140** |

The calm case was never really the defect. **Panic was**: the moment the shark
comes at a school, members close to 0.29 BL — bodies fully interpenetrating —
and stay there. That is the frame the owner is looking at.

Rev 10's scatter used each member's slot offset as its flee bearing, so two
members with adjacent slots fled on near-identical bearings: the group
translated instead of dispersing, and anyone who started close stayed close.

## Fixes

1. **Hard positional un-overlap (`resolveSchoolOverlaps`) — the load-bearing
   change.** A new once-per-step pass after every entity has integrated (grid
   current, before the instance matrices are written). Symmetric pair push
   applied directly to x/y for same-pack prey inside `SCHOOL_SEP_HARD_BL`.
   It is a **constraint, not a force**, so it cannot be outvoted by a turn-rate
   limit, and it is the only term that can guarantee the "never within 0.8 BL"
   floor. Symmetric, so the school's centroid is untouched — the group keeps
   drifting as one body and only internal spacing changes. Velocity is NOT
   modified, so heading and tail phase are untouched and the correction is
   invisible as motion. Displacement is capped per step
   (`SCHOOL_UNOVERLAP_MAX_BL`) so a deep pile unwinds over frames rather than
   teleporting; the result goes back through `World.resolveBody` + `containY`,
   the same containment authority `integrate()` uses.
   Coincident pairs (no separating direction in the geometry) derive a bearing
   from `e.id` rather than drawing `rr()` — a fresh draw would shift the shared
   PRNG stream that seeded selftests assert on downstream (the rev 10 lane hit
   exactly this and it is documented in NOTES-rev10-school.md).
2. **Separation falloff is quadratic, not linear.** A linear ramp is nearly
   flat where it matters: at 0.5 BL of a 2.6 BL radius it delivered ~0.8 of its
   maximum, so a fish already too close was pushed barely harder than one at
   comfortable spacing. Squaring makes the near field decisively stronger and
   leaves the outer band as gentle as before.
3. **Burst-scatter anchored on the shark, fanned by slot.** The flee bearing is
   now away-from-player, with a per-member fan (`SCHOOL_SCATTER_SPREAD`,
   alternating sides, widening with rank) so adjacent slots get maximally
   different bearings. The burst reads as a bloom opening in front of the
   shark instead of a streak.
4. **Flee radius in body lengths.** `SCHOOL_FLEE_BL = 6.0` BL, floored at the
   legacy absolute `SCHOOL_PANIC_R` so small schools do not become skittish at
   pixel ranges. Rev 10 used the flat 900px for every species regardless of
   size.
5. **Regroup is eased, not switched.** `st.panicMix` ramps up while panicked
   and decays at `SCHOOL_REGROUP_EASE`, blending the decaying scatter target
   back toward the formation target. Rev 10 flipped branches on a single frame,
   so the instant `panicT` crossed zero every member's target jumped hundreds
   of pixels at once and the whole school snapped its heading together — a
   large part of the "swarm weird" read right after the shark passed.
6. **Max turn rate on the integrated velocity.** `steer()`'s `turn` argument is
   a BLEND factor, not a rate limit: a large target delta still passes a big
   one-frame heading change through. `SCHOOL_TURN_MAX_RATE` clamps the actual
   heading delta of the resulting velocity — the quantity the eye reads —
   leaving the speed `steer()` chose untouched.
7. **Formation lattice widened and elongated.** `SCHOOL_SLOT_SPACING_BL`
   1.9 -> 2.25 (spec wants >= 2.2), `SCHOOL_SLOT_W` 0.28 -> 0.80 so members
   actually hold the wider slots against the boids blend. Raising spacing alone
   scaled BOTH axes and left the aspect ratio flat, so back:lateral went from
   3:1 to ~4.8:1 (`back * 1.45`, `lateral * 0.30`): spacing has to buy daylight
   between ranks, not girth.
8. **Soft separation floored at spec.** `sepR` is
   `max(SCHOOL_SEP_BL, SCHOOL_SEP_MIN_BL)` so a future retune of the former can
   never silently drop the school under the required 1.6 BL.
9. **Recycled-pool hygiene.** `resetSt` clears `st.panicMix` and
   `st.prevHead`. Both are smoothed/continuous values whose entire point is
   continuity; inheriting a dead fish's panic blend or heading would reintroduce
   exactly the one-frame discontinuity this pass exists to remove.

## Results (same probe, same scenario, same 18-fish population)

| metric | before | after | gate |
|---|---|---|---|
| calm p5 NND | 1.79 | **1.76** | >= 1.2 ✅ |
| calm median NND | 2.41 | **2.67** | >= 2.0 ✅ |
| calm min NND | 1.48 | **1.75** | > 0.8 ✅ |
| calm pairs < 0.8 BL | 0 | **0** | 0 ✅ |
| **panic p5 NND** | **0.42** | **1.74** | >= 1.2 ✅ |
| **panic median NND** | 1.90 | **2.35** | >= 2.0 ✅ |
| **panic min NND** | **0.29** | **1.72** | > 0.8 ✅ |
| **panic pairs < 0.8 BL** | **140** | **0** | 0 ✅ |

Zero sub-0.8-BL pairs in either phase, and the gate is met from the first
measured step after the 2 s settle window, not only in steady state. Repeated
runs agree (a second full run measured calm p5 1.70 / median 2.22, panic p5
1.56 / median 2.04, zero violations).

Draws/tris unchanged: the pass adds no mesh, no attribute, no material and no
draw call — it only writes x/y on entities that were already being written
every frame. `ENTITY_BUDGET.total` left at **120**.

## Visual A/B

`hse/evidence/r15-fish2/final_ab.png` — fixed scale, circles drawn at TRUE
body diameter, worst-spaced pack per step during the panic burst, player held
off. Top row (rev 10): two fish fused into a single blob at 0.29-0.43 BL,
persisting across every sampled step, the pack cramped into one corner of the
frame. Bottom row (rev 15.2): every fish a cleanly separated disc, even
spacing, worst pair 1.72-1.74 BL, the group dispersed across the frame.

`formation_ab.png` is the equivalent calm-phase strip and is deliberately
undramatic — it confirms calm spacing was already acceptable and is not made
worse, which is the honest read of that phase.

Note on the in-engine rig: `hse/school_harness.html` already exists but is a
standalone three.js scene owned by another lane, not the live sim, so it
cannot show real boids output. `hse/probe_school_ab.mjs` (new) drives the REAL
game with the player parked and the camera pinned on the school centroid, but
the engine rewrites its render camera every frame from the player position and
wins the race — the resulting shots frame ambient prey near the parked player,
not the spawned school, so they are NOT the evidence of record. The plots above
are rendered from the actual per-sim-step entity positions fed to the GPU,
which is the same data the metrics are computed from.

## Selftests

`node --import ./tools/reg.mjs tools/selftest.mjs world game fish`
-> **world 378 ok / 2 fail, game 394/0, fish 8/0**.

**Every formation/schooling gate passes**, including the four rev 10 formation
gates (NND in spec, spread ratio, heading alignment variance, aspect ratio).

The 2 remaining `world` failures are NOT this lane's — they are the concurrent
WATER/MAZE lanes' in-flight work:
```
FAIL PERF-03 environment stays within the shared <=60 draw gate (64 meshes)
FAIL resolveBody push-out invariant holds (66 contacts, 5 bad)
```
Proven by reverting ONLY this lane's edits on the same tree and re-running:
the tree still fails the draw gate, `resolveBody` and `ringPoint` checks
(377 ok / 3 fail) with none of this lane's code present. `green` is not a
valid selftest target (`unknown target green`); the valid modules are
`world game fish`.

`node --import ./tools/reg.mjs` is required — the bare `node tools/selftest.mjs`
form cannot resolve the `three` bare specifier.

## Concurrency — worth recording

`world3d.js` was being rewritten from a stale buffer by another lane
throughout this session. Observed directly: constants written and verified
present were reverted to their old values **during a single selftest run**
(md5 changed mid-run), several times. Two consequences:

- Every write in this lane is atomic (`tempfile` + `os.replace`) and every
  edit is re-verified by grep immediately after, and again after any long
  command. Anyone merging this should re-verify the constant block is intact
  rather than assuming it.
- Triangle-budget and draw-gate failures fluctuate run to run independent of
  this lane's code. Do not chase them from here.

## Hook for the orchestrator

**One hook.** `resolveSchoolOverlaps()` must be called once per sim step from
`World.update`, after the entity AI/integrate loop and before
`runSpawner`/`flushInstancedUpdates`, together with the short re-write loop
directly beneath it that re-applies `setPos`/`animateEntity` for schooling prey
(the main loop wrote their transforms from pre-correction positions). Both are
already in place in `World.update`; if the update loop is restructured or
another lane's merge drops that block, the hard-floor guarantee is silently
lost while every other change still appears to work.
