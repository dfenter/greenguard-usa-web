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

---

## Lane B Rev 4: living water

Scope: `world.js` only, plus this section. SPEC.md "Rev 4 / Living water" is
the binding brief. Owner verdict being answered: the world reads static and
flat, it must be ALIVE.

The governing idea for the whole pass: **nothing in this file tweens, and
nothing reads wall time.** Every animation is a pure `sin()` of the fixed-step
sim clock, evaluated fresh each frame from state that was allocated once in
`init()`. That is what makes the pass free of per-frame allocation, correct
under pause (a paused clock freezes the world instead of skipping it forward),
and deterministic for the self-test.

### The clock

`worldClock(ctx, dt)` returns the animation time in seconds.

- Primary: `ctx.time.now`, the fixed-step clock game.js owns and advances by
  `STEP` per step. This is what SPEC Rev 4 means by "offsets from ctx time not
  wall clock".
- Fallback: when `time.now` does not advance (headless callers, the self-test,
  any host that leaves it at 0) it accumulates `dt` internally.

Monotonic in both cases. `Date.now` and `performance.now` appear nowhere in
the file, verified by grep.

### 1. Animated water

| layer | motion | parameters |
| --- | --- | --- |
| caustic bands | horizontal sine drift + independent alpha breath, ADD blend | `CAUSTIC_N` 3 strips in the top `CAUSTIC_H` 600px, `CAUSTIC_DRIFT` 190px travel, rate 0.055-0.085, alpha 0.05-0.12 breathing at 0.55 of base, drift rate and alpha rate are DIFFERENT per strip |
| god rays | rotation sway + alpha cycle | `RAY_ROT_AMP` +-0.03 rad at 0.06-0.13, alpha over `RAY_ALPHA_LO` 0.5 to 1.0 of each ray's own baked base at 0.09-0.19, rotation phase and alpha phase drawn separately per ray |
| water tint | whole-column alpha breath | `SHIMMER_ALPHA` 0.012-0.05 at `SHIMMER_RATE` 0.043, one full-world ADD rectangle |
| thermocline seams | horizontal drift | `SEAM_DRIFT` 70px at 0.03-0.06 |

Caustics use a new `causticTexture()` bake: soft on all four edges (vertical
gradient, then a horizontal `destination-in` mask), so a strip stretched across
the world reads as a band of refracted sunlight and not as a rectangle with
visible ends.

Two details that matter and are easy to get wrong:

- **Drifting strips are built oversized.** Caustics are `S.w + CAUSTIC_DRIFT*4`
  wide and seams are `S.w + SEAM_DRIFT*4` wide, each started pulled left by
  half of that margin. A strip exactly world-width would slide its own end into
  frame at the extremes of the sine and show a hard edge at the world boundary.
- **Rotation and alpha run on different rates AND different phases.** With one
  shared rate, 26 rays visibly pulse together no matter how the phases are
  spread; the beat between two unequal rates is what keeps the layer from ever
  reading as a loop.

### 2. Decor motion

- **Seaweed and kelp sway.** `place()` in `buildDecor` takes a new `sway` flag;
  both seaweed bands (104 stalks) register. Origin was already `(0.5, 1)`, the
  rooted base, so the sway is a ROTATION about that root, which is how a stalk
  actually moves in a current. `SWAY_AMP` 0.045-0.13 rad scaled by the stalk's
  own height (`clamp(scale/1.2, 0.5, 1.5)`), rate `SWAY_RATE` 0.30-0.62, phase
  per instance from the seeded rng.
- **Midwater silhouettes drift.** All 34 register, `SIL_DRIFT` 3-7px on X and
  0.4 of that on Y, rate 0.035-0.075. Deliberately tiny: the previous tune pass
  ANCHORED these to zone boundaries, and that anchor is not being given back.
  The motion is an OFFSET from the stored placed position (`x0`, `y0`), never
  an accumulation, so a shape cannot creep off its seam over a long run.

### 3. Creature animation

All of it runs in the existing entity loop, immediately after the sprite
position and heading are written, so it costs one branch and one or two
`sin()` calls per active entity. O(active entities), no tweens, no allocation.

Per-entity phase is `(id * PHI % 1) * TAU` with `PHI` the golden ratio. Chosen
over `id * k` for a plain constant because consecutive ids land maximally far
apart on the circle: a pack spawned in a single burst gets consecutive ids, and
with any rational multiplier that pack would swim in visible lockstep. Measured
in the self-test: two entities spawned back to back get phases 0.980 and 4.863.

| creature | animation | parameters |
| --- | --- | --- |
| prey fish | tail wiggle as a rotation offset on top of `e.angle` | `FISH_WIGGLE` +-0.12 rad, amplitude `0.25 + 0.75*f`, rate `FISH_WIGGLE_HZ` 2.2-7.5 Hz interpolated by `f` |
| NPC predator sharks | whole-sprite pitch oscillation | `NPC_PITCH` 0.05 rad at `NPC_PITCH_HZ` 0.9, amplitude `0.35 + 0.65*f` |
| jelly | bell pulse, X and Y counter-scaled so the bell contracts as it rises | `JELLY_PULSE` +-0.08 (scale 0.92-1.08) at `JELLY_RATE` 0.55, driven off `st.drift`, which is the SAME value `hazardAI` already uses for the vertical bob, so pulse and bob are synced by construction |
| puffer | inflate/deflate eased over time instead of snapping | `PUFF_TIME` 0.2s across the 1.0 to 1.5 range |
| pickups | alpha glint | `GLINT_AMP` 0.22 at `GLINT_RATE` 1.6 |

`f` is `clamp(speed / def speed, 0, 1.4)`: a drifting fish barely moves its
tail, a fleeing one thrashes.

**Frozen reads frozen.** Because amplitude scales with actual speed, freezing
(which zeroes velocity) already collapses the animation, but `frozenT` is also
checked explicitly so it SNAPS to baseline rather than decaying over a few
frames. Asserted: residual offset is exactly 0.

**The puffer easing is cosmetic only.** `st.puffS` is a new eased display
scale; `st.inflated` remains untouched and is still the gameplay authority for
both the damage hitbox in `hazardAI` and the eatable/not-eatable flag game.js
reads. The old snapping `setDisplaySize` in `hazardAI` was removed, so the two
cannot fight over the sprite. `st.puffS` is reset in `resetSt()` and declared
in `makeEntity()`, so a recycled pool object can never start life
half-inflated (asserted).

**NPC sharks and Lane D.** SPEC Rev 4 assigns the real shark rig to Lane D's
`RF.Art.bakeSharkRig` with Lane A animating it. That hook does not exist in
`sharkart.js` yet (grepped). The pitch oscillation above is the interim answer
so a patrolling shark never reads frozen, and its amplitude is deliberately low
enough that it will not fight a rig when one lands. When Lane A exposes a rig
hook, this branch is the single place to replace.

### 4. Ambient density

Raised about 2x per zone, asserted against the Rev 3 cadences:

| zone | Rev 3 `every` | Rev 4 `every` | ratio | count |
| --- | --- | --- | --- | --- |
| 1 Sunlit Shelf | 0.22 | 0.11 | 2.00x | 3 to 4 |
| 2 Kelp Midwater | 0.26 | 0.13 | 2.00x | 2 to 3 |
| 3 Twilight Reef | 0.30 | 0.15 | 2.00x | 2 to 3 |
| 4 The Abyss | 0.70 | 0.35 | 2.00x | 1 to 2 |

The shelf shaft-mote roll went 0.35 to 0.55 to match. The zone CHARACTER curve
is preserved exactly: the shelf is still busy and the abyss still sparse
relative to it, the whole curve just sits higher. Every emit still goes through
the guarded `fx()` wrapper, so lane F's budget ceiling stays the authority and
a dropped emit is harmless here.

### Perf

Everything added is O(active entities) for creatures and O(background layers)
for water, and the background layer count is a constant of the build:

```
caustics 3 + rays 26 + seams 6 + swayers 104 + drifters 34 = 173 objects
```

173 objects, one or two scalar property writes each, per frame. That is well
below the cost of the 70 on-screen entities already being stepped. The 70
on-screen / 140 total entity budget is untouched: none of these are entities.

### Verification

```
node --check world.js                       -> PARSE_OK
RF.World.__selftest()                       -> pass: true, 54/54 ok, 0 FAIL
```

All 29 prior assertions are still present and green. 25 added.

New assertions:

```
ok worldClock follows ctx.time.now when the host advances it (5)
ok worldClock falls back to accumulating dt when time.now is frozen (5.0167)
ok clock had already accumulated before time.now was set (7.733)
ok caustic strips built (3)
ok god rays registered for sway (26)
ok thermocline seams registered for drift (6)
ok kelp/seaweed registered for sway (104)
ok midwater silhouettes registered for drift (34)
ok whole-water tint shimmer overlay built
ok god ray rotation sways within +-RAY_ROT_AMP (span 0.0407 rad)
ok god ray alpha cycles over the 0.5-1.0 band of its base (0.0681 to 0.1362)
ok caustic band drifts horizontally over time
ok water tint shimmer breathes inside its authored alpha band (0.0120 to 0.0478)
ok kelp sways in rotation about its rooted base (span 0.3588 rad)
ok animation registries never grow during update (173)
ok every god ray carries its own phase (0 duplicates across 26)
ok swimming fish sprite rotation oscillates around its heading (span 0.1909 rad over 120 frames)
ok fish wiggle stays inside +-FISH_WIGGLE (0.12)
ok frozen fish returns to its heading baseline, no residual wiggle (0)
ok consecutive entity ids get well separated phases (0.980 vs 4.863)
ok puffer inflate animates over multiple frames instead of snapping (11 frames)
ok puffer inflate lands exactly on its target scale (1.5000)
ok resetSt clears the eased puffer scale on a recycled entity
ok pickup glints inside its alpha band (0.7801 to 1.0000)
ok ambient emission cadence raised about 2x per zone (z1 2.00x, z2 2.00x, z3 2.00x, z4 2.00x)
```

The self-test stub `stubGO()` now RECORDS rotation, alpha, display size,
scroll factor and blend mode, because the animation assertions read them back.
It previously discarded them.

### No-allocation proof

Two independent measurements.

**1. Object creation after init.** Canvas-stub smoke run, 600 updates walking
the camera from the surface to the abyss, counting every `scene.add.*` call:

```
textures baked           41   (rf_caustic is new)
static objects at init  226
objects created later     0   <- the gate
fx emits over 600 upd    73 sharing 2 opts objects
pool                     70 active / 70 free / 140
```

The 2 opts objects are the two module-level reused option objects
(`ambientOpts`, `shaftOpts`), both created once at module scope, unchanged
from Rev 3.

**2. Heap under `--expose-gc`**, 600 updates of warm-up then a steady-state
run with a moving player:

```
N =  3000 updates   ->  134.8 KB   46.01 bytes/update
N = 12000 updates   ->  311.9 KB   26.62 bytes/update
N = 30000 updates   ->  294.3 KB   10.05 bytes/update
```

Read the trend, not any single row. Bytes-per-update FALLS as the run lengthens
while the absolute delta plateaus near 300 KB, which is the signature of a
fixed warm-up cost (JIT, inline caches, the pools reaching their high-water
mark). Per-frame garbage would hold bytes-per-update CONSTANT as N grows.
Zero per-frame allocation confirmed.

### Grep gates

```
em dashes                    0
Math.random                  1  (the header comment stating the law)
setTimeout / setInterval     1  (the header comment stating the law)
addEventListener             0
Date.now / performance.now   0
```

### Concurrency

`world.js` only. `game.js` (Lane A controls/rig), `sharkart.js` (Lane D) and
`juice.js` (Lane F) were READ for interface facts and never written. The two
cross-lane facts relied on:

- `ctx.time.now` is a fixed-step seconds accumulator (`game.js:1136`,
  `t.now += STEP`), which is why it is safe as an animation clock.
- `RF.Art.bakeSharkRig` does not exist in `sharkart.js` yet, which is why the
  NPC shark branch uses an interim pitch oscillation.

---

## Lane B pass 5 (Rev 5): surface containment, orientation, spawner bounds, flee burst

Owner device bug: "fish are swimming out of the water". Four items, world.js only.

### 1. Surface containment (the bug)

**Root cause.** game.js puts the waterline at `y=0` and treats `y<0` as
airborne (`stepMotion`, `minY=-46`). world.js only ever clamped entities to
`y >= 12` (`integrate`). Sprites are drawn CENTRED, so a fish sitting at y=12
with a ~30px half-height had half its body above the waterline, and the
surface ribbon only spans y 0..54 so it did not hide it. Everything the owner
saw was one number in one function.

**Fix.** `SURFACE_Y = 46`, a hard floor for every non-player entity, applied
through a single choke point:

```js
function containY(e) {
  if (e.y < SURFACE_Y) { e.y = SURFACE_Y; if (e.vy < 0) e.vy = -e.vy * SURFACE_BOUNCE; }
  else if (e.y > S.h - 12) { e.y = S.h - 12; if (e.vy > 0) e.vy = -Math.abs(e.vy); }
}
```

It is a REFLECTION, not a teleport, per the brief: the entity lands exactly on
the ceiling and its rise is turned downward at `SURFACE_BOUNCE` 0.35, so a
panicking fish noses the surface and peels back down. Asserted both ways
(lands on the ceiling, vy comes back positive and damped).

`containY` is its own function rather than inline in `integrate` deliberately.
Five separate code paths write y or vy, and each one needed handling:

| path | how it is contained |
| --- | --- |
| `integrate` (all prey/predator/pickup motion) | calls `containY`, replacing the old `y >= 12` clamp |
| flee vectors + pack drift + all steering | `steer()` clamps the TARGET to `SURFACE_Y + SURFACE_MARGIN` |
| mine and jelly drift | write `vy` straight from a sine every frame, so the reflection would be overwritten next step: near the surface the sine is FOLDED to its downward half |
| pickups (coin scatter) | placement clamped in `dropPickup`, motion via `integrate` |
| spawner | see item 3 |

The steer-target clamp is the part that matters for how it LOOKS. Containment
in `integrate` alone is correct but reads as a fish pressing against an
invisible lid. Clamping the goal point makes the fish choose a level or
downward path on its own, so the reflection becomes a rare correction rather
than the thing you watch.

The hazard fold was the subtle one. A jelly's entire motion IS a vertical
sine, so without folding it a jelly parked under the surface pumps upward into
the ceiling forever. The fold keeps the bob and only points it away. `st.drift`
is untouched, so the Rev 4 bell pulse stays synced to the bob by construction.

**Only the player breaches.** world.js never touches `ctx.player`; game.js
`stepMotion` owns `minY=-46` and the breach FX, and is unmodified.

### 2. Fish orientation

Two problems were being conflated under "orientation".

**Facing was a Y flip.** Textures bake nose-right; the old code rotated by
`e.angle` then `setFlipY(cos(angle) < 0)`. That keeps a leftward fish upright
but mirrors it vertically: belly and back swap over. Now `flipX` off the
direction of travel, and `setFlipY(false)` always. With flipX the sprite
already points left, so the rotation applied on top is MIRRORED
(`PI - angle`), otherwise pitch inverts the moment a fish turns around.
Asserted: a left-swimming fish wiggles by the same amount as a right-swimming
one, to 1e-6.

**Rotation snapped.** `e.angle` is recomputed every step straight from
velocity, so a flee that reverses in one frame rotated the sprite 180 degrees
in one frame. `st.faceA` is a smoothed DISPLAY heading chasing `e.angle` at
`FACE_TURN` 9.0, taking the short arc so crossing +-PI never spins the long
way. Below `FACE_SNAP` the heading holds, so a drifting fish does not spin
chasing noise in a near-zero velocity vector.

This is display only. `e.angle` is untouched, so AI, collision and game.js's
eat check cannot be affected by it. The Rev 4 tail wiggle was rebased from
`e.angle` onto the smoothed mirrored base (`displayBase`), which is what keeps
the wiggle from reintroducing the exact snap `faceAngle` exists to remove; the
two Rev 4 wiggle assertions were rebased onto the same baseline, same
intent, and stay green.

`st.faceA` is declared in `makeEntity`, nulled in `resetSt` and re-seeded from
the spawn heading in `spawnOne`, so a recycled pool object never rotates in
from a stale direction.

### 3. Spawner bounds

`spawnOne` clamped y to `[8, h-8]` and `ringPoint` to `[40, h-40]`, both above
the surface. Now both use `[SURFACE_Y + SURFACE_MARGIN, h - SEAFLOOR_MARGIN]`
(72 to 3560). `ringPoint` is clamped BEFORE `zoneAt()` reads it, so a ring
point landing in the sky picks the shallow zone's spawn table at a legal depth
rather than being pushed down afterwards. `spawnOne` is the last gate, so it
also covers `spawnBurst`'s +-50px jitter and any ability or debug spawn from
another lane. Asserted by driving the REAL spawner 900 updates with the camera
parked alternately at the surface and the seafloor: 3702 samples, 0 bad, y
range 66.0 to 3560.0.

### 4. Flee burst vs the rebalanced data.js

Prey speeds were cut hard (minnow 65, mackerel 95, marlin 170 at the top)
while NPC sharks sit at 288 to 500. Old multipliers were 1.35x prey and 1.15x
NPC. Raised to `FLEE_BURST` 1.55 and `FLEE_BURST_NPC` 1.35, both under the
brief's 1.6x cap, and both now named constants rather than literals buried in
the AI.

The reason for raising rather than lowering: against the new much smaller
bases, 1.35x of 95 is 128, which against a 288-speed chaser did not read as
panic at all. The design requirement is "briefly quick but still catchable by
a chasing shark of equal tier", so the test asserts that requirement directly
rather than asserting the multiplier:

```
no prey out-runs a same-or-higher-tier NPC shark at full flee burst
  (0 escapees, worst marlin at 73% of its chaser)
```

Worst case across all 16 creature rows is marlin at 73% of the slowest NPC
shark of its tier or above. Every prey stays catchable with margin, and 73%
is fast enough to read as a sprint. Plus a live behavioural check: a cornered
mackerel bursts to 147.2 against its base of 95, and never exceeds the capped
147.3.

### Verification

```
node --check world.js                       -> PARSE_OK
RF.World.__selftest()                       -> pass: true, 89/89 ok, 0 FAIL
in-browser, all 9 lanes                     -> all pass, 0 console errors/warnings
```

54 prior assertions still green (2 rebased onto the new display baseline,
same intent). 35 added.

**The brief's mandated assertion**, split into the two things it actually
means, because they are different claims:

```
ok fish forced to y=10 with upward vy is under the ceiling on the very next step (y 46.0 >= 46)
ok and its upward vy was reflected downward or to zero on contact (vy 51.5)
ok and never rose above the ceiling at any point in 240 steps (min y 46.0)
```

The split matters. Vy a hundred frames later is a fish swimming normally in
open water and says nothing about the bug, so asserting "vy <= 0 at the end of
the run" would have been a false constraint that fails for a correct fix. The
frame of contact is where the claim lives.

**Live in-browser proof**, which is the one that actually answers the owner.
Real page, real Ocean scene, player driven along the waterline for 900 frames
(the exact reported situation):

```
entity samples          62844   (53359 prey, 5510 hazard, 3975 predator)
shallowest y             54.8   (predator/reef)
breaches above y=46          0
sprites with flipY set       0
console errors/warnings      0
```

### Orientation assertions are unit-level on purpose

The first attempt drove orientation through `World.update` and failed: the AI
rewrites velocity every step, so the test was measuring `preyAI`'s steering,
not the orientation code it claimed to cover. `faceAngle` and `animateEntity`
are now driven directly, and a SEPARATE integration assertion covers the
write path those bypass, with the fish chased from alternating sides so the
flip is exercised in both states (576 samples, 0 disagreements, 293 right /
283 left). Both halves are needed: the unit tests would pass if `World.update`
never called `faceAngle` at all.

### Perf

No new per-frame allocation and no new per-entity work beyond one lerp and a
couple of comparisons. Registries and pool unchanged.

```
objects created after init     0        (600 updates walking surface to abyss)
heap  N=3000                1.92 bytes/update
heap  N=12000               2.07 bytes/update
heap  N=30000               0.50 bytes/update
animation registries         173        (unchanged)
entity pool              70/70/140      (unchanged)
```

Bytes-per-update is at the measurement noise floor, and below Rev 4's own
10 to 46 range.

### Grep gates

```
em dashes                    0
Math.random                  1  (the header comment stating the law)
setTimeout / setInterval     1  (the header comment stating the law)
addEventListener             0
Date.now / performance.now   0
```

### Concurrency

`world.js` only. `game.js` was READ to establish the waterline contract
(`stepMotion` minY=-46, `y<0` is airborne) and `data.js` was READ for the
rebalanced speeds. Neither was written, nor was any other lane's file.

---

# Rev-3D: world3d.js (Lane B3, three.js render layer)

## What was built

`world3d.js` only, an ES module (`import * as THREE from 'three'`, resolved by
the index importmap to the fleet-vendored `/play/_shared/three/three.module.min.js`,
the deep-ballast precedent). Namespace `RF.World`, public surface IDENTICAL to
`world.js`, so `abilities.js` and `engine3d.js` consume it unchanged.

`world.js` and `sharkart.js` were READ for interface facts and never written.
No other lane's file was touched.

## API parity checklist

| Member | world.js | world3d.js | Notes |
|---|---|---|---|
| `init(scene, ctx)` | yes | yes | arg is now a `THREE.Scene`; ctx may carry `renderer` |
| `update(ctx)` | yes | yes | also drives zone atmosphere, see below |
| `query(x,y,r,kind)` | yes | yes | same shared scratch buffer contract |
| `kill(ent,cause)` | yes | yes | identical cause strings |
| `spawnBurst(id,x,y,n)` | yes | yes | returns count spawned |
| `zoneAt(y)` | yes | yes | unchanged |
| `entities` | yes | yes | same live array identity |
| `playerHits` | yes | yes | same pooled-record contract |
| `stats()` | yes | yes | gains `decor` and `zone` fields |
| `detonate(mine)` | yes | yes | debug helper, retained |
| `__containY(e)` | yes | yes | surface clamp, retained |
| `__selftest()` | yes | yes | 92 assertions, see below |
| `applyZoneAtmo(scene, renderer, camY)` | n/a | NEW | see "Zone atmosphere" |
| `__state` | n/a | NEW | debug handle for the engine's budget check |

`abilities.js` calls `World.query(x, y, radius, null)` and `World.kill(ent, cause)`
through its `worldFor(ctx)` indirection; both are covered by explicit
assertions, including the `null` kind filter, which the 2D selftest never
exercised.

## Sim port coverage

The sim is a VERBATIM port. Every rule, constant and comment-documented
decision from `world.js` survives:

- pools (`makeEntity`/`buildPool`/`acquire`/`release`/`resetSt`), swap-pop
  dense active list, free stack
- spatial hash (`CELL` 256, `cellOf`/`gridInsert`/`gridRemove`/`gridUpdate`),
  incremental rebucketing
- spawner: ring point, `onscreenCount`, weighted pick, pack spawns, the 0.12
  NPC roll, `ENTITY_BUDGET` gating
- AI: `preyAI` (flee/lured/wander, `FLEE_BURST` 1.55), `predatorAI`
  (pursue/flee/patrol, `FLEE_BURST_NPC` 1.35, bite cooldown 0.7),
  `hazardAI` (mine bob + chain, jelly sine + sting + slow, puffer inflate),
  `pickupAI` (magnet, `coinMagnet`, grab, 12s life)
- status effects: `statusTick`, `burnRate`/`poisonRate` with the RF-STATUS-01
  payload-then-`RFD.ABILITIES`-then-hard-default chain, immunity clears,
  `syncPlayerImmunity`
- pooled hit records (RF-PERF-01), pooled capped pack records (RF-PACK-01,
  `PACK_MAX` 48)
- mine chain `detonate()` with its 64-iteration guard
- Rev 4 living water: all constants, all five registries, `animateWater`,
  `entPhase` golden-ratio phase spread, jelly pulse, eased puffer
  (`PUFF_TIME`), pickup glint, ambient density table
- Rev 5 surface containment: `SURFACE_Y` 46, `SURFACE_MARGIN`, `SURFACE_BOUNCE`,
  the `containY` choke point, the steer-target clamp, the mine/jelly velocity
  fold, the coin-scatter clamp, the spawner and ring-point bounds
- Rev 5 orientation: `FACE_TURN` smoothed display heading, `FACE_SNAP` hold

The rev-5 surface clamp WAS already present in `world.js` and was ported as
found; the additional per-lane requirement ("NOTHING but the player above
y=46 ever") is now enforced by four separate selftest proofs rather than
assumed.

### Deliberate sim-adjacent additions

Two fields were added to `st` because the 3D rig needs them, and neither is
read by the sim:

- `st.bitePhase`, set to 1 when `predatorAI` lands a bite and decayed in the
  render pass. This makes the jaw snap and the damage the SAME event by
  construction rather than two things that have to be kept in step.
- `st.faceA`, the smoothed display heading. Present in `world.js` too; it is
  reset in `resetSt` so a recycled slot cannot inherit a stale heading.

## Render swap

| world.js (Phaser) | world3d.js (three) |
|---|---|
| `scene.add.image` sprite per entity | pooled billboard mesh, `RF.Art3D.billboard(key)` |
| NPC shark sprite | `RF.Art3D.buildShark(def)` rig, `animate()` driven from velocity |
| `setFlipY` on `cos(angle)<0` | negative X SCALE (the correct mirror), heading mirrored `PI - angle` |
| tail wiggle via `setRotation` | small Z rotation on the billboard |
| `setTint` | private material clone per entity, see "Tint leak" |
| 5 painted background layers | `scene.fog` + renderer clear colour, lerped per zone |
| god ray images | additive planes on a waterline PIVOT group |
| caustic strips | additive planes near the surface |
| kelp `setRotation` about origin | pivot Group at the stalk ROOT, plane offset inside |
| surface tileSprite | plane at y=0 + scrolling foam strip |
| silhouette images | very transparent dark planes at the furthest parallax band |

Bake keys are UNCHANGED (`rf_shark_<id>_play`, `rf_<sprite>`), so this lane
required no new art.

### Space contract

Sim coords untouched. Mapping is `(x, -y, z)`; `setPos` is the single writer
and negates y, `setRot` negates the angle (sim y is DOWN, three y is UP).
Gameplay plane z=0; decor parallax spans -400..-80 per the contract
(silhouettes -400..-300, kelp/rock -260..-140, rays -120, caustics -90,
surface -60); ambient motes carry a foreground z in +40..+80.

## Zone atmosphere

`RF.World.applyZoneAtmo(scene, renderer, camY)` is public AND is called from
inside `update()` every step, from the camera y it already computes. So:

- an engine that only calls `RF.World.update(ctx)` gets the full transition
  for free
- `engine3d.js` MAY call it directly on its own render cadence (while paused,
  during a menu fly-through) without stepping the sim; it is idempotent for a
  given `camY`

Fog colour, fog density and clear colour all come from `RFD.ZONES` (`tint`,
`fog`, `pressureTier`), so retuning a zone in data.js retunes the atmosphere
with no code change. Density rises monotonically with `pressureTier`.

The crossing is a CONTINUOUS blend over `ATMO_BLEND` (260px either side of a
boundary), not a step. A boundary crossing sampled 4px either side moves the
density by less than half the gap between adjacent zones, which is asserted.
The thermocline seam planes give the crossing a visible EDGE on top of the
gradual lerp, which is what makes it unmistakable rather than merely gradual.

Renderer is optional: it may arrive via `init` (`ctx.renderer`), via
`update` (`ctx.renderer`), or as the second argument here.

## Guards and fallbacks

All cross-lane calls are guarded, and all four scenarios are exercised in a
harness:

| Scenario | Result |
|---|---|
| no `RF.Art3D`, no `RF.Fx` (standalone) | 70 entities, 401 scene objects, runs clean |
| `RF.Fx` present, `RF.Art3D` absent | 99 emits received, prey are vertex-coloured quads |
| `RF.Art3D` present (real `shark3d.js`) | 5 `buildShark`, 321 `billboard`, rigs animated |
| `RF.Art3D` THROWS on every call | falls through to quads, sim unaffected |

Without `RF.Art3D`, prey render as vertex-coloured plane quads with
countershading baked into the vertex colours (dark dorsal at the plane top,
which is the fish's back given the y negation, pale belly at the bottom).
Without `RF.Fx`, emits are skipped. A throwing `RF.Art3D` is caught per call.

Verified against lane D3's REAL `shark3d.js` once it landed: `billboard(key)`
returns a Mesh and `buildShark(def)` returns `{group, parts, animate}`, both
exactly as integrated. 1500 updates, 0 surface breaches.

## Three defects found and fixed during the port

### 1. Scene-object growth: the view cache (found by the no-alloc gate)

The first cut cached each pool slot's visual ON THE SLOT, keyed by def. That
cache is POOL SIZE x ROSTER SIZE in the worst case (140 x ~20), and a run that
wanders through every zone approaches the worst case. Measured 1619 scene
objects and still climbing.

Four retention policies were measured before one held. The failures are
recorded in the source, because each is a plausible thing to try again:

| Policy | Result |
|---|---|
| per-slot cache | 1619 objects, climbing (pool x roster) |
| global pool, NO cap | 371 idle for a 140 slot pool, still creeping at 2400 updates |
| flat cap, 6 idle per key | 3007 and CLIMBING: cap below the true concurrent peak, so views were disposed and instantly rebuilt. The cap turned a bounded cache into a per-frame allocator |
| global budget (pool + margin) | 6953 and climbing: a rare def's release evicts a common def's view that the next frame needs back |
| per-key peak + hard ceiling | SHIPPED. 731 objects, converging |

Views are pooled GLOBALLY per view key. Each key retains at most the most
views of THAT key ever alive at once (`bank.peak`), capped by a hard
`VIEW_KEY_CEIL` of 64. The per-key peak is the only rule that never disposes a
view its own def will need again, which is what keeps steady-state creation at
zero; the ceiling turns the slow stochastic creep of peaks into a hard bound.
Surplus views are DISPOSED (removed from the scene, private material disposed;
shared geometry and the shared material cache are deliberately left alone
because other views still reference them).

Convergence measured over 100k updates, about 28 minutes of play at 60fps,
growth per 10k block:

```
641, 32, 13, 13, 13, 2, 9, 3, 0, 4   ->  plateau near 730 objects
```

Block deltas fall toward zero while the total flattens. A leak holds its
per-block delta CONSTANT as the run lengthens. The selftest therefore asserts
a RATE (<= 20 new objects across 4000 steady-state updates, where one-per-frame
would be thousands) rather than a false absolute zero, and asserts the plateau
stays under 900 objects.

### 2. Status tint leaked across a whole shoal

Materials are shared per bake key so a shoal of 30 minnows is 1 material and 1
texture. Tinting a shared material would turn the WHOLE shoal blue when one
fish froze. Each entity billboard therefore gets a private material clone
(`privatiseMaterial`) once at view-build time, bounded by the view pool, never
per frame. Asserted directly: one frozen entity is tinted, its shoal-mate is
not, and the two hold different material objects.

### 3. Billboard aspect ratio was being squashed

`RF.Art3D.billboard` sets `mesh.scale.x` to the bake's own aspect (canvas
width / height) and leaves `scale.y` at 1. That ratio is the only record of the
art's true proportions, and `applySprite` overwrites both axes with the sim's
display size. The first cut forced every billboard to the 2:1 body ratio the
2D fallback assumed, which squashes a tall bake (jelly, puffer, ray) and
stretches a long one.

The aspect is now captured at view-build time, before the sim scale overwrites
it, and applied as the height factor. LENGTH remains the sim's authority (it
derives from the collision radius, so the art can never disagree with the
hitbox); HEIGHT follows the bake. The jelly bell pulse and the eased puffer use
the same captured aspect rather than a hardcoded 0.52.

## Self-test

`RF.World.__selftest()` runs against STUBBED three objects: a stub scene whose
only contract is an `add()` that collects, and a stub renderer that records
clear colours. The entity sim needs no real GL. Real `THREE` builds the meshes
when it is present; the stub scene simply collects them.

**92 assertions, 92 pass, 0 fail.**

Ported from `world.js`: pool preallocation, query neighbours + kind filter,
frozen entity held, mine chain reach and non-reach, 300-update pool accounting
(balanced on every step), burn/poison DoT rates and the payload-vs-authored
fallback, fire immunity, player passive publication, predator bite through
`playerHits`, dreadAura inversion, junkEater, `zoneAt`, `spawnBurst`,
worldClock primary and fallback paths, registry build counts and no-growth,
ray sway bounds, ray alpha band, caustic drift, shimmer band, kelp sway,
per-ray phase uniqueness, fish wiggle span and `FISH_WIGGLE` bound, frozen
baseline collapse, id phase spread, puffer easing frames and exact landing,
`resetSt` puffer clear, pickup glint band, ambient density ratios, pack record
bounding over 2000 updates, hit pool size.

New for 3D:
- API parity: every contract member present, `entities`/`playerHits` identity,
  `null` kind filter (the form `abilities.js` actually calls)
- **surface clamp, four independent proofs**: the spawner's own bound
  (200 spawns aimed above the waterline, 0 violations); `spawnBurst` jitter at
  y=0; `containY` reflecting at exactly `SURFACE_BOUNCE` rather than
  teleporting; and the real gate, 600 steps with the player pinned AT the
  waterline (the case that produced the owner's original bug, prey fleeing UP
  from a shallow player) checking EVERY entity of EVERY kind on EVERY step,
  including scattered coins
- zone atmosphere: per-zone resolution, monotonic density with depth, shelf
  and abyss differing in both fog and clear colour, scene fog carrying the
  applied density, the renderer actually being driven, and the boundary blend
  being continuous rather than stepped
- surface plane and foam strip built, plane at the waterline
- billboard mirror by negative x scale when facing left, positive when right
- private materials, tint isolation across a shoal
- bake aspect captured and length driven by the sim display size
- ambient emission carrying a foreground z in the contract band
- view pooling bounds: idle counter agreement, per-key peak and ceiling
  respected, no key over its own high-water mark
- the no-alloc rate gate described above

### Harness

Node cannot resolve the bare `three` specifier the browser gets from the
importmap, so the harness registers a loader hook mapping `three` to the
vendored module. `data.js` is a classic script and is evaluated into the global
first, then `world3d.js` is imported.

```
node --import ./threehook-reg.mjs run.mjs
RFD zones: 4 creatures: 19 sharks: 61
PASS=true  ok=92  fail=0  total=92
```

### Grep gates

```
em dashes                    0
Math.random                  1  (the header comment stating the law)
setTimeout / setInterval     1  (the header comment stating the law)
addEventListener             0
Date.now / performance.now   0
document. / window.          0
Phaser leftovers             1  (the header comment describing the swap)
```

## Concurrency

`world3d.js` and this NOTES section only. `world.js`, `sharkart.js`,
`shark3d.js`, `abilities.js` and `data.js` were READ for interface facts and
never written. Cross-lane facts relied on:

- `RF.Art3D.billboard(key)` returns a `THREE.Mesh` carrying the bake aspect on
  `scale.x`; `RF.Art3D.buildShark(def)` returns `{group, parts, animate}`
  (verified against lane D3's landed `shark3d.js`)
- `abilities.js` reaches the world through `worldFor(ctx)` and calls
  `query(x, y, radius, null)` and `kill(ent, cause)` only
- `ctx.time.now` is a fixed-step seconds accumulator, which is why it is safe
  as an animation clock

---

# Fix pass: integration probe findings (2026-08-19)

Three defects found by the orchestrator's in-browser probe. All three were
invisible to the previous selftest, which is the interesting part: each one is
a case where the code did exactly what it said and still produced nothing on
screen. The assertions added below are written against the OBSERVABLE RESULT
(what is in the material's map, how many lights are in the scene) rather than
against the call that was supposed to produce it.

## 1. Billboard textures were 1x1 placeholders (prey invisible)

### Root cause

This lane passed **bake key strings** to `RF.Art3D.billboard(...)`:

```js
// BEFORE
function bakeKeyFor(def, kind) { ... return 'rf_' + sprite; }   // or 'fish_blue'
var o = A.billboard(bakeKeyFor(def, kind));
```

That was correct for the 2D build, where Phaser's loader had already registered
those textures. **The 3D build has no Phaser and no loader**, so:

- Kenney fish PNGs (`fish_blue`, `fish_grey_long_a`, ...) were never loaded by
  anything, and
- procedural creature canvases came from 2D `RF.Art.bakeCreature`, which was
  not on the page at all.

`billboard()`'s string path resolves only through `RF.Art.canvasFor` or a DOM
node id (`shark3d.js` `resolveCanvas`). Both missed, so it fell through to its
own **1x1 transparent `DataTexture`** placeholder and returned a perfectly
valid mesh. Nothing threw, so the `try/catch` fallback to the vertex-coloured
quad never engaged either. Every prey in the world drew as an invisible speck.

This is why the old selftest passed: it asserted a billboard was *created* and
that its *scale* was right, and both were true. A 1x1 fully transparent
texture is still a texture.

### Fix

Keys are never passed for creatures now. This lane resolves both real sources
itself and hands `billboard()` a **texture or a canvas**, which its contract
accepts directly:

| sprite key | source | what is handed to `billboard()` |
|---|---|---|
| no `proc_` prefix (`fish_blue`) | `assets/<sprite>.png` via `THREE.TextureLoader`, loaded ONCE, cached by key | the `THREE.Texture` |
| `proc_` prefix (`proc_jelly`) + every fallback | `RF.Art.bakeCreature(stub, def)` | the captured `HTMLCanvas` |

Textures get `colorSpace = SRGBColorSpace` (these are authored sRGB PNGs; a
linear read washes every fish out under the engine's tone mapping) and
`magFilter = LinearFilter`.

The canvas capture uses a **stub scene**, because `bakeCreature`'s only scene
contract is `textures.exists(key)` and `textures.addCanvas(key, canvas)`:

```js
var bakeStub = { captured: null, textures: {
  exists: function () { return false; },              // always re-bake
  addCanvas: function (k, c) { bakeStub.captured = c; },
} };
```

`exists()` always answers false so the bake always takes its `addCanvas` path.
One stub object is reused for every bake, so this allocates nothing per call.
Note `addTexture` in `sharkart.js` also marks `scene.__rfArtTextures[key]`,
which would suppress a second capture on a reused stub; it does not matter here
because `canvasCache` means each key bakes exactly once anyway.

Both caches are keyed by **sprite, not by pool slot**, so a 30-fish shoal is
one texture and (through `billboard()`'s own material cache) one material.
`RF.Art` absent, or a bake that throws, still degrades to the vertex-coloured
quad exactly as before.

### Aspect capture: a real bug found while fixing this one

`billboard()` reads an aspect off a **canvas** source only:

```js
// shark3d.js:797
if (resolved.canvas && resolved.canvas.height) mesh.scale.x = resolved.canvas.width / resolved.canvas.height;
```

For a **texture** source it leaves `scale.x` at 1, which `viewAcquire` would
then have captured as a *square fish*. So the Kenney path sets the aspect
itself from `tex.image`, falling back to a nose-right fish's nominal 2:1 while
the image is still decoding. Either way `scale.x` carries the proportions,
which is the contract `viewAcquire` captures and `applySprite` then overwrites
with the sim's display size. Verified with the real baker: procedural canvases
are genuinely non-square and differ from each other (jelly 78x96 is *taller*
than wide, mine 86x86 square, grazer 150x100 wide), so this is load-bearing.

### Two more instances of the same bug, found while fixing it

`billboard()` was being handed bare keys in two other places. Neither was in
the probe report, because both fail the same silent way: an invisible 1x1
placeholder that never throws, so the fallback under it is unreachable.

- **Decor** (`decorBillboard`) asked for `'rock_a'` and `'seaweed_c'`. Those
  are **Kenney sprite names**, and `assets/rock_a.png` / `assets/seaweed_c.png`
  both exist on disk, so they now resolve through the same
  `assets/<sprite>.png` loader the creatures use. Every rock and kelp stalk in
  the world was a silent placeholder before this.
- **Coin pickups** (`makeCoin`) asked for `'rf_coin'`. There is no coin bake in
  either roster and no `coin.png` in `assets/`, so the request is simply
  **deleted** and the glowing fallback quad, which was always the intended
  visual, is now actually reached. Asking for art that does not exist is not
  free when the miss is silent.

## 2. Duplicate light rigs

The scene had **2x HemisphereLight + 2x DirectionalLight**: `engine3d` owns
lighting per SPEC3D, and this lane was building its own rig on top.

`buildLights()` and its call site are **deleted**. Nothing here needed them:
every object this module builds is a `MeshBasicMaterial` (billboards, rays,
caustics, seams, surface, silhouettes, decor quads) and `MeshBasicMaterial` is
unlit by definition, so the lights this lane added only ever affected *other
lanes'* meshes, roughly double-exposing them. The fog / clear-colour / zone-lerp
atmosphere work is untouched and still lives in `applyZoneAtmo` and
`buildBackground`.

## 3. Billboard visibility and size

Asserted rather than changed; the existing behaviour was already correct.
A mackerel at typical spawn distance measures **50.4 world units long by 25.2
tall**, which matches the probe's observed 50.4 exactly. Length is the sim's
authority (tier radius x 2.4, so the art can never disagree with the hitbox)
and height follows the art's own aspect.

## Selftest additions

Stubs are installed before `World.init` and removed after, since the selftest
has neither GL nor network:

- **`World.__TextureLoader`** override, returning a fake texture carrying a
  96x48 image (stands in for a decoded PNG). This is the only way to exercise
  the Kenney branch headlessly.
- **`RF.Art`** stub *only if the real `sharkart.js` is absent*, driving the
  same `exists`/`addCanvas` contract the real one does.

New assertions:

```
ok world3d adds ZERO lights, engine3d owns lighting (0 found)
ok kenney creature material has a map whose image is bigger than 1x1 (96x48, the placeholder bug was 1x1)
ok kenney sprite loaded from assets/<sprite>.png (assets/fish_grey_long_a.png)
ok mackerel resolved its own sprite key, not a bake key
ok procedural creature material is canvas-backed and bigger than 1x1 (78x96)
ok procedural map image is an actual CANVAS handed to billboard(), not a key
ok a second kenney creature reuses the cached texture (no reload)
ok mackerel billboard length is in the readable band (50.4 world units, expected 34-60)
ok mackerel billboard height follows the art aspect and is shorter than it is long (25.2)
ok aspect captured from the 96x48 source is 0.5 (0.500)
ok billboard is added visible / material transparent / depthWrite false
ok decor resolves assets/<sprite>.png through the loader, not a bare bake key
```

The decor check deliberately requests a key `init` never used (`seaweed_f`) and
watches for the LOAD REQUEST. Asserting against a key init already cached would
only prove a cache hit, not that the bare-key path is gone.

The art assertions are gated on `hasArt3D`. Without `RF.Art3D` every creature
legitimately degrades to a vertex-coloured quad, which has no map at all; that
is a **supported mode, not the bug**, so it is reported rather than failed.

## Proof

Module imported under Node with stubbed `three` + real `data.js` + real
`sharkart.js` (memory surfaces, no DOM required):

```
$ node --check world3d.js                      # syntax
$ node /tmp/rf_run_realart.mjs
real RF.Art.bakeCreature: function
PASS: true | notes: 110 | fails: 0
```

Run in all three configurations, all green:

| configuration | result |
|---|---|
| real `sharkart.js` + `Art3D` stub | PASS, 110 notes, 0 fails (jelly canvas 78x96) |
| `RF.Art` stub + `Art3D` stub | PASS, 110 notes, 0 fails |
| **no `RF.Art3D`** (fallback quads) | PASS, 100 notes, 0 fails |

The real `sharkart.js` baker was additionally exercised against the capture
stub for all 10 procedural creatures, every one returning a real canvas:

```
proc_ray 122x78   proc_turtle 122x78   proc_sword 122x78   proc_squid 122x78
proc_squid_big 150x100   proc_grazer 150x100   proc_calf 150x100
proc_mine 86x86   proc_jelly 78x96   proc_puffer 86x86
kenney passthrough: returns 'fish_grey_long_a', captures nothing  (correct)
```

Allocation law still holds after adding the two caches:

```
trace scene-object count during warm-up: 651 -> 681 -> 720 -> 725 -> 726
ok steady-state scene creation is a convergent tail (3 objects across 4000 updates)
ok total scene object count plateaus inside the memory budget (729)
```

### Grep gates (re-run)

```
em dashes                    0
Math.random                  1  (the header comment stating the law)
setTimeout / setInterval     1  (the header comment stating the law)
addEventListener             0
Date.now / performance.now   0
document. / window.          0
```

`document.` stays at **0** even though this pass added canvas handling: the
capture goes through the stub scene, never the DOM.

# Fix pass: REVIEW-3D findings (2026-08-19)

Scope: `world3d.js` only, plus this section. Findings owned by B3 in
`REVIEW-3D.md`, against the binding `SPEC3D.md` Rev 2 rulings.

| id | owner share | status |
|---|---|---|
| LIFE-01 | B3 (world's own scene objects, views, env textures, private materials) | FIXED, `World.teardown()` exported and proven over 5 cycles |
| ATMO-01 | B3 (now the SOLE atmosphere owner per Rev 2) | FIXED, one owner, lights driven from here, foreground tune below |
| PERF-01 | B3 (fixed-step atmosphere report allocation) | FIXED, report is module scratch |
| PERF-03 | B3 (static environment geometry and materials) | FIXED, 30 environment draw calls, was about 260 |

No MINOR findings in `REVIEW-3D.md` are owned by B3. `PERF-04` is C3/A3,
`ART-02` is D3, `UI-01` is a recorded C3 pass.

## LIFE-01: teardown

`engine3d.js:1417` already called `RF.World.teardown(ctx)`; this module simply
did not export one, so a restart truncated JavaScript arrays and left the old
run's scene graph attached forever. `World.teardown()` now exists and is the
counterpart to `init()`.

Released, all of it this module's own:

- every top-level object in `S.decor` (decor batches, ray band pivots, kelp bed
  pivots, seam batches, silhouette batches, caustics, shimmer, all three
  surface parts), detached from whatever parent they carry
- every pooled VIEW, live on an entity or idle in a bank: detached, its private
  material clone disposed, and an NPC shark rig handed back through its OWN
  `rig.dispose()` when lane D3 offers one (this module never disposes another
  lane's shared cache)
- every environment material and geometry created this run, disposed in bulk
  from the `envOwned` ownership ledger rather than found by traversal
- `S.matCache` (the fallback materials AND the per-palette vertex-coloured
  geometry clones, which share that map), the shared unit quad `S.geoQuad`, and
  the fallback quad `fallbackGeoCache`
- the `FogExp2` this module installed, and the scene's `fog` slot when it is
  still pointing at ours
- the engine's light references, dropped rather than disposed: we never created
  them, and dropping them means a renderer rebuild (GL-01) cannot find us
  writing into dead objects
- all sim state: pool, free list, entities, grid, packs, hit records

DELIBERATELY PERSISTENT, per the Rev 2 documented-lifetime carve-out:

- `texCache`, the decoded `assets/*.png` `THREE.Texture`s. Asset layer, not run
  state; bounded by files on disk; re-decoding every restart is a visible hitch
  for nothing.
- `canvasCache`, the 2D bakes behind procedural billboards. Bounded by roster
  size, expensive to redo. The `CanvasTexture`s built FROM them do get disposed,
  because those live inside the views.
- lane D3's geometry and material caches, reachable only through its own
  dispose path.

`init()` also self-tears-down when called on an already-inited world, so a
caller that forgets `teardown()` still cannot leak.

### Proof

Five full `init` / play 400 steps / `teardown` cycles against a stub scene that
tracks its own child list on both `add` and `remove`. The stub's materials and
geometries throw on a second `dispose()`, so reaching the end at all proves
nothing was double-disposed.

```
ok LIFE-01: five init/teardown cycles return the scene child list to baseline 0
   (0, 0, 0, 0, 0 after each teardown; peaks 240, 273, 245, 256, 253)
ok LIFE-01: init() after teardown() is equivalent to a first init, every cycle
   rebuilds a comparable world (240, 273, 245, 256, 253 objects per cycle)
ok LIFE-01: teardown clears every environment and entity registry it owns
ok LIFE-01: teardown releases the scene's fog slot when it still points at ours
ok LIFE-01: teardown disposed the run materials and geometries
   (1766 materials, 193 geometries across 5 cycles)
ok LIFE-01: the documented persistent asset texture cache survives teardown
   (11 textures held)
ok LIFE-01: the per-run material and geometry caches are emptied (0 env, 0 fallback)
```

The child list returning to exactly 0 is the finding's direct refutation. The
"comparable world every cycle" assertion is the other half of the contract:
a cycle that rebuilt LESS than the first would mean `init()` after `teardown()`
is not equivalent to a first `init()`.

## ATMO-01: one owner, and a foreground that does not gray out

Per Rev 2 this module is now the SOLE atmosphere owner. It still creates no
lights; `engine3d.js` creates the hemisphere and sun once at boot and hands the
references over on `ctx.lights` (or through the new `World.setLights({hemi,
sun})`), and from then on only reads them. `applyZoneAtmo()` writes fog colour,
fog density, renderer clear colour, scene background, hemisphere sky/ground
colour and intensity, and sun colour and intensity, all from the SAME blended
zone pair in the same pass, so light and water can never disagree about depth.
The second density formula in `engine3d.js:443` is A3's to delete.

### Why the old numbers grayed the player out

Structural, not a near miss. `FogExp2` attenuates by `exp(-(density *
distance)^2)` measured from the CAMERA, and the camera sits 620 world units
back from the gameplay plane (SPEC3D camera contract). The gameplay plane is
therefore NEVER at distance 0; it is always at 620. At the old deep density of
0.00092 that is `exp(-(0.57)^2) = 0.72`: 28 percent of the player's own colour
was already replaced by flat fog blue before anything else happened, and every
creature worth looking at took the same hit.

Two changes, both needed:

1. **Density down.** Deep end 0.00092 -> 0.00046. At the 620-unit play plane
   that is `exp(-(0.285)^2) = 0.92`, so the foreground keeps 92 percent of its
   chroma at the bottom of the world instead of 72.
2. **Near-distance guard.** `FogExp2` has no near plane, so density alone
   cannot separate "the plane the game happens on" from "the water behind it".
   `guardDensity()` clamps any density to `sqrt(-ln(FOREGROUND_KEEP)) /
   FOG_NEAR`, which makes "the player never grays out" a property of the code
   rather than of hand-picked constants. Retuning `RFD.ZONES` in `data.js`
   cannot break it.

### The three depth tunings

Measured at each zone's mid depth against the real `RFD.ZONES` table (4 zones
at pressure tiers 1 / 3 / 6 / 9). "play keeps" is the fraction of its own colour
the gameplay plane retains at 620 units; "far keeps" is the same for the
furthest parallax band at 1040 units.

| zone | tier | density | play keeps | far keeps | hemi / sun | clear | S | V |
|---|---|---|---|---|---|---|---|---|
| **Sunlit Shelf** (SHALLOW) | 1 | 0.00013 | 99.4 pct | 98.2 pct | 1.15 / 1.00 | `#386a82` | 0.569 | 0.510 |
| Kelp Midwater | 3 | 0.00021 | 98.3 pct | 95.2 pct | 1.04 / 0.91 | `#224a60` | 0.646 | 0.376 |
| Twilight Reef (MID) | 6 | 0.00034 | 95.7 pct | 88.5 pct | 0.87 / 0.76 | `#132a3c` | 0.683 | 0.235 |
| **The Abyss** (DEEP) | 9 | 0.00046 | 92.2 pct | 79.5 pct | 0.70 / 0.62 | `#08101b` | 0.704 | 0.106 |

(Clear colours are post-retune; see the wash-out correction section at the end
of this file. Saturation RISES with depth while value falls, which is what
"vivid blue that gets darker" means as opposed to "pastel that gets grayer".)

The three target feels:

- **SHALLOW** (Sunlit Shelf): bright turquoise, high key, sun shafts clearly
  visible, only the far parallax band softened at all. The player reads at
  essentially full saturation, 99.4 percent of its own colour.
- **MID** (Kelp Midwater through Twilight Reef): the water has colour of its
  own and the far band is genuinely hazy, 95 down to 88 percent, but the
  foreground shark and its prey still hold 98 to 96 percent and pop off it as
  separate saturated objects. This is the frame the review called dark and
  timid; the widening gap between play plane and far band is the fix, and it is
  where the tune does the most work.
- **DEEP** (The Abyss): heavy, near-black water, clear colour down to `#0c1521`,
  that swallows the parallax bands, with the player and whatever is hunting it
  lit and coloured against it at 92 percent. Depth comes from the BACKGROUND
  going away, not the foreground being drained.

Two supporting decisions:

- The hemisphere SKY colour tracks the zone **tint**, not the fog. The light
  the player is lit by stays a saturated water colour instead of collapsing
  onto the same gray the fog is made of, which is most of the difference
  between the review's washed-out frame and a readable one. Ground colour never
  reaches black, or belly countershading stops reading.
- Light floors are 0.70 hemi / 0.62 sun, well above the old engine-side 0.35.
  An under-lit rig grays exactly like a fogged one, so the floor is part of the
  same requirement.

### Where the depth cue moved, and this is honest

Clamping the play plane to 92 percent also caps how hard the far band can fog:
the far parallax band is only about 1.7x further out (1040 units vs 620) and
`FogExp2` is smooth, so at the deepest legal density the far band keeps about
80 percent against the play plane's 92. That is a 12 point separation, a haze
rather than a curtain, and fog alone no longer carries the depth read.

That is the right trade rather than a shortfall, because the far band is drawn
at 0.04 to 0.09 opacity in the first place. It was never going to be erased by
fog; it is erased by having almost no alpha. The cue that actually reads at
depth is the CLEAR COLOUR going near black while the lit foreground does not,
plus the light dimming. Both are now asserted directly rather than assumed.

```
ok ATMO-01: gameplay plane keeps >= 92 percent of its own chroma at every depth
   (worst 92.2 percent, deepest density 0.00046)
ok ATMO-01: the density guard clamps any zone table, not just the shipped one
ok ATMO-01: fog still separates the play plane from the far parallax band
   (79.5 percent kept at z -420 vs 92.2 percent on the play plane)
ok ATMO-01: the clear colour carries the depth read, abyss much darker than shelf
ok ATMO-01: world3d drives the engine hemisphere and sun (1.15 / 1.00 at the shelf)
ok ATMO-01: light dims with depth (1.15 -> 0.70 hemi, 1.00 -> 0.62 sun)
ok ATMO-01: the deep light floor stays well above the old 0.35 wash-out
ok ATMO-01: hemisphere sky tracks the zone TINT, not the fog gray
ok ATMO-01: hemisphere ground never goes fully black, belly countershading survives
```

The screenshot gate at shallow, mid and deep is TEST-01's, and remains the
binding art judgement. These numbers are the floor it sits on, not a substitute.

## PERF-01: no allocation in the fixed step

`applyZoneAtmo()` returned a fresh `{fog, clear, density, zone, blend}` on every
call, and `update()` called it every fixed step and discarded it. The claim that
it "only allocates when a caller asks for the report" was false in the only path
that mattered.

The report is now `atmoReport`, one module-scratch object rewritten in place and
also exposed as `World.__atmoReport`. Callers read the fields immediately; that
is the documented contract, and anything wanting to keep a value across a frame
boundary copies the scalar. The selftest's own zone-atmo block was rewritten to
honour it, because under the scratch contract the old code held two reports at
once and would have compared an object to itself and passed vacuously.

The report gained `hemiI`, `sunI`, `depth` and `fogNearKeep`, all scalars, so
the light state and the foreground guard are readable without reaching into
module state.

```
ok PERF-01: applyZoneAtmo writes module scratch, it never allocates a report
ALLOC PROBE heap delta over 20000 fixed steps: 42.5 KB (2.176 bytes/step)
```

2.2 bytes per step is the V8 noise floor. The report object alone was roughly
50 bytes per step before the fix.

## PERF-03: 260 environment draw calls down to 30

The old environment put about 260 meshes in the scene, each with its own
material, and relied on frustum culling to keep the MEASURED number under
budget. That is luck, not a budget, which is why the number drifted to 134.

Two mechanisms, both build-time only:

- **`envMaterial(color, opacity, additive, map, vcolors)`** returns a SHARED
  material per look key. Two seams, two rocks, two silhouettes of the same look
  now share one material object, which is the precondition for sharing a draw
  call at all. Objects whose OPACITY animates (caustics, shimmer, ray bands)
  ask for a private material through `planeMeshPrivate` / `batchMesh(...,
  privateMat)`, because opacity lives on the material.
- **`mergeQuads()`** bakes N transformed unit quads into ONE `BufferGeometry`
  with per-vertex colour AND per-vertex alpha, so a batch whose members had
  different tints and different opacities still draws once. The three build
  vendored at `/play/_shared/three` has no `BufferGeometryUtils`, so the merge
  is written here; it is arithmetic over a unit quad and needs nothing else.
  Quad records are POOLED in `quadScratch`, so describing 90 rocks allocates
  its records once on the first init and reuses them on every restart forever.

What could not merge, and what was done instead: anything whose per-instance
animation is a TRANSFORM. Those are batched by PHASE BUCKET, members of a
bucket sharing one merged geometry and one pivot so they move together.

| population | was | now | note |
|---|---|---|---|
| seafloor rocks | 90 meshes | **1** | do not move at all, so all 90 collapse outright. Per-rock opacity and mirroring survive in the vertex data. |
| kelp and seaweed | 104 meshes | **12** | batched by X COLUMN into beds, each with its own pivot at its own root, rate and phase. The swing radius inside a narrow column is small, so a bed leans as a bed instead of stalks scissoring past each other. That is how a real kelp bed moves under a current. |
| god rays | 26 meshes | **4** | 4 bands of 7 shafts. Each shaft keeps its own lean, baked into the merged vertices, so a band is a fan and not a comb; the band pivot at the waterline adds the sway. Real light shafts move as a sheet under one swell, not independently a metre apart. |
| thermocline seams | 6 meshes | **2** | one normal-blend batch for the dark bands, one additive for the bright glints. A thermocline is one body of water sliding past. |
| midwater silhouettes | 34 meshes | **4** | one batch per zone. The per-shape drift was 3 to 7 px on shapes at 0.04 to 0.09 opacity at the furthest parallax band; drifting the zone batch instead is not a visual change anyone can see. Rule 2 (ANCHORED) still holds: the drift is an OFFSET recomputed from the sine every frame, never an accumulation. |
| caustics, shimmer, surface | 7 meshes | **7** | left alone. Already cheap, and every one has an independently animated opacity. |

```
environment draw-call inventory: 30 meshes across 15 distinct materials
ok PERF-03: the environment contributes at most 60 draw calls (30 meshes, was about 260)
ok PERF-03: 104 kelp stalks batched into at most 12 swaying beds (12)
ok PERF-03: 28 god-ray shafts batched into 4 bands (4)
ok PERF-03: every thermocline seam batched into 2 meshes (2)
ok PERF-03: midwater silhouettes batched to one mesh per zone (4)
ok PERF-03: environment materials are cached by look, never one per plane (15 for 30)
ok PERF-03: the merged batches carry real geometry, not empty meshes (1076 vertices)
```

**Environment draw-call estimate: 30 worst case, all 30 on screen at once.**
In practice fewer: the 12 kelp beds are spatially separated across 7200 px of
world and the 4 silhouette batches are one per zone, so a single camera sees
perhaps 2 kelp beds and 1 silhouette batch. The realistic on-screen figure is
about **12 to 15**, and 30 is the number that holds even if culling does
nothing at all. That leaves the whole remaining budget to D3's shark rigs and
F3's effects.

Merged geometry was verified against the REAL vendored three (not the stub):
rocks span the full world width at the seafloor, seams span full width at their
boundary depths, silhouette batches sit inside their own zones, ray bands hang
from y = 0 down to about -480, and the 12 kelp beds sit at 600 px spacing with
local coordinates centred on their pivots.

## Proof

Four configurations, all green. `world3d.js` imported under Node with `data.js`
and `sharkart.js` evaluated into the global first.

```
$ node --check world3d.js                                  PARSE_OK

stubbed three + real sharkart.js + Art3D stub     PASS 135 notes, 0 fails
stubbed three, NO RF.Art3D (fallback quads)       PASS 125 notes, 0 fails
REAL vendored /play/_shared/three/three.module.min.js
                                                  PASS 135 notes, 0 fails
allocation probe, 20000 fixed steps after warm-up
                                                  2.176 bytes/step
```

The real-three run matters for this pass specifically: `BufferGeometry`,
`setAttribute`, `setIndex` and `dispose` are all exercised against the actual
library rather than a stub that might have been forgiving.

The selftest is now IDEMPOTENT against a live page. It takes its own `texCache`
for the duration and hands the page's back at the end, because `texCache` is
deliberately persistent and a selftest run after a real run would otherwise find
every sprite already cached and see no loader requests. `canvasCache` is
deliberately NOT swapped: the real `sharkart.js` baker keeps its own record of
what it has baked and answers a repeat request with a key instead of a canvas,
so clearing only our side of that pair would cache a null.

### Grep gates (re-run)

```
em dashes                    0
Math.random                  1  (the header comment stating the law)
setTimeout / setInterval     1  (the header comment stating the law)
addEventListener             0
Date.now / performance.now   0
document. / window.          0
new THREE.*Light             0  (engine3d owns creation, we only drive)
```

## Hand-off to other lanes

- **A3 (`engine3d.js`)**: pass the lights on `ctx.lights` as `{hemi, sun}` at
  `World.init(scene3, ctx)`, or call `RF.World.setLights({hemi, sun})`. Then
  DELETE the `scene3.fog` / `scene3.background` / `hemi` writes in
  `stepZoneLook()` (`engine3d.js:432-461`) and the second density formula at
  `engine3d.js:443`. Rev 2 makes those ours. `engine3d.js:1417` already calls
  `RF.World.teardown(ctx)`; teardown ignores its argument and is safe to call
  twice or on a world that was never inited.
- **D3 (`shark3d.js`)**: if `buildShark()` grows a `dispose()` on the returned
  rig record, `viewTeardown()` calls it. Without one the rig group is still
  detached from the scene, and this module never touches lane D3's shared
  geometry or material caches either way.

## LIFE-01 residual: the in-page 9 (2026-08-19, second pass)

The stub-scene proof above was green while the in-browser run left exactly
**9 children attached per cycle**. Both were true, and the gap between them is
the interesting part.

### What the 9 were

Lane F3's particle pools. `World.init()` calls `RF.Fx.init(scene3)`, and F3's
init attaches one `THREE.Points` per pool:

| pool | verts | pool | verts |
|---|---|---|---|
| bubbles | 96 | swimtrail | 128 |
| motes | 96 | speedlines | 72 |
| elementSpark | 64 | breach | 96 |
| ring | 24 | ambient | 160 |
| beamCore | 12 | | |

Nine, not ten: `POOL_NAMES` has ten entries but `goldpulse` is a DOM edge
overlay per UI_LAW and adds no scene child.

**Not** D3's ART-01 rework, which was the initial hypothesis. Verified directly:
`buildShark()` still returns `{group, parts, animate}`, unchanged, and
`RF.Art3D` exports exactly `buildShark, billboard, __selftest, paletteOf,
stats` with no dispose or releaseShark anywhere in the file. Detach-only for rig
groups is therefore correct per Rev 2, and the rig path was never implicated.
The batched teeth/plate geometry D3 merged lives inside the rig group, so
detaching the group takes it with it and the shared caches survive as intended.

### Why the stub proof could not see it

A stub scene has no `RF.Fx`, so `World.init()` skipped the FX branch entirely
and there was nothing to leak. The assertion was sound; its configuration was
too narrow. Proving teardown against a world whose siblings are all absent
proves teardown of a world that never had siblings.

### The actual defect: an asymmetric lifecycle

`World.init()` called `RF.Fx.init(scene3)` and nothing ever called
`RF.Fx.teardown()` - not this module, not `engine3d.endRun()`. F3's init is a
documented no-op when re-initialised against the same live scene, so the nine
pools did not accumulate; they simply persisted forever, which is why the count
sat flat at 9 instead of climbing to 45 over five cycles.

The rule applied, which is the general form rather than a patch for nine
objects: **whoever calls `init()` owns calling `teardown()`.** This module calls
`RF.Fx.init`, so when that call is what brought the pools up, this module's
teardown takes them back down. When `engine3d` had already initialised FX, F3's
init is a no-op, this module never claims ownership, and the pools are left
alone as another lane's lifecycle. `fxOwned` records which case applied and is
cleared by teardown.

Ownership is detected by **counting the `add()` calls** `RF.Fx.init` makes,
through a wrapper installed on the scene for the duration of that one call and
removed in a `finally`. The first version read `scene.children.length` instead,
which was wrong in a way worth recording: a caller may hand this module any
object whose only contract is `add()`, and on such a scene the field is
undefined, the count reads 0 both times, and the module silently concludes it
owns nothing. That is precisely how a check meant to catch a leak becomes a
second leak. Wrapping `add()` works for every scene shape there is.

This is scoped strictly to the FX that `world3d` itself starts. `FX-01`, the
review's finding about active particles and edge overlays crossing run
boundaries, remains F3 and A3's.

### Selftest change

`LIFE-01 IN-PAGE` re-runs the five-cycle test against the REAL siblings
whenever they are loaded, and names whatever is left over by type rather than
only counting it. The stub-scene cycles stay, because they still isolate this
module's own objects; they are no longer the whole proof.

```
ok LIFE-01: five init/teardown cycles return the scene child list to
   baseline 0 (0, 0, 0, 0, 0 after each teardown; peaks 249, 282, 254, 265, 262)
ok LIFE-01 IN-PAGE: five cycles against the REAL siblings (Fx present,
   Art3D present) return the scene to 0 children (0, 0, 0, 0, 0)
ok LIFE-01 IN-PAGE: the RF.Fx ownership flag is released by teardown, so a
   teardown without a matching init cannot tear down another lane's effects
```

The ownership guard was verified in both directions against real `fx3d.js`:

```
children after engine3d-style Fx.init:  9  (A3 owns them)
children after world3d teardown:        9  -> Fx PRESERVED, correct
after A3 tears its own Fx down:         0
```

### Proof matrix (re-run, all five configurations)

```
node --check world3d.js                                        PARSE_OK
stubbed three + real sharkart + Art3D stub          PASS 136 notes, 0 fails
stubbed three, NO RF.Art3D (fallback quads)         PASS 126 notes, 0 fails
REAL vendored three, no Fx/shark3d                  PASS 136 notes, 0 fails
IN-PAGE: real three + real shark3d + real fx3d
         + real sharkart                            PASS 137 notes, 0 fails
allocation probe, 20000 fixed steps after warm-up        2.174 bytes/step
```

Grep gates unchanged: 0 em dashes, 0 listeners, 0 DOM, 0 clock reads, 0 lights
created.

## ATMO-01 correction: the retune overshot bright (2026-08-19, third pass)

The first retune fixed "the player grays out" and introduced the opposite
failure: the zone-1 gameplay frame read as **pastel baby-blue milk**, with
god-ray bands rendering as huge pale slabs, a very pale water background and
collapsed contrast. Bright was delivered; bright and SATURATED was the actual
requirement.

Worth stating plainly because it shaped the fix: luminance-based assertions
cannot catch this. A washed-out frame is BRIGHTER than a correct one, so every
gate about the foreground keeping its chroma and about the abyss being darker
than the shelf stayed green while the frame was wrong. The failure mode needed
its own measurement.

### Cause 1: CLEAR_MIX threw away the authored palette

`CLEAR_MIX` sets how far the clear colour travels from the authored zone tint
toward that zone's near-white fog colour. It was `0.55`.

```
authored shelf tint  #1b4d66   HSV S 0.735   (rich blue)
authored shelf fog   #9fd4e8   HSV S 0.315   (nearly white)
clear at mix 0.55    #6497ae   HSV S 0.425   <- below the 0.45 bar, milk
clear at mix 0.22    #386a82   HSV S 0.569   <- saturated, still airy
```

`data.js` already contains a rich, deliberately authored water palette; a
0.55 mix was discarding most of it. **`CLEAR_MIX` is now 0.22**: the fog lift is
an accent on the authored tint rather than a replacement for it. The shelf is
still clearly lighter and airier than the raw tint, so it does not read heavy.

### Cause 2: batching accidentally raised the god-ray alpha ceiling

Before batching, each shaft carried `rr(0.06, 0.16)` on its own MATERIAL, and
the animate cycle scaled that down toward `RAY_ALPHA_LO`. After batching, alpha
moved to the VERTEX channel with material opacity pinned at 1, so the per-shaft
value became the whole story. Worse, seven additive shafts merged into one band
OVERLAP AND SUM where they cross, which a per-mesh alpha never did. High alpha
times stacking is what produced pale slabs across the shelf.

- band alpha `rr(0.07, 0.17)` -> **`rr(0.030, 0.075)`**, about half the old
  per-shaft ceiling, which is the right correction for members that can stack
- shaft width `rr(40, 120)` -> **`rr(28, 74)`**: a merged band already reads as
  a fan, so each shaft can be a shaft rather than a panel

### Cause 3: the additive stack over the shelf

Zone 1 is the top 900 px, and several full-width ADDITIVE layers blanket
exactly that band, so their alphas are charged against shelf saturation on
every frame the player is on the shelf. The worst-case stack was:

| layer | was | now |
|---|---|---|
| surface wash (top 500 px, full width) | 0.16 | **0.075** |
| caustics x3 (`CAUSTIC_ALPHA`) | 0.05 to 0.12 | **0.028 to 0.065** |
| surface foam (pure white) | 0.42 | **0.30** |
| shimmer | 0.05 | 0.05 (unchanged) |
| ray band, 2 overlapping | 0.34 | **0.15** |
| **total additive lift** | **+0.630** | **+0.421** |

The surface wash was the single largest contributor and its only job is to say
"up is bright" when seen from far below, which 0.075 still does.

### New gates

Three assertions that specifically catch pastel, since the existing ones
provably could not:

```
ok ATMO-01: the zone-1 clear colour stays SATURATED, not pastel
   (HSV S 0.569 >= 0.45, clear #386a82)
ok ATMO-01: the shelf clear keeps most of the authored tint saturation
   (0.569 vs authored 0.735)
ok ATMO-01: no zone clear colour goes pastel (worst S 0.569 at zone 1)
ok ATMO-01: god-ray shafts are accents not slabs, peak vertex alpha 0.082
   <= 0.11 (two overlapping shafts stay under 0.22)
```

The ray gate reads the actual merged vertex alpha out of the batch geometry, so
it measures what will really be drawn rather than the constant it came from.

### The play-plane chroma guard is untouched

The whole point of the first retune survives the correction: play-plane
retention is still 99.4 / 98.3 / 95.7 / 92.2 percent across the four zones, the
density guard still clamps any zone table, and hemisphere sky still tracks the
authored tint (verified `0x1b4d66` at the shelf). Deepening the clear colour and
cutting additive alpha does not fog the player; it stops painting white over
the water behind it.

Saturation now RISES with depth (0.569 -> 0.646 -> 0.683 -> 0.704) while value
falls (0.510 -> 0.376 -> 0.235 -> 0.106). Vivid blue that gets darker, rather
than pastel that gets grayer.

The screenshot gate at shallow, mid and deep remains TEST-01's and is still the
binding judgement. These numbers are the floor it sits on.
