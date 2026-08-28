# HSE verification report (lane O3)

Generated 2026-08-27T22:37:51.819Z against 10 rows at 844x390 CSS, DPR 2, landscape.

**1/10 rows pass all gates. 9 failing. 0 console errors.**

Evidence: `/tmp/nod`
Contact sheet: `/tmp/nod/contact_sheet.png`

## Gates

| gate | threshold |
| --- | --- |
| flank saturation (real-species rows) | >= 0.08 |
| flank saturation (fantasy rows) | >= 0.12 |
| flank saturation ceiling (all rows) | <= 0.35 |
| countershade (belly val - back val) | >= 0.06 |
| pattern contrast (patterned rows only) | value stddev >= 0.1 |
| pairwise thumbnail distinctness | >= 0.055 |
| eye highlight | >= 3 bright px in head crop |
| background bleed through body | <= 2.0% of interior |
| draws / tris / texture bytes | <= 100 / 55000 / 8 MB |

## Failing rows

Reported for the owning lane, not fixed here. Crop paths are 3x head crops.

| row | model | failures | head crop |
| --- | --- | --- | --- |
| `greatwhite` | greatwhite_cy | flank saturation 0.412 > 0.35 (no shark is this saturated)<br>countershade -0.088 < 0.06 (back 0.612 belly 0.523) | `../../../../../tmp/nod/heads/head_greatwhite.png` |
| `reef` | dogfish | countershade 0.041 < 0.06 (back 0.579 belly 0.620)<br>background bleeds through body at 2.66% > 2.00% | `../../../../../tmp/nod/heads/head_reef.png` |
| `bull` | whaler | flank saturation 0.391 > 0.35 (no shark is this saturated)<br>background bleeds through body at 8.36% > 2.00% | `../../../../../tmp/nod/heads/head_bull.png` |
| `whaleshark` | whitepointer | flank saturation 0.389 > 0.35 (no shark is this saturated)<br>countershade 0.012 < 0.06 (back 0.611 belly 0.622)<br>background bleeds through body at 4.24% > 2.00% | `../../../../../tmp/nod/heads/head_whaleshark.png` |
| `megalodon` | whitepointer | flank saturation 0.404 > 0.35 (no shark is this saturated)<br>countershade 0.004 < 0.06 (back 0.608 belly 0.613)<br>background bleeds through body at 10.92% > 2.00% | `../../../../../tmp/nod/heads/head_megalodon.png` |
| `frostjaw` | whitepointer | flank saturation 0.385 > 0.35 (no shark is this saturated)<br>background bleeds through body at 4.15% > 2.00% | `../../../../../tmp/nod/heads/head_frostjaw.png` |
| `mako` | mako | flank saturation 0.405 > 0.35 (no shark is this saturated) | `../../../../../tmp/nod/heads/head_mako.png` |
| `blue` | mako | flank saturation 0.387 > 0.35 (no shark is this saturated)<br>background bleeds through body at 2.71% > 2.00% | `../../../../../tmp/nod/heads/head_blue.png` |
| `tiger` | tiger_nu | no eye highlight in head crop (0 bright px)<br>background bleeds through body at 3.20% > 2.00% | `../../../../../tmp/nod/heads/head_tiger.png` |

## Ten closest pairs (distinctness)

| a | b | distance | verdict |
| --- | --- | --- | --- |
| `mako` | `blue` | 0.1514 | ok |
| `whaleshark` | `megalodon` | 0.2133 | ok |
| `bull` | `mako` | 0.2274 | ok |
| `bull` | `megalodon` | 0.2327 | ok |
| `greatwhite` | `megalodon` | 0.2345 | ok |
| `greatwhite` | `bull` | 0.2360 | ok |
| `bull` | `blue` | 0.2373 | ok |
| `greatwhite` | `whaleshark` | 0.2407 | ok |
| `megalodon` | `frostjaw` | 0.2485 | ok |
| `whaleshark` | `frostjaw` | 0.2534 | ok |

## Per-row measurements

| row | model | sat | hue | back | belly | c-shade | patStd | bleed | eyePx | draws | tris | texMB | verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `greatwhite` | greatwhite_cy | 0.412 | 0.486 | 0.612 | 0.523 | -0.088 | 0.139 | 0.0141 | 2353 | 1 | 6784 | 6.67 | FAIL |
| `reef` | dogfish | 0.209 | 0.363 | 0.579 | 0.620 | 0.041 | 0.179 | 0.0266 | 205 | 1 | 6715 | 6.67 | FAIL |
| `bull` | whaler | 0.391 | 0.874 | 0.478 | 0.608 | 0.130 | 0.151 | 0.0836 | 2880 | 1 | 6750 | 6.67 | FAIL |
| `whaleshark` | whitepointer | 0.389 | 0.421 | 0.611 | 0.622 | 0.012 | 0.141 | 0.0424 | 246 | 1 | 6790 | 6.67 | FAIL |
| `hammerhead` | smoothhammer | 0.339 | 0.846 | 0.432 | 0.788 | 0.356 | 0.197 | 0.0122 | 10 | 1 | 6733 | 6.67 | ok |
| `megalodon` | whitepointer | 0.404 | 0.453 | 0.608 | 0.613 | 0.004 | 0.139 | 0.1092 | 287 | 1 | 6790 | 6.67 | FAIL |
| `frostjaw` | whitepointer | 0.385 | 0.423 | 0.588 | 0.707 | 0.119 | 0.166 | 0.0415 | 259 | 1 | 6790 | 6.67 | FAIL |
| `mako` | mako | 0.405 | 0.408 | 0.479 | 0.648 | 0.168 | 0.192 | 0.0061 | 7220 | 1 | 6790 | 6.67 | FAIL |
| `blue` | mako | 0.387 | 0.191 | 0.511 | 0.616 | 0.106 | 0.188 | 0.0271 | 5947 | 1 | 6790 | 6.67 | FAIL |
| `tiger` | tiger_nu | 0.344 | 0.887 | 0.626 | 0.722 | 0.096 | 0.168 | 0.0320 | 0 | 1 | 6790 | 6.67 | FAIL |
