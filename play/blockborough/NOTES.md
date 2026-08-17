# Blockborough

Controls: tap a palette tool, then tap or drag the 16 by 22 city grid to build. Desktop uses 1-6 for tools, arrows or WASD to move the planner cursor, Space or Enter to build, P to pause, F to change speed, and N to reseed a city. Use SAVE and LOAD with the selected city slot.

Goal: connect homes to roads, power, and a shop within five tiles. Parks raise desirability and overloaded roads slow growth. Reach the ten population and service milestones from First district to Blockborough, including the original 500, 2000, and 5000 resident goals.

## Developer notes

### Preserved prototype behaviors

- The 16 by 22 grid, seeded water and hills, guaranteed buildable core, starter road, six tools, costs, and 2200 starting funds remain tuned from the archived prototype.
- The six second month tick remains the economy clock. Homes grow through three density tiers when they have road access, power, and shop service. Traffic load, desirability, shop capacity, income, upkeep, relief, and the 5000 population finish are preserved.
- Terrain remains honest and disaster-free. There are no countdowns, artificial threats, or timers that remove player progress.
- Session persistence is rebuilt through GGKit guarded saves with three city slots and validated schema data. The first-district tutorial is interactive and can be skipped.

### Audio inventory

- Two looping ambient music layers: city-dawn and city-rush. The busier layer crossfades in as the city grows.
- Eight distinct GGKit SFX: tap, error, milestone, place, menu, raze, toggle, and month pulse. Audio is shipped as MP3 only, with music lazy-loaded after the first interaction.

### Content inventory

- One seeded pocket city with ten population and service milestones, a first-run five-step district tutorial, a two-speed month clock, three save slots, and a 20 minute or longer relaxed progression arc.
- The city has readable road traffic, power-flow overlays, water motion, density tiers, five build types, a raze tool, three population charters, and an endless sandbox after 5000 residents.

### Known limitations

- The shipped city art uses a compact CC0 tile sheet plus an original isometric atlas so the payload stays below the mobile budget. The board supports 1.0x to 2.25x pinch zoom with two-finger pan and a full-city minimap overview.
- Music is intentionally short and looped to keep each file below the per-file payload limit.

## Fix round 1

### implemented

- Touch placement and pointer ownership -> normalize Phaser touch identity with `pointer.identifier`, claim only one active pointer, and clear ownership on pause, restart, cancel, and matching release.
- Power flow and isolated plants -> mark reachable road components as powered and allocate plant capacity per connected component.
- Traffic graph -> prebuild four-neighbor road edges and move traffic only across real road edges with continuous load colors.
- Shop capacity -> require `current demand + home demand <= shop capacity` before servicing a home.
- Save and resume determinism -> reset the scene accumulator on load, new city, pause, resume, visibility changes, and restart; clamp active-frame delta and remove the unused simulation accumulator.
- Save validation -> reject invalid ranges, growth overflow, impossible population/funds/month/goal values, all-grass cities, and malformed arrays.
- Milestones -> add service predicates for roads, parks, power, shops, density, and traffic; use the shared simulation predicates for achievement unlocks and HUD progress.
- Placement feedback -> add `Sim.canPlace()` reasons, occupied-tile protection, normal insufficient-funds feedback, grass-raze no-op handling, a core-city guard, cost labels, and tinted ghost previews.
- Drag painting -> rasterize the full grid line between pointer samples and commit the batch once.
- Tutorial persistence -> preserve the tutorial step in the city save and preserve global completion when reseeding a city.
- Premium city surface -> replace the flat building and terrain rendering with the original atlas in `assets/blockborough-atlas.svg`, including terrain transitions, three building tiers, and four planner frames.
- Atmosphere and motion -> add authored title art, atlas-based tier silhouettes, water and park motion, powered window glow, construction three-beat FX, milestone focus choreography, root-container shake, and reduced-motion gating.
- Mobile view and UX -> add pinch zoom and two-finger pan, overview reset, a minimap, readable overlay legend, larger labels, authored CSS tool icons, themed loading/title/settings/confirmation surfaces, and fullscreen access.
- Audio gate -> remove source-format references from shipped documentation and expose persistent music and SFX volume controls through GGKit audio preferences.
- Cache and payload -> bump the service-worker version, cache the atlas files, and keep the title payload at about 880 KB with no file above 400 KB.

### disputed

- None.

### deferred

- HTTPS deployment, offline reload proof, six-gate evidence capture, and a scripted 20-minute progression trace -> prohibited by the no-deploy instruction and the evidence files are outside the allowed work area; the local browser backend was unavailable for a live capture.
- Central asset-ledger `Used by` ownership edits -> `play/_assets/LEDGER.md` is outside the allowed work area; the new original atlas is documented in this title's `LICENSES.md`.
- Independent water, traffic, power, park, and population ambience buses -> GGKit is the sole audio implementation and changing `/play/_shared/ggkit.js` is outside scope.

## Retina pass 2026-08-16

- Before ratio: 1.00x source baseline at DPR 3. After ratio: 3.00x configured
  through `GGKit.hiDpi.resize(game, cssW, cssH)`; a live canvas ratio could
  not be measured because Chrome aborted in this sandbox and the private HTTP
  bind was denied.
- Recipe: applied Phaser Scale.RESIZE hi-DPI sizing at boot, resize,
  orientation-change, and visibility events, while preserving the title's
  pixel-art and rounded-pixel settings. The HUD is DOM-based, so no Phaser
  text resolution override was needed.
- Factor cap: none beyond the GGKit maximum of 3. No title-specific cap was
  needed.
- Could not complete the live DPR 3 gameplay screenshot or layout check.
  Existing generated textures were left at their authored sizes because a
  frame-unit migration to `GGKit.hiDpi.canvas(...)` could not be live-verified.

## Retina pass 2

- Measured canvas ratio at DPR 3: unavailable. `retina_audit.mjs` could not start because its private port was rejected with `listen EPERM`; the in-app browser was unavailable too. Static configuration expects 3.00x through `config.ggDpr` at DPR 3.
- Converted the parented `Scale.RESIZE` setup to `Scale.NONE` through `GGKit.hiDpi.phaser()`. Board, minimap, line widths, and fixed geometry now use the configured density factor while the existing DOM controls and authored textures remain unchanged.
- Gameplay screenshot, render-loop probe, and placement input resolution could not be live-verified because no browser or private local server was available.

## Release gate repair

2026-08-16, mobile release gate lane.

### Boot: uncaught TypeError from `syncHiDpi`

The title threw exactly one uncaught error on load:

    TypeError: Cannot set properties of undefined (setting 'width')
      at resize (/play/_shared/phaser.min.js)
      at syncHiDpi (game.js)

`syncHiDpi()` was called synchronously on the line after `new Phaser.Game(config)`.
`game.scale` exists from construction but its internals do not until the game
boots, so `game.scale.resize()` reached into an undefined canvas and threw. This
is the same failure `GGKit.hiDpi.resize()` documents in its header comment; this
title had its own copy of the helper and never picked up the guard.

Fix (in this title's `game.js` only): the resize body now runs inside an `apply`
closure that is invoked immediately if `game.isBooted`, and otherwise deferred to
`game.events.once('ready')`, wrapped in try/catch so a resize can never take the
title down. Behaviour once booted is unchanged.

Verified with `node release_gate.mjs http://localhost:8347 1 <slug>` from
/Users/lucille/ue-port-studio/aaa/harness, serially at concurrency 1, against
`python3 -m http.server 8347 --directory /Users/lucille/greenguard-usa-web`.

Gate verdict: **READY** (all checks pass).
