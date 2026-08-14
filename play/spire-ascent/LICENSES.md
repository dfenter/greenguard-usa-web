# Spire Ascent - asset licenses

Rev 1, 2026-08-10. Traces every file shipped under `/play/spire-ascent/` to
its source, as required by `/play/_assets/LEDGER.md`.

**Summary: no third-party asset ships in this game.** Every image and every
audio file is original work authored for Spire Ascent by GreenGuard USA and
released under **CC0 1.0 Universal (public domain dedication)**. Nothing is
harvested, sampled, traced or derived from an outside pack.

**No ledger pack row is consumed by this title.** `/play/_assets/` contains
art bibles and the ledger itself and no shippable asset files, so the brief's
first option (copy an existing `_assets/` file into `assets/`) had nothing to
draw from. Everything below therefore takes the brief's second option and is
generated procedurally. The "Used by" column in
`/play/_assets/LEDGER.md` stays unchanged for every pack, including the
`music (mixed harvest)` row, which is deliberately **not** used: the two stems
here are synthesised so they share a tempo, a key and a bar length and can be
crossfaded phase-coherently by GGKit.

No file is hotlinked from another title's directory. Nothing is fetched from
a network at runtime; every path referenced by `game.js` and precached by
`sw.js` resolves inside this directory or `/play/_shared/`.

Everything is reproducible. The generator scripts are dev tooling and must not
ship, so they live outside the game directory:

| Script | Produces |
|---|---|
| `build_art.py` | `assets/atlas.png` + `atlas.json`, the four band sky/far/near/wall strips, `lava.png`, `vignette.png`, `windfield.png`, `logo.png`, `digits.png` + `digits.json`, `icon.png`, `icon512.png`, `favicon.png` |
| `build_audio.py` | `assets/music_climb.mp3`, `assets/music_peril.mp3` and all 24 `assets/sfx_*.mp3` cues |

Only Pillow (images), the Python standard library (audio synthesis) and
ffmpeg/libmp3lame (mp3 encode) are used. No samples, no sample libraries, no
model-generated audio, no network fetches.

**Audio format law.** Everything is encoded as mono mp3 with libmp3lame. iOS
Safari cannot decode ogg through `decodeAudioData`, so an ogg would ship
silent on iPhone behind GGKit's error handling. No `.ogg` file exists in this
title and no `.ogg` path is referenced anywhere.

---

## Atlas and sprite art

`assets/atlas.png` packs 64 frames, all drawn from primitives with Pillow at
4x supersample and downfiltered. The frame set:

- 25 climber frames: five skins (`emberling`, `warden`, `vane`, `stormcaller`,
  `crown`) x five poses (`run`, `rise`, `fall`, `dash`, `land`). Each skin is
  an authored silhouette variant, not a recolour: cloak sweep, crest (hood,
  helm, fin, horns, crown) and trim differ per skin.
- 16 platform faces: four kinds (`ledge`, `crumble`, `mover`, `spring`) x the
  four band palettes.
- Hazard and prop marks: `spring_cap`, `spike_strip`, `wall_spike`, `ember`,
  `chevron`, `pip`.
- HUD chrome: `panel`, `panel_lit`, `banner`, `bar_frame`, `px`.
- Five medal marks: `medal_bronze`, `medal_silver`, `medal_gold`,
  `medal_plat`, `medal_crown`.
- Seven particle textures: `p_disc`, `p_dust`, `p_spark`, `p_shard`,
  `p_ribbon`, `p_streak`, `p_bolt`.

| File | Bytes | sha256:12 | Source | License |
|---|---|---|---|---|
| `assets/atlas.png` | 147592 | `45433ddce630` | Original. `build_art.py:pack_atlas()` over the frame builders listed above | CC0 |
| `assets/atlas.json` | 10778 | `2ed3926f9ea9` | Original. Phaser JSON-hash frame map emitted by `pack_atlas()` | CC0 |
| `assets/digits.png` | 3809 | `3ce4aacd3fd3` | Original. `build_digits()` - bundled seven-segment numeral face, glyphs `0-9 + - . : / x m %` | CC0 |
| `assets/digits.json` | 642 | `5ad3ea971155` | Original. Glyph metrics emitted by `build_digits()` | CC0 |
| `assets/logo.png` | 13851 | `69575ad7f995` | Original. `build_logo()` - the stepped spire lockup on the title screen | CC0 |

## Band backdrops (16 files)

Four bands, each with a seamless-in-Y sky wash, a distant silhouette layer, a
nearer motif layer, and a tileable wall strip mirrored at runtime for the
right-hand wall.

| File | Bytes | sha256:12 | Source | License |
|---|---|---|---|---|
| `assets/sky_0.png` | 72301 | `128c138c18f1` | Original. `band_sky()` - foundation scaffolds, lamp-oil warm | CC0 |
| `assets/sky_1.png` | 80898 | `906558b00529` | Original. `band_sky()` - windswept mid-spire, cold blue | CC0 |
| `assets/sky_2.png` | 74881 | `64b9f2918cd9` | Original. `band_sky()` - crumbling upper ruins, violet | CC0 |
| `assets/sky_3.png` | 66375 | `8e4661c86672` | Original. `band_sky()` - storm-lashed summit, indigo with stars | CC0 |
| `assets/far_0.png` | 13182 | `2a9dfd012b9a` | Original. `band_far()` - distant scaffold lattice | CC0 |
| `assets/far_1.png` | 9238 | `fb5cdc2f596f` | Original. `band_far()` - distant banner decks | CC0 |
| `assets/far_2.png` | 11262 | `c7fa9b85b459` | Original. `band_far()` - distant broken masonry | CC0 |
| `assets/far_3.png` | 6691 | `06cb257874ce` | Original. `band_far()` - distant summit crags | CC0 |
| `assets/near_0.png` | 2468 | `792d38bab0e3` | Original. `band_near()` - lit gantry beams and lamps | CC0 |
| `assets/near_1.png` | 2000 | `18b936f052aa` | Original. `band_near()` - hanging banners | CC0 |
| `assets/near_2.png` | 1592 | `14f5b788f931` | Original. `band_near()` - broken crenellations | CC0 |
| `assets/near_3.png` | 2685 | `01820ae30afa` | Original. `band_near()` - storm crags with lit spines | CC0 |
| `assets/wall_0.png` | 775 | `b26ac4ac7c65` | Original. `wall_strip()` - timber-brown shaft wall | CC0 |
| `assets/wall_1.png` | 746 | `f9753ffa4a07` | Original. `wall_strip()` - slate-blue shaft wall | CC0 |
| `assets/wall_2.png` | 769 | `94ea0670398d` | Original. `wall_strip()` - ruined violet shaft wall | CC0 |
| `assets/wall_3.png` | 866 | `4105dd60a62e` | Original. `wall_strip()` - indigo summit shaft wall | CC0 |

## Effect textures and icons

| File | Bytes | sha256:12 | Source | License |
|---|---|---|---|---|
| `assets/lava.png` | 21796 | `836eea3b8fdf` | Original. `lava_surface()` - doom-line surface with a bright crust line | CC0 |
| `assets/vignette.png` | 9655 | `851164bf5b95` | Original. `vignette()` - edge-dark radial mask for the doom warning | CC0 |
| `assets/windfield.png` | 575 | `e8ae0c5f5ab2` | Original. `wind_field()` - tileable streak field for wind zones | CC0 |
| `icon.png` | 11462 | `77b461bc7bab` | Original. `app_icon(192)` - the lit spire under a climber | CC0 |
| `icon512.png` | 32239 | `e47ee2b9f6af` | Original. `app_icon(512)` - same mark, maskable-safe margins | CC0 |
| `favicon.png` | 2904 | `1005981cae47` | Original. `app_icon(64)` | CC0 |

## Music (2 files)

Two 8-bar stems at 104 BPM in A minor, identical 18.46 second length, so
GGKit's crossfade between them is phase coherent. `music_climb` is the ascent
loop; `music_peril` is the intensity layer that takes over when the doom line
closes. The two files share a byte length only because libmp3lame is encoding
at a constant 96 kbit/s and both stems are the same duration; the sha256
values differ and the peril stem carries its own snare, a tension drone, a
storm shimmer and an octave-up lead.

| File | Bytes | sha256:12 | Source | License |
|---|---|---|---|---|
| `assets/music_climb.mp3` | 222294 | `ed87744eb32e` | Original. `build_audio.py:render_music(False)` - mono 96 kbit/s | CC0 |
| `assets/music_peril.mp3` | 222294 | `9ae2fc85fe4b` | Original. `build_audio.py:render_music(True)` - same loop, intensity layer | CC0 |

## Sound effects (24 files)

All synthesised by `build_audio.py`, mono 112 kbit/s, deterministic (every
noise source is seeded per cue, so a rebuild is byte-stable). Each cue is its
own generator function, not a pitch shift of another. Where two cues share a
byte length they share only a duration at a constant bitrate; their sha256
values and their waveforms differ.

| File | Bytes | sha256:12 | Cue | Generator | License |
|---|---|---|---|---|---|
| `assets/sfx_jump.mp3` | 4433 | `63f4dbd254b6` | leap released | `cue_jump()` | CC0 |
| `assets/sfx_jump_big.mp3` | 5895 | `ad43140d7029` | charge reached full | `cue_jump_big()` | CC0 |
| `assets/sfx_charge.mp3` | 1873 | `a84305e52cfc` | charge meter tick | `cue_charge()` | CC0 |
| `assets/sfx_dash.mp3` | 5895 | `b4192f54fa8a` | mid-air dash | `cue_dash()` | CC0 |
| `assets/sfx_land.mp3` | 3701 | `838baf5d8369` | clean landing | `cue_land()` | CC0 |
| `assets/sfx_wallkick.mp3` | 5164 | `f1ee48b31be7` | wall kick | `cue_wallkick()` | CC0 |
| `assets/sfx_spring.mp3` | 7358 | `f6999c04f263` | spring launch | `cue_spring()` | CC0 |
| `assets/sfx_crack.mp3` | 3701 | `9129e56db620` | crumbler tell begins | `cue_crack()` | CC0 |
| `assets/sfx_crumble.mp3` | 7724 | `f5ceed13a10a` | crumbler collapses | `cue_crumble()` | CC0 |
| `assets/sfx_wind.mp3` | 16867 | `2757294d1af3` | wind zone gust | `cue_wind()` | CC0 |
| `assets/sfx_rumble.mp3` | 19793 | `58c2fad757e0` | lava rumble, doom line close | `cue_rumble()` | CC0 |
| `assets/sfx_ember.mp3` | 6261 | `a5745fc2f17f` | combo-refresh ember taken | `cue_ember()` | CC0 |
| `assets/sfx_combo0.mp3` | 5164 | `62b5ad2bf631` | combo rung 1 | `cue_combo(0)` | CC0 |
| `assets/sfx_combo1.mp3` | 5164 | `b4dab02222e4` | combo rung 2 | `cue_combo(1)` | CC0 |
| `assets/sfx_combo2.mp3` | 5164 | `b950c662cec9` | combo rung 3 | `cue_combo(2)` | CC0 |
| `assets/sfx_combo3.mp3` | 5164 | `bc0b79ea67a1` | combo rung 4 | `cue_combo(3)` | CC0 |
| `assets/sfx_combo4.mp3` | 5164 | `4d03bdf07e56` | combo rung 5 | `cue_combo(4)` | CC0 |
| `assets/sfx_milestone.mp3` | 19061 | `940669b6611e` | band entered | `cue_milestone()` | CC0 |
| `assets/sfx_medal.mp3` | 23450 | `54ba50aa8f85` | medal tier reached | `cue_medal()` | CC0 |
| `assets/sfx_unlock.mp3` | 16501 | `da58a8acd5e0` | cosmetic or shortcut unlocked | `cue_unlock()` | CC0 |
| `assets/sfx_best.mp3` | 26010 | `6d7eb1b090f1` | new best | `cue_best()` | CC0 |
| `assets/sfx_death.mp3` | 20524 | `dd79fafa0e20` | lava takes the climb | `cue_death()` | CC0 |
| `assets/sfx_spike.mp3` | 8090 | `3fd9982a8607` | impaled | `cue_spike()` | CC0 |
| `assets/sfx_start.mp3` | 15038 | `dd5654f62f92` | run begins | `cue_start()` | CC0 |
| `assets/sfx_ui.mp3` | 1873 | `6cb4ad098356` | UI tap | `cue_ui()` | CC0 |

## Code and fonts

| File | Source | License |
|---|---|---|
| `game.js` | Original, written for this title | GreenGuard USA, all rights reserved |
| `index.html`, `manifest.json` | Original | GreenGuard USA |
| `sw.js` | Original; authored from the studio `/play/_shared/sw-template.js` with `SLUG`, `VERSION` and the full precache list filled in. Every listed path was checked to exist on disk before the file was written | GreenGuard USA |
| `NOTES.md`, `LICENSES.md` | Original documentation for this title | GreenGuard USA |
| `/play/_shared/phaser.min.js` | Phaser 3.87 (Photon Storm) - vendored in `_shared`, not in this game directory | MIT, see `/play/_shared/LICENSES.md` |
| `/play/_shared/ggkit.js` | Original studio kit - vendored in `_shared` | GreenGuard USA |
| Typeface | Verdana / Geneva / `system-ui` system stack for prose, plus the original bundled `digits.png` numeral face for every HUD number. No third-party font file ships | n/a |

## Original IP note

Every name, silhouette and mechanic in this title is original. The four tower
bands (Foundation Scaffolds, Windswept Mid-Spire, Crumbling Upper Ruins,
Storm-Lashed Summit), their set-pieces (Lamplit Gantry, Banner Bridge,
Collapsing Nave, Lightning Spire), their shortcut routes (Cargo Hoist, Updraft
Flue, Fallen Arch, Storm Eye), the five climber skins, the five trails, the
five medal tiers and the doom-line loop were designed for Spire Ascent.
Nothing is drawn from, named after, or modelled on an existing product.
