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
