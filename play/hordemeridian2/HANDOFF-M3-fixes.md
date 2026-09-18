# HANDOFF M3 fixes (three coordinator rulings, applied)

Branch `hm2-m3`, worktree `scratchpad/m3-enemies`. Commit `3ab0718a` on top of
`8bd483df`. Do NOT push, do NOT merge to main, do NOT deploy (per lane rules).

## Ruling 1: fire the phase-0 set-piece on boss spawn

Added a call to `triggerBossSetpiece(boss, def.key, 0)` in `spawnRegionBoss`
(game.js, after the region boss lands) and `scene.triggerBossSetpiece(b, 'boss', 0)`
in `spawnBoss`'s deferred landing callback (game.js). Both call sites reuse the
existing `triggerBossSetpiece` untouched; `bossPhaseChange` itself was not
restructured. No double-fire risk: `bossPhaseChange` only runs when
`nextPhase > (e.phaseStage || 0)`, and spawn sets `e.phaseStage = 0`, so a
0-to-0 "transition" never fires it. The existing
`(window.HM2_BOSSES && ...) ? ... : <fallback>` guard inside
`triggerBossSetpiece` and `setpieceFor` is untouched, so a missing module is
still a silent no-op.

Applies to all 6 bosses: 5 region bosses via `spawnRegionBoss`, the Meridian
Core via `spawnBoss`.

## Ruling 2: per-phase assertion in hm2_boss_probe.mjs

Replaced the weak "arena set-piece fired at least once" (which printed the
first 3 poll ticks, all phase 0) with:
- `setpieceByPhase` object recording the first set-piece type seen at each
  `phaseStage`.
- New assertion: every phase the boss actually reached in `phasesSeen` has a
  matching entry in `setpieceByPhase`.
- New assertion (boss key `'boss'` only): the Meridian Core yields 3
  DISTINCT set-piece types across phases 0/1/2.

**Mutation test**: forced `setpieceType()` in hm2_bosses.js to always return
`'gravity_well'` (temp edit, reverted, diff verified identical to original
afterward). Re-ran `node hm2_boss_probe.mjs <url> 999 boss`:

    FAIL  boss: Meridian Core yields 3 distinct set-piece types across phases 0,1,2  :: {"0":"gravity_well","1":"gravity_well","2":"gravity_well"}
    7/8 assertions passed
    REAL_EXIT=1

Probe correctly exits non-zero on the mutation.

## Ruling 3: setpieceWell gets a real gameplay effect

Added `applySetpieceWell(target, worldApi, dt)` in game.js, reusing the
existing `gravity_well` `collide` hook and the same pull-normal math already
used for the region terrain feature (`applyTerrainToEnemy` /
`applyWorldFeaturesToPlayer`), rather than inventing a new system:
- Called from `applyTerrainToEnemy` (already invoked per enemy per frame in
  `stepEnemies`) and from `applyWorldFeaturesToPlayer` (called once per frame
  for the player) — no new per-frame loop added.
- `flip` inverts the pull into a push via a sign flag.
- Guards non-finite/zero-distance and radius (520, matching the region
  gravity_well default) before applying force.
- Time-bound: `run.setpieceWell.t` is ticked down once per frame at the top
  of `stepEnemies` and the well is cleared (`= null`) at `t <= 0`, so it can
  never become a permanent field. Also cleared explicitly in both boss
  `defeat()` paths (`e.regionBoss` and `e.boss`) so a killed boss cannot
  leave a dangling well.

## Folded-in stood-down reviewer findings (against this same change set)

1. **Fixed.** hm2_bosses.js `setpieceFor` validated `isFinite` only in the
   `asteroid_field` branch. Added the same `isFinite(x)/isFinite(y)` (and
   `isFinite(strength)` for the well) checks to the `gravity_well` and
   `solar_flare` branches, dropping the well/lane on failure. This matters
   more now that ruling 3 makes `setpieceWell` drive real movement — a NaN
   would otherwise have corrupted player/enemy positions irrecoverably.
2. **Report only, no ruling made, not reverted.** `phaseForHpFrac` ignores
   `e.regionBoss`, so the 5 region bosses moved from their old 2-phase model
   (single 0.5 hp threshold) to the shared 3-phase 0.66/0.33 model. This is a
   real balance change to pre-existing bosses, not purely additive. Needs
   Dan's ruling; left as-is per instruction.
3. **Fixed.** game.js `damage()` guarded the shield-wall multiplier call with
   only `window.HM2_ENEMIES`, unlike the `stepEnemies` call site which also
   checks `HM2_ENEMIES.BEHAVIORS[e.behavior]` existence. Changed to
   `window.HM2_ENEMIES && window.HM2_ENEMIES.wallDamageMultiplier` for
   consistency.
4. **Report only, not changed.** hm2_enemies.js `mimicStep` sets
   `e.speed = e.baseSpeed = 140` only on wake; data ships `speed: 0`, so a
   mimic that never wakes stays stationary and could in principle stall a
   wave-clear condition. Residual, flagged, out of scope for this fix lane.

## Probe evidence

`node --check game.js && node --check hm2_bosses.js && node --check hm2_boss_probe.mjs` — clean.

Server: `python3 -m http.server 8797` in the worktree root.

- `node hm2_boss_probe.mjs http://127.0.0.1:8797/play/hordemeridian2/ 999`
  seed 999: **48/48 assertions passed**, all 6 bosses, phase 0 now fires for
  every boss, Core rotates `asteroid_field -> gravity_well -> solar_flare`
  across phases 0/1/2 with the new distinct-types assertion passing.
- Mutation run (seed 999, `boss` key only, `setpieceType` forced to always
  return `gravity_well`): 7/8, exit 1, as recorded above.
- `node hm2_bestiary_probe.mjs 8797 42` — **50/50**, no regression.
- `node hm2_world.test.mjs` — **24/24**.
- `node hm2_world_probe.mjs 8797 /tmp/hm2_fix_world_shots` — **estimatedFps
  227.3**, up from the pre-fix merged baseline of 158.7 (fps floor easily
  cleared; ruling 3's pull is folded into existing per-frame hooks, no new
  loop over all enemies).
- `node /Users/lucille/ue-port-studio/aaa/harness/hm2_campaign_probe.mjs
  http://127.0.0.1:8797/play/hordemeridian2/ /tmp/hm2_fix_shots 3` —
  **55/55 assertions passed**, all 15 missions boot, L5 3-trial median 78s
  (trials 78/58/171, passes the >=45s bar), L1 median 112s, L10/L15 survive
  past the opening. 0 console errors beyond the pre-existing benign
  scope/SW noise already excluded by the probe.

## Commit

`3ab0718a` on `hm2-m3`: `game.js`, `hm2_bosses.js`, `hm2_boss_probe.mjs`.
Not pushed.

## Remaining for the orchestrator

- Fold finding 2 (region-boss 2-phase to 3-phase balance shift) into Dan's
  ruling queue; do not act on it further here.
- Finding 4 (mimic stall risk) is a residual, not blocking.
- Gate review / push / HANDOFF-M3.md / memory update per the prior
  HANDOFF-M3-wait.md "Remaining steps after the A/B" list (items 3-5), which
  this fix lane does not cover.
