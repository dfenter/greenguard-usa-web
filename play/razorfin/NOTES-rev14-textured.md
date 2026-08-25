# Rev 14: textured shark assets

Moves the roster off the assumption that every shark is the low-poly Quaternius
Sharky hull repainted by a shader. A row can now name a baked, textured,
rigged GLB from `tools/shark_bake.py` and get a lit game character instead.
`greatwhite` is the first and only row switched over; the other 85 are
byte-identical in `data.js` and pixel-identical on screen apart from the
camera change, which applies to all of them.

## What a row opts into

`gen_data.py` emits an optional 12th SIL field as `sil.model`. It is emitted
only for rows that set one, so the other 85 rows' JSON is unchanged:

    grep -c '"model":' data.js   ->  1

`baseForDef()` honours `sil.model` when the key exists in `MODEL_FILES`, and
otherwise falls through to the old head-tag routing, so a data row naming an
asset a build does not ship still renders rather than throwing.

## Four orientation bugs, all found by measuring

The bake is authored nose-at--Z, Y-up, Blender-style bones. Four separate
assumptions in the existing loader were true for Sharky and false for a baked
rig. Each one is recorded here because each was invisible in the headless
selftests and only showed up in a real-GL screenshot.

**1. Long axis picked off the skinned box.** `prepareTemplate` chose the body
axis from `measureBox()`, which unions SKINNED bounding boxes, and
`SkinnedMesh.computeBoundingBox()` expands the box through the bone matrices.
The bake's spine is a chain of parent-relative `[0, 0.14, 0]` translations, so
the skinned Y extent outgrew the real nose-to-tail Z extent:

    skinned   0.328 x 1.006 x 0.863   -> picked axis 'y'  (wrong)
    bind pose 0.328 x 0.368 x 1.000   -> picks  axis 'z'  (right)

Fixed by taking the axis from the bind-pose geometry. Sharky is unaffected
(its skinned box already reported the true axis).

**2. Length normalization off the same inflated box.** Same root cause, and it
scaled the shark off its own long axis. `measureBox()` now prefers the
geometry box for meshes tagged `rfBindPoseBounds`, which `prepareTemplate`
sets only for `TEXTURED_KEYS`. Deliberately scoped: the Sharky procedural face
overlay is FITTED against the posed box, and switching it there moves every
eye and tooth (observed as `reef: worst tooth 0.4905 off the head surface`).

**3. Roll.** After the axis rotation this file's downstream contract is long
axis = world x, dorsal = world **z**, not world y. The `axis === 'y'` branch
Sharky takes rotates about z and satisfies that; the `axis === 'z'` branch a
Blender bake takes rotates about y and leaves the shark 90 degrees on its
side, belly to camera. Detected by comparing mid-body spans, since a correct
shark's dorsal fin is a one-sided spike along up:

    reef (correct)          y span 30.3   z span 34.6  (z reaches +31.5 one side)
    textured_test (rolled)  y span 57.2   z span 50.9  (swapped)

Corrected by rolling about the long axis until the taller span is on z, so a
future bake that already exports Z-up is left alone.

**4. Nose direction.** Sharky's nose ends up at +x. The bake's would land at
-x. Handled by comparing the world x of `Head` against the last tail bone and
adding a 180 spin when the head is behind the tail. A no-op for all 14
existing models.

## Material: light the bake, do not repaint it

The Sharky path paints a palette over a white atlas because that asset has no
real skin information. A baked asset is the opposite case, so
`texturedSkinMaterial()` keeps the GLB's own diffuse and tangent normal map as
the base and applies the palette resolver as an HSV **tint**, which is what
lets one asset serve 86 rows without each becoming a flat recolor: only hue
and saturation move, and the diffuse's own luminance keeps carrying the form.

- `MeshStandardMaterial`, `roughness 0.40`, `metalness 0`, white base color
  (the map is the color; multiplying the palette in would double-apply it).
- Hue is steered toward the authored target, weighted by how neutral the texel
  already is, interpolated the short way around the wheel. Colored texels the
  bake painted deliberately (mouth, eye) mostly survive.
- Countershading is reinforced, not replaced: a ramp along the measured
  bind-up axis multiplies the bake's existing dark-back/bright-belly paint.
- Wet specular: roughness pulled down along the back where the key light
  actually lands.
- Fresnel rim tinted toward the belly hue, since underwater rim light is
  scattered fill, not a white key.
- No toon outline shell, no relief wobble, no pattern blocks on textured rows.
- `material.fog` stays `true`, so fog behaviour is identical to every other
  shark (verified in-browser: `matFog: true`).

### The hue bug worth recording

The first cut computed `uRfHueShift` as a delta against
`sourceMaterial.color`. For a glTF PBR material that is the base-color
FACTOR, which is **white** whenever the color lives in the texture, i.e.
always for a baked asset. Differencing against a hue that does not exist gave
greatwhite a full +0.600 rotation and rendered grey shark skin bright magenta.
The uniform is now a hue TARGET rather than a delta.

### Bind-up axis: measured, not assumed

The countershade and wet-specular ramps need to know which way is up in the
mesh's own bind space. Guessing wrong is silent: the shader still compiles and
still renders, the ramp just modulates along a meaningless direction. Assuming
bind Y gave a top-to-bottom flank gradient of **1.07x, effectively flat**.
Correlating each bind axis against world up:

    bind x  corr -1.000   <- actual up axis
    bind y  corr  0.015   <- what the first cut assumed
    bind z  corr  0.035

`prepareTemplate` now measures this per template and emits it as a `vec3` the
shader dots against, plus the half-extent along it, so no axis is hard-coded
and any bake orientation works.

## Procedural swim

`shark_bake.py` exports no animation clips, so a textured row has no
Swim/Fast/Bite action. Rather than ship a rigid shark, the spine is driven
directly: a travelling sine wave down `Neck -> Spine1 -> Spine2 -> Tail1 ->
Tail2 -> Tail3`, phase lagging along the chain so the bend propagates nose to
tail, amplitude ramping toward the tail and scaling with `speedFrac`. It runs
on the same bones the GPU skinning already consumes, so hardware skinning, the
jaw gape and the bend compose without a second vertex pipeline.

**The axis matters and is not the intuitive one.** Measured world mapping for
every spine bone in this rig:

    local X -> world Z (lateral)
    local Y -> world X (nose-tail)
    local Z -> world Y (up)

A swim beat is a yaw, i.e. a rotation about world Y, therefore about bone-local
**Z**. Rotating about local Y (the intuitive guess) spins each segment about
the body's own long axis and corkscrews the shark instead of swimming it.
The `LowerJaw` gape stays `rotateX`, which is already correct for that bone.

## Camera: 8% -> 30%

The framing fraction is `frac = lenPx / (CAM_FRAME_TAN2 * z)` with
`z = lenPx * CAM_Z_LEN_MULT`. Inside the clamp band `lenPx` cancels, so
`frac = 1/(TAN2 * mult)`: one constant fraction for every tier, which is
exactly what a roster whose `sil.len` spans 0.85..2.4 needs.

Rev 12/12.5 used `mult 2.2` with clamps `250..600`. The clamps BOUND at both
ends of the roster, which is what broke the constant-fraction property and
spread the roster across 0.209..0.246.

    before  mult 2.2   clamps 250..600   frac 0.209 .. 0.246
    after   mult 1.65  clamps 170..500   frac 0.3003 .. 0.3003  (all 86 rows)

`mult = 1/(2.0183 * 0.30) = 1.6516`; 1.65 lands the roster at 0.3003. Clamps
are set so they cannot bind on any real row (shortest 105.4px -> z 173.9,
longest 297.6px -> z 491.0), leaving headroom at both ends without touching
any row.

Measured from the rendered pixels, not just the math:

    greatwhite  29.0% of the 844 CSS viewport width
    reef        31.3%
    tiger       30.0%

Controls, eat ranges and the world target all follow the camera already
because they read `liveWorldPerCssPx()`, which derives from the live camera
`z`/`fov` rather than the boot constants. No control code changed.

### Selftest gates updated

The old gates encoded the old framing and had to move with it:

- Framing band `[0.20, 0.28]` on three sample tiers -> `[0.28, 0.32]` across
  **all 86 rows**. The sample-tier form could not have caught the failure it
  was guarding, because a binding clamp shows up precisely on the rows the
  three samples skip.
- Added a gate that the clamps do not bind on any roster row, and a gate that
  the framing fraction is identical for every tier (spread < 1e-9). That
  spread gate is the direct regression test for the Rev 12 behaviour.
- Clamp messages now print the live constants instead of the stale `185..400`.

## Selftest gates for the textured path

The face gates (`teeth outside the head span`, `eye socket is flat`, `pupil is
dead-centre`) all measure the PROCEDURAL overlay, which a textured row does not
have because the bake paints its face into the diffuse. They are skipped for
textured rows and replaced with a positive contract rather than waived. Every
clause is a real failure mode hit while building this:

- maps present and wired to the right slots (a bake whose maps silently failed
  to load renders as a white plastic shark)
- material is Standard/Physical, not the toon atlas shader
- no `BackSide` material survived onto a textured row
- the shader hook carries `:rf-tex1` and every declared uniform exists
- the injected GLSL actually landed: an unmatched `replace()` is a silent
  no-op that would ship an untinted, unlit shark, so the tint, rim, wet
  specular and bind varying are each asserted by substring
- a procedural swim chain of at least 4 bones and a working `LowerJaw` gape

The roughness gate becomes band-aware: `[0.42, 0.62]` for the matt toon hull,
`[0.30, 0.46]` for wet baked skin. Both are floored above mirror and
ceilinged below fully matt.

`directTemplate` (the headless GLB decoder) reads only the JSON and BIN
chunks and never decodes the embedded JPEGs, so it could not tell "this asset
has no maps" from "this runtime cannot decode them". It now declares the maps
the glTF actually references as 1x1 placeholders carrying the source image
name, so the gate verifies the real asset contract headlessly while the
browser loads the true pixels.

## Measurements

Flank luminance sampled through mid-body, background-masked, top third
against bottom third:

    greatwhite (textured)  back lum 63.4  belly lum 85.9  gradient +22.6  ratio 1.36x
    tiger      (toon ref)  back lum 48.9  belly lum 72.2  gradient +23.3  ratio 1.48x

The textured row shades in the same range as the established toon rows, so the
countershade reads rather than sitting flat. Before the bind-up fix the same
measurement was 1.07x.

Rendered flank hue settles at 0.461 against an authored 0.600. That is the
cyan `FogExp2` (`0x9fd4e8`, hue 0.549) and the cyan `HemisphereLight` pulling
every hue toward the water, which is the same effect the Rev 13 notes recorded
for the toon path, and it applies to all rows equally. Simulating the shader
over the real diffuse confirms the tint itself is correct: mean hue 0.607
against the 0.600 target. The saturation floor was raised to give
low-saturation authored rows something to resist the wash with.

## Lighting

Not changed. The scene rig was inspected live and is already a key/fill pair:

    HemisphereLight 0x9fd4e8 sky / 0x06121e ground @ 0.55
    DirectionalLight 0xffffff @ 1.25 from upper-front-left
    ACES filmic tone mapping, exposure 1.06

With `roughness 0.40` plus the normal map and the wet-specular ramp, that
directional key produces a clear specular down the flank and a 1.36x
countershade gradient, so the textured shark does not read flat and no extra
lights were needed. The rim separation the brief asked for is supplied by the
material's own fresnel term instead of a third light, which keeps the light
count and the `LIGHT_RIG` selftest gate untouched.

## Budget

    worst draws across all 86 rows   4      (hammerhead)   budget 100
    worst tris  across all 86 rows   10008  (hammerhead)   budget 55000
    greatwhite (textured)            1 draw, 644 tris

    textured_test.glb on disk        0.197 MB
    encoded maps in the GLB          0.153 MB (1K diffuse + 1K normal, JPEG)
    GPU-compressed estimate at 1K    ~2.8 MB   (8bpp, both maps, with mipmaps)

The fixture is a coarse 644-tri test bake, so its triangle count says nothing
about a production asset; the budget headroom above is what matters. At the
2K + 2K the brief allows the same estimate is ~11 MB GPU-compressed, so a
production bake should either stay at 1K per map or ship compressed textures.

## Verification

    node --import ./tools/reg.mjs tools/selftest.mjs world game art3d fish meta ui
    world: pass=true ok=379 fail=0
    game:  pass=true ok=381 fail=0     (+85: the per-row framing and clamp gates)
    art3d: pass=true ok=5   fail=0
    fish:  pass=true ok=8   fail=0
    meta:  pass=true ok=192 fail=0
    ui:    pass=true ok=252 fail=0

Real-GL lineup probe, 844x390 CSS at DPR 2, landscape: **0 console errors, 0
warnings**. Headless selftests cannot see GLSL link failures, so the render is
the proof: every orientation bug above passed the selftests and was caught
only in a screenshot.
