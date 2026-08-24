# Razorfin Rev 9b — sharky face lane

Date: 2026-08-24

## Base map

`sharky.glb` is the primary base for the full roster. It is the Quaternius
cartoon rig with two skinned meshes using one `AtlasMaterial`; its baked atlas
keeps the large eye and toothy grin visible at the gameplay camera.

| Definition family | Base | Treatment |
| --- | --- | --- |
| default / point / blunt | `sharky.glb` | atlas recolor + authored pattern |
| `id: goblin` | `goblinshark.glb` | fish-family swim/fast/attack mapping + one-draw grin overlay |
| `head: angler` | `anglerfish.glb` | fish-family swim/fast/attack mapping; named eye/teeth slots stay clean |
| future `head: piranha` | `piranha.glb` | fish-family swim/fast/attack mapping; named eye/teeth slots stay clean |
| whale / kaiju | `sharky.glb` | bulky length/girth scale; `whale.glb` was rejected because its face is too plain |
| hammer / saw / rock / croc / eel / void / skull / mech | `sharky.glb` | one fitted Head/Center prop where useful, otherwise pattern identity |

All 85 current rows are covered by this table. `whale.glb`, the legacy shark
family, the fish bundle, and `hammer_chibi.glb` remain in the idempotent preload
cache for the art lane and future comparisons; no legacy base is selected by
the current resolver.

## Atlas shader and face mask

The browser path preserves the original atlas `map` on both sharky meshes. Each
definition receives its own `MeshToonMaterial` with `material.color` set to the
resolved palette base. The `onBeforeCompile` fragment hook then applies the
vivid `uRfHueShift` and `uRfSaturation` transform, restores value range after
the atlas multiply, and layers bind-pose-position patterns. The cache key ends
in `:rf-skin2`.

The atlas has no named eye/teeth materials. Its white/luminance regions are
therefore detected in the fragment shader from the original `map` sample and
are excluded from tint and pattern. Fish-family assets use the stronger named
slot rule: material names matching `Eyes`, `Teeth`, `Tooth`, or `Mouth` receive
their source color and `uRfTintMask = 0`. The node selftest parses the image
chunk but intentionally does not decode it.

## Animation contract

`animate(t, state)` reads the existing engine bag (`speedFrac`, `turn`,
`bitePhase`, `jawSnapT`, `lungeT`, `jawOpen`/`biting`, and death flags) without
retaining the bag. Sharky maps `Swim` to cruise, `Swim_Fast` above `0.65`, and
`Swim_Bite` as a one-shot. Goblin/angler/piranha map
`Swimming_Normal`/`Swimming_Fast`/`Attack` the same way. Mixer time scale is a
function of `speedFrac`; head/neck lean into turn, `LowerJaw` gets extra
procedural gape during jaw-open/bite state, and death is a procedural roll.

Identity props mount to `Head`/`Center` on sharky. Fish-family face props use
the family head bone (`Main1`) and are fitted against the posed body so they do
not dominate the face. The goblin grin is one mesh with two material groups,
so it remains one draw.

## Geometry, draw, and preload gates

- `buildShark(def)` remains synchronous and swaps a placeholder when the browser
  cache is not ready.
- `preload()` parses/loads all 14 staged GLBs and is idempotent.
- Sharky keeps its two artist meshes; non-sharky fish may add one contour shell
  and one prop. Visible mesh count is capped at three.
- World scale is measured after the initial posed animation and enforces
  `bbox.max.x - bbox.min.x = 96 * sil.len` before the engine's consumer scale.
- `rfArcs`, `rfFlash`, the existing `parts.body`/`parts.jaw === null` contract,
  skeleton-aware cloning, and billboard compatibility remain intact.

## Audit

Measured loop:

```text
OUT=shots9b IDS='reef,tiger,hammerhead,greatwhite,whaleshark,goblin,leviathanrex,zeusfin,medusagaze,typhonmaw' node sharkline.js
```

Reviewed the requested gameplay frames plus follow-up goblin/angler/hammer
frames. The sharky rows read as one cartoon animal with a large eye and grin;
the goblin fallback overlay restores the missing teeth read; angler keeps the
asset's lure and teeth without an oversized prop; hammer keeps a fitted foil
prop rather than replacing the cartoon face.

Verification:

```text
node --check shark3d.js
node --import ./tools/reg.mjs tools/selftest.mjs world game art3d fish fx ui meta abilities
```

Both pass. No git commit or deploy was made.
