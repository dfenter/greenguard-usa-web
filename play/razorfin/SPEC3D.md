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
  fov 50, at (px, -py, 620), lookAt (px, -py, 0), slight velocity lookahead.
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
