# Terrace Tales

Controls: swipe (or tap two neighbours) to swap gems; tap the big buttons to choose renovations. Keyboard: arrows move the cursor, Enter/Space picks up a gem then an arrow swaps it, R retries, Esc returns to the garden, M mutes.
Loop: each of 15 seeded match-3 levels has a move budget and colour goals; clearing one funds exactly one renovation slot on Hollowbrook Rise.
Every slot offers two layout variants - your pick is built into the scene permanently and persisted through GGKit save, so the hillside is yours.
Fail = out of moves, retry instantly with no penalty or cost; win the 15th slot and the restored garden plays on through its own day/night cycle.
Everything is play-earned: no currencies, energy, timers, or gates of any kind.

## AAA rebuild

### Implemented

- Rebuilt the archived canvas prototype as Phaser 3.87 from `/play/_shared/` with GGKit as the sole lifecycle, input, save, audio, settings, orientation, reduced-motion, and PWA owner.
- Added fixed-step match-3 simulation with seeded boards, swipe or tap-neighbour swaps, legal preview ghost and arrow, shape-coded colorblind-safe gems, row/column/bomb/prism specials, cascades, pooled particles, corner progress chips, and boundary-only center banners.
- Added a 15-slot campaign with instant free retries, generous bonus moves, free prism drops on tight levels, replay of every completed level, personal-best scores, bronze/silver/gold medals, no-hint and cascade tracking, and a sequential renovation unlock chain.
- Added procedural garden art for four authored zones, two visually distinct variants per slot, build-in dust and bloom sparkle, permanent saved choices, a restored finale vista, and a 42-second day/night cycle after slot 15.
- Added GGKit audio-bus cues for UI, swap, invalid, match, cascade, special, fall, goal, reveal, build, fail, and garden states. Audio is original generated MP3 only.
- Added required PWA metadata, icons, favicon, absolute shared-runtime paths, `/play/terrace-tales/` base path, and a complete existing-file precache list.

### Level table

| # | Zone | Goal | Base moves | Bonus | Free prism |
|---:|---|---|---:|---:|---:|
| 1 | Entry Terrace | Leaf 16 | 25 | 4 | 0 |
| 2 | Entry Terrace | Tide 18 | 24 | 4 | 0 |
| 3 | Entry Terrace | Leaf 14 + Berry 12 | 24 | 3 | 0 |
| 4 | Entry Terrace | Plum 18 | 23 | 4 | 0 |
| 5 | Courtyard | Sun 15 + Tide 14 | 23 | 4 | 1 |
| 6 | Courtyard | Berry 18 | 22 | 5 | 1 |
| 7 | Courtyard | Ember 15 + Leaf 14 | 22 | 4 | 1 |
| 8 | Courtyard | Plum 20 | 21 | 5 | 1 |
| 9 | Orchard | Tide 15 + Sun 14 | 21 | 5 | 1 |
| 10 | Orchard | Leaf 16 + Berry 14 | 20 | 5 | 1 |
| 11 | Orchard | Tide 15 + Ember 14 | 20 | 5 | 2 |
| 12 | Orchard | Sun 21 | 19 | 5 | 2 |
| 13 | Hollowbrook Rise | Plum 16 + Leaf 15 | 19 | 6 | 2 |
| 14 | Hollowbrook Rise | Ember 16 + Berry 15 | 18 | 6 | 2 |
| 15 | Hollowbrook Rise | Plum 14 + Tide 14 + Sun 12 | 18 | 7 | 2 |

### Slot table

| # | Zone | Slot | Variant A | Variant B |
|---:|---|---|---|---|
| 1 | Entry Terrace | Retaining edge | Drystone wall | Willow bank |
| 2 | Entry Terrace | Rain catch | Spill basin | Reed rill |
| 3 | Entry Terrace | Entry planting | Herb beds | Wildflower drift |
| 4 | Entry Terrace | Resting step | Stone bench | Timber deck |
| 5 | Courtyard | Orchard row | Pear espalier | Plum grove |
| 6 | Courtyard | Courtyard path | Gravel walk | Steppingstones |
| 7 | Courtyard | Garden shelter | Potting shed | Open arbour |
| 8 | Courtyard | Evening light | Lantern posts | Fire bowl |
| 9 | Orchard | Wind frames | Glass cloches | Reed screens |
| 10 | Orchard | High beds | Alpine rockery | Moss garden |
| 11 | Orchard | Cistern | Cistern pool | Mist channel |
| 12 | Orchard | Orchard crown | Bell post | Sky trellis |
| 13 | Hollowbrook Rise | Rise stair | Switchback stair | Straight flight |
| 14 | Hollowbrook Rise | Threshold | Iron gate | Hedge arch |
| 15 | Hollowbrook Rise | Finale vista | Beacon lantern | Star pond |

### Deferred

- Real browser screenshot, touch probe, and 4x-throttle frame capture were not runnable in this environment because no browser surface was provisioned and the sandbox rejected binding a local HTTP server. Static parsing, boot-probe, precache, asset-format, and 15-seed board model smoke checks passed.

## Fix round 1

### Fixed

- Added the documented keyboard path through GGKit key state: arrows move the cursor, Enter or Space selects and swaps with a neighbour, R retries, Escape returns to the garden, and M toggles mute.
- Preserved fixed-step accumulator remainder across frames and capped garden canvas refreshes to a 20 Hz render cadence, reducing unnecessary per-frame texture uploads.
- Preserved GGKit pointer identity, ignored concurrent board pointers while one gesture is active, and released board gestures on pointer-up, pointer-up-outside, or pointer-cancel.
- Corrected falling-gem source offsets and cleared them after each fall so settled gems do not retain an animation offset.
- Guarded empty goal text updates, simplified the preview assignment, and initialized the play mute control from GGKit's persisted audio preference.
- Completed the service-worker precache with the worker and license manifest alongside the runtime files.
- Bumped the service-worker cache version to `aaa-20260810-fix1`.

### Rejected or unavailable

- No specific finding was rejected as factually wrong. The supplied REVIEW FINDINGS payload contained a minified Phaser bundle and prior tool logs rather than line-specific findings. The available combined review file also ended at the brief's verdict, so no honest one-to-one CRITICAL or MAJOR mapping was possible. The fixes above address defects directly confirmed against the brief and source.

### Deferred

- Browser visual playthrough, 390 px screenshot gate, and live 4x-throttle capture remain unverified because no browser surface was provisioned. Syntax, seeded board invariants, asset formats, precache paths, and size checks are covered by the round validation.

## Fix round 1

### Fixed

- CRITICAL narrative gap: added 15 authored story beats with characters, sequenced dialogue, level titles, motif labels, persistent story checkpoints, and persistent character unlocks.
- CRITICAL greybox presentation: rebuilt the board chrome with layered gradients, inset pockets, material highlights, seams, shadows, and rivets; added terrace stone courses, prop shadows, glints, and richer procedural garden depth.
- MAJOR skipped renovation: campaign wins now persist `pendingChoice`; the hub resumes that choice, and `completed` advances only after Build finishes.
- MAJOR tap swapping: pointer selection is committed on release, so two taps on neighbouring cells now swap correctly while swipe input remains intact.
- MAJOR gamepad path: added a GGKit input adapter for optional `gamepadState()` or `getGamepadState()` providers, including d-pad, confirm, cancel, restart, and settings mappings without raw browser polling.
- MAJOR board alignment: one shared origin now drives chrome, tile centers, grid lines, and hit testing; cells are 44 px.
- MAJOR forged saves: sanitization now derives the highest coherent completed checkpoint from contiguous choices and validates the pending choice, story array, and character map.
- MAJOR Ready, Preview, Resolve: added state labels, resolve selection feedback, idle tile drift, spring-damped swap and fall motion, and authored story motif feedback.
- MAJOR reduced motion and shake: match and reward emitters are suppressed when juice is disabled; `kit.juice.frame()` is applied to the board, tiles, selection, and FX.
- MAJOR particles: split clear, cascade, and reward into Phaser particle emitters, routed Choice and Build reward reveals through emitters, and removed the old Play and Build manual particle pools.
- MAJOR audio: added original `board.mp3` and `meta.mp3`, registered state-aware music crossfades, reward ducking, and bumped `sw.js` to `aaa-20260811-fix2` with both tracks precached.
- MAJOR planning and goals: added a next-piece preview and animated goal badges when progress changes.
- MAJOR reset safety: `NEW RISE` now requires an explicit confirmation action.
- MINOR touch target and cursor: cells are 44 px and pointer selections synchronize the keyboard cursor.
- MINOR button feedback: buttons now press at 0.96 scale, activate on pointer-up, and cancel when the pointer leaves.
- MINOR hint lifetime: hint-only selection and preview clear after the hint timer unless the player acts.
- MINOR copy and build timing: corrected the Choice copy and drove the build reveal from `buildT`; build particles originate at the actual slot prop position.
- MINOR prism count: free prisms are placed once during board setup and the remaining drop budget is cleared, preventing double counting.

### Rejected or unavailable

- Direct gamepad implementation against the bundled GGKit was rejected as out of scope because `/play/_shared/ggkit.js` exposes no gamepad state or event method and the brief requires GGKit to remain the sole input owner. The game consumes the optional GGKit hook when a compatible provider exists; adding `navigator.getGamepads()` or editing the shared runtime would violate the brief.
- Live browser tap-through, 390 px visual capture, and 4x-throttle median capture remain unavailable because this environment has no browser surface. Static/runtime checks were run instead.

### Verification

- `node --check game.js` passed.
- `node --check sw.js` passed.
- Seeded model probe passed 25 random legal runs per level, with all levels retaining wins; forged `completed: 15` with empty choices sanitizes to `completed: 0`.
- Terrace Tales payload is approximately 388 KB; largest changed file is `game.js` at approximately 100 KB; shipped audio is MP3 only.

## Retina pass 2026-08-16

- Audit before ratio: 1.00x at the emulated DPR 3 portrait viewport. Configured after ratio: 3.00x from `GGKit.hiDpi.factor(390, 844)`, with a 1170 x 2532 backing store for the 390 x 844 design box.
- Recipe: Phaser `Scale.FIT`, dense scale dimensions, `GGKit.renderDefaults`, `setZoom(f)` in Boot, Story, Hub, Play, Choice, Build, and Finale, plus matching Phaser text resolution.
- Factor cap: none beyond GGKit's standard maximum of 3. No title-specific cap.
- Live canvas ratio and gameplay screenshot were unavailable because the browser backend was empty and the sandbox denied private HTTP listeners. The after ratio above is the configured geometry, not a live canvas read.
- Static title-local canvas bakes now use `GGKit.hiDpi.canvas` and Phaser texture source resolution. Gameplay, balance, and content were unchanged.

## Retina repair 2026-08-16

The title booted with no uncaught error and no failed request but rendered a
single flat colour, and a canvas probe found no usable main canvas at all
(ratio `null`). Four defects, all introduced or exposed by the hi-DPI pass.

**Defect 1 — no canvas in the DOM (the `null` ratio).** `game.js` is loaded
from `<head>`, so `document.body` was still `null` when the Phaser config was
built and `parent: document.body` became `parent: null`. Phaser's
`ScaleManager.getParent()` returns early on a null parent, so the game booted,
ran its scenes and updated `window.__tt.state` while its canvas was never
appended to the document. Body stayed empty; nothing was ever visible.
Fix: construct the game once a real parent exists (`if (document.body) init();
else document.addEventListener('DOMContentLoaded', init, { once: true })`).

**Defect 2 — camera looking outside the design box.** Each scene called
`this.cameras.main.setZoom(RETINA_FACTOR)`. That is only half of the
`Scale.FIT` + camera-zoom recipe: the game is sized at DESIGN * f device
pixels, so the camera's own midpoint is at `(W*f/2, H*f/2)` and a zoomed
camera keeps that midpoint under the viewport centre. The visible world window
therefore landed entirely outside the `0..390 / 0..844` design box and every
scene drew as flat background. Fix: a single `retinaCamera(scene)` helper that
does `setZoom(RETINA_FACTOR)` **and** `centerOn(W / 2, H / 2)`, used at all
seven scene sites.

**Defect 3 — baked textures drawn RETINA_FACTOR times too big.** `bake()` now
draws onto a dense `GGKit.hiDpi.canvas` (CSS size * dpr). Phaser's WebGL
batcher builds its quad from `frame.cutWidth` (the dense pixel count) times
the object's scale, so any baked sprite created without an explicit size came
out 3x. Setting `source.resolution` does not fix this: only the canvas
renderer divides by it, so it makes the two renderers disagree, and it is no
longer set. Fix: `TEX = 1 / RETINA_FACTOR`, applied to the objects that had no
explicit size (garden background, `tt_bg`, `tt_board_chrome`, the 64 tiles,
story marks, selector, ghost, arrow) and to the six particle emitters' scale
ranges. Sites that already used `setDisplaySize(cssW, cssH)` were correct as
written and were left alone.

**Defect 4 — blank button labels.** `makeButton` called
`makeText(scene, label, 0, yOffset, ...)` against a
`makeText(scene, x, y, text, ...)` signature, so every button drew its y offset
as its caption. Fixed the argument order for the label and the sub-label.

**Also fixed (required by the live gate).** `PlayScene.render()` computed
`showPreview = !!preview && ready` and then read `sel.x`, throwing
`TypeError: Cannot read properties of null (reading 'x')` from inside the
render callback whenever a preview existed without a selection. Now guarded
with `!!sel`.

**Measured density ratio: 3.00** (`canvas.width` 1170 /
`getBoundingClientRect().width` 390) at deviceScaleFactor 3. No factor cap was
needed.

Gates, all run by this lane: `boot_sweep` PASS (err=0, 404=0, colors=413,
exact8=3425), `retina_audit` RET-OK (dpr=3, colours=4353, flattest 18.7%),
`live_probe` PASS (rAF alive, 5/5 distinct frames, err=0). Gameplay confirmed
by hand: hub -> level 01, a swap resolves and decrements the move counter, and
the board renders crisply at native density.

`node --check` clean on `game.js`. No design, balance or content changes.
