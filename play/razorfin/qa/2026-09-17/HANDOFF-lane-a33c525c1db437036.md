# HANDOFF: Razorfin QA fix program (2026-09-17)

Orchestrator lane hit the 200K context cap. All six waves are DONE, verified,
gated and committed. What remains is the exit sequence only.

## State: all six waves complete

Branch `razorfin-qa-fixes`, worktree
`/Users/lucille/.claude/tmp/claude-501/-Users-lucille/4ca21896-c003-474c-ae2d-28610a6a27d6/scratchpad/razorfin-qa-fixes`
Branch point `f027e62a`. Working tree CLEAN. 11 commits:

| SHA | What |
|---|---|
| 8373cc2e | wave 2: selftest runner unwraps fx3d's nested result, fx 0 -> 26 ok |
| 88171ef1 | wave 3: 11 near-white glows clamped to the 0.35-0.55 band |
| b9d8734b | wave 4: safe-area exclusion for the iOS home indicator |
| 90499618 | wave 5: SPEC3D ENTITY_BUDGET 32/120 + coins-per-run estimate |
| db8624d5 | wave 1: withheld roster cards bake from resident low-poly geometry |
| b331eb45 | FAM_FILES regeneration trap documented in gen_data.py |
| da96793e | wave 4 follow-up: safe-area assertions made real (gate HOLD cleared) |
| 58a16448 | wave 6: bake queue cancelled on menu-to-run, p95 166.7 -> 16.8 ms |
| 86b1cf8b | memprobe repaired, it never entered a run (gate HOLD cleared) |
| 55555ab2 | corrected memory numbers recorded in wave 1 evidence |
| 7dbff114 | em dashes stripped from this program's evidence |

## Verified state, reproduce with

    cd <worktree>/play/razorfin
    node --import ./tools/reg.mjs tools/selftest.mjs world game art3d fish fx ui meta abilities

Expect, all fail=0: world 380, game 398, art3d 31, fish 8, fx 26, ui 239,
meta 192, abilities 0.

Perf, independently reproduced by the orchestrator:

    cd <worktree>/play/razorfin/qa/2026-09-17/harness
    node perfprobe.mjs <worktree> 4      # p50 16.70, p95 16.70, max 16.80 over 476 frames
    node memprobe.mjs <worktree>         # menu 15.27 MB, in-run 15.27 MB, hasPlayer false->true
    node rosteraudit.mjs <worktree>      # total 86 | baked 86 | withheld 0

## Gate verdicts, all resolved
- Wave 2: PASS. Honest caveat: "fx 26" counts note strings, only ~8 vary with
  outcome. Same accounting applies to every module, so it is a consistent
  metric, not an assertion count. The fix does close a real hole (a nested
  FAIL used to exit 0, now exits 1).
- Wave 3: PASS. Gate recomputed all 11 with Rec709 relative luminance and got
  0.448-0.452, hue drift under 0.2 degrees.
- Wave 4: soft HOLD on test integrity, CLEARED by da96793e (deliberate break
  proves the assertions now fail if safeAnchorY is broken).
- Wave 1: HOLD on the memory claim only, the fix itself passed. CLEARED by
  86b1cf8b + 55555ab2.

## REMAINING WORK (the exit sequence)

1. **Fable final read is IN FLIGHT** (agent af4ec76f7b39c8ec3, model fable).
   It was spawned on the 9-commit state; commits 55555ab2 and 7dbff114 landed
   after. Both are evidence/doc only, no code, so the verdict should stand,
   but say so when relaying. If it returns HOLD, act on it. If SHIP, continue.
2. On SHIP, merge to main SCOPED. Verify first that the branch touches no Rev
   17 lane path (last check was CLEAN):
       git diff --name-only f027e62a..HEAD | grep -E 'sharklib|shark_variant|recipes/|models/fam|assets/review|NOTES-rev17'
   Must return nothing. Never `-A`, never stash, never rebase main.
   NOTE: the main checkout is on branch `calendar-dnd`, not main, and has
   moved (e6ba802b). The Rev 17 lane has COMMITTED its work. Re-check before
   merging.
3. **DO NOT DEPLOY.** Dan approves deploys only after the Rev 17 art lands.
4. Write `play/razorfin/qa/2026-09-17/FIXES.md` summarizing the six waves.
5. Add a Rev 18 paragraph, under 12 lines, to
   `~/.claude/projects/-Users-lucille/memory/project_razorfin.md`.
   That file is SHARED with the Rev 17 lane and changed under me mid-session;
   re-read it and append, do not overwrite.
6. Send Dan the 86-card contact sheet with SendUserFile:
   `play/razorfin/qa/2026-09-17/fun/roster_contact_sheet.png`

## Residuals for Dan
- **Flagship cards still weak.** Wave 1 removed all 86 monograms, but the
  tier-11/12 flagships are the weakest cells: Zeusfin, Hermes Dart, Nullfin,
  Apollodon and Chimera Shark share a generic grey hull and are hard to tell
  from tier-1 Reef/Blue/Mako. Poseidonrex reads as a flat blue block. A
  150,000-coin reward still does not look like one. Clear improvement over
  monograms, but the product finding is only partly addressed.
- **No real-device testing anywhere in this program.** Everything is headless
  Chrome (SwiftShader/ANGLE) on a Mac. 4x CDP throttle is a proxy, not an
  iPhone. The safe-area fix in particular is inert headless, since --pad-b
  resolves to 0, so it is structurally correct but unproven on a phone.
- **Economy is a SIMULATION, not gameplay.** The 2.2s eat interval is assumed
  and scales every coin figure linearly. Deaths, hazards and the pressure-zone
  drain penalty are not modelled, so the numbers lean optimistic. Nothing
  crossed the 25-run flag. The one-wallet-three-sinks question (7,336,350
  total) is still open for Dan.
- **13 more sharks are above the glow band**, deliberately left out of scope;
  only the 11 named in the QA report were clamped.
- **FAM_FILES is a disk-scan trap.** Regenerating data.js while the Rev 17
  lane has family GLBs staged flips it from [] and breaks the art3d gate.
  Documented in b331eb45, not structurally prevented.
- Two tier-12 sharks (leviathanrex, leviathan_rex) still cost 150,000 each
  with identical stats. Untouched, it is a design question from the QA report.

## Gotchas that cost time
- **Harness base-href:** serve the WORKTREE ROOT and request /play/razorfin/
  with the trailing slash. A /play-rooted server gives a plausible BLACK FRAME
  with 14-16 console 404s, not an obvious error.
- **Selftest needs the three shim:** `node --import ./tools/reg.mjs`, run from
  `play/razorfin/`. Bare `node tools/selftest.mjs` fails with ERR_MODULE_NOT_FOUND
  on 'three' and looks like a real breakage.
- **Harness default paths** pointed at a nonexistent `razorfin-qa` dir; fixed
  in memprobe/rosteraudit, but always pass the worktree path explicitly.
- **Lanes misattribute failures to "pre-existing".** Two separate lanes called
  the art3d FAM_FILES failure pre-existing; it was caused by a data.js
  regeneration in this branch. Always diff against the branch point yourself.
- Do not trust a lane's self-reported pass. The orchestrator reran every
  number in this program, and the memprobe figures were wrong on first pass.
