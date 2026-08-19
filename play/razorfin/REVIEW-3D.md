# Razorfin 3D adversarial review

Date: 2026-08-19

Scope: `SPEC3D.md`, inherited `SPEC.md`, the six 3D modules, `index3d.html`, Rev-3D lane notes, and the five supplied reference/current frames. This is a read-only review. The Hungry Shark images are treated as style references only. No third-party IP should be copied.

## Verdict: REWORK

Do not replace `index.html` with `index3d.html`. The 3D branch has several good contract decisions, but the flagship art is below the current 2D bar and the run lifecycle, atmosphere ownership, renderer recovery, and draw-call gates are not cutover-safe.

Blocking ids: `ART-01`, `LIFE-01`, `ATMO-01`, `PERF-01`, `PERF-03`, `GL-01`, `LAW-01`, `TEST-01`, `ORCH-01`, `FX-01`.

## CRITICAL findings

### ART-01: Leviathan Rex fails the binding art bar

Owner: D3, with A3 for scene readability

The supplied Leviathan Rex frame is visibly a pale mint egg with a small tail and detached-looking teeth. It does not read as a dangerous kaiju, and it is materially below both the 2D game and the Hungry Shark style bar. This is not just a palette tweak.

Evidence:

- The data asks for the largest, most aggressive silhouette: `tier:12`, `len:2.2`, `girth:0.6`, `tailScale:1.2`, `head:"kaiju"`, `pattern:"plates"` in `data.js:66`.
- The body builder gives `kaiju` the same generic elliptical spine as `whale`, with only a mild `1.03 + u * 0.24` profile multiplier in `shark3d.js:189-203`. There is no large front head or jaw reshaping.
- The kaiju mouth uses the generic branch in `shark3d.js:399-427`. Its jaw is a thin box from `makeJawGeometry()` in `shark3d.js:321-337`, with no `kaiju` jaw mass case. The teeth are separate cones in `shark3d.js:409-420` and `shark3d.js:683-697`, which explains the floating-strip read in the frame.
- The tail is scaled from `bodyLen * (0.43 + tailScale * 0.12)` with modest fin heights in `shark3d.js:274-285`. That is not enough drama for a tier-12 body, so the tail reads undersized against the mass.
- The seven dorsal plates are cones colored from the pale `palette.glow`, placed at `y = r * 0.76`, `z = 0`, and likely buried by the body, in `shark3d.js:521-527`. The normal dorsal fin is explicitly skipped for `kaiju` in `shark3d.js:530-533`. The promised plate row therefore has no exposed, high-contrast silhouette.
- Brow geometry is only added when `act <= 2` in `shark3d.js:372-395`. Act 3 Leviathan has no brow ridge or angry eye attitude.
- `paletteOf()` boosts numeric colors in `shark3d.js:59-66`, but the body still blends base, accent, dark dorsal, and pale belly in `shark3d.js:162-186`. A numeric saturation boost cannot substitute for large, readable color blocks and a dark silhouette edge.

The underlying language is not yet present in the mesh builder: the huge jaw mass, 30-40 percent face commitment, brow attitude, chunky muscle, dramatic tail, exposed dorsal plate row, and saturated act identity are mostly claims in `NOTES-D.md`, not geometry proportions. The screenshot is the decisive evidence.

Required before cutover: give `kaiju` an explicit front-head and jaw profile, a connected mouth cavity with a substantial lower jaw, an exposed plate row with deliberate camera-facing offset and saturated contrast, and a tail/fin silhouette scaled for the tier. Re-capture the 844x390 DPR3 gameplay frame and require the 3D flagship to beat the live 2D flagship at a glance. Do not close this id with a headless triangle or luminance assertion.

### LIFE-01: Run restart leaves scene and GPU ownership undefined

Owner: B3, F3, A3, ORCH

`engine3d.js` calls a teardown hook, but `world3d.js` does not implement one. On restart, the world resets its JavaScript arrays and cache references without removing the old scene graph or disposing the old per-run resources.

Evidence:

- `engine3d.js:1406-1421` removes and disposes only the player fallback rig, then conditionally calls `RF.World.teardown(ctx)`.
- There is no `World.teardown` export in `world3d.js`. `World.init()` instead truncates arrays and replaces `S.views`, `S.matCache`, `texCache`, and `canvasCache` in `world3d.js:2213-2246`.
- The old decor, seams, rays, surface, billboards, rigs, and world materials remain attached to the Three scene when those references are discarded. `viewDispose()` only removes one view and disposes its private material in `world3d.js:1229-1245`.
- `RF.Fx.init()` is idempotent for the same scene and has no clear or dispose path in `fx3d.js:686-697`. `endRun()` never resets active effect items. The render hook continues to update effects from `engine3d.js:1488-1500`.
- `world3d.js:2239-2243` resets texture references without disposing the textures that were created by the previous run.

This directly conflicts with the requested restart hygiene and makes the reported 0.955 MB geometry cache irrelevant to the larger scene-object, material, texture, and effect lifetime problem. It also invalidates a 61-shark sweep unless each run is measured after a clean teardown.

Required before cutover: define ownership and an idempotent teardown for world, FX, score popups, player, textures, private materials, and run-created Object3Ds. Preserve only explicitly global shared caches, with a documented lifetime. Prove repeated start/end cycles with stable scene child count, stable renderer resource counts, and no stale particles or billboards.

## MAJOR findings

### ATMO-01: Atmosphere has two active owners and the visual result is washed out

Owner: B3 and A3

The contract describes one per-zone fog and lighting path, but both modules mutate atmosphere during the same fixed step.

Evidence:

- `World.applyZoneAtmo()` owns fog density, fog color, and renderer clear color in `world3d.js:736-766`, and `World.update()` calls it in `world3d.js:2294-2299`.
- `engine3d.js:432-461` separately lerps `scene3.fog`, `scene3.background`, and hemisphere light state, and `engine3d.js:822-835` calls that path after `World.update()`.
- The two density formulas differ: B3 uses `FOG_D0` and `FOG_D1` in `world3d.js:693-705`; A3 uses a separate `0.00030 + 0.00022 * pressureTier / 9` formula in `engine3d.js:443-450`.
- The supplied reef frame is dark and timid, with foreground color compressed toward the same blue as the water. B3 decor is largely unlit `MeshBasicMaterial` in `world3d.js:660-674` and `world3d.js:777-779`, while A3's hemisphere and directional lights only affect lit shark meshes in `engine3d.js:408-415`.
- The scene contains 26 broad additive ray planes in `world3d.js:793-824`, plus many decor planes. In the current frame these read as large rectangular value bands rather than bright, saturated underwater depth.

Required before cutover: choose one atmosphere owner, preferably B3's public `applyZoneAtmo()` as the data-driven fog/clear path, and make A3 consume the resulting zone state rather than write a second formula. Tune fog so the player and nearest prey retain saturated separation. Add a screenshot gate for shallow, mid, and deep water that checks readable foreground chroma and silhouette contrast, not only a changed fog number.

### PERF-01: Fixed-step atmosphere allocates a report object every update

Owner: B3

`World.applyZoneAtmo()` says its return object is allocated only when requested, but `World.update()` calls it every fixed step and ignores the returned object.

Evidence: `world3d.js:736-766` returns a new object, including `fog`, `clear`, `density`, `zone`, and `blend`; `world3d.js:2294-2299` calls it unconditionally. This violates the inherited no-allocation rule in `SPEC.md:148-155` and the zero-allocation intent documented in `SPEC3D.md:75-84`.

Required before cutover: make the report opt-in, write into module scratch, or expose scalar state without allocating from the fixed-step path. Add a long-run allocation probe that covers atmosphere crossings, not only entity pools.

### PERF-03: The measured renderer is over the draw-call budget

Owner: D3, B3, F3

The supplied measurement is 134 draw calls versus the binding `SPEC3D.md:97-101` budget of fewer than 120. The triangle count is healthy, but draw calls are the relevant mid-phone failure.

Evidence and batching opportunities:

- Every shark body feature becomes a separate Mesh in `shark3d.js:605-612`, while `buildShark()` separately instantiates body, tail, two pectorals, jaw, teeth, and each feature in `shark3d.js:663-697`.
- Leviathan alone adds seven separate plate meshes, separate eye/catchlight meshes, mouth planes, teeth, jaw, and jaw teeth in `shark3d.js:372-442` and `shark3d.js:521-527`.
- `world3d.js:660-674` allocates a new material per environment plane. Rays, rocks, kelp, seams, silhouettes, surface, and caustics are separate meshes. The static counts are visible in `world3d.js:793-824` and `world3d.js:976-1015`.
- FX beams create one Mesh and one material per slot in `fx3d.js:237-255`, even though the beam pool is bounded.

Required before cutover: merge static environment geometry by material, cache environment materials by color/opacity/blend, and batch repeated kaiju plates, teeth, eyes, and FX beams with InstancedMesh or combined BufferGeometry where the visual result permits. Re-measure the same Leviathan run under 120 calls with the same camera and DPR. Pooling alone does not batch draw calls.

### GL-01: No WebGL context-loss recovery path

Owner: A3, ORCH

`buildRenderer()` creates the renderer and configures pixel ratio and tone mapping in `engine3d.js:378-420`, but there is no `webglcontextlost` or `webglcontextrestored` handling anywhere in the 3D entry path. The only listeners are resize and orientation listeners at `engine3d.js:1648-1651`.

With custom geometry, canvas textures, pooled meshes, and the unresolved teardown problem, a mobile context loss can leave a black or stale run with no rebuild path. Required before cutover: define the canvas context-loss behavior, pause simulation on loss, rebuild or re-upload owned resources on restore, and test restore during a run and between runs.

### LAW-01: Game logic registers window listeners despite the inherited law

Owner: A3, ORCH

`SPEC.md:20-25` says no module registers `window` or `document` listeners and all input goes through `kit.input`. `engine3d.js:1648-1651` registers `resize` and `orientationchange` on the root from game logic. The comment calls this a precedent, but it is still a contract deviation.

Required before cutover: move viewport observation into the renderer host or an explicitly approved platform adapter, or revise the inherited contract through ORCH. Do not silently waive this because the listeners are not game gestures.

### TEST-01: Selftests prove existence, not the visual failure mode

Owner: D3, ORCH

`RF.Art3D.__selftest()` samples only six ids in `shark3d.js:822-826`. It checks positive luminance, a forward nose, a triangle ceiling, existence of teeth, tail motion, and four distinct bounding ratios in `shark3d.js:878-940`. The full 61-shark sweep checks only colors, nose direction, and triangles in `shark3d.js:924-936`.

Those assertions can all pass while a tier-12 kaiju has hidden plates, a thin jaw, floating teeth, a small tail, and insufficient saturation. Add visual-contract assertions or a browser screenshot review for plate exposure, jaw/body ratio, tail/body ratio, eye/brow attitude, and act color identity. A passing headless sweep is not an art signoff.

### ORCH-01: The entry load contract contradicts the actual dependency graph

Owner: ORCH, D3, B3

`SPEC3D.md:16-20` says the old `sharkart.js` is not loaded, while `index3d.html:404-416` loads it at line 408 as a 2D bake factory. `world3d.js:397-409` and its later canvas resolution path depend on that integration.

This may be an intentional renderer-agnostic dependency, but it must be explicit. Either amend SPEC3D to permit `sharkart.js` only as a shared bake source, with ownership and disposal rules, or remove the dependency and give the 3D lane its own bake source. The current state makes the cutover contract self-contradictory.

### FX-01: Effect state crosses run boundaries

Owner: F3 and A3

`engine3d.js:1406-1421` ends a run without clearing `RF.Fx`; `fx3d.js:679-697` updates pooled effects on the common render path and only treats repeated `init()` as an early-return case. Active particles, beams, rings, and edge glow can therefore survive into results, menu, or the next run even if they are not leaking objects.

Required before cutover: add a synchronous, idempotent FX run reset and call it from the same lifecycle owner that resets abilities and UI. Prove no active effect or edge overlay remains after `endRun()`.

## MINOR findings

### PERF-04: HUD diffing is safe but allocates in the render path

Owner: C3, A3

The engine correctly reuses `HUD_STATE` and passes it synchronously in `engine3d.js:1569-1605`. The UI selftest also correctly proves that the pushed object is not retained in `ui3d.js:1448-1453`. However, `hudState()` creates a fresh `next` object on every call in `ui3d.js:787-820`, and the engine calls it from the render path in `engine3d.js:1488-1493`.

This is outside the game simulation step and the UI module is allowed DOM behavior, so it is lower severity than `PERF-01`. It is still unnecessary garbage at 60 Hz. Reuse a diff record or update only changed scalar fields after the cutover blockers are closed.

### ART-02: The roster has feature add-ons, not consistently distinct silhouette families

Owner: D3

Representative audit across acts:

| Sample | Code path | Review |
| --- | --- | --- |
| Reef, Act 1, `point` | `shark3d.js:189-203`, `568-599` | Readable but mostly the generic spine, fins, eyes, and mouth. It is the least problematic screenshot, but still timid. |
| Hammerhead, Act 1, `hammer` | `shark3d.js:445-488` | The T-bar feature exists, so the archetype is present. It remains a small add-on around the same body rather than a strongly posed head. |
| Snapjaw, Act 2, `croc` | `shark3d.js:189-203`, `399-442`, `445-488` | Snout and teeth exist, but the jaw mass is still generic tier logic. |
| Gulperfiend, Act 2, `angler` | `shark3d.js:399-442`, `445-499` | The lure and underbite language is present and is one of the stronger archetypes. It needs contrast and a larger mouth read at gameplay scale. |
| Whale Shark, Act 1, `whale` | `shark3d.js:196`, `403-417` | Bulk and wide mouth branches exist, but the body still comes from the shared spine. |
| Bonecrown, Act 3, `skull` | `shark3d.js:509-517` | Crest cones and socket are real geometry, but the crest is still a cluster of separate spikes rather than a skull silhouette. |
| Nullfin, Act 3, `void` | `shark3d.js:517-520` | Ring and alien eye are present, but the body language remains the base spine. |
| Warbringer, Act 3, `mech` | `shark3d.js:500-508` | Panel and thruster details exist, but they are separate surface decals and do not yet make a powerful mechanical silhouette. |
| Leviathan Rex, Act 3, `kaiju` | `shark3d.js:189-203`, `399-442`, `521-533` | Fails the flagship test. Generic body, thin jaw, hidden plates, no brow, and undersized tail. |

The six-head representative selftest passes because it tests mesh presence, not whether a feature survives the camera at gameplay scale. The 2D reference roster has stronger color identity, larger facial commitment, and more decisive silhouettes across acts.

### UI-01: UI touch and state-reuse audit passes

Owner: C3, no blocker found

This is a recorded pass, not a defect. Main buttons are at least 48 px in `index3d.html:80-85`, buy actions are at least 48 px in `index3d.html:159-164`, upgrade actions are at least 56 px in `index3d.html:174-185`, and the power button is 84 px in `index3d.html:249-257`. The HUD is one non-interactive corner cluster in `index3d.html:227-256`, and DOM listeners are confined to UI elements in `ui3d.js:940-982`. The chip timer is in the DOM UI exception. No touch-target or UI_LAW blocker was found in this read-only pass.

## Contract checks that pass

- The renderer owns the retina analog correctly: `computeDpr()` clamps to 1-3 and `buildRenderer()` applies it in `engine3d.js:397-402`, matching `SPEC3D.md:27-32`.
- The y-sign mapping is consistent in the reviewed paths: player placement is `(x, -y)` in `engine3d.js:1506-1512`, FX writes `-y` in `fx3d.js:314-323`, and the world converts camera y back at `world3d.js:2287-2290`.
- Same-frame hit consumption is correctly ordered: `World.update()` runs before `stepPlayerHits()` in `engine3d.js:822-831`. This matches the selftest claim and avoids a one-frame damage delay.
- Chrono/timeScale restoration is wired through the ability reset and finish paths in `abilities.js:707-759`, `abilities.js:934-966`, and `engine3d.js:1326-1355`. The reviewed code does not leave the run slowed after reset.
- Entity, FX, and geometry pooling are directionally sound: world view pooling is documented and implemented around `world3d.js:1139-1144`, FX uses prebuilt typed buffers and item pools in `fx3d.js:200-234`, and shark templates are cached in `shark3d.js:568-602`. These wins do not solve teardown or draw-call batching.

## Must-fix gates before `index3d.html` replaces `index.html`

1. Close `ART-01`: rework Leviathan and audit at least the nine representative species above at the actual gameplay camera. The 3D flagship must decisively beat the live 2D frame, not merely pass geometry tests.
2. Close `LIFE-01` and `FX-01`: implement and test run teardown, resource ownership, stale-effect reset, and repeated restart stability.
3. Close `ATMO-01`: establish one atmosphere owner and tune shallow, mid, and deep frames for bright saturated foreground readability.
4. Close `PERF-01` and `PERF-03`: remove fixed-step report allocation and bring the measured kaiju run below 120 draw calls. Re-run on an uncontended capture; the supplied 19.18 ms contended result is not a 60 fps signoff.
5. Close `GL-01`: exercise context loss and restoration on the target mobile class.
6. Resolve `LAW-01` and `ORCH-01` through code or an explicit contract revision before cutover.
7. Close `TEST-01`: add an art-aware browser or screenshot gate for silhouette exposure, mouth/jaw mass, saturation, and contrast. Keep the existing 61/61 and module selftests.
8. Re-run the binding gates from `SPEC3D.md:97-101`: console-clean 844x390 DPR3 boot, 61/61 sweep, all selftests, memory after repeated restarts, draw calls under 120, triangles under 60k, then owner iPhone signoff last.

Until these gates pass, the 3D build is a functional prototype with a promising pooling and coordinate foundation, not a replacement for the better-looking 2D game.

---

## Re-check 1 (2026-08-19)

This re-check covers the ten blocking ids above against `SPEC3D.md` Rev 2, the fix sections in `NOTES-*.md`, the current implementation, the supplied gameplay/menu frames, and the live 2D evidence at `review_evidence/mobile/razorfin.png`. Read-only verification found clean module syntax, a passing 61/61 D3 sweep, passing F3/B3/A3 selftests, 141 world notes, five zero-residual teardown cycles, 30 environment draws, 105 total measured draws, and the reported 2.18 B/step fixed-step result.

### Verdict

**FIX-THEN-CUTOVER (ART-01)**

The architecture and measured gates are now in cutover shape. The gameplay art gate is not: the kaiju frame is materially improved, but it does not yet decisively beat the shipped 2D game at the actual gameplay camera.

### Blocking IDs

#### ART-01 — NOT-CLEARED

The fix is real in code. `shark3d.js` now gives Leviathan a dedicated front contour, 51% front-head share, heavy brows, connected mouth cavity, deep jaw, upper/lower tooth rows, an oversized tail, and eight camera-offset dorsal plates. The body ramp is also finite and calibrated; the body/tail/pectoral/jaw materials remain black-emissive, while glow is feature-owned. The 61/61 audit and the supplied rendered flank luminance of `0.48` pass their numeric targets.

The gameplay frame still fails the binding visual bar. At camera scale the shark reads primarily as a pale mint/gray angular fish with a large fin-like appendage. The brow, plate rims, teeth, and jaw are present, but they are thin or low-contrast details rather than a decisive flagship silhouette. The live 2D frame has a larger, more immediately readable foreground shark with a clearer eye, gill, tail, and species identity; the 2D roster examples have substantially stronger facial commitment and color blocks. Numeric value calibration does not override that frame-level read.

I found no normal-engine regression in the D3 value ramp itself: the ramp changes vertex color, while the audited structural materials keep emissive black. The remaining failure is authored silhouette/scale/contrast, not a failed 61/61 geometry or emissive audit.

#### LIFE-01 — CLEARED-WITH-NOTE

`engine3d.js:endRun()` now orders input and ability reset before player/popup teardown, then calls World and FX teardown before notifying UI. `world3d.js` releases entities, views, environment resources, fog state, and private materials while retaining explicitly shared shark/asset caches. The in-page B3 proof reports `0,0,0,0,0` residual children against real sibling modules.

The note is intentional ownership, not a leak: persistent shared caches should plateau rather than fall to zero in `renderer.info.memory`. A real renderer-memory snapshot over the same restart sequence was not included in the repository evidence.

#### ATMO-01 — CLEARED-WITH-NOTE

Atmosphere has one runtime owner. `world3d.js` owns fog, clear color, background, and light targets; the engine only creates the lights and hands them back to World. The shared scratch report removes the old per-step report allocation. The supplied guards pass the 92%+ play-plane chroma requirement, including zone-1 clear saturation `0.569` against the `0.45` floor, and the reef frame is visibly blue, saturated, and depth-separated rather than washed out.

The evidence is strongest for zone 1; it does not independently show the full shallow/mid/deep sequence. The broad stylized water bands remain visible, but they are no longer the original atmosphere failure.

#### PERF-01 — CLEARED

`World.applyZoneAtmo()` writes into one module-scope report object and `World.update()` reuses it. The B3 141-note run and the supplied 20,000-step measurement support the fixed-step allocation ruling; no new report object is created per step.

#### PERF-03 — CLEARED-WITH-NOTE

Environment batching is implemented and the supplied capture measures 30 environment draws and 105 total draws, below the 120 cap. F3 contributes nine pooled GPU draws, and D3 feature descriptors are merged by material. This closes the prior measured over-budget result.

The 105 figure remains a capture result, so it should be rechecked if the roster, camera, or active FX load changes; it is sufficient for this re-check.

#### GL-01 — CLEARED-WITH-NOTE

The canvas handles `webglcontextlost` with `preventDefault`, pause, and a UI notice. Restore reapplies renderer state, resets renderer state, resizes, re-lends lights, tears down a live run safely, and returns to menu. The A3 recovery selftest passes, as does the supplied context-loss-to-menu result.

The remaining note is evidentiary: the repository contains a synthetic/in-page recovery proof, not a recorded driver-level loss on the target iPhone class.

#### LAW-01 — CLEARED

Rev 2 explicitly permits the engine’s resize/orientation listeners. The current engine has only those permitted root listeners; GL listeners are attached to the renderer canvas, and gameplay input remains on the GGKit input contract. No new law violation was found.

#### TEST-01 — CLEARED-WITH-NOTE

The selftest contract is now art-aware: all 61 rows are swept, 14 head identities are checked, and jaw volume, face share, tail size, plate exposure, triangle count, calibration bands, and structural emissive ownership are asserted. The supplied gameplay screenshot supplies the missing camera-level human gate.

This is a process pass, not an art pass: the screenshot gate correctly leaves ART-01 open. The test suite still does not itself compare pixels or enforce the final “decisively beats 2D” judgment.

#### ORCH-01 — CLEARED

`index3d.html` now has the normative Rev 2 order: `data.js`, `meta.js`, `abilities.js`, `sharkart.js` as the documented 2D bake factory, `ui3d.js`, then the F3/D3/B3/A3 modules. `engine3d.js:assertDeps()` checks the required namespaces without making the load order self-contradictory.

#### FX-01 — CLEARED-WITH-NOTE

`fx3d.js` teardown is synchronous and idempotent: pooled slots, cursors, edge overlays, camera shake, accumulators, and tracked pulse state are reset. B3’s `fxOwned` wrapper records whether World actually initialized FX, so World does not tear down an engine-owned same-scene FX instance. In the normal A3 order World owns the first FX init, then World tears it down before A3’s redundant second teardown; the second call is harmless and proven idempotent.

One latent contract issue is recorded below: the current engine has no `RF.Juice.kaiju` callsite, but that exported path is not safe for the new D3 emissive ownership rule if it is enabled later.

### New findings

- **EMISSIVE-01 (latent, not counted as a current gameplay blocker):** `fx3d.js:pulseGroup()` sets the emissive hex on every material in a supplied 3D group, including structural body/tail/jaw materials. `resetJuiceState()` restores intensity and base color but does not restore the prior emissive hex. The current `engine3d.js` call graph never invokes `RF.Juice.kaiju`, so this did not contaminate the supplied frame or the normal restart proof. Before exposing that pulse on D3 rigs, restrict it to named feature materials or restore the emissive hex as well, and add a real MeshToonMaterial regression test.
- The supplied image labeled as the menu is the portrait-orientation interlock, not a menu-art frame. It is clean and readable, but it cannot validate the 3D roster/menu comparison. No new menu blocker was inferred from it.
- ART-02 remains a minor observation: several non-kaiju species still inherit the shared spine and rely on feature add-ons. It is not a new cutover blocker in this re-check, but the kaiju frame shows why the art bar remains binding.

### The 3D/2D gap, honestly

The 3D rebuild now wins on actual depth cues: surface/thermocline separation, perspective, light shafts, motes, water volume, geometry-based animation, and a much cleaner pooled/batched runtime. The reef frame is calmer and more spatially legible than the flat 2D field.

The shipped 2D game still wins at the decision that matters for ART-01: immediate character read at gameplay size. Its foreground shark and roster art occupy more visual weight, have stronger facial and mouth shapes, clearer species-specific silhouettes, and more decisive saturated color identity. The 3D reef shark is small and gray in its frame; the 3D kaiju is improved but still pale, angular, and detail-dependent. Until that flagship read changes, the 3D build should not replace the live 2D game.

## Re-check 2 (2026-08-19)

### ART-01 — NOT-CLEARED

The supplied level-swimming frame confirms the camera fix improves the flagship's visual weight, and the silhouette now clearly has a large tail, exposed dorsal plates, a brow, and a substantial toothed jaw. It reads as a stylized predator rather than the prior egg-like form.

It still does not clear the binding art bar against the live 2D frame or the reference roster. At gameplay scale the 3D flagship remains materially smaller in the frame, with a pale, low-contrast flank and thin detail carrying too much of the identity. The teeth and plate row are visible on inspection, but the overall read is still a compact angular fish instead of an immediately dominant kaiju; the 2D flagship has stronger visual weight, facial commitment, contrast, and saturated color identity at a glance.

Remaining defect: increase the flagship's gameplay-scale dominance and silhouette-level contrast/color commitment so its dangerous kaiju identity survives without relying on teeth, plate, and brow detail.

### Verdict

**FIX-THEN-CUTOVER**

## Re-check 3 (2026-08-19)

### ART-01 — CLEARED

The supplied shipped-camera frame closes the remaining art defect. Leviathan now occupies approximately 28% of the gameplay frame width, matching the live 2D flagship's visual weight rather than reading as a small fish. Its silhouette is immediately legible at a glance: oversized tail, heavy front jaw, exposed dorsal plate row, brow, and clear toothed mouth all survive gameplay scale. The D3 recut also gives it committed hard-edged color blocks—a saturated green tail, dark teal/black upper mass and jaw, and a contrasting belly/teeth treatment—with sufficient separation from the water. Against the live 2D frame and the roster reference, it now reads as a dangerous kaiju flagship without relying on inspection-level detail.

### Verdict

**CUTOVER**
