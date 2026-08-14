# Steamline

LOOP: colour-coded trains enter at the green depot on a timetable (top strip). Tap a junction to flip its switch and send each train down the siding whose station matches its colour. Delivering before the train's patience bar empties scores full points and builds a combo; late scores less; reaching the red terminus undelivered scores nothing. A new station and junction appear every 2 deliveries (up to 6) and the spawn rate keeps climbing.
FAIL: any train-to-train collision ends the run. Best score is saved in localStorage. Tap the overlay or press Enter/R to restart instantly.
TOUCH: tap a junction = flip switch; tap a train = hold/release it at the next signal; drag = pan; pinch or double-tap = zoom.
KEYS: 1-6 flip switch N; Tab select train, Space hold/release; WASD/arrows pan; Q/E or -/+ zoom; 0 or F refit; R restart. Gamepad is not a supported input surface.

## AAA rebuild

### Implemented

- Rebuilt the prototype as a Phaser 3 landscape title using `/play/_shared/phaser.min.js` and GGKit as the only lifecycle, input, save, and audio authority.
- Added fixed 60 Hz stepped simulation with a two-step frame cap that slows instead of time-skipping on a degraded device. Trains, smoke, particles, tokens, and train views use bounded pools.
- Added readable junction state: cyan route highlight, animated point throw, station platform color plus shape marks, selected-train bracket, hold or release signal button, signal stop feedback, steam trails, and visible patience bars.
- Added authored 16px-grid yard, train, and station SVG sheets with three train states, three station states, nearest-neighbor rendering, shape and letter marks, rail sparks, delivery bursts, token sparkles, and impact FX pools.
- Added stable train selection, queue backpressure, swept branch collision checks, wrong-platform miss tracking, safe target completion, guided first delivery, camera bounds and refit, double-tap zoom, and delta-scaled camera controls.
- Added near-miss scoring at a forgiving separation band, collision fail at confirmed overlap, generous patience tokens, cargo liveries with longer patience, and a camera that recenters an at-risk train when it nears the viewport edge.
- Added shift flow, medal persistence, unlock chain, selectable layouts, thin coach strip, reduced-motion gating, 60%-width overshoot banners, platform crowd idle motion, and GGKit buses for route music, steam chug, whistle, station bell, and crowd murmur.
- Added `manifest.json`, `icon.png`, `icon512.png`, `favicon.png`, MP3-only local audio, `sw.js` authored from the shared template, and per-file provenance in `LICENSES.md`.
- Added the boot-safe and live `window.__sl` probe with `state`, `forceShift`, and `forceLayout`.

### Authored layouts

| Layout | Flow identity | Signature centerpiece | Discoverable siding | Junctions |
|---|---|---|---|---:|
| Civic Loop | Compact civic loop around a central yard | Turntable | Garden siding | 12 |
| Alpine Switchback | Long zig-zag climb through mountain cuts | Tunnel portal | Miner cut | 12 |
| Tidewater Yard | Flat coastal freight and dock lanes | Drawbridge | Breakwater siding | 12 |
| Lantern Terminal | Night grid through a terminal block | Lantern grid hub | Service alley | 12 |

### Shifts

| Shift | Pace and identity | Start junctions | Delivery target | Cargo rate | Unlock |
|---|---|---:|---:|---:|---|
| Morning Rush | Light traffic and tutorial pace | 2 | 8 | 12% | Peak Hour, Alpine Switchback |
| Peak Hour | Dense multi-color traffic | 3 | 12 | 22% | Night Freight, Tidewater Yard |
| Night Freight | Longer patience and bonus cargo | 3 | 14 | 48% | Full Network Finale, Lantern Terminal |
| Full Network Finale | All yards and master timetable | 4 | 18 | 58% | Final shift |

Medals award one tier for deliveries, one for combo streak, and one for zero misses. Every second delivery opens another authored junction until the full network is live.

### Deferred

- Live browser boot, tap, and feel capture could not run because the in-app browser was unavailable and the sandbox refused a local HTTP server bind. `node --check`, manifest parsing, rail geometry construction, precache existence, asset format, and payload checks did run.
- No deploy, network fetch, or performance-gate capture was attempted by scope. Re-run the 4x throttle feel gate and offline PWA gate on an HTTPS host with an available browser.

## Fix round 1

### Fixed

- CRITICAL art gate: added original 16px-grid yard, train, and station sheets, three train states, three station states, tiled ground, and nearest-neighbor rendering.
- MAJOR selection and hold state: spawns preserve selection and the signal button always mirrors the selected train.
- MAJOR pool exhaustion: the queue is peeked before allocation, with depot backpressure feedback.
- MAJOR signal rewind: a late hold stops at the current position without moving a train backward.
- MAJOR collisions: swept train movement and all-branch distance checks cover shared junctions, and the hit radius now covers the authored train sprite.
- MAJOR delivery accounting: wrong-platform deliveries increment misses and cannot earn a false zero-miss medal.
- MAJOR completion safety: target reached freezes active traffic before the clear countdown and skips further collision checks.
- MAJOR onboarding: Morning Rush now guides the first siding choice, confirms the first delivery, and teaches hold and release.
- MAJOR mobile UX: narrow selection screens use a responsive two-column scroll layout, and the bottom hint no longer overlaps controls.
- MAJOR camera and controls: camera targets are clamped to yard bounds, `0` and `F` refit, `R` restarts, and result-overlay taps or Enter redeploy.
- MAJOR juice: GGKit shake offsets are applied to the camera, impact FX continue through the hit-stop window, and cosmetic FX update in result mode.
- MAJOR audio: added original danger music plus danger, miss, pickup, UI select, and switch-throw MP3 cues, all routed through GGKit.
- MAJOR FX: added bounded rail-spark, delivery, token, and impact systems alongside the existing burst and smoke systems.
- MAJOR readability: trains now carry persistent shape and letter marks in addition to livery color.
- MAJOR layout identity: authored layouts now have distinct station color orders and routing rules for climb speed, drawbridge dwell, and lantern patience.
- MAJOR false shortcut claim: changed the misleading user-facing label to `SIGNATURE SIDING` while retaining the authored feature siding.
- MAJOR touch zoom: implemented double-tap zoom through the existing GGKit pointer identity path.
- MINOR save validation: bounded and deduplicated unlock arrays and restricted medals to known shift-layout keys.
- MINOR timing: keyboard pan and zoom are now delta-scaled; locked stations are hidden until activated.

### Rejected or clarified

- MAJOR gamepad input: gamepad was not in the supported-controls contract, so NOTES.md now explicitly marks it unsupported rather than adding a second input authority outside GGKit.
- MINOR banner timing: the existing banner timer already consumed `dt`; no code change was needed.

### Verification

- `node --check` passed for `game.js`, `rail.js`, and `sw.js`.
- Manifest parsing, all service-worker asset references, four-layout geometry construction, MP3-only audio inventory, payload size, and per-file size checks passed.
- Payload is approximately 0.18MB. Largest file is `game.js` at approximately 77KB.
- No deploy, commit, or live browser/performance capture was performed.

## UI declutter

- Cut the always-on route hint, signature-siding label, shift/layout HUD prose, flavor coach copy, and redundant train letters; kept the gameplay-readable shapes, patience meters, route glow, controls, and result details.
- Shrunk the live HUD to score/combo plus a shape-coded next-train timer and delivery/token progress; moved unlock/outcome messaging into the results screen.
- Replaced the 60%-width center banner with one queued top-edge chip: tutorial copy is one line with reduced-motion-aware fading, event chips hold for 1.0s max, and only one transient can show at once.
- Reclaimed the old coach/hint camera padding so the active yard gets more of the screen.
- The live screenshot check could not run because no browser backend was connected; static audit and syntax checks passed.
