# Rev 8 restart — cartoon shark lane

Date: 2026-08-23

## What I authored

This pass starts the hull over. `makeSpineGeometry()` no longer asks a head
archetype for a body profile. Every one of the 85 definitions samples the same
hand-authored side silhouette through `canonicalHullAt()`:

- Top control points: `(0,.34) (0.06,.46) (0.14,.64) (0.25,.80) (0.40,.90)
  (0.55,.96) (0.60,.97) (0.68,.93) (0.80,.84) (0.90,.71) (0.97,.56)
  (1,.44)`.
- Belly control points mirror the full, rounded belly: `(0,-.30) (0.06,-.40)
  (0.14,-.58) (0.25,-.76) (0.40,-.90) (0.55,-.96) (0.60,-.97)
  (0.68,-.93) (0.80,-.84) (0.90,-.70) (0.97,-.56) (1,-.44)`.
- Width profile is also authored once, from `.86` at the nose through `1.04`
  at mid-body to `.90` at the tail root.
- Base radius is `.204L`; resolved hull scale is bounded to `0.84–1.12`.
  Point/blunt/hammer rows stay in the normal band; whale/kaiju rows are the
  only rows allowed to approach the `.45L` heavy-body ceiling.

The old head ids now select face and prop presets only. The common face has a
blunt dome, large eye unit, underslung open mouth, lighter lower-jaw slab, and
permanent white tooth band. Upper teeth are proud of the band so low-tier
sharks show the grin at rest; the existing articulated jaw/chew path remains
on top for late tiers. Gills were remounted behind the cheek, the hammer foil
was lifted onto the forehead, and Pantheon/identity features were remounted
without changing their roster ownership.

## Final measured proportions

The built-geometry plus rendered-silhouette probe reports these roster ranges:

| Measure | Final range | Rev 8 gate |
| --- | ---: | ---: |
| Body depth / L | `.331–.441` | `.32–.45` |
| Snout tip radius / L | `.075–.101` | `>= .06` |
| Head fraction | `.30` | `.30` |
| Dorsal height / L | `.118–.134` | `<= .16` |
| Pectoral span / L | `.105–.128` | `.10–.14` |
| Eye diameter / L | `.118–.139` | `.10–.14` |
| Resting white tooth-band coverage | `.92` | `>= .60` |
| Hull scale | `.84–1.12` | `.80–1.20` |

The white coverage value is derived from the visible `.04–.96` mouth-span
band in the rendered-silhouette probe; the browser captures were then checked
at the gameplay review viewport. The final eight-ID capture is in the
scratchpad render set `shotsR8f` for `reef`, `tiger`, `hammerhead`,
`whaleshark`, `greatwhite`, `leviathanrex`, `zeusfin`, and `typhonmaw`.

Triangle selftest worst case is `4238/4600` (`nullfin`), with the closest
adjacent roster distance `0.068` against a `0.05` threshold. Pantheon identity
and bend/engine authority checks remain green.

## Honest visual assessment

Against the supplied Hungry Shark Evolution references, the final capture now
reads immediately as cartoon sharks: fat rounded bodies, blunt faces, high
expressive eyes, small fins, thick tail roots, crescent tails, and a visible
toothy grin. It is no longer the rejected pointed racecar/boat silhouette.

The weakest special case is `hammerhead`: its forehead foil is intentionally
graphic and can briefly read as a prop before the eye, mouth, and tail resolve
the shark. Late Pantheon/kaiju rows are also busier than the reference because
their identity spikes and FX are retained by contract. Those are honest style
differences; the shared base silhouette and resting face now carry the shark
read without relying on those props.
