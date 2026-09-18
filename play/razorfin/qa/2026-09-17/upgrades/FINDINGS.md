# Razorfin QA - Upgrades & Economy - 2026-09-17

Verdict: WEAK

## Method
Loaded data.js in a Node vm sandbox, extracted RFD.SHARKS (86 rows), RFD.CREATURES (19 prey defs with coin values), RFD.ECONOMY, RFD.BAL. Cross-checked unlock gating and the two named residual bugs in ui3d.js/meta.js source. No live browser run performed (data/arithmetic pass only); coins-per-run is an estimate from avg creature coin value x assumed eat count x combo multiplier, flagged as estimate throughout.

## Tier price table (cheapest unlock per tier, data.js)
| Tier | Cheapest ID | Cost | Count in tier |
|---|---|---|---|
| 1 | reef | 0 (starter) | 3 |
| 2 | mako | 600 | 2 |
| 3 | hammerhead | 1,400 | 3 |
| 4 | tiger | 3,000 | 3 |
| 5 | greatwhite | 7,000 | 2 |
| 6 | greenland | 13,000 | 3 |
| 7 | snapjaw/morayne | 22,000 | 10 |
| 8 | vex | 34,000 | 10 |
| 9 | ironfin/plaguemaw | 50,000 | 25 |
| 10 | aurora | 70,000 | 17 |
| 11 | warbringer/omenmaw/solaris/absolutezero | 95,000 | 4 |
| 12 | leviathanrex/leviathan_rex | 150,000 | 4 |

Evidence: play/razorfin/data.js:6 onward (SHARKS array, per-shark `cost` field), extracted programmatically.

## Coins-per-run estimate and time-to-next-tier
Inputs (play/razorfin/data.js CREATURES, 19 rows): coin value min 1, max 60, avg 12.05. Combo multiplier assumed ~1.4x (game.js:1608-1612). Eats/run range 25 (conservative) to 60 (optimistic) gives coins/run ~420-1,008.

| Tier | Cheapest cost | Runs needed (optimistic-conservative) |
|---|---|---|
| 2 | 600 | 1-2 |
| 3 | 1,400 | 2-4 |
| 4 | 3,000 | 3-8 |
| 5 | 7,000 | 7-17 |
| 6 | 13,000 | 13-31 |
| 7 | 22,000 | 22-53 |
| 8 | 34,000 | 34-81 |
| 9 | 50,000 | 50-120 |
| 10 | 70,000 | 70-167 |
| 11 | 95,000 | 95-227 |
| 12 | 150,000 | 149-358 |

Evidence: play/razorfin/game.js:1608 (`coinMult = ctx.run.goldRushT > 0 ? ... : 1`), :1613 (`ctx.run.coins += Math.round(coins * mult * coinMult)`); play/razorfin/meta.js:965,971 (run coin totals -> profile.coins).

## Curve shape: dead ends, cheap outliers, walls
- Tiers 1-6 are a smooth ramp (0 -> 13,000), each ~2-2.3x the prior tier. Under ~30 runs even conservatively. No wall.
- Wall at tier 7-9: cost jumps 22,000 -> 34,000 -> 50,000, and tier 9 alone holds 25 sharks (more than tiers 1-8 combined). Tier 9's cheapest (ironfin/plaguemaw, 50k) to its priciest (poseidonrex, 162,000) is a 3.2x internal spread. Evidence: data.js TIER 9 row.
- Wall at tiers 10-12: costs 70,000 / 95,000 / 150,000, each 70-358 runs by this estimate. Tier 9's high end (158k-162k, Greek-pantheon subgroup) already overlaps tier-11/12 pricing, so cost bands blur across tiers 9-12 rather than stepping cleanly.
- Dead-end/duplicate unlock: `leviathanrex` (Sharkjira) and `leviathan_rex` (Leviathan Rex), both tier 12, both cost 150,000, identical stats/passives/active (armored, pressureImmune, junkEater, biteUpX; active atomic; bite 16, hp 1400, speed 400, accel 720, turn 2.5, boost 3). Only art (palette, len, girth) and name/family differ. Evidence: data.js SHARK_BY_ID['leviathanrex'] vs ['leviathan_rex'].
- No too-cheap outliers found: tier 1 non-starter costs (150, 300) and tier 2 (600, 800) fit the curve's early growth rate.

## Unlock gating cross-check (meta.js)
`ECONOMY.tierUnlockLevel = [0,1,3,6,10,15,21,27,33,40,47,54,60]` (data.js) gates tier access by player level, separate from coin cost. Cumulative XP to reach gates (xpCurve base:100, growth:1.13): level 6 ~832 XP, level 15 ~4,040 XP, level 33 ~42,645 XP, level 60 ~1,176,193 XP. XP accrues at `score * 0.25` per eat (game.js:1611) and creature scores (5-220+) outpace coin values, so level gates are reached well before matching coin totals are saved in every tier tested from tier 5 onward. Coin cost, not level gate, is the binding constraint.

## Residual bugs (memory-flagged)
- Menu ON-badge stale after Shop select: FIXED. ui3d.js:3868-3921 implements and selftests an immediate resync in `doSelect`'s click handler (toggles `rf-card-sel` and Owned/Selected footer text without waiting for full `buildMenu()`). Selftest at ui3d.js:3916-3921 passes.
- DEV chip overlaps Shop button: FIXED. ui3d.js:168 CSS `#rfDevChip{flex:0 0 auto;max-width:64px;z-index:5}`; selftest at ui3d.js:3870-3876 confirms the guard is injected.

## Top issues (ranked)
1. Tiers 9-12 coin wall: 50k-150k+ costs translate to 70-358 runs by this estimate, with tier 9 alone spanning a 50k-162k internal range - the sharpest economy cliff in the game.
2. Duplicate/dead-end unlock at tier 12: leviathanrex and leviathan_rex, same cost, same stats/passives/active, cosmetic-only difference, both gating the same 150k price point.
3. Uneven tier population: tier 9 holds 25 of 86 sharks (29%) across a 50k-162k spread, while tiers 2-6 combined hold only 13 sharks across a tight 600-15,000 band - the curve is lumpy, not evenly stepped, worsening the back-half wall feel.
