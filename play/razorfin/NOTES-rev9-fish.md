# Rev 9 fish lane (fish3d.js) — SPEC3D 9.3, BINDING

## What changed

`fish3d.js` no longer generates 12 of 16 prey shapes procedurally. It now
extracts REST-POSE geometry (skin dropped) from 5 Quaternius GLB bases in
`assets/models/` and bakes it into a plain `THREE.BufferGeometry`, per the
same contract `buildFish(def)` always had: `{geometry, palette}`, cached by
def id, palette carrying `base/belly/accent` `THREE.Color` + `valueBoost`.

4 defs (`turtle`, `swordfish`, `squidling`, `giantsquid`) have no matching
GLB asset (no turtle/billfish/squid model shipped) and keep the Rev 6-8
procedural loft (`buildProceduralGeometry`, unchanged body). Everything else
routes through `buildAssetGeometry`.

## Species -> base map (SPEC3D 9.3: "16 prey defs -> 5 bases x tints/scale")

| Base GLB | Species |
|---|---|
| `fish_tuna.glb` | minnow, mackerel, tuna, marlin |
| `fish_blue.glb` | reeffish, parrot, dolphinfish |
| `fish_clown.glb` | anglerprey, grouper (recolored dark/murky, not clownfish orange) |
| `manta.glb` | ray |
| `dolphin.glb` | leviathanprey, abyssal (whale-class scale — see `SPECIES_ASSET_SCALE`) |
| *(procedural, no asset)* | turtle, swordfish, squidling, giantsquid |

`SPECIES_BASE_MAP` + `PROCEDURAL_FALLBACK_IDS` together cover all 16
`FISH_PALETTE_TABLE` ids exactly once; the selftest asserts this
partition and that exactly 5 distinct bases are used.

## GLB parsing (no fetch in selftest, no GLTFLoader dependency)

`fish3d.js` parses the GLB container itself:
- `parseGLB(arrayBuffer)` — 12-byte header + JSON chunk (`'JSON'`) + BIN
  chunk (`'BIN\0'`), per the [glTF 2.0 binary spec](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#binary-gltf-layout).
- `readAccessorFloat` / `readAccessorIndices` — decode an accessor via its
  bufferView, honoring `byteStride`/`byteOffset`, componentType (float,
  uint8/16/32, normalized int8/16), and type (SCALAR/VEC2/VEC3/VEC4).
- `parseBaseFromGLB(arrayBuffer, baseName)` — merges all primitives of the
  base's skinned mesh into one set of arrays: POSITION (rest pose — a
  skinned GLTF's accessor position IS the bind pose; skinning is applied at
  runtime via JOINTS_0/WEIGHTS_0, which this lane never reads), NORMAL, and
  a per-vertex color baked from each primitive's material
  `pbrMetallicRoughness.baseColorFactor` (these assets are flat-shaded, no
  textures, so the material color IS the surface color per material slot
  — e.g. Top/Bottom/Fins/Body/Stripes).

Loading path: `typeof fetch === 'function'` picks the browser path
(`fetch(url).then(r => r.arrayBuffer())`); otherwise it falls back to
`process.getBuiltinModule('node:fs').readFileSync(...)` relative to
`import.meta.url`. `process.getBuiltinModule` (Node 20.16+) resolves a core
module synchronously without a `node:fs`/`node:path`/`node:url` import
statement anywhere in this file, so the module still parses cleanly if a
browser bundler ever sees it — there is no node-specifier import to trip on.

## Mesh-node local transform / axis remap

Each base's skinned mesh sits on its own named node (`Fish`, `Fish2`,
`ClownFish`, `MantaRay`, `Dolphin` — see `GLB_MESH_NODE`) with its own local
TRS (scale 100, a -90° X rotation, and a translation), separate from the
`Armature` skeleton root. `parseBaseFromGLB` bakes that node's scale +
quaternion rotation + translation into every rest-pose position/normal
(this is exactly the transform Three's `SkinnedMesh` would apply as
`mesh.matrixWorld` before the skin matrix — dropping skin, this lane still
needs the mesh node's own placement).

Verified via the bone chain (Face/Head node vs Tail_end node world
position, computed from the full parent-transform chain) that all 5 bases
are authored nose-forward toward **local +Z**, tail toward **local -Z**, in
that same local space. The rest of this lane (and world3d's instancing,
`rfNoseDirection: '+x'`) assumes nose toward +X, so the remap is:

```
X_new = Z_local   (nose axis)
Y_new = Y_local   (up, unchanged)
Z_new = X_local   (left/right)
```

applied identically to both positions and normals (normals additionally
get `Math.sign(scale[axis])` applied before the rotation, in case a base
ever ships a negative/mirrored scale on an axis — none currently do).

## Per-species scale and tint

`SPECIES_ASSET_SCALE[def.id]` gives bounded non-uniform `{x,y,z}` scale
factors (0.72–1.55 authored, clamped 0.5–2.4 after the tier boost) applied
on top of the shared base mesh — this is how one `fish_tuna.glb` produces
visually distinct minnow/mackerel/tuna/marlin silhouettes, and how
leviathanprey/abyssal push `dolphin.glb` into "whale-class" scale per
SPEC3D 9.3. Tier (0–10, from `def.tier`) adds a further `1 + tier*0.045`
multiplier, same spirit as the old procedural loft's tier-driven sizing.

Per-vertex color: `bodyColor(palette, dorsalness, sideBias)` (unchanged
from Rev 6-8) computes the species palette color for a vertex's
dorsal/ventral position (now derived from the vertex's y-position relative
to the base's own bounding height, instead of a ring's `cos(theta)`), then
`materialColor.lerp(speciesColor, 0.62)` blends it with the GLB's own
baked material-slot color — so a base's own Top/Bottom/Fins/Stripes shading
language still reads (e.g. clownfish `Stripes` material) while the species
palette (`FISH_PALETTE_TABLE`, hue family + belly/accent contrast, Rev 6.9
saturation pass) still dominates enough to keep every prey id visually
distinct (the selftest's "not indistinguishable from the previous loft"
color-delta gate still runs across all 16, asset and procedural alike).

## Triangle budget

`TRIANGLE_LIMIT` raised from 350 to **800** (asset bakes run
264–696 triangles; the task's target band was 450–700 for asset-based
species, procedural-fallback species stay in their old 264–696 range).
Every geometry — asset or procedural — still throws and disposes if it
exceeds the limit, same as before.

## `preloadFish()` / synchronous `buildFish()`

`RF.Art3D.preloadFish()` returns a `Promise` that resolves once all 5 GLB
bases (only the ones actually referenced by `SPECIES_BASE_MAP`, so no dead
manta/dolphin fetch if a future roster drops ray) have been fetched and
parsed into `parsedBaseCache`. `buildFish(def)` stays fully synchronous —
unchanged call signature/contract for `world3d.js` — and reads from that
cache:

- Base already parsed -> real asset bake (`buildAssetGeometry`), cached
  permanently under the def's id.
- Base not parsed yet (before `preloadFish()` resolves, or its fetch/read
  failed) -> a placeholder. The placeholder delegates to the same
  `buildProceduralGeometry` the 4 no-asset species already use, so a
  gameplay frame that runs before assets land still gets a real,
  eye-having, closed-fin-wedge, nose-toward-+x mesh — never null, never a
  degenerate stub. The placeholder record is flagged
  (`{geometry, palette, placeholder: true}`) and is **not** treated as the
  permanent cache entry: the next `buildFish(def)` call for that id, once
  its base has landed, rebuilds and replaces it with the real asset bake.

Browser call site (world3d.js does not own an await today — see
`NOTES-rev9-fish-world3d.md` for the one-line snippet a future patch would
need to add there to avoid the placeholder frame at boot).

## Selftest (`node --import ./tools/reg.mjs tools/selftest.mjs fish`)

`__selftestFish()` is synchronous (Node's `process.getBuiltinModule` sync
read means it never needs to be async, and `tools/selftest.mjs`'s runner
does `res = globalThis.RF.Art3D.__selftestFish()` without an `await`, so
keeping it sync avoids editing that shared file). New/changed gates beyond
the Rev 6-8 set:

- Species base map partition: all 16 ids covered exactly once by
  `SPECIES_BASE_MAP` ∪ `PROCEDURAL_FALLBACK_IDS`, exactly 5 distinct bases
  used, every used base has a registered GLB file.
- Loads all 5 bases synchronously off disk before exercising `buildFish`
  (so the gates assert against the real asset bake, not the placeholder),
  and asserts each parsed successfully.
- For every def: not a placeholder once its base is loaded; for
  asset-backed defs, `geometry.userData.rfFishBase` matches the species
  base map; for the 4 procedural-fallback defs, still checks the Rev 6-8
  proud-eye-pair / closed-fin-wedge gates verbatim.
- Placeholder contract round-trip: unloads `fish_tuna`'s parsed base,
  confirms `buildFish({id:'tuna', ...})` still returns a non-null geometry
  flagged `placeholder: true`, restores the base, confirms the next
  `buildFish` call recovers the real (non-placeholder) bake.
- All prior gates unchanged: cache identity, unknown-id null fallback +
  no cache pollution, `:rf-bend-inst2` material spec / uniform defaults,
  panic-amplitude sanity, and the score-ordered `valueBoost` monotonic
  chain (5..420).

`node --import ./tools/reg.mjs tools/selftest.mjs fish world` — both pass;
`world` needed no changes (it already calls `RF.Art3D.buildFish(def)`
synchronously and degrades gracefully when `RF.Art3D` is absent, which is
exactly the same shape `buildFish` still presents).

## Files touched

- `fish3d.js` — rewritten per above. Owned by this lane.
- `NOTES-rev9-fish.md` — this file.
- `NOTES-rev9-fish-world3d.md` — patch-notes only (world3d.js itself is
  NOT edited by this lane; the file documents the exact snippet another
  lane would apply for a preload-await at boot).
