# Frenzy/data lane notes

- Kept `ctx.run.frenzy` and `ctx.run.goldRushT` as compatibility aliases because
  HUD, score, coin, and damage consumers outside this lane still read them.
  `goldRush`, `blood`, `school`, and `golden` are the separated Rev 3 records.
- The golden roll happens in the scoped engine kill bridge on the first player
  eat of a pack. This is the documented deterministic fallback for a first-sight
  query hook; it marks all currently active members with `_tint` in place.
- A pooled numeric event scratch captures all player-eaten members in a fixed
  step. It applies the extra heal after the existing swallow restoration, so
  clamping remains identical to multiplying the authored heal before clamping.
- Blood multipliers are applied through `player.st.statMults`; the bridge is
  idempotent so the existing abilities updater can refresh its base multipliers
  without compounding Blood or Gold Rush speed.
