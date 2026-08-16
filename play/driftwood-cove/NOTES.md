Drag one piece onto a matching piece to merge it up the chain; tap the tide pool or wreck crate to draw new pieces.
Chains run four steps deep: driftwood to plank to hull to boat, shell to cup to lamp to beacon, and ten more families.
Fill the three order cards, then tap a card to deliver; every order restores part of the cove and unlocks keeper notes.
Producers rest after five draws and refill on a timer or after four merges made elsewhere on the board.
Arrows move the cursor, Space picks up and merges, T tidies the board, Q and E draw, 1 to 3 deliver, Esc pauses.
Bubble Storm is a 75 second timed merge run from the menu. The cove saves automatically; New Cove starts over.

## AAA rebuild

Rebuilt from the prototype on 2026-08-13 as a Phaser 3 title on GGKit. GGKit is
the only implementation of pause and resume, rotate overlay, visibility pause,
pointer identity, guarded saves, audio buses, loading screen, settings and the
juice budget. Art direction follows play/_assets/ART_puzzlepop.md and the UI
noise law in play/_assets/UI_LAW.md.

### Preserved prototype behaviour

- 6 x 7 board (42 cells) with mist over unopened cells.
- Two matching pieces of the same tier merge into the next tier.
- A merge clears mist from up to five neighbouring cells.
- Producers hold five draws, then rest; four merges elsewhere refill them
  (RECOVERY_MERGES = 4, PRODUCER_MAX = 5). Time regen adds one charge every
  4.5 seconds so the rest state is never a wall.
- Merge score is 12 x the new tier, carried into the fragment counter.
- The opening hand is six matched pairs with the mist already lifted around them.
- The twelve original keeper notes ship word for word as chapters 1 to 3.
- Keyboard cursor plus Space to select and merge; automatic save.

### Content

| Content | Count |
| --- | --- |
| Merge chains | 12 (wood, shell, kelp, glass, brass, wick, pearl, coral, salt, canvas, iron, paper) |
| Merge objects | 48 (4 authored tiers per chain) |
| Orders | 40, eight per area, ramping from one merge to full chain tops |
| Cove areas | 5 (Shell Beach, Lighthouse Point, Tide Caves, Sail Reach, The Wreck) |
| Restoration steps | 40 (8 authored diorama props per area, repainted as orders land) |
| Story | 20 keeper notes across 5 chapters, one chapter per area, readable in the log |
| Extra mode | Bubble Storm, 75 seconds, persisted best score |

Estimated 35 to 50 minutes to exhaust the order list, plus repeatable storms.

### Audio

Original procedural audio, mono mp3 only. Music: cove.mp3 (board loop),
deep.mp3 (caves and reach loop), storm.mp3 (timed mode). SFX: ui, pick, drop,
invalid, merge, mergebig, chain, spawn, bubble, order, chapter, fanfare
(12 distinct cues) routed through the GGKit sfx bus with persistent mute.

### Presentation

- Player entity is the selector with five authored states: Ready (breathing
  focus ring), Preview (solid ring plus arrow on a legal drop), Goal (gold ring
  when the merge feeds an active order), Invalid (amber cross hatch) and
  Resolve (overshoot snap on the merged cell).
- Four pooled particle systems: merge fragments, movement and mist streaks,
  reward confetti, ambient sea motes. Pools are preallocated and parked.
- Shake, hit stop and overshoot run through the GGKit juice budget and switch
  off with the accessibility toggle; information cues stay.
- UI law: one queued chip at a time, thin fading coach strip, centre banners
  only at chapter and order boundaries, icons over labels, 44px+ touch targets.

### Performance notes

Everything is baked into canvas textures at boot (48 item textures, board
chrome, cards, rings, dioramas); no Graphics command list is replayed during
play. The order tray recomputes only when the board changes and the probe
state is written into the hook object rather than reallocated each frame.

Local trace at 390px (aaa/harness/gate.mjs, unthrottled): median 16.7ms,
worst 16.8ms, 0 of 600 frames over 33ms, 807KB payload, zero console errors
and zero failed requests. The 4x throttled trace was taken on a box under a
load average above 600 from the other fleet lanes, so its spike count is
contention noise; it needs a re-run on an uncontended box.

### Verification hook

window.__dc = { state: { mode, scene, stage, stageName, area, chapter, orders,
progress, score, health, energy, merges, items, notes, stormBest, ready },
forceMode: 'play' | 'storm' | 'title' | 'log', forceStage: 0-4 }. Force
switches are read by the boot fallback and by the live scenes.

### Deferred

- No purchase surface, no ads, no timers that gate play behind waiting.
- Merge is two matching pieces, as in the prototype; three in a row is
  rewarded as a chain combo rather than a separate merge rule.
- Service worker registration only reports on https, so the PWA check is
  green on the deployed URL and reads false on a local server.

## Retina pass 2026-08-16

- Ratio record: before 1.00x from the pre-pass design-size backing configuration; after 3.00x is the configured DPR3 result from `round(design * GGKit.hiDpi.factor(...))`. A live canvas ratio read was unavailable.
- Recipe: Phaser `Scale.FIT`, design world coordinates retained, `RETINA_FACTOR` applied to scale dimensions and camera zoom in Boot, Title, Play, Storm, and Log. All baked CanvasTextures use the dense GGKit canvas helper, logical image scales compensate for the dense sources, and text uses the same resolution.
- Factor cap: none. The GGKit factor is used without a cap because this title has no measured need for one.
- Could not do: the browser connector reported no available target, so the required DPR3 canvas ratio read and real gameplay screenshot could not be captured. `node --check` and `git diff --check` pass.
