WASD / arrows or gamepad left stick move. Mouse, touch right stick, or gamepad right stick aims independently. Space, gamepad A, or FIRE shoots.
Q/E swaps quickly, R reloads, T toggles auto-aim assist, M toggles Speed Run.
Touch: drag the left stick to move, drag the right stick to aim, hold FIRE, and tap a weapon chip.
Collect keycards to unlock readable color-coded doors, clear each room, take generous drops, and reach the lift.
The first run teaches move, aim, swap, and keycard flow in a thin top strip. Settings include sound and reduced motion.
Progress, floor medals, best times, accuracy, and the unlock chain persist locally through GGKit.

## AAA rebuild

Implemented: Phaser 3 portrait corridor shooter rebuilt around GGKit lifecycle, pointer identity, save validation, audio buses, pause, settings, reduced-motion gating, PWA registration, fixed-step simulation, bounded entity and VFX pools, independent twin-stick aim, auto-aim assist, three weapon loadout with recoil, spread, reloads, Q/E swap, keycard doors, cover-seeking and flanking AI, generous room drops, vent shortcuts, floor banners, unlock lighting, authored floor families, Speed Run par times, medal records, first-run coach strip, and the `window.__dp` boot/live verification hook. Original vector operator art has idle, move, and fire states with muzzle, impact, ring, lighting, and boss phase VFX.

Floor/room tables: F1 Server Block [Intake, Auth Node, Archive, Firewall, Uplink], F2 Reactor Ring [Coil Entry, Pump Hall, Core Ring, Meltdown, Lift Chamber], F3 Cargo Hold [Dock Seven, Stack Alpha, Manifest, Stack Omega, Flight Deck], F4 Command Spire [Lower Gate, Signal Deck, War Room, Crown Stairs, Command Lift], F5 The Vault [Seal Gate, Relic Stack, Black Chapel, Sentinel Lock, Vault Heart]. Every family has a pacing table, ambush room, signature room, and a discoverable vent shortcut. F5 ends with the three-phase Sentinel.

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
- MAJOR arcade FX. Added six bounded particle systems, death actors, distinct particle shapes, and pooled eviction for transient FX.
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
