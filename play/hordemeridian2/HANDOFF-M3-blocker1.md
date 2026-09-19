# HANDOFF M3 blocker 1 fix (fix lane, 2026-09-18)

Branch `hm2-m3`, base `6468a6e6`, commit `3d67abe3`. Worktree clean before and after.

## What changed

Gate round 1 (HANDOFF-M3-gate.md) HOLD: `e.setpiece`/`e.setpieceT` were written once at
`triggerBossSetpiece` (game.js:8135) and never cleared, so a stale phase-0 descriptor let
`hm2_boss_probe.mjs`'s "set-piece fired in every phase reached" assertion pass on 5 of 6
bosses that fire nothing after spawn.

Fix (game.js):
1. `stepEnemies` per-enemy loop (game.js ~7563-7570): tick `e.setpieceT -= dt`, null
   `e.setpiece` (and zero `e.setpieceT`) at `<= 0`. Folded into the existing per-enemy pass
   right after the `e.flash` decrement, no new loop.
2. Both boss defeat paths (`e.regionBoss` at ~8217, `e.boss` at ~8250): clear
   `e.setpiece`/`e.setpieceT` alongside the existing `run.setpieceWell = null`.

Also closed the gate's residual: `hm2_boss_probe.mjs` had no assertion referencing
`setpieceWell`/`applySetpieceWell` anywhere, so ruling 3 (gravity well has a real gameplay
effect) was unverified by the committed suite. Added:
- tracking of `sc.run.setpieceWell` during the existing poll loop
- new assertion: `run.setpieceWell becomes real with finite x/y/strength` for any boss whose
  phase-1 hook is `gravity_well`
- new assertion: `run.setpieceWell is cleared again after its lifetime expires`

Probe cadence change (required by the fix, not a workaround): the old 400ms poll /
`maxHp*0.045` damage step could blow a region boss through an entire phase in 1-2 polls.
Once `e.setpiece` genuinely expires (~0.9-1.5s lifetime), that coarse cadence sometimes
missed the fresh sample inside the new phase's short window before it expired, producing a
false FAIL for a correctly-firing boss (confirmed at fine-grained 150ms/1.8% diagnostics
outside the probe: every phase fired correctly). Tightened to 200ms poll / `maxHp*0.02`
damage so multiple samples land inside every phase's set-piece window.

## Mutation results (mandatory verification)

**Mutation 1** (the gate's exact mutation): added `if (phase > 0) return;` at the top of
`triggerBossSetpiece`, ran `node hm2_boss_probe.mjs <url> 999 carrion-queen`, reverted,
re-ran clean.

    MUTATED   carrion-queen  7/8 assertions, EXIT 1
      FAIL set-piece fired in every phase reached :: {"0":"asteroid_field"}
    REVERTED  carrion-queen  8/8 assertions, EXIT 0

Confirms the model fix (not just the probe) is load-bearing: with the mutation still in
place but the lifetime fix live, the vacuous-pass defect the gate found is gone; carrion-queen
now correctly fails when set-pieces stop firing after phase 0.

**Mutation 2** (new setpieceWell assertion): commented out the `this.run.setpieceWell = {...}`
assignment in the `gravity_well` branch of `triggerBossSetpiece` (game.js ~8148), ran
`node hm2_boss_probe.mjs <url> 999 glasswing-tyrant`, reverted, re-ran clean.

    MUTATED   glasswing-tyrant  8/10 assertions, EXIT 1
      FAIL run.setpieceWell becomes real with finite x/y/strength :: {"wellSeenNonNull":false,"wellFiniteValid":false}
      FAIL run.setpieceWell is cleared again after its lifetime expires :: {"wellSeenThenNull":false,"wellClearedAfterExpiry":false}
    REVERTED  glasswing-tyrant  10/10 assertions, EXIT 0

`git status --porcelain` confirmed empty before both mutations, after both reverts, and
before the final commit.

## Full suite evidence (post-fix, HEAD 3d67abe3)

Server: `python3 -m http.server 8797` in this worktree.

    node hm2_boss_probe.mjs http://127.0.0.1:8797/play/hordemeridian2/ 999
      SEED 999, APPROACH ANGLE 6.0941
      54/54 assertions passed, EXIT 0
      All 6 bosses: phases [0,1,2] observed, set-piece fired every phase reached.
      Core: 3 distinct types {"0":"asteroid_field","1":"gravity_well","2":"solar_flare"}.
      glasswing-tyrant + null-proboscis + boss: setpieceWell assertions PASS (finite, cleared on expiry).

    node hm2_bestiary_probe.mjs 8797 42
      50/50 assertions passed, EXIT 0

    node hm2_world.test.mjs
      24 cases, 0 failures

    node hm2_world_probe.mjs 8797 /tmp/hm2_b1_world
      PASS, estimatedFps 212.77 (floor 50, no regression from prior 238.1/158.7 runs)

    node /Users/lucille/ue-port-studio/aaa/harness/hm2_campaign_probe.mjs \
      http://127.0.0.1:8797/play/hordemeridian2/ /tmp/hm2_b1_shots 3
      55/55 assertions passed, EXIT 0
      BOT MEDIANS: L1=143s L5=79s L10=54s L15=42s (all pass their bars)
      All 15 missions boot, 0 new console errors.

## Not touched (per scope)

Region-boss 2-phase to 3-phase balance shift, mimic stall, wave pools (M3 enemies stay out
of REGION_ENEMIES), L5/M2 evidence non-reproducibility, region identity model. All left as
previously ruled; no code changed for any of them in this pass.

## Files changed

- `play/hordemeridian2/game.js` (setpiece lifetime + clear-on-death)
- `play/hordemeridian2/hm2_boss_probe.mjs` (setpieceWell assertions, tightened poll cadence)

Commit: `3d67abe3` on `hm2-m3`. Not pushed, not merged, not deployed.
