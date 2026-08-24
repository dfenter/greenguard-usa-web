# Rev 9 shark rewrite

`shark3d.js` now uses the shipped artist-made GLBs under
`assets/models/`. `shark.glb` is the default 8-bone shark with the
`Armature|Swim` clip; `whale.glb` is selected for `head: whale` and
`head: kaiju`; all other current shark rows use `shark.glb`. The cache also
parses the remaining bundle models during preload so the art lane owns one
complete asset preload. `shark_b.glb` remains available as the static alternate
family but is not selected by the current 85-row table.

The body is a single merged skinned draw. The original Top/Bottom material
slots are carried as `rfSlot` vertex data and recolored in the `:rf-skin1`
fragment hook. The pattern is computed from bind-pose `position`, with declared
uniforms for slot colors, pattern id/scale/contrast/seed/mix. A shared-skeleton
BackSide shell and at most one head-bone prop keep each loaded shark at no more
than three visible mesh draws. The asset owns the eyes and mouth; `parts.jaw`
is intentionally `null`.

`buildShark()` is synchronous. Browser builds made before parsing completes get
a small placeholder group; the same group swaps to the cached rig when
`preload()` resolves. Node selftest uses a synchronous JSON+BIN GLB parser, so
it does not need `fetch` or `FileReader`.

## Engine boot hook

The current engine can use the placeholder swap without an engine edit. If the
boot lane elects to wait for the real assets before showing the menu, the exact
hook is:

```js
if (RF.Art3D && typeof RF.Art3D.preload === 'function') {
  await RF.Art3D.preload();
}
```

Place it in the async boot boundary immediately before `showMenu`/starting the
menu scene. `preload()` is idempotent.

## Verification

- `node --import ./tools/reg.mjs tools/selftest.mjs art3d`
- GLB source licenses: Quaternius Animated Fish Bundle, CC0 1.0; `shark_b.glb`
  is Poly by Google, CC-BY 3.0. See `LICENSES.md`.
