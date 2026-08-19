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

## Lane E fix pass: RF-PHASE-01, RF-STATUS-01 ability side, RF-CHRONO-01 cleanup

`RF.Abilities.update` now owns the fixed-step tick for player-side ability
timers. `phaseT` is clamped to zero and clears `st.phase` on expiry;
`powerT` and the ability-owned regeneration marker are also expired here.
Active-end cleanup defensively clears `phase`, `phaseT`, `powerId`, `powerT`,
and `powerActive`. The inert victim-side `freezeField` boolean was removed;
the world-owned `frozenT` remains the authoritative freeze status.

Resolved player passives are copied into `ctx.player.st` on passives
resolution, including `fireImmune`, `toxinEater`, `toxinImmune`,
`pressureImmune`, and the resolved `freezeField` flag, so world status code can
read the player contract directly. `invulnT` remains game-owned and is not
double-ticked by abilities.

Added `RF.Abilities.reset(ctx)`: it restores `ctx.run.timeScale` to `1` and
clears all ability-owned player state, including an interrupted Chrono or
Phase. `update` also resets defensively if called after the player becomes
inactive. The orchestrator should call the optional reset immediately from the
death path after marking the player inactive, and again before end-run scene
transition if needed; no `game.js` edit is included in the Lane E deliverable.

Extended `__selftest` with passive-immunity projection, Phase fire/expiry
assertions (`st.phase === false`, `phaseT === 0`), and Chrono forced-reset
assertions (`timeScale === 1`).

Verification:

```text
$ node --check play/razorfin/abilities.js
node --check: pass
$ node -e "const fs=require('fs'),vm=require('vm'); global.window={RF:{}}; window.console=console; vm.runInThisContext(fs.readFileSync('play/razorfin/data.js','utf8')); vm.runInThisContext(fs.readFileSync('play/razorfin/abilities.js','utf8')); const r=window.RF.Abilities.__selftest(); console.log(JSON.stringify(r)); if(!r.pass) process.exit(1);"
{"pass":true,"notes":[]}
```
