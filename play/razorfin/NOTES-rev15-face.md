# Rev 15 lane FACE — notes

Owned: `hse/face_textured.js`, `hse/evidence/r15-face/`, this file.
Selftests: `node --experimental-loader ./tools/three-hook.mjs tools/selftest.mjs`
(the bare `node tools/selftest.mjs` in the brief cannot resolve the bare
specifier `three`; the repo already ships the resolve hook for this).

## VERDICT: 11/12 containment PASS, 4 HELD. Flag is live.

`RF_O2_TEXTURED_FACE` is now `true` (coordinator flipped it). 45 rows ship the
overlay, 31 are HELD and keep the Rev 14 baked face, 6 never built.

### Silhouette containment, bar >= 0.98

    reef         1.000 / 1.000   PASS PASS
    tiger        1.000 / 1.000   PASS PASS
    blue         1.000 / 1.000   PASS PASS
    zeusfin      1.000 / 1.000   PASS PASS
    hammerhead   0.995 / 1.000   PASS PASS
    greatwhite   0.985 / 0.967   PASS fail
    megalodon    HELD - Rev 14 baked face
    typhonmaw    HELD - Rev 14 baked face

**11 PASS / 1 fail / 4 HELD** (was 0/16 at the start of the seating work).
Head-third passes on all 12 measured frames.

The one failure is 8 pixels on greatwhite reversed. Every one of them clears at
2 px dilation, i.e. they are antialiasing on a curved flank, not geometry off
the hull. I left the gate at the stricter 1 px rather than widen the tolerance
to manufacture a pass.

### Eye highlight, bar >= 50 px

    reef  717   tiger 436   zeusfin 403   blue 212
    greatwhite 41   hammerhead 36
    megalodon 0, typhonmaw 0  (HELD, no overlay by design)

4/6 over the bar; greatwhite and hammerhead sit at 41 and 36. **This is a real
trade-off I could not resolve cleanly and did not fake.** The size that clears
the pixel bar on those two rows is a catch-light larger than the pupil, and at
the head-crop size the owner judges from, that reads as a white sticker
pasted on the eye - it fails the thing the pixel bar is a proxy for. I settled
at 0.36 of eyeRadius plus a head-span floor: subordinate to the pupil on every
row, 4/6 over the bar, and correct-looking in the crops. If the bar matters
more than the look on those two rows, raising the floor is a one-line change.

## Head-crop evidence

`hse/evidence/r15-face/heads_after.png` - 8 rows, each `forward | reversed |
HSE reference`, crops at 380 px, 1:1 into the sheet (no upscaling).
Per-row PNGs in `hse/evidence/r15-face/heads/`, raw frames in `heads_raw/`.

Rebuilt by:

    SCALE=2 SIDE=380 OUT=hse/evidence/r15-face/heads \
      node hse/evidence/r15-face/headcrops.mjs

`headcrops.mjs` renders THROUGH `wholeshark.mjs` at 2x and crops, rather than
driving its own head camera. That is deliberate: two attempts at an independent
head camera both framed empty water, because the bind-pose box and the
hand-skinned box disagree about where the head is on these rigs (measured on
reef, the bind-box head end projected to screen (260,260) while the face batch
projected to (58,-493)). wholeshark's framing is the one the containment gate
already proved renders the face correctly, so reusing it removes a whole class
of camera bug from the evidence path.

The crop box is centred on the face/noface DIFFERENCE - the pixels the batch
actually drew - so it frames the thing being judged rather than a guess. A HELD
row draws no such pixels and falls back to the forward end of its own
silhouette, which is why megalodon and typhonmaw still show a head (their Rev
14 baked face) rather than an empty frame.

## What the head crops changed (the brow is gone)

The contact sheet I delivered previously showed each shark ~120 px wide, which
cannot show a face - the coordinator was right to reject it. Rendering real
head crops immediately exposed two art defects that were invisible at that
size, and both were mine:

1. **The catch-light had become a white sticker.** Chasing the >= 50 px gate I
   had run it to 0.48 of eyeRadius, larger than the 0.46 pupil. It read as a
   flat white disc over the eye. Now 0.36 with a head-span floor, always
   subordinate to the pupil.

2. **The brow drew as a hard teal bar across the pupil, and it is now DELETED.**
   Rev 13 authored it as a flat quad standing proud of the flank. Its lower
   edge sat at eyeU + 0.02 socket radii - on the eyeball's own centre line -
   while the ball reaches 0.78, so the quad was drawn straight through the eye.
   Lifting it clear of the ball just turned it into a teal diagonal stripe
   hanging above the skull: a thin plate seen edge-on, reading as a decal.

   A shark has no brow. What it has is a shallow supraorbital swell, which is a
   SHADING cue - the socket rim and the sunken eyeball already cast it. Adding
   geometry to say "brow" was the mistake. I deleted it rather than keep tuning
   a shape with no anatomical referent. `FACE_KIND.brow` stays defined so the
   shader branch and gates still resolve, and a future pass can emit a real
   ridge (a swell cast against the head surface, the way the eye now is)
   without touching the shader.

   Note this is a deliberate reduction in what the module draws. The brief
   asked for "an expressive angry brow"; the honest answer is that the brow
   plate was making the faces WORSE, and the expression now comes from the
   socket, the squint and the lid tint instead.

Also: pupil 10 -> 16 segments and highlight 8 -> 14, because an octagon reads
as a dot at gameplay size but is visibly faceted in a head crop.

## A gate correction worth knowing about

The containment gate now dilates the silhouette mask by ONE pixel before
testing. That is not a loosening to get a pass - it is a fix for a measurement
error I found while attributing greatwhite's failure.

A feature drawn AT the lip or the flank edge sits on the silhouette's own
antialiased rim by construction, and that rim is ~1 px wide (measured: 5.0% of
the greatwhite body mask). At small feature counts the rim dominates the ratio:
greatwhite's tooth row is 24 px, of which 7 were rim pixels 1-2 px from an
inside pixel, scoring 0.708 for a row that is correctly seated.

I verified the tolerance does not hide a real failure with a control: take a
passing frame, displace the face batch 220 px off the body, re-score. It comes
back **0.000, FAIL**, while correctly seated rows score 1.000. The gate still
catches the defect this whole revision was about.

## THE ROOT CAUSE (this is the useful part of this pass)

`skinnedSamples()` measured the head by calling `body.applyBoneTransform(i, p)`.
That reads `skeleton.boneMatrices`, a Float32Array THREE fills in
`Skeleton.update()`. **Nothing in the build path calls that.** In node it
happens to hold usable values; in the BROWSER it is still identity when
`buildLoadedRig` runs, so `applyBoneTransform` returns the vertex UNCHANGED.

Measured in the live browser, reef head vertex 1989:

    raw                  (-0.043, -0.010, -0.375)
    applyBoneTransform   (-0.043, -0.010, -0.375)   <- unchanged
    manual linear blend  (-0.043, -0.374, -0.282)   <- correct, delta 0.376

So every sample this module took in the browser was the BIND pose while the
shark rendered in its POSED pose. The whole batch was authored one head-height
below the head. That is the float in `hse/evidence/head_after/`.

And it is exactly why the gates were a false green: in node the two poses
agree, the samples are right, and every numeric gate passes honestly. The gates
were never wrong about the numbers - they were measuring a situation that only
exists in node. `hse/STATUS-O2.md` called this a false green without knowing
the mechanism; this is the mechanism.

**Fix:** compose the bone matrices directly from `bindMatrixInverse *
bone.matrixWorld` and blend by hand. `updateMatrixWorld(true)` guarantees
`bone.matrixWorld` is current in both runtimes. Verified in the browser: the
face centre moved from outside the head box to inside it, and
`faceUpFrac` went from -1.21..-0.81 (a full head-height below) to 0.35..0.74
(inside the head), matching node exactly.

Two further real defects the pixel gate then exposed, both fixed:

- **Eye wider than the skull it sits on.** The eye-size clamp has a FLOOR of
  0.86 that assumes every bake is roughly as broad as reef. The whitepointer
  family (megalodon, typhonmaw) is a thin low-poly mesh whose half-width at the
  eye station is a genuine 0.011 of a head span against reef's 0.057
  (`hse/probe_sweep.mjs`). The eye radius was 0.047 - FOUR TIMES the flank it
  had to seat on - so most of the eyeball hung in open water. The measured
  half-width is now a hard ceiling applied after the aesthetic sizing:
  eyeR/halfW went from 2.5-4x to 0.19-0.66 on every row.
- **Teeth forced wider than the jaw.** The lateral seat was
  `Math.max(slice.side * 0.90, toothPitch * 0.55)`; toward the snout the head
  slice is genuinely narrow, so the pitch floor won and pushed the tooth wider
  than the head. The floor is now a fraction of the measured side, so it can
  never exceed it.

## Where it stands (measured)

### Silhouette containment, 8 rows x 2 directions, bar >= 0.98

    tiger        1.000 / 1.000   PASS PASS
    zeusfin      1.000 / 1.000   PASS PASS
    reef         0.989 / 0.989   PASS PASS
    hammerhead   0.970 / 0.996   fail PASS
    blue         0.978 / 0.983   fail PASS
    greatwhite   0.955 / 0.905   fail fail
    megalodon    HELD - keeps the Rev 14 baked face
    typhonmaw    HELD - keeps the Rev 14 baked face

**8 PASS, 4 HELD, 4 fail** (was 0/16 before ray-cast seating). The head-third
check passes on all 12 measured frames.

The four failures are 0.905-0.978, i.e. just under the bar, and blue oscillates
across it between renders (0.978/0.983 here, 0.980/0.952 on the previous run) -
that pair is inside the harness's own noise, not a stable failure.

Per-kind isolation renders say where the remaining leak is. On greatwhite:

    sclera     109 px  inside 109  OUTSIDE 0   1.000
    highlight  126 px  inside 126  OUTSIDE 0   1.000
    brow        38 px  inside  38  OUTSIDE 0   1.000
    tooth       30 px  inside  24  OUTSIDE 6   0.800

**The eye, its catch-light and the brow are perfectly contained on every row.**
Every remaining outside pixel is tooth. Tucking the rows further inboard
(0.86/0.62 -> 0.74/0.52 of the measured jaw half-width) did not close it,
which points at the tooth TIP rather than its lateral seat: `height` is keyed
to the mouth pitch and on a broad jaw the tip can still cross the lip. Keying
tooth height to the cast half-width at each station, the way the eye is now
keyed, is the change I would make next.

### Eye highlight, `tools/face_eyecheck.py`, bar >= 50 px

    reef        1193      tiger        720
    zeusfin      601      blue         344
    greatwhite    67      hammerhead    61
    megalodon      0  HELD (no overlay by design)
    typhonmaw      0  HELD (no overlay by design)

**6/6 of the rows that ship the overlay pass**, all above the bar. The two
zeros are held rows drawing no overlay at all, which is intended.

This also closed last pass's regression - blue/reef/zeusfin were 0-1 px, now
344/1193/601 - by scaling the catch-light with the eye (0.26 -> 0.48 of
eyeRadius) plus a floor against the head span, so a row whose eye is clamped
small by a narrow skull still gets a highlight with real area. Emissive 0.95.

### Everything else

Numeric gates (`checkTexturedFace`): all 47 shipping rows pass.
Selftests: world 379/379, game 381/381. Zero failures from this lane.
Roster: **47 rows ship the overlay, 31 HELD, 6 never built** (pre-existing:
thresher, sawshark, morayne, barbhook, chimerashark, lamiacoil - verified
identical on the r14 file from HEAD).

## Harness traps (all cost real time; all now documented in the scripts)

1. **Textured models are demand-loaded.** `requestTemplate()` refuses any key in
   `TEXTURED_KEYS` unless `mayLoadTextured()` is true. A plain headview load
   renders the LOW-POLY row, reports `rfTextured:false`, and frames empty
   water - which looks exactly like "the face code is broken" and is not.
2. **`bootTexturedKey()` picks which single model preload fetches**, reading
   `RF.Meta.profile().activeShark`. Without stubbing it, reef was the only row
   that ever appeared textured.
3. **`Box3.setFromObject` is useless on a SkinnedMesh** - it reads bind-pose
   geometry. My first "the face is at the body midpoint" reading was this
   artifact, not a real defect. Every box in these probes is now hand-skinned.
4. **One browser per frame.** shark3d keeps a module-level LRU of textured
   templates shared across pages, so an earlier row changed what a later row
   built: the face/noface pair of the SAME row differed in the BODY as well as
   the face (reef reported 9610 "face pixels", blue 16108) while the identical
   row rendered in isolation was bit-exact with a clean 36x43 diff box. The
   difference image is the whole measurement, so the gate is only trustworthy
   with a fresh browser per frame.
5. **The camera must be pinned to bind-pose geometry.** Deriving it from the
   skinned box moved it between the face and noface renders, because mounting
   the face changes the group normalization pass.

## What DID change (all in `hse/face_textured.js`)

Driven by the owner override: *"sharks look like they are from the Avatar
movie, weird hybrid nonsense, just make them look like sharks."*

1. **Iris: no more glowing colour on real species.** `eyeColorOf()` in
   shark3d.js hands this module a saturated hue per row — greatwhite
   `0x8bdcff` cyan, tiger `0x79e85b` green, hammerhead `0xd9f25b` yellow-green.
   That is the "Avatar" read, literally: a photographed shark has a black eye.
   That resolver is not this lane's file, so rather than change what it
   returns, the new `irisFor()` decides what the iris is **allowed** to be:
   only `cls === 'god' | 'demon'` keep a coloured iris; every real-species row
   is crushed to near-black, keeping a warm amber cast only where the row's own
   hue was already warm (so a lemon still differs from a blue).
2. **Iris emission removed on real rows.** Was a flat `0.38` for every row,
   which made every eye a running light. Now `uRfFaceIrisGlow`, `0.0` on real
   species and `0.14` (from `0.38`) on the mythic ones.
3. **Sclera is dark, not white.** Rev 13 painted it `vec3(0.94,0.95,0.92)` —
   a near-white eyeball is a *mammal's* eye and is a large part of why these
   heads read as humanoid hybrids. It is now a dark ball tinted from the iris,
   lifting only slightly at the rim.
4. **Highlight is the only bright pixel in the eye**, and is emissive at
   `0.95` (from `0.55`) so it survives a shaded, fogged frame rather than
   washing out to the water value at gameplay distance.
5. **Brow is a ridge, not an eyebrow.** The Rev 14 slab rose `0.90` socket
   radii above the eye and stood proud of the flank — a humanoid forehead on
   an animal that has no brow. Cut to ~a third of the rise, narrowed to barely
   wider than the socket, and seated nearly flush (`1.004` -> `1.0015` of the
   half-width). The personality `brow` column still drives it, so an angry row
   still squints — with a crease instead of an eyebrow.
6. **Teeth: 9 stations per row, up from 5** (brief asks 8–12). `toothHalfF`
   stays a fraction of the pitch, so the gap ratio is unchanged and the teeth
   stay individually separated instead of fusing into a grille. Teeth are
   white and faintly warm, brightening toward the tip.
7. **Gums pale, cavity dark.** New `FACE_KIND.cavity` (7) plus `uRfFaceGum`
   (`0xb08d86`, a washed pinkish grey — explicitly *not* red-red) and
   `uRfFaceCavity` (`0x140d0d`).
8. Shader cache key bumped `rf-tex1` -> `rf-tex2-r15`, or the old program is
   silently reused and none of the above appears.

`FACE_KIND.cavity` is declared and painted, but **no cavity geometry is
emitted yet** — building an inner mouth volume is only meaningful once the
batch is actually seated on the head, so it is left as the kind id plus its
uniform for whoever fixes the seating.

## Evidence

`hse/evidence/r15-face/{before,after}/<id>_head.png`, same 8 rows, same
harness, differing only by the contents of `face_textured.js`:
reef, tiger, hammerhead, greatwhite, blue (mako family), megalodon
(whitepointer family), zeusfin (god), typhonmaw (demon). All 8 ids validated
against `RFD.SHARKS`. HSE reference: `hse/evidence/r15-face/ref/`.

Rendered-pixel gate, `tools/face_eyecheck.py`:

| | before | after |
|---|---|---|
| peak highlight value | 0.878 | **0.922** |
| typhonmaw highlight px | **0** (fail) | **255** (pass) |
| rows failing | greatwhite, typhonmaw | greatwhite |

`greatwhite` still fails, and it is a **framing** artifact, not an eye defect:
headview's camera lands behind/below that row so the eye is outside the crop
the gate scores. Worth fixing in the harness, but it is not evidence about
the highlight.

Selftests: `world 377 ok / 2 fail`, `game 386 ok / 0 fail`. **Both failures
are pre-existing and belong to other lanes** — `ATMO-01` (god-ray shaft alpha)
and `formation` (fish school aspect ratio). Verified by running the identical
selftest against the pristine `face_textured.js` from `HEAD`: same two
failures, same numbers. This lane adds zero failures.

## Harness notes (`hse/evidence/r15-face/shoot.mjs`)

Two traps cost real time; both are documented in the file:

1. **Textured models are demand-loaded.** `requestTemplate()` refuses any key
   in `TEXTURED_KEYS` unless `mayLoadTextured()` is true, which needs either
   preload's bounded boot window or a live `RF.Game.ctx.player`. A plain
   headview load renders the **low-poly** row, reports `rfTextured:false`, and
   frames empty water — which looks exactly like "the face code is broken" and
   is not.
2. **`bootTexturedKey()` picks the one model preload fetches**, reading
   `RF.Meta.profile().activeShark`. Without stubbing it the boot key is always
   `allRows[0]` (reef), so reef was the only row that ever appeared textured.

The shooter stubs both and rewrites the kill switch **in flight only**. The
working tree is never modified.

## For the orchestrator

**Flip `RF_O2_TEXTURED_FACE` to `true` in `shark3d.js:17`. That is the only
change needed outside this lane, and nothing else in shark3d.js has to move.**

What that ships: 45 rows get the seated overlay; 31 rows the module measured as
unseatable return null and keep the Rev 14 baked face exactly as today; the 6
rows that never built are unaffected. The HOLD is enforced inside
`face_textured.js` through its existing null contract, so there is no id list
to maintain in shark3d.js and no second code path.

Risk if you flip: the 31 held rows look exactly as they do now (no regression
possible - they get no overlay), and the 45 shipping rows are the ones the
pixel gates measured. The failure mode this whole revision was about, a face
batch floating beside the shark, is now caught by `seatConfidence` before any
geometry is emitted.

To re-check any of this after a re-bake:

    node --experimental-loader ./tools/three-hook.mjs tools/selftest.mjs
    OUT=hse/evidence/r15-face/after node hse/evidence/r15-face/shoot.mjs
    python3 tools/face_eyecheck.py hse/evidence/r15-face/after
    VARIANTS=face,noface,flip,flipnoface OUT=hse/evidence/r15-face/seat \
      node hse/evidence/r15-face/wholeshark.mjs
    python3 hse/evidence/r15-face/silhouette_gate.py hse/evidence/r15-face/seat

The containment gate takes ~60 min because it launches a fresh browser per
frame; that is deliberate and the reason is documented in the harness.
