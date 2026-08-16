# Willowmere
Controls: tap to walk, tap anything to use it, drag furniture in Decorate mode; WASD/arrows to move, E/space to use, I bag, C bench, Esc back.
Loop: fish off the dock (tap on the bite, then tap when the marker is in the green), forage 21 nodes across summer/autumn and day/night, craft 12 recipes at the cottage bench, decorate with 16 furniture pieces.
Friends: 6 townsfolk keep daily routines and have gift tastes; 2 hearts opens story scene 1, 4 hearts opens scene 2, whose reward is furniture or a wall/floor style.
Win: all 6 stories seen lights the Lantern Festival ending, then play continues. No fail state, no currency, no timers; world auto-saves to localStorage.

## AAA rebuild

### Implemented

- Replaced the archived canvas runtime with Phaser 3 from `/play/_shared/` and GGKit as the sole lifecycle, pointer, keyboard, save, audio, settings, and juice layer.
- Added absolute shared-engine paths, the required base URL, portrait PWA metadata, root icons, generated MP3 audio, and a service worker precache containing only existing files.
- Baked four seasonal world textures before display objects are created. Added Lake Shore, Willow Grove, Terraced Farms, Old Mill, cottage yard, day/dusk/night lighting, rain, snow, breeze, ducks, seasonal dressing, and five music stems/tracks.
- Added tap-to-move with a bounded grid path, virtual thumb stick, context hand action, instant gathering and fishing, craft feedback, pooled spark and leaf particle emitters, GGKit shake and hitstop, and reduced-motion gating.
- Added cottage decoration mode with 16-cell snap, rotation, undo, drag placement, collision preview, safe door clearance, and persisted placements. Furniture collision never blocks player movement.
- Added `window.__wm.state` with mode, progress, score, health, stage, calendar, weather, friendship, placement and inventory probes, plus `forceMode`, `forceStage`, `forceMove`, `forceInteract`, `forceGather`, and `resetSave` hooks.
- Save normalization covers calendar, scene, player position, inventory, owned furniture, placements, rotation, harvest days, styles, request progress, every friendship tier, story flags, festivals, and stats.

### Content tables

| System | Authored content |
|---|---|
| Districts | Lake Shore, Willow Grove, Terraced Farms, Old Mill |
| Seasons | Spring / Rain Petal Walk, Summer / Sunlit Regatta, Autumn / Harvest Table, Winter / Lantern Festival |
| Villagers | Maple Thorne / honeycap, Bram Quill / silverfin, Oleander Vane / glowmoss, Tansy Ford / berry, Corvin Reed / driftwood, Juniper Ash / amberleaf, Mara Fen / sunmelon, Rue Bell / millgrain, Sol Alder / snowdrop, Pippa Wren / starberry |
| Gatherables | Reed, Driftwood, River Clay, Lakestone, Pinecone, Glowmoss, Honeycap, Dewberry, Amberleaf, Silverfin, Sunperch, Ribbonfish, Emberscale, Duskcarp, Lanternfish, Rain Petal, Clover, Sweet Pea, Sunmelon, Terrace Tomato, Blue Lavender, Maple Seed, Hazelnut, Cider Apple, Frost Plum, Snowdrop, Ice Fern, Starberry, Willow Floss, Mill Grain |
| Furniture 1-10 | Reed Mat, Driftwood Stool, Clay Lantern, Pine Shelf, Stone Hearth, Angler Trophy, Willow Table, Moss Rug, Amber Screen, Lake Mirror |
| Furniture 11-20 | Honey Lamp, Cozy Bedroll, Quilted Armchair, Harbor Wheel, Festival Garland, Starlit Banner, Willow Bench, Tea Table, Riverstone Stool, Mill Mantel |
| Furniture 21-30 | Reed Daybed, Lantern Cluster, Berry Basket, Porch Swing, Lake Quilt, Terrace Planter, Flower Trellis, Willow Fence, Mill Wheel Stand, Moon Shelf |
| Furniture 31-40 | Snow Window, Quilt Rack, Bird Bath, Duck Decoy, Herb Rack, Festival Table, Seed Cabinet, Clay Vase, Willow Arch, Star Map |

### Deferred

- `node --check` passed for the changed JavaScript and service worker, JSON parsing passed, and every service-worker asset path exists.
- The required visual first-frame and `__wm` mechanic smoke test could not run because no in-app browser was available and the sandbox refused binding the private port `48173`. No frame-rate or feel numbers were collected.
