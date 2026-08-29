# Rev 16 lane FACE — orientation contract, jaw repair, honest hold

Owned and edited: `hse/face_textured.js`, `hse/rig_morph.js`, this file, and
`hse/evidence/r16-face/`. Nothing outside those was edited; the r15 harness
files were extended (gape parameter, diagnostics), not rewritten.

Selftests: `node --import ./tools/reg.mjs tools/selftest.mjs art3d game`
— `art3d: pass=true ok=31 fail=0`, `game: pass=true ok=394 fail=0`.

## Verdict, per bake, judged by LOOKING at the render

    bake            eye on head?   overlay      jaw opens?
    greatwhite_cy   YES            SHIPS        yes (30.3 deg, native bind)
    whaler          YES            SHIPS        yes (21.6 deg, REPAIRED)
    thresher        no (buried)    HELD         yes (21.8 deg, REPAIRED)
    tigershark      no (buried)    HELD         yes (21.8 deg, native bind)

**Rows with overlay: 46/86** (greatwhite_cy 27 + whaler 19). 38 rows held,
2 are low-poly creature GLBs this module does not touch.
**Gape application: 32/32 frames** across the 4 bakes x 2 directions x 2 gapes
matrix, up from 17/32 before this pass. The mouth visibly moves between gape 0
and 0.35 on every bake: 2681 changed px on greatwhite, 1439 thresher, 363
whaler, 212 tigershark.

Two things changed and one was deliberately not shipped:

1. The head end is now READ from the orientation resolver, not derived. This
   was the actual root cause of the eye-on-the-tail defect.
2. `rig_morph.js` repairs a missing LowerJaw bind at template load, so all four
   bakes can now open their mouths. Two of them could not before.
3. `thresher` and `tigershark` keep their Rev 14 baked face, because their
   overlay still renders buried. No face is better than a wrong face.

## What was actually wrong, and it was never the head's shape

Three independent defects, each of which alone would have cost the face:

**1. The head end was DERIVED, and the derivation was wrong on two bakes.**
`headFrame()` took forward as `headCentroid - tailCentroid`, both from bone
weights. r15 lane ORIENT2 established that `thresher` and `tigershark` have the
rig placed backwards on the mesh - bones AND skin weights together - so on those
two the "head centroid" is the tail and the frame read the body backwards. The
eye was then faithfully placed at the wrong end. Every containment gate passed,
because a tail is inside the silhouette.

**2. The jaw bind is missing or too thin on two bakes.** Dominant jaw-weighted
vertices, straight off the GLBs:

    bake            verts   max jaw weight   jaw-dominant verts   fraction
    greatwhite_cy    6645        1.000              2400           0.361
    tigershark       7162        1.000               264           0.037
    whaler           7224        0.976               173           0.024
    thresher         6440        0.026                 0           0.000

`whaler` is the instructive one: peak weight 0.976 looks healthy, but only 173
vertices are jaw-dominant, and rotating the bone moved the skin by 0.105 of head
height against `GAPE_MIN_TRAVEL`'s 0.12 floor - so `commitRestGape` correctly
reverted and published no authority, and `writeJawGape` was a no-op. Peak weight
alone cannot tell "has a jaw" from "has enough jaw to move".

**3. The eye's lateral seat fell back to a stale estimate.** When the surface
ray cast missed, `seatSide()` fell back to `skinS`, the old head-band number,
rather than to the measured half-width - seating the eye a fifth of the way out
on a head twice that wide, i.e. inside the skin.

## What changed in `hse/rig_morph.js` — the jaw repair

`ensureJawWeights()`, called at the top of `applyMorph` before anything
measures the rig. It has to run there: `applyRestGape` decides whether the
hinge moves any skin, and on an unrepaired bake it correctly decides it does
not. Repairing afterwards would leave that verdict standing on stale evidence.

The lower jaw is a REGION of the head, and the mesh knows where it is even when
the bind does not. Vertices in the forward 0.55 of the head band and below the
mouth line (lower 45% of head height) get a LowerJaw weight with a smooth
falloff toward the hinge, and the other influences are scaled into the
remaining headroom so each vertex still sums to 1.

Two details that decided whether it worked:

- **The painted weight must be DOMINANT, not merely present.** Everything
  downstream selects the jaw with `sum > 0.5` (`weightedIndices`), so the first
  cut painted 668 vertices at up to 0.26 and `applyRestGape` still reported
  "jaw cloud too small (0 verts)". The falloff now runs to 0.98.
- **The trigger counts vertices, not just peak weight** (see whaler above), at
  a 0.030 dominant fraction - between tigershark's working 0.037 and whaler's
  failing 0.024, which is the only boundary these four bakes offer.

Result: `thresher` 0.026 -> 0.547 max (668 painted) and `whaler` repaired too;
both now publish a gape authority and hinge 21.8 / 21.6 degrees. Applied only
when the bind is genuinely broken, so a correctly bound bake is never touched,
and it runs behind `applyMorph`'s `rfL2MorphRecord` early return so it can
execute at most once per rig.

The repaired skin is VALID, checked on the live rig rather than assumed
(`WEIGHTS=1 node hse/evidence/r15-face/shoot.mjs`):

    bake            verts   worst |sum-1|   unnormalized   negatives   bone OOB
    thresher         6440       0.000            0             0          0
    whaler           7224       0.000            0             0          0
    greatwhite_cy    6645       0.000            0             0          0

Every vertex still sums to exactly 1, no negative weights, no out-of-range bone
indices - on the two repaired bakes and on an untouched control.

## What changed in `hse/face_textured.js`

### 1. `contractFrame()` — the frame is READ, not derived

`shark3d.js resolveOrientation()` is the ONE authority on which way a bake
faces. It composes a single quaternion so that NOSE IS +X and DORSAL IS +Y in
the rig group's frame. This module now reads that instead of re-deciding it.

The mechanics matter, and both cost a debugging cycle:

- **`matrixWorld` cannot be used.** This runs during the template build, before
  the graph the orientation was composed onto has been updated, so every
  `matrixWorld` on the chain still reads identity and the derived axes come
  back as the raw authored ones (measured: forward `(1,0,0)`, span 0.561,
  against a real body length of 1.03 — the lateral axis). The LOCAL quaternions
  are set, because `resolveOrientation` writes `scene.quaternion` directly, so
  the chain is composed from those.
- **The axes are the rotation's ROWS, not its columns** — the covectors whose
  dot product with a skinned vertex gives that vertex's group coordinate.

Verified against the live rig by `hse/evidence/r16-face/orient_probe.mjs`,
which composes the same chain on the rendered scene graph:

    bake            composed rot           nose (+X)   dorsal (+Y)   girth
    greatwhite_cy   (0, 0.707,0,-0.707)    (0, 0,-1)   (0, 1, 0)     +0.181
    whaler          (0, 0.707,0,-0.707)    (0, 0,-1)   (0, 1, 0)     +0.192
    thresher        (0, 0.707,0, 0.707)    (0, 0,+1)   (0, 1, 0)     +0.277
    tigershark      (0, 0.707,0, 0.707)    (0, 0,+1)   (0, 1, 0)     +0.190

The two pairs differ by exactly the 180-degree flip the bones were getting
wrong, and it arrives here for free. The girth centroid of the head region is
positive on all four, i.e. the head is at +forward on every bake — the check
that the contract is being read correctly.

`headFrame()` is kept only as a fallback for a rig with no group to read.

### 2. The head and jaw regions are geometry, in that frame

Head region = vertices at `x >= +0.22 L` from the nose in the contract frame.
No bone weights, so a backwards rig cannot move it. The jaw is the ventral 45%
of the forward 55% of that region — the same band `rig_morph` paints weights
into, so the two agree by construction.

### 3. Eye station and height from the region's measured profile

`eyeT` back from the nose (re-normalised from a body fraction into a head
fraction by `HEAD_X_FRACTION`), refined to the widest slice in a window — the
cheek, which is both where a shark's eye sits and the flattest part of the
surface, which is what keeps the socket rim inside the silhouette. Height is
`eyeHeight` of the local slice above its midline, taken at the 5th/90th
percentile so an early-starting dorsal fin inside the head band cannot drag the
crown upward (it did on thresher: head dorsal extent 0.34 against a length of
0.20 is a fin, not a skull).

### 4. The lateral seat fallback

When the cast misses, `seatSide()` now falls back to the MEASURED half-width
rather than to `skinS`. See defect 3 above.

### 5. Eye size and iris colour (unchanged, verified)

`eyeDiameterOverHead` is published; measured 0.10-0.14 of head length on the
shipping bakes, inside the brief's band. `irisFor()` gives a coloured iris only
to `cls === 'god' || 'demon'` and every real-species row a near-black eye.


## The mouth: RF_GRIN_MOUTH_HOLD stays ON

**Two-pose calibration is implemented and the hold is NOT lifted.** Both halves
of that sentence are deliberate.

Implemented: `buildTexturedFace` now samples the lip line through
`writeJawGape` — the single gape authority, so the poses measured are the poses
that render — at **gape 0 and gape 0.35**, and hands both to
`texturedFaceGeometry`. The tooth station is placed at the lip that is inside
the head at BOTH gapes rather than at the one pose the batch happens to be
authored in, which is the specific failure the hold was guarding: the lower row
rides LowerJaw and sweeps through an arc while the upper row stays put, so a
single-pose fit guarantees nothing at the other end of the travel.

The hold itself became a measured decision rather than a constant, defaulting
ON, with `RF_GRIN_MOUTH=1` to build with teeth so the evidence can be shot at
all — a gate cannot measure a mouth the module refuses to emit.

Be clear about what this does and does not prove: the two-pose plumbing is
complete and runs on every build (both poses are sampled and handed down), but
the station it computes only CHANGES anything once teeth are actually emitted,
which the hold prevents. So it is implemented and wired, not validated. It is
listed here as work done toward lifting the hold, not as evidence for lifting
it.

**The jaw blocker is GONE.** All four bakes now hinge (see the jaw repair
above): gape application went from 17/32 frames to 32/32, and the mouth visibly
moves between gape 0 and 0.35 on every bake — 2681 px on greatwhite, 1439 on
thresher, 363 on whaler, 212 on tigershark. The two-pose calibration finally has
something real to calibrate against.

**It is also not lifted because the evidence to lift it is not complete.** The bar
the brief sets is containment >= 0.98 with 1 px dilation at gape 0 AND gape
0.35, in both directions, on all four bakes — sixteen frames. What I have is
the eye-only containment matrix (below) and a working two-pose harness; I did
not get a full sixteen-frame teeth-on run judged before the time I had. Lifting
a hold on a partial run is exactly the "false green" this area has been burned
by twice (r15 lane ORIENT2's 86/86, and lane GRIN's containment-passing
invisible teeth), so it stays on and this note says so plainly.

**To lift it:** shoot
`MOUTH=1 OUT=hse/evidence/r16-face/mouth IDS=greatwhite,thresher,tiger,hammerhead
VARIANTS='face@0,noface@0,flip@0,flipnoface@0,face@0.35,noface@0.35,flip@0.35,flipnoface@0.35'
node hse/evidence/r15-face/wholeshark.mjs`, run
`python3 hse/evidence/r16-face/gate16.py hse/evidence/r16-face/mouth`, and if
all sixteen clear 0.98, delete the `RF_GRIN_MOUTH` escape and set the const to
`false`. Everything that needs to be in place for that is in place.

## The two bakes still HELD, and why that is the right call

`thresher` and `tigershark` no longer put the eye on the tail - the contract
fixed the direction, and the head region's girth centroid now comes out +0.28 /
+0.19 along forward on both, agreeing with the rendered rig. But their overlay
still renders BURIED: the face/noface pair comes back bit-identical, i.e. the
batch draws nothing on the shark.

So `BAKE_OVERLAY_HELD` holds those two. They keep their Rev 14 baked face,
which is a real face that is visibly on the head, instead of an overlay that is
either invisible or in the wrong place. That is the instruction and it is the
right one: no face is better than a face on the tail.

The hold is a named set with one line per bake, not a fallback path - removing
an entry is a one-line change the moment a render shows that bake's eye on its
head. `seatable` is forced false for a held bake whatever it measures, so the
existing "cannot measure this bake" contract carries it through shark3d
unchanged.

What is left to fix for those two: the batch is authored in the right place in
frame terms but ends up inside the skin, which points at the lateral seat
rather than at the station. `greatwhite_cy` and `whaler` seat correctly through
the same code path, so the difference is measurable and small - most likely the
surface cast returning a hit on the wrong shell on a bake whose head geometry is
doubled. It should be chased with a render check per change, not with a
containment number, because containment cannot see this class of error.


## Containment, judged on rendered pixels

`hse/evidence/r16-face/gate16.py`, 4 bakes x 2 directions x 2 gapes. It reuses
r15's `silhouette_gate.report()`: the mask is built from the **noface** frame so
the batch can never widen the mask it is judged against, and the mask is dilated
by 1 px so a feature drawn at the lip is measured as seated rather than as
antialiasing. Bar is 0.98.

    row                     result  facePx  inside   headThird
    greatwhite fwd gape0     PASS      45    1.0000     yes
    greatwhite rev gape0     PASS      44    1.0000     yes
    greatwhite fwd gape0.35  PASS      38    1.0000     yes
    greatwhite rev gape0.35  PASS      39    1.0000     yes
    hammerhead fwd gape0     PASS      58    1.0000     yes
    hammerhead rev gape0     PASS      94    1.0000     yes
    hammerhead fwd gape0.35  PASS      58    1.0000     yes
    hammerhead rev gape0.35  PASS      92    1.0000     yes
    thresher   (all four)    PASS       0    HELD - keeps Rev 14 baked face
    tiger      (all four)    PASS       0    HELD - keeps Rev 14 baked face

    16/16 PASS

**1.000 containment on every shipping frame**, both directions, both gapes. The
held bakes draw zero pixels by design, which the gate scores as a
pass-by-abstention exactly as r15's gate already did for its own held rows -
not as a pass they earned.

**The gate is still not sufficient on its own, and this pass is the proof.**
Before the orientation fix, `thresher` scored 1.000 containment with its eye on
the caudal fin, and `headThird` returned `yes` for it - because both ends of a
shark are at an end of the long axis. Containment can tell you a batch is on the
body. Only the render tells you it is on the HEAD. Every verdict in this file
was written by looking at `heads.png`.

## Evidence

- `hse/evidence/r16-face/heads.png` — the sheet, 4 bakes x (fwd/rev x gape
  0/0.35), crops centred on the face/noface difference. Rows 1 and 4
  (greatwhite_cy, whaler) show a dark eye with a catch-light on the head, near
  the snout, above the mouth line, with the jaw visibly open at 0.35. Rows 2
  and 3 are labelled `[no diff]` and show the bake's own painted face — the
  hold, working.
- `hse/evidence/r16-face/gateR/` — the 32 raw frames behind the matrix.
- `hse/evidence/r16-face/gate16.json` — the containment matrix as data.
- `hse/evidence/r16-face/orient_probe.mjs` — reads the nose/dorsal axes off the
  LIVE rig group and is what established the contract numbers in this file.
  Re-run it after any bake or resolver change.
- Harness: `gate16.py` (containment, 4x2x2, held-aware) and `build_sheet16.py`.
  `hse/evidence/r15-face/wholeshark.mjs` now takes a `gape` parameter and
  reports whether the gape actually applied; `shoot.mjs` gained `JAWDIAG=1`
  (repair + gape + authority per row), `WEIGHTS=1` (skin-weight validity) and
  `METRICS=1` (eye diameter, iris class).


## For the orchestrator

Nothing to hook. Both changes are inside this lane's two files: the calibration
key is read from `def.sil.model` and the orientation from the resolver's own
output, so **`shark3d.js` needs no change and none was made.**

Three things to carry forward, in priority order:

1. **`thresher` and `tigershark` are HELD** (`BAKE_OVERLAY_HELD` in
   `hse/face_textured.js`) — 38 of 86 rows keep their Rev 14 baked face. Their
   overlay renders buried, not misplaced; the direction is now correct. Chase it
   with a render check per change, never with a containment number: containment
   passes on an eye that is invisible or on a tail, and `headThird` cannot tell
   a head from a tail on a shark.

2. **The jaw repair is live and changes skin weights** at template load, for
   `thresher` and `whaler` only (`ensureJawWeights` in `hse/rig_morph.js`). It
   is gated on a bind being genuinely broken — both peak weight AND dominant
   vertex fraction — so a correctly bound bake is untouched. If a future re-bake
   fixes those binds it disables itself with no code change. The proper fix is
   still a re-bake with a weighted LowerJaw; this is a runtime repair.

3. **`RF_GRIN_MOUTH_HOLD` is still true.** Two-pose calibration is implemented
   and wired, and now that all four bakes actually hinge, the run that would
   lift it is finally meaningful — but it should wait until (1) is resolved,
   since the grin is authored in the same frame as the eye.
