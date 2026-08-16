# EMBERHOLD Pocket Tactics - NOTES
Loop: boot straight into a 4v5 skirmish; each turn move your glowing unit and act until one side is wiped. Win/lose banner offers instant restart; fewest rounds to a win is saved to localStorage.
Touch: tap your unit to show its move range, tap a blue tile to move, tap a red enemy (or an action, then a tile) to aim - irreversible actions need a second tap on the target or the CONFIRM chip. END TURN is always in the top bar.
Camera: one-finger drag pans, pinch or double-tap empty space zooms, +/- chips on the board also zoom. MENU holds skirmish select, restart, random map, rotate, speed and how-to-play.
Keyboard: WASD / arrows move the tile cursor, Space or Enter selects/confirms, Esc cancels an aim, E ends the turn, R restarts the map, M toggles the menu.
Port bar: rules, AI, balance and the deterministic sim are untouched - only input, HUD layout and canvas fit changed (logical 1200x760 board, 960x608 backing store).

## AAA rebuild

Implemented:

- Rebuilt the title around Phaser 3 from `/play/_shared/phaser.min.js` with GGKit as the lifecycle, input, save, and audio owner.
- Extracted the deterministic tactics rules into `sim.js`. Turn order, seeded hit and damage resolution, move reachability, threat ranges, charge actions, and AI targeting stay behind that boundary. `game.js` is presentation and input only.
- Added pooled authored vector unit silhouettes with team glows, readable ability glyphs, blue move range, red threat range, target previews, damage and crit pops, pooled impact particle systems, hit-stop, shake, tutorial strip, persistent turn queue, pinch and drag camera, and reduced-motion gating.
- Added two-tap irreversible action confirmation with a persistent CONFIRM chip, terrain-effect Ember Sigil, heal and buff pickups, hazards, mid-skirmish reinforcement drops, medal scoring, save-backed unlocks, and the Finale boss banner.
- Added `window.__et.state` with live `mode`, `round`, `skirmish`, and `unitsRemaining` telemetry for diagnostics. Locked campaign rows are enforced at startup and during map changes.
- Added PWA manifest, icon PNGs, favicon, local MP3 cues through GGKit audio buses, a full existing-file precache, and asset provenance in `LICENSES.md`.

Map and skirmish tables:

| Map | Identity | Signature / hazard | Skirmish use |
|---|---|---|---|
| Ember Plaza | Open plaza | Twin Waystones / open ground | Skirmish 1, tutorial-paced 4v5 plus one drop |
| Whisperwood Choke | Forest choke points | Rootbridge / thorns | Skirmish 2, six enemies plus two drops |
| Ruined Keep | Elevation and courtyard | Broken Crown / collapses | Skirmish 3, seven enemies plus two drops |
| Night Siege | Limited-vision night crossing | Signal Fires / void water | Skirmish 4, eight enemies plus two drops |
| Emberhold Core | Boss arena and full roster | Ember Crown / core heat | Finale, boss plus nine-enemy roster and two drops |

Medals use rounds and player units lost. Victories unlock the next row in order. Every map has authored cover, hazards, generous heal or buff pickups, and a flanking route through the central feature.

Determinism regression result: `sim.regression()` reproduced the same event signature for both runs in all 15 checks across seeds `1`, `2417`, and `4294967295` on skirmishes 1 through 5. Fourteen probes reached a normal enemy victory. The intentionally minimal auto-player probe for seed `4294967295`, skirmish 3, reaches a deterministic `timeout` after failing to route around the authored elevation; the equality check still passes and this does not alter live player or AI rules.

Deferred:

- In-app browser visual and interaction smoke test, feel timing capture, and MP3 playback check could not run because no browser surface was available and the sandbox rejected opening a local HTTP server port. Static checks did run: `node --check` passed for `sim.js`, `game.js`, and `sw.js`; manifest JSON parsed; all 34 precache paths exist; all shipped files are below budget.

## Fix round 1

Fixed:

- CRITICAL FX pool crash by initializing and recycling the cursor safely.
- CRITICAL primitive-only presentation by adding original local SVG unit, terrain, pickup, and FX art.
- MAJOR keyboard controls with a visible cursor and mode-aware Space or Enter activation.
- MAJOR controller support through the GGKit input adapter.
- MAJOR lifecycle and input ownership by using GGKit pointer state, `kit.restart()`, and pause/restart cleanup.
- MAJOR screen shake by applying GGKit juice offsets to the board, FX, and actors.
- MAJOR particle and text pooling with four bounded Phaser particle systems and a preallocated floater pool.
- MAJOR character animation coverage with idle, move, attack, hurt, and KO presentation states.
- MAJOR player damage feedback with damage SFX, hurt state, red flash, and vignette pulse.
- MAJOR audio coverage with eight SFX, ambient intensity crossfade, and local MP3-only assets.
- MAJOR save validation with strict profile fields, map keys, score ranges, and best-round ranges.
- MAJOR locked-content bypass by gating URL starts and removing live force switches.
- MAJOR campaign refresh by updating unlock, medal, selection, and best-round state on every menu update.
- MAJOR Night Siege fog leak by hiding threat overlays for unseen enemies.
- MAJOR hazard KO stalls by advancing the turn safely when movement causes a KO.
- MAJOR unreachable void hazard by allowing Night Siege water crossings so entry damage can resolve.
- MAJOR cosmetic Ember Sigil by applying field damage on entry.
- MINOR KO label ghosts by hiding all dead actor views and labels.
- MINOR keyboard END TURN persistence by saving tutorial completion on every control path.
- MINOR restart residue by clearing transient FX, particles, floaters, camera shake, and input state.
- MINOR best-round visibility by surfacing it in the campaign buttons and result banner.

Rejected: none. All listed findings were actionable in this title.

## UI declutter

- Cut live map signatures, unit-name labels, repeated turn/round words, action descriptions, and floating combat text; the board, HP/charge meters, icons, queue, and results screen retain the useful information.
- Shrunk the HUD to icon-led meters and compact action buttons; reduced the queue to an unlabeled icon cluster and kept touch targets at 44px or larger.
- Moved the active-unit meters to the top edge, moved event feedback to a single upper-corner chip with a capped 1.0s queue, and made the coach strip one thin line that fades after about 3s.
- Kept the center banner for battle boundaries only and preserved reduced-motion gating.

## Round 2 polish

Visual and FX polish:

- Added authored per-area palettes for twenty battles, stronger elevation side shading, terrain highlights, hold/capture/escort objective markers, and a live movement path preview.
- Added pooled weapon-class attack arcs for slash, bash, arrow, fire, frost, arcane, shock, dash, and support actions. Impacts retain pooled particles, shake, hit-stop, damage flash, KO drift, and audio through GGKit; the heavy layer is gated by the reduced-motion setting.
- Expanded actor motion into idle breathing, anticipatory attack wind-up, active strike, recovery, hurt blink, move bob, and death drift. Victory and defeat now use a reduced-motion-aware camera sweep before the boundary banner, and the menu sheet slides instead of cutting.
- Added a compact roster / armory panel with safe-area touch targets, active-slot selection, equipment cycling, promotion branch selection, permadeath toggle, and heavy-FX toggle. Music remains lazy through GGKit until the first gesture.

Gameplay depth:

- Replaced the five-skirmish chain with a deterministic twenty-battle campaign spanning rout, hold, capture, and escort objectives, with authored battle names, palettes, hazards, layouts, reinforcement waves, objective timers, control points, and the Emberhold finale.
- Added a persistent six-member roster carried between battles, active four-unit selection, XP and levels, two-branch class promotions with new abilities, equipment modifiers, courier escort units, objective-aware capture/hold resolution, and a permadeath toggle.
- Added terrain and cover modifiers plus explicit high-ground, low-ground, cover, side, and back-flank deltas to the damage forecast. Enemy AI now prioritizes the courier and contested objectives, focuses vulnerable targets, uses taunt/decoy state, and scores routes for flank access instead of only closing distance.
- Preserved tap-to-move, tap-to-target, second-tap confirmation, keyboard, gamepad, pan, pinch, rotate, zoom, end-turn, and deterministic simulation behavior.

Save and ship notes:

- Bumped the save profile from version 1 to version 2. Version 1 profiles migrate into the new roster, equipment, active-slot, permadeath, and reduced-motion fields; invalid or malformed profiles fall back to a fresh validated profile without throwing. Victory writes carried roster XP and permadeath state through GGKit.
- Bumped the service-worker cache to `2026-08-16-aaa-round2-tactics2`; its precache list was checked against the files that exist. The title payload is 331,776 bytes and every file is below 400 KB.

Deferred:

- A live browser screenshot and 4x frame capture could not run because no in-app browser instance was available and the sandbox rejected opening a local HTTP server port. Static checks, all-twenty battle instantiation, deterministic regression probes, randomized interaction fuzzing, manifest parsing, and precache validation passed.

## Retina pass 2026-08-16

- Ratio record: before 1.00x from the pre-pass design-size backing configuration; after 3.00x is the configured DPR3 result from `round(design * GGKit.hiDpi.factor(...))`. A live canvas ratio read was unavailable.
- Recipe: Phaser `Scale.FIT`, 1200 by 760 world coordinates retained, `RETINA_FACTOR` applied to scale dimensions and the Emberhold scene camera zoom. Phaser text objects use the same resolution and the existing SVG assets remain vector-backed.
- Factor cap: none. The GGKit factor is used without a cap because this title has no measured need for one.
- Could not do: the browser connector reported no available target, so the required DPR3 canvas ratio read and real gameplay screenshot could not be captured. `node --check` and `git diff --check` pass.
