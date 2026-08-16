Cube Cascade: move a falling colored cube into a column, drop it, and match three.
Swipe left or right to aim, swipe down to drop, or use the labeled controls.
Hold a color to set up a cascade; full rows are bonus clears.
Timed rounds, surge warnings, column overflow, three lives, and a persistent best score create pressure.
Desktop: use A/D or arrow keys to aim, Space or Enter to drop, and H to hold.

## AAA rebuild

### Implemented

- Rebuilt the game core with a fixed 60 Hz single-step simulation, GGKit lifecycle/input/save/audio/juice ownership, bounded FX pools, reduced-motion gating, baked background/cube/HUD chrome, and guarded dynamic lookups.
- Added falling color cubes, six to eight stack columns, a four-cube preview queue, hold slot, timed rounds, full-row clears, overflow penalties, surge pressure, combo scoring, and monotonic level scaling.
- Added accessible swipe, keyboard, gamepad, canvas button, and DOM button input paths with safe-area-aware HUD and explicit pause/resume.
- Added authored skins, medal tiers, unlock chain, interactive first-run tutorial, round-clear/game-over banners, local MP3 SFX and music stems on GGKit audio buses, PWA shell, manifest, icons, and service-worker precache.

### Pyramid table

| Levels | Pyramid identity | Board | Pressure | Signature set-piece |
|---|---|---:|---|---|
| 1-2 | Dawn Quarry | 6 x 8 | Calm timer | First Drop |
| 3-4 | Rim Forge | 6 x 8 | Surge warnings | Rim Pressure |
| 5-6 | Coil Marsh | 7 x 9 | Faster drops | Chain Reaction |
| 7-8 | Mischief Spire | 7 x 9 | Full-row pressure | Stack Tangle |
| 9+ | Ember Vault | 8 x 10 | Fast drops and surge cadence | Vault Pulse |

### Level table

| Rule | Levels |
|---|---|
| Falling loop | Aim a color-bearing cube, drop it into a stack, and match groups of three |
| Line clears | Full rows clear for a bonus and feed the same gravity resolver |
| Pressure | Round timer, near-full column warnings, surge cubes, and overflow penalties |
| Lives | Three lives; overflow and surge contact reset the stack and mark the run as hit |
| Medal tiers | Crown = fast no-hit clear, Gold = no-hit clear, Silver = clear, Bronze = recovery clear |
| Skin unlock chain | Clear round N to unlock the next authored skin in the five-skin cycle |

### Deferred

- Real browser boot and visual probe could not run because the browser connector was unavailable and the sandbox blocked a local HTTP listener. `node --check` passed for every changed JavaScript file, JSON parsing passed, all service-worker precache paths exist, and total payload is 143,127 bytes.
- A curated CC0 audio-pack replacement remains deferred because `/play/_assets/` contains the LEDGER and art bibles but no audio files. This build ships procedural local MP3 cues and music stems only and does not hotlink or borrow another title's assets.

## Fix round 1

### Fixed

- CRITICAL 1: Rebuilt the core around falling cubes, stack columns, a four-cube preview queue, timed rounds, overflow penalties, and game-over lives.
- CRITICAL 2: Added color-group matching, full-row line clears, gravity resolution, chained cascades, combo multipliers, and cascade scoring.
- CRITICAL 3: Board cell spacing and cube display size are derived from the live board dimensions and viewport, including the 390px portrait target.
- CRITICAL 4: Added pooled drop, match, clear, and combo FX families plus drop, settle, clear-pulse, rotation, and cursor animation states.
- CRITICAL 5: Replaced the hopper greybox loop with layered authored background, tile, cube, cursor, warning, FX, and HUD treatment.
- MAJOR 1: Pointer identity now uses the browser pointer ID consistently and converts GGKit client coordinates into game coordinates.
- MAJOR 2: Banner time advances independently of game mode and level starts clear stale banners.
- MAJOR 3: Space, Enter, and R retry through GGKit key state after a run over.
- MAJOR 4: Added dead-zone gamepad polling with directional repeat, drop, hold, pause, and latch clearing.
- MAJOR 5: Difficulty is monotonic: board width, row count, drop speed, timer pressure, and surge cadence scale by level without returning to a training lane.
- MAJOR 6: Added eight local MP3 SFX plus base and danger MP3 music stems with GGKit music crossfade.
- MAJOR 7: First-run tutorial now teaches aim, drop, color matches, falling columns, hold, and cascade setup.
- MAJOR 8: Added a live danger strip, column warning marker, surge callouts, impact particles, and a red damage vignette.
- MAJOR 9: Selected skins are persisted, cycled from an interactive selector, used in play, and unlocked on clear.
- MAJOR 10: Save validation now rejects unknown IDs, duplicate or malformed skin lists, fractional or unsafe scores, invalid medal objects, and unknown keys.
- MAJOR 11: Safe-area CSS variables feed board, HUD, controls, footer, and pause overlay layout.
- MINOR 1: All score changes use one persistence-aware score helper.
- MINOR 2: Reduced motion gates bobbing, rotation, cursor pulse, banner scale, and shake-dependent damage intensity.
- MINOR 3: Commands received during resolution are buffered and consumed after the next cube spawns.
- MINOR 5: Pause is labeled in the HUD and has a real RESUME overlay action.
- MINOR 6: Added labeled DOM Left, Drop, Right, and Hold controls alongside the canvas controls.

### Rejected as obsolete

- MINOR 4: The cited edge-disc knockback path no longer exists because the obsolete hopper hazard model was replaced. Every remaining overflow and surge contact calls `loseLife()`, marks the run as hit, and invalidates the no-hit medal.

## Boot repair

- Fixed the solid-black boot/play frame by forcing Phaser's Canvas renderer for the generated-texture view; the simulation, BootScene → PlayScene handoff, first `renderAll()`, and fixed-step update path remain intact.
- Bumped the service-worker cache version to `aaa-20260810-4` so the repaired renderer configuration is fetched.
- Browser capture was unavailable in this session; the real boot chain was executed through the first render/update with a Phaser/GGKit stub, and `node --check` follows for every changed JavaScript file.

## UI declutter

- Cut the always-on title, tagline, theme/mode description, footer instructions, danger paragraph, repeated HUD labels, and visible duplicate DOM control row.
- Shrunk play HUD to round, score, timer meter, lives icons, preview cubes, combo state, and a skin swatch; danger now uses the meter color and hazard marker.
- Moved event text from the center to one queued corner chip with short copy, 14px text, and a maximum 1.0s hold; removed repetitive move and drop-charge callouts.
- Converted tutorial copy to one thin top-edge line with a three-second fade and kept center banners only at round boundaries; reduced boundary panel size.

## Retina pass 2026-08-16

- Before ratio: 1.00x source baseline at DPR 3. After ratio: 3.00x configured
  through `GGKit.hiDpi.resize(game, cssW, cssH)`; a live canvas ratio could
  not be measured because Chrome aborted in this sandbox and the private HTTP
  bind was denied.
- Recipe: applied Phaser Scale.RESIZE hi-DPI sizing at boot, resize,
  orientation-change, and visibility events. Applied `GGKit.renderDefaults`
  and `resolution: GGKit.hiDpi.dpr()` to Phaser text. The Canvas renderer and
  generated-texture path were retained.
- Factor cap: none beyond the GGKit maximum of 3. No title-specific cap was
  needed.
- Could not complete the live DPR 3 gameplay screenshot or layout check.
  Existing generated textures were left at their authored sizes because a
  frame-unit migration to `GGKit.hiDpi.canvas(...)` could not be live-verified.

## Retina pass 2

- Measured canvas ratio at DPR 3: unavailable. `retina_audit.mjs` could not start because its private port was rejected with `listen EPERM`; the in-app browser was unavailable too. Static configuration expects 3.00x through `config.ggDpr` at DPR 3.
- Converted the parented `Scale.RESIZE` setup to `Scale.NONE` through `GGKit.hiDpi.phaser()`. HUD text and fixed control geometry are scaled from the configured factor, while the Canvas renderer, generated textures, render defaults, and text resolution were retained.
- Gameplay screenshot, render-loop probe, and drop/input resolution could not be live-verified because no browser or private local server was available.
