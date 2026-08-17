Controls: A/D or arrows move; X/Z/up rotates; Space hard drops; C/Shift holds.
Touch controls provide move, rotate, hold, and hard drop. A short board swipe
also moves, rotates, or drops the active shape.

Loop: place seven neon shapes on the 10 by 20 grid, clear full rows, build
chain multipliers, and survive the four-minute Fallline run.

## AAA rebuild

Implemented:

- Phaser 3 is loaded only from `/play/_shared/phaser.min.js`. `FalllineScene`
  is the renderer and fixed-step presentation layer. GGKit owns lifecycle,
  pause and resume, per-pointer identity, keyboard state, save validation,
  audio buses, juice, and PWA registration.
- The board is an integer matrix with seven authored pieces, four rotation
  states, wall kicks, gravity, soft drop, hard drop, spawn animation, lock
  delay, lock reset limits, hold state, and a visible next-piece preview.
- Full rows animate before removal. Clear cascades use separate spark and
  shard pools. Placement flashes, ghost pieces, lock pulses, combo popups,
  level milestones, screen shake, and two clear feedback buses are included.
- Score, lines, level, wave, gravity, timer, hold, next, and chain state are
  visible in the HUD. Gravity accelerates from line-based level progression
  with a bounded minimum interval. Classic Fallline, Rush, and Zen runs are
  available from the mode panel.
- The first-run guide teaches move, rotate, hard drop, hold, row clearing,
  and chain scoring. The first minute keeps a compact contextual coach strip.
- The responsive mobile layout has explicit pointer-enabled controls, per-
  pointer touch ownership through GGKit, short swipe gestures, and a compact
  stacked HUD for narrow screens. Returning to landscape clears the local
  orientation pause when GGKit is not paused.
- `window.__fl.state` exposes guarded mode and phase controls plus mode,
  phase, level, score, lines, combo, active, next, hold, board, and state.
- Existing original MP3 cues are routed through semantic theme, rotate, drop,
  lock, clear, chain, and game-over event names. No non-MP3 or non-M4A audio
  is used. The PWA manifest and service worker precache use the fallline
  shell and shared Phaser and GGKit files.

## Fix round 1

### Fixed

- Critical 1: replaced the shooter with an original falling-block game.
- Critical 2: added the integer grid, active piece, rotation states, wall
  kicks, spawn state, gravity, lock delay, hold, and next state.
- Critical 3: added cell-precision collision validation for movement,
  rotation, gravity, ghost placement, and lock.
- Critical 4: added full-row detection, clear animation, removal, score,
  escalating chain multipliers, combo feedback, and score HUD fields.
- Critical 5: added line-based level progression and a smooth gravity curve
  with a safe lower bound.
- Critical 6: added a visible next preview and first-run and first-minute
  instruction paths for movement, rotation, drops, clears, and chains.
- Critical 7: touch controls now carry explicit pointer-enabled control
  classes and are queried through GGKit per-pointer state.
- Critical 8: added tap rotation on the rotate pad, board tap rotation,
  horizontal movement swipes, short rotation swipes, and hard-drop swipes.
- Critical 9: replaced shooter greybox art with an authored neon grid, block
  palette, ghost treatment, depth shadows, highlights, scanlines, and glow.
- Critical 10: added spawn, placement, clear flash, separate spark and shard
  clear cascades, rotation feedback, ghost placement, and chain popups.
- Major 1: mode and overlay controls are explicitly pointer enabled.
- Major 2: narrow-screen HUD widths no longer rely on impossible minimums;
  the mobile layout stacks the center readout below the side chips.
- Major 3: rejected as factually wrong for the replacement. Fallline has no
  damage, health, or invulnerability system, so shooter damage feedback does
  not apply.
- Major 4: added semantic rotate, drop, lock, clear, chain, and game-over
  audio calls with music and SFX buses through GGKit.
- Major 5: replaced delta truncation with a fixed-step accumulator and a
  bounded eight-step catch-up loop.
- Major 6: resize now explicitly sets local pause to orientation-invalid or
  GGKit-paused state, so a valid landscape resize resumes correctly.
- Major 7: mode selection hides the result overlay for both completion paths
  and resumes all relevant GGKit pause reasons when a new run starts.
- Major 8: removed the deferred shooter QA note. Static syntax, payload,
  asset, audio-extension, and precache checks were rerun for this round.
  Live browser capture was unavailable in this environment.
- Minor 1: rejected as factually wrong for the replacement. Fallline has no
  fire control or held-fire state.
- Minor 2: rejected as factually wrong for the replacement. Fallline has no
  reloadable weapon state.
- Minor 3: synchronized toast, coach, tutorial, mode, boundary, and result
  visibility with `aria-hidden`, and result events use a status region.

### Verification

- `node --check play/fallline/game.js` passed.
- `node --check play/fallline/sw.js` passed.
- All Fallline files are below 400KB. The Fallline payload is below 2.5MB.
- Audio files are MP3 only. No em dash is used in user-facing Fallline text.

## Live repair 2026-08-16

Found live-broken on the public site by the fleet interaction probe
(`live_probe.mjs`): `requestAnimationFrame` count stayed at 0 for the whole
session and the frame never changed.

### Defect

Uncaught on boot, before the render loop ever started:

```
TypeError: Cannot read properties of undefined (reading 'forEach')
    at drawBoard (game.js:831)
    at resetRun (game.js:410)
    at create  (game.js:247)
```

### Root cause

`cellsFor(piece, rotation)` was declared with a required `rotation` argument:

```js
cellsFor(piece, rotation) { return SHAPES[piece.kind][(rotation + 4) % 4]; }
```

but three call sites pass the piece alone and rely on the piece's own rotation:
`lockPiece` (line 525), `drawBoard` (lines 831 and 836) and `spawnPlacementFx`
(line 914). With `rotation` undefined, `(undefined + 4) % 4` is `NaN`, so
`SHAPES[kind][NaN]` returned `undefined` and `.forEach` threw.

The throw happened inside `create()`, so the exception unwound out of Phaser's
scene boot: the scene never finished starting and the render loop was never
installed. That is why rAF was 0 rather than merely stalling later.

### Fix

`cellsFor` now defaults `rotation` to `piece.rotation` when it is not supplied.
One method, no behaviour change for the call sites that do pass a rotation
(`canPlace`, which drives movement and wall kicks).

### Verification

- `node --check play/fallline/game.js` passed.
- `boot_sweep.mjs`: 0 console errors, 0 uncaught, 0 failed requests.
- `live_probe.mjs`: PASS, raf=1043 and still advancing after input, 3/5 distinct frames.
- `create()` now runs to completion: `ready === true`, FX pools 120/80, board 20 rows.
- Core mechanic resolves under real keyboard input: pieces move, rotate, hard-drop
  and lock (12 cells occupied, score 0 -> 96, run still active).
- Gameplay frame is lit and drawing: 528 distinct colours at 5-bit quantisation,
  99.8% non-black, most common colour only 33% of the frame.

## Retina completion

- **Measured, not expected.** Release gate at deviceScaleFactor 3, run serially at concurrency 1 from `ue-port-studio/aaa/harness` against a private local server: `node release_gate.mjs http://localhost:8791 1 fallline`.
- Gate verdict: **READY**. Measured `canvas.width / getBoundingClientRect().width` = **3.00x** (gate floor 2.85), sampled late by the gate, well after the point where a RESIZE parent poll would have reverted it. Backing store 2532x1170 in a 844x390 CSS box.
- Real gameplay frame: **5329 distinct colours** (8-bit), flattest colour 32.3% of the frame. The frame was compared side by side against the same interaction at deviceScaleFactor 1: layout, spacing and art are pixel-proportional, only the sampling is denser.
- Was `Scale.RESIZE` with `parent: 'game-root'`, which is why it read exactly 1.00x. That pairing can never hold a dense backing store: Phaser's ScaleManager polls the parent every 500ms and re-derives `canvas.width` from its CSS box, silently reverting the density with nothing logged. `GGKit.hiDpi.resize()` was therefore NOT used.
- Converted to `Scale.NONE`: the game is sized in device pixels and the config `zoom: 1/RETINA` scales the canvas back down in CSS. A `window` resize listener drives `game.scale.resize()`, which raises the same `resize` event the scene already listened for.
- The main camera is zoomed by RETINA and re-centred on every layout, so **world coordinates stay in CSS pixels**. That was a deliberate choice: this title's layout is magic numbers end to end (cell clamp 14..34, `(height - 112)/ROWS`, `(width - 280)/COLS`, the +18 board offset, and gesture thresholds of 26/28/42px measured in pointer space). Moving the world into device pixels would have meant rewriting every one of them and risking the feel.
- Consequences handled: `resizeScene()` and `drawPreviews()` divide `this.scale.width/height` by RETINA, and `boardPoint()` does the same before hit-testing, otherwise every board tap would land RETINA times too far right and down.
- `centerOn` is applied with every `setZoom`. Without it a zoomed camera holds its own midpoint under the viewport centre and the playfield leaves the screen with zero console output.

## Release gate repair

2026-08-16, mobile release gate lane.

### PWA installability

The manifest declared 48x48, 128x128 and 512x512 icons but no 192x192, so it was
not installable. Added `icon192.png`, downscaled with LANCZOS from the existing
`icon512.png` master, plus the matching manifest entry.

Verified with `node release_gate.mjs http://localhost:8347 1 <slug>` from
/Users/lucille/ue-port-studio/aaa/harness, serially at concurrency 1, against
`python3 -m http.server 8347 --directory /Users/lucille/greenguard-usa-web`.

Gate verdict: **READY** (all checks pass).
