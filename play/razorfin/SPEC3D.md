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
  consumers in `world3d.js` read the same exported factor exactly once from
  `group.userData.baseScale`, then stamp `group.__baseScale` and
  `group.__rfLenScale`; a matching stamp prevents reapplication. shark3d's
  authored 96px normalization remains unchanged.
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
float bendZ=uBendAmp*bendT*sin(uBendPhase+transformed.x*uBendK);
transformed.z += bendZ;
transformed.y += 0.35*bendZ;
```

The `0.35` y term is intentional: a profile camera must see the traveling
wave in silhouette, not only along the camera-facing z axis. `bendOffset()` is
the headless CPU reference for the z term; the selftest also gates the derived
`0.35 * bendOffset()` y travel at full amplitude to `>= 0.02 * bodyLen`.

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

The tail pivot is phase-locked to the body wave at `phase + tailRootX*k`, and
its yaw sweep is `0.38 + 0.30*speedFrac` radians, with the turn input layered
on top. The tail tip must travel at least `0.10 * bodyLen` per beat. Body roll
oscillates at the wave rate with `±0.04` radians and the merged body/head batch
counter-yaws `±0.05` radians. If `state.preyNear` is truthy, the jaw eases
toward `0.35*gape` as anticipation; the existing bite/snap inputs remain
valid.

### Shark-face proportion contract

Ordinary fusiform heads use an effective-girth clamp and a front-22% rounded
snout taper. Their spine core must satisfy `bodyLen / maxHeight >= 3.1` and
the reported visual aspect must remain `>= 2.8`. The only documented bulk
exceptions are `eel`, `whale`, and `kaiju`.

The caudal fin uses `tailLen = bodyLen * (0.20 + tailScale * 0.07)`, with the
effective authored `tailScale` capped at `2.0` so fusiform tails remain in the
hard `0.18..0.34 * bodyLen` range. The upper lobe is
`bodyLen * (0.16 + tailScale * 0.05)`; the lower heterocercal lobe is exactly
`0.62 * upper`, the peduncle root is `0.045 * bodyLen`, and the outline has a
concave crescent notch.

Fusiform faces also require a swept dorsal fin centered near `+0.05*bodyLen`
with height near `0.22*bodyLen`, long thin swept-back pectorals, five dark
vertex-color gill bands spanning `+0.28..+0.38*bodyLen`, a half-size eye near
the snout top, and a dark underslung mouth line. Gill and mouth colors stay in
the merged feature batch so they receive the same bend uniforms as the body
and shell.

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
  carries `rfFishPaletteId` matching the definition, and the hard budget is
  `<=220` indexed triangles. Each definition owns a distinct vertex-colour
  palette bake. The palette carries
  `base`, `belly`, and `accent` colors for dorsal/flank/belly countershading.
  Each loft also carries an 8-triangle dark eye accent on both sides of the
  fish, keeping the nearest archetypes readable without a child mesh.
  Fish geometry creation happens at build/init time; this module has no fixed-
  step update path and does not allocate during simulation.
- `world3d.js` converts each geometry-only record to one shared
  `MeshToonMaterial({color:0xffffff, vertexColors:true, side:DoubleSide})`
  with the `:rf-bend` source cache key. Only per-batch clones receive the
  `:rf-bend-inst` shader variant; persistent fish source geometry/material is
  outside world teardown ownership.
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
  `z=-500`. Its vertices are authored at local `z=0`; only the mesh carries
  the world z transform. It covers x `-400..7600` and sim y `-600..4200` with
  eight stacked full-width quads. Zone top colours are the zone tint lerped
  0.22 toward its fog colour. Generated Rev 3 stops are
  `1b4d66/5fa8c2`, `14384d/4e8199`, `0c2233/304e65`, and `050d17/162533`;
  zone bottoms are the next zone tint darkened, with the final abyss corner at
  `#020408`. The colour transition
  uses the same `ATMO_BLEND` band as `applyZoneAtmo`, so the world ramp and
  camera fog agree at every zone boundary. The gradient material has
  `transparent=false`, `depthWrite=true`, and `fog=false`, and receives no
  per-frame writes.
- `mergeRidge(heightline, opts)` is the sibling of `mergeQuads()` for terrain.
  It consumes a one-dimensional sequence of `(x, topY)` points, emits a
  top/shoulder/base facet triplet per point with separate mid colours, and
  stores RGBA vertex colours. NaN point pairs may separate disconnected ledges
  inside one batch; the index buffer uses `setDrawRange(0, indexN)` so NaN gaps
  never render oversized garbage. All geometry, colour arrays, and materials
  are created at init/build time.
- `buildTerrain()` creates four opaque, fog-disabled ridge batches: far at
  `z=-340`, mid at `z=-200`, near at `z=-100`, and a sparse near-black
  foreground crown strip at `z=+45`. The first three use 40 points, reduced
  waves `[28,42,56]`, and rock-to-water mixes `[0.40,0.22,0.10]`. Their
  main seafloor bases stop at `simY=3582`, with top facets clamped to a
  42..180 world-unit bottom band at the gameplay camera. Facet values darken
  with parallax depth around `#29434a`, `#1c343d`, and `#10242d`; `#020408`
  is reserved for the deepest base and foreground crown. The foreground
  crown is clamped to a 24..68 world-unit bottom fringe and never becomes a
  camera-filling wall. Alpha is at least `0.9`.
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
  8 percent toward the zone water colour at z=-100 and 50 percent at z=-420.
  Vertical light is 1.0 at sim y=0, falls linearly, and floors at 0.45 at
  y=3600. `quadPush` may provide a top colour; merged quads write that colour
  to their two upper vertices so rooted rocks, kelp, and reef forms have a
  lit top edge.

- RAY-03: god rays are four merged additive bands with four shafts per band.
  Three remain in the rear ray depth range; exactly one band is at z=+25 so
  its shafts cross the shark, and that band is the low-alpha band. Shaft alpha
  is `0.006..0.012` across the play band and `0.012..0.028` in the rear;
  heights are `240..440`, widths `18..48`, and the animated material ceiling
  is `aBase=0.55` with `RAY_ALPHA_LO=0.35`. All bands share a feathered alpha
  map so their edges cannot read as opaque rectangles. Ray transforms and
  alpha are scalar writes from the fixed-step animation pass.

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
  zero by zone 3 using the module atmosphere report. Additive alpha targets
  are wash `0.025`, ribbon `0.34`, foam `0.10` with colour `#c7eff5`, and
  Snell `0.08`.

- PERF-ENV-03: this lane adds three reef batch draws and one Snell draw; the
  ribbon replaces the prior surface plane. The shared environment selftest
  remains <=60 meshes, leaving the env-terrain lane's planned five-draw
  contribution inside the shared gate. All fixed-step surface, reef, ray, and
  atmosphere hooks use module scratch, pooled records, or preallocated GPU
  attributes only.

## Rev 3 (frenzy/data contract, 2026-08-20)

The gameplay camera contract is the shipped three.js contract: perspective FOV
50, gameplay plane z=0, camera z=470 for tier 1 and eased to z=360 by tier 12,
with velocity lookahead. The old z=620 description above is superseded.

The run state keeps the legacy `frenzy` and `goldRushT` aliases for existing
HUD and payout consumers, and adds these in-place, run-scoped records:

```text
goldRush: { meter, t }
blood:    { t }
school:   { packId, count, swirlT }
golden:   { packId, eaten, deadline }
frenzyCue: "goldRush" | "golden" | "blood" | "school" | ""
_goldenCuePending: boolean
ctx.schoolSwirl: { packId, t }
```

School starts at four eats from one pack inside the combo window, publishes
`ctx.schoolSwirl`, and uses the authored eat-rate refill bonus while active.
Blood starts when a near-tier multi-bite target finishes and lasts six seconds.
Golden School is rolled once when the first member of a pack is eaten in the
engine bridge, tints members with `e._tint = 0xffd67a`, and pays its burst only
when every member is player-eaten before the deadline. Despawn or any other
kill voids it without a penalty. All fixed-step state is mutated in module
scratch, pooled entities, or the preallocated run records.

Frenzy cues have one priority order: Gold Rush > Blood > School. Gold Rush is
the only frenzy that affects score/payout scoring; Blood is the only new frenzy
that affects bite and speed. Blood and Gold Rush speed do not multiply: the
effective speed factor is `max(blood.speed, goldRush.speed)`. School cannot
retrigger from kills caused by its own active swirl.
Golden School completion sets `_goldenCuePending`; `updateFrenzyCue()` emits
the one-frame `golden` edge cue and the following fixed step transitions to
`goldRush`. No gameplay path emits `goldpulse` directly.

Authored data versus code defaults:

| Schema | Source | Runtime use |
| --- | --- | --- |
| `RFD.BAL.metabScale`, `eatHealBonus` | `tools/gen_data.py` | hunger drain and swallow heal tuning |
| `RFD.FRENZY2.school` | `tools/gen_data.py` | count, swirl duration, eat-rate |
| `RFD.FRENZY2.blood` | `tools/gen_data.py` | duration, bite, speed |
| `RFD.FRENZY2.golden` | `tools/gen_data.py` | chance, coin burst, deadline |
| fallback objects in `engine3d.js` | code | degraded boot only when generated data is absent |

`SAVE_VERSION` and the persisted save shape are unchanged.

## Rev 3 (instanced prey and live camera contract, 2026-08-20)

### Camera correction

The shipped camera contract is the one implemented by `engine3d.js`, not the
stale Rev 1 value. It is perspective FOV 50 with the gameplay plane at z = 0.
The tier-1 dolly is z = 470; it pulls in by 10 units per shark tier and clamps
at z = 360 for the largest roster entries. Position remains `(px, -py, z)` and
lookAt remains the corresponding gameplay point. The 620 value in older prose
is superseded.

### Instanced prey lifecycle

`world3d.js` probes `RF.Art3D.buildFish(def)` during `World.init()`. A converted
definition is one whose guarded call returns a build with a BufferGeometry.
The accepted build shapes are either the build record itself or a mesh-like
`build.mesh` / `build.object` / `build.body` wrapper. A geometry-only record
receives the shared world-owned toon source material; only batch clones are
per-run resources. Unsupported, absent, or throwing builders leave that
definition on the billboard path.

For every converted definition, init creates exactly one `THREE.InstancedMesh`
with capacity `ENTITY_BUDGET.total`. Its `instanceMatrix` uses
`THREE.DynamicDrawUsage`, `frustumCulled` is false, and the cloned material has
vertex colors enabled. The mesh owns these per-instance attributes:

| Attribute | Meaning |
| --- | --- |
| `aBendPhase` | `entPhase(entity) + accumulated world clock` |
| `aBendAmp` | speed-fraction bend amplitude, exactly zero while frozen |
| `instanceColor` | per-entity tint, including status/golden tint, default white |

The entity view record is a preallocated slot record, not an Object3D. Slots
are dense. Acquire uses `count++`; release copies the last live matrix and all
three attributes into the released slot, updates the moved entity's slot, then
does `count--`. The mesh `count` and the live view-bank count therefore always
equal the number of active converted entities for that definition.

The fixed-step render pass composes each matrix from module scratch only:
`position.set(e.x, -e.y, 0)`, uniform scale from `displayLen`, z heading from
the smoothed display angle, and `rotation.y = PI` when facing left. No negative
scale is used for instanced fish. Matrix and attribute `needsUpdate` flags are
set once per dirty mesh after the entity pass, never once per entity.

Prey visual scale is a two-part contract. The requested final visual length is
`min(radius * 2.1 * localFishLength, playerRenderedLength * 0.72)` for a loft,
or `min(radius * 2.1, playerRenderedLength * 0.72)` for a billboard fallback.
The matrix scale divides the loft target by its local x width, so a tier-3+
fish cannot become player-sized merely because `displayLen` is multiplied by
the loft's local dimensions. `playerRenderedLength` reads the live
`RF.Game.ctx.player.def.sil.len` when available, with the 124px tier-1 target
as fallback.

### Instanced bend material variant

The cloned material installs the instanced variant of the bend contract. Its
`onBeforeCompile` adds uniforms `uBendK` and `uBendSpan`, attributes
`aBendPhase` and `aBendAmp`, and injects this exact chunk immediately after
`<begin_vertex>`:

```glsl
float bendT=smoothstep(uBendSpan.x,uBendSpan.y,-transformed.x);
transformed.z += aBendAmp*bendT*sin(aBendPhase+transformed.x*uBendK);
```

The material's `customProgramCacheKey()` ends in `:rf-bend-inst`, distinct from
the non-instanced bend variants. The base fish material is never mutated.

### Fallback, background schools, and teardown

If the fish builder is present but `InstancedMesh` or its attribute path fails
at init, the adapter first attempts bounded per-entity fish meshes from the
cached build and then falls back to the existing pooled billboard. If
`buildFish` is absent, unsupported, or throws, billboards remain the complete
render path and all simulation, eat, query, and AI behavior is unchanged.

Each zone also gets one non-interactive 32-instance minnow school at z about
-150 when the minnow build is available. Schools never enter the entity pool
or spatial hash; their bend phase drifts in the fixed render pass. Without the
loft/instancing path, each zone gets one merged billboard school instead.

World teardown detaches interactive batches and schools, removes their custom
attributes, and disposes their cloned geometries, attributes, and materials
through the existing ownership ledger. The persistent asset caches remain the
only documented cross-run render caches. The world selftest covers init-time
conversion, dense slot swap, frozen amplitude, bend hook/cache key, tint
attributes, one-draw-per-definition accounting, school count, no-builder
fallback, and repeated teardown.

`RF.Game.__resourceGate` is the browser half of the repeated-run proof. Call
`reset()`, sample after each real run ends, and inspect `report()`: sample 1 is
warmup, sample 2 is the baseline, and every later row must match it across
`renderer.info.programs.length`, `renderer.info.memory.geometries`,
`renderer.info.memory.textures`, and `scene.children.length`.

## Rev 3 (roster distinctness lane, 2026-08-20)

The accepted 2D roster remains the art baseline; `sharkart.js` is reference
only and is not modified by the 3D lane.

### Body colour and pattern contract

`shark3d.js` owns an explicit vertex-colour painter for every live
`sil.pattern` ID: `bands`, `boils`, `bones`, `collar`, `coral`, `corona`,
`cracks`, `dots`, `facets`, `faults`, `magma`, `mirror`, `mottled`, `panels`,
`plain`, `plates`, `plating`, `rays`, `ribbons`, `rings`, `rivets`, `rot`,
`runes`, `scales`, `scars`, `spikes`, `spots`, `stars`, `stripes`, and
`swirls`. `patches` is also reserved as a supported painter for future data
rows. Marks are hard-edged station/radial blocks on the body loft; they do not
interpolate between neutral colours. Tiger uses seven broad axial stripe
bands, sized to survive the 844x390 gameplay frame.

The authored `base`, `belly`, `accent`, and `glow` numbers remain available as
raw palette colours for feature materials. Body blocks use a hue-preserving
commit step only when a source swatch would disappear at gameplay scale:
dorsal/base, flank/base, pattern/accent or highlight, and belly. Glow remains
owned by emissive archetype/FX features; accent is used on fins, tail tips, and
the dorsal edge.

### Silhouette character contract

`finScale` drives a quadratic pectoral-span profile and the dorsal/pelvic
heights. Pectorals use head-specific polygon profiles (wide hammer, short
globular angler, broad whale, long swept fusiform, angular mech, and
serpentine eel). `tailScale` retains the existing length, heterocercal 1:0.62
lobe, 0.045L peduncle, and crescent-notch contracts while changing crescent
depth, root fullness, and lobe sweep. Head-specific body widths and station
profiles preserve mako/thresher sleekness, whale/kaiju mass, eel taper,
angler globularity, saw/croc rostra, rock facets, mech sections, void rings,
and the kaiju dorsal plate row.

### Distinctness gate

The renderer computes one signature per roster definition from the dominant
vertex-colour histogram of body and tail, raw palette swatches, body length and
aspect, tail ratio, pectoral/dorsal ratios, girth, pattern ID, head ID, and FX
ID. Distance is bounded to [0,1]: 31% colour, 50% body/fin/tail/length
proportions, and 6%/6%/7% categorical pattern/head/FX identity. A pair is
checked when `abs(tierA-tierB) <= 1` and `abs(actA-actB) <= 1`; every checked
pair must be at least `0.05`. The self-test reports the checked count, pair
count, threshold, and closest pair. This gate is additive and does not alter
the bend program, animation, +x nose, silhouette, or <=3500-triangle
contracts.

## Rev 3 (whale bulk/head repair, 2026-08-20)

The whale-family repair keeps `FUSIFORM_EXCEPTIONS` as the explicit girth/body
exception table for `eel`, `whale`, and `kaiju`. A separate `BULKY_HEADS` audit
table covers `blunt`, `angler`, `whale`, and `kaiju`, so the large-front rows
(`whaleshark`, `megalodon`, `gulperfiend`, `maelstrom`, `vortexa`, `omenmaw`,
and `leviathanrex`) are checked for the same alignment failure even when their
girth is clamped by the ordinary fusiform rule.

The `whale` spine is one smooth front-heavy loft: the rear quarter forms a
tapered peduncle, the shoulder grows toward +x, and the terminal profile eases
down into the committed front-head join. The former independent whale bulk box
is not part of the rig. Whale baleen is laid out from the committed mouth
`start`/`width` in `template.dimensions`, while the front head contour is
centered at `z=0` and overlaps the body loft before the +x nose.

The bulky-head self-test requires a committed front-head batch, zero axis
offset, positive +x extent, and at least `0.12 * bodyLen` overlap with the
spine. Whale rows additionally require a front profile at least `1.35x` the
rear profile and a terminal profile below `0.82x` the front profile. Distinctness,
silhouette, and the `<=3500` triangle sweep remain unchanged gates.
