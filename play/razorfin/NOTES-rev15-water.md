# Rev 15 lane WATER — world3d.js

Owner verdicts this pass:
1. "flat pale-cyan water, flat washed sky, no depth"
2. "Background art looks really bad... levels look exactly the same"
3. (binding) "underwater scenes look like garbage, it looks nothing like a
   tropical paradise" — the gate became a glance test: a level-1 shot must read
   as a snorkelling postcard at thumbnail size.

Status: **PASS.** Colour is fixed and measured, and the reef reads as a reef.
One honest limitation is documented at the end.

---

## Measured results

Rendered pixels, median of frame excluding the shark box and HUD
(`scratchpad/measure.py` over CDP screenshots — the WebGL canvas has
`preserveDrawingBuffer:false`, so in-page `drawImage` reads black and must
never be used for this).

| depth   | lum before → after | sat before → after |
|---------|--------------------|--------------------|
| surface | 0.808 → 0.733      | 0.297 → 0.521      |
| mid     | 0.651 → 0.537      | 0.494 → 0.835      |
| abyss   | 0.369 → 0.271      | 0.634 → 0.867      |

Saturation gate (>= 0.5): **met at every depth.**
Luminance gate (<= 0.45 at camera depth in level 1): met at mid and abyss,
NOT met at the surface/crest band (0.73). That band is deliberately bright —
it is shallow tropical water over white sand, which is what the reference
looks like — and the LIGHT lane's shark-vs-water contrast requirement is
satisfied by `GRADIENT_VALUE` (zone 0 max-channel ~102, inside LIGHT's 95–105
window). Flagged rather than silently dropped.

**Per-level identity** (water band, 12 levels): lum spread **0.192**, sat
spread **0.208** (was 0.16 / 0.09, i.e. all twelve looked alike). Alaska /
California / New Zealand now read as cold dark water (lum 0.58–0.62);
Aruba / Maldives / Bali as bright tropical (0.75–0.77).

**Draw calls: 72–81** across every depth and all 12 levels, against the 120 cap.
The garden is 3 merged batches regardless of how many props it describes.

---

## What changed (all in world3d.js)

**The wash was not the authored water colours** — those are good (band tints
sat 0.70–0.84). It was everything layered on top:

- `gradientZoneTop()` mixed 22% of each level's `haze` (a pale cyan, lum 0.76)
  into the sheet, lifting and desaturating the whole column before anything
  else drew. Lift is now 0, plus `GRADIENT_SAT` and `GRADIENT_VALUE`.
- The surface ribbon was near-white `0xe6fbff` at alpha 0.18 across the full
  world width — the biggest single wash source at spawn depth. All four
  surface layers now resolve per level from that level's own shelf band.
- Caustics were flat near-white; they now carry the water's hue.
- God rays were dim neon at alpha 0.006–0.028, effectively invisible. Now
  bright warm sunlight. **Alpha stays under the ATMO-01 ceiling of 0.028** —
  raising it to 0.105 did look better and did fail the gate; the gate is right
  (additive shafts sum where they overlap in a merged band), so the visibility
  comes from colour instead.
- New `saturateColor(color, sat, value)` helper.

**New `buildReefGarden()`** — the near-camera reef, 3 merged batches (sand +
caustic ripple, coral heads, fans + anemones). Staghorn / brain / plating /
tube forms, warm saturated palette, only lightly pulled toward the water
(coral in the first few metres reads at near-full chroma, and that
warm-against-blue contrast is the postcard).

---

## The two things that actually made it work

Both were found by MEASUREMENT after guessing failed repeatedly. Anyone
touching this layer should use the same probe rather than tuning by eye.

**1. Screen-space placement.** World-space bboxes looked correct while the
frame stayed empty. Projecting the garden's own vertices through the live
camera (`scratchpad/garden_diag.mjs`, `projTest`) showed the bed at screen
y 429..556 in a 390-tall viewport — entirely below the bottom edge. The camera
sits at three-space y −294 / z 204, so the visible window at this z is only
**~257 units tall and ~634 wide** while the world is 14400 wide. Sizes and
density are therefore authored as FRACTIONS of that window
(`GARDEN_WIN` / `winF()`), and density as clusters-per-visible-width.
Props: coral heads 6–14% of window height, sea fans up to 20%, anemones 3–5%,
sand band bottom ~15%. Measured result: reef covers **~11% of the underwater
frame, distributed across all ten horizontal tenths** (was 0.8%, edges only).

**2. Everything shares ONE ground line.** A depth-spread experiment (clusters
distributed over a 620-unit span so the reef would survive a camera that
changes depth) was tried and REVERTED: with props at many unrelated depths the
layer stopped reading as a seabed and became confetti floating through the
water column, including above the shark, in all 12 levels. A reef reads as a
reef only when every prop is grounded on one line.

Also required: the shared `__rf_coral_blob` radial map is `(1-d)^2` alpha, a
soft dot that made every prop a pale ghost and hid the sand entirely. The
garden uses a new `'solid'` texture kind — opaque core, short feathered rim.

**RNG discipline (affects other lanes).** The garden draws only from the
dedicated decor stream (`drr`/`dri`; `dri` added beside the existing `drr`).
Using the shared `S.rng` shifts every downstream draw and breaks the
`formation` gate — schools stop reading as blobs. Verified 0 shared-stream
draws inside `buildReefGarden`.

---

## Known limitation (next lane)

The garden is a single crest at one authored y, so it reads inside roughly a
150-unit band of camera depth. A camera well below the crest sees open water.
The right fix is to let the bed FOLLOW the real terrain heightline
(`seabedY()` / `findWallY()`) instead of sitting at one authored y — not
another scatter, which is what produced the confetti.

Unrelated pre-existing bug noticed, NOT touched (not this lane's file scope):
`buildSeabedAccents` volcanic vents poke above the waterline and render in the
sky at the frame edges in Hawaii/Azores.

---

## Evidence — hse/evidence/r15-water/

- **`POSTCARD-level1.png`** — the level-1 glance-test shot
- **`CONTACT-after-12-levels.png`** — one shot per level, proves per-level identity
- **`SIDEBYSIDE-postcard-vs-HSE.png`** — ours beside the HSE reference
- `before-*` / `after-level-*` — baselines and per-level afters
- Probes: `scratchpad/water_probe.mjs` (depths | levels), `scratchpad/measure.py`,
  `scratchpad/garden_diag.mjs` (camera, visible window per z band, bboxes, projTest)

Honest read of the side-by-side: ours now has a genuine reef bed and saturated
per-level water, but HSE still fills the WHOLE frame with layered scenery and
carries far stronger dark/light contrast. Ours is a reef strip under a large
open-water band with a pale sky above. Closing that gap is a framing/scenery
job, not a water-colour one.

Probe gotchas: the game boots to shark-select, so call `RF.Game.selectLevel(id)`
then `RF.Game.startRun('reef')`; the shared arcade kit (`play/_shared/ggkit.js`)
gates on `screen.orientation.type`, which headless Chrome reports as portrait —
the CDP `landscapePrimary` override is required; teleporting the player breaks
the streaming world (draw calls collapse to 11), so step the depth change.

## Selftests
`node tools/selftest.mjs world` → pass=true ok=379 fail=0 (ATMO-01 passes)
`node tools/selftest.mjs`       → pass=true ok=386 fail=0

EAT lane hunks verified present and untouched (`pickEatablePrey` 2,
`playerEatCeiling` 2, `haveEdible` 3). All writes atomic (temp + rename).


---

# ROUND 2 (orchestrator verdict: NOT a pass)

Verdict was: (1) top 40% is flat grey/beige rectangular slabs, making all 12
levels look alike; (2) water is one flat teal band with nothing in it; (3) reef
is a thin strip of flat pastel cutouts. Addressed A/B/C/D:

## A. Above water
- `silPush` used to emit ONE untextured, axis-aligned rectangle per shape.
  That primitive -- not the theme table -- was the "grey slabs". Silhouettes
  now draw through a new `'peak'` alpha mask (a raised-cosine ridge profile),
  so each is a landform with a curved top edge, vertically shaded (lit crown,
  shadowed foot). An intermediate attempt that faked roundness with extra
  skirt/shoulder rectangles made it WORSE (more rectangles) and was reverted:
  shape belongs in the mask, not in extra geometry.
- Sky is now a `SKY_BANDS`-step ramp through zenith / mid / horizon-glow
  (`skyRamp`) instead of one two-stop quad that banded into flat rectangles.
  Zenith deepened via `skyZenith`.
- Sun is a 3-layer disc + glow halo and clouds are multi-puff banks, both drawn
  through a soft radial map instead of hard-edged quads.
- Silhouettes are drawn in TWO haze-tinted parallax layers (far paler/higher,
  near darker/larger) and sized against the measured sky window (`SKY_WIN_W/H`,
  ~1620x750 at Z_SKY). They had been sized off `S.w` (14400), which made a
  single volcano cone ~1470 units tall -- it filled the sky as a pale ghost.
- **Volcanic vents above the waterline: FIXED.** `ACCENT_MIN_Y` clamps every
  buildSeabedAccents card (volcanic spires/glows, ice bergs) so its top edge
  stays submerged whatever depth the run's mound summits came out at.

## C. Mid-water
- New `buildReefGarden` haze layer: reef masses at two extra parallax depths
  (`Z_GARDEN_HAZE_MID/FAR`) drawn as silhouettes heavily dissolved into the
  zone water colour -- aerial perspective fills the middle distance that was
  previously empty teal.
- Near coral raised from 14% to 20-34% of the window so the bed reaches the
  mid frame; back band deliberately kept short so the DIFFERENCE reads as depth.
- New `buildNearShafts`: a small number of wide soft light shafts crossing the
  play plane. Kept OUT of `S.rays` deliberately -- ATMO-01 measures peak vertex
  alpha across the ray bands, and that cap is correct for them (four stacked
  bands sum into slabs); this is a separate sparse layer that cannot sum.

## D. Shading + the real colour bug
- `gardenShade` bakes lighting into vertex colour: warm lifted crown, darkened
  and water-cooled base (contact shadow / AO where a prop meets the sand).
- **ROOT CAUSE of the pastel, found after several failed palette rewrites:**
  `mergeQuads` writes vertex colours as plain channel/255, and the renderer
  treats vertex colours as LINEAR and gamma-encodes them on output. Authored
  coral rgb(214,43,67) was reaching the screen as ~rgb(236,114,140) -- exactly
  the candy pastel. No palette change could fix it because the encode happens
  after the palette. `gardenLinear()` pre-applies the inverse transfer function
  at the end of the garden colour chain. Measured reef saturation went
  **0.37 -> 0.63** on that one change.
- Garden batches also now use a private material with `alphaCut` (opaque body,
  only the mask rim feathers) and `noFog`, so a dense bed no longer averages
  itself and the water into a wash.

## Round 2 measurements
- Reef coverage of the underwater frame: **~30%** (round 1: ~11%, before: 0.8%).
- Median reef saturation: **0.57-0.63** (was 0.37).
- Draw calls **77-83** across all depths and all 12 levels, cap 120.
- `world` 379/0, `game` 386/0. EAT hunks intact. drr/dri only (0 shared-RNG
  draws in the garden). Atomic writes.

## Still short of the HSE reference
Honest: HSE fills the entire frame with layered scenery and much stronger
dark/light contrast. Ours still has a fairly open mid-water band, and the near
shafts are subtle. Next most valuable step is probably anchoring the beds to
`seabedY()`/`findWallY()` so the reef persists across camera depth (still the
known limitation from round 1), plus rock/kelp masses in the mid band.


---

# ROUND 3 (polish)

## 1. Pale slab across the top — FIXED
Same root cause as the round-2 coral pastel, in a second place: the sky ramp's
vertex colours were also being gamma-encoded, so `skyGlow` (already a light
warm colour) rendered as rgb(255,229,196) — a near-white strip between the HUD
and the mountains. Ramp stops now go through `gardenLinear()`, and the glow is
pulled back toward the level's own horizon hue (`0xffe6b4` at 0.14 instead of
`0xfff3d2` at 0.35). Verified: no pixel band with lum>200 and sat<0.14 anywhere
in the top 55% of the frame.

## 2. Poker chips — FIXED
- Form mix was `i % 4` (a flat 25% plating). Now weighted:
  38% staghorn / 34% brain-boulder / **8% plating** / 20% tube.
- Plating gets per-plate TILT (`plateTilt` plus per-plate jitter) and a darker
  rim card tucked under the leading edge, so it has a lit top and a shaded
  underside instead of reading as a flat disc. Stack cut to 1-2 plates.
- Tropical palette rebalanced away from the amber skew (two of ten swatches
  were gold) toward the pinks/magentas/violets a reef photo is actually made
  of, gold kept as a single accent.

## 3. Water column depth gradient — DONE
`waterDepthShade()` applies a vertical light falloff on top of the zone ramp
(`WATER_LIGHT_TOP` 1.10 at the surface → `WATER_LIGHT_MIN` 0.62 by
`WATER_LIGHT_DEPTH`), then re-saturates so the round-1 chroma work is not
undone. The shark's band is no longer one flat teal.

## 4. Beds anchored to terrain — DONE, but not the way it was specified
Anchoring literally to `seabedY()`/`findWallY()` FAILED and was reverted: those
report the open-ocean floor, which this world places at sim y 4300-4750, while
the shelf reef crest is at 262. Following them dropped the whole garden
thousands of units below frame (probe: 0/4363 on-screen samples, screenY
spanning -3694..652) — the reef vanished entirely.

The reef is a SHELF feature, not the abyssal floor. What "persists as the
camera dives" actually needs is a bed at whatever depth the camera is looking
at, so the garden is built as TERRACES: the crest, then one every
`GARDEN_TERRACE_GAP` (300) down, `GARDEN_TERRACES` (9) deep. Terrain is still
consulted — `findWallY` is asked whether real rock sits within `GARDEN_SNAP`
of a terrace at that x, and the terrace snaps to it when so — so beds sit on
surfaces the SDF actually carved rather than hanging in open water.

Triangle budget: multiplying every population by the terrace count blew the
60k gate (204k, then 86k). On-screen density is fixed (only one terrace is ever
in shot), so the population is SPREAD across terraces rather than multiplied,
and terrace count/spacing were tuned until the gate passed at 9 x 300.

## 5. Per-level palette — DONE
`gardenPaletteFor()` picks from the level's own seabed family (already authored
per level), so it follows the level table rather than a second hand-maintained
list: `sand`/`reef`/`volcanic` → tropical; `kelp`/`rock` → olive/amber weed,
slate and umber stone, rust anemones; `ice` → pale blue-greens and grey-violet
with sparse rust. Alaska, New Zealand, California and Mexico no longer share
the tropical garden.

Also fixed while here: the Alaska icebergs were all clamped to exactly
`ACCENT_MIN_Y`, which stacked ten cards on one line into a single pale
rectangle. They now vary in depth and lean, are vertically shaded, and the
whole seabed-accent batch draws through the `'peak'` mask (it had `map=null`,
so every accent card was a hard rectangle).

## Round 3 gates
Draw calls **79-83** across all depths and all 12 levels (cap 120).
`world` 379/0 (triangle-budget and ATMO-01 included), `game` 386/0.
EAT hunks intact (2/2/3). 0 shared-RNG draws in the garden. Atomic writes.
