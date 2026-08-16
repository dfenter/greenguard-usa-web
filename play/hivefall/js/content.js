/* Hivefall - content graph: squad, horde, acts, waves, shelter upgrades, save.
 * Pure data plus deterministic generators. Nothing here touches Phaser, the
 * DOM, or GGKit; the sim and the view both read from this module.
 */
var HF = (function () {
  'use strict';
  var H = {};

  H.VERSION = '1.0.0';

  /* ------------------------------------------------------------- math --- */
  H.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  H.lerp = function (a, b, t) { return a + (b - a) * t; };
  H.ease = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
  H.easeOutBack = function (t) {
    var c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };

  /* mulberry32: the prototype's stream, kept so wave scripts are identical */
  H.rng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  };

  /* ---------------------------------------------------------- palette --- */
  /* Puzzle Pop board tokens, remapped to the Hivefall material kit:
   * amber comb, cool steel tools, dusk field. */
  H.PAL = {
    ink: 0x141C2B,
    board: 0x233149,
    cell: 0x2F415F,
    cellAlt: 0x2A3A55,
    cellEdge: 0x59708F,
    steel: 0x3A4C64,
    steelHi: 0x7B95B4,
    highlight: 0xF7FBFF,
    amber: 0xF7B03C,
    amberDk: 0xB0701A,
    coral: 0xF25C68,
    leaf: 0x5BCB77,
    tide: 0x38A8DE,
    plum: 0x9A7CF3,
    sun: 0xF7C948,
    text: 0xDCE7F4,
    dim: 0x8FA4BB
  };

  /* ------------------------------------------------------------ squad --- */
  /* Five survivors. Each owns one match colour; a match fires that survivor's
   * kit up the matched column. Triple coded: hue, silhouette, glyph. */
  H.SQUAD = [
    {
      id: 0, key: 'cannon', name: 'Vance', role: 'Cannoneer', short: 'CAN',
      color: 0xF25C68, edge: 0xA5303C, glyph: 'shell', shape: 'hex',
      unlock: 1, line: 'Shell fire straight up the lane.'
    },
    {
      id: 1, key: 'repair', name: 'Wren', role: 'Wallwright', short: 'REP',
      color: 0x5BCB77, edge: 0x2E7C46, glyph: 'cross', shape: 'shield',
      unlock: 1, line: 'Patches the wall in that column.'
    },
    {
      id: 2, key: 'salvage', name: 'Odis', role: 'Scrapper', short: 'SAL',
      color: 0xF7C948, edge: 0xA8801A, glyph: 'gear', shape: 'square',
      unlock: 1, line: 'Strips salvage out of the wreck.'
    },
    {
      id: 3, key: 'frost', name: 'Sable', role: 'Coilwright', short: 'FRO',
      color: 0x38A8DE, edge: 0x1B637F, glyph: 'flake', shape: 'diamond',
      unlock: 4, line: 'Coil burst chills the lane.'
    },
    {
      id: 4, key: 'venom', name: 'Mirek', role: 'Chemist', short: 'VEN',
      color: 0x9A7CF3, edge: 0x5B3FA8, glyph: 'drop', shape: 'flask',
      unlock: 8, line: 'Venom eats through the horde over time.'
    }
  ];
  H.SQUAD_COUNT = H.SQUAD.length;

  /* how many colours are live for a given best-wave progress */
  H.colorsFor = function (best) {
    var n = 0;
    for (var i = 0; i < H.SQUAD.length; i++) if (best >= H.SQUAD[i].unlock) n++;
    return H.clamp(n, 3, H.SQUAD.length);
  };
  H.squadUnlockedAt = function (wave) {
    var out = [];
    for (var i = 0; i < H.SQUAD.length; i++) if (H.SQUAD[i].unlock === wave) out.push(H.SQUAD[i]);
    return out;
  };

  /* ------------------------------------------------------------ horde --- */
  /* silhouette: baked shape family. trait: sim behaviour switch. */
  H.KINDS = [
    { id: 0, key: 'mite', name: 'Mite', hp: 16, spd: 26, r: 11, dmg: 5, coin: 2, sil: 'mite', trait: 'none' },
    { id: 1, key: 'husk', name: 'Husk', hp: 50, spd: 15, r: 17, dmg: 13, coin: 5, sil: 'husk', trait: 'none' },
    { id: 2, key: 'darter', name: 'Darter', hp: 22, spd: 44, r: 10, dmg: 6, coin: 3, sil: 'darter', trait: 'weave' },
    { id: 3, key: 'wader', name: 'Wader', hp: 92, spd: 12, r: 19, dmg: 18, coin: 8, sil: 'wader', trait: 'armor' },
    { id: 4, key: 'spitter', name: 'Spitter', hp: 40, spd: 20, r: 13, dmg: 9, coin: 6, sil: 'spitter', trait: 'ranged' },
    { id: 5, key: 'drone', name: 'Drone', hp: 58, spd: 30, r: 14, dmg: 12, coin: 7, sil: 'drone', trait: 'accel' },
    { id: 6, key: 'boss', name: 'Horror', hp: 320, spd: 9, r: 27, dmg: 40, coin: 60, sil: 'boss', trait: 'boss' }
  ];
  H.kind = function (id) { return H.KINDS[id] || H.KINDS[0]; };

  /* ------------------------------------------------------------- acts --- */
  /* Four authored act identities: board frame material, field palette, horde
   * roster, and one signature hazard tile each. */
  H.ACTS = [
    {
      id: 0, name: 'Suburb Dusk', from: 1, to: 10,
      frame: 'fence', frameA: 0x6B4A2E, frameB: 0x8A6338, trim: 0xF7B03C,
      skyTop: 0x2E2340, skyBot: 0x54395E, ground: 0x271F38, lane: 0x372B4B,
      hordeTint: 0xE0A468, roster: [0, 1, 2],
      hazard: { key: 'bramble', name: 'Bramble', layers: 1, every: 9.5, cap: 3, spread: 0, color: 0x6E7F3E },
      boss: { wave: 10, name: 'The Husk Mother', hp: 340, spd: 8.5, r: 27, dmg: 42, coin: 70, trait: 'spawner' },
      brief: 'Cul de sac, porch lights out. They come down the driveways.'
    },
    {
      id: 1, name: 'Flooded Mall', from: 11, to: 20,
      frame: 'tile', frameA: 0x2E5A62, frameB: 0x3F7B84, trim: 0x8FE3E8,
      skyTop: 0x143039, skyBot: 0x225460, ground: 0x13303A, lane: 0x1D414E,
      hordeTint: 0x86CBD6, roster: [0, 2, 3],
      hazard: { key: 'sludge', name: 'Sludge', layers: 2, every: 8.0, cap: 4, spread: 0, color: 0x3A6E5A },
      boss: { wave: 20, name: 'The Tide Choir', hp: 620, spd: 7.5, r: 29, dmg: 46, coin: 110, trait: 'healer' },
      brief: 'Two floors of standing water. Something sings under the escalator.'
    },
    {
      id: 2, name: 'Hospital Block', from: 21, to: 30,
      frame: 'enamel', frameA: 0x3C4A52, frameB: 0x59707A, trim: 0xB9F0D2,
      skyTop: 0x1A2C25, skyBot: 0x2C4E45, ground: 0x172822, lane: 0x223A32,
      hordeTint: 0xA6D9B4, roster: [0, 2, 4, 5],
      hazard: { key: 'spore', name: 'Spore', layers: 1, every: 7.0, cap: 5, spread: 6.5, color: 0x7FB894 },
      boss: { wave: 30, name: 'The Ward Keeper', hp: 980, spd: 8.0, r: 30, dmg: 52, coin: 160, trait: 'shield' },
      brief: 'Ward doors propped open. The corridors breathe on their own.'
    },
    {
      id: 3, name: 'The Hive', from: 31, to: 40,
      frame: 'comb', frameA: 0x8A5A16, frameB: 0xC28626, trim: 0xFFD98A,
      skyTop: 0x2B1A08, skyBot: 0x5A3410, ground: 0x1E1206, lane: 0x2C1D0A,
      hordeTint: 0xFFC470, roster: [1, 2, 3, 5],
      hazard: { key: 'wax', name: 'Comb Wax', layers: 2, every: 6.2, cap: 5, spread: 0, color: 0xC9922E },
      boss: { wave: 40, name: 'The Fall Queen', hp: 1520, spd: 7.0, r: 33, dmg: 60, coin: 260, trait: 'frenzy' },
      brief: 'The comb goes down four storeys. She is at the bottom of it.'
    }
  ];
  H.WAVES = 40;
  H.ACT_COUNT = H.ACTS.length;

  H.actForWave = function (wave) {
    var w = H.clamp(wave | 0, 1, H.WAVES);
    for (var i = 0; i < H.ACTS.length; i++) if (w >= H.ACTS[i].from && w <= H.ACTS[i].to) return H.ACTS[i];
    return H.ACTS[H.ACTS.length - 1];
  };
  /* Endless Night cycles the act identities so the world keeps changing. */
  H.actForEndless = function (stage) {
    return H.ACTS[((stage | 0) - 1 + H.ACTS.length * 4) % H.ACTS.length];
  };
  H.bossName = function (wave) {
    var a = H.actForWave(wave);
    return (a.boss.wave === wave) ? a.boss.name : null;
  };

  /* --------------------------------------------------------- waves ------ */
  /* Deterministic script per wave. The prototype's spawn cadence is kept:
   * seed 9176 + f * 7919, count 7 + f * 1.7 capped at 46, gap 1.55 - f * 0.035
   * clamped to [0.52, 1.55], paired spawns from wave 6. Act rosters and the
   * named boss entry are layered on top. */
  H.genWave = function (waveNum, lanes, endless) {
    var f = H.clamp(waveNum | 0, 1, 400);
    var scriptF = endless ? (12 + f * 1.15) : f;
    var act = endless ? H.actForEndless(f) : H.actForWave(f);
    var roster = act.roster;
    var rng = H.rng(9176 + f * 7919 + (endless ? 5501 : 0));
    var list = [];
    var t = 1.2;
    var n = Math.min(endless ? 60 : 46, Math.round(7 + scriptF * 1.7));
    var gap = H.clamp(1.55 - scriptF * 0.035, endless ? 0.42 : 0.52, 1.55);
    var isBoss = !endless && act.boss.wave === f;
    var elite = !endless && (f % 5 === 0) && !isBoss;
    var i, roll, k;

    for (i = 0; i < n; i++) {
      roll = rng();
      /* roster weighting: the act's first kind is the filler, later kinds
       * arrive as the wave count climbs inside the act */
      k = roster[0];
      var depth = endless ? 1 : H.clamp((f - act.from) / 9, 0, 1);
      if (roster.length > 1 && roll > 0.74 - depth * 0.14) k = roster[1];
      if (roster.length > 2 && roll < 0.20 + depth * 0.16) k = roster[2];
      if (roster.length > 3 && roll > 0.90) k = roster[3];
      list.push({ t: t, kind: k, lane: Math.floor(rng() * lanes) });
      t += gap * (0.55 + rng() * 0.9);
      if (scriptF >= 6 && rng() > 0.86) {
        list.push({ t: Math.max(0.2, t - 0.12), kind: k, lane: Math.floor(rng() * lanes) });
      }
    }
    if (elite) {
      var ek = roster[roster.length - 1];
      list.push({ t: 3.2 + n * gap * 0.25, kind: ek, lane: Math.floor(rng() * lanes), elite: true });
      list.push({ t: 3.6 + n * gap * 0.55, kind: ek, lane: Math.floor(rng() * lanes), elite: true });
    }
    if (isBoss) {
      list.push({ t: 4 + n * gap * 0.34, kind: 6, lane: Math.floor(lanes / 2), boss: act.boss });
    }
    list.sort(function (a, b) { return a.t - b.t; });
    return {
      wave: f, list: list, boss: isBoss ? act.boss : null, elite: elite,
      count: list.length, dur: t, act: act, endless: !!endless
    };
  };

  H.waveSummary = function (wave) {
    var c = {}, i, e;
    for (i = 0; i < wave.list.length; i++) {
      e = wave.list[i];
      var key = e.kind;
      c[key] = (c[key] || 0) + 1;
    }
    var out = [];
    for (var k in c) if (Object.prototype.hasOwnProperty.call(c, k)) {
      out.push({ kind: (k | 0), n: c[k] });
    }
    out.sort(function (a, b) { return b.n - a.n; });
    return out;
  };

  /* difficulty ramp shared by sim and preview */
  H.hpMul = function (wave, endless) {
    return endless ? (1 + 0.155 * (wave - 1)) : (1 + 0.128 * (wave - 1));
  };
  H.spdMul = function (wave, endless) {
    return H.clamp(1 + 0.013 * (wave - 1), 1, endless ? 2.4 : 1.62);
  };

  /* --------------------------------------------------------- shelter ---- */
  /* Twelve upgrades, all earned from play. Four are the prototype's gear
   * tracks (eight levels each, cost 25 * 1.78^level); eight are shelter
   * systems that change the board or the run. */
  function costPow(base, growth) {
    return function (lvl) { return Math.round(base * Math.pow(growth, lvl)); };
  }
  H.UPGRADES = [
    { key: 'calibre', name: 'Gun Calibre', desc: 'Shot damage up', max: 8, cost: costPow(25, 1.78), unlock: 1, icon: 'shell', group: 'gear' },
    { key: 'coils', name: 'Frost Coils', desc: 'Deeper, longer chill', max: 8, cost: costPow(28, 1.75), unlock: 4, icon: 'flake', group: 'gear' },
    { key: 'plating', name: 'Wall Plating', desc: 'Wall hit points up', max: 8, cost: costPow(30, 1.72), unlock: 1, icon: 'wall', group: 'gear' },
    { key: 'salvage', name: 'Salvage Rig', desc: 'More salvage per kill', max: 8, cost: costPow(26, 1.80), unlock: 1, icon: 'gear', group: 'gear' },
    { key: 'watchtower', name: 'Watchtower', desc: 'See the horde sooner', max: 3, cost: costPow(120, 2.2), unlock: 3, icon: 'eye', group: 'shelter' },
    { key: 'medkit', name: 'Medkit Tiles', desc: 'Repair heals more, strips hazard', max: 3, cost: costPow(140, 2.15), unlock: 5, icon: 'cross', group: 'shelter' },
    { key: 'pity', name: 'Pity Charge', desc: 'Dry streak seeds a charged tile', max: 3, cost: costPow(150, 2.2), unlock: 8, icon: 'spark', group: 'shelter' },
    { key: 'vents', name: 'Plate Vents', desc: 'Hazard tiles arrive slower', max: 3, cost: costPow(160, 2.1), unlock: 11, icon: 'vent', group: 'shelter' },
    { key: 'barricade', name: 'Barricade', desc: 'Absorb the first hits each wave', max: 3, cost: costPow(180, 2.15), unlock: 14, icon: 'brick', group: 'shelter' },
    { key: 'furnace', name: 'Scrap Furnace', desc: 'Bigger wave clear bonus', max: 3, cost: costPow(170, 2.05), unlock: 17, icon: 'flame', group: 'shelter' },
    { key: 'flare', name: 'Signal Flare', desc: 'Extra flare charge per wave', max: 3, cost: costPow(220, 2.25), unlock: 21, icon: 'flare', group: 'shelter' },
    { key: 'drill', name: 'Squad Drill', desc: 'Cascades hit harder', max: 3, cost: costPow(210, 2.2), unlock: 25, icon: 'chevron', group: 'shelter' }
  ];
  H.UPGRADE_COUNT = H.UPGRADES.length;
  H.upgradeByKey = function (key) {
    for (var i = 0; i < H.UPGRADES.length; i++) if (H.UPGRADES[i].key === key) return H.UPGRADES[i];
    return H.UPGRADES[0];
  };
  H.upgradeUnlocked = function (u, best) { return (best | 0) >= u.unlock; };

  /* derived stats, read by the sim */
  H.stats = function (up) {
    var g = up || {};
    function lv(k) { return g[k] | 0; }
    return {
      dmgMul: 1 + 0.42 * lv('calibre'),
      slowFactor: Math.max(0.22, 0.66 - 0.055 * lv('coils')),
      slowTime: 2.0 + 0.45 * lv('coils'),
      wallMax: 130 + 60 * lv('plating'),
      coinMul: 1 + 0.45 * lv('salvage'),
      telegraph: 2.6 + 1.2 * lv('watchtower'),
      healMul: 1 + 0.35 * lv('medkit'),
      medkitStrips: lv('medkit') >= 3,
      pityMoves: [999, 9, 7, 5][H.clamp(lv('pity'), 0, 3)],
      hazardMul: 1 + 0.34 * lv('vents'),
      barricade: lv('barricade'),
      furnaceMul: 1 + 0.25 * lv('furnace'),
      flares: 1 + lv('flare'),
      cascadeBonus: 0.28 + 0.08 * lv('drill')
    };
  };

  /* ------------------------------------------------------------ save ---- */
  H.SAVE_VERSION = 3;

  H.defaultSave = function () {
    var up = {};
    for (var i = 0; i < H.UPGRADES.length; i++) up[H.UPGRADES[i].key] = 0;
    return {
      v: H.SAVE_VERSION,
      wave: 1,        /* next Fall wave to attempt */
      best: 1,        /* highest wave reached, drives unlocks */
      cleared: 0,     /* highest wave cleared */
      salvage: 0,
      up: up,
      runs: 0,        /* completed Fall campaigns */
      endlessBest: 0,
      endlessStage: 0,
      kills: 0,
      tut: 0,         /* tutorial steps seen */
      hints: 1
    };
  };

  function intOr(v, def, lo, hi) {
    var n = (typeof v === 'number') ? v : parseInt(v, 10);
    if (typeof n !== 'number' || !isFinite(n) || isNaN(n)) return def;
    n = Math.floor(n);
    return H.clamp(n, lo, hi);
  }

  /* Every persisted field is re-validated against the live content registry:
   * an unknown upgrade key, an out-of-range wave, or a hand-edited blob can
   * never put the game into a state the content graph cannot render. */
  H.normalizeSave = function (raw) {
    var s = H.defaultSave();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return s;
    s.wave = intOr(raw.wave, 1, 1, H.WAVES);
    s.best = intOr(raw.best, 1, 1, H.WAVES);
    s.cleared = intOr(raw.cleared, 0, 0, H.WAVES);
    s.salvage = intOr(raw.salvage, 0, 0, 99999999);
    s.runs = intOr(raw.runs, 0, 0, 99999);
    s.endlessBest = intOr(raw.endlessBest, 0, 0, 99999999);
    s.endlessStage = intOr(raw.endlessStage, 0, 0, 9999);
    s.kills = intOr(raw.kills, 0, 0, 99999999);
    s.tut = intOr(raw.tut, 0, 0, 64);
    s.hints = intOr(raw.hints, 1, 0, 1);
    var ru = (raw.up && typeof raw.up === 'object' && !Array.isArray(raw.up)) ? raw.up : {};
    for (var i = 0; i < H.UPGRADES.length; i++) {
      var u = H.UPGRADES[i];
      s.up[u.key] = intOr(ru[u.key], 0, 0, u.max);
    }
    if (s.best < s.wave) s.best = s.wave;
    if (s.cleared > s.best) s.cleared = s.best;
    return s;
  };

  H.validateSave = function (o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    if ((o.v | 0) !== H.SAVE_VERSION) return false;
    if (!o.up || typeof o.up !== 'object') return false;
    return true;
  };

  /* score model for Endless Night */
  H.endlessScore = function (stage, kills, salvage) {
    return (stage | 0) * 250 + (kills | 0) * 10 + (salvage | 0);
  };

  return H;
})();
