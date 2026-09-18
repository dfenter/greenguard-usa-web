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

## L5 mission-5: PRE-EXISTING, not an M3 regression. M2's evidence does not reproduce.

Settled by a 3-trial A/B. The **clean baseline `68612b3d`, with no M3 code at all, FAILS
mission 5 harder than either M3 lane**:

    BASELINE 68612b3d (no M3 code) L5=38s  54/55 FAIL   trials [53,31,38]
    lane B 3-trial (M3 bosses)     L5=79s  55/55 PASS   trials [79,66,80]
    lane A 2-trial (M3 enemies)    L5=73s  55/55 PASS   trials [63,82]
    lane B 1-trial (the scare)     L5=30s  54/55 FAIL   trials [30]

M3 did not regress L5. The baseline is the worst of the three.

### This impugns the M2 gate evidence, flag to Dan

HANDOFF-M2.md records `55/55 ... L5=75s` at gated hash `a978cc77`. Re-running the same
unmodified probe at `68612b3d` (the M2 handoff commit, one commit later, probe file
untouched) gives L5=38s and 54/55. **The M2 pass is not reproducible at its own gated
commit.** Nothing in M3 caused this; it is an M2 evidence problem inherited by M3.

### Why: the L5 bar sits inside the noise band

All nine single-trial L5 samples collected today, sorted:

    30 31 38 53 63 66 79 80 82     (bar = 45s)

Bimodal, with 3 of 9 below the bar. The bot dies to hp=0 every time, so this is real
survival variance, not a probe defect. A 3-trial median can land either side of 45s by
chance, which is exactly what happened across these runs.

Recommendation for the gate: do NOT hold M3 on L5. Either raise the trial count until the
median is stable, or re-tune the bar against a measured distribution. Record the M2
non-reproducibility as its own follow-up rather than folding it into M3's verdict.

**A/B COMPLETE.** The merged state passes where the clean baseline fails:

    BASELINE 68612b3d  54/55 FAIL   L1=150  L5=38 (FAIL)  L10=55  L15=42
    MERGED   d93316af  55/55 PASS   L1=148  L5=83         L10=54  L15=37

All 15 missions boot on merged, 0 console errors. M3 did not regress the campaign; it
measures better than its own base. L5 is closed as pre-existing noise.

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

---

# ROUND 3 (orchestrator parked 2026-09-18, after coordinator rulings)

## Coordinator rulings received

1. **Phase-0 set-piece**: fire it ON BOSS SPAWN as the telegraphed opener. Dan wants the effects.
2. **Boss probe**: replace "fired at least once" with a per-phase assertion (3 distinct set-pieces
   for the Core keyed on phaseStage), mutation-tested against a boss stuck on one hook.
3. **Gravity well**: `setpieceWell` must have a REAL gameplay effect (pull on player and enemies
   during that phase), minimal and surgical. No effect-free set-pieces.
4. **Wave pools**: the 7 M3 enemies stay OUT of REGION_ENEMIES, deferred to M4. Note in handoff.
5. **Lane A commit a4f5e544**: RECONCILED, no action needed. It is a HANDOFF-M3-enemies.md doc-only
   commit and is already an ancestor of HEAD (`git merge-base --is-ancestor` confirms).

Also ruled: do NOT hold M3 on L5; record the M2 non-reproducible L5 as a follow-up in HANDOFF-M3.md.

## Status

Fix lane DISPATCHED (sonnet, background, worktree scratchpad/m3-enemies, branch hm2-m3 at 8bd483df)
implementing rulings 1-3. It writes play/hordemeridian2/HANDOFF-M3-fixes.md.

The first Opus gate was spawned and then STOOD DOWN before it could reach a verdict, because
rulings 1-3 change the code underneath it. It made no edits; worktree was left clean. Its partial
findings are below and were forwarded to the fix lane.

## Gate reviewer's partial findings (all four verified by the orchestrator against the code)

1. **Unvalidated hook returns, now safety-critical.** `hm2_bosses.js setpieceFor` checks
   `isFinite` ONLY in the asteroid_field branch (~line 94). The gravity_well (~99) and solar_flare
   (~109) branches trust `hooks.spawn` unvalidated. Under ruling 3 the well drives real movement
   integration, so a NaN would corrupt player/enemy positions. SENT TO FIX LANE as a required fix.
2. **Region bosses silently rebalanced.** `phaseForHpFrac` ignores `e.regionBoss`, so the 5 region
   bosses moved from a 2-phase model (single 0.5 threshold, base game.js:8099) to the shared
   3-phase 0.66/0.33 model. A real balance change to pre-existing bosses, not purely additive.
   **NEEDS DAN'S RULING.** Fix lane told to report, not revert.
3. **Inconsistent guard.** game.js ~8122 calls `wallDamageMultiplier` guarded only by
   `window.HM2_ENEMIES`, not by the `BEHAVIORS[e.behavior]` existence check used at the stepEnemies
   call site. Sent to fix lane as a cheap consistency fix.
4. **Mimic can stall waves.** `hm2_enemies.js mimicStep` permanently sets `e.speed = e.baseSpeed =
   140` on wake, and the data ships `speed: 0`, so a mimic that never wakes is a permanently
   stationary enemy that could stall a wave-clear condition. Residual, report only.

## Resume condition

Fix lane reports (or caps out with HANDOFF-M3-fixes.md). Then:

1. Read HANDOFF-M3-fixes.md. Verify rulings 1-3 landed and that the ruling-2 mutation exits non-zero.
2. Re-run the full merged suite yourself: bestiary (expect 50/50), boss probe (all 6 bosses, new
   per-phase assertion), hm2_world.test.mjs (24/24), world probe (PORT not URL, check fps has not
   regressed from 158.7), campaign probe 3 TRIALS (expect 55/55; never trust a 1-trial median).
3. Spawn ONE fresh Opus gate reviewer, never an implementer, on the updated state. Round cap per
   feedback_gate_round_cap.md. Give it the four findings above and the rulings, and require
   mutation testing against M3's OWN functions.
4. On PASS: push `hm2-m3`, commit HANDOFF-M3.md (including the L5/M2 follow-up and the ruling-2
   balance question), update the status line in
   ~/.claude/projects/-Users-lucille/memory/project_horde_meridian_2.md with a dated entry.
5. No merge to main, no deploy.

## Evidence so far on merged d93316af (pre-fix)

    bestiary seed 42      50/50
    boss probe seed 999   41/41, 6 bosses
    hm2_world.test.mjs    24/24
    world probe           PASS, estimatedFps 158.7
    campaign 3-trial      55/55 PASS, L1=148 L5=83 L10=54 L15=37, 15/15 missions boot
    baseline 68612b3d     54/55 FAIL, L5=38  (merged beats its own base)

---

# ROUND 4 (orchestrator parked 2026-09-18): fixes verified, GATE IN FLIGHT

## Fix lane: DONE and INDEPENDENTLY VERIFIED

Commits `3ab0718a` (fixes) + `6468a6e6` (handoff evidence) on `hm2-m3`, on top of `8bd483df`.
Worktree clean. The fix lane has stood down.

All three rulings verified by the orchestrator re-running the evidence, not by trusting the report:

| ruling | verification |
| --- | --- |
| 1 phase-0 on spawn | `triggerBossSetpiece(...,0)` added in BOTH spawn paths (spawnRegionBoss + spawnBoss landing). Boss probe shows phase 0 firing for all 6 bosses. |
| 2 per-phase probe assertion | boss probe 48/48; Core asserted to yield 3 DISTINCT types `{0:asteroid_field, 1:gravity_well, 2:solar_flare}`. Fix lane's mutation (force one hook type) gave 7/8 exit 1. |
| 3 gravity well real effect | `setpieceWell` went from 1 reference (dead write) to 11. New `applySetpieceWell` (game.js ~7890) pulls player AND enemies, `flip` inverts to push, time-bound via `run.setpieceWell.t`, cleared on expiry and on both `defeat()` paths. |

Gate findings 1 and 3 also folded in: `isFinite` validation added to the gravity_well and
solar_flare branches of `hm2_bosses.js setpieceFor`; `damage()` shield-wall guard made consistent
with the stepEnemies call site.

**Cleared, do not re-raise**: `applySetpieceWell` multiplies by `dt` inside `pullAccel` and again on
the position update. That looks like a dt-squared bug but it MATCHES the two pre-existing M2 gravity
call sites (game.js:5738 and 7947). Consistent with precedent, not a new defect.

## Orchestrator's own re-verification on 6468a6e6

    boss probe seed 999    48/48, exit 0, phase 0 fires for all 6, Core rotates 3 distinct types
    bestiary seed 42       50/50, exit 0
    hm2_world.test.mjs     24/24
    world probe (port)     PASS, estimatedFps 238.1 (floor 50; was 158.7 pre-fix, so no regression)

## Resume condition: TWO things in flight

1. **Opus gate round 1** on HEAD 6468a6e6. It has the rulings, the out-of-scope list, and the two
   open items below. It writes HANDOFF-M3-gate.md.
2. **Campaign probe 3-trial** on the fixed state, log `/tmp/hm2_final_campaign.log`, port 8797.
   Was at L8 at park time. Expect 55/55 and 15/15 missions; the fix lane already saw 55/55 with
   L5 median 78s on its own run.

## Open items the gate must rule on

1. **Region-boss balance shift.** `phaseForHpFrac` ignores `e.regionBoss`, so the 5 pre-existing
   region bosses moved from a 2-phase model (single 0.5 threshold, base game.js:8099) to the shared
   3-phase 0.66/0.33 model. A real balance change to shipped content, not purely additive.
   Blocker, or documented follow-up for Dan?
2. **Mimic stall risk.** `hm2_enemies.js mimicStep` permanently sets `e.speed = e.baseSpeed = 140`
   on wake and the data ships `speed: 0`, so a mimic that never wakes is a permanently stationary
   enemy that could stall a wave-clear condition. Blocker or residual?

## On PASS

1. Push `hm2-m3` (this is the only push authorised; still NO merge to main, NO deploy).
2. Commit `HANDOFF-M3.md` covering: the 7 behaviors, the 6 bosses, all probe evidence with seeds,
   the three rulings, and these follow-ups for Dan:
   - region-boss 2-phase to 3-phase balance shift (item 1 above)
   - mimic stall risk (item 2 above)
   - M3 enemies deliberately not in wave pools, deferred to M4
   - **L5 / M2 evidence**: HANDOFF-M2.md claims 55/55 with L5=75s at gated hash a978cc77, but the
     same unmodified probe at 68612b3d gives 54/55 with L5=38s. The M2 pass does not reproduce at
     its own gated commit. L5 samples span 30-82 against a 45s bar (bimodal). Pre-existing, NOT an
     M3 blocker, but it means the M2 gate evidence is unreliable and the bar needs re-tuning or
     more trials.
3. Update the status line in ~/.claude/projects/-Users-lucille/memory/project_horde_meridian_2.md
   with a dated entry.

## On HOLD

Round cap per feedback_gate_round_cap.md: two HOLDs on the same file means rule on the MODEL before
another point fix; cap point-fix rounds at ~3; report the round count to Dan past ~5. This is
round 1. Dispatch a fresh Sonnet fix lane, never the gate reviewer, and never an original implementer.
