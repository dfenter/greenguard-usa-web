# Razorfin Rev 7 — fix-lane F2 notes

Scope owned: `play/razorfin/meta.js` only. Source: `REVIEW-REV7.md` blocker 4
+ meta.js-relevant minors.

## B4 — Meta.endRun idempotency (fixed)

`meta.js` around `endRun()` (was `meta.js:738-828` in the review, now shifted
by inserted lines):

- Added a module-level `SETTLED_KEY = '__metaSettled'` constant.
- `endRun(ctx)` now checks `run[SETTLED_KEY]` at the very top, before any
  profile read/mutation. If already set and `run.__metaSettledResult` exists,
  returns that cached object immediately — no coins/xp/gems/runs/daily/frenzy
  logic re-runs, no `commit(kit, profile)` call happens again.
- On a first, real settlement, the full computed result object is built as
  before, then (right before `return`) the run bag is stamped:
  `run[SETTLED_KEY] = true; run.__metaSettledResult = result;` and that same
  `result` reference is returned.
- The token and cache live **on the run bag** (`ctx.run`), not in a
  module-level map keyed by run id — per the review's instruction to "stamp
  the ctx.run bag with a settlement token." This means the guard is scoped
  and GC'd naturally with the run object; no cleanup/registry needed, and no
  cross-run leakage is possible.
- Deliberately does **not** consult the engine's `running` flag (that lives in
  `engine3d.js`, a different module/lane) — re-entrancy safety is entirely
  self-contained in `Meta.endRun`, per the review's explicit instruction ("do
  not rely on the engine's separate running flag"). Verified in the added
  selftest by flipping `run.running = false` between calls and confirming the
  cached result still wins.

## Minors touched

- `meta.js:1-19` header comment said `Save shape (SAVE_VERSION = 1)` while
  the module constant is `SAVE_VERSION = 2` (bumped for Rev 7 relics/gems/
  skins/missions, per `SPEC.md:186`). Updated the header to say
  `SAVE_VERSION = 2, Rev 7` and pointed to SPEC.md for the additive schema
  fields, so the doc comment matches the code instead of contradicting it.
- The other minors in the review (7200x3600 world comment, kit-bus doc,
  SPEC.md `SAVE_VERSION=1` line 110) live in `engine3d.js`, `world3d.js`, and
  `SPEC.md` — outside this lane's owned files (meta.js + this NOTES file
  only), left untouched.

## Selftest added

New fixture "13" in `meta.js`'s selftest body, immediately after the existing
gems-flow test (formerly the last case before the `catch`):

- Builds one `runF` run bag with coins/xp/score/biggestTier/comboPeak/gems/
  missionResults/frenzyCompletions all populated (a realistic non-trivial
  payout).
- Calls `endRun({kit, save: pF, run: runF})` once (`firstF`), snapshots
  `pF.coins/xp/gems/runs/lastBonusDay`.
- Calls `endRun` again on the **same** `kitF`/`pF`/`runF` (`secondF`) and
  asserts:
  - `JSON.stringify(firstF) === JSON.stringify(secondF)` — identical payload.
  - `secondF === firstF` — literally the same cached object, not a
    coincidentally-equal recomputation.
  - profile fields (coins, xp, gems, runs, lastBonusDay) are byte-identical
    to the post-first-call snapshot — no second payout.
  - `pF.runs === 1` — incremented exactly once across both calls.
  - `runF.__metaSettled === true` — the settlement token landed on the run
    bag as specified.
- A third call, after flipping `runF.running = false` to simulate a bypassed/
  reset engine guard, still returns the identical cached `firstF` object and
  `pF.runs` is still `1` — proves the guard does not depend on the engine's
  `running` flag.

## Verify

```
cd play/razorfin
node --import ./tools/reg.mjs tools/selftest.mjs meta
# -> meta: pass=true ok=166 fail=0

node --import ./tools/reg.mjs tools/selftest.mjs world game art3d fish fx ui meta abilities
# -> world: pass=true ok=195 fail=0
# -> game:  pass=true ok=228 fail=0   (prints caught lane-fault-injection errors
#           for Art3D.animate/buildShark, UI.hudState, World.teardown,
#           Fx.teardown — these are expected/caught fault-injection probes
#           inside engine3d.js itself, not real failures; game still reports
#           pass=true, fail=0)
# -> art3d: pass=true ok=4 fail=0
# -> fish:  pass=true ok=7 fail=0
# -> fx:    pass=true ok=0 fail=0
# -> ui:    pass=false ok=231 fail=1
#           FAIL "a locked secret shark with 0 relic sets still shows the
#           gem-unlock button" -- this is blocker 3 (ui3d.js gem-purchase
#           gating), owned by a different fix lane, not meta.js. Left
#           untouched per lane scope.
# -> meta:       pass=true ok=166 fail=0
# -> abilities:  pass=true ok=0 fail=0
```

meta.js itself is fully green (166/166). The single suite-wide failure (`ui`)
is blocker 3's ui3d.js gating bug, outside this lane's ownership
(meta.js + NOTES-rev7-fixF2.md only) — flagging it here for the lane that
owns ui3d.js, not fixing it in this pass.

No git commit made, per instructions.
