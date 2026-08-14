Move with the left floating stick or WASD / arrow keys.
ATTACK with the slash button, Space, Enter, or mouse click.
DASH with the dash button or Shift; dash grants brief i-frames.
Clear each room, collect the key detours, and reach the green gate.
The daily seed is fixed for comparable runs; press P for a fresh practice seed.

## AAA rebuild

Implemented: Phaser 3 portrait rebuild with GGKit lifecycle, pointer identity,
fixed-step simulation, guarded save profile, audio buses, reduced-motion gating,
PWA registration, pooled actor/pickup/projectile/VFX views, original procedural
hero and enemy sheets with idle/run/attack/dash/hurt states, attack-lock facing,
dash i-frames with trail and cooldown telegraph, hit-stop, knockback, generous
key/potion/dash-charge drops, animated room-clear gates, key-detour shortcuts,
daily/practice floor time attack, four-floor gauntlet escalation, bronze/silver/
gold medal thresholds, unlock chain, floor-clear and gauntlet banners, and the
`window.__dd` state plus `forceFloor` and `forceMode` probe switches. Torch
glows, dust, hit sparks, dash trails, and an ambient dungeon drone round out
the presentation with reduced-motion gating.

Floor/mode tables:

- Crypt Entry Halls: candlelit stone, lock wing detour, Bell Tomb landmark,
  crypt arch shortcut. Par 01:22.
- Flooded Cistern: rising water pulses, drain detour, Sunken Bell landmark.
  Bronze Crypt unlock. Par 01:32.
- Collapsing Forge: falling slag pulses, slag detour, Last Anvil landmark.
  Silver Cistern unlock. Par 01:44.
- The Deadline Vault: rotating clock wards, clock detour, Deadline Heart
  landmark. Gold Forge unlock. Par 01:58.
- Daily Speedrun: fixed local-calendar seed, selected unlocked floor, ranked
  best time. Practice: fresh seed on every run. Gauntlet: all four floors in
  sequence with escalating enemy and hazard pressure.

Deferred: external leaderboard submission and online daily ranking remain
local-only because this title is offline-first and has no network backend.

## Fix round 1

Fixed:

- CRITICAL deadline mechanic: added per-floor countdowns, warning audio, red urgency HUD, timeout failure, and terminal timeout copy.
- CRITICAL puzzle loop: added authored rune sequences, console interaction, cycling and selection controls, validation, reset hints, solve feedback, and puzzle particles.
- CRITICAL playfield art gate: replaced the flat grid treatment with procedural stone tile transitions, bevels, floor-specific water, forge, and clock motifs, landmarks, rune consoles, obstacle shadows, cracks, and torch masks.
- CRITICAL result layering: raised result text above the shade and button rectangles, and kept banners out of terminal result screens.
- MAJOR state machine: added explore, solve, escape, transition, floor result, failed, and gauntlet complete states.
- MAJOR onboarding: added a first-run skippable tutorial covering touch zones, rune solving, and the escape route.
- MAJOR result Enter flow: Enter now performs the primary result action, including next gauntlet floor and retry paths. Escape and M return to floor select.
- MAJOR lifecycle input clearing: pause, resume, restart, and manual pause clear pointer, keyboard, and gamepad edge state.
- MAJOR gamepad input: added a normalized `kit.input.gamepad()` adapter for movement, attack, dash, use, and pause.
- MAJOR gauntlet keys: reset per-floor counters and label skipped key objectives in the HUD.
- MAJOR enemy HP: normal modes now use base HP, while gauntlet difficulty adds HP without subtracting one.
- MAJOR attack facing: added left-facing flips and directional attack rotation.
- MAJOR room transitions: added a 250 ms fade-through-black transition that gates gameplay input.
- MAJOR audio coverage: added MP3-only step, hurt, secret, UI, danger, danger-sting, and per-floor theme assets with GGKit bus routing and crossfades.
- MAJOR audio lifecycle: stop music on completion, failure, retry, restart, and return to menu.
- MAJOR particle coverage: separated hit, dust, puzzle, and escape visuals with distinct pooled textures.
- MAJOR pickup feedback: added ease-out-back pickup pops, sparkle bursts, and counter tick animation.
- MAJOR reduced motion and settings: pulse and telegraph animation now obeys GGKit juice settings, with settings reachable from menu and run controls.
- MAJOR hazard fairness: added warning windows and gold telegraph states for hazards and ranged attacks.
- MAJOR throttle fairness: speedrun and deadline clocks use wall time, while the fixed-step accumulator retains bounded remainder.
- MINOR locked floor selection: number keys now ignore locked floors.
- MINOR shortcut accounting: skipped key objectives are counted and labeled.
- MINOR collision safety: movement and dash displacement are swept in small substeps with independent axis resolution.
- MINOR spawn safety: enemy, hazard, pickup, key, and puzzle positions are checked against room obstacles and safe areas.
- MINOR damage feedback: damage flash now renders as a reduced-motion-safe overlay.
- MINOR safe area: the page and manual pause panel honor device safe-area insets.
- MINOR mouse controls: playfield pointer clicks now attack, matching the control notes.
- MINOR save validation: daily-best keys now require a registered floor ID.
- Additional fix: corrected procedural hero and enemy texture frame slicing so the generated sprite sheets render from their horizontal atlas positions.

Rejected: none. The pointer-claim and daily-best findings were also hardened even though the existing code already partially handled them.

Validation: `node --check` passed for every JavaScript file, the manifest parses as JSON, all title audio assets are MP3, the service-worker cache version is `aaa-2026-08-10-v3`, and the title payload remains below 2.5 MB with no file above 400 KB.

## Boot repair

Fixed the black first-frame regression by pinning Phaser to its Canvas renderer. The scene's generated room, chrome, hero, enemy, effect, and UI sources are all CanvasTextures/dynamic text; `Phaser.AUTO` could select headless WebGL and present a valid but solid-black surface without a console exception. Boot now reaches the menu render path on the renderer that directly owns those sources, and the service-worker cache was bumped to `aaa-2026-08-10-v3`.

## UI declutter

- Cut the active-play title/mode prose, room-name row, always-on goal and pause hints, center banners, bottom toast, and repeated control words; result screens retain run, floor, medal, best-time, and seed information.
- Collapsed the live HUD to a compact mode/phase line, remaining timer, floor/room meter, key meter, par, and heart/dash icons. Moved status copy into one thin top-edge chip above the playfield.
- Replaced overwriting event text with one queued transient at a time. Room, deadline, shortcut, gate, puzzle, key, pickup, hit, and reset feedback is shortened to a one-line chip capped at 1.0s with a reduced-motion-safe fade.
- Kept tutorial and puzzle information in the same strip: tutorial is one line and fades after about 3s; puzzle progress, controls, and the unlock pattern remain visible when needed.
