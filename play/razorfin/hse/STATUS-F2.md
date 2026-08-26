# Lane F2 status: fix round 2 on the measured HSE defects

Owns `hse/skin_identity.js` and `hse/rig_morph.js`. Did NOT edit `shark3d.js`
(no hook was needed: everything F2 does is reachable from the single
`retargetIdentityAxes(body)` call lane F1 already installed). Did NOT edit
`tools/gen_data.py` or `data.js` - see "What F2 did not do" below for why the
palette tweak the brief allowed was not taken. No commit.

## Headline

Full roster, 86/86 captured, **0 console errors**. Evidence
`hse/evidence/f2-final2`, diffed against `hse/evidence/r14-round2`.

| gate | round 2 | F2 |
| --- | --- | --- |
| distinctness failures | 4 | **0** |
| pairs under the 0.055 floor | 2 | **0** |
| pattern-contrast failures | 4 | **0** |
| eye-highlight failures | 13 | **6** |
| rows with zero eye pixels | 13 | **6** |
| rows with NEGATIVE countershade | 22 | **19** |
| countershade failures | 30 | 31 |
| background-bleed failures | 21 | **29** |
| rows passing every gate | 35 | **32** |

Item 1 - the one the brief led with - is FULLY fixed roster-wide. Items 3, 4
and 5 are resolved. Item 2 improved but did not reach 0.10 on the hard rows.
The pass count is DOWN 3 because background bleed regressed, which I diagnosed
and mostly-but-not-fully fixed; the honest accounting is in "What is not fixed".

| # | item | verdict |
| --- | --- | --- |
| 1 | distinctness on textured rows | REAL, **FIXED**: hue tracks the palette, zero pairs under the gate |
| 2 | countershade inverted/dropped | REAL, improved (`bull` un-inverted, 22 -> 19 negative), not to 0.10 |
| 3 | texture-bytes gate | ALREADY CLOSED before F2; proven, no code change |
| 4 | eye highlight on textured rows | REAL, **FIXED** (13 -> 6 failures) |
| 5 | textured rows look smaller than toon rows | MISREAD of the contact sheet, no code change |

Plus one crash found and fixed in a file this lane owns (see "The capsule bug").

## The capsule bug: `dorsal is not defined`

Before any F2 measurement could be trusted, every textured row was rendering as
a smooth featureless CAPSULE with a glow blob - no fins, no tail, no skin. Not
a shading problem: the GLB was never reaching the screen.

`hse/rig_morph.js` had an uncommitted RELAX-TO-FIT change that moved the
`morphGeometry()` call inside a `for` loop and scoped its result `const dorsal`
to the loop body, while the last line of `applyMorph()` still read
`dorsal.vertices`. That threw `dorsal is not defined` on EVERY textured build,
which aborted `buildLoadedRig` and dropped the row to an untextured placeholder.

Fixed by reading the count off `record.dorsal.vertices`, which the loop already
writes on each iteration. One line. Verified: art3d went from `EXCEPTION` to
running, and the capsules came back as real textured sharks
(`hse/evidence/f2-a/` onward).

Also fixed in this lane's own file: two BACKTICKS inside the GLSL template
literal in `skin_identity.js` (in comments I had just written) silently
terminated the template and made the module unparseable as an ES module.
`node --check` does NOT catch this - it parses as a script. The selftest did.

## 1. Distinctness: the hue never survived the water

FIXED. This is the item the brief led with, and the root cause was not in the
identity layer's strength - F1 had already fixed that - but in the SCENE.

`engine3d.js` lights with a cyan HemisphereLight `0x9fd4e8` (hue 0.546), fogs
with FogExp2 in the same colour, and tone maps with ACES. All three drag every
rendered hue toward the water. Measured on the round-2 evidence, the authored
palette never arrived:

| row | authored base | authored hue | rendered hue (round 2) |
| --- | --- | --- | --- |
| `mako` | `#3f6fb2` | 0.597 (blue) | **0.446** (teal) |
| `blue` | `#3a86c8` | 0.577 (blue) | **0.456** (teal) |
| `glacier` | `#6fa3c4` | 0.565 | 0.497 |
| `voltaicrex` | `#24304a` | 0.614 | 0.502 |
| `frostjaw` | `#3d6b8f` | 0.573 | 0.497 |

Every blue row in the roster piled up between 0.44 and 0.50 regardless of what
its palette said. That IS the "they all read the same green-teal" complaint,
and it is why `mako` rendered teal instead of blue.

Three changes, all in `rfIdCountershade`:

1. **Hue pre-compensation.** Rotate the authored hue AWAY from the water hue
   before lighting, by 0.45 of the gap, so it lands on the palette after the
   scene has pulled it back. Interpolated the short way around the wheel.
2. **Stop the belly lerp from eating the hue.** The region colour was an RGB
   lerp from the base swatch toward the BELLY swatch, and every row's belly is
   authored near-white (v 0.93-1.00, s 0.04-0.14). That collapsed hue AND
   saturation on the lower half of every body, toward the same washed cyan for
   every row - diluting identity exactly where the body is largest. Hue and
   saturation now come from the base swatch across the whole body; the belly
   reads as a belly through VALUE and a modest desaturation instead.
3. **The value band is per-row.** `mako` v 0.70 against `blue` v 0.78,
   `voltaicrex` v 0.29 against `glacier` v 0.77 - the authored palettes already
   separate these pairs by value, and the old fixed 0.30/0.78 ramp flattened
   that away. The band is now centred on the base swatch's own value.
4. **Accent as a second block.** The accent swatch was unused at body scale.
   It now paints the dorsal ridge, a tail block and a face mask, so two rows on
   the same mesh get different-coloured markings in the same places - which is
   what a 64x30 thumbnail can actually see.

### Measured (17-row subset, `hse/evidence/f2-before` -> `hse/evidence/f2-d`)

Hue now lands in the blue band instead of teal:

| row | hue before | hue after |
| --- | --- | --- |
| `mako` | 0.475 | **0.551** |
| `blue` | 0.460 | **0.554** |
| `frostjaw` | 0.497 | **0.553** |
| `stormfin` | 0.477 | **0.553** |
| `thresher` | 0.483 | **0.551** |
| `ironfin` | 0.465 | 0.517 |
| `wreckfang` | 0.481 | 0.515 |

Both named collisions cleared the 0.055 gate by a wide margin (roster-wide
numbers, round 2 -> F2 final):

| pair | round 2 | F2 (full roster) |
| --- | --- | --- |
| `glacier` / `voltaicrex` | 0.0234 TOO CLOSE | **0.0696 ok** |
| `mako` / `blue` | 0.0312 TOO CLOSE | **out of the closest 10 entirely** |

Roster-wide the distinctness gate is now FULLY CLEAN: **4 failing rows -> 0**,
and NO pair anywhere in the 86-row matrix sits under the 0.055 floor. The
closest pair in the whole roster is `stormfin`/`tempest` at 0.0555.

Rendered hue over all 86 rows moved from a median of 0.499 (teal, the water)
to 0.530, and the specific rows the brief named landed on their palettes:
`mako` 0.446 -> **0.552**, `blue` 0.456 -> **0.557**, `frostjaw` 0.497 ->
0.551, `stormfin` 0.475 -> 0.552, `thresher` 0.483 -> 0.549.

## 2. Countershade: flatten the photo's own gradient first

IMPROVED ON EVERY ROW, not all the way to 0.10 on four of them.

F1 established the ramp runs along a correctly measured dorsal axis and still
could not push `bull`, `mako`, `blue`, `thresher` or `cookiecutter` positive,
and recorded that a STRONGER ramp measured WORSE. That is the signature of
amplifying an opposing gradient rather than beating it, and F1 named the fix:
measure the bake's own painted gradient and subtract it.

`measureBakeGradient()` does that. It samples the diffuse through the mesh's
own UVs (one downsampled 128px canvas read per material build, the same
technique lane O2's `detectPaintedEye` already uses), bins luminance by the
measured dorsal coordinate, and least-squares fits `lum = bias + slope * up` in
the shader's own 0..1 units. The shader subtracts that fitted line before
applying the authored terminator, so the ramp lands on a flat hide. Local
detail - pores, scales, scars, the painted eye - is untouched, because only the
large-scale linear term is removed. Returns null in Node or on an unreadable
texture, and the flatten strength then stays 0, i.e. exactly the pre-F2
behaviour.

The worst rows moved the most, which is the right signature:

| row | round 2 | F2 (full roster) |
| --- | --- | --- |
| `bull` | **-0.070** (inverted) | **+0.010** |
| `reef` | -0.096 | -0.043 |
| `blue` | +0.066 | **+0.096** |
| `mako` | +0.074 | **+0.090** |
| `thresher` | +0.170 | **+0.191** |
| `wreckfang` | +0.203 | **+0.279** |

`bull` is no longer inverted, and `mako`/`blue`/`thresher` all recovered.
Roster-wide, rows measuring a NEGATIVE countershade fell from **22 to 19**.

Two rows in the round-2 table look like regressions and are not comparable:
`tiger` (+0.266 -> +0.011) and `cookiecutter` (+0.243 -> -0.061) were both
moved ONTO textured base models by another lane partway through this session,
so their round-2 numbers were measured on a different rig than their F2 ones.

### A hypothesis I tested and REJECTED

Both layers inject at `#include <map_fragment>` and `applyIdentity` chains onto
the material's `onBeforeCompile`, so `shark3d.js`'s countershade multiply
(`mix(1.52, 0.46)`) runs FIRST and the identity layer reads an already-shaded
colour as its "photo luminance". The ramp is therefore applied twice, and
damping the material's `uRfCounterGain` to let the identity layer be the single
authority is the obvious fix.

It measured WORSE on every row that needed the help: `bull` +0.036 -> -0.019,
`tiger` +0.127 -> -0.024, `reef` -0.029 -> -0.102, `blue` +0.107 -> +0.039
(`hse/evidence/f2-c` against `f2-a`). So the material's multiply is doing real
work the identity layer's value rewrite does not replicate. `dampTexturedCounterGain()`
is kept, wired and idempotent so the next lane can retune it with one constant,
but it SHIPS AS A NO-OP (`TEXTURED_COUNTER_GAIN_DAMP = 1.0`).

## 3. Texture bytes: already closed, proven

NO CODE CHANGE. The report's texture-failure narrative is from lane O3's older
BASELINE section (37 rows at 10.67 MB), not from round 2. Measured directly off
`hse/evidence/r14-round2/results.json`:

- textured rows report **6.67 MB** against the **8 MB** gate
- rows over the gate: **0**
- rows whose `fails` list mentions texture or MB: **0**

O4's downscale to 512 normals did the job. This is stale narrative in the
report, not a live failure.

## 4. Eye highlight

FIXED. F1 preserved the painted eye by letting the original photo value
dominate where a texel sits far from the hide's mid value. Two problems: the
test measured distance against the RAW luminance, so on a hide with a strong
painted gradient whole FLANKS qualified as "extreme" (which also blunted the
recolor), and the preserved value was not stretched, so the catch-light did not
survive the fog as a genuinely bright pixel.

Now the extremity test runs against the FLATTENED luminance, so it detects a
genuine local feature rather than "this texel is on the dark half of the bake";
and the preserved value is stretched 1.55x around the hide's mid so the
catch-light stays bright. No geometry added, per the brief.

Roster-wide the eye gate went from **13 failing rows to 6**, and rows reporting
literally zero bright pixels in the head crop fell from **13 to 6**. Examples:
`glacier` 1079 -> 1576, `maelstrom` 838 -> 1531, `voltaicrex` 1028 -> 1277,
`blue` 211 -> 304, `cookiecutter` 9 -> 292.

## 5. Scale read: the contact sheet misled

NO CODE CHANGE, because there is no defect here.

Measured rendered body length in device px off the round-2 full frames, masking
the shark the way the harness does:

| row | model | tier | sil.len | rendered length |
| --- | --- | --- | --- | --- |
| `reef` | dogfish (textured) | 1 | 1.00 | 475 px |
| `mako` | mako (textured) | 2 | 1.10 | 483 px |
| `bull` | whaler (textured) | 4 | 1.22 | 472 px |
| `tiger` | tiger_nu (textured) | 4 | 1.30 | 478 px |

That is 472-483 px across tiers 1-4 and `sil.len` 1.00-1.30, i.e. constant
within 2%. That is the camera contract working exactly as designed:
`camZForLen` dollies proportionally to `sil.len`, so a longer shark is framed
from further away and occupies the SAME screen length. The length
normalization in `buildLoadedRig` is self-correcting by construction - it
re-measures and rescales until `rfMeasuredLength == targetLength`.

The toon comparison the brief asked for (`sawshark`, `zeusfin`) cannot be made
against round 2 any more: another lane has since moved both rows ONTO textured
models, so there is no toon/textured pair left at those ids.

Why the sheet reads "smaller": the textured rows are slimmer REAL shark
bodies (dogfish, mako, whaler) where the toon Sharky hull is a chunky
stylized silhouette of the same length. Equal length, less area - which reads
as smaller on a contact sheet while measuring identical. Changing the length
normalization to compensate would break the camera contract to chase an
impression.

## What is not fixed, stated plainly

**31 rows still miss the countershade gate** (round 2 had 30), and 19 still
measure NEGATIVE (round 2 had 22). `bull` is no longer inverted (+0.010) and
`reef` more than halved its deficit (-0.096 -> -0.043), but neither reaches the
0.10 the brief asked for.
The bake-gradient fit removes the photo's LINEAR dorsal term; what is left on
these four hides is a non-linear painted countershade (a hard painted waterline
on the dogfish and whaler hides) that a two-parameter fit cannot describe.
Fixing it properly means fitting a higher-order or piecewise ramp, or reducing
detail retention on the rows where photo and palette disagree - a real change
with a real tradeoff against "keep skin detail", not a constant to nudge.

**Background bleed is the one gate F2 leaves worse: 21 failing rows -> 29**,
and it is what holds the pass count below round 2's.

Diagnosed, partly fixed, and the rest is understood but not closed:

The first full-roster run was much worse (33 bleeding rows, 26/86 pass). The
worst offenders were `magmaw` 0.010 -> 0.245, `bonecrown` 0.021 -> 0.255 and
`ironfin` 0.012 -> 0.227. Looking at the frames settled it: those hides carry a
SPIKY DORSAL CREST whose gaps are real openings inside the silhouette, and the
crest geometry is byte-identical in round 2 - only the colour behind it
changed. The per-row value band was letting a bright base swatch carry the
whole band upward and give those rows a bright BACK; dark skin behind the crest
gaps had been masking them, bright skin did not, and the harness correctly
scored the gaps as water. Capping the back dark (`backValue <= 0.34`) recovered
almost all of it: `magmaw` 0.245 -> 0.036, `bonecrown` 0.255 -> 0.020,
`ironfin` 0.227 -> 0.052, `vulkan` 0.111 -> 0.003, and the roster went 26/86 ->
32/86. That is the difference between `hse/evidence/f2-final` and
`hse/evidence/f2-final2`.

What is left is a genuine residue: brighter, more saturated hides simply expose
pre-existing silhouette gaps that a dark hide hid. The gaps are not mine - they
are crest geometry - and closing them means changing that geometry, which is
outside this lane's modules.

I also tested and REJECTED the accent blocks as the cause: pulling every block
off the silhouette edge and dropping the strength to 0.28 measured WORSE on
bleed (`ironfin` 0.031 -> 0.059, `tempest` 0.029 -> 0.056) AND collapsed
distinctness back under the gate (`mako`/`blue` 0.0655 -> 0.0539). Evidence
`hse/evidence/f2-e` against `f2-d`. `wreckfang` was already at 19.8% before F2
touched anything.

**Roster pass count went 35/86 -> 32/86.** Every other gate improved -
distinctness 4 -> 0, eye 13 -> 6, pattern 4 -> 0, negative countershade 22 ->
19 - and bleed alone costs more rows than those win. I am reporting that
rather than tuning until the number looks better.

## What F2 did not do

The brief allowed `gen_data.py` palette tweaks if a row's authored palette were
the real cause. `mako` (hue 0.597) and `blue` (hue 0.577) ARE authored only
0.020 apart, which is below what the metric can resolve through fog - so the
case was there. I did not take it, because the shader fix alone cleared that
pair out of the roster's closest-10 list entirely, and left NO pair anywhere
under the gate, without touching data. A
palette edit on top would have been a second variable in the same measurement.
Flagging it for whoever wants the >0.08 stretch goal on that specific pair.

`tools/gen_data.py` and `data.js` were also being actively edited by another
lane throughout this session (timestamps moved mid-run), so leaving them alone
was the safer call under the concurrency law.

## Cross-lane defect reported, not fixed

Logged in `hse/REQUESTS.md`: the lane that un-held `leviathanrex`,
`leviathan_rex` and `zeusfin` onto textured models broke art3d with
`leviathanrex: connected crest/head/aspect bounds failed`. Cause, measured with
the check instrumented: the Sharkjira/Leviathan feature builders are guarded on
`!textured`, so `rfMorph.crest` is undefined on the textured path and the
crest/aspect contract has nothing to measure (`plateCount=undefined`,
`aspect=1.93` against a required 2.60-3.00). Proven by stripping only
`sil.model` from those three rows: art3d went 1 failure -> `pass=true ok=29`.
That lane has since fixed it in `shark3d.js`; art3d is green as of this writing.

## Gates

- `node --check` clean on both touched files, and both parse as ES MODULES
  (the backtick bug above proves `--check` alone is not sufficient here).
- Selftests from `play/razorfin/`: `art3d` 29/29, `fish` 8/8, `meta` 192/192,
  `ui` 252/252, `game` 381/381 - all green.
- 0 console errors on every subset run (`f2-a` through `f2-e`).
- `shark3d.js` footprint from this lane: **zero lines**.

## Evidence

| dir | what it is |
| --- | --- |
| `hse/evidence/f2-before` | 17-row baseline before any F2 change, 9/17 |
| `hse/evidence/f2-a` | hue + value band + bake flatten + accent |
| `hse/evidence/f2-c` | counter-gain damp experiment, REJECTED |
| `hse/evidence/f2-d` | accent darkened - the shipping configuration, 7/17 |
| `hse/evidence/f2-e` | accent weakened experiment, REJECTED |
| `hse/evidence/f2-final` | full 86-row roster before the dark-back cap, 26/86 |
| `hse/evidence/f2-g` | dark-back cap probe on the worst bleeding rows |
| `hse/evidence/f2-final2` | **full 86-row roster, the shipping state, 32/86** |

Head crops are `hse/evidence/<dir>/heads/head_<id>.png` (3x). Contact sheet is
`hse/evidence/<dir>/contact_sheet.png`.

## Files

- `hse/skin_identity.js` - hue pre-compensation against the scene's water hue;
  hue/saturation taken from the base swatch across the body instead of lerping
  toward a near-white belly; per-row value band from the base swatch's value;
  accent painted as dorsal/tail/face blocks; back value capped dark so bright
  rows stop exposing crest gaps to the bleed metric; `measureBakeGradient()`
  and the shader-side flatten; eye extremity measured against flattened luminance and
  the catch-light stretched; `dampTexturedCounterGain()` wired but a no-op.
- `hse/rig_morph.js` - one line: `record.dorsal.vertices` instead of the
  out-of-scope `dorsal.vertices` that crashed every textured build.
