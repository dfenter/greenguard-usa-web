# Bastionworks asset and code notes

## Original procedural work

`game.js` contains original procedural terrain, structure, troop, icon, particle, and UI drawing authored for GreenGuard USA. No third-party raster art is shipped.

The short audio cues under `assets/audio/` are procedural, locally rendered MP3 effects authored for this title. They are routed only through GGKit's audio buses.

## Shared runtime

Phaser 3 and GGKit are loaded from `/play/_shared/`. Their license and attribution terms are recorded in [`../_shared/LICENSES.md`](../_shared/LICENSES.md).

## Asset ledger

This title follows the fleet asset policy and cites [`play/_assets/LEDGER.md`](../_assets/LEDGER.md). No harvested pack files are copied into this build.
