# Deep Ballast licenses

Deep Ballast uses original procedural geometry, shaders, UI, and particle
systems written for GreenGuard USA. No third-party art asset is shipped in
this title.

The short MP3 cues in `assets/` are generated locally for this title and are
used through the GGKit audio buses. They are not sourced from an external
pack.

The renderer is the vendored Three.js build and the lifecycle, input, save,
audio, settings, and PWA helpers are the vendored GGKit runtime under
`play/_shared/`. Shared-runtime licensing is recorded in
[`play/_shared/LICENSES.md`](../_shared/LICENSES.md).

The asset policy and provenance ledger consulted for this rebuild are
[`play/_assets/LEDGER.md`](../_assets/LEDGER.md) and
[`play/_assets/ART_vehicle3d.md`](../_assets/ART_vehicle3d.md). No ledger pack
file was copied into this title.

| Shipped file | Source and license |
|---|---|
| `assets/sonar.mp3`, `assets/hull-creak.mp3`, `assets/fauna-call.mp3`, `assets/deep-drone.mp3`, `assets/dry-dock.mp3`, `assets/salvage.mp3`, `assets/air-pickup.mp3`, `assets/survey.mp3`, `assets/rescue.mp3`, `assets/surface.mp3`, `assets/failure.mp3`, `assets/upgrade.mp3` | Locally generated procedural cues, original for GreenGuard USA |
| `icon.png`, `icon512.png`, `favicon.png` | Locally generated procedural UI marks, original for GreenGuard USA |
| `game.js`, `index.html`, `manifest.json`, `sw.js` | Original GreenGuard USA implementation; `sw.js` derives from `/play/_shared/sw-template.js` |
