# Razorfin Rev 12 — Sharkjira round 3

Date: 2026-08-24  
Owner: Razorfin / Luna xhigh  
Scope: `play/razorfin/shark3d.js` and Sharkjira scratchpad probes

## Diagnosis

The previous capture had the feature stations reversed along Sharky’s local
Y axis. Gills, eyes, and teeth were therefore landing at the tail, while the
seven crest markers clustered there. The Sharkjira head scale also compounded
through the nested rig and read as an oversized black block. The dorsal fin
had been reduced as a side effect of the depth correction.

## Round-3 changes

- Sharkjira now uses eight dorsal stations, `[0.18, 0.28, 0.38, 0.48,
  0.58, 0.68, 0.77, 0.84]`, running from behind the head through the Tail3
  region. Heights are `[0.14, 0.20, 0.27, 0.32, 0.32, 0.27, 0.20, 0.13]`
  of body depth: a two-peak mid-back silhouette tapering toward both ends.
- Each plate is a jagged five-point maple-leaf prism, edge-marked and
  bone-bound to the Neck→Tail3 chain. Its root is lowered into the dorsal
  hull band so the rendered edge remains connected through the full line.
- Feature coordinates now use `box.min.y + station * span`, matching the
  approved great-white profile: nose right, dorsal up, tail left. Eyes,
  gills, throat, and teeth are back on the head.
- Sharkjira’s final head scale is `1.34` versus great white `1.109`, a
  measured ratio of about `1.21` (under the `1.25` cap). Abdomen depth is
  `1.25`; tail depth is thickened; the normal dorsal fin is preserved with
  the compensating fin depth scale.
- The hide remains opaque charcoal with relief. Emission is limited to
  `rfCrestEdge`, gills, eyes, throat, and plate edges through the pulsing
  atomic color; whole plates and the hull do not glow.

## Measured gate

Final browser probe:

```text
group bbox:       230.400 × 166.509 × 101.942
body bbox:        230.400 × 157.342 × 87.763
body length/depth: 2.625  (target 2.60–3.00)
armature scale:   length 1.17448, height 1.30, depth 0.78
crest plates:     8
crest vertices:   521
boundary edges:   227
connected:        true
crest depth ratio: 0.1016  (<= 0.35)
minimum face dot:  0.613  (positive / winding preserved)
atomic features:  174 vertices, 228 triangles
visible draws:    3
```

The structural gate retains crest connectivity, displacement, face-normal,
body-aspect, opaque-body, pulse, draw-count, and triangle-budget checks.

## Verification

```text
node --check shark3d.js
node --import ./tools/reg.mjs tools/selftest.mjs art3d fish
art3d: pass=true ok=5 fail=0
fish:   pass=true ok=8 fail=0
```

Measured side-view capture and 2× head/back crop:

```text
OUT=shotsJ6 IDS='leviathanrex,greatwhite' node sharkline.js
shotsJ6/shark_leviathanrex.png
shotsJ6/shark_greatwhite.png
shotsJ6/head-back-2x.png
```

No git commit or deploy was made.
