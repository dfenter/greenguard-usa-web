# Lane F1 status: fix round on the measured HSE defects

Owns `hse/skin_identity.js`, `hse/rig_morph.js`, and exactly two exact-string
edits in `shark3d.js` (one import line, one call-site hook in `buildLoadedRig`).
Did not touch the `preload()` / model-cache region (lane O4), `gen_data.py`,
`data.js`, or any other lane's module. No commit.

## Headline

The four reported defects were three real bugs and one misdiagnosis. All three
real bugs traced to the SAME root cause class: **an axis assumed instead of
measured**, in three different places.

| # | defect | verdict | root cause |
| --- | --- | --- | --- |
| 1 | every textured row renders the same dark green | REAL, fixed | identity layer pulled only 24% toward the palette; countershade ran along a stale axis |
| 2 | morphed rows deform; length gate holds 37 rows | REAL, fixed | `measureMorph` measured length along world X against a skin-inflated box |
| 3 | floating dark tooth specks near head/tail | MISDIAGNOSIS, no code change | they are scene prey NPCs, not artifacts on the shark |
| 4 | eye highlight gate | REAL, fixed | the recolor flattened the painted eye's luminance |

## Defect 1: the hue never reached the flank

`rfIdCountershade` multiplied the photo diffuse by

    mix(vec3(0.82), region * 1.55, 0.24)

which is a 24% pull toward the palette against a 76% pull toward neutral grey.
On a baked hide that already carries its own brown/green cast that is not a
recolor at all, which is why mako (authored base `#3d6fb5`, a blue) rendered
green, and why every TEXTURED row landed on the same dark desaturated green
while the toon rows -- which never go through this path -- kept their hues.

Fixed by splitting the channels explicitly, which is also what the brief asks
for ("luminance from the photo, hue/sat from the palette"):

- LUMINANCE (and therefore every pore, scale and shadow in the bake) is taken
  from the diffuse texel.
- HUE and SATURATION are taken outright from the resolved palette region, with
  a 0.42 saturation floor so the row survives the cyan fog wash.
- The photo's local detail is folded back in as a signed term around the
  region's target value, so the skin still reads as skin rather than a swatch.

### The countershade was measuring a meaningless direction

`prepareTemplate` measures `bindUp` by correlating each bind axis against world
up -- but it does that on the SOURCE mesh, BEFORE `buildLoadedRig` binds the
skeleton and applies the rig rotation. For roughly half the bakes the answer
changes across that step. Measured against the POSED rig:

| rig | prepareTemplate says | actually is | corr of the stale axis with world up |
| --- | --- | --- | --- |
| reef (dogfish) | `-1,0,0` | `-X` (corr -1.000) | 1.000 correct |
| tiger (tiger_nu) | `-1,0,0` | `-X` (corr -0.997) | 0.997 correct |
| hammerhead (smoothhammer) | `0,1,0` | `+Z` (corr 0.997) | **-0.006** |
| greatwhite (greatwhite_cy) | `0,1,0` | `+Z` (corr 0.997) | **0.213** |
| hadesmaw (whitepointer) | `0,1,0` | `+Z` (corr 0.999) | **-0.245** |
| snapjaw (tigershark) | `0,1,0` | `+Z` (corr 0.997) | - |
| magmaw (bullhead) | `0,1,0` | `+Z` (corr 0.993) | - |

This is exactly the split NOTES-rev14 and STATUS-O2 record (reef/greatwhite
skinned X, hammerhead skinned Z). Dotting bind position against `(0,1,0)` on a
rig that is really skinned `+Z` correlates ~0.0 with world up, so the ramp
modulated along a direction with no relation to back-or-belly -- which is why
20 rows measured their BACK brighter than their belly.

`skin_identity.js` now measures the axis itself off the bound rig
(`measureBindUp`), and `retargetIdentityAxes(body)` -- the single hook
`buildLoadedRig` calls after `applyMorph` -- writes the measured axis into the
already-installed uniform objects for BOTH the identity layer and the textured
material. Updating the uniforms in place means no shader recompile and no
material rebuild. All 40 textured rows now correlate 0.997-1.000 with world up.

Both layers are pointed at the same axis deliberately: they each dot bind
position against an up vector, and when they disagreed the material darkened
one side while the identity layer brightened it, cancelling into the flat,
wrong-signed gradient the harness measured.

The body (nose-to-tail) axis fallback was wrong for the same reason.
`defaultBodyAxis` returned bind X whenever bind-up was Y, but every GLB out of
`tools/shark_bake.py` is authored long-on-bind-Z (dogfish 0.198x0.228x0.991,
smoothhammer 0.263x0.245x0.995, greatwhite_cy 0.443x0.338x0.993, tiger_nu
0.317x0.521x1.000, whitepointer 0.428x0.399x1.000), so the identity pattern and
the eye band ran ACROSS the body instead of along it on every such rig.

## Defect 2: the length gate was reading the wrong axis

`measureMorph` hardcoded world X as body length and world Y as height. That is
true of the low-poly Sharky rig and false of the bakes -- but NOT in the way the
bounding box suggests, which is the trap that made this subtle:

- The REST-POSE BOUNDING BOX is inflated through the bone matrices (O1 recorded
  the same trap for the bakeview framing). Measured that way, smoothhammer,
  greatwhite_cy and whitepointer all report their longest extent on world Y.
- The RIG disagrees. Head -> Tail3 measures a clean world X on every bake
  (reef -1,0,0; hammerhead -1,-0.05,0; tiger -1,0,-0.01; magmaw -1,-0.03,0;
  greatwhite -1,-0.06,0; hadesmaw -1,-0.01,0).

So the original world-X assumption was right about the axis and wrong about how
to defend it, and my first attempt -- deriving the axis from the box -- made it
worse. `bodyAxes()` now takes the long axis from the BONE CHAIN (Head -> Tail3),
the dorsal axis from the caller's measured bind-up, and falls back to the box
only when the rig cannot answer.

With the axis read correctly the gate stops firing spuriously: **all 40 textured
rows now build, 0 failures**, against 32 of 40 throwing `L2 morph length delta
N% exceeds +/-3%` before. Length deltas land at -0.30% to +2.15%, comfortably
inside the existing +/-3% tolerance, which was never the problem.

The 37 rows STATUS-O1 lists as HELD-L2 are held by this gate. It now measures
correctly, so lane O1 can un-comment those rows in `tools/gen_data.py` and
regenerate. I did not touch `gen_data.py` or `data.js` (lane O1 owns both).

### Silhouette bound

Added, as the brief asks, so a morph that breaks the outline fails before it
reaches a screenshot. Measured in the length x height plane the camera sees,
against the unmorphed rest pose:

- ASPECT within +/-20% -- this is the quantity that actually detects "this is
  no longer a shark". Roster spans 0.86-1.03.
- AREA within +/-30%, deliberately looser. The bulk/sculpt morph's whole job is
  girth, which legitimately grows the footprint without breaking the outline.
  Roster spans 0.99-1.16 headlessly, and greatwhite reaches 1.22 in-browser
  (the skinned box settles differently under the live clip than in the Node
  capture), so a 20% area bound rejects healthy rigs -- it threw greatwhite as
  a console error on my first verification pass.

## Defect 3: the specks are prey, not artifacts

No code change, because there is no bug here to fix.

Proof that nothing mounts geometry on a textured rig: a headless build of every
row reports **exactly one mesh** for each textured row (`reef` -> `[dogfish]`,
`hammerhead` -> `[smoothhammer]`, ...), against three or four for the toon rows
(`Shark`, `RF Rev 13 face <id>`, `Shark.001`). The face batch is already gated
off (`RF_O2_TEXTURED_FACE` is `false`, and lane O2 documents why), `makeProp`
is skipped for textured, `mountGrin` no-ops without a prop, and
`mountTexturedFeatures` returns null for every id except the nine it is scoped
to -- which does not include reef, hammerhead, tiger or greatwhite.

Enlarging the crop settles it visually: the "specks" resolve into complete tiny
toon FISH -- white teeth, black eyes, yellow fins -- swimming beside the player,
with their own bodies visible. They appear at similar rates on passing toon rows
(`bull`, `mako`, `megalodon`) as on failing textured ones, which is the
signature of scene population rather than a per-row artifact. The serrated edge
along the hammerhead's dorsal fin, also called out as specks, is baked into the
diffuse.

Evidence: `hse/evidence/f1-notes/` crops, and the enlargement discussed above.

## Defect 4: do not flatten the painted eye

The recolor in defect 1 rewrites value from a smooth dorsal ramp, which erases
exactly the local extremes O3's eye-highlight gate counts (bright pixels inside
the head crop). A shark whose eye has been averaged into the flank has no
highlight left to find, so this had to be handled in the same function rather
than separately.

`rfIdCountershade` now detects texels sitting far from the hide's mid value --
a painted eye is near-black with a specular catch-light, a lit flank is not --
and lets the ORIGINAL photo value dominate there, blending in over
`smoothstep(0.22, 0.42, abs(detail))`. Hue still comes from the palette, so row
identity is unaffected; only the luminance extremes survive. No geometry is
added, per the brief.

## Measured result: 5/10 -> 6/10, 0 console errors

Verified with the O3 harness on the ten rows the task names, at the shipping
844x390 CSS / DPR 2 landscape viewport.

- BEFORE: `hse/evidence/f1-before/` -- 5/10 pass, 0 console errors.
- AFTER:  `hse/evidence/f1-after/`  -- 6/10 pass, 0 console errors.
- Head crops side by side: `hse/evidence/f1-headcompare/<id>_before_after.png`
  (before on the left, after on the right).

| row | model | before hue/sat/val/cs | after hue/sat/val/cs | verdict |
| --- | --- | --- | --- | --- |
| `reef` | dogfish | 0.536 0.42 0.20 -0.128 | 0.490 0.47 0.30 **-0.013** | FAIL -> FAIL |
| `tiger` | tiger_nu | 0.789 0.46 0.20 +0.054 | 0.789 0.42 0.19 +0.004 | FAIL -> FAIL |
| `hammerhead` | smoothhammer | 0.353 0.56 0.22 +0.034 | 0.439 0.65 0.34 **+0.226** | FAIL -> **PASS** |
| `greatwhite` | greatwhite_cy | 0.473 0.48 0.32 +0.248 | 0.467 0.45 0.39 +0.206 | PASS -> PASS |
| `mako` | (toon) | 0.469 0.51 0.43 +0.427 | 0.470 0.49 0.46 +0.439 | PASS -> PASS |
| `bull` | (toon) | 0.495 0.46 0.50 +0.344 | 0.496 0.47 0.50 +0.342 | PASS -> PASS |
| `thresher` | (toon) | 0.503 0.54 0.42 +0.233 | 0.501 0.54 0.42 +0.289 | PASS -> PASS |
| `hadesmaw` | whitepointer | 0.178 0.48 0.48 -0.102 | 0.027 0.48 0.52 **-0.022** | FAIL -> FAIL |
| `megalodon` | (toon) | 0.890 0.40 0.51 +0.272 | 0.896 0.41 0.51 +0.283 | PASS -> PASS |
| `leviathan_rex` | (toon) | 0.497 0.35 0.47 +0.250 | 0.495 0.36 0.48 +0.186 | FAIL -> FAIL |

Toon rows are unchanged within noise, which is the control: they do not go
through the textured path, so any movement there would have meant collateral
damage. There is none.

Every textured row moved the right way on VALUE (reef 0.20 -> 0.30, hammerhead
0.22 -> 0.34, greatwhite 0.32 -> 0.39, hadesmaw 0.48 -> 0.52) and on
COUNTERSHADE (reef -0.128 -> -0.013, tiger +0.054 -> +0.004 is flat but the
sign story below explains it, hammerhead +0.034 -> +0.226, hadesmaw -0.102 ->
-0.022). Head crops confirm it by eye: hammerhead goes from a uniformly dark
body to a genuine dark-back / bright-belly shark.

### Honest accounting of what is NOT fixed

Three rows still fail, and I am reporting them rather than tuning until the
number moves:

1. **`reef` and `tiger` countershade is still not positive** (-0.013, +0.004).
   The axis is now demonstrably correct (corr 1.000 / 0.997 with world up), and
   the ramp moved both rows a long way in the right direction, but it has not
   crossed zero. The remaining term is the bake's OWN painted countershade,
   which on these two hides runs opposite to the row's authored one; the photo
   detail I deliberately preserve (to keep skin texture, per the brief) carries
   that inverted gradient with it. Resolving it properly means either measuring
   the bake's painted gradient and subtracting it, or reducing detail retention
   on the rows where the two disagree -- a real change with a real tradeoff
   against "keep skin texture detail", not a constant to nudge.

2. **I tried the obvious nudge and it made things worse, so I reverted it.**
   Widening the terminator to `smoothstep(0.42, 0.62)`, driving the value split
   to 0.20/0.92, and damping the material's own counter-gain measured WORSE in
   real GL: reef -0.013 -> -0.118, tiger +0.004 -> -0.051, greatwhite +0.206 ->
   +0.150, and the pass count stayed 6/10. That is the signature of a stronger
   ramp amplifying the bake's opposing gradient rather than overpowering it,
   and it is direct evidence for the diagnosis in (1). Evidence for that
   rejected pass was captured and then discarded; the shipped code is the
   configuration that measured best.

3. **`leviathan_rex` and `hadesmaw` background bleed** (3.15%, 3.39% against a
   2.00% gate). `leviathan_rex` is a TOON row and bled 5.73% in the O3 baseline
   before I touched anything, so it is not mine. Bleed is a silhouette/alpha
   property, outside the skin and morph modules this lane owns.

## Gates

- `node --check` clean on all three touched files.
- Selftests from `play/razorfin/`: `art3d` 29/29, `fish` 8/8, `meta` 192/192,
  `ui` 252/252, `game` 381/381 -- all green.
- `world` reports 378 ok / 1 fail:
  `FAIL formation: aspect ratio after 5.0s reads as a line/V, not a blob`.
  **Pre-existing and not mine.** Reproduced with my three files reverted to
  their backups and the two shark3d edits removed: it fails identically.
  `world3d.js` is untouched in `git status` by any lane. It is a prey-formation
  AI check, unrelated to skin, morph or rig axes. Also note it only fires when
  `world` runs AFTER the other targets in the same process (it passes 379/379
  standalone), so it is order-dependent shared state.
- shark3d.js footprint is exactly the two lines the task allows:
  one import, one `retargetIdentityAxes(body)` hook after `applyMorph`.

## Files

- `hse/skin_identity.js` -- channel-split recolor, eye-detail preservation,
  `measureBindUp` / `bindExtentAlong` / `retargetIdentityAxes`, corrected
  `defaultBodyAxis`.
- `hse/rig_morph.js` -- `bodyAxes()` from the bone chain, axis-correct
  `measureMorph`, aspect and area silhouette bounds.
- `shark3d.js` -- import line 11; hook after the `applyMorph` call in
  `buildLoadedRig`.
