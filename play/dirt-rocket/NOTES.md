# Dirt Rocket
Side-view motocross physics racer. Landscape, touch-first, no build step.
CONTROLS: hold anywhere on the right half = GAS; BOOST bubble (right) while the heat ring is below redline; BRAKE circle (bottom-left); drag up/down anywhere on the left half = rider lean (wheelies + air rotation). Keys: Right/D gas, Left/A brake, Up-Down/W-S lean, Shift/Space boost, R restart, Enter continue.
LOOP: 3 seeded tracks per event, times summed. Land flat for a speed kick, sloppy = wobble, nose-first = crash (2s remount). Wheelie distance buys seconds off.
WIN: finish all 3 tracks for a bronze/silver/gold medal vs par; best event total is saved to localStorage.

## AAA rebuild

Implemented:

- Rebuilt the archived canvas prototype as a fixed-step Three.js side-view
  lane with a procedural authored bike/rider rig, visible wheel suspension,
  chassis pitch, rider lean poses, wheel spin, pooled dust/flame/spark FX,
  crash tumble, impact shake, and GGKit-controlled reduced motion.
- Replaced raw lifecycle, pointer, keyboard, storage, and WebAudio code with
  GGKit. Added the live `window.__dr.state` probe with `forceEvent` and
  `forceTrack` switches, guarded save validation, landscape orientation,
  manifest, icons, service worker, and MP3-only original procedural cues.
- Added analog front-wheel lift balance, heat-ring boost with clean-landing
  cooldown, telegraphed nose-risk feedback, clean/wobble/crash landing
  grading, generous boost/time/repair pickups, safe checkpoint remounts, and
  a first-run interactive five-step tutorial in a thin top strip.
- Added Championship progression, eight seeded events, four unlock-gated
  cups, medal thresholds against summed three-track pars, Time Trial ghost
  recording/replay, and a scored Big Air finale.

Event and track table:

| Event | Championship | Track 1 | Track 2 | Track 3 |
| --- | --- | --- | --- | --- |
| Rookie Rumble | Starter Cup | stadium | dunes | forest |
| Dune Pressure | Starter Cup | dunes | forest | quarry |
| Rootline Run | Frontier Cup | forest | quarry | stadium |
| Quarry Apex | Frontier Cup | quarry | stadium | dunes |
| Stadium Afterglow | Afterglow Cup | stadium | dunes | forest |
| Dust Meridian | Afterglow Cup | dunes | forest | quarry |
| Forest Night Shift | Apex Cup | forest | quarry | stadium |
| Crown of Stone | Apex Cup | quarry | stadium | dunes |

Each family has an authored rhythm, signature centerpiece gap, shortcut high
line, and generous pickup cadence: Stadium whoops, Dune gaps, Forest roots,
and Quarry cliff jumps. Championships unlock through the prior event medal.

Deferred:

- Browser visual smoke test could not run because this session had no browser
  instance. Node syntax, seeded-content, physics, payload, and service-worker
  precache checks passed. No deploy or git operation was performed.

## Fix round 1

Fixed:

- CRITICAL primitive-only presentation: added authored beveled/extruded bike
  details, rider detail, colored rims and plate, fog depth, vehicle blob
  shadow, richer motion states, and responsive presentation polish.
- MAJOR keyboard progression: Enter, Space, R, Escape, O, and F now cover
  continue, restart, pause, settings, and fullscreen through GGKit.
- MAJOR pause/settings/fullscreen access: added title actions, pause button,
  pause overlay, settings route, fullscreen route, and safe input clearing.
- MAJOR empty ghost crash: empty ghosts are rejected and completion guards
  legacy empty records.
- MAJOR Big Air retry carryover: score, peak, and rotation reset per attempt.
- MAJOR hit-stop: cosmetic rendering and particles freeze while the fixed
  simulation accumulator continues to drain.
- MAJOR unreachable pars: recalibrated seeded pars to measured bike pace and
  verified the opening event is reachable with gas and boost.
- MAJOR opposition: championship runs now show a deterministic rival pace bike
  and live distance pressure.
- MAJOR race start: added a staged 3-2-1-GO countdown and launch cue.
- MAJOR vehicle motion: added ride, boost, air, and crash states, suspension
  detail, front-wheel steering yaw, rider pose changes, and wheel accents.
- MAJOR world depth: added family fog, safer contrast, and a spring-aware blob
  shadow under the bike.
- MAJOR audio: added lazy-loaded looping menu and driving beds, a layered
  motor pulse in the driving bed, and skid and surface cues through GGKit.
- MAJOR 390px UX: added compact labels and layouts, safe-area canvas insets,
  separated speed and boost meters, compact result screens, and compact title
  actions.
- MAJOR loading: boot progress now follows layout, scene construction, shader
  preparation, PWA registration, and completion rather than fake synchronous
  percentages.
- MINOR repair pickups: health now persists across remounts, affects remount
  speed, is visible in the HUD, and is restored by repair pads.
- MINOR particle exhaustion: emit recycles the oldest live particle when a
  pool is busy.
- MINOR line-material leak: per-track line materials are disposed on rebuild.
- MINOR camera dip: landing impact now drives a reduced-motion-aware spring
  dip.

Rejected:

- MINOR gamepad support: rejected for this round because the brief requires
  GGKit to remain the sole input implementation and GGKit exposes no gamepad
  contract. Touch and keyboard controls remain fully wired.
- MAJOR deployed AAA evidence and ship gate: rejected for this round because
  the request explicitly forbids deploy and browser work and limits all work
  to this title directory; the required evidence directory is outside scope.

Checks: `node --check` passed for `game.js`, `bike.js`, `track.js`, and `sw.js`.
Payload measured 364 KB, no file exceeded 400 KB, audio remained MP3-only, and
the service-worker cache version was bumped to 2.

## UI declutter

- Cut the in-play center landing-quality text and large crash card; crash kind,
  remount timer, and checkpoint now share one small corner status chip.
- Shrunk pickup, landing, shortcut, nose-risk, remount, and tutorial-complete
  feedback into one queued corner chip with a one-second maximum hold.
- Replaced recurring SPEED, BOOST, FRONT LIFT, BIKE, GAS, BRAKE, and LEAN labels
  with a compact speed ring, heat ring, icons, and meters; event, track, time,
  progress, rival, and health information remain visible.
- Reworked coaching into one 34px top-edge line that fades after three seconds,
  with reduced-motion fallback preserved.
- Cut the center banner entirely; the countdown is the only run-start transient,
  while the compact HUD and track/event results retain the information.
- Bumped the service-worker cache version to 3.
- Kept every active-play touch target at or above 44px while simplifying its
  visible label.
- Browser screenshot QA was unavailable because no browser instance was
  connected; `node --check` passed for `game.js`, `bike.js`, `track.js`, and
  `sw.js`.

## GT graphics uplift

- Replaced the flat track presentation with generated gradient sky, fogged
  horizon haze, textured dirt ribbon, edge markings, curbs, distance boards,
  gantry detail, dense instanced family dressing, and persistent pooled skid
  marks.
- Upgraded the bike with specular Phong paint and livery sheen, authored lower
  body/cowl/panel/headlight/taillight/mirror/rim/spoke parts, wheel arches,
  suspension-aware contact shadows, spinning/steering wheels, and dusk/night
  lamps. The chase camera is lower, springy, speed-FOV aware, and adds gated
  corner roll.
- Dressing is instanced and skid marks are a single reusable instance pool;
  generated textures are cached in memory. No gameplay constants, controls,
  event logic, scoring, HUD, or verification hooks changed. Tradeoff: the
  added world detail increases startup geometry/shader work while preserving
  the existing runtime draw-call budget.

## GGRacer retrofit

- Replaced the title-owned scene, road, dressing, bike rig, particles, skid
  pool, and camera with the shared `createRacerWorld()` adapter. The existing
  fixed-step simulation remains in `bike.js` and `track.js`; `game.js` still
  owns controls, GGKit lifecycle, event progression, medals, remounts, ghosts,
  saves, HUD, and audio.
- Added 25 point-to-point GGRacer JSONs under `tracks/`: one for each of the
  24 seeded event courses plus the Big Air finale. `closed: false` is used for
  every stage. Each file records the source family, seed, source start/finish
  positions, and the converted elevation profile. Mild lateral curvature and
  banking are render-only authoring so the chase camera reads terrain depth.
- Theme progression is authored in the JSON metadata across desert, coastal,
  alpine, and night-city. Night-city courses use `timeOfDay: "night"`, which
  enables the shared headlights and headlight cones.
- The adapter maps the sim's +X route into the engine's +Z route. Sim bike
  height becomes a small render-only air offset, sim angle becomes engine
  pitch with the coordinate-conversion sign, and wheel penetration becomes
  engine suspension. The simulation values are not fed back from the engine.
- A bike/rider carkit remains an engine gap: the current shared carkit is a
  GT car with four wheels and no rider, so it cannot show rider lean, wheelie
  balance, or separate wheel suspension with the same fidelity as the old
  side-view rig. The retrofit keeps the shared compact car read and preserves
  the sim's pitch and air state in the adapter. A future bike variant needs a
  two-wheel chassis, rider torso/helmet/arms, front and rear suspension
  anchors, wheelie-safe pitch limits, air-rotation hooks, and crash tumble
  presentation.
