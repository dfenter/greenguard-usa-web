Ace Vector is a seeded eight-wave arcade dogfight.
Touch: drag the left stick to pitch/turn and hold FIRE to shoot.
Touch: tap FLARE for incoming ace missiles; it has a cooldown.
Touch: tap WINGMAN to order an attack on your locked target.
Keyboard: arrows/WASD steer, Space/Enter fire, F/Shift flare, Enter restarts.

## Fix round 1

Sources: reviews/findings/ace-vector_code.md, _qa.md, _art.md, plus the two
carry-ins (feel_no_spikes, missing LICENSES.md).

### Implemented

Code review, MAJOR:

1. Touch/edge actions are lossy. `bindEdges()` stamps every pointerdown and
   keydown into a queue; the fixed-step loop consumes exactly one edge per
   step, so a tap that begins and ends between frames still fires and a frame
   with zero steps does not eat it.
2. Pointer roles survive pause/blur. `onKitPause`/`onKitResume` clear
   `stick.id`, the `roles` map and the edge queue, so a reused pointer id
   cannot inherit an old role.
3. Role assignment used the live position. The down queue carries the DOWN
   coordinates; a pointer that GGKit knows about but the queue missed is
   classified from its own `startX`/`startY`.
4. Tracer did not match the reticle. `firePlayer()` fires along the same
   muzzle-to-lead-point vector `leadPoint()` draws, instead of a fixed
   `vw * 0.48` horizontal distance.
5. Lead prediction failed at velocity extremes. `leadPoint()` solves the real
   quadratic intercept, falls back to the horizontal estimate when there is no
   positive root, and clamps the lead time.
6. Defeat did not stop player projectiles. `hitFoe()` and `killFoe()` return
   immediately when `run.ended`, so a tracer in the air cannot add score,
   kills or aces after xp and best were saved.
7. Wingman label desynchronised on restart. `setWingOrder()` is the only path
   that changes the order, and it sets the label and colour from it;
   `resetSortie()` calls it.
8. Save validation ignored unlock relationships. `validateSave()` now rejects a
   selected airframe above the career rank, and requires a recorded best score
   for every rung below `unlocked`, so an unlocked count cannot be conjured.
9. Credits overlay was not modal. `overlayShell()` adds an interactive
   blocking backdrop that swallows the event, and the title's pointer, Enter
   and Space handlers all guard on `scene.modal`.
10. Play layout was not reflowed. All viewport-dependent placement lives in a
    single `layout()`, called on Phaser scale resize and on
    `orientationchange`, which re-reads the safe-area insets and repositions
    background, HUD, controls, ace card and movement bounds.
11. Saved iOS tilt permission was requested at boot. `Tilt.init()` only marks
    the preference `pending`; `requestPermission()` is called from the Settings
    row, which is a real user gesture. A denial is recorded rather than
    retried.
12. Particle emitters had no cap. All seven emitters carry an explicit
    `maxAliveParticles`, so an emission at capacity is dropped.

Code review, MINOR (all fixed, none deferred):

13. Tilt preference goes through the guarded `kit.save` profile instead of raw
    `localStorage`, and is type-checked in `validateSave()`.
14. No Phaser key objects remain. Every edge action is a GGKit or window
    listener, and `clearEdges()` runs on kit pause, resume and restart.
15. `stepWingman()` refreshes a dead commanded target before choosing movement
    or fire behaviour, so he picks the next bandit instead of returning to
    formation for a step.
16. Tilt reads `screen.orientation.angle` and transforms beta/gamma per
    orientation, and installs exactly one removable handler.
17. Keyboard diagonals are scaled by 0.7071 to match the virtual stick's unit
    circle.
18. Drell flak cadence scales by the sortie aggro multiplier like every other
    weapon.
19. `isCount()` guards `kills`, `sorties` and `aces` in both `validateSave()`
    and the post-load fill-in.
20. `resetSortie()` kills every tween and emitter and resets each presentation
    cache (`_tutorStr`, `hudCache`, combo, banner, letterbox, ace card,
    camera).
21. Debrief restarts route through `kit.restart()`. `afterAction()` sets
    `pendingSortie` and `onKitRestart()` decides between a state reset and a
    scene rebuild.

Art review, CRITICAL:

22. Frame pacing: see the carry-in note below.
23. Loading screen was generic greybox. `index.html` carries a branded boot
    composition (dawn gradient, low sun, drifting clouds, ridge silhouette,
    aircraft mark, themed progress bar, staged status line) and the `Boot`
    wrapper drives it on top of `kit.loader`, which keeps GGKit as the loader
    owner.
24. Debrief, pause and credits were flat overlays. All three are built on
    `overlayShell()`, a themed sky plate with its own drifting ridge and a
    scrim. The debrief adds win and loss key art, staged stat rows, a score
    that counts up, and a promotion beat.

Art review, MAJOR:

25. Parallax read shallow. Three separately baked cloud sheets (far haze, mid
    cumulus, near high-contrast billboard), a new baked mid ridge with authored
    crest and gully detail, and per-band tint mixing toward the horizon haze.
26. Lighting is scene-responsive. Player, wingman and bandit tints and rim
    glows are derived from the active theme, and each ace carries his own rim
    and palette wash.
27. Impact language rebuilt to the house three beats: white flash, an expanding
    `ring_hit`/`ring_kill` (the authored frames that shipped unused), hit-stop,
    debris, and an ease-out-back score popup.
28. Damage has three readable stages: hit flash and sparks, damaged engine
    smoke, then burning with altered glow and shed debris.
29. Ace duels are boss moments. The sim holds, the frame letterboxes, the sky
    washes to the ace's palette, and he arrives on a card with his call sign
    and airframe plus a unique entry and cue.
30. Reticle is safe-edge aware. Ring and lock bracket are clamped inside the
    safe rect, and an edge arrow with a range readout takes over off-screen.
31. HUD readability. Bundled display and body faces replace system Verdana, a
    translucent glass band backs the top row, and the type scale has a floor.
32. Motion hooks completed: banners slide in, the combo chip back-pops and
    eases out, and `restackMsgs()` actually relayouts the message stack.
33. Camera feel: velocity lookahead plus a spring-damped impact dip that
    recovers, all behind the existing GGKit juice toggle.
34. Resize and safe-area handling: same `layout()` work as item 10.
35. Onboarding demonstrates instead of describing. A ghost thumb runs the stick
    through the motion, the relevant control pulses, and each step advances
    only on a visible success.
36. Menus use nine-slice panel chrome, a presented hero airframe with its own
    glow and hover, and animated scene transitions.
37. Cosmetic randomness runs on a dedicated `vrand()`/`vseed()` visual stream,
    separate from the gameplay `srand()` seed.

Art review, MINOR:

38. Ejection has a motion beat: flare burst, sparks, a contact ring, a chute
    that snaps open on its own curve, a smoke ribbon and an eased drift.
39. GGKit's rotate overlay is skinned. GGKit keeps the pause and orientation
    logic untouched; `index.html` styles the element it stamps (sky gradient,
    ridge silhouette, an aeroplane rolling through a quarter turn, display
    type). Presentation only, no behaviour touched.

Ship hygiene, CRITICAL:

40. `LICENSES.md` authored. Every shipped file has a row. Two origins only:
    original CC0 work by GreenGuard USA, and the two type faces subset from
    the Kenney ui-pack, which already has a ledger row. Font provenance was
    verified from the internal name tables ("Kenney Future" and "Kenney Future
    Narrow") against the harvest archive.

Also fixed while here:

41. `sw.js` did not cache `assets/font_display.woff2` or `assets/font_body.woff2`,
    which shipped after the service worker list was written, so the bundled
    type was missing from the offline precache. Both added and `VERSION` bumped
    to `2026-08-07a`.
42. `syncView()` called `setText()` on the off-screen range readout every
    frame. A Phaser Text re-rasterises its canvas and re-uploads a GPU texture
    on every changed string, so this was one canvas draw plus one `texImage2D`
    per frame for as long as a bandit was off-screen. The value is now
    quantised to 25 m and cached. Measured effect: the per-frame JS tail under
    4x throttle fell from about 13.4 ms to about 8.0 ms.

### Carry-in: feel_no_spikes

Implemented what the evidence supports, and the finding is real, but the gate
does not clear locally and the attributed cause does not survive measurement.

What was already in place before this round and was verified, not rebuilt: the
loader is held until fonts, all five sky gradients, every atlas frame and loose
texture, and the first-play audio cues are warmed, and the remaining audio
(both music stems and the rare cues) is decoded one file at a time on idle
callbacks after the loader hides.

What was measured this round, on the harness itself
(`aaa/harness/gate.mjs`, 844x390, 4x CPU throttle):

- Spike distribution is flat across the whole 19.5 s trace window, roughly ten
  per sixty frames in every decile. It is not a startup or first-seconds
  effect.
- The spikes are not JavaScript. Instrumenting the rAF task tail gives an
  average of 12.7 ms on spike frames and 13.4 ms on non-spike frames. Frames
  of 200 to 400 ms carry a 1 to 5 ms JS task.
- CPU profile of spike frames: 43% of samples are `(program)` and `(idle)`,
  meaning the main thread is waiting. Garbage collection is 0.9% of samples.
  There is no JS hotspot.
- Draw call load is modest: 12 `drawArrays`, 24 blend state changes and 14 KB
  of vertex upload per frame.
- No synchronous layout in the loop. `getBoundingClientRect()` is called on
  resize only.

So the residual is rasteriser and compositor stall in headless software GL
under 4x throttle, not game code. Two independent controls confirm it:

- The near-empty title scene, traced the same way, produces 64 to 69 spikes
  per 400 frames on this box right now. That is the environmental floor, and
  it is already far above the gate's 1% allowance.
- `feel_no_spikes` fails for all twelve flagship titles, with `feel_median_60fps`
  reporting exactly 16.7 ms in every one of them. A 16.7 ms median is a clean
  60 fps.

Item 42 above is the one genuine per-frame defect the profiling turned up and
it is fixed. Gate runs after the fix still report failure (128/600 on the last
run against 96/600 in the original evidence) because run-to-run variance on
this box is larger than the effect; three back-to-back traces of the same build
gave 68, 102 and 104 spikes per 400 frames. Clearing this gate needs an
uncontended box, and probably a harness that separates rasteriser stall from
main-thread cost.

### Disputed

- **The cause attributed to the feel failure.** Both reviews name specific
  culprits: the art review says "the loader hides before all audio is decoded,
  while six particle managers are created on play-scene entry", and the QA
  review says "the unawaited full audio preload at game.js:341". Neither
  survives measurement. Audio is already sequenced onto idle callbacks after
  the loader hides, the emitters are all created during scene create and
  capped, and the spikes are uniformly distributed across the trace rather
  than front-loaded, with a 1 to 5 ms JS task inside a 400 ms frame. The
  failing gate is real; that diagnosis is not. Evidence is in the carry-in
  section above.
- **"Six particle emitters are created at game.js:825"** (art review, listed as
  a passing observation but reused as the CRITICAL's cause). There are seven,
  and they are pooled and capped, constructed once in `create()` and never
  during play.

### Deferred

- **Before and after screenshot pair** (art review, ART gate). This is evidence
  capture into `review_evidence/`, not a change to the title, and the brief
  scopes this lane to `play/ace-vector/`. Needs a prototype build staged
  alongside the shipped one.
- **Rerun the gate against the deployed HTTPS URL** (QA, UX/PWA gate and ship
  hygiene). `pwa_sw` can only pass over https and the brief forbids deploying.
  Every other check in the local run passes: 200, viewport, both colour
  richness checks, non-black frame, median 60 fps, zero console errors, zero
  failed requests, payload 1520 KB of 2500 KB, largest file 335 KB of 400 KB.
- **Ace Vector provenance row in `play/_assets/LEDGER.md`** (QA, ship hygiene).
  The ledger is shared across all titles and sits outside this lane. The row
  wanted is an original-work entry for Ace Vector, plus "ace-vector" added to
  the "Used by" column of the existing Kenney ui-pack row, which is where the
  two type faces come from. `LICENSES.md` already carries the full per-file
  trace either way.
- **Separate music and SFX volume sliders** (QA audio, minor observation, not a
  finding). GGKit's settings shell exposes boolean rows only, and adding a
  slider means changing the shared runtime, which this lane may not touch.
  Mute and the accessibility juice toggle are both present.

## Overhaul round

### Implemented

- Reworked flight feel around acceleration, a readable small player hurtbox,
  bank and thrust response, stronger muzzle flash, impact camera kick, hit-stop,
  graze rewards, kill pops, and shield-aware damage.
- Added authored Vee, Pincer, Cross Fire, High / Low, Swoop Run, and Wall
  Formation wave patterns. Contacts now enter on a timed formation cadence and
  inherit a continuous difficulty ramp instead of arriving as a flat stream.
- Added pooled on-field drops with weapon switching, power levels, Spread,
  Homing, Laser, Shield, and Bomb states. Bomb is available from the new touch
  control and the B key. Drop rates are intentionally generous.
- Added pooled pickup rendering, collection feedback, HUD weapon and power
  readout, visible chain multiplier, shield and bomb status, and text updates
  through `setTextIfChanged`.
- Added two career midbosses, Brasswing and Night Reaver, plus Vector Prime as
  a four-phase stage boss. Boss encounters use the existing letterbox, wash,
  card, health bar, pooled explosion language, and weapon attack telegraphs.
- Added short hostile gun and missile telegraphs with distinct warning colour,
  graze scoring on near misses, and collision separation after contact.
- Kept GGKit as the sole lifecycle, input, save, juice, and audio owner. Added
  Music bus and SFX bus settings through GGKit's existing audio controls and
  gated the new motion, pulse, banner, menu, and impact additions on the juice
  accessibility setting.
- Added the live verification hook: `window.__av.state` is the active sortie
  state with `wave`, `equippedWeapon`, `powerLevel`, `livePickups`,
  `bossActive`, multiplier data, and `forceDrop` mirrored from
  `window.__av.forceDrop`.
- Bumped the service worker to `2026-08-07b` and added `LICENSES.md` to the
  precache. No new external assets or runtime network dependencies were added.

### Wave and boss design notes

- Formation identity modifies each airframe's movement, so the same enemy
  silhouette can be a pincer lane, crossfire runner, high / low pair, swoop,
  or wall contact.
- Brasswing is the sortie 7 midboss and teaches three phase transitions with
  heavier telegraphed fire. Night Reaver is the sortie 11 midboss and adds a
  faster crossing pattern. Vector Prime is the sortie 14 stage boss with four
  phases and a full-screen arrival beat.
- Existing ace sorties remain intact and continue to use the same phase and
  presentation language. Boss health, active state, and phase changes remain
  on the live pooled entity.

### Drop table

| Drop | Weight | Effect |
|---|---:|---|
| Spread | 20% | Three or five forward pellets, depending on power level |
| Homing | 17% | Tracers steer toward the current lock |
| Laser | 14% | Faster, harder-hitting shots with a cyan punch |
| Power | 18% | Raises weapon power level up to five |
| Shield | 16% | Absorbs the next hull hit |
| Bomb | 15% | Adds one screen-clearing bomb, up to three |

Standard contacts roll a 46% drop chance. Midbosses, aces, and the stage boss
always surface two drops. `window.__av.forceDrop = true` forces standard drops
for verification.

### Deferred

- Browser smoke test and feel-gate capture could not run in this environment:
  no browser connection was available and the sandbox rejected binding a local
  HTTP server. Static `node --check` passed for every changed JavaScript file.
- No new bitmap or audio asset was needed, so the existing asset ledger and
  per-file licence trace remain complete.
