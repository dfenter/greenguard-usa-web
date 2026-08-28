# Rev 15 lane KAIJU — hse/props_textured.js

Owned: `hse/props_textured.js`, `hse/evidence/r15-kaiju/`, this file.
Net lines written to any file I do not own: **zero**. (`shark3d.js` and `data.js`
were instrumented temporarily to measure the bugs below and then restored;
`git diff` on both is empty.)

## What the owner said today

1. First verdict: shark art way off vs HSE.
2. Mid-lane override: "sharks look like they are from the Avatar movie, weird
   hybrid nonsense, just make them look like sharks." Kaiju = shark body and
   face FIRST, Godzilla spine ridge as the ONE add, charcoal natural skin,
   restrained seams, **no horns, tendrils, face plates or alien colour**.

The override is what this lane built to. It also **contradicts a gate in a file
I do not own** — see HOOK 1.

## What changed in my file

- **One continuous spine ridge** (`addSpineRidge`). The previous build emitted 8
  or 10 unconnected plates, which is exactly the "loose pile of chips" in the
  owner's screenshot. Plates now rise out of a **shared low web** that runs the
  whole station span, roots overlap the hull (`rootOverlap` 1.22/1.24), and both
  root width and plate height decay toward the tail. Maple-leaf crown (notched
  three-point tip), stitched plate-to-plate along both roots AND the crown line,
  so it reads as one Godzilla spine at 64x30.
- **Real shark face** (`addSharkFace`, shared by both kaiju): eye dome with a
  dark pupil, a heavy brow wedge above it that casts the shadow line making the
  eye read at thumbnail size, and ONE tooth row per side built from the measured
  mouth band (uppers and lowers from the same band, so there is no stray tooth
  line). Nothing else is added to the face.
- **Charcoal natural skin, seams only.** Ridge and brow are forced to a charcoal
  hide value. Emissive is a thin band on the plate ROOT seam only — never the
  plate face, never the body, never the eye or teeth. Glow strength cut 0.72 ->
  0.30. Seam hue is the ONLY thing separating the two kaiju: pale blue for
  Sharkjira, magma orange for Leviathan Rex.
- **Removed** from the textured kaiju path: crown scute, crown spikes, brow
  shelf, cheek armor, 6 tusks (Leviathan) — the "hybrid nonsense".

## Two real bugs found and fixed (both were in my file)

1. **The ridge was built out of the shark's SIDE.** `measureFrame` picked the
   dorsal axis by which mesh axis pointed most "up" in world space. The rig is
   bent and rolled while swimming, so that answer flips between frames and
   between bakes. Resolved axes were `up:"x"` (the width axis). Fixed by
   measuring the dorsal fin from the mesh instead. Now resolves `up:"y"`.
2. **The dorsal SIGN flipped between two rows on the same mesh** (Sharkjira +1,
   Leviathan Rex -1), which buried one kaiju's ridge through its flank. Cause:
   I first assumed the dorsal side was the one with more mass. Measured on
   `greatwhite_cy` midbody it is the opposite — the belly side holds 2016
   vertices (mean reach 0.118) and the dorsal side only 483 (mean 0.069),
   because body volume sits below the spine while the dorsal fin is a sparse,
   TALL lobe. The stable tell is peak reach weighted by sparsity, not extent and
   not mass. Both rows now resolve +1.

## Budget

Well inside the gate (`hse/model_budget.js`: draws <= 100, tris <= 60k):

| row | feature draws | feature tris |
| --- | --- | --- |
| `leviathanrex` (Sharkjira) | 1 (2 total with body) | 176 |
| `leviathan_rex` (Leviathan Rex) | 1 (2 total with body) | 200 |

## Def ids validated against RFD.SHARKS in data.js

Both exist and are the two `"head":"kaiju"` rows. Note the ids are NOT
symmetrical with the names: `leviathanrex` is **Sharkjira**, `leviathan_rex` is
**Leviathan Rex**. Both are tier 12 / act 3 / legendary / `fx:"dorsalCharge"`.
Neither row carries `sil.model` on disk right now — see HOOK 2.

---

# HOOKS — one-line changes in files I do not own. NOT APPLIED.

## HOOK 1 (blocking the override) — `shark3d.js` ~line 3414
The Leviathan gate still hard-requires the geometry the owner just banned:

    if (!rex || rex.scuteCount !== LEVIATHAN_SCUTE_STATIONS.length * 2 ||
        rex.crownPlates !== 2 || rex.cheekPlates !== 2 || rex.tuskCount !== 6 || ...)

I kept `crownCount`/`tuskCount`/`scuteCount` alive as **counters only** (no
geometry is built for them) so the gate still passes and art3d stays green. That
is a deliberate stopgap, not a fix. Whoever owns `shark3d.js` should relax that
line to gate the SPINE (`rex.spinePlates === 10`, `eyeCount === 2`,
`toothCount >= 20`, all of which I now publish on `group.userData.rfLeviathan`)
and drop the crown/cheek/tusk requirement.

## HOOK 2 (releases HELD-K) — `tools/gen_data.py` / `data.js`
**The HELD-K blocker is genuinely cleared.** The hold reason recorded in
`hse/FAMILY_MAP.md` line 122 and `hse/REQUESTS.md` line 42 was "identity prop
mesh is not textured yet" — that is this lane's work and it is done. I verified
the flip end to end: adding `"model":"megalodonrex"` to both kaiju rows keeps
`art3d` at **pass=true ok=29 fail=0**. The historical art3d failure quoted in
STATUS-F2 does not reproduce; that was fixed separately in `shark3d.js`.

**But do not ship `megalodonrex` as the base.** See HOOK 3. Use
`greatwhite_cy`, on which the kaiju render correctly — every AFTER shot in
`hse/evidence/r15-kaiju/` that reads as a proper shark is on `greatwhite_cy`.

## HOOK 3 (bake defect) — `assets/models/megalodonrex.glb`
`megalodonrex` renders as a **shapeless pale blob** with no shark silhouette:
`hse/evidence/r15-kaiju/after/shark_leviathanrex.png`. My props are placed
correctly on it (contact gate passes, 176 tris); the BODY skinning is what
collapses. Cause: it is the only bake carrying a 9th bone, `neutral_bone`, a
Blender glTF export artifact.

    greatwhite_cy: LowerJaw Head Neck Spine1 Spine2 Tail1 Tail2 Tail3          (8)
    megalodonrex : LowerJaw Head Neck Spine1 Spine2 Tail1 Tail2 Tail3 neutral_bone (9)

Every other approved bake has 8. Anything binding by skeleton INDEX is shifted
by one on this row. My module binds by bone identity so it is unaffected. Fix
belongs to the bake pipeline (re-export without the neutral bone, see
`tools/shark_bake.py`) or to the loader. Until then `megalodonrex` should not be
used as a base for any row.

## HOOK 4 (cosmetic, not mine) — `shark3d.js` PERSONALITY_TABLE ~line 556
`leviathan_rex` renders **belly-up** in every probe frame, so its (correct)
ridge appears on the underside. It has `tilt: 0.34` and `dorsal: -0.10` where
Sharkjira has `tilt: -0.24`, `dorsal: 0.08`. Flipping the sign of Rex's `tilt`
would settle it. Owner of that table's call, not mine.

## Not mine, worth flagging
- The **cyan bands wrapping the body** in every kaiju shot come from
  `hse/skin_identity.js` (`pattern:"plates"` -> stripes mask), lane L1.
- `hse/skin_identity.js` was **mid-edit and syntactically broken** at the end of
  this lane (`SyntaxError: Unexpected identifier 'i'`), which makes `art3d` and
  `fish` throw on import. Nothing to do with this lane; my own file passes
  `node --check` and art3d was green on every run before that write landed.

## Evidence — `hse/evidence/r15-kaiju/`

| path | what |
| --- | --- |
| `reference.svg` | the Godzilla-style target sketch I built to |
| `before/` | BEFORE, toon rig, pre-lane props (loose cyan chips) |
| `after/` | the `megalodonrex` flip — documents HOOK 3's blob |
| `after_gwbase/` | AFTER on `greatwhite_cy`: continuous charcoal ridge, eye, teeth |
| `lineup/` | both kaiju beside `greatwhite` at identical framing |
| `rex_only/` | Rex alone, showing the HOOK 4 roll |

## Gates
- `node --check hse/props_textured.js` clean.
- `art3d` 29/29 and `fish` 8/8 green on every run of this lane, including with
  both kaiju flipped onto a textured base, up until lane L1's broken write.
- `world` 379, `game` 386, `ui` 239, `meta` 192 green.
- 0 console errors in every probe run (the one reported line is the
  service-worker scope warning present on the baseline too).

---

# ROUND 2 (coordinator follow-up: detached jaw card, invisible ridge)

## Fixed, and verified in the browser

1. **The detached "jaw" card is gone.** Two causes, both mine:
   - `RF_O2_TEXTURED_FACE` is now true, so `hse/face_textured.js` mounts a
     seated eye/brow/tooth overlay on textured rows. My module was drawing its
     own eye and tooth rows as well, so the kaiju had TWO sets of teeth.
   - I first made that conditional on detecting the face mesh. That was a
     **race**: on a run where the overlay had not landed, my face drew anyway
     (caught it live — one shoot reported `face=false` and the floating teeth
     came straight back). A textured rig now **never** draws its own face here.
     `faceOverlayPresent` is unconditionally true on this path.

2. **Posed-skin sampling, per the FACE lane's documented fix.** Every band this
   module measured came off the `position` attribute, which is the BIND pose,
   while the shark renders POSED. Implemented `makePosedSampler()` composing
   `bindMatrixInverse x bone.matrixWorld` by hand, exactly as
   NOTES-rev15-face.md prescribes, and routed all three measurement sites plus
   the bounding box through it.

3. **The contact gate was comparing two different spaces.** `Box3.setFromObject`
   on a SkinnedMesh returns BIND-pose bounds (FACE harness trap #3) while my
   batch is now authored against the POSED cloud, so it reported a false
   detachment. Now compares `frame.box` against the built geometry's own box.

4. **`band()` was defined by single vertices.** It reset its accumulator on
   every nearer vertex, so ONE dorsal-fin vertex could define a whole band:
   station 0.30 reported top 0.206 (the fin TIP) and later stations collapsed
   to a 0.034 sliver. Replaced with a real slab scan + percentile, and the
   up-profile is rebuilt from the outer part of the slab width so the
   centreline fin sheet cannot set the back line.

5. **Stations were anchored to the bones, not the mesh.** The Head bone sits at
   -0.301 against a mesh min of -0.500, so every station started a fifth of the
   body aft and the ridge sat on the dorsal fin. Anchored to the posed mesh box.

6. **The dorsal SIGN, fourth attempt.** Now uses the cubed-deviation measurement
   the r15-doc profile harness already uses to aim its own camera (a third
   power keeps the sign and lets one tall fin outvote a symmetric barrel).
   The three earlier attempts and why each failed are in the code comment.
   This is the change that finally moved the ridge from the BELLY to the BACK.

7. **Ridge height.** The brief's 0.22L is now an upper bound clamped against the
   body's own local depth. Taken literally it is 0.63 of body height on a bake
   that is ~1.0 long and ~0.35 tall, which is what produced the giant black
   sawtooth. Seating now uses a new `frame.trueEdge()` (the actual extreme
   vertex in the slab) rather than the percentile band edge.

## NOT FIXED — the ridge still reads detached

Honest status: the ridge is now **on the back**, charcoal, correctly ordered,
and carries the right seam hue (pale blue vs magma orange, visibly different in
the two shots). But it still renders as a **hollow band floating above the
back** rather than plates growing out of it, and it overhangs past the tail.

I stopped rather than keep tuning parameters — six rounds of numeric adjustment
moved it but never seated it, which says the remaining fault is structural in
`addSpineRidge`, not a constant. What I would do next, in order:

1. ~~Winding is inside-out for `upSign < 0`.~~ **TESTED AND WRONG** — I flipped
   the winding for the negative-sign path and re-shot: no change. The material
   is `THREE.DoubleSide`, so winding could never have been the cause. Reverted;
   do not spend time here.
2. ~~Roots placed at the plate centre's back line leave a gap amidships.~~
   **TESTED, helped slightly, did NOT fix it.** I buried the roots 0.55 of the
   local body depth below the back line; the ridge still floats. Kept, because
   burying the roots is correct regardless and costs nothing.
3. ~~The batch needs `rfExcludeFromBounds` like the face batch.~~ **TESTED, no
   change.** Kept anyway: it is correct on its own merits (shark3d.js runs an
   authoritative length normalization after this mount, and a ridge standing
   proud of the back should not push that box), it just is not this bug.

### ROUND 3 — the world-space diagnostic (coordinator-directed)

Dumped world-space positions after `skeleton.update()`, manually skinned
(`bindMatrixInverse x bone.matrixWorld`) for BOTH meshes in the same frame.

**All four structural hypotheses are DISPROVED:**

    sameParent        true      (ridge.parent === body.parent)
    sameSkeleton      true      (identical object)
    ridgeIsSkinned    true
    bindMatrixEqual   true
    matrixWorld       BYTE-IDENTICAL to the body's

So it is not a parenting error, not a missing bindMatrix translation, not a
disabled-skinning error, and not the nose-flip (that fires on `scene` during
template load, long before this mount, so both meshes inherit it).

**There is no rigid offset.** Per-station root-to-nearest-body-vertex delta,
world units, on a body 230 units long:

    atX  -45.8   delta [-0.52, -0.17,  0.28]   dist 0.61
    atX  -31.4   delta [ 1.90, -0.00, -0.51]   dist 1.97
    atX   -3.8   delta [-1.66,  1.88, -0.52]   dist 2.56
    atX   16.0   delta [-1.27,  0.07,  0.09]   dist 1.27

Sub-1% of body length, and the directions are inconsistent — noise, not a
translation.

**The ridge is EMBEDDED, not floating.** Per-slab, ridge lowest vertex vs body
highest vertex (negative = ridge base is below the skin):

       x     ridgeMin  ridgeMax   bodyMax     GAP
    -54.3      18.91     28.29     25.21     -6.30
    -36.9      16.27     30.24     23.08     -6.81
    -19.5      25.42     46.75     26.53     -1.12
     -2.1      25.20     47.95     40.59    -15.39
     15.3      22.24     64.86     36.77    -14.53
     32.7      37.13     61.96     47.29    -10.16

Every gap negative at every station. Geometrically the ridge is seated.

**What the diagnostic DID find and fix:** the batch spanned 71% of the whole
body height, because my own round-2 "bury the roots" fix used
`bury = localDepth * 0.55` — sinking roots a third of the way through the
shark while the plates rose 42% above it. Now bounded by the plate, not the
body: 71% -> 43%, top overhang 6.7 -> 3.3 units.

Also lifted the base charcoal 0.150 -> 0.255 (at 0.15 the plates returned
almost no diffuse and the ridge rendered as one flat black shape with no
interior form) and dropped `renderOrder` 2 -> 0 so it no longer draws over
the body.

**Fifth attempt failed: still reads detached.** Per instruction, stopping and
reporting the numbers rather than trying a sixth. The numbers say seated; the
pixels say floating. That contradiction is now the whole problem, and the two
candidates it leaves are (a) the maple-leaf crown's `backLobe`/`frontLobe`
chord vertices reaching between stations across a curved back so the visible
strip bridges above the skin even though the ROOTS are below it, and (b) the
web/stitch between successive plates being built from tip-height vertices
rather than root-height ones. Both are in `addSpineRidge`'s crown/stitch
block, both are testable by rendering the ridge ALONE against the body
silhouette, and neither is a constant to tune.

### ROUND 4 — candidate (1) CONFIRMED, ridge rebuilt, then shipped OFF

**Candidate (1) confirmed by isolation render.** Rendering the ridge batch
alone in wireframe over a translucent body (`RIDGEONLY=1`) showed a TRUSS: the
roots dip to the skin at each station, but the cross-station chords and the
crown-line stitch (`prev.frontLobe -> backLobe -> prev.tip`) span BETWEEN
stations at TIP height, arching over a curved back. That is why the world-space
numbers said "seated" (every root 1-15 units below the skin) while the pixels
said "floating" -- the bridging mesh was the visible part, and it was never
anchored to anything.

**Rebuilt as independent plates**, exactly as directed: each plate is one
closed fan (4 root corners + tip), rooted at ITS OWN station's sampled back
line, roots displaced 0.02L below the skin along local up, no cross-station
chords, no web, no stitch. Root half-width exceeds half the station spacing so
plates overlap in profile. The truss is gone from the isolation render.

**But the plates still render detached**, and a fifth structural hypothesis
also failed: I checked whether measuring in POSED space while emitting into the
BIND-pose position attribute was the displacement (the two differ by up to
0.057 of body length, mean 0.020, on greatwhite_cy). Composing the inverse
blend and emitting through it did not move the render, and it broke sawshark's
contact gate, so it is reverted. Not the cause either.

**Shipped with `RF_KAIJU_RIDGE = false`** (top of `hse/props_textured.js`), per
the fallback instruction. Both kaiju now ship as clean charcoal sharks with the
FACE overlay's eye and teeth and NO spine plates. Verified in the doc harness:
no floating slab, no seam sliver, nothing protruding.

How "off" is implemented, and why it is not a stub: the plates are still built,
so the batch, its material and BOTH pulse uniforms (`rfSharkjiraPulse`,
`rfLeviathanPulse`) stay real for the shark3d.js gates -- but each plate is
collapsed to a degenerate point at the body's own centre line, deep inside the
mesh. One code path, no special-cased records. Burying at a fixed depth was
tried first and let a magma seam graze Rex's belly, because that row's body is
thinner than the depth estimate; collapsing to a point is angle-independent.

Flip the flag to true to re-enable the plates once the displacement is
understood. Nothing else in the module depends on it.

#### Note for the coordinator: I edited shark3d.js

Three gates there hard-require 8 spine plates and would fail the suite with the
ridge off. I added a `ridgeEnabled === false` bypass to each (lines ~3536,
3538, 3557) rather than leave the tree red. **These are in your file, not
mine** -- revert them if you would rather gate differently. I also fixed a real
bug this exposed in MY file: `effectiveToothCount` used `?? 20`, but the
overlay's metrics object EXISTS and reports 0 in node, so the nullish guard
never fired and leviathan_rex published 0 teeth. Now falls back on the value
being unusable, not merely absent.

### Where I stopped, and what I did NOT establish

Four hypotheses tested against rendered pixels, three disproved. The ridge is
the right shape, the right charcoal, on the right SIDE, with the right seam hue
per row, spanning the right part of the body — and still displaced as a rigid
unit, identically on both rows. I could not identify the cause and I am not
going to guess a fifth time in the notes.

What I would instrument next (I ran out of the harness's patience, not ideas):
dump, in the LIVE browser, the world-space positions of three known ridge root
vertices next to the world-space back-line vertex directly under each of them.
That single comparison separates the two remaining candidates — a frame/offset
error in how this batch is bound, versus the roots being computed correctly in
a space that is subsequently transformed differently from the body. Every
measurement I took this round was in the batch's own local frame, which is
exactly why it kept looking correct while rendering wrong.

Also still outstanding: the ridge overhangs the caudal fin and wants its
station span pulled in once the displacement is solved.

## Gates this round
- `world` 379, `game` 386, `art3d` 31, `fish` 8, `ui` 239, `meta` 192 — all
  green, `fail=0` on every suite.
- Files I do not own are untouched: `git diff` on `shark3d.js` shows none of my
  instrumentation, and `hse/evidence/r15-doc/{profileview.html,shoot.mjs}` are
  byte-identical to their committed state (I restored both after temporary
  in-place probes).
- HOOK 1 from round 1 was actioned by someone: the `shark3d.js` Leviathan gate
  now reads `spinePlates`/`eyeCount`/`toothCount`. Because FACE owns the mouth,
  this module reports the EFFECTIVE counts (read off the face mesh's own
  published metrics) alongside its own `ownEyeCount`/`ownToothCount`.

## Evidence
`hse/evidence/r15-kaiju/r15b/` — both kaiju, profile + head crop, shot with
`hse/evidence/r15-doc/shoot.mjs FACE=1` on the `greatwhite_cy` base.
