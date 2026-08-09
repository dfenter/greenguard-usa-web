# Skyfall Command - asset licenses

Rev 1, 2026-08-07. Traces every file shipped under `/play/skyfall-command/`
to its source, as required by `/play/_assets/LEDGER.md`.

**Summary: no third-party asset ships in this game.** Every image and every
audio file is original work authored for Skyfall Command by GreenGuard USA and
released under **CC0 1.0 Universal (public domain dedication)**. Nothing is
harvested, sampled, or derived from an outside pack, so no CC-BY attribution is
owed and no third-party credit appears in game. No ledger pack row is consumed
by this title; in particular the `music (mixed harvest)` row is deliberately
**not** used, because the shared harvest returned nothing that matched this
title's tempo and key, so both music stems were synthesised instead. The "Used
by" column in the ledger therefore stays unchanged for every pack.

Everything is reproducible. The generator scripts live outside the game
directory (dev tooling must not ship) at:

    /Users/lucille/ue-port-studio/aaa/harness/sc_tools/

| Script | Produces |
|---|---|
| `build_art.py` | `assets/atlas.png` + `atlas.json`, the three skyline strips, `stars.png`, `neb.png`, `clouds.png`, `aurora.png`, `ground.png`, `logo.png`, `digits.png` + `digits.json`, the eight `p_*`/`disc` particle textures, `icon.png`, `icon512.png` |
| `build_audio.py` | `assets/music_night.mp3`, `assets/music_alert.mp3`, all seventeen `assets/sfx_*.mp3` cues |

Only Pillow (images), the Python standard library (audio synthesis) and
ffmpeg/libmp3lame (mp3 encode) are used. No samples, no sample libraries, no
model-generated audio, no network fetches, and nothing is fetched at runtime.

**Audio format law.** Everything is encoded as mono mp3 with libmp3lame. iOS
Safari cannot decode ogg through `decodeAudioData`, so an ogg ships silent on
iPhone behind GGKit's error handling. No `.ogg` file exists in this title and
no `.ogg` path is referenced.

---

## Images (23 files)

All drawn from primitives with Pillow at 4x supersample and downfiltered, so
every frame is original vector-style pixel art with no traced or photographic
source.

| File | Bytes | sha256:12 | Source | License |
|---|---|---|---|---|
| `assets/atlas.png` | 127911 | `2d6cc70162de` | Original. `build_atlas()` - 38 frames: turret idle/charge/empty/dead, barrel, 3 muzzle-flash stages, 3 district faces x intact/damaged/ruined, plinth, warning beam, chevron, shield dome, shield highlight, 6 upgrade icons, 7 threat silhouettes, the Obelisk, crosshair, shock ring | CC0 |
| `assets/atlas.json` | 6220 | `75f9cb0d5777` | Original. Phaser JSON-hash frame map emitted by `build_atlas()` | CC0 |
| `assets/digits.png` | 8670 | `2e2af8a4b12d` | Original. `build_digits()` - bundled arcade display numerals, glyphs `0-9 + - . / x` | CC0 |
| `assets/digits.json` | 2402 | `f8b9f6d88ce4` | Original. Phaser JSON-hash glyph map emitted by `build_digits()` | CC0 |
| `assets/logo.png` | 40169 | `47faf6fadd90` | Original. `build_logo()` - the bespoke SKYFALL COMMAND lockup used on the title screen | CC0 |
| `assets/stars.png` | 3244 | `9a762a5be640` | Original. `build_stars()` - tileable star field | CC0 |
| `assets/neb.png` | 22106 | `d86c3fd242d9` | Original. `build_neb()` - soft nebula wash for the upper sky | CC0 |
| `assets/clouds.png` | 24993 | `8f6d87340e24` | Original. `build_clouds()` - tileable ion haze, the slow parallax depth layer | CC0 |
| `assets/aurora.png` | 41346 | `7030c27964f9` | Original. `build_aurora()` - storm curtain, night twelve only | CC0 |
| `assets/city_far.png` | 6774 | `07e17b321848` | Original. `build_skyline()` seed `0xFA4` - farthest tileable skyline strip | CC0 |
| `assets/city_mid.png` | 12792 | `40dfb503a51d` | Original. `build_skyline()` seed `0x11D` - mid parallax skyline strip | CC0 |
| `assets/city_near.png` | 13742 | `5dc4e4dbcd08` | Original. `build_skyline()` seed `0xEA2` - near parallax skyline strip | CC0 |
| `assets/ground.png` | 10739 | `c157ee796532` | Original. `build_ground()` - the authored rooftop foreground the districts stand behind, lit from the city below | CC0 |
| `assets/disc.png` | 3750 | `e3ec9406a0b4` | Original. `p_disc()` - radial falloff used for every glow, plinth shadow, vignette and horizon pool | CC0 |
| `assets/p_spark.png` | 1851 | `c933ec1cdb77` | Original. `p_spark()` - directional airburst shrapnel needle | CC0 |
| `assets/p_flare.png` | 1332 | `52f83faaf11e` | Original. `p_flare()` - interceptor and threat exhaust flame | CC0 |
| `assets/p_ribbon.png` | 393 | `9b6c37a93365` | Original. `p_ribbon()` - tapered contrail segment, drawn velocity-aligned | CC0 |
| `assets/p_fire.png` | 2998 | `5bb4753f4529` | Original. `p_fire()` - airburst core flash and fireball body | CC0 |
| `assets/p_smoke.png` | 3466 | `f9d801afa0ae` | Original. `p_smoke()` - explosion smoke puff, the one non-additive particle | CC0 |
| `assets/p_ember.png` | 515 | `2ed52b907799` | Original. `p_ember()` - ambient ash drift, city embers, star twinkle | CC0 |
| `assets/p_shard.png` | 1122 | `93e2885f6f87` | Original. `p_shard()` - angular debris chip, tumbles under gravity | CC0 |
| `icon.png` | 33029 | `0eaf8209b1cd` | Original. `app_icon(192)` - the skyline under an interceptor arc | CC0 |
| `icon512.png` | 90442 | `64fe8a22e826` | Original. `app_icon(512)` - same mark, maskable-safe margins | CC0 |

## Music (2 files)

Two layered stems in the same tempo, key (D minor) and 16-bar length, so
GGKit's crossfade between them is phase-coherent. `music_night` is the patrol
loop; `music_alert` is the intensity layer that takes over when the sky is
dense, a district is burning, or the Obelisk is up.

The two files are the same byte **length** because libmp3lame is encoding at a
constant 96 kbit/s and both stems are the same 23.17 second duration. They are
not the same audio: the sha256 values differ and the alert stem adds its own
percussion, a tension drone and a brighter lead line.

| File | Bytes | sha256:12 | Source | License |
|---|---|---|---|---|
| `assets/music_night.mp3` | 278092 | `1f3ef01e5a4a` | Original. `build_audio.py:render_music(False)` - 23.17 s seamless loop, mono 96 kbit/s | CC0 |
| `assets/music_alert.mp3` | 278092 | `968778acaf20` | Original. `build_audio.py:render_music(True)` - same loop, intensity layer | CC0 |

## Sound effects (17 files)

All synthesised by `build_audio.py`, mono 112 kbit/s, deterministic (the noise
source is seeded per cue, so a rebuild is byte-stable). Each cue is a distinct
sound, not a pitch-shift of another; all seventeen sha256 values differ.

| File | Bytes | sha256:12 | Cue | Generator | License |
|---|---|---|---|---|---|
| `assets/sfx_launch.mp3` | 6627 | `ae3e46c82711` | interceptor away | `cue_launch()` - short rising thrust chirp | CC0 |
| `assets/sfx_airburst.mp3` | 12844 | `37ea35694524` | airburst detonation | `cue_airburst()` - noise burst with a body thump | CC0 |
| `assets/sfx_splinter.mp3` | 8090 | `351d15f7a6f5` | hydra splits | `cue_splinter()` - crackling multi-tap shatter | CC0 |
| `assets/sfx_impact.mp3` | 16501 | `87495d730883` | warhead reaches the ground | `cue_impact()` - low impact with a debris tail | CC0 |
| `assets/sfx_district.mp3` | 21987 | `3719f87758ee` | district destroyed | `cue_district()` - collapse rumble into a mournful fall | CC0 |
| `assets/sfx_dry.mp3` | 2604 | `5c4201bd94b4` | battery empty | `cue_dry()` - dry mechanical click | CC0 |
| `assets/sfx_reload.mp3` | 10650 | `5014ea8fc727` | batteries reloaded | `cue_reload()` - two-stage rack and confirm | CC0 |
| `assets/sfx_siren.mp3` | 19061 | `9915cda0973b` | night or boss begins | `cue_siren()` - descending city alert | CC0 |
| `assets/sfx_clear.mp3` | 20524 | `d1d3e6db4bf5` | night held | `cue_clear()` - rising resolve chord | CC0 |
| `assets/sfx_defeat.mp3` | 24913 | `b5e92998254b` | command lost | `cue_defeat()` - detuned fall into a sub drop | CC0 |
| `assets/sfx_buy.mp3` | 6993 | `0a6e93017a11` | upgrade installed | `cue_buy()` - two-note confirm | CC0 |
| `assets/sfx_ui.mp3` | 2238 | `3f73a02acb03` | UI tap | `cue_ui()` - tiny tick | CC0 |
| `assets/sfx_shield.mp3` | 11015 | `d5d8e72a94f2` | district shield holds | `cue_shield()` - shimmering absorb | CC0 |
| `assets/sfx_wraith.mp3` | 6993 | `a1262d4c61c0` | wraith dodges a blast | `cue_wraith()` - breathy pitch-bent swoop | CC0 |
| `assets/sfx_cruiser.mp3` | 15770 | `a52fdef18d20` | cruiser enters, ports open | `cue_cruiser()` - heavy low drone swell | CC0 |
| `assets/sfx_armor.mp3` | 6993 | `cf2053059971` | armour soaks a hit | `cue_armor()` - metallic clang | CC0 |
| `assets/sfx_pod.mp3` | 5895 | `a095a7029cf1` | supply pod collected | `cue_pod()` - bright ascending blip | CC0 |

Three cues (`sfx_buy`, `sfx_wraith`, `sfx_armor`) share a byte length of 6993
only because they share a duration at a constant bitrate. Their sha256 values
and their waveforms are different; each is generated by its own function.

## Code and fonts

| File | Source | License |
|---|---|---|
| `game.js` | Original, written for this title | GreenGuard USA, all rights reserved |
| `index.html`, `manifest.json`, `sw.js` | Original; `sw.js` derived from the studio `/play/_shared/sw-template.js` | GreenGuard USA |
| `NOTES.md`, `LICENSES.md` | Original documentation for this title | GreenGuard USA |
| `/play/_shared/phaser.min.js` | Phaser 3 (Photon Storm) - vendored in `_shared`, not in this game directory | MIT, see `/play/_shared/LICENSES.md` |
| `/play/_shared/ggkit.js` | Original studio kit - vendored in `_shared` | GreenGuard USA |
| Typeface | Verdana / Geneva / `system-ui` system stack for prose, plus the original bundled `digits.png` numeral face for every HUD number. No third-party font file ships | n/a |

## Original IP note

Every name, silhouette and mechanic in this title is original. The threat
families (shard, streak, hydra, wraith, swarm, cruiser, supply pod), the six
districts, the three batteries, the six upgrade tracks and the Obelisk finale
were designed for Skyfall Command. Nothing is drawn from, named after, or
modelled on an existing product.
