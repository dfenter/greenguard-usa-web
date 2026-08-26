# Lane O1 status: base-family map and asset wiring

Owns: `tools/gen_data.py`, `data.js` regeneration, `MODEL_FILES` /
`TEXTURED_KEYS` in `shark3d.js`, `assets/models/`, `LICENSES.md`,
`hse/FAMILY_MAP.md`, `hse/REQUESTS.md`, `hse/inspect_glb.mjs`.

## Milestones

- [x] Validate every baked GLB. 19 inspected headlessly AND rendered.
      14 approved, 5 rejected (fossil jaw, untextured creature, degenerate
      mesh, paper-thin body, one redundant duplicate).
- [x] Copy approved bakes into `assets/models/` under family names; remove the
      three rejected assets a previous partial pass had already shipped
      (`altimus`, `bullshark`, `realisticshark`).
- [x] `MODEL_FILES` + `TEXTURED_KEYS` updated to the 14 validated keys.
- [x] Family map assigned for all 86 rows in `tools/gen_data.py`, `data.js`
      regenerated (never hand-edited).
- [x] `LICENSES.md`: attribution for all 7 CC-BY sources plus the 7 CC0 ones.
- [x] `hse/FAMILY_MAP.md`: per-row model + reason, asset verdicts, budget.
- [x] `hse/REQUESTS.md`: two blockers filed at the lanes that own them.
- [x] Gates green: art3d, fish, meta, ui, game, world.
- [x] Full-roster 86 lineup rendered, contact sheet, 0 console errors.

## Where it landed

40 of 86 rows are on real textured shark GLBs across 13 distinct models.
The other 46 are HELD on the low-poly rig, not broken, by gates owned by other
lanes (see `hse/REQUESTS.md`):

- 37 rows: `hse/rig_morph.js` length-delta / displacement gate. The gate's own
  diagnostics show the L2 morph's bone scaling changes body length by more
  than its 3% tolerance. Measured proof the asset is not the variable:
  `cookiecutter` fails against ALL EIGHT textured bodies and passes only on
  the low-poly rig.
- 9 rows: identity prop meshes (saw, crown, horns, Sharkjira) still carry the
  Rev 9c toon material, and the textured contract requires every material on
  the row to be textured.
- 2 rows: `goblin` and `gulperfiend` are pinned by art3d to their own
  silhouette rigs (`goblinshark`, `anglerfish`) and must stay there.

Each hold is one commented line in `tools/gen_data.py` tagged `HELD` or
`HELD-L2`. When a lane clears its blocker, un-comment and regenerate; the map
behind every hold is already chosen and recorded.

## Notes for whoever picks this up

- `data.js` is GENERATED. `python3 tools/gen_data.py > data.js` from
  `play/razorfin/`. Never hand-edit it.
- `hse/inspect_glb.mjs` is the headless GLB contract check
  (`node hse/inspect_glb.mjs <files>`, `JSON=1` for full detail). It passed all
  19 bakes, including the 5 bad ones, so it screens but does not decide:
  a GLB is usable only after it is RENDERED and looks like a textured shark.
- `assets/bakeview/o1.html` frames the BIND-POSE box rather than the posed one,
  because the skinned box is inflated through the bone matrices and collapses
  the nose-tail extent. It takes `?m=<name>&roll=<radians>`.
- Three approved bakes (`bullhead`, `smoothhammer`, `tiger_nu`) author dorsal
  toward the viewer and only read broadside once rolled 90 degrees. The Rev 14
  loader already corrects this, so they are fine in game; judge them from
  `SHEET_roll.png`, not `SHEET_o1.png`.
- Two texture-budget findings are recorded in `hse/FAMILY_MAP.md`. Both live
  outside this lane's files: no compressed-texture path (10.67 MB decoded per
  shark against a 6 MB cap) and an eager `preload()` that keeps all 13
  textured GLBs resident (~139 MB).
