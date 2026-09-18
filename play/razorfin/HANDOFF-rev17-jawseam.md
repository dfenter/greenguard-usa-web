# HANDOFF Rev 17 jaw seam (opus LOW implementation lane, 2026-09-17)

Commits: 7d7e636e (module + adapter), 3cf29d0d (tests + open items),
2e2aa3b2 (rebake + spec defect).

## State

`tools/sharklib/jawseam.py` is complete and correct against SPEC-jawseam.md.
63 synthetic pytest cases pass (50 seeds + termination + adversarial +
determinism). It replaces the three interacting passes in `finish_family`;
the old functions stay importable and unused so the gate can diff.

Three families rebaked clean on the worker with 0 invariant violations and
solver-vs-re-gather agreement to 3 decimals (thresher 2.079x, snapjaw 2.060x,
aresrender 2.073x). artemisstrike aborts on 1 residual I4 edge. leviathanrex
aborts upstream in PAINT (body luminance 0.2847 vs 0.30 floor) and never
reaches the seam stage; that is the paint lane's file and Residual B.

probe_jaw is still 0/5. **Do not treat this as a module bug.**

## The blocker: SPEC-jawseam.md section 0 is wrong

The spec defines `rest(e)` as the distance between raw exported positions and
builds every invariant on it. That equals the probe's measurement only when
vertices are influenced by LowerJaw and Head alone. They are not.

Measured on the three rebaked GLBs:

| family     | seam edges | with wr > 0.05 | mean wr | max wr |
|------------|-----------:|---------------:|--------:|-------:|
| thresher   |       2376 |           2343 |   0.351 |  1.000 |
| aresrender |       2616 |           1960 |   0.257 |  1.000 |
| snapjaw    |       2655 |           1757 |   0.224 |  1.000 |

The probe's rest pose is the SKINNED bind, so Neck and the spine chain move
these vertices before any length is taken. The two rest lengths diverge by up
to 2.8x on exactly the seam edges that matter: thresher's worst edge is
1.98e-3 of L in the spec's basis and 7.05e-4 in the probe's.

Because I2's floor and I4's allowance are both proportional to rest length,
they are computed against a length the gate does not use, so an edge can pass
every invariant offline and still tear.

Proof the module is internally correct: replicating the probe's own
4-influence LBS in numpy over the same GLBs gives 1.95x with 0 edges over 3x
using raw positions, and 2.62x with edges over 3x using skinned-bind
positions. Same mesh, same code, only the basis differs. This is lane A5's
bind-pose-coords lesson reappearing one level up, in the spec's algebra.

## Fix (one substitution, no rewrite)

Evaluate `rest(e)`, `arm(e)` and the analytic pose on bind-pose SKINNED
coordinates. `finish._bind_pose_coords` already computes this in Blender, and
`glbdump.py` can reproduce it from the exported arrays (multiply each vertex
by the weighted blend of `worldBind[j] @ ibm[j]`, which is identity only when
wr is 0). Every invariant, threshold and proof in the spec carries over
unchanged. Then rebake and re-gate.

## Second blocker, independent

The probe's own lower-lip classifier reports `lower(n=0)` on thresher,
snapjaw and aresrender despite healthy exported weights (wj>0.4 on 138/461/591
vertices, weight sums normalised to 1e-4). That is the same class of probe
head-region/up-axis bug lanes A5 fixed twice before, and it fails the gate
independently of stretch. Worth confirming before the next bake, or a clean
seam will still read FAIL.

## Resolved open items

- WEIGHTS_0 is float32 (componentType 5126, normalized false) on all five
  families. The 1/255 quantum is conservative, not required; kept.
- The basis assertion in the spec was wrong: all eight joints carry the
  exporter's uniform 90-degree Y-up to Z-up conversion, so an absolute angle
  says nothing. Measured relative to its parent Head (which reproduces the
  node-local quaternion to 1e-5) the jaw sits at 0.065-0.082 rad, outside the
  spec's 0.05 tolerance. Asserted at 0.10 rad, which still catches a
  reintroduced ~pi roll. finish.py's adapter had the same error, corrected.

## Worker

`~/razorfin_r17seam` on gg-wsl, Blender 3.6.19, `./run.sh` bakes all five,
touches DONE. Tools sha256-verified both hosts. Recipes and paint.py untouched.
