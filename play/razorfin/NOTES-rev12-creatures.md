# Rev 12 creatures lane (fish3d.js) — pass 1

Owner: fish-loft lane only. File touched: `fish3d.js`. No other files
touched, no commit made.

## What changed

Rev 12 data lane (see `NOTES-rev12-data.md`) added three CREATURES rows for
the new level specials: `seal` (Harbor Seal, tier3), `sealion` (Sea Lion,
tier4), `orca` (Orca, tier8, predator-class narrative flavor authored as a
high-value prey row -- see data lane's note on why it's not a true NPC
predator). In-game these rendered via `buildProceduralGeometry()`'s crude
egg-blob loft (no `FISH_PALETTE_TABLE`/`FISH_SHAPE_TABLE`/`SPECIES_BASE_MAP`
entries existed for them yet, so `buildFish()` returned `null` and the
fallback loft used elsewhere took over).

### Species -> GLB base map

Added `seal`, `sealion`, `orca` to `SPECIES_BASE_MAP`, all pointing at the
existing `dolphin` base (`assets/models/dolphin.glb`, mesh node `Dolphin`) --
no seal/sea-lion/orca-specific GLB is shipped, so this reuses the closest
existing rigged marine-mammal silhouette, exactly like `ray` already reuses
`manta` and `leviathanprey`/`abyssal` reuse a shared cetacean base.

Per-species identity comes from the existing tint + non-uniform-scale
mechanism (`FISH_PALETTE_TABLE` + `SPECIES_ASSET_SCALE`), unchanged in kind
from every other asset-backed species:

- `seal` / `sealion`: tan/brown palette (`base 0x8a6a3f`/`0x7a5a30`, `belly
  0xe8d6a8`/`0xdfc696`, `accent 0xc99a52`/`0xb8863f`), plumper proportions
  per spec -- `SPECIES_ASSET_SCALE` `{x:0.8, y:1.25, z:1.0}` for both
  (shorter nose-to-tail, taller/rounder body).
- `orca`: black/white palette (`base 0x0c0e11` black, `belly 0xf4f6f8`
  near-white standing in for the saddle patches -- this loft's palette has
  no dedicated third slot, `accent 0x3ce4ff` cool highlight). Spec asked for
  "a taller dorsal via bone/region scale if the rest-pose bake supports it,
  else scale": the dolphin/whale rig's only joints are
  Root/Spine1-4/Tail/TopFlipper/MidFlipper/BottomFlipper/Head (verified by
  parsing `dolphin.glb`'s node list) -- there is no separate dorsal-fin bone
  or vertex region to isolate, so this used the spec's explicit fallback: a
  whole-body y scale bump (`{x:1.1, y:1.35, z:1.0}`), tuned modest enough
  that orca still reads as its own species rather than "a bigger dolphin."

### `ray` -> manta / whale-class -> whale.glb

Confirmed `ray` already mapped to the `manta` base (pre-existing, untouched
this pass). Per the task brief, split the previous "whale-class -> dolphin"
mapping onto a dedicated base: added a new `whale` GLB base
(`assets/models/whale.glb`, mesh node `Whale`, same rig shape as
`dolphin.glb` -- confirmed by parsing both GLBs' node lists) to
`GLB_BASE_FILES`/`GLB_MESH_NODE`, and moved `leviathanprey`/`abyssal` in
`SPECIES_BASE_MAP` from `dolphin` to `whale`. Their existing
`SPECIES_ASSET_SCALE`/palette entries were left as-is (species identity
logic doesn't care which base geometry it's blended onto). This also frees
`dolphin` to be the shared base for the three new pinniped/orca specials
without every whale-class and pinniped-class prey rendering off the same
mesh.

### Contract items kept unchanged

- Instanced-bend contract: `FISH_BEND_UNIFORM_DEFAULTS`/`FISH_BEND_SUFFIX`
  untouched; new species go through the same `buildFishMaterialSpec()` path
  as every other def (one draw, one bend path).
- `TRIANGLE_LIMIT` (800): unchanged; new species reuse the dolphin base's
  existing triangle count (already under the limit for every other
  dolphin-mapped def), so no new asset risks the cap.
- `preloadFish()`: unchanged signature/contract; `whale` was added to
  `GLB_BASE_FILES` so it is preloaded automatically alongside the other five
  bases (no per-base special-casing needed).
- Placeholder path (`buildPlaceholderGeometry()` delegating to the Rev 6-8
  procedural loft before a base is parsed): unchanged; seal/sealion/orca get
  the same placeholder-then-real-bake swap as every other asset-backed
  species (verified by the selftest's placeholder-contract block, which
  targets `tuna`/`fish_tuna` unchanged, plus the new explicit seal/sealion/
  orca asset-backed check described below).

## Selftest changes (`__selftestFish()`)

- Palette-id-count assertions bumped from 16 -> 19 (roster grew by
  seal/sealion/orca).
- Species-base-map-coverage assertion bumped from 16 -> 19 ids covered.
- GLB-base-count assertion bumped from 5 -> 6 (`whale` added).
- Added an explicit block asserting `seal`/`sealion`/`orca` each: exist in
  `RFD.CREATURES`, build non-null geometry via `buildFish()`, are NOT served
  as a placeholder (`placeholder !== true`), are asset-sourced
  (`rfLoft.source === 'asset'`), and are baked from the `dolphin` base --
  i.e. no more egg-blob fallback loft for these three ids once the shared
  base is loaded.
- Doc comments (module header, `SPECIES_BASE_MAP` comment, and the
  `result.notes` summary string) updated from "16 prey defs / 5 bases" to
  "19 prey defs / 6 bases" language, and to describe the whale.glb split.

## Validation

```
node --import ./tools/reg.mjs tools/selftest.mjs fish world
```

```
fish:  pass=true ok=8 fail=0
world: pass=false ok=378 fail=1
  FAIL formation: aspect ratio after 5.0s reads as a line/V, not a blob (1.79 > 2.0)
```

`fish` passes clean. The one `world` failure is a flocking/formation
geometry assertion inside world3d.js, unrelated to fish species->base
mapping, triangle counts, or anything this lane touched -- per this task's
own instructions, the world lane may be editing concurrently, and a build/
selftest issue there is out of this lane's ownership. Not investigated or
fixed here.

A render check via the scratchpad harness was skipped (optional per the
task, and the world lane's concurrent edits make a shared-page render check
unreliable right now) -- relied on the fish selftest instead, per the task's
own fallback instruction.

## Files touched

- `fish3d.js`: `SPECIES_BASE_MAP`, `GLB_BASE_FILES`, `GLB_MESH_NODE`,
  `FISH_PALETTE_TABLE`, `SPECIES_ASSET_SCALE`, `__selftestFish()`, and
  doc-comment updates only. No other tables/functions/contracts touched.
