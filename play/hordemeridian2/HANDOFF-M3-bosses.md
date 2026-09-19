# M3 Bosses handoff

## Done

- `hm2_bosses.js` (new, additive): pure data/helper module, no scene access.
  - `PHASE_THRESHOLDS = [0.66, 0.33]` gives every boss 3 phases (0/1/2) by
    hp fraction, escalation-only (never regresses on heal/crit noise).
  - `BOSS_META`: per-boss telegraph name, 3 phase names, and a `setpiece`
    (or `setpieceByPhase` for the Core) mapping to a real hm2_world.js
    terrain hook type (`asteroid_field`, `gravity_well`, `solar_flare`).
  - `setpieceFor(bossKey, phaseStage, ctx)`: calls `HM2_WORLD.featureHooks(type).spawn`
    (the real hook interface: spawn/collide/projectile/visibility, never an
    invented method) to build an arena set-piece descriptor: asteroid ring
    collapse (shrinking spread per phase), gravity well flip (sign inverts
    on odd phases), flare barrage (lane count scales with phase).
- `game.js` (39 insertions, 4 deletions, surgical):
  - `damage()`: region-boss and Core phase escalation now both route through
    `HM2_BOSSES.phaseForHpFrac`, giving region bosses the same 3-phase
    cadence as the Core (previously region bosses had only phase 0/1 at the
    50% threshold; Core already had 3). Falls back to the old inline math if
    `HM2_BOSSES` is absent, so this never hard-depends on the new file.
  - `bossPhaseChange()`: phase banner subtext now reads from
    `BOSS_META.phaseNames` per boss/phase instead of one hardcoded pair of
    strings; calls the new `triggerBossSetpiece()`.
  - `triggerBossSetpiece(e, bossMetaKey, phase)` (new method): reads
    `HM2_BOSSES.setpieceFor`, stores the descriptor on `e.setpiece`, and
    fires visible feedback (contactRing rings, a banner) via existing scene
    primitives only. No-ops silently if either module is missing.
- `index.html`: one new `<script src="hm2_bosses.js">` tag after
  `hm2_background.js`, before game.js loads.
- `hm2_boss_probe.mjs` (new): scripted gate for all 6 bosses.

## The 6th boss

hm_data.js `REGION_BOSSES` still has exactly 5 entries (proboscis-prime,
cinder-haematarch, glasswing-tyrant, null-proboscis, carrion-queen), one per
band region. The 6th, campaign-end boss is the PRE-EXISTING Meridian Core
(`spawn('boss', ...)`, mission 15 `finalBoss: { type: 'core' }`). It already
had 3 phases before this lane; this lane added its `BOSS_META` entry
(`setpieceByPhase: ['asteroid_field','gravity_well','solar_flare']`, one
distinct terrain hook per phase) and its phase-name telegraph strings. No new
boss enemy definition was needed and none was added to hm_data.js — the plan
brief's "final/campaign-end boss is the new one" is satisfied by giving the
Core the same 3-phase-plus-telegraph-plus-setpiece treatment as the region
bosses, not by adding a 6th REGION_BOSSES row (region bosses are one per band
region; there is no 6th band region to hang one on, and mission 15's
`finalBoss.type: 'core'` contract already names the Core as that slot).

Boss/level slotting confirmed unchanged: `levels/level5.js` and
`levels/level10.js` schedule region bosses via `regionBosses[]` (unmodified,
no wiring changes needed there), `levels/level15.js` schedules the Core via
`finalBoss` (unmodified). No level file edits were needed; the boss layer
reads `e.bossKey`/`e.regionBoss` set by the existing spawn path.

## Probe: `hm2_boss_probe.mjs`

Usage: `node hm2_boss_probe.mjs [url] [seed] [singleBossKey] [mutationFlag]`

- Seed is `Date.now() % 2147483647` unless passed explicitly, LOGGED as
  `SEED <n>` on stdout for reproducibility (mulberry32 PRNG). Used for the
  bot's approach angle; never a fixed angle list (M2's probe used 8
  hardcoded angles, which is exactly the mistake this lane's brief called
  out as a risk).
- Boots free-play (`pendingLevel = null`), drives the FIXED sector-steering
  bot copied from `hm2_campaign_probe.mjs` (writes `s.stick`, not
  `input.vx/vy`), then force-spawns each boss via the REAL debug hook
  (`debugState.forceRegionBoss` + `stepRegionBossSchedule()` for the 5
  region bosses, `spawnBoss()` for the Core) and asserts on REAL return
  values at every step:
  - the requested region actually activated (`s.run.regionBossActive`),
    not just "some" region boss
  - `bossRef.alive` is genuinely true before polling starts
  - all 3 phase stages (0, 1, 2) are observed via `b.phaseStage`
  - `b.setpiece` is non-null at least once, with its `type` read back
  - boss dies inside a 180s wall-clock budget
  - no new console errors (service worker scope noise excluded, matching
    the M2/M4a probes' existing exclusion)
- Damage is applied through `scene.damage(b, b.maxHp * 0.045, ...)` every
  400ms poll tick, i.e. the SAME method the player's weapons call, not a
  stub or a direct hp write, so the assertions exercise the real
  `damage()` -> `bossPhaseChange()` -> `triggerBossSetpiece()` path.

**GOTCHA found and fixed in the probe, not in game.js**: the pre-existing
debug hook `stepRegionBossSchedule()` keys `debugState.forceRegionBoss` off
the REGION key (`REGION_BOSS_BY_KEY[forced]`), not the boss key. The probe's
first draft passed boss keys (e.g. `'glasswing-tyrant'`) and every call
silently fell through to spawning whatever boss belonged to the player's
CURRENT region instead (all 5 runs landed `meridian-verge` regardless of
which boss was requested) — a real bug in the probe, caught by a
non-vacuous assertion (`correct boss region actually activated`) added
after the first run showed every boss reporting `active: meridian-verge`.
Fixed by mapping boss key -> region key in the probe
(`BOSS_TO_REGION`) before calling the hook. This pre-existing debug-hook
naming is unchanged in game.js; documented here so the next lane does not
rediscover it.

### Evidence, clean code

```
SEED 888727698 (first full run) / SEED 999 (reconfirm run)
41/41 assertions passed, exit 0, both seeds
```

All 6 bosses (proboscis-prime, cinder-haematarch, glasswing-tyrant,
null-proboscis, carrion-queen, boss/Core): died in 4-9s wall clock (well
under the 3 min budget; the 0.045 x maxHp / 400ms tick is a probe-driven DPS
floor, not a balance number), all 3 phases observed, arena set-piece fired
matching the declared type per boss (asteroid_field for proboscis-prime and
carrion-queen, solar_flare for cinder-haematarch, gravity_well for
glasswing-tyrant and null-proboscis, and gravity_well -> solar_flare rotation
observed for the Core across its phases). Zero new console errors.

### Mutation testing (against THIS lane's own M3 code, not just old bugs)

| # | Mutation | Target | Result |
|---|----------|--------|--------|
| 1 | `phaseForHpFrac` stubbed to `return currentStage \|\| 0` (phase never escalates) | hm2_bosses.js | Caught: `all 3 phases observed` FAILS, `arena set-piece fired` FAILS (setpiece only fires on a phase change). 4/6 assertions, exit 1. |
| 2 | `setpieceFor` stubbed to `return null` | hm2_bosses.js | Caught: `arena set-piece fired at least once` FAILS. 6/7, exit 1. |
| 3 | `triggerBossSetpiece` short-circuited with an early `return` before the HM2_BOSSES call | game.js | Caught: `arena set-piece fired at least once` FAILS. 6/7, exit 1. |
| 4 | `PHASE_THRESHOLDS` changed to `[0.01, -1]` (phase 2 unreachable, phase 1 nearly unreachable) | hm2_bosses.js | Caught: `all 3 phases observed` FAILS (`[0]` only), `arena set-piece fired` FAILS. 5/7, exit 1. |

All 4 mutations produced a non-zero exit. Files restored to the clean
pre-mutation state and re-verified (`diff` empty, `node --check` clean, full
41/41 re-run) before committing.

## Campaign regression

`hm2_campaign_probe.mjs` (M4a's existing gate, unmodified) launched against
this lane's code, 1 trial per mission, to confirm all 15 missions still
complete and no level was dropped by the validator (region bosses/finalBoss
schema untouched). See the commit log / next lane for the captured result if
this handoff was written before that background run finished; rerun with:

    python3 -m http.server 8791   # from play/hordemeridian2/ or repo root
    node /Users/lucille/ue-port-studio/aaa/harness/hm2_campaign_probe.mjs \
      http://127.0.0.1:8791/play/hordemeridian2/ /tmp/hm2_m3_shots 1

## Residuals

1. **fps at 300 enemies**: not independently re-measured in this lane (no
   scope, spawn cap, or per-frame loop touched). `bossPhaseChange` and
   `triggerBossSetpiece` fire only once per phase transition (3 times per
   boss lifetime), never per-frame, so no new steady-state cost was added.
   Worth a spot check in the fps harness used by M1/M2 if the next lane has
   budget.
2. **Region-boss telegraph descriptions vs setpiece descriptions**: the
   PRE-EXISTING `regionBossTelegraph` (game.js ~7742) fires its own
   boss-specific attack (latch, dive, refract, blink-mark, hatchery) on
   every attack cooldown, independent of the new phase-triggered setpiece.
   Both fire; they are additive, not exclusive, by design (telegraph = per
   attack, setpiece = per phase transition), but a future pass could cross
   reference telegraph timing against setpiece timing for spectacle pacing.
3. **`stepRegionBossSchedule` debug hook key mismatch** (documented above):
   pre-existing, not fixed in game.js because it's outside this lane's
   surgical-changes scope and the probe now routes around it correctly.
   Worth a one-line fix (`REGION_BOSS_BY_BOSS_KEY[forced] ? ... .region : ...`)
   in a future lane if the debug hook itself is ever surfaced to a human
   tester.
4. Probe's 400ms/0.045-maxHp damage tick is a synthetic DPS floor for gate
   speed, not a real balance number; it exercises `damage()`/`bossPhaseChange()`
   for real but says nothing about actual player-weapon time-to-kill on any
   boss. A real player-weapon DPS pass (like `hm2_arsenal_probe.mjs` from
   M1) would be the way to validate "3 minutes" against real play, not this
   gate's synthetic tick.
5. Orientation gate: per the M2 handoff, the Playwright `isMobile` viewport
   used here yields portrait without a forced-landscape context, so the
   orientation overlay is not exercised by this probe either. Not newly
   introduced; carried forward from M2's residual #2.

## Files touched (explicit paths, no `git add -A` used)

- `play/hordemeridian2/hm2_bosses.js` (new)
- `play/hordemeridian2/hm2_boss_probe.mjs` (new)
- `play/hordemeridian2/game.js` (modified)
- `play/hordemeridian2/index.html` (modified)
- `play/hordemeridian2/HANDOFF-M3-bosses.md` (this file)

## Commands

```
python3 -m http.server 8791   # serve repo root from the m3-bosses worktree
node play/hordemeridian2/hm2_boss_probe.mjs http://127.0.0.1:8791/play/hordemeridian2/
node /Users/lucille/ue-port-studio/aaa/harness/hm2_campaign_probe.mjs \
  http://127.0.0.1:8791/play/hordemeridian2/ /tmp/shots 1
```
