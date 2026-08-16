Controls: tap a tile, then adjacent tiles with the same symbol to build a chain of three or more. Swipe-drag paths and keyboard or supported gamepad confirm actions are also available.
Undo: tap UNDO or press Z. RESET and R restart the current level through GGKit.
Loop: match, clear, cascade, collect nearby locked pieces, and restore the active factory module.
Progress: completed boards, medals, rewards, and restored modules persist through GGKit save validation.
Construction: all 30 boards use deterministic six-color grids with an authored opening chain. Set 2 opening chains cross a conveyor, Set 3 opening chains cross a timed gate, and Set 4 boards require the press plate to open the door.

## AAA rebuild

### Implemented

- Phaser 3 from `/play/_shared/` with GGKit as the lifecycle, input identity, save, audio, reduced-motion, restart, settings, and PWA authority.
- Tap-chain matching with same-symbol adjacency, drag path input, legal preview, invalid feedback, resolve animation, gravity cascade, guaranteed match recovery, and full-state undo.
- Explicit tile states for free, locked, collected, preview, resolve, and cascade. Adjacent matches collect locks and feed reward progress.
- Four authored factory sets across 30 boards. Conveyor, timed directional gate, press plate, and door mechanics are part of board goals and the opening route rather than decorative off-route hazards.
- Move budgets with a visible loss state and retry flow, meaningful match and module par targets, medal scoring, persistent rewards, restored-module progression, and a campaign grid.
- Separate pooled match, cascade, and reward effects with reduced-motion limits, selected and preview states, cascade interpolation, lock collection feedback, and reward escalation.
- GGKit audio keys cover board music, resolve music, selection, invalid action, match, cascade, combo, reward, and reset cues. All registered audio is MP3.
- Piece families use color, silhouette, glyph, and value ticks. Gate textures and HUD copy show the permitted direction and current open state.
- First-run coaching teaches the real match, cascade, lock, undo, and reset loop. Manual settings are reachable from PAUSE, P, and the GGKit settings shell.
- PWA shell includes manifest, 64px favicon, 192px and 512px icons, authored service-worker precache, and no CDN or network asset references.

### Set table

| Set | Boards | Module | Introduced mechanic |
|---|---:|---|---|
| 1 | 01 to 06 | CORE FORGE | Match chains and lock collection |
| 2 | 07 to 14 | CONVEYOR | Conveyor route hit |
| 3 | 15 to 22 | TIMED GATE | Directional gate timing |
| 4 | 23 to 30 | PRESS ARRAY | Plate and door progression |

### Verification

- `node --check game.js` and `node --check sw.js` pass.
- VM boot and catalog probe pass for all 30 boards.
- JSON manifest parsing, service-worker version check, audio-format check, payload and per-file size checks pass.
- Live visual and input pass was not available because the provided environment had no connected browser surface.

## Fix round 1

### Fixed

- CRITICAL wrong loop: replaced worker pushing with tap-chain matching, clear resolution, gravity cascade, lock collection, and module restoration.
- CRITICAL particle gate: added separate pooled match, cascade, and reward effect systems.
- MAJOR move limit and lose state: added per-board budgets, FLOW JAM retry, and legal-action counting.
- MAJOR off-route mechanics: opening chains include the conveyor and timed gate, while plate boards require plate activation in their goals.
- MAJOR solved start: fresh deterministic grids cannot begin in a completed state.
- MAJOR par target: par is derived from match and required module goals, with a visible action limit.
- MAJOR alignment lock state: replaced alignment with explicit free, locked, collected, preview, resolve, and cascade tile states.
- MAJOR reward progression: saved rewards and restored module flags now change campaign HUD and win banners.
- MAJOR tutorial: first-run coaching teaches match, cascade, lock collection, undo, and reset.
- MAJOR pause and settings: visible PAUSE control, P shortcut, and GGKit settings flow are wired.
- MAJOR gamepad path: edge-triggered directional and confirm polling is routed through the GGKit input facade when its gamepad state hook is available.
- MAJOR touch coordinates: pointer identity comes from GGKit while Phaser `p.x` and `p.y` provide one consistent game-space coordinate pair.
- MAJOR hints: hints search the current grid state, and undo restores the full grid and counters instead of a stale route cursor.
- MAJOR mechanic texture cache: texture keys include direction and state, so conveyor and gate visuals cannot cross-contaminate.
- MAJOR audio gate: added board and resolve music keys plus selection, invalid, match, cascade, combo, reward, and reset cues through GGKit.
- MAJOR text sizing: gameplay-critical HUD, control, goal, status, grid, and mechanic text is 12px or larger.
- MAJOR piece coding: tile families now use distinct silhouettes, colors, glyphs, and value ticks.
- MAJOR animation states: selected preview, resolve fade, cascade movement, locked presentation, and reward feedback are explicit.
- MAJOR gate direction: gate art and HUD show the permitted direction and open or closed status.
- MAJOR debug bypass: force controls are unavailable unless the explicit `__FORGELOCK_DEV === true` build flag is present.
- MINOR undo visuals: undo restores tile state and re-renders the complete current model, so no stale alignment visual remains.
- MINOR reduced motion: win flash is zero when reduced motion or juice is disabled.

### Rejected

- None. The listed findings were actionable against the prior worker-push implementation and were addressed within the original budgets.

## UI declutter

- Cut the always-on title/kicker, module, chain, gate, par, medal, help, and status copy from active play; kept goals as symbol counters and moves as a compact meter.
- Shrunk coaching to one thin, one-line top strip that fades after a few seconds; converted important events to one queued corner chip with a one-second hold.
- Moved board navigation into the top icon cluster, reduced RESET/PAUSE and UNDO/HINT to touch-safe icon controls, and moved moves/par/stars into run-boundary results.

## Retina pass 2026-08-16

- Ratio record: before 1.00x from the pre-pass design-size backing configuration; after 3.00x is the configured DPR3 result from `round(design * GGKit.hiDpi.factor(...))`. A live canvas ratio read was unavailable.
- Recipe: Phaser `Scale.FIT`, design world coordinates retained, `RETINA_FACTOR` applied to scale dimensions and the Forgelock scene camera zoom. Procedural chrome, board, tile, mechanic, and effect textures use dense Graphics backing with logical image scales, and text uses the same resolution.
- Factor cap: none. The GGKit factor is used without a cap because this title has no measured need for one.
- Could not do: the browser connector reported no available target, so the required DPR3 canvas ratio read and real gameplay screenshot could not be captured. `node --check` and `git diff --check` pass.
