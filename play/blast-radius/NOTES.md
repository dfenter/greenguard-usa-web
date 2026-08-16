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

## Round 2 polish

### Presentation

- Every visual is now baked procedurally into canvas textures at boot, before
  any sprite is constructed against them, and drawn from pooled sprites. The
  old flat Graphics board loop (one `fillRect` per cell per frame, 143 cells)
  is gone: the arena floor, structural walls, one-way gates, key light,
  vignette and grain are baked once per arena into a single board texture and
  drawn as one image.
- Seven per-arena tile themes (Sunken Plaza, Maze Warren, Symmetrical Vault,
  Chaser Nest, Live Circuit, Ash Foundry, Core Vault). Each carries its own
  floor pair, grout, decor motif (tile, weave, rivet, web, trace, ember), wall
  and block palette and glow colour, so the six campaign families read apart
  at a glance.
- Structural walls and destructible blocks are now unmistakable: walls are
  dark, flush, diagonally hatched and riveted; blocks are raised, rim lit and
  lit across the top face, and crack through three authored stages plus an
  armoured variant.
- Bomb fuse: a travelling fuse spark plus a 17 frame countdown ring baked
  frame by frame (hand tessellated, because `Graphics.arc` walks the sweep in
  0.01 rad steps every frame). The ring runs teal, then amber, then red, and
  the body pulse accelerates with the fuse.
- Blasts are multi stage: a core flash, tapered arms, soft flame tips at the
  reach limit, an expanding shockwave ring, spark and smoke bursts and shake.
  Chains stack shake and hit-stop.
- Block destruction chunks: weighted shards in the theme's own colours with
  gravity, tumble and settle, plus smoke and a crunch cue.
- Power-up pickups shimmer: bob, rotate, scale-pulse, an additive glow halo
  and an occasional sparkle emission. Nine drop types each have a baked gem
  with its own glyph.
- Actors: the player has idle, move, plant (anticipation crouch before a
  bomb) and hit states plus a breathing idle, a landing shadow and a shield
  halo. Each bot personality has its own silhouette (blob, wedge, kite,
  crate, shield, spike, crown) with idle, hunt, alert (anticipation) and hurt
  states, plus a death recovery scale-and-fade.
- Screen transitions are animated. Title and play both fade in from a curtain
  and fade out before any `scene.start`, so no screen change is a hard cut.
  Result cards spring in and medals settle with an elastic rotate.
- Reward beats escalate: an arena clear fires a staged celebration whose burst
  count, shake and pitch climb with the medal earned, and a duel win uses the
  gold tier.
- Reduced motion gates every heavy effect: particle travel, bobbing, rotation,
  breathing, screen shake, hit-stop, curtain duration and card springs all
  collapse when the accessibility toggle is off, while readability is kept.

### Presentation delta (owner note, high resolution / colour depth)

Issued mid-lane; handled specifically as follows.

- The canvas backing store is now sized in DEVICE pixels and scaled back down
  in CSS: `scale.mode = NONE`, `width = innerWidth * dpr`, `zoom = 1 / dpr`,
  with an explicit CSS size on the canvas element. The removed-after-3.16
  `resolution` config key is NOT used. Verified, not assumed: at a simulated
  dpr of 3 on a 390x844 viewport, `canvas.width` reads 1170 and
  `canvas.height` 2532, with a 390px CSS width.
- Every baked texture rasterises at that same device scale. `bakeCanvas`
  allocates `w * dpr` by `h * dpr` and applies `ctx.scale(dpr, dpr)` so the
  drawing code stays in logical units while the backing store is dense. No
  texture is a 1x bake stretched up.
- All Phaser Text objects carry `resolution: dpr`, so glyphs rasterise at
  device density instead of being upscaled by the camera zoom.
- Colour depth: flat fills were removed. Floor tiles get per-tile hue jitter
  plus a vertical gradient; the board gets a directional key light, a radial
  vignette and a grain pass; the sky backdrops are gradient plus three
  coloured light pools, star dust, and a full per-pixel dither; cards, plates
  and buttons are gradient with rim and grain. Measured distinct colours in a
  real frame at 4bpc: title 1518, mid-campaign gameplay 2032 to 2279 (the
  pre-pass build measured 1444).

### Gameplay

- Campaign is 24 arenas across the seven themes, boss arena every sixth, with
  authored titles, per-arena density, medal thresholds and bot rosters.
- Ten modifiers, zero to three per arena, all real systems: HASTE, SWARM,
  JAMMER (remote disabled), BRITTLE, ARMORED (blocks take two hits), QUAKE
  (tremors open temporary vents), SCARCE, CRUSH (early squeeze), MAGNET
  (bombs creep toward bots), SCAVENGER (bots take power-ups).
- Bot personalities are genuinely different: DRIFTER, HUNTER, FLANKER,
  SAPPER, WARDEN, SPRINTER, DUELIST and the OVERLORD boss, each with its own
  step delay, chase weight, bomb appetite, fear, greed and hit points.
- The AI now plays. A danger map paints every live bomb's projected cross with
  the time left on its fuse, and bots use it to refuse a step into a cell that
  is about to detonate, to flee a cell they are standing in, to judge whether
  a bomb they place leaves them an escape, and to contest power-up drops.
  Bomb-laying classes commit to clearing their own cross until it goes off.
- Power-up set with counters: BOMB, BLAST, SPEED, SHIELD, POINTS, LIFE, KICK,
  REMOTE and the new PIERCE (blast carries through N destructible blocks).
  Counters are real: JAMMER kills remote, ARMORED soaks pierce and blast,
  crates and walls stop kicks, SCAVENGER lets bots take radius, speed and
  extra hit points off the floor.
- Sudden-death compression: past a per-arena time limit the arena seals inward
  along a spiral, one telegraphed cell at a time, crushing blocks, crates,
  drops, bombs, bots and the player alike. CRUSH starts it early; duel starts
  it at half time.
- Duel mode: the player against three DUELIST bots from the four corners,
  one life each, best of three rounds, with a live round scoreboard and the
  squeeze on. Bots bomb each other as readily as the player.
- Score attack keeps its 90 second run, its carry-over loadout and its time
  bonuses, now cycling the whole 24 arena set.

### Save migration

- Save version bumped 1 to 2. The kit validator accepts either shell, so a
  version 1 profile is read rather than dropped, then migrated in game code:
  medals and best times are re-validated key by key against the 24 arena
  range, `tutorialDone` and `bestScore` carry over, `unlocked` is clamped to
  6 (a finished five arena v1 campaign opens the sixth sector and nothing is
  assumed beyond it), and the new `duelWins`, `duelRuns` and `duelBest`
  default to 0. The migrated profile is written back immediately.
- Anything that fails validation degrades to a fresh profile instead of
  throwing. Verified: a v1 profile migrates to v2 with medals, times, best
  score and unlock intact; a corrupt v2 profile (`unlocked: "banana"`) boots
  to a working title screen on a fresh profile.
- `sw.js` VERSION bumped to `2026-08-16-round2-polish-1`. The precache list
  was trimmed to the files actually fetched (the SVG set is no longer loaded)
  and every remaining path was checked to exist on disk.

### Known bug classes, handled

- Pointer claims live on WINDOW listeners registered after GGKit init, in a
  gesture map that is the authority for releases. The kit map is mirrored, not
  relied on. There is no canvas-level `pointerdown` claim.
- Every texture bake completes in the boot scene before any scene constructs
  a sprite, so nothing is sized against a missing-texture frame.
- Render config is `antialias: true, antialiasGL: false`.
- Every pooled sprite is depth stamped, and buttons add their plate before
  their label.
- `Container.add` return value is never used as the child; `Texture.add` is
  not called with an x offset in the source-index slot; the config mounts to
  `document.body`; no `postrender` listener; scenes are classes, so custom
  methods are safe; keyed lookups (theme, modifier, personality, arena, drop)
  all go through guarded fallback helpers; the stepped clock is the only
  thing that advances the sim.

### UI law

- One transient at a time, queued, at the top edge: a 30px chip at 14px text
  with a 1.0s cap and fast fade. Centre-stage content appears only at run
  boundaries, on the results card.
- Coach text is one 28px strip, one line, 14px, fading after about 3s.
- Persistent HUD is one compact top plate: score, loadout meters, arena or
  duel round, timer, hit points and live bot count. The timer turns red when
  the squeeze arms, which is the only sudden-death text on screen.
- All touch targets are at least 48px, all readable text at least 14px, and
  the board is centred in the band between the HUD and the thumb controls so
  nothing informational sits under a hand.

### Verification

- `node --check` clean on `game.js` and `sw.js`.
- Booted headless on a private port (47317 to 47342, never a shared default)
  at 390x844 dpr 3: zero console errors, zero failed requests, first frame
  renders, 100 percent non-black.
- Headline mechanics exercised live in the browser, not merely inspected:
  bomb placed and detonated (block broken, drop spawned, shockwave spawned,
  score awarded); PIERCE 2 broke two blocks in a line; sudden death armed and
  sealed 23 cells; arena 17 loaded the circuit theme with MAGNET plus BRITTLE
  and a sprinter/hunter roster; a four sapper arena ran 25 simulated seconds
  with three concurrent bot bombs, eight blocks demolished and zero bot self
  kills; every bot class survives 30 seconds solo; arena clear awarded a gold
  medal and persisted the sector unlock; a duel round resolved and scored;
  GGKit settings pause froze the sim clock and blocked keys.
- Payload 472 KB total excluding `_shared`, largest file `game.js` at 181 KB.

### Deferred

- No frame-rate or feel numbers are reported. The box is contended by sixteen
  sibling lanes and has no GPU, so every local timing figure this wave is
  void; feel is gated separately on a quiet box.
- The retired `assets/*.svg` set is left on disk as original source history
  rather than deleted, since nothing outside this lane was checked for
  references to it. It is not loaded and not precached.
- A `_shared` observation, NOT made as an edit: `GGKit.makeInput` drops a
  pointer id on `pointerup` before a game listener can read the release, and
  feeds no pointers or keys at all while paused, which is why every title has
  to keep its own window-level gesture map. A kit-level "release" callback, or
  retaining the record for one frame after release, would let titles drop
  their duplicate maps.
