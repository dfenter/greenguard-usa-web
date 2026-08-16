Drag from the ball away from the target, then release to shoot; the dotted line previews the first ricochet.
Two-finger drag pans the hole. Keyboard: arrows/WASD aim, Space/Enter shoot, R restart the hole.
Each course has 18 seeded holes with par, moving gates, sand, ice, boosts, and one gimmick per hole.
At 12 strokes a hole auto-finishes at +6; after hole 18, choose NEXT COURSE to reseed.
Best 18-hole card is persisted locally in the browser.

## AAA rebuild

Implemented:

- Rebuilt in Phaser 3 at 1280x720 landscape with `<base>`, PWA manifest, PNG icons, favicon, and a service worker generated from the shared template.
- GGKit owns lifecycle, orientation pause, pointer identity, restart clearing, validated save data, settings, screen juice, and audio bus calls. The sim is fixed-step with bounded catch-up and never advances its course clock outside stepped simulation.
- Drag-to-shoot now has a pull-back gauge, power-ball scaling, four-segment multi-bounce tracer, moving gate timing, distinct grass, sand, ice, and water reset behavior, tuned boost launches, bank impact sparks, pooled trails, sink celebrations, reduced-motion gating, and center banners for hole-in-one and course completion.
- Tour mode chains four seeded 18-hole courses with medal tiers and unlock gates. Trick Shot mode applies ricochet-only targets. Championship Crown is the fifth seeded 18-hole finale with combo gimmicks. Generous power, gimme, and forgiveness pickups are seeded into every hole. The first-run tutorial advances through drag, release, bounce, surface, and pickup actions in a thin top strip.

Course table:

| Course | Seed | Identity | Signature hole | Unlock |
| --- | --- | --- | --- | --- |
| Garden Green | `0x4A17C` | Moss, ponds, hedges, whirlpools | 09 Arbor Spiral | Tour start |
| Frostline Cavern | `0x7C2E1` | Ice slides, echo gates, frost fans | 09 Blue Echo | Garden medal |
| Duneveil Desert | `0xD19E4` | Sand drag, mirage gates, boost cuts | 09 Sandglass | Frostline medal |
| Clockwork Yard | `0xC10C7` | Gears, ratchets, conveyors, clock hands | 09 Clockwork Heart | Duneveil medal |
| Championship Crown | `0xF1A1` | Hardest multi-surface gimmick combos | 09 Crownfall | Full Tour clear |

Hole table. Each entry is `hole name / par / signature gimmick`.

| Course | Holes 01-06 | Holes 07-12 | Holes 13-18 |
| --- | --- | --- | --- |
| Garden Green | Seedling Bend / 3 / Dew Gate; Mossy Split / 4 / Water Reset; Pondside Rail / 3 / Petal Boost; Rose Trellis / 4 / Whirlpool; Lantern Lawn / 5 / Sand Drift; Hedge Echo / 4 / Echo Gate | Dewdrop Drop / 3 / Water Reset; Orchard Switch / 4 / Petal Boost; Arbor Spiral / 5 / Arboretum; Fern Fork / 4 / Whirlpool; Willow Bank / 3 / Dew Gate; Bee Line / 4 / Water Reset | Glasshouse Gate / 5 / Echo Gate; Ivy Clock / 4 / Petal Boost; Pollen Pocket / 3 / Whirlpool; Canopy Run / 5 / Dew Gate; Rootbound / 4 / Water Reset; The Old Oak / 6 / Old Oak |
| Frostline Cavern | Cold Open / 3 / Ice Slide; Glacier Fold / 4 / Echo Gate; Drift Gate / 3 / Frost Fan; Blue Shelf / 4 / Crystal Bank; Hollow Slide / 5 / Ice Slide; Icicle Alley / 4 / Water Reset | Frost Fan / 3 / Frost Fan; Mirror Mouth / 4 / Echo Gate; Blue Echo / 5 / Blue Echo; Rime Ladder / 4 / Ice Slide; Crystal Pocket / 3 / Crystal Bank; Snowblind / 4 / Frost Fan | Frozen Relay / 5 / Echo Gate; Chime Bank / 4 / Ice Slide; Avalanche Cut / 3 / Water Reset; Whiteout Loop / 5 / Blue Echo; Permafrost / 4 / Crystal Bank; The Deep Freeze / 6 / Deep Freeze |
| Duneveil Desert | Warm Start / 3 / Sand Drift; Dust Split / 4 / Dune Boost; Canyon Rail / 3 / Mirage Gate; Sunken Marker / 4 / Quicksand; Mirage Mouth / 5 / Water Reset; Dune Switch / 4 / Sand Drift | Oasis Tap / 3 / Dune Boost; Sirocco Gate / 4 / Mirage Gate; Sandglass / 5 / Sandglass; Red Ridge / 4 / Quicksand; Heat Haze / 3 / Dune Boost; Dry Creek / 4 / Sand Drift | Copper Dunes / 5 / Mirage Gate; Long Shadow / 4 / Quicksand; Quicksand Key / 3 / Sandglass; Mesa Pinball / 5 / Dune Boost; Dust Devil / 4 / Mirage Gate; The Last Dune / 6 / Last Dune |
| Clockwork Yard | Windup / 3 / Gear Gate; Pinion Pair / 4 / Ratchet; Pendulum / 3 / Clock Hand; Cog Split / 4 / Conveyor; Springboard / 5 / Gear Gate; Minute Hand / 4 / Spring Boost | Ratchet Alley / 3 / Ratchet; Gearshift / 4 / Clock Hand; Clockwork Heart / 5 / Minute Hand; Second Hand / 4 / Conveyor; Escapement / 3 / Gear Gate; Copper Loop / 4 / Ratchet | Bellows / 5 / Clock Hand; Gear Maze / 4 / Conveyor; Late Tick / 3 / Gear Gate; Winding Road / 5 / Spring Boost; Overcrank / 4 / Minute Hand; The Final Tick / 6 / Final Tick |
| Championship Crown | Crown Gate / 3 / Crown Gate; Tidal Gear / 4 / Triple Combo; Ice and Ember / 3 / Triple Combo; Crossed Wires / 4 / Crown Gate; Dune Orchard / 5 / Triple Combo; Triple Timing / 4 / Timing Stack | Magnet Mile / 3 / Triple Combo; The Lock / 4 / Crown Gate; Crownfall / 5 / Crownfall; Four Corners / 4 / Triple Combo; Frosted Clock / 3 / Timing Stack; Waterwheel / 4 / Triple Combo | The Needle / 6 / Crown Gate; Hedge of Glass / 5 / Triple Combo; Long Bank / 4 / Timing Stack; Final Combo / 6 / Triple Combo; Last Pocket / 5 / Crown Gate; The Champion / 7 / The Champion |

Deferred:

- Live browser visual capture and 4x-throttle timing capture could not run because no browser surface was available in this session. Node syntax, manifest, service-worker precache, icon dimensions, and a headless Phaser/GGKit content and force-switch smoke test passed.
- No MP3 or M4A files were present under `/play/_assets/`, so no audio files were bundled. GGKit music and SFX bus calls are wired and remain ready for licensed `putt`, `impact`, surface stinger, and ambient bed files.

## Fix round 1

Fixed:

- CRITICAL score state: every generated hole now initializes and resets `shotCount` to zero.
- CRITICAL presentation: added original SVG ball, particle, and range-seal assets, four Phaser particle emitters, layered seals, and four ball states: idle, aim, shot, and sink.
- MAJOR restart state: restart restores shot count, pickup availability, and boost cooldowns.
- MAJOR fixed-step debt: excess accumulator time is discarded after the five-step budget, including hit-stop frames.
- MAJOR gamepad controls: deadzoned stick aim, confirm and result-card action, restart, settings, and pause are wired.
- MAJOR touch controls: visible SETTINGS, RESTART, and PAUSE or RESUME targets route through GGKit, with release-outside cancellation.
- MAJOR gimme behavior: a token is consumed only when it assists a fast near-cup sink.
- MAJOR stroke cap: the twelfth stroke resolves as par plus six before normal sinking, including Championship par seven holes.
- MAJOR Trick Shot: a sink without a bounce is rejected and returned to play.
- MAJOR gimmick coverage: all 30 seeded gimmicks are validated through one registry with physics, visual, and preview behavior; gimmick zones are seeded per hole.
- MAJOR preview drift: tracer collision uses the shared line, gate, and bumper trajectory helper and applies registry preview influences.
- MAJOR audio: GGKit now registers an original inline MP4/AAC tone for ambient, putt, impact, gate, boost, pickup, water, and completion cues.
- MAJOR content repetition: seeded starts, cups, gimmick locations, surface variation, route geometry, and layout bounds checks now vary each hole.
- MAJOR narrow-screen readability: the title remains deliberate landscape PWA content, with larger logical HUD type and visible mobile controls.
- MINOR FX exhaustion: manual particle and ring pools overwrite the oldest live item instead of dropping feedback silently.
- MINOR collision FX: impact feedback now fires only after an actual reflection.
- MINOR keyboard onboarding: arrow and WASD aim advances the first tutorial step.
- MINOR UI hit testing: UI uses screen coordinates and cancels a button release outside its original target.
- MINOR save validation: persisted best scores must be integers within the bounded course total.
- MINOR service worker: version bumped to `2026-08-10-aa-02`, own SVG assets are precached, and the shared assets route is supported.
- MINOR power-ball clarity: the HUD and shot toast state that power balls are automatic.

Rejected findings: none.

Verification: `node --check game.js` and `node --check sw.js` pass. A VM content smoke test built 270 holes across all modes and found all 30 registry entries. Manifest, precache paths, SVG structure, MP4/AAC audio format, no-em-dash text, and payload checks passed. The title payload is 150822 bytes and the largest title file is 93029 bytes. Browser playthrough and the 4x-throttle median could not be measured because no browser surface was available; no performance pass is claimed.

## UI declutter

- Cut live center banners, the bottom hint/flavor line, repeated shot/aim/under-par messages, redundant surface tags, and the always-on title watermark.
- Shrunk the HUD to one compact header with a stroke meter and pickup icons; reduced footer controls to icons while keeping their hit targets and bindings.
- Moved in-play events to one queued top-edge chip capped at 1.0s; kept hole-in-one and run completion information on result screens.
- Kept one short tutorial line at the top edge, fading it after about 3 seconds with reduced-motion gating intact.
- Bumped the service-worker cache version to `2026-08-10-aa-03`.

## Round 2 polish

### Presentation

- Resolution. The world stays 1280x720 logical, but the Phaser canvas is now
  sized in DEVICE pixels and the main camera is zoomed to match, so the
  backing store is dense on a phone. The factor is
  `clamp(round(fittedCssWidth * devicePixelRatio / 1280 * 4) / 4, 1, 3)`,
  which is 1:1 with the physical display instead of a blind 3x of a canvas
  that is already letterboxed. Verified in headless Chrome: at
  `deviceScaleFactor` 3 the canvas is 2240x1260 backing 693 CSS px; at 1 it
  is 1280x720. The removed-after-3.16 `resolution` config key is not used.
- Texture bakery. Every repeated shape (glow, ring, flare, puff, spark,
  shadow, bumper, mover, portal, cup ring, three pickups, HUD plate, HUD bar,
  card panel) is rasterised once into a canvas AT THE DEVICE SCALE and
  registered with `textures.addCanvas`. Nothing is baked at 1x and scaled up.
  All bakes complete before any game object that references them is
  constructed.
- Static course chrome is baked per hole into one full-screen canvas texture
  (board, playfield, mown stripes, grid, ground flecks, hazards, suggested
  route, walls, boost pads, cup and flag) and refreshed on hole change, so
  Phaser Graphics no longer replays several hundred commands per frame. The
  remaining per-frame Graphics work is the sky gradient (one call), the
  moving gates, the aim preview and the particle quads.
- Colour depth. Every large surface is a multi-stop gradient with a key light,
  a rim and an `overlay` noise pass from a baked tileable noise patch, plus an
  inner vignette. Walls get a cast shadow, a lit body gradient and a specular
  top edge; the cup is a radial well with a rim light and a gradient flag
  cloth. Measured distinct colours in real gameplay frames at dpr 3:
  65,886 (tee), 68,146 (mid shot), 82,687 (Crown hole 18), 65,925 (trick).
- Parallax scenery. Three tiling ground layers per authored area (far
  mottling, mid motif, near flecks) drawn as tile sprites under a translucent
  playfield, scrolling at 0.18 / 0.4 / 0.72 of the pan offset plus a
  ball-follow term and a slow drift. Motifs are authored per area: garden
  canopies, ice peaks, dune crests, gear rims, crown pennants.
- Ball animation. Roll angle now integrates real travel over the ball radius
  rather than a wall clock, so the ball reads as rolling and stops rolling
  when it stops. Idle, aim, shot, airborne and sink states each change scale,
  glow, tint and shadow. Airborne chips lift the sprite, shrink and offset the
  shadow, and land with a dust burst.
- Surface-correct roll feedback. Dust particles are tinted per surface (area
  dust colour on grass, sand, ice, water) and emitted at a surface-dependent
  rate; the rolling sound is retriggered at a surface-dependent interval with
  a surface-dependent playback rate and speed-scaled volume.
- Hazards. Water entry spawns a two-ring splash plus upward droplets; sand
  entry and chip landings spawn a plume. Water hazards are baked with animated
  specular ribbons, sand with wind ripples, ice with fracture lines.
- Celebrations escalate by result: bogey gets a ring, par a double ring,
  eagle adds a flare and a wide ring, an ace adds a six-point flare crown,
  with shake and hit-stop scaled to the tier.
- Screens are no longer cut. Hole change, course change and mode change run a
  five-band interlocking wipe with the state swap fired at the midpoint.
  Reduced motion skips the wipe and applies the swap immediately.
- All new effects are pooled (240 particles, 48 trail slots, 18 rings, 10
  flares, 5 emitters) and pre-warmed once offscreen during the loading screen
  before the first frame of play.
- `Graphics.arc` is not used for the power gauge any more; the sweep is
  hand-tessellated to the segments it actually needs.
- Render config is now `{ antialias: true, antialiasGL: false }`.

### Gameplay

- Hand-authored courses. Twelve authored layout templates (longrail, dogleg,
  hourglass, pinfield, spiral, island, switchback, crossyard, gauntlet,
  twinrooms, bankwall, chipover), each with a fixed tee, cup, wall skeleton,
  bumper set, hazard slots, boost pad, portal anchors and mover rails. Every
  one of the 90 holes (18 per theme) hand-picks a template, a mirror, a hazard
  fill per slot and a feature flag set, so no two holes in a course share a
  composition. The documented gimmick, par and hole-name tables from the AAA
  rebuild are unchanged and still drive each hole.
- The seeded generator is preserved and is now its own mode (SEED button,
  key 2), so both content pipelines ship side by side.
- Shot types. PUTT rolls, CHIP flies over walls, water and sand for a short
  hop and lands with dust, SPIN curves in flight and loses half its bite on
  every bank. The preview renders each honestly: a straight multi-bounce
  tracer for putt, a chord-marched curve for spin, an arc with a landing
  marker for chip. Tapping SPIN again flips the curve direction. Bound to the
  footer chips, keys Z/X/V, and gamepad B plus both shoulders.
- Moving hazards and portals. Movers are patrolling spiked hazards that
  transfer their own velocity into the bounce; portals teleport the ball
  between paired anchors preserving heading. Both are authored per hole and
  concentrate in the back nine and in Championship Crown.
- Trick Shot is now an authored twelve-challenge set with explicit objectives
  (double bank, four walls, over the wall, curve it in, through the gate, one
  and done, thread the gauntlet, ride the pad, dry line, into the spiral, chip
  and curve, the crown trick). Each objective is validated against per-hole
  shot telemetry at sink time and completion is persisted per challenge id.
  The objective is stated in a single thin top strip that fades after ~4s.
- Rival Pro. A real opponent: a rollout planner that samples aim angles and
  powers, runs every candidate through a reduced copy of the live physics
  (walls, gates, bumpers, surface drag, water, cup capture) and keeps the best
  line. Skill scales with course index and mode by widening the sample set,
  cutting the noise term and letting it stop early on a found sink. It is
  budgeted to three rollouts per frame so it never spikes a frame, plays the
  hole beside you, shows its stroke count in a corner chip, replays its shot
  as a translucent ghost ball, and its head-to-head record is banked.
- Career card. New CARD screen (key C, gamepad select) with per-course medals
  and bests, seeded best, trick-set progress, holes played, aces, eagles,
  birdies, pars, rival record, best bank run and portals used.
- Par and medal scoring is unchanged in its rules; hole results now name the
  result (HOLE IN ONE / EAGLE / BIRDIE / PAR) and carry a second line with the
  rival comparison or the challenge verdict.

### Bug fixes found while doing this

- SOFT LOCK: a ball nudged forever by a moving gate, or trapped where the
  above-1 restitution kept topping it back up, could hold a shot open
  indefinitely and the hole could never end. There is now a settle guard
  (0.8s under speed 34), a 15s per-shot cap and a 1400 speed clamp.
- Gates plus their travel could poke out through a rail; `clampGate` now
  keeps every gate and its full sweep inside the playfield, for authored and
  seeded holes alike.
- Keys are edge triggered through `kit.input.onKeyDown` instead of polled per
  frame. A tap shorter than one frame used to be dropped entirely.

### UI

- Text sizes raised across the HUD (buttons 26, par/pickups 26, strokes 34,
  hole 30, toast/tutorial 25, result copy 25, action 26) so the smallest
  readable string is about 14 CSS px on a 844x390 landscape phone. Touch
  targets are 96-110 logical px wide with hit bands of 80 (top) and 74
  (bottom) logical px, and an aim press within 78px of the ball always wins
  over a footer button so the bottom band can stay generous.
- Still one transient at a time: the corner chip, the tutorial strip and the
  challenge brief share one slot and never stack. Centre panels appear only at
  run boundaries, on pause, or on the career card.

### Save

- Version 1 -> 2 with a real migration. `tutorialSeen`, `unlocked`, `medals`
  and the tour/trick/championship bests are carried across and clamped; the
  new `seeded` best table, `career` counters and `challenges` map default. The
  kit's save gate had to be widened to admit the legacy v1 shape, otherwise
  the kit would hand back the fallback before migration could ever see it.
  A save that still fails validation after migration degrades to a fresh
  profile rather than throwing. Verified in browser: a planted v1 save
  survives a reload as v2 with medals and bests intact, and a truncated JSON
  blob comes back as a fresh valid profile with the game still running.
- `sw.js` VERSION is `2026-08-16-r2-01`; the precache list was checked
  file-by-file against disk (no missing entries) and the retired
  `range-seal.svg` was dropped from it.

### Verification

- `node --check game.js` and `node --check sw.js` pass.
- Headless Chrome (dpr 3 and dpr 1, 844x390 landscape) on a private port
  8347/8348, never a shared default port: zero console errors, zero failed
  requests, first frame renders, and the headline mechanic runs. A stroke is
  taken and counted, the ball rolls and banks, putt/chip/spin all take effect,
  the Crown hole 18 builds with a mover and a portal, the trick set builds
  with its challenge bound to the hole, the seeded generator still builds, the
  career card opens, hole complete advances through the wipe, and the final
  hole advances to the medal card with the best score banked.
- Payload 240KB total (limit 2.5MB), largest file `game.js` at 182KB (limit
  400KB).
- No frame-rate or feel numbers are reported: the box is contended, so every
  local timing figure this wave is void.

### Deferred

- Only PUTT power is affected by the power-ball pickup; chip and spin scale
  from the same pickup but their own multipliers are fixed. A per-shot-type
  pickup economy is a bigger design change than this lane should make.
- The Rival Pro's rollout ignores movers, portals and the gimmick field, so on
  those holes it plays a slightly conservative line. Adding them costs a
  meaningful rollout budget and wants a quiet box to tune.
- Scenery parallax is a ground-layer treatment, not a horizon: the board fills
  the frame at 1280x720, so there is no off-board space for a skyline without
  moving the play bounds, which would change the accepted feel.
- The resolution factor is computed once at boot. Rotating a desktop window to
  a much larger size does not re-bake at a higher density until reload.
