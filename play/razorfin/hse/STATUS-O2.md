# Lane O2 status: face batch on textured heads

Module: `play/razorfin/hse/face_textured.js`
Hook: one call at `shark3d.js` (textured branch of the face mount) + one import.
Selftest: textured rows now gated by `checkTexturedFace()` instead of being
forbidden from carrying a face.

## STATE: NOT DONE, AND DISABLED IN THE BUILD.

`RF_O2_TEXTURED_FACE = false` in shark3d.js, so textured rows ship exactly the
Rev 14 behaviour (the face the bake painted, no overlay). The module and its
gates are committed and reachable; flipping that one constant re-enables them.

All five selftest targets are green and every numeric gate passes on all 41
buildable textured rows (tooth median 0.018-0.045 of a head span, eye median
0.018-0.053, zero teeth outside the head span). **The render disagrees.**

`hse/evidence/head_after/head_reef.png` shows the whole batch built correctly
as geometry - two eyes with pupil and catch-light, an upper and a lower tooth
row, correct sizes and spacing - and sitting **entirely off the head, in open
water beside the body**. So the gates are measuring something that is not the
thing that has to be true. They are not a safety net right now; they are a
false green, and that is the single most important fact in this file.

## What IS established (measured, reproducible)

1. **Up axis differs per bake.** corr(skinned axis, world up): reef/greatwhite
   -> skinned X (-1.00); hammerhead -> skinned Z (+0.95). (`probe_dorsal.mjs`)
2. **Jaw weights are soft on half the line.** max LowerJaw weight: dogfish
   1.000, megalodonrex 0.267, thresher 0.219, whitepointer 0.259. A fixed 0.5
   cut finds no jaw at all on the soft ones. Relative cut fixes it.
   (`probe_jaw.mjs`)
3. **The Head/LowerJaw overlap is not always the mouth.** On whitepointer and
   tigershark the jaw cloud ends flush with the head's forward tip, so the
   overlap is the snout cone. (`probe_base.mjs`)
4. **The bones are NOT a usable frame.** They are posed by the procedural swim
   and disagree with the vertices they drive: on reef the Neck->Head delta in
   skinned space is (0, 0, -0.138), pure z, while the head cloud lives on
   skinned y[-0.498, -0.263]. Deriving the frame from bones made the lateral
   axis run along the BODY and threw the mirrored eye 78 world units back to
   the tail. (`probe_axes2.mjs`)
5. **The head point cloud is one-sided**, so its centroid is off the midline
   and any axis derived from it is biased. (`probe_seat.mjs`)
6. **The headview harness was ALSO wrong** and masked the defect for several
   iterations: framing on the head-box centre put every eye vertex at screen
   x 919-1051 on a 900px viewport, 0/26 on screen, which reads exactly like
   "no face was built". Fixed by aiming at the face mesh's own skinned box.
   (`probe_screen.mjs`)

## The open defect

The batch is built with correct internal structure (two eyes with pupil and
catch-light, an upper and a lower tooth row, sane sizes and spacing) but it is
**not seated on the head**. A side-on real-GL render
(`hse/evidence/head_after/head_reef.png`) shows it hanging below the mid-body,
clear of the skin.

Why every gate I wrote still passed, including after I moved it to world space:
the seating metric asks "how far is this vertex from the nearest BODY vertex".
The batch is floating near the belly, so there is always a body vertex close by
and the metric reads 0.6-1.1% of body length (`probe_gap.mjs`). The metric is
answering a question that a detached batch can pass. It needs to ask instead
"is this vertex on the HEAD, on the correct flank, at the correct station" -
a containment/projection test against the head surface, not a nearest-neighbour
distance against the whole body.

**The fix I would make next**, in order:
1. Replace the nearest-neighbour metric with a projection test: for each face
   vertex, find the head-surface triangle it should lie on along the lateral
   axis, and measure the signed offset from that surface. A detached batch then
   fails by construction.
2. Only once that gate is honest and RED, fix the placement. The frame
   derivation (findings 1-5 below) is sound and worth keeping; the suspect step
   is the projection from frame coordinates back through the bone inverse in
   `frameDisc`/`frameTooth`, which is where a correct frame can still emit
   vertices in the wrong place.
3. Re-tune sizes last.

## Rollback

The hook is one `buildTexturedFace(...)` call plus one import in shark3d.js.
Reverting those two edits restores Rev 14 behaviour (textured rows carry the
bake's painted face, no overlay) with no other change.

## Not mine

- `hse/rig_morph.js` (lane L2) threw out of `buildLoadedRig` for ~45 rows for
  part of this session ("L2 morph length delta N% exceeds +/-3%"); it was
  fixed by that lane mid-session and all 86 rows build now.
- `art3d` was red on arrival (stale gate requiring `reef -> sharky` after O1
  moved reef onto dogfish); fixed by O1 mid-session.
