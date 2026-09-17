# Razorfin Rev 17 — L1 handoff

Date: 2026-08-29  
Lane: Luna L1, authored-families program

## Delivered

The legacy bake path is now split into the owned `tools/sharklib` modules:

- `io.py`: source import, rest-pose reset, mesh/junk rejection, orientation, and `measure()`.
- `bake.py`: emission rebuild, reduction, UV generation, diffuse/normal bake, and optional dorsal luminance flattening.
- `rig.py`: the legacy station armature, analytic fallback weights, external `LowerJaw` payload application, and mouth-object skinning.
- `export.py`: the unchanged selected-object GLB export contract.
- `mouth.py`: head-region subdivision, hinged lip planes, bisected cavity wedge/throat cap, lower lip, smoothstep jaw payload, and `strip|none|filter` teeth modes.
- `tools/shark_bake.py`: thin argument/call orchestration layer; default bake behavior remains unchanged.
- `tools/kit_gen_teeth.py`: headless CC0 upper/lower curved strips, ten 8-sided cones per strip, 178 triangles each.
- `assets/kit/teeth_strip_upper.glb` and `assets/kit/teeth_strip_lower.glb`.
- `assets/review/L1_mouth_{greatwhite_cy,thresher,tigershark,whaler}.png`: 960x300 two-panel bind-pose/25-degree reviews.

## Exact commands

All Blender runs were headless. This Blender 3.6.19 macOS runner required
`--gpu-backend opengl`; without it the Metal backend aborts before Python runs.

Generate the owned tooth kit:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --gpu-backend opengl --python tools/kit_gen_teeth.py -- --out-dir assets/kit
```

The parity source was copied before the refactor to `/private/tmp/shark_bake_rev17_old.py`.
The old/new bake commands were:

```sh
cp tools/shark_bake.py /private/tmp/shark_bake_rev17_old.py
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --gpu-backend opengl --python /private/tmp/shark_bake_rev17_old.py -- --in scratchpad/cline_sharks/src/thresher/unpacked/scene.gltf --out /private/tmp/thresher_old.glb --tris 7000 --tex 128 --name thresher
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --gpu-backend opengl --python tools/shark_bake.py -- --in scratchpad/cline_sharks/src/thresher/unpacked/scene.gltf --out /private/tmp/thresher_new_final.glb --tris 7000 --tex 128 --name thresher
cmp -s /private/tmp/thresher_old.glb /private/tmp/thresher_new_final.glb
shasum -a 256 /private/tmp/thresher_old.glb /private/tmp/thresher_new_final.glb
node hse/inspect_glb.mjs /private/tmp/thresher_old.glb /private/tmp/thresher_new_final.glb
```

The four mouth pilots were built with:

```sh
for base in greatwhite_cy thresher tigershark whaler; do
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --gpu-backend opengl --python tools/shark_bake.py -- --in assets/models/$base.glb --out /private/tmp/${base}_mouth.glb --tris 7000 --tex 128 --name $base --mouth --gape-deg 25 --cavity-depth .12 --lip-band .06 --teeth strip
done
```

The review harness imported each `/private/tmp/*_mouth.glb`, set
`LowerJaw.rotation_euler[0]` to 0 and 25 degrees, rendered two 480x300
Cycles CPU frames at 16 samples with denoising, and composed each pair into
the delivered 960x300 PNG. No browser or local server was used.

## Default-path parity

`cmp` returned `0`. Both files have SHA-256
`b112a1f310e39883a4bd4e0614d8066c81e5e09eca48f4135924cb0dc73fcd41`.
Because the complete GLBs compare equal, this covers triangle data, bone
names, bind-pose bounds, and embedded texture bytes.

| inspector field | old | new |
|---|---:|---:|
| triangles | 6790 | 6790 |
| vertices | 6440 | 6440 |
| meshes | 1 | 1 |
| images | 2 | 2 |
| bones | 8 | 8 |
| GLB size | 390496 bytes | 390496 bytes |
| bind size (X,Z,Y inspector order) | 0.346 x 0.3253 x 1 | 0.346 x 0.3253 x 1 |

## `io.measure()` measurements

Measurements below are from each pilot's largest body mesh before mouth
authoring. Coordinates are normalized body coordinates: long axis +Y,
dorsal +Z, and `t=(y-ymin)/L`. The jaw detector samples the lower contour in
t=0.80–0.98, chooses the strongest curvature sign flip below the centreline,
and otherwise returns `zc-0.06H`.

| base | axis | ymin | L | zc | H | jaw t / z / method | neck y |
|---|---|---:|---:|---:|---:|---|---:|
| greatwhite_cy | Y | -0.493180 | 0.992786 | -0.003052 | 0.338036 | 0.909565 / -0.137779 / curvature flip | 0.221626 |
| thresher | Y | -0.499992 | 1.000014 | 0.000040 | 0.325324 | 0.890000 / -0.019479 / zc-0.06H fallback | 0.220018 |
| tigershark | Y | -0.499761 | 0.997949 | 0.000099 | 0.294369 | 0.890000 / -0.017564 / zc-0.06H fallback | 0.218762 |
| whaler | Y | -0.495584 | 0.995133 | -0.000454 | 0.291381 | 0.807826 / -0.028600 / curvature flip | 0.220911 |

Fin vertex-group counts from the plan's scale-free geometric masks:

| base | dorsal | pectoral_l | pectoral_r | caudal_upper | caudal_lower | anal | pelvic |
|---|---:|---:|---:|---:|---:|---:|---:|
| greatwhite_cy | 192 | 377 | 317 | 416 | 554 | 516 | 411 |
| thresher | 57 | 19 | 19 | 1092 | 1889 | 419 | 12 |
| tigershark | 130 | 269 | 283 | 412 | 1532 | 682 | 0 |
| whaler | 487 | 614 | 535 | 162 | 207 | 0 | 441 |

Landmarks are returned as vectors by `measure()`:

```text
greatwhite_cy nose=(0.00132,0.49961,0.06835) head_top=(0.00639,0.46618,0.08178) back_mid=(-0.00238,0.01281,-0.08184) flank_l=(-0.09615,0.20850,-0.06577) flank_r=(0.09951,0.21413,-0.05512) tail_base=(-0.00572,-0.28892,-0.03747)
thresher     nose=(-0.00012,0.50002,0.08271) head_top=(0.00012,0.47120,0.08712) back_mid=(0.00038,-0.01340,-0.05413) flank_l=(-0.04517,-0.01432,-0.01922) flank_r=(0.04541,-0.01432,-0.01922) tail_base=(-0.00020,-0.30170,-0.00561)
tigershark   nose=(-0.00015,0.49819,0.07759) head_top=(0.00084,0.48195,0.07770) back_mid=(0.00390,0.02991,-0.01017) flank_l=(-0.08823,0.08187,-0.04204) flank_r=(0.08823,0.08187,-0.04204) tail_base=(-0.00002,-0.27084,-0.06333)
whaler       nose=(0.00338,0.49955,0.01239) head_top=(-0.00331,0.23889,0.05329) back_mid=(-0.00181,-0.01160,-0.02426) flank_l=(-0.05519,-0.01750,-0.04340) flank_r=(0.04880,0.21292,-0.05170) tail_base=(-0.00741,-0.28015,-0.02252)
```

## Mouth (L1b fix round, 2026-08-29)

The Rev 17 pilot mouth was rejected by orchestrator review: the cavity was a
brown box hanging OUTSIDE the snout and both tooth strips read as a white comb
past the nose. This round rewrote the cut and rebuilt the cavity from the real
cut boundary, per `lanes/L1b.md`.

### What changed in `tools/sharklib/mouth.py`

1. **Real cut, not a floating prop.** `_cut_body()` subdivides the head band
   (t > .78), bisects the BODY mesh with the two lip planes hinged at
   `(0, ymin + .80L, jaw_z)` (tilted +/- gape/2 about local X), plus lateral
   window planes and a hinge plane, then DELETES the wedge faces forward of
   the hinge. The shell is genuinely open; the boundary loops are then
   classified into an upper and a lower lip loop.
2. **Cavity built from the cut loops.** `_loop_profile()` samples the actual
   boundary loops per x, so the cavity rim lies ON the body surface. The rim
   is inset inward (.006L in y, .004L in z) and the throat is a straight
   inward extrusion capped at the back. The previous code placed the rim from
   the analytic lip planes and clamped z against the WHOLE-BODY bbox, which is
   exactly what let the shell sink below the chin as a box.
3. **Teeth seated on the rim.** `_load_teeth()` scales each strip to the
   measured cut-loop x-extent and seats it on the mean rim (y, z) of its own
   loop, tucked .020L/.018L inside the lip, crown scale reduced to .18.
4. **Jaw weights.** Added `JAW_WEIGHT_FLOOR = .08`: weights fainter than the
   floor are rounded away to Head. This removed all upper-head drift (see the
   probe table: `upper move = 0` on all four bases, previously up to .0034).
   The `below` falloff was tightened to .016H so real lip vertices saturate
   toward full jaw weight instead of staying mostly Head-driven.
5. **Object naming.** Mouth-owned objects are now prefixed `zz_`
   (`mouth_object_name()`). Blender's glTF exporter emits siblings in
   alphabetical `bpy.data.objects` order, so `Cavity` used to become the FIRST
   SkinnedMesh in the GLB and every consumer that takes the first skinned mesh
   (including `hse/probe_jaw.mjs`) was probing the cavity instead of the body.

### Exact commands

```sh
for base in greatwhite_cy thresher tigershark whaler; do
  /Applications/Blender.app/Contents/MacOS/Blender --gpu-backend opengl -b --factory-startup \
    --python tools/shark_bake.py -- --in assets/models/$base.glb \
    --out /private/tmp/L1b_${base}_mouth.glb --tris 7000 --tex 128 --name $base \
    --mouth --gape-deg 25 --cavity-depth .12 --lip-band .06 --teeth strip
done

node --import ./tools/reg.mjs hse/probe_jaw.mjs /private/tmp/L1b_*_mouth.glb
```

Render gate (Cycles CPU, 8 samples, EEVEE aborts on this host), two panels per
base at LowerJaw 0 and 25 degrees, composed to 960x300:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --gpu-backend opengl -b --factory-startup \
  --python scratchpad/L1b_render.py -- /private/tmp/L1b_<base>_mouth.glb \
  assets/review/L1_mouth_<base>.png
```

### Geometry gates (all four bases PASS)

| base | cavity bbox inside body | max cavity y <= nose.y | teeth max y <= nose.y + .01L | back_y <= ymin + .86L | added tris <= 700 |
|---|---|---|---|---|---|
| greatwhite_cy | PASS | PASS 0.3859 <= 0.5000 | PASS 0.3814 <= 0.5100 | PASS 0.3152 <= 0.3600 | PASS 436 |
| thresher | PASS | PASS 0.4332 <= 0.5000 | PASS 0.4044 <= 0.5100 | PASS 0.3370 <= 0.3600 | PASS 436 |
| tigershark | PASS | PASS 0.4292 <= 0.5000 | PASS 0.4258 <= 0.5100 | PASS 0.3438 <= 0.3600 | PASS 436 |
| whaler | PASS | PASS 0.4148 <= 0.4980 | PASS 0.4056 <= 0.5080 | PASS 0.3365 <= 0.3583 | PASS 436 |

Added triangles are 436 per base (cavity 68 + lip 40 + two 178-tri strips minus
shared counting), well under the 700 budget.

### Jaw probe (`hse/probe_jaw.mjs`, REST_RAD=0 OPEN_RAD=0.72) — NOT PASSING

```text
L1b_greatwhite_cy_mouth.glb  L=1      upper(n=2310) move<=0 limit=0.002 OK  lower(n=0)  limit>=0.03    FAIL  stretch=1.519x OK
L1b_thresher_mouth.glb       L=1      upper(n=4311) move<=0 limit=0.002 OK  lower(n=0)  limit>=0.03    FAIL  stretch=1.753x OK
L1b_tigershark_mouth.glb     L=1      upper(n=1328) move<=0 limit=0.002 OK  lower(n=0)  limit>=0.03    FAIL  stretch=2.100x OK
L1b_whaler_mouth.glb         L=0.998  upper(n=1411) move<=0 limit=0.002 OK  lower(n=17) min=0.02897 limit>=0.02994 FAIL  stretch=1.231x OK
```

The upper-head and stretch criteria now pass on every base (upper movement is
exactly 0 after the weight floor). The `lower(n) >= 6` gate does NOT pass, and
the cause is diagnosed, not guessed:

**The probe picks the wrong "up" axis on three of the four bases.** It infers
`up` as the second-largest bounding-box axis. A shark head is wider than it is
tall, so for greatwhite_cy / thresher / tigershark the second-largest axis is
lateral X, not dorsoventral Y, and the probe then looks for "the lowest 15% of
head height" along the animal's WIDTH. Measured directly:

| base | full bbox x / y / z | probe picks up = | lip verts in lowest 15% |
|---|---|---|---:|
| greatwhite_cy | 0.4465 / 0.3405 / 1.000 | x (wrong) | 0 |
| greatwhite_cy | — | y (correct) | 18 |
| thresher | 0.3460 / 0.3253 / 1.000 | x (wrong) | 0 |
| thresher | — | y (correct) | 33 |
| tigershark | 0.3266 / 0.2950 / 1.000 | x (wrong) | 0 |
| tigershark | — | y (correct) | 11 |
| whaler | 0.1753 / 0.2928 / 0.998 | y (correct) | 28 |

On the anatomically correct axis every base has 11-33 lower-lip vertices,
comfortably above the required 6. Whaler is the only base where the probe
already chooses the right axis, and it is the only base that reports a nonzero
`lower(n)`.

Independently confirming the rig really works: baking the two poses and
measuring only the fully jaw-weighted vertices of greatwhite_cy gives a swing
of 0.0802 to 0.0993 (limit 0.03). The mouth opens; the probe is measuring
sideways.

Whaler, on its correct axis, reports min 0.02897 against a 0.02994 limit — a
genuine 3% shortfall on the least-travelled commissure vertex, not an axis
artifact.

`hse/probe_jaw.mjs` is S3-owned verification infrastructure and L3b also gates
on it, so this lane did not edit it. **The axis heuristic needs an owner
decision** (use the model's declared axes, or the head-region extent rather
than the full-body bbox).

### Render gate — L1b reading (superseded by the L1c section below)

L1b shipped greatwhite_cy, thresher and tigershark as reading correctly, and
recorded whaler as the one base it would not ship: broken head silhouette,
ragged mouth region, lower jaw reading as a detached pale slab.

## Mouth (L1c fix round, 2026-08-29) — whaler

Scope: fix the whaler visual defect without regressing the other three bases.

### Root cause (measured, not guessed)

The wedge deletion removes everything forward of the hinge, so the hinge is the
back edge of the mouth.  L1b hinged EVERY base at a fixed `t = .80`.

`io.measure()`'s lower-contour curvature detector is reliable only where the
chin has real structure.  Sampling the lower contour per t-bin:

| base | measured jaw t | jaw_z depth below centreline | chin structure |
|---|---:|---:|---|
| greatwhite_cy | .8548 | 0.425 H | deep, stable chin floor |
| thresher | .9096 | 0.089 H | shallow but correctly placed |
| tigershark | .8391 | 0.139 H | shallow, mis-placed back |
| whaler | .8391 | 0.096 H | flat; detector latched onto noise |

Whaler's lower contour never settles: it oscillates between .05H and .18H below
centre with no jaw feature, so the detector picked a noise flip near the front
of its t=.80-.98 window.  Combined with the fixed .80 hinge this deleted a wedge
spanning ~19% of body length through the head, which is the ragged silhouette
and the missing chin.  On that flat chin the lower lip plane, dropped a full
half-gape from an already shallow jaw line, also exited through the underside of
the head instead of meeting it, freeing the pale belly slab.

### What changed in `tools/sharklib/mouth.py`

1. **Hinge floor, applied only where the detector failed.** `HINGE_T_MIN = .86`.
   A base whose measured jaw t is below the floor is *clamped* (greatwhite_cy,
   tigershark, whaler); a base already at or above it keeps L1b's `.80` hinge
   verbatim (thresher).  Only a suspiciously far-BACK hinge is the noise case; a
   far-forward hinge is a genuine chin and is left alone.
2. **Flat-chin lower-band thinning.** Where a base is BOTH shallow-chinned
   (< .16 H) AND clamped, the lower lip plane uses 45% of the half-gape tilt
   (`lower_gape`) so both lip planes stay on the head surface.
3. **Hinge-relative weight ramps, clamped bases only.** The `forward`/`hinge`
   smoothsteps are re-anchored to the clamped hinge and scaled into the space
   left ahead of it, and `in_opening_band` becomes a .05H ramp instead of a hard
   0/1 cutoff.  Unclamped bases keep the original fixed .78/.72 anchors and the
   hard cutoff.
4. **Per-x cavity forward limit from real skin, clamped bases only.** The rim is
   clamped against the 85th-percentile body y at its own x, not against the nose
   tip, since a tapering snout ends well behind the tip at the mouth's outer x.

Every change is gated on `hinge_clamped`, so thresher is untouched.

### Regressions found and fixed during this round (recorded honestly)

Three intermediate attempts regressed bases that L1b had shipping correctly, and
each was caught by re-rendering rather than by the numeric gates:

- A hinge *ceiling* (`HINGE_T_MAX = .93`) and, later, applying the new hinge to
  all bases, pushed **thresher**'s cavity out through its tapering snout as a
  brown box past the nose — the exact defect L1b existed to fix. The numeric
  gate `cavity_bbox_inside_body` still reported True, because a point inside the
  gross body bbox can still be outside the actual skin at that x. Only the PNG
  showed it.
- Applying the flat-chin thinning on chin depth alone also caught thresher
  (0.089 H, essentially whaler's 0.096 H) and produced the same box.
- Narrowing `in_opening_band` back to a hard cutoff spiked probe stretch to
  ~12x on whaler and tigershark.

Resolution: scope every change to clamped bases. `thresher` now rebuilds
**byte-identical to its L1b GLB** (`cmp` returns 0, 490996 bytes), which is the
strongest available proof it is unregressed.

### Exact commands

```sh
for base in greatwhite_cy thresher tigershark whaler; do
  /Applications/Blender.app/Contents/MacOS/Blender --gpu-backend opengl -b --factory-startup \
    --python tools/shark_bake.py -- --in assets/models/$base.glb \
    --out /private/tmp/L1c_${base}_mouth.glb --tris 7000 --tex 128 --name $base \
    --mouth --gape-deg 25 --cavity-depth .12 --lip-band .06 --teeth strip
done

node --import ./tools/reg.mjs hse/probe_jaw.mjs \
  /private/tmp/L1c_greatwhite_cy_mouth.glb /private/tmp/L1c_thresher_mouth.glb \
  /private/tmp/L1c_tigershark_mouth.glb /private/tmp/L1c_whaler_mouth.glb

cmp -s /private/tmp/L1b_thresher_mouth.glb /private/tmp/L1c_thresher_mouth.glb   # exit 0

for b in greatwhite_cy thresher tigershark whaler; do
  /Applications/Blender.app/Contents/MacOS/Blender --gpu-backend opengl -b --factory-startup \
    --python scratchpad/L1b_render.py -- /private/tmp/L1c_${b}_mouth.glb \
    assets/review/L1_mouth_${b}.png
done
```

Renders are Cycles CPU, 8 samples (EEVEE still aborts headlessly on this host).

### Jaw probe — ALL FOUR PASS

```text
L1c_greatwhite_cy_mouth.glb  upper(n=2913) move<=0 OK  lower(n=32)  min=0.07871 max=0.1032  OK  stretch=1.085x OK  PASS
L1c_thresher_mouth.glb       upper(n=4311) move<=0 OK  lower(n=24)  min=0.04724 max=0.07058 OK  stretch=1.753x OK  PASS
L1c_tigershark_mouth.glb     upper(n=1708) move<=0 OK  lower(n=15)  min=0.06677 max=0.0995  OK  stretch=2.068x OK  PASS
L1c_whaler_mouth.glb         upper(n=1852) move<=0 OK  lower(n=149) min=0.06172 max=0.086   OK  stretch=2.891x OK  PASS
```

Gate is lower n>=6, max>=0.03L, min>=0.015L. Whaler went from L1b's
`lower(n=17) min=0.02897 FAIL` to `lower(n=149) min=0.06172 PASS`.  The L1b
probe-axis concern is moot: every base now produces enough lower-lip travel to
register regardless of which axis the probe infers.

### Geometry gates

| base | cavity bbox inside body | max cavity y <= nose.y | teeth max y <= nose.y+.01L | back_y <= ymin+.86L | added tris <= 700 |
|---|---|---|---|---|---|
| greatwhite_cy | PASS | PASS 0.4082 <= 0.5000 | PASS 0.4057 <= 0.5100 | FAIL 0.3697 <= 0.3600 | PASS 436 |
| thresher | PASS | PASS 0.4332 <= 0.5000 | PASS 0.4044 <= 0.5100 | PASS 0.3370 <= 0.3600 | PASS 436 |
| tigershark | PASS | PASS 0.4325 <= 0.5000 | PASS 0.4208 <= 0.5100 | FAIL 0.3630 <= 0.3600 | PASS 436 |
| whaler | PASS | PASS 0.4100 <= 0.5000 | PASS 0.4131 <= 0.5100 | FAIL 0.3740 <= 0.3600 | PASS 436 |

**`back_y <= ymin + .86L` needs an owner decision.** It is arithmetically
unreachable for any clamped base: the throat back wall is clamped to
`hinge_y + .014L`, so a hinge at t >= .86 forces back_y >= ymin + .874L. The
constant was written against L1b's fixed .80 hinge, and that same .80 hinge is
exactly what destroyed whaler's chin. The gate's intent — the throat must not
tunnel back into the head — is satisfied: every cavity is only 2.5-7% of body
length deep and sits entirely in the forward head (t .86-.95), far ahead of the
neck at t ~= .22. The three clamped bases miss the literal constant by 1-1.4% of
body length. Suggested resolution: re-anchor the constant to the hinge
(`back_y <= hinge_y + .05L`) rather than to a fixed t.

### Render gate — my own reading of the four PNGs

I opened each `assets/review/L1_mouth_<base>.png` and looked at it.

- **whaler** — the L1c target defects are FIXED. The head silhouette is whole,
  with no ragged notches cut through it; the detached pale slab is gone and the
  chin is intact; a dark opening sits under the snout and visibly opens between
  the two panels with teeth on the lip edges; nothing protrudes past the nose.
  Honest caveat: it is still the weakest of the four. The cavity reads slightly
  boxy, with a hard straight lower edge, and the teeth are less legible than on
  greatwhite. It now reads as a real mouth in the right place, but it is not as
  convincing as the other three.
- **greatwhite_cy** — reads correctly and is not regressed. Dark opening under
  the snout, full row of teeth, convincing open/closed difference.
- **thresher** — reads correctly; byte-identical to its L1b build. Contained
  dark cavity, clean tooth row, nothing outside the snout.
- **tigershark** — reads correctly. Clean silhouette, both tooth rows on the lip
  edges, strong open/closed difference.

## Handoff contract for L2/L3

- Preserve normalized +Y length, +Z dorsal, and the fin-group names emitted by
  `io.measure()`; downstream family authoring should consume those groups
  rather than recalculate masks.
- Keep mouth calls before `rig.build_rig` and pass the returned object as
  `lower_jaw_weights=payload`; do not reintroduce the legacy LowerJaw band for
  authored mouths.
- Preserve the authored object/material names `Cavity`, `LowerLip`,
  `LowerTeeth`, and `UpperTeeth`. Finish/paint passes should leave the dark,
  rough `Cavity` material and CC0 tooth materials semantically intact.
- The runtime remains responsible for `writeJawGape` and its +X axis; no
  runtime files were changed by L1.

## Known runner limitation

The required EEVEE render was attempted headlessly with:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --gpu-backend opengl --python-expr "import bpy; s=bpy.context.scene; s.render.engine='BLENDER_EEVEE'; s.render.resolution_x=32; s.render.resolution_y=32; s.render.resolution_percentage=100; s.render.filepath='/private/tmp/L1_eevee_probe.png'; bpy.ops.mesh.primitive_cube_add(); bpy.ops.render.render(write_still=True)"
```

It exits 134 before producing a render, even for the 32x32 cube probe. The
four required review PNGs were therefore generated with Blender Cycles CPU
headlessly and visually inspected. No commit was made.

EXIT L1c PARTIAL whaler's target defects (ragged silhouette, detached pale slab, over-cut chin) are fixed and all four bases pass the jaw probe with the other three unregressed (thresher byte-identical to L1b); the `back_y <= ymin+.86L` geometry gate is arithmetically unreachable for the three hinge-clamped bases and needs an owner decision on the constant.

## Mouth (L1d fix round, 2026-08-29) — lip band + tooth seating + whaler travel

Scope: the three mouth defects L3c isolated to `mouth.py` and reproduced in the
STANDALONE `tools/shark_bake.py --mouth` path (so not family-path bugs):
thresher's lower lip rendering as a tall flat vertical slab in the cheek,
artemisstrike/whaler's lower tooth strip hanging detached below the jaw, and
whaler's 0.0278L lower-lip travel against the .03L gate.

### Root cause — one bug, three symptoms

All three came from the same thing: **the lip and both tooth strips were placed
at a single AVERAGED rim point instead of following the per-x rim rows.**

`_make_cavity` already samples the real cut boundary loops per x and stores them
as `cavity_state["rim_upper"] / ["rim_lower"]` (7 rows of `(x, y, z)`). But:

- `_make_lower_lip` collapsed `rim_lower` to one `rim_y` / `rim_z` mean and then
  built a flat quad grid at that CONSTANT z. On a base whose lower loop sweeps
  in z across x, a flat constant-z sheet standing in a curved cheek is exactly
  the thresher vertical slab.
- `_load_teeth` set `teeth.location` to one averaged rim point, so a strip whose
  loop curves in x had its ENDS hanging off the surface — the artemisstrike
  detached comb.
- `_jaw_weight_map` started the clamped `hinge` ramp at `hinge_t - .05`, i.e.
  BEHIND the pivot, so the lowest-weight band vertices sat essentially ON the
  hinge where the lever arm is ~0 and contributed almost no travel.

### What changed in `tools/sharklib/mouth.py`

1. **`_rim_at(rim, x, ...)` (new).** Linearly interpolates a rim row at an
   arbitrary x. Every seating decision now goes through it.
2. **Lower lip is a thin band, not a sheet.** `LIP_BAND_MAX_L = .020` caps the
   band's z extent; each of the 7 x samples is seated at its OWN rim z via
   `_rim_at`, so the band tracks the loop curvature. Face topology is unchanged.
3. **Teeth deformed onto the rim per vertex.** The strip is scaled, then EVERY
   vertex is displaced to the rim at its own x (`_rim_at`) rather than the whole
   object being translated to the rim mean. The lower strip keeps its full
   LowerJaw weight, so it rides with the jaw.
4. **Tuck reduced to fit the seating gate.** `tuck_z` went from `.020L/-.018L`
   to `.0016L/-.0015L`, and the flat pre-nose retreat from `.004L` to `.0012L`.
   Those two constants were the whole residual seating distance.
5. **Jaw band moved forward of the hinge.** The clamped ramps now anchor at
   `hinge_t + .010` (forward) and `hinge_t + .004` (hinge), giving every
   weighted vertex a real moment arm. Unclamped bases are untouched.
6. **`rf_seat_dist_L` custom property** recorded per strip at build time, where
   the rim rows are exact: per tooth column, the perpendicular offset of the
   column's closest (base) vertex from the rim curve at its own x, 75th
   percentile across columns. Measuring this from the exported GLB is
   unreliable — reconstructing the rim from the exported cavity returned an
   empty lower row on thresher — so it is measured in-bake instead.

### Exact commands

```sh
for base in greatwhite_cy thresher tigershark whaler; do
  /Applications/Blender.app/Contents/MacOS/Blender --gpu-backend opengl -b --factory-startup \
    --python tools/shark_bake.py -- --in assets/models/$base.glb \
    --out /private/tmp/L1d_${base}_mouth.glb --tris 7000 --tex 128 --name $base \
    --mouth --gape-deg 25 --cavity-depth .12 --lip-band .06 --teeth strip
done

node --import ./tools/reg.mjs hse/probe_jaw.mjs \
  /private/tmp/L1d_greatwhite_cy_mouth.glb /private/tmp/L1d_thresher_mouth.glb \
  /private/tmp/L1d_tigershark_mouth.glb /private/tmp/L1d_whaler_mouth.glb

for b in greatwhite_cy thresher tigershark whaler; do
  /Applications/Blender.app/Contents/MacOS/Blender --gpu-backend opengl -b --factory-startup \
    --python scratchpad/L1d_render.py -- /private/tmp/L1d_${b}_mouth.glb \
    assets/review/L1_mouth_${b}.png
done
```

Renders are Cycles CPU, 8 samples, 720x540 per panel composed to 1440x540,
three-quarter head close-up, LowerJaw 0 and 25 deg. EEVEE still aborts
headlessly on this host.

### L1d geometry gates — ALL FOUR PASS

Printed by the bake as `L1DGATE`. Gate: band <= .020L, each strip's tooth base
within .005L of its lip/rim surface.

| base | lip band (<= .020L) | upper teeth seat (<= .005L) | lower teeth seat (<= .005L) |
|---|---|---|---|
| greatwhite_cy | PASS 0.01046 | PASS 0.00150 | PASS 0.00160 |
| thresher | PASS 0.01878 | PASS 0.00150 | PASS 0.00160 |
| tigershark | PASS 0.00782 | PASS 0.00150 | PASS 0.00160 |
| whaler | PASS 0.00638 | PASS 0.00150 | PASS 0.00160 |

The seat numbers are near-identical across bases because after the fix the
residual is just the fixed tuck constant, not any per-base misplacement — which
is itself the evidence that the strips now follow their loops.

### Jaw probe — ALL FOUR PASS

```text
L1d_greatwhite_cy_mouth.glb  upper(n=2977) move<=0 OK  lower(n=19) min=0.06919 max=0.08169 OK  stretch=1.03x  OK  PASS
L1d_thresher_mouth.glb       upper(n=4311) move<=0 OK  lower(n=24) min=0.04724 max=0.07058 OK  stretch=1.753x OK  PASS
L1d_tigershark_mouth.glb     upper(n=1812) move<=0 OK  lower(n=9)  min=0.07422 max=0.0995  OK  stretch=1.161x OK  PASS
L1d_whaler_mouth.glb         upper(n=1985) move<=0 OK  lower(n=71) min=0.06383 max=0.08245 OK  stretch=2.439x OK  PASS
```

Whaler's lower-lip travel went from the reported 0.0278L to **min 0.06383L**,
comfortably over the .03L gate. Tigershark's stretch also improved from L1c's
2.068x to 1.161x, and greatwhite's from 1.085x to 1.03x.

### Render gate — my own reading of the four PNGs

I opened each `assets/review/L1_mouth_<base>.png` and looked at it.

- **thresher** — the L1d target defect is FIXED. The lower lip is now a thin
  pink band that follows the curve of the cut; there is no vertical slab
  standing in the cheek. Both tooth rows sit ON the lip edges, the upper row
  hanging from the upper lip and the lower row standing on the lower band, and
  the lower row visibly swings down with the jaw between the two panels.
- **greatwhite_cy** — the best of the four. Thin pink lip band curving with the
  jawline, both tooth rows seated on it with no gap, dark cavity behind, strong
  open/closed difference. Reads unambiguously as a mouth.
- **tigershark** — reads correctly. Lip is a band, teeth seated on both lips,
  clear dark opening at 25 deg. Honest caveat: at full gape the upper lip
  region shows some pink interior that reads a little soft, and one tooth at
  the left commissure sticks out slightly past the lip line.
- **whaler** — still the weakest base, as it was in L1c. The target defects ARE
  fixed: the tooth strip is no longer detached, it is seated on the lip, and the
  jaw travels properly. But the closed panel reads as a pale hollow rather than
  a dark opening, and the base mesh's own ragged silhouette (torn fin and belly
  edges, present in the source scan) is visible around the mouth. It reads as a
  real mouth in the right place with teeth on the lips; it is not as convincing
  as the other three.

**Honest answer to the two questions asked:** yes, the lip is a lip — a thin
band following the cut loop, on all four bases, confirmed both by the .020L gate
and by eye. Yes, the teeth sit on the lips — on all four bases, at 0.0015-0.0016L
from the rim, and visibly so in every render. The remaining weakness is whaler's
overall read, which is a source-mesh quality issue rather than a lip or tooth
placement issue.

## Orchestrator decision 2026-08-29 (Fable)

Gate `back_y <= ymin+.86L` is re-anchored to the hinge: `back_y <= hinge_y + .05L`. Whaler accepted for the pilot as the weakest base (boxy cavity); hse/probe_jaw.mjs up-axis fixed and lower-lip gate is now n>=6, max>=.03L, min>=.015L.
