# Razorfin 3D roster distinctness

Owner directive: each shark must be distinct at the gameplay camera, using the
accepted `sharkart.js` roster as the baseline.

## Implementation

`shark3d.js` now has explicit hard-edged vertex-colour painters for all 30
pattern IDs used by the 61 data rows. The painter operates on loft station and
radial coordinates, so stripes, collars, spots, plates, scales, cracks, rings,
swirls, ribbons, bones, runes, and the other authored families survive as body
blocks instead of becoming one generic accent bucket. `patches` is implemented
as a reserved painter as well. Tiger is seven broad transverse blocks.

Palette fidelity is split deliberately: raw data swatches feed feature
materials, while a hue-preserving commit step prevents very dark source
values from vanishing in the water. Base/dorsal, base/flank, accent/pattern,
belly, and Act 3 glow-rim blocks are discrete vertex colours. Fins and tail
tips use the authored accent family; lure, rings, plates, eyes, and FX use
glow-owned materials.

The body and fins now consume authored `girth`, `finScale`, and `tailScale`
more strongly. Mako/thresher are slim with deeper crescent tails; whale and
kaiju are heavy; eel uses 24 tapering stations; angler is globular with a
lure; hammer has wide pectorals; saw/croc own long front profiles; rock,
mech, void, and kaiju retain their craggy, angular, ringed, and plate-specific
features.

## Gate

The self-test signature contains dominant body/tail vertex colours, raw
palette colours, body length/aspect, tail ratio, pectoral/dorsal ratios,
girth, and pattern/head/FX IDs. It compares tier-adjacent and act-adjacent
rows (`tier radius = 1`, `act radius = 1`) with this distance:

```text
0.31 colour + 0.50 proportions + 0.06 pattern + 0.06 head + 0.07 fx
```

The documented near-identical threshold is `0.05`. The current sweep checks
61 definitions and 619 adjacent pairs; its minimum is `0.051` (`reef/blue`).
The worst full-rig result is `2760` triangles, below the `3500` ceiling.

## Verification

```text
node --check shark3d.js
node --import ./tools/reg.mjs tools/selftest.mjs art3d world game fish
```

`sharkart.js` was read for reference and remains unmodified. The worktree is
intentionally left uncommitted.
