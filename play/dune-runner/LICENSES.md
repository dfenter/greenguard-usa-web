# Dune Runner licenses

Dune Runner uses no third-party art files. The buggy, terrain, region landmarks, pickups, flags, UI, icons, and visual effects are original procedural Three.js geometry and CSS authored for this title.

The short MP3 cues in `assets/`, including the menu and driving loops, are procedurally synthesized for this title and contain no sampled third-party material. They are loaded through GGKit audio buses only.

The runtime uses GreenGuard studio code from `play/_shared/ggkit.js` and the vendored Three.js module from `play/_shared/three/three.module.min.js`; see [play/_shared/LICENSES.md](../_shared/LICENSES.md).

The vehicle presentation follows [play/_assets/ART_vehicle3d.md](../_assets/ART_vehicle3d.md). The asset provenance rules and ledger were reviewed in [play/_assets/LEDGER.md](../_assets/LEDGER.md). No harvested pack files were copied because the required visuals are generated procedurally.

The retrofit uses the shared GGRacer adapter at `play/_shared/racer/engine.js`
and its existing engine modules. Those modules are GreenGuard studio code and
remain outside this title directory. No new third-party art or audio was added
for the retrofit. The ten route JSON files are original title authoring derived
from the existing Dune Runner route data.
