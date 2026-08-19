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

---

## Lane A Rev 4 (2026-08-19, post owner iPhone test)

Owner verdict on device: **controls feel wrong, the shark is a static sprite.**
SPEC.md "Rev 4" is the binding brief. `game.js` is the only file touched.

### 1. Controls: floating virtual stick (the headline fix)

**The old tap-a-point-and-swim-to-it controller is deleted, not tuned.** That
model is what felt wrong on glass: the finger planted a WORLD target, the shark
accelerated at it, overshot, and then orbited the point while the throttle eased
in and out of a 60px settle radius. On a phone that reads as a laggy, drifting
cursor rather than a shark. `setTargetFromPointer`, `ctl.tx/ty` and
`ctl.hasTarget` are gone from the file (grep confirms zero occurrences).

The replacement is the horde-meridian stick, mechanic for mechanic
(`play/horde-meridian/game.js` bindInput ~2415):

| Behaviour | HM | Razorfin Rev 4 |
| --- | --- | --- |
| Base plant | first pointer, ring+nub at touch point | same, `plantStick(x,y)` |
| Max radius | 62 CSS px | `STICK_R_CSS = 62`, through `S()` |
| Clamp | `dx/len*max` | same |
| Re-center | past `max * 1.35` the base follows | `STICK_RECENTER = 1.35` |
| Output | `dx/max`, `dy/max` | same, plus a `mag` magnitude |
| Ring alpha | 0.16 | `STICK_RING_A = 0.16` |
| Nub alpha | 0.5 | `STICK_NUB_A = 0.5` |
| Release | `clearStick()` | same |

Razorfin-specific departures, all deliberate:

- **The stick is DEVICE px on hudCam, not world px.** HM is a single-camera
  game. Razorfin runs the Rev 3 two-camera split (world under
  `cameras.main.setZoom(DPR)`, HUD on an unzoomed `hudCam`). The stick belongs
  to the HUD, so `plantStick` / `dragStick` take `toDesign(pt)` output directly
  and never divide by `cam.zoom`. That is why the ring lands exactly under the
  finger on a DPR3 phone. Putting it in world space, as the old target code
  did, was the second half of the bad feel: the visual and the maths drifted
  apart the further the camera scrolled from the origin.
- **Drawn with one `graphics` object, not generated disc textures.** The brief
  allowed either. A graphics object repainted on plant/drag/clear costs nothing
  while the finger is still (no per-frame repaint at all), leaks no textures on
  scene restart, and avoids two more bakes in the iOS texture budget the SPEC
  caps at 80MB.
- **Dead zone `STICK_DEAD = 0.12`.** HM has none because a twin-stick shooter
  wants any nudge to register. A shark that creeps whenever a resting thumb
  wobbles reads as broken, so sub-12% deflection is hard zero. Asserted.

**The stick vector is the desired velocity**, per the SPEC. Direction sets the
heading to align to; magnitude is a throttle on `stat.speed`. Velocity is a
capped step toward `speedCap * mag` along the CURRENT heading, at the shark's
`accel`, rather than a raw thrust. Two consequences that matter for feel:
half deflection genuinely *settles* at half speed instead of slowly creeping to
full (asserted: 115.0 vs 230.0 px/s), and the shark moves nose-first while it
turns, so a turn reads as a shark banking rather than a sprite sliding sideways.

**Heading alignment parameters chosen:**

- `TURN_BOOSTA = 2.0` on `stat.turn`, which is the SPEC's "~2x current rates".
- `TURN_EASE_MIN = 0.45` -> `TURN_EASE_MAX = 1.0`, scaled linearly by
  deflection. This is the "small stick deflections steer gently, full
  deflection whips" requirement. At the dead-zone edge the shark turns at 45%
  of the (already doubled) cap, so a light thumb is a lazy arc; at full
  deflection it is the full 2x and the nose snaps around. Without this the
  doubled cap makes the shark twitchy at every deflection, which trades one bad
  feel for another.
- Boost slightly *reduces* turn authority (0.85), down from 0.78. A boosting
  shark should commit to its line, but the old 0.78 on top of a 1x cap made
  boost feel like a loss of control.

**Release must never drift**, per the brief. `IDLE_DRAG = 0.80` per 60th of a
second, with a hard snap to zero below 1 px/s so it genuinely reaches rest
rather than asymptotically approaching it. Asserted twice: velocity < 1.0 px/s
after 120 released steps, and < 0.5 px of total position change over the 60
steps after that.

**Cancel paths.** ggkit fires `onUp` with a **null event** on cancel
(pointercancel / blur / visibilitychange), which the brief flagged. A null
release clears the stick AND the boost pointer, because the pointer identity is
gone and there is nothing left to match against. Separately, `update()` now
clears the stick whenever `kit.paused` goes true: resuming with a stale full
deflection would have launched the shark before the player touched the glass.

Second-pointer boost and the keyboard fallback are unchanged in behaviour. The
keyboard path now synthesises a *normalised stick vector* rather than a world
target, so both input routes run through identical maths downstream instead of
two controllers that drift apart.

### 2. Shark rig animation

`buildSharkRig(sc, def, depth)` assembles `RF.Art.bakeSharkRig` output into a
Phaser container: tail and far pectoral behind, body, near pectoral, jaw. Part
origins are set so each rotates about its own pivot (tail at `0.9, 0.5` = the
peduncle; pectorals at `0.85, 0.2` = the root). The two pectorals are the SAME
texture drawn twice, the second mirrored across the body centreline, so the rig
costs 4-5 sprites and 4 textures, inside the SPEC's "player rig 4-6 sprites".

**The fallback is the live path today.** `RF.Art` has landed but
`bakeSharkRig` does NOT yet exist (verified: `RF.Art present: true
bakeSharkRig: false`), so everything below currently runs against the Rev 3
single-texture sprite. `buildSharkRig` returns `null` for every shortfall
(no `RF.Art`, no `bakeSharkRig`, a throw inside it, a malformed record, a
missing texture key, a scene without container support) and `attachPlayerSprite`
falls through to the old sprite. Four separate assertions cover this.

Animation runs in `stepAnim(p)`, called from the **fixed step**, never from a
tween, so it stays locked to the sim and to hit-stop. All state is scalars on
`p.anim`; zero allocation (verified mechanically). `render()` only reads it.

| Parameter | Value | Note |
| --- | --- | --- |
| `TAIL_HZ_IDLE` | 2.5 Hz | SPEC "idle ~2.5Hz small" |
| `TAIL_HZ_CRUISE` | 5.0 Hz | SPEC "cruise ~5Hz" |
| `TAIL_HZ_BOOST` | 8.0 Hz | SPEC "boost ~8Hz" |
| `TAIL_AMP_IDLE` | 0.10 rad | small, per SPEC |
| `TAIL_AMP_CRUISE` | 0.34 rad | |
| `TAIL_AMP_TURN` | 0.22 rad | added on `abs(turn input)`, per SPEC |
| `PECT_HZ` / `PECT_AMP` | 1.7 Hz / 0.13 rad | slow and shallow, out of phase with the tail so the silhouette never pulses as one block |
| `BANK_MAX` | 0.18 rad | the SPEC cap exactly |
| `BANK_EASE` | 6.0 /s | smooth approach, so a stick flick rolls rather than snaps |
| `JAW_OPEN` | 0.42 rad | scaled by remaining bite cooldown |
| `IDLE_BOB` | 0.9 Hz, 1.6 CSS px | only below `IDLE_SPEED_F = 0.15` of cap |

Bank is scaled by `(0.4 + 0.6 * speedFraction)`: a shark turning on the spot
banks less than one carving at speed, which is what makes it read as
hydrodynamic rather than as a spinning decal.

**Flip handling is on the CONTAINER, per the brief.** Facing left sets
`container.scaleX = -1` and adds pi to the container rotation (the standard
container-flip pairing that keeps the sprite upright while scaleX un-mirrors
it). Flipping individual parts would mirror each about its own pivot and tear
the assembly apart, which is exactly the bug the brief warned about. The bank
sign is inverted when flipped so a left turn banks the same way visually in
both facings. Asserted: `scaleX < 0` when facing left, and the tail rotation
observed in `render` equals the sim phase.

**NPC predators: player only, and here is why.** world.js owns the NPC pool and
its own update loop; NPC sprites are created inside world.js's pooling
(`world.js` ~913). Rigging them means editing world.js, which Lane B owns and
which is running in parallel. Instead `buildSharkRig` is **exported on
`RF.Game`** as a hook Lane B can call, with the contract documented at the
export: it returns null whenever the rig is unavailable, so the caller must keep
its single-sprite path, and the caller must advance the parts itself because
game.js does not own that pool. Not wired, by design, and flagged here for the
orchestrator.

### 3. Juice hooks (Lane F)

All guarded, all no-ops when juice.js is absent. `fxEmit` now **returns the
emit count**, which turns a missing pool into a usable signal rather than a
silent nothing:

- **Bubble wake**, throttled by DISTANCE not time (the brief's preference):
  every ~57 px of travel, above 18% speed, 1 particle (3 while boosting). Emits
  Lane F's purpose-built `swimtrail` pool and falls back to `bubbles` only when
  that pool declines, so an older juice.js still gets a wake.
- **Boost speed lines**: `speedlines` above 50% speed while boosting, every 4th
  frame.
- **Breach splash** on surface exit AND re-entry, using Lane F's `breach` pool
  (heavier on re-entry, since that one carries the fall).

One integration hazard found and closed: **juice.js plays its own `breach`
sound** (`juice.js:427`), so the pre-existing `sfx('splash')` would have layered
two sounds on every surface crossing. The splash sound is now emitted only when
the breach pool declined. Asserted both ways.

`FX_OPT` is a reused scratch options bag so these emits do not allocate inside
the step. Checked that juice.js reads `opts` synchronously into `activate` and
does not retain it, which makes the shared bag safe.

### 4. Two folded-in minors

- **Menu ON-badge resync.** The badge follows the module-level
  `selectedSharkId`, which went stale if the Shop changed the selection and
  SLEPT the Menu rather than restarting it (create() would not re-run). Menu now
  binds `wake` and `resume` to `resyncSelection()`, which re-reads the profile
  and `RF.Meta.activeShark` via `activeSharkId()`, refreshes the coin label
  (the Shop is the one screen that spends), and repaints. If ownership actually
  moved (a shark was bought) it rebuilds the grid instead, because a card
  flipping locked -> owned is not something `paintCards` can express.
  `buildGrid` now destroys its previous container first so a rebuild cannot
  stack a second strip of cards.
- **DEV chip overlap.** On the Menu the chip sat at the same top-right corner as
  SHOP / SETTINGS and covered them the moment a dev switch went active.
  `devChip` now takes an anchor; the Menu anchors it top-LEFT under the title
  where nothing is tappable. Ocean keeps the top-right corner, since its own
  chrome is top-left.

### Self-test

`__selftest` extended from 39 to **64 assertions**; every prior assertion still
passes. The Rev 4 additions:

- Stick simulated by injecting `sx/sy/mag` and driving 120 real fixed steps:
  accelerates (409 px), travel follows the stick direction (cos = 1.000),
  heading aligns (err 0.000), genuinely under way (230 px/s).
- Magnitude is a throttle (half deflection settles at 115 vs 230 px/s).
- Release decelerates to rest (0.0000 px/s) and does not drift (0.0000 px over
  the next 60 steps).
- Cancel releases both pointers; dead zone does not creep.
- Stick geometry through the REAL handlers: clamp to radius, base re-centers
  past 1.35x, partial deflection reads as partial magnitude.
- Tail phase advances with speed against a FAKE rig: 2 -> 5 -> 8 Hz measured as
  observed cycles per 60 steps; amplitude 0.100 -> 0.340; bank capped at 0.1800;
  jaw opens then closes; idle bob runs slow and decays at speed.
- `render` drives the parts from the sim phase and flips on container scaleX.
- Four rig-absence assertions (no `RF.Art`, throwing bake, malformed record,
  fallback render).
- Four juice-fallback assertions including the breach double-sound guard.

```
$ node --check game.js
SYNTAX OK

$ node rf_selftest.js            # stubbed siblings, DPR 3
  ... 64 ok, 0 FAIL
RESULT pass=true

$ node rf_siblings.js            # data/juice/abilities/world/meta/sharkart/game
--- console.error during load: 0
--- namespaces: Fx,Juice,Sound,Music,Abilities,World,Meta,DevMode,Art,Game
--- RF.Art present: true bakeSharkRig: false
assertions: 64 LANE A SELFTEST pass=true
```

Law sweep: 0 em dashes, 0 `addEventListener`, 0 `setTimeout`/`setInterval` in
code, 0 `Math.random` in code, 0 allocations in `stepControl` / `stepAnim` /
`stepMotion` (checked by parsing each function body), every new cross-namespace
call guarded and wrapped.

### Not done / for the orchestrator

- **Not verified on a device or in a browser.** This is the whole point of Rev 4
  and this lane cannot discharge it headlessly. The stick's *feel* (62 CSS px
  radius, the 0.45-1.0 turn ease curve, `IDLE_DRAG` 0.80) is tuned to HM's
  numbers and to reasoning, not to a thumb. The owner's iPhone remains the gate.
- **The rig has never executed.** `bakeSharkRig` does not exist yet, so the
  container path is proven only against a fake rig in the selftest. When Lane D
  lands, the pivot origins (`0.9,0.5` tail, `0.85,0.2` pect) are the first thing
  to check against the real bakes: they assume the tail texture's pivot end is
  at its right edge and the pectoral's root is at its upper right.
- **NPC rigs are not wired.** Hook exported as `RF.Game.buildSharkRig` for
  Lane B; see the rig section above.

---

## Rev 3D pass 1 (Lane A3) - engine3d.js

New file `engine3d.js` (ES module, imports `three` by the importmap name per
SPEC3D load order). `game.js` is untouched and stays in the repo as the
reference rev until cutover signoff. This lane did NOT touch `index.html`
(Lane C3 owns it), any 2D file, or any other 3D lane file.

### What was ported (logic identical to game.js)

Every sim rule below is the same code path and the same NUMBER that shipped in
the Phaser rev. Only the render layer changed.

- **GGKit boot**: `GGKit.create({slug:'razorfin', orientation:'landscape',
  validateSave, onRestart})`, `registerPWA()`, and the same save handling
  (`validateSave` delegate-or-accept, `fallbackProfile`, `loadProfile`,
  `commitProfile`, `ownedFor`, `upgradeLevel`).
- **Fixed step**: `STEP=1/60`, `MAX_STEPS=4`, accumulator times
  `ctx.run.timeScale`, `RF.Juice.consumeFreeze()` consumed once per frame and
  subtracted as skipped ms, backlog dropped at MAX_STEPS. Pause zeroes the
  accumulator AND drops the stick (a stale full deflection must not launch the
  shark on resume).
- **RF.ctx**: exact SPEC.md schema (kit, scene, dpr, time{now,dt,frame}, rng
  mulberry32, player, save, run{score,coins,xp,combo,comboT,comboPeak,frenzy,
  goldRushT,biggestTier,slowmoT,timeScale}). Additive-only: `three`,
  `renderer`, `camera`, `scene3` for the sibling 3D lanes. `scene` is now the
  THREE.Scene rather than a Phaser scene, which is the one schema field whose
  TYPE the 3D rev necessarily changes.
- **Stick controls**: all of game.js's numbers - 62 CSS px radius, 1.35x
  re-centering base follow, 0.12 dead zone, ring alpha 0.16 / nub alpha 0.5,
  `TURN_BOOSTA` 2.0 with the 0.45-1.0 deflection-scaled turn ease,
  `IDLE_DRAG` 0.80 decel-to-zero on release with the <1 px/s snap to rest.
  Keyboard fallback (WASD/arrows, Shift boost, Space power) unchanged.
- **Player controller**: `stepControl` / `stepMotion` / `stepAnim` /
  `stepEat` / `multiBite` / `swallow` / `stepPlayerHits` / `hurt` /
  `stepHunger` / `stepCombo` / `stepFrenzy` / `stepMusic` / `onDeath` /
  `finishRun`, all verbatim. The four review-tagged authorities survive
  intact: RF-COINS-01 (swallow pays once, zeroes `e.coins` before
  `World.kill`; pickups stay world.js's), RF-HITS-01 (world.js is the single
  damage authority, `playerHits` consumed in the frame it was filled),
  RF-BEST-01 (`comboPeak` high-water mark), RF-PASSIVE-01 (`liveMult` prefers
  `st.statMults` over the boot snapshot).
- **Eat feedback parity**: two-stage burst (`deathBurst` + `motes` sized by
  meal tier, prey-tinted), pooled score popup at the bite point, jaw snap
  (`st.jawSnapT = 0.18`), scale pop (`st.eatPopT = 0.16`), hit-stop 40 ms for
  a small meal / 60 ms at `mealT >= p.tier - 1`, and multiBite's own 40 ms.
- **Death**: undying revive at 35% hp, then slow-mo requested through
  `RF.Juice.slowmo(0.32, 1200)` and READ BACK via `consumeSlowmo()` so
  juice.js stays the authority (RF-CHRONO-01), results scheduled off
  `ctx.time.now` (never setTimeout), `abilitiesReset()` before leaving.
- **DevMode / meta**: `RF.DevMode.init()` is called BEFORE `RF.Meta.load`,
  exactly as game.js did, so `window.__rf` compatibility comes from meta.js
  unchanged. Per NOTES-laneC the accessors used are `RF.Meta.activeShark`
  (run selection, dev pick layered and never persisted) and
  `RF.Meta.displayCoins` (persisted + non-persisted overlay); this file
  fabricates no second coin overlay.

### What is new (the 3D render layer)

- **Renderer**: `WebGLRenderer({antialias:true})`, own
  `setPixelRatio(min(dpr,3))` computed locally - `GGKit.hiDpi.three()` is
  deliberately NOT used because it derives from the kill-switched `hiDpi.dpr()`
  and would give a 1x backing store on a retina phone. `ACESFilmicToneMapping`,
  sRGB output.
- **Camera**: perspective fov 50 at `(px, -py, 620)` looking at `(px, -py, 0)`
  per the SPEC3D space contract. World `(x, y-down)` maps to three
  `(x, -y, z)`; gameplay plane z=0. Follow is an exponential approach (rate
  6/s) on a velocity lookahead point (0.28 s of velocity, capped at 190 px),
  plus a mild FOV ease of +6 deg across the speed fraction (rate 2.2/s). Shake
  is read from `kit.juice.frame()` as a positional impulse on both the camera
  and its lookAt, so the shake does not swing the aim.
- **Lighting / zone look**: hemisphere (sky `#9fd4e8` / deep `#06121e`) plus a
  non-shadowing directional sun. `stepZoneLook` lerps `FogExp2` color and
  density, the clear color, and the hemisphere color/intensity toward the
  current `RFD.ZONES` row so a zone crossing is unmistakable. `data.js` writes
  some of those colors as `'0x1b4d66'` STRINGS, so `hexNum()` normalises both
  spellings.
- **Score popups**: eight pooled `THREE.Sprite`s over canvas textures, painted
  on demand and recycled by cursor; rise 46 px/s and fade over 0.7 s, exactly
  the 2D timings. Zero allocation at eat time.
- **HUD**: no drawing here at all. A single REUSED `HUD_STATE` object (hp,
  hpFrac, boost, boosting, power/ready/id/tint, coins, score, combo, comboMult,
  frenzy, goldRush, hurt, tier, zone, dev, chips queue) is pushed to
  `RF.UI.hudState(obj)` once per frame, guarded. The combo chip QUEUE is
  handed over as `chips` (bounded to 4 via `GGKit.boundedPush`); Lane C3 owns
  the one-at-a-time <=24px <=1s presentation per UI_LAW.
- **Stick as DOM**: a fixed-position `#rf-stick` overlay with a ring and nub
  div, `pointer-events:none`. Because kit pointer coordinates are already
  viewport CSS px and the DOM overlay is in the same space, the whole
  `toDesign()` / `cssRect()` conversion layer that the Phaser rev needed is
  GONE. This is a simplification, not a behaviour change.

### Fallbacks (every concurrent lane is guarded)

| Missing lane | Degraded behaviour |
|---|---|
| `RF.Art3D` | `fallbackShark()` builds a colored capsule mesh (base/belly/accent from `def.sil.palette`) with a cone tail that still wags. Covers absent, throwing, AND malformed-record cases. |
| `RF.World` | No `init`/`update`/`query`/`kill`/`zoneAt` calls; water is empty and `zoneAtFallback(y)` supplies the zone row for hunger pressure and fog. |
| `RF.Fx` / `RF.Juice` / `RF.Sound` / `RF.Music` | Guarded no-ops. `fxEmit` returns the emitted COUNT so `swimtrail`/`breach` fall back to `bubbles`/`splash` on an older fx3d, without doubling the breach sound. |
| `RF.UI` | Console-quiet no-ops via `uiCall()`. Results payload is still parked on `RF.Game.lastResults`. |
| `RF.Abilities` | `resolvePassives` synthesises the struct from the shark row's own `passives` array (incl. the `slowMetabMult` number). |
| `RF.Meta` | `fallbackProfile` + local run banking so coins are never silently lost. |
| No `CapsuleGeometry` | Falls back to `CylinderGeometry` (capsules landed in r140; the vendored build is r160, but an older vendor swap must not throw at boot). |

### Selftest

`RF.Game.__selftest()` is **renderer-free**: it constructs NO `WebGLRenderer`
(there is no GL context under node), stubs the scene as a plain object and
leaves the camera null, then drives the real `step()` / `stepControl()` /
`stepAnim()` / `stepEat()` / `stepHunger()` / `stepMotion()` / `swallow()` /
`renderPlayer()` directly. It restores every global it touches in a `finally`.
Assertions are game.js's, ported, plus new ones for the 3D-specific paths
(Art3D absence/throw/malformed, the `animate()` state bag, `RF.UI` absence and
throw, the `(x, -y)` mapping on a real `THREE.Group`, eat-feedback parity).

The vendored three.module.min.js DOES import cleanly under node (r160, no
browser needed), so the module loads headlessly; only the renderer would need
a GL context, which the selftest avoids. Node resolves bare specifiers
relative to the IMPORTER, so a `node --import` resolve hook mirrors the
browser importmap rather than putting a `node_modules` into the repo.

```
$ node --input-type=module -e "import('.../three.module.min.js')"
  THREE OK function 160                    # vendored module loads under node

$ node --import ./register.mjs harness.mjs     # three -> vendored, no DOM
  RFD sharks: 61
  RF.Game keys: boot,__selftest,dpr,CSS_W,CSS_H,STEP,startRun,endRun,
                firePower,lastResults,ctx,kit,profile,renderer,scene,camera,three
  76 ok, 0 FAIL
  RESULT pass=true

$ node --import ./register.mjs siblings.mjs    # data + meta + abilities + engine3d
  console.error during load: 0
  namespaces: Meta,DevMode,Abilities,Game
  RF.Meta.activeShark: function | displayCoins: function | DevMode.init: function
  RF.Abilities.passives: function
  assertions: 76 LANE A3 SELFTEST pass=true   # passes against the REAL resolver

$ node --import ./register.mjs devmode.mjs     # ?unlockall=1&coins=500
  __rf after init : object
  __rf keys: version,state,switches,unlockAll,resetSave,giveCoins,
             forceGoldRush,forcePower,forceZone
  forceUnlockAll: true | version: 1
```

The three `console.error` lines the harness prints are the deliberate
throw-absorption assertions (a throwing `Art3D.animate`, a throwing
`Art3D.buildShark`, a throwing `UI.hudState`) proving the guards catch rather
than propagate. Each goes through `warnOnce`, so none can repeat per frame.

Law sweep: 0 em dashes, 0 `Math.random` in code, 0 `setTimeout`/`setInterval`
in code (both greps hit comments only), no allocation in `stepControl` /
`stepAnim` / `stepMotion` / `stepEat` (`EAT_BUF`, `FX_OPT`, `HUD_STATE` and
`anim.state` are all pre-allocated and reused), every cross-namespace call
guarded and wrapped. The only `addEventListener` calls are `resize` and
`orientationchange` for renderer sizing, which is the deep-ballast precedent
and is not game input; ALL game input remains on `kit.input` subscriptions,
torn down through `unbindInput()` on `endRun()`.

### Deviations from SPEC3D / game.js (flagged, none silent)

1. **`ctx.scene` is now a THREE.Scene.** SPEC.md described it as "active
   Phaser.Scene (Ocean during play)". There is no Phaser in this rev, so the
   field carries the THREE.Scene and `ctx.scene3` is provided as an explicit
   alias. Any lane that only ever passed it through is unaffected.
2. **No design-space conversion (`S()` / `toDesign()` / `cssRect()`).** The
   Phaser rev sized the game in device px and needed a CSS->device conversion
   for every number. Three owns density through `setPixelRatio`, and the DOM
   UI is authored in CSS px, so the whole conversion layer is deleted rather
   than ported. `RF.Game.S` is therefore NOT exported; no 3D lane should need
   it. If a lane does, say so and it comes back.
3. **The invulnerability blink toggles `group.visible`** rather than setting
   alpha 0.35. Per-object alpha in three means touching every material on the
   rig, which is Lane D3's to own; the 14 Hz visibility toggle reads the same.
4. **Menu / Shop / Results are Lane C3's DOM screens.** This file exposes
   `startRun(id)` / `endRun()` / `firePower()` and calls `RF.UI.init(...)`
   with those handles, `showResults(payload)` and `showMenu()`. `finishRun()`
   parks the payload on `RF.Game.lastResults` so nothing is lost if ui3d.js is
   late. The Phaser `registerMetaScenes()` path is gone (meta.js's Phaser
   scenes are simply never built, which SPEC3D already anticipated).
5. **Tutorial text is handed to `RF.UI.tutorial(str)`** instead of being drawn;
   the `profile.tutorialDone` commit still happens here so the once-only rule
   cannot be lost with the UI lane.

### Not done / for the orchestrator

- **Not verified in a browser or on a device.** No renderer has ever been
  constructed: this lane proved the SIM and the guards headlessly, and nothing
  about the actual GL output, draw-call count, triangle budget or the 60fps
  mid-phone gate is discharged. The console-clean 844x390 DPR3 boot, the 61/61
  `?unlockall=1` sweep, the <=120MB memory gate and the owner's iPhone verdict
  all remain open.
- **The camera constants are reasoned, not tuned.** `CAM_Z` 620 with fov 50
  frames roughly the 2D design box at the gameplay plane, but the lookahead
  (0.28 s / 190 px cap), the follow rate (6/s) and the +6 deg FOV ease want a
  real thumb on real water. They are single named constants at the top of the
  file for exactly that reason.
- **`RF.Art3D.buildShark` has never executed.** The rig path is proven only
  against a fake rig and the capsule fallback. When Lane D3 lands, the first
  things to check are that `group` is oriented nose along +X (the fallback
  assumes it) and that `animate(t, state)` reads the state bag synchronously -
  it is REUSED scratch and must not be retained.
- **NPC shark rigs are not wired.** world3d.js owns its own pool and update
  loop; this file animates only the player. If Lane B wants a shared helper,
  `buildPlayerRig`'s guard pattern is the one to copy.
- **`RF.UI` surface is proposed, not agreed.** This lane calls `init`,
  `hudState`, `tutorial`, `showResults`, `showMenu`, `runStarted`, `runEnded`.
  All are guarded so a different Lane C3 shape cannot crash the engine, but
  the two lanes must reconcile the names before integration.
