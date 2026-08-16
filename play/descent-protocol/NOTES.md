WASD / arrows or gamepad left stick move. Mouse, touch right stick, or gamepad right stick aims independently. Space, gamepad A, or FIRE shoots.
Q/E swaps quickly, R reloads, T toggles auto-aim assist, M toggles Speed Run.
Touch: drag the left stick to move, drag the right stick to aim, hold FIRE, and tap a weapon chip.
Collect keycards to unlock readable color-coded doors, clear each room, choose deliberate drops, and reach the lift.
The first run teaches move, aim, swap, and keycard flow in a thin top strip. Settings include sound and reduced motion.
Progress, floor medals, best times, accuracy, and the unlock chain persist locally through GGKit.

## AAA rebuild

Implemented: Phaser 3 portrait corridor shooter rebuilt around GGKit lifecycle, pointer identity, save validation, audio buses, pause, settings, reduced-motion gating, PWA registration, fixed-step simulation, bounded entity and VFX pools, independent twin-stick aim, auto-aim assist, three weapon loadout with recoil, spread, reloads, Q/E swap, keycard doors, cover-seeking and flanking AI, generous room drops, vent shortcuts, floor banners, unlock lighting, authored floor families, Speed Run par times, medal records, first-run coach strip, and the `window.__dp` boot/live verification hook. Original vector operator art has idle, move, and fire states with muzzle, impact, ring, lighting, and boss phase VFX.

Floor/room tables: F1 Server Block [Intake, Auth Node, Archive, Firewall, Uplink], F2 Reactor Ring [Coil Entry, Pump Hall, Core Ring, Meltdown, Lift Chamber], F3 Cargo Hold [Dock Seven, Stack Alpha, Manifest, Stack Omega, Flight Deck], F4 Command Spire [Lower Gate, Signal Deck, War Room, Crown Stairs, Command Lift], F5 The Vault [Seal Gate, Relic Stack, Black Chapel, Sentinel Lock, Vault Heart], F6 Cryo Array [Frost Intake, Coil Vault, Ice Lock, Thaw Chamber, Cryo Lift], F7 Biolab Ring [Decon, Culture, Observatory, Gene Bank, Airlock], F8 Blacksite [Checkpoint, Signal Black, Evidence, Ghost Floor, Extraction], F9 Reactor Core [Outer Ring, Fuel Bridge, Control Well, Meltdown, Sentinel Core]. Every family has a pacing table, authored identity, security cameras, lockdown gates, and a discoverable vent shortcut. F9 ends with the three-phase Sentinel.

The shipped visual and audio surface uses original local vector art, original procedural MP3 cues, and no external title assets or network dependencies. A real browser smoke test could not run because this sandbox had no browser instance and denied a local HTTP listener; `node --check`, precache/file validation, and the Phaser/GGKit mock boot plus live force-floor/force-room simulation passed.

## Fix round 1

Fixed:

- CRITICAL primitive-only presentation. Added original local SVG art for the operator, enemies, pickups, room panels, cover, doors, cards, lift, vent, and floor, with player animation frames and textured character rendering.
- MAJOR save validation. Save maps now require non-array record objects before completion data is read.
- MAJOR pause input. Scene-owned pointer IDs, axes, aim state, and fire state clear with GGKit pause.
- MAJOR touch hit regions. Fire, weapon chips, movement, and aim now use disjoint zones.
- MAJOR right-stick aiming. Touch aim stores stick-relative vectors while mouse aim remains screen-relative.
- MAJOR gamepad controls. Phaser gamepad polling now maps twin sticks, fire, swap, reload, and restart.
- MAJOR keyboard restart. Enter and Numpad Enter restart dead and victory states.
- MAJOR fresh restart. Run timers, floor counters, weapon mods, tutorial state, and input edges reset.
- MAJOR lift progression. Every room must be cleared before the lift activates, including vent routes.
- MAJOR persisted progression. End cards surface medals and best times, and unlocked floors can be selected by touch or number keys.
- MAJOR floor sameness. Families now have distinct room dimensions, corridor widths, hazards, and mechanic callouts.
- MAJOR onboarding. The first room stages movement, a scout, firing, weapon swap, and the first card with success-gated prompts.
- MAJOR arcade FX. Added seven bounded particle systems, death actors, distinct particle shapes, and pooled eviction for transient FX.
- MAJOR character animation. Enemies now expose idle, move, attack, hit, telegraph, and death states; the operator has idle, move, and fire art.
- MAJOR damage feedback. Added a timed red screen-edge vignette pulse.
- MAJOR audio. Added reload, pickup, warning, room-clear, victory, and danger-intensity cues, with GGKit music crossfade for intensity.
- MAJOR PWA caching. Added root `/play/` service-worker registration and precached all new local art and audio plus shared runtime files.
- MAJOR boss readability. Boss attacks now telegraph with warning audio, rings, radial rays, and pre-fire timing.
- MAJOR Speed Run. Speed mode now disables auto-aim and uses a 75 percent par target.
- MINOR banners. Banners now slide in before settling and fading.
- MINOR pool exhaustion. Player fire fails without consuming ammo when the projectile pool cannot fit the pattern; transient pools evict their oldest entry.
- MINOR pointer identity. Pointer ID fallback is normalized for claim, move, and release.
- MINOR readiness. `__DP_READY` is set after scene creation and floor load.
- MINOR spawn readability. Enemy spawn attempts reject cover-overlapping positions.

Rejected findings: none.

## UI declutter

- Cut the live title/floor-name watermark, room-name labels, persistent mechanic copy, generic play prompt, world popups, and routine center banners.
- Shrunk active HUD to compact floor/room/cards, score/time, weapon/ammo, mode/aim, and health/armor meters; kept floor identity at the boundary and score/medals on the results screen.
- Moved pickup, card, room, vent, boss-phase, and mode feedback into one queued top-edge chip with a one-second hold; kept the tutorial as one thin, reduced-motion-aware strip that fades after about three seconds.

## Round 2 polish

Visual and FX:

- Baked the corridor grid, room chrome, gradients, and area identity into a per-floor texture so static geometry is not replayed by Phaser Graphics every frame.
- Added pooled dynamic light cones for the operator and cameras, hand-tessellated muzzle flash cones, cover shadow occlusion, alarm tinting, animated camera lenses, and red lockdown treatment.
- Added sliding airlock door motion with keycard color, lock bars, cross-seal animation, and lockdown closure; cards now unlock only after the preceding room is clear.
- Added enemy anticipation, attack, recovery, patrol, alert, hit, and death motion accents, player fire recovery, stealth shimmer, coolant splash particles, spark trails, and reward celebrations that scale by beat. Reduced motion gates particle counts, cone tessellation, shake, hit-stop, and celebration scale through GGKit juice settings.

Gameplay:

- Expanded the campaign from five to nine authored facility floors. Reactor Core is now the final boss floor and keeps the three-phase Sentinel finale.
- Added patrol, hunter, and swarm enemy behaviors alongside the existing turret, flanker, gunner, bruiser, and scout roles. Patrols route, hunters pressure cover, and swarms orbit and collapse on the operator.
- Added five security cameras per floor with scan cones, line-of-sight detection, alarm accumulation, stealth in cover or discovered vents, camera disabling, and a real lockdown state that closes doors until the alarm clears.
- Tightened the weapon economy. Ammo pickups refill only the currently equipped weapon and starting reserves are lower, making weapon swaps and room-drop choices matter while preserving Q/E, R, touch chips, and gamepad controls.
- Kept one transient UI element at a time. Live alarm and stealth state use compact HUD marks; the nine-floor selector is reserved for the animated run-end card.

Save and ship notes:

- Bumped the save schema from v3 to v4. v3 records migrate into the new fields for cards, camera disables, stealth clears, weapon unlock flags, alarm record, and completed runs. Invalid or malformed records fall back to a fresh profile through GGKit validation without throwing.
- Registered pointer claims through window-level listeners added after GGKit initialization. The Phaser canvas no longer claims pointer identity on pointerdown.
- Bumped `sw.js` to `2026.08.16.1`; its 40-entry precache list was checked against the files that exist. No new external or hotlinked assets were added. The title payload is about 299 KB and `game.js` is about 124 KB.
- Verified `node --check` for `game.js` and `sw.js`, diff whitespace, precache targets, a mock GGKit/Phaser boot through `__DP_READY`, a forced floor-9 render pass, camera and lockdown behavior, pooled FX, and the first-frame scene path.

Deferred:

- Live browser screenshot and 4x CPU frame capture remain deferred because this session had no connected browser instance. No deploy or production verification was performed, per lane scope.

## Retina pass 2026-08-16

- Before ratio: 1.00x source baseline at DPR 3. After ratio: 3.00x configured
  through `GGKit.hiDpi.resize(game, cssW, cssH)`; a live canvas ratio could
  not be measured because Chrome aborted in this sandbox and the private HTTP
  bind was denied.
- Recipe: applied Phaser Scale.RESIZE hi-DPI sizing at boot, resize,
  orientation-change, and visibility events. Applied `GGKit.renderDefaults`
  and `resolution: GGKit.hiDpi.dpr()` to system text.
- Factor cap: none beyond the GGKit maximum of 3. No title-specific cap was
  needed.
- Could not complete the live DPR 3 gameplay screenshot or layout check.
  The authored static chrome bake was left at its logical size because a
  frame-unit migration to `GGKit.hiDpi.canvas(...)` could not be live-verified.
