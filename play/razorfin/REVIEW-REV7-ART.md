# Razorfin Rev 7 adversarial art review

## Verdict

**REWORK — do not ship the Rev 7 shark art.**

The welded-body contract is a technical pass: the notes describe one indexed
body geometry with shared tail/fin roots, and `shark3d.js` does implement that
at `makeSpineGeometry()` and `buildShark()`. The screenshots are still a visual
fail at the live gameplay camera. The weld removed literal seams, but the
near-black tail, timid front mass, hidden features, and low-contrast palettes
make the result read as a paper dart assembled from dark attachments instead of
a chunky cartoon shark.

The reference bar requires all of these at gameplay distance: one continuous
animal, a recognizable shark outline with a crescent tail, exaggerated head/
eye/jaw, saturated hard color blocks, and an immediate species read.

## Shot-by-shot audit

Legend: `✓` passes, `△` partial, `✗` fails. “Distinctness” means distinct from
the other roster entries, not merely different from the background.

| Shot | One animal | Shark silhouette | Cartoon exaggeration | Bold color blocks | Species distinctness | Gameplay read |
|---|---:|---:|---:|---:|---:|---:|
| reef | △ | △ | ✗ | ✗ | △ | ✗ |
| tiger | △ | △ | ✗ | ✗ | ✗ | ✗ |
| hammerhead | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| whale | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| greatwhite | △ | △ | ✗ | ✗ | ✗ | ✗ |
| leviathanrex | △ | ✗ | △ | ✗ | ✓* | △ |
| voidmaw | ✗ | △ | ✗ | ✗ | ✗ | ✗ |
| mechjaw | ✗ | △ | ✗ | ✗ | ✗ | ✗ |

\*Leviathan is distinct as a monster, but not as a shark. Its crown, black
jaw, and black tail make it read closer to a spiked reptile/kaiju than the
reference shark roster.

Specific reads:

- **Reef:** The body is a narrow silver-blue dart. The huge dark tail fan is
  visually disconnected, the eye is a pale bump, and the mouth is not a grin.
  It is an acceptable baseline silhouette only when the viewer already knows
  it is a shark.
- **Tiger:** The olive body and dark bars are too close in value. The stripes
  do not survive the camera, so this is almost the same animal as Reef with a
  slightly thicker nose.
- **Hammerhead:** The T-bar is not legible; the front still ends in a pointed
  snout. This directly matches the known limitation recorded in
  `NOTES-rev6-laneA.md:453-464`.
- **Whale:** There is no broad whale head or hangar-door mouth at this scale.
  Baleen and spots are not carrying the identity; the result is another long
  generic shark.
- **Great White:** Teeth and gill slits provide small detail, but the dominant
  read is the same gray body/black tail recipe. It is not chunky enough to be
  the apex reference shape.
- **Leviathan Rex:** It has the strongest mass and the only immediately
  obvious non-generic silhouette, but the dark lower slab, spike crown, and
  tail overwhelm the shark cues. Saturation is still swamp-green rather than
  the acid/cyan HSE-style block treatment.
- **Voidmaw:** The void ring/eye identity is effectively absent. It collapses
  to the same generic gray shark as Reef/Great White.
- **Mechjaw:** The mechanical panels and thruster identity are not visible at
  the camera. It is another gray shark with the same tail and dorsal.

## Numbered art blockers

### 1. The body, tail, fins, and outline do not share one color language

- **What the eye sees:** A gray-silver body interrupted by a contiguous
  near-black tail and dark appendages. The tail looks glued on even though its
  vertices are welded.
- **Reference property violated:** HSE sharks use one bold, continuous body
  palette. The caudal fin is part of the animal, not a black silhouette mass
  beside a different-colored torso.
- **Root cause:** `OUTLINE_SHELL_COLOR` is the universal near-black
  `0x0a1a24` at `shark3d.js:59-60`; every body receives a `1.022` BackSide shell
  at `shark3d.js:1768-1773`. The tail is only `bodyLen * 0.045` deep at
  `shark3d.js:683-705`, so the shell can dominate its camera-facing pixels.
  The body ramp commits the accent only to saturation `0.58` and value
  `0.52-0.72` at `shark3d.js:378-405`, while separate fin/head features still
  consume raw `palette.accent` at `shark3d.js:1244-1246` and `1371-1374`.
  Current authored rows are visibly low-saturation: Reef base/accent are HSV
  approximately `(S .22/.33)`, Tiger `.17/.23`, Hammer `.16/.24`, and Great
  White `.17/.23` (`data.js:6`, `11`, `14`, `17`; Leviathan is only `.25/.32`
  at `data.js:66`).
- **Prescription:** Establish one resolved art ramp before any feature uses a
  color. At the gameplay-facing flank target `S=0.70-0.90, V=0.55-0.82`;
  accent/tail/fin blocks `S=0.80-1.00, V=0.65-0.95`; belly `S=0.15-0.40,
  V=0.80-0.98`; outline `V=0.08-0.16`. No direct raw `palette.accent` may
  drive a visible feature. Reduce the outline shell to `1.008-1.012` and
  keep it as a 1-2 pixel contour, not a filled tail surface.
- **Acceptance:** At the live camera, at least `65%` of the visible tail/fin
  area must be the same saturated accent family as the body ramp; the outline
  may occupy no more than `10%` of the tail silhouette. Reef, Tiger, Hammer,
  and Great White must each have a visibly different body hue and a visible
  accent block without relying on emissive FX.

### 2. The caudal fin is a blocky fan, not a crescent tail

- **What the eye sees:** A vertical rectangular black mass with a shallow V
  cut. The trailing edge is squared, the peduncle does not taper into two
  pointed lobes, and the tail has little visible thickness.
- **Reference property violated:** The reference sharks have a continuous
  crescent/forked tail with a narrow, readable peduncle and two expressive
  lobes.
- **Root cause:** `makeSpineGeometry()` calls the shape a crescent at
  `shark3d.js:683-705`, but every tail ring retains the lobe envelope. The
  `notch` factor is near `1` again at `t=1`, so the terminal ring is not
  tapered. Only eight rings are used (`692`), and `tailDepth=.045*bodyLen`
  (`689`) makes the surface read edge-on under the shell.
- **Prescription:** Keep total tail length at `0.28-0.36*bodyLen`, but author
  a real fork: upper lobe peak `0.20-0.26*bodyLen`, lower lobe peak
  `0.13-0.18*bodyLen`, lower/upper ratio `0.60-0.72`, and taper both lobe
  envelopes to `<=0.35` of peak over the final `20%` of tail length. The
  trailing center notch must be `0.35-0.50*bodyLen` deep. Use `10-12` tail
  stations, a rounded `0.08-0.12*bodyLen` tail depth, and a pointed/non-flat
  end cap. The body-to-peduncle transition must remain shared-index welded.
- **Acceptance:** In a side-camera capture the caudal outline must have two
  obvious lobes and a concave center notch before color or FX are considered.
  A frozen Reef frame should be identifiable as a shark from the tail alone,
  not as a black fan.

### 3. The head, eye, and jaw are still too timid for cartoon gameplay scale

- **What the eye sees:** Most sharks have a thin nose, a tiny pale eye, and a
  scratch-like mouth. The reference has a large eye and a broad, readable
  jaw/grin that occupy the front third.
- **Reference property violated:** The HSE faces are exaggerated enough to
  read at a glance; the head is chunky and the mouth is a character feature.
- **Root cause:** `exaggerationFor()` gives point/blunt/hammer head scales of
  only `1.30/1.45/1.35`, whale/kaiju only `1.15`, with a front span of `.30`
  at `shark3d.js:552-572`. Eye scales are only `.24-.30*radiusY` at
  `563-566`, then `addEyeFeatures()` sets `eyeRadius=radiusY*eyeScale` and
  `eyeZ=.91*radiusZ` at `1062-1107`. The 204-triangle eye budget proves
  geometry exists; it does not make the projected eye large or proud. The
  mouth line remains a narrow polygon at `1142-1155`, and the tier-1 wedge at
  `1163-1179` is a dark patch rather than a cartoon jaw.
- **Prescription:** Target a projected near-eye diameter of `0.30-0.38` of
  projected head height and at least `10 CSS px` at the 844px-wide gameplay
  baseline. This means eye radius around `.38-.46*radiusY` for point/blunt/
  hammer, `.34-.42` for whale, and `.42-.50` for kaiju. Put the near eye at
  `z >= 1.03` times the local body surface, with an iris diameter
  `.45-.55` of the eye and `S>=.75, V>=.65`; preserve a white catchlight.
  Increase the front span to `.36-.45*bodyLen`; target head scales are
  point `1.45-1.55`, blunt `1.55-1.70`, hammer `1.55-1.65`, whale
  `1.35-1.50`, kaiju `1.45-1.65`. Make the visible mouth/grin
  `.38-.58*bodyLen` wide, `0.28-0.40` of head height, with a colored lower
  jaw rim and a dark cavity inside it.
- **Acceptance:** In every gameplay capture the near eye, mouth corner, and
  lower-jaw contour must be readable without zooming or a bite animation.

### 4. Hammerhead, whale, and tiger do not have a species silhouette at a glance

- **What the eye sees:** Hammerhead has no hammer; Whale has no wide feeding
  head; Tiger has no readable stripes. They are all variants of the same
  point/blunt dart.
- **Reference property violated:** HSE roster entries are distinguished by a
  single large silhouette cue before surface detail is inspected.
- **Root cause:** The hammer foil is a box whose long axis is Z,
  `BoxGeometry(L*.12, r*.18, r*3.25)`, at `shark3d.js:1257-1264`. The live
  camera is on +Z with a small yaw/tilt, so the foil is foreshortened into a
  thin front bar. `faceIdentity('hammer')` still uses a mostly generic contour
  at `872-875`. Whale uses only a modest `headScale=1.15` (`554-555`) and
  relies on tiny baleen boxes at `1287-1303`. Tiger’s seven stripe bands are
  narrow accent marks at `patternColor()` `431-435`, but the accent itself is
  dark and low contrast.
- **Prescription:** Make the hammer foil’s **projected X span** `0.42-0.56*
  bodyLen`, with bar thickness `0.10-0.16*bodyLen` and a bridge overlap of at
  least `0.12*bodyLen` into the head. It must be authored toward the camera’s
  screen-horizontal axis, not only along Z. Whale’s front head should be
  `1.4-1.7x` the Great White head height, with a mouth opening
  `0.50-0.60*bodyLen`; place `6-10` spots on the visible flank at
  `0.06-0.10` head-height diameter and `delta-V >= .25`. Tiger stripes should
  be `0.045-0.060` body-length bands with accent `V>=.65` and a flank-to-mark
  value contrast of at least `.25`.
- **Acceptance:** Reduce each shot to a small silhouette thumbnail. Hammer
  must still be hammer-shaped, Whale must still be wide-mouthed, and Tiger
  must still be striped with no ability FX or UI context.

### 5. Void and mech identity features are occluded instead of being readable

- **What the eye sees:** Voidmaw and Mechjaw are generic gray sharks. The
  defining ring, eye, panels, and thrusters are missing at the live camera.
- **Reference property violated:** Special roster entries use large, high-
  contrast silhouette or surface identity; they do not fall back to the base
  shark when viewed in profile.
- **Root cause:** Void’s ring and eye are placed at `z=.72*rz` and `.85*rz`
  (`shark3d.js:1334-1337`), while Mech panels and thrusters are at `.78*rz`
  and `.85*rz` (`1317-1325`). Those positions sit inside or too close to the
  camera-facing body surface. The panel material also lerps two raw, dark
  palette swatches (`1318`), so even an exposed panel has little contrast.
  Whale’s baleen is similarly shallow at `.78*rz` (`1296-1300`).
- **Prescription:** Compute the local surface at each feature station and put
  camera-facing features `0.03-0.08*bodyLen` proud of it, never at a fixed
  sub-surface fraction of `radiusZ`. Void’s ring should be
  `0.75-0.95` head-height in diameter with a `0.06-0.09` head-height stroke;
  its eye should be `0.20-0.28` head-height and emissive/saturated. Mech
  panels should cover `8-15%` of visible body area, have a `V` separation of
  at least `.25` from the flank, and put each thruster at least `0.04*bodyLen`
  proud of the fin. Baleen bars must cross the visible mouth, not disappear
  into the body.
- **Acceptance:** Void, Mech, and Whale must each have one defining feature
  visible in a neutral still frame; emissive FX may enhance it but may not be
  required to discover it.

### 6. The weld passes, but the animation still needs an animal-motion gate

- **What the eye sees / risk:** The stills cannot prove animation, but the
  paper-thin caudal geometry and black shell give no confidence that the
  moving tail will read as living tissue rather than a flapping card.
- **Reference property violated:** The animal bends continuously through the
  trunk into a volumetric caudal fin; the body, eye, jaw, and fins do not look
  like independently moving pieces.
- **Root cause:** `bendableMaterial()` applies a shared displacement with one
  Z offset and fixed `0.35` Y coupling at `shark3d.js:330-349`. The tail
  envelope is phase-continuous, but still acts on the very thin tail section;
  `animate()` feeds `uTailAmp` from `tailSweep` at `1853-1903` without any
  cross-section or lobe deformation. This is seam-safe, not necessarily
  animal-like.
- **Prescription:** Keep shared indices and engine phase authority. After the
  silhouette recut, target mid-body bend amplitude `<=.06*bodyLen`, distal
  tail displacement `.12-.18*bodyLen` at sprint, and a smooth root-to-tip
  change over the last `.35*bodyLen`; preserve a rigid head/eye/jaw anchor.
  Capture idle, sprint, turn, lunge, and jaw-snap at `60fps` from the live
  camera. No visible tail-root crease, phase jump, or eye/jaw slide is allowed.

## Polish after the blockers

- Revisit the 8-13 retained feature batches called out in
  `NOTES-rev7-laneL1.md` only after their screen-space sizes and colors pass;
  draw-call reduction is not the reason these screenshots fail.
- Tune gill spacing, tooth rhythm, dorsal sweep, and low-poly facet scale once
  the head/tail/color hierarchy is working. Current gills and teeth are useful
  secondary detail but cannot substitute for a readable silhouette.
- Do not spend the next pass increasing triangle counts blindly. The Rev 7
  body ranges and 4200-triangle ceiling are acceptable; the missing result is
  authored proportion, screen-space contrast, and camera-facing feature
  placement.

This review changes no code and makes no claim that the Rev 7 self-tests are
invalid. It says the self-tests are measuring welding, budgets, and metadata;
the live screenshots fail the art contract those tests do not measure.

## Round 2 verdict

**REWORK — the palette and feature repairs are real, but the caudal silhouette
still fails the gameplay bar, and the required motion capture gate is not
cleared.**

Round-1 blocker status:

- **1 — RESOLVED for the gameplay read.** Reef, Tiger, Hammerhead, and Great
  White now show saturated continuous body/tail families; the tail is no
  longer a near-black shell mass.
- **2 — REMAINS.** The rendered tail is still a single convex paddle rather
  than a two-lobed crescent.
- **3 — RESOLVED.** The near eye, mouth cavity/corner, and lower jaw survive
  the gameplay camera; the cropped Reef frame is readable without relying on
  an ability effect.
- **4 — RESOLVED.** Tiger stripes, the Hammerhead T-bar, and Whale Shark's
  wide feeding mouth/baleen are visible at a glance. The valid special rows
  also retain distinct silhouettes.
- **5 — RESOLVED.** A valid probe of `vex` shows the large void ring and
  `wreckfang` shows the armored/mechanical panel mass. The prior invalid
  `voidmaw`/`mechjaw` rows are not used as evidence.
- **6 — NOT CLEARED.** The submitted evidence is still-only. The implementation
  has numeric bend limits, but no valid live-camera idle/sprint/turn/lunge/
  jaw-snap sequence was available to prove the animation acceptance criteria.

### Remaining blockers

1. **The caudal outline is still a blocky convex fan, not a crescent tail.**

   - **Gameplay evidence:** In Reef, Tiger, Hammerhead, and Great White, the
     trailing edge bows to one central outer point. There are no two obvious
     lobes separated by a concave center notch in a small silhouette thumbnail.
     The corrected winding fixed the black-surface failure, but it exposed the
     underlying shape failure rather than proving the tail contract.
   - **Root cause:** `makeSpineGeometry()` still derives the visible contour
     from the radial tail rings. Its `tailNotchAxial = 0.06 * bodyLen`
     center-retreat is too shallow in the projected side profile, while the
     existing `rfTailNotchDepthRatio = 0.38` measures the sum of lobe heights,
     not the rendered forward depth of the notch. The nominal metadata therefore
     says “crescent” while the live outline reads as a paddle.
   - **Numeric prescription:** Keep total tail length at `0.28-0.36 * bodyLen`,
     upper/lower lobe peaks at `0.20-0.26 / 0.13-0.18 * bodyLen`, and the
     lower/upper ratio at `0.60-0.72`, but make the projected trailing center
     notch `0.10-0.14 * bodyLen` forward of both lobe tips (at least `10 CSS
     px` at the `844x390` gameplay baseline). Keep the final-20% lobe taper
     `<=0.35`, tail depth `0.08-0.12 * bodyLen`, and use a pointed cap.
   - **Acceptance:** With UI and FX ignored, a frozen gameplay thumbnail must
     show two separated lobe tips and a concave center notch before color is
     considered; Reef must be identifiable as a shark from that tail alone.

2. **The animal-motion gate remains an evidence blocker.**

   - **Root cause:** Round 2 supplies only still frames. The manual multi-state
     probe entered the portrait-rotation guard after the first state, so it is
     not valid proof of the live-camera motion contract. Self-tests and shader
     metadata can prove shared uniforms and bounds, but cannot prove that the
     rendered tail has no root crease/phase jump or that the eye/jaw stay rigid
     during motion.
   - **Numeric prescription:** Capture idle, sprint, turn, lunge, and jaw-snap
     at `60 FPS` from the same `844x390` CSS-pixel live camera with no rotation
     guard. Confirm mid-body bend `<=0.06 * bodyLen`, distal tail displacement
     `0.12-0.18 * bodyLen`, and a smooth root-to-tip transition over
     `0.30-0.35 * bodyLen`; no tail-root crease, phase jump, or eye/jaw slide
     may appear in any state.
   - **Acceptance:** The five-state sequence is valid only when all five
     captures are in landscape gameplay and the continuous animal-motion read
     survives at normal glance distance.

## Round 3 verdict

**SHIP.**

Both Round 2 acceptance criteria are cleared at gameplay glance distance:

- **Crescent tail — PASS.** The color-agnostic `tail_region.png` crop shows
  two separated lobe tips and a concave center notch. The measured notch is
  `0.120L` / `11.36 CSS px` at gameplay scale, with `0.6522` lower/upper lobe
  ratio, `0.100L` tail depth, `0.30` final-20% taper, and a pointed cap.
- **Animal motion — PASS.** The valid landscape live-camera captures cover
  idle, sprint, turn, lunge, and jaw-snap. Across them the tail remains
  continuous through the root without a visible crease or phase jump, while
  the eye and jaw stay anchored. The motion audit records `0.1719L` distal
  sprint displacement and `0.0141L` mid-body displacement, both within the
  Round 2 limits.

This verdict covers only the two Round 2 blockers; the other settled blockers
are not reopened.
