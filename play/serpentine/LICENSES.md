# Serpentine - licences and asset provenance

## Summary

Serpentine ships authored local SVG art in `assets/` and mono MP3 audio in
`assets/audio/`. The files are original GreenGuard USA work for this title,
are loaded from the same origin, and are not copied from another game or
fetched from a network at runtime. GGKit remains the only audio playback and
decode path, with audio registered at boot and decoded lazily after interaction.

The SVG set covers board detail, body, four head skins with idle, turn and
damage states, charge and shield pips, pads, gates, core, particles, and the
tutorial marker. The board floor and HUD support textures remain baked once at
boot for performance. The MP3 set contains thirteen SFX plus two looping music
beds. Every shipped audio file is MP3, never OGG or WAV.

The PNG icons (`icon.png`, `icon512.png`, `favicon.png`) are original work for
this title.

## Asset ledger

The studio asset ledger is `/play/_assets/LEDGER.md`. Serpentine consumes **no
rows** from it. The ledger is cited here as the governing document; all
shipped art and audio are title-authored assets.

The art direction Serpentine was built against is
`/play/_assets/ART_arcade2d.md` (Arcade 2D lane).

## Third-party code

| Component | Path | Licence | Notes |
|---|---|---|---|
| Phaser 3.87 | `/play/_shared/phaser.min.js` | MIT | Vendored by the studio; see `/play/_shared/LICENSES.md` |
| GGKit | `/play/_shared/ggkit.js` | In-house (GreenGuard USA) | Studio kit; sole lifecycle, input, save and audio implementation |
| Service worker template | `/play/_shared/sw-template.js` | In-house (GreenGuard USA) | `sw.js` is authored from it |

Nothing is loaded from a CDN or any other origin. The service worker precaches
only same-origin files that exist in this directory and in `/play/_shared/`.

## Fonts

No font file ships with Serpentine. All text uses the system stack
`"Trebuchet MS", Verdana, system-ui, sans-serif`.
