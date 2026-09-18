// hm2_weapons.js — Horde Meridian 2 milestone M1 arsenal.
// ES5 IIFE, same conventions as hm_data.js. Loaded BEFORE hm_data.js (see
// index.html) so hm_data.js can consume window.HM2_WEAPONS while building
// its own WEAPONS / WEAPON_BY_KEY exports.
//
// STAT ROW CONVENTION: base weapons carry `levels: [ {...}, x5 ]`, one row
// per in-run level (1..5), read by index (level-1), always clamped to the
// last row if the index is out of bounds. Evolutions do NOT relevel; they
// carry `levels: [ {...} ]` (length 1) so all existing "read levels[i]"
// call sites keep working unmodified — evolutions just always read index 0.
(function () {
  'use strict';

  function lvl(weaponData, levelIndex) {
    var rows = weaponData && weaponData.levels;
    if (!rows || !rows.length) return null;
    var i = levelIndex | 0;
    if (i < 0) i = 0;
    if (i >= rows.length) i = rows.length - 1;
    return rows[i];
  }

  // effectiveSpec: fireSpecWeapon (game.js) reads ONLY `data.spec` as its
  // stat source of truth, never `levels[]` fields directly, so the two never
  // need to share field names. `levels[]` instead supplies a per-level
  // multiplier applied over the level-1 `spec` numbers at fire time: count
  // and pierce step up by whole numbers, dmg/rate/speed/size scale by the
  // ratio of the current level row to the level-1 row. Evolutions have a
  // single-row `levels` (index always clamps to 0) so they always evaluate
  // at their one fixed strength. Guards every divide against a zero level-1
  // baseline.
  function effectiveSpec(weaponData, levelIndex) {
    var base = weaponData && weaponData.spec;
    if (!base) return null;
    var row = lvl(weaponData, levelIndex);
    var row1 = lvl(weaponData, 0);
    if (!row || !row1) return base;
    var out = {}, k;
    for (k in base) { if (base.hasOwnProperty(k)) out[k] = base[k]; }
    var dmgMul = row1.dmg ? row.dmg / row1.dmg : 1;
    var rateMul = row1.rate ? row.rate / row1.rate : 1;
    var speedMul = row1.speed ? row.speed / row1.speed : 1;
    var sizeMul = row1.size ? row.size / row1.size : 1;
    if (typeof out.dmg === 'number') out.dmg = out.dmg * dmgMul;
    if (typeof out.speed === 'number') out.speed = out.speed * speedMul;
    if (typeof out.size === 'number') out.size = out.size * sizeMul;
    if (typeof out.count === 'number' && typeof row.count === 'number') out.count = row.count;
    if (typeof out.pierce === 'number' && typeof row.pierce === 'number') out.pierce = row.pierce;
    out.rateMul = rateMul;
    return out;
  }

  var WEAPONS = [
    // ---------------------------------------------------------------- LANCE
    { key: 'lance', name: 'Lance', kind: 'lance', mode: 'pierce', glyph: 'ic_lance', frame: 'bolt',
      color: 0xe5fff7, impact: 0xd0fff0, muzzle: 0xa7ffe0, cue: 'shoot',
      desc: 'A balanced piercing bolt that punches clean through the line.',
      evolvesTo: 'phoenix-lance',
      levels: [
        { rate: 1.00, dmg: 1.00, count: 1, spread: 0, speed: 560, size: 5, pierce: 2 },
        { rate: 1.04, dmg: 1.10, count: 1, spread: 0, speed: 575, size: 5, pierce: 3 },
        { rate: 1.08, dmg: 1.22, count: 1, spread: 0, speed: 590, size: 6, pierce: 3 },
        { rate: 1.12, dmg: 1.36, count: 2, spread: 0.08, speed: 600, size: 6, pierce: 4 },
        { rate: 1.16, dmg: 1.52, count: 2, spread: 0.08, speed: 615, size: 6, pierce: 5 }
      ],
      spec: { mode: 'pierce', kind: 'lance', count: 1, spread: 0, speed: 560, dmg: 1.0, size: 5, pierce: 2 } },
    { key: 'phoenix-lance', name: 'Phoenix Lance', kind: 'lance', mode: 'retarget-burn', glyph: 'ic_lance', frame: 'bolt',
      color: 0xffc890, impact: 0xffe4c0, muzzle: 0xffb45a, cue: 'shoot', tier: 'evolution',
      desc: 'Hunts the toughest thing alive and leaves it burning.',
      recipeModule: 'reactor', recipeText: 'LVL5 + REACTOR',
      levels: [ { rate: 1.16, dmg: 1.10, count: 2, spread: 0.08, speed: 640, size: 7, pierce: 6,
        burnDot: { dps: 0.35, dur: 2.5 }, retarget: true } ],
      spec: { mode: 'retarget-burn', kind: 'lance', count: 2, spread: 0.08, speed: 640, dmg: 1.1, size: 7,
        pierce: 6, retarget: true, burnDot: { dps: 0.35, dur: 2.5 } } },

    // -------------------------------------------------------------- SCATTER
    { key: 'scatter', name: 'Scatter', kind: 'scatter', mode: 'fan', glyph: 'ic_pulse', frame: 'shard',
      color: 0xffc361, impact: 0xffe0a0, muzzle: 0xffd67a, cue: 'enemyShoot',
      desc: 'A wide fan of light fragments for close crowds.',
      evolvesTo: 'gravity-flak',
      levels: [
        { rate: 1.00, dmg: 0.56, count: 5, spread: 0.72, speed: 450, size: 5, pierce: 0 },
        { rate: 1.04, dmg: 0.60, count: 6, spread: 0.74, speed: 455, size: 5, pierce: 0 },
        { rate: 1.08, dmg: 0.64, count: 7, spread: 0.78, speed: 460, size: 5, pierce: 1 },
        { rate: 1.12, dmg: 0.70, count: 8, spread: 0.82, speed: 465, size: 6, pierce: 1 },
        { rate: 1.16, dmg: 0.78, count: 9, spread: 0.86, speed: 470, size: 6, pierce: 1 }
      ],
      spec: { mode: 'fan', kind: 'scatter', count: 5, spread: 0.72, speed: 450, dmg: 0.56, size: 5, pierce: 0 } },
    { key: 'gravity-flak', name: 'Gravity Flak', kind: 'scatter', mode: 'curve-fan', glyph: 'ic_pulse', frame: 'shard',
      color: 0xc9a8ff, impact: 0xe0d0ff, muzzle: 0xb488ff, cue: 'enemyShoot', tier: 'evolution',
      desc: 'Fragments bend toward the nearest target mid-flight.',
      recipeModule: 'magnet', recipeText: 'LVL5 + MAGNET',
      levels: [ { rate: 1.16, dmg: 0.62, count: 9, spread: 0.86, speed: 470, size: 6, pierce: 1, curve: 3.2 } ],
      spec: { mode: 'curve-fan', kind: 'scatter', count: 9, spread: 0.86, speed: 470, dmg: 0.62, size: 6, pierce: 1, curve: 3.2 } },

    // ----------------------------------------------------------------- RAIL
    { key: 'rail', name: 'Rail', kind: 'rail', mode: 'charge', glyph: 'ic_beam', frame: 'bolt',
      color: 0x8fe7ff, impact: 0xc8f4ff, muzzle: 0x54d6ff, cue: 'pulse',
      desc: 'Charges up, then releases a piercing line.',
      evolvesTo: 'event-horizon',
      levels: [
        { rate: 1.00, dmg: 1.75, count: 1, spread: 0, speed: 760, size: 7, pierce: 3, chargeTime: 0.24 },
        { rate: 1.02, dmg: 1.90, count: 1, spread: 0, speed: 780, size: 7, pierce: 4, chargeTime: 0.40 },
        { rate: 1.04, dmg: 2.10, count: 1, spread: 0, speed: 800, size: 8, pierce: 5, chargeTime: 0.37 },
        { rate: 1.06, dmg: 2.35, count: 1, spread: 0, speed: 820, size: 8, pierce: 6, chargeTime: 0.34 },
        { rate: 1.08, dmg: 2.65, count: 1, spread: 0, speed: 840, size: 9, pierce: 8, chargeTime: 0.30 }
      ],
      spec: { mode: 'charge', kind: 'rail', count: 1, spread: 0, speed: 760, dmg: 1.75, size: 7, pierce: 3, chargeTime: 0.24 } },
    { key: 'event-horizon', name: 'Event Horizon', kind: 'rail', mode: 'charge-rift', glyph: 'ic_beam', frame: 'bolt',
      color: 0x9b8cff, impact: 0xd0c8ff, muzzle: 0x6e8bff, cue: 'pulse', tier: 'evolution',
      desc: 'The charged line leaves a collapsing rift that pulls the horde in.',
      recipeModule: 'hull', recipeText: 'LVL5 + HULL',
      levels: [ { rate: 1.08, dmg: 2.4, count: 1, spread: 0, speed: 840, size: 9, pierce: 9, chargeTime: 0.30,
        riftRadius: 190, riftDur: 1.4, riftPull: 320 } ],
      spec: { mode: 'charge-rift', kind: 'rail', count: 1, spread: 0, speed: 840, dmg: 2.4, size: 9, pierce: 9,
        chargeTime: 0.30, riftRadius: 190, riftDur: 1.4, riftPull: 320 } },

    // -------------------------------------------------------------- SEEKER
    { key: 'seeker', name: 'Seeker', kind: 'seeker', mode: 'homing', glyph: 'ic_wisp', frame: 'wisp',
      color: 0xc480ff, impact: 0xecdcff, muzzle: 0xc480ff, cue: 'telegraph',
      desc: 'Weak homing darts that keep finding the horde.',
      evolvesTo: 'hornet-cathedral',
      levels: [
        { rate: 1.00, dmg: 0.66, count: 2, spread: 0.42, speed: 240, size: 8, pierce: 0 },
        { rate: 1.05, dmg: 0.72, count: 3, spread: 0.44, speed: 245, size: 8, pierce: 0 },
        { rate: 1.10, dmg: 0.80, count: 3, spread: 0.46, speed: 250, size: 8, pierce: 1 },
        { rate: 1.15, dmg: 0.90, count: 4, spread: 0.48, speed: 255, size: 9, pierce: 1 },
        { rate: 1.20, dmg: 1.02, count: 5, spread: 0.50, speed: 260, size: 9, pierce: 1 }
      ],
      spec: { mode: 'homing', kind: 'seeker', count: 2, spread: 0.42, speed: 240, dmg: 0.66, size: 8, pierce: 0 } },
    { key: 'hornet-cathedral', name: 'Hornet Cathedral', kind: 'seeker', mode: 'homing-respawn', glyph: 'ic_wisp', frame: 'wisp',
      color: 0xd8c8ff, impact: 0xecdcff, muzzle: 0xc480ff, cue: 'telegraph', tier: 'evolution',
      desc: 'Every kill instantly respawns a replacement dart. The swarm never thins.',
      recipeModule: 'wingBay', recipeText: 'LVL5 + WING BAY',
      levels: [ { rate: 1.20, dmg: 0.85, count: 5, spread: 0.50, speed: 260, size: 9, pierce: 1, replicateOnKill: true } ],
      spec: { mode: 'homing-respawn', kind: 'seeker', count: 5, spread: 0.50, speed: 260, dmg: 0.85, size: 9, pierce: 1, replicateOnKill: true } },

    // -------------------------------------------------------------- MORTAR
    { key: 'mortar', name: 'Mortar', kind: 'mortar', mode: 'lob', glyph: 'ic_pulse', frame: 'ic_pulse',
      color: 0xff8f6b, impact: 0xffc8a0, muzzle: 0xff8f6b, cue: 'death',
      desc: 'A lobbed shell that arcs down and detonates.',
      evolvesTo: 'meteor-choir',
      levels: [
        { rate: 1.00, dmg: 1.45, count: 1, spread: 0, speed: 360, size: 12, pierce: 0, drop: -230, burstRadius: 118, burstDmg: 0.6 },
        { rate: 1.03, dmg: 1.55, count: 1, spread: 0, speed: 365, size: 12, pierce: 0, drop: -235, burstRadius: 122, burstDmg: 0.62 },
        { rate: 1.06, dmg: 1.68, count: 1, spread: 0, speed: 370, size: 13, pierce: 0, drop: -240, burstRadius: 126, burstDmg: 0.66 },
        { rate: 1.09, dmg: 1.85, count: 2, spread: 0.24, speed: 375, size: 13, pierce: 0, drop: -245, burstRadius: 130, burstDmg: 0.7 },
        { rate: 1.12, dmg: 2.05, count: 2, spread: 0.24, speed: 380, size: 14, pierce: 0, drop: -250, burstRadius: 136, burstDmg: 0.76 }
      ],
      spec: { mode: 'lob', kind: 'mortar', count: 1, spread: 0, speed: 360, dmg: 1.45, size: 12, pierce: 0, drop: -230, burst: { radius: 118, dmg: 0.6 } } },
    { key: 'meteor-choir', name: 'Meteor Choir', kind: 'mortar', mode: 'lob-cluster', glyph: 'ic_pulse', frame: 'ic_pulse',
      color: 0xff9a7a, impact: 0xffc8a0, muzzle: 0xff8f6b, cue: 'death', tier: 'evolution',
      desc: 'The shell splits into cluster submunitions at the apex of its arc.',
      recipeModule: 'fortune', recipeText: 'LVL5 + FORTUNE',
      levels: [ { rate: 1.12, dmg: 1.4, count: 2, spread: 0.24, speed: 380, size: 14, pierce: 0, drop: -250,
        burstRadius: 136, burstDmg: 0.76, clusterCount: 4, clusterDmg: 0.42, clusterRadius: 70 } ],
      spec: { mode: 'lob-cluster', kind: 'mortar', count: 2, spread: 0.24, speed: 380, dmg: 1.4, size: 14, pierce: 0,
        drop: -250, burst: { radius: 136, dmg: 0.76 }, clusterCount: 4, clusterDmg: 0.42, clusterRadius: 70 } },

    // ---------------------------------------------------------------- BEAM
    { key: 'beam', name: 'Beam', kind: 'beam', mode: 'sweep', glyph: 'ic_beam', frame: 'bolt',
      color: 0x6df0bf, impact: 0xd0fff0, muzzle: 0x6df0bf, cue: 'click',
      desc: 'A rotating beam that sweeps and pierces everything it crosses.',
      evolvesTo: 'solar-lance',
      levels: [
        { rate: 1.00, dmg: 1.14, count: 1, spread: 0, speed: 0, size: 24, pierce: 99, beamLen: 430, beamWid: 24 },
        { rate: 1.02, dmg: 1.20, count: 1, spread: 0, speed: 0, size: 25, pierce: 99, beamLen: 445, beamWid: 25 },
        { rate: 1.04, dmg: 1.28, count: 1, spread: 0, speed: 0, size: 26, pierce: 99, beamLen: 460, beamWid: 26 },
        { rate: 1.06, dmg: 1.38, count: 1, spread: 0, speed: 0, size: 27, pierce: 99, beamLen: 475, beamWid: 28 },
        { rate: 1.08, dmg: 1.50, count: 1, spread: 0, speed: 0, size: 28, pierce: 99, beamLen: 490, beamWid: 30 }
      ],
      spec: { mode: 'beam', dmg: 1.85, beam: { len: 430, wid: 24, sweep: true } } },
    { key: 'solar-lance', name: 'Solar Lance', kind: 'beam', mode: 'lockbeam', glyph: 'ic_beam', frame: 'bolt',
      color: 0xffd67a, impact: 0xfff3bf, muzzle: 0xffb45a, cue: 'click', tier: 'evolution',
      desc: 'Locks straight ahead and burns a lasting lane into the ground.',
      recipeModule: 'reactor', recipeText: 'LVL5 + REACTOR',
      levels: [ { rate: 1.08, dmg: 1.6, count: 1, spread: 0, speed: 0, size: 30, pierce: 99, beamLen: 520,
        beamWid: 32, laneDur: 2.2, laneDps: 0.3 } ],
      spec: { mode: 'lockbeam', dmg: 1.6, beam: { len: 520, wid: 32, sweep: false }, laneDur: 2.2, laneDps: 0.3 } },

    // -------------------------------------------------------------- GLAIVE
    { key: 'glaive', name: 'Glaive', kind: 'glaive', mode: 'return', glyph: 'ic_orbit', frame: 'shard',
      color: 0xffd67a, impact: 0xfff0b0, muzzle: 0xffc361, cue: 'hit',
      desc: 'A thrown blade that returns to the pilot.',
      evolvesTo: 'cyclone-halo',
      levels: [
        { rate: 1.00, dmg: 1.24, count: 1, spread: 0, speed: 500, size: 10, pierce: 2 },
        { rate: 1.03, dmg: 1.34, count: 1, spread: 0, speed: 510, size: 10, pierce: 3 },
        { rate: 1.06, dmg: 1.46, count: 2, spread: 0.3, speed: 520, size: 11, pierce: 3 },
        { rate: 1.09, dmg: 1.60, count: 2, spread: 0.3, speed: 530, size: 11, pierce: 4 },
        { rate: 1.12, dmg: 1.78, count: 3, spread: 0.4, speed: 540, size: 12, pierce: 5 }
      ],
      spec: { mode: 'return', kind: 'glaive', count: 1, spread: 0, speed: 500, dmg: 1.24, size: 10, pierce: 2 } },
    { key: 'cyclone-halo', name: 'Cyclone Halo', kind: 'glaive', mode: 'perma-orbit', glyph: 'ic_orbit', frame: 'shard',
      color: 0xffe08a, impact: 0xfff0b0, muzzle: 0xffc361, cue: 'hit', tier: 'evolution',
      desc: 'The glaive never returns. It orbits the pilot forever, growing wider.',
      recipeModule: 'thrusters', recipeText: 'LVL5 + THRUSTER',
      levels: [ { rate: 1.12, dmg: 1.5, count: 3, spread: 0.4, speed: 0, size: 12, pierce: 6,
        orbitGrow: 22, orbitSpeed: 4.2 } ],
      spec: { mode: 'perma-orbit', kind: 'cyclone-glaive', count: 3, spread: 0.4, speed: 0, dmg: 1.5, size: 12,
        pierce: 6, orbitGrow: 22, orbitSpeed: 4.2 } },

    // ---------------------------------------------------------------- MINE
    { key: 'mine', name: 'Mine', kind: 'mine', mode: 'drop', glyph: 'ic_mine', frame: 'ic_mine',
      color: 0xff9a5a, impact: 0xffe0ad, muzzle: 0xff9a5a, cue: 'select',
      desc: 'Drops stationary volatile charges in the pilot\'s wake.',
      evolvesTo: 'oblivion-web',
      levels: [
        { rate: 1.00, dmg: 0.60, count: 2, spread: 0, speed: 0, size: 0, pierce: 0, radius: 100, tether: 0 },
        { rate: 1.02, dmg: 0.66, count: 2, spread: 0, speed: 0, size: 0, pierce: 0, radius: 106, tether: 0 },
        { rate: 1.04, dmg: 0.72, count: 3, spread: 0, speed: 0, size: 0, pierce: 0, radius: 112, tether: 0 },
        { rate: 1.06, dmg: 0.80, count: 3, spread: 0, speed: 0, size: 0, pierce: 0, radius: 118, tether: 0 },
        { rate: 1.08, dmg: 0.90, count: 4, spread: 0, speed: 0, size: 0, pierce: 0, radius: 126, tether: 0 }
      ],
      spec: { mode: 'mine', dmg: 0.6, mine: { radius: 100, count: 2, web: false } } },
    { key: 'oblivion-web', name: 'Oblivion Web', kind: 'mine', mode: 'tether-mine', glyph: 'ic_mine', frame: 'ic_mine',
      color: 0xff9ac0, impact: 0xffc8dc, muzzle: 0xff7f9b, cue: 'select', tier: 'evolution',
      desc: 'Mines tether to each other with damaging lines between them.',
      recipeModule: 'gunDeck', recipeText: 'LVL5 + GUN DECK',
      levels: [ { rate: 1.08, dmg: 0.7, count: 5, spread: 0, speed: 0, size: 0, pierce: 0, radius: 130,
        tether: 1, tetherDps: 0.4 } ],
      spec: { mode: 'tether-mine', dmg: 0.7, mine: { radius: 130, count: 5, web: true }, tetherDps: 0.4 } },

    // ------------------------------------------------------------ RICOCHET
    { key: 'ricochet', name: 'Ricochet', kind: 'ricochet', mode: 'bounce', glyph: 'ic_crit', frame: 'shard',
      color: 0x8effd8, impact: 0xd0fff4, muzzle: 0x54d6c0, cue: 'wave',
      desc: 'A shard that bounces off arena edges, pressuring distant lanes.',
      evolvesTo: 'prism-cascade',
      levels: [
        { rate: 1.00, dmg: 0.96, count: 1, spread: 0, speed: 520, size: 7, pierce: 1, bounces: 4 },
        { rate: 1.03, dmg: 1.05, count: 1, spread: 0, speed: 530, size: 7, pierce: 1, bounces: 5 },
        { rate: 1.06, dmg: 1.16, count: 2, spread: 0.2, speed: 540, size: 8, pierce: 2, bounces: 5 },
        { rate: 1.09, dmg: 1.28, count: 2, spread: 0.2, speed: 550, size: 8, pierce: 2, bounces: 6 },
        { rate: 1.12, dmg: 1.42, count: 3, spread: 0.3, speed: 560, size: 9, pierce: 3, bounces: 7 }
      ],
      spec: { mode: 'bounce', kind: 'ricochet', count: 1, spread: 0, speed: 520, dmg: 0.96, size: 7, pierce: 1, bounces: 4 } },
    { key: 'prism-cascade', name: 'Prism Cascade', kind: 'ricochet', mode: 'bounce-split', glyph: 'ic_crit', frame: 'shard',
      color: 0x9fffe7, impact: 0xdcfff8, muzzle: 0x54d6c0, cue: 'wave', tier: 'evolution',
      desc: 'Every bounce splits the shard into two shards.',
      recipeModule: 'fortune', recipeText: 'LVL5 + FORTUNE',
      levels: [ { rate: 1.12, dmg: 1.05, count: 3, spread: 0.3, speed: 560, size: 9, pierce: 3, bounces: 7, splitOnBounce: true } ],
      spec: { mode: 'bounce-split', kind: 'prism-ricochet', count: 3, spread: 0.3, speed: 560, dmg: 1.05, size: 9,
        pierce: 3, bounces: 7, splitOnBounce: true } },

    // ------------------------------------------------------------ ARC COIL
    { key: 'arccoil', name: 'Arc Coil', kind: 'arccoil', mode: 'chain', glyph: 'ic_crit', frame: 'shard',
      color: 0xfff36a, impact: 0xffffb0, muzzle: 0xffd67a, cue: 'levelup',
      desc: 'A charged shard whose impact chains lightning to nearby foes.',
      evolvesTo: 'tesla-crown',
      levels: [
        { rate: 1.00, dmg: 1.02, count: 1, spread: 0, speed: 500, size: 7, pierce: 0, chainCount: 1, chainRadius: 190, chainDmg: 0.46 },
        { rate: 1.03, dmg: 1.10, count: 1, spread: 0, speed: 510, size: 7, pierce: 0, chainCount: 2, chainRadius: 195, chainDmg: 0.46 },
        { rate: 1.06, dmg: 1.20, count: 1, spread: 0, speed: 520, size: 8, pierce: 0, chainCount: 2, chainRadius: 200, chainDmg: 0.5 },
        { rate: 1.09, dmg: 1.32, count: 2, spread: 0.2, speed: 530, size: 8, pierce: 0, chainCount: 3, chainRadius: 205, chainDmg: 0.5 },
        { rate: 1.12, dmg: 1.46, count: 2, spread: 0.2, speed: 540, size: 9, pierce: 0, chainCount: 3, chainRadius: 210, chainDmg: 0.55 }
      ],
      spec: { mode: 'chain', kind: 'coil-tempest', count: 1, spread: 0, speed: 500, dmg: 1.02, size: 7, pierce: 0,
        arc: { radius: 190, dmg: 0.46, hops: 1 } } },
    { key: 'tesla-crown', name: 'Tesla Crown', kind: 'arccoil', mode: 'aura', glyph: 'ic_crit', frame: 'shard',
      color: 0xa8ffff, impact: 0xe0ffff, muzzle: 0x7ad8ff, cue: 'levelup', tier: 'evolution',
      desc: 'A permanent aura around the pilot that continuously chains to nearby enemies.',
      recipeModule: 'hull', recipeText: 'LVL5 + HULL',
      levels: [ { rate: 1.0, dmg: 0.5, count: 0, spread: 0, speed: 0, size: 0, pierce: 0,
        auraRadius: 200, auraTick: 0.35, auraChain: 3, auraChainRadius: 190 } ],
      spec: { mode: 'aura', dmg: 0.5, auraRadius: 200, auraTick: 0.35, auraChain: 3, auraChainRadius: 190 } },

    // ---------------------------------------------------------------- FLAK
    { key: 'flak', name: 'Flak Cannon', kind: 'flak', mode: 'proximity', glyph: 'ic_pulse', frame: 'shard',
      color: 0xffb28a, impact: 0xffd8a8, muzzle: 0xff9a5a, cue: 'enemyShoot',
      desc: 'Shells proximity-fuse and detonate the instant they near a target.',
      evolvesTo: 'nova-curtain',
      levels: [
        { rate: 1.00, dmg: 0.9, count: 3, spread: 0.5, speed: 430, size: 6, pierce: 0, fuseRadius: 60, burstRadius: 78, burstDmg: 0.3 },
        { rate: 1.03, dmg: 0.98, count: 3, spread: 0.52, speed: 435, size: 6, pierce: 0, fuseRadius: 62, burstRadius: 82, burstDmg: 0.32 },
        { rate: 1.06, dmg: 1.08, count: 4, spread: 0.55, speed: 440, size: 7, pierce: 0, fuseRadius: 64, burstRadius: 86, burstDmg: 0.34 },
        { rate: 1.09, dmg: 1.20, count: 4, spread: 0.58, speed: 445, size: 7, pierce: 0, fuseRadius: 66, burstRadius: 90, burstDmg: 0.38 },
        { rate: 1.12, dmg: 1.34, count: 5, spread: 0.62, speed: 450, size: 8, pierce: 0, fuseRadius: 68, burstRadius: 96, burstDmg: 0.42 }
      ],
      spec: { mode: 'proximity', kind: 'flak', count: 3, spread: 0.5, speed: 430, dmg: 0.9, size: 6, pierce: 0,
        fuseRadius: 60, burst: { radius: 78, dmg: 0.3 } } },
    { key: 'nova-curtain', name: 'Nova Curtain', kind: 'flak', mode: 'proximity-wall', glyph: 'ic_pulse', frame: 'shard',
      color: 0xffcf9a, impact: 0xffe4bc, muzzle: 0xff9a5a, cue: 'enemyShoot', tier: 'evolution',
      desc: 'Bursts leave behind a lingering flak wall that keeps burning the ground.',
      recipeModule: 'thrusters', recipeText: 'LVL5 + THRUSTER',
      levels: [ { rate: 1.12, dmg: 1.1, count: 5, spread: 0.62, speed: 450, size: 8, pierce: 0, fuseRadius: 68,
        burstRadius: 96, burstDmg: 0.42, wallDur: 2.0, wallDps: 0.28, wallRadius: 90 } ],
      spec: { mode: 'proximity-wall', kind: 'flak', count: 5, spread: 0.62, speed: 450, dmg: 1.1, size: 8, pierce: 0,
        fuseRadius: 68, burst: { radius: 96, dmg: 0.42 }, wallDur: 2.0, wallDps: 0.28, wallRadius: 90 } },

    // ------------------------------------------------------------ DRONEBAY
    { key: 'dronebay', name: 'Drone Bay', kind: 'dronebay', mode: 'drone', glyph: 'ic_wisp', frame: 'wisp',
      color: 0x8fe7ff, impact: 0xc8f4ff, muzzle: 0x54d6ff, cue: 'telegraph',
      desc: 'Launches autonomous gun drones that orbit and fire on their own.',
      evolvesTo: 'swarm-carrier',
      levels: [
        { rate: 1.00, dmg: 0.5, count: 1, spread: 0, speed: 0, size: 8, pierce: 0, droneCount: 1, droneFireRate: 0.55, droneOrbitR: 70 },
        { rate: 1.00, dmg: 0.55, count: 1, spread: 0, speed: 0, size: 8, pierce: 0, droneCount: 1, droneFireRate: 0.95, droneOrbitR: 72 },
        { rate: 1.00, dmg: 0.6, count: 1, spread: 0, speed: 0, size: 9, pierce: 0, droneCount: 2, droneFireRate: 1.0, droneOrbitR: 74 },
        { rate: 1.00, dmg: 0.68, count: 1, spread: 0, speed: 0, size: 9, pierce: 0, droneCount: 2, droneFireRate: 1.05, droneOrbitR: 76 },
        { rate: 1.00, dmg: 0.76, count: 1, spread: 0, speed: 0, size: 10, pierce: 0, droneCount: 3, droneFireRate: 1.1, droneOrbitR: 78 }
      ],
      spec: { mode: 'drone', dmg: 0.5, droneCount: 1, droneFireRate: 0.55, droneOrbitR: 70, size: 8 } },
    { key: 'swarm-carrier', name: 'Swarm Carrier', kind: 'dronebay', mode: 'drone-replicate', glyph: 'ic_wisp', frame: 'wisp',
      color: 0xa8d8ff, impact: 0xd4ecff, muzzle: 0x6e8bff, cue: 'telegraph', tier: 'evolution',
      desc: 'Drones self-replicate on scoring a kill, up to a hard cap.',
      recipeModule: 'wingBay', recipeText: 'LVL5 + WING BAY',
      levels: [ { rate: 1.0, dmg: 0.65, count: 1, spread: 0, speed: 0, size: 10, pierce: 0, droneCount: 3,
        droneFireRate: 1.1, droneOrbitR: 78, droneCap: 6, replicateOnKill: true } ],
      spec: { mode: 'drone-replicate', dmg: 0.65, droneCount: 3, droneFireRate: 1.1, droneOrbitR: 78, size: 10,
        droneCap: 6, replicateOnKill: true } }
  ];

  var EVOLUTIONS_BY_BASE = {};
  for (var wi = 0; wi < WEAPONS.length; wi++) {
    if (WEAPONS[wi].evolvesTo) EVOLUTIONS_BY_BASE[WEAPONS[wi].key] = WEAPONS[wi].evolvesTo;
  }

  var WEAPON_MODS = [
    { key: 'mod-rate', name: 'Rapid Feed', desc: 'Cuts weapon cooldown, plus 9 percent fire rate.', glyph: 'ic_speed',
      stat: 'rate', amount: 0.09 },
    { key: 'mod-size', name: 'Bulk Rounds', desc: 'Wider hit radius on every shot, plus 8 percent size.', glyph: 'ic_lance',
      stat: 'size', amount: 0.08 },
    { key: 'mod-pierce', name: 'Hardened Tip', desc: 'One additional enemy pierced per shot.', glyph: 'ic_crit',
      stat: 'pierce', amount: 1 },
    { key: 'mod-crit', name: 'Fuse Overcharge', desc: 'Plus 6 percent critical chance on primary hits.', glyph: 'ic_damage',
      stat: 'crit', amount: 0.06 }
  ];

  window.HM2_WEAPONS = { WEAPONS: WEAPONS, EVOLUTIONS_BY_BASE: EVOLUTIONS_BY_BASE, WEAPON_MODS: WEAPON_MODS, lvl: lvl, effectiveSpec: effectiveSpec };
}());
