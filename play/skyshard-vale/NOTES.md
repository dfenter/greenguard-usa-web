# Skyshard Vale
Move: left stick or WASD. Attack: ATTACK or J; Skill: SKILL or K; swap with party chips or 1–3.
Explore meadow, lake, ruin, and peak; defeat shrine guardians to earn Dash, Lift, and Glide.
Wet + Spark = Chain Shock; Frost + Strike = Shatter; Ember + Wet = Steam Heal. Chests persist.
Defeat returns you to your last shrine; defeat the high shard boss to clear the valley.

## AAA rebuild

### Implemented

- Rebuilt the archived prototype as the F12 flagship uplift with a fixed-step Phaser 3 scene, GGKit-only lifecycle, input, save, audio, pause, restart, settings, and PWA registration.
- Added responsive WASD, left-stick, J/K, Space, and 1-3 controls; instant party swaps; dash, lift, and glide gate progression; shrine guardian unlocks; defeat return; persistent generous chest caches; and the high shard boss clear.
- Added readable strike, frost, spark, ember, and wet application states with pooled particles, status marks, combo feedback, Steam Heal recovery, hit-stop, reduced-motion gating, and GGKit audio cues for skill cast, combo, shrine unlock, and boss roar.
- Added Shrine Trials with hand-authored guardian rematches and bronze, silver, and gold checks for time, combo variety, and no-death runs.
- Added a single queued transient channel, corner chips for live events, thin fading coach strip, run-boundary center moments only, thumb-safe controls, safe-area padding, and a compact party rail.
- Added generated original procedural audio, PNG icons, manifest, absolute shared-runtime paths, and a complete service-worker precache.

### Zone table

| Zone | Signature landmark | Hazard mix | Chest caches | Traversal ramp |
|---|---|---|---:|---|
| Meadow | Rootwell | Thorn groves | 2 | Entry route and generous charge teaching space |
| Lake | Driftglass | Shallow water and tidal veil | 2 | Wet application setup for Chain Shock and Steam Heal |
| Ruin | Sunken Archive | Ember vents and broken stone | 2 | Dash gate, heavier sentinels, Lift guardian |
| Peak | Cloudstep and the High Shard | Frost wind and ice | 2 | Lift gate, Glide guardian, final boss gate |

### Shrine table

| Shrine | Guardian | Gift | Unlock chain |
|---|---|---|---|
| Rootwell | Safe return point | Last shrine return | Run start |
| Driftglass | Wet Warden | Dash | Opens the blue gate to Ruin |
| Sunken Archive | Ember Sentinel | Lift | Raises the route into Peak |
| Cloudstep | Frost Keeper | Glide | Crosses the high wind to the High Shard |

### Deferred

- Live browser interaction, screenshot noise audit, and 4x-throttle frame capture could not run in this sandbox because no browser was available and local HTTP server binding was denied. A deterministic smoke suite now covers boot wiring, saved collection, shrine gating, portal progression, input, portrait layout, replay, and audio precache.
- `node --check` passed for every changed JavaScript file. Manifest JSON parsing, service-worker precache existence, icon dimensions, MP3 format, payload size, and scope checks passed separately. HTML, PNG, and MP3 files are not JavaScript inputs for `node --check`.

## Fix round 1

### Fixed

- CRITICAL boot failure: implemented `applyState()` and added a deterministic boot smoke check.
- CRITICAL terrain and collision: replaced the flat backdrop with authored procedural tilemap ground, a collision layer, bounded terrain blocks, transition styling, and y-sorted actors.
- CRITICAL altitude progression: added low, mid, and high altitude tiers plus three interactable, saved traversal runes with readable solution feedback.
- CRITICAL shard and portal progression: added eight persistent skyshards, portal activation requirements and state, summit gating, activation effects, and boss gating.
- MAJOR shard tracker: the HUD now derives its count from the saved shard bitmask and animates the counter to the saved target.
- MAJOR gate geometry: gates now use correctly sized rectangle views and full boundary-spanning collision rectangles that cannot be bypassed at their edges.
- MAJOR gamepad support: added GGKit-routed action processing with stick deadzones, button edge detection, connection and disconnect handling, plus keyboard and touch fallback.
- MAJOR portrait layout: removed the landscape lock and added readable portrait HUD, route map, compass, altitude readout, and touch command sizing.
- MAJOR onboarding and navigation: extended staged coaching to shards, rune interaction, portal requirements, element combos, and a minimal route map with compass objective.
- MAJOR pause and trial timing: banners now consume no gameplay input, queued actions are cleared, and trial clocks exclude the intro and result banners.
- MAJOR shrine checkpoint gating: locked shrines no longer replace the last unlocked checkpoint.
- MAJOR victory replay: added a working `kit.restart()` end-state button that preserves saved progression.
- MAJOR actor animation: added idle, three-frame walk, attack, skill, hurt, and up, down, and side-facing generated poses.
- MAJOR enemy flash: corrected the normal tint path so hit flash clears to the authored enemy color.
- MAJOR traversal and pickup feedback: added eased pickup pops, animated counter tick-up, footstep dust, water motion, and moving leaf details.
- MAJOR audio: added zone crossfades and GGKit cues for footsteps, gates, portal activation, secrets, and area ambience using MP3 assets only.
- MAJOR save validation: bumped the schema and now reject malformed keys, masks, booleans, trial arrays, and unknown combo discoveries before normalization.
- MAJOR y-sorting: actor, shadow, target, status, and health-bar depths now follow world Y.
- MINOR combo hydration: saved combo discoveries are restored on boot and immediately saved when discovered.
- MINOR smoke coverage: added `smoke-test.js` for boot, collection persistence wiring, shrine gating, portal progression, controls, portrait layout, replay, and audio precache.

### Rejected

- None. All listed findings were actionable and addressed within the original payload, file-size, audio, engine, asset, and GGKit constraints.

## Retina pass 2026-08-16

- Measured before ratio: unavailable for this title in this environment. Fleet baseline was 1.00x for 62 titles, with the remainder from 1.10x to 2.46x.
- Measured after ratio: unavailable because no browser backend was exposed. The helper path targets 3.00x at DPR 3, but that is not a captured measurement.
- Recipe: Phaser `Scale.RESIZE`; initial sizing, resize, orientation change, and visibility change all call `GGKit.hiDpi.resize`.
- Factor cap: none; the GGKit DPR cap of 3 applies. No title-specific cap was justified.
- Could not do: DPR 3 backing-store read or gameplay screenshot. Browser discovery returned no browser, and local HTTP port binding was denied.

## Retina pass 2

- Measured ratio after the required delayed DPR-3 sample: unavailable. The corrected configuration targets 3.00x, or 2532/844 for this landscape title.
- Converted the parented game to `GGKit.hiDpi.phaser`, `Phaser.Scale.NONE`, and `cfg.ggDpr`; camera zoom is calculated from the logical scale dimensions and re-centered on the player after bounds/follow setup. Removed source-resolution overrides.
- Could not do: delayed `retina_audit.mjs`, gameplay screenshot, live input/core-mechanic check, or `live_probe.mjs`. The harness could not bind its private port (`listen EPERM`), and no browser surface was available. Node syntax and diff checks passed.

## Retina repair 2

Measured density at deviceScaleFactor 3, sampled ~7s and ~10s after load:
`canvas.width / getBoundingClientRect().width` = **3.000** (2532 / 844). Held on
a third re-sample during the interaction probe.

The 45s navigation timeout and the black frame were TWO separate defects, both
introduced by the retina conversion. Neither is the software-rasteriser
artifact, and `play/_shared/` was not touched.

1. **Black frame — the canvas was painted over, not blank.** Read back off the
   canvas with `drawImage` + `getImageData`, the renderer was producing a full
   frame (5,699 distinct colours, 100% non-black) that nothing could see.
   `index.html` styles the canvas with `#game-shell > canvas { position: fixed;
   inset: 0 }`, but the config parented it to `document.body`, so it was an
   unpositioned in-flow child sitting behind `#game-shell`, which is
   `position: fixed; inset: 0` with an opaque `--ink` background and therefore
   paints over it. Parent is now `#game-shell`. This reproduced identically at
   DPR 1, which is why the GPU box saw it too.

2. **Timeout — a CANVAS-renderer title cannot pay the retina fill cost.** The
   conversion took the game from 844x390 to 2532x1170, 7.4x the pixels, while
   `type` stayed `Phaser.CANVAS`. Canvas2D rasterisation is CPU work whether or
   not a GPU is present, so a GPU box does not rescue it — that is why this
   failed on both boxes and is a real defect rather than the rasteriser
   artifact. Measured: at DPR 1 navigation completed in 7.1s; at DPR 2 and DPR 3
   `networkAlmostIdle` never fired inside 45s with zero requests still in
   flight, i.e. the renderer was too jammed to reach the lifecycle event.
   Switched to `Phaser.AUTO` (WebGL). Navigation is now 3.3s at DPR 2 and 4.0s
   at DPR 3, and the rAF rate went from roughly 8/s to roughly 50/s. Density was
   NOT capped; the full DPR-3 backing store is kept.

3. **Design size was a hard-coded constant.** `scale: { width: 844, height: 390 }`
   is only correct in a 844x390 CSS box, and this title supports portrait. Under
   the Scale.NONE + `zoom = 1/factor` conversion the game is sized in device
   pixels and world coordinates follow, so the design size must be the CSS
   layout box: it now reads `document.documentElement.clientWidth/clientHeight`.
   A deferred `resizeGame()` (ready event, plus resize / orientationchange /
   visibilitychange) keeps it correct, and the scene's existing
   `this.scale.on('resize', ...)` re-derives the camera zoom from
   `this.scale.width / DPR`.

Checked and cleared, not changed: `setBounds(0, 0, WORLD.w, WORLD.h)` (silent
trap #3) is correct here — the camera keeps its default 0.5 origin, and the
clamped scroll of -649.2 puts world x 0..1233 exactly across the viewport with
the player at 33% and vertically centred, which is the world edge, not an
off-screen playfield. No `source.resolution` is set anywhere.

Verified in-harness (`/Users/lucille/ue-port-studio/aaa/harness`), private ports:

- `boot_sweep.mjs`: was FAIL, navigation timeout, colours=0, lit=0%. Now
  **PASS err=0 404=0 colours=2485 (exact8=24667) lit=100%**, in the same run as
  healthy siblings frosthold (137 / 1975) and driftlands (940 / 10385).
- `retina_audit.mjs`: **RET-OK dpr=3 colours=36648 flattest=49.5%**, the richest
  frame in its run (driftlands 22459).
- `live_probe.mjs`: **PASS raf=936 shots=5/5**, no uncaught errors.
- Core mechanic under real input at DPR 3: keyboard traversal moved the player
  from (410, 1470) to (791, 1583); the attack cooldown fired on 5 of 6 J
  presses and an enemy went from 62 HP to 38 HP. Zero console errors, zero
  page errors.
- `node --check play/skyshard-vale/game.js` clean (only file touched).

Not changed: no redesign, no rebalance, no content.

## Release gate repair

2026-08-16, mobile release gate lane.

### PWA installability

The manifest's icon `src` values were ROOT-ABSOLUTE (`/play/skyshard-vale/icon.png`).
That resolves in a browser, but the release gate joins a non-`http` src onto
`<base>/play/<slug>/` after stripping one leading slash, so it fetched
`/play/skyshard-vale/play/skyshard-vale/icon.png` and both icons read as 404. Rewrote the srcs
as plain relative paths, which is what the rest of the fleet uses. No icon files
were changed.

Verified with `node release_gate.mjs http://localhost:8347 1 <slug>` from
/Users/lucille/ue-port-studio/aaa/harness, serially at concurrency 1, against
`python3 -m http.server 8347 --directory /Users/lucille/greenguard-usa-web`.

Gate verdict: **READY** (all checks pass).
