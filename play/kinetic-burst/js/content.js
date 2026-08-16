/* Kinetic Burst - content registry and save schema.
 *
 * Everything the game can name lives here: ki types, the nine fighters,
 * five campaign arcs, thirty Burst Road stages, six Trial gauntlets and the
 * Endless Surge ramp. Nothing in this file touches Phaser or the DOM, so the
 * sim and the view read the same tables.
 *
 * Tuned constants carried over from the prototype design document are marked
 * PROTO and must not drift.
 */
var KB = (function () {
  'use strict';
  var K = {};

  K.VERSION = '1.0.0';

  /* --------------------------------------------------------------- math */
  K.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  K.lerp = function (a, b, t) { return a + (b - a) * t; };
  /* mulberry32: deterministic, cheap, no allocation per call */
  K.rng = function (seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ----------------------------------------------------------- ki types */
  /* PROTO: triangle POWER > SPEED > FOCUS > POWER, x1.50 / x1.00 / x0.67 */
  K.KI = [
    { id: 0, name: 'Power', short: 'PWR', beats: 1, face: 0xF25C68, edge: 0xFF9AA4, dark: 0x5C2430, shape: 'hex', glyph: 'spike' },
    { id: 1, name: 'Speed', short: 'SPD', beats: 2, face: 0x5BCB77, edge: 0xA8F0BB, dark: 0x1E4A33, shape: 'diamond', glyph: 'bolt' },
    { id: 2, name: 'Focus', short: 'FCS', beats: 0, face: 0x38A8DE, edge: 0x9BDCF7, dark: 0x1E3A5C, shape: 'circle', glyph: 'iris' },
    { id: 3, name: 'Heart', short: 'HRT', beats: -1, face: 0xF7C948, edge: 0xFFE9A6, dark: 0x5C4A1E, shape: 'rsquare', glyph: 'cross' }
  ];
  K.HEART = 3;
  K.ORB_TYPES = 4;

  K.kiMult = function (atk, def) {
    if (atk > 2 || def > 2 || atk < 0 || def < 0) return 1;
    if (K.KI[atk].beats === def) return 1.5;
    if (K.KI[def].beats === atk) return 0.67;
    return 1;
  };
  K.kiLabel = function (atk, def) {
    var m = K.kiMult(atk, def);
    return m > 1 ? 'Advantage' : (m < 1 ? 'Resisted' : 'Even');
  };

  /* -------------------------------------------------------- chain math */
  /* PROTO: every value below is surfaced in the Numbers panel. */
  K.M = {
    cols: 7,
    rows: 5,
    minRun: 3,
    maxPath: 30,
    traceTime: 6.5,
    chargePerOrb: 14,
    chargeBonusPerExtra: 8,
    comboStep: 0.25,
    healPerOrb: 6,
    fullCharge: 100,
    overcap: 200,
    heartRate: 0.19,
    clashWindow: 1.7,
    clashPerfect: 2.0,
    clashGood: 1.4,
    clashLate: 0.75,
    damagePerOrb: 0.34,        /* fighter attack multiplier per scoring orb */
    levelHp: 0.04,
    levelAtk: 0.03,
    maxLevel: 10,
    xpPerLevel: 120
  };

  /* ---------------------------------------------------------- fighters */
  /* passive keys are read by sim.js; every one changes a real number. */
  K.FIGHTERS = [
    {
      id: 0, name: 'Vell Karo', type: 0, hp: 118, atk: 30, badge: 'anvil',
      unlock: -1, trait: 'Steady bruiser. Draws ki 10 percent faster.',
      passive: 'steady',
      special: { name: 'Anvil Break', kind: 'single', power: 2.6, text: 'One heavy strike on the target.' }
    },
    {
      id: 1, name: 'Nix Aravel', type: 1, hp: 96, atk: 27, badge: 'wing',
      unlock: -1, trait: 'Quick hands. Trace timer runs 1.5s longer.',
      passive: 'swift',
      special: { name: 'Split Second', kind: 'double', power: 1.55, text: 'Two fast hits on the target.' }
    },
    {
      id: 2, name: 'Ovi Sanct', type: 2, hp: 104, atk: 28, badge: 'iris',
      unlock: -1, trait: 'Reads clashes. Timing window is 40 percent wider.',
      passive: 'read',
      special: { name: 'Still Point', kind: 'delay', power: 2.0, text: 'Strike, then push every enemy turn back by one.' }
    },
    {
      id: 3, name: 'Brand Mosse', type: 0, hp: 132, atk: 27, badge: 'ridge',
      unlock: 3, trait: 'Heavy frame. Takes 20 percent less damage.',
      passive: 'bulwark',
      special: { name: 'Ridge Fall', kind: 'sweep', power: 1.5, text: 'Hits every standing enemy.' }
    },
    {
      id: 4, name: 'Sura Lim', type: 1, hp: 92, atk: 32, badge: 'edge',
      unlock: 7, trait: 'Glass edge. Highest raw hit, thinnest guard.',
      passive: 'edge',
      special: { name: 'Glass Edge', kind: 'risk', power: 3.4, text: 'Huge single hit that costs 12 percent of her own health.' }
    },
    {
      id: 5, name: 'Talo Wren', type: 2, hp: 112, atk: 26, badge: 'rill',
      unlock: 11, trait: 'Heart runs also charge him.',
      passive: 'wellspring',
      special: { name: 'Rill Song', kind: 'mend', power: 1.8, text: 'Strike and mend the team for a third of the damage.' }
    },
    {
      id: 6, name: 'Ashen Moro', type: 0, hp: 108, atk: 33, badge: 'burn',
      unlock: 15, trait: 'Overcharge specialist. Charge banks past 100 up to 200.',
      passive: 'over',
      special: { name: 'Overburn', kind: 'over', power: 2.4, text: 'Scales with every point of charge above 100.' }
    },
    {
      id: 7, name: 'Kaide Rho', type: 1, hp: 100, atk: 29, badge: 'arc',
      unlock: 21, trait: 'Long chains pay him. Runs of 5 or more add 25 percent.',
      passive: 'longchain',
      special: { name: 'Long Arc', kind: 'chain', power: 2.0, text: 'Grows with the number of runs in the last trace.' }
    },
    {
      id: 8, name: 'Mira Delune', type: 2, hp: 120, atk: 31, badge: 'zero',
      unlock: 27, trait: 'Champion focus. Never suffers a ki resistance.',
      passive: 'champion',
      special: { name: 'Delune Zero', kind: 'pierce', power: 2.2, text: 'Sweeps the field and ignores resistance.' }
    }
  ];
  K.FIGHTER_COUNT = K.FIGHTERS.length;
  K.fighter = function (id) {
    var f = K.FIGHTERS[id | 0];
    return f || K.FIGHTERS[0];              /* guarded lookup, never undefined */
  };

  /* -------------------------------------------------------------- arcs */
  K.ARCS = [
    {
      id: 'ward', name: 'Ashfall Ward', tag: 'City ruins under a low ember sky.',
      sky: [0x201A2C, 0x3A2438], band: [0x2A2438, 0x3B3048, 0x4A3B52],
      frame: 0x2E2A46, frameEdge: 0x6B5C7E, cell: 0x2B3355, accent: 0xF29A4A,
      silhouette: 'towers', boss: 'warden', music: 'theme_road'
    },
    {
      id: 'sky', name: 'Skyloft Ring', tag: 'A brass arena hung above the cloud deck.',
      sky: [0x14314D, 0x2E6A86], band: [0x22506E, 0x2F6C89, 0x54A0B8],
      frame: 0x26445F, frameEdge: 0x8FC6DC, cell: 0x25406A, accent: 0x38A8DE,
      silhouette: 'rings', boss: 'skylord', music: 'theme_road'
    },
    {
      id: 'crater', name: 'Crater Reach', tag: 'Glass sand and slow heat in an old impact bowl.',
      sky: [0x39241F, 0x7A4A2C], band: [0x4A2E23, 0x6A452C, 0x9A6A3C],
      frame: 0x4A3324, frameEdge: 0xC69A62, cell: 0x3A2E48, accent: 0xF7C948,
      silhouette: 'dunes', boss: 'digger', music: 'theme_road'
    },
    {
      id: 'foundry', name: 'Glass Foundry', tag: 'Enamel steel, belts, and cold blue light.',
      sky: [0x10262B, 0x1E4A4A], band: [0x18383C, 0x225055, 0x2E6E6E],
      frame: 0x1E3A3E, frameEdge: 0x7FD0C8, cell: 0x1F3A52, accent: 0x5BCB77,
      silhouette: 'stacks', boss: 'forgeling', music: 'theme_core'
    },
    {
      id: 'core', name: 'Burst Core', tag: 'The place every trace has been pointing at.',
      sky: [0x1A1030, 0x40206A], band: [0x27174A, 0x3A2270, 0x5B36A0],
      frame: 0x2A1A4E, frameEdge: 0xC0A0FF, cell: 0x2A2058, accent: 0x9A7CF3,
      silhouette: 'core', boss: 'prime', music: 'theme_core'
    }
  ];
  K.ARC_COUNT = K.ARCS.length;
  K.arc = function (i) { return K.ARCS[K.clamp(i | 0, 0, K.ARC_COUNT - 1)]; };

  /* ------------------------------------------------------------ stages */
  /* Thirty authored stage names, six per arc; the sixth of every arc is a
   * boss stage. Enemy stats come from the PROTO ladder curve. */
  var STAGE_NAMES = [
    'Ward Gate', 'Broken Terrace', 'Ash Market', 'Fallen Span', 'Signal Yard', 'Warden of the Ward',
    'Loft Steps', 'Brass Gallery', 'Windward Deck', 'Chain Bridge', 'Storm Rail', 'Skylord of the Ring',
    'Glass Flats', 'Rust Basin', 'Sun Anvil', 'Salt Spires', 'Dust Choir', 'Digger of the Reach',
    'Cold Line', 'Enamel Row', 'Belt House', 'Quench Pit', 'Pattern Floor', 'Forgeling Prime',
    'Outer Shell', 'Fault Ring', 'Null Corridor', 'Bright Fault', 'Last Landing', 'Atrax, the Burst Core'
  ];
  var FOE_NAMES = [
    ['Scrap Tin', 'Dust Pin', 'Low Ember', 'Grit Hollow', 'Marr Vane', 'Pale Ott', 'Rebar Sil', 'Cinder Wick'],
    ['Bolt Kessa', 'Horn Driva', 'Silt Maren', 'Flick Nomi', 'Vane Orrel', 'Gale Pitt', 'Brass Kell', 'Loft Anna'],
    ['Rasp Cullen', 'Tide Barrow', 'Glass Penn', 'Sun Ferrik', 'Salt Wray', 'Dune Ossa', 'Mote Callen', 'Kiln Bry'],
    ['Vault Orren', 'Shrike Ada', 'Quill Sev', 'Morrow Kai', 'Briar Tol', 'Enamel Jax', 'Belt Runa', 'Quench Vey'],
    ['Lance Ferro', 'Obsid Rune', 'Maw Gallen', 'Seer Voltaine', 'Regent Haal', 'Null Ivor', 'Fault Sabe', 'Bright Cass']
  ];
  var BOSS_NAMES = ['Warden Ott', 'Skylord Vane', 'Digger Ossa', 'Forgeling Prime', 'Prime Atrax'];

  /* PROTO curve, made continuous so thirty stages read as eight ladder rounds */
  K.foeHP = function (r) { return Math.round(66 + r * 34); };
  K.foeATK = function (r) { return Math.round(8 + r * 3.0); };
  K.foeSpeed = function (r) { return r >= 6 ? 2 : 3; };

  function buildStage(i) {
    var arc = (i / 6) | 0;
    var inArc = i % 6;
    var boss = inArc === 5;
    var r = i * 7 / 29;                        /* 0 .. 7 across the campaign */
    var rand = K.rng(0x5EED + i * 977);
    var names = FOE_NAMES[arc];
    var waveCount = boss ? 3 : (i < 22 ? 2 : 3);
    var waves = [];
    var used = 0;
    for (var w = 0; w < waveCount; w++) {
      var last = boss && w === waveCount - 1;
      var size = last ? 1 : (i < 4 ? 2 : (w === waveCount - 1 ? 3 : 2));
      var foes = [];
      for (var k = 0; k < size; k++) {
        var t = last ? (arc % 3) : ((rand() * 3) | 0);
        var lift = 1 + w * 0.10 + (last ? 1.6 : 0);
        foes.push({
          name: last ? BOSS_NAMES[arc] : names[(used++) % names.length],
          type: t,
          hp: Math.round(K.foeHP(r) * lift * (last ? 1.0 : (0.85 + rand() * 0.35))),
          atk: Math.round(K.foeATK(r) * (last ? 1.35 : (0.9 + rand() * 0.3))),
          speed: Math.max(1, K.foeSpeed(r) - (last ? 1 : 0)),
          boss: last
        });
      }
      waves.push(foes);
    }
    return {
      index: i, arc: arc, boss: boss,
      name: STAGE_NAMES[i],
      waves: waves,
      xp: 60 + i * 6 + (boss ? 90 : 0),
      turnPar: 8 + Math.round(i * 0.5) + (boss ? 6 : 0)
    };
  }

  K.STAGE_COUNT = 30;
  var STAGES = null;
  K.stage = function (i) {
    if (!STAGES) {
      STAGES = [];
      for (var s = 0; s < K.STAGE_COUNT; s++) STAGES.push(buildStage(s));
    }
    return STAGES[K.clamp(i | 0, 0, K.STAGE_COUNT - 1)];
  };
  K.allStages = function () { K.stage(0); return STAGES; };

  /* ------------------------------------------------------------ trials */
  K.TRIALS = [
    {
      id: 0, name: 'Opening Form', need: 2, team: [0, 1, 2], arc: 0,
      rule: 'The three founders only. No heart orbs on the board.',
      noHeart: true, r: 1.6, waves: 2
    },
    {
      id: 1, name: 'Guard Duty', need: 6, team: [3, 0, 2], arc: 1,
      rule: 'Enemy turns run one faster. Bring a wall.',
      fastEnemy: 1, r: 2.6, waves: 2
    },
    {
      id: 2, name: 'Thin Edge', need: 10, team: [4, 1, 5], arc: 2,
      rule: 'Half health, double charge gain.',
      halfHp: true, chargeMul: 2, r: 3.4, waves: 2
    },
    {
      id: 3, name: 'Long Trace', need: 14, team: [7, 5, 2], arc: 3,
      rule: 'Runs must reach four orbs to score.',
      minRun: 4, r: 4.4, waves: 3
    },
    {
      id: 4, name: 'Ember Bank', need: 20, team: [6, 3, 8], arc: 4,
      rule: 'Charge never resets between waves.',
      keepCharge: true, r: 5.6, waves: 3
    },
    {
      id: 5, name: 'Zero Hour', need: 26, team: [8, 4, 6], arc: 4,
      rule: 'One wave, one boss, no mending.',
      noHeal: true, boss: true, r: 7.0, waves: 1
    }
  ];
  K.TRIAL_COUNT = K.TRIALS.length;
  K.trial = function (i) { return K.TRIALS[K.clamp(i | 0, 0, K.TRIAL_COUNT - 1)]; };

  K.trialWaves = function (t) {
    var rand = K.rng(0xA11CE + t.id * 313);
    var names = FOE_NAMES[K.clamp(t.arc, 0, FOE_NAMES.length - 1)];
    var waves = [], used = 0;
    for (var w = 0; w < t.waves; w++) {
      var last = w === t.waves - 1;
      var size = t.boss && last ? 1 : (last ? 3 : 2);
      var foes = [];
      for (var k = 0; k < size; k++) {
        var isBoss = t.boss && last;
        foes.push({
          name: isBoss ? BOSS_NAMES[K.clamp(t.arc, 0, 4)] : names[(used++) % names.length],
          type: (rand() * 3) | 0,
          hp: Math.round(K.foeHP(t.r) * (isBoss ? 2.4 : (0.9 + rand() * 0.3))),
          atk: Math.round(K.foeATK(t.r) * (isBoss ? 1.3 : 1)),
          speed: Math.max(1, K.foeSpeed(t.r) - (t.fastEnemy || 0)),
          boss: isBoss
        });
      }
      waves.push(foes);
    }
    return waves;
  };

  /* ----------------------------------------------------------- endless */
  K.endlessWave = function (n) {
    var rand = K.rng(0xE47D + n * 6151);
    var arc = K.clamp((n / 4) | 0, 0, K.ARC_COUNT - 1);
    var names = FOE_NAMES[arc];
    var r = 0.8 + n * 0.75;                    /* steeper than the campaign */
    var size = n % 5 === 4 ? 1 : (n < 2 ? 2 : 3);
    var foes = [];
    for (var k = 0; k < size; k++) {
      var isBoss = n % 5 === 4;
      foes.push({
        name: isBoss ? BOSS_NAMES[arc] : names[((n * 3 + k) | 0) % names.length],
        type: (rand() * 3) | 0,
        hp: Math.round(K.foeHP(r) * (isBoss ? 2.2 : (0.85 + rand() * 0.4))),
        atk: Math.round(K.foeATK(r) * 1.15 * (isBoss ? 1.25 : 1)),
        speed: Math.max(1, K.foeSpeed(r)),
        boss: isBoss
      });
    }
    return { foes: foes, arc: arc };
  };

  /* -------------------------------------------------------------- save */
  K.SAVE_V = 3;

  function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }
  K.zeros = zeros;

  K.defaultSave = function () {
    return {
      v: K.SAVE_V,
      cleared: zeros(K.STAGE_COUNT),
      turns: zeros(K.STAGE_COUNT),
      xp: zeros(K.FIGHTER_COUNT),
      roster: [1, 1, 1, 0, 0, 0, 0, 0, 0],
      team: [0, 1, 2],
      trials: zeros(K.TRIAL_COUNT),
      endBest: 0,
      endWave: 0,
      tutorial: 0,
      seenArc: zeros(K.ARC_COUNT),
      crown: 0
    };
  };

  function numArray(src, n, lo, hi) {
    var out = zeros(n);
    if (Object.prototype.toString.call(src) !== '[object Array]') return out;
    for (var i = 0; i < n; i++) {
      var v = +src[i];
      out[i] = isFinite(v) ? K.clamp(Math.round(v), lo, hi) : 0;
    }
    return out;
  }

  /* Repairs any shape into a legal save. Never throws, never returns junk. */
  K.normalizeSave = function (raw) {
    var d = K.defaultSave();
    if (!raw || typeof raw !== 'object') return d;
    d.cleared = numArray(raw.cleared, K.STAGE_COUNT, 0, 1);
    d.turns = numArray(raw.turns, K.STAGE_COUNT, 0, 9999);
    d.xp = numArray(raw.xp, K.FIGHTER_COUNT, 0, K.M.xpPerLevel * K.M.maxLevel * 4);
    d.roster = numArray(raw.roster, K.FIGHTER_COUNT, 0, 1);
    d.trials = numArray(raw.trials, K.TRIAL_COUNT, 0, 1);
    d.endBest = K.clamp(Math.round(+raw.endBest || 0), 0, 99999999);
    d.endWave = K.clamp(Math.round(+raw.endWave || 0), 0, 9999);
    d.tutorial = raw.tutorial ? 1 : 0;
    d.crown = raw.crown ? 1 : 0;
    d.seenArc = numArray(raw.seenArc, K.ARC_COUNT, 0, 1);
    /* the three starters can never be locked out of a repaired save */
    d.roster[0] = 1; d.roster[1] = 1; d.roster[2] = 1;
    /* unlocks must agree with cleared stages, so a hand-edited file cannot
     * leave a fighter dangling on the roster screen */
    for (var i = 0; i < K.FIGHTER_COUNT; i++) {
      var need = K.FIGHTERS[i].unlock;
      if (need >= 0 && d.cleared[need]) d.roster[i] = 1;
    }
    /* team must be three distinct unlocked fighters */
    var team = [], seen = {};
    var src = Object.prototype.toString.call(raw.team) === '[object Array]' ? raw.team : [];
    for (var t = 0; t < src.length && team.length < 3; t++) {
      var id = src[t] | 0;
      if (id >= 0 && id < K.FIGHTER_COUNT && d.roster[id] && !seen[id]) { seen[id] = 1; team.push(id); }
    }
    for (var f = 0; f < K.FIGHTER_COUNT && team.length < 3; f++) {
      if (d.roster[f] && !seen[f]) { seen[f] = 1; team.push(f); }
    }
    while (team.length < 3) team.push(0);
    d.team = team;
    if (!d.crown) {
      var all = 1;
      for (var s = 0; s < K.STAGE_COUNT; s++) if (!d.cleared[s]) { all = 0; break; }
      d.crown = all;
    }
    return d;
  };

  K.validateSave = function (obj) {
    if (!obj || typeof obj !== 'object') return false;
    if ((obj.v | 0) !== K.SAVE_V) return false;
    if (Object.prototype.toString.call(obj.cleared) !== '[object Array]') return false;
    if (obj.cleared.length !== K.STAGE_COUNT) return false;
    if (Object.prototype.toString.call(obj.roster) !== '[object Array]') return false;
    if (obj.roster.length !== K.FIGHTER_COUNT) return false;
    return true;
  };

  /* ------------------------------------------------------- progression */
  K.level = function (xp) {
    return K.clamp(1 + Math.floor((xp | 0) / K.M.xpPerLevel), 1, K.M.maxLevel);
  };
  K.levelProgress = function (xp) {
    var lv = K.level(xp);
    if (lv >= K.M.maxLevel) return 1;
    return ((xp | 0) % K.M.xpPerLevel) / K.M.xpPerLevel;
  };
  K.statHp = function (f, xp) {
    return Math.round(f.hp * (1 + (K.level(xp) - 1) * K.M.levelHp));
  };
  K.statAtk = function (f, xp) {
    return Math.round(f.atk * (1 + (K.level(xp) - 1) * K.M.levelAtk) * 10) / 10;
  };

  K.clearedCount = function (save) {
    var n = 0;
    for (var i = 0; i < K.STAGE_COUNT; i++) if (save.cleared[i]) n++;
    return n;
  };
  K.nextStage = function (save) {
    for (var i = 0; i < K.STAGE_COUNT; i++) if (!save.cleared[i]) return i;
    return K.STAGE_COUNT - 1;
  };
  K.stageOpen = function (save, i) {
    if (i <= 0) return true;
    return !!save.cleared[i - 1];
  };
  K.trialOpen = function (save, i) {
    return K.clearedCount(save) >= K.trial(i).need;
  };
  K.rosterCount = function (save) {
    var n = 0;
    for (var i = 0; i < K.FIGHTER_COUNT; i++) if (save.roster[i]) n++;
    return n;
  };

  /* fighters whose unlock stage just cleared */
  K.unlockedBy = function (stageIndex) {
    var out = [];
    for (var i = 0; i < K.FIGHTER_COUNT; i++) {
      if (K.FIGHTERS[i].unlock === stageIndex) out.push(i);
    }
    return out;
  };

  return K;
})();
