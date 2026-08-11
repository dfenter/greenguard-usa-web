# Kart Circuit Zero: asset and code licenses

Every shipped file under `/play/kart-circuit-zero/` is original GreenGuard
Studio work for Fleet F2, except the shared runtime files loaded from
`/play/_shared/`. No file is hotlinked from a sibling title.

## Code and runtime

`index.html`, `game.js`, `tracks/*.json`, `manifest.json`, and `sw.js`
are original GreenGuard Studio work. `game.js` is the title simulation and
GGRacer adapter. The four track JSON files are authored data derived from the
seeded circuit control arrays in `game.js`.

Three.js r160 is loaded by the shared GGRacer engine from
`/play/_shared/three/three.module.min.js` under the MIT license. GGKit is
loaded from `/play/_shared/ggkit.js` under the project's original-work terms.
The shared engine licensing is documented in `/play/_shared/LICENSES.md`.

## Procedural art

The GGRacer road, curbs, barriers, environments, parallax horizon, themed
dressing, GT-bar cars, ghost treatment, headlights and speed FX are generated
at runtime from shared Three.js primitives and title JSON metadata. The HUD,
CSS panels, banner treatments and icons are original GreenGuard Studio work.
No third-party model, font, image, or texture ships with this title.

## Audio

The eight MP3 clips under `assets/audio/` are short, original procedural tones
generated for this title. GGKit owns registration, playback, suspension, and
the music and SFX buses. No third-party audio file is redistributed here.

## Files

| File or path | Origin | License |
|---|---|---|
| `game.js`, `tracks/*.json` | Original simulation, adapter and authored track data | GreenGuard Studio original |
| `index.html` | Original shell and HUD | GreenGuard Studio original |
| `manifest.json`, `sw.js` | Original PWA shell | GreenGuard Studio original |
| `icon.svg`, `icon.png`, `icon512.png`, `favicon.png` | Original title mark | GreenGuard Studio original |
| `assets/audio/*.mp3` | Original procedural audio | GreenGuard Studio original |
| `/play/_shared/racer/*.js` | Shared GGRacer runtime | See `/play/_shared/LICENSES.md` |
| `/play/_shared/three/three.module.min.js` | Three.js r160 | MIT |
