# Rev 7 Lane S1 notes (engine3d.js)

Scope per SPEC3D Rev 7 7.1/7.3/7.6/7.7 and plan D1/D3. File owned: engine3d.js only.

## 1. Controls (SPEC 7.1) — head-drag world-target steering

Replaced the floating-stick model (old `plantStick`/`dragStick`/`stepControl` at
the old line numbers cited in the task, `STICK_R_CSS`/`STICK_RECENTER`/`STICK_DEAD`)
with SPEC 7.1's head-drag world-target law:

- New scratch: `WT_VEC`/`WT_RAY`/`WT_PLANE`/`WT_HIT` (one `THREE.Raycaster` +
  `THREE.Plane(z=0)` + two `Vector3`s, reused every call). `cssToWorld(cssX, cssY,
  outX, outY)` unprojects a CSS point through the LIVE camera into world coords
  each fixed step (camera-zoom/pulse safe), writing into pre-allocated `{v}`
  output objects (`WT_OUT_X`/`WT_OUT_Y`) — no per-call allocation.
- `p.ctl` schema changed: removed `sx/sy/bx/by`; added `px/py` (live finger CSS
  point), `tx/ty` (last resolved world target), `hasTarget` (bool). `mag` is now
  the SPEC 7.1 normalized head→finger distance fraction, not stick deflection.
- Kept the function names `buildStick`/`paintStick`/`plantStick`/`dragStick`/
  `clearStick` so `bindInput()`, teardown, and all call sites are untouched —
  only the mechanic underneath moved. The DOM stick ring+nub became a single
  small cosmetic dot (marks the finger, not a joystick).
- `stepControl(p)`: resolves the world target (pointer via `cssToWorld`, with a
  same-frame `hasTarget` fallback to the last resolved `tx/ty` when no
  camera/renderer exists — this is what makes the mechanic headless-testable
  without a real GL context); keyboard is a virtual target `CTL_KEY_TARGET_CSS`
  (220 css px) along the key direction, merged (averaged) with an active drag,
  not only when idle. Heading eases toward `atan2(dy,dx)` at
  `turnRate = 10 + 6*clamp(distCss/240,0,1)` rad/s (constants `CTL_TURN_BASE`/
  `CTL_TURN_DIST`), never snaps. Speed is `mag = clamp((distCss-DEAD)/(FULL-DEAD),
  0,1)` with `DEAD = max(18, 0.4*headRcss)` (`CTL_DEAD_CSS_MIN`/
  `CTL_DEAD_HEADR_MULT`) and `FULL = 180` css px (`CTL_FULL_CSS`). Velocity
  approaches `want = speedCap*mag` at `ACCEL = 8*speedCap` (`CTL_ACCEL_MULT`,
  spec floor is "`>= 8*speedCap`"); on release/arrival it decays with an
  exponential glide, tau `CTL_GLIDE_TAU = 0.18s`, snapped to exactly 0 only once
  it's under 0.05 px/s (never a hard zero on the arrival/release step itself).
- Kept verbatim: second-pointer boost (`ctl.boostId`), keyboard merge, double-tap
  superpower (`checkDoubleTap`/`firePower`, untouched), the OVERDRIVE
  accel/brake exception (still HM's exact accel-clamp/brake path, now driven off
  the head-drag `want` vector instead of the old stick-derived one), and
  `ctl.turnIn` as a presentation-only signal (now the eased heading delta this
  step, same normalization as before, feeds bank/tail/pose only).
- Airborne exception preserved: `stepControl` never writes `p.vy` while
  `p.y < 0`; gravity owns it exclusively in `stepMotion`.

### Deviation flagged
World-units-per-CSS-px (`wpp`) is derived from the LIVE camera dolly
(`CAM_Z`/`CAM_FOV`/`CSS_H`) rather than through an actual `camera.project()`
round-trip for the keyboard target and the dead-zone conversion (`headRcss`).
This is a flat-perspective approximation (correct at the gameplay plane z=0,
where the pointer path's real `cssToWorld` always resolves through the true
camera) — it only approximates for the keyboard virtual-target distance and the
head-radius-to-CSS conversion used for the dead zone. Given the camera always
looks at z=0 with a fixed FOV (SPEC 6.1/7.1's "lookAt z=0 always" law), the
approximation is exact at the gameplay plane and only drifts with the small
pitch/bob offsets already in the camera contract — accepted as negligible for
the dead-zone/keyboard-target purpose. Flagging per instructions since it is not
a literal camera-matrix unprojection for those two paths (the pointer path IS
a literal `Raycaster`/`Plane` unprojection).

## 2. Popups (SPEC 7.3) — glyph atlas

Replaced `paintPop`'s per-eat canvas 2D re-bake + `texture.needsUpdate` with:

- `buildPopAtlas()`: bakes a `POP_GLYPHS = '0123456789+x. '` alphabet (digits,
  `+`, `x`, `.`, space — the full alphabet ever produced by `scorePopup`'s only
  call site, `'+' + Math.round(...)`; `x`/`.` kept for forward compatibility)
  in 2 rows (normal / big weight) onto ONE canvas, ONCE, at init (called lazily
  from `buildPopPool`). Sets `texture.needsUpdate = true` exactly once, at bake
  time, and never again.
- `buildPopPool(n)` now builds `n` pool items, each a fixed row of
  `POP_MAX_CHARS` (8) pooled `THREE.Sprite` glyph quads sharing ONE
  `SpriteMaterial`/texture (cloned per-glyph only for independent opacity), all
  created at init.
- `scorePopup(wx, wy, str, big)` writes per-glyph UV offsets via a
  geometry-attribute write (`uv.setXY` + `uv.needsUpdate = true` — a
  BufferAttribute flag, NOT `texture.needsUpdate`) on a lazily-cloned
  per-sprite geometry, and toggles `sprite.visible`. Zero canvas 2D calls and
  zero texture re-upload at eat time, matching the 7.3 gate.
- `teardownPops()` disposes only the per-glyph geometry clones/materials it
  owns; the shared atlas texture is a persistent init-time cache (parallel to
  shark3d's geometry cache pattern) and is intentionally NOT disposed on
  teardown — only rebuilt if `popAtlas` is null.
- Visual look preserved: same font stack/weights/sizes/outline/fill colors as
  the old `paintPop`, just baked into fixed atlas cells instead of re-rendered
  per string. Pop pool sizing (`buildPopPool(8)`) and pop lifetime/rise/fade in
  `stepPops` are unchanged.

## 3. hitStop tuning

`multiBite`'s chew feedback: 40 → 25 ms. `swallow`'s eat feedback: 40/60 → 25/45
ms (the `mealT >= p.tier - 1` branch is 45, else 25). The unrelated damage-hurt
`hitStop(60)` in `hurt()` (line ~2120, player takes damage, not an eat) was left
alone — task 3 scoped the EAT hitStop values only, per SPEC 7.3 and plan D3.

## 4. swallow() tint

Already correct in the file before this pass: `swallow()` reads
`(e.def && e.def.tint) || 0xffe9a8`. No code change needed; added two selftest
assertions (fallback color when `def.tint` is absent, and that `def.tint` is
used when S3's data.js supplies it) since none existed.

## 5. Relic/gem hooks (SPEC 7.6)

- `ctx.run` gains `relics: []` and `gems: 0` at `buildContext()`.
- `eatEligible()` excludes `kind === 'relic'` and `kind === 'gempickup'` (added
  to the existing pickup/buffpickup exclusion line).
- `stepEat()`'s per-entity loop: `kind === 'relic'` → `collectRelic(e)`;
  `kind === 'gempickup'` → `collectGemPickup(e)`; both `continue` before the
  tier-based eat gate, mirroring the existing `pickup`/`buffpickup` branches.
- `collectRelic(e)`: pushes `{zoneId, relicId, x, y, t}` into `ctx.run.relics`
  (defaulting `zoneId`/`relicId` to `null` if S2/data.js haven't supplied them
  yet), fires a toast + ring/motes FX, calls `RF.World.kill(e, 'collected')` if
  present else marks `e.active = false` directly.
- `collectGemPickup(e)`: `ctx.run.gems += num(e.value, num(e.gemValue, 1))`
  (defaults to `+1` if S3's data hasn't wired a value field yet), fires a chip
  + FX, same kill/fallback pattern.
- Both paths are fully guarded per the task brief: no field on `e` throws, no
  `RF.World`/`RF.Fx`/`RF.UI` throws (all existing `uiCall`/`fxEmit`/`sfx`/
  `warnOnce` wrappers reused).

## 6. __selftest() updates

- Removed the now-false stick assertions (radius clamp, 1.35x re-center,
  sx/sy-based dead zone/partial-deflection probes) — none reference the deleted
  `ctl.sx/sy/bx/by` fields or `STICK_R_CSS`/`STICK_RECENTER`/`STICK_DEAD` any more
  (grepped clean).
- New control-law checks per SPEC 7.1's selftest bullet: heading never changes
  more than `turnRate*dt` in a single step (direct `stepControl` loop toward a
  180°-opposite target, asserts `worstTurn <= (CTL_TURN_BASE+CTL_TURN_DIST)*STEP`);
  speed is monotone in `distCss` (a near target settles at a lower, non-zero
  speed than a far target); release leaves `|v|` decaying, not a same-step
  hard zero, then settles to rest with no post-rest drift.
- New popup atlas checks: `glyphIndex` mapping + fallback-to-space;
  `buildPopAtlas()` no-ops safely without `document`; a fake-document bake
  proves `texture.needsUpdate` is written to `true` at bake and — via an
  instrumented setter installed AFTER the bake — exactly ZERO further writes
  happen across `buildPopPool` + 3 `scorePopup` calls + `stepPops`.
- New relic/gem accounting checks: `ctx.run.relics`/`gems` initialize empty;
  a fake `kind:'relic'` entity is collected into `ctx.run.relics` with its
  `relicId` intact and removed via `World.kill(e,'collected')`;
  `eatEligible` rejects `kind:'relic'`; a fake `kind:'gempickup'` entity adds
  its `value` to `ctx.run.gems` and is removed the same way; a value-less
  gempickup defaults to `+1`; `eatEligible` rejects `kind:'gempickup'`.

## Contract deviations (flagged)

- The `wpp` (world-units-per-CSS-px) approximation described in section 1 —
  used only for the keyboard virtual target and the dead-zone `headRcss`
  conversion, not for the pointer path itself, which does a real
  `Raycaster`/`Plane` unprojection every step.
- `CTL_ACCEL_MULT = 8` implements the spec's `ACCEL >= 8*speedCap/s` floor as
  exactly `8*speedCap` (the literal minimum named in 7.1), not a larger value —
  flagging in case playtesting wants headroom above the floor.
- No other deviations. SPEC3D.md was not edited (no tuned numbers required
  correction from what shipped in this pass); 7.1/7.3/7.6 numbers were
  implemented as written.

## Verification

- `node --import ./tools/reg.mjs tools/selftest.mjs game` → `pass=true ok=228
  fail=0`.
- `node --import ./tools/reg.mjs tools/selftest.mjs world game art3d fish fx ui
  meta abilities`:
  - `world: pass=true ok=186 fail=0`
  - `game: pass=true ok=228 fail=0`
  - `art3d: pass=false ok=0 fail=0`
  - `fish: pass=false ok=0 fail=0`
  - `fx: pass=true ok=0 fail=0`
  - `ui: pass=true ok=174 fail=0`
  - `meta: pass=true ok=159 fail=0`
  - `abilities: pass=true ok=0 fail=0`

  `art3d`/`fish` were verified PRE-EXISTING failures unrelated to this lane:
  `git stash` (reverting ALL working-tree changes, including this lane's) still
  shows `art3d: pass=true ok=28` / `fish: pass=true ok=7` — but with the OTHER
  lanes' in-progress edits present (shark3d.js/fish3d.js/fx3d.js/data.js are
  mid-flight from S3/S5/L1/L2 per `git status`), `art3d`/`fish` fail at `ok=0`
  regardless of whether engine3d.js is stashed or not. Not owned by S1; noted
  per instructions, not fixed.

## Open risks

- The head-drag `hasTarget` same-frame fallback (reuse last `tx/ty` when
  `cssToWorld` fails, e.g. no live renderer) means a genuinely stale target
  from BEFORE `clearStick()`/pointer-up could theoretically linger for one
  frame if a caller sets `ctl.active=true` without ever calling
  `plantStick`/`dragStick` first. In practice `bindInput()`'s real pointer path
  always calls `plantStick` before any `stepControl` runs, so this is a
  headless-testing affordance, not a live-input gap — but worth a second look
  once L1/L2 land and a live-device pass is possible.
- `CTL_TURN_DIST`/`CTL_TURN_BASE`/`CTL_FULL_CSS`/`CTL_ACCEL_MULT`/
  `CTL_GLIDE_TAU` are SPEC-literal starting values; they have NOT been played
  on a real device this pass (no live renderer available in this sandbox). Dan's
  "finger always drags the head" bar should be re-verified in a played probe
  before sign-off, per the plan's non-negotiable played-probes note.
- Did not touch shark3d.js/fish3d.js/data.js/meta.js/ui3d.js/fx3d.js/world3d.js
  — those are other lanes' in-flight work per `git status`. This lane's
  engine3d.js changes are self-consistent against the CURRENT (in-progress)
  state of `RF.World`/`RF.Art3D`/`RF.Fx`/`RF.UI` guards (all calls remain
  try/catch-guarded exactly as before), so no cross-lane break is expected, but
  a full integration re-run once all lanes land is still needed.
