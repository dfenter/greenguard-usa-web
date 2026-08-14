# Steamline licenses

Rev 1, 2026-08-10. This title follows `/play/_assets/LEDGER.md` and the
top-down 2D direction in `/play/_assets/ART_topdown2d.md`.

Steamline ships no harvested image or audio pack file and never references
another title's asset directory. The rails, yards, train liveries, station
crowds, signatures, smoke, particles, icons, and interface are original
procedural work in `rail.js`, `game.js`, and the authored SVG sheets in
`assets/`. The short MP3 cues and the two
route music beds were generated from primitive oscillators and filtered noise
for this title only. They are released as CC0 1.0 Universal, with no sampled
source and no attribution requirement. Their roles are routed through GGKit's
audio buses as `steam_chug`, `whistle`, `station_bell`, `crowd_murmur`,
`danger`, `miss`, `pickup`, `ui_select`, `switch_throw`, `music_route`, and
`music_danger`.

The ledger is still the provenance authority for any future curated asset:
`/play/_assets/LEDGER.md`. No ledger pack row is consumed by this build.
Phaser and GGKit are shared engine/runtime files covered by
`/play/_shared/LICENSES.md`.

## Files shipped

| File | Source and license |
|---|---|
| `icon.png` | Original Steamline train mark, procedural vector motif rasterized at 192px. CC0. |
| `icon512.png` | Original Steamline train mark, procedural vector motif rasterized at 512px. CC0. |
| `favicon.png` | Original Steamline train mark, procedural vector motif rasterized at 64px. CC0. |
| `assets/train_states.svg` | Original 16px-grid train idle, held, and moving sprite sheet. CC0. |
| `assets/station_states.svg` | Original 16px-grid platform idle, lit, and arrival sprite sheet. CC0. |
| `assets/yard_tile.svg` | Original 16px-grid yard ground transition tile. CC0. |
| `assets/music_route.mp3` | Original low-volume route bed from primitive oscillators. CC0. |
| `assets/sfx_steam_chug.mp3` | Original oscillator and echo cue. CC0. |
| `assets/sfx_whistle.mp3` | Original oscillator whistle cue. CC0. |
| `assets/sfx_station_bell.mp3` | Original two-tone oscillator bell cue. CC0. |
| `assets/sfx_crowd_murmur.mp3` | Original filtered procedural noise crowd bed. CC0. |
| `assets/music_danger.mp3` | Original low-volume danger bed from primitive oscillators. CC0. |
| `assets/sfx_danger.mp3` | Original two-tone danger cue from primitive oscillators. CC0. |
| `assets/sfx_miss.mp3` | Original descending miss cue from a primitive oscillator. CC0. |
| `assets/sfx_pickup.mp3` | Original two-note pickup cue from primitive oscillators. CC0. |
| `assets/sfx_ui_select.mp3` | Original interface select cue from a primitive oscillator. CC0. |
| `assets/sfx_switch_throw.mp3` | Original switch throw cue from a primitive oscillator. CC0. |

Audio format law: every shipped audio file is MP3. No OGG file is present or
referenced. The game preloads all eleven cues through GGKit before the play
scene begins, so no browser audio decode is paid during the stepped sim.
