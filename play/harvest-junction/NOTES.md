Drag a seed into a plot, tap a planted plot to wake it, then drag the ready crop to the pantry.
Tap factories to queue then finish each recipe; drag pantry goods onto the rail car.
Use Arrow keys to move focus and Space to act; R restarts the run, and T opens Town.
Complete three rail orders; spend coins on eight permanent town buildings.

## AAA rebuild

Implemented:

- Rebuilt the archive as a Phaser 3 portrait title using /play/_shared/phaser.min.js and GGKit as the sole lifecycle, input, save, audio, pause, restart, and PWA layer.
- Added drag seed to plot, tap to wake, drag ready crop to pantry, tap to queue then tap to finish factory recipes, drag pantry goods to the rail car, and tap the car to dispatch.
- Added fixed-step simulation with a bounded catch-up cap, no wait timers, pooled particles, baked play/town chrome, guarded registries, setTextIfChanged, reduced-motion gating, safe-area CSS, keyboard parity, and window.__hj state plus forceOrder/forceTown switches.
- Added single-lane UI feedback: fading tutorial strip, one corner chip for live events, and center banners only for order completion, free play, medals, and building unlocks.
- Added procedural colorblind-safe crop, good, factory, town, rail, and particle visuals plus GGKit-bus plant rustle, harvest chime, factory clank, UI tick, and train departure horn sounds.
- Added manifest, icon.png, icon512.png, favicon.ico, service worker with complete existing-file precache, and local license/provenance notes.

Order table:

| Order | Farm identity | Factory mix | Rail goods | Reward |
|---|---|---|---|---|
| 1. Sunrise Picnic | Starter Field | Grain Mill, Dairy Cart, Berry Kettle | Bread 1, Cheese 1, Jam 1 | 14 coins + generous seeds |
| 2. Market Day | Orchard Row | Grain Mill, Stone Oven, Berry Kettle | Bread 1, Jam 1, Sunroot 1 | 17 coins + generous seeds |
| 3. Lantern Supper | Junction Depot finale | Grain Mill, Stone Oven, Dairy Cart, Berry Kettle | Bread 2, Cheese 1, Jam 1 | 22 coins + generous seeds |
| Free Play | Factory Row, Orchard Row, Junction Depot rotation | Authored mix per layout | Rotating four and five bay orders | 18 to 24 coins + seeds |

Building chain:

| # | Building | Cost | Unlock | Permanent effect |
|---|---|---:|---:|---|
| 1 | Seed Shed | 2 | Start | +1 plot |
| 2 | Orchard Row | 3 | Order 1 + prior build | +1 plot |
| 3 | Loading Spur | 4 | Order 1 + prior build | +1 rail bay |
| 4 | Mill Annex | 5 | Order 2 + prior build | +1 queue slot |
| 5 | Creamery Bench | 6 | Order 2 + prior build | Flow bonus |
| 6 | Kettle House | 7 | Order 3 + prior build | +1 plot |
| 7 | Market Plaza | 8 | Order 3 + prior build | +2 coins per order |
| 8 | Junction Tower | 10 | Order 3 + prior build | Gold medal boost |

Medals grade order speed, factory efficiency, and no-idle-plots as bronze, silver, or gold, with the Junction Tower able to lift a near-perfect result to gold.

Deferred:

- Real browser boot, interactive drag verification, screenshot QA, and 4x-throttle timing could not run because no browser was available and the sandbox denied binding a local HTTP server. Node syntax checks, fallback boot smoke, manifest validation, precache existence validation, payload limits, and source-contract checks passed.

## Fix round 1

Fixed:

- CRITICAL 1: added a 20 px farm tilemap, collision map, walkable player, idle and walk frames, and field rendering details.
- CRITICAL 2: pointer sessions now use the DOM pointerId consistently for down, move, up, outside, and cancel.
- CRITICAL 3: added the Stone Oven to Starter Field so Sunrise Picnic can produce Bread.
- CRITICAL 4: added crop-specific fixed-step growth, sprout, mature, wilted, and harvest states.
- CRITICAL 5: added water, health decay, watering input, wilt handling, water bars, and persisted crop fields.
- CRITICAL 6: added day and season progression, season growth rates, palette tinting, transition feedback, and saved season state.
- CRITICAL 7: added authored pixel-grid textures, crop-stage art, player frames, tile transitions, season tinting, and nearest-neighbor rendering.
- MAJOR 1: added versioned and validated in-progress run snapshots with meaningful-action saves.
- MAJOR 2: split factory Queue and Finish actions, added processing readiness, second-slot support, and Creamery Bench output bonus.
- MAJOR 3: added standard gamepad discovery, button and axis focus controls, action mapping, and disconnect handling.
- MAJOR 4: added farm and town music plus water, crop-ready, and building-chime MP3 assets through GGKit audio buses.
- MAJOR 5: hit stop now skips simulation steps and GGKit shake offsets are applied through the active camera render path.
- MAJOR 6: added an aria-live game state summary and keyboard-focusable semantic Town and Restart controls.
- MAJOR 7: reran node syntax, manifest, precache, payload, per-file, audio-format, and source-contract checks. Interactive browser replay and throttle capture remain unavailable because this environment exposes no browser surface.
- MINOR 1: factory labels are shortened and action text is compacted for the 390 px card width.
- MINOR 2: crop pulse and readiness feedback now affect crop scale, highlight, and audio.
- MINOR 3: reduced-motion media preference gates particles, pulse, rail movement, and season transition motion.
- MINOR 4: fleet metadata is aligned to F3 and the service-worker version is bumped.

Rejected: none. No finding was factually wrong.
