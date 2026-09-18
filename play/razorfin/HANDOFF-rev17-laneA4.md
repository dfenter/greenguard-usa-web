# Rev 17 residual A (jaw stretch) - lane A4, 2026-09-17

Continues lane A3 (commit 2550b62e), which handed over a corrected,
bidirectionally-validated probe and asked the next lane to re-derive
EDGE_STRETCH_BUDGET from it.

Result: the budget was never the defect. Two real code defects were found and
fixed, and a third (the actual remaining cause) was isolated and is NOT fixed.
Still 0/5 on stretch, so per the one-round rule this lane stops here.

## 1. EDGE_STRETCH_BUDGET is CORRECT at 1.6. Derived, not searched.

A3 expected "the principled value is near 3.0, not 1.6". The algebra says
otherwise. Under linear-blend skinning the endpoints of an edge follow the jaw
by w_a and w_b, so their extra separation is at most

    |w_a - w_b| * |R.p - p|   and   |R.p - p| = 2*sin(theta/2) * arm

The cap allows dW <= BUDGET * rest / arm, so

    stretch <= 1 + BUDGET * 2*sin(theta/2)

`arm` and `rest` cancel exactly - which is why one constant works on every
base. At OPEN_RAD 0.72 the chord factor is 0.7045:

    BUDGET 1.6  -> stretch bound 2.13x   (29% inside the 3.0 gate)
    BUDGET 2.84 -> stretch bound 3.00x   (the gate exactly, no margin)

So 1.6 was always sufficient. KEPT, with the derivation written into the
constant's docstring so the next lane does not re-litigate it.

The measurement agreed independently. If the budget were merely too loose the
failing edges would sit between 2.13x and 3.0x. They do not: **100% of the >3x
edges violate the cap by 10-25x** (dW 0.57-1.00 where the cap allows
0.025-0.09). That is the signature of a cap that is not being applied, not one
set too high. Diagnostic: `scratchpad/capcheck.mjs`.

## 2. Defect one (FIXED): the payload floor discarded the cap's output.

`mouth._limit_weight_gradient` relaxes the band's flank down to a ramp that
reaches zero. The emit step then dropped every vertex with `value > FLOOR`
(.08) - i.e. exactly the ramp tails the cap had just authored. Because
`rig._apply_external_weights` only writes vertices present in the payload, a
dropped tail kept weight **0.0** next to a neighbour the cap left at .57.

The floor replaced the cap's smooth ramp with a cliff steeper than the one the
cap was called in to remove. The worst edge on thresher, artemisstrike and
leviathanrex was literally `0.000 || 0.57-0.94`, every time.

Fix: `mouth._emit_capped_weights`. A vertex is emitted when it is above the
floor OR when a mesh neighbour is (one-ring dilation), so the ramp survives
into the rig. Sub-floor vertices with no meaningful neighbour are still
dropped, preserving the floor's original intent. Measured: 11-241 ramp tails
now kept per family.

## 3. Defect two (FIXED): finish.py stripped the tails the cap kept.

`_normalize_joined_mouth_skin` protected body vertices with jaw weight
`> 0.05`. A ramp tail at .04 failed that test, fell through to the
stray-legacy-weight branch, and had `jaw.remove()` called on it - back to
exactly 0.0. The cap's work was undone AFTER it ran, which is why two rebakes
produced bit-identical worst edges.

Fix: threshold lowered to a numeric-noise epsilon (1e-4). mouth.py only emits
vertices it deliberately chose, so anything carrying real jaw weight on the
body is authored band, not bone-heat bleed.

Measured effect: protected verts 806->995 (thresher), 360->410 (snapjaw),
88->105 (artemisstrike), and `body_jaw_removed` went to **0 on all five**. Both
fixes do exactly what they claim.

## 4. Defect three (NOT FIXED - this is the remaining cause).

Stretch did not move, because the surviving torn edges are not on the body at
all. They are on the **authored mouth islands**, which no gradient cap has ever
touched.

`mouth._make_cavity` writes a BINARY weight map (mouth.py:519-524):

    cavity_map[index]           = 0.0   # roof row
    cavity_map[count + index]   = 1.0   # floor row
    cavity_map[2*count + index] = 0.0   # roof, throat end
    cavity_map[3*count + index] = 1.0   # floor, throat end

and the cheek-wall faces join those rows directly:

    faces.append((side, 2*count + side, 3*count + side, count + side))

That face has edges `2c+side -- 3c+side` and `c+side -- side`, each a hard
**dW = 1.0 across one short edge, by construction**. Verified analytically and
matched to the measured leviathanrex worst edge (`wa=1.000, wb=0.000`).

These maps go through `rig._attach_external_object`, which writes
`jaw=w, head=1-w` verbatim - no cap, no ramp. The body cap cannot help because
these vertices are not on the body when it runs.

**Where the next lane should start:** run the same per-edge cap over the
authored island maps (or author the cavity with a graded roof-to-floor
transition instead of a binary one). The cap mechanism in
`_limit_weight_gradient` is correct and reusable; it needs to run on the joined
mesh, after `_join_mouth_objects`, where the island and body seam edges both
exist. Do NOT touch EDGE_STRETCH_BUDGET - see section 1.

Second finding for that lane: snapjaw's torn edges are at **yFrac 0.42-0.61,
mid-body**, not at the mouth (thresher's are at 0.29-0.43). The cavity shell is
landing mid-body on the tigershark families - consistent with the known "wedge
at tail on tigershark families" integration defect. Probe: `scratchpad/where.mjs`.

## 5. Upper-head gate: re-pointed, no longer vacuous.

A3 flagged it as untestable (LowerJaw is a leaf bone, so vertices selected by
`jw < 0.05` cannot move; it read 0.0 for every family and every candidate axis).

Re-pointed at the property it was meant to protect: jaw weight must not bleed
into the skull. It now measures real swing of geometrically upper-head vertices
(upper 50% of head height, Head-weighted > 0.3) rather than pre-filtering by the
very weight that would move them. Limit unchanged at 0.002 * L.

It now has teeth and it FIRES: aresrender 0.047 and snapjaw 0.032 against a
0.002 limit - both have genuine jaw bleed into the upper head, which the old
gate could never have reported. artemisstrike / leviathanrex / thresher read 0.

## 6. Five-family gate table

    family         A2 stretch | A3 stretch (corrected probe) | NOW      edges>3x  verdict
    aresrender     4.021x     |  5.581x                      | 12.881x   29       FAIL
    artemisstrike  1.138x     | 44.913x                      | 44.913x   30       FAIL
    leviathanrex   1.166x     | 14.664x                      | 14.664x   49       FAIL
    snapjaw        4.197x     | 26.395x                      | 26.395x   66       FAIL
    thresher       3.996x     | 11.350x                      | 11.350x   43       FAIL

    probe_jaw: A2 3/5 PASS (on an invalid basis), A3 0/5, now 0/5.

Three families are unchanged to three decimals, which is the expected result:
their torn edges are all on the uncapped cavity islands (section 4). aresrender
moved 5.58 -> 12.88 because the upper-head bleed it carries is now visible to a
gate that can see it.

Other gates: lower-lip FAIL on 4/5 (snapjaw still classifies n=0 lip vertices -
the A3 open item to re-derive those region thresholds against the bind rest
pose is still open and is a classifier artifact, not an asset defect).

verify_families **PASS 5/5**, tri budgets clean and well inside 9000:

    aresrender 8351  artemisstrike 8360  leviathanrex 8790
    snapjaw 8014     thresher 8375
    all: 1 skinned mesh, 8 bones, 0 orphan weights, tex 1024, <=0.69 MB
    row textures 19.1-34 KB, all inside the 180 KB budget

## 7. Contact sheet

`assets/review/rev17_jaw_contact.png` - five families, jaw CLOSED vs OPEN at
0.72 rad, posed through the SAME path probe_jaw uses (bind quaternion then
rotateOnAxis(+X)), so what is drawn is what the gate measures. Edges coloured
grey <=1.5x, amber <=3x, red >3x, framed on the failing edges so the defect is
in frame on every family including snapjaw's mid-body tears. Worst-stretch
values printed per tile match the probe exactly.

It is a wireframe diagnostic, not a beauty render: the tearing is invisible in
a shaded view until it is extreme. Shaded companions are the five
`assets/review/*_turntable.png`, rebaked this lane.

Renderer `scratchpad/jawsheet.mjs` + `scratchpad/_png.mjs` (dependency-free PNG
writer). NOTE a failed approach, recorded so it is not repeated: rendering the
open pose in Blender (`scratchpad/jawsheet.py`) produced closed/open pairs that
differed by 0-1 pixels - the pose write did not reach the render. Posing through
three.js (the probe's own path) was correct first time and is self-verifying,
because the per-tile worst stretch must match probe_jaw.

## Rules observed

Bakes on the gg-wsl worker (`~/razorfin_bake`, `~/.local/bin/blender36` 3.6.19),
mini's Blender slot never taken. finish.py + mouth.py sha256-verified identical
on both hosts before each of the two bake rounds. `--recipe` used on every
invocation. mtime checked on all five GLBs against the tooling before every
probe read. Colour/paint files untouched: `tools/recipes/*.json` are modified in
the tree by the parallel paint lane (commit 27dd4899) and were deliberately NOT
staged. Scoped `git add` under play/razorfin only, no -A, no stash, no checkout,
no deploy.

Worker gotchas confirmed again: `gg-wsl-lan` lands in cmd.exe, so `|` and `>`
inside the ssh command string are eaten - pipe scripts via stdin. Additionally,
`nohup ... &` alone does NOT survive the ssh session closing; use
`setsid nohup ... < /dev/null & disown` or the bake silently never starts. Also
note another session was running two Blender jobs (soulsteel) on the worker
throughout; the 3.6.19 lane is separate from their 4.4.3 lane.
