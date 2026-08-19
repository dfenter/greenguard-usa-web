# Razorfin build log

Scaffolded 2026-08-19 (boot shell, sw, manifest, assets from lunker-lake, licenses transcribed).

---

## Merged lane log: NOTES-D.md

# Lane D art pass

Built `sharkart.js` with:

- Retina-aware cached shark baking through `GGKit.hiDpi.canvas`, with play and 2x menu variants.
- Smooth countershaded bodies, scaled fins and tails, eye highlights, gills, and deterministic vector detailing.
- Distinct profiles for all 14 contract heads, including the currently unused `frill` profile.
- Ten reusable pattern painters covering every pattern name found in `data.js`. No pattern names are unmapped.
- Eight reusable glow families covering every FX name found in `data.js`. `dorsalCharge` has a dedicated bright dorsal plate pass.
- Procedural ray, turtle, swordfish/marlin, squid, large squid, grazer, calf, mine, jelly, and puffer textures. Non-procedural sprite keys pass through unchanged.
- `RF.Art.paletteOf()` and `RF.Art.__selftest()` per `SPEC.md`.

Decisions:

- Drawing remains in CSS units after the kit has scaled the backing canvas. The headless fallback is only used when no DOM or kit exists and uses DPR 2 for the self-test.
- Glow work uses a lighter composite pass, shadow blur, and a crisp second stroke. This keeps Act 2 and Act 3 silhouettes readable even when their glow value is zero by falling back to accent colour.
- Procedural geometry uses fixed loops and fixed coordinates. No `Math.random`, timers, listeners, or per-frame state are used.
- A small in-file memory canvas is included only to make the module self-testable in Node without adding a dependency.

Self-test command:

```text
node -e "global.window={RF:{}}; require('./play/razorfin/data.js'); require('./play/razorfin/sharkart.js'); const r=window.RF.Art.__selftest(); console.log(JSON.stringify(r)); if(!r.pass) process.exit(1)"
```

Output:

```text
{"pass":true,"notes":["leviathanrex sampled colours: 1093","procedural creature textures: 11","DPR: 2"]}
```

Additional sweep: all 61 shark rows baked in both variants, all 14 head profiles exercised, and all procedural data rows baked. Result: 146 textures, zero errors.

## Pass 2 (silhouette fix)

Reworked only the shark silhouette geometry in `sharkart.js` after the first
art review. The primary body is now a fusiform bezier profile with a narrow
caudal peduncle, a max-girth station at 32% body length back from the nose,
and a girth-driven 3.2:1 to 2.4:1 body aspect. The upper caudal lobe is longer
and swept, the lower lobe is shorter, and the dorsal, pectoral, pelvic, and
anal fins are explicit triangular forms scaled by `finScale`. Kaiju uses its
jagged dorsal plate row in place of the ordinary dorsal fin.

The existing head painters, palettes, patterns, and FX remain in the render
order. Generic eye, gill, and mouth placement was tightened to the shark
profile: the eye is smaller and high, five angled gill strokes sit behind the
head, and tier 5+ mouths gain visible teeth. Croc, hammer, saw, whale, eel,
and kaiju front archetypes retain their specialized feature passes.

The menu bake uses the same geometry at 2x dimensions. The self-test now
checks five representative primary-body bboxes, measuring peduncle-to-nose
width against the widest opaque body row and requiring >= 2.0; fins and tail
are excluded from that body-only metric as documented in the source. It also
checks the menu geometry and supersampling relationship.

Pass 2 proof:

```text
node --check play/razorfin/sharkart.js                         PASS
RF.Art.__selftest()                                            PASS
body aspects: reef 2.98, hammerhead 2.93, snapjaw 2.67,
              ironfin 2.76, leviathanrex 2.40                  PASS
61 shark rows x play/menu variants: 122 textures, zero errors PASS
```

---

## Merged lane log: NOTES-E.md

# Razorfin Lane E pass 1

Implemented `RF.Abilities` in `play/razorfin/abilities.js`.

The module is classic-script safe, attaches only `RF.Abilities`, guards scene-dependent world and FX calls, uses no random source or timers, and includes `RF.Abilities.__selftest()`.

## Passive mapping

The resolver returns the named boolean flags plus normalized numeric fields. `biteUp` and `biteUpTiers` are tier bonuses, while `lunge` remains a boolean and `lungeRangeMult` carries range strength. `statMults` mirrors the base stat multipliers for game-side reads.

| Data id | Resolved result |
| --- | --- |
| `wideBite` | `wideBite=true`, `wideBiteMult=1.35` |
| `lunge` | `lunge=true`, `lungeRangeMult=1.25` |
| `lungeMega` | `lunge=true`, `lungeRangeMult=2` |
| `biteUp` | `biteUp=1`, `biteUpTiers=1`, `biteMult=1.1` |
| `biteUpX` | `biteUp=2`, `biteUpTiers=2`, `biteMult=1.2` |
| `filterFeed` | `filterFeed=true`, `filterFeedMult=1.25` |
| `filterFeedMax` | `filterFeed=true`, `filterFeedMax=true`, `filterFeedMult=1.6` |
| `ambush` | `ambush=true`, `ambushMult=1.35` |
| `slowMetab` | `slowMetab=true`, `slowMetabMult=0.75`, `metabMult=0.75` |
| `slowMetabX` | `slowMetab=true`, `slowMetabMult=0.5`, `metabMult=0.5` |
| `junkEater` | `junkEater=true` |
| `pressureImmune` | `pressureImmune=true` |
| `armored` | `armored=true`, `damageTakenMult=0.7` |
| `coinMagnet` | `coinMagnet=true`, `coinMagnetRange=1.2` |
| `fireWake` | `fireWake=true`, `fireWakeMult=1` |
| `fireWakeX` | `fireWake=true`, `fireWakeMult=2` |
| `dreadAura` | `dreadAura=true`, `dreadAuraMult=1` |
| `dreadAuraX` | `dreadAura=true`, `dreadAuraMult=2` |
| `undying` | `undying=true` |
| `comboPlus` | `comboPlus=true`, `comboPlusMult=1.25` |
| `comboSpeed` | `comboSpeed=true`, `comboSpeedMult=1.25` |
| `spines` | `spines=true` |
| `stealth` | `stealth=true` |
| `regen` | `regen=true`, `regenRate=0.04` max HP per second |
| `freeTurn` | `freeTurn=true` |
| `blink` | `blink=true` |
| `toxinWake` | `toxinWake=true` |
| `freezeTouch` | `freezeTouch=true` |
| `shockTouch` | `shockTouch=true` |
| `drain` | `drain=true` |
| `mineHeal` | `mineHeal=true` |
| `fireImmune` | `fireImmune=true` |
| `toxinEater` | `toxinEater=true` |
| `infect` | `infect=true` |
| `surfacePower` | `surfacePower=true`, runtime speed, bite, and boost scale up toward the zone surface |
| `depthPower` | `depthPower=true`, runtime speed, bite, and boost scale up toward zone depth |
| `freezeField` | `freezeField=true`, runtime freeze aura |

The boot scan checks every `RFD.SHARKS` passive and active id. Unknown ids report through `console.error` and do not crash construction.

## Active powers

All ten powers are dispatched once by `RFD.ABILITIES[id].kind`: cone Pyro sets `cookedBy` and `burnT`, pulse Freeze, Sonic, and Quake set radial timers, Chain Volt selects nearest unvisited entities, Toxin writes `poisonT`, Vortex writes pull fields, Phase writes `phaseT`, Chrono restores the saved `run.timeScale`, and Atomic performs a windup, beam sweep, and world kill including hazards such as mines. FX calls are limited to `RF.Fx.emit` and `RF.Fx.beam`.

Meter state is `ctx.player.st.powerCharge`. Each swallowed entity contributes `max(1, tier) * (1 + powerLevel * RFD.ECONOMY.upgradeEffect.power)` and clamps at the active definition's `charge` value.

## Self-test

Command:

```text
node -e "const fs=require('fs'),vm=require('vm'); global.window={RF:{}}; window.console=console; vm.runInThisContext(fs.readFileSync('play/razorfin/data.js','utf8')); vm.runInThisContext(fs.readFileSync('play/razorfin/abilities.js','utf8')); const r=window.RF.Abilities.__selftest(); console.log(JSON.stringify(r)); if(!r.pass) process.exit(1);"
```

Output:

```text
{"pass":true,"notes":[]}
```

---

## Merged lane log: NOTES-F.md

# Razorfin Lane F build log

## Built

- `RF.Fx`: five bounded manual pools for bubbles, score/blood motes, element sparks, shockwave rings, and atomic beam cores. Sprites are prebuilt in `RF.Fx.init(scene)`, use additive blending, and are advanced by one scene update hook without per-frame pool or options allocations. `chomp` and `deathBurst` alias the motes pool.
- `RF.Juice`: capped additive hit-stop accumulator, max-stacked camera shake, pooled-safe slow-motion requests, and Leviathan Rex glow/audio/quake presence. Both `leviathanrex` and the contract spelling `leviathan_rex` are accepted.
- `RF.Sound`: file-backed SFX register and playback through `kit.audio.sfx`; null-file entries use lazy deterministic WebAudio oscillators/noise. The synth path honors `kit.audio.prefs.mute` and `sfx`, calls `kit.audio.resume()`, and uses an exposed kit context when available before falling back to a local context.
- `RF.Music`: calm uses `kit.audio.music('calm', 700)` with the kit's music ownership token. Danger and goldrush keep calm underneath and crossfade one shared filtered-noise/bass overlay, so repeated layer changes cannot double-start the calm track or overlay.

## Slow-mo consumption contract

`RF.Juice.slowmo(scale, ms)` combines overlapping requests by taking the lowest scale and longest duration. `RF.Juice.consumeSlowmo()` returns `null` when empty, otherwise the reusable object `{scale, ms}` and clears the pending request. `game.js` should consume it once per frame, set `ctx.run.timeScale = result.scale`, and track `ctx.run.slowmoT` in seconds with `result.ms / 1000`; restore `timeScale` to `1` when that timer expires. `consumeFreeze()` is the scalar per-frame hit-stop read and clears its accumulator.

## Self-test

Command:

```sh
node --check play/razorfin/juice.js && node -e "global.window={}; require('./play/razorfin/data.js'); require('./play/razorfin/juice.js'); var r=window.RF; var out={fx:r.Fx.__selftest(),juice:r.Juice.__selftest(),sound:r.Sound.__selftest(),music:r.Music.__selftest()}; console.log(JSON.stringify(out)); if(!out.fx.pass||!out.juice.pass||!out.sound.pass||!out.music.pass) process.exit(1);"
```

Output:

```text
{"fx":{"pass":true,"notes":["five pooled families constructed and emitted","manual update completed without allocation paths"]},"juice":{"pass":true,"notes":["hit-stop accumulator consumed and reset","slowmo reads through RF.Juice.consumeSlowmo()"]},"sound":{"pass":true,"notes":["synth fallback table covers every RFD.SFX key","file-backed entries use kit.audio.sfx; null entries use lazy WebAudio synthesis"]},"music":{"pass":true,"notes":["calm uses kit.audio.music with its ownership token","danger and goldrush share one crossfaded synthesized overlay"]}}
```

---

## Merged lane log: NOTES-laneA.md

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

## Merged lane log: NOTES-laneB.md

# Lane B build log (world.js, RF.World)

## Lane B pass 1: what / why / self-test result

### What was built

`world.js` only, namespace `RF.World`, per SPEC.md "world.js (Lane B)".
No other file in the title was read-modified. Public surface is exactly the
contract: `init`, `update`, `query`, `spawnBurst`, `kill`, `zoneAt`,
`entities`, plus `playerHits` (the array game.js consumes for predator bites,
mandated by the lane brief) and two non-contract debug helpers, `stats()` and
`detonate()`.

1. **Layered background.** One vertical gradient band per `RFD.ZONES` row,
   baked once through `GGKit.hiDpi.canvas` and stretched over the band height,
   each blending its own `tint` into the NEXT zone's tint so the four bands
   read as one continuous water column. A fog rectangle per band strengthens
   with depth (alpha 0.05 to 0.32 across zones 1 to 4). Ambient decoration is
   sparse and STATIC: 90 seafloor rocks, 70 kelp stalks through the zone 2
   band, 34 lighter stalks along the zone 1 shelf, all placed via `ctx.rng`,
   created once in `init`, never touched per frame. Surface strip at y=0..40
   is a single tileSprite with a sine `tilePositionX` scroll (one float write
   per frame). Camera and physics bounds set to 7200x3600.

2. **Entity pools.** `RFD.ENTITY_BUDGET.total` (140) entities preallocated in
   `init` with hidden Phaser images attached. `acquire`/`release` are internal.
   `S.entities` is kept dense by swap-pop, and `update` walks it BACKWARDS so a
   mid-walk `kill()` is safe. Nothing is allocated at runtime.

3. **Spatial hash.** 256px cells over a flat `cols*rows` array. Membership is
   incremental: `gridUpdate` only re-buckets an entity that actually crossed a
   cell boundary. `query(x,y,r,kindFilter)` accepts a kind string OR an array
   of kinds and returns a REUSED scratch array.

4. **Spawner.** Budgeted ring 900 to 1400px from camera centre, despawn past
   2000px, one spawn attempt per step. Per-zone weighted tables from
   `zone.spawns` (rows are `[defId, weight]` pairs in data.js), pack sizes
   `packMin..packMax`, and a 12 percent predator roll off a table built once
   from `RFD.SHARKS` rows carrying `npc.zones`. On-screen non-pickup count is
   held at or under `ENTITY_BUDGET.onscreen` (70); measured steady state is
   exactly 70 active / 70 free.

5. **Hazards.** `mine` slow bob, contact damage `def.dmg` plus chain
   detonation of mines within 150px (breadth-first with a 64-iteration guard);
   `junkEater` on the player eats it instead with no damage. `jelly` sine
   drift, sting sets `player.st.slowT` on a 1.2s cadence. `puffer` inflates
   within 190px of the player, damaging and 1.5x sized while inflated, and is
   only eatable deflated (it reports `st.inflated` for game.js to read).

6. **Status effects.** Applied here, set by lane E, per SPEC: `frozenT` zeroes
   velocity and skips AI AND integration (position is genuinely held), `stunT`
   skips AI with drag, `burnT`/`poisonT` are DoT with score credited to
   `ctx.run` on the kill, `slowT` scales integration. Each state carries a
   sprite tint.

7. **Prey / predator AI.** Prey wander on a per-pack drift vector plus
   individual jitter, and flee inside a sight radius scaled by the tier gap.
   `ctx.player.st.dreadAura` INVERTS that flee into attraction; the flag is
   only READ here, never written. Predators patrol, pursue within 700px when
   `player.tier < npc.tier` and push a bite onto `RF.World.playerHits`, and
   flee when outranked (their score falls back to `tier*40`).

### Guarding

`RF.Fx`, `RF.Sound` and `RF.Art` are called only through wrappers that check
existence and swallow exceptions, so a missing or throwing sibling lane cannot
break the sim. With `RF.Art` absent, every def falls back to a tinted
countershaded ellipse texture with a tail wedge, generated ONCE per def id and
cached in `S.texCache`.

### Self-test result

`RF.World.__selftest()` stubs scene, ctx and a mulberry32 rng, so it runs with
no Phaser boot. Run headlessly under node with data.js + world.js loaded:

```
node --check world.js                       -> PARSE_OK
RF.World.__selftest()                       -> PASS: true   (20/20 assertions)
```

```
ok pool preallocated to ENTITY_BUDGET.total (140)
ok force-spawned 30 mixed entities (30)
ok query returns the 2 near neighbours and excludes the far one (2 hits)
ok kindFilter excludes non-matching kinds
ok frozen entity did not move
ok three test mines spawned
ok mine chain killed the adjacent mine within 150px
ok mine chain did not reach the distant mine
ok pool never exhausted across 300 updates (min free 65)
ok pool accounting balanced (74 active + 66 free)
ok active count never exceeded pool (75)
ok pool accounting balanced on every one of 300 steps
ok burn DoT killed the entity and credited score
ok higher-tier predator bit the player and pushed to playerHits (tiger t4)
ok playerHits carries positive damage
ok prey flees normally and dreadAura inverts it to attraction
ok junkEater ate the mine with no contact damage
ok zoneAt(100) resolves to zone 1
ok zoneAt(3500) resolves to zone 4
ok spawnBurst produced 5 entities
```

Zero console output during the run beyond the test's own lines.

### No-allocation proof

Measured rather than asserted. After 600 warm-up updates, 3000 further
steady-state updates under `node --expose-gc` with a moving player:

```
heap delta over 3000 updates: 52.8 KB  ->  18.03 bytes/update
pool at end: { active: 70, free: 70, pool: 140 }
```

That is measurement noise, not per-frame garbage: no array, vector or entity
is created inside `update`. Active count parks exactly at the 70 on-screen
budget.

---

## Notes for the other lanes

- **`query()` returns a SHARED scratch array. Results are valid only until the
  next `query()` call.** Copy anything you need to keep. `detonate()` inside
  this file already does exactly that, because it queries again while walking
  its own chain.

- **Never hold an entity reference across an `update()`.** Pooled objects are
  recycled, and a released entity can be re-acquired as a completely different
  creature WITHIN THE SAME update. This bit the lane B self-test itself: the
  junkEater assertion looked like a world bug (mine still `active` after being
  eaten) but the mine had been eaten correctly and its pooled object
  immediately reused as a `ray` by the spawner in the same step. Compare
  `ent.id` (and `defId`), not the object reference, to establish identity.
  Both the junkEater and mine-chain assertions now check by id.

- `playerHits` is CLEARED at the top of every `update` and refilled during it,
  so game.js must consume it in the same frame it steps the world. Entries are
  `{ent, dmg, x, y}`, with `sting:true` added for jelly contact.

- Status timers are FIELDS on `ent.st` and are decremented here. Lane E should
  SET `frozenT`/`stunT`/`burnT`/`poisonT`/`slowT` and read nothing back.

- `st.inflated` on a puffer is the eatable/not-eatable authority for game.js:
  eatable only while it is false.

- Player fields read by this file: `x`, `y`, `tier`, `r`, and the flags
  `st.dreadAura`, `st.junkEater`, `st.coinMagnet`. `st.slowT` on the player is
  written here by a jelly sting. `ctx.run.coins` and `ctx.run.score` are
  incremented on pickup collection and DoT kills respectively.

- Zone spawn rows in data.js are `[defId, weight]` ARRAYS, not objects. The
  weighted picker accepts both shapes, so a later data.js revision to
  `{defId, w}` will not break it.

---

## Merged lane log: NOTES-laneC.md

# Lane C build log (meta.js)

## Lane C pass 1: save schema, economy, Shop/Results scenes, DevMode

Delivered: `play/razorfin/meta.js` only. Namespaces `RF.Meta` and `RF.DevMode`.
No other lane's file touched. No `window`/`document` listeners registered, no
`setTimeout`/`setInterval`. Phaser is never booted here; the two scene classes
are handed to game.js on `RF.Meta.scenes` and are built only when
`typeof Phaser !== 'undefined'` (headless, `RF.Meta.scenes === null`).

### Save schema (SAVE_VERSION = 1)

Exactly the SPEC shape:

```
{ v:1, coins, xp, level, selected,
  sharks:{ [id]: { owned:bool, up:{bite,speed,boost,power} } },
  best:{ score, biggestTier }, runs, tutorialDone, lastBonusDay }
```

`defaultProfile()` owns and selects `reef` with a zeroed up block, everything
else empty.

`validateSave()` is strict and rejects the WHOLE record on any violation, so a
corrupt store always falls back to a fresh profile rather than a half-repaired
one. Checked: object-ness (arrays rejected), `v === 1`, `coins`/`xp` finite
safe integers in `0..1e12`, `level` integer `1..RFD.ECONOMY.levelCap` (60),
`runs` `0..1e9`, `best.score` `0..1e12`, `best.biggestTier` `0..12`, `selected`
a string present in `RFD.SHARK_BY_ID`, every `sharks` key present in
`SHARK_BY_ID`, every `up` key one of the four tracks, every up level an integer
`0..RFD.ECONOMY.upgradeCosts.levels` (5), `lastBonusDay` null or a short string.

Two rules beyond the brief, both because the state is not representable by any
legal play sequence and would otherwise let a hand-edited store buy value:
- `selected` must be owned by the PERSISTED record (a dev pick never lands here,
  by construction, see below).
- a shark with `owned:false` may not carry upgrade levels above zero.

`tutorialDone` and `owned` are the only coerced fields, and only from `0`/`1`;
any other type rejects. Coercion happens in `normalize()` after validation.

### Migration chain

`migrate()` follows the horde-meridian forward pattern: one step per version,
falling through. A record with `v == null` is a pre-release write, so it is
rebuilt from `defaultProfile()` carrying only `coins`/`xp`/`runs`/`tutorialDone`
when each is individually plausible, and `level` is RECOMPUTED from the carried
xp rather than trusted. Anything with an unrecognised `v` returns null and the
caller takes the default. The next step slots in at the marked comment:
`if (p.v === 1) { ...; p.v = 2; }`.

`load(kit)` is `kit.save.get(null)` -> `migrate` -> `validateSave` -> `normalize`,
with every stage wrapped so a throwing store cannot block boot. `commit()`
re-validates a deep clone before writing, so an in-memory profile that some
other lane corrupted at runtime fails the write instead of poisoning storage.

### Economy

- `xpStep(n) = round(base * growth^(n-1))` with base 100, growth 1.13.
- `xpForLevel(n)` is the CUMULATIVE total to have reached level n, so
  `xpForLevel(1) = 0`. Measured: L2 100, L10 1,541, L30 25,856, L60 1,040,790.
- `levelForXp(xp)` inverts it and also returns `{into, need}` for the xp bar.
- `addXp` clamps at the cap and returns the level-up count.
- `tierUnlocked(profile, tier)` is `profile.level >= ECONOMY.tierUnlockLevel[tier]`
  (T1@L1 through T12@L60), and is forced true under `forceUnlockAll`.
- `upgradeCost(tier, lvl) = round(base * growth^lvl * (1 + tier*tierMult))` with
  base 400, growth 1.7, tierMult 0.6. Tier 1 track: 640, 1088, 1850, 3144, 5345.
  Tier 12 track: 3280, 5576, 9479, 16115, 27395.
- `canBuy`/`buy` take `{shark:id}` or `{upgrade:{id,track}}` and return
  `{ok, reason}` (reasons: `bad-request`, `unknown-shark`, `unknown-track`,
  `owned`, `dev-unlocked`, `not-owned`, `locked` (+`needLevel`), `coins`
  (+`cost`), `maxed`). `buy` mutates the profile only on success.

### Dev overlay law

`RF.DevMode.state` is never persisted, and three separate mechanisms enforce it:

1. `ownedFor()` may report true for a dev-unlocked shark, but `reallyOwned()`
   reads the persisted record only, and every write path uses `reallyOwned`.
2. `buy({shark})` refuses with `dev-unlocked` while `forceUnlockAll` is on, so
   there is no path that writes `owned:true` from the overlay.
3. `select()` writes `profile.selected` only for a genuinely owned shark.
   A dev-only pick goes to `RF.Meta.sessionSelected` instead, and
   `RF.Meta.activeShark(profile)` is what the run should read.

**sessionCoins** (`?coins`) is the same idea for currency: it is an additive
DISPLAY overlay (`displayCoins()` = persisted + overlay) that `spend()` drains
FIRST. A dev purchase therefore consumes overlay before it can touch persisted
coins, and once the overlay is exhausted further spending is real and honest.
Default grant is 50,000; `?coins=N` grants N. The selftest asserts the persisted
coin count is unchanged across two overlay-funded purchases.

`RF.DevMode.init()` parses `URLSearchParams` exactly once (idempotent guard),
inside try/catch, so a malformed query string cannot block boot. Switches:
`unlockall`, `invincible`, `coins`, `notut`, plus `zone`. It installs
`window.__rf = {version:1, state, switches, unlockAll(), resetSave(),
giveCoins(n), forceGoldRush(), forcePower(id), forceZone(n)}`. The `force*`
setters only write flags on `RF.DevMode.state`; the consuming lanes read them
under their own guards. `resetSave()` calls `kit.save.clear()`, rebuilds the
default into `RF.ctx.save`, and reloads.

### endRun

`endRun(ctx)` reads `ctx.run`, applies `coinRunMult`/`xpRunMult`, applies the
daily bonus when `profile.lastBonusDay !== localDayString()` (multiplier
`ECONOMY.dailyBonusMult` = 1.5, stamped once per local date), credits coins and
xp, computes level-ups, updates `best.score`/`best.biggestTier`, increments
`runs`, gathers unlock callouts for every tier whose required level was crossed
by this run, commits, and returns the results payload including `baseCoins`,
`bonusCoins`, `dailyBonus`, `xpInto`/`xpNeed` for the bar, `bestCombo` and
`newBest`.

### Scenes

Both are out-of-run, dark-water (`#02101c` with four depth bands), high
contrast, and every tap target is at least 44px.

**Shop**: a second Phaser camera scrolls the list while the header and footer
stay fixed (the main camera ignores the list container and the list camera
ignores the chrome). Three act sections, "Real Sharks" / "Monsters" /
"Legends", each sorted by tier then cost. Each row carries a palette-tinted
tier badge, name, three normalized stat bars (speed/bite/hp, denominators
derived from the roster maxima so a data.js regeneration stays correct),
passive and active chips as text, and a 96x46 button reading BUY / SELECT /
IN USE, or `LVL N` on a locked tier with the row state reading LOCKED. The
footer is the upgrade panel for the currently active shark: four tracks, five
pips each, live cost or MAX under each, whole column tappable. Failures speak
through a small self-fading toast, not a center banner.

Input uses `kit.input.onDown/onMove/onUp` when a kit is present (fleet law and
the `_shared/NOTES.md` release-side defect), falling back to the scene's own
Phaser input otherwise, and both feed the same handlers. Drags over 6px suppress
the tap so scrolling never fires a button. All subscriptions are unsubscribed on
scene `shutdown`.

**Results**: score with best or NEW BEST, biggest prey tier, best combo, coins
earned with a separate daily bonus line when it applied, an xp bar with the
level and a LEVEL UP flourish that eases off in `update()` (off the scene clock,
no timers), up to three unlock callouts, and AGAIN / SHOP / MENU buttons at 48px.
It renders a safe placeholder rather than throwing if started with no payload.

Cross-namespace calls are guarded: `RF.Art.paletteOf` is tried inside try/catch
and falls back to `sharkDef.sil.palette` from data.js, so the Shop renders
correctly even when Lane D has not loaded.

### Self-test proof

`RF.Meta.__selftest()` is headless. It stubs the kit as
`{save:{get,set,clear,_raw}}` and restores any mutated `RF.DevMode.state` and
`sessionSelected` on the way out, so running it never alters a live session.

Coverage: default validity and round-trip; eleven corrupted records each
rejected to default (NaN coins, unknown shark id, up level 9, selected unowned,
`v:99`, negative xp, level above cap, upgrades on an unowned shark, unknown up
track, coins over cap, `sharks` as an array); the buy path (earn, refused while
tier-gated, level to the cap, buy succeeds, upgrade five steps with each cost
asserted equal to the formula and the sequence strictly increasing, past-cap and
unowned refusals); the dev law (profile JSON byte-identical after `ownedFor` +
`select` + attempted rebuy of a legend, and the committed record contains
neither the legend id nor a changed `selected`); the sessionCoins overlay spent
first across two purchases with persisted coins untouched; endRun math (bonus
applied once, base-only on the second run of the same date, re-armed by a new
date, best not lowered by a worse run, runs incremented, level-ups from xp,
persisted record still valid); versionless migration carrying plausible values
and dropping implausible ones with the level recomputed; and the xp curve
(cumulative, strictly increasing to the cap, `levelForXp` inverts `xpForLevel`,
clamps at the cap).

```
$ node --check meta.js
PARSE OK

$ node -e "<data.js + meta.js in a window stub>; RF.Meta.__selftest()"
scenes (no Phaser) = null
__rf keys = version,state,switches,unlockAll,resetSave,giveCoins,forceGoldRush,forcePower,forceZone
---
PASS=true  checks=69  fails=0
```

Scene construction verified separately against a minimal `Phaser.Class` /
`Phaser.Scene` stub: both classes build, carry keys `Shop` and `Results`, and
`init()` runs clean.

```
scenes: [ 'Shop', 'Results' ]
Shop key: Shop has create: function
Results key: Results has create: function
selftest under Phaser: true
```

Dev switch parse verified live, including a malformed query string
(`?coins=abc&zone=99&unlockall=nope`) which parses without throwing and leaves
the boolean switches off.

No em dashes in the file (grep clean).

### For the orchestrator

- `RF.Meta.activeShark(profile)` is the call game.js should use to pick the run
  shark, NOT `profile.selected`, or a dev-selected shark will not take effect.
- `RF.Meta.displayCoins(profile)` is the number the HUD should show, not
  `profile.coins`, or the `?coins` overlay will be invisible.
- Shop and Results start sibling scenes by key (`Ocean`, `Shop`, `Menu`) and
  pass `{ctx}` through. If Lane A names those scenes differently the two `go`
  and `leave` calls are the only lines that need to change.
- `RF.DevMode.init()` must be called by game.js before the first
  `RF.Meta.load()` so `forceUnlockAll` is live when the Menu first queries
  ownership. It is idempotent, so a second call is harmless.
- `RF.Meta.scenes` is null when Phaser is absent. game.js should guard the add.
