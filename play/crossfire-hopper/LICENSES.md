# Crossfire Hopper - asset licenses

Rev 1, 2026-08-10. Traces every file shipped under `/play/crossfire-hopper/`
to its source, as required by `/play/_assets/LEDGER.md`.

**Summary: no third-party asset ships in this game.** Every image and every
audio file is original work authored for Crossfire Hopper by GreenGuard USA and
released under **CC0 1.0 Universal (public domain dedication)**. Nothing is
harvested, sampled, traced, or derived from an outside pack.

**No ledger pack row is consumed by this title.** `/play/_assets/LEDGER.md`
lists the CC0 harvest packs available to the fleet (Kenney impact-sounds,
interface-sounds, digital-audio, sci-fi-sounds, music-jingles, the mixed music
harvest, and the image packs). None of them were used here: the harvest audio
ships as `.ogg`, which this title's format law forbids, and nothing in the
image packs matches the authored lane-band look. Every cue was synthesised and
every sprite was drawn instead, so the "Used by" column in the ledger stays
unchanged for every pack. No CC-BY attribution is owed and no third-party
credit appears in game.

Everything is reproducible. The generator scripts are dev tooling and are
deliberately NOT shipped inside the game directory; they live at:

    /Users/lucille/ue-port-studio/aaa/harness/cfh_tools/

| Script | Produces |
|---|---|
| `build_audio.py` | the fourteen `assets/sfx_*.mp3` cues plus `assets/music_calm.mp3` and `assets/music_storm.mp3` |
| `build_icons.py` | `icon.png`, `icon512.png`, `favicon.png` |

`build_audio.py` uses numpy, the Python standard library and
ffmpeg/libmp3lame. `build_icons.py` uses Pillow at 4x supersample. No samples,
no sample libraries, no model-generated audio, no network fetches, and nothing
is fetched at runtime.

**Audio format law.** Everything is encoded as mono mp3 with libmp3lame. iOS
Safari cannot decode ogg through `decodeAudioData`, so an ogg ships silent on
iPhone behind GGKit's error handling. No `.ogg` file exists in this title and
no `.ogg` path is referenced anywhere in `game.js` or `sw.js`.

**In-game artwork is not a file.** Every lane strip, vehicle, log, lily pad,
train, signal lamp, coin, hopper skin, predator, particle, HUD plate and banner
panel is drawn from primitives into a canvas texture at boot by the bakery in
`game.js` (`bakeAll`). Those textures never touch the disk, so the shipped
image payload is only the three PWA icons below.

---

## Images (3 files)

Drawn from primitives with Pillow at 4x supersample and downfiltered. Original
vector-style art with no traced or photographic source.

| File | Bytes | sha256:12 | Source | License |
|---|---|---|---|---|
| `icon512.png` | 102024 | `5d3d859ba0e9` | Original. `build_icons.py` `draw_icon(512)` - stacked rail / river / road / meadow lane bands with the authored hopper silhouette and a coin | CC0 |
| `icon.png` | 29646 | `2ac1891c9bc2` | Original. Same generator at 192px | CC0 |
| `favicon.png` | 7046 | `65915d5179bd` | Original. Same generator at 64px | CC0 |

## Audio (16 files)

Synthesised sample by sample in `build_audio.py`: additive and subtractive
synthesis over numpy arrays (sines, saws, pulse trains, shaped noise, FFT-domain
filters, attack/decay envelopes), then encoded as mono mp3.

| File | Bytes | sha256:12 | Source | License |
|---|---|---|---|---|
| `assets/sfx_hop.mp3` | 1481 | `75f975c9e50d` | Original. `sfx_hop()` - rising sine glide plus a high-passed transient | CC0 |
| `assets/sfx_land.mp3` | 1167 | `b91e74d0f28c` | Original. `sfx_land()` - falling sine thud plus low-passed grit | CC0 |
| `assets/sfx_coin.mp3` | 2238 | `b23175771891` | Original. `sfx_coin()` - two-note chime with a shimmer partial | CC0 |
| `assets/sfx_splash.mp3` | 4432 | `6d73442c810a` | Original. `sfx_splash()` - high-passed spray, descending gulp, low-passed body | CC0 |
| `assets/sfx_horn.mp3` | 9030 | `8f56dca9df67` | Original. `sfx_horn()` - five detuned saw partials with vibrato and air noise | CC0 |
| `assets/sfx_screech.mp3` | 5477 | `a1217243b9c7` | Original. `sfx_screech()` - descending FM saw plus rasp noise | CC0 |
| `assets/sfx_crash.mp3` | 4067 | `7371a998b7d9` | Original. `sfx_crash()` - sub thump, noise crunch, metal pulse | CC0 |
| `assets/sfx_near.mp3` | 2969 | `ea5ad99cd30d` | Original. `sfx_near()` - swelling filtered-noise whoosh | CC0 |
| `assets/sfx_warn.mp3` | 4981 | `6c9c162712c1` | Original. `sfx_warn()` - struck crossing bell, five partials, two strikes | CC0 |
| `assets/sfx_medal.mp3` | 9030 | `43396c85cf37` | Original. `sfx_medal()` - four-note major arpeggio fanfare | CC0 |
| `assets/sfx_unlock.mp3` | 7358 | `bf6f4b15df08` | Original. `sfx_unlock()` - rising glide plus a sparkle ladder | CC0 |
| `assets/sfx_ui.mp3` | 854 | `2e6c5b9dcf06` | Original. `sfx_ui()` - short pulse click | CC0 |
| `assets/sfx_banner.mp3` | 4615 | `e6a7c1e94d69` | Original. `sfx_banner()` - noise swoosh plus rising tone | CC0 |
| `assets/sfx_fail.mp3` | 7541 | `c98db24334ae` | Original. `sfx_fail()` - descending saw and sub, low-passed | CC0 |
| `assets/music_calm.mp3` | 160540 | `e046605200a8` | Original. `music_calm()` - 96 bpm eight-bar loop, D-centred pentatonic bed, plucks, bass, hats, kick, drifting pad | CC0 |
| `assets/music_storm.mp3` | 153017 | `142230c109d5` | Original. `music_storm()` - 126 bpm ten-bar loop, driving eighth-note bass, minor stabs, sixteenth hats, sub drone | CC0 |

## Code and fonts

| File | Source | License |
|---|---|---|
| `index.html`, `game.js`, `ch_data.js`, `sw.js`, `manifest.json` | Original, written for this title | GreenGuard USA, internal |
| `/play/_shared/phaser.min.js` | Phaser 3.87, vendored | covered by `/play/_shared/LICENSES.md` |
| `/play/_shared/ggkit.js` | GreenGuard studio kit | covered by `/play/_shared/LICENSES.md` |
| `/play/_shared/sw-template.js` | GreenGuard studio kit, `sw.js` is authored from it | covered by `/play/_shared/LICENSES.md` |

No webfont ships. All type is the platform UI stack declared in `index.html`
(`Avenir Next`, `Avenir`, `Segoe UI`, `system-ui`, `-apple-system`,
`sans-serif`), so no font licence applies.

## Original IP

The hopper character, the five lane-band identities (Meadow Mile, Flooded Bend,
Rail Yard, Storm Line, Aurora Run), the six skin names, the set-piece names and
all UI copy are original to this title. No third-party character, trade dress,
level layout or brand is referenced or evoked by name.
