# Razorfin eat-engine lane notes

## 2026-08-20

- Moved the near-tier chew cooldown from the player to `ent._biteCd`, so every
  target can take damage independently during the same 250 ms window.
- Added `p.st.chewFxCd` at 120 ms for shared chew feedback. Damage stays per
  target; hit-stop, shake, sound, chomp FX, and jaw snap are school-level
  feedback and cannot machine-gun when several fish overlap the mouth.
- Published `ctx.mouth` from a stable module scratch object. It is written
  before `World.update` so the world can apply suction in its own step, and
  refreshed by `stepEat` for direct/fallback callers. The engine never writes
  entity positions.
- `RF.World.__decaysBiteCd === true` is the ownership handshake. With the flag
  absent or false, engine3d decays existing target cooldown fields as a
  standalone fallback. This guard is intentional: both lanes must not decay
  the same field.
- `eatQuery` is preferred when supplied; the `query` fallback keeps the module
  runnable while the world lane merges. The music sensing call remains on
  `World.query`.
- Extended `RF.Game.__selftest()` from 119 to 129 passing checks covering the
  new cooldown, cadence, query, cone, suction, and fallback-decay contracts.
