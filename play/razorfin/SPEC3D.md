# Razorfin 3D render layer - Architecture Contract (Rev 1, 2026-08-19)

Owner decision: rebuild the render layer in three.js (fleet-vendored at
/play/_shared/three/, deep-ballast precedent) to reach the Hungry Shark
visual bar. Reference images: ~/Downloads/sharks.jpg + sharks2.jpg (STYLE
ONLY - caricature proportions, lighting, saturation; IP gate absolute).

## What survives unchanged
- data.js (all tables), meta.js (save/economy/dev mode logic; its Phaser
  scenes are simply never built - typeof Phaser guard already exists),
  abilities.js (logic operates on entities + st timers through RF.World API).
- GGKit (kit.input/save/audio/loader/pause), the stick control MECHANICS,
  the fixed-step accumulator, all sim rules, UI_LAW/RETINA_LAW/no-em-dash.
- SAVE KEY gg-razorfin and all progression.

## New module set (index.html reworked: importmap three -> module scripts)
Load order: data.js -> meta.js -> abilities.js (classic scripts, unchanged)
then module: fx3d.js -> shark3d.js -> world3d.js -> engine3d.js, plus
ui3d.js (classic, DOM). Phaser and the old game/world/juice/sharkart files
are NOT loaded (kept in repo as reference until cutover signoff).

## Scene/space contract
- World coords unchanged: x right 0..7200, y DOWN 0..3600 (sim untouched).
  Mapping to three: (x, -y, z). Gameplay plane z=0. Camera: perspective
  fov 50, base z=430 (tier floor z=340), at the followed point with a fixed
  y-down pitch (Three Y camera offset -28, lookAt offset +12) and a shared
  +-5-unit bob at 0.08Hz from ctx.time.now; slight velocity lookahead.
  Decor parallax via z in [-400..-80], foreground motes z [+40..+80].
- Lighting: hemisphere (sky #9fd4e8 / deep #06121e) + directional sun from
  above-front (casts no shadows - perf), per-zone scene.fog (FogExp2, color
  + density lerped from RFD.ZONES tint/pressureTier while camera descends).
- Renderer: WebGLRenderer antialias true, setPixelRatio(min(dpr,3)) - the
  hiDpi kill switch does NOT apply here (GGKit.hiDpi.three is not used;
  compute own ratio). Clear color = zone water. toneMapping ACESFilmic.

## shark3d.js (Lane D) - RF.Art3D
buildShark(def) -> { group: THREE.Group, parts: {body, tail, pect L/R, jaw|null},
  animate(t, state) }   // state: {speedFrac, turn, bitePhase, jawSnapT}
- Procedural low-poly mesh per sil: spine-station body (14-20 stations,
  elliptical sections, girth/len from sil, head archetype reshapes front
  stations: hammer T-bar, croc snout, saw blade, whale bulk, kaiju plates as
  cone rows, mech panel insets, skull crest, void sweep, angler jaw+lure...).
- Split at peduncle: tail is its own mesh in the group, pivot at the joint;
  pectorals thin extrusions, pivoted at root; jaw lower-mesh tier>=5 with
  teeth (white cones). MOUTH VISIBLY TOOTHED at rest for tier>=2 (HSE bar).
- Materials: MeshToonMaterial + shared 4-step gradientMap (cel look), vertex
  colors for countershading (dark dorsal -> bright flank -> pale belly),
  emissive for glow fx (palette.glow), saturation UP vs 2D (chroma boost).
  Eye: sphere + dark iris + white catchlight sprite; brow ridge geometry on
  act 1-2, glow eyes act 2-3.
- animate() drives tail rotation (speed-scaled), pect flutter, body roll
  (bank), jaw open (bitePhase/jawSnapT) - CPU, cheap, no skeletons.
- Budget: <= 3500 triangles per shark, geometry cached per def.id, ALL
  materials shared where possible. Creatures stay 2D: RF.Art3D.billboard(key)
  wraps an existing baked canvas texture into a double-sided plane sprite.

## world3d.js (Lane B) - RF.World, SAME API as world.js
init(scene3, ctx) / update(ctx) / query(x,y,r,kind) / kill(ent,cause) /
spawnBurst / zoneAt(y) / entities / playerHits. Port the SIM verbatim from
world.js (AI, spatial hash, pools, spawner, status effects, surface clamp
from rev5) - swap sprite code for: prey/hazards/pickups = billboard planes
(RF.Art3D.billboard of existing bakes, flipX by vx, tail-wiggle as z-rot
oscillation), NPC sharks = RF.Art3D.buildShark groups (animate() called in
update). Environment: gradient water handled by fog+clear color per zone;
god rays = additive transparent planes swaying; caustic planes near surface;
kelp/rock decor = billboards of existing bakes at parallax z; marine snow /
bubbles via RF.Fx ambient. Surface = animated plane at y=0 with soft foam
band billboard strip. Zone crossing must be UNMISTAKABLE (fog+light lerp).

## fx3d.js (Lane F) - RF.Fx, RF.Juice, RF.Sound, RF.Music (same APIs)
Points-based pooled particle systems (bubbles, motes, elementSpark, ring,
beamCore, swimtrail, speedlines, breach, goldpulse edge glow via DOM overlay
per UI_LAW). RF.Juice.hitStop/consumeFreeze/slowmo/shake (camera impulse) /
kaiju (emissive pulse on rig body + roar/thud). Port the synth audio tables
verbatim from juice.js (they are renderer-independent).

## engine3d.js (Lane A) - RF.Game
Boot (GGKit.create landscape, renderer, loader), fixed-step loop STEP=1/60
MAX_STEPS=4 with timeScale + consumeFreeze, RF.ctx EXACTLY as SPEC.md, stick
controls ported (ring/nub as DOM elements now, same 62px/1.35x mechanics),
player controller port (eat/hunger/combo/goldrush/death - logic identical to
game.js, sprites -> RF.Art3D group), camera follow + lookahead + speed FOV
ease, HUD is DOM (ui3d.js builds it; engine feeds a plain state object every
frame: hp, boost, power, coins, combo, chips queue). Score popups = 3D
sprites at bite point (pooled). Eat feedback parity with the 2D rev
(burst + popup + jaw snap + scale pop + hit-stop).

## ui3d.js (Lane C) - DOM menu/shop/results/HUD
deep-ballast pattern: HTML/CSS overlays (index.html gets the containers).
Menu: roster ladder with THUMBNAILS (reuse 2D thumb bakes via toDataURL at
boot - they are already good and memory-bounded), tier locks, selected state,
DIVE. Shop: tier sections, stat bars, upgrades, buy/select via RF.Meta.
Results: payload from RF.Meta.endRun. HUD: single top-left cluster (name,
health, boost, power button, coins), combo chips <=24px <=1s one at a time,
DEV chip, tutorial strip. All touch targets >=44px. kit.input still owns
GAME input; DOM UI uses normal DOM events (out-of-run or overlay taps only,
power button pointerdown allowed in-run as it is not a game gesture).

## Gates
Same as ever: console-clean boot 844x390 DPR3, 61/61 sweep via ?unlockall=1,
selftests per module (__selftest), texture+geometry memory <= 120MB, Luna
adversarial review + art critique vs the reference images, Fable signoff,
owner iPhone verdict LAST. 60fps mid-phone: draw calls < 120, tris < 60k.


## Rev 2 (post REVIEW-3D, orchestrator rulings)

- ATMOSPHERE OWNER: world3d.js exclusively (fog, clear color, hemisphere lerp
  targets). engine3d.js creates the lights ONCE at boot and thereafter only
  reads; world3d mutates light colors/intensity as part of applyZoneAtmo. No
  other module touches atmosphere. Tune for BRIGHT SATURATED foreground
  readability at shallow/mid/deep (the reference roster pops; fog must never
  gray out the player shark).
- TEARDOWN OWNERSHIP (LIFE-01): every module that adds to the scene exports
  teardown(). Ownership: engine3d owns player rig + popups + calls the others;
  world3d owns entities/views/decor/env textures + private materials; fx3d
  owns pools + DOM edge overlays + active effect state (reset synchronously in
  its teardown). Shared caches allowed to persist: shark3d geometry/material
  caches (documented global lifetime), asset textures (world3d texCache).
  Gate: repeated start/end cycles with stable scene.children count and stable
  renderer.info.memory counts.
- LAW-01 RULING: window-level 'resize'/'orientationchange'/visualViewport
  listeners are PERMITTED in engine3d.js ONLY, as the renderer host platform
  adapter (contract revision; ggkit owns game-input events, unchanged). All
  other modules: still forbidden.
- ORCH-01 RULING: index3d.html load order is normative as shipped: data.js,
  meta.js, abilities.js, sharkart.js (2D bake factory for billboards), ui3d.js
  classic; then modules fx3d, shark3d, world3d, engine3d. SPEC3D's original
  list omitting sharkart.js is superseded.
- GL-01: engine3d handles webglcontextlost (pause + notice via RF.UI) and
  webglcontextrestored (rebuild renderer state, re-init world/fx against the
  live run or return to menu safely).
- PERF: draw calls < 120 measured at the kaiju run; fixed-step paths allocate
  nothing (atmosphere report becomes writes into module scratch).
- TEST-01: the art gate is a SCREENSHOT gate at the gameplay camera, judged
  against the reference roster, not geometry assertions alone.

## Rev 3 (scale-camera)

- Shark length authority is `124 * sil.len` simulation pixels. `r` and
  `mouthR` derive from that length with the existing `0.42` and `0.22`
  proportions; `mouthR` remains clamped to `14..90` because the current
  roster's maximum `len=1.9` does not reach the upper bound.
- `RF.Game.LEN_SCALE` is the shared `124/96` render-scale contract. The
  engine applies it once to the player group after `RF.Art3D.buildShark()` and
  captures the scaled value as `group.__baseScale` before eat pops. NPC rig
  consumers in `world3d.js` read the same exported factor; shark3d's authored
  96px normalization remains unchanged.
- Camera constants are `fov=50`, tier-1 `z=430`, and
  `camZForTier(tier)` floored at `340`. In Three coordinates the pitch is
  `position.y = -py - 28` relative to the followed point and
  `lookAt.y = -py + 12`; both receive the same `+-5` bob at `0.08Hz`.
  Lookahead remains `0.28s`, capped at `190px`.
- Camera presentation is allocation-free: combo thresholds ease z by `-8%`
  for `0.4s`, death eases z by `+10%` for `1.2s`, and an optional
  `ctx.run.blood.t > 0` adds a guarded `-6%` push-in. All pulses use the
  preallocated `camState` easing fields and return to the tier base.
