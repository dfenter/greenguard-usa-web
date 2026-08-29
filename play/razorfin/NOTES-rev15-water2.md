# Rev 15 lane WATER2 — world3d.js

Owner directive (binding): *"Make water look more fluid and realistic;
underwater backgrounds need to look way better, like the picture."*
Reference: `~/Downloads/hseunderwater.jpg`.

Evidence: `hse/evidence/r15-water2/`. Selftests: `world` 380/0, `game` 394/0.
Live draw calls **82–91 across all twelve levels**, cap 120.

---

## What the baseline actually looked like

The r15-water notes claim a PASS with a reef that "reads as a reef". The
first thing this pass did was re-render it, and the render does not support
that claim. `before-mid.png` is flat teal water, a **giant opaque beige
rectangle** across the bottom half of the frame, cartoon pastel blobs for
coral, and no haze, no shafts, no bubbles, no rock. `before-shelf.png` is the
same with a pale sky band on top.

Two of the three defects the previous notes report as fixed were still
present in pixels. That is worth recording, because the same class of error
(measuring geometry-space quantities and inferring the frame looks right)
is what produced them.

---

## The five required items

### 1. A real fog/haze model by distance — `hazeMix` / `hazeColor`

The previous pass tinted decor by an authored per-band `depthFrac` constant.
That is a **flat tint**: it cannot tell the hero coral at z −34 from the back
band at z −110 if their bands say the same number, and nothing about it
changes with distance. Every prop therefore came out in the same air, which
is precisely why the reef read as stickers on a teal card.

`hazeMix(z)` is a Beer–Lambert extinction over real distance from the camera
plane (`HAZE_CAM_Z − z`, `HAZE_K = 1/430`). A band at z −34 keeps ~57% of its
own colour, z −110 ~47%, z −280 ~33%, z −420 ~25%. `hazeColor` mixes toward
the **water hue** (not toward grey — water scatters, it does not desaturate to
neutral) and partially restores the residual chroma; `hazeShade` collapses a
band's internal light/dark spread as it recedes, which is the "softening"
half of aerial perspective.

`gardenTint` now takes the prop's real `z` and runs its result through it, so
near/far separation in the reef comes from one curve instead of a dozen
hand-tuned constants.

### 2. Animated shafts + caustic projection

- **`buildNearShafts`** was a static batch of fourteen narrow streaks. It is
  now the same fourteen shafts, much wider and softer, pushed behind the play
  plane, hazed by their own depth, and hung off a **pivot at the waterline**
  so the whole set sways and breathes (driven in `animateWater`). Deliberately
  still ONE batch and still taking exactly the same six `drr` draws per shaft
  in the same order — see "The RNG trap" below.
- **`causticTexture()`** is a real caustic web: the product of several rotated
  `|cos|^k` ridge fields, which is the interlocking bright-filament pattern a
  water surface actually projects. The three existing `buildCaustics` planes
  now carry it instead of the generic three-sine ripple (which read as soft
  banding), and scroll on the shared phase.
- **`World.caustic`** publishes `uCausticPhase` / `uCausticStrength` /
  `uCausticScale` / `uCausticColor` as three.js-shaped uniform records, so
  `engine3d`/`shark3d` can bind them into a shader injection with **no
  cross-lane edit**. `World.causticState()` is the plain-object read for a lane
  that does not want uniforms. Strength falls off over
  `CAUSTIC_SUBJECT_DEPTH` (1400) — caustics are a near-surface phenomenon.
  *This is the one thing an orchestrator must hook.*

### 3. Bubbles + motes — one batch, `RF bubble streams and motes`

14 emitters × 7 bubbles, animated by **rewriting the batch's own vertex
positions** each fixed step: one buffer write, one draw call, no per-bubble
objects. Each bubble carries a rise phase, a wobble frequency and a size;
`animateBubbles` maps phase→y, adds a two-term spiral wobble, grows the bubble
as pressure drops and **bursts** it in the last 8% of the climb.

`r.span` clamps the climb below the waterline: `mergeQuads` hard-clips every
non-sky vertex at three-y 0, so a bubble allowed to rise past the surface does
not disappear, it **flattens into a smear on that line**.

The 90 motes have no mesh of their own — `pushMotes()` emits into the same
quad scratch, since the two want an identical material and the motes are
static. Triangles only, zero draw calls.

### 4. Rock backdrop — `buildRockBackdrop`, one merged batch

Three parallax depths of ceiling masses with **stalactites** (`peak` mask,
rotated π so the ridge points down — that is exactly a stalactite profile),
floor outcrops, and side walls. Per-level base hue via `rockBaseFor` (dark
teal cave / slate / ice / near-black volcanic).

**The side walls needed a second pass, and it was the single most valuable
change in the whole lane.** Stacking our frame beside the reference makes the
gap obvious: the reference's rock is a *continuous dark cave wall occupying
the outer third of the frame on both sides, running floor to ceiling*, and the
play area is the lit gap between them. The first cut made them narrow columns
(10–24% of the visible window wide, hanging from the ceiling), which read as
posts standing in open water — so the frame still had no sides. They are now
34–52% of the visible width, span the whole visible column
(`ROCK_FLOOR_Y − ROCK_SUBMERGE` × 1.15–1.55), sit on a pitch of ~0.92 visible
widths so a camera almost always has rock at an edge, and every third one is
cut down so the line reads as broken cave wall rather than a picket fence.

Three bugs found by rendering, all worth keeping written down:

- **The rock came back PALER than the water** — the opposite of the intent and
  of the reference. Same root cause as the coral pastel and the sky ramp
  before it, in a third place: `mergeQuads` writes vertex colours as plain
  `channel/255` and the renderer treats them as **linear**, gamma-encoding on
  output, so authored `0x1d3b44` reached the screen near `0x5c8390`. Fixed by
  `gardenLinear()` inside `rockColor`.
- **A dark slab lay across the sky.** A ceiling mass hanging from y=60 with a
  tall body was not removed above the waterline, it was **flattened onto it**
  by the same y≤0 clip. `ROCK_CEIL_Y` moved to 150 and every ceiling/wall card
  is clamped by `ROCK_SUBMERGE`, a guard rather than a hope about the numbers.
- **Masses wider than the screen.** `winF(2.6)` is ~670 units against a
  measured visible width of ~634. Sizes are now fractions of `ROCK_WIN_W` and
  counts are derived from how many should be visible *at once* — the same
  lesson the reef garden already learned and wrote down.

`rockColor` deliberately does **not** use `hazeColor`: haze pulls toward the
water, and the near rock in the reference is much darker than its water. Only
the far band carries a real `lift` into the water column.

### 5. Surface from below — `buildSurfaceGlow`

One plane doing both jobs: the ripple map (shimmer) plus a vertical alpha
gradient from the waterline down (glow), scrolled on two axes at unrelated
rates so the interference reads as refraction rather than a texture sliding
sideways. Two stacked counter-scrolled planes were nicer and cost a draw call
this world does not have.

It gets its **own copy** of the ripple texture. Sharing the cached
`__rf_surface_ripple` (repeat 3 × 1.5, correct for the small surface wash) put
three enormous bright cells across a 15000-unit plane, and additive blending
rendered each as a **blown-out white disc sitting on the shark**. At repeat
46 × 2.2 the same map is fine shimmer.

---

## Also fixed while here

- **The beige slab.** The garden sand floor was `winF(0.30)` of unmasked,
  untextured, fully opaque gradient quad across the whole world — a third of
  the frame, and the single most-reported defect in every render. It is now
  `winF(0.17)`, drawn through the `peak` mask so its top edge is a rolling
  ridge rather than a ruled line, hazed at its own z, `gardenLinear`-encoded,
  and its palette pulled well down from near-white `0xf2e4c4` to `0xc9b48d`.
  A near-white floor was lifting the whole frame's value — the wash the LIGHT
  lane measured and asked to have fixed.
- **Sky rendering underwater.** The mid-depth frame had mountains and clouds
  painted across it from 1800 units down. `skyVisibleFrac(camY)` depth-fades
  the four sky meshes (`S.skyLayers`), the same treatment `ribbonFade` already
  gives the ribbon, foam and Snell window for the same class of defect.
- **The Snell bloom disc.** Read as a hard white disc floating in mid-frame
  across the contact sheet. Deleting it failed five selftest gates that assert
  it exists, so it stays and its ceiling drops 0.026 → 0.009 with squared
  falloff; the "bright surface above" read is now the glow's job.

---

## The RNG trap (read this before touching this file)

`buildNearShafts` runs **before** `buildReefGarden`. Every draw it takes from
`drr` shifts the garden's placement, and through the garden's `findWallY`
terrain probing it shifts the **SDF push-out, ringPoint and relic-pocket
gates** as well. A first cut that split the shafts into four bands drawing
from a new stream failed three apparently unrelated selftests, and cost three
draw calls. The rewrite keeps six `drr` draws per shaft in the original order.

This pass's own new layers draw from a **third dedicated stream** (`wr`/`wi`,
`waterRng`), beside the existing shared and decor streams, for the same
reason the decor stream exists at all.

## Draw-call gate

`PERF-03` moved 60 → **62**, for exactly two named batches, and only after
every cheaper option was taken: motes ride the bubble batch, glow and shimmer
are one plane, and the caustic dapple has **no plane at all**. The binding
live budget is the shipped ≤120, measured at 82–91 across all twelve levels.

---

## Honest read against the reference

**Closed:** dark rock now frames the frame top and sides at three depths with
visible stalactites; haze is a real distance curve, so near coral is crisp and
the back band is bluer and softer; bubbles rise and burst; caustic filaments
move across the water and the sand; shafts sway; the beige slab and the white
bloom discs are gone; all twelve levels read differently.

**Still short:**

- The water **above** the shark is still a fairly bright sky-blue band rather
  than the reference's deep teal. That band is the gradient sheet's zone-0
  top, owned by `GRADIENT_VALUE`/`GRADIENT_SAT`, and lowering it further
  collides with the LIGHT lane's 95–105 max-channel window. It needs to be
  settled jointly with LIGHT, not unilaterally here.
- The rock reads as **layered dark bands** more than as the reference's
  chunky, faceted, individually-lit boulders. The `peak` mask gives one ridge
  per card; real outcrop shape wants either a second mask kind or marching-
  squares chunks like `buildRockChunk` already produces for near rock.
- **Coral silhouettes are still ellipse stacks.** The forms are right in
  arrangement and now correct in colour and haze, but a brain coral is a
  stack of soft ovals rather than a lobed mass. That is a mask/texture job.
- **No kelp or sea-plant clusters were added** at the bottom as the brief
  asks. The existing `buildDecor` kelp beds are there, but nothing new; the
  triangle budget (60k cap, world already ~57k) had no room left after the
  rock backdrop, and cutting the rock to fund kelp was the wrong trade given
  the rock is what does the framing.
- **The Snell window still blooms.** Cutting its ceiling 0.026 → 0.009 with a
  squared falloff reduced it but did not remove it; small white discs are
  still visible in several frames of the contact sheet. The right fix is to
  delete the object, which five selftest gates forbid, so it needs those gates
  revised in the same change — out of scope to do unilaterally here.
- The far rock band is **thinner than I would like**. It was cut late to give
  back triangles when the MAZE lane's terrain work pushed `california` over
  the shared 60k gate (60273). Framing still holds because it comes from the
  near band and the side walls, but the sense of a deep cave receding is
  weaker than in the shot taken before that trim.
- Mid-depth could not be verified by screenshot: the probe's `swimTo`
  teleports the player, which breaks the streaming world (a known gotcha in
  the r15-water notes — draw calls collapse and the frame empties). The
  mid-depth shot in the evidence folder is that artifact, not the game.

## Merge note

**The one thing to hook:** `World.caustic` (`uCausticPhase`,
`uCausticStrength`, `uCausticScale`, `uCausticColor`) is live and animated but
nothing reads it yet. The shark's subtle caustic dapple needs `shark3d`/
`engine3d` to bind those uniforms into its existing wet-specular injection —
that is a one-site change in the LIGHT/SKIN lane's file, not this one.

All content writes were atomic (temp + `os.replace`), applied as patches to a
**fresh read of the file from disk** immediately beforehand. Other lanes'
hunks verified after every write: `resolveSchoolOverlaps` 2 (still between the
entity loop and `runSpawner` — 11356 and 11366), `pickEatablePrey` 2,
`playerEatCeiling` 2, `haveEdible` 3, `Rev 15 WATER` 23.

## Two process notes worth keeping

**A concurrent writer to `world3d.js` was observed during this pass** — the
file's md5 changed while a screenshot probe was mid-run, and one browser load
came back `Unexpected token '}'` from reading a half-written file while
`node --check` on the same path passed. That is the hazard the
merge-discipline alert describes, seen live.

**I caused one clobber myself and it is worth writing down.** Early debugging
used `cp` from saved snapshots to bisect which builder was moving a gate.
Restoring a snapshot silently reverted several already-applied patches (the
glow collapse, the dapple removal, the caustic wiring, rock band counts), each
of which had to be found by grep and re-applied — and one such swap, run to
compare against the git baseline, briefly overwrote the file while the FISH2
lane's `resolveSchoolOverlaps` hunk was in it. It was restored from a snapshot
taken seconds earlier that contained *both* lanes' work, and verified by
marker count and call-site position. **Never swap whole files on a
multi-lane file, not even to run a comparison.** Bisect by patching a copy at
a different path instead.

## Flaky gates

Three `world` gates fail intermittently, on the baseline as well as with this
pass in, varying run to run: `formation: mean nearest-neighbor distance`,
`formation: aspect ratio`, and `resolveBody push-out invariant` (another lane
has since added a "tolerance 2" to the last of these, which corroborates it).
The gates this pass actually owns — the environment draw gate and all twelve
per-level triangle budgets — pass deterministically. `game` is 394/0.
