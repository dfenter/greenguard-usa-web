STACKLOCK
Controls: tap left/right board halves to shift, tap board or ROTATE to turn, swipe down to drop, swipe up to hold.
Keyboard: arrows/WASD move, Up/W/Z rotate, Space hard drops, C holds, Enter restarts.
Loop: clear lines to level up in Marathon, or clear 40 lines for the fastest Sprint time.
Best Marathon score and Sprint time persist locally in the browser.

## AAA rebuild

Rebuilt in place 2026-08-10 for the fleet F4 uplift. Phaser 3.87 from
`/play/_shared/` plus GGKit as the sole lifecycle, input, save, audio, loader,
settings and juice implementation. Portrait, board-and-side-rail layout kept
from the prototype. Every asset is original and procedural (see LICENSES.md);
no ledger pack row is consumed, nothing is hotlinked, no ogg, no network.

### Implemented

**Mechanics.** Full SRS rotation with the standard JLSTZ and I wall-kick
tables (kicks authored in SRS space, y negated for the board's y-down grid),
7-bag randomiser, hard drop, soft drop with a gravity multiplier, DAS at
150 ms then 55 ms auto-repeat, a landing ghost, and hold with a broken-ring
lockout badge over the hold slot plus a deny cue when it is spent. Lock delay
is a 500 ms grace window with up to 15 move/rotate resets, so a piece can be
slid home rather than instant-locked. Line clears run a three-beat sequence
that is stepped by the sim, not by wall time: 130 ms flash with a sweeping
beam, 160 ms shatter into pooled fragments, 140 ms collapse with an eased row
settle. Combo and back-to-back are tracked, scored (combo pays 50 x combo x
level, a back-to-back QUAD pays 1.5x) and shown as live chips above the board.

**Loop.** Four modes. Marathon levels up every ten lines along a 30-entry
hand-tuned gravity curve with medal tiers at levels 5/10/15/20. Sprint is a
40-line time attack with medal tiers at 3:00/2:15/1:45/1:20 and a calm
progress ring instead of a loud counter. Puzzle is 24 hand-authored boards on
a fixed hand with an unlock chain (clearing board n opens board n+1) and
generous pickups. Master Clear is the finale: a pre-placed hazard field that
is won only when every hazard block is gone, on the level-10 curve, with a
wildcard riding in with roughly every other bag so it always stays beatable.
The interactive first-run coach walks shift, rotate, hold, drop and clear, one
verb at a time, as a thin fading pill in the gap ABOVE the board.

**Pickups (generous, as the owner asks).** Wildcard `W` is a single cell that
fills its entire row on lock, which is a guaranteed clear. Bomb `B` takes a
3x3 bite out of the stack with no line needed and pays 20 per block removed.
Puzzle boards also raise the hold allowance to 2 or 3 swaps per piece, and
every board ships more pieces than the minimum solution needs.

**Presentation.** Colourblind-safe palette from ART_puzzlepop.md with
triple-coded tiles (silhouette, hue AND value, baked glyph). Three pooled
particle systems (clear fragments, lock/movement streaks, reward celebration)
plus a pooled beam and ring set. Board shake and a 70 ms hit-stop on quads,
frame nudge on combos, a queued edge chip for live rewards, and a results-card
ceremony at run boundaries keep rewards legible without covering live play.
GGKit audio buses carry two
tempo/key matched music stems and 19 SFX cues, including a four-step clear
chime library that steps up by clear count. Reduced motion is seeded from
`prefers-reduced-motion`, overridable in the GGKit settings shell, and gates
shake, hit-stop, overshoot, flash intensity and particle counts while leaving
every cue that carries information.

### Modes and boards

| Mode | Identity | Board | Win | Speed | Signature treatment |
|---|---|---|---|---|---|
| Marathon | Graphite Tower | 10x20 empty | endless, medals at L5/10/15/20 | level curve from 800 ms to 10 ms per row | indigo frame, deep blue-violet sky, amber accent, music switches to `music_rush` at level 8 |
| Sprint 40 | Clean Line | 10x20 empty | 40 lines | fixed level 3 | pale slate frame, teal sky, quietest cell rhythm (alpha 0.40) so the clock reads, calm progress ring |
| Puzzle | Lockworks | 24 authored stacks | per-board line goal on a fixed hand | fixed level 3 | brass frame, plum sky, loudest cell rhythm, hazard and pickup tiles |
| Master Clear | Meltdown | 7-row hazard field, 20 hazard blocks | every hazard removed | level 10 | hot amber frame, red sky, `music_rush` from the first piece |

Puzzle set curve: 1-6 shape reading (one gap, one answer), 7-12 ordering where
the hold slot starts to matter, 13-18 hazards and the pickups arrive, 19-24
multi-line finishes under a tight hand.

| # | Board | Goal | Holds | Teaches |
|---|---|---|---|---|
| 1 | First Lock | 1 | 1 | the square in the notch |
| 2 | Two Deep | 2 | 1 | the same notch, stacked |
| 3 | Well | 2 | 1 | standing the bar up |
| 4 | Doorstep | 2 | 1 | an L reads as a step |
| 5 | Mirror Step | 2 | 1 | the mirrored step |
| 6 | Tee Time | 2 | 1 | the three-wide dip |
| 7 | Hold It | 2 | 2 | parking a piece |
| 8 | Zigzag | 2 | 2 | S and Z have one seat |
| 9 | Staircase | 3 | 2 | working down, not across |
| 10 | Split Well | 2 | 2 | two wells, two bars |
| 11 | Overhang | 2 | 2 | sliding under a lip with a kick |
| 12 | Comb | 3 | 2 | four teeth, four fills |
| 13 | First Hazard | 2 | 2 | hazards leave only on a clear |
| 14 | Bomb Run | 1 | 2 | the bomb's 3x3 bite |
| 15 | Wildcard | 2 | 2 | the wildcard fills its row |
| 16 | Hazard Wall | 3 | 3 | three hazard rows, three clears |
| 17 | Keyhole | 3 | 3 | one column, three rows |
| 18 | Cross Cut | 3 | 3 | misaligned gaps must be fixed first |
| 19 | Double Header | 4 | 3 | banking two, then two |
| 20 | Quad Slot | 4 | 3 | the QUAD |
| 21 | Hazard Comb | 4 | 3 | bombs help, lines finish |
| 22 | Terrace | 4 | 3 | reading a five-step terrace |
| 23 | Pressure | 4 | 3 | a high stack, do not build up |
| 24 | Lockworks | 5 | 3 | the whole set in one board |

Master Clear unlocks at 20 Puzzle boards cleared AND 90 Marathon lines
(level 10).

### Verification hook

`window.__sl = { state, forceMode(mode), forceBoard(boardId) }`. `state`
carries `mode, boardId, boardName, phase, score, level, lines, goal, cleared,
hazards, combo, bestCombo, b2b, elapsedMs, holdKind, holdLocked, queue,
pickups, unlockedPuzzles, medals, best, reducedMotion` and `board`, a
preallocated 20x10 matrix that is COPIED from the sim grid every frame and is
never an alias of it. `state.forceMode` / `state.forceBoard` are also plain
writable fields, read by the boot fallback if they are set before the first
scene starts and by `PlayScene.init` on every start, so a harness can drive
content either way.

### Known bug classes, how each is handled

- Debug views separate from preallocated pools: `SL_DEBUG_STATE.board` is its
  own matrix, copied per frame; no pool is ever assigned to it.
- Per-entity render state on the entity handed to the renderer: the sim grid
  is plain integers, the piece is a plain record, and all render state lives
  in view-side records (`cellView`, `clearColors`, ring/beam pools).
- DOM control handlers seeding `kit.input.pointers`: the five control buttons
  capture the pointer, so each handler writes and deletes its own entry in the
  kit's per-pointer map at claim time.
- Camera splits: none are used. One camera, one world container that carries
  the juice offset, so there is no second camera to forget.
- Phaser plain-config scenes: `toScene()` promotes each scene literal to a
  real `Phaser.Scene` subclass with its whole method set on the prototype.
- Test switches from boot fallback AND live scene: covered above.
- Clocks past the stepped sim: `update()` clamps the frame delta to 100 ms,
  runs at most 4 fixed 16.67 ms steps, and DROPS the remaining backlog. Every
  clock in the game (Sprint timer, lock delay, clear phases, gravity) reads
  `simTime`, which only advances inside a step. A degraded device gets slow
  motion, never a time skip. This was observed working: under a 20x CPU
  throttle the clear sequence stretched out in real time and stayed correct.
- Guarded lookups: `family()`, `identity()`, `puzzleAt()`, `shapeOf()`,
  `kicksFor()`, `gravityMs()`, `medalList()` and `frameForCell()` all fall back
  rather than return undefined, and `validateSave` rejects any persisted
  puzzle id that is not in the live registry.
- Coach UI: a thin pill in the gap above the board frame, never over the play
  area centre or the lower half.
- `sw.js` precache: generated from an on-disk listing with an existence
  assertion over all 40 entries.

### Budgets

- Title payload 873,925 bytes (0.83 MB) against the 2.5 MB cap. Largest single
  file is a 200,665 byte music stem, against the 400 KB per-file cap. Shared
  engine adds `phaser.min.js` 1.19 MB and `ggkit.js` 17 KB.
- Pooled objects only: 200 stack sprites, 40 flash plates, 4 ghost, 4 active,
  20 rail, 4 beams, 3 rings, 3 particle emitters. Nothing is allocated during
  play. All HUD text goes through `setTextIfChanged`.
- Feel, 4x CPU throttle, 390x844, 300 frames: title median 16.7 ms, play
  median 16.7 ms, Master Clear median 16.7 ms, against the 17.5 ms budget.
  **The over-33 ms tail could not be measured** - the box carried a load
  average above 200 from other lanes during every capture, and the accepted
  flagship `skyfall-command` measured 109/300 over 33 ms on its title screen
  in the same window, worse than Stacklock's play scene at 77/300. The tail
  number needs a re-capture on an uncontended box.
- A first profile pinned the play scene at 4 fps. Cause: a Phaser `Graphics`
  replays its whole command list into the batch every frame, not only when it
  is redrawn, so the 200 rounded-rect empty-cell grid and the panel shapes
  cost a full re-tessellation per frame. The board frame, cell grid, HUD card
  and rail panels are now baked into two canvas textures per layout and drawn
  as two quads; only the Sprint arc, the banner, the result card and the coach
  pill remain live Graphics, and the Sprint arc only redraws when its value
  changes. That single change took the median from 316 ms to 16.7 ms.

### Verified

`node --check` passes on `game.js`, `sl_data.js` and `sw.js`. Driven in
headless Chrome at 390x844 dpr2 with zero console errors, zero page errors and
zero failed requests across: boot to title, the mode cards, the puzzle board
grid and its lock states, the GGKit settings shell, Marathon play, Sprint,
Master Clear, `forceMode` and `forceBoard`, a single clear, a QUAD (2,428
points, back-to-back chip, ring and confetti), the wildcard row fill, the bomb
3x3 bite, board completion, save/unlock persistence and the result card.

### Deferred

- The over-33 ms frame tail, and the 600-frame capture the budget actually
  asks for, both need an uncontended box.
- Solvability of the 24 Puzzle boards is designed-generous (every board ships
  spare pieces, extra holds and, from board 13, pickups) but was not proved by
  search. Boards 1, 14, 15 and 20 were solved end to end in the browser.
- Deuteranopia, protanopia and tritanopia previews of the tile set were not
  run; the palette follows the bible's value ordering and every family is
  glyph-coded, but the simulation check the bible asks for is outstanding.
- The music stems are 8-bar loops. They hold up, but a second Marathon layer
  keyed to the medal tiers rather than to level 8 alone would read better.
- No deploy and no commit were performed, per the brief.

## Fix round 1

Fixed:

- CRITICAL player animation states: added view-only Ready, Preview, Resolve,
  and Invalid states with a persistent focus ring, legal landing arrow, and
  invalid cross cue.
- MAJOR hold lockout: hold usage now survives hold swaps and resets only when
  the active piece locks.
- MAJOR orientation pause: the play update exits while GGKit is paused,
  including when the rotate overlay appears before the play scene exists.
- MAJOR Sprint timing: clear animation time is included in the Sprint clock,
  while GGKit pause time remains excluded.
- MAJOR input and restart ownership: removed raw window keyboard handlers,
  routed keyboard polling through GGKit input identity, added per-pointer
  gesture records and cancellation, and routed result restarts through the
  GGKit restart path.
- MAJOR onboarding and title access: the coach now runs in every mode,
  highlights the relevant controls, and title mode and puzzle screens support
  keyboard navigation.
- MAJOR text accessibility: added persisted 1.0x, 1.15x, and 1.3x text sizes,
  reflow-safe scaling for title, HUD, result, help, and touch controls.
- MAJOR reduced-motion persistence: the current GGKit juice preference is
  mirrored into the validated profile, including the OS-reduced-motion case.
- MAJOR 390px geometry: board frame padding and rail gap are budgeted before
  choosing cell size, so the frame no longer clips or touches the rail.
- MAJOR puzzle generosity and Master Clear assistance: finite Puzzle hands
  have deterministic rescue wildcards when needed, and Master Clear wildcard
  assistance now follows a deterministic every-second-bag cadence.
- MAJOR quad hit-stop: GGKit's frozen view flag now freezes view clocks and
  particle time while the simulation continues stepping.
- MAJOR save integrity: save numbers must be integers, medals must be known,
  puzzle completion must be a contiguous unique prefix, and progression fields
  are range-checked.
- MINOR gamepad support: connected and reconnected pads map movement, rotate,
  hold, drop, soft drop, and result restart actions.
- MINOR action queue: actions are bounded and cleared or ignored during clear
  phases.
- MINOR clear presentation: non-contiguous rows use per-row collapse origins,
  shatter particles retain each row's colors, and lock streaks retain the
  locked piece position.
- MINOR motion budget: ordinary hard drops and bombs no longer shake the board;
  shake remains for combo, quad, and goal beats.
- MINOR audio loading: music is no longer preloaded before interaction and is
  started lazily through the GGKit audio path after unlock.
- MINOR resize and pool hygiene: sky textures are capped, particle emitters
  use 16-particle caps, safe-area insets are resampled on layout, and the
  service-worker VERSION is bumped to `2026-08-10-fix-round-1`.

Rejected or deferred:

- MAJOR missing `review_evidence/aaa/stacklock/`: this is an external review
  artifact outside the user-authorized `play/stacklock/` work scope, and this
  round explicitly forbids deploy or external evidence writes. No production
  code defect is represented by that finding.
- The review's live-playthrough and deployed-URL evidence requests remain
  unverified because this fix round permits no deploy and no browser backend
  was available. No claim of a live re-capture is made here.

## UI declutter

- Cut the live 60%-width center banner, persistent combo/goal/line text, puzzle-name flavor, and control hint sublabels.
- Shrunk the active HUD to short metric labels plus score/time, progress, level, and piece/hazard counts; replaced HOLD/NEXT words with compact slot icons.
- Moved clear/combo/level events into one queued edge chip (under 1 second), shortened the coach to one timed line, and kept run-boundary information on the results screen.
