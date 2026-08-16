# Reef Tiles

Controls: swipe or tap two neighbouring tiles to swap. Tap tank water to feed and drag decor to rearrange. PLAY, TANK, and SHOP live in the bottom tab bar. Keyboard arrows select, Enter starts, Space feeds, and R retries.

## AAA rebuild

Implemented: Phaser 3 portrait rebuild using `/play/_shared/phaser.min.js`, with GGKit as the sole lifecycle, input identity, save, audio, settings, and PWA owner. The board has 16 deterministic seeded levels, legal-swap preview, tap or swipe swapping, goal chips, cascades, pooled clear/cascade/reward particles, tactile tile glyphs, match and ambience MP3 buses, reduced-motion-safe juice, fixed-step slow-motion behavior, and a single transient tutorial or corner chip at a time. The tank has drag decor, tap-to-feed food, schooling, hiding, floor-hugging, food-chasing, gliding, and bubbling fish behaviors. The shop contains 16 decor pieces and 6 fish species. Clear rewards are generous pearls plus a free decor drop, with bronze, silver, and gold medals driven by moves remaining, pearl haul, and comfort bonuses. Progress is comfort-gated only, with no purchases, timers, energy, ads, or network requirement. `window.__rt.state` exposes mode, level, pearls, comfort, and tank contents. `forceLevel` and `forceComfort` are readable before boot and during the live scene.

Level table:

| Pack | Levels | Comfort gate | Authored goal mix |
| --- | --- | ---: | --- |
| Starter Tank | 1-4 | 0 | coral, sun, leaf, tide |
| Reef Shelf | 5-8 | 24 | plum, tide, coral, ember |
| Kelp Forest | 9-12 | 52 | leaf, coral, sun, plum, ember |
| Coral Sanctuary | 13-16 | 82 | ember, tide, coral, leaf, plum |

Comfort table:

| Comfort | Unlock |
| ---: | --- |
| 0 | Starter Tank and level 1 |
| 24 | Reef Shelf, levels 5-8, and richer shelf backdrop |
| 52 | Kelp Forest, levels 9-12, more plants and fish behavior |
| 82 | Coral Sanctuary finale, levels 13-16, richest backdrop |

Deferred: browser visual smoke testing and 4x-throttle frame capture could not run because no in-app browser was available and the sandbox rejected a local HTTP listener. Node syntax checks, manifest parsing, file-size budget, MP3-only audio, and service-worker precache existence checks passed.

## Fix round 1

Fixed:

- Critical coral collection: added migration-safe persistent coral inventory, HUD count, probe state, coral growth in the tank, and coral-driven unlocks.
- Critical sea power-ups: added Current Pulse, Tidal Sweep, and Coral Bloom with thresholds, saved unlock and charge state, gameplay effects, level rewards, and activation buttons.
- Major non-touch controls: added map and shop focus movement, overlay activation, explicit keyboard swap confirmation, and a GGKit-owned gamepad polling path.
- Major tutorial and hint flow: added match-3 goal teaching, an animated legal-swap example, and idle legal-move hints.
- Major pack unlocks: added persisted pack state and threshold crossing detection with a result card followed by a dedicated unlock ceremony.
- Major fish feed persistence: validated feed bounds, migrated old saves, continuously synced model feed to the saved profile, and preserved zero values.
- Major tile feel: added breathing, press state, clear pop and fade, spring-damped swaps and drops, and authored selector feedback.
- Major player states: added Ready, Preview, Resolve, and Invalid selector states with ghost, arrow, hatch, and label cues.
- Major reduced motion: honored the system preference, gated high-energy FX, and kept the simulation clock running through cosmetic hit-stop.
- Major aquarium motion and audio: added two-frame tail motion, a separate meta loop, select, combo, goal, and reward cues, plus reward music ducking.
- Major accessibility and layout: differentiated Coral and Tide symbols, mounted Phaser in `#game`, added text scale settings, responsive goals, power-ups, shop cards, and overlays, and enlarged the gear hit area.
- Major content and feedback: added deterministic authored reef-rock, kelp-lock, and sanctuary-gate variants, visible obstacles, tank-visible feed FX, and score HUD/result feedback.
- Minor input and reward fixes: claimed one board pointer, cleared stale candidates, corrected full-tank reward copy, and preserved legitimate zero decor coordinates.

Rejected/deferred:

- Required visual and 4x-throttle evidence was not fabricated. The browser runtime had no available browser in this session, so 390px screenshots and a live median measurement remain deferred. Static validation passed: 16/16 obstacle boards start without matches and retain a legal swap, all precache paths exist, audio is MP3-only, the title plus shared runtime is about 1.4MB, and the largest shipped file is about 100KB.

## Retina pass 2026-08-16

- Target 390x844 CSS at DPR 3. Before ratio: 1.00x CSS-sized RESIZE baseline. After target: 3.00x, 1170/390, via `GGKit.hiDpi.resize`. Live canvas read was unavailable because no browser surface or private local listener was available.
- Recipe: `Phaser.Scale.RESIZE`, `GGKit.renderDefaults`, `GGKit.hiDpi.canvas` texture baking, and recursive DPR-matched Phaser text. No factor cap.
- Gameplay screenshot and runtime backing-store measurement remain deferred. No palette change was made because the retina law identifies density, not colour depth, as the defect.
