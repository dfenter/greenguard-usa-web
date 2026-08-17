# Verge Protocol

Landscape. Zombie tower defense with a steerable field operator, a 24 mission
campaign, an endless siege, and a forward base you rebuild with salvage.

## Controls

- Steer Vane, your field operator, with WASD, the arrow keys, or by dragging
  in the lower left of the board. He shoots the nearest infected and collects
  loose scrap.
- Tap a socket to preview a tower, its range, and the lane it covers. Tap the
  same socket again to build. Tap it again later to upgrade.
- Keys 1 to 5 pick a tower, Z and X step through sockets, Enter confirms.
- Q calls an airstrike, E drops a barricade on a fork, R fires the EMP.
- Space calls the next wave in early and banks the leftover seconds as scrap.
- F cycles speed between 1x, 2x and 3x. P or Esc pauses.

## Goal

Hold the core through every wave of a mission. Three medals means the core
finished untouched, two means it stayed above sixty percent, one means you
survived. Medals unlock towers and abilities. Salvage rebuilds the base, and
the base makes every later mission easier.

---

## AAA rebuild

Full rebuild on Phaser 3 plus GGKit. The old single file canvas prototype was
replaced; its tuned constants and content graph were carried across.

### Implemented

- **Engine and shell.** Phaser 3 and GGKit loaded from `/play/_shared/` by
  absolute path, `<base href="/play/verge-protocol/">`, viewport-fit cover,
  manifest, 64px and 512px icons, favicon, and `sw.js` derived from
  `_shared/sw-template.js` precaching only files that exist. GGKit is the sole
  implementation of pause and resume, restart, rotate overlay, visibility
  pause, pointer identity, guarded and validated saves, audio buses, the
  loading screen, the settings shell and the juice budget.
- **Preserved prototype behaviour.** Node to node lane walking with a fork per
  lane and a barricade that folds the horde onto the far branch; the wave
  composition curve (walkers `7 + 0.76w` capped at 26, rushers from wave 2,
  brutes from 4, splitters from 8 splitting into two on death, carriers from
  14); the `1 + 0.018` per wave health ramp; the seeded per wave shuffle so a
  replayed wave is identical; scrap drops that the operator collects; the wave
  clear bonus of `3 + floor(wave/5)`; the operator's 0.3 s auto fire and his
  186 unit acquisition range; core damage per infected type.
- **Five towers.** Rifle nest, flame emitter (cone plus burn), tesla pylon
  (chains), mortar (blast, with a minimum range), and med station (repairs the
  core and speeds neighbouring towers by twelve percent). Three levels each,
  upgrade cost `4 + 3 * level`, sell refunds sixty percent.
- **Three commander abilities** on cooldown: airstrike (targeted blast),
  barricade (closes a fork branch for fourteen seconds), EMP (board wide stun
  plus damage).
- **Placement and pacing feel.** Build ghost with range disc, dashed range
  perimeter, cost validity colour, and a live lane preview that thickens every
  approach segment the tower would actually cover. Wave composition is
  previewed in the panel before the call in, with a call in button that banks
  the unused prep seconds. Speed toggle at 1x, 2x, 3x. Defeat names the lane
  that broke and its accumulated core damage.
- **Campaign.** 24 missions across 4 sectors, 8 to 20 waves each, 330 waves
  total. Six modifiers (dense horde, hardened, swift, scarce supply, surge,
  low visibility) plus four named boss mutants with distinct mechanics:
  Tarmac (heavy armour), Dredge (regenerates), Matron (spawns crawlers),
  Nullspire (phases out, immune to slowing).
- **Endless Siege** on the deepest map the player has reached, with the wave
  curve climbing forever, best score and deepest wave persisted.
- **Base of ten facilities** upgraded only with mission salvage, three levels
  each, no timers and no second currency: command post, foundry, chem lab, arc
  bay, ordnance shop, infirmary, wall works, radar mast, drone pad, salvage
  yard. Every one feeds a real number in `C.towerStats` or the run setup.
- **Unlocks gated on medals.** Mortar at 2, tesla at 6, flame at 12, med
  station at 20; barricade at 4, EMP at 10. All progress is persisted through
  GGKit and validated field by field on load (`C.validProfile`), so a mangled
  save falls back to a fresh profile instead of booting broken.
- **World design.** Four authored sectors with their own lane geometry,
  palette, biome cell material, landmarks and hazards: Highway Checkpoint
  (overpass, jackknifed hauler, checkpoint booth, light masts; oil slicks),
  Flooded Docks (gantry crane, container stacks, half sunk trawler;
  floodwater and one surge channel), Quarantine Hospital (ambulance, triage
  tents, gurneys; containment vents that damage, one blackout ward that cuts
  tower range), The Verge (rift spire, collapsed bridge, beacons; rift fields
  that hasten and a gravity well that slows).
- **Player proxy states.** Vane has idle breathing, a four step move cycle,
  a command pose with a dashed command ring, a fire pose with a muzzle
  accent, and a down state. His radio pack, antenna blip and route marker to
  the selected socket stay visible during placement.
- **Six pooled particle systems** at sixteen each: contact sparks, debris,
  projectile and command trails, wave and ability bursts, ambient embers, and
  construction sparks. Plus a pooled effect list for arcs, rings, blast
  domes and the EMP wave.
- **UI law compliance.** One transient at a time with a queue, corner chip for
  in play events (max one second hold, fast fade), centre banner only at run
  boundaries at sixty percent board width with an overshoot beat, a single
  thin fading coach strip at the board's top edge for the four tutorial
  steps, icons and meters over labels in the top strip, every rail target
  84 by 90 px, and all readable text at 22 px or larger in a 1280 wide design
  space (about 14.5 px at a 844 px landscape phone).
- **Performance shape.** All static shell chrome and all battlefield terrain,
  routes, hazards, landmarks, sockets, spawn rims and the core plate are baked
  into canvas textures once per map instead of being re-issued as Graphics
  commands each frame. Every ring is hand tessellated (`Graphics.arc` walks
  the sweep in 0.01 rad steps). Every pool is preallocated, no allocation
  happens in the hot path, and text uses change guarded `setText` and
  `setColor`.

### Audio inventory

Three looping music beds through the GGKit music bus (menu and base, tactical
bed, danger layer; the danger layer takes over once ten infected are on the
board or a boss is alive) and thirteen distinct SFX through the sfx bus:
select, place, upgrade, cancel, fire, hit, kill, breach, ability, warning,
wave clear, victory, defeat. All mono MP3, no ogg. Music is decoded after the
loading screen closes, on the first mission start, so no wave hitches on a
decode. Mute and volume persist through GGKit settings.

### Content tables

| Sector | Map | Missions | Waves | Boss |
| --- | --- | --- | --- | --- |
| 1 | Highway Checkpoint | 1 to 6 | 8, 9, 10, 11, 12, 12 | Tarmac |
| 2 | Flooded Docks | 7 to 12 | 11, 12, 12, 13, 14, 14 | Dredge |
| 3 | Quarantine Hospital | 13 to 18 | 13, 14, 14, 15, 16, 16 | Matron |
| 4 | The Verge | 19 to 24 | 15, 16, 17, 18, 18, 20 | Nullspire |

| Tower | Cost | Range | Unlock |
| --- | --- | --- | --- |
| Rifle nest | 5 | 156 | start |
| Flame emitter | 7 | 102 | 12 medals |
| Mortar | 10 | 216 (min 74) | 2 medals |
| Tesla pylon | 12 | 140 | 6 medals |
| Med station | 8 | 168 | 20 medals |

| Infected | HP | Speed | Core damage | From wave |
| --- | --- | --- | --- | --- |
| Walker | 34 | 34 | 7 | 1 |
| Rusher | 21 | 66 | 5 | 2 |
| Brute | 112 | 18 | 15 | 4 |
| Splitter | 61 | 28 | 9 | 8 |
| Carrier | 77 | 22 | 12 | 14 |
| Howler | 95 | 26 | 10 | 18 |
| Crawler | 14 | 82 | 3 | on splitter death |

330 campaign waves plus an unbounded endless mode. A first clear of the
campaign runs well past two hours; the twenty minute content floor is met by
sector one alone.

### Verification hook

`window.__vp.state` exposes `mode`, `stage`, `stageName`, `wave`, `waves`,
`progress`, `score`, `best`, `health`, `coreHp`, `coreMax`, `scrap`, `medals`,
`salvage`, `phase`, `map` and `ready`. It exists as a boot fallback before the
scene is created and the live scene keeps writing into the same object.
`window.__vp.forceMode` accepts `menu`, `campaign`, `base`, `mission` or
`endless`, and `window.__vp.forceStage` selects the mission index (or the map
index for endless). Both are read every frame and applied once per change.
`window.__VP_READY` is set as soon as the Phaser game is constructed.

### Known limitations

- Frame timings could not be measured honestly on this machine: headless
  Chrome here has no GPU, so Phaser falls back to the Canvas renderer and
  every measurement is dominated by software rasterisation. Correctness,
  console cleanliness and the full mission loop were verified in a real
  browser process against a local server; the authoritative throttled trace
  belongs to the gate harness on the deployed URL.
- Gamepad input is not wired. Keyboard and touch are both complete.
- The endless siege picks the deepest map the player has unlocked rather than
  offering a map chooser.

## Retina pass 2026-08-16

- Audit before ratio: 1.85x at the emulated DPR 3 landscape viewport, using the 1280 x 720 design box in a 693.33 x 390 shown fit box. Configured after ratio: 3.00x from `GGKit.hiDpi.factor(1280, 720)`, with a 2080 x 1170 backing store.
- Recipe: Phaser `Scale.FIT`, dense scale dimensions, `GGKit.renderDefaults`, `setZoom(f)` in VergeScene, and matching resolution on the title text helper. The factor is 1.625 for this fit.
- Factor cap: none beyond GGKit's standard maximum of 3. No title-specific cap.
- Live canvas ratio and gameplay screenshot were unavailable because the browser backend was empty and the sandbox denied private HTTP listeners. The after ratio above is the configured geometry, not a live canvas read.
- Static title-local chrome and terrain bakes now use `GGKit.hiDpi.canvas` and Phaser texture source resolution. Gameplay, balance, and content were unchanged.

## Release gate repair

2026-08-16, mobile release gate lane.

### PWA installability

The manifest declared only a 64x64 and a 512x512 icon, so it had no 192x192 and
was not installable. Added `icon192.png`, downscaled with LANCZOS from the
existing `icon512.png` master so the art is unchanged, and added the matching
manifest entry. `icon.png` (64x64) is now declared at its true size.

Verified with `node release_gate.mjs http://localhost:8347 1 <slug>` from
/Users/lucille/ue-port-studio/aaa/harness, serially at concurrency 1, against
`python3 -m http.server 8347 --directory /Users/lucille/greenguard-usa-web`.

Gate verdict: **READY** (all checks pass).
