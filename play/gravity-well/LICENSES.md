# Gravity Well asset and code licenses

Rev 2, 2026-08-16. This title ships only original procedural art, original
procedural audio, and the shared vendored runtime. Round 2 adds no external
asset files: the cavern strata, thruster heat, debris, dust, beacon rays,
objective markers, and navigation overlays are generated in `game.js`.

## Asset provenance

No file from a harvested art or audio pack is used. The `/play/_assets/LEDGER.md`
rules were checked before the rebuild and remain the source of record for any
future curated asset. The cavern silhouettes, lander, particles, app marks,
and audio cues are authored for Gravity Well and are GreenGuard USA original
work. They are not derived from another title directory.

The eleven MP3 cues in `assets/` are deterministic procedural tones rendered
for this title: the ambient and intensity loops, thrust, refuel, crash-soft,
crash-hard, beacon, pickup, shield, shortcut, and warning cues. They contain no
samples. MP3 is used for browser compatibility. No OGG or network audio is
referenced.

`icon.png`, `icon512.png`, `favicon.ico`, and the SVG gameplay textures in
`assets/` are generated from original Gravity Well art. No third-party image
file ships.

## Code

| File | Source | License |
|---|---|---|
| `game.js` | Original Gravity Well implementation | GreenGuard USA, all rights reserved |
| `index.html`, `manifest.json`, `sw.js` | Original title shell; `sw.js` derived from `/play/_shared/sw-template.js` | GreenGuard USA |
| `/play/_shared/phaser.min.js` | Phaser 3.87.0, Photon Storm Ltd / Richard Davey | MIT, see `/play/_shared/LICENSES.md` |
| `/play/_shared/ggkit.js` | GreenGuard studio kit | GreenGuard USA |
| `/play/_assets/LEDGER.md` | Shared asset provenance ledger consulted by this title | GreenGuard USA |

No external URLs, CDN scripts, remote fonts, or hotlinked title assets are
used at runtime. The shared asset provenance rules in
`/play/_assets/LEDGER.md` were consulted for the Round 2 art and audio gate.
