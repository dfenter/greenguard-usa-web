# Shellshock Pinball
Controls (touch): drag DOWN in the right plunger lane to set launch power, release to fire; tap/hold the LEFT or RIGHT half of the screen for that flipper (multi-touch); quick swipe = nudge (4 nudges in 2.6s = TILT, flippers die for that ball).
Controls (keys): Shift/A/Z + Shift/D//  = flippers, hold Space/Enter to charge the plunger and release to launch, Q/E/W = nudge, N = new table, M = mute.
Loop: each seed generates a table (pop bumpers, 2 drop-target banks, a spinner lane, a ramp overpass, a mode hole, an outlane kickback). Clear a full drop bank to light the mode hole; shoot the hole to start a 60s mission for jackpots, then repeat at a higher multiplier.
Fail/win: 3 balls, then GAME OVER - PLAY THIS TABLE replays the same seed, NEW TABLE reseeds; best score is saved by GGKit.

## AAA rebuild

Implemented:

- Rebuilt the prototype in Phaser 3 with GGKit as the only lifecycle, input, save, audio, settings and PWA shell. The fixed 120 Hz sim keeps touch time deterministic, supports independent multi-touch left and right flippers plus a drag-to-charge plunger, and uses a four-nudge-in-2.6-second tilt lockout with a visible warning ramp.
- Seeded table generation, same-seed replay, reseeding, three-ball games, per-seed best scores, pooled balls, particles, rings and score popups. Drop banks reset after a clear, and a clear unmistakably lights the animated MODE HOLE.
- Mission jackpot loop with six mission definitions, 60-second timers, escalating x1 to x4 multiplier medals, mission-start/jackpot/game-over banners, generous bonus lamps and multiball triggers from bumper streaks, bonus banks and authored lock banks.
- First-run interactive flip/plunge/nudge coach in a thin upper strip, reduced-motion gating, board shake and hit-stop on jackpot and multiball, procedural authored ball/flipper/bumper/target art, and GGKit-routed MP3 audio buses.
- High-score skin unlock chain: Ion Blue, Ember Circuit, Violet Vector, Mint Armature and Prism Overdrive. Added manifest, icons, favicon, viewport-fit portrait shell, full service-worker precache, and the `window.__ss` state/forceMode/forceSeed probe.

Table/mission tables:

- Bumper Cathedral: classic four-bumper field, two banks, center spinner, cathedral ramp and bonus cascade.
- Overpass Speedway: long ramp geometry, apex spinner, brake/apex banks and overpass race signature.
- Spinner Gauntlet: three spinner lanes, split banks, gauntlet chute and spinner storm signature.
- Citadel of Echoes: boss mission table, citadel and wing banks, lock bank, wizard ring and citadel wizard signature.
- Missions: BOUNCE 10 BUMPERS, RUN 3 OVERPASSES, SPIN 16 TICKS, DROP 5 TARGETS, CLEAR A TARGET BANK, LIGHT 4 BONUS LAMPS.

Deferred:

- A real Phaser browser boot, touch probe and 4x throttle frame capture could not run because no browser surface was available in this environment. Node syntax checks, service-worker precache audit, all-four-archetype generation smoke tests and collision smoke tests passed.
- The CC0 pack files named by LEDGER.md were not present under play/_assets/, so the shipped flipper, bumper, target, launch, jackpot, multiball, UI and music MP3s are original procedural renders routed through GGKit rather than copied pack cuts.

## UI declutter

- Cut floating score popups, persistent table/seed/objective/hint labels, hole/plunger/kickback labels, and in-play center banners.
- Shrunk active HUD to score, ball/multiplier icons, a nudge meter, and a mission progress bar; moved messaging that matters to run-boundary banners and the results panel.
- Replaced in-play event banners with one queued top-edge chip (14px, max 1.0s) and reduced the coach to one thin single-line strip that fades after about 3s, keeping reduced-motion gating intact.
- The in-app browser had no available surface for the requested 390×844 active-play screenshot check; JavaScript syntax checks passed.

## Retina pass 2026-08-16

- Before ratio: 1.10x static FIT baseline at the 390 CSS pixel portrait width, from the 430x900 design backing store. A live pre-pass canvas readback was unavailable in this sandbox.
- After ratio: 3.00x target by factor math at emulated DPR 3. The 430x900 design uses `GGKit.hiDpi.factor(430, 900)` and produces a 1170x2449 backing store for the 390 CSS pixel viewport.
- Recipe: Phaser `Scale.FIT`, design coordinates preserved, scale dimensions multiplied by the factor, shared `GGKit.renderDefaults` merged, and zoom applied in boot, title, and play scene `create()` methods. Text uses the same factor.
- Factor cap: none beyond GGKit's default clamp to [1, 3].
- Could not do: live `canvas.width / getBoundingClientRect().width` readback, gameplay screenshot, and `retina_audit.mjs` acceptance because no browser surface was available and private port binding was denied.
