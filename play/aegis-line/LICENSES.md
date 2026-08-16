# Aegis Line - asset licences

Original IP. Every character, unit name, enemy family, boss, chapter, weapon
class and burst skill in this game is original to GreenGuard USA. All artwork
shipped with the title is generated procedurally in code at load time
(`al_art.js`); no image file is shipped in `assets/`.

Pack-level provenance for everything below is recorded in
`/play/_assets/LEDGER.md`. Harvest archive with per-pack `LICENSE.txt`
evidence files: `/Users/lucille/worker-archive/studio-assets/web2d/`.

## Engines and kit

| File | Source | Licence |
|---|---|---|
| `/play/_shared/phaser.min.js` | Phaser 3.87 | MIT, see `/play/_shared/LICENSES.md` |
| `/play/_shared/ggkit.js` | GreenGuard studio kit | in-house |
| `/play/_shared/sw-template.js` | GreenGuard studio kit | in-house |

## Art

| File | Source | Licence |
|---|---|---|
| `al_art.js` (atlas, chapter backdrops, logo, icons, particles) | generated procedurally in code, original | in-house |
| `icon.png`, `icon512.png` | generated procedurally, original | in-house |

No third-party image asset is used by this title.

## Audio

All audio is CC0. Sources were transcoded to mono MP3 per the audio format
law (never .ogg in a shipped dir, because iOS Safari cannot decode it):
`ffmpeg -i IN -ac 1 -c:a libmp3lame -b:a 96k OUT.mp3` for effects, and
`-b:a 56k` with a 48 second loop cut and seam fades for music.

### Music (LEDGER row: "music (mixed harvest)", CC0, `web2d/music/LICENSE.txt`)

| Shipped file | Source track | Author | Licence | Evidence |
|---|---|---|---|---|
| `assets/music_command.mp3` | Nuclear Cave (Loop) | hazmat-harry | CC0 | opengameart.org/content/nuclear-cave-loop |
| `assets/music_field.mp3` | Calm Ambient 1 (Synthwave 4k) | cynicmusic | CC0 | opengameart.org/content/calm-ambient-1-synthwave-4k |
| `assets/music_siege.mp3` | Cynic Battle Loop | ferk | CC0 | opengameart.org/content/cynic-battle-loop |

### Sound effects

| Shipped file | Source file | Pack (LEDGER row) | Licence |
|---|---|---|---|
| `assets/sfx_shot.mp3` | `laserSmall_001.ogg` | Kenney sci-fi-sounds | CC0 |
| `assets/sfx_shot_heavy.mp3` | `laserLarge_002.ogg` | Kenney sci-fi-sounds | CC0 |
| `assets/sfx_hit.mp3` | `impactMetal_002.ogg` | Kenney sci-fi-sounds | CC0 |
| `assets/sfx_kill.mp3` | `explosionCrunch_001.ogg` | Kenney sci-fi-sounds | CC0 |
| `assets/sfx_boss_kill.mp3` | `lowFrequency_explosion_000.ogg` | Kenney sci-fi-sounds | CC0 |
| `assets/sfx_reload.mp3` | `doorClose_001.ogg` | Kenney sci-fi-sounds | CC0 |
| `assets/sfx_burst.mp3` | `forceField_001.ogg` | Kenney sci-fi-sounds | CC0 |
| `assets/sfx_shield.mp3` | `forceField_003.ogg` | Kenney sci-fi-sounds | CC0 |
| `assets/sfx_alarm.mp3` | `computerNoise_002.ogg` | Kenney sci-fi-sounds | CC0 |
| `assets/sfx_advance.mp3` | `thrusterFire_002.ogg` | Kenney sci-fi-sounds | CC0 |
| `assets/sfx_crit.mp3` | `zap1.ogg` | Kenney digital-audio | CC0 |
| `assets/sfx_perfect.mp3` | `powerUp8.ogg` | Kenney digital-audio | CC0 |
| `assets/sfx_unlock.mp3` | `powerUp9.ogg` | Kenney digital-audio | CC0 |
| `assets/sfx_fail.mp3` | `lowDown.ogg` | Kenney digital-audio | CC0 |
| `assets/sfx_ui.mp3` | `click_002.ogg` | Kenney interface-sounds | CC0 |
| `assets/sfx_confirm.mp3` | `confirmation_002.ogg` | Kenney interface-sounds | CC0 |
| `assets/sfx_hurt.mp3` | `glitch_002.ogg` | Kenney interface-sounds | CC0 |
| `assets/sfx_clear.mp3` | `jingles_STEEL00.ogg` | Kenney music-jingles | CC0 |

Kenney packs are CC0 (kenney.nl). No attribution is legally required for CC0;
it is recorded here and the pack rows are marked in `/play/_assets/LEDGER.md`
so every shipped byte stays traceable. No CC-BY material is used, so no
in-game credits screen is required.

## Fonts

System font stack only (Verdana, Geneva, system-ui, sans-serif). No font file
is shipped.

## Network

The title makes no network request of any kind after load. No CDN, no
analytics, no remote asset.
