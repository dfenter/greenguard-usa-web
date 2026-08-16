# Lantern Bingo

Controls: tap a card to daub the called number on it (each card holds the call at most once, so the whole card is the target). Tap a chip to spend it. Keys: 1 to 4 daub a card, Space quick daub, Q W E R chips, P or Esc pause, R retry, arrows and Enter in menus.

Goal: close the room's pattern on any of your cards before a rival lantern does and before the drum of 75 numbers runs out. Missed calls stay missed.

Modes: Lantern Tour is 20 rooms across 5 cities, each with its own pattern, card count and call speed. Endless Hall stacks pattern after pattern for score. Pattern Rush gives five exotic patterns a posted call budget each.

Free by design: every chip, card, room and souvenir is earned by play. Posted call odds sit on the play screen. No purchases, no energy, no network.

## AAA rebuild

Implemented: a Phaser 3 portrait rebuild with GGKit as the sole lifecycle, pointer identity, guarded save, audio bus and juice implementation. All art is baked into canvas textures at load, so the render loop never replays a Graphics command list; the only per frame vector work is the 44 segment hand tessellated call clock ring. The play screen is one compact HUD line, a caller lantern with its clock ring and recent calls, a rival race track, a posted odds strip, the cards, a calls remaining meter and a four chip control strip in the thumb zone. Transients are a single queued corner chip; centre banners appear only at run start and run end; coaching is one thin fading strip.

Preserved prototype behaviour: 75 ball drum drawn without replacement, L I G H T columns with a free centre, the tuned call interval band (2.60 s down to 1.16 s, with the prototype's 2.25 / 1.82 / 1.48 / 1.16 room values sitting on tour stops 3, 8, 13 and 20), the 78 percent live window after which a call is dead, streak reset when a call passes undaubed, streak scoring of 100 + min(300, streak x 25) with a double multiplier, three streak daubs per chip charge with a rotating charge turn and a cap of three per chip, the rival delay formula 0.15 + index x 0.075 + random x 0.15, the seven rival names, keys 1 to 4 daubing cards, and the room ladder from single line up to blackout.

New for the uplift: 20 tour rooms, 13 patterns, 5 authored cities, 20 souvenirs, Endless Hall, three Pattern Rush ladders, rival accuracy as the difficulty ramp, a FREEZE chip beside AUTO, DOUBLE and PEEK, a one away ring on every completing cell, an interactive first run tutorial, and validated persisted progression.

### Cities

| City | Room decor | Palette accent |
|---|---|---|
| Kindlewharf Harbour | masts, hulls, rippled waterline | amber glow, coral, seafoam |
| Stonebell Shrine | shrine gates, stepped path, drifting motes | jade glow, rose, pale gold |
| Emberlane Night Market | striped stall canopies, strung bulbs | gold glow, magenta, mint |
| Glasswater Terrace | terrace blocks, rain streaks, wet ground | cyan glow, violet, lime |
| Skyfire Finale | dark skyline under a mass lantern release | white gold glow, red, blue |

### Modes

| Mode | Rule | Progression |
|---|---|---|
| Lantern Tour | 20 rooms, clear the pattern before the rivals and the drum | Room unlocks, one souvenir per room, best score per room |
| Endless Hall | Patterns cycle forever, each clear speeds the calls and sharpens rivals | Best score, best halls cleared |
| Pattern Rush | Five exotic patterns, each with a posted call budget, no rivals | Three ladders, best score per ladder, gold / silver / bronze on total calls |

### Tour rooms

| Stop | City | Room | Pattern | Cards | Call | Rivals |
|---:|---|---|---|---:|---:|---:|
| 1 | Harbour | Rope Walk | Any Line | 1 | 2.60 s | 2 |
| 2 | Harbour | Cinder Porch | Any Line | 1 | 2.40 s | 3 |
| 3 | Harbour | Salt Lantern Hall | Four Corners | 2 | 2.25 s | 3 |
| 4 | Harbour | Harbour Finale | Single Diagonal | 2 | 2.15 s | 4 |
| 5 | Shrine | Moss Steps | Crossbeam | 2 | 2.05 s | 4 |
| 6 | Shrine | Bell Court | Torch T | 2 | 1.95 s | 4 |
| 7 | Shrine | Pine Terrace | Two Lines | 3 | 1.90 s | 5 |
| 8 | Shrine | Shrine Finale | Postage Lantern | 3 | 1.82 s | 5 |
| 9 | Market | Sugar Row | Lamp L | 3 | 1.76 s | 5 |
| 10 | Market | Moth Garden | Lantern X | 3 | 1.70 s | 5 |
| 11 | Market | Spice Arcade | Paper Diamond | 3 | 1.62 s | 6 |
| 12 | Market | Market Finale | Two Lines | 3 | 1.56 s | 6 |
| 13 | Terrace | Blueglass Walk | Outer Frame | 4 | 1.50 s | 6 |
| 14 | Terrace | Rain Balcony | Lantern X | 4 | 1.44 s | 6 |
| 15 | Terrace | Mirror Landing | Triple Beam | 4 | 1.38 s | 7 |
| 16 | Terrace | Terrace Finale | Paper Diamond | 4 | 1.32 s | 7 |
| 17 | Finale | Ember Stair | Outer Frame | 4 | 1.28 s | 7 |
| 18 | Finale | Crown Gallery | Triple Beam | 4 | 1.24 s | 7 |
| 19 | Finale | Thunder Hall | Blackout | 4 | 1.20 s | 7 |
| 20 | Finale | Skyfire Finale | Blackout | 4 | 1.16 s | 7 |

Rival accuracy ramps 0.55 to 0.96 across the same ladder; that is the difficulty curve, not a hidden hand on the drum.

### Patterns

Any Line, Four Corners, Single Diagonal, Crossbeam, Torch T, Two Lines, Postage Lantern, Lamp L, Lantern X, Paper Diamond, Outer Frame, Triple Beam, Blackout. Completion, progress and the one away highlight all run off the same set model, so a pattern only has to declare its cells once.

### Chips

| Chip | Effect |
|---|---|
| AUTO | Daubs every live match on the current call |
| DOUBLE | Doubles score for 8 s |
| FREEZE | Holds the call clock for 4.5 s |
| PEEK | Shows the next three calls for 4.5 s |

Three streak daubs charge one chip; the charge rotates through the four so no single chip starves. Cap three each.

### Souvenirs

Twenty, one per tour room, four per city: Brass Buoy, Net Lantern, Tide Bell, Gull Kite, Stone Bell, Pine Charm, Snow Moth, Cloud Ribbon, Sugar Fan, Spice Lamp, Paper Tiger, Copper Ladle, Rain Chime, Glass Fish, Mirror Fan, Reed Boat, Sky Ember, Crown Wick, Comet Sash, First Flame.

### Audio

Three music beds, all lazy loaded after the first interaction: `music_lantern` (tour), `music_hall` (terrace and Endless Hall), `music_skyfire` (finale and Pattern Rush). Thirteen distinct effects, pre decoded during the loading screen: tap, daub, streak, miss, call, charge, chip, oneaway, bingo, rivalwin, souvenir, back, start. Mono MP3 only.

### Art and effects

Player entity: the Lantern Keeper beside the caller, six baked frames over five states (idle three frame flicker, flare on a daub, streak, dim on a miss, win). Particle systems: daub sparks, ambient city embers, the win lantern release, chip charge shimmer, and call pulse rings. Screen shake and hit stop go through the GGKit juice budget and are gated by prefers-reduced-motion along with banner overshoot, cell pulsing and particle counts.

### Verification hook

`window.__lb.state` reports mode, screen, stage, stageName, city, pattern, progress, score, health, calls, callsLeft, streak, chips, rivals, souvenirs, cleared, best, ended, result and ready. `window.__lb.forceMode` accepts `tour`, `endless`, `rush`, `menu`, `map` or `case`, and `window.__lb.forceStage` picks the room or ladder. Both are read at boot and polled live every frame.

### Verified in this run

Booted headless at 390x844 dpr 2 against a local server, repeatedly across the fix rounds: zero console errors and zero failed requests every time, first frame renders, and every screen (title, tour map, souvenir case, rush ladder, play, pause, result) reached both through the force switches and through synthetic taps. Synthetic play in tour stop 13 daubed, scored, charged chips and raised the one away ring. Tour stop 1 was played to a decision (a rival closed the pattern at call 35), the result screen rendered and the save round tripped through GGKit validation with the tutorial flag persisted. The pause button opened and the RESUME button closed the pause screen by touch alone, which is the case that caught the input defect noted below. A Pattern Rush ladder was run until its call budget expired, exercising the rush fail path.

Fixed during the run, all found by probing rather than by reading:

- Hit zones were cleared at the top of the frame and rebuilt during render, so no tap ever landed. Zones are now consumed on the frame after the one that drew them.
- GGKit stops feeding its pointer map and its key set while the sim is paused, which made every pause menu button dead. The title now owns a window level pointer and key bridge installed after GGKit init; gameplay actions guard on the screen instead.
- Daub marks were drawn in SCREEN blend over light card paper and were invisible. They are opaque dauber discs now.
- The result and pause plates drew under the full screen shade because the shared menu objects sat below it in the depth ladder, and they inherited stale positions from whichever overlay ran last. Depths and positions are now restated per screen.

### Not run

The 4x CPU throttle frame trace could not be captured: the build machine was running the rest of the fleet (load average above 600, more than fifty concurrent headless harnesses), and a timing capture under that contention would be noise. The build is written to the perf rules that trace enforces (all art baked to canvas textures at load, every backdrop and card face pre baked and pre warmed before the loading screen hides, pooled particles and pooled card sprites, setTextIfChanged and setTintIfChanged guards on every HUD write, and the only per frame vector work is a 44 segment hand tessellated ring) but the number itself is unmeasured here and belongs to the orchestrator's gate run.

### Deferred

- Gate 6 belongs to the orchestrator: this build was only exercised against a local server, never the deployed URL.
- Rooms are races against rival cards rather than a shared drum with per rival draw order; every rival reads the same live call, which keeps the posted odds honest and the sim cheap.
- Endless Hall has no separate leaderboard beyond best score and best halls.

## Retina pass 2026-08-16

- Measured before/after canvas-to-CSS ratio: no per-title live measurement was available. The fleet baseline measured 1.00x for 62 titles and 1.10x to 2.46x for the remainder. The after audit was blocked when the prescribed runner could not bind its private port (`listen EPERM`), and no browser backend was available. Static target at DPR3 is 3.00x.
- Recipe: `GGKit.hiDpi.factor(390, 844)`, dense FIT scale dimensions, `GGKit.renderDefaults`, camera zoom in the scene create method, matching Text resolution, and `GGKit.hiDpi.canvas()` bakes with design-size display sizing.
- Factor cap: none beyond GGKit's default [1, 3] clamp.
- Could not capture the required gameplay screenshot, backing-store ratio, or gameplay color metrics in this sandbox. `node --check game.js` passes.
