# Rev 13 lane FACE

Owner verdict addressed: "faces and eyes are off, they look robotic."

## Root cause

The eye was never geometry. It was painted by the atlas branch of
`skinMaterial`, gated behind `rfBlack` (near-black atlas texels) inside the
forward face band. A shader that only tints existing pixels cannot produce a
socket, a lid, a brow, or a specular catch-light, so every one of the 86 rows
resolved to the same flat dark smear on a body-coloured bump. The authored
`face` column (eye, brow, pupil, gape, tilt) fed only two weak mask terms
(`rfEyeBand`, `rfBrowMask`), which the palette colorization then washed out.
That is exactly the machined read the owner called out, and it was uniform
across menace, grin, dopey and regal.

## What changed

The face is now real bone-bound geometry, built once per definition and
cached, mounted as one extra skinned batch beside the body.

New code, all added between `grinGeometry` and `makeProp`:

- `FACE_KIND` / `faceBuilder()` - a small builder in the same style as the
  existing `featureBuilder`, emitting position, skinIndex, skinWeight plus
  `rfFaceKind` and `rfFaceEdge` attributes.
- `faceDisc` / `faceDome` - ring and dome primitives in the body YZ plane.
- `faceGeometryFor(body, def)` - the sculpt, and the source of the numeric
  metrics used by the selftest.
- `faceMaterial(def, palette)` - a dedicated material branching on
  `rfFaceKind`, so the eye fully escapes the body palette resolver.
- `makeFace(body, def, palette)` - binds the batch to the body skeleton.

Per eye the sculpt carries a recessed socket floor with a proud rim, a domed
sclera, an offset pupil, an off-axis highlight, and an asymmetric brow wedge.
Nothing is concentric and nothing is a flat disc:

- The socket floor is pushed INTO the skull (`socketFloorX < socketX`) while
  the eyeball sits proud of it, so the lit rim reads as an orbit.
- The pupil is deliberately off dead-centre, forward and slightly down,
  scaled by the authored `tilt`.
- The highlight sits up-and-forward OF THE PUPIL, never sharing its centre.
- The brow wedge's inner end is higher than its outer end, and the sign of
  authored `brow` flips it between a driven-down menace and a lifted, softer
  regal or dopey line. There is no symmetric hard edge around the eye.

Teeth are separated free-standing wedges, five per side per jaw, each with
its own base, so the silhouette shows real gaps rather than a grille. They
are placed station by station against the LIVE body band at that station, so
the row follows the snout taper instead of running off the tip. Upper teeth
ride `Head`, lower teeth ride `LowerJaw`, so the grin opens with the bite.

The `face` column is now load-bearing: `eye` scales the socket and eyeball,
`pupil` scales the pupil, `tilt` drives pupil offset and eye-line rake,
`brow` drives the brow wedge shape and sign, and `gape` still feeds the jaw
rest gape. Authored values were left as-is; they already carried a good
spread and the new geometry finally reads them.

## Two bugs found and fixed during the pass

1. **Lower teeth flew across the body.** `LowerJaw` is pre-rotated open by
   the rest gape, so authoring lower teeth at the raw lip line threw them
   down and away. A hand-rolled Y/Z counter-rotation was NOT sufficient,
   because the jaw rest frame also carries a large Z rotation (measured
   euler z about 2.94 rad). Fixed by pre-multiplying by the inverse of the
   jaw's posed matrix (`bindMatrixInverse * jaw.matrixWorld`, inverted) via
   the new `toothAt` builder entry point. Tooth station span went from
   0.065..0.888 (teeth strung to the tail, visible as floating specks above
   the head) to 0.065..0.180.
2. **The face overlay perturbed length normalization.** A slightly proud eye
   or tooth changed the measured bbox X and broke the exact length contract
   (`leviathan_rex: bbox X 209.207 != 211.200`). Fixed by marking the batch
   `rfExcludeFromBounds` and skipping such meshes in `measureBox`, the same
   spirit as the existing `rfFrozenBounds` handling. The face is cosmetic and
   must never drive the authoritative length.

## Gates

`node --check shark3d.js` clean.
`node --import ./tools/reg.mjs tools/selftest.mjs art3d fish` -> art3d
pass=true ok=5 fail=0, fish pass=true ok=8 fail=0.

New numeric gates in `__selftest`, applied to all 86 rows, in geometry space.
Each is the numeric stand-in for one part of the "robotic" verdict:

| gate | bound | meaning |
|---|---|---|
| `socketDepthRatio` | > 0.05 | not a flat disc |
| `pupilOffsetRatio` | > 0.06 | pupil not dead-centre |
| `pupilRadiusRatio` | 0.20 - 0.80 | pupil reads, does not swallow the eye |
| `highlightConcentric` | > 0.15 | highlight not concentric with the pupil |
| `highlightRadiusRatio` | 0.10 - 0.50 | highlight reads at gameplay size |
| `toothGapRatio` | > 0.15 | separated teeth, not a grille |
| `toothCount` | >= 12 | a real grin |
| `browAsymmetry` | > 0.40 | no symmetric hard edge |

Measured roster ranges over all 86 rows: socketDepthRatio 0.159..0.499,
pupilOffsetRatio 0.085..0.349, pupilRadiusRatio 0.331..0.660,
browAsymmetry 1.556..2.276. Every value clears its bound with margin, and
the spread confirms the face column drives per-row variation rather than a
constant.

Rendered-pixel gate: `tools/face_eyecheck.py` (with `tools/face_headcrop.py`
for the 3x head crops) asserts a small, bright, low-saturation blob exists in
each head crop, which a flat disc eye cannot produce. All 8 lineup rows pass;
highlight pixel counts 36..1930, maxV 0.839..0.867.

Real-GL render is clean: 0 GLSL and 0 page errors across the lineup. The only
console line is the pre-existing service-worker scope warning from the probe
harness, which is unrelated to this lane.

Budget: 4 draws per shark and 8304 tris worst case (hammerhead), against the
100 draw / 55k tri kaiju budget. The face batch costs 228 triangles and adds
no textures. The per-shark draw gate moved 3 -> 4 and the Sharkjira mesh-count
assertion 3 -> 4 to account for the new batch; both are still exact.

## Evidence

Before: `scratchpad/face_before/` and `scratchpad/face_before_crop/`
After: `scratchpad/face_after/` and `scratchpad/face_after_crop/`
IDs: reef, tiger, hammerhead, greatwhite, megalodon, voltaicrex, zeusfin,
typhonmaw.

Judged against the HSE reference. Before, every head showed a flat dark disc
with no socket, no pupil and no highlight, and tiger read identically to
zeusfin. After, tiger reads as menace (heavy low brow, narrowed green iris),
zeusfin as regal (wide pale eye, high lifted brow), reef as an alert friendly
scout, and typhonmaw as a heavy old-god monster with a deep orbit and orange
iris. All carry a socket, lid, brow line, offset pupil, catch-light, and a
separated-tooth grin along the jaw.

## Residuals

- Tooth count is a fixed 5 per side per jaw for every row. A megalodon or
  typhonmaw would justify a denser row than a reef scout; `bulk`/`sculpt`
  belong to other lanes, so this was left alone rather than reaching outside
  the face column.
- `highlightRadiusRatio` and `toothGapRatio` are currently constant across
  the roster (0.260 and 0.400). They are gated as ranges rather than fixed
  values so a future lane can vary them per personality without touching the
  gate.
- `grinGeometry` / `mountGrin` remain dead code: `propKind` has no 'grin'
  entry in `PROP_ALLOWLIST`, so the grin prop path is unreachable. The new
  face batch supersedes it. Left in place rather than deleted, since prop
  plumbing is shared with other lanes.
- The jaw rest gape constants (`JAW_REST_GAPE` 0.28, `JAW_MAX_ROTATION` 0.72)
  were left unchanged. Once the lower teeth were authored in the jaw's own
  frame the rest pose already reads as a grin, so changing the gape would
  have moved the 20-35% cruise contract for no visual gain.

---

# Rev 13 lane FACE, fix pass

Addresses the lineup review: floating tooth specks above the back and a
detached cluster below the jaw on the kaiju rows, a scattered lower fringe on
greatwhite/reef/megalodon, and typhonmaw's oversized flat eye.

## Root cause

The previous pass authored teeth against the BIND-space body band. That is the
wrong frame. Head and LowerJaw carry a per-row non-uniform scale from the
armature and personality passes, measured against the same rig:

| row | Head bone scale | LowerJaw scale |
|---|---|---|
| reef | 1.000, 1.000, 1.000 | 1.000, 1.000, 1.000 |
| megalodon | 2.100, 1.006, 2.099 | 1.390, 1.158, 1.265 |
| typhonmaw | 2.752, 1.069, 2.750 | 1.626, 1.210, 1.510 |
| leviathan_rex | 1.685, 1.003, 1.684 | 1.561, 1.268, 1.554 |

Skinning then resolves one fixed bind station to a different place on every
row. Reef, whose bones are unscaled, looked fine; the scaled rows did not.
Measured before the fix, in skinned space, as a fraction of the body span:

| row | upper row station | lower row station | teeth >0.06 off the body |
|---|---|---|---|
| reef | 0.361..0.490 | 0.370..0.391 | 0/100 |
| greatwhite | 0.379..0.524 | 0.386..0.409 | 4/100 |
| megalodon | 0.485..0.717 | 0.513..0.543 | 35/100 |
| typhonmaw | 0.538..0.821 | 0.563..0.596 | 47/100 |
| leviathanrex | 0.430..0.588 | 0.027..0.141 | 34/100 |
| leviathan_rex | 0.347..0.500 | -0.037..0.079 | 27/100 |

Two separate faults, one cause. The upper row stretched with the Head scale
and marched back over the skull, which is the trail of specks above the back.
The kaiju lower row landed at station 0.027 and even -0.037, ahead of the
nose and nowhere near its own upper row, which is the detached chin cluster.

A third contributor: the band's `side` was the widest point of the whole Y
slice. The head is widest at the CHEEK, while the lip is lower and narrower
(typhonmaw: cheek 0.0218 against a 0.0123 lip), so seating a tooth at 0.9 of
the cheek width put it in open water beside the face.

## What changed

All inside the face lane's own region.

- `faceSkinnedMouth(body)` - new. Classifies body vertices by Head and
  LowerJaw skin weight in SKINNED space and returns the overlap of the two
  influences. That overlap is the mouth line on every row regardless of how
  the bones were scaled.
- `faceSkinnedBand(points, y, tolerance, lipFraction)` - new. The head
  silhouette at one Y slice, with the width sampled only among points near
  the given lip depth instead of the slice maximum.
- The tooth loop now authors both rows in skinned space and pushes each
  vertex back through its OWN bone's inverse, so it lands on the lip once
  skinning re-applies the bone. Upper teeth ride Head, lower ride LowerJaw,
  so the grin still opens with the bite.
- `toothAt` takes an optional spread vector. The tooth's width runs along the
  body length axis, which is no longer local +Y after the bone inverse, so
  the spread is transformed as a direction rather than assumed.
- Tooth size and every seat offset are keyed to the MOUTH (`toothPitch`), not
  the body span. Body-span sizing inflated teeth on the bulky rows, whose
  head is a much larger fraction of the body: measured tooth extent ran 0.014
  span on reef against 0.041 on leviathan_rex, which is what read as
  oversized fangs fringing the chin.
- The grin uses only the forward 0.10..0.42 of the Head/LowerJaw overlap. The
  overlap runs back past the mouth corner into the throat on the bulky rows.
- Eye: the authored `face.eye` floor moved 0.55 -> 0.34 so a small authored
  eye stays small, and the socket is now scaled by the head half-width at the
  eye line rather than the body span. typhonmaw authors `eye: 0.64`, an
  old-god squint; the old floor plus body-span sizing rendered it as the flat
  red plate the review called out. This is the "pull toward the personality
  value rather than a floor" the review asked for.

## Measured after

Every tooth on all 86 rows is inside the head span, in the pose it renders in:

    total teeth outside head span, 86 rows: 0

Distance from each tooth to the live head/jaw surface, as a fraction of head
length, worst rows of the roster:

| row | median | max |
|---|---|---|
| cerberusjaw | 0.0846 | 0.3785 |
| howler | 0.0768 | 0.2884 |
| chimerashark | 0.0802 | 0.2872 |
| heracrown | 0.1058 | 0.2841 |
| typhonmaw | 0.0926 | 0.2558 |

The max outliers are a single back tooth on short-jawed rows and were checked
by render (cerberusjaw crop): the row sits on the jaw line, nothing floats.

## New gates

In `__selftest`, applied to all 86 rows, from the metrics the builder now
returns. The first is the direct numeric stand-in for the reported defect:

| gate | bound |
|---|---|
| `toothOutsideHeadSpan` | exactly 0 |
| `toothSurfaceMedianRatio` | < 0.16 |
| `toothSurfaceMaxRatio` | < 0.45 |
| `socketDepthRatio` | > 0.05 |
| `pupilOffsetRatio` | > 0.06 |
| `toothGapRatio` | > 0.15 |
| `toothCount` | >= 12 |

The gate was proved to bite: widening the grin window back out to the full
overlap fails with `reef: 60 teeth outside the head span`, and the shipped
code passes.

`node --check shark3d.js` clean.
`node --import ./tools/reg.mjs tools/selftest.mjs art3d fish` -> art3d
pass=true ok=5 fail=0, fish pass=true ok=8 fail=0.

Budget unchanged: 4 draws worst case, 10008 tris (hammerhead), face batch
still 228 triangles, no new textures. Real-GL render clean, 0 GLSL and 0 page
errors; the only console line is the pre-existing service-worker scope
warning from the probe harness.

## Evidence

Before: `scratchpad/face_fix_before_crop/`
After: `scratchpad/face_fix_after_crop/`
IDs: reef, greatwhite, megalodon, typhonmaw, leviathanrex, leviathan_rex.

leviathanrex before shows the speck trail above the back and the tooth
cluster hanging below the jaw; after, both are gone and the grin sits on the
lip. reef and greatwhite read as a true toothy grin along the lip line rather
than a fringe under the chin. megalodon shows separated teeth on the jaw
line. typhonmaw's eye is now a narrow angry squint instead of a flat red disc.

## Residuals

- `toothSurfaceMaxRatio` reaches 0.38 on cerberusjaw, a very short-jawed row
  where the last tooth of the row sits slightly proud. Visually clean at
  gameplay size; gated at 0.45 so a regression is still caught.
- Tooth count is still a fixed 5 per side per jaw. A megalodon would justify
  a denser row than a reef scout, but that reaches into `bulk`/`sculpt`,
  which belong to other lanes.
- `grinGeometry` / `mountGrin` remain unreachable dead code, as before.
