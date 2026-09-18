# Orchestrator finding: total coin sink and the level/shark competition

Computed directly from data.js (global RFD), 2026-09-17.

## Levels are coin-gated from the same wallet as sharks
All 12 levels exist. 11 are gated on raw coins, 1 on a score:

  hawaii       coins 0          (free)
  mexico       coins 4,000
  belize       coins 9,000
  maldives     coins 16,000
  newzealand   coins 26,000
  alaska       coins 40,000
  tahiti       coins 58,000
  azores       coins 80,000
  bali         coins 105,000
  aruba        coins 135,000
  jamaica      coins 170,000
  california   score 8,000 on jamaica

Level gating is a clean, smoothly rising curve and is well designed in isolation.

## The problem: one wallet, two sinks, never reconciled
  all 11 coin-gated levels      643,000 coins
  all 86 sharks              6,693,350 coins
  GRAND TOTAL                7,336,350 coins

Levels and sharks draw on the SAME coin pool, and nothing in the progression
design appears to account for that. The economy lane estimated roughly 12 coins
per creature with 25 to 60 eats per run, so a strong run is on the order of a
few hundred to about a thousand coins. Against a 7.3M total sink that is a very
long tail.

The sharper issue is the mid-game squeeze rather than the total. Tiers 1 to 3
sharks cost 6,650 combined, less than the second level gate (belize, 9,000).
So early on the player can buy most of the cheap roster, then hits a stretch
where every new level AND every meaningful shark upgrade competes for the same
slowly accumulating coins. That is exactly the "wall-like feel entering the back
half" the economy lane described, and this is a plausible mechanical cause for
it that the lane did not identify.

## Recommendation
Worth putting to Dan as a design question: should level unlocks use a separate
currency or a score/progress gate (as california already does) so that exploring
new water does not directly compete with growing your shark? california is the
only level not gated on coins, and it is the one gate that does not tax the
shark budget.

Status: arithmetic is verified against data.js. The coins-per-run figure is the
economy lane's ESTIMATE, not a measured number, so the time-to-unlock conclusion
inherits that uncertainty. Measuring real coins per run needs the harness that
does not currently exist.

## Follow-up: coin SOURCES checked, the framing survives
I initially only summed sinks. Checked the sources in meta.js and data.js:

  RFD.ECON.coinRunMult    = 1     (no global run multiplier)
  RFD.ECON.dailyBonusMult = 1.5   (first run of each local day only)
  COIN_CAP                = 1e12  (not a constraint)

meta.js:971 computes coinsEarned = floor(rawCoins * coinMult * dailyBonus).
With coinRunMult at 1 there is no hidden generosity. The only amplifier is a
1.5x bonus on the first run of each calendar day (meta.js:967, 969-973), which
rewards returning daily but does little for a long session. So the 7.3M sink
stands essentially un-softened.

## A THIRD sink I missed on the first pass
RFD.ECON.upgradeCosts = {base 400, growth 1.7, levels 5, tierMult 0.6}. Stat
upgrades are a separate coin drain layered on top of levels and sharks, with
1.7x geometric growth over 5 levels per stat. That makes the wallet contention
worse than my original two-way framing, not better.

Net: sources are not generous, and there are three competing sinks (levels,
sharks, stat upgrades) rather than two. Still an estimate on the income side,
since real coins per run remains unmeasured without a harness.

## Upgrade sink, quantified
Per stat, 5 levels at base 400 with 1.7x growth:
  400, 680, 1,156, 1,965, 3,341  = 7,542 per stat
Four upgradable stats (bite, speed, boost, power) = 30,168 coins to fully
upgrade ONE shark at the base tier. tierMult 0.6 scales this upward per tier,
so fully upgrading a high-tier shark costs substantially more.

For scale: fully upgrading a single base-tier shark (30,168) costs more than the
first FOUR level unlocks combined (4,000 + 9,000 + 16,000 + 26,000 = 55,000 is
the first four, so it is comparable to roughly three of them). A player who
invests in upgrading the shark they like is directly buying fewer levels.
That is the wallet contention made concrete.

## Tier shape, verified (confirms the economy lane's "lumpy tiers")
RFD.ECONOMY.tierUnlockLevel gates tiers on player LEVEL; cost gates on coins.

  tier   lvlReq   sharks   coin cost range
   1       1        3      0 to 300
   2       3        2      600 to 800
   3       6        3      1,400 to 1,800
   4      10        3      3,000 to 3,800
   5      15        2      7,000 to 7,500
   6      21        3      13,000 to 15,000
   7      27       10      22,000 to 25,000
   8      33       10      34,000 to 36,000
   9      40       25      50,000 to 162,000
  10      47       17      70,000 to 185,000
  11      54        4      95,000 (flat)
  12      60        4      150,000 to 222,000

Tiers 1 to 6 hold 16 sharks across 0 to 15,000, a tight and fast-moving band.
Tiers 9 and 10 alone hold 42 of 86 sharks (49 percent) spread across 50,000 to
185,000. The roster is heavily back-loaded into exactly the stretch where coins
are scarcest and the level and upgrade sinks are competing hardest.

Tier 11 is the odd one: 4 sharks all priced identically at 95,000, and it sits
BELOW the top of tier 9 (162,000) and tier 10 (185,000). So progressing a tier
can cost less than finishing the previous one, which muddles the sense that
price tracks power. Worth a look.

---
# GATE RULING: arithmetic upheld, causal claim OVERREACHES

The Opus gate reproduced all five figures exactly and upheld the arithmetic.
It ruled against my causal framing, and I accept the ruling. Three reasons:

1. I summed SINKS without measuring SOURCES. meta.js:685 funnels
   frenzy-completion, daily-bonus and mission rewards into the same wallet and
   none of it is counted here. 7.3M is uninterpretable without a measured
   coins-per-run figure, which no one has because the harness was missing.
2. My HSE comparison undercuts rather than supports me. HSE gates map areas on
   shark SIZE, which IS a progress gate. Competing sinks produce a progress gate
   emergently, so the comparison argues the design is normal for the genre.
3. The regions do not line up. The economy lane put its wall at tiers 7 to 9
   (22k to 50k), while the level curve only steepens at bali, aruba and jamaica
   (105k to 170k). Level competition is therefore poorly positioned to explain
   the wall the lane actually observed.

Revised status: publish the arithmetic as fact, and put the design question to
Dan neutrally as "are competing sinks intended", rather than asserting it causes
the mid-game wall.
