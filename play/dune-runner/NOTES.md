# Dune Runner

Controls: drag the left wheel or anywhere on the left half to steer; hold THROTTLE to accelerate; BRAKE slows you down; arrows/WASD and standard gamepads also work.
Loop: follow the compass, choose between ten authored route events, tag flags or recover crates before the event timer, and refuel only while coasting inside an oasis.
Fuel depletion triggers a walk-back to the nearest oasis for a 25-point penalty. END RUN banks the session score and route progress unlocks new liveries.
Best score is saved through GGKit. Portrait mode shows GGKit's rotate prompt and pauses the route.

## AAA rebuild

Implemented:

- Rebuilt the prototype as a procedural Three.js r160-style low-poly 3D buggy title using the `three` import map and GGKit for lifecycle, pause, input, save, audio, settings, juice, and PWA registration.
- Added fixed-step 60 Hz driving simulation with capped wall delta, visible chassis roll and pitch, four-wheel suspension travel, wheel steer and spin, loose-sand slip, hardpack grip, dune-face drift carve, authored jump lines, air-time tracking, landing quality feedback, fuel-out walk-back penalty, low-fuel audio warning, and pooled dust plus sand-spray particle systems.
- Added generous fuel canisters, score flares, boost dunes, oasis coasting refuel, surface feedback, salt-flat heat shimmer, escalating storm dust, banner beats, reduced-motion gating, procedural livery variants, and the boot/live `window.__dr` probe with `state`, `forceEvent`, and `forceRegion`.
- Added manifest, landscape viewport/PWA shell, procedural icon PNGs, local MP3 cues, and a complete service-worker precache containing only existing files.

Region and event table:

| Region | Identity and landmark | Event | Medal tiers | Unlock |
|---|---|---|---|---|
| Dawn Dune Sea | Amber dune sea, Dune Arch, Arch Cut shortcut | Checkpoint Raid | Gold 38s+, Silver 20s+, Bronze clear | Starts the chain |
| Redglass Wash | Canyon walls, Wreck Field, Wreck Cut shortcut | Time Attack, two-lap circuit | Gold under 46s, Silver under 62s, Bronze clear | Dawn clear |
| White Salt Flat | Hardpack sprint, Salt Needles, Salt Sling shortcut | Salvage Run, scattered crate recovery | Gold at 52% fuel+, Silver at 25%+, Bronze clear | Redglass clear |
| Night Oasis Ring | Blue-hour ring, Oasis Grove, Palm Cut shortcut | Night Raid | Gold 47s+, Silver 25s+, Bronze clear | Salt clear |
| Showcase Raid | Final storm escalation on the Night Oasis Ring | Showcase Raid, extended gold-flag chain | Gold 61s+, Silver 36s+, Bronze clear | Night Raid clear |

Deferred:

- Live browser smoke test could not run because this environment exposed no connected browser target and blocked starting a local HTTP server. `node --check` passed for every changed JavaScript file; manifest parsing, precache path checks, diff whitespace checks, and payload checks passed.

## Fix round 1

Fixed:

- CRITICAL art gate: replaced the dominant flat vehicle boxes with a beveled extruded hull, canopy, grille, fenders, lights, exhaust state, coherent wheel and shock rig, vertex-varied terrain, detailed landmarks, hazards, rival buggy, and fading contact particles.
- MAJOR compass regression: restored live next-flag and crate direction guidance with distance readout.
- MAJOR session banking regression: restored END RUN, explicit score banking, retry, fresh-session, and keep-driving choices through GGKit input clearing.
- MAJOR missing title and pause flow: added title screen, interactive first-run field brief, manual pause, resume, restart, and bank actions using GGKit lifecycle methods.
- MAJOR audio gate: added original procedurally synthesized menu and driving loops, kept all music and SFX on GGKit buses, and added both files to the service-worker precache.
- MAJOR content gate: expanded the route to ten event IDs across four regions, added an extended eleven-flag showcase chain, interactive onboarding, hazard counts, rival pace pressure, and unlockable saltline and nightburn liveries with a KIT selector.
- MAJOR difficulty and opposition gap: added authored rock hazards with timer penalties, a rival buggy pace, region-specific hazard density, and escalating event pressure.
- MAJOR hit-stop defect: fixed the frame loop so fixed-step simulation and timers continue while only cosmetic interpolation, particles, and camera motion freeze.
- MAJOR impact and feel gap: added spring-damped camera dip, contact flash, pooled impact bursts, checkpoint accents, boundary impacts, landing beats, explicit idle, drive, boost, airborne, and landing presentation states.
- MAJOR particle defect: particle alpha and size now decay from pooled lifetime attributes, and cosmetic randomness uses a dedicated visual stream instead of global randomness.
- MAJOR 390px HUD defect: compressed the HUD, added overflow handling, and wrapped the coaching strip at narrow widths.
- MAJOR loading defect: route construction now reports progress per authored region and scene phase while audio remains lazy until interaction.
- MINOR left-half steering regression: unclaimed GGKit pointers on the left half now become steering pointers, while menus and buttons remain excluded.
- MINOR gamepad gap: standard gamepad axes and buttons are mapped, with disconnect clearing input.
- MINOR save validation gap: validated progression fields, livery IDs, unlocked liveries, tutorial state, medal keys, and finite best-time keys against the content registry.
- MINOR restart input gap: retry, return, restart, and new-session paths use GGKit restart or clear the GGKit input map.
- MINOR terrain bounds gap: terrain now spans 80 by 80 local units around the 35-unit playable clamp.
- MINOR rumble-strip gap: replaced the full-width overlay with two narrow contrasting road-edge strips.

Rejected for this round:

- MAJOR AAA before and after evidence folder: the requested repository-level `review_evidence/aaa/dune-runner/` write is outside the explicit work-only directory, and no browser target was available to create truthful after captures. No fabricated evidence was added.

## UI declutter

- Cut the live brand/tagline, fuel flavor copy, steering hint, control sublabels, and center banners after a run starts.
- Shrunk the HUD to icon/bar-first score, fuel, route, timer, and compass readouts; moved route selection behind a compact route icon and hide it while driving.
- Replaced long event messages with one queued corner chip at a time, shortened the coach copy to one thin line, and moved medal/bonus/interruption detail to the results screen.

## GT graphics uplift

- Replaced the boxy buggy read with an authored multi-part shell, specular livery paint, tinted greenhouse, mirrors, tail lights, rim-faced spinning wheels, suspension travel, and soft pooled contact shadows.
- Added generated road/terrain grain, lane and curb markings, start gantry, distance boards, and pooled hard-surface skid marks.
- Added instanced rocks, scrub, and billboarded vegetation for a denser horizon, plus the existing gradient sky/fog with sun and hemisphere fill.
- Lowered the chase camera, added speed FOV and reduced-motion-gated corner roll, and kept all gameplay, controls, events, scoring, and probe hooks unchanged.
- Tradeoff: per-region generated canvas textures, instanced dressing, and one dynamic skid mesh add startup GPU setup and a few draw calls; geometry is pooled/instanced and the payload remains code-only.

## GGRacer retrofit

Dune Runner now uses the approved shared GGRacer rendering layer. `game.js` is
the title adapter and preserved simulation plus HUD. The title still owns the
fixed-step vehicle model, steering sign, throttle and brake controls, compass,
flag tags, crate recovery, fuel depletion, coasting oasis refuel, walk-back
penalty, event modes, medals, GGKit saves, audio, and the `window.__dr` probe.
GGRacer owns the renderer, road ribbon, terrain, scenery, GT-bar vehicle,
rival vehicle, dust and speed effects, chase camera, and resize lifecycle.

The old title-owned Three.js scene, road, terrain, buggy, rival, particle,
skid, lighting, and camera functions were deleted. The adapter sends each
frame as `{ carState, rivals }` in world space and never writes camera Euler
components. Engine camera roll remains quaternion-space through the shared
camera API.

The ten event JSON files under `tracks/` were authored from the existing four
region routes and the existing eleven-flag showcase route. Their control point
coordinates add the existing region origins, their elevation values use the
preserved region terrain functions, and their banking values are derived from
the authored route turns. All ten are explicit point-to-point stages with
`closed: false`, while the title-side time events retain their existing
two-lap simulation behavior. Flags, pickups, hazards, and oasis logic remain
title-side and store normalized `closestPoint` progress anchors for the active
GGRacer track.

Theme progression is deliberate: the three Dawn Dune Sea events use desert at
dusk or dawn, both Redglass Wash events use desert at dusk, the White Salt Flat
events use coastal and alpine presentation, and all Night Oasis Ring events
use night-city at night with readable headlights. GGRacer quality tier 2
provides populated parallax scenery on each authored course.

### Retrofit verification contract

- `node --check game.js` passes after the render swap.
- The ten track files have `version: 1`, `closed: false`, width and banking,
  elevation, sectors, distance markers, racing lines, and objective anchors.
- The title sim constants in `stepVehicle`, `updateEvent`, fuel handling,
  route timing, medal thresholds, save validation, and input mapping were
  retained. Rendering-only particle and mesh work was removed.
- The shared engine adapter gap is that `createRacerWorld` has no title-side
  objective marker API. Dune Runner keeps those markers in its own runtime and
  uses the engine query surface for track anchoring and off-road tests.
