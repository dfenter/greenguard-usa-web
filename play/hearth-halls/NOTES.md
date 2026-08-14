Controls: swipe or tap two adjacent tiles; arrow keys move the cursor, Enter selects a tile and an arrow swaps it; tap style buttons.
Loop: clear match-3 goals across 12 seeded levels to fund 6 choices in each of 2 rooms.
Every cozy, grand, or quirky choice changes the room art and Marn/Pip reactions; no lives or timers.
Retry is instant; choices and best score persist locally.

## AAA rebuild

### Implemented

- Rebuilt the title as Phaser 3 using `/play/_shared/phaser.min.js` and GGKit as the sole lifecycle, input, save, audio, orientation, settings, and PWA runtime.
- Added pointer swipe, tap-select-swap, keyboard arrows plus Enter, instant legal-move preview, guarded save validation, deterministic stepped simulation, pooled Phaser particle emitters, reduced-motion gating, safe-area styling, and the `window.__hh` probe hook with `forceLevel` and `forceRoom`.
- Added triple-coded colorblind-safe tile families, special-tile drops, a persistent keepsake inventory with nearby-slot placement, generous bonus moves, free board reshuffles, instant retry, corner chips, staged first-level teaching, boundary-only result cards, curtain reveal, sparkle bloom, and Marn/Pip reaction beats.
- Added original MP3 home and board loops plus distinct GGKit-registered cues for input, invalid moves, swaps, matches, cascades, hints, goals, reveals, reactions, room completion, confirmation, and keepsake placement.
- Added replay mode for completed levels, personal best persistence, bronze/silver/gold medal rules using remaining moves, streak, and hint usage, and sequential room-choice unlocks.
- Added PWA manifest, 192px and 512px icons, favicon, service worker with complete precache, and procedural-only art with provenance recorded in `LICENSES.md`.

### Level table

| Level | Seed | Base + bonus moves | Goal | Silver / gold moves remaining | Free specials |
|---:|---:|---:|---:|---:|---:|
| 1 | 7919 | 18 + 2 | 250 | 5 / 8 | 1 |
| 2 | 15431 | 19 + 1 | 340 | 5 / 8 | 0 |
| 3 | 23887 | 20 + 1 | 410 | 5 / 8 | 0 |
| 4 | 31271 | 19 + 2 | 490 | 5 / 8 | 0 |
| 5 | 40111 | 21 + 1 | 570 | 6 / 9 | 0 |
| 6 | 48799 | 22 + 1 | 650 | 6 / 9 | 0 |
| 7 | 57149 | 20 + 2 | 730 | 5 / 8 | 0 |
| 8 | 65063 | 22 + 1 | 810 | 6 / 9 | 0 |
| 9 | 73471 | 23 + 1 | 900 | 6 / 9 | 0 |
| 10 | 81929 | 22 + 2 | 1000 | 6 / 9 | 0 |
| 11 | 90121 | 24 + 1 | 1110 | 7 / 10 | 0 |
| 12 | 98317 | 26 + 1 | 1230 | 7 / 10 | 0 |

### Room table

| Room | Fixture stages | Character beat |
|---|---|---|
| Cinderwick Living Room | Hearth, rug, table, lamp, shelf, window | Marn and Pip each react to every Cozy, Grand, or Quirky reveal, then the room-complete beat opens the kitchen. |
| Mossbell Kitchen | Hearth, rug, table, lamp, shelf, window | Marn and Pip each react to every style, then the final full-reveal beat presents both rooms together. |

### Deferred

- Browser visual smoke test and stepped-performance capture could not run in this sandbox: no browser connector was available and local HTTP binding was denied. Syntax, manifest, service-worker precache, scope, and payload checks passed.

## Fix round 1

### Fixed

- Critical comfort loop: added six original keepsakes, persistent inventory and home placement, nearby-slot validation, room rewards, saved placement state, and visible collection feedback.
- Critical keyboard input: separated cursor focus from selected tile state so arrows plus Enter can select and confirm an adjacent swap.
- Critical audio: added and registered original MP3 home and board loops plus distinct MP3 cues, then started the appropriate GGKit music bus for title and board states.
- Critical art: replaced the flat navy and blank-slot treatment with layered painted-room colors, wood trim, linen-like wall panels, floor planks, brass accents, contact shadows, authored fixture silhouettes, and animated firelight cues.
- Major tutorial and onboarding: staged the first-level match, powered-tile, goal, keepsake, and decoration guidance; the choice screen now teaches mood selection and placement.
- Major progression opacity: title and gameplay surfaces now show room lock state and fixtures revealed out of six.
- Major room feedback: added deterministic idle glow, build pulses, distinct placement, unlock, comfort, and reward emitters, plus fixture-specific reveal feedback.
- Major pause and settings: added a visible settings affordance, GGKit pause and resume callbacks, pointer cancellation on pause, and GGKit-routed restart cleanup.
- Major gamepad and touch: added edge-triggered D-pad or left-stick navigation, confirm, cancel, pause, single-pointer claiming, pointer cancellation, pointer-up-outside handling, and game-out cleanup.
- Major juice and reduced motion: consumed `kit.juice.frame()`, applied bounded camera shake, swap motion, settle motion, hit-stop, and gated all dense bursts behind the GGKit juice setting.
- Major clarity and accessibility: invalid previews now render a coral crossed ghost, tile bodies use distinct silhouettes plus symbols, choice and reaction text use high-contrast colors, saves validate exact home invariants, and the live region plus focusable accessible controls publish current state.
- Major pacing: removed later free specials, reduced powered-clear scoring, and raised later goals to prevent a first-legal-move sweep from trivializing the chapter.
- Minor final-card ordering: completion glow is now drawn after curtain clearing.
- Minor offline shell: precached `sw.js` itself and bumped the service-worker version to `aaa-2026-08-10-fix1`.

### Rejected as factually out of brief

- The suggestion to add more than two room chapters was not applied. The original brief and existing title contract explicitly define two rooms with six fixture choices each, so the fix keeps that content budget and makes the two-room progression legible instead.
