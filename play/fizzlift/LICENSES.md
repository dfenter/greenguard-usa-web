# Fizzlift - asset and code provenance

Original IP. No licensed characters, logos, trade dress, lookalike text, or
competitor iconography. "Fizzlift", the vat names (Sunfizz Vat, Deepfizz Tank,
Waveline Reservoir, Fizzlift Overflow), the piece families, the bottle-cap and
valve-seal goal objects, and all level content are original to this title.

## Third-party code

| Component | Path | License | Notes |
|---|---|---|---|
| Phaser 3 (3.87) | `/play/_shared/phaser.min.js` | MIT | Vendored fleet engine. Covered by `/play/_shared/LICENSES.md`. Loaded by absolute path. |
| GGKit | `/play/_shared/ggkit.js` | In-house (GreenGuard USA) | Studio lifecycle, input, save, audio, settings, juice and PWA kit. Covered by `/play/_shared/LICENSES.md`. |

No CDN, no network fetches, no external fonts. The UI type stack is the
platform system stack (`system-ui, -apple-system, BlinkMacSystemFont,
"Segoe UI", Roboto, sans-serif`), so the title ships no font payload.

## Art

**Every pixel of art in this title is generated procedurally in code at run
time.** Nothing was taken from `/play/_assets/`, from another title's `assets/`
directory, or from any external pack, and this title ships no `assets/`
directory at all.

- Piece families, bottle caps, valve seals, special pieces, the selector ring,
  ghost and hatch markers, particles, HUD chips, buttons, medals, banner
  plates and every icon are drawn with the 2D canvas API in
  `js/art.js` and registered as Phaser canvas textures.
- Vat backdrops, board frames, cell fields, the fizz body, the fizz glaze and
  the glowing surface bar are baked per vat and per layout in the same file.
- `icon.png`, `icon512.png` and `favicon.png` were generated procedurally from
  the same design language (Deepfizz Tank palette, a bottle cap breaking the
  glowing fizz line).

Pack ledger reference: `/play/_assets/LEDGER.md`. This title consumes **no**
rows from that ledger, because it ships no harvested pack files. The ledger is
cited here as the governing register per the asset rules; its "Used by" column
needs no update for Fizzlift.

## Audio

**Every sound is synthesised procedurally in code at run time.** There are no
audio files in the payload, so no `ogg` file can exist and nothing needs a
pack attribution.

`js/core.js` renders each cue into a Float32 buffer (swept oscillators,
filtered noise, bubble bloops), encodes it as PCM16 WAV, wraps it in a
`Blob`, and registers the resulting object URL with the GGKit audio bus.
GGKit remains the sole audio implementation: it owns decoding, the music and
SFX gain buses, the first-gesture unlock, and persistent mute and volume.

Cues: `sfx_ui`, `sfx_select`, `sfx_swap`, `sfx_invalid`, `sfx_clear`,
`sfx_fizz`, `sfx_combo`, `sfx_cap`, `sfx_crack`, `sfx_valve`, `sfx_rise`,
`sfx_fanfare`, `sfx_medal`, `sfx_fail` (14 distinct SFX), plus two loopable
music states, `music_vat` (calm board loop) and `music_rush` (brighter menu,
Seal Rush and ceremony loop).

## Fonts

None shipped. Platform system stack only.
