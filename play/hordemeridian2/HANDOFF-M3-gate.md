# HANDOFF M3 gate, round 1 (Opus gate reviewer, 2026-09-18)

Branch `hm2-m3`, HEAD `6468a6e6`, base `68612b3d`. Reviewer wrote no game code.
Worktree verified clean (`git status --porcelain` empty) before and after probe mutations.

## VERDICT: HOLD (1 blocker)

Everything the fix lane claimed reproduces EXCEPT one probe assertion, which I
mutation-tested and found vacuous for 5 of the 6 bosses.

## Blocker 1: per-phase set-piece assertion is vacuous for the 5 region bosses

`hm2_boss_probe.mjs:216` asserts `set-piece fired in every phase reached` by reading
`b.setpiece` (game.js:8133). `e.setpiece` is written once and NEVER cleared; `e.setpieceT`
(game.js:8134) is set but never ticked down or read. So a stale phase-0 descriptor is still
present when the probe samples phases 1 and 2, and the assertion passes on a boss that fires
nothing after spawn.

Mutation (added `if (phase > 0) return;` at the top of `triggerBossSetpiece`, game.js:8127,
reverted after):

    boss (Core)     7/8, EXIT 1   <- caught, but ONLY by the Core-distinct assertion (:224)
      PASS set-piece fired in every phase reached :: {"0":"asteroid_field","1":"asteroid_field","2":"asteroid_field"}
      FAIL Meridian Core yields 3 distinct set-piece types
    carrion-queen   8/8, EXIT 0   <- NOT caught. Region boss firing zero set-pieces
                                     after phase 0 passes the gate clean.

Ruling 2 was "mutation-tested against a boss stuck on one hook" — that test used the Core,
whose distinct-types assertion carries it. The generic per-phase assertion it was meant to
validate does not work. This is exactly the standing M2 lesson: the probe passes without
exercising the feature, for 5 of 6 bosses.

Fix belongs in the MODEL, not the assertion: `e.setpiece` needs an owner and a lifetime.
Tick `e.setpieceT` down and null `e.setpiece` on expiry (the `run.setpieceWell` tick at
game.js:7554 already does exactly this and is the pattern to copy), then the existing
per-phase assertion becomes real for all 6 bosses with no probe change. Alternatively stamp
`e.setpiece.phase` at write time and have the probe key on that.

## Verified, holds as claimed

- boss probe seed 999: 48/48, exit 0. Core rotates asteroid_field -> gravity_well ->
  solar_flare across phases 0/1/2 including phase 0. Ruling 1 confirmed landed.
- bestiary seed 42: 50/50, exit 0.
- hm2_world.test.mjs: 24 cases, 0 failures.
- world probe (PORT form): PASS, estimatedFps 121.95 vs floor 50. Note the fix lane logged
  227.3 and the pre-fix merge logged 158.7; spread is run-to-run variance, all clear the floor.
- Old if/else enemy chain UNALTERED. Whole-diff check: only 4 removed lines in game.js across
  68612b3d..HEAD, all 4 in boss phase/banner code. M3 enemy dispatch (game.js:7620) is a
  pure pre-chain insert that falls through when the key is absent.
- Probe angle randomisation is REAL, seeded and logged. `hm2_bestiary_probe.mjs:130` draws
  `angle = rand() * 2PI` from a logged-seed mulberry32 and prints the angle in each assertion
  detail. The M2 defect (8 fixed angles at hm2_world_probe.mjs:337) was NOT repeated.

## applySetpieceWell (game.js:7890) — clean, ruling 3 landed

Runtime-verified with a throwaway harness (/tmp, no repo files touched):

    real pull on player: 15.1px over 2s with a well 200px away  (not a no-op)
    NaN well x/y        -> positions stay finite
    zero distance       -> positions stay finite
    NaN strength        -> positions stay finite
    expiry              -> run.setpieceWell === null after t elapses

Cleared on boss death at game.js:8212 and 8243 (both defeat paths). No new per-frame loop:
folded into the existing `applyTerrainToEnemy` and `applyWorldFeaturesToPlayer` calls. `dt`
squaring mirrors the pre-existing M2 call sites (5738, 7947) as noted; consistent, not new.

Residual (not blocking): NO probe anywhere references `setpieceWell` or `applySetpieceWell`.
Ruling 3 is unverified by the committed suite; my verification was ad-hoc and is not retained.
Worth a probe assertion when blocker 1 is fixed.

## Rulings requested

1. **Region-boss balance shift: DOCUMENTED FOLLOW-UP, not a blocker.** `phaseForHpFrac`
   (hm2_bosses.js:56) ignores `e.regionBoss`, moving the 5 region bosses from one 0.5
   threshold (base game.js:8099) to 0.66/0.33. Real balance change to shipped content, but it
   is an intentional consequence of "6 bosses with 3 phases each" in the M3 brief — a region
   boss with 2 phases would not meet acceptance. Dan should be told the number changed; M3
   should not be held on it.
2. **Mimic stall: RESIDUAL, not a blocker.** I checked every mission objective type across
   levels/*.js: `survive`, `boss`, `bases`, `time`, `kills`, `level`, `hull`, `noWingLost`,
   `win`. There is NO clear-all-enemies objective in the game, so a permanently dormant mimic
   cannot stall a completion condition. The theoretical risk has no live trigger. Revisit if
   M4 adds a clear-the-wave objective.

## Not re-litigated (per coordinator)

Phase-0 opener, per-phase probe assertion existence, setpieceWell gameplay effect, the 7
enemies staying out of REGION_ENEMIES, L5 mission-5, region identity. All left as ruled.

## Round cap

This is HOLD round 1. One blocker, and it is a model/ownership ruling (`e.setpiece` lifetime),
not a point fix, per feedback_gate_round_cap.md.

## To clear this gate

Give `e.setpiece` a lifetime (tick `e.setpieceT`, null on expiry), then re-run
`node hm2_boss_probe.mjs http://127.0.0.1:8797/play/hordemeridian2/ 999` expecting 48/48 AND
re-run the `phase > 0` mutation against `carrion-queen` expecting a non-zero exit.
