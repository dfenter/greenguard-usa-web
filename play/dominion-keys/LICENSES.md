# Dominion Keys - asset licenses

Rev 1, 2026-08-13. Dominion Keys loads Phaser 3 and GGKit from `/play/_shared/`;
those licenses are covered by `/play/_shared/LICENSES.md`.

Every shipped file in this directory is original work authored for GreenGuard
USA. The board, chamber materials, keys, hero, beasts, HUD, icons, particle
marks, menu pages, keep diorama and the three PNG icons are drawn procedurally
in code and baked to canvas textures at load; there is no bitmap art file in the
payload. The twelve audio files are original procedural synthesis rendered
offline to mono MP3. No file is copied or referenced from another title
directory, and no runtime network asset is used.

`/play/_assets/LEDGER.md` was consulted for the Puzzle Pop lane. The Kenney CC0
rows (ui-pack, particle-pack, interface-sounds, music-jingles) and the mixed
music harvest row were reviewed and not consumed: the title's authored marks and
synthesised cues are self-contained, so no harvested pack file ships here and
the ledger's "Used by" column is unchanged.

Visual direction follows `/play/_assets/ART_puzzlepop.md` (Dominion Keys entry:
carved slate, warm brass pins, rope, clear hazard silhouettes, an anticipation
line and contact notch on a pull, no generic medieval crest language) and the
UI noise rules in `/play/_assets/UI_LAW.md`.

Audio format law: all shipped audio is MP3 (LAME, mono, 44.1 kHz, 72 kbps for
cues and 88 kbps for the two loops). No OGG file ships.

| File or group | Source | License |
|---|---|---|
| `index.html`, `sim.js`, `levels.js`, `game.js`, `manifest.json`, `sw.js` | Original GreenGuard USA code | Proprietary GreenGuard USA |
| `icon.png`, `icon512.png`, `favicon.png` | Original procedural icon art | CC0 1.0 Universal |
| `assets/music_vault.mp3`, `assets/music_keep.mp3` | Original procedural synthesis | CC0 1.0 Universal |
| `assets/sfx_tap.mp3`, `sfx_pull.mp3`, `sfx_coin.mp3`, `sfx_steam.mp3`, `sfx_ignite.mp3`, `sfx_slay.mp3`, `sfx_burn.mp3`, `sfx_fail.mp3`, `sfx_win.mp3`, `sfx_build.mp3` | Original procedural synthesis | CC0 1.0 Universal |
| `/play/_shared/phaser.min.js` | Phaser 3 vendored runtime | MIT, see shared license |
| `/play/_shared/ggkit.js` | GreenGuard studio kit | See shared license |

Original IP only. Rell, the chamber names, the chapter names and the keep
buildings are original text written for this title. No licensed character,
logo, trade dress or lookalike wording is used anywhere in the game.
