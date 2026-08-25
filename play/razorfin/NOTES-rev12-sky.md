# Rev 12 sky fix — world3d.js (above-water backdrop hidden near the surface)

Scope: `play/razorfin/world3d.js` only (`buildSkyBackdrop`, surface ribbon/
wash/foam/snell, background gradient sheet, `applyZoneAtmo` near-surface
handling), per the fix brief. No spawner/schooling/AI/SDF/
`installInstancedBend` code touched. No other file edited. No git commit.

## Symptom

Owner's son reported the levels lane's new above-water backdrop
(`buildSkyBackdrop`: sky gradient + sun/clouds + 12 horizon silhouettes at
`Z_SKY=-600`, SPEC3D 12.1) never actually showed up in play. Near-surface
screenshots (player at y=150) showed a flat dark-teal band across the top of
the screen — no sky, no sun, no volcano/glacier/pier silhouette — identical
across all 12 levels.

## Root cause 1 (primary): the opaque water gradient sheet painted over the sky

`buildGradientSheet()` builds one opaque, depth-writing quad batch
(`Z_GRADIENT = -500`, nearer the camera than `Z_SKY = -600`) that is the
"source of truth" vertical water-colour ramp. For zone 0 (the shallowest
zone, `yMin=0`) its top bound was hardcoded to sim y **-600** — 600 world
units *above* the waterline — on the theory that putting it behind the sky
layer in world z would keep it from ever occluding the sky. That reasoning
only holds if the two layers never share screen pixels; they do, because
`Z_GRADIENT` sits *closer* to the camera than `Z_SKY`, so the opaque sheet
drew straight over the farther, correct sky quad every time the camera
looked upward past y=0.

Fix: `GRADIENT_TOP_Y = 0` (the waterline) replaces the `-600` overshoot in
both `buildGradientSheet()` and its colour resolver `gradientColorAt()`.
The water sheet now stops exactly at sim y=0 and never renders above the
surface at all, which is correct — the sky backdrop owns everything above
y=0. Verified live (scene traversal): the gradient mesh's world Y bounds are
now `[0, 5400]` sim-y (previously `[-600, 5400]`).

Selftest `PERF`/gradient-bounds check (`world3d.js` ~9406, "gradient sheet
spans world plus overshoot") updated to assert the new `y: GRADIENT_TOP_Y(0)
..h+600` bound instead of the old `-600..h+600`.

## Root cause 2: water fog hazing the small above-water sliver of decor geometry

FogExp2 (owned by `applyZoneAtmo`, SPEC3D ATMO-01) fogs by camera distance,
not world position, so it cannot distinguish "kelp/coral/god-ray geometry
that legitimately pokes a short way above y=0 at its tall edge" from "open
sky." Every decor/reef/kelp/god-ray batch in this module correctly sets
`material.fog = true` (it should haze with depth underwater), and several of
those batches' quad geometry extends a little above the waterline. With the
camera near the surface, the same water-fog colour that is correct
underwater got applied to that above-water sliver too, at material-and-
Grade Sheet notwithstanding.

the surface too, at a cumulative alpha high enough (several such transparent
layers stack) to read as a solid haze wash over part of the sky region.

Fix: `skyFogFrac(camY)` in `applyZoneAtmo`'s neighbourhood fades the fog
density to zero as the camera crosses from `SKY_FOG_FULL_Y = 260` (full
water fog) up to `SKY_FOG_CLEAR_Y = -40` (zero fog, above the surface),
mirroring the existing `RIBBON_FADE_Y` shape already used for the surface
ribbon/foam. `applyZoneAtmo` now multiplies its resolved `dens` by
`skyFogFrac(camY)` before writing it to `S.fog.density`.

## Root cause 3 (diagnosed, NOT fixed here — out of scope): near-rock SDF occluder

After both fixes above, a screenshot probe at player y=150 still showed a
narrow flat band at the very top of frame for *some* x positions. Traced
(live raycasts + `userData.rfRockChunk` tag) to the "near-rock render" SDF
marching-squares system (`buildNearRock`, ~world3d.js:3983) — legitimate
mound/cavern terrain whose front cap can poke a few units above y=0 near a
mound and, viewed edge-on at a shallow grazing camera angle at y=150,
temporarily fills a large fraction of the screen. Confirmed NOT a sky-system
bug: the same level/x at y=350 (still "near-surface" per the SPEC3D 12.1
~350-unit brief, but past the shallow reef-shelf mound band) shows a fully
clear sky with no occlusion. This is real gameplay terrain occlusion, not a
backdrop defect, and the SDF/near-rock builder is explicitly out of this
lane's scope, so it was left untouched.

## Verification

- `node --import ./tools/reg.mjs tools/selftest.mjs world game` → both green
  (`world: pass=true ok=379 fail=0`, `game: pass=true ok=296 fail=0`),
  including the updated gradient-sheet-bounds assertion.
- CDP screenshot probe (`Page.captureScreenshot`) of all 12 `RFD.LEVELS`
  levels, at player y=150 (near-surface swim, y=350 used for the "clear of
  shallow mounds" comparison call-out above) and at a simulated breach
  (`p.y=-60, airborne=true`), saved to
  `scratchpad/razorfin/shotsSky/<level>_y150.png` and
  `<level>_breach.png`.
- Pixel sampling of the top ~2-20% of each frame (avoiding the HUD panel and
  tutorial banner, which are shared DOM chrome, not WebGL) confirms:
  - the old flat, level-invariant dark-teal band (`~rgb(32,99,108)`,
    identical across all 12 levels, both before AND immediately after the
    gradient-sheet fix alone) is gone;
  - the sky's colour now visibly differs level to level (e.g. top-2%-strip
    average: azores `(157,167,173)` cool gray vs aruba `(190,212,220)` warm
    cyan vs hawaii `(170,175,177)` vs jamaica `(176,206,212)`);
  - each level's authored horizon silhouette theme (volcano+palms for
    Hawaii, glacier wall+icebergs for Alaska, cliffs+pier+pilings for
    California, etc.) renders as distinct shapes, confirmed both visually
    and via live scene traversal (`RF sky horizon silhouette (<themeId>)`
    mesh name matches `RFD.LEVELS[i].sky.horizonTheme`).
- Live instrumentation confirmed the fix mechanism directly: before the fix,
  `S.gradient.mesh`'s world Y bounds were sim y `[-600, 5400]`; after,
  `[0, 5400]`. `RF.World.activeSkyTheme()` correctly resolves the selected
  level's `{top, horizon, themeId, seabed}` at runtime.

## Files touched

- `play/razorfin/world3d.js`:
  - `gradientColorAt()` (~line 2583): zone-0 top bound `-600` → `GRADIENT_TOP_Y`.
  - New `GRADIENT_TOP_Y = 0` constant + comment (~line 2599).
  - `buildGradientSheet()` (~line 2632): same `-600` → `GRADIENT_TOP_Y` swap.
  - New `skyFogFrac()` + `SKY_FOG_FULL_Y`/`SKY_FOG_CLEAR_Y` constants
    (~line 2270, next to `guardDensity`).
  - `applyZoneAtmo()` (~line 2346): `dens *= skyFogFrac(camY)`.
  - Gradient-sheet-bounds selftest assertion (~line 9406-9412) updated to
    match the new y=0 top bound.
- `play/razorfin/NOTES-rev12-sky.md` (this file).

No other files modified. No git commit made per the task brief.
