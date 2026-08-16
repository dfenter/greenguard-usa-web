# Berry Cascade

Controls: swipe a berry into a neighbour to swap (tap-tap also works); drag the trail to scroll the map. Keyboard: arrows move the cursor, Enter picks up / swaps, Esc = map, R = restart, M = mute, E = endless. Gamepad controls are not advertised.
Loop: 30 hand-seeded groves on a winding trail. Hit every goal (score, syrup, acorns) inside the move budget. Match 4 = line berry, L/T = burst gourd, 5 = prism; swap two specials for combos. Out of moves = instant retry.
Earned, not sold: no lives, no energy, no boosters, no currency. Every special comes from the board. Levels are validated at generation by random playouts and given more moves until a blind random bot clears them.
Also here: Endless Cascade (score chase, escalating move refills and colour count) and a crown screen for a full trail. Stars, per-grove bests and the endless best persist in localStorage.
Files: index.html + js/core.js (rng, storage, audio, fx) + js/board.js (match-3 engine, level gen, validation) + js/game.js (scenes, render, input).

## AAA rebuild

Rebuilt in place on 2026-08-11 to the fleet AAA bar. The archived prototype
(`js/core.js`, `js/board.js`, `js/game.js`, hand-rolled canvas renderer and
WebAudio) is gone; its match-3 rules were the design document and survive,
re-hosted on Phaser 3 + GGKit. Verified in a real browser over CDP at
390x844 dpr2 through every scene, with zero console errors.

### Implemented

Shell and platform
- `index.html` carries `<base href="/play/berry-cascade/">` and loads Phaser
  and GGKit from ABSOLUTE `/play/_shared/` paths, so the deployed no-slash
  URL cannot break them. `viewport-fit=cover`; the safe-area insets are
  published as CSS custom properties and read back by `BCUI.insets()`, so
  every layout is notch and home-bar aware.
- `manifest.json`, `icon.png` (192), `icon512.png`, `favicon.png` (64), all
  original renders of the berry-cascade motif. `sw.js` authored from
  `/play/_shared/sw-template.js` with VERSION `2026-08-11-aaa2` and a
 32-entry precache; every listed path is asserted to exist and every
  shipped non-doc file is listed.
- GGKit is the sole lifecycle, input, save, audio and settings layer:
  portrait rotate gate, visibility pause, restart input clearing, guarded
  localStorage, juice toggle, audio buses.

Files
- `js/sim.js` headless simulation: board, runs, specials, combos, gravity,
  scoring, shuffle, plus the level validator. No DOM, no Phaser, no timers.
- `js/content.js` authored content: berry families, five trail segments, the
  30 groves, the Grove Gauntlet, medal tiers, Endless tuning, save schema.
- `js/art.js` texture bakery. Every visual is drawn once into a canvas
  texture: 24 berry variants, prism, acorn, two syrup layers, focus ring,
  ghost and arrow, stars, medals, 17 icons, four particle textures, trail
  nodes, board frame, cell field, sky gradients.
- `js/fx.js` four preallocated pools (clear fragments, cascade streaks,
  syrup droplets, reward rings) plus the capped frame nudge.
- `js/ui.js` UI primitives written to the noise law, plus the event-driven
  gesture layer.
- `js/play.js` the grove scene. `js/main.js` kit, boot, menu, trail,
  gauntlet, crown, verification hook.

Mechanics (owner priority 1)
- Swipe or tap-tap to swap, both event driven. Instant feedback: the ghost
  and directional arrow appear on the drag, an illegal swap gets a cross
  hatch, an amber arrow and a shake, and the move budget is decremented and
  repainted BEFORE the swap animation starts, so the readout never lags.
- Resolution ladder: 150ms pop, distance-scaled fall (120-340ms), 40-70ms
  view-side hit-stop only at cascade tier 2+, then the next step. Score,
  syrup and acorn counters update the instant the sim applies the clear.
- Specials are unmistakable: powered pieces are drawn broader and brighter
  with an enamel ring, line berries carry directional chevrons plus banding,
  the burst gourd has ribbing and a starburst, the prism is a faceted glass
  disc. Creation gets a ring and a spring pop, detonation gets per-shape VFX
  (row and column sprays, burst ring, prism board sweep) and its own cue.
- Combos (Cross, Triple cross, Mega burst, Prism, Prism lines, Prism burst,
  Board wipe) fire a tiered ring, a capped nudge and a corner chip.

Loop (owner priority 2)
- Berry Trail, 30 hand-seeded groves on a winding drag-scrolled map with
  per-node stars and medals; Endless Cascade with escalating stages, colour
  count and move refills; Grove Gauntlet of six hand-authored levels behind
  an unlock chain. Crown screen on a full trail.
- Medals: stars + move efficiency + combo count, scored 0-7, gold at 6,
  silver at 4, bronze on any clear. Medal points drive the Gauntlet chain
  (a Gauntlet medal is worth two).
- No lives, energy, boosters or currency. Out of moves is an instant free
  retry. Every special comes from the board, and the early groves seed two
  or three starter specials on the opening board.
- Generous budgets: every grove ships 6-13 moves ABOVE what the validation
  bot needed, and the score goal is a fraction of measured achievable score.

Level validation
- The prototype validated with a uniform-random bot, which is far weaker
  than any human: it inflated budgets past 100 moves and shredded the score
  targets. Replaced with a heuristic player that statically scores each
  legal swap (run length, special creation, special detonation, syrup
  coverage, acorn lanes) with goal urgency weights, so it hunts the last two
  syrup cells the way a person does.
- Score targets are no longer hand-picked absolutes. `BC.scoreRun` plays the
  whole budget ignoring goals; the target is a per-segment fraction of the
  median result. This is what stopped grove 1 being cleared in one swipe.
- All 30 groves and all 6 Gauntlet levels are confirmed clearable by the bot
  at generation. Worst single-grove generation cost is about 240ms and grove
  1 is warmed during boot.

World (owner priority 3)

| Segment | Groves | Colours | Score goal | Syrup | Acorns | Moves | Seeded specials |
|---|---|---|---|---|---|---|---|
| Opening Orchard | 1-7 | 5 | 13400-19200 | 0-10 | 0 | 37 | 3 |
| Syrup Marsh | 8-15 | 5 | 14250-20500 | 12-20 | 0-1 | 36-38 | 2 |
| Acorn Forest | 16-22 | 5-6 | 10150-26750 | 0-13 | 2-4 | 36-44 | 2 |
| Lantern Thicket | 23-28 | 6 | 8100-17250 | 14-24 | 2-3 | 38-48 | 2 |
| Berry Cascade Summit | 29-30 | 6 | 22200-23300 | 26-34 | 3-4 | 49 | 3 |

Each segment owns a sky gradient, a board frame material and lip, a cell
field colour, an accent and a signature ambient motif drifting behind the
board (orchard leaves, marsh bubbles, forest spores, thicket embers, summit
petals). Syrup beds are authored per segment as floor, patch, columns,
checker, ring, twin or flood, trimmed to the authored count. The Summit is
the only segment that runs every goal type at once.

| # | Gauntlet grove | Segment | Colours | Score | Syrup | Acorns | Moves | Unlock |
|---|---|---|---|---|---|---|---|---|
| 1 | Bramble Lock | orchard | 5 | 28100 | 32 | 0 | 37 | 5 groves |
| 2 | Acorn Run | forest | 5 | 19600 | 0 | 5 | 33 | 8 groves, 3 pts |
| 3 | Checker Marsh | marsh | 6 | 17200 | 28 | 2 | 39 | 12 groves, 8 pts |
| 4 | Twin Vaults | lantern | 6 | 14800 | 36 | 3 | 53 | 16 groves, 14 pts |
| 5 | Crown Ring | summit | 6 | 12650 | 20 | 3 | 49 | 22 groves, 21 pts |
| 6 | Cascade Crucible | summit | 6 | 17550 | 42 | 4 | 51 | 28 groves, 30 pts |

Each Gauntlet level also requires a medal on the one before it.

Presentation and UI law
- One compact HUD row: move chip, then only the goal chips this grove
  actually uses, each an icon plus a tabular value plus a meter, then the
  settings button. The cluster shrinks uniformly rather than sliding under
  the settings button on narrow screens, and the score is abbreviated past
  10000 so the widest chip cannot break the row.
- Every transient goes through one queue. In-play events (combo, acorn
  delivery, endless stage, reshuffle) are 32px corner chips above the board
  with a hold of at most 1.0s. Centre banners are boundary-only and the
  queue DROPS a banner that arrives during live play.
- Coach text is a single 34px strip in the band above the board, one line,
  fading after 3s, shown at most four times across the whole game.
- Map and retry are icon-only 48px buttons in the bottom corners; nothing
  informational sits in the thumb zone. Board cells are 44px at 390px, and
  every button forces a 44px hit area regardless of art size.
- Colourblind safety: six families each with a distinct silhouette (circle,
  rounded square, hexagon, diamond, shield, octagon), a distinct centre
  glyph, and separated luminance. Syrup layers are coded by pattern (drips
  vs lattice) as well as colour. Acorns carry a down arrow.
- Reduced motion (`kit.juice.enabled` off) removes shake, streaks, motion on
  the motes, the selector breathing and most fragments, and halves ring
  scale, while keeping the focus ring, ghost and hatch, counters, chips and
  every state change. Verified in browser.
- Audio: 13 SFX and 2 music loops, all original procedural MP3 (marimba,
  glass, droplet, filtered noise), all through GGKit buses. Cascade steps
  pitch up per chain. No OGG.

Defect classes explicitly handled
- No large static Graphics in the display list; board frame, cell field,
  cards, chips, rings and glyphs are baked canvas textures. No
  `Graphics.arc` at runtime; the prism, medals, trail nodes and the reward
  ring are hand-tessellated.
- Debug and verification counters read the same pools the renderer uses
  (`fx.stats()`), never a parallel list.
- Render state lives on view-side cell records, never on the sim board.
- Gestures are event driven and seed `kit.input.pointers` at claim time; the
  first build sampled pointers once per frame and silently dropped any tap
  that began and ended inside one frame.
- Scenes are `Phaser.Class` subclasses, so custom methods always exist.
- `__bc` exists from first script evaluation and a switch thrown during boot
  is queued and consumed at hand-off, so the hook works from the boot
  fallback and from a live scene.
- Frame delta is clamped to 50ms: a degraded device gets slow motion, never
  a time skip. Scene pause freezes tweens, timers and the resolution chain
  together.
- `FAMILY[variant]`-style lookups are all guarded (`segmentFor`,
  `segmentById`, `familyAt`, `berryKey`, `groveName`, `buildGauntlet`).
- `parent: document.body`, never null. `Container.add()` return value is
  never used as a child reference. No `postrender` subscription.
- The scrim, header bar, segment bands and coach strip are baked dark rather
  than tinted white, because tint is WebGL-only and a canvas fallback turned
  the results scrim into a white veil.
- `scale.off('resize')` with no handler was removing every listener on the
  manager; each scene now removes only its own.
- Falling pieces are clipped to the board well by a geometry mask, so a
  refilling berry cannot draw over the frame, the grove name or the HUD.

### Measurements

- Payload 644KB total (budget 2.5MB). Largest file `theme_grove.mp3` at
  131KB (budget 400KB per file). No CDN, no network at runtime.
- Unthrottled, 390x844 dpr2: median frame 16.7ms, p99 16.8ms, 3 of 600
  frames over 33ms idle and 16 of 600 during continuous cascading play.
- `node --check` passes on all seven scripts and `sw.js`; the real parse is
  covered by the browser runs.

### Deferred

- The 4x-throttle budget could not be measured honestly here. Headless
  Chrome on this box has no hardware WebGL, so Phaser falls back to the
  CANVAS renderer and rasterises on the throttled main thread; the blank
  control page alone spikes about 50 of 600 frames over 33ms at 4x, and the
  game reads median 33ms. Unthrottled it is a clean 60fps. This needs a
  re-measure on a real device or a GPU-backed harness before the perf gate
  can be signed off.
- The Berry Terrace is now the earned place. Three authored restoration steps
  unlock at the orchard, marsh and full-trail chapter rewards and persist in
  the save.
- Trail nodes now carry per-segment accent and motif marks in each state.
- Endless has no separate leaderboard surface beyond the menu stat line.
- Grove generation is warmed one validated grove per idle slice after boot,
  so the next trail entry does not pay the full validation cost.
- Colourblind simulation was reasoned from the palette's luminance and
  shape coding rather than run through a deuteranopia, protanopia and
  tritanopia preview.

## Fix round 1

Fixed:

- Major 1: added a deterministic guided first move for match 3, clearing,
  falling and refill; tutorial progress saves only after the move settles.
- Major 2: moved syrup above berry sprites and made one-layer and two-layer
  patterns readable at cell size.
- Major 3: added a visible resolve ring with a snap pulse and ready-state
  cleanup.
- Major 4: apply-clear, scoring and gravity now advance immediately; only the
  cosmetic hold is juice-gated.
- Major 5: reduced motion removes pop, landing and special overshoot/scale
  motion, including the crown pulse.
- Major 6: gesture releases are discarded when GGKit has cleared the pointer
  during pause.
- Major 7: validated trail groves warm one at a time during idle slices.
- Major 8: added the persistent Berry Terrace with three chapter reward
  restorations.
- Major 10: bumped the service-worker cache to `2026-08-11-aaa2`.
- Major 11: Enter and Space now swap an adjacent selected cursor cell.
- Minor 1: every landing gets a pooled streak and a 1.04x settle pop when
  juice is enabled.
- Minor 2: added the documented E endless binding and removed any gamepad
  promise from the controls text.
- Minor 3: seeds reduced motion from the system preference before scenes.
- Minor 5: trail nodes now use segment-specific accent and motif treatments.
- Minor 6: save normalization now repairs impossible rewards, unlocks,
  crowns, endless stages and terrace progress.

Rejected:

- Major 9 and Minor 4: the requested deployed 4x performance and colour
  simulation evidence cannot be honestly staged under the no-deploy and
  work-only-in-this-directory constraints. The local server was unavailable
  in this sandbox, so no external evidence or sign-off is claimed.

## Retina pass 2026-08-16

- Before ratio: 1.00x source baseline at DPR 3. After ratio: 3.00x configured
  through `GGKit.hiDpi.resize(game, cssW, cssH)`; a live canvas ratio could
  not be measured because Chrome aborted in this sandbox and the private HTTP
  bind was denied.
- Recipe: applied Phaser Scale.RESIZE hi-DPI sizing at boot, resize,
  orientation-change, and visibility events. Applied `GGKit.renderDefaults`
  and `resolution: GGKit.hiDpi.dpr()` to Phaser UI text.
- Factor cap: none beyond the GGKit maximum of 3. No title-specific cap was
  needed.
- Could not complete the live DPR 3 gameplay screenshot or layout check.
  Existing authored canvas bakes were left at their logical sizes because a
  frame-unit migration to `GGKit.hiDpi.canvas(...)` could not be live-verified.
