# Skyhammer - licences and asset provenance

## Summary

Skyhammer ships **no third-party art and no third-party audio**. Every sprite,
particle, HUD plate, ring, banner, background tile and sound effect in the game
is generated procedurally in code at boot by `sh_art.js`, using only the 2D
canvas API and a small WAV encoder. The only binary files in this directory are
the four launcher images, which were rendered from an original script for this
title.

Because no packaged asset is shipped, no row of `/play/_assets/LEDGER.md` is
consumed by this title. The ledger is cited below as the governing register
regardless, per the fleet asset policy.

## Ledger reference

Governing register: `/play/_assets/LEDGER.md` (Rev 1, 2026-08-06).

| Pack | Used by Skyhammer | Notes |
|---|---|---|
| Kenney pixel-shmup | No | Sprite fleet is procedural, see `sh_art.js` |
| Kenney particle-pack | No | Six particle textures are baked at boot |
| Kenney sci-fi-sounds / impact-sounds / digital-audio | No | All sfx are synthesised WAV, see `SHArt.buildAudio` |
| Kenney music-jingles / music (mixed harvest) | No | Three music stems are synthesised WAV loops |

No CC-BY item is used, so no in-game attribution screen is required. If a
packaged asset is ever added to this title, it must gain a row here at file
level and a "Used by" entry in `/play/_assets/LEDGER.md` at pack level before
it ships.

## Audio format note

The fleet rule is that shipped audio files are mp3 or m4a, never ogg. Skyhammer
ships no audio file at all. Sounds are rendered at boot into 16-bit PCM WAV
buffers held in memory as object URLs and decoded by the GGKit audio bus. No
audio file is written, requested, cached or precached.

## Engine and kit

| Component | Path | Licence |
|---|---|---|
| Phaser 3.87 | `/play/_shared/phaser.min.js` | MIT, see `/play/_shared/LICENSES.md` |
| GGKit | `/play/_shared/ggkit.js` | GreenGuard USA internal, see `/play/_shared/LICENSES.md` |

## Original files in this directory

| File | Origin |
|---|---|
| `game.js`, `sh_art.js`, `sh_content.js` | Original work for GreenGuard USA |
| `icon.png`, `icon512.png`, `favicon.png`, `favicon.ico` | Rendered from an original generator script for this title |
| `index.html`, `manifest.json`, `sw.js` | Original, `sw.js` derived from `/play/_shared/sw-template.js` |

## IP

Skyhammer, its stage names (Dawn Shelf, Ember Reach, Storm Vault, Iron
Meridian, Hammerfall) and its boss names (Kestrel Frame, Vault Choir, Corona
Weaver, Bastion Gate, Skyhammer Prime) are original to GreenGuard USA. No
existing shoot-em-up character, ship, logo, pattern set or name is reproduced.
