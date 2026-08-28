# Rev 15 — lane SKIN, round 4

Owned and edited: `hse/skin_identity.js` only.
`hse/verify.mjs` was owned but needed no change (see "Gate" below).
Evidence: `hse/evidence/r15-skin4/`.
Selftests: `art3d 31/0`, `world 379/0`, `game 386/0` — all green.
(`world`'s two long-standing failures, ATMO-01 god-ray alpha and the fish
formation aspect, now pass as well.)

---

## THE HEADLINE: the identity layer was never running on textured rows

Every experiment in round 3 measured "no change", and this is why.

`installIdentity()` injected its block by replacing `#include <map_fragment>`.
On a textured row that token **does not exist** by the time the identity layer
runs: `shark3d.js`'s own `onBeforeCompile` has already consumed it (shark3d.js
~:1964) and replaced it with the include plus its hue steer, its countershade
ramp and its top/bottom multiplies. `applyIdentity()` **chains** onto that
callback, so the material's block runs FIRST and the token is gone — and
`String.replace` on a missing token silently returns the string unchanged.

So the entire identity block — countershade, species colour, markings, accent,
micro-detail — was compiled into **nothing** on every textured row. The whole
roster was being drawn by `shark3d.js` alone.

That single fact explains the entire history of this lane:

- why the value band, the saturation floor, the hue compensation and every
  constant retune measured within noise of each other;
- why round 3 concluded "the band only transmits at 39%" and "the bake's own
  painted shading dominates" — it transmitted at 0%, and the bake was the only
  thing painting;
- why damping `shark3d.js`'s own `uRfCounterGain` always made things WORSE
  (it was carrying 100% of the countershade, not "most" of it);
- why the ONE thing that did work was the roughness block — which already
  anchors on `shark3d.js`'s wet line, because the same trap was hit once before
  and written around locally instead of being recognised as general.

**Fix:** anchor on `shark3d.js`'s last tint line verbatim, with the bare include
kept as the fallback for untextured materials that never install a block.

```js
const TINT_ANCHOR = "diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uRfTopColor * 2.10, smoothstep(0.66, 0.99, rfUp) * 0.30);";
```

Everything below only became measurable once this was fixed.

---

## Full-roster result, measured on re-shot DOC images

Both columns measured by the same script on `hse/evidence/r15-doc/shots`
(before) and a fresh 86-row shoot (after). Gate: dorsal-median < belly-median
by >= 0.15.

| metric | BEFORE | AFTER |
|---|---|---|
| **countershade >= 0.15** | **29 / 86** | **57 / 86** |
| rows with NEGATIVE countershade | 30 | **11** |
| saturation inside 0.08..0.35 | 67 / 86 | **82 / 86** |
| rows >10% of body at sat > 0.5 (decals) | 31 | **13** |
| countershade mean | +0.066 | **+0.219** |

The four rows the owner named:

| row | before | after |
|---|---|---|
| `greatwhite` | cs **−0.212**, flat green | cs **+0.165**, slate with a real terminator |
| `bull` | cs **−0.071** | cs **+0.200** |
| `tiger` | cs +0.051 | cs **+0.169** |
| `typhonmaw` | cs +0.102, **20.4%** decal pixels | cs **+0.318**, **2.6%** |

`hse/evidence/r15-skin4/contact_sheet.png` is before | after | HSE ref for those
four rows.

**The gate is NOT met: 57 of 86 against the 70 required.** I am not claiming it.

---

## The four verdicts

### (1) greatwhite — flat dark green, no countershade

Three separate causes, each isolated by experiment rather than assumed.

**a. The injection bug above.** The authored band was not being drawn at all.

**b. The dorsal axis was measured by vertex-mass asymmetry**, which the BAKE
lane proved is the wrong metric — it lands on the near-symmetric left-right axis
on `mako` and `tiger_nu` and carries no polarity information. Replaced with the
**dorsal-fin spike**: the largest midbody excursion from the axis MEDIAN, which
is what `profileview.html` already uses to place its camera. Measured on the
shipped GLBs it reproduces the BAKE lane's table exactly — `mako` dorsal −X,
`tiger_nu` dorsal +X, every other bake on axis 1. Verified live: the resolved
bind-up, transformed to world space, now matches the DOC lane's independently
measured dorsal on **all eight** probe rows.

The `BAKE_SIGN_FLIP` table is now **empty** and that is a result, not an
omission. It only ever existed to correct the old metric's mistakes. Adding
entries back for the three weakest bakes was measured and made the roster worse
(60/86 → 57/86): those rows are not inverted, they are under-driven.

**c. The scene lighting was an inverted countershade.** Rendering the roster
with a completely FLAT grey albedo — identity layer contributing nothing — still
produced up to 0.33 of dorsal-to-belly gradient:

| row | world dorsal | flat-albedo cs |
|---|---|---|
| greatwhite | y+ | −0.082 |
| bull | y+ | −0.071 |
| tiger | z+ | +0.071 |
| mako | z− | +0.302 |
| hammerhead | y− | +0.326 |

Both the game scene and the DOC harness light with
`HemisphereLight(0x9fd4e8, 0x06121e)` — cyan sky, near-black ground — so
world-up faces are lit ~4x brighter than world-down faces **regardless of
albedo**. For a row whose dorsal points world +Y that is a perfect inversion of
the intended countershade. It is exactly why greatwhite, bull and reef were the
persistent failures while hammerhead and mako passed easily.

Fixed with `HEMI_COMPENSATION`: bias the band's two ENDS by how far the dorsal
axis points at the sky, computed from the same measured vector. Applied to the
ends rather than as a wider band, which is what round 3's over-drive got wrong
(widening pushed 69 rows past the saturation ceiling and wrecked the silhouette).

### (2) The mauve/pink rows — isolated as instructed, and it is NOT the texture

Forced the diffuse to pure grey in the shader. `tiger` still rendered hue
**0.748** and `bull` **0.844**. So it is not texture chroma.

It is also not the albedo: dumped live, `uRfIdBaseColor` is `#a29985` on tiger
(hue 0.115, bronze) and `#b3a293` on bull. Nor the accent block (zeroing it
changed nothing), nor the hue compensation (disabling it changed nothing), nor
the rim, nor the additive washes — each was measured and each ruled out.

The proximate cause is the **cyan incident light**, which multiplies every hide
toward the water: a bronze albedo at saturation 0.17 renders at 0.09 with its
hue pulled to 0.635. Confirmed by the flat-grey-albedo probe coming back green.

Applied, per the ruling: **texture chroma is killed entirely for real-species
rows** (`uRfSaturation → 0`; the photo now carries luminance only — pores,
scales, scars, the painted eye — and never chroma). Fantasy rows keep a small
allowance so their one accent still reads. Plus `LIGHT_TINT` pre-division and a
`CHROMA_LOCK` re-assert of the species hue at the end of the block.

**Honest status:** tiger and bull still measure mauve (0.737, 0.851). The cast
is now demonstrably downstream of everything this file controls. **Tiger is not
bronze and I am not claiming it.** These are the two bakes the BAKE lane already
flagged as unrescuable from this layer.

### (3) The hard vertical stripe decals — fixed, and they were mine

`typhonmaw` carried 20.4% of its body pixels above saturation 0.5 and read as a
shark with tape wrapped round it. The source was **`rfIdSeamLine` in this
file**: a periodic function of `rfIdAlong` — i.e. evenly spaced vertical bands —
added to `totalEmissiveRadiance` in the row's full-saturation glow colour.
Emissive light the shading cannot darken and the countershade cannot cross.

The seam component is **removed entirely** (a periodic band is the one shape the
owner ruled out). What remains is a faint emissive lift confined to the row's own
pattern mask and to the dorsal ridge. Result: typhonmaw 20.4% → **2.6%**,
countershade +0.102 → **+0.318**, and roster-wide 31 → 13 rows over the
threshold.

Also brought under the owner's law (`dV <= 0.18`, `sat <= 0.35`):

- the accent block, which was FORCING saturation up to a floor of 0.58 —
  re-saturating a muted authored accent into neon. Now a ceiling, not a floor,
  and it borrows the body's own value.
- the pattern marking, which now keeps the body's hue and value and is merely
  darkened.
- `shark3d.js`'s own pattern pass (`uRfPatternColor` at 1.55x — brighter than
  the hide — mixed at 0.78), pulled under the ceiling and its mix cut to 0.30.
- **gods**: pale gold accent (`GOD_ACCENT_HSV`), dV 0.10, sat ceiling 0.26.
- **demons**: charcoal HIDE (`DEMON_HIDE_HSV`, replacing the species lookup
  outright — a demon is not a bronze shark with red bits) plus a dull ember
  accent, dV 0.14, sat ceiling 0.30.

### (4) mako / tiger_nu flat-lum re-bakes — guarded

`shark3d.js`'s `MODEL_FILES` already loads `mako_r15.glb` / `tiger_nu_r15.glb`.
`FLAT_LUM_BAKES` now skips the low-frequency divide on them, as the BAKE lane
asked: dividing an already-flat profile amplifies the bucket estimator's own
noise into low-frequency blotching and costs a build-time texture read.

**Placement matters and cost me a run:** the guard must be tested BEFORE the
shared-geometry early-out (`if (geometry.getAttribute('rfLowLum')) return true`),
which otherwise reports "divide is active" for a flat bake and defeats it.

---

## Gate

`hse/verify.mjs` needed no change — the previous round's rewrite already
implements the species-aware saturation band (0.08 / 0.12 fantasy / 0.35
ceiling) the owner's law requires, and `verify_gates.cjs` parses the table out
of it rather than copying it. Measurement for this round was done directly on
the re-shot DOC images, which is what the brief asked to be judged on.

---

## What is still failing, and where the next lane should start

**57 / 86 against a gate of 70.** The 29 failures are not scattered:

| bake | fail / total |
|---|---|
| `whitepointer` | 9 / 25 |
| `tigershark` | **6 / 6** |
| `blueshark` | 4 / 9 |
| `greatwhite_cy` | 3 / 8 |

`tigershark` and `whitepointer` carry 31 rows between them and both have a
**near-zero spike score on the dorsal axis** (0.000 and 0.130) because their
fins are modelled short — the peak-reach metric has nothing to select on and
falls through to the left-right axis.

**A skewness (signed third moment) metric fixes exactly that** and is
theoretically the better statistic — it uses every vertex rather than the two
most extreme, and its sign carries the polarity. Measured over all twelve bakes
it is unambiguous and reproduces the BAKE lane's table
(`mako` −1.721, `tiger_nu` +1.295, everything else strongly positive on axis 1).

I implemented it, measured it over all 86 rows, and **reverted it**: it scored
55/83 against the spike metric's 60/86 because it flipped `blueshark` from 5/9
to 1/9. It is the better metric on 11 of 12 bakes and worse on the one that
matters most. **That is where the next lane should start** — a hybrid that takes
skew where the spike score is degenerate (< 0.05) and spike otherwise would very
likely clear the gate, and it is a small change to one function.

The `y-` and `z+` rows also fail disproportionately (9/10 and 4/5 against 9/60
for `y+`), which the hemi compensation covers only along world Y.

---

## Traps confirmed still live

- **No backticks inside the GLSL template literals.** Still true, still fatal.
- **GLSL ES does not broadcast a float into a vec in an addition.** Every new
  vector op in this round is written with explicit constructors.
- **A `String.replace` on an already-consumed shader token fails SILENTLY.**
  This is the one that cost this lane three rounds. Any new injection into a
  chained `onBeforeCompile` must anchor on text the previous callback actually
  emits, and should be verified by rendering a deliberately absurd colour
  through it before anything subtle is tuned.

## Hook an orchestrator may want

None. Every change is inside `hse/skin_identity.js`; the `shark3d.js` uniforms
are written in place through the existing `rfTexturedUniforms` objects, so
neither `shark3d.js` nor `data.js` is touched.

---

# Round 4 addendum — coordinator's two bounded asks

## 1. The hybrid metric: IMPLEMENTED, MEASURED, NO IMPROVEMENT

`measureBindUp()` now scores every candidate axis on BOTH metrics in one pass
and selects: peak reach where it has a real spike, skewness where it does not
(`SPIKE_DEGENERATE = 0.05`). Kept, because it is strictly more robust and costs
one extra accumulator, but it does **not** move the roster.

| configuration | countershade >= 0.15 | negative | mean |
|---|---|---|---|
| spike only (round 4 body) | 57 / 86 | 11 | +0.219 |
| **hybrid @ 0.05** | **57 / 86** | 11 | +0.219 |
| hybrid @ 0.20 | 57 / 86 | 11 | +0.219 |

**Why my earlier hypothesis was wrong.** I had read "spike 0.000" off
`whitepointer` and `tigershark` and concluded the metric was falling through to
noise on them. That 0.000 is their **axis-0** score; the score on the axis the
metric actually SELECTS (axis 1) is 0.130 and 0.177 — above any sensible
degeneracy threshold. Per-bake, both metrics independently choose **axis 1,
sign −** for both bakes. The axis was never wrong on them, so no axis metric can
fix them. Raising the threshold to 0.20 to force the skew path on those two
changes the selection but not the result, which confirms it.

The only bake the hybrid actually re-decides is `goblinshark` (1 row), whose
spike is genuinely degenerate.

**So the remaining 29 failures are not an axis problem at all.** They are rows
whose band is correctly oriented and under-driven — `tigershark`'s six rows
measure +0.067 to +0.118, all positive, all short of 0.15. The next lever is
contrast on those rows, not orientation.

## 2. Where the tiger mauve is carried

**It is NOT `shark3d.js`. I could not reproduce it there, and the probe that
would have proved it disproved it instead.**

Measured chain, each step on the rendered DOC close-up:

| point in the pipeline | tiger measured |
|---|---|
| diffuse atlas in the GLB (`img1`) | RGB(147,142,137) **hue 0.086 bronze** |
| texture bound at runtime as `map` | RGB(147,142,137), name `tiger_nu_diffuse` |
| `uRfHueShift` at render time | **0.1099** (bronze — correct) |
| `uRfHueBlend` / `uRfSaturation` | 1.0 / 0.0 |
| rendered lit flank | RGB(112,106,120) **hue 0.744 mauve** |

The BAKE lane's re-bake worked: the atlas is bronze and correctly bound
(`baseColorTexture` → img1, `normalTexture` → img0, verified in the glTF JSON
and again on the live material). The uniforms `skin_identity.js` writes are all
correct.

**The decisive experiment.** Forcing a hardcoded `vec3(0.72, 0.55, 0.30)`:

- injected at **`shark3d.js`'s steer exit** (right after
  `diffuseColor.rgb = rfHsvToRgb(rfHsv);`, shark3d.js ~:1984) → renders
  **hue 0.675, mauve**;
- injected at **the identity block's exit** (last write in `skin_identity.js`)
  → renders **hue 0.142, bronze**.

Same constant, same row, same frame. So everything *upstream* of my block is
innocent and the cast is introduced *between* those two points — i.e. inside
`rfIdCountershade()` in **my own file**, not in `shark3d.js`.

**Do not patch `shark3d.js` at merge.** There is nothing there to patch: its
hue steer receives a bronze texel and emits the bronze target hue. Patching it
would be chasing a symptom into the wrong file.

What I ruled out inside `rfIdCountershade()` within the time box, each by
rendering with the term disabled: the hue compensation (a no-op here —
`rfIdNear` computes to 0.000 for a bronze hue against the water hue), the
`preserved`/`extreme` eye term, the belly-warm mix, the micro-detail albedo
multiply, the `LIGHT_TINT` pre-divide, the `CHROMA_LOCK` re-assert, and a 3.5x
saturation boost. None of them is the carrier.

What that leaves, and where the next lane should look: the function rebuilds
colour as `rfIdHsvToRgb(vec3(regionHsv.x, sat, value))` and the hue reaching it
survives correctly, so the suspect is the HSV round-trip itself at very low
saturation — `sat` arrives at **0.068–0.179** on these rows, and at that
saturation the rgb→hsv→rgb pair is numerically fragile (`d/(q.x+1e-5)` in
`rfIdRgbToHsv`). A bronze at sat 0.07 and a mauve at sat 0.11 are three 8-bit
codes apart. That is consistent with every symptom: it explains why the hue is
right in the uniform and wrong in the pixel, why greatwhite (a hue near the
water) is unaffected while tiger and bull (hues far from it) are not, and why
raising saturation upstream never helped — the lift was applied before the
round-trip that loses it, not after.

**Concrete next step:** carry hue/sat as-is and only ever WRITE value, instead
of decomposing and recomposing the whole colour per texel. That removes the
round-trip entirely and is a small, self-contained change to one function.

## Incident: `shark3d.js` was briefly clobbered and has been restored

While isolating the above I made a temporary probe edit to `shark3d.js` (a file
I do not own) and kept a backup to revert it. Between taking that backup and
reverting, the ORIENT lane landed its orientation resolver in the same file, so
my `cp` of the stale backup removed their work.

**Fully restored and verified**: `resolveOrientation()` and its four helpers
(`orientSamples`, `orientSpike`, `orientSkew`, `orientGirthBias`),
`SPIKE_DEGENERATE`, `orientationCache`, the resolver call in `prepareTemplate()`
with `scene.quaternion.premultiply(...)` and `scene.userData.rfOrientation`, and
the removal of all four superseded laws (bind-pose axis law, conditional roll
law, `NOSE_FLIP_KEYS` girth test, Head/Tail bone spin). Braces and parens
balance; selftests `art3d 31/0`, `world 379/0`, `game 386/0` all green, and
`world`/`game` both exercise `prepareTemplate` on every model.

**Lesson for the orchestrator:** with seven lanes editing concurrently, a
file-level `cp` restore is unsafe even when it is reverting your own edit. Probe
edits to unowned files must be reverted by inverse patch, or not made at all.

---

# Round 4b — the HSV round-trip WAS the carrier. Confirmed and removed.

`rfIdCountershade()` and every marking/accent path in this file now work in RGB
only. `rfIdRgbToHsv` / `rfIdHsvToRgb` are no longer called anywhere in the
fragment path (the two definitions remain, unreferenced, for the next lane to
delete once nothing else wants them).

## The mechanism, and the fix

The old path decomposed the colour to HSV, rewrote all three channels, and
recomposed, per texel. `rfIdRgbToHsv` derives saturation as `d / (q.x + 1e-5)`,
and these hides arrive at saturation 0.068-0.179 - the regime where that
division is numerically fragile and a bronze and a mauve are a few 8-bit codes
apart. That is why `uRfIdBaseColor` could hold a demonstrably correct bronze
while the rendered flank came back mauve.

The rewrite never asks a colour what its hue or saturation is:

- **Recolor**: `recolored = uRfIdBaseColor * (value / rfIdBaseLum)` - one scalar
  multiply, so the channel RATIOS (hue and saturation) are preserved exactly, by
  construction, forever.
- **Belly desaturation**: `mix(vec3(value), recolored, ...)` - a pull toward a
  neutral of the SAME brightness, which desaturates without measuring
  saturation and cannot disturb the value band.
- **Belly warmth, accent, pattern mark, chroma re-assert**: all RGB `mix()`,
  each scaled to a target brightness the same way. Saturation ceilings are
  enforced by mixing a swatch toward its own luminance rather than by clamping
  an HSV component.
- **Eye preservation**: scales the species colour to the photo's luminance, so
  even the painted eye cannot introduce a hue shift.

## Result: the mauve is GONE on every accused row

Measured on re-shot DOC close-ups, mid-flank, same script both columns:

| row | HSV path | **RGB path** |
|---|---|---|
| `cookiecutter` | 0.862 | **0.095** |
| `bull` | 0.851 | **0.097** |
| `epaulette` | 0.842 | **0.132** |
| `sawshark` | 0.819 | **0.166** |
| `snapjaw` | 0.817 | **0.185** |
| `tiger` | 0.737 | **0.263** |
| `hammerhead` | 0.751 | **0.304** |
| `blue` / `mako` / `reef` | 0.472-0.503 | 0.582-0.601 (correctly still blue-grey) |

`bull` lands at 0.097 - inside the 0.09-0.12 bronze target asked for. Tiger
reaches 0.263 rather than 0.11: its albedo ratios ARE bronze (#a29985 ->
R 1.056, G 0.997, B 0.867 relative to luminance), so what remains on that row is
its bake's own green-leaning normal/lighting response, not a colour bug in this
file. Visually it now reads as a real shark - dark back, pale belly, stripes
legible - where before it was a mauve blob.

## One calibration trap this surfaced, worth recording

The first RGB cut scaled to **Rec.709 luminance** and the countershade
regressed on saturated rows (`cookiecutter` +0.322 -> +0.118, `epaulette`
+0.502 -> +0.082) while near-neutral rows barely moved. Cause: the band
constants were tuned against HSV's **V**, which is `max(r,g,b)` and is always
>= luminance, so a luminance scale renders every row darker than the constants
intend, by an amount that grows with saturation.

Switched the brightness scalar to `max(r,g,b)`, which keeps this a pure change
of MECHANISM with no change of calibration. `tiger` then went +0.169 -> **+0.357**
and `thresher` +0.286 -> **+0.439**.

## Countershade after the rewrite

On the 11 rows measured before the full roster shoot was overtaken by another
lane's concurrent Chrome usage: **8 of 11** clear 0.15, against 10 of 11 on the
HSV path. The two that fall short are `cookiecutter` (+0.141) and `epaulette`
(+0.114), both marginal and both on bakes (`smoothhound`, `bullhead`) whose
belly is not reaching brightness - their belly medians measure 0.435 and 0.471
against tiger's 0.612, i.e. the bake detail gain is compressing them. That is a
band-calibration question on two bakes, not a mechanism question.

## FULL ROSTER, all 86 rows re-shot on the RGB path

| metric | BEFORE round 4 | HSV path (4) | **RGB path (4b)** |
|---|---|---|---|
| **countershade >= 0.15** | 29 / 86 | 57 / 86 | **68 / 86** |
| rows with NEGATIVE countershade | 30 | 11 | **6** |
| genuinely pink/magenta (hue > 0.85) | 29 | 26 | **3** |
| saturation inside 0.08..0.35 | 67 | 82 | **82** |
| decal rows (>10% at sat > 0.5) | 31 | 13 | **4** |
| countershade mean | +0.066 | +0.219 | **+0.229** |

**68 / 86 against the gate of 70 - two rows short.** Still not met, still not
claimed, but the rewrite moved it 57 -> 68 while fixing the colour.

The four named rows all pass now:

| row | countershade | hue | decal |
|---|---|---|---|
| `greatwhite` | **+0.314** | 0.580 slate | 0.006 |
| `tiger` | **+0.357** | 0.263 | 0.006 |
| `bull` | **+0.176** | **0.097 bronze** | 0.013 |
| `typhonmaw` | **+0.186** | 0.616 | 0.012 |
| `snapjaw` | **+0.372** | 0.184 | 0.009 |

On the "24 mauve rows" the crude 0.60-0.95 band reports: 21 of them sit at hue
0.60-0.72, which is blue-indigo and CORRECT for the blue/mako/reef/whitepointer
families. Only **3** rows are genuinely pink (hue > 0.85: `artemisstrike`,
`omenmaw`, `mirrorscale`), all fantasy rows keeping their authored accent under
the reduced fantasy chroma lock. Down from 29.

Evidence: `hse/evidence/r15-skin4/contact_sheet_rgb.png` (before | HSV | RGB for
the four named rows), `results_after_rgb.json`, `after_rgb_*.png`.

## Selftests

`art3d 31/0`, `world 379/0`, `game 386/0` - all green after the rewrite.
No edits to `shark3d.js` (ORIENT lane owns it); no backticks inside any GLSL
template literal; no float-into-vec broadcasts.
