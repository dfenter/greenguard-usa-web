# Rev 15 lane ORIENT2 — the eyes-on orientation gate

Owner verdict (binding, after the previous lane reported **86/86 PASS**):

> *"shark orientations all need to be reviewed, some swim butt first, others
> upside down; Sharkjira swims backwards"*

Owned file: `shark3d.js` (orientation resolver + swim chain only).
Evidence: `hse/evidence/r15-orient2/`.

## The headline: the gate was reading the same broken cue as the resolver

`NOTES-rev15-orient.md` reported 86/86 PASS on a build the owner could see
was wrong. That is not a near-miss; it is a gate that cannot fail. The reason
is specific and worth stating plainly:

> **The resolver decided the nose direction from the `Head`/`Tail` bones, and
> the gate verified the nose direction from the `Head`/`Tail` bones.**

A gate that re-measures the resolver's own input is not a test, it is a
tautology. Every "+0.87..+1.00 headDot" in that lane's 86-row table is the
resolver agreeing with itself.

## Why the bones cannot decide this

Every `shark_bake.py` rig carries the **same generic skeleton** —
`Tail3,Tail2,Tail1,Spine2,Spine1,Neck,Head,LowerJaw` with `Head` pinned at
x=+0.3 and `Tail3` at x=−0.5 — regardless of which way the mesh it is bound to
actually faces. Measured across the approved bakes, the bone record is
byte-identical:

```
                head    tail    jaw-head        renders
greatwhite_cy   +0.30   -0.50   [0,-0.0613,0]   CORRECTLY
whaler          +0.30   -0.50   [0,-0.0527,0]   CORRECTLY
thresher        +0.30   -0.50   [0,-0.0586,0]   TAIL-FIRST
tigershark      +0.30   -0.50   [0,-0.0531,0]   TAIL-FIRST
whitepointer    +0.30   -0.50   [0,-0.0718,0]   TAIL-FIRST
```

The skin weights agree with the bones (Head-weighted verts at +x on all of
them), so the whole rig — bones *and* binding together — is simply placed the
wrong way round on three of these bakes. A cue that returns the identical
answer for a correct model and a reversed one carries **zero information**.

Only the MESH knows which end is the head.

## The cue that does know: the girth centroid

A shark's cross-section peaks at the pectoral girdle, just **behind** the
skull, then tapers monotonically to a thin caudal peduncle. So the
area-weighted centroid of the cross-section profile always lies on the HEAD
side of the body's midpoint. Binning the long axis into ten and taking
`height × depth` per bin:

```
thresher      centroid -0.374   head at -x
tigershark    centroid -0.303   head at -x
whitepointer  centroid -0.243   head at -x
sharky        centroid +0.259   head at +x   <- Rev 9 reference
whaler        centroid +0.294   head at +x
greatwhite_cy centroid +0.338   head at +x
```

The band between −0.24 and +0.18 is **empty**. That is a 0.42-wide margin with
nothing in it, not a coin toss.

### What it is not

* **Not extent-girth.** Won by the caudal fin, whose lobes reach further from
  the spine than a skull does. This is the cue that shipped first and put
  `goblin` in the game swimming backwards.
* **Not vertex count.** Measures how much detail the artist spent on an end.
* **Not solidity** (`depth/height` per bin, the shipped `orientGirthBias`).
  On these bakes it is won by the **pectoral fins**, and it names the wrong
  end on thresher and tigershark. Kept only as a last-resort tiebreak.

The centroid is robust to all three because a fin perturbs **one bin** while
the centroid integrates **all ten**.

## The change

`resolveOrientation()`, nose-sign stage only. Two things:

1. New `orientGirthCentroid(points, box, size)`.
2. The decision order is inverted. It **was** bones-first, girth-as-fallback.
   It is now:

```
|centroid| >= 0.12  ->  centroid decides   (records "overrode head/tail bones")
otherwise, bones present -> bones decide
otherwise            ->  solidity decides
```

The threshold only guards a genuinely shapeless mesh; on the real assets
nothing lands near it.

**Nothing else was touched.** The long-axis law, the jaw-bone dorsal cue and
the pectoral-balance roll cross-check are all unchanged — they were correct.
The resolver corrected exactly the three reversed bakes and left the correct
ones bit-identical (`greatwhite_cy` and `sharky` still resolve `flip=true` /
`flip=false` respectively, from the centroid, with no override recorded).

## The gate is now my eyes

Per the brief, PASS/FAIL below was written by **looking at the PNG**, never
computed. A frame passes when the snout leads the direction of travel, the
dorsal fin is on top, the belly is down, the tail trails, and the pectorals
are lateral.

Two harnesses, both driving the real game (`index.html?unlockall=1`, service
worker 404'd, `landscapePrimary`, CDP screenshots, one page per row):

* `hse/evidence/r15-orient2/shoot.mjs` — player rig, **four** drive
  directions (the previous lane shot three; `up` was never tested).
* `hse/evidence/r15-orient2/npcshoot.mjs` — NPC rigs, via `RF.World.entities`,
  roaming until predators spawn on the ring.

Plus `scratchpad/orient/o2_proj.mjs`, a dependency-free software rasteriser
(no GL) that renders any bake side/top/front in its **resolved** frame. This
is what actually settled each verdict — the in-game frames are small and
busy, and a 1000px side profile is unambiguous. Output in
`hse/evidence/r15-orient2/bakes/`.

### One trap worth recording: the vertical frames were lying

The first run's `up`/`down` frames showed several rows with the snout pointing
the **opposite** way to the key being held. That is not an orientation bug —
the shark carries its previous heading and turns at a finite rate, and a 1.5 s
hold caught it **mid-turn**. `whaleshark down` showed the snout at the top of
frame while the down key was held.

Fixed in the harness: vertical drives hold 4.2 s, and the shot is gated on the
player's own velocity agreeing with the drive before it is taken. Without this
the gate reports false failures on correct rows, which is exactly the kind of
noise that gets a real failure dismissed.

## Results — every verdict written from looking

| row | model | right | left | up | down | was |
|---|---|---|---|---|---|---|
| greatwhite | greatwhite_cy | PASS | PASS | PASS | PASS | already correct |
| leviathanrex (Sharkjira) | greatwhite_cy | PASS | PASS | PASS | PASS | already correct |
| leviathan_rex | greatwhite_cy | PASS | PASS | PASS | PASS | already correct |
| thresher | thresher | PASS | PASS | PASS | PASS | **TAIL-FIRST** |
| sawshark | thresher | PASS | PASS | PASS | PASS | **TAIL-FIRST** |
| snapjaw | tigershark | PASS | PASS | PASS | PASS | **TAIL-FIRST** |
| aresrender | tigershark | PASS | PASS | PASS | PASS | **TAIL-FIRST** |
| artemisstrike | whaler | PASS | PASS | PASS | PASS | already correct |
| whaleshark | whitepointer | PASS | PASS | PASS | PASS | **TAIL-FIRST** |
| reef | thresher | PASS | PASS | PASS | PASS | **TAIL-FIRST** |

Contact sheet: `hse/evidence/r15-orient2/contact_sheet.png`.
Verdicts (hand-authored, deliberately not computed):
`hse/evidence/r15-orient2/verdicts.json`.

**NPCs:** captured on the `thresher` bake travelling both directions
(`npcshots/npcsil_thresher_{left,right}.png`). Nose-forward, dorsal-up, same
as the player — NPC and player share the `buildShark` → `renderPlayer` path,
so the fix reaches both.

### Sharkjira does NOT swim backwards

The owner named `leviathanrex` specifically, and the brief asked me to fix the
nose sign for `greatwhite_cy`. **I did not, because it is not broken.**
Verified in all four drive directions as player, plus a 1000px side profile:
snout, eye and open toothy jaw lead the heading every time; dorsal up; tail
trailing. `greatwhite_cy`'s centroid is **+0.338**, the most confident
head-at-+x reading of any bake measured.

What the owner saw was almost certainly one of the **three genuinely reversed
bakes** in the same session — and `whitepointer` alone carries **25 of the 86
roster rows**, so a run would have been full of backwards sharks. Changing
`greatwhite_cy`'s nose sign, as the brief suggested, would have **broken the
one big bake that was right**.

### Roll / belly-up

No belly-up rows found. The jaw-bone dorsal cue plus the pectoral-balance
cross-check (both from the previous lane) are sound and I left them alone.
Front and top renders of `whaler` — the one bake whose side profile initially
read as rolled to me — confirm dorsal straight up, pectorals splayed
symmetrically, belly down. It is a slender, low-contrast bake, not a rolled
one. I record that misread rather than hide it: it is the reason I rendered
front/top views for every ambiguous case instead of trusting one angle.

## Swim wave still beats laterally

`scratchpad/swim/gate.mjs` on the affected rows, after the change:

| row | bake | tail lat %H | head lat %H | tail **vert** %H | jerk | step jerk |
|---|---|---|---|---|---|---|
| greatwhite | greatwhite_cy | 2.13 | 0.45 | 0.01 | 1.78% | 5.76% |
| leviathanrex | greatwhite_cy | 2.15 | 0.44 | 0.01 | 1.78% | 5.75% |
| thresher | thresher | 1.00 | 0.43 | 0.00 | 1.77% | 5.59% |
| snapjaw | tigershark | 1.70 | 0.45 | 0.00 | 1.79% | 6.15% |
| artemisstrike | whaler | 1.83 | 0.38 | 0.00 | 1.79% | 4.70% |
| whaleshark | whitepointer | 2.22 | 0.45 | 0.01 | 1.78% | 5.88% |
| reef | thresher | 1.51 | 0.43 | 0.00 | 1.79% | 6.10% |

Tail beats **laterally** on every row with essentially zero vertical bending;
head lateral 0.38–0.45 %H against a 6% gate; jerk 1.77–1.79% and step jerk
4.7–6.2% against a 10% gate. The nose-sign change is a 180° spin about the
dorsal axis, which is the swim chain's own yaw axis, so it cannot disturb the
beat — and does not.

## Selftests

```
game   394/394 pass
art3d  1 fail   - PRE-EXISTING, not this lane
world  noisy    - PRE-EXISTING, not this lane
```

**`art3d`** fails `HSE family map: reef routed to thresher, expected dogfish`.
Reproduced **identically on the untouched pre-lane backup**. It is a
family-map/roster-rebase issue (the roster rebase onto the four approved bakes
is another lane's work), not an orientation one.

**`world`** is non-deterministic and was already so. Three runs each:

```
BASELINE (untouched backup)   fail=11,  fail=0,  fail=10
THIS LANE                     fail=11,  fail=9,  fail=7
```

The same file gives 0 failures on one run and 11 on the next. The failing
checks are all environment/procedural — draw-call counts, SDF push-out, relic
placement, per-level triangle budgets — and a **different set of levels** trips
on each run. Nothing shark-orientation related. Not introduced here, and not
something this lane can or should fix.

## For the orchestrator

1. **Merge `shark3d.js`.** The change is confined to the nose-sign stage of
   `resolveOrientation` plus one new pure function.

2. **Retire the skeleton-based nose gate.** `hse/evidence/r15-orient/shoot.mjs`
   validates `headDot` from the `Head`/`Tail` bones, which is the cue that was
   wrong. It will now report `headDot ≈ −1.0` on the three corrected bakes and
   call them failures — that reading is the **bones** being wrong, not the
   shark. Use `r15-orient2/` instead, or re-point the old gate at the mesh.

3. **The roster rebase should re-verify by eye, not by gate.** Rows moving onto
   `thresher`/`tigershark`/`whitepointer` inherit the corrected orientation
   automatically (the resolver caches per model key, not per row), so no
   per-row work is needed — but the four-bake rebase changes which bakes carry
   which rows, and the only trustworthy check is looking.

4. **Not mine, still open:** `art3d`'s `reef routed to thresher, expected
   dogfish`.
