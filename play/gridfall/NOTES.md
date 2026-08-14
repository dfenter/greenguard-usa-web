# Gridfall

Tap a connected group of three or more matching tiles on the 8x8 board. Cleared tiles score, gravity compacts each column, deterministic refills complete the board, and any new groups resolve as cascades. A run ends when its move budget is spent or completes its mode goal.

Controls: tap or click a tile, arrows move the cursor, Space or Enter selects, H shows a hint, P cycles an unlocked tile pattern, and R restarts. A gamepad uses the d-pad or stick to move, A to select, B for a hint, X to cycle patterns, and Y to restart.

Modes: Marathon is a 60-move score run. Daily is a date-seeded 40-move board with one official finish logged per day. Challenge has six authored chapters with increasing move budgets, goals, and pattern rewards. Master unlocks after the Challenge chain.

Patterns are visible tile families, not cosmetic-only save flags. Classic, Prism, Leaf, Star, Aurora, and Goldline change the tile silhouette and mark. Completing authored chapters unlocks the next usable pattern, and the selected pattern persists through GGKit save validation.

No build step or network asset is required. `index.html` uses deployment-relative shared paths and can also be opened from the title directory with a local file URL. Audio assets are short original MP3 files and are registered, started, stopped, and muted through GGKit.

## Fix round 1

Fixed:

- Critical core mechanic: replaced block placement with connected-color tile selection across touch, keyboard, and gamepad input.
- Critical gravity and cascades: legal groups clear, columns fall, deterministic tiles refill, and chained groups resolve with cascade scoring and view states.
- Critical move logic: every mode has a bounded move budget, a visible counter, goal completion, and run-ending logic for exhausted moves or unavailable groups.
- Critical pattern unlocking: added a validated pattern registry, chapter unlock rules, persistent selected pattern state, and usable procedural silhouettes.
- Critical art quality: added procedural orb, diamond, hex, shadow, gloss, facet, ring, hazard, and pattern-specific tile treatments with pooled rendering.
- Critical audio: added original MP3 theme and distinct tap, clear, cascade, reward, invalid, and UI cues through GGKit audio registration and buses.
- Major onboarding: title and coach copy teach groups, gravity, cascades, move budgets, patterns, controls, and the explicit HINT button.
- Major pacing: expanded authored progression from four boards to six chapters plus Master, with longer move budgets and escalating score, clear, and cascade goals.
- Major gamepad support: added d-pad and analog navigation, edge-triggered A, B, X, and Y actions, and pause-safe polling through the GGKit input surface.
- Major off-board placement: removed drag placement entirely for the requested tap-match interaction. A release outside the board cannot commit a move.
- Major multi-touch: only the first active pointer can select a tile; secondary pointers are rejected and all pointer state is cleared on pause or restart through GGKit.
- Major restart contract: R, result-card restart, gamepad restart, and mode changes clear GGKit input state, while run restarts route through `kit.restart()`.
- Major next-hand readability: removed the obsolete hand rail and replaced it with an opaque objective and hint card for the tap-match loop.
- Major small-screen readability: added safe-area padding, responsive board sizing, opaque controls, and gameplay labels at readable sizes for 390px layouts.
- Major animation states: added Ready, Preview, Invalid, Resolve, Cascade, and Reward view states with distinct tile transforms, pooled clear flashes, and distinct particle textures.
- Major medal guard: `Sim.medal()` returns a medal only after `state.complete`, and persistence follows the same completion guard.
- Major run history: added validated bounded history with up to ten runs and a visible recent-run summary on the result card.
- Major debug bypass: removed force-board and force-mode progression hooks. `window.__gf` exposes read-only diagnostics only.
- Major file workflow: replaced root-absolute shared scripts and removed the base URL so `file://` and deployment-relative loading resolve the same local files.
- Minor timing: cosmetic hit-stop no longer returns early from the fixed-step simulation, so view timers and the simulation clock continue advancing.
- Minor save validation: added exact date validation, bounded counters, known board and pattern IDs, duplicate-free unlocks, strict history entries, and a complete schema check.
- Budget checks: generated audio is MP3-only, every changed file is below 400KB, the shipped payload remains below 2.5MB including shared runtime files, and `sw.js` was bumped to `2026-08-10-aaa2` with all shipped assets precached.

Rejected:

- The reviewer's failed connections to ports 8899, 8791, and 8787, plus the blocked local server/browser, describe the review environment rather than a Gridfall code defect. No product workaround was added for unavailable host services.

## UI declutter

- Cut active-play title, mode tabs, board name/subtitle, repeated HUD labels, and the always-on control/flavor line; menus and the results screen retain the information.
- Collapsed score, moves, and cascades into icon-led HUD values, and folded the live objective into a compact progress meter with the existing hint control.
- Replaced the live center group/cascade/pattern banners with one queued corner chip at 14px, held for 0.85s; retained only a smaller center notice at run boundaries.
- Moved the opening tutorial and locked-mode feedback to one thin top strip with a short fade, kept reduced-motion gating, and preserved 44px hint touch height.
- Bumped the service-worker cache version to `2026-08-10-aaa3`; `node --check` passed for all JavaScript files. A live 10-second browser capture was unavailable because no browser endpoint or local listener was available in this environment.
