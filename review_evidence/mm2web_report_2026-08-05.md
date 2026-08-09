# MM2WEB — playable Marble Mania 2 for new.greenguard-usa.com

Lane: MM2WEB. Date: 2026-08-05. Status: **built + verified, staged, NOT deployed, NOT committed.**

## 1. What was built

A self-contained playable MM2 web game at the repo root of `/Users/lucille/greenguard-usa-web/`.

**Files created (complete list):**

| Path | Size | Notes |
|---|---|---|
| `marble2.html` | 65 KB | the whole game: UI, ported physics, renderer |
| `marble2-manifest.json` | 1.3 KB | PWA manifest, `start_url`/`scope` `/marble2` |
| `marble2-sw.js` | 2.8 KB | service worker, whitelist-scoped like `marble-sw.js` |
| `marble2-assets/levels_classic.json` | 142 KB | copied from `marble-mania-2/export/` |
| `marble2-assets/levels_extended.json` | 476 KB | copied from `marble-mania-2/export/` |
| `marble2-assets/skies/*.jpg` (14 files) | 1.2 MB | copied from `marble-mania-2/preview/skies/` unchanged |
| `marble2-assets/tex/*.jpg` (5 files) | 708 KB | from `preview/tex/`, downscaled 1024 to 512 (2.6 MB to 708 KB) |

Total staged weight 2.5 MB, all served statically.

**File modified:** `_scripts/build_vercel.py` — two small changes so the site build ships the game:
1. a `copytree` block for `marble2-assets/` (mirrors the existing `zelda/` and `tactics3d/` blocks);
2. `marble2.html`, `marble2-assets`, `marble2-sw.js`, `marble2-manifest.json` added to the redesign-overlay `PROTECTED` set, so the Astro overlay can never shadow the game (same treatment `marble.html` already has).

**Game content:** both campaigns, 18 courses each, loaded from data.
Title screen, campaign select, 18-course grid with lock state / best time / medal colour,
per-course play with a par countdown, results screen (time, falls, medal, new-best flag,
NEXT COURSE / RETRY / COURSES), pause (button, Esc, or backgrounding the tab).

**Physics:** `marble-mania-2/tools/sim.js` ported verbatim into the page — same constants,
same substep ordering, same sphere-vs-OBB resolution, same spring/cannon/enemy/checkpoint/
switchpad/key predicates, fixed 1/120 s step with an accumulator. The only additions are an
`ev` event list (so the page can flash and toast) and a normalisation step: `export.js` writes
the switchpad array as `switches` while `sim.js` reads `level.switchpads`, so a raw JSON level
fed to the unmodified sim would never latch a switch and every switch gate would stay shut.
`normalizeLevel()` maps it and defaults every optional array.

**Rendering:** the environment and course code from `preview/index.html` (photo sky shader,
gradient dome, backdrops, ground disc, aurora bands, stars, flattened surface textures with
world-scale box UVs, dark-theme readability tint and ambient boost). Camera is the MM1 follow
camera driven straight from `sim.camPos`.

**Progress:** `localStorage` key `mm2web_save_v1`, per campaign `{unlocked, best[18], medals[18]}`.
Every read goes through `sanitize()`; bad JSON, a foreign shape, or a private-mode write failure
all degrade to a fresh save and a working page.

## 2. MM1 conventions mirrored (from `marble.html`)

- **Three.js from the same CDN importmap** (`unpkg.com/three@0.160.0`). MM1 already does this, so
  per spec point 5 the approach is mirrored exactly. No other external dependency.
- **Mobile controls, same three paths**: on-screen analog stick (140px, 44px minimum targets),
  drag-anywhere layer with the load-bearing `touch-action:none`, and opt-in gyro with the same
  beta/gamma-by-screen-angle mapping, 22 degree range, 2 degree deadzone, recenter, and the iOS
  `requestPermission` gate. Priority order stick > gyro > drag, exactly as MM1.
- **Same viewport/PWA head block**, safe-area CSS variables, `visualViewport` resize handling,
  `orientationchange` re-resize, touch render path (no MSAA, DPR cap 1.5, coarse-pointer detect).
- **Same HUD/overlay/toast/flash structure**, pause on `visibilitychange`, R to respawn.
- **Same service-worker shape**: root-scoped but inert outside a whitelist, network-first for
  navigations, cache-first for assets, versioned cache name.
- `/marble` was not touched.

## 3. Screenshots (what I saw in each)

All under `/Users/lucille/ue-port-studio/inbox/`, captured headless with Playwright Chromium
(SwiftShader). Viewports were pinned and then **verified by measuring `document.documentElement.offsetWidth`**
per the studio law: desktop reported 1280, mobile reported 390.

Desktop 1280x800:
- `mm2web_desktop_01_title.png` — MARBLE MANIA 2 in violet with the EXTENDED EDITION tagline, intro copy, PLAY button, keyboard and phone control hints. Clean, nothing clipped.
- `mm2web_desktop_02_campaign.png` — two cards, CLASSIC and EXTENDED, each with its blurb and "0 / 18 cleared - course 1 unlocked", plus BACK.
- `mm2web_desktop_02b_levels.png` — CLASSIC course grid, 6 columns x 3 rows, 01 Practice unlocked and 02-18 greyed LOCKED, CAMPAIGNS and PLAY COURSE 01 buttons.
- `mm2web_desktop_03_classic_L01.png` — Practice mid-play: blue track with dark rails turning left, the goal ring and its green beam, the bright marble on the track, grass-lit dawn-meadow backdrop, HUD reading CLASSIC 1/18 Practice / TIME 26 / FALLS 0.
- `mm2web_desktop_04_extended_L01.png` — extended Practice: the wider multi-lane maze section with directional floor arrows, marble bright at frame centre on a junction tile, TIME 147.
- `mm2web_desktop_05_extended_L13.png` — Mixdown at 13.5 s: green start pad with its ring, blue track, a purple chute with rails, a yellow spring plate, and further course sections receding into the Aurora Tundra night. Marble clearly visible, FALLS 5 (the test bot's falls, not the game's).
- `mm2web_desktop_06_results.png` — COURSE CLEAR / 01 Practice / Time 0:04.4 / Falls 0 / GOLD MEDAL / NEW BEST TIME / par and medal thresholds / NEXT COURSE, RETRY, COURSES.
- `mm2web_desktop_07_corrupt_recover.png` — the title screen after localStorage was deliberately set to `{not json at all`: normal page, fresh save.

Mobile 390x844 (DPR 2, touch emulation):
- `mm2web_mobile_01_title.png` — title, tagline, copy and PLAY all fit the 390px column with no horizontal scroll.
- `mm2web_mobile_02_campaign.png` — the two campaign cards stacked full width.
- `mm2web_mobile_02b_levels.png` — the course grid reflows to 4 columns x 5 rows, buttons still 56px tall.
- `mm2web_mobile_03_classic_L01.png` — Practice mid-play with the analog stick bottom-left, Gyro / Respawn pills bottom-right, pause top-right, and the HUD reading CLASSIC 1/18 - TIME 28 - FALLS 0 with no truncation.
- `mm2web_mobile_04_extended_L01.png` — extended Practice mid-play, marble bright on the track, all touch controls in place.
- `mm2web_mobile_05_extended_L13.png` — Mixdown at 14.2 s, green start pad and blue platform against the night sky, marble bright, HUD EXTENDED 13/18 - TIME 341 - FALLS 5.
- `mm2web_mobile_06_results.png` — COURSE CLEAR with the button row wrapping to two lines, nothing clipped.
- `mm2web_mobile_07_corrupt_recover.png` — title screen recovered from a corrupt save at 390px.

Machine gates asserted on every mid-play capture: `state === 'play'`, more than 5 meshes in the
scene, lit-pixel fraction above the floor, more than 700 distinct colours, and a bright marble in
the centre box (the capture retries for up to 8 s if the follow camera has a platform in front of
the marble). Full numbers in `mm2web_verification_log_2026-08-05.txt`.

## 4. Gameplay actually driven, not faked

Each mid-play capture ran a real waypoint autopilot: it reads `level.waypoints`, converts the
world-space direction to the sim's camera-relative `(ix, iz)` frame, and feeds it through the same
input path a player uses. The results screen came from the bot **completing Classic 01 for real**
(goal predicate, gold medal, save written). No teleporting, no forced state.

## 5. Console / error scan

**Zero console errors and zero page errors** across both viewports, covering boot, campaign load,
three course loads, a completed run, two reloads and the corrupt-save recovery. Console `warning`
was also collected; none fired.

## 6. Save / reload proof

- Bot cleared Classic 01, results screen wrote `best[0] = 4.38 s` (desktop) / `5.70 s` (mobile), medal gold, `unlocked` advanced.
- `extended.unlocked` set to 7, page reloaded.
- After reload the persisted blob still showed `classic.best[0] = 4.38 s` and `extended.unlocked = 7`, and the in-memory state matched the stored blob.
- Corrupt-data path: `mm2web_save_v1` set to `{not json at all`, reload, page boots normally to a fresh save (`unlocked = 1`) with the title screen rendering.

## 7. Fixes made (both were readability blockers, no gameplay redesign)

1. **Marble material.** A fully metallic marble with no environment map rendered as a dark grey ball, which on the night themes made the player's own avatar the hardest thing on screen to find. Now matches `preview/index.html`'s marble (metalness 0.35, roughness 0.15) with a standing emissive. Screenshots before and after are night and day.
2. **HUD at 390px.** The three HUD boxes plus the pause button truncated to "Prac..." / "TIME 1..." / "FALL...". Under 560px the course name drops out of the HUD and the boxes tighten. Nothing truncates now.

## 8. Known gaps / things for Fable to decide

- **Two root-scoped service workers.** `marble-sw.js` and `marble2-sw.js` both register at scope `/`, and a browser keeps one active worker per scope, so visiting `/marble2` replaces MM1's registration and vice versa. Each worker is inert outside its own whitelist, so the site and both games work either way; only offline caching flips to whichever game was opened last. Fixing it properly means a single shared worker, which would mean touching `/marble`. Flagged rather than done.
- **Timed gates do not collide.** `tools/sim.js`'s `_activeColliders()` includes boxes, gates, doors and movers but not `timedgates`, so in the verified sim a timed gate never blocks the marble. I mirrored that exactly rather than inventing collision the bot gate never saw, and draw them as translucent energy curtains that visibly thicken when closed, so they never read as a solid wall you would expect to stop you. If UE treats them as solid, sim and web both need the same fix upstream.
- **Night themes are genuinely dark.** Extended 13 (Aurora Tundra) renders a near-black sky. I confirmed against `preview/index.html?level=13` served from the marble-mania-2 repo: the same pixels, so this is the authored environment, not a porting bug. The course itself reads clearly.
- **Movers are unused.** No level in either pack contains a mover; the mover code is ported and live but has never executed against real data.
- **The site build has not been run.** `build_vercel.py` compiles clean and the copy block mirrors the existing game blocks, but I did not run the build (it rewrites the shared `out/` directory) and I did not deploy or commit. Verification was against a local static server at the repo root, where the relative asset paths resolve identically to the `/marble2` clean URL.
- **No `/marble` cross-link** was added, per the directive.

## 9. Verification harness

`verify_mm2web.py` (Playwright, screenshots, autopilot, console scan, save/reload, corrupt-save)
lives in this session's scratchpad. Say the word if it should be checked in alongside the game.
