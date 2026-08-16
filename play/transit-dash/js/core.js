/* Transit Dash content, validated persistence, procedural art and utilities. */
(function (root) {
  'use strict';

  var TD = {};
  var TAU = Math.PI * 2;
  var FONT = 'ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif';

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function int(v, d) { return Number.isFinite(v) ? Math.floor(v) : d; }
  function num(v, d) { return Number.isFinite(v) ? v : d; }
  function hash(n) {
    n = (n ^ 0x9E3779B9) >>> 0;
    n = Math.imul(n ^ (n >>> 16), 0x85EBCA6B) >>> 0;
    n = Math.imul(n ^ (n >>> 13), 0xC2B2AE35) >>> 0;
    return (n ^ (n >>> 16)) >>> 0;
  }
  function rng(seed) {
    var a = seed >>> 0;
    function f() {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
      f: f,
      int: function (lo, hi) { return lo + Math.floor(f() * (hi - lo + 1)); },
      pick: function (arr) { return arr[Math.floor(f() * arr.length) % arr.length]; },
      chance: function (p) { return f() < p; }
    };
  }
  function dayKey(date) {
    var d = date || new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }
  function textIfChanged(node, value, color) {
    if (!node) return;
    var next = String(value);
    if (node.text !== next) node.setText(next);
    if (color && node._tdColor !== color) { node.setColor(color); node._tdColor = color; }
  }
  function fillIfChanged(node, value, alpha) {
    if (!node) return;
    var n = typeof value === 'string' ? parseInt(value.replace('#', ''), 16) : value;
    if (node._tdFill !== n || node._tdAlpha !== alpha) {
      node.setFillStyle(n, alpha == null ? 1 : alpha); node._tdFill = n; node._tdAlpha = alpha;
    }
  }
  function safePick(table, key, fallback) { return table[key] || table[fallback] || table[Object.keys(table)[0]]; }

  TD.clamp = clamp;
  TD.int = int;
  TD.num = num;
  TD.hash = hash;
  TD.rng = rng;
  TD.dayKey = dayKey;
  TD.textIfChanged = textIfChanged;
  TD.fillIfChanged = fillIfChanged;
  TD.FONT = FONT;
  TD.VW = 390;
  TD.VH = 844;
  // ----------------------------------------------------------- retina
  // Scale.FIT with a fixed 390x844 design box, so the world coordinate space
  // must NOT move: every position in this title is a literal in that box.
  // The backing store is raised by TD.RETINA and the main camera is zoomed by
  // the same factor. Every canvas this title bakes is baked at that density
  // too (see makeTexture below) and every sprite is scaled back down by it,
  // because a 1x bake magnified 3x would clear the density check and still
  // look exactly as soft as before.
  TD.RETINA = (root.GGKit && root.GGKit.hiDpi) ? root.GGKit.hiDpi.factor(390, 844) : 1;
  TD.STEP = 1 / 60;
  TD.REDUCED = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  TD.COLORS = {
    ink: '#F4F7FF', muted: '#A8B9D2', deep: '#080D18', panel: '#111C2B', panel2: '#17283D',
    line: '#314862', cyan: '#63E4FF', gold: '#FFD166', mint: '#76F0B2', violet: '#C7A5FF',
    pink: '#FF76CC', orange: '#FF9863', red: '#FF6F75', blue: '#7DB7FF', white: '#FFFFFF'
  };

  /* The four lines are intentionally distinct, but every line keeps the same
   * readable road geometry and landmark cadence. */
  TD.STAGES = [
    {id: 'yard', name: 'DAWN YARDS', short: 'YARD', start: 0, end: 900, music: 'music-yard',
      sky: ['#7B5965', '#171D32'], road: '#253447', rail: '#5C7591', accent: '#FFD166',
      far: '#334A62', fog: '#33445A', landmarks: ['crane', 'silo', 'signal'], life: 'commuter'},
    {id: 'underground', name: 'NEON UNDERGROUND', short: 'TUBE', start: 900, end: 1800, music: 'music-tube',
      sky: ['#2C1E56', '#090B1D'], road: '#1D263C', rail: '#8050B8', accent: '#FF76CC',
      far: '#322B5B', fog: '#1F1939', landmarks: ['platform', 'billboard', 'vent'], life: 'crowd'},
    {id: 'river', name: 'ELEVATED RIVER', short: 'RIVER', start: 1800, end: 2800, music: 'music-river',
      sky: ['#315E82', '#101F35'], road: '#253F52', rail: '#6DC7D8', accent: '#63E4FF',
      far: '#446A7B', fog: '#294A61', landmarks: ['bridge', 'ferry', 'tower'], life: 'birds'},
    {id: 'harbour', name: 'HARBOUR TERMINUS', short: 'PORT', start: 2800, end: Infinity, music: 'music-harbour',
      sky: ['#9C5A63', '#201626'], road: '#3B2A3C', rail: '#C78674', accent: '#FF9863',
      far: '#603A4C', fog: '#432A3D', landmarks: ['terminal', 'crane', 'ferry'], life: 'crowd'}
  ];

  TD.CHARACTERS = [
    {id: 'mara', name: 'Mara', role: 'yard runner', color: '#FFD166', trim: '#FF7B70', cost: 0},
    {id: 'juno', name: 'Juno', role: 'signal scout', color: '#63E4FF', trim: '#C7A5FF', cost: 80},
    {id: 'sol', name: 'Sol', role: 'platform skater', color: '#FF76CC', trim: '#FFD166', cost: 120},
    {id: 'ren', name: 'Ren', role: 'river courier', color: '#76F0B2', trim: '#63E4FF', cost: 160},
    {id: 'kai', name: 'Kai', role: 'night conductor', color: '#C7A5FF', trim: '#FF76CC', cost: 200},
    {id: 'tess', name: 'Tess', role: 'harbour sprinter', color: '#FF9863', trim: '#FFD166', cost: 260},
    {id: 'ori', name: 'Ori', role: 'bridge jumper', color: '#7DB7FF', trim: '#76F0B2', cost: 320},
    {id: 'vale', name: 'Vale', role: 'terminal ace', color: '#F4F7FF', trim: '#FF76CC', cost: 400}
  ];
  TD.BOARDS = [
    {id: 'platform', name: 'PLATFORM', trait: 'balanced', color: '#FFD166', cost: 0},
    {id: 'nightline', name: 'NIGHTLINE', trait: 'clean lane read', color: '#63E4FF', cost: 90},
    {id: 'riverglass', name: 'RIVERGLASS', trait: 'bright grind rails', color: '#76F0B2', cost: 150},
    {id: 'freight', name: 'FREIGHT', trait: 'heavy reward sparks', color: '#FF9863', cost: 220},
    {id: 'signalwave', name: 'SIGNALWAVE', trait: 'neon near-misses', color: '#FF76CC', cost: 300},
    {id: 'terminus', name: 'TERMINUS', trait: 'finale favorite', color: '#C7A5FF', cost: 380}
  ];

  /* Twenty missions are the reroll pool. A run sees exactly three at once. */
  TD.MISSIONS = [
    {id: 'm01', label: 'Reach {n} m', kind: 'distance', tiers: [500, 1000, 1800, 2800]},
    {id: 'm02', label: 'Reach {n} m in one run', kind: 'distance', tiers: [700, 1400, 2200, 3600]},
    {id: 'm03', label: 'Score {n}', kind: 'score', tiers: [12000, 30000, 65000, 110000]},
    {id: 'm04', label: 'Bank {n} tokens', kind: 'tokens', tiers: [35, 80, 150, 240]},
    {id: 'm05', label: 'Vault {n} rail cars', kind: 'vault', tiers: [4, 10, 18, 30]},
    {id: 'm06', label: 'Roll under {n} barriers', kind: 'roll', tiers: [5, 12, 22, 36]},
    {id: 'm07', label: 'Near-miss {n} hazards', kind: 'near', tiers: [4, 10, 18, 30]},
    {id: 'm08', label: 'Grind {n} m of rail', kind: 'grind', tiers: [50, 150, 320, 600]},
    {id: 'm09', label: 'Collect {n} power-ups', kind: 'power', tiers: [3, 8, 15, 24]},
    {id: 'm10', label: 'Launch {n} speed ramps', kind: 'ramp', tiers: [2, 6, 12, 20]},
    {id: 'm11', label: 'Change lanes {n} times', kind: 'lane', tiers: [12, 30, 60, 100]},
    {id: 'm12', label: 'Hold a x{n} multiplier', kind: 'mult', tiers: [2, 3, 4, 5]},
    {id: 'm13', label: 'Finish with {n} health', kind: 'health', tiers: [1, 2, 2, 2]},
    {id: 'm14', label: 'Run {n} m without a hit', kind: 'clean', tiers: [350, 800, 1500, 2600]},
    {id: 'm15', label: 'Collect {n} tokens in a row', kind: 'streak', tiers: [8, 18, 32, 50]},
    {id: 'm16', label: 'Cross {n} world lines', kind: 'lines', tiers: [2, 3, 4, 4]},
    {id: 'm17', label: 'Survive {n} seconds', kind: 'time', tiers: [45, 90, 150, 240]},
    {id: 'm18', label: 'Use a shield on {n} hit', kind: 'shield', tiers: [1, 1, 2, 3]},
    {id: 'm19', label: 'Score {n} from near-misses', kind: 'nearScore', tiers: [1000, 4000, 9000, 18000]},
    {id: 'm20', label: 'Complete {n} daily stages', kind: 'stage', tiers: [1, 2, 3, 4]}
  ];
  function missionDef(id) {
    for (var i = 0; i < TD.MISSIONS.length; i++) if (TD.MISSIONS[i].id === id) return TD.MISSIONS[i];
    return TD.MISSIONS[0];
  }
  function missionKnown(id) {
    for (var i = 0; i < TD.MISSIONS.length; i++) if (TD.MISSIONS[i].id === id) return true;
    return false;
  }
  function missionGoal(m) {
    var d = missionDef(m.id);
    return d.tiers[clamp(int(m.tier, 0), 0, d.tiers.length - 1)];
  }
  function missionText(m) { return missionDef(m.id).label.replace('{n}', missionGoal(m)); }
  TD.missionDef = missionDef;
  TD.missionGoal = missionGoal;
  TD.missionText = missionText;

  function pickMissions(seed, existing) {
    var r = rng(seed), pool = TD.MISSIONS.slice(), out = [];
    for (var i = 0; i < 3; i++) {
      var guard = 0, pick;
      do { pick = pool[Math.floor(r.f() * pool.length) % pool.length]; guard++; }
      while (existing && existing.some(function (m) { return m.id === pick.id; }) && guard < 8);
      out.push({id: pick.id, tier: 0, progress: 0});
      pool.splice(pool.indexOf(pick), 1);
    }
    return out;
  }
  TD.pickMissions = pickMissions;

  /* A compact row grammar keeps the library hand-authored and inspectable. */
  function item(type, lane, y, extra) {
    var o = {type: type, lane: lane == null ? 0 : lane};
    if (y != null) o.y = y;
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }
  function row(at, items) { return {at: at, items: items}; }
  var C = [];
  function add(id, difficulty, world, len, rows, landmark) { C.push({id: id, difficulty: difficulty, world: world, len: len, rows: rows, landmark: landmark}); }

  add('yard-open', 0, [0, 1], 24, [row(2, [item('token', 0, 0.8)]), row(14, [item('token', -1, 0.8), item('token', 1, 0.8)])], 'signal');
  add('yard-train-left', 0, [0], 24, [row(4, [item('train', -1), item('token', 1, 0.8)]), row(15, [item('token', 0, 1.0)])], 'silo');
  add('yard-train-right', 0, [0], 24, [row(4, [item('train', 1), item('token', -1, 0.8)]), row(15, [item('token', 0, 1.0)])], 'crane');
  add('yard-barrier', 0, [0], 22, [row(3, [item('barrier', 0), item('token', -1, 0.7)]), row(13, [item('token', 1, 0.8)])], 'signal');
  add('yard-split', 0, [0, 1], 26, [row(4, [item('train', -1), item('barrier', 1)]), row(16, [item('token', 0, 1.1)])], 'platform');
  add('yard-rail', 0, [0], 25, [row(5, [item('rail', 1), item('token', 1, 1.0)]), row(16, [item('token', 0, 0.8)])], 'silo');
  add('yard-crate', 0, [0], 24, [row(4, [item('crate', 0), item('token', -1, 0.8)]), row(12, [item('power', 1, 1.1, {power: 'magnet'})])], 'crane');
  add('yard-ramp', 1, [0, 1], 30, [row(4, [item('ramp', 0), item('token', 0, 1.0)]), row(18, [item('train', -1), item('token', 1, 1.2)])], 'crane');
  add('yard-gap', 1, [0], 28, [row(5, [item('gap', 0), item('token', 0, 1.2)]), row(18, [item('barrier', 1), item('token', -1, 0.8)])], 'signal');
  add('yard-wave', 1, [0], 30, [row(4, [item('train', -1)]), row(12, [item('barrier', 1)]), row(22, [item('token', 0, 1.0)])], 'silo');
  add('yard-gate', 1, [0, 1], 32, [row(5, [item('block', 0), item('token', -1, 0.8)]), row(16, [item('rail', 1), item('token', 1, 1.0)]), row(27, [item('power', -1, 1.1, {power: 'shield'})])], 'platform');
  add('yard-board', 1, [0], 30, [row(4, [item('crate', -1), item('token', 1, 0.9)]), row(15, [item('ramp', 1), item('token', 1, 1.0)]), row(25, [item('token', 0, 1.2)])], 'crane');

  add('tube-lights', 1, [1], 24, [row(3, [item('barrier', -1), item('token', 0, 0.8)]), row(15, [item('token', 1, 1.0)])], 'platform');
  add('tube-double', 1, [1], 28, [row(4, [item('train', -1), item('train', 1), item('token', 0, 1.3)]), row(18, [item('power', 0, 1.1, {power: 'boost'})])], 'billboard');
  add('tube-roll', 1, [1], 25, [row(4, [item('barrier', 0)]), row(15, [item('barrier', 1), item('token', -1, 0.8)])], 'vent');
  add('tube-rail', 1, [1], 26, [row(4, [item('rail', -1), item('token', -1, 1.0)]), row(17, [item('block', 1), item('token', 0, 1.0)])], 'platform');
  add('tube-crates', 1, [1], 28, [row(4, [item('crate', 1), item('token', -1, 0.8)]), row(13, [item('crate', -1), item('power', 0, 1.0, {power: 'jetpack'})]), row(23, [item('token', 1, 1.1)])], 'billboard');
  add('tube-ramp', 2, [1], 31, [row(4, [item('ramp', -1), item('token', -1, 1.1)]), row(18, [item('barrier', 1), item('token', 0, 1.0)]), row(26, [item('token', -1, 1.4)])], 'vent');
  add('tube-gap', 2, [1], 30, [row(4, [item('gap', 1), item('token', 1, 1.2)]), row(17, [item('train', -1), item('token', 0, 0.9)]), row(26, [item('power', 0, 1.1, {power: 'shield'})])], 'platform');
  add('tube-switchback', 2, [1], 33, [row(4, [item('block', 0)]), row(14, [item('train', 1), item('token', -1, 1.0)]), row(25, [item('barrier', -1), item('token', 0, 0.8)])], 'billboard');
  add('tube-signal', 2, [1], 34, [row(4, [item('rail', 1), item('token', 1, 1.0)]), row(16, [item('gap', -1), item('token', -1, 1.1)]), row(27, [item('ramp', 0), item('token', 0, 1.3)])], 'vent');
  add('tube-triple', 2, [1], 36, [row(4, [item('train', -1)]), row(13, [item('barrier', 0)]), row(23, [item('block', 1), item('token', -1, 1.0)]), row(31, [item('power', 0, 1.0, {power: 'boost'})])], 'platform');
  add('tube-board', 2, [1], 32, [row(4, [item('crate', -1), item('token', 1, 0.9)]), row(15, [item('ramp', 1), item('token', 1, 1.2)]), row(25, [item('rail', 0), item('power', 0, 1.1, {power: 'jetpack'})])], 'billboard');

  add('river-birds', 2, [2], 26, [row(4, [item('train', 0), item('token', -1, 1.0)]), row(16, [item('token', 1, 1.1)])], 'bridge');
  add('river-ferry', 2, [2], 28, [row(4, [item('barrier', -1), item('token', 1, 0.8)]), row(16, [item('rail', 1), item('token', 1, 1.0)]), row(24, [item('power', 0, 1.1, {power: 'magnet'})])], 'ferry');
  add('river-gap', 2, [2], 30, [row(4, [item('gap', 0), item('token', 0, 1.3)]), row(17, [item('train', -1), item('token', 1, 1.0)]), row(26, [item('barrier', 1)])], 'tower');
  add('river-ramp', 2, [2], 32, [row(4, [item('ramp', 1), item('token', 1, 1.2)]), row(19, [item('block', -1), item('token', 0, 1.0)]), row(27, [item('power', 0, 1.1, {power: 'boost'})])], 'bridge');
  add('river-rail', 2, [2], 30, [row(4, [item('rail', -1), item('token', -1, 1.0)]), row(15, [item('train', 1), item('token', 0, 1.1)]), row(25, [item('token', 1, 0.9)])], 'ferry');
  add('river-cross', 2, [2], 34, [row(4, [item('barrier', 1), item('token', -1, 0.8)]), row(16, [item('gap', -1), item('token', -1, 1.2)]), row(28, [item('block', 0), item('power', 1, 1.1, {power: 'shield'})])], 'tower');
  add('river-double', 3, [2], 34, [row(4, [item('train', -1), item('train', 1), item('token', 0, 1.4)]), row(17, [item('ramp', 0), item('token', 0, 1.2)]), row(28, [item('token', 1, 1.0)])], 'bridge');
  add('river-split', 3, [2], 36, [row(4, [item('block', 0), item('token', -1, 0.9)]), row(14, [item('rail', 1), item('gap', -1)]), row(26, [item('barrier', 0), item('token', 1, 1.0)]), row(32, [item('power', -1, 1.1, {power: 'jetpack'})])], 'ferry');
  add('river-tide', 3, [2], 38, [row(4, [item('gap', 1), item('token', 1, 1.2)]), row(15, [item('train', 0)]), row(25, [item('barrier', -1), item('token', 1, 1.0)]), row(34, [item('ramp', 0), item('token', 0, 1.3)])], 'tower');
  add('river-board', 3, [2], 35, [row(4, [item('crate', 0), item('token', -1, 0.8)]), row(15, [item('ramp', -1), item('token', -1, 1.2)]), row(27, [item('rail', 1), item('power', 1, 1.1, {power: 'boost'})])], 'bridge');

  add('port-sunset', 3, [3], 28, [row(4, [item('barrier', 0), item('token', -1, 0.8)]), row(16, [item('token', 1, 1.0)])], 'terminal');
  add('port-cranes', 3, [3], 30, [row(4, [item('train', 1), item('token', -1, 1.0)]), row(16, [item('rail', -1), item('token', -1, 1.0)]), row(25, [item('power', 0, 1.1, {power: 'magnet'})])], 'crane');
  add('port-gap', 3, [3], 31, [row(4, [item('gap', -1), item('token', -1, 1.2)]), row(17, [item('barrier', 1), item('token', 0, 0.9)]), row(27, [item('block', 0)])], 'ferry');
  add('port-ramp', 3, [3], 34, [row(4, [item('ramp', 0), item('token', 0, 1.2)]), row(19, [item('train', -1), item('token', 1, 1.0)]), row(28, [item('power', 1, 1.1, {power: 'shield'})])], 'terminal');
  add('port-rail', 3, [3], 32, [row(4, [item('rail', 1), item('token', 1, 1.0)]), row(16, [item('gap', 0), item('token', 0, 1.2)]), row(27, [item('barrier', -1), item('token', 1, 0.8)])], 'crane');
  add('port-double', 3, [3], 36, [row(4, [item('train', -1), item('train', 1), item('token', 0, 1.4)]), row(17, [item('barrier', 0)]), row(28, [item('token', -1, 1.0)]), row(33, [item('power', 1, 1.1, {power: 'boost'})])], 'ferry');
  add('port-signal', 3, [3], 37, [row(4, [item('block', 0)]), row(15, [item('ramp', -1), item('token', -1, 1.2)]), row(26, [item('gap', 1), item('token', 1, 1.2)]), row(34, [item('rail', 0)])], 'terminal');
  add('port-finale', 3, [3], 42, [row(4, [item('crate', -1), item('token', 1, 0.9)]), row(15, [item('train', 1)]), row(25, [item('barrier', 0), item('token', -1, 1.0)]), row(35, [item('ramp', 0), item('token', 0, 1.4)]), row(39, [item('power', 0, 1.1, {power: 'jetpack'})])], 'terminal');
  add('port-terminus', 3, [3], 44, [row(4, [item('gap', 0), item('token', 0, 1.3)]), row(16, [item('rail', -1), item('token', -1, 1.0)]), row(27, [item('train', 1)]), row(37, [item('barrier', -1), item('token', 1, 1.0)]), row(41, [item('power', 0, 1.1, {power: 'shield'})])], 'terminal');
  TD.CHUNKS = C;

  function stageAt(distance) {
    var n = Math.max(0, distance);
    for (var i = TD.STAGES.length - 1; i >= 0; i--) if (n >= TD.STAGES[i].start) return i;
    return 0;
  }
  TD.stageAt = stageAt;
  TD.stage = function (index) { return safePick(TD.STAGES, index, 0); };

  var SAVE_VERSION = 4;
  function defaultSave() {
    return {
      v: SAVE_VERSION, tokens: 0, bestDistance: 0, bestScore: 0, runs: 0,
      selectedCharacter: 'mara', selectedBoard: 'platform',
      characters: TD.CHARACTERS.map(function (c, i) { return i === 0; }),
      boards: TD.BOARDS.map(function (b, i) { return i === 0; }),
      missions: pickMissions(hash(dayKey())), dailyDate: dayKey(), daily: [],
      missionRerolls: 0, timeBest: 0
    };
  }
  function validBoolArray(a, n) { return Array.isArray(a) && a.length === n && a.every(function (v) { return typeof v === 'boolean'; }); }
  function validateSave(o) {
    return !!(o && typeof o === 'object' && o.v === SAVE_VERSION && Number.isInteger(o.tokens) && o.tokens >= 0 && o.tokens <= 9999999 &&
      Number.isInteger(o.bestDistance) && o.bestDistance >= 0 && Number.isInteger(o.bestScore) && o.bestScore >= 0 && Number.isInteger(o.runs) && o.runs >= 0 &&
      validBoolArray(o.characters, TD.CHARACTERS.length) && validBoolArray(o.boards, TD.BOARDS.length) &&
      typeof o.selectedCharacter === 'string' && typeof o.selectedBoard === 'string' && Array.isArray(o.missions) && o.missions.length === 3 &&
      o.missions.every(function (m) { return !!m && typeof m.id === 'string' && missionKnown(m.id) && Number.isInteger(m.tier) && m.tier >= 0 && m.tier <= 3 && Number.isInteger(m.progress) && m.progress >= 0; }) &&
      Number.isInteger(o.dailyDate) && Array.isArray(o.daily) && o.daily.length <= 5 && o.daily.every(function (e) { return e && Number.isInteger(e.score) && e.score >= 0 && Number.isInteger(e.distance) && e.distance >= 0; }) &&
      Number.isInteger(o.missionRerolls) && o.missionRerolls >= 0 && Number.isInteger(o.timeBest) && o.timeBest >= 0);
  }
  function normalizeSave(raw) {
    var d = defaultSave();
    if (!validateSave(raw)) return d;
    d = JSON.parse(JSON.stringify(raw));
    var charOk = false, boardOk = false;
    for (var i = 0; i < TD.CHARACTERS.length; i++) if (d.characters[i] && d.selectedCharacter === TD.CHARACTERS[i].id) charOk = true;
    for (var j = 0; j < TD.BOARDS.length; j++) if (d.boards[j] && d.selectedBoard === TD.BOARDS[j].id) boardOk = true;
    if (!charOk) d.selectedCharacter = TD.CHARACTERS[0].id;
    if (!boardOk) d.selectedBoard = TD.BOARDS[0].id;
    if (d.dailyDate !== dayKey()) { d.dailyDate = dayKey(); d.daily = []; }
    return d;
  }
  TD.SAVE_VERSION = SAVE_VERSION;
  TD.defaultSave = defaultSave;
  TD.validateSave = validateSave;
  TD.normalizeSave = normalizeSave;

  /* All art is generated before any game object refers to a texture. */
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function hex(v) { return parseInt(String(v).replace('#', ''), 16) || 0; }
  function rr(ctx, x, y, w, h, r) {
    var q = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath(); ctx.moveTo(x + q, y); ctx.arcTo(x + w, y, x + w, y + h, q);
    ctx.arcTo(x + w, y + h, x, y + h, q); ctx.arcTo(x, y + h, x, y, q); ctx.arcTo(x, y, x + w, y, q); ctx.closePath();
  }
  function makeTexture(scene, key, w, h, draw) {
    // Baked at device density; the draw callback still works in design units
    // because the context carries the scale. Do NOT set source.resolution to
    // compensate: that only affects the CANVAS renderer, and under WebGL it
    // makes the quad TD.RETINA times too large. Consumers scale down instead.
    var d = TD.RETINA;
    var c = canvas(Math.round(w * d), Math.round(h * d)), ctx = c.getContext('2d');
    ctx.scale(d, d);
    draw(ctx, w, h);
    scene.textures.addCanvas(key, c);
  }
  function text(ctx, str, x, y, size, color, align) {
    ctx.font = '700 ' + size + 'px ' + FONT; ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.fillText(str, x, y);
  }
  function glow(ctx, x, y, r, color, alpha) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1;
  }

  var Art = {
    bake: function (scene) {
      var colors = TD.COLORS;
      TD.STAGES.forEach(function (st, si) {
        makeTexture(scene, 'td-bg-' + st.id, 390, 844, function (ctx, w, h) {
          var g = ctx.createLinearGradient(0, 0, 0, 430); g.addColorStop(0, st.sky[0]); g.addColorStop(1, st.sky[1]); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
          glow(ctx, 286, 150, 130, st.accent, 0.13);
          ctx.fillStyle = st.far; ctx.globalAlpha = 0.88;
          for (var b = 0; b < 17; b++) { var bw = 16 + (b * 13 % 30), bh = 38 + (b * 17 % 100); ctx.fillRect(b * 28 - 20, 345 - bh, bw, bh); }
          ctx.globalAlpha = 1;
          ctx.strokeStyle = st.accent; ctx.globalAlpha = 0.34; ctx.lineWidth = 2;
          for (var s = 0; s < 9; s++) { ctx.beginPath(); ctx.moveTo(s * 52, 318); ctx.lineTo(s * 52 + 32, 281 + (s % 3) * 14); ctx.stroke(); }
          ctx.globalAlpha = 1;
          ctx.fillStyle = st.road; ctx.beginPath(); ctx.moveTo(100, 340); ctx.lineTo(290, 340); ctx.lineTo(390, 844); ctx.lineTo(0, 844); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = st.rail; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(100, 340); ctx.lineTo(0, 844); ctx.moveTo(290, 340); ctx.lineTo(390, 844); ctx.stroke();
          ctx.strokeStyle = st.accent; ctx.globalAlpha = 0.22; ctx.lineWidth = 3;
          for (var l = 0; l < 2; l++) { var x = 163 + l * 64; ctx.beginPath(); ctx.moveTo(x, 340); ctx.lineTo(195 + (l ? 195 : -195), 844); ctx.stroke(); }
          ctx.globalAlpha = 1;
          for (var t = 0; t < 16; t++) { var y = 365 + t * t * 1.9; ctx.fillStyle = 'rgba(255,255,255,' + (0.04 + t * 0.006) + ')'; ctx.fillRect(100 - t * 5, y, 190 + t * 10, 2 + t * 0.35); }
          ctx.fillStyle = st.fog; ctx.globalAlpha = 0.36; ctx.fillRect(0, 312, w, 92); ctx.globalAlpha = 1;
          if (si === 0) { ctx.strokeStyle = colors.gold; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(36, 335); ctx.lineTo(36, 218); ctx.lineTo(94, 218); ctx.stroke(); }
          if (si === 1) { for (var n = 0; n < 5; n++) { ctx.fillStyle = '#5C36A0'; ctx.fillRect(20 + n * 88, 130, 10, 190); glow(ctx, 25 + n * 88, 218, 28, st.accent, 0.35); } text(ctx, 'NIGHTLINE', 196, 180, 18, st.accent); }
          if (si === 2) { ctx.fillStyle = '#367E91'; ctx.fillRect(0, 288, w, 35); ctx.strokeStyle = '#86D7D2'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(20, 288); ctx.lineTo(80, 235); ctx.lineTo(140, 288); ctx.moveTo(260, 288); ctx.lineTo(315, 230); ctx.lineTo(370, 288); ctx.stroke(); }
          if (si === 3) { ctx.strokeStyle = '#D48D6C'; ctx.lineWidth = 12; ctx.strokeRect(64, 194, 262, 120); ctx.strokeStyle = '#FFD09B'; ctx.lineWidth = 3; ctx.strokeRect(78, 208, 234, 94); text(ctx, 'TERMINUS', 195, 254, 20, '#FFD09B'); }
        });
      });
      var chars = TD.CHARACTERS;
      chars.forEach(function (ch) {
        makeTexture(scene, 'td-char-' + ch.id, 96, 144, function (ctx) {
          glow(ctx, 48, 75, 42, ch.color, 0.18); ctx.fillStyle = '#101A29'; ctx.fillRect(22, 78, 52, 46);
          ctx.fillStyle = ch.color; ctx.fillRect(27, 66, 42, 47); ctx.fillRect(16, 76, 15, 34); ctx.fillRect(65, 76, 15, 34);
          ctx.fillStyle = ch.trim; ctx.fillRect(27, 91, 42, 9); ctx.fillStyle = '#EFC6A4'; ctx.beginPath(); ctx.arc(48, 50, 18, 0, TAU); ctx.fill();
          ctx.fillStyle = '#202B40'; ctx.fillRect(30, 30, 36, 11); ctx.fillStyle = '#283751'; ctx.fillRect(28, 113, 15, 25); ctx.fillRect(53, 113, 15, 25);
        });
      });
      makeTexture(scene, 'td-shadow', 112, 30, function (ctx) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(56, 15, 48, 9, 0, 0, TAU); ctx.fill(); });
      makeTexture(scene, 'td-token', 44, 44, function (ctx) { glow(ctx, 22, 22, 22, colors.gold, 0.4); ctx.fillStyle = colors.gold; ctx.beginPath(); ctx.arc(22, 22, 13, 0, TAU); ctx.fill(); ctx.strokeStyle = '#FFF2B0'; ctx.lineWidth = 3; ctx.stroke(); text(ctx, '◆', 22, 28, 13, '#744A20'); });
      makeTexture(scene, 'td-token-blue', 44, 44, function (ctx) { glow(ctx, 22, 22, 22, colors.cyan, 0.4); ctx.fillStyle = colors.cyan; ctx.beginPath(); ctx.arc(22, 22, 13, 0, TAU); ctx.fill(); ctx.strokeStyle = '#D8FAFF'; ctx.lineWidth = 3; ctx.stroke(); text(ctx, '◆', 22, 28, 13, '#14526C'); });
      makeTexture(scene, 'td-train', 104, 132, function (ctx) { glow(ctx, 52, 66, 48, colors.cyan, 0.14); ctx.fillStyle = '#2B496C'; rr(ctx, 12, 13, 80, 106, 11); ctx.fill(); ctx.fillStyle = '#A5D9E6'; ctx.fillRect(23, 35, 58, 32); ctx.fillStyle = '#112139'; ctx.fillRect(28, 40, 20, 22); ctx.fillRect(56, 40, 20, 22); ctx.fillStyle = colors.gold; ctx.fillRect(12, 76, 80, 12); ctx.fillStyle = '#152338'; ctx.fillRect(29, 98, 16, 16); ctx.fillRect(59, 98, 16, 16); });
      makeTexture(scene, 'td-barrier', 112, 118, function (ctx) { glow(ctx, 56, 54, 50, colors.orange, 0.12); ctx.fillStyle = '#5A2B35'; ctx.fillRect(10, 25, 92, 67); ctx.fillStyle = colors.orange; ctx.fillRect(16, 34, 80, 16); ctx.fillStyle = colors.gold; for (var i = 0; i < 4; i++) ctx.fillRect(16 + i * 22, 55, 12, 29); ctx.fillStyle = '#D95B4C'; ctx.fillRect(20, 92, 18, 20); ctx.fillRect(74, 92, 18, 20); });
      makeTexture(scene, 'td-block', 96, 136, function (ctx) { glow(ctx, 48, 64, 48, colors.pink, 0.12); ctx.fillStyle = '#31415B'; rr(ctx, 13, 14, 70, 108, 8); ctx.fill(); ctx.fillStyle = colors.pink; ctx.fillRect(13, 55, 70, 14); ctx.fillStyle = '#FFDBEF'; ctx.beginPath(); ctx.arc(48, 43, 12, 0, TAU); ctx.fill(); ctx.fillStyle = '#152238'; ctx.fillRect(28, 81, 40, 24); });
      makeTexture(scene, 'td-gap', 116, 76, function (ctx) { glow(ctx, 58, 37, 52, colors.cyan, 0.16); ctx.fillStyle = '#070C15'; ctx.fillRect(10, 14, 96, 47); ctx.strokeStyle = colors.cyan; ctx.lineWidth = 5; ctx.strokeRect(11, 15, 94, 45); ctx.strokeStyle = '#B1F6FF'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(25, 23); ctx.lineTo(42, 50); ctx.lineTo(56, 26); ctx.lineTo(76, 51); ctx.lineTo(92, 22); ctx.stroke(); });
      makeTexture(scene, 'td-ramp', 116, 84, function (ctx) { glow(ctx, 58, 42, 54, colors.mint, 0.16); ctx.fillStyle = '#2C6E61'; ctx.beginPath(); ctx.moveTo(10, 65); ctx.lineTo(106, 65); ctx.lineTo(86, 17); ctx.lineTo(30, 17); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#C5FFE0'; ctx.lineWidth = 4; ctx.stroke(); ctx.fillStyle = colors.mint; ctx.fillRect(32, 30, 54, 8); });
      makeTexture(scene, 'td-rail', 96, 82, function (ctx) { glow(ctx, 48, 42, 46, colors.violet, 0.16); ctx.fillStyle = '#26344D'; ctx.fillRect(8, 40, 80, 9); ctx.fillStyle = colors.violet; ctx.fillRect(12, 34, 72, 7); ctx.fillStyle = '#BFE9FF'; ctx.fillRect(22, 19, 6, 25); ctx.fillRect(68, 19, 6, 25); });
      makeTexture(scene, 'td-crate', 94, 94, function (ctx) { glow(ctx, 47, 47, 45, colors.gold, 0.14); ctx.fillStyle = '#8A573B'; rr(ctx, 11, 11, 72, 72, 8); ctx.fill(); ctx.strokeStyle = '#FFD59A'; ctx.lineWidth = 5; ctx.strokeRect(21, 21, 52, 52); ctx.beginPath(); ctx.moveTo(21, 21); ctx.lineTo(73, 73); ctx.moveTo(73, 21); ctx.lineTo(21, 73); ctx.stroke(); });
      ['magnet', 'shield', 'boost', 'jetpack'].forEach(function (kind, i) {
        makeTexture(scene, 'td-power-' + kind, 62, 62, function (ctx) { var col = [colors.pink, colors.cyan, colors.gold, colors.mint][i]; glow(ctx, 31, 31, 31, col, 0.35); ctx.fillStyle = '#101A29'; ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(31, 31, 22, 0, TAU); ctx.fill(); ctx.stroke(); text(ctx, ['M', 'S', 'B', 'J'][i], 31, 40, 23, col); });
      });
      makeTexture(scene, 'td-spark', 18, 18, function (ctx) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(3, 3, 12, 12); glow(ctx, 9, 9, 9, colors.cyan, 0.55); });
      makeTexture(scene, 'td-bird', 72, 36, function (ctx) { ctx.strokeStyle = '#D6F4FF'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(4, 20); ctx.quadraticCurveTo(18, 3, 34, 20); ctx.quadraticCurveTo(50, 3, 68, 20); ctx.stroke(); });
      makeTexture(scene, 'td-crowd', 88, 78, function (ctx) { for (var i = 0; i < 5; i++) { ctx.fillStyle = ['#FF76CC', '#63E4FF', '#FFD166', '#76F0B2', '#C7A5FF'][i]; ctx.beginPath(); ctx.arc(11 + i * 17, 23 + (i % 2) * 4, 9, 0, TAU); ctx.fill(); ctx.fillRect(4 + i * 17, 33 + (i % 2) * 4, 14, 34); } });
      makeTexture(scene, 'td-ferry', 124, 70, function (ctx) { ctx.fillStyle = '#CF7A6E'; ctx.fillRect(12, 35, 100, 23); ctx.fillStyle = '#F7D6B0'; ctx.fillRect(30, 15, 64, 25); ctx.fillStyle = '#31546C'; ctx.fillRect(37, 19, 18, 14); ctx.fillRect(64, 19, 18, 14); ctx.fillStyle = '#FFE3AE'; ctx.fillRect(24, 58, 76, 5); });
      makeTexture(scene, 'td-sign', 100, 72, function (ctx) { ctx.fillStyle = '#16253B'; rr(ctx, 4, 5, 92, 52, 8); ctx.fill(); ctx.strokeStyle = '#63E4FF'; ctx.lineWidth = 3; ctx.stroke(); text(ctx, 'LINE', 50, 37, 17, '#63E4FF'); ctx.fillStyle = '#6A91B6'; ctx.fillRect(47, 57, 6, 15); });
    }
  };
  TD.Art = Art;

  TD.getCharacter = function (id) { return TD.CHARACTERS.find(function (c) { return c.id === id; }) || TD.CHARACTERS[0]; };
  TD.getBoard = function (id) { return TD.BOARDS.find(function (b) { return b.id === id; }) || TD.BOARDS[0]; };
  TD.saveDailyScore = function (save, score, distance) {
    var entry = {score: Math.max(0, int(score, 0)), distance: Math.max(0, int(distance, 0))};
    save.daily.push(entry); save.daily.sort(function (a, b) { return b.score - a.score; }); if (save.daily.length > 5) save.daily.length = 5;
  };

  root.TD = TD;
})(window);
