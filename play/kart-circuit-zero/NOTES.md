# Kart Circuit Zero

Controls: drag left/right on the left half to steer; hold DRIFT on the right and release to boost.
Keyboard: left/right or A/D steer, Space drifts, R restarts, 1-4 choose circuits, Enter restarts after a run.
Loop: race three laps on one of four seeded circuits; beat the medal time and your saved ghost.
Best times and best-run ghosts persist in localStorage on this device.

## GGRacer retrofit

Kart Circuit Zero now uses the shared GGRacer presentation layer through
`createRacerWorld()`. The title still owns the simulation, controls, mode
structure, medals, save validation, ghost recording and replay, GGKit lifecycle,
and audio buses. The adapter feeds the engine one frame packet per render tick.

The simulation and render split is:

- `game.js` keeps the seeded circuit definitions, 120 Hz vehicle stepper,
  input zones, drift charge and boost release, pads, gates, shortcut jumps,
  lap completion, medals, cup placement, save data, ghost trace playback,
  HUD and audio.
- `tracks/*.json` are render-only GGRacer authoring data. They contain the
  existing circuit control coordinates, 17.4 metre road width, explicit closed
  loops, authored elevation and banking, drift-corner curbs, sectors at the
  existing gate fractions, distance markers, racing-line metadata, and theme
  assignment.
- The adapter samples the existing simulation spline for position and yaw, so
  the engine never becomes a second physics or checkpoint system. Drift feeds
  steering, exaggerated lateral G and roll into `carState`; released drift
  charge feeds `carState.boost`.
- The saved ghost uses the engine's first rival slot. `game.js` applies a
  translucent cyan material treatment locally because GGRacer has no first-class
  ghost actor option. The slot is hidden when no valid saved trace exists.
- GGRacer owns the road, curbs, barriers, sector gates, start gantry, themed
  environment, populated parallax horizon, chase camera, GT-bar cars and pooled
  speed FX. The title does not write camera Euler components or create a
  competing scene, track, vehicle, particle, fallback, or camera renderer.

## Circuit and theme progression

| Circuit | Theme | Time of day | Existing gates | Drift identity |
|---|---|---|---|---|
| Coastline Sprint | coastal | dusk | 22%, 77% | Sea-wall sweeper and tidal hairpin |
| Canyon Switchbacks | desert | dusk | 28%, 81% | Blind reversals and Red Arch snap corners |
| Neon Night Loop | night-city | night | 25%, 72% | Banked violet loop and neon hairpin |
| Circuit Zero | alpine | dusk | 18%, 77% | Zero bend, split apex and summit reveal |

This is the existing difficulty order. The JSON files were generated from the
`CIRCUITS` control arrays and seeds in `game.js`, with the old canyon
elevation amplitude retained. All four use `closed: true`, and all four have
curb markers on the authored drift corners. Quality tier 2 receives the shared
engine's dense roadside dressing and three populated parallax horizon depths.
The night-city circuit requests `timeOfDay: "night"` so headlights and
emissive roadside dressing remain legible.

## Preserved prototype behaviours

- Drag steering is relative to the pointer-down position on the left 66 percent
  of the canvas. Steering and DRIFT keep separate pointer identities.
- Keyboard arrows and A/D steer. Space and Shift hold DRIFT. Gamepad axis,
  d-pad and drift buttons remain supported.
- A held drift charges BLUE, ORANGE or PURPLE boost. Releasing the drift maps
  the charge to the existing boost strengths.
- Three laps complete each event. Time Trial, Ghost Race and Circuit Cup remain
  available, with Cup chaining all four circuits in authored order.
- Pads, time-bonus gates, shortcut ramps, off-road slowdown, wall scrub,
  checkpoint respawn and the original fixed-step handling constants remain.
- Medal thresholds, unlock progression, three livery variants, versioned save
  validation, best times and four-channel ghost traces remain.
- GGKit remains the sole lifecycle, input, save, settings, pause and audio
  owner. Reduced motion still disables title and engine juice.

## Audio and licensing

The eight title audio clips remain registered through GGKit. No new binary asset
or third-party visual asset was added by the retrofit. GGRacer and Three.js are
loaded from `/play/_shared/`; their licensing is covered by the shared
license file. The service worker version is `aaa-f2-7-ggracer`, and it
precaches all four title track JSON files. Shared engine files are intentionally
not added to the title precache list.

## Verification notes

Static checks cover all changed JavaScript, JSON parsing, the service-worker
precache entries, and the absence of the deleted title-local renderer paths.
Live browser capture depends on an available browser session.
