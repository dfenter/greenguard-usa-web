## AAA build

Implemented:

- Original Buzz Grand Prix mascot racer shell with landscape mobile layout, boot fallback, PWA manifest, icons, favicon, versioned service worker, local synthesized MP3 audio, and no CDN or network asset dependency.
- GGKit is the sole lifecycle, input, save, audio, pause, orientation, settings, reduced-motion, and PWA owner. The title uses a fixed 60 Hz stepped simulation with a four-step catch-up cap.
- GGRacer is used through the shared engine contract. The title adds articulated insect mascot rigs over GT-bar karts, authored backyard dressing, pooled item boxes, projectile effects, hit bursts, drift sparks, minimap, spring chase camera feed, and compact UI-law HUD.
- Mechanics include hop-into-drift, two spark tiers, mini-turbo release, jump trick boosts, slipstream draft, seven AI rivals, personality-tinted aggression, fair rubber-band speed, impacts that spin without full stops, dense respawning item rows, shortcut and hazard data, and reduced-motion-gated bursts.
- Grand Prix, Time Trial with saved ghost replay, Balloon Battle with three balloons and last-bug-buzzing rules, 50cc, 100cc, 150cc unlock, bronze/silver/gold medals, cup progression, two hidden racers, four kart skins, and the thin tutorial strip are live.

Racer table:

| Racer | Type | Personality |
| --- | --- | --- |
| Zip | dragonfly | speed |
| Bumble | bee | balanced |
| Stag | stag beetle | heavyweight |
| Glow | firefly | night specialist |
| Skeet | mosquito | acceleration |
| Madam Web | spider | handling |
| Tick-Tock | tick | tiny nimble |
| Duke Dung | dung beetle | tank |
| Moss Mantis | mantis | hidden unlock |
| Bramble Bug | thorn bug | hidden unlock |

Item table:

| Item | Behavior |
| --- | --- |
| Acorn Shot | straight pooled projectile |
| Homing Hornet | seeks the next rival |
| Sap Slick | drops a rear hazard |
| Bubble Shield | blocks one hit |
| Nectar Boost | speed burst |
| Swarm Surge | rare last-place strike against karts ahead |
| Pebble Triple | three orbiting pooled shots |

Cup table:

| Cup | Tracks |
| --- | --- |
| Sprout Cup | Garden Sprint, Picnic Chicane, Compost Canyon, Gutter Run |
| Backyard Cup | Toolshed Twilight, Pond Skim, Anthill Spiral, Queen's Throne |
| Moonlit Cup | Firefly Loop, Hosepipe Heights, Seed Packet Speedway, Wheelbarrow Wilds |

Track table:

| Track | Identity and authored beats |
| --- | --- |
| Garden Sprint | flower rows, sprinkler arcs, rose-bed shortcut |
| Picnic Chicane | plate rows, watermelon bridge, blanket bypass |
| Compost Canyon | compost walls, leaf chute, elevation drop |
| Gutter Run | half-pipe banks, downspout dive, drain lip |
| Toolshed Twilight | emissive tools, lantern lane, toolbox shortcut |
| Pond Skim | lilypad split, cattail splash, pond-edge jump |
| Anthill Spiral | elevation ladder, anthill tunnel, rock set piece |
| Queen's Throne | rose throne finale, crown gate, hedge cut |
| Firefly Loop | night lantern meadow, Glow lane, moon mower |
| Hosepipe Heights | hosepipe corkscrew, rainbow jump, nozzle drop |
| Seed Packet Speedway | seed packet boards, sunflower tunnel, seedling lane |
| Wheelbarrow Wilds | wheelbarrow rollers, glove chicane, dirt-bank shortcut |
| Lily Pad Lockup | authored Balloon Battle arena |
| Toolshed Tangle | authored Balloon Battle arena |

Verification:

- `node --check game.js` and `node --check sw.js` pass.
- All 14 track JSON files parse and meet the GGRacer control-point, item-row, and jump-ramp checks.
- Service worker precache resolves 38 real title and shared files.
- 17 local MP3 files are valid. Title payload is 665,952 bytes and largest title-owned file is 192,514 bytes.
- Browser smoke test and the 4x-throttle median could not run because no browser instance was available and the sandbox denied a local HTTP bind.

Deferred:

- Live screenshot review, touch-device feel tuning, and measured 4x-throttle median capture require the browser and gate harness environment.

## Retina pass 2026-08-16

- Before ratio: 1.50x for the main GGRacer canvas from the shared engine cap. The fallback and HUD canvases were capped at 2.00x.
- After ratio: 3.00x configured at DPR 3 with `GGKit.hiDpi.three(racer.world.renderer)` followed by `racer.world.resize()`. Live `canvas.width / getBoundingClientRect().width` measurement was unavailable because Chrome aborted in this sandbox and the private HTTP bind was denied.
- Recipe: native Three renderer density and 3x fallback and HUD canvases. This title was audited as Three.js, not Phaser, and no Phaser resolution setting was introduced. No factor cap beyond GGKit's required maximum of 3.
- Audit: no render target, composer, or post-processing pass exists in the racer path. Shared racer texture bakes were identified but could not be changed because this lane was constrained from writing `play/_shared/`.

## Release gate repair

2026-08-16, mobile release gate lane.

### PWA installability

The manifest carried a single SVG icon with `sizes: "any"`, which satisfies no
explicit 192x192 or 512x512 requirement, so the title was not installable.
Rasterised the existing `icon.svg` through headless Chrome at 192 and 512 into
`icon192.png` / `icon512.png` and declared both. `icon.svg` is retained as an
`any` entry, so the artwork is unchanged and there is now a real PNG at each
required size.

Verified with `node release_gate.mjs http://localhost:8347 1 <slug>` from
/Users/lucille/ue-port-studio/aaa/harness, serially at concurrency 1, against
`python3 -m http.server 8347 --directory /Users/lucille/greenguard-usa-web`.

Gate verdict: **READY** (all checks pass).
