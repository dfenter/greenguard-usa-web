# Crestfall licenses and provenance

## Runtime

- `/play/_shared/phaser.min.js`: Phaser 3.87.0, MIT License, Photon Storm Ltd.
- `/play/_shared/ggkit.js`: GreenGuard studio kit, original work, no third-party code.

## Original procedural content

- `src/sprites.js`, `src/hud.js`, `src/overworld.js`, `src/sideview.js`, and `src/town.js` contain original procedural art, UI, particles, and scene presentation authored for Crestfall.
- `assets/*.m4a` are short procedural audio cues generated for Crestfall and encoded as AAC in the M4A container. They are registered and played only through GGKit audio buses.
- `assets/crestfall-mark.svg` and the root PNG icons are original procedural Crestfall marks generated for this title.
- `icon.png`, `icon512.png`, and `favicon.png` are procedural Crestfall marks generated for this title.

## Asset ledger

The studio asset policy and pack provenance are documented in [`/play/_assets/LEDGER.md`](../_assets/LEDGER.md). No harvested pack files or files from another title are shipped by Crestfall. The empty harvested-art/audio state is why the retrofit uses procedural content above.
