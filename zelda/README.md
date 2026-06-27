# The Legend of Zelda — Clone

A faithful, playable clone of the original 1986 NES *Legend of Zelda*, written in
plain HTML5 Canvas + JavaScript. Zero dependencies, zero assets — every sprite,
tile, sound, and the music are generated procedurally.

## Play

Open `index.html` in any modern browser. Or serve it:

```
cd zelda-clone && python3 -m http.server 8080
# then visit http://localhost:8080
```

Press **Enter / Start** to begin (this also unlocks audio).

Optimized for **iPhone**: the canvas fills the screen (no more tiny box), and on
a touch device an on-screen controller appears — a large D-pad bottom-left, A/B
action buttons bottom-right, and START/SELECT. Safe-area insets keep it clear of
the notch and home indicator. In portrait the playfield pins to the top so the
action never hides behind your thumbs.

## Controls

| Action | Keys | Touch |
|---|---|---|
| Move | Arrow keys / WASD | D-pad |
| Sword (A) | Z / J / Space | **A** button |
| Use B item (bomb/bow/boomerang/candle/fire rod) | X / K | **B** button |
| Cycle B item | Shift | **SELECT** |
| Start / confirm | Enter | **START** |
| Mute | M | — |

## What's implemented

- **Overworld** — a **168-screen** (12×14) map with the classic side-scroll
  screen transitions: grassy fields, the gray **Death Mountain** range, lakes,
  sand, graveyards, and armos. A hand-authored core of 54 screens (start, the
  dungeons, the special caves) is surrounded by a procedurally generated, fully
  connected wilderness whose enemies grow tougher the farther you roam.
- **Caves** — the sword cave (Old Man: *"IT'S DANGEROUS TO GO ALONE! TAKE THIS."*),
  a Blue Candle cave, a Blue Ring cave, a healing fairy cave, and money caves.
- **Combat** — sword melee, sword **beams** at full health, **bombs**, **bow**
  (rupees as arrows), **boomerang** (stuns + grabs items), and the **Blue Candle**
  (shoots a flame). The **Blue Ring** halves all damage taken.
- **Enemies** — Octorok, Moblin, Tektite, Leever, Zola, **Keese**, **Stalfos**,
  **Gel**, and the tough overworld **Lynel** (fires sword beams), each with
  NES-style AI, plus the **Aquamentus** dragon boss in green / red / blue
  variants with scaling HP, speed, and fireball spread.
- **Items & HUD** — hearts, heart containers, rupees, keys, bombs, fairies,
  candle, ring; authentic top status bar with minimap, B/A item slots,
  collected-Triforce tally, ring indicator, and `-LIFE-` hearts.
- **Eight dungeons** — Levels 1–8, each a multi-room layout with locked
  doors + keys, a major item (Boomerang / Bow / Heart Container / Stepladder /
  Silver Arrows / Magic Key / Raft …), a boss, and a **Triforce piece**. Level 6
  is gated behind the **Raft** (found in an overworld cave). Collect **all
  eight** Triforce pieces to win.
- **Title / Game Over / Win** screens, sound effects, and the overworld theme.

## Code layout (`js/`)

| File | Responsibility |
|---|---|
| `engine.js` | Canvas, scaling, input (keyboard + touch), fixed-60Hz loop, RNG |
| `sound.js` | WebAudio SFX + procedural overworld melody |
| `sprites.js` | Procedural pixel-art sprites + text font |
| `tiles.js` | 16×16 tile rendering + passability, per-area themes |
| `world.js` | Overworld screens (generated, guaranteed connectivity) |
| `dungeon.js` | Dungeon room generation + Level 1 data |
| `entities.js` | Link, enemies, projectiles, pickups, boss |
| `game.js` | State machine, screen/room management, HUD, caves, combat glue |

## Tests

`node test/smoke.js` boots the real game under a headless stub, drives input for
hundreds of frames, and runs deterministic checks:
- **Integration**: sword cave → raft → all 8 dungeons → key → boomerang → bosses →
  8 Triforce pieces → win (proving the quest is completable end-to-end).
- **Bug regression**: after exiting a cave, Link lands on open ground and can move.
- **Coverage**: loads all **168** overworld screens, all **40** dungeon rooms, and
  every cave kind, ticking every enemy type. Out-of-bounds screens are rejected.
  Fails loudly on any thrown error.
