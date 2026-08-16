# Dominion Keys

Controls: drag a brass key handle outward, or tap it. Keyboard: up and down
select a key, left and right pull it in that direction, Enter or Space pulls the
selected key, Z undoes the last pull, R retries, Escape opens the chamber map,
K opens the keep, P opens settings.

Goal: pull the keys in the order that drops the treasure into Rell's well,
drains lava into the side pits and feeds the beasts to the fire. Get the target
number of coins to Rell with him still alive.

Hazards combine. Water freezes lava into stone. Marshgas catches fire the moment
lava touches it. Lava burns treasure and kills beasts. A beast standing next to
Rell ends the run.

Stars: one for clearing the chamber, one for losing no treasure, one for using
no more keys than par. Every clear pays stone, timber and brass, and those
materials raise the twelve buildings of your keep. The keep tier unlocks the
later chapters, so building is not optional decoration.

Sixty chambers across five chapters, plus a Blueprint mode of the ten tightest
chambers where undo is switched off. No timers, no energy, no purchases.

---

## AAA rebuild

Rebuilt 2026-08-13 from the 2026-08-05 prototype. Phaser 3 renders, DKSim holds
the deterministic chamber, GGKit owns lifecycle, pointer identity, saves, audio
buses, settings, loading and the juice budget.

### Preserved from the prototype

The prototype was treated as the design document. What survived unchanged:

- Grid 13 x 22, the same twelve cell materials and the same reaction table
  (lava plus water becomes stone, lava plus gas becomes lava, lava burns gold
  and beasts, a beast beside the hero is fatal).
- The bottom-up movement pass with the alternating scan direction, the
  no-corner-cutting diagonal rule, and the eight slot cycle hash used to detect
  a settled or oscillating chamber.
- The 1/16 second fixed sim step and the four step per frame cap.
- The chamber construction order in `buildDesc` (reservoirs, then key bars, then
  ramps), so pull orders solved offline stay valid at runtime.
- Settle to 220 ticks before the player touches anything, then clear the cycle
  history: the same starting state the solver validated.
- Cycle memory is reset per pull, exactly as the solver does it.
- Drag threshold of 16px outward along the key's own anchor direction, with a
  forgiving tap fallback.
- The runtime winnability probe: when a chamber settles with few keys left, the
  exhaustive pull-order search runs again and the run fails immediately if no
  order can still reach the target. Budget is capped (three keys or fewer, 120
  ticks) so it never costs a frame.

### Content

| Chapter | Name | Chambers | Keys | Par | Winning share of pull orders |
|---|---|---|---|---|---|
| 1 | Vault Deep | 1-12 | 3 | 2 | 0.333 down to 0.167 |
| 2 | Riverworks | 13-24 | 4 | 2-4 | 0.250 down to 0.083 |
| 3 | Molten Deep | 25-36 | 4 | 3-4 | 0.167 down to 0.083 |
| 4 | Marshfen Reach | 37-48 | 5 | 3-5 | 0.125 down to 0.008 |
| 5 | Crown Keep | 49-60 | 5 | 3-5 | 0.125 down to 0.008 |

Every chamber was authored offline and accepted only if an exhaustive search of
every pull order proved: the stated coin target is reachable, at least one order
is fatal, the shortest winning order is at least the chapter's minimum length,
and the fraction of orders that win is at or under the chapter's cap. That cap
tightens across each chapter, so the difficulty ramp is a property of the data
rather than a multiplier. Layout signatures are deduplicated across all sixty.

Blueprint mode is the ten tightest chambers by winning share, hardest last:
56 Last Bar, 52 Long Gallery, 55 Kings' Ransom, 60 Dominion, 45 Fen Gate,
58 The Reliquary, 46 Drowned Ramp, 50 Portcullis, 59 Throne Shaft, 47 Fenwatch.
Undo is disabled there and clears pay double materials.

Hazard sets per chapter: lava and beasts, then water, then a lava-heavy mix,
then marshgas, then every hazard at once.

Keep: twelve buildings, three tiers each, thirty six tiers total. Palisade,
Well, Woodshed, Granary, Market, Stables, Smithy, Barracks, Watchtower, Chapel,
Library, Great Hall. Costs rise with both building rank and tier. Clearing all
sixty chambers at three stars pays 960 stone, 720 timber and 540 brass against a
full keep cost of 1038 / 756 / 252, so the last few tiers are paid for by
Blueprint clears (double rate) or by replays (quarter rate salvage). Chapter
gates need nine clears in the previous chapter plus keep tier 3, 9, 16 and 24.
Blueprint opens at keep tier 12 with thirty chambers cleared.

### Owner priorities

1. Puzzle feel. A key highlights on touch and shows its pull direction with a
   chevron that points out of the board; the sim is a fixed step and fully
   deterministic; undo restores the previous grid snapshot instantly with no
   replay; retry is one tap. The fail state is visual: the board dims, a warning
   marker pulses on the cell that caused it (the lost coin, the surviving beast,
   the well Rell died in), the Undo and Retry buttons light up, and a single
   corner chip names the cause. No centre banner on failure.
2. Loop. Sixty hand-validated chambers, five chapters, three star scoring on
   pulls used, treasure saved and Rell alive, Blueprint mode, twelve upgradable
   buildings, materials only from play. No timers, energy or purchases.
3. World. Five authored chapter identities, each with its own board frame value,
   cell field, background motif (vault arches, a mill wheel, furnace vents,
   reeds, hanging banners) and hazard palette. The keep is a three layer
   diorama: sky and far ridge, ward floor and market road, then the buildings.
   Unbuilt sites show a surveyed footing with a ghost of what will stand there,
   so the scene reads as a plan rather than an empty field, and every upgrade
   changes a silhouette.

### Presentation

- Palette from `play/_assets/ART_puzzlepop.md`, board tokens shifted per
  chapter. Semantic colour is stable: treasure is always brass gold, beasts are
  always violet, stone is always grey, Rell is always mint.
- Player entity is the key selector, with five authored states: Ready (breathing
  ring), Preview (leans toward the pull, chevron extends and pulses), Resolve
  (snaps out with overshoot then returns), Blocked (amber cross hatch while the
  chamber is settling or lost), Goal (spins up on a clear). Rell has three:
  idle bob, cheer on the win, slumped when the chamber takes him.
- Five pooled particle systems from one atlas: sparks (coin banked, key pull),
  steam (lava quenched by water), embers (gas ignition, burning treasure, the
  fatal breach), shards (beast slain, key debris), ribbons (clear celebration).
  Pools are 64 / 34 / 44 / 32 / 44 and never allocate after create; a full pool
  recycles its oldest item.
- Shake, hit stop and the win flash all route through `kit.juice`. With the
  accessibility toggle off, or with `prefers-reduced-motion`, particle counts
  drop to 40 percent, the selector stops overshooting, the banner stops
  springing and no full screen flash plays; every focus ring, chevron, cross
  hatch, cause marker and meter stays.
- Centre banners appear only at a run boundary (the clear card). In-play events
  use a single corner chip, one at a time, and the coach line is a thin fading
  strip at the top edge. Touch targets are 58px or larger.

### Rendering and performance

No Phaser Graphics call runs during a frame. Board chrome, HUD, control bar,
coach strip, chips, the clear banner, all three menu pages and the keep diorama
are painted into canvas textures and repainted only when the value behind them
changes (each has a signature guard). Cells are pooled sprites drawn from a
single per-chapter atlas, so a full board is one draw batch; the atlas frames
are registered with source index 0. Lava, water, gas and beast animation cycles
a shared global frame so every sprite of a kind keeps the same texture. The
particle atlas and UI atlas are likewise single textures. Every texture is baked
during the loading screen with real progress, alongside the SFX decode; music
lazy loads after the first interaction.

### Audio

Two music loops and ten distinct SFX, all original procedural synthesis
exported as mono MP3, routed through GGKit buses with persistent mute and
volume.

| Cue | File | Used for |
|---|---|---|
| vault | music_vault.mp3 | chamber and menu loop, slate and brass, 76 bpm |
| keep | music_keep.mp3 | keep loop, warm major marimba, 92 bpm |
| tap | sfx_tap.mp3 | UI press, selector move |
| pull | sfx_pull.mp3 | key pulled, and pitched up for undo |
| coin | sfx_coin.mp3 | a coin reaches Rell, pitch rises with the count |
| steam | sfx_steam.mp3 | water quenches lava into stone |
| ignite | sfx_ignite.mp3 | marshgas catches fire |
| slay | sfx_slay.mp3 | a beast dies in lava |
| burn | sfx_burn.mp3 | treasure burns |
| fail | sfx_fail.mp3 | chamber lost |
| win | sfx_win.mp3 | chamber cleared |
| build | sfx_build.mp3 | keep upgrade |

Both loops fold their tail into their head so the seam has no click. A per
frame budget caps any single cue at two plays, so a cascade of coins reads as an
arpeggio rather than a machine gun.

### Verification hook

`window.__dk` exposes `state` (mode, chapter, level and name, blueprint flag,
pulls, par, target, collected, lost, beasts, undos, stars, over, settled, keep
tier, materials, cleared, reducedMotion, ready), `catalog` (all sixty chambers
with target, par and key count), `buildings` (twelve buildings with their three
tier costs), and the force switches `forceMode`
(title / map / play / keep / blueprint) and `forceStage` (1 to 60). The switches
are read at boot and re-read every frame with a change guard, so the orchestrator
can drive the title headlessly at any time.

### Known bug classes avoided

Pointer claims are registered on a window listener added after GGKit init and
seed `kit.input.pointers` at claim time. Keyboard presses are buffered by edge
so a press shorter than one frame is never dropped, while GGKit stays the
authority on held state and pause. Board and HUD chrome is baked, never
re-issued as Graphics commands. No `Graphics.arc` runs per frame. Texture frames
use source index 0. The Phaser config mounts on `document.body`. The scene is a
class so custom methods exist. Every keyed lookup into level, chapter, building
and blueprint data is clamped or guarded. The sim clock never advances past the
stepped simulation: hit stop skips the step, pause zeroes the accumulator, and
the accumulator is dropped if it ever exceeds 0.4s. The sw.js precache lists
only files that exist.

### Deliberately left out

- No level editor, no daily seed, no leaderboard: the brief asks for a fixed
  authored campaign plus the keep, and a shared board would need a server.
- No hint system in the chambers. Undo plus the immediate unwinnable detection
  already removes the guesswork punishment, and a hint would trivialise a puzzle
  whose whole content is the order.
- The keep buildings are cosmetic plus gating only. They award no gameplay
  modifiers, because a modifier would invalidate the solved par tables.
