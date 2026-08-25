# Rev 13 lane COLOR - shark palette, countershading, pattern contrast

## Outcome

Sharks are no longer washed out or near-monochrome against the water. Measured
on the 12-row probe lineup, rendered at gameplay size through the real GL path:

| metric | before | after |
| --- | --- | --- |
| mean rendered flank saturation | 0.292 | 0.370 |
| mean back/belly value delta (countershading) | 0.204 | 0.242 |
| worst-case pairwise separation | 0.013 | 0.101 |

Worst pair went from reef/whaleshark at 0.013 (visually the same shark) to
0.101. The Pantheon rows separated hardest: zeusfin/typhonmaw was 0.039 and is
now well clear, with zeusfin at H 0.185 gold, typhonmaw at H 0.295 venom green,
hadesmaw at H 0.933 violet.

Sharkjira (leviathanrex) went from V 0.251 with an inverted dV of -0.163, which
is what "muddy charcoal blob" measured as, to V 0.427 with dV +0.088. It is
still unmistakably charcoal, but the plates, gills and atomic blue now read.

## Root cause

The authored palettes were never the problem. Dumping the resolver showed base
swatches already vivid and well spread (tiger h0.095 tan, hadesmaw h0.77 purple,
solaris h0.039 orange). The rendered pixels nevertheless collapsed to h~0.53 at
S 0.29, meaning the color was being destroyed between palette and screen. Three
causes, in order of size:

1. A post-tone-map additive wash. `outgoingLight += uRfBottomColor * rfBelly *
   0.34` ran after tone mapping and unclamped. Raising belly values made this
   worse, not better: it flooded the lower flank with near-white light and
   dragged measured saturation DOWN even as the palettes got more vivid. This
   was the dominant desaturator and explains why a first pass that raised every
   palette saturation still measured S 0.232, lower than baseline.
2. The countershading terminator was a 0.43-0.72 smoothstep, spreading the
   transition across a third of the flank so neither the dark back nor the
   bright belly ever reached full value. HSE countershading is a hard edge.
3. `rfDetail` topped out at 1.30, driving saturated channels to clip at white.

The scene these have to survive is a cyan wash: HemisphereLight 0x9fd4e8 over
0x06121e, FogExp2 in the same 0x9fd4e8, and ACES filmic tone mapping, which
compresses saturated primaries hard. That lighting is not this lane's to change,
so the fix is pre-compensation in the palette and shader.

## Changes (all inside lane COLOR regions of shark3d.js)

- Palette ranges: flank saturation target 0.86 -> 0.90 (max 0.96), flank value
  floor 0.55 -> 0.46 so backs can actually go dark, belly value 0.80-0.98 ->
  0.90-1.00 with saturation ceiling pulled to 0.34.
- New constants `SCENE_SATURATION_GAIN` 1.34 and `SCENE_COUNTERSHADE_GAIN` 1.30,
  applied as shader uniforms `uRfSceneSat` / `uRfCountershade` after the palette
  region mix. Sharkjira takes restrained 1.12 / 1.10.
- Countershading terminator tightened to smoothstep(0.50, 0.60), with the back
  darkened to `uRfTopColor * 0.62` so the delta comes from both ends rather than
  only from a brighter belly.
- The two additive belly washes are now hue-carrying (mixed 18-22% toward the
  flank color) and scaled to 0.14 / 0.26 instead of 0.16 / 0.34, so they lift
  the belly without bleaching it.
- `rfDetail` range 0.56-1.30 -> 0.72-1.12, centered near 1.0.
- Pattern blocks hard-edged: stripe/ring smoothstep windows narrowed from
  0.40-0.60 to 0.46-0.54, spot threshold 0.68 -> 0.62. Pattern paint now biases
  the accent away from the local flank value (x0.55 if the flank is light,
  x1.55 if dark) so a block always separates. Tiger bars measured dV +0.015 on
  the old mid-value mix; tiger now carries vSTD 0.207 and dV +0.417.
- Pantheon families: base saturation 0.78/0.76 -> 0.90/0.88, accents to full
  1.00, bellies brighter. zeusfin base moved off the water's cyan band
  (0.52 -> 0.61) with a gold accent, typhonmaw accent 0.09 -> 0.30 to clear
  solaris, hadesmaw 0.77 -> 0.85 to clear typhonmaw.
- Showcase overrides fanned across the wheel instead of sitting inside h
  0.56-0.59: reef 0.52, tiger 0.105, hammerhead 0.66, whaleshark 0.72,
  megalodon 0.975. Added megalodon and solaris rows.
- Sharkjira palette: 0x1b1f22/0x2a3138 -> 0x888f95/0xbfc8ce. These are sRGB hex
  and THREE converts them to linear on construction, so the old base landed at
  linear v 0.02, which is why it rendered as a silhouette. The new values are
  solved so the linear base sits near v 0.30 and the belly near v 0.62.

## Gates added

In `__selftest`, over the 12 probe rows: base saturation floor 0.30 (Sharkjira
exempt), countershade delta floor 0.20, accent saturation floor 0.60, pairwise
separation floor 0.10, a Sharkjira 0.22-0.42 charcoal-but-readable value band
with an atomic-accent punch check, and an assertion that both scene gains
exceed 1. Results land in `result.colorSeparation`. Verified passing in
isolation at min authored separation 0.140 (tiger/solaris).

## Evidence

Real-GL render, 0 console errors across all 12 rows (only the probe's known
service-worker scope warning, which is unrelated and present before this work).
Headless selftests cannot see GLSL errors, so the shader edits were proved this
way rather than by the node gate.

Before: scratchpad/before/shark_<id>.png
After: scratchpad/after/shark_<id>.png

## Residuals

- `art3d` selftest currently fails on `builder.toothAt is not a function` at
  line 1823, jaw/teeth geometry owned by lane FACE and mid-edit at the time of
  writing. Not reachable from this lane's code; the color gates run before it
  and pass in isolation. Earlier in the session the same run failed on
  "hammerhead: 4 draws exceeds Rev 9 budget" from the concurrent cephalofoil
  rebuild. Re-run once FACE lands.
- Concurrent writes to shark3d.js silently reverted two of this lane's palette
  edits (megalodon, typhonmaw) once mid-session; they were detected by
  re-dumping the resolver and reapplied. Worth re-verifying those two rows after
  all lanes land.
- voltaicrex still measures low flank saturation (0.119). Its authored base is
  a desaturated slate and it was not in the owner's called-out list, so it was
  left alone rather than restyled without direction.
- greatwhite is intentionally low-saturation (0.219); it is a white shark and
  reads on value and silhouette rather than hue.
