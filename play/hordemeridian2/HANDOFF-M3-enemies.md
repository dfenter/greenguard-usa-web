# HANDOFF M3: enemies (bestiary, in progress, context-cut exit)

Branch `hm2-m3`, commit `8cd07660`. Not merged to main, not deployed.

## Done

- `hm_data.js`: `M3_ENEMIES` table (7 keys), merged into `REGION_ENEMY_BY_KEY`
  so `spawn(key, ...)` reaches them like any variant/apex entry. Not added
  to `REGION_ENEMIES` wave pools (mission wiring is M4 scope), so normal
  play is unaffected until a future pool references them.
  - `wing-cutter` (formation), `rift-strafer` (strafer), `wall-warden`
    (shield-wall), `nebula-burrower` (burrower), `gem-mimic` (mimic),
    `mine-bomber` (bomber), `xp-leech` (leech).
- `hm2_enemies.js` (new file): `HM2_ENEMIES.BEHAVIORS` lookup with a step
  function per behavior, consulted in `game.js`'s `stepEnemies` right after
  the `regionBoss` branch and before the existing if/else chain. Returns
  `true` if it fully handled the enemy this frame (loop `continue`s),
  `false`/undefined to fall through to the old chain untouched. Also
  exports `wallDamageMultiplier` for shield-wall's frontal-vs-flank split.
- `game.js`: two additive hooks only — the lookup call in `stepEnemies`,
  and one line in `damage()` multiplying `amt` by
  `HM2_ENEMIES.wallDamageMultiplier` when `e.behavior === 'shield-wall'`.
  No existing branch semantics changed.
- `index.html`: one `<script src="hm2_enemies.js">` tag, after
  `hm2_background.js`.
- `hm2_bestiary_probe.mjs` (new): Playwright probe, seeded RNG
  (mulberry32, seed logged to stdout), spawns each of the 7 keys at a
  randomised angle/distance each run, drives `stepEnemies`/`stepEbolts`/
  `stepGems` directly (no wall-clock dependency), and asserts:
  - spawn returns a live enemy with the right `behavior` field
  - real non-stuck movement (position delta over 3s)
  - a signature check per behavior that the OLD fallthrough chain cannot
    satisfy: V-wing angle change (formation), frontal damage < 50% of
    flank damage (shield-wall), submerged/surfaced alpha cycle
    (burrower), dormant-then-wake (mimic), a live/detonated mine appears
    (bomber), and enemy hp gain from a nearby gem (leech; `strafer`'s dps
    proxy also requires a landed ebolt)
  - a dps-proxy band per behavior
  - real region keys only (`aurelion-graveyard`, `void-rift`,
    `meridian-verge`, `ember-drift`, `crystal-shoals`), boot state
    confirmed `playing` (orientation gate cleared) before any assertion
  - no new console errors (SW-scope noise filtered, same filter as
    `hm2_campaign_probe.mjs`)

## Probe evidence

- `node hm2_bestiary_probe.mjs 8793 <seed>`: **50/50 assertions pass**,
  exit 0, run across 14 seeds (1, 42, 999, 7, 12345, 55555, 2, 3, 8, 9,
  111, 222, 333, 4444) — all clean, all seeds logged to stdout via
  `SEED <n>`.
- Server: `python3 -m http.server 8793` from the worktree root (repo
  serves `/play/hordemeridian2/index.html` directly).

## Mutation testing (all 8 caught, non-negotiable requirement)

Each of the 7 `BEHAVIORS` map entries plus `wallDamageMultiplier` was
patched to a neutered no-op (`function(){ return false; }` for behaviors,
`return 1` unconditionally for the multiplier), probe re-run at seed 42:

| mutation | result |
| --- | --- |
| formation -> no-op | exit 1, 49/50 |
| strafer -> no-op | exit 1, 49/50 |
| shield-wall -> no-op | exit 1, 49/50 |
| burrower -> no-op | exit 1, 49/50 |
| mimic -> no-op | exit 1, 49/50 |
| bomber -> no-op | exit 1, 49/50 |
| leech -> no-op | exit 1, 49/50 |
| wallDamageMultiplier -> always 1 | exit 1, 49/50 |

All 8 mutations dropped exactly the one signature assertion for that
behavior and nothing else, confirming the assertions are behavior-specific
and not generically satisfied by the old fallthrough chain. File restored
from `/tmp/hm2_enemies.js.bak` after each mutation; working tree is clean
(verified `diff` against the backup was empty before commit).

## Campaign probe — STILL RUNNING at context cutoff, not yet read

Command (copied unmodified from
`/Users/lucille/ue-port-studio/aaa/harness/hm2_campaign_probe.mjs` into
`play/hordemeridian2/hm2_campaign_probe.mjs` per plan instructions):

```
cd play/hordemeridian2
node hm2_campaign_probe.mjs http://127.0.0.1:8793/play/hordemeridian2/ /tmp/hm2_m3_campaign_shots 2
```

Log path: `/tmp/hm2_m3_campaign.log` (background PID 59296, launched
against the `python3 -m http.server 8793` above; server may need
restarting if that shell has since exited).

Last observed progress before cutoff: registry checks all PASS (15
levels), L1 through L11 all PASS boot + mid-run alive + no console
errors, L12 boot PASS, then cut off mid-run. **No failures seen yet.**
Since M3 enemies are not in any `REGION_ENEMIES` wave pool, this run
should be unaffected by M3's changes either way (a regression here would
point to the `stepEnemies` lookup insertion itself, e.g. a thrown
exception in `HM2_ENEMIES.BEHAVIORS` lookup on an unrelated behavior
string) — read `/tmp/hm2_m3_campaign.log` in full and re-run if stale:

```
node hm2_campaign_probe.mjs http://127.0.0.1:8793/play/hordemeridian2/ /tmp/hm2_m3_campaign_shots2 2 > /tmp/hm2_m3_campaign_v2.log 2>&1
```

## Residuals / not done

- 15-mission regression confirmation (see above, re-run and read the log).
- 60fps-at-300-enemies acceptance criterion not measured this session.
- M3_ENEMIES are not yet wired into any `REGION_ENEMIES` wave pool or
  `WAVES` table, so they are reachable (spawn-by-key, per Scope) but will
  never appear in a normal run yet. Wiring into actual spawn tables is
  natural M4 (stages/events) territory per the plan's own split, but if
  M3 is expected to make them appear in play before M4 lands, that wiring
  is still open.
- Bosses (6 bosses, 3 phases each, per M3 plan section) are NOT started
  this session — this handoff covers the enemy-behavior half of M3 only.
- Did not touch `hm2_world.js`/`hm2_background.js` beyond calling existing
  hooks (none of the 7 behaviors needed a new terrain hook; burrower's
  submerge/emerge is enemy-local, not nebula-hook-driven).
- Noted but NOT fixed (out of M3 scope, pre-existing M2 code): in
  `applyTerrainToEnemy`, `FEATURES_BY_REGION`'s `asteroid_field` entries
  are built with no `x`/`y` ever populated by any spawn call, so the
  `asteroid.x == null` branch always computes `dist = 0` and treats every
  enemy as inside the field, applying a small constant per-tick contact
  damage regardless of true position. The probe stubs
  `scene.currentRegionFeatures` to `null` during its isolated per-behavior
  sample specifically to avoid this pre-existing background tick
  polluting the dps-proxy numbers; flagging for whoever owns M2 cleanup.

## Files touched

- `play/hordemeridian2/hm_data.js`
- `play/hordemeridian2/game.js`
- `play/hordemeridian2/index.html`
- `play/hordemeridian2/hm2_enemies.js` (new)
- `play/hordemeridian2/hm2_bestiary_probe.mjs` (new)
- `play/hordemeridian2/hm2_campaign_probe.mjs` (new, copied from harness)
