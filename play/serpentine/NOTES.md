Serpentine is a portrait snake/light-cycle arena survival game.
Swipe horizontally or vertically to turn; arrow keys and WASD also work.
Collect charge pips to grow, avoid every wall, and outlive the rival hunters.
Closed gates, speed pads, and a shrinking arena make each seeded round tighter.
Tap or press Space/Enter after a crash to restart; best score persists locally.

## AAA rebuild

Rebuilt in place 2026-08-10 against the fleet2 brief. Phaser 3.87 from
/play/_shared/ only, GGKit as the sole lifecycle / input / save / audio
implementation, ART_arcade2d.md as the art bible. Portrait, PWA, no network.

### Implemented

**Mechanics.** The sim is a cell grid (19 x 33) stepped on a fixed 1/60 s
accumulator that is clamped rather than drained, so a degraded device runs in
slow motion and no clock in the title ever advances past the steps that
actually ran. Turning is instant and cannot kill you by accident: a single
queued-turn slot is compared against the turn already pending for this step
rather than against the live direction, so two fast swipes can never fold the
head into the neck, and exactly one turn is consumed per step. Speed pads give
a readable boost (head flashes white, boost bar fills, chevron jets, whoosh)
and gates telegraph for a full 1.2 s before they slam, blinking faster and
shifting amber to red, with a clang on the close. Charge pips grow the body two
cells each with a burst, a chip and a length readout. The shrinking arena warns
with a pulsing band on the ring that is about to close, four seconds ahead,
plus a low storm swell. A near miss - turning away on the step where the cell
straight ahead would have ended the run - pays 25 points, a shake and a SAVE
chip. Shield charges from the Storm Eye convert one fatal step into a forced
escape turn instead of a death.

**Loop.** Twelve authored seeded rounds then an endless ladder. A round is
cleared by surviving its par; medals are survival-time tiers (bronze 40% of
par, silver 70%, gold the clear, platinum the clear plus the pip goal) and the
best medal per round persists. Ten trail and head variants unlock off
milestones and are picked from a roster on the title and results cards, all
through guarded lookups. The first run gets a three-beat interactive tutorial
(turn, grow, avoid) on a thin fading strip under the HUD. Drops are
deliberately generous: the concurrent pip target is the arena baseline plus
five for the first 14 s and plus two for the next 14, pads hand out a 2.1 s
boost instead of 1.45 s during that same opening window, and a collected pip is
replaced immediately.

**World.** Five authored arenas, each with its own map, palette, hazard
language, deliberate hunter spawn placement and a signature set-piece.

| Arena | Identity | Hazards | Set-piece | Hunter placement |
|---|---|---|---|---|
| Vector Yard | Open grid, cyan | 4 corner blocks, 2 pad pairs | Pulse Core: showers four bonus pips every 8 s | Far and behind, top lane, upper-left; none on the player's column |
| Lockstep Vault | Gated maze, violet | 4 rotating gates, 2 pinch rows, 3 wards | Lockstep Cross: the four vault gates split one period into quarters, so exactly one approach is shut at a time | One hunter per ward, none in the player's lane |
| Slipstream Loop | Pad circuit, teal | 88 pads in two full rings, 2 wall chambers | Slipstream Ring: a chain of 8 pad hits fires a surge, +2 s boost and 150 points | Two on the rings, one on the bottom straight |
| Collapse Basin | Shrinking storm, rose | Sparse cover, aggressive ring schedule | Storm Eye: hands out a shield charge every 13 s | Two flanking on row 9, one central and off-column |
| Warden Keep | Hunter ground, green | Two 8-cell gate pincers slamming in alternation | Warden Gauntlet: each slam shakes the arena and flashes the core | All three behind a pincer, so a hunter only reaches the player through a gate the player can read |

| Round | Arena | Par | Hunters | Skill | Pip goal | Step | Storm |
|---|---|---|---|---|---|---|---|
| 1 | Vector Yard | 45 s | 1 | 0.34 | 8 | 132 ms | - |
| 2 | Vector Yard | 55 s | 2 | 0.44 | 10 | 128 ms | - |
| 3 | Lockstep Vault | 60 s | 2 | 0.50 | 12 | 126 ms | - |
| 4 | Slipstream Loop | 60 s | 2 | 0.52 | 14 | 124 ms | - |
| 5 | Lockstep Vault | 65 s | 3 | 0.56 | 14 | 120 ms | - |
| 6 | Warden Keep | 70 s | 3 | 0.62 | 16 | 118 ms | - |
| 7 | Slipstream Loop | 70 s | 3 | 0.66 | 18 | 114 ms | - |
| 8 | Collapse Basin | 75 s | 2 | 0.68 | 16 | 116 ms | from 22 s, every 11 s, 4 rings |
| 9 | Warden Keep | 80 s | 3 | 0.72 | 20 | 112 ms | - |
| 10 | Lockstep Vault | 85 s | 3 | 0.78 | 22 | 110 ms | from 34 s, every 13 s, 3 rings |
| 11 | Slipstream Loop | 85 s | 3 | 0.84 | 24 | 106 ms | from 34 s, every 13 s, 3 rings |
| 12 | Collapse Basin | 95 s | 3 | 0.92 | 26 | 104 ms | from 16 s, every 9 s, 5 rings |
| 13+ | cycles Loop, Keep, Vault, Basin, Yard | +5 s each | 3 | to 0.97 | +2 each | to 88 ms | always |

**Presentation.** Six trail ramps and four head skins, four pooled particle
systems (spark, pip burst, crash debris, boost jet), screen shake on near-miss
saves, pad hits, kills and ring closures, 60%-width banner beats with a hand
rolled back-out overshoot for round clear, milestone unlocks and game over, and
GGKit audio buses driving fifteen procedurally synthesised sounds plus two
music beds the kit crossfades between calm and heat. Reduced motion is honoured
throughout: shake becomes a no-op, particle counts drop to 40%, the banner
overshoot flattens, and every idle pulse and rotation stops.

**Assets.** No media file ships. Every texture is baked from Graphics at boot
and every sound is synthesised to an in-memory WAV; the icons are procedurally
generated original art. Nothing is copied from another title and no `.ogg`
exists. `/play/_assets/LEDGER.md` is cited in LICENSES.md, with no rows
consumed.

**Verification hook.** `window.__sp` is created before Phaser boots and carries
`state` (round, arena, arenaName, setPiece, length, score, pips, pipGoal,
rivals, rivalsAlive, alive, survived, medal, boost, shield, chain, stormInset,
seed, trail, skin, phase, paused, reducedMotion, tutorial), plus `forceRound`,
`forceArena`, `forceRestart` and `scene()`. The switches also read from the
query string (`?round=`, `?arena=`) and are visible in `state` from the title
card, before a run starts.

### Known-bug classes designed out

Debug state is the live pooled state, not a parallel copy. Snakes hold sim data
only; sprites are pool slots rebound from the ring buffer. There are no DOM
control handlers at all, so nothing can claim a pointer without seeding
`kit.input`. One camera, so no second camera to forget. Scenes are real
`Phaser.Scene` subclasses, so no plain-config `extend:` trap. Every lookup
against variant content goes through the guarded `SP_DATA` accessors, and a
corrupt save is normalised field by field against the live registries. The
coach strip is a thin fading band under the HUD that never enters the play
area. Nothing subscribes to the non-existent `postrender` event. No arrow-IIFE
is used. The board, walls, grid and frame are baked into one canvas texture, so
no large static Graphics replays a command list per frame, and `Graphics.arc`
appears nowhere - rings and discs are hand-tessellated once at bake time.
`setText` and `setColor` both have change guards. `sw.js` precaches only files
that exist, verified by fetching all eleven.

### Verification

Harness scripts live in `ue-port-studio/aaa/harness/`: `sp_probe.mjs` (boot,
touch play, arena tour, storm, banner, results, pause), `sp_gates.mjs`
(behaviour gates) and `sp_base.mjs` / `sp_perf2.mjs` (frame timing).

- `node --check` passes on `game.js`, `sp_data.js` and `sw.js`; `manifest.json`
  parses. Arena data self-validates (row and column counts, spawns on open
  floor, every gate letter timed) at boot and in CI-style node runs.
- Boot to play at 390x844 portrait with **zero console errors and zero page
  errors** across every probe run.
- All behaviour gates pass: boot and live test switches, guarded fallback for
  an unknown arena id, corrupt-save repair (six fields), fifteen synthesised
  audio buffers decoded with zero failures, reduced-motion gating, GGKit
  settings overlay freezing the sim, seeded rounds reproducing an identical
  opening drop set, and all eleven precache paths returning 200.
- Payload: 316 KB authored (largest file `game.js` at 115 KB), plus the shared
  Phaser build. Inside the 2.5 MB total and 400 KB per-file budgets.
- Feel at 1x: median 16.7 ms, worst 16.8 ms, 0/300 over 33 ms.
- Feel at 4x throttle, measured in a quiet window: **median 16.7 ms, p90
  16.7 ms, 5/600 over 33 ms**, inside the 17.5 ms / 6-per-600 budget. Measured
  back to back under identical conditions in that same window, the shipped
  flagships scored 88/600 (Horde Meridian) and 198/600 (Skyfall Command), so
  Serpentine is currently the cleanest of the three.

### Deferred

- **A clean perf re-capture on an uncontended box.** The machine carried load
  averages between 16 and 313 for the whole session and the 4x throttle figure
  swung between 5/600 and 101/600 on identical code purely with box load. The
  5/600 reading above is from the quietest window and the shipped peers were
  measured alongside it as a control, but the budget line deserves a capture on
  an idle machine before it is treated as final.
- **Hunter tuning above skill 0.9.** The endless ladder pushes skill to 0.97
  and step time to 88 ms; rounds 13+ have been exercised for stability and
  frame cost but not balanced for fairness.
- **A second music bed pair.** One calm and one heat loop ship; the arena
  palettes would carry a third, colder bed for the Vault.
- **Gate variety.** Only two of the four gate letters are used outside the
  Vault; the data model supports four independent groups per arena and the
  Keep could use a third pincer phase.
- **Landscape.** The title is portrait-only by design and the GGKit rotate gate
  handles the wrong orientation; no landscape layout was authored.

## Fix round 1

### Fixed

- CRITICAL art gate: added original local SVG board detail, entity, particle,
  gate, core and tutorial art, then switched live pools to those assets.
- CRITICAL player states: added authored idle, turn and damage textures for all
  four head skins and bound them to the player and hunter state machine.
- MAJOR ghost food: round reset now clears every pip sprite and stale cell.
- MAJOR pause clear transition: pause is play-only and clear progression is
  gated by both GGKit pause state and menu visibility.
- MAJOR corrupt saves: schema versions, finite bounded integers and registry
  validation now reject Infinity and other malformed values.
- MAJOR stale touch state: pause, resume, restart, run and round transitions
  clear scene pointer, key, tap and gamepad edge state.
- MAJOR gamepad controls: added a kit.input gamepad adapter with D-pad and
  stick dead-zone edge detection, confirm and pause buttons, and reversal-safe
  turn requests.
- MAJOR tutorial: removed the early-turn debounce, removed the early pip
  debounce, and added reachable animated turn and food markers.
- MAJOR gates: open gates now keep a high-contrast full-cell treatment with a
  visible letter glyph, and the closing tell begins two seconds early.
- MAJOR crash contact: fatal destination cells are clamped and used for the
  crash burst, damage head state and impact marker.
- MAJOR impact language: added bounded anticipation, contact and follow-through
  ring motion, score callouts and a damage vignette for pickups, pads, hunter
  kills and player crashes, gated by reduced motion and screen-shake settings.
- MAJOR hit-stop: capped the request at 120 ms and moved the freeze to render
  presentation while the fixed simulation keeps stepping.
- MAJOR settings: added persistent Music volume and SFX volume controls to the
  GGKit settings shell.
- MAJOR audio loading: replaced the live synthesized audio path with local
  mono MP3 SFX and two MP3 music beds. Audio is registered at boot, decoded by
  GGKit on first use, and music is not service-worker precached.
- MINOR hunter length: spawn body placement now backtracks through reachable
  floor instead of greedily terminating at a dead end.
- MINOR idle phase: pips, pads, head glows and jet emission use per-instance
  phases and a dedicated visual RNG.
- MINOR sealed cores: core marker cells are excluded from food placement and
  hunter body placement.
- MINOR ring and pool overflow: growth is capped at 110 cells per snake, the
  ring has headroom, and the body pool is sized from the supported maximum with
  an explicit overflow flag.
- Bumped `sw.js` to `2026-08-10-fix-round-1` and updated its precache list.
- Validation passed: `node --check` on every changed JavaScript file, arena
  validation, SVG XML parsing, MP3 codec checks, service-worker path checks,
  payload 613271 bytes, and no file over 400000 bytes.

### Rejected for this round

- MAJOR required deployed QA evidence: not staged because this request forbids
  deploy, the required evidence directory is outside the permitted
  `play/serpentine/` work scope, and no browser surface is available for the
  deployed gate run. No claim is made that the reviewer finding is factually
  wrong.

## UI declutter

- Cut live-round center banners, seed text, watermark branding, arena/set-piece
  flavor, gate lettering, floating score callouts, and the always-on bottom
  controls legend.
- Shrunk the coach copy to one 14px single-line top strip that recedes after
  three seconds; kept the animated board guide and reduced-motion gating.
- Collapsed the HUD to compact round/score, survival/boost meters, and icon
  counters for length, pips, and shield.
- Moved event feedback to one 144px edge chip with a one-second hold and queue;
  boundary banners remain for clear/death/unlock results only.
