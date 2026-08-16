# Vertol Rescue

Controls: drag the left stick to fly; drag the right WINCH lever down to lower and up to raise. Keyboard: WASD fly, Arrow Up/Down winch, Space/Enter restart.

Loop: hook all 8 stranded survivors, lift them aboard, and land at the hospital pad before fuel or hull runs out. Best score is saved locally.

## AAA rebuild

### Implemented

- Rebuilt the archived canvas prototype as a fixed-step Three.js vehicle 3D title using the shared import map and GGKit for lifecycle, input identity, saves, audio buses, loading, settings, PWA registration, hit-stop, and reduced-motion juice.
- Added analog hover handling with inertial drift, throttle and hover-load fuel burn, gust force, tail-rotor yaw wash, yaw spring, hard-landing damage, rotor-strike damage, three hull smoke and spark stages, generous fuel drums, repair kits, and flare pickups.
- Added the live rescue loop: pooled survivor rigs, cable sway, cable tension feedback, hook contact, rig-up lag animation, onboard load, hospital-pad intake, triage reorders, shortcut discovery, rescue-window failure, fuel failure, and hull failure.
- Added the `window.__vr` probe with `state`, `forceMission(value)`, and `forceWind(value)` in both the boot fallback and live scene.
- Added the title board, guarded unlock chain, medal scoring for lives saved, time, and damage, result reports, 60%-width overshoot banners, thin coach strip, landscape manifest, icon set, offline worker, MP3-only procedural audio bank, and per-title license record.

### Zone and mission table

| Mission | Authored zone | Survivor flow | Hazards and signature | Shortcut | Medal target |
|---|---|---|---|---|---|
| Urban Extraction | Floodline District | 6 rooftop and flood-edge survivors under a 150 second window | Power lines, smoke columns, rooftop collapse | Canal Cut | 106 seconds, 25% damage or less |
| Storm Rescue | Ember Ridge | 6 ridge survivors in high wind and low visibility | Wildfire smoke, fire fronts, ridge strike set-piece | Firebreak Saddle | 119 seconds, 38% damage or less |
| Mass Casualty | Northstar Offshore Rig | 9 survivors with priority 1, 2, and 3 triage order | Rig cranes, smoke, capsized boat set-piece | Under-Deck Channel | 152 seconds, 25% damage or less |
| Night Harbor Finale | Blackwater Harbor | 7 night survivors through a final unlocked route | Power lines, crane, smoke, collapsing dock | Dry Dock Tunnel | 140 seconds, 25% damage or less |

### Deferred

- In-app browser visual smoke testing and 4x feel capture could not run because no browser target was available and the local server was not permitted to bind in this environment. `node --check`, shared Three import validation, precache existence checks, forbidden-asset scans, and payload checks did run.
- `node --check` was run for every changed JavaScript file. It is not applicable to the changed HTML, JSON, PNG, or MP3 files; those were checked with manifest parsing, exact precache path checks, file-type inspection, and size checks.
- Production deploy, git commit, and external gate capture were intentionally not performed.
- A CC0 survivor voice recording set was not present under `/play/_assets/`; the title therefore uses original procedural MP3 cues through GGKit, with the asset-ledger decision recorded in `LICENSES.md`.

## Fix round 1

### Fixed findings

- C1: strengthened the procedural 3D presentation with a gradient sky dome, palette-driven livery and zone materials, cast-shadow lighting, blob shadow, emissive hazard signals, airframe detailing, and environmental wash response.
- M1: added a compact landscape-phone title layout with bounded scrolling for the campaign board.
- M2: kept time, altitude, cable tension, and triage visible in a compact telemetry strip on narrow screens.
- M3: added a first-sortie guided tutorial with SOS target beacon, direction arrow, contextual coach text, hook, reel, and landing steps.
- M4: wired Space and Enter restart actions through the game action path.
- M5: added mapped gamepad axes, triggers, face buttons, pause, and restart handling. GGKit still owns pointer and keyboard lifecycle clearing.
- M6: exposed `state.mode = 'paused'` and `state.paused`, with Escape and P pause/resume paths.
- M7: attached aboard survivors to animated helicopter cabin seats and kept rig-up progress separate from their world position.
- M8: added fixed-step collective and wind-driven tail-rotor yaw-wash torque plus its audio cue.
- M9: made triage mistakes add time and fuel cost, and made shortcuts add an eight-second medal-clock credit.
- M10: added stepped hazard activity, motion-aware collision, moving warning signals, and evolving smoke, fire, collapse, and boat phases.
- M11: added six authored replay contracts, giving the campaign ten sorties and more than twenty minutes of honest time budget.
- M12: added validated per-mission best time, damage, saved count, and medal records, with board and result display.
- M13: changed hit-stop to freeze only view interpolation while the fixed-step simulation continues.
- M14: applied GGKit shake, spring camera follow, velocity lookahead, landing dip, bounded FOV kick, and damage vignette behind the juice setting.
- M15: added explicit hover, fly, land, damage, and crash airframe states plus survivor waiting, hooked, rigging, aboard, and delivered presentation states.
- M16: added the looping `night.mp3` track and `landing.mp3` and `tailwash.mp3` SFX, and re-encoded the full MP3 bank to stereo 44.1 kHz, 96 kbps.
- M17: added FX clearing on restart/results and oldest-slot reuse when the pool is full.
- M18: disposed old zone geometry and materials before rebuilding a mission zone.
- M19: added per-particle color, size, alpha fade, and pooled anticipation/contact/follow-through motion.
- m1: removed eager audio preload; music and SFX load lazily through GGKit after interaction.
- m3: stop music when leaving flight for title or result screens.
- m4: changed the loader to report scene, zone, UI, and first-frame phases.
- m5: added visible fullscreen actions on the title and result screens.
- m6: added expanding rotor-wash rings and dust response at the airframe footprint.
- m7: gave fuel, repair, and flare pickups distinct procedural silhouettes.
- m8: exposed medal time and damage thresholds on mission cards and result reports.

### Rejected finding

- m2: retained as an out-of-scope shared-runtime finding. The malformed UI/audio preference read is in `/play/_shared/ggkit.js`; changing it or bypassing GGKit storage would violate the instruction to work only in this title directory and keep GGKit as the sole save/audio owner.

### Verification

- `node --check game.js` and `node --check sw.js` passed. Manifest JSON parsing, inline UI ID checks, service-worker precache existence checks, MP3 format checks, forbidden-format and em-dash scans, `git diff --check`, and payload checks passed.
- Payload is 276,511 bytes total; largest file is 87,041 bytes. All shipped audio is MP3 and every file is below 400 KB.
- Live browser smoke testing and 4x-throttle frame capture were unavailable because the browser inventory was empty. No deploy or commit was performed.

## UI declutter

- Cut the live center banner, always-on brand/watermark, coach copy, control labels/hints, altitude/triage text strip, and tutorial arrow label from active play.
- Shrunk persistent HUD readouts into icon/value/meter chips; kept fuel, hull, survivors, wind, time, and cable tension visible, with triage retained on the results screen.
- Moved the objective to a single thin top-edge line and reduced tutorial guidance to a small edge direction marker.
- Replaced in-play banners with one queued corner event chip, concise event text, fast fade, and a maximum one-second hold; run boundaries now use the existing title/results screens.

## Retina pass 2026-08-16

- Before ratio: 1.50x at DPR 3, from the renderer's hard cap. After ratio: 3.00x is configured by `GGKit.hiDpi.three(renderer)`; a live canvas measurement was unavailable because this sandbox refused private HTTP listeners and had no browser target.
- Recipe: called `GGKit.hiDpi.three(renderer)` immediately after `new THREE.WebGLRenderer`. No render targets, post-processing passes, or composers were present. The custom FX particle shader now takes `renderer.getPixelRatio()` instead of the old 1.5x cap.
- Factor cap: none beyond GGKit's standard maximum of 3. No title-specific cap was needed.
- Static verification: `node --check game.js` and `git diff --check` passed. Gameplay screenshot, `canvas.width / getBoundingClientRect().width >= 2.85`, and live layout confirmation remain unmeasured in this environment.
