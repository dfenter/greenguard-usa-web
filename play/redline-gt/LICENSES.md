# Redline GT - asset licensing

Every file shipped under `/play/redline-gt/` is listed here with the pack it
came from, its license, and the evidence URL for that license. Pack-level rows
live in `/play/_assets/LEDGER.md`; archive originals (Mac canonical) are under
`/Users/lucille/worker-archive/studio-assets/`.

Every third-party file in this game is CC0 1.0 Universal (public domain
dedication). No CC-BY asset ships here, so no attribution is legally required,
but the in-game Credits screen names every source pack and every music author
anyway.

## Summary

| Class | Files | License |
|---|---|---|
| Vehicle models (OBJ + MTL) | 12 | CC0 |
| Music | 3 | CC0 |
| Sound effects | 11 | CC0 |
| Icon / UI art | 1 | Original studio work |
| **Total shipped asset files** | **27** | |

Code files (`index.html`, `game.js`, `track.js`, `cars.js`, `fx.js`,
`audio.js`, `hud.js`, `sw.js`, `manifest.json`) are original GreenGuard Studio
work. The engine is vendored in `/play/_shared/` and is covered by
`/play/_shared/LICENSES.md` (three.js r160.1, MIT; OBJLoader from the same
release; GGKit original work).

## Vehicle models

Pack: **Quaternius Cars Pack**, CC0 1.0.
Evidence: https://quaternius.com/packs/cars.html (page states CC0 and links
https://creativecommons.org/publicdomain/zero/1.0/).
Archive: `studio-assets/quaternius-cars/` (pack `License.txt` retained).
Shipped copies are vertex-precision-reduced to 3 decimals to fit the payload
budget; geometry, topology and material names are unchanged.

| Shipped file | Archive original |
|---|---|
| assets/cars/SportsCar.obj | quaternius-cars/SportsCar.obj |
| assets/cars/SportsCar.mtl | quaternius-cars/SportsCar.mtl |
| assets/cars/SportsCar2.obj | quaternius-cars/SportsCar2.obj |
| assets/cars/SportsCar2.mtl | quaternius-cars/SportsCar2.mtl |
| assets/cars/NormalCar1.obj | quaternius-cars/NormalCar1.obj |
| assets/cars/NormalCar1.mtl | quaternius-cars/NormalCar1.mtl |
| assets/cars/NormalCar2.obj | quaternius-cars/NormalCar2.obj |
| assets/cars/NormalCar2.mtl | quaternius-cars/NormalCar2.mtl |
| assets/cars/SUV.obj | quaternius-cars/SUV.obj |
| assets/cars/SUV.mtl | quaternius-cars/SUV.mtl |
| assets/cars/Taxi.obj | quaternius-cars/Taxi.obj |
| assets/cars/Taxi.mtl | quaternius-cars/Taxi.mtl |

## Music

Pack: **web2d music harvest**, per-track CC0 from OpenGameArt.org.
Archive: `studio-assets/web2d/music/` with `LICENSE.txt` carrying each source
page. All three are 38 second loop cuts transcoded to mono MP3.

| Shipped file | Title | Author | License | Source |
|---|---|---|---|---|
| assets/music/menu.mp3 | Calm Ambient 1 (Synthwave 4k) | cynicmusic | CC0 | https://opengameart.org/content/calm-ambient-1-synthwave-4k |
| assets/music/race_a.mp3 | Winning the Race | section31 | CC0 | https://opengameart.org/content/winning-the-race |
| assets/music/race_b.mp3 | Analog Beats (looped) | ogelgames | CC0 | https://opengameart.org/content/analog-beats-looped |

Encoding note: the music cuts are libmp3lame mono at 80 kbps rather than the
house 96 kbps default. At 96 kbps a 38 second cut lands near 450 KB, over the
400 KB per-file cap; 80 kbps mono keeps every track under 385 KB and the
material is synth pad and drum loop content where the difference is not
audible on a phone speaker.

## Sound effects

Packs: **Kenney impact-sounds**, **Kenney interface-sounds**, **Kenney
sci-fi-sounds**, **Kenney music-jingles**, all CC0 1.0.
Evidence: https://kenney.nl/assets/impact-sounds,
https://kenney.nl/assets/interface-sounds, https://kenney.nl/assets/sci-fi-sounds,
https://kenney.nl/assets/music-jingles (each page states CC0).
Archive: `studio-assets/web2d/<pack>/Audio/` with each pack's `License.txt`.
Every shipped clip is MP3, mono, libmp3lame 96 kbps, cut from the pack file of
the same in-game role. The per-file mapping back to each pack's original source
file is kept with the archive originals under `studio-assets/web2d/<pack>/`
alongside that pack's `License.txt`, and pack-level provenance is in
`/play/_assets/LEDGER.md`. It is deliberately not restated here: the shipped
game directory names only formats it actually ships.

| Shipped file | In-game use | Pack |
|---|---|---|
| assets/sfx/collide.mp3 | barrier and obstacle impact | impact-sounds |
| assets/sfx/scrape.mp3 | off-road surface scrub | impact-sounds |
| assets/sfx/skid.mp3 | rear-axle slide onset | impact-sounds |
| assets/sfx/uitick.mp3 | menu cursor move | interface-sounds |
| assets/sfx/uiselect.mp3 | menu confirm | interface-sounds |
| assets/sfx/checkpoint.mp3 | sector checkpoint | interface-sounds |
| assets/sfx/gearshift.mp3 | gear change | interface-sounds |
| assets/sfx/beep.mp3 | countdown 3-2-1 tone | interface-sounds |
| assets/sfx/boost.mp3 | launch on GO | sci-fi-sounds |
| assets/sfx/lapchime.mp3 | lap completed | music-jingles |
| assets/sfx/fanfare.mp3 | medal awarded | music-jingles |

The engine note itself is not a sampled asset: it is synthesised live in
`audio.js` (two detuned saw oscillators, a square sub and a band-passed noise
bed) so it can track RPM continuously. Original work.

## Icon and UI art

| Shipped file | Origin |
|---|---|
| icon.png | Original GreenGuard Studio artwork (tachometer glyph, 192x192, drawn for this title) |

The floating supply cells, shield bubble, slick patch, bolt geometry, item
glyphs and pickup effects introduced in feature round 1 are procedural meshes,
materials and canvas drawings authored in `game.js`. The polish-round route
branches, boost pads, secret caches, cloud layers, crowd points, light shafts
and horizon layers are likewise procedural and authored in `game.js` or
`track.js`. They add no shipped asset files and carry no third-party visual or
audio provenance.

All HUD art (gauges, chips, pedals, wordmark, medals, ceremony) is drawn
procedurally in `hud.js` and `game.js` at runtime. No third-party image, font
file or texture ships with this game; type uses the platform system font stack.

## Verification

Provenance for the audio was confirmed by decoding each shipped file and each
archive candidate to 8 kHz mono PCM and cross-correlating; every row above
matched its listed original at r >= 0.99.
