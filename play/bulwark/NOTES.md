# Bulwark
Touch: tap an empty cell, then a chip (WALL/ARROW/FROST/SPLASH/ZAP/BANK) to build; double-tap a cell to rebuild the last type; tap a tower for upgrade/sell; tap a wall to refund it; GO calls the wave early for bonus gold.
Keys: arrows/WASD move cursor, 1-6 pick chip, space/enter build or open sheet, U upgrade, X sell, G go, M mute, R restart.
Loop: walls and towers reroute live pathfinding, so maze the creeps into your guns. Banked gold earns interest between waves; banks add more.
Fliers ignore the maze, tanks have armour, shielded regenerate, a boss lands every 10th wave.
Fail when lives reach zero, win at wave 30 (endless continues). Score = waves + lives left, best kept in localStorage.

## AAA rebuild

Implemented:

- Rebuilt Bulwark as a Phaser 3 landscape scene using `/play/_shared/phaser.min.js` and GGKit for lifecycle, fixed-step input, save validation, audio buses, PWA registration, settings, shake, and reduced-motion gating.
- Replaced the archived random map generator with four authored 14x9 maps, cached live BFS routes, path-validity previews, build/rebuild/sell/upgrade feedback, range rings, splash rings, path reroute markers, and a lane-engineer beacon with idle, command, and resolve states.
- Added generous 220G starts, early GO bonuses, wave-clear interest, bank levels, guaranteed early campaign bonus drops, 20-life leak failure, wave 30 victory, and endless continuation.
- Added pooled creep, projectile, particle, FX, and floater slots. Silhouettes cover grunt, runner, tank, flier, shielded, boss, wall, arrow, frost, splash, zap, and bank roles. Boss spawn uses banner and GGKit shake/audio beats.
- Added first-run four-step coach strip for build, maze validity, GO, and upgrade. It stays above the board and never blocks the play area.
- Added manifest, icons, favicon, service worker precache, local procedural MP3 cues, and `LICENSES.md` with the required strategy bible and asset ledger references.
- Added `window.__bw.state` with live `wave`, `gold`, `lives`, `map`, `score`, `phase`, and map index fields. `window.__bw.forceWave` and `window.__bw.forceMap` are readable from boot fallback and live scene.

Map table:

| Map | Identity | Signature puzzle |
| --- | --- | --- |
| Open Plains | wide sightlines / twin pockets | Offset the route through two open pockets. |
| River Split | two banks / one bridge choice | Reserve one bridge, then fold the banks into a loop. |
| Canyon Funnel | stone jaws / single throat | The canyon has one throat. Make it longer, never closed. |
| Final Bastion | fortress rings / two gate puzzle | Crack the outer ring, then turn the inner gate into a kill lane. |

Wave table:

| Waves | Content | Reward or unlock |
| --- | --- | --- |
| 1 to 9 | Grunts, runners, fliers, tanks, shields introduced in sequence | Early waves receive generous bonus drops. |
| 10 | Escalating Warden boss wave | Bronze medal and FROST chip. |
| 11 to 19 | Mixed air, armor, and shield pressure | Bank interest and wave-clear rewards continue. |
| 20 | Stronger Warden boss wave | Silver medal and SPLASH chip. |
| 21 to 29 | Full mixed roster with higher scaling | Every fifth later wave receives a bonus drop. |
| 30 | Final Warden boss wave | Gold medal, ZAP chip, victory, then endless continuation. |

Deferred:

- Live in-app browser and visual screenshot verification could not run because no browser connector was available and the sandbox refused a local HTTP listener. Static `node --check` passed for every changed JavaScript file, all authored maps and precache targets validated, and a stubbed Phaser boot, input, map switch, forced wave, and stepped simulation pass completed.

## Fix round 1

Fixed:

- CRITICAL battlefield presentation: added layered biome floors, faceted stone, timber and gate details, authored landmarks, stronger ports, and directional tower caps.
- CRITICAL player proxy: rendered the lane-engineer beacon with idle, command, resolve, victory, and defeat states.
- CRITICAL animation floor: added phased idle and movement, attack anticipation, hurt recoil, and defeat follow-through for creeps, plus attack motion for towers.
- CRITICAL particle gate: replaced the shared particle pool with four persistent bounded pools for contact sparks, dust debris, projectile trails, and wave bursts.
- MAJOR map exploit and stale economy: locked map changes after a run begins, made fresh map selection reset the complete run, persisted the selected map, and recomputed bank stats on every bank mutation and render.
- MAJOR milestone timing: FROST, SPLASH, and ZAP now unlock from completed waves and medal progression, not the wave currently starting.
- MAJOR controls: added arrows/WASD cursor movement, shared keyboard build/select actions, and edge-triggered gamepad movement, confirm, cancel, and GO actions.
- MAJOR end-state mutation: gameplay actions are rejected after win or loss; restart, mute, and the allowed endless continuation remain available.
- MAJOR scoring: score is refreshed after wave rewards and before best-score persistence, including loss and victory paths.
- MAJOR feel and accessibility: added GGKit hit-stop, attack recoil, contact states, render-side freeze behavior, and reduced-motion softening for flashes, beams, rings, pulses, particles, and shake.
- MAJOR music and audio: ambient music arms after first input, danger music transitions on boss waves, end states stop music, and select, confirm, cancel, place, upgrade, hit, kill, warning, and clear events use distinct GGKit cue semantics.
- MAJOR small-screen UI: enlarged touch hit regions and text, applied safe-area insets, surfaced tower readiness, and kept the action rail above 44px physical intent at the target landscape scale.
- MAJOR enemy readability: enemy silhouettes now share coral and wine trim, coral health caps, and coral threat rings while retaining type-specific bodies.
- MINOR double-tap rebuild: added timed double-tap rebuilding using the last successfully built chip.
- MINOR tutorial and leak copy: corrected the route color copy and changed the loss language from leaks to lives.
- MINOR placement route preview: added a solved candidate route ghost for valid placement previews.
- MINOR bank panel freshness: bank count and interest are live after placement, upgrade, sale, and wall changes.
- `sw.js` VERSION bumped to `aaa-20260810-2`.

Rejected or deferred:

- No review finding was rejected as factually wrong. Live browser visual QA and the 4x-throttle frame capture remain unverified because no browser surface was available; static syntax, stubbed Phaser boot/action/map-lock checks, map solvability, unlock timing, asset/precache, no-em-dash, MP3-only, payload, and file-size checks passed.

## UI declutter

- Cut always-on title/tagline, map flavor, command paragraphs, medal copy, chip descriptions, combat/economy floaters, and redundant selection/wave toasts from active play.
- Shrunk the HUD to icon-led lives/gold/wave/score, compact route and bank meters, a map icon control, and one-line chip controls.
- Moved in-play events to one queued corner chip with a 1.0s hold; the boss warning is now a chip instead of a live center banner.
- Retimed the coach to one top-edge line that fades after about 3s, and kept center banners only for wave-clear, medal, win, and loss boundaries.

## Retina pass 2026-08-16

- Ratio record at landscape CSS 844x390 and DPR 3: before 1.85x from the 1280px design FIT backing store; after 3.00x expected from a 2080x1170 backing store. Live canvas measurement was unavailable.
- Recipe: `GGKit.hiDpi.factor(1280, 720)`, dense FIT scale dimensions, `GGKit.renderDefaults`, and `setZoom(RETINA_FACTOR)` in the Bulwark scene.
- Factor cap: none. The factor is GGKit-clamped to the device maximum of 3.
- Could not capture the required DPR 3 gameplay screenshot or `canvas.width / getBoundingClientRect().width` measurement because no browser instance was available and the private port could not be opened in this environment.
