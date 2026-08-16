# Verge Protocol licenses

Verge Protocol ships no third-party raster art. Every battlefield surface,
lane, hazard decal, landmark, socket, tower, infected silhouette, boss, field
operator, particle, HUD chip and menu plate is original procedural work drawn
in `content.js` and `game.js` at runtime or baked into canvas textures during
scene creation.

`icon.png`, `icon512.png` and `favicon.ico` are original procedural artwork,
generated as raw pixel data for this title. They depict an original
quarantine-district badge and are not derived from any existing mark.

## Audio

Every file in `assets/audio/` is an original procedural tone or bed rendered
for Verge Protocol from a synthesis script (sine, triangle, saw, square and
filtered noise, with envelopes). No external sample, loop, or recording is
present in any of them, and no file is copied from another title.

| File | Role |
| --- | --- |
| `select.mp3` | UI select |
| `place.mp3` | tower placed, pitched material thunk |
| `upgrade.mp3` | tower upgraded, facility upgraded |
| `cancel.mp3` | cancel, invalid command, sell |
| `fire.mp3` | rifle and mortar report |
| `hit.mp3` | projectile contact, tesla arc |
| `kill.mp3` | infected killed |
| `breach.mp3` | core damage |
| `ability.mp3` | commander ability deployed |
| `warning.mp3` | wave call-in and boss warning |
| `wave-clear.mp3` | wave cleared |
| `victory.mp3` | mission held |
| `defeat.mp3` | core lost |
| `music-bed.mp3` | tactical music bed, looping |
| `music-danger.mp3` | danger layer, looping |
| `music-base.mp3` | menu and base music, looping |

All audio is mono MP3 (libmp3lame) per the mobile audio format law. There is
no `.ogg` file in this directory.

## Asset ledger

The shared asset ledger at [`play/_assets/LEDGER.md`](../_assets/LEDGER.md)
was checked before this rebuild. No harvested Kenney or Quaternius pack file
is shipped by Verge Protocol, so no ledger row applies to this title and no
"Used by" row was claimed. The strategy treatment follows
[`play/_assets/ART_strategy.md`](../_assets/ART_strategy.md) and the UI
restraint rules in [`play/_assets/UI_LAW.md`](../_assets/UI_LAW.md).

## Engines

Phaser 3 and GGKit are loaded from `/play/_shared/` and are covered by
[`play/_shared/LICENSES.md`](../_shared/LICENSES.md). Nothing is fetched from
a CDN or any other network origin.

## IP

All names used in this title (Verge Protocol, Vane, the sector names, the
tower names, and the named mutants Tarmac, Dredge, Matron and Nullspire) are
original to this project.
