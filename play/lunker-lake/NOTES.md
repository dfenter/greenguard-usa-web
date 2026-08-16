# Lunker Lake

Player controls: hold and flick upward to cast. Drag while the lure is in the water to work it. Slow drag, pulse taps, and fast twitches attract different fish. Tap on STRIKE to set the hook. Hold to reel and release to give line when tension enters the red. Keyboard fallback: hold Space or Enter to aim and release to cast; arrows or W/S aim; Space pulses, sets the hook, and reels; L opens the trophy log, N opens the lake map, M mutes, and Escape pauses.

## Preserved prototype behaviors

- Flick cast arc with power and angle, including wind drift.
- Three depth bands with fish moving through shallow, middle, and deep habitat.
- Slow drag, fast twitch, and tap pulse lure actions.
- Strike window, set-hook timing, reel-tension fight, slack risk, and line-break risk.
- Seeded lake stocking and trophy weights, with a persistent best record.
- Trophy log and next-lake flow expanded into a sequential five-lake expedition.

## Audio inventory

- `dawn_loop.mp3`: looping calm exploration track.
- `expedition_loop.mp3`: looping adventure track for night and late-lake expeditions.
- Ten MP3 SFX routed through GGKit: cast, splash, twitch, hook, reel, snap, land, UI, bubble, and break.

## Content inventory

- Five stocked lakes, each with distinct sky, water, weather, wind, habitat stock, and time-of-day palette.
- Twenty original fish species across Common, Uncommon, Rare, Epic, and Legendary tiers.
- Twenty expedition stages represented by four trophy targets per lake, with a difficulty ramp from Cedar Mirror to Aurora Sink.
- Tackle economy with three rods and four lures unlocked by catch milestones and purchased with coins.
- Interactive first-catch training, lake map, trophy records, tackle box, settings, pause, restart, and PWA shell.

## Known limitations

- Music is intentionally lazy-loaded after the first gesture to satisfy mobile autoplay policy and payload constraints.
- Fish use a curated set of CC0 silhouettes with authored species-specific pattern overlays and swim treatment; a bespoke atlas for every species remains outside this round's traceable asset scope.
- The deployed-URL performance and device gate remain orchestrator responsibilities.

## Fix round 1

### implemented

- Code 1 and QA CONTENT: assigned lake unlock thresholds `0, 3, 6, 10, 15`, validated progression against unique trophy species, and made all five lakes reachable.
- Code 2-3 and QA FEEL: pause/background now clears local pointer, keyboard, drag, reel, and rod controls before freezing simulation time, fish, FX, and timers.
- Code 4-5 and QA UX: navigation is limited to safe aim/result states, pause restores the authoritative state, and every screen object is rebuilt under the dedicated UI container.
- Code 6-7 and QA CONTENT: all generated stock entries are instantiated and the trophy log renders all 20 species.
- Code 8-9: target selection now hard-filters depth, explicit lure action, and light; taps and Space produce the explicit pulse action.
- Code 10 and QA CONTENT: selected rod/lure IDs persist, tackle can be purchased and equipped, coins are spent, rod power/control affect casting and fights, and lure action affects attraction.
- Code 11-12: calibrated fish-specific stamina and pull, rod control, progress loss, slack timing, line-break handling, and explicit fish escape transition.
- Code 13-15: cast power uses timestamped upward velocity, water action uses elapsed input time, preview/runtime share `stepTrajectory`, and multi-touch has separate reel and rod-angle roles.
- Code 16 and QA CONTENT: saves require schema v3, valid ranges, IDs, arrays, trophy/record keys, selected equipment, tutorial fields, and reachable lake state; writes are guarded before GGKit persistence.
- Code 17: records are keyed by lake and species, so the landing label is a true lake record.
- Code 18: the service worker only matches the current title cache; VERSION is bumped to `aaa-fix1-20260806-1`.
- Code 21: message timers use the simulation delta.
- QA AUDIO: removed shipped source-format references and added music and effects volume sliders through GGKit settings.
- QA UX safe area and art pixel treatment: the actual game root receives safe-area insets and Phaser/canvas use pixelated, nearest-neighbor rendering.
- Art CRITICAL water, shore, lighting, FX, fight HUD, teardown, and card surfaces: rebuilt the scene with layered sky/depth/reflection/caustic/shore/foreground treatments, lake-specific light grades, pooled ripples/foam/bubbles/splash droplets, a designed tension display, authored block-built angler poses, patterned species treatments, and gradient/shadow UI panels.
- Art MAJOR motion, impacts, landing, onboarding, HUD, menus, and transitions: added swim secondary motion, spring-like actor strain, impact ripples and shake, trophy spotlight/scale pop/coin reveal/unlock reveal, live tutorial steps and gesture guide, larger mobile controls, equipment actions, and 250 ms fade-through transitions.
- Art MINOR: cosmetic FX use the seeded visual RNG and buttons now have press/release easing plus disabled-state support.

### disputed

- None.

### deferred

- Code 20: automated content-hash versioning is deferred because the title uses the required explicit service-worker VERSION bump policy; the VERSION was bumped for this round.
- QA UX/SHIP and Art evidence: deployed HTTPS gate execution and deterministic showcase recapture are deferred to the orchestrator because this round forbids deploys and changes outside the title directory.
- QA SHIP hygiene asset-ledger ownership updates are deferred because `play/_assets/LEDGER.md` is outside the permitted write scope.
- Art MAJOR shared loading overlay styling and bundled font files are deferred because GGKit and shared runtime files are protected, and adding unledgered font assets would violate the asset-traceability constraint. Settings audio controls are title-wired through GGKit, but the shared overlay shell remains unchanged.

## Art round - water and light

### implemented

- Presentation-only uplift. Gameplay mechanics, balance, controls, save flow, GGKit lifecycle, and fix round 1 repairs remain unchanged.
- Added a wide authored lake stage with depth-graded water bands, moving caustics, swell lines, sky and shoreline reflections, sun glitter, soft shore foam, drifting cloud shadows, and reduced-motion gating.
- Added layered far and near banks with authored tree and vegetation silhouettes, swaying reeds, parallax camera framing, a dock with reflection, and a distant boat with reflection.
- Added pooled underwater fish shadows, fish-movement ripples, brighter cast and strike splash choreography, detailed bobber and line wake rendering, firefly and dragonfly motes, and a large catch-card beat with water drops and sparkle.
- Added `window.__ll.state` with `mode`, `playState`, `lake`, and `forceShowcase`, plus the compatible `window.__ll.forceShowcase` switch for deterministic showcase camera pans.
- Bumped the service-worker cache version to `aaa-art2-20260808-1`; all existing title assets remain precached.

### presentation inventory

- Runtime art is procedural Phaser graphics layered over the existing CC0 fish, rocks, seaweed, bubbles, MP3 music, and MP3 SFX inventory. No new assets or network dependencies were added.
- The pass uses fixed pools for motes, catch sparkles, ripples, foam, bubbles, and splash droplets. Dynamic water and atmosphere are rendered through shared graphics passes with two-frame throttling.
- The palette follows each lake's existing dawn, dusk, day, or night grade and keeps HUD and panels readable at the 390 px portrait layout.

### deferred

- Deployed HTTPS visual capture, device-gate verification, and performance capture remain deferred to the orchestrator. Browser smoke testing was unavailable in this environment because no connected browser was present and sandboxed local-server binding was denied.

## Retina pass 2026-08-16

- Measured before/after canvas-to-CSS ratio: no per-title live measurement was available. The fleet baseline measured 1.00x for 62 titles and 1.10x to 2.46x for the remainder. The after audit was blocked when the prescribed runner could not bind its private port (`listen EPERM`), and no browser backend was available. Static target at DPR3 is 3.00x.
- Recipe: `GGKit.hiDpi.factor(390, 844)`, dense FIT scale dimensions, `GGKit.renderDefaults`, zoom on both the gameplay and existing UI cameras, and matching Text resolution.
- Factor cap: none beyond GGKit's default [1, 3] clamp.
- Could not capture the required gameplay screenshot, backing-store ratio, or gameplay color metrics in this sandbox. `node --check game.js` passes.
