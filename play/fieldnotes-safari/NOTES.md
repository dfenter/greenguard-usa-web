Tap a path to walk, tap a rustle to capture, or open FIELD NOTES; arrows and space also work.
Flick from the copper bead toward the pale lead mark when the timing ring nears the target.
The step budget refreshes at morning/evening windows; PRACTICE WALK is always open.
Weather and habitat affect spawns; the dex posts conditions and odds and saves best sizes locally.
Naturalist medal arrives when all 60 original creatures are recorded.

## AAA rebuild

### implemented

- Rebuilt the archived canvas prototype as a portrait Phaser 3 title with GGKit as the sole lifecycle, input, save, audio, PWA, pause, and juice owner.
- Added simulated expedition routes, top-down movement, six authored habitats, day/dusk/night phases, weather-driven spawn rules, deterministic stalking noise and speed, telegraphed flee, ring timing, surfaced odds, bait and lure modifiers, Photo Challenge, field journal, research tasks, and offline stamina refill.
- Added 44px touch controls, safe-area-aware portrait shell, reduced-motion juice gating, two pooled particle systems, generated procedural silhouettes and foliage motion, two music stems, 14 MP3 SFX, manifest, icons, favicon, and exact service-worker precache.
- Added `window.__fs.state` with mode, stage, progress, score, health, spook, odds, modifiers, creature, phase, weather, plus live `forceMode` and `forceStage` switches.

### content tables

- 60 original creatures across River Delta, Cloud Forest, Dune Sea, Moss Hollows, Ember Steppe, and Crater Basin, with rarity, weather, silhouette, note, and three-form evolution metadata.
- 20 authored research tasks covering photograph 3, catch 5, and observe at night goals. Progress unlocks evolved forms, habitats, and longer routes.
- Four escalating routes: Pocket Trail, Long Loop, Ridge Crossing, and Crater Descent.

### deferred

- Real-browser first-frame and hook-driven smoke test could not run because browser discovery returned no available targets and sandboxed local port binding was denied. Static syntax, manifest, precache, payload, content-count, and stubbed Phaser/GGKit boot plus stalking/catch resolution checks passed.

## Retina pass 2026-08-16

- Ratio record: before 1.00x from the pre-pass design-size backing configuration; after 3.00x is the configured DPR3 result from `round(design * GGKit.hiDpi.factor(...))`. A live canvas ratio read was unavailable.
- Recipe: Phaser `Scale.FIT`, design world coordinates retained, `RETINA_FACTOR` applied to scale dimensions and the Safari scene camera zoom. Generated chrome textures use dense Graphics backing and logical display sizes, while every Phaser text object uses the same resolution.
- Factor cap: none. The GGKit factor is used without a cap because this title has no measured need for one.
- Could not do: the browser connector reported no available target, so the required DPR3 canvas ratio read and real gameplay screenshot could not be captured. `node --check` and `git diff --check` pass.


## Blank frame repair

Symptom: at CSS 390x844 / deviceScaleFactor 3 the title booted clean, the render loop
advanced, the backing store measured 3x, and the frame was blank.

### Root cause

The retina conversion raised the backing store to design x factor and applied
`cameras.main.setZoom(factor)`. A zoomed Phaser camera transforms about its ORIGIN,
which defaults to the centre of the viewport, so with scroll 0 a design-space point x
lands at `zoom*x - (width/2)*(zoom-1)` and the whole design box sits off the top-left
of the viewport. The loop runs, the scene draws, nothing is on screen, no error anywhere.

The fleet pairing `setZoom(f)` + `centerOn(DESIGN_W/2, DESIGN_H/2)` was applied to this
title and it stayed blank, because centring only holds until something writes the scroll
itself. THIS TITLE WRITES AN ABSOLUTE SCROLL EVERY SINGLE FRAME:

`this.cameras.main.setScroll(juice.dx, juice.dy);` in `SafariScene.update`.

That is the corridor-crawl defect: `centerOn` parks the scroll at
`design/2 - viewport/2`, and the very next `update()` overwrites it with a value near
zero, which puts the design box straight back off screen. Nothing in the title looks
wrong, and the shake it is doing is correct in intent.

Repair: the `centerOn` was replaced with `cameras.main.setOrigin(0, 0)`. On an
origin-(0,0) camera, zoom maps design coordinates 1:1 from scroll 0, so the per-frame
shake offsets are ALREADY the right values and needed no change. Nothing else was
touched: the shake magnitudes, the simulation step, and the art are exactly as authored.

PWA: this title's manifest/icon situation is owned by a separate fleet lane and was
deliberately not touched here. As measured in the run below, the PWA check passed on the
same run that the art check passed, so nothing was outstanding at the time of writing.

### Measured, by me, on a real gameplay frame

Release gate run serially (concurrency 1) against a local static server:
`node release_gate.mjs http://localhost:<port> 1 fieldnotes-safari`, headless Chrome,
390x844 at deviceScaleFactor 3, best of four post-interaction frames. The "before" row
is a real measurement of this title in its `setZoom` + `centerOn` state, taken by
reverting the repair, gating it, and restoring the repair - not an assumption.

| | distinct colours (8-bit) | flattest colour share | backing/CSS ratio | gate |
|---|---|---|---|---|
| setZoom + centerOn | 487 | 99.5% | 3x | HOLD (art) |
| setZoom + setOrigin(0,0) | 4538 | 59.5% | 3x | READY (all checks pass) |

`node --check` clean on every file touched. No gameplay, balance, content or art
direction was changed.

## Release gate repair

2026-08-16, mobile release gate lane.

### PWA installability

The manifest's icon `src` values were ROOT-ABSOLUTE (`/play/fieldnotes-safari/icon.png`).
That resolves in a browser, but the release gate joins a non-`http` src onto
`<base>/play/<slug>/` after stripping one leading slash, so it fetched
`/play/fieldnotes-safari/play/fieldnotes-safari/icon.png` and both icons read as 404. Rewrote the srcs
as plain relative paths, which is what the rest of the fleet uses. No icon files
were changed.

Verified with `node release_gate.mjs http://localhost:8347 1 <slug>` from
/Users/lucille/ue-port-studio/aaa/harness, serially at concurrency 1, against
`python3 -m http.server 8347 --directory /Users/lucille/greenguard-usa-web`.

Gate verdict: **READY** (all checks pass).
