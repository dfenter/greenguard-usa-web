# Vertol Rescue licenses and provenance

## Original title work

- `game.js` and `index.html` are original GreenGuard studio work for Vertol Rescue.
- The helicopter, survivors, zones, structures, hazards, pickups, particles, UI, and icon artwork are procedural Three.js or CSS work created for this title.
- Audio cues are short original synthesized MP3 files made from procedural tones for this title and passed through GGKit audio buses. No external audio file is shipped.
- `assets/rotor.mp3`, `assets/night.mp3`, `assets/wind.mp3`, `assets/radio.mp3`, `assets/cry.mp3`, `assets/secure.mp3`, `assets/impact.mp3`, `assets/medal.mp3`, `assets/pickup.mp3`, `assets/landing.mp3`, and `assets/tailwash.mp3` are original procedural MP3 cues generated for this title. They are not third-party recordings.

## Shared runtime

- `/play/_shared/three/three.module.min.js` is three.js r160.1, MIT License, copyright 2010-2023 Three.js Authors. See `/play/_shared/LICENSES.md` and https://github.com/mrdoob/three.js.
- `/play/_shared/ggkit.js` is original GreenGuard studio work. It owns lifecycle, per-pointer input identity, guarded saves, audio buses, settings, loading, PWA registration, and accessibility juice.

## Asset ledger

The art and asset rules were reviewed against `/play/_assets/ART_vehicle3d.md` and `/play/_assets/LEDGER.md`. No harvested pack file is copied into this title, so no third-party pack attribution is required for the shipped frame. The MP3 cues are original procedural audio, not a harvested CC0 recording set.
