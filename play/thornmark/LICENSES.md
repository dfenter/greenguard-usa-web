# Thornmark licenses and asset ledger

Thornmark is an original GreenGuard USA title. Names, world, sprites, icons,
copy, music and sound effects were authored for this game. The page and the
service worker reference no other game directory and no network host.

| File or group | Source / license |
|---|---|
| `game.js`, `index.html`, `styles.css`, `manifest.json`, `sw.js` | Original GreenGuard USA work |
| `icon.png`, `icon512.png`, `favicon.png` | Original procedural mark drawn from primitives with Pillow for Thornmark, CC0 internal release. Generator: `aaa/harness/tm_tools/build_icons.py` |
| `assets/music-*.mp3` (3 loops) | Original procedural music, synthesised from scratch with numpy, encoded mono libmp3lame. CC0 internal release. Generator: `aaa/harness/tm_tools/build_audio.py` |
| `assets/sfx-*.mp3` (17 cues) | Original procedural one-shots, same generator, CC0 internal release |
| All in-game sprites, tiles, props, particles, HUD chrome | Drawn at load time from canvas primitives inside `game.js`, original work |
| `/play/_shared/phaser.min.js` | Phaser 3.87.0, MIT; see `/play/_shared/LICENSES.md` |
| `/play/_shared/ggkit.js` | GreenGuard studio kit, original work; see `/play/_shared/LICENSES.md` |

No harvested pack files ship in this directory. No Kenney, quaternius or freepd
file is used, so no CC-BY attribution is owed. The shared ledger at
`/play/_assets/LEDGER.md` remains the authoritative pack level record for any
curated asset added later, and any such addition must be listed in this table
before it ships.

Audio format law: every shipped cue is `.mp3` (libmp3lame, mono). No `.ogg`
file exists in this directory.

Presentation follows `/play/_assets/ART_topdown2d.md` (top down 2D lane plus the
RPG addendum) and `/play/_assets/UI_LAW.md`.
