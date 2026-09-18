# Jaw weight field spec (Razorfin Rev 18, lane 4)

Binding contract for the `LowerJaw` weight field authored in
`tools/sharklib/mouth.py` and shipped in `assets/models/fam/*.glb`.

Written because three lanes in a row fixed a downstream symptom of one
upstream property that had never been stated: the field is *described* as
continuous but nothing anywhere enforced a continuity that the exported mesh
can actually resolve.

## 0. Why a spec and not another tuning round

Rev 18 lanes 1-3 each measured a real defect and each fixed it, and the gate
still reads 0/5:

| lane | defect fixed | result |
|---|---|---|
| 1 | probe posed the jaw absolutely, ignoring the rest quaternion | numbers became honest |
| 2 | gate angle guessed at 0.72 rad; real travel is 25 deg | numbers became comparable |
| 3 | weight projection snapped to nearest vertex (piecewise constant) | 4 of 5 families improved |

Lane 3 ended at the round cap with snapjaw unmoved and a correct diagnosis it
could not act on: its weight histogram was still bimodal, so the step was in
the term product, not in the projection. Per
[[feedback-gate-round-cap]] the next move is a spec, not a fourth ramp widening.

## 1. The invariant

> **JW-1.** For every edge `(p, q)` of the **exported** mesh, the LowerJaw
> weight field `W` satisfies
>
> ```
> |W(p) - W(q)|  <=  B(p, q)  =  S * restLen(p, q) / (arm(p, q) * theta)
> ```
>
> where `theta` is the family's real open travel in radians (25 deg = 0.4363,
> resolved by `hse/jaw_gate_config.mjs`, never hardcoded), `arm` is the
> distance from the edge midpoint to the jaw hinge, `restLen` and `arm` are
> both normalized by body length `L`, and `S = 2.0`.

### Where `S = 2.0` comes from

An edge whose endpoints carry different jaw weights is stretched by the
differential rotation of its two ends. To first order in `theta`:

```
openLen  ~=  restLen + |dW| * arm * theta
stretch  =   openLen / restLen  =  1 + |dW| * arm * theta / restLen
```

The gate fails an edge above `3.0x`. Setting `stretch <= 3` gives
`|dW| <= 2.0 * restLen / (arm * theta)`, so `S = 2.0` is exactly the 3x bar
restated as a weight bound, with no safety margin folded in. `S` is the
single place the bar enters; changing the bar means changing `S` and nothing
else.

This is the same physics as the existing `EDGE_STRETCH_BUDGET = 1.6` cliff
metric in `hse/count_cliffs.mjs`, which is the 3x bar with a 20% margin. JW-1
is deliberately stated at the bar itself so the test measures the gate rather
than a proxy for it.

## 2. What the field must look like (JW-2 .. JW-5)

> **JW-2. Every term is a smoothstep ramp. No term may be a branch.**
> `_jaw_weight_field` must contain no early `return` and no conditional that
> selects between weight values. A hard `return 0.0` is an infinite-slope
> ramp and violates JW-1 for every edge that crosses it, regardless of how
> wide the other ramps are.

> **JW-3. Ramp width floor.** Each smoothstep ramp of width `d` (in the units
> of its own argument) contributes at most `1.5 * e / d` to `|dW|` across an
> edge of length `e`, since `max |smoothstep'| = 1.5`. Combined with JW-1,
> every ramp must satisfy
>
> ```
> d  >=  K * e_max        where   K = 1.5 / B  =  0.75 * arm * theta / e
> ```
>
> Note `e` cancels: this is a bound on the FIELD GRADIENT and is therefore a
> property of the shape, not of the tessellation.
>
> **JW-3 is currently NOT SATISFIABLE field-side on these bases, and the lane
> that wrote this spec could not make it so.** See section 6.

> **JW-4. Gape independence.** No ramp width may be a function of
> `gape_degrees`, `half_gape` or `lower_gape`. Ramp *positions* follow the cut
> planes, which move with gape; ramp *widths* are resolution decisions and
> must not. A gape change must not be able to turn a compliant field into a
> stepping one.

> **JW-5. Pin semantics preserved.** `JAW_INTERIOR_PIN = .55` continues to
> mean "this vertex is band interior and fully jaw-driven". Widening ramps
> must not drop the count of vertices at or above the pin below the probe's
> lower-lip minimum of 6 per family, and interpolation must remain a convex
> combination so a point inside a saturated region still reads 1.0.

## 3. Which term steps today (measured, lane 4)

Instrumented via `RAZORFIN_JAW_TERM_DUMP=<csv>` on the bake, which writes
every source point's per-term factor values. Maximum per-term delta across
source-mesh pairs closer than 0.004 L, restricted to points that carry weight:

| family | `below` | `forward` | `hinge` | `in_opening_band` | `commissure` |
|---|---|---|---|---|---|
| snapjaw | 0.000 | 0.073 | 0.000 | **0.265** | 0.000 |
| artemisstrike | **0.299** | 0.000 | 0.000 | 0.000 | 0.000 |

**The stepping terms are the two z-direction ramps, `in_opening_band` and
`below`, and which one dominates is per-family.** Both are scaled by body
height `H`: `in_opening_band` spans `.05*H` and `below` spans `.060*H` after
lane 3's widening. On these meshes `H ~ 0.22 L`, so `.05*H ~ 0.011 L`. Lane 3
widened `below` and left `in_opening_band` untouched, which is exactly why
snapjaw did not move: lane 3 fixed the term that happened to dominate on four
families and not the one that dominates on the fifth.

This per-term diagnosis stands on its own -- it compares terms against each
other at the same points, so the arm error described in section 6 does not
affect it.

`forward` and `hinge` are `t`-direction ramps spanning `.30*span` and
`.18*span` of normalized length; both are already an order of magnitude wider
than JW-3 requires and neither steps on either family.

### The latent hazard: `aft_cut`

`_jaw_weight_field` opens with

```python
if t <= hinge_t - .10:
    return 0.0
```

which is a hard step of `|dW| = 1.0` across a single edge and a flat violation
of JW-2. Measured, it is currently **inert**: `forward` and `hinge` already
evaluate to 0 everywhere aft of it, so it suppresses no weight on either pilot
(0 points with a would-be weight above 0.01). It must still go, because it is
one ramp-position change away from becoming live and it would then be
invisible to every downstream cap.

## 4. `blunt`

`snapjaw.json` carries `mouth.blunt: true`. `grep` finds no reader in
`tools/sharklib/` -- `head.mode: "blunt"` is a separate, real, head-preset key
consumed by `head.py`, and `mouth.blunt` is an unrelated orphan that has never
affected a bake.

This spec defines no mouth-level meaning for bluntness that is not already
carried by `head.mode`, and inventing one would change approved geometry.
**`mouth.blunt` is removed from the recipe** rather than wired up. The recipe
schema gains no new key.

## 5. Deterministic test: `hse/jaw_weight_test.mjs`

```
node --import ./tools/reg.mjs hse/jaw_weight_test.mjs assets/models/fam/*.glb
```

- Walks **every** edge of the exported mesh, not a sampled subset, and not
  only the mouth band.
- Skips only edges where both endpoints have zero jaw weight (no differential
  motion is possible) and edges of zero rest length.
- Resolves `theta` per family through `hse/jaw_gate_config.mjs`, so it cannot
  drift from the runtime authority.
- Derives the hinge from the real `LowerJaw` bone origin (`jaw.matrixWorld`).
  It originally copied `count_cliffs.mjs`'s percentile estimate; see 6.1.
  Lane 5 fixed `count_cliffs.mjs` to use the bone origin too, so the two
  instruments agree again -- on the correct arm this time.
- **Fails** if any edge has `|dW| > B(p, q)`, printing the worst offenders
  with their weights, rest length and arm.
- Exit code 0 = pass, 1 = fail. No thresholds read from env; the bar is in
  the file.

The test is the gate. A family passes lane 4 when `jaw_weight_test` is green
AND `probe_jaw` reports max stretch under 3.0x; these are the same claim
measured from two directions, and they must agree.

## 6. What lane 4 got wrong, measured (read this before continuing)

Lane 4 wrote sections 1-5, implemented them, and then found two defects in its
own instrument. Both are recorded here rather than quietly fixed, because the
first one invalidates numbers that appear earlier in this document.

### 6.1 The arm was estimated when the file contained it exactly

`count_cliffs.mjs` derives the hinge from percentiles of the jaw weight cloud
(5th pct along y, 95th along z). `jaw_weight_test.mjs` copied that for
consistency. Measured against the real `LowerJaw` bone origin:

| family | percentile hinge (y, z) | true bone origin (y, z) | arm error |
|---|---|---|---|
| snapjaw | (-0.052, -0.384) | (0.000, -0.053) | 0.043 vs 0.369 L, ~8.6x |
| thresher | (-0.042, -0.324) | (0.000, -0.059) | 0.028 vs 0.294 L, ~10.6x |

The estimate understates the moment arm by an order of magnitude. Consequences:

- **The K table originally printed in section 2 of this spec was derived from
  the wrong arms and its required ramp widths (0.016-0.068 L) are all
  understated by roughly an order of magnitude.** It has been removed rather
  than corrected, because the correct numbers make the field-side approach
  plainly infeasible (6.3).
- `jaw_weight_test` with the percentile hinge predicted 5.41x on snapjaw's
  worst edge where `dump_stretch` measures 12.65x -- i.e. it was a LOOSER gate
  than the one it claimed to restate, and would have gone green while the real
  gate stayed red.

Fixed: the test now poses from `jaw.matrixWorld` and uses the bone origin.
`count_cliffs.mjs` was left on the percentile estimate by lane 4 and **was
fixed by lane 5** to use the bone origin. Correcting it tightened every count,
because the understated arm had made the allowance ~9x too generous:

| family | cliffEdges, bad arm | cliffEdges, bone origin |
|---|---|---|
| aresrender | 472 | 1245 of 6643 jaw-touching |
| artemisstrike | 30 | 264 of 295 |
| leviathanrex | 17 | 122 of 151 |
| snapjaw | 28 | 533 of 801 |
| thresher | 142 | 1732 of 2021 |

Every cliff number printed by any lane before Rev 18 lane 5 is understated.

### 6.2 The linear stretch model breaks on near-coincident edges

With the *correct* arm, the model over-predicts instead:

| family | worst edge measured | predicted, true arm |
|---|---|---|
| snapjaw | 12.65x | 38.96x |
| thresher | 5.90x | 21.05x |

`stretch = 1 + |dW| * arm * theta / restLen` assumes the differential
displacement adds along the edge direction. It does not: the true factor
includes the projection of the motion onto the edge, which is in [-1, 1]. On
the short edges that actually fail, that projection is small and the linear
model is a loose upper bound, not an equality.

So the test is now **conservative in the safe direction** (it never passes an
edge the gate fails) but far too strict to use as the bar: it flags 1192
thresher edges where the real gate flags 6. It is currently useful as a
*relative* instrument and as a regression tripwire, NOT as a ship gate.
Making it exact requires carrying the edge-direction projection, which means
posing the mesh -- at which point it is `dump_stretch` and should simply call
it.

### 6.3 Field-side widening cannot close this, and here is the argument

`W` is a PRODUCT of five terms, so `|grad W| <= sum |grad term_i|`. Two
z-ramps must both transition inside the same mouth opening, so each needs
roughly `d >= 1.5 * arm * theta`, double what JW-3 states per-ramp. With the
corrected arms this exceeds the available opening on every pilot. The ramp
must also SATURATE inside that opening or every value falls under
`JAW_WEIGHT_FLOOR` and the jaw stops moving entirely -- which is exactly what
lane 4's first attempt did to artemisstrike and leviathanrex, whose stretch
then read a perfect 1.000x because nothing moved. That false pass is the
single most dangerous failure mode in this pipeline and it looks like success.

Empirically, widening also trades a tall cliff for a wide shallow slope:
snapjaw's max stretch improved 16.2 -> 12.6 while its edges-over-3x count went
28 -> 70. More edges carry some gradient, and on a mesh with short enough
edges more of them fail. There is no width that wins. thresher's worst edge
did not move at all (5.904 both before and after, bit-identical), proving its
failure is not a z-ramp problem in the first place.

**Conclusion: JW-1 is a constraint on the EXPORTED mesh, but the field is
authored on the SOURCE mesh and the short edges are manufactured by
remesh/decimate afterwards. No purely field-side fix can satisfy it.**

### 6.4 The lever nobody has pulled -- PULLED AND DISPROVEN (lane 5)

**Read 6.4.1 below before acting on this section. The recommendation that
follows was wrong, and it was wrong for a reason this very file already
contained.**

### 6.4.0 The original recommendation, kept for the record


`restLen` is in the NUMERATOR of the JW-1 bound and is set by the decimator,
after the field is authored. Constraining the decimator to refuse collapses
below a minimum edge length *within the jaw band* raises the bound directly
and proportionally, with no field change at all. Unlike lane 2's reverted
`_limit_weight_gradient` on export topology -- which moved WEIGHTS on fixed
geometry and so manufactured the very slivers it was trying to fix -- a
decimator constraint only ever PREVENTS collapses, so it cannot create
slivers by construction. That is the recommended next lane.

### 6.5 Known scope leak in JW-2

JW-2 forbids branches in `_jaw_weight_field`, and lane 4 removed the
`return 0.0` there. But `JAW_WEIGHT_FLOOR = .08` in `_project_jaw_weights` is
also a hard branch -- a vertex at 0.079 exports as exactly 0 -- and it sits
just outside the rule's stated scope. `jaw_weight_test` skips edges with two
zero-weight ends and is therefore structurally blind to it. Either widen JW-2
to cover the floor, or make the floor a ramp.


### 6.4.1 Why the decimator constraint is disproven (lane 5, measured)

**1. The budget decimator never fires on the failing families.**
`finish.py` guards it with `current_tris > tri_budget` at a 9000 budget.
Measured control bakes: thresher exports 8138 tris, snapjaw 8012. No
`FINISH budget decimate` line appears in either log. There is no collapse in
the jaw band for a minimum-length rule to constrain. The comment block at
`finish.py:1082` already recorded this ("aresrender / snapjaw / thresher all
baked under the 9000 budget ... the decimate never fired"); 6.4 recommended
constraining it anyway. **A recommendation that contradicts a measured comment
elsewhere in the same repo is the cheapest class of error to catch and this
one survived a lane and a gate.**

**2. The strongest possible form of the constraint is still insufficient.**
A minimum edge length only ever *forbids* collapses, so its supremum is
forbidding all of them. Measured with `RAZORFIN_NO_COLLAPSE=1` on thresher:
stretch 5.904 -> 4.414x, still failing the 3x bar, at 8574 tris. No finite
`L_min` can beat `L_min = infinity`, so the whole family of constraints is
dominated and fails.

**3. It is not even monotonic.** Disabling collapses *raised* thresher's band
edge count 1999 -> 2393 and its JW-1 violators 1192 -> 1401, because preserving
slivers preserves short edges that are themselves violations.

**4. The violating edges are not short.** `hse/band_edge_hist.mjs` (new this
lane) reports, per edge, the length JW-1 demands of it. On the committed bakes
4 of 5 families have NO band edge under 1e-4 L, and median band edge is
5.8e-3 .. 1.8e-2 L. Several worst edges are ABOVE the median length:
leviathanrex's top five sit at 8.06e-3 .. 1.40e-2 L against a 7.86e-3 median.
They fail on `|dW|` (0.45 .. 0.75), not on length. Median shortfall across
violators is 1.47x .. 2.13x and worst is 26.8x, so closing JW-1 by length
alone would require the mouth band to become a handful of enormous triangles,
destroying the silhouette.

**Both levers in JW-1 are now exhausted.** Lane 4 proved `|dW|` cannot be
reduced field-side (ramps cannot saturate inside the opening without dropping
under the floor and killing jaw motion -- the 1.000x false pass). Lane 5 proves
`restLen` cannot be raised geometrically. The inequality has two terms and
neither can move.

### 6.4.2 What is actually left

- **The 3x bar has never been validated.** It was set when the gate measured an
  unreachable 0.72 rad pose, and 6.2 shows the linear model over-predicts
  badly. `S = 2.0` is derived FROM the bar, so the test and the bar are not
  independent evidence. Validate the bar against what reads as torn on a
  rendered turntable at the real 25 deg travel -- as its own lane, with a
  designer-free proof. Do NOT fold a bar change into a failing lane; that is
  how the 1.000x false pass class of error gets shipped.
- **Band TOPOLOGY, the one untested hypothesis.** The gradient currently runs
  ACROSS a remeshed seam. A proper lip loop would lay it out ALONG a ring of
  edges, giving the field many edges to spend `|dW|` over instead of a few.
  This is a `mouth.py` / remesh authoring change, consistent with 6.3's
  finding that the short edges are manufactured after the field is authored.
- **`JAW_WEIGHT_FLOOR` (6.5) is still open** and is implicated in the family
  closest to passing: aresrender's worst edge, 3.740x, is exactly a floor edge
  at jawW 0.000/0.110, and leviathanrex has floor edges at 3.581x / 3.437x.
  It is a separate cause and deserves its own proof, not a ride-along.
