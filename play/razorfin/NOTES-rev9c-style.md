# Rev 9c — SHARK STYLE measured notes

Date: 2026-08-24  
Lane: 9c SHARK STYLE (Luna xhigh)  
Measured loop: `OUT=shots9d IDS='reef,tiger,hammerhead,greatwhite,whaleshark,leviathanrex,zeusfin,typhonmaw' node sharkline.js`

## Rendered tint check

These are sRGB pixels read from the rendered `shots9d` frames, not palette/uniform values. The top sample is a visible flank pixel in the gameplay camera; the belly sample is the adjacent lower flank. HSV is hue in degrees, saturation/value in percent. Hammerhead uses `(790,455)` for the top sample because `(950,455)` is occupied by the foil; all other top samples use `(950,455)`. Belly samples use `(950,505)`, except hammerhead `(820,500)`.

| def | top RGB | top HSV (H/S/V) | belly RGB | belly HSV (H/S/V) |
|---|---:|---:|---:|---:|
| reef | 75,100,82 | 136.8 / 25.0 / 39.2 | 189,195,195 | 180.0 / 3.1 / 76.5 |
| tiger | 137,105,76 | 28.5 / 44.5 / 53.7 | 190,187,181 | 40.0 / 4.7 / 74.5 |
| hammerhead | 62,87,69 | 136.8 / 28.7 / 34.1 | 184,188,190 | 200.0 / 3.2 / 74.5 |
| greatwhite | 91,100,91 | 120.0 / 9.0 / 39.2 | 189,192,194 | 204.0 / 2.6 / 76.1 |
| whaleshark | 97,127,134 | 191.4 / 27.6 / 52.5 | 187,190,193 | 210.0 / 3.1 / 75.7 |
| leviathanrex | 113,180,166 | 167.5 / 37.2 / 70.6 | 183,204,200 | 168.6 / 10.3 / 80.0 |
| zeusfin | 73,172,186 | 187.4 / 60.8 / 72.9 | 192,215,220 | 190.7 / 12.7 / 86.3 |
| typhonmaw | 98,179,193 | 188.8 / 49.2 / 75.7 | 194,207,216 | 204.5 / 10.2 / 84.7 |

The top samples are pairwise distinct in the rendered frames. The body shader now desaturates the atlas into a luminance/detail multiplier, paints top/belly/accent from the resolved definition palette, and only lets atlas white/black/red escape through the forward face bands for teeth, pupil, cavity, and mouth.

## 9.6 style gates

- Body and props use `MeshStandardMaterial`, smooth normals, roughness 0.50 on the body, and specular lighting. No toon material, gradient map, or BackSide contour shell remains.
- LowerJaw cruise parameter is 0.280 (28% resting gape); bite reaches 0.987 in the loaded-rig selftest. Teeth, mouth cavity, and brow remain visible at cruise.
- Hammerhead foil projected span is 0.453 body lengths in the loaded-rig selftest, above the required 0.42 gameplay-camera threshold.
- The eight-frame loop visually confirms the color families, glossy countershading, open toothy jaw, and hammerhead read.

## Verification

`node --check shark3d.js` passed.  
`node --import ./tools/reg.mjs tools/selftest.mjs art3d` passed (`art3d: pass=true ok=4 fail=0`).  
The complete selftest suite is run after this note is added.
