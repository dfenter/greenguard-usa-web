# Fix lane F1 (engine3d.js) — Rev 7 REVIEW-REV7 rework

Owns: `engine3d.js` and this notes file only. Scope: the engine3d half of
blockers 1, 2, 5, 6, 7, 8 from `REVIEW-REV7.md`, plus the engine3d items in
the Minors section. No other file touched.

## Blocker 1 — missions never connected to a run

- `startRun()` now calls `RF.Meta.rollMissions(profile, ctx.rng)` right after
  `buildContext()`, guarded (`RF.Meta && RF.Meta.rollMissions && profile &&
  profile.missions`) so a missing Meta lane or a raw pre-normalize profile
  degrades to "no active missions" instead of throwing. Passes `ctx.rng`
  (the run-seeded mulberry32) so mission selection is reproducible per S3's
  documented contract.
- Added a single `missionEvent(type, payload)` wrapper (near `uiCall`) that
  every producer below calls through: guarded against absent
  `RF.Meta.missionEvent`, and on any completed id it forwards
  `<mission name> complete!` to `RF.UI.missionTick` (per
  NOTES-rev7-laneS4.md's `RF.UI.missionTick(text)` export) via the existing
  queued-toast/chip channel — no new persistent UI element created from the
  engine side.
- `'eat'` event: `swallow()` calls `missionEvent('eat', { defId: e.defId })`
  right after the score/coin/xp accounting.
- `'score'` event: same call site, `missionEvent('score', { score:
  ctx.run.score })` — cheap, since eat is the only place score changes;
  `missionEvent`'s score progress is `max()`'d per S3's contract so this is
  equivalent to a dedicated score-change hook.
- `'relic'` event: `collectRelic()` calls `missionEvent('relic', { zoneId:
  ... })` before the relic FX/toast.
- `'zoneTime'` event: `stepZoneName(p)` (already called once per fixed step
  from `step()`) now accumulates seconds-in-zone into a module-scratch map
  (`zoneTimeAcc`, keyed by zone id, reset once per `startRun`) and reports
  `missionEvent('zoneTime', { zoneId, seconds })` at most once per second
  (gated on `ctx.time.now - zoneTimeReportAt >= 1`), not once per fixed step
  — matches the review's explicit "once a second is fine, not per step".
- `ctx.run.missionResults` is now initialized to `[]` in `buildContext()` so
  the field exists from run start even before any mission completes (meta.js
  itself also lazily creates it on first write; this is belt-and-suspenders
  for any Results-screen read before the first completion).

## Blocker 2 — frenzy gems have no producer

- `ctx.run.frenzyCompletions = { goldrush: 0, blood: 0, school: 0 }` added to
  the run bag in `buildContext()`.
- Incremented exactly once beside each existing guarded announcement edge:
  - Blood Frenzy trigger inside `processFrenzyEvents` (the
    `FRENZY_EAT_BLOOD[i] && !(r.blood.t > 2)` branch).
  - School Frenzy trigger inside `processFrenzyEvents` (the
    `s.count >= ... && r._schoolTriggeredPackId !== packId` branch).
  - Gold Rush trigger inside `stepFrenzy` (the `!r._goldRushAnnounced`
    branch, beside the existing `grantPowerCharge(1)` call).
- Each increment site defensively re-initializes `r.frenzyCompletions` if
  absent (guards a caller that built `ctx.run` by hand in a test harness
  without going through `buildContext()`).

## Blocker 5 — keyboard/dead-zone use stale boot camera constants

- Added `liveWorldPerCssPx()`: reads `camera.position.z` / `camera.fov` (the
  actual live fields `stepCamera` writes every frame, including pulse/zoom),
  falling back to the boot `CAM_Z`/`CAM_FOV` constants only when there is no
  live camera (headless selftest) — the same degrade `cssToWorld` already
  uses for the pointer path.
- `stepControl()`'s keyboard virtual-target `wpp`, `headRcss`, and `distCss`
  all now call this one helper instead of hardcoding `CAM_Z`/`CAM_FOV`, so a
  pulse/zoom mid-eat/mid-death no longer desyncs the keyboard target, dead
  zone, or speed magnitude from what the pointer path sees the same frame.
  Zero allocation (pure scalar math), release glide untouched.

## Blocker 6 — popup atlas per-eat GPU upload

- Added `buildPopGeomVariants(atlas)`, called once inside `buildPopAtlas()`:
  bakes one `PlaneGeometry` per atlas cell (`cols*rows`, set once at
  construction — `uv.needsUpdate` fires exactly once per variant, at bake
  time), stored as `popAtlas.geoms[]`.
- `buildPopPool()` now starts every pooled sprite on the space-glyph geometry
  variant instead of the three.js default Sprite plane.
- `paintGlyph(spr, mat, cellIndex)` is now a single-line geometry reference
  swap: `spr.geometry = popAtlas.geoms[cellIndex]`. No clone, no uv attribute
  write, no `needsUpdate` of any kind — `scorePopup` only ever swaps between
  pool-owned meshes and toggles visibility, per the review's ask.
- Strengthened selftest: instruments `needsUpdate` on every prebuilt
  geometry's `uv` attribute (own-property override, same technique already
  used for the texture), asserts zero further writes across three pops, and
  asserts every live pooled sprite's `.geometry` is one of the prebuilt
  `atlas.geoms` entries (identity check) rather than a per-instance clone.

## Blocker 7 — per-eat option object allocation

- Hoisted `deathBurst`/`motes`/`gib`/`eatShockwave`'s option records to
  module-level scratch: `EAT_DEATHBURST_OPT`, `EAT_MOTES_OPT`,
  `EAT_GIB_OPT`, `EAT_SHOCKWAVE_OPT` (beside the existing `FRENZY_FX_OPT`
  pattern). `swallow()` now overwrites their fields in place before each
  `fxEmit`/`Fx.eatShockwave` call instead of constructing `{...}` literals
  per bite. Tint stays numeric, no per-eat arrays/closures.

## Blocker 8 — bought skins never render

- Added `skinnedDef(def)`: resolves `profile.skins.selectedSkin` against
  `RFD.SKINS`, and if there's a matching row (respecting `sharkId` locking —
  a locked skin for a different shark does not apply), returns an ES5-style
  shallow clone of `def` with `sil: {...def.sil, palette: <swapped palette>}`
  (only `base`/`belly`/`accent`/`glow` are overridden; any field not present
  on the skin row falls back to the def's original palette value). Returns
  `def` unchanged when there's no selection or no match — no mutation of the
  shared `RFD.SHARKS` def in any case.
- `buildPlayerRig(def)` calls `skinnedDef(def)` once per rig build (not per
  step) and passes the result to both `RF.Art3D.buildShark` and the
  `fallbackShark` degrade path, so a selected skin renders identically
  whether or not the Art3D lane is present. `shark3d.js` was not touched —
  it already reads `def.sil.palette` for everything; this only changes what
  `def` the engine hands it.

## Minors (engine3d.js items)

- `WORLD_W`/`WORLD_H` fallback constants were stale at the pre-Rev-6
  7200x3600 size; the landed world is 14400x4800
  (`world3d.js` WORLD.w/h, `SPEC3D.md:759`). `RFD.WORLD` is not currently
  emitted by `gen_data.py`, so these fallbacks are what actually run at boot
  — updated to 14400/4800 to match the real contract instead of documenting
  (and running against) a superseded size.
- The camera-section header comment ("World coords are unchanged (x right
  0..7200, y DOWN 0..3600)") repeated the same stale numbers; updated to
  14400x4800 with a pointer to `SPEC3D.md:759`.
- The `SAVE_VERSION`/`SPEC3D.md` header and `world3d.js`'s kit-bus comment
  from the Minors section are outside `engine3d.js` (SPEC.md / SPEC3D.md /
  world3d.js are not this lane's files) — not touched, per lane ownership.

## Selftest

Extended `__selftestBody()` in `engine3d.js` with three new blocks (all
under the existing `{pass, checks, fails, log[]}` `check()` harness, no new
test infra):

1. **Mission wiring smoke** (stub `RF.Meta`): asserts `startRun` calls
   `rollMissions` exactly once with `ctx.rng`, `ctx.run.missionResults`
   starts empty, `ctx.run.frenzyCompletions` initializes to zeroed counters,
   `swallow()` sends `missionEvent('eat', {defId})` and `('score', {score})`
   on the same bite, a completion forwards exactly one call to
   `RF.UI.missionTick`, `collectRelic()` sends `missionEvent('relic',
   {zoneId})`, and that `zoneTime` fires once per second (not once per fixed
   step) across ~65 real `step()` calls.
2. **Frenzy completion increments**: drives a real Blood Frenzy trigger via
   `swallow()` + `stepFrenzy()` and asserts `frenzyCompletions.blood`
   increments exactly once, that re-triggering inside the same window (per
   the existing FIX-ROUND-3 item 5 no-re-announce guard) does not
   double-increment, and drives a Gold Rush completion asserting
   `frenzyCompletions.goldrush` increments exactly once.
3. **Skin selection / palette swap**: with `profile.skins.selectedSkin`
   unset, a global (`sharkId:null`) skin selected, and a skin locked to a
   *different* shark selected, asserts the def passed to
   `RF.Art3D.buildShark` has the expected (unchanged / swapped / unchanged)
   `sil.palette.base`, and that the shared `RFD` shark def object is never
   mutated by any of the three cases.

Also strengthened the existing popup-atlas selftest block (B6) to
instrument `needsUpdate` on every prebuilt geometry variant's `uv`
attribute, not only the atlas texture, and to identity-check that every
live pooled sprite's geometry is one of the prebuilt variants.

## Verify

```
cd play/razorfin && node --import ./tools/reg.mjs tools/selftest.mjs game
-> game: pass=true ok=278 fail=0   (was 228/0 before this pass)

node --import ./tools/reg.mjs tools/selftest.mjs world game art3d fish fx ui meta abilities
-> world: pass=true  ok=195 fail=0
-> game:  pass=true  ok=278 fail=0
-> art3d: pass=false ok=0   fail=0   <- shark3d.js, NOT this lane's file; fails
                                        identically in isolation (`selftest.mjs art3d`
                                        alone), unrelated to any engine3d.js change here
-> fish:  pass=true  ok=7   fail=0
-> fx:    pass=true  ok=0   fail=0
-> ui:    pass=true  ok=234 fail=0
-> meta:  pass=true  ok=166 fail=0
-> abilities: pass=true ok=0 fail=0
```

Every suite that exercises engine3d.js is green with zero failures. The
`art3d` (shark3d.js) failure is pre-existing and outside this lane's file
ownership — verified it reproduces identically when run alone
(`selftest.mjs art3d`), so nothing in this pass introduced or changed it.

## Deviations / notes for the orchestrator

- `RF.UI.missionTick` is called with a synthesized `"<name> complete!"`
  string (mission name looked up from `RFD.MISSIONS` by id, falling back to
  `"Mission"` if not found) since `missionEvent`'s return value is only a
  list of completed ids, not display text. If S4/orchestrator wants a
  different phrasing, this is the one call site to change
  (`missionEvent()` helper, engine3d.js).
- `missionEvent('score', ...)` is only ever called from the eat path (the
  sole place `ctx.run.score` changes in this file), not from a dedicated
  score-change hook — confirmed safe against S3's documented `max()`
  semantics for score/zoneTime progress (NOTES-rev7-laneS3.md).
- Blocker 3, 4 (gems-only secret-shark UI gating, `Meta.endRun` re-entrancy
  guard) are out of scope for this lane — they are ui3d.js/meta.js changes,
  not engine3d.js, per the task's explicit blocker list (1, 2, 5, 6, 7, 8
  only).
