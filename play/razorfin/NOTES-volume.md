# Razorfin shark volume pass

Owner review on 2026-08-20 found that the lofted sharks still read as flat
cutouts from the gameplay camera. The geometry was 3D, but the profile read
hid the section volume and the outline shell was too heavy.

Implemented in `shark3d.js`:

- Fusiform mid-body sections now use `radiusZ / radiusY = 0.92`; the geometry
  records both the raw section ratio and the actual mid-section roundness for
  the headless gate.
- The pose yaw is `±0.42` and both pectorals splay `0.35` radians, exposing a
  near fin and a lower far-fin edge in the 3/4 view.
- The toon ramp's darkest band is `0.30`. The baked belly floor is `0.74`,
  leaving more of the top-to-underside contrast to the key light.
- The inverted-hull outline is `1.022x` with `0x0a1a24`; the selftest rejects
  any present shell above `1.025x`.
- `flatShading` remains enabled and triangle budgets are unchanged.

Implemented in `engine3d.js`:

- Exported `RF.Game.LIGHT_RIG` owns the boot hemisphere intensity `0.55`, the
  directional intensity `1.25`, and the upper-front-left position
  `(-120, 260, 420)`. The world atmosphere lane still owns depth-based runtime
  light writes after handoff.

Verification:

```text
node --check shark3d.js
node --check engine3d.js
node --import ./tools/reg.mjs tools/selftest.mjs art3d world game fish
```
