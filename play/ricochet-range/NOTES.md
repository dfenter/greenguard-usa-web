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
