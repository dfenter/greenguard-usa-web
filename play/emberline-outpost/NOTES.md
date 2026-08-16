# Emberline Outpost

Drag a card from the tray onto a tile and flick before releasing: the flick sets the defender's FACING, which rotates its firing footprint. Tap a placed defender for its skill / scrap button.
Loop: hold 8 maps of ground-lane + air waves. Deploy charge regenerates in-map and drops from kills; leak too many enemies through the outpost gate and the map is lost. Clearing maps 1-4 unlocks 2 of the 10 defenders each, and every clear pays salvage.
Between maps, the Workshop crafts deploy kits from salvage into unlockable slots (charge, regen, leak cap, hull, cooldown, salvage rate) — all play-earned, nothing purchasable.
Keyboard: arrows move the cursor, Q/E pick a card, R rotates facing, Space places or selects, Enter fires the skill, X scraps, P pauses, F toggles 2x speed.
Progress, roster, kits and per-map best score persist locally; map 8 is the win.

## AAA rebuild

### Implemented

- Rebuilt the title in Phaser 3 with `/play/_shared/phaser.min.js` and GGKit as the sole lifecycle, input, save, audio, pause, reduced-motion, and PWA layer. The shell is landscape-first with the required absolute shared paths and `/play/emberline-outpost/` base URL.
- Added a fixed-step RTS tower-defense loop with a regenerating deploy pool, 2x and pause controls, drag placement, flick-facing selection, facing preview arcs, range overlays, elevated tiles, operator selection, two manual skills per operator, cooldown pips, and recycle recovery.
- Added pooled enemy, shot, particle, contact, debris, trail, and reward FX with impact hit-stop, budgeted shake, animated dispatch proxy, threat telegraphs, block-count pips, hazard dressing, and one-at-a-time transient UI. In-play feedback is a compact chip; center banners are run-boundary only.
- Added GGKit save validation for roster, promotions, materials, outpost facilities, loadout, campaign stars, Trials records, and Siege best score. No gacha, currency purchase, or purchase surface exists.
- Added generated local MP3 music beds, danger stems, and distinct select, confirm, cancel, place, move, attack, hit, kill, warning, wave, skill, victory, and promotion cues routed through GGKit audio buses.
- Added PWA manifest, icons, favicon, and service worker derived from `/play/_shared/sw-template.js`. The precache contains only files that exist.

### Content tables

| Content | Table |
|---|---|
| Campaign | 24 missions in 4 chapters of 6: Ashfall Approach, Flooded Works, Cinder Ridge, Outpost Core. Missions 06, 12, 18, and 24 are boss assaults. |
| Theatres | Four distinct palettes and ambient signatures: ash vents and rails, flooded pumpworks and water, cinder flares and ridge cuts, core lights and reactor platforms. |
| Operators | 12 original operators: Barrier, Pike, Arcer, Sparker, Medic, Sniper, Oiler, Warden, Scout, Anchor, Relay, Sapper. Roles cover defender, ranged, medic, and specialist. |
| Progression | Three promotion tiers per operator; Smelter raises earned yield, Relay raises charge flow, Command Deck unlocks loadout slots. All upgrades spend mission-earned materials. |
| Side modes | Three fixed-seed Trials and an Endless Siege with persistent records. |

### Deferred

- Browser first-frame and `window.__eo` drag-placement probe could not run: this environment had no available browser surface, and its sandbox rejected the slug-derived local TCP listener with `EPERM`. Node syntax checks, data-content checks, adapter boot parsing, precache existence, payload size, and em-dash scans passed.
- Feel and throttled frame measurements were intentionally not run because the box is contended and has no GPU, per the rebuild request.

## Retina pass 2026-08-16

- Before ratio: 1.00x source baseline at DPR 3. After ratio: 3.00x configured
  through `GGKit.hiDpi.resize(game, cssW, cssH)`; a live canvas ratio could
  not be measured because Chrome aborted in this sandbox and the private HTTP
  bind was denied.
- Recipe: applied Phaser Scale.RESIZE hi-DPI sizing at boot, resize,
  orientation-change, and visibility events. Applied `GGKit.renderDefaults`
  and `resolution: GGKit.hiDpi.dpr()` to the pooled Phaser text.
- Factor cap: none beyond the GGKit maximum of 3. No title-specific cap was
  needed.
- Could not complete the live DPR 3 gameplay screenshot or layout check.
  The authored board texture bake was left at its logical size because a
  frame-unit migration to `GGKit.hiDpi.canvas(...)` could not be live-verified.

## Retina pass 2

- Delayed DPR 3 canvas ratio: not measured. The slug-derived private harness port was rejected with `EPERM`, and headless Chrome aborted before creating a page. Configured `cfg.ggDpr` is 3.00 at the audit viewport.
- Converted boot to `GGKit.hiDpi.phaser` with `Phaser.Scale.NONE`, retained render defaults, baked the board through `GGKit.hiDpi.canvas`, and kept text dense with `cfg.ggDpr` plus inverse object scale.
- Layout now uses the scaled Phaser dimensions with the density factor, and the scene camera sets zoom and centers on the viewport midpoint.
- Gameplay screenshot, render-loop probe, and input-resolution proof could not be completed because the local browser infrastructure was unavailable.
