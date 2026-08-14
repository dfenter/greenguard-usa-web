/* Forgelock, a tactile factory match game.
 * Phaser renders the board. GGKit owns lifecycle, input identity, saves,
 * audio, settings, restart and PWA registration.
 */
(function () {
  'use strict';

  var W = 390;
  var H = 844;
  var GRID = 6;
  var CELL = 42;
  var STEP = 1 / 60;
  var MAX_STEPS = 4;
  var SAVE_VERSION = 2;
  var TAU = Math.PI * 2;
  var FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  var DEV_BUILD = typeof window !== 'undefined' && window.__FORGELOCK_DEV === true;

  var C = {
    ink: 0x182238, deep: 0x142033, board: 0x243453, cell: 0x314567,
    edge: 0x7188a7, white: 0xf7fbff, dim: 0x9fb4ca,
    brass: 0xf3bc50, cyan: 0x38a8de, mint: 0x5bcb77, coral: 0xf25c68,
    violet: 0x9a7cf3, orange: 0xf29a4a, danger: 0xff7790, lock: 0xffc56d
  };
  var COLORS = [
    { key: 'cyan', main: 0x38a8de, deep: 0x176486, light: 0xb5eeff, glyph: 'ring' },
    { key: 'amber', main: 0xf7c948, deep: 0x9a6911, light: 0xfff0a5, glyph: 'sun' },
    { key: 'coral', main: 0xf25c68, deep: 0x963b4b, light: 0xffbcc2, glyph: 'seed' },
    { key: 'mint', main: 0x5bcb77, deep: 0x277044, light: 0xc5ffd0, glyph: 'leaf' },
    { key: 'violet', main: 0x9a7cf3, deep: 0x5743a0, light: 0xdcd2ff, glyph: 'star' },
    { key: 'orange', main: 0xf29a4a, deep: 0x99551d, light: 0xffd0a0, glyph: 'block' }
  ];
  var SETS = [
    { id: 'cold-start', name: 'COLD START', module: 'CORE FORGE', accent: C.cyan, second: C.brass, bg: 0x101b2c, board: 0x243453, cell: 0x314567, frame: 0x8ca6c2 },
    { id: 'flowline', name: 'FLOWLINE', module: 'CONVEYOR', accent: C.cyan, second: C.mint, bg: 0x0e202b, board: 0x1e4251, cell: 0x27576a, frame: 0x58d6dd },
    { id: 'gateworks', name: 'GATEWORKS', module: 'TIMED GATE', accent: C.coral, second: C.violet, bg: 0x24172b, board: 0x493052, cell: 0x5b3b64, frame: 0xff91b2 },
    { id: 'plate-array', name: 'PLATE ARRAY', module: 'PRESS ARRAY', accent: C.brass, second: C.orange, bg: 0x261d24, board: 0x4b3940, cell: 0x60474b, frame: 0xffd37b }
  ];
  var SET_LENGTHS = [6, 8, 8, 8];
  var BOARD_NAMES = [
    'First Contact', 'Twin Rail', 'Corner Press', 'Quiet Turn', 'Long Push', 'Blue Ember',
    'Belt Primer', 'Crossfeed', 'Backwash', 'Split Flow', 'Cargo Drift', 'Belt Loop', 'Current Cut', 'Flow Lock',
    'Gate Primer', 'Pink Window', 'Timing Fork', 'Two-Way Gate', 'Pulse Door', 'Gate Relay', 'Clockwork', 'Last Window',
    'Plate Primer', 'Three-Core Bay', 'Brass Relay', 'Array Lift', 'Core Orchard', 'Four-Forge Run', 'Final Press', 'The Foundry'
  ];

  var DEBUG_STATE = { mode: 'boot', board: 1, moves: 0, stars: 0, set: 1, boardId: 'fl-01', matches: 0, locks: 0, goal: 1, budget: 6, mechanism: 'CORE FORGE', reducedMotion: false };
  var DEBUG_API = { state: DEBUG_STATE };
  if (typeof window !== 'undefined') window.__fl = DEBUG_API;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function key(x, y) { return x + ',' + y; }
  function clonePoint(p) { return { x: p.x, y: p.y }; }
  function cloneTile(t) { return t ? { id: t.id, color: t.color, state: t.state, motion: t.motion, fromX: t.fromX, fromY: t.fromY, animT: t.animT } : null; }
  function cloneGrid(grid) { return grid.map(function (row) { return row.map(cloneTile); }); }
  function mulberry(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function directionGlyph(d) { return d.x === 1 ? 'RIGHT' : d.x === -1 ? 'LEFT' : d.y === 1 ? 'DOWN' : 'UP'; }
  function directionArrow(d) { return d.x === 1 ? '>' : d.x === -1 ? '<' : d.y === 1 ? 'v' : '^'; }
  function motionOn(kit) { return !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) && !!kit.juice.enabled; }
  function setTextIfChanged(obj, value) { var next = String(value); if (obj && obj.text !== next) obj.setText(next); return next; }
  function easeOutCubic(t) { var u = 1 - t; return 1 - u * u * u; }
  function easeOutBack(t) { var c1 = 1.70158; var c3 = c1 + 1; var u = t - 1; return 1 + c3 * u * u * u + c1 * u * u; }
  function setForBoard(index) { return index < 6 ? 0 : index < 14 ? 1 : index < 22 ? 2 : 3; }
  function setStart(setIndex) { var n = 0; for (var i = 0; i < setIndex; i++) n += SET_LENGTHS[i]; return n; }
  function mechanismForSet(setIndex) { return setIndex === 1 ? 'conveyor' : setIndex === 2 ? 'gate' : setIndex === 3 ? 'plate' : null; }
  function mechanismLabel(setIndex) { return SETS[setIndex].module; }
  function adjacent(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1; }
  function inGrid(x, y) { return x >= 0 && y >= 0 && x < GRID && y < GRID; }

  function makeGrid(index, rng) {
    var grid = [];
    for (var y = 0; y < GRID; y++) {
      grid[y] = [];
      for (var x = 0; x < GRID; x++) {
        var color = Math.floor(rng() * COLORS.length);
        if (x >= 2 && grid[y][x - 1].color === color && grid[y][x - 2].color === color) color = (color + 1) % COLORS.length;
        if (y >= 2 && grid[y - 1][x].color === color && grid[y - 2][x].color === color) color = (color + 1) % COLORS.length;
        grid[y][x] = { id: y * GRID + x, color: color, state: 'free', motion: 'ready', animT: 1 };
      }
    }
    var pathColor = index % COLORS.length;
    [0, 1, 2].forEach(function (x) { grid[0][x].color = pathColor; });
    return grid;
  }

  function makeBoard(index) {
    var setIndex = setForBoard(index);
    var rng = mulberry((0x41C64E6D + Math.imul(index + 11, 0x9E3779B9)) >>> 0);
    var grid = makeGrid(index, rng);
    var matches = 1 + Math.floor(index / 4);
    var lockGoal = index < 6 ? 1 : index < 14 ? 2 : index < 22 ? 3 : 4;
    var specials = { conveyors: [], gates: [], plate: null, door: null };
    if (setIndex >= 1) specials.conveyors.push({ x: 1, y: 0, dx: 1, dy: 0 });
    if (setIndex >= 2) specials.gates.push({ x: 2, y: 0, dx: 1, dy: 0, period: 4, phase: 0 });
    if (setIndex >= 3) { specials.plate = { x: 3, y: 4 }; specials.door = { x: 5, y: 4 }; }
    var lockCells = [{ x: 3, y: 0 }, { x: 4, y: 0 }, { x: 3, y: 1 }, { x: 4, y: 1 }];
    var locks = lockCells.slice(0, lockGoal);
    locks.forEach(function (p, i) { grid[p.y][p.x].state = 'locked'; grid[p.y][p.x].motion = 'locked'; grid[p.y][p.x].color = (index + i + 2) % COLORS.length; });
    var mechanicGoal = setIndex === 0 ? 0 : 1;
    var par = matches + mechanicGoal;
    if (setIndex === 3) par += 1;
    return {
      id: 'fl-' + String(index + 1).padStart(2, '0'), index: index, name: BOARD_NAMES[index], set: setIndex,
      grid: grid, locks: locks, firstPath: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
      conveyors: specials.conveyors, gates: specials.gates, plate: specials.plate, door: specials.door, plateAfter: setIndex === 3 ? 3 : 0,
      goal: { matches: matches, locks: lockGoal, conveyor: setIndex === 1 ? 1 : 0, gate: setIndex === 2 ? 1 : 0, mechanism: mechanicGoal, plate: setIndex === 3 },
      par: par, budget: par + 4 + setIndex, mechanics: mechanismLabel(setIndex)
    };
  }
  var BOARDS = Array.from({ length: 30 }, function (_, i) { return makeBoard(i); });
  DEBUG_API.catalog = BOARDS.map(function (b) { return { id: b.id, name: b.name, set: b.set + 1, par: b.par, budget: b.budget, goal: b.goal, firstPath: b.firstPath, locks: b.locks, mechanics: b.mechanics }; });

  function validSave(obj) {
    if (!obj || obj.version !== SAVE_VERSION || !Number.isInteger(obj.unlocked) || obj.unlocked < 0 || obj.unlocked > 29) return false;
    if (!Array.isArray(obj.medals) || obj.medals.length !== 30 || !Array.isArray(obj.best) || obj.best.length !== 30) return false;
    if (!obj.mechanisms || typeof obj.mechanisms !== 'object' || !Array.isArray(obj.rewards) || obj.rewards.length !== 30) return false;
    if (obj.tutorialDone !== true && obj.tutorialDone !== false) return false;
    return obj.medals.every(function (n) { return Number.isInteger(n) && n >= 0 && n <= 3; }) && obj.best.every(function (n) { return Number.isInteger(n) && n >= 0 && n < 9999; });
  }
  var kit = GGKit.create({
    slug: 'forgelock', orientation: 'portrait', validateSave: validSave,
    onPause: function () { if (scene) { scene.pausedByKit = true; scene.gestures.clear(); if (scene.run) scene.clearSelection(); } },
    onResume: function () { if (scene) scene.pausedByKit = false; },
    onRestart: function () { if (scene) scene.restartBoard(); }
  });
  kit.audio.register({
    board: 'assets/sfx_belt.mp3', resolve: 'assets/sfx_fanfare.mp3', select: 'assets/sfx_ui.mp3',
    invalid: 'assets/sfx_ui.mp3', match: 'assets/sfx_clear.mp3', cascade: 'assets/sfx_belt.mp3',
    combo: 'assets/sfx_lock.mp3', reward: 'assets/sfx_fanfare.mp3', reset: 'assets/sfx_ui.mp3'
  });
  kit.registerPWA();
  var profile = kit.save.get({ version: SAVE_VERSION, unlocked: 0, medals: Array(30).fill(0), best: Array(30).fill(0), rewards: Array(30).fill(''), mechanisms: { conveyor: false, gate: false, plate: false }, tutorialDone: false });
  var scene = null;

  function makeTexture(sceneRef, name, w, h, draw) {
    if (sceneRef.textures.exists(name)) return name;
    var g = sceneRef.make.graphics({ x: 0, y: 0, add: false });
    draw(g, w, h); g.generateTexture(name, w, h); g.destroy(); return name;
  }
  function addText(sceneRef, x, y, text, size, color, weight, origin) {
    return sceneRef.add.text(x, y, text, { fontFamily: FONT, fontSize: size + 'px', fontStyle: weight >= 800 ? '900' : '700', color: color, resolution: 2 }).setOrigin(origin == null ? 0 : origin);
  }
  function roundPanel(g, x, y, w, h, radius, fill, alpha, stroke, strokeAlpha) {
    g.fillStyle(fill, alpha == null ? 1 : alpha); g.fillRoundedRect(x, y, w, h, radius);
    if (stroke) { g.lineStyle(1, stroke, strokeAlpha == null ? 1 : strokeAlpha); g.strokeRoundedRect(x, y, w, h, radius); }
  }
  function glyph(g, color, kind, cx, cy, size) {
    g.fillStyle(color, 1);
    if (kind === 'ring') { g.lineStyle(2, color, 1); g.strokeCircle(cx, cy, size * .72); g.fillCircle(cx, cy, size * .18); }
    else if (kind === 'sun') { g.fillTriangle(cx, cy - size, cx + size * .38, cy - size * .35, cx - size * .38, cy - size * .35); g.fillTriangle(cx, cy + size, cx + size * .38, cy + size * .35, cx - size * .38, cy + size * .35); g.fillTriangle(cx - size, cy, cx - size * .35, cy - size * .38, cx - size * .35, cy + size * .38); g.fillTriangle(cx + size, cy, cx + size * .35, cy - size * .38, cx + size * .35, cy + size * .38); g.fillCircle(cx, cy, size * .38); }
    else if (kind === 'seed') g.fillEllipse(cx, cy, size * 1.05, size * 1.55);
    else if (kind === 'leaf') { g.fillTriangle(cx, cy - size, cx + size * .85, cy + size * .25, cx - size * .55, cy + size * .4); g.lineStyle(1, C.ink, .75); g.lineBetween(cx - size * .25, cy + size * .25, cx + size * .45, cy - size * .4); }
    else if (kind === 'star') { for (var i = 0; i < 6; i++) { var a = -Math.PI / 2 + i * Math.PI / 3; var b = -Math.PI / 2 + (i + .5) * Math.PI / 3; if (i === 0) { g.beginPath(); g.moveTo(cx + Math.cos(a) * size, cy + Math.sin(a) * size); } else g.lineTo(cx + Math.cos(a) * size, cy + Math.sin(a) * size); g.lineTo(cx + Math.cos(b) * size * .42, cy + Math.sin(b) * size * .42); } g.closePath(); g.fillPath(); }
    else g.fillRoundedRect(cx - size * .62, cy - size * .62, size * 1.24, size * 1.24, 2);
  }
  function drawTileShape(g, color, cx, cy, size) {
    if (color === 0) g.fillRoundedRect(cx - size, cy - size, size * 2, size * 2, 7);
    else if (color === 1) { g.fillTriangle(cx, cy - size, cx + size, cy, cx, cy); g.fillTriangle(cx + size, cy, cx, cy + size, cx, cy); g.fillTriangle(cx, cy + size, cx - size, cy, cx, cy); g.fillTriangle(cx - size, cy, cx, cy - size, cx, cy); }
    else if (color === 2) g.fillCircle(cx, cy, size);
    else if (color === 3) { g.fillTriangle(cx, cy - size, cx + size, cy + size * .55, cx - size, cy + size * .55); g.fillTriangle(cx, cy + size, cx + size, cy - size * .55, cx - size, cy - size * .55); }
    else if (color === 4) { g.fillTriangle(cx, cy - size, cx + size * .95, cy + size * .75, cx - size * .95, cy + size * .75); g.fillTriangle(cx, cy + size, cx + size * .95, cy - size * .75, cx - size * .95, cy - size * .75); }
    else { g.fillRoundedRect(cx - size, cy - size * .7, size * 2, size * 1.4, 4); g.fillTriangle(cx - size, cy - size * .7, cx - size * .55, cy - size, cx - size * .2, cy - size * .7); g.fillTriangle(cx + size, cy + size * .7, cx + size * .55, cy + size, cx + size * .2, cy + size * .7); }
  }
  function makeChrome(sceneRef, set) {
    return makeTexture(sceneRef, 'fl-chrome-' + set.id, W, H, function (g) {
      g.fillStyle(set.bg, 1); g.fillRect(0, 0, W, H); g.fillStyle(0x0a1422, .7); g.fillRect(0, 0, W, 108); g.fillRect(0, 704, W, 140);
      g.lineStyle(1, set.frame, .26); g.lineBetween(18, 108, W - 18, 108); g.lineBetween(18, 704, W - 18, 704);
      g.fillStyle(set.accent, .08); for (var x = -200; x < W + 200; x += 46) g.fillTriangle(x, 0, x + 14, 0, x - 60, H);
      g.fillStyle(set.second, .11); g.fillCircle(42, 755, 90); g.fillCircle(352, 54, 82);
    });
  }
  function makeBoardTexture(sceneRef, board, set, layout) {
    return makeTexture(sceneRef, 'fl-board-' + board.index, layout.pw, layout.ph, function (g, w, h) {
      g.fillStyle(0x070e18, .5); g.fillRoundedRect(3, 6, w - 6, h - 1, 18); roundPanel(g, 0, 0, w, h - 6, 17, set.board, 1, set.frame, .78); roundPanel(g, 9, 9, w - 18, h - 24, 10, 0x15243a, 1, set.frame, .35);
      for (var y = 0; y < GRID; y++) for (var x = 0; x < GRID; x++) { var px = layout.pad + x * CELL, py = layout.pad + y * CELL; roundPanel(g, px + 2, py + 2, CELL - 4, CELL - 4, 7, (x + y) % 2 ? set.cell : 0x2b3d5a, 1, set.frame, .3); g.lineStyle(1, set.frame, .15); g.lineBetween(px + 8, py + CELL - 8, px + CELL - 8, py + CELL - 8); }
      g.lineStyle(2, set.second, .42); g.strokeRoundedRect(5, 5, w - 10, h - 16, 14);
    });
  }
  function makeTileTexture(sceneRef, colorIndex, locked) {
    var c = COLORS[colorIndex] || COLORS[0];
    return makeTexture(sceneRef, 'fl-tile-' + colorIndex + '-' + (locked ? 'locked' : 'free'), CELL, CELL, function (g, w, h) {
      var cx = w / 2, cy = h / 2; g.fillStyle(0x071421, .55); drawTileShape(g, colorIndex, cx + 1, cy + 3, 14); g.fillStyle(c.deep, 1); drawTileShape(g, colorIndex, cx, cy, 14); g.lineStyle(2, c.light, 1);
      if (colorIndex === 0) g.strokeRoundedRect(cx - 14, cy - 14, 28, 28, 7); else g.strokeCircle(cx, cy, 14);
      glyph(g, c.light, c.glyph, cx, cy, 7); g.lineStyle(1, c.main, .8); for (var n = 0; n <= colorIndex % 3; n++) g.lineBetween(8 + n * 4, 34, 11 + n * 4, 31);
      if (locked) { g.fillStyle(0x0a1422, .72); g.fillCircle(cx, cy, 9); g.lineStyle(2, C.lock, 1); g.strokeCircle(cx, cy + 2, 5); g.lineBetween(cx - 4, cy - 1, cx - 4, cy - 6); g.lineBetween(cx + 4, cy - 1, cx + 4, cy - 6); }
    });
  }
  function makeForgeTexture(sceneRef, colorIndex) {
    var c = COLORS[colorIndex] || COLORS[0];
    return makeTexture(sceneRef, 'fl-forge-' + colorIndex, CELL, CELL, function (g, w, h) { var cx = w / 2, cy = h / 2; g.lineStyle(3, c.main, 1); g.strokeCircle(cx, cy, 15); g.lineStyle(1, c.light, .9); g.strokeCircle(cx, cy, 9); glyph(g, c.light, c.glyph, cx, cy, 6); g.lineStyle(2, c.main, .8); g.lineBetween(cx - 18, cy, cx - 13, cy); g.lineBetween(cx + 13, cy, cx + 18, cy); });
  }
  function makeMechanicTexture(sceneRef, kind, data) {
    var dir = data && data.dx != null ? data.dx + '-' + data.dy : 'none';
    var state = data && data.open ? 'open' : data && data.active ? 'active' : 'closed';
    var name = 'fl-mechanic-' + kind + '-' + dir + '-' + state;
    return makeTexture(sceneRef, name, CELL, CELL, function (g, w, h) {
      var cx = w / 2, cy = h / 2;
      if (kind === 'conveyor') { roundPanel(g, 4, 4, w - 8, h - 8, 7, 0x145766, .94, C.cyan, .9); g.lineStyle(2, 0x8cecf0, .82); if (data.dx) { g.lineBetween(9, cy - 8, 25, cy); g.lineBetween(9, cy + 8, 25, cy); g.fillTriangle(33, cy, 23, cy - 7, 23, cy + 7); } else { g.lineBetween(cx - 8, 9, cx, 25); g.lineBetween(cx + 8, 9, cx, 25); g.fillTriangle(cx, 33, cx - 7, 23, cx + 7, 23); } }
      else if (kind === 'gate') { roundPanel(g, 4, 4, w - 8, h - 8, 7, data.open ? 0x31553e : 0x632c55, .96, data.open ? C.mint : C.coral, .95); g.lineStyle(3, data.open ? 0xc2ffd1 : 0xffa0c0, .95); g.lineBetween(10, 11, 10, 31); g.lineBetween(20, 11, 20, 31); g.lineBetween(30, 11, 30, 31); if (data.open) { g.fillStyle(0xe5ffea, 1); if (data.dx) g.fillTriangle(data.dx > 0 ? 32 : 10, cy, data.dx > 0 ? 23 : 19, cy - 6, data.dx > 0 ? 23 : 19, cy + 6); else g.fillTriangle(cx, data.dy > 0 ? 32 : 10, cx - 6, data.dy > 0 ? 23 : 19, cx + 6, data.dy > 0 ? 23 : 19); } }
      else if (kind === 'plate') { roundPanel(g, 5, 7, w - 10, h - 14, 5, data.active ? 0x7b5d22 : 0x303b4b, 1, data.active ? C.brass : C.edge, 1); g.lineStyle(2, data.active ? 0xffe5a0 : 0x71839c, 1); g.lineBetween(12, cy, w - 12, cy); g.lineBetween(cx, 12, cx, h - 12); }
      else { roundPanel(g, 4, 4, w - 8, h - 8, 6, data.open ? 0x2a624d : 0x5b2b50, 1, data.open ? C.mint : C.coral, 1); g.lineStyle(2, data.open ? 0xc2ffd1 : 0xffa6c2, 1); if (!data.open) for (var q = 8; q < w - 4; q += 9) g.lineBetween(q, 8, q, h - 8); }
    });
  }
  function makeEffectTexture(sceneRef, kind) {
    return makeTexture(sceneRef, 'fl-effect-' + kind, 12, 12, function (g) { if (kind === 'match') g.fillCircle(6, 6, 4); else if (kind === 'cascade') g.fillRect(3, 1, 6, 10); else { g.fillTriangle(6, 0, 11, 6, 6, 11); g.fillTriangle(6, 0, 1, 6, 6, 11); } });
  }

  function snapshotRun(run) {
    return { grid: cloneGrid(run.grid), moves: run.moves, matches: run.matches, cleared: run.cleared, collected: run.collected, conveyorHits: run.conveyorHits, gateHits: run.gateHits, plateOpen: run.plateOpen, undoUsed: run.undoUsed, cursor: clonePoint(run.cursor), lastEvent: run.lastEvent };
  }
  function newRun(board) {
    return { grid: cloneGrid(board.grid), moves: 0, matches: 0, cleared: 0, collected: 0, conveyorHits: 0, gateHits: 0, plateOpen: false, undoUsed: 0, history: [], selected: [], cursor: { x: 0, y: 0 }, lastEvent: 'SELECT A MATCH', lost: false, won: false, stars: 0 };
  }

  var ForgelockScene = class extends Phaser.Scene {
    constructor() { super({ key: 'Forgelock' }); this.mode = 'game'; this.boardIndex = 0; this.gestures = new Map(); this.effectPools = { match: [], cascade: [], reward: [] }; this.acc = 0; this.fixedTime = 0; this.keyHeld = {}; this.padHeld = {}; this.pausedByKit = false; this.musicStarted = false; this.coachLife = 0; this.coachMessage = ''; this.eventChipCurrent = ''; this.eventChipLife = 0; this.eventChipQueue = []; this.lastEventSeen = null; }
    preload() { kit.loader.show('FORGELOCK'); kit.loader.progress(.25); }
    create() {
      scene = this; this.profile = profile; this.world = []; this.renderRecords = { tiles: [], forges: [], mechanics: [], selection: [], preview: [], cursor: null }; this.ui = {}; this.fixedTime = 0; this.flash = 0; this.banner = null; this.bannerT = 0; this.coachAlpha = 0; this.coachLife = 0; this.coachMessage = ''; this.eventChipCurrent = ''; this.eventChipLife = 0; this.eventChipQueue = []; this.lastEventSeen = null;
      this.background = this.add.rectangle(0, 0, W, H, 0x0a1422).setOrigin(0).setDepth(-20); this.makeUi(); this.createEffects(); this.bindPointerInput();
      kit.loader.progress(.6); kit.audio.preload(['board', 'resolve', 'select', 'invalid', 'match', 'cascade', 'combo', 'reward', 'reset']).then(function () { kit.loader.progress(1); kit.loader.hide(); }); this.applyInitialBoard();
    }
    makeUi() {
      this.ui.chrome = this.add.image(0, 0, makeChrome(this, SETS[0])).setOrigin(0).setDepth(-10);
      this.ui.title = addText(this, 20, 20, 'FORGELOCK', 23, '#f7fbff', 900, 0); this.ui.kicker = addText(this, 22, 52, 'TACTILE MATCH FORGE', 10, '#8ca6c2', 800, 0); this.ui.level = addText(this, 20, 20, '01', 22, '#f7fbff', 900, 0); this.ui.set = addText(this, 57, 24, 'CORE FORGE', 14, '#58d6dd', 900, 0);
      this.ui.gridBg = this.add.rectangle(219, 35, 44, 42, 0x1d3047, .95).setOrigin(.5).setStrokeStyle(1, C.cyan, .72); this.ui.grid = addText(this, 219, 35, '▦', 21, '#b5eeff', 900, .5); this.ui.resetBg = this.add.rectangle(276, 35, 44, 42, 0x1d3047, .95).setOrigin(.5).setStrokeStyle(1, C.cyan, .72); this.ui.reset = addText(this, 276, 35, '↺', 21, '#b5eeff', 900, .5); this.ui.pauseBg = this.add.rectangle(349, 35, 44, 42, 0x1d3047, .95).setOrigin(.5).setStrokeStyle(1, C.brass, .72); this.ui.pause = addText(this, 349, 35, 'Ⅱ', 18, '#ffe5a0', 900, .5);
      this.ui.coachBg = this.add.rectangle(W / 2, 100, 350, 30, 0x11283b, .88).setStrokeStyle(1, C.cyan, .65).setDepth(3); this.ui.coach = addText(this, 22, 91, 'Tap 3 same symbols', 14, '#f7fbff', 800, 0).setDepth(4);
      this.ui.goal = addText(this, 22, 458, '◆ 0/1    ▣ 0/1', 16, '#f7fbff', 900, 0); this.ui.move = addText(this, 22, 491, '0/6', 20, '#f7fbff', 900, 0); this.ui.moveBarBg = this.add.rectangle(77, 499, 152, 8, 0x18283b, .95).setOrigin(0, .5).setStrokeStyle(1, C.edge, .45); this.ui.moveBarFill = this.add.rectangle(78, 499, 0, 6, C.cyan, .95).setOrigin(0, .5);
      this.ui.undoBg = this.add.rectangle(82, 774, 128, 56, 0x1c3145, .98).setOrigin(.5).setStrokeStyle(1, C.cyan, .8); this.ui.hintBg = this.add.rectangle(308, 774, 112, 56, 0x28324e, .98).setOrigin(.5).setStrokeStyle(1, C.brass, .8); this.ui.undo = addText(this, 82, 763, '↶', 22, '#b5eeff', 900, .5); this.ui.undoCount = addText(this, 82, 787, '16', 14, '#7ea5b4', 800, .5); this.ui.hint = addText(this, 308, 763, '✦', 20, '#fff0a5', 900, .5); this.ui.hintCount = addText(this, 308, 787, '3', 14, '#c7a85a', 800, .5);
      this.ui.statusBg = this.add.rectangle(20, 535, 250, 30, 0x11283b, .92).setOrigin(0).setStrokeStyle(1, C.cyan, .55).setDepth(3).setVisible(false); this.ui.status = addText(this, 32, 542, '', 14, '#b5eeff', 900, 0).setDepth(4).setVisible(false);
    }
    createEffects() {
      var self = this; ['match', 'cascade', 'reward'].forEach(function (kind) { for (var i = 0; i < 20; i++) { var sprite = self.add.image(0, 0, makeEffectTexture(self, kind)).setVisible(false).setDepth(kind === 'reward' ? 12 : 8); self.effectPools[kind].push({ sprite: sprite, active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0, scale: 1, spin: 0 }); } });
    }
    applyInitialBoard() {
      var index = clamp(this.profile.unlocked || 0, 0, 29);
      if (DEV_BUILD) { var forced = this.readForce('forceBoard'), forcedSet = this.readForce('forceSet'); if (forced >= 0) index = forced; else if (forcedSet >= 0) index = setStart(forcedSet); }
      this.startBoard(index);
    }
    readForce(name) { if (!DEV_BUILD || !window.__fl) return null; var value = window.__fl[name]; if (value == null && window.__fl.state) value = window.__fl.state[name]; if (value == null || value === '') return null; var n = parseInt(String(value).replace('fl-', '').replace('board-', ''), 10); return Number.isFinite(n) ? clamp(n > 0 ? n - 1 : 0, 0, 29) : -1; }
    startBoard(index) {
      this.boardIndex = clamp(index | 0, 0, 29); this.board = BOARDS[this.boardIndex]; this.set = SETS[this.board.set]; this.mode = 'game'; this.flash = 0; this.acc = 0; this.fixedTime = 0; this.gestures.clear(); this.keyHeld = {}; this.padHeld = []; this.coachLife = 0; this.coachMessage = ''; this.coachAlpha = 0; this.eventChipCurrent = ''; this.eventChipLife = 0; this.eventChipQueue = []; this.lastEventSeen = null;
      if (this.gridItems) { this.gridItems.forEach(function (o) { if (o && o.destroy) o.destroy(); }); this.gridItems = null; } if (this.banner) { this.banner.forEach(function (o) { o.destroy(); }); this.banner = null; } if (this.flashRect) { this.flashRect.destroy(); this.flashRect = null; } this.clearWorld();
      this.ui.chrome.setTexture(makeChrome(this, this.set)); this.ui.title.setText('FORGELOCK').setVisible(false); this.ui.kicker.setText('TACTILE MATCH FORGE').setVisible(false); this.ui.level.setText(String(this.boardIndex + 1).padStart(2, '0')).setVisible(true); this.ui.set.setText(this.set.module).setVisible(true); this.ui.gridBg.setStrokeStyle(1, this.set.frame, .75); this.ui.resetBg.setStrokeStyle(1, this.set.frame, .75); this.ui.pauseBg.setStrokeStyle(1, this.set.second, .75); this.ui.coachBg.setStrokeStyle(1, this.set.accent, .72); this.hideGameUi(true); this.clearEventChip();
      this.layout = { pw: GRID * CELL + 36, ph: GRID * CELL + 36, pad: 18, bx: (W - (GRID * CELL + 36)) / 2, by: 132 }; this.ui.board = this.add.image(this.layout.bx, this.layout.by, makeBoardTexture(this, this.board, this.set, this.layout)).setOrigin(0).setDepth(0); this.world.push(this.ui.board); this.makeBoardObjects();
      this.run = newRun(this.board); this.run.hintUses = this.boardIndex < 6 ? 3 : this.boardIndex < 14 ? 2 : 1; this.hintPath = null; this.hintLife = 0; this.tutorialStep = this.profile.tutorialDone ? 3 : 0; this.syncDebug(); this.updateCoach(true); this.syncUi(); if (!this.musicStarted) { kit.audio.music('board'); this.musicStarted = true; }
    }
    clearWorld() { if (!this.world) return; this.world.forEach(function (o) { if (o && o.destroy) o.destroy(); }); this.world.length = 0; if (this.effectPools) Object.keys(this.effectPools).forEach(function (kind) { this.effectPools[kind].forEach(function (p) { p.active = false; p.sprite.setVisible(false); }); }, this); this.renderRecords = { tiles: [], forges: [], mechanics: [], selection: [], preview: [], cursor: null }; }
    cellPoint(p) { return { x: this.layout.bx + this.layout.pad + (p.x + .5) * CELL, y: this.layout.by + this.layout.pad + (p.y + .5) * CELL }; }
    cellAt(x, y) { var gx = Math.floor((x - this.layout.bx - this.layout.pad) / CELL), gy = Math.floor((y - this.layout.by - this.layout.pad) / CELL); return inGrid(gx, gy) ? { x: gx, y: gy } : null; }
    makeBoardObjects() {
      var self = this;
      this.board.grid.forEach(function (row, y) { row.forEach(function (tile, x) { var sprite = self.add.image(0, 0, makeTileTexture(self, tile.color, tile.state === 'locked')).setDepth(5); self.world.push(sprite); self.renderRecords.tiles.push({ sprite: sprite, x: x, y: y }); var selected = self.add.rectangle(0, 0, CELL - 6, CELL - 6, self.set.accent, .16).setOrigin(.5).setStrokeStyle(2, self.set.accent, .9).setDepth(6).setVisible(false); self.world.push(selected); self.renderRecords.selection.push(selected); var preview = self.add.rectangle(0, 0, CELL - 9, CELL - 9, C.white, 0).setOrigin(.5).setStrokeStyle(2, self.set.second, .6).setDepth(6).setVisible(false); self.world.push(preview); self.renderRecords.preview.push(preview); }); });
      this.board.grid.forEach(function (row, y) { row.forEach(function (_tile, x) { var forge = self.add.image(0, 0, makeForgeTexture(self, (self.boardIndex + x + y) % COLORS.length)).setDepth(3).setAlpha(.28); self.world.push(forge); self.renderRecords.forges.push({ sprite: forge, cell: { x: x, y: y }, color: (self.boardIndex + x + y) % COLORS.length }); }); });
      var addMechanic = function (kind, data) { var sprite = self.add.image(0, 0, makeMechanicTexture(self, kind, data)).setDepth(4); self.world.push(sprite); self.renderRecords.mechanics.push({ sprite: sprite, kind: kind, data: data }); };
      this.board.conveyors.forEach(function (d) { addMechanic('conveyor', d); }); this.board.gates.forEach(function (d) { addMechanic('gate', d); }); if (this.board.plate) addMechanic('plate', Object.assign({}, this.board.plate, { active: false })); if (this.board.door) addMechanic('door', Object.assign({}, this.board.door, { open: false }));
      this.renderRecords.cursor = this.add.rectangle(0, 0, CELL - 3, CELL - 3, 0xffffff, 0).setOrigin(.5).setStrokeStyle(2, C.white, .75).setDepth(7); this.world.push(this.renderRecords.cursor);
    }
    isGateOpen(g) { return ((this.run ? this.run.moves : 0) + g.phase) % g.period < Math.ceil(g.period / 2); }
    gateAt(p) { return this.board.gates.find(function (g) { return g.x === p.x && g.y === p.y; }) || null; }
    conveyorAt(p) { return this.board.conveyors.find(function (g) { return g.x === p.x && g.y === p.y; }) || null; }
    isDoor(p) { return !!(this.board.door && this.board.door.x === p.x && this.board.door.y === p.y); }
    canSelect(p) { if (!inGrid(p.x, p.y) || this.isDoor(p) && !this.run.plateOpen) return false; var tile = this.run.grid[p.y][p.x]; if (!tile || tile.state !== 'free') return false; var gate = this.gateAt(p); return !gate || this.isGateOpen(gate); }
    selectCell(p) {
      if (!this.canSelect(p)) { this.invalid('LOCKED OR CLOSED'); return false; }
      var tile = this.run.grid[p.y][p.x]; this.run.selected = [clonePoint(p)]; tile.motion = 'preview'; this.run.lastEvent = 'PREVIEW ' + COLORS[tile.color].key.toUpperCase(); kit.audio.sfx('select', { volume: .32 }); this.updateCoach(false); return true;
    }
    extendSelection(p) {
      var selected = this.run.selected, last = selected[selected.length - 1]; if (!last || !adjacent(last, p) || selected.some(function (q) { return q.x === p.x && q.y === p.y; })) return false;
      var firstTile = this.run.grid[selected[0].y][selected[0].x], tile = this.run.grid[p.y][p.x]; if (!tile || !firstTile || tile.color !== firstTile.color || !this.canSelect(p)) return false;
      selected.push(clonePoint(p)); tile.motion = 'preview'; this.run.lastEvent = selected.length < 3 ? 'BUILD A CHAIN' : 'CHAIN READY'; if (selected.length >= 3) this.resolveSelection(); return true;
    }
    handleBoardTap(p) {
      if (!p || this.run.won || this.run.lost) return;
      if (!this.run.selected.length) { this.selectCell(p); return; }
      if (this.run.selected.some(function (q) { return q.x === p.x && q.y === p.y; })) { this.clearSelection(); return; }
      if (!this.extendSelection(p)) this.invalid('MATCH SAME SYMBOLS');
    }
    extendDrag(p) { if (!p || !this.run || !this.run.selected.length || this.run.won || this.run.lost) return; this.extendSelection(p); }
    clearSelection() { var self = this; this.run.selected.forEach(function (p) { var t = self.run.grid[p.y][p.x]; if (t) t.motion = t.state; }); this.run.selected = []; this.run.lastEvent = 'SELECT A MATCH'; }
    invalid(message) { this.run.lastEvent = message; kit.audio.sfx('invalid', { volume: .24, rate: .76 }); this.spawnEffect('match', this.cellPoint(this.run.cursor), C.danger, 2); this.clearSelection(); }
    selectedTouches(list, p) { return list.some(function (q) { return q.x === p.x && q.y === p.y; }); }
    unlockAround(selected) {
      var self = this, count = 0; for (var y = 0; y < GRID; y++) for (var x = 0; x < GRID; x++) { var tile = this.run.grid[y][x]; if (!tile || tile.state !== 'locked') continue; var near = selected.some(function (p) { return Math.abs(p.x - x) + Math.abs(p.y - y) === 1; }); if (near) { tile.state = 'collected'; tile.motion = 'collected'; this.run.grid[y][x] = null; this.run.collected++; count++; this.spawnEffect('reward', this.cellPoint({ x: x, y: y }), COLORS[tile.color].light, 8); } }
      if (count) { this.run.lastEvent = 'LOCKS COLLECTED +' + count; kit.audio.sfx('reward', { volume: .5, rate: 1.12 }); } return count;
    }
    resolveSelection() {
      if (this.run.selected.length < 3 || this.run.lost || this.run.won) return;
      var selected = this.run.selected.map(clonePoint), self = this, first = this.run.grid[selected[0].y][selected[0].x], color = COLORS[first.color]; this.hintPath = null; this.hintLife = 0; this.run.history.push(snapshotRun(this.run)); if (this.run.history.length > 16) this.run.history.shift();
      var wasConveyor = selected.some(function (p) { return !!self.conveyorAt(p); }), wasGate = selected.some(function (p) { return !!self.gateAt(p); }); selected.forEach(function (p) { var tile = self.run.grid[p.y][p.x]; if (tile) { tile.motion = 'resolve'; self.run.grid[p.y][p.x] = null; self.spawnEffect('match', self.cellPoint(p), color.light, 5); } }); this.run.matches++; this.run.moves++; this.run.cleared += selected.length; this.run.selected = [];
      if (wasConveyor) this.run.conveyorHits++; if (wasGate) this.run.gateHits++; this.unlockAround(selected); if (this.board.plate && this.run.cleared >= this.board.plateAfter) this.run.plateOpen = true;
      kit.audio.sfx('match', { volume: .52, rate: 1 + Math.min(.18, this.run.matches * .012) }); if (this.run.matches > 1) kit.audio.sfx('combo', { volume: .28, rate: 1 + Math.min(.22, this.run.matches * .02) }); this.gravity(selected); this.tutorialStep = Math.max(this.tutorialStep, 1); if (this.run.plateOpen) this.run.lastEvent = 'PRESS ARRAY ONLINE';
      if (this.completeGoals()) this.winBoard(); else if (this.run.moves >= this.board.budget) this.loseBoard(); else this.updateCoach(false); this.syncUi();
    }
    gravity(selected) {
      var old = {}; this.run.grid.forEach(function (row, y) { row.forEach(function (t, x) { if (t) old[t.id] = { x: x, y: y }; }); }); var rng = mulberry((this.boardIndex + 1) * 9176 + this.run.moves * 101); var nextId = this.run.moves * 1000 + this.run.cleared;
      for (var x = 0; x < GRID; x++) { var column = []; for (var y = GRID - 1; y >= 0; y--) if (this.run.grid[y][x]) column.push(this.run.grid[y][x]); while (column.length < GRID) column.push({ id: nextId++, color: Math.floor(rng() * COLORS.length), state: 'free', motion: 'cascade', animT: 0 }); for (var row = 0; row < GRID; row++) { var tile = column[GRID - 1 - row]; this.run.grid[row][x] = tile; var from = old[tile.id]; if (from && from.y !== row) { tile.fromX = from.x; tile.fromY = from.y; tile.animT = 0; tile.motion = 'cascade'; this.spawnEffect('cascade', this.cellPoint({ x: x, y: row }), COLORS[tile.color].light, 2); } else if (!from) { tile.fromX = x; tile.fromY = -1; tile.animT = 0; tile.motion = 'cascade'; } } }
      kit.audio.sfx('cascade', { volume: .2, rate: 1 + Math.min(.25, this.run.matches * .015) }); this.ensureMatchAvailable();
    }
    ensureMatchAvailable() { if (this.findMatchPath()) return; var cells = [], self = this; for (var y = 0; y < GRID; y++) for (var x = 0; x < GRID; x++) if (this.run.grid[y][x] && this.run.grid[y][x].state === 'free') cells.push({ x: x, y: y, tile: this.run.grid[y][x] }); cells.forEach(function (entry, i) { entry.tile.color = (entry.tile.color + i + 1) % COLORS.length; }); var forced = null; cells.forEach(function (a) { if (forced) return; cells.forEach(function (b) { if (forced || !adjacent(a, b)) return; cells.forEach(function (c) { if (!forced && adjacent(b, c) && !adjacent(a, c) && a.tile.color === b.tile.color) { c.tile.color = a.tile.color; forced = [a, b, c]; } }); }); }); this.run.lastEvent = forced ? 'FLOW RESET, MATCH READY' : 'FIND A MATCH'; }
    findMatchPath() {
      var dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }], result = null, self = this;
      for (var y = 0; y < GRID && !result; y++) for (var x = 0; x < GRID && !result; x++) { var start = { x: x, y: y }, tile = this.run.grid[y][x]; if (!self.canSelect(start)) continue; var path = [start]; for (var d = 0; d < dirs.length && !result; d++) { var p = { x: x + dirs[d].x, y: y + dirs[d].y }; if (!self.canSelect(p) || self.run.grid[p.y][p.x].color !== tile.color) continue; path.push(p); for (var e = 0; e < dirs.length; e++) { var q = { x: p.x + dirs[e].x, y: p.y + dirs[e].y }; if (inGrid(q.x, q.y) && self.canSelect(q) && self.run.grid[q.y][q.x].color === tile.color && !self.selectedTouches(path, q)) { result = path.concat([q]); break; } } } }
      return result;
    }
    completeGoals() { var goal = this.board.goal; return this.run.matches >= goal.matches && this.run.collected >= goal.locks && this.run.conveyorHits >= (goal.conveyor || 0) && this.run.gateHits >= (goal.gate || 0) && (!goal.plate || this.run.plateOpen); }
    loseBoard() { this.run.lost = true; this.run.lastEvent = 'LIMIT REACHED'; this.showBanner('FLOW JAM', 'LIMIT REACHED', false, true); kit.audio.sfx('invalid', { volume: .5, rate: .6 }); this.syncUi(); }
    winBoard() {
      if (this.run.won) return; this.run.won = true; this.run.stars = this.run.undoUsed === 0 && this.run.moves <= this.board.par ? 3 : this.run.moves <= this.board.budget - 1 ? 2 : 1; var old = this.profile.medals[this.boardIndex] || 0; this.profile.medals[this.boardIndex] = Math.max(old, this.run.stars); this.profile.best[this.boardIndex] = this.profile.best[this.boardIndex] ? Math.min(this.profile.best[this.boardIndex], this.run.moves) : this.run.moves; this.profile.unlocked = Math.max(this.profile.unlocked || 0, Math.min(29, this.boardIndex + 1)); this.profile.rewards[this.boardIndex] = this.set.module + ' RESTORED'; var mechanism = mechanismForSet(this.board.set); if (mechanism) this.profile.mechanisms[mechanism] = true; this.profile.tutorialDone = true; kit.save.set(this.profile);
      this.flash = motionOn(kit) ? .35 : 0; this.spawnEffect('reward', this.cellPoint({ x: 2, y: 2 }), C.brass, 20); kit.juice.shake(3, 120); kit.juice.hitStop(75); kit.audio.sfx('resolve', { volume: .7 }); kit.audio.music('resolve', 180); this.showBanner('BOARD CLEAR', mechanism ? this.set.module + ' ONLINE' : 'FORGE RESTORED', false, false); this.tutorialStep = 3; this.syncUi();
    }
    showBanner(title, sub, setEnd, lost) { var self = this; this.clearEventChip(); this.coachLife = 0; this.coachAlpha = 0; if (this.banner) this.banner.forEach(function (o) { o.destroy(); }); this.banner = []; var detail = this.run ? (lost ? 'MOVES ' + this.run.moves + '/' + this.board.budget + '  •  PAR ' + this.board.par : 'MOVES ' + this.run.moves + '  •  PAR ' + this.board.par + '  •  ' + '★'.repeat(this.run.stars)) : ''; var bg = this.add.rectangle(W / 2, 370, 282, 154, this.set.board, .98).setStrokeStyle(2, lost ? C.danger : setEnd ? this.set.second : this.set.accent, .95).setDepth(20); var shine = this.add.rectangle(W / 2, 306, 188, 4, lost ? C.danger : this.set.accent, .9).setDepth(21); var t = addText(this, W / 2, 337, title, 24, '#f7fbff', 900, .5).setDepth(21); var s = addText(this, W / 2, 371, sub, 14, lost ? '#ffb7c6' : '#b5eeff', 900, .5).setDepth(21); var d = addText(this, W / 2, 396, detail, 14, lost ? '#ffb7c6' : '#ffe5a0', 900, .5).setDepth(21); var c = addText(this, W / 2, 425, lost ? 'TAP TO RETRY' : 'TAP TO CONTINUE', 14, '#ffe5a0', 900, .5).setDepth(21); this.banner.push(bg, shine, t, s, d, c); this.bannerT = 0; this.bannerLost = !!lost; this.bannerSetEnd = !!setEnd; self.render(); }
    advanceAfterWin() { if (this.boardIndex < 29) { kit.audio.music('board', 180); this.startBoard(this.boardIndex + 1); } else this.showGrid(); }
    restartBoard() { if (!this.board) return; this.startBoard(this.boardIndex); kit.audio.sfx('reset', { volume: .38 }); }
    undo() { if (this.mode !== 'game' || !this.run || !this.run.history.length || this.run.won || this.run.lost) return; var saved = this.run.history.pop(), history = this.run.history; var oldUndo = this.run.undoUsed; this.run = Object.assign(newRun(this.board), saved); this.run.history = history; this.run.undoUsed = oldUndo + 1; this.run.hintUses = this.boardIndex < 6 ? 3 : this.boardIndex < 14 ? 2 : 1; this.hintPath = null; this.hintLife = 0; this.run.lastEvent = 'UNDO READY'; this.beginCascadeRestore(); this.checkTutorialUndo(); kit.audio.sfx('select', { volume: .34, rate: .86 }); this.syncUi(); }
    beginCascadeRestore() { this.run.grid.forEach(function (row, y) { row.forEach(function (t, x) { if (t) { t.animT = 0; t.fromX = x; t.fromY = -1; t.motion = t.state === 'locked' ? 'locked' : 'cascade'; } }); }); this.run.selected = []; }
    checkTutorialUndo() { if (this.boardIndex === 0 && !this.profile.tutorialDone) this.tutorialStep = Math.max(this.tutorialStep, 2); }
    useHint() { if (this.mode !== 'game' || !this.run || this.run.hintUses <= 0 || this.run.won || this.run.lost) return; var path = this.findMatchPath(); if (!path) { this.ensureMatchAvailable(); path = this.findMatchPath(); } if (!path) return; this.run.hintUses--; this.run.lastEvent = 'HINT PATH READY'; this.hintPath = path; this.hintLife = 1.8; kit.audio.sfx('select', { volume: .42, rate: 1.25 }); this.syncUi(); }
    pollControls() {
      var self = this, keyCodes = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', confirm: 'Enter', altConfirm: 'Space', undo: 'KeyZ', reset: 'KeyR', grid: 'Escape', settings: 'KeyP' }; function pressed(code) { return kit.input.keyDown(code); } function edge(name, state) { var now = !!state; var was = !!self.keyHeld[name]; self.keyHeld[name] = now; return now && !was; }
      if (edge('settings', pressed(keyCodes.settings))) { kit.openSettings(); return; } if (edge('reset', pressed(keyCodes.reset))) { this.restartBoard(); return; } if (edge('undo', pressed(keyCodes.undo))) { this.undo(); return; } if (edge('grid', pressed(keyCodes.grid))) { if (this.mode === 'game') this.showGrid(); else this.startBoard(clamp(this.profile.unlocked || 0, 0, 29)); return; }
      var pad = kit.input.gamepadState ? kit.input.gamepadState() : null; var dx = 0, dy = 0, confirm = false; if (pad) { dx = Math.abs(pad.x || 0) > .35 ? (pad.x > 0 ? 1 : -1) : 0; dy = Math.abs(pad.y || 0) > .35 ? (pad.y > 0 ? 1 : -1) : 0; confirm = !!pad.confirm; }
      if (this.mode !== 'game' || !this.run) return; if (edge('padX', dx !== 0)) { this.run.cursor.x = clamp(this.run.cursor.x + dx, 0, GRID - 1); kit.audio.sfx('select', { volume: .16 }); } if (edge('padY', dy !== 0)) { this.run.cursor.y = clamp(this.run.cursor.y + dy, 0, GRID - 1); kit.audio.sfx('select', { volume: .16 }); } if (edge('confirm', confirm || pressed(keyCodes.confirm) || pressed(keyCodes.altConfirm))) this.handleBoardTap(clonePoint(this.run.cursor));
    }
    bindPointerInput() {
      var self = this; this.input.on('pointerdown', function (p) { if (kit.paused) return; var domId = p.event && p.event.pointerId != null ? p.event.pointerId : p.id; var ggPointer = kit.input.pointers.get(domId); self.gestures.set(p.id, { sx: p.x, sy: p.y, drag: false, ggPointer: !!ggPointer }); }); this.input.on('pointermove', function (p) { var g = self.gestures.get(p.id); if (!g || kit.paused || self.mode !== 'game' || !self.run || self.run.won || self.run.lost) return; if (!g.drag && Math.hypot(p.x - g.sx, p.y - g.sy) > 10) { g.drag = true; self.handleBoardTap(self.cellAt(g.sx, g.sy)); } if (g.drag) self.extendDrag(self.cellAt(p.x, p.y)); }); this.input.on('pointerup', function (p) { var g = self.gestures.get(p.id); if (!g) return; self.gestures.delete(p.id); if (kit.paused) return; if (g.drag) { if (self.run.selected.length >= 3) self.resolveSelection(); else self.clearSelection(); return; } self.handleTap(p.x, p.y); }); this.input.on('pointercancel', function (p) { self.gestures.delete(p.id); self.clearSelection(); });
    }
    handleTap(x, y) {
      if (this.mode === 'grid') { if (this.gridBack && y > 760) { this.startBoard(clamp(this.profile.unlocked || 0, 0, 29)); return; } var chosen = this.gridHit(x, y); if (chosen >= 0 && chosen <= (this.profile.unlocked || 0)) { kit.audio.sfx('select', { volume: .35 }); this.startBoard(chosen); } return; }
      if (this.banner) { if (this.bannerLost) this.restartBoard(); else this.advanceAfterWin(); return; } if (y < 70 && x > 326) { kit.openSettings(); return; } if (y < 70 && x > 250 && x <= 326) { this.restartBoard(); return; } if (y < 70 && x > 190 && x <= 250) { this.showGrid(); return; } if (y > 744 && y < 832 && x < 190) { this.undo(); return; } if (y > 744 && y < 832 && x >= 190) { this.useHint(); return; } if (y >= this.layout.by && y < this.layout.by + this.layout.ph) { this.handleBoardTap(this.cellAt(x, y)); }
    }
    updateCoach() {
      if (!this.run || this.profile.tutorialDone || this.boardIndex !== 0) { this.coachAlpha = 0; this.coachLife = 0; this.coachMessage = ''; return; } var message = this.tutorialStep === 0 ? 'Tap 3 same symbols' : this.tutorialStep === 1 ? 'Clear by locks to collect them' : 'Undo or reset if jammed'; if (message !== this.coachMessage) { this.coachMessage = message; setTextIfChanged(this.ui.coach, message); this.coachLife = 3.8; if (this.eventChipCurrent) { this.eventChipQueue.unshift(this.eventChipCurrent); this.eventChipCurrent = ''; this.eventChipLife = 0; this.ui.statusBg.setVisible(false); this.ui.status.setVisible(false); } } this.coachAlpha = 1;
    }
    syncUi() {
      if (!this.run || !this.board) return; var goal = this.board.goal; setTextIfChanged(this.ui.level, String(this.boardIndex + 1).padStart(2, '0')); setTextIfChanged(this.ui.set, this.set.module); setTextIfChanged(this.ui.goal, '◆ ' + this.run.matches + '/' + goal.matches + '    ▣ ' + this.run.collected + '/' + goal.locks); setTextIfChanged(this.ui.move, this.run.moves + '/' + this.board.budget); this.ui.moveBarFill.setDisplaySize(Math.max(0, 150 * clamp(this.run.moves / this.board.budget, 0, 1)), 6); setTextIfChanged(this.ui.undoCount, String(Math.max(0, 16 - this.run.undoUsed))); setTextIfChanged(this.ui.hintCount, String(this.run.hintUses)); this.ui.undo.setColor(this.run.history.length && !this.run.won && !this.run.lost ? '#b5eeff' : '#64758d'); this.ui.hint.setColor(this.run.hintUses && !this.run.won && !this.run.lost ? '#fff0a5' : '#64758d'); if (this.run.lastEvent !== this.lastEventSeen) { this.lastEventSeen = this.run.lastEvent; this.queueEvent(this.run.lastEvent); } this.updateCoach();
    }
    syncDebug() { DEBUG_STATE.mode = this.mode; DEBUG_STATE.board = this.boardIndex + 1; DEBUG_STATE.boardId = this.board ? this.board.id : 'fl-01'; DEBUG_STATE.moves = this.run ? this.run.moves : 0; DEBUG_STATE.stars = this.run ? this.run.stars : (this.profile.medals[this.boardIndex] || 0); DEBUG_STATE.set = this.board ? this.board.set + 1 : 1; DEBUG_STATE.matches = this.run ? this.run.matches : 0; DEBUG_STATE.locks = this.run ? this.run.collected : 0; DEBUG_STATE.goal = this.board ? this.board.goal.matches : 1; DEBUG_STATE.budget = this.board ? this.board.budget : 6; DEBUG_STATE.mechanism = this.board ? this.board.mechanics : 'CORE FORGE'; DEBUG_STATE.reducedMotion = !motionOn(kit); }
    step(dt) { this.fixedTime += dt; this.pollControls(); if (this.flash > 0) this.flash = Math.max(0, this.flash - dt); if (this.hintLife > 0) { this.hintLife = Math.max(0, this.hintLife - dt); if (!this.hintLife) this.hintPath = null; } if (this.coachLife > 0) this.coachLife = Math.max(0, this.coachLife - dt); this.updateEventChip(dt); if (this.banner) this.bannerT = Math.min(1, this.bannerT + dt / (motionOn(kit) ? .42 : .12)); Object.keys(this.effectPools).forEach(function (kind) { this.updateEffects(kind, dt); }, this); if (this.run) this.run.grid.forEach(function (row) { row.forEach(function (t) { if (t && t.animT < 1) { t.animT = clamp(t.animT + dt / .18, 0, 1); if (t.animT >= 1) t.motion = t.state; } }); }); this.syncUi(); this.syncDebug(); }
    updateEffects(kind, dt) { this.effectPools[kind].forEach(function (p) { if (!p.active) return; p.life -= dt; if (p.life <= 0) { p.active = false; p.sprite.setVisible(false); return; } p.x += p.vx * dt; p.y += p.vy * dt; if (kind !== 'reward') p.vy += 75 * dt; p.sprite.setPosition(p.x, p.y).setRotation(p.sprite.rotation + p.spin * dt).setAlpha(clamp(p.life / p.max, 0, 1)).setScale(p.scale * (.72 + p.life / p.max * .48)); }); }
    spawnEffect(kind, point, color, count) { var pool = this.effectPools[kind], wanted = motionOn(kit) ? count : Math.min(4, count), made = 0; for (var i = 0; i < pool.length && made < wanted; i++) { var p = pool[i]; if (p.active) continue; var angle = (i * 2.17 + this.fixedTime * 4) % TAU; p.active = true; p.x = point.x; p.y = point.y; p.vx = Math.cos(angle) * (kind === 'reward' ? 38 : 24 + i % 4 * 8); p.vy = kind === 'cascade' ? 18 : Math.sin(angle) * 30 - 18; p.life = p.max = kind === 'reward' ? .55 + i % 4 * .07 : .25 + i % 3 * .06; p.scale = kind === 'reward' ? 1.2 : .75 + i % 3 * .2; p.spin = kind === 'reward' ? 4 : 0; p.sprite.setTint(color).setPosition(p.x, p.y).setAlpha(1).setScale(p.scale).setVisible(true); made++; } }
    render() {
      if (this.mode === 'grid') { if (this.gridItems) this.gridItems.forEach(function (o) { if (o && o.setVisible) o.setVisible(true); }); return; } if (!this.run || !this.layout) return; var self = this;
      this.renderRecords.forges.forEach(function (r) { var p = self.cellPoint(r.cell); r.sprite.setPosition(p.x, p.y).setAlpha(self.run.grid[r.cell.y][r.cell.x] && self.run.grid[r.cell.y][r.cell.x].color === r.color ? .42 : .17); });
      this.renderRecords.mechanics.forEach(function (r) { var data = Object.assign({}, r.data); if (r.kind === 'gate') data.open = self.isGateOpen(r.data); if (r.kind === 'plate') data.active = self.run.plateOpen; if (r.kind === 'door') data.open = self.run.plateOpen; r.sprite.setTexture(makeMechanicTexture(self, r.kind, data)).setPosition(self.cellPoint(r.data)); });
      this.renderRecords.tiles.forEach(function (r, i) { var x = i % GRID, y = Math.floor(i / GRID), tile = self.run.grid[y][x], sprite = r.sprite; if (!tile) { sprite.setVisible(false); return; } var fromX = tile.fromX != null ? tile.fromX : x, fromY = tile.fromY != null ? tile.fromY : y, t = tile.animT == null ? 1 : easeOutCubic(tile.animT), pos = self.cellPoint({ x: fromX + (x - fromX) * t, y: fromY + (y - fromY) * t }); sprite.setTexture(makeTileTexture(self, tile.color, tile.state === 'locked')).setPosition(pos.x, pos.y).setVisible(true); var selected = self.run.selected.some(function (p) { return p.x === x && p.y === y; }); sprite.setScale(selected ? 1.08 : tile.state === 'locked' ? 1 : 1); sprite.setAlpha(tile.motion === 'resolve' ? .25 : 1); });
      this.renderRecords.selection.forEach(function (o, i) { var x = i % GRID, y = Math.floor(i / GRID), selected = self.run.selected.some(function (p) { return p.x === x && p.y === y; }); o.setPosition(self.cellPoint({ x: x, y: y })).setVisible(selected).setScale(selected ? 1 + Math.sin(self.fixedTime * 8) * .04 : 1); });
      var path = this.run.selected.length === 1 ? this.findAdjacentPreview(this.run.selected[0]) : this.run.selected.length ? [] : (this.hintPath || []); this.renderRecords.preview.forEach(function (o, i) { var x = i % GRID, y = Math.floor(i / GRID), shown = path.some(function (p) { return p.x === x && p.y === y; }); o.setPosition(self.cellPoint({ x: x, y: y })).setAlpha(self.hintLife > 0 ? clamp(self.hintLife, 0, 1) : .6).setVisible(shown); }); var cursor = this.renderRecords.cursor; cursor.setPosition(this.cellPoint(this.run.cursor)).setVisible(!this.run.won && !this.run.lost && !this.run.selected.length);
      var coachOpacity = this.coachLife > 0 ? (motionOn(kit) ? (this.coachLife > .8 ? 1 : .08 + this.coachLife / .8 * .92) : .9) : 0; this.ui.coachBg.setAlpha(this.coachAlpha * coachOpacity); this.ui.coach.setAlpha(this.coachAlpha * coachOpacity); if (this.eventChipCurrent) { var chipOpacity = motionOn(kit) ? clamp(this.eventChipLife / .16, 0, 1) : .9; this.ui.statusBg.setAlpha(chipOpacity * .92); this.ui.status.setAlpha(chipOpacity); } if (this.flash > 0) { if (!this.flashRect) { this.flashRect = this.add.rectangle(W / 2, H / 2, W, H, C.white, 0).setDepth(19); this.world.push(this.flashRect); } this.flashRect.setAlpha(this.flash * .22); } else if (this.flashRect) this.flashRect.setAlpha(0); if (this.banner) { var bt = motionOn(kit) ? easeOutBack(this.bannerT) : 1; this.banner.forEach(function (o) { o.setScale(bt); }); }
    }
    findAdjacentPreview(start) { var t = this.run.grid[start.y][start.x], out = [], self = this; if (!t) return out; [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }].forEach(function (d) { var p = { x: start.x + d.x, y: start.y + d.y }; if (self.canSelect(p) && self.run.grid[p.y][p.x].color === t.color) out.push(p); }); return out; }
    showGrid() { this.mode = 'grid'; if (this.banner) { this.banner.forEach(function (o) { o.destroy(); }); this.banner = null; } if (this.flashRect) { this.flashRect.destroy(); this.flashRect = null; } this.clearWorld(); this.drawGrid(); this.syncDebug(); }
    drawGrid() {
      this.ui.chrome.setTexture(makeChrome(this, SETS[0])); this.ui.title.setText('FORGELOCK').setVisible(true); this.ui.kicker.setText('CAMPAIGN MAP  •  30 BOARD FACTORY').setVisible(true); this.ui.level.setVisible(false); this.ui.set.setVisible(false); this.hideGameUi(false); this.gridItems = []; var header = addText(this, 20, 124, 'SELECT A BOARD', 18, '#f7fbff', 900, 0); var open = addText(this, 370, 128, Math.min(30, (this.profile.unlocked || 0) + 1) + ' OPEN', 12, '#8ca6c2', 900, 1); this.gridItems.push(header, open); var y = 160;
      for (var s = 0; s < SETS.length; s++) { var set = SETS[s], label = addText(this, 20, y, (s + 1) + '  ' + set.name + '  ' + set.module, 12, '#' + set.frame.toString(16).padStart(6, '0'), 900, 0); this.gridItems.push(label); y += 20; var length = SET_LENGTHS[s], rows = Math.ceil(length / 5), base = setStart(s); for (var row = 0; row < rows; row++) for (var col = 0; col < 5; col++) { var no = row * 5 + col; if (no >= length) continue; var id = base + no, x = 20 + col * 72, cy = y + row * 55, unlocked = id <= (this.profile.unlocked || 0), medal = this.profile.medals[id] || 0; var bg = this.add.rectangle(x + 30, cy + 21, 62, 44, unlocked ? set.board : 0x131e2d, 1).setOrigin(.5).setStrokeStyle(1, unlocked ? set.frame : 0x36445b, unlocked ? .7 : .45); var n = addText(this, x + 9, cy + 8, String(id + 1).padStart(2, '0'), 13, unlocked ? '#f7fbff' : '#64758d', 900, 0); var stars = addText(this, x + 9, cy + 28, unlocked ? '★'.repeat(medal) + '☆'.repeat(3 - medal) : 'LOCK', 12, unlocked ? '#ffe5a0' : '#71839c', 900, 0); this.gridItems.push(bg, n, stars); } y += rows * 55 + 13; }
      var back = addText(this, 20, 785, 'BACK TO CURRENT BOARD', 12, '#b5eeff', 900, 0); var note = addText(this, 370, 785, 'CLEAR BOARD ' + ((this.profile.unlocked || 0) + 1) + ' TO UNLOCK', 12, '#71839c', 800, 1); this.gridItems.push(back, note); this.gridBack = { y: 760 };
    }
    gridHit(x, y) { var cursor = 160, left = 20, base; for (var s = 0; s < SETS.length; s++) { cursor += 20; var rows = Math.ceil(SET_LENGTHS[s] / 5); base = setStart(s); for (var row = 0; row < rows; row++) for (var col = 0; col < 5; col++) { var n = row * 5 + col; if (n >= SET_LENGTHS[s]) continue; var sy = cursor + row * 55; if (x >= left + col * 72 && x < left + col * 72 + 62 && y >= sy && y < sy + 44) return base + n; } cursor += rows * 55 + 13; } return -1; }
    queueEvent(message) { var important = message && (/^LOCKS COLLECTED/.test(message) || message === 'PRESS ARRAY ONLINE' || message === 'FLOW RESET, MATCH READY' || message === 'HINT PATH READY' || message === 'UNDO READY'); if (!important || this.banner || this.eventChipCurrent === message || this.eventChipQueue.indexOf(message) >= 0) return; if (this.eventChipQueue.length < 4) this.eventChipQueue.push(message); this.pumpEventChip(); }
    pumpEventChip() { if (this.eventChipCurrent || this.banner || this.coachLife > 0 || !this.eventChipQueue.length) return; this.eventChipCurrent = this.eventChipQueue.shift(); this.eventChipLife = 1; setTextIfChanged(this.ui.status, this.eventChipCurrent); this.ui.statusBg.setVisible(true); this.ui.status.setVisible(true); }
    clearEventChip() { this.eventChipCurrent = ''; this.eventChipLife = 0; this.eventChipQueue = []; if (this.ui.statusBg) this.ui.statusBg.setVisible(false); if (this.ui.status) this.ui.status.setVisible(false); }
    updateEventChip(dt) { if (this.eventChipCurrent) { this.eventChipLife = Math.max(0, this.eventChipLife - dt); if (!this.eventChipLife) { this.eventChipCurrent = ''; this.ui.statusBg.setVisible(false); this.ui.status.setVisible(false); } } this.pumpEventChip(); }
    hideGameUi(show) { var keys = ['level', 'set', 'grid', 'gridBg', 'reset', 'resetBg', 'pause', 'pauseBg', 'coachBg', 'coach', 'goal', 'move', 'moveBarBg', 'moveBarFill', 'undoBg', 'hintBg', 'undo', 'undoCount', 'hint', 'hintCount', 'statusBg', 'status']; keys.forEach(function (k) { if (this.ui[k]) this.ui[k].setVisible(show); }, this); }
    update(_time, delta) { if (kit.paused || this.pausedByKit) { this.acc = 0; return; } var frame = kit.juice.frame(); if (frame.frozen) return; this.acc += Math.min(.25, Math.max(0, delta / 1000)); var steps = 0; while (this.acc >= STEP && steps < MAX_STEPS) { this.step(STEP); this.acc -= STEP; steps++; } this.render(); }
  };

  var game = new Phaser.Game({ type: Phaser.AUTO, parent: document.body, width: W, height: H, backgroundColor: '#0a1422', scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, render: { antialias: true, roundPixels: false, powerPreference: 'high-performance', batchSize: 2048 }, fps: { target: 60, min: 30 }, scene: [ForgelockScene] });
  window.__FORGELOCK_READY = true; window.__FORGELOCK_GAME = game;
})();
