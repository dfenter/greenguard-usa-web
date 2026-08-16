/* Warring Banners - deterministic tactics simulation.
 * Pure logic: hex geometry, terrain, rosters, combat math, objectives, AI.
 * No rendering, no DOM, no storage. game.js owns every pixel and GGKit owns
 * lifecycle, input, audio and saves.
 */
'use strict';

(function (root) {
  var E = {};
  E.VERSION = 3;

  // ------------------------------------------------------------- geometry
  var DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  E.DIRS = DIRS;
  E.key = function (q, r) { return q + ',' + r; };
  E.dist = function (aq, ar, bq, br) {
    var dq = aq - bq, dr = ar - br;
    return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
  };
  E.neighbors = function (q, r) {
    var o = [];
    for (var i = 0; i < 6; i++) o.push([q + DIRS[i][0], r + DIRS[i][1]]);
    return o;
  };
  // pointy-top axial layout, s = hex radius
  E.toPix = function (q, r, s) {
    return { x: s * Math.sqrt(3) * (q + r / 2), y: s * 1.5 * r };
  };
  E.fromPix = function (x, y, s) {
    var q = (Math.sqrt(3) / 3 * x - y / 3) / s;
    var r = (2 / 3 * y) / s;
    return E.round(q, r);
  };
  E.round = function (q, r) {
    var x = q, z = r, y = -x - z;
    var rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    var dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy > dz) ry = -rx - rz;
    else rz = -rx - ry;
    return { q: rx, r: rz };
  };
  E.corners = function (cx, cy, s) {
    var pts = [];
    for (var i = 0; i < 6; i++) {
      var a = Math.PI / 180 * (60 * i - 30);
      pts.push([cx + s * Math.cos(a), cy + s * Math.sin(a)]);
    }
    return pts;
  };
  E.rng = function (seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  E.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };

  // -------------------------------------------------------------- terrain
  /* def is the defender multiplier carried over from the prototype tuning:
   * forest 1.35, hill 1.25, ford 0.85, keep and gate 1.90. */
  E.TERR = {
    plain:   { name: 'Plain',   cost: 1, def: 1.00, elev: 0, pass: true },
    road:    { name: 'Road',    cost: 1, def: 0.95, elev: 0, pass: true },
    terrace: { name: 'Terrace', cost: 2, def: 1.10, elev: 1, pass: true },
    forest:  { name: 'Forest',  cost: 2, def: 1.35, elev: 0, pass: true },
    hill:    { name: 'Hill',    cost: 2, def: 1.25, elev: 1, pass: true },
    marsh:   { name: 'Marsh',   cost: 3, def: 0.90, elev: 0, pass: true },
    ford:    { name: 'Ford',    cost: 2, def: 0.85, elev: 0, pass: true },
    water:   { name: 'River',   cost: 99, def: 1.00, elev: 0, pass: false },
    peak:    { name: 'Crag',    cost: 99, def: 1.00, elev: 2, pass: false },
    wall:    { name: 'Wall',    cost: 99, def: 1.90, elev: 1, pass: false },
    gate:    { name: 'Gate',    cost: 2, def: 1.90, elev: 1, pass: true },
    keep:    { name: 'Keep',    cost: 1, def: 1.90, elev: 1, pass: true }
  };
  E.terrOf = function (id) { return E.TERR[id] || E.TERR.plain; };

  E.WEATHER = {
    clear: { id: 'clear', name: 'Clear', icon: 'sun', note: 'Clear skies. No penalty.' },
    rain:  { id: 'rain', name: 'Rain', icon: 'rain', note: 'Mud slows soft ground by one point.' },
    snow:  { id: 'snow', name: 'Snow', icon: 'snow', note: 'Snow costs every banner one move point.' },
    wind:  { id: 'wind', name: 'Wind', icon: 'wind', note: 'Crosswind shortens bow range by one hex.' }
  };
  E.weatherOf = function (id) { return E.WEATHER[id] || E.WEATHER.clear; };

  // --------------------------------------------------------------- units
  /* Counter triangle preserved from the prototype: 1.50 into the beaten
   * class, 0.75 into the class that beats you. */
  E.UNITS = {
    spear: {
      id: 'spear', name: 'Spear', short: 'SPR', cost: 4, hp: 32, atk: 9, mv: 4,
      rmin: 1, rmax: 1, beats: 'cav', role: 'line',
      blurb: 'Holds ground and breaks cavalry.'
    },
    cav: {
      id: 'cav', name: 'Cavalry', short: 'CAV', cost: 5, hp: 30, atk: 11, mv: 6,
      rmin: 1, rmax: 1, beats: 'bow', role: 'shock', charge: 1.25,
      blurb: 'Charges from three hexes out for extra weight.'
    },
    bow: {
      id: 'bow', name: 'Archer', short: 'BOW', cost: 5, hp: 24, atk: 8, mv: 3,
      rmin: 1, rmax: 2, beats: 'spear', role: 'ranged',
      blurb: 'Strikes at two hexes and takes no answer there.'
    },
    siege: {
      id: 'siege', name: 'Siege', short: 'SGE', cost: 6, hp: 28, atk: 7, mv: 2,
      rmin: 2, rmax: 3, immobileFire: true, vsStruct: 2.5, role: 'siege',
      blurb: 'Cannot fire after moving. Shatters gates and walls.'
    },
    healer: {
      id: 'healer', name: 'Physician', short: 'PHY', cost: 4, hp: 24, atk: 4, mv: 4,
      rmin: 1, rmax: 1, heal: 9, role: 'support',
      blurb: 'Mends an adjacent banner instead of striking.'
    },
    general: {
      id: 'general', name: 'General', short: 'GEN', cost: 0, hp: 46, atk: 10, mv: 5,
      rmin: 1, rmax: 1, aura: 1.12, role: 'command',
      blurb: 'Commands the tactic cards. If the general falls, the field is lost.'
    },
    convoy: {
      id: 'convoy', name: 'Convoy', short: 'CNV', cost: 0, hp: 30, atk: 0, mv: 4,
      rmin: 0, rmax: 0, role: 'cargo',
      blurb: 'Grain carts. They cannot fight, only run.'
    },
    gatehouse: {
      id: 'gatehouse', name: 'Gatehouse', short: 'GTE', cost: 0, hp: 52, atk: 6, mv: 0,
      rmin: 1, rmax: 2, structure: true, role: 'structure',
      blurb: 'Barred timber and stone. Siege engines answer it best.'
    },
    watchtower: {
      id: 'watchtower', name: 'Watchtower', short: 'TWR', cost: 0, hp: 40, atk: 7, mv: 0,
      rmin: 1, rmax: 3, structure: true, role: 'structure',
      blurb: 'Shoots anything that crosses the open ground below.'
    }
  };
  E.unitOf = function (id) { return E.UNITS[id] || E.UNITS.spear; };
  E.PICKABLE = ['spear', 'cav', 'bow', 'siege', 'healer'];

  // ------------------------------------------------------------ generals
  E.GENERALS = [
    { id: 'wren', name: 'Wren Ashvale', title: 'the Steady', unlock: 0, cards: ['rally', 'ambush', 'shieldwall'], passive: 'guard', passiveText: 'Adjacent banners take one tenth less damage.' },
    { id: 'oda', name: 'Oda Keshin', title: 'the Spear Saint', unlock: 1, cards: ['ambush', 'forcedmarch', 'warcry'], passive: 'spear', passiveText: 'Spears in the army strike five percent harder.' },
    { id: 'lira', name: 'Lira Fenmoor', title: 'of the Long Volley', unlock: 3, cards: ['volley', 'rally', 'ambush'], passive: 'bow', passiveText: 'Archers gain one hex of range.' },
    { id: 'garr', name: 'Garrick Vole', title: 'the Wallbreaker', unlock: 5, cards: ['fireattack', 'forcedmarch', 'shieldwall'], passive: 'siege', passiveText: 'Siege engines fire the turn they move.' },
    { id: 'sena', name: 'Sena Ruhl', title: 'the Outrider', unlock: 8, cards: ['forcedmarch', 'ambush', 'feint'], passive: 'cav', passiveText: 'Cavalry keep one extra move point.' },
    { id: 'moss', name: 'Moss Ferrant', title: 'the Field Surgeon', unlock: 11, cards: ['rally', 'shieldwall', 'volley'], passive: 'heal', passiveText: 'Physicians mend four more health.' },
    { id: 'kyre', name: 'Kyre Danlow', title: 'the Ambusher', unlock: 14, cards: ['ambush', 'feint', 'fireattack'], passive: 'forest', passiveText: 'Your banners in forest take one fifth less damage.' },
    { id: 'imra', name: 'Imra Solheim', title: 'Marshal of the Plain', unlock: 17, cards: ['warcry', 'rally', 'volley'], passive: 'aura', passiveText: 'The command aura reaches three hexes.' }
  ];
  E.generalOf = function (id) {
    for (var i = 0; i < E.GENERALS.length; i++) if (E.GENERALS[i].id === id) return E.GENERALS[i];
    return E.GENERALS[0];
  };

  // -------------------------------------------------------- tactic cards
  E.CARDS = {
    rally:       { id: 'rally', name: 'Rally', unlock: 0, target: 'none', icon: 'rally', text: 'Nearby banners mend 7 and gain a move point.' },
    ambush:      { id: 'ambush', name: 'Ambush', unlock: 1, target: 'none', icon: 'ambush', text: 'Your next strike this turn hits half again and draws no answer.' },
    volley:      { id: 'volley', name: 'Volley', unlock: 3, target: 'enemy', icon: 'volley', text: 'Every archer in range fires at one target at once.' },
    fireattack:  { id: 'fireattack', name: 'Fire Attack', unlock: 5, target: 'hex', icon: 'fire', text: 'Set a hex alight. Six damage there and around it, and the ground burns.' },
    forcedmarch: { id: 'forcedmarch', name: 'Forced March', unlock: 8, target: 'none', icon: 'march', text: 'Every banner gains two move points this turn.' },
    shieldwall:  { id: 'shieldwall', name: 'Shield Wall', unlock: 11, target: 'none', icon: 'shield', text: 'Your banners take a third less damage until your next turn.' },
    feint:       { id: 'feint', name: 'Feint', unlock: 14, target: 'enemy', icon: 'feint', text: 'Drag one enemy a hex out of position and end its turn.' },
    warcry:      { id: 'warcry', name: 'War Cry', unlock: 17, target: 'none', icon: 'warcry', text: 'Enemies near your general strike a quarter weaker for a turn.' }
  };
  E.cardOf = function (id) { return E.CARDS[id] || E.CARDS.rally; };
  E.CARD_ORDER = ['rally', 'ambush', 'volley', 'fireattack', 'forcedmarch', 'shieldwall', 'feint', 'warcry'];

  // ------------------------------------------------------------ provinces
  E.PROVINCES = [
    {
      id: 'fords', name: 'River Fords', motif: 'terraces and braided water',
      sky: ['#123043', '#1d4a5c'], ground: '#3f5340', accent: '#4f7f7a',
      landmarks: ['ford posts', 'rice terraces', 'wading cranes']
    },
    {
      id: 'passes', name: 'Mountain Passes', motif: 'crags, switchbacks and snow',
      sky: ['#1a2434', '#33465e'], ground: '#4a5160', accent: '#8fa6bd',
      landmarks: ['crag spires', 'cairn stacks', 'pass banners']
    },
    {
      id: 'city', name: 'Walled City', motif: 'gates, streets and siege lines',
      sky: ['#2a1c22', '#4a3030'], ground: '#5a4a3d', accent: '#c78a4c',
      landmarks: ['gatehouses', 'tile roofs', 'street lanterns']
    },
    {
      id: 'plain', name: 'Imperial Plain', motif: 'open grass, roads and banner poles',
      sky: ['#20303a', '#3c5a54'], ground: '#57683f', accent: '#e0a34a',
      landmarks: ['banner poles', 'stone road', 'imperial keep']
    }
  ];

  /* Authored maps. 13 columns by 9 rows, offset rows folded into axial by
   * q = col - floor(row / 2). Legend:
   *   . plain   - road    , terrace  f forest  h hill   ^ crag
   *   ~ river   = ford    m marsh    # wall    G gate   K keep
   *   P player deploy (plain)   A enemy deploy (plain)
   *   O objective zone (plain)  X exit hex (road)
   *   space = off map
   */
  E.MAPS = {
    ford_crossing: {
      id: 'ford_crossing', prov: 0, name: 'Shallow Ford',
      rows: [
        'PP,.f~...f.hA',
        'PP.,.=..A.f.A',
        'PP,..~.A.f..A',
        'PP.,.=.AA..hA',
        'PP,.f~..A.f.A',
        'PP.,.=.A..h.A',
        'PP,.f~..f...A',
        'P..,.=...f.hA',
        'P.,..~..h...A'
      ]
    },
    braided_delta: {
      id: 'braided_delta', prov: 0, name: 'Braided Delta',
      rows: [
        'PPm~..m..~.fA',
        'PP=..~.=..A.A',
        'PP.m.=...m.AA',
        'PP~..m.=..AAA',
        'PP=..f.~..A.A',
        'PP.m.=..m.A.A',
        'PP~..,.=..f.A',
        'P.=..,..~.m.A',
        'P.~..,...=.fA'
      ]
    },
    terrace_climb: {
      id: 'terrace_climb', prov: 0, name: 'Terrace Climb',
      rows: [
        'PP,h.~..h,,fA',
        'PP,,.=.,,.A.A',
        'PP.,h~.h,.A.A',
        'PP,,.=.,,AA.A',
        'PP,,h~.h,.A.A',
        'PP.,.=.,,.A.A',
        'PP,,h~.h,,f.A',
        'P.,.h=.,,.h.A',
        'P.,,.~.,,h..A'
      ]
    },
    stone_throat: {
      id: 'stone_throat', prov: 1, name: 'Stone Throat',
      rows: [
        '^^^h....h^^^^',
        'PP.h.--..h.^A',
        'PP..h-..h..AA',
        'PP...--..hAAA',
        'PP.h.--.h..AA',
        'PP..h--..h.AA',
        'PP..h-..h.^^A',
        '^^^h.--.h^^^^',
        '^^^^h..h^^^^^'
      ]
    },
    switchback: {
      id: 'switchback', prov: 1, name: 'Switchback Road',
      rows: [
        '^^h..----..h^',
        'PP.h..--.h.AA',
        'PP..hh-.hh.AA',
        'PP..--..--AAA',
        'PP.hh--hh..AA',
        'PP.h..--..hAA',
        'PP..hh--hh.AA',
        '^^h..----..h^',
        '^^^h......h^^'
      ]
    },
    ridge_camp: {
      id: 'ridge_camp', prov: 1, name: 'Ridge Camp',
      rows: [
        '^^h.h..h.h^^^',
        'PP..hhhhh..AA',
        'PP.h.hOh.h.AA',
        'PP..hOOOh.AAA',
        'PP.hhOOOhh.AA',
        'PP..hOOOh.AAA',
        'PP.h.hOh.h.AA',
        'P...hhhhh..AA',
        '^^h.....h.^^^'
      ]
    },
    outer_wall: {
      id: 'outer_wall', prov: 2, name: 'Outer Wall',
      rows: [
        'PP.f.###G###A',
        'PP...#..-..AA',
        'PP..-#..-.AAA',
        'PP...G--.--AA',
        'PP..-#..-..AA',
        'PP...#..-.AAA',
        'PP.f.###G###A',
        'P.h..#.....AA',
        'P....###.####'
      ]
    },
    street_maze: {
      id: 'street_maze', prov: 2, name: 'Lantern Streets',
      rows: [
        'PP...##.##.AA',
        'PP-.##..-##AA',
        'PP-..-..-..AA',
        'PP-##-.##-.AA',
        'PP--.-..-..AA',
        'PP-##-.##-.AA',
        'PP-..-..-..AA',
        'P--.##..##.AA',
        'P-...#.-.#.AA'
      ]
    },
    citadel: {
      id: 'citadel', prov: 2, name: 'Citadel Keep',
      rows: [
        'PP.#####.A...',
        'PP#..---.#AA.',
        'PP..#####.AAA',
        'PP-.#KKK#.GAA',
        'PP.-GKKK#--AA',
        'PP-.#KKK#.GAA',
        'PP..#####.AAA',
        'PP#..---.#AA.',
        'PP.#####.A...'
      ]
    },
    open_plain: {
      id: 'open_plain', prov: 3, name: 'Open Plain',
      rows: [
        'PP.f...-...fA',
        'PP..h..-..A.A',
        'PP.....-..AAA',
        'PP..f..----AA',
        'PP.h...-..A.A',
        'PP.....-.hAAA',
        'PP.f.h.-..A.A',
        'P.h....-...fA',
        'P......-.h..A'
      ]
    },
    banner_field: {
      id: 'banner_field', prov: 3, name: 'Field of Banners',
      rows: [
        'PP.f.--..f.hA',
        'PP.O..-..O.AA',
        'PP..-----..AA',
        'PP.O..-..OAAA',
        'PP.h-----.hAA',
        'PP.O..-..O.AA',
        'PP.f-----..fA',
        'P.....-....hA',
        'P...f.-.f...A'
      ]
    },
    imperial_gate: {
      id: 'imperial_gate', prov: 3, name: 'Imperial Gate',
      rows: [
        'PP.f.###G###.',
        'PP..--#KKK#A.',
        'PP..-.#KKK#AA',
        'PP.--.G-K--AA',
        'PP..-.#KKK#AA',
        'PP..--#KKK#A.',
        'PP.f.###G###.',
        'P.h..--..--.A',
        'P.....---...A'
      ]
    }
  };

  E.mapOf = function (id) { return E.MAPS[id] || E.MAPS.open_plain; };

  var CHAR = {
    '.': 'plain', '-': 'road', ',': 'terrace', 'f': 'forest', 'h': 'hill',
    '^': 'peak', '~': 'water', '=': 'ford', 'm': 'marsh', '#': 'wall',
    'G': 'gate', 'K': 'keep', 'P': 'plain', 'A': 'plain', 'O': 'plain', 'X': 'road'
  };

  // ------------------------------------------------------------- battles
  /* objective kinds:
   *   rout   - break every enemy banner
   *   hold   - stand on the marked ground when the season clock runs out
   *   escort - walk the convoy off the far road
   *   siege  - break the gates, then stand in the keep
   */
  function B(id, prov, map, mirror, obj, weather, turns, budget, foes, name, brief) {
    return { id: id, prov: prov, map: map, mirror: !!mirror, obj: obj, weather: weather,
             turns: turns, budget: budget, foes: foes, name: name, brief: brief };
  }
  E.BATTLES = [
    B(1, 0, 'ford_crossing', 0, { kind: 'rout' }, 'clear', 12, 12, [['spear', 2], ['bow', 1]],
      'First Crossing', 'Two banners hold the far bank. Take the ford.'),
    B(2, 0, 'braided_delta', 0, { kind: 'rout' }, 'rain', 12, 14, [['spear', 2], ['bow', 1]],
      'Silt and Reeds', 'Mud slows the soft ground. Fords are the only clean road.'),
    B(3, 0, 'terrace_climb', 0, { kind: 'hold', need: 3, zone: 'terrace' }, 'clear', 10, 16, [['spear', 2], ['cav', 1]],
      'The Terraces', 'Stand on three terraces when the horns sound.'),
    B(4, 0, 'ford_crossing', 1, { kind: 'escort' }, 'rain', 11, 18, [['cav', 2], ['bow', 1]],
      'Grain Run', 'Walk the grain carts to the eastern road.'),
    B(5, 0, 'braided_delta', 1, { kind: 'rout' }, 'clear', 12, 20, [['spear', 2], ['bow', 1], ['cav', 1]],
      'Delta Warlord', 'The river lord fields a full army. Break it.'),

    B(6, 1, 'stone_throat', 0, { kind: 'rout' }, 'clear', 12, 20, [['spear', 2], ['bow', 1], ['cav', 1]],
      'Into the Throat', 'One road, high walls of stone. Nothing flanks here.'),
    B(7, 1, 'switchback', 0, { kind: 'escort' }, 'snow', 12, 21, [['cav', 2], ['bow', 1], ['spear', 1]],
      'Snow Convoy', 'Snow costs every banner a move point. Keep the carts moving.'),
    B(8, 1, 'ridge_camp', 0, { kind: 'hold', need: 4, zone: 'mark' }, 'wind', 11, 22, [['spear', 2], ['bow', 2]],
      'Ridge Camp', 'Hold four camp hexes. Crosswind clips the bows.'),
    B(9, 1, 'stone_throat', 1, { kind: 'rout' }, 'snow', 12, 23, [['spear', 2], ['cav', 1], ['bow', 1]],
      'Crag Ambush', 'They wait above the road. Come up anyway.'),
    B(10, 1, 'ridge_camp', 1, { kind: 'hold', need: 5, zone: 'mark' }, 'snow', 12, 24, [['spear', 2], ['bow', 2], ['cav', 1]],
      'Warden of the Pass', 'The pass warden wants the whole camp. Give none of it.'),

    B(11, 2, 'outer_wall', 0, { kind: 'siege' }, 'clear', 13, 24, [['bow', 2], ['spear', 1], ['struct:gatehouse', 2]],
      'Outer Wall', 'Break both gatehouses, then take the road behind them.'),
    B(12, 2, 'street_maze', 0, { kind: 'rout' }, 'rain', 12, 25, [['spear', 2], ['bow', 2]],
      'Lantern Streets', 'House to house. Cavalry are blind in these lanes.'),
    B(13, 2, 'outer_wall', 1, { kind: 'hold', need: 3, zone: 'road' }, 'clear', 11, 26, [['spear', 2], ['bow', 1], ['cav', 1], ['struct:watchtower', 1]],
      'Hold the Causeway', 'Hold three road hexes while the towers shoot.'),
    B(14, 2, 'street_maze', 1, { kind: 'escort' }, 'clear', 12, 27, [['bow', 2], ['spear', 2], ['cav', 1]],
      'Powder Run', 'Get the carts through the lanes to the far road.'),
    B(15, 2, 'citadel', 0, { kind: 'siege' }, 'wind', 14, 28, [['spear', 2], ['bow', 2], ['struct:gatehouse', 2]],
      'Citadel', 'Two gates, one keep, and a tower that sees everything.'),

    B(16, 3, 'open_plain', 0, { kind: 'rout' }, 'clear', 12, 28, [['cav', 2], ['spear', 2], ['bow', 1]],
      'Open Ground', 'No walls, no forest. Only formation.'),
    B(17, 3, 'banner_field', 0, { kind: 'hold', need: 4, zone: 'mark' }, 'wind', 12, 29, [['cav', 2], ['spear', 2], ['bow', 1]],
      'Field of Banners', 'Four banner poles. Stand under four of them.'),
    B(18, 3, 'open_plain', 1, { kind: 'escort' }, 'rain', 12, 30, [['cav', 2], ['bow', 2], ['spear', 1]],
      'Last Supply', 'Every rider on the plain wants these carts.'),
    B(19, 3, 'banner_field', 1, { kind: 'rout' }, 'clear', 12, 31, [['cav', 2], ['spear', 2], ['bow', 2]],
      'Marshal of the Plain', 'The imperial marshal answers in person.'),
    B(20, 3, 'imperial_gate', 0, { kind: 'siege' }, 'wind', 15, 32, [['spear', 2], ['bow', 2], ['cav', 2], ['healer', 1], ['struct:gatehouse', 2], ['struct:watchtower', 1]],
      'The Imperial Gate', 'The last gate of the season. Break it and the war ends.')
  ];

  E.SKIRMISH = [
    { map: 'ford_crossing', obj: 'rout' }, { map: 'terrace_climb', obj: 'hold' },
    { map: 'stone_throat', obj: 'rout' }, { map: 'street_maze', obj: 'escort' },
    { map: 'banner_field', obj: 'hold' }, { map: 'imperial_gate', obj: 'siege' }
  ];
  E.SKIRMISH_FOES = [
    [['spear', 2], ['bow', 1]],
    [['spear', 2], ['cav', 2], ['bow', 1]],
    [['spear', 3], ['bow', 2], ['cav', 1], ['healer', 1]],
    [['spear', 3], ['bow', 3], ['cav', 2], ['healer', 1], ['struct:watchtower', 1]]
  ];
  E.SKIRMISH_LEVELS = ['Skirmish', 'Contested', 'Warlord', 'Marshal'];

  E.battleOf = function (n) {
    var i = E.clamp((n | 0) - 1, 0, E.BATTLES.length - 1);
    return E.BATTLES[i];
  };

  // ------------------------------------------------------------ save data
  E.DEFAULT_ARMY = ['spear', 'spear', 'bow', 'cav', 'healer'];
  E.defaultSave = function () {
    return {
      v: E.VERSION, wins: 0, cleared: [], army: E.DEFAULT_ARMY.slice(),
      general: 'wren', tutorial: false, skirmish: 0, best: 0
    };
  };
  E.validSave = function (o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    if (o.v !== E.VERSION) return false;
    if (!Number.isInteger(o.wins) || o.wins < 0 || o.wins > E.BATTLES.length) return false;
    if (!Array.isArray(o.cleared) || o.cleared.length > E.BATTLES.length) return false;
    for (var i = 0; i < o.cleared.length; i++) {
      if (!Number.isInteger(o.cleared[i]) || o.cleared[i] < 1 || o.cleared[i] > E.BATTLES.length) return false;
    }
    if (!Array.isArray(o.army) || o.army.length < 1 || o.army.length > 5) return false;
    for (i = 0; i < o.army.length; i++) {
      if (E.PICKABLE.indexOf(o.army[i]) < 0) return false;
    }
    if (typeof o.general !== 'string') return false;
    var found = false;
    for (i = 0; i < E.GENERALS.length; i++) if (E.GENERALS[i].id === o.general) found = true;
    if (!found) return false;
    if (typeof o.tutorial !== 'boolean') return false;
    if (!Number.isInteger(o.skirmish) || o.skirmish < 0 || o.skirmish > 9999) return false;
    if (!Number.isInteger(o.best) || o.best < 0 || o.best > 9999999) return false;
    return true;
  };
  E.repairSave = function (o) {
    var d = E.defaultSave();
    if (!o || typeof o !== 'object' || Array.isArray(o)) return d;
    var out = d;
    if (Number.isInteger(o.wins)) out.wins = E.clamp(o.wins, 0, E.BATTLES.length);
    if (Array.isArray(o.cleared)) {
      out.cleared = [];
      for (var i = 0; i < o.cleared.length; i++) {
        var n = o.cleared[i];
        if (Number.isInteger(n) && n >= 1 && n <= E.BATTLES.length && out.cleared.indexOf(n) < 0) out.cleared.push(n);
      }
      out.wins = out.cleared.length;
    }
    if (Array.isArray(o.army)) {
      var army = [];
      for (i = 0; i < o.army.length && army.length < 5; i++) {
        if (E.PICKABLE.indexOf(o.army[i]) >= 0) army.push(o.army[i]);
      }
      if (army.length) out.army = army;
    }
    if (typeof o.general === 'string') {
      for (i = 0; i < E.GENERALS.length; i++) {
        if (E.GENERALS[i].id === o.general && E.GENERALS[i].unlock <= out.wins) out.general = o.general;
      }
    }
    out.tutorial = o.tutorial === true;
    if (Number.isInteger(o.skirmish)) out.skirmish = E.clamp(o.skirmish, 0, 9999);
    if (Number.isInteger(o.best)) out.best = E.clamp(o.best, 0, 9999999);
    return out;
  };
  E.unlockedGenerals = function (wins) {
    var out = [];
    for (var i = 0; i < E.GENERALS.length; i++) if (E.GENERALS[i].unlock <= wins) out.push(E.GENERALS[i]);
    return out;
  };
  E.unlockedCards = function (wins) {
    var out = [];
    for (var i = 0; i < E.CARD_ORDER.length; i++) {
      var c = E.cardOf(E.CARD_ORDER[i]);
      if (c.unlock <= wins) out.push(c.id);
    }
    return out;
  };
  E.handFor = function (generalId, wins) {
    var g = E.generalOf(generalId);
    var open = E.unlockedCards(wins), hand = [];
    for (var i = 0; i < g.cards.length; i++) {
      if (open.indexOf(g.cards[i]) >= 0) hand.push(g.cards[i]);
    }
    if (!hand.length) hand.push('rally');   // guarded fallback: never an empty hand
    return hand;
  };
  /* Trims a saved army down to the field budget for a given battle, so an
   * army carried forward from a later mission never overruns an early one. */
  E.affordable = function (army, budget) {
    var out = [], spent = 0;
    for (var i = 0; i < army.length; i++) {
      var c = E.unitOf(army[i]).cost;
      if (spent + c > budget) continue;
      out.push(army[i]); spent += c;
    }
    if (!out.length) out.push('spear');
    return out;
  };
  E.armyCost = function (army) {
    var n = 0;
    for (var i = 0; i < army.length; i++) n += E.unitOf(army[i]).cost;
    return n;
  };

  // ------------------------------------------------------- battle build
  function buildTiles(mapDef, mirror) {
    var tiles = [], byKey = {}, rows = mapDef.rows, marks = [], pDeploy = [], aDeploy = [], exits = [];
    for (var r = 0; r < rows.length; r++) {
      var line = rows[r];
      if (mirror) line = line.split('').reverse().join('');
      for (var c = 0; c < line.length; c++) {
        var ch = line.charAt(c);
        if (ch === ' ') continue;
        var terr = CHAR[ch] || 'plain';
        var q = c - Math.floor(r / 2);
        var t = {
          q: q, r: r, col: c, row: r, terr: terr,
          elev: E.terrOf(terr).elev, mark: ch === 'O', burn: 0, glyph: ch
        };
        tiles.push(t);
        byKey[E.key(q, r)] = t;
        if (ch === 'P') pDeploy.push(t);
        if (ch === 'A') aDeploy.push(t);
        if (ch === 'O') marks.push(t);
        if (ch === 'X') exits.push(t);
      }
    }
    return { tiles: tiles, byKey: byKey, marks: marks, pDeploy: pDeploy, aDeploy: aDeploy, exits: exits, mirror: !!mirror };
  }
  E.buildTiles = buildTiles;

  /* Veterancy is the campaign's persisted meta progression: every victory
   * hardens the standing army a little, and it shows on the roster screen. */
  E.veterancy = function (wins) {
    var w = E.clamp(wins || 0, 0, E.BATTLES.length);
    return { hp: 1 + 0.025 * w, atk: 1 + 0.015 * w, hpPct: Math.round(2.5 * w), atkPct: Math.round(1.5 * w) };
  };
  E.freeCellNear = function (b, tile) {
    if (!tile) return null;
    for (var rad = 0; rad < 6; rad++) {
      for (var i = 0; i < b.tiles.length; i++) {
        var t = b.tiles[i];
        if (E.dist(t.q, t.r, tile.q, tile.r) !== rad) continue;
        if (!E.terrOf(t.terr).pass) continue;
        if (E.unitAt(b, t.q, t.r)) continue;
        return t;
      }
    }
    return null;
  };
  /* Exits sit on the map edge the army is marching away from, so a mirrored
   * layout never spawns the convoy on top of its own goal. */
  E.pickExits = function (b, pd) {
    var avg = 0, i;
    for (i = 0; i < pd.length; i++) avg += pd[i].col;
    avg = pd.length ? avg / pd.length : 0;
    var far = avg < (b.cols - 1) / 2;
    var edge = null;
    for (i = 0; i < b.tiles.length; i++) {
      var t = b.tiles[i];
      if (!E.terrOf(t.terr).pass) continue;
      if (edge === null) edge = t.col;
      else edge = far ? Math.max(edge, t.col) : Math.min(edge, t.col);
    }
    var out = [];
    for (i = 0; i < b.tiles.length; i++) {
      var t2 = b.tiles[i];
      if (E.terrOf(t2.terr).pass && Math.abs(t2.col - edge) <= 1 && Math.abs(t2.col - avg) > 4) out.push(t2);
    }
    if (!out.length) {
      for (i = 0; i < b.tiles.length; i++) {
        var t3 = b.tiles[i];
        if (E.terrOf(t3.terr).pass && t3.col === edge) out.push(t3);
      }
    }
    return out;
  };

  function mkUnit(id, side, cls, q, r, scale, atkScale) {
    var d = E.unitOf(cls);
    var hp = Math.round(d.hp * (scale || 1));
    return {
      id: id, side: side, cls: cls, q: q, r: r,
      hp: hp, maxHp: hp, atkBase: Math.round(d.atk * (atkScale == null ? (scale || 1) : atkScale) * 10) / 10,
      mv: d.mv, mp: d.mv, acted: false, moved: 0, alive: true,
      pre: null, supplied: true, healUses: cls === 'healer' ? 99 : 0,
      structure: !!d.structure, shield: 0, weak: 0, burnHit: false
    };
  }

  function sortDeploy(list, side, rows) {
    var mid = (rows - 1) / 2;
    var out = list.slice();
    out.sort(function (a, b) {
      var da = Math.abs(a.row - mid), db = Math.abs(b.row - mid);
      if (da !== db) return da - db;
      if (a.col !== b.col) return side === 0 ? b.col - a.col : a.col - b.col;
      return a.row - b.row;
    });
    return out;
  }

  /* Creates a battle. spec:
   *  { battle: <BATTLES row>, army: [cls...], general: id, wins: n, mode }
   */
  E.createBattle = function (spec) {
    var def = spec.battle;
    var mapDef = E.mapOf(def.map);
    var t = buildTiles(mapDef, def.mirror);
    var prov = E.PROVINCES[E.clamp(def.prov, 0, E.PROVINCES.length - 1)];
    var nextId = 1;
    var b = {
      def: def, map: mapDef, prov: prov, mode: spec.mode || 'campaign',
      tiles: t.tiles, byKey: t.byKey, marks: t.marks, exits: t.exits,
      cols: mapDef.rows[0].length, rows: mapDef.rows.length,
      units: [], turn: 1, side: 0, phase: 'player', result: null,
      weather: E.weatherOf(def.weather), turnLimit: def.turns,
      objective: { kind: def.obj.kind, need: def.obj.need || 0, zone: def.obj.zone || 'mark', done: 0, gates: 0, gatesDown: 0 },
      cards: [], ambush: false, shieldTurns: 0, enemyWeak: 0,
      generalId: spec.general, wins: spec.wins || 0,
      events: [], log: '', kills: 0, losses: 0, score: 0
    };

    // player deploy: general first, then the picked army
    var pd = sortDeploy(t.pDeploy, 0, mapDef.rows.length);
    var vet = E.veterancy(spec.wins || 0);
    var fielded = E.affordable(spec.army.slice(0, 5), def.budget);
    b.fielded = fielded;
    var roster = ['general'].concat(fielded);
    var slot = 0, i;
    for (i = 0; i < roster.length && slot < pd.length; i++) {
      var cell = pd[slot++];
      b.units.push(mkUnit(nextId++, 0, roster[i], cell.q, cell.r, vet.hp, vet.atk));
    }
    if (def.obj.kind === 'escort') {
      var cc = slot < pd.length ? pd[slot++] : null;
      if (!cc) cc = E.freeCellNear(b, pd[0] || t.tiles[0]);
      if (cc) {
        var conv = mkUnit(nextId++, 0, 'convoy', cc.q, cc.r, 1);
        conv.convoy = true;
        b.units.push(conv);
      }
    }
    // the escort road runs to the far edge, measured from where the army stands
    b.exits = E.pickExits(b, pd);

    // enemy roster: province scaling keeps the ramp honest
    /* The ramp is mostly staying power. Enemy damage climbs far slower than
     * enemy health so late battles are longer, not lethal on contact. */
    var scale = 1 + 0.024 * (def.id - 1);
    var atkScale = 1 + 0.014 * (def.id - 1);
    if (b.mode === 'skirmish') {
      scale = 1 + 0.16 * (spec.level || 0);
      atkScale = 1 + 0.07 * (spec.level || 0);
    }
    // Captain is the default field difficulty; Veteran removes the handicap.
    b.difficulty = spec.difficulty === 'veteran' ? 'veteran' : 'captain';
    if (b.difficulty === 'captain') atkScale *= 0.8;
    var ad = sortDeploy(t.aDeploy, 1, mapDef.rows.length);
    var structCells = [];
    for (i = 0; i < t.tiles.length; i++) {
      if (t.tiles[i].terr === 'gate') structCells.push(t.tiles[i]);
    }
    var slotA = 0, sIdx = 0;
    for (i = 0; i < def.foes.length; i++) {
      var cls = def.foes[i][0], n = def.foes[i][1];
      for (var k = 0; k < n; k++) {
        if (cls.indexOf('struct:') === 0) {
          var scls = cls.slice(7);
          var scell = null;
          if (scls === 'gatehouse') scell = structCells[sIdx++] || null;
          if (!scell) {
            // watchtowers and spare gatehouses take the deepest enemy ground
            scell = ad[ad.length - 1 - (sIdx++ % Math.max(1, ad.length))] || null;
          }
          if (!scell) continue;
          if (E.unitAt(b, scell.q, scell.r)) continue;
          var su = mkUnit(nextId++, 1, scls, scell.q, scell.r, scale, atkScale);
          b.units.push(su);
          if (scls === 'gatehouse') b.objective.gates++;
        } else {
          if (slotA >= ad.length) slotA = 0;
          var cellA = ad[slotA++];
          var guard = 0;
          while (cellA && E.unitAt(b, cellA.q, cellA.r) && guard++ < ad.length) {
            if (slotA >= ad.length) slotA = 0;
            cellA = ad[slotA++];
          }
          if (!cellA || E.unitAt(b, cellA.q, cellA.r)) continue;
          b.units.push(mkUnit(nextId++, 1, cls, cellA.q, cellA.r, scale, atkScale));
        }
      }
    }
    // a rival general takes the field once the war leaves the fords
    if (def.id >= 5 || b.mode === 'skirmish') {
      var backs = ad.slice().reverse();
      for (i = 0; i < backs.length; i++) {
        if (!E.unitAt(b, backs[i].q, backs[i].r)) {
          b.units.push(mkUnit(nextId++, 1, 'general', backs[i].q, backs[i].r, scale, atkScale));
          break;
        }
      }
    }
    b.nextId = nextId;

    var hand = E.handFor(spec.general, spec.wins || 0);
    for (i = 0; i < hand.length; i++) b.cards.push({ id: hand[i], used: false });
    b.enemyCard = def.id >= 6 || b.mode === 'skirmish' ? { id: 'rally', used: false } : null;

    E.refreshSupply(b);
    E.beginTurn(b, 0, true);
    return b;
  };

  // --------------------------------------------------------- queries
  E.tileAt = function (b, q, r) { return b.byKey[E.key(q, r)] || null; };
  E.unitAt = function (b, q, r) {
    for (var i = 0; i < b.units.length; i++) {
      var u = b.units[i];
      if (u.alive && u.q === q && u.r === r) return u;
    }
    return null;
  };
  E.unitById = function (b, id) {
    for (var i = 0; i < b.units.length; i++) if (b.units[i].id === id) return b.units[i];
    return null;
  };
  E.side = function (b, s) {
    var out = [];
    for (var i = 0; i < b.units.length; i++) {
      var u = b.units[i];
      if (u.alive && u.side === s) out.push(u);
    }
    return out;
  };
  E.combatants = function (b, s) {
    var out = E.side(b, s), keep = [];
    for (var i = 0; i < out.length; i++) if (!out[i].convoy) keep.push(out[i]);
    return keep;
  };
  E.generalOfSide = function (b, s) {
    var list = E.side(b, s);
    for (var i = 0; i < list.length; i++) if (list[i].cls === 'general') return list[i];
    return null;
  };
  E.moveCost = function (b, tile, u) {
    var d = E.terrOf(tile.terr);
    if (!d.pass) return 99;
    var c = d.cost;
    if (b.weather.id === 'rain' && (tile.terr === 'plain' || tile.terr === 'forest' || tile.terr === 'terrace')) c += 1;
    if (u && u.cls === 'convoy' && tile.terr === 'road') c = 1;
    return c;
  };
  E.rangeOf = function (b, u) {
    var d = E.unitOf(u.cls);
    var rmax = d.rmax;
    if (u.cls === 'bow') {
      if (u.side === 0 && E.generalOf(b.generalId).passive === 'bow') rmax += 1;
      if (b.weather.id === 'wind') rmax -= 1;
      if (rmax < 1) rmax = 1;
    }
    return { min: d.rmin, max: rmax };
  };
  E.movePoints = function (b, u) {
    var mp = E.unitOf(u.cls).mv;
    if (u.side === 0 && u.cls === 'cav' && E.generalOf(b.generalId).passive === 'cav') mp += 1;
    if (b.weather.id === 'snow') mp -= 1;
    return Math.max(1, mp);
  };

  // supply: a banner cut off from every friend fights at 0.70 and starves,
  // the prototype's cut-off rule carried into the tactical layer.
  E.refreshSupply = function (b) {
    for (var i = 0; i < b.units.length; i++) {
      var u = b.units[i];
      if (!u.alive) continue;
      if (u.structure) { u.supplied = true; continue; }
      var ok = false;
      for (var j = 0; j < b.units.length && !ok; j++) {
        var o = b.units[j];
        if (!o.alive || o === u || o.side !== u.side) continue;
        if (E.dist(u.q, u.r, o.q, o.r) <= 3) ok = true;
      }
      u.supplied = ok;
    }
  };

  // ----------------------------------------------------------- movement
  E.zocAt = function (b, q, r, side) {
    for (var i = 0; i < b.units.length; i++) {
      var u = b.units[i];
      if (!u.alive || u.side === side || u.convoy) continue;
      if (E.dist(u.q, u.r, q, r) === 1) return true;
    }
    return false;
  };
  /* Dijkstra with zone of control: stepping next to an enemy ends the march. */
  E.reach = function (b, u) {
    var out = {}, from = {}, start = E.key(u.q, u.r);
    out[start] = u.mp; from[start] = null;
    if (u.mp <= 0 || u.structure) return { cells: {}, from: from, start: start };
    var open = [[u.q, u.r]];
    var guard = 0;
    while (open.length && guard++ < 4000) {
      var cur = open.shift();
      var ck = E.key(cur[0], cur[1]);
      var left = out[ck];
      if (left <= 0) continue;
      if (ck !== start && E.zocAt(b, cur[0], cur[1], u.side)) continue;
      var nb = E.neighbors(cur[0], cur[1]);
      for (var i = 0; i < 6; i++) {
        var t = E.tileAt(b, nb[i][0], nb[i][1]);
        if (!t) continue;
        var k = E.key(t.q, t.r);
        if (E.unitAt(b, t.q, t.r)) continue;
        var cost = E.moveCost(b, t, u);
        if (cost > left) continue;
        var rem = left - cost;
        if (out[k] === undefined || out[k] < rem) {
          out[k] = rem; from[k] = ck;
          open.push([t.q, t.r]);
        }
      }
    }
    var cells = {};
    for (var k2 in out) if (k2 !== start) cells[k2] = out[k2];
    return { cells: cells, from: from, start: start };
  };
  E.pathTo = function (rc, k) {
    var path = [], guard = 0;
    while (k && guard++ < 200) { path.push(k); k = rc.from[k]; }
    path.reverse();
    return path;
  };
  E.moveUnit = function (b, u, q, r, mpLeft, steps) {
    if (!u.pre) u.pre = { q: u.q, r: u.r, mp: u.mp, moved: u.moved };
    u.q = q; u.r = r; u.mp = Math.max(0, mpLeft);
    u.moved += steps || 0;
    E.refreshSupply(b);
    E.checkObjective(b);
  };
  E.undoMove = function (b, u) {
    if (!u.pre || u.acted) return false;
    u.q = u.pre.q; u.r = u.pre.r; u.mp = u.pre.mp; u.moved = u.pre.moved;
    u.pre = null;
    E.refreshSupply(b);
    E.checkObjective(b);
    return true;
  };

  // ------------------------------------------------------------- combat
  E.targetsFor = function (b, u) {
    var out = [];
    if (u.acted || u.convoy) return out;
    var d = E.unitOf(u.cls);
    if (d.immobileFire && u.moved > 0 && !(u.side === 0 && E.generalOf(b.generalId).passive === 'siege')) return out;
    var rg = E.rangeOf(b, u);
    for (var i = 0; i < b.units.length; i++) {
      var o = b.units[i];
      if (!o.alive || o.side === u.side) continue;
      var dd = E.dist(u.q, u.r, o.q, o.r);
      if (dd >= rg.min && dd <= rg.max) out.push(o);
    }
    return out;
  };
  E.healTargets = function (b, u) {
    var out = [];
    if (u.cls !== 'healer' || u.acted) return out;
    for (var i = 0; i < b.units.length; i++) {
      var o = b.units[i];
      if (!o.alive || o.side !== u.side || o === u || o.structure) continue;
      if (E.dist(u.q, u.r, o.q, o.r) <= 1 && o.hp < o.maxHp) out.push(o);
    }
    return out;
  };
  E.counterMul = function (a, d) {
    var A = E.unitOf(a), D = E.unitOf(d);
    if (A.beats && A.beats === d) return 1.5;
    if (D.beats && D.beats === a) return 0.75;
    return 1.0;
  };
  E.auraNear = function (b, u) {
    var g = E.generalOfSide(b, u.side);
    if (!g || g === u) return false;
    var reach = 2;
    if (u.side === 0 && E.generalOf(b.generalId).passive === 'aura') reach = 3;
    return E.dist(u.q, u.r, g.q, g.r) <= reach;
  };
  E.flankCount = function (b, atk, def) {
    var n = 0;
    for (var i = 0; i < b.units.length; i++) {
      var o = b.units[i];
      if (!o.alive || o === atk || o.side !== atk.side || o.convoy || o.structure) continue;
      if (E.dist(o.q, o.r, def.q, def.r) === 1) n++;
    }
    return Math.min(3, n);
  };

  /* The forecast the player sees before committing. Every multiplier that
   * touches the number is listed so the tray can show the breakdown. */
  E.forecast = function (b, atk, def, opts) {
    opts = opts || {};
    var ad = E.unitOf(atk.cls), dd = E.unitOf(def.cls);
    var tile = E.tileAt(b, def.q, def.r) || { terr: 'plain', elev: 0, burn: 0 };
    var aTile = E.tileAt(b, atk.q, atk.r) || { terr: 'plain', elev: 0 };
    var parts = [];
    var mul = 1;
    function push(label, icon, m, kind) {
      if (Math.abs(m - 1) < 0.001) return;
      parts.push({ label: label, icon: icon, mul: m, kind: kind || (m > 1 ? 'good' : 'bad') });
      mul *= m;
    }
    var counter = E.counterMul(atk.cls, def.cls);
    push(counter > 1 ? 'Counters' : 'Countered', 'triangle', counter);

    var flank = 1 + 0.15 * E.flankCount(b, atk, def);
    push('Flanking', 'flank', Math.round(flank * 100) / 100);

    var dh = (aTile.elev || 0) - (tile.elev || 0);
    if (dh !== 0) push(dh > 0 ? 'High ground' : 'Uphill', 'height', E.clamp(1 + 0.18 * dh, 0.85, 1.24));

    if (atk.cls === 'cav' && (opts.moved != null ? opts.moved : atk.moved) >= 3) push('Charge', 'charge', 1.25);
    if (!atk.supplied) push('Cut off', 'supply', 0.7);
    if (E.auraNear(b, atk)) push('Command aura', 'aura', 1.12);
    if (atk.side === 0 && atk.cls === 'spear' && E.generalOf(b.generalId).passive === 'spear') push('Spear saint', 'aura', 1.05);
    if (atk.weak > 0) push('War cry', 'warcry', 0.75);
    if (atk.side === 1 && b.moraleBreak) push('Command broken', 'warcry', 0.75);
    if (atk.side === 0 && b.generalDown) push('General down', 'warcry', 0.85);
    if (b.ambush && atk.side === 0) push('Ambush', 'ambush', 1.5);
    if (def.structure && ad.vsStruct) push('Siege engine', 'siege', ad.vsStruct);

    var hpScale = 0.55 + 0.45 * (atk.hp / atk.maxHp);
    push('Wounded', 'hp', Math.round(hpScale * 100) / 100);

    var cover = 1 / E.terrOf(tile.terr).def;
    push(cover < 1 ? 'Cover ' + E.terrOf(tile.terr).name : 'Exposed', 'cover', Math.round(cover * 100) / 100);
    if (def.cls === 'general') push('Bodyguard', 'shield', 0.8);
    if (def.side === 0 && b.shieldTurns > 0) push('Shield wall', 'shield', 0.67);
    if (def.side === 0 && E.generalOf(b.generalId).passive === 'forest' && tile.terr === 'forest') push('Woodcraft', 'shield', 0.8);
    if (def.side === 0 && E.generalOf(b.generalId).passive === 'guard') {
      var g = E.generalOfSide(b, 0);
      if (g && g !== def && E.dist(g.q, g.r, def.q, def.r) === 1) push('General guard', 'shield', 0.9);
    }

    var dmg = Math.max(1, Math.round(atk.atkBase * mul));
    var kill = dmg >= def.hp;

    // retaliation: only when the defender survives and can answer at range
    var retal = 0, canRetal = false;
    if (!kill && !def.convoy && dd.atk > 0 && !(b.ambush && atk.side === 0)) {
      var rg = E.rangeOf(b, def);
      var dist = E.dist(atk.q, atk.r, def.q, def.r);
      if (dist >= rg.min && dist <= rg.max) {
        canRetal = true;
        var rmul = E.counterMul(def.cls, atk.cls);
        rmul *= 0.55;
        rmul *= (0.55 + 0.45 * ((def.hp - dmg) / def.maxHp));
        rmul *= 1 / E.terrOf((E.tileAt(b, atk.q, atk.r) || { terr: 'plain' }).terr).def;
        if (!def.supplied) rmul *= 0.7;
        if (atk.side === 0 && b.shieldTurns > 0) rmul *= 0.67;
        retal = Math.max(1, Math.round(def.atkBase * rmul));
      }
    }
    return {
      atk: atk, def: def, dmg: dmg, kill: kill, retal: retal, canRetal: canRetal,
      parts: parts, total: Math.round(mul * 100) / 100, tile: tile
    };
  };

  E.applyAttack = function (b, fc) {
    var atk = fc.atk, def = fc.def, ev = [];
    def.hp -= fc.dmg;
    ev.push({ t: 'hit', from: atk, to: def, dmg: fc.dmg });
    if (def.hp <= 0) {
      def.hp = 0; def.alive = false;
      ev.push({ t: 'kill', to: def });
      if (def.side === 1) {
        b.kills++; b.score += def.structure ? 150 : 80;
        if (def.cls === 'general') { b.moraleBreak = true; ev.push({ t: 'morale' }); }
      }
      else b.losses++;
      if (def.structure && def.cls === 'gatehouse') b.objective.gatesDown++;
    } else if (fc.canRetal && fc.retal > 0) {
      atk.hp -= fc.retal;
      ev.push({ t: 'retal', from: def, to: atk, dmg: fc.retal });
      if (atk.hp <= 0) {
        atk.hp = 0; atk.alive = false;
        ev.push({ t: 'kill', to: atk });
        if (atk.side === 1) { b.kills++; b.score += 80; } else b.losses++;
      }
    }
    atk.acted = true; atk.mp = 0; atk.pre = null;
    if (b.ambush && atk.side === 0) b.ambush = false;
    E.refreshSupply(b);
    E.checkObjective(b);
    b.events = ev;
    return ev;
  };

  E.applyHeal = function (b, healer, target) {
    var amount = E.unitOf('healer').heal;
    if (healer.side === 0 && E.generalOf(b.generalId).passive === 'heal') amount += 4;
    var before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    healer.acted = true; healer.mp = 0; healer.pre = null;
    return { healed: target.hp - before, target: target };
  };

  // -------------------------------------------------------------- cards
  E.canPlayCard = function (b, idx) {
    var c = b.cards[idx];
    if (!c || c.used) return false;
    if (b.phase !== 'player' || b.result) return false;
    return !!E.generalOfSide(b, 0);
  };
  E.playCard = function (b, idx, target) {
    if (!E.canPlayCard(b, idx)) return null;
    var slot = b.cards[idx];
    var card = E.cardOf(slot.id);
    var g = E.generalOfSide(b, 0);
    var mine = E.side(b, 0), i, res = { card: card, hits: [], heals: [], hex: null };
    if (card.id === 'rally') {
      for (i = 0; i < mine.length; i++) {
        var u = mine[i];
        if (E.dist(u.q, u.r, g.q, g.r) <= 2) {
          var before = u.hp;
          u.hp = Math.min(u.maxHp, u.hp + 7);
          if (!u.acted) u.mp += 1;
          res.heals.push({ u: u, amount: u.hp - before });
        }
      }
    } else if (card.id === 'ambush') {
      b.ambush = true;
    } else if (card.id === 'forcedmarch') {
      for (i = 0; i < mine.length; i++) if (!mine[i].acted) { mine[i].mp += 2; res.heals.push({ u: mine[i], amount: 0 }); }
    } else if (card.id === 'shieldwall') {
      b.shieldTurns = 2;
    } else if (card.id === 'warcry') {
      var foes = E.side(b, 1);
      for (i = 0; i < foes.length; i++) {
        if (E.dist(foes[i].q, foes[i].r, g.q, g.r) <= 3) { foes[i].weak = 2; res.hits.push({ u: foes[i], dmg: 0 }); }
      }
    } else if (card.id === 'volley') {
      if (!target || !target.alive) return null;
      var archers = [];
      for (i = 0; i < mine.length; i++) {
        var a = mine[i];
        if (a.cls !== 'bow' || a.acted) continue;
        var rg = E.rangeOf(b, a);
        var dd = E.dist(a.q, a.r, target.q, target.r);
        if (dd >= rg.min && dd <= rg.max) archers.push(a);
      }
      if (!archers.length) return null;
      for (i = 0; i < archers.length; i++) {
        if (!target.alive) break;
        var fc = E.forecast(b, archers[i], target);
        var dmg = Math.max(1, Math.round(fc.dmg * 0.7));
        target.hp -= dmg;
        archers[i].acted = true; archers[i].mp = 0;
        res.hits.push({ u: target, from: archers[i], dmg: dmg });
        if (target.hp <= 0) {
          target.hp = 0; target.alive = false; b.kills++; b.score += 80;
          res.hits.push({ u: target, kill: true, dmg: 0 });
        }
      }
    } else if (card.id === 'fireattack') {
      if (!target || target.q === undefined) return null;
      var center = E.tileAt(b, target.q, target.r);
      if (!center) return null;
      res.hex = center;
      var cells = [center].concat((function () {
        var nb = E.neighbors(center.q, center.r), o = [];
        for (var n = 0; n < nb.length; n++) {
          var t = E.tileAt(b, nb[n][0], nb[n][1]);
          if (t) o.push(t);
        }
        return o;
      })());
      for (i = 0; i < cells.length; i++) {
        var tl = cells[i];
        if (E.terrOf(tl.terr).pass) tl.burn = 3;
        var hit = E.unitAt(b, tl.q, tl.r);
        if (hit) {
          hit.hp -= 6;
          res.hits.push({ u: hit, dmg: 6 });
          if (hit.hp <= 0) {
            hit.hp = 0; hit.alive = false;
            if (hit.side === 1) { b.kills++; b.score += 80; } else b.losses++;
            res.hits.push({ u: hit, kill: true, dmg: 0 });
          }
        }
      }
    } else if (card.id === 'feint') {
      if (!target || !target.alive || target.structure) return null;
      var best = null, bd = 1e9;
      var nb2 = E.neighbors(target.q, target.r);
      for (i = 0; i < nb2.length; i++) {
        var tt = E.tileAt(b, nb2[i][0], nb2[i][1]);
        if (!tt || !E.terrOf(tt.terr).pass || E.unitAt(b, tt.q, tt.r)) continue;
        var d2 = E.dist(tt.q, tt.r, g.q, g.r);
        if (d2 < bd) { bd = d2; best = tt; }
      }
      if (!best) return null;
      target.q = best.q; target.r = best.r; target.acted = true; target.mp = 0;
      res.hits.push({ u: target, dmg: 0, moved: true });
    }
    slot.used = true;
    E.refreshSupply(b);
    E.checkObjective(b);
    return res;
  };

  // ---------------------------------------------------------- objectives
  E.zoneTiles = function (b) {
    var kind = b.objective.zone, out = [];
    for (var i = 0; i < b.tiles.length; i++) {
      var t = b.tiles[i];
      if (kind === 'mark' && t.mark) out.push(t);
      else if (kind === 'terrace' && t.terr === 'terrace') out.push(t);
      else if (kind === 'road' && t.terr === 'road') out.push(t);
    }
    if (!out.length) {
      // guarded fallback: a hold map without its authored zone uses the marks
      for (i = 0; i < b.tiles.length; i++) if (b.tiles[i].mark) out.push(b.tiles[i]);
    }
    return out;
  };
  E.holdCount = function (b) {
    var z = E.zoneTiles(b), n = 0;
    for (var i = 0; i < z.length; i++) {
      var u = E.unitAt(b, z[i].q, z[i].r);
      if (u && u.side === 0) n++;
    }
    return n;
  };
  E.exitTiles = function (b) {
    if (b.exits.length) return b.exits;
    // guarded fallback: the far column of road or plain becomes the exit
    var best = null, out = [];
    for (var i = 0; i < b.tiles.length; i++) {
      var t = b.tiles[i];
      if (!E.terrOf(t.terr).pass) continue;
      if (!best || t.col > best.col) best = t;
    }
    if (!best) return out;
    for (i = 0; i < b.tiles.length; i++) {
      var t2 = b.tiles[i];
      if (E.terrOf(t2.terr).pass && t2.col === best.col) out.push(t2);
    }
    return out;
  };
  E.keepTiles = function (b) {
    var out = [];
    for (var i = 0; i < b.tiles.length; i++) if (b.tiles[i].terr === 'keep') out.push(b.tiles[i]);
    if (!out.length) {
      for (i = 0; i < b.tiles.length; i++) if (b.tiles[i].terr === 'gate') out.push(b.tiles[i]);
    }
    return out;
  };
  E.objectiveProgress = function (b) {
    var o = b.objective;
    if (o.kind === 'rout') {
      var live = 0, total = 0;
      for (var i = 0; i < b.units.length; i++) {
        var u = b.units[i];
        if (u.side !== 1) continue;
        total++;
        if (u.alive) live++;
      }
      return { have: total - live, need: total, label: 'Broken' };
    }
    if (o.kind === 'hold') return { have: E.holdCount(b), need: o.need, label: 'Held' };
    if (o.kind === 'escort') {
      var conv = null;
      for (i = 0; i < b.units.length; i++) if (b.units[i].convoy) conv = b.units[i];
      var ex = E.exitTiles(b);
      var best = 99;
      if (conv && conv.alive) {
        for (i = 0; i < ex.length; i++) best = Math.min(best, E.dist(conv.q, conv.r, ex[i].q, ex[i].r));
      }
      return { have: best === 99 ? 0 : Math.max(0, 20 - best), need: 20, label: 'Carts', hexes: best };
    }
    if (o.kind === 'siege') return { have: o.gatesDown, need: Math.max(1, o.gates), label: 'Gates' };
    return { have: 0, need: 1, label: 'Field' };
  };
  E.checkObjective = function (b) {
    if (b.result) return b.result;
    /* A fallen general is a heavy blow, not an instant defeat: the banners
     * fight on at reduced strength and the tactic cards are locked away. */
    if (!E.generalOfSide(b, 0)) b.generalDown = true;
    if (!E.generalOfSide(b, 1)) b.moraleBreak = true;
    var mine = E.combatants(b, 0);
    if (!mine.length) { b.result = 'loss'; b.lossReason = 'The army is broken.'; return b.result; }
    var o = b.objective;
    if (o.kind === 'rout') {
      var foes = E.combatants(b, 1);
      if (!foes.length) { b.result = 'win'; return b.result; }
    } else if (o.kind === 'escort') {
      var conv = null;
      for (var i = 0; i < b.units.length; i++) if (b.units[i].convoy) conv = b.units[i];
      if (!conv || !conv.alive) { b.result = 'loss'; b.lossReason = 'The carts are lost.'; return b.result; }
      var ex = E.exitTiles(b);
      for (i = 0; i < ex.length; i++) {
        if (conv.q === ex[i].q && conv.r === ex[i].r) { b.result = 'win'; return b.result; }
      }
    } else if (o.kind === 'siege') {
      if (o.gatesDown >= Math.max(1, o.gates)) {
        var keeps = E.keepTiles(b);
        for (i = 0; i < keeps.length; i++) {
          var ku = E.unitAt(b, keeps[i].q, keeps[i].r);
          if (ku && ku.side === 0) { b.result = 'win'; return b.result; }
        }
      }
    }
    return null;
  };

  // -------------------------------------------------------------- turns
  E.beginTurn = function (b, side, first) {
    b.side = side;
    b.phase = side === 0 ? 'player' : 'enemy';
    var list = E.side(b, side), starved = 0, burned = 0, i;
    for (i = 0; i < list.length; i++) {
      var u = list[i];
      u.mp = u.structure ? 0 : E.movePoints(b, u);
      u.acted = false; u.moved = 0; u.pre = null;
      if (u.weak > 0) u.weak--;
      if (!first) {
        if (!u.supplied && !u.structure) {
          u.hp -= 2; starved++;
          if (u.hp <= 0) { u.hp = 0; u.alive = false; if (u.side === 0) b.losses++; }
        }
        var t = E.tileAt(b, u.q, u.r);
        if (t && t.burn > 0 && u.alive) {
          u.hp -= 2; burned++;
          if (u.hp <= 0) { u.hp = 0; u.alive = false; if (u.side === 0) b.losses++; }
        }
      }
    }
    if (side === 0 && !first) {
      for (i = 0; i < b.tiles.length; i++) if (b.tiles[i].burn > 0) b.tiles[i].burn--;
      if (b.shieldTurns > 0) b.shieldTurns--;
    }
    b.ambush = false;
    E.refreshSupply(b);
    E.checkObjective(b);
    return { starved: starved, burned: burned };
  };
  E.endTurn = function (b) {
    if (b.result) return b.result;
    if (b.side === 0) {
      E.beginTurn(b, 1, false);
      return 'enemy';
    }
    b.turn++;
    if (b.turn > b.turnLimit) {
      var o = b.objective;
      if (o.kind === 'hold' && E.holdCount(b) >= o.need) b.result = 'win';
      else {
        b.result = 'loss';
        b.lossReason = o.kind === 'hold' ? 'The ground was not held.' : 'The season clock ran out.';
      }
      return b.result;
    }
    E.beginTurn(b, 0, false);
    return 'player';
  };

  // ----------------------------------------------------------------- AI
  /* The enemy plans a focus target for the whole turn, then each banner picks
   * the destination that maximises damage, flank support and cover while
   * staying out of the worst player threat. It commits rather than trickles.
   */
  function threatMap(b, side) {
    var map = {};
    var foes = E.side(b, side === 0 ? 1 : 0);
    for (var i = 0; i < foes.length; i++) {
      var f = foes[i];
      if (f.convoy) continue;
      var rg = E.rangeOf(b, f);
      var span = rg.max + (f.structure ? 0 : E.movePoints(b, f));
      for (var j = 0; j < b.tiles.length; j++) {
        var t = b.tiles[j];
        if (!E.terrOf(t.terr).pass) continue;
        var d = E.dist(f.q, f.r, t.q, t.r);
        if (d <= span) {
          var k = E.key(t.q, t.r);
          map[k] = (map[k] || 0) + f.atkBase * (d <= rg.max ? 1 : 0.5);
        }
      }
    }
    return map;
  }

  E.aiPlan = function (b) {
    var acts = [];
    if (b.result) return acts;
    var foes = E.side(b, 1);
    var mine = E.side(b, 0);
    if (!mine.length) return acts;
    var threat = threatMap(b, 1);
    var aggression = 0.7 + 0.03 * (b.def.id || 1);
    if (b.moraleBreak) aggression *= 0.6;
    /* Early warlords defend their ground: they only leave a good hex when the
     * player is close enough to punish, which gives the first province the
     * space to teach positioning. */
    var defensive = (b.mode === 'campaign' && b.def.id <= 5 && !b.moraleBreak);

    // pick the focus target: the softest valuable player banner
    var focus = null, fscore = -1e9;
    for (var i = 0; i < mine.length; i++) {
      var m = mine[i];
      var sc = (m.maxHp - m.hp) * 1.6 + (m.cls === 'general' ? 9 : 0) + (m.cls === 'healer' ? 16 : 0) +
               (m.convoy ? 26 : 0) - E.terrOf((E.tileAt(b, m.q, m.r) || { terr: 'plain' }).terr).def * 6;
      if (sc > fscore) { fscore = sc; focus = m; }
    }

    // the enemy general spends its single card when it is losing ground
    if (b.enemyCard && !b.enemyCard.used && b.turn >= 3) {
      var hurt = 0;
      for (i = 0; i < foes.length; i++) if (foes[i].hp < foes[i].maxHp * 0.6) hurt++;
      if (hurt >= 2) {
        b.enemyCard.used = true;
        var eg = E.generalOfSide(b, 1);
        if (eg) {
          for (i = 0; i < foes.length; i++) {
            if (E.dist(foes[i].q, foes[i].r, eg.q, eg.r) <= 2) foes[i].hp = Math.min(foes[i].maxHp, foes[i].hp + 7);
          }
          acts.push({ kind: 'card', unit: eg, card: 'rally' });
        }
      }
    }

    var order = foes.slice().sort(function (a, c) {
      var av = a.structure ? 0 : (a.cls === 'cav' ? 3 : a.cls === 'bow' ? 2 : 1);
      var cv = c.structure ? 0 : (c.cls === 'cav' ? 3 : c.cls === 'bow' ? 2 : 1);
      return cv - av;
    });

    for (var u = 0; u < order.length; u++) {
      var unit = order[u];
      if (!unit.alive) continue;
      if (unit.structure) {
        var tg = E.targetsFor(b, unit);
        var pick = null, pb = -1e9;
        for (i = 0; i < tg.length; i++) {
          var fcS = E.forecast(b, unit, tg[i]);
          var s = fcS.dmg + (fcS.kill ? 60 : 0) + (tg[i] === focus ? 12 : 0);
          if (s > pb) { pb = s; pick = tg[i]; }
        }
        if (pick) {
          var fcx = E.forecast(b, unit, pick);
          acts.push({ kind: 'attack', unit: unit, target: pick, fc: fcx });
          E.applyAttack(b, fcx);
          if (b.result) return acts;
        }
        continue;
      }
      if (unit.cls === 'healer') {
        var ht = E.healTargets(b, unit);
        var worst = null;
        for (i = 0; i < ht.length; i++) if (!worst || ht[i].hp / ht[i].maxHp < worst.hp / worst.maxHp) worst = ht[i];
        if (worst && worst.hp < worst.maxHp * 0.65) {
          acts.push({ kind: 'heal', unit: unit, target: worst });
          E.applyHeal(b, unit, worst);
          continue;
        }
      }

      var rc = E.reach(b, unit);
      var options = [];
      options.push({ k: E.key(unit.q, unit.r), left: unit.mp, steps: 0 });
      for (var k in rc.cells) options.push({ k: k, left: rc.cells[k], steps: E.pathTo(rc, k).length - 1 });

      var best = null, bestScore = -1e9;
      for (var oi = 0; oi < options.length; oi++) {
        var opt = options[oi];
        var parts = opt.k.split(',');
        var q = parseInt(parts[0], 10), r = parseInt(parts[1], 10);
        var tile = E.tileAt(b, q, r);
        if (!tile) continue;
        var here = { q: q, r: r };
        var score = 0;
        score += (E.terrOf(tile.terr).def - 1) * 14;
        score -= (threat[opt.k] || 0) * 0.55;
        // best attack from this cell
        var bestAtk = null, bestAtkScore = -1e9;
        var rg2 = E.rangeOf(b, unit);
        var udd = E.unitOf(unit.cls);
        var canFire = !(udd.immobileFire && opt.steps > 0);
        if (canFire && unit.atkBase > 0) {
          for (i = 0; i < mine.length; i++) {
            var tgt = mine[i];
            if (!tgt.alive) continue;
            var dd = E.dist(q, r, tgt.q, tgt.r);
            if (dd < rg2.min || dd > rg2.max) continue;
            var ghost = { q: q, r: r, cls: unit.cls, side: unit.side, hp: unit.hp, maxHp: unit.maxHp,
                          atkBase: unit.atkBase, supplied: unit.supplied, weak: unit.weak, structure: false, moved: opt.steps };
            var fc = E.forecast(b, ghost, tgt, { moved: opt.steps });
            var as = fc.dmg * 1.5 + (fc.kill ? 70 : 0) - fc.retal * 0.8;
            if (tgt === focus) as += 18;
            if (tgt.convoy) as += 22;
            if (tgt.cls === 'general') as += 6;
            as += E.flankCount(b, ghost, tgt) * 5;
            if (as > bestAtkScore) { bestAtkScore = as; bestAtk = tgt; }
          }
        }
        if (bestAtk) score += bestAtkScore * aggression;
        else {
          var approach = focus ? E.dist(q, r, focus.q, focus.r) : 0;
          if (defensive) {
            var lure = E.movePoints(b, unit) + E.rangeOf(b, unit).max + 1;
            score -= opt.steps * 40;
            if (focus && E.dist(unit.q, unit.r, focus.q, focus.r) <= lure) score -= approach * 4.5;
          } else score -= approach * 4.5;
          if (b.objective.kind === 'hold') {
            var z = E.zoneTiles(b), near = 99;
            for (i = 0; i < z.length; i++) near = Math.min(near, E.dist(q, r, z[i].q, z[i].r));
            score -= near * 3;
          }
        }
        score -= opt.steps * 0.3;
        if (score > bestScore) { bestScore = score; best = { opt: opt, q: q, r: r, atk: bestAtk }; }
      }
      if (!best) continue;
      if (best.opt.steps > 0) {
        var path = E.pathTo(rc, best.opt.k);
        acts.push({ kind: 'move', unit: unit, path: path, q: best.q, r: best.r });
        E.moveUnit(b, unit, best.q, best.r, best.opt.left, best.opt.steps);
      }
      if (best.atk && best.atk.alive) {
        var fcF = E.forecast(b, unit, best.atk);
        acts.push({ kind: 'attack', unit: unit, target: best.atk, fc: fcF });
        E.applyAttack(b, fcF);
      } else {
        unit.acted = true;
      }
      if (b.result) return acts;
    }
    return acts;
  };

  // -------------------------------------------------------------- rating
  E.rateBattle = function (b) {
    var stars = 1;
    if (b.losses === 0) stars = 3;
    else if (b.losses <= 1) stars = 2;
    var score = b.score + Math.max(0, (b.turnLimit - b.turn)) * 25 + stars * 120;
    return { stars: stars, score: score };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = E;
  root.WBEngine = E;
})(typeof window !== 'undefined' ? window : globalThis);
