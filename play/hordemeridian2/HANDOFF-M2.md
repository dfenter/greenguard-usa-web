# HANDOFF M2: open arena + background (gate PASS 2026-09-18)

Status: **DONE. Gate PASS at round 3, commit a978cc77, branch calendar-dnd pushed.**
Not merged to main and not deployed. Dan deploys via the router at the gated hash.

Supersedes the 2026-09-17 HOLD ("about 25 percent of M2 is real") at the bottom of the
git history for this file. That verdict was correct when written; both of its blockers
are now closed.

## Gated hash

`a978cc77` on `calendar-dnd`. M2 commits, oldest first:

| commit | what |
| --- | --- |
| 282171be | hm2_world.js SDF arena + terrain hooks + node test |
| caf61e1a | hm2_background.js 4-layer parallax + first probe |
| 107a779d | parallax wiring, ?perf watchdog, debug hooks |
| 1f258d8a | gate verdict HOLD recorded |
| b7193ac3 / 6b386bda | SDF retuned as a strict superset of the band boxes |
| cfbf6c2c | SDF clamp, energy edge and terrain hooks wired into game.js |
| a8efcf87 | probe made non-vacuous (real region keys, orientation gate) |
| d766d15f | probe asserts the SDF clamp and region identity |
| a978cc77 | boundary push asserts direction and edge band |

## What the HOLD actually was

A probe bot defect, not game code.

`hm2_world_probe.mjs` iterated hardcoded region keys `r0..r5`, which match no real
region (the real keys are `aurelion-graveyard`, `void-rift`, `meridian-verge`,
`ember-drift`, `crystal-shoals`). `teleportToRegion` returned false every time, but the
probe never read the return value and recorded `teleported = true` regardless. It also
never defeated the game's orientation gate, so all screenshots captured the "Rotate your
device" overlay and the identical per-region luminances were that overlay measured six
times. The separate architectural blocker (SDF clamp and terrain hooks unwired) had
already been closed by `cfbf6c2c`.

## Gate rounds

Three rounds, one Opus LOW adversarial reviewer, never the implementer. Each round found
a real vacuity hole that the orchestrator's own mutation testing had missed.

**Round 1 HOLD, two blockers.** `regionAt` stubbed to a constant still passed: the
distinct-screenshot-hash check did not prove per-region rendering, because hashes differ
from ship position and transient HUD banners. `clampToField` stubbed to identity still
passed: the probe only teleported to region centres and never exercised the plan's
"Player clamp = SDF" line. Closed by `d766d15f`.

**Round 2 HOLD, one blocker.** The new boundary push passed with a DIRECTION-BLIND clamp:
returning the `REGIONS[0]` centre whenever `sdf > 0` gave PASS with all 8 angles landing
on one point at sdf -2200, because `sdf <= 4` only tested "ended up inside". A teleport,
not a clamp. Closed by `a978cc77` with both suggested fixes: `sdf >= -EDGE_BAND` (read
live, not hardcoded) and direction retention (dot > 0 against the mean of region centres,
plus mutual distinctness of the 8 results).

**Round 3 PASS.** Clean run exit 0: 6/6 region identities, 8/8 pushes at sdf -15.04 to
-16.00 inside the -340 band, dots 0.610 to 1.000, 5 distinct luminances, 126.6 fps, zero
failures, zero new console errors. Mutations A, B and D all exit 1 with no regression.
The reviewer's own mutation F (direction-preserving undershoot to 0.55, stopping ~1300
units short of the wall) is caught by the edge band, so that assertion does real work
beyond killing D.

## Evidence

- `hm2_world_probe.mjs`: exit 0 at 390x844. Per-region screenshots in
  `review_evidence/m2/` show a genuinely running game (ship, HUD, radar, enemies), not an
  overlay. Luminance deltas 0.218 to 0.242 against the 0.18 floor from
  reference_track_readability, so region palettes are now MEASURED, not merely calculated.
- `hm2_world.test.mjs`: 24 cases, 0 failures.
- `hm2_campaign_probe.mjs`: 55/55. All 15 missions boot and run their arc. Bot survival
  medians L1=134s, L5=75s, L10=54s, L15=42s, all above their bars, so the SDF clamp did
  not break the M4a mission tuning. Per-trial `errs=1` is the pre-existing service worker
  scope error; the probe filters it for the real assertion.
- HM1 untouched: `git diff --stat` over the M2 range against `play/horde-meridian` is empty.

## PLAN AMENDMENT for Dan to ratify

`cfbf6c2c` resolved the old Option A / Option B question unilaterally by SPLITTING region
identity:

- gameplay and mission identity stay on the `hm_data.js` linear band model (`regionAtX`),
  so the 15 M4a missions do not shift;
- the 2D SDF `regionAt` drives palette, background and terrain only.

This only partly satisfies the plan line "Player clamp = SDF"
(`~/.claude/plans/horde-meridian-2.md`, M2 section). The containment clamp IS the SDF
(`clampToField`, gate-verified above); what stays on bands is region IDENTITY. The gate
judged the split coherent and honestly recorded in the `game.js` comments at 3046,
5692-5693 and 10917. Recorded here as a plan amendment for Dan to ratify.

## Residuals, none blocking

1. **For M3 to inherit.** The boundary push samples 8 FIXED angles. A clamp that
   special-cases those angles and no-ops elsewhere still passes (reviewer mutation G:
   off-axis sdf +5597 at 90 deg, +27981 at 150 deg). Not a plausible accidental
   regression, and the real clamp is angle-agnostic gradient descent already covered by
   5000 random points in `hm2_world.test.mjs`. Fix as an invariant, not a point-fix:
   randomise the push angles per run, seeded and logged for reproducibility, so no
   implementation can special-case the sample set.
2. The orientation assertion is decorative under the current context: Playwright
   `isMobile` alone yields portrait, so stripping the init script still passes. It only
   fires in a forced-landscape context. Do not cite it as load-bearing evidence.
3. `solar-crown` is never visited by screenshot, so region coverage is 5 of 6. It is an
   SDF-only bonus region with no band box, and it IS covered by the identity check.
4. A clamp pinned to (0,0) exits 1 via "scene left playing state", i.e. caught
   incidentally rather than by the clamp gate.
5. HUD banner text overlaps the tutorial line in two frames ("OVERDRIVE / SYSTEM BOOST
   ONLINE" over "Drag anywhere on the screen to fly"). Two banner layers racing, not
   clipping. Deferred to the M6 text pass.
6. Pre-existing and unchanged: `__MISSING` atlas warnings (deco_plate, gem0, ic_armor,
   ring_thick, elite_crown) and a service worker scope error. The "console clean" criterion
   fails on pre-existing grounds only; no NEW console errors.

## Cautions for the next lane

- The working tree carries unrelated dirty razorfin, redesign and soulsteel files. Never
  `git add -A`; commit with explicit paths.
- A stale detached worktree sits at `scratchpad/hm2-deploy` at `0ac8710b`. Leave it alone.
- The game directory is `play/hordemeridian2`, not `play/horde-meridian-2`.

## Next

M3 (enemies + bosses) is UNBLOCKED. Brief at `~/.claude/handoffs/hordemeridian2-M3-brief.md`.
Not dispatched by this lane.
