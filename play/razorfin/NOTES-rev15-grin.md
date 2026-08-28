# Rev 15 lane GRIN — open jaw, teeth, cavity, eye

Owned: `hse/rig_morph.js`, `hse/face_textured.js`, `hse/evidence/r15-face/`,
this file. Nothing outside those was edited.

Selftests: `node --experimental-loader ./tools/three-hook.mjs tools/selftest.mjs`
(the bare `node tools/selftest.mjs` in the brief cannot resolve the bare
specifier `three`; the repo ships the resolve hook for exactly this).

## The verdict this lane was given, and what was actually wrong

> the eye is a white dot with no visible iris/socket, mouths are CLOSED, no
> teeth are visible, zero expression

All four are real, and all four had causes that the existing gates could not
see, because **every gate in this area asks "is the feature correctly placed"
and none of them asks "can you see it"**. Geometry that is perfectly seated
and invisible passes containment trivially. That is the theme of this pass.

### 1. The mouths were closed because the jaw rotation had the wrong sign

`shark3d.js` already computes a rest gape and applies it every frame:

    const jawGape = jawRestGape + animation.bite * (1 - jawRestGape);
    jawBone.quaternion.copy(baseJawQuaternion);
    jawBone.rotateX(-jawGape * JAW_MAX_ROTATION);      // shark3d.js:3092

with `JAW_REST_GAPE = 0.28` and `JAW_MAX_ROTATION = 0.72`, i.e. 11.5 degrees
of rest gape that never appeared in any render.

Measured (`scratchpad/probe_gape.mjs`: sweep the LowerJaw about each local
axis and re-skin the jaw vertex cloud), **local +X swings the jaw DOWN** on
every row — jaw box z decreases monotonically through the sweep, e.g. reef
0.00 -> z[-0.244,-0.152], 0.50 -> z[-0.369,-0.222]. Local Y and Z swing it
sideways (all the lateral delta, near-zero vertical), so X is unambiguously
the hinge and the sign is inverted: that line drives the jaw **shut** and
slightly through the palate.

`shark3d.js` is not this lane's file, and the wrong sign at 3117/3148 is
still there. See "Results" and "For the orchestrator" below for what this lane
could and could not do about that from the outside.

### 2. The teeth were invisible because their height could collapse to zero

    const height = Math.min(pitchHeight, widthHeight);       // r15
    widthHeight = min(upperSide, lowerSide) * 0.62 * taper;

On a narrow snout `widthHeight` collapses to nearly nothing, so rows whose
teeth passed every containment gate drew no visible teeth at all. Height is
now driven by the **brief's absolute bar** (0.035–0.05 of head length) with
the geometric terms as *caps* and a hard floor, so a tooth can never vanish.

### 3. The eye was a white dot because the catch-light had a head-span floor

    const highlightRadius = Math.max(eyeRadius * 0.36, headSpan * 0.015);

On every row whose eye was clamped small by a narrow flank the floor won, so
the catch-light was sized against the **head** while the eyeball was sized
against the **cheek**. The highlight is emissive 0.95 and drawn in front of
everything, so a catch-light wider than the iris paints the whole eye solid
white — precisely the defect in the evidence. Raising the eye size alone would
not have fixed it; the floor is deleted.

## What changed

### `hse/rig_morph.js` — rest-pose jaw gape

New `applyRestGape()` (measures, called from `applyMorph()` after the
relax-to-fit loop) plus `commitRestGape()` (applies, called from
`buildTexturedFace()`). The split is not decorative - see the regression note
under Results for why applying it in one step tears the teeth off the head.

- **22–30 degrees by row personality gape** (`face.gape` -0.60..+0.60 mapped
  onto the band), hinge-only: no scale, no translation, one bone.
- **The opening direction is measured, not assumed.** Two earlier cuts of this
  function got it wrong in ways worth recording, because both looked correct:
  - the caller's `up` is a **bind-space** axis while `captureRestWorld()`
    reports **world** points, and `mesh.matrixWorld` on these bakes is an
    axis-permuting rotation (reef's maps bind X onto world Z). Dotting world
    points against a bind axis measured a meaningless direction: it reported
    reef's jaw travelling **-0.05** of head height where a bind-space probe of
    the same rotation measured **+1.14**.
  - `bodyAxes()` calls the box's longest non-long axis "height", which on
    these rigs is world **Y** (reef's body box is 84/106/21) — but the jaw
    swings along world **X**.

  So the hinge is used as its own instrument: rotate a probe amount, see which
  way the jaw centroid actually moved, take that as "open" by construction.
  Measured over the eight evidence rows a +26° local-X hinge moves the jaw
  centroid by (+10.0,+1.9,0) reef, (+9.5,+5.1,0) tiger, (+11.4,-2.8,0)
  hammerhead, (+9.6,+12.6,0) greatwhite, (+9.4,+2.4,0) blue, (+25.0,+13.6,0)
  megalodon, (+9.8,+4.1,0) zeusfin, (+31.8,+16.8,0) typhonmaw — dominated by
  +X on every row, Z identically zero (the hinge is planar, as a jaw should
  be). A bake that reoriented would keep working.
- **Travel is measured at the jaw TIP, not the centroid.** The hinge sits near
  the middle of the LowerJaw cloud, so a 26° rotation moves the centroid by
  -0.036..+0.046 of head height — indistinguishable from noise — while moving
  the tip by 0.29..1.14. The tip is both the sensitive measurement and the
  thing a viewer reads as "the mouth is open".
- **Reverted outright if the skin says it did not open** (floor: 0.12 of head
  height). A bake whose hinge is authored differently gets no gape rather than
  a jaw rotated sideways through its own cheek.
- **The gape is ABSOLUTE, not relative, and it compensates for two separate
  closures applied by code outside this lane.** This is the part that actually
  decided whether the mouths opened, and neither closure is visible from
  `rig_morph.js` without measuring the rendered bone:

  1. **Every bake authors the jaw already CLOSED, by a different amount.**
     Measured as the bone's own local-X euler at rest: reef -14.48°,
     hammerhead -15.50°, blue -16.31°, greatwhite -17.94°, zeusfin -19.61°,
     tiger -20.22°. A relative +26° hinge on top of that nets only 6-11°, and
     a *different* amount per row.
  2. **`shark3d.js:3148` closes it again after we run.** That line executes
     once at build time, after `applyMorph`, and does
     `jawBone.rotateX(-jawRestGape * JAW_MAX_ROTATION)` — a further 11.5-14.5°
     of closure with the same inverted sign as the per-frame line. Left
     uncompensated it ate most of the hinge: reef rendered **+11.5°** against
     the 26 requested.

  So the target is the FINAL rendered angle: cancel the bake's authored
  closure, hinge to the requested angle, and add back the fixed amount
  shark3d.js is about to subtract. `baseJawQuaternion` is captured before that
  subtraction, so it is deterministic and known here.

  **Verified on the rendered bone**, which is the only measurement that
  settles it: reef 26.00°, tiger 26.33°, hammerhead 26.13°, greatwhite 26.33°,
  blue 25.80°, zeusfin 26.33° — every row now presents the gape the brief
  asks for, regardless of how its bake authored the rest jaw.

  `JAW_REST_GAPE` / `JAW_MAX_ROTATION` are consts in `shark3d.js` and are not
  exported, so they are mirrored in `rig_morph.js` as
  `JAW_REST_GAPE_HINT` / `JAW_MAX_ROTATION_HINT`. If either changes upstream
  the rest gape goes off by the difference, and both the gape record's
  `netHingeDeg` and the mouth gate surface that immediately.
- **The bite still composes, verified by driving `animate()`**: rest 26.00° ->
  biting -3.70° -> released 26.00°, with `rfJawGape` moving 0.280 -> 1.000 ->
  0.280. Note the bite *closes* the jaw from the new rest rather than opening
  it further — a direct consequence of the upstream sign bug, not of this
  change. It is self-consistent and returns cleanly to rest, but it means a
  bite currently reads as a snap SHUT. Fixing the sign upstream would make it
  read as a snap open, which is what the reference does.
- Runs **after** the relax-to-fit loop deliberately: an open mouth legitimately
  changes the head's length/height footprint, so folding it into that loop
  would make the gape compete with the bulk/sculpt morph for the same
  aspect/area budget and get walked back toward neutral — the mouth would
  close again on exactly the chunky rows that most need it. It is bounded on
  its own terms instead (hard 22–30° band, one bone, hinge-only, reverted if
  it did not open), so it cannot run away the way a scale chain can.
- `record.neutral` now accounts for the gape: a row with a hinged jaw is not
  "untouched" even when every scale factor relaxed back to 1.

**Roster: 78/86 rows open, 25.8–27.2°.** The 6 that do not are the
never-built rows with no jaw cloud at all (`jaw cloud too small (0 verts)`),
which is the correct refusal. 2 untextured rows get no morph record.

### `hse/face_textured.js` — eye, teeth, cavity

- **Eye sized to the brief.** Was `socketRadius = headSpan * 0.082` with the
  ball at 0.78 of that (~0.064 of a head span across the *radius*, well under
  half the reference). Now the eyeball radius is 0.050–0.068 of the head span,
  giving an eye **diameter of 0.116–0.136 of head length on all 6 shipping
  evidence rows** — inside the brief's 0.10–0.14 band, 6/6. The socket is
  1.34× the ball so a shaded rim is visible around it at crop size, which is
  the "sunk in a shaded socket" read.
- **Iris ring added** (`FACE_KIND.sclera` at `rfFaceEdge = 0`), concentric
  with the pupil rather than the ball so it stays even under the row's tilt.
  The shader's edge term was widened from a 0.10..0.26 mix span to 0.04..0.46
  so the ring is a genuinely dark annulus against the ball's lifted rim; at
  the old span they differed by 16% of one mix and were indistinguishable.
- **Catch-light floor deleted**, now a flat 0.30 of the eye radius — always
  subordinate to the 0.46 pupil, and a real countable dot now that the eye is
  no longer a sliver.
- **Teeth 9 -> 11 stations** per row (brief: 8–12), `toothHalfF` 0.30 -> 0.34
  of the pitch so a tooth is a little over two thirds of its gap: separated
  triangles, never a fused grille. 44 tooth vertices per row × 2 rows × 2
  sides.
- **Tooth height re-derived** as described above: brief bar first, pitch and
  cast-half-width as caps, hard floor. The caps are kept because they are what
  fixed the r15 containment leak (a pitch-derived tip on a broad jaw crosses
  the lip), so this does not reopen it.
- **Mouth cavity emitted at last.** `FACE_KIND.cavity` and `uRfFaceCavity`
  were declared in r15 but no geometry was ever built, on the grounds that an
  inner mouth is only meaningful once the batch is seated. It is seated now,
  and with the rest gape the jaw hangs 22–30° open — so without a cavity the
  viewer looks straight through the head and out the other side, which is
  worse than the closed mouth it replaced.
  - A **sheet, not a volume**: a closed inner mouth would have to be modelled
    against a palate and a tongue, neither of which these bakes have. A sheet
    set back to 0.40 of the local half-width (the tooth rows seat at
    0.74/0.52) gives the same read at any crop size for a fraction of the
    triangles and is *strictly inboard of every tooth*, so it cannot poke
    through the flank.
  - **Split across two bones**: the upper band rides `Head`, the lower band
    rides `LowerJaw`, so the cavity opens and closes *with* the jaw instead of
    tearing away from it during a bite — the same two-bone treatment the tooth
    rows already use.
  - Colour is **dark maroon `0x2a1014`, not neutral black**: at 380 px a pure
    black cavity reads as a hole punched in the render and is indistinguishable
    from the pupil. Kept dark enough that the teeth in front of it are the
    brightest thing in the mouth by a wide margin, which is what makes teeth
    pop in the reference.
  - **Matte**: `roughnessFactor` driven to 1.0 for the cavity kind only. The
    batch material is roughness 0.34 so the eye and teeth read wet, but a
    specular highlight sliding across the inside of the mouth destroys the
    "this is a hole" read and makes the sheet look like a painted panel.
- Shader cache key bumped `rf-tex3-r15` -> `rf-tex4-r15-grin`. Without this
  the old program is silently reused and none of the above appears; this has
  cost this lane a full evidence cycle before.

## The new gate: `hse/evidence/r15-face/mouth_gate.py`

Containment asks *is the batch on the shark*. That is satisfied by geometry
that is correctly seated and invisible — the exact state the r15 evidence was
in. This gate asks *can you see it*, on the forward head crop, at the size the
owner judges from:

- **GATE C (mouth cavity)** — dark, non-blue-dominant pixels >= **3.0%** of
  head-crop pixels.
- **GATE D (tooth white)** — bright, near-neutral pixels >= **0.8%** of
  head-crop pixels.

**Colour alone was not enough, and the first cut of this gate was itself a
false green — worth recording, because it is the same failure mode as the
lane it was written to catch.** Classifying rendered colour over the whole
head crop reported tiger at **40.09% "cavity"** and greatwhite at **13.54%
"tooth"**. Both are nonsense: tiger's skin is dark purple and greatwhite has a
pale belly, so the classifier was measuring **skin**. greatwhite cleared both
bars with a visibly closed mouth.

So the gate is scoped to the pixels the face batch actually drew, via the
face/noface difference the seating harness already produces, and only then
classified by colour. A pixel must be **both** (a) changed by mounting the
batch and (b) the right colour. Skin cannot satisfy (a); neither can a
correctly coloured but invisible feature, because a feature hidden behind a
closed jaw changes no pixels. Rows with no noface counterpart are reported
UNSCOPED rather than silently scored against the whole crop.

Thresholds are loose on hue and tight on value/saturation — the cavity is
"dark and not blue" (water and shadowed skin are both blue-dominant here), a
tooth is "bright and near neutral". The eye catch-light is a handful of pixels
and cannot reach 0.8% alone.

## Results — PARTIAL. Read this before merging.

**The mechanism is found and fixed; the rendered mouth is NOT yet open. I am
not claiming the deliverable.** What follows is what the pixels actually show,
not what the geometry says.

### What is genuinely done

- The **rest gape reaches the rendered bone** at the requested angle on every
  measured row: reef 26.00°, tiger 26.33°, hammerhead 26.13°, greatwhite
  26.33°, blue 25.80°, zeusfin 26.33° — inside the brief's 22–30° band, and
  verified as the LowerJaw's local-X euler on the built rig rather than as the
  value requested.
- The **eye is sized to the brief**: 0.115–0.136 of head length across, 6/6
  shipping rows inside the 0.10–0.14 band.
- **Iris ring, pupil, socket and catch-light are separable features** with the
  white-dot blowout cause removed (the head-span highlight floor).
- **Tooth rows and mouth cavity are emitted and correctly bound** — 11
  stations per row, 44 tooth vertices, 160 cavity vertices, lower rows on
  `LowerJaw` and upper on `Head`.
- **47 shipping rows pass every numeric face gate**, selftests green.

### What is NOT done, measured on the render

`hse/evidence/r15-face/heads_check/reef_fwd.png`, mouth gate:

    reef    cavity 0.32%  tooth 0.08%   FAIL cavity tooth
    bars:   cavity >= 3.0%   tooth >= 0.8%

At the 380 px crop the reef head still reads as a closed mouth with the teeth
sitting along the snout rather than framing a gape, and the eye reads as a
teal ball on the cheek rather than an eye set into a socket. **The gate is
correct and the art is not there yet.** I am reporting the gate's verdict
rather than relaxing the bar to manufacture a pass.

### The regression I introduced, found, and fixed — worth reading

The first full `heads_grin` render showed the tooth rows **detached and
floating in open water beside the head** — the exact r14 defect this whole
revision exists to prevent. Cause:

`applyMorph()` (shark3d.js:2941) runs BEFORE `buildTexturedFace()`
(shark3d.js:3000), and the face batch authors its teeth and cavity against
`jawBone.matrixWorld`. Hinging the jaw inside `applyMorph` therefore baked the
OPEN pose into the batch's vertices — and then shark3d.js rotated the same
bone again every frame. **The gape was applied twice**, and the tooth rows
tore off the head.

The fix is a deliberate split, and it is the shape of the code now:

- `applyRestGape()` (in `rig_morph.js`) MEASURES the hinge — direction, angle,
  travel as a fraction of head height — and **restores the bone to bind pose**.
  It stores what it learned in `record.gape.commit`.
- `commitRestGape()` (exported from `rig_morph.js`, called at the end of
  `buildTexturedFace()`) APPLIES it, in the only correct window: after the
  batch is authored against the closed jaw, before shark3d.js:3059 captures
  `baseJawQuaternion`. It is idempotent, so a row cannot be double-hinged.

**Known limitation of that split:** because the commit hook lives in
`buildTexturedFace`, only rows whose face batch mounts get the gape —
**47 of 86**, down from 78 when the gape was applied unconditionally in
`applyMorph`. HELD rows (megalodon, typhonmaw and the rest of the whitepointer
family) keep a closed mouth. That coupling is not desirable; it is the
consequence of this lane owning no hook in shark3d.js between those two lines.

## Selftests

    world: pass=true ok=379 fail=0
    game:  pass=true ok=386 fail=0

Zero failures from this lane. The numeric face gates (`checkTexturedFace`)
pass on **46/46** shipping rows, 0 failures.

## For the orchestrator — the one thing to merge

**Fix the jaw sign in `shark3d.js`.** Lines 3117 and 3148 both do

    jawBone.rotateX(-jawGape * JAW_MAX_ROTATION);

and the sign is inverted. Measured on all eight evidence rows by sweeping the
bone and re-skinning the jaw cloud, **local +X opens the jaw**; `-` drives it
shut and slightly through the palate. Dropping the two minus signs (and then
`JAW_REST_GAPE` to 0, since `commitRestGape` supplies the rest pose) would:

- let this lane apply the gape in `applyMorph` again, which restores it to
  **78/86 rows** instead of the 47 the `buildTexturedFace` hook can reach;
- remove the `JAW_REST_GAPE_HINT` / `JAW_MAX_ROTATION_HINT` mirror constants
  in `rig_morph.js`, which exist only to cancel that line and will silently go
  stale if the upstream values change;
- make a **bite read as a snap OPEN rather than a snap SHUT**. Right now,
  driving `animate()` gives rest 26.00° -> biting -3.70° -> released 26.00°:
  self-consistent and stable, but backwards versus the reference.

## Still true, and not this lane's to fix

- **megalodon and typhonmaw stay HELD.** `seatConfidence` (0.10 bar) refuses
  the whitepointer family, so they keep the Rev 14 baked face and draw no
  overlay. With the gape hook living in `buildTexturedFace`, a HELD row now
  also keeps a **closed mouth** — the two are coupled, and that coupling goes
  away with the sign fix above. The HOLD itself is a measurement, not an id
  list; a re-bake that fixes the geometry starts passing on its own.
- `hse/props_textured.js` threw `ReferenceError: position is not defined` at
  line 690 during this session. That is another lane mid-edit, not this one —
  it cleared on its own and the selftests are green.

## Reproduce

    node --experimental-loader ./tools/three-hook.mjs tools/selftest.mjs
    SCALE=2 SIDE=380 OUT=hse/evidence/r15-face/heads_grin \
      node hse/evidence/r15-face/headcrops.mjs
    python3 hse/evidence/r15-face/mouth_gate.py hse/evidence/r15-face/heads_grin
    VARIANTS=face,noface,flip,flipnoface OUT=hse/evidence/r15-face/seat \
      node hse/evidence/r15-face/wholeshark.mjs
    python3 hse/evidence/r15-face/silhouette_gate.py hse/evidence/r15-face/seat

The containment pass launches a fresh browser per frame (a shared module-level
LRU in shark3d otherwise lets an earlier row change what a later one builds),
which is why it is slow. That is deliberate and documented in the harness.

---

# ADDENDUM — after the coordinator merged the sign fix

The orchestrator merged the hook: `shark3d.js:3117/3148` now `rotateX(+gape)`
and `JAW_REST_GAPE = 0`. This addendum supersedes the Results section above.

## What the merge changed on my side

1. **Deleted the compensation.** `JAW_REST_GAPE_HINT` / `JAW_MAX_ROTATION_HINT`
   and the `shark3dClosure` term are gone. A mirror of another module's const
   is exactly what goes stale silently, and removing the need for one was the
   point of the merge.
2. **Found a residual +8.25 deg.** `JAW_REST_GAPE = 0` does NOT mean shark3d
   adds nothing at rest: line 3085 is
   `clamp(JAW_REST_GAPE + face.gape, 0.20, 0.35)`, and **the 0.20 floor
   survives the zeroed constant**. Every row was overshooting by exactly
   `0.20 * 0.72` = 8.25 deg (reef rendered 34.25 against 26). `commitRestGape`
   now takes that term and subtracts it, so the requested angle is the
   rendered angle: **reef 26.00, tiger 26.33, hammerhead 26.13, greatwhite
   26.33, blue 25.80, zeusfin 26.33.**
3. **Reordered the build, which was the coordinator's diagnosis and it was
   right.** The face batch was still being authored BEFORE the gape was
   committed, so it fitted the lip line, tooth seats and cavity to a CLOSED
   jaw and the jaw then opened underneath them. `commitRestGape` +
   `updateMatrixWorld` + `skeleton.update()` now run FIRST, and
   `texturedFaceGeometry()` samples the posed skin.

That fixed the detachment the coordinator saw: measured worst gap from tooth
row to body skin is now **reef upper 1.14% / lower 2.01%**, **blue upper 2.31%
/ lower 3.70%** of body diagonal. The yellow boxes on zeusfin were the cavity
sheet drawn against the closed-jaw lip line; they are gone with the reorder.

## But the mouth is still not seated, so the mouth is HELD

`RF_GRIN_MOUTH_HOLD = true` in `face_textured.js`. **Tooth rows and cavity are
not emitted; the eye ships.** Re-shot on the current tree
(`hse/evidence/r15-face/heads_g2/`, reef + blue + greatwhite):

    reef        lower row seats in the mouth, UPPER row rides too high on the
                snout - reads as a separate arc floating over the head
    blue        mouth reads CLOSED; teeth are specks on the DORSAL surface
    greatwhite  row hangs off the throat, teeth scattered below the jaw line

    mouth gate: blue 0.09%/0.07%, greatwhite 1.04%/0.27%, reef 0.62%/0.15%
                0 PASS / 3 FAIL   (bars 3.0% cavity, 0.8% tooth)

**The unsolved problem is the mouth LINE, not the gape.** `mouthU` is
`upper.uMin + upper.uSpan * 0.16` - a fixed fraction of the head band,
calibrated against a closed jaw. With the jaw hinged open the head/jaw weight
overlap and the head band both change shape and that fraction no longer lands
on the lip; two of the three rows fall back to
`mouthSource = "head extent (overlap was the snout tip)"`, which is a guess.

**The numeric seating gates do not catch this**, for the same reason they
missed the original defect: they measure distance to the nearest head-OR-jaw
vertex, and a row sitting in the newly-opened gap is close to both. Every row
scores a healthy 1.6-3.0% of a head span while the render shows teeth on the
dorsal ridge. I am not reporting those numbers as a pass.

Holding is a strict improvement on the r15 baseline (iris ring, pupil, socket,
no white-dot blowout, jaw visibly open) with no regression, and it obeys the
instruction not to leave floating geometry.

**To lift the hold:** derive the lip from the head/jaw weight boundary in the
POSED pose instead of a fixed fraction of the head band, set
`RF_GRIN_MOUTH_HOLD = false`, re-shoot reef/blue/greatwhite. The gape, cavity
geometry, tooth emitter and mouth gate are all in place and working - only the
seating station is wrong.

## Final state (GRIN2)

    world: pass=true ok=379 fail=0
    game:  pass=true ok=386 fail=0
    numeric face gates: 46 PASS / 0 FAIL
    rendered jaw: reef 26.00, blue 25.80, greatwhite 26.33 deg

Face batch under hold emits **166 vertices — socket 34, sclera 68 (ball +
iris ring), pupil 34, highlight 30. Zero tooth, zero cavity.**

Evidence: `hse/evidence/r15-face/heads_grin2.png` (reef | blue | greatwhite,
fwd | rev | HSE ref) from `heads_g3/`. All three show a clean head with a
seated eye and **no floating geometry**.

`checkTexturedFace` does not simply skip the tooth gates under hold — it
asserts the OPPOSITE (`toothCount !== 0` is a failure), so a stray tooth
escaping the hold is still caught. `mouth_gate.py` reads
`RF_GRIN_MOUTH_HOLD` out of the source and reports HELD rather than FAIL,
because "0% cavity, 0% tooth" is the correct result under a hold and printing
FAIL would train the reader to ignore this gate — exactly the habit that let
the original defect ship.

Files changed by this lane: `hse/rig_morph.js`, `hse/face_textured.js` only.
(`hse/props_textured.js` also shows in git status — that is another lane
working concurrently; it broke the module parse twice mid-session and
recovered on its own.)
