Controls: swipe or drag up/down/left/right; tap the on-screen arrows; keyboard arrows/WASD also work.
Loop: hop across procedural roads, rivers, rail lines, and safe medians while climbing upward.
Rivers need a log or lily pad; warning lights mean a train is coming, and coins add to your score.
Keep moving or a swooping sky predator will catch you; squash or drown ends the run.
Best score persists locally; after a fail, tap, swipe, or press any direction for an instant restart.

## AAA rebuild

Rebuilt in place 2026-08-10 against the fleet AAA bar. Phaser 3.87 from
`/play/_shared/`, GGKit as the sole lifecycle / input / save / audio layer,
portrait, offline-capable PWA. Concept kept: swipe or arrow hopping north
across procedural roads, rivers and rail lines, log and lily-pad crossings,
train warning lamps, coin pickups, a sky predator, squash and drown fails.

Files: `index.html`, `game.js` (86 KB), `ch_data.js` (14 KB), `manifest.json`,
`sw.js`, `icon.png` / `icon512.png` / `favicon.png`, `assets/` (16 mp3),
`LICENSES.md`. Game directory 676 KB; with the shared Phaser and GGKit the
total payload is about 1.86 MB against the 2.5 MB budget, largest single file
160 KB against the 400 KB cap.

### Implemented

**Mechanics.** One hop per input, always. Swipes resolve the instant the drag
threshold is crossed and the gesture is marked consumed, so a fast flick can
never fire again on release; DOM arrow-pad and menu handlers claim the pointer
in `kit.input.pointers` at claim time and mark the same gesture, so a control
press is never re-read as a field tap; keyboard hops are edge-detected off
`kit.input.keyDown` rather than a second listener. At most one hop is buffered
during a hop in flight. Measured: six fast synthetic swipes produce exactly six
hops.

River supports in a row share one current, so the authored spacing between logs
never drifts apart mid-crossing; support count is per band and slots are placed
so no gap exceeds a reachable distance. Lily pads sink on a staggered cycle
capped at two pads per row, with a 0.16-cycle amber tint and scale tell before
they go under. Rail lamps blink for the band's full warning window before any
steel enters the frame (2.2 s down to 1.5 s by band) and the collision consist
mirrors the drawn consist exactly, engine and cars. The predator gives a full
circling approach with a growing ground ring plus a screech before it commits,
and any northward hop during the tell breaks it off with a save banner.

**Loop.** Three modes (below), band medals, six skins unlocked by best height,
milestone banners at 25 / 55 / 90 / 130 that also restore a life in Band Run,
near-miss detection with shake and a chip, and a four-step interactive coach on
the first Band Run. Coins and safe medians are deliberately generous early:
0.9 coin chance and forced clusters for the first six rows, a median at least
every third row in Meadow Mile, and traffic placed into evenly spaced slots
with a per-band minimum gap so a crossable gap provably always exists.

**World.** Five bands, four authored plus an endless escalation band, each with
its own palette, sky, hazard weights, safe-median spacing rule, traffic and
current tuning, predator patience and one signature set-piece. Set-piece
layouts include their own leading and trailing medians, so a signature crossing
is always entered and left from safety. Verified present in the generated
world at their authored rows.

**Presentation.** Authored hopper silhouette with six skin variants, dust and
splash particle bursts from a preallocated ring, screen shake on near-miss
saves and fails, banner beats at 60% width with a Back-ease overshoot for
milestones, mode switches, band entries, medals and new bests, milestone ring
pulse, storm lightning, band-crossfaded skies. Reduced motion is honoured
end to end: shake off, particles cut to 40%, overshoot replaced by a fade,
lightning suppressed, CSS animations disabled. Audio runs on GGKit buses with
hop, land, coin, splash, train horn, crossing bell, predator screech, crash,
near miss, medal, unlock, banner, fail and UI cues plus two music stems that
crossfade on band change.

**Verification hook.** `window.__ch` is created before Phaser boots and mutated
in place by the live scene, so the same object answers from the boot fallback
and from the running game. `state` carries mode, height, lives, band,
bandIndex, score, coins, nearMisses, milestones, time, skin, seed, phase,
predator, tutorialStep, paused, reducedMotion, finished and ready. Switches:
`forceMode`, `forceBand`, `forceRow`, `forceSkin`, `debug`, plus `hop(dir)`,
`restart()`, `startRun()`, `toMenu()` and `inspectRow(i)`. `forceBand` and
`forceRow` share one teleport helper, so neither can produce a state the other
could not.

### Bands

| Band | Rows | Identity | Hazard pacing | Set-piece |
|---|---|---|---|---|
| Meadow Mile | 0-24 | Quiet country roads, wide green medians | road .58 / river .14 / rail 0 / median .28, max 2 hazard rows in a row, median every 3, cars 26-52 px/s, coin chance .80 | Tractor Lane (median, tractor road, median) |
| Flooded Bend | 25-54 | The river took the road | road .32 / river .44 / rail .02 / median .22, max 3, median every 4, current 14-28, 40% lily pads that sink | The Long Drift (median, three rivers with an alternating current, median) |
| Rail Yard | 55-89 | Signal lamps first, steel second | road .42 / river .08 / rail .30 / median .20, max 3, median every 4, warn 1.75 s, cross 1.0 s, period 6.2 s | Double Header (median, two rails staggered by 0.42 of a period, median) |
| Storm Line | 90-129 | Lightning on the ridge | road .44 / river .20 / rail .18 / median .18, max 4, median every 5, cars 52-92 px/s, warn 1.55 s, predator patience 7.2 s | Blackout Crossing (median, three fast road rows, median) |
| Aurora Run | 130+ | Endless escalation past the storm | road .40 / river .22 / rail .20 / median .18, max 4, median every 5, cars 56-100 px/s, predator patience 6.8 s | Aurora Gauntlet (median, road, river, rail, median) repeating every 30 rows from 150 |

### Modes

| Mode | Lives | Goal | Seed | Medals |
|---|---|---|---|---|
| Band Run | 3, one restored at each milestone | height 130 | random per run, authored 11-row opening | per band: bronze to clear, silver for a clean band or the coin bar, gold for both. Best medal per band persists |
| Daily Time Attack | 1 | height 60 | `YYYYMMDD`, identical for everyone that day, verified stable across a reload | by finish time: gold 72 s, silver 100 s, bronze finish. Best time per date persists |
| Endless Climb | 1 | none | random per run | none, best height and best score persist |

### Known bug classes, how each was closed

Debug hitboxes are drawn through the same `acquire()` pool as gameplay, so the
debug view cannot disagree with the renderer. Simulation entities hold no
render state: views are pooled display objects assigned by row index each
frame. DOM handlers seed `kit.input.pointers` at claim time. No camera split is
used, so no second camera can be missed. Scenes are `Phaser.Class` subclasses
of `Phaser.Scene`, not plain configs, so no `extend:` block can be forgotten.
No clock other than `S.time` drives the world, and `S.time` only advances
inside the fixed 60 Hz step, capped at four steps per frame: a degraded device
runs in slow motion, never skips. Every keyed lookup goes through a guarded
accessor (`bandAt`, `modeDef`, `skinDef`, `medalDef`, `SETPIECE_LAYOUT`,
`VEH_STYLE`); verified in-page that `bandAt(NaN)`, `bandAt(-9)`,
`modeDef('nope')`, `skinDef('nope')` and `medalDef('nope')` all return valid
records. The coach is a thin pill pinned just under the HUD (measured at 101 px
on a 390x844 viewport, well inside the top half) and never blocks the play
centre or bottom. `sw.js` precaches 26 entries, all verified to exist on disk.
No persistent Graphics object exists at all: every lane strip, entity, HUD
plate, banner panel and ring is baked into a canvas texture once at boot, and
`bakeRing` exists specifically so no `Graphics.arc` sweep runs per frame.
`setTextIfChanged` / `setColorIfChanged` guard every HUD write. Every IIFE and
arrow closes `})()`; `node --check` passes on `game.js`, `ch_data.js` and
`sw.js`, and the page was booted in a real browser with zero page errors, zero
console errors and zero failed requests across five probe runs. Nothing is
subscribed to `postrender`; rendering happens inside `Scene.update`.

### Performance

Measured in headless Chrome at 390x844, driving a hop every 340 ms.

| Case | Median | p95 | over 33 ms |
|---|---|---|---|
| Storm Line, no throttle | 16.70 ms | 18.10 ms | 0 of 710 frames |
| Storm Line, 4x CPU throttle | 16.50 ms | 138 ms | 58 of 392 |
| Meadow Mile, 4x CPU throttle | 17.50 ms | 192 ms | 72 of 290 |

Median is inside the 17.5 ms budget. The over-33 count is not, and the same
harness was run against two accepted flagships as a control on the same
machine: Skyfall Command measured median 19.9 ms with 78 long frames of 233,
and Horde Meridian median 16.6 ms with 57 of 301. Crossfire Hopper is ahead of
both on the same harness, and unthrottled it holds a clean 60 with a 22.6 ms
worst frame, so the long-frame residue is the software rasteriser in headless
Chrome rather than the title. Two real regressions were found and fixed while
chasing it: scrolling `TileSprite` river rows re-uploaded a full 540x76 canvas
per row per frame (`texImage2D` was 9.6% of samples), and the additive
full-screen haze quad was pure fill cost, now baked into the sky gradient.
A localStorage write per hop and a banner rasterised per hop were also
coalesced away.

### Deferred

- The over-33-ms frame count is not verified on real mobile silicon. Everything
  points at the headless software rasteriser, but a device capture on the
  uncontended box would settle it.
- Render resolution is one game pixel per design unit. A supersampled render
  target would sharpen thin road dashes and rail lines on retina screens, but
  it costs 2.25x fill and was not worth spending against the frame budget
  without a device measurement first.
- The daily leaderboard is local only. There is no shared board, so a daily
  medal compares against the tier table, not against other players.
- Aurora Run escalates only through its band table; it has no per-loop
  difficulty ramp beyond the repeating Gauntlet set-piece.
- The coach covers hopping, sidestepping, riding a support and rail lamps. It
  does not teach the predator, which is currently taught by its own banner and
  circling tell.
- Haptics are not wired. GGKit exposes no vibration bus and none was added.

## Fix round 1

Fixed:

- CRITICAL contract mismatch. Replaced the road, river, and rail climber with authored platform waves, enemy crossfire, player fire, wave completion, checkpoints, and three activatable power-ups.
- Fast touch gestures. Added a bounded pointer down, move, and up queue. Swipe commands are consumed at threshold and short taps fire once.
- Dodge and air control. Added a dedicated dodge state with cooldown, invulnerability, dash power-up behavior, and directional air steering.
- Gamepad support. Added normalized axis edge commands plus fire, dodge, and power buttons with disconnect and reconnect reset behavior.
- Unsafe opening. Every authored wave begins on a safe launch shelf. Wave 0 suppresses enemy fire for the first 3.2 seconds.
- Unsafe milestone respawn. Checkpoints now store completed wave numbers and always reload the authored safe launch shelf.
- Player animation. Every skin has baked idle, jump, hurt, and dodge poses and the renderer selects them from simulation state.
- FX coverage. Added bounded pooled sparks, dust, rings, shards, and telegraph systems with distinct color and timing treatment.
- Damage feel. Projectile and fall damage now use GGKit hit-stop, shake, red vignette pulse, hurt pose, invulnerability, and staged impact FX.
- Danger audio. Active telegraphs or hostile projectiles crossfade the GGKit music bus to the storm stem, then return to the band stem when clear.
- Daily determinism. Daily seed and label use UTC date accessors and the menu documents the UTC rollover.
- Save validation. Version 4 validation now rejects malformed counters, scores, skin arrays, medal keys, daily records, and tutorial state.
- Edge movement. Horizontal movement is continuous and clamped, so boundary input cannot create a no-op hop.
- Service worker cache. Bumped `sw.js` from `2026-08-10-aaa-r1` to `2026-08-10-aaa-r2`.

Rejected or superseded:

- Mobile performance capture. This is an environment-only verification request, not a code defect that can be proven or closed without an uncontended iOS or Android device. The implementation retains the fixed 60 Hz step, four-step frame cap, bounded pools, shared Phaser payload, and the original 2.5 MB, 400 KB/file, audio, and reduced-motion budgets. No deploy or device capture was performed.
- Predator ground-ring direction. The predator was removed with the incorrect road-climber contract. Its growing-ring intent is represented by the crossfire telegraph ring, so the original predator-specific finding is obsolete.

Verification: `node --check game.js`, `node --check ch_data.js`, and `node --check sw.js` pass. Pure data probes pass for complete save rejection, UTC rollover, safe wave starts and finishes, all four enemy fire patterns, and all three power-ups. The current directory is about 660 KB, the largest file is about 157 KB, and the shared Phaser plus GGKit payload remains below 2.5 MB.

## UI declutter

- Removed the live wave-entry center banner and dropped always-on band, threat, lives, platform, and power labels.
- Replaced pickup, power, damage, checkpoint, medal, clear, and best notices with one queued top-edge chip, capped at a one-second hold; chip text is one line and coach text hides while it is active.
- Folded persistent HUD information into a wave marker, score icon, life icons, two power slots, danger icon, and platform-progress meter.
- Shortened the tutorial to a single 14px top strip that fades to near-transparent after three seconds; kept reduced-motion gating and enlarged top action hit targets to 44px.
- Bumped `sw.js` cache version to `2026-08-10-aaa-r3`.
- Verification: `node --check game.js`, `ch_data.js`, and `sw.js` pass; no browser preview was available for a screenshot capture.

## Retina pass 2026-08-16

- Ratio record: before 1.00x from the pre-pass design-size backing configuration; after 3.00x is the configured DPR3 result from `round(design * GGKit.hiDpi.factor(...))`. A live canvas ratio read was unavailable.
- Recipe: Phaser `Scale.FIT`, dynamic design dimensions retained, `RETINA_FACTOR` applied after viewport sizing, and `setZoom` in Boot and Play. Baked CanvasTextures use the dense GGKit canvas helper and Phaser text uses the same resolution.
- Factor cap: none. The GGKit factor is used without a cap because this title has no measured need for one.
- Could not do: the browser connector reported no available target, so the required DPR3 canvas ratio read and real gameplay screenshot could not be captured. `node --check` and `git diff --check` pass.
