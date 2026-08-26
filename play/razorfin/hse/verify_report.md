# HSE verification report (lane O3)

Generated 2026-08-26T01:51:27.443Z against 86 rows at 844x390 CSS, DPR 2, landscape.

**23/86 rows pass all gates. 63 failing. 0 console errors.**

Evidence: `hse/evidence/r14-round3`
Contact sheet: `hse/evidence/r14-round3/contact_sheet.png`

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

## Diff against baseline

Baseline: `hse/evidence/r14-round2`

**Regressed:**
- `epaulette` new failures: no eye highlight in head crop (0 bright px); background bleeds through body at 5.58% > 2.00%
- `cookiecutter` countershade -0.044 < 0.06 (back 0.326 belly 0.282)
- `cookiecutter` countershade dropped 0.243 -> -0.044
- `mako` sat dropped 0.651 -> 0.483
- `blue` sat dropped 0.642 -> 0.489
- `hammerhead` background bleeds through body at 2.49% > 2.00%
- `hammerhead` countershade dropped 0.276 -> 0.148
- `thresher` sat dropped 0.636 -> 0.541
- `sawshark` countershade dropped 0.344 -> 0.206
- `tiger` countershade 0.008 < 0.06 (back 0.192 belly 0.201)
- `tiger` countershade dropped 0.266 -> 0.008
- `tiger` valStd dropped 0.232 -> 0.117
- `greatwhite` background bleeds through body at 20.79% > 2.00%
- `whaleshark` background bleeds through body at 5.95% > 2.00%
- `dunkleosteus` countershade dropped 0.231 -> 0.140
- `greenland` background bleeds through body at 4.03% > 2.00%
- `greenland` countershade dropped 0.277 -> 0.156
- `anglerfang` countershade dropped 0.383 -> 0.240
- `morayne` no eye highlight in head crop (0 bright px)
- `sailfin` background bleeds through body at 2.01% > 2.00%
- `thornback` new failures: no eye highlight in head crop (2 bright px); background bleeds through body at 4.78% > 2.00%
- `duskfin` sat dropped 0.632 -> 0.491
- `coralcrown` countershade dropped 0.135 -> 0.000
- `vex` sat dropped 0.620 -> 0.509
- `riftjaw` valStd dropped 0.239 -> 0.131
- `venomspine` background bleeds through body at 5.25% > 2.00%
- `venomspine` sat dropped 0.564 -> 0.452
- `magmaw` countershade 0.058 < 0.06 (back 0.461 belly 0.519); background bleeds through body at 25.49% > 2.00%
- `frostjaw` sat dropped 0.616 -> 0.485
- `stormfin` background bleeds through body at 3.08% > 2.00%
- `gloomtide` background bleeds through body at 3.71% > 2.00%
- `gloomtide` sat dropped 0.587 -> 0.502
- `ironfin` background bleeds through body at 5.17% > 2.00%
- `glacier` new failures: too close to voltaicrex (thumb distance 0.0417 < 0.055); too close to maelstrom (thumb distance 0.0535 < 0.055)
- `gravewater` sat dropped 0.572 -> 0.477
- `teslafang` countershade dropped 0.214 -> 0.127
- `nocturne` countershade dropped -0.103 -> -0.198
- `tempest` countershade dropped 0.291 -> 0.160
- `maelstrom` background bleeds through body at 2.30% > 2.00%; too close to vortexa (thumb distance 0.0436 < 0.055); too close to glacier (thumb distance 0.0535 < 0.055)
- `vulkan` background bleeds through body at 2.72% > 2.00%
- `seismos` background bleeds through body at 2.18% > 2.00%
- `seismos` countershade dropped 0.375 -> 0.204
- `vortexa` background bleeds through body at 2.08% > 2.00%; too close to maelstrom (thumb distance 0.0436 < 0.055)
- `vortexa` countershade dropped 0.266 -> 0.183
- `warbringer` valStd dropped 0.280 -> 0.171
- `poseidonrex` background bleeds through body at 2.60% > 2.00%
- `hephaestusforge` countershade 0.037 < 0.06 (back 0.488 belly 0.524); background bleeds through body at 2.32% > 2.00%
- `aphroditelure` new failures: countershade -0.197 < 0.06 (back 0.781 belly 0.584); no eye highlight in head crop (0 bright px); background bleeds through body at 3.25% > 2.00%
- `scyllarender` new failures: countershade 0.059 < 0.06 (back 0.457 belly 0.516); background bleeds through body at 2.29% > 2.00%
- `charybdisvoid` background bleeds through body at 5.60% > 2.00%
- `harpyshade` new failures: countershade -0.068 < 0.06 (back 0.671 belly 0.603); background bleeds through body at 2.88% > 2.00%

Improved: `barbhook`, `cindermaw`, `gravewater`, `teslafang`, `tempest`, `mirrorscale`, `minotaurram`, `lamiacoil`

## Failing rows

Reported for the owning lane, not fixed here. Crop paths are 3x head crops.

| row | model | failures | head crop |
| --- | --- | --- | --- |
| `reef` | dogfish | countershade -0.044 < 0.06 (back 0.393 belly 0.349) | `hse/evidence/r14-round3/heads/head_reef.png` |
| `epaulette` | bullhead | no eye highlight in head crop (0 bright px)<br>background bleeds through body at 5.58% > 2.00% | `hse/evidence/r14-round3/heads/head_epaulette.png` |
| `cookiecutter` | smoothhound | countershade -0.044 < 0.06 (back 0.326 belly 0.282) | `hse/evidence/r14-round3/heads/head_cookiecutter.png` |
| `mako` | mako | too close to blue (thumb distance 0.0365 < 0.055) | `hse/evidence/r14-round3/heads/head_mako.png` |
| `blue` | mako | too close to mako (thumb distance 0.0365 < 0.055) | `hse/evidence/r14-round3/heads/head_blue.png` |
| `hammerhead` | smoothhammer | background bleeds through body at 2.49% > 2.00% | `hse/evidence/r14-round3/heads/head_hammerhead.png` |
| `tiger` | tiger_nu | countershade 0.008 < 0.06 (back 0.192 belly 0.201) | `hse/evidence/r14-round3/heads/head_tiger.png` |
| `bull` | whaler | countershade 0.005 < 0.06 (back 0.223 belly 0.228) | `hse/evidence/r14-round3/heads/head_bull.png` |
| `goblin` | goblinshark | countershade -0.036 < 0.06 (back 0.472 belly 0.436)<br>background bleeds through body at 2.62% > 2.00% | `hse/evidence/r14-round3/heads/head_goblin.png` |
| `greatwhite` | greatwhite_cy | background bleeds through body at 20.79% > 2.00% | `hse/evidence/r14-round3/heads/head_greatwhite.png` |
| `whaleshark` | whitepointer | background bleeds through body at 5.95% > 2.00% | `hse/evidence/r14-round3/heads/head_whaleshark.png` |
| `megalodon` | whitepointer | background bleeds through body at 2.15% > 2.00% | `hse/evidence/r14-round3/heads/head_megalodon.png` |
| `dunkleosteus` | bullhead | background bleeds through body at 3.25% > 2.00% | `hse/evidence/r14-round3/heads/head_dunkleosteus.png` |
| `greenland` | whitepointer | background bleeds through body at 4.03% > 2.00% | `hse/evidence/r14-round3/heads/head_greenland.png` |
| `gulperfiend` | anglerfish | countershade -0.011 < 0.06 (back 0.446 belly 0.435)<br>background bleeds through body at 22.36% > 2.00% | `hse/evidence/r14-round3/heads/head_gulperfiend.png` |
| `morayne` | thresher | no eye highlight in head crop (0 bright px) | `hse/evidence/r14-round3/heads/head_morayne.png` |
| `sailfin` | blueshark | background bleeds through body at 2.01% > 2.00% | `hse/evidence/r14-round3/heads/head_sailfin.png` |
| `thornback` | bullhead | no eye highlight in head crop (2 bright px)<br>background bleeds through body at 4.78% > 2.00% | `hse/evidence/r14-round3/heads/head_thornback.png` |
| `stonejaw` | whaler | countershade -0.013 < 0.06 (back 0.228 belly 0.215) | `hse/evidence/r14-round3/heads/head_stonejaw.png` |
| `coralcrown` | whaler | countershade 0.000 < 0.06 (back 0.267 belly 0.267) | `hse/evidence/r14-round3/heads/head_coralcrown.png` |
| `riftjaw` | whaler | countershade -0.002 < 0.06 (back 0.235 belly 0.233) | `hse/evidence/r14-round3/heads/head_riftjaw.png` |
| `venomspine` | mako | background bleeds through body at 5.25% > 2.00% | `hse/evidence/r14-round3/heads/head_venomspine.png` |
| `howler` | tigershark | countershade -0.083 < 0.06 (back 0.581 belly 0.498) | `hse/evidence/r14-round3/heads/head_howler.png` |
| `magmaw` | bullhead | countershade 0.058 < 0.06 (back 0.461 belly 0.519)<br>background bleeds through body at 25.49% > 2.00% | `hse/evidence/r14-round3/heads/head_magmaw.png` |
| `stormfin` | blueshark | background bleeds through body at 3.08% > 2.00% | `hse/evidence/r14-round3/heads/head_stormfin.png` |
| `gloomtide` | blueshark | background bleeds through body at 3.71% > 2.00% | `hse/evidence/r14-round3/heads/head_gloomtide.png` |
| `wreckfang` | greatwhite_cy | background bleeds through body at 2.17% > 2.00% | `hse/evidence/r14-round3/heads/head_wreckfang.png` |
| `ironfin` | greatwhite_cy | background bleeds through body at 5.17% > 2.00% | `hse/evidence/r14-round3/heads/head_ironfin.png` |
| `glacier` | whitepointer | too close to voltaicrex (thumb distance 0.0417 < 0.055)<br>too close to maelstrom (thumb distance 0.0535 < 0.055) | `hse/evidence/r14-round3/heads/head_glacier.png` |
| `nocturne` | blueshark | countershade -0.198 < 0.06 (back 0.710 belly 0.513) | `hse/evidence/r14-round3/heads/head_nocturne.png` |
| `maelstrom` | whitepointer | background bleeds through body at 2.30% > 2.00%<br>too close to vortexa (thumb distance 0.0436 < 0.055)<br>too close to glacier (thumb distance 0.0535 < 0.055) | `hse/evidence/r14-round3/heads/head_maelstrom.png` |
| `bonecrown` | greatwhite_cy | background bleeds through body at 3.05% > 2.00% | `hse/evidence/r14-round3/heads/head_bonecrown.png` |
| `aurora` | blueshark | background bleeds through body at 7.41% > 2.00% | `hse/evidence/r14-round3/heads/head_aurora.png` |
| `vulkan` | whitepointer | background bleeds through body at 2.72% > 2.00% | `hse/evidence/r14-round3/heads/head_vulkan.png` |
| `voltaicrex` | whitepointer | too close to glacier (thumb distance 0.0417 < 0.055) | `hse/evidence/r14-round3/heads/head_voltaicrex.png` |
| `nullfin` | greatwhite_cy | background bleeds through body at 19.60% > 2.00% | `hse/evidence/r14-round3/heads/head_nullfin.png` |
| `seismos` | whitepointer | background bleeds through body at 2.18% > 2.00% | `hse/evidence/r14-round3/heads/head_seismos.png` |
| `banshee` | whitepointer | countershade -0.068 < 0.06 (back 0.580 belly 0.512) | `hse/evidence/r14-round3/heads/head_banshee.png` |
| `vortexa` | whitepointer | background bleeds through body at 2.08% > 2.00%<br>too close to maelstrom (thumb distance 0.0436 < 0.055) | `hse/evidence/r14-round3/heads/head_vortexa.png` |
| `warbringer` | greatwhite_cy | countershade 0.010 < 0.06 (back 0.457 belly 0.467)<br>background bleeds through body at 4.02% > 2.00% | `hse/evidence/r14-round3/heads/head_warbringer.png` |
| `omenmaw` | bullhead | countershade -0.185 < 0.06 (back 0.691 belly 0.506) | `hse/evidence/r14-round3/heads/head_omenmaw.png` |
| `absolutezero` | tigershark | countershade -0.106 < 0.06 (back 0.908 belly 0.802)<br>no eye highlight in head crop (0 bright px)<br>background bleeds through body at 2.38% > 2.00% | `hse/evidence/r14-round3/heads/head_absolutezero.png` |
| `leviathanrex` | sharky | background bleeds through body at 3.20% > 2.00% | `hse/evidence/r14-round3/heads/head_leviathanrex.png` |
| `leviathan_rex` | sharky | background bleeds through body at 3.31% > 2.00% | `hse/evidence/r14-round3/heads/head_leviathan_rex.png` |
| `zeusfin` | mako | countershade -0.048 < 0.06 (back 0.500 belly 0.452) | `hse/evidence/r14-round3/heads/head_zeusfin.png` |
| `poseidonrex` | whitepointer | background bleeds through body at 2.60% > 2.00% | `hse/evidence/r14-round3/heads/head_poseidonrex.png` |
| `hadesmaw` | whitepointer | countershade -0.008 < 0.06 (back 0.564 belly 0.556) | `hse/evidence/r14-round3/heads/head_hadesmaw.png` |
| `apollodon` | mako | countershade 0.030 < 0.06 (back 0.513 belly 0.543) | `hse/evidence/r14-round3/heads/head_apollodon.png` |
| `artemisstrike` | whaler | countershade -0.182 < 0.06 (back 0.463 belly 0.281) | `hse/evidence/r14-round3/heads/head_artemisstrike.png` |
| `hermesdart` | whaler | countershade -0.080 < 0.06 (back 0.463 belly 0.383) | `hse/evidence/r14-round3/heads/head_hermesdart.png` |
| `hephaestusforge` | whitepointer | countershade 0.037 < 0.06 (back 0.488 belly 0.524)<br>background bleeds through body at 2.32% > 2.00% | `hse/evidence/r14-round3/heads/head_hephaestusforge.png` |
| `dionysustide` | whaler | countershade -0.024 < 0.06 (back 0.282 belly 0.258) | `hse/evidence/r14-round3/heads/head_dionysustide.png` |
| `aphroditelure` | bullhead | countershade -0.197 < 0.06 (back 0.781 belly 0.584)<br>no eye highlight in head crop (0 bright px)<br>background bleeds through body at 3.25% > 2.00% | `hse/evidence/r14-round3/heads/head_aphroditelure.png` |
| `heracrown` | whitepointer | background bleeds through body at 3.47% > 2.00% | `hse/evidence/r14-round3/heads/head_heracrown.png` |
| `typhonmaw` | whitepointer | background bleeds through body at 5.31% > 2.00% | `hse/evidence/r14-round3/heads/head_typhonmaw.png` |
| `hydrafang` | blueshark | countershade 0.042 < 0.06 (back 0.461 belly 0.503) | `hse/evidence/r14-round3/heads/head_hydrafang.png` |
| `cerberusjaw` | tigershark | countershade -0.059 < 0.06 (back 0.605 belly 0.547) | `hse/evidence/r14-round3/heads/head_cerberusjaw.png` |
| `chimerashark` | thresher | countershade -0.046 < 0.06 (back 0.470 belly 0.424) | `hse/evidence/r14-round3/heads/head_chimerashark.png` |
| `medusagaze` | bullhead | countershade -0.198 < 0.06 (back 0.747 belly 0.549)<br>background bleeds through body at 2.42% > 2.00% | `hse/evidence/r14-round3/heads/head_medusagaze.png` |
| `scyllarender` | blueshark | countershade 0.059 < 0.06 (back 0.457 belly 0.516)<br>background bleeds through body at 2.29% > 2.00% | `hse/evidence/r14-round3/heads/head_scyllarender.png` |
| `charybdisvoid` | whitepointer | background bleeds through body at 5.60% > 2.00% | `hse/evidence/r14-round3/heads/head_charybdisvoid.png` |
| `harpyshade` | whitepointer | countershade -0.068 < 0.06 (back 0.671 belly 0.603)<br>no eye highlight in head crop (0 bright px)<br>background bleeds through body at 2.88% > 2.00% | `hse/evidence/r14-round3/heads/head_harpyshade.png` |
| `kampechrono` | whitepointer | background bleeds through body at 3.81% > 2.00% | `hse/evidence/r14-round3/heads/head_kampechrono.png` |

## Ten closest pairs (distinctness)

| a | b | distance | verdict |
| --- | --- | --- | --- |
| `mako` | `blue` | 0.0365 | TOO CLOSE |
| `glacier` | `voltaicrex` | 0.0417 | TOO CLOSE |
| `maelstrom` | `vortexa` | 0.0436 | TOO CLOSE |
| `glacier` | `maelstrom` | 0.0535 | TOO CLOSE |
| `stonejaw` | `riftjaw` | 0.0558 | ok |
| `maelstrom` | `voltaicrex` | 0.0570 | ok |
| `glacier` | `vortexa` | 0.0627 | ok |
| `maelstrom` | `seismos` | 0.0654 | ok |
| `voltaicrex` | `vortexa` | 0.0660 | ok |
| `vulkan` | `seismos` | 0.0669 | ok |

## Per-row measurements

| row | model | sat | hue | back | belly | c-shade | patStd | bleed | eyePx | draws | tris | texMB | verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `reef` | dogfish | 0.524 | 0.494 | 0.393 | 0.349 | -0.044 | 0.128 | 0.0004 | 41 | 1 | 6715 | 6.67 | FAIL |
| `epaulette` | bullhead | 0.484 | 0.873 | 0.412 | 0.539 | 0.127 | 0.146 | 0.0558 | 0 | 1 | 6742 | 6.67 | FAIL |
| `cookiecutter` | smoothhound | 0.439 | 0.820 | 0.326 | 0.282 | -0.044 | 0.140 | 0.0000 | 263 | 1 | 6649 | 6.67 | FAIL |
| `mako` | mako | 0.483 | 0.553 | 0.268 | 0.366 | 0.098 | 0.141 | 0.0065 | 271 | 1 | 6790 | 6.67 | FAIL |
| `blue` | mako | 0.489 | 0.558 | 0.283 | 0.409 | 0.126 | 0.143 | 0.0092 | 331 | 1 | 6790 | 6.67 | FAIL |
| `hammerhead` | smoothhammer | 0.622 | 0.480 | 0.349 | 0.498 | 0.148 | 0.162 | 0.0249 | 185 | 1 | 6733 | 6.67 | FAIL |
| `thresher` | thresher | 0.541 | 0.549 | 0.301 | 0.470 | 0.169 | 0.188 | 0.0075 | 1035 | 1 | 6790 | 6.67 | ok |
| `sawshark` | thresher | 0.488 | 0.828 | 0.278 | 0.484 | 0.206 | 0.193 | 0.0053 | 715 | 2 | 6826 | 6.67 | ok |
| `tiger` | tiger_nu | 0.510 | 0.833 | 0.192 | 0.201 | 0.008 | 0.117 | 0.0000 | 848 | 1 | 6790 | 6.67 | FAIL |
| `bull` | whaler | 0.490 | 0.544 | 0.223 | 0.228 | 0.005 | 0.123 | 0.0006 | 523 | 1 | 6750 | 6.67 | FAIL |
| `goblin` | goblinshark | 0.602 | 0.062 | 0.472 | 0.436 | -0.036 | 0.196 | 0.0262 | 7503 | 5 | 1498 | 0.00 | FAIL |
| `greatwhite` | greatwhite_cy | 0.481 | 0.477 | 0.317 | 0.497 | 0.180 | 0.165 | 0.2079 | 298 | 1 | 6784 | 6.67 | FAIL |
| `whaleshark` | whitepointer | 0.506 | 0.477 | 0.346 | 0.490 | 0.143 | 0.183 | 0.0595 | 1519 | 1 | 6790 | 6.67 | FAIL |
| `megalodon` | whitepointer | 0.413 | 0.307 | 0.274 | 0.486 | 0.213 | 0.211 | 0.0215 | 765 | 1 | 6790 | 6.67 | FAIL |
| `dunkleosteus` | bullhead | 0.482 | 0.487 | 0.404 | 0.544 | 0.140 | 0.146 | 0.0325 | 42 | 1 | 6742 | 6.67 | FAIL |
| `greenland` | whitepointer | 0.521 | 0.496 | 0.370 | 0.526 | 0.156 | 0.195 | 0.0403 | 1102 | 1 | 6790 | 6.67 | FAIL |
| `snapjaw` | tigershark | 0.444 | 0.622 | 0.246 | 0.529 | 0.284 | 0.225 | 0.0009 | 734 | 1 | 6790 | 6.67 | ok |
| `gulperfiend` | anglerfish | 0.606 | 0.501 | 0.446 | 0.435 | -0.011 | 0.146 | 0.2236 | 4515 | 7 | 2098 | 0.00 | FAIL |
| `anglerfang` | smoothhound | 0.344 | 0.556 | 0.551 | 0.791 | 0.240 | 0.337 | 0.0010 | 5093 | 1 | 6649 | 6.67 | ok |
| `morayne` | thresher | 0.526 | 0.782 | 0.320 | 0.445 | 0.124 | 0.163 | 0.0082 | 0 | 1 | 6790 | 6.67 | FAIL |
| `sailfin` | blueshark | 0.598 | 0.534 | 0.254 | 0.512 | 0.258 | 0.193 | 0.0201 | 254 | 1 | 6767 | 6.67 | FAIL |
| `thornback` | bullhead | 0.476 | 0.822 | 0.380 | 0.527 | 0.147 | 0.150 | 0.0478 | 2 | 1 | 6742 | 6.67 | FAIL |
| `stonejaw` | whaler | 0.400 | 0.787 | 0.228 | 0.215 | -0.013 | 0.127 | 0.0005 | 550 | 1 | 6750 | 6.67 | FAIL |
| `duskfin` | mako | 0.491 | 0.559 | 0.253 | 0.445 | 0.191 | 0.172 | 0.0094 | 199 | 1 | 6790 | 6.67 | ok |
| `barbhook` | thresher | 0.558 | 0.552 | 0.227 | 0.373 | 0.146 | 0.172 | 0.0199 | 483 | 2 | 6826 | 6.67 | ok |
| `coralcrown` | whaler | 0.313 | 0.370 | 0.267 | 0.267 | 0.000 | 0.133 | 0.0000 | 293 | 2 | 6782 | 6.67 | FAIL |
| `vex` | whitepointer | 0.509 | 0.622 | 0.294 | 0.503 | 0.209 | 0.196 | 0.0037 | 617 | 1 | 6790 | 6.67 | ok |
| `abyssmaw` | smoothhound | 0.413 | 0.564 | 0.309 | 0.728 | 0.419 | 0.294 | 0.0006 | 3449 | 1 | 6649 | 6.67 | ok |
| `riftjaw` | whaler | 0.536 | 0.527 | 0.235 | 0.233 | -0.002 | 0.131 | 0.0005 | 430 | 1 | 6750 | 6.67 | FAIL |
| `venomspine` | mako | 0.452 | 0.877 | 0.288 | 0.390 | 0.103 | 0.163 | 0.0525 | 592 | 1 | 6790 | 6.67 | FAIL |
| `howler` | tigershark | 0.382 | 0.725 | 0.581 | 0.498 | -0.083 | 0.306 | 0.0036 | 5966 | 1 | 6790 | 6.67 | FAIL |
| `magmaw` | bullhead | 0.445 | 0.171 | 0.461 | 0.519 | 0.058 | 0.195 | 0.2549 | 45 | 1 | 6742 | 6.67 | FAIL |
| `frostjaw` | whitepointer | 0.485 | 0.548 | 0.345 | 0.518 | 0.172 | 0.234 | 0.0060 | 3138 | 1 | 6790 | 6.67 | ok |
| `stormfin` | blueshark | 0.590 | 0.554 | 0.233 | 0.497 | 0.264 | 0.193 | 0.0308 | 324 | 1 | 6767 | 6.67 | FAIL |
| `gloomtide` | blueshark | 0.502 | 0.278 | 0.427 | 0.507 | 0.080 | 0.175 | 0.0371 | 31 | 1 | 6767 | 6.67 | FAIL |
| `wreckfang` | greatwhite_cy | 0.544 | 0.516 | 0.290 | 0.477 | 0.187 | 0.176 | 0.0217 | 428 | 1 | 6784 | 6.67 | FAIL |
| `ironfin` | greatwhite_cy | 0.532 | 0.515 | 0.343 | 0.472 | 0.129 | 0.165 | 0.0517 | 246 | 1 | 6784 | 6.67 | FAIL |
| `cindermaw` | blueshark | 0.449 | 0.210 | 0.453 | 0.575 | 0.121 | 0.244 | 0.0012 | 348 | 1 | 6767 | 6.67 | ok |
| `glacier` | whitepointer | 0.531 | 0.530 | 0.316 | 0.522 | 0.207 | 0.201 | 0.0046 | 1235 | 1 | 6790 | 6.67 | FAIL |
| `gravewater` | whitepointer | 0.477 | 0.371 | 0.226 | 0.360 | 0.134 | 0.187 | 0.0028 | 1093 | 1 | 6790 | 6.67 | ok |
| `teslafang` | whitepointer | 0.494 | 0.106 | 0.279 | 0.406 | 0.127 | 0.173 | 0.0009 | 743 | 1 | 6790 | 6.67 | ok |
| `plaguemaw` | tigershark | 0.416 | 0.026 | 0.158 | 0.364 | 0.206 | 0.216 | 0.0022 | 590 | 1 | 6790 | 6.67 | ok |
| `sunspine` | whitepointer | 0.492 | 0.772 | 0.309 | 0.514 | 0.205 | 0.208 | 0.0013 | 962 | 1 | 6790 | 6.67 | ok |
| `nocturne` | blueshark | 0.465 | 0.535 | 0.710 | 0.513 | -0.198 | 0.262 | 0.0093 | 3474 | 1 | 6767 | 6.67 | FAIL |
| `tempest` | blueshark | 0.583 | 0.515 | 0.299 | 0.460 | 0.160 | 0.236 | 0.0171 | 1865 | 1 | 6767 | 6.67 | ok |
| `maelstrom` | whitepointer | 0.535 | 0.527 | 0.336 | 0.509 | 0.173 | 0.192 | 0.0230 | 379 | 1 | 6790 | 6.67 | FAIL |
| `bonecrown` | greatwhite_cy | 0.469 | 0.795 | 0.289 | 0.520 | 0.231 | 0.202 | 0.0305 | 765 | 1 | 6784 | 6.67 | FAIL |
| `mirrorscale` | whaler | 0.368 | 0.480 | 0.394 | 0.787 | 0.393 | 0.310 | 0.0008 | 4131 | 1 | 6750 | 6.67 | ok |
| `aurora` | blueshark | 0.532 | 0.514 | 0.340 | 0.534 | 0.194 | 0.177 | 0.0741 | 212 | 1 | 6767 | 6.67 | FAIL |
| `vulkan` | whitepointer | 0.431 | 0.344 | 0.285 | 0.508 | 0.224 | 0.214 | 0.0272 | 641 | 1 | 6790 | 6.67 | FAIL |
| `voltaicrex` | whitepointer | 0.611 | 0.509 | 0.303 | 0.516 | 0.213 | 0.190 | 0.0012 | 1038 | 1 | 6790 | 6.67 | FAIL |
| `nullfin` | greatwhite_cy | 0.539 | 0.549 | 0.330 | 0.521 | 0.190 | 0.174 | 0.1960 | 602 | 1 | 6784 | 6.67 | FAIL |
| `chronos` | mako | 0.440 | 0.797 | 0.368 | 0.567 | 0.199 | 0.153 | 0.0193 | 642 | 1 | 6790 | 6.67 | ok |
| `seismos` | whitepointer | 0.458 | 0.749 | 0.278 | 0.483 | 0.204 | 0.210 | 0.0218 | 585 | 1 | 6790 | 6.67 | FAIL |
| `banshee` | whitepointer | 0.438 | 0.534 | 0.580 | 0.512 | -0.068 | 0.251 | 0.0040 | 5398 | 1 | 6790 | 6.67 | FAIL |
| `vortexa` | whitepointer | 0.544 | 0.524 | 0.325 | 0.508 | 0.183 | 0.195 | 0.0208 | 732 | 1 | 6790 | 6.67 | FAIL |
| `warbringer` | greatwhite_cy | 0.541 | 0.529 | 0.457 | 0.467 | 0.010 | 0.171 | 0.0402 | 1105 | 1 | 6784 | 6.67 | FAIL |
| `omenmaw` | bullhead | 0.397 | 0.673 | 0.691 | 0.506 | -0.185 | 0.174 | 0.0177 | 3360 | 1 | 6742 | 6.67 | FAIL |
| `solaris` | whitepointer | 0.433 | 0.879 | 0.540 | 0.615 | 0.075 | 0.254 | 0.0152 | 3564 | 1 | 6790 | 6.67 | ok |
| `absolutezero` | tigershark | 0.252 | 0.617 | 0.908 | 0.802 | -0.106 | 0.319 | 0.0238 | 0 | 1 | 6790 | 6.67 | FAIL |
| `leviathanrex` | sharky | 0.346 | 0.508 | 0.480 | 0.593 | 0.113 | 0.208 | 0.0320 | 3633 | 4 | 7060 | 5.33 | FAIL |
| `leviathan_rex` | sharky | 0.363 | 0.496 | 0.370 | 0.602 | 0.232 | 0.172 | 0.0331 | 14 | 4 | 7340 | 5.33 | FAIL |
| `zeusfin` | mako | 0.435 | 0.462 | 0.500 | 0.452 | -0.048 | 0.220 | 0.0048 | 1475 | 2 | 6822 | 6.67 | FAIL |
| `poseidonrex` | whitepointer | 0.585 | 0.562 | 0.445 | 0.576 | 0.131 | 0.196 | 0.0260 | 2074 | 1 | 6790 | 6.67 | FAIL |
| `hadesmaw` | whitepointer | 0.450 | 0.985 | 0.564 | 0.556 | -0.008 | 0.260 | 0.0008 | 5012 | 1 | 6790 | 6.67 | FAIL |
| `apollodon` | mako | 0.417 | 0.966 | 0.513 | 0.543 | 0.030 | 0.220 | 0.0000 | 611 | 1 | 6790 | 6.67 | FAIL |
| `artemisstrike` | whaler | 0.552 | 0.622 | 0.463 | 0.281 | -0.182 | 0.230 | 0.0001 | 2472 | 1 | 6750 | 6.67 | FAIL |
| `athenajaw` | scallopedhammer | 0.408 | 0.958 | 0.525 | 0.669 | 0.144 | 0.284 | 0.0001 | 3640 | 1 | 6742 | 6.67 | ok |
| `aresrender` | tigershark | 0.470 | 0.337 | 0.362 | 0.549 | 0.187 | 0.224 | 0.0013 | 2124 | 1 | 6790 | 6.67 | ok |
| `hermesdart` | whaler | 0.502 | 0.449 | 0.463 | 0.383 | -0.080 | 0.256 | 0.0001 | 2909 | 1 | 6750 | 6.67 | FAIL |
| `hephaestusforge` | whitepointer | 0.508 | 0.826 | 0.488 | 0.524 | 0.037 | 0.198 | 0.0232 | 836 | 1 | 6790 | 6.67 | FAIL |
| `dionysustide` | whaler | 0.404 | 0.024 | 0.282 | 0.258 | -0.024 | 0.182 | 0.0004 | 1097 | 1 | 6750 | 6.67 | FAIL |
| `aphroditelure` | bullhead | 0.380 | 0.170 | 0.781 | 0.584 | -0.197 | 0.190 | 0.0325 | 0 | 1 | 6742 | 6.67 | FAIL |
| `heracrown` | whitepointer | 0.453 | 0.751 | 0.485 | 0.548 | 0.063 | 0.198 | 0.0347 | 3741 | 2 | 6822 | 6.67 | FAIL |
| `typhonmaw` | whitepointer | 0.484 | 0.390 | 0.413 | 0.525 | 0.112 | 0.226 | 0.0531 | 4393 | 1 | 6790 | 6.67 | FAIL |
| `hydrafang` | blueshark | 0.446 | 0.432 | 0.461 | 0.503 | 0.042 | 0.202 | 0.0146 | 448 | 1 | 6767 | 6.67 | FAIL |
| `cerberusjaw` | tigershark | 0.433 | 0.339 | 0.605 | 0.547 | -0.059 | 0.280 | 0.0019 | 4310 | 1 | 6790 | 6.67 | FAIL |
| `chimerashark` | thresher | 0.595 | 0.479 | 0.470 | 0.424 | -0.046 | 0.260 | 0.0017 | 935 | 2 | 6826 | 6.67 | FAIL |
| `medusagaze` | bullhead | 0.398 | 0.119 | 0.747 | 0.549 | -0.198 | 0.219 | 0.0242 | 4968 | 1 | 6742 | 6.67 | FAIL |
| `scyllarender` | blueshark | 0.542 | 0.509 | 0.457 | 0.516 | 0.059 | 0.211 | 0.0229 | 401 | 1 | 6767 | 6.67 | FAIL |
| `charybdisvoid` | whitepointer | 0.459 | 0.627 | 0.425 | 0.534 | 0.109 | 0.224 | 0.0560 | 3358 | 1 | 6790 | 6.67 | FAIL |
| `minotaurram` | whitepointer | 0.522 | 0.502 | 0.412 | 0.537 | 0.126 | 0.228 | 0.0020 | 5246 | 2 | 6802 | 6.67 | ok |
| `cyclopseye` | whaler | 0.400 | 0.051 | 0.402 | 0.671 | 0.269 | 0.334 | 0.0006 | 5307 | 1 | 6750 | 6.67 | ok |
| `harpyshade` | whitepointer | 0.604 | 0.801 | 0.671 | 0.603 | -0.068 | 0.167 | 0.0288 | 0 | 1 | 6790 | 6.67 | FAIL |
| `lamiacoil` | thresher | 0.466 | 0.104 | 0.466 | 0.552 | 0.086 | 0.232 | 0.0126 | 745 | 1 | 6790 | 6.67 | ok |
| `kampechrono` | whitepointer | 0.457 | 0.636 | 0.397 | 0.539 | 0.142 | 0.218 | 0.0381 | 3861 | 1 | 6790 | 6.67 | FAIL |
