Move: left stick or WASD. Abilities: right buttons or J/K/L; basic hits auto-fire.
Pick a free hero, clear waves, last-hit for gold, and tap shop cards for upgrades.
Push the lane and break the enemy far tower before the 4:00 clock expires.
Win streaks raise bot heat; hero mastery and wins/losses persist on this device.

## AAA rebuild

### Implemented

- Rebuilt the archived canvas prototype as a Phaser 3 scene with a fixed-step simulation, pooled entities and particles, baked procedural board/HUD textures, responsive hero silhouettes, ability bursts, last-hit windows, tower-range threat strips, tower-break shake, and reduced-motion-aware boundary banners.
- GGKit is the sole lifecycle, input, save, settings, juice, and audio layer. Named local mp3 cues cover selection, confirmation, movement, attacks, hits, kills, warnings, waves, abilities, tower crumble, victory, and defeat.
- `window.__rr = { state, forceMode, forceHero }` is seeded before boot and updated by the live scene. `state` exposes `mode`, `hero`, `gold`, `towerHP`, `clock`, lane, wave, heat, and trial index.
- Generous gold income, free rotation, three upgrade cards, persistent hero mastery, win/loss streaks, ladder progress, and bronze/silver/gold medals for tower speed, win streak, gold efficiency, and Hero Trials are live.

### Mode and lane table

| Mode | Lane identities | Core read |
| --- | --- | --- |
| Main Rumble | Ridgeline Main / Mossfall Causeway | 3v3 waves, last hits, shop push, gust bridge hazard, far tower at 4:00 |
| Hero Trials | Quiet Cut, Lantern Divide, Salt Switchback, Summit Eye | Hand-authored 1v1 duels, escalating tower health, mirror/lantern/salt/rime hazards, medal unlock chain |
| Rumble Ladder | Ember Run, Glass Pass, Black Pine Rise, Ridgeline Summit | Escalating 3v3 bot heat, vent/shard/pine/storm hazards, Summit has the toughest far tower |

### Deferred

- No additional hero roster beyond the six launch heroes, no ranked online service, and no new harvested art pack beyond the original procedural treatment and generated local audio cues.
- Browser smoke testing could not run in this sandbox because the in-app browser was unavailable and local HTTP socket binding was denied. Static syntax, manifest, precache, payload, and fallback-hook checks passed.

## Fix round 1

### Fixed

- CRITICAL 1: Added data-driven high ridge, brush, river cut, checkpoint, and hazard zones with movement, damage, defense, range, and checkpoint-owner modifiers.
- CRITICAL 2: Added a contested checkpoint with capture progress, ownership, HUD state, buffs, and a checkpoint requirement to seal a far-tower win.
- CRITICAL 3: Reworked the arena dressing with faction gradients, ridge silhouettes, river cut, brush pockets, bridge/checkpoint landmarking, and lane-specific hazard decals.
- CRITICAL 4: Added visible move, attack, hurt, command, defeat, wind-up, projectile, and special-resolution animation states for heroes and minions.
- MAJOR 1: Added a six-step first-minute coach flow covering terrain, checkpoint control, target lock, telegraphs, last hits, shop use, and the push condition, plus a Training Ridge entry point.
- MAJOR 2: Initialized the wave timer after the opening wave so the first scheduled wave is not duplicated.
- MAJOR 3: Implemented hook pull and stun, dash, line cleave, delayed burst, spin, shield/heal, and pooled projectile ability semantics.
- MAJOR 4: Bot AI now selects all three ability slots with role-aware health and cooldown checks.
- MAJOR 5: Added touch target selection, target lock rings, tower targeting, directional player targeting, and offensive ability targeting for towers.
- MAJOR 6: Last-hit selection is prioritized before locked or nearest targets, with lethal marking and +35G last-hit rewards; passive gold income was removed.
- MAJOR 7: Capped streak heat at 24% and exposed the current bot bonus in the HUD.
- MAJOR 8: Replaced the one-step accumulator clamp with a fixed-step catch-up loop that retains elapsed time.
- MAJOR 9: Consumed `kit.juice.frame()` every frame, applies screen shake through the scene camera, and honors hit-stop freeze state.
- MAJOR 10: Replaced the shared particle list with four persistent bounded pools: dust, projectile, wave, and terrain.
- MAJOR 11: Added the original `ridge-bed.mp3` music bed plus danger warnings and existing victory/defeat layers through GGKit audio.
- MAJOR 12: Invoked `kit.registerPWA()` during boot.
- MAJOR 13: Added GGKit loader show, progress, audio preload, and hide calls.
- MAJOR 14: Added gamepad stick and ability-button input behind the GGKit input facade.
- MAJOR 15: Removed manual GGKit pointer-map seeding, mutation, and deletion; Phaser events now consume the GGKit-owned pointer identity map.
- MAJOR 16: Added simulation for mirror, lantern, salt, rime, vents, shards, pines, gust, and storm hazards, plus the tenth authored Training Ridge lane.
- MAJOR 17: Documented provenance for every shipped MP3, including the synthesized music bed, and documented that no harvested pack files are used.
- MAJOR 18: Added orientation-agnostic compact FIT styling for 390px viewports while preserving the fixed virtual arena.
- MINOR 1: Restart and pointer clearing now reset the ability key latch.
- MINOR 2: Movement audio fires on a bounded cadence and cancel audio fires on unavailable ability attempts.

### Rejected

- None. The review findings were treated as actionable; no finding was rejected.

## Retina pass 2026-08-16

- Audit profile: CSS viewport 390x844 at DPR 3. Measured pre-pass backing-store ratio: 2.46x from the 960x540 design canvas letterboxed into the portrait viewport. FIT scale math after the pass measures 1170x658 against the 390x219.375 CSS canvas, a 3.00x ratio.
- Recipe: `GGKit.hiDpi.factor(960, 540)`, dense FIT scale dimensions, `GGKit.renderDefaults`, and `this.cameras.main.setZoom(f)` in RumbleScene. Text resolution uses the same factor.
- Factor cap: none. The native factor is 1.21875 for this letterboxed viewport, below GGKit's normal maximum of 3, so no additional cap was applied.
- Could not complete live headless canvas readback or a gameplay screenshot because no browser backend was available in this environment. `node --check` passed.
