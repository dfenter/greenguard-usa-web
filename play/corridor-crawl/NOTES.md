# Corridor Crawl

Controls: tap an adjacent tile to move or bump-attack, tap yourself to wait, tap a bottom-bar slot to use an item, long-press any tile or slot to inspect. Desktop: arrows/WASD/QEZC/hjkl to move, space or `.` to wait, 1-6 to use items, M to mute, R to restart.
Loop: seeded rooms-and-corridors floors with fog of war; fight six monster types (pack rats, a splitting ooze, a ranged archer, an adjacent-only stalker, a shoving brute, a thief that steals and flees); potions and scrolls stay unidentified until used; hunger slows regeneration and then bites.
Goal: step on the down stairs to descend, take the Crown of Echoes on depth 8, then climb all the way back out through an angrier dungeon.
Fail/win: permadeath - score is depth x10 + kills x3 + gold (+100 for escaping); best score persists in localStorage; tap anywhere on the end screen to restart instantly.

## AAA rebuild

Implemented: Phaser 3 view over GGKit-owned lifecycle, pointer identity, save,
and audio buses; seeded 8-depth descent and Crown ascent; four authored floor
bands with palette shifts, monster weighting, set-piece rooms, risk-adjacent
loot, six monster silhouettes with idle/attack/hit/death states, pooled board
and particle rendering, adjacency brackets, crisp fog reveal, unidentified
use-to-learn items, hunger warning band, long-press inspection, interactive
first-run coaching, floor-clear and depth milestone medals, starting-kit
unlock chain, generous early drops, permadeath scoring, reduced-motion gating,
and `window.__cc = { state, forceFloor, forceEvent }` probe hooks. PWA files,
manifest, generated original icons, service-worker precache, and license
provenance are included.

Floor-band/event tables:

| Depths/events | Identity | Palette and weighting | Signature/read |
| --- | --- | --- | --- |
| 1-2 | Shallow Warrens | root-stone violet, rats and oozes | splitting ooze nest with loot beside it |
| 3-4 | Flooded Corridors | blue sump stone, oozes, archers, thieves | broken pump room with gold in the water |
| 5-7 | Ember Forge | slag red, archers, stalkers, brutes | bellows crucible guarded by brute and stalker |
| 8 | Crown Vault | amethyst stone, elite mixed guard | echo dais, Crown of Echoes, four guardians |
| ascent | Angered bands | extra brute/thief pressure, preserved seed | UP stairs, clear medals, escape banner |
| probes | `forceFloor`, `forceEvent` | boot fallback and live scene reads | `crown`, `floor-clear`, `escape`, `tutorial` |

Audio: the title now ships a local, original-IP mp3 set under `assets/audio/`.
Every cue is registered and preloaded through GGKit, with the four band loops
crossfading on floor changes.
In-app browser QA and local HTTP serving could not run in this environment:
the browser connector was unavailable and the sandbox denied binding a local
port. Node syntax checks, a 1,600-level dungeon VM sweep, and manifest/service
worker audits did run successfully.

## Fix round 1

Fixed:

- CRITICAL crown reachability: rebuilt the vault around the room centre, kept
  the dais centre and cardinal approaches open, and skipped pillars that would
  block a corridor mouth.
- CRITICAL visuals: added an original pixel atlas asset, pixel-grid floor
  glyphs, terrain edge transitions, band-specific set-piece geometry, water
  wave marks, ember props, vault accents, and a radial torch mask.
- CRITICAL player animation: added timed idle, walk, attack, and hurt states;
  attack and hurt states now expire from simulation events.
- CRITICAL audio: added 14 local original-IP mp3 cues, registered and
  preloaded them through GGKit, and crossfaded the four band loops.
- MAJOR HUD placement: SCORE, GOLD, and HP now anchor to the right edge and
  short portrait layouts move the log below the header.
- MAJOR save validation: enforced integer bounds, complete counters, unique
  unlocked kits, selected-kit membership, and the medals schema.
- MAJOR diagonal corner collision: corner clearance is checked before a bump
  attack can resolve.
- MAJOR Quickening: the haste skip is consumed after the enemy phase decision,
  so one enemy phase is actually skipped.
- MAJOR Thief and Terror retreat: fear now performs real distance-increasing
  movement with corner-safe collision.
- MAJOR enemy AI: added explicit patrol, chase, attack, telegraph, and flee
  states, including a reachable sound-hunting Stalker branch.
- MAJOR combat read: added intent markers, elite diamond marks, telegraph SFX,
  and visible strike or volley previews.
- MAJOR touch pause safety: local touch state is cleared on GGKit pause and
  pointer release is guarded while paused.
- MAJOR gamepad input: added GGKit-gated d-pad and left-stick movement.
- MAJOR one-action input: keyboard, gamepad, wait, and item input now select at
  most one turn action per frame.
- MAJOR sprite density: player and enemy sprites scale to the live tile size.
- MAJOR set pieces: warrens, flooded, forge, and vault rooms now have distinct
  authored floor geometry and props.
- MAJOR floor and pickup feedback: added a 250 ms fade transition, pooled
  pickup pop text, and counter pulse feedback.
- MAJOR FX and knockback: split hit sparks from footstep dust, added enemy
  family secondary FX, and added safe one-tile hit knockback.
- MAJOR GGKit juice: every frame consumes `kit.juice.frame()`, applies camera
  shake offsets, and freezes turn simulation during hit-stop.
- MAJOR tutorial encounter: depth 1 reserves the starting ring and guarantees
  an adjacent training rat.
- MINOR short viewport overlap: the compact layout reserves header clearance
  for log and band text.
- MINOR PWA registration: removed the duplicate registration call and bumped
  the service-worker cache version to `aaa-20260810-f6`.
- MINOR potion icons: identified potions now use their own authored icon in
  the world and inventory.

Rejected: none. Every review finding was actionable and was fixed.

Verification: `node --check` passed for every changed JavaScript file; 800
depth-8 VM levels had 0 Crown reachability failures; 200 depth-1 VM starts had
200 adjacent training encounters; Quickening produced 0 enemy moves during its
skip; the 4x deterministic VM median was 7.355 ms; the precached payload was
150,410 bytes with no missing entries and no audio files outside mp3.

## UI declutter

- Cut the persistent three-line play log, atlas ribbon, title/kit/band flavor labels, world `?` labels, and inventory item-name labels.
- Replaced SCORE/GOLD/HP/HUNGER words with compact icon counters, meters, and visible buff-duration icons; inventory counts remain readable and touch targets remain large.
- Moved all active-play banners, pickup feedback, and event text into one queued top-edge chip: one line, 14px text, 1.0s hold, fast reduced-motion-aware fade.
- Shrunk long-press inspection to one compact line and retimed it to 1.0s; shortened the tutorial coach to one thin single-line strip with a 3.5s lifetime.
- Kept floor-clear/run-boundary information in the same queued strip and the existing results screen; gameplay, difficulty, controls, and reduced-motion gating are unchanged.
