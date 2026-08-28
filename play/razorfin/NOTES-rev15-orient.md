# Rev 15 lane ORIENT — one authoritative orientation resolver

Owner verdict (binding): *"check orientation of the sharks, they seem all
random and mostly wrong."*

Owned file: `shark3d.js` (orientation law in `prepareTemplate`).
Selftests: `art3d`, `world`, `game` — see "Selftests" below.

## What was actually wrong

The verdict was literally true and measurable. Under the shipped Rev 14/15
law, the 29 loaded models came to rest in **six different orientations**.
That was not one bug but an accretion of four conditional laws that each
measured a frame the previous one had already rotated:

1. a bind-pose long-axis law (this part was correct),
2. a roll law that branched on `TEXTURED_KEYS` **or** `rfMergedPrimitives`,
   falling back to a crude `height > width` span test otherwise,
3. a `NOSE_FLIP_KEYS = {goblinshark, anglerfish}` girth test containing a
   hard-coded `key === 'goblinshark' ? true : ...` override, and
4. a `Head`/`Tail3` bone spin that only fired on rigs that happen to use
   those bone names.

Because each stage called `rotateOnWorldAxis` *between* measurements, the
later stages measured a disturbed frame, so per-model answers diverged.

### The dorsal metric was measuring nothing

The shipped roll law computed its "one-sided extent asymmetry" about the
**world origin**, and the prior lanes' probes computed it about the **bbox
centre**. A bbox centre sits *between* the extremes by construction, so the
asymmetry it yields is ~0 for every model. Re-measured across all 29 models,
`asymY`/`asymZ` came out `0.000` for 24 of them. The detector that was
supposed to find the dorsal fin was returning noise, and the sign of that
noise is what chose each model's roll.

`hse/evidence/r15-doc/profileview.html` had already hit this wall and
documented the dead end in a comment: *"There is no single right answer."*
That is what a pile of heuristics feels like from the inside.

## The target frame is fixed by the engine, not by taste

This was the missing constraint. From `engine3d.js renderPlayer()`:

```js
var left = Math.abs(p.angle) > Math.PI / 2;
g.rotation.set(0, left ? Math.PI : 0, zrot);   // face left = 180° about Y
g.rotation.x = (left ? -1 : 1) * num(a.bank, 0);
```

Facing left is a **180° spin about world Y**, which keeps the belly down
**only if dorsal is +Y**. Bank rolls about world X, i.e. the swim axis. And
`world3d.js:161` states plainly: *"Bakes are nose-right."*

⇒ **NOSE +X, DORSAL +Y.** One frame, non-negotiable.

The old comment at `shark3d.js:1141` asserted the contract was *"dorsal is
world z, not world y"*. That described only the frame *after* the conditional
roll fired — and the roll was conditional, so rows that skipped it kept
dorsal on Y. Downstream consumers each re-measured and each got a different
answer; that stale note is why.

## The resolver

`resolveOrientation(scene, meshes, key)` — one answer per model, cached by
model key in `orientationCache`, computed at template load, **never per row**.
It measures the *authored* frame once and composes a **single quaternion**;
no incremental `rotateOnWorldAxis` between measurements.

Evidence is used strongest-first:

1. **Long axis** — largest bind-pose extent. Skinned boxes are inflated by
   the bone matrices, so raw geometry only. (Unchanged; it was correct.)

2. **Dorsal axis + sign — the LOWER JAW BONE.** The lower jaw physically
   hangs *below* the snout, so `(jaw − head)` points **down**; dorsal is its
   negation. This is a direct physical readout, not a shape heuristic, and it
   is exactly what the spike/skewness metrics were failing to approximate.
   Only the transverse components vote (a jaw is also *forward* of the head
   bone, and that must not count).

   Validated against the one rig everybody agrees renders correctly —
   `sharky`, the Rev 9 reference: its jaw sits at **y −0.0286** relative to
   its head. Down is −Y, dorsal is +Y, matching the engine contract exactly.

3. **Fallback (no jaw bone)** — one-sided **fin spike**, but measured about
   each bin's **median** transverse coordinate. The median is robust to a
   one-sided fin, which is precisely why the bbox-centre and world-origin
   versions returned zero. Pectorals are paired and cancel; a dorsal fin
   does not.

4. **Fallback of last resort** (`|spike| < 0.08`, the short-finned bakes) —
   **skewness** about the median: a back carries a long thin tail of fin
   vertices, a belly is blunt.

5. **Nose sign** — `Head`/`Tail` bones when present, else the **girth
   profile** (mean cross-section radius of the two end fifths, skipping the
   outermost bin). Vertex **count** is deliberately *not* used: it measures
   how much detail the artist spent on an end, not how thick it is, and it
   is what flipped the goblin tail-first (549 verts in the head bin against
   116 at the snout). The nose flip is a 180° spin about the **dorsal** axis,
   never about local Y — spinning about anything else rolls the shark as it
   turns it, which was the Rev 14.1 bug.

### The headline measurement

The jaw bone exposed a single fact that explains most of the roster:

> **12 of the 15 `shark_bake.py` rigs were rendering BELLY-UP.**

`blueshark, bullhead, dogfish, greatwhite_cy, mako, megalodonrex,
scallopedhammer, smoothhound, thresher, tiger_nu, whaler, whitepointer` all
had their jaw *above* their head. `tigershark`, `smoothhammer` and
`textured_test` were upright. One split, most of the verdict.

Post-fix, all 16 jaw-bearing rigs satisfy both geometric gates (jaw below
head, head ahead of tail): **0 violations**, up from 12.

No per-model override table was needed. Every model resolves from measurement;
the resolver's `dorsalSource` / `noseSource` fields record which evidence
decided each one.

## Played gate

`hse/evidence/r15-orient/shoot.mjs` drives the **real game** (`index.html`,
`?unlockall=1`, service worker 404'd, `landscapePrimary`, CDP screenshots,
one page per row), selects each row through the real roster → DIVE → level
DIVE flow, then drives right / left / down for 1.5 s each.

**Why it does not reuse the r15-doc camera:** that shooter *moves the camera*
to wherever it measures the dorsal axis to be. That renders every model
plausibly regardless of its true orientation, so it structurally cannot
detect this bug. Here the silhouette pass renders the **live player rig** —
same heading, same facing flip, same bank — from a **fixed** side-on
orthographic camera.

The gate uses **two independent signals**, because neither alone is enough:

* **Nose — from the live rig's `headDot`.** The pixel nose test (thicker end =
  head) was tried first and is wrong on non-standard body plans: `sawshark`
  (long saw rostrum) and `thresher` (scythe caudal lobe) carry their mass at
  one end and their length at the other, so the girth test named the wrong end
  on both while `headDot` read +0.93/+0.96, i.e. correctly oriented. Rather
  than special-case those silhouettes, the gate uses the unambiguous signal.
  The pixel nose is still recorded per frame for corroboration, and is the
  fallback for `goblin`/`gulperfiend`, which have no bones to read.

* **Roll / belly-up — from the live rig's SKELETON, not from pixels.**

This second point is the important negative result of this lane, and it is
worth recording plainly: **belly-up is not reliably detectable in silhouette.**
A shark is close enough to symmetric top-to-bottom at gameplay scale that an
upside-down one still renders as a perfectly plausible shark. Four separate
pixel metrics were built and each failed to separate the broken build from
the fixed one on the same frames:

| metric | pre-fix | post-fix | verdict |
|---|---|---|---|
| up/down reach asymmetry (`asym`) | +0.029 | +0.028 | no signal |
| slenderness (height/length) | 0.507 | 0.507 | no signal |
| fin spikiness (max/mean reach) | 3.20 | 3.21 | no signal |
| fin-peak position (`finForward`) | mixed | mixed | inconsistent |

The **skeleton** is not ambiguous. `jawDot` = (head→jaw) · (rig local down)
must be positive, because the lower jaw hangs below the snout. Measured in
the running game on the same rows:

```
OLD  greatwhite right  jawDot=-0.9955      NEW  greatwhite right  jawDot=+0.9987
OLD  tiger      right  jawDot=-0.9991      NEW  tiger      right  jawDot=+0.9940
```

A clean ±1 separation. That is the roll gate.

PASS = nose faces the heading **and** `jawDot > 0`, in all three frames. On
the `down` drive the nose leaves the horizontal, so that frame gates roll only.

Deliverables: `hse/evidence/r15-orient/contact_sheet.png` (86 rows × 3 frames,
PASS/FAIL stamped) and `shots/report.json`.

### Result: 86 / 86 PASS

Every row: `jawDot` +0.98..+1.00 (jaw hangs down, no belly-up) and `headDot`
+0.87..+1.00 (head leads the heading). No per-row hacks and no per-model
override table were needed.

One gate caveat, recorded rather than papered over: **`gulperfiend`** fails the
*pixel* nose heuristic on the right/left frames. Its model (`anglerfish`) has
a bulbous globe head plus an illicium lure that adds length past the snout, so
"thicker end is the head" lands on the wrong side. Both silhouettes were
inspected by eye — driving right the teeth and lure face right, driving left
they face left — so the row is correctly oriented and the miss is the metric's,
not the shark's. `goblin`/`gulperfiend` are the only two rows with no
Head/LowerJaw/Tail bones, so they are the only two the bone gate cannot cover.

### Geometric before/after (the headline evidence)

Run `node --import ./tools/reg.mjs scratchpad/orient/cmp.mjs` against each
build. Measuring **raw geometry** (not `Box3.setFromObject`, which inflates Y
through the bone matrices — the same trap the Rev 14 note documents):

```
OLD: 12 of 15 baked rigs report  jawUP FAIL   (blueshark, bullhead, dogfish,
     greatwhite_cy, mako, megalodonrex, scallopedhammer, smoothhound,
     thresher, tiger_nu, whaler, whitepointer)
NEW:  0 of 29 models fail; all 29 are X-longest with jaw down.
```

All 86 roster rows map to jaw-bearing baked models, so **every player shark is
decided by the strong jaw signal**; the spike/skewness/girth fallbacks only
ever run for `goblin` and `gulperfiend`, whose models (`goblinshark`,
`anglerfish`) name their whole spine `Main1..Main6` and have no jaw bone.

### The nose test had to be rebuilt too (found by the played gate)

The first version of the resolver kept the old *max cross-section radius*
girth measure and it put `goblin` in the game swimming **backwards** — caught
by the played gate, not by any geometric check, because both ends of that
model are plausible-looking.

Radius is won by the **caudal fin**, whose lobes reach further from the spine
than a skull does, so it names the tail as the head. It produced
`girthBias = -0.0117` on goblinshark: two fin lobes, a meaningless margin, a
coin toss. (The old code papered over exactly this with
`key === 'goblinshark' ? true : ...`.)

The fix is **solidity**, not girth. A caudal fin is a thin vertical *sheet* —
tall in y, nearly flat in z — while a head is solid in both. So per bin take
`depth / height` and the genuinely three-dimensional end is the head:

```
goblinshark  depth/height   head bins 1-4: 1.48 1.54 1.50 1.49
                            tail bins 8-9: 0.23 0.07
```

An order of magnitude, not a coin toss. `girthBias` moves from **-0.0117** to
**+1.1503** and the flip corrects; `anglerfish` strengthens 0.16 → **+0.481**
with its verdict unchanged. Verified in the game: goblin now faces right when
driving right and left when driving left.

## Selftests

`art3d` **31/31 pass**. `game` 386/386. `fish`, `ui`, `meta`, `abilities` pass.

`world` reports one failure — `formation: aspect ratio after 5.0s reads as a
line/V, not a blob (1.93 > 2.0)`. This is **pre-existing and unrelated**:
reproduced 3/3 on the untouched backup and 3/3 on the new file, identical
numbers. It is a fish-schooling check (note the self-contradictory message —
`1.93 > 2.0` is false), and it only appears when `world` runs after other
targets. Not introduced by this lane.

## Note for the orchestrator

A concurrent lane copied a stale `shark3d.js` over this one mid-run and
hand-restored the resolver. Verified afterwards: the resolver block is
**byte-identical** to source, all four old laws are gone (`Rev 14 axis law`,
`rfDorsalAsym`, `rfNoseVolume`, `rollAngle` = 0 occurrences; the two
`NOSE_FLIP_KEYS` hits are references inside my own comments). Two cosmetic
deltas remain, both benign: `initialBox` is hoisted a few lines earlier
(same value, order irrelevant — the resolver only measures), and that lane
removed its own leftover `TEMP-PROBE force bronze` debug line.

## Follow-up: the 90-degree roll the jaw cue could not see

Reported by the coordinator against the live build, and correct: all 8 rows on
`mako_r15.glb` and `tiger_nu_r15.glb` (`mako, blue, duskfin, venomspine,
chronos, apollodon, zeusfin, tiger`) rendered **rolled 90 degrees** — plan
view, pectorals splayed top and bottom, dorsal pointing sideways. My own
`shots/mako_right.png` showed it and my gate still passed it.

**Why the gate was blind.** These two re-bakes are authored long-axis Z with
the dorsal on X (opposite polarity: mako -X, tiger +X), unlike every other
bake. After the long-axis rotation the jaw lands exactly ON the view axis, so
`(jaw - head)` came out `[0, -0.085, 0]` — *identical in form to a correct
rig*. Measured side by side:

```
mako          jaw-head = [0, -0.0851, 0]   (rolled 90 deg)
whitepointer  jaw-head = [0, -0.0718, 0]   (correct)
```

A single cue lying on the symmetry axis cannot resolve a 90-degree roll. The
jaw test is necessary but **not sufficient**, and I had treated it as
sufficient.

**The fix — a second, independent cue.** `orientLateralAxis()` uses the
**pectoral pair**, the one *paired* structure on the body: the hull reaches
about equally far both ways along the lateral axis, while the dorsal fin and
caudal lobes are one-sided. The dorsal axis must be perpendicular to it, so
when the two cues disagree the pectorals win — the disagreement only arises
when the jaw is on the roll axis, which is precisely where the jaw says
nothing, and the pectorals are never on the roll axis.

**Balance, not extent.** A raw max-extent version was tried first and is
wrong: it picks up the tall dorsal fin and caudal lobes and mis-flagged
`whitepointer`, `dogfish` and `thresher` — rows I had already verified correct
by eye. Measuring `min(reach+, reach-) / max(reach+, reach-)` about the band's
median centreline separates cleanly:

```
rolled   Ybal 0.95-1.00  vs  Zbal 0.28-0.46
correct  Ybal 0.16-0.45  vs  Zbal 0.81-1.00
```

A 0.12 margin is required, so a near-tie never overrides the jaw.

**Corrected exactly 4 models** — `mako`, `tiger_nu`, `megalodonrex`,
`textured_test` (the last two carry 0 roster rows) — with the opposite dorsal
polarity the BAKE notes describe (`mako +z`, `tiger_nu -z`). The other 25
models were left untouched.

**Gate hardening.** Two changes, because fixing the shark without fixing the
gate would leave the same blind spot:

1. `pectoralLateral` — the paired lateral spread must lie along screen DEPTH
   (local z), not screen height (local y). A `false` fails the frame as
   `ROLLED90`.
2. `jawUsable` — after the correction the dorsal sits on these models' local
   Z, which puts the jaw on local Y and drives `jawDot` to ~0. That is the cue
   being **silent, not failing**, so the gate now says `jaw n/a` and lets the
   pectoral test carry the roll verdict, instead of reading noise as a signal.

Controls (`reef`, `greatwhite`, `hammerhead`) re-run unchanged: `jawDot`
+0.99 `usable=True`, pectorals lateral.

### Re-verified: the hardened gate catches the bug it missed

The threshold was not chosen by eye. With the pectoral cross-check
deliberately disabled in the resolver (reproducing the exact reported bug),
the current gate scores:

```
mako   rolled-votes 3/3  -> ROW FAILS (ROLLED90)   [jawDot still read +0.99]
tiger  rolled-votes 3/3  -> ROW FAILS (ROLLED90)   [jawDot still read +0.99]
reef   rolled-votes 0/3  -> row passes
```

So the gate now fails the build it previously passed, which is the only test
of a gate that matters.

### One more gate correction: single-frame roll noise

The first hardened run failed `vortexa` (and earlier `thresher`) on the LEFT
frame alone, with the other two frames reading balZ ~1.0. A shark cannot be
rolled in one frame and upright in the next two. Across all 86 rows the right
and down frames never fall below balZ 0.67, while exactly **2 of 86** left
frames do (thresher 0.295, vortexa 0.345) — the left frame is measured through
the engine's 180-degree Y-spin, and a body banked mid-turn foreshortens the
pectoral band. Both were inspected and are correct profiles.

The roll verdict is therefore taken on a **majority of frames**. A genuine
roll is unanimous (3/3 above); a lone dissenting frame is reported as
`roll-noise(minority frame)` rather than failing the row. This is a
sensitivity fix, not a loosening: the 3/3 result above is unchanged by it.

**Final: 86/86 PASS.** Selftests `art3d` 31/31, `world` 379/379, `game`
386/386, `fish` 8/8. All 29 models X-longest, jaw-down, pectorals lateral.

## Per-row results

| # | row | model | jawDot (R/L/D) | headDot (R/L/D) | pect balZ (R/L/D) | verdict |
|---|-----|-------|----------------|-----------------|-------------------|---------|
| 1 | cookiecutter | smoothhound | 1.00/0.99/0.99 | 0.92/1.00/0.99 | 0.95/0.95/0.95 | PASS |
| 2 | epaulette | bullhead | 1.00/0.99/1.00 | 0.89/1.00/0.91 | 0.72/0.71/0.73 | PASS |
| 3 | reef | dogfish | 1.00/0.99/0.99 | 0.89/1.00/1.00 | 0.81/0.82/0.80 | PASS |
| 4 | blue | mako | 0.05/0.12/0.10 | 0.88/1.00/0.98 | 1.00/1.00/0.99 | PASS |
| 5 | mako | mako | -0.02/-0.02/-0.13 | 0.89/0.89/0.97 | 1.00/1.00/0.98 | PASS |
| 6 | hammerhead | smoothhammer | 1.00/0.99/1.00 | 0.88/1.00/0.98 | 0.67/0.67/0.67 | PASS |
| 7 | sawshark | thresher | 1.00/0.99/1.00 | 0.91/0.98/0.90 | 1.00/0.98/0.95 | PASS |
| 8 | thresher | thresher | 0.99/0.99/1.00 | 0.94/0.95/0.89 | 1.00/0.29/0.98 | PASS |
| 9 | bull | whaler | 1.00/1.00/0.98 | 0.96/0.94/0.97 | 0.90/0.90/0.93 | PASS |
| 10 | goblin | (by head) | --/--/-- | --/--/-- | 0.99/0.97/0.99 | PASS |
| 11 | tiger | tiger_nu | -0.10/-0.12/0.07 | 0.93/0.98/0.90 | 0.95/0.95/0.95 | PASS |
| 12 | greatwhite | greatwhite_cy | 1.00/0.99/1.00 | 0.88/0.88/0.90 | 0.99/0.98/0.99 | PASS |
| 13 | whaleshark | whitepointer | 0.99/0.99/0.99 | 0.99/0.95/0.98 | 1.00/1.00/0.99 | PASS |
| 14 | dunkleosteus | bullhead | 0.99/0.97/0.99 | 0.95/0.89/0.94 | 0.72/0.68/0.73 | PASS |
| 15 | greenland | whitepointer | 0.99/0.99/0.99 | 1.00/1.00/0.90 | 1.00/1.00/0.89 | PASS |
| 16 | megalodon | whitepointer | 1.00/1.00/1.00 | 0.88/0.88/0.88 | 1.00/0.99/0.99 | PASS |
| 17 | anglerfang | smoothhound | 1.00/1.00/1.00 | 0.90/0.89/0.90 | 0.95/0.95/0.96 | PASS |
| 18 | barbhook | thresher | 1.00/1.00/0.98 | 0.89/0.87/1.00 | 1.00/0.96/0.83 | PASS |
| 19 | coralcrown | whaler | 1.00/1.00/1.00 | 0.96/0.89/0.88 | 0.90/0.90/0.91 | PASS |
| 20 | duskfin | mako | 0.07/0.12/0.11 | 0.90/1.00/1.00 | 1.00/1.00/1.00 | PASS |
| 21 | gulperfiend | (by head) | --/--/-- | --/--/-- | 1.00/1.00/0.99 | PASS |
| 22 | morayne | thresher | 1.00/1.00/0.99 | 0.90/0.92/1.00 | 1.00/1.00/0.98 | PASS |
| 23 | sailfin | blueshark | 1.00/0.99/1.00 | 0.89/1.00/0.98 | 0.82/0.82/0.83 | PASS |
| 24 | snapjaw | tigershark | 0.99/1.00/0.99 | 1.00/0.91/0.86 | 1.00/1.00/0.97 | PASS |
| 25 | stonejaw | whaler | 1.00/1.00/1.00 | 0.91/0.99/0.93 | 0.90/0.87/0.90 | PASS |
| 26 | thornback | bullhead | 1.00/1.00/0.99 | 0.96/0.89/1.00 | 0.72/0.71/0.72 | PASS |
| 27 | abyssmaw | smoothhound | 1.00/1.00/0.99 | 0.91/0.88/0.99 | 0.95/0.94/0.97 | PASS |
| 28 | frostjaw | whitepointer | 0.99/0.99/0.99 | 1.00/0.99/0.97 | 1.00/1.00/0.99 | PASS |
| 29 | gloomtide | blueshark | 1.00/1.00/0.99 | 0.90/0.94/0.99 | 0.82/0.82/0.83 | PASS |
| 30 | howler | tigershark | 1.00/1.00/1.00 | 0.88/0.88/0.89 | 1.00/1.00/0.99 | PASS |
| 31 | magmaw | bullhead | 1.00/1.00/0.99 | 0.91/0.88/0.99 | 0.72/0.71/0.72 | PASS |
| 32 | riftjaw | whaler | 1.00/0.99/1.00 | 0.93/0.98/0.98 | 0.90/0.90/0.92 | PASS |
| 33 | stormfin | blueshark | 1.00/0.99/1.00 | 0.94/1.00/0.96 | 0.82/0.82/0.83 | PASS |
| 34 | venomspine | mako | -0.02/0.05/0.07 | 0.89/0.91/1.00 | 1.00/1.00/0.98 | PASS |
| 35 | vex | whitepointer | 0.99/1.00/1.00 | 0.99/0.88/0.95 | 1.00/1.00/0.99 | PASS |
| 36 | wreckfang | greatwhite_cy | 1.00/1.00/1.00 | 0.96/0.88/0.91 | 0.99/0.99/0.99 | PASS |
| 37 | bonecrown | greatwhite_cy | 1.00/0.99/1.00 | 0.89/0.99/0.90 | 0.99/0.99/0.99 | PASS |
| 38 | cindermaw | blueshark | 1.00/0.99/1.00 | 0.87/0.99/0.90 | 0.82/0.82/0.84 | PASS |
| 39 | glacier | whitepointer | 1.00/1.00/1.00 | 0.91/0.88/0.90 | 1.00/1.00/0.98 | PASS |
| 40 | gravewater | whitepointer | 1.00/1.00/0.99 | 0.90/0.95/1.00 | 1.00/0.99/0.99 | PASS |
| 41 | ironfin | greatwhite_cy | 1.00/1.00/1.00 | 0.93/0.97/0.98 | 0.99/0.99/0.99 | PASS |
| 42 | maelstrom | whitepointer | 1.00/1.00/0.99 | 0.91/0.92/1.00 | 1.00/1.00/0.99 | PASS |
| 43 | mirrorscale | whaler | 0.99/1.00/1.00 | 0.95/0.87/0.87 | 0.90/0.90/0.91 | PASS |
| 44 | nocturne | blueshark | 0.99/1.00/1.00 | 0.98/0.87/0.93 | 0.82/0.82/0.83 | PASS |
| 45 | plaguemaw | tigershark | 0.99/0.99/0.99 | 0.93/0.90/0.99 | 1.00/0.99/0.98 | PASS |
| 46 | sunspine | whitepointer | 1.00/1.00/1.00 | 0.91/0.97/0.98 | 1.00/1.00/0.99 | PASS |
| 47 | tempest | blueshark | 1.00/0.99/1.00 | 0.89/1.00/0.97 | 0.82/0.82/0.83 | PASS |
| 48 | teslafang | whitepointer | 0.99/1.00/0.99 | 1.00/0.93/0.99 | 1.00/0.98/0.98 | PASS |
| 49 | aurora | blueshark | 1.00/0.99/1.00 | 0.88/0.99/0.95 | 0.82/0.81/0.82 | PASS |
| 50 | banshee | whitepointer | 0.99/0.99/1.00 | 0.98/1.00/0.88 | 1.00/0.98/1.00 | PASS |
| 51 | chronos | mako | 0.02/0.10/0.11 | 0.87/0.98/1.00 | 1.00/1.00/1.00 | PASS |
| 52 | nullfin | greatwhite_cy | 1.00/0.99/1.00 | 0.87/0.98/0.91 | 0.99/0.99/0.99 | PASS |
| 53 | seismos | whitepointer | 1.00/1.00/1.00 | 0.93/0.87/0.88 | 1.00/0.95/0.99 | PASS |
| 54 | voltaicrex | whitepointer | 1.00/0.99/1.00 | 0.97/0.98/0.91 | 1.00/0.99/1.00 | PASS |
| 55 | vortexa | whitepointer | 0.99/0.93/1.00 | 1.00/1.00/0.87 | 1.00/0.34/0.95 | PASS |
| 56 | vulkan | whitepointer | 1.00/1.00/0.99 | 0.97/0.88/0.98 | 1.00/0.99/0.99 | PASS |
| 57 | absolutezero | tigershark | 1.00/1.00/0.99 | 0.88/0.89/0.95 | 1.00/0.99/0.98 | PASS |
| 58 | omenmaw | bullhead | 1.00/1.00/1.00 | 0.88/0.88/0.88 | 0.72/0.71/0.72 | PASS |
| 59 | solaris | whitepointer | 0.99/1.00/1.00 | 0.93/0.88/0.89 | 1.00/1.00/1.00 | PASS |
| 60 | warbringer | greatwhite_cy | 1.00/0.99/1.00 | 0.91/1.00/0.99 | 0.99/0.99/0.99 | PASS |
| 61 | leviathan_rex | greatwhite_cy | 1.00/0.99/1.00 | 1.00/0.92/0.91 | 0.99/0.92/0.99 | PASS |
| 62 | leviathanrex | greatwhite_cy | 0.99/1.00/1.00 | 1.00/0.99/0.96 | 0.99/0.98/0.99 | PASS |
| 63 | aphroditelure | bullhead | 1.00/1.00/1.00 | 0.88/0.90/0.96 | 0.72/0.71/0.73 | PASS |
| 64 | apollodon | mako | -0.02/0.10/0.12 | 0.89/0.93/0.99 | 1.00/1.00/1.00 | PASS |
| 65 | artemisstrike | whaler | 1.00/1.00/0.99 | 0.96/0.91/0.91 | 0.90/0.90/0.92 | PASS |
| 66 | dionysustide | whaler | 1.00/1.00/0.99 | 0.88/0.98/1.00 | 0.90/0.90/0.91 | PASS |
| 67 | hermesdart | whaler | 0.99/0.96/0.99 | 1.00/0.98/1.00 | 0.90/0.84/0.90 | PASS |
| 68 | poseidonrex | whitepointer | 0.99/1.00/0.99 | 0.99/0.87/0.94 | 1.00/0.99/1.00 | PASS |
| 69 | zeusfin | mako | 0.02/0.05/0.00 | 0.87/0.88/0.88 | 1.00/1.00/1.00 | PASS |
| 70 | aresrender | tigershark | 1.00/1.00/0.99 | 0.92/0.87/1.00 | 1.00/1.00/0.98 | PASS |
| 71 | athenajaw | scallopedhammer | 1.00/0.99/1.00 | 0.91/0.93/0.88 | 0.84/0.84/0.83 | PASS |
| 72 | hadesmaw | whitepointer | 1.00/1.00/0.99 | 0.92/0.94/0.99 | 1.00/0.99/0.98 | PASS |
| 73 | hephaestusforge | whitepointer | 0.99/0.99/0.99 | 0.99/0.97/0.98 | 1.00/0.94/0.99 | PASS |
| 74 | heracrown | whitepointer | 1.00/1.00/1.00 | 0.97/0.87/0.89 | 1.00/0.96/0.99 | PASS |
| 75 | chimerashark | thresher | 0.99/1.00/0.99 | 1.00/0.95/0.90 | 1.00/1.00/0.97 | PASS |
| 76 | cyclopseye | whaler | 1.00/1.00/0.99 | 0.88/0.88/0.97 | 0.90/0.91/0.91 | PASS |
| 77 | harpyshade | whitepointer | 1.00/1.00/1.00 | 0.90/0.91/0.97 | 1.00/0.99/1.00 | PASS |
| 78 | lamiacoil | thresher | 0.99/1.00/0.99 | 0.94/0.90/0.99 | 1.00/0.99/0.98 | PASS |
| 79 | medusagaze | bullhead | 1.00/1.00/1.00 | 0.88/0.88/0.90 | 0.72/0.71/0.72 | PASS |
| 80 | scyllarender | blueshark | 1.00/0.99/0.99 | 0.92/0.97/0.94 | 0.82/0.81/0.85 | PASS |
| 81 | cerberusjaw | tigershark | 1.00/1.00/1.00 | 0.88/0.91/0.96 | 1.00/1.00/0.99 | PASS |
| 82 | charybdisvoid | whitepointer | 1.00/1.00/1.00 | 0.90/0.87/0.88 | 1.00/0.97/0.99 | PASS |
| 83 | hydrafang | blueshark | 1.00/1.00/1.00 | 0.91/0.93/0.98 | 0.82/0.82/0.82 | PASS |
| 84 | kampechrono | whitepointer | 0.99/0.99/1.00 | 0.99/1.00/0.89 | 1.00/1.00/0.98 | PASS |
| 85 | minotaurram | whitepointer | 1.00/1.00/0.99 | 0.90/0.90/1.00 | 1.00/0.99/1.00 | PASS |
| 86 | typhonmaw | whitepointer | 0.99/0.99/1.00 | 0.99/0.98/0.99 | 1.00/1.00/0.99 | PASS |
