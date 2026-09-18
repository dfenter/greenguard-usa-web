# Selftest run, orchestrator-verified 2026-09-17

Command, from play/razorfin/:
  node --import ./tools/reg.mjs tools/selftest.mjs world game art3d fish fx ui meta abilities

Result: all modules pass=true, fail=0.

  world      ok=380  fail=0
  game       ok=394  fail=0
  art3d      ok=31   fail=0
  fish       ok=8    fail=0
  fx         ok=0    fail=0   <-- under-reported, see below
  ui         ok=239  fail=0
  meta       ok=192  fail=0
  abilities  ok=0    fail=0   <-- inverted convention, see below

## Finding: the fx selftest count is silently under-reported
fx3d.js __selftest returns {pass, fx, juice, sound, music}, a nested shape the
runner in tools/selftest.mjs does not unwrap (it handles only `notes` and
`sections`). 26 real checks are therefore counted as zero:
  fx 17, juice 4, sound 3, music 2, all passing.
The runner's own header comment warns about exactly this class of shape
mismatch silently under-reporting a result. A future fx regression would still
surface via pass=false, but the ok count is misleading and a reviewer reading
ok=0 cannot tell a passing module from an empty one.

## Not a bug: abilities ok=0
abilities.js selftest uses an inverted convention, notes collects ONLY failures
and returns {pass: notes.length===0, notes}. Empty notes means every assertion
passed. It does run real tests (phase expiry, chrono reset, passive immunity
copy, charge math). No action needed beyond knowing the convention.

## Noise seen during the run (expected, not failures)
Deliberate fault-injection lines print to stderr: "lane C3 blew up",
"lane B3 teardown blew up", "lane F3 teardown blew up". These are the
error-path tests firing. Also "WebGL context lost" and the degraded-boot
dependency check, both expected headless.

## Orchestrator re-check of the economy lane's duplicate-unlock claim

Claim was: leviathanrex and leviathan_rex are "byte-identical stats/passives/
active, only cosmetics differ".

PARTLY WRONG, corrected. Verified by loading data.js (global is RFD, not RF.Data)
and diffing. There are 4 tier-12 sharks, not 2:
  leviathanrex   cost=150000  Sharkjira
  leviathan_rex  cost=150000  Leviathan Rex
  heracrown      cost=220000  Hera Crown
  typhonmaw      cost=222000  Typhonmaw

leviathanrex vs leviathan_rex: stats block, passives, active and cost ARE
identical (speed 400, accel 720, turn 2.5, bite 16, hp 1400, metab 2.6,
boost 3; armored/pressureImmune/junkEater/biteUpX; active atomic; 150000).
But the full objects are NOT identical. They differ in sil.len (2.4 vs 2.2),
sil.girth (0.188 vs 0.326), palette base/accent/glow, family
(leviathanrex vs kaiju) and blurb. leviathanrex also carries a skin key the
other lacks.

So the real finding is narrower but still valid: two tier-12 legendaries cost
exactly the same 150000 and play EXACTLY the same (identical stats, passives
and active). They differ only in look. At the most expensive point of the
curve the player pays the same price twice for zero mechanical variety.
Worth raising with Dan as a design question, not filing as a data bug.
