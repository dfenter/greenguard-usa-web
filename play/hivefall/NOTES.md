# Hivefall

Match the board, hold the wall.

**Controls.** Drag a piece into its neighbour to swap. Every match fires that
survivor's kit straight up the column you matched. Tap the flare to stun the
whole track once per wave. Keyboard: arrow keys or WASD move the selector,
Space or Enter picks up and swaps, F fires the flare, M mutes, P or Escape
pauses.

**Goal.** The horde walks down the lanes toward your wall. Red shells kill,
blue coils chill, green patches the wall, gold pays for the shelter, violet
venom eats through armour. Runs of four splash into the neighbouring lanes,
runs of five punch straight through a lane, and cascades multiply the whole
volley. If the wall reaches zero the wave ends and you keep your salvage.

**Two modes.** The Fall is a forty wave campaign in four acts with a named
horror at the end of each. Endless Night chains nights until the wall drops
and scores you on how far you got.

**Between waves.** Salvage buys shelter upgrades. Every one of the twelve is
earned by playing; nothing in this game is bought with money.

---

## Dev notes

### Preserved prototype behaviour (regression checks)

The 2026-08-05 prototype is the design document. These are carried through the
rebuild and should be checked by name:

- Swipe or drag a piece to swap; keyboard arrows move a selector, Space or
  Enter picks then swaps; M mutes.
- Matches fire weapons up the matched column: red cannon, blue frost, green
  repair, gold salvage, violet venom.
- Runs of four splash to the neighbouring lanes, runs of five pierce, and
  cascades multiply power (`1 + 0.28 * (combo - 1)`, raised by Squad Drill).
- Wall reaching zero ends the fight and the salvage is kept; the same wave can
  be retried.
- Salvage is spent on gear tracks of eight levels each: Gun Calibre, Frost
  Coils, Wall Plating, Salvage Rig, cost `round(25 * 1.78^level)` family.
- Everything is play-earned and progress persists in local storage.
- Board timing constants: clear 0.15 s, swap 0.11 s, fall 15 cells per second.
- Deterministic wave script per wave number: mulberry32 seeded
  `9176 + wave * 7919`, count `7 + 1.7 * wave` capped at 46, spawn gap
  `1.55 - 0.035 * wave` clamped to 0.52 to 1.55, paired spawns from wave 6.
- Shot damage 20 shell, 5 coil, 7 venom, scaled by power and Gun Calibre.
- Horde stats for Mite, Husk and Darter are the prototype's numbers.
- `ensureMove` still falls back to a deterministic two colour checker, so the
  board can never lock, and the save loader still clamps every field.

### Deliberate changes from the prototype

- 20 fights became a 40 wave campaign in 4 acts, so the per-wave hit-point ramp
  eased from `1 + 0.17 * (wave - 1)` to `1 + 0.128 * (wave - 1)`.
- Board colour count is now progression driven: three survivors at wave 1, four
  from wave 4, five from wave 8. The prototype's five colour board is the
  end state, and the early board is the tutorial.
- Colour to kit mapping is by survivor key, not array index, so the unlock
  order can differ from the prototype's index order.
- The prototype is real time, and it stays real time. There is no hard move
  budget; move pressure is expressed by the horde timer, the flare charges and
  the Pity Charge meter, all of which are on the HUD.
- Audio moved from runtime WebAudio synthesis to pre-rendered mp3 files played
  through the GGKit buses, per the audio format law.

### Architecture

- `js/content.js` content graph: palette, squad, horde kinds, acts, wave
  generator, twelve upgrades, derived stats, save schema and validation.
- `js/sim.js` headless simulation: board state machine, hazards, lane battle,
  telegraph, fixed 1/60 substeps. Emits events; never renders.
- `js/art.js` texture bakery: every static surface is drawn once into a canvas
  texture. No large Graphics object ever sits in the display list.
- `js/fx.js` five preallocated particle pools plus pooled floating numbers and
  a single frame nudge, all gated on `kit.juice.enabled`.
- `js/ui.js` buttons, keyboard nav, corner chips, coach strip, run boundary
  banner and meters, all built to the UI Noise Law.
- `js/play.js` the play scene: a pure view over the sim, with its own parallel
  render state arrays keyed by pool slot.
- `js/main.js` GGKit lifecycle, boot, menu, shelter, squad, result and the
  `window.__hf` verification hook.

### Verification hook

`window.__hf` exists from first script evaluation, before any scene:

- `__hf.state` live probe state: `scene, mode, stage, act, actName, progress,
  score, health, wall, wallMax, kills, salvage, remaining, boss, hazards,
  flares, over, paused`.
- `__hf.save` the validated save object.
- `__hf.acts`, `__hf.upgrades`, `__hf.squad` content registries.
- `__hf.forceMode('fall'|'endless'|'menu'|'shelter'|'squad', wave)`,
  `__hf.forceStage(n)`, `__hf.grantSalvage(n)`, `__hf.unlockAll()`,
  `__hf.reset()`.

---

## AAA rebuild

Rebuilt in place on Phaser 3 from `/play/_shared/`, with GGKit as the only
implementation of pause and resume, restart, rotate overlay, visibility pause,
guarded saves, audio buses, loading screen, settings and the juice budget.

### Implemented

- Board and threat readability: lanes are pixel aligned to the board columns,
  so a match visibly fires up the same column it was made in. Pending spawns
  raise a chevron at the head of their lane inside the Watchtower window, and
  a lane whose closest horror is past 62 percent of the track lights a danger
  wash that blinks under two seconds to impact. Swap 0.11 s, clear 0.15 s and
  a 1/60 fixed substep keep the board and the horde clock responsive.
- Player entity states on the selector: Ready breathes at 1.0 to 1.04 with a
  focus ring, Preview shows a solid landing ghost plus a direction arrow,
  Resolve gives a contact flash on the accepted swap, Invalid draws an amber
  cross hatch. All four are visible in gameplay.
- Five pooled particle systems: impact shards, muzzle and cascade streaks,
  salvage and status sparks, reward rings, breach smoke, plus pooled floating
  numbers. Nothing allocates during a frame.
- Juice ladder per the lane bible: single clear is a contact accent only,
  combo 2 to 3 adds a frame nudge of 0.6 percent view height, combo 4 or more
  adds a board ring, a 60 ms hit stop and the reward sound, breach and boss
  down get the only shakes. Everything routes through `kit.juice.enabled`, and
  `prefers-reduced-motion` sets the initial value.
- UI Noise Law: one corner chip at a time with a one second hold, a single
  thin coach strip at the top edge that fades after about three seconds,
  centre banners only at run boundaries (wave start, boss entry, wave clear,
  breach), icons and meters instead of repeated labels, 44 px minimum touch
  targets and safe area insets on every screen.
- PWA shell: base href, viewport-fit cover, manifest, three original icons,
  service worker with a full precache list, GGKit loading screen with real
  progress, title, pause and settings menus, portrait rotate overlay.

### Content

| Act | Waves | Identity | Horde | Signature hazard | Named horror |
|---|---|---|---|---|---|
| 1 | 1 to 10 | Suburb Dusk, weathered fence frame | Mite, Husk, Darter | Bramble, one layer | The Husk Mother, spawns mites |
| 2 | 11 to 20 | Flooded Mall, tiled chrome frame | Mite, Darter, Wader | Sludge, two layers | The Tide Choir, heals its lane |
| 3 | 21 to 30 | Hospital Block, enamel steel frame | Mite, Darter, Spitter, Drone | Spore, spreads every 6.5 s | The Ward Keeper, periodic shield |
| 4 | 31 to 40 | The Hive, amber comb frame | Husk, Darter, Wader, Drone | Comb Wax, two layers | The Fall Queen, frenzies as she drops |

| Mode | Content |
|---|---|
| The Fall | 40 waves, 4 acts, 4 boss waves (10, 20, 30, 40), elite pairs on waves 5, 15, 25, 35 |
| Endless Night | chained nights, act identity cycles every night, wall recovers 18 percent per night, best score persisted |

| Squad | Kit | Unlocks |
|---|---|---|
| Vance, Cannoneer | shell up the lane | wave 1 |
| Wren, Wallwright | patches the wall | wave 1 |
| Odis, Scrapper | salvage | wave 1 |
| Sable, Coilwright | chills the lane | wave 4 |
| Mirek, Chemist | venom over time | wave 8 |

Twelve shelter upgrades, all earned from play, unlocking as the campaign
advances: Gun Calibre, Frost Coils, Wall Plating and Salvage Rig at eight
levels each; Watchtower, Medkit Tiles, Pity Charge, Plate Vents, Barricade,
Scrap Furnace, Signal Flare and Squad Drill at three levels each.

Time to exhaust: 40 waves at roughly 45 to 80 seconds each is about 35 to 50
minutes of campaign before Endless Night, with the shelter economy pacing a
second pass.

### Audio inventory

All eighteen files are original procedural audio synthesised offline for this
title and encoded to mono mp3. No ogg is shipped. Everything plays through the
GGKit buses with persistent mute and volume.

| File | Cue |
|---|---|
| `swap.mp3` | piece swap |
| `invalid.mp3` | illegal swap, coated tile, empty flare |
| `click.mp3` | UI confirm |
| `match.mp3` | single clear |
| `cascade.mp3` | cascade step, pitched up per chain |
| `shot.mp3` | turret fire |
| `impact.mp3` | shot connects, barricade absorb |
| `kill.mp3` | horror down |
| `repair.mp3` | wall patched |
| `salvage.mp3` | salvage collected, upgrade bought |
| `breach.mp3` | wall takes a hit |
| `flare.mp3` | signal flare, boss ability |
| `clear.mp3` | wave cleared, combo tier four |
| `boss.mp3` | named horror enters and dies |
| `defeat.mp3` | wall breached |
| `theme_watch.mp3` | calm board loop |
| `theme_siege.mp3` | late wave and boss loop |
| `theme_shelter.mp3` | shelter and results loop |

### Deferred and known limitations

- Portrait only, by slate row. The rotate overlay is GGKit's.
- The local 4 times CPU throttle trace on this machine is contended: the
  shipped reference title `berry-cascade` measures 138 frames over 33 ms in the
  same session where Hivefall measures 98, both at a 16.7 ms median. The
  authoritative feel number is the deployed URL run.
- Hazard spread is act 3 only; the other acts seed hazards on a timer.
- Endless Night keeps the board between nights on purpose, so a good board is
  a reward for surviving; the campaign always starts a fresh board.
- No landscape layout, no cloud save, no leaderboard.

## Retina pass 2026-08-16

- Target 390x844 CSS at DPR 3. Before ratio: 1.00x CSS-sized RESIZE baseline. After target: 3.00x, 1170/390, via `GGKit.hiDpi.resize`. Live canvas read was unavailable because no browser surface or private local listener was available.
- Recipe: `Phaser.Scale.RESIZE`, `GGKit.renderDefaults`, `GGKit.hiDpi.canvas` texture baking, and DPR-matched Phaser text. No factor cap.
- Gameplay screenshot and runtime backing-store measurement remain deferred. No palette change was made because the retina law identifies density, not colour depth, as the defect.

## Retina pass 2

- Delayed DPR 3 canvas ratio: not measured. The slug-derived private harness port was rejected with `EPERM`, and headless Chrome aborted before creating a page. Configured `cfg.ggDpr` is 3.00 at the audit viewport.
- Converted boot to `GGKit.hiDpi.phaser` with `Phaser.Scale.NONE`, retained render defaults and existing dense canvas art, and updated shared UI and FX text to use the density factor with inverse object scale.
- Menu, shelter, squad, result, and play scenes now derive layout from Phaser scale dimensions normalized by `cfg.ggDpr`, with camera zoom and midpoint centering applied per scene.
- Gameplay screenshot, render-loop probe, and match input proof could not be completed because the local browser infrastructure was unavailable.
