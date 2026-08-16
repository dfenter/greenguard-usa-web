Controls: tap a tile to walk; tap a glowing landmark to interact.
Keyboard: arrows/WASD move, Enter/Space interact or choose, X/Escape backs out.
Loop: plaza → gate → random encounters → glyph chests → three reactor floors → Warden.
ORBS opens the loadout; select a hero, then tap an orb to socket or swap it.
Crystals save and restore; defeat the Warden for a score, then choose a new route from the clear screen.

## AAA rebuild

### Implemented

- Phaser 3 scene with GGKit as the sole lifecycle, input, save, audio, PWA, and reduced-motion shell. Fixed-step ATB sim caps catch-up and slows degraded devices without time-skipping.
- Reactor Run, New Game+ orb remix after a Warden clear, and Glyph Hunt with five generous glyph chests, gil, tonic, healing crystal, and encounter drops.
- Three-step combat read: action, target, confirm. Each party card shows HP and readable ATB fill. Orb socket changes the combat ability icon and label.
- Crystal save and restore uses a visible confirmation modal, full-party restore, save banner, chime, and checkpoint persistence.
- Warden phases at 70% and 35% HP with named party-wide telegraphs, countdowns, guard response, and phase banners.
- Bronze, silver, and gold floor medals combine clear time, no-wipe, and glyph completion. Gold across all floors plus a clear unlocks Warden Ascendant.
- Runtime-authored hero sheets contain idle, walk, attack, cast, hurt, and victory frames. Portrait frames, landmarks, quest labels, pooled particles, overshoot banners, and MP3 GGKit buses are included.
- `window.__af = { state, forceFloor, forceEncounter }` is available before boot and remains live in the scene. PWA manifest, icon set, local MP3 clips, and complete service-worker precache are included.

### Floors

| Floor | Identity | Signature landmark | Glyph side path |
|---|---|---|---|
| Plaza hub | Lower Plaza | Ember Inn and Lumen Mart | Hidden plaza glyph cache |
| Approach | Glassbloom Approach | Reactor shell gate | Mend glyph chest off the glass road |
| 1 | Glassline Intake | Siphon Garden | Frost glyph chest beside coolant veins |
| 2 | Cinder Foundry | Chainheart Furnace | Jolt glyph chest on the hot route |
| 3 | Prism Core | Sevenfold Lens | Ward glyph chest before the Warden |
| Finale | Warden Chamber | Cinder Warden core | Ascendant variant after the medal chain |

### Party

| Hero | Role | Readable identity | Base combat hook |
|---|---|---|---|
| Kest | Riftblade | Ember frame, blade silhouette | Crescent Step and high basic damage |
| Vey | Spark scout | Cyan frame, ranged marker | Threadshot and fastest ATB |
| Nell | Chime weaver | Mint frame, ring motif | Choral Mend and party sustain |

### Deferred

- A real browser boot and interaction trace could not run in this environment because no browser runtime was available, and the local HTTP server bind was denied. `node --check` passed for every changed JavaScript file, manifest JSON parsed, and every service-worker precache path was verified to exist.

## Fix round 1

Fixed:

- CRITICAL descent simulation: gravity, airflow, vertical landing layers, scrolling layer bands, and 0.25 second floor transitions.
- CRITICAL field hazards: pooled telegraphed hazards, collision tests, field damage, invulnerability, and hazard FX.
- CRITICAL art treatment: authored 16px-grid tile bands, layered lighting, floor motifs, transition tiles, props, four-direction hero sheets, and deeper landmark silhouettes.
- CRITICAL FX: separate pooled element, power, and hazard particles with reduced-motion gating.
- MAJOR world elements: visible pickups, collection feedback, active element state, orb progression, and in-world power activation.
- MAJOR traversal: routed movement through intermediate points, bounds, obstacle tests, and interaction only after arrival.
- MAJOR enemy behavior: distinct ranged, chase, timing, area, defense, and readable telegraph patterns.
- MAJOR floor progression: floor 3 now awards its current-run medal before the Warden transition, including runs with an older profile medal.
- MAJOR plaza services: Ember Inn heals for 8 gil and Lumen Mart grants tonics for 6 gil.
- MAJOR Warden score: validated score calculation, clear screen result readout, medal screen score row, and saved score state.
- MAJOR keyboard combat: focus navigation, action selection, target selection, confirmation, and cancellation parity.
- MAJOR crystal keyboard flow: explicit confirm and cancel handling without repeat interaction.
- MAJOR gamepad input: dead-zone polling, button edges, confirm, back, pause, navigation, and pause-safe input clearing.
- MAJOR defeat flow: explicit route-collapsed screen with crystal restore and clean-run restart choices.
- MAJOR save validation: strict top-level and nested shape checks, registry validation, ranges, map keys, medal values, and rejection of unknown fields.
- MAJOR ATB read: directional fill bars, ready treatment, active focus frame, and next-actor rail.
- MAJOR combat results: ally markers, enemy HP bar, floating damage/heal/guard results, and result icons.
- MAJOR party-wide actions: Heal All and Shield now enter direct confirmation without a false ally target step.
- MAJOR defensive effects: guard and shield effects have explicit expiry and are consumed by the next hit.
- MAJOR combat feedback: hit-stop freezes simulation steps, enemy flash renders, knockback renders, and contact audio is separated.
- MAJOR audio: distinct local MP3 sword, hurt, pickup, door, secret, step, and telegraph cues are preloaded before the scene is released.
- MAJOR pause/settings: GGKit settings pause now has a themed in-game pause read and a visible `P: SETTINGS` affordance.
- MAJOR onboarding: action-gated element, landing, hazard, and combat-power tutorial steps are connected to real interactions.
- MAJOR layout: party cards and combat commands occupy separate vertical regions with aligned hitboxes.
- MAJOR animation: four directional sheets plus timed idle, walk, attack, cast, hurt, and victory frame handling.
- MAJOR Warden escalation: phase-specific arena glow, colors, intent language, banners, and FX at 70% and 35% HP.
- MINOR banner input: held and tapped gameplay input is ignored while an auto banner or transition is active.
- MINOR clear wording: the clear screen now tells the player to choose a new route instead of claiming tap-to-restart behavior.
- MINOR probe hygiene: `forceFloor` clears combat, pending node, confirmation, banner, and transition state before loading a floor.
- Service-worker cache version bumped to `aaa-f8-2`, with all new local MP3 cues precached.

Rejected:

- None. Every listed finding had a scoped code or asset fix.

## UI declutter

- Cut live center banners, always-on node labels, combat log, next-actor prose, role labels, floating result stacks, and the bottom text tagline.
- Shrunk active feedback into one queued edge chip/coach strip: live event holds are 1.0s, tutorial copy is one line with a short fade, and boundary banners remain only for floor clear/results.
- Folded repeated HUD words into compact mode/area headers, icon-led gil/time/glyph readouts, HP/ATB meters, ready markers, and a single nearby enemy telegraph chip.
- `node --check` passed for `game.js` and `sw.js`; the live 390x844 screenshot check was unavailable because no browser was available and local server binds are blocked here.

## Retina pass 2026-08-16

- Ratio record at portrait CSS 390x844 and DPR 3: before 1.00x from the design-size FIT backing store; after 3.00x expected from a 1170x2532 backing store. Live canvas measurement was unavailable.
- Recipe: `GGKit.hiDpi.factor(390, 844)`, dense FIT scale dimensions, `GGKit.renderDefaults`, and `setZoom(RETINA_FACTOR)` in Boot and Play.
- Factor cap: none. The factor is GGKit-clamped to the device maximum of 3.
- Could not capture the required DPR 3 gameplay screenshot or `canvas.width / getBoundingClientRect().width` measurement because no browser instance was available and the private port could not be opened in this environment.
