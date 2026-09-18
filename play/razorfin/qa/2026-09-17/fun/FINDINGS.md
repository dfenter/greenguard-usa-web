# Fun factor, 2026-09-17

Verdict: WEAK

Method limit, stated plainly: no working screenshot harness exists at HEAD.
The lane built a fresh puppeteer probe with the CDP landscape override and the
Service-Worker-Allowed header; it returned a solid black frame with 16 console
404s, likely missing three.js/GLB assets outside the local serve root. That is
a harness limitation, not a confirmed game bug, but it means NO fresh frame was
captured. Judged from SPEC3D.md, REVIEW-3D.md, data.js, hse/FAMILY_MAP.md and
review_evidence/*.png (stale, pre-current-art, not used as live evidence).

## Opinion versus Hungry Shark Evolution
The eat loop is plumbed correctly. FRENZY combo and goldrush math mirror HSE's
shape, with same-frame hit consumption and no fixed-step allocation. But HSE's
pull is the sensory payoff on every bite, not the math. Razorfin's own Rev 15
notes flagged the reef frame as "dark and timid", water "flat cyan", and shark
luminance under the readability floor when ATMO-01 was raised. If predator and
prey contrast is still marginal, bites read mushy no matter how correct the
frenzy tiers are.

Growth reads strong on paper (86 sharks, 12 tiers, a real stat curve) but is
unverified in frame. REVIEW-3D needed three re-check rounds before Leviathan
Rex's silhouette cleared cutover. ART-02 flagged that most non-kaiju rows still
share the base spine with feature add-ons only, so it is unclear whether the
mid roster gets that same care.

Threat exists in name (dreadAura, ambush, stealth passives, zone-weighted NPCs)
but nothing describes an escalating "being hunted" cue. That is roster variety,
not dread.

Spectacle: full-meter-on-spawn is a good instinct, and hitstop, slowmo, shake
and goldrush are right-shaped. FX-01 (effects surviving run boundaries) was
CLEARED-WITH-NOTE and was not reverified here, so spectacle FX may still bleed
into menu and results instead of landing as a contained payoff.

## Real-sharks art law: CORRECTED by the gate, 11 violations not 9
My first table mixed HSL lightness with HSV saturation and was not reproducible.
Recomputed consistently in HSV (value > 0.85, saturation < 0.25), the real count
is 11. The two the original table missed are aphroditelure and cyclopseye.
The gate confirmed the threshold is not cherry-picked (the count stays flat at
11 across lightness 0.75 to 0.85) but is sensitive to the saturation cutoff.

  mirrorscale    #FFFFFF  v 1.00  s 0.00   pure white
  teslafang      #E8F4FF  v 1.00  s 0.09
  voltaicrex     #F0F8FF  v 1.00  s 0.06
  absolutezero   #E0F8FF  v 1.00  s 0.12
  banshee        #D4F0FF  v 1.00  s 0.17
  cyclopseye     #D9C8FF  v 1.00  s 0.22   (missed first pass)
  glacier        #C4ECFF  v 1.00  s 0.23
  bonecrown      #FFF0C4  v 1.00  s 0.23
  hermesdart     #FFF6C4  v 1.00  s 0.23
  aphroditelure  #FFC4E8  v 1.00  s 0.23   (missed first pass)
  artemisstrike  #C0F0FF  v 1.00  s 0.25

## The bigger art finding: 63 percent of the roster shows letters, not sharks
Measured independently by both the orchestrator and the gate, agreeing exactly:
of 86 sharks, 32 bake a real thumbnail and 54 render a two-letter monogram.
All 54 are rfWithheld, a deliberate iOS texture-budget policy
(shark3d.js:3762, :3958). No code defect.

But every tier-11 and tier-12 flagship is in the withheld set, along with Great
White, Megalodon, Tiger, Bull and Hammerhead. The roster screen displays a
150,000-coin reward as the letters "GW". The gate graded this FAIL as a product
judgement and it is the single biggest finding of the pass.

## Top 5 changes, ranked by impact for effort
1. Bake withheld roster cards from untextured low-poly geometry so the menu
   shows sharks instead of letters. The low-poly base set is already resident at
   boot, so it costs no texture budget. Confirm the untextured rig still reads as
   the right shark per row before committing. Effort: low-medium. (Gate ranked
   this #1 overall.)
2. Adopt the fixed harness (qa/2026-09-17/harness/). Effort: none, already done.
3. Clamp the 11 near-white glows above to tinted low-saturation values.
   Effort: low, gen_data.py palette pass.
3. Re-verify Leviathan Rex's gameplay-scale silhouette at HEAD, since many
   shark3d.js edits landed after the conditional CUTOVER. Effort: low-medium.
4. Extend the camera-scale audit to mid-roster archetypes ART-02 flagged as
   sharing the base spine. If 40+ of 86 sharks read generic, progression feel
   collapses before the flagship tier. Effort: medium.
5. Re-verify FX-01 (effect bleed across runs) and ATMO-01 (foreground contrast)
   at HEAD. Both gate whether bites feel crunchy or mushy. Effort: medium.
