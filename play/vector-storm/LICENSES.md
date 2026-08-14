# Vector Storm asset and code licenses

Rev 1, 2026-08-10. This title is an original GreenGuard USA production for
Fleet F2. It ships procedural vector art and original procedural MP3 cues.

## Asset provenance

No harvested pack file is copied into this directory. The arcade visual rules
were checked against `/play/_assets/ART_arcade2d.md`, and the provenance rules
and available CC0 packs were checked in `/play/_assets/LEDGER.md`. No ledger
pack is consumed by this title. The arena chrome, ship skins, enemy
silhouettes, icons and particles are drawn from code at runtime or from the
original app mark in `icon.png` and `icon512.png`.

The MP3 cues in `assets/` are original short synthesized tones rendered for
this title. They contain no samples, are local only, and are loaded through
GGKit audio buses. MP3 is used for browser compatibility. No OGG file exists
and no remote audio or network URL is referenced.

| File | Source | License |
|---|---|---|
| `assets/void-drive.mp3` | Original synthesized loop | CC0 |
| `assets/void-alert.mp3` | Original synthesized intensity loop | CC0 |
| `assets/fire.mp3` | Original synthesized SFX | CC0 |
| `assets/explosion.mp3` | Original synthesized SFX | CC0 |
| `assets/bomb.mp3` | Original synthesized SFX | CC0 |
| `assets/crystal.mp3` | Original synthesized SFX | CC0 |
| `assets/wave-clear.mp3` | Original synthesized SFX | CC0 |
| `assets/milestone.mp3` | Original synthesized SFX | CC0 |
| `assets/boss.mp3` | Original synthesized SFX | CC0 |
| `assets/damage.mp3` | Original synthesized SFX | CC0 |
| `assets/pickup.mp3` | Original synthesized SFX | CC0 |
| `assets/gameover.mp3` | Original synthesized SFX | CC0 |
| `icon.png`, `icon512.png`, `favicon.ico` | Original procedural app mark | GreenGuard USA |

## Code

| File | Source | License |
|---|---|---|
| `engine.js`, `game.js` | Original Vector Storm implementation | GreenGuard USA, all rights reserved |
| `index.html`, `manifest.json`, `sw.js` | Original title shell; `sw.js` derived from `/play/_shared/sw-template.js` | GreenGuard USA |
| `/play/_shared/phaser.min.js` | Phaser 3, Photon Storm Ltd / Richard Davey | MIT, see `/play/_shared/LICENSES.md` |
| `/play/_shared/ggkit.js` | GreenGuard studio kit | GreenGuard USA |
| `/play/_assets/ART_arcade2d.md`, `/play/_assets/LEDGER.md` | Shared studio references consulted by this title | GreenGuard USA |

## Original IP note

Vector Storm, Fleet F2, the four arena identities, the enemy families, the
Prism Warden, Debris Breaker, Singularity Heart and Crown Swarm are original
title content. Nothing is drawn from or named after another title directory.
