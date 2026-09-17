# NOTES rev17 - Lane S3 (verification)

Owns: `hse/inspect_glb.mjs`, `hse/probe_jaw.mjs`, `hse/review_sheet.py` (new),
`hse/evidence/r17/` (new dir + `r17_shots.mjs`), `hse/verify_families.mjs` (new).
Did not touch game source or `tools/sharklib`.

## What exists already vs what this lane added

- `hse/inspect_glb.mjs` already existed (a prior lane's headless GLB contract
  check: tris, images, materials, bones, bbox). Left as-is; it still serves
  as a general inspector. `hse/verify_families.mjs` is the rev17-specific
  gate the plan asks for -- it re-implements the glTF-JSON-chunk read (no
  shared code with inspect_glb.mjs, deliberately, since inspect_glb.mjs is
  not owned-for-rewrite by this brief) with the exact rev17 pass/fail
  thresholds and adds the checks inspect_glb.mjs does not do: exact orphan
  weight count and per-row jpg size.
- `hse/probe_jaw.mjs` already existed, but built shark rigs through the
  GAME's own `shark3d.js buildShark(def)` against row ids in `data.js` --
  useful for the runtime rig, but cannot test a bare `assets/models/fam/*.glb`
  file that has no row def yet (which is the state of the world: `fam/` is
  empty). Rewrote it to load a GLB FILE DIRECTLY via the project's vendored
  `play/_shared/three/GLTFLoader.js` + `three.module.min.js` (loader
  `.parse()` on the raw ArrayBuffer, no fetch needed, so Node's lack of a
  fetch-backed FileLoader environment doesn't matter -- only
  `globalThis.self = globalThis` was needed to satisfy the loader's texture
  path, which errors harmlessly since embedded texture pixel data is never
  needed for the geometric jaw probe). Poses `LowerJaw` at `REST_RAD` (0) and
  `OPEN_RAD` (0.72 rad, both overridable via env) and asserts:
  upper-head vertices move <= 0.002*L, lower-lip vertices move >= 0.03*L,
  no triangle edge stretches > 3x. Region classification (upper head vs.
  lower lip) is derived from skin weight to Head/LowerJaw plus a
  height/length fraction window on the bind-pose bbox, using the model's own
  two largest bbox axes as forward/up (mirrors the axis convention in
  `hse/probe_axes2.mjs`).

## Proof run against the four approved bases (stand-ins; no `fam/*.glb` exist yet)

`assets/models/fam/` and `assets/textures/rows/` are both empty as of this
run -- the rev17 pipeline (Luna L1-L3, Sonnet S2) has not shipped a family
GLB or a row texture yet. Every script below was proven against the four
approved bases (`greatwhite_cy.glb`, `thresher.glb`, `tigershark.glb`,
`whaler.glb`) as stand-ins, per the brief, plus a synthetic bad GLB this
lane's script generates on demand.

### `hse/verify_families.mjs` (`STANDINS=1 BAD=1 node hse/verify_families.mjs`)

```
greatwhite_cy.glb  tris=6784 mb=0.558 skinned=1 bones=8 orphan=0 texMax=1024  OK
thresher.glb       tris=6790 mb=0.688 skinned=1 bones=8 orphan=0 texMax=1024  OK
tigershark.glb     tris=6790 mb=0.594 skinned=1 bones=8 orphan=0 texMax=1024  OK
whaler.glb         tris=6750 mb=0.643 skinned=1 bones=8 orphan=0 texMax=1024  OK
.synthetic_bad_r17.glb  tris=9500 mb=0.056 skinned=2 bones=2 orphan=10 texMax=2048  FAIL
  -- tris 9500>9000; skinned meshes=2 (want 1); bones mismatch
     missing=[Tail2,Tail1,Spine2,Spine1,Neck,Head,LowerJaw] extra=[ExtraBoneNotAllowed];
     orphan weights=10; texture 2048px>1024px
```
All four real bases pass every gate; the synthetic bad GLB fails on all five
axes at once, proving the gate actually discriminates. No `assets/textures/
rows/*.jpg` exist yet (0 checked, budget gate ready).

### `hse/probe_jaw.mjs` (`node hse/probe_jaw.mjs assets/models/{greatwhite_cy,thresher,tigershark,whaler}.glb`)

```
REST_RAD=0 OPEN_RAD=0.72
greatwhite_cy.glb  L=0.9928  upper(n=690) move=0.00473 limit=0.00199 FAIL  lower(n=319) min=0.02953 max=0.06003 limit=0.02978 FAIL  stretch=14.472x limit=3 FAIL  FAIL
thresher.glb       ERROR no vertices weighted to LowerJaw
tigershark.glb     L=0.9979  upper(n=569) move=0.0014  limit=0.002  OK    lower(n=0)   min=null   max=0        limit=0.02994 FAIL  stretch=1.604x  limit=3 OK    FAIL
whaler.glb         L=0.9951  upper(n=1420) move=0.00385 limit=0.00199 FAIL lower(n=0)  min=null   max=0        limit=0.02985 FAIL  stretch=2.979x  limit=3 OK    FAIL
```
All four bases FAIL the geometric jaw contract. This is the expected,
documented state of the world per PLAN-rev17-families.md's own diagnosis:
these are photogrammetry scans with "a generic skeleton not aligned to the
mesh, no mouth interior" -- there is no real lower-lip geometry to move and
no hinge plane the mesh actually respects, so a real family GLB (with a
modeled mouth, jaw hinge and lip loop per Step 1.3) is required to pass.
The harness itself is proven: it loads real GLBs, poses the bone, measures
real per-vertex displacement and per-edge stretch, and reports honest
numbers rather than false-passing on scan geometry. thresher.glb has zero
vertices weighted to LowerJaw at all (>0.5 weight threshold) -- also
consistent with "no mouth interior, generic skeleton" and is reported as an
ERROR rather than a silent pass.

### `hse/review_sheet.py`

Ran three ways: (1) against a real-empty `assets/review/` -- 0 images,
emits a clean "nothing to compose yet" placeholder sheet and exits 0 (no
crash on empty input, which matters since no family turntable exists yet);
(2) with two fake turntable PNGs dropped in -- composed a 2-cell labelled
sheet correctly, then those test files were deleted; (3) confirmed no
S1/L1/L2 rev17 review PNGs exist under `hse/` yet (checked, none found --
this is a rev17-specific naming convention, not yet produced by any lane).

### `hse/evidence/r17/r17_shots.mjs`

Row ids differ from base filenames (roster ids are `greatwhite`, `thresher`,
`tiger`, `whaleshark`, not the base .glb names) -- used those four ids.
Copied the shoot.mjs pattern (index.html?unlockall=1, sw.js 404, real
menu->level->dive UI drive via RF.Meta.sessionSelected + dive button clicks,
landscapePrimary CDP override, CDP screenshot) for one profile shot per row,
then added a jaw trace reusing jaw_strip.mjs's posed-bite-cycle technique
(pose bc.phase/t/from + anim.jawGape directly, call rig.animate, read the
LowerJaw bone's local-X angle back off the live rig) across 5 poses
(idle, open 50%, open 100%, close 50%, close 100%), screenshotting each.
Run against `IDS=greatwhite,thresher,tiger,whaleshark` (the four roster row
ids for the approved-base stand-ins): all 4 rows `started: "ok"`, 0 errors,
one `<id>_profile.png` + 5 jaw-pose screenshots (`idle_000`, `open_050`,
`open_100`, `close_050`, `close_100`) each in `hse/evidence/r17/shots/`,
plus `report.json` with the per-frame LowerJaw angle trace:

```
greatwhite  idle=1.86deg  open50%=5.99deg  open100%=10.11deg  close50%=3.10deg  close100%=-3.91deg
thresher    idle=23.87deg open50%=28.00deg open100%=32.12deg  close50%=25.11deg close100%=18.10deg
tiger       idle=24.27deg open50%=28.40deg open100%=32.52deg  close50%=25.51deg close100%=18.50deg
whaleshark  idle=1.86deg  open50%=5.99deg  open100%=10.11deg  close50%=3.10deg  close100%=-3.91deg
```
Angle climbs monotonically idle->open50->open100 then falls back down through
close50->close100 for all four rows, i.e. the posed bite cycle drives the
live LowerJaw bone as expected in every case. greatwhite/whaleshark and
thresher/tiger share identical numbers pairwise, consistent with rows on the
generic skeleton sharing jaw envelope constants; not a harness bug (checked
against `report.json`, both pairs got independent page loads/runs).

## Did NOT do

- Did not touch `shark3d.js`, `tools/sharklib`, `tools/gen_data.py`, or any
  other lane's files.
- Did not commit anything (per brief).
- Did not build `hse/verify.mjs`'s family-gate rewrite (that is explicitly
  Step 4 / a later wiring task, not listed among this lane's four
  deliverables).

## Final line

See end of this file / task report for PASS/PARTIAL verdict.
