Controls: P1 uses WASD, F, G, and H. P2 uses the arrow keys, Enter, slash, and period. Gamepads 0 and 1 are supported.
Loop: enter three authored chambers, pair left and right sigils inside a sync window, read the vault guardian, then choose and split treasure.
Save: GGKit stores a versioned active run with chamber, puzzle, guardian, recovery, player health, score, and treasure state.
Audio: all music and cues are registered and played through GGKit using local MP3 files only.
Assets: procedural original art is drawn in Phaser. Shipped audio and icons remain in the local assets directory.

## Fix round 1

### Fixed

- Critical 1: replaced the spin, build, and bot loop with a lobby, three co-op chambers, synchronized puzzles, a telegraphed guardian, and a vault payout flow.
- Critical 2: added independent P1 and P2 keyboard contexts, pointer-side routing, gamepad 0 and 1 polling, and controller disconnect fallback messaging.
- Critical 3: added per-player puzzle contributions, shared sync progress, timed failure and reset, chamber gates, and unlock effects.
- Critical 4: added guardian phases, ring and beam telegraphs, damage windows, health, downed states, revive interaction, dash invulnerability, and recovery pickups.
- Critical 5: added per-player puzzle, combat, treasure, and total score ledgers plus an explicit cache choice and payout split.
- Critical 6: added authored procedural chamber architecture, player silhouettes, a guardian silhouette, vault chests, material layers, lighting shapes, and landmark art.
- Critical 7: added idle motion, attack and hit bursts, guardian telegraph and defeat effects, puzzle unlock rings, recovery sparks, and treasure reveal cues.
- Major 1: the lobby and visible control legend teach both players, the shared objective, puzzle roles, health, and the first-chamber interaction before play.
- Major 2: difficulty now drives puzzle rounds, guardian health, attack cadence, and vulnerability windows across the four rung bands.
- Major 3: removed the disconnected diagonal raid route system and replaced it with authored orthogonal chamber paths and a readable guardian arena.
- Major 4: replaced the marked-node raid with complementary left and right sigil actions, a shared timing window, partial role ownership, and meaningful reset feedback.
- Major 5: active runs persist through GGKit with a versioned schema, including transition, chamber, puzzle, guardian, recovery, player, inventory, and score state.
- Major 6: health, guardian health, recovery, dash cooldown, chamber keys, and both player scores are visible and have active gameplay purposes.
- Major 7: puzzle and guardian rules are posted at their action points, including the sync window, required roles, telegraph reads, and damage window.
- Major 8: expanded the GGKit audio registry to music, puzzle, unlock, attack, hit, guardian telegraph, guardian damage, down, recovery, victory, treasure, and selection events using MP3-only assets.
- Major 9: removed Phaser pointer callbacks. Touch actions are read from GGKit pointer identities and dispatched through the scene hit-zone layer.
- Minor 1: chamber sigil status is drawn after the room architecture, so active state and unlock rings remain visible.
- Minor 2: removed the no-op raid footer. Touch gameplay zones now perform an interaction, attack, dash, treasure choice, or treasure claim.
- Minor 3: normalized the fleet identifier to F3 in the service-worker version and the game metadata.
- Minor 4: added a visible HTML co-op control legend and retained an aria-live status channel for screen-reader updates.
- PWA registration remains routed through GGKit, and `sw.js` VERSION is bumped to `aaa-f3-20260810-2`.

### Rejected

- None. All listed findings were actionable in this codebase and were addressed.

### Verification

- `node --check game.js`
- `node --check sw.js`
- JSON manifest parse
- MP3-only audio inventory and shipped-file size audit
- Mock boot and gameplay smoke passed menu, synchronized puzzle, guardian damage, and treasure claims.
- Payload audit: 80,562 bytes total, with every shipped file below 400 KB.

## Retina pass 2026-08-16

- Measured before ratio: unavailable for this title in this environment. Fleet baseline was 1.00x for 62 titles, with the remainder from 1.10x to 2.46x.
- Measured after ratio: unavailable because no browser backend was exposed. The helper path targets 3.00x at DPR 3, but that is not a captured measurement.
- Recipe: Phaser `Scale.RESIZE`; initial sizing, resize, orientation change, and visibility change all call `GGKit.hiDpi.resize`.
- Factor cap: none; the GGKit DPR cap of 3 applies. No title-specific cap was justified.
- Could not do: DPR 3 backing-store read or gameplay screenshot. Browser discovery returned no browser, and local HTTP port binding was denied.

## Retina repair 2026-08-16

Two defects, both from the hi-DPI pass, verified in headless Chrome at
deviceScaleFactor 3 on a 390 x 844 portrait viewport.

**Defect 1 — boot throw.** `ReferenceError: pads is not defined`, thrown from
`PlayScene.pollGamepads` on the first frame and every frame after. It unwound
through `update()`, so `paint()` never ran and the page rendered as one flat
colour (boot sweep: `colors=1`, `lit=100%`).
Root cause: the gamepad snapshot line was lost, leaving the loop body reading
an identifier that was never declared. Fix: restore
`var pads = root.navigator.getGamepads() || [];` at the top of the loop, after
the existing capability guard.

**Defect 2 — density never took effect.** Measured 1.00x at DPR 3 even though
`GGKit.hiDpi.resize` was being called correctly.
Root cause: the title is `Scale.RESIZE` with a real parent element (`#game`).
Phaser's ScaleManager polls the parent every 500 ms (`resizeInterval`), and in
RESIZE mode `updateScale()` re-derives `gameSize` and `canvas.width` from the
parent's CSS box. Every dense resize was silently reverted within half a
second, pinning the backing store at the CSS size. RESIZE cannot hold a dense
backing store while a parent element is set; the eight titles the recipe did
work for have no parent element, so their poll never runs.
Fix: `Scale.NONE` with `zoom: 1 / GGKit.hiDpi.dpr()`. `NONE` leaves the
backing store where `GGKit.hiDpi.resize` put it and compensates in CSS via
zoom, which is the shape `GGKit.hiDpi.phaser()` documents. World coordinates
stay in device pixels either way, and `layoutScene()` already derives its
letterbox from `this.scale.width/height`, so no art moved.
`resizeGame()` now sizes from the `#game` host element instead of
`window.innerWidth/innerHeight`: the control legend owns the rest of the
viewport, so a window-sized canvas overflowed behind it.

**Also fixed (input, required by the live gate).** `pointerLocal()` stretched
the whole canvas box onto `0..W / 0..H`, ignoring the letterbox that
`layoutScene()` applies (`layout.x/y`, `layout.k`). The canvas is not the
720 x 960 design aspect, so every tap landed in the wrong place and no button
or zone could be hit. It now inverts the same transform. Verified: a tap on
START RAID moves `state.mode` menu -> chamber, WASD moves P1, and interact
returns a live puzzle notice.

**Measured density ratio: 3.00** (`canvas.width` 1170 / `getBoundingClientRect().width`
390) at deviceScaleFactor 3. No factor cap was needed.

Gates, all run by this lane: `boot_sweep` PASS (err=0, 404=0, colors=437,
exact8=4028), `retina_audit` RET-OK (dpr=3, colours=5541, flattest 52.1%),
`live_probe` PASS (rAF alive, err=0). `live_probe` reports its "frame never
changed" warning for this title because its blind taps are zero-duration mouse
clicks: the kit deletes a pointer on release, so a down and up inside one frame
is never seen. A held 250 ms tap starts a raid correctly, checked by hand.

`node --check` clean on `game.js`. No design, balance or content changes.
