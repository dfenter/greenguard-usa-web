# Razorfin Rev 7 Lane L2: fish3d

## Scope

Implemented the Rev 7.5 fish rework in `fish3d.js`. `world3d.js` remains
untouched; its required instanced-bend v2 edit is in
`NOTES-rev7-laneL2-world3d.md` for the orchestrator to apply.

## Geometry and species read

- Changed the shared body loft from 6 to 8 radial sides and raised the hard
  geometry gate from 220 to 350 triangles.
- Kept 8 stations, but rounded the end profile to `[0.30, ..., 0.35]` with a
  fuller mid-body bump. The default fusiform depth is now exactly
  `radiusZ = 0.62 * radiusY`.
- Replaced open card fins with closed triangular-prism wedges. Fusiforms have
  a forked tail fan whose lobes are splayed at `+/-15deg`, a dorsal fin,
  swept pectoral pair, pelvic pair, and anal sliver. Three mirrored closed
  cheek/gill wedges keep the face readable in the small gameplay render.
- Eyes are merged into the loft on both sides: an 8-gon white ring plus proud
  dark 8-gon iris. The selftest pins 48 eye triangles total (24 per side).
- Added a parameterized `FISH_SHAPE_TABLE` rather than separate generators:
  mackerel is long/slender, grouper is deep/blunt, tuna is torpedo-shaped with
  a deeper crescent notch, swordfish and marlin receive bill wedges,
  dolphinfish gets a fuller blunt forehead, and the remaining fusiforms retain
  scaled palette/tier variants.
- Added non-null lofts for `ray`, `turtle`, `squidling`, and `giantsquid`.
  Ray uses `radiusZ/radiusY = 2.15` plus swept wings; turtle uses a domed
  shell volume and four flippers; squid variants use a tapering mantle and an
  arm skirt. No supported prey definition is left to silently billboard.

## Triangle counts

The requested headless fish selftest reports these indexed triangle counts:

| Definition | Triangles |
| --- | ---: |
| minnow | 288 |
| reeffish | 288 |
| mackerel | 288 |
| parrot | 288 |
| grouper | 288 |
| ray | 264 |
| turtle | 288 |
| tuna | 288 |
| swordfish | 296 |
| dolphinfish | 288 |
| marlin | 296 |
| squidling | 264 |
| giantsquid | 264 |
| anglerprey | 288 |
| abyssal | 288 |
| leviathanprey | 288 |

All are below the 350-triangle gate. Geometry and palette records are cached
independently per definition, and each geometry carries its palette id and
value boost metadata.

## Selftest and material contract

- The selftest now sweeps all 16 `RFD.CREATURES` prey definitions, requires
  non-null geometry, checks 8 radial sides, closed fin wedges, the 8-gon
  white-ring/dark-iris eye counts, the 350 gate, unique geometry identity,
  and the full score-ordered value-boost chain.
- `FISH_BEND_UNIFORM_DEFAULTS` now mirrors the Rev 7 instanced v2 values:
  amplitude `0.12`, `k = 5.5`, and span `[-0.5, 0.35]`. The material spec
  cache suffix is `:rf-bend-inst2` so it matches the world patch.
- Palette and `valueBoostFor()` behavior is unchanged; the four new palette
  rows only supply the previously missing prey identities.

## Verification

Ran:

```text
cd play/razorfin && node --import ./tools/reg.mjs tools/selftest.mjs fish
```

Result: `fish: pass=true`, 16 geometry records swept, no errors. Node emits
the repository's existing module-type warning for `shark3d.js`; it does not
affect the pass.

## Deviations and risks

The task's world3d portion is intentionally a notes-only handoff, as required
by the lane ownership map. The fish meshes are deliberately low-poly and
share the existing vertex-color toon path; the 40-90px art gate still needs a
real gameplay-camera screenshot after the orchestrator applies the world bend
patch. Ray and squid are the least fish-like silhouettes by design because
they are distinct prey archetypes, but they now have authored geometry,
eyes, depth, and appendages instead of a generic billboard.

Self-assessment: yes, the fusiform prey should read as bright cartoon fish at
40-90px: the round 8-gon body, proud white-ring eye, cheek marks, visible
dorsal/pectoral/pelvic fins, and forked tail establish a single animal rather
than glued-on cards. Mackerel, grouper, tuna, and billfish have enough length,
depth, head, or nose contrast to separate at a glance; the final confidence
point is the required screenshot review in the live 3/4 camera, especially for
the ray and squid variants.
