# Razorfin sharks: authored Blender families instead of runtime customization

## Context

Five rounds (Rev 12 to Rev 16) tried to make 86 distinct HSE-quality sharks by stacking
runtime layers (shader hue/markings, bone-scale morphs, procedural box props, eye/teeth
overlays) on four photogrammetry bakes. Owner verdict: jaws permanently open, the
customizations make no sense, the base sharks are not really customizable.

Why it failed (verified in code this session):
- The bakes are scans: one closed mesh, one photo texture, a generic skeleton not aligned
  to the mesh, no mouth interior, no separable fins. Nothing at runtime can add a head,
  a real open mouth with teeth, or a fused accessory. Outside 12 allow-listed prop rows,
  the only lever that changes a row is hue (`hse/props_textured.js:815-819` says so).
- Jaws: `shark3d.js:3642` writes `jawRestGape * JAW_MAX_ROTATION` at BUILD time with a
  clamp floor of 0.20 (`:3495`), so every rig leaves buildShark 8-14 deg open; the roster
  shooter (`hse/evidence/r15-doc/profileview.html`) never calls animate(), so every
  roster shot shows a permanent toothless yawn. In-game, the JAW authority works but
  starts from that open base.
- The runtime layers keep breaking each other (countershade sign, cyan hemi light,
  upside-down props, backwards rigs).

Decision (owner, 2026-08-29): ~20 authored families + cheap texture variants. Pilot =
the sharks the owner called good: Sharkjira (greatwhite_cy), thresher, snapjaw and
aresrender (tigershark), artemisstrike (whaler). Those five become the first five
authored families and the proof that the pipeline can customize them.

## Approach

Offline, agent-runnable Blender 3.6 pipeline (`/Applications/Blender.app`, headless bpy)
that starts from one of the four approved bakes and produces one GLB per FAMILY with a
modeled open mouth and teeth, real fused accessories, reshaped heads/fins, and painted
textures. Rows in a family share the GLB and differ by texture file, size and name.
Every family ships a turntable PNG the owner approves BEFORE it enters the game. All
runtime "customization" layers are deleted; the game keeps lighting, swim, jaw animation.

## Step 0: immediate correctness fixes (ship first, same day)

1. `shark3d.js:3642`: remove the build-time jaw write (rig leaves buildShark closed;
   `hse/rig_morph.js` `writeJawGape` stays the only writer). `:3495` clamp lower bound
   0.20 -> 0. Re-shoot roster with `rig.animate` at gape 0 so the document is honest.
2. Add CC-BY credits (greatwhite_cy, tigershark, thresher) to the in-game credits/menu
   (LICENSES.md already lists them). Live obligation.

## Step 1: pipeline (`tools/shark_variant.py` + `tools/sharklib/`)

Refactor `tools/shark_bake.py` into `tools/sharklib/{bake,rig,export}.py` (no behaviour
change; shark_bake.py becomes a thin caller). Move its UV rasteriser
(`flatten_dorsal_luminance`, shark_bake.py:709-750) to `sharklib/paint.py`.

Per-family JSON recipe (`tools/recipes/<family>.json`), ops in this order:
1. Load base GLB, strip armature, bake a world-position map to UV (EMIT of Position)
   and fin/head masks so paint is layout-independent.
2. Measure: long axis, jaw line (curvature flip below centreline in t 0.80-0.98),
   neck plane (t 0.72), fin vertex groups by geometric masks (dorsal, pectoral pair,
   caudal lobes, anal/pelvic).
3. Mouth: bisect a wedge between upper/lower lip planes hinged at the jaw line, extrude
   an inner cavity shell (dark material), append tooth strips from a small kit
   (`assets/kit/teeth_strip_upper|lower.glb`, generated cones, <= 300 tris), weight
   LowerJaw = lower lip + cavity floor + lower teeth with a smoothstep band at the hinge.
   Filter feeders (whale shark) get a wide low gape with no fangs.
4. Head: lattice presets (blunt/pointed/bulbous), graft from another base at the neck
   plane (bridge_loops after resampling rings to 24 verts), or foil/hood kit piece fused
   by boolean union EXACT -> voxel remesh (L/220) -> smooth.
5. Fins: per group scale/reshape/duplicate/extrude tip (sail dorsal, thresher whip,
   extra dorsal).
6. Accessories: kit GLBs (crown, horns pair, saw rostrum, spine row, plate row, armor
   collar, hammer foil, whale hood; `tools/kit_gen.py` builds them from primitives,
   CC0) placed at measured landmarks, boolean union, single voxel remesh if anything
   fused, decimate to <= 9k tris (reuse the gentle-pass loop, shark_bake.py:512-560),
   smart_project UV, EMIT + NORMAL rebake from the pre-op hi mesh so kit parts keep
   their authored colour and scan detail returns via the normal map.
7. Paint (numpy on the diffuse using the position map): countershade, stripes, spots,
   saddles, fin tips, glow seams, computed in world space; keep photo micro-detail via
   `photo / blur(photo)`. Family default embedded; per-row variants written to
   `assets/textures/rows/<row>.jpg` (<= 180 KB).
8. Finish: re-rig with the same bone names (`sharklib/rig.py`), apply mouth weights,
   export GLB (same flags as shark_bake.py:994), render an EEVEE turntable
   (0/90/180/270 + mouth close-up at LowerJaw 0 and 25 deg) to
   `assets/review/<family>_turntable.png`, print a JSON budget summary.

Fallbacks: holes_fill + remove_doubles before booleans; EXACT -> FAST -> remesh-only
fuse; subdivide the head region before the mouth cut, decimate back after.

## Step 2: pilot (owner's five)

Order: thresher (mouth + whip, texture only otherwise), snapjaw (tigershark: mouth,
blunt lattice, bars), aresrender (tigershark: mouth, war-paint saddles, armor collar),
artemisstrike (whaler: mouth, sail dorsal, silver tips), Sharkjira (greatwhite_cy:
mouth, 1.4x head, plate_row dorsal fused, charcoal + pale-blue seams). Each = one
turntable PNG delivered for approval; nothing is wired into the game until approved.

## Step 3: family map and batch

~22 families over 86 rows (proposal, adjust per owner): reef, mako, hammer (foil), saw,
tiger, bull, greatwhite, whale (hood, filter mouth), megalodon (bulbous head), thresher,
dunkleosteus (armor), greenland, goblin, angler, morayne (long), thornback (spines),
crowned gods, horned gods, horned demons, plated demons, kaiju (Sharkjira, Leviathan
Rex), creatures. Batch after the pilot is approved; every family gets the turntable gate.

## Step 4: runtime wiring and deletions

- `tools/gen_data.py`: `FAMILY_BY_ROW` + `TEXTURE_BY_ROW` -> `sil.family`, `sil.skin`
  (regenerate with `python3 tools/gen_data.py > data.js`).
- `shark3d.js`: `MODEL_FILES` = `assets/models/fam/<family>.glb`; `baseForDef()` reads
  `sil.family`; new `applyRowSkin()` loads the row texture (SRGB, flipY false) onto a
  cloned material; `hse/model_budget.js` counts row textures.
- Delete call sites: `applyIdentity` (skin_identity.js, :2331), `mountTexturedFeatures`
  (props_textured.js, :3319 and the hammer span block :3643-3647), `applyMorph`
  (rig_morph.js, :3273), `buildTexturedFace/checkTexturedFace` (face_textured.js,
  :3307), pattern/hue paths in `texturedSkinMaterial`. Keep: lighting rig, procedural
  spine swim, `writeJawGape` + engine jaw envelope, kaiju pulse uniforms, ModelBudget.
- `hse/verify.mjs` / art3d selftest: replace the identity/prop/face gates with family
  budget gates.

## Verification

- Owner gate: turntable PNG per family (4 angles + mouth open/closed) before wiring.
- `hse/inspect_glb.mjs` per family: tris <= 9000, GLB <= 1.0 MB, bones == Tail3..Head +
  LowerJaw, orphan weights 0. Jaw probe (`hse/probe_jaw.mjs` extended): pose LowerJaw
  0 and 0.72 rad; upper head does not move, lower lip moves >= 0.03 L, no triangle
  stretches > 3x.
- iOS canvas budget (`hse/model_budget.js` gates): 3 resident families + row textures
  well under 12 MB.
- In-game: `node --import ./tools/reg.mjs tools/selftest.mjs art3d world game`; played
  probe (menu -> level -> run, jaw trace open/close per eat via
  `hse/evidence/r15-jaw` gate); one in-game shot per family in `hse/evidence/r17/`.
- Roster document re-shot with `rig.animate({jawOpen: 0})` and posted only after the
  owner has approved the turntables.

## Staffing (owner directive): 3 Luna xhigh + 3 Sonnet low, in parallel

Luna lanes run via codex CLI (`nohup codex exec --profile luna`, xhigh, workspace-write,
launched from the repo dir with `</dev/null`; sandbox cannot bind localhost or launch
Chrome, so anything render-gated goes to a Sonnet lane; orchestrator commits). File
ownership is disjoint; no lane touches another's files; inverse-patch reverts only.

- Luna L1 `tools/sharklib/{io,bake,rig,export}.py` + `tools/sharklib/mouth.py`:
  refactor shark_bake.py into sharklib (no behaviour change, shark_bake.py thin caller),
  measure(), mouth op + LowerJaw weighting, tooth-strip kit generation.
- Luna L2 `tools/sharklib/{head,fins,accessories}.py` + `tools/kit_gen.py`: lattice /
  graft / foil head modes, fin group ops, accessory fusion with boolean fallbacks and
  remesh/decimate, kit GLBs (crown, horns, saw, spines, plates, collar, foil, hood).
- Luna L3 `tools/sharklib/{paint,finish}.py` + `tools/shark_variant.py` + recipe schema
  + the five pilot recipes: position-map bake, world-space paint layers, per-row texture
  variants, re-UV/re-bake, turntable render, JSON budget summary.
- Sonnet S1 (Step 0): `shark3d.js` jaw build-time write removal + clamp floor, CC-BY
  credits surface, roster re-shoot with `rig.animate({jawOpen:0})`, redeploy.
- Sonnet S2 (runtime): `tools/gen_data.py` FAMILY/TEXTURE maps, `shark3d.js` family
  loader + `applyRowSkin`, `hse/model_budget.js` texture accounting, runtime-layer
  deletions behind `RF_FAMILIES=true` (off until the pilot is approved).
- Sonnet S3 (verification): `hse/inspect_glb.mjs` family gates, `hse/probe_jaw.mjs`
  open/close/tear probe, turntable review-sheet builder, `hse/evidence/r17/` in-game
  shot harness, art3d selftest gate rewrite for families.

Sequencing: S1 ships immediately. L1-L3 and S2-S3 run concurrently; the pilot recipes
run as soon as L1+L3 land (L2 ops stubbed as no-ops until ready), turntables go to the
owner, then S2's flag flips per approved family.

## Effort (honest)

Step 0: half a day. Pipeline + kit: 4-5 days of agent time. Pilot five: ~1.5 weeks
including owner review cycles. Remaining ~17 families: 4-6 weeks (texture-only families
hours each; fused/graft families 1-2 days each). This is slower per shark than anything
tried so far and it is the only path that produces HSE-like results.
