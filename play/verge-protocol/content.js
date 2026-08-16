/* Verge Protocol - deterministic content: sectors, lane geometry, roster,
 * towers, abilities, facilities, campaign table and wave construction.
 * Pure data plus pure functions. No rendering, no engine dependency. */
'use strict';

(function (root) {
  var C = {};
  var TAU = Math.PI * 2;

  C.VERSION = 1;
  C.TAU = TAU;
  C.BOARD = { x: 28, y: 76, w: 872, h: 524 };

  C.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  C.rng = function (seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ------------------------------------------------------------- hazards */
  C.HAZARDS = {
    slick: { name: 'OIL SLICK', speed: 0.82, dps: 0, range: 1, color: 0x3a3f46, edge: 0x6b7280, glyph: 'slick' },
    flood: { name: 'FLOODWATER', speed: 0.75, dps: 0, range: 1, color: 0x123a4e, edge: 0x3d86a8, glyph: 'wave' },
    surge: { name: 'SURGE CHANNEL', speed: 1.22, dps: 0, range: 1, color: 0x123a4e, edge: 0xe0a34a, glyph: 'arrow' },
    vent: { name: 'CONTAINMENT VENT', speed: 1, dps: 11, range: 1, color: 0x1d3a30, edge: 0x6de0c1, glyph: 'vent' },
    dark: { name: 'BLACKOUT WARD', speed: 1, dps: 0, range: 0.88, color: 0x0d1420, edge: 0x4a5a70, glyph: 'dark' },
    rift: { name: 'RIFT FIELD', speed: 1.22, dps: 0, range: 1, color: 0x2a1c3c, edge: 0xcda1ff, glyph: 'rift' },
    well: { name: 'GRAVITY WELL', speed: 0.78, dps: 0, range: 1, color: 0x151d33, edge: 0x8fa8bb, glyph: 'well' }
  };
  C.hazardDef = function (id) { return C.HAZARDS[id] || C.HAZARDS.slick; };

  /* --------------------------------------------------------------- maps */
  /* A lane is a waypoint chain that forks once. Enemies walk pts, then one
   * of the two branches, and every branch ends on the core point. Barricade
   * closes branch 0 so the crowd folds onto branch 1. */
  C.MAPS = [
    {
      id: 'highway', name: 'HIGHWAY CHECKPOINT', sector: 1,
      subtitle: 'three approaches / open sightlines',
      signature: 'Hold the ramp fork before the haulers reach the booth.',
      biome: 'asphalt', core: [790, 338], coreName: 'CHECKPOINT CORE',
      palette: { floorA: 0x24303a, floorB: 0x1f2a33, route: 0x39434c, accent: 0xe0a34a, sky: 0x101c26 },
      lanes: [
        { id: 'A', label: 'NORTH RAMP', pts: [[28, 120], [150, 128], [268, 150], [372, 168]],
          branches: [[[470, 120], [590, 132], [688, 200], [790, 338]], [[468, 238], [576, 262], [672, 300], [790, 338]]] },
        { id: 'B', label: 'MAIN LINE', pts: [[28, 338], [140, 340], [250, 332], [352, 330]],
          branches: [[[450, 262], [560, 250], [664, 286], [790, 338]], [[452, 408], [566, 420], [668, 392], [790, 338]]] },
        { id: 'C', label: 'SOUTH SHOULDER', pts: [[28, 556], [152, 548], [268, 524], [372, 502]],
          branches: [[[472, 556], [596, 540], [690, 470], [790, 338]], [[470, 432], [578, 412], [672, 378], [790, 338]]] }
      ],
      pads: [[206, 196], [206, 470], [312, 96], [312, 244], [312, 414], [312, 574],
        [420, 178], [420, 318], [420, 462], [530, 196], [530, 340], [530, 480],
        [632, 148], [632, 246], [632, 352], [632, 458], [730, 244], [730, 430]],
      hazards: [{ type: 'slick', x: 500, y: 338, r: 72 }, { type: 'slick', x: 620, y: 176, r: 58 }, { type: 'slick', x: 604, y: 500, r: 62 }],
      landmarks: [{ t: 'overpass', x: 470, y: 338 }, { t: 'hauler', x: 246, y: 296 },
        { t: 'booth', x: 756, y: 486 }, { t: 'mast', x: 118, y: 216 }, { t: 'mast', x: 704, y: 116 }]
    },
    {
      id: 'docks', name: 'FLOODED DOCKS', sector: 2,
      subtitle: 'narrow piers / rising water',
      signature: 'Water slows the horde but the surge channel does not.',
      biome: 'water', core: [786, 320], coreName: 'HARBOUR CORE',
      palette: { floorA: 0x1a3140, floorB: 0x162a37, route: 0x2f4d5c, accent: 0x43c7f4, sky: 0x0b1b26 },
      lanes: [
        { id: 'A', label: 'NORTH PIER', pts: [[230, 76], [236, 164], [262, 246], [300, 318]],
          branches: [[[400, 268], [520, 240], [648, 268], [786, 320]], [[400, 376], [520, 410], [650, 392], [786, 320]]] },
        { id: 'B', label: 'WEST QUAY', pts: [[28, 470], [132, 462], [236, 438], [330, 414]],
          branches: [[[430, 352], [548, 318], [662, 320], [786, 320]], [[432, 470], [556, 492], [672, 436], [786, 320]]] },
        { id: 'C', label: 'SLIPWAY', pts: [[28, 590], [140, 586], [252, 562], [352, 536]],
          branches: [[[462, 560], [590, 548], [700, 470], [786, 320]], [[456, 452], [572, 430], [676, 382], [786, 320]]] }
      ],
      pads: [[152, 140], [152, 300], [330, 140], [340, 214], [348, 470], [240, 512],
        [430, 190], [436, 300], [444, 414], [452, 574], [556, 180], [560, 352],
        [568, 470], [660, 160], [668, 232], [672, 478], [730, 224], [736, 410]],
      hazards: [{ type: 'flood', x: 498, y: 320, r: 82 }, { type: 'flood', x: 302, y: 470, r: 70 },
        { type: 'surge', x: 640, y: 320, r: 56 }],
      landmarks: [{ t: 'crane', x: 172, y: 190 }, { t: 'containers', x: 604, y: 122 },
        { t: 'containers', x: 116, y: 546 }, { t: 'trawler', x: 402, y: 542 }, { t: 'mast', x: 706, y: 132 }]
    },
    {
      id: 'hospital', name: 'QUARANTINE HOSPITAL', sector: 3,
      subtitle: 'tight corridors / blind corners',
      signature: 'Corners are your range. Vents do the rest.',
      biome: 'interior', core: [786, 340], coreName: 'ATRIUM CORE',
      palette: { floorA: 0x2b3038, floorB: 0x252a31, route: 0x3d444d, accent: 0x6de0c1, sky: 0x141821 },
      lanes: [
        { id: 'A', label: 'LOBBY', pts: [[300, 76], [300, 150], [210, 150], [210, 262], [330, 262]],
          branches: [[[430, 200], [540, 200], [540, 300], [660, 300], [786, 340]], [[430, 340], [540, 360], [600, 430], [700, 400], [786, 340]]] },
        { id: 'B', label: 'AMBULANCE BAY', pts: [[28, 340], [120, 340], [120, 430], [240, 430], [330, 400]],
          branches: [[[430, 320], [540, 286], [646, 318], [786, 340]], [[430, 470], [548, 492], [664, 440], [786, 340]]] },
        { id: 'C', label: 'SOUTH STAIR', pts: [[200, 586], [200, 520], [300, 520], [380, 556], [470, 556]],
          branches: [[[566, 520], [660, 470], [730, 410], [786, 340]], [[560, 430], [640, 380], [712, 356], [786, 340]]] }
      ],
      pads: [[150, 100], [258, 196], [150, 214], [150, 520], [268, 340], [268, 470],
        [268, 574], [380, 140], [380, 320], [384, 470], [490, 120], [490, 262],
        [494, 400], [498, 500], [606, 160], [610, 246], [614, 370], [620, 500],
        [710, 246], [714, 486]],
      hazards: [{ type: 'vent', x: 470, y: 262, r: 58 }, { type: 'vent', x: 610, y: 430, r: 58 },
        { type: 'dark', x: 236, y: 344, r: 92 }],
      landmarks: [{ t: 'ambulance', x: 96, y: 486 }, { t: 'tents', x: 420, y: 96 },
        { t: 'tents', x: 660, y: 96 }, { t: 'gurney', x: 340, y: 210 }, { t: 'gurney', x: 546, y: 566 }]
    },
    {
      id: 'verge', name: 'THE VERGE', sector: 4,
      subtitle: 'four approaches / unstable ground',
      signature: 'Everything converges. Nothing here is neutral.',
      biome: 'rift', core: [700, 338], coreName: 'VERGE CORE',
      palette: { floorA: 0x272036, floorB: 0x211b2e, route: 0x3b3350, accent: 0xcda1ff, sky: 0x140f1e },
      lanes: [
        { id: 'A', label: 'NORTH SPUR', pts: [[300, 76], [330, 160], [300, 250], [340, 330]],
          branches: [[[440, 258], [540, 226], [630, 262], [700, 338]], [[440, 404], [544, 436], [634, 404], [700, 338]]] },
        { id: 'B', label: 'WEST BREAK', pts: [[28, 180], [132, 196], [228, 232], [318, 266]],
          branches: [[[412, 196], [520, 168], [616, 222], [700, 338]], [[416, 318], [524, 306], [616, 318], [700, 338]]] },
        { id: 'C', label: 'SOUTHWEST FALL', pts: [[28, 520], [136, 516], [240, 486], [334, 452]],
          branches: [[[430, 382], [534, 362], [622, 362], [700, 338]], [[432, 500], [546, 516], [640, 458], [700, 338]]] },
        { id: 'D', label: 'SOUTH RISE', pts: [[560, 586], [566, 520], [500, 466], [520, 402]],
          branches: [[[604, 440], [676, 420], [700, 338]], [[610, 362], [664, 330], [700, 338]]] }
      ],
      pads: [[150, 110], [150, 330], [158, 440], [240, 170], [244, 380], [250, 574],
        [360, 120], [366, 240], [372, 352], [376, 486], [478, 110], [482, 258],
        [486, 382], [490, 540], [586, 150], [590, 266], [594, 486], [596, 556],
        [690, 180], [694, 470]],
      hazards: [{ type: 'rift', x: 520, y: 338, r: 72 }, { type: 'rift', x: 380, y: 178, r: 54 },
        { type: 'well', x: 620, y: 430, r: 60 }],
      landmarks: [{ t: 'spire', x: 700, y: 338 }, { t: 'bridge', x: 208, y: 320 },
        { t: 'beacon', x: 452, y: 208 }, { t: 'beacon', x: 470, y: 470 }, { t: 'mast', x: 620, y: 120 }]
    }
  ];
  C.mapIndex = function (i) {
    i = Number(i);
    if (!Number.isFinite(i)) return 0;
    i = Math.floor(i);
    return i < 0 ? 0 : (i >= C.MAPS.length ? C.MAPS.length - 1 : i);
  };
  C.mapDef = function (i) { return C.MAPS[C.mapIndex(i)]; };

  /* Full waypoint list for a lane on a chosen branch, plus arc lengths. */
  C.lanePath = function (lane, branch) {
    var pts = lane.pts.concat(lane.branches[branch ? 1 : 0]);
    var out = [];
    for (var i = 0; i < pts.length; i++) out.push({ x: pts[i][0], y: pts[i][1] });
    return out;
  };
  C.splitPoint = function (lane) {
    var p = lane.pts[lane.pts.length - 1];
    return { x: p[0], y: p[1] };
  };

  /* -------------------------------------------------------------- roster */
  C.ENEMIES = {
    shambler: { id: 'shambler', name: 'WALKER', short: 'W', hp: 34, speed: 34, radius: 10, reward: 1, damage: 7, accent: 0xb0c49a, tier: 'grunt' },
    runner: { id: 'runner', name: 'RUSHER', short: 'R', hp: 21, speed: 66, radius: 8, reward: 1, damage: 5, accent: 0xe8c98f, tier: 'grunt' },
    brute: { id: 'brute', name: 'BRUTE', short: 'B', hp: 112, speed: 18, radius: 15, reward: 3, damage: 15, accent: 0xef866e, tier: 'elite', armor: 2 },
    splitter: { id: 'splitter', name: 'SPLITTER', short: 'P', hp: 61, speed: 28, radius: 12, reward: 2, damage: 9, accent: 0xd59be8, tier: 'elite', splits: 'crawler' },
    carrier: { id: 'carrier', name: 'CARRIER', short: 'C', hp: 77, speed: 22, radius: 13, reward: 4, damage: 12, accent: 0x7ed8c4, tier: 'elite' },
    howler: { id: 'howler', name: 'HOWLER', short: 'H', hp: 95, speed: 26, radius: 13, reward: 3, damage: 10, accent: 0xf0a3c0, tier: 'elite', aura: 0.18 },
    crawler: { id: 'crawler', name: 'CRAWLER', short: 'c', hp: 14, speed: 82, radius: 6, reward: 0, damage: 3, accent: 0xd8c38c, tier: 'grunt' }
  };
  C.enemyDef = function (id) { return C.ENEMIES[id] || C.ENEMIES.shambler; };

  C.BOSSES = {
    tarmac: { id: 'tarmac', name: 'TARMAC', short: 'T', hp: 2600, speed: 16, radius: 26, reward: 30, damage: 45, accent: 0xef866e, tier: 'boss', armor: 5,
      line: 'Armour plate. Wear it down, do not tickle it.' },
    dredge: { id: 'dredge', name: 'DREDGE', short: 'D', hp: 3400, speed: 20, radius: 25, reward: 34, damage: 45, accent: 0x7ed8c4, tier: 'boss', regen: 14,
      line: 'It knits itself back together. Burst it or lose it.' },
    matron: { id: 'matron', name: 'MATRON', short: 'M', hp: 3800, speed: 18, radius: 26, reward: 38, damage: 50, accent: 0xd59be8, tier: 'boss', broodEvery: 3.1,
      line: 'She keeps the wards full. Cut the brood first.' },
    nullspire: { id: 'nullspire', name: 'NULLSPIRE', short: 'N', hp: 5200, speed: 22, radius: 28, reward: 46, damage: 60, accent: 0xcda1ff, tier: 'boss', slowImmune: true, phaseEvery: 8, phaseFor: 1.2,
      line: 'It phases out. Save the ordnance for when it is solid.' }
  };
  C.bossDef = function (id) { return C.BOSSES[id] || C.BOSSES.tarmac; };

  /* -------------------------------------------------------------- towers */
  C.TOWERS = {
    rifle: { id: 'rifle', key: '1', name: 'RIFLE NEST', short: 'RIF', glyph: 'rifle', cost: 5, range: 156, color: 0xf4c86b, css: '#f4c86b',
      role: 'Single target, cheap, always useful.', unlock: 0 },
    flame: { id: 'flame', key: '2', name: 'FLAME EMITTER', short: 'FLM', glyph: 'flame', cost: 7, range: 102, color: 0xff9d72, css: '#ff9d72',
      role: 'Short cone, burns crowds over time.', unlock: 12 },
    mortar: { id: 'mortar', key: '3', name: 'MORTAR', short: 'MTR', glyph: 'mortar', cost: 10, range: 216, minRange: 74, color: 0xcda1ff, css: '#cda1ff',
      role: 'Long blast, cannot hit close targets.', unlock: 2 },
    tesla: { id: 'tesla', key: '4', name: 'TESLA PYLON', short: 'TSL', glyph: 'tesla', cost: 12, range: 140, color: 0x72d6ff, css: '#72d6ff',
      role: 'Chains between packed bodies.', unlock: 6 },
    med: { id: 'med', key: '5', name: 'MED STATION', short: 'MED', glyph: 'med', cost: 8, range: 168, color: 0x8ce3c4, css: '#8ce3c4',
      role: 'Repairs the core, speeds nearby towers.', unlock: 20 }
  };
  C.TOWER_KEYS = ['rifle', 'flame', 'mortar', 'tesla', 'med'];
  C.towerDef = function (id) { return C.TOWERS[id] || C.TOWERS.rifle; };
  C.MAX_TOWER_LEVEL = 3;
  C.upgradeCost = function (level) { return 4 + level * 3; };

  /* Level-resolved combat numbers. base = facility multipliers. */
  C.towerStats = function (id, level, fac) {
    var d = C.towerDef(id);
    var range = d.range + level * 8;
    var out = { id: d.id, range: range, minRange: d.minRange || 0, cooldown: 0.5, damage: 0, radius: 0, chain: 0, dps: 0, repair: 0, burn: 0 };
    if (d.id === 'rifle') {
      out.damage = (12 + level * 7) * (1 + 0.08 * (fac.foundry || 0));
      out.cooldown = 0.48;
    } else if (d.id === 'flame') {
      out.dps = 26 + level * 12;
      out.burn = (6 + level * 2) * (1 + 0.12 * (fac.chemLab || 0));
      out.cooldown = 0.12;
    } else if (d.id === 'mortar') {
      out.damage = 26 + level * 10;
      out.radius = (30 + level * 6) * (1 + 0.08 * (fac.ordnance || 0));
      out.cooldown = 1.48;
    } else if (d.id === 'tesla') {
      out.damage = (10 + level * 5) * (1 + 0.1 * (fac.arcBay || 0));
      out.chain = 3 + ((fac.arcBay || 0) >= 2 ? 1 : 0);
      out.cooldown = 0.86;
    } else if (d.id === 'med') {
      out.repair = (1.6 + level * 0.8) * (1 + 0.15 * (fac.infirmary || 0));
      out.cooldown = 1;
    }
    return out;
  };

  /* ----------------------------------------------------------- abilities */
  C.ABILITIES = [
    { id: 'airstrike', key: 'Q', name: 'AIRSTRIKE', glyph: 'strike', cooldown: 26, targeted: true, radius: 92, damage: 90, unlock: 0,
      hint: 'Tap the board to call a strike.' },
    { id: 'barricade', key: 'E', name: 'BARRICADE', glyph: 'wall', cooldown: 20, targeted: true, duration: 14, unlock: 4,
      hint: 'Tap a fork to close its near branch.' },
    { id: 'emp', key: 'R', name: 'EMP', glyph: 'emp', cooldown: 34, targeted: false, stun: 2.4, damage: 40, unlock: 10,
      hint: 'Stuns everything on the board.' }
  ];
  C.abilityDef = function (id) {
    for (var i = 0; i < C.ABILITIES.length; i++) if (C.ABILITIES[i].id === id) return C.ABILITIES[i];
    return C.ABILITIES[0];
  };

  /* ---------------------------------------------------------- facilities */
  C.FACILITIES = [
    { id: 'commandPost', name: 'COMMAND POST', glyph: 'post', effect: 'Start each mission with 4 more scrap per level.' },
    { id: 'foundry', name: 'FOUNDRY', glyph: 'foundry', effect: 'Rifle nest damage plus 8 percent per level.' },
    { id: 'chemLab', name: 'CHEM LAB', glyph: 'chem', effect: 'Flame burn damage plus 12 percent per level.' },
    { id: 'arcBay', name: 'ARC BAY', glyph: 'arc', effect: 'Tesla damage plus 10 percent, extra chain target at level 2.' },
    { id: 'ordnance', name: 'ORDNANCE SHOP', glyph: 'ord', effect: 'Mortar blast radius plus 8 percent per level.' },
    { id: 'infirmary', name: 'INFIRMARY', glyph: 'inf', effect: 'Med station repair plus 15 percent per level.' },
    { id: 'wallWorks', name: 'WALL WORKS', glyph: 'wall', effect: 'Core integrity plus 20 per level.' },
    { id: 'radarMast', name: 'RADAR MAST', glyph: 'radar', effect: 'Full wave preview and 5 percent more scrap drops per level.' },
    { id: 'dronePad', name: 'DRONE PAD', glyph: 'drone', effect: 'Airstrike damage plus 20 percent, cooldown down 10 percent per level.' },
    { id: 'salvageYard', name: 'SALVAGE YARD', glyph: 'yard', effect: 'Mission salvage plus 10 percent per level.' }
  ];
  C.FACILITY_MAX = 3;
  C.FACILITY_COST = [40, 90, 160];
  C.facilityCost = function (level) { return C.FACILITY_COST[level] || 0; };
  C.facilityMap = function (levels) {
    var out = {};
    for (var i = 0; i < C.FACILITIES.length; i++) out[C.FACILITIES[i].id] = (levels && levels[i]) || 0;
    return out;
  };

  /* ---------------------------------------------------------- modifiers */
  C.MODIFIERS = {
    none: { id: 'none', name: 'CLEAR SKIES', short: '', desc: 'No field modifier.', count: 1, hp: 1, speed: 1, scrap: 1, spawn: 1, range: 1 },
    dense: { id: 'dense', name: 'DENSE HORDE', short: 'DENSE', desc: 'Twenty five percent more bodies per wave.', count: 1.25, hp: 1, speed: 1, scrap: 1, spawn: 1, range: 1 },
    armored: { id: 'armored', name: 'HARDENED', short: 'ARMOR', desc: 'Every infected has twenty percent more health.', count: 1, hp: 1.2, speed: 1, scrap: 1, spawn: 1, range: 1 },
    swift: { id: 'swift', name: 'SWIFT', short: 'SWIFT', desc: 'The horde moves fifteen percent faster.', count: 1, hp: 1, speed: 1.15, scrap: 1, spawn: 1, range: 1 },
    scarce: { id: 'scarce', name: 'SCARCE SUPPLY', short: 'SCARCE', desc: 'You start with far less scrap.', count: 1, hp: 1, speed: 1, scrap: 0.6, spawn: 1, range: 1 },
    surge: { id: 'surge', name: 'SURGE', short: 'SURGE', desc: 'Waves arrive on a tighter clock.', count: 1, hp: 1, speed: 1, scrap: 1, spawn: 0.72, range: 1 },
    fog: { id: 'fog', name: 'LOW VISIBILITY', short: 'FOG', desc: 'Tower range reduced ten percent.', count: 1, hp: 1, speed: 1, scrap: 1, spawn: 1, range: 0.9 }
  };
  C.modifierDef = function (id) { return C.MODIFIERS[id] || C.MODIFIERS.none; };

  /* ----------------------------------------------------------- sectors */
  C.SECTORS = [
    { id: 's1', name: 'HIGHWAY CHECKPOINT', map: 0, brief: 'Hold the interchange while the convoy loads.' },
    { id: 's2', name: 'FLOODED DOCKS', map: 1, brief: 'The tide bought us time. It did not buy us much.' },
    { id: 's3', name: 'QUARANTINE HOSPITAL', map: 2, brief: 'Corridors, corners, and whatever is left in the wards.' },
    { id: 's4', name: 'THE VERGE', map: 3, brief: 'Where it started. Close it or nothing else matters.' }
  ];

  /* ---------------------------------------------------------- campaign */
  function mission(n, sector, name, waves, modifier, threat, boss) {
    return { n: n, index: n - 1, sector: sector, map: C.SECTORS[sector - 1].map, name: name,
      waves: waves, modifier: modifier, threat: threat, boss: boss || null };
  }
  C.MISSIONS = [
    mission(1, 1, 'COLD START', 8, 'none', 0),
    mission(2, 1, 'ROADBLOCK', 9, 'none', 1),
    mission(3, 1, 'OFF RAMP', 10, 'dense', 2),
    mission(4, 1, 'NIGHT HAUL', 11, 'swift', 3),
    mission(5, 1, 'FUEL LINE', 12, 'scarce', 4),
    mission(6, 1, 'TARMAC', 12, 'none', 5, 'tarmac'),
    mission(7, 2, 'HIGH WATER', 11, 'none', 6),
    mission(8, 2, 'PIER SEVEN', 12, 'dense', 7),
    mission(9, 2, 'SALT AND RUST', 12, 'armored', 8),
    mission(10, 2, 'TIDE SHIFT', 13, 'surge', 9),
    mission(11, 2, 'DEAD TONNAGE', 14, 'scarce', 10),
    mission(12, 2, 'DREDGE', 14, 'none', 11, 'dredge'),
    mission(13, 3, 'TRIAGE', 13, 'none', 12),
    mission(14, 3, 'WARD NINE', 14, 'fog', 13),
    mission(15, 3, 'COLD STORAGE', 14, 'armored', 14),
    mission(16, 3, 'STAIRWELL', 15, 'swift', 15),
    mission(17, 3, 'BLACKOUT', 16, 'fog', 16),
    mission(18, 3, 'MATRON', 16, 'dense', 17, 'matron'),
    mission(19, 4, 'THRESHOLD', 15, 'none', 18),
    mission(20, 4, 'SPIRE FALL', 16, 'dense', 19),
    mission(21, 4, 'GRAVITY DEBT', 17, 'surge', 20),
    mission(22, 4, 'LAST RELAY', 18, 'armored', 21),
    mission(23, 4, 'NULL FIELD', 18, 'scarce', 22),
    mission(24, 4, 'NULLSPIRE', 20, 'swift', 23, 'nullspire')
  ];
  C.MISSION_COUNT = C.MISSIONS.length;
  C.missionIndex = function (i) {
    i = Number(i);
    if (!Number.isFinite(i)) return 0;
    i = Math.floor(i);
    return i < 0 ? 0 : (i >= C.MISSIONS.length ? C.MISSIONS.length - 1 : i);
  };
  C.missionDef = function (i) { return C.MISSIONS[C.missionIndex(i)]; };

  /* Medals: 1 clear, 2 clear with core at or above 60 percent, 3 flawless. */
  C.medalFor = function (coreHp, coreMax) {
    if (coreHp <= 0) return 0;
    if (coreHp >= coreMax) return 3;
    return coreHp / coreMax >= 0.6 ? 2 : 1;
  };
  C.MEDAL_TOTAL = C.MISSIONS.length * 3;

  C.salvageFor = function (def, medal, yardLevel) {
    var base = 18 + def.waves * 2 + medal * 14;
    return Math.round(base * (1 + 0.1 * (yardLevel || 0)));
  };
  C.endlessSalvage = function (wavesSurvived) { return Math.max(0, Math.floor(wavesSurvived * 3)); };

  /* --------------------------------------------------------- wave build */
  C.waveComposition = function (effWave, mod) {
    var m = C.modifierDef(mod);
    var counts = {
      shambler: Math.min(7 + Math.floor(effWave * 0.76), 26),
      runner: effWave >= 2 ? Math.min(1 + Math.floor(effWave / 3), 9) : 0,
      brute: effWave >= 4 ? Math.min(1 + Math.floor((effWave - 4) / 5), 5) : 0,
      splitter: effWave >= 8 ? Math.min(1 + Math.floor((effWave - 8) / 5), 4) : 0,
      carrier: effWave >= 14 ? Math.min(1 + Math.floor((effWave - 14) / 5), 3) : 0,
      howler: effWave >= 18 ? Math.min(1 + Math.floor((effWave - 18) / 6), 3) : 0
    };
    var order = ['shambler', 'runner', 'brute', 'splitter', 'carrier', 'howler'];
    var labels = [], total = 0, i, k, v;
    for (i = 0; i < order.length; i++) {
      k = order[i];
      v = Math.round(counts[k] * m.count);
      counts[k] = v;
      if (v > 0) { labels.push({ type: k, count: v }); total += v; }
    }
    return { counts: counts, labels: labels, total: total };
  };

  /* Deterministic per-wave spawn queue. Lanes are dealt round robin from a
   * seeded shuffle so a replayed wave is identical. */
  C.buildWave = function (def, waveNo, laneCount, isFinal) {
    var mod = C.modifierDef(def.modifier);
    var effWave = waveNo + (def.threat || 0);
    var comp = C.waveComposition(effWave, def.modifier);
    var types = [], i, j, e;
    for (i = 0; i < comp.labels.length; i++) {
      e = comp.labels[i];
      for (j = 0; j < e.count; j++) types.push(e.type);
    }
    var seed = ((def.n || 1) * 7919 + waveNo * 47 + 9) >>> 0;
    var value = (seed * 1103515245 + 12345) >>> 0;
    for (i = types.length - 1; i > 0; i--) {
      value = (value * 1664525 + 1013904223) >>> 0;
      j = value % (i + 1);
      var tmp = types[i]; types[i] = types[j]; types[j] = tmp;
    }
    var queue = [];
    for (i = 0; i < types.length; i++) {
      var d = C.enemyDef(types[i]);
      queue.push({
        type: types[i], lane: i % laneCount, boss: false,
        delay: (i === 0 ? 0.65 : 0.42 + (d.tier === 'elite' ? 0.12 : 0)) * mod.spawn
      });
    }
    if (isFinal && def.boss) {
      queue.push({ type: def.boss, lane: Math.floor(laneCount / 2), boss: true, delay: 1.6 });
      comp.labels.push({ type: def.boss, count: 1, boss: true });
      comp.total += 1;
    }
    return { wave: waveNo, effWave: effWave, queue: queue, labels: comp.labels, total: comp.total, hpScale: mod.hp * (1 + Math.max(0, effWave - 1) * 0.018), speedScale: mod.speed };
  };

  /* Endless siege: no mission table, threat climbs forever. */
  C.endlessDef = function (mapIdx) {
    return { n: 900 + mapIdx, index: -1, sector: 0, map: mapIdx, name: 'ENDLESS SIEGE',
      waves: 9999, modifier: 'none', threat: 0, boss: null, endless: true };
  };

  /* --------------------------------------------------------- unlocking */
  C.unlockedTowers = function (medals) {
    var out = [];
    for (var i = 0; i < C.TOWER_KEYS.length; i++) {
      var d = C.TOWERS[C.TOWER_KEYS[i]];
      if (medals >= d.unlock) out.push(d.id);
    }
    return out;
  };
  C.unlockedAbilities = function (medals) {
    var out = [];
    for (var i = 0; i < C.ABILITIES.length; i++) if (medals >= C.ABILITIES[i].unlock) out.push(C.ABILITIES[i].id);
    return out;
  };
  C.nextUnlock = function (medals) {
    var best = null, i, d;
    for (i = 0; i < C.TOWER_KEYS.length; i++) {
      d = C.TOWERS[C.TOWER_KEYS[i]];
      if (d.unlock > medals && (!best || d.unlock < best.at)) best = { at: d.unlock, name: d.name };
    }
    for (i = 0; i < C.ABILITIES.length; i++) {
      d = C.ABILITIES[i];
      if (d.unlock > medals && (!best || d.unlock < best.at)) best = { at: d.unlock, name: d.name };
    }
    return best;
  };

  /* --------------------------------------------------------------- save */
  C.newProfile = function () {
    return {
      v: C.VERSION, medals: new Array(C.MISSIONS.length).fill(0),
      facilities: new Array(C.FACILITIES.length).fill(0),
      salvage: 0, best: 0, bestWave: 0, tutorialDone: false, lastMission: 0, seen: 0
    };
  };
  C.validProfile = function (o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    if (o.v !== C.VERSION) return false;
    if (!Array.isArray(o.medals) || o.medals.length !== C.MISSIONS.length) return false;
    if (!Array.isArray(o.facilities) || o.facilities.length !== C.FACILITIES.length) return false;
    var i;
    for (i = 0; i < o.medals.length; i++) if (!Number.isInteger(o.medals[i]) || o.medals[i] < 0 || o.medals[i] > 3) return false;
    for (i = 0; i < o.facilities.length; i++) if (!Number.isInteger(o.facilities[i]) || o.facilities[i] < 0 || o.facilities[i] > C.FACILITY_MAX) return false;
    if (!Number.isInteger(o.salvage) || o.salvage < 0 || o.salvage > 9999999) return false;
    if (!Number.isInteger(o.best) || o.best < 0 || o.best > 999999999) return false;
    if (!Number.isInteger(o.bestWave) || o.bestWave < 0 || o.bestWave > 9999) return false;
    if (!Number.isInteger(o.lastMission) || o.lastMission < 0 || o.lastMission >= C.MISSIONS.length) return false;
    if (!Number.isInteger(o.seen) || o.seen < 0 || o.seen > 9999) return false;
    if (typeof o.tutorialDone !== 'boolean') return false;
    return true;
  };
  C.totalMedals = function (profile) {
    var t = 0;
    for (var i = 0; i < profile.medals.length; i++) t += profile.medals[i];
    return t;
  };
  C.missionUnlocked = function (profile, index) {
    if (index <= 0) return true;
    return profile.medals[index - 1] > 0;
  };
  C.highestUnlocked = function (profile) {
    for (var i = 0; i < profile.medals.length; i++) if (profile.medals[i] === 0) return i;
    return profile.medals.length - 1;
  };

  /* ------------------------------------------------------------ tutorial */
  C.TUTORIAL = [
    'Tap a socket to preview a rifle nest, tap it again to build.',
    'Steer Vane with the left stick or WASD. He picks up scrap.',
    'Watch the wave preview on the right, then press CALL IN to start early.',
    'Tap AIRSTRIKE, then tap the board where the horde bunches up.'
  ];

  root.VergeContent = C;
})(typeof window !== 'undefined' ? window : globalThis);
