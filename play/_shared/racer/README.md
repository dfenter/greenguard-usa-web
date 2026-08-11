# GGRacer shared racing lane

GGRacer is the shared Three.js r160 rendering layer for GreenGuard driving
titles. It is intentionally an adapter, not a game simulation: a title keeps
its physics, controls, modes, scoring, save data, and audio under GGKit.

## Adapter contract

```js
import { createRacerWorld } from '/play/_shared/racer/engine.js';

const racer = createRacerWorld({
  canvas,
  trackJSON,
  theme: 'desert',             // desert | coastal | alpine | night-city
  timeOfDay: 'dusk',
  ggkit: kit,                  // optional; used for juice/reduced-motion
  rivalCount: 1,
});

const frame = {
  carState: {
    // Supply position/yaw, or supply progress and GGRacer samples the track.
    progress: 0.18,
    speed: 31,                 // metres/second
    steering: -0.2,            // -1..1
    acceleration: 0,
    lateralG: 0,
    suspension: 0,
    brake: 0,
    boost: 0,
  },
  rivals: [{ progress: 0.22, speed: 29, steering: 0 }],
};

// The title owns this loop and calls these while GGKit is active.
racer.world.update(frame, dtSeconds);
racer.world.render();
```

`carState.position` may be a `{x, y, z}` object or a `THREE.Vector3`. If it
is omitted, `progress` is sampled against the track's authored racing line.
`yaw` is radians around Y; when omitted it follows the track tangent. A title
may also use `racer.world.start(getFrame)` / `stop()` for the standard render
loop. Pause callbacks should call `racer.world.setPaused(true/false)` while
GGKit remains the sole lifecycle owner.

The returned surface is:

- `world`: Three scene, renderer, camera, track, environment, car/rivals, FX,
  update/render/lifecycle methods, and resize/dispose.
- `camera`: chase-camera API (`setMode`, `snapToCar`, and the camera object).
- `trackQueries`: `closestPoint`, `isOffroad`, `getSector`, `checkpoint`, and
  `sampleRacingLine`.
- `minimap` / `exportMinimap()`: a normalized-track polyline export.
- `quality`: measured three-tier scaler (`0 low`, `1 balanced`, `2 showcase`).

## Track JSON schema

```json
{
  "version": 1,
  "id": "course-id",
  "name": "Course name",
  "width": 12,
  "sampleCount": 216,
  "turns": [{ "number": 1, "at": 0.2, "name": "Switchback", "type": "hairpin" }],
  "controlPoints": [
    { "x": 0, "z": -80, "elevation": 0, "banking": 0, "curb": false }
  ],
  "sectors": [{ "id": 1, "at": 0.0 }],
  "distanceMarkers": [{ "at": 0.5, "label": "2" }],
  "racingLine": [{ "at": 0.0, "lateral": 0.3 }]
}
```

`controlPoints` are a Catmull–Rom spline in metres — a closed circuit loop by
default, or a point-to-point stage with `"closed": false` (rally/route
titles). `"frame": "transport"` switches the road frame to parallel transport,
which is what allows loops, corkscrews, vertical walls, and dives: the frame
rolls with the track through vertical features and relaxes back to
world-upright on non-steep sections, and closed loops unwind any residual
twist so there is no seam kink. In transport mode a title should drive the
car by `progress` (plus optional `lateral` metres from the racing line,
`hover` metres above the deck, and `headingOffset` radians of slide about the
local up) and let the engine orient the machine with the full track frame —
the chase camera follows the car's up through inversions. An open stage clamps progress to `[0, 1]` instead of wrapping, keeps
its endpoints separate, and gets a START gantry at progress 0 plus a FINISH
gantry at progress 1. `elevation` is Y
height in metres; `banking` is degrees; `curb` marks a corner apex for the
red/white curb pool. `sectors.at` and `racingLine.at` are normalized progress
in `[0, 1)`. `racingLine.lateral` is metres from the centerline, positive on
the track frame's right side. `distanceMarkers` adds roadside braking boards.
`turns` is optional authoring metadata for title UI and review. `sampleCount`
is optional and is clamped to a mobile-safe range.

The track builder generates the textured/extruded road ribbon, wear and
center/edge markings, rumble strips, apex curbs, barriers, gantry, sector
gates, checkpoint queries, and minimap data. Titles author JSON; they do not
modify renderer geometry code.

## Performance and visual floor

Roadside dressing is instanced or pooled, particles and skid marks are
reused, and the hot update path avoids creating vectors/arrays. The quality
scaler reduces dressing, cloud count, blob shadows, and pooled FX from
showcase to low when measured frame time rises. FX honor
`GGKit.juice.enabled`; reduced motion hides streaks, skid marks, and burst
emission. The target gate is a 4× throttled
median frame time at or below 17.5 ms on a 390px landscape viewport.

The default visual lane includes a gradient sky dome, terrain texture to the
horizon, three parallax horizon depths, dense trackside dressing, generated
road texture, low-poly GT-bar bodywork, spinning steerable wheels, blob
contact shadow, and two pooled particle systems. The acceptance reference is
`/play/_racerdemo/?theme=desert` or `?theme=night-city`.
