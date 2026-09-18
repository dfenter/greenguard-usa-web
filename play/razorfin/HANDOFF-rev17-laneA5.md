# Rev 17 residual A (jaw stretch) - lane A5, 2026-09-17

Continues lane A4 (commit 6e3693e7), which isolated the remaining cause as
"mouth._make_cavity authors a binary island weight map and the cap must run on
the joined mesh".

Result: the cap on the joined mesh was the right instruction and it works -
stretch fell 4x to 13x on four of five families. But two of A4's supporting
claims are REFUTED by measurement, and a third defect (thresher) is now
isolated and NOT fixed. Per the one-round rule this lane stops here.

## 1. Cavity placement: REFUTED, nothing is mispositioned.

A4 asked this lane to confirm or refute a mispositioned cavity shell on the
tigershark families before capping, on the strength of snapjaw's mid-body
yFrac 0.42-0.61 tears. It is refuted, and the yFrac reading was a red herring.

- **The mesh is not fragmented.** A4's "authored mouth islands" do not exist as
  separate components in the shipped GLBs. Welding coincident vertices first,
  all five families are 1 to 44 connected components with the largest holding
  88-100% of vertices (`scratchpad/frag.mjs`). The 455-1304 "islands" an
  index-based union finds are UV-seam SPLIT VERTICES, not detached geometry.
  Any probe that unions over the raw index buffer will report the same phantom
  islands; weld by position first.
- **The torn edges are ordinary body edges**, not islands and not slivers:
  median rest length 1.8e-2 to 8.1e-2 of L, at or ABOVE the mesh median
  (`scratchpad/island2.mjs`). They are body-to-mouth seam edges.
- **yFrac 0.42-0.61 is not mid-body.** yFrac there is normalised over the whole
  body bbox, and these bakes are posed nose-up, so the mouth genuinely sits
  near the middle of that range. Nothing is at the tail. The known
  "wedge-at-tail on tigershark" defect does not reproduce on these GLBs.

So no placement fix was needed and none was made. Capping did not hide a
misplaced shell, because the shell is not misplaced.

## 2. The fix: a second gradient cap on the FINAL exported mesh.

`finish._cap_final_jaw_gradient`, called from `finish_family` as the last
weight edit before `_export`.

Why a second one rather than fixing the first: `mouth._limit_weight_gradient`
is correct and converges, but it runs on the PRE-JOIN body mesh, and three
later stages rewrite weights and topology behind it - `_join_mouth_objects`
concatenates the mouth meshes, `_normalize_joined_mouth_skin` re-authors every
island vertex from the payload map and rescales the body band by a gain, and
the budget COLLAPSE decimate re-triangulates the result. Whatever the early cap
guaranteed is not a property of the exported mesh, which is the only mesh the
gate reads.

Same rule, same budget, no per-family constants: dW across an edge may be at
most `EDGE_STRETCH_BUDGET * (rest / L) / arm`. EDGE_STRETCH_BUDGET is imported
from mouth.py rather than duplicated, and is NOT changed - A4's derivation in
section 1 of its handoff stands.

Three corrections to the rule were needed, each found by measurement:

- **arm = max of the two ENDPOINT arms, not the midpoint arm.** The stretch
  bound is dW * |R.p - p| for the point that actually swings, so the
  conservative lever is the endpoint furthest from the hinge. The midpoint
  underestimates it and leaves the allowance loose by exactly that ratio. This
  is what took four families from 3.1-3.6x down to 3.0-3.7x and is why they
  converged yet still failed on the first A5 round.
- **Cap and sliver-collapse must be driven to a JOINT fixed point.** They are
  mutually recursive: the cap's allowance is proportional to rest length, so on
  a sliver it is ~0 and the edge is unsatisfiable by weights alone, while
  `bmesh.ops.collapse` manufactures new near-coincident survivors and
  re-authors weights around them. Alternating until a full round changes
  nothing converges in 2-6 rounds on all five.
- **Unsatisfiable edges are collapsed by the cap's own predicate**
  (`_unsatisfiable_cap_edges`), not by widening the length threshold. Widening
  it is what tore aresrender's head open at 0.005 L in an earlier round; the
  predicate targets exactly the offenders (2 to 18 per family).

No pin here, unlike the mouth-stage cap: the band has already been normalised
to peak 1.0 by that point, so a pin would make exactly the seam edges
unsatisfiable. Band peak is measured before and after and stays 1.000.

## 3. Five-family gate table

    family         A4 stretch | NOW      edges>3x  verdict
    aresrender     12.881x    |  3.101x   1         FAIL (marginal)
    artemisstrike  44.913x    |  3.718x   2         FAIL (marginal)
    leviathanrex   14.664x    |  3.223x   2         FAIL (marginal)
    snapjaw        26.395x    |  3.043x   1         FAIL (marginal)
    thresher       11.350x    | 11.753x   4         FAIL (unmoved)

    edges over 3x: 29/30/49/66/43 -> 1/2/2/1/4.
    probe_jaw 0/5 PASS, unchanged. verify_families PASS 5/5
    (tris 8010-8790, 1 skinned mesh, 8 bones, 0 orphan weights, tex 1024,
    <=0.68 MB; row textures 19.1-34 KB).

Four families are within 0.05x-0.72x of the 3.0 gate, down from 4x-15x over.
The bad-edge count collapsed by 95%. This is the cap working as derived; the
predicted bound is 2.127x and the residual gap is explained in section 4.

## 4. Thresher (NOT FIXED) - the bind pose the gate measures is not the bind
   pose the pipeline can see.

Thresher did not move (11.35 -> 11.75x) and is a genuinely different defect.

Its worst edge is v7381-v7289, jaw weights 0.618/0.693, dW only 0.075. The
authored distance between them in Blender is 2.53e-3. The distance the PROBE
measures as "rest" is 3.71e-4 - **6.8x closer**. With a rest length that small
the cap's allowance is ~0.009 while the actual dW is 0.075, 8x over, so the
edge fails no matter how well the cap converges.

The shrink is caused by the probe's rest pose itself. probe_jaw defines rest as
the LowerJaw BIND QUATERNION, which on these bakes is a ~pi rotation
(-0.00000,-0.99935,0.03608,0.00000). Posing the jaw there collapses vertex
pairs that straddle the jaw seam. Measured across the whole mesh
(`scratchpad/posecmp.mjs`), edges shrinking more than 1.5x when the jaw moves
from identity to its bind rotation:

    thresher 1074 edges, worst 24.7x   <- the outlier
    aresrender 435, worst 8.0x
    snapjaw 323, worst 5.8x
    artemisstrike 102, worst 16.3x
    leviathanrex 91, worst 4.6x

Thresher has an order of magnitude more of them than any other family, which is
exactly why it is the one family the cap cannot rescue.

This is not fixable inside the cap as written. Blender's bind pose has the jaw
at identity (`pose.bone.matrix @ bone.matrix_local.inverted()` is the identity
there), so the pipeline CANNOT measure the lengths the gate will measure. An
attempt to evaluate rest length in a skinned bind pose (`_bind_pose_coords`) is
in the code and runs without error, but is a no-op for this reason and was left
in place only because it is the correct hook for the real fix.

**Where the next lane should start.** Two candidate directions, in order of
preference:

1. Treat the ~pi jaw bind rotation as the defect. If the bake wrote LowerJaw's
   bind rotation as identity and baked the offset into the geometry instead,
   rest lengths in Blender and in the gate would agree, and thresher's 1074
   collapsing edges would simply not collapse. This is an asset-authoring fix
   in the rig stage, and it would also remove the whole class of "the probe and
   the pipeline disagree about rest" bugs that has now cost three lanes.
2. Or teach the cap the gate's basis directly: evaluate rest length with the
   jaw held at the GLB bind quaternion (not Blender's identity bind), by
   applying that rotation to jaw-weighted vertices before measuring. Cheaper
   but leaves the underlying disagreement in place.

Do NOT raise EDGE_STRETCH_BUDGET - it is derived, and four families now sit
just outside a gate the cap provably bounds at 2.127x when its inputs are
right.

## 5. snapjaw lower-lip classifier (task 3): TWO probe bugs, both fixed,
   still n=0.

Both were real and both are in `hse/probe_jaw.mjs`, not in the asset.

- **Head extent spanned the whole body.** `headWeighted` is every vertex with
  Head weight > 0.1, and `_normalize_joined_mouth_skin` gives EVERY non-jaw
  body vertex Head = 1.0, so that set ran nose to tail tip. "Head height" was
  really the body's vertical extent, dominated by dorsal fin and caudal lobe,
  and `uFrac <= 0.15` selected a slab near the belly rather than the lip. Now
  scoped to a head window derived from the jaw's own forward span.
- **The up-axis was the shark's WIDTH on snapjaw.** The jaw-vs-head centroid
  rule assumes the jaw hangs measurably below the head centroid; on snapjaw
  those centroids are vertically coincident to 1e-4 (0.1208 vs 0.1206 against a
  body extent of 1.0), so the rule read floating-point noise and picked X. Now
  derived from the direction jaw vertices ACTUALLY TRAVEL when the bone opens,
  which is measured rather than assumed and is unambiguous on all five.

Also removed a tautology: the forward gate was
`(fFrac <= 0.55 || fFrac >= 0.45)`, true for every fFrac in 0..1. Left as an
explicit no-op with a comment, because the forward axis SIGN is not guaranteed
nose-first on these bakes (io.measure assumes nose +Y, tigershark is nose -Y),
so a real front/back gate would cut the lip off on half the families.

Effect: snapjaw went 0 -> 3 lip vertices, so the classifier is no longer blind,
but it is still below the gate and 4/5 families still FAIL lower-lip. The
remaining shortfall is an ASSET property (snapjaw's authored band is small and
sits high), not a classifier artifact, and it is now measurable. Documented
rather than chased, per the task's "otherwise document".

Note the upper-head gate now fires on 4/5 rather than 2/5. That is the same
re-pointed gate A4 installed reading a changed up-axis, not a regression.

## 6. Contact sheet

`assets/review/rev17_jaw_contact.png`, regenerated this lane from the rebaked
GLBs. Per-tile worst values match probe_jaw exactly (11.75 / 3.04 / 3.10 /
3.72 / 3.22). Thresher's tile shows the defect clearly: a dense amber-and-red
burst at one seam point, where the other four show only isolated red edges.

GOTCHA for the next lane: `scratchpad/jawsheet.mjs` takes the GLB paths as
ARGUMENTS. Run with no arguments it does not fail loudly - it throws deep
inside `_png.mjs grid()` on an empty rows array, which looks like a renderer
bug rather than an empty input.

## Rules observed

Bakes on gg-wsl (`~/razorfin_bake`, `~/.local/bin/blender36` 3.6.19); mini's
Blender slot never taken. `--recipe` on every invocation. mouth.py, finish.py
and shark_variant.py sha256-verified identical on both hosts before every bake
round. mtime checked on all five GLBs before every probe read. Scoped
`git add` under play/razorfin, no -A, no stash, no checkout, no deploy.
`tools/recipes/*.json` are modified in the tree by the parallel paint lane and
were deliberately NOT staged (they were synced to the worker for baking, which
is read-only use).

Worker gotchas, both confirmed again and both costly:

- `gg-wsl-lan` lands in cmd.exe, so `|`, `>` AND quoted patterns containing
  spaces inside the ssh command string are eaten. Pipe scripts via stdin and
  filter locally; `grep -E "a|b"` inside the remote string fails as
  "'final' is not recognized as an internal or external command".
- `pkill -f <pattern>` run over ssh MATCHES ITS OWN wrapper and kills the shell
  before it reaps the targets, which silently leaves orphan Blenders that then
  race the next bake for the same output files. Kill by explicit PID after
  listing with `ps -eo pid,ppid,etimes,cmd`, and check ppid to tell a live
  bake from an orphan.
- `rsync` is not available over this transport; use `tar czf - | ssh ... tar xzf -`.
