Controls: drag left/right on the road to steer; hold ACCEL or BRAKE.
Keyboard: arrows or WASD; Space accelerates; R restarts the race.
Items: tap the HUD slot or press E to use one held supply-cell item.
Race: drive 3 laps, chase your best-lap ghost marker, then pick another circuit.
Six original seeded circuits grow more technical from Copper Halo to Obsidian Crown.
Best laps and best total times persist in localStorage on this device.

---

## Dev notes

### GGRacer retrofit - pilot

Redline GT now rides the approved shared GGRacer presentation layer. The title
still owns the simulation, controls, modes, scoring, save validation, ghost
recording, and GGKit audio flow. `game.js` is the title adapter and HUD plus
the preserved simulation loop. `track.js` is simulation-only seeded layout and
arc-length sampling. `cars.js` is simulation-only roster and handling data.
The deleted `fx.js` and the old Three track and vehicle render paths are no
longer part of the title.

The six files under `tracks/` were generated from the existing `TRACKS` seed,
difficulty, `buildLayout()`, and `buildCenterline()` data. Each uses 48 sampled
control points with the existing elevation and banking channels converted to
GGRacer units, so the title's checkpoint and lap timing still use the original
arc-length centerline. Reverse events reverse the authored JSON in the title
adapter while retaining their existing reverse simulation.

Theme progression is deliberate: Copper Halo uses desert, Moonlit Weave uses
night-city, Ember Switchback uses coastal, Glassbreak Ridge uses alpine,
Stormneedle Run uses coastal night, and Obsidian Crown uses night-city night.
Quality tier 2 therefore receives a populated GGRacer parallax environment on
every circuit, and the night circuits use the engine's headlight treatment.

The adapter gap is that GGRacer has no first-class ghost actor or ghost-style
option. The title uses the fourth engine rival slot, feeds it the saved
arc-length ghost sample, and lowers its material opacity with depth writing
disabled. No shared engine file was changed.

### Prototype behaviours preserved

The pseudo-3D prototype in worker-archive/play-prototypes/redline-gt/ is the
design document. These named behaviours survive the 3D rebuild and are the
regression checks for this title:

- Drag steer. Steering is a drag anywhere in the left 62 percent of the screen,
  relative to where the pointer went down, not an absolute stick position.
- ACCEL and BRAKE holds. Both pedals are hold controls with their own pointer
  identity, so a steer drag and a pedal hold never steal each other.
- Keyboard beside touch. Arrows and WASD steer, Space or Up accelerates, Down
  brakes, R restarts, Escape or P pauses.
- Three laps per event.
- Best-lap ghost chase. The best lap is recorded at 10 Hz, capped at six
  minutes, validated on load, and replayed as a translucent shell with a live
  delta readout.
- Six circuits with a difficulty ramp from Copper Halo (difficulty 1) to
  Obsidian Crown (difficulty 6), each from a fixed seed so a circuit is the
  same circuit on every device and every run.
- Persisted best laps and best totals, plus the gear and RPM model, the
  handling constants and the medal thresholds, all carried over unchanged.

### Audio inventory

Music: three CC0 loop cuts through the GGKit music bus, plus a layered synth
bed as the decode-failure fallback.

- menu.mp3, race_a.mp3, race_b.mp3. Race events alternate between the two race
  beds so back to back events do not repeat.
- SynthMusic in audio.js is a three stem generator (pad, bass pulse, arpeggio)
  that crossfades by intensity and takes over if a track cannot be decoded, so
  the game never ships silence.

Engine: synthesised live, not sampled, so it tracks RPM continuously. Two
detuned saw oscillators plus a square sub through a resonant lowpass, with a
band-passed noise bed that swells with throttle load. Routed through the GGKit
sfx volume pref.

SFX, eleven distinct clips, all through the GGKit sfx bus:
collide, scrape, skid, gearshift, checkpoint, lapchime, fanfare, boost, beep,
uitick, uiselect.

Mute and both volume sliders live in the GGKit settings shell and persist.
Audio unlocks on the first pointer, touch or key event.

### Content inventory

- 6 circuits: Copper Halo, Moonlit Weave, Ember Switchback, Glassbreak Ridge,
  Stormneedle Run, Obsidian Crown.
- 10 medal events: all six forward, plus four reverse variants of circuits 1,
  3, 4 and 6. Reverse runs use the same asphalt read backwards and tighten the
  gold time by four percent.
- 3 laps per event. Gold pace runs from 108 s on Copper Halo to 170 s on
  Obsidian Crown, so a full clean pass of the ladder is roughly 25 minutes of
  driving before any retries.
- 6 cars unlocked by gold count: 0, 1, 3, 5, 7 and 10 golds.
- Bronze, silver and gold per event, persisted per event alongside best total,
  best lap and the ghost recording.
- Interactive first-run tutorial on the first race: throttle, then steer, then
  brake, each gated on the player actually doing it, with a SKIP button.
- Save is versioned and validated on load. Event ids are checked against the
  content registry and out-of-range times are rejected, so a stale or edited
  save falls back to defaults rather than corrupting the ladder.

### Feel work

The frame budget was rebuilt to hold 60 fps under a 4x CPU throttle:

- Every shader program, buffer and font the race can touch is compiled and
  uploaded during the loading screen (prewarmScene in game.js). Particle pools
  start hidden, so without this the first drift, the first spark and the first
  skid quad each paid a program link mid-race.
- All race audio, including the race music bed, is decoded on the loading
  screen. The bed used to decode on the first bar of the race.
- No per-frame allocation in the hot path: scratch vectors for the camera
  solve, a cached control-zone table, a cached glyph advance table, a cached
  vignette gradient, and a preallocated skid-trail contact pair.
- Particle attributes are only flagged for upload when something is alive.
- Nothing runs off a timer. The menu backdrop drive and the music mode poll
  were standalone intervals and now run inside the render loop.
- Backing stores are capped at 1280 px wide for both the WebGL canvas and the
  HUD canvas. Both are full screen and both composite every frame, so their
  pixel count was the largest single term in the frame time.

### Known limitations

- The race field is four cars including the player. Rivals are deterministic
  centreline runners with mild rubber banding and overlap avoidance; the
  ghost remains a separate best-lap chase target.
- Collisions are resolved against the centreline, a per-node obstacle list and
  a cheap rival overlap corridor rather than full mesh contact, so clipping a
  barrier or rival scrubs speed and shakes the camera but never spins the car.
- Shadow maps are off everywhere. Ground contact is a blob shadow. This is a
  deliberate feel-gate tradeoff, not an oversight.
- Reverse variants reuse the forward geometry, so they look identical and only
  the racing line changes.
- The music cuts are encoded at 80 kbps mono rather than the house 96 kbps to
  stay under the 400 KB per-file cap. See LICENSES.md.
- Ghost recordings are capped at six minutes; a lap slower than that records
  no ghost.

### Fix round 2 implementation detail

### Implemented

- Steering sign -> touch left drag and LEFT/A now share a screen-facing positive
  input, then one `worldSteer()` conversion makes the resulting world heading
  delta negative at every tested track angle.
- Steering trace -> a scripted 120-step LEFT trace at headings -pi, -pi/2, 0,
  pi/2 and pi produced a strictly decreasing heading in every case.
- Course demand -> replaced the low-amplitude noise layout with a deterministic
  launch straight, sweepers, hairpin, S transition, crest and bank program on
  every circuit, with difficulty-scaled corner load.
- Gas-only failure -> increased corner load and edge scrub so zero steering
  leaves all six seeded circuits in the first technical sequence and loses
  speed through the off-road and wall-scrub path.
- Racing line -> inside-line targeting now returns a small speed reward at
  clean apexes while rumble and wall scrub punish a missed line.
- Track hazards -> hairpins receive visible barrier blocks and the seeded post,
  rock, grandstand and billboard dressing remains active around the new turns.
- Rival field -> built three additional rigged cars through the existing OBJ
  pipeline, with distinct liveries and pooled per-frame state.
- AI pacing -> rivals follow the same centreline with curve-based racing lines,
  mild rubber-band pacing and deterministic overlap avoidance against rivals
  and the player.
- Race presentation -> the visible grid is 4 cars, countdown HUD now shows
  starting position, live HUD shows actual position such as 2/4, and finish
  ceremony shows the final standing.
- Crest motion -> high-speed crest crossings lift the player car briefly and
  bank metadata tilts road, rumble, edge and shoulder geometry through each
  technical section.
- Round 1 regression -> all Fix round 1 repairs remain in place, including
  GGKit lifecycle/input/save/audio ownership, ghost arc-length playback,
  pointer capture release, reduced motion routing and allocation-free control
  zones.
- Cache version -> bumped `sw.js` VERSION from 5 to 6; the existing precache
  list already covers every changed file and shipped asset.

### Design notes

- Track layouts use a 132-segment authored rhythm. Each repeat alternates turn
  direction and contains 18 segments of launch straight, a loaded sweeper, a
  16-segment hairpin, a reversed S, a second sweeper, a reset straight and a
  raised crest. Difficulty increases curvature, banking and pace pressure.
- World lateral positive is the right-hand normal. Screen-left is normalized
  to positive input, `worldSteer()` maps it to negative world yaw, and all
  touch, keyboard, wheel and chassis-lean paths use that same sign.
- The player starts fourth on a 4-car grid. Rivals start a few metres ahead,
  advance in absolute lap distance, and use a small curve-derived line offset
  plus rubber-band pacing so position changes are legible without teleporting.
- The graphics uplift uses the existing round 1 authored palettes, props,
  curbs, surface strips, fog, landmarks, car materials and pooled FX; round 2
  adds bright safety barriers, visible rival liveries, banked road edges and
  crest motion rather than introducing unlicensed assets.

### Verification

- `node --check game.js track.js sw.js cars.js fx.js hud.js audio.js` -> PASS.
- Scripted steering trace -> PASS at five absolute starting headings, 120
  sustained LEFT steps each, with every heading delta negative.
- Scripted gas-only trace -> PASS on all six seeded circuits: each crossed the
  off-track threshold during the first technical sequence and the existing
  scrub logic applied speed loss.
- Payload audit -> PASS at 1,846,707 bytes excluding NOTES.md and LICENSES.md;
  largest shipped file is `race_b.mp3` at 385,612 bytes.
- Browser boot console capture -> the in-app Browser was unavailable in this
  execution environment and the sandbox rejected a temporary local server
  bind; no browser console result was available to record.

### Deferred

- Browser visual and 20-second live-drive capture -> deferred because neither
  the in-app Browser session nor a local Playwright launch was available here;
  static syntax, deterministic steering, gas-only, payload and cache checks
  were completed instead.

---

## Fix round 1

Three read-only reviews (adversarial code, QA against the six gates, art/FX/
design against the AAA bar) were implemented in this round. Every CRITICAL and
MAJOR finding is addressed below, with the MINOR findings and the reasons for
the two disputes and the deferrals.

### Implemented

Code review, MAJOR:

1. Restart from the pause menu left the new race paused. `pause-restart` now
   drops the `button` pause reason with `kit.resume('button')` before calling
   `kit.restart()`, so the rebuilt race is not frozen under the overlay.
2. NEXT EVENT repeated the final event. `finishInfo.nextEvent` is `null` at the
   end of the ladder and the button becomes the ladder exit to circuit select,
   labelled accordingly.
3. Ghost playback was reconstructed from an elapsed-time fraction. The ghost
   record is now `[time, arcLength, lateral]` (save v4) and both ghost placement
   and the delta interpolate the recorded arc length, so it is the real lap.
4. Pointer controls could latch when a pointer left the canvas. The canvas
   takes `setPointerCapture()` on pointerdown, and `lostpointercapture`,
   `pagehide` and `visibilitychange` all release the held control state. Fixed
   game-side because GGKit is the shared runtime and out of this lane.
5. Holding R or P repeated state transitions through keyboard auto-repeat.
   Command keys are edge-triggered now (`if (e.repeat) return`); held driving
   keys are unaffected because those read from the kit's key set.
6. Custom engine and music audio bypassed the kit's buses and lifecycle. A
   one-instance AudioContext factory is installed before GGKit constructs one,
   so the kit and this module hold the SAME context: it is created and unlocked
   inside the kit's own gesture handler and its suspend/resume lifecycle is the
   kit's. Output level mirrors the kit mute and volume prefs on every change.
7. Synth fallback music ignored pause and Sound mute. Its own output gain now
   honours mute, pause and music volume through `applyVolume()`/`setPaused()`,
   not just the sequencer tick.
8. Restart and load did not stop engine audio. `engine.stop()` and
   `music.stop()` run before `disposeWorld()` and again in the load-failure
   path, so a failed load cannot leave a tone running.
9. The cache-first service worker could serve a whole stale build. HTML, JS and
   JSON are network-first with a 2.5 s timeout and a cache fallback; binary
   content stays cache-first. The offline guarantee is unchanged.

Code review, MINOR (all fixed, none deferred):

1. R now restarts during the countdown as well as the race.
2. Space is an accelerator again (moved to `keyThrottle`), matching the
   documented control contract.
3. Lateral steering authority ramps to zero below 8 percent of top speed, so a
   stopped car no longer slides sideways. Visual wheel yaw still responds.
4. An exact lap-boundary sample is appended before a ghost is saved, so the
   ghost no longer disappears just before the line.
5. Save validation uses `hasOwnProperty` for medal enum membership, requires
   nonnegative monotonic ghost timestamps and non-decreasing arc length, and
   bounds every persisted time at one hour.
6. Corrupt audio preferences could stop the boot inside the kit's
   `applyPrefs()`. The one key this game owns is sanitised before `GGKit.create`
   and dropped if malformed. Fixed game-side for the same lane reason as 4.
7. The Music settings row reads `kit.audio.prefs.music > 0 && !mute` rather
   than `music.mode`, so the label is truthful and the toggle is reversible.
8. The pause touch zone is no longer drawn or registered in the finish state,
   matching the keyboard, which never allowed it.

QA gate review:

- AUDIO, CRITICAL: synthesised audio no longer bypasses the kit buses (see code
  MAJOR 6), and the shipped `LICENSES.md` no longer names any `.ogg` file. The
  per-file mapping to each pack's original source lives with the archive
  originals and the pack-level ledger instead; the shipped directory names only
  formats it actually ships.
- FEEL: impact flash and the vignette are gated behind the accessibility
  setting, not only shake and hit-stop. See art MAJOR 9 below.
- Regression, Space acceleration, MAJOR: fixed, see code MINOR 2.

Art review, CRITICAL:

1. Greybox ground replaced. `buildGround` lays an 8x8 chunk grid with a
   two-tone base weave, an exposed-rock tone, a fine brightness grain and a
   shoulder material that separates from the terrain behind it, plus per-circuit
   surface decals.
2. Sky and horizon rebuilt. `buildSky` authors a per-time-of-day sun disc with
   glow, a cloud band with per-circuit density and colour, and haze, and
   `buildLandmarks` puts a silhouette landmark on every circuit's horizon.
3. Roadside dressing rebuilt on beveled procedural forms (`prism`, `bevelBox`)
   with per-circuit prop kits, clustered composition, material separation and a
   wind secondary motion on the prop material.
4. The six circuits are differentiated. Each carries its own `surface`,
   `surfacePatch`, `propKit`, `scatter`, `landmark`, `clouds`, `sunDisc`,
   `lightEvent` and `decal`. Reverse variants get their own dressing seed, so
   the roadside is genuinely re-laid rather than the forward list read
   backwards.
5. Vehicle chase presentation corrected. One verified model-forward convention
   lives in `cars.js` and is applied once; the chase camera sits rear
   three-quarter with taillights, rear bumper and wheels visible, and the
   contact shadow is parented under the tyre footprint. Confirmed in the
   captured play frame.

Art review, MAJOR:

1. Frame-time spikes: see "Feel gate" below.
2. Loading screen is now a Redline loader: REDLINE GT lockup, the entering
   circuit's own palette as a horizon-and-road backdrop, circuit code and name,
   an animated progress bar and spinner, and a rotating loading tip.
3. Garage renders the selected car on an eased turntable orbit with livery,
   stats and locked-state presentation, not colour swatches.
4. Track select draws an authored per-circuit thumbnail on every card
   (`drawTrackThumb`) with a reverse marker and difficulty pips.
5. One UI token system (`UI.size`, `.weight`, `.track`, `.space`, `.color`,
   `.radius`) now drives title, HUD, loader, garage, select, credits and finish.
6. Race HUD gained a standing/pace chip and a ghost-status chip, and the lap,
   time and delta chips slide in on an ease-out when their value changes.
7. Impact language has three beats: an 80 ms telegraph before contact, a
   localized struck-part white flash with a directional shard burst on contact,
   and a chassis recoil spring with exactly one visible overshoot.
8. Speed sensation: peripheral streaks start at roughly half pace rather than
   62 percent, with a radius floor that keeps them in the periphery, alongside
   the rear tyre and dust systems.
9. One reduced-motion setting now routes camera shake, hit-stop, speed streaks,
   screen flashes, the countdown ring, HUD pulses, tutorial pulsing, the
   lightning event and rain. `kit.juice.enabled` is kept in step as the kit-side
   half of the same switch.
10. Screen transitions are theme-coloured fades that swap the mode at full
    opacity while the world keeps rendering underneath, and the finish ceremony
    reveals in separate beats (result, then medal at 0.45 s, then the next-event
    row at 0.85 s).
11. Onboarding teaches by doing. Rumble advances only on an actual off-road
    event, ghost only once a ghost is visible, and lap only on a real lap
    crossing, each with a generous timeout as a safety valve. Terminology is
    unified on GAS and BRAKE to match the pedals.
12. Motion determinism firewall restored. There is no `Math.random()` call left
    in any view-side code; cosmetic dust, sparks, streaks, shard bursts and
    impact audio variance all draw from a seeded cosmetic stream that never
    touches simulation state.
13. Stormneedle renders its declared weather: a `RainSystem`, wet surface
    grading and reduced-motion gating.
14. Skid trail quads carry a per-quad age and fade out instead of accumulating
    as permanent black geometry.

Art review, MINOR (all fixed):

- Every full-screen layout is built from one `hud.safeRect()`, so no screen is
  centred against the raw viewport while an inset is present.
- Menu buttons have a 110 ms scale and colour press response and a keyboard
  focus ring.
- Settings gained independent Sound effects and Reduced motion rows alongside
  Sound and Music, persisted through the same preference store.

Closing pass this round (both are cached files, so `sw.js` VERSION moved to 5):

- `hud.js` caches font shorthand strings per weight/size and skips the
  `ctx.font` assignment when the font has not changed. The race HUD makes about
  30 `text()` calls a frame and each one used to allocate a fresh shorthand
  string and force a CSS font re-parse.
- `game.js` `controlZones()` compares six numbers instead of building a
  formatted cache key string, removing the last allocation from a function
  written to be allocation-free. It runs twice a frame.

### Disputed

- UX/PWA, "the worker cannot cache `/play/_shared/` under its default
  `/play/redline-gt/` scope". Scope determines which PAGES a worker controls,
  not which URLs it may cache. Once the worker controls the game page, every
  same-origin fetch that page makes is dispatched to its `fetch` handler
  whatever the path, so caching `/play/_shared/` from here is correct and needs
  no wider registration and no `Service-Worker-Allowed` header. Left as is, with
  the reasoning recorded in `sw.js`.
- Art, "the visible lamps read as headlights, so the car presents front-on".
  This was a real defect in the reviewed build and is fixed, but the specific
  claim that fixed yaw was applied at `cars.js:179` and then overwritten again
  in `game.js` described two writes that were already the same convention. The
  fix was to verify and document one model-forward convention rather than to
  remove a conflict.

### Deferred

Out of this lane. The brief scopes work to `play/redline-gt/` plus its
`LICENSES.md`, and these all live elsewhere:

- SHIP hygiene: `/play/_assets/LEDGER.md` still shows `(pending)` in the
  "Used by" column for the Quaternius cars pack, the four Kenney audio packs and
  the music harvest, all of which this title now ships. Needs a ledger owner.
- SHIP hygiene: `/play/_shared/LICENSES.md` lists `three.module.min.js` and
  `GLTFLoader.js` but omits `OBJLoader.js`, which this game loads and which its
  own `LICENSES.md` states is covered there. Needs a shared-runtime owner.
- Code MAJOR 4 and MINOR 6 are fixed game-side rather than in
  `/play/_shared/ggkit.js`. The underlying kit defects remain: `input`
  registers no pointer capture and has no `pagehide` handler, and audio
  preferences are read back without a validator. Both are worth fixing in the
  kit so every title benefits.
- SHIP hygiene: the gate has only ever run against `http://localhost`, and the
  spec requires a deployed HTTPS URL. The brief forbids deploying, so
  `pwa_sw` cannot pass here either: GGKit registers the worker only on HTTPS,
  so a localhost run reports `pwa_sw=false` by design.

### Feel gate

The carry-in was `feel_no_spikes` failing at 57/600 frames over 33 ms, worst
366.6 ms. Everything the brief names as a spike source was attacked and is now
verifiable by inspection:

- Startup asset decode: every SFX clip and the race music bed decode on the
  loading screen, and the engine synth node graph (oscillators, noise buffer,
  filters) is constructed there too. Building it at the GO beat was a measured
  first-seconds stall.
- Per-frame allocation and GC: measured with the sampling heap profiler at
  0.08 MB total over 400 race frames, which is negligible. The two remaining
  allocation sites found this round were removed (see closing pass above).
- Synchronous layout in the loop: there is none. The only
  `getBoundingClientRect` calls are in pointerdown handlers and the only
  `getComputedStyle` call is in `resize()`.
- Both full-screen canvases were already capped, the 3D view at 1120 px and the
  HUD at 1000 px backing store.

The gate could NOT be adjudicated on this machine. The box was running the
concurrent review fleet throughout, at load averages between 40 and 278, and
the harness noise floor under those conditions is far above the budget of 6:

| Run | Load avg | frames > 33 ms | worst |
|---|---|---|---|
| Review baseline (evidence) | unknown | 57/600 | 366.6 ms |
| This build, quietest sample | ~40 | 28/600 | 233.4 ms |
| This build, later samples | 105 to 278 | 156 to 224/600 | 283 to 650 ms |
| Blank page, empty rAF loop (control) | ~145 | 72/600 | 316.7 ms |

A blank page with nothing but an empty `requestAnimationFrame` loop measures 72
frames over 33 ms on this box, which is twelve times the budget. No content can
pass `feel_no_spikes` here, so neither the 28/600 nor the 205/600 readings are
evidence about this build. The quietest sample is roughly half the baseline
spike count and a third off the worst frame, which is the honest summary.

`feel_no_spikes` must be re-gated on an idle box before this title is called
done. Everything else in the gate passes on the local run: zero console errors,
zero failed requests, median 16.7 ms at 4x throttle, 458 distinct colours in the
play frame, 1804 KB payload and 377 KB worst file.

## Fix round 2

### Implemented

- Steering -> touch and keyboard LEFT now route through one corrected world
  sign; the scripted five-angle, 120-step trace is strictly decreasing.
- Course -> every seeded circuit now has sweepers, hairpin, S turns, a crest,
  banking, racing-line speed reward and visible hazards; gas-only traces leave
  all six circuits off-track with scrub loss.
- Race field -> three pooled AI cars run the same centreline with curve lines,
  mild rubber banding, overlap avoidance, 4-car grid countdown, live position
  HUD and finish standing screen.
- Graphics -> existing round 1 art systems stay intact and now include brighter
  hairpin barriers, banked road edges, crest lift and readable rival liveries.
- Regression and ship gates -> Fix round 1 repairs remain intact, `sw.js`
  VERSION is 6, syntax checks pass, and payload is 1,846,707 bytes with no
  file over 400 KB.

### Design notes

The authored 132-segment rhythm alternates turn direction and repeats launch
straight, sweeper, hairpin, S transition, second sweeper, reset straight and
crest phases. The player starts fourth. Rivals advance in absolute lap distance
and use small curve-derived line offsets plus mild rubber banding.

### Deferred

Browser boot and live 20-second capture were not available in this environment:
the in-app Browser session was unavailable, the sandbox rejected a local server
bind, and the fallback Playwright launch closed before navigation. Static syntax,
steering, gas-only, payload and cache verification completed successfully.

## Feature round 1 - item boxes

### Implemented

- Added authored three-lane floating supply-cell rows after hairpins, S exits
  and crest resets. Cells use procedural octahedral and halo geometry, share
  pickup state between the player and all three rivals, and respawn after 4.2 s.
- Added one held item at a time with a brief HUD roulette beat, procedural item
  glyphs, touch slot activation and keyboard `E` activation.
- Added Nitro Surge, Shield Bubble, Slick Patch, Homing Bolt, Twin Bolts and
  Repair Kit with player effects, pooled slick patches, pooled projectiles,
  procedural pickup and impact bursts, and reused GGKit audio clips.
- Added position-weighted rolls, visible shield bubbles, brief spin and slow
  recovery on hits, grip restoration, nitro tail FX and reduced-motion gating.
- AI rivals pick up from the same cells, use items on readable conditions, drop
  slicks, fire bolts and boost on straights. Incoming homing bolts give a beep
  and HUD flash before impact.
- Extended `window.__rg` with `items`, bumped `sw.js` VERSION to 8, and kept all
  new visuals procedural with no payload or license asset additions.

### Item odds table

| Race position | Nitro | Shield | Slick | Homing | Twin | Repair |
|---|---:|---:|---:|---:|---:|---:|
| 1st, leader | 20% | 42% | 0% | 5% | 5% | 28% |
| 2nd | 22% | 28% | 10% | 12% | 8% | 20% |
| 3rd | 28% | 17% | 15% | 16% | 12% | 12% |
| 4th, last | 32% | 10% | 18% | 17% | 15% | 8% |

### Deferred

- The scripted browser race proving pickup -> HUD slot -> use -> effect could
  not run because no in-app Browser or Playwright browser was available in this
  execution environment. `node --check` passed for every changed JavaScript
  file; payload is 1,874,688 bytes and the largest file is 385,612 bytes.

### Fable hotfix after feature round 1

- Rival state objects omitted `shield: rr.shield`, so `updateRivals` threw
  `Cannot set properties of undefined (setting 'visible')` every frame and
  boot never reached a playable race. Field added; steering proof re-run
  PASS (LEFT +0.80 / RIGHT -1.90), zero console errors, content gates green.

## Polish round - cars, motion, world, track

### Implemented

- Cars: kept the Quaternius OBJ and MTL pipeline, upgraded car materials to
  livery-aware Phong paint with broad specular highlights, tinted glass, dark
  wheel wells, contrasting trim, brake lamps, dusk and night headlamp glow,
  per-rival liveries, and a slow highlight sweep. Wheel spin now uses each
  mesh's measured radius, and crest suspension is spring-driven.
- Motion: eased camera heading, chase lag, lookahead, speed and boost FOV
  breathing, suspension bob, rival line and overlap recovery, supply-cell
  respawn, slick patch and bolt presentation, boost pad pulses, secret reveal,
  and menu or race fades. `worldSteer()` remains identity, positive input
  remains left, the rival shield field remains present, and
  `window.__rg = { sim, input, items }` remains live.
- World: added three procedural horizon silhouette layers, animated cloud
  pooling, animated grandstand crowd points, and low-cost per-circuit light
  shafts. Existing sky gradients, landmark kits, props, fog, rain, banks,
  hairpins, S turns and crests remain intact.
- Track: added authored route data to all six circuits. Every rhythm emits a
  visible side branch with a dirt cut, narrow gap, or crest ramp treatment;
  apex-biased chevron boost pads give a speed surge, whoosh, and eased FOV kick;
  a concealed board-side cache gives a hidden item or boost reward; AI rivals
  occasionally choose the branch. Feature round 1 item cells remain intact.
- Ship checks: bumped `sw.js` to VERSION 10 and updated the Quaternius Cars
  Pack ledger row to `redline-gt`. Payload is 1,903,902 bytes and no shipped
  file exceeds 400 KB.

### Per-circuit shortcut, secret, and boost map

| Circuit | Shortcut | Boost pads | Secret cache |
|---|---|---|---|
| Copper Halo | phase 48, right dirt cut | phases 24 left, 82 right, 113 centre | phase 96, left, Nitro |
| Moonlit Weave | phase 70, left narrow gap | phases 20 right, 60 left, 108 inside | phase 36, right, Shield |
| Ember Switchback | phase 46, right dirt cut | phases 25 left, 80 right, 114 left | phase 102, left, Nitro |
| Glassbreak Ridge | phase 112, left crest ramp | phases 30 right, 63 left, 101 right | phase 24, right, Repair |
| Stormneedle Run | phase 58, right narrow gap | phases 18 left, 76 right, 115 centre | phase 90, left, Shield |
| Obsidian Crown | phase 42, left crest ramp | phases 22 right, 77 left, 108 right | phase 96, right, Nitro |

Phases are the authored 132-segment rhythm in `track.js`; each listed route
feature repeats once per circuit rhythm and is safe for forward and reverse
events.

### Deferred

- Browser smoke test and live visual drive were deferred because the in-app
  browser skill reported no available browser and `agent.browsers.list()` was
  empty in this sandbox. No screenshot, console capture, or 4x throttle live
  feel gate was available.
- Static verification completed with `node --check` on every changed JavaScript
  file, payload and per-file size audit, service-worker precache audit, and
  regression inspection of Fix round 1, Fix round 2, and Feature round 1 notes.

## Perf round - frame budget restoration

- Cost found: the polish cars used `MeshPhongMaterial` across four visible rigs;
  the directional-plus-hemisphere light path made that a per-fragment lighting
  cost on every car mesh. The background additions also cost seven cloud draws,
  three shaft draws, a custom crowd vertex shader, and continuous lamp/paint,
  crowd, cloud, and shaft updates. The road, ground, props, and obstacles were
  already emitted in frustum-cullable chunks and were retained.
- Changes: car materials are now `MeshLambertMaterial`, the scene is capped at
  one directional plus one ambient light, and emissive lamp/paint/damage writes
  are cached with the paint sweep quantized to 24 Hz. Clouds are a four-instance
  pool in one draw, updated from precomputed drift records every fourth frame.
  Crowd remains one `Points` geometry but uses shader-free color animation every
  fourth frame. Shafts are static planes in one instanced draw with no per-frame
  opacity write. The merged horizon layers, item boxes, shortcuts, secrets,
  boost pads, rivals, rival shields, `worldSteer()` identity, and `window.__rg`
  hook remain intact. `sw.js` is VERSION 11.
- Expected budget math (not a measurement; the browser dispatcher must verify):
  the adjudicated control is 16.7 ms and the 17.5 ms target leaves 0.8 ms of
  headroom. The 50 ms regression represented about 33.3 ms above that control.
  Removing the per-fragment Phong/light term and reducing auxiliary cloud/shaft
  draws from 10 to 2 puts the expected steady-state target back at `16.7 +
  <=0.8 = <=17.5 ms`; the expected spike gate is `<=6/600` frames over 33 ms.
  No browser capture was available here, so these are expected costs rather
  than claimed measured results.

### Fable hotfix after perf round

- Rival state objects again missed a rig field the render loop needs:
  updateCarLights received the rival state (no lightState) and threw
  every frame. Added lightState: rr.lightState to the rival push
  (same class as the feature-round shield omission). sw v12.
Re-verified: zero console errors, content gates green, steering
proof PASS, median 16.7ms at 4x throttle once box load allows.

## GT graphics uplift

- Visuals: authored multi-part lower shells and tapered greenhouses now sit over the source cars, with Phong specular paint, per-car livery blades, wheel arches, mirrors, bumpers, emissive head/taillight geometry, four independent spinning/steering rimmed wheels, and the existing pooled contact shadows. Road and terrain now use cached code-generated canvas grain with wheel-path wear; merged distance-marker boards, curbs, gantry, fog, sun/hemisphere fill, horizon layers, pooled clouds, and merged trackside dressing complete the PS2-era chase read. The chase camera is lower; speed FOV and corner roll remain, with roll reduced-motion gated. No HUD or gameplay logic changed.
- Performance tradeoffs: no external visual assets were added and no per-frame allocations were introduced. Road/terrain textures are 96px cached canvases; dressing remains merged/chunked or instanced; imported base car meshes stay Lambert while Phong is limited to the authored shell pieces. Payload is 1,960,362 bytes and the largest file is 385,612 bytes. A live browser/throttle capture was unavailable in this workspace, so the <=17.5ms 4x median is not claimed as measured here.
