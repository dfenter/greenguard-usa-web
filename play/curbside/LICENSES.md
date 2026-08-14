# Curbside - asset licenses

Rev 1, 2026-08-10. Traces every file shipped under `/play/curbside/` to its
source, as required by `/play/_assets/LEDGER.md`.

**Summary: no third-party asset ships in this game.** Every image and every
audio file is original work authored for Curbside by GreenGuard USA and
released under **CC0 1.0 Universal (public domain dedication)**. Nothing is
harvested, sampled or derived from an outside pack, so no CC-BY attribution
is owed and no third-party credit appears in game.

**No ledger pack row is consumed by this title.** `/play/_assets/` currently
holds only the art bibles and the ledger itself - it contains no asset files
to copy - so Curbside took the other route the brief allows and generated
every asset procedurally. In particular the `music (mixed harvest)` row is
deliberately **not** used: all three music beds are synthesised. The "Used
by" column in `/play/_assets/LEDGER.md` therefore stays unchanged for every
pack, and this title hotlinks nothing from any other game's directory.

Everything is reproducible. The generator scripts live OUTSIDE the game
directory, because dev tooling must not ship:

    /Users/lucille/ue-port-studio/aaa/harness/cb_tools/

| Script | Produces |
|---|---|
| `build_art.py` | `assets/atlas.png` + `atlas.json`, `ground.png`, `logo.png`, the ten `bg_*` parallax strips, the six `p_*` particle textures, and `icon.png` / `icon512.png` / `favicon.png` |
| `build_audio.py` | `assets/music_street.mp3`, `music_night.mp3`, `music_menu.mp3` and all nineteen `assets/sfx_*.mp3` cues |

Only Pillow (images), the Python standard library (audio synthesis) and
ffmpeg/libmp3lame (mp3 encode) are used. No samples, no sample libraries, no
model-generated audio, no network fetches, and nothing is fetched at runtime.

**Audio format law.** Everything is encoded as mono mp3 with libmp3lame. iOS
Safari cannot decode ogg through `decodeAudioData`, so an ogg would ship
silent on iPhone behind GGKit's error handling. No `.ogg` file exists in this
title and no `.ogg` path is referenced.

**Engine and kit.** `/play/_shared/phaser.min.js` and
`/play/_shared/ggkit.js` are loaded from the shared directory and are covered
by `/play/_shared/LICENSES.md`. They are not redistributed inside this
title's directory.

---

## Images (23 files)

All drawn from primitives with Pillow at 3x supersample and downfiltered, so
every frame is original vector-style art with no traced or photographic
source. The skater is an authored silhouette rig: eight hand-placed joint
tables, drawn as capsule limbs with a single neon rim light down the leading
edge, and a separate deck sprite in five liveries.

| File | Bytes | sha256:12 | Source | License |
|---|---|---|---|---|
| `assets/atlas.json` | 9783 | `22b3fe778d3e` | Original. Phaser JSON-hash frame map emitted by build_atlas() | CC0 |
| `assets/atlas.png` | 98254 | `324d995c24ac` | Original. build_atlas() - 49 frames: eight authored skater poses, five board liveries, four ragdoll parts, thirteen street props, four traffic bodies, four pickup icons, seven UI marks, four crowd silhouettes | CC0 |
| `assets/bg_boardwalk_far.png` | 24009 | `91cec4262ab1` | Original. build_backgrounds() -> skyline() - tileable parallax skyline strip, seam cross-faded so it repeats without a join (boardwalk, far) | CC0 |
| `assets/bg_boardwalk_near.png` | 23380 | `6f411b342106` | Original. build_backgrounds() -> skyline() - tileable parallax skyline strip, seam cross-faded so it repeats without a join (boardwalk, near) | CC0 |
| `assets/bg_downtown_far.png` | 21687 | `862731dc4a1b` | Original. build_backgrounds() -> skyline() - tileable parallax skyline strip, seam cross-faded so it repeats without a join (downtown, far) | CC0 |
| `assets/bg_downtown_near.png` | 18857 | `43c1ab04e683` | Original. build_backgrounds() -> skyline() - tileable parallax skyline strip, seam cross-faded so it repeats without a join (downtown, near) | CC0 |
| `assets/bg_mile_far.png` | 22495 | `e398a805f983` | Original. build_backgrounds() -> skyline() - tileable parallax skyline strip, seam cross-faded so it repeats without a join (mile, far) | CC0 |
| `assets/bg_mile_near.png` | 26285 | `f0c0479cc8de` | Original. build_backgrounds() -> skyline() - tileable parallax skyline strip, seam cross-faded so it repeats without a join (mile, near) | CC0 |
| `assets/bg_plaza_far.png` | 22594 | `eef158c61ca3` | Original. build_backgrounds() -> skyline() - tileable parallax skyline strip, seam cross-faded so it repeats without a join (plaza, far) | CC0 |
| `assets/bg_plaza_near.png` | 23583 | `7c94ed75c4da` | Original. build_backgrounds() -> skyline() - tileable parallax skyline strip, seam cross-faded so it repeats without a join (plaza, near) | CC0 |
| `assets/bg_railyard_far.png` | 23162 | `4c42a263808a` | Original. build_backgrounds() -> skyline() - tileable parallax skyline strip, seam cross-faded so it repeats without a join (railyard, far) | CC0 |
| `assets/bg_railyard_near.png` | 25624 | `d0a6b30d5d28` | Original. build_backgrounds() -> skyline() - tileable parallax skyline strip, seam cross-faded so it repeats without a join (railyard, near) | CC0 |
| `assets/ground.png` | 39075 | `6bc8895f5441` | Original. build_ground() - seamless light-neutral asphalt grit, tinted per district at runtime | CC0 |
| `assets/logo.png` | 40149 | `64285fa643af` | Original. build_logo() - the bespoke CURBSIDE stroke lockup on the street map | CC0 |
| `assets/p_chalk.png` | 451 | `cd7893b7d69f` | Original. p_chalk - chalk grain thrown off a grind | CC0 |
| `assets/p_dust.png` | 1471 | `20b61b250cce` | Original. p_dust - soft wheel and landing dust puff | CC0 |
| `assets/p_glow.png` | 2434 | `99f1dee76877` | Original. p_glow - radial glow for pickups and banks | CC0 |
| `assets/p_ring.png` | 3798 | `bc1fe3ac62ff` | Original. p_ring - expanding shock ring for gap clears | CC0 |
| `assets/p_smoke.png` | 1902 | `5f9823d75457` | Original. p_smoke - bail smoke billow | CC0 |
| `assets/p_spark.png` | 602 | `b3d86590f2c0` | Original. p_spark - directional metal spark needle | CC0 |
| `assets/icon.png` | 7083 | `53fe8d913e75` | Original. build_icons() - the deck-over-kerb app mark at 192, 512 and 64 | CC0 |
| `assets/icon512.png` | 25222 | `104d74b6306d` | Original. build_icons() - the deck-over-kerb app mark at 192, 512 and 64 | CC0 |
| `assets/favicon.png` | 2429 | `00098d17e8c6` | Original. build_icons() - the deck-over-kerb app mark at 192, 512 and 64 | CC0 |

## Audio (22 files)

All synthesised sample by sample in Python: oscillators, filtered noise,
one-pole and biquad filters, ADSR envelopes and a small step sequencer.

| File | Bytes | sha256:12 | Source | License |
|---|---|---|---|---|
| `assets/music_menu.mp3` | 68301 | `e343c519cb0c` | Original. build_bed() 108 BPM - the street map bed, sparsest of the three | CC0 |
| `assets/music_night.mp3` | 121005 | `9c60171507f2` | Original. build_bed() 124 BPM - the night bed for Boardwalk and The Mile, same stack with a darker filter and a triangle lead | CC0 |
| `assets/music_street.mp3` | 100845 | `38b8bec47d04` | Original. build_bed() 148 BPM - the daylight street bed; kick, snare, hats, acid bass, pad, square lead AND the traffic-hum ambience layer | CC0 |
| `assets/sfx_bail.mp3` | 8397 | `28e423ce41ac` | Original. sfx_bail() - crash, body drop and six tumble impacts | CC0 |
| `assets/sfx_bank.mp3` | 6381 | `9de013a68009` | Original. sfx_bank() - five-note combo bank fanfare | CC0 |
| `assets/sfx_boost.mp3` | 5229 | `cb2eb9bc7fbe` | Original. sfx_boost() - speed boost rush | CC0 |
| `assets/sfx_combo.mp3` | 2925 | `22711244ae8e` | Original. sfx_combo() - combo step chip | CC0 |
| `assets/sfx_district.mp3` | 8397 | `c1a1046d1e4e` | Original. sfx_district() - district drop-in sting | CC0 |
| `assets/sfx_fail.mp3` | 8397 | `6fb4598f2b80` | Original. sfx_fail() - run-over descending figure | CC0 |
| `assets/sfx_gap.mp3` | 6381 | `c46a085a1354` | Original. sfx_gap() - gap clear swell | CC0 |
| `assets/sfx_grind.mp3` | 2637 | `2e7bb6d5a609` | Original. sfx_grind() - one metal scrape grain, granulated during a grind | CC0 |
| `assets/sfx_horn.mp3` | 5229 | `23e9270c5bcd` | Original. sfx_horn() - traffic horn, two detuned saws through a lowpass | CC0 |
| `assets/sfx_land_clean.mp3` | 3501 | `5a3e4188ae08` | Original. sfx_land(True) - level touchdown | CC0 |
| `assets/sfx_land_sketchy.mp3` | 4077 | `4e74dec08706` | Original. sfx_land(False) - off-angle touchdown with wheel chatter | CC0 |
| `assets/sfx_medal.mp3` | 8685 | `49f6fb0d735e` | Original. sfx_medal() - medal award fanfare | CC0 |
| `assets/sfx_pickup.mp3` | 3501 | `933a306c1b72` | Original. sfx_pickup() - three-note pickup arpeggio | CC0 |
| `assets/sfx_pop.mp3` | 3213 | `1705e4031a27` | Original. sfx_pop() - tail snap: woody crack plus deck thump | CC0 |
| `assets/sfx_prompt.mp3` | 2637 | `afb1a8260a71` | Original. sfx_prompt() - bonus-trick call | CC0 |
| `assets/sfx_roll.mp3` | 2637 | `6b0d16e53685` | Original. sfx_roll() - one wheel-roll grain; the sim fires these back to back at a rate and pitch tied to board speed | CC0 |
| `assets/sfx_trick.mp3` | 2925 | `6246a03f53d5` | Original. sfx_trick() - air rotation whoosh | CC0 |
| `assets/sfx_ui.mp3` | 1773 | `536ff47cdac6` | Original. sfx_ui() - menu tick | CC0 |
| `assets/sfx_wobble.mp3` | 2061 | `47903e7da415` | Original. sfx_wobble() - balance warning tick while the wobble meter is in the red | CC0 |

---

## Totals

| Bucket | Bytes |
|---|---|
| Images | 464329 |
| Audio | 379134 |
| Code + markup (`index.html`, `game.js`, `cb_data.js`, `cb_world.js`, `sw.js`, `manifest.json`) | 164028 |
| **Shipped total** | **1007491** |

Budget is 2.5 MB total and 400 KB per file. The largest single file is
`assets/music_night.mp3`.

## Original IP

"Curbside", the district names (Downtown, Rail Yard, Plaza, Boardwalk, The
Curbside Mile), the gap names, the trick names (Gutter Whip, Backspin Curl,
Skylatch Grab, Drop Shove, Double Whip, Curbside Spin, Boneless Reach, Dark
Shove) and the deck liveries are original to this title. No real skater,
brand, team, venue or existing skateboarding game is referenced, depicted or
named.
