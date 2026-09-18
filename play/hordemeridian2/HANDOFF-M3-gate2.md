# HANDOFF M3 gate round 2 (fresh Opus reviewer, 2026-09-18)

Branch `hm2-m3`, HEAD `e422a157`, base `68612b3d`. Worktree clean before and after this
review. Nothing committed, nothing pushed.

## VERDICT: PASS

Blocker 1 is genuinely fixed. The fix is correct in the model, not just in the probe. The
new assertions are non-vacuous under my own mutations. No new defect found in `3d67abe3`.
Residuals below are follow-ups for Dan, not gate blockers.

## Blocker 1 fix review

**Model correctness.** `e.setpiece` is now ticked in the existing per-enemy `stepEnemies`
pass (game.js:7569-7572) and nulled at expiry, and cleared on both boss defeat paths
(game.js:8220-8221 region boss, 8253-8254 Core). This is the right shape:

- The tick mirrors the pre-existing `run.setpieceWell` tick 15 lines above (game.js:7554),
  so it is the established precedent in this file, not a new mechanism.
- `stepEnemies` is called unconditionally from the single update path (game.js:3450), so
  the tick runs on every frame for every live enemy, region boss and Core alike. There is
  no boss-only or module-gated branch that could skip it.
- Module-absence guarding is correct by construction. `e.setpiece` is only ever written
  inside `triggerBossSetpiece`, which early-returns when `window.HM2_BOSSES` is missing
  (game.js:8136). If the HM2 modules are absent, `e.setpiece` is never set, the new
  `if (e.setpiece)` guard is never entered, and the tick is a no-op. The fix cannot throw
  on a module-less load.
- The two defeat-path clears are belt-and-braces rather than load-bearing: even if a clear
  were missed, the expiry tick self-heals the slot within <=1.5s. That is the correct
  redundancy direction. Enemy spawn (game.js:6339+) does not reset `e.setpiece`, but since
  only bosses ever receive one and both boss death paths clear it, a recycled pool slot
  cannot inherit a stale descriptor.

**Cost and correctness for non-boss enemies.** The tick adds one truthiness test per live
enemy per frame in the hot loop. For all non-boss enemies `e.setpiece` is `undefined`, so
the branch is a single falsy check and the body never runs. This is strictly cheaper than
the `e.flash > 0` and `e.dotT > 0` checks already bracketing it. `hm2_world_probe.mjs`
measured estimatedFps 147.1 against a floor of 50, consistent with prior runs. No
regression. No behavior change for non-boss enemies, since nothing else in the codebase
reads `e.setpiece`.

## Cadence change: legitimate, not a mask

The 400ms/4.5% to 200ms/2% change is a probe-resolution fix, not a gameplay workaround.
Reasoning:

- `PHASE_THRESHOLDS` are 0.66 and 0.33 (hm2_bosses.js:12), so each phase band is one third
  of maxHp. At 4.5% per 400ms poll the probe crossed a whole 33% band in about 7 polls, but
  the set-piece lifetime is `0.9 + phase*0.3` seconds (game.js:8141), i.e. 0.9-1.5s, which
  is only 2-4 polls at 400ms. The old cadence sampled the boss faster than it sampled the
  set-piece window, so a correctly-firing set-piece could expire unobserved. At 200ms/2%
  the phase band is ~16 polls and the set-piece window is 4-7 polls. Several samples now
  land inside every window.
- Critically, this only became a problem *because* the fix made `e.setpiece` expire. Before
  the fix the stale descriptor was always readable, which is exactly the vacuity round 1
  caught. Needing a finer cadence is the expected consequence of a correct fix, not evidence
  of a gameplay defect.
- The 0.9-1.5s lifetime is sensible for real play on its own terms. It gates a banner plus a
  burst of contact rings, and for `gravity_well` it seeds `run.setpieceWell` with the same
  `t`. A phase-transition punctuation lasting about a second, escalating with phase, is a
  normal set-piece duration; a permanent one would be the anomaly. The real gameplay force
  (`applySetpieceWell`, game.js:7897) is bounded by the independent `run.setpieceWell.t`
  tick that predates this commit, so player-facing well duration is unchanged by the fix.
- The probe still finishes far inside budget: full 6-boss run completes with per-boss kill
  times of 5-10s against a 180s budget.

## Do the new setpieceWell assertions exercise ruling 3? Yes, proven by mutation

Mutation C below removes the well's expiry clear and the new assertion fails. Mutation 2
from the fix lane (removing the well assignment) fails both new assertions. They are not
vacuous in the round-1 sense: they require the well to be observed non-null with finite
x/y/strength AND to be observed null again afterward, so neither a never-set nor a
never-cleared well can pass.

## Mutation testing (all on M3's own functions, never the probes)

Three mutations, two of them mine beyond the round-1 one. All restored; `git status
--porcelain` empty after each.

**Mutation A (mine): collapse Core set-piece variety.** `hm2_bosses.js:66`, changed
`setpieceType` to always return `meta.setpieceByPhase[0]`.

    node hm2_boss_probe.mjs <url> 999 boss
    FAIL boss: Meridian Core yields 3 distinct set-piece types :: {"0":"asteroid_field","1":"asteroid_field","2":"asteroid_field"}
    7/8, EXIT 1

**Mutation B (mine): cap phase escalation.** `hm2_bosses.js:58`, wrapped
`phaseForHpFrac`'s return in `Math.min(1, ...)`.

    node hm2_boss_probe.mjs <url> 999 carrion-queen
    FAIL carrion-queen: all 3 phases observed (0,1,2) :: [0,1]
    7/8, EXIT 1

**Mutation C (mine, targets the fix itself): never clear the gravity well.**
`game.js:7556`, deleted `if (run.setpieceWell.t <= 0) run.setpieceWell = null;`.

    node hm2_boss_probe.mjs <url> 999 boss
    FAIL boss: run.setpieceWell is cleared again after its lifetime expires :: {"wellSeenThenNull":false,"wellClearedAfterExpiry":false}
    9/10, EXIT 1

C is the important one: it proves the round-2 fix's own new code is load-bearing and
covered, which is what round 1 could not say about the old assertion.

## Suite evidence at e422a157 (all re-run by me, not inherited)

    node hm2_boss_probe.mjs http://127.0.0.1:8797/play/hordemeridian2/ 999
      54/54 assertions passed, EXIT 0
      All 6 bosses phases [0,1,2]; Core 3 distinct types; setpieceWell assertions PASS
    node hm2_bestiary_probe.mjs 8797 42
      50/50 assertions passed
    node hm2_world.test.mjs
      24 cases, 0 failures
    node hm2_world_probe.mjs 8797 /tmp/hm2_r2_world
      PASS, estimatedFps 147.06 (floor 50)

Campaign probe not re-run; the fix lane's 55/55 with medians L1=143 L5=79 L10=54 L15=42 is
on the same tree and nothing in this review contradicts it.

## Residuals (follow-ups for Dan, NOT blockers)

1. **`e.setpiece` is write-only in gameplay.** Nothing in game.js, hm2_world.js or
   hm2_enemies.js reads `e.setpiece` after `triggerBossSetpiece` writes it; the visual and
   mechanical payload all fires synchronously inside that function, and the only durable
   effect routes through `run.setpieceWell`. So `e.setpiece` is currently a probe
   observable with a lifetime rather than gameplay state. The fix is still correct and
   necessary (the field is what the per-phase assertion reads, and a stale value is what
   made that assertion lie), but if a future milestone wants set-pieces to persist as
   terrain, `e.setpiece` is the hook and it is presently inert. Flagging so nobody assumes
   the asteroid ring or flare lanes have an ongoing collision presence. They do not.
2. **The two new setpieceWell assertions are conditionally skipped.** They are gated on
   `setpieceByPhase[1] === 'gravity_well'`. This is a deliberate and reasonable guard
   against false failures on bosses killed before phase 1, but it means a regression that
   changes which set-piece phase 1 uses would silently remove the well coverage rather than
   fail. Observed directly during mutation A: collapsing the Core's phase types dropped the
   run from 10 assertions to 8 with no complaint about the missing two. A future hardening
   would assert the expected count of assertions per boss.
3. Previously ruled and untouched: region-boss 2-to-3 phase balance shift, mimic stall,
   M3 enemies held out of REGION_ENEMIES until M4, L5 mission-5 variance, M2 evidence
   non-reproducibility, dt-squaring in `applySetpieceWell` (consistent with M2 precedent at
   game.js:5738 and 7947).

## Files reviewed

- `play/hordemeridian2/game.js` (stepEnemies tick, triggerBossSetpiece, both defeat paths,
  applySetpieceWell)
- `play/hordemeridian2/hm2_bosses.js` (phaseForHpFrac, setpieceType, setpieceFor)
- `play/hordemeridian2/hm2_boss_probe.mjs` (new assertions, cadence)
