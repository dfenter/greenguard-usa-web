# Berry Cascade licenses

## Third-party runtime

| Item | Path | License |
|---|---|---|
| Phaser 3.87 | `/play/_shared/phaser.min.js` | MIT, see `play/_shared/LICENSES.md` |
| GGKit | `/play/_shared/ggkit.js` | in-house, see `play/_shared/LICENSES.md` |

## Art

No third-party art files are shipped. Every visual in this title is drawn
procedurally at runtime into canvas textures by `js/art.js`: berry families,
special pieces, prism, acorn, syrup coating, focus ring, ghost and arrow
states, stars, medals, icons, particles, trail nodes, board frame, cell field
and sky gradients. `icon.png`, `icon512.png` and `favicon.png` are original
renders of the same berry-cascade motif.

No pack files were taken from `/play/_assets/`; that directory currently holds
only the art bibles, the UI noise law and the asset ledger. The pack-level
provenance rules this title was built against are recorded in
`play/_assets/LEDGER.md`, and the lane art direction in
`play/_assets/ART_puzzlepop.md`. Nothing is hotlinked from another title.

## Audio

All fifteen MP3 files in `assets/` are original procedural audio, synthesised
offline for this title (marimba, glass, droplet and filtered-noise models) and
encoded to mono MP3. No sampled, licensed or third-party recordings are used.
No OGG files are shipped. Playback runs entirely through the GGKit audio buses.

| File | Cue |
|---|---|
| `swap_tick.mp3` | berry swap |
| `invalid.mp3` | illegal swap / run end |
| `ui_click.mp3` | UI confirm |
| `match.mp3` | single clear |
| `cascade.mp3` | cascade step (pitched up per chain) |
| `combo.mp3` | special-on-special combo swell |
| `special.mp3` | special piece created |
| `detonate.mp3` | line, gourd or prism detonation |
| `acorn.mp3` | acorn delivered |
| `syrup.mp3` | syrup layer cleared |
| `goal.mp3` | grove clear |
| `medal.mp3` | medal award / endless stage |
| `crown.mp3` | trail crown fanfare |
| `theme_grove.mp3` | calm board loop |
| `theme_summit.mp3` | summit and gauntlet loop |

## IP

Original IP only. No licensed characters, logos, trade dress, confectionery
cues or competitor lookalike naming.
