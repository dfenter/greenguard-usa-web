## AAA build

Implemented in `play/duelsteel/` only.

### Implemented

- Landscape Three.js r160 title using the `three` import map from `/play/_shared/`, with no network or GGRacer dependency.
- GGKit is the sole lifecycle, input, save, audio, pause, orientation, PWA, settings, and juice owner.
- Fixed 60 Hz simulation with bounded accumulator, render interpolation, reduced-motion gate, pooled ribbon trails, pooled sparks, and impact hit-stop.
- Boot fallback and live scene share `window.__ds.state`. Supported switches are `forceMatch`, `forceStage`, `forceWin`, and `aiVsAi`.
- Mobile controls: eight-way virtual stick, sidestep ring read, H horizontal, V vertical, K kick/close throw, and G guard. Buttons are 56 to 64 CSS px.
- Combat: buffered touch-friendly input, startup/active/recovery timing, guard with chip-free blocks, 0.15 second Guard Impact, throws against guard, hit reactions, stagger, knockback, ring-outs, best-of-three rounds, 60 second timer, victory fall, and boundary staging.
- Modes: Arcade ladder with seven challengers plus boss, VS AI setup, Survival with health carry and generous between-duel regeneration.
- Progression: difficulty medals, fighter unlock chain, alternate palette flag, and late-stage unlock chain through GGKit save validation.
- First-run tutorial is one thin top strip. Active play keeps only compact health bars, round pips, timer, stage chip, and controls visible.
- Two synthesized local MP3 music stems and twelve synthesized local MP3 SFX are registered through GGKit. Total title payload is about 188 KB. Largest file is below 57 KB.

### Fighter table

| Key | Fighter | Weapon | Silhouette / play identity | Unlock |
|---|---|---|---|---|
| `longsword` | Auren Vale | Longsword | Balanced, gold trim, medium reach | Start |
| `glaive` | Mira Sorn | Glaive | Tall polearm, long reach, keep-away | Start |
| `daggers` | Nox Iri | Twin Daggers | Small masked speed fighter, fast strings | Start |
| `axe` | Brakka Ohn | War Axe | Broad shoulders, high knockback | Start |
| `rapier` | Ilyra Quell | Rapier | Narrow counter silhouette, fast poke | Start |
| `flail` | Ruum Kess | Flail | Weighted cloak, unblockable arc profile | Start |
| `staff` | Tovan Reed | Staff | Tall guard, space-control strings | Arcade progress 2 |
| `greatsword` | Veyra Dusk | Greatsword | Massive frame, slow heavy impact | Arcade progress 4 |

### Shared frame-data table

Values are startup / active / recovery frames at 60 Hz. `H`, `V`, and `K` each have three or more moves in `FRAME_DATA` in `game.js`; the row below shows the first three horizontal and vertical entries plus the kick entry. Damage and range are stored beside the same entries.

| Fighter key | H1 / H2 / H3 | V1 / V2 / V3 | K |
|---|---|---|---|
| `longsword` | 10/7/18, 11/7/20, 8/8/19 | 12/7/23, 14/7/25, 17/10/29 | 6/6/17 |
| `glaive` | 12/8/20, 13/8/23, 14/10/25 | 16/8/25, 17/9/28, 20/11/31 | 6/6/18 |
| `daggers` | 5/6/12, 5/6/12, 6/7/14 | 6/6/13, 7/6/15, 9/7/17 | 5/6/13 |
| `axe` | 15/10/29, 17/10/30, 19/11/35 | 16/10/30, 20/10/33, 24/12/38 | 7/6/20 |
| `rapier` | 7/6/16, 7/6/17, 8/7/19 | 7/6/16, 8/7/18, 11/7/20 | 5/6/13 |
| `flail` | 12/11/23, 13/12/24, 16/13/26 | 15/10/26, 18/11/30, 21/12/34 | 7/8/20 |
| `staff` | 11/8/20, 12/9/22, 13/10/24 | 13/8/23, 15/10/25, 18/11/29 | 5/6/14 |
| `greatsword` | 18/11/36, 20/12/38, 23/13/43 | 20/11/38, 24/12/43, 28/14/48 | 8/6/23 |

Combo paths are 3 to 4 hits per fighter, including `H-H-V`, `V-H-V`, `H-V-K`, and fighter-specific variants. Touch input can buffer up to two follow-up actions during the active string.

### Stage table

| Stage | Geometry / identity | Ring-out layout | Dressing |
|---|---|---|---|
| Sunken Temple | Rectangular raised temple | All edges open | Columns, lintel, half arch, crowd silhouettes |
| Skybridge of Vey | Long narrow bridge | Two long edges | Repeated pylons and side rails |
| Iron Coliseum | Circular walled arena | None, pure damage | Ring wall, 12 iron posts, crowd silhouettes |
| Cliff Shrine | Shrine platform | One deadly edge, wall opposite | Shrine lintel, twin posts, back wall |
| Frozen Lake | Large octagonal ice platform | Octagon perimeter | Ice shards and pale fissure marks |
| Throne Hall | Hall platform with cover | Open perimeter | Four pillars, raised throne, gold crest |

### Deferred

- A browser screenshot and 4x-throttle median frame capture could not run in this environment. The local HTTP server bind was denied by the sandbox and no in-app browser instance was available.
- No motion-captured animation, authored texture atlas, or external orchestral recording was added. The shipped art and audio are intentionally procedural, local, and budget-safe for this first original title brief.
- AI matchup tuning, exact collision feel across physical devices, and final audio mastering still need a device playtest pass.

### Verification

- `node --check play/duelsteel/game.js` passed.
- `node --check play/duelsteel/sw.js` passed.
- Three.js r160 import smoke test passed, including `CapsuleGeometry` and `SRGBColorSpace` availability.
- Service-worker precache entries were kept to real files in this directory plus the required shared GGKit and Three.js files.

## Fix round 1

### Fixed

- CRITICAL fighter presentation: replaced the box-only weapon profiles with beveled authored weapon silhouettes, layered armor details, generated animation clips, and distinct weapon parts.
- CRITICAL stage presentation: added per-stage procedural surface patterns, layered backdrops, cast shadows, atmospheric fog, spring camera framing, and impact staging.
- MAJOR touch edges: button click edges now enter a bounded queue and are consumed once by the fixed-step simulation. Held state and pointer identity remain GGKit-owned.
- MAJOR combat state: attacks commit movement and evasive flags, hits clear victim attack queues and evasive flags, and guard impact uses explicit outcomes.
- MAJOR trades: hit events resolve after both fighters update, so simultaneous lethal hits become an explicit double-KO round draw.
- MAJOR ring-out reset: resetRound now restores complete root rotation, animation state, flags, positions, and trail origins.
- MAJOR Frozen Lake: the rendered lake and collision use the same scaled octagon vertices with fighter-radius and epsilon handling.
- MAJOR AI: added resettable approach, guard, evade, attack, and recovery states with one-shot action edges and a ladder-position difficulty ramp.
- MAJOR save safety: added strict version, type, range, count, required-unlock, and migration validation for GGKit saves.
- MAJOR content curve: added ten authored arcade encounters with stage variants, progression unlocks, and ladder-pressure ramping.
- MAJOR survival promise: added three visible healing orb choices, consumption, carry-over health, and a rendered between-duel choice state.
- MAJOR transient UI: coach and toast now share one queued, edge-anchored transient strip.
- MAJOR phone UX: replaced cryptic control labels with iconized buttons and accessible labels, added interactive first-run coaching, a 44px pause/settings button, fullscreen affordances, and horizontal safe-area padding.
- MAJOR loader: boot now uses GGKit loader show, staged progress, audio preload, and hide calls. The indeterminate CSS loader animation was removed.
- MAJOR PWA icons: added valid 192px and 512px PNG icons under the game-owned assets directory and precached them.
- MAJOR orientation and fullscreen: removed the title CSS rotate overlay and routed fullscreen through GGKit.
- MAJOR effects: reset trails at fighter weapon tips and added a second pooled textured ember particle system.
- MAJOR camera juice: applied GGKit shake offsets, spring follow framing, stage framing, and reduced-motion gating to camera, pose, trail, spark, ember, and CSS motion.
- MAJOR licensing and static evidence: added LICENSES.md plus before-static.md and after-static.md evidence records under review_evidence/aaa/duelsteel/.
- MINOR audio settings: added persistent GGKit music and effects volume sliders to the settings shell.
- MINOR reduced motion: gated procedural pose, trail, particle, fall, and camera animation through the GGKit motion state.

## Retina pass 2026-08-16

- Before ratio: 1.50x at DPR 3, from the renderer's hard cap. After ratio: 3.00x is configured by `GGKit.hiDpi.three(renderer)`; a live canvas measurement was unavailable because this sandbox refused private HTTP listeners and had no browser target.
- Recipe: called `GGKit.hiDpi.three(renderer)` immediately after `new THREE.WebGLRenderer`. No render targets, post-processing passes, or composers were present. The 128px stage-pattern and 32px ember canvas textures now use `GGKit.hiDpi.canvas()` so they are baked at device density.
- Factor cap: none beyond GGKit's standard maximum of 3. No title-specific cap was needed.
- Static verification: `node --check game.js` and `git diff --check` passed. Gameplay screenshot, `canvas.width / getBoundingClientRect().width >= 2.85`, and live layout confirmation remain unmeasured in this environment.

### Rejected or unavailable

- MAJOR browser and performance verification: the deployment, browser capture, console/request audit, and 4x-throttle median could not be run because this fix round explicitly forbids deployment and no browser session is available. The static evidence and local syntax, asset, manifest, service-worker, payload, file-size, and MP3-only checks were completed instead.
