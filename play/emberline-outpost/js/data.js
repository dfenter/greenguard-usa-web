/* Emberline Outpost content. Original silhouettes and authored lane grammar. */
(function (root) {
  'use strict';
  var EO = root.EO = root.EO || {};

  EO.COLS = 7;
  EO.ROWS = 8;
  EO.DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  EO.PAL = {
    ink: '#0b1118', paper: '#e8e2d4', dim: '#84919d', slate: '#263542',
    cyan: '#43c7f4', blue: '#3864e8', teal: '#63e5c4', coral: '#ff665c',
    wine: '#b72e4d', amber: '#e0a34a', bone: '#d8c38c', moss: '#788b5a',
    ash: '#5b6670', white: '#ffffff', violet: '#c49bff'
  };

  EO.OPERATORS = [
    { id: 'barrier', name: 'BARRIER', abbr: 'BRR', role: 'DEFENDER', kind: 'shield', cost: 6, hp: 150, dmg: 9, rate: 1.2, range: 1, target: 'g', fp: [[1, 0]], col: '#69c6e8', skills: [{ name: 'BRACE', cd: 10, kind: 'brace', desc: 'Heal and brace the line.' }, { name: 'LOCK', cd: 12, kind: 'lock', desc: 'Hold two extra attackers.' }] },
    { id: 'pike', name: 'PIKE', abbr: 'PIK', role: 'DEFENDER', kind: 'spear', cost: 8, hp: 85, dmg: 13, rate: 0.9, range: 2, target: 'g', fp: [[1, 0], [2, 0]], col: '#e2c46a', skills: [{ name: 'LUNGE', cd: 9, kind: 'lunge', desc: 'Triple strike down the facing lane.' }, { name: 'RIPOSTE', cd: 13, kind: 'riposte', desc: 'Return the next hit at full force.' }] },
    { id: 'arcer', name: 'ARCER', abbr: 'ARC', role: 'RANGED', kind: 'lob', cost: 13, hp: 60, dmg: 11, rate: 0.6, range: 3, target: 'b', fp: [[2, -1], [2, 0], [2, 1], [3, -1], [3, 0], [3, 1]], col: '#f09b6b', skills: [{ name: 'BARRAGE', cd: 13, kind: 'barrage', desc: 'Four shells land in the arc.' }, { name: 'FALLING STAR', cd: 17, kind: 'meteor', desc: 'Crush the densest threat group.' }] },
    { id: 'sparker', name: 'SPARKER', abbr: 'SPK', role: 'RANGED', kind: 'coil', cost: 10, hp: 55, dmg: 7, rate: 1.5, range: 2, target: 'b', fp: [[1, -1], [1, 0], [1, 1], [2, 0]], col: '#72d9ef', skills: [{ name: 'OVERLOAD', cd: 11, kind: 'overload', desc: 'Stun and shock the cone.' }, { name: 'CHAIN', cd: 15, kind: 'chain', desc: 'Jump to three marked threats.' }] },
    { id: 'medic', name: 'MEDIC', abbr: 'MED', role: 'MEDIC', kind: 'medic', cost: 9, hp: 70, dmg: 0, rate: 0.7, range: 2, target: 'n', fp: [[1, 0], [0, -1], [0, 1], [-1, 0], [1, -1], [1, 1]], col: '#8fe0a0', skills: [{ name: 'SURGE', cd: 12, kind: 'surge', desc: 'Restore every operator.' }, { name: 'PURGE', cd: 16, kind: 'purge', desc: 'Cleanse and heal the front line.' }] },
    { id: 'sniper', name: 'SNIPER', abbr: 'SNP', role: 'RANGED', kind: 'rail', cost: 15, hp: 45, dmg: 35, rate: 0.4, range: 6, target: 'b', fp: [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0]], col: '#d98fd0', skills: [{ name: 'RAILSHOT', cd: 14, kind: 'railshot', desc: 'Pierce the whole facing lane.' }, { name: 'MARK', cd: 18, kind: 'mark', desc: 'Expose one threat to all fire.' }] },
    { id: 'oiler', name: 'OILER', abbr: 'OIL', role: 'SPECIALIST', kind: 'slick', cost: 7, hp: 65, dmg: 3, rate: 1.0, range: 2, target: 'g', fp: [[1, -1], [1, 0], [1, 1], [2, -1], [2, 0], [2, 1]], col: '#c6a96a', skills: [{ name: 'IGNITE', cd: 12, kind: 'ignite', desc: 'Light every slicked threat.' }, { name: 'SLIPSTREAM', cd: 15, kind: 'slip', desc: 'Double the slow in the wedge.' }] },
    { id: 'warden', name: 'WARDEN', abbr: 'WRD', role: 'DEFENDER', kind: 'bulwark', cost: 12, hp: 190, dmg: 6, rate: 1.0, range: 1, target: 'g', fp: [[1, -1], [1, 0], [1, 1]], col: '#c9d3dd', skills: [{ name: 'BULWARK', cd: 13, kind: 'bulwark', desc: 'Shield every operator.' }, { name: 'SHOVE', cd: 16, kind: 'shove', desc: 'Push the front rank back.' }] },
    { id: 'scout', name: 'SCOUT', abbr: 'SCT', role: 'SPECIALIST', kind: 'runner', cost: 5, hp: 50, dmg: 5, rate: 2.2, range: 2, target: 'g', fp: [[1, 0], [2, 0]], col: '#9adf6a', skills: [{ name: 'SCAN', cd: 10, kind: 'scan', desc: 'Bank deploy charge.' }, { name: 'DECOY', cd: 14, kind: 'decoy', desc: 'Pull the nearest threat.' }] },
    { id: 'anchor', name: 'ANCHOR', abbr: 'ANC', role: 'DEFENDER', kind: 'anchor', cost: 11, hp: 300, dmg: 5, rate: 1.0, range: 1, target: 'g', fp: [[1, 0]], col: '#e0764f', skills: [{ name: 'ROOT', cd: 12, kind: 'root', desc: 'Root all ground threats.' }, { name: 'DRAW', cd: 17, kind: 'draw', desc: 'Pull attackers to this tile.' }] },
    { id: 'relay', name: 'RELAY', abbr: 'RLY', role: 'MEDIC', kind: 'beacon', cost: 10, hp: 80, dmg: 0, rate: 0.8, range: 3, target: 'n', fp: [[1, 0], [0, -1], [0, 1], [-1, 0], [2, 0], [0, -2], [0, 2]], col: '#66e2c1', skills: [{ name: 'OVERCHARGE', cd: 13, kind: 'overcharge', desc: 'Accelerate every cooldown.' }, { name: 'LIFELINE', cd: 18, kind: 'lifeline', desc: 'Save a defeated operator once.' }] },
    { id: 'sapper', name: 'SAPPER', abbr: 'SAP', role: 'SPECIALIST', kind: 'mine', cost: 12, hp: 72, dmg: 17, rate: 1.1, range: 2, target: 'g', fp: [[1, -1], [1, 0], [1, 1], [2, -1], [2, 0], [2, 1]], col: '#ff9d5c', skills: [{ name: 'TRIPWIRE', cd: 12, kind: 'tripwire', desc: 'Prime a hazard across the lane.' }, { name: 'BREACH', cd: 18, kind: 'breach', desc: 'Shred the toughest enemy.' }] }
  ];
  EO.OP_BY_ID = {};
  EO.OPERATORS.forEach(function (op) { EO.OP_BY_ID[op.id] = op; });

  EO.THEATRES = [
    { id: 'ashfall', name: 'ASHFALL APPROACH', short: 'ASHFALL', accent: '#e0a34a', ground: '#202c2d', path: '#6a4c37', horizon: '#301d24', music: 'ashfall', danger: 'dangerAsh', life: 'ash' },
    { id: 'flooded', name: 'FLOODED WORKS', short: 'FLOODED', accent: '#63d3cf', ground: '#142a31', path: '#315b60', horizon: '#11252d', music: 'flooded', danger: 'dangerFlood', life: 'water' },
    { id: 'cinder', name: 'CINDER RIDGE', short: 'CINDER', accent: '#f0875d', ground: '#302326', path: '#70413b', horizon: '#3a1920', music: 'cinder', danger: 'dangerCinder', life: 'sparks' },
    { id: 'core', name: 'OUTPOST CORE', short: 'CORE', accent: '#c49bff', ground: '#1d2330', path: '#4d4260', horizon: '#17142b', music: 'core', danger: 'dangerCore', life: 'lights' }
  ];

  /* Paths are authored in cell coordinates. Rows -1 and ROWS are spawn and gate. */
  EO.PATHS = {
    ashSpine: [[[3, -1], [3, 2], [1, 2], [1, 5], [5, 5], [5, 8]]],
    ashSwitch: [[[5, -1], [5, 1], [1, 1], [1, 4], [4, 4], [4, 6], [2, 6], [2, 8]]],
    ashFork: [[[0, -1], [0, 3], [3, 3], [3, 0], [6, 0], [6, 5], [2, 5], [2, 8]]],
    ashSplit: [[[1, -1], [1, 3], [3, 3], [3, 8]], [[5, -1], [5, 3], [3, 3], [3, 8]]],
    floodBasin: [[[0, -1], [0, 2], [4, 2], [4, 0], [6, 0], [6, 4], [1, 4], [1, 6], [5, 6], [5, 8]]],
    floodCross: [[[6, -1], [6, 2], [2, 2], [2, 4], [6, 4], [6, 6], [0, 6], [0, 8]], [[3, -1], [3, 1], [1, 1], [1, 5], [4, 5], [4, 8]]],
    floodWeir: [[[1, -1], [1, 1], [5, 1], [5, 3], [1, 3], [1, 5], [5, 5], [5, 7], [2, 7], [2, 8]]],
    floodSpill: [[[2, -1], [2, 2], [0, 2], [0, 5], [4, 5], [4, 2], [6, 2], [6, 8]], [[5, -1], [5, 1], [3, 1], [3, 6], [1, 6], [1, 8]]],
    cinderCrest: [[[3, -1], [3, 1], [6, 1], [6, 3], [0, 3], [0, 5], [6, 5], [6, 7], [3, 7], [3, 8]]],
    cinderHook: [[[0, -1], [0, 2], [2, 2], [2, 0], [5, 0], [5, 4], [3, 4], [3, 8]]],
    cinderDouble: [[[0, -1], [0, 1], [4, 1], [4, 3], [1, 3], [1, 7], [5, 7], [5, 8]], [[6, -1], [6, 2], [2, 2], [2, 5], [6, 5], [6, 8]]],
    cinderLattice: [[[2, -1], [2, 1], [5, 1], [5, 3], [2, 3], [2, 5], [5, 5], [5, 7], [3, 7], [3, 8]]],
    coreGate: [[[0, -1], [0, 2], [4, 2], [4, 0], [6, 0], [6, 4], [1, 4], [1, 6], [5, 6], [5, 8]], [[6, -1], [6, 0], [4, 0], [4, 2], [0, 2], [0, 4], [1, 4], [1, 6], [5, 6], [5, 8]]],
    coreSpiral: [[[3, -1], [3, 2], [1, 2], [1, 0], [5, 0], [5, 4], [2, 4], [2, 6], [4, 6], [4, 8]]],
    coreRing: [[[1, -1], [1, 1], [5, 1], [5, 3], [1, 3], [1, 5], [5, 5], [5, 8]], [[5, -1], [5, 0], [2, 0], [2, 2], [6, 2], [6, 6], [3, 6], [3, 8]]]
  };

  function hazard(type, c, r, phase) { return { type: type, c: c, r: r, phase: phase || 0 }; }
  var specs = [
    ['ASH GATE', 'ashSpine', 0, [], 6, false], ['DUST SWITCH', 'ashSwitch', 0, [hazard('vent', 5, 4, 0)], 7, false], ['BROKEN SLOPE', 'ashFork', 0, [hazard('flare', 3, 3, 1)], 7, false], ['TWIN ASH LINES', 'ashSplit', 0, [hazard('vent', 2, 2, 0), hazard('vent', 4, 4, 1)], 8, false], ['SMELTER ROAD', 'ashSwitch', 0, [hazard('flare', 1, 5, 0)], 8, false], ['ASHFALL BOSS', 'ashFork', 0, [hazard('vent', 3, 3, 0), hazard('flare', 5, 5, 1)], 6, true],
    ['LOWER BASIN', 'floodBasin', 1, [hazard('water', 2, 2, 0)], 6, false], ['PUMP CROSSING', 'floodCross', 1, [hazard('water', 4, 4, 0), hazard('steam', 1, 5, 1)], 7, false], ['BLUE WEIR', 'floodWeir', 1, [hazard('water', 1, 3, 0)], 8, false], ['PRESSURE SPILL', 'floodSpill', 1, [hazard('steam', 4, 5, 0), hazard('water', 2, 2, 1)], 8, false], ['DEEP RESERVOIR', 'floodBasin', 1, [hazard('water', 4, 6, 0), hazard('steam', 1, 4, 1)], 9, false], ['FLOODWORKS BOSS', 'floodCross', 1, [hazard('water', 3, 4, 0), hazard('steam', 4, 5, 1)], 6, true],
    ['RIDGE ASCENT', 'cinderCrest', 2, [hazard('flare', 6, 3, 0)], 7, false], ['HOOKED RAVINE', 'cinderHook', 2, [hazard('vent', 2, 2, 0), hazard('flare', 5, 4, 1)], 8, false], ['DOUBLE CREST', 'cinderDouble', 2, [hazard('flare', 4, 3, 0)], 8, false], ['LATTICE RAIL', 'cinderLattice', 2, [hazard('vent', 2, 5, 0), hazard('flare', 5, 5, 1)], 9, false], ['RED CUT', 'cinderHook', 2, [hazard('vent', 3, 4, 0)], 9, false], ['CINDERRIDGE BOSS', 'cinderDouble', 2, [hazard('flare', 2, 3, 0), hazard('vent', 4, 4, 1)], 6, true],
    ['INNER GATE', 'coreGate', 3, [hazard('core', 4, 2, 0)], 8, false], ['REACTOR SPIRAL', 'coreSpiral', 3, [hazard('core', 2, 4, 0), hazard('flare', 5, 4, 1)], 8, false], ['RING LOCK', 'coreRing', 3, [hazard('core', 5, 3, 0)], 9, false], ['CONTROL LATTICE', 'coreGate', 3, [hazard('core', 1, 4, 0), hazard('steam', 5, 6, 1)], 9, false], ['LAST TRANSIT', 'coreSpiral', 3, [hazard('core', 3, 2, 0), hazard('core', 4, 6, 1)], 10, false], ['OUTPOST CORE BOSS', 'coreRing', 3, [hazard('core', 3, 3, 0), hazard('core', 4, 5, 1)], 7, true]
  ];

  EO.MISSIONS = specs.map(function (s, i) {
    var t = EO.THEATRES[s[2]];
    var elevated = i % 3 === 0 ? [[0, 1], [6, 2], [2, 6], [5, 5]] : (i % 3 === 1 ? [[1, 4], [4, 1], [5, 6]] : [[2, 1], [4, 5], [6, 6]]);
    return { id: i, name: s[0], theatre: t.id, theatreIndex: s[2], paths: EO.PATHS[s[1]], hazards: s[3], waves: s[4], boss: s[5], elevated: elevated, seed: 9181 + i * 7129, leak: 10 - Math.min(3, Math.floor(i / 7)), energy: 24 + Math.floor(i / 4) * 2, regen: 3.2 + i * 0.06, reward: { scrap: 22 + i * 4, ember: i >= 2 ? 5 + Math.floor(i * 0.8) : 0, alloy: i >= 9 ? 3 + Math.floor((i - 9) * 0.7) : 0 } };
  });

  EO.CHAPTERS = [
    { name: 'ASHFALL APPROACH', range: [0, 5], theatre: 'ashfall', boss: 'ASHFALL BOSS' },
    { name: 'FLOODED WORKS', range: [6, 11], theatre: 'flooded', boss: 'FLOODWORKS BOSS' },
    { name: 'CINDER RIDGE', range: [12, 17], theatre: 'cinder', boss: 'CINDERRIDGE BOSS' },
    { name: 'OUTPOST CORE', range: [18, 23], theatre: 'core', boss: 'OUTPOST CORE BOSS' }
  ];

  EO.UNLOCKS = {
    0: ['arcer'], 2: ['sparker'], 4: ['medic'], 6: ['sniper'], 8: ['oiler'], 10: ['warden'],
    12: ['scout'], 14: ['anchor'], 16: ['relay'], 18: ['sapper'], 20: [], 22: []
  };

  EO.ENEMIES = {
    runner: { name: 'RUNNER', hp: 28, spd: 1.5, dmg: 7, arate: 1.2, armor: 0, air: 0, leak: 1, r: 9, blocks: 1, threat: 1, col: '#ff7966', kind: 'runner' },
    grunt: { name: 'GRUNT', hp: 50, spd: 0.95, dmg: 11, arate: 0.9, armor: 1, air: 0, leak: 1, r: 11, blocks: 1, threat: 2, col: '#d24f54', kind: 'grunt' },
    swarm: { name: 'SWARM', hp: 15, spd: 1.75, dmg: 4, arate: 1.8, armor: 0, air: 0, leak: 1, r: 7, blocks: 1, threat: 1, col: '#ef9a75', kind: 'swarm' },
    shell: { name: 'SHELL', hp: 105, spd: 0.68, dmg: 15, arate: 0.7, armor: 6, air: 0, leak: 1, r: 13, blocks: 2, threat: 3, col: '#a87991', kind: 'shell' },
    brute: { name: 'BRUTE', hp: 190, spd: 0.5, dmg: 26, arate: 0.55, armor: 3, air: 0, leak: 2, r: 16, blocks: 3, threat: 4, col: '#983f4a', kind: 'brute' },
    flyer: { name: 'FLYER', hp: 32, spd: 1.25, dmg: 0, arate: 0, armor: 0, air: 1, leak: 1, r: 9, blocks: 1, threat: 2, col: '#6fa8e0', kind: 'flyer' },
    bomber: { name: 'BOMBER', hp: 96, spd: 0.78, dmg: 0, arate: 0, armor: 2, air: 1, leak: 2, r: 14, blocks: 2, threat: 4, col: '#4f7bbd', kind: 'bomber' },
    emberLord: { name: 'EMBER LORD', hp: 940, spd: 0.32, dmg: 34, arate: 0.45, armor: 8, air: 0, leak: 4, r: 23, blocks: 4, threat: 5, col: '#ff665c', kind: 'boss' }
  };

  EO.TRIALS = [
    { name: 'THIN ICE', desc: 'Half charge. Perfect lanes.', seed: 19031, modifier: 'scarce' },
    { name: 'HIGH GROUND', desc: 'Elevated tiles double range.', seed: 19077, modifier: 'high' },
    { name: 'RED CLOCK', desc: 'Threats move faster every wave.', seed: 19123, modifier: 'rush' }
  ];

  EO.SIEGE = { name: 'ENDLESS SIEGE', seed: 44171, desc: 'Hold until the core gives way.' };

  EO.expandPath = function (wps) {
    var cells = [], cur = wps[0].slice(), i;
    cells.push(cur.slice());
    for (i = 1; i < wps.length; i++) {
      var tgt = wps[i];
      while (cur[0] !== tgt[0] || cur[1] !== tgt[1]) {
        if (cur[0] !== tgt[0]) cur[0] += tgt[0] > cur[0] ? 1 : -1;
        else cur[1] += tgt[1] > cur[1] ? 1 : -1;
        cells.push(cur.slice());
        if (cells.length > 180) return cells;
      }
    }
    return cells;
  };

  EO.seeded = function (seed) {
    var s = seed | 0;
    return function () { s = (s * 1664525 + 1013904223) | 0; return ((s >>> 8) & 0xffffff) / 0x1000000; };
  };

  EO.buildWaves = function (mission, endless, trial) {
    var rng = EO.seeded((mission && mission.seed) || (endless ? EO.SIEGE.seed : 1));
    var count = endless ? 5 : mission.waves;
    var waves = [], roster = ['runner', 'grunt'];
    if ((mission && mission.id >= 2) || endless) roster.push('swarm', 'flyer');
    if ((mission && mission.id >= 6) || endless) roster.push('shell');
    if ((mission && mission.id >= 10) || endless) roster.push('brute');
    if ((mission && mission.id >= 16) || endless) roster.push('bomber');
    for (var w = 0; w < count; w++) {
      var groups = [], budget = 22 + w * 17 + (mission ? mission.id * 2 : 0);
      var groupCount = 1 + Math.min(2, Math.floor(w / 3));
      for (var g = 0; g < groupCount; g++) {
        var type = roster[Math.floor(rng() * roster.length)];
        if (w === 0) type = g ? 'grunt' : 'runner';
        if (type === 'bomber' && w < 4) type = 'grunt';
        var e = EO.ENEMIES[type];
        groups.push({ type: type, count: Math.min(15, Math.max(2, Math.round(budget / groupCount / (e.hp * 0.38)))), gap: e.air ? 0.52 : 0.72 - Math.min(0.22, w * 0.025), delay: g * 1.35 + rng() * 0.8, path: Math.floor(rng() * ((mission && mission.paths.length) || 1)) });
      }
      if (w >= 2 && w % 3 === 2) groups.push({ type: (mission && mission.id >= 14) || endless ? 'bomber' : 'flyer', count: 3 + Math.floor(w / 4), gap: 0.48, delay: 2.5, path: 0 });
      if (!endless && mission && mission.boss && w === count - 1) groups.push({ type: 'emberLord', count: 1, gap: 0, delay: 2.8, path: 0 });
      waves.push({ groups: groups, prep: w === 0 ? 3.2 : 2.5 });
    }
    return waves;
  };
})(window);
