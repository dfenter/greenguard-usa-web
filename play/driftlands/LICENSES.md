# Driftlands asset licenses

Every binary shipped under `/play/driftlands/` is listed below with its pack
row in `/play/_assets/LEDGER.md`, its upstream source, its license and the
SHA-256 prefix of the file as shipped. No asset is fetched from a network or a
CDN at runtime; the loader reads only from this directory and from
`/play/_shared/`.

All terrain, character, prop, particle, UI, minimap and bitmap-font pixel art
is generated in code at load time by `art.js` (an original studio work). The
only imported images are the two CC0 Kenney spritesheets below, which are used
as low-alpha grain over the authored tile families.

Engine licenses for `/play/_shared/phaser.min.js` and `ggkit.js` are in
`/play/_shared/LICENSES.md`.

## Kenney Tiny Town (ledger row: Kenney tiny-town)

- Source: [Kenney Tiny Town](https://kenney.nl/assets/tiny-town)
- License: CC0 1.0 Public Domain
- Local evidence: `/Users/lucille/worker-archive/studio-assets/web2d/tiny-town/License.txt`
- Shipped file: `assets/img/tiny-town.png` (5042 bytes, sha256 `3a54d99ecde7`), the 16x16 tile grid, sampled by `art.js` for grass, forest and sand grain only.

## Kenney Tiny Dungeon (ledger row: Kenney tiny-dungeon)

- Source: [Kenney Tiny Dungeon](https://kenney.nl/assets/tiny-dungeon)
- License: CC0 1.0 Public Domain
- Local evidence: `/Users/lucille/worker-archive/studio-assets/web2d/tiny-dungeon/License.txt`
- Shipped file: `assets/img/tiny-dungeon.png` (5294 bytes, sha256 `d24e60a41e4a`), the 16x16 tile grid, sampled by `art.js` for rock and ruin grain only.

## Kenney Impact Sounds (ledger row: Kenney impact-sounds)

- Source: [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds)
- License: CC0 1.0 Public Domain
- Local evidence: `/Users/lucille/worker-archive/studio-assets/web2d/impact-sounds/License.txt`
- Each file below was transcoded from the pack OGG to mono 44.1 kHz MP3:

| Shipped file | Bytes | sha256 | Source file |
|---|---|---|---|
| `assets/audio/s_boss.mp3` | 21674 | `1017fd9cdc1c` | `Audio/impactBell_heavy_001.ogg` |
| `assets/audio/s_chop.mp3` | 10389 | `0d133461fdd5` | `Audio/impactMining_002.ogg` |
| `assets/audio/s_hit.mp3` | 5687 | `fab9fdafb8e6` | `Audio/impactPunch_medium_001.ogg` |
| `assets/audio/s_hurt.mp3` | 8508 | `2914962b93da` | `Audio/impactPunch_heavy_000.ogg` |
| `assets/audio/s_kill.mp3` | 7568 | `3331aacef788` | `Audio/impactSoft_heavy_002.ogg` |
| `assets/audio/s_step_grass.mp3` | 8822 | `59e35ce81e52` | `Audio/footstep_grass_001.ogg` |
| `assets/audio/s_step_sand.mp3` | 5374 | `fb78906bb18d` | `Audio/footstep_snow_002.ogg` |
| `assets/audio/s_step_stone.mp3` | 1925 | `146440df6562` | `Audio/footstep_concrete_000.ogg` |

## Kenney Interface Sounds (ledger row: Kenney interface-sounds)

- Source: [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds)
- License: CC0 1.0 Public Domain
- Local evidence: `/Users/lucille/worker-archive/studio-assets/web2d/interface-sounds/License.txt`

| Shipped file | Bytes | sha256 | Source file |
|---|---|---|---|
| `assets/audio/s_reveal.mp3` | 2239 | `80e00d9be8a2` | `Audio/glass_002.ogg` |
| `assets/audio/s_sealed.mp3` | 7254 | `5d9ecee4f5bd` | `Audio/error_003.ogg` |
| `assets/audio/s_swing.mp3` | 2239 | `457ad833112f` | `Audio/scratch_003.ogg` |
| `assets/audio/s_ui.mp3` | 1298 | `e01dfdc25934` | `Audio/select_001.ogg` |

## Kenney Digital Audio (ledger row: Kenney digital-audio)

- Source: [Kenney Digital Audio](https://kenney.nl/assets/digital-audio)
- License: CC0 1.0 Public Domain
- Local evidence: `/Users/lucille/worker-archive/studio-assets/web2d/digital-audio/License.txt`

| Shipped file | Bytes | sha256 | Source file |
|---|---|---|---|
| `assets/audio/s_heart.mp3` | 7254 | `8aaddc0d3084` | `Audio/highUp.ogg` |
| `assets/audio/s_pickup.mp3` | 7881 | `bd9d7edcd4e9` | `Audio/powerUp8.ogg` |
| `assets/audio/s_sigil.mp3` | 9449 | `b9184d18b5ea` | `Audio/twoTone1.ogg` |

## Kenney Sci-Fi Sounds (ledger row: Kenney sci-fi-sounds)

- Source: [Kenney Sci-Fi Sounds](https://kenney.nl/assets/sci-fi-sounds)
- License: CC0 1.0 Public Domain
- Local evidence: `/Users/lucille/worker-archive/studio-assets/web2d/sci-fi-sounds/License.txt`

| Shipped file | Bytes | sha256 | Source file |
|---|---|---|---|
| `assets/audio/s_door.mp3` | 7254 | `955e24f6e62a` | `Audio/doorOpen_000.ogg` |

## Kenney Music Jingles (ledger row: Kenney music-jingles)

- Source: [Kenney Music Jingles](https://kenney.nl/assets/music-jingles)
- License: CC0 1.0 Public Domain
- Local evidence: `/Users/lucille/worker-archive/studio-assets/web2d/music-jingles/License.txt`

| Shipped file | Bytes | sha256 | Source file |
|---|---|---|---|
| `assets/audio/s_relic.mp3` | 7568 | `aceb3e7121b0` | `Audio/Pizzicato jingles/jingles_PIZZI09.ogg` |
| `assets/audio/s_win.mp3` | 19480 | `9cca28f09122` | `Audio/Steel jingles/jingles_STEEL07.ogg` |

## OpenGameArt music harvest (ledger row: music (mixed harvest))

- Source directory: `/Users/lucille/worker-archive/studio-assets/web2d/music/`
- Local evidence: `/Users/lucille/worker-archive/studio-assets/web2d/music/LICENSE.txt`
- All four tracks are CC0 per that manifest. Each was trimmed to a seamless
  loop and transcoded to mono MP3; no other edits were made.

| Shipped file | Bytes | sha256 | Source file | Title / author / page |
|---|---|---|---|---|
| `assets/audio/m_title.mp3` | 272135 | `91d8606b9fbc` | `calm_Relaxing_0.mp3` | "Calm Loop", wipics, [OpenGameArt](https://opengameart.org/content/calm-loop) |
| `assets/audio/m_isle.mp3` | 384409 | `62102ec5313b` | `adventure_Shakkar.ogg` | "Shakkar", zesona, [OpenGameArt](https://opengameart.org/content/shakkar) |
| `assets/audio/m_deep.mp3` | 384566 | `117fe2642f50` | `calm_nuclear_cave_0.mp3` | "Nuclear Cave (Loop)", hazmat-harry, [OpenGameArt](https://opengameart.org/content/nuclear-cave-loop) |
| `assets/audio/m_tide.mp3` | 385612 | `e6e4b29ddd66` | `action_analog_beats_0.ogg` | "Analog Beats (looped)", ogelgames, [OpenGameArt](https://opengameart.org/content/analog-beats-looped) |

## Original studio work

These files are original to Driftlands, drawn for this title, and carry no
third-party rights. They are the island silhouette mark used across the PWA
surfaces.

| Shipped file | Bytes | sha256 | Notes |
|---|---|---|---|
| `icon.png` | 2564 | `00c9b542bb7b` | 192x192 PWA icon |
| `icon512.png` | 6803 | `982a936c235d` | 512x512 PWA icon |
| `favicon.png` | 1023 | `afc054ace656` | 64x64 favicon |

Also original, and generated in code rather than shipped as files: the whole
terrain atlas (biome families, 16-way transitions, cliff shading, animated
water, foam and grass), the drifter and enemy sprite sheets, every prop, the
particle textures, the nine-slice UI skins, the control skins, the minimap
markers and the bitmap font. See `art.js`.

## Name and IP

"Driftlands", the island, the gauntlet names, the drifter, the sigils and the
tide-heart are original. No trademarked or third-party character, place or
story element is used.
