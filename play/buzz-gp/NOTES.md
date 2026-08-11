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
