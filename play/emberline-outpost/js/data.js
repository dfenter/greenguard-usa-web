/* Emberline Outpost - data: defenders, enemies, maps, kits */
(function (EO) {
  'use strict';

  EO.COLS = 7; EO.ROWS = 9;

  /* ---------- defenders ----------
     fp = footprint cells in facing space: [forward, side]
     tgt: g=ground a=air b=both  */
  EO.DEFS = [
    {
      id: 'blocker', name: 'BLOCKER', ab: 'BLK', cost: 6, hp: 150, dmg: 9, rate: 1.2, tgt: 'g',
      fp: [[1, 0]], col: '#7fb2d9', kind: 'melee',
      skill: { name: 'BRACE', cd: 10, desc: 'Heal 40% and take 60% less damage for 4s.' },
      desc: 'Cheap wall. Hits the tile it faces.'
    },
    {
      id: 'pike', name: 'PIKE', ab: 'PIK', cost: 8, hp: 85, dmg: 13, rate: 0.9, tgt: 'g',
      fp: [[1, 0], [2, 0]], col: '#e2c46a', kind: 'pierce',
      skill: { name: 'LUNGE', cd: 9, desc: 'Instantly strike everything in the line for triple damage.' },
      desc: 'Two tiles ahead, pierces the whole line.'
    },
    {
      id: 'arcer', name: 'ARCER', ab: 'ARC', cost: 13, hp: 60, dmg: 11, rate: 0.6, tgt: 'b',
      fp: [[2, -1], [2, 0], [2, 1], [3, -1], [3, 0], [3, 1]], col: '#e08a5a', kind: 'splash',
      skill: { name: 'BARRAGE', cd: 13, desc: 'Fire four rapid shells at the footprint.' },
      desc: 'Lobbed splash on a far 3x2 block. Hits air.'
    },
    {
      id: 'sparker', name: 'SPARKER', ab: 'SPK', cost: 10, hp: 55, dmg: 7, rate: 1.5, tgt: 'b',
      fp: [[1, -1], [1, 0], [1, 1], [2, 0]], col: '#8ad6e8', kind: 'chain',
      skill: { name: 'OVERLOAD', cd: 11, desc: 'Stun everything in the cone for 1.6s and zap it.' },
      desc: 'Fast cone of arcs. Hits air.'
    },
    {
      id: 'medic', name: 'MEDIC', ab: 'MED', cost: 9, hp: 70, dmg: 0, rate: 0.7, tgt: 'n',
      fp: [[1, 0], [0, -1], [0, 1], [-1, 0], [1, -1], [1, 1]], col: '#8fe0a0', kind: 'heal',
      skill: { name: 'SURGE', cd: 12, desc: 'Heal every defender on the field for 35%.' },
      desc: 'Mends nearby defenders. Does not attack.'
    },
    {
      id: 'sniper', name: 'SNIPER', ab: 'SNP', cost: 15, hp: 45, dmg: 35, rate: 0.4, tgt: 'b',
      fp: [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0]], col: '#d98fd0', kind: 'single',
      skill: { name: 'RAILSHOT', cd: 14, desc: 'One shot pierces the whole line for quadruple damage.' },
      desc: 'Full-length line, huge single hit. Hits air.'
    },
    {
      id: 'oiler', name: 'OILER', ab: 'OIL', cost: 7, hp: 65, dmg: 3, rate: 1.0, tgt: 'g',
      fp: [[1, -1], [1, 0], [1, 1], [2, -1], [2, 0], [2, 1]], col: '#b3a27a', kind: 'slow',
      skill: { name: 'IGNITE', cd: 12, desc: 'Set every oiled enemy alight: 14 burn per second.' },
      desc: 'Slicks a 3x2 block, slowing ground by 45%.'
    },
    {
      id: 'warden', name: 'WARDEN', ab: 'WRD', cost: 12, hp: 190, dmg: 6, rate: 1.0, tgt: 'g',
      fp: [[1, -1], [1, 0], [1, 1]], col: '#c9d3dd', kind: 'shove',
      skill: { name: 'BULWARK', cd: 13, desc: 'All defenders take 45% less damage for 5s.' },
      desc: 'Shoves the front rank back. Shields neighbours.'
    },
    {
      id: 'scout', name: 'SCOUT', ab: 'SCT', cost: 5, hp: 50, dmg: 5, rate: 2.2, tgt: 'g',
      fp: [[1, 0], [2, 0]], col: '#9adf6a', kind: 'pierce',
      skill: { name: 'SCAN', cd: 10, desc: 'Immediately bank 16 deploy charge.' },
      desc: 'Rapid line jabs. Trickles +0.45 charge/s.'
    },
    {
      id: 'anchor', name: 'ANCHOR', ab: 'ANC', cost: 11, hp: 300, dmg: 5, rate: 1.0, tgt: 'g',
      fp: [[1, 0]], col: '#e0764f', kind: 'melee',
      skill: { name: 'ROOT', cd: 12, desc: 'Root all ground enemies in front for 2.6s.' },
      desc: 'Enormous hull. Pulls attackers onto itself.'
    }
  ];
  EO.DEF_BY_ID = {};
  for (var i = 0; i < EO.DEFS.length; i++) EO.DEF_BY_ID[EO.DEFS[i].id] = EO.DEFS[i];

  /* unlocks: 2 per map for the first five maps -> 10 total (2 start + 8) */
  EO.UNLOCKS = [
    ['arcer', 'oiler'],    /* clear map 1 */
    ['sparker', 'scout'],  /* clear map 2 */
    ['medic', 'anchor'],   /* clear map 3 */
    ['warden', 'sniper'],  /* clear map 4 */
    [], [], [], []
  ];

  /* ---------- kits (crafted at base, start-of-map boosts) ---------- */
  EO.KITS = [
    { id: 'cache', name: 'SUPPLY CACHE', cost: { scrap: 24, ember: 0, alloy: 0 }, desc: '+12 starting deploy charge.' },
    { id: 'core', name: 'EMBER CORE', cost: { scrap: 34, ember: 8, alloy: 0 }, desc: '+1.2 charge regen per second.' },
    { id: 'plate', name: 'BULWARK PLATE', cost: { scrap: 44, ember: 12, alloy: 0 }, desc: '+3 to the leak cap.' },
    { id: 'frame', name: 'ALLOY FRAME', cost: { scrap: 52, ember: 10, alloy: 8 }, desc: 'Defenders get +30% hull.' },
    { id: 'kiln', name: 'RAPID KILN', cost: { scrap: 48, ember: 14, alloy: 6 }, desc: 'Skill cooldowns -25%.' },
    { id: 'rig', name: 'SALVAGE RIG', cost: { scrap: 40, ember: 6, alloy: 10 }, desc: '+40% charge from kills.' }
  ];
  EO.KIT_BY_ID = {};
  for (var k = 0; k < EO.KITS.length; k++) EO.KIT_BY_ID[EO.KITS[k].id] = EO.KITS[k];
  EO.slotsUnlocked = function (cleared) {
    var n = 1;
    if (cleared >= 2) n = 2;
    if (cleared >= 4) n = 3;
    if (cleared >= 6) n = 4;
    return n;
  };

  /* ---------- enemies ---------- */
  EO.ENEMIES = {
    runner: { name: 'RUNNER', hp: 28, spd: 1.5, dmg: 7, arate: 1.2, armor: 0, air: 0, leak: 1, r: 9, col: '#e05f5f' },
    grunt: { name: 'GRUNT', hp: 50, spd: 0.95, dmg: 11, arate: 0.9, armor: 1, air: 0, leak: 1, r: 11, col: '#c25050' },
    swarm: { name: 'SWARM', hp: 15, spd: 1.75, dmg: 4, arate: 1.8, armor: 0, air: 0, leak: 1, r: 7, col: '#e88a6a' },
    shell: { name: 'SHELL', hp: 105, spd: 0.68, dmg: 15, arate: 0.7, armor: 6, air: 0, leak: 1, r: 13, col: '#9a6b8f' },
    brute: { name: 'BRUTE', hp: 190, spd: 0.5, dmg: 26, arate: 0.55, armor: 3, air: 0, leak: 2, r: 16, col: '#8d3f3f' },
    flyer: { name: 'FLYER', hp: 32, spd: 1.25, dmg: 0, arate: 0, armor: 0, air: 1, leak: 1, r: 9, col: '#6fa8e0' },
    bomber: { name: 'BOMBER', hp: 96, spd: 0.78, dmg: 0, arate: 0, armor: 2, air: 1, leak: 2, r: 14, col: '#4f7bbd' }
  };

  /* ---------- maps ---------- */
  /* waypoints in cell coords; row -1 = off top, row ROWS = the outpost gate */
  EO.MAPS = [
    {
      name: 'CINDER FLAT', leak: 10, energy: 24, regen: 3.2, waves: 6,
      paths: [[[3, -1], [3, 3], [1, 3], [1, 6], [5, 6], [5, 9]]]
    },
    {
      name: 'ASH TERRACE', leak: 10, energy: 24, regen: 3.2, waves: 7,
      paths: [[[5, -1], [5, 2], [1, 2], [1, 5], [4, 5], [4, 7], [2, 7], [2, 9]]]
    },
    {
      name: 'SLAG NARROWS', leak: 9, energy: 26, regen: 3.4, waves: 8,
      paths: [[[0, -1], [0, 3], [3, 3], [3, 0], [6, 0], [6, 5], [2, 5], [2, 9]]]
    },
    {
      name: 'TWIN CULVERTS', leak: 9, energy: 28, regen: 3.5, waves: 8,
      paths: [
        [[1, -1], [1, 4], [3, 4], [3, 9]],
        [[5, -1], [5, 4], [3, 4], [3, 9]]
      ]
    },
    {
      name: 'SERPENT WALK', leak: 9, energy: 28, regen: 3.6, waves: 9,
      paths: [[[1, -1], [1, 1], [5, 1], [5, 3], [1, 3], [1, 5], [5, 5], [5, 7], [2, 7], [2, 9]]]
    },
    {
      name: 'BROKEN SPUR', leak: 9, energy: 30, regen: 3.6, waves: 10,
      paths: [
        [[6, -1], [6, 2], [2, 2], [2, 4], [6, 4], [6, 6], [0, 6], [0, 9]],
        [[3, -1], [3, 0], [0, 0], [0, 3], [3, 3], [3, 5], [0, 5], [0, 9]]
      ]
    },
    {
      name: 'EMBER GAUNTLET', leak: 8, energy: 30, regen: 3.8, waves: 11,
      paths: [[[3, -1], [3, 1], [6, 1], [6, 3], [0, 3], [0, 5], [6, 5], [6, 7], [3, 7], [3, 9]]]
    },
    {
      name: 'THE LAST GATE', leak: 8, energy: 34, regen: 4.0, waves: 12,
      paths: [
        [[0, -1], [0, 2], [4, 2], [4, 0], [6, 0], [6, 4], [1, 4], [1, 6], [5, 6], [5, 9]],
        [[6, -1], [6, 0], [4, 0], [4, 2], [0, 2], [0, 4], [1, 4], [1, 6], [5, 6], [5, 9]]
      ]
    }
  ];

  /* expand waypoints into an orthogonal list of cells */
  EO.expandPath = function (wps) {
    var cells = [], i, c, cur = wps[0].slice();
    cells.push(cur.slice());
    for (i = 1; i < wps.length; i++) {
      var tgt = wps[i];
      while (cur[0] !== tgt[0] || cur[1] !== tgt[1]) {
        if (cur[0] !== tgt[0]) cur[0] += (tgt[0] > cur[0]) ? 1 : -1;
        else cur[1] += (tgt[1] > cur[1]) ? 1 : -1;
        cells.push(cur.slice());
        if (cells.length > 200) return cells;
      }
    }
    return cells;
  };

  /* ---------- wave generation (deterministic per map) ---------- */
  EO.buildWaves = function (mi) {
    var m = EO.MAPS[mi], rng = EO.seeded(9137 + mi * 7717), out = [], w, np = m.paths.length;
    /* [type, first map it can appear, first wave it can appear] */
    var roster = [
      ['runner', 0, 0], ['grunt', 0, 0], ['swarm', 1, 1], ['flyer', 2, 2],
      ['shell', 3, 3], ['brute', 2, 4], ['bomber', 4, 5]
    ];
    for (w = 0; w < m.waves; w++) {
      var pool = [];
      for (var q = 0; q < roster.length; q++) if (mi >= roster[q][1] && w >= roster[q][2]) pool.push(roster[q][0]);
      var groups = [], gcount = 1 + Math.floor(w / 3) + (rng() < 0.4 ? 1 : 0);
      if (gcount > 3) gcount = 3;
      var budget = (24 + w * 16) * (1 + 0.11 * mi) * (np > 1 ? 0.84 : 1), airUsed = 0;
      for (var g = 0; g < gcount; g++) {
        var t = pool[Math.floor(rng() * pool.length)];
        /* at most one airborne group per wave */
        if (EO.ENEMIES[t].air) { if (airUsed) t = (rng() < 0.5) ? 'runner' : 'grunt'; else airUsed = 1; }
        if (w === 0) t = (g === 0) ? 'runner' : 'grunt';
        if (w === 1 && mi === 0) t = (g === 0) ? 'grunt' : 'runner';
        var e = EO.ENEMIES[t];
        var share = budget / gcount;
        var n = Math.max(2, Math.round(share / (e.hp * 0.36)));
        if (n > 14) n = 14;
        groups.push({
          type: t, count: n,
          gap: e.air ? 0.55 : (0.75 - Math.min(0.3, w * 0.03)),
          delay: g * (1.6 + rng() * 1.4),
          path: Math.floor(rng() * np)
        });
      }
      /* every third wave from map 3 onward gets an air flight */
      if (mi >= 2 && (w % 3 === 2)) {
        groups.push({ type: (mi >= 4 && w > 4) ? 'bomber' : 'flyer', count: Math.min(6, 3 + Math.floor(w / 4)), gap: 0.5, delay: 3.4, path: 0 });
      }
      out.push({ groups: groups, prep: (w === 0) ? 6.0 : 3.6 });
      if (out.length >= 14) break;
    }
    return out;
  };

  /* enemy stat scale per map */
  EO.mapScale = function (mi) { return 1 + 0.11 * mi; };

  EO.matsFor = function (mi, first) {
    var f = first ? 1 : 0.4;
    return {
      scrap: Math.round((22 + mi * 9) * f),
      ember: mi >= 1 ? Math.round((4 + mi * 2.4) * f) : 0,
      alloy: mi >= 3 ? Math.round((3 + (mi - 3) * 2.2) * f) : 0
    };
  };

})(window.EO);
