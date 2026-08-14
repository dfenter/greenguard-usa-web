# Vanguard Four licenses

Vanguard Four uses no network-hosted game assets. Hero sprite sheets, enemy silhouettes, room chrome, particles, icons, and the short audio cues are generated procedurally for this title. The MP3 cues are synthesized locally and contain no third-party recordings.

The renderer is the vendored Phaser 3 build at `/play/_shared/phaser.min.js`. Lifecycle, per-pointer input, guarded save validation, audio buses, pause handling, reduced-motion settings, and PWA registration use `/play/_shared/ggkit.js`. Those shared runtime licenses are covered by `/play/_shared/LICENSES.md`.

The visual direction follows `/play/_assets/ART_arcade2d.md`. The approved CC0 pack inventory and evidence reference is `/play/_assets/LEDGER.md`; no harvested pack file is shipped in this rebuild. The Warden roar bus is a procedural cue because no CC0 audio cut is present under `/play/_assets/`.
