# Parlor Pop

Controls: swipe (or tap tile, then tap a neighbour) to swap. Arrow keys move the cursor, Enter selects/swaps, Esc backs out, 1/2/3 arm a booster, R restarts.
Loop: match 3+ tiles to hit each level's goals (collect a colour, smash plated floor, drop keys to the floor) before the moves run out. Crates and ivy break when a match lands beside them; ivy spreads if you ignore it.
Out of moves = instant retry, no lives and no waiting. Stars from finishing with moves to spare fund three restored parlor rooms; each slot offers two furnishings and the choice persists.
Boosters (hammer / row rocket / shuffle) are earned only by 3-star finishes and never cost money; every level is clearable without them.
Build check: `node verify.js` replays each level 200x with a greedy solver; `--fix` raises move budgets until all clear >=90%.

## AAA rebuild

### Implemented

- Rebuilt the archived canvas prototype as a Phaser 3 portrait title using `/play/_shared/phaser.min.js` and GGKit for lifecycle pause/resume, pointer identity, save validation, audio buses, settings, reduced-motion gating, PWA registration, and restart clearing.
- Added crisp tap-neighbor and swipe swaps, invalid swap nudge plus coach strip, keyboard controls, colorblind-safe tile symbols, plate crack stages, visible key-drop paths, crate and ivy feedback, ivy spread threat counts, generous extra-move badges, color-bomb pickups, hammer, row rocket, and shuffle payoff FX.
- Added persistent campaign stars, 3-star booster awards, level unlock chain, four authored restoration rooms, furnishing choices, daily challenge, booster-free mastery, clear/retry cards, star banners, and room reveal transitions.
- Added procedural title art, icons, particles, board chrome textures, original MP3 cues, manifest, and a full existing-file-only service-worker precache.

### Room table

| Room | Levels | Goal grammar | Restored reveal |
| --- | --- | --- | --- |
| Entry Parlor | entry-01 to entry-06 | Color collect, then crate and ivy neighbor breaks | Morning light returns to the front parlor |
| Plated Dining Hall | dining-01 to dining-06 | Crack plated floor, then drop keys | Long table and chandelier return |
| Ivy Conservatory | conservatory-01 to conservatory-06 | Prune spreading ivy while keys drop | Greenhouse breathes against the glass |
| Grand Hall | grand-01 to grand-06 | Combined color, plates, keys, crates, and ivy | Full-house opening night |

### Level table

Goals use `C#` for color collect, `P` for plated floor, and `K` for key drop. `+2` is an extra-move pickup and `CB` is a color-bomb pickup count.

| ID | Name | Moves | Goals | Layout |
| --- | --- | ---: | --- | --- |
| entry-01 | Open the Drapes | 30 | C0 x20 | +2 x2, CB x1 |
| entry-02 | Rose and Sun | 34 | C0 x18, C1 x18 | +2 x2, CB x1 |
| entry-03 | Loose Rosettes | 35 | C2 x22 | 5 crates, +2 x2, CB x1 |
| entry-04 | A Clear Path | 38 | C3 x20, C4 x16 | 4 crates, 2 ivy, +2 x2, CB x2 |
| entry-05 | First Spark | 40 | C5 x22 | 4 crates, 3 ivy, +2 x3, CB x1 |
| entry-06 | Welcome Home | 44 | C0 x16, C2 x16, C5 x16 | 5 crates, 3 ivy, +2 x3, CB x2 |
| dining-01 | Cracked Enamel | 38 | P | 10 plates, 2 double plates, +2 x2, CB x1 |
| dining-02 | Service Lift | 42 | P, K1 | 10 plates, 3 crates, K1, +2 x3, CB x1 |
| dining-03 | The Long Table | 44 | C1 x20, P | 12 plates, 4 crates, +2 x3, CB x2 |
| dining-04 | Brass Keyway | 71 | K2 | 2 keys, 5 crates, +2 x3, CB x2 |
| dining-05 | Polish the Floor | 50 | P, C3 x18 | 14 plates, 5 crates, 2 ivy, +2 x3, CB x2 |
| dining-06 | Dinner Is Served | 72 | P, K1 | 10 plates, 4 crates, 1 ivy, +2 x4, CB x2 |
| conservatory-01 | First Tendrils | 42 | C2 x22 | 5 ivy, 1 crate, +2 x3, CB x1 |
| conservatory-02 | Glasshouse Key | 51 | K1, C4 x18 | 5 ivy, 3 crates, +2 x3, CB x2 |
| conservatory-03 | Prune and Drop | 51 | C0 x18, K2 | 7 ivy, 3 crates, +2 x4, CB x2 |
| conservatory-04 | Moss on Tile | 52 | P, C5 x18 | 10 plates, 4 crates, 7 ivy, +2 x4, CB x2 |
| conservatory-05 | Sun Through Leaves | 73 | C1 x14, K1 | 7 ivy, 4 crates, +2 x4, CB x3 |
| conservatory-06 | The Living Room | 73 | C2 x12, P, K1 | 6 plates, 4 crates, 7 ivy, +2 x4, CB x3 |
| grand-01 | Velvet Threshold | 48 | C0 x20, P | 10 plates, 4 crates, 3 ivy, +2 x3, CB x2 |
| grand-02 | Three Flights | 73 | K1, C4 x14 | 5 crates, 4 ivy, +2 x4, CB x2 |
| grand-03 | Ivy Under Glass | 74 | P, K1 | 6 plates, 4 crates, 6 ivy, +2 x4, CB x3 |
| grand-04 | Gallery Lights | 58 | C1 x20, C5 x18, P | 12 plates, 5 crates, 6 ivy, +2 x4, CB x3 |
| grand-05 | Opening Night | 69 | C2 x16, P, K1 | 14 plates, 6 crates, 7 ivy, +2 x5, CB x3 |
| grand-06 | The Grand Reopening | 72 | C0 x18, P, K2 | 16 plates, 6 crates, 8 ivy, +2 x5, CB x4 |

### Verification

- `node verify.js`: PASS, all 24 levels at or above 90% clear rate over 200 greedy replays.
- `node --check`: PASS for `levels.js`, `engine.js`, `meta.js`, `audio.js`, `game.js`, `verify.js`, and `sw.js`.
- Manifest icon and service-worker precache audit: PASS, 23 existing URLs. Payload is 188,416 bytes.

### Deferred

- Real browser boot and visual interaction QA could not run because the in-app browser runtime was unavailable in this environment. The runtime parse, engine solver, manifest, and service-worker checks are complete.

## Fix round 1

Fixed:

- Critical goal target: collect goals now show the target color name, matching symbol, color token, and progress.
- Critical room restoration: atelier and reveal views now render authored procedural room interiors with visible room-specific furnishing variants.
- Major keyboard and gamepad input: arrow keys, Enter, Escape, D-pad, and A/B controls now operate a visible board cursor through the paused input path.
- Major onboarding: the first campaign lesson now teaches match 3+, neighbor swapping, and goal reading, and completes only after a resolved match.
- Major resolve animation: clear sprites use event IDs, while moved and spawned pieces animate through their source and landing positions.
- Major particle floor: pop, cascade, and reward effects now use separate bounded pools.
- Major GGKit juice and reduced motion: `kit.juice.frame()` drives camera juice, and pop, movement, banner, ring, particle, and reveal motion respect the accessibility state.
- Major audio: board, resolve, and meta music states plus cascade and combo cues are routed through GGKit audio buses.
- Major save validation: unknown level, mastery, furnishing, daily, top-level, and daily-record keys are rejected before loading.
- Major score feedback: live score, combo, score ticks, and reward feedback are visible during play.
- Major tile coding: normal tile families now have distinct silhouettes, larger symbols, and material edges.
- Minor drag preview: legal neighbor swaps use a legal ghost and all other drag targets use an invalid hatch.
- Minor hammer refund: invalid targets are rejected before spending, with a persisted refund fallback.
- Minor touch target: board hit zones are 44px while the authored board artwork remains unchanged.

Rejected: None. All listed findings were addressed.

Verification: `node verify.js` passes all 24 levels at or above 90%; 100 fresh states per level preserve authored invariants; all changed JavaScript files pass `node --check`; payload is 157,769 bytes and the largest file is 65,061 bytes; service-worker version is `2026.08.10.3`.

## Boot repair

- Fixed the Phaser first-frame path: title and play scenes now draw from the Scene Systems `prerender` hook, before the camera renders the display list; no unsupported later event name is used.
- Removed the custom `render()` lifecycle collision, made boot paint a visible canvas frame, validated generated canvas textures before reuse, and forced active cameras visible.
- `node verify.js` passes all 24 levels; `node --check` passes for every JavaScript file in this directory.
- Service-worker version bumped to `2026.08.10.3`.

## UI declutter

- Cut active-play center banners, floating score/key copy, the persistent board hint, level/room flavor labels, redundant SCORE/MOVES words, booster words, and the always-on booster note.
- Collapsed the live HUD into icon-led score, moves, goal-progress, and ivy meters; booster controls now show only their action icon and count, with touch targets preserved.
- Moved in-play events to one right-edge chip with a 1.0s hold; tutorial and input guidance use one 30px top strip with a 2.8s hold/fade. Notices queue one at a time, and reduced-motion gating remains intact.
- Kept the larger center banner only for run-boundary results and room restoration.

## Retina pass 2026-08-16

- Audit profile: CSS viewport 390x844 at DPR 3. Measured pre-pass backing-store ratio: 1.00x. FIT scale math after the pass measures 1170x2532 against the 390x844 CSS canvas, a 3.00x ratio.
- Recipe: `GGKit.hiDpi.factor(390, 844)`, dense FIT scale dimensions, `GGKit.renderDefaults`, and `this.cameras.main.setZoom(f)` in BootScene, TitleScene, and PlayScene. Canvas-baked chrome and text use the same factor.
- Factor cap: none. The factor is the GGKit native value, capped only by GGKit's normal maximum of 3.
- Could not complete live headless canvas readback or a gameplay screenshot because no browser backend was available in this environment. `node --check` passed.
