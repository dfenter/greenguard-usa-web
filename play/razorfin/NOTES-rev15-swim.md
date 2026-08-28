# Rev 15 lane SWIM — the swim wave

Owner verdict (binding, live build Rev 15.1): *"shark animations are gyrating
weird and not smooth."*

Owned file: `shark3d.js` (procedural spine wave in `buildLoadedRig`/`animate`).
Nothing else was edited.

The verdict was two separate complaints and they had three separate causes.
"Gyrating weird" is the shape of the motion; "not smooth" is its continuity.
Both were reproducible headlessly and both are measured below.

## First: there is no bend shader any more

The brief asked for the `:rf-bend3` GPU traveling-wave shader and its
`tailPhase`/`tailAmp` uniforms. **That path no longer exists.** As of Rev 14
the bend API is a stub:

```js
function bendableMaterial(baseMaterial) { return baseMaterial || null; }
function bendOffset() { return 0; }
```

The live swim is a **procedural rotation of the spine bone chain**, added in
Rev 14 because `shark_bake.py` exports a rig but no animation clips, so a
textured row has no Swim/Fast/Bite action to play. It runs on the same bones
the GPU skinning already consumes. So every fix here is in the bone/uniform
path, which is what the brief actually wanted ("fix at the root ... for ALL
textured models"), just not in the file region the brief predicted.

## Bug 1 — the wave bent the wrong way on two bases (hypothesis 1, confirmed)

The old code rotated every bone about a hard-coded bone-local **+Z**:

```js
const SWIM_YAW_AXIS = Object.freeze(new THREE.Vector3(0, 0, 1));
entry.bone.rotateOnAxis(SWIM_YAW_AXIS, Math.sin(time * swimRate - entry.phase) * ...);
```

with a comment asserting local Z maps to world up for "every spine bone".
That was true when it was written and is no longer true. Lane ORIENT's
follow-up established that the r15 re-bakes `mako_r15.glb` and `tiger_nu_r15.glb`
are authored **dorsal-on-Z** (opposite polarity: mako +z, tiger_nu −z), and
`resolveOrientation` therefore applies a ±90° roll to them — which rotates the
**bone** frame along with the mesh. The hard-coded axis then names a different
world direction on those two bases than on the other 27.

Measured on the live rigs, world-space swing of the tail tip over one cycle:

| row | base | swing X | swing Y | swing Z |
|---|---|---|---|---|
| reef | dogfish | 3.46 | 0.64 | **44.08** |
| greatwhite | greatwhite_cy | 5.00 | 0.94 | **64.82** |
| hammerhead | smoothhammer | 4.16 | 0.77 | **52.90** |
| leviathanrex | greatwhite_cy | 8.29 | 1.54 | **106.36** |
| **mako** | **mako** | 3.94 | **49.19** | 0.74 |
| **tiger** | **tiger_nu** | 4.46 | **57.38** | 0.83 |

`mako` and `tiger` were beating their tails **up and down** — porpoising in
place — while everything else swam side to side. Eight roster rows ride those
two bases (`mako, blue, duskfin, venomspine, chronos, apollodon, zeusfin,
tiger`). That is the "gyrating weird", literally.

**Fix: measure the axis, never assume it.** Each bone's yaw axis is now
resolved once at build time from its own bind-pose world matrix, by pulling
world **+Y** back into bone-local space:

```js
const worldQuat = bone.getWorldQuaternion(new THREE.Quaternion());
const yaw  = new THREE.Vector3(0, 1, 0).applyQuaternion(worldQuat.clone().invert()).normalize();
const roll = new THREE.Vector3(1, 0, 0).applyQuaternion(worldQuat.clone().invert()).normalize();
```

A swim beat is a yaw about the world vertical *by definition*, and the engine
frame is fixed (nose +X, dorsal +Y — `NOTES-rev15-orient.md`), so this is
correct for any bake convention including future re-bakes, with no per-model
table. Hypothesis (2) — unnormalized per-model pivot constants — turned out
not to exist separately; this is the same defect seen from the other side.

## Bug 2 — the envelope was inverted: the shark wagged its head (hypothesis 3)

This is the one that made even the *correct* models look wrong.

The old gains ramped toward the tail — `gain: 0.035 + index * 0.028` over
`SWIM_CHAIN = ['Neck','Spine1','Spine2','Tail1','Tail2','Tail3']` — which reads
like carangiform motion and does the exact opposite, because **the hierarchy is
inverted relative to the body**. Read off the actual skeleton:

```
Tail3 -> Tail2 -> Tail1 -> Spine2 -> Spine1 -> Neck -> Head -> LowerJaw
```

`Tail3` is the chain **root**; `Head` is the deepest **leaf**. Confirmed from
the skin weights: the rear-most 200 vertices are dominated by `Tail2`/`Tail3`,
the front-most 200 by `Head`. So rotating a bone carries everything
**nose-ward** of it, displacement accumulates tail→head, and rotating `Tail3`
— the bone the old ramp gave the most gain — just swings the whole animal
rigidly about its own tail without moving the tail at all.

Measured per-bone lateral swing, as a fraction of body height (greatwhite_cy):

```
BEFORE   Neck 37.5%   Spine1 27.9%   Spine2 18.3%   Tail1 9.5%   Tail2 3.5%   Tail3 0.000
```

A monotonic ramp with its **peak at the head and a dead tail tip**. The shark
wagged its head and held its caudal fin still.

**Fix, in two parts.**

1. *Express the wave as accumulated angle and de-trend it against the snout.*
   The per-station bend angle is authored directly, then each bone applies only
   its **difference** from its parent, with the snout's own angle subtracted so
   the running sum at the head is zero by construction:

   ```js
   const trend = angleAt(snout);
   let applied = 0;
   for (const entry of swimBones) {          // ordered root-first
     const target = angleAt(entry) - trend;
     entry.bone.rotateOnAxis(entry.yaw, target - applied);
     applied = target;
   }
   ```

2. *Move the anchor.* De-trending the **rotation** is not enough: `Tail3` is
   the root and cannot translate, so the snout still slides sideways even at
   zero net yaw. Measured with the wave de-trended: `Tail3` 0.00, `Tail2` 4.00,
   `Tail1` 7.82, `Spine2` 8.84, `Head` 8.04. The fix is a **head lock** — read
   where the head bone actually landed and slide the whole `pose` group back by
   that much along the lateral axis only:

   ```js
   tmpMat.copy(pose.matrixWorld).invert().multiply(headLockBone.matrixWorld);
   tmpVecA.setFromMatrixPosition(tmpMat);
   pose.position.z = poseRestZ - (tmpVecA.z - headLockRest);
   ```

   The body keeps its bend, the snout stays on the heading line, and the caudal
   fin inherits the full sweep. `pose` is already the speed-stretch/eat-pop
   authority, so this composes with the existing transforms and touches no
   other lane's contract.

   **The measurement space matters and is the whole trap here.** Measuring the
   head in *world* space makes the correction an input to itself; it diverged
   to `1e193` within a few frames. It must be measured in **pose-local** space
   — through a matrix that does not depend on `pose.position`.

Verified directly, head world-Z pinned while the tail sweeps:

```
phase 0.5  head -0.03   tail -0.87
phase 1.5  head -0.03   tail -4.28
phase 2.5  head -0.03   tail -3.72
phase 3.5  head -0.03   tail +0.28
```

## Bug 3 — phase was multiplied, not integrated (hypothesis 4, confirmed)

```js
const swimRate = 2.3 + 3.4 * speedFrac;
... Math.sin(time * swimRate - entry.phase) ...
```

Multiplying **absolute** time by a speed-dependent rate teleports the phase the
instant speed changes. Measured across a 0.1 → 0.9 speed step:

```
t=0.983  sp=0.1  phase=2.596  tailZ=-8.16   frame delta 0.92
t=1.017  sp=0.9  phase=5.449  tailZ=+3.75   frame delta 3.90
```

A 2.85 rad jump — nearly half a cycle — with the tail reversing direction
mid-beat. Speed changes continuously in play, so this fired constantly. This is
the single largest contributor to "not smooth".

The engine **already integrates a correct phase** (`engine3d.js:2420`,
`a.tailPhase += hz * TAU * STEP`) and passes it in the state bag as
`tailPhase`/`tailAmp` — this lane simply never read it. It does now, with a
locally-integrated fallback for the roster/thumbnail paths that call
`animate()` with a bare bag:

```js
const drivenPhase = finite(input.tailPhase, NaN);
if (Number.isFinite(drivenPhase)) animation.swimPhase = drivenPhase;
else animation.swimPhase += dt * swimRate;
```

Either way the phase only ever advances by `dt * rate`, so it is continuous
through any speed change by construction.

### …and amplitude needed the same treatment

A continuous phase is necessary but not sufficient. Lateral offset scales with
amplitude, so a **step in amplitude** is just as visible as a step in phase:
with the phase fixed, a 0.15 → 0.9 speed step still snapped the tail 3.715
units in one frame while the wave itself stayed perfectly in rhythm. Amplitude
is now eased with the same frame-rate-independent exponential the `turn` and
`bite` channels already use. The rate constant was swept against the jerk gate:

| ampEase k | step jerk |
|---|---|
| 12 | 26% |
| 8 | 18% |
| 6 | 14% |
| 3 | 8% |
| **2.0** | **6%** |
| 1.5 | 4.9% |

`2.0` (~0.5 s settle) sits comfortably inside the 10% gate while still reading
as a responsive throttle; below that the beat visibly lags the speed.

## Hypothesis 5 — not a defect

Pose yaw/roll is already smoothed frame-rate-independently
(`ease = 1 - Math.exp(-dt * 8)`, applied to `animation.turn`). No change.

## Gate

`scratchpad/swim/gate.mjs` — builds each rig through the real `buildShark`
path, drives `animate()` at 30 fps for 3 s, and measures the caudal band and
head band by **CPU skinning** (`applyBoneTransform`), so it reads what the GPU
actually draws rather than the static bind buffer. Bands are selected by
**dominant skin weight** (`Tail3`/`Tail2` vs `Head`/`LowerJaw`), not by bbox
fractions — an early version picked the dorsal fin as "the tail" and reported
nonsense. Jerk is the max second difference of the lateral track as a
percentage of amplitude. A 45-frame warm-up lets the amplitude ease settle so
steady state is measured as steady state.

Gates: tail lateral must dominate; head lateral ≤ 6% of body height; no
vertical bending; jerk < 10% of amplitude per frame; phase continuous through a
0.15 → 0.9 speed step.

| row | base | tail lat %H | head lat %H | tail **vert** %H | jerk | step jerk |
|---|---|---|---|---|---|---|
| | | before → after | before → after | before → after | before → after | before → after |
| reef | dogfish | 1.99 → **2.33** | 25.13 → **0.41** | 0.05 → **0.01** | 1.87 → **1.78** | 86.5 → **5.95** |
| greatwhite | greatwhite_cy | 1.95 → **2.13** | 19.43 → **0.45** | 0.04 → **0.01** | 1.86 → **1.78** | 83.0 → **5.76** |
| mako | mako | 0.10 → **5.32** | 1.05 → **0.07** | **4.43 → 1.22** | 4.73 → **2.20** | 118.7 → **5.98** |
| tiger | tiger_nu | 0.24 → **4.82** | 1.82 → **0.15** | **5.86 → 0.91** | 3.47 → **2.01** | 58.4 → **5.37** |
| hammerhead | smoothhammer | 2.11 → **1.91** | 23.47 → **0.48** | 0.05 → **0.01** | 1.87 → **1.78** | 111.1 → **5.50** |
| leviathanrex | greatwhite_cy | 1.93 → **2.15** | 19.29 → **0.44** | 0.04 → **0.01** | 1.86 → **1.78** | 82.2 → **5.75** |

Reading the table: before, the four Y-dorsal bases put **19–25%** of body
height into the head and ~2% into the tail (head wag); `mako`/`tiger` put their
motion into **vertical** bending with essentially no lateral sweep (0.10/0.24%).
After, every row has the tail leading the head by 4–70×, head lateral is
0.07–0.48% (gate 6%), vertical bending is gone on the Y-dorsal bases and down
4–6× on the Z-dorsal ones, and step jerk is 5.4–6.0% (gate 10%).

The residual 0.91–1.22% vertical on `mako`/`tiger` is real but small — those
two bakes carry a slight dorsal tilt that the measured yaw axis inherits — and
is ~5× below where it was.

Raw numbers: `hse/evidence/r15-swim/metrics_before.json`, `metrics_after.json`.

### Whole-roster sweep

`scratchpad/swim/allrows.mjs` runs the same measurement over **all 84 buildable
roster rows**. Head lateral is **0.13–0.48 %H** on every row (gate 6%) and the
tail leads the head on every row. Two rows are unmeasurable — `goblin` and
`gulperfiend` — because their models (`goblinshark`, `anglerfish`) name their
whole spine `Main1..Main6` and carry no `Head`/`Tail`/`LowerJaw` bones at all;
they are the same two rows `NOTES-rev15-orient.md` records as boneless, and
they have no procedural swim chain to drive either way.

### Played gate (the real game)

`hse/evidence/r15-swim/shoot.mjs` drives `index.html?unlockall=1` through the
real roster → DIVE → level DIVE flow (lane ORIENT's harness), then records the
**live rig** for 3 s while driving straight right and while turning, capturing
12 strip frames per row. Sheet: `contact_sheet.png`; series: `shots/report.json`.

| row | drive | tail | head | ratio | sinusoid residual |
|---|---|---|---|---|---|
| reef | straight | 4.86 | 0.10 | **50×** | 15.1% |
| reef | turn | 5.06 | 0.22 | **23×** | 2.9% |
| greatwhite | straight | 8.43 | 0.59 | **14×** | 14.2% |
| greatwhite | turn | 8.45 | 1.07 | **8×** | 7.2% |
| mako | straight | 5.12 | 0.27 | **19×** | 5.8% |
| mako | turn | 6.24 | 1.48 | **4×** | 12.2% |

`mako` is the load-bearing row here: it is one of the two bases that were
bending vertically, and in the live game it now sweeps its tail 19× further
than its head.

**Two honest caveats about this probe, recorded rather than papered over:**

1. *Do not sample with one `page.evaluate` per frame.* The first version did,
   and the CDP round-trip under swiftshader could not hold 30 fps — measured
   intervals came back **0.067–0.65 s**, 2–20× the intended 33 ms. At those
   gaps the beat aliases (phase wrapped 6.2 → 0.98 between consecutive
   samples) and a second-difference jerk metric on the series read **387%** on
   motion the headless gate measures at **1.78%**. The probe now records
   in-page on the rAF loop and reads the buffer once at the end.

2. *Even then, the browser's fixed-step sim outruns the sample clock.* The
   median phase step is **2.094 rad** — 2π/3, two-thirds of a cycle, well past
   Nyquist — so a per-frame jerk metric is still not meaningful in-game. The
   table therefore reports a **sinusoid residual**: least-squares fit of
   `tailZ` against `A·sin(phase) + B·cos(phase) + C`, RMS as a percentage of
   fitted amplitude. That is phase-referenced and so immune to the aliasing.
   2.9–15.1% residual against a pure sinusoid, with the residual itself
   dominated by the aliasing.

   **The authoritative jerk number is the headless gate's**, because there the
   timestep is controlled exactly. The played gate is what proves the fix
   reaches real rendered pixels, and what the strips show.

`hammerhead` and `leviathanrex` produced strip frames but lost their series to
a renderer crash (the software rasteriser drops a target every few rows); their
headless numbers are in the table above and their strips are on the sheet.

## Selftests

`game` **394/394 pass**.

`world` **379/379 pass** — run on its own. Run *after* other targets in the
same process it reports 1–2 failures (`relic pocket ... 12 relics, 1 bad` and
`formation: aspect ratio ... 1.97 > 2.0`, whose message is self-contradictory
since 1.97 > 2.0 is false). Those are the cross-target ordering artefact
`NOTES-rev15-orient.md` already records. Verified by direct A/B, twice each:

```
BASELINE (pre-lane backup)  world: pass=true ok=379 fail=0   (x2)
THIS LANE                   world: pass=true ok=379 fail=0   (x2)
```

Identical. Not affected by this lane either way.

`art3d` **fails 1 — and it is NOT this lane's.** `reef: cruise jaw gape 0.000
outside 20-35%`. A concurrent lane changed the jaw line in `shark3d.js` while
this lane was running:

```js
BACKUP (taken at lane start)   const jawGape = jawBone ? jawRestGape + animation.bite * (1 - jawRestGape) : 0;
CURRENT                        const jawGape = jawBone ? animation.bite : 0;
```

The rest-gape term is gone, so cruise gape is 0 and the 20–35% gate fails.
Proven by substitution: restoring **only** that one line, with every swim change
of this lane still in place, gives `art3d: pass=true ok=31 fail=0`. The line was
left as found — it is the face/GRIN lane's region (their notes describe moving
rest gape into `face_textured commitRestGape`), and this lane does not edit
other lanes' code.

## For the orchestrator

**Merge `shark3d.js` as-is.** One thing to hook, and it is not mine:

> `shark3d.js` `const jawGape = jawBone ? animation.bite : 0;` has lost its
> `jawRestGape` term and fails `art3d` (`reef: cruise jaw gape 0.000`).
> Either restore `jawRestGape + animation.bite * (1 - jawRestGape)` or land the
> face lane's `commitRestGape` so the rest gape arrives from
> `face_textured.js`. With that one line correct, `art3d` is 31/31 alongside
> this lane's changes.
