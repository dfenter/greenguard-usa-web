# HANDOFF M4 - Stages, cutscenes, risk events

Branch `hm2-m4`, base `e422a157` (M3 gated hash). NOT merged to main, NOT deployed.

**Status: RELEASE at gated hash `65a1a791`, round 6 of the M4 gate.**
The L10 campaign difficulty regression (R1) is FIXED and measured. The
adversarial Opus LOW gate returned RELEASE with no blocking findings.
Round 6 evidence is in "Round 6: the L10 regression, root cause and fix"
at the bottom of this file, which supersedes the old R1/R2 HOLD text.

## Done

- **Cutscenes** (`hm2_cutscene.js`, commit `75feaa74`). Declarative beats
  (pan, zoom, flyin, line, burst), intro cap 12s / outro cap 8s, max 2 visible
  lines sampled across the whole timeline, UPPERCASE speakers, em dashes
  rejected. Pure half is Phaser free and unit testable: `validateCutscene`,
  `planBeats`, `beatsAt`, `visibleLineCount`, `skipState`. Driver `playCutscene`
  degrades to immediate completion when Phaser or the atlas is missing.
  Hooked into `validateLevel` as an optional `cutscenes` key; the other 13
  levels have no key and validate exactly as before. Content on levels 1 and 15.
  Storage key `hm2_cutseen_<id>_<kind>`.
- **Risk events** (`hm2_events.js`, commit `5c880a73`; marker `87730dab`).
  `pickEvent`, `scheduleNext`, `stepOffer`, `resolveEvent`, `overclockMultiplier`,
  `isOverclockActive`, `resetEvents`. Distress beacon, overclock (30s double
  spawn, hooks the EXISTING spawn cadence multiplicatively), rival ace that drops
  a blueprint. Accept by flying within radius 46, decline by letting a 14s window
  expire. Works in classic and campaign, inert if the module is absent.
  On-field marker reuses `ring_thick` + `ic_lance`, no new atlas frames.
- **M3 follow-up closed** (commit `7a14ee85`). All 7 M3 enemies are now in
  `REGION_ENEMIES` wave pools and in levels 4-15, so they appear in normal play.
  Placement: mine-bomber -> ember-drift; gem-mimic -> crystal-shoals;
  wing-cutter, rift-strafer, nebula-burrower -> void-rift; wall-warden,
  xp-leech -> aurelion-graveyard. Meridian Verge keeps the classic roster per
  spec. Levels 1-3 untouched. No hp/speed/dmg/xp retuning was needed.
  LEVELS_SPEC.md documents the keys and restates the row-0 constraint.
- **M4 probe** (`hm2_m4_probe.mjs`, commit `f56e4c10`, hardened at `88e8bded`).
  54 assertions, exit 0.

## Gate

Separate adversarial Opus LOW agent. It found **three genuine vacuity holes** in
the M4 probe and fixed them probe-only in `88e8bded`:

1. `ACCEPT_RADIUS` and `OFFER_WINDOW` were read from the module under test and
   used to position the player relative to the very constant being checked, so
   the boundary tests self-adjusted. Mutating 46->200 and 14->60 both still gave
   50/50 exit 0. Now pinned to spec values.
2. The pools check iterated only levels that happened to register. Breaking
   level7's registration made it vanish and the probe still reported 50/50,
   silently checking 14 levels instead of 15. Now asserts the registered count
   matches the file count and ids 1..15 are all present.

This is the same self-adjusting-assertion class the implementer lane had already
caught once (cadence compared against the live `OFFER_INTERVAL` instead of a
hardcoded 90). **Three independent instances of one bug class in a single
milestone: the probe-writing guidance should call it out explicitly for M5.**

**VERDICT: HOLD. Rounds used: 3 of 3.** One blocker: the L10 regression (R1).
The gate independently reproduced bestiary 50/50, boss 54/54 and world exit 0,
verified the features are real in-browser at 390x844 (L1 intro holds ~6.8s and
tap-skips; L15 outro holds 6.5s while control level L2 reaches `over` in 250ms;
a risk event offer was accepted by flying onto the marker, setting
`overclockUntil:32.5`, `ocActive:true`), and confirmed no new em dashes, no
`setScale` below 1.0, `hm2_*` keys only, ES5 and `node --check` clean, HM1
untouched.

It reviewed `c8c658b0` adversarially and ruled it **legitimate, not
assertion-weakening**: it skips via the player's own tap path, and the gate
independently confirmed there is no deadlock. Minor note it raised: that
commit's `.catch(() => {})` swallows a timeout, so a genuine future deadlock
would surface only at the downstream `boots` assertion.

Its full mutation table, all against real source and reverted:

| Mutation | Before `88e8bded` | After |
|---|---|---|
| ACCEPT_RADIUS 46->200 | **exit 0 VACUOUS** | exit 1 |
| OFFER_WINDOW 14->60 | **exit 0 VACUOUS** | exit 1 |
| level7 deregistered | **exit 0 VACUOUS** | exit 1 |
| OFFER_INTERVAL 90->45 | exit 1 | exit 1 |
| OVERCLOCK_DURATION 30->5 | exit 1 | exit 1 |
| pickEvent no-repeat removed | exit 1 | exit 1 |
| planBeats stubbed to `[]` | exit 1 | exit 1 |
| wing-cutter key renamed | exit 1 | exit 1 |

A stubbed `planBeats` does fail, so `planBeats`/`beatsAt`/`visibleLineCount`
are genuinely exercised rather than merely present.

## Evidence (all on port 8796, server root verified each run)

| Check | Result |
|---|---|
| `hm2_world.test.mjs` | 24/24 |
| `hm2_m4_probe.mjs` | 54/54, exit 0 |
| world probe | exit 0, regions + luminance + fps floor within gate |
| bestiary probe seed 42 | **50/50**, exit 0 |
| boss probe seed 999 | **54/54**, exit 0 |
| campaign probe, 3 trials | **54/55, exit 1** (see R1) |
| campaign baseline at `e422a157` | 55/55, L1=140 L5=62 L10=54 L15=34 |

Bestiary 50/50 and boss 54/54 match M3's gated numbers exactly, so the pools
merge did not regress the M3 bestiary.

## Residuals and open items

### R1. BLOCKER: L10 campaign difficulty regression
The one failing assertion is `bot: missions 10 and 15 survive past the opening`,
**L10=21s (trials 26/21/11) against a baseline of 54s (trials 55/54/53)**.
This is NOT the known bimodal L5 bar from M2. L1, L5 and L15 are fine or improved
(L1 140->150, L5 62->78, L15 34->42).

Diagnosis, partially complete:
- At baseline the L10 bot ended at t~54s with hp INTACT (101/100/118), i.e. the
  run ENDED normally. It now dies at hp=0 by t~21s. The baseline 54s was never a
  survival limit, so the regression is larger than the medians suggest.
- A live trace shows hp=42 at t=5s with `strafer`, `burrower` and `formation`
  enemies already on the board, even though those keys only appear in level10
  rows at t=118 and t=190. The hot start seeds ~80 enemies at t=0 and appears to
  pull late-row keys in early (the known `seedHotStart` behavior: it ignores
  level row-0 pools).
- An **overclock risk event was active at t=5s**, doubling spawns during the hot
  start.
- The level10 wave edits themselves are only 3 keys added at t=118 and t=190,
  which cannot by themselves explain a death at t=21s.

**ROOT CAUSE (gate, round 3, supersedes the partial diagnosis above):** the
regression is not the wave rows and not primarily the risk event. It is
`REGION_ENEMIES['void-rift']` growing **3 -> 6** while every other region grew
by about 1. `game.js:5851 regionEnemyFor` sends roughly 46% of ambient spawns to
a **uniform** pick over that pool, so from t=0 about half of void-rift's ambient
spawns are new M3 enemies, including a ranged strafer and `nebula-burrower`
(dmg 20, the highest in that pool). This affects **levels 9, 10, 11 and 13**.

Fix by rebalancing the void-rift pool: weight the picks, or move 1-2 of the 3
additions to another region. Do NOT fix this by touching the probe. Note the
uniform-pick behavior means "number of keys in a region pool" is itself a
difficulty dial, which is worth stating in LEVELS_SPEC.md.

### R2. BUG: the first risk event fires at t=0, not t=90
`resetEvents` sets `lastOfferAt: -Infinity`, so in `scheduleNext` the guard
`now - last < OFFER_INTERVAL` is false at t=0 and an offer is scheduled on the
very first tick. The plan says "One offered every 90s". Combined with the hot
start this means an overclock can double spawns during the opening seed, which is
the most likely contributor to R1. Suggested fix: initialise `lastOfferAt` to 0
(or to `now` on reset) so the first offer lands at t=90. The M4 probe asserts the
90s CADENCE but not the FIRST offer time, which is why it passed: add that
assertion as part of the fix.

### R3. Gate commit carries a forbidden trailer
`88e8bded` ends with `Co-Authored-By: Claude Opus 5 (1M context)`. This project
forbids that trailer. Not amended here to avoid rewriting gate history mid-flight.

### R4. Not verified: risk events in live play
Cutscene reachability and skip ARE verified (L1 intro completes unaided in ~6s,
L15 in ~12s, tap-to-skip measured at 4ms). A risk event actually offering,
being accepted by flying into the marker, and resolving was NOT verified in a
live run. The unit-level behavior is covered by the probe.

### R5. Deviations from the plan
- Cutscene portraits reuse existing atlas frames tinted, rather than the
  6-frame atlas addition the plan calls for. No binary assets were added.
  Needs Dan's eye.
- Rival ace guards use the classic `lancer` key, not region variants.
- `M3_ENEMIES` / `M3_ENEMY_BY_KEY` exports were removed from hm_data.js after
  folding into `REGION_ENEMIES`; all keys remain reachable via
  `REGION_ENEMY_BY_KEY`.

### R6. Inherited, still open for Dan
- Region-boss phase model changed on shipped content in M3
  (`phaseForHpFrac` ignores `e.regionBoss`).
- M2's gate evidence does not reproduce at its own hash; L5 is bimodal
  (30-82s against a 45s bar). The M4 baseline shows the same noise: L1 trials
  spanned 52-149s. **The survival bars need more trials or re-tuning before
  they can carry a gate.**

## Probe CLI signatures (these are inconsistent and cost this lane three bad runs)

    node hm2_world_probe.mjs 8796 <outdir>                                    # PORT
    node hm2_bestiary_probe.mjs 8796 42                                       # PORT SEED
    node hm2_boss_probe.mjs "http://127.0.0.1:8796/play/hordemeridian2/" 999   # URL SEED
    node hm2_campaign_probe.mjs http://127.0.0.1:8796/play/hordemeridian2/ <dir> 3

**Mandatory before trusting ANY browser probe result**, because they fail
silently and plausibly against a stale tree:

    lsof -ti:<port> | head -1 | xargs -I{} lsof -p {} -a -d cwd -Fn | grep ^n
    curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:<port>/play/hordemeridian2/hm2_enemies.js

The cwd must be the hm2-m4 worktree and hm2_enemies.js must return 200. This lane
lost a cycle to port 8795 serving another session's `m3-base` tree: `game.js`
returned 200 so pages loaded, but every M4-era file 404'd, producing a convincing
fake regression (bestiary 22/50, boss 30/48, all 7 M3 enemies reporting
`defined:false`). M5 is on ports 8800-8809 and is exposed to the same trap.

Also note `hm2_campaign_probe.mjs` fast-forwards by assigning `s.run.time`, which
does NOT advance `scene.time.now`. Anything driven by the real scene clock (like
cutscenes) cannot be fast-forwarded that way; commit `c8c658b0` teaches the probe
to skip intros the way a player taps to skip.

## Commits

    75feaa74  add hm2_cutscene.js declarative intro/outro cutscene system
    5c880a73  add M4 risk events (distress beacon, overclock, rival ace)
    7a14ee85  fold M3 bestiary into wave pools and mid/late missions
    58e9dec3  merge hm2-m4-risk
    474d4377  merge hm2-m4-pools
    87730dab  draw on-field marker for active risk event offers
    f56e4c10  add M4 acceptance probe (cutscene + events + pools)
    c8c658b0  teach campaign probe to skip M4 intro cutscenes
    88e8bded  close three vacuity holes in the M4 probe (gate)

No gated hash is claimed: the campaign probe is red at 54/55 and the gate verdict
was not recorded. HM1 untouched.

---

# Round 6: the L10 regression, root cause and fix

**Gated hash `65a1a791`. Verdict RELEASE** from a separate adversarial Opus LOW
gate that wrote none of this code. Supersedes the R1/R2 HOLD above.

## The bisect (measured, 3 L10 bot-survival trials per commit)

    base e422a157   55/54/53   good
    75feaa74        55/54/54   cutscenes, good
    5c880a73        53/35/54   risk events, FIRST NONDETERMINISM
    7a14ee85         8/33/36   M3 enemies into REGION_ENEMIES, FIRST BAD
    head (pre-fix)  36/28/40

Two independent causes, not one:

**(A) Survival.** `regionEnemyFor`/`pickRegionEnemy` re-rolled roughly 54% of
ALL spawns out of the region pool while IGNORING the level row's authored
spawn table. So `nebula-burrower` (authored in `levels/level10.js` only at the
`at: 190` row; untargetable while burrowed, teleports within 60px, dmg 20)
reached L10 at t=7s and killed the bot.

**(B) Nondeterminism.** `stepRiskEvents` consumed the sim's seeded `srand()`
for marker placement, desynchronising the seeded stream from 5c880a73 on.

The three earlier hot-start weighting commits (`3d8c4e74`, `9cf1485b`,
`0c3134c5`) were treating a symptom. They remain; round 6 fixes the model.

## The fix (4 commits, all trailer-free)

    efe5a2f9  gate region enemy substitution to the active row pool
    deb567af  separate risk-event RNG from sim seeded srand
    886cceb4  row-gated substitution and events-RNG probe coverage
    65a1a791  replace campaign probe survival medians with deterministic metric

Game-code change is 3 hunks, 32 lines in game.js plus 6 in hm_data.js:

1. `currentRowPool()` helper + an intersection gate in `pickRegionEnemy`:
   substitution is limited to `REGION_ENEMIES[region]` INTERSECT the active
   row's authored pool. Empty intersection returns the fallback unchanged; a
   null row pool falls back to prior behavior so classic mode is unaffected.
   The authored spawn table is now authoritative.
2. `hotStartExclude: true` on nebula-burrower (hm_data.js:482) wired into the
   `hotStartPools` filter (game.js:3136). A generic data flag, NOT a
   burrower-specific branch. Note its `base` is `'weaver'`, so the existing
   `base === 'sapper'` test would NOT have caught it; a bare `sapper: true`
   would have been a silent no-op.
3. `resetEvents(seed)` builds a mulberry32 stream and `pickMarkerSide(re)`
   replaces the `srand()` marker draw, so risk events never touch the sim RNG.

The gate confirmed the fix is general, not special-cased: `nebula-burrower`
appears in game.js only inside a comment, and the gate is a plain intersection.

## Result: regression fixed

    L10 trial1: t=56s state=over hp=118
    L10 trial2: t=54s state=over hp=100
    L10 trial3: t=53s state=over hp=91

Median 54s against base `e422a157` 53-55. Every ending has hp>0, i.e. the bot
ran the clock out rather than being killed, which is the base-like behavior.
Bimodality is gone: spread 53-56 versus the 27-55 swing at `0c3134c5`, which
is the events-RNG fix showing up in measurement. Full medians L1=150, L5=64,
L10=54, L15=48.

Per Dan, survival medians are INFORMATIONAL ONLY and are no longer a gate. The
deterministic seeded metric added in `65a1a791` is the gate: for missions
1/5/10/15 it pins `performance.now()` and `Math.random()` to a synthetic clock
over the first 60 sim-seconds and asserts enemy spawn composition and damage
taken against hardcoded spec literals at `COUNT_TOL = 0`. Damage is
accumulated from `hurt()`'s synchronous before/after hp diff rather than
sampled hp, because Warden shield regen would void sampled assertions. The L10
literal contains no `nebula-burrower`, which is the fix's direct signature.

## Evidence at HEAD

    hm2_m4_probe.mjs      74 assertions, 0 failed, exit 0
    hm2_world.test.mjs    24 cases, 0 failures
    world probe (8796)    exit 0
    bestiary 42           50/50, exit 0
    boss 999              54/54, exit 0
    campaign 3 trials     55/55, exit 0 (at 886cceb4, pre-metric)
    deterministic metric  64/64 exit 0 per 65a1a791's body (see residual 2)

## Mutation tables

Orchestrator, re-run independently (not taken on the lanes' word):

| Mutation | Exit | Observed |
|---|---|---|
| `rowPool = null` | 1 | 816/5000 burrower draws leak |
| restore `srand()` marker draw | 1 | Math.imul delta=2 |
| drop `resetEvents` seed arg | **0** | coverage gap, see residual 1 |

Gate, independent, each reverted with the tree confirmed clean after:

| # | Mutation | Exit |
|---|---|---|
| M1 | `rowPool = null` | 1 |
| M2 | restore `srand()` marker draw | 1 |
| M3 | drop `hotStartExclude` from filter | 1 |
| M4 | `resetEvents()` seed dropped | **0** |
| M5 | empty intersection falls open to `choices` | 1 |
| M6 | drop `hotStartExclude` from hm_data.js | 1 |

Metric lane's own table in `65a1a791`: 7 M3 weights 0.15->1 exit 1 (60/64);
seedHotStart timeSec pinned 999 exit 1 (58/64); hotStartPools weakened to
apex-only exit 1 (62/64).

Anti-vacuity: both new probe checks carry positive counterparts (a
blink-stalker row MUST still produce hits; the marker MUST actually be placed
on the measured tick), so neither can pass by the feature being dead. Spec
literals are hand-computed or hand-copied, never read back from the module
under test. This matters because M4 produced five separate
self-adjusting-assertion bugs across earlier rounds.

## Residuals for Dan (none blocking)

1. **Events-RNG coverage gap (real, worth a follow-up).** Dropping the seed
   argument from `resetEvents()` leaves risk events on `Math.random()` and the
   probe STILL passes. Found by the gate, independently reproduced by the
   orchestrator: exit 0, 74/74. The probe proves the sim's `srand()` is
   untouched (imul delta 0) but nothing pins the event stream as actually
   SEEDED. The desync root cause is fixed either way, so this is a missing
   assertion, not a broken fix, but reproducibility under a fixed seed is
   currently unasserted. Add an assertion that two `resetEvents(seed)` streams
   with the same seed agree and differ from an unseeded one.
2. **Campaign/metric probe not verified by the gate.** Three attempts hit
   puppeteer 45s boot timeouts at `newPage`, caused by concurrent runs of the
   same probe starving it, NOT by assertion failures. The 64/64 figure comes
   from the metric lane's commit body plus an orchestrator confirmation run
   that was still in flight at handoff time. Re-run once the machine is quiet.
3. **Historical Co-Authored-By trailers.** `88e8bded`, `553c02c2`, `f027e62a`
   carry the trailer. Per Dan's option (a) these are an ACCEPTED RESIDUAL: no
   history rewrite, no force-push, enforcement is going-forward only. A
   rewrite back to `f027e62a^` would rewrite 102 commits of shared pushed
   history across portal, sparkbridge and razorfin and break other worktrees.
   All four round-6 commits are trailer-free, carry the `hordemeridian2: `
   prefix, and add no em dashes (gate-verified).
4. **`__MISSING ebolt` texture warning** produces `errs=1` in campaign logs and
   appears in the world probe. Confirmed PRE-EXISTING: `git log -S ebolt`
   dates it to M3 commit `8cd07660`, before round 6. The probe's own "no
   console errors" assertion passes.
5. **`65a1a791`'s commit body ends with a stray `EOF\n)` heredoc artifact.**
   Cosmetic only.
6. `/tmp/m5_camp.log` contains a `BOT MEDIANS` line showing L10 26/50/29. It is
   an M5 run, NOT round 6: zero matches for `currentRowPool|deterministic|
   Phase 4`, and it reports 52/55 assertions where round 6 gives 55/55. Not
   evidence against this fix.

## Carried forward from earlier rounds

- Agent type `lane` is NOT registered despite `~/.claude/agents/lane.md`
  existing; spawning it errors. Use `general-purpose` with an explicit
  no-Monitor / cd-to-worktree paragraph.
- `var timeSec = this.run ? this.run.time : 0;` appears TWICE in game.js
  (~3148 `seedSecondWave`, ~3173 `seedHotStart`). A first-match sed mutates the
  wrong function and the probe correctly still passes: that is a TRUE
  NEGATIVE, not a probe hole. Anchor substitutions on the enclosing signature.
- Probe signatures: world and bestiary take a PORT; boss takes URL then SEED;
  campaign takes URL, shot dir, trial count. The campaign probe runs well over
  600s; always background it.

NOT merged to main. NOT deployed. Dan deploys from the gated hash.
