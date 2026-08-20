# Razorfin scale-camera lane

Implemented the Rev 3 camera and shark-scale contract in `engine3d.js`.

- The player sim length is now `124 * sil.len`; `r` and `mouthR` use the same
  length source, while the existing `mouthR` clamp remains sufficient for the
  current roster.
- `RF.Game.LEN_SCALE` exports `124 / 96`. The engine applies it once to the
  player rig after `RF.Art3D.buildShark()` and records the scaled
  `group.__baseScale`, so eat-pop rendering cannot recapture an unscaled base.
  NPC consumers use the same shared factor through the 3D contract.
- Camera framing is `z=430` at tier 1 with a `340` tier floor. Pitch and bob
  are named constants, use the `(x, -y, z)` mapping signs, and are applied at
  both camera look-at sites.
- Combo-threshold zoom, death pull-back, and the optional Blood Frenzy push-in
  all reuse `camState` numeric fields. The pulse selftest advances 60 fixed
  steps and verifies the eat pulse is back at base within one second.

Verification performed for this lane:

```text
node --check play/razorfin/engine3d.js
node --import ./tools/reg.mjs tools/selftest.mjs world game art3d fx ui meta abilities
```
