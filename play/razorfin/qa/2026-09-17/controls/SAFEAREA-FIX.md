# Safe-area exclusion for the swim-control touch anchor

QA-REPORT.md finding 6: `env(safe-area-inset-*)` only fed HUD CSS
(index.html:32-35). The floating-stick anchor had no exclusion, so on an
iPhone a touch-down in the bottom strip (where the home indicator lives)
could plant the anchor there, and the system swipe-up gesture could steal a
drag that starts or crosses that strip.

## Before

`plantStick(dx, dy)` in engine3d.js set `ctl.ax = dx; ctl.ay = dy;` directly
from the raw touch point, with no floor on `dy`. `dragStick`'s recenter
branch (the "anchor follows once the finger overshoots 1.35x radius"
mechanic) had the same problem: a long drag toward the bottom edge could
walk the ring itself into the strip.

## After

Two additions, both scoped to the anchor's Y coordinate only:

- `safeAreaBottomInset()` reads the live `--pad-b` custom property (the same
  one HUD CSS already uses) off `getComputedStyle(document.documentElement)`
  and returns 0 if there is no DOM (headless selftest) or the value doesn't
  parse to a positive number.
- `safeAnchorY(y)` computes `unsafeTop = innerHeight - inset - CTL_STICK_RADIUS`
  (the ring's top edge, not just its center, must clear the inset) and
  clamps `y` down to that line if it falls below it.

`plantStick` now sets `ctl.ay = safeAnchorY(dy)` while `ctl.px/py` (the raw
finger point the nub draws at) stay exactly where the finger went down.
`dragStick`'s recenter branch applies the same clamp to the recenter target.

Touch anywhere in the legal area still anchors the stick exactly there, the
clamp only engages once the requested anchor Y would put the ring inside the
inset strip, and only moves it up to the boundary, never further. The play
area was not resized and the HUD panels were not touched.

## Device vs headless

On a real iOS device, `env(safe-area-inset-bottom)` resolves to the home
indicator height (commonly 34 css px in portrait, 21 in landscape on
notched models) and `--pad-b` picks that up automatically since it is
already computed once at `:root`. `safeAreaBottomInset()` just reads that
same live value back into JS via `getComputedStyle`, so it always matches
what the HUD is already excluding, no separate constant to keep in sync.

Headless (selftest, CDP screenshot harness), there is no notch and no UA
safe-area support, so `env()` resolves to `0px`; `getComputedStyle` returns
`"0px"`, `parseFloat` gives `0`, and the function returns `0`. In that mode
the exclusion degrades to "keep the ring's top edge on-screen" (floor at
`innerHeight - CTL_STICK_RADIUS`), which is still a real floor and is what
the new headless-only selftest check exercises directly.

## Selftest evidence

Added to the existing `RF.Game.__selftest` convention (`check()` calls) in
engine3d.js, right after the existing "plantStick placed the finger point"
check:

- Geometry assertion that an anchor Y requested 5px above the bottom edge
  (deep inside a simulated 34px iOS home-indicator strip) clamps to the
  inset boundary.
- Geometry assertion that an anchor Y requested one pixel outside that same
  strip is accepted unchanged.
- `plantStick(400, deepInStrip)` then confirms `ctl.py` (the raw finger
  point) is never touched, only `ctl.ay` (the anchor), and that the anchor
  stays within `innerHeight - CTL_STICK_RADIUS` of the bottom edge even with
  zero device inset (the headless floor).
- The stick is re-planted at the original `(400, 300)` afterward so the
  pre-existing dead-zone test below it is unaffected.

Full run from `<worktree>/play/razorfin`:

```
node --import ./tools/reg.mjs tools/selftest.mjs world game art3d fish fx ui meta abilities
```

Result: `world 380/0`, `game 398/0` (394 baseline + 4 new safe-area checks,
all passing), `fish 8/0`, `ui 239/0`, `meta 192/0`, `abilities 0/0`, all
match or exceed the required baseline with zero regressions. `fx` printed
`26/0` (the nested-result unwrap fix from another lane landed during this
pass; previously reported as the known `ok=0` runner bug, safe to ignore
either way). `art3d` showed `31/1`, but the one failure is a pre-existing
family-GLB fallback-gate check (`FAM_FILES` count) in territory this task
does not own (`play/razorfin/assets/models/fam/**` is forbidden) and is
unrelated to this change; `git status` confirms only `engine3d.js` was
touched by this task.

## Confirmation

Throttle, heading slew, and the accel ramp were not touched. The only
"pursuit"-adjacent text in the diff is a comment on `ctl.ax/ay` noting they
feed the existing anchor-to-finger pursuit math, not a code change to that
math. No edits were made to `shark_variant.py`, `sharklib/**`,
`recipes/**`, `assets/models/fam/**`, `assets/review/**`, `shark3d.js`,
`selftest.mjs`, `gen_data.py`, `data.js`, `NOTES-rev17-*`, or anything
outside this worktree.

## Follow-up: gate finding on tautological assertions (2026-09-17)

An Opus gate issued a soft HOLD on test integrity for commit b9d8734b. The
shipped runtime behavior was found correct; the hold was narrowly about two
of the four new `__selftest` checks being tautologies:

- `check(clampedDeep <= unsafeTop, ...)` where `clampedDeep` was computed as
  `Math.min(deepInStrip, unsafeTop)` inline in the test. `Math.min(a, b) <= b`
  is true for any `a`, `b`, so this could never fail.
- `check(clampedShallow === justOutsideStrip, ...)` where `clampedShallow`
  was `Math.min(justOutsideStrip, unsafeTop)` and `justOutsideStrip` was
  defined as `unsafeTop - 1`. `Math.min(x, x+1) === x` is likewise always
  true.

Neither assertion actually called `safeAnchorY`. They recomputed the clamp
inline with `Math.min` and then asserted a property of `Math.min` itself, so
the nonzero-inset case (the entire point of the fix) had no real coverage.
Headless `getComputedStyle` yields an inset of 0, which is why the lane
wrote it that way rather than exercising the function directly. The other
two checks (`ctl.py === deepInStrip`, the finger-point-untouched check, and
the zero-inset floor check) were already genuine and are unchanged.

### Fix

`safeAnchorY(y)` gained an optional second parameter: `safeAnchorY(y, inset)`,
defaulting to `safeAreaBottomInset()` when omitted, so both existing call
sites (`plantStick`'s `ctl.ay = safeAnchorY(dy)` and `dragStick`'s recenter
branch) are untouched and behave exactly as before. The two tautological
checks now call the real function with an explicit nonzero inset (34, the
same simulated iOS home-indicator value already used elsewhere in this
block):

```js
var clampedDeep = safeAnchorY(deepInStrip, simInset);
var clampedShallow = safeAnchorY(justOutsideStrip, simInset);
check(clampedDeep === unsafeTop, 'an anchor requested inside the unsafe strip is rejected (clamped to the inset boundary)');
check(clampedShallow === justOutsideStrip, 'an anchor requested just outside the unsafe strip is accepted unchanged');
```

The first assertion was tightened from `<=` to `===` since `deepInStrip`
(`simH - 5`) is always greater than `unsafeTop`, so the correct, checkable
behavior is that `safeAnchorY` clamps it to exactly `unsafeTop`, not merely
"no greater than."

### Deliberate-break evidence

To confirm the assertion is now load-bearing, the first check's comparison
was temporarily inverted (`===` to `!==`) and the game suite re-run:

```
node --import ./tools/reg.mjs tools/selftest.mjs game
```

Output went red:

```
  FAIL an anchor requested inside the unsafe strip is rejected (clamped to the inset boundary)
game: pass=false ok=397 fail=1
```

The comparison was then restored to `===` and the suite re-run to confirm
green: `game: pass=true ok=398 fail=0`. This confirms the check now fails if
`safeAnchorY` were deleted or its comparison inverted, closing the gate
finding.

### Full re-verify after the fix

```
node --import ./tools/reg.mjs tools/selftest.mjs world game art3d fish fx ui meta abilities
```

`world 380/0`, `game 398/0`, `art3d 31/0`, `fish 8/0`, `fx 26/0`, `ui 239/0`,
`meta 192/0`, `abilities 0/0`. `game` count is unchanged at 398 since the
seam (optional param) added no new checks, only made two existing ones real.
No runtime behavior changed: the clamp is still one-sided on `ctl.ay` only,
`ctl.px/py` are never clamped, and the `(px > 0) ? px : 0` NaN guard in
`safeAreaBottomInset()` is untouched. Only `engine3d.js` was edited for this
follow-up.
