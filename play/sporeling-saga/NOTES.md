Controls: tap the foe or press Space to strike; tap FORAGE PICK or press F for a free drop; use 1/2/3 for evolution choices.
Loop: auto-fight the lane, forage gear/food/trinkets, choose a branch at ranks 5/10/15, and reach rank 20 for a new-seed rerun.
Progress is earned only while the run is active; the economy panel shows posted odds, next-rank XP, and live XP/minute.
Restart or rerun is instant; best rank, best score, wins, and branch unlocks persist locally.

## AAA rebuild

Implemented: Phaser 3 from `/play/_shared/`, GGKit lifecycle/input/save/audio, fixed-step rank-20 combat, tap-strike pace boost, generous forage and gear drops, four authored lanes, Branch Trials, medal persistence, branch unlock chain, procedural sprite states, pooled impact/drop VFX, reduced-motion support, safe-area portrait PWA shell, offline precache, and `window.__ss` state plus force switches.

Rank and lane table:

| Ranks | Lane | Foe roster | Forage odds |
|---|---|---|---|
| 1-5 | Mossy Trail | Dewcap, Thornlug, Barkbit | Gear 50%, Food 35%, Trinket 15% |
| 6-10 | Spore Marsh | Mire Mote, Bog Bell, Reedclaw | Gear 46%, Food 38%, Trinket 16% |
| 11-15 | Fungal Deep | Cinder Crawler, Velvet Maw, Gloom Grub | Gear 44%, Food 34%, Trinket 22% |
| 16-20 | Sporeling Saga finale | Crown Mantis, Mycelial Warden, Rotfang | Gear 40%, Food 34%, Trinket 26% |

Branch table:

| Branch | Rank 5 | Rank 10 | Rank 15 |
|---|---|---|---|
| Guardian | +2 power, +4 armor, Brace 8% | +3 power, +5 armor, Bulwark 12% | +5 power, +7 armor, Aegis 18% |
| Trickster | +2 power, +0.18 tempo, +7% crit | +3 power, +0.23 tempo, +14% crit | +5 power, +0.28 tempo, +22% crit |
| Bloom | +1 power, +1 armor, food +12 | +2 power, +2 armor, food +22 | +4 power, +3 armor, food +35 |

Deferred: browser visual smoke and 4x-throttle capture could not run in this sandbox because no browser binding was available and local server binding was denied. No deploy or commit performed.

## Fix round 1

Fixed:

- Critical local multiplayer: added independent P1 and P2 state, keyboard layouts, per-player touch zones, controller button routing, hotplug notices, per-player HUD, and action queues.
- Critical summon, collection, and colony loop: added persistent per-player collections, captured rivals, colony spores and rank, collection screen, summon cycling, and evolved forms.
- Critical art floor: replaced the single placeholder sporeling with layered authored vector forms for rootling, Guardian, Trickster, Bloom, and captured rivals, plus walk, strike, hurt, evolve states and landmark dressing for every lane.
- Guardian abilities: BRACE, BULWARK, and AEGIS now write their mitigation into each player and incoming damage shows the active guard rate.
- Evolution presentation: branch forms persist, normal evolution emits burst and ring effects, and walk, anticipation, contact, hurt, and follow-through states are rendered.
- Foe AI: added stalk, telegraph, recover, and guard phases, target selection, readable telegraphs, guard counters, and varied attack timing.
- Forage economy: added a four-cache stock, cooldown, combat replenishment, unavailable feedback, and live stock display.
- Evolution requirements: added persistent evolution spores, a five-spore cost, validation, consumption, and exact card requirements.
- Trial reveal: added a visible Continue button plus Enter, Space, and Escape routing.
- Prestige clarity: result screens now explain legacy retention, reset run stats, retained roster, colony, and unlocks.
- Result layout: moved the medal footer to its own row and added a separate collection action.
- Tap feel: added press-down scale, release pop, immediate pose feedback, and a pointer-up bridge for taps completed between GGKit frames.
- Save validation: added branch-chain invariants and validation for evolution spores, colony state, and both player collections.
- Minor settings access: added a visible settings button using GGKit.
- Minor hit flash: rendered the flash overlay with deterministic decay.
- Service worker: bumped VERSION to 2026-08-11-aaa-f14.

Rejected:

- None. Browser visual smoke and 4x-throttle measurement remain unverified because no browser binding was available in this environment. `node --check` passed for every changed JavaScript file.

## Retina pass 2026-08-16

- Before ratio: 1.00x static FIT baseline from the 390x844 design backing store. A live pre-pass canvas readback was unavailable in this sandbox.
- After ratio: 3.00x target by factor math at emulated DPR 3, producing a 1170x2532 backing store for the 390x844 design viewport.
- Recipe: Phaser `Scale.FIT`, design coordinates preserved, scale dimensions multiplied by `GGKit.hiDpi.factor(390, 844)`, shared `GGKit.renderDefaults` merged, and zoom applied in boot and play scene `create()` methods. Phaser text uses the same factor.
- Factor cap: none beyond GGKit's default clamp to [1, 3].
- Could not do: live `canvas.width / getBoundingClientRect().width` readback, gameplay screenshot, and `retina_audit.mjs` acceptance because no browser surface was available and private port binding was denied.
