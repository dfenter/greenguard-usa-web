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
`:rf-bend`, based on its base shader variant. The shell uses a restrained
`1.022` scale, colored `0x0a1a24`, and multiplies the bend amplitude by
`1.0 / 1.022` in its shader variant, so the outline does not drift away from
the body wave. The enumerated bend program variants must remain `<= 8`.

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
named `RF pose` and owns the visual read: yaw is `+0.42` for the normal
facing and `-0.42` when the outer group has the engine's left-facing `PI`
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

### Volumetric 3/4 read correction (2026-08-20)

The live gameplay camera is intentionally not a pure profile camera. Fusiform
spines therefore use `radiusZ / radiusY = 0.92` through the mid-body, with a
headless gate at `>= 0.72`; the radial mesh remains `flatShading` and keeps its
existing triangle budget. The pose yaw is `±0.42` and both pectorals splay
`0.35` radians off the body plane, allowing the near fin and a lower far-fin
edge to survive the 3/4 read. The shared toon ramp's darkest band is `0.30`,
and the baked belly floor is `0.74` so the directional key supplies the
countershade instead of a painted-on white underside.

The engine-owned boot light constants are exported as `RF.Game.LIGHT_RIG`:
hemisphere `0.55` and an upper-front-left directional key at `1.25` from
`(-120, 260, 420)`. `world3d.js` remains the sole runtime zone-atmosphere
writer after the lights are handed over.

### Camera correction

SUPERSEDED by the Rev 6 framing contract at the end of this document. (The
470/360 values in this section were stale prose; do not tune from here.)

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

SUPERSEDED by the Rev 6 framing contract at the end of this document.
Position remains `(px, -py, z)` and lookAt remains the corresponding gameplay
point; every dolly number in this section is stale.

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

## Rev 6 — OVERHAUL CONTRACTS (2026-08-21, owner rejection round; BINDING for lanes W/E/A/F)

Owner bar: graphics, animations, gameplay, and shark models must look AND
perform better than Hungry Shark Evolution. Art direction: CYBERPUNK reef
(neon-noir). All prior camera prose is superseded by 6.1.

### 6.1 Framing contract (Lane E owns; selftest-gated)

- Perspective `fov 50`, gameplay plane z = 0, position `(px, -py, z)`,
  lookAt z = 0 always (plane readability is law).
- Dolly is LENGTH-PROPORTIONAL, not tiered: `z = renderedLenPx * 1.60`,
  clamped `[185 .. 400]`. `renderedLenPx = SHARK_LEN_PX * sil.len` (124 base).
  Result: every shark reads ~31% of frame width (accept band 0.28–0.34,
  asserted at tiers 1/6/12 in the engine selftest).
- Pitch and look offset become fractions of z: `camY -= 0.17 * z`,
  `lookY += 0.07 * z` (≈9.6° tilt at any dolly).
- Yaw orbit hint: camState.yaw eases (2.5/s) toward
  `headingSign * 0.13rad * speedFrac`; applied to camera position only,
  lookAt unchanged. Quarter-view hint, NOT a chase cam.
- Lookahead 0.34s capped 150px. CAM_BOB amplitude 3. Pulse/FOV systems
  unchanged. `camZForTier` name stays exported, delegating to camZForLen.

### 6.2 Rig state-bag contract (Lane E writes, Lane A reads; NPC path world3d)

Player bag (engine3d stepAnim) gains, all numbers:
- `vy` (sim px/s, +y = down) — drives rig pitch. world3d NPC rigState gains
  `vy = e.vy` likewise.
- `preyNear` (bool) — true while an eatable target is inside 2.2*mouthR
  (0.25s refresh window). Drives jaw anticipation gape 0.85*gape (was 0.35).
- `lungeT` (s remaining of 0.22s lunge window).
- `tailPhase`, `tailAmp` — when finite these are the AUTHORITY for the bend
  phase/amplitude; shark3d keeps its internal integrator only as fallback
  (NPC/menu rigs pass undefined). TAIL_AMP_IDLE 0.03, TAIL_AMP_TURN 0.28.

### 6.3 Swim (carangiform) contract (Lane A owns shark3d.js)

- `bendK = 7.5 / bodyLen`; envelope span `[0.10 .. 0.48] * bodyLen` on
  `-transformed.x` (head+gills rigid; bend confined to rear ~40%).
- Idle amplitude floor 0.015 (internal fallback `0.015 + 0.32*speedFrac^1.3`).
- New uniform `uBendBias` (float, MUST be declared in the GLSL header):
  `bendZ += uBendBias * bendT;` set from `turn * 0.10` eased 8/s; oscillation
  amp scaled `*(1 + 0.35*|turn|)`. Shader source change ⇒ program cache key
  bumps to `:rf-bend2` (instanced fish key `:rf-bend-inst` untouched).
- Oscillators decouple via per-def seed `hash01(def.id)*TAU`; head counter-yaw
  0.012*speedFrac; body roll 0.02. ONE shader-variant change this round —
  eat/flash effects use pose-space transforms and vertex color, not new GLSL.
- Pitch from `state.vy * 0.0008` clamp ±0.22; sign verified on real GL
  (left-facing flip interaction).

### 6.4 World API contract (Lane W owns world3d.js; consumers guard `RF.World.*`)

- World 14400 x 4800 (gen_data.py WORLD + ZONES yMax 1200/2400/3600/4800).
- Build-time 2D SDF grid, 64px cells (Float32Array 225x75 + Uint8 region ids)
  rasterized from a deterministic (S.rng) cavern-graph: 4-6 caverns/band
  (900-1600px wide) + lateral tunnels (half-width 130-190px) + 2-3 vertical
  shafts per band boundary; value-noise edges; open water above y≈500.
- `World.terrainSDF(x,y) -> signed px (positive = water)`
- `World.resolveBody(body, r)` — push-out along SDF gradient + remove normal
  velocity component (slide, never bounce/snag). Called by engine stepMotion
  (player, after integration, before edge clamps) and world integrate (every
  mover incl. pickups).
- `World.regionAt(x,y) -> id` (flood-fill labels, built once).
- Spawn: ringPoint resamples ≤6 tries requiring `sdf > radiusFor(def)+24` AND
  same region as player. NPC steer whisker: sample sdf at pos+heading*120,
  rotate want-vector along wall tangent when < r+40.
- Near-rock render: marching-squares front cap z=+55 extruded to z=-130,
  `MeshLambertMaterial({vertexColors:true, fog:true})` lit by the existing
  rig, AO baked into vertex color from -sdf, chunked 1800px columns
  (frustum-culled; +2..4 draws typical). Parallax ridges stay as background,
  re-seeded to echo the maze. Budgets: total draws < 120, tris < 60k.

### 6.5 Eat contract (Lane E state/lunge, Lane A jaw, Lane W suction/panic, Lane F gibs)

- Lunge: eatable target in cone ±35° of heading, range 2.2*p.r ⇒ capture
  target POINT (numbers, never an entity ref — pools recycle), accel*2.4
  toward it for 0.22s, heading blend 0.35, cooldown 0.9s. `st.lungeT`
  published per 6.2; pose.scale.x pulses 1.06 during lunge.
- Jaw: open-wide on preyNear (0.85*gape, ease dt*10); snap-close on swallow
  (jawSnapT 0.12, close ease dt*24, 8% overshoot).
- Suction: `MOUTH.strength 260 -> 900` while `MOUTH.lunge` flag true
  (engine publishes the flag on the existing MOUTH object).
- Prey panic: mouth center within 170px ⇒ `panicT 0.6s`, FLEE_BURST +
  perpendicular jitter + doubled instanced bend amp.
- Gibs: NEW fx3d pool `gib` (24 quad items, prey-tinted, spin + drag + slight
  sink, 0.55s life), 4-7 per swallow scaled by meal tier; `poolFor('gib')`.
  deathBurst/motes emits stay.

### 6.6 Generosity + blood grammar (Lane E + Lane F)

- Eat gate: `tier <= p.tier + BITE_UP_BASE(1) + biteUp`; instant swallow
  `tier <= p.tier - 1`; MOUTH.eligibleTierMax mirrors the full formula.
- TOO BIG cue replaces the silent continue (0.6s cd: shake(2,70), dim ring at
  prey, chomp rate 0.7 vol 0.5, 'TOO BIG' toast).
- Blood Frenzy trigger: equal-or-bigger kills only (`tier >= p.tier`).
  One-shot crimson deathBurst (count 22) at the PREY position (scratch
  FRENZY_EAT_X/Y arrays). Player-attached mist loop is DELETED.
- Visual grammar law: RED = the player is hurt, nothing else. Frenzy vignette
  shifts to amber-gold 0xd98a2b. FRENZY2.blood buff numbers unchanged.

### 6.7 Powerups (HM port; Lane E lifecycle/economy, Lane W spawn/drift, Lane F FX/HUD)

- Pickup capsules (weighted table in data.js via gen_data.py; drop from
  notable kills + rare ambient): OVERDRIVE (speed surge + afterburner wake,
  8s), SHIELD BUBBLE (absorbs 2 hits), MEGA-JAW (+1 bite reach & +1 instant
  swallow, 10s), FRENZY MAGNET (suction radius x2.5, 8s), CHUM CLOUD (prey
  converge, 6s), APEX SURGE (overdrive+mega-jaw, 5s, legendary-rare).
  GOLD RUSH stays as shipped. Buffs stack through the single-cue bus; one
  vignette at a time (priority: damage > frenzy > gold rush > buff).
- Superpower active: each shark's elemental active becomes a charged power:
  dedicated HUD button + double-tap trigger with HM's exact humane
  thresholds (any-pointer taps, arm <400ms held & <34px moved, confirm
  40-500ms & <160px; see horde-meridian game.js:2640-2662). 3 opening
  charges, cap 8; charges earned at combo streak thresholds and frenzy
  completions. Leviathan Rex Atomic Breath remains the tier-12 ceiling.

### 6.8 Controls contract (Lane E; owner law: EXACT horde-meridian mechanics)

- STICK_DEAD 0.03. When stick active: `p.angle = atan2(iy,ix)` instantly;
  `p.vx/vy = cos/sin(p.angle) * speedCap * mag` direct assignment. Idle:
  hard stop vx=vy=0. NO turn-rate cap, NO accel lerp, NO idle drag
  (TURN_EASE_MIN/MAX, IDLE_DRAG deleted).
- EXCEPTION: while airborne (p.y < 0 breach arc) stepControl must not write
  vy (gravity owns it) — vx only, no vy hard-stop.
- `ctl.turnIn` becomes presentation-only, derived from actual heading delta
  normalized by `s.turn * TURN_BOOSTA * STEP`; feeds bank/tail/pose only.
- 2nd-pointer boost, boost meter, keyboard merge, liveMult speedCap all stay.
- Rig yaw may get a render-side-only visualAngle slew (~20 rad/s) if reversal
  snap reads broken on device; MOUTH/camera/movement always use p.angle.

### 6.9 Cyberpunk art direction (Lane V bible; implemented by file owners)

- Palette: deep teal/indigo water; accents hot magenta 0xff2bd6, cyan
  0x27e0ff, acid green 0x9dff2b; amber 0xd98a2b reserved for frenzy/reward,
  red reserved for damage. Zone arc: shallow = warm sun + subtle neon,
  abyss = pure neon glow on near-black.
- Env: emissive neon tips on kelp/coral (vertex color, no textures); sunken
  cyber-ruin props (holo billboards, conduit lines, drifting drones) as
  merged billboard batches in the existing decor system; caustics/god rays
  tinted per zone; deep-zone motes = data-mote sparkles.
- Spectacle: boost afterburner wake (trail ribbon + speed lines pool); eat
  shockwave ring + chromatic pulse; frenzy electric arc crackle via vertex-
  color flash (NO new shader variant); tier-up/pickup hologram materialize;
  elemental actives full-screen-worthy.
- HUD: synthwave restyle (scanline/glow, neon chips) — CSS + existing DOM.
- SCREEN BALANCE LAW (owner): in-run HUD = hp/hunger, score+combo, boost
  meter, power button, minimap ONLY. Everything else through ONE queued
  toast slot (cooldown, never stacked, corner-anchored, safe-area margins,
  auto-fades during frenzies). One vignette at a time. Layout gate: no
  element overlap at 844x390 and ≥60% of frame UI-free in normal play.
- Readability law: flash never obscures gameplay; contrast-validate FX vs
  measured backdrop. Budgets unchanged: draws < 120, tris < 60k, ~30MB iOS
  texture ceiling, zero new texture fetches.

### 6.10 Landscape menu + dev mode (Fable direct)

- `@media (orientation: landscape) and (max-height: 480px)` compact variant:
  ≥2 card rows visible at 390px height, 44px touch-target floor holds.
- DevMode switches mirror to sessionStorage 'rfDevSession' (NEVER
  localStorage), rehydrated when the query is absent; `?dev=0` /
  `__rf.clearDev()` escape. Triple-enforcement selftest passes unmodified.
  engine3d reads `forceInvincible` (the `invincible` field name was a dead
  read — fixed).

### 6.11 Fix-round 2 contracts (2026-08-21, post-Luna-review; BINDING)

- PICKUP ID SEAM: world writes `e.buffId = '<id>'` (plain id: overdrive/shield/
  megajaw/magnet/chum/apex) on buffpickup entities; engine reads e.buffId ONLY.
  stepPickups runs BEFORE stepEat and buffpickup entities are excluded from
  eatQuery consumption (never edible, never scored).
- CHUM SEAM: engine keeps publishing ctx.run.buffs.chum; world3d's prey AI
  reads it via its update ctx and converges prey toward the player while > 0.
- NURSERY LAW: no predator may spawn within 1600px of a player whose tier is
  <= 2, regardless of zone/region; predator AI leashes (no pursuit) when
  target tier <= 2 and the predator entered from another zone band.
- CONTROLS EXACTNESS: keyboard merges WITH the stick (HM game.js:5445), not
  only when the stick is idle. OVERDRIVE buff = HM's overdrive semantics:
  1.42x with accel 860 px/s^2 clamp + braking (HM :5453-5476).
- LUNGE: arming range is 2.2 * p.r (body radius, ~115px tier 1) as 6.5 wrote,
  NOT 2.2*mouthR; cooldown 0.9 -> 0.5s; per-target chew cd 0.25 -> 0.15s.
- FRENZY SUSTAIN: blood trigger relaxes to `tier >= p.tier - 1`; zone
  pressure hunger multiplier 3 -> 2 (starve-out at boundary was 25s).
- MEGAJAW/FRENZY: swallow() sets ent.hp = 0 before the frenzy record so
  instant swallows still qualify.
- MAZE REACHABILITY: connectivity selftest must be body-radius-aware (BFS
  with clearance = tier-12 radius 98 + 24); carving widens until it passes.
- SDF dims: the grid is 226x76 CORNER samples (225x75 cells) - 6.4's numbers
  were cell counts; this sentence is the authoritative wording.
- HUD: score+combo and a HUNGER/hp readout are REQUIRED in-run elements
  (screen-balance law list is amended to include them); name/coins leave the
  in-run HUD (menu/results only).
- ART BAR (from review, all CRITICAL): hero-recut shark faces/palettes
  (visible eye/jaw/gill/brow, saturated indigo+cyan+magenta accents,
  progressive by tier, <=3500 tris/shark holds); rock = irregular contour
  caps + triangulated faces + neon fault lines (no square cell seams);
  emissive/additive accent batches so neon is VISIBLE in ordinary play;
  staged bite/boost/frenzy spectacle (layered shockwave, chromatic pulse,
  fragments, afterburner ribbon, orbiting arcs); distinct ability signatures
  with Atomic Breath as the ceiling; menu thumbnails from baked 3D renders
  (memory-bounded per the iOS 30MB lesson); tutorial copy never clipped at
  844x390; draws < 120 / tris < 60k still gate.

### 6.12 Fix-round 3 contracts (2026-08-21, post re-review; BINDING)

- STICK MATH (HM-exact, final form): velocity = stored normalized components
  * speedCap * min(1, rawLen) applied ONCE - never normalized components
  multiplied by magnitude again (half deflection must give 0.5x, not 0.25x).
- PREY SENSING RANGE: preyNear detection range = 2.2 * p.r (body radius,
  same as lunge query). One shared eligibility helper feeds preyNear, lunge,
  and stepEat: includes megajaw's +1 while active, excludes kind 'pickup'
  AND 'buffpickup'.
- SUPERPOWER OPENING: ability meter starts FULL at run start, so one of the
  3 opening charges is immediately usable; meter+charge economy unchanged
  after the first fire.
- BUFF CADENCE: ambient buff roll happens BEFORE the entity-cap early return
  in runSpawner; live buffpickup concurrency cap 2; spawnBuffDrop respects a
  10s global drop cooldown. Result: a reliable trickle, never a flood.
- BLOOD FRENZY THRESHOLD: `ent.tier >= (p.tier >= 4 ? p.tier - 1 : p.tier)`
  - equal-or-bigger early (earned), tier-1 grace late (sustains scarcity).
  No re-trigger refresh while blood.t > 2 remains.
- PUBLIC SPAWN LAW: spawnOne/spawnBurst enforce the same nursery distance,
  SDF clearance, and region checks as runSpawner (resample or skip).
- HUD ONLY-LAW (final): in-run persistent chrome = hunger/hp, score+combo,
  boost, power button, minimap. Buff feedback lives in the power-button pips
  + toast slot; the buff bar row is removed. The DEV tag does not render
  in-run (menu chip + toast on run start only).
- ROCK WELD: contour jitter keyed by STABLE EDGE KEY (shared between
  adjacent cells - no cracks); uniform-row interior fill replaced by welded
  irregular polygons; no axis-aligned rectangular seams at gameplay scale.
- NEON LANDMARKS: each zone gets 2+ large camera-visible emissive landmarks;
  abyss gets a readable ruin skyline; emissive contrast raised until the
  neon identity is visible in an ORDINARY gameplay frame (not only closeups).
- SPECTACLE WIRING: staged bite FX fire on every COMPLETED bite with
  {tier: mealT}; ONE boost emitter authority (fx3d owns; engine speedlines
  emitter removed); frenzy uses rig rfArcs via player.rig.group.userData
  (fx3d's player.rig.userData lookup is a bug); hologram wired to pickup
  toast; Atomic Breath gets dedicated wind-up/impact signature.
- PREY PANIC CUE: the lunge-captured target gets a visible cue (tracer
  particles or instance-color flash) beyond movement thrash.

## Rev 7 — COHERENT-ANIMAL + GAME-LOOP CONTRACTS (2026-08-22, owner rejection round; BINDING for lanes S1-S5, L1, L2)

Plan: ~/.claude/plans/ok-for-razorfin-the-dynamic-willow.md. Reference art:
~/Downloads/sharks.jpg + sharks2.jpg (HSE rosters). Bar: every shark reads as ONE
cartoon animal with exaggerated head/jaw/eyes; every fish reads as a fish; every
visible fish is eatable or visibly a hazard; eats never hitch; the finger drags
the head. Rev 6 laws stay in force unless explicitly replaced below.

### 7.1 Controls — head-drag (REPLACES 6.11 CONTROLS EXACTNESS; Lane S1 owns engine3d.js)
- The steering pointer is a WORLD TARGET, not a joystick. Each fixed step the
  engine unprojects the finger's CSS point through the live camera (zoom/pulse
  safe) into world coords ctl.tx/ty.
- Heading: p.angle eases toward atan2(ty-heady, tx-headx) at turnRate =
  10 + 6*clamp(distCss/240, 0, 1) rad/s. No instant snap.
- Speed: mag = clamp((distCss - DEAD)/(FULL - DEAD), 0, 1) with DEAD =
  max(18, 0.4*headRcss), FULL = 180 CSS px. want = speedCap*mag.
- Arrival/release: velocity approaches want at ACCEL >= 8*speedCap /s (feels
  direct, not floaty); on release or arrival decay velocity with GLIDE tau
  ~0.18s — never a hard vx=vy=0 while moving.
- Keep verbatim: second-pointer boost, keyboard merge (keys act as a virtual
  target 220 CSS px along key direction), double-tap superpower, overdrive
  accel/brake exception, ctl.turnIn presentation feed (now = eased heading err).
- Selftest: heading never changes more than turnRate*dt per step; speed
  monotone in distCss; release leaves |v| decaying, not zero-step.

### 7.2 Eatable-or-hazard law (Lane S2 owns world3d.js; S3 supplies data)
- buildBackgroundSchools is DELETED. No fish-shaped render outside the entity
  pool. Ambient density comes from spawn-table weights (S3).
- Hazards must read as hazards: jelly gets translucent pulse tint + tendrils,
  puffer gets spike inflation (view-layer treatment in world3d hazard path).
  Player contact with an inedible hazard emits flinch + toast('Stings!') via
  existing channels, cooldown 1.2s (engine already suppresses TOO BIG for
  hazards; world publishes the sting event on kit bus 'rf-sting').
- Zone spawn tables (S3, gen_data.py): a zone's table may contain prey only up
  to intendedTier(zone)+2. TOO BIG cue for over-tier prey stays.
- world3d selftest gate: iterate all zone spawn defs — each is (kind prey and
  tier <= intended+2) or kind hazard.

### 7.3 Eat-path perf (S1 engine3d popups, S5 fx3d chroma)
- paintPop: replaced by a pre-baked glyph atlas (digits 0-9 + 'x + . COMBO
  GOLD', two weights) built ONCE at init; pop sprites are pooled quads with
  per-glyph UVs. ZERO canvas 2D calls and ZERO texture.needsUpdate after init.
- pulseChroma: no per-eat DOM style writes or closures. Replace with a pooled
  fullscreen GL quad in fx3d (opacity uniform driven in the fx update loop);
  chromaEls DOM path deleted.
- hitStop eat values 40/60ms -> 25/45ms.
- Gate: scripted 20-eat probe, no frame > 20ms attributable to eat path.

### 7.4 Welded shark rig (Lane L1 owns shark3d.js; design in plan D4)
- ONE welded indexed BufferGeometry: spine loft + tail crescent + dorsal +
  pectorals sharing ring vertices at appendage roots. Jaw remains the only
  separate articulated mesh, with its own 1.022 BackSide shell, same
  vertexColors ramp family, hinge hidden in mouth-cavity color band.
- Bend v3: uniforms uBendPhase/Amp/K/Span/Bias + NEW uTailAmp/uTailSpan; tail
  envelope over rear ~18% shares uBendPhase. customProgramCacheKey suffix
  ':rf-bend3'. bendOffset CPU mirror updated. Tail CPU rotation deleted.
- Exaggeration: exaggerationFor(head, sil) table (headScale/jawScale/eyeScale/
  bellyDrop per plan numbers); girth de-clamp radius = bodyLen*(0.085 +
  0.14*girthNorm^1.2). addFaceMass + profileAt snout collapse deleted.
- Eyes: hemisphere white + proud pupil disc + catchlight, per side, in the
  bendable feature batch.
- Shading: MeshToonMaterial 4-band, smooth normals for organic heads, flat
  retained for rock/mech/kaiju via archetype flag; ONE body material
  vertexColors:true incl. fin accent blocks (hard edge 1-2 rings inboard).
- Contract keeps: buildShark(def) -> {group, parts, animate}; pose hierarchy;
  worldScale bbox X = 96*sil.len; engine tailPhase/tailAmp authority; rfArcs/
  rfFlash userData. parts.tail/pectL/pectR = null + userData.rfWeldedAppendages
  = {tail:true,dorsal:true,pectorals:true}. Selftest: tri gate 4200/rig, key
  ':rf-bend3', jaw shell present, peduncle-continuity check (bend applied on
  CPU mirror: max seam gap at shared rings == 0 by construction, assert shared
  indices), roster girth spread >= 0.35 relative.

### 7.5 Fish rework (Lane L2 owns fish3d.js + installInstancedBend REGION of
world3d.js delivered as NOTES-rev7-laneL2-world3d.md patch; orchestrator applies)
- RADIAL_SIDES 8; TRIANGLE_LIMIT 350 (~280 actual); rounder stationProfile ends
  ~0.30/0.35; radiusZ = 0.62*radiusY; fins are CLOSED wedges angled out of
  plane (forked tail fan +-15deg, dorsal, swept pectorals, pelvic/anal); round
  proud 8-gon eye both sides.
- Instanced bend v2: bendAmp = INST_BEND_AMP*(0.28 + 0.72*speedFrac) (frozen
  still forces 0), Y ripple + tail-heavy squared envelope in INST_BEND_CHUNK,
  cache key ':rf-bend-inst2', world3d shader-probe strings updated same change.
- Add lofts for the 4 palette-missing defs (ray, turtle, squidling, giantsquid)
  OR explicit stylized billboard upgrade — no def may fall back silently.

### 7.6 Economy: gems, relics, missions (S3 meta.js+gen_data.py+data.js; S2
world relics; S4 ui3d; S5 fx)
- SAVE_VERSION bump. Profile adds: gems:0, relics:{zoneId:[bool...]},
  skins:{}, missions:{active:[ids], progress:{}, completed:{}}. defaultProfile
  + validateSave + normalize + migrate in ONE change; meta selftest gains an
  old-save fixture that must survive migration with coins/xp/sharks intact.
- Gems awarded: frenzy completion (GoldRush 2, Blood/School 1), mission
  complete (per-def 1-5), daily first-run +2, rare 'gempickup' world drops.
  Gems NEVER purchasable. Spent on: skins, secret-shark unlocks, superpower
  top-ups (Meta.spendGems(kit, n, reason) single authority).
- Relics: data.js RELICS table, 3 per zone x 4 zones, deterministic seeded
  placement (seed = zone id) in maze dead-ends; entity kind 'relic', excluded
  in eatEligible, collected in stepEat pickup path -> ctx.run.relics[]; full
  zone set => unlock skin/bonus shark in endRun.
- Missions: data.js MISSIONS table (eatCount/findRelic/surviveZone/score
  types); 3 active per run chosen by Meta.rollMissions; progress events via
  existing kit bus; ticks shown via toast/chip only. endRun payload adds
  gems, missionResults, relicFinds; ui3d Results/Shop/Collection render them.
  HUD adds ONLY a gem counter beside coins (HUD only-law otherwise intact).
- Creatures gain tint field (gen_data.py); engine swallow uses e.def.tint for
  burst color (kills the constant-amber bug); S5 consumes.

### 7.7 Ownership map (BINDING)
S1 engine3d.js | S2 world3d.js (minus installInstancedBend region) | S3
meta.js + tools/gen_data + data.js | S4 ui3d.js | S5 fx3d.js | L1 shark3d.js |
L2 fish3d.js (+ world3d bend region via patch file). index.html/sw.js/
selftest runner: orchestrator. game.js/world.js/juice.js/index2d.html are DEAD
— touching them is an automatic review REJECT.

## Rev 8 — CARTOON SHARK RESTART (2026-08-23, owner rejection: "looks like a racecar or boat, start over, cartoon shark"; BINDING)

### 8.1 One canonical cartoon body (replaces the per-head profileAt hull cascade)
The owner's bar is the HSE reference: EVERY shark shares ONE chunky cartoon
body plan; species identity comes from color, proportions-within-limits, and
props — never from a different hull concept. Canonical proportions (fractions
of body length L, measured off the reference images; body = side profile):
- Body depth (max, at ~0.40L from nose): 0.32-0.40L. Fat teardrop; max depth
  forward of center, full rounded belly. NOT a slender dart (old girth read
  ~0.18-0.24 = the "boat").
- Head: blunt and rounded, snout tip radius >= 0.06L (no pointed prow). The
  front 0.30L is head: forehead dome curves down into the mouth.
- Mouth: underslung grin cut spanning 0.20-0.30L, corner up-curved, ALWAYS
  open enough to show a white tooth band (teeth visible at rest, not only
  when biting). Lower jaw slab visibly lighter/belly-colored.
- Eye: on the head side, diameter 0.10-0.14L (0.30-0.40 of head height),
  white sclera + dark pupil + catchlight, placed high, slight forward tilt.
- Dorsal: rounded-triangle, height <= 0.16L, tip swept back, base 0.14-0.18L
  — a fin, not a sail.
- Pectorals: small and cute, 0.10-0.14L, angled down-back.
- Tail: crescent, span 0.22-0.30L, joined through a THICK peduncle (depth
  >= 0.10L at the join — no wasp-waist).
- Cross-sections: round-to-oval everywhere (radiusZ >= 0.80*radiusY through
  the mid-body); smooth normals; no visible hard chines along the flank
  (chines = boat read).
- Per-def variation limits: depth/length/head scale within +-20% of
  canonical; heavy rows (whale/kaiju) may go to depth 0.45L. Head archetype
  ids from data.js now select FACE/prop presets (jaw width, brow, horns,
  hammer foil, etc.) layered on the canonical hull — never a hull swap.
- All Rev 7 welded/winding/bend/:rf-bend3/outline/ramp laws stay in force.
  Identity props from the Pantheon rounds are re-mounted on the new hull and
  must keep their contour-level reads.
- Gate: an automated proportion probe measures rendered silhouette (depth/L,
  head fraction, snout radius, dorsal height, tooth-band visibility >= 60% of
  mouth span white pixels) on every def; art3d selftest enforces the ranges.

### 8.2 Controls — pure pursuit, nose leads (replaces 7.1 head-drag hybrid)
"Where your finger points should lead where the head goes."
- While touching: the NOSE point (snout tip, not body center) continuously
  seeks the finger's world point. Heading turns toward the finger at
  turnRate >= 14 rad/s (effectively immediate but continuous — no snap
  flicker, no recenter, no dead-zone larger than 0.5*noseR).
- Speed: full cruise whenever the finger is > 60 CSS px from the nose;
  smooth ramp inside that. The shark ARRIVES at the finger and rests nose-at
  -finger (gentle orbit damp, no jitter), it never overshoots and circles.
- The finger is ALWAYS the target while down — dragging sweeps the shark
  along the drag path head-first. Release: short glide, then idle drift.
- Boost second finger, double-tap superpower, keyboard = virtual finger:
  unchanged. Zero allocations per step.
- Gate: scripted probe drags a path (circle + zigzag); assert nose tracks
  within 90 CSS px of the finger after 300ms settle on every segment and
  heading error < 25deg while moving.

## Rev 9 — ASSET-BASED SHARKS (2026-08-23, owner: "scrap the modeling system... closer to the original game"; BINDING)

### 9.1 Why
Four rejection rounds on the procedural loft system (Rev 3-8): every result
read as parts glued together; a bystander could not identify the animal. The
concept is retired. Rev 9 uses artist-made skinned GLB base meshes (HSE's own
model: sculpted base + skeletal swim + recolors), in play/razorfin/assets/models/
(licenses in LICENSES.md): shark.glb (primary, 8-bone spine, Swim clip,
materials Top/Bottom), shark_b.glb (static alt body), whale.glb (13-bone),
manta.glb, dolphin.glb, fish_tuna/fish_blue/fish_clown.glb (8/6-bone).

### 9.2 Shark rig (shark3d.js is REWRITTEN; the loft/feature/welding code is deleted)
- Base selection per def from data.js head/act: whale/kaiju heads -> whale.glb;
  hammer/saw/etc -> shark.glb with a head prop; everything else shark.glb
  (shark_b.glb may serve a second body family, e.g. bulky rows).
- Per-def identity = (a) material-slot recolor Top/Bottom/Fins from the def
  palette (resolved to the Rev 7 saturation ranges), (b) procedural PATTERN in
  the fragment shader (stripes/spots/bands/scars computed from bind-pose
  position, onBeforeCompile on the skinned material; cache key ':rf-skin1'),
  (c) bounded non-uniform scale (length 0.85-1.35, height 0.9-1.3, applied on
  the armature root so skinning stays valid), (d) emissive glow tint for act
  2-5, (e) at most ONE bone-mounted prop for special rows (crown/horns/foil/
  spikes) parented to the head/spine bone so it moves WITH the animal. No
  other geometry is added to the animal. The eye and mouth are the asset's.
- Animation: AnimationMixer plays Swim; timeScale = 0.6 + 1.6*speedFrac
  (engine tailPhase/tailAmp authority is retired — engine state.speedFrac,
  turn, lunge, biting drive the mixer/pose). Turn lean = root yaw/roll from
  state.turn (eased). Bite = head-bone pitch pop + scale pulse 1.11x + FX (the
  assets have no jaw bone). Death = mixer pause + roll.
- Outline: single BackSide shell of the SAME skinned geometry (shares skeleton)
  scaled 1.01, ink color — or none if it causes artifacts; toon banding stays.
- Contract keeps: RF.Art3D.buildShark(def) -> {group, parts:{body,jaw:null},
  animate(t,state)}; group scaled so bbox X = 96*sil.len; userData rfArcs/
  rfFlash preserved for engine FX hooks; bendableMaterial/:rf-bend3 exports
  REMOVED (grep engine3d/world3d for any consumer and shim as no-ops).
- Loading: RF.Art3D.preload() -> Promise resolving when all GLBs are parsed
  (GLTFLoader from /play/_shared/three/GLTFLoader.js); engine boot awaits it
  before showMenu. buildShark stays synchronous (clones from the parsed cache
  via SkeletonUtils.clone semantics — implement a local clone that shares
  geometry and duplicates skeleton/bones).
- Draw budget: <= 3 draws per shark (body, shell, prop). Selftest: node needs
  a fs-backed GLB parse path — the selftest may construct the loader with a
  FileReader/fetch shim or parse the GLB JSON+BIN directly; gates: all 85 defs
  build, base/prop mapping table complete, pattern shader chunk declares its
  uniforms, mixer clip present, scale bounds, <=3 draws.

### 9.3 Fish (fish3d.js + world3d instancing)
- Prey geometry = REST-POSE geometry extracted from fish_tuna/fish_blue/
  fish_clown/manta/dolphin GLBs (skin dropped), per-species tint + procedural
  pattern; the existing instanced bend shader (:rf-bend-inst2) keeps the
  swim — real fish shapes, instanced draw counts unchanged.
- Species map: 16 prey defs -> 5 bases x tints/scale (document in fish3d).

### 9.4 Clarity ("way too many random fish")
- ENTITY_BUDGET onscreen 110 -> 48, total 220 -> 120. Each zone spawn table
  lists at most 3 prey species + hazards; schools are cohesive (6-10, tight
  spacing) rather than scattered singles. Decor must not resemble fish.
- Larger, fewer, readable targets; the eat gate/mouth contract is unchanged.

### 8.2a Amendment (Rev 9, 2026-08-23): seek anchor = BODY CENTER
Owner: "cannot dive down." Root cause: nose-anchored distance + close tier
camera (shark radius ~100 CSS px) meant a finger below the shark could never
exceed the nose's dead/arrive zone on a 390px-tall screen. Distance/speed
magnitude is now measured center->finger; heading is atan2 of the same
vector so the nose still leads. Dead zone = min(0.5*noseR, 14) CSS px.
Gate: real-touch probe (touchprobe.js) — hold-below must produce vy >= +0.6*
cruise within 1s; hold-above symmetric.

### Rev 9.5 open ocean (2026-08-24)
mazeRawSDF/buildMazeLayout (the Rev 6 rock-maze cavern-graph generator) are
replaced with an open-ocean SDF generator. buildSDFGrid/terrainSDF/
resolveBody/regionAt are unchanged (they were already generic reads over
whatever mazeRawSDF produces). Geometry:
- seabedY(x): rolling profile (3 summed sine octaves, S.rng-seeded phases),
  clamped to OCEAN_SEABED_Y=[4300,4600], dipped by 2-4 trenches
  (OCEAN_TRENCH_Y=[4650,4750], width 500-1000px, cosine-smoothed dip).
- 6-10 mounds (OCEAN_MOUND_N): each a tapered-cone SDF from its seabed base
  (radius OCEAN_MOUND_BASE_R=[420,900]) up to a summit (radius
  OCEAN_MOUND_BASE_R * OCEAN_MOUND_TOP_R_FRAC=[0.18,0.42]). Summit height is
  base_y - waterColumn*topFrac, topFrac in OCEAN_MOUND_TOP_FRAC=[0.35,0.95]
  (0.95 for the first two mounds specifically, so at least one summit
  reliably pierces near zone 1 every run). Mound centres keep >=2200px from
  the spawn x (S.w*0.5) so a tall summit can never intrude on the spawn
  keepout ring.
- 2-4 small "pocket" spheres per mound (OCEAN_POCKET_R=[70,120]), carved out
  of the mound solid (raise SDF back toward water inside the sphere) at
  random heights up the slope — these are the relic sites (see below). The
  tall mounds' pockets are biased toward the upper slope (u in [0.55,0.95])
  so zone 1 always has real pocket candidates.
- Compat: the old per-feature arrays mazeCavernX/Y/R/Seed, mazeTunnels,
  mazeShafts are KEPT (same field shapes) because a long tail of downstream
  code reads them generically (decor's findWallY sweep + kelp/reef anchors,
  zoneLandmarkAnchors, mazeEchoWave, deadEndScore/placeRelicsForZone).
  mazeCavernX/Y/R/Seed now hold one row per mound (anchored 40% up its
  slope); mazeTunnels holds one row per trench (a flat segment along its
  dipped floor); mazeShafts holds one row per pocket (a short vertical span
  at the pocket's world position).

Open-column invariant (replaces Rev 6.11's bfsBandReachability BFS, which
proved band-to-band flood-fill connectivity through tunnels/shafts — open
water is now the connective tissue, so that BFS no longer applies):
verifyOpenColumns(clearance) walks a vertical ray at the centre x of every
OCEAN_XBAND=1200px-wide slice and requires a clearance-walkable (sdf >
clearance) path from SDF_OPEN_Y down to 0.8x the local seabed depth.
ensureOpenColumns() (called once from buildMaze(), like the old widener) re-
checks after generation and, on failure, deterministically SHRINKS the base
radius of any mound overlapping a failing band's x (no new S.rng draws),
rebuilds only the SDF grid, and repeats up to OCEAN_SHRINK_MAX_TRIES=8.

Zones are DEPTH BANDS (gen_data.py ZONES, y-ranges only — id/name/tint/fog/
spawns unchanged): 1 Sunlit 0-1100, 2 Reef 1100-2300, 3 Twilight 2300-3500,
4 Abyss 3500-4800. zoneAt(y)/regionAt/applyZoneAtmo are unchanged generic
reads over the ZONES table, so no code change was needed there.

Relics: placeRelicsForZone/deadEndScore (SPEC3D 7.6) are reused as-is except
the "dead end" openNeighbors gate is widened from [1,2] to [1,3] open
neighbors out of 4, because a pocket's rounded sphere boundary against the
SDF_CELL=64 grid can leave a valid interior cell with up to 3 open
neighbors (a maze corridor dead-end and a mound-flank pocket read
differently at grid resolution, even though both are "an enclosed water
cell just off open space").

Selftest gates (tools/selftest.mjs world), replacing the maze-specific
tier-12 BFS clearance gate:
- verifyOpenColumns(MAZE_CLEARANCE) passes for every 1200px x-band.
- seabedY(x) stays within its authored band across the whole map width.
- No rock within 600px of spawn (7200,260), sampled on a 24-ray x 7-radius
  ring, excluding the SDF_CELL-wide world-top/bottom edge rock band (an
  expected, pre-existing edge artifact unrelated to gameplay rock).
- ZONES bands are contiguous and cover 0..S.h with no gap/overlap.
- Every placed relic sits at sdf>0 (real water) inside its own zone's
  y-range.
- resolveBody push-out invariant (unchanged, generic) and the 200-sample
  ringPoint spawn-validity check (unchanged, generic) both still pass
  against the new SDF.

Played probes (headless Chrome via puppeteer-core, see NOTES-rev9-ocean.md
for full output): sdfprobe.js holdBelowTrack shows y increasing
continuously for the full ~2.7s hold at ~299px/s average with vy pinned at
288 the whole time (no floor stall); plainload.js boots to the HUD screen
with zero console/page errors; density_probe.js reports 38 visible prey in
6 groups with zero errors.

### 9.6 STYLE CORRECTION from official HSE screenshots (2026-08-23, BINDING for all art lanes)
Reference set: scratchpad hse_refs/ (12 official App Store screenshots) — the
bar is these, not the roster thumbnails. What they actually show:
- SHADING: smooth (no facets), gradient lit with SPECULAR highlights and soft
  ambient, subtle painted texture (scales/scars), strong countershading. NO
  toon banding, NO ink outline shell. Use MeshStandard/Phong-class lighting on
  the GLB atlas; retire MeshToon + BackSide shells for sharks.
- FACE: heavy BROW RIDGE over a smallish squinting eye (angry/determined, not
  googly), huge OPEN JAWS with gum line and many individual teeth, visible
  mouth cavity; the mouth is the character. Sharky's LowerJaw bone must rest
  partly open (gape 20-35%) and snap on bite.
- BODY: muscular, smooth, big pectorals, thick tail root; species read from
  proportions + texture, not props.
- CAMERA: shark occupies ~25-35% of screen WIDTH at cruise (ours fills ~50%);
  dolly out accordingly (camZForTier x1.5-1.8), keep the slight 3/4 angle.
- WORLD READ: rich painted environment (wrecks, coral, rock, kelp), prey are
  SMALL relative to the shark, spread in loose lines/schools; varied species
  (fish, rays, turtles, jellyfish, divers, mines) rather than clumps of one.
- HUD: minimal, corners only; no dark panels over play space.

## Rev 12 — LEVELS, CLASSES, GOLD MODE, SHARKJIRA, ZOOM (2026-08-23, owner + son; BINDING)

### 12.1 Levels (12 locations)
data.js LEVELS (gen_data.py): hawaii, mexico, belize, maldives, newzealand,
alaska, tahiti, azores, bali, aruba, jamaica, california. Each: id, name,
unlock (coins or gems or prior-level score), sky preset (sky gradient +
horizon silhouette theme: hawaii volcano+palms; mexico cliffs+cacti/ruins;
belize barrier reef+cays; maldives atolls+overwater huts; newzealand fjords
+snow; alaska glaciers+icebergs; tahiti peaks+lagoon; azores volcanic isles;
bali temples+rice terraces; aruba divi trees+beach; jamaica green hills;
california cliffs+pier+kelp), water color script (surface tint, band tints,
haze), seabed type (sand/reef/rock/ice/kelp/volcanic), prey mix weights and
special creatures (alaska seals/orca-class predator, california sea lions,
belize rays, maldives mantas, azores whales), hazards.
- ABOVE-WATER backdrop: when the camera sees above the surface (breach or
  near-surface swim), the level's sky + horizon silhouette layer renders
  (parallax quads, world3d "sky" layer at z -600), matching the location.
- Level select: ui3d Menu -> Level cards (name, thumbnail = sky preset
  swatch + icon, lock state, best score) -> DIVE. ctx.level drives world init
  (seabed/sky/palette/prey mix). Save: profile.levels {id:{best, unlocked}}.

### 12.2 Shark classes
data.js SHARKS gain `cls`: common (act 1 tiers 1-4), rare (act 1 5-6, act 2
7), epic (act 2 8, act 3 9-10), legendary (act 3 11-12), god (act 4), demon
(act 5). UI: class badge + color (common gray, rare blue, epic purple,
legendary gold, god radiant white-gold, demon infernal red) on roster/shop
cards and the run HUD name plate; roster grouped by class within acts.

### 12.3 Sharkjira
leviathanrex is RENAMED "Sharkjira" (id stays) — a Godzilla-like kaiju
shark: charcoal-black hide, jagged dorsal plates down the spine (morph, not
prop), glowing atomic-blue spine/gill/eye emissive, massive underbite jaw;
active = Atomic Breath (existing). Class legendary. Menu blurb updated.

### 12.4 Special modes / power-ups (son's list: GOLD MODE)
- GOLD RUSH exists (meter); make it a visible MODE: gold tint on everything
  edible, gold vignette, 2x coins, invulnerable, faster; HUD banner "GOLD
  RUSH!"; meter fills from eating + combo; shown on HUD as a gold bar.
- MEGA GOLD RUSH: reached by chaining a second full meter during Gold Rush
  (3x coins, screen-wide gold, all prey edible regardless of tier for its
  duration).
- Power-ups (pickups): existing buffs stay; add SUPER SIZE (shark grows 1.5x
  for 10s, eats +2 tiers), MAGNET (exists), SHIELD, SPEED. All pickups use
  the gem-mesh look with per-type color + icon glyph.
- Selftests: mode transitions, multipliers, durations.

### 12.5 Zoom + bigger sharks
Camera: dolly out ~25% (CAM_Z_LEN_MULT 1.75 -> 2.2, clamps 250..600);
framing gate updated to [0.20, 0.28]. Shark size cap: LEN_SCALE-driven rigs
may reach sil.len 2.6 (Sharkjira 2.4); world eat/collision radii follow;
menu thumbs unaffected.

### 12.6 Ownership
Data: gen_data.py/data.js/SPEC.md. Engine: engine3d.js (camera, modes,
level ctx, super size). World: world3d.js (levels: sky layer, seabed type,
color script, prey mix; AFTER the Rev 11 env lane lands). UI: ui3d.js +
meta.js (level select, classes, save schema v3 with migration). Shark:
shark3d.js (Sharkjira morphs; after the Rev 11 personality lane).
