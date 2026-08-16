Controls: hold LEFT or RIGHT to rotate and thrust; hold both for a straight main burn.
MAIN or keyboard Space/Enter burns straight; arrows and WASD also work.
Land gently on green REFUEL pads to top up fuel and earn 100 points.
Reach the beacon at the cavern floor; hard contact with walls, crystals, or doors crashes.
Best score is saved locally in the browser.

## AAA rebuild

Implemented:

- Rebuilt the archived prototype as a Phaser 3 portrait title with GGKit as
  the sole lifecycle, input, save, audio, orientation, settings, and restart
  owner. The fixed 60 Hz accumulator never drops elapsed simulation time, so
  a slow device runs in slow motion instead of skipping descent physics.
- Replaced instant-stop movement with gravity, thrust vectors, angular torque,
  angular momentum, damping, fuel burn, slow-fall bubbles, shield charges, and
  a visible `BURN U/S` readout. Fuel canisters, score crystals, shields, and
  slow-fall bubbles are deliberately generous and pooled.
- Added soft bump and hard contact feedback. Pad landings grade as PERFECT,
  CLEAN, SOFT, or ROUGH BUMP using touchdown speed and hull angle, with graded
  refill and score bonuses rather than a pad pass/fail gate. The HUD exposes
  safe and fatal touchdown bands and impact banners report measured speed.
- Added interactive first-run coaching for rotate, thrust, land, and refuel in
  a thin top strip that does not cover the play space. Completion and medal
  beats use a 60 percent width Phaser banner with overshoot and fade timing.
- Added `window.__gw = { state }` boot fallback and live state with `mode`,
  `score`, `fuel`, `depth`, `expedition`, `forceExpedition`, and
  `forceCavern`. Force switches accept expedition indices, keys, and cavern
  family names and are guarded by fallback registries.
- Added original texture-backed lander, hazard, pickup, pad, shortcut, and
  beacon art with idle, thrust, and damaged lander states. Parallax cavern
  silhouettes, six pooled visual FX families, impact feedback, and fixed HUD
  banners keep the action readable. GGKit audio buses are wired to an ambient
  loop, a danger intensity loop, and eleven MP3 cues.

Expedition table:

| Expedition | Descents | Family | Depth | Escalation or rule |
|---|---:|---|---:|---|
| First Descent | 3 | Crystal Grotto | 960 | Tutorial chain, light hazards |
| Mantle Run | 4 | Ember Vent Field | 1120 | Thermal gust density |
| Polar Needle | 4 | Ice Needle Shaft | 1260 | Falling needle density |
| Machine Shaft | 4 | Machine Shaft | 1420 | Moving doors and pistons |
| Fuel-Attack | 3 | Ember Vent Field | 1180 | 68-unit tank, faster burn, time bonus |
| Core Beacon | 3 | Core Beacon Chamber | 1540 | Finale chain with three chambers |

Cavern family table:

| Family | Identity | Signature formation | Shortcut |
|---|---|---|---|
| Crystal Grotto | Prismatic pink and teal rock | Alternating razor crystal clusters | Glowing side chute near 58 percent depth |
| Ember Vent Field | Lava-adjacent ember rock | Thermal vents with lateral gusts | Glowing side chute near 58 percent depth |
| Ice Needle Shaft | Blue ice shelves and drift | Falling ice needles | Glowing side chute near 58 percent depth |
| Machine Shaft | Violet steel ribs and timing bars | Moving doors with piston timing | Glowing side chute near 42 percent depth |
| Core Beacon Chamber | Mint reactor glow | Outer Ring, Flux Chamber, Beacon Heart | Glowing side chute near 52 percent depth |

Unlock chain: First Descent unlocks Mantle Run, then Polar Needle, then
Machine Shaft, Fuel-Attack, and Core Beacon in order. Each descent records a
medal tier from fuel remaining, time, and landing grade.

Deferred:

- Browser visual smoke test and orchestrator probing of `window.__gw` could
  not run because no browser connection was available in this environment.
- The requested 4x-throttle 600-frame performance capture could not run for
  the same reason. Static checks passed: `node --check` for every changed JS
  file, manifest JSON parsing, required shell links, real local media types,
  and service-worker precache existence. Total title payload is 191483 bytes.

## Fix round 1

Fixed:

- CRITICAL pool lifecycle: pools are cleared before cavern generation, so
  hazards and pickups remain active.
- CRITICAL art floor: original local SVG textures now back the lander,
  hazards, pickups, pads, shortcut, and beacon. The lander has idle, thrust,
  and damaged states.
- MAJOR fixed-step timing: elapsed simulation time drains fully without the
  former five-step drop.
- MAJOR retry scoring: crash retries reset the current run score, while
  successful descent advancement preserves it.
- MAJOR gamepad controls: the GGKit input surface now exposes dead-zoned
  axes and buttons, with pause and disconnect-safe snapshots.
- MAJOR ice hazard motion: falling needles move and recycle within the shaft.
- MAJOR shield safety: shield saves grant a timed invulnerability window,
  with hit-stop, shake, blink, and red damage-vignette feedback.
- MAJOR FX: pooled trails, bursts, rings, smoke, and sparks use distinct
  render ramps.
- MAJOR audio: an intensity music layer and additional MP3 pickup, shield,
  shortcut, and warning cues are registered and used through GGKit audio.
- MAJOR banners: Phaser banner graphics and text use a fixed scroll factor.
- MAJOR coaching: refuel coaching advances only after a real fuel increase.
- MINOR force switching: numeric zero is treated as a valid force value.
- MINOR screen shake: impact shake routes through `kit.juice`, so the
  settings toggle applies.
- MINOR music lifecycle: ambient and intensity music fade out on menu,
  crash, and completion screens.
- MINOR best score: score gains and crash exits persist the high score through
  the guarded GGKit save path.

Deferred, not rejected:

- Browser smoke, played-gameplay validation, and the 4x-throttle 600-frame
  capture could not execute because no browser surface was available and the
  local HTTP server could not bind in this environment. Syntax, SVG parsing,
  manifest parsing, media types, precache existence, payload, and file-size
  checks passed. The title payload is 191483 bytes and the largest file is
  65051 bytes.

## UI declutter

- Cut persistent in-world labels for pads, chambers, shortcut, and beacon; their
  art/state remains the signal.
- Collapsed the live HUD to icon-led score, depth, fuel meter, and shield count;
  removed repeated brand, cavern, burn, and touchdown-threshold copy.
- Moved live pad, pickup, bump, shield, and shortcut messages from the center
  banner into one queued corner chip held for 1.0s; kept center banners for
  crash/results boundaries only.
- Shortened tutorial copy to one readable line, capped it at a thin top strip,
  and faded stale guidance after 3s. Preserved safe-area, touch-target, and
  reduced-motion gating.

## Round 2 polish

Visual and FX:

- Added authored per-area strata bands, parallax wall layers, wind streaks,
  low-gravity fields, thruster heat shimmer, engine light cast onto both
  cavern walls, near-floor dust kicks, animated pad beacons, beacon ray and
  ring pulses, objective marker animation, and anticipation/active/recovery
  motion ramps for hazards, pickups, pads, and the lander.
- Expanded impact feedback with pooled debris, dust, smoke, impact shards,
  staged rings, reward-chain escalation, and crash flash timing. Heavy FX are
  reduced under the accessibility reduced-motion preference. FX pools are
  allocated and touched during the GGKit loading screen.
- Added animated menu and results transitions, hand-authored color treatment
  for each cavern family, and a compact objective HUD readout. Static rings
  use hand-tessellated paths instead of Graphics.arc.

Gameplay:

- Expanded the campaign to 24 caverns: six expeditions with four descents
  each. Fuel budgets now vary per cavern, with four upgradeable ship systems:
  tank capacity, thrust, stabilizer control, and an AI navigator that makes
  bounded safe-corridor corrections without overriding player input.
- Added required rescue and cargo objectives, objective scoring, persistent
  rescue and delivery totals, wind fields, low-gravity fields, and authored
  hardest caverns for the final descent of every expedition beside the seeded
  generator.
- Added a real 78-second time-attack descent on the authored Beacon Heart
  cavern, with a saved best time, run count, remaining-time HUD, separate
  clear/fail flow, and score calculation.
- Mission scores award upgrade tokens. The menu now exposes the four upgrade
  tracks and their costs, with level effects applied to the flight model.

Save and PWA:

- Bumped the save version from 3 to 4. Version 3 profiles migrate forward
  with defaults for upgrade tokens, upgrades, time-attack stats, and objective
  totals. Current profiles validate their new fields, and malformed or
  invalid profiles fall back to a fresh profile through GGKit's guarded save
  path without throwing.
- Bumped the service-worker cache version to
  `2026-08-16-aaa-round-2-gravity-depth`; the precache list remains matched to
  the files that exist.
- Updated LICENSES.md to record that Round 2 adds only procedural code art
  and cites `/play/_assets/LEDGER.md`.

Deferred and why:

- A real browser first-frame screenshot, interactive campaign run, and the
  4x CPU-throttle 600-frame capture remain deferred because the supported
  browser surface was unavailable and the sandbox rejected local HTTP server
  binding. The local VM smoke harness did boot the scene, start a descent,
  run a rendered update, and verify `playing` state with a cavern, objective,
  and fuel budget. Syntax, manifest, precache existence, audio-format, file
  size, and payload checks passed.
