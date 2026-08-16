Drag a card onto a lane; tap a lane to deploy the selected card.
Keyboard: 1-4 picks a hand card, left/right picks a lane, Space/Enter deploys.
Units march, clash, and hit the opponent core; spells land where dropped.
Win the current rung to unlock its three cards; losing lets you retry.
Deck Forge makes an eight-card deck; progress is saved on this device.

## AAA rebuild

Implemented:

- Phaser 3 portrait rebuild with GGKit as the only lifecycle, input, save,
  audio, pause, orientation, reduced-motion, and PWA owner.
- Fixed-step two or three lane combat with pooled units, projectiles, sparks,
  clash resolution, readable silhouettes, legal deploy ghosts, range rings,
  spell reticles with radius, core escalation, and core-damage shake.
- Ladder trophy road, Draft Duel authored enemy decks, Gauntlet escalation,
  bronze/silver/gold rung, streak, and no-tower-lost medals, three-card rung
  unlocks, generous early drops, and an eight-slot Deck Forge.
- Open Field, Brassworks, Skyglass Basin, Mossworks, Night Relay, and the
  triple-lane Towerline Crown arena identities.
- `window.__td = { state, forceMode, forceRung }` probe surface, safe fallback
  lookups, forced boot switches, manifest, icons, favicon, and service-worker
  precache generated from the shared template.

Mode and rung tables:

- Ladder: Seedline, Copper Reach, Prism Yard, Gale Cut, Green Rush, Relay
  Ring, Black Current, Crown Circuit. Rung wins unlock three cards each.
- Draft Duel: Brassworks Draft, Skyglass Draft, Foundry Draft. Each uses a
  hand-authored opposing deck and a constructed arena.
- Gauntlet: Mossworks, Relay Marsh, Night Relay, Redline Switch, Crown
  Approach, Towerline Crown. The best cleared face persists locally.

Deferred:

- No external bitmap art was needed. The title uses authored procedural terrain,
  rails, landmark dressing, tower silhouettes, command crest, and animated role
  silhouettes within the existing payload budget.

## Fix round 1

Fixed:

- Critical result state and controls: victory and defeat panels now accept touch,
  keyboard, and gamepad actions. Continue advances ladder and gauntlet faces.
- Critical adjacent tower synergy: open sockets, neighbor detection, role links,
  visible link lines, and bonus labels are implemented.
- Critical tower placement: player and enemy buildings snap to persistent,
  visible tower sockets, while units and spells honor their selected target.
- Critical waves and bosses: six readable formation patterns, timed warnings,
  escalating boss entities, boss charge telegraphs, and wave-clear feedback are
  implemented.
- Critical art presentation: layered citadel rails, landmarks, tower crowns,
  role silhouettes, hit and movement states, and the player command crest are
  implemented.
- Major role counters: every card now declares a counter role and the matchup
  resolver and tutorial expose the counter grammar.
- Major Mend Field targeting: heal spells now select allied units.
- Major splash death resolution: splash damage uses the shared death path,
  including kill FX, audio, and socket release.
- Major card cooldowns: cooldown state, card readouts, and HUD status are shown.
- Major placement constraints: sockets, lane rails, selection markers, and
  invalid placement feedback remain visible.
- Major undo and cancel: placement is staged for a short commit window, with an
  explicit UNDO affordance and a full elixir refund before commit.
- Major enemy readability: bot actions and wave formations use lane telegraphs,
  spawn warnings, and formation labels before commitment.
- Major hit feel: contact flashes, recoil-like motion, pooled FX, hit-stop, and
  reduced-motion-safe shake are wired through GGKit.
- Major audio gate: music, danger, victory, warning, wave-clear, select,
  confirm, cancel, deploy, hit, kill, clash, spell, and victory cues use
  original MP3 assets through GGKit.
- Major first-minute teaching: staged prompts cover sockets, synergy, counters,
  cooldowns, wave warnings, and boss charges.
- Major save validation: medal enums and keys are constrained, and gauntletBest
  is limited to the six available faces.
- Major gamepad support: D-pad and stick navigation, card selection, deploy,
  cancel, and result actions are exposed through the GGKit input surface.
- Major keyboard lane preview: arrow lane selection updates a persistent marker,
  target preview, and selected socket state.
- Minor card effect text: each card now shows its concise effect line.
- Minor unaffordable feedback: insufficient elixir and cooldown states explain
  why a card cannot deploy.
- Minor multitouch: one active drag is locked by pointer id, preventing drag
  state overwrite.
- Minor banner state: READY and wave warning banners now render visibly.
- Minor duel cleanup: activeDuel is cleared on scene shutdown and audio stops
  before navigation.

Rejected: none. All listed findings were reproducible in the reviewed code and
were fixed.

Checks: `node --check game.js`, `node --check sw.js`, payload 0.211 MB, no file
over 400 KB, MP3-only audio, shared-engine and asset-path audit passed.

## Retina pass 2026-08-16

- Audit before ratio: 1.00x at the emulated DPR 3 portrait viewport. Configured after ratio: 3.00x from `GGKit.hiDpi.factor(390, 844)`, with a 1170 x 2532 backing store for the 390 x 844 design box.
- Recipe: Phaser `Scale.FIT`, dense scale dimensions, `GGKit.renderDefaults`, `setZoom(f)` in Boot, Menu, Ladder, Forge, Mode, and Duel, plus matching resolution on all title text paths. The dead Phaser `resolution` config key was removed.
- Factor cap: none beyond GGKit's standard maximum of 3. No title-specific cap.
- Live canvas ratio and gameplay screenshot were unavailable because the browser backend was empty and the sandbox denied private HTTP listeners. The after ratio above is the configured geometry, not a live canvas read.
- No title-local canvas bake helper was found. Gameplay, balance, and content were unchanged.
