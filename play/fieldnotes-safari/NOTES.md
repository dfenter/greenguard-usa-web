Tap a path to walk, tap a rustle to capture, or open FIELD NOTES; arrows and space also work.
Flick from the copper bead toward the pale lead mark when the timing ring nears the target.
The step budget refreshes at morning/evening windows; PRACTICE WALK is always open.
Weather and habitat affect spawns; the dex posts conditions and odds and saves best sizes locally.
Naturalist medal arrives when all 60 original creatures are recorded.

## AAA rebuild

### implemented

- Rebuilt the archived canvas prototype as a portrait Phaser 3 title with GGKit as the sole lifecycle, input, save, audio, PWA, pause, and juice owner.
- Added simulated expedition routes, top-down movement, six authored habitats, day/dusk/night phases, weather-driven spawn rules, deterministic stalking noise and speed, telegraphed flee, ring timing, surfaced odds, bait and lure modifiers, Photo Challenge, field journal, research tasks, and offline stamina refill.
- Added 44px touch controls, safe-area-aware portrait shell, reduced-motion juice gating, two pooled particle systems, generated procedural silhouettes and foliage motion, two music stems, 14 MP3 SFX, manifest, icons, favicon, and exact service-worker precache.
- Added `window.__fs.state` with mode, stage, progress, score, health, spook, odds, modifiers, creature, phase, weather, plus live `forceMode` and `forceStage` switches.

### content tables

- 60 original creatures across River Delta, Cloud Forest, Dune Sea, Moss Hollows, Ember Steppe, and Crater Basin, with rarity, weather, silhouette, note, and three-form evolution metadata.
- 20 authored research tasks covering photograph 3, catch 5, and observe at night goals. Progress unlocks evolved forms, habitats, and longer routes.
- Four escalating routes: Pocket Trail, Long Loop, Ridge Crossing, and Crater Descent.

### deferred

- Real-browser first-frame and hook-driven smoke test could not run because browser discovery returned no available targets and sandboxed local port binding was denied. Static syntax, manifest, precache, payload, content-count, and stubbed Phaser/GGKit boot plus stalking/catch resolution checks passed.

## Retina pass 2026-08-16

- Ratio record: before 1.00x from the pre-pass design-size backing configuration; after 3.00x is the configured DPR3 result from `round(design * GGKit.hiDpi.factor(...))`. A live canvas ratio read was unavailable.
- Recipe: Phaser `Scale.FIT`, design world coordinates retained, `RETINA_FACTOR` applied to scale dimensions and the Safari scene camera zoom. Generated chrome textures use dense Graphics backing and logical display sizes, while every Phaser text object uses the same resolution.
- Factor cap: none. The GGKit factor is used without a cap because this title has no measured need for one.
- Could not do: the browser connector reported no available target, so the required DPR3 canvas ratio read and real gameplay screenshot could not be captured. `node --check` and `git diff --check` pass.
