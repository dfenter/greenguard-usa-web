# Pantheon FIX lane — Luna xhigh

Date: 2026-08-23  
Owner: `play/razorfin/shark3d.js` art lane  
Scope: Pantheon Act 4/5 art only; authored `data.js` palettes remain untouched.

Final state: the 24-row Pantheon selftest passes, the full 24-row capture was
re-shot after the final code batch, and all normalized 64x30 thumbnails have a
readable primary contour cue without using the row name.

## Blocker implementation

1. Screen-space identity floor

`setIdentityPrimary()` projects every identity feature through the fixed
quarter-view yaw, resolves the known camera at the 844x390 CSS viewport, and
stores the projected bbox, area ratio, hero head-height/span ratios, overlap,
and monster floors on the rig. `assertPantheonIdentity()` gates every Pantheon
row at 18x10 CSS px and 0.02 projected area. The hero gate is 0.18-0.30 head
heights or 0.12-0.22L; Charybdis uses the review's special 0.55-0.75 head-height
open-mouth gate. Monster rows carry the local-hull 0.12L protrusion and 0.10L
eye/brow-separation floors.

2. Contour silhouettes

All late-roster identity features are extruded polygons/volumetric pieces,
rooted at the body surface and merged into the existing feature batch. The
Hydra heads are 0.24L long, 0.28 head-heights tall, with 0.04L gaps. Scylla's
six camera-facing blades are 0.35/0.385/0.42L reaches. Cerberus has three
separated jaw lobes, Medusa five crown tendrils, Chimera two animal contours,
Charybdis three open-mouth rings plus a rooted maw, Minotaur contour horns,
Harpy wing blades, Lamia open coils, and Kampe's rooted skull plus anchored
spiral. No generic floating ring remains in the Pantheon identity pass.

3. Palette separation

The code-side Rev 7 resolver assigns the requested twelve god families:
electric cyan, sea blue, void violet with radiant edge, solar gold, moon
silver, ivory/bronze, war red, azure/yellow, forge orange/iron, vine magenta,
pearl rose, and ivory/crown gold. Underworld bases resolve to V=0.34-0.44 and
their infernal accents to S=0.96, V=0.88-0.95. Hades remains a radiant-edged
void row. `assertPantheonPaletteDistinctness()` checks all 132 same-act pairs
for hue >=0.08 and value >=0.12, or the >=0.08 silhouette fallback.

4. Anatomy over props

Artemis is a filled crescent moon shape with a rooted arrow tip; Dionysus has
three continuous zig-zag vines wrapping from body roots plus a rooted leaf;
Kampe's chrono spiral is attached to the skull/body contour. These replace the
old decal/torus reads. Feature proud offsets remain within the existing
volumetric/rooted feature contract.

## Per-row change list

| Row | Final primary cue | Change |
|---|---|---|
| `zeusfin` | trident-lightning bolt | Large dorsal bolt contour plus rooted electric flank bar. |
| `poseidonrex` | trident | Retained the SHIP three-tine read; widened tines to 0.05L and kept 0.075L spacing for the measured floor. |
| `hadesmaw` | void crown | Replaced the small mark with a large void crown and radiant edge; the base remains dark but the edge stays Act 4-radiant. |
| `apollodon` | sunburst | Filled solar burst contour and a separate crown ray; no floating halo ring. |
| `artemisstrike` | crescent moon | True filled crescent contour and rooted moonlit arrow tip. |
| `athenajaw` | three-point helm | Three-point ivory helm contour with a bronze root band. |
| `aresrender` | war-blade crest | Narrow red blade crest plus rooted war shield. |
| `hermesdart` | paired wing blades | Two camera-facing wing blades fused through a central wing root. |
| `hephaestusforge` | forge furnace | Rooted orange/iron forge plate with a molten seam. |
| `dionysustide` | rooted vine wrap | Three continuous magenta vine wraps and a rooted leaf; removed the floating rings. |
| `aphroditelure` | pearl shell petal | Volumetric pearl-shell petal and rooted pearl heart. |
| `heracrown` | crown | Retained the SHIP three-point crown, added a rooted ivory band, and used the central point as the measured hero. |
| `typhonmaw` | storm-spike crest | Retained all 12 SHIP storm spikes and measured a single dominant spike as the cue. |
| `hydrafang` | three secondary heads | Three separate front-third head silhouettes, 0.24L each with 0.04L gaps, plus a rooted neck fork. |
| `cerberusjaw` | three-headed jaw | Three separated jaw/head lobes with a rooted ember crown; no collar-ring decal. |
| `chimerashark` | split lion-serpent | Two overlapping-body contour masses: an ivory lion mane and a distinct infernal serpent lower contour. |
| `medusagaze` | five-serpent crown | Five crown tendrils at 0.31 head-height scale plus a smaller anchored petrifying eye. |
| `scyllarender` | six tentacles | Six real camera-facing tentacle silhouettes with 0.35-0.42L reaches. |
| `charybdisvoid` | vortex mouth | Three concentric open-mouth rings, a dark rooted maw, and the 0.68 head-height opening. |
| `minotaurram` | separated bull horns | Two contour horns with separated tips and a rooted red muzzle. |
| `cyclopseye` | single eye | Retained the SHIP single-eye read; thickened the socket ring and added a filled rooted socket. |
| `harpyshade` | paired harpy wings | Two rooted magenta wing blades with contour-level vertical span. |
| `lamiacoil` | open serpent coil | Three rooted open coils and a fused tail root; Hydra/Lamia colors are intentionally different. |
| `kampechrono` | skull and anchored spiral | Volumetric skull mass plus a body-anchored chrono spiral glyph. |

## Final measured identity audit

`footprint` is the projected identity-feature bbox in CSS pixels at the known
camera. `area` is the conservative projected feature area ratio. `hero` is
`head-height-ratio/span-ratio`. `P/S` is the enforced local-hull monster
protrusion/separation pair. `tri` is the complete rig triangle count.

| Row | Cue | Footprint | Area | Hero H/L | P/S | Features | Draws | Tri |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| zeusfin | bolt | 69.2x27.2 | .035 | .287/.225 | — | 2 | 6 | 3726 |
| poseidonrex | trident | 39.2x15.2 | .021 | .222/.269 | — | 3 | 6 | 3866 |
| hadesmaw | void crown | 67.4x13.1 | .059 | .285/.449 | — | 2 | 6 | 3974 |
| apollodon | sunburst | 33.5x20.4 | .031 | .347/.148 | — | 2 | 6 | 3750 |
| artemisstrike | crescent | 41.1x23.8 | .040 | .433/.154 | — | 2 | 6 | 3774 |
| athenajaw | helm | 60.5x19.7 | .048 | .253/.394 | — | 2 | 6 | 3786 |
| aresrender | blade | 58.3x21.4 | .050 | .277/.257 | — | 2 | 6 | 3814 |
| hermesdart | wings | 51.1x35.1 | .029 | .349/.219 | — | 3 | 6 | 3730 |
| hephaestusforge | furnace | 46.7x15.7 | .048 | .254/.229 | — | 2 | 6 | 3866 |
| dionysustide | vine | 110.3x24.2 | .096 | .315/.193 | — | 4 | 6 | 3806 |
| aphroditelure | shell | 46.6x11.4 | .035 | .296/.348 | — | 2 | 6 | 3874 |
| heracrown | crown | 40.1x21.3 | .031 | .237/.134 | — | 4 | 6 | 4042 |
| typhonmaw | storm spikes | 89.3x28.5 | .088 | .186/.088 | — | 12 | 6 | 4102 |
| hydrafang | heads | 124.4x19.5 | .040 | .280/.248 | .140/.120 | 4 | 6 | 4010 |
| cerberusjaw | jaws | 56.5x33.5 | .096 | .208/.385 | .140/.110 | 4 | 6 | 3834 |
| chimerashark | split | 88.8x22.5 | .097 | .285/.586 | .130/.100 | 2 | 6 | 3914 |
| medusagaze | tendrils | 76.4x25.2 | .080 | .325/.129 | .130/.120 | 6 | 6 | 3918 |
| scyllarender | tentacles | 113.3x83.2 | .355 | 2.892/.127 | .140/.160 | 6 | 6 | 4058 |
| charybdisvoid | vortex | 53.2x44.9 | .051 | .647/.297 | .120/.100 | 4 | 6 | 3918 |
| minotaurram | horns | 62.5x51.6 | .041 | .283/.288 | .140/.120 | 3 | 6 | 3794 |
| cyclopseye | single eye | 28.5x29.7 | .021 | .399/.183 | — | 2 | 6 | 3482 |
| harpyshade | wings | 52.6x32.8 | .037 | .277/.330 | .140/.140 | 2 | 6 | 3722 |
| lamiacoil | coil | 95.7x20.4 | .050 | .227/.357 | .120/.160 | 4 | 6 | 4038 |
| kampechrono | skull | 81.4x14.4 | .059 | .288/.421 | .120/.100 | 2 | 6 | 3849 |

The minimum footprint components across the set are 28.5 px wide and 11.4 px
high; the smallest area ratio is .021. All 24 pass the 18x10/.02 floors. The monster
floor minima are exactly .12L protrusion and .10L separation. The Pantheon
triangle maximum is 4102 (`typhonmaw`); all Pantheon rigs stay below the 4200
gate and below the 4600 emergency cap. Every rig is at six visible draws.

The final art selftest reports:

```text
pass=true, errors=[]
pantheonPalette: checked=24, sameActComparisons=132,
  hueFloor=.08, valueFloor=.12, silhouetteFallback=.08
general distinctness: minimum=.052, closest=reef/mako
global worst triangle case: nullfin=4174
```

## Final 64x30 thumbnail audit

The mandated capture was run with all 24 IDs into `shotsF`. The Node wrapper
`thumb-audit.mjs` generated 24 raw 64x30 thumbnails in `shotsF-thumbs`.
`silhouette-thumb-audit.mjs` then used the fixed 2x-DPR central shark window
(`960x260` at `(360,280)` in the 1688x780 PNG) and generated 24 normalized
64x30 thumbnails in `shotsF-silhouette-thumbs`. The enlarged contact sheet was
visually checked after the final capture.

| Rows | Thumbnail cue read at 64x30 |
|---|---|
| zeusfin / poseidonrex / hadesmaw / apollodon | bolt, trident, void crown, and sunburst masses read as distinct top contours. |
| artemisstrike / athenajaw / aresrender / hermesdart | crescent, three-point helm, war blade, and paired wings read. |
| hephaestusforge / dionysustide / aphroditelure / heracrown | furnace plate, wrapping vine, shell petal, and crown read. |
| typhonmaw / hydrafang / cerberusjaw / chimerashark | storm crest, separated head peaks, three jaw lobes, and split animal masses read. |
| medusagaze / scyllarender / charybdisvoid / minotaurram | serpent crown, long tentacle fringe, open vortex mouth, and horns read. |
| cyclopseye / harpyshade / lamiacoil / kampechrono | single eye, wing blades, open coil, and skull/spiral read. |

The gameplay capture retains arena lighting and occasional particle FX, so the
audit used the normalized creature window and judged repeated contour mass, not
white FX pixels or the row label. The four SHIP reads—Poseidon trident, Hera
crown, Typhon storm crest, and Cyclops single eye—remain immediately legible.
