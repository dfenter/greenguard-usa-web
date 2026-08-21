# Shark-face rework decisions

- The fusiform tail is now a short crescent rather than a triangular sail:
  `tailLen = bodyLen * (0.20 + tailScale * 0.07)`, upper lobe
  `bodyLen * (0.16 + tailScale * 0.05)`, lower lobe `0.62 * upper`, and a
  `0.045 * bodyLen` peduncle root. The authored effective tail scale is capped
  at `2.0`; this keeps the existing thresher (`2.2`) inside the hard
  `0.18..0.34` fusiform gate without making a special archetype exception.
- Fusiform bodies use a narrower effective-girth law, a rounded front-22%
  snout taper, a straighter dorsal line, and a fuller curved belly. The hard
  spine aspect floor is `3.1`; the only bulk exceptions are eel, whale, and
  kaiju.
- The dorsal fin is centered near `+0.05L` and approximately `0.22L` high,
  with a swept trailing edge. Pectorals are longer, thinner, and swept aft.
  Five near/far gill bands use a preserved vertex-color attribute at
  `+0.28..+0.38L`; the underslung mouth line uses the same dark vertex-color
  path. The eye radius is half the prior fusiform value and is lifted toward
  the snout top.
- The bend chunk now names its z displacement, then applies
  `transformed.y += 0.35 * bendZ`; shell and every merged feature batch still
  share the same uniform bundle. Tail yaw is phase-locked to the body wave at
  `0.38 + 0.30*speedFrac`, while body roll and head counter-yaw oscillate at
  `±0.04` and `±0.05` radians.
- `RF.Art3D.__selftest()` now hard-gates the 61-definition sweep for tail
  ratios/lobe proportions/peduncle shape, fusiform body aspect, fin/pectoral
  placement, gill and mouth vertex colors, tail-tip travel, and bend y travel.

Verification target:

```text
node --check shark3d.js
node --import ./tools/reg.mjs tools/selftest.mjs art3d world game fish
```
