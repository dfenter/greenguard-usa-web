Tubeshock is a portrait tube-shooter prototype.
Slide or drag along the lower play area to move the claw around the rim.
The claw auto-fires; press SURGE to clear enemies near the rim.
Keyboard: arrows/WASD move, Space or Enter activates SURGE.
Reach higher levels, protect 3 lives, and beat the best score saved on-device.

## AAA rebuild

Rebuilt in place 2026-08-10 against the fleet F4 brief. The archived prototype
(raw canvas, single file, four cosmetic geometries, no modes) is gone; the
concept it documented is kept intact: portrait tube shooter, claw on the rim,
auto fire plus a rim clearing SURGE, procedural tube geometry, score attack
with levels and lives.

Engine is Phaser 3.87 from `/play/_shared/`. GGKit is the sole lifecycle,
input, save and audio implementation. No asset file ships except the three PWA
icons: every sprite, background plate, particle texture, music bed and SFX cue
is generated procedurally at boot. Full trace in LICENSES.md.

### Implemented

**Mechanics.**
- Rim locked claw on a continuous, never wrapped angular target. Drag is
  accumulated as *shortest arc* deltas from the pointer angle about the tube
  centre, so crossing the wrap point cannot jump, and because neither
  `clawAng` nor `clawTarget` is ever wrapped the smoothing lerp cannot snap
  the long way round. Inside 0.22R (where `atan2` goes unstable near the
  vanishing point) control falls back to a horizontal slide mapping. Keyboard
  arrows/WASD move, Space or Enter fires SURGE, all read through
  `kit.input.keyDown` so a paused sim ignores held keys.
- Tuned auto fire: cadence `clamp(0.225 - tier*0.0045, 0.105, 0.225)`. A
  target lock picks the threat closest to the rim inside a 0.34 rad cone,
  draws a spinning reticle on it plus a faint tracer from the claw, plays a
  lock chime on acquisition, and gives each shot 62 percent of the lock offset
  at spawn with light in flight homing. Aim assist is therefore *visible*, not
  a hidden accuracy fudge.
- SURGE: a 0..100 meter, filled by hits (+1.2), kills (+5 plus archetype
  value) and SURGE cells (+50), shown as a radial arc ring around the DOM
  button and as a percentage on the button face, which switches to a lit
  "ready" state at 100. Release fires a shockwave that travels rim to core
  killing everything it passes, strips boss plate armour, cancels a live
  hazard, and pays a flash, a shake, hit stop and a banner.
- Spawn telegraphs: every spawn lights its whole lane from core to rim for
  0.62 s with a pulsing chevron running outward before anything appears.
  Hazards telegraph for 1.5 s with their own banner and warn cue. Boss lane
  beams telegraph for 0.85 s at 2 px before firing at 9 px.

**Gameplay loop.**
- Six Depth Runs, each a chain of seeded tube segments (table below) with a
  transit flourish between segments, then a medal.
- Score Attack: a 90 s sprint, families cycling every 22 s, tier climbing
  0.14/s, one life pool, best score saved on device.
- Core Breach: the sixth run ends on the multi phase TUBE GUARDIAN, and is
  also selectable straight from the menu once the ladder is cleared.
- Medals per depth run from score + depth reached + accuracy (see calibration
  note in `ts_data.js`); the unlock chain opens run N+1 on any completion of
  run N.
- Interactive first run tutorial, three steps (move, auto fire and lock,
  SURGE). Each step advances when the player actually does the thing, and it
  is a **thin fading strip pinned under the HUD band at the top**, never over
  the play area centre and never in the bottom half.
- Generous drops, per the owner's standing rule: 34 percent base chance per
  kill, a pity counter that guarantees a drop every 6 dropless kills, and a
  scarcity tilt that biases the roll toward whatever the player is short of.
  Four pickups: SURGE cell (+50), score x2 (9 s), shield ring (absorbs one
  breach, stacks to 3, drawn as rings around the claw), life shard (cap 6).
  Drops ride out to the rim and then hug it, so a generous drop is never a
  drop the player cannot reach.
- Five enemy archetypes: crawler, spinner (weaves lanes), zapper (parks short
  of the rim and sweeps sideways, a lane threat you slide away from), pulsar
  (splits into two crawlers), shielder (front plate eats shots inside a 0.55
  rad arc, so it must be flanked or surged).

**Presentation.** Authored claw sprite with idle/charge/fire states (charge
holds while SURGE is banked), 20 enemy sprites (five silhouettes restyled per
family so the read is learnable but the family is unmistakable), SURGE
shockwave ring and impact VFX, tunnel depth parallax on three dust layers, six
pooled particle systems (kill, shard, surge, breach, pickup, hazard), 60 percent
width banners with a Back.easeOut overshoot on segment change, hazard arm,
medal award and run completion, reduced motion gating (one `motionOn` /
`flashOn` pair covers shake, hit stop, flash plate, red vignette and particle
counts, and a `prefers-reduced-motion` device starts with it off), and GGKit
audio buses carrying three music beds (tube ambience, drive layer above tier 9,
guardian) and seventeen SFX.

### Depth run table

| # | Run | Segments (family x seconds) | Tier range | Boss | Medal bronze/silver/gold |
|---|---|---|---|---|---|
| 1 | FIRST LIGHT | neongrid 32, neongrid 36, biotube 38 | 1.0 - 2.6 | no | 9k / 16k / 26k |
| 2 | GREEN THROAT | biotube 36, biotube 40, neongrid 38, crystal 40 | 3.0 - 5.4 | no | 30k / 53k / 85k |
| 3 | FACET RUN | crystal 38, crystal 42, geartube 40, biotube 42 | 5.6 - 8.2 | no | 52k / 92k / 148k |
| 4 | IRON DESCENT | geartube 40, geartube 44, crystal 42, neongrid 44, geartube 44 | 8.4 - 11.8 | no | 101k / 177k / 284k |
| 5 | SHATTERLINE | neongrid 40, biotube 42, crystal 44, geartube 46, crystal 46 | 12.0 - 15.6 | no | 140k / 245k / 394k |
| 6 | CORE BREACH | geartube 38, crystal 40, biotube 40, guardian | 15.0 - 18.6 | yes | 92k / 161k / 259k |

Score Attack is not medalled: 90 s, families cycling neongrid, crystal,
biotube, geartube, scored against the on device best.

Guardian phases: PHASE ONE break four armour plates (6 hp each, orbiting at
depth 0.46, adds every 3.1 s); PHASE TWO at two plates left, lane beams every
2.6 s across three lanes, tube counter spins; FINAL PHASE at zero plates, core
open for 26 hp, beams every 1.9 s across four lanes, adds every 1.8 s.

### Tube family table

| Family | Shape | Lanes | Spin | Density (base/growth/floor) | Mix | Signature hazard |
|---|---|---|---|---|---|---|
| NEON GRID | round | 12 | +0.06 | 1.02 / .052 / .30 | crawler .46, spinner .26, zapper .18, pulsar .10 | PULSE GATE: a 0.9 rad lit arc sweeps the rim at 0.55 rad/s for 7 s |
| BIO TUBE | breathe (3 lobes + uniform pulse) | 10 | -0.10 | 1.16 / .058 / .34 | crawler .38, pulsar .26, shielder .18, spinner .18 | SPORE BLOOM: five adjacent lanes light and spawn at once, pulsar in the middle |
| CRYSTAL SHARD | star (7 facets) | 14 | +0.14 | 0.94 / .046 / .28 | spinner .34, crawler .30, zapper .22, shielder .14 | SHARD LATTICE: 3 to 5 four hp facets park mid tube and eat shots until broken |
| GEAR WORKS | teeth (8 + 4 harmonic) | 16 | -0.26 | 1.08 / .050 / .31 | crawler .34, zapper .26, shielder .22, pulsar .18 | GEAR SWEEP: a 0.62 rad arm plus radial spoke turns at 1.05 rad/s for 9 s |

Enemies also drift with `family.spin * 0.55` while the claw does not, which is
what makes the gear works feel like it turns under you.

### Verification hook

`window.__ts = { state }` is ONE object created before Phaser boots and adopted
unchanged by the live PlayScene, so a switch flipped during boot is honoured
and a switch flipped mid run is picked up on the next sim step
(`pollSwitches`). Reported: `mode, phase, score, level, lives, surgeCharge,
surgeReady, runKey, runName, tubeFamily, tubeFamilyName, segment, segments,
tier, depth, shots, hits, accuracy, enemiesAlive, hazard, hazardPhase, shields,
multiplier, boss{active,phase,plates,coreHp,maxCoreHp}, tutorialStep, medals,
unlockedRuns, bestSprint, livePickups[14]`.

Switches: `forceLevel` (0 based segment index), `forceTubeFamily`, `forceBoss`,
`forceHazard`, `forceGenerousDrops`, `forceSurgeFull`, `forceInvincible`.
Also `window.__TS_SCENE()` for the live scene and `window.__TS_DBG()` for a one
line trace.

`livePickups` is fourteen preallocated records refreshed in place once per
painted frame. It is never the pickup pool itself, so a harness reading the
view cannot truncate or mutate a live pool.

### Known bug classes, how each is handled

- **Debug view separate from preallocated pools.** `TS_STATE.livePickups` is
  its own array of plain records; `pushDebug` copies scalars into them.
- **Per entity render state on the sim record.** Every pool is two arrays: the
  sim record (`enemies[i]`) and the view record (`enemyView[i]`, holding the
  sprite, texture key, spin and hurt tint latch). The renderer only ever
  touches the view.
- **DOM handlers must seed `kit.input.pointers` at claim time.** Both DOM
  controls (SURGE, pause) seed the kit map with the kit's own record shape
  tagged with a `zone`, capture the pointer, and delete the entry on up,
  cancel and lost capture. The playfield only claims a drag from a pointer
  with **no** zone, so a thumb on SURGE can never also steer the claw.
- **Camera splits must create the second camera.** Nothing here splits; one
  camera, `setScroll` for shake.
- **Phaser plain config scenes need `extend:`.** All three scenes go through
  `toScene()`, which promotes the literal to a real `Phaser.Scene` subclass
  with its whole method set on the prototype.
- **Test switches from boot fallback AND live scene.** One `TS_STATE` object,
  as above.
- **No clock past the stepped sim.** The accumulator drains at most
  `MAX_STEPS` fixed 1/60 steps; leftover beyond the budget is dropped, and the
  paint pass is driven by `simDt = steps * STEP`, never by wall `delta`. A
  device that cannot keep up gets slow motion, never a time skip. Hit stop
  freezes the cosmetic clock only.
- **Guarded fallback on every variant lookup.** `familyOf / enemyOf / runOf /
  pickupOf / hazardOf / shapeOf / shapeSegments` all return a real row on a
  miss, and enemy texture keys fall back to `en_neongrid_crawler` if a key is
  somehow absent.
- **Coach UI is a thin fading strip.** 26 px tall, pinned under the HUD band at
  the top, fades in and out, never modal.
- **sw.js precaches only files that exist.** Ten entries, all present; there is
  no `assets/` directory to get wrong.

### Verified

`node --check` passes on `game.js`, `ts_data.js`, `sw.js`; `manifest.json`
parses. Driven in headless Chrome at a pinned 390x780 portrait frame:

- Boot to title with zero console errors, page errors and failed requests
  across the whole session (a `'#000NaNbb'` colour string from a decimal padder
  applied to a hex value crashed the first boot and was fixed).
- Title, depth run list, run launch, in game drag steering, DOM SURGE release,
  segment transit banner, results card, MENU return, Score Attack launch,
  settings overlay.
- All four families and all four signature hazards driven through
  `forceTubeFamily` + `forceHazard`; `forceLevel` jumps segments; the guardian
  runs phase one to two to final and is defeated, which fires the unlock chain
  (`unlockedRuns` 1 to 6).
- A scripted perfect player completes FIRST LIGHT: score 49,809, depth 1,060 m,
  accuracy 0.319, rating 56,817, gold. Used as the medal calibration anchor.
- Payload 392 KB total, largest file `icon512.png` at 174 KB, largest script
  `game.js` at 122 KB. Both budgets clear with a wide margin.

### Could not run / residuals

- **Frame budget could not be measured on this box.** Median frame time is
  16.70 ms at 4x CPU throttle, inside the 17.5 ms budget. The `<=6/600 over
  33 ms` half of the budget did not reproduce meaningfully: this harness
  reports 82-143 frames over 33 ms per 420 for *every* title tested, including
  the shipped, accepted `skyfall-command` (82) and `horde-meridian` (115), and
  disabling Tubeshock's entire `paint` **and** its entire `step` did not reduce
  the count (92 and 86 respectively against an 85 baseline). The stalls are
  whole multiples of the vsync interval, i.e. compositor stalls in headless
  Chrome on a contended box, not title work. Needs a re-capture on an
  uncontended box before the perf gate is called. An optimisation pass was
  taken anyway (ring sampling tied to shape frequency instead of a flat high
  count, dust 108 to 48, spoke samples 8 to 5, score popups only above 400
  points, the debug view moved from per step to per painted frame, and the
  enemy tint latched instead of set and cleared every frame), which moved the
  count from 143 to ~85-124 run to run.
- **Medal thresholds for runs 2 to 6 are projections, not measurements.** Only
  FIRST LIGHT was measured against a perfect player. The other five are
  projected from that point through `sum(segment duration x segment tier)` at
  gold 0.45 / silver 0.28 / bronze 0.16 of the projected ceiling. A full
  ladder playtest should re-measure them; the method is documented in
  `ts_data.js` above the `MEDAL` table.
- **Icons were generated by a throwaway Pillow script that is deliberately not
  shipped** (dev tooling must not ship, and the brief scopes work to this
  directory). To reproduce: 4x supersample, vertical `#070c1e` to `#04070f`
  ground, a blurred core bloom at (0.5, 0.46), seven receding 72 gon rings from
  `0.045S` to `0.39S` ramping violet to cyan with a widening glow stroke, twelve
  faint lane spokes, then the claw drawn as the same dart plus prongs used
  in game at the bottom of the near ring with a gold tracer to the core;
  Lanczos down to 192, 512 and a 16/32/48/64 ico.
- **`assets/` directory is intentionally absent.** `/play/_assets/` ships no
  binary files at all, so the brief's second branch (generate procedurally in
  code) was taken end to end rather than curating a pack cut. No ledger row is
  consumed and no other title's directory is referenced.
- Audio ships as in memory WAV blobs rather than files. If any cue is ever
  promoted to a shipped file it must be mp3 or m4a; there is no ogg here and no
  ogg path is referenced.

## Fix round 1

Fixed:

- Critical save crash: saves now require the complete schema, bounded unlock progress, valid medal values, and finite nonnegative score maps before any run-list access.
- Major touch ownership: DOM control claims are restored after GGKit's global pointer seed, preserving the control zone during propagation.
- Major keyboard menu and result navigation: arrows or WASD move focus, Enter or Space activates, and Escape returns from the run list.
- Major hit-stop: fixed-step simulation does not advance while `kit.juice.frame().frozen` is true.
- Major tutorial completion: movement, a kill, and SURGE are required in order; a run ending early no longer marks the tutorial complete.
- Major ordinary-kill feedback: all kills receive staged death animation, score popups, particles, calibrated shake, hit-stop, and flash feedback.
- Major enemy animation states: idle, telegraph, hurt, and death textures are generated for every family and archetype and selected by simulation state.
- Major HUD shake layering: HUD, overlays, surge meter, boss bar, flash plate, and vignette are screen-fixed with scroll factor zero.
- Major pickup pity: pity resets only after a slot is secured; a full pool preserves the debt and a forced roll may recycle a nearly expired pickup.
- Major Score Attack music: the drive layer crossfades when sprint tier crosses the danger threshold.
- Minor pool exhaustion: overflow counters are exposed in `window.__ts.state.poolOverflows`, and full popup pools recycle the shortest-lived entry.
- Minor retry input leak: retry now routes through `kit.restart()`, which clears GGKit pointers and keys first.
- PWA cache invalidation: bumped `sw.js` to `2026-08-10-aaa-fix-1`.

Rejected or not changed:

- Major gamepad input: GGKit in `/play/_shared/ggkit.js` exposes no gamepad adapter. A raw `navigator.getGamepads()` path would violate the brief's GGKit-only input rule, so no out-of-contract input implementation was added.
- Major medal thresholds: this is a full-ladder playtest measurement request, not a code defect. Existing projected thresholds remain documented until an interactive playtest is available.
- Major performance gate: this is an uncontended-device capture request, not a code defect. The existing median capture and compositor-stall limitation remain documented; code budgets remain within brief.

Checks: `node --check` passed for `game.js`, `sw.js`, and `ts_data.js`; payload is 406,652 bytes and the largest file is 177,616 bytes.

## UI declutter

- Cut floating score popups, repeated HUD captions, and banner subtitles; score, lives, depth, surge, buffs, pickups, and boss state remain in compact meters/icons.
- Shrunk live feedback into one queued top-edge chip (14px, 1.0s max): hazards, pickups, SURGE, shields, life loss, and family changes no longer use center banners.
- Kept center banners only for run/segment/boss boundaries, shortened tutorial copy into one 14px strip, and faded it near-transparent after 3s.

## Retina pass 2026-08-16

- Measured before ratio: unavailable for this title in this environment. Fleet baseline was 1.00x for 62 titles, with the remainder from 1.10x to 2.46x.
- Measured after ratio: unavailable because no browser backend was exposed. The helper path targets 3.00x at DPR 3, but that is not a captured measurement.
- Recipe: Phaser `Scale.RESIZE`; initial sizing, resize, orientation change, and visibility change all call `GGKit.hiDpi.resize`.
- Factor cap: none; the GGKit DPR cap of 3 applies. No title-specific cap was justified.
- Could not do: DPR 3 backing-store read or gameplay screenshot. Browser discovery returned no browser, and local HTTP port binding was denied.
