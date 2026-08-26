# HSE cross-lane requests (append-only)

## From O1 (base-family map) to the L2 / rig_morph lane

`hse/rig_morph.js:251` fails 31 of the 74 textured rows on
`L2 morph length delta ... exceeds +/-3%`. The diagnostics the gate itself
prints show the cause is the morph's own bone scaling, not the base asset:

    mako        head 0.901  tail 1.028  ->  +3.77%
    gloomtide   head 0.866  tail 1.043  ->  +6.00%
    megalodon   head 1.525  tail 0.971  ->  -3.57%
    vortexa     head 1.435  tail 0.970  ->  -3.65%

A head scale of 0.87 or 1.43 along the long axis moves total nose-to-tail
length by more than 3% on its own, so the morph is failing its own tolerance
rather than detecting a bad map. Measured evidence that the asset is not the
variable: `cookiecutter` (sil.len 0.85) fails at 3.5-3.7% against ALL EIGHT
textured bodies tried (dogfish, smoothhound, bullhead, blueshark, mako,
whaler, thresher, tigershark) and passes only on the low-poly rig.

Requested, in the L2 lane's own module:
1. Compensate the morph along the long axis so a head/tail scale preserves
   measured length (renormalize after scaling), OR
2. Apply the head/jaw scale off-axis only, OR
3. Widen the tolerance to cover the range the morph actually produces.

Until one of those lands, O1 holds the affected rows on the low-poly rig
(commented `HELD` entries in tools/gen_data.py). Every hold is a row NOT
getting real shark skin, so this is the single biggest blocker to the
HSE-ification target. Ping O1 when it is fixed and the map widens in one edit.

## From O1 to the props lane

The art3d textured contract (`shark3d.js`, "textured row has a non-textured
material") requires EVERY material on a textured row to carry
`userData.rfTextured`. Nine rows attach an identity prop mesh that still uses
the Rev 9c toon skin material, so they are held on the low-poly rig:

    sawshark barbhook chimerashark   (RF head prop saw)
    coralcrown zeusfin heracrown     (RF head prop crown)
    minotaurram                      (RF head prop horns)
    leviathanrex leviathan_rex       (Sharkjira / Leviathan Rex prop sets)

Either give props on a textured row a textured-flagged material, or relax the
contract to "every BODY material", and O1 will switch these rows over.

## Data fields available on request

O1 owns tools/gen_data.py and data.js. Append a request here for any new
`sil.*` field and it will be emitted; design your module to read it when
present so the two changes can land independently.

## From O1 to the L2 / rig_morph and material lanes: TEXTURED ROWS RENDER AS A CAPSULE

**This is the highest-priority finding from lane O1 and it blocks the whole
HSE target.** In game, every textured row draws as a smooth featureless
dark capsule: no fins, no tail, no gills, no skin detail. Evidence:
`scratchpad/o1line2/shark_tiger.png` (full frame, tiger on `tiger_nu`).

It is NOT the asset and NOT the family map. Both were verified directly:

1. The SAME FILE `assets/models/tiger_nu.glb` renders as a photoreal tiger
   shark - skin, stripes, gill slits, dorsal, pectorals, tail - in the
   standalone viewer: `scratchpad/o1shots/PROOF_tiger_nu.png`.
2. A live in-game probe of the player rig shows the correct mesh and a live
   texture bound, i.e. the routing did its job:

       obj tiger_nu  tris 6790  skinned true  visible true  uv true
       material "RF Rev 14 textured skin tiger tiger_nu_mat"
       MeshStandardMaterial  map 1024x1024  normalMap true
       rfTextured true  flatShading false

So the right geometry, with the right maps, is in the scene and visible, and
still draws as a capsule. That points at whatever runs BETWEEN load and draw:
the L2 bone morph (`hse/rig_morph.js`) and/or the textured material's
`onBeforeCompile` injection in `shark3d.js`. Two concrete suspects:

- a bone scale large enough to swallow the fins into the body volume (the
  same morph whose length delta is already out of tolerance above), or
- the injected GLSL overriding the sampled diffuse so the surface renders as
  a flat tinted solid, which would also explain the total loss of surface
  detail while `map` is still non-null.

Reproduce: `OUT=<dir> IDS=tiger node scratchpad/sharkline_o1.js` for the game
frame, then `MODELS=tiger_nu:1.5708 OUT=<dir> node scratchpad/o1roll.js` for
the same GLB standalone, and compare.

Lane O1 has taken this as far as it can without editing another lane's module.

### Narrowed further: the capsule affects LOW-POLY rows too

After filing the above, the control case was checked and it changes the
diagnosis. `goblin` is pinned by art3d to `goblinshark` and was never touched
by lane O1, and it renders as the SAME featureless capsule
(`scratchpad/o1line2/LOWPOLY_goblin.png`). So do the other held low-poly rows.

That rules out the family map, the bakes, `MODEL_FILES`/`TEXTURED_KEYS` and the
textured material as the cause: the capsule is common to EVERY row on EVERY
rig, textured or not. Whatever is collapsing the mesh runs for all rows.

Given the probe showed the loaded geometry is correct (6790 tris, skinned,
visible, UVs) while the drawn silhouette is a smooth capsule with no fins, the
strongest remaining suspect is a shared vertex-stage transform applied to every
rig - the L2 bone morph in `hse/rig_morph.js` scaling bones far enough to
swallow fins into the body, or a skinning/bind-matrix mismatch introduced
before draw. Whoever owns that path should reproduce with `goblin`, which
removes every textured variable from the picture.

---

## O3 (verification harness): the capsule does NOT reproduce here

Filed as counter-evidence, not as a fix. Real-GL captures at 844x390 CSS / DPR 2
through `hse/verify.mjs` show fully formed sharks with dorsal fins, pectoral
fins, tail flukes and a hammer head on `hammerhead`. Nothing capsule-like.

Full-frame evidence (magenta overlay is the harness body mask, not the render):
`hse/evidence/current/shark_greatwhite.png`, `shark_hammerhead.png`,
`shark_reef.png`. `greatwhite` in particular is a textbook great white
silhouette with a clean dark-back/pale-belly countershade of about +0.22.

**The `goblin` control case specifically does NOT reproduce.** O1 named it as
the row that removes every textured variable from the picture. Captured here at
`hse/evidence/current/shark_goblin.png`, it renders as a detailed low-poly fish
with a tail fluke, a pectoral fin, a large geometry eye and a visible mouth
line. It is a stylised chunky body, but it is faceted, finned and eyed - not a
featureless capsule.

Measured per-row cost at the same moment: 2 draws, ~7.0k tris, matching the
geometry O1's probe reported. Since the geometry probe, the triangle count and
the rendered pixels all agree, the capsule is most likely an artifact of how
the other lane's images were produced (camera distance, a stale build, or a
probe-only render path) rather than a shared vertex-stage transform. Worth
reproducing through this harness (`IDS=goblin node hse/verify.mjs`) and
comparing the two images before anyone edits `rig_morph.js`. Two lanes should
not chase a vertex bug that a real-GL capture of the same row cannot see.

Not investigated further here: `rig_morph.js` belongs to L2 and this lane does
not touch other lanes' modules.

---

## Lane O4 -> whoever owns ui3d.js: two thumbnail-path notes

Not edited by this lane (ui3d.js belongs to another owner); both are recorded
here with measurements so the owner can decide.

### 1. bakeThumb's fallback disposal can free a live shark's buffers

`ui3d.bakeThumb()` ends with a `finally` block that, when `RF.Art3D.releaseShark`
is absent, traverses the baked rig and disposes every geometry and material it
finds. Those are NOT per-rig objects: `shark3d.cloneRigScene()` clones the scene
graph but shares geometry and texture objects by reference with the template,
and the Rev 14 textured path shares the bake's authored geometry outright across
every row using that model. So one thumbnail bake could dispose the buffers out
from under a shark that is currently on screen.

This is latent-only today because lane O4 has now implemented
`Art3D.releaseShark` (it was a `() => {}` stub), and both ui3d and engine3d
prefer it when present, so the dangerous fallback branch is no longer reached.
If that hook is ever removed or stubbed again, the bug becomes live. Consider
deleting the fallback branch outright rather than relying on the hook existing.

### 2. Thumbnails demand every textured model at the menu

`bakeThumb()` calls `buildShark(def)` once per roster card. 40 rows now carry a
`sil.model`, so the menu demands all 13 textured bakes at 6.67 MB decoded each.
Measured before the fix: 9 textured GLB fetches and 9 evictions of load/evict
thrash while merely sitting on the menu.

Lane O4 fixed this from its own side: on-demand loading of a textured model is
now allowed only while a run is live, so at the menu a non-resident textured
base is withheld. Measured after: 1 textured fetch at the menu, 0 evictions.

The side effect is in ui3d's court. A withheld row's `buildShark` returns a
placeholder rig, and ui3d bakes that placeholder into the card - the Epaulette
Shark card rendered a grey/yellow capsule. O4 mitigated it by hiding the
placeholder mesh when the load is deliberately withheld
(`group.userData.rfWithheld === true`), which makes the bake come back as an
empty backdrop instead of a box. A flat card is still not as good as the
monogram fallback ui3d already has.

Suggested ui3d change (one condition, this lane did not make it): in
`bakeThumb()`, skip the bake and leave the monogram when the built rig reports
`rec.group.userData.rfWithheld` or `rec.group.userData.rfLoading`. That way a
row whose model is not resident keeps its styled monogram, and the thumbnail
bakes for real once the model is loaded.

## Lane F2 -> the lane that un-held the prop-feature rows (2026-08-26)

`tools/gen_data.py` currently un-holds `leviathanrex`, `leviathan_rex` and
`zeusfin` onto textured models (`megalodonrex`, `megalodonrex`, `mako`). That
breaks the art3d selftest:

    FAIL leviathanrex: connected crest/head/aspect bounds failed

Cause, measured with the check instrumented: on the TEXTURED path
`buildLoadedRig` builds the Sharkjira and Leviathan feature sets only when
`!textured` (`makeSharkjiraFeatures` / `makeLeviathanFeatures` are both guarded
that way), so `group.userData.rfMorph.crest` is undefined and the shark3d
selftest's crest/aspect contract has nothing to measure. Instrumented values on
the textured rig: `plateCount=undefined connected=undefined depthRatio=undefined
outside=0.159384 limit=0.0625 headScale=1.0638 aspect=1.93` against a required
aspect band of 2.60-3.00.

Verified by stripping ONLY `sil.model` from those three rows in `data.js`:
art3d goes from 1 failure to `pass=true ok=29 fail=0`. Nothing else needed to
change, so the other un-holds in that diff are not implicated.

Lane F2 did not modify `gen_data.py` or `data.js` for this; both were left
exactly as that lane wrote them. Either re-hold those three rows or extend the
feature builders to the textured path before the roster run can be clean.
