# Rev 17 residual A (jaw stretch) - lane A3, 2026-09-17

Continues lane A2 (commit 9ca35e20), which found probe_jaw's stretch metric had
no valid basis and stopped rather than guess at a pose.

## 1. JAW_HINGE_AXIS is CORRECT. The axis was never the problem.

A2's leading hypothesis was that local +X is not the anatomical hinge given the
~pi bind rotation. Tested empirically per bake rather than assumed: search the
unit sphere for the axis that maximises LowerJaw-weighted lip travel along the
head-centroid-to-jaw-centroid direction, then hill-climb.

    family         best empirical axis          travel/0.3rad   +X travel   angle off +X
    aresrender     0.9704,-0.0962,-0.2213       0.00738 L       0.00722 L   ~14 deg
    artemisstrike  0.9585, 0.1330, 0.2522       0.00981 L       0.00951 L   ~17 deg
    leviathanrex   0.9980, 0.0000,-0.0633       0.02313 L       0.02310 L   ~4 deg
    snapjaw        0.9972, 0.0277, 0.0691       0.03596 L       0.03587 L   ~4 deg
    thresher       0.9882, 0.0881, 0.1257       0.01018 L       0.01008 L   ~9 deg

+X is within 2% of optimal travel on all five. The residual tilt is the jaw
band's own asymmetry, not a different hinge. JAW_HINGE_AXIS stays local +X in
both rig_morph.js and the probe. No change needed.

Also worth recording: upper-head movement is exactly 0.0 for EVERY candidate
axis. LowerJaw is a leaf bone, so the probe's upper-head gate cannot fail by
construction. It has been reporting OK for its whole life without testing
anything. Flagged, not fixed - see open items.

## 2. The rest pose was the defect. Probe corrected and VALIDATED.

`hse/probe_jaw.mjs` now poses rest as the LowerJaw BIND QUATERNION exactly as
authored in the GLB, and open as `bindQuat` then
`rotateOnAxis(JAW_HINGE_AXIS, OPEN_RAD)`. That is `rig_morph.writeJawGape`
verbatim (restores `authority.closedBase`, captured rig_morph.js:1019, then
rotates about the hinge). REST_RAD is gone; it had no meaning.

Validated BEFORE trusting it, on a synthetic rig built in memory
(scratchpad synth3.mjs), in both directions:

    case                          OLD basis   BIND basis   ground truth
    rigid all-jaw,     bind ~pi     1.000       1.000        1.000
    rigid all-head,    bind ~pi     1.000       1.000        1.000
    binary-weight slab, bind ~pi   10.773       1.000        1.000   <-- old basis invents 10.8x
    binary-weight slab, bind 0      1.000       1.000        1.000
    weight-gradient edge, bind ~pi  1.000       1.171        >1      <-- old basis MISSES the real defect
    weight-gradient edge, bind 0    1.171       1.171        >1

So the old number was measuring the bind rotation, not skin deformation: it
manufactured tearing on perfect geometry and was blind to genuine gradient
tearing. Both failure modes are fixed. The two bases agree exactly when the
bind rotation is zero, which is the expected degenerate case.

A2's 5.58/44.91/... table was NOT a bad measurement. It is the correct one.

## 3. Five-family re-baseline, old vs new

    family         OLD stretch  OLD verdict | NEW stretch  edges>3x  NEW verdict
    aresrender     4.021x       FAIL        |  5.581x       27/23694  FAIL
    artemisstrike  1.138x       PASS        | 44.913x       48/23763  FAIL
    leviathanrex   1.166x       PASS        | 14.664x       91/25050  FAIL
    snapjaw        4.197x       FAIL        | 26.395x      120/22712  FAIL
    thresher       3.996x       FAIL        | 11.350x       74/23812  FAIL

    probe_jaw: was 3/5 PASS, now 0/5.

The old 3/5 is confirmed worthless: BOTH families that previously passed
(artemisstrike, leviathanrex) are in fact the worst and second-worst. The old
basis was protecting exactly the wrong assets, which is the stale-PASS failure
mode NOTES-rev17-pilot.md already warned about, arriving by a fourth route.

Note the lower-lip gate also moved (snapjaw now n=0) because that classifier
reads rest positions, which legitimately changed with the rest pose. Its region
thresholds were tuned against the old pose and need re-deriving - open item.

## 4. YES, a real geometry defect survives the corrected probe.

Confirmed real by two independent tests, not by the magnitude alone.

**Linearity.** Stretch scales exactly linearly with open angle, which is the
signature of genuine rigid-skinning shear. A numerical blowup off near-coincident
vertices would not be linear.

    family         0.18rad      0.36rad      0.72rad
    aresrender     1.77x  n=0   2.98x  n=0    5.58x  n=27
    artemisstrike 11.31x  n=1  22.72x  n=11  44.91x  n=48
    leviathanrex   4.48x  n=4   7.95x  n=19  14.66x  n=91
    snapjaw        6.95x  n=24 13.54x  n=41  26.39x  n=120
    thresher       2.82x  n=0   5.48x  n=19  11.35x  n=74

**Cause is the weight gradient, NOT short edges.** For the >3x edge set versus
all edges:

    family         >3x meanDeltaW  all meanDeltaW  >3x meanRest  all meanRest
    aresrender     0.239           0.013           5.20e-3 L     9.05e-3 L
    artemisstrike  0.559           0.003           6.71e-3 L     6.04e-3 L
    leviathanrex   0.716           0.004           1.67e-2 L     1.05e-2 L
    snapjaw        0.441           0.008           7.08e-3 L     7.41e-3 L
    thresher       0.473           0.017           7.00e-3 L     8.54e-3 L

Weight delta on the failing edges is 30x to 180x the mesh average, while their
rest lengths are ORDINARY - at or above the mesh mean on three of five. This
kills the sliver theory for good (A2 had already disproven it empirically) and
confirms the defect is a steep Head-to-LowerJaw weight gradient across normal
edges at the jaw seam.

Every worst edge is a Head/LowerJaw blend pair, e.g.
thresher `Head:0.90 Neck:0.10` || `LowerJaw:0.57 Head:0.41 Neck:0.02`.

It is LOCALISED: median stretch is 1.000 on all five, p99 is 1.000-2.47, and
only 27-120 of ~23,000 edges exceed 3x. This is a seam-band problem, not a
broken rig.

## 5. Where the fix goes, and the trap to avoid

`tools/sharklib/mouth.py:_limit_weight_gradient` is ALREADY the right mechanism
and already bounds exactly this quantity (per-edge weight delta against
`EDGE_STRETCH_BUDGET * (rest/L) / arm`). It does not need replacing.

The problem is that `EDGE_STRETCH_BUDGET = 1.6` (mouth.py:893) and
`JAW_INTERIOR_PIN = .55` (mouth.py:899) were both calibrated against the OLD,
INVALID probe. They were tuned to satisfy a number that was measuring the bind
rotation. That is why the cap "converges 5/5 with residual 0.000000" while the
asset still tears: it is converging to the wrong budget.

DELIBERATELY NOT DONE HERE. Re-deriving the budget is a bake-loop task and I am
handing off with a corrected oracle rather than spending the remaining budget
tuning against an oracle I changed five minutes ago - that is how the last three
rounds were lost. The next lane starts from a probe that is validated in both
directions, which is what was missing every previous round.

Next lane, in order:
1. Re-derive EDGE_STRETCH_BUDGET from the corrected probe. The budget is
   dimensionally a stretch bound, so with STRETCH_MAX 3.0 the principled value
   is near 3.0, not 1.6. Derive it, do not search for it.
2. Re-check JAW_INTERIOR_PIN. The pin exists to stop the band collapsing under
   the probe's `jw>0.4` lower-lip classifier; if that classifier is re-derived
   (item 4) the pin's justification changes with it.
3. Rebake all five and re-read. Expect movement on all five, including the two
   that used to pass.
4. Re-derive the lower-lip region thresholds against the bind rest pose.
   Currently snapjaw classifies 0 lip vertices, which is a classifier artifact.
5. Decide what to do about the vacuous upper-head gate. Either drop it or
   re-point it at something that can actually fail (e.g. Head-weighted vertices
   under a Head-bone perturbation).

## Rules observed

No bake was run this lane: the corrected probe reads existing GLBs, so no
Blender slot was taken on either host and the paint lane kept its slot. mtime
check done before the probe read (finish.py 19:36:24; aresrender 19:39:08,
snapjaw 19:38:27, thresher 19:38:54 all postdate it; artemisstrike 19:04:59 and
leviathanrex 19:04:40 predate it and are stale w.r.t. the sliver iteration -
recorded here because the conclusion does not rest on them, their defect is
gradient-driven and both are far outside the gate, but they MUST be rebaked
before the next gate table is read). Colour/recipe/species_hsv untouched.
Scoped `git add play/razorfin/hse/probe_jaw.mjs` plus this file only; the
modified GLBs and recipes in the tree belong to other lanes and were not staged.
