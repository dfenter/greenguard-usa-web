# Ridge Glider
Controls: drag anywhere vertically - up = flare (slow, climb, min sink), down = dive (speed, penetration). Desktop: Up/W and Down/S; Space/Enter to relaunch.
Loop: soar a seeded ridgeline downwind. Slow up in thermals (shimmering columns with circling birds) and in the blue lift band above windward slopes; dive through sink.
Scoring: 1 point per metre of distance, plus a landing-zone bonus for a gentle touchdown inside a marked LZ. Best score persists through the GGKit save profile.
Fail: hitting terrain fast, or stalling into the hill. Tap/Space relaunches instantly into a fresh seed.

## AAA rebuild

Implemented:

- Rebuilt the title as a fixed-step Three.js flight scene using the `three` import map and GGKit for lifecycle, per-pointer input, validated saves, PWA registration, settings/audio buses, pause, and restart.
- Added analog flare and dive handling, thermal shimmer columns with circling bird cues, ridge-lift bands, stall warning behavior, approach cone, gentle-touchdown judging, pooled flags, shortcut corridors, milestone banners, LZ bonus banners, new-best banners, reduced-motion gating, layered clouds, fog, and an authored glider silhouette with four canopy variants.
- Added `window.__rg = { state }` boot fallback and live state with `mode`, `distance`, `altitude`, `ridge`, `seed`, `forceRidge`, and `forceThermal` switches.
- Added local procedural MP3 cues for wind, canopy flutter, thermal chime, and landing thud. No cross-title asset path is referenced.

Ridge table:

| Ridge | Identity | Landmark | Shortcut |
|---|---|---|---|
| Coastal Cliff Line | Saltwind / Arch | Sea Arch | Arch Air Corridor |
| Alpine Spine | Icefall / Glacier | Blue Glacier | Glacier High Line |
| Desert Mesa Chain | Redrock / Switchback | Twin Mesa Gate | Mesa Slot |
| Sunset Valley Run | Goldwater / Falls | Sunset Falls | Falls Valley Cut |

Mode table:

| Mode | Ridge | Medal focus | Unlock |
|---|---|---|---|
| Distance Run | Coastal Cliff Line | Distance score attack | Available |
| Thermal Chain | Alpine Spine | Consecutive thermal catches | Distance bronze |
| LZ Precision | Desert Mesa Chain | Bullseye touchdown accuracy | Thermal bronze |
| Cross-Country Finale | Sunset Valley Run, then rotating ridge | Long distance with escalating gusts | Bronze in all three routes |

Deferred:

- In-app browser smoke test could not run because no browser connection was available and the sandbox blocked local HTTP server binding. Node syntax checks, direct world-module probes, precache existence checks, MP3 format checks, and payload checks passed.

## Fix round 1

Fixed:

- CRITICAL pause resume and moving sky coverage.
- MAJOR thermal-chain reachability, achievable medal thresholds, gentle target-LZ medals, target-specific LZ validation, visible LZ strips on every route, staged onboarding with a safe first lift, moving ridge-kite hazards, gradient sky and blob shadow, glider trim, flare, dive, and stall states, air, dust, and spark FX, impact hit-stop and shake, arc speed HUD and 3-2-1 launch countdown, menu and collision audio cues, GPU geometry cleanup on rebuild, gamepad vertical-stick input, reachable GGKit settings, measured menu hitboxes, and compact 390px telemetry.
- MINOR score-key validation, run-count clamping, music cancellation on exit, canopy cycling outside flight, locked-card labels, route-specific LZ wording, and populated route chips.

Rejected findings:

- None. The findings were actionable in this implementation.

## UI declutter

- Cut the live mode rail, ridge/mode watermark labels, bottom input pill, and text stall warning; stall state now reads through the glider ribbon and coral speed arc.
- Replaced the center banner with one small queued corner toast (1.0s hold) for thermal, shortcut, and collision events; score-flag and distance-milestone notices remain in the flight report.
- Compacted the HUD to icon/value distance and altitude, the speed meter, and an LZ chip; moved coaching to one-line top strip that fades after roughly 3 seconds. The centered countdown remains only at the launch boundary.
