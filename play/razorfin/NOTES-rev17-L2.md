# Razorfin Rev 17 — Luna L2

Lane: `tools/sharklib/head.py`, `tools/sharklib/fins.py`,
`tools/sharklib/accessories.py`, `tools/kit_gen.py`, and the eight owned kit GLBs.
No git commit was made.

## Delivered

The temporary local measurement shim uses the six-value contract
`long_axis, L, zc, H, landmarks, fin_groups`.  After L1's `sharklib/io.py`
landed, the wrapper delegates to `io.measure(obj)` and coerces its dictionary
result into the same named access shape, without modifying L1's file.

`head.py` provides 4x4x4 authored control tables for `blunt`, `pointed`, and
`bulbous`; 24-point ring resampling and `bridge_loops`; seam smoothing; and
foil/hood boolean fusion in `EXACT -> FAST -> REMESH_ONLY` order.  Boolean
inputs run holes-fill and remove-doubles preparation, followed by a
`L/220` voxel remesh and smooth shading.

`fins.py` creates or consumes measured named vertex groups, scales around the
measured base ring, duplicates along the long axis with connected root
bridges, extrudes a caudal tip, and provides the sail preset.

`accessories.py` places canonical kits at named landmarks with local offset,
scale, and yaw.  It keeps one voxel remesh after any fuse, uses the gentle
decimate pass from `shark_bake.py`, and returns a separate `hi` mesh containing
the pre-op photo material plus the placed kit materials/colour attribute.
Fused low results are reduced to one connected surface component.

## Kit budgets

All eight exports were generated with Blender 3.6.19 and are under the 600-tri
CC0 kit limit.  The generated files and measured triangles are:

| file | triangles | bytes |
|---|---:|---:|
| `assets/kit/crown_a.glb` | 108 | 6,952 |
| `assets/kit/horns_pair.glb` | 48 | 4,164 |
| `assets/kit/saw_rostrum.glb` | 140 | 10,412 |
| `assets/kit/spine_row.glb` | 112 | 8,304 |
| `assets/kit/plate_row.glb` | 196 | 6,028 |
| `assets/kit/armor_collar.glb` | 140 | 6,680 |
| `assets/kit/hammer_foil.glb` | 192 | 10,976 |
| `assets/kit/whale_hood.glb` | 96 | 5,476 |

Each kit is smooth-shaded and carries a flat authored `AuthoredColor` corner
attribute (imported by Blender as `Col`).  `plate_row` is the decreasing
Godzilla/maple-leaf row.  `hammer_foil` is a flattened two-lobe T head with
dark eye sockets at the tips.  `whale_hood` is the broad flat filter-feeder
hood.

## Commands

Static syntax check:

    python3 -m py_compile tools/kit_gen.py tools/sharklib/head.py \
      tools/sharklib/fins.py tools/sharklib/accessories.py

Kit generation:

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      --gpu-backend opengl --python tools/kit_gen.py -- --all

Counts-only operation matrix, run one Blender process per base because this
macOS Blender build is unstable with concurrent instances:

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      --gpu-backend opengl --python tools/kit_gen.py -- --verify --no-render \
      --base greatwhite_cy
    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      --gpu-backend opengl --python tools/kit_gen.py -- --verify --no-render \
      --base thresher
    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      --gpu-backend opengl --python tools/kit_gen.py -- --verify --no-render \
      --base tigershark
    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      --gpu-backend opengl --python tools/kit_gen.py -- --verify --no-render \
      --base whaler

The default review command, which attempts the requested EEVEE renders, is:

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      --gpu-backend opengl --python tools/kit_gen.py -- --verify

The `--no-render` switch is only for the numeric matrix; normal verification
calls `_render_pair()` for a 480px side view and a 480px three-quarter view,
combined into `assets/review/L2_<op>_<base>.png`.

## Counts-only results

`before -> after` is the mesh triangle count.  Fused cases also report the
post-fuse connected-component count, which is `1` in every case below.

| base | head blunt / pointed / bulbous | foil | hood | sail | caudal tip | accessories | graft |
|---|---:|---:|---:|---:|---:|---:|---:|
| `greatwhite_cy` | 6784 -> 6784 | 6784 -> 76836; loose 1 | 6784 -> 92300; loose 1 | 6784 -> 6784 | 6784 -> 6880 | 6784 -> 8814; loose 1 | 6784 -> 2716; loose 1 |
| `thresher` | 6790 -> 6790 | 6790 -> 82832; loose 1 | 6790 -> 81576; loose 1 | 6790 -> 6790 | 6790 -> 7128 | 6790 -> 8730; loose 1 | 6790 -> 3116; loose 1 |
| `tigershark` | 6790 -> 6790 | 6790 -> 779468; loose 1 | 6790 -> 83516; loose 1 | 6790 -> 6790 | 6790 -> 6842 | 6790 -> 8730; loose 1 | 6790 -> 1584; loose 1 |
| `whaler` | 6750 -> 6750 | 6750 -> 72536; loose 1 | 6750 -> 69640; loose 1 | 6750 -> 6750 | 6750 -> 6806 | 6750 -> 8730; loose 1 | 6750 -> 34452; loose 1 |

The high-reference probe used `hammer_foil.glb` on `greatwhite_cy` and returned:

    HI_CHECK hi 3 ['greatwhite_cy_mat', 'CC0 hammer foil', 'CC0 eye socket'] ['Col'] hi 1

This confirms the photo slot, both authored kit colour materials, and the
colour attribute survived on `hi` while low remained one connected component.

## Exact L3 call signatures

Import from `tools` by putting `tools/` on `sys.path`, then call:

    from sharklib import head, fins, accessories

    m = head.measure(obj)
    obj = head.lattice(obj, {"preset": "blunt", "strength": 1.0})
    obj = head.reshape(obj, {"preset": "pointed", "strength": 0.8})
    obj = head.graft(obj, other_base, neck_t=0.72)
    obj = head.fuse_kit(obj, {"kit": "hammer_foil.glb", "landmark": "snout", "scale": 0.78, "yaw": 0.0})
    obj = head.fuse_foil(obj, {"landmark": "snout", "scale": 0.78})
    obj = head.fuse_hood(obj, {"landmark": "snout", "scale": 0.80})

    obj = fins.select_by_vertex_group(obj, {"group": "dorsal"})
    obj = fins.scale_about_base(obj, {"group": "dorsal", "scale": (1.0, 1.14, 1.65)})
    obj = fins.duplicate_along(obj, {"group": "dorsal", "count": 2, "spacing": 0.10, "taper": 0.82})
    obj = fins.extrude_tip(obj, {"group": "caudal_upper", "length": 0.18, "taper": 0.38})
    obj = fins.sail(obj, {"group": "dorsal", "height": 1.65})

    obj = accessories.place_kit(obj, {"kit": "crown_a.glb", "landmark": "dorsal_base", "offset": (0, 0, 0), "scale": 0.7, "yaw": 0.0})
    low, hi = accessories.apply_accessories(obj, {"kits": [{"kit": "plate_row.glb", "landmark": "dorsal_base", "offset": (0, 0, 0), "scale": 0.7, "yaw": 0.0}], "tri_budget": 9000})
    low, hi = accessories.fuse(obj, {"kit": "crown_a.glb", "landmark": "dorsal_base", "scale": 0.7, "tri_budget": 9000})

`head.bridge_loops(vertices, faces, loop_a, loop_b)` is also available to
recipe code when a custom graft seam needs to be assembled explicitly.

## Render gate

The counts-only verification passes. The requested EEVEE review render could
not complete on this host: even a minimal 64px cube scene using
`scene.render.engine = 'BLENDER_EEVEE'` exits with code 134 during Blender's
headless GPU render initialization; the same occurs in the full
`kit_gen.py -- --verify` command before the first PNG is written. A PTY retry
exited 1 without pixels, and `--gpu-backend metal` segfaulted during startup.
No L2 review PNGs were fabricated or copied from another lane; existing L1
review PNGs were left untouched. Re-run the documented default review command
on a host with a working headless EEVEE backend to populate
`assets/review/L2_<op>_<base>.png`.

EXIT L2 PARTIAL headless Blender EEVEE render backend aborts before PNG output; counts, kits, fuses, hi preservation, and four-base operation matrix pass.

---

# L2b fix round (Rev 17) — body-relative kit scaling

This round answers the orchestrator's ACCESSORIES REJECTED review of
`aresrender_turntable.png` / `leviathanrex_turntable.png`.  All kit placement is
now computed **from the measured body at the landmark**; no kit is ever sized by
an absolute `scale * L` transform.

## Call signatures for L3 (names unchanged)

All entry points keep their Rev 17 names and argument shapes.  Only the
*meaning* of `scale` changed, as noted.

```python
from sharklib import accessories, head

# One kit, placed and fused.  Returns (low, hi).
low, hi = accessories.apply_accessories(obj, {
    "kits": [ {"kit": "armor_collar.glb", "placement": "neck", "fused": True} ],
    "tri_budget": 9000,          # FAMILY budget, not the accessory allowance
})

accessories.fuse(obj, params)     # alias of apply_accessories
accessories.place_kit(obj, params)  # place only, no boolean; returns obj

head.lattice(obj, {"preset": "bulbous", "scale": 1.4})
```

### `scale` — CHANGED MEANING (read this)

`scale` is now a **multiplier on the computed body-relative rule**, where
`1.0` means "exactly the rule".  It is no longer a multiplier on the kit's
authored size.  A recipe that previously said `"scale": 0.7` to shrink an
oversized collar should now say `1.0`.  Scalar, 2-tuple, or 3-tuple accepted
(`sx` across, `sy` along, `sz` up).

`head.lattice` takes **two independent** numbers, which are easy to confuse:
- `strength` — blend of the authored lattice, clamped to `0.0 .. 1.0`.
- `scale` — multiplier on the authored profile deltas, **not clamped**.
  `bulbous` + `scale: 1.4` is the reviewed preset and yields ~1.4x head
  width/height for `t > 0.8`.  Passing `1.4` as `strength` silently clamps to
  `1.0` and produces a much weaker head; pass it as `scale`.

Other per-kit params: `landmark` / `placement`, `offset` (local x/y/z),
`yaw` (radians).

## Per-kit anchor rules (all body-relative)

| kit | rule |
|---|---|
| `armor_collar` | ring at station t=.72, inner radius = local body radius x 1.05, thickness .04L |
| `plate_row` | plates t=.35..75 along the dorsal ridge, height <= .55 x dorsal fin height, tapering (largest mid-back), base sunk .01L into the skin |
| `spine_row` | as `plate_row` at .25 x dorsal height |
| `crown_a`, `horns_pair` | anchored to `head_top`, width <= head girth x 1.2 |
| `hammer_foil` | width 1.6 x head girth at t=.9 |
| `whale_hood` | 1.5 x head girth |
| `saw_rostrum` | length .22L forward of the nose, width .35 x head girth |

## Triangle budget

`tri_budget` is the **family** budget (9000).  The accessory allowance is
derived honestly: `min(1500, tri_budget - current_mesh_tris - mouth_tris)`,
where mouth tris are any scene meshes named `Cavity` / `UpperTeeth` /
`LowerTeeth`.  A 6.8k base + <=700 mouth + <=1.5k accessory stays under 9000.
Measured added tris: **1374** on both `greatwhite_cy` and `tigershark`.

## Bugs found and fixed this round

1. **Collar unwrapped into a blade.** The authored `armor_collar` ring lies in
   its local **XY** plane, but the placement measured the radius about **XZ**.
   That made the inner radius 0.0 and flattened the ring into a vertical blade
   hanging below the belly (visible in the first render pass).  The ring plane
   is now XY with Z as axial thickness.
2. **Degenerate head width on `tigershark`.** Its mesh is nearly flat in the
   across axis at the head stations — raw section width is **0.0068** vs
   greatwhite's 0.195 — so head-anchored kits were sized to invisible slivers.
   `_section_stats` now also returns `girth = max(width, radius*1.6, L*0.06)`,
   and every head-anchored kit sizes from `girth`.  This is a real
   difference between the two approved bases, not a sampling artifact: it
   reproduces at every slab width.
3. **`hammer_foil` deleted the entire shark.** It is authored as an open,
   non-manifold sheet with no enclosed volume.  The EXACT boolean returned
   "success" while emitting only the operand; `_retain_largest_component` then
   kept the *hammer* and discarded the body (post-fuse `L` collapsed
   0.9928 -> 0.1056).  Fixed by `_ensure_solid()`, which solidifies a flat kit
   to .02L before the union so the boolean has a real interior.
   `_boolean_union` additionally snapshots the mesh and rolls back any union
   that loses >25% of the body's long-axis extent.

### Gate that was missing

`loose_after == 1` **does not prove the body survived** — a boolean that
deletes the shark also leaves exactly one component.  A `body_preserved` gate
was added to `kit_gen.verify_all` (`post L >= base L x 0.75`) so this class of
failure can never pass silently again.  L3 should keep this gate.

## Verification commands

Counts only (fast, no Cycles):

    /Applications/Blender.app/Contents/MacOS/Blender --gpu-backend opengl -b \
      --factory-startup --python tools/kit_gen.py -- \
      --verify --no-render --base greatwhite_cy --base tigershark

Full gate incl. the mandatory Cycles CPU render pass:

    ... --verify --base greatwhite_cy --base tigershark

`verify_all` raises `RuntimeError` listing any failing (base, op, gates), so a
non-zero exit is a real acceptance failure rather than a warning.

### Host note for L3

Only one Blender process is stable on this Mac.  With other lanes rendering
concurrently, Blender frequently **aborts at startup with no output and
`rc=1`** — this is contention, not a script fault.  Wrap invocations in a
wait-for-free-slot + retry loop and treat "no output at all" as "retry", not
"broken".  A full `--verify` with renders takes ~11 min uncontended.

---

## L2b final verification (render gate)

Full matrix, both approved bases, Cycles CPU 8 samples, 20 PNGs:

    L2_GATE greatwhite_cy  armor_collar | plate_row | crown_a | hammer_foil | head_bulbous_1.4 -> PASS
    L2_GATE tigershark     armor_collar | plate_row | crown_a | hammer_foil | head_bulbous_1.4 -> PASS

80/80 numeric gate checks pass (10 ops x 8 gates), 0 acceptance failures,
`body_preserved: True` on every op.  Measured added tris **1374** (<= 1500) on
both bases; fused component count 1; collar ratio 1.05 (in 1.00..1.15);
plate top margin -0.0105 (greatwhite) / -0.0244 (tigershark), both <= 0;
bulbous 1.4 head width 0.2126 -> 0.3019 (1.42x) and height 0.2518 -> 0.3505
(1.39x) on greatwhite.

### Verified BY EYE in the PNGs

- **armor_collar / greatwhite_cy — GOOD.** Reads as a true ring encircling the
  neck at body scale (the rejected "2.5x body girth hoop" is fixed).  It lands
  at long .2216 against a pectoral landmark at .2085, i.e. on the shoulder.
- **plate_row — GOOD** on both bases.  A row of dorsal plates following the
  ridge, largest mid-back, tapering, clearly under dorsal fin height.
- **hammer_foil — GOOD** on both bases after the fix.  Body intact, hammer
  lobes attached at the snout.  Note it now fuses with **FAST**: the guard
  correctly rejects EXACT, which was destroying the body.
- **head_bulbous_1.4 — GOOD.** Clean silhouette, visibly heavier head, and the
  printed before/after numbers back it up.

### KNOWN DEFECTS still open (do not treat these ops as done)

1. **`crown_a` renders no visible crown on either base.**  All eight gates
   pass and the fuse is clean (`body_preserved: True`, `loose=1`, added 1374),
   but the ornament is not in the output.  The fused mesh's world bbox tops out
   at z=0.164 while the crown should reach ~0.199, so the crown is being lost
   inside `apply_accessories` -- it is NOT a camera framing artifact: an
   independent wide-framed Cycles render written from scratch
   (`assets/review/L2check_crown_side.png`) shows the whole shark and no crown.
   Raising the height rule to `max(girth*0.70, 0.11*L)` did not change the
   render.  `horns_pair` shares this branch and is therefore also suspect.
2. **`armor_collar` on `tigershark` lands at the TAIL, not the neck.**  The
   ring is correctly formed and body-scaled (ratio 1.05, `body_kept: True`)
   but encircles the peduncle just forward of the caudal fin.
   Measured: the io-contract station t=.72 is **not anatomically equivalent
   across bases** -- long .2188 sits on greatwhite's pectoral (.2085) but far
   from tigershark's (.0819).  greatwhite pectoral station .707 (~= the old
   hardcoded .72, so greatwhite was right by luck); tigershark .583.
   I changed the anchor to `pectoral_left` + .03 (clamped .55..80) and
   RE-RENDERED: the collar moved but is **still at the tail**.  So the
   pectoral anchor is NOT the fix and that change should be treated as
   suspect//reverted by L3.
   Remaining hypothesis, unproven: tigershark renders nose-LEFT while
   greatwhite renders nose-RIGHT, so the station->world mapping and the mesh
   orientation disagree for this base; `_station`/`_long_at` need to be
   validated against a landmark that is unambiguously the head (e.g. `nose`)
   per base rather than trusted from `head_sign`.

Both defects are placement/visibility issues, not budget or topology ones: the
tri budget, component count, and body-preservation gates are honest and green.

---

# L2c fix round (Rev 17) — station polarity + crown weld

Closes the two defects L2b left open.  Owned files touched:
`tools/sharklib/head.py`, `tools/sharklib/accessories.py`, `tools/kit_gen.py`.
No git commit.  `tools/shark_variant.py` and `tools/recipes/*.json` were read
only.

## Defect 1 — collar around the TAIL on tigershark: ROOT CAUSE FOUND

**L2b's hypothesis was wrong and is now disproved.**  L2b guessed that
tigershark's `head_sign` disagreed with the measured nose.  It does not: with
the shipped code both bases report `head_sign 1` and `_station(nose) == 1.0`.
The mirroring is real but it happens one level further up.

`sharklib/io.measure()` never re-orients the mesh.  It *assumes* the bake
contract (nose at +Y) and then defines the nose as simply the max-Y vertex:

    nose = max(vertices, key=lambda v: v.co.y).co.copy()

For a base whose GLB was authored nose-at--Y that assumption is silently
wrong, `nose` is really the CAUDAL TIP, and every station derived from it is
mirrored.  `tigershark` is such a base.  Measured proof (`--factory-startup`
probe over both bases):

| base | girth front(+Y) | girth back(-Y) | tip aspect w/h at t>=.92 | at t<=.08 |
|---|---:|---:|---:|---:|
| `greatwhite_cy` | 0.1263 | 0.0850 | 0.609 (round snout) | 0.030 (thin blade) |
| `tigershark`    | 0.0496 | **0.0825** | **0.126** (thin blade) | **1.741** (round snout) |

Tigershark is exactly inverted on both discriminators.  Its girth profile
confirms it: before the fix the section girth ran 0.137 at t=.10 rising to
0.326 at t=.70 *measured from the wrong end*, so the anatomical neck sat near
t=.30 while the code placed the ring at t=.72 — on the peduncle.  This is also
why L2b's "anchor to `pectoral_left`" patch did not help: that landmark was
mirrored too (station .58, i.e. the wrong side of the body).

### Fix

1. `head._measured_head_sign()` (new) derives polarity **from the geometry**,
   never from the contract: mean radial girth per half (the same test
   `io.orient` uses for its own flip) plus an extreme-tip aspect-ratio term
   (a caudal fin is a thin tall blade, a snout is comparatively round).  Both
   terms agree strongly on the approved bases; a tie keeps the documented
   contract.
2. `head._coerce_measure()` no longer hardcodes `head_sign = 1`.  When the
   measured polarity is negative it re-derives the landmarks that are defined
   by an END of the body (`nose`, `head_top`, `tail_base`) under the true
   polarity; symmetric landmarks are left alone.  `neck`/`caudal` are built
   from the measured axis rather than a hardcoded `Vector((0, ..., zc))`,
   which was also wrong for any base whose long axis is not Y.
3. `head_top` is now taken from a `t>=0.88` band, not `t>=0.72`: on tigershark
   the t>=.72 band's highest vertex is on the BACK (t~.73), not the head.
4. `pectoral_left/right` are re-derived under the true polarity.
5. `accessories._pectoral_station()` (new) replaces both the old hardcoded
   `t=.72` and L2b's `pectoral_left + .03` patch.  The girdle is measured as
   the station where the lateral width peaks over the forward half of the
   body, with the landmark used only to break a tie, clamped to .58..84.

After the fix tigershark measures `head_sign -1`, nose at the broad end, and
its girth profile matches greatwhite's shape.  The `dorsal` vertex group
t-mean also snaps into agreement (0.612 vs greatwhite 0.590; it was 0.388).

**`io.measure` itself is L1's file and was NOT edited.**  The correction lives
entirely in L2's coercion layer.  L1 should be told that `io.measure` mis-reports
`nose`/`head_top`/`tail_base` for any nose-at--Y base, since every `io.measure`
consumer inherits that bug.

## Defect 2 — crown_a fused but invisible: TWO separate causes

Pre-fuse vs post-fuse bbox printing (as requested) localised it:

    greatwhite_cy  kit placed z[0.0897,0.1989]  ->  post-fuse body top 0.1630

The crown was placed correctly and then destroyed.  Stage-by-stage:

    body top before        0.1660
    kit placed top         0.1989
    EXACT union -> True    body top now 0.1989   loose 11
    after voxel remesh     0.1986
    after retain-largest   0.1630   <-- crown deleted here
    after decimate         0.1630

**Cause 2a — the crown never welded.**  `head_top` is the topmost SKIN vertex,
so the old `center = head_top + up_dir*0.008L` left the ornament resting on
the surface with no interpenetration.  The voxel remesh could not bridge that,
the crown stayed a separate island, and `_retain_largest_component` (which
keeps the body and throws away every other island) deleted it.  Every gate
still reported green, which is exactly how this hid.  Fixed by seating the
crown base `0.02L` BELOW the skin and adding the sink depth back to the height
so the visible crown keeps its intended size.

**Cause 2b — the EXACT boolean silently drops the kit on tigershark.**  With
2a fixed greatwhite passed but tigershark still collapsed (kit built to
z=0.2571, post-fuse top 0.1458).  Stage printing showed the loss happens
*inside the union itself* — vertex count fell 7162 -> 3457 and the top never
moved — not in the remesh or the component pass.  Tigershark's base is a
shredded photogrammetry shell (**842 loose components**; greatwhite 684), and
EXACT against such a mesh reports success while emitting only the body.
`_kit_extent_present()` (new) now checks after every union that the kit's own
silhouette actually arrived; a union that loses it is rolled back exactly like
the existing body-destruction guard, so EXACT is rejected and FAST is used.
Tigershark now logs `union EXACT -> False` / `union FAST -> True` and keeps the
crown at 0.2562.

**Cause 2c — the crown was sized only from the local head station.**  On a base
whose head sits well below the dorsal line (tigershark `head_top` z=0.031
against a body top of 0.147) an authored-height crown stays under the back
line and reads as a lump even when it survives.  The height rule now adds the
deficit between `head_top` and the body top before the authored clearance, and
the crown is seated on the measured ridge at its own station.

`horns_pair` shares this branch and gets all three fixes.

### Gate that was missing (and one that was fake)

`crown_visible` was added to `kit_gen.verify_all`.  Note the FIRST version of
this gate (`post_top >= head_top + .02L`) **passed tigershark while the render
showed no crown** — head_top z 0.031 is so far below the body top 0.147 that
existing body geometry satisfied it.  The shipped gate compares against
`max(head_top, body_top) + .02L`, which correctly failed tigershark until the
geometry was actually fixed.  A gate that cannot fail is worse than no gate.

`collar_at_neck` was also added, but it is **weak by construction**: it
recomputes `_pectoral_station` the same way the placement does, so it reads
delta 0.0000 on both bases and cannot catch a bad anchor.  It guards against
regression in the station->world mapping, not against a wrong anchor rule.
The render is the real check for the collar.

## Gate results — both approved bases, Cycles CPU 8 samples

    L2_GATE greatwhite_cy  armor_collar | plate_row | crown_a | hammer_foil | head_bulbous_1.4 -> PASS
    L2_GATE tigershark     armor_collar | plate_row | crown_a | hammer_foil | head_bulbous_1.4 -> PASS

**100/100 numeric checks pass** (10 ops x 10 gates), 0 acceptance failures.

| metric | greatwhite_cy | tigershark |
|---|---:|---:|
| added tris (<=1500) | 1374 | 1374 |
| fused components | 1 | 1 |
| body_preserved | True | True |
| collar station vs pectoral (<=0.05L) | 0.7234 vs 0.7234, delta 0.0000 | 0.7328 vs 0.7328, delta 0.0000 |
| collar inner-radius ratio (1.00..1.15) | 1.050 | 1.050 |
| plate top margin (<=0) | -0.0105 | -0.0189 |
| crown top vs required | 0.2744 >= 0.1858 (+0.0886) | 0.2562 >= 0.1672 (+0.0889) |
| bulbous 1.4 width / height | 1.42x / 1.39x | 1.42x / 1.39x |

## Verified BY EYE in the re-rendered PNGs

Ten fresh PNGs in `assets/review/L2_<op>_<base>.png`, opened and looked at:

- **armor_collar / tigershark — FIXED.**  The ring sits at the neck just
  behind the head and forward of the dorsal fin.  It is no longer on the tail.
- **armor_collar / greatwhite_cy — GOOD, no regression.**  Still at the neck.
- **crown_a / greatwhite_cy — FIXED.**  Prongs stand clearly above the head and
  are welded to the body.  Previously nothing rendered at all.
- **crown_a / tigershark — FIXED.**  Prongs clearly proud of the head.  (The
  intermediate build, where only cause 2a was fixed, rendered a rounded LUMP —
  recorded here because the numeric gate passed that build.)
- **plate_row — GOOD on both.**  Follows the dorsal ridge, largest plate
  mid-back, tapering aft, clearly under dorsal fin height.
- **head_bulbous_1.4 — GOOD on both.**  Visibly heavier head, clean silhouette.
- **hammer_foil / greatwhite_cy — GOOD.**  Reads as an attached lobed foil.
- **hammer_foil / tigershark — WEAK, honestly reported.**  Body intact and all
  gates green, but the foil renders as a small bump near the snout rather than
  a hammer.  Tigershark's head section is nearly flat across (width 0.0068 at
  t=.90) so the `girth` floor dominates and the lobes stay tiny.  This is
  PRE-EXISTING, not a regression from this round, and it is not one of the two
  defects assigned.  Left open for a follow-up round.

## Call signatures for L3 — UNCHANGED

No entry point name, argument shape, or parameter meaning changed this round.
The L2b signatures still stand verbatim, including `scale` as a multiplier on
the computed body-relative rule.  Two behavioural notes:

- Stations are now measured per base.  A recipe that hardcodes a `t` value and
  assumes it is anatomically equivalent across bases is still wrong; use the
  landmarks.
- `accessories.apply_accessories` sets `rf_accessory_extent_lost` on the
  returned low object.  Non-zero means `_retain_largest_component` discarded
  geometry, i.e. a kit failed to weld.  Worth asserting in L3's own gates.

Pilot recipe `tools/recipes/aresrender.json` (tigershark + armor_collar,
`"placement": "neck"`) routes through `shark_variant.py` straight into the
fixed path.  Note `shark_variant.py` wraps the accessories call in a
`try/except` that only logs `WARN ... failed`, so an accessory exception there
is non-fatal and easy to miss in a long log — L3 may want that to be loud.

## Verification commands

Counts only:

    /Applications/Blender.app/Contents/MacOS/Blender --gpu-backend opengl -b \
      --factory-startup --python tools/kit_gen.py -- \
      --verify --no-render --base greatwhite_cy --base tigershark

Full gate incl. the mandatory Cycles CPU render pass (~11 min uncontended):

    ... --verify --base greatwhite_cy --base tigershark

Host note from L2b still applies: one Blender at a time on this Mac.  With
another lane rendering, startup aborts with no output and rc=1; wrap in a
wait-for-free-slot + retry loop and treat "no output at all" as retry.  Every
result above was produced that way.

EXIT L2c PASS
