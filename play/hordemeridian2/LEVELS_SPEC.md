# Horde Meridian 2 - Campaign Level Contract (Rev 2)

This is the binding contract between the campaign framework (in `game.js`) and
the fifteen level definition files (`levels/level1.js` to `levels/level15.js`) plus
the mission-select UI (`hm_campaign_ui.js`). Level files are FULLY DECLARATIVE:
plain data and timed event rows. No functions, no scene access, no DOM access,
no timers. The framework validates every definition at boot and excludes any
malformed level with a console warning.

## File shape (levels/levelN.js)

```js
(function () {
  'use strict';
  window.__HM_LEVELS = window.__HM_LEVELS || {};
  window.__HM_LEVELS[N] = {
    id: N,                    // integer 1..15, must equal the registry key
    key: 'first-contact',     // kebab-case slug, unique
    name: 'FIRST CONTACT',    // display name, UPPERCASE, <= 18 chars
    tagline: 'HOLD THE VERGE',// UPPERCASE, <= 34 chars
    briefing: [               // 1..3 lines shown on mission select, <= 44 chars each
      'The Verge picket line is thin.',
      'Hold it for three minutes.'
    ],
    region: 'meridian-verge', // starting region key (see hm_data.js REGIONS)
    duration: 180,            // run seconds. 120 <= duration <= 560
    waves: [ ... ],           // REQUIRED, 3..14 rows, same shape as WAVES in hm_data.js
    mods: { ... },            // optional difficulty multipliers
    bases: [ ... ],           // optional scheduled Warden bases
    regionBosses: [ ... ],    // optional scheduled Swarm Lords
    finalBoss: null,          // optional final encounter (see below)
    objectives: [ ... ],      // REQUIRED, 1..4 rows
    stars: [ ... ],           // REQUIRED, exactly 3 rows, first is type 'win'
    events: [ ... ],          // optional timed beats, 0..24 rows
    music: 'base'             // optional: 'base' (default) or 'heat'
  };
}());
```

Style: ES5 only (`var`, function literals), single IIFE, `'use strict'`,
2-space indent, no trailing whitespace, must pass `node --check`. NO em dashes
in any user-facing string. File size <= 12 KB.

## waves

Same row shape as the base game's `WAVES` table:
`{ at: <sec>, rate: <sec/spawn>, pack: <1..5>, pool: [<enemy keys>] }`
- `at` strictly ascending, first row `at: 0`.
- `rate` in [0.22, 1.4]; `pack` integer 1..5.
- Pool entries may be the six classic family keys (`drifter`, `sprinter`,
  `bulwark`, `sapper`, `lancer`, `weaver`) AND/OR region-variant keys from
  `REGION_ENEMIES` in hm_data.js (e.g. `cinder-kamikaze`, `blink-stalker`,
  `derelict-guard-hulk`). Never `boss` and never a key that does not exist.
- The 7 M3 bestiary keys are now valid pool entries, folded into
  `REGION_ENEMIES` alongside the classic variants: `mine-bomber` and
  `gem-mimic` (ember-drift / crystal-shoals), `wing-cutter`, `rift-strafer`,
  `nebula-burrower` (void-rift), `wall-warden`, `xp-leech`
  (aurelion-graveyard). Meridian Verge has no variant table and keeps none of
  them.
- After the last row the framework keeps using it until the run ends.

## mods (all optional, defaults 1.0)

`{ enemyHp, enemyDmg, enemySpeed, spawnRate, xp }`
Each in [0.5, 2.5]. `spawnRate` > 1 means MORE spawns (the framework divides
row rates by it). Applied to every non-boss enemy in the level.

## bases

`{ at: <sec>, type: 'hive'|'bastion'|'relay', x: <-6100..6100>, y: <-2400..2400> }`
0..6 rows, `at` ascending. Destroying bases feeds the `bases` objective.

## regionBosses

`{ at: <sec>, region: <region key>, x, y, hpMul?, dmgMul? }`
0..5 rows. Spawns that region's Swarm Lord (hm_data.js REGION_BOSSES) at the
given time and place. `hpMul`/`dmgMul` in [0.5, 2.5], default 1. Kills feed
the `boss` objective.

## finalBoss

`null`, or:
```
{ type: 'core',                       // the Meridian Core
  at: 'duration' | <sec>,             // 'duration' = spawns when the clock hits duration
  hpMul?: 1.0, dmgMul?: 1.0,          // [0.5, 3.0]
  escorts?: ['ember-drift', ...] }    // 0..2 region keys; their Swarm Lords spawn alongside at 0.6x hp
{ type: 'region', region: 'void-rift', at: ..., hpMul?, dmgMul? }
```
When `at: 'duration'`, the survive clock ends in the boss arrival and the run
continues until the boss dies. Final boss death feeds the `boss` objective and,
if `winWhen` is omitted, ends the mission in victory once all objectives are
complete.

## objectives

1..4 rows. The mission is WON when ALL objectives are complete (and any
finalBoss is dead). Types:
- `{ id, type: 'survive', label }` - completes when the clock reaches `duration`,
  OR earlier the moment every other objective (including any finalBoss kill) is
  complete: the duration is a ceiling, not a sentence. A level whose ONLY
  objective is survive always runs the full duration.
- `{ id, type: 'boss', label, count: <1..6> }` - Swarm Lord / Core kills.
- `{ id, type: 'bases', label, count: <1..6> }` - bases destroyed.
- `{ id, type: 'kills', label, count: <20..900> }` - total kills.
`id` unique per level, kebab-case. `label` UPPERCASE <= 30 chars, shown in the
HUD objective rotation and on the mission-select card.
A level with a finalBoss MUST include a `boss` objective covering it.

## stars (exactly 3)

Row 1 must be `{ type: 'win', label: 'MISSION COMPLETE' }`.
Rows 2 and 3, pick from:
- `{ type: 'hull', pct: <10..90>, label }` - finish at or above pct% hull.
- `{ type: 'time', under: <sec>, label }` - win strictly before this clock time.
- `{ type: 'kills', atLeast: <n>, label }`
- `{ type: 'noWingLost', label }` - no wingman lost after the first join.
- `{ type: 'level', atLeast: <n>, label }` - reach in-run level n.
Labels UPPERCASE <= 34 chars. Make row 2 achievable on a solid first clear and
row 3 a real challenge.

## events (0..24 rows, `at` ascending, all optional actions)

`{ at: <sec>, banner?: ['TITLE', 'SUBTITLE'], spawnPack?: { key, count: 1..12, elite?: true },
   spawnBase?: { type, x, y }, grantBonus?: <BONUS key>, gems?: { count: 1..12, value: 1..3 },
   heat?: true|false, callout?: 'text' }`
- `banner` strings UPPERCASE, title <= 24 chars, subtitle <= 40 chars.
- `spawnPack.key` is any valid wave-pool enemy key; `elite: true` promotes the
  pack to elites.
- `grantBonus` drops that bonus pickup near the player (any key in
  hm_data.js BONUS).
- `heat` switches the music stem.
- `callout` is a short lowercase-ok tutorial-style line, <= 60 chars.
Use events to author the mission's texture: reinforcement warnings, ambushes,
supply drops, story beats. 6+ events expected on levels 2..15.

## Difficulty and identity guardrails

- The campaign difficulty curve across levels 1..15 must rise steadily; your
  brief states your level's target intensity relative to the classic run.
- Use your assigned region's variant enemies as the backbone of the pool from
  level 2 on; classic families fill the low end. Exception: Meridian Verge has
  no variant table - Verge missions keep the classic roster (and finale
  missions may mix variants from every region).
- The player may arrive with hangar upgrades; do not assume them. Level 1..3
  must be clearable with a stock ship by a competent player.
- Copy voice: terse military-console caps, same voice as the shipped game
  ("SIGNAL LOST", "THE CORE DESCENDS AT 10:00"). NO em dashes anywhere.

## Mission select UI (hm_campaign_ui.js lane only)

Defines `window.__HM_CAMPAIGN_UI` = a Phaser scene config object
`{ key: 'missions', create: function () {...}, ... }` (plain object like the
game's other scenes; the framework wraps and registers it). The framework
provides, before any scene starts:

```
window.__HM_CAMPAIGN = {
  levels():   // -> [{ id, name, tagline, briefing, region, duration,
              //       unlocked: bool, stars: 0..3, bestTime: sec|0, starRules: [labels] }]
  start(id),  // launches PlayScene on that level (no-op if locked)
  totalStars() // -> integer
}
```

The UI lane may read `window.__HM_DATA` (fonts, TYPE scale, REGIONS palettes,
SAFE insets) and must follow the shipped art direction: authored type system,
region-palette accents per card, locked levels dimmed with a padlock read,
star pips, a BACK control to the 'title' scene, portrait-safe layout inside
SAFE insets, drag/wheel scroll if the list overflows. Pure Phaser objects
only: no DOM, no new assets, texture keys limited to 'atlas' frames already in
assets/atlas.json plus 'disc' and 'edge'. All taps route through
`this.add.*.setInteractive()` handlers; play the 'select' cue via
`window.__HM_CAMPAIGN.sfx('select')` (also provided). ES5, `node --check`,
<= 24 KB.

## Hard lane rules (all lanes)

- Create/edit ONLY your assigned file. Never touch game.js, hm_data.js,
  index.html, sw.js, another level, or anything in /play/_shared/.
- No new asset files, no network fetches, no localStorage access.
- Your file must be inert if the framework is absent (pure registration).


## Rev 2 notes (M4a, 2026-09-17)

The HM2 campaign is 15 missions, not 13. `CAMPAIGN_MAX_LEVELS` in game.js was
raised from 13 to 15 (the only game.js change in this milestone); `levels/`
holds level1.js through level15.js and index.html loads all fifteen.

Content rules added in Rev 2, on top of everything above:

- **Row-0 pools are melee only.** The hot start seeds roughly 80 enemies on the
  board at t=0 in every level. Any ranged or sapper key in an `at: 0` pool
  (lancer, sapper, weaver, refracting-shard-drone, and every apex key) is
  unavoidable damage before the player can move. This was the original HM1 gate
  lesson. Rev 2 adds a corollary found by the M4a probe: a row-0 pool that is
  majority high-speed kamikaze (cinder-kamikaze at speed 126) at `pack >= 3` is
  the same failure in a different costume. Mission 5 had a 10 second survival
  median until its row-0 pool was softened to pack 2 with a slower mix.
  This also applies to the M3 bestiary keys: `rift-strafer` is `ranged: true`
  and must never appear in an `at: 0` pool. `mine-bomber` and `gem-mimic` are
  marked `sapper: true` in hm_data.js (mine-bomber lays hazards at range,
  gem-mimic is a speed-0 ambush with 22 contact damage) so they carry the same
  hot-start exclusion even though neither is itself `ranged`. Keep all three
  out of every `at: 0` row.
- **Early mods interact with the hot start.** Aggressive `spawnRate` / `enemyHp`
  / `enemyDmg` apply to the seeded board too, so a finale-grade mods block is
  felt at 0:00 rather than at the finale. Mission 15 went from a 20 second
  median to a healthy one purely by easing mods, with its wave table unchanged.
- **Banners are at most 3 words per line.** Dan asked for less on-screen text.
  The spec caps banner length in characters; Rev 2 caps it in words as well.
- **Callouts are for the on-ramp only.** Missions 1 to 3 may use at most two
  each; missions 4 and up use none.
- **Apex tier is late game.** No apex key before mission 9, and from mission 9
  on only in wave rows at or after 40% of the mission duration, or in events.
- **Region order runs outward, not Verge first.** Graveyard, Ember Drift,
  Crystal Shoals, Void Rift, then back to the Verge for missions 14 and 15.
  This is deliberately the inverse of the HM1 ordering.
- **Star pairs are distinct.** Rows 2 and 3 of `stars` must not repeat the same
  (type, value) pair as a neighbouring mission.

Gate for this milestone: `hm2_campaign_probe.mjs` in
/Users/lucille/ue-port-studio/aaa/harness/. It asserts all 15 levels validate
with none dropped, boots each one and fast-forwards through its arc, then runs
the sector-steering bot on missions 1, 5, 10 and 15 and reports survival
medians.
