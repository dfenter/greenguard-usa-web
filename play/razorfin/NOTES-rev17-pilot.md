# Rev 17 pilot: finish and present (2026-09-17)

Continues the Rev 17 family pipeline stopped 2026-08-29. Pilot five:
aresrender, artemisstrike, leviathanrex, snapjaw, thresher.
Nothing enters the game until Dan approves a turntable. RF_FAMILIES stays false.

## Baseline at session start (commit 4dd50e2)

The Rev 17 WIP tree (37 paths) was committed as-is before any fix, scoped
`git add play/razorfin` only, because another lane was committing under
sparkbridge/ in the same repo.

    verify_families  5/5 OK
    probe_jaw        3/5 PASS

    aresrender     PASS  upper OK  lower max=0.03875  stretch=1.232x
    artemisstrike  FAIL  upper OK  lower max=0.02783 (floor .030)  stretch=1.767x
    leviathanrex   FAIL  upper OK  lower max=0.11195  stretch=5.677x (limit 3)
    snapjaw        PASS  upper OK  lower max=0.10806  stretch=2.79x
    thresher       PASS  upper OK  lower max=0.0728   stretch=2.246x

### That 3/5 baseline was NOT a valid baseline (important)

The three PASS families were measured on GLBs baked 2026-08-29 that had
never been rebuilt against this session's code. The probe code was always
current; the ARTIFACTS were stale. Verified by extracting the three GLBs
from 4dd50e2 and re-probing with current probe code: they do reproduce
those numbers, so the staleness is in the bake, not the gate.

This matters because the session then changed mouth.py (+311/-83) and
io.py (+80), including the `_load_teeth` uniform-scale fix and the
nose-axis fix, both of which REQUIRE a rebake. So aresrender, snapjaw and
thresher were always going to have to be rebuilt, and their Aug 29 PASS
could never have survived contact with the new code.

Lesson: never treat a gate number as a baseline without confirming the
artifact was baked from current code. Rebake all families before reading a
gate table as the state of the tree. A stale PASS is worse than a FAIL
because it silently protects the wrong thing, and in this session it framed
a genuine first-time measurement as a regression.

This trap hit TWICE in one session. The second time, a sliver fix landed in
finish.py at 18:45:14 but only artemisstrike (18:48) and leviathanrex
(18:47) were rebaked; the three families the fix actually targeted still
carried 18:43 bakes. Their unchanged numbers read exactly like "the fix did
not work" when in fact the fix had never run. Worse, the two families that
WERE rebuilt both already passed stretch, so they exercised none of the new
code path.

STANDING RULE for this pipeline: before reading any gate table, compare the
mtime of every GLB against the mtime of the source file that was changed.

    ls -lT tools/sharklib/finish.py assets/models/fam/*.glb

If any GLB predates the code change, that row is a stale read and means
nothing. Do not reason about it, and never report it as a result. Rebake
first. Timestamps are also not sufficient to know WHICH code a bake
contains when several edits land close together: ask the lane what was in
the bake rather than inferring from the clock.

## Defects and what was found

### 1. io.measure nose-axis assumption (FIXED, lane C)

`io.measure()` assumed nose=+Y, but tigershark and thresher are nose=-Y.
L2 had worked around it caller-side instead of fixing io.py.

Fix: `_nose_sign()` derives polarity from the same girth signal `orient()`
already uses (mean radial mass of the +Y vs -Y half) plus a nose/tail
solidity tie-break. `measure()` calls it once and every downstream band
(t_of, jaw contour, head band, fin_groups, neck_plane, nose/tail_base)
flips consistently via a new `nose_sign` field.

Verified 4/4 on unoriented imports of all four bases: greatwhite_cy +1,
tigershark -1, thresher -1, whaler +1. Backward compatible: on an already
oriented mesh it degenerates to the original formula, byte-identical output.

Residual: on greatwhite_cy the girth signal alone reads backwards
(-Y girth 0.0825 > +Y 0.0496) and only the solidity tie-break lands it
correctly. Harmless in production because the real path runs `orient()`
first, where the signal is clean, but a future fifth base could resolve
wrong silently. `_nose_sign` defaults to the girth vote; flag for review
rather than trusting it blindly.

No caller passes coercion args. `head.py` `_measured_head_sign` /
`_coerce_measure` independently re-derives polarity; now redundant but not
double-flipping (it re-derives from io.measure's own corrected output).

### 2. Floating tooth strip under the chin (FIXED, lane B)

Affected every family. `mouth.py:_load_teeth` had `sy`/`sz` fixed at
.32/.18 independent of the `sx` used to fit the strip to measured mouth
width, oversizing the crown relative to the X compression so the strip base
landed about 0.02L off the seating rim.

Fix: uniform scale, `sy=sx`, `sz=sx`. Verified by eye on a rebaked
turntable (no detached white sliver) and numerically, seat distance
0.0016L against a 0.005L gate.

### 3. Whaler head holes / notched silhouette (UNRESOLVED)

`head.py` `holes_fill` only fires when total mesh boundary edges < 4096.
Whaler has 6046 mesh-wide, so the fill SILENTLY NEVER RAN. That is why the
defect survived several earlier rounds.

Scoping the fill to the head band (t >= 0.76, about 1609 edges) in a new
`_repair_head_region` got it executing, but the through-hole PERSISTS after
rebake. Diagnostic: 1609/1609 head boundary edges are nonmanifold, i.e. a
genuine open gap in the source scan, not backfaces, and `holes_fill` does
not bridge it even when properly scoped.

Next step: bridge_loops or a manual fan across the gap, and confirm whether
the op actually runs or silently no-ops on this topology.

Note: that rebake also dropped artemisstrike from 8359 to 6398 tris, so the
silhouette differs from the measured baseline.

### 4. Jaw weight map vs post-remesh topology (ROOT CAUSE, escalated)

The artemisstrike lip-travel shortfall and the leviathanrex stretch failure
are ONE defect, not two.

`mouth._jaw_weight_map` assigns LowerJaw skin weight purely by vertex
position, and `shark_variant.py` deliberately cuts the mouth LAST, after
`accessories.apply_accessories` has run a voxel remesh plus graft weld and
after head.lattice/fins moved body vertices. So the weight function
evaluates a steep smoothstep gradient against topology it was never tuned
for. The function is a stack of base-specific positional patches, with
comments tagged L1b, L1c, L1d, L1e, each tuned to one base's mesh. That
accretion is the defect.

Evidence:
- leviathanrex: with plate_row removed the same family probes 1.548x and
  PASSES. With it, a physically tiny (~0.001L) edge carries endpoint
  weights 0.575 vs 0.236, which probe_jaw reports as 5.677x stretch.
- artemisstrike: the positional band lands near the hinge where the lever
  arm is about 0, so lip travel is 0.0205-0.0278L against the 0.030L floor.

Two Sonnet attempts failed and were reverted (both measured WORSE than
baseline, neither accepted):
- remove_doubles after the region remesh: stretch 5.677x -> 8.321x and
  broke the previously passing upper-move gate (0 -> 0.00346). A blind
  doubles merge welded vertices across the Head/LowerJaw boundary.
- keep_from_t 0.75 -> 0.68: geometry collapse, bbox L 1.0 -> 0.44,
  stretch 7.95x.
- ramp width .30*span -> .20*span: artemisstrike lower max 0.02783 ->
  0.02047, i.e. further from the floor.

Per feedback_gate_round_cap.md, two failures on the same model means stop
point-fixing and rule on the model. Ruling: decouple the weight gradient
from remesh-induced topology by snapshotting the weight map on the
pre-remesh mesh and projecting each post-remesh, post-decimate vertex's
weight from its nearest pre-op vertex (KDTree lookup), instead of
recomputing positionally on final topology. This should let most of the
per-base L1b-L1e special casing be deleted.

### 5. Degenerate slivers created AFTER the sliver pass (SECOND root cause)

Once the weight transfer and the gradient cap were in, three families still
failed stretch (aresrender 4.021x, snapjaw 4.197x, thresher 4.476x, the last
one identical across two different weight configurations). Dumping the worst
edge per family instead of reading aggregates showed why:

    aresrender  stretch=4.02  rest=9.9e-4  jawW=0.774/0.721
    snapjaw     stretch=4.20  rest=1.3e-3  jawW=0.336/0.353
    thresher    stretch=4.48  rest=1.5e-4  jawW=0.483/0.483

Both endpoints carry essentially the SAME jaw weight. There is no gradient
across these edges, so no weight rule of any kind can act on them, which is
exactly why thresher never moved. What they have instead is rest lengths of
1e-4 to 1e-3 of L: two vertices almost exactly coincident, both riding the
jaw, so float differences in the rotation blow up openLen/restLen.

Source: finish.py already had a jaw-seam sliver collapse, but it ran inside
`_join_mouth_objects` (line ~490) while the budget COLLAPSE decimate ran at
line ~1068. A collapse decimate MAKES near-coincident survivors, and nothing
ran after it, so the slivers shipped in the GLB.

Fix: `_collapse_post_decimate_slivers`, called immediately after the budget
decimate (finish.py:1084), reusing the same weight predicate and
percentile-relative length limit as the existing pass so it cannot run away
on dense topology.

THE PATTERN WORTH REMEMBERING: this is the same defect shape as the main
ruling. An operation whose output is consumed by a stage that already ran.
First the weight map was recomputed after the remesh that invalidated it;
then the sliver collapse ran before the decimate that manufactures slivers.
When a gate fails in this pipeline, check ORDERING before tuning constants.

Second lesson: dump the worst offending edge, do not infer from aggregates.
Three rounds were spent on distance-based band tuning that could never have
worked, and one edge dump settled it. The weight columns are what proved
the remaining failure was not a weighting problem at all.

## Compute lanes

### gg-wsl is usable for these bakes, with caveats

First check this session found NO Blender 3.6 on the worker: only system
5.0.1 (a distro build with NO numpy, so `export_scene.gltf` throws
ModuleNotFoundError, and paint.py is a numpy rasteriser) and a bundled
4.4.3. A CPU-Cycles-only microbenchmark had the worker SLOWER than the mini
(0.9s vs 0.7s), so the first ruling was to stay local.

Blender 3.6.19 was then installed at `~/.local/bin/blender36` and validated
byte-identical to the mini on shark_bake.py (494 tris, same coverage/mean,
94632 bytes both hosts). On a full pipeline run the worker wins on wall
clock (1.40s vs 3.17s) because of process startup and IO, not GPU: there is
NO GPU Cycles device inside WSL on that box, CPU only.

So the worker is a valid SECOND Blender slot, not a faster one per-op.
Budget is one Blender on the mini plus one on the worker.

Launch recipe (staged copy lives at `~/razorfin_bake`):

    cat script.py | ssh gg-wsl-lan 'wsl -d Ubuntu -- bash -lc "cat > /tmp/x.py; cd ~/razorfin_bake && ~/.local/bin/blender36 -b --python /tmp/x.py -- <args> > /tmp/x.log 2>&1; cat /tmp/x.log"'

Gotchas:
- NO `--gpu-backend opengl` on the worker; that flag is a macOS-only
  workaround. On the mini it MUST precede `-b`.
- `gg-wsl-lan` lands in cmd.exe, so any `|` or `>` inside the outer ssh
  command string is eaten by the Windows shell ("not recognized as an
  internal or external command"). Pipe scripts via stdin, filter locally.
- Push edited code before every worker bake or you bake stale:
  `cd play/razorfin && tar czf - tools | ssh gg-wsl-lan 'wsl -d Ubuntu -- bash -lc "cd ~/razorfin_bake && tar xzf - && echo PUSHED"'`
- ONE Blender per host. On the mini, no output at all plus rc=1 means
  contention: wait and retry.
- Worker RAM is tight (about 4.5 GB available, 6 cores). Do not run
  alongside a live CI run or the Ignition 8.3 gateway on that box.

### Orphaned waiter loops

The wait-for-free-slot retry loops outlive a stood-down lane. After
standing lanes down, check `pgrep -f "MacOS/Blender"` and kill orphaned
bash waiters, or they will spawn bakes with stale code and steal the slot
from the active lane.

## Commands

    # gates
    cd play/razorfin
    node --import ./tools/reg.mjs hse/verify_families.mjs
    node --import ./tools/reg.mjs hse/probe_jaw.mjs assets/models/fam/*.glb

    # regenerate a family (leviathanrex comes from sharkjira.json)
    /Applications/Blender.app/Contents/MacOS/Blender --gpu-backend opengl -b \
      --factory-startup --python tools/shark_variant.py -- --recipe tools/recipes/<name>.json

Recipe to family mapping (note the mismatch):

    aresrender.json     -> aresrender     (tigershark)
    artemisstrike.json  -> artemisstrike  (whaler)
    sharkjira.json      -> leviathanrex   (greatwhite_cy)
    snapjaw.json        -> snapjaw        (tigershark)
    thresher.json       -> thresher       (thresher)

There is no leviathanrex.json.

## Status

See the final section appended at completion for the gate table, commit
SHAs and the contact sheet path.

## Rev 17 orchestration lane, 2026-09-17 (successor lane)

**Bake command: `--recipe` is REQUIRED.** `shark_variant.py` takes the recipe as a
named flag, not a positional. The form circulating in the orchestrator handoff and
in this file's command block omitted it. That failure is silent in the dangerous
way: argparse exits in under a second, writes no GLB, and leaves the previous
artifacts in place with their old mtimes. Read a probe table at that moment and
three unchanged families look exactly like "the sliver fix did nothing." This is
the same stale-read trap that has already cost this project two rounds, arriving
by a third route. Both files are corrected. Always run the mtime check
(`ls -lT tools/sharklib/finish.py assets/models/fam/*.glb`) after a bake, not just
before a probe: it catches a bake that never ran, not only one that ran early.

**Pin contamination, accepted and recorded.** The aresrender/snapjaw/thresher
rebakes were supposed to carry no bundled changes so the post-decimate sliver
collapse got a clean test. `JAW_INTERIOR_PIN` (mouth.py, .55) was already live in
the working tree and is not separable without reverting a fix lane's uncommitted
work, so these three bakes contain it. Judged low contamination: the pin gates
gradient relaxation, the hypothesis under test is sliver collapse, and the two
touch different stages. If these three come back ambiguous, suspect the pin before
concluding anything about the sliver fix.

**Worker lane.** `~/razorfin_bake` on gg-wsl initially held only `tools` plus a
partial `assets/models/fam` (no textures, no leviathanrex), so it would have baked
against incomplete inputs. Now seeded with tools + assets/{models,kit,textures}.
Push code AND assets before every worker bake or you bake stale.

**Art-law flag for the gate.** `tools/recipes/sharkjira.json` (leviathanrex) carries
a `glow_seams` block, cyan #7fd0e8 at strength .18. feedback_razorfin_real_sharks.md
forbids teal/neon/glow outright. Not edited here (recipes are the fix lane's), raised
to the eyes-on gate as a likely HOLD item.

### Coordinator ruling 2026-09-17: glow_seams stripped from sharkjira.json

The leviathanrex recipe carried `paint.glow_seams` (width .012, colour #7fd0e8
cyan, strength .18). feedback_razorfin_real_sharks.md bans glow and teal outright:
the kaiju/fantasy rows are "natural shark base + ONE restrained accent", and the
coordinator ruled that accent must be a non-emissive colour or a geometry feature
(the charcoal plate ridge already in `accessories` qualifies). Block removed from
the recipe and leviathanrex rebaked before the eyes-on gate, so the gate reviews a
compliant asset rather than spending a round rediscovering a known violation.

Mechanically safe: `_schema.json` does not list glow_seams as required, and
paint.py reads it via `config.get("glow_seams")` behind a falsy guard, so absence
skips the layer. sharkjira.json was the only recipe of the five using it.
Pre-change copy at /tmp/sharkjira.json.bak for the fix lane.

FIX LANE: this is a coordinator decision on your file, not a drive-by edit. If you
want the accent back, it has to be non-emissive.

## Final bake and gate, 2026-09-17 (orchestration lane)

All five baked once against settled source (finish.py 18:58:53, mouth.py 18:58:43,
sharkjira.json 18:54:08); GLBs 19:03:47-19:05:15, all postdate every source file.
Clean read, no stale rows. Mini baked aresrender/snapjaw/thresher, gg-wsl baked
leviathanrex/artemisstrike; finish.py+mouth.py md5 verified identical on both hosts
before launch.

    family         verify  upper  lower(n)  travel        stretch   verdict
    aresrender     OK      OK     15        .0663-.0948   4.021x    FAIL
    artemisstrike  OK      OK     18        .0347-.0554   1.138x    PASS
    leviathanrex   OK      OK     18        .0684-.1092   1.166x    PASS
    snapjaw        OK      OK     142       .0735-.1081   4.197x    FAIL
    thresher       OK      OK     52        .0431-.0728   3.996x    FAIL

verify_families 5/5 (tris 8014-8790, textures 19-34 KB, all budgets clean).
probe_jaw 3/5.

WINS. JAW_INTERIOR_PIN worked: leviathanrex lower(n) 4 -> 18, clearing the n>=6
floor, stretch 1.166x. artemisstrike travel now over the .030L floor at 1.138x.
Gradient cap converges 5/5 (sweeps 3-4, residual 0.000000) after the unsatisfiable
-edge fix; pinned_unsatisfiable 4/42/145/22/31.

SLIVER HYPOTHESIS: TESTED AND DISPROVEN for the three tigershark/thresher families.
With the collapse dedented out of the decimate branch it demonstrably RAN on all
three (115, 29, 41 slivers collapsed) and stretch did not move: 4.021 (unchanged),
4.197 (unchanged), 3.996 (from 4.476, and that family also converged differently).
Removing the degenerate geometry is correct and worth keeping, but it is NOT the
cause of the 4x stretch on these three. Whatever drives it survives both the weight
transfer and the sliver removal. Next lane: dump the worst edge again POST-collapse
(the earlier dump predates all of this session's fixes) rather than assuming the
old 0.483/0.483 finding still describes the failure.

ART LAW, eyes-on by the orchestrator on the contact sheet:
- aresrender and snapjaw are a strong ORANGE/copper brown, not tiger bronze with
  stripes. Reads closer to a goldfish than a tiger shark. Likely FAIL on species
  colour.
- leviathanrex is olive/khaki green over the whole body. Not a great white slate
  grey. Green is not a shark colour; likely FAIL even with glow_seams removed.
- artemisstrike and thresher read plausibly (grey-green and blue-grey, near-white
  bellies). The whaler head notch is still visible on artemisstrike.
- No teal, neon or glow anywhere after the recipe fix. Bellies are near-white 5/5,
  eyes black, teeth white.

### Opus LOW eyes-on gate, one capped round, verdict FAIL 1/5

    aresrender     FAIL  salmon/copper brown, belly tan not near-white, no tiger striping
    snapjaw        FAIL  desert sand/khaki, faint dorsal barring present, belly pale tan
    thresher       PASS  cool blue-grey, proper counter-shaded near-white belly, black
                         eyes, white teeth. The only family that reads as a real animal.
    artemisstrike  FAIL  pale olive/sage green, belly off-white greenish
    leviathanrex   FAIL  mossy olive-green whole body; the dorsal plate ridge reads as
                         large black spiky armour nodules, not a restrained accent

Glow/teal check explicit: NONE anywhere. The glow_seams removal held. The art problem
is now green, not cyan.

Gate's highest-priority fix: kill the green. Re-base artemisstrike and leviathanrex on
thresher's actual grey material and counter-shading, then re-tint per species. Thresher
proves the pipeline can produce a documentary-looking shark, so this is a paint/recipe
problem (species_hsv per recipe), not a pipeline capability problem.

This matches the orchestrator's own read of the sheet independently. Two failure axes
are now separate and both open: JAW STRETCH (geometry, 3 families) and SPECIES COLOUR
(paint, 4 families). They are unrelated and should be worked in separate lanes.

### Fable final read: HOLD

1. Zero families pass BOTH gates. The two PASS sets are disjoint: jaw PASS is
   artemisstrike + leviathanrex, art PASS is thresher only.
2. Art 1/5 is a failed round, not WIP. Fix cap already spent.
3. Fable also advised NOT sending Dan the sheet at all, arguing a turntable you
   expect him to reject trains him to ignore the queue.
4. Fable flagged that the diff mixes genuinely good tooling work (JAW_INTERIOR_PIN,
   unconditional sliver collapse, gradient-cap convergence fix, glow_seams removal)
   with known-bad binary GLBs and turntables, and suggested splitting them.

ORCHESTRATOR DISPOSITION: HOLD confirmed. Per the lane instruction the contact sheet
still goes to Dan labelled NOT APPROVED, because he asked to see the state of the
work; Fable's objection is recorded but the standing instruction wins. NOT committed:
the handoff conditions the commit on SHIP, and Fable's point 4 is right that the
assets and the tooling should not land as one commit. Left uncommitted for the next
lane rather than split unilaterally, since finish.py/mouth.py belong to the fix lane.

STATE FOR THE NEXT LANE: RF_FAMILIES false, nothing deployed, nothing committed,
tree as listed in the handoff plus this round's changes. Two independent open
problems, work them in separate lanes:
  A. JAW STRETCH 4x on aresrender/snapjaw/thresher. Sliver hypothesis disproven.
     Dump the worst edge POST-collapse; the old 0.483/0.483 dump predates every fix
     this session and no longer describes the failure.
  B. SPECIES COLOUR on 4 of 5. Paint problem, per-recipe species_hsv. thresher is
     the known-good reference; re-base the others on its grey material and re-tint.

## Rev 18 lane, 2026-09-18: residual A root cause FOUND (gate defect, not mesh defect)

### The 4x stretch was a PROBE ARTIFACT. The meshes were never torn at 4x.

`hse/probe_jaw.mjs` posed the hinge ABSOLUTELY: `jawBone.rotation.x = REST_RAD`
with REST_RAD defaulting to 0. But every family GLB exports its LowerJaw with a
rest rotation near 3.07 rad (~176 deg):

    aresrender 3.0766   artemisstrike 3.0741   leviathanrex 3.0594
    snapjaw    3.0761   thresher      3.0694

So `rotation.x = 0` did not mean "closed". It swung the jaw through 176 degrees
into an anatomically impossible pose, and THAT was used as the rest length
denominator. Measured on thresher, the worst edge is a genuine 1.850e-3 in the
real mesh and 2.004e-4 in the crushed pose, a 9.2x compression. Opening from
there and dividing produced "3.996x stretch" on healthy geometry.

The tell was in the data the whole time: 3.996x was BIT-IDENTICAL across five
rebakes with different vertex counts (7592 / 7591 / 7368) and four different
weight configurations. A quantity that does not move when the mesh underneath it
changes is not a property of the mesh. Last round read that same invariance as
"the fix did not work" and went looking for a deeper geometry bug.

Runtime never had this bug. `rig_morph.writeJawGape` restores
`authority.closedBase` and applies the gape as a RELATIVE `rotateOnAxis`, so the
game always posed from the true rest. Only the gate was wrong, which is why
eyes-on turntables never showed the tearing the gate reported.

### What was fixed

`hse/probe_jaw.mjs` now captures the bone's authored rest quaternion and poses
`base -> rotateOnAxis(hinge, angle)`, identical to the runtime writer. REST_RAD
and OPEN_RAD are now explicitly angles RELATIVE to rest.

New `hse/dump_stretch.mjs`: dumps the worst N stretching edges per GLB with rest
length, open length and both endpoint jaw weights. This is the tool that should
be reached for first on any future stretch failure. Reading aggregates is what
cost the last three rounds.

### Hypotheses tested and DISPROVEN this lane (do not re-run these)

1. Single-pass sliver collapse. Iterating the collapse to a fixed point does
   converge (2-3 sweeps, 120 then 40 collapsed on thresher) but moved stretch
   by exactly 0.000. Reverted.
2. Unconditional degenerate-edge collapse regardless of jaw weight (311 edges
   collapsed, verts 7631 -> 7368). Stretch unchanged at 3.996x. Reverted.
3. Final-mesh gradient cap run after the budget decimate. This one is REAL and
   worth revisiting: `mouth._limit_weight_gradient` runs on the mouth-local band
   (2455 edges on thresher) but the exported mesh has 16312, because accessories
   voxel-remeshes and the budget decimate re-triangulates afterwards. Measured on
   the export, 116 edges carry a full jaw-weight CLIFF (|dJaw| median 0.58, up to
   0.98). A cap applied on final topology took that to 102 and cut
   pinned_unsatisfiable 137 -> 30 when allowed to raise the LOW endpoint as well
   as lower the high one. It did NOT change probe stretch, because the probe
   number was fake. Reverted here to keep this commit to the proven fix, but the
   underlying ordering defect is genuine and is the right next lane if real
   tearing needs reducing.

### OPEN NOW, and it is bigger than residual A was

With the gate corrected, real stretch on a true 0.72 rad relative open is:

    family         stretch   lower-lip n
    aresrender      5.58x    51
    artemisstrike  44.91x    37
    leviathanrex   14.66x    18
    snapjaw        26.40x     0   <-- classifier finds no lower lip at all
    thresher       28.84x   340

Also note `authority.openRadians` in rig_morph is the FULL open travel and is
about 26 deg (0.45 rad), not 0.72. The probe's 0.72 default overshoots real
travel by ~60% and should be reconciled with the runtime authority before these
numbers are treated as the bar. At 0.45 rad aresrender is 3.63x and at 0.35 rad
it passes at 2.90x; the other four remain far out.

So: the pipeline has genuine skin tearing that the broken gate was masking for
the whole of Rev 17. Fix the gate's open angle against rig_morph first, then work
the tearing with dump_stretch.mjs, then re-run the ordering fix in item 3.

### Residual B (species colour) NOT started this lane.
