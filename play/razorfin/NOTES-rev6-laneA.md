# Rev 6 — Lane A (art/animation) notes

Scope: `shark3d.js` and `fish3d.js` only, per SPEC3D.md Rev 6 contracts
6.2 (state-bag consumption), 6.3 (carangiform swim), 6.5 (jaw/lunge), 6.9
(shark flash hook + fish upgrades). No other files touched.

## Root cause recap (why the old swim read as a "squirming worm")

- `bendK = 4.6/bodyLen` with envelope span `[0.05, 0.52]*bodyLen` put close to
  a full wavelength across nearly the whole body, with the smoothstep already
  saturated by mid-body. Rev 6 tightens both: `bendK = 7.5/bodyLen`, span
  `[0.10, 0.48]*bodyLen` — head+gills (u<0.10) rigid, envelope confined to the
  rear ~40%.
- `animate()` recomputed phase/amplitude purely from `speedFrac` every frame
  and ignored any engine-published tail kinematics — there was no way for
  Lane E's `vy`/`tailPhase`/`tailAmp` to ever reach the shark even after they
  existed, because nothing in shark3d.js read them. Now consumed with
  `Number.isFinite()` guards (`state.tailPhase`, `state.tailAmp` are
  AUTHORITY when finite; internal integrator is fallback only, so NPC/menu
  rigs that pass `undefined` still animate).
- Idle amplitude floor was 0.06 (visible squirm at rest); Rev 6 fallback is
  `0.015 + 0.32*speedFrac^1.3` — much calmer at rest, ramps in with real
  speed.
- Four oscillators (tail sweep, pect flutter, body roll, head counter-yaw,
  vertical bob) were all driven off the single shared `animation.phase`,
  phase-locking every shark and every fin on the same shark to each other.
  Rev 6 seeds each rig with `hash01(hashStringToInt(def.id)) * TAU`
  (`group.userData.rfBendSeed`) and offsets pect/roll/counter-yaw/bob by that
  seed (with different weights: bob is `phase+seed`, counter-yaw is
  `phase+seed*0.7`, pect fallback is `phase*0.55+seed`) so siblings visibly
  desync.
- Pitch was dead: `state.vy` was read but the engine never published a
  finite value, so `pitchTarget` was always 0. That's an engine-side (Lane E)
  gap, not a shark3d.js bug — the consumption code (`state.vy*0.0008` clamp
  ±0.22) was already correct and is unchanged in shape, just now actually
  reachable once Lane E ships `vy`.

## New/changed constants (shark3d.js)

| Name | Old | New | Where |
|---|---|---|---|
| `bendK` | `4.6/bodyLen` | `7.5/bodyLen` | `buildShark()` |
| `bendSpanX` | `0.05*bodyLen` | `0.10*bodyLen` | `buildShark()` |
| `bendSpanY` | `0.52*bodyLen` | `0.48*bodyLen` | `buildShark()` |
| idle fallback amp | `0.06 + 0.30*speedFrac^1.2` | `0.015 + 0.32*speedFrac^1.3` | `animate()` |
| body roll amp | `0.04` | `0.02` (seeded phase) | `animate()` |
| head counter-yaw amp | constant `0.05` | `0.012*speedFrac` (seeded phase) | `animate()` |
| jaw preyNear anticipation | `0.35*gape` | `0.85*gape` | `animate()` |
| jaw open ease | `dt*14` (shared with close) | `dt*10` | `animate()` |
| jaw close ease | `dt*14` | `dt*24`, with an 8%-undershoot-then-settle "overshoot" | `animate()` |
| bend material cache key suffix | `:rf-bend` | `:rf-bend2` | `bendableMaterial()` |

New: `uBendBias` uniform (float), `group.userData.rfBendSeed`,
`group.userData.rfFlash(color, dur, intensity)`, `group.userData.rfEnvelopeSamples`.

## Sign convention — pitch (6.3 item 4)

`state.vy` is sim px/s with **+y = DOWN** per 6.2. This rig computes
`pitchTarget = clamp(vy*0.0008, -0.22, 0.22)` and applies it as
`pose.rotation.z` in the rig's own unflipped, +x-forward local frame (before
`SHARK_POSE_YAW`/consumer yaw/flip are applied). In that local frame, a
positive `pose.rotation.z` reads nose-down — so **vy>0 (sinking) → nose-down
tilt**, which is correct for an unflipped/right-facing shark.

The rig does **not** attempt to un-mirror pitch for left-facing travel. The
existing `pose.rotation.y = Math.cos(group.rotation.y) < 0 ? -SHARK_POSE_YAW :
SHARK_POSE_YAW` flip only handles yaw, and Z-axis rotation does not
automatically invert under a Y-axis mirror the way X does — whether the
consumer's left-facing path (`flipX` / `group.rotation.y = PI`) makes a
sinking shark read nose-up instead of nose-down is exactly the interaction
the SPEC3D contract calls out as needing verification "on real GL". **This
was not visually verified in this pass** (headless BufferGeometry selftest
has no visual output) — flagged for the real-GL check mentioned in 6.3.
Quick way to check: spawn a left-facing NPC shark diving (`vy>0`), confirm
its nose visually tips down, not up.

## uBendBias (6.3 item 2)

`bendZ += uBendBias*bendT;` injected into the shared vertex chunk
immediately after the existing `bendZ` assignment and before
`transformed.z/y` are updated with it — order does not matter for a simple
additive term, but it is placed there to keep the diff minimal and the two
sources of `bendZ` visually adjacent in the shader string. **The `uBendBias`
GLSL declaration was added to the same `#include <common>` header replacement
as the other three uniforms** — this was called out as the single most
dangerous chargeable mistake in the assignment (a missing declaration would
silently compile-fail only on real GL, invisible to the headless selftest),
so the selftest's shader-injection check was extended to assert both the
declaration string (`uniform float uBendBias`) and the consumption string
(`bendZ+=uBendBias*bendT`) are present in the probed vertex shader text.

`uBendBias` is set from `turn*0.10`, eased at 8/s
(`animation.bendBias += (target - animation.bendBias) * clamp(dt*8,0,1)`),
mirrored into the CPU `bendOffset()` reference via its new optional 7th
`bias` parameter (default 0, so all existing callers are unaffected).
Oscillation amplitude (not bias) is separately scaled by
`turnOscBoost = 1 + 0.35*|turn|` and applied to `uBendAmp` — this multiplies
whichever amplitude source (engine `tailAmp` or internal fallback) is
authoritative that frame.

Program cache key bumped `:rf-bend` → `:rf-bend2` for the shark bend variant.
**`world3d.js`'s `:rf-bend-inst` instanced fish key was intentionally left
untouched** (out of scope, owned by Lane W) — I did not add `uBendBias` to
the instanced path since 6.9 says "eat/flash effects use pose-space
transforms and vertex color, not new GLSL", and the instanced consumer's own
contract is unaffected.

## Jaw / lunge (6.5)

- Anticipation gape target raised to `0.85*gape` (was `0.35*gape`), eased
  `dt*10` while opening.
- Snap-close (driven by `state.jawSnapT > 0`) now eases at `dt*24` toward a
  target that dips to `-0.08*gape` ("overshoot" past fully closed) before the
  `animation.jawOvershot` flag flips true and the target snaps back to `0`
  for the settle. This reads as a felt "chomp" rather than a linear close.
  Implementation detail: `animation.jawSnapping`/`animation.jawOvershot` are
  new per-rig animation-state fields; they reset correctly across repeated
  bite cycles (checked informally by the 120-sample tail-oscillation loop in
  the existing selftest, which cycles `jawSnapT` on/off every 47 frames).
- `pose.scale.x` pulses to `+0.07*speedFrac + lungeStretch`, where
  `lungeStretch` eases toward `1.06` at `dt*14` while `state.lungeT>0` and
  eases back to `0` at `dt*6` once it drops to `<=0` (slower release than
  the snap, per "ease back after" in the assignment). This is additive on
  top of the existing speed-based scale.x term, not a replacement.

## Frenzy flash hook (6.9)

`group.userData.rfFlash(color = 0xff2bd6, dur = 0.18, intensity = 1)`.
Implementation: captures `body.material.emissive`/`emissiveIntensity` once at
rig-build time as the restore baseline (safe because `bendableMaterial()`
already clones the material per-rig — mutating it here cannot bleed into the
shared `materialCache` or sibling sharks). Calling `rfFlash()` sets an
internal decay timer; `animate()` linearly fades `body.material.emissive`
from the flash color back to the captured baseline over `dur` seconds and
restores the exact baseline object/values at zero, so repeated or absent
calls never drift the material. No new shader variant — this is a plain
material-property mutation on the existing toon material, matching "vertex-
color flash... NO new shader variant" from the contract. Verified in the
selftest that the cache key stays `:rf-bend2` after a flash call.

Deviation: the contract phrasing allowed either "vertex-color flash" or
"material color/emissive... swap" — I implemented the emissive-swap path
(cheaper, fully reversible, no geometry/attribute changes) rather than a
per-vertex color lerp, since the body already carries baked vertex colors
for the pattern/countershading and mutating those in place would need to
snapshot and restore a full color buffer every flash. This is explicitly
allowed by the contract's own wording ("use material color/emissive **or**
vertex-color swap").

## Oscillator decoupling (6.3 item 3)

Per-def seed: `group.userData.rfBendSeed = hash01(hashStringToInt(def.id)) *
TAU`. `hash01()` only accepted numeric coordinates, so a small
`hashStringToInt()` (Java-style `h = h*31 + charCode`, wrapped to int32) was
added right after `hash01()` to fold `def.id` into a number first — this is
new, not present before Rev 6.

- Pect flutter: `state.pectPhase` when finite, else `animation.phase*0.55 +
  seed`.
- Bob: `Math.sin(time*TAU*1.15 + seed)`.
- Head counter-yaw: `Math.sin(animation.phase + seed*0.7 + PI*0.5) *
  (0.012*speedFrac)`.
- Body roll: `Math.sin(animation.phase + seed) * 0.02`.

Verified in the selftest that two different representative def ids produce
different pect-rotation and bob-position values at the same `t=1` sample.

## Selftest deviations from the literal assignment text (documented per instruction)

1. **Envelope sample points ("head u=0.2, mid u=0.45, tail u=0.9")** — under
   the actual Rev 6 span `[0.10, 0.48]*bodyLen` with a smoothstep envelope,
   `u=0.2` is already ~17% into the ramp (not in the rigid `<0.10` zone) and
   `u=0.45` sits at `bendT≈0.98`, essentially indistinguishable from the
   `u=0.9` tail sample (`bendT=1`) rather than `<25%` of it. Both literal
   readings are mathematically impossible to satisfy given the span numbers
   in the same contract — not a bug in shark3d.js. I resampled at **head
   u=0.05** (genuinely inside the rigid zone, asserted `<1e-4*bodyLen`), **mid
   u=0.2** (`bendT≈0.17`, i.e. actually `<25%` of the tail sample), and kept
   **tail u=0.9**. Implemented in `auditSharkShapeContracts()`, loudly
   commented at the call site.
2. **Phase-ramp tolerance amplitude formula** — the existing selftest's phase-
   continuity check used the *old* `0.06 + 0.30*speed^1.2` amplitude formula
   purely as an error-tolerance band scaler (not a phase assertion itself).
   Updated to the new `0.015 + 0.32*speed^1.3` to match the actual fallback
   curve; the phase-rate integration itself (`2.2..8.5 Hz` accumulator) is
   unchanged by Rev 6 and continues to pass with the same tolerance shape.
3. **Bend program cache key suffix** — updated the two hard assertions
   (`endsWith(':rf-bend')` in the per-sample loop and the shader-probe check)
   to `':rf-bend2'`, deliberately, per the contract's own instruction to bump
   the key.

All of the above are called out inline in shark3d.js with `Rev 6` comments
at the exact line changed.

## fish3d.js changes

- **Pectoral fin pair**: one double-sided triangle per side (`+8` tris total:
  4 tris/side including front+back faces from `appendDoubleSidedTriangle`),
  authored as a shallow downward-swept sliver near mid-body
  (`pectRootX = bodyLength*0.08` back to `pectTipX = bodyLength*(-0.06 -
  tier*0.006)`). Verified triangle counts stayed well under `TRIANGLE_LIMIT
  220` (106 base → 114 with the new fins across all 12 palette ids, checked
  directly with a throwaway script before committing to the change).
  `geometry.userData.rfLoft.pectoralFinPair`/`pectoralTriangles` added and
  asserted in `__selftestFish()`.
- **Palette saturation pass**: `mackerel`, `swordfish`, `grouper`,
  `anglerprey`, `abyssal`, `leviathanprey` were the lowest-saturation rows
  (HSL S 24-57%). Pushed bases up and pulled accents toward the cyberpunk
  palette (`0x27e0ff` cyan for the two cool open-water fish, `0x9dff2b` acid
  green for the murky angler prey, `0xff9526` warm amber-adjacent for
  grouper) while preserving each species' hue family and belly/accent
  contrast so the read (cool mackerel/swordfish vs warm grouper vs murky
  deep-water angler/abyssal/leviathan prey) is unchanged.
  `minnow`/`reeffish`/`parrot`/`tuna`/`dolphinfish`/`marlin` were already
  ≥60% saturated and left untouched.
- **Per-instance bend amp doubling for panic (6.5)** — this write itself
  lives entirely in `world3d.js` (Lane W territory: `batch.amp.setX(i, ...)`
  and the `panicT`/`FLEE_BURST` logic are all there, and there is currently
  no doubling call site wired up yet — panic amp doubling is still pending
  Lane W's work per the contract's "Lane W suction/panic" note in 6.5). I
  could not add or verify a live 2x call path without editing world3d.js,
  which is out of file-ownership bounds. Instead, added a sanity check in
  `__selftestFish()` that this module's own `FISH_BEND_UNIFORM_DEFAULTS.
  uBendAmp` (0.08, the same number world3d.js's `batch.amp.setX(i, 0.08)`
  currently hardcodes) doubles to a peak lateral displacement that stays
  under 40% of a typical fish body length — i.e., confirms the *base number
  this lane owns* would not read as a runaway wobble if/when Lane W wires
  doubling in. This is a bounds check on the constant, not a live
  integration test of world3d's actual (not-yet-written) doubling code.

## Test results

```
node --import ./tools/reg.mjs tools/selftest.mjs art3d fish
art3d: pass=true ok=24 fail=0
fish: pass=true ok=6 fail=0
```

`world`/`game` selftests were run for breakage per instructions. Both showed
pre-existing failures **entirely inside `world3d.js`/`engine3d.js`**, none of
which reference `shark3d.js` or `fish3d.js`:

- `world`: intermittently threw `ReferenceError: spawnBuffAt is not defined`
  at `world3d.js:3725` (a powerup-spawn call with no matching function
  definition anywhere in that file — a 6.7 powerup-lifecycle gap, Lane E/W
  territory, rng-gated so it does not reproduce every run).
- `game`: `engine3d.js` camera-framing assertions (`camZForLen` clamp scale,
  `CAM_FRAME_TAN2`, per-tier framing fraction bands, sub-dead-zone control
  creep) — all 6.1/6.8 contract items owned by Lane E, currently
  mid-implementation. `sub-dead-zone deflection does not creep` reproduced
  consistently; the four camera-framing fails were seen on one run and not
  the next (rng/dt-timing sensitive).

Neither failure set touches anything this lane owns or changed. Not fixed
here — out of file-ownership bounds (`shark3d.js`/`fish3d.js` only).

## Not done / explicitly out of scope

- Did not touch `world3d.js`'s NPC `rigState` (it does not yet set
  `vy`/`preyNear`/`lungeT`/`tailPhase`/`tailAmp`/`pectPhase` — this rig reads
  them all via `Number.isFinite()` guards so NPCs continue to animate on the
  internal fallback path unchanged until Lane E/W wire those fields through).
- Did not implement the actual panic-amp-doubling write path (world3d.js,
  Lane W) — see above.
- Did not attempt a real-GL visual verification of the pitch sign/flip
  interaction (headless environment) — flagged above for the owner's
  real-device check.

## Rev 6 fix pass (Lane A-fix, 2026-08-21) — pitch sign inversion + stray line

Scope for this pass: `shark3d.js` only (fish3d.js needed no changes). Two
defects reported from evidence screenshots: (1) shark pitched nose-down
~40deg+ while reported stationary (`vx=vy=0` for >1.2s), far beyond the
±0.22 rad (~12.6deg) pitch clamp; (2) a thin stray line/degenerate-geometry
artifact running from the nose off-frame during a close eat pass.

### Root cause: pitch sign was inverted (confirms the flagged-unverified risk)

The prior pass's own note above ("this was not visually verified... flagged
for the real-GL check") named exactly the bug. Headless repro (build a rig,
drive `animate()` through idle -> held dive -> release, sample the world-
space nose-to-tail vector via `parts.body.localToWorld`):

- Idle (`vy=turn=bank=0`): `pose.rotation.z` (the pitch var) correctly eased
  to exactly 0 and the rig read level. **The pitch mechanism itself was not
  broken at rest** — this ruled out "wrong axis" or "compounded rotation
  through the 0.42 pose yaw" as the root cause; the yaw/bank composition was
  verified numerically to be correct and unrelated to this defect.
- Held dive (`vy=250`, sim +y=DOWN): the nose read **UP** in world space
  (should read DOWN). Verified for BOTH facings (`group.rotation.y=0` and
  `=PI`) — identical wrong direction both ways, which rules out a mirror-
  asymmetry bug and confirms a flat sign error independent of facing.
- The line `pose.rotation.z = animation.pitch;` was wrong: a rotation about
  local +Z (right-hand rule) tips local +X (nose) toward local +Y, which is
  "up" in the rig's own unflipped frame — exactly backwards for a sinking
  shark. The prior pass's inline comment asserting "positive rotation.z
  reads nose-down" was the mistaken premise carried into the previous
  pitch-sign implementation.
- **Fix**: `pose.rotation.z = -animation.pitch;` (one-line sign flip). Axis
  and the ±0.22 rad clamp magnitude are unchanged. Re-verified headlessly:
  idle settles level (within 1deg), held dive now pitches nose-down at the
  correct, clamped magnitude, release-to-idle returns to level, for both
  facings.
- The screenshots' actual on-screen tilt was mostly a SEPARATE, correct
  behavior that looked like a bug: the evidence harness's `tp()` teleport
  helper zeroes `p.vx`/`p.vy` but not `p.angle` (heading persists from the
  prior drag) — `engine3d.js` (out of this lane's ownership) sets the
  group's z-rotation from `p.angle` every frame regardless of speed. A shark
  that dove steeply and then had its position teleported still points the
  way it was last driven, which is expected sim behavior, not a pitch bug.
  The inverted pitch sign made this worse by fighting the heading in the
  wrong direction instead of resting flat against it.

### Stray line artifact: confirmed as a side effect of the pitch bug, not a separate geometry defect

Extensive static audit of every polygon/prism generator that sits near the
head (mouth line, gill bands, teeth, jaw, jaw teeth, eye/brow, dorsal fin)
found no degenerate indices, self-intersecting fans, or out-of-envelope
vertices — all are small, closed, locally-bounded polygons unrelated to the
bend program (the mouth region sits inside the bend's flat/rigid zone,
`bendT=0`, confirmed via `bendOffset()` at the nose x-value). A live-browser
sweep through the full bite-open -> snap-close-overshoot cycle (`bitePhase`
0->1, then `jawSnapT` active) on a tier-5 jawed shark (`greatwhite`), at 6
sampled frames across 90, showed no stray geometry at any point.

Re-running the ORIGINAL evidence harness's exact sequence (`evidence.mjs`,
unmodified) against the fixed `shark3d.js`: `09-eat-chase.png` no longer
shows the stray line at all (checked at full res and a tight crop of the
region it previously occupied). `05-shelf.png`/`08-abyss.png` still show a
steep heading (expected — see the `tp()` note above, an engine3d.js/harness
concern, not this lane's). This is consistent with the stray line having
been a perspective/foreshortening artifact of the previous ~40deg+ wrong-
signed pitch putting some already-thin, normally-edge-on feature (most
likely the mouth-line or a gill-band prism, both authored with a very thin
z-extrusion) into a much more extreme, nearly-edge-on camera angle than any
in-contract pitch ever produces — not a separate degenerate-mesh bug. No
geometry change was needed or made for this defect; it resolved as a
consequence of the pitch-sign fix.

### Selftest additions

Added a stationary/dive/release pitch gate to `__selftest()` (per-sampled-
def, both facings): idle settles level within 5deg, a held `vy=250` dive
pitches nose-down (not up) and stays within the clamp plus a small margin,
and release-to-idle returns level within 5deg. This is the assert the
original Rev 6 pass could not add without a real-GL check; it now catches
the exact sign regression headlessly (it failed immediately, in the
expected direction, before the sign fix landed) and is deliberately
non-tautological: it reads a world-space vector via `Object3D.localToWorld`
through the full `group -> pose -> body` chain, not the raw `animation.pitch`
scalar, so it exercises the same composition the real renderer uses.

### Verification

```
node --import ./tools/reg.mjs tools/selftest.mjs art3d fish game
art3d: pass=true ok=24 fail=0
fish: pass=true ok=6 fail=0
game: pass=true ok=194 fail=0
```

Real browser (headless Chrome, 844x390 @DPR3, `?unlockall=1`): idle-no-input
shot is level; drag-dive-hold shot pitches down moderately, matching the
heading, with no excess tilt; release shot returns level; a spawned-prey
chase pass with visible jaw gape shows no stray line. Re-ran the unmodified
`evidence.mjs` sequence end to end — `09-eat-chase.png` clean, no console
errors.

### Not done / explicitly out of scope for this pass

- Did not touch the evidence harness's `tp()` (stale `p.angle` on teleport)
  or `engine3d.js`'s `renderPlayer` heading/bank application — both out of
  `shark3d.js`/`fish3d.js` file-ownership bounds for this lane.
- Did not re-audit the double bank application (`engine3d.js` sets
  `g.rotation.x` from `a.bank` on the outer group, AND `shark3d.js` sets
  `pose.rotation.x` from the same `state.bank` on the inner pose) — numerically
  bounded at roughly 8deg combined for a full `BANK_MAX=0.18` turn, well
  short of the reported ~40deg symptom, so it was not the reported defect's
  cause; flagging it here since it is still two owners writing a bank-shaped
  rotation from the same source value, which is worth a cross-lane look but

---

# Rev 6 fix-round 2 (2026-08-21, post-Luna-review) — Lane A2

Scope per SPEC3D.md 6.11 ART BAR + `reviews/art_out.md`: hero recut of Reef
Shark (CRITICAL 1), swim personality tuning (MINOR), frenzy arc spectacle hook
(CRITICAL 4 support), prey value differentiation (MAJOR 5). Files touched:
`shark3d.js`, `fish3d.js`, `data.js` (palette hex values only, same schema).

## Item 1 — hero recut + cyberpunk palette

- **Reef Shark palette**: `base` 0x7d8fa0 (grayish steel-blue, HSV sat 0.22) ->
  0x152548 (dark indigo, sat ~0.62); `belly` 0xdfe8ee -> 0xa8f5f0 (luminous
  pale cyan); `accent` 0x4b6070 -> 0xff2be0 (hot magenta). glow stays 0 per
  the contract ("give it a non-glow accent identity") — its menace now comes
  entirely from the lit iris/brow treatment below plus the saturated body
  blocks, not from an emissive.
- Same saturation-boost treatment applied to the other 15 low-saturation
  Act-1 sharks the review's "generic gray fish" complaint covers (tiers 1-6:
  epaulette, cookiecutter, mako, blue, hammerhead, thresher, sawshark, tiger,
  bull, goblin, greatwhite, whaleshark, megalodon, dunkleosteus, greenland) —
  each got a distinct dark-jewel-tone base + bright belly + one saturated
  cyberpunk accent (magenta/cyan/acid-orange/acid-green), keeping per-def hue
  families apart so the existing distinctness selftest gate stays green.
  Verified via the roster distinctness signature in `__selftest()` (still
  passes; `minimumDistance` did not regress).
- **Leviathan Rex** (tier-12 ceiling) was also drab (base HSV sat 0.25, a dull
  olive-teal) despite being Act 3 with a glow; repalette to a near-black teal
  base (0x0c1a18), pale cyan-green belly (0x9de8d8), and an acid-green accent
  (0x9dff2b) so its pectorals/flank stripes read electric rather than
  swamp-green. `glow` (0x9ffcf0) left as authored.
- **Eye**: radius doubled (`0.08/0.095 -> 0.16/0.185 * radiusY`for
  skull/other heads) — checked against the shape-contract ceiling
  (`eyeRadius/bodyLen <= girth*0.085`), which has ~2.8x headroom at Reef's
  girth, so this is comfortably inside budget across the roster (selftest
  sweep confirms). Act-1 sharks (glow:0) previously got a near-black iris
  (`lerpColor(base, 0x06111c, 0.8)`) that read as a dead socket at gameplay
  scale; now uses a lit accent color (`liftColorToLuminance(accent, 0.55)`) so
  every shark, glow or not, reads a bright living eye.
  - **Iris/catchlight repositioning** (caught by zoomed screenshot review,
    fixed same session): the iris's pre-existing 0.18-eyeRadius forward
    offset and 0.58/0.28 xy/z flattening were tuned for the old half-size eye;
    at 2x eyeRadius the same *proportional* offset is 2x the absolute
    distance, and the flattened disc viewed at the gameplay 3/4 angle read as
    a smeared pink blob pushed to the socket's front edge, not a pupil.
    Recentered (offset 0.18->0.05) and rounded (z scale 0.28->0.34).
- **Brow**: same doubling-without-retuning bug hit the brow's vertical offset
  (`eyeY + eyeRadius*1.42`) — also caught by the zoomed screenshot, not the
  headless selftest (no gate constrains the brow-to-eye gap). At the new 2x
  eyeRadius this floated the accent-lit brow ridge visibly clear of the
  eyeball instead of reading as an attached ridge. Halved the coefficient
  (1.42 -> 0.71, kaiju's +0.16 -> +0.08) to restore the same relative gap at
  the larger scale. Also gave the brow a lit-accent color at every act (was
  act>=3 only) so the "aggressive brow ridge" reads even on glow:0 sharks.
  **Lesson for future eye-radius changes**: every OTHER feature offset
  written as `eyeRadius * K` (brow, iris, catchlight, eye ring) scales
  proportionally and must be re-checked by eye, not just by the headless
  gate, since no selftest assertion pins the brow-to-eye or iris-to-socket
  gap in absolute terms.
- **Mouth line**: thickened (vertical extent 0.05/0.08/0.16 -> 0.09/0.14/0.24
  `*radiusY`) and extruded deeper (0.025 -> 0.05 `*radiusZ`), darkened
  (0x071017 -> 0x040a10). Tier-1 sharks (Reef, Epaulette, Cookiecutter), which
  never get tooth/jaw geometry per the original SPEC's `tier<2` gate, now also
  get a small dark underbite wedge (`tier1 jaw shadow wedge`, near+far) tucked
  under the mouth line so the jaw silhouette reads committed at rest even
  without teeth. This is new geometry, not a change to the `tier<2` early-
  return contract itself.
- **Gill slits**: widened (0.010L -> 0.018L) and extruded deeper (0.035rz ->
  0.06rz). The shape-contract gate only pins `gillXRange` (start/end
  position, `+0.28..+0.38*bodyLen`), not width/height/depth, so this was free
  to change; verified the gate's exact-position assertions still pass.
- **Hammerhead T-bar**: was colored `palette.base` (identical to the body
  dorsal color), so it visually fused into the silhouette instead of reading
  as a distinct cephalofoil. Recolored to a lit accent + added a thin dark
  leading-edge box so the outline separates from the body even head-on.
  **Known remaining limitation**: even with this fix, hammerhead's silhouette
  does not read as strongly "hammer-shaped" as it should at gameplay distance
  — the T-bar's Z-axis orientation foreshortens badly at the 6.1 framing
  contract's ~9.6deg camera tilt and pose yaw. A real fix likely needs a
  wider/flatter T-bar profile or a different attach angle, which risks the
  bulky-head overlap/axis gates (`hammer` is not in `BULKY_HEADS`) and was
  judged out of scope for this pass's time budget; flagging for a future
  silhouette-focused round.
- Tris after all of the above: reef 1398, tiger 1630, hammerhead 1666,
  leviathanrex 2790 (worst case in the full 61-shark sweep) — all comfortably
  under the 3500/shark cap.

## Item 2 — swim personality (art MINOR)

Tuned amplitude/secondary-motion constants only; `bendK=7.5/bodyLen`, span
`[0.10,0.48]*bodyLen`, and the tailPhase/tailAmp authority contract (6.2) are
untouched, per the binding 6.3 envelope.

- Tail sweep amplitude: `0.38 + 0.30*speedFrac` -> `0.42 + 0.34*speedFrac` rad.
- Idle fallback amplitude (internal integrator only, overridden by engine
  tailPhase/tailAmp when finite): `0.015 + 0.32*speedFrac^1.3` ->
  `0.018 + 0.38*speedFrac^1.3`.
- Pectoral flutter response: `0.045 + speedFrac*0.09` -> `0.05 + speedFrac*0.11`.
- Body roll: `0.02` -> `0.028` amplitude (still phase+seed only, not
  speed-scaled — head stays rigid via the separate, untouched
  `rfHeadCounterYaw` term).
- Both `__selftest()`'s `fullTailSweep` probe and its ramp-phase tolerance
  amplitude formula mirror these two production constants literally by
  design (documented inline at each site) — this is why they needed
  deliberate updates rather than being left alone; the selftest is checking
  the SAME numbers the animate() function actually uses, not independent
  expected values.

## Item 3 — spectacle hooks: rfArcs (art CRITICAL 4 support)

Added `group.userData.rfArcs(on, color)`, a guarded rig method in the same
style as the existing `rfFlash` hook (engine3d.js already calls `rfFlash` via
`rig.userData.rfFlash` inside a try/catch — `rfArcs` follows the identical
"call if present" pattern for engine3d/fx3d to wire up frenzy state).

- 3 pooled ribbon meshes (`RF frenzy arcs` group, hidden by default so it
  never affects `buildShark`'s one-time world-scale bbox computation) orbit
  the rig at different rates/phases when active, using ONE shared
  `BufferGeometry` (a bowed 5-segment quad strip, 10 tris) and one shared
  `MeshBasicMaterial` template (each rig clones it so siblings can show
  different tints) with additive blending — no new GLSL/shader variant, per
  the contract.
- Triangle cost: 3 ribbons x 10 tris = 30 tris total when visible, verified
  by a new `countTriangles(arcGroup)` selftest assertion (`1..60` range) —
  under the `<=60 tris total` budget named in the task. NOTE: `countTriangles`
  traverses regardless of `.visible`, so these 30 tris are ALWAYS counted in
  every shark's tri budget (visible or not) — factored into the 3500/shark
  ceiling check above.
- Also strengthened the existing 6.5 lunge-stretch pulse (1.06 -> 1.11,
  ease-in 14/s -> 18/s) and added an anticipation "coil" on `state.preyNear`
  (a small negative `pose.scale.x` pinch, distinct from the always-positive
  lunge stretch, so the shark visibly loads up before it lunges). Verified
  the existing pose-contract selftest (`pose.scale.x > 1` at
  `speedFrac:1,turn:1,preyNear:true`) still holds — the coil pinch is small
  (0.035 max) against a much larger positive base at that sample point.

## Item 4 — fish3d.js prey value differentiation (art MAJOR 5)

- Added `valueBoostFor(score)` (log-scaled 0..1 over the roster's score range
  5..420) and `brightenAccent()` (HSL saturation/lightness lift, hue
  untouched) in `fish3d.js`. `paletteFor(id, score)` now brightens each
  species' accent by its value boost before geometry construction uses it in
  every downstream site (body countershading, tail fan, dorsal sliver,
  pectoral fins) — so higher-score prey reads a visibly brighter/more
  saturated accent than lower-score prey of the same species family.
  Exposed as `geometry.userData.rfFishValueBoost` for a future consumer.
- New selftest block in `__selftestFish()`: walks the score-ordered chain
  (minnow 5 -> ... -> leviathanprey 420) and asserts the boost is
  monotonically non-decreasing, plus floor/ceiling checks (minnow < 0.05,
  leviathanprey > 0.9).
- **Golden-frenzy glow tint**: deliberately NOT implemented as a fish3d.js
  hook. The existing mechanism (`ent._tint` / `ent._goldenPackId`, set in
  `engine3d.js`'s `frenzyGoldenRoll`) already handles this at the
  consumer/material level in engine3d.js/world3d.js, both out of this lane's
  ownership. fish3d.js's contract is geometry + vertex-color palette only (no
  material/emissive creation lives here — `buildFishMaterialSpec()` only
  declares bend uniforms) so there is no fish3d-side hook to extend; the task
  wording "if hook exists" is satisfied by confirming the existing engine/
  world hook and leaving it alone rather than fabricating a parallel one.

## Verification

```
node --import ./tools/reg.mjs tools/selftest.mjs art3d fish game
art3d: pass=true ok=28 fail=0
fish: pass=true ok=7 fail=0
game: pass=true ok=198 fail=0
```

Full suite (`world game art3d fish fx ui meta abilities`) also green; the only
non-green result during this session (`ui: pass=false ok=148 fail=1`,
"hudState retains no reference to the pushed object") was a transient
`ReferenceError: root is not defined` in `ui3d.js:441` from a concurrent
lane's in-progress edit, confirmed fixed and re-verified before relying on
the browser harness — not caused by, or fixed in, this lane's files.

Real browser (headless Chrome, port 8937, 844x390 @DPR3, `?unlockall=1`,
selecting via `.rf-card[data-shark="id"]` + `#rfDive` DOM clicks — mouse-
coordinate clicks on the DIVE button were unreliable and produced false
"same shark" captures in an earlier pass of this session, since fixed by
switching to direct element `.click()`): captured reef, tiger, hammerhead,
and leviathanrex at gameplay scale and in profile-swim framing.

- **Reef**: strong pass. Dark indigo dorsal into pale cyan belly with hot
  magenta fins reads unmistakably cyberpunk at gameplay distance, a clear
  improvement over the prior gray/tan "1981 Atari" read. Gill slits and
  mouth line are now visible as distinct dark marks at gameplay scale (a
  zoomed crop confirms individual eye/iris/brow/gill features are correctly
  shaped, not just present in code).
- **Tiger**: strong pass — green/orange striping plus visible tooth row read
  clearly even at distance.
- **Hammerhead**: palette/eye/gill improvements carry over, but the T-bar
  silhouette itself remains the weakest of the four (see "known remaining
  limitation" above).
- **Leviathan Rex**: palette pass improved the flank/pectoral saturation
  (was swamp-green, now carries visible acid-green). Silhouette still reads
  as a spike-crowned round mass rather than a sleek apex predator at a
  near-head-on camera angle — this is inherent to the kaiju body shape at
  that specific angle, not a new regression; a lateral profile shot (forced
  via a teleport + sustained lateral drag, since the natural camera angle at
  rest is closer to head-on) shows a much stronger read: visible spike
  crown, jaw teeth, and eye.

## Not done / explicitly out of scope for this pass

- Did not reshape the `hammer` head's cephalofoil geometry itself (would need
  a wider/flatter profile or different attach angle to read at gameplay
  distance) — flagged above as a follow-on, not attempted given the
  bulky-head gate risk and time budget.
- Did not touch the cavern/rock geometry, HUD/CSS, or ability effects
  (CRITICAL 2/3/5, MAJOR 1/2/3/6 in the art review) — all out of
  `shark3d.js`/`fish3d.js` ownership.
- Did not extend `rfArcs`'s actual trigger wiring into engine3d.js/fx3d.js
  (the guarded call site) — per the task's own framing ("engine/fx call
  these if present"), that wiring belongs to Lane E/F, not this lane.
  is not this fix's scope.
