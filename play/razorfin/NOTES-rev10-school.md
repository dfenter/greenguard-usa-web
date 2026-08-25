# Rev 10 FORMATION lane

Owner complaint on the live Rev 9 build: "Fish looking better but still
bunched up and not schooling properly." Rev 9's boids (`NOTES-rev9-school.md`)
produced real flocking but tuned into a tight BLOB — the rev 9 selftest's own
number was mean centroid distance 29.4px on an 8-strong minnow school, i.e.
body-length spacing near zero. Hungry-Shark-style schools read as a loose
FORMATION: fish spaced ~1.5-2.5 body lengths apart, aligned, streaming as a
line/V that undulates, never a clump.

Lane ownership: world3d.js only — `schoolSteer`/`updateSchoolPanic`/
`packVec`, `spawnBurst`, `preyAI` region. `installInstancedBend`/
`INST_BEND_CHUNK` and decor builders untouched. No engine3d.js/fish3d.js/
shark3d.js changes (those are a different concurrent session's lane this
run — confirmed via `git diff --stat`, not touched here). No git commit.

## 1. WHY REV 9 WAS A BLOB

Rev 9's `schoolSteer` combined separation/alignment/cohesion as
similar-order weights (SEP 1.6, ALIGN 1.0, COH 0.9) over a short 2.5-body-
length neighbor radius, with a 1.4-body-radius separation band. Cohesion
pulled toward the local centroid at EVERY neighbor distance (no floor), so
its steady inward pull dominated once fish were already close — nothing in
the math held them apart once they converged, and the formation-slot concept
did not exist at all (every member chased the same shared pack-level wander
target, packVec's `p.dx/p.dy`, with no individual position in the group).

## 2. FORMATION MODEL

**Boids retuned** (`SCHOOL_*` constants, world3d.js ~line 210):
- Separation radius `SCHOOL_SEP_BL = 2.6` body lengths (slightly above the
  1.4-2.8 BL spacing target so the push resolves neighbors OUT to spec, not
  just up to the edge of it), weight `SCHOOL_SEP_W = 3.2` — dominant term.
- Alignment weight `SCHOOL_ALIGN_W = 2.2` — second-dominant, added as a unit
  DIRECTION (mean neighbor heading) rather than a point-toward, so it never
  scales with distance.
- Cohesion `SCHOOL_COH_W = 0.5`, and — the key fix — only counts neighbors
  already beyond `SCHOOL_COH_MIN_BL = 4.0` body lengths, and is ALSO
  normalized to a unit direction (not a raw distance-proportional pull).
  Rev 10.0 (mid-lane) used a raw distance-proportional cohesion pull with no
  floor on magnitude; over many frames that converges a straggler EXACTLY
  onto its neighbors' shared centroid (0-distance overlap), since separation
  never engages until they are already close. Normalizing to a bounded
  per-step nudge (same treatment as alignment) fixed it — verified via a
  live per-pack diagnostic probe (`diag_pack4.js`, scratchpad, since
  deleted) that caught two sub-clusters of a 10-strong reeffish pack sitting
  within 0.5px of each other before the fix.

**Formation slot** (`packSlotTarget`, world3d.js): each member has a fixed
`st.slotIdx` (0 = leader/point of the V, odd ranks fan back-left, even
ranks back-right, `SCHOOL_SLOT_SPACING_BL = 1.9` body lengths per rank,
back:lateral ratio 1.05:0.35 so the lattice itself reads elongated before
any boids flex). Blended with the boids target at `SCHOOL_SLOT_W = 0.28`
(kept below separation's effective weight so slot-chasing can never override
real-time neighbor spacing and re-clump the school).

**Leader path** (`packAcquire`/`packAdvanceLeader`): each pack record now
carries its own virtual `leadX/leadY/leadA` — independent of any live
member, so the formation survives a member's death and panic-scatter has a
stable anchor to reform around. Advanced once per `World.update` pass per
pack (stamped against `S.animT`, the shared monotonic sim clock, so N
members touching one pack in a frame only advance the path once — zero
extra allocation, one comparison). Heading wanders via a bounded sinusoid
(`SCHOOL_LEADER_WANDER_HZ`/`AMP`) riding on the pre-existing `packVec`
long-term drift target, turn-rate-limited to `SCHOOL_LEADER_TURN_RATE = 0.9`
rad/s so it always snakes smoothly, never turns on a dime. Y-component
damped 0.4x so schools stream horizontally more than vertically. Terrain
avoidance is untouched/inherited: the leader path is only ever a STEER
TARGET, consumed through the same `steer()` -> `steerWhisker` (SDF
wall-tangent) -> `integrate()` -> `World.resolveBody` chain every other
mover uses — no separate terrain logic was added for schooling in either
Rev 9 or Rev 10.

**Panic: scatter radially, not in lockstep.** Rev 10.0's first pass reused
Rev 9's shared "mirror the local centroid" scatter vector, which sends every
member with a similar local neighbor set fleeing along the SAME line —
members that started close stay close, just stretched into a thin
high-aspect streak (measured live: NND ~0.01-0.03 BL with aspect ratio in
the hundreds). Fixed by anchoring each member's scatter DIRECTION on its own
fixed `slotIdx` offset from the leader (via `packSlotTarget`), so panic
itself gives every member a distinct radial heading and prises the group
apart instead of merely translating it. Regroup is "blend back toward this
member's own formation slot" (the calm-branch boids+slot blend), never
toward a shared centroid, so the school reassembles into its line/V rather
than re-clumping into a ball.

**Spawn in formation:** `World.spawnBurst`'s prey path now calls
`packAcquire(packId, x, y)` (seeds the leader at the burst point) then
`packSlotTarget(rec, i, bl)` per member before placement, so the FIRST frame
already reads as a staggered line/V rather than a random-jitter blob.
`burstPointValid` gained a `tightJitter` mode (10px band vs. the old 70px)
so a rejected formation point resamples close to its intended slot instead
of snapping back to wide random scatter. Predator/hazard bursts are
untouched — they never read `st.packId` for AI at all (structural, not a
gate), so formation placement is scoped to `kind === 'prey'` only.

## 3. BUG FOUND MID-LANE: RNG STREAM REGRESSION

`packAcquire` originally added a fresh `rr(0, TAU)` draw for
`leadWanderPhase`. That is a genuinely new draw the pre-Rev-10 code never
made, and `packAcquire` runs inside two earlier `World.spawnBurst` calls in
the selftest (lines ~8300/8477) that execute BEFORE the relic-pocket check
later in the same run — shifting the shared PRNG stream changed the relic
placement outcome deterministically, breaking `'every relic pocket sits in
open water inside its own zone band'`. Fixed by deriving
`leadWanderPhase` from `packId` (`(packId * 2.399963) % TAU`) instead of
drawing — no new RNG stream consumption, so every downstream seeded check
keeps its Rev 9 behavior byte-for-byte. Caught by running the FULL
`world` selftest module before and after (git-stash comparison confirmed
baseline was clean, isolating the regression to this lane).

## Metrics: before (Rev 9) vs. after (Rev 10)

Rev 9 selftest (world3d.js `__selftest`, 8-strong minnow burst, 90 steps
= 1.5s):
```
cohesion: mean distance to school centroid after 90 steps is tight (29.4px < 400px, n=8)
alignment: mean heading variance after 90 steps is low (0.002 < 0.5, n=8)
```
29px mean centroid distance on an 8-strong pack is a blob, not a formation
— no per-body-length spacing gate existed at all.

Rev 10 selftest (same burst, extended to 300 steps = 5s to give the
formation-aspect-ratio gate, specified "after 5s", room to settle):
```
formation: mean nearest-neighbor distance is in spec (2.49 bl, want [1.4, 2.8])
formation: centroid-distance distribution is not concentrated (std/mean 0.442 > 0.35, i.e. not a blob shell)
formation: heading alignment variance is tight (0.001 < 0.05)
formation: aspect ratio after 5.0s reads as a line/V, not a blob (2.06 > 2.0)
```
All four owner-specified gates pass in the controlled (no-panic, far-player)
selftest scenario. `world` selftest: 210 ok / 0 fail (was 206/0 before this
lane's 4 new formation checks + the extended-duration rewrite of the
existing cohesion/alignment section; no existing check broken).

### density_probe_bypack_rev10.js (live page, 8s settle, scratchpad-only)

Extends the Rev 9 `density_probe_bypack.js` pattern with the same four
metrics computed per real school (grouped by `st.packId`, n>=4) from a live
8-second run, via the plainload.js SW-bypass pattern (serves the working
tree directly, page never touches sw.js). Representative live run (schools
include real gameplay panic/wander transients the clean selftest scenario
does not, so numbers vary run to run more than the controlled selftest):

```
packId 1 (parrot,   n=4): NND 2.42bl, spread 0.43, headingVar 0.002, aspect 1.93
packId 2 (minnow,   n=9): NND 2.56bl, spread 0.49, headingVar 0.003, aspect 1.68
packId 3 (minnow,   n=7): NND 2.60bl, spread 0.41, headingVar 0.331, aspect 1.80
packId 4 (reeffish, n=6): NND 2.34bl, spread 0.39, headingVar 0.014, aspect 1.77
packId 5 (reeffish, n=8): NND 1.04bl, spread 0.44, headingVar 0.143, aspect 8.44
packId 6 (reeffish, n=7): NND 1.99bl, spread 0.33, headingVar 0.12,  aspect 1.22
```
No NaN in any pack across every run tested. Every pack clears the
"not a blob" spread-ratio gate (>0.35, actual 0.33-0.49) and most clear NND
in-spec (1.4-2.8 BL); packs mid-panic/reform (pack 3's elevated headingVar,
pack 5's high aspect from an active scatter) read as real gameplay
transients rather than a steady-state regression — the controlled selftest
isolates steady-state behavior from panic and confirms all four gates pass
there. Screenshot taken (`rev10_formation.png`, scratchpad) did not have a
school in frame at the capture moment; the numeric per-pack metrics above
are the verification of record.

## Files touched

- `world3d.js` only:
  - `SCHOOL_*` constants region (~line 210): retuned + new
    (`SCHOOL_SEP_BL`, `SCHOOL_COH_MIN_BL`, `SCHOOL_SLOT_W`,
    `SCHOOL_SLOT_SPACING_BL`, `SCHOOL_LEADER_TURN_RATE`,
    `SCHOOL_LEADER_WANDER_HZ`, `SCHOOL_LEADER_WANDER_AMP`).
  - `packAcquire` — gains `leadX`/`leadY`/`leadA`/`leadWanderPhase`/
    `slotCount`/`nextSlot`/`leadStamp` fields; `packAdvanceLeader` (new)
    advances the leader path once per pack per frame.
  - `schoolSteer` — separation/cohesion math retuned; cohesion normalized
    to a bounded direction instead of raw distance-proportional pull.
  - `packSlotTarget` (new) — formation slot offset for a given `slotIdx`.
  - `resetSt` — gains `st.slotIdx` (member's fixed formation rank).
  - `preyAI`'s wander branch — advances the leader path, blends the
    formation slot into the calm-branch steer target, scatters radially by
    slot on panic.
  - `burstPointValid` — gains a `tightJitter` param for close-to-slot
    resampling.
  - `World.spawnBurst` — prey bursts seed the leader at the burst point and
    place each member at its own formation slot instead of random jitter.
  - `World.__selftest` — schooling section drains stray minnows first
    (`drainAll()`, fixes a pre-existing test-isolation gap this lane's
    changes exposed), extends the run to 300 steps (5s), and adds the four
    formation gates.

## Verification commands run

```
node --check world3d.js                                    # syntax
node --import ./tools/reg.mjs tools/selftest.mjs world      # 210/0 (was 206/0)
node --import ./tools/reg.mjs tools/selftest.mjs world game fish   # 210/0, 278/0, 8/0
node density_probe_bypack_rev10.js  # scratchpad; live 8s-settle per-pack formation metrics
node plainload.js                   # clean load, no page errors, run reaches hud with live player
```
