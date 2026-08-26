# HSE verification report (lane O3)

Generated 2026-08-26T00:35:26.691Z against 86 rows at 844x390 CSS, DPR 2, landscape.

**35/86 rows pass all gates. 51 failing. 1 console errors.**

Evidence: `hse/evidence/r14-round2`
Contact sheet: `hse/evidence/r14-round2/contact_sheet.png`

## Gates

| gate | threshold |
| --- | --- |
| flank saturation floor | >= 0.18 |
| countershade (belly val - back val) | >= 0.06 |
| pattern contrast (patterned rows only) | value stddev >= 0.1 |
| pairwise thumbnail distinctness | >= 0.055 |
| eye highlight | >= 3 bright px in head crop |
| background bleed through body | <= 2.0% of interior |
| draws / tris / texture bytes | <= 100 / 55000 / 8 MB |

## Console errors

- `[Razorfin] Art3D.buildShark threw Error: warbringer: L2 morph silhouette aspect 76.4% of rest exceeds +/-20%`

## Diff against baseline

Baseline: `hse/evidence/o3-baseline`

**Regressed:**
- `cookiecutter` countershade dropped 0.346 -> 0.243
- `mako` too close to blue (thumb distance 0.0312 < 0.055)
- `mako` countershade dropped 0.436 -> 0.074
- `mako` valStd dropped 0.240 -> 0.140
- `blue` too close to mako (thumb distance 0.0312 < 0.055)
- `blue` countershade dropped 0.400 -> 0.066
- `blue` valStd dropped 0.233 -> 0.140
- `thresher` countershade dropped 0.259 -> 0.170
- `bull` countershade -0.070 < 0.06 (back 0.236 belly 0.167)
- `bull` countershade dropped 0.354 -> -0.070
- `goblin` new failures: countershade -0.013 < 0.06 (back 0.468 belly 0.455); no eye highlight in head crop (0 bright px); background bleeds through body at 2.12% > 2.00%
- `megalodon` background bleeds through body at 5.08% > 2.00%
- `vex` countershade dropped 0.282 -> 0.185
- `riftjaw` valStd dropped 0.344 -> 0.239
- `howler` countershade dropped 0.142 -> -0.008
- `magmaw` countershade dropped 0.355 -> 0.075
- `gloomtide` countershade dropped 0.221 -> 0.098
- `plaguemaw` sat dropped 0.571 -> 0.483
- `mirrorscale` countershade dropped 0.301 -> -0.136
- `vulkan` sat dropped 0.457 -> 0.322
- `banshee` countershade dropped 0.175 -> -0.075
- `vortexa` sat dropped 0.566 -> 0.484
- `warbringer` new failures: no rig with rfPersonality found in scene; countershade 0.059 < 0.06 (back 0.321 belly 0.380); background bleeds through body at 2.43% > 2.00%
- `warbringer` countershade dropped 0.152 -> 0.059
- `omenmaw` new failures: countershade -0.119 < 0.06 (back 0.627 belly 0.507); background bleeds through body at 4.55% > 2.00%
- `omenmaw` countershade dropped 0.083 -> -0.119
- `absolutezero` new failures: countershade -0.184 < 0.06 (back 0.856 belly 0.672); background bleeds through body at 5.49% > 2.00%
- `absolutezero` countershade dropped 0.055 -> -0.184
- `leviathan_rex` no eye highlight in head crop (0 bright px)
- `hadesmaw` countershade dropped 0.324 -> 0.019
- `aresrender` sat dropped 0.640 -> 0.507
- `hermesdart` countershade dropped 0.045 -> -0.106
- `aphroditelure` countershade -0.134 < 0.06 (back 0.621 belly 0.486)
- `aphroditelure` countershade dropped 0.089 -> -0.134
- `medusagaze` new failures: countershade -0.258 < 0.06 (back 0.746 belly 0.487); background bleeds through body at 3.79% > 2.00%
- `medusagaze` countershade dropped 0.059 -> -0.258
- `cyclopseye` countershade dropped 0.241 -> 0.131
- `harpyshade` countershade dropped 0.003 -> -0.077

Improved: `hammerhead`, `tiger`, `greatwhite`, `greenland`, `snapjaw`, `anglerfang`, `morayne`, `sailfin`, `duskfin`, `vex`, `abyssmaw`, `venomspine`, `magmaw`, `frostjaw`, `stormfin`, `gloomtide`, `ironfin`, `plaguemaw`, `sunspine`, `maelstrom`, `vulkan`, `chronos`, `vortexa`, `solaris`, `poseidonrex`, `athenajaw`, `aresrender`, `hephaestusforge`, `charybdisvoid`

## Failing rows

Reported for the owning lane, not fixed here. Crop paths are 3x head crops.

| row | model | failures | head crop |
| --- | --- | --- | --- |
| `reef` | dogfish | countershade -0.096 < 0.06 (back 0.318 belly 0.222) | `hse/evidence/r14-round2/heads/head_reef.png` |
| `epaulette` | bullhead | background bleeds through body at 4.57% > 2.00% | `hse/evidence/r14-round2/heads/head_epaulette.png` |
| `mako` | mako | too close to blue (thumb distance 0.0312 < 0.055) | `hse/evidence/r14-round2/heads/head_mako.png` |
| `blue` | mako | too close to mako (thumb distance 0.0312 < 0.055) | `hse/evidence/r14-round2/heads/head_blue.png` |
| `bull` | whaler | countershade -0.070 < 0.06 (back 0.236 belly 0.167) | `hse/evidence/r14-round2/heads/head_bull.png` |
| `goblin` | goblinshark | countershade -0.013 < 0.06 (back 0.468 belly 0.455)<br>no eye highlight in head crop (0 bright px)<br>background bleeds through body at 2.12% > 2.00% | `hse/evidence/r14-round2/heads/head_goblin.png` |
| `megalodon` | sharky | background bleeds through body at 5.08% > 2.00% | `hse/evidence/r14-round2/heads/head_megalodon.png` |
| `dunkleosteus` | sharky | background bleeds through body at 2.84% > 2.00% | `hse/evidence/r14-round2/heads/head_dunkleosteus.png` |
| `gulperfiend` | anglerfish | countershade -0.001 < 0.06 (back 0.441 belly 0.440)<br>background bleeds through body at 21.64% > 2.00% | `hse/evidence/r14-round2/heads/head_gulperfiend.png` |
| `thornback` | bullhead | background bleeds through body at 3.79% > 2.00% | `hse/evidence/r14-round2/heads/head_thornback.png` |
| `stonejaw` | whaler | countershade -0.066 < 0.06 (back 0.234 belly 0.168) | `hse/evidence/r14-round2/heads/head_stonejaw.png` |
| `barbhook` | sharky | no eye highlight in head crop (0 bright px)<br>background bleeds through body at 3.32% > 2.00% | `hse/evidence/r14-round2/heads/head_barbhook.png` |
| `coralcrown` | sharky | no eye highlight in head crop (0 bright px) | `hse/evidence/r14-round2/heads/head_coralcrown.png` |
| `riftjaw` | whaler | countershade -0.107 < 0.06 (back 0.366 belly 0.259) | `hse/evidence/r14-round2/heads/head_riftjaw.png` |
| `howler` | tigershark | countershade -0.008 < 0.06 (back 0.527 belly 0.519) | `hse/evidence/r14-round2/heads/head_howler.png` |
| `wreckfang` | greatwhite_cy | background bleeds through body at 22.18% > 2.00% | `hse/evidence/r14-round2/heads/head_wreckfang.png` |
| `cindermaw` | blueshark | countershade -0.011 < 0.06 (back 0.420 belly 0.409) | `hse/evidence/r14-round2/heads/head_cindermaw.png` |
| `glacier` | whitepointer | too close to voltaicrex (thumb distance 0.0234 < 0.055) | `hse/evidence/r14-round2/heads/head_glacier.png` |
| `gravewater` | whitepointer | background bleeds through body at 2.83% > 2.00% | `hse/evidence/r14-round2/heads/head_gravewater.png` |
| `teslafang` | whitepointer | background bleeds through body at 2.64% > 2.00% | `hse/evidence/r14-round2/heads/head_teslafang.png` |
| `nocturne` | blueshark | countershade -0.103 < 0.06 (back 0.656 belly 0.553)<br>background bleeds through body at 3.27% > 2.00% | `hse/evidence/r14-round2/heads/head_nocturne.png` |
| `tempest` | blueshark | background bleeds through body at 2.48% > 2.00% | `hse/evidence/r14-round2/heads/head_tempest.png` |
| `bonecrown` | greatwhite_cy | background bleeds through body at 2.10% > 2.00% | `hse/evidence/r14-round2/heads/head_bonecrown.png` |
| `mirrorscale` | whaler | countershade -0.136 < 0.06 (back 0.635 belly 0.499) | `hse/evidence/r14-round2/heads/head_mirrorscale.png` |
| `aurora` | blueshark | background bleeds through body at 2.75% > 2.00% | `hse/evidence/r14-round2/heads/head_aurora.png` |
| `voltaicrex` | whitepointer | too close to glacier (thumb distance 0.0234 < 0.055) | `hse/evidence/r14-round2/heads/head_voltaicrex.png` |
| `nullfin` | greatwhite_cy | background bleeds through body at 21.30% > 2.00% | `hse/evidence/r14-round2/heads/head_nullfin.png` |
| `banshee` | whitepointer | countershade -0.075 < 0.06 (back 0.565 belly 0.491) | `hse/evidence/r14-round2/heads/head_banshee.png` |
| `warbringer` | greatwhite_cy | no rig with rfPersonality found in scene<br>countershade 0.059 < 0.06 (back 0.321 belly 0.380)<br>no eye highlight in head crop (0 bright px)<br>background bleeds through body at 2.43% > 2.00% | `hse/evidence/r14-round2/heads/head_warbringer.png` |
| `omenmaw` | bullhead | countershade -0.119 < 0.06 (back 0.627 belly 0.507)<br>background bleeds through body at 4.55% > 2.00% | `hse/evidence/r14-round2/heads/head_omenmaw.png` |
| `absolutezero` | tigershark | countershade -0.184 < 0.06 (back 0.856 belly 0.672)<br>no eye highlight in head crop (0 bright px)<br>background bleeds through body at 5.49% > 2.00% | `hse/evidence/r14-round2/heads/head_absolutezero.png` |
| `leviathanrex` | sharky | background bleeds through body at 4.57% > 2.00% | `hse/evidence/r14-round2/heads/head_leviathanrex.png` |
| `leviathan_rex` | sharky | no eye highlight in head crop (0 bright px) | `hse/evidence/r14-round2/heads/head_leviathan_rex.png` |
| `zeusfin` | sharky | countershade -0.005 < 0.06 (back 0.675 belly 0.670)<br>pattern "rays" contrast 0.089 < 0.1<br>no eye highlight in head crop (0 bright px) | `hse/evidence/r14-round2/heads/head_zeusfin.png` |
| `hadesmaw` | whitepointer | countershade 0.019 < 0.06 (back 0.543 belly 0.562) | `hse/evidence/r14-round2/heads/head_hadesmaw.png` |
| `apollodon` | mako | countershade -0.015 < 0.06 (back 0.521 belly 0.506) | `hse/evidence/r14-round2/heads/head_apollodon.png` |
| `artemisstrike` | whaler | countershade -0.244 < 0.06 (back 0.453 belly 0.209) | `hse/evidence/r14-round2/heads/head_artemisstrike.png` |
| `hermesdart` | whaler | countershade -0.106 < 0.06 (back 0.452 belly 0.345) | `hse/evidence/r14-round2/heads/head_hermesdart.png` |
| `dionysustide` | whaler | countershade -0.037 < 0.06 (back 0.272 belly 0.235) | `hse/evidence/r14-round2/heads/head_dionysustide.png` |
| `aphroditelure` | bullhead | countershade -0.134 < 0.06 (back 0.621 belly 0.486) | `hse/evidence/r14-round2/heads/head_aphroditelure.png` |
| `heracrown` | sharky | no eye highlight in head crop (0 bright px) | `hse/evidence/r14-round2/heads/head_heracrown.png` |
| `typhonmaw` | sharky | countershade 0.056 < 0.06 (back 0.685 belly 0.741)<br>pattern "faults" contrast 0.092 < 0.1<br>no eye highlight in head crop (0 bright px) | `hse/evidence/r14-round2/heads/head_typhonmaw.png` |
| `hydrafang` | blueshark | countershade 0.047 < 0.06 (back 0.456 belly 0.502) | `hse/evidence/r14-round2/heads/head_hydrafang.png` |
| `cerberusjaw` | tigershark | countershade -0.008 < 0.06 (back 0.569 belly 0.561) | `hse/evidence/r14-round2/heads/head_cerberusjaw.png` |
| `chimerashark` | sharky | countershade 0.007 < 0.06 (back 0.698 belly 0.705)<br>no eye highlight in head crop (0 bright px) | `hse/evidence/r14-round2/heads/head_chimerashark.png` |
| `medusagaze` | bullhead | countershade -0.258 < 0.06 (back 0.746 belly 0.487)<br>background bleeds through body at 3.79% > 2.00% | `hse/evidence/r14-round2/heads/head_medusagaze.png` |
| `scyllarender` | blueshark | countershade 0.032 < 0.06 (back 0.484 belly 0.515) | `hse/evidence/r14-round2/heads/head_scyllarender.png` |
| `minotaurram` | sharky | countershade 0.021 < 0.06 (back 0.694 belly 0.715)<br>pattern "faults" contrast 0.091 < 0.1<br>no eye highlight in head crop (0 bright px) | `hse/evidence/r14-round2/heads/head_minotaurram.png` |
| `harpyshade` | whitepointer | countershade -0.077 < 0.06 (back 0.675 belly 0.597)<br>no eye highlight in head crop (0 bright px) | `hse/evidence/r14-round2/heads/head_harpyshade.png` |
| `lamiacoil` | thresher | countershade 0.035 < 0.06 (back 0.495 belly 0.531) | `hse/evidence/r14-round2/heads/head_lamiacoil.png` |
| `kampechrono` | sharky | pattern "bones" contrast 0.088 < 0.1<br>no eye highlight in head crop (0 bright px)<br>background bleeds through body at 10.63% > 2.00% | `hse/evidence/r14-round2/heads/head_kampechrono.png` |

## Ten closest pairs (distinctness)

| a | b | distance | verdict |
| --- | --- | --- | --- |
| `glacier` | `voltaicrex` | 0.0234 | TOO CLOSE |
| `mako` | `blue` | 0.0312 | TOO CLOSE |
| `snapjaw` | `plaguemaw` | 0.0633 | ok |
| `stormfin` | `tempest` | 0.0641 | ok |
| `bull` | `stonejaw` | 0.0702 | ok |
| `glacier` | `maelstrom` | 0.0719 | ok |
| `maelstrom` | `voltaicrex` | 0.0720 | ok |
| `reef` | `bull` | 0.0757 | ok |
| `greatwhite` | `wreckfang` | 0.0768 | ok |
| `vex` | `frostjaw` | 0.0780 | ok |

## Per-row measurements

| row | model | sat | hue | back | belly | c-shade | patStd | bleed | eyePx | draws | tris | texMB | verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `reef` | dogfish | 0.484 | 0.488 | 0.318 | 0.222 | -0.096 | 0.113 | 0.0006 | 229 | 1 | 6715 | 6.67 | FAIL |
| `epaulette` | bullhead | 0.559 | 0.041 | 0.486 | 0.584 | 0.098 | 0.103 | 0.0457 | 6 | 1 | 6742 | 6.67 | FAIL |
| `cookiecutter` | sharky | 0.418 | 0.038 | 0.421 | 0.664 | 0.243 | 0.195 | 0.0006 | 9 | 3 | 6832 | 5.33 | ok |
| `mako` | mako | 0.651 | 0.446 | 0.287 | 0.361 | 0.074 | 0.140 | 0.0001 | 251 | 1 | 6790 | 6.67 | FAIL |
| `blue` | mako | 0.642 | 0.456 | 0.293 | 0.359 | 0.066 | 0.140 | 0.0007 | 211 | 1 | 6790 | 6.67 | FAIL |
| `hammerhead` | smoothhammer | 0.625 | 0.441 | 0.189 | 0.465 | 0.276 | 0.207 | 0.0016 | 415 | 1 | 6733 | 6.67 | ok |
| `thresher` | thresher | 0.636 | 0.483 | 0.273 | 0.443 | 0.170 | 0.215 | 0.0025 | 1108 | 1 | 6790 | 6.67 | ok |
| `sawshark` | sharky | 0.454 | 0.841 | 0.306 | 0.650 | 0.344 | 0.220 | 0.0151 | 5550 | 4 | 6850 | 5.33 | ok |
| `tiger` | tiger_nu | 0.436 | 0.840 | 0.173 | 0.439 | 0.266 | 0.232 | 0.0000 | 3844 | 1 | 6790 | 6.67 | ok |
| `bull` | whaler | 0.552 | 0.481 | 0.236 | 0.167 | -0.070 | 0.129 | 0.0004 | 588 | 1 | 6750 | 6.67 | FAIL |
| `goblin` | goblinshark | 0.596 | 0.064 | 0.468 | 0.455 | -0.013 | 0.195 | 0.0212 | 0 | 5 | 1498 | 0.00 | FAIL |
| `greatwhite` | greatwhite_cy | 0.458 | 0.473 | 0.259 | 0.485 | 0.225 | 0.211 | 0.0013 | 1144 | 1 | 6784 | 6.67 | ok |
| `whaleshark` | whitepointer | 0.525 | 0.466 | 0.327 | 0.528 | 0.201 | 0.163 | 0.0119 | 2271 | 1 | 6790 | 6.67 | ok |
| `megalodon` | sharky | 0.388 | 0.893 | 0.404 | 0.662 | 0.258 | 0.192 | 0.0508 | 4935 | 3 | 6832 | 5.33 | FAIL |
| `dunkleosteus` | sharky | 0.397 | 0.501 | 0.429 | 0.660 | 0.231 | 0.181 | 0.0284 | 15 | 3 | 6832 | 5.33 | FAIL |
| `greenland` | megalodonrex | 0.455 | 0.537 | 0.210 | 0.487 | 0.277 | 0.239 | 0.0021 | 1510 | 1 | 6787 | 6.67 | ok |
| `snapjaw` | tigershark | 0.505 | 0.643 | 0.252 | 0.469 | 0.218 | 0.229 | 0.0020 | 737 | 1 | 6790 | 6.67 | ok |
| `gulperfiend` | anglerfish | 0.598 | 0.500 | 0.441 | 0.440 | -0.001 | 0.164 | 0.2164 | 4203 | 7 | 2098 | 0.00 | FAIL |
| `anglerfang` | smoothhound | 0.350 | 0.377 | 0.411 | 0.794 | 0.383 | 0.368 | 0.0002 | 3139 | 1 | 6649 | 6.67 | ok |
| `morayne` | thresher | 0.549 | 0.633 | 0.343 | 0.502 | 0.159 | 0.208 | 0.0053 | 1214 | 1 | 6790 | 6.67 | ok |
| `sailfin` | blueshark | 0.620 | 0.479 | 0.168 | 0.470 | 0.302 | 0.213 | 0.0039 | 1207 | 1 | 6767 | 6.67 | ok |
| `thornback` | bullhead | 0.501 | 0.869 | 0.235 | 0.444 | 0.209 | 0.206 | 0.0379 | 1560 | 1 | 6742 | 6.67 | FAIL |
| `stonejaw` | whaler | 0.434 | 0.815 | 0.234 | 0.168 | -0.066 | 0.129 | 0.0004 | 513 | 1 | 6750 | 6.67 | FAIL |
| `duskfin` | mako | 0.632 | 0.464 | 0.295 | 0.433 | 0.138 | 0.171 | 0.0030 | 161 | 1 | 6790 | 6.67 | ok |
| `barbhook` | sharky | 0.427 | 0.537 | 0.480 | 0.684 | 0.204 | 0.138 | 0.0332 | 0 | 4 | 6850 | 5.33 | FAIL |
| `coralcrown` | sharky | 0.380 | 0.905 | 0.547 | 0.682 | 0.135 | 0.120 | 0.0002 | 0 | 4 | 6889 | 5.33 | FAIL |
| `vex` | whitepointer | 0.620 | 0.478 | 0.296 | 0.481 | 0.185 | 0.193 | 0.0013 | 260 | 1 | 6790 | 6.67 | ok |
| `abyssmaw` | smoothhound | 0.389 | 0.433 | 0.273 | 0.717 | 0.444 | 0.346 | 0.0008 | 3925 | 1 | 6649 | 6.67 | ok |
| `riftjaw` | whaler | 0.527 | 0.502 | 0.366 | 0.259 | -0.107 | 0.239 | 0.0167 | 475 | 1 | 6750 | 6.67 | FAIL |
| `venomspine` | mako | 0.564 | 0.605 | 0.261 | 0.398 | 0.137 | 0.165 | 0.0034 | 192 | 1 | 6790 | 6.67 | ok |
| `howler` | tigershark | 0.430 | 0.329 | 0.527 | 0.519 | -0.008 | 0.305 | 0.0083 | 5266 | 1 | 6790 | 6.67 | FAIL |
| `magmaw` | bullhead | 0.398 | 0.937 | 0.356 | 0.431 | 0.075 | 0.221 | 0.0100 | 1270 | 1 | 6742 | 6.67 | ok |
| `frostjaw` | whitepointer | 0.616 | 0.497 | 0.289 | 0.500 | 0.211 | 0.196 | 0.0017 | 854 | 1 | 6790 | 6.67 | ok |
| `stormfin` | blueshark | 0.576 | 0.475 | 0.189 | 0.499 | 0.310 | 0.210 | 0.0116 | 801 | 1 | 6767 | 6.67 | ok |
| `gloomtide` | blueshark | 0.587 | 0.438 | 0.400 | 0.498 | 0.098 | 0.203 | 0.0128 | 869 | 1 | 6767 | 6.67 | ok |
| `wreckfang` | greatwhite_cy | 0.538 | 0.476 | 0.279 | 0.482 | 0.203 | 0.203 | 0.2218 | 951 | 1 | 6784 | 6.67 | FAIL |
| `ironfin` | greatwhite_cy | 0.526 | 0.481 | 0.305 | 0.466 | 0.162 | 0.183 | 0.0115 | 849 | 1 | 6784 | 6.67 | ok |
| `cindermaw` | blueshark | 0.464 | 0.957 | 0.420 | 0.409 | -0.011 | 0.242 | 0.0022 | 658 | 1 | 6767 | 6.67 | FAIL |
| `glacier` | whitepointer | 0.584 | 0.497 | 0.286 | 0.501 | 0.215 | 0.205 | 0.0189 | 1079 | 1 | 6790 | 6.67 | FAIL |
| `gravewater` | whitepointer | 0.572 | 0.576 | 0.322 | 0.493 | 0.171 | 0.205 | 0.0283 | 622 | 1 | 6790 | 6.67 | FAIL |
| `teslafang` | whitepointer | 0.484 | 0.964 | 0.294 | 0.509 | 0.214 | 0.250 | 0.0264 | 346 | 1 | 6790 | 6.67 | FAIL |
| `plaguemaw` | tigershark | 0.483 | 0.716 | 0.216 | 0.471 | 0.255 | 0.226 | 0.0043 | 736 | 1 | 6790 | 6.67 | ok |
| `sunspine` | whitepointer | 0.495 | 0.907 | 0.303 | 0.512 | 0.209 | 0.215 | 0.0095 | 1954 | 1 | 6790 | 6.67 | ok |
| `nocturne` | blueshark | 0.480 | 0.447 | 0.656 | 0.553 | -0.103 | 0.264 | 0.0327 | 3229 | 1 | 6767 | 6.67 | FAIL |
| `tempest` | blueshark | 0.590 | 0.493 | 0.205 | 0.496 | 0.291 | 0.206 | 0.0248 | 781 | 1 | 6767 | 6.67 | FAIL |
| `maelstrom` | whitepointer | 0.576 | 0.497 | 0.317 | 0.506 | 0.190 | 0.187 | 0.0068 | 838 | 1 | 6790 | 6.67 | ok |
| `bonecrown` | greatwhite_cy | 0.486 | 0.812 | 0.265 | 0.425 | 0.160 | 0.199 | 0.0210 | 1363 | 1 | 6784 | 6.67 | FAIL |
| `mirrorscale` | whaler | 0.417 | 0.428 | 0.635 | 0.499 | -0.136 | 0.327 | 0.0004 | 4668 | 1 | 6750 | 6.67 | FAIL |
| `aurora` | blueshark | 0.501 | 0.484 | 0.340 | 0.550 | 0.210 | 0.207 | 0.0275 | 2030 | 1 | 6767 | 6.67 | FAIL |
| `vulkan` | megalodonrex | 0.322 | 0.619 | 0.183 | 0.478 | 0.295 | 0.235 | 0.0010 | 1619 | 1 | 6787 | 6.67 | ok |
| `voltaicrex` | whitepointer | 0.626 | 0.502 | 0.260 | 0.494 | 0.234 | 0.201 | 0.0173 | 1028 | 1 | 6790 | 6.67 | FAIL |
| `nullfin` | greatwhite_cy | 0.545 | 0.443 | 0.276 | 0.499 | 0.223 | 0.208 | 0.2130 | 650 | 1 | 6784 | 6.67 | FAIL |
| `chronos` | mako | 0.476 | 0.811 | 0.386 | 0.478 | 0.092 | 0.157 | 0.0057 | 187 | 1 | 6790 | 6.67 | ok |
| `seismos` | megalodonrex | 0.369 | 0.655 | 0.128 | 0.503 | 0.375 | 0.260 | 0.0021 | 2939 | 1 | 6787 | 6.67 | ok |
| `banshee` | whitepointer | 0.513 | 0.482 | 0.565 | 0.491 | -0.075 | 0.246 | 0.0099 | 5448 | 1 | 6790 | 6.67 | FAIL |
| `vortexa` | megalodonrex | 0.484 | 0.500 | 0.222 | 0.488 | 0.266 | 0.235 | 0.0020 | 2563 | 1 | 6787 | 6.67 | ok |
| `warbringer` | greatwhite_cy | 0.327 | 0.559 | 0.321 | 0.380 | 0.059 | 0.280 | 0.0243 | 0 | 0 | 0 | 0.00 | FAIL |
| `omenmaw` | bullhead | 0.430 | 0.486 | 0.627 | 0.507 | -0.119 | 0.217 | 0.0455 | 3885 | 1 | 6742 | 6.67 | FAIL |
| `solaris` | whitepointer | 0.491 | 0.110 | 0.439 | 0.564 | 0.124 | 0.259 | 0.0036 | 2679 | 1 | 6790 | 6.67 | ok |
| `absolutezero` | tigershark | 0.274 | 0.509 | 0.856 | 0.672 | -0.184 | 0.293 | 0.0549 | 0 | 1 | 6790 | 6.67 | FAIL |
| `leviathanrex` | sharky | 0.332 | 0.504 | 0.462 | 0.602 | 0.140 | 0.198 | 0.0457 | 3756 | 4 | 7060 | 5.33 | FAIL |
| `leviathan_rex` | sharky | 0.344 | 0.495 | 0.373 | 0.601 | 0.228 | 0.166 | 0.0070 | 0 | 4 | 7340 | 5.33 | FAIL |
| `zeusfin` | sharky | 0.434 | 0.264 | 0.675 | 0.670 | -0.005 | 0.089 | 0.0108 | 0 | 4 | 6889 | 5.33 | FAIL |
| `poseidonrex` | whitepointer | 0.641 | 0.518 | 0.426 | 0.570 | 0.144 | 0.201 | 0.0047 | 2365 | 1 | 6790 | 6.67 | ok |
| `hadesmaw` | whitepointer | 0.452 | 0.060 | 0.543 | 0.562 | 0.019 | 0.264 | 0.0011 | 4734 | 1 | 6790 | 6.67 | FAIL |
| `apollodon` | mako | 0.457 | 0.878 | 0.521 | 0.506 | -0.015 | 0.198 | 0.0066 | 3183 | 1 | 6790 | 6.67 | FAIL |
| `artemisstrike` | whaler | 0.572 | 0.541 | 0.453 | 0.209 | -0.244 | 0.252 | 0.0002 | 2543 | 1 | 6750 | 6.67 | FAIL |
| `athenajaw` | scallopedhammer | 0.420 | 0.031 | 0.554 | 0.633 | 0.079 | 0.296 | 0.0003 | 3250 | 1 | 6742 | 6.67 | ok |
| `aresrender` | tigershark | 0.507 | 0.854 | 0.348 | 0.514 | 0.166 | 0.239 | 0.0041 | 2860 | 1 | 6790 | 6.67 | ok |
| `hermesdart` | whaler | 0.523 | 0.399 | 0.452 | 0.345 | -0.106 | 0.276 | 0.0001 | 3201 | 1 | 6750 | 6.67 | FAIL |
| `hephaestusforge` | megalodonrex | 0.448 | 0.759 | 0.408 | 0.490 | 0.081 | 0.275 | 0.0019 | 8167 | 1 | 6787 | 6.67 | ok |
| `dionysustide` | whaler | 0.441 | 0.960 | 0.272 | 0.235 | -0.037 | 0.210 | 0.0076 | 1212 | 1 | 6750 | 6.67 | FAIL |
| `aphroditelure` | bullhead | 0.391 | 0.068 | 0.621 | 0.486 | -0.134 | 0.252 | 0.0192 | 6263 | 1 | 6742 | 6.67 | FAIL |
| `heracrown` | sharky | 0.382 | 0.146 | 0.654 | 0.736 | 0.081 | 0.119 | 0.0033 | 0 | 4 | 6889 | 5.33 | FAIL |
| `typhonmaw` | sharky | 0.455 | 0.326 | 0.685 | 0.741 | 0.056 | 0.092 | 0.0003 | 0 | 3 | 6832 | 5.33 | FAIL |
| `hydrafang` | blueshark | 0.451 | 0.592 | 0.456 | 0.502 | 0.047 | 0.209 | 0.0008 | 933 | 1 | 6767 | 6.67 | FAIL |
| `cerberusjaw` | tigershark | 0.461 | 0.994 | 0.569 | 0.561 | -0.008 | 0.281 | 0.0018 | 4501 | 1 | 6790 | 6.67 | FAIL |
| `chimerashark` | sharky | 0.429 | 0.090 | 0.698 | 0.705 | 0.007 | 0.103 | 0.0013 | 0 | 4 | 6850 | 5.33 | FAIL |
| `medusagaze` | bullhead | 0.415 | 0.173 | 0.746 | 0.487 | -0.258 | 0.281 | 0.0379 | 5828 | 1 | 6742 | 6.67 | FAIL |
| `scyllarender` | blueshark | 0.567 | 0.518 | 0.484 | 0.515 | 0.032 | 0.220 | 0.0085 | 424 | 1 | 6767 | 6.67 | FAIL |
| `charybdisvoid` | megalodonrex | 0.419 | 0.575 | 0.379 | 0.510 | 0.130 | 0.269 | 0.0013 | 8904 | 1 | 6787 | 6.67 | ok |
| `minotaurram` | sharky | 0.412 | 0.280 | 0.694 | 0.715 | 0.021 | 0.091 | 0.0001 | 0 | 4 | 6868 | 5.33 | FAIL |
| `cyclopseye` | whaler | 0.438 | 1.000 | 0.445 | 0.576 | 0.131 | 0.342 | 0.0020 | 4206 | 1 | 6750 | 6.67 | ok |
| `harpyshade` | whitepointer | 0.606 | 0.791 | 0.675 | 0.597 | -0.077 | 0.157 | 0.0002 | 0 | 1 | 6790 | 6.67 | FAIL |
| `lamiacoil` | thresher | 0.480 | 0.858 | 0.495 | 0.531 | 0.035 | 0.237 | 0.0005 | 2365 | 1 | 6790 | 6.67 | FAIL |
| `kampechrono` | sharky | 0.387 | 0.532 | 0.651 | 0.713 | 0.061 | 0.088 | 0.1063 | 0 | 3 | 6832 | 5.33 | FAIL |
