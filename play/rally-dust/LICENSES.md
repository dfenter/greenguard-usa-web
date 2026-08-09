# Rally Dust - asset licensing

Every file shipped under `/play/rally-dust/` is listed here with the pack it
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
| Vehicle models (OBJ + MTL) | 6 | CC0 |
| Music | 3 | CC0 |
| Sound effects | 13 | CC0 |
| Icon art | 2 | Original studio work |
| **Total shipped asset files** | **24** | |

Code files (`index.html`, `game.js`, `stage.js`, `cars.js`, `fx.js`,
`audio.js`, `hud.js`, `sw.js`, `manifest.json`) are original GreenGuard Studio
work. The engine is vendored in `/play/_shared/` and is covered by
`/play/_shared/LICENSES.md` (three.js r160.1, MIT; OBJLoader from the same
release; GGKit original work).

## Vehicle models

Pack: **Quaternius Cars Pack**, CC0 1.0.
Evidence: https://quaternius.com/packs/cars.html (page states CC0 and links
https://creativecommons.org/publicdomain/zero/1.0/).
Archive: `studio-assets/quaternius-cars/` (pack `License.txt` retained).
Shipped copies are vertex-precision-reduced to 3 decimals and stripped of
their unused normal and UV channels (the renderer recomputes flat normals and
no texture is sampled). Geometry, topology and material names are unchanged.

Three bodies carry six liveries; a livery is a re-authored material set, not a
second download.

| Shipped file | Archive original | Liveries |
|---|---|---|
| assets/cars/SportsCar.obj | quaternius-cars/SportsCar.obj | Burrow 210 Works, Burrow 210 Ochre |
| assets/cars/SportsCar.mtl | quaternius-cars/SportsCar.mtl | |
| assets/cars/NormalCar2.obj | quaternius-cars/NormalCar2.obj | Thistle RS, Thistle Cobalt |
| assets/cars/NormalCar2.mtl | quaternius-cars/NormalCar2.mtl | |
| assets/cars/SUV.obj | quaternius-cars/SUV.obj | Quarry XT, Quarry Ember |
| assets/cars/SUV.mtl | quaternius-cars/SUV.mtl | |

## Music

Pack: **web2d music harvest**, per-track CC0 from OpenGameArt.org.
Archive: `studio-assets/web2d/music/` with `LICENSE.txt` carrying each source
page. All three are 34 second loop cuts transcoded to mono MP3 with a short
fade at each end.

| Shipped file | Title | Author | License | Source |
|---|---|---|---|---|
| assets/music/menu.mp3 | Calm Ambient 2 (Synthwave 15k) | cynicmusic | CC0 | https://opengameart.org/content/calm-ambient-2-synthwave-15k |
| assets/music/stage_a.mp3 | Liquid Flame | of-far-different-nature | CC0 | https://opengameart.org/content/liquid-flame |
| assets/music/stage_b.mp3 | Cynic Battle Loop | ferk | CC0 | https://opengameart.org/content/cynic-battle-loop |

Encoding note: the music cuts are libmp3lame mono at 80 kbps rather than the
house 96 kbps default. At 96 kbps a 34 second cut lands near 400 KB, at the
per-file cap; 80 kbps mono keeps every track under 341 KB, and the material is
synth pad and drum loop content where the difference is not audible on a phone
speaker.

## Sound effects

Packs: **Kenney impact-sounds**, **Kenney interface-sounds**, **Kenney
digital-audio**, **Kenney music-jingles**, all CC0 1.0.
Evidence: https://kenney.nl/assets/impact-sounds,
https://kenney.nl/assets/interface-sounds, https://kenney.nl/assets/digital-audio,
https://kenney.nl/assets/music-jingles (each page states CC0).
Archive: `studio-assets/web2d/<pack>/Audio/` with each pack's `License.txt`.
Every clip is transcoded from the archive Vorbis master to libmp3lame mono
96 kbps, per the audio format law (iOS Safari cannot decode Vorbis). Nothing in
this format ships: every audio file under `/play/rally-dust/` is MP3. Archive
originals are named below without their container extension for that reason;
the full filenames are in the pack `License.txt` alongside each archive copy.

| Shipped file | In-game use | Archive original | Pack |
|---|---|---|---|
| assets/sfx/impact.mp3 | tree and rock contact | impactWood_heavy_002 (Vorbis source) | impact-sounds |
| assets/sfx/gravel.mp3 | off-road surface scrub | impactMining_003 (Vorbis source) | impact-sounds |
| assets/sfx/slide.mp3 | rear axle slide on a loose surface | footstep_snow_003 (Vorbis source) | impact-sounds |
| assets/sfx/note.mp3 | pace-note radio blip | pepSound1 (Vorbis source) | digital-audio |
| assets/sfx/launch.mp3 | launch on GO | phaseJump1 (Vorbis source) | digital-audio |
| assets/sfx/uitick.mp3 | menu cursor move | click_002 (Vorbis source) | interface-sounds |
| assets/sfx/uiselect.mp3 | menu confirm | confirmation_002 (Vorbis source) | interface-sounds |
| assets/sfx/split.mp3 | halfway split time | confirmation_004 (Vorbis source) | interface-sounds |
| assets/sfx/beep.mp3 | countdown 3-2-1 tone | bong_001 (Vorbis source) | interface-sounds |
| assets/sfx/reset.mp3 | off-road three second reset | impactSoft_medium_001 (Vorbis source) | impact-sounds |
| assets/sfx/land.mp3 | landing after a jump | impactPlate_heavy_003 (Vorbis source) | impact-sounds |
| assets/sfx/stageclear.mp3 | stage finished | jingles_PIZZI04 (Vorbis source) | music-jingles |
| assets/sfx/fanfare.mp3 | medal awarded | jingles_STEEL05 (Vorbis source) | music-jingles |

Two sound sources in this game are not sampled assets and are original work:

- The **engine note** is synthesised live in `audio.js` (three detuned saw
  oscillators, a square sub octave and a band-passed noise bed) so it tracks
  speed continuously and can crackle on a high-RPM lift.
- The **co-driver voice** is synthesised in `audio.js` as one pitched chip per
  word of the pace note, on a contour that falls for a left call and rises for
  a right one. No recorded speech ships with this game.

## Icon and UI art

| Shipped file | Origin |
|---|---|
| icon.png | Original GreenGuard Studio artwork (dusk stage vignette, 192x192, drawn for this title) |
| icon512.png | The same artwork rendered at 512x512 |

All HUD art (gauges, chips, pace-note cards, pedals, wordmark, medals,
ceremony) is drawn procedurally in `hud.js` and `game.js` at runtime. No
third-party image, font file or texture ships with this game; type uses the
platform system font stack, and the dust sprite and blob shadow are generated
into a canvas at load.

## Independence from the sibling title

Rally Dust reuses proven patterns from Redline GT (spline sampling, merged
vertex-coloured geometry, pooled particle systems, the HUD primitive layer,
the music director). Every file was copied and adapted into this directory:
Rally Dust imports nothing from `/play/redline-gt/`, and the two titles share
only the vendored engine and GGKit under `/play/_shared/`.
