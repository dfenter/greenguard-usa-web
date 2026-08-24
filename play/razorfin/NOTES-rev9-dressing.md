# Rev 9 OCEAN DRESSING — lane notes

Owner complaint: the open-ocean rewrite (Rev 9.5, NOTES-rev9-ocean.md) lost
its dressing — big flat pale rectangles, bare flat blue bands, thin gray
pillars, no seabed/coral/wreck visible at the spawn depth. Reference bar:
official Hungry Shark screenshots (scratchpad hse_refs/) — rich painted
environment, SPEC3D 9.6 "WORLD READ".

**Files owned by this lane:** `world3d.js` (all regions except
`installInstancedBend`/`INST_BEND_CHUNK` and `schoolSteer`/
`updateSchoolPanic`/`chewShrinkScale`), this file, scratchpad probes. No
other files touched, no git commit.

## What was wrong

Investigated by taking a live shot at the reported spawn depth
(`sharkline.js`, player at y=1200) and bisecting the scene graph object-by-
object (hide half, screenshot, repeat) until the exact mesh responsible for
each visual defect was identified — every fix below is against a confirmed,
isolated root cause, not a guess:

1. **Rock/kelp/coral/ruin decor floated at the zone boundary in shallow
   zones.** `findWallY` sweeps a vertical ray inside a zone's y-range and
   returns null when the whole band is open water. The OLD maze world had
   rock everywhere, so this rarely happened; the NEW open-ocean SDF (9.5)
   only has rock on sparse mounds, so a `rr(0, S.w)` x-sample in a shallow
   zone almost always missed any real terrain, and every caller's null
   fallback (`zone.yMax`) rooted the decor floating in open water at the
   zone's authored boundary instead of on any actual surface. This is why
   the seabed/mounds read empty near spawn.
2. **God-ray light shafts read as thin gray pillars.** `buildRays` pushed
   flat, uniform-alpha quads (`quadPush`, not the gradient variant) 240-440
   sim units tall. From a camera even a few hundred units below the
   waterline, a hard-edged flat-alpha quad viewed near edge-on reads as a
   thin spike, not a soft light shaft.
3. **The surface wash/ribbon/foam were geometrically correct but had no
   depth falloff**, so from anywhere in the Sunlit/Kelp band they still
   read at build-time opacity regardless of camera depth — a flat rectangle
   with a visible edge, not a true-surface feature.
4. **`ridgeReset()` never truncated its backing scratch arrays**, only the
   `ridgePointN` counter. `mergeRidge(heightline, ...)` reads
   `heightline.length` (the array's real length), not `ridgePointN`, so the
   18-point foreground CROWN build (which runs right after the much longer
   main-ridge + shelf-ledge pass in the same `buildTerrain()` call) merged
   in every leftover point the previous, longer build left behind. In the
   old tighter-zone-band world those leftovers happened to land close
   enough to go unnoticed; in the taller open-ocean world they showed up as
   a huge extra slab reaching from the old shelf-ledge y up near simY~1000,
   attached to the z=+45 foreground occluder — a dark band bleeding into
   the shallow view. Confirmed via direct vertex dump before/after the fix
   (165 verts spanning simY 617-4782 → 54 verts, all in the intended
   4714-4782 bottom band).
5. **The actual "big pale rectangle" was a landmark placement bug.**
   `buildMidwaterDecor`'s per-zone landmark loop (holo-gate arcs/pylons/
   spires, Rev 6.13 ART CRITICAL 2) draws `wantLandmarks` (up to 6) large
   (360-480 sim-unit), high-alpha (0.82) saturated cyan/magenta quads per
   zone, picked from `zoneLandmarkAnchors(zi, Z)` via `anchors[li %
   anchors.length]`. The open-ocean world can leave a shallow zone with only
   1-2 real anchors (mound flanks), so the modulo wrapped and reused the
   SAME anchor x for every wrap of the loop — several large saturated
   cyan/magenta quads landed stacked directly on top of one another at one
   point, and stacked semi-transparent saturated fills of different hues
   blend toward pale/white, exactly matching the reported defect.
   Confirmed by bisecting to the exact mesh, reading its bounding box/vertex
   colours (`[0.15,0.88,1]` cyan and `[1,0.17,0.84]` magenta at alpha 0.82
   overlapping), and verifying the pale patch vanished once the placements
   were spread out.
6. **The abyss skyline's lit-crown gradient covered too much of each tower.**
   `buildAbyssSkyline`'s `tTop` used `lerpColor(scaleColor(tBase,0.55),
   accent,0.55)`, and `quadPush` interpolates top/bottom colour linearly
   across the WHOLE quad (not a thin cap), so on a 340-620px-tall,
   densely-overlapping tower (`ABYSS_TOWER_STEP=130`, deliberately
   contiguous) roughly the top half of every tower read as a flat,
   near-full-strength accent colour — "block Tetris" panels, not dark
   towers with a lit crown. Confirmed by vertex-colour sampling matching
   `0.55×accent` almost exactly before the fix.

## What changed

### Surface / light shafts (task 1)
- `buildRays`: shaft height range tightened 240-440 -> 160-300 (stays
  comfortably inside the Sunlit band instead of spanning nearly half of
  it), and rewritten with `quadPushGradient` so each shaft fades from its
  band alpha at the waterline to ZERO at the tip — a soft gradient shaft,
  not a hard-edged rectangle.
- `buildSurface`'s wash: rebuilt as a `quadPushGradient` batch (was a flat
  `planeMesh`) fading from 0.04 alpha at the waterline to 0 by
  `SURFACE_LIGHT_H`, instead of a uniform-alpha slab.
- New `ribbonFade(camY)` (mirrors the existing `snellAlpha()` depth gate):
  fades the surface ribbon, its material opacity, the wash's material
  opacity, and the foam strip's opacity to zero between camY 260 and 900,
  so all of these true-surface features (intended to read in the y~0..120
  band per the brief) actually disappear as the camera leaves the surface
  instead of still rendering at full build-time alpha from deep in the Kelp
  Midwater zone. `animateWater` now takes a `camY` parameter (threaded from
  `World.update`) to drive this.
- New constants `SURFACE_RIBBON_ALPHA`/`SURFACE_FOAM_ALPHA` hold the base
  alphas that `ribbonFade` now scales.

### Terrain scratch-array leak (found investigating task 1/3)
- `ridgeReset()` now truncates every ridge scratch array
  (`ridgeLineScratch`, `ridgeBaseScratch`, `ridgeMidScratch`, and all six
  colour/alpha scratch arrays) to zero length, not just resetting the
  `ridgePointN` counter. Fixes the crown-mesh leak described above.

### Landmark stacking (the actual pale-rectangle root cause)
- `buildMidwaterDecor`'s landmark loop: when the loop wraps past the real
  anchor count (`li >= anchors.length`), the repeat now gets a
  deterministic x offset off that anchor (`anchorWrap * anchor.r * 2.4`,
  alternating sign) instead of landing at the exact same x as an earlier
  landmark, clamped into the world bounds.
- `wantLandmarks` is now `anchors.length * 2` (capped at 6, floor 3 with no
  anchors) instead of a flat `min(6, max(3, anchors.length))` — scales with
  how many real anchors a zone actually has instead of always requesting up
  to 6 regardless.

### Abyss skyline over-saturation
- `buildAbyssSkyline`'s `tTop` accent mix lowered from 0.55 to 0.22 (the
  `scaleColor` term is unchanged) so the lit-crown gradient reads as a
  modest highlight across the tower's linear top-to-bottom fill, not a
  second near-full-saturation fill covering half the tower. The real "lit
  crown" brightness still comes from the separate, deliberately sparse
  `ruinGlowRec` additive crown/window batch a few lines below, unchanged.

### Dressing density near spawn (task 3)
- New `moundFlankY(xNear, yLo, yHi, u)` helper: given an x and a y-range,
  finds the nearest real MOUND that pierces that range and returns a point
  on its flank at slope-fraction `u`. Used as a fallback wherever
  `findWallY` returns null in a shallow zone (`buildReef`'s coral/fan
  placement, the ordinary ruin-prop loop in `buildMidwaterDecor`), so decor
  roots on a real mound surface instead of floating at the zone boundary
  when a mound is in range.
- `buildReef`: for each shallow zone, up to 2/3 of its coral count is now
  placed directly on the flanks of mounds that pierce that zone (lower/mid
  slope, `u` in [0.05, 0.55]) rather than pure random-x sampling, so mounds
  rising into the Sunlit/Reef bands carry visible coral. Coral count per
  zone scales up to 10 (from a flat 6) when mounds are present. The
  swaying fan/anemone bed loop gets the same `moundFlankY` fallback.
- `buildDecor`'s 90-rock seafloor batch: previously rooted flat at
  `S.h - rr(0,26)` (the absolute world floor), which only matches the true
  seabed in the deepest trenches. Now 60 root on the real rolling
  `seabedY(x)` profile and 30 root on mound flanks (random slope fraction),
  so rocks actually sit on visible terrain instead of buried below it
  almost everywhere.
- `buildMidwaterDecor`'s ordinary (non-landmark) ruin-prop loop gets the
  same `moundFlankY` fallback as the reef/kelp placement.
- Mid-water parallax silhouettes (`ZONE_SIL`/`buildMidwaterDecor`'s
  silhouette pass) and the abyss skyline were already anchored generically
  and needed no change — confirmed still reading correctly (soft glow/
  dark towers, no bare gaps) in probe shots after the above fixes.

## Depth atmosphere (task 2)

Verified, not changed: `applyZoneAtmo`, `depthTint`, `lightAtDepth` already
key off `zones()` (i.e. `RFD.ZONES`, generic over whatever bands data.js
defines) rather than any hardcoded band list, so they transparently picked
up the Rev 9.5 zone y-ranges (Sunlit 0-1100, Kelp Midwater 1100-2300,
Twilight 2300-3500, Abyss 3500-4800) with no lane-9-dressing changes
needed. Confirmed via probe shots at y=260 (bright turquoise, minimal haze,
per spec), y=2800 (darker teal, soft glow), and y=4000 (near-black, cool,
neon accents) — the vertical progression reads correctly.

One residual, NOT fixed (flagged, out of this lane's necessary scope): the
opaque background gradient sheet (`buildGradientSheet`/`gradientColorAt`,
Z_GRADIENT=-500, the world-anchored water-colour backdrop) shows a
brighter-than-either-neighbour teal band right at the Twilight/Abyss
y-boundary (~3500-3800) in some views. This is pre-existing zone-transition
blend math from an earlier lane (ATMO-01/Rev 2/6.9), not something the
9.5 SDF swap or this dressing pass touched, and it sits at the absolute
furthest background layer (only visible where nothing else occludes it,
i.e. it never blocks gameplay read). Left alone since fixing the transition
formula itself is outside "dressing"; noted here for whichever lane owns
`applyZoneAtmo` next.

## Budgets (task 3/4)

`memprobe3d.js` (kaiju-tier run, worst case): **65 draw calls, ~37,450
triangles** — both comfortably under the 120 draws / 60k tris budget.

## Selftest / probe results

```
node --import ./tools/reg.mjs tools/selftest.mjs world game
world: pass=true ok=206 fail=0
game:  pass=true ok=282 fail=0
```

`plainload.js`: boots clean, `errs: []`, reaches `hud` with a live player.

`sharkline.js OUT=shotsW IDS=reef`: the reported pale-rectangle/gray-pillar
frame (player at y=1200, the original bug reference) now shows soft light
shafts, no opaque rectangles, and readable dressing instead of the flat
pale trapezoid + thin gray spikes from the bug report.
