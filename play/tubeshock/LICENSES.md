# Tubeshock - asset licenses

Rev 1, 2026-08-10. Traces every file shipped under `/play/tubeshock/` to its
source, as required by `/play/_assets/LEDGER.md`.

**Summary: no third-party asset ships in this game, and no asset file of any
kind ships except the three PWA icons.** Every sprite, every background plate,
every particle texture and every audio cue is generated procedurally in
`game.js` at boot from primitives. The icons are the only binary art files, and
they are original work drawn from primitives with Pillow. Everything here is
original work authored for Tubeshock by GreenGuard USA and released under
**CC0 1.0 Universal (public domain dedication)**.

Nothing is harvested, sampled, traced or derived from an outside pack, so no
CC-BY attribution is owed and no third-party credit appears in game.

## Ledger relationship

`/play/_assets/LEDGER.md` currently carries **no binary assets at all** - the
`_assets/` directory holds only the art bibles and the ledger itself. Tubeshock
therefore consumes **no ledger pack row**, and the "Used by" column stays
unchanged for every pack. In particular the `Kenney pixel-shmup`,
`Kenney particle-pack`, `Kenney sci-fi-sounds` and `music (mixed harvest)` rows
are deliberately **not** used: the brief's rule is "files already under
`play/_assets/` (copied into the game's own `assets/` dir) **or** generated
procedurally in code", and this title takes the second branch end to end. No
file is hotlinked from another title's directory, and there is no
`/play/tubeshock/assets/` directory to trace.

## Files shipped

| File | Origin | License |
|---|---|---|
| `index.html` | original | CC0 |
| `game.js` | original | CC0 |
| `ts_data.js` | original | CC0 |
| `sw.js` | authored from `/play/_shared/sw-template.js` (original studio template) | CC0 |
| `manifest.json` | original | CC0 |
| `icon.png` (192x192) | original, drawn from primitives with Pillow | CC0 |
| `icon512.png` (512x512) | original, drawn from primitives with Pillow | CC0 |
| `favicon.ico` (16/32/48/64) | original, same drawing downscaled | CC0 |
| `LICENSES.md`, `NOTES.md` | original | CC0 |

## Vendored engine

`/play/_shared/phaser.min.js` (Phaser 3.87, MIT) and `/play/_shared/ggkit.js`
(original studio kit) are covered by `/play/_shared/LICENSES.md`. Tubeshock
loads both from `_shared/` and vendors no engine of its own. No CDN, no network
fetch of any kind at runtime, and the service worker precaches only files that
exist in this directory.

## Procedural art

Every texture is drawn with the 2D canvas context into a Phaser canvas texture
inside `buildTextures()` / `forgeEnemy()` in `game.js`:

| Texture | What it is |
|---|---|
| `p_dot`, `p_spark`, `p_shard`, `p_smoke`, `p_ring` | the five particle and shockwave shapes |
| `claw_idle`, `claw_charge`, `claw_fire` | the three claw animation states |
| `bullet`, `reticle` | tracer and target lock |
| `pu_surge`, `pu_mult`, `pu_shield`, `pu_life` | the four pickup glyphs |
| `en_<family>_<archetype>` (20) | five enemy silhouettes restyled per tube family |
| `boss_plate`, `boss_core` | the tube guardian |
| `bg_<family>` (4) | the family background ramps |

The icons are reproduced by re-running the generator recorded in NOTES.md; it
uses Pillow only, at 4x supersample, and fetches nothing.

## Procedural audio, and the audio format law

All three music beds and all seventeen SFX cues are synthesised into 16 bit PCM
**WAV** buffers in `buildAudio()` and handed to the GGKit audio buses as blob
URLs. They are generated in the page, never fetched, and never written to disk,
so the shipped payload contains **zero audio files**.

**No `.ogg` file exists in this title and no `.ogg` path is referenced.** iOS
Safari cannot decode ogg through `decodeAudioData`, so an ogg would ship silent
on iPhone behind GGKit's error handling. If any cue is ever promoted to a
shipped file it must be encoded as mono **mp3** (libmp3lame) or **m4a**, per the
fleet rule.

No samples, no sample libraries, no model-generated audio, no network fetches.
