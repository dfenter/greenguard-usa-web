/* Scrapper Squad - fleet F9 AAA rebuild.
 * Phaser is presentation only. GGKit owns lifecycle, input, save, audio,
 * pause, restart, reduced-motion settings, and PWA registration.
 */
(function () {
  'use strict';

  var WORLD_W = 960;
  var WORLD_H = 540;
  var STEP = 1 / 60;
  var MAX_STEPS = 3;
  var VERSION = '2026-08-11-aaa2';
  var FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  var C = {
    ink: '#06111c', paper: '#eef7ff', dim: '#91aabd', line: '#24485d',
    cyan: '#5dd7ff', cyanDeep: '#1a73b7', red: '#ff6c85', redDeep: '#872948',
    gold: '#ffd66b', green: '#83efb0', violet: '#bd8cff', orange: '#ffb65d',
    white: '#ffffff', black: '#07111c'
  };
  var MODE_ORDER = ['gem', 'heist', 'gauntlet', 'showdown'];
  var MODES = {
    gem: { key: 'gem', label: 'GEM HOARD', icon: '◆', goal: 'Hold 10 gems for 15 seconds', rule: 'gem', limit: 150, arena: 'gem_pit' },
    heist: { key: 'heist', label: 'HEIST', icon: '▣', goal: 'Crack the enemy safe before 2:30', rule: 'heist', limit: 150, arena: 'heist_vault' },
    gauntlet: { key: 'gauntlet', label: 'BRAWL GAUNTLET', icon: '✦', goal: 'Four authored 3v3 bouts', rule: 'gem', limit: 150, arena: 'gem_pit' },
    showdown: { key: 'showdown', label: 'SHOWDOWN', icon: '◈', goal: 'Last scrapper standing', rule: 'showdown', limit: 120, arena: 'showdown_field' }
  };
  var ARENAS = {
    gem_pit: {
      key: 'gem_pit', name: 'GEM PIT', icon: '◆', accent: '#ffd66b', base: '#102936', hazard: 'GEYSER', hazardKind: 'geyser',
      covers: [{ x: 188, y: 106, w: 150, h: 30 }, { x: 622, y: 404, w: 150, h: 30 }, { x: 188, y: 404, w: 150, h: 30 }, { x: 622, y: 106, w: 150, h: 30 }, { x: 372, y: 152, w: 38, h: 108 }, { x: 550, y: 280, w: 38, h: 108 }]
    },
    heist_vault: {
      key: 'heist_vault', name: 'VAULT ROW', icon: '▣', accent: '#ff6c85', base: '#251a30', hazard: 'LASER LANE', hazardKind: 'laser',
      covers: [{ x: 168, y: 104, w: 132, h: 44 }, { x: 660, y: 392, w: 132, h: 44 }, { x: 168, y: 392, w: 132, h: 44 }, { x: 660, y: 104, w: 132, h: 44 }, { x: 366, y: 94, w: 46, h: 124 }, { x: 548, y: 322, w: 46, h: 124 }]
    },
    showdown_field: {
      key: 'showdown_field', name: 'OPEN FIELD', icon: '◈', accent: '#83efb0', base: '#102d2b', hazard: 'STORM RING', hazardKind: 'storm',
      covers: [{ x: 254, y: 104, w: 78, h: 78 }, { x: 628, y: 104, w: 78, h: 78 }, { x: 254, y: 358, w: 78, h: 78 }, { x: 628, y: 358, w: 78, h: 78 }, { x: 446, y: 94, w: 68, h: 38 }, { x: 446, y: 408, w: 68, h: 38 }]
    },
    championship: {
      key: 'championship', name: 'CHAMPIONSHIP', icon: '✦', accent: '#bd8cff', base: '#211a35', hazard: 'CRUSHER CORE', hazardKind: 'crusher',
      covers: [{ x: 152, y: 98, w: 164, h: 30 }, { x: 644, y: 412, w: 164, h: 30 }, { x: 152, y: 412, w: 164, h: 30 }, { x: 644, y: 98, w: 164, h: 30 }, { x: 342, y: 174, w: 48, h: 174 }, { x: 570, y: 174, w: 48, h: 174 }]
    }
  };
  var KITS = [
    { id: 'rattle', name: 'RATTLE', role: 'BUCKSHOT', kind: 'shotgun', color: '#ffb65d', hp: 120, speed: 220, fire: .62, damage: 11, shots: 5, spread: .22, range: 285, super: 'BREACH RING' },
    { id: 'skylens', name: 'SKYLENS', role: 'PRECISION', kind: 'sniper', color: '#82b9ff', hp: 82, speed: 190, fire: 1.02, damage: 42, shots: 1, spread: 0, range: 610, super: 'RAIL FLASH' },
    { id: 'soothe', name: 'SOOTHE', role: 'FIELD MEDIC', kind: 'healer', color: '#7df2cd', hp: 96, speed: 208, fire: .72, damage: 13, shots: 1, spread: 0, range: 390, super: 'MEND FIELD' },
    { id: 'grub', name: 'GRUB', role: 'FRONT TANK', kind: 'tank', color: '#e5d176', hp: 168, speed: 150, fire: .78, damage: 17, shots: 3, spread: .16, range: 315, super: 'IRON WAKE' },
    { id: 'popstone', name: 'POPSTONE', role: 'LOBBER', kind: 'bomber', color: '#ff8fa3', hp: 102, speed: 195, fire: .9, damage: 38, shots: 1, spread: 0, range: 420, super: 'MINE GARDEN' },
    { id: 'crosscut', name: 'CROSSCUT', role: 'DASHER', kind: 'dasher', color: '#eaa6ff', hp: 90, speed: 268, fire: .34, damage: 15, shots: 1, spread: 0, range: 350, super: 'RIPLINE DASH' },
    { id: 'rivet', name: 'RIVET', role: 'ENGINEER', kind: 'engineer', color: '#72e5ed', hp: 108, speed: 190, fire: .58, damage: 15, shots: 1, spread: 0, range: 440, super: 'DROP TURRET' },
    { id: 'orbit', name: 'ORBIT', role: 'BOOMERANG', kind: 'boomerang', color: '#b59cff', hp: 108, speed: 214, fire: .7, damage: 23, shots: 1, spread: 0, range: 400, super: 'TRIPLE ARC' }
  ];
  var KIT_BY_ID = {};
  for (var k0 = 0; k0 < KITS.length; k0++) KIT_BY_ID[KITS[k0].id] = KITS[k0];
  var GAUNTLET = [
    { name: 'SCRAP START', arena: 'gem_pit', rule: 'gem', enemies: [1, 4, 5], allies: [2, 6] },
    { name: 'VAULT RUN', arena: 'heist_vault', rule: 'heist', enemies: [3, 7, 0], allies: [1, 2] },
    { name: 'GLOW BREAK', arena: 'showdown_field', rule: 'gem', enemies: [5, 6, 4], allies: [3, 7] },
    { name: 'CHAMPIONSHIP', arena: 'championship', rule: 'heist', enemies: [1, 3, 7], allies: [2, 6] }
  ];
  var ROAD = [
    { trophies: 0, kit: 0 }, { trophies: 3, kit: 1 }, { trophies: 6, kit: 2 }, { trophies: 9, kit: 3 },
    { trophies: 12, kit: 4 }, { trophies: 15, kit: 5 }, { trophies: 18, kit: 6 }, { trophies: 21, kit: 7 }
  ];
  var TEAM_COLORS = [C.cyan, C.red, C.green, C.violet, C.gold, C.orange, '#72e5ed', '#eaa6ff'];

  function clamp(n, a, b) { return n < a ? a : n > b ? b : n; }
  function finite(n, fallback, a, b) { n = Number(n); return isFinite(n) ? clamp(n, a, b) : fallback; }
  function dist(ax, ay, bx, by) { var x = ax - bx, y = ay - by; return Math.sqrt(x * x + y * y); }
  function magnitude(x, y) { return Math.sqrt(x * x + y * y); }
  function normalized(x, y) { var m = magnitude(x, y); return m > .001 ? { x: x / m, y: y / m } : { x: 1, y: 0 }; }
  function angleOf(x, y) { return Math.atan2(y, x); }
  function hex(color) { return Phaser.Display.Color.HexStringToColor(color || C.cyan).color; }
  function textStyle(size, color, weight) { return { fontFamily: FONT, fontSize: size + 'px', color: color || C.paper, fontStyle: weight || 'bold', resolution: window.GGKit.hiDpi.dpr() }; }
  function setTextIfChanged(obj, value) { if (obj && obj.text !== String(value)) obj.setText(String(value)); }
  function setColorIfChanged(obj, value) { if (obj && obj.style && obj.style.color !== value) obj.setColor(value); }
  function timeText(seconds) { var s = Math.max(0, Math.ceil(seconds)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function fmt(n) { return String(Math.max(0, Math.floor(Number(n) || 0))); }
  function isRecord(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function has(table, key) { return !!table && Object.prototype.hasOwnProperty.call(table, key); }
  function lookup(table, key, fallback) {
    if (has(table, key)) return table[key];
    if (has(table, fallback)) return table[fallback];
    for (var k in table) if (has(table, k)) return table[k];
    return null;
  }
  function safeKit(index) { return KITS[finite(index, 0, 0, KITS.length - 1) | 0] || KITS[0]; }
  function safeMode(key) { return lookup(MODES, key, 'gem') || MODES.gem; }
  function safeArena(key) { return lookup(ARENAS, key, 'gem_pit') || ARENAS.gem_pit; }
  function colorFor(actor) { return TEAM_COLORS[actor.team % TEAM_COLORS.length] || C.cyan; }
  function rectContains(x, y, r, pad) { var p = pad == null ? 0 : pad; return x >= r.x - p && x <= r.x + r.w + p && y >= r.y - p && y <= r.y + r.h + p; }

  var reduceMotion = false;
  try { reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e0) { reduceMotion = false; }

  function blankSave() {
    return { v: 3, trophies: 0, wins: 0, losses: 0, brawler: 0, gauntlet: 0, gemStreak: 0, bestGems: 0, bestSafeSpeed: 999, bestShowdown: 0,
      medals: { gem: 'none', heist: 'none', gauntlet: 'none', showdown: 'none' } };
  }
  function validateSave(o) {
    if (!isRecord(o) || o.v !== 3) return false;
    var nums = ['trophies', 'wins', 'losses', 'brawler', 'gauntlet', 'gemStreak', 'bestGems', 'bestSafeSpeed', 'bestShowdown'];
    for (var i = 0; i < nums.length; i++) if (!isFinite(Number(o[nums[i]])) || Number(o[nums[i]]) < 0) return false;
    if (o.brawler >= KITS.length || o.gauntlet > GAUNTLET.length || !isRecord(o.medals)) return false;
    var allowed = { none: 1, bronze: 1, silver: 1, gold: 1 };
    for (i = 0; i < MODE_ORDER.length; i++) if (!allowed[o.medals[MODE_ORDER[i]]]) return false;
    return true;
  }

  var Runtime = { game: null, menu: null, live: null };
  var pendingSwitch = { mode: null, arena: null };
  var state = { phase: 'boot', mode: 'gem', arena: 'gem_pit', gems: 0, trophies: 0, brawler: 'RATTLE', timer: 150, medal: 'none', safe: 100, enemySafe: 100 };
  var hook = {
    state: state,
    version: VERSION,
    ready: false,
    error: null,
    forceMode: function (mode) {
      if (!has(MODES, mode)) return false;
      pendingSwitch.mode = mode;
      if (Runtime.live) { Runtime.live.forceMode(mode); return true; }
      if (Runtime.menu) { Runtime.menu.selectMode(mode); return true; }
      return true;
    },
    forceArena: function (arena) {
      if (!has(ARENAS, arena)) return false;
      pendingSwitch.arena = arena;
      if (Runtime.live) { Runtime.live.forceArena(arena); return true; }
      if (Runtime.menu) { Runtime.menu.selectArena(arena); return true; }
      return true;
    },
    start: function (mode, arena, brawler) {
      if (has(MODES, mode)) pendingSwitch.mode = mode;
      if (has(ARENAS, arena)) pendingSwitch.arena = arena;
      Runtime.next = { mode: pendingSwitch.mode || 'gem', arena: pendingSwitch.arena, brawler: brawler };
      kit.restart();
      return true;
    },
    snapshot: function () { return JSON.parse(JSON.stringify(state)); }
  };
  window.__ss = hook;

  (function readBootSwitches() {
    try {
      var q = new URLSearchParams(window.location.search);
      if (has(MODES, q.get('mode'))) pendingSwitch.mode = q.get('mode');
      if (has(ARENAS, q.get('arena'))) pendingSwitch.arena = q.get('arena');
    } catch (e1) {}
  })();

  var kit = window.GGKit.create({
    slug: 'scrapper-squad',
    orientation: 'landscape',
    validateSave: validateSave,
    onPause: function () { if (Runtime.live) Runtime.live.pausedByKit = true; },
    onResume: function () { if (Runtime.live) Runtime.live.pausedByKit = false; },
    onRestart: function () {
      var next = Runtime.next || { mode: state.mode || 'gem', arena: state.arena, brawler: save.brawler };
      Runtime.next = null;
      if (Runtime.game) Runtime.game.scene.start('play', next);
    }
  });
  if (reduceMotion) kit.juice.enabled = false;
  kit.audio.register({
    shot_fire: 'assets/sfx_shot_fire.mp3', gem_pickup: 'assets/sfx_gem_pickup.mp3', super_roar: 'assets/sfx_super_roar.mp3',
    victory_fanfare: 'assets/sfx_victory_fanfare.mp3', music_arena: 'assets/music_arena.mp3', music_danger: 'assets/music_danger.mp3'
  });
  var save = kit.save.get(blankSave());
  if (!validateSave(save)) save = blankSave();
  function persist() { kit.save.set(save); }
  function sfx(name, volume, rate) { kit.audio.sfx(name, { volume: volume == null ? 1 : volume, rate: rate || 1 }); }
  state.trophies = save.trophies;
  state.brawler = safeKit(save.brawler).name;

  function makeTexture(scene, key, width, height, draw) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    var g = scene.add.graphics();
    draw(g);
    g.generateTexture(key, width, height);
    g.destroy();
  }
  function drawBrawler(g, def, pose) {
    var col = hex(def.color), dark = hex('#091722');
    g.clear();
    if (pose === 'super') { g.fillStyle(col, .18); g.fillCircle(32, 32, 30); g.lineStyle(3, col, .95); g.strokeCircle(32, 32, 28); }
    g.fillStyle(dark, .9); g.fillCircle(32, 35, 25);
    g.fillStyle(col, 1);
    if (def.kind === 'shotgun') { g.fillRoundedRect(9, 18, 45, 35, 12); g.fillTriangle(7, 22, 7, 47, 0, 34); }
    else if (def.kind === 'sniper') { g.fillRoundedRect(18, 8, 28, 47, 12); g.fillRect(39, 24, 21, 8); }
    else if (def.kind === 'healer') { g.fillCircle(32, 33, 22); g.fillRect(27, 9, 10, 45); g.fillRect(10, 28, 44, 10); }
    else if (def.kind === 'tank') { g.fillRoundedRect(8, 12, 48, 43, 8); g.fillTriangle(8, 17, 8, 50, 0, 34); g.fillRect(49, 26, 16, 14); }
    else if (def.kind === 'bomber') { g.fillCircle(32, 34, 22); g.fillRect(14, 11, 36, 9); g.fillCircle(52, 12, 7); }
    else if (def.kind === 'dasher') { g.fillTriangle(3, 33, 50, 8, 43, 33); g.fillTriangle(3, 33, 50, 58, 43, 33); g.fillRect(42, 29, 22, 9); }
    else if (def.kind === 'engineer') { g.fillTriangle(32, 4, 58, 19, 58, 48); g.fillTriangle(32, 60, 6, 48, 6, 19); g.fillCircle(32, 33, 13); g.fillRect(43, 29, 21, 8); }
    else { g.fillCircle(32, 33, 21); g.fillTriangle(8, 19, 8, 48, 0, 33); g.fillTriangle(56, 19, 56, 48, 64, 33); }
    g.fillStyle(hex('#f5fbff'), .95); g.fillCircle(27, 27, 3); g.fillCircle(39, 27, 3);
    if (pose === 'move') { g.fillStyle(col, .95); g.fillRect(13, 52, 13, 7); g.fillRect(38, 52, 13, 7); }
    if (pose === 'aim') { g.fillStyle(dark, 1); g.fillRect(46, 27, 18, 9); g.fillStyle(col, 1); g.fillRect(60, 29, 7, 5); }
    if (pose === 'hurt') { g.fillStyle(hex('#ffffff'), .75); g.fillTriangle(6, 8, 18, 20, 24, 5); g.fillTriangle(39, 8, 47, 21, 58, 5); }
  }
  function makeCoreTextures(scene) {
    makeTexture(scene, 'menu_back', WORLD_W, WORLD_H, function (g) {
      g.fillStyle(hex(C.ink), 1); g.fillRect(0, 0, WORLD_W, WORLD_H);
      for (var y = 0; y < WORLD_H; y += 45) { g.fillStyle(hex(y % 90 ? '#0b1d2a' : '#0c2634'), .9); g.fillRect(0, y, WORLD_W, 45); }
      g.lineStyle(1, hex('#194158'), .42);
      for (var x = 0; x <= WORLD_W; x += 48) g.lineBetween(x, 0, x, WORLD_H);
      for (y = 0; y <= WORLD_H; y += 48) g.lineBetween(0, y, WORLD_W, y);
      g.fillStyle(hex(C.cyan), .08); g.fillCircle(152, 120, 160); g.fillStyle(hex(C.violet), .07); g.fillCircle(820, 420, 210);
    });
    makeTexture(scene, 'board_frame', WORLD_W, WORLD_H, function (g) {
      g.fillStyle(hex('#06121c'), .92); g.fillRect(0, 0, WORLD_W, 54); g.lineStyle(2, hex('#1b4c63'), .9); g.lineBetween(0, 53, WORLD_W, 53);
    });
    makeTexture(scene, 'control_base', 116, 116, function (g) { g.fillStyle(hex('#102b3b'), .72); g.fillCircle(58, 58, 52); g.lineStyle(3, hex(C.cyan), .48); g.strokeCircle(58, 58, 49); });
    makeTexture(scene, 'control_knob', 54, 54, function (g) { g.fillStyle(hex(C.cyan), .92); g.fillCircle(27, 27, 24); g.fillStyle(hex(C.ink), .32); g.fillCircle(27, 27, 10); });
    makeTexture(scene, 'super_button', 88, 88, function (g) { g.fillStyle(hex('#2a4052'), 1); g.fillCircle(44, 44, 39); g.lineStyle(4, hex('#7890a0'), .92); g.strokeCircle(44, 44, 37); g.fillStyle(hex(C.gold), .3); g.fillTriangle(46, 13, 27, 49, 43, 47); g.fillTriangle(43, 47, 61, 47, 42, 74); });
    makeTexture(scene, 'super_ready', 88, 88, function (g) { g.fillStyle(hex('#89681b'), 1); g.fillCircle(44, 44, 39); g.lineStyle(4, hex('#fff2ad'), .98); g.strokeCircle(44, 44, 37); g.fillStyle(hex('#fff6bf'), .95); g.fillTriangle(46, 13, 27, 49, 43, 47); g.fillTriangle(43, 47, 61, 47, 42, 74); });
    makeTexture(scene, 'gem', 30, 30, function (g) { g.fillStyle(hex(C.gold), 1); g.fillTriangle(15, 1, 29, 15, 15, 29); g.fillTriangle(15, 1, 1, 15, 15, 29); g.lineStyle(2, hex('#fff2aa'), .85); g.strokeTriangle(15, 1, 29, 15, 15, 29); });
    makeTexture(scene, 'bolt', 28, 14, function (g) { g.fillStyle(hex(C.cyan), 1); g.fillRoundedRect(1, 3, 26, 8, 4); g.fillStyle(hex(C.white), .8); g.fillRect(15, 4, 8, 6); });
    makeTexture(scene, 'bomb', 28, 28, function (g) { g.fillStyle(hex(C.red), 1); g.fillCircle(14, 15, 10); g.lineStyle(2, hex('#ffd2da'), .85); g.strokeCircle(14, 15, 11); g.lineBetween(14, 4, 20, 0); });
    makeTexture(scene, 'boomerang', 30, 30, function (g) { g.lineStyle(5, hex(C.violet), 1); g.beginPath(); g.moveTo(6, 6); g.lineTo(23, 15); g.lineTo(6, 24); g.strokePath(); });
    makeTexture(scene, 'mine', 32, 32, function (g) { g.fillStyle(hex(C.red), 1); g.fillCircle(16, 17, 10); g.fillStyle(hex('#ffced8'), 1); g.fillCircle(16, 17, 3); g.lineStyle(2, hex(C.red), 1); g.lineBetween(16, 2, 16, 8); g.lineBetween(4, 17, 10, 17); g.lineBetween(22, 17, 28, 17); });
    makeTexture(scene, 'turret', 42, 42, function (g) { g.fillStyle(hex(C.cyanDeep), 1); g.fillCircle(21, 25, 16); g.lineStyle(3, hex(C.cyan), 1); g.strokeCircle(21, 25, 16); g.fillStyle(hex(C.paper), 1); g.fillRect(20, 4, 5, 21); });
    makeTexture(scene, 'spark', 20, 20, function (g) { g.fillStyle(hex(C.gold), 1); g.fillTriangle(10, 0, 13, 7, 20, 10); g.fillTriangle(20, 10, 13, 13, 10, 20); g.fillTriangle(10, 20, 7, 13, 0, 10); g.fillTriangle(0, 10, 7, 7, 10, 0); });
    makeTexture(scene, 'safe', 124, 124, function (g) { g.fillStyle(hex('#101f2b'), .98); g.fillRoundedRect(17, 10, 90, 104, 15); g.lineStyle(5, hex(C.cyan), .9); g.strokeRoundedRect(17, 10, 90, 104, 15); g.fillStyle(hex(C.gold), 1); g.fillRect(58, 48, 9, 34); g.fillCircle(62, 40, 8); });
    makeTexture(scene, 'ring', 72, 72, function (g) { g.lineStyle(3, hex(C.cyan), .8); g.strokeCircle(36, 36, 29); g.lineStyle(1, hex(C.white), .32); g.strokeCircle(36, 36, 34); });
    for (var i = 0; i < KITS.length; i++) for (var p = 0; p < 5; p++) {
      var pose = ['idle', 'move', 'aim', 'hurt', 'super'][p];
      makeTexture(scene, 'brawler_' + i + '_' + pose, 64, 64, (function (idx, stateName) { return function (g) { drawBrawler(g, KITS[idx], stateName); }; })(i, pose));
    }
  }
  function makeBoardTexture(scene, def) {
    makeTexture(scene, 'board_' + def.key, WORLD_W, WORLD_H, function (g) {
      g.fillStyle(hex(def.base), 1); g.fillRect(0, 0, WORLD_W, WORLD_H);
      for (var y = 0; y < WORLD_H; y += 30) { g.fillStyle(hex(y % 60 ? '#0a1b27' : '#0b2430'), .5); g.fillRect(0, y, WORLD_W, 30); }
      g.lineStyle(1, hex('#315466'), .23);
      for (var x = 0; x <= WORLD_W; x += 48) g.lineBetween(x, 0, x, WORLD_H);
      for (y = 0; y <= WORLD_H; y += 48) g.lineBetween(0, y, WORLD_W, y);
      g.lineStyle(2, hex(def.accent), .3); g.strokeRect(18, 18, WORLD_W - 36, WORLD_H - 36);
      if (def.hazardKind === 'storm') { g.fillStyle(hex(def.accent), .06); g.fillCircle(480, 270, 230); g.lineStyle(4, hex(def.accent), .44); g.strokeCircle(480, 270, 230); }
      if (def.hazardKind === 'laser') { g.fillStyle(hex(C.red), .09); g.fillRect(442, 0, 76, WORLD_H); g.lineStyle(2, hex(C.red), .42); g.lineBetween(480, 0, 480, WORLD_H); }
      if (def.hazardKind === 'crusher') { g.fillStyle(hex(def.accent), .08); g.fillCircle(480, 270, 96); g.lineStyle(3, hex(def.accent), .5); g.strokeCircle(480, 270, 96); g.lineStyle(1, hex(C.white), .2); g.strokeCircle(480, 270, 116); }
      for (var i = 0; i < def.covers.length; i++) { var c = def.covers[i]; g.fillStyle(hex('#07151f'), .75); g.fillRoundedRect(c.x + 6, c.y + 7, c.w, c.h, 8); g.fillStyle(hex('#1b3b4b'), .98); g.fillRoundedRect(c.x, c.y, c.w, c.h, 8); g.lineStyle(2, hex('#3a7181'), .72); g.strokeRoundedRect(c.x, c.y, c.w, c.h, 8); g.lineStyle(1, hex(def.accent), .25); g.lineBetween(c.x + 8, c.y + c.h / 2, c.x + c.w - 8, c.y + c.h / 2); }
      if (def.key === 'gem_pit') { g.fillStyle(hex(C.gold), .13); g.fillCircle(480, 270, 25); g.lineStyle(2, hex(C.gold), .4); g.strokeCircle(480, 270, 76); }
      if (def.key === 'championship') { g.fillStyle(hex(C.violet), .12); g.fillCircle(480, 270, 32); g.lineStyle(2, hex(C.violet), .45); g.strokeCircle(480, 270, 62); }
    });
    return 'board_' + def.key;
  }
  function addText(scene, x, y, value, size, color, origin, depth) { return scene.add.text(x, y, value, textStyle(size, color), { fixedWidth: 0 }).setOrigin(origin == null ? .5 : origin).setDepth(depth || 20); }
  function addPanel(scene, x, y, w, h, fill, stroke, depth) { return scene.add.rectangle(x, y, w, h, hex(fill), 1).setOrigin(0).setStrokeStyle(2, hex(stroke), 1).setDepth(depth || 20); }
  function makePool(scene, texture, count, depth) {
    var list = [];
    for (var i = 0; i < count; i++) list.push(scene.add.image(-999, -999, texture).setDepth(depth).setVisible(false));
    return list;
  }

  var BootScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function BootScene() { Phaser.Scene.call(this, { key: 'boot' }); },
    preload: function () { kit.loader.show('SCRAPPER SQUAD'); kit.loader.progress(.25); },
    create: function () {
      try { makeCoreTextures(this); } catch (err) { hook.error = String(err && err.message || err); }
      kit.loader.progress(1); kit.loader.hide(); hook.ready = true; Runtime.game = this.game; hook.game = this.game; kit.registerPWA();
      this.scene.start('menu');
    }
  });

  var MenuScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function MenuScene() { Phaser.Scene.call(this, { key: 'menu' }); },
    create: function () {
      var self = this; Runtime.menu = this; this.modeKey = has(MODES, pendingSwitch.mode) ? pendingSwitch.mode : (has(MODES, save.lastMode) ? save.lastMode : 'gem'); this.arenaKey = pendingSwitch.arena || null;
      this.add.image(WORLD_W / 2, WORLD_H / 2, 'menu_back').setDepth(0); this.build(); this.selectMode(this.modeKey); this.selectArena(this.arenaKey);
      state.phase = 'menu'; state.mode = this.modeKey; state.arena = this.arenaKey || safeMode(this.modeKey).arena; state.trophies = save.trophies;
      this.input.keyboard.on('keydown-ENTER', function () { self.launch(); }); this.input.keyboard.on('keydown-SPACE', function () { self.launch(); });
      this.events.once('shutdown', function () { if (Runtime.menu === self) Runtime.menu = null; });
    },
    build: function () {
      var self = this;
      addText(this, 34, 34, 'SCRAPPER', 34, C.paper, 0, 10); addText(this, 34, 70, 'SQUAD', 34, C.cyan, 0, 10); addText(this, 36, 103, '3v3 ARENA  /  ALL 8 KITS FREE', 17, C.dim, 0, 10);
      this.trophyPanel = addPanel(this, 770, 22, 154, 62, '#102b3d', '#2d6178', 10); addText(this, 847, 42, '🏆  ' + fmt(save.trophies), 21, C.gold, .5, 12); addText(this, 847, 67, 'TROPHY ROAD', 14, C.dim, .5, 12);
      addText(this, 34, 145, 'CHOOSE A RUN', 17, C.dim, 0, 10); this.modeButtons = {};
      for (var i = 0; i < MODE_ORDER.length; i++) {
        var mode = MODES[MODE_ORDER[i]], y = 166 + i * 56, bg = addPanel(this, 28, y, 386, 48, '#0d202e', '#25495a', 10);
        var icon = addText(this, 54, y + 24, mode.icon, 24, mode.key === 'gem' ? C.gold : C.cyan, .5, 12); var title = addText(this, 82, y + 13, mode.label, 18, C.paper, 0, 12); var sub = addText(this, 82, y + 33, mode.goal, 14, C.dim, 0, 12);
        bg.setInteractive({ useHandCursor: true }); bg.on('pointerdown', (function (key) { return function () { self.selectMode(key); sfx('shot_fire', .16, 1.4); }; })(mode.key)); this.modeButtons[mode.key] = { bg: bg, title: title, sub: sub, icon: icon };
      }
      addText(this, 34, 417, 'ARENA IDENTITY', 17, C.dim, 0, 10); this.arenaButtons = {};
      var arenas = ['gem_pit', 'heist_vault', 'showdown_field', 'championship'];
      for (i = 0; i < arenas.length; i++) { var a = ARENAS[arenas[i]], ax = 28 + (i % 2) * 198, ay = 439 + Math.floor(i / 2) * 37, abg = addPanel(this, ax, ay, 188, 30, '#0d202e', '#25495a', 10); addText(this, ax + 16, ay + 15, a.icon, 18, a.accent, .5, 12); addText(this, ax + 31, ay + 15, a.name, 14, C.paper, 0, 12); abg.setInteractive({ useHandCursor: true }); abg.on('pointerdown', (function (key) { return function () { self.selectArena(key); sfx('shot_fire', .14, 1.5); }; })(a.key)); this.arenaButtons[a.key] = abg; }
      addText(this, 448, 145, 'KIT BAY  /  FLAT POWER', 17, C.dim, 0, 10); this.kitCards = [];
      var gap = 8, cardW = 112, cardH = 112;
      for (i = 0; i < KITS.length; i++) { var kitDef = KITS[i], col = i % 4, row = Math.floor(i / 4), kx = 442 + col * (cardW + gap), ky = 166 + row * (cardH + gap), kbg = addPanel(this, kx, ky, cardW, cardH, '#0d202e', '#25495a', 10); var portrait = this.add.image(kx + 28, ky + 38, 'brawler_' + i + '_idle').setDisplaySize(48, 48).setDepth(12); var n = addText(this, kx + 59, ky + 20, kitDef.name, 15, C.paper, 0, 12); var r = addText(this, kx + 59, ky + 43, kitDef.role, 12, kitDef.color, 0, 12); var free = addText(this, kx + 59, ky + 72, 'FREE', 13, C.green, 0, 12); kbg.setInteractive({ useHandCursor: true }); kbg.on('pointerdown', (function (idx) { return function () { save.brawler = idx; persist(); self.paintKits(); sfx('shot_fire', .16, 1.5); }; })(i)); this.kitCards.push({ bg: kbg, portrait: portrait, name: n, role: r, free: free, index: i }); }
      addText(this, 442, 414, 'GAUNTLET CHAIN', 17, C.dim, 0, 10); this.road = [];
      for (i = 0; i < 4; i++) { var nx = 474 + i * 128, line = i ? this.add.rectangle(nx - 64, 438, 112, 4, hex(i <= save.gauntlet ? C.violet : '#1b3848'), 1).setDepth(10) : null, node = this.add.circle(nx, 438, 11, hex(i < save.gauntlet ? C.green : i === save.gauntlet ? C.violet : '#1b3848'), 1).setStrokeStyle(2, hex(i <= save.gauntlet ? C.paper : '#3b5664'), 1).setDepth(11); addText(this, nx, 464, '0' + (i + 1), 14, C.dim, .5, 12); this.road.push(node); }
      addText(this, 442, 488, 'Win +3 trophies. Medals persist. No power cubes.', 14, C.dim, 0, 11);
      this.launchButton = addPanel(this, 770, 454, 154, 56, '#65dda0', '#b8ffce', 10); this.launchText = addText(this, 847, 482, 'ENTER PIT', 19, C.ink, .5, 12); this.launchButton.setInteractive({ useHandCursor: true }); this.launchButton.on('pointerdown', function () { self.launch(); });
      this.paintKits();
    },
    selectMode: function (key) {
      if (!has(MODES, key)) key = 'gem'; this.modeKey = key; save.lastMode = key; persist();
      for (var i = 0; i < MODE_ORDER.length; i++) { var item = this.modeButtons && this.modeButtons[MODE_ORDER[i]]; if (!item) continue; var on = MODE_ORDER[i] === key; item.bg.setFillStyle(hex(on ? '#173c51' : '#0d202e'), 1).setStrokeStyle(on ? 2 : 1, hex(on ? C.cyan : '#25495a'), 1); setColorIfChanged(item.title, on ? C.paper : C.dim); }
      state.mode = key; state.arena = this.arenaKey || safeMode(key).arena;
    },
    selectArena: function (key) {
      this.arenaKey = has(ARENAS, key) ? key : null;
      if (!this.arenaButtons) return;
      for (var k in this.arenaButtons) if (has(this.arenaButtons, k)) { var on = k === this.arenaKey; this.arenaButtons[k].setFillStyle(hex(on ? '#173c51' : '#0d202e'), 1).setStrokeStyle(on ? 2 : 1, hex(on ? C.gold : '#25495a'), 1); }
      state.arena = this.arenaKey || safeMode(this.modeKey).arena;
    },
    paintKits: function () {
      if (!this.kitCards) return;
      for (var i = 0; i < this.kitCards.length; i++) { var card = this.kitCards[i], on = card.index === save.brawler; card.bg.setFillStyle(hex(on ? '#173c51' : '#0d202e'), 1).setStrokeStyle(on ? 2 : 1, hex(on ? KITS[i].color : '#25495a'), 1); setColorIfChanged(card.name, on ? C.paper : C.dim); }
    },
    launch: function () { Runtime.next = { mode: this.modeKey, arena: this.arenaKey || safeMode(this.modeKey).arena, brawler: save.brawler }; kit.restart(); }
  });

  function createActor(id, team, kitIndex, x, y, human, respawn) {
    var def = safeKit(kitIndex);
    return { id: id, team: team, kitIndex: kitIndex, x: x, y: y, vx: 0, vy: 0, hp: def.hp, maxHp: def.hp, cooldown: .2, super: 18, carry: 0, alive: true, respawnAt: 0, invuln: 0, hurt: 0, shield: 0, stun: 0, aim: { x: team === 0 ? 1 : -1, y: 0 }, aimActive: false, human: !!human, respawn: respawn, kills: 0, render: { pose: '', kit: -1, carry: -1, alpha: 1 } };
  }

  var PlayScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function PlayScene() { Phaser.Scene.call(this, { key: 'play' }); },
    init: function (data) {
      data = data || {}; this.modeKey = has(MODES, data.mode) ? data.mode : (pendingSwitch.mode || state.mode || 'gem'); this.mode = safeMode(this.modeKey); this.stage = clamp(save.gauntlet | 0, 0, GAUNTLET.length - 1); this.gauntletDef = this.modeKey === 'gauntlet' ? (GAUNTLET[this.stage] || GAUNTLET[0]) : null; this.ruleMode = this.gauntletDef ? this.gauntletDef.rule : this.mode.rule; this.arenaKey = has(ARENAS, data.arena) ? data.arena : (pendingSwitch.arena || (this.gauntletDef ? this.gauntletDef.arena : this.mode.arena)); this.arena = safeArena(this.arenaKey); this.humanKit = has(KIT_BY_ID, data.brawler) ? data.brawler : (Number.isFinite(Number(data.brawler)) ? finite(data.brawler, save.brawler, 0, 7) | 0 : save.brawler); this.acc = 0; this.simTime = 0; this.pausedByKit = false; this.finished = false; this.result = null; this.banner = { title: this.modeKey === 'gauntlet' ? 'GAUNTLET 0' + (this.stage + 1) : this.mode.label, sub: this.gauntletDef ? this.gauntletDef.name : this.arena.name, t: reduceMotion ? .8 : 2.1, total: reduceMotion ? .8 : 2.1 }; this.tutorialT = 4; this.toast = { text: '', color: C.paper, t: 0 }; this.flash = 0; this.hazardT = 0; this.gemSpawnT = .3; this.stormRadius = 230; this.crusherT = 0; this.laserT = 0; this.rightHeld = false; this.rightDir = { x: 1, y: 0 }; this.superWasDown = false; this.keyAimWasDown = false; this.lastMusicDanger = false;
    },
    create: function () {
      Runtime.live = this; pendingSwitch.mode = null; pendingSwitch.arena = null; state.phase = 'play'; state.mode = this.modeKey; state.arena = this.arenaKey; state.trophies = save.trophies; state.gems = 0; state.timer = this.mode.limit; state.medal = 'none';
      makeBoardTexture(this, this.arena); this.board = this.add.image(WORLD_W / 2, WORLD_H / 2, 'board_' + this.arena.key).setDepth(0); this.hazardGraphics = this.add.graphics().setDepth(3); this.aimGraphics = this.add.graphics().setDepth(15); this.fxGraphics = this.add.graphics().setDepth(16);
      this.createPools(); this.spawnTeams(); this.createSafes(); this.createHud(); this.fitCamera(); this.scale.on('resize', this.fitCamera, this); this.events.once('shutdown', function () { if (Runtime.live === this) Runtime.live = null; }, this); kit.audio.music('music_arena', 600);
    },
    createPools: function () {
      this.actorSprites = makePool(this, 'brawler_0_idle', 8, 10); this.actorRings = makePool(this, 'ring', 8, 8); this.actorHpBg = []; this.actorHp = []; this.carryTexts = [];
      for (var i = 0; i < 8; i++) { this.actorHpBg.push(this.add.rectangle(-999, -999, 42, 5, hex('#06111c'), 1).setDepth(12).setVisible(false)); this.actorHp.push(this.add.rectangle(-999, -999, 40, 3, hex(C.green), 1).setOrigin(0, .5).setDepth(13).setVisible(false)); this.carryTexts.push(addText(this, -999, -999, '', 16, C.gold, .5, 14).setVisible(false)); }
      this.gemSprites = makePool(this, 'gem', 18, 7); this.projectileSprites = makePool(this, 'bolt', 80, 9); this.fxSprites = makePool(this, 'spark', 160, 30); this.mineSprites = makePool(this, 'mine', 12, 6); this.turretSprites = makePool(this, 'turret', 6, 6);
      this.gems = []; this.projectiles = []; this.fx = []; this.mines = []; this.turrets = [];
      for (i = 0; i < this.gemSprites.length; i++) this.gems.push({ active: false, x: 0, y: 0, phase: i * .6 });
      for (i = 0; i < this.projectileSprites.length; i++) this.projectiles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, max: 0, owner: null, damage: 0, kind: 'bolt', radius: 7, range: 0, startX: 0, startY: 0, targetX: 0, targetY: 0, render: { texture: '' } });
      for (i = 0; i < this.fxSprites.length; i++) this.fx.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 0, color: C.gold, render: { tint: '' } });
      for (i = 0; i < this.mineSprites.length; i++) this.mines.push({ active: false, x: 0, y: 0, t: 0, owner: null });
      for (i = 0; i < this.turretSprites.length; i++) this.turrets.push({ active: false, x: 0, y: 0, t: 0, owner: null, cooldown: 0 });
    },
    spawnTeams: function () {
      this.actors = []; var respawn = this.ruleMode !== 'showdown';
      if (this.ruleMode === 'showdown') {
        var showKits = [this.humanKit, 1, 2, 3, 4, 5, 6, 7]; var points = [{ x: 112, y: 136 }, { x: 300, y: 90 }, { x: 660, y: 90 }, { x: 848, y: 136 }, { x: 848, y: 404 }, { x: 660, y: 450 }, { x: 300, y: 450 }, { x: 112, y: 404 }];
        for (var si = 0; si < 8; si++) this.actors.push(createActor(si, si, showKits[si], points[si].x, points[si].y, si === 0, false));
      } else {
        var allyKits = this.gauntletDef ? this.gauntletDef.allies : [2, 6]; var enemyKits = this.gauntletDef ? this.gauntletDef.enemies : [1, 4, 5];
        var left = [{ x: 128, y: 270 }, { x: 182, y: 174 }, { x: 182, y: 366 }], right = [{ x: 832, y: 270 }, { x: 778, y: 174 }, { x: 778, y: 366 }];
        this.actors.push(createActor(0, 0, this.humanKit, left[0].x, left[0].y, true, respawn));
        for (var ai = 0; ai < 2; ai++) this.actors.push(createActor(ai + 1, 0, safeKit(allyKits[ai] == null ? ai + 2 : allyKits[ai]) === KITS[0] ? 0 : (allyKits[ai] == null ? ai + 2 : allyKits[ai]), left[ai + 1].x, left[ai + 1].y, false, respawn));
        for (var ei = 0; ei < 3; ei++) this.actors.push(createActor(ei + 3, 1, enemyKits[ei] == null ? (ei + 1) : enemyKits[ei], right[ei].x, right[ei].y, false, respawn));
      }
      this.player = this.actors[0];
      if (this.ruleMode === 'gem') { for (var i = 0; i < 8; i++) this.spawnGem(480 + (i % 4) * 24 - 36, 270 + Math.floor(i / 4) * 34 - 17); }
    },
    createSafes: function () {
      this.safes = [{ x: 90, y: 270, team: 0, hp: 100, max: 100 }, { x: 870, y: 270, team: 1, hp: 100, max: 100 }];
      for (var i = 0; i < 2; i++) { this.safes[i].sprite = this.add.image(this.safes[i].x, this.safes[i].y, 'safe').setDepth(5).setVisible(this.ruleMode === 'heist'); this.safes[i].barBg = this.add.rectangle(this.safes[i].x - 42, this.safes[i].y - 72, 84, 7, hex('#06111c'), 1).setOrigin(0, .5).setDepth(13).setVisible(this.ruleMode === 'heist'); this.safes[i].bar = this.add.rectangle(this.safes[i].x - 40, this.safes[i].y - 72, 80, 3, hex(i ? C.red : C.cyan), 1).setOrigin(0, .5).setDepth(14).setVisible(this.ruleMode === 'heist'); }
    },
    createHud: function () {
      var self = this; this.hudTop = this.add.image(0, 0, 'board_frame').setOrigin(0).setDepth(40).setScrollFactor(0); this.modeText = addText(this, 18, 14, this.mode.icon + ' ' + this.mode.label, 18, C.paper, 0, 42).setScrollFactor(0); this.clockText = addText(this, WORLD_W / 2, 15, timeText(this.mode.limit), 22, C.gold, .5, 42).setScrollFactor(0); this.hudReadout = addText(this, WORLD_W - 18, 14, '', 18, C.paper, 1, 42).setScrollFactor(0); this.hazardText = addText(this, WORLD_W - 18, 39, this.arena.hazard, 14, this.arena.accent, 1, 42).setScrollFactor(0);
      this.leftBase = this.add.image(90, 466, 'control_base').setDisplaySize(100, 100).setDepth(40).setScrollFactor(0); this.leftKnob = this.add.image(90, 466, 'control_knob').setDisplaySize(46, 46).setDepth(41).setScrollFactor(0); this.rightBase = this.add.image(870, 466, 'control_base').setDisplaySize(100, 100).setDepth(40).setScrollFactor(0); this.rightKnob = this.add.image(870, 466, 'control_knob').setDisplaySize(46, 46).setDepth(41).setScrollFactor(0); this.superButton = this.add.image(480, 472, 'super_button').setDisplaySize(76, 76).setDepth(40).setScrollFactor(0); this.superText = addText(this, 480, 472, 'SUPER', 14, C.paper, .5, 42).setScrollFactor(0); this.superBarBg = this.add.rectangle(390, 421, 180, 10, hex('#142a39'), 1).setOrigin(0, .5).setDepth(40).setScrollFactor(0); this.superBar = this.add.rectangle(390, 421, 180, 6, hex(C.gold), 1).setOrigin(0, .5).setDepth(41).setScrollFactor(0);
      this.tutorialBg = this.add.rectangle(WORLD_W / 2, 73, 560, 26, hex('#07111c'), .72).setDepth(40).setScrollFactor(0); this.tutorialText = addText(this, WORLD_W / 2, 73, '', 16, C.paper, .5, 42).setScrollFactor(0); this.toastBg = this.add.rectangle(22, 88, 224, 30, hex('#07111c'), .82).setOrigin(0).setDepth(40).setScrollFactor(0).setVisible(false); this.toastText = addText(this, 34, 94, '', 16, C.gold, 0, 42).setScrollFactor(0).setVisible(false);
      this.bannerBg = this.add.rectangle(WORLD_W / 2, WORLD_H / 2 - 8, 590, 132, hex('#07111c'), .94).setDepth(70).setScrollFactor(0); this.bannerStroke = this.add.rectangle(WORLD_W / 2, WORLD_H / 2 - 8, 590, 132, 0, 0).setStrokeStyle(3, hex(this.arena.accent), .95).setDepth(71).setScrollFactor(0); this.bannerTitle = addText(this, WORLD_W / 2, WORLD_H / 2 - 36, this.banner.title, 34, C.paper, .5, 72).setScrollFactor(0); this.bannerSub = addText(this, WORLD_W / 2, WORLD_H / 2 + 8, this.banner.sub, 20, this.arena.accent, .5, 72).setScrollFactor(0); this.bannerHint = addText(this, WORLD_W / 2, WORLD_H / 2 + 43, 'READY', 16, C.dim, .5, 72).setScrollFactor(0);
      this.resultGroup = this.add.container(WORLD_W / 2, WORLD_H / 2).setDepth(80).setScrollFactor(0).setVisible(false); this.resultBack = this.add.rectangle(0, 0, 620, 286, hex('#07111c'), .97).setStrokeStyle(3, hex(C.cyan), 1); this.resultTitle = addText(this, 0, -91, '', 36, C.green, .5, 82); this.resultSub = addText(this, 0, -49, '', 20, C.paper, .5, 82); this.resultStats = addText(this, 0, -5, '', 18, C.dim, .5, 82); this.resultMedal = addText(this, 0, 40, '', 23, C.gold, .5, 82); this.resultHint = addText(this, 0, 85, '', 16, C.paper, .5, 82); this.resultAgain = addPanel(this, -205, 119, 190, 44, '#173c51', '#5dd7ff', 82); this.resultAgainText = addText(this, -110, 141, 'RUN AGAIN', 17, C.paper, .5, 83); this.resultMenu = addPanel(this, 15, 119, 190, 44, '#163228', '#83efb0', 82); this.resultMenuText = addText(this, 110, 141, 'KIT BAY', 17, C.paper, .5, 83); this.resultGroup.add([this.resultBack, this.resultTitle, this.resultSub, this.resultStats, this.resultMedal, this.resultHint, this.resultAgain, this.resultAgainText, this.resultMenu, this.resultMenuText]);
      this.resultAgain.setInteractive({ useHandCursor: true }); this.resultMenu.setInteractive({ useHandCursor: true }); this.resultAgain.on('pointerdown', function () { Runtime.next = { mode: self.modeKey, arena: self.arenaKey, brawler: save.brawler }; kit.restart(); }); this.resultMenu.on('pointerdown', function () { self.openMenu(); });
      this.layoutHud();
    },
    fitCamera: function () { var z = Math.min(this.scale.width / WORLD_W, this.scale.height / WORLD_H); this.cameras.main.setZoom(Math.max(.5, z)); this.cameras.main.centerOn(WORLD_W / 2, WORLD_H / 2); this.layoutHud(); },
    layoutHud: function () {
      if (!this.superButton) return; var z = Math.min(this.scale.width / WORLD_W, this.scale.height / WORLD_H); if (!isFinite(z) || z <= 0) z = 1; var safeEl = document.getElementById('safearea'), cs = safeEl ? window.getComputedStyle(safeEl) : null, safeLeft = cs ? (parseFloat(cs.paddingLeft) || 0) / z : 0, safeRight = cs ? (parseFloat(cs.paddingRight) || 0) / z : 0, safeTop = cs ? (parseFloat(cs.paddingTop) || 0) / z : 0, safeBottom = Math.max(8 / z, cs ? (parseFloat(cs.paddingBottom) || 0) / z : 0); this.leftBase.setPosition(90 + safeLeft, WORLD_H - safeBottom - 60); this.leftKnob.setPosition(90 + safeLeft, WORLD_H - safeBottom - 60); this.rightBase.setPosition(WORLD_W - 90 - safeRight, WORLD_H - safeBottom - 60); this.rightKnob.setPosition(WORLD_W - 90 - safeRight, WORLD_H - safeBottom - 60); this.superButton.setPosition(WORLD_W / 2, WORLD_H - safeBottom - 54); this.superText.setPosition(WORLD_W / 2, WORLD_H - safeBottom - 54); this.superBarBg.setPosition(WORLD_W / 2 - 90, WORLD_H - safeBottom - 111); this.superBar.setPosition(WORLD_W / 2 - 90, WORLD_H - safeBottom - 111); this.modeText.setPosition(18 + safeLeft, 14 + safeTop); this.clockText.setPosition(WORLD_W / 2, 15 + safeTop); this.hudReadout.setPosition(WORLD_W - 18 - safeRight, 14 + safeTop); this.hazardText.setPosition(WORLD_W - 18 - safeRight, 39 + safeTop); this.tutorialBg.setPosition(WORLD_W / 2, 73 + safeTop); this.tutorialText.setPosition(WORLD_W / 2, 73 + safeTop); this.toastBg.setPosition(22 + safeLeft, 88 + safeTop); this.toastText.setPosition(34 + safeLeft, 94 + safeTop); this.bannerBg.setPosition(WORLD_W / 2, WORLD_H / 2 - 8); this.bannerStroke.setPosition(WORLD_W / 2, WORLD_H / 2 - 8); this.bannerTitle.setPosition(WORLD_W / 2, WORLD_H / 2 - 36); this.bannerSub.setPosition(WORLD_W / 2, WORLD_H / 2 + 8); this.bannerHint.setPosition(WORLD_W / 2, WORLD_H / 2 + 43); this.resultGroup.setPosition(WORLD_W / 2, WORLD_H / 2); },
    screenToWorld: function (clientX, clientY) { var canvas = this.game.canvas, rect = canvas.getBoundingClientRect(), z = this.cameras.main.zoom || 1; return { x: this.cameras.main.scrollX + (clientX - rect.left) / rect.width * (rect.width / z), y: this.cameras.main.scrollY + (clientY - rect.top) / rect.height * (rect.height / z) }; },
    readControls: function () {
      var move = { x: 0, y: 0 }, aim = null, right = null, sup = null, rect = this.game.canvas.getBoundingClientRect(), pointers = kit.input.pointers, self = this;
      pointers.forEach(function (p) {
        if (!p.zone) { var cx = p.startX - rect.left, cy = p.startY - rect.top; if (cy > rect.height * .58 && cx < rect.width * .38) p.zone = 'move'; else if (cy > rect.height * .58 && cx > rect.width * .62) p.zone = 'aim'; else if (cy > rect.height * .58 && cx > rect.width * .38 && cx < rect.width * .62) p.zone = 'super'; else p.zone = cx < rect.width / 2 ? 'move' : 'aim'; }
        if (p.zone === 'move') { var mx = (p.x - p.startX) / 48, my = (p.y - p.startY) / 48; move.x += clamp(mx, -1, 1); move.y += clamp(my, -1, 1); }
        else if (p.zone === 'aim') right = p;
        else if (p.zone === 'super') sup = p;
      });
      var wasRight = this.rightHeld; this.rightHeld = !!right;
      if (right) { var dx = right.x - right.startX, dy = right.y - right.startY; if (magnitude(dx, dy) < 10) { var wp = this.screenToWorld(right.x, right.y); dx = wp.x - this.player.x; dy = wp.y - this.player.y; } aim = normalized(dx, dy); this.rightDir = aim; }
      var keyMove = { x: (kit.input.keyDown('KeyD') ? 1 : 0) - (kit.input.keyDown('KeyA') ? 1 : 0), y: (kit.input.keyDown('KeyS') ? 1 : 0) - (kit.input.keyDown('KeyW') ? 1 : 0) }; move.x += keyMove.x; move.y += keyMove.y;
      var keyAim = { x: (kit.input.keyDown('ArrowRight') ? 1 : 0) - (kit.input.keyDown('ArrowLeft') ? 1 : 0), y: (kit.input.keyDown('ArrowDown') ? 1 : 0) - (kit.input.keyDown('ArrowUp') ? 1 : 0) }; var keyAimLive = magnitude(keyAim.x, keyAim.y) > 0; if (keyAimLive) { aim = normalized(keyAim.x, keyAim.y); this.rightDir = aim; }
      if (!wasRight && right) this.player.aimActive = true; if (wasRight && !right && this.player.alive) this.fire(this.player, this.rightDir); if (this.keyAimWasDown && !keyAimLive && !right && this.player.alive) this.fire(this.player, this.rightDir); this.keyAimWasDown = keyAimLive;
      var superDown = !!sup || kit.input.keyDown('Space'); var superPressed = superDown && !this.superWasDown; this.superWasDown = superDown; if (superPressed) this.useSuper(this.player);
      this.player.aimActive = !!right || keyAimLive; if (aim) this.player.aim = aim;
      return { move: normalized(move.x, move.y), aim: aim, active: !!right || keyAimLive };
    },
    tick: function (dt) {
      if (this.finished || this.pausedByKit) return; this.simTime += dt; this.tutorialT = Math.max(0, this.tutorialT - dt); this.banner.t = Math.max(0, this.banner.t - dt); this.toast.t = Math.max(0, this.toast.t - dt); this.flash = Math.max(0, this.flash - dt); this.hazardT += dt; this.gemSpawnT -= dt;
      var controls = this.readControls(); this.leftStick = controls.move; this.updateActor(this.player, controls.move, dt); for (var i = 1; i < this.actors.length; i++) this.updateBot(this.actors[i], dt); this.updateProjectiles(dt); this.updateMines(dt); this.updateTurrets(dt); this.updateGems(dt); this.updateFx(dt); this.updateHazard(dt); this.checkGoal(); var danger = (this.mode.limit - this.simTime < 30) || (this.ruleMode === 'heist' && this.safes[1].hp < 35); if (danger !== this.lastMusicDanger) { this.lastMusicDanger = danger; kit.audio.music(danger ? 'music_danger' : 'music_arena', 600); } this.syncState();
    },
    update: function (time, delta) {
      if (kit.paused || this.pausedByKit) { this.render(); return; }
      var dt = Math.min(.05, Math.max(0, Number(delta) / 1000 || 0)); this.acc += dt; var steps = 0; while (this.acc >= STEP && steps < MAX_STEPS) { this.tick(STEP); this.acc -= STEP; steps++; }
      this.render();
    },
    updateActor: function (a, move, dt) {
      if (!a.alive) { if (a.respawn && this.simTime >= a.respawnAt) this.respawnActor(a); return; }
      a.cooldown = Math.max(0, a.cooldown - dt); a.invuln = Math.max(0, a.invuln - dt); a.hurt = Math.max(0, a.hurt - dt); a.shield = Math.max(0, a.shield - dt); a.stun = Math.max(0, a.stun - dt); a.super = clamp(a.super + dt * (a.human ? 1.25 : 1.05), 0, 100);
      var def = safeKit(a.kitIndex), slow = a.stun > 0 ? 0 : 1; a.vx = move.x * def.speed * slow; a.vy = move.y * def.speed * slow; a.x = clamp(a.x + a.vx * dt, 42, WORLD_W - 42); a.y = clamp(a.y + a.vy * dt, 76, WORLD_H - 45); this.resolveCover(a);
    },
    updateBot: function (a, dt) {
      if (!a.alive) { if (a.respawn && this.simTime >= a.respawnAt) this.respawnActor(a); return; }
      var target = this.findTarget(a), def = safeKit(a.kitIndex), move = { x: 0, y: 0 }, d = target ? dist(a.x, a.y, target.x, target.y) : 500;
      if (this.ruleMode === 'gem' && a.carry < 5) { var gem = this.nearestGem(a); if (gem) { move = normalized(gem.x - a.x, gem.y - a.y); } }
      else if (target) { var to = normalized(target.x - a.x, target.y - a.y); move = d > def.range * .7 ? to : { x: -to.y * .45, y: to.x * .45 }; a.aim = to; a.aimActive = d < def.range * 1.1; if (a.cooldown <= 0 && d < def.range * 1.05) this.fire(a, to); }
      if (this.ruleMode === 'heist' && target && a.team === 1 && d < 260) move = normalized(target.x - a.x, target.y - a.y);
      this.updateActor(a, normalized(move.x, move.y), dt); if (a.super >= 100 && target && (d < 230 || a.hp < a.maxHp * .42 || a.carry >= 4)) this.useSuper(a);
    },
    resolveCover: function (a) {
      for (var i = 0; i < this.arena.covers.length; i++) { var r = this.arena.covers[i]; if (!rectContains(a.x, a.y, r, 20)) continue; var left = Math.abs(a.x - (r.x - 20)), right = Math.abs(a.x - (r.x + r.w + 20)), top = Math.abs(a.y - (r.y - 20)), bottom = Math.abs(a.y - (r.y + r.h + 20)), m = Math.min(left, right, top, bottom); if (m === left) a.x = r.x - 21; else if (m === right) a.x = r.x + r.w + 21; else if (m === top) a.y = r.y - 21; else a.y = r.y + r.h + 21; }
    },
    findTarget: function (a) { var best = null, bestD = Infinity; for (var i = 0; i < this.actors.length; i++) { var b = this.actors[i]; if (!b.alive || b === a || !this.isEnemy(a, b)) continue; var d = dist(a.x, a.y, b.x, b.y); if (d < bestD) { bestD = d; best = b; } } return best; },
    isEnemy: function (a, b) { return this.ruleMode === 'showdown' ? a.team !== b.team : a.team !== b.team; },
    nearestGem: function (a) { var best = null, d0 = Infinity; for (var i = 0; i < this.gems.length; i++) if (this.gems[i].active) { var d = dist(a.x, a.y, this.gems[i].x, this.gems[i].y); if (d < d0) { best = this.gems[i]; d0 = d; } } return best; },
    spawnGem: function (x, y) { for (var i = 0; i < this.gems.length; i++) if (!this.gems[i].active) { this.gems[i].active = true; this.gems[i].x = clamp(x == null ? 480 + Math.random() * 100 - 50 : x, 60, 900); this.gems[i].y = clamp(y == null ? 270 + Math.random() * 90 - 45 : y, 92, 430); return; } },
    updateGems: function (dt) {
      if (this.ruleMode !== 'gem') return; if (this.gemSpawnT <= 0 && this.gems.filter(function (g) { return g.active; }).length < 18) { this.spawnGem(); this.gemSpawnT = 1.7; }
      for (var gi = 0; gi < this.gems.length; gi++) { var gem = this.gems[gi]; if (!gem.active) continue; for (var ai = 0; ai < this.actors.length; ai++) { var a = this.actors[ai]; if (a.alive && a.carry < 10 && dist(a.x, a.y, gem.x, gem.y) < 26) { a.carry++; a.super = clamp(a.super + 7, 0, 100); gem.active = false; this.emit(gem.x, gem.y, C.gold, 12); if (a.human) { this.showToast('◆ ' + a.carry + ' CARRIED', C.gold); sfx('gem_pickup', .72, 1 + Math.random() * .08); } break; } } }
    },
    fire: function (a, dir) {
      if (!a || !a.alive || a.cooldown > 0 || a.stun > 0) return; var def = safeKit(a.kitIndex), count = def.shots || 1, base = angleOf(dir.x, dir.y); a.cooldown = def.fire; a.aim = dir; a.aimActive = true; if (a.human) sfx('shot_fire', .72, def.kind === 'sniper' ? .82 : 1 + Math.random() * .12);
      if (def.kind === 'healer') { var ally = this.lowestAlly(a); if (ally && ally.hp < ally.maxHp * .78 && dist(a.x, a.y, ally.x, ally.y) < def.range) { ally.hp = Math.min(ally.maxHp, ally.hp + 18); this.emit(ally.x, ally.y, C.green, 8); } }
      for (var i = 0; i < count; i++) { var spread = count === 1 ? 0 : (i - (count - 1) / 2) * def.spread; var d = { x: Math.cos(base + spread), y: Math.sin(base + spread) }; if (def.kind === 'sniper') this.rayAttack(a, d, def.range, def.damage, 2); else if (def.kind === 'bomber') this.spawnProjectile(a, d, 'bomb', def.damage, def.range); else if (def.kind === 'boomerang') this.spawnProjectile(a, d, 'boomerang', def.damage, def.range); else this.spawnProjectile(a, d, 'bolt', def.damage, def.range); }
      if (def.kind === 'dasher') { a.x = clamp(a.x + dir.x * 46, 42, WORLD_W - 42); a.y = clamp(a.y + dir.y * 46, 76, WORLD_H - 45); this.resolveCover(a); this.slash(a, dir, 52, def.damage + 7); }
    },
    lowestAlly: function (a) { var low = null; for (var i = 0; i < this.actors.length; i++) { var b = this.actors[i]; if (b.alive && b.team === a.team && b !== a && (!low || b.hp / b.maxHp < low.hp / low.maxHp)) low = b; } return low; },
    spawnProjectile: function (a, dir, kind, damage, range) {
      for (var i = 0; i < this.projectiles.length; i++) if (!this.projectiles[i].active) { var p = this.projectiles[i], speed = kind === 'bomb' ? 220 : kind === 'boomerang' ? 350 : 460; p.active = true; p.kind = kind; p.x = a.x + dir.x * 22; p.y = a.y + dir.y * 22; p.startX = p.x; p.startY = p.y; p.vx = dir.x * speed; p.vy = dir.y * speed; p.t = 0; p.max = range / speed; p.range = range; p.owner = a; p.damage = damage; p.targetX = a.x + dir.x * range; p.targetY = a.y + dir.y * range; p.render.texture = ''; return; }
    },
    rayAttack: function (a, dir, range, damage, pierce) {
      var hitCount = 0; for (var i = 0; i < this.actors.length; i++) { var b = this.actors[i]; if (!b.alive || !this.isEnemy(a, b)) continue; var rx = b.x - a.x, ry = b.y - a.y, along = rx * dir.x + ry * dir.y, cross = Math.abs(rx * dir.y - ry * dir.x); if (along > 0 && along < range && cross < 22 && !this.blocked(a.x, a.y, b.x, b.y)) { this.hit(b, damage, a); hitCount++; if (hitCount >= pierce) break; } }
      if (this.ruleMode === 'heist') for (i = 0; i < this.safes.length; i++) { var safe = this.safes[i], sx = safe.x - a.x, sy = safe.y - a.y, sAlong = sx * dir.x + sy * dir.y, sCross = Math.abs(sx * dir.y - sy * dir.x); if (safe.team !== a.team && safe.hp > 0 && sAlong > 0 && sAlong < range && sCross < 64 && !this.blocked(a.x, a.y, safe.x, safe.y)) this.damageSafe(safe, damage); }
      this.emit(a.x + dir.x * Math.min(range, 180), a.y + dir.y * Math.min(range, 180), C.cyan, 15); this.flash = Math.max(this.flash, .08); },
    slash: function (a, dir, range, damage) { for (var i = 0; i < this.actors.length; i++) { var b = this.actors[i], rx = b.x - a.x, ry = b.y - a.y; if (b.alive && this.isEnemy(a, b) && rx * dir.x + ry * dir.y > 0 && Math.abs(rx * dir.y - ry * dir.x) < 38 && magnitude(rx, ry) < range) this.hit(b, damage, a); } this.emit(a.x + dir.x * 42, a.y + dir.y * 42, C.violet, 16); },
    blocked: function (x1, y1, x2, y2) { for (var i = 0; i < this.arena.covers.length; i++) { var r = this.arena.covers[i]; for (var t = 0; t <= 1; t += .1) if (rectContains(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, r, 2)) return true; } return false; },
    updateProjectiles: function (dt) {
      for (var i = 0; i < this.projectiles.length; i++) { var p = this.projectiles[i]; if (!p.active) continue; p.t += dt; if (p.kind === 'bomb') { var q = clamp(p.t / p.max, 0, 1); p.x = p.startX + (p.targetX - p.startX) * q; p.y = p.startY + (p.targetY - p.startY) * q - Math.sin(q * Math.PI) * 74; } else if (p.kind === 'boomerang') { var q2 = clamp(p.t / p.max, 0, 1), travel = q2 < .55 ? q2 / .55 : 1 - (q2 - .55) / .45; p.x = p.startX + (p.targetX - p.startX) * travel; p.y = p.startY + (p.targetY - p.startY) * travel; } else { p.x += p.vx * dt; p.y += p.vy * dt; }
        var expire = p.t >= (p.kind === 'boomerang' ? p.max * 1.12 : p.max) || p.x < 24 || p.x > WORLD_W - 24 || p.y < 68 || p.y > WORLD_H - 24; if (!expire && p.kind !== 'boomerang' && this.blocked(p.x - p.vx * dt, p.y - p.vy * dt, p.x, p.y)) expire = true;
        if (!expire) for (var ai = 0; ai < this.actors.length; ai++) { var a = this.actors[ai]; if (a.alive && this.isEnemy(p.owner, a) && dist(p.x, p.y, a.x, a.y) < 22) { if (p.kind === 'bomb') this.explode(p.x, p.y, 72, p.damage, p.owner); else this.hit(a, p.damage, p.owner); if (p.kind !== 'boomerang') expire = true; } }
        if (!expire && this.ruleMode === 'heist') for (var si = 0; si < this.safes.length; si++) if (this.safes[si].hp > 0 && this.safes[si].team !== p.owner.team && dist(p.x, p.y, this.safes[si].x, this.safes[si].y) < 60) { this.damageSafe(this.safes[si], p.damage); if (p.kind !== 'boomerang') expire = true; }
        if (expire) { if (p.kind === 'bomb' && p.t >= p.max * .95) this.explode(p.x, p.y, 68, p.damage, p.owner); p.active = false; }
      }
    },
    explode: function (x, y, radius, damage, owner) { this.emit(x, y, owner && owner.human ? C.gold : C.red, 22); for (var i = 0; i < this.actors.length; i++) { var a = this.actors[i]; if (a.alive && owner && this.isEnemy(owner, a) && dist(x, y, a.x, a.y) < radius) this.hit(a, damage * .8, owner); } if (this.ruleMode === 'heist') for (i = 0; i < this.safes.length; i++) if (owner && this.safes[i].team !== owner.team && dist(x, y, this.safes[i].x, this.safes[i].y) < radius + 40) this.damageSafe(this.safes[i], damage * .8); },
    damageSafe: function (safe, damage) { safe.hp = Math.max(0, safe.hp - damage * .25); this.emit(safe.x, safe.y, C.gold, 8); },
    hit: function (target, damage, source) { if (!target || !target.alive || target.invuln > 0) return; var actual = target.shield > 0 ? damage * .25 : damage; target.hp -= actual; target.hurt = .16; target.super = clamp(target.super + damage * .55, 0, 100); this.emit(target.x, target.y, colorFor(target), 5); if (target.human) { this.flash = Math.max(this.flash, .1); kit.juice.shake(4, 100); } if (target.hp <= 0) this.down(target, source); },
    down: function (a, source) { a.alive = false; a.hp = 0; a.aimActive = false; if (a.carry) { for (var i = 0; i < a.carry; i++) this.spawnGem(a.x + Math.cos(i) * 22, a.y + Math.sin(i) * 22); a.carry = 0; } if (source) source.kills++; this.emit(a.x, a.y, C.red, 24); if (a.human) { this.flash = .18; kit.juice.shake(9, 180); } if (a.respawn) a.respawnAt = this.simTime + 3; },
    respawnActor: function (a) { a.alive = true; a.hp = a.maxHp; a.invuln = 1.1; a.super = Math.max(a.super, 20); a.x = a.team === 0 ? 118 : 842; a.y = 270 + (a.id % 3 - 1) * 78; this.emit(a.x, a.y, colorFor(a), 14); },
    useSuper: function (a) {
      if (!a || !a.alive || a.super < 100) return; var def = safeKit(a.kitIndex), dir = a.aim || { x: a.team === 0 ? 1 : -1, y: 0 }; a.super = 0; a.hurt = 0; this.flash = reduceMotion ? .05 : .25; if (a.human) { sfx('super_roar', .9, 1); kit.juice.shake(11, 220); }
      if (def.kind === 'shotgun') { for (var i = 0; i < 10; i++) { var ang = i * Math.PI * 2 / 10; this.spawnProjectile(a, { x: Math.cos(ang), y: Math.sin(ang) }, 'bolt', 22, 230); } this.explode(a.x, a.y, 104, 28, a); }
      else if (def.kind === 'sniper') this.rayAttack(a, dir, 740, 78, 8);
      else if (def.kind === 'healer') { for (i = 0; i < this.actors.length; i++) if (this.actors[i].alive && this.actors[i].team === a.team) { this.actors[i].hp = Math.min(this.actors[i].maxHp, this.actors[i].hp + 42); this.emit(this.actors[i].x, this.actors[i].y, C.green, 14); } }
      else if (def.kind === 'tank') { a.shield = 4.5; this.explode(a.x, a.y, 128, 40, a); }
      else if (def.kind === 'bomber') { for (i = 0; i < 4; i++) this.dropMine(a.x + dir.x * 46 + Math.cos(i * 1.57) * 52, a.y + dir.y * 46 + Math.sin(i * 1.57) * 52, a); }
      else if (def.kind === 'dasher') { a.x = clamp(a.x + dir.x * 165, 42, WORLD_W - 42); a.y = clamp(a.y + dir.y * 165, 76, WORLD_H - 45); this.resolveCover(a); this.slash(a, dir, 110, 65); }
      else if (def.kind === 'engineer') this.dropTurret(a.x + dir.x * 48, a.y + dir.y * 48, a);
      else for (i = -1; i <= 1; i++) { var ang2 = angleOf(dir.x, dir.y) + i * .24; this.spawnProjectile(a, { x: Math.cos(ang2), y: Math.sin(ang2) }, 'boomerang', 35, 480); }
      if (a.human) this.showToast(def.super, C.gold, true);
    },
    dropMine: function (x, y, owner) { for (var i = 0; i < this.mines.length; i++) if (!this.mines[i].active) { this.mines[i].active = true; this.mines[i].x = clamp(x, 54, 906); this.mines[i].y = clamp(y, 82, 428); this.mines[i].t = 7; this.mines[i].owner = owner; return; } },
    updateMines: function (dt) { for (var i = 0; i < this.mines.length; i++) { var m = this.mines[i]; if (!m.active) continue; m.t -= dt; for (var ai = 0; ai < this.actors.length; ai++) { var a = this.actors[ai]; if (a.alive && this.isEnemy(m.owner, a) && dist(m.x, m.y, a.x, a.y) < 25) { this.explode(m.x, m.y, 70, 48, m.owner); m.active = false; break; } } if (m.t <= 0) m.active = false; } },
    dropTurret: function (x, y, owner) { for (var i = 0; i < this.turrets.length; i++) if (!this.turrets[i].active) { this.turrets[i].active = true; this.turrets[i].x = clamp(x, 60, 900); this.turrets[i].y = clamp(y, 82, 428); this.turrets[i].t = 12; this.turrets[i].owner = owner; this.turrets[i].cooldown = .1; return; } },
    updateTurrets: function (dt) { for (var i = 0; i < this.turrets.length; i++) { var t = this.turrets[i]; if (!t.active) continue; t.t -= dt; t.cooldown -= dt; if (t.cooldown <= 0) { var target = this.findTarget(t.owner); if (target && dist(t.x, t.y, target.x, target.y) < 420) { this.rayAttack(t.owner, normalized(target.x - t.x, target.y - t.y), 420, 12, 1); t.cooldown = .65; } } if (t.t <= 0) t.active = false; } },
    updateFx: function (dt) { for (var i = 0; i < this.fx.length; i++) { var f = this.fx[i]; if (!f.active) continue; f.t += dt; f.x += f.vx * dt; f.y += f.vy * dt; if (f.t >= f.life) f.active = false; } },
    emit: function (x, y, color, count) { var made = 0; for (var i = 0; i < this.fx.length && made < count; i++) if (!this.fx[i].active) { var f = this.fx[i], ang = Math.random() * Math.PI * 2, speed = 30 + Math.random() * 120; f.active = true; f.x = x; f.y = y; f.vx = Math.cos(ang) * speed; f.vy = Math.sin(ang) * speed; f.t = 0; f.life = .24 + Math.random() * .38; f.color = color; f.render.tint = ''; made++; } },
    updateHazard: function (dt) {
      var kind = this.arena.hazardKind;
      if (kind === 'geyser' && this.hazardT > 4.5) { this.hazardT = 0; for (var i = 0; i < this.actors.length; i++) if (this.actors[i].alive && dist(this.actors[i].x, this.actors[i].y, 480, 270) < 74) this.hit(this.actors[i], 18, { team: this.actors[i].team === 0 ? 1 : 0, human: false }); this.emit(480, 270, C.gold, 26); }
      if (kind === 'laser') { this.laserT = (this.laserT + dt) % 5; if (this.laserT > 3.4 && this.laserT < 4.7) for (i = 0; i < this.actors.length; i++) if (this.actors[i].alive && Math.abs(this.actors[i].x - 480) < 36) this.hit(this.actors[i], 7 * dt * 8, { team: this.actors[i].team === 0 ? 1 : 0, human: false }); }
      if (kind === 'storm') { this.stormRadius = Math.max(118, 230 - this.simTime * .8); for (i = 0; i < this.actors.length; i++) if (this.actors[i].alive && dist(this.actors[i].x, this.actors[i].y, 480, 270) > this.stormRadius) this.hit(this.actors[i], 8 * dt, { team: this.actors[i].team === 0 ? 1 : 0, human: false }); }
      if (kind === 'crusher') { this.crusherT = (this.crusherT + dt) % 5.5; if (this.crusherT > 4.2 && this.crusherT < 4.75) for (i = 0; i < this.actors.length; i++) if (this.actors[i].alive && dist(this.actors[i].x, this.actors[i].y, 480, 270) < 96) this.hit(this.actors[i], 34, { team: this.actors[i].team === 0 ? 1 : 0, human: false }); }
    },
    teamGems: function (team) { var n = 0; for (var i = 0; i < this.actors.length; i++) if (this.actors[i].team === team) n += this.actors[i].carry; return n; },
    checkGoal: function () {
      var remaining = this.mode.limit - this.simTime;
      if (this.ruleMode === 'gem') { var own = this.teamGems(0), enemy = this.teamGems(1); if (own >= 10 && !this.lockStarted) this.lockStarted = this.simTime; if (own < 10) this.lockStarted = null; if (enemy >= 10 && !this.enemyLockStarted) this.enemyLockStarted = this.simTime; if (enemy < 10) this.enemyLockStarted = null; if (this.lockStarted != null && this.simTime - this.lockStarted >= 15) return this.finish('win', 'GEM LOCKED', own); if (this.enemyLockStarted != null && this.simTime - this.enemyLockStarted >= 15) return this.finish('loss', 'GEMS LOST', enemy); }
      else if (this.ruleMode === 'heist') { if (this.safes[1].hp <= 0) return this.finish('win', 'SAFE CRACKED', this.simTime); if (this.safes[0].hp <= 0) return this.finish('loss', 'YOUR SAFE BROKE', this.simTime); }
      else { var alive = this.actors.filter(function (a) { return a.alive; }); if (alive.length <= 1) return this.finish(alive[0] === this.player ? 'win' : 'loss', alive[0] === this.player ? 'LAST SCRAPPER' : 'SQUAD WIPED', this.player.kills); }
      if (remaining <= 0) { if (this.ruleMode === 'gem') return this.finish(this.teamGems(0) >= this.teamGems(1) ? 'win' : 'loss', 'TIME LOCK', this.teamGems(0)); if (this.ruleMode === 'heist') return this.finish(this.safes[1].hp < this.safes[0].hp ? 'win' : 'loss', 'CLOCK EXPIRED', this.safes[1].hp); return this.finish('loss', 'STORM CLOSES', this.player.kills); }
    },
    medalRank: function (m) { return m === 'gold' ? 3 : m === 'silver' ? 2 : m === 'bronze' ? 1 : 0; },
    medalFor: function (win, score) { if (!win) return 'none'; if (this.ruleMode === 'heist') return this.simTime <= 48 ? 'gold' : this.simTime <= 82 ? 'silver' : 'bronze'; if (this.ruleMode === 'gem') return score >= 10 && this.simTime <= 75 ? 'gold' : score >= 10 ? 'silver' : 'bronze'; return score >= 3 ? 'gold' : score >= 1 ? 'silver' : 'bronze'; },
    finish: function (result, reason, score) {
      if (this.finished) return true; this.finished = true; var win = result === 'win', key = this.modeKey, medal = this.medalFor(win, score), old = save.medals[key] || 'none', trophies = win ? 3 + (medal === 'gold' ? 2 : medal === 'silver' ? 1 : 0) : 0;
      save.wins += win ? 1 : 0; save.losses += win ? 0 : 1; save.trophies += trophies; save.gemStreak = this.ruleMode === 'gem' && win ? save.gemStreak + 1 : (this.ruleMode === 'gem' ? 0 : save.gemStreak); save.bestGems = Math.max(save.bestGems, this.teamGems(0)); if (this.ruleMode === 'heist' && win) save.bestSafeSpeed = Math.min(save.bestSafeSpeed, this.simTime); if (this.ruleMode === 'showdown' && win) save.bestShowdown = Math.max(save.bestShowdown, this.player.kills); if (this.medalRank(medal) > this.medalRank(old)) save.medals[key] = medal; if (this.modeKey === 'gauntlet' && win) save.gauntlet = Math.min(GAUNTLET.length, save.gauntlet + 1); persist(); this.result = { result: result, reason: reason, medal: medal, trophies: trophies, score: score }; this.banner.t = 0; this.toast.t = 0; this.showResult(); if (win) { sfx('victory_fanfare', .95); kit.juice.shake(5, 260); } else sfx('super_roar', .2, .7); this.syncState(); return true;
    },
    showResult: function () { var win = this.result.result === 'win'; setTextIfChanged(this.resultTitle, win ? 'MATCH WON' : 'MATCH LOST'); setColorIfChanged(this.resultTitle, win ? C.green : C.red); setTextIfChanged(this.resultSub, this.result.reason); var stats = this.ruleMode === 'gem' ? 'HAUL  ◆ ' + this.teamGems(0) + '   /   STREAK  ' + save.gemStreak : this.ruleMode === 'heist' ? 'ENEMY SAFE  ' + Math.ceil(this.safes[1].hp) + '%   /   ' + Math.ceil(this.result.score) + 's' : 'KILLS  ' + this.player.kills + '   /   TROPHIES  ' + save.trophies; setTextIfChanged(this.resultStats, stats); setTextIfChanged(this.resultMedal, this.result.medal === 'none' ? 'NO MEDAL' : this.result.medal.toUpperCase() + ' MEDAL   + ' + this.result.trophies + ' TROPHIES'); setTextIfChanged(this.resultHint, this.modeKey === 'gauntlet' ? (save.gauntlet >= GAUNTLET.length ? 'CHAMPIONSHIP CLEARED' : 'STAGE ' + (save.gauntlet + 1) + ' READY') : 'All eight kits stay free.'); this.resultGroup.setVisible(true); if (!reduceMotion) { this.resultGroup.setScale(.86); this.tweens.add({ targets: this.resultGroup, scaleX: 1, scaleY: 1, duration: 360, ease: 'Back.Out' }); } else this.resultGroup.setScale(1); },
    showToast: function (text, color, force) { if (!force && (this.tutorialT > 0 || this.banner.t > 0 || this.finished)) return; this.toast.text = text; this.toast.color = color || C.paper; this.toast.t = 1; },
    renderAim: function () {
      this.aimGraphics.clear(); var a = this.player, def = safeKit(a.kitIndex); if (!a.alive || !a.aimActive || this.finished || this.banner.t > 0) return; var d = a.aim, range = def.range, startX = a.x + d.x * 25, startY = a.y + d.y * 25, endX = a.x + d.x * range, endY = a.y + d.y * range; this.aimGraphics.lineStyle(3, hex(def.color), .42); if (def.kind === 'bomber') { var px = startX, py = startY, prevX = px, prevY = py; for (var i = 1; i <= 12; i++) { var t = i / 12; px = startX + (endX - startX) * t; py = startY + (endY - startY) * t - Math.sin(t * Math.PI) * 74; this.aimGraphics.lineBetween(prevX, prevY, px, py); prevX = px; prevY = py; } } else this.aimGraphics.lineBetween(startX, startY, endX, endY); this.aimGraphics.fillStyle(hex(def.color), .75); this.aimGraphics.fillCircle(endX, endY, 8); this.aimGraphics.lineStyle(2, hex(C.white), .65); this.aimGraphics.strokeCircle(endX, endY, 15); },
    render: function () {
      if (!this.player || !this.actorSprites) return; this.renderAim(); var fx = kit.juice.frame(); if (fx.dx || fx.dy) this.cameras.main.setScroll(this.cameras.main.scrollX + fx.dx, this.cameras.main.scrollY + fx.dy); else this.cameras.main.centerOn(WORLD_W / 2, WORLD_H / 2);
      for (var i = 0; i < this.actors.length; i++) { var a = this.actors[i], sp = this.actorSprites[i], ring = this.actorRings[i], hpBg = this.actorHpBg[i], hp = this.actorHp[i], ct = this.carryTexts[i]; if (!a.alive) { sp.setVisible(true).setTexture('brawler_' + a.kitIndex + '_hurt').setPosition(a.x, a.y).setAlpha(.28); ring.setVisible(false); hpBg.setVisible(false); hp.setVisible(false); ct.setVisible(false); continue; } var pose = a.hurt > 0 ? 'hurt' : a.super >= 99.9 ? 'super' : (a.human && a.aimActive ? 'aim' : magnitude(a.vx, a.vy) > 20 ? 'move' : 'idle'); if (a.render.pose !== pose || a.render.kit !== a.kitIndex) { a.render.pose = pose; a.render.kit = a.kitIndex; sp.setTexture('brawler_' + a.kitIndex + '_' + pose); } var alpha = a.invuln > 0 && Math.floor(this.simTime * 18) % 2 ? .4 : 1; sp.setVisible(true).setPosition(a.x, a.y + (pose === 'move' ? Math.sin(this.simTime * 16 + i) * 2 : 0)).setRotation(angleOf(a.aim.x, a.aim.y)).setAlpha(alpha); ring.setVisible(true).setPosition(a.x, a.y).setTint(hex(colorFor(a))).setAlpha(a.human ? .85 : .4); hpBg.setVisible(true).setPosition(a.x - 21, a.y - 34); hp.setVisible(true).setPosition(a.x - 20, a.y - 34).setDisplaySize(40 * clamp(a.hp / a.maxHp, 0, 1), 3).setFillStyle(hex(a.shield > 0 ? C.cyan : a.team === 0 ? C.green : C.red), 1); if (a.carry > 0) { ct.setVisible(true).setPosition(a.x, a.y - 49); setTextIfChanged(ct, '◆ ' + a.carry); } else ct.setVisible(false); }
      for (i = 0; i < this.gemSprites.length; i++) { var g = this.gems[i], gs = this.gemSprites[i]; if (g.active) gs.setVisible(true).setPosition(g.x, g.y + Math.sin(this.simTime * 5 + g.phase) * 3).setScale(1 + Math.sin(this.simTime * 5 + g.phase) * .08); else gs.setVisible(false); }
      for (i = 0; i < this.projectileSprites.length; i++) { var p = this.projectiles[i], ps = this.projectileSprites[i]; if (!p.active) { ps.setVisible(false); continue; } var tex = p.kind === 'bomb' ? 'bomb' : p.kind === 'boomerang' ? 'boomerang' : 'bolt'; if (p.render.texture !== tex) { p.render.texture = tex; ps.setTexture(tex); } ps.setVisible(true).setPosition(p.x, p.y).setRotation(angleOf(p.vx, p.vy)).setTint(hex(colorFor(p.owner))); }
      for (i = 0; i < this.mineSprites.length; i++) this.mineSprites[i].setVisible(this.mines[i].active).setPosition(this.mines[i].x, this.mines[i].y).setAlpha(this.mines[i].active ? .95 : 0); for (i = 0; i < this.turretSprites.length; i++) this.turretSprites[i].setVisible(this.turrets[i].active).setPosition(this.turrets[i].x, this.turrets[i].y).setAlpha(this.turrets[i].active ? .95 : 0);
      for (i = 0; i < this.fxSprites.length; i++) { var f = this.fx[i], fs = this.fxSprites[i]; if (!f.active) { fs.setVisible(false); continue; } if (f.render.tint !== f.color) { f.render.tint = f.color; fs.setTint(hex(f.color)); } fs.setVisible(true).setPosition(f.x, f.y).setAlpha(1 - f.t / f.life).setScale(.45 + f.t / f.life); }
      this.hazardGraphics.clear(); var hk = this.arena.hazardKind; if (hk === 'geyser') { this.hazardGraphics.lineStyle(3, hex(C.gold), .35 + Math.sin(this.hazardT * 3) * .12); this.hazardGraphics.strokeCircle(480, 270, 62 + Math.sin(this.hazardT * 2) * 5); } else if (hk === 'laser' && this.laserT > 3.2 && this.laserT < 4.8) { this.hazardGraphics.fillStyle(hex(C.red), .18); this.hazardGraphics.fillRect(442, 66, 76, 408); this.hazardGraphics.lineStyle(3, hex(C.red), .72); this.hazardGraphics.lineBetween(480, 66, 480, 474); } else if (hk === 'storm') { this.hazardGraphics.lineStyle(4, hex(C.green), .68); this.hazardGraphics.strokeCircle(480, 270, this.stormRadius); } else if (hk === 'crusher') { this.hazardGraphics.lineStyle(4, hex(C.violet), .6); this.hazardGraphics.strokeCircle(480, 270, 96 + Math.sin(this.crusherT * 2) * 8); }
      this.renderHud();
      if (this.flash > 0) { this.fxGraphics.clear(); this.fxGraphics.fillStyle(hex(C.white), this.flash * 1.5); this.fxGraphics.fillRect(0, 0, WORLD_W, WORLD_H); } else this.fxGraphics.clear();
    },
    renderHud: function () {
      var remaining = Math.max(0, this.mode.limit - this.simTime), p = this.player; setTextIfChanged(this.clockText, timeText(remaining)); var readout = this.ruleMode === 'gem' ? '◆ ' + this.teamGems(0) + ' / 10   ' + this.arena.hazard : this.ruleMode === 'heist' ? 'SAFE ' + Math.ceil(this.safes[0].hp) + '%   /   ENEMY ' + Math.ceil(this.safes[1].hp) + '%' : '☠ ' + p.kills + '   /   ' + this.arena.hazard; setTextIfChanged(this.hudReadout, readout); var ready = p.super >= 100; if (this.superButton.texture.key !== (ready ? 'super_ready' : 'super_button')) this.superButton.setTexture(ready ? 'super_ready' : 'super_button'); setTextIfChanged(this.superText, ready ? 'SUPER' : fmt(p.super) + '%'); setColorIfChanged(this.superText, ready ? C.ink : C.paper); this.superBar.setDisplaySize(180 * clamp(p.super / 100, 0, 1), 6); this.leftKnob.setPosition(90 + (this.leftStick ? this.leftStick.x * 28 : 0), this.leftBase.y + (this.leftStick ? this.leftStick.y * 28 : 0)); this.rightKnob.setPosition(WORLD_W - 90 + (this.rightHeld ? this.rightDir.x * 28 : 0), this.rightBase.y + (this.rightHeld ? this.rightDir.y * 28 : 0));
      var tutorialVisible = this.tutorialT > 0 && !this.finished; this.tutorialBg.setVisible(tutorialVisible); this.tutorialText.setVisible(tutorialVisible); this.tutorialText.setAlpha(this.tutorialT > 2.5 ? 1 : this.tutorialT / 2.5); setTextIfChanged(this.tutorialText, this.ruleMode === 'gem' ? 'LEFT DRAG MOVE  /  RIGHT DRAG AIM  /  RELEASE FIRE' : this.ruleMode === 'heist' ? 'PRESS SAFE LANES  /  KEEP YOUR SAFE COVERED' : 'STAY IN THE RING  /  AIM, RELEASE, SCRAP'); var toastVisible = this.toast.t > 0 && !this.finished && this.banner.t <= 0 && this.tutorialT <= 0; this.toastBg.setVisible(toastVisible); this.toastText.setVisible(toastVisible); if (toastVisible) { setTextIfChanged(this.toastText, this.toast.text); setColorIfChanged(this.toastText, this.toast.color); this.toastText.setAlpha(Math.min(1, this.toast.t * 2)); }
      this.bannerBg.setVisible(this.banner.t > 0 && !this.finished); this.bannerStroke.setVisible(this.banner.t > 0 && !this.finished); this.bannerTitle.setVisible(this.banner.t > 0 && !this.finished); this.bannerSub.setVisible(this.banner.t > 0 && !this.finished); this.bannerHint.setVisible(this.banner.t > 0 && !this.finished); if (this.banner.t > 0 && !this.finished) { var bannerProgress = 1 - this.banner.t / this.banner.total, scale = reduceMotion ? 1 : Math.min(1.04, .9 + bannerProgress * .18); this.bannerBg.setScale(scale); this.bannerStroke.setScale(scale); this.bannerTitle.setScale(scale); this.bannerSub.setScale(scale); this.bannerHint.setScale(scale); setTextIfChanged(this.bannerHint, this.banner.t > 1.1 ? 'READY' : 'SCRAP'); }
      if (this.finished) { this.bannerBg.setVisible(false); this.bannerStroke.setVisible(false); this.bannerTitle.setVisible(false); this.bannerSub.setVisible(false); this.bannerHint.setVisible(false); }
    },
    syncState: function () { state.phase = this.finished ? 'result' : 'play'; state.mode = this.modeKey; state.arena = this.arenaKey; state.gems = this.ruleMode === 'gem' ? this.teamGems(0) : (this.player ? this.player.carry : 0); state.trophies = save.trophies; state.brawler = safeKit(this.player ? this.player.kitIndex : this.humanKit).name; state.timer = Math.max(0, this.mode.limit - this.simTime); state.medal = this.result ? this.result.medal : 'none'; state.safe = this.safes ? Math.ceil(this.safes[0].hp) : 100; state.enemySafe = this.safes ? Math.ceil(this.safes[1].hp) : 100; },
    forceMode: function (mode) { if (has(MODES, mode)) { Runtime.next = { mode: mode, arena: null, brawler: save.brawler }; kit.restart(); } },
    forceArena: function (arena) { if (has(ARENAS, arena)) { Runtime.next = { mode: this.modeKey, arena: arena, brawler: save.brawler }; kit.restart(); } },
    openMenu: function () { Runtime.next = null; kit.input.clearAll(); this.scene.start('menu'); }
  });

  function resizeGame() {
    if (!Runtime.game) return;
    window.GGKit.hiDpi.resize(Runtime.game, Math.max(1, window.innerWidth || WORLD_W), Math.max(1, window.innerHeight || WORLD_H));
  }
  try {
    Runtime.game = new Phaser.Game({ type: Phaser.AUTO, parent: 'stage', backgroundColor: C.ink, scale: { mode: Phaser.Scale.RESIZE, width: WORLD_W, height: WORLD_H, autoCenter: Phaser.Scale.CENTER_BOTH }, render: Object.assign({}, window.GGKit.renderDefaults, { batchSize: 4096 }), fps: { target: 60, min: 30 }, scene: [BootScene, MenuScene, PlayScene] });
    window.addEventListener('resize', resizeGame);
    window.addEventListener('orientationchange', resizeGame);
    document.addEventListener('visibilitychange', resizeGame);
    resizeGame();
  } catch (err2) { hook.error = String(err2 && err2.message || err2); state.phase = 'error'; }
})();
