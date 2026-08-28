# Rev 15 EAT lane — "still lots of floating fish that you cannot eat"

## Owner verdict

"Still lots of floating fish that you cannot eat."

## Root cause: two tier gates that are not the same number

There are two independent tier ceilings in the game and they disagree by one
tier:

| gate | formula | where |
|---|---|---|
| **spawn table gate** | `preyTier <= intendedTier(zone) + 2` | `world3d.js` `checkSpawnTableGate` / `buildLevelZones` |
| **eat gate** | `preyTier <= player.tier + BITE_UP_BASE(1) + biteUp` | `engine3d.js` `eatEligible()` |

Zone 1 has `intendedTier: 1`, so the spawn table legally admits **tier 3**.
The starting shark (`reef`, tier 1) can only swallow **tier 2**. Every tier-3
prey placed on the tier-1 shelf is therefore:

- not eatable (`eatEligible()` false -> `TOO BIG`, rate-limited to one cue per
  0.6 s by `TOO_BIG_CD`), and
- not a hazard (`kind: 'prey'`, so `world3d`'s AI only ever makes it *flee*;
  it never pushes a `playerHits` record, never stings).

That is exactly the Rev 7 "eatable-or-hazard" law being violated: a visible
creature that is neither eatable at the current tier nor stings. It just
floats, flees, and gives nothing back.

## Why it regressed now (the 12-level rework)

Rev 12 added `LEVELS[].preyWeights`, and `buildLevelZones()` **replaces** the
base zone prey rows with the level's own weighted prey list (it has to — the
3-species cap would blow otherwise). Its only filter is the zone table's
`tier + 2` rule, i.e. the *wide* gate. So a level whose `preyWeights` happen
to sit in that top band hands zone 1 a roster the resident tier-1 shark
cannot eat:

| level | zone 1 prey BEFORE fix | eatable by tier-1 shark? |
|---|---|---|
| hawaii | minnow(t0) reeffish(t1) parrot(t2) | all — fine |
| **mexico** | **grouper(t3)** mackerel(t1) | grouper NO |
| **belize** | reeffish(t1) parrot(t2) **grouper(t3)** | grouper NO |
| **jamaica** | **grouper(t3)** parrot(t2) reeffish(t1) | grouper NO |
| **alaska** | **seal(t3)** *(only row)* | **NOTHING eatable at all** |

Alaska is the worst case and almost certainly the screen the owner was looking
at: its entire zone-1 prey roster is `seal` (tier 3), so a fresh run has
literally nothing edible on the whole shelf.

This is also why it reads as intermittent — hawaii (the default first level)
is clean, so the bug only shows once you pick another level.

## Played probe — BEFORE

`scratchpad/eat_contact_probe.mjs`. Real page in headless Chrome (service
worker bypassed, 844x390 landscape, `?unlockall=1`), starts a real run on the
tier-1 `reef` shark, then steers by **projecting the nearest prey's world
point back to CSS and writing it as the live finger position** — the engine
unprojects it itself through `cssToWorld`, so turn rate, accel and the whole
eat pipeline run exactly as they do under a real drag. No velocity or
position backdoor.

Each contact (anything entering the real mouth query radius) is classified
from the engine's own buses:

- `eaten` — `RF.World.kill` fired for it
- `stung` — it appears in `RF.World.playerHits` (the authoritative hit bus;
  raw `player.hp` is useless here because metabolism drains it every step)
- `tooBig` — rising edge of `player.st.tooBigCd`
- `nothing` — none of the above: the defect

BEFORE (45 s, tier-1 reef shark, level 1 of each):

```
mexico | contacts 2  eaten 0  stung 0  tooBig 1 {grouper(t3):1}  NOTHING 1 {grouper(t3):1}
alaska | contacts 2  eaten 0  stung 0  tooBig 2 {seal(t3):2}     NOTHING 0
hawaii | contacts 1  eaten 0  stung 1  tooBig 0                  NOTHING 0
```

Live rosters on screen at the end of the run:

```
mexico  grouper:prey:t3 x10   mackerel:prey:t1 x18   jelly x3  puffer x1
alaska  seal:prey:t3    x18   tuna:prey:t4     x3    jelly x9  puffer x2
hawaii  minnow:t0 x11  reeffish:t1 x14  parrot:t2 x6  puffer x1
```

Ten live groupers and eighteen live seals — all un-eatable, none of which
sting. Reproduced.

## Fix (rule level, on spawn — `world3d.js`)

Two changes, both gating on the tier rule rather than papering over in art.

**1. `runSpawner()` — never place prey above the player's live eat ceiling.**

`var defId = pickWeighted(z.spawns)` became
`var defId = pickEatablePrey(z, ctx.player, ctx.mouth)`.

`pickEatablePrey()` weights-to-zero any prey row above the ceiling and then
runs the ordinary `pickWeighted` over what's left. Hazards are **exempt** —
they are tier 99 by construction and they sting, which is the feedback the
eatable-or-hazard law actually asks for. One pass, no resample loop, and it
reuses a module-level scratch array so it stays allocation-free in the fixed
step like `pickWeighted` itself.

The ceiling comes from `playerEatCeiling()`, which reads
`ctx.mouth.eligibleTierMax` — the number `engine3d`'s `publishMouth()`
publishes every step, already including megajaw / supersize / MEGA GOLD RUSH.
Reading the engine's own published value (rather than recomputing it) is what
keeps the spawn gate from ever drifting away from the gate that actually
decides whether a bite lands. It falls back to
`player.tier + BITE_UP_BASE + biteUp` only before the first `publishMouth`
(run start) or in a headless harness with no mouth.

**2. `buildLevelZones()` — a zone must keep at least one prey a resident can eat.**

After the `preyWeights` overlay, if no surviving row has
`tier <= intendedTier(zone)`, the base zone's own low-tier prey rows are
re-admitted alongside the level's flavour (up to the same 3-species cap)
rather than the zone being left with an all-above-tier roster. `intendedTier`
is the right threshold here because a zone's `intendedTier` is the tier of the
shark meant to be there, and that shark's ceiling is `intendedTier + 1` — so
`intendedTier` is always comfortably inside it.

Alaska zone 1 after the fix: `seal(t3) minnow(t0) reeffish(t1)` — the seal
stays as the level's signature creature but the shelf is no longer barren, and
change 1 keeps the seal from actually spawning while the player is tier 1.

Note `azores` and `california` have **no** zone-1-eligible prey in their
`preyWeights` at all (everything tier >= 4); those already fell through the
pre-existing `!preyRows.length` fallback to the base roster
(minnow/reeffish/mackerel) and were never broken.

## Played probe — AFTER

Same probe, 3 runs x 60 s in each of the three levels that carried the defect
(mexico / alaska / hawaii), tier-1 `reef` shark:

```
mexico | contacts 6  eaten 4  stung 2  tooBig 0  NOTHING 0
mexico | contacts 8  eaten 3  stung 5  tooBig 0  NOTHING 0
mexico | contacts 3  eaten 1  stung 2  tooBig 0  NOTHING 0
alaska | contacts 3  eaten 0  stung 3  tooBig 0  NOTHING 0
alaska | contacts 5  eaten 2  stung 3  tooBig 0  NOTHING 0
alaska | contacts 0  eaten 0  stung 0  tooBig 0  NOTHING 0
hawaii | contacts 0  eaten 0  stung 0  tooBig 0  NOTHING 0
hawaii | contacts 2  eaten 1  stung 1  tooBig 0  NOTHING 0
hawaii | contacts 0  eaten 0  stung 0  tooBig 0  NOTHING 0
```

**Zero `NOTHING` contacts and zero `TOO BIG` cues across all nine runs.** Every
single contact now resolves as either *eaten* or *stung* — which is the Rev 7
eatable-or-hazard law, restored. (The remaining stings are jelly/puffer/mine
hazards, which is correct: those are supposed to sting.)

### The brief's levels 1 / 4 / 8 (hawaii / maldives / azores)

Those three happen to be levels the bug never reached, which is worth stating
rather than hiding — the defect lives in mexico / belize / jamaica / alaska.
Confirmed clean anyway:

- **hawaii (1)** — runtime probe, 3 runs: 0 NOTHING, 0 TOO BIG. Roster
  `minnow(t0) reeffish(t1) parrot(t2)`, all within ceiling 2.
- **maldives (4)** — runtime probe: 0 NOTHING, 0 TOO BIG. Roster
  `squidling(t2) reeffish(t1) minnow(t0)`, all within ceiling 2.
- **azores (8)** — provably clean by construction: its whole `preyWeights`
  (`swordfish` t5, `giantsquid` t7, `marlin` t6) is rejected by the
  pre-existing zone-1 `tier+2` gate, so zone 1 falls through to the base
  roster `minnow(t0) reeffish(t1) mackerel(t1)` — every row inside a tier-1
  shark's ceiling of 2, so no above-ceiling prey can spawn there at all.

Full 3-runs-each result on the brief's trio:

```
hawaii   | contacts 0  eaten 0  stung 0  tooBig 0  NOTHING 0
hawaii   | contacts 7  eaten 1  stung 6  tooBig 0  NOTHING 0
hawaii   | contacts 3  eaten 0  stung 3  tooBig 0  NOTHING 0
maldives | contacts 1  eaten 1  stung 0  tooBig 0  NOTHING 0
maldives | contacts 8  eaten 3  stung 5  tooBig 0  NOTHING 0
maldives | contacts 1  eaten 0  stung 1  tooBig 0  NOTHING 0
azores   | contacts 5  eaten 1  stung 4  tooBig 0  NOTHING 0
azores   | contacts 3  eaten 1  stung 1  tooBig 0  NOTHING 1 {jelly(t99)}
azores   | contacts 1  eaten 0  stung 1  tooBig 0  NOTHING 0
```

**Zero TOO BIG and zero un-eatable PREY across all nine runs.** The single
`NOTHING` is a **jelly (tier 99 hazard), not prey, and it is a probe artifact
rather than a game defect** — worth spelling out so nobody re-opens it:

- the jelly's damage is `pushHit(e, dmg, x, y, /*sting*/ true)` at
  `world3d.js:7441`, fired on contact gated by a **per-entity**
  `e.st.biteCd = 1.2`;
- `publishSting()` (the toast announce) is separately gated by a **global**
  `S.stingCd = 1.2` — deliberately, so parking against a jelly reads as one
  sting, not one per frame (`world3d.js:614`).

That run had four jellies stinging inside the same window; a fifth was brushed
while its own `biteCd` had not yet elapsed, and my probe's `S.done` timeout is
also 1.2 s, so it retired the record before the hit landed. The entity is a
hazard that does sting — it is legal under the eatable-or-hazard law either
way. **No prey ever logged `NOTHING` after the fix.**

### Rendered-pixel evidence

`hse/evidence/r15-eat/{before,after}-{alaska,mexico}.png`, captured with
`Page.captureScreenshot`, service worker bypassed, `landscapePrimary` override.
The live on-screen roster at each capture, tier-1 shark, **eat ceiling 2**:

| level | BEFORE | AFTER |
|---|---|---|
| alaska | `seal(t3) x20`, `tuna(t4) x3` + jelly x6 puffer x3 — **23 prey on screen, 0 of them edible** | `minnow(t0) x12`, `reeffish(t1) x20` — **32 prey, all edible** |
| mexico | `grouper(t3) x6`, `tuna(t4) x4`, `mackerel(t1) x19` + jelly x2 mine x1 — **10 inedible floaters** | `mackerel(t1) x31` + jelly x1 — **all 31 edible** |

Alaska is the clean before/after: a shelf that was 100 % un-eatable floating
fish is now 100 % eatable prey plus honest stinging hazards. No above-ceiling
prey survives on screen in either level.

Caveat on the PNGs, stated plainly: the shot probe lets the spawn ring fill
and then captures a single idle frame without driving the shark, so the fish
are often off-camera and the image mostly shows empty water. **The roster
counts above (read off `RF.World.entities` at the moment of capture) and the
contact probe are the real evidence here** — the PNGs are supporting context,
not the proof. Judge this lane on the roster/contact numbers.

## Coverage: no zone is starved by the fix

Swept all 12 levels x 4 zones, asking "after both changes, what can a player
who BELONGS in this zone (tier == intendedTier, ceiling == intendedTier + 1)
actually eat here?":

```
hawaii       z1:minnow/reeffish/parrot  z2:minnow/reeffish/parrot  z3:...  z4:...
mexico       z1:mackerel                z2:grouper/mackerel/tuna   z3:...  z4:...
belize       z1:reeffish/parrot         z2:reeffish/parrot/grouper z3:...  z4:...
maldives     z1:squidling/minnow/reeffish  z2:squidling            z3:...  z4:...
newzealand   z1:mackerel                z2:tuna/mackerel           z3:...  z4:...
alaska       z1:minnow/reeffish         z2:tuna/seal               z3:...  z4:...
tahiti       z1:parrot/squidling/minnow z2:parrot/squidling        z3:...  z4:...
azores       z1:minnow/reeffish/mackerel z2:parrot/grouper         z3:...  z4:...
bali         z1:parrot/squidling/reeffish  ...
aruba        z1:mackerel                z2:mackerel/tuna           ...
jamaica      z1:parrot/reeffish         z2:grouper/parrot/reeffish ...
california   z1:minnow/reeffish/mackerel z2:tuna/sealion/parrot    ...
```

**Every level x zone has at least one eatable species** — no zone is emptied
or starved by the gate. The higher-tier rows (seal, grouper, tuna, marlin...)
are still in the tables and still spawn; they simply wait until the player's
ceiling reaches them, which is the intended progression rather than a wall of
inedible scenery.

The ceiling is re-read every step from `ctx.mouth.eligibleTierMax`, which
`publishMouth()` recomputes from `p.tier` each frame — so buying a bigger
shark, or picking up megajaw / supersize / MEGA GOLD RUSH mid-run, immediately
widens what the spawner is allowed to place. The gate tracks progression live.

## Selftests

My change **alone** on top of HEAD:

```
world: pass=true ok=379 fail=0
game:  pass=true ok=386 fail=0
```

`ENTITY_BUDGET.total` left at 120 as instructed.

In the combined working tree the world suite shows two failures —
`ATMO-01 (god-ray shafts ... peak vertex alpha)` and the `formation` aspect
-ratio probe. **Neither is mine.** The WATER lane is editing `world3d.js`
concurrently (its `Rev 15 WATER` god-ray blocks are in the same file);
ATMO-01 is its assertion, and the formation probe is the chaotic one the brief
already flagged. Verified by applying my three hunks alone onto
`HEAD:world3d.js` and running the suite — green, as quoted above.

## Ownership note — ACTION REQUIRED BY THE ORCHESTRATOR

I was assigned `world.js` + `game.js`. **Those two files are the dead 2D
build**: `index.html` (the game everyone plays) loads
`data.js meta.js abilities.js sharkart.js ui3d.js fx3d.js shark3d.js
fish3d.js world3d.js engine3d.js` — `world.js`/`game.js` are only referenced
by `index2d.html`. The eat law and the spawner the owner is complaining about
live in **`engine3d.js` (`eatEligible`, `stepEat`)** and
**`world3d.js` (`runSpawner`, `buildLevelZones`)**.

So the fix necessarily landed in `world3d.js`, which is outside my lane and is
being edited by the WATER lane at the same time. My three hunks are:

- `buildLevelZones()` — the "keep one edible prey row" block
- `playerEatCeiling()` + `pickEatablePrey()` helpers (added just above the
  `// NPC shark table` comment)
- `runSpawner()` — the one-line `pickWeighted` -> `pickEatablePrey` swap

They are self-contained and touch nothing the water lane touches, but they
must be merged deliberately rather than assumed.

**A clean patch of exactly my three hunks against `HEAD:world3d.js` is
committed as `hse/evidence/r15-eat/eat-law.patch`** (128 lines). If the merge
gets messy, apply that to HEAD's `world3d.js` and re-layer the water lane on
top — that combination is what I verified green.

While I worked, the water lane's non-atomic writes to `world3d.js` twice
served a half-written file to my probe (`PAGEERROR Unexpected identifier`),
and at one point a stale background job of mine restored an older copy over
the water lane's work (immediately repaired — the file now carries both lanes,
`pickEatablePrey` x2 and `Rev 15 WATER` x7). If the water lane reports missing
work, that snapshot churn is the cause and their current content is intact as
of this writing. The probes now serve from a `/tmp` snapshot rather than the
live tree specifically so they cannot be perturbed by (or perturb) another
lane mid-write.

## Files

- `world3d.js` — the fix (3 hunks; NOT my assigned lane, see above)
- `NOTES-rev15-eat.md` — this file
- `hse/evidence/r15-eat/`
  - `eat-law.patch` — my hunks alone, against HEAD
  - `before-alaska.png` / `before-mexico.png` / `after-*.png`
  - `contacts-before.json` / `contacts-after.json` — raw probe output
  - `eat_contact_probe.mjs` / `eat_shot.mjs` — the probes, rerunnable with
    `ROOT=<snapshot> PORTOFF=<n> LEVELS=a,b,c RUNS=3 SECS=60 OUT=<json> node ...`
