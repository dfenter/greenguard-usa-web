# Rally Dust

Sixteen seeded dirt stages across four biomes. Read the co-driver, carry the
slide, beat the clock.

## Controls

- Touch: drag anywhere on the left half of the screen to steer. Hold BRAKE to
  slow. Hold HANDBRAKE to swing the tail into a hairpin.
- Keyboard: Arrow keys or A and D steer. Down or S brakes. Space, Enter, Up or
  W pulls the handbrake. P or Escape pauses. R restarts the stage.
- The car pulls its own throttle. Your job is the line, not the accelerator.

## Goal

Every stage is a point to point run against a 90 second limit. Beat the stage
par for a medal, and beat all four stages of a rally to be scored on the rally
total. Your quickest run on a stage is saved as a ghost car and ghost timing
line, so the next attempt has something to chase. Stage gold
medals unlock liveries in the garage.

Deep off road, or a tree, costs you three seconds and a restart from the last
clean point. Rocks on the road only cost you speed. The co-driver calls the
road two corners ahead: trust the call before you trust your eyes.

---

## Developer notes

### Preserved prototype behaviour

The archived 2D prototype at `worker-archive/play-prototypes/rally-dust/` is
the design document. These behaviours are carried across unchanged and are the
named regression checks for this title:

- **mulberry32 seeded stage generation.** Seed, event roll thresholds
  (jump .13 / rocks .25 / chicane .41 / hairpin .59 / turn), event durations,
  hairpin magnitude `1.58 + rng * .24`, chicane pair with the `-1.12` counter
  turn, and the `at += 45 + floor(rng * 38)` spacing are all bit identical.
- **Path integration.** `angle = sin(i * .017 + tier * 1.7) * .08` plus the
  eased event deltas, `roadHalf = 177 + sin(i * .025) * 5`, and the crest
  bounce `sin(i * .042 + tier * 2.1) * .12 + sin(i * .013) * .09`.
- **Tree and rock scatter.** Same loop, same probabilities, same offsets.
- **Handling constants.** Auto throttle `(370 - speed * .48) * dt`, brake
  `420 * dt`, lateral retention `.79` rolling and `.53` on the handbrake,
  `turnPower = (.72 + speedFrac * 1.34)` with the `2.15` handbrake multiplier,
  the road-follow assist inside `roadHalf * 1.15`, and `maxSpeed = 325` less
  five per rally.
- **Off-road model.** `offroad += dt * (outside > 75 ? 1.9 : .45)`, recovery at
  `dt * 2.8`, reset at `.72`, three second penalty, and the restart eighteen
  path nodes back.
- **90 second stage limit** with the DUSTED OUT timeout screen.
- **Two-corner-ahead pace notes.** The second upcoming call is read, skipping
  anything within 22 nodes, held inside a 270 node window. Note wording
  (LEFT/RIGHT plus grade 2/3/5, TIGHTENS, HAIRPIN, CAUTION ROCKS, CAUTION
  CHICANE, JUMP) is the prototype's `featureText`.
- **Rally medal bands.** Rally total under `par * 1.06` is gold, under
  `par * 1.2` is silver, otherwise bronze.
- **Speed readout factor `speed * 0.72`** for the km/h dial.
- **Drag steer on the left half**, relative to the touch-down point, divided by
  `max(80, width * .12)`.
- **Best times persist** and are shown against the live clock.
- The five prototype stage names and seeds open the ladder: DUSTLINE,
  PINE NEEDLE, RAVINE KICK, EMBER PASS, NIGHTFALL RUN.

### New for the 3D rebuild

- Elevation channel and real jump crests (the prototype crest was cosmetic).
- Drift-weighted surface model: gravel, hardpack, sand, mud, snow and tarmac,
  each with its own lateral stick, turn authority and drive. Gravel is exactly
  the prototype's tuning, so the design document remains the baseline.
- Ghost actor plus saved ghost timing and delta UI from the best run.
- Livery meta progression unlocked by stage gold medals.
- Per-stage medals alongside the prototype's rally-total medal.
- Synthesised co-driver voice chips under every pace note.
- Rocks became a speed-loss contact rather than scenery, so the prototype's
  CAUTION ROCKS call means something.

### Content inventory

- 4 rallies x 4 stages = **16 stages**, all seeded and deterministic.
- 4 biomes with distinct time of day, palette, fog, props and surface mix:
  Pine Coast (dawn), Ember Basin (dusk), Frost Ridge (day), Nightfall Run
  (night).
- Stage pars run 66 to 85 seconds; the sum of all pars is **1,204 seconds, or
  20 minutes 4 seconds of driving on a clean run**, before countdowns, results,
  the recce and any retry. Every stage is still inside the 90 second limit.
  Medal and ghost chasing is the long tail.
- 6 liveries over 3 vehicle bodies, unlocked at 0, 2, 4, 7, 10 and 14 stage
  golds.
- 6 step interactive recce (tutorial) on the first run, gated on the player
  actually performing each input.

### Audio inventory

- Music: 3 looping tracks. `menu.mp3` on every menu, `stage_a.mp3` and
  `stage_b.mp3` alternating on stages. All lazy loaded after the first
  interaction, all mp3 per the audio format law.
- Engine: synthesised live (three detuned saws, a square sub octave, a
  band-passed gravel bed) so it tracks speed continuously, with an overrun
  crackle on a high-RPM lift.
- Co-driver: synthesised pitched chips, one per word, falling for a left call
  and rising for a right one.
- 13 sampled SFX: impact, gravel scrub, slide, pace-note blip, UI tick, UI
  select, countdown beep, launch, split, stage clear, medal fanfare, reset
  thud, landing.
- Everything routes through the GGKit sfx and music buses, so mute, volume and
  the visibility suspend contract own the output.

### Visual systems

- GGRacer supplies the textured chase road, banking and elevation, open-stage
  start/finish gantries, sector gates, distance boards, themed horizon,
  terrain, dense roadside dressing, GT-bar car, headlights and pooled speed FX.
- The title HUD remains a 2D overlay with speed, drift, tachometer, stage clock,
  split/ghost delta, pace-note card, medals and mode-specific controls.
- Rally Dust's simulation still emits title-owned surface audio and uses the
  shared FX hooks for dust, impact and skid accents. GGKit remains the sole
  lifecycle, input, save and audio owner.
- Nightfall Run uses the shared night-city lighting and headlight cones. The
  four title biomes map one-to-one onto the four engine themes in the retrofit
  table below.

### Known limitations

- The ghost is replayed from stage fraction and lateral offset only, so it
  reproduces the line rather than the exact yaw of the recorded run. The
  shared engine's one adapter actor is used for this ghost; no rival AI runs.
- Stage geometry is generated at load rather than streamed, so switching
  stages costs a short loading screen (with real progress) instead of an
  instant restart.
- The co-driver reads chips, not speech. It is deliberate: it costs no
  download, it localises to nothing, and it never mispronounces a stage name.
- A stage failed on the clock inside a rally must be retried; you cannot carry
  a timeout forward into the rally total.

---

## Historical pre-retrofit notes

## Fix round 1

Three read-only reviews (adversarial code, QA against the six gates, art and FX
against the AAA bar) plus the failing `feel_no_spikes` carry-in. Every CRITICAL
and MAJOR is implemented below. A previous implementer pass on this title was
interrupted part way, so several findings were already fixed in the tree when
this round started; those were verified against the running game rather than
taken on trust, and any that were half applied were finished.

### Implemented

**Blocker found while verifying (not in any review)**

- Game did not run at all. The FX rebuild renamed the emitter pool but the
  render loop still read `world.fx.plume` and `world.fx.spray`, so every frame
  threw `Cannot read properties of undefined (reading 'pts')` and nothing
  updated past the title. Both the `__noFx` reset list and the `__rd` probe
  hook now name the real pools.
- Start and finish arch beams were rotated ninety degrees: `box()` takes a yaw
  in its own convention which does not agree with `worldYaw()`, so the beam
  rendered as a plank floating lengthways above the middle of the stage. The
  beam is now built directly from the road normal and can only span the gate.

**Code review**

1. Jump never becomes airborne -> explicit `car.airborne` flag; launch sets it,
   every consumer (gravity, landing, steering authority, drive, engine load,
   FX, camera) reads the same state.
2. Restart from pause left the new countdown frozen -> `startStage()` resumes
   the `button` reason explicitly and leaves visibility/orientation alone;
   keyboard `R` now works in countdown, stage, recce and result.
3. Controls leaked into retry and stage transitions -> `kit.input.clearAll()` at
   the top of every `startStage()`, not only through `kit.restart()`.
4. Ghost offset by its first sample -> an explicit time-zero grid sample is
   recorded in `resetSim()`, so sample k really is the position at k/HZ.
5. Ghost timing invalid after a reset -> samples carry a segment counter and
   playback resolves against `ghostPermanent()`, the last-crossing monotonic
   projection; `buildGhostLine()` breaks the ribbon at segment changes and at
   backward jumps instead of drawing a bar through the scenery.
6. Visible-frame stalls gave free time -> a frame gap over `STALL_GAP` charges
   the swallowed elapsed time to the stage clock (capped at `STALL_MAX`, past
   which it is treated as a suspended tab) and can fail the run on the limit
   exactly as driven time would. Physics still steps at the clamped rate.
7. Procedural audio bypassed the GGKit buses -> `captureAudioContext()` hands
   GGKit a subclassed context before `create()`, so there is one context;
   engine and co-driver ride the sfx bus, synth music rides the music bus, and
   mute, volume and the visibility suspend contract own all of it.
8. Resume advanced the stage by up to 50 ms -> `onResume()` resets `lastTime`
   and `acc`.
9. Accumulator not reset between stages -> `resetSim()` zeroes `acc` and
   resynchronises `lastTime`; `startStage()` does the same in its `finally`.
10. Results fired before the finish arch -> `world.lastNode` and the finish gate
    are both `path.length - 9`.
11. Save medal validation accepted inherited names -> `MEDAL_ORDER` and
    `MEDAL_COLOR` are null-prototype lookups and validation uses
    `Object.hasOwn`.
12. Service worker could stay permanently stale -> the document is network
    first with a cache fallback, so a missed VERSION bump can still recover;
    everything else stays cache first. VERSION bumped to `2`.
13. Keyboard pause unavailable during the ceremony -> one `PAUSABLE` set
    (countdown, stage, recce, result, summary) and one `RESTARTABLE` set, so
    the keyboard matches the touch pause button that was already drawn there.
14. Terminal "next" actions self-looped -> the last standalone stage and the
    last rally route back to the season instead of restarting themselves, and
    the keyboard Enter path is guarded the same way.

**Art, FX and design review**

- Greybox world -> the road is built band by band with macro tonal breakup,
  proud clasts, alternating rumble markers, berms pushed up on the outside of a
  corner and cut away on the inside, a baked contact-occlusion strip hugging the
  road edge and a lit verge bank. Surface colour is blended across a seven node
  window so gravel does not snap into mud at one node.
- Dirt does not read loose -> loose edge debris thrown onto the verge, clasts on
  the surface, and the blended gravel/mud/sand/snow/tarmac transitions above.
- Rally identity missing -> `buildDressing()` adds the rally furniture, and the
  start and finish arches now actually render as arches (see blocker above).
- Generic shared loading overlay -> a title-specific loader with biome key art,
  the stage name, a car silhouette, a running dust motif and branded progress
  copy, driven alongside the GGKit loader.
- Lighting and contact -> baked directional shading on verge banks and props,
  plus per-wheel tyre contact patches under the car so the tyres are anchored.
- Biomes were palette swaps -> `reliefFor()` gives each biome its own terrain
  shape: canyon strata benches, alpine wind drifts with cornice crests, a nearly
  level coastal tidal flat, pine swells with a hummock layer.
- Vehicle grounding and livery -> lower three-quarter chase camera that keeps
  the contact patch, the suspension travel and the flank in frame; stripe
  treatments, a numbered competition roundel and progressive dirt accumulation.
- Dust FX generic -> five surface emitter families with distinct sprites, sizes,
  masses and curves, emitted wheel-local and biased to the loaded side. Sized
  against the 5.7 m chase distance in this round: at 2.4 m a single puff filled
  a third of the frame and read as a white blob, so the billow is smaller and
  thinner and gets its density from count.
- Impact language -> proximity telegraph, a short localized contact accent that
  fires at the contact point, surface-specific debris, then one spring-damped
  chassis and camera overshoot.
- Pace notes had no urgency -> the card now carries a hazard colour and tag, a
  direction arrow, the grade as a pill, a live distance countdown, and an
  imminent state (warm fill, thicker border, full-height bookmark, pulse) inside
  the last stretch. The pulse is gated on reduced motion. The following call
  moved onto its own backing plate; unbacked it was unreadable over pale road.
- Reduced motion did not cover speed effects -> one `motionOn()` predicate gates
  shake, hit-stop, FOV kick, speed streaks, screen flashes, HUD pulses, the
  medal burst and the result count-up.
- HUD type too small -> race-HUD floor is 11px for anything actionable and 14px
  for the live pace call. The two low-value secondary labels in the driving
  frame (the game's own name, "STAGE CLOCK") are removed rather than shrunk, and
  the clock and stage name grew into the space.
- No tachometer -> a rev arc outside the speed arc with a redline band and an
  overrun readout. The six-ratio rev model is shared with the engine synth, so
  the needle sweeps and drops on each shift, blips against the limiter on the
  grid, runs away when the wheels unload, and falls into overrun on the brakes.
- Menu typography and transitions were generic -> a display treatment applied to
  the wordmark and every screen header (heaviest weight, forward rake, hard
  shadow plate, accent rule, and a stencil slot clipped clean through the
  letterforms at display sizes so the live stage shows through); layered button
  plates with a drop shade; real press states, because menu controls now fire on
  release and light while held, so a drag off cancels; and every screen eases in
  on fade plus a short rise, with taps refused until it lands.
- Results choreography -> the finish camera eases up and back off the car, then
  the clock counts up, then the medal slams in with a burst ring and spokes,
  then the ghost confirmation, then the livery unlock arrives last as its own
  card. The ceremony header no longer prints through the stage clock.
- Onboarding -> the recce is a slow reconnaissance of the opening of the stage
  with no clock, no medal and no penalty, held on each lesson until the player
  performs the input, with pace notes introduced before the first timed run.
- Rally menu copy always showed `RALLIES[0].blurb` -> bound to the active rally.

**QA gates**

- AUDIO critical: the shipped `LICENSES.md` carried Vorbis container filename
  extensions for the Kenney archive originals, which the audio law bans
  anywhere in a shipped game directory -> those originals are now listed without
  their container extension, with a note that nothing in that format ships and
  that the full archive filenames live in each pack's `License.txt`. The whole
  directory, this file included, is now clean of that extension.
- CONTENT: clean-run par total was 1,192 s -> the length curve is shifted six
  nodes, giving 1,204 s (20:04) across the sixteen stages with every stage still
  inside the 90 second limit and every generation constant untouched.
- Regression: the prototype touch steer zone is `W * 0.5`, not `W * 0.55`.

**FEEL carry-in**

Was 113/600 frames over 33 ms, worst 250.0 ms. **`feel_no_spikes` now PASSES:
1/600, worst 116.7 ms** (844x390, 4x CPU throttle, `gate.mjs`, localhost).

What was attacked: the per-frame `window.__rd` object literal is now written
into one preallocated object, which was the last allocation left in the render
loop; the render loop has no layout reads (the only `getBoundingClientRect` is
in `resize()`); every clip a stage can trigger is decoded on the loading screen
so no lazy decode can stall mid-stage; the world build yields between phases;
the scene is prewarmed before the first stage frame; the backing store and the
overlay DPR are capped; and the arch beam bug above was throwing a large piece
of geometry into the frustum from the grid.

**The measurement is load sensitive and earlier numbers in this session were
not valid.** Traced repeatedly on the same machine as other lanes ran:

| machine load average | empty control page (no game, no canvas, no WebGL) | Rally Dust |
|---|---|---|
| ~73 | not run | 44 - 55/600 |
| ~30 | 9/600, worst 183 - 200 ms | 13 - 18/600 |
| ~13 | 9/600, worst 133 ms | 9/600, worst 133 ms |
| ~6 | not run | **1/600, worst 117 ms (PASS)** |

An empty `<h1>control</h1>` page under the same 4x throttle fails the same gate
at 9/600 against a threshold of 6 whenever the box is busy, so any trace taken
on a contended machine says nothing about the title. Re-run this gate on an
uncontended box before reading any spike count from it.

### Deferred

- **SHIP hygiene: gate evidence against the deployed HTTPS URL.** The brief
  forbids deploying, so the evidence in this round is localhost only, which is
  also why `pwa_sw` reads false (GGKit registers the worker on HTTPS only).
  Needs a deploy plus a gate re-run to close.
- **A bundled display font file.** The art review asked for one. A font is a
  third-party asset and would need a pack row in `/play/_assets/LEDGER.md`,
  which is outside this lane. The display face is delivered as an original
  drawing treatment instead (see above), which ships zero bytes and is original
  studio work. If a font file is wanted, it needs a LEDGER row from the owner of
  that file.
- **Unique rally vehicle kits.** The art review objected that the three bodies
  are the same Quaternius family Redline GT uses. Replacing them means new
  third-party models and, again, a LEDGER row outside this lane. Livery
  separation was pushed as far as materials allow: stripe treatments, numbered
  roundels, accent trim, roof pods and dirt accumulation.
- **Menu-screen metadata type below 11px.** The 11px floor is enforced across
  the active race HUD, which is what the finding cited. The stage and rally
  cards still use 9px for secondary metadata (PAR, GOLD, medal counts); raising
  those needs a card layout pass, not a size change, or the four-across ladder
  overflows at 390px.

### Disputed

None. Every finding checked out against the code.

## GT graphics uplift

- Added glossy, sheen-mapped multi-part rally shells with tapered tinted greenhouses, bumpers, lights, mirrors, wheel arches, and authored tire/rim/hub assemblies; existing wheel pivots still drive spin and steering, with pooled contact shadows retained.
- Added generated canvas road grain with center/edge paint and tire-wear lines, generated terrain grain, lower chase framing, reduced-motion-gated corner roll, and preserved sun/hemisphere/fog/gradient-sky lighting plus merged dense dressing.
- Perf tradeoff: a small generated texture overlay and a handful of per-car kit meshes add draw calls, while road/terrain/dressing geometry remains merged and all runtime FX/camera paths stay allocation-free; no external payloads were added.

## GGRacer retrofit - 2026-08-11

Rally Dust now uses `createRacerWorld()` from `/play/_shared/racer/` for the
complete visible driving layer. The title-owned simulation remains in
`stage.js` and the fixed-step sections of `game.js`: seeded layout generation,
collision buckets, handling, jumps, pace-note timing, medals, rally chaining,
ghost samples, input identity, saves and audio are still title-owned. The
render adapter sends the existing car position, heading, speed, slide and
cosmetic suspension channels to GGRacer each frame. No title code writes
camera Euler components after `lookAt`; chase-camera roll is engine-owned.

The old title-side road, terrain, props, car OBJ rig, ghost shell, particle
families, sky and camera paths were removed. `cars.js` is now roster and
handling data only. `stage.js` is now simulation and query data only.

### Track JSON provenance

`tracks/r1s1.json` through `tracks/r4s4.json` are generated directly from the
existing `buildLayout(stage)` output. Their control points use the existing
seeded centerline positions and elevations in metres, with feature apexes
retained as curb/banking points. Each `turns` entry uses the same feature index
and `featureText()` wording as the co-driver stream. All sixteen tracks use
`closed: false`; the title still finishes at `path.length - 9`, matching the
finish-side timing gate and the prior stage range. The title simulation does
not consume the JSON, so pace-note timing remains keyed to the original seeded
path rather than a resampled render spline.

### Theme assignment

| Stages | Title biome | GGRacer theme | Time of day |
|---|---|---|---|
| R1S1-R1S4 | Pine Coast | alpine | dawn |
| R2S1-R2S4 | Ember Basin | desert | dusk |
| R3S1-R3S4 | Frost Ridge | coastal | day |
| R4S1-R4S4 | Nightfall Run | night-city | night |

The final rally gives four clearly lit night stages, including readable
headlights. At showcase quality the shared environment supplies populated
parallax horizon and roadside dressing on every converted stage.

### Deliberate engine gap

The shared road generator currently renders asphalt for every track. Rally Dust
needs the exact trackJSON option `surface: "dirt"`, which should select a
generated dirt/gravel road texture and material response while preserving the
existing curb, wear-strip and edge-line geometry. The retrofit does not fake
dirt with title-side geometry. Rally Dust continues to use its original
surface simulation and gravel audio/FX channels until that shared option
exists.

The engine has no dedicated ghost actor slot, so the adapter reserves one
non-simulated engine actor for the saved ghost. Rally Dust advances no rival
simulation or AI and has no rival entries in its stage state. Ghost delta and
split timing UI remain title-owned, and the ghost actor is hidden when no valid
saved run is present.
