# Razorfin QA - LEVELS - 2026-09-17

VERDICT: WEAK

METHOD NOTE: verify.js/playprobe.js/memprobe.js referenced by project memory
were not present anywhere in this worktree (find from repo root and
scratchpad turned up nothing), so this is source-read analysis only, no
live probe run, per the fallback instruction.

## Scope read
- world3d.js:16,50-160,4472-4900,5251-5900,14040-14220 (SDF/maze/level gates)
- data.js:120 (LEVELS array, 12 rows)
- meta.js:625-665 (unlock/select)
- engine3d.js:1776-1840,6205-6235 (ctx.level plumbing)
- NOTES-rev12-levels.md (level lane author notes)

## Per-claim evidence

Maze layout and reachability - PASS.
world3d.js is NOT a hand-authored cavern maze; Rev 9.5 replaced it with an
open-ocean SDF (world3d.js:83-85 comment: owner complaint "you cannot dive
down" -> open-ocean generator). Rev 12 layers a per-level rock maze
(buildMazeLevelLayout, world3d.js:4786) seeded from a level-id hash
(levelSeedHash, independent of the shared RNG stream so it can't desync
other selftests). Anti-sliver logic explicitly rejects mass placements that
would leave a gap narrower than a full tier-12 passage (world3d.js:4836-4844,
comment: "a gap ... is not a choke point, it is a trap"). Reachability is
asserted live: ensureOpenColumns() (world3d.js:5622) iteratively shrinks
any mound that blocks a vertical column and re-verifies with
verifyOpenColumns (world3d.js:5251), and there is a per-level selftest gate
at world3d.js:14040-14220 that re-runs this for every RFD.LEVELS row. Spawn
keepout around the drop-in point is explicit (world3d.js: "player drops in at
(S.w*0.5, 260) ... clear water around and below").

Rock collisions - PASS (source-level).
resolveBody reads World.terrainSDF with a gradient probe
(world3d.js:5883-5887) and clearance constants are radius-aware
(MAZEL_CLEARANCE_T1, MAZEL_CLEARANCE_T12 = body radius + 24px spawn
clearance, world3d.js:117-118). Not live-tested; no screenshot evidence.

Surface and floor behaviour - WEAK (no live evidence).
SDF_OPEN_Y = 500 keeps a fixed no-rock band near the surface
(world3d.js:55, 4488), and per-level seabed y is re-sampled per-mass so rock
never pokes through the floor (world3d.js: "per-mass placement re-reads the
real seabedY at that x so masses never poke through the floor"). Could not
verify against an actual frame; source-only.

Sky and water look - PASS.
12 levels each carry a distinct sky theme (top/horizon/horizonTheme) and a
4-band water color script + haze (data.js:120). buildSkyBackdrop renders a
per-theme horizon silhouette from HORIZON_THEME_BUILDERS keyed to the exact
theme ids used in data.js (NOTES-rev12-levels.md section 2). Water fog is
derived per-band lerped toward haze, not flat haze (NOTES-rev12-levels.md
section 4 - flags a regression already caught and fixed: an earlier draft
that set fog = haze uniformly broke the shelf/abyss fog-difference
selftest gate).

Progression gating - PASS.
unlockLevel (meta.js:635-663) supports coins/gems/score cost shapes and
treats an unrecognized/zero cost as free rather than blocking (defensive).
California's unlock is {type:"score", levelId:"jamaica", n:8000}
(data.js:120) and jamaica is the immediately preceding row in LEVELS, so the
gate references a level the player will have already played - consistent.
Dev mode forceUnlockAll bypasses the check (meta.js, levelUnlocked)
matching ?unlockall=1.

Load time and memory per level (iOS budget) - WEAK, could not measure.
No memprobe.js present in this worktree to reproduce the 29.8MB
menu/33.7MB in-run baseline from the 2026-08-19 postmortem. Cannot confirm
per-level texture memory stays in that band; each level's sky backdrop adds
one merged gradient quad + one sun/cloud batch + one silhouette batch (3
draws, per NOTES-rev12-levels.md section 2) which are geometry, not new
textures, so the shape of the fix looks memory-safe, but this is inference
not measurement.

Draw-call budget per level - PASS (formally gated, margin is tight).
Baseline shelf was 117/120 (TIGHT) before the Rev 12 levels lane per project
memory. Rev 12 adds a sky backdrop (+3 draws, all levels) and an optional
seabed accent batch (+0 or +1, only for ice/volcanic/rock/kelp seabeds -
sand/reef levels add 0 per NOTES-rev12-levels.md section 3). This would have
pushed several levels (mexico, newzealand, alaska, azores = rock/ice/
volcanic seabeds) over the old 117 baseline. However this is not a blind
risk: world3d.js:14211-14212 has an explicit per-level selftest assertion
chk(lvlDrawCalls <= 120, ...) that iterates every RFD.LEVELS row, so any
level that busts budget fails the build's own selftest suite rather than
shipping silently. Could not run the selftest live (no harness) to confirm
current pass/fail state - this is the single most important thing to run
before signoff.

## Top 3 problems (ranked)

1. No live verification possible this session - verify.js/playprobe.js/
   memprobe.js are all missing from the worktree, so per-level memory
   (iOS budget) and actual rendered draw-call counts are unconfirmed;
   only the source-level selftest gate is confirmed to exist, not its
   current pass/fail result. Run tools/selftest.mjs first thing next
   session.
2. Draw-call margin for rock/ice/volcanic-seabed levels (mexico,
   newzealand, alaska, azores) is the tightest in the game - starting
   from a 117/120 shelf baseline before Rev 12's +3/+4 additions landed.
   Even though a selftest gate exists, this is the most likely level
   category to regress on any future decor addition.
3. Surface/floor behaviour has no direct evidence beyond the SDF_OPEN_Y
   constant and a code comment; never visually confirmed this session.

## Screenshots
None captured - no working browser harness in this worktree this session.
