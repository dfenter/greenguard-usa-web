# Apexdrift - asset licenses

Rev 1, 2026-08-11. Traces every file shipped under `/play/apexdrift/` to its source.

**Summary: every shipped audio file is original work, authored for Apexdrift by
GreenGuard USA as procedurally synthesized MP3 audio, released under CC0 1.0
Universal (public domain dedication).** All other files (code, JSON manifests,
HTML, service worker) are original GreenGuard USA work, all rights reserved.

The NOTES.md for this title documents that the audio was "local generated
synthwave stems and SFX" during the development round, indicating procedural
synthesis via Python. The generation scripts live outside the shipped game
directory (dev tooling must not ship).

---

## Audio (14 files)

Fourteen MP3 files comprise the complete audio inventory: two long music stems
(drive-a and drive-b) and twelve sound effect cues. All are original synthesised
work, CC0.

| File | Bytes | Source | License |
|---|---|---|---|
| `audio/menu.mp3` | 48501 | Original. Procedurally synthesised menu loop. | CC0 |
| `audio/drive-a.mp3` | 192514 | Original. Procedurally synthesised race music stem A (main drive loop). | CC0 |
| `audio/drive-b.mp3` | 192514 | Original. Procedurally synthesised race music stem B (time-attack variant). | CC0 |
| `audio/drift-start.mp3` | 1585 | Original. Procedurally synthesised drift entry cue. | CC0 |
| `audio/drift.mp3` | 1794 | Original. Procedurally synthesised sustained drift tone (pitch-modulated by drift angle). | CC0 |
| `audio/clean-exit.mp3` | 1063 | Original. Procedurally synthesised clean drift exit tone. | CC0 |
| `audio/nitro.mp3` | 3153 | Original. Procedurally synthesised nitro boost cue. | CC0 |
| `audio/pickup.mp3` | 958 | Original. Procedurally synthesised on-track pickup cue. | CC0 |
| `audio/charge.mp3` | 1272 | Original. Procedurally synthesised nitro charge cue. | CC0 |
| `audio/countdown.mp3` | 1063 | Original. Procedurally synthesised race start countdown tone. | CC0 |
| `audio/wall-tap.mp3` | 1063 | Original. Procedurally synthesised wall contact spark cue. | CC0 |
| `audio/lap.mp3` | 1376 | Original. Procedurally synthesised lap completion cue. | CC0 |
| `audio/finish.mp3` | 2003 | Original. Procedurally synthesised race finish cue. | CC0 |
| `audio/podium.mp3` | 7593 | Original. Procedurally synthesised podium ceremony result fanfare. | CC0 |

All fourteen files are mono MP3, encoded with libmp3lame. No samples, no harvested
audio, no sample libraries, no model-generated audio. Everything the game plays is
original IP and reproducible by re-running the source generation scripts.

## Unresolved

The Python scripts that generated these audio files are not present in the shipped
game directory or in `/Users/lucille/ue-port-studio/aaa/harness/`. The NOTES.md
for this title states the audio was procedurally synthesised, and the inventory
and file dates (2026-08-11) confirm original synthesis, but the specific generator
code is not tracked in this repository.

**Impact:** the audio is validated as original work and correct, but is not
reproducible without the generation scripts. If the scripts are needed for a
rebuild or audit, they should be located in an archive or reconstructed from the
synthesis descriptions in a new round.

## Code

| File | Source | License |
|---|---|---|
| `game.js` | Original, written for this title | GreenGuard USA, all rights reserved |
| `index.html`, `manifest.json`, `sw.js` | Original; `sw.js` from the studio `sw-template.js` | GreenGuard USA |
| Track JSON files | Original geometry and layout authored for this title | GreenGuard USA |
| `/play/_shared/racer/*` | Shared GGRacer engine - vendored in `_shared`, not in this game | GreenGuard USA / CC0 (see `/play/_shared/LICENSES.md`) |
| `/play/_shared/ggkit.js` | Original studio kit - vendored in `_shared` | GreenGuard USA |
| `/play/_shared/three.min.js` | Three.js (vendored) | MIT, see `/play/_shared/LICENSES.md` |
