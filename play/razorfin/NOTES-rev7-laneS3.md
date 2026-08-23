# Lane S3 (meta.js + tools/gen_data.py + data.js) — Rev 7 pass 1

Owns: meta.js, tools/gen_data.py, data.js (generated, never hand-edited),
this notes file. Scope: SPEC3D Rev 7 7.6 (economy: gems/relics/missions),
plan D5, plus 7.2's data-side half (zone intendedTier + spawn rebalance) and
7.6's tint field.

## data.js / gen_data.py changes

- **CREATURES / HAZARDS**: added `tint` (hex int) per row — each species'
  dominant/visible color. Column order in the generated table:
  `[id,name,tier,kind,speed,hp,score,coins,sprite,packMin,packMax,tint]` for
  CREATURES, `[...,dmg,tint]` for HAZARDS. This is what S5/engine reads for
  the swallow burst color (kills the constant-amber bug per 7.6).
- **anglerprey score outlier**: NOT trivially parameterized. Score does not
  follow a clean tier->score curve across the roster already (turtle t4=50,
  tuna t4=44, marlin t6=95 vs anglerprey t6=16) — anglerprey is intentionally
  a large loose pack (8-16) of low per-fish value, unlike marlin's solo
  tier-6 catch. Left as authored; documented in a code comment in
  gen_data.py rather than silently reparameterized. Flagging for
  orchestrator/Luna review in case the intent was actually a data bug.
- **ZONES**: added `intendedTier` per zone (1/3/6/9 for zones 1-4) and
  rebalanced spawn tables so every prey row's tier <= intendedTier+2:
  - Zone 1 (intendedTier 1, cap 3): dropped `turtle` (t4, over-cap), raised
    minnow/reeffish/mackerel/parrot/squidling weights to hold density.
  - Zone 2 (intendedTier 3, cap 5): gained `turtle` (t4, now in-band),
    dropped `dolphinfish` (t5 was borderline-fine but moved deeper to keep
    zone 2's max prey tier at 4 with headroom), lost `marlin`/`giantsquid`
    references were never in zone 2 (no-op there).
  - Zone 3 (intendedTier 6, cap 8): gained `dolphinfish` (t5, from zone 2),
    dropped `marlin` (t6 was in-cap actually — moved anyway to concentrate
    zone 3 on t3-t6 and push the two heaviest zone-3 rows, `marlin` t6 and
    `giantsquid` t7, to zone 4 where they read as a clear step-up), dropped
    `giantsquid` (t7, was exactly at cap 8 but reads better as an Abyss
    catch).
  - Zone 4 (intendedTier 9, cap 11): gained `marlin` + `giantsquid`.
  - Verified by hand: zone1 max prey tier 2 <=3; zone2 max 4 <=5; zone3 max
    6 <=8; zone4 max 10 <=11. Hazards (jelly/puffer/mine, tier 99) are
    excluded from the rule per SPEC 7.2 ("kind hazard" branch of the gate).
- **RELICS**: 12 rows, 3 per zone x 4 zones, `{id, zoneId, name}` only —
  placement geometry (maze dead-ends, seed=zoneId) is S2's job in
  world3d.js, not this table. Derived index `RELICS_BY_ZONE[zoneId]` is
  emitted alongside for O(1) lookup by zone.
- **MISSIONS**: 16 defs across all four required types (eatCount x7,
  findRelic x4, surviveZone x3, score x2). Gem rewards 1-5, weighted so
  harder/deeper-zone missions pay more (e.g. `m_find_relic_z4` = 5 gems,
  `m_eat_any_15` = 1 gem). Target shapes documented in SPEC.md and repeated
  below for S1/S4/S5.
- **GEMS**: `{frenzy:{goldrush:2, blood:1, school:1}, daily:2, gempickup:1}`
  exactly per plan D5/7.6 numbers.
- **SKINS**: 8 defs. 6 global (`sharkId:null`, usable on any owned shark,
  cost 6-12 gems) + 2 shark-locked (`reef` cheap starter skin at 5 gems,
  `megalodon` at 15 gems) to demonstrate the locked path. Palette-swap only
  (`{base,belly,accent,glow}`), no geometry change — L1/shark3d.js consumes
  `profile.skins.selectedSkin` to pick a palette override if/when wired
  (not yet consumed by any render lane; this is schema + economy only).
- **SECRET_SHARKS**: 2 rows gating two EXISTING act-3 roster sharks
  (`nullfin` relicSets:2/gemCost:20, `banshee` relicSets:3/gemCost:30) — no
  new roster row added, per the plan's explicit design call ("pick two
  existing act-3 sharks to gate... your call, document it"). Either path
  (relic-set count OR gems) unlocks; relic-set completion auto-grants
  ownership in `Meta.endRun` via `relicSetUnlocks()`, the gem path is an
  explicit `Meta.unlockSecretSharkWithGems(kit, profile, sharkId)` call from
  UI (S4).
- **SAVE_VERSION bumped 1 -> 2.**

Regenerate with `python3 tools/gen_data.py > data.js` from
`play/razorfin/`. Verified via a headless vm load (see selftest section)
that the new tables parse and the counts/values above are correct.

## meta.js changes

### Profile schema (SAVE_VERSION 2)

```js
gems: 0,
relics: { <zoneId>: [false, false, false] },   // one 3-bool array per RFD.ZONES id
skins: { owned: [], selectedSkin: null },
missions: { active: [], progress: {}, completed: {} }
```

`defaultProfile`, `validateSave`, `normalize`, and `migrate` were updated
together in one change (no window where one accepts a shape the others
reject). `validateSave` is strict (existing law): unknown skin/mission ids,
malformed relic arrays (wrong length, non-boolean entries, unknown zone
keys), or a `selectedSkin` not present in `owned` all fail the whole record.
`normalize` backfills any missing/malformed piece to its empty default
(used only on records that already passed validate, so this is defensive
depth, not the reject path). `migrate` adds a real `v===1` step that sets
the four new fields to their empty defaults and bumps `p.v` to 2
existing field (coins/xp/level/sharks/best/runs/tutorialDone/lastBonusDay)
and every existing field
(coins/xp/level/sharks/best/runs/tutorialDone/lastBonusDay) passes through
untouched.

### Gem authority

- `Meta.spendGems(kit, profile, n, reason)` — single spend authority
  (D5/7.6 law). Refuses (no mutation) if `profile.gems < n`. `kit` is
  optional; pass `null` to defer commit to the caller (used internally by
  `buySkin`/`unlockSecretSharkWithGems` so a failed follow-up step doesn't
  leave a half-committed spend — though as written those two helpers always
  commit after the spend succeeds).
- `Meta.addGems(profile, n)` — single award authority. Ignores negative `n`
  (floors at 0 added). Every gem credit path (frenzy completion, mission
  completion via `missionEvent`, daily bonus, `endRun`'s aggregate credit)
  funnels through this or through `run.gems` accumulation consumed by
  `endRun`.
- `Meta.buySkin(kit, profile, skinId)` / `Meta.selectSkin(kit, profile,
  skinId)` — economy for the SKINS table. `buySkin` refuses if already
  owned or (for shark-locked skins) the gating shark isn't owned.
- `Meta.unlockSecretSharkWithGems(kit, profile, sharkId)` — explicit
  gem-only unlock path for SECRET_SHARKS rows; refuses if already owned or
  not a secret-shark id.
- `Meta.relicSetCount(profile)` / `Meta.secretSharkUnlocked(profile,
  sharkId)` — read-only helpers. `secretSharkUnlocked` returns `null` for a
  non-secret shark id, `true`/`false` for the relic-set path specifically
  (does NOT report the gem path, since that's an active purchase, not a
  passive "is it unlocked" check — mirrors how `ownedFor`/`reallyOwned`
  already separate dev-overlay-owned from actually-owned).

### Missions

- `Meta.rollMissions(profile, rng)` — picks up to 3 active missions per run.
  Prefers not-yet-completed missions (falls back to the full pool if fewer
  than 3 remain uncompleted, so a player who's finished everything still
  gets 3 active goals to replay). `rng` is optional (defaults to
  `Math.random`); pass a seeded `ctx.rng` (mulberry32, per SPEC.md's
  `RF.ctx.rng`) for reproducible headless tests — the selftest does this.
  Writes `profile.missions.active` and zeroes `progress` for any newly
  picked id that doesn't already have a progress value.
- `Meta.missionEvent(ctx, type, payload)` — **the mission progress API
  S1/S2/S4/S5 call into.** Reads `ctx.save.missions` and `ctx.run`, returns
  the array of mission ids that completed on THIS call. Event names and
  payload shapes (binding contract for other lanes):

  | `type`      | payload             | matches mission `type`  | notes |
  |-------------|---------------------|--------------------------|-------|
  | `'eat'`     | `{ defId }`         | `eatCount`               | one eat event; `target.defId===null` missions match any defId |
  | `'relic'`   | `{ zoneId }`        | `findRelic`               | one relic collected; `target.zoneId===null` matches any zone |
  | `'zoneTime'`| `{ zoneId, seconds }` | `surviveZone`           | pass the RUNNING total seconds spent in that zone this run; progress is `max()`'d, not summed, so calling every fixed step is safe |
  | `'score'`   | `{ score }`         | `score`                  | pass the current run score (monotonic); progress is `max()`'d |

  Side effects on completion: sets `profile.missions.completed[id] = true`,
  adds `def.gems` to `ctx.run.gems` (creates the field as 0 if absent), and
  pushes `{id, name, gems}` onto `ctx.run.missionResults` (creates the array
  if absent). Already-completed missions are skipped entirely (no
  re-progress, no re-award) — safe to call `missionEvent` speculatively on
  every relevant game event without a completion guard on the caller side.

### endRun additions

`ctx.run` may now carry:
- `run.relics: [{relicId, zoneId}, ...]` — every relic collected this run.
  `endRun` marks the corresponding slot in `profile.relics[zoneId]` true
  (validated against `RFD.RELICS_BY_ZONE[zoneId]` — an unknown relicId is
  silently ignored rather than corrupting the array).
- `run.gems` — mission-completion gems, normally already populated by
  `missionEvent` calls during the run; `endRun` adds this as-is.
- `run.missionResults` — passed straight through into the payload (already
  built incrementally by `missionEvent`).
- `run.frenzyCompletions: {goldrush, blood, school}` — COUNTS of each frenzy
  type completed this run (not booleans); `endRun` multiplies each by
  `RFD.GEMS.frenzy.<type>` and sums into the gem total. This field's
  producer is S1/engine3d (frenzy cue completion tracking) — meta.js only
  consumes it; if absent, frenzy gems contribute 0 (degrades safely).

`endRun`'s return payload gains:
```js
{
  ...existing fields...,
  gems,                  // total gems credited this run (missions+frenzy+daily)
  gemsBreakdown: { missions, frenzy, daily },
  missionResults: [{id, name, gems}, ...],
  relicFinds: [{relicId, zoneId}, ...],     // echoes run.relics back
  relicUnlocks: [
    { type:'relicSet', zoneId },            // a zone reached 3/3 THIS run
    { type:'sharkUnlock', sharkId, via:'relicSet' }  // auto-granted secret shark
  ]
}
```
`relicUnlocks` is computed by diffing "zones complete before this run's
finds were applied" against "zones complete after" — so re-running with an
already-complete zone's relics (e.g. a relic re-collected, or the caller
resubmitting the same finds) does not re-report the unlock. Secret-shark
auto-grant checks `relicSetCount(profile) >= row.relicSets` after applying
this run's finds and grants ownership (`profile.sharks[id] = {owned:true,
up:blankUp()}`) if not already owned, emitting one `sharkUnlock` record per
newly-granted shark.

### `buildScenes` (Phaser Shop/Results scenes)

Per the task's explicit instruction, these dead scenes were NOT extended —
no gem counter, no relic/mission display was added to the Phaser Shop or
Results classes. `ui3d.js` (S4) is the live UI and is expected to read
`endRun`'s new payload fields and `profile.gems/relics/skins/missions`
directly; the Phaser scenes remain exactly as they were pre-Rev-7 (they are
never built per the `typeof Phaser === 'undefined'` guard at the top of
`buildScenes()`, unchanged).

## Selftest

`meta.__selftest()` gained:
1. An old-save (v1 literal) fixture that must survive `load()` (migrate +
   validate + normalize) with coins/xp/level/selected/sharks/upgrade
   levels/best/runs all intact, and backfilled gems=0 /
   relics=all-false / empty skins / empty active missions.
2. Gem accounting: `addGems`/`spendGems` credit/debit correctly, refuse
   overspend without mutating, ignore negative `addGems`. `buySkin` /
   `selectSkin` economy (global skin purchase, refuse rebuy, refuse
   unowned select).
3. Mission roll (seeded rng, correct count, progress initialized to 0) and
   `missionEvent` progress/completion (drives an any-prey `eatCount`
   mission to completion, checks progress/completed/gems/missionResults,
   and that a completed mission does not double-award on further matching
   events; also checks a `findRelic` completion).
4. Relic-set unlock: drives `endRun` across N runs (N = the lowest
   `SECRET_SHARKS[].relicSets` value) each completing one zone's 3 relics,
   asserts the `relicSet` unlock is reported exactly on the run that
   completes each zone (not before, not re-reported after), that
   `relicSetCount` matches, and that the gated secret shark auto-unlocks
   once its threshold is met.
5. Gems flowing end-to-end through `endRun` (mission + frenzy + daily
   summed correctly into the payload and credited to the profile, with a
   `gemsBreakdown` matching each source).

Run: `cd play/razorfin && node --import ./tools/reg.mjs tools/selftest.mjs meta`
Result: **`meta: pass=true ok=159 fail=0`**

Full suite smoke: `node --import ./tools/reg.mjs tools/selftest.mjs world game art3d fish fx ui meta abilities`
```
world: pass=false ok=5 fail=2   <- buildBackgroundSchools is not defined (S2/world3d.js — 7.2 deletion not yet landed there; NOT my file)
game:  pass=false ok=213 fail=1 <- clearStick head-drag assertion (S1/engine3d.js — 7.1 controls rewrite; NOT my file)
art3d: pass=true ok=28 fail=0
fish:  pass=true ok=7 fail=0
fx:    pass=true ok=0 fail=0
ui:    pass=true ok=173 fail=0
meta:  pass=true ok=159 fail=0
abilities: pass=true ok=0 fail=0
```
Both failures are in files outside S3's ownership (world3d.js is S2's,
engine3d.js is S1's) and correspond exactly to the Rev 7 work assigned to
those lanes (7.2 school deletion, 7.1 head-drag controls) — noted per task
instructions, not touched.

## Deviations from the plan/spec

- SPEC.md's schema section for `ZONES` previously didn't have a documented
  `pressureTier` line either; I preserved the existing `pressureTier` field
  as-is (unrelated to this lane) and only added `intendedTier` next to it.
- `RELICS_BY_ZONE` is a generated convenience index not explicitly asked
  for in the plan/spec, added because S2 (relic placement) and meta.js
  (relic-set validation/unlock) both need "all relics for zone N" lookups
  and re-deriving it by filtering `RELICS` in two files risked drift.
  Documented in SPEC.md as a derived/generated field.
- `missionEvent`'s `'zoneTime'` and `'score'` progress are `max()`'d rather
  than summed, specifically so the calling lane (S1/S2) can call every
  fixed step with a running total without needing its own "have I already
  reported this" guard. Flagging in case S1/S2 expected a one-shot event
  instead of a per-step call — the two are compatible (a one-shot call with
  the final value works identically), so no coordination should be needed,
  but worth confirming when those lanes land.
- `secretSharkUnlocked()` deliberately does NOT check the gem path (only
  relic-set). The gem path is an active purchase (`unlockSecretSharkWithGems`),
  not a passive "is this available" query, mirroring the existing
  `ownedFor`/`reallyOwned` split for dev-unlocked sharks. If S4 wants a
  "can currently be bought with gems" indicator for UI, that's
  `profile.gems >= SECRET_SHARKS_row.gemCost && !reallyOwned(...)` computed
  client-side in ui3d.js — no new meta.js API added for that since it's a
  one-line derived check from data already exposed.

## Risks / things worth a second look

- The anglerprey score outlier (see above) was left unparameterized by
  design judgment, not because a formula genuinely didn't exist — a second
  pair of eyes (Luna review) on whether the low score is intentional
  "many, cheap" design vs. a forgotten multiplier would be good.
- `SKINS`/`profile.skins.selectedSkin` schema is in place and validated,
  but no render lane (L1/shark3d.js or S4/ui3d.js) currently reads or
  applies it — it's inert until a consumer is wired. Flagging so it isn't
  mistaken for "skins are live" from the save-schema alone.
- Zone spawn-table rebalance was done by hand against the "prey tier <=
  intendedTier+2" rule with a headless arithmetic check (not a full
  world3d/gameplay playtest, since world3d.js is S2's file and currently
  fails its own selftest for an unrelated reason — `buildBackgroundSchools`
  deletion). Worth a played-probe pass once S2 lands to confirm the new
  tables actually feel right in-run, not just pass the tier-gap rule.
