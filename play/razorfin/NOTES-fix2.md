# Fix2 implementation notes

- Abyss ridges no longer fill down from each top facet to the entire world
  floor. The three main batches use reduced waves `[28,42,56]`, a shared
  `simY=3582` base, and a 42..180 world-unit top band. The positive-z crown is
  a 24..68 world-unit bottom fringe. Facet palettes darken in parallax order,
  with the near ridge using the deepest authored rock values.
- Fish lofts now have brighter species palettes, rounder compact bodies, less
  shark-like tail fins, and a palette identity stamped on each geometry. The
  world adapter keeps each definition's vertex-colour bake and divides the
  0.72x player-length cap by the loft's local width before composing its
  instanced or fallback mesh scale.
- Seafloor rock cards use muted green-grey vertex tints instead of the pale
  top tint that read as tan cards at the frame edge.
- Updated `SPEC3D` Rev 3 environment, fish-palette, and prey-scale contracts;
  expanded fish/world selftests for distinct palette geometry, final prey
  length, ridge height, crown height, and depth-ordered terrain luminance.
- `data.js` was not regenerated because no zone or generated terrain constants
  moved in `tools/gen_data.py`.

Verification:

- `node --check world3d.js`
- `node --check fish3d.js`
- `node --import ./tools/reg.mjs tools/selftest.mjs world game art3d fish`

