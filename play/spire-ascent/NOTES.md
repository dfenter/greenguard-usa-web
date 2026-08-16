# Spire Ascent

Controls: TAP anywhere to leap, HOLD to charge the leap higher (the ring
around the climber and the CHARGE bar both read the charge); DOUBLE-TAP in
mid-air to dash, and dash into a wall for a wall-kick. Desktop: Space / W /
Up / Enter (hold to charge, double-press to dash), A/D or arrows nudge
direction, touch-drag left or right steers, R restarts, Esc or P opens
settings.

Loop: you auto-run and flip direction off the walls; climb seeded tower rows
of ledges, crumblers, springs, movers, wind zones and spike bands while the
lava doom line rises faster over time.

Scoring: score = climb height + combo bonus for consecutive clean landings +
medal, shortcut, ember and enemy bonuses. Hazards damage armor, knock the
climber back and grant a short invulnerability window; lethal hits consume a
room checkpoint when one exists.

Persistence: best score in localStorage for ENDLESS and separately for the
current UTC DAILY SEED, plus the all-time high mark that drives cosmetic
unlocks. Room checkpoints validate mode, seed and safe respawn coordinates.
Mode, climber skin and trail are chosen on the title screen.

## AAA rebuild

Rebuilt in place on 2026-08-10 against the fleet AAA bar. The archived
prototype (`game.js` + `world.js`, plain canvas, no kit) is gone; `world.js`
no longer exists and its generator is now the seeded `Tower` inside
`game.js`. Engine is Phaser 3.87 from `/play/_shared/` and **GGKit is the
sole lifecycle, input, save and audio implementation** - there is no second
pointer map, no second save path and no second audio graph in the title.

### Implemented

**Mechanics.** Hold-to-charge leap: a press launches at `JUMP_MIN` and the
hold window (`HOLD_MAX` 0.24 s at `HOLD_G` 0.30) buys height, so a bare tap
clears about 90 units and a full charge about 175 against a 76-unit row
pitch. The first six rows are a deterministic onboarding room with wide safe
landings, then wall and hazard practice begins. The charge is readable three ways at once: a twelve-pip ring around
the climber, a CHARGE bar in the safe strip, and a rising audible tick that
stops the moment the ring fills. Double-tap dash uses a 0.32 s window
measured on the **sim** clock, so a dropped frame slows the game rather than
eating an input; the dash-ready state shows as chevrons flanking the climber
and as the DASH bar. Dashing (or dashing within the 0.34 s memo window) into
a wall is a wall-kick: `WKICK` launch, direction flip, dash refunded, spark
burst, flash and shake. Wind zones push horizontally and updrafts lift; both
show as a tinted field, drifting chevrons, a climber lean, a WIND/UPDRAFT
chip with a strength arrow, and a throttled gust cue. Crumblers tell before
they break: a `crack` cue fires on contact, then the plank shakes with
rising amplitude and ramps orange over `CRUMBLE_TELL` 0.55 s. The doom line
reads at a glance from a bottom DOOM LINE meter that fills and reddens, a
red vignette that pulses, a rumble cue, shake pulses, and a music crossfade
to the peril stem.

**Loop.** ENDLESS with an escalating doom line and no ceiling, and DAILY SEED
as a time attack on the same UTC tower for everyone that day (goal 1200 m, par
210 s, time bonus paid on the summit). Combo streaks on consecutive clean
landings pay a rising bonus with a five-rung chime ladder and a flash every
fifth link; crumblers break the streak and **combo-refresh embers restore
it** to its pre-break value. Drops are deliberately generous: springs are 17
to 20 percent of ordinary rows before the generous bias, movers 12 to 30
percent, and an ember is guaranteed at least every fifth row on top of a 32
to 36 percent per-row chance. Five medal tiers at 250 / 500 / 1000 / 1750 /
2500 m each pay a bonus and a banner. Unlocks are driven by the all-time
high mark and chain across both cosmetic lines.

**World.** Four authored bands plus explicit checkpoint rooms, each with its own palette family, sky, two
parallax layers, wall strip, platform tint, hazard mix, signature set-piece
and one discoverable shortcut route. Past 1500 m the tower cycles bands 1 to
3 as BEYOND THE CROWN with an escalation multiplier, so an endless run never
runs out of authored identity. Landing three platforms of a shortcut route
in one band pays 260 and a SHORTCUT FOUND banner.

**Presentation.** Five authored climber silhouettes (not recolours: cloak
sweep, crest and trim differ) x eight player states, pooled enemy patrols and
telegraph bolts, timed power-up sigils, five trail variants, six pooled
particle systems (dust, spark, shard, trail, wind streak, glow), banner beats
at 60 percent width with a Back.easeOut overshoot for band, medal, unlock,
shortcut and mode beats, a thin fading coach strip in the upper quarter, and
GGKit audio buses driving 25 sfx cues plus two crossfaded music stems. All
art and audio is generated procedurally and documented file by file with
sha256 in `LICENSES.md`; nothing is hotlinked and no `.ogg` exists.

**Accessibility.** One pair of switches (GGKit's screen-shake flag plus the
title's own flash toggle) gates shake, hit-stop, the flash plate, banner
overshoot, vignette pulse, crumbler jitter, trail emission and particle
counts together, so the setting covers everything the player sees.

### Band table

| # | Band | Height | Identity | Hazard mix | Set-piece | Shortcut |
|---|---|---|---|---|---|---|
| 0 | FOUNDATION SCAFFOLDS | 0 to 280 m | Timber gantries, lamp oil, warm amber | springs and wide ledges, few crumblers, almost no wind or spikes | LAMPLIT GANTRY: five-step alternating staircase, ember on step three, spring at the top | CARGO HOIST: three springs stacked tight on the left wall |
| 1 | WINDSWEPT MID-SPIRE | 280 to 620 m | Banner decks, cold blue | movers dominant, 20 percent wind rows, first updrafts | BANNER BRIDGE: one 172-wide mover crossing the shaft with two static perches as an out | UPDRAFT FLUE: a lift column on the right wall with three narrow rungs inside it |
| 2 | CRUMBLING UPPER RUINS | 620 to 1020 m | Broken masonry, violet | crumblers dominant (34 percent), wall spikes and edge spikes climb | COLLAPSING NAVE: six-plank crumbling cascade that must be run, ending on one solid landing | FALLEN ARCH: three solid stone slabs on the left wall where nothing else holds |
| 3 | STORM-LASHED SUMMIT | 1020 to 1500 m | Indigo, stars, open sky | everything: fast movers, 26 percent wind, 17 percent spike bands, narrow ledges | LIGHTNING SPIRE: five narrow perches between two spike walls, spring escape at the top | STORM EYE: a still centre column of four springs |
| 1-3 | BEYOND THE CROWN | 1500 m and up | The three upper bands cycle every 380 m | band mix plus an escalation term on width, mover speed, spike height and doom speed | the band's own set-piece re-authors per cycle | the band's own shortcut re-authors per cycle |

### Mode table

| Mode | Seed | Doom line | Ends on | Score | Best key |
|---|---|---|---|---|---|
| ENDLESS | random per run | `(30 + min(t,220) x 0.40) x bandDoom x (1 + esc x 0.30)`, clamped to 780 units below the high mark | lava or spikes | height + combo bonus + medals + shortcuts + embers | `bestEndless` |
| DAILY SEED | `YYYYMMDD`, same tower for everyone that day | `38 + min(t,190) x 0.40`, fixed ramp, no escalation | 1200 m summit, lava, or spikes | as above plus `(210 - elapsed) x 10` time bonus on the summit | `bestDailyScore` + `bestDailySeed` |

### Cosmetic chain

| High mark | Climber | Trail |
|---|---|---|
| 0 | EMBERLING | DUST |
| 250 m | SLATE WARDEN | - |
| 400 m | - | CYAN RIBBON |
| 600 m | AURORA VANE | - |
| 900 m | - | EMBER WAKE |
| 1200 m | STORMCALLER | - |
| 1600 m | - | VOLTAIC |
| 2200 m | CROWNBEARER | - |
| 2600 m | - | PRISM |

### Verification hook

`window.__sa = { state }` is assigned at module scope, so it answers from the
boot fallback and from the live scene through the same object. It carries
`mode, height, bestHeight, combo, bestCombo, band, bandKey, bandName,
beyond, score, best, seed, elapsed, doomGap, doomProx, charge, dashReady,
wind, updraft, grounded, dead, why, medal, medals, shortcuts,
shortcutsThisRun, skin, trail, unlockedSkins, unlockedTrails, platforms,
embers, enemies, powerups, hp, room, checkpointRoom, power, dailyGoal,
dailyDone, phase, ready`. Test-only switches: `forceMode`
(`'endless'` / `'daily'`, honoured by both `init()` and `startRun()`),
`forceBand` (0 to 4; warps to that band's floor and drops a landing pad
under the climber so the switch reads as a band change and not a death),
`forceGenerous`, `forceUnlockAll` only when `window.__SA_TEST__ === true` is
set before boot. Every collection field is a rebuilt COPY refreshed on change,
never a live pool alias.

### Defect classes explicitly handled

- Fixed `STEP` of 1/60 with a hard four-substep cap: every clock the game
  owns advances only inside `step()`, so a degraded device gets slow motion
  and never a time skip.
- Sim entities are plain records in preallocated pools; the view binds a
  pooled display object to a record per frame and writes nothing back, so no
  render state rides on an entity.
- The HUD split uses a real second camera (`this.uiCam`), with each camera
  given the layer it must ignore.
- Scene literals are promoted to real `Phaser.Scene` subclasses by
  `toScene()`, so custom methods actually land on the prototype.
- The scene samples GGKit's pointer map and key set without installing a
  second listener system; every frame a claim whose pointer is no longer in
  the kit's map is released, so a lost `pointerup` cannot strand the climb
  control.
- Every keyed lookup has a guarded fallback: `BAND()`, `SKIN()`, `TRAIL()`,
  `PLAT_FRAME`, `CLIMBER_FRAME`, unknown HUD glyphs, and a save whose
  cosmetic ids fail validation against the live registry.
- No persistent Graphics object exists anywhere; all chrome is a baked
  texture, the charge ring is twelve pip sprites, and nothing calls
  `Graphics.arc`.
- Nothing subscribes to `sys.events` `'postrender'`.
- The coach strip is a thin fading plate in the upper quarter and never
  covers the play area centre or the bottom half.
- `sw.js` is authored from `/play/_shared/sw-template.js`; every one of its
  60 precache entries was checked to exist on disk before the file was
  written, and it does not precache itself.
- All IIFEs close as `})();`; `node --check` passes and the title was booted
  and driven in a real browser.

### Bugs found and fixed during the rebuild

- A full-score digit rendered **behind** the game-over dim plate: glyph
  images created lazily as a number grows were appended to the shared UI
  layer and inherited whatever depth was current. Each `NumberDisplay` now
  owns a container claimed at construction.
- The daily summit check sat after the doom check in the same step, so
  reaching 1200 m on the frame the lava arrived scored as a lava death.
  Reaching the goal now wins the tie.
- `forceMode` was only read in `init()`, which an in-place restart never
  re-runs, so the switch silently did nothing after the first run.
- Restarting called `scene.restart()`, rebuilding every pool, image and
  emitter in the title. It is now an in-place reset (`restartRun` +
  `resetBands` + `startRun`).
- A tap-through on the primary buttons: a dark plate multiplied by a warm
  tint stays dark, so dark label text on it was unreadable. Primary and
  selected lanes now use a dedicated light plate (`panel_lit`).
- The sky textures tiled with a hard seam every 480 units; they are now
  seamless in Y with wrapped light pools.
- The `1` numeral sat on the right of its cell, so `910` read as `9 10`.

### Performance work

Measured with headless Chrome at 390x844, 600 frames, 4x CPU throttle, a
bot pressing on landing. The first capture was median 16.7 ms with **95**
frames over 33 ms. Four changes closed it:

1. Full-screen layers that had faded to zero alpha were still being drawn.
   The idle parallax stack, the vignette and the flash plate are now hidden
   outright, and the lava strip and its glow are culled when the pool is far
   below the view. (95 -> 34)
2. `NineSlice.setSize` and `TileSprite.setSize` rebuild vertex data and were
   being called blind on every pooled object every frame. They are now
   guarded like every other setter, and the lava strip height is quantised.
3. Platforms were nine slices: nine quads each, 270 quads a frame for a 4 px
   corner radius. They are single stretched images now, scaled on the
   horizontal axis only so the cap and shadow bands keep their pixel
   thickness.
4. The debug view rebuilt four arrays every frame. They are change-driven
   now, and per-frame texture-manager frame lookups are served from two
   prebuilt registries.

Gate capture on a quiet box (load average under 5), seven runs of 600
frames each: median **16.7 ms** every time, p99 16.8 ms, and over-33 counts
of **0, 0, 2** in the opening band, **2** in the ruins, **0** on the summit,
**3** beyond the crown, and **0** in a final scaffold run. Gate is median
<= 17.5 ms and <= 6 over 33 ms, so every capture passes with headroom.

Earlier captures during the same session read 10 to 125 over-33; those all
landed while the machine was heavily loaded (load average 15 to 186), and
the flagship peer `skyfall-command` measured 23, 17, 10, 6 and 1 in the same
window on the same box, so those numbers tracked contention, not this
title.

Payload: 1.43 MB total, largest single file 222 KB (the music stems), both
inside the 2.5 MB and 400 KB budgets.

### Deferred

- **Orientation lock could not be verified headlessly.** GGKit reads
  `screen.orientation.type` first, and headless Chrome reports
  `portrait-primary` regardless of the emulated viewport, so the rotate
  overlay never appeared under test. The kit path is unmodified and shared
  with the shipped peers.
- **Service worker registration is untested.** `kit.registerPWA()` only
  registers over https and the verification server is plain http. The file
  itself was validated by hand: every path resolves on disk.
- **Bot-driven play is not a difficulty verdict.** The probe presses on
  landing through a CDP round trip, so its ceiling was about 128 m. The jump
  arc, row pitch and doom curve were tuned analytically (a full-charge leap
  clears roughly 175 units against a 76-unit pitch, and the doom line tops
  out just under a chained-jump climb rate). Human play testing is owed.
- **Shortcut discovery telemetry.** Shortcut routes are marked with a
  floating chevron and a warm platform tint, which is deliberately subtle.
  Whether players actually find them is unmeasured.
- **The near parallax layer is quiet.** It was pulled back to 0.30 alpha so
  a background beam can never be mistaken for a ledge; the bands now read
  mostly from sky and platform colour. A second pass could give each band a
  louder foreground motif that still cannot be misread as geometry.
- **No landscape layout.** The title is portrait only by design; the play
  column letterboxes on a wide desktop window rather than reflowing.

## Fix round 1

Fixed:

- CRITICAL 1: added pooled enemy patrols, telegraphed attacks, projectile bolts, dash kills, contact collision, enemy rendering and pooled feedback.
- CRITICAL 2: added validated room manifests, persistent seed-bound checkpoints, safe respawn pads, limited recovery uses and checkpoint resume.
- CRITICAL 3: added idle, walk, run, rise, fall, dash, land and hurt animation states with timed atlas keyframe alternation and hurt flash/recoil.
- MAJOR 1: raised the minimum jump to clear the 76-unit opening row by 16.25 units on the fixed-step arc.
- MAJOR 2: authored six deterministic safe onboarding rows before hazards, movers, crumblers and enemies enter the generator.
- MAJOR 3: added guard, surge and magnet power-ups with eight-second effects, HUD countdowns, pickup feedback and expiry timers.
- MAJOR 4: edge spikes now use overlap checks every simulation step, not only during landing.
- MAJOR 5: hazards now use armor damage, knockback, hurt timing, invulnerability and lethal recovery through checkpoints.
- MAJOR 7: removed the title's raw window input listeners and direct pointer-map writes. The scene now samples GGKit input state only; touch drag supplies direction.
- MAJOR 8: daily seed and label now use UTC dates.
- MAJOR 9: added explicit room entry, exit, transition banners and checkpoint boundaries while retaining endless generated rooms beyond the crown.
- MAJOR 10 applicable portion: enabled Phaser pixel-art, nearest-neighbor and pixel snapping flags.
- MAJOR 11: daily summit now uses `completeRun()` with victory feedback and no death cue or death path.
- MAJOR 12: normal movement now accelerates and decelerates toward the auto-run target instead of resetting velocity each frame.
- MAJOR 13: added bounded 42 to 64 ms hit-stop to dash impacts, wall-kicks, damage, pickups and completion.
- MINOR 1: the flash-effects setting now gates flash plates, banner overshoot, vignette pulse, crumble jitter, trail emission, title particles and burst counts.
- MINOR 2: wind streaks now emit while the player occupies a wind field.
- MINOR 3: crumbler jitter is deterministic from simulation time and platform coordinates.
- MINOR 4: save validation now allowlists medal and shortcut keys, requires booleans and validates checkpoint fields.
- MINOR 5: mutating force controls are test-only behind `window.__SA_TEST__`.
- MINOR 6: corrected the documentation to 25 SFX and 60 service-worker precache entries; bumped `sw.js` to `2026-08-10-fix-round-1`.
- MINOR 7: very short title layouts hide cosmetic rows and reserve non-overlapping play and settings buttons.

Rejected or constrained:

- MAJOR 6 gamepad subfinding: touch direction parity is fixed, but the shared GGKit in `/play/_shared/` exposes no gamepad action API. Adding a second `navigator.getGamepads()` input implementation in this title would violate the brief's GGKit-only input rule and the work-only directory constraint.
- MAJOR 10 literal 3x to 4x virtual-column rewrite: rejected as inapplicable to this vertical arcade title. The cited top-down art-bible geometry would invalidate the authored 390-unit play column; the applicable crisp pixel-art renderer requirements are enabled.

## UI declutter

- Cut live center banners for hits, checkpoints, shortcuts, combo restores,
  power-ups, room changes, band changes and unlocks; they now use one queued
  edge chip with a one-second hold. Center treatment remains for run start and
  medal ceremony, while run-end details stay on the results screen.
- Cut repeated SCORE, BEST, COMBO, CHARGE, DASH, WIND, DOOM LINE and ARMOR
  labels; kept the score/height numbers, colored meters, wind arrows, power
  timer and armor-heart state.
- Shrunk the persistent HUD into a top-safe cluster, moved charge/dash, wind,
  power, armor and doom meters out of the thumb zones, and removed the live
  band/mode description plates.
- Replaced the multi-line coach copy with one 26px top strip, one line, max
  three seconds, first-run only, with reduced-motion gating preserved.
- Bumped `sw.js` to `2026-08-10-ui-declutter-1`.
- Verification: `node --check game.js` and `node --check sw.js` pass; a live
  browser screenshot was unavailable in this environment.

## Retina pass 2

- Measured ratio after the required delayed DPR-3 sample: unavailable. The corrected configuration targets 3.00x, or 1170/390.
- Converted the parented title and play scenes to `GGKit.hiDpi.phaser`, `Phaser.Scale.NONE`, and `cfg.ggDpr`; title, play, and HUD cameras are centered, the split HUD viewport uses dense scale dimensions, and logical layout is derived from the scale dimensions.
- Could not do: delayed `retina_audit.mjs`, gameplay screenshot, live input/core-mechanic check, or `live_probe.mjs`. The harness could not bind its private port (`listen EPERM`), and no browser surface was available. Node syntax and diff checks passed.

## Retina pass 2026-08-16

- Measured before ratio: unavailable for this title in this environment. Fleet baseline was 1.00x for 62 titles, with the remainder from 1.10x to 2.46x.
- Measured after ratio: unavailable because no browser backend was exposed. The helper path targets 3.00x at DPR 3, but that is not a captured measurement.
- Recipe: Phaser `Scale.RESIZE`; initial sizing, resize, orientation change, and visibility change all call `GGKit.hiDpi.resize`.
- Factor cap: none; the GGKit DPR cap of 3 applies. No title-specific cap was justified.
- Could not do: DPR 3 backing-store read or gameplay screenshot. Browser discovery returned no browser, and local HTTP port binding was denied.
