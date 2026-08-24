# Rev 9 hammerhead repair

Date: 2026-08-24

## Fix

`shark3d.js` now replaces the old zero-thickness `ShapeGeometry` stick with a
rounded, beveled, extruded cephalofoil. It is authored in Sharky's local `y/z`
side plane and lofted through local `x`, so the gameplay camera sees the
flattened double-lobe silhouette instead of an edge-on blue bar.

- The prop is parented to the `Head` bone.
- The foil uses the existing `skinMaterial()` path with the hammer body/belly
  ramp; it does not use the accent swatch.
- Two small eye spheres are merged into the same prop geometry and marked by a
  feature attribute, keeping the prop at one mesh/draw-object while rendering
  dark eyes at the lobe tips.
- `fitProp()` targets a projected span of `0.50` body X, inside the requested
  `0.45–0.55L` band. The Sharky snout remains under the foil rather than being
  replaced by a separate base asset.
- `athenajaw` is covered automatically by the existing `sil.head === "hammer"`
  branch; `data.js` required no edit.

## Asset choice

The procedural foil was kept after a side-by-side check. `hammer_chibi.glb`
produced a convincing front-facing T, but its side gameplay render did not
read better and did not preserve the established Sharky body. `greatwhite`
was rendered alongside both checks and remained unchanged.

## Verification

Rendered with:

```text
OUT=shotsH IDS='hammerhead,greatwhite' node sharkline.js
```

The final hammer render measured `rfHammerProjectedSpan = 0.500000...` and
compiled the shared foil/eye shader without browser errors.

Full suite:

```text
node --import ./tools/reg.mjs tools/selftest.mjs world game art3d fish fx ui meta abilities
```

Result: all requested suites passed.
