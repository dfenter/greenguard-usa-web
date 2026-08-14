# Stacklock - asset licenses

Rev 1, 2026-08-10. Traces every file shipped under `/play/stacklock/` to its
source, as required by `/play/_assets/LEDGER.md`.

**Summary: no third-party asset ships in this game.** Every image and every
audio file is original work authored for Stacklock by GreenGuard USA and
released under **CC0 1.0 Universal (public domain dedication)**. Nothing is
harvested, sampled, traced, or model-generated, so no CC-BY attribution is
owed and no third-party credit appears in game.

**No ledger pack row is consumed by this title.** The Kenney CC0 rows and the
`music (mixed harvest)` row in `/play/_assets/LEDGER.md` are deliberately
**not** used: the piece families needed a bespoke glyph set that survives
grayscale at 390px, and the two music stems needed to be tempo, key and bar
matched to each other for GGKit's crossfade. Both were therefore synthesised.
The "Used by" column in the ledger stays unchanged for every pack. Nothing is
hotlinked from another title's directory, and nothing is fetched at runtime.

The lane bible that governs the look is `/play/_assets/ART_puzzlepop.md`
(Stacklock row: graphite, indigo, hot amber line-clear accents).

## Reproducibility

Everything is generated. The two generator scripts are dev tooling and do NOT
ship inside the game directory; they were authored and run from this session's
scratchpad at:

    <scratchpad>/sl_tools/build_art.py
    <scratchpad>/sl_tools/build_audio.py

Both are self-contained and depend only on Pillow (images), the Python
standard library (audio synthesis) and ffmpeg/libmp3lame (mp3 encode). Their
full method is documented below so the set can be rebuilt from the
description alone if the scratchpad is reaped.

**Audio format law.** Everything is encoded mono mp3 with libmp3lame. iOS
Safari cannot decode ogg through `decodeAudioData`, so an ogg would ship
silent on iPhone behind GGKit's error handling. No `.ogg` file exists in this
title and no `.ogg` path is referenced anywhere in the code.

---

## Images (11 files)

Drawn from primitives with Pillow at 4x supersample and downfiltered with
LANCZOS, so every frame is original vector-style art with no traced or
photographic source.

| File | Source | License |
|---|---|---|
| `assets/atlas.png` + `assets/atlas.json` | Original. `build_atlas()` - 18 frames at 128px: the seven piece-family tiles (`blk_bar/box/tee/jay/ell/ess/zed`), the three special tiles (`blk_hazard`, `blk_wild`, `blk_bomb`) on a chamfered silhouette, the clear-flash plate `blk_lit`, the landing ghost `blk_ghost`, the empty-cell plate `blk_shell`, four medals (`medal_bronze/silver/gold/master`) and the hold `lockout` ring. Phaser JSON-hash frame map emitted alongside | CC0 |
| `assets/disc.png` | Original. `p_disc()` - radial falloff, used for the board glow | CC0 |
| `assets/p_shard.png` | Original. `p_shard()` - angular fragment, the line-clear shatter particle | CC0 |
| `assets/p_spark.png` | Original. `p_spark()` - directional needle, lock and movement streaks | CC0 |
| `assets/p_ember.png` | Original. `p_ember()` - soft dot, the reward celebration particle | CC0 |
| `assets/p_ring.png` | Original. `p_ring()` - expanding ring for quad clears and mode goals | CC0 |
| `assets/p_beam.png` | Original. `p_beam()` - soft vertical wedge, the row sweep beam | CC0 |
| `assets/logo.png` | Original. `build_logo()` - the Stacklock lockup, drawn as stacked blocks so the mark is the mechanic | CC0 |
| `icon.png` | Original. `app_icon(192)` - a locked stack with one amber clearing row | CC0 |
| `icon512.png` | Original. `app_icon(512)` - same mark, maskable-safe margins | CC0 |
| `favicon.png` | Original. `app_icon(64)` - same mark at tab size | CC0 |

**Triple-coding.** Per the lane bible no family is distinguished by hue alone.
Each tile carries (1) a silhouette treatment - ordinary families are rounded,
the three special tiles are chamfered and broader, (2) a face hue AND a
distinct luminance value, and (3) a large centred glyph baked into the frame:
three bars (PULSE), a four-point sun (NOVA), a six-point star (WISP), a square
flame (FLARE), a double chevron (ANCHOR), a leaf (MINT) and an open ring
(FANG). Hazard tiles add amber diagonal stripes; the wildcard adds a five-dot
cluster; the bomb adds a fuse silhouette. Every glyph survives grayscale.

## Audio (21 files)

Additive and subtractive synthesis over the Python standard library. Voices
are a glass/marimba mallet (fundamental plus one inharmonic partial), a wood
tick, a pitched-down thud, a swept one-pole-filtered noise burst and a
frequency sweep. All cues sit in the same A-minor field.

| File | Source | License |
|---|---|---|
| `assets/music_board.mp3` | Original. `render_music(False)` - the calm stacking loop. 96 BPM, A minor, 8 bars, i-VI-III-VII. Bass pulse, sustained pad, glass arpeggio. Decay past the loop point is folded back to the head so the loop is seamless | CC0 |
| `assets/music_rush.mp3` | Original. `render_music(True)` - the intensity layer taken over from Marathon level 8 and on the Master Clear board. Same tempo, key and bar length as `music_board`, so GGKit's crossfade is phase-coherent. Adds a driving lead, a hat grid and a kick | CC0 |
| `assets/sfx_move.mp3` | Original. Dry wood tick, piece shift | CC0 |
| `assets/sfx_rotate.mp3` | Original. Higher wood tick plus a mallet blip, rotation | CC0 |
| `assets/sfx_soft.mp3` | Original. Quiet low tick, soft drop | CC0 |
| `assets/sfx_lock.mp3` | Original. Pitched-down thud plus a short noise body, the lock | CC0 |
| `assets/sfx_hard.mp3` | Original. Harder thud with air, the hard drop | CC0 |
| `assets/sfx_clear1.mp3` | Original. Two-note glass chord, single line | CC0 |
| `assets/sfx_clear2.mp3` | Original. Three-note chord a third up, double | CC0 |
| `assets/sfx_clear3.mp3` | Original. Four-note chord a fourth up, triple | CC0 |
| `assets/sfx_quad.mp3` | Original. Six-note chord, thud and rising sweep, the QUAD | CC0 |
| `assets/sfx_combo.mp3` | Original. Five-step rising arpeggio, combo escalation | CC0 |
| `assets/sfx_hold.mp3` | Original. Rising sweep with air, the hold swap | CC0 |
| `assets/sfx_deny.mp3` | Original. Detuned square pair, invalid rotation or a locked hold | CC0 |
| `assets/sfx_level.mp3` | Original. Six-note ascending fanfare, level up | CC0 |
| `assets/sfx_goal.mp3` | Original. The hero fanfare, reserved for mode completion | CC0 |
| `assets/sfx_ui.mp3` | Original. Single mallet blip, menu confirm | CC0 |
| `assets/sfx_bomb.mp3` | Original. Thud, broadband noise and a falling saw sweep, the bomb pickup | CC0 |
| `assets/sfx_pickup.mp3` | Original. Bright rising sweep, a wildcard or bomb entering play | CC0 |
| `assets/sfx_over.mp3` | Original. Four-note descending figure, top out | CC0 |
| `assets/sfx_tick.mp3` | Original. Short high mallet, the Sprint countdown accent | CC0 |

That is 19 distinct SFX cues plus two music states, against the lane bible's
floor of eight cues and two states.

## Code and engine

| File | Source | License |
|---|---|---|
| `index.html`, `game.js`, `sl_data.js`, `sw.js`, `manifest.json` | Original, written for this title | proprietary, GreenGuard USA |
| `/play/_shared/phaser.min.js` | Phaser 3.87, vendored | MIT, covered by `/play/_shared/LICENSES.md` |
| `/play/_shared/ggkit.js` | GreenGuard studio kit | proprietary, covered by `/play/_shared/LICENSES.md` |
| `/play/_shared/sw-template.js` | GreenGuard service-worker template, `sw.js` is authored from it | proprietary |

Fonts: none are shipped. The UI uses the platform system stack
(`system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`) per
the lane bible, so the type system carries no payload and no font licence.

## Original IP statement

Stacklock is a falling-block line-clear game, a mechanic that is not itself
protectable, but nothing in this title imitates any competitor's trade dress.
The seven families carry original names (PULSE, NOVA, WISP, FLARE, ANCHOR,
MINT, FANG), original glyphs and an original palette. The four-line clear is
called a QUAD; no branded block-game term, colour set, logotype, mascot,
jingle or board frame is referenced or approximated. The board frame, medals,
pickups (wildcard and bomb), the Puzzle board set, the Master Clear finale and
every string in the game were authored for this title.
