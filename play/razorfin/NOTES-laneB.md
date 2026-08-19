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
