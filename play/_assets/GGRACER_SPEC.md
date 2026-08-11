# GGRacer - shared modern racing engine spec (Rev 1, 2026-08-11)

Owner verdict: current racing backgrounds/tracks are "1988 Atari at
best... the whole engine needs modern overhaul. I have played way
better racing games for the phone." Named FLOOR (owner 2026-08-11):
"at least to level of Cruis'n USA arcade" - i.e. a 1994 arcade racer's
dense scenic corridors: textured winding road with elevation, scenery
crowding both sides of the track (trees, cliffs, buildings, signs),
landmark set pieces per course, drawn horizon backdrops. Target above
the floor: a good modern PHONE racer (Asphalt-class presentation on
mobile web budgets). One shared engine, every driving title rides it.
The scenery-density rule of thumb from Cruis'n: the player should
NEVER see an empty horizon line from track level - every frame has
roadside objects sliding past and a painted backdrop behind them.

## Module layout (all under play/_shared/racer/, ES modules, Three.js
via import map `three`)

- engine.js  - scene bootstrap, render loop hookup, quality scaler,
  lighting rig, fog/sky, camera director. Exposes createRacerWorld(opts).
- track.js   - spline track system. Catmull-Rom control points (JSON
  per title) -> smooth center line -> extruded road ribbon with WIDTH,
  BANKING, and ELEVATION per point; circuit loop by default or
  point-to-point stage via "closed": false (progress clamps instead of
  wrapping; START and FINISH gantries at the endpoints); generated asphalt texture with
  center/edge lines and wear strip; red/white curb meshes on corner
  apexes; barrier walls or post+rail per theme; start/finish gantry;
  sector gates + checkpoint API; minimap polyline export; racing-line
  sampler for AI. Track data is pure JSON so titles author tracks
  without touching engine code.
- env.js     - themed environments: gradient sky dome with generated
  cloud sprites, distant horizon ring (billboarded mountain/city/tree
  silhouette cards, 2-3 parallax depths), mid dressing rings (low-poly
  instanced trees/rocks/buildings/crowd stands/billboard boards),
  terrain skirt mesh with generated ground texture out to the horizon,
  fog matched to sky. Themes: desert, coastal, alpine, night-city
  (emissive windows, trackside lights, headlight cones). Everything
  instanced/merged; density budgeted by quality tier.
- carkit.js  - GT-bar vehicle builder (see ART_vehicle3d.md GRAN
  TURISMO BAR): multi-part beveled body + cabin, specular paint with
  fresnel rim, spinning steered wheels, suspension travel, contact
  shadow, dust/exhaust/skid particle hooks, livery accent painter.
- fx.js      - speed feel: FOV ramp, camera spring/roll, near-ground
  speed streaks, skid marks decal pool, dirt/spark bursts, all
  reduced-motion gated via GGKit juice budget.

## Contract

- Engine renders; the TITLE keeps its own physics/sim, controls, modes,
  scoring untouched. Adapter surface: title feeds {carState, rivals[],
  trackJSON, theme, timeOfDay}; engine returns {world, camera api,
  track queries (closest point, sector, offroad test), minimap}.
- GGKit remains sole lifecycle/input/save/audio owner.
- Quality scaler: 3 tiers (dressing density, shadow on/off, streak fx)
  auto-stepped from measured frame time so low-end phones hold 60.
- Budgets: engine+one track+theme <=busy but 4x-throttle median
  <=17.5ms on the gate harness; per-title payload cap unchanged
  (engine lives in _shared, cached once).

## Acceptance (engine demo, before any title retrofit)

/play/_racerdemo/ page: one authored 8-turn circuit (elevation + banked
hairpin + chicane), desert AND night-city themes switchable via query
param, one AI rival driving the racing line, chase cam. Gate: any
3-second screenshot reads as a modern phone racer - textured banked
road with curbs, populated parallax horizon, specular car with spinning
wheels - AND the six-gate feel budget passes. Fable screenshots + owner
preview judge it BEFORE retrofits begin.

## Rollout order after demo sign-off

redline-gt (pilot retrofit) -> rally-dust, torque-trail, dune-runner,
dirt-rocket, kart-circuit-zero. Each retrofit: swap render layer to
GGRacer, keep sim/controls/modes verbatim, author 3+ themed track
JSONs per title from its existing course data.
