# Rev 12 sky clean

Scope: `play/razorfin/world3d.js` only (decor/landmark/mound builders, sky
backdrop, surface). No other files touched, no commit.

## Defect

`scratchpad/razorfin/shotsSky/*_breach.png` and `*_y150.png` (all 12 levels)
showed:

(a) Large decor/terrain pieces protruding ABOVE the waterline into the sky —
    most visibly a huge tan T-shaped block in `hawaii_breach.png` (the
    per-zone wreck's mast + torn sail from `pushWreck()`) and a gray mass at
    the left edge (`pushDistantOutcrop()`'s tallest pieces). Root cause:
    `wreckY`/`bgBase` for zone 0 (`Sunlit Shelf`, yMin=0) sit only
    `bgSpan*0.08 = 88` sim-y below the surface, and the wreck mast alone
    extends `330 * scale` further up from there — well past sim y=0 (the
    waterline) into negative sim-y (the sky).

(b) The horizon silhouette read as generic teal triangular hills instead of
    each level's distinctive theme shape (volcano+palms for hawaii, etc.),
    and was undersized relative to the screen.

## Fix

### (a) Hard geometric sky-clip guard

Every quad-based decor batch in this file (mounds, ruins, wrecks, outcrops,
kelp, rays, reef/rock/coral, seabed accents — everything that funnels through
`quadPush()` + `mergeQuads()`) now clips at the waterline:

- `mergeQuads(allowSky)` in world3d.js (~line 1986): after computing each
  vertex's local-transformed three-space y (`vy`), it is clamped to
  `<= SKY_CLIP_Y` (0, i.e. sim y >= 0) UNLESS the caller passes
  `allowSky = true`. This is a hard clamp on the merged BufferGeometry
  itself, not a visual fade — a mast/mound/ruin that used to poke into the
  sky is now flattened at the waterline plane instead of merely dimmed.
- Only `buildSkyBackdrop()`'s three `mergeQuads()` calls (sky gradient sheet,
  sun+clouds, horizon silhouette strip) pass `allowSky = true` — they are the
  only intentional above-water geometry.
- This is a single change point (`mergeQuads`) rather than touching every
  individual builder, so a future prop pushed through the shared quad path
  cannot reintroduce the defect.
- Debug accessor added for verification: `World.__debugDecorList()` returns
  the live `S.decor` mesh list (debug-only, not used by any runtime path).

Verified via `scratchpad/razorfin/skyprobe2.js`: walks every level, teleports
the player to a near-surface swim (y=150) and a breach (y=-60, airborne),
then asserts every `S.decor` mesh whose name is not `RF sky ...` or
`*surface*` has a geometry bbox `max.y <= 20` (three-space; sim y >= -20).
**All 12 levels: 0 offenders** (53-54 decor meshes checked per level).
Screenshots + the assertion JSON are in `scratchpad/razorfin/shotsSky2/`.

Known non-issue found during verification: ice-seabed levels (alaska)
legitimately hang icebergs from the surface (`buildSeabedAccents`'s `ice`
family, tagged as intentional surface-touching decor per the original
SPEC3D 12.1 brief) — these clip correctly at the guard and are excluded from
"offender" status only by virtue of already sitting within the -20 sim-y
tolerance, not by name-based exemption. No change needed there.

### (b) Horizon silhouette legibility

- `HORIZON_THEME_BUILDERS.peaks_lagoon` (tahiti): replaced two smooth domes
  with 4 narrow, steeply-angled shards so it reads as jagged volcanic spires
  rather than rolling hills.
- `HORIZON_THEME_BUILDERS.barrier_reef_cays` (belize): added a third palm
  (trunk + fronds) so "cays + palms" is unambiguous rather than reading as
  bare cays.
- `buildSkyBackdrop()`: silhouette strip segment width factor raised
  `0.62 -> 0.92` of each repeat's segment width (bigger, more legible shapes
  at breach scale); tints darkened/more saturated
  (`darkTint`/`midTint` lerp weights lowered) for a clearer distance read
  against the sky gradient; added a third soft cloud puff (was 2, now 3 per
  the "2-3 soft clouds" ask). Sun disc and z-ordering (`Z_SKY..Z_SKY+10`,
  checked by the world selftest's sky-batch-count assertion) unchanged.

Caveat found during verification, left as-is (out of file scope): at breach
camera distance the authored per-theme silhouette shapes (e.g. bali's
temple-tier stack) render visually similar to each other — flat, non-
billboarded world-space quads viewed by the perspective camera foreshorten
into generic triangular/trapezoidal silhouettes regardless of their authored
shape. Fixing this properly needs either camera-facing billboarding for the
silhouette batch or a camera/FOV change; both are owned by `ui3d.js`
(camera) / out of this task's `world3d.js`-only, surgical-changes scope.
The clip guard (the actually-reported defect) and the size/contrast/count
tuning above are the changes made; the per-theme shape distinctiveness at
extreme distance is a pre-existing characteristic shared by every other
parallax silhouette layer in this file (`pushDistantOutcrop`, `ZONE_SIL`),
not something introduced by this pass.

## Verification

- `node --import ./tools/reg.mjs tools/selftest.mjs world game`:
  `world: pass=true ok=379 fail=0`, `game: pass=true ok=296 fail=0`
  (both green; no new draw calls added — sky backdrop is still 3 merged
  batches).
- Sky-clip probe (`scratchpad/razorfin/skyprobe2.js`): 0 offenders across all
  12 levels at both y150 and breach camera positions.
- Screenshots: `scratchpad/razorfin/shotsSky2/*_y150.png`,
  `*_breach.png`.
