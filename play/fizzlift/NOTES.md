# Fizzlift

Controls: swipe (or tap two neighbours) to swap; arrows move the cursor, Enter selects then arrows swap; R restart, M mute, Esc deselects or pauses. Keyboard and touch only; gamepads are not supported.
Loop: below the glowing fizz line pieces FLOAT up, above it they FALL down; matches cascade in both directions at once.
Goal: float every bottle cap to the fizz surface and crack all valve seals inside the move budget; broken seals raise the fizz line permanently, and the line also waves mid-level.
20 levels with stars plus Endless Fizz (each surfaced cap pays back 2 moves). No lives, no gates, instant retry; stars/best saved locally.

## AAA rebuild

Fleet F11 uplift to the flagship bar, rebuilt in place 2026-08-11. The archived
prototype's concept is intact: the glowing fizz line splits gravity, pieces
below it float up and pieces above it fall down, cascades resolve in both
directions at once, caps must reach the surface, seals must be cracked, and a
broken seal raises the line permanently. Everything under this heading is new.

### Implemented

**Structure.** `index.html` (base href `/play/fizzlift/`, engines loaded from
ABSOLUTE `/play/_shared/` paths), `manifest.json`, `icon.png` / `icon512.png` /
`favicon.png`, `sw.js` authored from `_shared/sw-template.js`, `LICENSES.md`,
and five modules: `js/core.js` (math, RNG, procedural audio bank, change
guards, safe-area probe), `js/data.js` (families, vats, levels, medals, save),
`js/board.js` (simulation), `js/art.js` (procedural texture bakery),
`js/game.js` (Phaser view, HUD, modes, lifecycle). Total payload 264 KB,
largest file 79 KB. No CDN, no network, no `assets/` directory, no font
payload, original IP only.

**Mechanics.** Instant swap feedback: pointer-down selects, a drag past 30
percent of a cell shows a solid landing ghost plus a directional marker for the
side of the line the target sits on, and an illegal target shows a cross-hatch
instead. An illegal swap never spends a move and never touches the sim: it
plays a view-only nudge. Accepted swaps pop both cells on contact, then the
resolution runs as a stepped state machine (swap, clear, fall, endstep) whose
timers advance on a clamped frame delta, so a degraded device runs the
resolution in slow motion and never time-skips.

Float/fall direction is stated four ways at once: a translucent fizz body
behind the pieces, a thin fizz glaze over them, persistent up/down markers
pinned to the board edge on each side of the line, and clear-trail particles
whose direction is keyed to the side the clear happened on (bubbles rise in the
fizz, motes fall in the air). The line itself is seven pooled Images per
column, eased toward its target, with a foam-beaded additive crest.

Caps are BUOYANT: inside a fizz column a cap climbs past ordinary pieces one
position per move, so raising the line rewards the player instead of stranding
the goal deeper. Caps pay out in a three-row surface band. Seals take two hits
from any clear touching them including diagonals, and breaking one opens a
valve that lifts the line permanently around that column, with a foam burst, a
frame nudge and a corner chip. The move readout is change-guarded and never
lags a refund.

**Loop.** Three modes. The 20-level Fizzlift ladder across four vats with
per-level medals and a level-unlock chain. Seal Rush: eight hand-authored
dense-seal levels (6 to 12 seals) where every cracked seal refunds moves,
gated by an unlock chain (three medals opens rush 1, then each rush level opens
the next). Endless Fizz: rolling rounds, each surfaced cap pays back 2 moves,
a cleared round grants +6 and rebuilds in the next vat, best score and best
round persisted. Medals are bronze/silver/gold on move efficiency, and
surfacing MORE caps than the goal promotes one tier, so over-generous play is
never punished. Move budgets are deliberately generous and every cap refunds
moves on top of the budget. No lives, no gates, instant retry.

**World.** Four authored vats, each with its own backdrop, frame material and
frame treatment, fizz colour, foam colour, bubble density and rise speed, and
line behaviour. The Overflow vat additionally creeps the whole line upward on a
timer, on top of the wave and the valve rises.

**Presentation.** Colourblind-safe soda palette from the puzzlepop bible, with
every family triple-coded: distinct silhouette (circle, hexagon, clipped
square, shield, diamond, octagon), distinct luminance step, and a distinct
centred glyph. Three pooled particle systems (clear fragments, directional
float/fall trails, reward celebration) plus a baked board-rim ring for combos.
Escalation ladder: a single clear is a dry pop, cascades step the pitch, combos
add the rim, a capped frame nudge and hit-stop, and the medal ceremony gets the
only long fanfare. All shake, hit-stop, overshoot and confetti route through
`ggkit.juice.enabled`, seeded from `prefers-reduced-motion`; reduced motion
keeps every focus ring, ghost, glyph, meter and state.

Audio is synthesised in code at boot into WAV blobs and registered with the
GGKit bus, which stays the sole audio implementation: 14 distinct SFX plus two
loopable music states. Zero audio files ship, so no `ogg` can exist.

**UI Noise Law.** One transient at a time, enforced (a banner explicitly stands
a live chip down and hides it, which the first pass got wrong). During play the
only transients are a single corner chip under the HUD (about 2 percent of the
screen, 1.0s hold, fast fade) and a thin 26px top coach strip that fades to
near-transparent. Centre banners appear only at run boundaries (level start,
medal ceremony, vat complete, out of moves, endless round) and wrap inside
their own 60-percent plate. The persistent HUD is three icon chips, no word
labels; the score chip replaces the seal chip only in Endless. Controls are
icon-only, 56 to 60px, in the bottom corners with the middle of the thumb row
left empty. Everything reads safe-area insets.

**Verification hook.** `window.__fz.state` is a preallocated object shared by
the boot fallback and the live scene, carrying `mode`, `level`, `round`, `vat`,
`vatName`, `levelName`, `fizzLine` (mean row) and `fizzLineCols`, `moves`,
`movesMax`, `movesUsed`, `seals`, `sealsTotal`, `sealsBroken`, `caps`,
`capsGoal`, `score`, `best`, `chain`, `medal`, `phase`, `transients` and
`reducedMotion`. `forceMode` / `forceLevel` / `forceRound` are one-shot
switches honoured from the boot fallback, from the menu and from the live play
scene. `window.__fz` also exposes `game`, `kit`, `save()` and `resetSave()`.

### Vats

| # | Vat | Levels | Identity | Line behaviour |
|---|---|---|---|---|
| 1 | Sunfizz Vat | 1-5 | Warm amber glass, brass frame, ribbed trim | Calm; flat, tilted and bowl profiles, wave 0-1 |
| 2 | Deepfizz Tank | 6-10 | Deep indigo, steel frame, riveted trim | Deep line, large fizz region, wave 1-2 |
| 3 | Waveline Reservoir | 11-15 | Teal glass, verdigris frame, wave trim | Wave 2-3, travels every 3 moves |
| 4 | Fizzlift Overflow | 16-20 | Magenta crisis vat, violet frame, hazard chevrons | Fastest rise: wave, valve lifts AND a timed creep |

### Fizzlift ladder

| Lv | Vat | Name | Moves | Caps | Seals | Line profile | Wave / every | Cap refund |
|---|---|---|---|---|---|---|---|---|
| 1 | 1 | First Pour | 30 | 7 | 0 | Flat pour | 0 / - | +1 |
| 2 | 1 | Cap Float | 30 | 8 | 1 | Flat pour | 0 / - | +1 |
| 3 | 1 | Tilted Glass | 32 | 9 | 2 | Tilted glass | 0 / - | +1 |
| 4 | 1 | Fizz Bowl | 32 | 9 | 2 | Fizz bowl | 1 / 6 | +1 |
| 5 | 1 | Sunfizz Surge | 34 | 10 | 3 | Tilted glass | 1 / 5 | +1 |
| 6 | 2 | Down the Tank | 38 | 10 | 3 | Domed head | 1 / 5 | +1 |
| 7 | 2 | Pressure Head | 40 | 11 | 3 | Fizz bowl | 1 / 5 | +1 |
| 8 | 2 | Backwash | 40 | 11 | 4 | Backwash | 1 / 4 | +1 |
| 9 | 2 | Domed Head | 42 | 12 | 4 | Domed head | 2 / 4 | +1 |
| 10 | 2 | Deep Seal | 42 | 12 | 5 | Fizz bowl | 2 / 4 | +1 |
| 11 | 3 | Rolling Wave | 44 | 13 | 4 | Rolling wave | 2 / 4 | +1 |
| 12 | 3 | Swell Line | 44 | 13 | 5 | Rolling wave | 3 / 3 | +1 |
| 13 | 3 | Comb Split | 46 | 14 | 5 | Comb split | 3 / 3 | +1 |
| 14 | 3 | Crosswave | 46 | 14 | 6 | Swell | 3 / 3 | +1 |
| 15 | 3 | Reservoir Break | 48 | 15 | 6 | Comb split | 3 / 3 | +1 |
| 16 | 4 | Overflow Gate | 48 | 15 | 6 | Flat pour | 2 / 3 | +2 |
| 17 | 4 | Rising Head | 50 | 16 | 7 | Backwash | 3 / 3 | +2 |
| 18 | 4 | Valve Storm | 50 | 16 | 7 | Tilted glass | 3 / 2 | +2 |
| 19 | 4 | Last Bowl | 52 | 17 | 8 | Fizz bowl | 3 / 2 | +2 |
| 20 | 4 | Fizzlift | 54 | 17 | 8 | Rolling wave | 3 / 2 | +2 |

### Seal Rush

| # | Vat | Name | Moves | Caps | Seals | Cap refund | Seal refund | Unlocks |
|---|---|---|---|---|---|---|---|---|
| 1 | 1 | Six Seals | 34 | 2 | 6 | +2 | +2 | 3 medals earned |
| 2 | 1 | Bowl Cluster | 34 | 3 | 7 | +2 | +2 | Clear Six Seals |
| 3 | 2 | Tank Manifold | 36 | 3 | 8 | +2 | +2 | Clear Bowl Cluster |
| 4 | 2 | Nine Valves | 36 | 3 | 9 | +2 | +2 | Clear Tank Manifold |
| 5 | 3 | Wave Manifold | 38 | 4 | 9 | +2 | +2 | Clear Nine Valves |
| 6 | 3 | Split Pressure | 38 | 4 | 10 | +2 | +2 | Clear Wave Manifold |
| 7 | 4 | Overflow Bank | 40 | 4 | 11 | +2 | +3 | Clear Split Pressure |
| 8 | 4 | Full Manifold | 44 | 5 | 12 | +2 | +3 | Clear Overflow Bank |

### Verification performed

Driven in real headless Chrome at 390x844 dpr2 portrait over CDP, with swipes
dispatched as real pointer events through the GGKit pointer map (not by calling
scene methods).

- `node --check` passes on all six changed JS files, and every file also boots
  in a real browser parse with zero exceptions.
- All 20 ladder levels and all 8 Seal Rush levels bot-played end to end. 26 of
  28 cleared with a naive hint-following bot that never targets seals; the two
  that did not (levels 6 and 11 of an earlier pass) drove a +4 move budget bump
  across vats 2 to 4. Roughly 900 bot moves, zero console errors.
- Modes, force switches, resize to 430x932 dpr3, keyboard restart, and the
  visibility pause path all verified live. 27 network requests, all 200/304.
- `sw.js` precache checked entry by entry against the filesystem: 13/13 exist.
- Perf at 4x CPU throttle during active play: median 16.7ms, p95 16.8ms
  (budget 17.5ms median).

### Bugs found and fixed during the rebuild

- **Pointer releases were being swallowed.** The pointer bridge read live ids
  from the GGKit Map (numbers) but swept released ids from an object (strings),
  so `dragId !== id` rejected every release and no swipe ever became a move.
  Ids are now normalised to strings on every path.
- **`testSwap` scanned the whole board.** Each candidate rebuilt the entire run
  list, so one `hasMove` cost 126 allocating full-board scans and produced
  100-300ms frame spikes at 4x throttle. An adjacent swap can only create a run
  through the two cells it touched, so it now checks only those two lines,
  allocation free.
- **A rising line made the cap goal harder.** Breaking seals grew the fizz
  region, which pushed caps further from the surface, inverting the reward.
  Caps are now buoyant, applied once per move rather than per cascade step
  (per-step buoyancy let a lucky opening chain clear a whole level in one
  swipe).
- **Transients could stack.** Showing a banner zeroed the corner chip's timer
  but left it painted, because the fade branch stops running at ttl 0. The
  banner now hides the chip outright.
- **Timers leaked across levels.** The results-screen button build is a delayed
  call; switching levels while it was pending pasted Retry/Next over a live
  board. `startLevel` now cancels all pending delayed calls and restores the
  standard corner controls.
- **Both direction arrows were baked upside down**, so every float/fall marker
  pointed the wrong way.
- **A dead board could not always be revived.** Permuting existing colours can
  be provably unable to yield a legal move; the shuffle now falls back to
  repainting, because an unwinnable board in a game with no lives is a dead end.
- Banner copy could overrun its own 60-percent plate; the plate now sizes to
  the wrapped copy and the copy wraps.
- On the ladder select screen a locked tile drew its level number and the lock
  glyph on top of each other, and the vat legend ran off the left edge of a
  390px frame. Locked tiles now show the lock only, and the legend lays out in
  two columns inside the margins.

### Deferred

- **Frame-spike budget not adjudicated.** Median and p95 pass comfortably, but
  the absolute "at most 6 frames of 600 over 33ms" count cannot be judged on
  this machine: headless Chrome renders through software GL here, and a shipped
  flagship control (`skyfall-command`) measured 103 spikes per 600 frames under
  the identical harness while Fizzlift measured 20 during active play. Re-run
  on a GPU-backed box before signing the gate.
- **Colour-vision simulation not run.** The palette is taken from the bible's
  validated tokens and every family is triple-coded by silhouette, luminance
  and glyph, but a deuteranopia/protanopia/tritanopia preview pass has not been
  performed.
- **Not deployed and not committed**, per the brief.

## Fix round 1

Fixed:

- Critical play-scene crash: initialized `pendingSpawn` before the first render and spawn consume.
- Restart and transition anchors: reset touch, drag, keyboard, hint, and medal state for every run.
- Controls: added a GGKit pause and resume overlay, made Esc deselect an active choice or pause, and documented keyboard and touch support.
- Tutorial: the first ladder coach now teaches tap or swipe, matching 3, and fizz float direction.
- Bottle motion: added authored idle, rise, and fall piece poses with bob, lift, lean, and motion-specific baked marks.
- Landing ghost: raised the legal ghost above board pieces so the target preview remains visible.
- Meta progression: added a persistent vat room with four saved restoration states derived from campaign medals.
- Hint playthrough: hints now prioritize legal clears that damage seals; the deterministic ladder and Rush sweep clears every authored level.
- Save validation: campaign unlocks now require a contiguous campaign prefix, and Rush medals require the campaign gate plus a contiguous Rush prefix.
- Service worker: bumped the cache version to `2026-08-11-aaa-fix-round-1`.
- Cheap minors: hit-stop now freezes resolution and view clocks, invalid selectors return to ready, keyboard swaps retain resolve pose, medals republish as zero on a new run, coach strips queue behind banners and use `SAVE.seen`, goal fanfare ducks music, and the home `/20` counter counts campaign medals only.

Not changed:

- Gamepad input was not added because GGKit exposes keyboard and touch input only; the supported control set is now documented.
- Colour-vision simulation and the GPU-backed frame-spike capture remain verification-only gates. The available environment had no browser surface for those runs, so no speculative code change was made.

## Retina pass 2026-08-16

- Target 390x844 CSS at DPR 3. Before ratio: 1.00x CSS-sized RESIZE baseline. After target: 3.00x, 1170/390, via `GGKit.hiDpi.resize`. Live canvas read was unavailable because no browser surface or private local listener was available.
- Recipe: `Phaser.Scale.RESIZE`, `GGKit.renderDefaults`, `GGKit.hiDpi.canvas` texture baking, and DPR-matched Phaser text. No factor cap.
- Gameplay screenshot and runtime backing-store measurement remain deferred. No palette change was made because the retina law identifies density, not colour depth, as the defect.

## Retina pass 2

- Delayed DPR 3 canvas ratio: not measured. The slug-derived private harness port was rejected with `EPERM`, and headless Chrome aborted before creating a page. Configured `cfg.ggDpr` is 3.00 at the audit viewport.
- Converted boot to `GGKit.hiDpi.phaser` with `Phaser.Scale.NONE`, retained render defaults and dense canvas baking, and changed Phaser text to dense font sizes with inverse object scale.
- All relayout and viewport-dependent geometry now derives from Phaser scale dimensions normalized by `cfg.ggDpr`; scene cameras set zoom and center on their viewport midpoint.
- Gameplay screenshot, render-loop probe, and core input proof could not be completed because the local browser infrastructure was unavailable.
