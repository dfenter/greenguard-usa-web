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


## Blank frame repair

Symptom: at CSS 390x844 / deviceScaleFactor 3 the title booted clean, the render loop
advanced, the backing store measured 3x, and the frame was blank.

### Root cause

The retina conversion raised the backing store to design x factor and applied
`cameras.main.setZoom(factor)`, but a zoomed Phaser camera transforms about its
ORIGIN, which defaults to the centre of the viewport. With scroll 0 a design-space
point x therefore lands at `zoom*x - (width/2)*(zoom-1)`, i.e. the whole design box
sits one and a bit screens to the left of and above the viewport. The loop runs, the
scene draws, nothing is on screen, and there is no error anywhere.

This title is repaired with `cameras.main.setOrigin(0, 0)` alongside the zoom rather
than the fleet's `centerOn(DESIGN_W/2, DESIGN_H/2)`. Both put the design box back on
screen, but origin (0,0) additionally leaves scroll 0 meaning "design origin", so any
absolute `setScroll()` the title already performs (screen shake, world scrolling) and
any `setScrollFactor(0)` HUD stay correct in design pixels with no compensation. See
the per-title cause below for why that mattered here.

- The factor is named `HIDPI_FACTOR`, not `RETINA_FACTOR`, which is why the scripted
  pairing skipped this title. Two scenes call `setZoom(HIDPI_FACTOR)`.
- Repair: `setOrigin(0, 0)` at both sites.
- Renderer note: this title is `type: Phaser.CANVAS`, which is a known risk under the
  conversion because Canvas2D fill is CPU work and this Mac has no GPU. Measured: it
  gated clean at DPR 3 with no timeout, so it was left on CANVAS rather than converted.

### Measured, by me, on a real gameplay frame

Release gate run serially (concurrency 1) against a local static server:
`node release_gate.mjs http://localhost:<port> 1 meadow-solitaire`, headless Chrome,
390x844 at deviceScaleFactor 3, best of four post-interaction frames.

| | distinct colours (8-bit) | flattest colour share | backing/CSS ratio | gate |
|---|---|---|---|---|
| before | 1 | 100% | 3x | HOLD (art) |
| after | 8567 | 10.8% | 3x | READY (all checks pass) |

`node --check` clean on every file touched. No gameplay, balance, content or art
direction was changed.
