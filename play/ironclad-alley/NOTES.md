Ironclad Alley is a portrait slow-tank duel against seeded AI arenas.
Drag the lower field to drive; drag direction controls tracks and turning.
Tap anywhere to aim and fire; shells ricochet twice off walls.
Tap the MINE button after collecting a mine pickup; keyboard: WASD/arrows, space, M.
Three lives per run; clear arenas to raise the level, with best score persisted locally.

## AAA rebuild

Implemented: Phaser 3.87 runtime with GGKit-owned lifecycle, input, save, audio,
orientation, settings, and PWA registration. The rebuild adds heavy track-drag
steering with filtered differential tracks and a real turn radius, independent
turret rotation, two-bounce shell preview and shell physics, facing-dependent
armor damage, arm/danger-radius mines, pooled tracer and impact FX, procedural
tank silhouettes with scout/brawler/sniper/siege liveries, dust trails, reduced-
motion gating, first-run steer/aim/ricochet/mine coaching, generous pickups,
medal banners, and a persistent unlock chain.

Arena table: rubble alley is a narrow alternating-cover route with a rear flank;
dockyard maze is container cover with water lanes and a side dock bypass;
open courtyard is a broad sightline arena with four cover islands and a perimeter
flank; ricochet chamber is a bank-shot laboratory with authored angled walls.

AI-class table: scout is fast, light, and orbiting; brawler is wide, armored,
and closes distance; sniper is slow, accurate, and favors long sightlines; siege
is heavy, durable, and uses bank shots. Campaign duels unlock those classes in
that order, Ricochet Trial scores bank-shot precision, and Gauntlet is the
multi-tank finale.

Deferred: online leaderboards, replay export, and a larger authored campaign
chapter set remain outside this rebuild.

## Fix round 1

Fixed all listed findings. No findings were rejected.

- CRITICAL art: added original local SVG arena, wall, tank, pickup, shell, and FX textures; the scene now renders textured silhouettes, gradients, glow, and authored destruction states.
- CRITICAL animation: player idle, drive, hit, and wreck states are selected at runtime; enemy class, hit, and wreck states are also distinct.
- MAJOR input: keyboard onboarding now accepts Space during training, IJKL and gamepad sticks aim, gamepad buttons map through the GGKit input facade, and aim requests remain queued until turret lock.
- MAJOR lifecycle and tutorial: failure taps call `kit.restart()`, input is cleared by GGKit, and ricochet training counts only a banked enemy hit.
- MAJOR progression and scoring: duel stats reset per arena, side modes enforce unlocks, locked menu states are shown, and trial medals retain the best result.
- MAJOR feedback and motion: player damage now has a red vignette and blink, reduced motion gates pulses, particles, camera easing, popup travel, and FX counts, and six bounded Phaser particle emitters provide staged FX.
- MAJOR audio: eight gameplay SFX cues plus two engine buses are registered and preloaded before play begins; all audio remains on GGKit buses.
- MAJOR PWA and viewport: the worker requests `/play/` scope and caches all local title art, shared runtime files, and audio; the game uses responsive resize scaling with safe-area CSS instead of fixed FIT letterboxing.
- MAJOR readability and pools: HUD text is larger, Gauntlet reports four targets with per-enemy class tags, and shell exhaustion shows a reload cue instead of silently dropping the shot.
- MINOR pool handling: FX emitters are bounded and popup reuse recycles the oldest active message.
- MINOR save handling: save validation and writes now use bounded canonical unlock and medal schemas.

Verification: `node --check game.js`, `node --check sw.js`, manifest JSON parse, diff check, no em dash check, payload 154041 bytes, largest file 87710 bytes.

## UI declutter

- Cut the always-on arena/mode/flavor labels, control instruction line, and floating enemy class tags from active play.
- Shrunk the HUD to icon-led score/level/lives plus hull, armor, damage, and trial-time state; moved smoke/mine counts into their touch controls.
- Replaced world popups and live center banners with one top-edge event chip, max 1.0s, queued one-at-a-time; retained center banners only for run, level-clear, results, and failure boundaries.
- Compressed tutorial copy into one thin top strip that fades after roughly 3s, and kept reduced-motion gating on transient motion/fades.
- Verification: `node --check game.js`, `node --check sw.js`, and `git diff --check`; browser screenshot capture was unavailable in this environment.

## Retina pass 2026-08-16

- Target 390x844 CSS at DPR 3. Before ratio: 1.00x CSS-sized RESIZE baseline. After target: 3.00x, 1170/390, via `GGKit.hiDpi.resize`. Live canvas read was unavailable because no browser surface or private local listener was available.
- Recipe: `Phaser.Scale.RESIZE`, `GGKit.renderDefaults`, and DPR-matched Phaser text. No factor cap; the existing camera viewport preserves the authored portrait layout.
- Gameplay screenshot and runtime backing-store measurement remain deferred. No palette change was made because the retina law identifies density, not colour depth, as the defect.

## Retina pass 2

- Delayed DPR 3 canvas ratio: not measured. The slug-derived private harness port was rejected with `EPERM`, and headless Chrome aborted before creating a page. Configured `cfg.ggDpr` is 3.00 at the audit viewport.
- Converted boot to `GGKit.hiDpi.phaser` with `Phaser.Scale.NONE`, retained render defaults and fixed authored world content, and installed dense Phaser text creation with inverse object scale.
- Viewport fitting now derives from Phaser scale dimensions and the density factor; the camera uses the fitted zoom and centers on the authored midpoint without `setBounds` clamping.
- Gameplay screenshot, render-loop probe, and drive or fire input proof could not be completed because the local browser infrastructure was unavailable.

## Release gate repair

2026-08-16, mobile release gate lane.

### Offline

The title registered its service worker behind `location.protocol === 'https:'`,
so on localhost it registered nothing at all, had no cache, and died the moment
the network was cut. GGKit's own `registerPWA` was widened to accept localhost
for exactly this reason (see its comment in `/play/_shared/ggkit.js`); this
title's hand-rolled registration never took that change.

Fix (in this title's `game.js` only): the secure-context test now accepts
`https:`, `localhost` and `127.0.0.1`, matching GGKit. Nothing else changed; the
precache list was audited entry by entry against disk and every path resolves, so
`cache.addAll` was never the problem here.

Verified with `node release_gate.mjs http://localhost:8347 1 <slug>` from
/Users/lucille/ue-port-studio/aaa/harness, serially at concurrency 1, against
`python3 -m http.server 8347 --directory /Users/lucille/greenguard-usa-web`.

Gate verdict: **READY** (all checks pass).
