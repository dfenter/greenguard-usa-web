# Willowmere asset and code provenance

Original IP. Willowmere's village, districts, characters, dialogue, requests,
furniture names, icons, palette, textures, particles, and UI are authored for
this title and generated procedurally in `js/willowmere.js`. No competitor
characters, logos, trade dress, or external fonts are used.

## Third-party code

| Component | Path | License | Notes |
|---|---|---|---|
| Phaser 3 | `/play/_shared/phaser.min.js` | MIT | Vendored fleet engine, loaded by absolute path |
| GGKit | `/play/_shared/ggkit.js` | In-house | Lifecycle, input, save, audio, settings, juice and PWA kit |

Both shared components are covered by `/play/_shared/LICENSES.md`.

## Asset ledger

The governing pack register is `/play/_assets/LEDGER.md`. Willowmere consumes
no harvested pack files. The ledger is cited here as required; no asset row is
marked as used because the title ships only procedural art and generated audio.

## Audio

The five `audio/music_*.mp3` tracks and ten `audio/sfx_*.mp3` files are short,
original procedural tones rendered locally for this title. They contain no
third-party samples. They are registered with and played only through GGKit's
music and SFX buses.

## Icons

`icon.png`, `icon512.png`, and `favicon.png` are local procedural exports of
the Willowmere lake-and-lantern mark. No external image files are shipped.
