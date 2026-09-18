# Rev 17 residual A (jaw stretch) - lane A2, 2026-09-17

Commit: 168ce387 (tooling only; no GLBs, no recipes).

## What was fixed and committed

`_collapse_post_decimate_slivers` in tools/sharklib/finish.py ran ONE sweep of
`bmesh.ops.collapse`. That op is single shot: when several sub-limit edges share
vertices it merges them all at once and the survivors it leaves are themselves
near-coincident, so a single sweep manufactures the defect it removes. thresher
shipped a 2.00e-4 L edge after a sweep that collapsed 41 edges under a 7.38e-4
limit, which is what "the sliver pass ran and stretch did not move" actually was.

Now iterated to a fixed point (guard SLIVER_MAX_SWEEPS 12). Weights are read from
the bmesh deform layer each sweep instead of an index-keyed snapshot of
`low.data`, which goes stale the moment the first collapse renumbers vertices -
that staleness is why the pass could not simply be re-run before.

Measured on rebake: aresrender 3 sweeps / 116 edges (was 1 sweep / 115),
snapjaw 2 / 29, thresher 2 / 41. verify_families 5/5, tris 8014-8790, budgets
clean. Keep this; it is correct and non-regressive.

## The real finding: probe_jaw's stretch number has no valid basis

The rebake did NOT move probe_jaw stretch: 4.021 / 4.197 / 3.996, identical to
three decimals. GLB md5s and vertex counts DID change, so this is not a stale
artifact - the collapsed vertices were simply not the ones carrying the number.

Dumping the worst edges post-rebake (hse/worst_edge.mjs, committed) shows vertex
INDICES changed (v7589->v7682) while the edges, rest lengths and weights are
exactly preserved. Chasing that led to the actual problem:

**The LowerJaw bind rotation is ~pi on all five families, and probe_jaw forces
`rotation.x = 0` as its "rest" pose.**

    aresrender 3.0766   snapjaw 3.0761   thresher 3.0694
    artemisstrike 3.0741   leviathanrex 3.0594

At the real bind pose the worst thresher pair is 1.85e-3 L apart; at the probe's
forced `rotation.x = 0` they squash to 2.00e-4 L. The probe then "opens" to
0.72 rad from that artificial pose and divides by the artificially tiny rest
length. 1.85e-3 / 2.00e-4 ~ 9, and the reported 4x falls out of that ratio.
These vertices are NOT degenerate and NOT UV seam splits - distinct positions,
distinct UVs, normals 20-27 degrees apart. No amount of sliver collapsing will
change a number computed from a pose the asset never occupies.

The game does not pose the jaw this way. `hse/rig_morph.js writeJawGape` sets
`bone.quaternion = authority.closedBase` (the quaternion as authored in the GLB,
captured at rig_morph.js:1019) and then `rotateOnAxis(JAW_HINGE_AXIS, angle)`.
It never touches `rotation.x`.

## Where I stopped, and why

I tried two corrected measurement bases and BOTH read worse than the current
gate, including on the two families that currently pass:

    from bind quaternion, open about local +X (writeJawGape verbatim):
      aresrender 5.58  artemisstrike 44.91  leviathanrex 14.66
      snapjaw 26.40    thresher 11.35
    quaternion-multiply variant: same numbers (euler decomposition aliases,
      restRot reads 2.35 not 3.07, so that variant is not trustworthy either)

Three mutually inconsistent stretch numbers means I do not have a trustworthy
oracle, so per feedback_gate_round_cap.md I stopped rather than keep trying
poses. Do NOT treat the 5.58/44.91/... table as a result; it is evidence the
basis is still wrong, not a measurement of the assets.

Most likely explanation for +X being wrong: `JAW_HINGE_AXIS` is local +X in
rig_morph, but these bakes carry a ~pi bind rotation, so local +X at the bind
pose may not be the anatomical hinge. The bake writes the bind pose; rig_morph
assumes a hinge axis. Those two conventions have never been checked against
each other.

## Next steps, in order

1. Establish the hinge axis EMPIRICALLY per bake rather than assuming +X: the
   axis about which lower-lip vertices swing while upper-head vertices stay put.
   That is the same "measure it, do not assume it" ruling that fixed the dorsal
   axis in Rev 16 and the per-bone yaw axis in Rev 15.2.
2. Re-point probe_jaw at bind-quaternion + measured axis, and RE-BASELINE all
   five. Expect the current 3/5 to change in both directions; the two current
   PASSes are not established as good.
3. Only then judge whether any geometry fix is still needed. The 4x may
   disappear entirely, or a real defect may appear on a family that now passes.
4. Do not tune finish.py constants against the current number. It is not
   measuring what it claims to.

## Rules observed

Blender ran on the gg-wsl worker (`~/razorfin_bake`, blender36); the mini's slot
was held by another lane throughout. finish.py md5 verified identical on both
hosts before launch. `--recipe` used on every invocation. mtime check done on
all three outputs (19:38:27-19:39:08) against the fix (19:36:24) before any
probe read. Colour/paint/material files untouched - tools/recipes/*.json are
modified in the tree by the parallel paint lane and were deliberately NOT staged.
