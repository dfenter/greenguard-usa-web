# Wanderlight

Explore Aurelay, clear the eight vaults for their Lumen Shards, then climb Ashen Peak and unmake Sable to free Elowen.

Touch: drag the left side to move. Tap A to draw the blade. Tap B to use the selected item. PACK opens the inventory. PAUSE and SETTINGS stay clear of the playfield.

Keyboard: arrows or WASD move, Z or Space uses the blade, X uses the item, Enter opens PACK, Shift cycles items, M toggles sound.

The first journey teaches movement, the blade, and the B slot. The game saves validated progress through GGKit. The opening splash can be dismissed with A, Z, Enter, or a touch action.

## Development notes

### Retrofit boundary

Kept byte-honest from the archived prototype:

- `js/world.js`: the 54-screen overworld graph, generated screen rules, edge gates, raft routes, biome data, and start position.
- `js/dungeon.js`: all nine vault layouts, room flags, doors, boss graph, item gates, and dungeon minimap data.
- `js/entities.js`: Wren movement speed and collision inset, attack timing, projectile behavior, enemy AI, bosses, drop rules, hit points, knockback, and entity update behavior.
- `js/items.js`: item registry, collection gates, shop prices, potion behavior, equipment flags, caps, and item save fields.
- `js/game.js` sim portions: room loading, screen scrolling timing, cave graph, dungeon visits, combat glue, secret interactions, quest phase, and validated v1 to v2 save migration.

Replaced:

- `js/engine.js`: the old canvas loop and DOM controller became a fixed-step GGKit input bridge driven by Phaser.
- `js/tiles.js` and `js/sprites.js`: old canvas atlases and procedural draw calls became palette-shifted Phaser tilesheet presentation with authored frame families for Wren and enemies.
- `js/sound.js`: synthesized audio became lazy-loaded MP3 music and MP3 SFX through GGKit audio buses.
- `js/view.js`: new Phaser world layer, HUD, controls, tutorial, pause shell, camera shake, hit-stop accents, animation, and pooled VFX.
- `index.html`, `manifest.json`, and `sw.js`: new PWA shell, safe-area layout, install metadata, and offline cache.

### Content inventory

- 54 overworld screens across Aurelay.
- 8 shard vaults plus Sable's Crown, 9 dungeons total.
- 3 cave shop families, hidden roads, secrets, raft routes, gear gates, boss heart containers, and the final rescue sequence.
- Designed for more than 20 minutes of exploration and combat, with difficulty ramp from surface scouts to gated vault bosses.

### Audio inventory

- Music: `music-explore.mp3` is a 28-second loop cut for title, overworld, and ending; `music-dungeon.mp3` is a 19-second loop for vault and Sable sequences.
- SFX: sword, beam, hurt, enemy defeat, rupee, item, bomb, secret, stairs, whistle, select, text, death, and low-health beat.
- All shipped audio is mono MP3. Music remains lazy until the first interaction.

### Known limitations

- Kenney's curated tile sheets are used as a palette-shifted base vocabulary. Wren, enemies, HUD, VFX, and motion are original Phaser presentation work.
- The archived entities module still contains its legacy `draw` methods for parity and test compatibility. No shipped view calls them.
- The six-gate deployed URL run and before/after evidence capture remain orchestrator work.

## Fix round 1

### implemented

- Code: touch D-pad classification now accepts the visible control zone and keeps movement separate from A, B, and PACK action zones.
- Code: manual pause is a Phaser shell around GGKit pause/resume, with keyboard and touch-safe resume, settings, restart confirmation, and one-shot Enter handling.
- Code: PACK is a routed `pack` overlay and no longer pretends to be a second pause implementation.
- Code: restart clears the journey save and legacy migration key while retaining the best shard score.
- Code: journey saves use GGKit only, malformed GGKit data can fall back to a validated legacy record, and wren, world, room, item, edge, and counter IDs are schema-checked.
- Code: the authored overworld is bounded to 54 screens, with vaults 7, 8, and 9 relocated into the reachable 9 by 6 graph.
- Code: music requests are generation-guarded against stale decode completions, mute state comes from GGKit, and step and danger cues use registered MP3 assets.
- QA: every shipped MP3 is in the service-worker precache, LICENSES.md has extension-accurate MP3 provenance, and the cache version is bumped.
- QA: active title and enemy identifiers are original Aurelay names, with legacy migration strings isolated from live content IDs.
- Feel: hit-stop and camera shake are now consumed by the view, entity and FX sprites are pooled, screen refreshes are versioned, and per-frame geometry allocation and synchronous layout work were removed from the simulation loop.
- Art: authored town and dungeon atlas frames now carry palette shifts, contextual water and edge treatment, animated water detail, phase-offset foliage and landmark motion, torch glow, dungeon darkness, actor animation, item animation, and transition layers.
- Art: pooled hit, defeat, pickup, dust, impact, secret, boss, ambient, and projectile effects replace the old flat procedural presentation.
- UX: the opening has one branded splash, the GGKit loader is themed in the page shell, the tutorial teaches movement, blade, and B-slot actions by doing, and PACK and PAUSED states have distinct readable panels.
- UX: the two-row HUD, monospace type system, camera crop and 3x small-screen treatment keep the playfield and controls legible at phone width.
- UX: the view is read-only over simulation state, and the archived canvas renderer is no longer on the shipped render path.
- Minor: the unreachable C continuation shortcut was removed from the contract because boot already resumes validated progress automatically.

### disputed

- None. The reported findings were treated as actionable or recorded below when external evidence could not be produced inside the work boundary.

### deferred

- The 4x CPU-throttle 600-frame trace and deployed six-gate HTTPS evidence remain pending because this fix round forbids deploy and the local in-app browser was unavailable. Static checks, headless world checks, save migration checks, and syntax checks passed.
- LEDGER.md usage-status rows remain pending because that file is outside the permitted Wanderlight and LICENSES.md scope. Every shipped file has source and license entries here.
- Same-frame fast-tap preservation remains pending because it requires changing GGKit pointer edge retention, which is outside the permitted shared-runtime scope.
