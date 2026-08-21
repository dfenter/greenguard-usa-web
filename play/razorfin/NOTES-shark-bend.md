# Razorfin shark-bend notes

- Bend materials are clones of cached template materials and are created only
  by `buildShark`; `animate()` writes scalar values into the rig's one shared
  uniform bundle.
- The outline shell uses a restrained 1.022 scale and its shader variant
  compensates the bend amplitude by `1 / 1.022`; a separate uniform bundle
  would violate the per-rig identity contract.
- The pose child sits between the consumer-owned outer group and all parts.
  `group.scale` remains the world-unit/eat-pop authority; speed stretch lives
  on `pose.scale`.
- The engine currently passes `speedFrac`, `turn`, and bank but not `vy` or
  `preyNear` in every state bag. The rig guards those optional fields, so the
  vertical pitch and anticipation become active as those contract fields are
  supplied without changing the consumer API.
- Headless program enumeration is based on stable base shader variants and
  `:rf-bend` cache keys; the gate is eight variants or fewer.
