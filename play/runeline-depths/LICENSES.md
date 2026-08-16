# Runeline Depths - asset and code provenance

Original IP. "Runeline Depths", the four depth names, the twenty four dungeon
names, the fifty six enemy and boss names, the sixteen runeguards and their
evolutions, every skill name, and all in-game text are original to this title.
No licensed characters, logos, trade dress, lookalike naming, or competitor
iconography.

## Third-party code

| Component | Path | License | Notes |
|---|---|---|---|
| Phaser 3 (3.87) | `/play/_shared/phaser.min.js` | MIT | Vendored fleet engine, loaded by absolute path. Covered by `/play/_shared/LICENSES.md`. |
| GGKit | `/play/_shared/ggkit.js` | In-house (GreenGuard USA) | Studio lifecycle, pointer identity, guarded save, audio buses, loading screen, settings shell, juice budget and PWA registration. Covered by `/play/_shared/LICENSES.md`. |

No CDN, no network fetches, no external fonts. The UI type stack is the
platform system stack (`system-ui, -apple-system, BlinkMacSystemFont,
"Segoe UI", sans-serif`), so this title ships no font payload.

## Art

**Every pixel of in-game art is generated procedurally in code at run time.**
Nothing was taken from `/play/_assets/`, from another title's `assets/`
directory, or from any external pack, and nothing is hotlinked.

`js/art.js` draws and registers, as Phaser canvas textures:

- Six orb families in four depth skins, plus lifted variants: silhouette,
  mineral rim, fake-lambert shading, speckle, edge highlight and centre glyph.
- The bind chain overlay.
- Board frames per depth and per cell size, with the whole 30 cell field, the
  trim, the corner bolts and the cell wells baked into one texture.
- Sky gradient strips, corner vignette, and one ambient mote per depth motif
  (spores, embers, pages, rune marks).
- Five particle sprites (soft spark, shard, streak, dot, ring) and the single
  white pixel every bar, plate and scrim scales.
- UI cards, chips, HUD plates, buttons and fifteen pictogram icons.
- Sixteen runeguard portrait badges plus twelve evolved variants.
- Fifty six enemy and boss portraits, baked on first sight and cached.
- Four depth badges, each with its own authored mark.

`icon.png`, `icon512.png` and `favicon.png` were rasterised offline from the
same design language (slate plate, brass frame, a violet runeline stepping
across three element orbs) with a small software rasteriser and a zlib PNG
encoder. No image editor, no stock art, no traced reference.

Pack ledger reference: `/play/_assets/LEDGER.md`. This title consumes **no**
rows from that ledger, because it ships no harvested pack files. The ledger is
cited here as the governing register per the asset rules; its "Used by" column
needs no update for Runeline Depths. Lane art direction:
`/play/_assets/ART_puzzlepop.md`. UI rules: `/play/_assets/UI_LAW.md`.

## Audio

All twenty MP3 files in `assets/` are **original procedural synthesis**,
rendered offline for this title from additive struck-bar, glass-bell, swept
oscillator and filtered-noise models, then encoded to mono MP3 (libmp3lame,
32 kHz, 80 kbps for effects and 88 kbps for music). No sampled, licensed, or
third-party recordings are used, and no pack rows are consumed. No OGG files
are shipped, per the fleet audio format law. Playback runs entirely through the
GGKit audio buses, which own decoding, the music and effect gains, the
first-gesture unlock, and persistent mute and volume.

| File | Cue |
|---|---|
| `ui_click.mp3` | menu and button confirm |
| `orb_pick.mp3` | orb lifted off the board |
| `orb_move.mp3` | each displacement step, pitched up along the path |
| `invalid.mp3` | no line formed, timer expired, illegal action |
| `match.mp3` | first clear of a resolution |
| `cascade.mp3` | cascade step, pitched up per chain link |
| `combo.mp3` | combo of four or more |
| `heal.mp3` | heart line or a healing skill |
| `strike.mp3` | party strike |
| `enemy_hit.mp3` | party takes damage |
| `bind.mp3` | bind, time lock, enrage |
| `shield_break.mp3` | boss shield shattered by a combo, or an attack blocked |
| `room_clear.mp3` | room cleared |
| `boss_down.mp3` | boss defeated |
| `recruit.mp3` | runeguard recruited on a first clear |
| `evolve.mp3` | runeguard evolution purchased |
| `fail.mp3` | party wiped |
| `music_vault.mp3` | calm depth loop |
| `music_deep.mp3` | deep and boss loop |
| `music_hall.mp3` | menu and victory loop |

Music files are registered at boot but only fetched after the first player
interaction.

## Fonts

None shipped. Platform system stack only.
