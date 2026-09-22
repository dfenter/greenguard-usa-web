# Rev 18 lane 7: absolute jaw bar, turntable jaw pose, stale normal map

Branch `razorfin-rev18`. NOT merged, NOT deployed, RF_FAMILIES still false,
NOT approved. Geometry is unchanged this lane: the GLB meshes are the same as
d266945c. What changed is a render material, a render pose, and the gate.

## 1. finish.py defect 2: the turntable posed the jaw absolutely (FIXED)

`finish.py` posed the turntable jaw with
`rotation_euler = (radians(25 if open else 0), 0, 0)`. Every family GLB exports
`LowerJaw` with a rest rotation near 3.07 rad (~176 deg), so euler 0 is not
"closed": it swings the jaw through 176 degrees into a pose the rig can never
produce. **Every committed mouth_open turntable frame, Rev 17's included, was
an impossible pose.**

This is the FOURTH instance of absolute-vs-relative posing in this pipeline
(probe_jaw.mjs and dump_stretch.mjs were fixed in lanes 1-2; the runtime
`rig_morph.writeJawGape` never had the bug). Fixed with the same recipe the
probes and the runtime use, and the same one scratchpad `jaw6/render_gape.py`
proved out: capture the authored rest quaternion ONCE, then

    jaw.rotation_mode = "QUATERNION"
    jaw.rotation_quaternion = REST_Q @ Quaternion(Vector((1, 0, 0)), rad)

The rest quaternion is captured before any frame is posed and restored after
the last one, so frame order cannot leak into the result. The bake now logs
`FINISH render jaw rest_q=(...)` so the rest pose is visible in every log.

Visible consequence: mouth_closed and mouth_open are now only 25 degrees
apart, so they look SIMILAR. That is correct. The old frames differed wildly
because one of them was nonsense.

## 2. finish.py defect 1: stale normal map (FIXED by dropping the wiring)

`finish.py` wired the source normal map into the finish material while the
rebake that would regenerate it sat behind `RAZORFIN_EMIT_BAKE=1`. The mesh is
remeshed/decimated and re-UV'd (`FINISH UV smart_project topology_changed=True`
on all five pilots), so it was being shaded with a DIFFERENT topology's tangent
normals. Lane 6 identified this as the cause of the translucent fins and dark
blotches in every committed turntable.

The brief said to try BOTH options and pick on render evidence. Both were run
on thresher and the renders compared pixelwise:

| option | render | differing px vs stale baseline |
|---|---|---|
| A, run the rebake (`RAZORFIN_EMIT_BAKE=1`) | `"baked": true` | **0** (maxdelta 1) |
| B, drop the stale wiring when topology changed | clean | 21079 (1.34%, maxdelta 222) |

**Option B was chosen, and option A is not merely worse, it is a no-op.**
The evidence, in order:

1. `RAZORFIN_EMIT_BAKE=1` does not even run as shipped. It fails with
   `FINISH WARN EMIT+NORMAL rebake unavailable: Error: No valid selected
   objects` and falls through to the stub, so the "gate" was hiding a broken
   path, not a working one. Root cause: `shark_variant._duplicate_hi` sets
   `hi.hide_viewport = True`, and a hidden object cannot be selected, so
   `hi.select_set(True)` silently no-ops and the bake has no source.
2. Forcing it to run (temporarily unhiding `hi`, since reverted) produced
   `"baked": true` and a render **bit-identical to the stale one**: 0 differing
   pixels. The reason is structural: the rebake bakes the normal image from
   `hi`, whose material carries THAT SAME IMAGE, so it launders the stale map
   through a Cycles round trip and writes it back unchanged. It cannot fix a
   tangent-basis mismatch because it never produces new tangent data.
3. Dropping the wiring changes 21079 pixels and removes the dark blotches on
   the head and jaw. With no normal input the Principled BSDF falls back to the
   mesh's own geometric normals, which are correct by construction on whatever
   topology is actually being exported.

So: when `topology_changed` and no rebake actually happened, the normal chain
is disconnected (`_strip_normal_wiring`) and the drop is logged
(`FINISH normal map DROPPED`). If a real rebake ever does run, the map is
current and is wired as before. The budget JSON gains `dropped_stale`.

**Not fixed, and out of scope:** residual translucency on the fins survives
this fix, so the normal map was NOT its only cause. It is a material/alpha
question on the fin slots, not a tangent-basis one, and it deserves its own
lane. The blotches are gone; the glassiness is not.

## 3. The bar, re-derived as an ABSOLUTE opened length

New module `hse/jaw_open_budget.mjs` is the single place that defines the bar.

    MAX_OPEN_L = 0.060 L   =  24.0 px on a 400 px body

**Why a ratio could never be the bar.** Stretch is dimensionless. The edges
failing the 3x bar have rest lengths 1.7e-4 .. 8.2e-3 L, so even a large ratio
on them moves the surface by a fraction of a pixel. A ratio bar therefore fails
rows that look perfect AND would pass a genuine tear on a long edge, which
needs only a small ratio to open a visible hole. Lane 6 put eyes on all five
families at the real 25 deg with zoom crops on every worst edge and found the
surface unbroken everywhere, including snapjaw at 12.648x.

**Where 0.060 L comes from.** Lane 6 measured what each family's worst edge
actually OPENS TO, and confirmed each visually clean:

| family | opened px (400 px body) | opened length |
|---|---|---|
| leviathanrex | 17.9 | 0.0447 L |
| snapjaw | 13.8 | 0.0345 L |
| aresrender | 3.2 | 0.0080 L |
| thresher | 1.0 | 0.0025 L |
| artemisstrike | 0.2 | 0.0005 L |

The worst VERIFIED-CLEAN opening is leviathanrex at 0.0447 L / 17.9 px, which
lane 6 flagged as the one edge case worth arguing about, and it still reads
clean under zoom. The bar sits at 0.060 L, **1.34x** that worst confirmed-clean
opening: above every human-verified-clean case so nothing passes by luck, and
far below the ~0.10 L that would read as an actual hole in the silhouette.

This bar is deliberately LOOSER than every current pilot. That is the honest
consequence of the eyes-on evidence. Keeping a bar that fails five families a
reviewer calls perfect would be fitting the gate to a prior rather than to what
renders.

**The ratio is KEPT as an informational column**, in both probes. It is still
the right instrument for spotting a regression in the weight field; it is just
not the ship gate. `dump_stretch` now sorts by absolute opening and also prints
the worst-ratio edge next to how little it actually opens. On thresher that
line reads: worst RATIO edge 5.904x, **which opens only 0.8 px**, while the
largest real opening on the mesh is 6.6 px on a 2.195x edge. That single line
is the whole argument for the change.

**HARD PRECONDITION, the dead-jaw check (JAW-WEIGHT-SPEC section 6).** An
absolute-length bar is passed PERFECTLY by a jaw that does not move: every edge
opens to 0.000 L. That is the 1.000x false pass that destroyed artemisstrike
and leviathanrex in lane 4 and looked like total success. So `judge()` checks
liveness FIRST and a dead jaw fails the gate regardless of its lengths. The
probe counts vertices that measurably moved between closed and open (the
geometric analogue of the spec's closed-vs-open differing-pixel count) and
prints `ALIVE`/`DEAD` on every row. Measured this lane: 46 .. 3193 moved verts
across the five, all ALIVE, so no number here is a false pass.

Also fixed while here: `probe_jaw` subsampled dense meshes when measuring
edges. Acceptable for a ratio hint, not for a ship gate whose entire job is to
find the single worst edge. It now walks every triangle.

## 4. Results

`verify_families`: **5/5 PASS** (tris, size, skinned mesh, bone set, orphan
weights, texture budgets; row textures 19.3-32.7 KB).

New jaw gate, all five **ALIVE**, all under budget, so **5/5 on the bar**:

| family | worst opening | at ratio | info: worst ratio | moved verts |
|---|---|---|---|---|
| aresrender | 0.01482 L (5.93 px) | 1.795x | 3.740x | 3193 |
| artemisstrike | 0.02051 L (8.21 px) | 3.172x | 3.513x | 119 |
| leviathanrex | 0.04146 L (16.58 px) | 3.186x | 5.449x | 46 |
| snapjaw | 0.04388 L (17.55 px) | 4.134x | 12.648x | 376 |
| thresher | 0.01651 L (6.60 px) | 2.005x | 5.904x | 981 |

These independently reproduce lane 6's rendered measurements (leviathanrex
16.6 px vs 17.9 measured, snapjaw 17.6 vs 13.8), which is a useful cross-check:
the offline gate and the rendered frames now agree on the same quantity in the
same units, for the first time in this pipeline.

**PRE-EXISTING FAILURE, not from this lane, NOT loosened.** `probe_jaw` also
carries a lower-lip travel check (lip verts must move >= 0.03 L) and it fails
4 of 5: aresrender max 0.01643, artemisstrike 0.02965, thresher 0.03316 with
min 0.00799, and snapjaw still classifies n=0 lip verts. Verified to be
pre-existing by running the NEW probe against the OLD committed GLBs from
d266945c: the lower-lip numbers are **identical**, so nothing this lane did
caused it. Per the brief I did not touch that bar to make the row go green;
folding a threshold change into a failing check is exactly how the 1.000x false
pass ships. leviathanrex is the only family currently passing every check.

Open, for whoever takes it: that classifier is plausibly measuring the wrong
verts rather than reporting real breakage (snapjaw finding n=0 lip verts is a
classifier failure, not a mesh failure, and lane 5 already noted it). It needs
the same eyes-on treatment the stretch bar just got: validate the 0.03 L travel
figure against what a reviewer sees before trusting it.

## 5. Also open

- Fin translucency (section 2), a material/alpha cause, still unfixed.
- The `RAZORFIN_EMIT_BAKE` path is dead code as written: it cannot select its
  bake source, and even when forced it round-trips the same image. Either
  delete it or rebuild it to bake from real hi-poly tangents.
- Band topology and `JAW_WEIGHT_FLOOR` (spec 6.4.2) remain untouched, and are
  now lower value still: with an honest bar, no current pilot is failing on
  opened length at all.
