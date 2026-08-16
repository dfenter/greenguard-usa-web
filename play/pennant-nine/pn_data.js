/* pn_data.js — Pennant Nine content registries.
 * Pure data plus pure helpers. No engine, no DOM, no globals beyond PN.
 * Stat lines, pitch constants and the batting quality weights are carried
 * verbatim from the archived prototype design document.
 */
(function (root) {
  'use strict';

  var PN = root.PN || (root.PN = {});

  PN.SAVE_VERSION = 3;

  PN.COLORS = {
    ink: '#071116',
    night: '#0a171e',
    panel: '#11262f',
    panel2: '#18333b',
    line: '#35535a',
    text: '#edf6ee',
    muted: '#9bb1ac',
    lime: '#c9ff62',
    aqua: '#86e4d5',
    coral: '#ff7861',
    gold: '#ffd36b',
    field: '#1a6149',
    fieldDark: '#124536',
    dirt: '#b77b55',
    dirtDark: '#8d5b3e',
    white: '#fffdf4'
  };

  function num(c) { return parseInt(c.slice(1), 16); }
  PN.hex = function (c) { return num(c); };

  // ------------------------------------------------------------ roster
  // [name, contact, power, speed] exactly as tuned in the prototype, plus
  // a twelfth bat added for the AAA roster depth requirement.
  PN.ROSTER = [
    { id: 'mira', name: 'Mira Vale', pos: 'CF', contact: 0.82, power: 0.67, speed: 0.58, bench: false },
    { id: 'jax', name: 'Jax Rowan', pos: '1B', contact: 0.71, power: 0.78, speed: 0.48, bench: false },
    { id: 'sola', name: 'Sola Reed', pos: 'SS', contact: 0.76, power: 0.59, speed: 0.81, bench: false },
    { id: 'tess', name: 'Tess Orbit', pos: '3B', contact: 0.69, power: 0.64, speed: 0.75, bench: false },
    { id: 'oren', name: 'Oren Pike', pos: 'LF', contact: 0.62, power: 0.86, speed: 0.42, bench: false },
    { id: 'nia', name: 'Nia Bloom', pos: '2B', contact: 0.79, power: 0.52, speed: 0.86, bench: false },
    { id: 'cal', name: 'Cal Wren', pos: 'C', contact: 0.68, power: 0.71, speed: 0.61, bench: false },
    { id: 'ivo', name: 'Ivo Finch', pos: 'RF', contact: 0.74, power: 0.57, speed: 0.72, bench: false },
    { id: 'rue', name: 'Rue Atlas', pos: 'DH', contact: 0.65, power: 0.75, speed: 0.54, bench: false },
    { id: 'pip', name: 'Pip Sol', pos: 'UT', contact: 0.61, power: 0.53, speed: 0.83, bench: true },
    { id: 'koi', name: 'Koi Mercer', pos: 'UT', contact: 0.58, power: 0.69, speed: 0.64, bench: true },
    { id: 'wren', name: 'Wren Kade', pos: 'UT', contact: 0.70, power: 0.62, speed: 0.70, bench: true }
  ];

  // Four arm rotation. control raises strike power, stamina sets the drain.
  PN.ROTATION = [
    { id: 'arc', name: 'Halo Arc', role: 'ACE', control: 0.86, stamina: 1.00, arsenal: ['hush', 'glint', 'kick'] },
    { id: 'brim', name: 'Odessa Brim', role: 'SP2', control: 0.78, stamina: 0.94, arsenal: ['glint', 'kick', 'fade'] },
    { id: 'quill', name: 'Tobin Quill', role: 'SP3', control: 0.73, stamina: 0.88, arsenal: ['kick', 'hush', 'split'] },
    { id: 'vane', name: 'Rio Vane', role: 'SP4', control: 0.69, stamina: 0.82, arsenal: ['fade', 'glint', 'split'] }
  ];

  // ------------------------------------------------------------- teams
  PN.TEAMS = [
    { id: 'n9', name: 'Northstar Nine', short: 'N9', color: PN.COLORS.lime, alt: '#7fb85a', style: 'you', mark: 'star', park: 'rowan', bat: 0.74, arm: 0.76 },
    { id: 'co', name: 'Cinder Owls', short: 'CO', color: '#ff9a68', alt: '#c96a3c', style: 'contact', mark: 'owl', park: 'sunfield', bat: 0.80, arm: 0.66 },
    { id: 'vv', name: 'Volt Vipers', short: 'VV', color: '#ffdd67', alt: '#c9a83a', style: 'power', mark: 'bolt', park: 'vault', bat: 0.72, arm: 0.71 },
    { id: 'hh', name: 'Harbor Hares', short: 'HH', color: '#8be8df', alt: '#4fa89f', style: 'speed', mark: 'wave', park: 'harborlight', bat: 0.71, arm: 0.74 },
    { id: 'mm', name: 'Moss Meteors', short: 'MM', color: '#b5a4ff', alt: '#7566c9', style: 'balanced', mark: 'comet', park: 'sunfield', bat: 0.73, arm: 0.73 },
    { id: 'cl', name: 'Copper Larks', short: 'CL', color: '#f2a0c0', alt: '#b96b88', style: 'contact', mark: 'lark', park: 'meridian', bat: 0.75, arm: 0.70 }
  ];

  // Opponent lineups, nine bats each, carried from the prototype where the
  // prototype had them and extended for the sixth club.
  PN.OPP_LINEUPS = {
    co: [['Lumen Fox', 0.91, 0.46, 0.54], ['Moss Bell', 0.88, 0.51, 0.48], ['Pax Noon', 0.86, 0.62, 0.42],
      ['Vera Coil', 0.83, 0.57, 0.66], ['Nell Rook', 0.81, 0.49, 0.57], ['Odo Flint', 0.79, 0.67, 0.39],
      ['Kestrel May', 0.78, 0.55, 0.76], ['Ari Soot', 0.77, 0.61, 0.45], ['Bram Glow', 0.74, 0.71, 0.36]],
    vv: [['Rex Static', 0.53, 0.94, 0.49], ['Tala Boom', 0.61, 0.92, 0.53], ['Grit Zane', 0.49, 0.96, 0.38],
      ['Juno Arc', 0.68, 0.85, 0.63], ['Bex Torch', 0.57, 0.89, 0.44], ['Dax Volt', 0.66, 0.87, 0.59],
      ['Sia Crash', 0.51, 0.83, 0.41], ['Milo Fuse', 0.63, 0.78, 0.68], ['Qin Spark', 0.59, 0.81, 0.56]],
    hh: [['Wick Dash', 0.69, 0.49, 0.96], ['Penny Jet', 0.74, 0.42, 0.94], ['Lio Skim', 0.77, 0.55, 0.91],
      ['Zee Current', 0.66, 0.61, 0.89], ['Mara Fleet', 0.72, 0.47, 0.93], ['Kit Wake', 0.81, 0.52, 0.87],
      ['Bo Slip', 0.68, 0.58, 0.86], ['Uma Wake', 0.75, 0.64, 0.82], ['Rin Ripple', 0.70, 0.45, 0.90]],
    mm: [['Aster Ray', 0.73, 0.72, 0.69], ['Nox Garden', 0.71, 0.73, 0.64], ['Vivi Stone', 0.75, 0.75, 0.62],
      ['Clem Star', 0.68, 0.79, 0.71], ['Yara Moss', 0.78, 0.66, 0.77], ['Sol Prism', 0.72, 0.76, 0.68],
      ['Mica Bloom', 0.69, 0.70, 0.74], ['Taro Dust', 0.65, 0.82, 0.55], ['Eli Comet', 0.76, 0.68, 0.70]],
    cl: [['Wynn Copper', 0.84, 0.58, 0.72], ['Bea Solder', 0.80, 0.63, 0.61], ['Tam Kiln', 0.77, 0.70, 0.55],
      ['Ash Lark', 0.82, 0.54, 0.79], ['Nim Forge', 0.75, 0.72, 0.58], ['Ozz Patina', 0.79, 0.60, 0.66],
      ['Fee Rivet', 0.81, 0.51, 0.83], ['Gil Ember', 0.73, 0.76, 0.49], ['Suri Bell', 0.78, 0.65, 0.68]]
  };

  // ----------------------------------------------------------- ballparks
  // fences are in feet at spray angles -45 (left line), 0 (center), +45
  // (right line); carry is interpolated between them.
  PN.PARKS = [
    {
      id: 'rowan', name: 'Rowan Field', city: 'Rowan District',
      blurb: 'City bandbox. Short porches, a wall you can reach.',
      fence: { left: 318, leftCenter: 348, center: 364, rightCenter: 340, right: 312 },
      wallHeight: 0.62, wind: 0.06, windDir: 1, night: false,
      sky: ['#7fc7de', '#cfe7ea'], turf: '#1e6f52', turfAlt: '#175c44',
      dirt: '#b77b55', wall: '#2b4a55', accent: '#c9ff62',
      crowd: ['#e9d7b8', '#c9b28c', '#a98f6d', '#8f7a5c'], seats: '#28414c',
      lights: false, roof: false, capacity: 0.92
    },
    {
      id: 'harborlight', name: 'Harborlight Park', city: 'Harborlight Quay',
      blurb: 'Seaside air. The wind pushes flies to right.',
      fence: { left: 328, leftCenter: 362, center: 386, rightCenter: 350, right: 330 },
      wallHeight: 0.9, wind: 0.13, windDir: 1, night: false,
      sky: ['#f2a86a', '#ffd9a0'], turf: '#1c6a53', turfAlt: '#155742',
      dirt: '#bb8259', wall: '#1f4756', accent: '#86e4d5',
      crowd: ['#ffd9a0', '#e0b784', '#b9926a', '#977a58'], seats: '#1c3b48',
      lights: true, roof: false, capacity: 0.86
    },
    {
      id: 'vault', name: 'The Vault', city: 'Vault Sector',
      blurb: 'Sealed dome. No wind, even fences, no excuses.',
      fence: { left: 334, leftCenter: 366, center: 388, rightCenter: 366, right: 334 },
      wallHeight: 0.78, wind: 0.0, windDir: 0, night: true,
      sky: ['#141a33', '#26315c'], turf: '#207a5a', turfAlt: '#186349',
      dirt: '#a2704f', wall: '#2c3350', accent: '#ffdd67',
      crowd: ['#c8c2ff', '#a49bea', '#8177c6', '#655ca3'], seats: '#20263f',
      lights: true, roof: true, capacity: 0.95
    },
    {
      id: 'sunfield', name: 'Sunfield Commons', city: 'Sunfield',
      blurb: 'Prairie yard. Deep gaps swallow lazy fly balls.',
      fence: { left: 322, leftCenter: 376, center: 398, rightCenter: 380, right: 358 },
      wallHeight: 0.7, wind: 0.08, windDir: -1, night: false,
      sky: ['#8fd0e8', '#e6f2df'], turf: '#28794f', turfAlt: '#1f6440',
      dirt: '#c08a5d', wall: '#33553f', accent: '#ff9a68',
      crowd: ['#f5e6c8', '#d7c19b', '#b39c76', '#8f8059'], seats: '#2f4b3c',
      lights: false, roof: false, capacity: 0.78
    },
    {
      id: 'meridian', name: 'Meridian Yard', city: 'Meridian',
      blurb: 'The pennant stage. Deep gaps and a tall wall.',
      fence: { left: 340, leftCenter: 384, center: 404, rightCenter: 376, right: 344 },
      wallHeight: 1.12, wind: 0.05, windDir: -1, night: true,
      sky: ['#0a1524', '#16304a'], turf: '#1a6149', turfAlt: '#124536',
      dirt: '#9c6b4a', wall: '#16313f', accent: '#ffd36b',
      crowd: ['#ffe6a8', '#e5c07f', '#b99a63', '#8e784c'], seats: '#132a35',
      lights: true, roof: false, capacity: 1.0
    }
  ];

  PN.parkById = function (id) {
    for (var i = 0; i < PN.PARKS.length; i += 1) if (PN.PARKS[i].id === id) return PN.PARKS[i];
    return PN.PARKS[0];
  };
  PN.teamById = function (id) {
    for (var i = 0; i < PN.TEAMS.length; i += 1) if (PN.TEAMS[i].id === id) return PN.TEAMS[i];
    return PN.TEAMS[0];
  };
  PN.teamIndex = function (id) {
    for (var i = 0; i < PN.TEAMS.length; i += 1) if (PN.TEAMS[i].id === id) return i;
    return 0;
  };
  PN.playerById = function (id) {
    for (var i = 0; i < PN.ROSTER.length; i += 1) if (PN.ROSTER[i].id === id) return PN.ROSTER[i];
    return PN.ROSTER[0];
  };
  PN.armById = function (id) {
    for (var i = 0; i < PN.ROTATION.length; i += 1) if (PN.ROTATION[i].id === id) return PN.ROTATION[i];
    return PN.ROTATION[0];
  };

  // Fence distance in feet at a spray angle in degrees, -45 pull line to
  // +45 opposite line for a right handed bat.
  PN.fenceAt = function (park, spray) {
    var f = park.fence;
    var s = Math.max(-45, Math.min(45, spray));
    var stops = [[-45, f.left], [-22, f.leftCenter], [0, f.center], [22, f.rightCenter], [45, f.right]];
    for (var i = 0; i < stops.length - 1; i += 1) {
      if (s <= stops[i + 1][0]) {
        var a = stops[i], b = stops[i + 1];
        var t = (s - a[0]) / (b[0] - a[0]);
        return a[1] + (b[1] - a[1]) * t;
      }
    }
    return f.right;
  };

  // ------------------------------------------------------------ pitches
  // speed, sway and bonus are the prototype's tuned values.
  PN.PITCHES = [
    { id: 'glint', name: 'GLINT', label: 'Glint', color: PN.COLORS.gold, speed: 0.90, sway: 0.75, bonus: 0.04, breakX: 0.34, breakY: 0.30, travel: 0.88, tell: 'over the top', unlock: 0 },
    { id: 'hush', name: 'HUSH', label: 'Hush', color: PN.COLORS.aqua, speed: 1.16, sway: 0.46, bonus: 0.08, breakX: 0.10, breakY: 0.08, travel: 0.72, tell: 'high slot', unlock: 0 },
    { id: 'kick', name: 'KICK', label: 'Kick', color: PN.COLORS.coral, speed: 0.74, sway: 1.05, bonus: 0.02, breakX: -0.52, breakY: 0.46, travel: 1.02, tell: 'low slot', unlock: 0 },
    { id: 'fade', name: 'FADE', label: 'Fade', color: '#b5a4ff', speed: 0.95, sway: 0.90, bonus: 0.05, breakX: 0.58, breakY: 0.22, travel: 0.84, tell: 'wide slot', unlock: 6 },
    { id: 'split', name: 'SPLIT', label: 'Split', color: '#ff9a68', speed: 1.02, sway: 0.62, bonus: 0.07, breakX: -0.08, breakY: 0.66, travel: 0.78, tell: 'tucked slot', unlock: 13 }
  ];
  PN.pitchById = function (id) {
    for (var i = 0; i < PN.PITCHES.length; i += 1) if (PN.PITCHES[i].id === id) return PN.PITCHES[i];
    return PN.PITCHES[0];
  };
  PN.pitchIndex = function (id) {
    for (var i = 0; i < PN.PITCHES.length; i += 1) if (PN.PITCHES[i].id === id) return i;
    return 0;
  };

  // Swing plans. The power meter is a pre pitch stance choice so the
  // timing tap stays a single clean thumb action.
  PN.SWINGS = [
    { id: 'contact', name: 'CONTACT', window: 1.34, power: 0.74, loft: -5, color: PN.COLORS.aqua },
    { id: 'level', name: 'LEVEL', window: 1.0, power: 1.0, loft: 0, color: PN.COLORS.lime },
    { id: 'power', name: 'POWER', window: 0.74, power: 1.18, loft: 6, color: PN.COLORS.gold }
  ];

  PN.EFFORTS = [
    { id: 'ease', name: 'EASE', drain: 0.5, accuracy: 0.88, bonus: -0.02, color: PN.COLORS.aqua },
    { id: 'normal', name: 'NORMAL', drain: 1.0, accuracy: 1.0, bonus: 0.0, color: PN.COLORS.lime },
    { id: 'max', name: 'MAX', drain: 1.8, accuracy: 1.16, bonus: 0.06, color: PN.COLORS.coral }
  ];

  // --------------------------------------------------------- challenges
  // Clutch Situations: authored one at-bat scenarios, ordered by ramp.
  PN.CLUTCH = [
    { id: 'c1', name: 'Leadoff Spark', park: 'rowan', opp: 'co', inning: 1, outs: 0, bases: [false, false, false], deficit: 0, need: 'hit', pitchPool: ['glint', 'hush'], batter: 'mira', par: 'Reach base to open the game.' },
    { id: 'c2', name: 'Tie It Late', park: 'sunfield', opp: 'mm', inning: 8, outs: 1, bases: [false, true, false], deficit: 1, need: 'rbi', pitchPool: ['glint', 'kick'], batter: 'jax', par: 'Drive in the runner from second.' },
    { id: 'c3', name: 'Bases Drum', park: 'harborlight', opp: 'hh', inning: 6, outs: 2, bases: [true, true, true], deficit: 2, need: 'rbi2', pitchPool: ['hush', 'kick'], batter: 'oren', par: 'Two runs or better with the sacks full.' },
    { id: 'c4', name: 'Wall Ball', park: 'vault', opp: 'vv', inning: 7, outs: 0, bases: [false, false, false], deficit: 1, need: 'xbh', pitchPool: ['hush', 'glint', 'fade'], batter: 'rue', par: 'Extra bases inside the dome.' },
    { id: 'c5', name: 'Two Strike Grit', park: 'rowan', opp: 'cl', inning: 5, outs: 2, bases: [false, false, true], deficit: 1, need: 'rbi', strikes: 2, pitchPool: ['kick', 'split'], batter: 'sola', par: 'Down to the last strike, score the runner.' },
    { id: 'c6', name: 'Ninth And One', park: 'meridian', opp: 'vv', inning: 9, outs: 2, bases: [false, true, false], deficit: 1, need: 'rbi', pitchPool: ['hush', 'split'], batter: 'mira', par: 'Two out, tying run at second.' },
    { id: 'c7', name: 'Seaside Squeeze', park: 'harborlight', opp: 'hh', inning: 8, outs: 1, bases: [true, false, true], deficit: 2, need: 'rbi2', pitchPool: ['glint', 'fade', 'kick'], batter: 'nia', par: 'The wind is against you. Two runs.' },
    { id: 'c8', name: 'Dome Silence', park: 'vault', opp: 'mm', inning: 9, outs: 2, bases: [true, true, false], deficit: 3, need: 'hr', pitchPool: ['hush', 'split', 'fade'], batter: 'oren', par: 'Only a grand slam class swing wins this.' },
    { id: 'c9', name: 'Prairie Chase', park: 'sunfield', opp: 'co', inning: 9, outs: 1, bases: [false, false, true], deficit: 2, need: 'xbh', pitchPool: ['glint', 'kick', 'split'], batter: 'tess', par: 'Deep right center wants your fly ball.' },
    { id: 'c10', name: 'Pennant Point', park: 'meridian', opp: 'cl', inning: 9, outs: 2, bases: [true, true, true], deficit: 3, need: 'hr', pitchPool: ['hush', 'fade', 'split'], batter: 'jax', par: 'Bases loaded, down three, two out. Clear them.' }
  ];

  PN.DERBY_ROUNDS = [
    { id: 'r1', name: 'Round One', outs: 10, target: 5, park: 'rowan' },
    { id: 'r2', name: 'Round Two', outs: 10, target: 7, park: 'harborlight' },
    { id: 'r3', name: 'Final', outs: 10, target: 9, park: 'meridian' }
  ];

  // ------------------------------------------------------------ season
  PN.SEASON_GAMES = 24;

  PN.makeSchedule = function (seed) {
    var opps = [];
    var i;
    for (i = 1; i < PN.TEAMS.length; i += 1) opps.push(PN.TEAMS[i].id);
    var rng = PN.rng(seed);
    var sched = [];
    for (i = 0; i < PN.SEASON_GAMES; i += 1) {
      var opp = opps[i % opps.length];
      var home = ((i / opps.length) | 0) % 2 === 0;
      sched.push({ opp: opp, home: home });
    }
    // light shuffle of each block of five so seasons do not feel identical
    for (var b = 0; b < sched.length; b += opps.length) {
      for (var j = Math.min(opps.length, sched.length - b) - 1; j > 0; j -= 1) {
        var k = (rng() * (j + 1)) | 0;
        var t = sched[b + j]; sched[b + j] = sched[b + k]; sched[b + k] = t;
      }
    }
    return sched;
  };

  // Small deterministic RNG so a season replays consistently after reload.
  PN.rng = function (seed) {
    var s = (seed | 0) || 1;
    return function () {
      s ^= s << 13; s |= 0;
      s ^= s >>> 17;
      s ^= s << 5; s |= 0;
      return ((s >>> 0) % 100000) / 100000;
    };
  };

  PN.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  // -------------------------------------------------------------- save
  function blankStandings() {
    return PN.TEAMS.map(function (t) {
      return { id: t.id, w: 0, l: 0, rf: 0, ra: 0 };
    });
  }

  function blankForm() {
    var out = {};
    PN.ROSTER.forEach(function (p) {
      out[p.id] = { form: 0, growth: 0, ab: 0, h: 0, hr: 0, rbi: 0 };
    });
    return out;
  }

  function blankArms() {
    var out = {};
    PN.ROTATION.forEach(function (a) { out[a.id] = { rest: 1, ip: 0, k: 0 }; });
    return out;
  }

  PN.newSeason = function (seed, tier) {
    return {
      seed: seed,
      tier: tier || 0,
      game: 0,
      schedule: PN.makeSchedule(seed),
      standings: blankStandings(),
      form: blankForm(),
      arms: blankArms(),
      rotationIndex: 0,
      playoff: null,
      done: false
    };
  };

  PN.newSave = function () {
    return {
      v: PN.SAVE_VERSION,
      season: null,
      career: { seasons: 0, pennants: 0, wins: 0, losses: 0, hr: 0, bestWins: 0, titles: 0 },
      clutch: {},
      derby: { best: 0, far: 0, cleared: 0 },
      unlockedParks: ['rowan', 'harborlight'],
      tutorialDone: false,
      tier: 0,
      tips: {}
    };
  };

  function isObj(o) { return o && typeof o === 'object' && !Array.isArray(o); }
  function fin(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }

  // Validation is strict: anything unrecognised falls back to a fresh save
  // rather than booting a half valid career.
  PN.validateSave = function (o) {
    if (!isObj(o)) return false;
    if (o.v !== PN.SAVE_VERSION) return false;
    if (!isObj(o.career) || !isObj(o.clutch) || !isObj(o.derby)) return false;
    if (!Array.isArray(o.unlockedParks)) return false;
    for (var i = 0; i < o.unlockedParks.length; i += 1) {
      if (typeof o.unlockedParks[i] !== 'string') return false;
    }
    if (o.season !== null) {
      var s = o.season;
      if (!isObj(s) || !Array.isArray(s.schedule) || !Array.isArray(s.standings)) return false;
      if (s.schedule.length !== PN.SEASON_GAMES) return false;
      if (s.standings.length !== PN.TEAMS.length) return false;
      for (var j = 0; j < s.schedule.length; j += 1) {
        var row = s.schedule[j];
        if (!isObj(row) || typeof row.opp !== 'string') return false;
        if (PN.TEAMS.every(function (t) { return t.id !== row.opp; })) return false;
      }
      if (!isObj(s.form) || !isObj(s.arms)) return false;
    }
    return true;
  };

  // Repair pass: clamps every number and re-seeds any registry key that has
  // gone missing, so a shipped content change cannot brick an old save.
  PN.repairSave = function (o) {
    var base = PN.newSave();
    if (!PN.validateSave(o)) return base;
    var s = o;
    s.career.seasons = Math.max(0, fin(s.career.seasons, 0) | 0);
    s.career.pennants = Math.max(0, fin(s.career.pennants, 0) | 0);
    s.career.titles = Math.max(0, fin(s.career.titles, 0) | 0);
    s.career.wins = Math.max(0, fin(s.career.wins, 0) | 0);
    s.career.losses = Math.max(0, fin(s.career.losses, 0) | 0);
    s.career.hr = Math.max(0, fin(s.career.hr, 0) | 0);
    s.career.bestWins = Math.max(0, fin(s.career.bestWins, 0) | 0);
    s.derby.best = Math.max(0, fin(s.derby.best, 0) | 0);
    s.derby.far = Math.max(0, fin(s.derby.far, 0) | 0);
    s.derby.cleared = Math.max(0, fin(s.derby.cleared, 0) | 0);
    s.tier = PN.clamp(fin(s.tier, 0) | 0, 0, 2);
    s.tutorialDone = !!s.tutorialDone;
    if (!isObj(s.tips)) s.tips = {};
    var okParks = s.unlockedParks.filter(function (id) {
      return PN.PARKS.some(function (p) { return p.id === id; });
    });
    if (okParks.indexOf('rowan') < 0) okParks.push('rowan');
    s.unlockedParks = okParks;
    var cl = {};
    PN.CLUTCH.forEach(function (c) {
      var v = s.clutch[c.id];
      cl[c.id] = isObj(v) ? { done: !!v.done, medal: PN.clamp(fin(v.medal, 0) | 0, 0, 3) } : { done: false, medal: 0 };
    });
    s.clutch = cl;
    if (s.season) {
      var se = s.season;
      se.seed = fin(se.seed, 1) | 0;
      se.tier = PN.clamp(fin(se.tier, 0) | 0, 0, 2);
      se.game = PN.clamp(fin(se.game, 0) | 0, 0, PN.SEASON_GAMES);
      se.rotationIndex = PN.clamp(fin(se.rotationIndex, 0) | 0, 0, PN.ROTATION.length - 1);
      se.done = !!se.done;
      var st = [];
      PN.TEAMS.forEach(function (t) {
        var row = null;
        for (var i = 0; i < se.standings.length; i += 1) {
          if (se.standings[i] && se.standings[i].id === t.id) { row = se.standings[i]; break; }
        }
        st.push({
          id: t.id,
          w: Math.max(0, fin(row && row.w, 0) | 0),
          l: Math.max(0, fin(row && row.l, 0) | 0),
          rf: Math.max(0, fin(row && row.rf, 0) | 0),
          ra: Math.max(0, fin(row && row.ra, 0) | 0)
        });
      });
      se.standings = st;
      var fm = {};
      PN.ROSTER.forEach(function (p) {
        var v = se.form[p.id];
        fm[p.id] = {
          form: PN.clamp(fin(v && v.form, 0), -0.08, 0.08),
          growth: PN.clamp(fin(v && v.growth, 0), 0, 0.12),
          ab: Math.max(0, fin(v && v.ab, 0) | 0),
          h: Math.max(0, fin(v && v.h, 0) | 0),
          hr: Math.max(0, fin(v && v.hr, 0) | 0),
          rbi: Math.max(0, fin(v && v.rbi, 0) | 0)
        };
      });
      se.form = fm;
      var ar = {};
      PN.ROTATION.forEach(function (a) {
        var v = se.arms[a.id];
        ar[a.id] = {
          rest: PN.clamp(fin(v && v.rest, 1), 0, 1),
          ip: Math.max(0, fin(v && v.ip, 0)),
          k: Math.max(0, fin(v && v.k, 0) | 0)
        };
      });
      se.arms = ar;
      if (se.playoff && !isObj(se.playoff)) se.playoff = null;
      if (se.playoff) {
        se.playoff.round = PN.clamp(fin(se.playoff.round, 0) | 0, 0, 1);
        se.playoff.wins = PN.clamp(fin(se.playoff.wins, 0) | 0, 0, 4);
        se.playoff.losses = PN.clamp(fin(se.playoff.losses, 0) | 0, 0, 4);
        if (PN.TEAMS.every(function (t) { return t.id !== se.playoff.opp; })) se.playoff = null;
      }
      if (!Array.isArray(se.schedule) || se.schedule.length !== PN.SEASON_GAMES) {
        se.schedule = PN.makeSchedule(se.seed);
      }
    }
    return s;
  };

  PN.TIERS = [
    { id: 0, name: 'Rookie Slate', aiBat: 0.94, aiArm: 0.94, window: 1.12 },
    { id: 1, name: 'Contender Slate', aiBat: 1.0, aiArm: 1.0, window: 1.0 },
    { id: 2, name: 'Pennant Slate', aiBat: 1.07, aiArm: 1.08, window: 0.9 }
  ];

  if (typeof module !== 'undefined' && module.exports) module.exports = PN;
})(typeof window !== 'undefined' ? window : globalThis);
