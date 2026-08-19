# Razorfin - Lane A build log (game.js)

## Lane A pass 1: what / why / self-test result

**File owned:** `play/razorfin/game.js` (1619 lines). Nothing else was created
or edited. `sharkart.js` was deliberately never read as an authority; all art
goes through the guarded `RF.Art` shims.

### What was built

Per SPEC.md "game.js (Lane A)":

1. **Boot / kit.** `GGKit.create({slug:'razorfin', orientation:'landscape',
   validateSave, onRestart})`. Phaser config through `GGKit.hiDpi.phaser` with
   `GGKit.renderDefaults` smart-merged, parent `game-root`, Scale.FIT on the
   844x390 landscape CSS baseline.
2. **Scenes.** Boot (Kenney pngs + sfx/music URL registration, then texture
   bake), Menu (title, tier-grouped shark select grid reading
   `RF.Meta.ownedFor` / `tierUnlocked`, drag-scrolled through kit.input),
   Ocean (the run). Shop/Results are pulled from `RF.Meta.scenes` and
   registered into the running game.
3. **Fixed step.** `STEP=1/60`, `MAX_STEPS=4` accumulator. `ctx.run.timeScale`
   multiplies accumulated dt (chrono / slow-mo / death). `RF.Juice
   .consumeFreeze()` is consumed exactly once per frame and the returned ms
   are skipped as hit-stop before any stepping.
4. **RF.ctx** built exactly per SPEC: `{kit, scene, dpr, time{now,dt,frame},
   rng, player, save, run{score,coins,xp,combo,comboT,frenzy,goldRushT,
   biggestTier,slowmoT,timeScale}}`. `rng` is mulberry32 seeded off the run
   count; there is no `Math.random` in sim code.
5. **Player + control.** Entity per the SPEC schema, `def` = selected
   `RFD.SHARKS` row, stats scaled by upgrade levels via
   `RFD.ECONOMY.upgradeEffect` and again by `RF.Abilities.passives`
   multipliers. Touch: first pointer sets/updates a world swim target
   (screen->world via the camera), the shark steers toward it with per-shark
   speed/accel/turn caps and smooth capped angular steering; a second
   simultaneous pointer boosts while held. Keyboard fallback: WASD/arrows,
   shift boost, space fires the power.
6. **Eat resolution.** Mouth sensor circle at the nose (radius from sprite
   length), `wideBite` widens it into a forward arc. Tier diff >= 2 below is an
   instant swallow; near-tier is multi-bite (`hp -= bite`, 250ms cooldown,
   hitStop(40) + shake + `chomp`). Swallow pays score/coins from the
   `RFD.CREATURES` row times the combo multiplier, refills hunger, calls
   `RF.Abilities.chargeFromEat`, `RF.World.kill(ent,'eaten')`, bumps combo and
   adds `RFD.FRENZY.meterPerEat`.
7. **Hunger + zones.** `hp -= metab*dt` with `slowMetab` factored in; zone
   pressure (`RF.World.zoneAt(y).pressureTier > player.tier`) triples the
   drain; tier >= 9 and `pressureImmune` are exempt. Death runs slow-mo then
   hands off to `RF.Meta.endRun(ctx)` -> Results.
8. **Combo / Gold Rush.** 3s window and the mult steps from `RFD.FRENZY`. A
   full frenzy meter opens an 8s Gold Rush: invulnerable, speed x1.4, coins
   x2, `RF.Music.setLayer('goldrush')`, reverting cleanly afterwards. Music
   layer flips to 'danger' when an out-ranking predator is within 500px.
9. **HUD.** ONE top-left corner cluster (health bar, boost bar, power button
   reading `RF.Abilities.hud`), coins small top-right, combo chips <=24px
   <=1s strictly one at a time through a bounded queue. Tutorial is a single
   fading top strip on the first run only, suppressed by `?notut=1`. DEV chip
   bottom-right when `RF.DevMode.state` is active. No centre banners in play;
   damage feedback is a screen-EDGE vignette only.
10. **`RF.Game.__selftest()`** - headless, described below.

### Guards used (degraded-boot contract)

Every cross-namespace call sits behind an existence check AND a try/catch, so
one lane's absence or a throw inside it cannot take a frame down. Verified
mechanically, not by eye: a script scanned every `RF.<Sibling>.<method>(` call
site and confirmed all are guarded.

- `RF.World` - missing world.js falls back to a painted zone backdrop, an
  empty query result, and a local `zoneAtFallback(y)` off `RFD.ZONES`, so the
  shark still swims, starves and obeys pressure.
- `RF.Art` - missing sharkart.js falls back to DPR-baked coloured-ellipse
  textures keyed identically, so every entity still draws.
- `RF.Abilities` - missing abilities.js synthesises the passive struct
  directly from the shark row's own `passives` array, so `biteUp`, `wideBite`,
  `slowMetab`, `armored`, `junkEater` and `undying` still behave.
- `RF.Juice` / `RF.Sound` / `RF.Music` / `RF.Fx` - no-ops.
- `RF.Meta` - falls back to a local profile shape, local coin/xp banking on
  run end, and a straight `kit.save` round trip.
- `warnOnce()` keeps a throwing sibling from spamming the console every frame.

### Two real integration mismatches found and fixed

Both were caught by running against the sibling files that had actually landed
rather than against stubs only:

1. **`RF.Meta.validate` does not exist** - meta.js names it `validateSave`.
   The `GGKit.create` validator now accepts either spelling, so saves are
   really validated instead of silently degrading to accept-anything.
2. **`RF.Meta.scenes` shape** - Shop/Results are Phaser.Class scene classes on
   `RF.Meta.scenes`, not `RF.Meta.sceneShop`. Registration reads the bag first
   and tolerates the other spelling. Registration also now runs from Boot's
   `create` (it is idempotent) because Menu decides whether to draw the Shop
   button by asking whether that scene exists, which made it order-dependent
   on Phaser's `ready` event.

### One latent cross-lane hazard closed

`RF.World.query()` documents that it returns a SINGLE REUSED SCRATCH BUFFER
valid only until the next `query()` call. `stepEat` iterates that result while
calling `World.kill` and `Abilities.chargeFromEat` inside the loop, either of
which may query. The result is now copied into a pre-allocated reused array
(`EAT_BUF`) before iteration: correct today, robust if a sibling lane starts
querying tomorrow, and still zero-allocation. `stepPredators` and `stepMusic`
break out of their loops immediately and were left as-is.

### Fleet law compliance

- Input is exclusively `kit.input.onDown/onMove/onUp/onKeyDown`. Zero
  `addEventListener` calls in the file (per the `_shared/NOTES.md`
  release-side defect).
- Zero `setTimeout` / `setInterval` driving game logic. The death -> Results
  handoff schedules off `ctx.time.now`, so a paused tab cannot advance it.
- Zero `Math.random` in sim code; mulberry32 only.
- Zero em dashes in any string.
- `kit.paused` drops the accumulator, so pause genuinely freezes the sim.
- No per-frame allocation in `step()`: reused scratch (`EAT_BUF`, `DESIGN`,
  `RECT`), no vector objects, no closures.

### Self-test result

`RF.Game.__selftest()` is headless (no Phaser boot). It stubs the kit and the
Phaser scene surface, builds a real `ctx` and a real player through the real
`buildContext`/`buildPlayer`, then drives 120 fixed steps of swim-toward-target
with a planted meal, plus hunger ticks, through the real `step()` path.

Run 1, stubbed siblings (`node rf_selftest.js`):

```
exports: boot,__selftest,ctx,kit,game,profile,registerMetaScenes,STEP,W,H
  ok player entity built
  ok stats resolved finite
  ok player moved toward target (dx=101.0)
  ok prey was eaten
  ok score increased on swallow
  ok combo incremented
  ok frenzy meter charged
  ok hunger drained hp (3.20)
  ok hp changed across the run
  ok zone pressure multiplies drain
  ok degraded step (no sibling modules) did not throw
RESULT pass=true
```

Run 2, against the REAL sibling files that had landed (juice.js, abilities.js,
world.js, meta.js loaded in index.html order, `sharkart.js` deliberately
absent to prove the degraded path):

```
loaded juice.js / abilities.js / world.js / meta.js / game.js
--- console.error during load: 0
--- namespaces: Fx,Juice,Sound,Music,Abilities,World,Meta,DevMode,Game
--- RF.Art present (should be false): false
  (same 11 assertions)
LANE A SELFTEST pass=true
```

Interface conformance was checked against the real siblings: every method this
file calls on `RF.World`, `RF.Abilities`, `RF.Juice`, `RF.Fx`, `RF.Sound`,
`RF.Music` and `RF.Meta` exists with the spec'd name (`missing: NONE` for all
seven namespaces), and meta.js's `load(kit)`, `commit(kit,profile)`,
`endRun(ctx)`, `ownedFor(profile,id)`, `tierUnlocked(profile,tier)` signatures
match the call sites.

Accumulator arithmetic was proved separately across edge cases: a normal
16.7ms frame steps once; a 40ms hit-stop consumes the whole frame and carries
23.3ms forward; a 5000ms frame clamps to 4 steps and drops the backlog (no
spiral of death); slow-mo x0.32 accumulates sub-step; NaN and negative deltas
both yield dt 0 rather than poisoning the accumulator.

### Not done / for the orchestrator

- **Not verified in a browser.** Everything above is headless. Boot in a real
  page, the Menu grid's touch scroll, retina text sizing and frame rate are
  unmeasured by this lane, and `_shared/NOTES.md` is explicit that the
  headless gate has passed wrongly-sized frames before. This needs a device
  or browser check before it ships.
- `sharkart.js` had not landed when this pass ran, so the Menu grid and the
  player were exercised only against the fallback ellipse textures. The
  `RF.Art` path is guarded but has never executed.
- The player sprite is flipped with `setFlipY` when swimming left (the sprite
  rotates nose-first, so flipping Y keeps the belly down). That reads correct
  in principle but wants an eye on the real baked art.

---

## Lane A fix pass 1 (2026-08-19, post REVIEW-1)

Every finding REVIEW-1.md assigns to "A engine", plus the two folded in by the
orchestrator (RF-BEST-01's game-side half, RF-TEST-01). `game.js` is the only
file touched.

### RF-RETINA-01 (BLOCKING) - title-side density factor

SPEC Rev 3 implemented in full. `ggkit.js` was NOT modified and
`GGKit.hiDpi.dpr()` is never called; the fleet kill switch stays intact for
everyone else.

- `computeDpr()` = `clamp(devicePixelRatio, 1, 3)`, held in `DPR` and exported
  as `RF.Game.dpr` (world.js and sharkart.js already read that, lazily, so the
  load-order gap is a non-issue).
- The game is SIZED IN DEVICE PIXELS: `W = 844 * DPR`, `H = 390 * DPR`, with
  `scale.zoom = 1/DPR` scaling the canvas back into the CSS box. That is the
  only mechanism Phaser 3 still has for a dense backing store (`resolution`
  was removed after 3.16). `GGKit.hiDpi.phaser()` is bypassed deliberately,
  since it derives its factor from the kill-switched `dpr()` and would hand
  back a 1x game; only `GGKit.renderDefaults` is borrowed, smart-merged with
  this config winning.
- `S(px)` is the single CSS-px to device-px conversion. Every hard-coded px in
  the file goes through it: HUD plate/bars/power dial, menu cards, tier heads,
  paddings, chip offsets, vignette band, hit rects. `txt(size, ...)` still
  takes CSS px and converts once inside, so UI_LAW's limits stay readable as
  the CSS numbers the law is written in (a 24px chip is `S(24)` device px).
- Bakes: `denseCanvas()` replaces `GGKit.hiDpi.canvas()` for the fallback
  ellipse textures, same recipe with the title-side factor substituted.

**World-space reconciliation.** Sizing the game in device px moves world
coordinates into device px, which would have shown DPR times as much ocean and
shrunk every world.js entity (whose radii are authored in design units) to a
third of its size on a DPR3 phone. Ocean therefore sets
`cameras.main.setZoom(DPR)`: world coordinates stay design units for world.js
and abilities.js, and the pixels behind them are dense. Screen-space UI is
authored in device px and cannot live under that zoom, so it renders on a
SECOND camera (`hudCam`) at zoom 1; `hudAdd()` marks an object as HUD and
`hudCamSeal()` sets both ignore lists. `setTargetFromPointer` divides by the
camera zoom to convert a pointer back into world units, which the old
`cssRect` maths did not do and which would have made the steering target drift
further from the finger the further the shark was from the camera origin.

Not verified on a real device. Per the kill-switch policy that signoff is a
ship gate owned by Dan, and this lane cannot discharge it headlessly.

### RF-PROFILE-01 (BLOCKING) - save schema consumers

All obsolete reads are gone. `profile.owned`, `profile.lastShark` and
`profile.upgrades` do not appear anywhere in the file any more.

- `ownedFor()` falls back to `profile.sharks[id].owned`.
- `upgradeLevel(sharkId, track)` reads `RF.Meta.upLevel`, falling back to
  `sharks[id].up[track]`. It is now PER SHARK, so `buildPlayer` passes
  `def.id`; the old global bag silently zeroed every purchased upgrade.
- `activeSharkId()` selects via `RF.Meta.activeShark` (which layers the
  non-persisted dev pick over `profile.selected`), replacing the
  `lastShark || owned[0]` guess in `boot()`.
- Menu selection writes through `RF.Meta.select(profile, id)` and commits.
- `formatCoins()` reads `RF.Meta.displayCoins`, so the menu and the shop agree.
  game.js no longer fabricates its own dev-coin overlay by adding to
  `profile.coins`; that was the source of the divergence the review noted.
- `FALLBACK_PROFILE` became `fallbackProfile()`, shaped exactly like the
  meta.js schema (`selected` / `sharks{owned,up}` / `best{score,biggestTier}`),
  so the degraded path and the real path read through identical accessors. The
  degraded settlement in `finishRun` writes `best.score` / `best.biggestTier`
  rather than a scalar `best`.

### RF-RESULT-01 (BLOCKING) - settlement payload shape

`scene.start('Results', { results: payload, ctx: ctx })`. Results reads
`data.results` and previously fell through to its zeroed defensive record. The
degraded branch (no meta.js) now synthesises a full-shaped record rather than
a two-field one, so the screen renders real numbers either way.

### RF-HITS-01 (BLOCKING) - world is the damage authority

`stepPredators` is deleted. `stepPlayerHits` consumes `RF.World.playerHits`
in the SAME frame world.js filled it, immediately after `World.update` inside
`step()`. The duplicate spatial re-query is gone, which restores mine damage
(a mine detonates and releases itself before any independent query could see
it), preserves jelly sting records, and stops game.js re-deriving damage
numbers world.js had already computed.

Details: the invuln timer now ticks every step regardless of contacts;
`armored` halves each record; contacts in one frame sum into a single `hurt()`
so the invuln window still bounds a hazard cluster; the buffer is not mutated
(world.js clears it at the top of its own update).

### RF-PASSIVE-01 (BLOCKING) - live stat multipliers

`liveMult(p, key)` prefers `player.st.statMults` (which abilities.js rewrites
every step, including zone surface/depth power and combo speed) and falls back
to the boot snapshot `p.pas.mult`. Consumed in `stepControl` (speed, boost,
accel) and `multiBite` (bite), applied as a ratio against the snapshot already
baked into `p.stat` so upgrades are not double-counted.

Hunger: `p.stat.metab * liveMult(p, 'metab')`. The old
`num(p.pas.slowMetab, 1)` multiplied by a BOOLEAN, so Greenland's 0.5 never
applied. `resolvePassives` now normalises `statMults` / `metabMult` /
`slowMetabMult` into `p.mult.metab`, and the degraded fallback reports
`slowMetab` as a boolean with the number in `slowMetabMult`, matching the real
resolver's shape.

### RF-COINS-01 (BLOCKING) - single payout authority

**Documented rule: a player swallow pays direct, with multipliers. Everything
else pays through pickups, at face value.**

- `swallow()` pays `coins * comboMult * goldRushMult`, then sets `e.coins = 0`
  before `World.kill(e, 'eaten')`. world.js's `dropPickup` is gated on
  `ent.coins > 0`, so zeroing it suppresses the pickup for this entity only.
  Kills the player did not cause (DoT, mine chains, predator-on-prey) keep
  their coins, still drop pickups, and are still paid by world.js on
  collection.
- `collectPickup()` is now a deliberate no-op. world.js's `pickupAI` owns the
  magnet, the grab radius, the coin sfx and the payout; game.js paying on mouth
  contact as well was a second double-pay on the same coin. The method survives
  only to stop `stepEat` treating a coin as food.

Gold Rush is now unambiguously worth its authored 2x, because there is exactly
one path it can apply on.

### RF-INPUT-01 (BLOCKING) - drag versus tap

Roster cards no longer bind Phaser `pointerup`. The whole grid strip has ONE
gesture owner routed through `kit.input`, and the SAME `moved` accumulator that
drives the horizontal scroll decides whether the release counts as a tap
(threshold `S(12)` device px, 12 CSS px). A swipe that scrolled the fleet can
never launch a run. Cards are hit-tested in design space by `cardAt()`, which
accounts for the scroll offset.

Shop and Settings go through `tapTarget()` -> `tapRect()`, the same
kit-routed, moved-guarded path, so the menu has no direct Phaser input left.
All subscriptions land on `scene.subs` and are torn down on shutdown.

### RF-UI-01 (BLOCKING) - phone UI law

- ONE HUD cluster. The separate top-right coin label is folded into the
  top-left cluster on the name line, and the bottom-right dev chip has moved to
  the top edge. There is now nothing along the bottom edge or in either bottom
  corner during play.
- Menu chrome (SHOP, SETTINGS) moved from the bottom corners to the top edge,
  clear of the thumb shadow (UI_LAW 8/11). The bottom line is a single
  non-interactive hint.
- Text: menu card names 12 CSS px, lock lines 11, Settings 14, tier heads 13.
  Nothing the player must read is under 11 CSS px, and all of it is multiplied
  by DPR.
- Touch targets: `padHit()` grows every hit rect to at least 44 CSS px on both
  axes about its own centre, independently of the drawn size. Applied to the
  power button (44x44 despite a smaller dial), roster cards (96x112 CSS) and
  both menu buttons.
- Combo chips still queue one at a time, 12 CSS px, one second, docked under
  the cluster.

### RF-CHRONO-01 (MINOR) - Juice API signature

`RF.Juice.slowmo(0.32, 1200)` then `RF.Juice.consumeSlowmo()`, and the granted
`{scale, ms}` drives `ctx.run.timeScale` / `slowmoT`. The old `slowmo(ctx)`
passed an object where a number was expected, which clamped to a 1ms request
that was then never consumed.

### RF-DEV-01 (MINOR) - dev chip

A compact `DEV` badge, 11 CSS px inside a chip under 24 CSS px, at the TOP
right. The concatenated switch list is gone (UI_LAW 6 bans always-on mode
descriptions during play); the switches remain readable on `window.__rf`.

### RF-MENU-01 (MINOR) - visible selected state

Roster cards carry an explicit selected treatment: a filled plate, a 3px
accent border and an `ON` tag, repainted by `paintCards()` whenever the
selection changes. `selectedSharkId` now drives styling rather than only
being written by the pointer handler.

### RF-BEST-01 (folded in) - peak combo

`ctx.run.comboPeak` is initialised in `buildContext` and raised next to the
combo increment in `swallow()`. meta.js reads it defensively, so a run that
ends on a broken streak reports the high-water mark, not `x0`.

### RF-TEST-01 (folded in) - environment-safe self-test

The free global `GGKit` is gone from every runtime path. `ggkit()` reads
`root.GGKit` (a property miss is `undefined`; a bare reference threw
`ReferenceError`), `boundedPush()` wraps the kit helper with a local fallback,
`denseCanvas()` replaces the kit canvas call, and `ctx.dpr` is the local
factor. `RF.Game.__selftest()` now completes in a clean Node context with
`window.RF` stubbed and no `GGKit` binding at all, which is exactly how the
verification below was run.

### Ability teardown wiring (folded in, Lane E's RF.Abilities.reset)

`abilitiesReset()` is a guarded shim alongside the other cross-namespace shims
and calls `RF.Abilities.reset(ctx)`, which restores `ctx.run.timeScale` to 1
and clears player-side ability state (Phase invulnerability, Chrono time
scale, fire wakes). It is wired into BOTH exits:

- `finishRun()`, immediately BEFORE the Results transition. This is the one
  that matters: an inactive player returns early from `step()` and so never
  reaches `RF.Abilities.update`, which is what would normally have restored
  the state. A Chrono or Phase death therefore used to leak a 0.35 time scale
  and permanent predator immunity into the next run.
- The Ocean `shutdown` handler, for any exit that does not pass through
  `finishRun` (restart, kit-driven scene change, anything added later).

`reset` is idempotent, so running it on both paths is harmless. The explicit
`ctx.run.timeScale = 1` in `finishRun` is kept for the degraded case where
abilities.js is absent entirely.

### Verification

`node --check play/razorfin/game.js` -> clean.

Run 1, ISOLATED Node context: `data.js` + `game.js` only, no `GGKit`, no
`document`, no `Phaser`, `devicePixelRatio = 3`. This is the RF-TEST-01
environment that used to throw.

```
exports: boot,__selftest,dpr,S,CSS_W,CSS_H,ctx,kit,game,profile,registerMetaScenes,STEP,W,H
RF.Game.dpr = 3
  ok player entity built
  ok stats resolved finite
  ok player moved toward target (dx=101.0)
  ok prey was eaten
  ok score increased on swallow
  ok combo incremented
  ok frenzy meter charged
  ok hunger drained hp (3.20)
  ok hp changed across the run
  ok zone pressure multiplies drain
  ok dpr factor exported and in range (3)
  ok ctx.dpr carries the title-side factor
  ok font size scaled by dpr: 13 CSS px -> 39 device px
  ok design space sized in device px (2532x1170)
  ok hit areas padded to 44 CSS px (132.0 device px)
  ok playerHits applied once, hp fell by 12.03
  ok a consumed hit opened the invulnerability window
  ok consumed hit was not re-applied on later frames (extra 0.080)
  ok swallow paid coins directly
  ok swallow zeroed entity coins so world drops no pickup
  ok comboPeak tracks the high-water mark
  ok comboPeak survives a broken combo
  ok live metab multiplier consumed from st.statMults
  ok slowMetab halves hunger drain via the numeric multiplier
  ok upgradeLevel reads sharks[id].up
  ok finishRun called Abilities.reset before leaving
  ok time scale restored on run exit
  ok degraded step (no sibling modules) did not throw
RESULT pass=true
```

Run 2, REAL siblings loaded in index.html order (`data`, `juice`, `abilities`,
`world`, `meta`, `game`; `sharkart.js` and the Phaser scene classes absent,
which is what the cross-namespace guards are for), `devicePixelRatio = 2`:

```
namespaces: Fx,Juice,Sound,Music,Abilities,World,Meta,DevMode,Game
RF.Game.dpr = 2
  (same 28 assertions)
  ok font size scaled by dpr: 13 CSS px -> 26 device px
  ok design space sized in device px (1688x780)
  ok hit areas padded to 44 CSS px (88.0 device px)
RESULT pass=true
```

Run 3, every lane's own self-test in that same combined context, to prove this
pass broke nothing sideways:

```
Juice: pass=true
Abilities: pass=true
World: pass=true
Meta: pass=true
Game: pass=true
```

The two new assertions the brief mandated are `font size scaled by dpr` (the
factor reaching a sampled font size, plus `design space sized in device px`
and the padded hit area as corroboration) and the `playerHits` block: a stubbed
world pushes one hit record, the player's hp drops exactly once by that
record's damage, the invuln window opens, and three further frames confirm the
record is not re-applied.

Constraints re-checked after the pass: no `window`/`document` listeners, no
`setTimeout`/`setInterval` driving logic, no `Math.random`, no em dashes in any
string, all cross-namespace guards intact.

### Still open for this lane

- **Real-device retina signoff.** The whole RF-RETINA-01 conversion is
  unverified in a browser, and `_shared/NOTES.md` is explicit that the headless
  gate has passed wrongly-sized frames before. The two-camera split in
  particular (world camera zoomed by DPR, HUD camera at 1) wants eyes on it.
- The `RF.Art` path still has never executed in this lane's harness.
