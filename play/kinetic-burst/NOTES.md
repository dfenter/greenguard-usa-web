# Kinetic Burst

Drag across the board to trace a path through the ki orbs. Every run of three
or more matching orbs fires the fighter of that element at your target, and
every extra run in the same trace raises the chain multiplier. Gold heart orbs
mend the whole team instead.

Controls: drag to trace, release to fire, or let the 6.5 second trace timer
fire it for you. Tap an enemy card to change target. Tap a fighter card to put
that fighter in front; tap a card marked Burst to launch a super, then tap
again in the gold zone for up to double damage. Keyboard: arrows move the
cursor, space starts and commits a trace and taps the clash, 1 2 3 pick a
fighter, Q and E change target, R restarts, P or escape pauses.

Goal: clear thirty stages of the Burst Road across five arcs, earn all nine
fighters, then take the Trial Gauntlet and the Endless Surge. Ki triangle:
Power beats Speed beats Focus beats Power, at x1.50, x1.00 and x0.67. Enemies
show their next hit and how many turns away it is, one turn ahead, always.

---

## Dev notes

### Preserved prototype behaviour (design document)

Every constant below carries over from the archived prototype and is surfaced
in the in-game Numbers panel (the prototype's MATH panel):

| Constant | Value |
|---|---|
| minRun | 3 |
| maxPath | 30 |
| traceTime | 6.5s (+1.5s with Nix Aravel) |
| chargePerOrb / chargeBonusPerExtra | 14 / 8 |
| comboStep | 0.25 per extra scoring run |
| healPerOrb | 6 |
| fullCharge / overcap | 100 / 200 |
| heart orb rate | 0.19 |
| clashWindow / perfect / good / late | 1.7s / x2.00 / x1.40 / x0.75 |
| ki triangle | Power > Speed > Focus > Power, x1.50 / x1.00 / x0.67 |
| enemy curve | hp 66 + r*34, atk 8 + r*3.0, speed 3 (2 from r>=6) |

Behaviours preserved: fluid trace with backtracking (stepping onto the
previous cell pops it), gap walking when a fast drag skips cells, the trace
timer auto-firing, tap to target, the timing-tap clash, hearts healing the
whole team, three fighters swapped in and out, enemies telegraphing damage and
turn count a full turn ahead, and the Numbers panel showing every rate.

Deliberate changes: the board is 7x5 (the brief's spec) rather than the
prototype's 6x5, and the eight round ladder becomes a thirty stage campaign
whose difficulty curve is the same 0..7 ladder value made continuous, so per
stage pressure matches the prototype.

### Architecture

- `js/content.js` registries, stage and trial tables, save schema, validation.
- `js/sim.js` pure battle sim. No Phaser, no DOM, no clock of its own; the
  view calls trace / commit / burst and animates the returned report.
- `js/art.js` texture bakery. Nothing static is left as a Phaser Graphics
  object; orbs, board frame and cell field, backdrops, parallax bands, boss
  silhouettes, badges, cards, bars, rings and icons are baked canvas textures.
  The only Graphics in the game is the trace line, at most 30 segments.
- `js/fx.js` five preallocated pools, no allocation during play.
- `js/ui.js` UI primitives written to the UI noise law, plus gestures.
- `js/play.js` battle scene. `js/main.js` GGKit lifecycle, menus, boot, hook.

### Named defect classes handled

- Pointer release: GGKit's own window listener drops a pointer id before a
  later listener sees the same `pointerup`, so `KBUI.gestures` treats its own
  live map as the authority for a release and seeds `kit.input.pointers` at
  claim time. Every listener is on window, added after GGKit init.
- Debug counters read the same pools the renderer draws from (`fx.stats`).
- Per-entity render state lives on the view card, never on a sim object.
- Test switches (`window.__kb.forceMode` / `forceStage`) work before Phaser
  exists (queued through `pendingScene`) and against the live scene.
- No clock advances past the stepped sim: a juice hit-stop frame returns
  before the trace timer is ticked.
- Guarded lookups: `KB.fighter`, `KB.stage`, `KB.arc` and `KB.trial` all clamp
  and never return undefined; a hand edited save is repaired by
  `KB.normalizeSave` (starters relocked, team deduplicated against the roster).
- Phaser specifics: `parent: document.body`, `new Phaser.Class` scenes with
  named methods, hand tessellated ring texture instead of `Graphics.arc`,
  change guarded `setText` / `setColor` / `setTint` / `setAlpha`.
- `sw.js` precaches only files that exist in the shipped directory.

### Verification hook

`window.__kb = { version, state, save, stages, arcs, forceMode(mode, arg),
forceStage(n), unlockAll(), reset() }`. `state` carries scene, mode, stage,
trial, turn, wave, hp, score, over, won, enemies, alive, phase and live
particle pool counts. Modes accepted by `forceMode`: road, endless, trial,
map, menu, roster, trials, crown.

### Content inventory

| Item | Count |
|---|---|
| Burst Road stages | 30 (5 arcs of 6, arc 6 is a boss stage) |
| Waves per stage | 2, 3 from stage 23, boss stages 3 |
| Arcs | Ashfall Ward, Skyloft Ring, Crater Reach, Glass Foundry, Burst Core |
| Fighters | 9, each with its own passive and burst |
| Bosses | 5 authored silhouettes |
| Trials | 6 fixed team gauntlets with their own rules |
| Endless Surge | unbounded, boss every fifth surge |
| Levelling | 10 levels per fighter, 120 xp each, persisted and validated |

Roughly 40 minutes to clear the road at a steady pace, before trials and
endless.

### Audio inventory

18 distinct SFX: ui_click, link (pitched per chain step), trace_open, invalid,
pop, cascade, strike, crit, heal, charge_full, super, clash_hit, hurt, down,
victory, defeat, unlock, wave. Two full music loops: theme_road (calm, 96 bpm
dorian) and theme_core (boss and finale, 132 bpm phrygian). All original
procedural synthesis, mono mp3, routed through GGKit buses, music lazy loaded
after first interaction.

### Known limitations

- Endless Surge always opens in the Ashfall Ward frame; the backdrop does not
  change arc as the surge climbs.
- The clash sweep is a single left to right pass; there is no second harder
  pass for late bosses.
- Trials do not have their own leaderboard beyond a cleared flag.

---

## AAA rebuild

Implemented: full rebuild of the directory on Phaser 3 from `/play/_shared/`
with GGKit as the only lifecycle, input, save, audio, loading, settings and
juice implementation. Trace battler sim rewritten as a pure module, view
rewritten as a baked texture renderer with five pooled particle systems, five
authored arc identities with board frame treatments, parallax backdrops and
boss silhouettes, a 30 stage campaign with mid stage waves and boss stages,
Endless Surge, a six trial gauntlet, nine fighters with distinct passives and
bursts, a persisted and validated levelling track, super cut-in with a skip
into a clash timing tap, interactive first run tutorial as a thin fading top
strip, DOM pause menu with the Numbers panel, PWA shell with manifest, icons
and a service worker.

Content tables: see the content and audio inventories above. 30 stages, 5
arcs, 6 trials, 9 fighters, 10 levels each, 18 SFX, 2 music loops, payload
876 KB excluding `_shared`.

Deferred: the three limitations listed above (endless backdrop does not follow
the surge arc, single pass clash sweep, no trial scoring beyond cleared).

## Retina pass 2026-08-16

- Target 390x844 CSS at DPR 3. Before ratio: 1.00x CSS-sized RESIZE baseline. After target: 3.00x, 1170/390, via `GGKit.hiDpi.resize`. Live canvas read was unavailable because no browser surface or private local listener was available.
- Recipe: `Phaser.Scale.RESIZE`, `GGKit.renderDefaults`, `GGKit.hiDpi.canvas` texture baking, and DPR-matched Phaser text. No factor cap.
- Gameplay screenshot and runtime backing-store measurement remain deferred. No palette change was made because the retina law identifies density, not colour depth, as the defect.
