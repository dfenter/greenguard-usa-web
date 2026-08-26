# HSE lane status

Lane: HSE-ify the 86-shark roster onto real baked textured GLBs.
Working folder: play/razorfin/hse/ (this file, probes, evidence).
Code owned: shark3d.js (textured path), tools/gen_data.py, assets/models/ (baked GLBs).
Do NOT touch: engine3d.js world3d.js fx3d.js ui3d.js meta.js tools/shark_bake.py.
Bake source: /Users/lucille/.claude/tmp/claude-501/-Users-lucille/7ee0abbc-9b48-4c15-96a9-8fca43a50357/scratchpad/baked/<name>.glb (another lane, still producing).

## Baked GLBs seen so far (16:25 timestamps)
altimus bullhead bullshark dogfish greatwhite_cy megalodonrex realisticshark scallopedhammer
Missing yet: tigershark/tiger_mg, blueshark, whaler, smoothhound, whaleshark-scale body.

## Plan
1. Copy usable bakes into assets/models/, add MODEL_FILES + TEXTURED_KEYS entries,
   map families in gen_data.py sil[11], regenerate data.js, verify each visually.
2. Identity layer in texturedSkinMaterial shader: hard countershade terminator,
   pattern masks from def.sil.pattern blended over diffuse, accent/glow seams for
   cls legendary/god/demon, per-row eye color.
3. Exaggeration: PERSONALITY_TABLE bulk/sculpt as bounded bone scales on
   Head/LowerJaw/Neck/Spine/Tail for textured rigs.
4. Props/features on textured rigs (crest plates, tusks, horns, crown, Sharkjira,
   Leviathan Rex; hammer foil NOT on real hammerhead).
5. Face batch fitted by measuring head band from the mesh.

## Milestones
- [x] Context read: NOTES-rev14-textured.md, shark3d.js structure, gen_data.py.
- [x] Step 1 base-family map  (lane O1, see hse/STATUS-O1.md + hse/FAMILY_MAP.md:
      14 of 19 bakes approved on render, 40/86 rows textured, rest HELD not broken)
- [ ] Step 2 identity layer
- [ ] Step 3 exaggeration
- [ ] Step 4 props
- [ ] Step 5 eyes/teeth fit

## COORDINATION (orchestrator, 17:45): six more implementers joined this tree.
Ownership now: L1 skin_identity.js (identity shader), L2 rig_morph.js (exaggeration), L3 props_textured.js (props/kaiju),
O1 gen_data.py + data.js + MODEL_FILES/TEXTURED_KEYS + assets/models + LICENSES.md (family map), O2 face_textured.js, O3 verify.mjs.
Cline lane: keep your work in play/razorfin/hse/cline_*.js modules with one-line hooks in shark3d.js; do NOT edit gen_data.py/data.js
(write needs to hse/REQUESTS.md) and do not edit the other modules. Small exact-string edits in shark3d.js only; re-read before editing.
