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

## Lane B fix pass (REVIEW-1)

Scope: `world.js` only. Four findings owned by "B world" in `REVIEW-1.md`.

### RF-STATUS-01 (BLOCKING) - per-effect DoT payloads and immunity

`statusTick` no longer hard-codes `3 * dt` burn and `1.6 * dt` poison. Two new
resolvers pick the rate in priority order:

1. `st.burnDmg` / `st.poisonDmg`, the payload abilities.js writes when it
   stamps the timer (`applyBurn` / `applyPoison`, abilities.js:443-459).
2. the authored data row, `RFD.ABILITIES.pyro.dmg` and
   `RFD.ABILITIES.toxin.dot` (which is `0.8`, so Toxin Cloud now deals exactly
   its authored damage instead of double).
3. a hard constant, only reachable if data.js is missing the row.

The payload is zeroed when its timer expires, and `resetSt` clears both fields
so a recycled pool object can never inherit a previous creature's burn rate.

Immunity is honoured in two directions:

- Entity side: a `st.fireImmune` / `st.toxinImmune` entity has its timer
  cleared and takes zero DoT, so an immune target cannot be left burning by a
  path that bypassed the ability-side check.
- Player side: the player is NOT a world entity, so nothing else copied the
  resolved passives onto its status block. `syncPlayerImmunity(ctx)` runs once
  per `update()` and publishes `ctx.player.pas.fireImmune` and
  `pas.toxinImmune || pas.toxinEater` as `ctx.player.st.fireImmune` /
  `st.toxinImmune`, which is exactly what abilities.js reads. It only ever
  writes `ctx.player.st`; entity flags are untouched, and it is OR-based so an
  ability that sets a temporary immunity is never cleared by the sync.

### RF-WORLD-DEPTH-01 (BLOCKING) - depth has to read

Six static layers, all built once in `init()`, none touched per frame except
the single existing surface tile-scroll offset:

| depth | layer | what it does |
| --- | --- | --- |
| -100 | zone gradient | contrast-stretched per zone: the top lifts toward that zone's own fog colour (shallow lifts hard, abyss barely), the bottom lands on the NEXT zone's tint and is then pushed toward black. Each band therefore ends darker than the band below it begins, so a boundary is a step in value. |
| -95 | boundary seam | a dark downward fade below each zone edge plus a faint fog-tinted lift above it, so the join reads as a thermocline rather than a texture seam. |
| -90 | fog wash | alpha now ramps quadratically (`0.06 + i*i*0.055 + i*0.06`) instead of linearly, so the abyss is genuinely heavy. |
| -88 | depth vignette | mirrored 300px horizontal fade bars down both world edges, alpha `0.10 + i*0.13`, absent in zone 1. The camera is 844 wide so they always touch the view edges. |
| -86 | midwater silhouettes | see below. |
| -82/-81/-80 | surface light | see below. |

Midwater silhouettes are the answer to "open water is never a flat field".
Four shapes are baked procedurally to canvas (no new art assets needed) and
each zone gets its own, at its own value: `arch` on the shelf, `kelptower` in
midwater, `spire` in twilight, `chimney` in the abyss. 70 instances total,
scattered across the full width AND full height of their zone, tinted toward
that zone's darkness, given a randomised scroll factor of 0.55 to 0.8 so they
parallax as distance. These are plain `scene.add.image` statics: they never
enter the entity pool, so the 70 on-screen / 140 total entity budget is
completely unaffected.

Surface light now reaches the top 500px, not just a 40px strip at y=0:
a wide `0xbfe9f5` wash fading over `SURFACE_LIGHT_H`, 26 slanted god rays with
ADD blend (guarded), randomised widths, lengths and scroll factors, and then
the ribbon itself widened to 54px and brightened to `0xe6fbff` at alpha 0.72.
Zone 1 spans y 0 to 900, so the rays are visible for most of act 1.

Ambient particle character is now per zone, driven by an `AMBIENT` table
indexed by `zone.id - 1`:

| zone | family | cadence | character |
| --- | --- | --- | --- |
| 1 Sunlit Shelf | `bubbles` | 0.22s x3 | rising bubbles, plus a slow wide bright mote drifting up through the god rays whenever the camera is near the surface |
| 2 Kelp Midwater | `motes` | 0.26s x2 | green kelp motes drifting up-and-across |
| 3 Twilight Reef | `motes` | 0.30s x2 | pale marine snow, falling |
| 4 The Abyss | `motes` | 0.70s x1 | sparse, large, slow blue glow motes |

Cadence went from a flat 0.35s event to 0.22s in the shelf and 0.70s in the
abyss, so the water itself gets emptier as you descend. Options travel in ONE
module-level reused object (`ambientOpts`), verified in the smoke test: 62
emits across 600 updates shared a single opts identity, so this adds zero
per-frame allocation. Every emit still goes through the guarded `fx()` wrapper,
so world runs standalone with lane F absent.

Density note (SPEC Rev 3): all world bakes now go through a local
`bakeCanvas()` built on `RF.Game.dpr` with a fallback of 1, NOT
`GGKit.hiDpi.canvas`, which the 2026-08-17 fleet kill switch clamps to 1.
`bakeCanvas` returns null when there is no `document`, which is what keeps the
headless self-test working.

### RF-PERF-01 (MINOR) - pooled hit records

`playerHits` entries were object literals built at each of the four contact
sites. They are now drawn from a `hitPool` backing store via `pushHit()`, with
`resetHits()` at the top of `update()` nulling the `ent` reference (so a dead
entity is not held alive by a stale record) and rewinding the cursor. The pool
grows to the size of the worst frame ever seen and then never allocates again;
the self-test observes it settle at 1 record. The wire format is unchanged:
consumers still read `{ent, dmg, x, y, sting}`, and `sting` is now always
present as a boolean rather than only on jelly contact.

Consumption contract is UNCHANGED and still same-frame: records are recycled by
the next `update()`, so game.js must read them before stepping the world again.

### RF-PACK-01 (MINOR) - capped pack records

`S.packs` grew one entry per burst for the whole run. Records now come from a
`packRecs` ring of `PACK_MAX = 48`, recycled round-robin: acquiring a record
deletes its previous owner's map entry first, so `S.packs.size` can never
exceed 48. Each record carries an `owner` packId and `packVec` verifies
`p.owner === packId`, so an entity whose pack was recycled out from under it
cleanly falls back to solo drift instead of inheriting a stranger's heading.
Ring state is reset in `init()`.

### Self-test additions

`RF.World.__selftest()` gained six assertions, all passing:

- burn DoT honours `st.burnDmg`: two identical groupers, payloads 1 and 10,
  diverge by a measured ratio of 10.00 over 30 steps.
- burn DoT falls back to `RFD.ABILITIES.pyro.dmg` when no payload is set.
- poison DoT honours `st.poisonDmg`.
- a `fireImmune` entity takes zero burn and its timer clears.
- resolved player passives are published as `st.fireImmune` / `st.toxinImmune`.
- pack records bounded after 2000 updates: 507 packs created, `S.packs.size`
  ends at 48, pool length 48. The "more packs than the cap" assertion proves
  recycling was actually exercised rather than the test simply never filling
  the ring.
- hit record pool stayed small (1 record).

### Verification

```
node --check world.js                      -> clean
RF.World.__selftest()                       -> pass: true, 29/29 ok, 0 FAIL
```

Plus a canvas-stub smoke run (600 updates, camera walked through all four
zones) confirming: 38 textures baked including all 4 zone bands, both seam
strips, the vignette, all 4 silhouette shapes and all 3 surface layers; 253
static game objects created; entity pool steady at 70 active / 70 free; 62 fx
emits sharing exactly 1 opts object.

Grep gates: zero em dashes, zero `Math.random`, zero `window`/`document`
listeners, no `setTimeout`/`setInterval`. The only `GGKit` mention left in the
file is the comment explaining why world does not use it.

---

## Lane B tune pass: RF-WORLD-DEPTH-01 midwater silhouettes

Visual QA on the live 844x390 zone-1 frame accepted the god rays, surface
band, ambient particles and thermocline seams, and rejected the midwater
silhouettes: 70 shapes at alpha 0.14-0.58 placed anywhere in a zone's vertical
span read as large dark ovals floating mid-column, some spanning 40% of the
frame width, making the water murky and cluttered rather than deep. Diagnosis
matches the numbers: the shapes were baked on a 128x256 canvas and scaled up
to 3.4x, which is 435 design px, over half the 844 visible width, at an alpha
high enough to read as a solid object rather than as distance.

Four changes, all in `buildMidwaterDecor` and its `ZONE_SIL` table.

**1. Halved and pushed back.** Count 70 to 34 (6 / 10 / 10 / 8 by zone). Alpha
is now 0.04-0.09 across every zone, down from 0.14-0.58. At that value they
tint the water at the edge of vision instead of presenting as objects, which
is the whole intent: atmosphere, not scenery.

**2. Anchored, never free-floating.** Each row carries an `anchor` of `floor`
or `ceil` plus an `inset`. A shape's base is placed ON a zone boundary (the
last zone anchors to the world floor at `S.h`, where the existing rock decor
already lives), pushed `inset` px past it so it roots into the seam rather than
balancing exactly on the line. Origin is the shape's base at `(0.5, 1)`;
`floor` shapes rise upward from it, and a `ceil` shape gets a negative Y scale
so it hangs downward from the top edge instead. Origin and flip therefore do
not fight each other. All four zones currently anchor to `floor`, so kelp
towers, spires, chimneys and arches all rise from a seafloor or a boundary,
which is what the QA note asked for. The `ceil` path is wired and tested by the
geometry check so a later revision can hang shapes from the surface light
without touching the placement code.

**3. Scale ceiling is derived, not guessed.**

```
SIL_W = 128            silhouette source canvas width
CAM_W = 844            design units visible across the camera
SIL_MAX_FRAC = 0.25    no silhouette wider than a quarter of the frame
SIL_MAX_SCALE = (CAM_W * SIL_MAX_FRAC) / SIL_W = 1.648
```

Every instance clamps to `SIL_MAX_SCALE`. Measured worst case across a full
build is 202.9 design px, which is 24.0% of the 844 frame, inside the cap.

**4. Parallax retained**, 0.55-0.8, measured 0.57-0.78 in the build.

### Camera zoom reconciliation (lane A `cameras.main.setZoom(DPR)`)

Checked against `NOTES-laneA.md` and `game.js:871`. Lane A sizes the game in
device px and then sets `cameras.main.setZoom(DPR)` specifically so that world
coordinates STAY in design units for world.js and abilities.js. Two
consequences for this lane, both verified:

- Scroll factors are unaffected. Phaser applies `scrollFactor` to the
  world-space camera scroll before the zoom transform, so the parallax ratio is
  identical at DPR 1, 2 and 3. Nothing to change.
- The scale cap MUST be measured against the design width, 844, not the
  device-px backing store, which is `844 * DPR`. Measuring against the backing
  store would have let a silhouette be three times too wide on a DPR3 phone
  while still passing a naive percentage check. `CAM_W` is therefore the design
  constant, and the derived `SIL_MAX_SCALE` holds at every DPR.

Screen-space HUD lives on lane A's separate `hudCam` at zoom 1 and never
interacts with world decor, so there is no depth or ignore-list overlap with
the `-100` to `-80` background layers.

### Verification

```
node --check world.js        -> clean
RF.World.__selftest()         -> pass: true, 29/29 ok, 0 FAIL
```

Geometry check over a full build, all against the 844 design frame:

```
silhouette count                34   (was 70)
max width                       202.9 design px = 24.0% of frame  [cap 25%]
alpha range                     0.042 to 0.089                    [target 0.04-0.09]
scrollFactor range              0.57 to 0.78                      [parallax kept]
unanchored shapes               0 of 34
per-zone                        6 / 10 / 10 / 8
```

Smoke run (600 updates walking all four zones): 42 textures baked, 222 static
game objects (was 253), entity pool steady at 70 active / 70 free, 46 fx emits
sharing exactly 1 opts object, so the tune is still zero per-frame allocation.
Zero em dashes.
