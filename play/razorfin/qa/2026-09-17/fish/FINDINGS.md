# Fish density and prey behaviour, 2026-09-17

Verdict: WEAK

Method limit: the harness files named in the brief (verify.js, playprobe.js)
do not exist at HEAD. Only scratchpad/r16_*.mjs are present. This section is
source analysis only, no live onscreen count was taken.

## 1. Three-way entity budget drift
Real constant: data.js:145 ENTITY_BUDGET:{onscreen:32,total:120}.
The brief's 32 is correct. Two other sources disagree and are stale:
- memory project_razorfin.md says 110/220, stale by two revisions
- SPEC3D.md:1167 says 48/120 (Rev 9.4 Clarity pass), stale by one revision
The actual 48 to 32 cut is recorded only in a code comment inside a selftest,
world3d.js:13873 ("owner thinned density 48 -> 32 onscreen, packs 6-10 -> 4-7").
It was never rolled into SPEC3D.md. The contract document is wrong.

## 2. Empty stretches are architecturally plausible, unconfirmed live
Spawn gate at world3d.js:9177 and 9227 hard-caps 32 onscreen with no proactive
backfill, across a large open-ocean world (Rev 9.5 SDF, zones spanning y 0-4800).
Density was cut 33 percent with no compensating respawn logic. Not visually
verified, harness unavailable.

## 3. Eat law consistent, chew cooldown value unlocated
Ceiling check (world3d.js:9033 playerEatCeiling), hazard bypass (9047-9053) and
suction gate (9616-9618) all key off one shared eligibleTierMax, so there is no
drift risk between them. The numeric chew-cooldown value was not found in
world3d.js; only the per-entity capability flag World.__decaysBiteCd at line 714.
Likely lives in engine3d.js, not inspected this pass.
