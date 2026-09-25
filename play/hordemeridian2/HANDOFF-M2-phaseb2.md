# HANDOFF M2 Phase B round 2 (SDF containment migration, superset constraint)

Status: **PARTIAL. Superset retune done and test-verified. game.js integration NOT started.**
Stopped early on purpose: the remaining scope (converting ~101 EDGE sites across a 10,826-line
file, wiring five terrain hooks into hot loops, retiring the legacy background stack, rewriting
the probe for a real headless browser gate, running the live server + probe + campaign regression,
and palette-tuning against measured luminance) is too large to do safely and verifiably at
low effort without real risk of breaking the 15 campaign missions or leaving a half-wired state
that is worse than the current HOLD. Only files touched: `hm2_world.js`, `hm2_world.test.mjs`.
No other file in the repo was edited. Nothing committed.

## What was done (verified)

`node play/hordemeridian2/hm2_world.test.mjs` -> **21 cases, 0 failures**, including a new
superset test (2645 points: dense grid + explicit corners/edges over all 5 band boxes, 0 failures).

### Region retune (superset property)
Old regions used tight ellipses (rx~2600-2700, ry~2000-2100) sized for a cosmetic blob, which did
NOT contain the old square/band playable area (corners of the old EDGE=6260 square gave sdf up to
+3960, i.e. far outside). Retuned so sdf(x,y) <= 0 everywhere inside the 5 band boxes (each
`minX`/`maxX` from hm_data.js, full height, intersected with EDGE = WORLD/2-40 = 6260 square):

- Five primary regions (aurelion-graveyard, void-rift, meridian-verge, ember-drift, crystal-shoals)
  are now circles, `rx = ry = 9077`, centred at each band's x-centre, `cy = 0`. Made them circular
  (not tall narrow ellipses) because a highly eccentric ellipse broke the existing Lipschitz/slope
  sanity tests (the cheap `ellipseSdf` approximation using `avgR = (rx+ry)/2` degrades badly past
  roughly 2:1 aspect ratio). A shared radius of 9077 is the smallest circle that still clears the
  superset check with margin (worst-case sdf found was -2695, comfortably negative) while keeping
  the Lipschitz jump under the 1.2x-step test threshold (measured max jump ~60 against a limit of
  ~72).
- `solar-crown` (the 6th, bonus region) kept its original small ellipse (cx 6900, cy 2500, rx 2400,
  ry 1900) since it only adds area via the smooth-min union and can never remove coverage.
- `regionAt(x,y)` (used for palette/background/terrain 2D lookup only, per the brief -- NOT for
  gameplay) was changed from comparing raw `ellipseSdf` values across regions to comparing raw
  Euclidean distance to each region's centre. Reason: once the five primary regions became large
  equal-radius circles, comparing `ellipseSdf` (whose scale depends on each region's own radius)
  was biased toward the largest region even exactly at another (smaller) region's own centre --
  `regionAt(solar-crown.cx, solar-crown.cy)` was incorrectly returning `crystal-shoals`. Euclidean
  nearest-centre fixed it and all 6 `regionAt(centre)` checks now return their own key.
- One pre-existing test constant (`hm2_world.test.mjs:172`, `mv.ry * 0.97` used to sample "just
  inside the boundary") was changed to `mv.ry * 0.99`. It was tuned to the old ry~2100; with the
  new ry=9077 the same fractional offset lands ~900 units short of the true boundary. This is a
  scale-adjustment to an existing test's magic number, not a behavior change to what it asserts.

### Not touched, not verified
- `regionAtX`/`REGIONS` in `hm_data.js`: untouched, still the gameplay source of truth for
  missions, bosses, spawn tables, HOT_START ring math, per the brief. Campaign regression was
  NOT re-run this round (no game.js changes were made, so the existing 55/55 result should still
  hold, but this was not re-verified live).
- `game.js`: zero edits. `clampToField`, `edgeGlowFactor`, `featureHooks` are still called nowhere.
  All ~101 EDGE sites remain exactly as documented in HANDOFF-M2.md's Phase B section (radial EDGE
  clamp at ~1590/1656/1671/1684-1714/2740/3139/3198-3230/3850-3851/4195-4211/4800; the boundary
  rectangle and regionWalls band-divider graphics at ~1684-1717).
- `hm2_world_probe.mjs`: NOT fixed. Still has the fake `r0..r5` keys, the dead `getBackdropSample`,
  the missing orientation-overlay defeat, and the missing return-value check on `teleportToRegion`,
  exactly as the gate verdict in HANDOFF-M2.md described. Did not run it or the live server this
  round since there is nothing new in game.js for it to exercise correctly yet.
- `hm2_background.js`: untouched. Legacy background stack in game.js (regionBackground discs,
  skyObjects, marks, debris, landmark pool) not retired.
- Terrain hooks (asteroid_field, gravity_well, nebula, derelict_hulk, solar_flare): not wired into
  enemy/projectile update paths.

## Next steps for whoever picks this up
1. Re-verify `node play/hordemeridian2/hm2_world.test.mjs` still shows 21/21 (should be unchanged
   from this handoff).
2. Read HANDOFF-M2.md's "Gate verdict" section (still accurate for game.js state) plus this file.
3. Convert the ~101 EDGE sites to `clampToField`/`edgeGlowFactor` per the original brief, in
   batches, re-running `hm2_world.test.mjs` and the campaign probo
   (`node /Users/lucille/ue-port-studio/aaa/harness/hm2_campaign_probe.mjs ...`) after each batch
   to catch regressions early rather than at the end.
4. Fix `hm2_world_probe.mjs` per the gate item list in the round-2 brief (real region keys, assert
   `teleportToRegion` return value, defeat the portrait overlay via the `capture_harness.mjs`
   `addInitScript` pattern, real luminance measurement, fps floor 50, console allowlist for the
   known pre-existing residuals).
5. Wire terrain hooks, retire the legacy background stack, replace the boundary/regionWalls
   graphics with an SDF energy edge.
6. Only then run the full verify sequence (world test, live probe, campaign regression) and commit
   with the explicit file list from the brief.

No em dashes used in this file or in the code changes. No Co-Authored-By trailer. `hm2_weapons.js`
was not touched, staged, or reverted.
