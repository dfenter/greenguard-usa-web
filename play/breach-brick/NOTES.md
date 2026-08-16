# Breach & Brick

Drag anywhere to steer the paddle. Tap or press Space/Enter to launch and fire; arrows/WASD also steer.
Break the wall, catch powerups, and keep the ball alive. Falling bricks can smash the wall or stun the paddle.

## AAA rebuild

Rebuilt in place from the archived prototype (single canvas, one procedural
wall, four powerups, no progression) to the fleet AAA bar. Phaser 3.87 from
`/play/_shared/`, GGKit as the sole lifecycle / input / save / audio
implementation. Portrait 540x960 virtual stage, `Scale.FIT` + `CENTER_BOTH`.
Rev `2026-08-10-aaa-r2`.

Files: `index.html`, `game.js`, `bb_data.js` (authored content tables),
`bb_audio.js` (procedural audio bank), `sw.js`, `manifest.json`, `icon.png`,
`icon512.png`, `favicon.ico`, `LICENSES.md`. Total payload **284 KB**, largest
file `game.js` at **114 KB** (budget 2.5 MB / 400 KB). No `assets/` directory:
every sprite and every sound is generated in code at boot, so nothing is
hotlinked from another title and no `.ogg` exists anywhere. Licensing and the
ledger position are in `LICENSES.md`.

### Implemented

**Mechanics (owner priority 1)**
- Drag steering is 1:1 relative motion polled from `kit.input.pointers` every
  frame and applied before the simulation steps, so there is no smoothing lag
  and no teleport when you tap to launch. Verified: a 100 px drag moves the deck
  100 px. Keyboard (arrows / A / D) shares the same target. Tap detection is
  derived from a pointer leaving the GGKit pointer map, so no second DOM or
  Phaser input handler exists anywhere in the title.
- Launch is deterministic: the held ball takes its angle from where it sits on
  the deck, with an authored spread when the deck is stationary so wall 1 cannot
  open with a vertical stalemate. Multi-ball runs a pool of 6; the wrecking ball
  swaps radius and damage without leaving the pool.
- Falling-brick tell: an unstable brick **arms**, then holds a warning window
  (1.25 s on wall 1 down to 0.90 s on wall 12) during which it pulses amber,
  jitters, paints a widening beam down its column, pulses a chevron on the floor
  line, and plays a two-tone alarm plus a rising second alarm 0.3 s before it
  drops. Breaking an armed brick cancels the drop and is worth the points.
- Stun and recovery: a landed brick tints the deck red, drops its tracking to a
  210 px/s speed limit, shows a shrinking ring, shakes the camera 15 px, plays
  a buzz, raises `STUNS n` in the HUD, and fires a chip plus a bright chirp on
  recovery. Stun count is the medal gate, so the feedback is load bearing.
- Every powerup has its own capsule glyph, HUD pip, catch colour, chip line and
  synthesised cue: `MULTIBALL`, `WRECKER`, `WIDE DECK`, `MAG DECK`, `LANCE`,
  `FLOOR NET`, `DAMPEN`, `SPARE DECK`.

**Loop (owner priority 2)**
- 12 authored walls in a campaign run with 3 lives, medal tiers per wall
  (gold = under the gold time with zero stuns, silver = under the silver time
  with at most one stun, bronze = any clear), a running HUD target, and per-wall
  best medal and best time in the save.
- Unlock chain of 5 paddle decks and 5 ball cores driven by medals, gold count
  and walls cleared, with a Deck Locker that shows the real baked art and the
  unlock condition for anything still locked. New unlocks fire a banner beat.
- Interactive first-run tutorial: steer (gated on 70 px of drag), launch (gated
  on the launch), catch (a guaranteed multiball dropped straight down the deck's
  own column). Verified end to end in 5.5 s. The coach is a thin fading strip in
  the top band at y=132; it never covers the play area centre or bottom half.
- Generous drops as instructed: 46 % base drop chance on wall 1 falling to 30 %
  on wall 12, every prize brick drops unconditionally, multiball is the heaviest
  entry in the weighted table and is force-picked 34 % of the time on walls 1-3,
  and walls 1-6 hand out one free multiball as soon as 35-60 % of the wall is
  down.
- Wall select, deck locker, how-to-play, GGKit settings, retry-wall and
  back-to-menu on the end card; progress and best score survive a reload
  (verified).

**World design (owner priority 3)** - see the table below.

**Presentation**
- 166 baked textures. Four themed backgrounds with distinct motifs (grid rule,
  rivets, cracks, sigil rings), 84 brick faces across 4 themes x 7 brick kinds x
  3 damage states, four boss plates, five paddle decks with a stun overlay, five
  ball cores, capsules, pips, particles, chrome.
- 5 pooled particle systems: shatter shards, additive sparks, additive glow,
  floor dust, catch confetti. Shatter and spark bursts on every break, bigger on
  charge chains and the boss kill.
- Camera shake on stun (15 px), wall clear (14 px), boss death (18 px), charge
  detonation (11 px); hit-stop on charges, stuns and the boss kill. All of it
  runs through `kit.juice`, so the settings toggle turns it off.
- Banner beats at exactly 60 % width with `Back.easeOut` overshoot for wall
  intro, wall clear with the medal stamp, multiball, core down, deck unlocked,
  deck lost, campaign clear.
- Reduced motion: `prefers-reduced-motion: reduce` removes shake, hit-stop,
  brick jitter, capsule rotation and title float, swaps banner overshoot for a
  fade, and cuts particle counts to 40 %. Verified live with emulated media.
- 32 GGKit audio cues, two 8-second phase-locked music stems (`music_deep` on
  ordinary walls, `music_surge` on boss walls), per-cue rate limiting so a
  six-ball board does not stack allocations.

**Verification hook**
`window.__bb` is declared before anything can fail, so a boot fallback still
answers. `window.__bb.state` carries `ok, scene, phase, level/wall, wallName,
theme, signature, lives, balls, ballsHeld, score, best, combo, mult, bricks,
bricksTotal, boss, bossMax, stun, stunned, stuns, falling, warning, powerups,
active{...}, shield, medal, medalName, elapsed, goldAt, silverAt, paddleSkin,
ballSkin, tutorial, tutorialStep, reducedMotion, juice, muted, steps, slowmo`.
`__bb.forceLevel(n)` jumps to any wall. `__bb.forceEvent(name)` accepts
`multiball, power:<type>, drop:<type>, stun, recover, slow, fall, boss, clear,
die, gameover, unlockAll, resetSave, tutorial, banner` and returns false for
anything it does not know. Switches are also readable from the URL
(`?wall=`, `?event=`, `?notut=1`, `?invincible=1`) so they work from the boot
fallback as well as the live scene.

### Wall table

Four authored identities, three walls each. Layouts are ASCII grids in
`bb_data.js` (9 columns), validated at boot and under `node`.

| # | Wall | Identity | Bricks | Boss | Gold / Silver | Signature set-piece |
|---|---|---|---|---|---|---|
| 1 | Proving Grid | Vault Grid | 24 | - | 0:30 / 0:55 | Open arch: the centre is pre-breached so the first ball funnels to the back row |
| 2 | Twin Spires | Vault Grid | 38 | - | 0:42 / 1:12 | Twin spires around a drop well that feeds the shared floor row |
| 3 | Cradle | Vault Grid | 36 | - | 0:45 / 1:18 | Two unstable keystones flanking the prize pair; take a prize and the keystone arms |
| 4 | Iron Bunker | Iron Bunker | 40 | - | 1:02 / 1:45 | Full steel shell over a soft core, entered only through two plinth gaps |
| 5 | Portcullis | Iron Bunker | 37 | - | 1:06 / 1:52 | Four steel portcullis columns with a charge brick wired into the centre gate |
| 6 | Redoubt | Iron Bunker | 44 | - | 1:18 / 2:10 | Paired charge fuses in the gate; popping one collapses that flank |
| 7 | Fracture Shelf | Fracture Gauntlet | 48 | - | 1:12 / 2:02 | Unstable shelf across the whole ceiling that rains in sequence once breached |
| 8 | Hanging Garden | Fracture Gauntlet | 44 | - | 1:22 / 2:18 | Two hanging unstable chains: cut one low and every link above it follows |
| 9 | Collapse Run | Fracture Gauntlet | 51 | - | 1:36 / 2:40 | The wall drops its own unstable floor row at the deck while you work the core |
| 10 | Citadel Gate | Citadel Core | 37 | 40 hp | 1:32 / 2:35 | Gate core in a steel frame; it slams its unstable lintel loose when hurt |
| 11 | Throne | Citadel Core | 42 | 60 hp | 1:45 / 2:55 | Crown row of alternating steel merlons, so every ceiling bounce costs tempo |
| 12 | Breach Finale | Citadel Core | 51 | 90 hp | 2:10 / 3:35 | Core sealed in a full steel shell with charge fuses at both shoulders |

Brick kinds: plain 1/2/3 hp, steel (5 hp, rivets and seam), charge (chain blast
over a 1-cell radius, also hurts a boss it touches), unstable (arms, warns,
falls), prize (guaranteed drop). Difficulty curve: ball speed 288 -> 370, drop
rate 46 % -> 30 %, warn window 1.25 s -> 0.90 s, spontaneous unstable arming
from never (walls 1-4) to every 6.5 s (wall 9), boss slams 7.5 s -> 5.5 s.

### Known defect classes, and how each is closed

- One pooled display object per entity family and **no separate debug view**:
  the hook reads the same records the renderer draws.
- Render state lives in parallel `brickView` records owned by the renderer; the
  simulation brick handed to it carries no sprite, tint or flash field.
- Every keyed lookup goes through `pick()` / `pickAt()` with an explicit
  fallback: theme, wall, powerup, skin, medal, and the drop table.
- Fixed 1/120 s simulation steps with a hard 8-step per-frame cap and the
  accumulator clamped to that budget, so a degraded device runs slow motion and
  never time-skips. Every gameplay timer (level clock, stun, powerup durations,
  lance cooldown, warn windows, boss slam) is denominated in stepped seconds.
- All static chrome (HUD frame, rails, floor threshold, backgrounds, panels) is
  baked into textures at boot; not one `Graphics` object survives into a display
  list, and `Graphics.arc` is never walked per frame - the stun ring and the
  sigil motif are hand-tessellated annuli baked once.
- `setTextIfChanged` (`setTxt`) and a matching `setCol` guard every HUD write.
- DOM control handlers do not exist: input is polled from `kit.input.pointers`
  only, which is also why no handler can fail to seed the pointer map.
- No camera split is used anywhere, so the "second camera" trap does not apply.
- Scenes are ES5 prototype subclasses of `Phaser.Scene`, not plain config
  objects, so custom methods do not need `extend:`.
- Nothing subscribes to `sys.events`; in particular nothing subscribes to
  `postrender`, which Scene Systems never emits.
- Every arrow IIFE is closed `})()`; boot was proved in a real browser parse,
  not only by `node --check`.
- `sw.js` precaches exactly the 11 files that exist on disk.

### Verification

Real Chrome (139, WebGL, GPU) over CDP against a local server, mobile-shaped
viewport. **Zero console errors and zero exceptions across every run.**

- Boot -> title -> wall select / deck locker / how-to / back, all four panels.
- Full first-run tutorial: steer -> launch -> catch, completed in 5.5 s.
- 1:1 drag tracking: 100 px drag moves the deck 100 px.
- All four identities loaded and screenshotted (walls 1, 4, 7, 10, 12), boss hp
  40/90 present on 10 and 12.
- Falling-brick tell observed end to end: `warning` 2 -> `falling` 1 with the
  beams, chevrons and amber pulse on screen.
- Stun -> recovery, shield, slow, multiball, laser, prize drops, charge chains.
- Wall clear -> GOLD medal -> banner -> auto-advance to the next wall.
- Game over after lives exhaust, end card, retry and menu.
- Save persists across a reload (cleared 1, best 2895); `validateSave` rejects a
  foreign or stale record.
- Reduced motion honoured (`reducedMotion: true` with emulated media).
- Performance, wall 9 with 6 balls, wreck, lance, falling debris and warnings
  live, scene self-time per frame: **@1x median 0.2 ms, p95 0.8 ms, max 7 ms**;
  **@4x CPU throttle median 0.3 ms, p95 9.5 ms, p99 31.4 ms, 3 frames over
  33 ms in 399** (scales to ~4.5 per 600, budget 6). Whole-frame RAF cadence at
  4x was 16.9-18.4 ms median, i.e. vsync bound.

### Deferred

- **Whole-frame RAF over-33 ms count is not a clean number on this box.** The
  same spikes appear with the title's render and particles disabled and with an
  idle board (10 over 33 ms in 197 frames), so the outliers are the contended
  machine and the CDP driver, not the title. The scene self-time above is the
  defensible figure; a clean whole-frame capture needs an uncontended box.
- Headless Chrome could not be used for the capture: it throttles RAF to about
  4 fps and reports `screen.orientation` as landscape, which trips the GGKit
  rotate gate. The pass ran headed with the real GPU, with harness-side shims
  for `screen.orientation` and `document.hidden` only.
- No touch-specific pass: pointer events were driven as mouse events. Multi
  finger play (steer with one thumb, fire with the other) is implemented and
  reads correctly from the pointer map, but has not been exercised on hardware.
- The wall-clear fanfare, medal shimmer and unlock triad are synthesised rather
  than taken from a CC0 jingle pack, because `/play/_assets/` carries no audio
  files in this repository. If the harvest packs are ever checked in, the four
  progression cues are the ones worth swapping.
- Boss behaviour combines timed slams with throttled hurt-triggered targeted
  slams across walls 10-12. A shielded phase or a directed brick volley is the
  obvious next uplift.
- No leaderboard, no daily seed, no ghost replay: the run is the campaign plus
  per-wall medals only.

## Fix round 1

Fixed findings:

- MAJOR: tutorial launch is now gated until the steer step is completed.
- MAJOR: launch uses a deterministic, visible, player-adjustable aim instead of RNG spread.
- MAJOR: medal time advances only during active play.
- MAJOR: GGKit hit-stop remains cosmetic; simulation time is not discarded.
- MAJOR: wall clear waits for active prize drops and falling debris to resolve.
- MAJOR: save data is fully validated, normalized, and protected against GGKit storage errors.
- MAJOR: retry and force-level restarts route through `kit.restart()` and its lifecycle callback.
- MAJOR: title panels and end-card actions support GGKit keyboard focus and activation; the Options action remains the GGKit settings entry point.
- MAJOR: small panel and HUD typography was increased for the 390 px viewport.
- MAJOR: boot failures now stay failed and show a visible reload prompt.
- MAJOR: boss cores now trigger a throttled targeted unstable-brick slam when hurt, in addition to their timed behavior.
- MAJOR: stun adds a reduced-motion-aware red vignette and damage blink.
- MINOR: tap release tolerance increased from 450 ms to 650 ms.
- MINOR: multiball reports the actual live-core count when the pool is full.
- MINOR: queued URL events now launch the game and execute after the game scene is ready.
- MINOR: audio preload promises are awaited before boot completes.
- MINOR: rail and ceiling rebounds now use pooled contact beats.
- MINOR: authored ball trail colours now drive a pooled trail renderer.

Rejected findings:

- CRITICAL: none were assigned to `breach-brick` in this review.
- MINOR: no gamepad path. This title keeps GGKit as the sole input owner, and no GGKit gamepad adapter is exposed by the input surface used here. Adding browser-level gamepad polling would violate that contract.
- The particle call lines for `horde-meridian` and `spire-ascent` are outside `play/breach-brick/`; no out-of-scope title was changed.

Validation: `node --check` passed for `game.js`, `bb_data.js`, `bb_audio.js`, and `sw.js`; `BBData.validate()` passed; payload is 292,974 bytes and the largest file is 127,208 bytes. Service-worker version is `2026-08-10-aaa-r3`.

## UI declutter

- Cut the always-on wall-name, best-score, and boss-name HUD labels; kept the wall index, score, lives, timer/target state, effect pips, and boss meter.
- Moved live multiball, life, boss, stun, loss, shield, and test feedback into one small top-corner chip lane; removed the redundant READY and campaign banners.
- Shrunk center banners and kept them only for wall/run boundaries; moved active-play event banners out of the playfield.
- Collapsed tutorial copy into one queued top strip that fades after about three seconds; chips, coach text, and banners now share one transient queue with reduced-motion gating intact.
- Moved effect meters into the top HUD and removed the bottom-center informational chip from the thumb zone.
- Validation: `node --check` passed for all title JavaScript files; visual browser capture was unavailable in this session because no browser target or local preview port was available.

## Retina pass 2026-08-16

- Ratio record at portrait CSS 390x844 and DPR 3: before 1.38x from the 540px design FIT backing store; after 3.00x expected from a 1170x2080 backing store. Live canvas measurement was unavailable.
- Recipe: `GGKit.hiDpi.factor(540, 960)`, dense FIT scale dimensions, `GGKit.renderDefaults`, and `setZoom(RETINA_FACTOR)` in Boot, Title, and Game.
- Factor cap: none. The factor is GGKit-clamped to the device maximum of 3.
- Could not capture the required DPR 3 gameplay screenshot or `canvas.width / getBoundingClientRect().width` measurement because no browser instance was available and the private port could not be opened in this environment.
