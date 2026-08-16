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

## Round 2 polish

Rev 2026-08-13. Shipped-to-modern-commercial pass. Nothing was rebuilt: the
accepted controls, the DAS/lock feel, the four original board identities, the
24 original Puzzle boards, the pickups, the coach and every behaviour
documented above still work exactly as written. Everything below is added on
top. No asset file was added; no ledger row was consumed; no deploy, no
commit, no subagent.

### What changed visually

- **Screen transitions are animated.** A DOM shutter (its own layer, so it
  survives the scene swap it is hiding) closes over a fade, runs the swap, then
  lifts. Title, puzzle grid, records, every play start, every restart and every
  return to menu go through it. Reduced motion shortens the beat to a cover.
  `applyForce()` skips it so a harness never waits out a cosmetic beat.
- **The background evolves by level.** `bakeSky()` now takes a TIER and walks
  each identity's cool stops toward its authored `skyHot` stops, and the baked
  motif changes with it. Marathon steps every 5 levels, Ultra every 4, Rival
  every 3; Sprint and Puzzle deliberately stay on one grade so a board never
  changes colour mid-solve. Tier changes CROSSFADE across two quads over 900 ms
  instead of popping. Each identity now owns a distinct baked motif (grid,
  rule, overclock rings, cog, ember) instead of the one shared diagonal.
- **The board frame reacts to the combo tier.** A single stroked rounded rect
  (`rimG`) thickens and shifts hue at combo 2, 3 and 6 and on back to back, and
  breathes outward on the pulse. Amplitude stays inside the bible's cap and the
  grid geometry never deforms.
- **Danger state near the top out.** Two grades, driven by stack height
  (13 rows warn, 16 critical). Warn recolours the rim; critical adds a pulsing
  double rim, an additive red wash behind the board, and a slow low tick. It is
  a colour and audio STATE, never a banner, so it adds no UI coverage.
- **Piece lock reads as an impact.** Locked cells now squash and recover
  individually (`cellView.pop`), hard drops throw contact dust scaled by drop
  distance, and the lock cue is pitch-shifted between a soft lock and a slam.
- **Line-clear cascade escalates properly.** One `celebrate(tier)` ladder:
  tier 1 dry accent, tier 2 sparks plus a rim pulse, tier 3 ring plus shards
  plus shake and a 55 ms hit-stop, tier 4 (perfect clear, or back to back
  quad/spin) adds the reward burst, a white ring and a board-wide light sweep
  travelling bottom to top, at a 70 ms hold.
- **Ghost and queue polish.** The ghost breathes and carries the piece's own
  hue; two faint column guides and a bright landing pad now run from the piece
  to its seat in every state, so the landing is legible without hunting for the
  ghost. The next queue slides one slot on consumption instead of teleporting,
  the head preview is larger and brighter, and the hold slot pops on a swap and
  dims while spent.
- **Result ceremony is animated.** Veil, then the card springs in on ease-out
  back, then the copy fades up, then the buttons, then the score ticks to its
  total on an eased count-up and the medal pops.
- **Title screen moves.** Piece silhouettes drift behind the menu, the logo
  bobs, cards stagger in on ease-out cubic, and every mode card carries an
  identity colour bar so the menu uses the same per-area palette the boards do.
- **Fourth pooled particle system** (`fx.dust`) for buried-row and hard-drop
  contact, alongside the existing shard, spark and reward systems.

### What changed in gameplay

- **T-spins.** Full three corner rule with the front-corner mini distinction
  and the last-kick exception. Spins score off their own table, count toward
  back to back alongside quads, pay even with zero lines cleared, and send the
  heaviest garbage in Rival.
- **Perfect clear.** Emptying the board on a clear pays a level-scaled bonus,
  fires the hero celebration and sends 10 rows in Rival.
- **ULTRA 2:00 (Overclock).** New mode. Two minutes on a countdown; gravity
  ramps every 18 s from level 4 to a cap of 16 regardless of your clear rate,
  so the pressure is the clock. Own medals at 6k/12k/20k/32k.
- **RIVAL (Duel Works).** New mode, and the round's largest system. A complete
  second simulation on the same rules, on its own board in the rail, played by
  `sl_ai.js`: for every rotation and every column it builds the resulting board
  in a preallocated scratch buffer and scores it with the Dellacherie feature
  set, with an optional full second ply over the next piece. Three earned
  tiers - APPRENTICE (open), CONTENDER (2 wins), ARCHITECT (5 wins) - differ
  only in hand speed, error rate and lookahead; the rival never cheats. Clears
  on either board send buried rows to the other, outgoing rows cancel your own
  incoming queue first, and a board pushed above its ceiling tops out. Win by
  KO, lose by being buried. The tier cycles from the rival card on the title.
- **Personal best table per mode.** Top five per mode, kept sorted (high for
  Marathon and Ultra, low for the Sprint clock and the Rival KO time), on a new
  RECORDS page with a career panel: T-spins, quads, perfect clears, best combo,
  lifetime lines, boards cleared.
- **Six new Puzzle boards (25-30), the spin school.** Every one is a real T
  slot: a roof block makes the seat unreachable by a straight drop, so the only
  way in is a rotation kick. 25 Turn One, 26 Mirror Turn, 27 Double Turn (the
  last column only opens after the spin drops the rows), 28 Wall Turn, 29 Twin
  Slots, 30 Lockspin (hazards leave on the spin). The set is now 30 boards and
  the unlock chain is unchanged.
- Rival gravity ramps on YOUR clear rate (level 4 to 12 over 96 lines), so
  outpacing the AI also raises the speed you must absorb its rows at.

### Save migration

`SAVE_VERSION` 1 -> 2. GGKit is handed `validateAnySave`, which accepts BOTH
shapes, so a version 1 blob survives the read instead of being dropped as
corrupt; `migrateSave()` then does the upgrade and the result is re-validated
before it is accepted. New fields: `bestUltra`, `ultraMedal`, `rivalMedal`,
`rivalWins`, `rivalTier`, `rivalStreak`, `records` (four capped top-five
lists), `career` (six counters). The migration copies every version 1 field
verbatim, seeds `records.marathon` / `records.sprint` from the old single
bests so a returning player's history is on the records page at first boot,
and seeds `career.lines` from `bestLines`. Anything that satisfies NEITHER
validator returns null and the caller falls back to a fresh profile: no throw,
no partial profile. The v2 validator additionally range-checks every record
list, rejects an unknown record mode or career key, and refuses a `rivalTier`
the banked `rivalWins` has not earned.

Verified in the browser: a hand-written v1 blob (12,345 score / 92 lines /
2:13 sprint / silver+silver / p01-p03 done) came back as v2 with the bests,
the medals, the unlock chain (4 boards open) and both seeded record tables
intact, and `{"v":1,"bestScore":"nope"}` degraded silently to a fresh profile
with zero errors.

`sw.js` VERSION is `2026-08-13-round2-polish-1` and the precache list gained
`sl_ai.js`; all 43 entries were asserted to exist on disk.

### Budgets

- Payload 996,093 bytes (0.95 MB) against the 2.5 MB cap. Largest file is
  still a 200,665 byte music stem; `game.js` is 193,853 bytes, both under the
  400 KB per-file cap. Round 2 added 72 KB of code and zero asset bytes.
- Nothing new allocates during play. The rival board is a canvas texture
  repainted only on the frames its grid changed (about once a second) and drawn
  as ONE quad, not 200 sprites; its live piece rides four pooled sprites. All
  new effects reuse the existing pools plus one 16-particle dust emitter, and
  everything is pre-warmed by the loading screen's existing texture warm pass.
- The Sprint/Ultra/Rival progress ring was re-tessellated by hand to 48
  segments and its redraw gated on a fraction quantised to 1/48. `Graphics.arc`
  walks its sweep in 0.01 rad steps and replays that command list EVERY frame,
  so the Ultra clock (a value that changes every frame) would otherwise have
  minted 1,250 vertices per frame forever. This was found and fixed before it
  shipped, not after.
- Sky bakes are capped at 5 keys per scene because a tier crossfade holds two
  live quads at once; a cap of 4 could have evicted a texture still in use.
- Feel, 4x CPU throttle, 390x844 dpr2, ~810 frame windows with a realistic
  input cadence: Rival median 16.70 ms, p95 16.80 ms, 9 frames over 33 ms
  (1.1%), max 66.7 ms. Marathon median 16.70 ms, p95 16.80 ms, 6 over 33 ms
  (0.7%), max 50 ms. Both against the 17.5 ms median budget. Caveat, same as
  round 1: the box carried a 1-minute load average of 6 and a 15-minute average
  of 175 from other lanes during the capture. A capture that hammered a hard
  drop every 500 ms (not a human cadence) pushed the tail to 8%, so the tail
  number still wants an uncontended box to be called final.

### UI Law

No new persistent element except the Rival incoming-garbage column, a 5 px bar
hugging the board's inner left edge that replaces nothing. The reward chip is
still ONE queued transient with a precedence order (perfect clear, then spin,
then quad, then combo) so the rarest read wins instead of the noisiest. The
danger grade and the combo tier are carried by the board frame and the sky, not
by text. Records is a menu page and never appears during play. The bottom
title row is three 46 px buttons at 14 px text, all above the 44 px target
floor.

### Verified

`node --check` passes on `game.js`, `sl_data.js`, `sl_ai.js` and `sw.js`.
Driven in headless Chrome at 390x844 dpr2 with ZERO page errors, ZERO console
errors and ZERO failed requests across: boot to title, all six mode cards, the
30-board puzzle grid, the records page, the settings shell, Marathon, Sprint,
Ultra (clock counting down, level ramping to 6), Master Clear, Rival, the
`forceMode` and `forceBoard` hooks, touch hard drops through the DOM control
bar, and a `prefers-reduced-motion: reduce` boot in every mode.

Systems proved by driving the real game, not by inspection:

- T-spin double on board 25 (rotate into the shaft, soft drop, rotate again):
  `spins` 1, 2 lines, 3,615 points, board won.
- Quad plus perfect clear on board 20: `quads` 1, `perfects` 1, 4 lines,
  12,926 points, board won.
- Rival duel, player idle, APPRENTICE tier: the AI stacked, cleared 14 lines in
  50 seconds, sent buried rows (observed arriving and being applied), drove the
  player's board into danger grade 1 and then to a top out. Danger grade 2 was
  captured on Master Clear with the red rim, red wash and amber focus ring.

### Deferred

- The 600-frame over-33 ms tail still wants an uncontended box, exactly as in
  round 1. The numbers above are inside budget but were taken under load.
- A Rival KO was not driven end to end by a scripted player (it needs a human
  or a second AI on the player board); the win path is the same `win()` the
  Puzzle and Sprint clears exercise, and `rivalKO()` was reached in code by the
  spawn-collision and garbage-push checks.
- Solvability of the six new spin boards was reasoned from the kick tables
  rather than proved by search; board 25 was solved end to end in the browser.
  The generous-hand rule still applies (every board ships spare pieces).
- The colour-blindness simulation the bible asks for is still outstanding, as
  in round 1. The new garbage cell uses the shell frame and a desaturated grey,
  which is a silhouette and value difference, not a hue difference.
- Nine new audio beats are the existing cues re-voiced by playback rate rather
  than new files. This keeps the payload flat and the format law satisfied, but
  a bespoke spin chime and a bespoke perfect-clear fanfare would read better.
- No deploy and no commit were performed, per the brief.
