# Pennant Nine asset and code licenses

Rev 1, 2026-08-13. Fleet F16. Pennant Nine is an original GreenGuard USA
production. Every visual is drawn from code at runtime or baked at boot into a
canvas texture, and every audio cue is an original synthesized render made for
this title. Nothing is copied from another title directory and nothing is
hotlinked.

## Asset provenance

No harvested pack file is copied into this directory. The provenance rules and
the available CC0 packs were checked in `/play/_assets/LEDGER.md`; this title
consumes no ledger pack because its art is fully procedural. The arcade and
sports visual rules were taken from `/play/_assets/ART_arcade2d.md` (including
its sports note), and the on screen UI budget from `/play/_assets/UI_LAW.md`.

The MP3 cues in `assets/` were rendered with an original numpy synthesis
script: additive organ tones, filtered noise beds and shaped envelopes. They
contain no samples and no third party recordings. MP3 (mono, LAME) is used for
browser compatibility per the audio format law. No OGG file exists in this
directory and no remote audio or network URL is referenced anywhere in the
title.

| File | Source | License |
|---|---|---|
| `assets/music-day.mp3` | Original synthesized day game loop | CC0 |
| `assets/music-night.mp3` | Original synthesized night game loop | CC0 |
| `assets/music-final.mp3` | Original synthesized pennant finale loop | CC0 |
| `assets/sfx-crack.mp3` | Original synthesized bat contact | CC0 |
| `assets/sfx-foul.mp3` | Original synthesized foul tip | CC0 |
| `assets/sfx-whiff.mp3` | Original synthesized swing and miss | CC0 |
| `assets/sfx-mitt.mp3` | Original synthesized glove pop | CC0 |
| `assets/sfx-call.mp3` | Original synthesized umpire call | CC0 |
| `assets/sfx-cheer.mp3` | Original synthesized crowd swell | CC0 |
| `assets/sfx-groan.mp3` | Original synthesized crowd groan | CC0 |
| `assets/sfx-homer.mp3` | Original synthesized home run fanfare | CC0 |
| `assets/sfx-out.mp3` | Original synthesized out chime | CC0 |
| `assets/sfx-tap.mp3` | Original synthesized UI tick | CC0 |
| `assets/sfx-bell.mp3` | Original synthesized inning bell | CC0 |
| `assets/sfx-pitch.mp3` | Original synthesized pitch release | CC0 |
| `assets/sfx-step.mp3` | Original synthesized base step | CC0 |
| `assets/sfx-reward.mp3` | Original synthesized challenge clear | CC0 |
| `assets/sfx-deny.mp3` | Original synthesized challenge fail | CC0 |
| `icon.png`, `icon512.png`, `favicon.ico` | Original procedural app mark | GreenGuard USA |

## Code

| File | Source | License |
|---|---|---|
| `pn_data.js` | Original content registries, teams, parks, challenges, save schema | GreenGuard USA, all rights reserved |
| `pn_sim.js` | Original rules simulation | GreenGuard USA, all rights reserved |
| `pn_art.js` | Original procedural art bakery | GreenGuard USA, all rights reserved |
| `game.js` | Original Pennant Nine implementation | GreenGuard USA, all rights reserved |
| `index.html`, `manifest.json` | Original title shell | GreenGuard USA |
| `sw.js` | Derived from `/play/_shared/sw-template.js` | GreenGuard USA |
| `/play/_shared/phaser.min.js` | Phaser 3, Photon Storm Ltd / Richard Davey | MIT, see `/play/_shared/LICENSES.md` |
| `/play/_shared/ggkit.js` | GreenGuard studio kit | GreenGuard USA |
| `/play/_assets/ART_arcade2d.md`, `/play/_assets/UI_LAW.md`, `/play/_assets/LEDGER.md` | Shared studio references consulted by this title | GreenGuard USA |

## Original IP note

Pennant Nine, the Northstar Nine, the Cinder Owls, Volt Vipers, Harbor Hares,
Moss Meteors and Copper Larks, every player and pitcher name, the five
ballparks (Rowan Field, Harborlight Park, The Vault, Sunfield Commons,
Meridian Yard), the five pitch types and the ten Clutch Situations are original
title content. No real league, club, player, park or broadcast identity is
referenced, and no fonts, marks or audio from any third party are shipped.
