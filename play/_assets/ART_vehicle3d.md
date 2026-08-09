# AAA Art Bible — Vehicle 3D lane (Rev 1, 2026-08-06)

Titles: Redline GT (pilot), Rally Dust, Torque Trail, Cloudhopper.
Engine: Three.js r160 (vendored at /play/_shared/three/, import map name
`three`; GLTFLoader available). House motion language from
ue-port-studio/ART_DIRECTION.md rules 1-5 and 7 applies verbatim.

## Look

Stylized low-poly, NOT photoreal. Reference class: contemporary premium
mobile racers with flat-shaded low-poly art. Warm saturated palette,
strong sky gradients, long soft shadows.

- Models: Quaternius / KayKit class CC0 GLB packs from
  worker-archive/studio-assets/ (cars, trees, rocks, buildings). Where a
  needed model is missing, build from Three primitives with
  MeshStandardMaterial flat colors and beveled proportions; never mix a
  primitive-gray placeholder into a shipped frame.
- Lighting: ONE directional light + hemisphere ambient. Baked-feel: no
  runtime shadow maps above 1024px; prefer blob shadows (textured plane)
  under vehicles. Fog color = horizon color for depth.
- Sky: gradient dome or Three.Fog + large-radius sphere with vertex
  colors; time-of-day per track (dawn/noon/dusk/night across the track
  list) is the cheapest variety multiplier in the lane.
- Ground/track: vertex-colored or ambientCG 2K textures at LOW repeat,
  color-graded to the palette. Track edges need a contrasting rumble
  strip; readability outranks realism.

## Feel (gate-checked)

- Camera: chase cam with spring-damped position, velocity lookahead on
  the look-at, speed FOV +5 deg max, landing/impact dip. Per house rule 4.
- Vehicle: chassis lean/pitch from acceleration (cosmetic, spring-damped,
  one overshoot), wheel spin + steer yaw visible, exhaust/dust particle
  systems (>=2 particle systems is a gate minimum: e.g. dust/gravel kickup
  + speed lines or rain).
- Impacts: hit-stop 40-70 ms render-side + shake within house budget
  (<=2% view height, accessibility toggle via ggkit.juice.enabled).
- UI: speedometer/tach as styled arcs, not text; countdown 3-2-1 with
  ease-out-back pops; position/lap chips with slide-in.

## Audio

Engine loop = layered pitch-shifted loop (asset or synthesized buffer),
skid, surface change, collision, UI ticks, music: 1 menu + >=1 driving
track from freepd-music. All through ggkit.audio buses.

## Per-title notes

- Redline GT: 6 tracks exist in prototype (design doc). Keep track
  geometry/handling constants; rebuild rendering as true 3D (the
  prototype is pseudo-3D raster). Grandstands/billboards ORIGINAL brands
  only (GreenGuard house brands welcome as an easter egg).
- Rally Dust: reuse Redline foundation (car controller, chase cam,
  particle rig); swap surface model (loose grip), add pace-note voice
  chips (synth ok) and dust plumes.
- Torque Trail: open-world scope stays prototype-honest: ONE map, winch
  and mud systems carried from prototype constants; terrain from
  heightfield + vertex color, props from KayKit forest.
- Cloudhopper: horizon + cloud layer (billboard sprites) + terrain tiles;
  stall/fuel model carried verbatim; cockpit frame overlay for
  first-person feel; landscape orientation.
