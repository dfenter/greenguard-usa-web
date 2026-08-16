Controls: tap PREP and OVEN; drag a hot plate from COUNTER to a table.
Keyboard: 1/2 work stations, 3 selects counter, arrows select, Space/Enter serves.
Loop: keep patience bars alive, buy the 12 automation steps, then prestige for speed.
Three walkouts fail a wave; retry instantly. Progress and best score persist locally.
Portrait only; the rush pauses whenever the phone is rotated.

## AAA rebuild

Implemented: Phaser 3 and GGKit rebuild with fixed-step portrait rush play; stretch-dough taps, forgiving topping drag and wrong-topping reject, patience telegraph, in-order combo serving, visible staff handoff, pooled particle FX, juice gating, pause-safe window gestures, procedural venue backdrops and street life, 5-venue campaign, 30 recipe table, 12 automation upgrades, Rush Hour challenges, Reopening prestige, bounded offline earnings with clock-tamper validation, GGKit audio buses, PWA shell, and `window.__sr` debug controls.

Content tables: 5 authored venues with unique palettes, archetypes, decor levels and music stems; 30 recipe entries; 6 topping types; 12 linear upgrade entries; venue investment and rush-medal persistence; recipe unlocks tied to served mastery.

Deferred: no harvested art pack is required, so all visuals remain procedural; performance numbers were not reported because the verification box is contended and has no GPU. A quiet-box feel gate remains with the orchestrator.

## Retina pass 2026-08-16

- Before ratio: 1.00x static FIT baseline from the 390x844 design backing store. A live pre-pass canvas readback was unavailable in this sandbox.
- After ratio: 3.00x target by factor math at emulated DPR 3, producing a 1170x2532 backing store for the 390x844 design viewport.
- Recipe: Phaser `Scale.FIT`, design coordinates preserved, scale dimensions multiplied by `GGKit.hiDpi.factor(390, 844)`, shared `GGKit.renderDefaults` merged, and zoom applied in the gameplay scene `create()`. Phaser text uses the same factor.
- Factor cap: none beyond GGKit's default clamp to [1, 3].
- Could not do: live `canvas.width / getBoundingClientRect().width` readback, gameplay screenshot, and `retina_audit.mjs` acceptance because no browser surface was available and private port binding was denied.
