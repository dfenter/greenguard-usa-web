# HANDOFF M3 wait, round 2 (orchestrator parked 2026-09-18)

Status: **lanes merged and verified except the campaign A/B, which is still running.**
Router seat lucille-bc. Respawn a fresh Opus orchestrator from this file when the two
campaign probes finish.

## Merge: DONE

`d93316af` on branch `hm2-m3` in `scratchpad/m3-enemies` = lane A (`5302f827`) + lane B
(`e4d1b29c`, branch `hm2-m3-bosses`). One conflict, `index.html` script tags, resolved
additively (both `hm2_enemies.js` and `hm2_bosses.js` load). `game.js` auto-merged; both
lanes' hooks verified present (HM2_ENEMIES x5, HM2_BOSSES x6). `node --check` clean on
game.js, hm2_enemies.js, hm2_bosses.js. NOT pushed.

## Green on the merged state

| check | result |
| --- | --- |
| hm2_bestiary_probe.mjs seed 42 | 50/50, exit 0 |
| hm2_boss_probe.mjs seed 999 | 41/41, exit 0, all 6 bosses |
| hm2_world.test.mjs (M2) | 24 cases, 0 failures |
| hm2_world_probe.mjs (M2) | PASS, estimatedFps **158.7**, fps floor met |

fps-at-300 acceptance is covered by the M2 world probe's `?perf` watchdog floor (50 fps
mobile profile), which the merged state clears at 158.7.

## RESUME CONDITION: two campaign probes

1. **Baseline** `68612b3d`, 3 trials, worktree `scratchpad/m3-base`, server port 8795,
   log `/tmp/hm2_base_campaign.log`.
2. **Merged** `d93316af`, 3 trials, server port 8797, log `/tmp/hm2_merged_campaign.log`.

Read `BOT MEDIANS` and any `^FAIL` from both, then compare. Both servers are
`python3 -m http.server` already running; restart if the shell died.

### Why this A/B is running

Lane B's single-trial campaign run (`/tmp/campaign_probe.log`) reported
**54/55, FAIL "bot: mission 5 survival median >= 45s :: 30s"**, against an M2 baseline of
L5=75s. Full comparison, M2 handoff vs that run:

    L1 134s -> 65s, L5 75s -> 30s (FAIL), L10 54s -> 55s, L15 42s -> 47s

Do NOT treat that as a confirmed regression yet:
- It is **1 trial per mission**, so "median" is a single sample. The M2 baseline numbers
  may themselves have been multi-trial. The A/B above is 3 trials on both sides to settle it.
- Attribution is **lane B only**: that run's server log `/tmp/hm2_http.log` never requests
  `hm2_enemies.js` (grep count 0), only `hm2_bosses.js`. Lane A's code was not loaded.
- Mechanism is **not obvious**: mission 5's region boss spawns at `at: 86` (level5.js) but
  the bot died at t=30s, so lane B's boss phase/setpiece code never ran in that trial.
  Lane B's game.js edits are confined to `damage()`, `bossPhaseChange()` and the new
  `triggerBossSetpiece()`, all boss-gated. A pre-boss L5 death is hard to pin on them.
- `errs=1` per trial is the **pre-existing service worker scope error**, documented in
  HANDOFF-M2.md, not a new defect. The probe filters it for the real assertion.

If the 3-trial A/B shows baseline L5 also below 45s, this is flaky/pre-existing and NOT an
M3 blocker; record it and proceed. If baseline L5 is comfortably above 45s and merged is
not, it IS a real regression and lane B must fix it before the gate.

Two 52-PASS logs (`/tmp/campaign_probe2.log`, `/tmp/hm2_m3_campaign.log`) are TRUNCATED
mid-run, not clean passes: they stop before the bot-survival section and have no
`BOT MEDIANS` line. Do not cite them as evidence.

## DEFECT FOUND, must go to the gate or back to lane B

**The Meridian Core's set-piece rotation does not work, and the boss probe cannot see it.**

- `hm2_bosses.js:44` gives the Core `setpieceByPhase: ['asteroid_field','gravity_well','solar_flare']`
  and `setpieceType()` (line 66) indexes it by phase, so the intent is one hook per phase.
- Merged boss probe evidence for the Core: `[gravity_well, gravity_well, gravity_well]`.
  Lane B's handoff claims "gravity_well -> solar_flare rotation observed for the Core
  across its phases". That rotation was NOT observed in this run.
- Root cause of the blind spot: `hm2_boss_probe.mjs:204` asserts only
  `arena set-piece fired at least once` and prints `setpiecesSeen.slice(0, 3)`, which is
  the first 3 **poll ticks** (all still phase 0), not one sample per phase. A Core stuck
  on a single hook type passes.
- Fix wanted: record the set-piece type **per phase stage** (keyed off `b.phaseStage`) and
  assert the Core's three phases yield three distinct hook types. Then re-check whether
  the Core genuinely rotates; if it does not, the bug is in the game/module, not the probe.

This is exactly the M2 lesson repeating: the probe passes without exercising the feature.

## Second observation, lower severity

`triggerBossSetpiece` writes `this.run.setpieceWell` (game.js:8088) and it is **never read
anywhere** (grep count 1 = the write). `e.setpieceT` is likewise only written. So the
gravity-well set-piece is **visual only** and has no gameplay effect. Lane B's own residual
#1 argues no per-frame cost was added, which is consistent, but the plan's "arena set-piece"
implies it should affect play. Worth a ruling: acceptable for M3, or a gap to close.

## Remaining steps after the A/B

1. Settle the L5 question per the decision rule above.
2. Resolve the Core rotation defect (probe fix, then game fix if the rotation is truly broken).
3. Spawn ONE Opus LOW gate reviewer on merged `hm2-m3`, at 390x844 with the capture
   harness. Reviewer is NEVER either implementer. Round cap per feedback_gate_round_cap.md:
   two consecutive HOLDs on one file means rule on the model first, then cap point fixes
   at ~3; report the count to Dan past ~5. Tell the reviewer to mutation-test against M3's
   OWN functions, and point it at the two findings above.
4. On PASS: push `hm2-m3`, write HANDOFF-M3.md, update the status line in
   ~/.claude/projects/-Users-lucille/memory/project_horde_meridian_2.md with a dated entry.
5. No merge to main, no deploy.

## Known non-blockers

- M3 enemies are in `REGION_ENEMY_BY_KEY` (spawnable) but deliberately NOT in the
  `REGION_ENEMIES` wave pools, so they never appear in normal play. Lane A deferred pool
  wiring to M4 (mission structure is M4 scope per the plan). Brief acceptance is
  "7 new behaviors live in data", which is met. Flag to Dan, do not silently expand scope.
- The 6th boss is the pre-existing Meridian Core, not a new REGION_BOSSES row. There is no
  6th band region to hang one on and mission 15's `finalBoss.type: 'core'` already names it.
- `hm2_world_probe.mjs` takes a **PORT**, not a URL: `node hm2_world_probe.mjs 8797 <outdir>`.
  Passing a full URL yields a misleading "page failed to load / __HORDE_READY never became true".
- `stepRegionBossSchedule()` keys `debugState.forceRegionBoss` off the REGION key, not the
  boss key. Pre-existing; lane B's probe routes around it via BOSS_TO_REGION.

## Commands

    cd scratchpad/m3-enemies && python3 -m http.server 8797   # merged
    cd scratchpad/m3-base    && python3 -m http.server 8795   # baseline 68612b3d
    cd play/hordemeridian2
    node hm2_bestiary_probe.mjs 8797 42
    node hm2_boss_probe.mjs http://127.0.0.1:8797/play/hordemeridian2/ 999
    node hm2_world_probe.mjs 8797 /tmp/hm2_merged_world_shots
    node hm2_world.test.mjs
    node /Users/lucille/ue-port-studio/aaa/harness/hm2_campaign_probe.mjs \
      http://127.0.0.1:8797/play/hordemeridian2/ /tmp/hm2_merged_shots 3
