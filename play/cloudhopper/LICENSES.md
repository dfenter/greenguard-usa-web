# Cloudhopper asset licenses

All shipped files in this title are either original procedural code, original UI copy, or curated files converted from sources recorded in `/play/_assets/LEDGER.md`.

## Procedural and authored files

- `index.html`, `style.css`, `game.js`, `manifest.json`, `sw.js`, `NOTES.md`, and `LICENSES.md` are original GreenGuard USA project files.
- `icon.png` and `icon512.png` are original procedural Cloudhopper app icons created for this title.
- The terrain, aircraft, strips, clouds, rings, cargo markers, camera motion, and particle systems are generated at runtime by `game.js` and use no third-party art files.

## Audio

The following files are curated from the harvested packs listed in `/play/_assets/LEDGER.md`. Harvest source audio was transcoded to mono MP3 with libmp3lame at 96k for iOS-compatible delivery. No source audio file is shipped.

| Shipped file | Source file | Pack and license | Source evidence |
|---|---|---|---|
| `assets/flight_dawn.mp3` | `driving_001_Synthwave_4k_0.mp3`, trimmed | music mixed harvest, CC0 | `web2d/music/LICENSE.txt`, OpenGameArt calm-ambient-1 page |
| `assets/flight_sunset.mp3` | `driving_002_Synthwave_15k.mp3`, trimmed | music mixed harvest, CC0 | `web2d/music/LICENSE.txt`, OpenGameArt calm-ambient-2 page |
| `assets/ui_confirm.mp3` | `interface-sounds/Audio/confirmation_001` | Kenney interface-sounds, CC0 | `web2d/interface-sounds`, `kenney.nl/assets/interface-sounds` |
| `assets/ui_select.mp3` | `interface-sounds/Audio/select_004` | Kenney interface-sounds, CC0 | `web2d/interface-sounds`, `kenney.nl/assets/interface-sounds` |
| `assets/ring_pass.mp3` | `digital-audio/Audio/powerUp8` | Kenney digital-audio, CC0 | `web2d/digital-audio`, `kenney.nl/assets/digital-audio` |
| `assets/cargo_pickup.mp3` | `digital-audio/Audio/powerUp11` | Kenney digital-audio, CC0 | `web2d/digital-audio`, `kenney.nl/assets/digital-audio` |
| `assets/stall_warn.mp3` | `digital-audio/Audio/lowDown` | Kenney digital-audio, CC0 | `web2d/digital-audio`, `kenney.nl/assets/digital-audio` |
| `assets/fuel_low.mp3` | `digital-audio/Audio/lowRandom` | Kenney digital-audio, CC0 | `web2d/digital-audio`, `kenney.nl/assets/digital-audio` |
| `assets/landing.mp3` | `sci-fi-sounds/Audio/impactMetal_001` | Kenney sci-fi-sounds, CC0 | `web2d/sci-fi-sounds`, `kenney.nl/assets/sci-fi-sounds` |
| `assets/crash.mp3` | `sci-fi-sounds/Audio/explosionCrunch_001` | Kenney sci-fi-sounds, CC0 | `web2d/sci-fi-sounds`, `kenney.nl/assets/sci-fi-sounds` |
| `assets/engine.mp3` | `sci-fi-sounds/Audio/spaceEngineLow_000` | Kenney sci-fi-sounds, CC0 | `web2d/sci-fi-sounds`, `kenney.nl/assets/sci-fi-sounds` |

Kenney assets are released under CC0 1.0. The two music loops are CC0 tracks from OpenGameArt.org and are listed in the harvested `web2d/music/LICENSE.txt` with their source pages and authors. The in-game credits surface those sources through the title's written license record.

## Runtime libraries

Three.js r160 and GGKit are loaded from `/play/_shared/`. Their licensing is recorded in `/play/_shared/LICENSES.md`.
