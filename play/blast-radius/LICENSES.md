# Blast Radius licenses

Blast Radius ships no harvested raster, vector, or font assets. Every visual
in the running game is generated procedurally in code at load time; the audio
cues are original synthesis for this title.

- Phaser 3 and GGKit are loaded from `/play/_shared/` and are covered by
  `play/_shared/LICENSES.md`.
- The visual direction follows `play/_assets/ART_arcade2d.md`, and the asset
  inventory and provenance rules are documented in `play/_assets/LEDGER.md`.
  No pack under `play/_assets/` is used by this title, so it claims no LEDGER
  "Used by" row.
- `assets/*.mp3` (fuse_tick, blast_boom_a, blast_boom_b, blast_chain,
  chaser_growl, pickup_chime, banner_sting, score_ping, music_base,
  music_heat) are original procedural synthesis for this game. MP3 only, per
  the audio format law. No OGG is shipped.
- `assets/*.svg` are the round 1 original title artwork. As of the round 2
  polish pass every actor, prop, tile, particle, and chrome texture is baked
  procedurally at device pixel density instead, so the SVG set is retained as
  original source history but is no longer loaded or precached.
- All names, copy, art, and audio are original to GreenGuard USA.
