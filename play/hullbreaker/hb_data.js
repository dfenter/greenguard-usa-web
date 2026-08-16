/* hb_data.js — Hullbreaker content tables.
 *
 * Pure data plus tiny pure helpers. No engine references, no side effects
 * beyond publishing window.HB_DATA, so the tables can be read by the boot
 * fallback before Phaser exists and by the live scene afterwards.
 *
 * Every keyed lookup in game.js goes through the guarded getters at the
 * bottom of this file. A missing family/weapon/upgrade key returns a real
 * record, never undefined (a FAMILY[variant] miss hard-froze a shipped
 * title in this fleet).
 */
(function (root) {
  'use strict';

  // ------------------------------------------------------------ families
  // Rock family identity: art keys, split behaviour, and the drift feel of
  // the field the family belongs to.
  var FAMILIES = {
    belt: {
      id: 'belt', label: 'ORE BELT',
      tint: 0xd8c39a, dust: 0xb59c74, shard: 0xe6d4ad,
      splitLarge: 2, splitMed: 2, hpMul: 1.0, speedMul: 1.0, oreMul: 1.0,
      variantsL: 2, variantsM: 2, variantsS: 1
    },
    ice: {
      id: 'ice', label: 'ICE CLUSTER',
      tint: 0xbfe8ff, dust: 0x8fc6e8, shard: 0xe8fbff,
      // Ice is brittle: it fragments wider and the shards run hot.
      splitLarge: 3, splitMed: 3, hpMul: 0.78, speedMul: 1.22, oreMul: 0.9,
      variantsL: 2, variantsM: 2, variantsS: 1
    },
    wreck: {
      id: 'wreck', label: 'WRECK FIELD',
      tint: 0xc2ded0, dust: 0x8fae9f, shard: 0xdcf0e4,
      // Slag-cored rock: tough, slow, and it pays.
      splitLarge: 2, splitMed: 2, hpMul: 1.35, speedMul: 0.85, oreMul: 1.3,
      variantsL: 2, variantsM: 2, variantsS: 1
    },
    crystal: {
      id: 'crystal', label: 'CRYSTAL CAVEFIELD',
      tint: 0xe0c2ff, dust: 0xa87ee0, shard: 0xf4e2ff,
      splitLarge: 2, splitMed: 3, hpMul: 0.92, speedMul: 1.05, oreMul: 1.65,
      variantsL: 2, variantsM: 2, variantsS: 1
    },
    maw: {
      id: 'maw', label: 'MOLTEN MAW',
      tint: 0xffb086, dust: 0xd07850, shard: 0xffcfa8,
      splitLarge: 3, splitMed: 2, hpMul: 1.15, speedMul: 1.15, oreMul: 1.2,
      variantsL: 2, variantsM: 2, variantsS: 1
    }
  };

  // Rock size classes. Collision danger is deliberately distinct per class:
  // a large rock costs two shield cells and throws you, a shard costs one
  // and is fast enough to be the hit you did not see.
  var ROCK_SIZES = {
    large: { key: 'large', r: 44, tex: 'l', hp: 5, dmg: 2, ore: 4, score: 40,
             knock: 340, shake: 9, spin: 0.55, next: 'med', chip: 22 },
    med:   { key: 'med',   r: 27, tex: 'm', hp: 3, dmg: 1, ore: 2, score: 65,
             knock: 210, shake: 6, spin: 1.0, next: 'small', chip: 14 },
    small: { key: 'small', r: 15, tex: 's', hp: 1, dmg: 1, ore: 1, score: 95,
             knock: 120, shake: 3.5, spin: 1.9, next: null, chip: 8 }
  };

  // ------------------------------------------------------------- weapons
  // Heat is the shared readout: every weapon spends it, venting is the cost
  // of greed. `heatRate` is per second for beams, `heat` is per shot.
  var WEAPONS = {
    pulse: {
      id: 'pulse', name: 'PULSE COIL', short: 'PULSE', kind: 'shot',
      tex: 'shot_pulse', tint: 0x7fe4ff, rate: 6.4, dmg: 1, speed: 620,
      life: 0.92, heat: 5.2, count: 1, spreadDeg: 0, r: 5, sfx: 'pulse',
      blurb: 'Balanced repeater'
    },
    spread: {
      id: 'spread', name: 'SCATTER RACK', short: 'SPREAD', kind: 'shot',
      tex: 'shot_spread', tint: 0xffbe6a, rate: 3.4, dmg: 1, speed: 540,
      life: 0.62, heat: 12.5, count: 5, spreadDeg: 30, r: 5, sfx: 'spread',
      blurb: 'Five pellets, close range'
    },
    laser: {
      id: 'laser', name: 'LANCE BEAM', short: 'LASER', kind: 'beam',
      tex: 'shot_laser', tint: 0xc890ff, dps: 15, range: 460, heatRate: 27,
      r: 12, sfx: 'laser', blurb: 'Continuous, pierces rock'
    },
    homing: {
      id: 'homing', name: 'SEEKER PODS', short: 'HOMING', kind: 'shot',
      tex: 'shot_homing', tint: 0x74f5b6, rate: 2.3, dmg: 3, speed: 400,
      life: 2.1, heat: 15, count: 2, spreadDeg: 26, r: 7, sfx: 'homing',
      homing: 300, blurb: 'Slow, seeks the nearest rock'
    }
  };
  var WEAPON_ORDER = ['pulse', 'spread', 'laser', 'homing'];

  // ------------------------------------------------------------- pickups
  var PICKUPS = {
    ore:    { id: 'ore',    tex: 'ic_ore',    tint: 0x5fe6b0, label: 'ORE',        sfx: 'ore' },
    burst:  { id: 'burst',  tex: 'ic_ore',    tint: 0xffe27a, label: 'ORE CACHE',  sfx: 'pickup' },
    shield: { id: 'shield', tex: 'ic_shield', tint: 0x7fd8ff, label: 'SHIELD CELL', sfx: 'pickup' },
    over:   { id: 'over',   tex: 'ic_over',   tint: 0xffc46a, label: 'OVERCHARGE', sfx: 'pickup' },
    dash:   { id: 'dash',   tex: 'ic_dash',   tint: 0xd2a0ff, label: 'DASH CHARGE', sfx: 'pickup' },
    weapon: { id: 'weapon', tex: 'ic_over',   tint: 0xff9ecb, label: 'WEAPON',     sfx: 'upgrade' }
  };

  // Generous by design: the owner wants the field raining pickups. These
  // are per-rock-death chances, before the sector multiplier.
  var DROP_TABLE = {
    large: [['burst', 0.34], ['shield', 0.14], ['over', 0.13], ['dash', 0.13], ['weapon', 0.07]],
    med:   [['burst', 0.24], ['shield', 0.09], ['over', 0.10], ['dash', 0.10], ['weapon', 0.04]],
    small: [['burst', 0.16], ['shield', 0.05], ['over', 0.06], ['dash', 0.06], ['weapon', 0.02]]
  };

  // ------------------------------------------------------------ upgrades
  // `apply` mutates the run stat block. Every one is additive or
  // multiplicative on a field that always exists, so a stale saved id can
  // never produce NaN.
  var UPGRADES = [
    { id: 'rapid',    name: 'RAPID COIL',    detail: 'Fire rate +20%',            tint: 0x7fe4ff,
      apply: function (s) { s.rateMul *= 1.20; } },
    { id: 'heatsink', name: 'HEAT SINK',     detail: 'Heat cap +30, vents faster', tint: 0x9be8ff,
      apply: function (s) { s.heatCap += 30; s.coolMul *= 1.3; } },
    { id: 'engine',   name: 'ION ENGINE',    detail: 'Thrust +22%',               tint: 0xffcf7a,
      apply: function (s) { s.thrustMul *= 1.22; } },
    { id: 'vector',   name: 'VECTOR JETS',   detail: 'Turn rate +26%, better brake', tint: 0xffe0a0,
      apply: function (s) { s.turnMul *= 1.26; s.brakeMul *= 1.35; } },
    { id: 'core',     name: 'COIL CORE',     detail: 'Weapon damage +1',          tint: 0xff9ecb,
      apply: function (s) { s.dmgAdd += 1; } },
    { id: 'plating',  name: 'HULL PLATING',  detail: 'Max shield +1, refill 1',   tint: 0x7fd8ff,
      apply: function (s) { s.shieldMax += 1; s.shield = Math.min(s.shieldMax, s.shield + 1); } },
    { id: 'auxcell',  name: 'AUX CELL',      detail: 'Restore 2 shield cells',    tint: 0x9ef0ff,
      apply: function (s) { s.shield = Math.min(s.shieldMax, s.shield + 2); } },
    { id: 'phase',    name: 'PHASE DRIVE',   detail: 'Dash charge +1',            tint: 0xd2a0ff,
      apply: function (s) { s.dashMax += 1; s.dashCharge = s.dashMax; } },
    { id: 'longdash', name: 'LONG BURN',     detail: 'Dash i-frames +45%, faster', tint: 0xe0b6ff,
      apply: function (s) { s.iframeMul *= 1.45; s.dashPowerMul *= 1.16; } },
    { id: 'magnet',   name: 'ORE MAGNET',    detail: 'Pickup magnet +80%',        tint: 0x5fe6b0,
      apply: function (s) { s.magnetMul *= 1.8; } },
    { id: 'refinery', name: 'REFINERY',      detail: 'Ore value +55%',            tint: 0x8ff0c8,
      apply: function (s) { s.oreMul *= 1.55; } },
    { id: 'fracture', name: 'FRACTURE CHARGE', detail: 'Rock deaths throw shrapnel', tint: 0xffb086,
      apply: function (s) { s.shrapnel += 1; } },
    { id: 'kinetic',  name: 'KINETIC HULL',  detail: 'Dashing shatters rocks safely', tint: 0xffd9a0,
      apply: function (s) { s.kinetic = true; } },
    { id: 'salvage',  name: 'SALVAGE RIG',   detail: 'Drops last longer, +1 ore each', tint: 0xbde8a0,
      apply: function (s) { s.dropLifeMul *= 1.7; s.oreAdd += 1; } },
    { id: 'coolant',  name: 'COOLANT FLUSH', detail: 'Overcharge lasts +70%',     tint: 0xffc46a,
      apply: function (s) { s.overMul *= 1.7; } }
  ];

  // ------------------------------------------------------------- sectors
  // Eight waves per sector. Wave 4 is the authored set piece, wave 8 is the
  // hive. Density and rock speed escalate on the curves below.
  var SECTORS = [
    {
      id: 'kessler', name: 'KESSLER BELT', family: 'belt', seed: 0x51F17,
      sub: 'Dense ore belt, rock on rock',
      bg: 0x0a1622, neb: 0x2f6fa8, star: 0xbfe4ff,
      density: 5, densityStep: 1.15, speed: 44, speedStep: 6.5,
      hazards: { mine: { from: 3, count: 1, step: 0.5 }, hulk: { from: 5, count: 1, step: 0.34 },
        pirate: { from: 6, count: 1, step: 0.24 } },
      setpiece: { id: 'cascade', name: 'KESSLER CASCADE',
        brief: 'A collision cascade is crossing the belt. Break the wall.' },
      boss: { name: 'BROODROCK ALPHA', hp: 340, arms: 3, pods: 3, ramSpeed: 250 },
      medal: { gold: { time: 200, ore: 130 }, silver: { time: 275, ore: 85 } },
      weaponUnlock: 'spread'
    },
    {
      id: 'halcyon', name: 'HALCYON ICE', family: 'ice', seed: 0x6A21D,
      sub: 'Brittle ice, wide fragments, slick drift',
      bg: 0x081a26, neb: 0x2aa1b4, star: 0xd8f6ff,
      density: 5, densityStep: 1.3, speed: 52, speedStep: 7.5,
      // Vacuum frost: the hull slides further before it answers the stick.
      drag: 0.55, hazards: { well: { from: 2, count: 1, step: 0.3 },
        icefield: { from: 2, count: 1, step: 0.22 }, mine: { from: 4, count: 1, step: 0.4 },
        storm: { from: 6, count: 1, step: 0.2 } },
      setpiece: { id: 'comets', name: 'COMET RUN',
        brief: 'Three comets on a crossing line. Shatter them before they pass.' },
      boss: { name: 'GLACIER HIVE', hp: 430, arms: 3, pods: 4, ramSpeed: 275 },
      medal: { gold: { time: 215, ore: 150 }, silver: { time: 290, ore: 100 } },
      weaponUnlock: 'laser'
    },
    {
      id: 'ossuary', name: 'OSSUARY DRIFT', family: 'wreck', seed: 0x7C3B9,
      sub: 'Derelict hulls, mine nests, salvage drones',
      bg: 0x0c1a18, neb: 0x2f8a6e, star: 0xc8f0dc,
      density: 4, densityStep: 1.1, speed: 40, speedStep: 5.5,
      hazards: { mine: { from: 1, count: 2, step: 0.6 }, hulk: { from: 2, count: 1, step: 0.5 },
                 drone: { from: 3, count: 1, step: 0.42 }, pirate: { from: 5, count: 1, step: 0.35 } },
      setpiece: { id: 'convoy', name: 'HULK CONVOY',
        brief: 'A dead convoy is drifting through. Mines ride the hulls.' },
      boss: { name: 'OSSUARY QUEEN', hp: 520, arms: 4, pods: 4, ramSpeed: 240 },
      medal: { gold: { time: 230, ore: 175 }, silver: { time: 310, ore: 120 } },
      weaponUnlock: 'homing'
    },
    {
      id: 'prism', name: 'PRISM HOLLOW', family: 'crystal', seed: 0x8D4E5,
      sub: 'Crystal cavefield, rich ore, singularity nodes',
      bg: 0x140b26, neb: 0x7a45c8, star: 0xefd8ff,
      density: 6, densityStep: 1.35, speed: 48, speedStep: 7,
      hazards: { well: { from: 1, count: 2, step: 0.4 }, storm: { from: 2, count: 1, step: 0.28 },
        mine: { from: 5, count: 1, step: 0.4 }, pirate: { from: 6, count: 1, step: 0.25 } },
      setpiece: { id: 'bloom', name: 'PRISM BLOOM',
        brief: 'The geode is blooming. Cut the four nodes before it seals.' },
      boss: { name: 'PRISM MATRIARCH', hp: 600, arms: 4, pods: 5, ramSpeed: 290 },
      medal: { gold: { time: 240, ore: 260 }, silver: { time: 320, ore: 180 } },
      weaponUnlock: null
    },
    {
      id: 'maw', name: "BREAKER'S MAW", family: 'maw', seed: 0x9E5F1,
      sub: 'Every hazard at once, molten core rock',
      bg: 0x1a0c10, neb: 0xb8482c, star: 0xffd8bf,
      density: 6, densityStep: 1.5, speed: 56, speedStep: 8,
      hazards: { mine: { from: 1, count: 1, step: 0.5 }, well: { from: 2, count: 1, step: 0.4 },
                 icefield: { from: 2, count: 1, step: 0.28 }, storm: { from: 3, count: 1, step: 0.25 },
                 hulk: { from: 3, count: 1, step: 0.4 }, drone: { from: 4, count: 1, step: 0.5 },
                 pirate: { from: 5, count: 1, step: 0.35 } },
      setpiece: { id: 'grinder', name: 'THE GRINDER',
        brief: 'Twin singularities are feeding the maw. Survive the funnel.' },
      boss: { name: 'THE BREAKER', hp: 760, arms: 4, pods: 6, ramSpeed: 330 },
      medal: { gold: { time: 260, ore: 300 }, silver: { time: 350, ore: 210 } },
      weaponUnlock: null
    }
  ];

  var SETPIECE_WAVE = 4;
  var BOSS_WAVE = 8;
  var WAVES_PER_SECTOR = 8;

  // Persistent refits are purchased with salvage earned from completed
  // runs. They change the starting build, while wave upgrades remain the
  // free tactical draft players already know.
  var REFIT_ORDER = ['hull', 'coil', 'drive', 'magnet'];
  var REFITS = {
    hull: { id: 'hull', name: 'HULL', short: 'H', tint: 0x7fd8ff, max: 3, baseCost: 45,
      detail: '+1 shield cell', apply: function (s, level) { s.shieldMax += level; s.shield += level; } },
    coil: { id: 'coil', name: 'COIL', short: 'C', tint: 0xffc46a, max: 3, baseCost: 55,
      detail: '+8% fire rate', apply: function (s, level) { s.rateMul *= 1 + level * 0.08; } },
    drive: { id: 'drive', name: 'DRIVE', short: 'D', tint: 0xffd6a0, max: 3, baseCost: 50,
      detail: '+7% thrust and turn', apply: function (s, level) {
        s.thrustMul *= 1 + level * 0.07; s.turnMul *= 1 + level * 0.07;
      } },
    magnet: { id: 'magnet', name: 'MAGNET', short: 'M', tint: 0x7ef0b4, max: 3, baseCost: 40,
      detail: '+18% salvage pull', apply: function (s, level) { s.magnetMul *= 1 + level * 0.18; } }
  };

  function refit(id) { return REFITS[id] || REFITS.hull; }
  function refitCost(id, level) {
    var r = refit(id);
    return Math.round(r.baseCost * (1 + level * 0.72));
  }

  // UTC date keeps the daily field identical for every player and avoids a
  // local-time rollover producing two seeds on the same calendar day.
  function dailySeed(date) {
    var d = date instanceof Date ? date : new Date();
    var key = d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate();
    var h = 2166136261;
    for (var i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // Endless ladder stages reuse the authored families, but not the authored
  // wave pacing: each daily stage adds mass, speed and hazard pressure. Boss
  // and set-piece beats recur on the same readable eight-beat cadence.
  function ladderSpec(sector, stage, seed) {
    var n = Math.max(1, stage | 0);
    var base = waveSpec(sector, ((n - 1) % WAVES_PER_SECTOR) + 1);
    var tier = Math.floor((n - 1) / WAVES_PER_SECTOR);
    var pressure = 1 + tier * 0.28 + ((n - 1) % WAVES_PER_SECTOR) * 0.035;
    var spec = {
      wave: n, index: base.wave, kind: base.kind, rocks: Math.max(3, Math.round(base.rocks * pressure)),
      speed: base.speed * (1 + tier * 0.12), hazards: {}, name: 'LADDER ' + n,
      sub: 'DAILY FIELD  ' + ((seed >>> 0).toString(16).toUpperCase()), ladder: true
    };
    for (var k in base.hazards) spec.hazards[k] = Math.max(0, Math.ceil(base.hazards[k] * pressure));
    if (base.kind === 'boss') { spec.name = 'LADDER HULK  ' + n; spec.sub = 'WEAK POINTS EXPOSED'; }
    else if (base.kind === 'setpiece') { spec.name = base.name + '  // LADDER'; spec.setpiece = base.setpiece; }
    return spec;
  }

  // Wave descriptor built from the sector curve. Pure: same input, same
  // output, so the orchestrator can force a wave and get the shipped one.
  function waveSpec(sector, wave) {
    var s = sector;
    var w = Math.max(1, Math.min(WAVES_PER_SECTOR, wave | 0));
    var spec = {
      wave: w,
      kind: w === BOSS_WAVE ? 'boss' : (w === SETPIECE_WAVE ? 'setpiece' : 'field'),
      rocks: Math.round(s.density + s.densityStep * (w - 1)),
      speed: s.speed + s.speedStep * (w - 1),
      hazards: {},
      name: '',
      sub: ''
    };
    for (var k in s.hazards) {
      var h = s.hazards[k];
      if (w >= h.from) {
        spec.hazards[k] = Math.max(0, Math.round(h.count + h.step * (w - h.from)));
      }
    }
    if (spec.kind === 'boss') {
      spec.rocks = Math.max(3, Math.round(spec.rocks * 0.45));
      spec.name = s.boss.name;
      spec.sub = 'HIVE ENGAGEMENT';
    } else if (spec.kind === 'setpiece') {
      spec.name = s.setpiece.name;
      spec.sub = s.setpiece.brief;
      spec.setpiece = s.setpiece.id;
      spec.rocks = Math.max(2, Math.round(spec.rocks * 0.6));
    } else {
      spec.name = 'WAVE ' + w;
      spec.sub = s.sub;
    }
    return spec;
  }

  function medalFor(sector, timeSec, ore) {
    var m = sector.medal;
    if (timeSec <= m.gold.time && ore >= m.gold.ore) return 'gold';
    if (timeSec <= m.silver.time && ore >= m.silver.ore) return 'silver';
    return 'bronze';
  }

  var MEDAL_RANK = { none: 0, bronze: 1, silver: 2, gold: 3 };
  var MEDAL_TINT = { gold: 0xffd76a, silver: 0xd8e6ef, bronze: 0xd39a62, none: 0x50626f };

  // -------------------------------------------------------- guarded gets
  function family(id) { return FAMILIES[id] || FAMILIES.belt; }
  function rockSize(id) { return ROCK_SIZES[id] || ROCK_SIZES.small; }
  function weapon(id) { return WEAPONS[id] || WEAPONS.pulse; }
  function pickup(id) { return PICKUPS[id] || PICKUPS.ore; }
  function sectorAt(i) {
    var n = SECTORS.length;
    var k = (i | 0);
    if (!(k >= 0)) k = 0;
    if (k >= n) k = n - 1;
    return SECTORS[k];
  }
  function sectorById(id) {
    for (var i = 0; i < SECTORS.length; i++) if (SECTORS[i].id === id) return SECTORS[i];
    return SECTORS[0];
  }
  function upgradeById(id) {
    for (var i = 0; i < UPGRADES.length; i++) if (UPGRADES[i].id === id) return UPGRADES[i];
    return UPGRADES[0];
  }
  function dropsFor(sizeKey) { return DROP_TABLE[sizeKey] || DROP_TABLE.small; }

  root.HB_DATA = {
    FAMILIES: FAMILIES, ROCK_SIZES: ROCK_SIZES, WEAPONS: WEAPONS,
    WEAPON_ORDER: WEAPON_ORDER, PICKUPS: PICKUPS, DROP_TABLE: DROP_TABLE,
    UPGRADES: UPGRADES, REFIT_ORDER: REFIT_ORDER, REFITS: REFITS, SECTORS: SECTORS,
    SETPIECE_WAVE: SETPIECE_WAVE, BOSS_WAVE: BOSS_WAVE,
    WAVES_PER_SECTOR: WAVES_PER_SECTOR,
    MEDAL_RANK: MEDAL_RANK, MEDAL_TINT: MEDAL_TINT,
    waveSpec: waveSpec, ladderSpec: ladderSpec, dailySeed: dailySeed, medalFor: medalFor,
    family: family, rockSize: rockSize, weapon: weapon, pickup: pickup,
    sectorAt: sectorAt, sectorById: sectorById, upgradeById: upgradeById,
    refit: refit, refitCost: refitCost,
    dropsFor: dropsFor
  };
})(typeof window !== 'undefined' ? window : globalThis);
