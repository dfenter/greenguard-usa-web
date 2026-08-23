# Razorfin Pantheon art review

## Verdict

**REWORK — do not ship the Pantheon / Underworld art as a 24-shark set.**

I inspected all 24 `shotsP/shark_*.png` captures individually, then compared
the lineup as a contact sheet at the supplied gameplay camera. The established
Rev 7 body bar is mostly intact: these stills show the inherited continuous
animal body, the forked/crescent caudal outline, saturated ramp treatment, and
readable eyes. The new semantic bar is not intact. Only Poseidonrex, Hera
Crown, Typhonmaw, and Cyclops Eye clear all five review columns. Most of the
other entries are a generic base shark with a small ring, stripe, decal, or
ability-colored ornament that disappears at normal glance distance.

The HSE fantasy reference bar is the correct comparison: a player should see a
large identity silhouette first and inspect the surface detail second. Ability
FX, the lower-right ability label, and the file/name are not evidence of
identity.

## Per-shark pass/fail table

`P` = pass at gameplay glance distance. `F` = fail. `Rev 7` is the static
still-frame check; see the note below the table about motion evidence.

| Shark | Named identity | One coherent animal | God / demon act language | Pairwise distinct in act | Rev 7 static laws | Disposition / gameplay read |
|---|---:|---:|---:|---:|---:|---|
| `zeusfin` | F | P | P | F | P* | **REWORK** — gold point shark; the storm-bolt cue is too small/occluded, and it crowds Apollo/Hephaestus. |
| `poseidonrex` | P | P | P | P | P* | **SHIP** — whale mass plus three dorsal trident tines are legible. |
| `hadesmaw` | F | P | F | F | P* | **REWORK** — dark purple generic shark; crown/gill identity collapses into the flank and reads closer to Underworld than radiant Pantheon. |
| `apollodon` | P | P | P | F | P* | **REWORK** — the sun halo reads, but the gold palette and point body duplicate Zeus/Hephaestus. |
| `artemisstrike` | F | F | P | F | P* | **REWORK** — the “crescent” is a small full ring/target on the body, not a moon-shaped silhouette. |
| `athenajaw` | F | P | P | F | P* | **REWORK** — armored jaw is readable; Athena’s three-point helm is not. Too close to Hephaestus. |
| `aresrender` | F | P | P | P | P* | **REWORK** — red war shark is clear, but the scar plate/three stripes do not make an immediate Ares read. |
| `hermesdart` | P | P | P | F | P* | **REWORK** — winged pectoral cue reads Hermes, but the blue dart silhouette crowds Artemis. |
| `hephaestusforge` | F | P | P | F | P* | **REWORK** — gold armored shark; magma seams/rivets are too weak to read forge or Hephaestus. |
| `dionysustide` | F | P | P | F | P* | **REWORK** — magenta hoops read as generic bands/attached rings, not vine or Dionysus. |
| `aphroditelure` | F | P | P | F | P* | **REWORK** — pink shark with tiny pearl dots; the cue is below identity size and duplicates Dionysus. |
| `heracrown` | P | P | P | P | P* | **SHIP** — oversized kaiju mass and crown ridge survive the shot. |
| `typhonmaw` | P | P | P | P | P* | **SHIP** — dense storm-spike silhouette, huge eye, and maw establish the demon monster immediately. |
| `hydrafang` | F | P | P | F | P* | **REWORK** — green eel shark; the extra heads are not visible, and it duplicates Lamia/Medusa color language. |
| `cerberusjaw` | F | P | P | F | P* | **REWORK** — one orange jaw; triple collar rings and the Cerberus cue disappear. Too close to Chimera/Minotaur. |
| `chimerashark` | F | P | P | F | P* | **REWORK** — two-tone surface split is not a chimera silhouette; it reads as a generic orange shark. |
| `medusagaze` | F | P | P | F | P* | **REWORK** — giant eye/FX are visible, but the snake crown is not; the result is a green generic shark. |
| `scyllarender` | F | P | P | F | P* | **REWORK** — six underside cones collapse to small spikes; no Scylla/tentacle read. Crowds Harpy/Kampe. |
| `charybdisvoid` | F | P | P | P | P* | **REWORK** — whale/maw reads, but the three vortex-mouth rings do not. The silhouette is distinct but the name is not. |
| `minotaurram` | F | P | P | F | P* | **REWORK** — brown armored shark; horns and nose ring are not legible. Crowds Cerberus/Chimera/Cyclops. |
| `cyclopseye` | P | P | P | P | P* | **SHIP** — one oversized central eye is an immediate, stable identity cue. |
| `harpyshade` | F | P | P | F | P* | **REWORK** — wing blades collapse to ordinary pectoral spikes; reads as a purple point shark. |
| `lamiacoil` | F | P | P | F | P* | **REWORK** — coil bands read as three tail stripes, not a serpent tail; duplicates Hydra. |
| `kampechrono` | F | F | P | F | P* | **REWORK** — floating clock rings/glyph are small accessories, while the skull/monster identity is absent. |

`P*` means the supplied stills preserve the Rev 7 crescent-tail, eye, and
saturated-ramp bar. The five-state motion gate from the Round 3 precedent was
not independently recaptured in this still lineup, so I am not using motion as
a new blocker; the Pantheon rigs use the established bend path. The supplied
stills do not, however, earn identity credit from the motion or self-test
claims.

## Numbered blockers

### 1. Identity features pass the proud-depth audit but fail the screen-space audit

**What the eye sees:** The feature records say “reads,” but most defining cues
are either a few pixels, hidden behind the body/eye, or only apparent when the
viewer already knows the name. Hydra, Cerberus, Medusa, Scylla, Minotaur,
Harpy, Lamia, Charybdis, and Kampe are the clearest failures. The same issue is
visible in Zeus, Athena, Hephaestus, Dionysus, and Aphrodite on the god side.

**Root cause:** `identityFeature()` in `shark3d.js:1252-1264` audits only a
model-space proud offset and value delta. `addPantheonFeatures()` at
`shark3d.js:1761-1965` then builds most identity from thin extruded polygons,
rings, and bars. A `.03-.08L` z offset proves that a feature is not
sub-surface; it does not prove that the feature has enough projected area or a
recognizable contour. Several cues are also placed in the same visual zone as
the shared Act 3 eye ring/brow treatment (`shark3d.js:1323-1357`), so the
player sees another circular face ornament instead of a mythological mark.

**Numeric prescription:**

- Give every row one primary identity cue with a projected footprint of at
  least `18 CSS px × 10 CSS px` at the `844×390` review viewport, and at least
  `2%` of the visible shark pixel area. The named hero cue should occupy
  `0.18-0.30` of head height or `0.12-0.22L` of silhouette span.
- A monster cue must protrude beyond the base hull by at least `0.12L` and
  remain separated from the eye/brow by `>=0.10L`; a surface decal alone is
  not a primary cue.
- At a `64×30` silhouette thumbnail with UI and FX removed, the player must
  identify the row’s defining word (trident, crown, single eye, horns, wings,
  tentacles, or vortex) without reading the roster name.

### 2. The demon roster uses surface marks where the HSE bar requires monster silhouettes

**What the eye sees:** Typhon and Cyclops work because their head/crest/eye
shapes survive as large contours. The other demons mostly remain one standard
eel, point, croc, or whale shark with a tiny surface treatment. “Extra heads,”
“snake tendrils,” “horns,” and “wing blades” are not present in the small
silhouette where the HSE fantasy rows establish identity.

**Root cause:** The authored descriptors are too inward and too flat for the
camera. Hydra’s extra heads (`shark3d.js:1890-1899`) are side silhouettes at
`y≈.68r`; Cerberus’s primary cues are collar rings (`1900-1908`); Scylla’s
tentacles are a low underside skirt (`1923-1929`); and Lamia’s rings are
wrapped around the far tail (`1953-1958`). The implementation is technically
proud of the local surface, but the camera-facing projected outline is still a
generic shark.

**Numeric prescription:**

- Hydra: expose `2-3` secondary head silhouettes around the front third, each
  `0.20-0.28L` long and `0.22-0.32` head-heights tall, with `>=0.04L` gaps.
- Cerberus: replace the collar-only cue with three separated jaw/head lobes;
  each lobe must be `>=0.18L` wide and extend `>=0.10L` beyond the central
  head contour.
- Medusa: use `3-5` serpentine crown tendrils extending `0.20-0.32` head
  heights above the skull, plus an eye of `0.22-0.28` head height. The eye
  may support the read; it cannot be the only cue.
- Scylla/Harpy: move the six tentacles or paired feather wings into the
  camera-facing silhouette with a total span of `0.35-0.50L`; each major
  appendage must be at least `12 CSS px` at review scale.
- Minotaur: horns must span `0.22-0.34L`, extend `>=0.12L` beyond the head,
  and have clearly separated tips. A nose ring is secondary only.
- Chimera/Kampe: add a second animal/monster contour or skull/armor mass at
  `>=0.18L` scale. A two-tone split or clock glyph by itself is not enough.
- Lamia/Charybdis: replace tail stripes or hidden rings with a visible
  serpentine coil or a mouth vortex. The primary loop/opening should be
  `0.55-0.75` head height and remain open in a neutral still.

### 3. The gods collapse into a gold/radiant palette cluster, while some gods read Underworld

**What the eye sees:** Zeus, Apollo, Athena, Hephaestus, and Hera all occupy
the same warm gold family; Artemis and Hermes are both blue point sharks; and
Hades is dark violet enough to look like an Act 5 creature. The radiant/infernal
split is present as a broad color intention, but not as a reliable act language
or same-act roster separation.

**Root cause:** The identity pass centralizes the feature treatment in
`identityMarkColor()` and the shared gold/red materials (`shark3d.js:1229-1245`
and `1775-1782`). Those materials make every feature bright, but brightness is
not semantic separation. The underlying body shapes still reuse the same
point/whale/hammer/mech lofts, and thin identity geometry cannot compensate
for the palette collisions.

**Numeric prescription:**

- For same-act peers, require either perceptual hue separation of `>=0.08` in
  normalized HSV hue plus `>=0.12` value separation, or a silhouette cue that
  occupies `>=8%` of the visible hull. Zeus/Apollo/Hephaestus and
  Artemis/Hermes currently satisfy neither.
- Keep Pantheon flank values in the existing radiant range, but assign each
  god a distinct dominant family: electric cyan, sea blue, void violet with
  radiant edge, solar gold, moon silver, ivory/bronze, war red, azure/yellow,
  forge orange/iron, vine magenta, pearl rose, and ivory/crown gold.
- Keep Underworld bases dark (`V<=0.48`) but give each demon a distinct
  infernal accent (`S>=0.80`, `V>=0.68`) and a visible monster cue. Hydra and
  Lamia cannot share the same green eel recipe; Cerberus, Chimera, and
  Minotaur cannot share the same warm armored recipe.
- Acceptance is a small-thumbnail comparison of all 12 rows in each act:
  no pair may be mistaken for the same base shark after UI, FX, and name text
  are removed.

### 4. Rings, bands, and flat plates read as attached props instead of anatomy

**What the eye sees:** Artemis, Dionysus, Kampe, and several of the vortex/
pearl/collar rows present literal loops or flat plates laid over a shark. The
feature may be technically welded into one draw batch, but the viewer still
sees a prop pasted onto the body. This also weakens the “one coherent animal”
law whenever the feature is large enough to be noticed.

**Root cause:** `identityRing()` and `identityPolygon()` (`shark3d.js:1267-1282`)
produce shallow 2D forms with fixed extrusion depths such as `.025-.045L`.
`identityFeature()` supplies a z offset, but does not require a body overlap,
an anatomical root, or an outline transition. The proud-placement audit is
therefore necessary but insufficient for the visual contract.

**Numeric prescription:**

- A surface mark may be no more than `0.06L` proud unless it is a volumetric
  anatomical feature; every larger feature needs a visible root overlap of
  `>=0.08L` into the body hull.
- Do not use a complete ring as the main cue unless it is a mouth opening,
  eye socket, or body aperture. Convert Artemis to a true crescent with a
  `0.30-0.45` head-height cutout; convert Dionysus/Kampe bands into fused
  vines/armor with taper and a body contact area of `>=60%`.
- No detached feature may have a screen-space gap from the body larger than
  `2 CSS px`; no flat plate may have a uniform unbroken silhouette longer than
  `0.30L` without a root transition.
- Acceptance: at gameplay scale the feature must read as a body part, growth,
  or opening before it reads as a ring, sticker, or accessory.

### 5. Pairwise distinctness is not cleared by draw-count or metadata gates

**What the eye sees:** The notes’ six-draw and triangle results are valid
technical facts, but they do not separate the roster. Identity records and
the `reads` capture labels are not substitutes for a neutral visual pair test.

**Root cause:** The roster continues to reuse the same head archetypes,
generic dorsal/pectoral treatment, and Rev 7 tail. The distinctness score in
`shark3d.js:3008-3026` gives identity only `0.08` of the final score, while
the actual identity geometry is often below gameplay read size. The result is
that a technical distinctness gate can pass while Artemis/Hermes,
Zeus/Apollo/Hephaestus, Hydra/Lamia, Cerberus/Chimera/Minotaur, and
Scylla/Harpy/Kampe still collapse visually.

**Numeric prescription:**

- Re-review every same-act pair as a `64×30` thumbnail and as a neutral
  `844×390` still. A pair passes only when at least two of these three axes
  differ: primary silhouette area `>=8%` of hull, head/face cue `>=0.22`
  head height, or palette separation `>=0.08` hue / `>=0.12` value.
- Require each identity cue to remain legible for `>=3` consecutive neutral
  frames in a 60 FPS capture; an ability burst or particle cloud cannot be the
  only frame in which the cue is discoverable.
- Preserve Poseidonrex, Hera Crown, Typhonmaw, and Cyclops Eye as the current
  identity anchors; bring the remaining rows up to that bar instead of adding
  more small props.

## Settled Rev 7 items

The following are not the reason for this REWORK verdict:

- The inherited body/tail path shows a continuous welded animal rather than
  separate appendage meshes.
- The caudal outline has the settled two-lobe fork and visible center notch in
  the supplied stills; it is not the Round 2 convex-paddle failure.
- The eye and body ramp are saturated and large enough to survive this camera
  better than the prior Rev 7 pass.

The correction target is semantic identity, silhouette hierarchy, and
pairwise separation. Increasing triangle counts or adding more emissive FX is
not the correction.

## Round 2 verdict

**REWORK — do not ship the 24-shark set yet.**

The technical claims reproduce: `art3d` passes (`pass=true ok=7 fail=0`), the
raw and normalized thumbnail audits each process 24 rows, and the exact-ID
lineup harness produced 24 `1688x780` captures using only the valid Pantheon
IDs. Those gates do not clear the visual identity bar. At gameplay glance
distance, 16 rows now clear the round-1 acceptance criteria and the four
round-1 anchors remain unregressed. Eight rows still fail named-contour or
pairwise-read acceptance.

Hydra is the orchestrator's flagged blocker: its three secondary heads are
visible as three yellow, forward-floating chips with clear air gaps ahead of
the snout. They do not read as attached head silhouettes, so this is both an
identity failure and a blocker-4 coherent-animal/prop violation.

`P` = pass and `F` = fail at the supplied gameplay camera. `Rev 7` covers the
inherited body, forked tail, eye, and saturated ramp laws; it remains green
across the lineup.

| Shark | Named identity | One coherent animal | God / demon act language | Pairwise distinct in act | Rev 7 static laws | Round 2 read |
|---|---:|---:|---:|---:|---:|---|
| `zeusfin` | P | P | P | P | P | **SHIP** — the enlarged lightning contour survives the shot. |
| `poseidonrex` | P | P | P | P | P | **SHIP** — whale mass and trident tines remain immediate. |
| `hadesmaw` | F | P | F | F | P | **REWORK** — the crown is lost behind the face ring/FX; it reads as a dark generic Underworld shark. |
| `apollodon` | P | P | P | P | P | **SHIP** — the solar burst is now a readable head contour. |
| `artemisstrike` | F | P | P | F | P | **REWORK** — no crescent survives; the row is a purple point shark with a face ring. |
| `athenajaw` | P | P | P | P | P | **SHIP** — the broad three-point helm reads as armor, distinct from the other gold rows. |
| `aresrender` | P | P | P | P | P | **SHIP** — the rooted war crest/shield gives the red row a stable read. |
| `hermesdart` | P | P | P | P | P | **SHIP** — paired wing blades are visible as a fused wing silhouette. |
| `hephaestusforge` | P | P | P | P | P | **SHIP** — furnace plate and molten seam survive gameplay scale. |
| `dionysustide` | P | P | P | P | P | **SHIP** — the continuous zig-zag vine wraps read before they read as bands. |
| `aphroditelure` | P | P | P | P | P | **SHIP** — shell petal and pearl heart are large enough to separate the pink row. |
| `heracrown` | P | P | P | P | P | **SHIP** — crown mass remains an anchor. |
| `typhonmaw` | P | P | P | P | P | **SHIP** — storm crest and maw remain an anchor. |
| `hydrafang` | F | F | P | F | P | **REWORK** — detached forward chips, not three rooted heads; also collapses to an eel shark in the thumbnail. |
| `cerberusjaw` | F | P | P | F | P | **REWORK** — the orange front is a serrated snout, not three separated jaw/head lobes. |
| `chimerashark` | F | P | P | F | P | **REWORK** — the light/dark split reads as armor and lower hull, not lion plus serpent contours. |
| `medusagaze` | P | P | P | P | P | **SHIP** — the crown tendrils and eye survive the gameplay shot. |
| `scyllarender` | P | P | P | P | P | **SHIP** — the six camera-facing tentacles form a clear fringe. |
| `charybdisvoid` | P | P | P | P | P | **SHIP** — the open vortex mouth is a coherent aperture and remains distinct. |
| `minotaurram` | F | P | P | F | P | **REWORK** — horn masses merge into the face/fin; no separated bull tips survive. |
| `cyclopseye` | P | P | P | P | P | **SHIP** — the single eye remains an anchor. |
| `harpyshade` | P | P | P | P | P | **SHIP** — paired wing blades read as a large rooted silhouette. |
| `lamiacoil` | F | P | P | F | P | **REWORK** — the tail still presents long bands, not an open serpent coil. |
| `kampechrono` | F | P | P | F | P | **REWORK** — the skull/spiral is below reliable glance size; the row is a generic cyan point shark. |

### Remaining failing rows — narrow prescriptions

- `hadesmaw`: move the void crown above the head as a high-contrast three-prong contour, separated from the eye ring; do not rely on another face ornament.
- `artemisstrike`: make the moon an unmistakable open crescent in the camera-facing silhouette, with the cutout visible in a neutral frame.
- `hydrafang`: replace the forward chips with three overlapping, body-rooted neck/head lobes around the front third; every lobe must share a visible root and have no gameplay-scale air gap.
- `cerberusjaw`: redraw the three jaw lobes with visible inter-lobe notches and separate outer contours; the current points merge into one serrated snout.
- `chimerashark`: give the lion and serpent two opposing contour masses with a readable mane/head and lower serpent profile; recolor alone is insufficient.
- `minotaurram`: pull two horn arcs above and beyond the head with separated tips and a visible root on each side; the current shapes merge into the face.
- `lamiacoil`: turn the tail bands into one or more open loops with a negative-space opening that remains visible in the neutral thumbnail.
- `kampechrono`: enlarge the skull silhouette and anchor the chrono spiral into it so skull/spiral, not the base point hull, is the first read.

## Round 3 verdict

**SHIP.**

All eight Round 2 failing rows now clear their narrow prescriptions at gameplay
glance distance, including the UI/FX-free silhouette thumbs:

| Shark | Round 3 read |
|---|---|
| `hadesmaw` | The high-contrast three-prong crown is a head-rooted contour and remains separate from the eye ring. |
| `artemisstrike` | The camera-facing crescent has a stable, unmistakable open cutout. |
| `hydrafang` | Three staggered head lobes overlap the front hull as one rooted silhouette; no gameplay-scale air gap is visible. |
| `cerberusjaw` | Three vertically separated jaw lobes retain distinct outer edges and inter-lobe notches. |
| `chimerashark` | The upper mane mass and lower serpent profile read as opposing contour forms rather than a color split. |
| `minotaurram` | Two open horn arcs have separated tips and visible roots above the head. |
| `lamiacoil` | The tail carries open loops with surviving negative space instead of closed bands. |
| `kampechrono` | The enlarged skull silhouette and anchored spiral are the first read, ahead of the base hull. |

The four untouched controls are non-regressed: Zeus’s bolt, Medusa’s tendrils
and eye, Scylla’s tentacle fringe, and Hera’s crown remain legible at the same
gameplay glance distance. No remaining narrow defect is visible in the scoped
rows.
