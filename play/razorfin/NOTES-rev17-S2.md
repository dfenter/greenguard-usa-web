# Rev 17 Step 4 -- Sonnet lane S2 (runtime wiring)

Scope per PLAN-rev17-families.md Step 4 / staffing table: `tools/gen_data.py`
FAMILY/TEXTURE maps, `shark3d.js` family loader + `applyRowSkin`,
`hse/model_budget.js` texture accounting, runtime-layer deletions behind
`RF_FAMILIES` (off until a family is owner-approved). Everything below sits
behind `const RF_FAMILIES = false;` at the top of shark3d.js; with the flag
off, every changed code path falls through to its pre-existing behaviour.

## tools/gen_data.py

- `FAMILIES`: the ~22-family manifest from Step 3 (pilot five first:
  thresher, snapjaw, aresrender, artemisstrike, leviathanrex).
- `FAMILY_BY_ROW`: all 86 SHARKS ids assigned to exactly one family. Pilot
  rows point at their own name; every other row reuses the
  `TEXTURED_MODEL_BY_ROW` body-plan grouping (already curated by owner
  feedback) to pick a family, so a bull/tiger/croc-jawed row lands in a
  bull/tiger/croc family etc.
- `TEXTURE_BY_ROW`: per-row skin overrides. Seeded with the pilot five (each
  row is its own family, so its skin equals its own id); left otherwise empty
  since no per-row painted variants exist yet -- extend this table as
  `tools/shark_variant.py` writes `assets/textures/rows/<row>.jpg`.
- `FAM_FILES`: computed at GENERATE time (not runtime) by checking which
  `FAMILIES` names actually have `assets/models/fam/<family>.glb` on disk.
  Currently empty (no fam/ GLBs exist -- L1-L3's pipeline/pilot has not
  landed one yet). Emitted into data.js as `RFD.FAM_FILES`.
- `shark_row()`: emits `sil.family` (from FAMILY_BY_ROW) and `sil.skin` (from
  TEXTURE_BY_ROW, only when set) as two ADDITIVE sil fields. Every existing
  sil field is untouched. Verified idempotent: two successive
  `python3 tools/gen_data.py` runs diff clean.

## shark3d.js

- `RF_FAMILIES` flag declared next to the existing `RF_O2_TEXTURED_FACE` kill
  switch, default `false`.
- `MODEL_FILES_BASE` (the old frozen `MODEL_FILES` object literal, renamed)
  + `FAM_MODEL_FILES` (built only when `RF_FAMILIES` is on, from
  `RFD.FAM_FILES`, mapping `fam/<family>` -> `fam/<family>.glb`) are merged
  into the real `MODEL_FILES`. With the flag off, or with `FAM_FILES` empty,
  `MODEL_FILES` is byte-identical to before.
- `baseForDef()`: when `RF_FAMILIES` is on, `sil.family` wins over
  `sil.model` -- but ONLY when `fam/<family>` is actually a real MODEL_FILES
  key (i.e. that family's GLB shipped). A family named in the data with no
  GLB yet falls straight through to the existing `sil.model` / head-tag
  routing, so families can be approved and wired in one at a time without
  ever breaking the rest of the roster.
- `isFamilyRow(def)` helper: `RF_FAMILIES && sil.family present && fam/<family>
  in MODEL_FILES`. Used everywhere below as the single gate.
- `applyRowSkin(rig, def)`: new function, called from `buildShark()` only
  when `RF_FAMILIES` is on. Loads `assets/textures/rows/<sil.skin>.jpg` via
  `THREE.TextureLoader` (SRGB color space, `flipY = false`), clones the rig's
  body material(s) per-instance (never mutates the shared template
  material), swaps in the row texture once it decodes, and caches the
  texture by skin NAME (not row id, since multiple rows can share one
  painted variant) so repeat rows of the same skin do not re-fetch. Counts
  decoded bytes into `ModelBudget.admitRowSkin()`. No-op (and therefore
  harmless with the flag off) when `sil.skin` is unset.
- Deletion switches, all gated on `isFamilyRow(def)`:
  - `applyIdentity` (in `texturedSkinMaterial`) skipped -- a family row's
    identity comes from the modeled/painted body + `applyRowSkin`, not the
    runtime HSV tint.
  - `applyMorph` skipped -- the family GLB already carries its final modeled
    shape from the Blender pipeline.
  - `buildTexturedFace`/the toon `makeFace` skipped -- the bake models a real
    mouth and teeth, so neither face overlay has anything to add.
  - `mountTexturedFeatures` skipped -- fused accessories are modeled into the
    GLB itself.
  - The hammer-span measurement block needed no separate guard: it only runs
    when `prop` is non-null, and `prop` is already `null` for every textured
    row (family rows included) via the existing `textured ? null : makeProp(...)`
    line.
  - `texturedSkinMaterial`'s hue-steer/countershade-bias block is now wrapped
    in `if (uRfIdentityBypass < 0.5) { ... }` in the GLSL, with a new
    `uRfIdentityBypass` uniform set to `1` for family rows. The wet-specular
    roughness pass and the fresnel emissive rim sit OUTSIDE that block and
    are untouched -- lighting keeps working on a family row exactly as on any
    other textured row.
  - Kept everywhere, per the plan: procedural spine swim, `writeJawGape`
    (rig_morph.js, unmodified), the kaiju pulse uniforms (Sharkjira/Leviathan
    feature builders are already gated on `!textured`, so a family row simply
    never enters them -- no new guard needed there), and `ModelBudget`.

## hse/model_budget.js

- `rowSkinTextureBytes(texture)`: decoded-byte helper for a single row-skin
  texture, reusing the existing `bytesForMap()` math.
- `ModelBudget.rowSkins` (Map), `admitRowSkin(skin, texture)`,
  `rowSkinBytes()`: a second, separate accounting ledger from the per-
  template LRU above (row skins are per-ROW not per-template, small, and
  never evicted -- they live for the tab's life). `report()` now also
  returns `rowSkinCount`/`rowSkinBytes` so a budget probe sees the row-
  texture contribution the plan's iOS-budget note calls out.

## Verification

- `python3 tools/gen_data.py > data.js` twice, diffed clean (idempotent
  apart from the new `sil.family`/`sil.skin` fields, which is the expected
  and only diff against the pre-existing data.js).
- `node --import ./tools/reg.mjs tools/selftest.mjs art3d game meta ui world
  all` -- see the runner output in the report below.
- Added an art3d selftest case ("family fallback gate") asserting, against
  the REAL data (not a simulated flag flip): every row carries `sil.family`,
  `FAM_FILES` is currently empty, `isFamilyRow()` is false for every row, and
  `baseForDef()` for every family-assigned row still resolves to exactly the
  pre-family `sil.model`/head-tag base. This is the flag-on-but-no-GLBs
  fallback contract from the plan, checked with the flag's own logic rather
  than by toggling the module constant (which is not mutable at runtime by
  design).

## Not done / left for other lanes

- No `assets/models/fam/*.glb` or `assets/textures/rows/*.jpg` files exist
  yet -- those are Luna L1-L3's pipeline/pilot output and the owner's
  turntable approval gate. `FAM_FILES` and the per-row texture assignments in
  `TEXTURE_BY_ROW` should be widened as approved families land; no code
  change is required on this lane's side for that, only data.
- `hse/inspect_glb.mjs`, `hse/probe_jaw.mjs` extensions, and the
  turntable/evidence harness are Sonnet S3's ownership per the plan.
