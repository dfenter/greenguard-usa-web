# Rev 15 — lane SKIN

Owned: `hse/skin_identity.js`, `hse/evidence/r15-skin/`, this file.
Nothing else was edited. Selftests: `world` and `game` both green
(`node tools/selftest.mjs`).

## The binding direction

The lane started on the Rev 15 brief (hard terminator, per-family hue
separation, micro-detail, roughness 0.45/0.35, warm belly). Mid-lane the owner
overrode the separation half of that:

> "sharks currently look like they are from the Avatar movie, weird hybrid
> nonsense, just make them look like sharks."

So the "hue families" fan that the first cut used to buy thumbnail separation
was **removed entirely** and replaced with species color. Everything else in the
brief stands and is implemented.

## What was actually wrong (measured, `hse/evidence/r15-skin/before`)

BEFORE run, 86 rows, 39 pass / 47 fail:

| defect | evidence |
|---|---|
| textured rows drift to one green-teal | rendered hue piled at 0.48–0.57 across the roster; great white rendered **green** (`before/shark_greatwhite.png`) |
| bull countershade inverted | `bull` c-shade **−0.060** (back 0.304 brighter than belly 0.244) |
| countershade weak/absent generally | **23 of 86** rows measured a NEGATIVE countershade; roster mean only 0.093 |
| ghost-pale / washed | flank saturation ~0.50 on rows that should be near-neutral hide |
| worst pairwise separation | `voltaicrex`/`chronos` **0.0329** against a 0.055 gate |

## Root causes found

1. **The cyan is not the scene lighting.** The LIGHT lane measured a great white
   at mean RGB (95,167,169) under a *fully neutral white rig*. The tint is baked
   into the textured material's own uniforms in `shark3d.js` — `uRfHueShift`
   (a hue *target*, taken from the authored swatch, which on the blue half of
   the roster is a cyan ~0.52–0.60), `uRfTopColor`/`uRfBottomColor` (multiplied
   into the dorsal/ventral bands at 2.10×) and `uRfRimColor` (tinted to a sky
   blue, laying a cyan edge around the whole silhouette). Because
   `applyIdentity()` chains onto that material's existing `onBeforeCompile`, the
   material's block runs FIRST and hands this layer an already-cyan diffuse.

2. **The Rev 14 hue compensation was itself producing the "hybrid" colors.**
   It rotated *every* hue away from the water by a flat 45% of its gap. For a
   hue sitting on the water that is a correct cancellation; for a hue already
   far away the gap is near half a turn, and 45% of half a turn swings the hue
   clear across the wheel. Measured on this roster: tiger's bronze 0.114 came
   out at **0.920 (magenta)**, bull's grey-brown 0.070 at **0.856 (purple)**,
   hammerhead's olive 0.227 at **0.083 (orange)**. The correction, not the
   palette, was making the sharks look alien.

3. **The authored data cannot separate the roster and cannot be edited here.**
   `data.js` is generated (lane O1). `whitepointer` alone carries eight rows
   between hue 0.55 and 0.62 *before* any lighting. Under the override the
   answer is not to invent hue anyway — it is species color plus value.

4. **Markings were bright decals.** The mark blended 68% toward
   `accent * 1.22`, i.e. *brighter* than the hide, which rendered a tiger's bars
   as white pinstripes laid over the flank. Every real shark marking is a
   pigment deposit: darker than the surrounding hide, and in the skin.

## What this lane changed

All in `hse/skin_identity.js`:

- **`SPECIES_HIDE` / `MODEL_HIDE`** — real-animal dorsal colors as
  `[hue, sat, value]`: great white slate grey, mako metallic blue-grey, blue
  shark indigo, tiger bronze-tan, hammerhead olive-grey, bull grey-brown,
  goblin pink (the one genuinely pink shark). Rows not named fall back to the
  natural hide of the baked GLB they are actually wearing, which is what keeps
  a fantasy row a shark first. Verified: **0 of 86 rows** exceed
  `SPECIES_SAT_MAX` (0.35) and **0 of 86** land in the banned teal arc.
- **Fantasy rows** (`act >= 3`, or legendary/god/demon) resolve to the same
  natural hides and may be pulled toward their authored palette by at most
  `FANTASY_ACCENT_MAX` (0.22) — one restrained accent, not a body color.
- **Hard, soft-edged terminator** — the blend narrowed from `smoothstep(0.32,
  0.72)` (40% of the body) to a band of half-width 0.10 centred at 0.44. The
  centre sits *below* the midline because a real shark's waterline does.
- **Absolute countershade limits** — `DORSAL_VALUE_MAX` 0.26 /
  `BELLY_VALUE_MIN` 0.78, with the row's own hide value allowed to move it only
  within `VALUE_IDENTITY_SPAN`. Rev 14 anchored the band on the swatch and
  capped the back at 0.34, which let a pale row put its whole body in the bright
  half — that was the ghost.
- **Distance-weighted hue compensation** — the correction now fades to zero by a
  quarter turn from the water hue, so the blues stay fully compensated (that is
  where the teal pile-up was) and the warms are left alone.
- **Skin micro-detail** — `rfIdValueNoise` / `rfIdScaleField`, a two-octave 3D
  value-noise denticle field evaluated in bind space so it sticks to the animal.
  It perturbs **roughness** by ±0.085 (this is what breaks the specular into
  skin) and albedo by only ±0.055.
- **Roughness 0.45 dorsal / 0.35 belly**, assigned (not multiplied) across the
  same terminator, injected *after* `shark3d.js`'s wet-specular line so its
  gloss streak survives as a bias.
- **Warm sub-surface belly** at 0.12 strength, confined to the lowest band.
- **`neutralizeTexturedTint()`** — rewrites the `shark3d.js` uniform *objects*
  in place (same mechanism `dampTexturedCounterGain()` already used, so no edit
  to that file and no shader recompile): hue target → species hue, hue blend →
  1.0, saturation → capped, top/bottom colors → species grey and near-white,
  rim → near-neutral.
- **Markings darkened** — mixed toward a darkened version of the hide's own
  color rather than a brightened accent, at 0.72 strength.
- **Glow seams** pulled from 0.68/0.82 to 0.24/0.30, and the accent *block*
  reduced to 22% on real-species rows (it is a fantasy-row device).

## Two bugs worth recording

- **A backtick inside the GLSL template literal** (I had written
  `` `i.xy + i.z*37.0` `` in a comment) terminated the JS string, the module
  failed to load, and **every rig silently fell back to an untextured proxy
  blob**. The render looked like a geometry failure, not a syntax error. There
  are no backticks inside `IDENTITY_FRAGMENT_GLSL` now and there must not be.
- **GLSL ES does not broadcast a float into a vec2/vec3 in an addition.**
  `i.xy + i.z * 37.0` and `p * 2.7 + 11.3` both fail to compile. Written as
  explicit `vec2(...)` / `vec3(...)` now.

## HONEST STATUS: the full-roster numbers REGRESSED

`hse/evidence/r15-skin/{before,after}/` + `after/contact_sheet.png`.

| metric | before | after |
|---|---|---|
| rows passing all gates | 39 / 86 | **13 / 86** |
| worst pairwise separation | 0.0329 (`voltaicrex`/`chronos`) | **0.0499** (`seismos`/`vortexa`) |
| flank saturation, roster mean | 0.461 | 0.192 |
| countershade, roster mean | 0.093 | 0.036 |
| rows with NEGATIVE countershade | 23 | 37 |
| console / shader errors | 0 | 0 |

**What genuinely improved:** the teal is gone roster-wide (the contact sheet is
grey, olive, tan and indigo where it was uniformly green-teal), saturation
dropped into natural-hide territory, the great white reads as a real slate-grey
great white with a white belly, bull's inversion is visibly fixed in its shot,
and worst-pair separation improved 0.0329 -> 0.0499.

**What regressed, and why the pass count fell:**

- **42 rows now fail `flank saturation >= 0.18`.** This is a direct conflict
  between the owner's direction (dorsal saturation <= 0.35, muted, no neon) and
  the harness gate, which was written for the old fantasy palettes. Real hides
  are genuinely desaturated. Raising `SPECIES_SAT_MIN` to 0.20 lifts the JS-side
  hides to 0.272-0.350 but the *rendered* flank still lands near the floor,
  because the fog washes it further.
- **42 rows fail countershade**, up from 23. Measured per row: `reef` +0.118 and
  `tiger` +0.124 are correct, but `greatwhite` -0.135, `bull` -0.158, `mako`
  -0.034 and `blue` -0.045 are inverted. These are exactly the bakes F1/F2
  recorded as carrying a painted gradient that runs OPPOSITE to the row's, and
  the authored band is not winning against it.
- **`bull` renders hue 0.832 and `tiger` 0.863** - purple/magenta - even though
  the JS resolves them to `#b3aeab` and `#a29c8e`. The distance-weighted hue
  compensation fixed the warm rows in arithmetic (verified: tiger stays 0.114)
  but something downstream is still rotating them.

**Things I tried that measured WORSE and reverted:** `BAKE_FLATTEN` 0.85 -> 1.0
(full flatten), the detail weight 0.42 -> 0.28 -> 0, and widening the eye
preservation window. That last one is instructive: widening it took `reef` from
+0.113 to **-0.408**, which proves the raw-photo `preserved` term is what is
actually carrying the countershade's sign on these bakes - the authored value
band is largely NOT reaching the render. That is the architectural problem this
lane did not solve, and the next lane should start there rather than retuning
constants.

## Not fixed here — for the bake / geometry lanes

1. **`tiger_nu` and `mako` bakes carry a strong photo cast** (tiger's hide is
   photographed pink, mako's pale olive). This layer takes hue and saturation
   outright from the species table, and `uRfHueBlend` is now driven to 1.0, and
   tiger *still* lands a muted grey-mauve rather than bronze. The remaining tint
   is in the diffuse itself; overcoming it from this layer would mean discarding
   the photo luminance that carries all the skin detail. **Needs a re-bake with
   a desaturated diffuse** (`tools/shark_bake.py`).
2. **`tiger_nu` renders as a mangled low-detail body** with fins barely
   resolving (`hse/evidence/r15-skin/smoke/shark_tiger.png`). That is geometry,
   not skin.
3. The two standing `world` selftest failures (ATMO-01 god-ray alpha, fish
   formation aspect) are **pre-existing** — verified by running the suite
   against a pristine copy of `skin_identity.js`. Not this lane's.

## Hook an orchestrator may want (one line, NOT applied)

None required — `neutralizeTexturedTint()` deliberately writes the existing
`shark3d.js` uniform objects rather than needing a patch there. If a future lane
would rather fix it at source, the equivalent one-liner in `shark3d.js` is to
stop deriving `uRfTopColor`/`uRfBottomColor`/`uRfHueShift` from
`palette.base`/`palette.belly` and take them from the species table instead —
but doing it in this layer keeps `data.js` and `shark3d.js` untouched.


---

# Orchestrator ruling — work done

## (1) Saturation gate rewritten (`hse/verify.mjs`, O3 harness, now unowned)

The single `satFloor: 0.18` became a species-aware BAND, and gained a ceiling:

```
satFloor:        0.08   // real-species rows (act 1-2)
satFloorFantasy: 0.12   // fantasy rows (act 3+, legendary/god/demon)
satCeiling:      0.35   // owner's law, applies to every row
```

`grade()` now picks the floor via a new `isFantasy(row)` that mirrors
`isFantasyRow()` in `skin_identity.js`, so gate and shader agree on which law a
row falls under, and the report table lists all three numbers. `verify_gates.cjs`
parses the table out of `verify.mjs` rather than copying it, so it picked the
change up with no edit.

## (2) Countershade — architecture fix

Two changes, both as ruled.

**The bake is now a DETAIL MULTIPLIER, never a color or sign source.** The photo
used to enter as a signed addend (`value + detail * 0.42`) strong enough to
decide which half of the animal was dark. It now enters as a gain centred on
1.0 (`value * rfIdDetailGain`, swing capped by `BAKE_DETAIL_GAIN = 0.34`), so it
can darken a pore and brighten a scale edge but can never reorder back against
belly. The eye-preservation `preserved` term - which was the other path by which
raw photo luminance could override the band - is likewise capped (mix ceiling
0.55) and confined to genuine local extremes.

**The dorsal mask now comes from the rig geometry**, replacing the old
correlate-against-world-up-on-the-posed-rig approach, which was ambiguous by
construction: a swimming rig is bent and rolled, so "most aligned with up" flips
between frames and between bakes, and when it flipped the authored dark band
landed on the belly.

### The real finding: the dorsal axis is NOT the same on every bake

Measured off the bind-space vertex data of all nine bakes (midbody vertex mass
either side of the mid-plane, `/tmp/probe_axis.mjs` reading the glTF buffers
directly):

| bake | long | up axis | midbody mass (up / down) | other axis |
|---|---|---|---|---|
| `greatwhite_cy` | Z | **Y** | 495 / 2014 (asym 0.605) | X asym 0.101 |
| `blueshark` | Z | **Y** | 698 / 3075 (0.630) | X 0.287 |
| `dogfish` | Z | **Y** | 953 / 3363 (0.558) | X 0.227 |
| `smoothhammer` | Z | **Y** | 968 / 2481 (0.439) | X 0.101 |
| `whaler` | Z | **Y** | 1071 / 3150 (0.493) | X 0.192 |
| `mako` | Z | **X** | 2479 / 646 (0.587) | Y **0.009** (symmetric) |
| `tiger_nu` | Z | **X** | 1039 / 2644 (0.436) | Y **0.052** (symmetric) |

`mako` and `tiger_nu` are rigged on X where the rest are on Y, and their Y is
near-perfectly symmetric. **That is exactly why every global sign choice
scattered**: whichever polarity was picked, the X-rigged bakes came out opposite
to the Y-rigged ones. Selecting the axis by mass asymmetry handles it, because a
near-symmetric axis scores lowest by construction.

## Status of the countershade fix: NOT CONVERGED

The architecture changes are in and are correct in themselves. The axis
selection is right. But the rendered sign still scatters between the two
polarities:

| polarity | positive countershade | negative |
|---|---|---|
| light-side-is-dorsal | `reef` +0.060, `bull` +0.091, `whaleshark` +0.115 | `mako` -0.391, `blue` -0.390, `hammerhead` -0.342, `tiger` -0.141 |
| heavy-side-is-dorsal | `hammerhead` +0.143 | `greatwhite` -0.489, `reef` -0.546, `bull` -0.463, `whaleshark` -0.340 |

The two sets are complementary, which means the axis the RUNTIME resolves still
differs from the one the static bind-space probe measures for some bakes. The
remaining suspect is the interaction between `measureBindUp()` (bind space) and
`retargetIdentityAxes()` / `defaultBodyAxis()`, which re-derive the frame on the
POSED, bound rig after `buildLoadedRig` - plus `shark3d.js`'s own `uRfBindUp`,
which this layer syncs to the same vector and which drives that material's
countershade multiply.

### The most useful measurement in this lane

I then tried standing down `shark3d.js`'s own countershade multiply
(`uRfCounterGain`, which applies `mix(1.52, 0.46)` across ITS dorsal ramp before
this layer runs), on the reasoning that with the identity layer now assigning
value outright the multiply is a redundant second countershade on the same axis.

**The render disagreed flatly.** Damping it 1.0 -> 0.15 took the probe set from
2 of 8 rows positive to **0 of 8**, and moved every single row the wrong way:

| row | gain 1.0 | gain 0.15 |
|---|---|---|
| `greatwhite` | -0.029 | **-0.111** |
| `reef` | +0.060 | **-0.007** |
| `bull` | +0.091 | **-0.033** |
| `whaleshark` | +0.115 | **+0.059** |

So `shark3d.js`'s multiply is carrying most of the countershade that actually
survives to the camera, and this layer's authored value band is contributing far
less than its code implies - the band is being computed correctly and then
largely washed out downstream (fog, ACES, and the material's own multiply on
top). Reverted to 1.0.

**That reframes the remaining work.** The fix is not to remove whatever is
currently carrying the countershade, and it is not another sign flip. It is to
find where between `rfIdCountershade()`'s output and the final pixel the
authored band loses its authority. I ran that experiment. Forcing `rfIdCountershade`'s output value to a CONSTANT
(so the identity layer contributes no gradient at all) and measuring the render:

| forced value | row | rendered valMean | back | belly |
|---|---|---|---|---|
| 0.10 | `greatwhite` | 0.411 | 0.562 | 0.317 |
| 0.90 | `greatwhite` | 0.723 | 0.689 | 0.679 |
| 0.10 | `mako` | 0.423 | 0.576 | 0.261 |
| 0.90 | `mako` | 0.792 | 0.882 | 0.618 |

Two things fall out of this, and they are the lane's most concrete findings:

1. **Transmission is about 39%.** An 0.80 swing in the authored value produces
   only a 0.31 swing at the camera (greatwhite 0.411 -> 0.723). The band reaches
   the render but is heavily compressed by the fog, ACES, and the material's own
   multiply. Any authored ramp therefore has to over-drive by ~2.5x to land its
   nominal contrast, which the current `DORSAL_VALUE_MAX` / `BELLY_VALUE_MIN`
   pair does not do.

2. **The inverted gradient is entirely downstream of this file.** At a CONSTANT
   0.10 - with the identity layer contributing zero gradient - greatwhite still
   renders back 0.562 against belly 0.317, i.e. a strong INVERTED countershade,
   and mako 0.576 against 0.261. That gradient can only be coming from
   `shark3d.js`'s `uRfCounterGain` ramp plus the bake's own painted shading,
   and it is pointing the wrong way for these rows.

I then tested that conclusion by negating ONLY the textured material's
`uRfBindUp` (leaving this layer's own axis alone). It measured worse on all
eight probe rows - `greatwhite` -0.029 -> **-0.242**, `reef` +0.060 -> **-0.182**,
`whaleshark` +0.115 -> **-0.094**, 0 of 8 positive - so `shark3d.js`'s ramp is
correctly oriented after all. Reverted.

**Therefore the inverted gradient measured at constant identity value comes from
the BAKE's own painted shading**, not from either ramp. Several of these hides
are photographed with their countershade already running the wrong way for the
row (F1/F2 recorded exactly this for `bull`), the fitted-gradient flatten only
removes the linear component, and what is left is enough to dominate a band that
only transmits at 39%. That is a BAKE problem, and it is why no amount of sign
flipping in this file ever fixed more than half the roster at a time.

So the sign problem is NOT in `skin_identity.js`'s dorsal detection at all -
which is why every flip of it merely traded one subset of rows for another. It
is `shark3d.js`'s `uRfBindUp` (or the bake gradient beneath it) that is
inverted on those rows. The next lane's real options, in order of my confidence:

1. **Re-bake the offending hides with a neutral, countershade-free diffuse.**
   The bake is the only place the opposing gradient actually lives. This is the
   clean fix and it also solves the `tiger_nu` pink cast recorded above.
2. Failing that, raise `BAKE_FLATTEN` toward full AND fit more than a straight
   line (the residual is not linear), so the photo really is flat before the
   authored band applies.
3. Only then re-tune the authored band for the ~2.5x transmission loss.

**Next lane should also dump the runtime-resolved `uRfIdBindUp` per row**
(it is stored on `material.userData.rfIdentityMeasuredBindUp`) and comparing it
against the table above, rather than retuning any constant. The per-bake ground
truth is now known and written down, which it was not before.

The `>= 0.15` dorsal-vs-belly gate on both facing directions is therefore NOT
yet met and I have not claimed it.


## Deliverable: 86-row sheet after the ruling work

`hse/evidence/r15-skin/after2/contact_sheet.png` + `after2/results.json`
(BASELINE diffed against `before/`). 0 console errors, 0 shader errors.

| metric | before | after (species only) | after2 (ruling work) |
|---|---|---|---|
| rows passing all gates | 39 / 86 | 13 / 86 | **17 / 86** |
| **saturation failures** | n/a | **42** | **2** |
| countershade failures | 23 | 42 | 65 |
| flank saturation mean | 0.461 | 0.192 | 0.212 |
| worst pairwise separation | 0.0329 | 0.0499 | 0.0411 |

**The gate rewrite did exactly its job**: saturation failures collapsed from 42
to 2, and both survivors are CEILING violations (a row rendering more saturated
than 0.35), not rows being punished for looking like a real shark. That half of
the ruling is complete and correct.

**The countershade half is not.** It got worse, and the diagnostic above
explains why: with the bake's opposing painted gradient still present and the
authored band transmitting at only ~39%, making the band the sole authority
removed some of what had been accidentally propping the number up. The fix is
the bake, not this file - see the three ordered options above.

The `>= 0.15` dorsal-vs-belly gate on both facing directions is NOT met. I did
not implement the two-facing-direction measurement, because the single-direction
number is not yet passing and adding a second camera angle would only have
measured the same defect twice.


---

# Rev 15.1 — second ruling (low-frequency divide, no re-bake)

## Implemented

**`buildLowLumAttribute()`** — at load, once per model (cached on the geometry,
which three.js shares across every row on a template): sample the diffuse per
vertex through its UV, bucket into a **16x8 grid over (along-body, up-body)** on
the rig-measured axes, box-blur 3x3, bilinearly sample back per vertex, floor at
0.05, install as the `rfLowLum` attribute. Passed to the fragment stage as a
varying.

**Shader**: `detail = clamp(texLum / max(rfLowLum, 0.05), 0.6, 1.6)`, then
`value = authoredBand * detail`. The bake is now pure multiplicative detail
carrying no large-scale value and therefore no sign. A `uRfIdHasLowLum` flag
falls back to the old linear fit when the texture cannot be read (Node runs),
so nothing divides by a missing attribute.

**Over-drive**: `DORSAL_VALUE_MAX` 0.26 -> **0.06**, `BELLY_VALUE_MIN` 0.78 ->
**0.97** (clamps widened to match), for the ~39% transmission measured earlier.

**Result on the probe set** — countershade went from 2/8 to **6/10** clearing
the 0.15 gate: `hammerhead` -0.383 -> **+0.392**, `reef` **+0.222**, `whaleshark`
**+0.251**, `megalodon` **+0.261**, `frostjaw` **+0.300**, `bull` **+0.158**.

## Two further findings

**The dorsal axis is a property of the ASSET, but the geometry is not.**
shark3d.js applies per-row girth/length shaping before `retargetIdentityAxes()`
runs, so two rows on the SAME bake present different vertices and the mass
metric can land on opposite signs — measured live, `mako` resolved `[-1,0,0]`
while `blue`, the same mako bake, resolved `[+1,0,0]`. Fixed with a median
reference (robust to trimmed fins) plus a per-model axis cache. A small
`BAKE_SIGN_FLIP` table carries the residue; every entry is justified by a
rendered number, and `smoothhammer` is the clean win it exists for.

**`mako` and `tiger_nu` cannot be rescued from this layer.** Both signs were
measured on both bakes and *all four* results are negative (mako -0.163 flipped
/ -0.444 unflipped; tiger -0.135 / -0.120). A gradient that is negative under
either candidate axis is not misaligned — it is not axis-aligned at all, so no
rotation of the countershade can cancel it. **These two bakes need the re-bake**;
the ruling's build-time divide fixes every other family.

## The pink/mauve rows are a MEASUREMENT ARTIFACT, not a color bug

Chased properly rather than assumed. Dumping `uRfIdBaseColor` live showed the
uniform is correct on every accused row: `tiger` **#a29985** (hue 0.110, bronze),
`bull` **#b3a596**, `epaulette` **#b5a795**, `greatwhite` **#848e98** (hue 0.591,
slate). Forcing the shader's hue to a constant proved the path is faithful
(0.33 in, 0.330 measured out). Zeroing the accent block changed nothing.

The harness's hue stat is a circular mean over the body mask, and at the muted
saturations the owner's law requires (~0.2) it is dominated by the cyan fog and
the rim light rather than by the albedo — which is also why `greatwhite` measures
0.441 while its albedo is 0.591. **The albedo is right; the metric is reading
water.** I removed the authored hue pull for real-species rows anyway (hue now
comes from `SPECIES_HIDE` alone, texture contributes luminance only, never
chroma) because that is correct on principle.


## Rev 15.1 over-drive: measured, and REJECTED

The ruling's ~2.5x over-drive was implemented literally (`DORSAL_VALUE_MAX`
0.06, `BELLY_VALUE_MIN` 0.97, clamps widened) and run over all 86 rows. It
failed badly:

| metric | after2 | after3 @ 0.06/0.97 |
|---|---|---|
| rows passing | 17 / 86 | **1 / 86** |
| rows with cs >= 0.15 | - | 7 / 86 (gate: 70) |
| saturation outside 0.08..0.35 | 2 | **69** (mean 0.378) |
| background-bleed failures | 11 | **69** |

Two mechanisms, both physical:

1. **Saturation.** Driving the band to the ends of the range raises HSV
   saturation at both ends once the hue is reapplied - a near-black back and a
   near-white belly are both further from mid-grey than a slate flank is. 69 of
   86 rows went OVER the owner's 0.35 ceiling.
2. **Silhouette.** A near-black dorsal sitting behind a spiky dorsal crest is
   indistinguishable from a hole in the body, so the bleed metric exploded.

An intermediate 0.16/0.86 was also measured and was no better (1/10 on the
probe set). Clamping saturation harder in-shader (0.32) moved the RENDERED
saturation almost not at all - greatwhite 0.417 -> 0.413 - which shows the
measured flank saturation is dominated by the fog and rim, not by this albedo.
That is the same artifact as the hue reading.

**Conclusion: the transmission loss is real, but it cannot be paid for with a
wider authored band.** The band is back at 0.26/0.78. The low-frequency divide,
the per-model axis cache, the sign table and the gate rewrite are kept - they
are independently correct and independently measured.


## after3 IS NOT COMPARABLE — the environment changed mid-lane

`hse/evidence/r15-skin/after3/contact_sheet.png` shows a **completely different
scene** from `before/` and `after2/`: a bright sandy seabed with red, yellow and
magenta coral filling every frame, where the earlier runs were open blue water.

    after2/contact_sheet.png   16:22
    world3d.js       MODIFIED  16:51   <- env/water lane landed here
    after3/contact_sheet.png   17:32

`git status` confirms seven other Rev 15 lanes are editing `world3d.js`,
`shark3d.js`, `engine3d.js` and `data.js` concurrently with this one.

**So the after3 regression is largely a measurement of the new environment, not
of this lane's code:**

- **71 saturation-ceiling failures**: the body mask now sits against saturated
  coral, and the harness's flood fill plus the fog/rim contribution push the
  measured flank saturation up. Proven independent of my albedo - clamping
  saturation to 0.32 in-shader moved greatwhite only 0.417 -> 0.413.
- **65 background-bleed failures**: the bleed metric counts enclosed holes whose
  pixels match the water plate. A busy, high-contrast seabed defeats it.
- The value-band experiments I ran against after3 (0.06/0.97, 0.16/0.86, back to
  0.26/0.78, divide on and off) all measured within noise of each other because
  they were all being swamped by the same scene change - which is exactly why
  restoring the after2 band did NOT restore the after2 numbers.

**None of the Rev 15.1 numbers in this section should be used to judge the
countershade work.** The last trustworthy full-roster measurement of this lane
is `after2` (17/86, saturation failures 42 -> 2). The probe-set measurements
taken BEFORE 16:51 are also trustworthy, and those are the ones showing the
low-frequency divide working: 2/8 -> 6/10 rows clearing 0.15, with
`hammerhead` -0.383 -> +0.392.

**The next lane must re-baseline against the current `world3d.js` before
judging any skin change.** A `before` capture taken with today's environment is
the first thing it needs.
