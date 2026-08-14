Controls: swipe or drag anywhere to move one cell; hold to repeat.
Desktop: arrows/WASD move; Space or Enter plants a bomb.
Loop: break blocks, reveal boosts, outsmart chasers, clear denser arenas.
Three lives; a blast or chaser contact costs one.
Best score is saved locally in the browser.

## AAA rebuild

### Implemented

- Rebuilt the prototype as a portrait Phaser 3 title using GGKit as the sole
  lifecycle, input, save, audio, pause, settings, and PWA layer.
- Added fixed-step cell movement with WASD, arrows, swipe or drag input,
  short repeat-hold, bomb placement, fuse rings, kick and throw, remote
  detonation, chain propagation, three crumble states, pooled particles,
  screen shake, hit-stop, chaser state silhouettes, and generous drop tables.
- Added validated campaign progress with medal scoring, unlock gating,
  tutorial coaching strip, score attack timer, boss health and finale flow,
  reduced-motion gating, procedural icons, and GGKit-routed MP3 cues.
- Added `manifest.json`, `icon.png`, `icon512.png`, `favicon.png`, and a
  complete cache-first `sw.js` precache with a versioned cache key.
- Added `window.__br.state` with mode, score, lives, arena, chaser count,
  arena family, tier, timing, block count, medal, `forceArena`, and
  `forceChaserTier` switches. The switches are read from the boot fallback and
  the live scene.

### Arena table

| Arena | Family | Density curve | Gimmick | Shortcut | Chaser tier / count |
|---|---|---:|---|---|---|
| 01 | Sunken Plaza | Open, 27% | Movable crates | West service cut | Wander / 2 |
| 02 | Maze Warren | Tight, 54% | One-way gaps | North loop | Hunt / 3 |
| 03 | Symmetrical Vault | Mirror, 48% | Pulse hazards | Center cross | Hunt / 4 |
| 04 | Chaser Nest | Dense, 63% | Nest gates | East flank | Ambush-flank / 5 |
| 05 | Boss Vault | Finale, 70% | Core hazards | Lower bypass | Ambush-flank / boss + 3 |

### Mode table

| Mode | Structure | Clear condition |
|---|---|---|
| Campaign | Five authored or seeded arenas with bronze, silver, and gold medals | Defeat the arena chasers, then unlock the next sector |
| Score Attack | 90-second run that cycles through arena families with time bonuses | Score as much as possible before the timer expires |
| Boss Vault | Finale arena with a multi-hit boss and ambush support | Break the boss vault and defeat the core chaser |

### Deferred

- Browser screenshot and live input smoke test could not run in this
  environment because no browser was available and the sandbox denied a local
  HTTP server bind. `node --check` passed for every changed JavaScript file;
  manifest, icon, audio-format, payload, and service-worker path checks passed.

## Fix round 1

### Fixed

CRITICAL

- Primitive-only presentation: added original SVG textures and layered sprite rendering for the player, chasers, bombs, blocks, crates, drops, and blast cells.
- Single FX pool: added bounded sparks, debris, smoke, and pickup pools with replacement and `fxOverflow` telemetry.
- Missing animation states: added distinct idle, move, hit, hunt, stunned, and death texture states with staged chaser deaths.

MAJOR

- Restart path: implemented `PlayScene.restartRun()` for a complete run reset through GGKit.
- Touch hold repeat: held swipe direction now repeats from the fixed-step simulation without requiring pointer movement.
- Gamepad fallback: added connected-pad D-pad or stick movement and edge-triggered bomb input.
- Touch target sizing: core controls now use at least 48px visual or hit bounds.
- One-way chaser pathing: BFS and direct chaser movement now use direction-aware one-way checks.
- Score Attack timer: sector clears now apply an explicit 8 to 18 second bonus.
- Score Attack progression: bomb, radius, boots, shield, kick, and remote upgrades carry between sectors.
- Tutorial dodge: the first arena now creates a red enemy telegraph, and tutorial completion requires moving clear of it. Taking damage no longer completes the step.
- Audio floor: added original base and heat music stems plus `score_ping`, with contextual heat-layer crossfading.
- Damage feedback: added a timed red damage vignette pulse.
- Death feedback: added hit texture staging, smoke and spark bursts, score popups, and score SFX.

MINOR

- FX overflow: full pools replace the soonest-expiring item and expose a bounded overflow counter.
- Reduced motion: gated nonessential pulsing, bobbing, rotation, banner scaling, popup travel, and particle travel.
- Tutorial movement: the move step advances only after a player cell arrival, not on a blocked attempt.

### Rejected

- None. All supplied CRITICAL, MAJOR, and cheap MINOR findings were addressed.

## UI declutter

- Cut the in-play center banners and combat score popups; score, arena, timer, lives, chaser count, and the B/R/»/◇ upgrade states remain in compact HUD meters/symbols, while completion and run-over details stay on the results card.
- Shrunk pickup, hit, sector, and run-start notices into one queued top-edge chip at 14px with a 1.0s maximum hold and fast fade; only one transient can show at once.
- Removed always-on title, mode, gimmick, shortcut, arena-title, and chaser-tier flavor text from active play.
- Reworked tutorial coaching into one short top strip, 14px single-line copy, with reduced-motion-safe fade to near-transparent after about 3 seconds; cleared it after the tutorial instead of replacing it with flavor text.
- Kept action hit areas at 48px minimum, widened the compact labels for touch readability, moved settings out of the timer cluster, and reserved board space above the bottom thumb/control zone for portrait and landscape layouts.
