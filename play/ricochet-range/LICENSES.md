# Ricochet Range licenses

Ricochet Range ships original SVG art, a short original MP4/AAC micro-tone, and
procedural course geometry. It does not ship downloaded third-party art or
audio. The asset policy and source ledger
reviewed for this title are [play/_assets/LEDGER.md](../_assets/LEDGER.md) and
[ART_arcade2d.md](../_assets/ART_arcade2d.md).

- Phaser 3.87.0 is loaded from `/play/_shared/phaser.min.js`. See
  [the shared license file](../_shared/LICENSES.md) for the MIT notice.
- GGKit is loaded from `/play/_shared/ggkit.js` and is original GreenGuard
  studio work. It owns lifecycle, pointer identity, save validation, and audio
  buses for this title.
- The bundled SVGs and inline tone are original GreenGuard studio assets. No
  third-party image, font, or audio asset is bundled in this directory.
- Round 2 adds a runtime texture bakery: every ring, glow, flare, puff,
  bumper, mover, portal, pickup, plate, card and parallax ground tile is
  drawn procedurally into a canvas at device pixel ratio by `game.js`. These
  are original generated assets with no third-party source. `range-seal.svg`
  is retained in the directory but is no longer loaded at runtime.
