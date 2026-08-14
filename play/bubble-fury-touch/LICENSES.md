# Bubble Fury Touch - asset licenses

Rev 1, 2026-08-10. Traces every file shipped under `/play/bubble-fury-touch/`
to its source, as required by `/play/_assets/LEDGER.md`.

**Summary: no third-party asset ships in this game.** Every image and every
audio file is original work authored for Bubble Fury Touch by GreenGuard USA
and released under **CC0 1.0 Universal (public domain dedication)**. Nothing
is harvested, sampled, traced, or derived from an outside pack, so no CC-BY
attribution is owed and no third-party credit appears in game.

**No `/play/_assets/LEDGER.md` pack row is consumed by this title.** The
ledger lists Kenney `pixel-shmup`, `particle-pack`, `impact-sounds` and the
mixed `music` harvest as candidates for the arcade 2D lane; none of them are
used here, because the twin-stick roster needed six silhouettes that read
apart at phone size and the harvest had no matching set. The "Used by" column
in the ledger therefore stays unchanged for every pack. Nothing is hotlinked
from another title's directory; every path this game requests resolves inside
`/play/bubble-fury-touch/` or `/play/_shared/`.

Everything is reproducible. The generator scripts live OUTSIDE the game
directory (dev tooling must not ship) at:

    /Users/lucille/ue-port-studio/aaa/harness/bf_tools/

| Script | Produces |
|---|---|
| `build_art.py` | `assets/atlas.png` + `atlas.json`, the five arena floor plates, `nightmask.png`, the six particle textures, `logo.png`, `icon.png`, `icon512.png`, `favicon.png` |
| `build_audio.py` | `assets/music_arena.mp3`, `music_boss.mp3`, `amb_arena.mp3` and all twenty four `assets/sfx_*.mp3` cues |

Only Pillow (images), the Python standard library (audio synthesis) and
ffmpeg/libmp3lame (mp3 encode) are used. No samples, no sample libraries, no
model-generated audio, no network fetches, and nothing is fetched at runtime.

**Audio format law.** Everything is encoded as mono mp3 with libmp3lame. iOS
Safari cannot decode ogg through `decodeAudioData`, so an ogg would ship
silent on iPhone behind GGKit's error handling. No `.ogg` file exists in this
title and no `.ogg` path is referenced anywhere in the source or in `sw.js`.

---

## Engine and kit

| Path | Source | License |
|---|---|---|
| `/play/_shared/phaser.min.js` | Phaser 3.87, vendored for the whole `/play` fleet | see `/play/_shared/LICENSES.md` |
| `/play/_shared/ggkit.js` | GreenGuard studio kit, original | see `/play/_shared/LICENSES.md` |

---

## Images (19 files)

All drawn from primitives with Pillow at 4x supersample and downfiltered, so
every frame is original vector-style art with no traced or photographic
source. The floor plates are deterministic: a seeded LCG places every mark,
so a rebuild is byte-stable.

| File | Bytes | sha256:12 | Source | License |
|---|---|---|---|---|
| `assets/atlas.png` | 197889 | `bf3c5591ee44` | Original. `build_atlas()` - 57 frames: player thruster cycle x4 + shield ring, six enemy types x2 animation frames, splitter shard x2, Scuzz idle/charge/enraged, seven pickup shells, five per-weapon muzzle flashes, crate, pillar, barrel, vent, safe-pocket pad, spawn-lane chevron, telegraph ring, warning cone, four bolt shapes, four orb shapes, mortar shell, three medals, lock, stick base and knob | CC0 |
| `assets/atlas.json` | 9288 | `cea6439f6415` | Original. Phaser JSON-hash frame map emitted by `build_atlas()` | CC0 |
| `assets/disc.png` | 1569 | `430e2f266701` | Original. radial falloff used for every glow, lamp pool and menu bubble | CC0 |
| `assets/floor_choke.jpg` | 7440 | `d5492f263e23` | Original. `build_floor()` seed 0x3333 - tileable Chokeworks deck | CC0 |
| `assets/floor_furnace.jpg` | 7308 | `3116958b306c` | Original. `build_floor()` seed 0x5555 - tileable Furnace Deck plate | CC0 |
| `assets/floor_night.jpg` | 7290 | `c162d9419f25` | Original. `build_floor()` seed 0x4444 - tileable Nightfall Yard deck | CC0 |
| `assets/floor_plaza.jpg` | 8618 | `2131e1dea4eb` | Original. `build_floor()` seed 0x1111 - tileable Sunset Plaza deck | CC0 |
| `assets/floor_yard.jpg` | 7956 | `ce8ab5b77925` | Original. `build_floor()` seed 0x2222 - tileable Scrap Yard deck | CC0 |
| `assets/logo.png` | 64453 | `6abafa88fa83` | Original. `build_logo()` - the BUBBLE FURY TOUCH title lockup | CC0 |
| `assets/nightmask.png` | 10931 | `a3e049697646` | Original. `build_nightmask()` - screen-space darkness plate for Nightfall Yard, transparent inside the lamp circle and opaque to its own corners | CC0 |
| `assets/p_ember.png` | 315 | `c1ba2fa2b515` | Original. ember mote for engine trails | CC0 |
| `assets/p_ring.png` | 5431 | `66aff83e6979` | Original. shock ring | CC0 |
| `assets/p_shard.png` | 399 | `c3de6c65bf2e` | Original. angular debris chunk thrown on every kill | CC0 |
| `assets/p_smoke.png` | 951 | `c242820bf668` | Original. soft smoke puff for barrel and boss deaths | CC0 |
| `assets/p_spark.png` | 340 | `1b015055eba4` | Original. directional hit-spark needle | CC0 |
| `assets/p_star.png` | 859 | `96339c1c9496` | Original. four point sparkle for pickups and score pops | CC0 |
| `favicon.png` | 8592 | `5c9e95c06c5d` | Original. `build_icons()` - 64px favicon | CC0 |
| `icon.png` | 51251 | `855db4b1ba33` | Original. `build_icons()` - 192px PWA icon | CC0 |
| `icon512.png` | 161139 | `0080623adfea` | Original. `build_icons()` - 512px maskable PWA icon | CC0 |

---

## Audio (27 files)

Additive and subtractive synthesis over the Python standard library, encoded
mono mp3 at 88 kbps (music), 64 kbps (ambience) and 96 kbps (cues). Every cue
sits in the same A minor field as the loops.

| File | Bytes | sha256:12 | Source | License |
|---|---|---|---|---|
| `assets/amb_arena.mp3` | 116863 | `a6e00533c8a3` | Original. `render_music("amb")` - arena ambience bed, pad and air wash only, no percussion | CC0 |
| `assets/music_arena.mp3` | 146070 | `d6a75ba0d765` | Original. `render_music("arena")` - the run loop, A minor, 132 BPM, 8 bars | CC0 |
| `assets/music_boss.mp3` | 146070 | `b63730a29364` | Original. `render_music("boss")` - the Scuzz layer, same key/tempo/length so the GGKit crossfade is phase coherent | CC0 |
| `assets/sfx_boss_death.mp3` | 20107 | `80274edf4a4a` | Original. `cue_boss_death()` - Scuzz death | CC0 |
| `assets/sfx_boss_hit.mp3` | 3806 | `adb864e3fbb8` | Original. `cue_boss_hit()` - Scuzz taking damage | CC0 |
| `assets/sfx_boss_roar.mp3` | 16972 | `debebdf67beb` | Original. `cue_boss_roar()` - Scuzz arrival and phase change | CC0 |
| `assets/sfx_dash.mp3` | 3806 | `81b0d0821713` | Original. `cue_dash()` - rusher dash commit, shielder shockwave | CC0 |
| `assets/sfx_defeat.mp3` | 15718 | `1ad0ffb51ee6` | Original. `cue_defeat()` - run over | CC0 |
| `assets/sfx_elite_death.mp3` | 6941 | `b8e590b49c2f` | Original. `cue_elite_death()` - shielder, splitter and barrel death | CC0 |
| `assets/sfx_enemy_death.mp3` | 4433 | `baa623b40100` | Original. `cue_enemy_death()` - grunt death | CC0 |
| `assets/sfx_enemy_shoot.mp3` | 2866 | `c1896b38355a` | Original. `cue_enemy_shoot()` - generic enemy shot | CC0 |
| `assets/sfx_fire_beam.mp3` | 2239 | `93556e451c98` | Original. `cue_fire_beam()` - beam tick, the fastest rate of fire | CC0 |
| `assets/sfx_fire_bounce.mp3` | 3806 | `823d211c9b12` | Original. `cue_fire_bounce()` - bounce shot, rubbery low boink | CC0 |
| `assets/sfx_fire_flak.mp3` | 4120 | `aef4a9451644` | Original. `cue_fire_flak()` - flak burst, dirty shotgun chuff | CC0 |
| `assets/sfx_fire_rail.mp3` | 6000 | `fd038bf41984` | Original. `cue_fire_rail()` - rail lance, charged high crack | CC0 |
| `assets/sfx_fire_spread.mp3` | 3179 | `5be8d26baceb` | Original. `cue_fire_spread()` - spread rack, wide triple pop | CC0 |
| `assets/sfx_hurt.mp3` | 4433 | `74b96d5bacc3` | Original. `cue_hurt()` - player damage | CC0 |
| `assets/sfx_medal.mp3` | 11016 | `826aff83a5b6` | Original. `cue_medal()` - medal earned | CC0 |
| `assets/sfx_pickup_health.mp3` | 5060 | `a6e67ad336a3` | Original. `cue_pickup_health()` - health orb | CC0 |
| `assets/sfx_pickup_mult.mp3` | 5060 | `9a3b321fb94e` | Original. `cue_pickup_mult()` - score multiplier token | CC0 |
| `assets/sfx_pickup_weapon.mp3` | 5687 | `7c3860d364be` | Original. `cue_pickup_weapon()` - weapon rack swap | CC0 |
| `assets/sfx_ui_select.mp3` | 3806 | `9dd3d6650796` | Original. `cue_ui_select()` - UI confirm | CC0 |
| `assets/sfx_ui_tick.mp3` | 1612 | `cf2025200ccd` | Original. `cue_ui_tick()` - UI tick and ricochet | CC0 |
| `assets/sfx_unlock.mp3` | 13524 | `fa32585b3e56` | Original. `cue_unlock()` - mode unlocked or safe pocket found | CC0 |
| `assets/sfx_victory.mp3` | 19480 | `b9712273e0a4` | Original. `cue_victory()` - arena cleared | CC0 |
| `assets/sfx_wave_clear.mp3` | 12270 | `0ca2a0cac1ba` | Original. `cue_wave_clear()` - wave cleared | CC0 |
| `assets/sfx_wave_start.mp3` | 9449 | `62c8effa9452` | Original. `cue_wave_start()` - wave begins | CC0 |

---

## Fonts

None ship. All text renders through the platform UI stack
(`-apple-system, system-ui, "Segoe UI", Roboto, Helvetica, Arial`), so no font
file is downloaded and no font licence applies.

## Text

Every user-facing string in `index.html`, `bf_data.js` and `game.js` was
written for this title. No em dashes appear in any user-facing string.
