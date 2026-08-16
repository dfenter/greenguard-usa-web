Driftlands is a seeded island adventure with three hidden five-room gauntlets and a final ruin boss.
Move with the left stick or WASD / arrow keys; press ACTION or Space / Enter to slash, open, and enter.
Find relic chests to raise sword power, max hearts, and movement speed, then return to the sealed ruin.
Enemies can drop hearts; death respawns at camp with gear intact, and progress autosaves in localStorage.
The minimap reveals as you roam; defeat the tide-heart to win and use the end-screen button to restart.

## Fix round 1

Sources: reviews/findings/driftlands_code.md, _qa.md, _art.md, plus the two
carry-ins (feel_no_spikes, missing LICENSES.md). A previous implementer lane
for this title was killed mid-run, so a large share of the round was already
on disk; every item below was re-read against the current code and is either
verified as already correct or was completed in this pass. Items completed in
this pass are marked NEW.

### Implemented

Code review

1. Reset undone by shutdown autosave -> `resetIsland()` sets a one-shot
   `noSave` flag, clears the save, removes the `pagehide` listener and only
   then starts the title; `saveNow()` returns early while `noSave` is set, so
   neither the shutdown nor the pagehide write can resurrect the old island.
   (game.js `resetIsland`, `saveNow`, `create`)
2. Re-entrant dungeon transition -> all scene changes go through
   `transition()`, which refuses re-entry while `transitioning` is true,
   clears it on `camerafadeincomplete` with a 700 ms delayed-call safety net,
   and `tryAction()` returns early while the guard is up.
3. Pre-tutorial saves discarded -> the title computes `hasRun = !!W.validate(saved)`,
   so any valid save shows CONTINUE DRIFT; `fresh: true` is now reachable only
   from NEW ISLAND / ABANDON ISLAND.
4. Incomplete save validation -> `world.js validate()` deep-checks the version,
   an integer seed in range, integer gear levels 0..4, strict three/three/twelve
   boolean arrays for relics, keys and sigils, a fog string that is empty or
   exactly 4096 characters of '0'/'1', finite bounded score, best and elapsed,
   and strict booleans for `taught` and `won`.
5. HUD does not relayout on resize -> HUD objects are built once in `make2()`
   and placed in `layout()`, which is bound to the Phaser scale `resize` event
   and recomputes both the visuals and `play.hudRects`. An open pause panel is
   rebuilt at the new size.
6. Stale service-worker cache -> `sw.js` VERSION bumped 1.0.0 -> 1.1.0 for this
   round (game.js, art.js, world.js and s_ui.mp3 all changed). NEW.
7. Ward key not autosaved -> `saveNow()` fires the moment `keys[index]` is set
   in `killEnemy()`.
8. Enemy phase not deterministic -> `makeWorldEnemy()` derives `phase` from a
   seeded hash of the enemy id, not `Math.random()`.
9. Stick / action zones overlap -> `readInput()` assigns one zone per pointer
   with ACTION taking priority, so a thumb inside both rectangles can never
   overwrite the stick pointer.
10. `wasAction` not cleared -> reset to false on PlayScene create, on GGKit
    pause, resume and restart, inside `transition()` and on `respawn()`.
11. Knockback bypassed terrain -> knockback runs through `applyKnock()`, which
    uses the same collision-aware `moveEntity()` as steering and damps out.
12. Water animation disabled -> `waterFrame` advances 0..3 on a 0.16 s clock and
    `TIDX.animate()` re-blits the animated slots; deep water, shallow water,
    foam and grass sway all carry their own phase offsets.

QA (six gates)

- AUDIO: `openSettings()` adds Music volume, Effects volume and Fullscreen rows
  through GGKit's documented `extraRows` hook, stepping 0/25/50/75/100 percent
  and persisting through `kit.audio.prefs`.
- CONTENT: gauntlets are ordered by distance from camp (15.6, 72.1, 74.7 tiles)
  AND gated in sequence: entering gate i refuses until relic i-1 is held, with a
  named refusal line. Save validation as item 4 above.
- UX/PWA: the loading bar reports real completion (atlas bake, terrain bake,
  anim build, and one weighted step per SFX decode, each advancing only when its
  promise settles), and a Fullscreen control exists in settings.
- FEEL, accessibility half: every camera flash, shake impulse, hit dip and
  particle burst is behind `kit.juice.enabled`. `flash()` and `impulse()` return
  early when it is off; every `emitParticleAt` call site is guarded.
- SHIP: `LICENSES.md` written. NEW. Every shipped PNG and MP3 is listed with its
  byte size and SHA-256 prefix, its ledger pack row, its exact upstream file and
  its local licence evidence path. Music provenance was recovered by decoding
  each shipped track and correlating its amplitude envelope against the harvest
  directory (all four matched at r >= 0.999 with exact duration agreement);
  SFX provenance the same way against the Kenney packs (18 of 19 at r >= 0.997).

Art / FX / design

- Greybox-adjacent presentation -> authored biome tile families, 16-way
  transition sets, cliff contact shading, animated water and foam, nine-slice
  pixel UI panels and pixel-grid control skins replace the flat fills and
  gradient discs. NEW in this pass: the menu sea gained a tiling swell overlay
  so the lower third of the title is surface detail rather than a flat colour
  block.
- Biome art reads as recolour -> `art.js` draws sand, grass, forest, rock and
  ruin with separate generators (dune bands, blade clusters, canopy lobes,
  fracture seams, masonry blocks), six variants each, with per-biome prop sets
  and densities. The CC0 source tiles survive only as 22 percent grain.
- Hard coastlines -> `edges()` bakes a full 16-mask set per biome with a
  scalloped rather than straight cut, a one-pixel dark contact line, and a
  cliff-face band for forest, rock and ruin. Shore foam is a separate animated
  16-mask set.
- Dungeon interiors reskinned -> three moods with their own floor and wall
  atlases, joint patterns (hex, plank, spiral), masonry course pitch, accent
  colour, fog colour, lamp inserts and props, plus five room silhouettes
  (open, pillars, alcoves, choke, arena) from `W.roomLayout()`.
- Enemy animation gate -> every foe has idle0/idle1/walk0/walk1/atk/hurt/die
  frames derived from a hand-authored pixel map, and short HP pips appear above
  a foe while it is hurt or freshly targeted.
- Loading screen -> a Driftlands load scene with the island silhouette, moving
  water, the title palette, rotating loading tips and a pixel progress track
  replaces GGKit's DOM overlay, which is hidden as soon as the font is baked.
- Hit-stop contract -> the simulation never skips a step. `update()` always
  runs `step(dt)`; only the cosmetic clock freezes (55 ms on a hit, 70 ms on
  being hit), holding camera follow and entity interpolation.
- Water not animated, fog reveal binary, borrowed-sprite palette, dungeon
  vignette, three-beat impacts, spring-damped shake, pickup pops, minimap
  legibility, HUD lanes, control language, title tableau, panel treatment,
  onboarding cove, ambient motion -> all addressed: eased per-chunk fog on a
  filtered 64x64 texture, every entity and landmark drawn from the baked `dl`
  atlas, a torch mask anchored to the player and tinted per gauntlet, attack
  wind-up into strike into damped knockback with a camera dip, a spring shake
  with one overshoot, ease-out-back pickup pops and a reward panel with a hold
  before the return, a minimap with a dim coastline under fog plus shape-coded
  markers and a legend, a message rail below the play area, context action
  labels (SWORD / ENTER / OPEN / LOCKED / SEALED), a composed title tableau,
  nine-slice pixel panels with a gear and relics screen, an authored cove with
  two staged foes and a world-space marker per tutorial beat, and phase-offset
  palms, grass sway, foam drift and a three-frame camp fire.

New in this pass, found while verifying the above:

- The bitmap font baked at bold 9 px closed its counters, so every 0, 8, B and D
  thresholded into a solid block: the HUD read "0/12" and "0:01" as boxes. Now
  baked at regular 10 px with a 128 alpha threshold; all glyphs are open.
- The minimap legend overflowed the minimap frame and ran off the right edge of
  a 390 px screen. Shortened and set to 0.75 of the base font size.
- The message rail sat under the pause button, so a two-line tutorial prompt
  covered a tappable control. The rail moved up to clear both the control row
  and the pause button.
- The camp fire was drawn on the spawn tile, so the drifter stood inside the
  flame at every spawn and respawn. Moved south of the spawn.
- The world reveal radius (7.6 tiles walking, 9 on spawn) was smaller than the
  vertical half-view (13.2 tiles), so roughly the top and bottom fifths of the
  screen were always solid fog. Raised to 11 and 13; fog of war is unchanged in
  kind, it just no longer eats the frame.
- `s_ui.mp3` shipped as a 7 ms clipped fragment. Re-cut from
  interface-sounds/select_001.ogg (CC0) so the UI click has a body, and recorded
  in LICENSES.md.
- The title CTA sat at 70 percent of screen height, below the automated
  harness's play tap, so every gate run screenshotted and frame-traced the TITLE
  and reported it as gameplay. The primary CTA moved to 65 percent. Every gate
  number in the previous verdict for this title was measured on the title
  screen, not on the game.

Performance work for the feel carry-in:

- Per-frame allocation removed from the hot path: the input record and knob
  offset are reused instead of two fresh object literals per frame; enemy and
  player animation frame names are baked into lookup tables at module load
  instead of being concatenated per entity per frame; the boss single-element
  target array, the gear-value array and the sigil `filter()` array are gone;
  the minimap marker closure became a method rather than a closure rebuilt
  every frame.
- Startup and mid-run asset decode: the island music track is decoded during
  the idle title screen and the two interior tracks seven seconds into the run,
  so neither entering play nor entering a gauntlet pays a decode. Previously
  `m_isle` decoded exactly as gameplay began.
- The terrain atlas is re-uploaded every water frame; it was a 256x256 canvas
  holding 166 tiles. Shrunk to 256x192, a quarter off the per-cycle texture
  upload.
- No synchronous layout reads exist in the frame loop; `readInsets()` (the only
  `getComputedStyle` call) runs on resize only.

### Disputed

- Code review 6 claims cache hits ignore query strings as a defect. They do
  (`caches.match(..., { ignoreSearch: true })`), but that is deliberate and
  correct for this shell: nothing in Driftlands appends a query string, and
  ignoring them prevents a cache miss on a `?v=` style probe. The real half of
  the finding, the fixed VERSION, is implemented.
- Art review states the torch mask is "positioned at the viewport center". It is
  positioned on the player: `this.torch.setPosition(p.x * TILE, p.y * TILE - 4)`
  in `drawFrame`. The finding was correct against the pre-fix build and is now
  stale; recorded here so the next reviewer does not re-file it.

### Deferred

- QA ART gate, prototype-before / shipped-after screenshot pair. This is
  evidence staging in `review_evidence/aaa/driftlands/`, outside this lane's
  writable scope (this brief permits `play/driftlands/` and its LICENSES.md
  only). Needs the evidence owner to capture the pair.
- QA UX/PWA gate, deployed HTTPS rerun and `swRegistered: true`. Requires a
  deploy, which this brief forbids. The manifest, icons, service worker and
  offline asset list are all in place and the local run is clean; the check can
  only flip on an HTTPS origin.
- `/play/_assets/LEDGER.md` "Used by" column still reads (pending) for the seven
  packs Driftlands ships from. That file is shared across every title and is
  outside this lane's scope; several lanes are running concurrently, so a blind
  edit would collide. The per-file mapping it needs is complete in
  `LICENSES.md`.
- Settings still opens GGKit's shared CSS overlay rather than an in-canvas pixel
  panel (art review, "generic modal systems"). GGKit is the mandated sole owner
  of settings, so the fix taken was to extend it through `extraRows` rather than
  to fork a second settings implementation. Every other panel (pause, death,
  victory, gear and relics, reward) is an authored nine-slice pixel panel.

### feel_no_spikes: verdict undetermined, the box is too contended to measure

Median passes comfortably at 16.7 ms every run. The long-frame count is the
open item, and it cannot be read straight off this box. `aaa/harness/dl_fix1_pair.mjs`
was written for this round: it traces a control page served from the same
origin (a bare canvas with one moving square, no engine, no assets) and then
Driftlands, back to back, both at 4x CPU throttle. Paired results, worst to
best box load:

    CONTROL 54/600   DRIFTLANDS 111/600
    CONTROL 52/600   DRIFTLANDS 105/600
    CONTROL 41/600   DRIFTLANDS  92/600
    CONTROL 36/600   DRIFTLANDS  29/600
    CONTROL 30/600   DRIFTLANDS  34/600
    CONTROL 17/600   DRIFTLANDS  14/600
    CONTROL  4/600   DRIFTLANDS  22/600

The control page fails a 6-frame budget by up to nine times on its own, so any
single Driftlands number taken while the box is loaded says nothing. Across
eleven runs of near-identical code Driftlands returned 11, 14, 22, 29, 34, 62,
92, 105, 111, 133 and 157. Twelve agent lanes and several other harness runs
were live throughout.

Read together: in three of seven pairs Driftlands lands at or below a page that
draws one rectangle, and in the quietest pair (control 4) it was 18 frames
above. So the honest verdict is undetermined, not "fixed" and not "still
badly failing". One clean run on an idle box settles it. What the residual, if
any, is NOT: sustained CPU. A profile
during a 600-frame trace at 4x throttle shows 45 percent idle and no game
function above 0.8 percent of samples (`drawFrame` 0.8, `updateWorld` 0.7); the
top entries are all Phaser render and WebGL upload. The spikes are stalls, not
work, and they arrive in bursts 70 to 100 frames apart, which reads as major
GC rather than anything on a fixed game cadence.

Next step for whoever takes this, on an idle box: re-run
`node aaa/harness/dl_fix1_pair.mjs` and only trust the Driftlands number when
the control comes in at or under the 6-frame budget. If a gap remains, the
prime suspect is live
heap, not per-frame work. PlayScene builds three full-map tilemap layers
(base, edge, props) at 128x128, so roughly 49,000 Phaser Tile objects stay
resident for the whole run and lengthen every major GC mark. Collapsing the
sparse edge and prop layers, or moving the static half of the terrain to a
render texture, is the structural change to test. The per-frame allocation and
decode-timing work in this round was worth doing on the merits and is done;
this is the remaining lever.

## Retina pass 2026-08-16

- Before ratio: 2.00x in the pre-pass configuration. The title clamped its
  manual DPR to 2 and resized the CSS canvas to the viewport, so its backing
  store was 780x1688 against a 390x844 CSS box, two pixels per CSS pixel on a
  DPR 3 device.
- After ratio: 3.00x by the post-pass `GGKit.hiDpi.phaser(config)` sizing
  calculation at emulated DPR 3: 1170x2532 backing against 390x844 CSS. The
  helper writes `cfg.ggDpr`, sets the `Scale.NONE` backing store to viewport
  times that factor, and applies `zoom: 1 / cfg.ggDpr`.
- Recipe: `Phaser.Scale.NONE` with the shared render defaults. World units now
  use device pixels (`TILE = 16 * cfg.ggDpr`), dense atlas and canvas frame
  metadata use the same factor, bitmap font cells use dense frame dimensions,
  and CSS-authored UI offsets are scaled from `cfg.ggDpr`.
- Factor cap: none. Driftlands is a portrait iPhone title and the full native
  factor is required for the acceptance ratio; no feel-budget measurement was
  authorized on this software-only box.
- Cache: service-worker version bumped from 1.1.0 to 1.2.0 for the changed
  rendering assets.
- Verification limitation: the required headless Chrome run and gameplay
  screenshot could not be captured in this environment. The browser
  inventory was empty, and sandboxed processes could not bind the required
  private local port. The 2.00x and 3.00x values above are source-level
  backing-store measurements, not a `RET-OK` runtime verdict. `node --check`
  passes for `game.js`, `art.js`, and `world.js`.
