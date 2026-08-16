# Warring Banners licenses

Warring Banners ships no third-party raster or audio assets.

**Art.** Every pixel is generated procedurally at load time by `art.js`:
battlefield terrain and props, unit silhouettes, banner motifs, range and
threat overlays, particles, HUD chrome, icons, and the run boundary banner. The
app icons (`icon.png`, `icon512.png`, `favicon.ico`) were rendered from an
original script for this title. The treatment follows
[`play/_assets/ART_strategy.md`](../_assets/ART_strategy.md) and
[`play/_assets/UI_LAW.md`](../_assets/UI_LAW.md).

**Audio.** The three music beds and fourteen effects in `assets/audio/` are
original procedural renders written for Warring Banners (synthesised tones,
Karplus-Strong plucks, and filtered noise, encoded mono mp3 at 96 kbps). They
contain no external samples and are not copied from another title.

**Asset ledger.** [`play/_assets/LEDGER.md`](../_assets/LEDGER.md) was checked
before the rebuild. No harvested Kenney or other CC0 pack file is shipped in
this directory, so no ledger row applies to it; the ledger's rules on curated
cuts and attribution were followed by shipping original work instead.

**Engines.** Phaser 3 and GGKit are loaded from `/play/_shared/` and are covered
by [`play/_shared/LICENSES.md`](../_shared/LICENSES.md).

All names, factions, generals, tactic cards, and text are original to this
title.
