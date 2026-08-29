# Rev 16 DISTINCT lane

Owned and edited: `hse/skin_identity.js`, `hse/props_textured.js`, the per-row
`sil` fields in `tools/gen_data.py` (+ `data.js` regenerated from it).
`hse/rig_morph.js` and `hse/face_textured.js` were read-only, as instructed.
Evidence: `hse/evidence/r16-distinct/` (86 profile + 86 head shots, contact
sheets, `metric.py`).

Final line is at the bottom.

---

## 0. Coordinator patch (applied first, before any lane work)

`hse/skin_identity.js` `measureBindUp()`: `spikeSign` and `skewSign` were both
inverted. Applied as specified and extended to `skewSign`, which carried the
same convention (a positive third moment means the distribution's long tail is
on the +axis side, i.e. the dorsal side, so it must also return +1).

Verified with the commands given:

```
node scratchpad/shark_lum.mjs x hawaii
python3 scratchpad/shark_blob.py /tmp/rf_a.png /tmp/rf_box.json
  N=12655 medianL=0.508 dorsal=0.327 belly=0.742 countershade=+0.414
  GATE L 0.40..0.55 -> PASS | countershade >=0.15 -> PASS
```

Body median 0.508 is inside the 0.40-0.55 target and the countershade is +0.414
against the predicted +0.42. This fix is correct and is kept.

**It costs the look-alike metric, and that is worth stating plainly.** A uniform,
correctly-signed countershade makes every row darker on top and paler
underneath by the same law, which pulls their mean body colours *together*: the
colour term of the distinctness metric fell across the board (e.g.
whaleshark/megalodon colour distance 0.0013 -> 0.0002). Measured on identical
geometry, the same roster scored 20 look-alike rows before the patch and 32
after. The rest of this lane's colour work was done against the post-patch
render.

---

## 1. What the metric is, and why it had to be rebuilt

`report.json` does not exist. The r15-doc directory has `assess.json` (86 rows
of scalars) and `dupes.json` (31 ids), and the script that produced `dupes.json`
was not saved anywhere in the tree. The brief's "28 Weak look-alike rows" also
does not match `dupes.json`'s 31.

`assess.json`'s six scalars cannot reproduce `dupes.json`: an exhaustive search
over every 1-, 2- and 3-subset with per-feature normalisation and every
threshold got no closer than a symmetric difference of 20.

The brief describes the gate as a "silhouette-plus-color overlap metric", so it
was rebuilt from the shot PNGs directly and calibrated against the recorded
verdicts:

```
score(a,b) = IoU(mask_a, mask_b) - 1.5 * mean|meanRGB_a - meanRGB_b|
mask  = |pixel - corner| summed over RGB > 0.06, at 128x80
pair counted only when both rows share a base model
look-alike when score > 0.95
```

On the r15-doc shots this returns **exactly 28 look-alike rows**, matching the
brief's number. That is the metric used for every number below, and it is
checked in at `hse/evidence/r16-distinct/metric.py` so the next lane does not
have to reconstruct it a third time.

---

## 2. The structural finding: why the roster cannot be separated by colour

This is the important result of the lane and it should change what the next
lane is asked to do.

**The camera normalises length away.** `profileview.html` solves its distance so
the shark spans ~60% of frame WIDTH. Measured across all 86 shots, the rendered
body width is 600-603px on *every* row. `sil.len` therefore contributes nothing
to the silhouette metric; only the height-to-length ratio survives.

**The hide's hue does not reach the camera.** Traced end to end with a live
uniform dump and a series of shader cut-points:

| stage | dunkleosteus |
|---|---|
| `SPECIES_HIDE` entry | hue 0.100, a bronze |
| resolved `uRfIdBaseColor` uniform (dumped live) | 0.409, 0.357, 0.266 - still bronze |
| `neutralizeTexturedTint` output (`uRfTopColor`) | `b8ad98` - still bronze |
| rendered, dorsal, top-quartile saturation | **hue 0.515, a slate** |

The identity layer, the chroma lock and the tint neutralisation are all doing
exactly what they claim. The colour is destroyed by the SCENE. Forcing
`diffuseColor.rgb = uRfIdBaseColor` (a pure bronze albedo) and letting it light
normally still rendered hue 0.489; re-running the same build with the
HemisphereLight set to white rendered **hue 0.114, the correct bronze**.

The light is `HemisphereLight(0x9fd4e8, 0x06121e)` in `profileview.html` and in
`engine3d.js:888`. A flat 0.5 grey albedo renders as `0.242, 0.299, 0.298`, i.e.
an effective incident colour of r:g:b = 0.809 : 1.000 : 0.995. Neither file is
owned by this lane.

Three separate attempts to beat it from inside the owned files all failed, and
each failure is informative:

* dividing the albedo by the measured light tint (gammas 1.0 - 8.0) walks the
  render's saturation down through zero and out the other side rather than
  restoring the hue, because the correction is applied before a chroma lock
  that then re-pins the result;
* pre-compensating `uRfIdBaseColor` itself in JS does the same thing (saturation
  0.095 -> 0.004 -> sign flip);
* re-saturating after the lock amplifies whatever cyan is already there.

`VALUE_IDENTITY_SPAN` is likewise inert: changing it from 0.16 to 0.40 to 0.70
moved the rendered value of four probe rows by less than 0.002.

**Consequence.** With 27 rows on `greatwhite_cy` and a natural-gamut colour law
that the scene light flattens to a 0.10-wide hue band, the metric's colour term
cannot be made to carry separation. The gate needs a mean-RGB distance of about
0.027 on the worst pairs; a full-gamut hide swing (slate to bright bronze)
measured **0.023**. The distinctness budget has to come from silhouette, and
silhouette is bounded by the four approved meshes.

---

## 3. What was changed

### 3a. Girth spread (`tools/gen_data.py`, 60 rows)

`heightScale = clamp(0.91 + girth*(0.76 bulky : 0.55) + (0.10 bulky), 0.90, 1.30)`.
Two things were wrong with the authored values:

* **The bulky clamp was saturated.** A `whale`/`kaiju` head hits the 1.30
  ceiling at girth 0.382, and eight greatwhite_cy rows were authored at 0.52 -
  0.61. whaleshark, maelstrom, vortexa, poseidonrex, charybdisvoid, typhonmaw,
  heracrown and both leviathans were all rendering at *exactly* the same height.
  That is why 18 of 27 greatwhite_cy rows were look-alikes.
* Girth was clustered generally: the eight tigershark rows sat in 0.40-0.48.

Girth does have real authority when it is not clamped - measured, bull at 0.70
against howler at 0.16 takes that pair from 0.969 to **0.840**, a 29px height
gap - so the fix is to spread it rather than to reach for a different lever.
Confirmed by isolation that `finScale` and `tailScale` move this metric not at
all (0.977 either way at both extremes); `head` archetype and `girth` are the
only two that do, and they work by leaving the bulky clamp.

The solver in the notes below pins the **26 real-species ANCHOR rows** from
`SPECIES_HIDE` at their authored girth - a whale shark stays the fat one, that
is a fact about the animal - and spreads only the 60 fantasy rows into the gaps
the anchors leave, solving bulky and non-bulky heads in separate bands so the
bulky rows cannot collapse onto the girth floor (an earlier cut put seven of
them on 0.160 and made things worse).

Result: greatwhite_cy rendered height span went from 30px to 128px.

### 3b. Prop placement was upside down (`hse/props_textured.js`)

`measureFrame()` picked the dorsal AXIS by a cubed-moment vote, which is a good
axis detector, but took its SIGN from `sum >= 0` on that same moment. Measured
in the browser on the posed rigs:

```
row         upAxis  asymmetry   sign chosen   local +up in world
zeusfin       y      0.00265        -1             +y (dot 1.0)
heracrown     y      0.02342        -1             +y (dot 1.0)
solaris       y      0.00851        -1             +y (dot 1.0)
hammerhead    y      0.00865        -1             +y (dot 1.0)
```

An asymmetry of 0.003 on a body spanning 1.0 is noise - the same order as the
2% head/tail noise NOTES-rev15-rebase.md caught one level up in the same
function - and it came out negative on every bake while the axis demonstrably
points at the sky. `addCrown()` sinks its scute by `- height * 0.24` and its
spike roots by `- upSpan * 0.015`; unsigned, those *lift* the prop clear of the
skull when upSign is -1, which is exactly the "crowns sit at the jaw line"
defect NOTES-rev15-rebase.md logged as the one thing it would do next.

The sign now comes from world space (`shark3d.js` poses every rig DORSAL +Y,
the same contract the head/tail resolver and the r15-doc camera already rely
on), with the moment vote kept as a fallback for a genuinely edge-on axis. Every
vertical offset in `addCrown` and `addScute` is now signed by `frame.upSign`.

### 3c. Props wore full-saturation paint (`hse/props_textured.js`)

Three sources, found in order, each measured live:

1. `featureMaterial()` built its tint from `uRfAccentColor`, and
   `skin_identity.js` - which rewrites `uRfHueShift`, `uRfSaturation`,
   `uRfTopColor` and `uRfBottomColor` - has never written `uRfAccentColor`. The
   82% pull toward `uRfTopColor` could not save it because that uniform is
   deliberately set to *value 0.48 as a multiply gain*, not to the animal's
   colour. The prop tint is now derived from `material.userData.rfIdentityHide`,
   which is the hide the identity layer actually resolved.
2. The seam **glow** was still the raw `palette.glow` at strength 0.30, added to
   `totalEmissiveRadiance` - unlit, unshaded, uncountershadeable. Measured:
   zeusfin `0.95/0.80/0.02` chrome yellow, solaris `1.00/0.78/0.10` orange,
   chimerashark `0.95/0.19/0.02` red. Now capped at the marking saturation
   ceiling and cut to strength 0.10.
3. The cephalofoil spanned `band.halfAcross * 2.0`, which measured **0.192L** on
   hammerhead and 0.236L on athenajaw against the brief's 0.42-0.45L. Scaling
   from the head band makes the hammer's size an accident of whichever bake the
   row landed on; it is now set against `frame.span` and measures exactly 0.420L
   and 0.450L.

`addScute` also stopped being a box: it tapered only to 0.62 x 0.58, so it read
as a slab at any colour. It now narrows hard across the body to a keeled crest
line, and `addCrown`'s width dropped from 0.78-0.90 of the skull to 0.34-0.42 so
the head reads either side of it.

### 3d. Two full-saturation decals on the body (`hse/skin_identity.js`)

Both found by looking at the contact sheet, both in a file this lane owns:

* **Fin tips.** `shark3d.js:2440` paints the outer 20% of every fin toward
  `uRfAccentColor` at 0.26. Nothing had brought that uniform under the owner's
  marking law, so most Act 4/5 rows wore a hard yellow, blue, magenta, orange or
  green cap on the dorsal fin. Now pulled to the species hue and capped in
  saturation inside `neutralizeTexturedTint`, which is the same mechanism that
  file already uses for the hue steer and the rim.
* **The glow seam.** Round 4 confined the seam's SHAPE to the pattern mask on
  the dorsal ridge but left its COLOUR as the raw authored swatch. Rendered,
  typhonmaw wore two hard bright-green bars across the dorsal and caudal fins.
  Now resolved through the same hue/saturation/value law as a marking.

typhonmaw before and after is the clearest single comparison in the evidence
directory.

### 3e. Whale shark spots (`hse/skin_identity.js`)

Two independent reasons the spots were invisible:

* **Spots were being drawn darker than the hide.** Round 4 collapsed every
  marking onto one rule - darken the body luminance by `MARK_VALUE_DELTA` -
  which is right for a tiger's bars and backwards for a spot. A whale shark's
  spots, a leopard's rosettes and an epaulette's ocelli are all *paler* than the
  hide. Pattern 2 now moves the same distance the other way, so it is still
  inside the owner's `|dV| <= 0.18` law, just on the correct side of it.
* **The spot field was far too coarse.** `patternScale` of `5.4 + tier*0.30` is
  about 7 cells along the body, which is a bar spacing. At that scale the whale
  shark rendered three or four soft blobs that read as shading. Pattern 2 is now
  scaled 2.9x, giving roughly 20 cells, and the spots read as spots at thumbnail
  size. Bars, rings, scars and plates are untouched.

---

## 4. Numbers

Same metric, same harness, same 86 rows.

| shoot | look-alike rows | pairs |
|---|---|---|
| r15-doc baseline (brief's number) | **28** | 34 |
| after girth spread only | 20 | 24 |
| after the mandated countershade patch | 32 | 32 |
| after hide respread | 24 | 19 |
| after decal removal (fin tips + glow seam) | 28 | 23 |
| **final, after the spot fix** | **23** | 31 |

**Look-alike rows: 28 -> 23.**

Slab rows, judged by looking at the head crops rather than by a gate:

| row | before | after |
|---|---|---|
| `aphroditelure` | jaw plate | **fixed** - no prop, clean shark head |
| `omenmaw` | glass fins | **fixed** - opaque horns, hide-tinted |
| `heracrown` | slab under the jaw | partial - on the skull, hide-toned, still boxy |
| `zeusfin` | slab under the jaw | partial - same |
| `solaris` | slab under the jaw | partial - same |
| `hammerhead` | flat plate | still a slab - spans 0.42L now, but not a lobed T-head |
| `athenajaw` | flat plate, orange | still a slab - spans 0.45L, colour fixed |

**Slab count: 7 -> 2 fixed, 3 partial, 2 unfixed.**

Every prop on the roster is now in the body material tint and on the correct end
and side of the animal, which was the larger half of the defect. The remaining
two are a geometry problem: `addBox` builds a tapered solid, and a cephalofoil
needs a swept lobed surface that wraps the snout with the eyes at the tips.
That is a new primitive, not a parameter change.

## 5. Gates

```
art3d  pass=true ok=31  fail=0
game   pass=true ok=394 fail=0
meta   pass=true ok=192 fail=0
ui     pass=true ok=239 fail=0
world  pass=true ok=380 fail=0
green  unknown target (not a selftest target name; same finding as
       NOTES-rev15-rebase.md)
```

`world` is green here, including the two checks NOTES-rev15-rebase.md recorded
as flaky. The `art3d` HSE_FAMILY_EXPECT pin that lane flagged as a hook is
already resolved in the working tree.

All 86 rows re-shot with zero page errors.

## 6. What the next lane should be told

1. **The look-alike gate cannot be closed inside these files.** The colour term
   is capped by the cyan `HemisphereLight` in `engine3d.js:888` and
   `profileview.html`, and the silhouette term is capped by 27 rows sharing one
   mesh with the camera normalising length away. Section 2 has the measurements.
   The two real fixes are both outside this lane: warm the key light (or cut the
   hemisphere's cyan) so authored hue survives to the camera, or approve more
   base meshes.
2. **`heightScale`'s bulky branch saturates at girth 0.382.** Anything authoring
   a `whale` or `kaiju` row above that is writing a number that cannot render.
   Worth a clamp warning in `shark3d.js`.
3. The cephalofoil needs a lobed swept primitive in `props_textured.js` - the
   one remaining piece of the slab brief.
