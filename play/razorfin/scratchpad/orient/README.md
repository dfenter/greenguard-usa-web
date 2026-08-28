# lane ORIENT scratch probes (Rev 15)

`shark3d.js.bak` is the **PRE-FIX** shark3d.js, kept ONLY as the reference
build for the before/after comparison. **Do not copy it over the live file.**
The live file is the fixed one.

Probes (run from `play/razorfin/` with `node --import ./tools/reg.mjs <probe>`):

* `cmp.mjs`     — the headline before/after: raw-geometry size + jaw direction
                  for all 29 models. Old build shows 12 `jawUP FAIL`; new shows 0.
* `verify.mjs`  — post-fix gate: jaw-below-head and head-ahead-of-tail per model.
* `bones.mjs`   — dumps Head/LowerJaw/Tail world positions per rig.
* `measure2.mjs`— the fin-spike / skewness metrics (the dorsal FALLBACK path).
* `axisdbg.mjs` — shows why `Box3.setFromObject` disagrees with raw geometry
                  (skinned boxes are Y-inflated by the bone matrices).
* `rowcheck.mjs`— goblin / gulperfiend, the only two rows on the fallback path.

Note `measure.mjs` / `measured.json` / `spike.json` are the FIRST-PASS probes
that measured asymmetry about the bbox centre. They are retained only to show
why that approach returns ~0 for every model; do not build on them.
