# Rev 7 Lane L1 — welded shark rig

## Architecture built

- `buildShark(def)` still returns `{ group, parts, animate }`, keeps the `RF pose`
  hierarchy and `SHARK_POSE_YAW`, preserves `rfArcs`/`rfFlash`, and normalizes
  the world-space X bbox to `96 * sil.len`.
- `makeSpineGeometry()` now emits one indexed, vertex-coloured BufferGeometry:
  20–30 spine stations x 18 radial vertices, an indexed tail crescent, a
  swept dorsal wedge, and mirrored pectoral wedges. Tail, dorsal, and pectoral
  root faces reuse body-ring indices. `parts.tail`, `parts.pectL`, and
  `parts.pectR` are intentionally `null`; `group.userData.rfWeldedAppendages`
  is `{tail:true,dorsal:true,pectorals:true}`.
- The old tail root transform, separate pectoral meshes, face-mass slab, dorsal
  mesh path, and final snout-collapse branch are gone. The body loft owns the
  front 30% swell and ventral belly drop.
- The jaw is the only articulated body part. It has a separate vertex-coloured
  rim, dark hinge/cavity band, a 1.022 BackSide shell, and its existing merged
  tooth child. The whole welded silhouette has its own 1.022 BackSide shell.
- Eyes are per-side low-poly hemisphere + proud pupil disc + catchlight quad,
  merged into the bendable feature batches. The measured pair is 204 triangles.
- Organic body materials use smooth normals; rock/mech/kaiju bodies retain flat
  shading. Fins use the body vertex-colour material with a hard accent block at
  the root and two inboard rings.

## Bend v3

`bendableMaterial()` now declares and binds all seven uniforms:
`uBendPhase`, `uBendAmp`, `uBendK`, `uBendSpan`, `uBendBias`, `uTailAmp`, and
`uTailSpan`. The tail envelope shares phase with the body bend, keeps the Y
coupling for side-camera readability, and uses cache suffix `:rf-bend3`.
`bendOffset()` mirrors both envelopes. `animate()` no longer rotates a tail
mesh; engine `tailPhase`/`tailAmp` remain authoritative for the main bend,
while the existing `tailSweep` formula drives the welded-tail amplitude.

## Exaggeration tuning

`exaggerationFor()` uses head scales point 1.30, blunt 1.45, hammer 1.35,
whale/kaiju 1.15, eel 1.10, default 1.30; jaw scales span 1.25–1.50; eye
scales span 0.24–0.30 of `radiusY`; belly drop is 0.12–0.18. Mouth corners
are expanded toward local `u=0.70`. Radius uses the required unclamped law:
`bodyLen * (0.085 + 0.14 * girthNorm^1.2)`. The selftest measured normalized
roster girth spread at `2.336` (minimum gate `0.35`).

## Measured triangles

Welded-body ranges and full-rig maxima by archetype:

| Archetype | Defs | Welded body tris | Max full rig tris |
|---|---:|---:|---:|
| point | 21 | 1056–1272 | 3974 |
| blunt | 12 | 1056–1272 | 3830 |
| hammer | 1 | 1200 | 3126 |
| saw | 2 | 1200–1272 | 3642 |
| whale | 3 | 1272 | 4006 |
| rock | 6 | 1272 | 4002 |
| croc | 1 | 1272 | 3614 |
| angler | 4 | 1272 | 3922 |
| eel | 2 | 1452 | 3898 |
| void | 2 | 1272 | 4110 |
| mech | 3 | 1272 | 4066 |
| skull | 3 | 1272 | 3961 |
| kaiju | 1 | 1272 | 4134 |

## Selftest changes

The Rev 6 selftest was replaced with the Rev 7 gates: all 61 definitions build;
4200 triangles/rig maximum; stable `:rf-bend3` keys; shader-source declarations
for every injected uniform; body and jaw shells; shared-index peduncle/fin
roots; 204-triangle eye unit; smooth/flat archetype policy; world-scale X bbox;
engine tail-phase/amplitude authority; CPU bend mirror; normalized girth spread
and roster distinctness. False assertions for old tail/pectoral meshes,
body-only outline, `:rf-bend2`, pectoral runtime splay, and face slabs were
removed. `engine3d.js` and `world3d.js` were grepped first: neither consumes
`parts.tail`, `parts.pectL`, or `parts.pectR`; only scalar engine tail state is
relevant.

## **DEVIATIONS FROM SPEC 7.4 — FLAGGED**

1. D4's nominal welded-body target is ~1300–1550 triangles. Most early and
   middle archetypes are 1056–1272; only eel reaches 1452. I chose the lower
   end to keep the actual full-rig maximum at 4134 under the hard 4200 gate
   while retaining the existing teeth, palette patterns, FX, and eye budget.
2. Existing per-material feature merging still yields about 8–13 feature
   batches on the roster rather than a strict 5–6 total draw-call count. No
   new appendage draw calls remain, but the legacy feature palette/emissive
   families were retained for art distinctness and are the main draw-call risk.
3. Jaw teeth remain a static child mesh of the articulated jaw for the existing
   tooth language; they are not independently animated or exposed in `parts`.

## Art-review risks

- Headless tests cannot compile/link the shader in a real renderer. The injected
  source string was explicitly probed for all seven declarations and the Y
  coupling, but a browser/WebGL capture is still the final validation.
- The welded pectoral wedges now follow the body bend and no longer have their
  old independent flutter rotation. This is seam-safe and phase-continuous,
  but the art review should confirm that the fin silhouette still reads at the
  side camera and that the hard root accent block is not too broad.
- The new unclamped girth law intentionally makes whales, kaiju, and high-girth
  armored sharks much heavier than the old roster. Check the HSE-style roster
  at gameplay scale for accidental near-duplicates around mako/blue and for
  feature occlusion on the fattest heads.

## Self-assessment against the references

This pass moves the roster materially closer to the Hungry Shark Evolution bar:
each shark now has a single chunky loft with a committed front swell, readable
eye unit, broad grin/jaw, continuous crescent tail, and saturated hard colour
blocks instead of a transformable collection of glued-on tail and fin pieces;
the remaining risk is the deliberately conservative welded-body density and
the still-rich feature-batch count, which should be judged from the side-camera
capture rather than from headless geometry metrics alone.
