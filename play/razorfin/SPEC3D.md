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
init(scene3, ctx) / update(ctx) / query(x,y,r,kind) / eatQuery(x,y,r) /
kill(ent,cause) /
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

## Rev 3 (Razorfin eat-engine lane, 2026-08-20)

- EAT-01: the player mouth sensor is centered at the snout tip, at
  `p.x + cos(p.angle) * p.r` and `p.y + sin(p.angle) * p.r`. The sensor uses
  `p.mouthR`, multiplied by `1.55` for `wideBite`; wideBite is a radius bonus
  only and has no facing-cone gate.
- EAT-02: `stepEat` calls `RF.World.eatQuery(x, y, r)` when that method is
  present, with `RF.World.query(x, y, r)` as the standalone fallback. The
  music sensor remains on `World.query`.
- EAT-03: near-tier prey owns its chew cooldown in `ent._biteCd`, set to
  `0.25` seconds after damage. The player no longer has a shared 250 ms chew
  gate. `p.st.chewFxCd` is a separate 0.12 second feedback cadence: hit-stop,
  shake, chomp sound, chomp FX, and the chew jaw snap fire at most once per
  cadence while damage remains per target.
- EAT-04: `RF.ctx.mouth` is a stable module-scratch descriptor with
  `{x, y, r, strength, eligibleTierMax}`. `r` is the sensor radius times
  `1.6`, `strength` is `260`, and the tier limit is the player's tier plus
  `biteUp`, or `99` for a junkEater hazard rule. World owns all suction
  position writes. If `RF.World.__decaysBiteCd !== true`, engine3d locally
  decays existing `_biteCd` fields as a standalone fallback; it never
  double-decays a world-owned field.
- PERF-03: the eat copy buffer has capacity 96. Mouth and chew option records
  are pre-allocated module scratch and fixed-step eat resolution must not
  allocate.
- CAMERA-03: the old Rev 1 `z=620` wording is obsolete; the live camera
  contract (430 base, floor 340, pitch/bob) is defined in the
  "Rev 3 (scale-camera)" section below.

## Rev 3 (world query and mouth contract, 2026-08-20)

- `RF.World.query(x, y, r, kindFilter)` remains a center-point query. Its
  circle is tested against each entity center, and its kind-filter behavior is
  unchanged because music sensing and mine chains depend on that contract.
- `RF.World.eatQuery(x, y, r)` is the player-mouth query. It uses the same
  spatial-hash walk and scratch result buffer as `query`, but tests
  circle-vs-circle overlap: `dx*dx + dy*dy <= (r + entity.r)^2`. Results are
  valid only until the next world query, and the caller must copy them before
  another query or a mutating operation.
- The engine publishes `RF.ctx.mouth` before the fixed world step as a reused
  descriptor `{x, y, r, strength, eligibleTierMax}` in sim coordinates. The
  world reads that descriptor during `World.update(ctx)`. Active `prey` whose
  tier is at most `eligibleTierMax` and whose center is inside `r` receive a
  velocity pull toward `(x, y)` at `strength` px/s^2. The resulting prey speed
  is capped at approximately `1.6 * def.speed`; hazards, predators, pickups,
  and frozen entities are never sucked. The force is applied immediately
  before world integration, so containment and spatial-hash rebucketing remain
  authoritative and no position is teleported by suction.
- World entities carry a monomorphic top-level `_biteCd` seconds field. The
  world decays it on every active entity step and advertises this capability as
  `RF.World.__decaysBiteCd === true`, allowing the engine to keep chew cadence
  per target while retaining its separate player feedback cadence.
- Prey and hazard billboard display length remains derived from collision
  radius; Rev 3 uses `displayLen = radius * 2.1` at both animated hazard call
  sites as well as ordinary prey views.

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

## Rev 3 (Razorfin lane shark-bend, 2026-08-20)

### Shark bend material contract

`RF.Art3D.buildShark(def)` creates the bend materials at rig-build time. The
source MeshToonMaterials remain the persistent template materials; every
rendered body, outline shell, jaw, jaw-tooth, and merged feature batch uses a
clone produced by `bendableMaterial(baseMat, uniforms)`. No material or
geometry clone is permitted from `animate()` or any fixed-step path.

Each rig owns exactly one `uniforms` bundle with these entries:

```js
{
  uBendPhase: { value: 0 },
  uBendAmp: { value: 0 },
  uBendK: { value: 0 },
  uBendSpan: { value: new THREE.Vector2(spanX, spanY) }
}
```

The bundle object and all four entry objects are shared by identity by the
rig's bendable material clones. `onBeforeCompile` adds the four uniforms after
`<common>` and applies the lateral wave after `<begin_vertex>`:

```glsl
float bendT=smoothstep(uBendSpan.x,uBendSpan.y,-transformed.x);
transformed.z += uBendAmp*bendT*sin(uBendPhase+transformed.x*uBendK);
```

Every clone supplies a stable `customProgramCacheKey()` ending in
`:rf-bend`, based on its base shader variant. The shell keeps its 1.045 scale
but multiplies the bend amplitude by `1.0 / 1.045` in its shader variant, so
the outline does not drift away from the body wave. The enumerated bend
program variants must remain `<= 8`.

`bendOffset(x, phase, amp, k, spanX, spanY)` is the headless CPU reference
for the exact smoothstep/sine deformation. GL context restoration must retain
the material hooks, cache keys, and uniform identity on existing rigs (or
rebuild those build-time clones and bundles together before the next render);
the renderer may then recompile/prewarm the restored programs. Fixed-step
animation writes only scalar uniform values and pre-existing object fields.

### Rig pose contract

The public rig shape remains `{ group, parts, animate }`, and consumers keep
owning the outer group's world position, heading, bank, and eat-pop scale.
Internally the hierarchy is `group -> pose -> parts`. The `pose` child is
named `RF pose` and owns the visual read: yaw is `+0.28` for the normal
facing and `-0.28` when the outer group has the engine's left-facing `PI`
flip; bank is clamped to `±0.35` (starting at `±0.18`); pitch eases from
`state.vy`; and speed stretch is `x *= 1 + 0.07*speedFrac`,
`y/z *= 1 - 0.03*speedFrac`. The outer `group.scale` is never touched by
`animate()`.

The per-rig phase is continuous across speed changes:

```js
rate = lerp(2.2, 8.5, pow(speedFrac, 0.8));
phase += rate * TAU * dt;
amp = 0.06 + 0.30 * pow(speedFrac, 1.2);
```

The tail pivot follows `amp*k*cos(phase + tailRootX*k)` so the caudal fin
continues the body wave. If `state.preyNear` is truthy, the jaw eases toward
`0.35*gape` as anticipation; the existing bite/snap inputs remain valid.

### Camera correction

The live gameplay camera contract is perspective `fov 50` with the tiered
dolly owned by `engine3d.js`: tier-1 base `z=470`, with the tiered deep-view
value currently `z=360` where selected by the engine. The stale Rev 1 `z=620`
value is not a shipped contract.

## Rev 3 (fish loft lane, 2026-08-20)

- Module load order now includes `fish3d.js` after `shark3d.js` and before
  `world3d.js`: `fx3d.js -> shark3d.js -> fish3d.js -> world3d.js ->
  engine3d.js`. Both shipped HTML entry points use that order.
- `RF.Art3D.buildFish(def)` is a geometry-only prey contract. It returns
  `{ geometry, palette }` for the 12 fusiform prey IDs in `RFD.CREATURES`:
  `minnow`, `reeffish`, `mackerel`, `parrot`, `grouper`, `tuna`, `swordfish`,
  `dolphinfish` (Dorado), `marlin`, `anglerprey`, `abyssal`, and
  `leviathanprey` (Deep Leviathan Calf). Unsupported IDs return `null` so
  the caller can retain the billboard fallback.
- Each supported ID is cached independently and owns one merged
  `THREE.BufferGeometry`: an 8-station x 6-radial elliptical body, capped
  nose/tail, forked tail-fin fan, and dorsal sliver. The nose points toward
  local `+x`, the geometry has a `color` attribute aligned with `position`,
  and the hard budget is `<=220` indexed triangles. The palette carries
  `base`, `belly`, and `accent` colors for dorsal/flank/belly countershading.
  Fish geometry creation happens at build/init time; this module has no fixed-
  step update path and does not allocate during simulation.
- `RF.Art3D.buildFishMaterialSpec()` defines the bend-clone inputs without
  depending on shark-bend code. The shared toon clone must enable vertex
  colors and bind these uniforms with these defaults: `uBendPhase=0`,
  `uBendAmp=0.08`, `uBendK=2.5`, `uBendSpan=1.8`. A bend variant uses the
  program-key suffix `:rf-bend`. Instancing, per-instance attributes,
  material compilation, and lifecycle ownership remain `world3d.js`'s job.

## Rev 3 (Plan 3B environment contract, 2026-08-20)

The environment is now owned by world3d.js as four static depth systems plus
the existing animated water registries. These rules are binding for the
environment builders and their selftest.

- `buildGradientSheet()` creates exactly one opaque, fog-disabled RGBA mesh at
  `z=-500`. It covers x `-400..7600` and sim y `-600..4200` with eight stacked
  full-width quads. Zone top colours are the zone tint lerped 0.5 toward its
  fog colour and then lightly lifted; zone bottoms are the next zone tint
  darkened, with the final abyss corner at `#020408`. The colour transition
  uses the same `ATMO_BLEND` band as `applyZoneAtmo`, so the world ramp and
  camera fog agree at every zone boundary. The gradient material has
  `transparent=false`, `depthWrite=true`, and `fog=false`, and receives no
  per-frame writes.
- `mergeRidge(heightline, opts)` is the sibling of `mergeQuads()` for terrain.
  It consumes a one-dimensional sequence of `(x, topY)` points, emits a
  triangle-strip-compatible top/bottom vertex pair per point, and stores RGBA
  vertex colours. NaN point pairs may separate disconnected ledges inside one
  batch; all geometry, colour arrays, and materials are created at init/build
  time.
- `buildTerrain()` creates four opaque, fog-disabled ridge batches: far at
  `z=-340`, mid at `z=-200`, near at `z=-100`, and a sparse near-black
  foreground crown strip at `z=+45`. The first three use rock-to-zone-water
  colour mixes of `0.75`, `0.45`, and `0.20`, with alpha at least `0.9`; alpha
  is a solid-depth choice, not a replacement for the colour distance from the
  authored zone tint. The foreground crown occupies at most the bottom 12%
  of the frame.
- `buildShimmer()` and its animation/selftest contract are retired. The
  static gradient supplies the water field, so `animateWater()` writes only
  the existing caustic, ray, seam, kelp, silhouette, and surface registries.
  The fixed-step path still allocates nothing and the gradient/terrain
  registries remain unchanged after init.
- Clear colour is a small fallback sampled from the world gradient, nudged
  toward the authored zone tint and given only a restrained fog lift. This
  keeps frustum-edge pixels aligned with the sheet while preserving saturated
  zone colours when the sheet is not sampled.
- The environment selftest must see one gradient mesh, four terrain meshes,
  no shimmer state, a positive-z occluder, and an environment draw inventory
  at or below 60. The lane allocates up to five new environment draw slots
  before retirement, one sheet plus four terrain batches; retiring the old
  shimmer removes one slot, for an effective net change of four.
- `teardown()` detaches and disposes the gradient and all four terrain batches
  through `envOwned`, alongside the existing environment resources. Repeated
  init/teardown cycles must leave no gradient or terrain registry entries.

## Rev 3 (frenzy cue and boost FX contract, 2026-08-20)

- `ctx.run.frenzyCue` is the single FX cue field. The engine owns its priority
  and writes one string, or leaves it `undefined` when no cue is active. The
  recognized values are `blood`, `school`, `golden`, and `goldRush`. FX must
  guard a missing `ctx`, `run`, or `frenzyCue` so the lane remains standalone.
  The UI normalizes `golden` and `goldRush` to the golden color variant.
- `blood` is sustained while active: `deathBurst` reuses the motes pool with
  tint `0xb3122a`, secondary tint `0x5a0812`, and approximately 12 particles
  per second at the player. The same four DOM `goldpulse` edge bars are reused
  for a soft red edge pulse and carry the `rf-frenzy-blood` class; this adds no
  WebGL draw.
- `school` is edge-triggered and emits one silver ring from the existing ring
  pool. `golden` and `goldRush` are edge-triggered and emit the existing gold
  edge pulse plus a gold `elementSpark` coin-glint burst. Repeated frames with
  the same cue do not retrigger one-shot effects.
- `swimtrail` reads the reused player animation state `state.boosting`. While
  boosting it targets approximately 2.5x emission and 1.4x particle size; both
  return over a 300 ms numeric scratch taper after boost ends. The engine's
  existing boosted count is not multiplied a second time.
- Per-entity FX options may carry `entity`, `ent`, `source`, or `_tint`; a
  numeric entity `_tint` has priority and is used for spawned glints. No new
  `THREE.Points` pool is permitted. All steady-state fixed-step data remains
  in module scratch and the existing pools; DOM bars are the existing UI
  exception.
- `ui3d.js` owns the cue surface classes `rf-chip-blood`, `rf-chip-school`,
  `rf-chip-golden` and matching toast variants. They reuse `.rf-chip` and
  `.rf-toast`, add color only, and do not change layout or touch targets.

## Rev 3 (reef-surface lane, 2026-08-20)

- ENV-DEPTH-01: environment vertex colours are authored through
  `depthTint(color, z, zoneWaterColor)` and `lightAtDepth(y)`. Depth tint pulls
  15 percent toward the zone water colour at z=-100 and 80 percent at z=-420.
  Vertical light is 1.0 at sim y=0, falls linearly, and floors at 0.35 at
  y=3600. `quadPush` may provide a top colour; merged quads write that colour
  to their two upper vertices so rooted rocks, kelp, and reef forms have a
  lit top edge.

- RAY-03: god rays are four merged additive bands. Three remain in the rear
  ray depth range; exactly one band is at z=+25 so its shafts cross the shark,
  and that band is the low-alpha band. Vertex alpha remains below the 0.10
  authored ceiling after per-shaft variation. Ray transforms and alpha are
  scalar writes from the fixed-step animation pass.

- REEF-03: zones 1 and 2 build a shallow-floor reef from saturated,
  vertex-coloured, normal-blend quad batches. Coral heads and brain corals are
  in one static batch. Fans and anemones are in two additional batches under
  two rooted pivot groups that use the kelp sway pattern. The complete reef is
  three environment draws and is torn down with the world-owned decor ledger.

- SURFACE-03: the waterline is a 64-segment ribbon. Its position attribute and
  backing array are allocated at init; each fixed step writes the preallocated
  vertices using `y = 2 - 2*sin(x*0.012 + t*0.8)` in sim coordinates and marks
  the attribute for upload. The wash plane maps a tileable 256px ripple texture
  held in the persistent `texCache` with RepeatWrapping and scrolls its offset
  without allocating. One additive 1400px Snell-window disc uses a baked radial
  map, sits at z=-70, follows camera x, and fades from bright shallow water to
  zero by zone 3 using the module atmosphere report.

- PERF-ENV-03: this lane adds three reef batch draws and one Snell draw; the
  ribbon replaces the prior surface plane. The shared environment selftest
  remains <=60 meshes, leaving the env-terrain lane's planned five-draw
  contribution inside the shared gate. All fixed-step surface, reef, ray, and
  atmosphere hooks use module scratch, pooled records, or preallocated GPU
  attributes only.
