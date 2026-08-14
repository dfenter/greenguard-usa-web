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
