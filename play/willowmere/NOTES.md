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

## Boot repair

Verified headless on Chrome at 390x844 DPR2 from a private static server (ports
8931-8935), driving the title through `window.__wm`. No frame-rate or feel
numbers were taken; the box is contended and has no GPU.

Six defects, all in `js/willowmere.js`.

1. **`kit.register(...)` did not exist (fixed before this pass).** The audio map
   was registered through a method GGKit does not expose. The registry is
   `kit.audio.register(map)`; `kit.registerPWA()` on the following line is a
   real GGKit method and was correct. Confirmed against `play/_shared/ggkit.js`
   (`register(map)` lives on the audio namespace, line ~181).

2. **`g.strokeLineBetween(...)` is not a Phaser method.** Six call sites: the
   terrace crop rows and mill-wheel spokes in `bakeWorld`, the rain streaks in
   `renderWeather`, and three HUD/panel divider rules. `g` was a genuine
   `Phaser.GameObjects.Graphics` in every case, so the object was right and the
   *name* was wrong: Phaser 3.87 spells it `lineBetween`. The throw landed
   inside `bakeWorld`, so all four seasonal world textures aborted half-drawn
   and the scene never finished `create()` — that is the 96-colour frame.
   Fixed by renaming all six to `lineBetween`.

3. **`g.translate` / `g.rotate` are not Phaser methods.** `drawFurniture` used
   the raw canvas 2D names. Phaser Graphics spells these `translateCanvas` and
   `rotateCanvas` (`save`/`restore` were already correct). This threw on the
   first frame that drew a placed or ghosted piece, which killed `update()` for
   the whole cottage and decorate loop. Fixed to `translateCanvas` /
   `rotateCanvas`.

4. **The UI layer scrolled with the world.** `uiG`, the 72 pooled `uiTexts` and
   the five HUD icons are all authored in screen space (0..390, 0..844) but were
   created without `setScrollFactor(0)`. As soon as the camera left the origin
   the top bar, the stick, the action button and every panel slid off screen —
   the first playable frame showed the bottom bar floating in mid-map. Fixed by
   pinning the whole UI layer to the camera.

5. **The Menu panel's buttons were unclickable.** `drawMenu` draws Sound /
   Settings / Back at y 316, 386 and 456, but `hitButton` and `panelTap` tested
   y 280, 350 and 420 — a 36 px offset, so only a 20 px sliver of each button
   responded. Hit rects moved onto the drawn rects.

6. **Two render-state leaks reachable from the `__wm` hook.**
   - `performAction({type:'cottage'})` resets the camera, but the `forceMode`
     bridge path sets `scene='cottage'` without it, so the interior drew clipped
     at the stale world scroll. `renderWorld` now snaps the camera to the origin
     on any indoor frame.
   - `renderWeather` only runs outdoors and the weather Graphics was never
     cleared on the way in, so the last outdoor frame of rain or snow stayed
     frozen over the cottage. `renderWorld` now clears it indoors.

Also fixed while proving the HUD: `districtAt` returned `DISTRICTS[0]` for any
point outside every rectangle. Willow Grove only spans the west half of its
band, so the cottage side — including the default spawn at (390, 560) — fell in
the gap and the HUD read "Lake Shore" while you stood in the grove. The fallback
now picks the nearest district by rectangle distance. No district bounds, art,
balance or content changed.

### Verification

- `node --check js/willowmere.js` clean.
- `boot_sweep.mjs willowmere`: PASS, 0 console errors, 0 page errors, 0 failed
  requests, 634 colours on the title card, 100% lit.
- Driven session, 0 errors end to end: walk (`__wm.forceMove(300,700)` moved the
  player 390,560 -> 300,690 over 109 movement ticks and panned the camera),
  gather (`__wm.forceGather()` -> `inv {} -> {reed:1}`, `stats.gather 0 -> 1`),
  craft (`craft(0)` -> `owned {} -> {mat:1}`, `stats.craft 0 -> 1`, reed spent
  9 -> 6), decoration placement (decorate mode, ghost validated, drop accepted:
  `placements 0 -> 1` = `{id:'mat', x:224, y:416, rot:0}`, persisted through a
  return to the world).
- Every mode rendered without error: title, play, bag, craft, gift, dialog,
  menu, festival, decorate, cottage. Menu hit-testing now returns
  sound/settings/close for the three drawn buttons and Back returns to play.
- Colour depth is in line with the fleet on this harness: peers measured the
  same way score 123 (driftlands), 137 (frosthold), 200 (aetherfall), 221
  (galecrests), 333 (blockborough), 447 (fieldnotes-safari), 703
  (driftwood-cove), 833 (lantern-bingo), 851 (harvest-junction), 1095
  (curbside), 1660 (crestfall). Willowmere is 634 on the title card and
  1150-1400 in play.

## Retina completion

- **Measured, not expected.** Release gate at deviceScaleFactor 3, run serially at concurrency 1 from `ue-port-studio/aaa/harness` against a private local server: `node release_gate.mjs http://localhost:8791 1 willowmere`.
- Gate verdict: **READY**. Measured `canvas.width / getBoundingClientRect().width` = **3.00x** (gate floor 2.85), sampled late by the gate, well after the point where a RESIZE parent poll would have reverted it. Backing store 1170x2532 in a 390x844 CSS box.
- Real gameplay frame: **7769 distinct colours** (8-bit), flattest colour 21.3% of the frame. The frame was compared side by side against the same interaction at deviceScaleFactor 1: layout, spacing and art are pixel-proportional, only the sampling is denser.
- Recipe: `Scale.FIT` with a fixed 390x844 design box; `scale.width/height` raised by `GGKit.hiDpi.factor(390, 844)` and the camera zoomed to match. Two things this scrolling title needed that a static FIT title does not:
  1. **Camera origin moved to (0,0).** Willowmere scrolls a 780x1380 world and pins its whole UI layer with `setScrollFactor(0)`. Under Phaser's default centred camera origin, a zoomed camera places every scrollFactor-0 object at `(pos - width/2) * zoom`, i.e. far off screen. With origin 0 the transform is a plain `(pos - scroll) * zoom`, so both the world scroll and the pinned HUD land exactly where they did at 1x and no `setScroll` call needed rewriting.
  2. **`setBounds` dropped.** `Camera.clampX/clampY` compute their range as `bounds.x + (displayWidth - width) / 2`, which assumes the centred origin; on an origin-(0,0) zoomed camera that clamp is off by half a viewport and shoves the playfield off screen with no console error. Nothing is lost, because every `setScroll` in this file already clamps itself to `[0, WORLD_W - VW]` and `[0, WORLD_H - VH]`.
- Baked art: `makeTexture()` takes an optional density. The seven 48x48 icons and the 390x700 cottage interior are baked at RETINA (the cottage image got an explicit `setDisplaySize(390, 700)` to match).
- **Deliberately left at 1x: the four 780x1380 seasonal world backdrops.** At RETINA 3 each would be 2340x4140, which exceeds the 4096 maximum texture size on a large share of mobile GPUs, and four of them would cost roughly 155MB of texture memory. They stay at their shipped size. Everything drawn over them (player, NPCs, weather, the live `dyn`/`weather`/`uiG` graphics layers, all text and all icons) is now native, so the scene reads sharp; the ground plane itself is the one element that is still resampled. Flagged here rather than left silent.
- Text `resolution` moved from a hard-coded 2 to RETINA. `source.resolution` was not used anywhere: it only affects the CANVAS renderer and would draw quads RETINA times too large under WebGL.
