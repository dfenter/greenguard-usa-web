# Deep Ballast

Controls (touch): hold BALLAST to flood tanks and sink, release to blow tanks and rise; drag anywhere else left/right to steer; tap SONAR to ping.
Controls (keyboard): Space / Down / S = ballast, Arrows or A/D = steer, E / Enter / Shift = sonar ping.
Loop: pings are your only eyes in the dark trench, but big fauna swim toward the last ping. Grab 3 salvage crates and surface before air runs out or pressure below the redline crushes the hull.
Salvage banks only when you surface alive; spend it in DRY DOCK on air tanks (longer dives) and hull plating (deeper redline).
Best depth, bank and upgrades persist in localStorage.

## AAA rebuild

### implemented

- Rebuilt the archived canvas prototype as a Three.js r160 vehicle-3D title with an authored low-poly submersible, hull-plating tiers, sonar-only visibility, shader sonar rings, additive glow, bubble streams, silt trails, pressure redline, groan warnings, and fauna that homes toward the last ping.
- GGKit is the sole lifecycle, pointer identity, keyboard input, save, audio-bus, settings, juice, orientation, and PWA implementation. The fixed 60 Hz accumulator is capped at four steps, so slow devices enter slow-motion rather than skipping simulation time.
- Added a dry-dock loop with air and hull upgrades, persistent salvage, route unlocks, structured objective completion, result medals for depth, air remaining, and salvage, generous air and sonar caches, and the `window.__db.state` hook with `mode`, `depth`, `air`, `pressure`, `salvage`, `zone`, `forceZone`, and `forceFauna`.
- Added `manifest.json`, `icon.png`, `icon512.png`, `favicon.png`, versioned `sw.js`, generated local MP3 cues, and `LICENSES.md`. No CDN, hotlink, OGG, third-party art, or other title directory is used.
- Static verification passed: `node --check game.js`, `node --check sw.js`, manifest JSON parsing, vendored Three.js symbol checks, service-worker precache existence, and payload/file-size checks. No live browser or WebGL interaction check was possible because no browser instance was available in this session.

### zone table

| Zone | Identity and flow | Landmark | Shortcut | Fauna ramp |
|---|---|---|---|---|
| Kelp Shelf | Narrow greenwater shelf with kelp walls and early crate cadence | Kelp Cathedral | Greenwater Cut | 2 territories |
| Wreck Graveyard | Rusted hulls, staggered salvage pockets, wider wreck lanes | The Sunken Hauler | Rusted Service Tunnel | 4 contacts |
| Thermal Vent Field | Ember vents, rising pressure, deeper cache spacing | Blacksmoke Chimney | Ventroot Passage | 7 contacts |
| Abyssal Trench Floor | Violet cavern approach, longest route, maximum pressure | The Bioluminescent Cavern | Abyssal Root Tunnel | 10 contacts |

### dive table

| Dive | Zone | Objective | Unlock |
|---|---|---|---|
| Salvage Dive | Kelp Shelf | Recover 3 crates and surface | Available at launch |
| Deep Survey | Wreck Graveyard | Map 3 beacons and return | Salvage Dive completion |
| Rescue Descent | Thermal Vent Field | Retrieve the pod against a timer and return | Deep Survey completion |
| Abyssal Dive | Abyssal Trench Floor | Recover the black-box core and return | Rescue Descent completion |

### deferred

- Live 4x-throttle frame capture and device WebGL visual QA remain deferred until a browser-backed run is available. The implementation keeps the requested pooled hot-loop ceilings and stays under the 2.5 MB title payload budget.

## Fix round 1

Fixed:

- CRITICAL runtime boot and launch crashes: restored the `pressureTick` and `banner` DOM handles.
- CRITICAL touch controls: restored pointer targeting for the ballast, sonar, and settings controls.
- CRITICAL greybox risk: added a profiled hull silhouette, authored fauna detailing, directional lighting, trench cables, landmark lighting, and actual tunnel dressing.
- MAJOR animation and feel: added idle, descend, ascend, and impact presentation states for the sub and fauna, plus hit-stop, contact flash, shake, camera dip, velocity lookahead, and eased speed FOV.
- MAJOR reduced motion and combat fairness: cosmetic particle, sonar, and impact motion is gated, and fauna damage now requires a recent sonar reveal.
- MAJOR sonar behavior: fauna now becomes homing only as the expanding wavefront reaches it, with a 320 m falloff ring.
- MAJOR world flow: shortcut arches now lead through a route cut that advances the dive and grants a 128 m depth skip when entered.
- MAJOR onboarding: added a nonblocking first-run coach that teaches ballast, release, sonar, steering, salvage, and surfacing, persisted through the GGKit save.
- MAJOR content: expanded the progression from four dives to ten authored operations across the four trench zones, with migration for existing saves and ten result records.
- MAJOR audio: added the dry-dock music loop, switched between dock and dive music through GGKit, lazy-loaded audio after interaction, and re-encoded shipped MP3s to mono 96 kbps.
- MAJOR 390 px UX: reflowed the HUD and compressed mobile controls to prevent top-bar overflow.
- MINOR particles: added per-particle size and alpha scale-fade shader attributes while retaining bounded pools.
- MINOR settings: added persistent music and SFX volume controls through the GGKit settings shell.
- MINOR debug state: `forceFauna` is now read at dive initialization only, so live probes cannot reset collected route entities.

Rejected or deferred:

- MINOR gamepad support: not added because GGKit exposes no gamepad input surface, and a raw `navigator.getGamepads()` path would violate the brief's GGKit-only input rule. Touch and keyboard controls remain fully wired.
- MAJOR deployed AAA evidence and live 4x/browser validation: deferred for this round because the request explicitly forbids deploy and limits work to this title directory. Static checks passed for changed JavaScript syntax, manifest parsing, DOM references, service-worker paths, MP3 format, diff cleanliness, and the 356 KB title payload.

## UI declutter

- Cut the live center alert, landmark/rescue banners, launch instruction toast, and end-of-dive banner; important states now live in meters, the contact icon, the objective chip, and the results screen.
- Shrunk the active HUD to icon/meter clusters and removed always-on zone/landmark and verbose objective text.
- Moved in-play events to one queued edge chip capped at 1 second; tutorial help is one thin 24px top strip that fades after about 3 seconds and yields to the chip.
