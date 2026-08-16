# Meadow Solitaire
Controls: tap a peak card one rank above/below the big waste card; tap DRAW for a new waste card; tap WILD then any uncovered card. Keyboard: left/right select, space play, down draw, up wild, R restart, Esc menu.
Loop: 40 authored tri-peaks deals, each solver-checked and labelled FAIR (a full clear provably exists) or GAMBLE (none does - wilds are the only shot), with real clear odds shown up front.
Chains of matches build a score multiplier; clearing a peak top pays +100 and banks a WILD (max 3, persists across deals).
Winning a deal pays coins (gamble deals pay triple); coins grow 12 plantings through 3 visible stages until the meadow blooms. Failing costs nothing - retry is always free, no energy, no purchases.

## AAA rebuild

### Implemented

- Replaced the archived canvas prototype with Phaser 3 + GGKit only. Added GGKit-validated saves, pause/resume lifecycle, window-owned pointer gestures, fixed-step updates, reduced-motion juice, PWA registration, procedural textures, pooled cards, particles, hitstop, shake, and local MP3 audio buses.
- Added honest tri-peaks play: ace wrap, generous overlapped-card hit areas, topmost legal hit priority, streak multiplier, legal hint highlight, charged undo snapshots, peak-earned wilds and undo charges, stock draws, retry-free losses, and a verified clear path on every generated deal.
- Added 90 campaign deals across six authored seasons, five escalating layouts, three-star scoring from streak and stock remaining, daily fixed seed, endless Harvest Run, persistent stars/best streaks/deal progress, and play-earned meadow growth.
- Added seasonal felt/card-back palettes, ambient wildlife, six loop stems, eleven distinct SFX, procedural icon PNGs, manifest, service worker precache, and `LICENSES.md` with the `/play/_assets/LEDGER.md` citation.

### Content tables

| Content | Table |
| --- | --- |
| Seasons | Spring Orchard, High Summer, Harvest Gold, First Frost, Moon Meadow, Renewal Rain |
| Layout ramp | Tri-Peaks, Four Peaks, Braided, Walled, Double Deck |
| Campaign | 6 seasons x 15 seeded deals = 90 |
| Rewards | Peak +100, wildcard cap 3, undo cap 5, meadow stage cap 3 |
| Modes | Campaign, Daily Deal fixed seed, Endless Harvest Run |

### Deferred

- First-frame browser boot and hook-driven mechanic probe could not run in this sandbox: the slug-derived private port `43117` was denied for local binding, and the in-app browser reported no browser available. Node syntax checks, manifest/precache checks, and 90 generated-deal verification passed.

## Retina pass 2026-08-16

- Audit profile: CSS viewport 390x844 at DPR 3. Measured pre-pass backing-store ratio: 1.00x. FIT scale math after the pass measures 1170x2532 against the 390x844 CSS canvas, a 3.00x ratio.
- Recipe: `GGKit.hiDpi.factor(390, 844)`, dense FIT scale dimensions, `GGKit.renderDefaults`, and `this.cameras.main.setZoom(f)` in both BootScene and MeadowScene. Text resolution uses the same factor.
- Factor cap: none. The factor is the GGKit native value, capped only by GGKit's normal maximum of 3.
- Could not complete live headless canvas readback or a gameplay screenshot because no browser backend was available in this environment. `node --check` passed.
