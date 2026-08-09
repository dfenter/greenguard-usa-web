# Horde Meridian — Campaign Level Contract (Rev 1)

This is the binding contract between the campaign framework (in `game.js`) and
the nine level definition files (`levels/level1.js` … `levels/level9.js`) plus
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
    id: N,                    // integer 1..9, must equal the registry key
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
- `{ id, type: 'survive', label }` — completes when the clock reaches `duration`,
  OR earlier the moment every other objective (including any finalBoss kill) is
  complete: the duration is a ceiling, not a sentence. A level whose ONLY
  objective is survive always runs the full duration.
- `{ id, type: 'boss', label, count: <1..6> }` — Swarm Lord / Core kills.
- `{ id, type: 'bases', label, count: <1..6> }` — bases destroyed.
- `{ id, type: 'kills', label, count: <20..900> }` — total kills.
`id` unique per level, kebab-case. `label` UPPERCASE <= 30 chars, shown in the
HUD objective rotation and on the mission-select card.
A level with a finalBoss MUST include a `boss` objective covering it.

## stars (exactly 3)

Row 1 must be `{ type: 'win', label: 'MISSION COMPLETE' }`.
Rows 2 and 3, pick from:
- `{ type: 'hull', pct: <10..90>, label }` — finish at or above pct% hull.
- `{ type: 'time', under: <sec>, label }` — win strictly before this clock time.
- `{ type: 'kills', atLeast: <n>, label }`
- `{ type: 'noWingLost', label }` — no wingman lost after the first join.
- `{ type: 'level', atLeast: <n>, label }` — reach in-run level n.
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
supply drops, story beats. 6+ events expected on levels 2..9.

## Difficulty and identity guardrails

- The campaign difficulty curve across levels 1..9 must rise steadily; your
  brief states your level's target intensity relative to the classic run.
- Use your assigned region's variant enemies as the backbone of the pool from
  level 2 on; classic families fill the low end. Exception: Meridian Verge has
  no variant table — Verge missions keep the classic roster (and finale
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
