# Lane S5 (fx3d.js) — Rev 7 notes

Scope: fx3d.js only, per SPEC3D Rev 7 (7.3, 7.6, 7.7) and plan D3/D5.

## 1. pulseChroma: DOM -> pooled GL overlay (7.3)

- Deleted the entire `chromaEls`/`ensureChromaticPulse`/`removeChromaticPulse`
  DOM path (three `div`s created via `document.createElement`, styled and
  faded per eat via `requestAnimationFrame`).
- Replaced with a single pooled fullscreen GL overlay: one oversized
  triangle (`CHROMA_VERT`/`CHROMA_FRAG`), vertex shader bypasses camera/model
  matrices entirely (`gl_Position = vec4(aCorner, 0, 1)`), so it always
  covers the viewport regardless of camera fov/pulse/shake. Additive
  blending, `depthTest`/`depthWrite` off, `renderOrder = 9999` so it
  composites last. Built once in `init()` (`buildChromaOverlay`), disposed in
  `teardown()` (`removeChromaOverlay`).
- Opacity is driven every frame inside the existing `update(dt)` loop by
  decaying `chromaLife` (same `delta`-clamped-to-50ms discipline as every
  other pool), quadratic ease-out to approximate the old CSS
  `opacity 180ms ease-out` fade. **Zero per-eat DOM writes, zero per-eat
  closures/allocations, zero `requestAnimationFrame` calls.**
- The red/blue channel-split look from the old 3-div stack is reproduced in
  ONE fragment shader pass: the fragment shader samples the radial falloff
  three times at small pixel offsets along the radial direction and tints
  each sample red/blue/center, so the whole channel-split renders as a
  single draw call.
- `uResolution` is synced once per `render(ctx, dt)` call from
  `ctx.renderer.getSize(...)` (writes into the existing Vector2 uniform in
  place — no allocation) with a `window.innerWidth/Height` fallback for
  contexts without a renderer handle.
- **Fog law**: `THREE.ShaderMaterial.fog` defaults to `false` and is never
  set `true` on the chroma material (same as every other additive pool's
  `makePointMaterial` in this file), so the overlay is automatically
  fog-exempt — no explicit fog wiring needed or added.

### API signature (deviation flagged for review)
Public signature is now `pulseChroma(color, strength)` instead of the old
`pulseChroma(strength)`. Backward compatibility is preserved via
`arguments.length`: a call with exactly one argument is treated as the
legacy `strength` value (default magenta-split tint, matching the original
visual exactly); a call with two-plus arguments is `(tint, strength)`.
`eatShockwave` was updated to call `pulseChroma(preyTint, opts.chroma ?? 0.85)`
so the flash now tints to the prey's color instead of the old fixed magenta.
**pulseChroma itself is NOT in the module's public return object** (it never
was, even before this change) — it's only reachable from `eatShockwave`
internally. If any other lane call site needs to call `pulseChroma` directly
in the future, it needs to be added to the `return { ... }` block.

### index.html cleanup needed (orchestrator, NOT done here — file ownership)
`fx3d.js` may not edit `index.html`. If `index.html` still contains the old
`rf-chroma-pulse` / `rf-chroma-pulse-r` / `rf-chroma-pulse-b` overlay divs
and/or their CSS, they are now dead:
- `init()` runs a **one-time** `hideLegacyChromaDom()` that
  `document.querySelectorAll('.rf-chroma-pulse')` (and the `-r`/`-b`
  variants) and sets `style.display = 'none'` on any matches — this is the
  "acceptable one-time DOM work" the task spec allows, and it only runs once
  per `init()`, never per-eat.
- The orchestrator should delete those div(s) and their CSS rules from
  `index.html` directly; `hideLegacyChromaDom` can then be removed from
  fx3d.js as a follow-up (it will simply no-op via `querySelectorAll`
  returning an empty list if the markup is gone, so it is safe to leave in
  the meantime).

## 2. eatShockwave: tint parameter (7.6 tint plumbing)

- `eatShockwave(x, y, opts)` already accepted `opts.tint` before this change
  (used for the ring bursts and gib burst); that part was NOT broken, so no
  signature change was needed there — engine's `swallow()` passing
  `e.def.tint` already flows straight through to
  `emit('ring', ..., { tint: preyTint, ... })` and
  `emit('gib', ..., { tint: preyTint, ... })`.
- What changed: `pulseChroma` now ALSO receives `preyTint` (see above), so
  the whole eat-shockwave "moment" (rings + gibs + chroma flash) is
  consistently tinted to the prey's color, killing the old fixed-magenta
  chroma flash that didn't match the burst.
- Backward compatible default: `opts.tint == null` still falls back to
  `0x27e0ff` (unchanged).

## 3. New pooled FX: gemPickup + relicFound (7.6 economy FX)

Both follow the existing pool discipline exactly: added to `POOL_NAMES` and
`POOL_CONFIG`, get a slot in `buildPool`'s generic item struct, dedicated
`activate()` branches (modes 12/13), dedicated emit helpers
(`emitGemPickup`/`emitRelicFound`) mirroring the existing
`emitBreach`/`emitGoldPulse` pattern, `poolFor()` routing, and motion/decay
handling added to the shared `update()` loop. **Zero allocation at emit
time** — `acquire()`/`activate()` reuse pre-allocated pool items exactly like
every other pool.

- **`gemPickup`** (size 8, life 480ms, mode 12): small cyan/purple sparkle
  burst. `emit('gemPickup', x, y, { tint, tint2 })` acquires up to 7 items
  (capped `count`, default 6); most are quick outward round sparkles
  (positive gravity, slight sink), every 4th item (`ordinal % 4 === 3`) is a
  slower **rising glint** (negative gravity `-70`, larger scale, tint mixed
  toward white or `opts.tint2`) — this is the "rising glint" called for in
  the task. Plays a light `coin` SFX ping on emit.
- **`relicFound`** (size 8, life 900ms, mode 13): bigger golden ring bloom +
  rising motes — the "bigger moment". `emit('relicFound', x, y, opts)`
  always emits one `activateRelicRing` item (expanding/fading ring, same
  `ringRadius` treatment as the existing breach/eat-shockwave rings, default
  tint `GOLD`) plus up to 6 slow-rising motes (negative gravity `-34`,
  capped `count`, default 6). Plays a deeper/slower `coin` SFX cue.
- Both pools are small by design per the task's "modestly sized" guidance
  (gemPickup ~8 slots covers one full burst with headroom; relicFound ~8
  slots covers ring + motes for roughly 2 concurrent relic-find moments) —
  a same-frame extra pickup simply recycles the oldest live item via the
  standard ring-buffer `acquire()`, same as every other pool under pressure.
- `FX_DRAW_CALLS` updated: 14 total (12 GPU point-pools including the two
  new ones, `goldpulse` still contributing 0 as DOM-only, plus the new
  chroma overlay quad contributing exactly 1).

## 4. Selftest updates (fx target)

Added to `fx3d.js`'s `selftest()` (same style as existing blocks — inline
`pass = false` assertions plus `notes.push(...)` summaries, no new test
file):
- **Chroma GL path**: asserts the chroma mesh is in the test scene after
  `init()`, uniforms exist, `eatShockwave` raises `uOpacity` (not any DOM
  style), the value decays to exactly 0 over several `update()` calls with
  no timer/rAF callback anywhere, the legacy single-arg `pulseChroma(strength)`
  signature still works, and **zero DOM nodes are created** for chroma at
  any point (`testDomHost.children.length` unchanged across the whole
  block) — only the one-time `querySelectorAll` legacy-hide call runs.
  Added a `querySelectorAll` stub + call counter to the selftest's fake
  `document` to support this (previously `testDocument` had no
  `querySelectorAll`).
- **eatShockwave tint plumbing**: asserts a call with `opts.tint: 0xff8a2b`
  produces an active `ring` pool item carrying that exact tint.
- **gemPickup / relicFound pools**: asserts `poolFor()` routes correctly,
  pool sizes match `POOL_CONFIG`, `emit()` returns a positive count, a
  rising-glint item (`gravity < 0`) exists in `gemPickup` after emit, a ring
  item (`isRing`) exists in `relicFound` after emit, and both interact
  correctly with `update()`/`teardown()`/`cursorsReset()`.
- Chroma module state (`chromaMesh`, `chromaUniforms`, `chromaLife`,
  `chromaMaxLife`, `chromaPeak`) was added to the selftest's
  save-before/reset-during/restore-after bracket, matching how every other
  module-level closure variable (`goldEdges`, `frenzyCue`, etc.) is already
  handled.

## Verify results

```
cd play/razorfin && node --import ./tools/reg.mjs tools/selftest.mjs fx
-> fx: pass=true ok=0 fail=0
```

Full-suite smoke (`world game art3d fish fx ui meta abilities`):
```
world: pass=false ok=5 fail=2   <- PRE-EXISTING: "buildRelics is not defined"
                                    in world3d.js:6403 (Lane S2 territory,
                                    not touched here)
game:  pass=false ok=172 fail=1 <- PRE-EXISTING: "lane D3 blew up" /
                                    "Cannot assign to read only property
                                    'CanvasTexture'" in engine3d.js
                                    (Lane S1 territory, not touched here)
art3d: pass=false ok=0 fail=0   <- PRE-EXISTING: shark3d.js build failures
                                    cascading from the same D3 issue
                                    (Lane L1 territory, not touched here)
fish:  pass=false ok=0 fail=0   <- PRE-EXISTING: cascades from art3d/shark3d
                                    (Lane L2 territory, not touched here)
fx:    pass=true  ok=0 fail=0   <- THIS LANE, GREEN
ui:    pass=true  ok=174 fail=0
meta:  pass=true  ok=159 fail=0
abilities: pass=true ok=0 fail=0
```
All non-fx failures are in files I do not own and did not edit
(world3d.js, engine3d.js, shark3d.js/fish3d.js) — noted per instructions,
not investigated or fixed.

## Deviations from the literal task wording

- `pulseChroma`'s public signature is `(color, strength)` with the FIRST
  argument now the tint (not strength). The task said "keep the public
  pulseChroma(color, strength) signature so engine call sites don't change"
  — the OLD signature was actually `pulseChroma(strength)` (single arg, no
  color), so this is a genuine signature change, softened by the
  `arguments.length` backward-compat branch described above. Any existing
  single-argument call site continues to work unchanged; only a caller that
  wants prey-tinted chroma needs to pass two arguments. `eatShockwave` is
  the only internal caller and was updated to the two-arg form.
- Gem/relic pool sizes are 8/8 rather than a literal "8 / 2" reading of the
  task text — relicFound at 2 would only hold a single ring-plus-motes
  emission before the ring buffer starts recycling items from the SAME
  in-flight relic-found burst (a ring + up to 6 motes is already 7 items).
  8 was chosen so one full relicFound burst always fits without
  self-cannibalizing before generalizing to "~2 concurrent moments"; flagging
  this in case the orchestrator wants a stricter budget.

## Risks

- The chroma overlay is a raw `THREE.Mesh` added directly to the shared
  `scene`, rendered via the app's single `renderer.render(scene, camera)`
  call (there is no post-processing composer in this codebase) — relies on
  `renderOrder = 9999` + `depthTest:false` to always draw last/on top. If a
  future lane adds an `EffectComposer` or additional render passes, this
  overlay's "always on top, camera-independent" trick needs to be re-verified
  against the new render path.
- `syncChromaResolution` calls `ctx.renderer.getSize(vector2)` defensively
  (try/catch) with a `window.innerWidth/Height` fallback; if `ctx.renderer`
  is ever absent AND `window` is undefined (fully headless), `uResolution`
  simply keeps its last value (initialized to `(1,1)`) — harmless since
  `uOpacity` stays 0 outside of an active pulse, but worth knowing the
  overlay's shape math would be wrong in that edge case if it ever DID render
  in a truly resolution-less context.
- `hideLegacyChromaDom()` still runs on every `init()`; it's a no-op query
  once `index.html`'s old chroma divs are deleted, but it's a small amount
  of permanently-dead code until that cleanup lands. Safe to leave or strip
  at the orchestrator's discretion.

## Not touched

game.js / world.js / juice.js (dead), index.html, world3d.js, engine3d.js,
shark3d.js, fish3d.js, ui3d.js, data.js, meta.js, abilities.js. Did not
`git commit` per instructions.
