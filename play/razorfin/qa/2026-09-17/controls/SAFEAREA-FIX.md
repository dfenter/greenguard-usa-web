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

Touch anywhere in the legal area still anchors the stick exactly there — the
clamp only engages once the requested anchor Y would put the ring inside the
inset strip, and only moves it up to the boundary, never further. The play
area was not resized and the HUD panels were not touched.

## Device vs headless

On a real iOS device, `env(safe-area-inset-bottom)` resolves to the home
indicator height (commonly 34 css px in portrait, 21 in landscape on
notched models) and `--pad-b` picks that up automatically since it is
already computed once at `:root`. `safeAreaBottomInset()` just reads that
same live value back into JS via `getComputedStyle`, so it always matches
what the HUD is already excluding — no separate constant to keep in sync.

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
all passing), `fish 8/0`, `ui 239/0`, `meta 192/0`, `abilities 0/0` — all
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
