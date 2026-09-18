# Adversarial Gate, Razorfin QA, 2026-09-17

Role: independent re-check. I produced none of the evidence below that I did not
re-run myself. Read-only, no product code changed. Probes written this pass live
in `play/razorfin/scratchpad/gate_*.mjs`.

Headline: the pass was honest about its limits but wrong on two of its three
flagship numbers, and it missed the most visible problem in the build. The most
consequential finding is new and was confirmed independently twice: **54 of 86
sharks (63%) render a two-letter monogram instead of art in the roster menu**,
including every tier-11 and tier-12 shark. This is intended texture-budget
behaviour rather than a code defect, but it is not acceptable as shipped.

---

## 1. Controls: OVERCLAIMED (central claim is materially wrong)

The lane's central claim, which "drives the top fix", is that the stick feeds a
capped pursuit law rather than direct velocity, and is therefore "materially
slower" than horde-meridian. The three constants it cites are real. The
conclusion drawn from them is not.

Constants verified (`engine3d.js:184-203`): `CTL_STICK_TARGET_CSS=400`,
`CTL_PURSUIT_FULL_CSS=60`, `CTL_PURSUIT_TURN_RATE=18`, `CTL_ACCEL_MULT=8`.
The lane read these correctly.

What the lane missed is `engine3d.js:2147`:

    if (stickMode && !haveKey) mag = ctl.stickMag;

Throttle in stick mode is **a direct override, taken straight from ring
deflection** (`ctl.stickMag`, computed at :2085 as
`clamp((slen-DEAD)/(RADIUS-DEAD),0,1)`). It is not derived from the 400px
virtual-target distance. The 400px target is used for *heading only*, and is
set deliberately far so `distCss` always exceeds `CTL_PURSUIT_FULL_CSS=60` and
the arrive-spring branch (:2226) can never engage while the stick is held. So
the stick path is:

- heading: turn toward the ring direction at 18 rad/s
- throttle: `speedCap * stickMag`, deflection-proportional, identical in shape
  to horde-meridian's `sp = p.speed * min(1,len)` at `horde-meridian/game.js:5652`

The genuine difference versus horde-meridian is narrower than claimed, and is
one axis, not two:

| | horde-meridian | razorfin |
|---|---|---|
| throttle | `dx/max` direct | `stickMag` direct (**same**) |
| heading | `p.face = atan2(dy,dx)`, instant | 18 rad/s slew |
| velocity | `p.vx = tx` instant | approach at `8*speedCap`/s |

Quantified: at 18 rad/s a 180-degree reversal takes ~175ms, and a typical
90-degree turn ~87ms. The accel ramp reaches full speed in 1/8s = 125ms. Those
are real but small, and horde-meridian is a twin-stick top-down shooter where
instant reversal is correct; Razorfin is a momentum-carrying swimming game where
a shark that reverses instantly would read wrong. Note also
`CTL_PURSUIT_TURN_RATE=18` is explicitly checked against a documented
SPEC3D 8.2 floor of 14 rad/s (`engine3d.js:5280`), i.e. this is a contract value,
not an accident.

**Ruling: the claim "it contradicts the direct-velocity fleet criterion" is half
true (heading only, not throttle) and the claim "materially slower" is
unsupported.** No measurement of playfeel was taken by the lane or by me. The
lane ranked this its #1 fix; on this evidence it does not warrant that rank, and
"fix" here would mean reverting a deliberate, documented, contract-gated
response to a prior owner complaint. Demoted in the merged list below.

Upheld from this lane: ring geometry (radius 62, recenter 1.35x) matches
horde-meridian exactly. Breach/boost/bite constants verified as quoted.

**Safe-area gap: UPHELD.** `env(safe-area-inset-*)` appears only at
`index.html:32-35` as CSS vars for HUD panels. No gating on the touch-anchor
path. This is a real, cheap, un-caveated fix and I have promoted it above the
drive-law item.

## 2. Fun: CORRECTED (right defect, wrong numbers, undercounted)

The lane reports 9 sharks with "luminance > 0.85, saturation < 0.25" and prints
a table. I recomputed from `data.js` directly. Two problems.

**(a) The lane mixed two colour models.** Its "lum" column is HSL lightness but
its "sat" column is HSV saturation. Under consistent HSL, every one of those
colours has saturation 1.00 (they are light tints of fully-saturated hues), and
the stated filter `sat<0.25` would match exactly one shark. Under consistent
HSV, the lightness figures change. The printed table is not reproducible under
either model alone:

| shark | printed lum / sat | HSL L / HSL S | HSV S |
|---|---|---|---|
| hermesdart | 0.96 / 0.23 | 0.88 / 1.00 | 0.23 |
| bonecrown | 0.94 / 0.23 | 0.88 / 1.00 | 0.23 |
| glacier | 0.90 / 0.23 | 0.88 / 1.00 | 0.23 |
| artemisstrike | 0.91 / 0.25 | 0.88 / 1.00 | 0.25 |

**(b) Under the lane's own mixed metric the count is 11, not 9.** It missed
`cyclopseye` (#D9C8FF, L 0.89, S 0.22) and `aphroditelure` (#FFC4E8, L 0.88,
S 0.23). Full corrected list, HSL-lightness > 0.85 and HSV-saturation < 0.25:

    mirrorscale   #FFFFFF  L 1.00  S 0.00  t9   <- pure white
    voltaicrex    #F0F8FF  L 0.97  S 0.06  t10
    teslafang     #E8F4FF  L 0.95  S 0.09  t9
    absolutezero  #E0F8FF  L 0.94  S 0.12  t11
    banshee       #D4F0FF  L 0.92  S 0.17  t10
    cyclopseye    #D9C8FF  L 0.89  S 0.22  t9   <- MISSED by lane
    glacier       #C4ECFF  L 0.88  S 0.23  t9
    bonecrown     #FFF0C4  L 0.88  S 0.23  t9
    hermesdart    #FFF6C4  L 0.88  S 0.23  t9
    aphroditelure #FFC4E8  L 0.88  S 0.23  t9   <- MISSED by lane
    artemisstrike #C0F0FF  L 0.88  S 0.25  t9

**Is the threshold cherry-picked?** Largely no. Sensitivity sweep: L>0.85/S<0.25
gives 11; L>0.80/S<0.25 also 11; L>0.75/S<0.25 also 11. The count is flat across
a wide lightness band, so the finding is not an artifact of where the line was
drawn. It *is* sensitive on the saturation axis (S<0.20 gives 5, S<0.30 gives
12). So the honest statement is "roughly 11 glows, with about 5 egregious",
rather than a hard 9. `mirrorscale` at pure #FFFFFF is indefensible on any
threshold and should be fixed regardless.

Everything else in the fun lane is self-declared opinion from stale imagery, and
is correctly caveated. It should not be treated as evidence either way.

## 3. Playability: UPHELD, and the perf number is real

I re-ran `perfprobe.mjs` under 4x throttle myself: p50 16.70ms, **p95 166.7ms**
(lane reported 166.6), max 216.7ms. Reproduces.

I was asked to be skeptical about SwiftShader artifacting, so I wrote
`gate_perf2.mjs` to bucket frame deltas into multiples of 16.7ms. The
distribution is decisively **bimodal, not a smooth degradation**:

    1x 16.7ms : 85 frames    <- on budget
    2x        :  3
    8x        :  2
    9x        : 15           <- stall cluster
    10x       :  9
    11x       :  7
    12x       :  3
    16x       :  1

If this were a SwiftShader rasterisation artifact you would expect frame times
smeared broadly upward as fill cost rose. Instead ~68% of frames hit vsync
exactly and the remainder cluster at 8-12 missed vsyncs, which is the signature
of **discrete blocking work on the main thread** (GC, a large synchronous
allocation, or a shader/asset compile), amplified by the 4x throttle. That
mechanism transfers to real mobile hardware; SwiftShader fill cost would not.

**Ruling: the p95 is a real signal and the lane's WEAK rating is correct, and if
anything under-stated.** Caveat retained: 4x CDP throttle is a proxy, not a
device, and the absolute 166ms figure should not be quoted as a device number.
Worth noting the lane's own WEAK label is the most honest verdict in the pass.

Selftests: I re-ran the full 8-module command. Reproduces exactly
(world 380, game 394, art3d 31, fish 8, fx 0, ui 239, meta 192, abilities 0, all
pass=true, fail=0). Fault-injection stderr lines appear as expected.

**Orchestrator correction (b) on fx/abilities: VERIFIED CORRECT.** `fx3d.js`
returns a nested `{pass,fx,juice,sound,music}` that `tools/selftest.mjs` does not
unwrap, hiding 26 real checks; `abilities.js` uses an inverted convention where
`notes` collects only failures. The playability lane's original "0 assertions"
claim was indeed wrong, and the orchestrator's correction stands. The fx runner
shape mismatch is a genuine tooling bug worth fixing.

The lane's 10-minute stability run is still marked PENDING and was never
appended. Still unverified. I did not re-run it (no sleep-polling per brief).

The service-worker section is appropriately flagged by the lane itself as
inference rather than verification. Left as-is.

## 4. Levels: OVERCLAIMED on one label, honest elsewhere

The lane labels "Draw-call budget per level" as **PASS** while its own body text
says it "could not run the selftest live to confirm current pass/fail state",
and its own Top-3 says the counts are "unconfirmed". A verdict of PASS on an
explicitly unmeasured quantity is an overclaim; the correct label is UNVERIFIED.
What was actually verified is only that a gate *exists* in source
(`world3d.js:14211-14212`), not that it passes.

Partial mitigation, in the lane's favour: I ran the `world` selftest and it
passes with ok=380, fail=0, which does exercise the per-level assertions. So the
gate does currently pass. But that is my evidence, not the lane's, and the lane
had it available via the same command the playability lane was already running.
Poor cross-lane coordination rather than dishonesty.

Memory claim: correctly self-labelled WEAK / "inference not measurement". Upheld
as honest. Still unverified, and remains so after this gate.

The 117/120 shelf baseline is quoted from project memory, not measured this
session, and nothing in this pass re-derived it. Treat as unverified.

## 5. Fish: UPHELD (best-caveated section in the pass)

`ENTITY_BUDGET:{onscreen:32,total:120}` confirmed in `data.js`. The lane's point
that SPEC3D.md (48/120) and project memory (110/220) both disagree with shipped
data, and that the real change is recorded only in a code comment at
`world3d.js:13873`, is a legitimate and well-evidenced documentation-drift
finding. The "empty stretches" claim is explicitly marked architecturally
plausible but unconfirmed, which is the right posture. No correction needed.

## 6. Upgrades / economy: UPHELD with the orchestrator's correction applied

Tier price table and the 86-shark roster reproduce. The coins-per-run figure is
consistently labelled an estimate throughout, which is correct practice.

**Orchestrator correction (a) on the tier-12 duplicates: VERIFIED CORRECT, and I
confirm the orchestrator's own restatement is accurate.** `leviathanrex` and
`leviathan_rex` share stats, passives, active and cost (150000) but differ in
`sil.len` (2.4 vs 2.2), `sil.girth` (0.188 vs 0.326), palette, family and blurb.
The economy lane's "byte-identical" was wrong; the orchestrator's narrower
framing ("same price, same mechanics, cosmetic-only difference") is right and is
a fair design question rather than a data bug. There are indeed 4 tier-12
sharks, not 2.

## 7. Orchestrator ECONOMY-SINK.md: arithmetic UPHELD, causal claim OVERREACHES

Asked to rule on this without sparing it. Arithmetic first, recomputed from
`RFD`:

- 11 coin-gated levels total **643,000**, confirmed exactly
- 86 sharks total **6,693,350**, confirmed exactly
- grand total **7,336,350**, confirmed
- tiers 1-3 combined **6,650**, less than belize at 9,000, confirmed
- california is the only non-coin gate (`{type:"score",levelId:"jamaica",n:8000}`)
 , confirmed

So the spreadsheet is sound. The causal claim is where I part company.

**The claim overreaches, for three reasons.**

First, you summed sinks and never established sources, and you say so yourself.
Without a measured coins-per-run, "7.3M total sink" is not interpretable. A
7.3M sink is alarming at 400 coins/run and unremarkable at 40,000. The economy
lane's 420-1,008 figure is an unvalidated estimate built on an *assumed* eat
count, so the conclusion inherits an assumption stacked on an assumption. I did
not find a gem-to-coin conversion, but `meta.js` does carry frenzy-completion,
daily-bonus and mission-reward paths into the same wallet (`meta.js:685`), none
of which were counted on the source side. The framing is weaker than presented.

Second, a shared wallet is **standard and generally fine for the genre**, and
your own HSE comparison actually undercuts you rather than supporting you. You
note HSE gates maps behind shark size, not currency. That is a gate on
*progress*, which is precisely what competing sinks produce as an emergent
effect: the player who has been buying sharks has also been earning, so level
affordability tracks roster progress anyway. Competing sinks are a deliberate
and common design lever (players choose breadth versus power); calling that
"never reconciled" assumes the reconciliation was supposed to be explicit.

Third, the specific mid-game mechanism does not survive the numbers. Tiers 1-3
costing less than belize is not evidence of a squeeze; it is evidence the early
game is cheap, which is correct design. The economy lane located its wall at
tiers 7-9 (22k to 50k), whereas the level curve's steep段 is bali/aruba/jamaica
(105k-170k). Those are different regions of the curve, so level competition is
not well positioned to explain the wall the lane actually reported.

**Ruling: publish the arithmetic, which is solid and useful. Drop "plausible
mechanical cause of the wall" to "worth asking Dan whether competing sinks are
intended".** The recommendation to consider a separate currency is reasonable as
a design question but is not established by this evidence.

## 8. Orchestrator MENU-THUMB-BUG.md: UPHELD, and far worse than reported

Asked not to take the reading on trust. I opened
`playability/plainload_menu.png` myself. The reading is correct: Tier 1 shows
Reef Shark and Cookiecutter with 3D thumbnails and **Epaulette Shark as a flat
tan tile reading "ES"**, the monogram fallback from `ui3d.js:358-365`.

I then tested the correlation hypothesis and baked the roster headlessly
(`gate_thumbs2.mjs`, sampling the live DOM at 4s/10s/20s/30s plus a scroll and a
further 15s). Result, and this is the most valuable fact in the gate:

    t~4s   mono 114 cards, withImg 58
    t~10s  mono 108 cards, withImg 64
    t~20s  mono 108 cards, withImg 64   <- plateau
    t~30s  mono 108 cards, withImg 64
    after scroll +15s  unchanged

Cards are duplicated in the grid (172 cards / 86 sharks), so deduplicated:
**54 of 86 sharks (63%) permanently render a monogram instead of art.** This is
steady state, not lazy-baking in progress: it plateaus at 10s and never recovers,
including after scrolling to force visible-card queueing.

The monogram split correlates perfectly with `sil.model`:

| sil.model | monogram / total |
|---|---|
| thresher | 0 / 30 |
| (none) | 0 / 2 |
| whaler | **19 / 19** |
| tigershark | **8 / 8** |
| greatwhite_cy | **27 / 27** |

By tier, it worsens as the player progresses:

    t1 1/3   t2 0/2   t3 1/3   t4 2/3   t5 2/2   t6 3/3
    t7 5/10  t8 6/10  t9 13/25 t10 13/17
    t11 4/4  t12 4/4        <- every single flagship shark

**Mechanism, and a correction to my own first reading.** I initially framed the
mesh-family correlation above as causal and called this a defect with a missing
re-queue path. That framing was wrong and I withdraw it. The orchestrator
retracted its own whaler hypothesis and root-caused this properly, and I have
verified its account: `requestTemplate` (`shark3d.js:3958`) returns null for a
textured base when `mayLoadTextured()` declines, the rig is marked
`rfWithheld=true` (:3762), and `ui3d.js:800` then correctly declines to bake a
placeholder. The `sil.model` correlation is real but incidental: those three
model keys are simply the textured ones, so the split is textured-vs-untextured,
not by mesh family.

This is a **deliberate iOS texture-budget policy**, not a bug. `preload()`
documents it plainly: "boot went from 165.3 MB of decoded texture to 5.3 MB plus
one right-sized model", and the comment at `shark3d.js:3749-3757` names the
Epaulette yellow box as the symptom this code deliberately fixed. There is no
missing retry path to add; re-queueing on load would defeat the budget the code
exists to protect. Our two independent counts agree exactly (32 buildable / 54
withheld).

**Ruling as a design question, which is the right frame.** I agree with the
orchestrator that this is not acceptable as shipped, and I do not think it is
over-reaching in the other direction. 63% of the roster menu, including Great
White, Megalodon, Tiger, Bull and Hammerhead, renders as two-letter monograms.
The store is where an unlock is chosen and where the reward for 150,000 coins is
displayed, and every tier-11 and tier-12 flagship is affected. That plausibly
feeds Dan's "static / atari-flat" complaint directly.

The proposed middle path is sound and is the cheapest good option: bake withheld
rows from **untextured low-poly geometry**, which the budget already permits
(the low-poly base set is resident at boot). A correctly-lit grey-and-palette
shark silhouette reads as a shark; "ES" does not. This keeps the texture budget
intact while restoring the progression read. Worth confirming the untextured
base actually resembles each row's silhouette before committing, since
`sil.len`/`girth`/`finScale` drive the rig and may carry most of the identity
anyway.

So: no code defect, real product problem, cheap fix available. Re-ranked
accordingly in the merged list.

---

## Independent scorecard

Mine, not the lanes'. FAIL means a defect a player would notice; WEAK means
plausibly fine but unverified on evidence I would accept.

| Area | Lane | Gate | Reason |
|---|---|---|---|
| Controls | WEAK | **WEAK** | Ring/breach/boost solid. Top claim overstated. Safe-area gap real. No playfeel measurement exists. |
| Levels | WEAK | **WEAK** | Source design is sound and the world selftest passes (380 ok). Draw-call PASS label unearned; memory never measured. |
| Upgrades | WEAK | **WEAK** | Arithmetic solid. Every time-to-unlock conclusion rests on an unmeasured coins-per-run. |
| Fish | WEAK | **WEAK** | Best-caveated section. Real documentation drift. Density never observed live. |
| Playability | PASS | **WEAK** | Selftests and plain-load genuinely clean, but the throttled p95 is real and the 10-min stability run never landed. PASS is premature. |
| Fun / art | WEAK | **FAIL** | 63% of the roster shows monograms not art, every flagship included, confirmed in rendered frames by two independent methods. Intended behaviour, unacceptable result. Plus 11 art-law glow violations, and the lane's own table is not reproducible. |

Overall: **not signed off.** One FAIL, five WEAK, zero PASS.

The FAIL is a product judgement, not a defect report: the monogram behaviour is
working as designed and the design is wrong for the player. Everything else is
WEAK for the same underlying reason, that the pass had no working harness until
the very end, so most verdicts rest on reading code rather than running it.

---

## Consolidated ranked fix list

Ranked by impact for effort. "Unverified" marks claims no one has measured.

1. **Bake withheld roster cards from untextured low-poly geometry.** 54/86
   sharks, including all 8 tier-11/12 flagships and every famous real shark,
   show a two-letter monogram. Highest impact in the pass: it degrades the
   store, the reward for every unlock, and the primary art surface, and is a
   live candidate for Dan's "atari-flat" complaint. Not a bug to fix but a
   policy to improve: the low-poly base set is already resident at boot, so a
   silhouette bake costs no texture budget. Effort low-medium. Confirm the
   untextured rig still reads as the right shark first. Evidence:
   `gate_thumbs2.mjs` plus the orchestrator's independent `rfWithheld` census,
   two methods agreeing at 32 buildable / 54 withheld.

2. **Adopt the fixed harness as the canonical one.** Five of six lanes were
   source-only because the named probes do not exist, and the one real frame
   anyone captured produced the #1 item above. The orchestrator has since fixed
   the fun lane's black frame (a base-href path mismatch, not missing assets:
   serve the worktree root at `/play/razorfin/`, giving 0 404s, rather than
   `/play` at `/razorfin/`, giving 14). Fold that plus this session's
   `plainload/perfprobe/stability10/gate_*` into a single `verify.js`. Effort
   low. Force multiplier for everything below, and it retires the "no harness"
   caveat that weakens five of six sections.

3. **Fix the fx selftest runner shape mismatch.** `tools/selftest.mjs` reports
   ok=0 for 26 passing fx checks. A reviewer cannot distinguish a passing module
   from an empty one, which is how coverage silently rots. Effort very low.
   Verified by me and by the orchestrator.

4. **Clamp the 11 near-white glows** (not 9), starting with `mirrorscale` at pure
   #FFFFFF. Corrected list above. Effort low, palette pass in `gen_data.py`.
   Note the fun lane's published table has wrong lum/sat values and should be
   regenerated with a single consistent colour model before anyone acts on it.

5. **Investigate the 4x-throttle frame stalls.** Bimodal distribution (85 frames
   on budget, a cluster at 8-12 missed vsyncs) points at discrete main-thread
   blocking work, not fill rate. Real mobile risk. Effort medium: profile with
   the CDP tracing categories to identify the blocking task. Do this before any
   device testing, since the mechanism is findable headlessly.

6. **Add safe-area exclusion for the swim-control touch anchor.** Currently
   `env(safe-area-inset-*)` only feeds HUD panel CSS. iOS home-indicator gesture
   conflict is the documented original complaint. Effort low. Promoted above the
   drive-law item because it is cheap, uncontested, and a real device hazard.

7. **Run the 10-minute stability probe to completion and append the result.**
   Launched but never landed; leak behaviour over a session is entirely
   unverified. Effort low, just needs to finish.

8. **Roll the 32/120 entity budget into SPEC3D.md.** The contract document says
   48/120 and project memory says 110/220; shipped data says 32/120 and the real
   change is recorded only in a code comment. Effort trivial, prevents a future
   lane re-deriving from a wrong spec.

9. **Put the tier-12 same-price pair to Dan as a design question.**
   `leviathanrex` / `leviathan_rex`, both 150,000, identical stats/passives/
   active, cosmetic-only difference. Not a data bug. Effort zero, decision only.

10. **Measure coins per run.** Blocks items in the economy and level-gate
    analysis; until it exists, every runs-to-unlock number in this pass and the
    whole economy-sink framing is unfalsifiable. Depends on item 2.

11. **Do NOT act on the controls drive-law item as written.** Re-scope first.
    Throttle is already direct (`engine3d.js:2147`); only heading slew and accel
    ramp differ, both deliberate, documented, and contract-gated at a 14 rad/s
    SPEC3D floor. If playfeel is genuinely a concern, measure it before changing
    a constant that was set in response to a prior owner complaint.

### Still unverified after this gate

- Per-level texture memory against the iOS budget (never measured, no memprobe).
- Rendered draw-call counts per level; only the source gate is confirmed to
  exist and to pass in `world`, never counted from a real frame.
- The 117/120 shelf baseline, quoted from memory, never re-derived.
- Onscreen fish density and the "empty stretches" claim; never observed live.
- Coins per run, and therefore every runs-to-unlock figure and the economy-sink
  causal argument.
- 10-minute stability / leak behaviour.
- Surface and floor behaviour; source constants only.
- All qualitative fun judgements, which rest on stale pre-current-art imagery.
- Real-device behaviour of any kind. Every number here is headless Chrome.
