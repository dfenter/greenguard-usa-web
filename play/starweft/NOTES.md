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


## Blank frame repair

Symptom: at CSS 390x844 / deviceScaleFactor 3 the title booted clean, the render loop
advanced, the backing store measured 3x, and the frame was blank.

### Root cause

The retina conversion raised the backing store to design x factor and applied
`cameras.main.setZoom(factor)`, but a zoomed Phaser camera transforms about its
ORIGIN, which defaults to the centre of the viewport. With scroll 0 a design-space
point x therefore lands at `zoom*x - (width/2)*(zoom-1)`, i.e. the whole design box
sits one and a bit screens to the left of and above the viewport. The loop runs, the
scene draws, nothing is on screen, and there is no error anywhere.

This title is repaired with `cameras.main.setOrigin(0, 0)` alongside the zoom rather
than the fleet's `centerOn(DESIGN_W/2, DESIGN_H/2)`. Both put the design box back on
screen, but origin (0,0) additionally leaves scroll 0 meaning "design origin", so any
absolute `setScroll()` the title already performs (screen shake, world scrolling) and
any `setScrollFactor(0)` HUD stay correct in design pixels with no compensation. See
the per-title cause below for why that mattered here.

This title uses its camera as a real world camera, so three things were wrong at once:
- `setBounds(0, 0, WORLD_W, WORLD_H)` and `startFollow(playerSprite, true, 0.12, 0.12)`.
  Phaser computes BOTH from a centred origin (follow scroll is `target.x - width/2`,
  the clamp range is `(displayWidth - width) / 2`), so under zoom f they place the view
  roughly f-1 screens away from the player.
- The whole HUD is `setScrollFactor(0)` (`uiG` plus every layer built in
  `createTextLayers`). A scroll-factor-0 object under a centred zoom renders at
  `zoom*x - (width/2)*(zoom-1)`, i.e. completely off screen, which a `centerOn` cannot
  fix because centring is exactly what breaks it.
- `hitTest()` reads `cameras.main.scrollX + x` to turn a tap into a world point, which
  is only true if scroll is expressed in design pixels from the design origin.
- Repair: `setOrigin(0, 0)`, and `setBounds` + `startFollow` replaced by a
  `followCamera()` method carrying the same 0.12 lerp and the same world clamp in
  design pixels, called every frame and immediately on scene change. Movement, world
  size, tap-to-move targeting and the HUD are all unchanged in behaviour.

### Measured, by me, on a real gameplay frame

Release gate run serially (concurrency 1) against a local static server:
`node release_gate.mjs http://localhost:<port> 1 starweft`, headless Chrome,
390x844 at deviceScaleFactor 3, best of four post-interaction frames.

| | distinct colours (8-bit) | flattest colour share | backing/CSS ratio | gate |
|---|---|---|---|---|
| before | 648 | 95.9% | 3x | HOLD (art) |
| after | 2121 | 43.1% | 3x | READY (all checks pass) |

`node --check` clean on every file touched. No gameplay, balance, content or art
direction was changed.
