# Rev 15 — goblin / gulperfiend render fix

Lane owns `shark3d.js` only. No other file was edited.

Rows: `goblin` (base `goblinshark`), `gulperfiend` (base `anglerfish`) — both
Quaternius low-poly GLBs in `assets/models/`.

## The brief's premise was wrong

The task assumed these rows fail because their bases are outside
`TEXTURED_KEYS`, so the demand-load gate refuses them and a placeholder is
served at the wrong scale. That is not what happens.

`goblinshark` and `anglerfish` are members of `BASE_KEYS` — the eagerly loaded,
never-evicted boot set — precisely BECAUSE they are not in `TEXTURED_KEYS`.
`requestTemplate()`'s textured gate (`mayLoadTextured()`) never applies to them.
They load fine, every time, and the shooter's `report.json` confirms it:
`base=goblinshark` / `base=anglerfish`, no errors, no placeholder.

The real bug is a **browser-vs-Node divergence in `prepareTemplate()`**, which
is also why it survived every selftest.

## Root cause: multi-primitive glTF meshes

These assets author ONE glTF mesh carrying several primitives (one per
material), all bound to the same skin:

```
goblinshark  1 mesh, 1 skin, 4 prims  -> Eyes / Dark / Main / Light
anglerfish   1 mesh, 1 skin, 6 prims  -> Teeth / Fins / Main / Light / Eyes / Anglerfish_Light
```

* `GLTFLoader` (browser) expands that into N sibling `SkinnedMesh` objects,
  named `GoblinShark_1 .. _4`.
* `parsedGeometry()` (the headless Node decoder in this file) merges the
  primitives into a SINGLE geometry with material groups and a per-vertex
  `rfSlot` attribute.

Everything downstream treats `skinnedMeshes[0]` as THE body — the length
normalization measures it, the face overlay is fitted to it, and the r15-doc
shooter frames its camera on `rig.parts.body`. Under the browser's split, that
"body" is whichever primitive happens to come first. On `goblinshark` that is a
fin:

```
rig.parts.body box   19.7 x 21.2 x 64.5     <- one fin
true group box      113.3 x 73.5 x 102.3     <- the actual shark
```

The shooter solved its camera distance from that fin's 19.7 span (`dist=35.5`
instead of ~204) and put the camera **inside the mesh**. That is the flat
untextured blob filling the frame in the original
`shark_goblin.png` / `shark_gulperfiend.png` — not a placeholder, and not a
scale bug: a correctly scaled shark shot from within its own body.

The group-level bbox gate at the old line 3471 passed throughout, because the
GROUP was always the right size. Only the per-mesh split was wrong, and Node —
where the selftests run — never sees the split.

## Fix (all in `shark3d.js`)

1. **`mergePrimitiveSiblings(scene, key)`**, run at the top of
   `prepareTemplate()`. Collapses sibling `SkinnedMesh`es that share a parent
   and a skeleton into one multi-material `SkinnedMesh`, with geometry groups
   per source material and `rfSlot` = source material index — i.e. it makes the
   browser produce exactly the shape the Node path already produced. Each
   primitive's own node matrix is baked into its geometry before merging, and a
   missing `uv` is filled so `mergeGeometries()` accepts the set. Sets
   `scene.userData.rfMergedPrimitives`.

   Single-primitive rigs (`sharky`, and every `shark_bake.py` textured bake) are
   untouched — verified `merged:false` for `sharky`.

2. **Dorsal roll law** now also runs the measured-asymmetry detector for merged
   rigs, not only `TEXTURED_KEYS`. Before the merge these rigs only ever showed
   this code one primitive, so the crude span test in the `else` branch was
   accidentally harmless; with the true hull in hand it guesses wrong — goblin
   came back dorsal-down, gulperfiend dorsal-on-z (i.e. shot from overhead).

3. **Geometric nose flip** for rigs with no `Head`/`Nose`/`Tail*` bones. The
   Quaternius rigs name their whole spine `Main1..Main6`, so the existing
   bone-based nose check never fired for them. Scoped by an explicit
   `NOSE_FLIP_KEYS = {goblinshark, anglerfish}` set so no other rig changes
   behaviour.

   Uses a GIRTH profile, not vertex count. Vertex count was tried first and is a
   trap on these assets: the goblin's head carries the eyes and the tooth row
   and so holds far more vertices than its long smooth body (549 in the head bin
   against 116 at the snout), which ordered the ends backwards. Polygon density
   measures how detailed an end is, not how thick it is.

   `goblinshark` is a near-tie even on girth (0.305 vs 0.293) and a tie is not a
   signal, so its flip is pinned by the render rather than by the margin;
   `anglerfish` separates cleanly (0.329 vs 0.489) and is left to the
   measurement. This is documented at the call site.

## Result

Both rows now render their actual low-poly GLB: whole model, correct scale
(measured length exactly on target — goblin 113.28 = 96 x 1.18, gulperfiend
144 = 96 x 1.5), lit `MeshStandard` with the model's own material colours, no
toon outline, dorsal up, eye / jaw / teeth / fins all reading. gulperfiend keeps
`anglerfish`, which the brief names as the intended look — lure stalk, tooth
row and bulbous body all present.

`rig.parts.body` box now equals the group box for both, so any consumer that
frames on `parts.body` gets the real shark.

## Caveat for the orchestrator

Nose-left vs nose-right **in the shot** is decided by `profileview.html`'s own
flank-sign choice, not by `shark3d.js`. goblin frames nose-left while the
textured rows frame nose-right. The rig's world orientation is correct
(nose at +x, dorsal up); if a consistent facing across the contact sheet is
wanted, that is a one-line sign change in the shooter's `off[flank] = dist`,
which is another lane's file and was NOT touched here.

## Verification

* `hse/evidence/r15-doc/shoot.mjs` re-shot both rows; `report.json` shows
  `base=goblinshark` / `base=anglerfish`, sizes `[113.28, 72.91, 101.78]` and
  `[144, 119.47, 111.36]`.
* `node tools/selftest.mjs art3d world game` — `art3d` and `game` green.
  `world` shows one failure, `formation: aspect ratio ... (1.93 > 2.0)`, which
  is a flaky school-formation check: it reproduces identically on the
  unmodified baseline and is unrelated to this file.
* `node tools/selftest.mjs art3d fish fx ui meta abilities` — all green.
