Bubble Fury Touch
Controls: left touch stick or WASD to move; right touch stick or arrow keys to aim and fire; Space/Enter fires with keyboard aim.
Loop: survive escalating waves, grab rotating weapon pickups, and defeat Scuzz on waves 5, 10, and 15.
Death ends the run; score is saved as Best locally. Press R or tap Restart Run for an instant replay.

## AAA rebuild

Rebuilt in place 2026-08-10 against the fleet1 brief. The archived prototype
(single-file canvas, portrait 390x700) is gone; the concept it carried is
not. Landscape 960x540 design space, Phaser 3.87 from `/play/_shared/` for
rendering only, GGKit as the sole lifecycle, input, save and audio
implementation. Content tables live in `bf_data.js` so `game.js` never has an
authored number baked into it.

Files: `index.html`, `game.js` (132 KB), `bf_data.js` (19 KB), `sw.js`,
`manifest.json`, `icon.png` / `icon512.png` / `favicon.png`, `LICENSES.md`,
`assets/` (43 files). Whole directory is 1.4 MB, largest single file 197 KB,
so the 2.5 MB / 400 KB budgets both hold with room to spare.

### Implemented

**Mechanics.** Twin-stick split is real and floating: the left half of the
screen moves, the right half aims and fires while held, and both bases slide
so a long drag never runs out of stick. Keyboard mirror is WASD move, arrows
aim, Space or Enter fire. Five weapons, each with its own muzzle-flash frame,
rate of fire, projectile and screen kick, so a swap is felt before the HUD
chip is read: SPREAD (0.20 s, three bolts, the endless default), BEAM
(0.075 s, piercing hitscan), BOUNCE (0.30 s, four ricochets), FLAK (0.46 s,
eight short-lived pellets), RAIL (0.62 s, 62 damage piercing lance). Six
enemy silhouettes plus the splitter shard, each with a wind-up telegraph the
renderer paints for exactly its tell length: Dart (ring, then a straight
dash), Gyre (ring, then a three-bolt fan), Mortar (a painted landing ring
before the shell lands), Bulwark (front plate eats 85 percent, brace flash
then a shockwave), Sac (bursts into three shards on death), Lancer (paints
the whole firing line, then lances down it). Hit flash, knockback and a
contact bounce on both bodies; contact damage is on a per-enemy 1.1 s
cooldown so a pack cannot pin and grind the player.

**Scuzz.** One boss, three authored phases (GORGE / SPIRAL / FURY) that
promote on health and never demote, each with its own tell length, move
speed, pattern ring and charge profile. Patterns: charge, radial spray,
multi-arm spiral, expanding ring, triple charge, add summon. Rear vent takes
2.2x, the armoured face takes 0.42x, and a rear hit pops a WEAK marker. HUD
carries a boss bar with one filled pip per phase reached.

**Loop.** Four modes on an unlock chain: STANDARD RUN (waves 1-15, Scuzz on
5/10/15) is open from the start; BLITZ MODE (wave clock, 1.35x density,
1.12x speed, overtime bites for 12 HP and spawns extra darts) needs Standard
cleared; SURVIVAL ENDLESS (procedural waves past the authored chain, Scuzz
every fifth) needs Silver in Standard; FURY PROTOCOL (1.5x density, 100 HP,
Scuzz opens in phase three) needs Gold in Standard and Blitz plus wave 20 in
Endless. Bronze/silver/gold thresholds per mode, medal and best score saved
per mode, unlocks announced on the results card. Interactive first-run
tutorial covers move, aim/fire, kill, pickup and the safe pocket, delivered
through a thin fading coach strip pinned near the top of the screen.

**Drops are generous** (the owner always wants them generous): per kill 26
percent health, rising to 46 percent when the player is under 70 percent,
22 percent multiplier token, 12 percent weapon rack, all multiplied by the
mode's dropMul. Every wave clear drops two health orbs, and a weapon rack
every second wave. Killing Scuzz drops three health, two multipliers and a
guaranteed weapon. Measured in the probe: 9 to 11 live pickups on the ground
after a wave clear. Multiplier ladder runs x1 to x5, steps up on tokens and
kills, decays one rung per 7 quiet seconds.

**Presentation.** 57-frame authored atlas: player thruster cycle, two-frame
animation per enemy, three Scuzz states, per-weapon muzzles, props, pickups,
medals. Six pooled particle systems (hit sparks, death shards, smoke, embers,
sparkles, engine trail). Screen shake and hit-stop go through the GGKit juice
bus only, and `prefers-reduced-motion` turns the shake toggle off by default
while still letting Settings override it. Banner beats are 60 percent screen
width and slide in on `Back.easeOut` overshoot for wave start, arena change,
boss phase, wave clear, weapon online and safe-pocket discovery. Audio is
three GGKit loops (arena, boss, ambience, all A minor 132 BPM so the
crossfade is phase coherent) and 24 cues including one per weapon.

**Verification hook.** `window.__bf` is installed before Phaser exists.
`__bf.state` carries `mode, arena, wave, waves, hp, maxHp, score, best, mult,
weapon, enemies, boss, bossHp, bossPhase, alive, time, pickups, medal,
tutorial, phase, kitPaused, fps`. Switches: `forceWave(n)`, `forceArena(id)`,
`forceMode(m)`, `start(mode, arena, wave)`, `setGod(b)`, `kill()`,
`clearWave()`, `debug(b)`, `unlockAll()`, `resetSave()`, `snapshot()`. All of
them are readable from the boot fallback as well: `?mode=&wave=&arena=&god=1
&auto=1` is parsed into `__bf.pending` before the game boots, and the live
scene applies the same values.

### Arena table

| Key | Name | Size | Identity | Signature hazard / cover | Lanes | Safe pocket |
|---|---|---|---|---|---|---|
| `plaza` | Sunset Plaza | 1500x940 | Open plaza, long sightlines | Central 132 r drag pool (slows to 0.56x), six pillars, two barrels | 8 on the rim | North alcove (74 r) |
| `yard` | Scrap Yard | 1500x1000 | Cluttered cover, broken sightlines | Eight crates + eight hatched walls, six barrels that detonate for 60 damage in a 150 r ring | 6 corners and mid-edges | Crate hollow, dead centre (66 r) |
| `choke` | Chokeworks | 1700x820 | Three corridors, two gaps, ricochets rule | Two 78 r burn grates at 16 dps, corridor walls | 6 at corridor ends | East dead end (62 r) |
| `night` | Nightfall Yard | 1500x940 | Sight cut to a lamp radius | Screen-space darkness plate, four lamp pools, two mires, enemies fade in at the edge of the light | 6 | Lamp pool, south east (78 r) |
| `furnace` | Furnace Deck | 1560x920 | Safe ground moves every six seconds | Four 104 r vents on one 6 s cycle offset 1.5 s apart, 30 dps when hot, warning ring before | 6 | Core ring, centre (96 r) |

Safe pockets heal 9 HP/s, physically repel every enemy, and the first
discovery per arena is saved and announced.

### Wave table (Standard Run)

| Wave | Arena | Drip | Composition | Boss |
|---|---|---|---|---|
| 1 | Sunset Plaza | 0.55 | 5 Dart | |
| 2 | Sunset Plaza | 0.50 | 6 Dart, 2 Gyre | |
| 3 | Sunset Plaza | 0.48 | 5 Dart, 3 Gyre, 2 Mortar | |
| 4 | Sunset Plaza | 0.44 | 6 Dart, 3 Mortar, 2 Sac | |
| 5 | Sunset Plaza | 0.60 | 4 Dart, 2 Gyre | Scuzz, phase 1 |
| 6 | Scrap Yard | 0.46 | 6 Dart, 2 Bulwark, 2 Gyre | |
| 7 | Scrap Yard | 0.44 | 5 Dart, 3 Bulwark, 3 Mortar | |
| 8 | Scrap Yard | 0.42 | 4 Sac, 2 Bulwark, 3 Gyre | |
| 9 | Scrap Yard | 0.40 | 7 Dart, 2 Lancer, 3 Mortar | |
| 10 | Chokeworks | 0.55 | 3 Bulwark, 3 Gyre | Scuzz, phase 2 |
| 11 | Nightfall Yard | 0.44 | 7 Dart, 4 Gyre, 2 Lancer | |
| 12 | Nightfall Yard | 0.42 | 4 Sac, 4 Mortar, 2 Lancer | |
| 13 | Nightfall Yard | 0.40 | 8 Dart, 3 Bulwark, 3 Sac | |
| 14 | Furnace Deck | 0.38 | 3 Lancer, 3 Bulwark, 4 Gyre, 3 Sac | |
| 15 | Furnace Deck | 0.62 | 3 Bulwark, 2 Lancer, 3 Sac | Scuzz, phase 3 |

Counts scale by mode density, enemy HP by 1.085 per wave and speed by 1.012
per wave capped at 1.5x. Endless generates a wave from the same roster past
the authored chain with a Scuzz every fifth wave and the arena rotating every
three waves.

### Known bug classes, closed

Every class listed in the brief is closed deliberately and the reasoning is
in the header comment of `game.js`:

1. The debug view (`__bf.debug(true)`) walks `this.pool.*` and `this.props`,
   the same preallocated arrays the sim walks. There is no second entity list.
2. No render state rides on the sim entity. Sim state is `sprite.d`, wiped in
   full by `resetEntity()` on every spawn, and the renderer only writes
   x/y/rotation/alpha/tint back.
3. There are no DOM control handlers. Sticks are claimed out of
   `kit.input.pointers` in `ctl.sample()`, which stamps `p.zone` on the
   pointer the frame it appears, so a pointer cannot be claimed twice and a
   HUD tap can never become a stick.
4. No camera split exists, so there is no second camera to forget. The
   minimap and the night mask are Hud-scene screen space.
5. Every scene is a real class extending `Phaser.Scene`, so no plain config
   object needs an `extend:` block for its methods.
6. Test switches are read from the boot fallback (query string, before Phaser
   exists) AND from the live scene.
7. No clock outruns the stepped sim: delta is clamped to 100 ms, at most
   three 1/60 steps run per frame, and the leftover accumulator is capped
   rather than banked. A degraded device slows down; it never time-skips.
   Hit-stop pauses cosmetic animation while fixed simulation steps continue.
8. Every keyed lookup against variant content goes through `look()`, which
   returns a declared fallback instead of `undefined`.
9. The coach strip is a thin fading band at y ~106 of 540. It never covers
   the play area centre or the bottom half.
10. `sw.js` is generated from the real directory listing and every one of its
    53 precache entries was checked to exist on disk.

Three real defects were found and fixed during browser verification, all
worth remembering:

- **Container render order.** Everything was parented to one `world`
  container, which renders children in insertion order and ignores `depth`.
  The floor, built after the pools, drew on top of the player and every
  enemy. The container is gone; depths now apply on the scene display list.
- **A pause raised before the scene existed.** GGKit's rotate gate fires at
  kit creation, before `Game.live` is set, so `onPause` was swallowed and the
  scene ran with `kit.paused === true`: input dead, overlay up. The scene now
  syncs to `kit.paused` every frame instead of trusting only the callback.
- **Scene instance reuse.** Phaser reuses the scene object across restarts,
  so `arenaOverride`, `pendingBanner` and `arena` leaked into the next run.
  They are cleared in `init()`.

### Verified

`node --check` passes on `game.js`, `bf_data.js` and `sw.js`. Everything below
was driven in headless Chrome at 844x390 CSS, DPR 2, touch emulated, through
`aaa/harness/bf_probe.mjs`, `bf_shots.mjs`, `bf_scenario.mjs` and
`bf_loop.mjs`. Zero page errors and zero console errors in every run.

- Boot, menu, mode select, arena chips, settings, start.
- Live twin-stick play with two simultaneous touch points: kills register,
  score and multiplier climb, pickups collect, weapons swap.
- Waves 5, 10 and 15 forced: correct arena, Scuzz spawns with scaled HP
  (1550 / 2200 / 2850) and phase pips.
- All five arenas forced and rendered.
- All four modes started with their own HP and wave counts.
- Full clear of waves 13 to 15 including the finale: `phase` reaches
  `clear`, gold medal awarded, save written, Blitz and Endless unlocked.
- Blitz wave clock counts down (22.9 s to 19.9 s over three seconds).
- Death path, results card with medal and unlock line, pause overlay,
  resume, restart, quit to menu.
- PWA parts: manifest, three icons, `<base href>`, `viewport-fit=cover`,
  landscape orientation lock, safe-area probe feeding the HUD offsets.

### Deferred / could not run

- **The 4x-throttle feel gate could not be judged on this box.** Median frame
  time is 16.7 ms, inside the 17.5 ms budget, but the over-33 ms count came
  back at 216-274 of 600. That number is not this title's: the MENU scene
  alone (26 sprites, no sim) scores 65 of 300 over 33 ms unthrottled, and the
  accepted flagship peer `skyfall-command` scores 209 of 600 at 4x under the
  identical harness on this machine right now. The box is contended (fleet
  run in progress) and is a 2019 Intel UHD 630. Re-run
  `aaa/harness/bf_probe.mjs` on an uncontended box before treating the
  over-33 count as a real result; `bf_cal.mjs` runs the same capture against
  any peer title for calibration.
- **No deploy and no git commit**, per the brief. `sw.js` carries VERSION
  `2026-08-10-fix1`.
- Endless leaderboards, per-arena medals and a replay of the tutorial from
  Settings are not built. Endless currently reuses the mode-level medal
  ladder rather than a wave-depth ladder.
- Scuzz has one body. A second boss silhouette for the Fury finale was
  considered and cut; Fury instead opens Scuzz in phase three.
- Barrels do not respawn inside an arena once detonated. They come back only
  when the arena is rebuilt on an arena change.

## Fix round 1

Fixed:

- CRITICAL arena teardown leak. Every arena-owned display object is tracked and destroyed.
- MAJOR pause restart and quit lifecycle leak. GGKit input is cleared and the user pause reason is released; HUD pause state is synchronized on creation.
- MAJOR shallow save validation. Save maps, content IDs, numeric fields, medals, and flags are validated before use.
- MAJOR authored Scuzz phase starts. Standard waves 10 and 15 now start in their declared phases.
- MAJOR Scuzz triple charge. Each Fury triple charge now receives its own telegraph and commit.
- MAJOR hostile projectiles after wave clear. Enemy bullets, mortar telegraphs, and beams are cleared at intermission.
- MAJOR pool exhaustion. Enemy spawns retry, rewards queue into bounded pending drops, pools are larger, and overflow telemetry is exposed through `__bf.state.pool`.
- MAJOR kill multiplier. Kills advance the multiplier and use the authored kill grace timer.
- MAJOR animation states. Player, enemy, and Scuzz idle, movement, attack, and hit states are authored and driven.
- MAJOR impact feel. Standard hits now use GGKit hit-stop, player damage has a red edge vignette, and score pops use an ease-out-back scale beat.
- MAJOR hit-stop simulation regression. Fixed simulation steps continue while only cosmetic animation and effect advancement pause.
- MAJOR bubble ring FX. Pooled original ring bursts now trigger on kills, pickups, barrel blasts, and Scuzz impacts.
- MINOR controller communication. The menu explicitly states that gamepad input is unsupported.
- MINOR danger music. Low-health or high-density danger crossfades to the intensity track through GGKit audio.
- MINOR music loading. Music is no longer preloaded before the first menu interaction.
- MINOR drop placement. Drops search for an unblocked landing point.
- MINOR minimap discovery. Safe pocket markers stay hidden until the pocket is found.
- MINOR minimap input ownership. The minimap is claimed as HUD space and cannot become a right-stick gesture.
- MINOR camera motion. Spring-damped movement lookahead, hit dip, and speed zoom are gated by the juice setting.
- MINOR documentation. Arena, asset, particle, payload, and service-worker version references are current.

Rejected: none.

## UI declutter

- Cut live center banners, arena flavor subtitles, floating score/HP/multiplier numbers, the minimap, and repeated mode/best/boss/weapon label text.
- Shrunk wave, score, multiplier, timer, and health HUD into compact values, bars, weapon icon state, and phase pips; moved pause to the safe top edge with a 44px touch target.
- Converted wave, boss, pickup, pocket, overtime, clear, phase, and weak events into one queued upper-edge chip (16px, max 1.0s); tutorial copy uses the same single 30px top strip and fades within 3s.
- Kept gameplay information in the health/weapon/boss meters, world pickup state, pause overlay, and results card; reduced-motion gating remains on transient fading and camera/juice motion.
