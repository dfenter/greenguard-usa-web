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
