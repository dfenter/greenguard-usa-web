Tap an enemy to target; tap a hero to select; chips are basic / skill / ultimate.
Tap Ember, Tide, or Bloom to inspect that element; arrows select, 1-3 act, Enter continues.
Build SP with basics, spend SP on skills, charge ultimates, and break every weakness.

## AAA rebuild

Implemented: rebuilt Starweft in place with Phaser 3 from `/play/_shared/`,
GGKit as the only lifecycle/input/save/audio layer, code-generated original
hero and enemy sprite states, pooled effects, baked static board and HUD
textures, portrait safe-area layout, one transient at a time, reduced-motion
gating, live SP and ultimate meters, explicit turn order, target and hero
selection, elemental inspection, weakness breaks, ultimate beat, medals,
earned heroes, authored Trial Chamber unlocks, escalating Ascension gear
drops, generated MP3 buses, PWA manifest/icons, and a complete service-worker
precache.

| Campaign chapter | Site | Signature hazard | Authored encounters |
|---|---|---|---|
| 1. SunsPool Relay | Overworld node | Solar vents / Ember | Relay Verge, Copper Grass, Rift Warden |
| 2. MistFold Marsh | Overworld node | Brine mist / Tide | Glass Causeway, Silt Choir, Brine Engine |
| 3. Nightlace Dusk | Overworld node | Pollen dark / Bloom | Needle Run, Leeching Sky, Crown Approach |
| 4. Starweft Convergence | Finale arena | Phase tides / Ember | Convergence Core, three boss phases |

| Trial chamber | Site | Hazard | Unlock chain |
|---|---|---|---|
| Prism Gate | Trial Chamber I | Ember lanes | First gate |
| Undertow Vault | Trial Chamber II | Tide pull | Prism Gate |
| Bloom Reliquary | Trial Chamber III | Bloom surge | Undertow Vault |
| Convergence Echo | Trial Chamber IV | Phase tides | Bloom Reliquary |

| Repeatable site | Difficulty / reward |
|---|---|
| Ascension escalating arena | Floor scaling, rotating Ember/Tide/Bloom hazards, generous SP regen, guaranteed earned gear drop, SP +2 on clear |

Verification: `node --check` passes for every changed JavaScript file;
service-worker precache paths, payload/file budgets, required absolute engine
loads, UI-law guard patterns, probe switches, PWA files, boot harness, menu
hit regions, live SP update, and turn-order state all passed static or Node
harness checks.

Deferred: in-app browser screenshot QA and an uncontended 4x-throttle frame
capture could not run because no browser connector was available and the
sandbox refused local HTTP port binding. Final balance tuning across every
medal threshold remains a playtest pass.

## Fix round 1

Fixed:

- Replaced the battle-only runtime with a top-down Phaser world using authored tilemap data, camera follow, region traversal, collision, terrain transitions, props, animated water, and four-direction idle and walk player frames.
- Added persistent celestial-thread collection, count feedback, collection sparkle FX, authored constellation patterns, discovery, hint, validation, fail, solve, progress, and constellation glow FX.
- Added contiguous region gates, thread requirements, puzzle rewards, tangible Tide Step and Bloom Lantern abilities, atlas presentation, gate messaging, and region-unlock celebration FX.
- Added sentinel encounters with damage readouts, knockback, hit FX, leaf and footstep motion FX, hurt and danger cues, and persistent defeats.
- Added deep save validation and hydration, meaningful and periodic saves, media-query reduced-motion updates, gamepad polling with dead-zone and disconnect handling, complete keyboard navigation for menus, atlas, puzzles, and route actions, and staged first-minute onboarding.
- Added MP3-only exploration, dungeon, danger, pickup, door, secret, footstep, hurt, hit, UI, and constellation cue registrations using the existing local MP3 assets. Bumped the service-worker version.
- Added synchronized ARIA live status, labeled focusable accessibility controls, responsive viewport behavior, and explicit touch, keyboard, and gamepad instructions.
- Removed the legacy duplicate action branch, battle-only inspection and campaign chapter semantics, and the old hero, trial, ascension, and battle-loop assumptions.

Rejected as not applicable after the runtime replacement:

- The findings about campaign node assignment, element inspection persistence, trial and ascension keyboard entries, and locked chapter tab clamping referred to systems removed from the requested exploration loop. Their replacements are validated region gates, atlas selection, constellation hints, and explicit locked-region explanations.

Validation:

- `node --check game.js` and `node --check sw.js` pass.
- Payload is 152347 bytes and the largest file is below 400 KB. All registered audio paths are local MP3 files. Engine loads remain absolute from `/play/_shared/`.

## Retina pass 2026-08-16

- Before ratio: 1.00x static FIT baseline from the 390x844 design backing store. A live pre-pass canvas readback was unavailable in this sandbox.
- After ratio: 3.00x target by factor math at emulated DPR 3, producing a 1170x2532 backing store for the 390x844 design viewport.
- Recipe: Phaser `Scale.FIT`, design coordinates preserved, scale dimensions multiplied by `GGKit.hiDpi.factor(390, 844)`, shared `GGKit.renderDefaults` merged, and zoom applied in the scene `create()`. World bounds and the fixed UI camera coordinates remain in design units. Phaser text uses the same factor.
- Factor cap: none beyond GGKit's default clamp to [1, 3].
- Could not do: live `canvas.width / getBoundingClientRect().width` readback, gameplay screenshot, and `retina_audit.mjs` acceptance because no browser surface was available and private port binding was denied.
