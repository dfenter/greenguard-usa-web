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

## L5 mission-5 scare: RESOLVED, not a regression

Lane B's 1-trial `L5=30s` FAIL was single-trial noise. Both lanes' completed multi-trial
runs clear the 45s bar, and both are 55/55:

    M2 baseline (handoff)  L5=75s   55/55
    lane B 1-trial (scare) L5=30s   54/55 FAIL
    lane B 3-trial rerun   L5=79s   55/55   trials [79,66,80]
    lane A 2-trial         L5=73s   55/55   trials [63,82]

Single-trial L5 samples across all runs: 30,63,66,79,80,82. The 30 is an outlier. L15 is
noisier still (lane B [39,121,117] vs lane A [29,37]), so treat ANY 1-trial median from
this probe as unreliable; use 3 trials.

A 3-trial A/B (baseline `68612b3d` on port 8795 vs merged `d93316af` on port 8797) was
launched to confirm on the merged state. Logs `/tmp/hm2_base_campaign.log` and
`/tmp/hm2_merged_campaign.log`. **This is the remaining resume condition.** Read
`BOT MEDIANS` and any `^FAIL` from both. Given the four runs above, expect both to pass;
if merged alone fails L5 across 3 trials, escalate to lane B.

## CORRECTION: Core rotation is FINE. The real defect is PHASE 0.

My round-2 note claimed the Meridian Core's set-piece rotation was broken. **That was
wrong**, and the error was mine: `hm2_boss_probe.mjs:204` prints
`setpiecesSeen.slice(0, 3)`, which is the first 3 **poll ticks** (400ms apart, all still
phase 0), not one sample per phase. I misread a display slice as the full record.

A diagnostic patch recording set-piece type keyed by `b.phaseStage` (since reverted, the
probe file is back to lane B's committed version) shows the Core rotating correctly:

    boss (Core): {"1":"gravity_well","2":"solar_flare"}

which matches `setpieceByPhase: ['asteroid_field','gravity_well','solar_flare']`.
`hm2_bosses.js` logic is sound in isolation too: phaseForHpFrac 0.9->0, 0.5->1, 0.2->2.

### The real defect: no boss ever fires its phase-0 set-piece

Same diagnostic, all six bosses:

    proboscis-prime   {"1":"asteroid_field","2":"asteroid_field"}
    cinder-haematarch {"1":"solar_flare","2":"solar_flare"}
    glasswing-tyrant  {"1":"gravity_well","2":"gravity_well"}
    null-proboscis    {"1":"gravity_well","2":"gravity_well"}
    carrion-queen     {"1":"asteroid_field","2":"asteroid_field"}
    boss (Core)       {"1":"gravity_well","2":"solar_flare"}

Phase 0 is absent for every boss. Cause, `game.js:8153`:

    if (nextPhase > (e.phaseStage || 0)) this.bossPhaseChange(e, nextPhase);

Set-pieces fire only from `bossPhaseChange`, which only runs on a phase *transition*.
A boss spawns already in phase 0, so phase 0 never transitions and its set-piece never
plays. For the Core this means its declared `asteroid_field` opener never appears in game.

Severity: the plan asks for "an arena set-piece" per boss and every boss does get one from
phase 1 onward, so this is a partial miss, not a total one. But the Core's first declared
hook is dead data. Decide: fire the phase-0 set-piece on boss spawn, or drop phase 0 from
`setpieceByPhase` and document that set-pieces are transition-only.

### Probe gap to close either way

`hm2_boss_probe.mjs:204` asserts only `arena set-piece fired at least once`. That passes a
boss stuck on one hook type for all phases, and it hid the phase-0 gap. It needs a
per-phase assertion (record `setpiece.type` keyed by `phaseStage`, assert the Core yields
distinct types across its phases, and assert whatever phase-0 behavior gets ruled above).
This is the M2 lesson again: the probe passed without exercising the feature.

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
