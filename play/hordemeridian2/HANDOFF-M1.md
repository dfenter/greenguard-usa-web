# Horde Meridian 2, milestone M1 handoff

Plan: `~/.claude/plans/horde-meridian-2.md`. Scope of this lane: the weapon
system (12 archetypes plus 12 evolutions), the data-driven firing dispatch, the
codex, and the drop rework. No deploy, no push.

## Done

### 1. `hm2_weapons.js` (new)
ES5 IIFE exposing `window.HM2_WEAPONS` with `WEAPONS`, `EVOLUTIONS_BY_BASE`,
`WEAPON_MODS`, `lvl` and `effectiveSpec(data, levelIndex)`. Loaded from
`index.html` before `hm_data.js`, which now builds `WEAPONS` / `WEAPON_BY_KEY`
from it (the old 50-key table is gone).

The 50 HM1 keys were roughly 10 archetypes reskinned across three tiers. They are
replaced by 12 bases, each a distinct `kind` plus `mode` pair, each with five
in-run levels as `levels[5]` stat rows.

### 2. The 12 bases and their evolutions

| base | mechanic | evolution | evolved twist | module |
|---|---|---|---|---|
| lance | pierce bolt | Phoenix Lance | retargets the highest-HP enemy and ignites | reactor |
| scatter | fan | Gravity Flak | fragments curve toward enemies in flight | magnet |
| rail | charge and release | Event Horizon | the line leaves a collapsing rift that pulls | hull |
| seeker | homing darts | Hornet Cathedral | every kill respawns a dart | wingBay |
| mortar | lobbed AoE | Meteor Choir | splits into cluster submunitions at apex | fortune |
| beam | rotating sweep | Solar Lance | locks to aim, burns a lasting lane | reactor |
| glaive | return arc | Cyclone Halo | never returns, orbits outward | thrusters |
| mine | dropped field | Oblivion Web | mines tether, the tether lines damage | gunDeck |
| ricochet | wall bounce | Prism Cascade | splits into two shards on every bounce | fortune |
| arccoil | chain lightning | Tesla Crown | a permanent chaining aura, no projectile | hull |
| flak (NEW) | proximity burst | Nova Curtain | the burst leaves a lingering flak wall | thrusters |
| dronebay (NEW) | autonomous drones | Swarm Carrier | drones self-replicate to a hard cap | wingBay |

Recipes cover all seven HANGAR_TRACKS modules (reactor 2, hull 2, wingBay 2,
fortune 2, thrusters 2, magnet 1, gunDeck 1). Every evolution differs from its
base in `mode`, not only in numbers.

### 3. Dispatch
The hardcoded `data.key` if/else chain in `stepPrimaryWeapon` and the parallel
per-key switch in `fireMirrorWeapon` are both deleted. Both now route through
`fireSpecWeapon`, reading live stats via `effectiveSpec(data, level - 1)`.
`fireSpecWeapon` gained the modes the new arsenal declares: `charge` /
`charge-rift`, `aura`, `drone` / `drone-replicate`, `proximity` /
`proximity-wall`, `tether-mine`, `lockbeam`, plus the evolved behaviors in
`stepShots` (curve steering, perma-orbit growth, cluster split, homing respawn,
bounce split). A shared `hazards` array carries rift pull, wall DoT and tether
lines. Every new spawn path respects `PROJECTILE_SOFT_CAP`.

### 4. Evolution trigger
`retryEvolutions()` sweeps the whole arsenal on EVERY level-up and evolves any
weapon at level 5 whose recipe module is owned at rank 1. This is deliberately
not a one-shot check at the level-5 transition: a level-5 weapon drops out of the
draft pool entirely, so a player who reaches 5 before buying the module would
otherwise be stranded for the rest of the run. Verified by probe: lance held at
level 5 with no reactor stays `lance`, and becomes `phoenix-lance` the moment
reactor is acquired. The effect is 1.5s, shockwave plus flash plus 0.3s slow-mo,
weapon name only.

### 5. Drops, codex, bosses
- The legendary tier and its 10% post-wave-5 roll are removed.
- "upgraded" drops are now mod pickups from `WEAPON_MODS` (`mod-rate`,
  `mod-size`, `mod-pierce`, `mod-crit`), small and stackable, with a short
  visual effect instead of a text banner.
- The CODEX tab lists all 24 from day one. Unseen entries stay silhouetted
  (`???`, lock icon, alpha 0.55) but their recipe text is visible and dimmed,
  since the recipe is the information that makes the tab actionable.
- `REGION_BOSSES.weaponKeys` repointed to live base keys.

## Gate

Round 1 returned HOLD on two blockers, both fixed and re-verified:
1. Evolution was checked only on the single pick that reached level 5, so a
   weapon that hit 5 before the module was bought could never evolve. Fixed by
   `retryEvolutions()`.
2. The codex gated recipe text behind `cSeen`, hiding it exactly when the player
   needed it. Fixed by showing the recipe for unseen entries, dimmed.

Verified after the fixes: all 12 bases fire and deal damage; all 12 evolutions
fire without throwing; no NaN in shot, drone, hazard, mine or player state; the
mirror path throws for none of the 24 keys; 59.9 to 60.2 fps median at a
sustained 300+ enemies (p95 52.6 to 54.6) on the Mac headless profile; scope
clean (only game.js, hm_data.js, hm2_weapons.js and one index.html script tag).

### Balance
DPS measured in `hm2_arsenal_probe.mjs` (median of 3 runs per weapon, bases at
equal level). All 24 sit inside the 0.5x to 2.0x band: bases 0.63x (dronebay) to
1.25x (seeker), evolutions 0.53x (tesla-crown) to 1.19x (hornet-cathedral). No
stat rows needed tuning.

## Residuals for the next lane

1. **Hot-start survival**: `hm2_hotstart_gate.mjs` medians clear 60s for 9 of 12
   bases. `rail` (20.9s), `beam` (26.1s) and `dronebay` (34.9s) fail. At level 1
   `effectiveSpec` returns every multiplier at 1.0, so `levels[]` alone cannot
   fix these; they need a level-1 floor or a mechanics touch in game.js. The
   passing medians cluster near 80 to 85s because the harness budget expires,
   so they are lower bounds, not deaths.
2. **Dead branches left in place** under the surgical-changes rule, all
   unreachable and harmless: `forkRail` plus its two `s.kind === 'rail-storm'`
   call sites (`game.js:7074, 7313, 7345`), the `u.upgraded` draft branches
   (`game.js:8183, 8285, 8372`), and `RARITY_STYLE.legendary` (`hm_data.js:350`).
3. **Per-level tuning surface**: `droneCount`, `beamLen` / `beamWid`,
   `chainCount` / `chainRadius` / `chainDmg`, `burstRadius` / `burstDmg` and
   `fuseRadius` appear in `levels[]` rows but are never read by
   `effectiveSpec`, so evolutions tune only through count and pierce.
4. **Co-op guest**: host snapshots carry only players, enemies and gems, never
   shots, so flak, drones and auras are as invisible to a guest as the old
   weapons were. Pre-existing, not an M1 regression.
5. **Service worker warning**: the scope message in the console comes from
   shared `play/_shared/ggkit.js:564` and affects every game on the origin. Not
   introduced here and out of this lane's scope.

## Probes
- `/Users/lucille/ue-port-studio/aaa/harness/hm2_arsenal_probe.mjs`
- `/Users/lucille/ue-port-studio/aaa/harness/hm2_hotstart_gate.mjs`
- results: `hm2_dps_results.json`, `hm2_hotstart_results.json`
