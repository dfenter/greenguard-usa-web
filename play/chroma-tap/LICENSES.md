# Chroma Tap - asset and license record

Original IP. No licensed characters, logos, trade dress, or lookalike text.

## Shipped asset files

| File | Source | License |
|---|---|---|
| `icon.png`, `icon512.png`, `favicon.png` | Generated procedurally for this title (rounded board plate + four tile families, no third-party art) | Original, GreenGuard USA |
| `assets/*.mp3` | Generated locally for this title, short tonal cues and loops | Original, GreenGuard USA |

That is the complete list of binary visual assets. The local audio files are
listed above. Every other visual in the game is
drawn at runtime into canvas textures by `ct_art.js`: the six tile families and
their glyphs, the special-piece plates, the disco orb, crates and their three
crack states, the balloon, the gear, the selection ring, the blast telegraph,
the three particle sprites, the medals, the lock badge, the HUD card, the goal
and control icons, and the per-pack board frames.

## Audio

The local MP3 assets in `assets/` are registered by `ct_art.js`
(`sfxSources`, `musicSources`) on the GGKit audio buses. Twelve SFX cues
(tap, cascade, charge, combo, goal, rescue, win, lose, ui, invalid, blast,
clunk) and two music states (`m_board`, `m_menu`) are included. No audio is
fetched from a network and no WAV or OGG asset is used.

## Pack assets from the shared ledger

None. `play/_assets/LEDGER.md` is the fleet ledger of Kenney CC0 and harvested
packs available to this lane; Chroma Tap ships **no** file from any of those
packs, so it adds no row to the ledger's "Used by" column. The lane art bible
`play/_assets/ART_puzzlepop.md` and the palette tokens it defines were used as
the written art direction for the procedural kit.

## Engines and shared code

- Phaser 3.87 - `/play/_shared/phaser.min.js`, covered by `/play/_shared/LICENSES.md`.
- GGKit - `/play/_shared/ggkit.js`, GreenGuard studio code.
- Service worker derived from `/play/_shared/sw-template.js`.

## Fonts

None shipped. The UI uses the platform system stack
(`system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`) per the
Puzzle Pop lane type system.
