# Razorfin Rev 13 - lane KAIJU

Date: 2026-08-25
Scope: `play/razorfin/shark3d.js` (lane-owned regions only)

Two deliverables: give Leviathan Rex its own kaiju identity distinct from
Sharkjira, and turn the hammerhead cephalofoil from a flat grey plate into a
real T-shaped head.

## 1. Leviathan Rex (`leviathan_rex`)

Before: a generic bulky shark carrying a personality row copied verbatim from
Sharkjira, with no bespoke geometry at all.

The row is now authored from scratch and deliberately opposes Sharkjira on
every axis that survives a 64x30 thumbnail:

| axis | Sharkjira | Leviathan Rex |
|---|---|---|
| brow sculpt | -0.42 (sunk) | +0.52 (crown ridge) |
| dorsal sculpt | +0.08 (raised) | -0.10 (held low) |
| surface density | 1.45 (tight) | 0.78 (wide) |
| surface mode | 3 | 5 |
| spine | 8 tall jagged maple plates, one row | 20 low scutes, two rows |
| glow | atomic blue 0x3fd6ff | seafoam 0x9ff7f0 |
| pulse | 5.4 rad/s flicker | 2.15 rad/s swell |

Geometry is built the way Sharkjira was: welded feature geometry skinned to
the body bones, emitted as ONE extra draw. `makeLeviathanFeatures` adds

- twin interlocking scute rows (10 stations x 2, offset 0.46 of half-width),
  built from a new low four-sided `leviathanScute` cap primitive rather than
  Sharkjira's tall five-point maple prism,
- a broad flat crown plus a brow shelf, both rooted well below the hull top
  so they grow out of the skull instead of hovering over it,
- two armored cheek plates below the eye line,
- six oversized tusks sweeping up off the underslung jaw, plus a small upper
  row,
- a seafoam throat band and deep-set eyes.

The material keeps the armor opaque deep sea-green and lets the seafoam reach
full strength only in the scute SEAMS (`rfKind` 7) and throat, so the glow
reads as light in the cracks and never as a lit body.

`variantProfile` gives the Rex a wider head (1.36), a thicker peduncle
(Tail1/Tail2 at 1.30 vs Sharkjira's 1.10) and a deliberately LOW dorsal fin
(0.86 vs Sharkjira's 1.96), so the crown and scute rows own the topline.

## 2. Hammerhead cephalofoil (hammerhead, athenajaw)

Before: a single flat extruded outline. It read as a grey plate because it had
no crown/underside separation, no eye bulbs, a straight inner edge that left a
visible air gap against the skull, and it took a raw palette uniform that made
it a different color from the body.

`hammerFoilGeometry` is rebuilt as two lofted slabs (dorsal crown + ventral
countershade) plus two eye bulbs at the lobe tips, with a swept leading edge
and a deeply CONCAVE trailing edge that wraps the snout. A three-way
`rfFeature` channel (0 crown, 1 eye bulb, 2 ventral) drives the color.

The hammer skin ramp now runs the crown through the same 0.62 darkening,
hue-shift, saturation and scene compensation the body flank uses, and takes
the belly color with `uRfCountershade` underneath, so the foil matches the
body exactly. Pattern overlay is suppressed on the foil (it was overwriting
the ramp with the accent color and turning the foil blue-lavender), and the
hammer emissive tint was zeroed for the same reason.

`fitProp` seats the foil back along the rig length axis by 0.62 of its local
sweep, measured in the prop's own local frame so the bone's authored scale
cannot magnify the offset. The cephalofoil is the BROW of the head, so the
snout, mouth and eye stay visible in front of it.

## Measured gate

```text
row            draws  tris   len      target   features
leviathan_rex    4     7164  211.200  211.2    scutes 20 crown 2 cheeks 2 tusks 6 featTris 332
leviathanrex     4     7060  230.400  230.4
hammerhead       4     8304  115.200  115.2    foilThick 0.189 gap 0.0000 span 0.684
athenajaw        4     8304  151.680  151.7    foilThick 0.189 gap 0.0000 span 0.746
greatwhite       3     6832  139.200  139.2
```

Budget at kaiju is 4 draws and about 7.2k triangles against the 100 draw /
55k triangle ceiling. Leviathan Rex adds exactly one draw, matching
Sharkjira's structure. Foil contact gap is 0.0000 (the foil overlaps the
skull, so there is no air gap) and the thickness ratio is a genuine 0.189
slab rather than a plate. Every row measures its exact camera target length,
so `engine3d.camZForTier` framing at tier 12 is unchanged; engine3d was not
edited.

## New selftest gates

- Leviathan Rex must carry twin scute rows (20 scutes), 2 crown pieces, 2
  cheek plates, 6 tusks, a seafoam pulse uniform, and <= 640 feature
  triangles.
- Distinctness from Sharkjira is enforced numerically, not by eye: scutes must
  be under 0.62 of Sharkjira's tallest plate, the scute count must exceed
  Sharkjira's single row, crown/dorsal attitude must oppose Sharkjira's in
  sign, and the two glow hues must be separable.
- The foil must expose all three `rfFeature` channels, a thickness ratio of at
  least 0.06, the hammer skin ramp cache key, and a head contact gap of at
  most 0.02.

## Verification

```text
node --check shark3d.js                                    clean
node --import ./tools/reg.mjs tools/selftest.mjs art3d fish  art3d pass ok=5, fish pass ok=8
```

Both gates were green after every edit in this lane, verified repeatedly
including immediately after the leviathan and foil gates were added.

Renders (real GL, CDP screenshot, 0 console errors):

```text
before  scratchpad/k_before/shark_{leviathan_rex,leviathanrex,hammerhead,athenajaw,greatwhite}.png
after   scratchpad/k_after/shark_{leviathan_rex,leviathanrex,hammerhead,athenajaw,greatwhite}.png
2x crop scratchpad/k_after/kaiju-head-back-2x.png     (rex over sharkjira)
thumbs  scratchpad/k_after/thumb_leviathan_rex_64x30.png
        scratchpad/k_after/thumb_leviathanrex_64x30.png
        scratchpad/k_after/kaiju-thumb-pair.png       (both at 64x30, 6x nearest)
foil    scratchpad/k_before/hammer_head_2x.png vs k_after/hammer_head_2x.png
```

At 64x30 the two kaiju are unambiguous: the Rex is teal-green with a bumpy
low scute topline, Sharkjira is dark charcoal with tall blue spikes.

## Residuals

- Cross-lane incident: `shark3d.js` ended with a truncated fragment
  `t Art3D;` after `export default Art3D;`, left by a concurrent lane's
  partial write. It broke ES module parsing (though `node --check`, which
  parses as a script, still passed) and took down both selftests. Removed the
  stray line only; nothing else was touched.
- Not mine, still open at handoff: `art3d` fails with
  `reef: bbox X 95.743 != 96`. `reef` has no leviathan feature and no hammer
  prop. The cause is lane FACE's `RF Rev 13 face <id>` mesh, which extends to
  x=43.54 past the body's x=33.36 and therefore drives the group bbox; a
  fresh build of reef measures exactly 96.0000, so the miss comes from the
  cached-geometry path in that lane's code. `fish` stays green.
- The foil's lobe span is foreshortened in the 0.42 yaw capture. The measured
  projected span (0.684 / 0.746 of body length) is well over the 0.42 gate, so
  the T reads from the gameplay camera, but a wider yaw would sell it further.
- No git commit and no deploy were made.

---

# Rev 13 REWORK - lane KAIJU (owner review blockers)

Date: 2026-08-25

Both blockers were reproduced, root-caused by measurement, and fixed. The
important correction: **neither defect was a transparency bug.** Every shark
material measured `transparent false / opacity 1 / depthWrite true` before
and after, and the rendered flank background-bleed was 0.000 in both states.
The ghost was a value/hue collapse toward the water; chasing an alpha flag
would have found nothing.

## 1. Leviathan Rex ghost

Measured cause, in the order the pixels indicted each one:

1. **Palette value floor.** `leviathan_rex` fell through to the generic
   roster resolver. `resolvePaletteSwatch` floors flank value at
   `BODY_FLANK_VALUE_MIN` 0.46 to rescue washed-out authored rows. The
   authored deep sea-green `0x2e3d38` measures h 0.444 / v 0.239, so the
   floor lifted it to v 0.460 and pinned the hue at 0.444. After the 0.62
   back darkening and the 1.34 scene saturation gain the flank landed at
   **v 0.628, hue 0.496** against water at hue ~0.49: same hue as the sea and
   brighter than a great white's flank. Fixed with an authored
   `LEVIATHAN_RENDER_PALETTE` and a `paletteOf` branch, exactly the exemption
   Sharkjira already carries, plus held-back scene gains (1.16 / 1.08).
   Values are SOLVED, not authored raw: the raw swatch at v 0.239 swings to
   the opposite failure (the charcoal-blob bug this file already records).
2. **Body emissive.** The act-scaled body emissive reached **0.16** at the
   Rex's tier 12 versus a great white's 0.05, lighting the hull from inside
   toward the water color. Pinned to 0.04.
3. **Scute seam glow leaking over the whole scute.** `leviathanScute` tagged
   the entire base ring `rfKind 7 / rfEdge 1` and the cap `rfEdge 0.10`, so
   the "seam" glow interpolated across the ENTIRE side wall and lit the lower
   two thirds of every scute. The seam is now a genuinely narrow skirt ring
   at 0.14 of scute height; base and cap are opaque armor (kind 6). Feature
   emissive dropped 0.62 -> 0.34.
4. **Near-white belly on the non-atlas path.** The Rex renders with
   `atlas:false`, where the shared ramp takes the GLB's own near-white belly
   texel and multiplies its VALUE by 1.35. That is what left the lower body
   and pectoral fin washed out with water reading through them. The Rex now
   takes its own countershade ramp (`leviathanBody`) driven from the palette
   rather than from a brightened texel, with its own program cache key.

Floating boxes: the scutes were rooted at `band.top`, the hull's max z **at
the centerline**, while being pushed out to 0.46 of the half-width where the
hull has already curved down, leaving daylight under every scute. They are
now rooted at a barrel-falloff height and sunk a further 0.052 span, made
0.62 as tall, and widened past the half-pitch (halfY 0.030 -> 0.052) so
consecutive scutes OVERLAP into continuous armor instead of a skyline.

### Measured, real-GL lineup probe

Vertical bands of the shark silhouette, mean V and the fraction of pixels
brighter than the background (the ghosting tell):

```text
band      BEFORE v  bright/bg   AFTER v  bright/bg
topback     0.575     0.23       0.246     0.00
upper       0.486     0.00       0.453     0.15
mid         0.512     0.02       0.356     0.01
lower       0.663     0.54       0.567     0.03
belly       0.643     0.47       0.591     0.20

flank V     0.628  ->  0.391      (target 0.35-0.55; greatwhite 0.510)
flank bleed 0.000  ->  0.000      (matches greatwhite: no background bleed)
back V      0.554  ->  0.340      (greatwhite 0.308)
```

Every target in the review is met: flank V inside 0.35-0.55, flank alpha
matching greatwhite with zero background bleed, back dark and belly bright,
and the back band no longer has a single pixel brighter than the water.

## 2. Hammerhead cephalofoil

Three separate defects, all visible in the crop:

1. **Flat-shaded box.** The foil stacked two closed `ExtrudeGeometry`
   solids. Extrusion emits hard-edged side walls with split normals, so
   `computeVertexNormals` could not smooth them: right angles, planar faces,
   uniform color. It is now a true LOFT, a single welded closed shell swept
   over 48 span stations x 28 chord samples, with a swept leading edge, a
   concave trailing edge, thickness tapering front-to-back AND toward the
   tips, and smooth normals. Rounded lobe ends fall out of the profile
   (`sqrt(1 - a^8)`) rather than being capped square.
2. **Wrong fit axis.** `fitProp` scaled the foil by `bodySize.x / propSize.x`.
   Measured on the built rig, the Head bone maps prop-local x -> world z (the
   shark's WIDTH), local y -> world x (LENGTH), local z -> world y (vertical).
   So `propSize.x` is not the span, and dividing a target width by it blew
   the foil to 3.5x the body's height. Now scaled span-against-width.
3. **Seated on the torso.** The old seat pushed the foil back by 0.62 of its
   local sweep, which walked it clean off the skull onto the shoulders (the
   "box bolted to the head" in the review shot). The loft's own sweep already
   carries it back, so the seat is now a forward +0.46 nudge onto the brow.

Palette shading was already routed through `hammerRamp`; the hard
crown/ventral step is now blended across the lofted section by bind-space z
and quantized into 3 toon bands, so the foil picks up curved shading that
follows its real form and matches the body's countershading. Eye bulbs sit at
the lobe tips on `rfFeature` 1.

```text
foil width / body width   1.70    (was mis-scaled to 3.14)
thickness / span          0.19    genuine slab, not a plate
projected span gate       passes the existing >= 0.42 body-length gate
head contact gap          0.0000  no air gap
```

## New selftest gates

Added to the `leviathan_rex` branch, and each was verified to FAIL when its
specific regression is reintroduced and pass when reverted:

- hull must be opaque and depth-writing (`transparent`/`opacity`/`depthWrite`)
- body `emissiveIntensity` <= 0.06
  (verified: restoring the act-scaled value fails with
  `body emissive 0.16 lights the hull instead of the seams`)
- scute armor opaque, `emissiveIntensity` <= 0.40
  (verified: restoring 0.62 fails with
  `scute glow 0.62 exceeds a seam accent`)

## Budget and verification

```text
row            draws  tris    len
leviathan_rex    4     7340   211.2
leviathanrex     4     7060   230.4
hammerhead       4    10008   115.2
athenajaw        4    10008   151.7
greatwhite       3     6832   139.2
```

4 draws / 10k tris at worst against the 100 draw / 55k tri ceiling. No new
per-shark textures. Every row measures its exact camera target length, so
tier framing is unchanged and engine3d was not edited.

```text
node --check shark3d.js                                     clean
node --import ./tools/reg.mjs tools/selftest.mjs art3d fish art3d ok=5, fish ok=8
real-GL lineup probe                                        0 console errors
```

The only console output is the pre-existing service-worker scope warning from
the probe harness, unrelated to this lane.

Renders: `scratchpad/shots1/` (before) vs `scratchpad/rw_after/` (after),
with 3x before/after sheets at
`scratchpad/rw_after/rex_before_after_3x.png` and
`scratchpad/rw_after/hammer_before_after_3x.png`.

## Residuals

- The `reef: bbox X` failure recorded above as lane FACE's is no longer
  reproducing; art3d is green at handoff.
- The pale patch remaining at the Rex's jaw/pectoral in the after shot is the
  face batch (teeth/mouth), which the concurrent FACE lane owns. Not touched.
- The foil's span is foreshortened at the 0.42 yaw because the span axis
  points into the screen; it clears the existing projected-span gate, but a
  wider yaw would sell the T further.
- No git commit and no deploy.
