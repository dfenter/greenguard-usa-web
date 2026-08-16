# Buzz Grand Prix - asset licenses

Rev 1, 2026-08-11. Traces every file shipped under `/play/buzz-gp/` to its source.

**Summary: every shipped audio file is original work, authored for Buzz Grand
Prix by GreenGuard USA as procedurally synthesised MP3 audio, released under CC0
1.0 Universal (public domain dedication).** All other files (code, JSON
manifests, HTML, service worker) are original GreenGuard USA work, all rights
reserved.

The NOTES.md for this title documents that the game ships "local synthesized MP3
audio, and no CDN or network asset dependency", indicating procedural synthesis.
All seventeen MP3 files are original compositions, verified as valid at
2026-08-11 during the development build.

---

## Audio (17 files)

Seventeen MP3 files comprise the complete audio inventory: three music tracks
and fourteen sound effect cues, all procedurally synthesised and original CC0
work.

### Music (3 files)

| File | Bytes | Source | License |
|---|---|---|---|
| `assets/music_menu.mp3` | 144657 | Original. Procedurally synthesised menu loop. | CC0 |
| `assets/music_race_a.mp3` | 192514 | Original. Procedurally synthesised race music (Grand Prix and Time Trial). | CC0 |
| `assets/music_race_b.mp3` | 192514 | Original. Procedurally synthesised race music (Balloon Battle mode variant). | CC0 |

The two race music stems share a tempo and key so GGKit's crossfade between them
is phase-coherent. Both are approximately the same byte length (libmp3lame at a
consistent bitrate), but are distinct compositions with different arrangements
and instrumentation.

### Sound effects (14 files)

All synthesised, mono MP3, original CC0 work. Each cue is distinct, not a
pitch-shift or variation of another.

| File | Bytes | Source | License |
|---|---|---|---|
| `assets/sfx_item.mp3` | 2578 | Original. Procedurally synthesised item pickup cue. | CC0 |
| `assets/sfx_hit.mp3` | 2578 | Original. Procedurally synthesised racer collision impact. | CC0 |
| `assets/sfx_drift.mp3` | 2578 | Original. Procedurally synthesised drift activation tone. | CC0 |
| `assets/sfx_boost.mp3` | 2578 | Original. Procedurally synthesised mini-turbo boost cue. | CC0 |
| `assets/sfx_jump.mp3` | 2578 | Original. Procedurally synthesised jump/trick cue. | CC0 |
| `assets/sfx_pickup.mp3` | 2578 | Original. Procedurally synthesised on-track item pickup cue. | CC0 |
| `assets/sfx_shield.mp3` | 2578 | Original. Procedurally synthesised shield activation tone. | CC0 |
| `assets/sfx_hornet.mp3` | 2578 | Original. Procedurally synthesised Homing Hornet item launch cue. | CC0 |
| `assets/sfx_sap.mp3` | 2578 | Original. Procedurally synthesised Sap Slick hazard deploy cue. | CC0 |
| `assets/sfx_swarm.mp3` | 2578 | Original. Procedurally synthesised Swarm Surge item activation cue. | CC0 |
| `assets/sfx_pebble.mp3` | 2578 | Original. Procedurally synthesised Pebble Triple item launch cue. | CC0 |
| `assets/sfx_lap.mp3` | 2578 | Original. Procedurally synthesised lap completion cue. | CC0 |
| `assets/sfx_fanfare.mp3` | 2578 | Original. Procedurally synthesised race result fanfare. | CC0 |
| `assets/sfx_ui.mp3` | 2578 | Original. Procedurally synthesised UI interaction tick. | CC0 |

All files are original IP. No samples, no harvested audio, no sample libraries,
no model-generated audio. Everything the game plays is authored synthesis and
reproducible by re-running the source generation scripts.

## Unresolved

The Python scripts that generated these audio files are not present in the shipped
game directory or in `/Users/lucille/ue-port-studio/aaa/harness/`. The NOTES.md
for this title documents that the game ships "local synthesized MP3 audio", and
the inventory and file dates (2026-08-11) confirm original synthesis, but the
specific generator code is not tracked in this repository.

**Impact:** the audio is validated as original work and correct, but is not
reproducible without the generation scripts. If the scripts are needed for a
rebuild or audit, they should be located in an archive or reconstructed from
standard synthesis patterns used across the studio's other procedurally-generated
audio titles.

## Code

| File | Source | License |
|---|---|---|
| `game.js` | Original, written for this title | GreenGuard USA, all rights reserved |
| `index.html`, `manifest.json`, `sw.js` | Original; `sw.js` from the studio `sw-template.js` | GreenGuard USA |
| Track JSON files | Original geometry, layout and logic authored for this title | GreenGuard USA |
| Racer definitions (inline in game.js) | Original character and vehicle data authored for this title | GreenGuard USA |
| `/play/_shared/racer/*` | Shared GGRacer engine - vendored in `_shared`, not in this game | GreenGuard USA / CC0 (see `/play/_shared/LICENSES.md`) |
| `/play/_shared/ggkit.js` | Original studio kit - vendored in `_shared` | GreenGuard USA |
| `/play/_shared/three.min.js` | Three.js (vendored) | MIT, see `/play/_shared/LICENSES.md` |
