# Gravemarch
Controls: tap RIFT PULSE / GRAVEHOOK, swipe the arena to dodge; keyboard J/K + arrow keys.
Loop: auto-battle 30 floors, loot auto-equips upgrades, gear-score doors gate depth, bosses guard floors 10/20/30.
Death restarts the current floor with gear kept; depth and gear persist locally. The field manual posts drop rates and all economy math.

## AAA rebuild

Implemented:

- Rebuilt Gravemarch in Phaser 3.87 with GGKit as the only lifecycle, input, save, audio, reduced-motion, and PWA layer. The simulation runs at a fixed 60 Hz with a four-step frame cap and slows under load instead of skipping sim time.
- Added the gauntlet and Boss Rush modes. Boss Rush is hand-authored around Floors 10, 20, and 30. Death restarts the current floor with equipped gear retained. Depth, gear, medals, streak, and best times persist through GGKit saves.
- Added pooled enemy, hazard, particle, and damage-number records with separate Phaser view pools. The player has idle, attack, hurt, and dodge frames. Enemy families and wardens have the same authored state vocabulary.
- Added auto-battle targeting, RIFT PULSE, GRAVEHOOK, swipe and arrow-key dodge, boss attack telegraphs, invulnerability windows, phase transitions, hit sparks, crit bursts, boss shake, hit-stop, and GGKit SFX buses for pulse, hook, hit, and roar.
- Added one-at-a-time corner loot chips, a thin fading coach strip, boundary-only clear/death/medal panels, legible in-world gear doors, a portrait badge, and a field manual with drop rates and economy math. Static board chrome and rings are baked CanvasTextures rather than live large Graphics.
- Added the required absolute shared-script paths, base URL, portrait viewport metadata, manifest, generated original icons, MP3-only procedural SFX, service worker, and per-file license ledger. No cross-title assets or network URLs are used.

Floor and gear tables:

| Floors | Band identity | Roster | Hazard mix | Boss / gate |
|---|---|---|---|---|
| 01-10 | Sunken Crypt | Shade, Bone Crawler, Bell Ringer | Rune, crack | Drowned Bell on 10 |
| 11-20 | Bone Causeway | Bone Crawler, Lancer, Bone Archer | Spikes, lane | Causeway King on 20 |
| 21-29 | Ashen Vault | Ember Wisp, Ash Brute, Cinder Knight | Ember, crack | Ashen Warden pacing into 30 |
| 30 | Gravemarch Throne | Cinder Knight, Throne Sentinel, Ember Wisp | Ember, cross | Throne Keeper on 30 |

| Rule | Math / table |
|---|---|
| Door | `30 + (floor - 1) × 8` gear score; the next-door requirement and carried score stay visible together |
| Rarity | Worn 52%, Etched 30%, Radiant 14%, Singular 4% |
| Loot | Minions roll at 62%, late-band minions at 76%, normal clear caches guarantee 1 roll, late-band clears guarantee 2, bosses guarantee 3; slot odds are 1 / 1 / 1 |
| Auto DPS | `weapon power × (1 + charm power × 0.035)` |
| Skills | RIFT PULSE `2.65 × DPS / 7s`; GRAVEHOOK `4.2 × DPS / 11s`; armor adds `7 × armor power` HP; charm adds `2 × charm power` HP |
| Medals | Bronze / Silver / Gold thresholds are depth `10 / 20 / 30`, no-death streak `3 / 8 / 15`, and gear score `100 / 190 / 280`; band access chains through Floors 10 and 20 |

Deferred:

- Live browser boot, screenshot review, touch probe, and uncontended 4x-throttle frame capture could not run because this environment exposed no browser backend and refused a local HTTP server bind. `node --check game.js`, `node --check sw.js`, shared `ggkit.js` syntax, manifest parsing, service-worker file existence, MP3 extension, payload, and diff checks passed.

## Fix round 1

All listed findings were accurate. No finding was rejected.

Fixed CRITICAL findings:

- Added authored 11 by 16 room tilemaps for all four bands, four-direction movement, solid wall collision, a small camera follow offset, a sealed entrance, torches, chambers, altars, and room props.
- Added persistent relic entities, pickup state, a relic journal, bounded inventory, relic bonuses, and a visible field-manual inventory view.
- Added burial chamber state, glyph puzzles with deterministic validation and hint text, treasure unlock state, relic reveal, and floor clear gating behind the chamber treasure path.
- Replaced the checkerboard arena presentation with authored floor and wall tiles, chamber, altar, entrance, torch, light, relic, shadow, and band-specific room composition textures.

Fixed MAJOR findings:

- Added distinct idle, walk, attack, hurt, dodge, and spirit float frames, driven by actual movement and combat state.
- Added radial torch and hero lighting, distinct warning textures for arrows, slams, spikes, lanes, cracks, ember fields, and phases, plus spark and dot particle families and pickup, heal, puzzle, and unlock celebrations.
- Added two preloaded music stems and ten additional MP3 cues. All fourteen title cues are registered through GGKit audio and all audio remains MP3 only.
- Replaced the prose-only coach strip with action-gated first-run onboarding for movement, dodge, pulse, hook, spirit combat, chamber interaction, glyph solving, and relic pickup. The tutorial has no timer fallback and persists completion.
- Added distinct enemy behavior for ranged archers, charging lancers, summoning bell ringers, area-denial wisps, slam brutes, guarding knights, melee crawlers, and telegraphing bosses.
- Added a one-use restorative altar per room and contextual chamber and relic hints.
- Changed loot handling to persist every drop in inventory and compare slot impact across score and power before equipping, with current gear retained when the new item is weaker.
- Locked Boss Rush behind Floor 10 gauntlet progress, carried one rush timer across Floors 10, 20, and 30, and isolated its clears and medals from gauntlet depth, streak, and medals.
- Replaced shallow save checks with strict version 3 validation for every scalar, nested object, known key, item, inventory entry, relic id, medal, and Boss Rush field. Version 2 is the only migrated legacy schema.
- Guarded death, damage, enemy stepping, hazard stepping, and clear finalization so a killing frame cannot also clear the floor or finalize twice.
- Added gamepad discovery, dead-zone normalization, button edge handling, disconnect reset, pause-aware polling, and movement merging with GGKit keyboard input.
- Removed raw window pointer listeners and direct pointer-map writes. Touch and mouse gestures now consume GGKit pointer identity, with state cleanup supplied by GGKit restart, blur, visibility, and cancellation handling plus a stale-pointer safety expiry.

Fixed MINOR findings:

- A fresh load now starts at the persisted gauntlet depth, while Boss Rush remains explicitly separate and gated.
- Boss Rush best time uses one carried timer across all three wardens.
- Best gauntlet and Boss Rush times are surfaced on the clear panel and field manual.

Verification: `node --check game.js`, `node --check sw.js`, `git diff --check`, MP3 codec checks, asset path checks, and service-worker cache coverage pass. The shipped title payload, excluding the notes and license ledger, is 175,633 bytes, the largest shipped file is 92,832 bytes, and the service worker cache version is `aaa-2026-08-10-v2`. A live browser or 4x-throttle median capture was unavailable in this environment.

## Retina pass 2026-08-16

- Measured before/after canvas-to-CSS ratio: no per-title live measurement was available. The fleet baseline measured 1.00x for 62 titles and 1.10x to 2.46x for the remainder. The after audit was blocked when the prescribed runner could not bind its private port (`listen EPERM`), and no browser backend was available. Static target at DPR3 is 3.00x.
- Recipe: `GGKit.hiDpi.factor(390, 844)`, dense FIT scale dimensions, `GGKit.renderDefaults`, camera zoom in the scene create method, matching Text resolution, and dense `GGKit.hiDpi.canvas()` bakes with design-size display sizing.
- Factor cap: none beyond GGKit's default [1, 3] clamp.
- Could not capture the required gameplay screenshot, backing-store ratio, or gameplay color metrics in this sandbox. `node --check game.js` passes.
