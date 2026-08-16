Swipe anywhere to queue a turn; arrow keys and WASD also work.
Collect every dot to advance into a faster seeded maze.
Power nodes make the quartet flee for 8 seconds; touch them while glowing to score.
Collect orange data shards for bonus points; you have three lives.
Tap the run-ended card or press Enter/Space to restart; best score is saved locally.

## AAA rebuild

Implemented:

- Phaser 3 runtime from `/play/_shared/phaser.min.js`, with GGKit owning pause, visibility, portrait orientation, input, save validation, settings, audio buses, and PWA registration.
- Fixed-step, clamped simulation with buffered two-turn queueing, swipe plus arrow/WASD controls, seeded generation, pooled particles and score popups, reduced-motion gating, and live `window.__mp` probe state.
- Four chaser identities: Vex the ambusher, Orbit the patroller, Drift the random wanderer, and Lock the shortest-path hunter. `forceMaze` and `forceChaserAI` are readable before boot and live during play.
- Runner move, power, and caught presentation states; distinct chaser silhouettes; frightened palette swap with readable 8.0 second countdown and final 2.0 second pulse; generous speed, shield, life, multiplier, power-node, and shard drops.
- Interactive first-run coach for movement, power nodes, fright mode, and shards. The coach is a thin fading strip above the maze and never occupies the playfield center or bottom half.
- Maze clear and medal banners use a 66 percent width glass card with an overshoot entry. Medal scoring combines pellets cleared, maze time, and lives kept.
- Procedural original icons and MP3-only local audio: pellet chomp, power siren, chase stem, fright stem, and catch stinger. No remote assets or harvested pack files ship.

Circuit and maze table:

| Circuit | Maze family | Maze tiers | Identity and shortcut |
|---|---|---:|---|
| 1. Signal Circuit | Classic Warren | 3 | Cross-cut warp, generous grid lanes |
| 2. Orbit Circuit | Spiral Core | 3 | Drop gate through the spiral |
| 3. Quad Circuit | Symmetric Quad-Maze | 3 | Mirror gate between quadrants |
| 4. Tunnel Circuit | Wraparound Tunnel | 3 | Cross-screen teleport tunnel |
| Finale | Prime Maze | 1 | All four chasers use hunter targeting |

Each circuit chains three speed and aggression tiers, unlocks the next circuit after its Maze Run, and inserts a 24 second Shard Rush between circuits. `window.__mp.state.mode` reports `tutorial`, `run`, `shardRush`, `finale`, `between`, or `gameover`.

Deferred:

- In-app browser visual smoke test could not run because no browser instance was available in this session. A Node stub exercised scene creation, one fixed-step update, live maze and AI switches, syntax checks, precache existence, and payload limits. A local HTTP server was also blocked by the sandbox, so no deployment or network verification was attempted.

## Fix round 1

Fixed:

- CRITICAL maze completion: added deterministic flood-fill repair before pellet and pickup placement. Classic, spiral, quad, wrap, and Prime passed 600 seeded samples each with zero disconnected open cells.
- CRITICAL primitive-only art: added original local SVG textures with gradients, highlights, shadows, glows, and layered sprite rendering for floors, walls, pickups, runner states, and chasers.
- CRITICAL character animation: added explicit idle, move, power, frightened, and caught states with timed bobbing and state-specific authored textures.
- MAJOR FX budget: split effects into six named pools for movement, power, catches, damage, shortcuts, and Shard Rush, with oldest-particle replacement and priority popup replacement.
- MAJOR juice and damage feedback: wired `kit.juice.frame()` into the update loop, applied shake offsets and hit-stop, and added a red damage vignette. Chaser catches now receive juice feedback too.
- MAJOR audio depth: added original MP3 cues for turn, multiplier, shield, life, gate, danger warning, and completion, plus the danger stem. The title now registers 13 MP3 assets and precaches them.
- MAJOR intensity music: added danger-stem selection for finale, Shard Rush, one-life danger, and nearby chasers, with crossfades and a warning cue.
- MAJOR audio restart: reset the audio wake state and stop the prior track on every new session.
- MAJOR tutorial flow: fright teaching now remains visible for a timed beat after the power-node interaction instead of advancing in the same callback.
- MAJOR maze-clear damage: stop simulation immediately after a maze transitions to `between` or `gameover`, and gate hit processing to active gameplay modes.
- MAJOR run-ended action: added a real reboot action card with a button, tap handling, and Enter/Space support.
- MAJOR UX shell: added GGKit loader progress, title menu, highest-unlocked circuit resume, 1 to 4 circuit selection, GGKit pause, fullscreen, and native keyboard-accessible shell buttons.
- MAJOR settings: added persistent GGKit music and SFX range controls alongside the existing mute and shake controls.
- MAJOR progression: persisted unlocks are now used on the title menu, with selectable unlocked circuits.
- MAJOR aggression: circuit aggression now changes AI decision cadence, ambusher look-ahead, and high-tier wanderer targeting.
- MAJOR finale: added a dedicated Prime Warren generator and load path while preserving explicit force-maze probes.
- MAJOR quad gate: corrected the mirror gate to use the row midpoint for its Y coordinate.
- MAJOR horde readability: frightened chasers keep role-colored badges and distinct state textures at small sizes.
- MINOR reduced motion: particle emission, popup movement, bobbing, pulse, and caught blinking are gated when reduced motion is enabled.
- MINOR gamepad: added read-only `navigator.getGamepads()` direction and action polling.
- MINOR keyboard settings: settings is a native button using its click activation path, so Enter and Space work through browser keyboard activation.
- MINOR save validation: scores are now safe, bounded integers and profile versions are constrained.
- MINOR Shard Rush: inert pellets are hidden during shard-only play.
- MINOR boosts: added letter or symbol badges and live HUD timers for speed, shield, multiplier, and rush state.
- MINOR rotation and paths: removed the duplicate rotate overlay and changed shared engine paths to absolute `/play/_shared/` URLs.
- Service worker: bumped `VERSION` to `aaa-2026-08-10-02` and precached every new SVG and MP3 asset.

Rejected or deferred:

- MAJOR ship evidence: not a code defect. The requested worktree-only scope prevents writing the external `review_evidence/aaa/mazerunner-prime/` artifact, and no browser surface was available for a fresh capture. No deploy or external evidence file was touched.
- MINOR coach-banner overwrite: factually wrong for the current source. `startSession()` loads the maze first and sets the onboarding banner afterward, so the coach banner is not overwritten. The new title flow also keeps the onboarding banner behind the title action.

## UI declutter

- Cut the always-on fleet brand, circuit tagline, bottom control watermark, verbose HUD labels, and per-pellet score popups during active play.
- Shrunk the persistent HUD to icon/value meters; boost and rush state now use compact icon timers.
- Replaced stacked world popups with one queued corner chip (14px text, 0.8s hold); boundary banners are smaller and only used for clear/rush/finale transitions.
- Moved circuit/maze context into the compact HUD and moved boundary/result detail out of active play into clear banners and the run-end card; tutorial copy is now one top-edge line with a three-second fade.

## Retina pass 2026-08-16

- Target 390x844 CSS at DPR 3. Before ratio: 1.00x CSS-sized RESIZE baseline. After target: 3.00x, 1170/390, via `GGKit.hiDpi.resize`. Live canvas read was unavailable because no browser surface or private local listener was available.
- Recipe: `Phaser.Scale.RESIZE`, `GGKit.renderDefaults`, and recursive DPR-matched Phaser text. No factor cap; gameplay sprites already use explicit display sizes.
- Gameplay screenshot and runtime backing-store measurement remain deferred. No palette change was made because the retina law identifies density, not colour depth, as the defect.
