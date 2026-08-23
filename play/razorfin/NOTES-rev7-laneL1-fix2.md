# Rev 7 Lane L1 fix 2 — real-render art repair

## Root causes

The black caudal fin was a winding bug, not a palette or vertex-color bug.
The body loft advances from tail to nose in `+X`, so its `a,d,b / b,d,c`
quad order produces outward normals. The welded tail loft advances from the
body ring toward the distal tail in `-X`, but it reused that same order. Every
tail side normal was therefore inverted. With the body material on
`FrontSide`, the camera-facing caudal triangles were culled; the visible
surface was the enlarged `BackSide` outline shell (`1.010`), which is the
precise reason the tail rendered as a near-black mass despite vivid tail
vertex colors. The pointed tail-cap triangles had the same sign error
(`+X` instead of distal `-X`).

The welded dorsal and pectoral faces are mirrored two-sided patches, so they
did not have the same single-sided failure, but they had no headless winding
contract. The new selftest checks tail side normals against the local outward
YZ direction, tail-cap normals against `-X`, and opposite normal pairs on the
dorsal/pectoral patches.

The mid-body vertex average was diluted by the low-saturation authored base
swatches and by toon/gradient lighting. The resolver was only flooring source
saturation at `.70`; it could therefore land close to the lower edge before
the render transform. The flank resolver now targets `S=.86` within the
`.70-.90` policy band. The reviewed accent/tail families target `S=.96`,
which compensates for the renderer's saturation loss while keeping the
accent gate in `[.80,1.00]`.

The face had a related winding problem: the mouth, lower-rim, and jaw
contours were clockwise in XY, so their +Z caps were back-facing and hidden
under the shell. Extruded camera-facing polygons now normalize to
counter-clockwise order. The eye keeps its authored model ratio, but its
visible feature unit uses a `1.34x` camera-scale compensation so it survives
the live tail-to-nose normalization. The hammer box was replaced with a
beveled T contour with a central stem; the numeric `.50 bodyLen` span and
bridge overlap remain in contract.

## Fresh real-render measurements

Harness: `sharkline.js`, service worker bypassed/cache disabled, viewport
`844x390` CSS px, screenshots `1688x780` physical px (`2x` DPR), output
`fix2-final/`. HSV masks were restricted to the accent hue family and the
reported tail/flank regions; mask counts are physical screenshot pixels.

| Definition | Tail accent pixels | Tail median S/V | Flank mask pixels | Flank median S/V |
|---|---:|---:|---:|---:|
| Reef | 10,731 | 1.000 / 0.557 | 3,971 | 1.000 / 0.553 |
| Tiger | 12,465 | 0.893 / 0.588 | 9,083 | 0.887 / 0.584 |
| Hammerhead | 9,623 | 1.000 / 0.557 | 4,885 | 1.000 / 0.557 |
| Great White | 9,392 | 1.000 / 0.565 | 4,586 | 1.000 / 0.565 |

All four tails clear the required `S>=.60, V>=.50` rendered accent gate;
all four flank samples clear `S>=.55, V>=.50`.

The live-camera projection probe, run at the same viewport and immediately
before the fresh captures, measured near-eye diameters of Reef `20.87` CSS
px, Tiger `26.13`, Hammerhead `24.07`, Whale Shark `27.58`, and Great White
`24.76` (all above the `10 CSS px` gate). The Hammerhead T-bar projected to
`76.66 CSS px` in screen X and is visibly T-shaped in the fresh screenshot.
The Reef screenshot's detected near-eye envelope was `31x28` physical px
(`15.5x14 CSS px`) with separate accent-iris pixels and catchlight.

## Verification

- `node --import ./tools/reg.mjs tools/selftest.mjs art3d`: pass; all 61
  definitions build and the new welded-normal/flank-color gates pass.
- Full suite (`art3d world game fish fx ui meta abilities`): every target
  passed; `4200` triangle ceiling, welded shared-index architecture,
  `:rf-bend3` contract, and `buildShark` API remain green.
- No git commit made.
