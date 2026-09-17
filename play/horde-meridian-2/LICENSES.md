# Horde Meridian - asset licenses

Rev 5, 2026-08-07 (Worlds round). Traces every file shipped under
`/play/horde-meridian/` to its source, as required by `/play/_assets/LEDGER.md`.

The Worlds round adds no shipped image, audio, font, or other binary asset.
The five spacescapes are procedural palette/layout work over the existing
atlas, particle textures, and music/SFX inventory; the service worker only
adds its own cache entry for the updated worker.

Arsenal II (2026-08-07) adds no shipped image or audio files. Its ten upgraded
primaries reuse the authored atlas, particle textures, and synthesised MP3
cues already listed below, so the existing file-level provenance remains
complete.

**Summary: every image and audio file is original work; the two typefaces are
third-party CC0.** All images and all audio were authored for Horde Meridian by
GreenGuard USA and released under **CC0 1.0 Universal (public domain
dedication)**. The two shipped `woff2` faces are ASCII subsets of **Kenney
Future** and **Kenney Future Narrow**, taken from the harvested **Kenney
ui-pack** and also CC0. Nothing here is CC-BY, so no attribution is owed and
none appears in the in-game credits beyond authorship.

Ledger cross-reference (`/play/_assets/LEDGER.md`):

| Ledger row | What this game takes from it |
|---|---|
| `Kenney ui-pack` (`web2d/ui-pack`, CC0) | `Font/Kenney Future.ttf` and `Font/Kenney Future Narrow.ttf`, subset to `assets/hm_display.woff2` and `assets/hm_body.woff2`. No sprite, panel or sound from this pack ships. |

No other ledger row is used. The row for `music (mixed harvest)` is
deliberately **not** used: the shared music harvest returned nothing usable for
this title, so both music stems were synthesised instead. Every remaining file
is original and therefore needs no ledger row, only the file-level rows below.

Everything is reproducible. The generator scripts live outside the game
directory (dev tooling must not ship) at:

    /Users/lucille/ue-port-studio/aaa/harness/hm_tools/

| Script | Produces |
|---|---|
| `build_atlas.py` | `assets/atlas.png`, `assets/atlas.json`, `assets/ground.png`, `assets/disc.png`, `assets/edge.png` |
| `build_fx_icons.py` | the six `assets/p_*.png` particle textures, `icon.png`, `icon512.png` |
| `build_music.py` | `assets/music_base.mp3`, `assets/music_heat.mp3` |
| `build_sfx.py` | all fifteen `assets/sfx_*.mp3` cues |

Fix round 2 re-authored the player ship, six enemy family bodies, and the
Meridian Core inside the existing atlas slots. Feature round 1b adds one
original subordinate Warden interceptor frame, `wingman`, in the previously
transparent lower atlas band. These silhouettes are original CC0 work for this
title, and the hero frame remains the leader silhouette.

Only Pillow (images), the Python standard library (audio synthesis) and
ffmpeg/libmp3lame (mp3 encode) are used. No samples, no sample libraries, no
model-generated audio, no network fetches.

The two typefaces are not generated. They are subset from the harvested Kenney
ui-pack with `fontTools`, and the command is recorded under Fonts below so the
shipped files are reproducible from the archive.

---

## Images (14 files)

| File | Bytes | sha256:12 | Source | License |
|---|---|---|---|---|
| `assets/atlas.png` | 319054 | `1eeceadbb9af` | Original. `build_atlas.py` frame layout with fix round 2 authored replacements plus the feature round 1b `wingman` interceptor frame in the previously transparent lower atlas band: hero (5 states + marker), subordinate wingman, 6 enemy families, boss, elite aura + crown, 3 gem tiers, 4 projectiles, rings, boundary/zone marks, 5 arena dressing pieces, HUD icons and bars, button and card panels in 4 states, 15 upgrade icons | CC0 |
| `assets/atlas.json` | 10577 | `f9eeac6c4110` | Original. Phaser JSON-hash frame map emitted by the atlas pipeline, including the `wingman` frame | CC0 |
| `assets/ground.png` | 2028 | `c541e5fe7023` | Original. `build_atlas.py:ground_tile()` - seamless 128px deck plating tile | CC0 |
| `assets/disc.png` | 3818 | `df6ce9882e8f` | Original. `build_atlas.py:soft_disc()` - radial falloff used for every glow, vignette and aura | CC0 |
| `assets/edge.png` | 124 | `50209942d79a` | Original. `build_atlas.py:edge_strip()` - one-dimensional falloff strip; the danger frame, the permanent screen vignette, the HUD rules and the elite threat bars are all this file scaled | CC0 |
| `assets/p_spark.png` | 3601 | `a5e64249cf18` | Original. `build_fx_icons.py:p_spark()` - enemy death shrapnel | CC0 |
| `assets/p_flare.png` | 2559 | `2beba8da1493` | Original. `build_fx_icons.py:p_flare()` - thrust trail and parallax motes | CC0 |
| `assets/p_muzzle.png` | 4824 | `68a97b28eaa1` | Original. `build_fx_icons.py:p_muzzle()` - weapon impact burst | CC0 |
| `assets/p_star.png` | 2740 | `cde39eb032ea` | Original. `build_fx_icons.py:p_star()` - gem pickup | CC0 |
| `assets/p_magic.png` | 4478 | `6ae998d40914` | Original. `build_fx_icons.py:p_magic()` - level-up burst | CC0 |
| `assets/p_smoke.png` | 2632 | `ac2581da43b8` | Original. `build_fx_icons.py:p_smoke()` - boss landing and explosions | CC0 |
| `icon.png` | 28940 | `a467c17081ee` | Original. `build_fx_icons.py:app_icon(192)` - the Warden inside the Meridian Core | CC0 |
| `icon512.png` | 83481 | `a61f7fb0e69b` | Original. `build_fx_icons.py:app_icon(512)` - same mark, maskable-safe | CC0 |

## Music (2 files)

Two layered stems on a shared tempo (132 BPM), key (A minor / D dorian) and
16-bar length, so GGKit's crossfade between them is phase-coherent.
`music_base` is the exploration loop; `music_heat` is the intensity layer that
takes over above the danger threshold and during the boss.

The two files are the same byte **length** because libmp3lame is encoding at a
constant 96 kbit/s and both stems are the same duration. They are not the same
audio: the SHA differs, and measured against each other the heat stem differs
by 39% RMS (it adds snare, offbeat hat, a tension drone and a brighter,
octave-up arpeggio, and drives the kick harder).

| File | Bytes | sha256:12 | Source | License |
|---|---|---|---|---|
| `assets/music_base.mp3` | 348623 | `61e38b3ca451` | Original. `build_music.py:render(intense=False)` - 29 s seamless loop, mono 96 kbit/s | CC0 |
| `assets/music_heat.mp3` | 348623 | `a6be0c4b1f3e` | Original. `build_music.py:render(intense=True)` - same loop, intensity layer | CC0 |

## Sound effects (15 files)

All synthesised by `build_sfx.py`, mono 112 kbit/s, deterministic (the noise
source is seeded per cue, so a rebuild is byte-stable). Each cue is a distinct
sound, not a pitch-shift of another.

| File | Bytes | sha256:12 | Cue | Generator | License |
|---|---|---|---|---|---|
| `assets/sfx_shoot.mp3` | 2970 | `b141a0c47e0a` | auto-fire tick | `cue_shoot()` - descending square zap | CC0 |
| `assets/sfx_hit.mp3` | 2604 | `18f0d39935a0` | enemy took damage | `cue_hit()` - dry click plus body tone | CC0 |
| `assets/sfx_death.mp3` | 5895 | `7745109c7395` | enemy dies | `cue_death()` - noise burst with pitch drop | CC0 |
| `assets/sfx_elite_death.mp3` | 9553 | `8d963ce9205d` | elite dies | `cue_elite_death()` - layered, longer tail | CC0 |
| `assets/sfx_boss_death.mp3` | 23450 | `7e3bb24af26a` | the Core breaks | `cue_boss_death()` - sub rumble plus noise sweep | CC0 |
| `assets/sfx_gem.mp3` | 3335 | `fb51ce0d90e5` | gem pickup | `cue_gem()` - rising two-partial blip | CC0 |
| `assets/sfx_levelup.mp3` | 11015 | `7a75d6142a64` | level up | `cue_levelup()` - ascending minor arpeggio | CC0 |
| `assets/sfx_select.mp3` | 5164 | `095f02dfc672` | upgrade taken | `cue_select()` - two-note confirm | CC0 |
| `assets/sfx_click.mp3` | 1873 | `37f9c5f89bbc` | UI tap | `cue_click()` - tiny tick | CC0 |
| `assets/sfx_hurt.mp3` | 7358 | `55fbe95ff72b` | player struck | `cue_hurt()` - descending saw plus noise | CC0 |
| `assets/sfx_wave.mp3` | 12844 | `7cb6d563180d` | new wave | `cue_wave()` - swell into a horn stab | CC0 |
| `assets/sfx_telegraph.mp3` | 13575 | `60512c0a3401` | elite spike / boss inbound | `cue_telegraph()` - rising tension riser | CC0 |
| `assets/sfx_pulse.mp3` | 8090 | `c0a675b7f788` | Nova Pulse | `cue_pulse()` - whoosh into a body thump | CC0 |
| `assets/sfx_unlock.mp3` | 14307 | `95e826150163` | meta unlock / failsafe | `cue_unlock()` - shimmering rising chime | CC0 |
| `assets/sfx_enemy_shoot.mp3` | 3335 | `bc76cac53d33` | enemy projectile | `cue_enemy_shoot()` - dull low blip | CC0 |

## Fonts (2 files)

Two font files **do** ship. They are the only third-party assets in the game.
Both are ASCII subsets of CC0 Kenney faces from the harvested `Kenney ui-pack`
(ledger row `Kenney ui-pack`, archive `web2d/ui-pack`, evidence
`kenney.nl/assets/ui-pack`). Kenney releases the pack, fonts included, under
CC0 1.0, so no attribution is owed; it is recorded here for traceability.

| File | Bytes | sha256:12 | Upstream file | Role | License |
|---|---|---|---|---|---|
| `assets/hm_display.woff2` | 1388 | `8b3e03b34101` | `web2d/ui-pack/Font/Kenney Future.ttf` | `HM Display` - titles, numerals, HUD, buttons, anything read under pressure | CC0 |
| `assets/hm_body.woff2` | 1392 | `968963db8e70` | `web2d/ui-pack/Font/Kenney Future Narrow.ttf` | `HM Body` - prose, card descriptions, helper copy | CC0 |

Reproducible from the archive with `fontTools` (no other tool involved):

    python3 -m fontTools.subset \
      "<archive>/web2d/ui-pack/Font/Kenney Future.ttf" \
      --unicodes="U+0020-007E,U+00B7,U+00D7,U+2014" \
      --flavor=woff2 --no-hinting --desubroutinize \
      --output-file=assets/hm_display.woff2

and the same command against `Kenney Future Narrow.ttf` for `hm_body.woff2`.
The subset is printable ASCII plus the middle dot the UI uses as a separator,
the multiplication sign, and an em dash carried only so the face has no
notdef hole (no user-facing string in this game contains one).

Verified 2026-08-07: each shipped face reports 99 glyphs / 98 mapped
codepoints, the same `unitsPerEm` (1024) as its upstream TTF, and identical
advance widths on all 98 shared codepoints, so the shipped files are subsets of
the archived Kenney faces and not a lookalike.

## Code

| File | Source | License |
|---|---|---|
| `game.js` | Original, written for this title | GreenGuard USA, all rights reserved |
| `index.html`, `manifest.json`, `sw.js` | Original; `sw.js` from the studio `sw-template.js` | GreenGuard USA |
| `/play/_shared/phaser.min.js` | Phaser 3 (Photon Storm) - vendored in `_shared`, not in this game directory | MIT, see `/play/_shared/LICENSES.md` |
| `/play/_shared/ggkit.js` | Original studio kit - vendored in `_shared` | GreenGuard USA |

## Provenance note

The sound effects and the particle and icon PNGs shipped before this revision
had no recorded source and could not be traced to a ledger row. Per the ledger
rule for untraceable assets they were **replaced**, not merely documented: all
fifteen SFX were re-authored by `build_sfx.py` and the six particle textures
and both icons by `build_fx_icons.py`. Two of the old cues
(`sfx_pulse` / `sfx_enemy_shoot`) were also byte-identical duplicates of each
other; the replacements are fifteen distinct sounds.
