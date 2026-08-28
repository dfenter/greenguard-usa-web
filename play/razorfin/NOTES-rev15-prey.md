# Rev 15 — lane PREY (fish3d.js) — lit prey material + the two latent bugs it exposed

Owned files touched: `fish3d.js` only.
Evidence: `hse/evidence/r15-prey/` (before/after school + closeup, diagnostics).
Harness/probes added (not owned code, tooling): `hse/school_harness.html`,
`hse/probe_school_shot.mjs`, `hse/measure_prey.mjs`, `hse/diag_prey.mjs`,
`hse/diag_normals.mjs`, `hse/probe_prey_school.mjs`.

## What changed

1. **Prey are now LIT.** `buildFish()` returns a `material` on its record.
   `world3d.fishBuildSource()` already prefers a material carried on the build
   record over its own `MeshToonMaterial` fallback, so this switches the whole
   roster to `MeshStandardMaterial` **with no edit outside fish3d.js**.
   - roughness 0.38, metalness 0.06, vertexColors, DoubleSide, no outline shell.
   - Cache key suffix `:rf-prey-lit`, so Three cannot alias it with the shark
     or solid-bend programs. world3d then appends `:rf-bend-inst2` on its clone.
   - One shared source material for the roster; world3d clones per def, so the
     draw budget is still **one InstancedMesh (one draw) per def**.

2. **Belly flash / rim / eye catch-light**, via `onBeforeCompile` on fragment
   chunks only (never `<begin_vertex>`), so world3d's bend injection still
   finds its anchors and chains cleanly after ours.
   - **Every uniform is DECLARED**, not merely assigned — see the landmine note
     in the source. A previous rev shipped assignments without declarations;
     the GLSL failed to compile and the fish silently vanished. No selftest
     catches that because no selftest compiles GLSL. `hse/probe_school_shot.mjs`
     renders a real school in a real WebGL context and reports
     `renderer.debug.onShaderError`, so a missing declaration now fails loudly.

3. **Vertex-colour art pass** (`appetizingBase` / `appetizingBelly` /
   `bodyColor`): saturated dark dorsal, warm cream belly, shaped (not linear)
   countershade ramp, and a hue-escape that pushes cool prey off the water's
   own hue so open-water fusiforms stop being camouflaged by construction.

4. **Eye dot with catch-light**, baked into existing head vertices — **zero
   added triangles**. Carried by a new `rfPreyShade` vec2 attribute
   (x = dorsalness, y = eye mask), 8 bytes/vertex, no extra draw, no texture.

## Two latent bugs this pass uncovered (both fixed here, both in fish3d.js)

- **GLB normals were inverted on every asset-backed prey.** The axis remap
  `(x,y,z) -> (z,y,x)` is a *reflection* (determinant -1); positions were
  reflected but normals were shuffled the same way and never negated, so all
  1130 verts of a tuna had normals pointing INTO the body. Measured with
  `hse/diag_normals.mjs`: `normal · faceNormal = -1.00` for 1130/1130 before,
  0 flipped after. **Invisible for six revs** because prey were unlit — an
  unlit material never reads the normal. It surfaced the instant prey became
  lit, as a tar-black band down every fish's back.
- **Non-uniform scale was not applied to normals.** `SPECIES_ASSET_SCALE`
  scales positions per axis; normals need the inverse-transpose (1/s per axis,
  renormalised). Same reason it was never noticed.

## Measured result (rendered pixels, `hse/measure_prey.mjs`)

| | before (toon) | after (lit) |
|---|---|---|
| internal luminance range (countershade) | 60.2 | **118.0** |
| mean luminance vs water | 93.5 | 47.9 |
| draws | 7 | **7** |
| triangles | 34416 | **34416** |
| shader compile errors | 0 | **0** |

Internal contrast roughly doubles — that is the countershade the reference has
and the old flat prey did not. Mean-vs-water falls because the dorsal is now
genuinely dark, which is also what the reference does; the fish read as lit
objects rather than as uniformly bright stickers.

## Known remaining nit (NOT fixed — outside this lane)

Two small pale patches at the pectoral/dorsal fin roots on the tuna-base
species. Confirmed **not** vertex colour and **not** our shader: they persist
with a plain `MeshStandardMaterial` and no `onBeforeCompile` at all
(`hse/evidence/r15-prey/diag-plain.png`), and do not appear in the shade-mask
dump (`diag-shade.png`). They are thin overlapping fin sheets in the Quaternius
base geometry catching the key light through `DoubleSide`. Fixing it means
editing the GLB or the fin topology, which this lane does not own. Barely
visible at gameplay scale.

## Hook for the orchestrator

**Nothing to hook.** The material switch is picked up by the existing
`fishBuildSource()` preference for `build.material`; no world3d edit is needed
or was made. If a future lane wants to drive flash/rim strength per zone, the
uniforms are `uPreyFlash`, `uPreyRim`, `uPreyRimColor`, `uPreyFlashColor`, and
`Art3D.buildFishMaterial()` is exported.

**Caveat at time of writing:** `world3d.js` is mid-edit by another lane and
currently throws `GARDEN_FLOOR_DROP is not defined`, which reds the world
selftest. That is not this lane — `fish3d.js` contains no reference to that
symbol. With world3d in a good state, selftests were green at
**world 379/0, game 386/0** with this lane's changes in place.
