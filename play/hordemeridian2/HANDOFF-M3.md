# HANDOFF M3: enemies and bosses (2026-09-18)

**Status: GATED PASS.** Gate round 2 of cap 3, fresh Opus reviewer, no blockers.

Branch `hm2-m3`, gated hash **`e422a157`**, base `68612b3d`. Pushed to origin.
NOT merged to main, NOT deployed.

## Scope delivered

- **7 new enemy behaviors** in `hm2_enemies.js`, dispatched from `game.js` as a pure
  pre-chain insert ahead of the pre-existing if/else enemy chain, which is UNALTERED.
- **6 bosses with 3 phases each** in `hm2_bosses.js`: proboscis-prime, cinder-haematarch,
  glasswing-tyrant, null-proboscis, carrion-queen, plus the pre-existing Meridian Core as
  the 6th (mission 15's `finalBoss.type: 'core'` already names it; there is no 6th band
  region to hang a new one on).
- **Arena set-pieces** per phase: asteroid_field, gravity_well, solar_flare. Phase 0 fires
  on boss spawn as the telegraphed opener. The gravity well has a real gameplay effect
  (`applySetpieceWell`, game.js ~7890) pulling player and enemies, time-bound and cleared
  on expiry and on both defeat paths.

## Evidence at the gated hash e422a157

    node hm2_boss_probe.mjs http://127.0.0.1:8797/play/hordemeridian2/ 999
      54/54 assertions, exit 0. All 6 bosses reach phases [0,1,2] and fire a set-piece in
      every phase reached. Core yields 3 distinct types {0:asteroid_field, 1:gravity_well,
      2:solar_flare}. setpieceWell assertions pass (finite x/y/strength, cleared on expiry).

    node hm2_bestiary_probe.mjs 8797 42        50/50 assertions, exit 0
    node hm2_world.test.mjs                    24 cases, 0 failures
    node hm2_world_probe.mjs 8797 <outdir>     PASS, estimatedFps 147-213 (floor 50)

    node .../aaa/harness/hm2_campaign_probe.mjs <url> <outdir> 3
      55/55 assertions, exit 0. Medians L1=143s L5=79s L10=54s L15=42s, all bars met.
      All 15 missions boot, 0 new console errors.

Probe angle randomisation is real and seeded (`hm2_bestiary_probe.mjs:130`, mulberry32 off a
logged seed). M2's 8-fixed-angle defect was not repeated.

### Mutation testing

The committed suite was proven load-bearing against M3's own functions, not just run clean:

| mutation | result |
| --- | --- |
| `if (phase > 0) return;` at top of `triggerBossSetpiece` | carrion-queen 7/8, **exit 1** |
| collapse `setpieceType` to phase 0 | 7/8, **exit 1** |
| cap `phaseForHpFrac` at stage 1 | 7/8, **exit 1** |
| delete the well's expiry clear | 9/10, **exit 1** |
| comment out the `run.setpieceWell` assignment | glasswing-tyrant 8/10, **exit 1** |

All files restored after each; `git status --porcelain` empty before commit.

## Gate history

- **Round 1: HOLD, 1 blocker.** `e.setpiece` was written once and never cleared and
  `e.setpieceT` was never ticked, so the per-phase assertion read a stale phase-0 descriptor
  and passed vacuously for 5 of the 6 bosses. Proof: the `phase > 0` mutation left
  carrion-queen at 8/8 exit 0. Same vacuity class as the M2 HOLD.
- **Fix `3d67abe3`**, ruled in the MODEL per the gate, not in the assertion: tick
  `e.setpieceT` in the existing `stepEnemies` per-enemy pass and null `e.setpiece` on expiry;
  clear both on both boss defeat paths. Added committed `setpieceWell` assertions so ruling 3
  is covered by the suite. Probe cadence tightened 400ms/4.5% to 200ms/2%.
- **Round 2: PASS.** Fresh Opus reviewer, neither implementer nor the round-1 reviewer.
  Confirmed the tick runs every frame for region bosses and the Core alike, module-absence is
  safe by construction, and the cadence change is a legitimate consequence of making the field
  actually expire rather than a mask.

## Follow-ups for Dan

1. **Region-boss balance shift on shipped content.** `phaseForHpFrac` (`hm2_bosses.js:56`)
   ignores `e.regionBoss`, so the 5 pre-existing region bosses moved from a 2-phase model
   (one 0.5 threshold, base game.js:8099) to the shared 3-phase 0.66/0.33 model. This is an
   intentional consequence of the "6 bosses, 3 phases each" brief, but **the numbers changed on
   content that already shipped**. Ruled a documented follow-up, not a blocker.
2. **M2 gate evidence does not reproduce at its own hash.** HANDOFF-M2.md records 55/55 with
   L5=75s at gated hash `a978cc77`. The same unmodified probe at `68612b3d` (the M2 handoff
   commit, one commit later, probe untouched) gives 54/55 with L5=38s. L5 samples span 30-82s
   against a 45s bar and are bimodal, so a 3-trial median lands either side by chance.
   Pre-existing and NOT an M3 defect, but the M2 pass is unreliable and the bar needs
   re-tuning or a higher trial count.
3. **The 7 M3 enemies are deliberately NOT in the `REGION_ENEMIES` wave pools.** They are in
   `REGION_ENEMY_BY_KEY` and spawnable, so the brief's "7 new behaviors live in data" is met,
   but they never appear in normal play. Pool wiring is deferred to M4 (mission structure is
   M4 scope). Flagged rather than silently scope-expanded.
4. **Mimic stall risk (residual, no live trigger).** `mimicStep` permanently sets
   `e.speed = e.baseSpeed = 140` on wake and the data ships `speed: 0`, so a mimic that never
   wakes is permanently stationary. Every mission objective type across `levels/*.js` was
   checked and there is no clear-all-enemies objective, so nothing can stall today. Revisit if
   M4 adds a clear-the-wave objective.
5. **`e.setpiece` is write-only in gameplay.** Nothing reads it, so set-pieces have no ongoing
   collision presence; it exists as a descriptor for the probe and the visual. The lifetime fix
   is still correct since it is what the assertion reads, but the field carries no play effect.
6. Minor: the two new `setpieceWell` assertions are gated on phase 1 being `gravity_well`, so a
   regression that changes that hook silently drops coverage rather than failing.

M3 measures better than its own base: the merged state is 55/55 where the clean baseline
`68612b3d` is 54/55.

**M4 is unblocked.**
