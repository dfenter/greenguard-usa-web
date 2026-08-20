# Razorfin world query lane notes

- `World.query` is deliberately still center-point semantics. Mine chains and
  music sensing share it, so mouth overlap belongs in the separate
  `World.eatQuery` API backed by the same spatial-hash walk.
- `RF.ctx.mouth` is read-only world input. Suction changes velocity immediately
  before `integrate()`, allowing the existing containment and hash rebucketing
  to remain the position authorities. Hazards are excluded by the `prey` kind
  gate, and the pull is capped at 1.6x the authored prey speed.
- `_biteCd` is a top-level pooled scalar, reset on acquire and decayed by the
  world. This keeps target cooldowns independent without adding per-step
  objects or changing the existing `st.biteCd` hazard/NPC timers.
- `displayLen` is collision-radius-derived and now uses the Rev 3 2.1x scale;
  jelly and puffer animation call sites continue to use the same helper.
