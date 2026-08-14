# Breach & Brick - asset licenses

Rev 1, 2026-08-10. Traces every file shipped under `/play/breach-brick/` to its
source, as required by `/play/_assets/LEDGER.md`.

**Summary: no third-party asset ships in this game, and no asset pack row in the
ledger is consumed.** The title ships exactly three binary files (two PWA icons
and a favicon); everything else is JavaScript. Every image the player sees in
game and every sound the player hears is generated procedurally at runtime, in
code, on the device.

The ledger's "Used by" column is therefore **unchanged** by this title. In
particular the `Kenney impact-sounds`, `Kenney interface-sounds`,
`Kenney music-jingles` and `music (mixed harvest)` rows are deliberately not
used: `/play/_assets/` contains no audio or image files in this repository (only
the art bibles and the ledger itself), and the brief forbids reading another
title's `assets/` directory, so the CC0 route available here is procedural
generation, which is what this title does.

Nothing is fetched from the network at any point. There is no `assets/`
directory, no `.ogg` file, and no `.ogg` path referenced anywhere in the title.

---

## Shipped files

| File | Bytes | Kind | Source | License |
|---|---|---|---|---|
| `index.html` | 1863 | code | Original, authored for this title | CC0 |
| `game.js` | ~118000 | code | Original, authored for this title | CC0 |
| `bb_data.js` | ~13700 | code | Original. Authored wall layouts, themes, powerup, skin and medal tables | CC0 |
| `bb_audio.js` | ~16900 | code | Original. The procedural audio bank (synthesis only, no samples) | CC0 |
| `sw.js` | 2088 | code | Derived from `/play/_shared/sw-template.js` (studio template) | CC0 |
| `manifest.json` | 601 | data | Original | CC0 |
| `icon.png` | 21761 | image | Original, generated with Pillow. See "Icons" below | CC0 |
| `icon512.png` | 76406 | image | Original, generated with Pillow. See "Icons" below | CC0 |
| `favicon.ico` | 11374 | image | Original, same generator, multi-size ICO (16/32/48/64) | CC0 |
| `NOTES.md`, `LICENSES.md` | - | docs | Original | CC0 |

`/play/_shared/phaser.min.js` and `/play/_shared/ggkit.js` are loaded from the
shared directory and are covered by `/play/_shared/LICENSES.md`. They are not
copied into this title.

---

## Icons

`icon.png` (192x192), `icon512.png` (512x512) and `favicon.ico` are drawn from
primitives (rounded rectangles, ellipses, gaussian-blurred glow layers) at 4x
supersample and downfiltered with Lanczos. The subject is a breached brick wall
over a lit ball and paddle: original artwork, no traced, photographic, scanned,
or model-generated source. Only Pillow and the Python standard library are used.

The generator is dev tooling and deliberately does not ship inside the game
directory. It is a single self-contained script, `bb_icons.py`, whose entire
input is the palette below plus the geometry constants in the script itself:

    rows      #4EDBCA, #5CA8FF, #B883FF, #FF719D
    ground    #0A0E20 -> #180C28 vertical gradient
    ball      #F0FFFF core, additive teal halo
    paddle    #71E3D0 face over #2FB8A8 body, #D8FFF8 lamp

## In-game art (zero files)

Every sprite is baked once at boot into a GPU texture by `bakeAll()` in
`game.js`, using Phaser's `Graphics.generateTexture`, and the `Graphics` object
is destroyed immediately afterwards. 166 textures are produced: four themed
backgrounds and haze washes, 84 brick faces (4 themes x 7 brick kinds x 3 damage
states), four falling-chunk variants, four boss core plates, five paddle decks
plus a stun overlay, five ball cores, eight powerup capsules and their eight HUD
pips, five particle sprites, the warning beam and floor chevron, two tessellated
rings, the bolt, the shield bar, the nine-slice chrome set, the full-screen
static chrome plate, the life pips, and four medal marks.

No image is loaded over the network or from disk at runtime.

## Audio (zero files)

`bb_audio.js` synthesises all 32 cues at boot: 30 sound effects and two 8-second
seamless music stems. Each cue is built from oscillators (sine, triangle, square,
saw, pulse), swept envelopes and filtered pseudo-random noise, written to 16-bit
mono PCM WAV at 22050 Hz, wrapped in a `Blob`, and handed to the GGKit audio bus
as an object URL. GGKit remains the sole audio implementation: this title never
constructs an `AudioContext`, never connects to a destination node, and never
plays a buffer itself.

No sample, sample library, recording, or model-generated audio is used, and
nothing is fetched. Because no encoded audio file ships, the fleet's "mp3/m4a
only, never ogg" law is satisfied trivially: there is no `.ogg` and no `.mp3`
in the title, and iOS Safari decodes the generated PCM WAV natively.

Music stems are phase-locked (every pad partial is snapped to an exact multiple
of 1/duration) so the loop seam is sample-continuous and does not click.

## Fonts

No font file ships. All text uses the platform monospace stack
`ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`.

## Original IP

Breach & Brick, its twelve wall names, four wall identities, powerup names, deck
and core skin names, and all artwork and audio are original work authored for
GreenGuard USA and released under **CC0 1.0 Universal**. The title is a brick
breaker, a mechanic in the public domain since the 1970s; no trademarked name,
character, level layout, sprite, or sound from any existing title is used or
referenced.
