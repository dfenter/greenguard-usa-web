# Rev 15 lane JAW — idle jaw cycle, bite cycle, eat-feedback sync

Owned and edited: `hse/rig_morph.js`, `hse/face_textured.js`, and the
jaw/bite/eat-feedback region of `engine3d.js` only. `shark3d.js` is the SWIM
lane's file — the two lines this lane needs there are written up under
**For the orchestrator** and are NOT mine to land.

Evidence: `hse/evidence/r15-jaw/` (traces, PNG plots, frame strips).
Probe: `hse/evidence/r15-jaw/jaw_trace.mjs`. Gate:
`hse/evidence/r15-jaw/jaw_gate.py`.

Selftests: `node --experimental-loader ./tools/three-hook.mjs tools/selftest.mjs`
(the bare `node tools/selftest.mjs` in the brief cannot resolve the bare
specifier `three`; the repo ships the resolve hook for exactly this).

## The verdict, and what the probe actually found

> "the sharks with open jaws never shut them" / "eating animations need cleanup"

Reproduced first, in the real game, before touching anything. `jaw_trace.mjs`
drives the player into a school and records the LowerJaw's local-X euler per
simulated frame. On the pre-fix tree, reef over a 15 s run:

    deg range 26.00 .. 26.00     distinct values: 1
    preyNear true on 6 frames, deg on those frames: 26.00

**The jaw was not failing to close. It was not moving at all.** A frozen 26.00
degree yawn, held for every frame of the run including the frames where the
engine believed a bite was in progress. That single number is the owner's
verdict.

### Why — three writers on one bone, and a dead signal

1. **`commitRestGape()` baked the open pose into the bone and left it there.**
   It hinged LowerJaw ~26 deg and returned. shark3d.js then captured *that*
   as `baseJawQuaternion` and every frame did
   `quaternion.copy(base); rotateX(+gape * JAW_MAX_ROTATION)` — i.e. it added
   the runtime gape ON TOP of an already-open rest pose. The jaw's floor was
   26 deg and no input could ever bring it below that. This is the direct
   mechanical cause of "never shut them".

2. **`shark3d.js` re-adds a rest floor that a zeroed constant does not remove.**
   `jawRestGape = clamp(JAW_REST_GAPE + face.gape, 0.20, 0.35)` — with
   `JAW_REST_GAPE = 0` the **0.20 floor survives**, and the gape is then
   `jawRestGape + bite * (1 - jawRestGape)`, so the runtime gape is confined
   to **[0.20, 1.0]**. 0-2% close is unreachable by construction, whatever the
   engine asks for.

3. **The engine's jaw curve was computed and then thrown away.** `stepAnim()`
   maintained `a.jaw` (anticipation, snap, overshoot — the whole Rev 6 curve)
   but **never published it**. The rig state bag carried `bitePhase` and
   `jawSnapT` but not `jawOpen`, and shark3d's `animate()` reads
   `input.jawOpen`. It got `undefined`, took 0, and the rendered gape collapsed
   to the constant rest gape. `a.jaw` had been dead code.

Any one of these alone would have frozen the jaw. All three were live.

## What changed

### `hse/rig_morph.js` — the gape authority

- `commitRestGape()` now captures the **closed base quaternion before it
  hinges**, and publishes `rigRoot.userData.rfJawAuthority`: the bone name,
  hinge axis, closed base quaternion, and the signed full-open travel. It still
  hinges the bone, because `face_textured.js` has to author the lip line, tooth
  seats and cavity against the POSED mouth — that ordering is load-bearing and
  documented at its call site — but the open pose is no longer the pose the
  bone is *left* in.
- New `writeJawGape(rigRoot, gape01)` — **THE single gape authority**. It
  writes the LowerJaw quaternion from the closed base plus an angle, absolute
  and idempotent: calling it twice in a frame is harmless, and calling it with
  0 always produces a shut mouth regardless of what ran before. This is what
  the brief asks for, and it is what makes the double-apply class of bug
  impossible rather than merely absent.

### `hse/face_textured.js` — hand the jaw back closed

After the face batch is built and bound, the bone is restored to the closed
base via `writeJawGape(rigRoot, 0)`. The batch keeps the vertices it authored
against the open pose — they are skinned to the bone, so they follow it shut
and open again correctly. This is the line that stops shark3d capturing an
open `baseJawQuaternion`, and it is why the rendered rest jaw drops from a
26 deg yawn to a breathing 12-18%.

### `engine3d.js` — the idle + bite cycle, and close-frame feedback

The eased `a.jaw` blend is replaced by an explicit envelope over **normalized**
gape (0 shut, 1 wide — normalized rather than radians because the real hinge
travel differs per bake and is measured per row by `applyRestGape`):

    JAW_REST 0.15   JAW_BREATHE_HZ 0.6   JAW_BREATHE_AMP 0.04
    JAW_BITE_OPEN 0.35   JAW_BITE_CLOSE 0.01
    JAW_T_OPEN 60ms  JAW_T_CLOSE 90ms  JAW_T_HOLD 80ms  JAW_T_BACK 200ms

- **Idle** is the rest gape plus a 0.6 Hz, +-4% breathing oscillation — the
  brief's 12-18% band, and a jaw that visibly lives rather than a frozen pose.
- **Bite** is a four-segment state machine on `p.st.biteCycle`, smoothstepped
  inside each segment so the snap still reads as a snap while the frame-to-frame
  delta stays bounded.
- **Retriggering mid-cycle restarts from the CURRENT angle** (`bc.from`), not
  from 0, so chomping through a school reads as continuous chewing with no pop.
- `st.jawOpen = a.jawGape` is the line whose absence was defect (3).
- `st.biting` is latched to the OPEN segment so the sharky toon base's real
  `Swim_Bite` clip starts on the *same frame* as the procedural bone cycle,
  instead of firing a beat later off the old `jawSnapT`/`bitePhase` signals.

**Eat feedback moved to the CLOSE frame.** Contact and chomp are not the same
instant. The sim still resolves the eat at contact — the tier gate, score,
combo and `World.kill` have to happen now or the run desyncs — but hit-stop,
the shockwave, the chroma flash, the score popup, the camera pulse and the
speedline burst are the player's read of *the jaw shutting*, and firing them at
contact is why the feedback felt detached. They are recorded on the impact by
`triggerBite()` and dispatched by `fireBiteClose()` on the one frame the cycle
finishes closing. The deathBurst/motes/gib particles stay at contact — those
read as the prey coming apart, which does happen when the teeth reach it.

Several fish swallowed inside one cycle **merge into one chomp beat** at the
strongest meal's intensity rather than queueing, because queueing them would
machine-gun hit-stop — the exact failure the `chewFxCd` cooldown exists to
prevent elsewhere.

## For the orchestrator — the ONE thing to merge

**Two lines in `shark3d.js` (SWIM lane's file, not mine).** The lane fix above
is complete and correct on my side, but the rendered gape is still squeezed by
shark3d's own rest floor. Both lines are in `animate()`:

    // ~3419  the eased blend smears the 60/90 ms envelope into mush AND
    //        forces bite to 1 whenever biteWant latches, overriding the cycle
    animation.bite += ((biteWant ? 1 : clamp(finite(input.jawOpen, 0), 0, 1))
                        - animation.bite) * biteEase;
    // becomes
    animation.bite = clamp(finite(input.jawOpen, 0), 0, 1);

    // ~3425  jawRestGape floors at 0.20, so the runtime gape is confined to
    //        [0.20, 1.0] and 0-2% close is unreachable however hard the
    //        engine asks for it
    const jawGape = jawBone ? jawRestGape + animation.bite * (1 - jawRestGape) : 0;
    // becomes
    const jawGape = jawBone ? animation.bite : 0;

Rationale: with `writeJawGape` as the single authority and `face_textured`
handing the bone back CLOSED, the engine's `jawOpen` is already an absolute
0..1 gape spanning shut to wide. shark3d re-deriving a floor on top of it is
the last remaining second writer. `biteWant` keeps its job — it still latches
the sharky `Swim_Bite` clip — it just no longer drives the bone.

**Measured with those two lines applied** (they were applied locally to take
the evidence, and reverted; see Reproduce):

    reef   idle band 1.66 - 5.32 deg, bite peak 11.51, close -2.52
           jawOpen signal: idle 0.112-0.189, peak 0.350, close 0.010
           23/23 eats closed within 150 ms, 22/22 returned to the idle band
           idle oscillation present, no frame-to-frame jump > 12 deg

Without them the same trace reads `deg 5.32 .. 11.47` — alive, but never
shutting, because 0.20 * the row's travel is the floor.

## Evidence

`hse/evidence/r15-jaw/`

    jaw_trace.mjs     the probe (drives the real game, samples per FIXED STEP)
    jaw_gate.py       the gate + PNG angle-trace plots
    jaw_strip.mjs     12-frame bite strips
    <shark>.json      per-row traces
    trace_<shark>.png angle plots, eat events marked
    strip_<shark>/    12-frame bite cycle

### A probe note worth keeping: rAF sampling lied

The first working version of this probe sampled from `requestAnimationFrame`
and reported a jaw **stuck open** across most eats. It was not. Headless Chrome
throttles rAF hard — measured **2.8 fps, with gaps up to 1.4 s** — which
aliases a 60/90 ms envelope down to a single sample per bite, and that sample
usually lands on the open segment. The trace was wrong, not the jaw.

The probe now wraps `rig.animate()` and samples once per **simulated fixed
step**, which is the clock the cycle actually advances on (and which hit-stop
deliberately freezes). That took the trace from 59 samples / 2.8 fps to
**1040 samples / 60 fps**, and the cycle resolved immediately. Any future jaw
or eat-timing probe in this repo should sample the fixed step, not rAF.

## Selftests

    world: pass=true ok=379 fail=0
    game:  pass=true ok=394 fail=0

Up from 386 game checks: **8 new jaw assertions**, and three pre-existing
checks rewritten because they encoded the OLD contract —

- `jaw closes after the bite window` asserted `a.jaw < 0.02` at rest. A shark
  at rest now holds a breathing 12-18% gape, so this asserted precisely the
  frozen-jaw model this pass removed. Replaced by an idle-band check plus an
  explicit **oscillation** check (a frozen jaw parked dead centre would satisfy
  a range check alone — that is how the original defect went unnoticed).
- `eat hit-stop is 15 or 45 ms` and `staged eatShockwave fires ...` both called
  `swallow()` and asserted immediately. Those beats now fire on the CLOSE
  frame, so the harness steps the cycle forward via a new `runBiteToClose()`
  helper. Both now ALSO assert the beat does **not** fire at contact, which is
  the new guarantee and was previously untestable.

## Gate results — PASS

`python3 hse/evidence/r15-jaw/jaw_gate.py hse/evidence/r15-jaw`

    reef          PASS  eats 31  closed 31/31  returned 28/28
                        idle band  1.62 .. 5.32 deg   range -2.52 .. 11.51
                        650 idle frames, oscillation SD 1.24
    greatwhite    PASS  eats  1  closed  1/1   returned  1/1
                        idle band  0.32 .. 3.40 deg   range -3.92 .. 10.11
    mako          PASS  eats  3  closed  3/3   returned  2/2
                        idle band -1.35 .. 1.73 deg   range -5.59 ..  8.44
    leviathanrex  PASS  eats  2  closed  2/2   returned  2/2
                        idle band  0.21 .. 3.43 deg   range -3.92 .. 10.11
    GATE PASS

Every gate the brief asked for:

- **open-close-rest per eat** — yes, **37/37** eats across the four rows.
- **closed within 150 ms of the eat event** — yes, 37/37.
- **returns to rest** — yes, **33/33** scored. An eat RETRIGGERED before its
  cycle can finish is excluded from that count by design (see below), and the
  last eat of every burst is still scored, so a jaw that never came back would
  still be caught.
- **idle oscillation present** — yes, all four rows, SD 1.06-1.24 deg over
  271-1096 idle frames.
- **no frame-to-frame jump > 12 deg except the snap** — yes, **zero**
  violations on any row.

### Two gate bugs found by disagreeing with the jaw, and fixed

Both would have failed a jaw that was behaving exactly as specified, and both
are the same mistake: measuring a burst as if it were a single bite.

1. **The 150 ms close deadline ran from the FIRST eat of a burst.** reef showed
   one "not closed" eat at t=20150. The trace says otherwise: a second eat
   landed at t=20267 while the jaw was mid-close, and the cycle correctly
   blended from its current 3.33 deg back up to open rather than snapping —
   which is the no-pop retrigger the brief asks for — then closed fully to
   -2.52 at t=20417. The close was real; it was just deferred by the retrigger.
   The deadline now runs from the LAST eat of the burst.
2. **"Returned to rest" was scored against the idle band's midpoint.** With a
   breathing oscillation the jaw legitimately settles anywhere inside the band,
   so a perfectly good return that landed at 4.8 against a 2.4 mean scored as a
   failure. It is now scored against the BAND.

### A sampling trap: the idle window

The feeder fires a bite every 900 ms and a cycle is ~430 ms, so a fed run
leaves almost no idle frames — reef first came back with **8 idle samples out
of 224**, from which the gate cannot characterise a breathing band at all, and
the rest estimate became a coin flip on how the samples happened to land.

The probe now reserves a **bite-free idle window at the start of every run**,
and the gate refuses to score a band from fewer than 25 idle frames rather than
guessing. reef went from 8 idle frames to **650**.

### A wrong conclusion I published mid-pass, and the correction

An earlier cut of these notes reported greatwhite as **NOJAW — "the bake ships
no LowerJaw bone, pre-existing whitepointer HOLD"**. That was wrong, and it is
worth recording because it was a *probe* bug wearing the costume of a *rig*
finding.

The trace genuinely showed `deg: null` on all 883 frames, and greatwhite really
does resolve to the `whitepointer` bake, which really is the family
`seatConfidence` holds. Those two facts fitted each other so neatly that I
wrote the gate a NOJAW verdict around them.

The strip probe then rendered the same row and read **real angles off a real
`LowerJaw`** (-3.7 .. 8.85). The difference was that the strip probe looks the
bone up per frame while the trace probe resolved it **once, at hook time** —
and on a textured row the GLB can still be loading then. A bone captured as
null at that moment stayed null for the whole run.

Fixed by re-resolving until found. greatwhite now traces
**-3.92 .. 10.11 deg over 12 eats and PASSES the gate on its own merits.** The
NOJAW branch is left in `jaw_gate.py` because a row with genuinely no jaw bone
is still a state that must not be laundered into a green tick — but no shipping
row currently takes it.

The lesson worth keeping: a null reading that has a *plausible* explanation is
the most dangerous kind, because the explanation stops the investigation. Two
independent probes disagreeing is what caught it.

## Reproduce

    # 1. the two shark3d.js lines under "For the orchestrator" must be applied
    #    (they were applied to take this evidence, then reverted - shark3d.js
    #     is the SWIM lane's file and this lane does not land changes there)

    node --experimental-loader ./tools/three-hook.mjs tools/selftest.mjs

    PORTOFF=7 SHARKS=reef,greatwhite,mako,leviathanrex SECS=26 \
      node hse/evidence/r15-jaw/jaw_trace.mjs
    python3 hse/evidence/r15-jaw/jaw_gate.py hse/evidence/r15-jaw
    PORTOFF=11 node hse/evidence/r15-jaw/jaw_strip.mjs

Each probe binds its own port; pass `PORTOFF` if a previous run left one held
(an EADDRINUSE aborts the run and silently leaves the PREVIOUS traces in place,
which reads as "the fix changed nothing" — it cost this lane a cycle).

## State of the tree from this lane

Edited and KEPT: `hse/rig_morph.js`, `hse/face_textured.js`, the jaw/bite/
eat-feedback region of `engine3d.js`, plus `hse/evidence/r15-jaw/*` and this
file.

`shark3d.js` is **reverted to as-found** — the two lines this lane needs there
are documented above for the orchestrator, not landed. `world3d.js` and the
rest of `shark3d.js` show in `git status` from other lanes working
concurrently; none of that is mine.
