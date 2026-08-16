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

## GRAN TURISMO BAR (owner directive 2026-08-11, ALL driving/racing titles)

Owner verdict: "racing game and driving game graphics look primitive -
get into the 2000's at least, think Gran Turismo." The target is PS2-era
racer fidelity built from Three.js primitives and generated textures.
Flat-shaded boxes on an untextured plane are REJECTED on sight.

Mandatory:
1. CAR BODIES: no single-box cars. Authored multi-part shells: beveled
   lower body + tapered greenhouse/cabin with tinted windows, wheel
   arches, bumpers, visible headlight/taillight geometry (emissive at
   dusk/night), side mirrors where visible. Paint uses MeshPhongMaterial
   or MeshStandardMaterial with strong specular highlight and a subtle
   fresnel/eng-map style sheen; livery accents per vehicle.
2. WHEELS: separate cylinders with dark tire + bright rim face that
   VISIBLY ROTATES with speed, steer with input on the front axle, and
   compress with suspension over bumps. A soft dark contact-shadow blob
   sits under every vehicle.
3. ROAD/TRACK: textured surface (generated canvas texture: asphalt or
   terrain grain, center/edge markings, tire wear line), skid marks on
   hard cornering, curbs or edge posts on corners, start/finish gantry
   or arch, distance-marker boards on racing titles.
4. WORLD DEPTH: gradient sky dome or large sky sphere with horizon haze,
   scene fog tuned so distant geometry fades believably, sun as a
   directional light + hemisphere fill (no flat ambient-only scenes),
   layered trackside dressing (trees/rocks/buildings/crowd boards as
   cheap billboards or low-poly clusters) dense enough that the horizon
   is never empty in a normal camera frame.
5. CAMERA + SPEED FEEL: low chase camera with lag/spring, FOV widens
   with speed, slight camera roll in corners; optional speed-line or
   near-ground blur cue at top speed (reduced-motion gated).
6. BUDGETS STILL APPLY: everything generated in code or from in-repo
   assets; keep draw calls pooled/merged (merged geometry or instancing
   for dressing), 4x-throttle median <=17.5ms unchanged.

Test: a 3-second chase-cam screenshot of any race should read as "a
2000s console racer" - car with readable bodywork and spinning wheels,
textured road, populated horizon - never "colored boxes on a plane."

## CRUIS'N FLOOR AND CAR LAW (owner, 2026-08-13)

Two owner rulings, binding on every vehicle title from this date. They sit
BELOW the Gran Turismo bar above: the GT bar is the target, this is the floor,
and anything under the floor is an automatic reject regardless of the rest of
the build.

**Cruis'n floor.** Cruis'n USA (1994 arcade) is the MINIMUM acceptable level
for cars, backgrounds and animations. In practice that means: vehicles with
real body shapes, arches, glass and lights rather than blocks; roadsides packed
continuously with recognisable landmarks, buildings, signage, trees, water,
traffic and terrain that establish where you are; a horizon that always has
something in it; animated life in the world (crowds, traffic, birds, flags,
water, blowing dust); vehicle animation with visible suspension, weight
transfer, wheel spin and crash reactions; and a distinct visual identity per
course that you could name from a single frame.

**Car law.** Owner verdict, verbatim: "the cars look terrible unrealistic
boxes, they need to look badass." A body built from box primitives is a defect.
Every vehicle is a sculpted multi-part model: tapered nose with a real
front-end face (grille, intakes, lights), raked greenhouse with separate glass,
wheel arches that arch over the wheels, sills, rear haunches wider than the
cabin, spoiler or ducktail, diffuser, exhausts, mirrors. Stance is half the
job: wide track, large-diameter wheels with visible dish, low ride height for
the class, nose-down under braking. Materials separate: metallic paint with
clearcoat highlight and an environment reflection, dark semi-transparent glass
with a fresnel rim, matte rubber with sidewall detail, chrome or dark trim,
emissive lamps; brake discs and calipers visible through the spokes. Animation
on every vehicle: wheels spin and steer, steering wheel turns, brake lights
under braking, headlights at night, squat under power, dive under braking, roll
in corners, contact shadow always.

Legal geometry sources: kitbash and re-material the CC0 Quaternius car meshes
at worker-archive/studio-assets/quaternius-cars (SportsCar, SportsCar2,
NormalCar1, NormalCar2, SUV, Taxi, Cop; OBJ+MTL ~130KB each, OBJ/MTL loaders
already in /play/_shared, trace through play/_assets/LEDGER.md), or build the
body procedurally from lathed and lofted profiles. Either way, re-material and
detail to the bar above.

ACCEPTANCE: a close chase-cam screenshot reads as a real vehicle of its class.
Silhouette test: fill the render black and it still reads as a car, with a
recognisable roofline, arches and stance. Applies in adapted form to hover
machines, bikes and karts.

---

## RETINA LAW APPLIES (owner bar delta 2026-08-16)

"everything should be high resolution and more distinct colors no atari
looking nonsense it is for iphones make the tech shine"

See play/_assets/RETINA_LAW.md, which is MANDATORY and sits at the same
level as this bible. Headline: the fleet was measured on an emulated 3x
iPhone display and NOT ONE title rendered at native density (ratios of 1.0
to 2.0 against a device ratio of 3.0). Colour depth is already good fleet
wide; the defect is pixel density, and the upscale is what makes the art
look coarse. Render at min(devicePixelRatio, 3), bake textures at device
scale, keep text vector or device-scale baked, and do not pay for it in
frame time.
