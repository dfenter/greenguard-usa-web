# Silkwind licenses and asset provenance

All Silkwind content is original GreenGuard USA work created for this title.
No third-party art, characters, brands, fonts, or music are used.

## Art

Every pixel drawn by this game is generated procedurally in `game.js` at load
time and cached as a canvas texture:

- Duellist sprite sheets (3 stances x 14 poses per fighter) are drawn from the
  pose table in `game.js`.
- Stage layers for all four stages (sky, far silhouettes, mid detail, floor)
  are drawn per stage in `bakeStage()`.
- HUD chrome, control glyphs, menu plates, banners and particle shapes are
  drawn in `bakeCommon()` and `bakeIcons()`.

The icons shipped as files were rendered offline by an original raster script
and are original marks:

| File | Origin |
|---|---|
| `icon.png` (192) | original Silkwind mark, ribbon crossing a jade blade |
| `icon512.png` (512) | same mark at 512 |
| `favicon.png` (64) | same mark at 64 |

No pack from `play/_assets/LEDGER.md` was drawn on for this title: the ledger
covers the harvested Kenney and Quaternius CC0 packs, and Silkwind ships none
of their files. The ledger's "Used by" column therefore has no Silkwind row.

## Audio

`assets/audio/*.mp3` are original cues synthesised offline (Karplus-Strong
plucks, additive bells, breath-noise flute, filtered-noise percussion) and
encoded with ffmpeg `libmp3lame`, mono, 96 kbps, per the shipped-audio format
law. No sample libraries or third-party recordings are involved.

Music: `music-menu`, `music-grove`, `music-temple`, `music-lake`, `music-peak`.
Effects: `sfx-whoosh`, `sfx-hit`, `sfx-heavy`, `sfx-clash`, `sfx-parry`,
`sfx-block`, `sfx-break`, `sfx-grab`, `sfx-dash`, `sfx-burst`, `sfx-stance`,
`sfx-ui`, `sfx-ko`, `sfx-win`, `sfx-lose`, `sfx-gong`.

## Engines

Phaser 3 and GGKit are loaded from `/play/_shared/` only. Their licence and
attribution records are maintained in `/play/_shared/LICENSES.md`.

## Text and names

All duellist names, stage names, technique names and interface copy are
original to this title.
