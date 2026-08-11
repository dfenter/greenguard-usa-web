# Dirt Rocket licenses

Rev 1, 2026-08-10. This file traces every shipped file under
`/play/dirt-rocket/` and records the local asset policy used for the AAA
rebuild.

## Original title code and art

`index.html`, `game.js`, `track.js`, `bike.js`, `manifest.json`, `sw.js`, and
the procedural low-poly bike, rider, track families, props, particles, HUD,
icons, and animation are original GreenGuard USA work for Dirt Rocket.

`assets/audio/*.mp3` contains original procedural cues rendered from simple
wave/noise recipes for this title. `menu.mp3` and `drive.mp3` are the looping
menu and driving beds; the driving bed includes a layered motor pulse. The
remaining files are original UI, impact, surface, pickup, and gameplay cues.
They are not copied from another game and are distributed as MP3 only.

## Shared runtime

`/play/_shared/three/three.module.min.js` is three.js r160.1 under the MIT
License, Copyright 2010-2023 Three.js Authors. `GGKit` at
`/play/_shared/ggkit.js` and the GGRacer modules at
`/play/_shared/racer/` are original GreenGuard studio work. The authoritative
shared notices are in [`/play/_shared/LICENSES.md`](/play/_shared/LICENSES.md).

The retrofit adds no third-party art, models, textures, or audio. The 25
`tracks/*.json` files are original Dirt Rocket course conversions from the
existing seeded elevation profiles.

The import map uses the required local name `three` and never loads a CDN.

## Asset ledger

The rebuild was checked against [`/play/_assets/LEDGER.md`](/play/_assets/LEDGER.md).
That ledger contains the available studio harvest packs. No third-party pack
file is shipped by Dirt Rocket, so no pack-level attribution is required for
the title payload.
