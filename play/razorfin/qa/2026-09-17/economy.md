# Coins-per-run measurement, ranked fix 8 (2026-09-17)

## Method: simulation, not live measurement

I attempted a live headless run first. `qa/2026-09-17/harness/plainload.mjs` +
`qaserve.mjs` do load the real game correctly (per the harness README's
resolved root-cause note: serve from the worktree root, request
`/play/razorfin/` with the trailing slash). But none of the harness scripts
named in the QA brief for actually PLAYING a run (`verify.js`, `playprobe.js`,
`diveprobe.js`, `orientprobe.js`, `memprobe.js`) exist, and building a new
puppeteer script that plays 15 honest runs against a real 3D scene with real
AI-driven prey/predators, chases, misses, and deaths is not a surgical/low-
effort task for this wave. So per the brief's explicit fallback, this is a
**deterministic simulation against the real economy constants in data.js**,
not a live measurement. Do not read the numbers below as ground truth; read
them as a first honest estimate with clearly stated assumptions.

Script: `qa/2026-09-17/economy_sim.cjs`. It loads the real `SHARKS`,
`CREATURES`, and `FRENZY` tables out of `data.js` (same file the gate
verified the 643,000 / 6,693,350 / 7,336,350 totals against) and re-implements
the exact formulas read out of `game.js`:
- Hunger drain: `stepHunger()`, `p.hp -= p.stat.metab * liveMult(p,'metab') * STEP`
  (`STEP = 1/60`). I did NOT model the 3x pressure-zone drain penalty; see
  limitations.
- Eat payout: `swallow()`, `ctx.run.coins += Math.round(coins * comboMult * goldRushMult)`,
  HP refill `+= 6 + tier*3.2`.
- Combo: `comboMult()` off `FRENZY.steps [3,6,10]` / `FRENZY.mults [1,2,3,5]`,
  window `FRENZY.comboWindow = 3.0s`.
- Gold Rush: `FRENZY.meterPerEat = 0.06` per eat (so it triggers roughly every
  17 eats), `goldRushDur = 8s`, `goldRushCoinMult = 2`. This is real game
  behavior, included automatically, not manually maximized.

## Definition of "honest play" used here, and its limits

- The simulated player always eats the nearest edible prey (tier <= player
  tier, weighted equally across the 4 tiers below and including the player's
  own tier) at a fixed **2.2 second interval per swallow**. This interval is
  an ASSUMPTION, not measured, and is the single largest source of
  uncertainty in every number below. It was chosen as a plausible chase-and-
  bite cadence (bite cooldown alone is 0.25s; 2.2s allows for travel and
  missed approaches between kills) but nothing in this wave verified it
  against real play.
- Pack prey (packMin-packMax, see `SPEC3D.md` 9.4) spawns multiple swallows
  in a row, matching how a real school eat plays out and how it feeds the
  combo chain.
- The run does NOT model: being eaten by a bigger predator, mines, jellyfish,
  chase failures/misses, or the 3x hunger-drain penalty for diving below your
  pressure-safe zone. All of these push real coins-per-run DOWN relative to
  this estimate, so treat the numbers below as an upper-bound-leaning
  estimate of an actively-hunting, safe-zone, never-dies run, not an average
  real run.
- Finding worth flagging on its own: at this eat cadence, HP refill from
  eating (6 + preyTier*3.2 per swallow) outpaces hunger drain at every tier
  tested, so the simulated shark never starves. A real run instead ends by
  predator kill, hazard, or the player quitting, none of which this
  simulation models. I substituted a fixed 5-minute session length (300s) as
  a plausible mobile play-session bound, NOT a measured or design value.
  Runs-to-unlock below are therefore per 5-minute session, not per "life."

## Coins per run: 5 samples each, tiers 1, 4, 8

Representative shark = cheapest/first-reachable shark at that tier (`reef`
tier 1 cost 0, `tiger` tier 4 cost 3000, `vex` tier 8 cost 34000), matching
what a player who just unlocked the tier would actually be playing.

| Tier | Shark | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 | Mean | Spread (min-max) |
|------|-------|-------|-------|-------|-------|-------|------|-------------------|
| 1 | reef | 12175 | 11640 | 12255 | 11966 | 11959 | 11999 | 11640-12255 (615) |
| 4 | tiger | 14968 | 14206 | 14048 | 18016 | 13151 | 14878 | 13151-18016 (4865) |
| 8 | vex | 19336 | 19330 | 22525 | 22615 | 23367 | 21435 | 19330-23367 (4037) |

All 5 runs per tier are 300s (5-minute session) since none starved before the
session cap; the spread comes entirely from RNG on which prey/pack sizes get
eaten and where combo/Gold Rush timing lands, not from run length variance.

This lands inside, but toward the low end of, the QA report's unmeasured
420-1,008 per-run range only if that range meant something much shorter than
a 5-minute session (e.g. per-life at a few dozen seconds). Reconciling the
two would need the actual session/life-length definition the original
420-1,008 estimate used, which this wave did not find documented anywhere.

## Runs-to-unlock (5-minute sessions, using real tier prices from `SHARKS`)

Next-tier unlock (cheapest shark at tier+1):

| From tier | Mean coins/run | Next tier shark | Price | Runs to unlock |
|-----------|-----------------|------------------|-------|-----------------|
| 1 | 11999 | mako (t2) | 600 | 0.1 |
| 4 | 14878 | greatwhite (t5) | 7000 | 0.5 |
| 8 | 21435 | ironfin (t9) | 50000 | 2.3 |

Full-tier roster completion (most expensive shark still in the same tier):

| Tier | Mean coins/run | Max-cost shark in tier | Price | Runs to complete tier |
|------|-----------------|--------------------------|-------|-------------------------|
| 1 | 11999 | (tier 1 max) | 300 | 0.0 |
| 4 | 14878 | (tier 4 max) | 3800 | 0.3 |
| 8 | 21435 | (tier 8 max) | 36000 | 1.7 |

Level unlocks (context reused from the gate, not recomputed): 11 coin-gated
levels total 643,000 coins; the highest single level gate is Jamaica at
170,000. At tier-1 pace (11999/run) that alone is ~14.2 runs; at tier-8 pace
(21435/run) it is ~7.9 runs. Neither exceeds 25.

## Flag: none of the measured tiers exceed 25 runs-to-unlock

Every runs-to-unlock figure computed above, for both next-shark-tier and
full-tier-roster targets, is under 3 runs. Even the single largest coin sink
identified by the gate (Jamaica's 170,000-coin level unlock) comes in under 15
runs at any tested tier's pace. **Nothing here crosses the 25-run flag
threshold**, so there is no design-question flag to raise from this
particular measurement.

This does NOT resolve the QA report's broader "one wallet, three competing
sinks" question (levels 643,000 + sharks 6,693,350 + stat upgrades ~30,000/
shark = 7,336,350 total). That figure describes exhausting the ENTIRE
economy, not the next unlock, and this wave did not attempt to simulate a
multi-hour completionist grind. It remains an open question for the owner,
per `QA-REPORT.md`, whether that grand total is intended.

## Honesty about confidence

Low-to-moderate confidence. This is a same-formula simulation, not gameplay,
built on one unverified parameter (2.2s eat interval) that directly scales
every coin figure linearly. The direction of the finding (unlocks are fast,
not slow) is likely robust to that assumption being off by 2x in either
direction, since even doubling the interval (halving coins/run) keeps every
figure above under 6 runs. The absolute coins-per-run numbers themselves
should not be treated as validated; they are a documented starting estimate,
not a QA gate result.
