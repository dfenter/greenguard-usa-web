# Chroma Tap
Tap any group of 2+ matching tiles to collapse it; arrows + space/enter work too (R restart, H hint).
Groups of 5/7/9 leave a rocket / bomb / disco orb in place; tap a special to fire it, or tap one touching another special for a combo blast.
Clear the goals shown up top before the move budget runs out: crates break beside collapses, balloons rise a row each move until popped, gears sink a row each move and score when they hit the floor.
The NEXT SPAWN strip above the board shows the next two tiles for every column, so refills are plannable: 28 levels, stars and bests saved locally, no lives and nothing to buy.

## AAA rebuild

Rebuilt in place on 2026-08-10 against the fleet3 brief. The archived canvas
prototype (`core.js` / `game.js` / `main.js`) is gone; the title is now Phaser 3
from `/play/_shared/` with GGKit as the sole lifecycle, input, save, audio and
juice implementation.

### Files

| File | Role |
|---|---|
| `index.html` | `<base href="/play/chroma-tap/">`, absolute `/play/_shared/` script tags, safe-area padding, system type stack |
| `ct_data.js` | Palette tokens, six tile families, four packs, the 28-level table, medal rules, daily seed, save shape |
| `ct_sim.js` | Pure simulation: board, groups, blast geometry, specials, hazards, goals, gravity, rescue moves, gift drops |
| `ct_art.js` | Procedural texture bakery plus local MP3 audio registration |
| `ct_game.js` | Phaser scenes (Boot / Menu / Levels / Restore / Play), HUD, animation timeline, particles, verification hook |
| `assets/*.mp3`, `sw.js`, `manifest.json`, `icon.png`, `icon512.png`, `favicon.png` | PWA shell and audio assets |
| `qa_test.js` | Repeatable pure-model QA and payload budget checks |
| `LICENSES.md` | Asset record: everything procedural, no pack files, ledger cited |

### Implemented

**Mechanics.** Instant-read highlighting: hovering or pressing any cell calls
the sim's pure `previewBlast()` and outlines the exact set of cells that will
be hit, using pooled corner-tick overlays. A special never fires on contact:
it telegraphs its blast radius for 200 ms with a charge cue first, so combo
blasts are read before they are committed. Collapse resolves as a two-phase
timeline built from position diffs the sim returns (phase A collapse and
refill, phase B hazard motion), with fragment bursts, a settle squash on every
landing tile, and a back-eased 1.45x pop plus spark ring when a special is
created. Crates carry 1 to 3 hit points and swap between three baked crack
textures; balloons carry an up chevron and rise a row per move; gears carry a
down chevron, sink a row per move and bank when they reach the floor. Goal
chips show icon plus have/need, turn green with a tick on completion, and
completion pings arrive as a corner chip.

**Loop.** 28 authored campaign levels across four packs, plus a date-seeded
Daily Blast that rotates pack shape and goal mix and logs the first clear of
the day with a streak. Medals are earned on three axes at once: moves
remaining, combos fired and hint discipline (gold needs 25 percent of the
budget left, the level's combo target, and no hint; silver needs 10 percent and
a lower combo target; bronze is any clear). Medals bank points (bronze 1,
silver 2, gold 3) and the points gate the pack chain: Balloon Rise at 5, Gear
Works at 12, Chroma Master at 20, with levels also unlocking in sequence.
Generosity is built in rather than sold: every level grants 4 automatic rescues
of +6 moves when the budget hits zero, and drops a free rocket (bomb in the
last two levels) every 4 to 5 moves. No lives, no currency, nothing to buy.

**World.** Four pack identities, each with its own board silhouette (`colTop`
per column), frame material and hazard mix:

| Pack | Levels | Board shape (colTop) | Hazards | Unlock |
|---|---|---|---|---|
| Crate Yard | 1-7 | `0,0,0,0,0,0,0` full 7x8 | crates, hp 1 then 2 | open |
| Balloon Rise | 8-14 | `2,1,0,0,0,1,2` notched shoulders | balloons + crates | 5 points |
| Gear Works | 15-21 | `1,0,0,0,0,0,1` clipped corners | gears + crates, one balloon level | 12 points |
| Chroma Master | 22-28 | `2,1,1,0,1,1,2` stepped dome | crates + balloons + gears + colour goals | 20 points |

Level table (moves are before rescues; gold/silver are combo targets):

| # | Pack | Colours | Moves | Goals | Gold/Silver combos |
|---|---|---|---|---|---|
| 1 | Crate Yard | 4 | 22 | 4 crates | 1 / 1 |
| 2 | Crate Yard | 4 | 22 | 6 crates | 2 / 1 |
| 3 | Crate Yard | 5 | 24 | 8 crates | 2 / 1 |
| 4 | Crate Yard | 5 | 24 | 6 crates hp2 | 3 / 1 |
| 5 | Crate Yard | 5 | 26 | 9 crates hp2, 20 seed tiles | 3 / 2 |
| 6 | Crate Yard | 5 | 26 | 12 crates hp2 | 4 / 2 |
| 7 | Crate Yard | 6 | 28 | 14 crates hp2 | 4 / 2 |
| 8 | Balloon Rise | 5 | 24 | 3 balloons, 4 crates | 2 / 1 |
| 9 | Balloon Rise | 5 | 24 | 4 balloons, 4 crates | 3 / 1 |
| 10 | Balloon Rise | 5 | 26 | 5 balloons, 6 crates hp2 | 3 / 2 |
| 11 | Balloon Rise | 6 | 26 | 5 balloons, 24 tide tiles | 3 / 2 |
| 12 | Balloon Rise | 5 | 26 | 6 balloons, 8 crates hp2 | 4 / 2 |
| 13 | Balloon Rise | 6 | 28 | 7 balloons, 6 crates hp2 | 4 / 2 |
| 14 | Balloon Rise | 6 | 30 | 8 balloons, 10 crates hp2 | 5 / 3 |
| 15 | Gear Works | 5 | 26 | 2 gears, 4 crates | 2 / 1 |
| 16 | Gear Works | 5 | 26 | 2 gears, 8 crates hp2 | 3 / 1 |
| 17 | Gear Works | 6 | 28 | 3 gears, 26 plum tiles | 3 / 2 |
| 18 | Gear Works | 5 | 28 | 3 gears, 3 balloons | 4 / 2 |
| 19 | Gear Works | 6 | 28 | 4 gears, 8 crates hp2 | 4 / 2 |
| 20 | Gear Works | 6 | 30 | 4 gears, 5 balloons, 6 crates | 5 / 3 |
| 21 | Gear Works | 6 | 32 | 5 gears, 10 crates hp2 | 5 / 3 |
| 22 | Chroma Master | 6 | 30 | 8 crates hp2, 4 balloons, 2 gears | 4 / 2 |
| 23 | Chroma Master | 6 | 30 | 10 crates hp2, 5 balloons, 2 gears, 22 sun tiles | 5 / 3 |
| 24 | Chroma Master | 6 | 32 | 12 crates hp2, 5 balloons, 3 gears | 5 / 3 |
| 25 | Chroma Master | 6 | 32 | 10 crates hp3, 6 balloons, 3 gears, 26 leaf tiles | 6 / 3 |
| 26 | Chroma Master | 6 | 34 | 14 crates hp2, 7 balloons, 4 gears | 6 / 4 |
| 27 | Chroma Master | 6 | 34 | 14 crates hp3, 7 balloons, 4 gears, 28 ember tiles | 6 / 4 |
| 28 | Chroma Master | 6 | 36 | 16 crates hp3, 8 balloons, 5 gears, 30 plum tiles | 7 / 4 |

**Presentation.** Palette and glyphs come straight from
`play/_assets/ART_puzzlepop.md`: six families, each with its own silhouette
(rounded, cut-corner, notched, squircle, hexagon, bevelled), its own value, and
an Ink glyph that clears 4.5:1 against every face, so the board survives a
grayscale or colourblind pass without relying on hue. Three independent pooled
particle systems cover matches, cascades, and chain rewards within 64 items.
Board shake and hit-stop route through `kit.juice`, capped at 6 px and 70 ms,
one shake at a time. `prefers-reduced-motion` is the initial state of that
toggle and the GGKit settings shell overrides it; with juice off, every
outline, telegraph, glyph, crack state and counter still reads. Audio is twelve
local MP3 cues plus two music states on the GGKit buses, escalating from a dry
tap tick through the cascade swell and special charge to the combo chord, with
the long fanfare reserved for the level clear.

**UI_LAW compliance.** One transient at a time: chips queue through a single
corner slot (150x38, 0.9 s hold, fast fade) that never stacks, which is about
3.7 percent of the play area. Centre banners appear only at run boundaries
(level start, level clear with the medal ceremony, out of moves). Everything
in-play is icons and meters: a level chip, a moves meter, goal chips with
icon plus count, a score chip with a combo pip row, and no repeated label text.
The tutorial is a single 30 px strip under the HUD that fades after 3 seconds
and appears on six levels only. Controls sit in the corners at 56 px, the
bottom third of the screen is left to thumbs, and the page carries
`viewport-fit=cover` with safe-area padding. All readable text is 14 px or
larger.

### Verification

- `node --check` passes on `ct_data.js`, `ct_sim.js`, `ct_art.js`, `ct_game.js`,
  `sw.js`; `manifest.json` parses.
- `node qa_test.js` covers cascades, recursive special previews, orb colors,
  gear banking, blocker movement, active-state resume, save bounds, and payload
  limits.
- Headless sim soak (greedy autoplayer, no view): all 28 levels and 7
  consecutive dailies clear, with a bronze/silver/gold spread and rescue and
  gift systems firing.
- GPU-backed browser screenshots are not claimed by the fix-round harness.
  The pure-model and static checks are reproducible from this directory.

### Deferred

- Frame budget could not be cleanly certified on this box. Median frame time on
  a live level at 4x CPU throttle measured 16.8 and 17.1 ms across two runs
  (inside the 17.5 ms bar), and 16.7 ms unthrottled with zero frames over
  33 ms. The over-33 ms count under throttle is unusable here: a **blank page**
  in the same headless SwiftShader Chrome at 4x throttle already reports 72 of
  600 frames over 33 ms with a 269 ms max, and an idle Chroma Tap board
  reported between 139 and 193. The number needs a GPU-backed, uncontended box
  to mean anything.
- The board-clear reward now enters the Restore scene, where three persisted
  choices complete the courtyard restoration loop.
- Level-clear results show score, moves left and the medal, but no per-axis
  breakdown of why a medal was missed.
- The daily's medal is computed but not banked into the pack unlock economy, by
  design, so the campaign chain cannot be farmed from the daily.

## Fix round 1

Fixed:

- CRITICAL automatic cascades, bounded chain tracking, and chain score multipliers.
- MAJOR recursive special telegraphs, stored orb colors, floor-only gear banking,
  blocker-safe hazard movement, adjacency tutorial text, GGKit pointer identity
  validation, gamepad controls, Escape pause, real hit-stop freezing, 70 ms shake
  caps, reduced-motion gating, independent match/cascade/chain particle pools,
  idle and resolve color treatments, the board-safe notification chip position,
  the Restore scene with three persisted choices, active board resume saves,
  bounded medal and best IDs, and complete restart cleanup.
- MINOR deterministic cosmetic randomness and visible rescue counts.
- Ship QA now has the repeatable `qa_test.js` harness, per-file and total payload
  checks, local MP3-only audio assets, and a bumped service-worker version.

Unverified:

- GPU-backed browser screenshots and the 4x-throttle frame median remain
  environment-dependent. The directory-local harness and static checks pass,
  but no browser evidence was fabricated.

## Retina pass 2026-08-16

- Ratio record: before 1.00x from the pre-pass design-size backing configuration; after 3.00x is the configured DPR3 result from `round(design * GGKit.hiDpi.factor(...))`. A live canvas ratio read was unavailable.
- Recipe: Phaser `Scale.FIT`, design world coordinates retained, `RETINA_FACTOR` applied to scale dimensions and `setZoom` in Boot, Menu, Levels, Restore, and Play. Procedural textures use the dense GGKit canvas helper, tile scales compensate for the dense source, and text uses the same resolution.
- Factor cap: none. The GGKit factor is used without a cap because this title has no measured need for one.
- Could not do: the browser connector reported no available target, so the required DPR3 canvas ratio read and real gameplay screenshot could not be captured. `node --check` and `git diff --check` pass.


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

- The factor is NOT the GGKit call the scripted pass looked for: it is
  `RETINA_FACTOR = (CTArt && CTArt.density) || GGKit.hiDpi.factor(W, H)`, sourced from
  the art module's baked-texture density, and it also feeds `TILE_SCALE` and every text
  `resolution`. Five scenes (Boot, Menu, Levels, Restore, Play) each call `setZoom`.
- Repair: `setOrigin(0, 0)` at all five sites. Texture density and TILE_SCALE untouched.

### Measured, by me, on a real gameplay frame

Release gate run serially (concurrency 1) against a local static server:
`node release_gate.mjs http://localhost:<port> 1 chroma-tap`, headless Chrome,
390x844 at deviceScaleFactor 3, best of four post-interaction frames.

| | distinct colours (8-bit) | flattest colour share | backing/CSS ratio | gate |
|---|---|---|---|---|
| before | 2 | 94.8% | 3x | HOLD (art) |
| after | 19111 | 38.5% | 3x | READY (all checks pass) |

`node --check` clean on every file touched. No gameplay, balance, content or art
direction was changed.
