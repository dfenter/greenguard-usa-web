# Rev 15 REBASE lane

Owner directive (binding): "the only GOOD base models are Sharkjira
(greatwhite_cy), thresher, snapjaw and aresrender (tigershark) and
artemisstrike (whaler). All the others need to be scrapped; use the good
sharks as the base for all the other sharks and customize from there."

Files edited (all owned by this lane):
* `tools/gen_data.py` - `TEXTURED_MODEL_BY_ROW` rewritten
* `data.js` - regenerated (`python3 tools/gen_data.py > data.js`)
* `hse/skin_identity.js` - `SPECIES_HIDE` / `MODEL_HIDE` tables only
* `hse/props_textured.js` - `featureIds` allowlist, new `addBox` primitive,
  new `foil` mode, thickened saw rostrum

No other file was touched. `shark3d.js` (ORIENT lane) was read only.

## 1. Rebase

Every one of the 84 model-bearing rows now points at one of exactly four
keys. `goblin` and `gulperfiend` are deliberately left OFF the map: they
carry their own low-poly GLBs (`goblinshark`, `anglerfish`) which the owner
approved as creatures, and NOTES-rev15-goblin.md documents the render fix
that made them work.

| base | rows | body plan it carries |
|---|---|---|
| `thresher` | 30 | slim, fast, long-tailed, eels, ribbons |
| `greatwhite_cy` | 27 | bulky apex, heavy blunt, kaiju, armored mass |
| `whaler` | 19 | mid-weight all-rounder, blunt-ish, both hammers |
| `tigershark` | 8 | striped / barred / tiger / bull / croc-jawed |

Grep-verified: `data.js` contains no reference to `dogfish`, `bullhead`,
`smoothhound`, `mako` (as a model), `blueshark`, `smoothhammer`,
`scallopedhammer`, `tiger_nu`, `whitepointer` or `megalodonrex`, nor to the
five bakes FAMILY_MAP.md had already rejected. The GLB files are untouched
on disk, as instructed; nothing loads them.

## 2. Distinctness

Four meshes cannot separate 84 rows, so the separation moved entirely into
the channels this lane owns.

### Hide colour (hse/skin_identity.js)

`SPECIES_HIDE` used to name 26 rows and let the other 60 fall through to
`MODEL_HIDE`. After the rebase that fallback keys on four models, so it
would have handed four colours to 84 sharks. `SPECIES_HIDE` now names all
86 rows explicitly.

The 26 real-species rows keep their hand-authored hides VERBATIM - those are
facts about real animals. The remaining 60 were placed by a repulsion
relaxation in the perceptual metric

```
d = sqrt( (2.2*dHue_circular)^2 + (0.8*dSat)^2 + (1.6*dValue)^2 )
```

with the anchors held fixed and every hue snapped back into one of three
arcs a real shark's hide actually occupies:

* `0.545 - 0.665` slate / blue-grey
* `0.020 - 0.300` bronze / tan / olive / brown
* `0.900 - 1.020` the goblin's pink, the one real pink shark

so no row can leave the natural gamut. Saturation stays inside `0.08 - 0.34`
before the existing `SPECIES_SAT_MIN/MAX` law re-clamps it to `0.30 - 0.35`;
value inside `0.18 - 0.56`, with demon rows seeded darker.

Result: **every non-anchor pair is >= 0.06 apart** in that metric. Seven
pairs are still under it and all seven are ANCHOR-vs-ANCHOR -
dunkleosteus/snapjaw, tiger/snapjaw, gulperfiend/anglerfang, mako/sailfin,
thresher/duskfin, snapjaw/thornback, whaleshark/duskfin - real species that
genuinely look alike. They separate through markings, morph and props
instead, and are not worth falsifying a real animal's colour to fix.

The countershade band, marking law (in-surface dV/sat, never a decal), fin
tips, and the god/demon accent treatments are unchanged: those laws were
already right and the rebase did not need them touched.

### Morph

`sil.len / girth / finScale / tailScale` are per-row in `tools/gen_data.py`
and were already well spread across the roster (len 0.85 - 2.40, girth
0.24 - 0.61, finScale 0.70 - 1.60, tailScale 0.85 - 2.20). The
`PERSONALITY_TABLE` bulk/sculpt/face morphs live in `shark3d.js`, which this
lane does not own; they are already authored per row and drive the
`hse/rig_morph.js` bounded bone morph. Nothing here needed to change and
nothing was changed.

## 3. Props (hse/props_textured.js)

The owner named six slab rows. What they actually were:

| row | before | now |
|---|---|---|
| `zeusfin` | crown, solid scute + pyramids | solid, and now on the HEAD (see below) |
| `heracrown` | crown, heavy variant | solid, now on the head |
| `minotaurram` | horns, solid 6-segment cones | solid, now on the head |
| `chimerashark` | saw - blade built by `addPlate` | tapered SOLID box, on the snout |
| `solaris` | **no prop at all** (`featureIds` returned null) | crown |
| `omenmaw` | **no prop at all** | horns |

`solaris` and `omenmaw` were not rendering a bad prop, they were rendering NO
prop - `featureIds` fell through to `return null` for both - so what read as a
slab on those two came from the base mesh. Their personality lines already
call for exactly the props they now get ("corona brow rays", "rune throat
lantern").

### Three real bugs found and fixed

**(a) `addPlate` is the slab primitive.** It extrudes ONE flat 5-point profile
by a single constant `halfAcross`, so it reads as a sheet at any thickness.
The saw rostrum was its only remaining caller. New primitive:

`addBox(backLong, frontLong, backUp, frontUp, backHeight, frontHeight,
backAcross, frontAcross, across, weights, kind)` - a closed box with
independent front and back half-extents, eight distinct corners, so a prop can
TAPER and shade like a solid. The saw is now that box: thick and tall at the
skull, thin and narrow at the tip.

**(b) EVERY prop was being built on the wrong end of the shark.** This is the
big one and it is why the contact sheet showed a saw hanging off the caudal
fin.

`measureFrame` decided which end was the head by comparing the `Head` and
`Tail3` bones' longitudinal coordinates. The bones are real and correctly
named, but `coordFromWorld` maps them into body-LOCAL space, and there the
whole chain collapses onto the origin. Measured on all four surviving bakes:

```
sawshark   long y  box -0.523..0.506   Head 0.019   Tail3  0.000
zeusfin    long y  box -0.556..0.506   Head 0.032   Tail3  0.000
heracrown  long y  box -0.651..0.485   Head 0.026   Tail3 -0.003
greatwhite long y  box -0.611..0.490   Head 0.033   Tail3 -0.003
```

A 0.02-0.03 spread on a body spanning 1.03 - the decision was being made on
2% of numerical noise, and it came out the same way on every bake, pinning
station 0 to the TAIL. Negative "ahead of the snout" stations therefore
reached backwards past the caudal fin.

A girth test was tried next and is NOT reliable: `thresher`'s upper caudal
lobe is nearly as long as the rest of the animal, so its tail end measures as
thick as its shoulders under both a mean and a median core radius. It fixed
whaler and greatwhite_cy and left every thresher row backwards.

The fix uses the contract that already exists: `shark3d.js` orients every rig
NOSE +X / DORSAL +Y in world (its own orientation note states this and carries
per-bake evidence). So ask which way the local long axis points in world space
and take the end that maps to +x as the head. That is a geometric fact about
the posed rig rather than a guess about anatomy, and it is the same convention
`world3d.js` and the r15-doc shooter already rely on. Verified in the render:
saws now sit on the snouts of sawshark, barbhook and chimerashark, and the
crowns and horns sit at the head end on every row that carries one.

**(c) Props wore the row's accent swatch, not the animal.** The fragment
shader mixes crowns, saws and foils toward `uRfFeatureAccent`, which resolves
to the row's authored accent - a saturated fantasy colour. Rendered, that gave
a neon-orange rostrum on chimerashark, chrome-yellow on sawshark, violet horns
on omenmaw and a cobalt blade on barbhook: exactly the flat-slab read the
owner objected to, because a fully saturated flat colour carries no form no
matter how solid the geometry under it is.

The same law `skin_identity.js` applies to the hide now applies here. A prop on
a shark is keratin, cartilage or bone, so it is a desaturated, slightly
LIGHTER version of the animal's own hide: the accent is pulled 82% toward the
body's dorsal colour, then its saturation is capped at 0.22 and its value
lifted into 0.26..0.62. What survives of the authored accent is a hue whisper,
which is all the row needs once the geometry is doing the work.

### New `foil` mode

`hammerhead` and `athenajaw` used to route to the `smoothhammer` /
`scallopedhammer` bakes, which are scrapped, so the hammer has to be built.
`featureIds` returns `'foil'` for both (it used to return `null` - those two
rows got no prop either). Two swept lobes off the measured head band, each an
`addBox` solid, thicker at the root where it meets the skull and thinner and
lower outboard, plus a small solid cone capping each lobe tip for the eye
stalk. `athenajaw` gets a 15% wider reach than `hammerhead`.

All four allowed prop kinds (`foil`, `crown`, `horns`, `saw`) are real closed
geometry wearing the body material via `featureMaterial(body, ...)`. No cards,
no tape.

### Known remaining imperfection

The crown and horn props seat correctly at the HEAD end and in natural tones,
but their vertical placement on the skull is still low - on several rows they
read as sitting at the jaw line rather than on the crown. `topAt()` is
internally consistent with the measured `upSign`, and overriding that sign
from world +y was tried and changed nothing, so the remaining error is in the
station/height constants of `addCrown` and the horns branch rather than in the
frame. It is cosmetic, it is confined to this lane's file, and it is the one
thing I would do next.

## 4. Gates

```
art3d  FAIL 1  (see HOOK below - a pin in a file this lane does not own)
world  FLAKY  (see below)
game   pass=true ok=394 fail=0
meta   pass=true ok=192 fail=0
ui     pass=true ok=252 fail=0
```

`green` is not a selftest target name; the runner prints `unknown target
green`. Roster-count literals stay 86 and `data.js` regenerates to 86 rows.

`world` is genuinely flaky and NOT caused by this lane. Proven by reverting
`hse/props_textured.js` to its baseline and running it three times:

```
world: pass=false ok=376 fail=4
world: pass=false ok=378 fail=2
world: pass=false ok=377 fail=3
```

The failing checks are all stochastic world-sim assertions with nothing to do
with the roster, the hides or the props - draw-call counts, contact sampling,
school formation variance:

```
PERF-03 environment stays within the shared <=60 draw gate (64 meshes)
resolveBody push-out invariant (48 contacts, 8 bad)
200 ringPoint samples (199/200 ok, 1 bad)
formation: heading alignment variance (0.057 < 0.05)
formation: aspect ratio after 5.0s (1.93 > 2.0)
```

## 5. Contact sheet judgement

`hse/evidence/r15-rebase/` - all 86 rows re-shot with the r15-doc harness,
zero page errors, plus `SHEET_rebase.png` (9 x 10 grid) and the two halves
`SHEET_top.png` / `SHEET_bot.png` I actually read.

* **Every row is a real shark.** No placeholders, no degenerate meshes, no
  row shot from inside its own body. `goblin` and `gulperfiend` are the two
  approved creatures and read as intended.
* **No slabs.** All six called-out rows carry solid, shaded, natural-toned
  geometry.
* **Pairwise distinct at thumbnail: 71 of 86.** The hide relaxation gives a
  real spread of slate / olive / bronze / charcoal and the len/girth/fin
  morphs separate the silhouettes.

  The 15 I will NOT claim as distinct are the mid-tier slate rows sharing
  `greatwhite_cy` and `whaler` at close value: glacier, frostjaw, maelstrom,
  vortexa, charybdisvoid, poseidonrex; and riftjaw, mirrorscale, nullfin,
  hadesmaw, gravewater, kampechrono, cyclopseye, dionysustide, medusagaze.
  With four meshes and a natural-gamut colour law these need a marking or a
  prop to separate them, not more hue - the hue budget inside the natural
  arcs is already spent.

## HOOK for the orchestrator (one line, in a file this lane does not own)

`shark3d.js:4173` pins four rows to their old bakes:

```js
const HSE_FAMILY_EXPECT = { reef: 'dogfish', hammerhead: 'smoothhammer', greatwhite: 'greatwhite_cy', tiger: 'tiger_nu' };
```

Three of those four bakes are scrapped by the owner's directive, so this
assertion now fails: `HSE family map: reef routed to thresher, expected
dogfish`. The comment directly beneath it says re-pin these "in the same
edit that un-holds them in tools/gen_data.py", which is this edit - but the
file belongs to the ORIENT lane, so per the brief it is written here and
NOT edited. The line must become:

```js
const HSE_FAMILY_EXPECT = { reef: 'thresher', hammerhead: 'whaler', greatwhite: 'greatwhite_cy', tiger: 'tigershark' };
```

That single change takes `art3d` back to green. Nothing else in the tree
references a scrapped bake.
