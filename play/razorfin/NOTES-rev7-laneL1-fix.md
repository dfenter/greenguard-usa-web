# Rev 7 Lane L1 art-review fix

Implemented against `REVIEW-REV7-ART.md` in `shark3d.js`. `data.js` was not
changed; the authored swatches are resolved at runtime in the 3D lane.

## 1. One color language

- Added a code-side palette resolver that preserves authored hue and retargets
  visible swatches to flank `S .70-.90 / V .55-.82`, accent-tail-fin
  `S .80-1.00 / V .65-.95`, and belly `S .15-.40 / V .80-.98`.
- Every feature consumes the resolved palette object; raw `palette.accent` is
  retained only in audit metadata. Glow swatches resolve into the accent ramp.
- The outline is an HSV `V .11` color and the shell is `1.010`, within the
  requested `1.008-1.012` contour range.
- The welded tail/fins use the resolved accent block. Numeric self-tests check
  all resolved ramp ranges and outline value.

## 2. Forked crescent tail

- Re-cut the welded tail to `11` stations with a pointed cap, tail depth
  `0.10 bodyLen`, and total tail ratio `0.28-.36 bodyLen`.
- Landed upper lobe peak `0.23 bodyLen`, lower peak `0.15 bodyLen`, ratio
  `0.652`, center notch depth `0.38 bodyLen`, and final-20% lobe taper `0.30`
  of peak.
- The root still reuses the rear body ring indices; no tail mesh or root seam
  was reintroduced. Numeric gates cover length, lobe ratio, notch, depth,
  station count, taper, and pointed cap.

## 3. Head, eye, and jaw scale-up

- Head scales landed at point `1.50`, blunt `1.62`, hammer `1.60`, whale
  `1.44`, and kaiju `1.56`; front-span targets are `0.40-.45 bodyLen`.
- Eye radius fractions are point/blunt/hammer `.45 radiusY`, whale `.42`, and
  kaiju `.50`; the near eye is `.05 bodyLen` proud of its computed local
  surface. Iris scale is `.52` of eye radius with resolved `S/V` above the
  required thresholds and the catchlight remains.
- Mouth widths land in `.38-.58 bodyLen`, with `.30 head-height` minimum
  opening and a resolved-color lower jaw rim framing the dark cavity.

## 4. Species silhouettes

- Hammer foil is authored on the live camera's screen-horizontal X axis at
  `0.50 bodyLen` projected span, `0.13 bodyLen` thickness, and `.18 bodyLen`
  bridge overlap.
- Whale uses a `1.4-1.7x` Great White head-height ratio, `.58 bodyLen` mouth,
  eight visible flank spots at `.08 head-height` diameter with `delta-V >=.25`,
  plus mouth-crossing baleen.
- Tiger stripe bands are `.052 bodyLen` wide with resolved flank/mark value
  contrast `>=.25`; the stripe gate checks the `.045-.060` width range.

## 5. Proud identity features

- Added a local surface-radius helper and used it for camera-facing eyes,
  mouth/gills, whale baleen/spots, void ring/eye, and mech panels.
- Void ring landed at `.88 head-height` diameter with `.08 head-height` stroke
  and `.055 bodyLen` proud placement; the void eye is `.24 head-height` and
  `.06 bodyLen` proud/emissive.
- Mech panels cover `10.7%` of visible-body estimate with `delta-V .31`, are
  `.05 bodyLen` proud, and thrusters are `.05 bodyLen` proud of the fin.

## 6. Animal-motion gate

- Kept shared indices, engine `tailPhase`/`tailAmp` authority, and the
  `:rf-bend3` shader contract. Added `uBendScale` so the legacy engine scalar
  maps to a bounded local displacement without changing authority.
- Mid-body bend gate is `.058 bodyLen` maximum (`<=.06`), distal tail sprint
  displacement is `.18 bodyLen`, and the smooth root-to-tip span is
  `.30-.35 bodyLen`. Head/eye/jaw features remain on the rigid anchor side of
  the bend envelope.

## Verification

- `node --import ./tools/reg.mjs tools/selftest.mjs art3d`: pass; all `61`
  definitions build, worst rig `nullfin` is `4174` triangles.
- Full smoke (`world game art3d fish fx ui meta abilities`): all targets pass.
- The `4200` triangle gate remains active; no `4600` exception was needed.
