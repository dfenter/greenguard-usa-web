# Slingfang - asset licenses

Rev 1, 2026-08-10 (AAA rebuild). Traces every file shipped under
`/play/slingfang/` to its source, as required by `/play/_assets/LEDGER.md`.

**Summary: every image and every audio file is original work; the two
typefaces are third-party CC0.** All images and all audio were authored for
Slingfang by GreenGuard USA and released under **CC0 1.0 Universal (public
domain dedication)**. The two shipped `woff2` faces are ASCII subsets of
**Kenney Future** and **Kenney Future Narrow**, taken from the harvested
**Kenney ui-pack** and also CC0. Nothing here is CC-BY, so no attribution is
owed and none appears in the in-game credits beyond authorship.

Ledger cross-reference (`/play/_assets/LEDGER.md`):

| Ledger row | What this game takes from it |
|---|---|
| `Kenney ui-pack` (`web2d/ui-pack`, CC0) | `Font/Kenney Future.ttf` and `Font/Kenney Future Narrow.ttf`, subset to `assets/sf_display.woff2` and `assets/sf_body.woff2`. No sprite, panel or sound from this pack ships. |

No other ledger row is used. In particular the `Kenney impact-sounds`,
`interface-sounds` and `music (mixed harvest)` rows are deliberately **not**
used: every cue and both music stems are synthesised for this title so the mix
sits in one key and one register. Every remaining file is original and needs
no ledger row, only the file-level rows below.

Nothing is hotlinked from another title's directory. Everything the game loads
lives under `/play/slingfang/` except the vendored engine and studio kit in
`/play/_shared/`.

Everything is reproducible. The generator scripts live outside the game
directory (dev tooling must not ship) at:

    /Users/lucille/ue-port-studio/aaa/harness/sf_tools/

| Script | Produces |
|---|---|
| `build_atlas.py` | `assets/atlas.png`, `assets/atlas.json`, `assets/ground.png`, `assets/disc.png`, `assets/edge.png`, `icon.png`, `icon512.png`, `favicon.png` |
| `build_sfx.py` | all twelve `assets/sfx_*.mp3` cues |
| `build_music.py` | `assets/music_field.mp3`, `assets/music_rush.mp3` |

Only Pillow (images), the Python standard library (audio synthesis),
fontTools (the two font subsets) and ffmpeg/libmp3lame (mp3 encode) are used.
No samples, no sample libraries, no model-generated audio, no network fetches.

---

## Images (8 files)

| File | Bytes | sha256:12 | Source | License |
|---|---|---|---|---|
| `assets/atlas.png` | 91758 | `d64a579bb137` | Original. `build_atlas.py` frame layout: 6 creatures x 3 states (idle/launch/impact), 6 roster orbs, 6 ally posts, 4 enemy family bodies, 2 phase-barrier states, the fang anchor, 3 medal tiers, 6 HUD marks, 5 particle textures. PNG8+alpha (FASTOCTREE) to stay inside the per-file budget | CC0 |
| `assets/atlas.json` | 9831 | `ac828ce88089` | Original. Phaser JSON-hash frame map emitted by the same pipeline | CC0 |
| `assets/ground.png` | 1495 | `dcc1de3b718f` | Original. `build_atlas.py:ground_tile()` - seamless 128px arena floor weave, stamped once into the baked board texture | CC0 |
| `assets/disc.png` | 3664 | `d9468d8747d3` | Original. `build_atlas.py:soft_disc()` - radial falloff behind every glow, wash and vignette | CC0 |
| `assets/edge.png` | 124 | `50209942d79a` | Original. `build_atlas.py:edge_strip()` - one-dimensional falloff strip | CC0 |
| `icon.png` | 14416 | `8b85c77311fd` | Original. `build_atlas.py:app_icon(192)` - the fang inside a drawn-back arc | CC0 |
| `icon512.png` | 37413 | `192f43376a43` | Original. `build_atlas.py:app_icon(512)` - same mark, maskable-safe | CC0 |
| `favicon.png` | 1753 | `a36f91f43edf` | Original. `build_atlas.py:app_icon(32)` | CC0 |

## Music (2 files)

Two layered stems on a shared tempo (118 BPM), key (D minor) and bar length
(16), so GGKit's crossfade between them is phase-coherent. `music_field` is
the campaign loop; `music_rush` is the intensity layer for Formation Rush.

The two files are the same byte **length** because libmp3lame is encoding at a
constant 80 kbit/s and both stems are the same duration. They are not the same
audio: the SHA differs, and the rush stem adds snare, an offbeat hat, a
swelling tension drone, a brighter pluck duty cycle and a harder kick.

| File | Bytes | sha256:12 | Source | License |
|---|---|---|---|---|
| `assets/music_field.mp3` | 325008 | `440ec2bc6d6e` | Original. `build_music.py:render(intense=False)` - 32 s seamless loop, mono 80 kbit/s | CC0 |
| `assets/music_rush.mp3` | 325008 | `07463f9a3c99` | Original. `build_music.py:render(intense=True)` - same loop, intensity layer | CC0 |

## Sound effects (12 files)

All synthesised by `build_sfx.py`, mono 112 kbit/s, deterministic (the noise
source is seeded per cue, so a rebuild is byte-stable). Each cue is a distinct
sound, not a pitch-shift of another. mp3 only: iOS Safari `decodeAudioData`
cannot decode ogg, so an ogg cue ships silent on iPhone.

| File | Bytes | sha256:12 | Cue | Generator | License |
|---|---|---|---|---|---|
| `assets/sfx_pull.mp3` | 7358 | `e183541612ac` | slingshot tension creak | `cue_pull()` - climbing detuned partials plus rope grain | CC0 |
| `assets/sfx_launch.mp3` | 6627 | `b7c1c6c4c157` | release whoosh | `cue_launch()` - bandpassed noise over a low thump | CC0 |
| `assets/sfx_bank.mp3` | 5164 | `0a0ba03853c8` | wall ricochet | `cue_bank()` - bright inharmonic ping, no pitch drop | CC0 |
| `assets/sfx_impact.mp3` | 4433 | `af282d7aaf30` | contact / combo chime | `cue_impact()` - dry thump plus a D5 partial; the game climbs `playbackRate` up the combo ladder | CC0 |
| `assets/sfx_break.mp3` | 6627 | `da21b3973995` | an enemy comes apart | `cue_break()` - noise burst with a pitch drop | CC0 |
| `assets/sfx_brood.mp3` | 21987 | `bface174263b` | the Slingfang Master breaks | `cue_brood()` - sub rumble under a falling noise sweep | CC0 |
| `assets/sfx_aura.mp3` | 10650 | `613a05cdff3a` | ally bump aura | `cue_aura()` - fifth stack blooming upward | CC0 |
| `assets/sfx_drop.mp3` | 4067 | `aa6d1b648db9` | bonus shot / vitality drop | `cue_drop()` - two rising partials | CC0 |
| `assets/sfx_medal.mp3` | 15770 | `6d3947e61a2e` | medal ceremony | `cue_medal()` - D minor triad into the octave | CC0 |
| `assets/sfx_unlock.mp3` | 14307 | `26e4a6da78dd` | creature unlock | `cue_unlock()` - shimmering rising chime | CC0 |
| `assets/sfx_tap.mp3` | 2238 | `b94cf78aee68` | UI tick / blocked hit | `cue_tap()` - tiny tick | CC0 |
| `assets/sfx_fail.mp3` | 13575 | `286a5d06c8a7` | vitality empties | `cue_fail()` - descending saw losing its charge | CC0 |

## Fonts (2 files)

Two font files **do** ship. They are the only third-party assets in the game.
Both are ASCII subsets of CC0 Kenney faces from the harvested `Kenney ui-pack`
(ledger row `Kenney ui-pack`, archive `web2d/ui-pack`, evidence
`kenney.nl/assets/ui-pack`). Kenney releases the pack, fonts included, under
CC0 1.0, so no attribution is owed; it is recorded here for traceability.

| File | Bytes | sha256:12 | Upstream file | Role | License |
|---|---|---|---|---|---|
| `assets/sf_display.woff2` | 1388 | `adaa364337f4` | `web2d/ui-pack/Font/Kenney Future.ttf` | `SF Display` - titles, numerals, HUD, anything read under pressure | CC0 |
| `assets/sf_body.woff2` | 1376 | `b3f85ae9fd6e` | `web2d/ui-pack/Font/Kenney Future Narrow.ttf` | `SF Body` - the coach strip, banner subtitles, helper copy | CC0 |

Reproducible from the archive with `fontTools` (no other tool involved):

    python3 -m fontTools.subset \
      "<archive>/web2d/ui-pack/Font/Kenney Future.ttf" \
      --unicodes="U+0020-007E,U+00B7,U+00D7" \
      --flavor=woff2 --no-hinting --desubroutinize \
      --output-file=assets/sf_display.woff2

and the same command against `Kenney Future Narrow.ttf` for `sf_body.woff2`.
The subset is printable ASCII plus the middle dot the HUD uses as a separator
and the multiplication sign the combo chip uses.

## Code

| File | Source | License |
|---|---|---|
| `game.js`, `sf_data.js` | Original, written for this title | GreenGuard USA, all rights reserved |
| `index.html`, `manifest.json`, `sw.js` | Original; `sw.js` from the studio `sw-template.js` | GreenGuard USA |
| `/play/_shared/phaser.min.js` | Phaser 3.87 (Photon Storm) - vendored in `_shared`, not in this game directory | MIT, see `/play/_shared/LICENSES.md` |
| `/play/_shared/ggkit.js` | Original studio kit - vendored in `_shared` | GreenGuard USA |
