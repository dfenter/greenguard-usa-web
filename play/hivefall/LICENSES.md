# Hivefall licenses

## Third-party runtime

| Item | Path | License |
|---|---|---|
| Phaser 3 | `/play/_shared/phaser.min.js` | MIT, see `play/_shared/LICENSES.md` |
| GGKit | `/play/_shared/ggkit.js` | in-house, see `play/_shared/LICENSES.md` |

## Art

No third-party art files are shipped. Every visual in this title is drawn
procedurally at runtime into canvas textures by `js/art.js`: the five survivor
piece families and their charged variants, the four act hazard coats, seven
horde silhouettes, three shot types, the selector Ready, Preview, Resolve and
Invalid states, five particle textures, the per-act board frames, lane tracks,
wall and sky backdrops, HUD cards, buttons, meters, chips, telegraph marks and
the thirteen UI glyphs.

`icon.png`, `icon512.png` and `favicon.png` are original renders of the same
Hivefall motif (falling comb cells over a plated wall), generated for this
title only.

No pack files were taken from `/play/_assets/`; that directory holds the art
bibles, the UI noise law and the asset ledger. The provenance rules this title
was built against are recorded in `play/_assets/LEDGER.md`, and the lane art
direction in `play/_assets/ART_puzzlepop.md`. Nothing is hotlinked from another
title's directory.

## Audio

All eighteen mp3 files in `assets/` are original procedural audio, synthesised
offline for this title (marimba, struck-metal, filtered-noise and simple
subtractive models) and encoded to mono mp3. No sampled, licensed or
third-party recordings are used. No ogg files are shipped, per the mobile audio
format law. Playback runs entirely through the GGKit audio buses.

| File | Cue |
|---|---|
| `swap.mp3` | piece swap |
| `invalid.mp3` | illegal swap, coated tile, empty flare |
| `click.mp3` | UI confirm |
| `match.mp3` | single clear |
| `cascade.mp3` | cascade step |
| `shot.mp3` | turret fire |
| `impact.mp3` | shot connects |
| `kill.mp3` | horror down |
| `repair.mp3` | wall patched |
| `salvage.mp3` | salvage collected |
| `breach.mp3` | wall takes a hit |
| `flare.mp3` | signal flare and boss abilities |
| `clear.mp3` | wave cleared |
| `boss.mp3` | named horror enters and dies |
| `defeat.mp3` | wall breached |
| `theme_watch.mp3` | calm board loop |
| `theme_siege.mp3` | late wave and boss loop |
| `theme_shelter.mp3` | shelter and results loop |

## IP

Original IP only. Survivor names, horde names, act names, boss names, copy,
art and audio are written for this title. No licensed characters, logos, trade
dress, competitor lookalike naming or borrowed match-3 iconography.
