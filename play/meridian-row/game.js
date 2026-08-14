/* Meridian Row, fleet F3. Phaser 3 render shell with GGKit-owned save, audio, and lifecycle. */
(function (root) {
  'use strict';

  var Phaser = root.Phaser;
  var W = 390;
  var H = 844;
  var STEP = 1 / 60;
  var MAX_STEPS = 4;
  var INITIAL_TILES = 48;
  var FONT = 'ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif';
  var SAVE_VERSION = 3;
  var REDUCED = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var C = {
    ink: '#eef7ff', muted: '#a4bad0', deep: '#07101c', panel: '#0d1b2c', panel2: '#12243a',
    line: '#2b4964', cyan: '#5de3ff', gold: '#ffd267', mint: '#72efb1', violet: '#c9a2ff',
    rose: '#ff7d9b', orange: '#ff9d68', red: '#ff6a71', slate: '#7891a9', white: '#ffffff'
  };

  var BASE_DISTRICTS = [
    {name: 'Saltmarket', short: 'SALT', color: '#4cb8ff', icon: '◆'},
    {name: 'Lanternside', short: 'LANT', color: '#ffbd52', icon: '✦'},
    {name: 'Kiln Quarter', short: 'KILN', color: '#ff6d70', icon: '⬟'},
    {name: 'Verge Park', short: 'VERGE', color: '#61dfa4', icon: '✿'}
  ];

  var BOARD_CATALOG = [
    {id: 'meridian-row', mode: 'main', name: 'Meridian Row', subtitle: 'The four-district town loop', tiles: 24, layout: 'row', shortcuts: [9, 21], pickups: [3, 15], hazards: false, theme: '#4cb8ff', districts: BASE_DISTRICTS},
    {id: 'docklight-dash', mode: 'rush', name: 'Docklight Dash', subtitle: 'The first Sticker Rush board', tiles: 12, layout: 'harbor', shortcuts: [4, 9], pickups: [2, 8], albumGoal: 8, districtGoal: 2, hazards: false, theme: '#ffbd52',
      districts: [
        {name: 'Docklight', short: 'DOCK', color: '#43c9ff', icon: '◆'}, {name: 'Fishery', short: 'FISH', color: '#65e2c0', icon: '✦'},
        {name: 'Brass Pier', short: 'BRASS', color: '#ffbd52', icon: '⬟'}, {name: 'Gullwalk', short: 'GULL', color: '#d1a8ff', icon: '✿'}
      ]},
    {id: 'lantern-loop', mode: 'rush', name: 'Lantern Loop', subtitle: 'A warm market shortcut', tiles: 16, layout: 'lantern', shortcuts: [5, 12], pickups: [3, 11], albumGoal: 12, districtGoal: 3, hazards: false, theme: '#d1a8ff',
      districts: [
        {name: 'Wickway', short: 'WICK', color: '#ffb84f', icon: '✦'}, {name: 'Paper Court', short: 'PAPER', color: '#ff78a6', icon: '◆'},
        {name: 'Glow Yard', short: 'GLOW', color: '#cba5ff', icon: '⬟'}, {name: 'Night Fern', short: 'FERN', color: '#66dfab', icon: '✿'}
      ]},
    {id: 'spire-sprint', mode: 'rush', name: 'Spire Sprint', subtitle: 'The hazard-marked final rush', tiles: 20, layout: 'spire', shortcuts: [6, 16], pickups: [3, 13], albumGoal: 16, districtGoal: 4, hazards: true, theme: '#ff7d9b',
      districts: [
        {name: 'Rose Foundry', short: 'ROSE', color: '#ff708c', icon: '◆'}, {name: 'Sky Ledger', short: 'SKY', color: '#66d9ff', icon: '✦'},
        {name: 'Copper Gate', short: 'COPR', color: '#ffad58', icon: '⬟'}, {name: 'Moss Court', short: 'MOSS', color: '#6ce0a6', icon: '✿'}
      ]},
    {id: 'endless-row', mode: 'endless', name: 'Endless Row', subtitle: 'An expanding loop for score chasers', tiles: 24, layout: 'endless', shortcuts: [9, 21], pickups: [3, 15], hazards: false, theme: '#72efb1', districts: BASE_DISTRICTS},
    {id: 'meridian-spire', mode: 'main', name: 'Meridian Spire', subtitle: 'The high-rung town with landmark hazards', tiles: 24, layout: 'crown', shortcuts: [7, 19], pickups: [3, 15], hazards: true, theme: '#c9a2ff',
      districts: [
        {name: 'Crown Quay', short: 'CROWN', color: '#65c9ff', icon: '◆'}, {name: 'Moon Arcade', short: 'MOON', color: '#c5a1ff', icon: '✦'},
        {name: 'Ember Rise', short: 'EMBER', color: '#ff786f', icon: '⬟'}, {name: 'Greenline', short: 'GREEN', color: '#6ee1a7', icon: '✿'}
      ]}
  ];
  var RUSH_BOARDS = ['docklight-dash', 'lantern-loop', 'spire-sprint'];
  var STICKERS = [
    'Brine Crane', 'Netmender', 'Tide Scale', 'Salt Awning', 'Dock Lantern', 'Gull Vane',
    'Wick Tower', 'Paper Moth', 'Amber Pane', 'Lamp Ferry', 'Ember Bell', 'Glow Arch',
    'Clay Wheel', 'Flue Stack', 'Red Slab', 'Ash Gate', 'Fire Ladle', 'Brick Rose',
    'Fern Gate', 'Green Bench', 'Root Bridge', 'Seed Vault', 'Moss Dial', 'Leaf Arch'
  ];
  var TIER_NAMES = ['Stall', 'Hall', 'Spire'];
  var TIER_COSTS = [18, 34, 58];
  var TIER_INCOME = [6, 12, 22];
  var ALBUM_BONUS = 40;
  var HEIST_ODDS = 0.85;
  var TOKEN_COLORS = ['#eef7ff', '#ff7ba9', '#bf9dff', '#62e1c0'];
  var RIVAL_FAMILY = [
    [{name: 'Vex Orlan', color: '#ff7ba9', build: 1, shield: 0.24}, {name: 'Bramble Kite', color: '#bf9dff', build: 1, shield: 0.31}, {name: 'Dorn Wexley', color: '#62e1c0', build: 1, shield: 0.36}],
    [{name: 'Vex Orlan', color: '#ff7ba9', build: 0.88, shield: 0.32}, {name: 'Bramble Kite', color: '#bf9dff', build: 0.84, shield: 0.39}, {name: 'Dorn Wexley', color: '#62e1c0', build: 0.8, shield: 0.43}],
    [{name: 'Vex Orlan', color: '#ff7ba9', build: 0.77, shield: 0.4}, {name: 'Bramble Kite', color: '#bf9dff', build: 0.72, shield: 0.47}, {name: 'Dorn Wexley', color: '#62e1c0', build: 0.68, shield: 0.5}],
    [{name: 'Vex Orlan', color: '#ff7ba9', build: 0.66, shield: 0.48}, {name: 'Bramble Kite', color: '#bf9dff', build: 0.62, shield: 0.54}, {name: 'Dorn Wexley', color: '#62e1c0', build: 0.58, shield: 0.58}]
  ];
  var PLAYER_CONTROLS = [
    {name: 'P1', roll: 'Space', trick: 'KeyT', hint: 'SPACE / T'},
    {name: 'P2', roll: 'Enter', trick: 'KeyY', hint: 'ENTER / Y'},
    {name: 'P3', roll: 'ShiftLeft', trick: 'KeyU', hint: 'SHIFT / U'},
    {name: 'P4', roll: 'Backspace', trick: 'KeyI', hint: 'BACKSPACE / I'}
  ];
  var POWER_NAMES = ['DASH', 'GUARD', 'BRAKE'];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function whole(v, d) { return Number.isInteger(v) ? v : d; }
  function num(v, d) { return Number.isFinite(v) ? v : d; }
  function tint(hex) { return parseInt(String(hex).replace('#', ''), 16) || 0xffffff; }
  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  function safeArray(v, n, fill) { return Array.isArray(v) && v.length === n ? v : new Array(n).fill(fill); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeBack(t) { var c = 1.70158; return 1 + c * Math.pow(t - 1, 3) + (c + 0.3) * Math.pow(t - 1, 2); }
  function medalName(n) { return n === 3 ? 'GOLD' : n === 2 ? 'SILVER' : n === 1 ? 'BRONZE' : 'NONE'; }
  function medalColor(n) { return n === 3 ? C.gold : n === 2 ? '#dbe8f2' : n === 1 ? '#d69161' : C.slate; }
  function setTextIfChanged(node, value, colorValue) {
    if (!node) return;
    var next = String(value);
    if (node.text !== next) node.setText(next);
    if (colorValue && node._mrColor !== colorValue) { node.setColor(colorValue); node._mrColor = colorValue; }
  }
  function setFillIfChanged(node, value, alpha) {
    if (!node) return;
    var next = tint(value);
    if (node._mrFill !== next || (alpha != null && node._mrAlpha !== alpha)) {
      node.setFillStyle(next, alpha == null ? 1 : alpha); node._mrFill = next; node._mrAlpha = alpha;
    }
  }
  function setStrokeIfChanged(node, value, width, alpha) {
    if (!node) return;
    var next = tint(value);
    if (node._mrStroke !== next || node._mrStrokeWidth !== width) {
      node.setStrokeStyle(width || 1, next, alpha == null ? 1 : alpha); node._mrStroke = next; node._mrStrokeWidth = width;
    }
  }
  function setTextureIfChanged(node, key) { if (node && node._mrTexture !== key) { node.setTexture(key); node._mrTexture = key; } }
  function visible(node, value) { if (node && node.visible !== value) node.setVisible(value); }
  function colorDistrict(board, d) {
    var list = board && Array.isArray(board.districts) ? board.districts : BASE_DISTRICTS;
    return list[d] || BASE_DISTRICTS[d] || BASE_DISTRICTS[0];
  }
  function getBoard(id) {
    for (var i = 0; i < BOARD_CATALOG.length; i++) if (BOARD_CATALOG[i].id === id) return BOARD_CATALOG[i];
    return BOARD_CATALOG[0];
  }
  function normalizeMode(value) {
    var v = String(value || '').toLowerCase();
    if (v === 'sticker-rush' || v === 'sticker_rush') v = 'rush';
    return v === 'rush' || v === 'endless' || v === 'main' ? v : 'main';
  }
  function boardFor(mode, forced, level, row) {
    var candidate = null;
    if (forced != null && forced !== '') {
      if (typeof forced === 'number' || /^\d+$/.test(String(forced))) {
        var index = Math.max(0, Number(forced) | 0);
        if (mode === 'rush') candidate = getBoard(RUSH_BOARDS[index] || RUSH_BOARDS[0]);
      } else candidate = getBoard(String(forced));
    }
    if (!candidate || candidate.mode !== mode) {
      if (mode === 'rush') candidate = getBoard(RUSH_BOARDS[0]);
      else if (mode === 'endless') candidate = getBoard('endless-row');
      else candidate = getBoard(level >= 3 ? 'meridian-spire' : 'meridian-row');
    }
    var out = copy(candidate);
    if (mode === 'endless') { out.tiles = 24 + Math.max(0, (whole(row, 1) - 1) * 4); out.name = 'Endless Row ' + whole(row, 1); out.subtitle = 'Expanding loop ' + whole(row, 1) + ' for score chasers'; out.pickups = []; out.shortcuts = []; for (var band = 3; band < out.tiles; band += 12) out.pickups.push(band); for (var cut = 9; cut < out.tiles; cut += 12) out.shortcuts.push(cut); }
    return out;
  }
  function defaultProfile() {
    return {v: SAVE_VERSION, boardsWon: 0, bestTurns: 0, level: 1, rushUnlocked: 0, rushMedals: [0, 0, 0], mainMedal: 0, endlessBest: 0, endlessRowBest: 0, albumMedal: 0, albumsCompleted: 0, stickers: new Array(24).fill(false)};
  }
  function validProfile(v) {
    return !!(v && typeof v === 'object' && v.v === SAVE_VERSION && Number.isInteger(v.boardsWon) && v.boardsWon >= 0 &&
      Number.isInteger(v.bestTurns) && v.bestTurns >= 0 && Number.isInteger(v.level) && v.level >= 1 && v.level <= 99 &&
      Number.isInteger(v.rushUnlocked) && v.rushUnlocked >= 0 && v.rushUnlocked <= 2 && Array.isArray(v.rushMedals) && v.rushMedals.length === 3 && v.rushMedals.every(function (n) { return Number.isInteger(n) && n >= 0 && n <= 3; }) &&
      Number.isInteger(v.mainMedal) && v.mainMedal >= 0 && v.mainMedal <= 3 && Number.isInteger(v.endlessBest) && v.endlessBest >= 0 &&
      Number.isInteger(v.endlessRowBest) && v.endlessRowBest >= 0 && Number.isInteger(v.albumMedal) && v.albumMedal >= 0 && v.albumMedal <= 3 &&
      Number.isInteger(v.albumsCompleted) && v.albumsCompleted >= 0 && v.albumsCompleted <= 4 && Array.isArray(v.stickers) && v.stickers.length === 24 && v.stickers.every(function (n) { return typeof n === 'boolean'; }));
  }

  var bootState = {mode: 'boot', board: 'boot', districts: [0, 0, 0, 0], albums: [false, false, false, false], turn: 0, rivals: [], forceMode: null, forceBoard: null};
  var hook = root.__mr && typeof root.__mr === 'object' ? root.__mr : {};
  if (!hook.state || typeof hook.state !== 'object') hook.state = bootState;
  if (!Object.prototype.hasOwnProperty.call(hook, 'forceMode')) hook.forceMode = null;
  if (!Object.prototype.hasOwnProperty.call(hook, 'forceBoard')) hook.forceBoard = null;
  root.__mr = hook;

  var Game = {phaser: null, play: null};
  var profile;
  var state = bootState;
  var keyEdges = Object.create(null);
  var kit = root.GGKit ? root.GGKit.create({
    slug: 'meridian-row', orientation: 'portrait', validateSave: validProfile,
    onPause: function () { keyEdges = Object.create(null); if (Game.play) { Game.play.pointerSeen.clear(); Game.play.pointerEdges.length = 0; Game.play.accumulator = 0; } },
    onResume: function () { keyEdges = Object.create(null); if (Game.play) { Game.play.pointerSeen.clear(); Game.play.pointerEdges.length = 0; } },
    onRestart: function () { if (Game.play) Game.play.restartCurrent(); }
  }) : null;
  if (kit) profile = kit.save.get(defaultProfile());
  if (!validProfile(profile)) profile = defaultProfile();
  if (kit) kit.audio.register({
    tap: 'assets/tap.mp3', roll: 'assets/dice_roll.mp3', coin: 'assets/coin_collect.mp3', sticker: 'assets/sticker_reveal.mp3',
    spire: 'assets/spire_fanfare.mp3', build: 'assets/build.mp3', block: 'assets/block.mp3', heist: 'assets/heist.mp3'
  });
  function persist() { if (kit) kit.save.set(profile); }
  function sfx(name, volume) { if (kit) kit.audio.sfx(name, {volume: volume == null ? 0.8 : volume}); }

  function routePoints(count, layout) {
    var n = Math.max(4, whole(count, 24));
    var grid = Math.max(3, Math.round(n / 4) + 1);
    var out = [];
    for (var i = 0; i < n; i++) {
      var phase = i / n * Math.PI * 2;
      var side = Math.floor(i / (n / 4));
      var f = (i % (n / 4)) / (n / 4);
      var x = 0, y = 0;
      if (layout === 'lantern') {
        x = 0.5 + Math.cos(phase) * (0.45 - 0.05 * Math.cos(phase * 4));
        y = 0.5 + Math.sin(phase) * (0.45 - 0.05 * Math.sin(phase * 3));
      } else if (layout === 'harbor') {
        var harbor = [{x: 0.08, y: 0.78}, {x: 0.26, y: 0.88}, {x: 0.49, y: 0.78}, {x: 0.72, y: 0.9}, {x: 0.92, y: 0.7}, {x: 0.8, y: 0.5}, {x: 0.94, y: 0.27}, {x: 0.68, y: 0.14}, {x: 0.45, y: 0.24}, {x: 0.22, y: 0.12}, {x: 0.06, y: 0.32}, {x: 0.18, y: 0.54}];
        var hp = harbor[i % harbor.length]; x = hp.x; y = hp.y;
      } else if (layout === 'spire') {
        var spine = [{x: 0.1, y: 0.8}, {x: 0.3, y: 0.94}, {x: 0.52, y: 0.78}, {x: 0.76, y: 0.93}, {x: 0.91, y: 0.7}, {x: 0.72, y: 0.55}, {x: 0.91, y: 0.31}, {x: 0.68, y: 0.09}, {x: 0.5, y: 0.28}, {x: 0.28, y: 0.08}, {x: 0.08, y: 0.32}, {x: 0.28, y: 0.54}];
        var sp = spine[Math.floor(i * spine.length / n) % spine.length]; x = sp.x + Math.sin(i * 2.1) * 0.018; y = sp.y + Math.cos(i * 1.7) * 0.018;
      } else if (layout === 'crown') {
        var crown = [{x: 0.08, y: 0.78}, {x: 0.16, y: 0.42}, {x: 0.3, y: 0.72}, {x: 0.42, y: 0.32}, {x: 0.52, y: 0.67}, {x: 0.65, y: 0.27}, {x: 0.78, y: 0.68}, {x: 0.92, y: 0.4}, {x: 0.84, y: 0.86}, {x: 0.6, y: 0.91}, {x: 0.37, y: 0.86}, {x: 0.18, y: 0.94}];
        var cp = crown[Math.floor(i * crown.length / n) % crown.length]; x = cp.x; y = cp.y;
      } else if (layout === 'endless') {
        x = 0.5 + Math.cos(phase) * 0.44; y = 0.5 + Math.sin(phase) * 0.38 + Math.sin(phase * 2) * 0.045;
      } else {
        if (side === 0) { x = f; y = 1; }
        else if (side === 1) { x = 1; y = 1 - f; }
        else if (side === 2) { x = 1 - f; y = 0; }
        else { x = 0; y = f; }
      }
      out.push({x: x, y: y, grid: grid});
    }
    return out;
  }
  function tileKind(index, board) {
    var n = board.tiles;
    if (index === 0) return {kind: 'gate', d: -1, hazard: false};
    var corners = [Math.round(n / 4), Math.round(n / 2), Math.round(n * 3 / 4)];
    if (corners.indexOf(index) >= 0) return {kind: 'corner', d: -1, hazard: false};
    var isLand = index % 2 === 1;
    var d = ((index - 1) / 2) % 4 | 0;
    var hazards = board.hazards && [5, 9, 13, 17, 21, 23].indexOf(index) >= 0;
    var pickup = Array.isArray(board.pickups) && board.pickups.indexOf(index) >= 0;
    var shortcut = Array.isArray(board.shortcuts) && board.shortcuts.indexOf(index) >= 0;
    return {kind: pickup ? 'pickup' : isLand ? 'land' : 'event', d: pickup ? -1 : isLand ? d : -1, hazard: !!(hazards && isLand), pickup: pickup, shortcut: shortcut, power: pickup ? POWER_NAMES[index % POWER_NAMES.length] : null};
  }
  function boardTiles(board) { var out = []; for (var i = 0; i < board.tiles; i++) out.push(tileKind(i, board)); return out; }
  function income(entity) {
    var total = 0;
    for (var i = 0; i < 4; i++) for (var t = 0; t < clamp(entity.districts[i], 0, 3); t++) total += TIER_INCOME[t] || TIER_INCOME[0];
    return total;
  }
  function tierTotal(entity) { var n = 0; for (var i = 0; i < 4; i++) n += clamp(entity.districts[i], 0, 3); return n; }
  function completedDistricts(entity) { var n = 0; for (var i = 0; i < 4; i++) if (entity.districts[i] >= 3) n++; return n; }
  function stickerCount(entity) { var n = 0; for (var i = 0; i < 24; i++) if (entity.stickers[i]) n++; return n; }
  function albumComplete(entity, album) { for (var i = album * 6; i < album * 6 + 6; i++) if (!entity.stickers[i]) return false; return true; }
  function makePlayer(id) {
    id = id == null ? 0 : id;
    var albums = [false, false, false, false]; var stickers = id === 0 ? profile.stickers.slice() : new Array(24).fill(false);
    for (var i = 0; i < 4; i++) albums[i] = albumComplete({stickers: stickers}, i);
    return {id: id, local: true, name: PLAYER_CONTROLS[id].name, color: TOKEN_COLORS[id], pos: 0, prevPos: 0, coins: 48, shields: 1, laps: 0, score: 0, trickMeter: 0, trickArmed: false, trickUsed: false, powerUp: null, shortcutCooldown: 0, districts: [0, 0, 0, 0], albums: albums, stickers: stickers, stickerCount: stickerCount({stickers: stickers}), control: PLAYER_CONTROLS[id]};
  }
  function makeRival(i, difficulty, mode) {
    var family = RIVAL_FAMILY[difficulty] || RIVAL_FAMILY[0];
    var spec = family[i - 1] || family[0];
    return {id: i, local: false, name: spec.name, color: spec.color, pos: 0, prevPos: 0, coins: 40 + difficulty * 5 + (mode === 'endless' ? 8 : 0), shields: 0, laps: 0, score: 0, trickMeter: 0, trickArmed: false, trickUsed: false, powerUp: null, shortcutCooldown: 0, districts: [0, 0, 0, 0], albums: [false, false, false, false], stickers: new Array(24).fill(false), buildFactor: spec.build, shieldChance: spec.shield, control: {name: 'AI', hint: 'AUTO'}};
  }
  function syncProbe() {
    if (!root.__mr) root.__mr = {};
    var out = state || bootState;
    out.forceMode = root.__mr.forceMode == null ? null : root.__mr.forceMode;
    out.forceBoard = root.__mr.forceBoard == null ? null : root.__mr.forceBoard;
    root.__mr.state = out;
  }

  function PlayScene() {
    Phaser.Scene.call(this, {key: 'meridian-row'});
    this.screen = 'menu'; this.menuChoice = 0; this.returnScreen = 'play'; this.accumulator = 0; this.visualTime = 0;
    this.pointerSeen = new Map(); this.pointerEdges = []; this.hitZones = []; this.pressPulse = {x: 0, y: 0, t: 0}; this.route = routePoints(24, 'row'); this.tiles = []; this.albumTab = 0;
    this.notice = null; this.coach = ''; this.coachTimer = 0; this.stickerQueue = 0; this.pendingAfterReveal = null; this.albumBeatNeeded = -1; this.albumFreeTier = 'Stall';
    this.lastForcedMode = null; this.lastForcedBoard = null; this.fx = []; this.pendingMode = null; this.pendingBoard = null; this.localCount = 1; this.gamepadAssignments = Object.create(null); this.gamepadButtons = Object.create(null); this.connectedPads = Object.create(null);
  }
  PlayScene.prototype = Object.create(Phaser.Scene.prototype);
  PlayScene.prototype.constructor = PlayScene;

  PlayScene.prototype.createTexture = function (key, width, height, draw) {
    var g = this.make.graphics({x: 0, y: 0, add: false});
    draw(g); g.generateTexture(key, width, height); g.destroy();
  };
  PlayScene.prototype.makeTextures = function () {
    var self = this;
    this.createTexture('mr-tile', 64, 64, function (g) {
      g.fillStyle(tint('#12243a'), 1); g.fillRoundedRect(1, 1, 62, 62, 10);
      g.lineStyle(2, tint('#31526d'), 0.85); g.strokeRoundedRect(1, 1, 62, 62, 10);
    });
    this.createTexture('mr-token', 64, 64, function (g) {
      g.fillStyle(tint('#eef7ff'), 1); g.fillCircle(32, 32, 24); g.lineStyle(3, tint('#07101c'), 0.9); g.strokeCircle(32, 32, 24);
    });
    for (var racer = 0; racer < 4; racer++) for (var frame = 0; frame < 3; frame++) this.makeRacerTexture(racer, frame);
    this.createTexture('mr-ring', 84, 84, function (g) { g.lineStyle(4, tint('#ffffff'), 0.9); g.strokeCircle(42, 42, 34); });
    this.createTexture('mr-pulse', 96, 96, function (g) { g.lineStyle(4, tint('#ffffff'), 0.95); g.strokeRoundedRect(6, 6, 84, 84, 16); });
    this.createTexture('mr-chrome', W, 84, function (g) {
      g.fillStyle(tint(C.panel), 0.98); g.fillRect(0, 0, W, 84); g.fillStyle(tint('#17304a'), 0.95); g.fillRect(0, 82, W, 2);
    });
    this.createTexture('mr-bottom', W, 380, function (g) {
      g.fillStyle(tint('#0a1423'), 0.98); g.fillRect(0, 0, W, 380); g.fillStyle(tint('#17304a'), 0.9); g.fillRect(0, 0, W, 2);
    });
    for (var i = 0; i < BOARD_CATALOG.length; i++) this.makeBoardTexture(BOARD_CATALOG[i]);
    this.makeBoardTexture({id: 'endless-28', tiles: 28, layout: 'endless', theme: C.mint, districts: BASE_DISTRICTS});
  };
  PlayScene.prototype.makeRacerTexture = function (racer, frame) {
    var key = 'mr-racer-' + racer + '-' + frame; if (this.textures.exists(key)) return;
    var color = TOKEN_COLORS[racer] || C.ink;
    this.createTexture(key, 72, 72, function (g) {
      var bob = frame === 1 ? -3 : frame === 2 ? -5 : 0;
      g.fillStyle(tint('#07101c'), 0.32); g.fillEllipse(36, 65, 34, 8);
      g.fillStyle(tint(color), 1); g.fillRoundedRect(18, 24 + bob, 36, 29, 13);
      g.fillStyle(tint('#f9fdff'), 1); g.fillCircle(29, 22 + bob, 10); g.fillCircle(43, 22 + bob, 10);
      g.fillStyle(tint('#07101c'), 1); g.fillCircle(31, 22 + bob, 3); g.fillCircle(41, 22 + bob, 3);
      g.lineStyle(3, tint(color), 1); g.lineBetween(24, 53 + bob, frame === 1 ? 15 : 20, 64 + bob); g.lineBetween(48, 53 + bob, frame === 1 ? 57 : 52, 64 + bob);
      g.lineStyle(4, tint('#eef7ff'), 0.9); g.lineBetween(19, 35 + bob, 8 + racer * 2, 29 + bob); g.lineBetween(53, 35 + bob, 64 - racer * 2, 29 + bob);
      if (racer === 1) { g.fillStyle(tint(C.gold), 1); g.fillCircle(36, 12 + bob, 5); }
      if (racer === 2) { g.lineStyle(3, tint(C.violet), 1); g.strokeCircle(36, 38 + bob, 15); }
      if (racer === 3) { g.fillStyle(tint(C.mint), 1); g.fillRect(29, 7 + bob, 14, 5); }
      if (frame === 2) { g.lineStyle(4, tint(C.gold), 1); g.lineBetween(13, 13, 4, 4); g.lineBetween(59, 13, 68, 4); }
    });
  };
  PlayScene.prototype.makeBoardTexture = function (board) {
    var key = 'mr-board-' + board.id + '-' + board.tiles;
    if (this.textures.exists(key)) return key;
    var points = routePoints(board.tiles, board.layout || 'row'); var size = 354; var grid = points[0] ? points[0].grid : 7; var tile = size / grid; var self = this;
    this.createTexture(key, size, size, function (g) {
      g.fillStyle(tint('#091725'), 1); g.fillRoundedRect(0, 0, size, size, 18);
      g.lineStyle(3, tint(board.theme || C.cyan), 0.35); g.strokeRoundedRect(2, 2, size - 4, size - 4, 18);
      g.fillStyle(tint('#0d1c2c'), 1); g.fillRoundedRect(tile + 5, tile + 5, size - 2 * tile - 10, size - 2 * tile - 10, 14);
      g.lineStyle(2, tint('#25425c'), 0.8); g.strokeRoundedRect(tile + 5, tile + 5, size - 2 * tile - 10, size - 2 * tile - 10, 14);
      for (var i = 0; i < points.length; i++) {
        var x = points[i].x * size, y = points[i].y * size, pad = Math.max(2, tile * 0.04);
        g.fillStyle(tint(i === 0 ? '#2e2d20' : '#101f32'), 1); g.fillRoundedRect(x - tile / 2 + pad, y - tile / 2 + pad, tile - pad * 2, tile - pad * 2, Math.min(10, tile * 0.14));
        g.lineStyle(Math.max(1, tile * 0.035), tint('#33556c'), 0.8); g.strokeRoundedRect(x - tile / 2 + pad, y - tile / 2 + pad, tile - pad * 2, tile - pad * 2, Math.min(10, tile * 0.14));
      }
      g.lineStyle(2, tint(board.theme || C.cyan), 0.16); g.strokeRoundedRect(9, 9, size - 18, size - 18, 22);
    });
    return key;
  };
  PlayScene.prototype.create = function () {
    Game.play = this;
    this.installInputBridges();
    this.makeTextures();
    this.background = this.add.rectangle(0, 0, W, H, tint(C.deep), 1).setOrigin(0).setDepth(0);
    this.chrome = this.add.image(W / 2, 42, 'mr-chrome').setDepth(1);
    this.bottomChrome = this.add.image(W / 2, 654, 'mr-bottom').setDepth(1);
    this.boardImage = this.add.image(195, 281, 'mr-board-meridian-row-24').setDepth(2);
    this.buildDisplayPool();
    if (kit) { kit.loader.progress(1); kit.loader.hide(); kit.registerPWA(); }
    var forcedMode = root.__mr && root.__mr.forceMode != null ? normalizeMode(root.__mr.forceMode) : null;
    if (forcedMode) this.startMode(forcedMode, root.__mr.forceBoard);
    else this.showMenu();
    this.render();
  };
  PlayScene.prototype.installInputBridges = function () {
    var self = this;
    this.pointerEdgeHandler = function (event) { if (kit && kit.paused) return; self.pointerEdges.push({id: event.pointerId, x: event.clientX, y: event.clientY}); if (self.pointerEdges.length > 24) self.pointerEdges.shift(); };
    root.addEventListener('pointerdown', this.pointerEdgeHandler, {passive: true});
    this.gamepadConnectedHandler = function (event) { var pad = event.gamepad; if (!pad) return; self.connectedPads[pad.index] = true; if (self.gamepadAssignments[pad.index] == null) { var slot = self.nextFreeLocalSlot(); self.gamepadAssignments[pad.index] = slot; if (self.screen === 'lobby' && slot >= 0) { self.localCount = Math.max(self.localCount, slot + 1); self.render(); } } };
    this.gamepadDisconnectedHandler = function (event) { if (!event.gamepad) return; delete self.connectedPads[event.gamepad.index]; delete self.gamepadAssignments[event.gamepad.index]; delete self.gamepadButtons[event.gamepad.index]; self.showChip('CONTROLLER DISCONNECTED  KEYBOARD READY', C.orange, 1.2); };
    root.addEventListener('gamepadconnected', this.gamepadConnectedHandler);
    root.addEventListener('gamepaddisconnected', this.gamepadDisconnectedHandler);
  };
  PlayScene.prototype.nextFreeLocalSlot = function () {
    var used = Object.create(null), key; for (key in this.gamepadAssignments) if (this.gamepadAssignments[key] != null) used[this.gamepadAssignments[key]] = true;
    for (var i = 0; i < 4; i++) if (!used[i]) return i;
    return -1;
  };
  PlayScene.prototype.buildDisplayPool = function () {
    var i, d, t;
    this.ui = {};
    this.ui.title = this.add.text(14, 12, '', {fontFamily: FONT, fontSize: '20px', fontStyle: '900', color: C.ink}).setDepth(12);
    this.ui.titleAccent = this.add.text(14, 35, '', {fontFamily: FONT, fontSize: '14px', fontStyle: '800', color: C.cyan}).setDepth(12);
    this.ui.boardName = this.add.text(376, 14, '', {fontFamily: FONT, fontSize: '14px', fontStyle: '800', color: C.muted, align: 'right'}).setOrigin(1, 0).setDepth(12);
    this.ui.boardSub = this.add.text(376, 35, '', {fontFamily: FONT, fontSize: '14px', fontStyle: '700', color: C.slate, align: 'right'}).setOrigin(1, 0).setDepth(12);
    this.ui.coin = this.add.text(18, 57, '', {fontFamily: FONT, fontSize: '16px', fontStyle: '800', color: C.gold}).setDepth(12);
    this.ui.shield = this.add.text(82, 57, '', {fontFamily: FONT, fontSize: '16px', fontStyle: '800', color: C.cyan}).setDepth(12);
    this.ui.turn = this.add.text(151, 57, '', {fontFamily: FONT, fontSize: '14px', fontStyle: '800', color: C.muted}).setDepth(12);
    this.ui.albumPill = this.add.text(374, 57, '', {fontFamily: FONT, fontSize: '14px', fontStyle: '800', color: C.violet, align: 'right'}).setOrigin(1, 0).setDepth(12);
    this.ui.centerTitle = this.add.text(195, 173, '', {fontFamily: FONT, fontSize: '14px', fontStyle: '900', color: C.muted, align: 'center'}).setOrigin(0.5).setDepth(9);
    this.ui.centerIncome = this.add.text(195, 397, '', {fontFamily: FONT, fontSize: '14px', fontStyle: '800', color: C.gold, align: 'center'}).setOrigin(0.5).setDepth(9);
    this.ui.districtNames = []; this.ui.districtValues = []; this.ui.districtBars = [];
    for (d = 0; d < 4; d++) {
      this.ui.districtNames[d] = this.add.text(108, 204 + d * 36, '', {fontFamily: FONT, fontSize: '14px', fontStyle: '800', color: C.ink}).setDepth(9);
      this.ui.districtValues[d] = this.add.text(282, 204 + d * 36, '', {fontFamily: FONT, fontSize: '14px', fontStyle: '900', color: C.muted, align: 'right'}).setOrigin(1, 0).setDepth(9);
      this.ui.districtBars[d] = [];
      for (t = 0; t < 3; t++) this.ui.districtBars[d][t] = this.add.rectangle(199 + t * 25, 222 + d * 36, 19, 6, tint('#21374e'), 1).setOrigin(0.5).setDepth(9);
    }
    this.ui.dieBack = [this.add.image(177, 347, 'mr-tile').setDepth(9), this.add.image(213, 347, 'mr-tile').setDepth(9)];
    this.ui.dieValue = [this.add.text(177, 347, '1', {fontFamily: FONT, fontSize: '22px', fontStyle: '900', color: C.deep, align: 'center'}).setOrigin(0.5).setDepth(10), this.add.text(213, 347, '1', {fontFamily: FONT, fontSize: '22px', fontStyle: '900', color: C.deep, align: 'center'}).setOrigin(0.5).setDepth(10)];
    this.ui.dieTotal = this.add.text(195, 378, '', {fontFamily: FONT, fontSize: '14px', fontStyle: '900', color: C.ink, align: 'center'}).setOrigin(0.5).setDepth(10);
    this.ui.tiles = []; this.ensureTilePool(INITIAL_TILES);
    this.ui.pressPulse = this.add.image(0, 0, 'mr-pulse').setDepth(60).setVisible(false); this.ui.fxLabels = [];
    for (i = 0; i < 8; i++) this.ui.fxLabels[i] = this.add.text(0, 0, '', {fontFamily: FONT, fontSize: '14px', fontStyle: '900', color: C.ink, align: 'center'}).setOrigin(0.5).setDepth(61);
    this.ui.landRing = this.add.image(0, 0, 'mr-pulse').setDepth(8).setVisible(false);
    this.ui.tokens = []; this.ui.tokenRings = [];
    for (i = 0; i < 4; i++) {
      this.ui.tokenRings[i] = this.add.image(0, 0, 'mr-ring').setDepth(10).setVisible(false);
      this.ui.tokens[i] = {image: this.add.image(0, 0, 'mr-racer-' + i + '-0').setDepth(11), label: this.add.text(0, 0, 'P' + (i + 1), {fontFamily: FONT, fontSize: '11px', fontStyle: '900', color: C.deep, align: 'center'}).setOrigin(0.5).setDepth(12)};
    }
    this.ui.cards = []; this.ui.cardNames = []; this.ui.cardCoins = []; this.ui.cardBuild = []; this.ui.cardShields = []; this.ui.cardStatus = [];
    for (i = 0; i < 4; i++) {
      this.ui.cards[i] = this.add.rectangle(8 + i * 94, 474, 88, 78, tint('#102239'), 1).setOrigin(0).setDepth(7);
      this.ui.cardNames[i] = this.add.text(14 + i * 94, 482, '', {fontFamily: FONT, fontSize: '14px', fontStyle: '900', color: C.ink}).setDepth(8);
      this.ui.cardCoins[i] = this.add.text(14 + i * 94, 504, '', {fontFamily: FONT, fontSize: '16px', fontStyle: '900', color: C.gold}).setDepth(8);
      this.ui.cardShields[i] = this.add.text(74 + i * 94, 505, '', {fontFamily: FONT, fontSize: '14px', fontStyle: '900', color: C.cyan, align: 'right'}).setOrigin(1, 0).setDepth(8);
      this.ui.cardStatus[i] = this.add.text(14 + i * 94, 522, '', {fontFamily: FONT, fontSize: '10px', fontStyle: '800', color: C.muted, wordWrap: {width: 78}}).setDepth(8);
      this.ui.cardBuild[i] = []; for (d = 0; d < 4; d++) this.ui.cardBuild[i][d] = this.add.rectangle(14 + i * 94 + d * 17, 536, 14, 7, tint('#223b54'), 1).setOrigin(0).setDepth(8);
    }
    this.ui.roll = this.add.rectangle(18, 660, 228, 144, tint('#153b58'), 1).setOrigin(0).setDepth(8); this.ui.rollLabel = this.add.text(132, 710, 'ROLL', {fontFamily: FONT, fontSize: '36px', fontStyle: '900', color: C.ink, align: 'center'}).setOrigin(0.5).setDepth(9); this.ui.rollMeta = this.add.text(132, 758, 'SPACE', {fontFamily: FONT, fontSize: '14px', fontStyle: '800', color: C.cyan, align: 'center'}).setOrigin(0.5).setDepth(9);
    this.ui.albumButton = this.add.rectangle(258, 660, 114, 66, tint('#2c2049'), 1).setOrigin(0).setDepth(8); this.ui.albumButtonText = this.add.text(315, 686, 'ALBUMS', {fontFamily: FONT, fontSize: '14px', fontStyle: '900', color: C.violet, align: 'center'}).setOrigin(0.5).setDepth(9);
    this.ui.restartButton = this.add.rectangle(258, 738, 114, 66, tint('#173047'), 1).setOrigin(0).setDepth(8); this.ui.restartText = this.add.text(315, 764, 'RESTART', {fontFamily: FONT, fontSize: '14px', fontStyle: '900', color: C.muted, align: 'center'}).setOrigin(0.5).setDepth(9);
    this.ui.actionTitle = this.add.text(195, 577, '', {fontFamily: FONT, fontSize: '15px', fontStyle: '900', color: C.ink, align: 'center'}).setOrigin(0.5).setDepth(9);
    this.ui.actionNote = this.add.text(195, 598, '', {fontFamily: FONT, fontSize: '14px', fontStyle: '700', color: C.muted, align: 'center'}).setOrigin(0.5).setDepth(9);
    this.ui.choices = []; this.ui.choiceTitles = []; this.ui.choiceSubs = []; this.ui.choiceNums = [];
    for (i = 0; i < 3; i++) {
      this.ui.choices[i] = this.add.rectangle(18, 616 + i * 62, 354, 56, tint('#13283e'), 1).setOrigin(0).setDepth(8);
      this.ui.choiceNums[i] = this.add.text(31, 632 + i * 62, String(i + 1), {fontFamily: FONT, fontSize: '16px', fontStyle: '900', color: C.cyan}).setOrigin(0.5).setDepth(9);
      this.ui.choiceTitles[i] = this.add.text(50, 625 + i * 62, '', {fontFamily: FONT, fontSize: '14px', fontStyle: '900', color: C.ink}).setDepth(9);
      this.ui.choiceSubs[i] = this.add.text(50, 647 + i * 62, '', {fontFamily: FONT, fontSize: '14px', fontStyle: '700', color: C.muted}).setDepth(9);
    }
    this.ui.notice = this.add.rectangle(226, 92, 150, 34, tint('#172a3f'), 0.96).setOrigin(0).setDepth(20); this.ui.noticeText = this.add.text(236, 102, '', {fontFamily: FONT, fontSize: '14px', fontStyle: '900', color: C.ink}).setDepth(21);
    this.ui.sticker = this.add.rectangle(226, 92, 150, 76, tint('#1f173b'), 0.98).setOrigin(0).setDepth(22); this.ui.stickerArt = this.add.text(247, 130, '◆', {fontFamily: FONT, fontSize: '31px', fontStyle: '900', color: C.violet, align: 'center'}).setOrigin(0.5).setDepth(23); this.ui.stickerText = this.add.text(270, 105, '', {fontFamily: FONT, fontSize: '14px', fontStyle: '900', color: C.ink, wordWrap: {width: 96}}).setDepth(23); this.ui.stickerOdds = this.add.text(270, 145, '1/24  |  4.2% each', {fontFamily: FONT, fontSize: '14px', fontStyle: '800', color: C.violet}).setDepth(23);
    this.ui.coach = this.add.text(18, 91, '', {fontFamily: FONT, fontSize: '14px', fontStyle: '700', color: C.muted, alpha: 0.94, wordWrap: {width: 200}}).setDepth(19);
    this.ui.menuTitle = this.add.text(195, 126, 'MERIDIAN', {fontFamily: FONT, fontSize: '38px', fontStyle: '900', color: C.ink, align: 'center'}).setOrigin(0.5).setDepth(30); this.ui.menuAccent = this.add.text(195, 166, 'ROW', {fontFamily: FONT, fontSize: '30px', fontStyle: '900', color: C.cyan, align: 'center'}).setOrigin(0.5).setDepth(30); this.ui.menuTag = this.add.text(195, 213, 'A town-board race about good rolls and generous drops.', {fontFamily: FONT, fontSize: '14px', fontStyle: '700', color: C.muted, align: 'center', wordWrap: {width: 340}}).setOrigin(0.5).setDepth(30);
    this.ui.menuCards = []; this.ui.menuLabels = []; this.ui.menuMeta = []; this.ui.menuStatus = [];
    for (i = 0; i < 3; i++) { this.ui.menuCards[i] = this.add.rectangle(22, 288 + i * 94, 346, 76, tint('#11253a'), 1).setOrigin(0).setDepth(30); this.ui.menuLabels[i] = this.add.text(43, 306 + i * 94, '', {fontFamily: FONT, fontSize: '18px', fontStyle: '900', color: C.ink}).setDepth(31); this.ui.menuMeta[i] = this.add.text(43, 333 + i * 94, '', {fontFamily: FONT, fontSize: '14px', fontStyle: '700', color: C.muted}).setDepth(31); this.ui.menuStatus[i] = this.add.text(350, 316 + i * 94, '', {fontFamily: FONT, fontSize: '14px', fontStyle: '900', color: C.cyan, align: 'right'}).setOrigin(1, 0).setDepth(31); }
    this.ui.menuFoot = this.add.text(195, 684, 'TAP A ROW  |  SPACE STARTS  |  A OPENS ALBUMS', {fontFamily: FONT, fontSize: '14px', fontStyle: '800', color: C.slate, align: 'center'}).setOrigin(0.5).setDepth(30); this.ui.menuNote = this.add.text(195, 723, 'No energy. No timers. No purchases.', {fontFamily: FONT, fontSize: '14px', fontStyle: '700', color: C.muted, align: 'center'}).setOrigin(0.5).setDepth(30);
    this.ui.lobbyTitle = this.add.text(195, 116, 'LOCAL ROW LOBBY', {fontFamily: FONT, fontSize: '28px', fontStyle: '900', color: C.ink, align: 'center'}).setOrigin(0.5).setDepth(30);
    this.ui.lobbyMeta = this.add.text(195, 156, '', {fontFamily: FONT, fontSize: '14px', fontStyle: '800', color: C.violet, align: 'center', wordWrap: {width: 350}}).setOrigin(0.5).setDepth(30);
    this.ui.lobbySlots = []; this.ui.lobbySlotText = [];
    for (i = 0; i < 4; i++) { this.ui.lobbySlots[i] = this.add.rectangle(22, 198 + i * 66, 346, 54, tint('#11253a'), 1).setOrigin(0).setDepth(30); this.ui.lobbySlotText[i] = this.add.text(42, 214 + i * 66, '', {fontFamily: FONT, fontSize: '14px', fontStyle: '900', color: C.ink, wordWrap: {width: 310}}).setDepth(31); }
    this.ui.lobbyHint = this.add.text(195, 488, 'Tap a slot to choose the player count. Controllers join automatically.', {fontFamily: FONT, fontSize: '13px', fontStyle: '700', color: C.muted, align: 'center', wordWrap: {width: 346}}).setOrigin(0.5).setDepth(30);
    this.ui.lobbyStart = this.add.rectangle(44, 550, 302, 62, tint('#174b4b'), 1).setOrigin(0).setDepth(30); this.ui.lobbyStartText = this.add.text(195, 581, 'READY  |  START ROW', {fontFamily: FONT, fontSize: '17px', fontStyle: '900', color: C.mint, align: 'center'}).setOrigin(0.5).setDepth(31);
    this.ui.lobbyBack = this.add.rectangle(44, 630, 302, 48, tint('#173047'), 1).setOrigin(0).setDepth(30); this.ui.lobbyBackText = this.add.text(195, 654, 'BACK TO MODES', {fontFamily: FONT, fontSize: '14px', fontStyle: '900', color: C.muted, align: 'center'}).setOrigin(0.5).setDepth(31);
    this.ui.shade = this.add.rectangle(0, 0, W, H, tint(C.deep), 0.64).setOrigin(0).setDepth(40);
    this.ui.boundary = this.add.rectangle(30, 286, 330, 166, tint('#10243a'), 0.98).setOrigin(0).setDepth(41); this.ui.boundaryTitle = this.add.text(195, 326, '', {fontFamily: FONT, fontSize: '28px', fontStyle: '900', color: C.gold, align: 'center', wordWrap: {width: 290}}).setOrigin(0.5).setDepth(42); this.ui.boundaryText = this.add.text(195, 390, '', {fontFamily: FONT, fontSize: '15px', fontStyle: '800', color: C.ink, align: 'center', wordWrap: {width: 292}}).setOrigin(0.5).setDepth(42);
    this.ui.resultPanel = this.add.rectangle(20, 226, 350, 388, tint('#0d1c2e'), 0.99).setOrigin(0).setDepth(40); this.ui.resultTitle = this.add.text(195, 266, '', {fontFamily: FONT, fontSize: '29px', fontStyle: '900', color: C.mint, align: 'center', wordWrap: {width: 310}}).setOrigin(0.5).setDepth(42); this.ui.resultText = this.add.text(195, 328, '', {fontFamily: FONT, fontSize: '15px', fontStyle: '700', color: C.ink, align: 'center', wordWrap: {width: 300}}).setOrigin(0.5).setDepth(42); this.ui.resultMedal = this.add.text(195, 424, '', {fontFamily: FONT, fontSize: '21px', fontStyle: '900', color: C.gold, align: 'center', wordWrap: {width: 310}}).setOrigin(0.5).setDepth(42); this.ui.resultAlbums = this.add.text(195, 474, '', {fontFamily: FONT, fontSize: '14px', fontStyle: '800', color: C.violet, align: 'center'}).setOrigin(0.5).setDepth(42);
    this.ui.resultNext = this.add.rectangle(44, 518, 302, 54, tint('#154b4a'), 1).setOrigin(0).setDepth(41); this.ui.resultNextText = this.add.text(195, 545, '', {fontFamily: FONT, fontSize: '16px', fontStyle: '900', color: C.mint, align: 'center'}).setOrigin(0.5).setDepth(42); this.ui.resultBack = this.add.rectangle(44, 584, 302, 46, tint('#173047'), 1).setOrigin(0).setDepth(41); this.ui.resultBackText = this.add.text(195, 607, 'LOBBY', {fontFamily: FONT, fontSize: '14px', fontStyle: '900', color: C.muted, align: 'center'}).setOrigin(0.5).setDepth(42);
    this.ui.albumShade = this.add.rectangle(0, 0, W, H, tint('#07101c'), 0.99).setOrigin(0).setDepth(50); this.ui.albumTitle = this.add.text(195, 38, 'STICKER ALBUMS', {fontFamily: FONT, fontSize: '24px', fontStyle: '900', color: C.ink, align: 'center'}).setOrigin(0.5).setDepth(51); this.ui.albumOdds = this.add.text(195, 70, 'Every draw is 1 of 24, equal 4.2% each.', {fontFamily: FONT, fontSize: '14px', fontStyle: '800', color: C.violet, align: 'center'}).setOrigin(0.5).setDepth(51);
    this.ui.albumTabs = []; this.ui.albumTabText = [];
    for (i = 0; i < 4; i++) { this.ui.albumTabs[i] = this.add.rectangle(10 + i * 94, 96, 86, 42, tint('#162a40'), 1).setOrigin(0).setDepth(51); this.ui.albumTabText[i] = this.add.text(53 + i * 94, 117, '', {fontFamily: FONT, fontSize: '14px', fontStyle: '900', color: C.muted, align: 'center'}).setOrigin(0.5).setDepth(52); }
    this.ui.albumCells = []; this.ui.albumCellArt = []; this.ui.albumCellText = [];
    for (i = 0; i < 6; i++) for (d = 0; d < 1; d++) { var cx = 18 + (i % 3) * 122; var cy = 160 + Math.floor(i / 3) * 152; this.ui.albumCells.push(this.add.rectangle(cx, cy, 104, 136, tint('#101f32'), 1).setOrigin(0).setDepth(51)); this.ui.albumCellArt.push(this.add.text(cx + 52, cy + 53, '◆', {fontFamily: FONT, fontSize: '39px', fontStyle: '900', color: C.slate, align: 'center'}).setOrigin(0.5).setDepth(52)); this.ui.albumCellText.push(this.add.text(cx + 52, cy + 112, '', {fontFamily: FONT, fontSize: '14px', fontStyle: '800', color: C.muted, align: 'center', wordWrap: {width: 92}}).setOrigin(0.5).setDepth(52)); }
    this.ui.albumCollected = this.add.text(195, 632, '', {fontFamily: FONT, fontSize: '16px', fontStyle: '900', color: C.ink, align: 'center'}).setOrigin(0.5).setDepth(52); this.ui.albumClose = this.add.rectangle(45, 730, 300, 58, tint('#173047'), 1).setOrigin(0).setDepth(51); this.ui.albumCloseText = this.add.text(195, 759, 'CLOSE  |  ESC', {fontFamily: FONT, fontSize: '16px', fontStyle: '900', color: C.ink, align: 'center'}).setOrigin(0.5).setDepth(52);
    this.setAllVisible(false);
  };
  PlayScene.prototype.ensureTilePool = function (count) {
    var target = Math.max(0, whole(count, 0));
    while (this.ui.tiles.length < target) {
      var index = this.ui.tiles.length;
      var tileView = {image: this.add.image(0, 0, 'mr-tile').setDepth(4), accent: this.add.rectangle(0, 0, 20, 5, tint(C.cyan), 1).setOrigin(0.5).setDepth(5), icon: this.add.text(0, 0, '', {fontFamily: FONT, fontSize: '18px', fontStyle: '900', color: C.ink, align: 'center'}).setOrigin(0.5).setDepth(6), label: this.add.text(0, 0, '', {fontFamily: FONT, fontSize: '10px', fontStyle: '900', color: C.muted, align: 'center'}).setOrigin(0.5).setDepth(6), hazard: this.add.text(0, 0, '!', {fontFamily: FONT, fontSize: '15px', fontStyle: '900', color: C.red, align: 'center'}).setOrigin(0.5).setDepth(7), bars: []};
      for (var t = 0; t < 3; t++) tileView.bars[t] = this.add.rectangle(0, 0, 9, 3, tint('#2a4158'), 1).setOrigin(0.5).setDepth(6);
      this.ui.tiles[index] = tileView;
    }
  };
  PlayScene.prototype.setAllVisible = function (value) {
    var key, i, d, t;
    for (key in this.ui) {
      if (!Object.prototype.hasOwnProperty.call(this.ui, key)) continue;
      var v = this.ui[key];
      if (Array.isArray(v)) for (i = 0; i < v.length; i++) { if (Array.isArray(v[i])) for (d = 0; d < v[i].length; d++) visible(v[i][d], value); else if (v[i] && v[i].image && v[i].accent) { visible(v[i].image, value); visible(v[i].accent, value); visible(v[i].icon, value); visible(v[i].label, value); visible(v[i].hazard, value); for (t = 0; t < v[i].bars.length; t++) visible(v[i].bars[t], value); } else if (v[i] && v[i].image) { visible(v[i].image, value); visible(v[i].label, value); } else visible(v[i], value); }
      else visible(v, value);
    }
    visible(this.chrome, value); visible(this.bottomChrome, value); visible(this.boardImage, value);
  };
  PlayScene.prototype.showMenu = function () {
    this.screen = 'menu'; this.menuChoice = clamp(this.menuChoice, 0, 2); state = bootState; state.mode = 'menu'; state.board = 'menu'; syncProbe(); this.notice = null; this.coachTimer = 0; this.setAllVisible(false); this.render();
  };
  PlayScene.prototype.openLobby = function (mode, forcedBoard) {
    this.pendingMode = normalizeMode(mode); this.pendingBoard = forcedBoard == null ? null : forcedBoard; this.localCount = clamp(this.localCount || 1, 1, 4); this.screen = 'lobby'; this.pointerSeen.clear(); this.notice = null; this.setAllVisible(false); this.render();
  };
  PlayScene.prototype.leaveLobby = function () { this.pendingMode = null; this.pendingBoard = null; this.showMenu(); };
  PlayScene.prototype.launchLobby = function () { if (!this.pendingMode) return; this.startMode(this.pendingMode, this.pendingBoard, this.localCount); };
  PlayScene.prototype.startMode = function (mode, forcedBoard, localCount) {
    mode = normalizeMode(mode); var level = profile.level; var row = mode === 'endless' ? Math.max(1, profile.endlessRowBest + 1) : 1; var selectedBoard = forcedBoard; if (mode === 'rush' && selectedBoard == null) selectedBoard = profile.rushUnlocked; var board = boardFor(mode, selectedBoard, level, row); var difficulty = mode === 'main' ? clamp(1 + Math.floor((level - 1) / 2), 0, 3) : mode === 'rush' ? clamp(1 + (RUSH_BOARDS.indexOf(board.id) | 0), 0, 3) : clamp(1 + Math.floor((row - 1) / 2), 0, 3);
    var count = clamp(whole(localCount, this.localCount || 1), 1, 4); this.localCount = count; var players = [], i, p;
    for (i = 0; i < 4; i++) { p = i < count ? makePlayer(i) : makeRival(i, difficulty, mode); if (mode === 'rush' && p.local) p.coins = 62; if (mode === 'endless' && p.local) p.coins = 58 + row * 4; players.push(p); }
    state = {mode: mode, screen: 'play', board: board.id, boardName: board.name, boardData: board, boardIndex: mode === 'rush' ? Math.max(0, RUSH_BOARDS.indexOf(board.id)) : 0, row: row, difficulty: difficulty, difficultyName: ['PRACTICE', 'STEADY', 'TOUGH', 'HOT ROW'][difficulty] || 'STEADY', phase: 'idle', player: players[0], players: players, localCount: count, districts: players[0].districts, albums: players[0].albums, rivals: players.filter(function (entity) { return !entity.local; }), corners: {}, pickups: {}, current: 0, turn: 1, dice: [1, 1], moveRemaining: 0, moveAnim: 0, moveFrom: 0, landPos: -1, landPulse: 0, rollTimer: 0, landTimer: 0, waitTimer: 0, choices: null, choiceTitle: '', choiceNote: '', choiceFocus: 0, eventKind: '', sticker: null, stickerEntity: null, stickerTimer: 0, result: null, goalLaps: mode === 'rush' ? 2 : mode === 'endless' ? 3 : 3, raceRank: [0, 1, 2, 3]};
    this.tiles = boardTiles(board); for (i = 0; i < this.tiles.length; i++) if (this.tiles[i].pickup) state.pickups[i] = true; this.ensureTilePool(board.tiles); this.route = routePoints(board.tiles, board.layout); var key = this.makeBoardTexture(board); this.boardImage.setTexture(key).setDisplaySize(354, 354); this.screen = 'play'; this.returnScreen = 'play'; this.notice = null; this.coach = 'Roll, then press your trick key during the moving beat for a generous +1 step.'; this.coachTimer = REDUCED ? 2 : 4; this.pointerSeen.clear(); this.pointerEdges.length = 0; this.accumulator = 0; this.visualTime = 0; this.stickerQueue = 0; this.pendingAfterReveal = null; this.albumBeatNeeded = -1; this.albumFreeTier = 'Stall'; this.lastForcedMode = root.__mr ? normalizeMode(root.__mr.forceMode) : null; this.lastForcedBoard = root.__mr ? root.__mr.forceBoard : null; sfx('tap', 0.5); syncProbe(); this.render();
  };
  PlayScene.prototype.restartCurrent = function () { if (this.screen === 'play' || this.screen === 'album' || this.screen === 'result') this.startMode(state.mode, state.mode === 'rush' ? state.boardIndex : state.board); };
  PlayScene.prototype.openAlbum = function () { if (this.screen !== 'play' && this.screen !== 'result') return; this.returnScreen = this.screen; this.screen = 'album'; this.pointerSeen.clear(); this.render(); };
  PlayScene.prototype.closeAlbum = function () { if (this.screen !== 'album') return; this.screen = this.returnScreen || 'play'; this.pointerSeen.clear(); this.render(); };
  PlayScene.prototype.showChip = function (text, colorValue, seconds) { this.notice = {text: String(text), color: colorValue || C.ink, timer: seconds == null ? 0.9 : seconds}; };
  PlayScene.prototype.showCoach = function (text, seconds) { this.coach = String(text); this.coachTimer = seconds == null ? (REDUCED ? 2 : 4) : seconds; };
  PlayScene.prototype.addFx = function (text, colorValue, entity) { var item = {text: String(text), color: colorValue || C.ink, id: entity ? entity.id : 0, timer: REDUCED ? 0.36 : 0.9, life: REDUCED ? 0.36 : 0.9}; if (kit && root.GGKit && root.GGKit.boundedPush) root.GGKit.boundedPush(this.fx, item, 8); else { this.fx.push(item); if (this.fx.length > 8) this.fx.shift(); } };
  PlayScene.prototype.zone = function (x, y, w, h, fn) { this.hitZones.push({x: x, y: y, w: w, h: h, fn: fn}); };
  PlayScene.prototype.tapAt = function (x, y) { for (var i = this.hitZones.length - 1; i >= 0; i--) { var z = this.hitZones[i]; if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) { this.pressPulse = {x: x, y: y, t: REDUCED ? 0.06 : 0.12}; if (z.fn) z.fn(); return; } } };
  PlayScene.prototype.gamePoint = function (p) { var rect = this.game.canvas.getBoundingClientRect(); return {x: (p.x - rect.left) / Math.max(1, rect.width) * W, y: (p.y - rect.top) / Math.max(1, rect.height) * H}; };
  PlayScene.prototype.readInput = function () {
    if (!kit) return;
    var self = this, edge; while (this.pointerEdges.length) { edge = this.pointerEdges.shift(); if (!this.pointerSeen.has(edge.id)) { this.pointerSeen.set(edge.id, true); var edgePoint = this.gamePoint(edge); this.tapAt(edgePoint.x, edgePoint.y); } }
    kit.input.pointers.forEach(function (p, id) { if (!self.pointerSeen.has(id)) { self.pointerSeen.set(id, true); var point = self.gamePoint(p); self.tapAt(point.x, point.y); } });
    this.pointerSeen.forEach(function (v, id) { if (!kit.input.pointers.has(id)) self.pointerSeen.delete(id); });
    this.pollGamepads();
    var codes = ['Space', 'Enter', 'Escape', 'KeyA', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'ShiftLeft', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Digit1', 'Digit2', 'Digit3', 'Digit4'];
    for (var i = 0; i < codes.length; i++) { var code = codes[i], down = kit.input.keyDown(code), edge = down && !keyEdges[code]; keyEdges[code] = down; if (edge) this.keyAction(code); }
  };
  PlayScene.prototype.pollGamepads = function () {
    if (!root.navigator || typeof root.navigator.getGamepads !== 'function') return;
    var pads = root.navigator.getGamepads() || [], self = this;
    for (var i = 0; i < pads.length; i++) { var pad = pads[i]; if (!pad || !pad.connected) continue; if (this.gamepadAssignments[pad.index] == null) { var slot = this.nextFreeLocalSlot(); if (slot >= 0) this.gamepadAssignments[pad.index] = slot; }
      var previous = this.gamepadButtons[pad.index] || {a: false, b: false}; var a = !!(pad.buttons[0] && pad.buttons[0].pressed) || !!(pad.buttons[9] && pad.buttons[9].pressed); var b = !!(pad.buttons[1] && pad.buttons[1].pressed); this.gamepadButtons[pad.index] = {a: a, b: b};
      var slotId = this.gamepadAssignments[pad.index]; if (slotId == null) continue; if (this.screen === 'lobby' && a && !previous.a) { this.localCount = Math.max(this.localCount, slotId + 1); this.render(); continue; }
      if (a && !previous.a) this.deviceAction(slotId, 'roll'); if (b && !previous.b) this.deviceAction(slotId, 'trick');
    }
  };
  PlayScene.prototype.deviceAction = function (playerId, action) {
    if (this.screen === 'menu' && action === 'roll') { this.openLobby(this.menuChoice === 1 ? 'rush' : this.menuChoice === 2 ? 'endless' : 'main', null); return; }
    if (this.screen === 'lobby') { if (action === 'roll') this.launchLobby(); return; }
    if (this.screen !== 'play' || !state || state.current !== playerId || !state.players[playerId] || !state.players[playerId].local) return;
    if (state.phase === 'choice' && action === 'roll') this.takeChoice(state.choiceFocus); else if (action === 'roll' && state.phase === 'idle') this.startRoll(); else if (action === 'trick') this.triggerTrick(state.players[playerId]);
  };
  PlayScene.prototype.keyAction = function (code) {
    if (code === 'Escape') { if (this.screen === 'album') this.closeAlbum(); return; }
    if (code === 'KeyA') { if (this.screen === 'play' || this.screen === 'result') this.openAlbum(); return; }
    if (code === 'KeyR') { if (this.screen === 'play' || this.screen === 'result' || this.screen === 'album') { if (kit) kit.restart(); } return; }
    if (this.screen === 'menu') {
      if (code === 'ArrowUp' || code === 'ArrowLeft') this.menuChoice = (this.menuChoice + 2) % 3;
      else if (code === 'ArrowDown' || code === 'ArrowRight') this.menuChoice = (this.menuChoice + 1) % 3;
      else if (code === 'Space' || code === 'Enter') this.openLobby(this.menuChoice === 1 ? 'rush' : this.menuChoice === 2 ? 'endless' : 'main', null);
      return;
    }
    if (this.screen === 'lobby') { if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3' || code === 'Digit4') this.localCount = clamp(Number(code.slice(-1)), 1, 4); else if (code === 'Space' || code === 'Enter') this.launchLobby(); else if (code === 'Escape') this.leaveLobby(); return; }
    if (this.screen === 'album') {
      if (code === 'ArrowLeft') this.albumTab = (this.albumTab + 3) % 4;
      else if (code === 'ArrowRight') this.albumTab = (this.albumTab + 1) % 4;
      else if (code === 'Space' || code === 'Enter') this.closeAlbum();
      return;
    }
    if (this.screen === 'result') { if (code === 'Space' || code === 'Enter') this.advanceResult(); return; }
    if (state.phase === 'choice') {
      if (code === 'ArrowUp' || code === 'ArrowLeft') state.choiceFocus = (state.choiceFocus + state.choices.length - 1) % state.choices.length;
      else if (code === 'ArrowDown' || code === 'ArrowRight') state.choiceFocus = (state.choiceFocus + 1) % state.choices.length;
      else if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') this.takeChoice(Number(code.slice(-1)) - 1);
      else if (code === 'Space' || code === 'Enter') this.takeChoice(state.choiceFocus);
      return;
    }
    var active = state && state.players ? state.players[state.current] : null; if (!active || !active.local) return;
    if (code === active.control.roll && state.phase === 'idle') this.startRoll();
    else if (code === active.control.trick) this.triggerTrick(active);
  };
  PlayScene.prototype.startRoll = function () {
    if (!state || state.phase !== 'idle' || !state.players[state.current] || !state.players[state.current].local) return;
    state.phase = 'rolling'; state.rollTimer = REDUCED ? 0.12 : 0.42; sfx('roll', 0.65); this.showChip('ROLLING', C.cyan, 0.7);
  };
  PlayScene.prototype.startRivalRoll = function () { if (state.phase !== 'rivalWait') return; state.phase = 'rolling'; state.rollTimer = REDUCED ? 0.1 : 0.3; sfx('roll', 0.34); };
  PlayScene.prototype.currentEntity = function () { return state && state.players ? state.players[state.current] : null; };
  PlayScene.prototype.beginMove = function (entity, total) { state.phase = 'moving'; state.moveRemaining = Math.max(0, total | 0); state.moveAnim = 0; state.moveFrom = entity.pos; entity.trickUsed = false; if (entity.local) this.showChip('MOVE ' + total, C.cyan, 0.7); };
  PlayScene.prototype.stepOneTile = function (entity) {
    state.moveFrom = entity.pos; entity.prevPos = entity.pos; entity.pos = (entity.pos + 1) % state.boardData.tiles; state.moveRemaining--; state.moveAnim = 0; state.landPos = entity.pos; state.landPulse = 0.22; sfx('tap', entity.local ? 0.18 : 0.08);
    var tile = this.tiles[entity.pos]; if (tile && tile.pickup && state.pickups[entity.pos]) this.collectPickup(entity, entity.pos, tile);
    if (entity.pos === 0) { entity.laps++; entity.coins += entity.local ? 24 : 20 + state.difficulty * 2; entity.score += 12; if (entity.local) this.addFx('LAP  ' + entity.laps + '/' + state.goalLaps, entity.color, entity); this.checkVictory(entity); if (state.phase === 'result') return; }
    this.checkCollisions(entity);
    if (state.moveRemaining <= 0) { state.phase = 'landing'; state.landTimer = REDUCED ? 0.02 : 0.16; }
  };
  PlayScene.prototype.stepRoll = function (dt) {
    state.rollTimer -= dt; if (state.rollTimer > 0) return;
    var entity = this.currentEntity(); if (!entity) return; state.dice[0] = 1 + Math.floor(Math.random() * 6); state.dice[1] = 1 + Math.floor(Math.random() * 6); var total = state.dice[0] + state.dice[1]; var catchup = this.catchupSteps(entity); if (catchup) { total += catchup; entity.score += catchup * 3; }
    if (entity.powerUp === 'DASH') { total += 2; entity.powerUp = null; this.addFx('DASH +2', C.gold, entity); }
    if (entity.trickArmed) { total += 1; entity.trickArmed = false; entity.trickMeter = clamp(entity.trickMeter + 24, 0, 100); entity.score += 8; this.addFx('TRICK +1', C.cyan, entity); }
    this.beginMove(entity, total);
  };
  PlayScene.prototype.stepMoving = function (dt) {
    var entity = this.currentEntity(); if (!entity) return; state.moveAnim += dt / (REDUCED ? 0.06 : 0.12);
    if (state.moveAnim >= 1) { this.stepOneTile(entity); if (state.phase === 'moving') state.moveAnim = 0; }
  };
  PlayScene.prototype.catchupSteps = function (entity) { var rank = this.rankOf(entity); var leader = this.stateLeader(); return leader && rank > 1 && this.raceDistance(leader) - this.raceDistance(entity) >= Math.max(4, state.boardData.tiles / 2) ? 1 : 0; };
  PlayScene.prototype.raceDistance = function (entity) { return entity.laps * state.boardData.tiles + entity.pos; };
  PlayScene.prototype.rankOf = function (entity) { var distance = this.raceDistance(entity), rank = 1; for (var i = 0; i < state.players.length; i++) if (state.players[i] !== entity && this.raceDistance(state.players[i]) > distance) rank++; return rank; };
  PlayScene.prototype.stateLeader = function () { var lead = state.players[0]; for (var i = 1; i < state.players.length; i++) if (this.raceDistance(state.players[i]) > this.raceDistance(lead)) lead = state.players[i]; return lead; };
  PlayScene.prototype.triggerTrick = function (entity) { if (!entity || !entity.local || entity.id !== state.current || state.phase === 'result') return; if (state.phase === 'idle') { entity.trickArmed = true; entity.trickMeter = clamp(entity.trickMeter + 18, 0, 100); this.showChip('TRICK READY  |  PRESS AGAIN ON THE MOVE', C.cyan, 0.9); return; } if (state.phase === 'moving' && !entity.trickUsed && state.moveAnim >= 0.08 && state.moveAnim <= 0.92) { entity.trickUsed = true; state.moveRemaining += 1; entity.trickMeter = clamp(entity.trickMeter + 28, 0, 100); entity.score += 12; this.addFx('TRICK  +1 STEP', C.cyan, entity); this.showChip('CLEAN TRICK  +1 STEP', C.cyan, 0.8); sfx('build', 0.55); } };
  PlayScene.prototype.collectPickup = function (entity, index, tile) { state.pickups[index] = false; entity.powerUp = tile.power; entity.score += 14; entity.trickMeter = clamp(entity.trickMeter + 20, 0, 100); this.addFx(tile.power + ' PICKUP', C.gold, entity); sfx('coin', entity.local ? 0.7 : 0.2); if (entity.local) this.showChip(tile.power + ' PICKUP  COUNTER READY', C.gold, 0.9); };
  PlayScene.prototype.checkCollisions = function (entity) { for (var i = 0; i < state.players.length; i++) { var other = state.players[i]; if (other === entity || other.pos !== entity.pos || other.laps !== entity.laps) continue; if (entity.id > other.id) this.resolveCollision(entity, other); } };
  PlayScene.prototype.resolveCollision = function (a, b) { var blocker = a.powerUp === 'GUARD' ? a : b.powerUp === 'GUARD' ? b : null; if (blocker) { blocker.powerUp = null; this.addFx('GUARD BLOCK', C.cyan, blocker); sfx('block', blocker.local ? 0.6 : 0.2); return; } var target = a.local ? b : a; if (target.shields > 0) { target.shields--; this.addFx('BUMP BLOCKED', C.cyan, target); } else { target.pos = Math.max(0, target.pos - 1); target.score = Math.max(0, target.score - 3); this.addFx('BUMP', C.rose, target); } var winner = a.local ? a : b; winner.score += 4; if (winner.local) this.showChip('RACER BUMP  +4', C.rose, 0.8); sfx('block', winner.local ? 0.55 : 0.18); };
  PlayScene.prototype.stepSim = function (dt) {
    if (!state || this.screen !== 'play') return;
    if (this.notice) { this.notice.timer -= dt; if (this.notice.timer <= 0) this.notice = null; }
    if (this.coachTimer > 0) this.coachTimer -= dt;
    if (this.pressPulse.t > 0) this.pressPulse.t -= dt;
    for (var fxIndex = this.fx.length - 1; fxIndex >= 0; fxIndex--) { this.fx[fxIndex].timer -= dt; if (this.fx[fxIndex].timer <= 0) this.fx.splice(fxIndex, 1); }
    if (state.landPulse > 0) state.landPulse -= dt;
    if (state.phase === 'sticker') { this.stepSticker(dt); return; }
    if (state.phase === 'albumBeat') { state.beatTimer -= dt; if (state.beatTimer <= 0) { state.phase = 'wait'; state.waitTimer = 0.1; if (this.pendingAfterReveal) { var after = this.pendingAfterReveal; this.pendingAfterReveal = null; after(); } } return; }
    if (state.phase === 'rolling') { this.stepRoll(dt); return; }
    if (state.phase === 'moving') { this.stepMoving(dt); return; }
    if (state.phase === 'landing') { state.landTimer -= dt; if (state.landTimer <= 0) this.resolveLanding(this.currentEntity()); return; }
    if (state.phase === 'wait') { state.waitTimer -= dt; if (state.waitTimer <= 0) this.endTurn(); return; }
    if (state.phase === 'rivalWait') { state.waitTimer -= dt; if (state.waitTimer <= 0) this.startRivalRoll(); return; }
  };
  PlayScene.prototype.endTurn = function () {
    if (state.phase === 'result' || state.phase === 'choice' || state.phase === 'sticker' || state.phase === 'albumBeat') return;
    if (state.current < 3) { state.current++; state.phase = state.players[state.current].local ? 'idle' : 'rivalWait'; state.waitTimer = REDUCED ? 0.02 : 0.34; }
    else { state.current = 0; state.turn++; for (var i = 0; i < this.tiles.length; i++) if (this.tiles[i].pickup) state.pickups[i] = true; this.showCoach('P1 SPACE, P2 ENTER, P3 SHIFT, P4 BACKSPACE. Tap ALBUMS for the sticker ledger.', 3.3); state.phase = state.players[0].local ? 'idle' : 'rivalWait'; state.waitTimer = REDUCED ? 0.02 : 0.34; }
  };
  PlayScene.prototype.resolveLanding = function (entity) {
    if (!entity) return; var tile = this.tiles[entity.pos] || {kind: 'event', d: -1, hazard: false}; this.showChip(tile.kind === 'gate' ? 'MERIDIAN GATE' : tile.kind === 'corner' ? 'CORNER' : tile.kind === 'land' ? 'LANDMARK' : tile.kind === 'pickup' ? 'POWER PICKUP' : 'ROW EVENT', tile.kind === 'land' ? colorDistrict(state.boardData, tile.d).color : C.cyan, 0.9);
    if (tile.shortcut && !entity.shortcutCooldown) { entity.pos = (entity.pos + 2) % state.boardData.tiles; entity.shortcutCooldown = 2; entity.score += 10; this.addFx('SHORTCUT  +2', C.mint, entity); if (entity.local) this.showChip('SHORTCUT  +2 TILES', C.mint, 0.8); }
    if (entity.shortcutCooldown > 0) entity.shortcutCooldown--;
    if (tile.hazard) this.applyHazard(entity);
    if (tile.kind === 'gate') { entity.coins += 24; entity.score += 20; sfx('coin', entity.local ? 0.75 : 0.2); if (entity.local) { this.showChip('+24 COINS', C.gold, 0.8); this.beginSticker(entity, state.mode === 'rush' ? 2 : 1, this.finishLanding.bind(this, entity)); } else { this.awardAiSticker(entity); this.finishLanding(entity); } return; }
    if (tile.kind === 'corner') { this.resolveCorner(entity, tile); return; }
    if (tile.kind === 'land') { this.resolveLandmark(entity, tile); return; }
    if (tile.kind === 'pickup') { this.finishLanding(entity); return; }
    this.resolveEvent(entity, tile);
  };
  PlayScene.prototype.applyHazard = function (entity) {
    if (entity.powerUp === 'GUARD' || (!entity.local && Math.random() < entity.shieldChance)) { entity.powerUp = null; sfx('block', entity.local ? 0.7 : 0.2); this.addFx('GUARD BLOCK', C.cyan, entity); return; }
    if (entity.shields > 0) { entity.shields--; sfx('block', entity.local ? 0.7 : 0.2); if (entity.local) this.showChip('SHIELD BLOCKS HAZARD', C.cyan, 0.9); return; }
    var loss = Math.min(entity.coins, 8 + state.difficulty * 2); entity.coins -= loss; entity.score = Math.max(0, entity.score - 4); sfx('block', entity.local ? 0.65 : 0.25); if (entity.local) this.showChip('LANDMARK HAZARD  -' + loss, C.red, 0.95);
  };
  PlayScene.prototype.resolveCorner = function (entity, tile) {
    var key = String(tile.i == null ? entity.pos : tile.i); var owner = state.corners[key];
    if (owner == null || owner < 0) { state.corners[key] = entity.id; entity.coins += 12; entity.score += 10; sfx('coin', 0.55); if (entity.local) this.showChip('CORNER CLAIMED  +12', C.gold, 0.9); }
    else if (owner === entity.id) { var ownGain = 14 + income(entity); entity.coins += ownGain; entity.score += 8; sfx('coin', 0.65); if (entity.local) this.showChip('TOLL COLLECTED  +' + ownGain, C.gold, 0.9); }
    else { var target = state.players[owner]; var toll = Math.min(entity.coins, 8 + (target ? tierTotal(target) : 0) * 3); entity.coins -= toll; if (target) target.coins += toll; entity.score += toll; sfx('coin', entity.local ? 0.5 : 0.2); if (entity.local) this.showChip('PAID TOLL  -' + toll, C.orange, 0.9); else if (target && target.local) this.showChip('TOLL COLLECTED  +' + toll, C.gold, 0.9); }
    this.finishLanding(entity);
  };
  PlayScene.prototype.resolveLandmark = function (entity, tile) {
    var d = clamp(tile.d, 0, 3); var current = clamp(entity.districts[d], 0, 3); var cost = current >= 3 ? -1 : TIER_COSTS[current] || TIER_COSTS[0];
    if (!entity.local) { if (cost > 0 && entity.coins >= Math.ceil(cost * entity.buildFactor)) this.buildTier(entity, d, Math.ceil(cost * entity.buildFactor)); else { entity.coins += 16; entity.score += 6; } this.finishLanding(entity); return; }
    var district = colorDistrict(state.boardData, d); var choices = [];
    if (cost < 0) choices.push({title: district.name + ' DIVIDEND', sub: '+28 coins, district is complete', color: district.color, ok: true, fn: function () { entity.coins += 28; entity.score += 12; sfx('coin', 0.7); this.showChip('+28 DIVIDEND', C.gold, 0.8); this.finishLanding(entity); }.bind(this)});
    else choices.push({title: 'BUILD ' + TIER_NAMES[current] + '  ' + district.name, sub: 'Cost ' + cost + '  |  +' + TIER_INCOME[current] + ' income', color: district.color, ok: entity.coins >= cost, fn: function () { this.buildTier(entity, d, cost); this.finishLanding(entity); }.bind(this)});
    choices.push({title: 'BANK THE ROW', sub: '+18 coins, keep the build money', color: C.gold, ok: true, fn: function () { entity.coins += 18; entity.score += 5; sfx('coin', 0.6); this.showChip('+18 COINS', C.gold, 0.8); this.finishLanding(entity); }.bind(this)});
    choices.push({title: 'BUY SHIELD', sub: 'Cost 10  |  blocks a heist or hazard', color: C.cyan, ok: entity.coins >= 10, fn: function () { entity.coins -= 10; entity.shields++; sfx('build', 0.55); this.showChip('SHIELD READY', C.cyan, 0.8); this.finishLanding(entity); }.bind(this)});
    this.openChoice(district.name + ' landmark', choices);
  };
  PlayScene.prototype.buildTier = function (entity, d, cost) {
    var before = entity.districts[d]; entity.coins = Math.max(0, entity.coins - cost); entity.districts[d] = clamp(before + 1, 0, 3); entity.score += 18 + entity.districts[d] * 5; sfx('build', 0.7); var district = colorDistrict(state.boardData, d); this.showChip(district.name.toUpperCase() + '  ' + TIER_NAMES[entity.districts[d] - 1].toUpperCase(), district.color, 1.0);
    if (entity.districts[d] === 3) { entity.coins += 30; entity.score += 40; sfx('spire', entity.local ? 0.8 : 0.25); if (entity.local) this.showChip('DISTRICT SPIRE  +' + 30, district.color, 1.1); }
    this.checkVictory(entity);
  };
  PlayScene.prototype.resolveEvent = function (entity) {
    var isHeist = ((entity.pos + entity.laps + state.turn) % 2 === 0);
    if (!entity.local) { if (isHeist) { var best = state.players[0]; for (var i = 1; i < state.players.length; i++) if (state.players[i].coins > best.coins) best = state.players[i]; this.resolveHeist(entity, best); } else { entity.coins += 24; entity.shields += 1; entity.score += 12; } this.finishLanding(entity); return; }
    var choices = [];
    if (isHeist) {
      for (var r = 0; r < state.players.length; r++) { var rival = state.players[r]; if (rival === entity) continue; choices.push({title: 'HEIST  ' + rival.name, sub: rival.shields > 0 ? '0%  |  shield blocks completely' : '85% success  |  vault ' + rival.coins, color: rival.color, ok: true, target: rival, fn: (function (target, scene) { return function () { scene.resolveHeist(entity, target); scene.finishLanding(entity); }; })(rival, this)}); }
      this.openChoice('Heist target', choices);
    } else {
      choices.push({title: 'GRANT  +2 SHIELDS', sub: 'Generous defense against rivals', color: C.cyan, ok: true, fn: function () { entity.shields += 2; entity.score += 12; sfx('build', 0.5); this.showChip('+2 SHIELDS', C.cyan, 0.8); this.finishLanding(entity); }.bind(this)});
      choices.push({title: 'GRANT  +24 COINS', sub: 'Straight to the town ledger', color: C.gold, ok: true, fn: function () { entity.coins += 24; entity.score += 14; sfx('coin', 0.7); this.showChip('+24 COINS', C.gold, 0.8); this.finishLanding(entity); }.bind(this)});
      choices.push({title: 'GRANT  2 STICKER DRAWS', sub: 'Each draw is 1 of 24  |  4.2%', color: C.violet, ok: true, fn: function () { this.beginSticker(entity, 2, this.finishLanding.bind(this, entity)); }.bind(this)});
      this.openChoice('Row grant', choices);
    }
  };
  PlayScene.prototype.resolveHeist = function (thief, target) {
    if (!target) { this.showChip('VAULT EMPTY', C.slate, 0.8); return; }
    if (target.shields > 0) { target.shields--; sfx('block', thief.id === 0 ? 0.75 : 0.25); if (thief.id === 0 || target.id === 0) this.showChip('SHIELD BLOCKED HEIST', C.cyan, 1); return; }
    if (Math.random() > HEIST_ODDS) { sfx('block', thief.id === 0 ? 0.65 : 0.2); if (thief.id === 0) this.showChip('HEIST FOILED', C.red, 0.9); return; }
    var take = Math.min(Math.max(8, Math.round(target.coins * 0.34)), 110); take = Math.min(take, target.coins); target.coins -= take; thief.coins += take; thief.score += take; sfx('heist', thief.id === 0 ? 0.8 : 0.25); if (thief.id === 0) this.showChip('HEIST  +' + take, C.gold, 0.9); else if (target.id === 0) this.showChip('RIVAL STOLE  -' + take, C.red, 0.9);
  };
  PlayScene.prototype.openChoice = function (title, choices) { state.choices = choices.slice(0, 3); state.choiceTitle = title; state.choiceNote = 'Tap a card or use 1, 2, 3. Arrows move focus.'; state.choiceFocus = 0; for (var i = 0; i < state.choices.length; i++) if (state.choices[i].ok) { state.choiceFocus = i; break; } state.phase = 'choice'; this.notice = null; };
  PlayScene.prototype.takeChoice = function (index) { if (!state || state.phase !== 'choice' || !state.choices) return; var choice = state.choices[index]; if (!choice || !choice.ok) { sfx('block', 0.4); return; } state.choices = null; sfx('tap', 0.45); choice.fn(); };
  PlayScene.prototype.finishLanding = function (entity) { if (state.phase === 'result') return; if (this.checkVictory(entity)) return; state.phase = 'wait'; state.waitTimer = entity.local ? (REDUCED ? 0.04 : 0.22) : (REDUCED ? 0.04 : 0.34); };
  PlayScene.prototype.awardAiSticker = function (entity) { entity.stickerCount++; if (entity.stickerCount % 6 === 0) entity.coins += ALBUM_BONUS; };
  PlayScene.prototype.beginSticker = function (entity, count, after) {
    if (!entity.local) { for (var i = 0; i < count; i++) this.awardAiSticker(entity); if (after) after(); return; }
    this.stickerEntity = entity; this.stickerQueue = Math.max(1, count | 0); this.pendingAfterReveal = after; state.phase = 'sticker'; state.stickerTimer = REDUCED ? 0.24 : 0.72; state.sticker = {id: Math.floor(Math.random() * 24), known: false, count: this.stickerQueue}; state.stickerEntity = entity.id; this.albumBeatNeeded = -1; sfx('sticker', 0.65);
  };
  PlayScene.prototype.stepSticker = function (dt) {
    state.stickerTimer -= dt; if (state.stickerTimer > 0) return;
    var id = clamp(whole(state.sticker && state.sticker.id, 0), 0, 23); var p = this.stickerEntity || state.players[state.stickerEntity] || state.player; var duplicate = !!p.stickers[id]; state.sticker.known = duplicate; if (duplicate) { p.coins += 8; p.score += 5; this.showChip('DUPE  +8', C.slate, 0.75); } else { p.stickers[id] = true; if (p.id === 0) profile.stickers[id] = true; p.stickerCount++; p.score += 20; this.showChip('STICKER FOUND', C.violet, 0.85); var album = Math.floor(id / 6); if (!p.albums[album] && albumComplete(p, album)) this.completeAlbum(p, album); } persist(); this.stickerQueue--;
    if (this.stickerQueue > 0) { state.sticker = {id: Math.floor(Math.random() * 24), known: false, count: this.stickerQueue}; state.stickerTimer = REDUCED ? 0.24 : 0.72; sfx('sticker', 0.65); return; }
    if (this.albumBeatNeeded >= 0) { state.phase = 'albumBeat'; state.beatTimer = REDUCED ? 0.35 : 1.0; sfx('spire', 0.8); } else { state.phase = 'wait'; state.waitTimer = 0.08; if (this.pendingAfterReveal) { var after = this.pendingAfterReveal; this.pendingAfterReveal = null; after(); } }
  };
  PlayScene.prototype.completeAlbum = function (p, album) {
    p = p || state.player; p.albums[album] = true; p.coins += ALBUM_BONUS; p.score += 75; if (p.id === 0) { profile.albumsCompleted = clamp(profile.albumsCompleted + 1, 0, 4); profile.albumMedal = profile.albumsCompleted >= 4 ? 3 : profile.albumsCompleted >= 2 ? 2 : 1; } this.albumBeatNeeded = album; this.showChip('ALBUM COMPLETE  +' + ALBUM_BONUS, C.violet, 1.1); persist();
    if (p.districts[album] < 3) { this.albumFreeTier = TIER_NAMES[p.districts[album]] || TIER_NAMES[0]; p.districts[album]++; p.score += 30; } else { this.albumFreeTier = '+30 coins'; p.coins += 30; }
  };
  PlayScene.prototype.checkVictory = function (entity) {
    if (!entity || entity.laps < state.goalLaps) return false;
    this.finishRace(entity); return true;
  };
  PlayScene.prototype.finishRace = function (winner) {
    if (!state || state.phase === 'result') return;
    var won = winner && winner.local; var turns = state.turn; var medal = won ? (state.mode === 'rush' ? (turns <= 9 ? 3 : turns <= 14 ? 2 : 1) : state.mode === 'endless' ? (winner.score >= 520 ? 3 : winner.score >= 330 ? 2 : 1) : (turns <= 34 ? 3 : turns <= 48 ? 2 : 1)) : 0;
    state.result = {won: won, winner: winner ? winner.name : 'Rival', turns: turns, medal: medal, score: winner ? winner.score : state.player.score, board: state.boardName}; state.phase = 'result'; this.screen = 'result'; this.notice = null; this.coachTimer = 0; this.addFx(won ? 'FINISH!' : 'RIVAL FINISH', won ? C.mint : C.red, winner || state.player);
    if (won) { profile.boardsWon++; profile.mainMedal = state.mode === 'main' ? Math.max(profile.mainMedal, medal) : profile.mainMedal; if (state.mode === 'main') { if (!profile.bestTurns || turns < profile.bestTurns) profile.bestTurns = turns; profile.level = clamp(profile.level + 1, 1, 99); } if (state.mode === 'rush') { var ri = clamp(state.boardIndex, 0, 2); profile.rushMedals[ri] = Math.max(profile.rushMedals[ri] || 0, medal); if (ri < 2) profile.rushUnlocked = Math.max(profile.rushUnlocked, ri + 1); } if (state.mode === 'endless') { profile.endlessBest = Math.max(profile.endlessBest, winner.score); profile.endlessRowBest = Math.max(profile.endlessRowBest, state.row); } sfx('spire', 0.95); } else sfx('block', 0.7);
    persist(); syncProbe();
  };
  PlayScene.prototype.advanceResult = function () {
    if (!state.result) return;
    if (state.result.won) { if (state.mode === 'rush') { if (state.boardIndex >= 2) this.showMenu(); else this.startMode('rush', state.boardIndex + 1); } else if (state.mode === 'endless') this.startMode('endless', null); else this.startMode('main', null); }
    else this.startMode(state.mode, state.mode === 'rush' ? state.boardIndex : state.board);
  };

  PlayScene.prototype.update = function (time, delta) {
    if (!this.scene.isActive()) return;
    this.readInput();
    if (kit && kit.paused) { this.render(); return; }
    var frame = kit ? kit.juice.frame() : {frozen: false}; if (frame.frozen) { this.render(); return; }
    var add = clamp(num(delta, 0) / 1000, 0, 0.25); this.accumulator += add; var steps = 0;
    while (this.accumulator >= STEP && steps < MAX_STEPS) { this.accumulator -= STEP; this.stepSim(STEP); this.visualTime += STEP; steps++; }
    if (steps >= MAX_STEPS && this.accumulator >= STEP) this.accumulator = 0;
    this.checkForces(); this.render();
  };
  PlayScene.prototype.checkForces = function () {
    if (!root.__mr) return;
    var fm = root.__mr.forceMode == null ? null : normalizeMode(root.__mr.forceMode); var fb = root.__mr.forceBoard == null ? null : root.__mr.forceBoard;
    if (fm && (fm !== this.lastForcedMode || fb !== this.lastForcedBoard)) { this.lastForcedMode = fm; this.lastForcedBoard = fb; if (this.screen !== 'play' || state.mode !== fm || (fb != null && state.board !== String(fb))) this.startMode(fm, fb); }
    syncProbe();
  };

  PlayScene.prototype.render = function () {
    if (!this.ui) return;
    this.hitZones.length = 0; this.setAllVisible(false);
    if (this.screen === 'menu') this.renderMenu();
    else if (this.screen === 'lobby') this.renderLobby();
    else if (this.screen === 'album') this.renderAlbum();
    else if (this.screen === 'result') this.renderResult();
    else this.renderPlay();
    if (this.screen !== 'play') this.renderPressPulse();
  };
  PlayScene.prototype.renderMenu = function () {
    var i, board; visible(this.background, true); setFillIfChanged(this.background, C.deep); visible(this.boardImage, true); this.boardImage.setAlpha(0.22); this.boardImage.setPosition(195, 420); board = getBoard('meridian-row');
    visible(this.ui.menuTitle, true); visible(this.ui.menuAccent, true); visible(this.ui.menuTag, true); visible(this.ui.menuFoot, true); visible(this.ui.menuNote, true);
    for (i = 0; i < 3; i++) { visible(this.ui.menuCards[i], true); visible(this.ui.menuLabels[i], true); visible(this.ui.menuMeta[i], true); visible(this.ui.menuStatus[i], true); var selected = this.menuChoice === i; setFillIfChanged(this.ui.menuCards[i], selected ? '#173b55' : '#11253a'); setStrokeIfChanged(this.ui.menuCards[i], selected ? (i === 1 ? C.violet : i === 2 ? C.mint : C.cyan) : '#24415b', selected ? 2 : 1); }
    setTextIfChanged(this.ui.menuLabels[0], 'MERIDIAN ROW'); setTextIfChanged(this.ui.menuMeta[0], '3 laps  |  1 to 4 local racers  |  board medals'); setTextIfChanged(this.ui.menuStatus[0], profile.mainMedal ? medalName(profile.mainMedal) : 'PLAY');
    setTextIfChanged(this.ui.menuLabels[1], 'STICKER RUSH'); setTextIfChanged(this.ui.menuMeta[1], 'Short authored boards  |  unlock chain'); setTextIfChanged(this.ui.menuStatus[1], 'BOARD ' + (profile.rushUnlocked + 1) + '/3');
    setTextIfChanged(this.ui.menuLabels[2], 'ENDLESS ROW'); setTextIfChanged(this.ui.menuMeta[2], 'Expanding loop  |  best ' + profile.endlessBest); setTextIfChanged(this.ui.menuStatus[2], profile.endlessRowBest ? 'ROW ' + profile.endlessRowBest : 'PLAY');
    this.zone(22, 288, 346, 76, this.openLobby.bind(this, 'main', null)); this.zone(22, 382, 346, 76, this.openLobby.bind(this, 'rush', null)); this.zone(22, 476, 346, 76, this.openLobby.bind(this, 'endless', null));
  };
  PlayScene.prototype.renderLobby = function () {
    var i; visible(this.background, true); setFillIfChanged(this.background, C.deep); visible(this.ui.lobbyTitle, true); visible(this.ui.lobbyMeta, true); visible(this.ui.lobbyHint, true); visible(this.ui.lobbyStart, true); visible(this.ui.lobbyStartText, true); visible(this.ui.lobbyBack, true); visible(this.ui.lobbyBackText, true);
    setTextIfChanged(this.ui.lobbyMeta, (this.pendingMode === 'rush' ? 'STICKER RUSH' : this.pendingMode === 'endless' ? 'ENDLESS ROW' : 'MERIDIAN ROW') + '  |  ' + this.localCount + ' LOCAL RACER' + (this.localCount === 1 ? '' : 'S'), C.violet);
    for (i = 0; i < 4; i++) { visible(this.ui.lobbySlots[i], true); visible(this.ui.lobbySlotText[i], true); var joined = i < this.localCount; setFillIfChanged(this.ui.lobbySlots[i], joined ? '#173b55' : '#11253a'); setStrokeIfChanged(this.ui.lobbySlots[i], joined ? TOKEN_COLORS[i] : '#24415b', joined ? 2 : 1); setTextIfChanged(this.ui.lobbySlotText[i], joined ? PLAYER_CONTROLS[i].name + ' READY  |  ' + PLAYER_CONTROLS[i].hint : 'P' + (i + 1) + '  TAP TO JOIN  |  GAMEPAD ' + (i + 1), joined ? TOKEN_COLORS[i] : C.slate); this.zone(22, 198 + i * 66, 346, 54, (function (n) { return function () { this.localCount = n + 1; this.render(); }; })(i).bind(this)); }
    this.zone(44, 550, 302, 62, this.launchLobby.bind(this)); this.zone(44, 630, 302, 48, this.leaveLobby.bind(this));
  };
  PlayScene.prototype.renderPlay = function () {
    var p = state.player, board = state.boardData, i, d, t, entity, point, x, y, tile, tv, district;
    visible(this.background, true); setFillIfChanged(this.background, C.deep); visible(this.chrome, true); visible(this.bottomChrome, true); visible(this.boardImage, true); this.boardImage.setAlpha(1); this.boardImage.setPosition(195, 281);
    setTextIfChanged(this.ui.title, 'MERIDIAN'); setTextIfChanged(this.ui.titleAccent, state.mode === 'rush' ? 'STICKER RUSH' : state.mode === 'endless' ? 'ENDLESS ROW' : 'ROW'); setTextIfChanged(this.ui.boardName, board.name); setTextIfChanged(this.ui.boardSub, (state.mode === 'endless' ? 'ROW ' + state.row : 'TURN ' + state.turn) + '  |  ' + state.difficultyName + '  |  ' + state.goalLaps + ' LAPS', C.slate);
    setTextIfChanged(this.ui.coin, '● ' + p.coins, C.gold); setTextIfChanged(this.ui.shield, '⬟ ' + p.shields, C.cyan); setTextIfChanged(this.ui.turn, 'TURN ' + state.turn, C.muted); setTextIfChanged(this.ui.albumPill, '◈ ' + stickerCount(p) + '/24', C.violet); visible(this.ui.albumPill, true); this.zone(285, 46, 95, 30, this.openAlbum.bind(this));
    setTextIfChanged(this.ui.centerTitle, board.name.toUpperCase()); setTextIfChanged(this.ui.centerIncome, 'INCOME  ' + income(p) + '   |   SCORE  ' + p.score + '   |   FINISH ' + state.goalLaps + ' LAPS', C.gold);
    for (d = 0; d < 4; d++) { district = colorDistrict(board, d); setTextIfChanged(this.ui.districtNames[d], district.icon + '  ' + district.short, district.color); setTextIfChanged(this.ui.districtValues[d], p.districts[d] + '/3' + (p.albums[d] ? '  ◈' : ''), p.districts[d] >= 3 ? district.color : C.muted); for (t = 0; t < 3; t++) { var filled = p.districts[d] > t; setFillIfChanged(this.ui.districtBars[d][t], filled ? district.color : '#21374e', 1); } }
    var dieA = state.phase === 'rolling' ? 1 + ((Math.floor(this.visualTime * 31) + 2) % 6) : state.dice[0]; var dieB = state.phase === 'rolling' ? 1 + ((Math.floor(this.visualTime * 37) + 4) % 6) : state.dice[1]; setTextIfChanged(this.ui.dieValue[0], dieA, C.deep); setTextIfChanged(this.ui.dieValue[1], dieB, C.deep); setTextIfChanged(this.ui.dieTotal, state.phase === 'rolling' ? '...' : 'MOVE  ' + (dieA + dieB), C.ink); visible(this.ui.dieBack[0], true); visible(this.ui.dieBack[1], true); visible(this.ui.dieValue[0], true); visible(this.ui.dieValue[1], true); visible(this.ui.dieTotal, true);
    for (i = 0; i < this.tiles.length; i++) { tv = this.ui.tiles[i]; tile = this.tiles[i]; point = this.route[i]; if (!point) continue; x = 18 + point.x * 354; y = 104 + point.y * 354; visible(tv.image, true); visible(tv.accent, true); visible(tv.icon, true); visible(tv.label, true); tv.image.setPosition(x, y).setDisplaySize(Math.max(12, 354 / point.grid - 4), Math.max(12, 354 / point.grid - 4)); district = tile.d >= 0 ? colorDistrict(board, tile.d) : null; var cornerOwner = tile.kind === 'corner' ? state.corners[String(i)] : null; var owner = cornerOwner == null ? null : state.players[cornerOwner]; var cornerColor = owner ? owner.color : '#8aa3bb'; var tileColor = tile.kind === 'gate' ? C.gold : tile.kind === 'corner' ? cornerColor : tile.kind === 'pickup' ? C.gold : tile.kind === 'land' ? district.color : C.violet; setFillIfChanged(tv.accent, tile.shortcut ? C.mint : tileColor, 1); tv.accent.setPosition(x, y - 354 / point.grid * 0.26).setDisplaySize(Math.max(12, 354 / point.grid * 0.56), Math.max(3, 354 / point.grid * 0.08)); var icon = tile.kind === 'gate' ? '◎' : tile.kind === 'corner' ? '◈' : tile.kind === 'pickup' ? '✦' : tile.kind === 'land' ? district.icon : '?'; setTextIfChanged(tv.icon, icon, tileColor); tv.icon.setPosition(x, y - 2); var label = tile.kind === 'gate' ? 'GATE' : tile.kind === 'corner' ? (owner ? owner.control.name : 'OPEN') : tile.kind === 'pickup' ? tile.power : tile.kind === 'land' ? district.short : 'EVENT'; setTextIfChanged(tv.label, tile.shortcut ? 'CUT  ' + label : label, tile.shortcut ? C.mint : C.muted); tv.label.setPosition(x, y + 354 / point.grid * 0.25); visible(tv.hazard, tile.hazard); if (tile.hazard) tv.hazard.setPosition(x + 354 / point.grid * 0.26, y - 354 / point.grid * 0.25); for (t = 0; t < 3; t++) { visible(tv.bars[t], tile.kind === 'land'); setFillIfChanged(tv.bars[t], tile.kind === 'land' && p.districts[tile.d] > t ? district.color : '#2a4158'); tv.bars[t].setPosition(x - 354 / point.grid * 0.18 + t * Math.max(4, 354 / point.grid * 0.12), y + 354 / point.grid * 0.38).setDisplaySize(Math.max(3, 354 / point.grid * 0.1), Math.max(2, 354 / point.grid * 0.045)); } }
    visible(this.ui.landRing, state.landPulse > 0); if (state.landPulse > 0 && this.route[state.landPos]) { point = this.route[state.landPos]; this.ui.landRing.setPosition(18 + point.x * 354, 104 + point.y * 354).setScale(1 + (0.4 - state.landPulse) * 1.7).setTint(tint(state.boardData.theme || C.cyan)).setAlpha(clamp(state.landPulse * 4, 0, 1)); }
    for (i = 0; i < 4; i++) { entity = state.players[i]; point = this.route[clamp(entity.pos, 0, this.route.length - 1)] || this.route[0]; var from = this.route[clamp(state.moveFrom, 0, this.route.length - 1)] || point; var moveT = state.current === i && state.phase === 'moving' ? clamp(state.moveAnim, 0, 1) : 1; var px = 18 + lerp(from.x, point.x, moveT) * 354; var py = 104 + lerp(from.y, point.y, moveT) * 354; var slotX = i === 0 || i === 2 ? -9 : 9, slotY = i < 2 ? -9 : 9; var frame = entity.trickUsed || entity.trickArmed ? 2 : state.current === i && state.phase === 'moving' ? 1 : 0; setTextureIfChanged(this.ui.tokens[i].image, 'mr-racer-' + i + '-' + frame); this.ui.tokens[i].image.setPosition(px + slotX, py + slotY).setScale(state.current === i ? 0.55 : 0.48); this.ui.tokens[i].label.setPosition(px + slotX, py + slotY); this.ui.tokenRings[i].setPosition(px + slotX, py + slotY).setScale(state.current === i ? 0.38 : 0.29).setTint(tint(entity.color)).setAlpha(state.current === i ? 0.92 : 0.24); visible(this.ui.tokens[i].image, true); visible(this.ui.tokens[i].label, true); visible(this.ui.tokenRings[i], true); setTextIfChanged(this.ui.tokens[i].label, entity.local ? entity.control.name : 'AI', C.deep); }
    for (i = 0; i < 4; i++) { entity = state.players[i]; visible(this.ui.cards[i], true); visible(this.ui.cardNames[i], true); visible(this.ui.cardCoins[i], true); visible(this.ui.cardShields[i], true); visible(this.ui.cardStatus[i], true); setFillIfChanged(this.ui.cards[i], state.current === i ? '#173b55' : '#102239'); setStrokeIfChanged(this.ui.cards[i], state.current === i ? entity.color : '#24415b', state.current === i ? 2 : 1); setTextIfChanged(this.ui.cardNames[i], entity.local ? entity.control.name + ' READY' : 'AI  ' + entity.name.split(' ')[0].toUpperCase(), entity.color); setTextIfChanged(this.ui.cardCoins[i], '● ' + entity.coins, C.gold); setTextIfChanged(this.ui.cardShields[i], '⬟' + entity.shields, C.cyan); setTextIfChanged(this.ui.cardStatus[i], 'S' + entity.score + '  POS ' + this.rankOf(entity) + '  L' + entity.laps + '/' + state.goalLaps + '\nT' + Math.round(entity.trickMeter) + '  ' + (entity.powerUp || 'NO POWER'), C.muted); for (d = 0; d < 4; d++) { visible(this.ui.cardBuild[i][d], true); setFillIfChanged(this.ui.cardBuild[i][d], entity.districts[d] > 0 ? colorDistrict(board, d).color : '#223b54'); this.ui.cardBuild[i][d].setDisplaySize(14 * entity.districts[d] / 3, 7); } }
    var active = this.currentEntity(); if (state.phase === 'idle' && active && active.local) this.renderIdleAction(); else if (state.phase === 'choice') this.renderChoices(); else this.renderWaitAction();
    if (state.phase === 'albumBeat') this.renderBoundary(); else this.renderTransient(); this.renderPressPulse(); this.renderFx(); syncProbe();
  };
  PlayScene.prototype.renderPressPulse = function () { var pulse = this.ui.pressPulse; if (!pulse || this.pressPulse.t <= 0) { visible(pulse, false); return; } var progress = 1 - this.pressPulse.t / (REDUCED ? 0.06 : 0.12); pulse.setPosition(this.pressPulse.x, this.pressPulse.y).setScale(0.82 + progress * 0.24).setAlpha(1 - progress); visible(pulse, true); };
  PlayScene.prototype.renderFx = function () { for (var i = 0; i < this.ui.fxLabels.length; i++) visible(this.ui.fxLabels[i], false); for (var n = 0; n < this.fx.length && n < this.ui.fxLabels.length; n++) { var fx = this.fx[n], entity = state.players[fx.id] || state.player, point = this.route[clamp(entity.pos, 0, this.route.length - 1)] || this.route[0], progress = 1 - fx.timer / fx.life, label = this.ui.fxLabels[n]; label.setPosition(18 + point.x * 354, 104 + point.y * 354 - 30 - progress * 34).setAlpha(clamp(fx.timer / fx.life, 0, 1)).setScale(1 + progress * 0.16); setTextIfChanged(label, fx.text, fx.color); visible(label, true); } };
  PlayScene.prototype.renderIdleAction = function () { var active = this.currentEntity(); visible(this.ui.roll, true); visible(this.ui.rollLabel, true); visible(this.ui.rollMeta, true); visible(this.ui.albumButton, true); visible(this.ui.albumButtonText, true); visible(this.ui.restartButton, true); visible(this.ui.restartText, true); setTextIfChanged(this.ui.rollLabel, active ? active.control.name + ' ROLL' : 'ROLL', active ? active.color : C.ink); setTextIfChanged(this.ui.rollMeta, (active ? active.control.hint : 'SPACE') + '  |  ' + (active.trickArmed ? 'TRICK ARMED' : 'T TRICK'), C.cyan); setFillIfChanged(this.ui.roll, '#153b58'); setStrokeIfChanged(this.ui.roll, active ? active.color : C.cyan, 2); this.zone(18, 660, 228, 144, this.startRoll.bind(this)); this.zone(258, 660, 114, 66, this.openAlbum.bind(this)); this.zone(258, 738, 114, 66, kit ? kit.restart.bind(kit) : this.restartCurrent.bind(this)); };
  PlayScene.prototype.renderWaitAction = function () { visible(this.ui.actionTitle, true); visible(this.ui.actionNote, true); var e = this.currentEntity() || state.player; var label = e.local ? e.control.name + ' RACER' : e.name.toUpperCase(); setTextIfChanged(this.ui.actionTitle, state.phase === 'moving' ? label + ' MOVES' : state.phase === 'rolling' ? label + ' ROLLS' : state.phase === 'rivalWait' ? 'AI RACER ROLLS' : 'LANDING BEAT', e.color || C.ink); setTextIfChanged(this.ui.actionNote, state.phase === 'moving' ? 'Press the trick key in the moving beat for a generous extra step.' : e.local ? e.control.hint + '  |  trick: ' + e.control.trick : 'The rival takes its turn. Pickups respawn each round.', C.muted); };
  PlayScene.prototype.renderChoices = function () { visible(this.ui.actionTitle, true); visible(this.ui.actionNote, true); setTextIfChanged(this.ui.actionTitle, state.choiceTitle, C.ink); setTextIfChanged(this.ui.actionNote, state.choiceNote, C.muted); for (var i = 0; i < 3; i++) { var choice = state.choices && state.choices[i]; visible(this.ui.choices[i], !!choice); visible(this.ui.choiceTitles[i], !!choice); visible(this.ui.choiceSubs[i], !!choice); visible(this.ui.choiceNums[i], !!choice); if (!choice) continue; setFillIfChanged(this.ui.choices[i], state.choiceFocus === i ? '#1d3d56' : '#13283e'); setStrokeIfChanged(this.ui.choices[i], choice.ok ? choice.color : '#34495d', state.choiceFocus === i ? 2 : 1); setTextIfChanged(this.ui.choiceTitles[i], choice.title, choice.ok ? C.ink : C.slate); setTextIfChanged(this.ui.choiceSubs[i], choice.sub, choice.ok ? choice.color : C.slate); setTextIfChanged(this.ui.choiceNums[i], String(i + 1), choice.color); this.zone(18, 616 + i * 62, 354, 56, this.takeChoice.bind(this, i)); } };
  PlayScene.prototype.renderTransient = function () {
    var hasSticker = state.phase === 'sticker' && state.sticker; visible(this.ui.notice, !!this.notice && !hasSticker); visible(this.ui.noticeText, !!this.notice && !hasSticker); visible(this.ui.sticker, !!hasSticker); visible(this.ui.stickerArt, !!hasSticker); visible(this.ui.stickerText, !!hasSticker); visible(this.ui.stickerOdds, !!hasSticker); visible(this.ui.coach, !this.notice && !hasSticker && this.coachTimer > 0); if (this.notice && !hasSticker) { setFillIfChanged(this.ui.notice, this.notice.color, 0.95); setStrokeIfChanged(this.ui.notice, this.notice.color, 1); setTextIfChanged(this.ui.noticeText, this.notice.text, this.notice.color); } if (hasSticker) { var id = clamp(whole(state.sticker.id, 0), 0, 23); setTextIfChanged(this.ui.stickerText, (state.sticker.known ? 'DUPE  ' : '') + STICKERS[id], C.ink); setTextIfChanged(this.ui.stickerArt, colorDistrict(state.boardData, Math.floor(id / 6)).icon, colorDistrict(state.boardData, Math.floor(id / 6)).color); } if (this.coachTimer > 0 && !this.notice && !hasSticker) { setTextIfChanged(this.ui.coach, this.coach, C.muted); this.ui.coach.setAlpha(clamp(this.coachTimer / 2, 0.16, 0.94)); } }
  PlayScene.prototype.renderBoundary = function () {
    var progress = 1 - clamp(state.beatTimer / (REDUCED ? 0.35 : 1.0), 0, 1); var scale = REDUCED ? 1 : clamp(0.9 + easeBack(progress) * 0.1, 0.9, 1.04); visible(this.ui.shade, true); visible(this.ui.boundary, true); visible(this.ui.boundaryTitle, true); visible(this.ui.boundaryText, true); setFillIfChanged(this.ui.boundary, C.violet); setStrokeIfChanged(this.ui.boundary, C.violet, 2); setTextIfChanged(this.ui.boundaryTitle, 'ALBUM COMPLETE', C.violet); setTextIfChanged(this.ui.boundaryText, '+40 coins  |  free ' + this.albumFreeTier + '  |  next draw stays 1 of 24', C.ink); this.ui.boundary.setScale(scale); this.ui.boundaryTitle.setScale(scale); this.ui.boundaryText.setScale(scale);
  };
  PlayScene.prototype.renderResult = function () {
    visible(this.background, true); visible(this.boardImage, true); this.boardImage.setAlpha(0.2).setPosition(195, 281); visible(this.ui.shade, true); visible(this.ui.resultPanel, true); visible(this.ui.resultTitle, true); visible(this.ui.resultText, true); visible(this.ui.resultMedal, true); visible(this.ui.resultAlbums, true); visible(this.ui.resultNext, true); visible(this.ui.resultNextText, true); visible(this.ui.resultBack, true); visible(this.ui.resultBackText, true); var r = state.result; setFillIfChanged(this.ui.resultPanel, r.won ? '#0d2d2c' : '#2a1827'); setStrokeIfChanged(this.ui.resultPanel, r.won ? C.mint : C.red, 2); setTextIfChanged(this.ui.resultTitle, r.won ? (state.mode === 'endless' ? 'ROW CLEARED' : 'SPIRE COMPLETE') : 'RIVAL TOOK THE ROW', r.won ? C.mint : C.red); setTextIfChanged(this.ui.resultText, r.won ? r.board + '\n' + r.turns + ' turns  |  score ' + r.score + '\nThe next board seeds harder.' : r.winner + ' finished the four-district race.\nYour stickers and medals stay saved.', C.ink); setTextIfChanged(this.ui.resultMedal, r.won ? medalName(r.medal) + ' BOARD  |  ' + medalName(r.medal) + ' TURNS' : 'TRY AGAIN', medalColor(r.medal)); setTextIfChanged(this.ui.resultAlbums, 'ALBUM MEDAL  ' + medalName(profile.albumMedal) + '   |   ' + profile.albumsCompleted + '/4 complete', C.violet); setTextIfChanged(this.ui.resultNextText, r.won ? (state.mode === 'rush' && state.boardIndex >= 2 ? 'RUSH COMPLETE  |  LOBBY' : 'NEXT BOARD') : 'RETRY BOARD', r.won ? C.mint : C.orange); this.zone(44, 518, 302, 54, this.advanceResult.bind(this)); this.zone(44, 584, 302, 46, this.showMenu.bind(this)); this.zone(18, 44, 160, 30, this.openAlbum.bind(this)); this.renderFx(); }
  PlayScene.prototype.renderAlbum = function () {
    var p = state.player || {stickers: profile.stickers, albums: [false, false, false, false]}; var tab = clamp(whole(this.albumTab, 0), 0, 3); var board = state.boardData || getBoard('meridian-row'); visible(this.background, true); visible(this.ui.albumShade, true); visible(this.ui.albumTitle, true); visible(this.ui.albumOdds, true); visible(this.ui.albumClose, true); visible(this.ui.albumCloseText, true); setTextIfChanged(this.ui.albumOdds, 'Every draw is 1 of 24, equal 4.2% each.', C.violet); for (var d = 0; d < 4; d++) { visible(this.ui.albumTabs[d], true); visible(this.ui.albumTabText[d], true); var district = colorDistrict(board, d); setFillIfChanged(this.ui.albumTabs[d], d === tab ? district.color : '#162a40', d === tab ? 0.28 : 1); setStrokeIfChanged(this.ui.albumTabs[d], district.color, d === tab ? 2 : 1); setTextIfChanged(this.ui.albumTabText[d], district.short + ' ' + (p.albums[d] ? '◈' : ''), d === tab ? district.color : C.muted); this.zone(10 + d * 94, 96, 86, 42, (function (n) { return function () { this.albumTab = n; }; })(d).bind(this)); } for (var i = 0; i < 6; i++) { var cell = this.ui.albumCells[i], art = this.ui.albumCellArt[i], label = this.ui.albumCellText[i], id = tab * 6 + i, owned = !!p.stickers[id], dis = colorDistrict(board, tab); visible(cell, true); visible(art, true); visible(label, true); setFillIfChanged(cell, owned ? '#142b3e' : '#101f32'); setStrokeIfChanged(cell, owned ? dis.color : '#274158', owned ? 2 : 1); setTextIfChanged(art, owned ? dis.icon : '?', owned ? dis.color : '#49627a'); setTextIfChanged(label, owned ? STICKERS[id] : 'LOCKED', owned ? C.ink : C.slate); } setTextIfChanged(this.ui.albumCollected, 'COLLECTED  ' + stickerCount(p) + '/24   |   ALBUMS  ' + profile.albumsCompleted + '/4', C.ink); this.zone(45, 730, 300, 58, this.closeAlbum.bind(this)); }

  if (!Phaser || !kit) { root.__mr.state = bootState; return; }
  Game.phaser = new Phaser.Game({type: Phaser.AUTO, parent: 'game', backgroundColor: C.deep, scale: {mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H}, render: {antialias: true, roundPixels: false, powerPreference: 'high-performance', batchSize: 2048}, fps: {target: 60, min: 30}, scene: [PlayScene]});
  root.__MR_READY = true;
})(typeof window !== 'undefined' ? window : globalThis);
