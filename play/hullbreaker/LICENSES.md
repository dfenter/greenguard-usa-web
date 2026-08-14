# Hullbreaker asset and code licences

## Summary

Hullbreaker ships **no third-party art or audio files**. Every texture,
sound and music loop under `assets/` is generated procedurally from code
(Pillow drawing for the sprite sheets, additive/subtractive synthesis
rendered to WAV and encoded to mono MP3 for the audio). There is no
sampled material, no traced or derived artwork, and no font file: the
wordmark and HUD glyph shapes are drawn as vector polygons in the
generator, and in-game text uses the local system font stack declared in
`index.html`.

## Asset ledger

The governing pack registry for `/play` is
[`/play/_assets/LEDGER.md`](../_assets/LEDGER.md). Hullbreaker draws on
**no row** of that ledger: no Kenney pack, no Quaternius pack, and no
entry from the mixed-harvest music row is used, copied, or adapted here.
The ledger's "Used by" column therefore has nothing to record for this
title. The art direction follows the in-repo bible
[`/play/_assets/ART_arcade2d.md`](../_assets/ART_arcade2d.md).

No asset is hotlinked from another title's directory. Every file the game
loads is either inside `play/hullbreaker/assets/` or is one of the two
shared engine files listed below.

| File | Origin | Licence |
|---|---|---|
| `assets/atlas.png` + `assets/atlas.json` | generated: 25 rock-family frames (5 families x large/medium/small, 2 variants at the larger sizes) | original, GreenGuard USA |
| `assets/atlas2.png` + `assets/atlas2.json` | generated: ship, hive core/arm/pod, geode + node, hulk, mine, gravity well, drone, four projectile shapes, four pickup discs, seven particle sprites | original, GreenGuard USA |
| `assets/stars.png`, `assets/neb.png` | generated tiling starfield and nebula planes | original, GreenGuard USA |
| `assets/logo.png` | generated wordmark, letterforms authored as polygons | original, GreenGuard USA |
| `assets/favicon.png`, `icon.png`, `icon512.png` | generated from the same sprite sources | original, GreenGuard USA |
| `assets/music_field.mp3`, `assets/music_boss.mp3`, `assets/music_intensity.mp3` | synthesised loops (bass, arpeggio, pad, drum bus, and danger pulse) | original, GreenGuard USA |
| `assets/sfx_*.mp3` (20 files) | synthesised effects: four weapon voices, three fracture weights, dash, shield impact, critical klaxon, ore, pickup, upgrade, banner, boss, UI, overheat, medal, defeat, engine hum loop | original, GreenGuard USA |

Audio ships as MP3 only. No OGG file is produced or referenced.

## Code

| Component | Origin | Licence |
|---|---|---|
| `/play/_shared/phaser.min.js` | Phaser 3.87, vendored for the fleet | MIT, see [`/play/_shared/LICENSES.md`](../_shared/LICENSES.md) |
| `/play/_shared/ggkit.js` | GreenGuard studio kit | original, GreenGuard USA |
| `/play/_shared/sw-template.js` | fleet service-worker template, filled out as `sw.js` | original, GreenGuard USA |
| `hb_data.js`, `game.js`, `hb_menu.js`, `hb_play.js`, `hb_hud.js` | original, GreenGuard USA | proprietary |

## Original IP

Sector names, the hive miniboss family, the ship silhouette, the wordmark,
the upgrade set and all copy are original to this title. Nothing here
depicts, names, or imitates a third-party game, character, or brand.
