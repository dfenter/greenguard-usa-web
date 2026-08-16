# Galecrests licenses

- `game.js` is original procedural art, animation, UI, course and effect code
  authored for Galecrests. Every crest-bird frame, course backdrop, crowd band,
  track surface and particle sprite is drawn from primitives at load time. No
  CDN, font file, image pack or remote content is shipped.
- `assets/*.mp3` are original cues and music beds synthesised from scratch for
  this title (Python standard library synthesis, encoded with libmp3lame) and
  played only through the GGKit audio buses. They are MP3 files; no OGG audio
  is shipped, per the mobile audio format law.
  - Music beds: `theme.mp3`, `race.mp3`, `cup.mp3`.
  - SFX: `tap`, `train`, `strain`, `rest`, `bond`, `gate`, `call_good`,
    `call_late`, `surge`, `block`, `wall`, `win`, `lose`, `unlock`, `legacy`.
- `icon.png`, `icon512.png` and `favicon.png` are original procedural title
  marks generated for this title (Pillow, 4x supersampled, drawn from
  primitives).
- `phaser.min.js` is Phaser 3 under the MIT license. The engine notice lives in
  `play/_shared/LICENSES.md`.
- `ggkit.js` is GreenGuard studio kit original work. Its notice lives in
  `play/_shared/LICENSES.md`.
- Asset policy and provenance ledger: `play/_assets/LEDGER.md`. This rebuild
  ships no harvested pack files, so no pack row in the ledger is claimed.
- All names, crests, courses, rivals and text are original IP written for
  Galecrests. No licensed racing brands, real horses, real people or third
  party characters appear anywhere in the title.
