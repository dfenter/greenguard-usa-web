/* Bastionworks / fleet F10.
 * Original procedural strategy art. Phaser is the renderer; GGKit owns the
 * lifecycle, pointer identity, saves, audio buses, pause, settings, and PWA.
 */
(function () {
  'use strict';

  var W = 390;
  var H = 844;
  var STEP = 1 / 60;
  var SAVE_VERSION = 7;
  var MAX_BUILDINGS = 40;
  var MAX_UNITS = 48;
  var MAX_PARTICLES = 96;
  var MAX_DAMAGE = 24;
  var MAX_TELEGRAPHS = 16;
  var MAX_SHOTS = 12;
  var TROOP_CAPS = [12, 14, 8, 7, 6];
  var TROOP_COSTS = [{ gold: 18, mist: 0 }, { gold: 0, mist: 16 }, { gold: 28, mist: 10 }, { gold: 10, mist: 24 }, { gold: 54, mist: 42 }];
  var BOARD = { x: 27, y: 142, cell: 42, cols: 8, rows: 8 };
  var TAU = Math.PI * 2;

  var C = {
    ink: 0x07111c, deep: 0x0b1826, panel: 0x102436, panel2: 0x173249,
    line: 0x36556d, text: 0xe8f3f6, muted: 0x9cb2bc, white: 0xffffff,
    player: 0x43c7f4, playerDeep: 0x3864e8, teal: 0x74e4c4,
    enemy: 0xff665c, enemyDeep: 0xb72e4d, amber: 0xe0a34a,
    bone: 0xd8c38c, moss: 0x788b5a, gold: 0xffd36d, mist: 0xa98cff,
    stone: 0x718092, wood: 0x9e6d4a, danger: 0xff7b72, green: 0x9af3c9
  };
  var CSS = {
    text: '#e8f3f6', muted: '#9cb2bc', player: '#43c7f4', teal: '#74e4c4',
    enemy: '#ff665c', amber: '#e0a34a', gold: '#ffd36d', mist: '#a98cff',
    bone: '#d8c38c', green: '#9af3c9', white: '#ffffff'
  };

  var SITES = [
    { key: 'starter', name: 'STARTER BASTION', terrain: 'SUNBAKED BRICK', landmark: 'WATCHTOWER', motif: 'tower', ground: '#4b3a2d', accent: C.amber, cache: { col: 6, row: 1 } },
    { key: 'ridge', name: 'FORTIFIED RIDGE CAMP', terrain: 'WIND-CUT RIDGE', landmark: 'SUNKEN GATE', motif: 'gate', ground: '#293945', accent: C.player, cache: { col: 1, row: 6 } },
    { key: 'yard', name: 'SPRAWLING LOG-YARD', terrain: 'CEDAR WORKYARD', landmark: 'LOG CRANE', motif: 'crane', ground: '#354332', accent: C.teal, cache: { col: 6, row: 6 } },
    { key: 'expanse', name: 'ENDLESS SIEGE EXPANSE', terrain: 'ASHLAND SHELF', landmark: 'ASHEN BEACON', motif: 'beacon', ground: '#3d3038', accent: C.enemy, cache: { col: 1, row: 1 } }
  ];

  var BUILDINGS = {
    core: { key: 'core', icon: '◇', label: 'CORE', costGold: 0, costMist: 0, max: 1, hp: 520, size: 2, color: C.player, power: 0, ability: { key: 'rally', label: 'RALLY', cooldown: 14 } },
    storehouse: { key: 'storehouse', icon: '▣', label: 'STORE', costGold: 0, costMist: 0, max: 1, hp: 220, size: 1, color: C.bone, power: 0, ability: { key: 'supply', label: 'SUPPLY', cooldown: 12 } },
    mine: { key: 'mine', icon: '✦', label: 'MINE', costGold: 55, costMist: 0, max: 3, hp: 105, size: 1, color: C.gold, power: 2, ability: { key: 'blast', label: 'BLAST', cooldown: 10 } },
    vat: { key: 'vat', icon: '◆', label: 'VAT', costGold: 0, costMist: 55, max: 3, hp: 105, size: 1, color: C.mist, power: 2, ability: { key: 'veil', label: 'VEIL', cooldown: 13 } },
    cannon: { key: 'cannon', icon: '◉', label: 'CANNON', costGold: 90, costMist: 25, max: 3, hp: 150, size: 1, color: C.amber, power: 7, ability: { key: 'salvo', label: 'SALVO', cooldown: 9 } },
    lookout: { key: 'lookout', icon: '⌃', label: 'LOOKOUT', costGold: 35, costMist: 65, max: 3, hp: 135, size: 1, color: C.teal, power: 5, ability: { key: 'mark', label: 'MARK', cooldown: 11 } },
    wall: { key: 'wall', icon: '▰', label: 'WALL', costGold: 18, costMist: 0, max: 40, hp: 185, size: 1, color: C.stone, power: 0, ability: { key: 'brace', label: 'BRACE', cooldown: 15 } }
  };

  var TROOPS = [
    { key: 'bruiser', icon: '◆', label: 'BRUISER', color: C.player, hp: 80, damage: 16, speed: 31, range: 18, role: 'melee' },
    { key: 'archer', icon: '⌁', label: 'ARCHER', color: C.teal, hp: 46, damage: 11, speed: 24, range: 112, role: 'ranged' },
    { key: 'breaker', icon: '▱', label: 'BREAKER', color: C.gold, hp: 56, damage: 37, speed: 29, range: 18, role: 'breaker' },
    { key: 'medic', icon: '+', label: 'MEDIC', color: C.white, hp: 50, damage: 0, speed: 25, range: 82, role: 'healer' },
    { key: 'giant', icon: '⬢', label: 'GIANT', color: C.mist, hp: 190, damage: 23, speed: 16, range: 22, role: 'giant' }
  ];

  function b(type, col, row, level) {
    return { type: type, col: col, row: row, level: level || 1 };
  }
  function clonePlan(items) {
    return (items || []).map(function (item) {
      return { type: item.type, col: item.col, row: item.row, level: item.level || 1 };
    });
  }
  function defaultLayout(siteIndex) {
    var layouts = [
      [b('core', 3, 3), b('storehouse', 2, 3), b('mine', 1, 1), b('vat', 6, 1), b('cannon', 1, 6), b('lookout', 6, 6), b('wall', 2, 2), b('wall', 5, 2), b('wall', 2, 5), b('wall', 5, 5)],
      [b('core', 3, 3), b('storehouse', 5, 3), b('mine', 1, 2), b('vat', 6, 2), b('cannon', 1, 5), b('lookout', 6, 6), b('wall', 2, 2), b('wall', 5, 2), b('wall', 2, 5), b('wall', 5, 5)],
      [b('core', 3, 3), b('storehouse', 2, 4), b('mine', 1, 1), b('vat', 5, 6), b('cannon', 1, 6), b('lookout', 6, 1), b('wall', 2, 2), b('wall', 5, 2), b('wall', 2, 5), b('wall', 5, 5)],
      [b('core', 3, 3), b('storehouse', 5, 4), b('mine', 2, 1), b('vat', 6, 6), b('cannon', 1, 2), b('lookout', 6, 5), b('wall', 2, 2), b('wall', 5, 2), b('wall', 2, 5), b('wall', 5, 5)]
    ];
    return clonePlan(layouts[siteIndex] || layouts[0]);
  }
  function makeRival(name, tier, site, lootGold, lootMist, strength, layout) {
    return { name: name, tier: tier, site: site, loot: [lootGold, lootMist], strength: strength, plan: layout };
  }
  var RIVALS = [
    makeRival('Rookfen', 'COPPER', 0, 230, 180, 1.00, [b('core', 3, 3), b('storehouse', 2, 3), b('mine', 1, 1), b('vat', 6, 1), b('cannon', 1, 6), b('wall', 2, 2), b('wall', 5, 2), b('wall', 2, 5), b('wall', 5, 5)]),
    makeRival('Brine Hollow', 'COPPER', 1, 280, 220, 1.08, [b('core', 3, 3), b('storehouse', 5, 3), b('mine', 1, 2), b('vat', 6, 2), b('cannon', 6, 6), b('lookout', 1, 6), b('wall', 2, 2), b('wall', 5, 2), b('wall', 2, 5), b('wall', 5, 5)]),
    makeRival('Cinderhook', 'IRON', 0, 340, 270, 1.16, [b('core', 3, 3), b('storehouse', 2, 3), b('mine', 1, 1), b('vat', 6, 1), b('cannon', 1, 2, 2), b('cannon', 6, 6, 2), b('wall', 2, 2), b('wall', 5, 2), b('wall', 2, 5), b('wall', 5, 5)]),
    makeRival('Mosswake', 'IRON', 2, 390, 310, 1.25, [b('core', 3, 3), b('storehouse', 5, 3), b('mine', 1, 1), b('vat', 6, 6), b('cannon', 1, 6, 2), b('lookout', 6, 1, 2), b('wall', 2, 2), b('wall', 5, 2), b('wall', 2, 5), b('wall', 5, 5)]),
    makeRival('Amber Crag', 'STEEL', 1, 455, 360, 1.34, [b('core', 3, 3), b('storehouse', 2, 4), b('mine', 1, 1), b('vat', 6, 6), b('cannon', 1, 2, 2), b('cannon', 6, 2, 2), b('lookout', 1, 6), b('wall', 2, 2, 2), b('wall', 5, 2, 2), b('wall', 2, 5, 2), b('wall', 5, 5, 2)]),
    makeRival('Wickerdeep', 'STEEL', 2, 520, 415, 1.44, [b('core', 3, 3), b('storehouse', 5, 4), b('mine', 1, 1), b('vat', 6, 6), b('cannon', 1, 2, 2), b('cannon', 6, 2, 2), b('lookout', 6, 5, 2), b('wall', 2, 2, 2), b('wall', 5, 2, 2), b('wall', 2, 5, 2), b('wall', 5, 5, 2)]),
    makeRival('Glass Mire', 'SILVER', 0, 600, 475, 1.55, [b('core', 3, 3, 2), b('storehouse', 2, 4, 2), b('mine', 1, 1, 2), b('vat', 6, 6, 2), b('cannon', 1, 2, 3), b('cannon', 6, 2, 3), b('lookout', 1, 6, 3), b('wall', 2, 2, 2), b('wall', 5, 2, 2), b('wall', 2, 5, 2), b('wall', 5, 5, 2)]),
    makeRival('Sable Narrows', 'SILVER', 1, 690, 540, 1.67, [b('core', 3, 3, 2), b('storehouse', 5, 4, 2), b('mine', 1, 1, 2), b('vat', 6, 6, 2), b('cannon', 1, 2, 3), b('cannon', 6, 2, 3), b('cannon', 1, 6, 3), b('wall', 2, 2, 2), b('wall', 5, 2, 2), b('wall', 2, 5, 2), b('wall', 5, 5, 2)]),
    makeRival('Fallow Crown', 'GOLD', 2, 790, 620, 1.80, [b('core', 3, 3, 3), b('storehouse', 2, 4, 2), b('mine', 1, 1, 2), b('vat', 6, 6, 2), b('cannon', 1, 2, 3), b('cannon', 6, 2, 3), b('cannon', 1, 6, 3), b('lookout', 6, 5, 3), b('wall', 2, 2, 3), b('wall', 5, 2, 3), b('wall', 2, 5, 3), b('wall', 5, 5, 3)]),
    makeRival('Oxblood Step', 'GOLD', 0, 900, 710, 1.94, [b('core', 3, 3, 3), b('storehouse', 5, 4, 3), b('mine', 1, 1, 2), b('vat', 6, 6, 2), b('cannon', 1, 2, 4), b('cannon', 6, 2, 4), b('cannon', 1, 6, 4), b('lookout', 6, 5, 4), b('wall', 2, 2, 3), b('wall', 5, 2, 3), b('wall', 2, 5, 3), b('wall', 5, 5, 3)]),
    makeRival('Night Orchard', 'PLATINUM', 1, 1020, 810, 2.10, [b('core', 3, 3, 3), b('storehouse', 2, 4, 3), b('mine', 1, 1, 3), b('vat', 6, 6, 3), b('cannon', 1, 2, 4), b('cannon', 6, 2, 4), b('cannon', 1, 6, 4), b('lookout', 6, 5, 4), b('wall', 2, 2, 3), b('wall', 5, 2, 3), b('wall', 2, 5, 3), b('wall', 5, 5, 3)]),
    makeRival('The Last Lantern', 'CROWN', 3, 1200, 980, 2.28, [b('core', 3, 3, 4), b('storehouse', 5, 4, 4), b('mine', 1, 1, 3), b('vat', 6, 6, 3), b('cannon', 1, 2, 5), b('cannon', 6, 2, 5), b('cannon', 1, 6, 5), b('cannon', 6, 6, 5), b('lookout', 3, 1, 5), b('wall', 2, 2, 4), b('wall', 5, 2, 4), b('wall', 2, 5, 4), b('wall', 5, 5, 4)])
  ];
  var SCENARIOS = [
    { key: 'thin-resources', name: 'THIN RESOURCES', site: 1, setup: '110G / 90M', gold: 110, mist: 90, requirement: 'OPEN', strength: 1.08, loot: [420, 340], plan: [b('core', 3, 3, 2), b('storehouse', 5, 3), b('cannon', 2, 2, 2), b('wall', 3, 2), b('wall', 2, 3), b('wall', 6, 3)] },
    { key: 'hardened-rival', name: 'HARDENED RIVAL', site: 2, setup: 'FORTIFIED', gold: 190, mist: 150, requirement: 'BRONZE 1', strength: 1.56, loot: [650, 520], plan: [b('core', 3, 3, 3), b('storehouse', 5, 3, 2), b('cannon', 2, 2, 3), b('cannon', 5, 5, 3), b('lookout', 6, 2, 3), b('wall', 3, 2, 3), b('wall', 2, 3, 3), b('wall', 6, 3, 3), b('wall', 6, 4, 3), b('wall', 3, 5, 2)] },
    { key: 'small-camp', name: 'SMALL CAMP', site: 0, setup: 'COMPACT', gold: 260, mist: 180, requirement: 'SILVER 2', strength: 1.32, loot: [820, 690], plan: [b('core', 3, 3, 2), b('storehouse', 5, 3, 2), b('mine', 2, 2, 2), b('vat', 5, 5, 2), b('cannon', 6, 2, 4), b('lookout', 1, 5, 4), b('wall', 2, 3, 2), b('wall', 6, 4, 2)] }
  ];

  var AUDIO = {
    buildThud: 'assets/audio/build-thud.mp3', troopMarch: 'assets/audio/troop-march.mp3',
    raidHorn: 'assets/audio/raid-horn.mp3', victoryFanfare: 'assets/audio/victory-fanfare.mp3',
    hit: 'assets/audio/hit.mp3', collapse: 'assets/audio/collapse.mp3', medal: 'assets/audio/medal.mp3',
    ability: 'assets/audio/medal.mp3', defeat: 'assets/audio/hit.mp3', waveWarn: 'assets/audio/raid-horn.mp3',
    commandMusic: 'assets/audio/troop-march.mp3', dangerMusic: 'assets/audio/raid-horn.mp3',
    victoryMusic: 'assets/audio/victory-fanfare.mp3'
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist(ax, ay, bx, by) { var dx = ax - bx; var dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
  function setTextIfChanged(obj, value) { if (obj && obj.text !== String(value)) obj.setText(String(value)); }
  function setColorIfChanged(obj, value) { if (obj && obj.__bwColor !== value) { obj.setColor(value); obj.__bwColor = value; } }
  function safeSite(index) { return SITES[index] || SITES[0]; }
  function safeBuilding(type) { return BUILDINGS[type] || BUILDINGS.wall; }
  function safeTroop(index) { return TROOPS[index] || TROOPS[0]; }
  function safeRival(index) { return RIVALS[index] || RIVALS[0]; }
  function safeScenario(index) { return SCENARIOS[index] || SCENARIOS[0]; }
  function numberIndex(value, length, fallback) { var n = Number(value); return Number.isInteger(n) && n >= 0 && n < length ? n : fallback; }
  function starText(value) { var n = clamp(Number(value) || 0, 0, 3); return n ? '★'.repeat(n) + '·'.repeat(3 - n) : '···'; }
  function medalName(value) { return value >= 3 ? 'GOLD' : value === 2 ? 'SILVER' : value === 1 ? 'BRONZE' : 'LOCKED'; }
  function cellPoint(col, row) { return { x: BOARD.x + col * BOARD.cell + BOARD.cell / 2, y: BOARD.y + row * BOARD.cell + BOARD.cell / 2 }; }
  function planCells(item) {
    var meta = safeBuilding(item.type);
    var cells = [];
    for (var y = 0; y < meta.size; y++) for (var x = 0; x < meta.size; x++) cells.push({ col: item.col + x, row: item.row + y });
    return cells;
  }
  function cellFromPoint(point) {
    if (point.x < BOARD.x || point.x >= BOARD.x + BOARD.cols * BOARD.cell || point.y < BOARD.y || point.y >= BOARD.y + BOARD.rows * BOARD.cell) return null;
    return { col: Math.floor((point.x - BOARD.x) / BOARD.cell), row: Math.floor((point.y - BOARD.y) / BOARD.cell) };
  }
  function eachOccupied(layout, fn, ignoreIndex) {
    (layout || []).forEach(function (item, index) {
      if (index === ignoreIndex) return;
      planCells(item).forEach(function (cell) { fn(cell.col, cell.row, item, index); });
    });
  }
  function buildingAt(layout, col, row) {
    var found = -1;
    eachOccupied(layout, function (x, y, item, index) { if (x === col && y === row && found < 0) found = index; });
    return found;
  }
  function validPlacement(layout, type, cell, ignoreIndex) {
    if (!cell) return false;
    var meta = safeBuilding(type);
    for (var y = 0; y < meta.size; y++) for (var x = 0; x < meta.size; x++) {
      var col = cell.col + x; var row = cell.row + y;
      if (col < 0 || row < 0 || col >= BOARD.cols || row >= BOARD.rows) return false;
      var occupied = -1;
      eachOccupied(layout, function (ox, oy, item, index) { if (ox === col && oy === row && occupied < 0) occupied = index; }, ignoreIndex);
      if (occupied >= 0) return false;
    }
    return true;
  }
  function defaultProfile() {
    return {
      v: SAVE_VERSION, gold: 520, mist: 420, trophies: 0,
      rivalMedals: Array.from({ length: 12 }, function () { return { clear: 0, noLoss: 0, efficiency: 0 }; }),
      scenarioMedals: [0, 0, 0], cacheFound: [false, false, false, false],
      layouts: [0, 1, 2, 3].map(function (i) { return defaultLayout(i); }),
      logs: [{ rival: 'Nettlepost', result: 'REPELLED', loss: 0, note: 'walls held' }],
      endlessWave: 1, endlessBest: 0, scenarioUnlocked: 1,
      troops: [8, 10, 4, 3, 4]
    };
  }
  function validArrayOfNumbers(value, length, max) {
    var ceiling = max == null ? 999999 : max;
    return Array.isArray(value) && value.length === length && value.every(function (n) { return Number.isInteger(n) && n >= 0 && n <= ceiling; });
  }
  function validPlan(items) {
    if (!Array.isArray(items) || items.length > MAX_BUILDINGS) return false;
    var occupied = {};
    var counts = {};
    var valid = items.every(function (item) {
      if (!item || typeof item.type !== 'string' || !BUILDINGS[item.type] || !Number.isInteger(item.col) || !Number.isInteger(item.row) || !Number.isInteger(item.level) || item.level < 1 || item.level > 5) return false;
      var meta = safeBuilding(item.type);
      counts[item.type] = (counts[item.type] || 0) + 1;
      if (counts[item.type] > meta.max) return false;
      for (var y = 0; y < meta.size; y++) for (var x = 0; x < meta.size; x++) {
        var col = item.col + x; var row = item.row + y; var key = col + ':' + row;
        if (col < 0 || row < 0 || col >= BOARD.cols || row >= BOARD.rows || occupied[key]) return false;
        occupied[key] = true;
      }
      return true;
    });
    return valid && counts.core === 1 && counts.storehouse === 1;
  }
  function validSave(value) {
    if (!value || typeof value !== 'object' || value.v !== SAVE_VERSION) return false;
    if (!Number.isInteger(value.gold) || value.gold < 0 || value.gold > 999999 || !Number.isInteger(value.mist) || value.mist < 0 || value.mist > 999999 || !Number.isInteger(value.trophies) || value.trophies < 0) return false;
    if (!Array.isArray(value.rivalMedals) || value.rivalMedals.length !== 12 || !value.rivalMedals.every(function (m) { return m && [m.clear, m.noLoss, m.efficiency].every(function (n) { return Number.isInteger(n) && n >= 0 && n <= 3; }); })) return false;
    if (!validArrayOfNumbers(value.scenarioMedals, 3, 3) || !Array.isArray(value.cacheFound) || value.cacheFound.length !== 4 || !value.cacheFound.every(function (v) { return typeof v === 'boolean'; })) return false;
    if (!Array.isArray(value.layouts) || value.layouts.length !== 4 || !value.layouts.every(validPlan)) return false;
    if (!Array.isArray(value.logs) || value.logs.length > 20 || !value.logs.every(function (log) {
      return log && typeof log.rival === 'string' && log.rival.length <= 24 && (log.result === 'CLEARED' || log.result === 'HELD' || log.result === 'REPELLED') && Number.isInteger(log.loss) && log.loss >= 0 && log.loss <= MAX_UNITS && typeof log.note === 'string' && log.note.length <= 28;
    }) || !validArrayOfNumbers(value.troops, 5, 99)) return false;
    return Number.isInteger(value.endlessWave) && value.endlessWave >= 1 && Number.isInteger(value.endlessBest) && value.endlessBest >= 0 && Number.isInteger(value.scenarioUnlocked) && value.scenarioUnlocked >= 1 && value.scenarioUnlocked <= 3;
  }

  var bootHook = typeof window !== 'undefined' && window.__bw ? window.__bw : {};
  var BOOT_STATE = bootHook.state || {};
  var Game = { phaser: null, scene: null };
  var kit = GGKit.create({
    slug: 'bastionworks', orientation: 'portrait', validateSave: validSave,
    onPause: function () { if (Game.scene) Game.scene.pausedByKit = true; },
    onResume: function () { if (Game.scene) Game.scene.pausedByKit = false; },
    onRestart: function () { if (Game.scene) Game.scene.resetProfile(); }
  });
  kit.audio.register(AUDIO);
  if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) kit.juice.enabled = false;
  var profileFallback = defaultProfile();
  var profile = kit.save.get(profileFallback);
  if (!validSave(profile)) profile = profileFallback;

  function readForce(name) {
    if (typeof window === 'undefined' || !window.__bw) return null;
    var h = window.__bw;
    if (h[name] !== undefined && h[name] !== null && h[name] !== '') return h[name];
    if (h.state && h.state[name] !== undefined && h.state[name] !== null && h.state[name] !== '') return h.state[name];
    if (BOOT_STATE && BOOT_STATE[name] !== undefined && BOOT_STATE[name] !== null && BOOT_STATE[name] !== '') return BOOT_STATE[name];
    return null;
  }
  function makeTexture(scene, key, draw) {
    if (scene.textures.exists(key)) return;
    var texture = scene.textures.createCanvas(key, W, H);
    var context = texture.getContext();
    draw(context);
    texture.refresh();
  }
  function drawTerrain(context, site, x, y, w, h, raid) {
    context.save();
    context.globalAlpha = raid ? 0.84 : 0.94;
    context.strokeStyle = site.motif === 'yard' ? 'rgba(213,190,142,.20)' : 'rgba(220,205,156,.18)';
    context.lineWidth = 1;
    for (var c = 0; c <= 8; c++) { context.beginPath(); context.moveTo(x + c * w / 8, y); context.lineTo(x + c * w / 8, y + h); context.stroke(); }
    for (var r = 0; r <= 8; r++) { context.beginPath(); context.moveTo(x, y + r * h / 8); context.lineTo(x + w, y + r * h / 8); context.stroke(); }
    context.globalAlpha = raid ? 0.38 : 0.62;
    context.fillStyle = site.accent === C.enemy ? '#bc4c54' : '#e0a34a';
    context.strokeStyle = 'rgba(216,195,140,.28)';
    if (site.motif === 'tower') {
      context.fillRect(x + 16, y + 18, 46, 116); context.fillRect(x + 8, y + 27, 62, 12);
      context.fillStyle = 'rgba(9,21,30,.82)'; context.fillRect(x + 29, y + 44, 20, 50);
      context.strokeRect(x + 20, y + 11, 38, 14);
    } else if (site.motif === 'gate') {
      context.fillRect(x + 126, y + 12, 84, 36); context.fillStyle = 'rgba(9,21,30,.84)'; context.fillRect(x + 140, y + 22, 56, 44); context.strokeRect(x + 140, y + 22, 56, 44);
      context.beginPath(); context.moveTo(x + 142, y + 23); context.lineTo(x + 196, y + 23); context.stroke();
    } else if (site.motif === 'crane') {
      context.fillStyle = 'rgba(12,24,30,.76)'; context.fillRect(x + 286, y + 13, 12, 124); context.strokeStyle = 'rgba(224,163,74,.45)'; context.beginPath(); context.moveTo(x + 292, y + 18); context.lineTo(x + 332, y + 47); context.lineTo(x + 292, y + 47); context.stroke(); context.strokeRect(x + 272, y + 100, 50, 25);
    } else {
      context.fillStyle = 'rgba(255,102,92,.28)'; context.fillRect(x + 145, y + 10, 48, 130); context.fillStyle = 'rgba(15,20,27,.78)'; context.fillRect(x + 162, y + 27, 15, 88); context.strokeStyle = 'rgba(255,102,92,.58)'; context.strokeRect(x + 155, y + 15, 29, 108);
    }
    context.globalAlpha = raid ? 0.18 : 0.34;
    context.strokeStyle = '#d8c38c';
    for (var i = 0; i < 26; i++) { var px = x + ((i * 67) % 320) + 6; var py = y + ((i * 43) % 320) + 9; context.beginPath(); context.moveTo(px, py); context.lineTo(px + 7, py + (i % 2 ? 3 : -2)); context.stroke(); }
    context.globalAlpha = raid ? 0.22 : 0.42;
    context.fillStyle = site.motif === 'yard' ? '#9a744a' : site.motif === 'gate' ? '#6d8192' : site.motif === 'beacon' ? '#8e4b5e' : '#9b6e45';
    for (var tile = 0; tile < 18; tile++) { var tx = x + 12 + ((tile * 83) % 300); var ty = y + 18 + ((tile * 59) % 294); context.beginPath(); context.moveTo(tx, ty); context.lineTo(tx + 14, ty + 4); context.lineTo(tx + 10, ty + 12); context.lineTo(tx - 3, ty + 8); context.closePath(); context.fill(); }
    context.globalAlpha = raid ? 0.3 : 0.55;
    context.strokeStyle = site.motif === 'tower' ? '#c99a55' : site.motif === 'gate' ? '#9db4bd' : site.motif === 'crane' ? '#b88b52' : '#c76867';
    context.lineWidth = 2;
    if (site.motif === 'tower') { context.beginPath(); context.moveTo(x + 76, y + 145); context.lineTo(x + 110, y + 124); context.lineTo(x + 136, y + 148); context.stroke(); }
    if (site.motif === 'gate') { context.beginPath(); context.moveTo(x + 32, y + 138); context.lineTo(x + 85, y + 124); context.lineTo(x + 115, y + 143); context.stroke(); }
    if (site.motif === 'crane') { context.beginPath(); context.moveTo(x + 212, y + 155); context.lineTo(x + 245, y + 126); context.lineTo(x + 274, y + 149); context.stroke(); }
    if (site.motif === 'beacon') { context.beginPath(); context.moveTo(x + 222, y + 148); context.lineTo(x + 240, y + 111); context.lineTo(x + 258, y + 148); context.stroke(); }
    context.restore();
  }
  function drawSiteBackground(context, site, raid) {
    var gradient = context.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, raid ? '#120f1b' : '#091825'); gradient.addColorStop(0.56, raid ? '#1b2029' : '#0e1c25'); gradient.addColorStop(1, '#07111c');
    context.fillStyle = gradient; context.fillRect(0, 0, W, H);
    context.fillStyle = raid ? '#100f1b' : '#0b1927'; context.fillRect(0, 0, W, 104);
    context.fillStyle = raid ? '#3c2834' : '#142a3c'; context.fillRect(0, 103, W, 2);
    context.fillStyle = '#0c1a25'; context.fillRect(17, 131, 356, 367); context.strokeStyle = raid ? '#6b4c56' : '#35556d'; context.lineWidth = 2; context.strokeRect(17, 131, 356, 367);
    context.fillStyle = site.ground; context.fillRect(22, 142, 336, 336); drawTerrain(context, site, 22, 142, 336, 336, raid);
    context.fillStyle = raid ? '#0b1621' : '#0b1927'; context.fillRect(0, 620, W, 224); context.strokeStyle = raid ? '#523746' : '#2d4a5e'; context.strokeRect(0, 620, W, 224);
    if (raid) { context.strokeStyle = '#a64b54'; context.lineWidth = 3; context.strokeRect(20, 139, 340, 342); }
  }
  function drawMenuBackground(context) {
    var gradient = context.createLinearGradient(0, 0, 0, H); gradient.addColorStop(0, '#091925'); gradient.addColorStop(1, '#07111c'); context.fillStyle = gradient; context.fillRect(0, 0, W, H);
    context.fillStyle = '#0b1927'; context.fillRect(0, 0, W, 104); context.fillStyle = '#142a3c'; context.fillRect(0, 103, W, 2);
    context.fillStyle = '#0d202d'; context.fillRect(17, 131, 356, 490); context.strokeStyle = '#35556d'; context.lineWidth = 2; context.strokeRect(17, 131, 356, 490);
    context.globalAlpha = .25;
    for (var i = 0; i < 14; i++) { context.fillStyle = i % 2 ? '#193c48' : '#1a2d3f'; context.fillRect(24 + i * 26, 144, 16, 460); }
    context.globalAlpha = 1; context.fillStyle = '#0b1927'; context.fillRect(0, 620, W, 224); context.strokeStyle = '#2d4a5e'; context.strokeRect(0, 620, W, 224);
  }

  class BastionworksScene extends Phaser.Scene {
    constructor() { super({ key: 'Bastionworks' }); }
    create() {
      var self = this;
      Game.scene = this;
      this.pausedByKit = false;
      this.state = { mode: 'base', site: 0, gold: profile.gold, mist: profile.mist, trophies: profile.trophies, troops: profile.troops.slice(), rivalsCleared: this.countCleared(), crown: this.countCleared() >= 12, selectedBuild: null, selectedBuilding: -1, selectedDefense: 0, hoverCell: { col: 3, row: 5 }, baseCursor: { col: 3, row: 5 }, keyboardMove: false, buildCooldown: 0, recruitClock: 0, tutorialStep: 0, proxyState: 'idle', proxyPulse: 0, simTime: 0, accumulator: 0, notice: null, banner: null, result: null, raid: null, forceMode: null, forceRival: null };
      this.pointerSessions = new Map();
      this.drags = new Map();
      this.drag = null;
      this.musicStarted = false;
      this.keyPrev = {};
      this.appliedForceToken = '';
      this.renderState = { buildings: [], units: [], damage: [], particleCursor: 0 };
      this.particles = { dust: [], sparks: [], trails: [], bursts: [] };
      this.damage = [];
      this.allocatePools();
      this.makeTextures();
      this.buildDisplay();
      this.setupInput();
      this.setBackground();
      this.showNotice('TAP A KIT, THEN AN OPEN SLOT', 3.5, true);
      this.syncHook();
      kit.registerPWA();
      kit.loader.progress(.62);
      kit.audio.preload(Object.keys(AUDIO)).then(function () {
        self.startMusic('commandMusic');
        kit.loader.progress(1);
        kit.loader.hide();
      });
    }
    countCleared() { return (profile.rivalMedals || []).filter(function (m) { return m && m.clear > 0; }).length; }
    allocatePools() {
      var systems = ['dust', 'sparks', 'trails', 'bursts'];
      var self = this;
      systems.forEach(function (name) { self.particles[name] = Array.from({ length: 24 }, function () { return { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: C.white, alpha: 1 }; }); });
      this.damage = Array.from({ length: MAX_DAMAGE }, function () { return { active: false, x: 0, y: 0, value: 0, life: 0, color: CSS.white }; });
    }
    makeTextures() {
      var self = this;
      SITES.forEach(function (site) { makeTexture(self, 'base-' + site.key, function (ctx) { drawSiteBackground(ctx, site, false); }); makeTexture(self, 'raid-' + site.key, function (ctx) { drawSiteBackground(ctx, site, true); }); });
      makeTexture(this, 'menu-bg', drawMenuBackground);
    }
    buildDisplay() {
      this.bg = this.add.image(W / 2, H / 2, 'base-starter').setOrigin(.5);
      this.decals = this.add.graphics();
      this.world = this.add.graphics();
      this.fx = this.add.graphics();
      this.uiLayer = this.add.graphics();
      this.ui = {};
      this.ui.title = this.makeText(18, 16, 20, CSS.text, 0, 0, '700');
      this.ui.settings = this.makeText(368, 19, 19, CSS.gold, .5, .5, '700');
      this.ui.gold = this.makeText(244, 18, 17, CSS.gold, 0, 0, '700');
      this.ui.mist = this.makeText(317, 18, 17, CSS.mist, 0, 0, '700');
      this.ui.trophies = this.makeText(18, 84, 14, CSS.muted, 0, .5, '700');
      this.ui.tabB = this.makeText(184, 84, 14, CSS.text, .5, .5, '700');
      this.ui.tabL = this.makeText(244, 84, 14, CSS.text, .5, .5, '700');
      this.ui.tabD = this.makeText(304, 84, 14, CSS.text, .5, .5, '700');
      this.ui.hint = this.makeText(195, 118, 14, CSS.muted, .5, .5, '700');
      this.ui.site = this.makeText(18, 120, 13, CSS.muted, 0, .5, '700');
      this.ui.listTitle = this.makeText(28, 151, 24, CSS.text, 0, 0, '700');
      this.ui.listSub = this.makeText(28, 182, 14, CSS.muted, 0, 0, '400');
      this.ui.notice = this.makeText(195, 602, 14, CSS.text, .5, .5, '700');
      this.ui.bannerTitle = this.makeText(195, 282, 27, CSS.text, .5, .5, '700');
      this.ui.bannerSub = this.makeText(195, 324, 14, CSS.muted, .5, .5, '700');
      this.ui.resultTitle = this.makeText(195, 228, 26, CSS.text, .5, .5, '700');
      this.ui.resultSub = this.makeText(195, 267, 14, CSS.muted, .5, .5, '700');
      this.ui.resultMedals = [this.makeText(195, 332, 16, CSS.gold, .5, .5, '700'), this.makeText(195, 368, 16, CSS.teal, .5, .5, '700'), this.makeText(195, 404, 16, CSS.amber, .5, .5, '700')];
      this.ui.resultAction = this.makeText(195, 520, 16, CSS.text, .5, .5, '700');
      this.ui.resultRetry = this.makeText(195, 588, 16, CSS.text, .5, .5, '700');
      this.ui.ability = this.makeText(195, 602, 13, CSS.text, .5, .5, '700');
      this.ui.defense = this.makeText(18, 136, 12, CSS.player, 0, .5, '700');
      this.ui.cardLabels = [];
      for (var i = 0; i < 5; i++) this.ui.cardLabels.push({ icon: this.makeText(16 + i * 72 + 32, 684, 22, CSS.text, .5, .5, '700'), label: this.makeText(16 + i * 72 + 32, 728, 14, CSS.text, .5, .5, '700'), cost: this.makeText(16 + i * 72 + 32, 753, 13, CSS.muted, .5, .5, '700') });
      this.ui.menuActions = [this.makeText(103, 728, 15, CSS.text, .5, .5, '700'), this.makeText(287, 728, 15, CSS.text, .5, .5, '700')];
      this.ui.legend = this.makeText(28, 594, 14, CSS.muted, 0, .5, '400');
      this.ui.ladder = { name: [], sub: [] };
      for (var l = 0; l < 12; l++) { this.ui.ladder.name.push(this.makeText(0, 0, 14, CSS.text, 0, 0, '700')); this.ui.ladder.sub.push(this.makeText(0, 0, 13, CSS.muted, 0, 0, '700')); }
      this.ui.scenario = { title: [], site: [], setup: [], medal: [] };
      for (var s = 0; s < 3; s++) { this.ui.scenario.title.push(this.makeText(0, 0, 17, CSS.text, 0, 0, '700')); this.ui.scenario.site.push(this.makeText(0, 0, 14, CSS.teal, 0, 0, '700')); this.ui.scenario.setup.push(this.makeText(0, 0, 14, CSS.muted, 0, 0, '700')); this.ui.scenario.medal.push(this.makeText(0, 0, 14, CSS.gold, 0, 0, '700')); }
      this.ui.endless = [this.makeText(0, 0, 30, CSS.enemy, 0, 0, '700'), this.makeText(0, 0, 16, CSS.gold, 0, 0, '700'), this.makeText(0, 0, 14, CSS.muted, 0, 0, '400'), this.makeText(0, 0, 14, CSS.muted, 0, 0, '400')];
      this.ui.log = { name: [], result: [], note: [] };
      for (var d = 0; d < 7; d++) { this.ui.log.name.push(this.makeText(0, 0, 14, CSS.text, 0, 0, '700')); this.ui.log.result.push(this.makeText(0, 0, 13, CSS.muted, 0, 0, '700')); this.ui.log.note.push(this.makeText(0, 0, 13, CSS.muted, 0, 0, '400')); }
      this.damageTexts = [];
      for (var damageIndex = 0; damageIndex < MAX_DAMAGE; damageIndex++) this.damageTexts.push(this.makeText(0, 0, 14, CSS.white, .5, .5, '700'));
      this.ui.hideAll = function () { Object.keys(this).forEach(function (key) { var obj = this[key]; if (Array.isArray(obj)) obj.forEach(function (a) { if (a && a.setVisible) a.setVisible(false); }); else if (obj && obj.setVisible) obj.setVisible(false); }, this); };
    }
    makeText(x, y, size, color, ox, oy, weight) {
      var obj = this.add.text(x, y, '', { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: size + 'px', fontStyle: weight === '700' ? 'bold' : 'normal', color: color, resolution: 2 });
      obj.setOrigin(ox == null ? 0 : ox, oy == null ? 0 : oy); obj.__bwColor = color; return obj;
    }
    setupInput() {
      this.input.on('pointerdown', this.pointerDown, this);
      this.input.on('pointermove', this.pointerMove, this);
      this.input.on('pointerup', this.pointerUp, this);
      this.input.on('pointerupoutside', this.pointerUp, this);
      this.input.on('pointercancel', this.pointerUp, this);
    }
    pointerPoint(pointer) {
      var rect = this.game.canvas.getBoundingClientRect(); var event = pointer.event || {};
      if (event.clientX != null && rect.width > 0) return { x: clamp((event.clientX - rect.left) * W / rect.width, 0, W), y: clamp((event.clientY - rect.top) * H / rect.height, 0, H) };
      return { x: clamp(pointer.x || 0, 0, W), y: clamp(pointer.y || 0, 0, H) };
    }
    claimPointer(pointer, zone) {
      var id = pointer.id != null ? pointer.id : 0; var point = this.pointerPoint(pointer); var event = pointer.event || {};
      var live = kit.input.pointers.get(id);
      if (!live) { live = { x: event.clientX == null ? point.x : event.clientX, y: event.clientY == null ? point.y : event.clientY, startX: event.clientX == null ? point.x : event.clientX, startY: event.clientY == null ? point.y : event.clientY, downAt: 0, zone: zone }; kit.input.pointers.set(id, live); }
      live.zone = zone; live.x = event.clientX == null ? point.x : event.clientX; live.y = event.clientY == null ? point.y : event.clientY; return id;
    }
    pointerDown(pointer) {
      if (kit.paused || this.pausedByKit) return;
      if (!this.musicStarted) this.startMusic(this.state.mode === 'raid' ? 'dangerMusic' : 'commandMusic');
      var point = this.pointerPoint(pointer); var zone = this.controlAt(point); var id = this.claimPointer(pointer, zone);
      var session = { id: id, start: point, point: point, zone: zone, moved: false };
      this.pointerSessions.set(id, session);
      this.drag = null;
      if (zone && zone.kind === 'settings') { this.openSettings(); return; }
      if (this.state.mode === 'base') {
        if (zone && zone.kind === 'kit') { var kitType = ['mine', 'vat', 'cannon', 'lookout', 'wall'][zone.index] || 'wall'; this.state.selectedBuild = zone.index; this.state.selectedBuilding = -1; this.state.hoverCell = null; this.showNotice(safeBuilding(kitType).label + ' KIT ARMED', 1.1, false); return; }
        if (zone && zone.kind === 'ability') { this.activateAbility(zone.index); return; }
        if (zone && zone.kind === 'building') { var held = this.currentLayout()[zone.index]; if (held) { var drag = { index: zone.index, origin: { col: held.col, row: held.row } }; this.drags.set(id, drag); this.drag = drag; } this.state.selectedBuilding = zone.index; this.state.selectedBuild = null; }
      } else if (this.state.mode === 'raid' && zone && zone.kind === 'troop') {
        this.state.raid.selectedSlot = zone.index; this.showNotice(safeTroop(zone.index).label + ' x' + this.state.raid.available[zone.index], 1.1, false);
      } else if (this.state.mode === 'raid' && zone && zone.kind === 'defense') {
        this.state.raid.selectedDefense = zone.index;
        this.showNotice(this.abilityName(zone.index), .9, false);
      }
    }
    pointerMove(pointer) {
      var id = pointer.id != null ? pointer.id : 0; var session = this.pointerSessions.get(id); if (kit.paused || !session) return;
      var point = this.pointerPoint(pointer); session.point = point;
      var dx = point.x - session.start.x; var dy = point.y - session.start.y; session.moved = session.moved || dx * dx + dy * dy > 64;
      var live = kit.input.pointers.get(id); if (live) { live.x = pointer.event && pointer.event.clientX != null ? pointer.event.clientX : point.x; live.y = pointer.event && pointer.event.clientY != null ? pointer.event.clientY : point.y; }
      if (this.state.mode === 'base') { this.state.hoverCell = cellFromPoint(point); var drag = this.drags.get(id); if (drag) { drag.hover = this.state.hoverCell; this.drag = drag; } }
      if (this.state.mode === 'raid' && this.isBoardPoint(point)) this.state.raid.cursor = { x: point.x, y: point.y };
    }
    pointerUp(pointer) {
      var id = pointer.id != null ? pointer.id : 0; var session = this.pointerSessions.get(id); if (!session) return;
      var point = this.pointerPoint(pointer); var drag = this.drags.get(id); this.pointerSessions.delete(id); this.drags.delete(id);
      if (this.state.mode === 'base') this.finishBasePointer(session, point, drag);
      else if (this.state.mode === 'raid') this.finishRaidPointer(session, point);
      else if (this.state.mode === 'result') this.finishResultPointer(point);
      else this.finishMenuPointer(point);
      this.drag = null; this.state.hoverCell = null;
    }
    controlAt(point) {
      if (point.x >= 344 && point.y < 52) return { kind: 'settings' };
      if (point.y >= 62 && point.y < 112) {
        if (point.x >= 160 && point.x < 218) return { kind: 'tab', mode: 'base' };
        if (point.x >= 218 && point.x < 278) return { kind: 'tab', mode: 'ladder' };
        if (point.x >= 278 && point.x < 350) return { kind: 'tab', mode: 'log' };
      }
      if ((this.state.mode === 'base' || this.state.mode === 'raid') && point.y >= 600 && point.y < 642 && point.x >= 10 && point.x < 380) return { kind: 'ability', index: this.state.mode === 'raid' ? this.state.raid.selectedDefense : this.state.selectedBuilding };
      if (this.state.mode === 'base' && point.y >= 650 && point.y < 790 && point.x >= 10 && point.x < 380) return { kind: 'kit', index: clamp(Math.floor((point.x - 10) / 72), 0, 4) };
      if (this.state.mode === 'raid' && point.y >= 650 && point.y < 790 && point.x >= 10 && point.x < 380) return { kind: 'troop', index: clamp(Math.floor((point.x - 10) / 72), 0, 4) };
      if (this.state.mode === 'result' && point.y >= 490 && point.y < 554) return { kind: 'resultAction' };
      return this.worldControlAt(point);
    }
    worldControlAt(point) {
      if (this.state.mode === 'base') { var layout = this.currentLayout(); var cell = cellFromPoint(point); if (cell) { var index = buildingAt(layout, cell.col, cell.row); if (index >= 0) return { kind: 'building', index: index }; } }
      if (this.state.mode === 'raid' && this.state.raid) {
        var homeCell = cellFromPoint(point); if (homeCell) { var homeIndex = buildingAt(this.state.raid.home, homeCell.col, homeCell.row); if (homeIndex >= 0) return { kind: 'defense', index: homeIndex }; }
      }
      return null;
    }
    finishBasePointer(session, point, drag) {
      if (session.zone && session.zone.kind === 'tab') { this.go(session.zone.mode); return; }
      if (session.zone && session.zone.kind === 'kit') { this.state.selectedBuild = session.zone.index; return; }
      if (session.zone && session.zone.kind === 'ability') { this.activateAbility(session.zone.index); return; }
      var cell = cellFromPoint(point); var layout = this.currentLayout();
      if (drag) {
        if (session.moved) { if (validPlacement(layout, layout[drag.index].type, cell, drag.index)) this.moveBuilding(drag.index, cell); else this.showNotice('SLOT BLOCKED / DRAG AGAIN', 1.1, false); }
        else this.upgradeBuilding(drag.index);
        return;
      }
      if (cell && this.state.selectedBuild != null && this.state.selectedBuild >= 0) { this.placeBuilding(cell); return; }
      var site = safeSite(this.state.site); if (cell && !profile.cacheFound[this.state.site] && cell.col === site.cache.col && cell.row === site.cache.row) this.collectCache();
    }
    finishRaidPointer(session, point) {
      if (session.zone && session.zone.kind === 'tab') { this.showNotice('RAID IN PROGRESS / HOLD THE CORE', 1.2, false); return; }
      if (session.zone && session.zone.kind === 'ability') { this.activateAbility(this.state.raid.selectedDefense); return; }
      if (session.zone && session.zone.kind === 'troop') { this.state.raid.selectedSlot = session.zone.index; return; }
      if (this.isBoardPoint(point)) { this.state.raid.cursor = { x: point.x, y: point.y }; if (this.isRaidRim(point)) this.deploySelected(point); }
    }
    finishResultPointer(point) {
      if (point.y >= 490 && point.y < 554) { this.go(this.state.result.kind === 'scenario' ? 'scenario' : this.state.result.kind === 'endless' ? 'endless' : 'ladder'); return; }
      if (point.y >= 555 && point.y < 620) { this.startRaid(this.state.result.kind, this.state.result.index); }
    }
    finishMenuPointer(point) {
      if (point.y >= 62 && point.y < 112 && point.x >= 160 && point.x < 218) { this.go('base'); return; }
      if (point.y >= 62 && point.y < 112 && point.x >= 218 && point.x < 278) { this.go('ladder'); return; }
      if (point.y >= 62 && point.y < 112 && point.x >= 278 && point.x < 350) { this.go('log'); return; }
      if (this.state.mode === 'ladder') {
        if (point.y >= 207 && point.y < 567) { var col = point.x < 195 ? 0 : 1; var row = Math.floor((point.y - 207) / 60); var index = row + (col ? 6 : 0); if (index < 12) this.tryLadder(index); return; }
        if (point.y >= 690 && point.y < 760) { this.go('scenario'); return; }
        if (point.y >= 760 && point.y < 830) { this.go('endless'); return; }
      } else if (this.state.mode === 'scenario') {
        if (point.y >= 207 && point.y < 633) { this.tryScenario(clamp(Math.floor((point.y - 207) / 142), 0, 2)); return; }
        if (point.y >= 690 && point.y < 760) { this.go('endless'); return; }
      } else if (this.state.mode === 'endless' && point.y >= 690 && point.y < 790) { this.startRaid('endless', 0); }
    }
    isBoardPoint(point) { return point.x >= BOARD.x - 16 && point.x <= BOARD.x + BOARD.cols * BOARD.cell + 16 && point.y >= BOARD.y - 16 && point.y <= BOARD.y + BOARD.rows * BOARD.cell + 16; }
    isRaidRim(point) { var left = BOARD.x; var right = BOARD.x + BOARD.cols * BOARD.cell; var top = BOARD.y; var bottom = BOARD.y + BOARD.rows * BOARD.cell; return point.x <= left + 28 || point.x >= right - 28 || point.y <= top + 28 || point.y >= bottom - 28; }
    currentLayout() { return profile.layouts[this.state.site] || (profile.layouts[this.state.site] = defaultLayout(this.state.site)); }
    go(mode) {
      if (this.state.mode === 'raid' && this.state.raid && !this.state.raid.ended) { this.showNotice('RAID IN PROGRESS / HOLD THE CORE', 1.2, false); return; }
      var safeMode = ['base', 'ladder', 'log', 'scenario', 'endless'].indexOf(mode) >= 0 ? mode : 'base';
      this.state.mode = safeMode; this.state.result = null; this.state.raid = null; this.state.banner = null; this.state.selectedBuild = null; this.state.selectedBuilding = -1; this.state.selectedDefense = 0; this.setBackground(); this.startMusic('commandMusic'); this.showNotice(safeMode === 'base' ? 'TAP A KIT, THEN AN OPEN SLOT' : safeMode === 'ladder' ? 'OPEN RIVALS UNLOCK ONE BY ONE' : safeMode === 'log' ? 'DEFENSE LOG / YOUR LAST RUNS' : safeMode === 'scenario' ? 'SCENARIOS UNLOCK BY MEDAL' : 'ENDLESS / EACH CLEAR HARDENS THE NEXT WAVE', 2.4, true); this.syncHook();
    }
    tryLadder(index) {
      var rival = safeRival(index); var open = index === 0 || (profile.rivalMedals[index - 1] && profile.rivalMedals[index - 1].clear > 0); if (!open) { this.showNotice('CLEAR THE PRIOR RIVAL FIRST', 1.1, false); return; } this.startRaid('ladder', index);
    }
    tryScenario(index) {
      var open = index === 0 || profile.scenarioMedals[index - 1] >= 1; if (!open) { this.showNotice('EARN THE NEXT MEDAL FIRST', 1.1, false); return; } this.startRaid('scenario', index);
    }
    livePlan(items, strength, enemy) {
      return clonePlan(items).map(function (item) {
        var meta = safeBuilding(item.type); var hp = meta.hp * (item.level || 1) * (enemy ? strength : 1);
        return { type: item.type, col: item.col, row: item.row, level: item.level || 1, hp: hp, maxHp: hp, alive: true, cooldown: enemy ? 1.2 : 0, abilityCd: 0, collapse: 0, hurt: 0 };
      });
    }
    startRaid(kind, index) {
      var data = kind === 'scenario' ? safeScenario(index) : kind === 'endless' ? { name: 'ENDLESS SIEGE', tier: 'WAVE', site: 3, loot: [720 + profile.endlessWave * 75, 600 + profile.endlessWave * 60], strength: 1 + profile.endlessWave * 0.12, plan: [b('core', 3, 3, 2 + Math.min(3, Math.floor(profile.endlessWave / 3))), b('storehouse', 5, 3), b('cannon', 1, 2, 2 + Math.min(3, Math.floor(profile.endlessWave / 4))), b('cannon', 6, 5, 2 + Math.min(3, Math.floor(profile.endlessWave / 4))), b('lookout', 6, 2), b('wall', 2, 2), b('wall', 5, 2), b('wall', 2, 5), b('wall', 5, 5)] } : safeRival(index);
      var homeLayout = clonePlan(this.currentLayout()); var siteIndex = numberIndex(data.site, SITES.length, 0); var enemy = this.livePlan(data.plan, data.strength, true); var home = this.livePlan(homeLayout, 1, false); var available = (kind === 'scenario' ? [8, 10, 4, 3, 4] : profile.troops).slice();
      this.state.mode = 'raid'; this.state.site = siteIndex; this.state.result = null; this.state.selectedBuild = null; this.state.selectedBuilding = -1; this.state.selectedDefense = 0; this.state.troops = available.slice(); this.state.raid = { kind: kind, index: numberIndex(index, kind === 'scenario' ? SCENARIOS.length : RIVALS.length, 0), name: data.name, site: siteIndex, home: home, enemy: enemy, enemyUnits: [], available: available, selectedSlot: 0, selectedDefense: 0, cursor: { x: BOARD.x + 18, y: BOARD.y + BOARD.cell * 3.4 }, units: [], losses: 0, deployed: 0, deployedValue: 0, wave: 0, waveTimer: 2.2, waveStrength: data.strength, telegraphs: [], shots: [], homeStartHp: home.reduce(function (sum, item) { return sum + item.maxHp; }, 0), startHp: enemy.reduce(function (sum, item) { return sum + item.maxHp; }, 0), totalDamage: 0, resolve: 0, win: false, ended: false, collapse: 0, dangerMusic: false };
      this.setBackground(); this.startMusic('dangerMusic'); this.showBoundary(kind === 'endless' ? 'SIEGE WAVE ' + profile.endlessWave : data.name, 'DEFEND YOUR CORE / TAP THE RAID RIM', 1.8); this.advanceTutorial(3, 'RIM DROP  ·  WATCH THE CORE BAR'); kit.audio.sfx('raidHorn', { volume: .8 }); this.syncHook();
    }
    placeBuilding(cell) {
      var types = ['mine', 'vat', 'cannon', 'lookout', 'wall']; var type = types[this.state.selectedBuild] || types[0]; var meta = safeBuilding(type); var layout = this.currentLayout(); var count = layout.filter(function (item) { return item.type === type; }).length;
      if (this.state.buildCooldown > 0) { this.showNotice('BUILD QUEUE ACTIVE', 1.1, false); return; }
      if (count >= meta.max) { this.showNotice('KIT LIMIT REACHED', 1.1, false); return; }
      if (!validPlacement(layout, type, cell)) { this.showNotice('OPEN SLOT NEEDED / GHOST IS RED', 1.1, false); return; }
      if (this.state.gold < meta.costGold || this.state.mist < meta.costMist) { this.showNotice('NEED MORE LOOT', 1.1, false); return; }
      this.state.gold -= meta.costGold; this.state.mist -= meta.costMist; layout.push({ type: type, col: cell.col, row: cell.row, level: 1 }); this.state.buildCooldown = .8; this.state.selectedBuild = null; this.state.selectedBuilding = layout.length - 1; this.state.proxyState = 'resolve'; this.state.proxyPulse = .35; this.renderState.buildings[layout.length - 1] = { pulse: .75, hurt: 0, collapse: 0 }; this.emit('dust', cellPoint(cell.col, cell.row), meta.color, 14); this.emit('sparks', cellPoint(cell.col, cell.row), C.white, 6); this.showNotice(meta.label + ' PLACED', .9, false); this.advanceTutorial(1, 'TAP THAT STRUCTURE TO UPGRADE'); kit.audio.sfx('buildThud', { volume: .8 }); this.saveProfile();
    }
    moveBuilding(index, cell) {
      var layout = this.currentLayout(); if (this.state.buildCooldown > 0) { this.showNotice('BUILD QUEUE ACTIVE', 1.1, false); return; } if (!layout[index] || !validPlacement(layout, layout[index].type, cell, index)) { this.showNotice('SLOT BLOCKED / STRUCTURE SAFE', 1.1, false); return; } layout[index].col = cell.col; layout[index].row = cell.row; this.state.buildCooldown = .45; this.state.selectedBuilding = index; this.state.proxyState = 'command'; this.state.proxyPulse = .25; this.emit('dust', cellPoint(cell.col, cell.row), safeBuilding(layout[index].type).color, 10); this.showNotice('POSITION HELD', .9, false); kit.audio.sfx('buildThud', { volume: .55 }); this.saveProfile();
    }
    upgradeBuilding(index) {
      var layout = this.currentLayout(); var item = layout[index]; if (!item) return; var meta = safeBuilding(item.type); if (this.state.buildCooldown > 0) { this.showNotice('BUILD QUEUE ACTIVE', 1.1, false); return; } if (item.type === 'core' || item.type === 'storehouse') { this.showNotice('COMMAND STRUCTURE / NO UPGRADE', 1.1, false); return; } if (item.level >= 5) { this.showNotice('MAX LEVEL', 1.1, false); return; }
      var goldCost = Math.round(meta.costGold * (.65 + item.level * .35) + 18 * item.level); var mistCost = Math.round(meta.costMist * (.65 + item.level * .35) + 12 * item.level); if (this.state.gold < goldCost || this.state.mist < mistCost) { this.showNotice('UPGRADE ' + goldCost + 'G ' + mistCost + 'M', 1.1, false); return; }
      this.state.gold -= goldCost; this.state.mist -= mistCost; item.level += 1; this.state.buildCooldown = 1.25; this.state.proxyState = 'resolve'; this.state.proxyPulse = .3; if (!this.renderState.buildings[index]) this.renderState.buildings[index] = { pulse: 0, hurt: 0, collapse: 0 }; this.renderState.buildings[index].pulse = .85; this.emit('sparks', cellPoint(item.col, item.row), meta.color, 14); this.showNotice(meta.label + ' LEVEL ' + item.level, .9, false); this.advanceTutorial(2, 'F ABILITY IN RAID  ·  TAP LADDER NEXT'); kit.audio.sfx('buildThud', { volume: .85, rate: 1.05 }); this.saveProfile();
    }
    collectCache() {
      if (profile.cacheFound[this.state.site]) return; profile.cacheFound[this.state.site] = true; this.state.gold += 320; this.state.mist += 280; this.emit('bursts', cellPoint(safeSite(this.state.site).cache.col, safeSite(this.state.site).cache.row), C.amber, 20); this.showNotice('CACHE FOUND  +320G  +280M', 1.2, false); kit.audio.sfx('medal', { volume: .75 }); this.saveProfile();
    }
    abilityName(index) {
      var raid = this.state.raid; var item = raid ? raid.home[index] : this.currentLayout()[index]; if (!item) return 'SELECT A BASTION'; var meta = safeBuilding(item.type); var ready = raid ? Math.max(0, item.abilityCd || 0) : 0; return meta.ability.label + (ready ? '  ' + ready.toFixed(1) + 'S' : '  READY');
    }
    activateAbility(index) {
      var raid = this.state.raid; if (!raid || raid.ended) { this.showNotice('ABILITIES ARM DURING A RAID', 1.1, false); return; }
      var item = raid.home[index]; if (!item || !item.alive) { this.showNotice('SELECT A LIVE BASTION', 1.1, false); return; }
      var meta = safeBuilding(item.type); if (!meta.ability || item.abilityCd > 0) { this.showNotice(this.abilityName(index), 1.1, false); return; }
      var point = cellPoint(item.col, item.row); var target = this.nearestEnemyUnit(raid, point); item.abilityCd = meta.ability.cooldown; item.abilityFlash = .8;
      if (meta.ability.key === 'rally') { raid.home.forEach(function (building) { if (building.alive) building.hp = Math.min(building.maxHp, building.hp + 34); }); raid.units.forEach(function (unit) { if (unit.alive) unit.hp = Math.min(unit.maxHp, unit.hp + 22); }); }
      else if (meta.ability.key === 'supply') { var supplySlot = clamp(raid.selectedSlot, 0, TROOPS.length - 1); raid.available[supplySlot] = Math.min(TROOP_CAPS[supplySlot], raid.available[supplySlot] + 1); }
      else if (meta.ability.key === 'blast') { if (target) this.damageEnemyUnit(target, 42, raid); else this.damageEnemyStructure(this.nearestEnemyStructureTo(point, raid), 58, raid); }
      else if (meta.ability.key === 'veil') { raid.enemySlow = Math.max(raid.enemySlow || 0, 5); raid.shots.forEach(function (shot) { shot.delay += .5; }); }
      else if (meta.ability.key === 'salvo') { this.damageEnemyStructure(this.nearestEnemyStructureTo(point, raid), 86, raid); }
      else if (meta.ability.key === 'mark') { if (target) { target.mark = 5; this.damageEnemyUnit(target, 24, raid); } }
      else if (meta.ability.key === 'brace') { item.hp = Math.min(item.maxHp, item.hp + 95); item.braced = 5; }
      this.state.troops = raid.available.slice(); this.emit('bursts', point, meta.color, kit.juice.enabled ? 16 : 4); this.showNotice(meta.ability.label + ' ACTIVE', 1.1, false); this.advanceTutorial(5, 'RED TELEGRAPHS WARN THE NEXT ATTACK'); kit.audio.sfx('ability', { volume: .7 }); this.saveProfile();
    }
    updateEconomy() {
      if (this.state.mode !== 'base' || this.state.result) return;
      var layout = this.currentLayout(); var goldRate = 0; var mistRate = 0;
      layout.forEach(function (item) { if (item.type === 'mine') goldRate += safeBuilding(item.type).power * (item.level || 1); if (item.type === 'vat') mistRate += safeBuilding(item.type).power * (item.level || 1); });
      this.state.gold = clamp(this.state.gold + goldRate * STEP * .55, 0, 999999); this.state.mist = clamp(this.state.mist + mistRate * STEP * .55, 0, 999999);
      this.state.recruitClock += STEP;
      if (this.state.recruitClock >= 6) { this.state.recruitClock = 0; var troops = this.state.troops || profile.troops; for (var i = 0; i < TROOPS.length; i++) { var cost = TROOP_COSTS[i]; if (troops[i] < TROOP_CAPS[i] && this.state.gold >= cost.gold && this.state.mist >= cost.mist) { this.state.gold -= cost.gold; this.state.mist -= cost.mist; troops[i] += 1; this.state.troops = troops; this.showNotice(safeTroop(i).label + ' RECRUITED', .9, false); break; } } }
    }
    deploySelected(point) {
      var raid = this.state.raid; if (!raid || raid.ended) return; var slot = clamp(raid.selectedSlot, 0, TROOPS.length - 1); var troop = safeTroop(slot); if (!raid.available[slot]) { this.showNotice('NO ' + troop.label + 'S READY', 1.1, false); return; } if (raid.units.length >= MAX_UNITS) { this.showNotice('FIELD FULL', 1.1, false); return; }
      var inwardX = point.x <= BOARD.x + 28 ? point.x + 10 : point.x >= BOARD.x + BOARD.cols * BOARD.cell - 28 ? point.x - 10 : point.x; var inwardY = point.y <= BOARD.y + 28 ? point.y + 10 : point.y >= BOARD.y + BOARD.rows * BOARD.cell - 28 ? point.y - 10 : point.y; var unit = { slot: slot, x: clamp(inwardX, BOARD.x + 8, BOARD.x + BOARD.cols * BOARD.cell - 8), y: clamp(inwardY, BOARD.y + 8, BOARD.y + BOARD.rows * BOARD.cell - 8), hp: troop.hp, maxHp: troop.hp, alive: true, cooldown: .15, state: 'move', phase: raid.deployed * .43, target: -1 };
      raid.units.push(unit); raid.available[slot] -= 1; raid.deployed += 1; raid.deployedValue += troop.hp; this.state.troops = raid.available.slice(); this.state.proxyState = 'command'; this.state.proxyPulse = .2; this.advanceTutorial(4, 'SELECT A HOME STRUCTURE  ·  F USES ITS ABILITY'); this.emit('trails', { x: unit.x, y: unit.y }, troop.color, 5); kit.audio.sfx('troopMarch', { volume: .48, rate: .92 + slot * .05 }); this.saveProfile();
    }
    nearestStructure(unit, raid, preferWall) {
      var best = -1; var bestDistance = Infinity;
      raid.enemy.forEach(function (item, index) { if (!item.alive) return; if (preferWall && item.type !== 'wall' && raid.enemy.some(function (other) { return other.alive && other.type === 'wall'; })) return; var point = cellPoint(item.col, item.row); var d = dist(unit.x, unit.y, point.x, point.y); if (d < bestDistance) { bestDistance = d; best = index; } });
      return best;
    }
    nearestFriend(unit, raid) {
      var best = null; raid.units.forEach(function (other) { if (!other.alive || other === unit || other.hp >= other.maxHp * .88) return; if (!best || other.hp / other.maxHp < best.hp / best.maxHp) best = other; }); return best;
    }
    nearestEnemyUnit(raid, point) {
      var best = null; var nearest = Infinity; raid.enemyUnits.forEach(function (unit) { var d = dist(unit.x, unit.y, point.x, point.y); if (unit.alive && d < nearest) { nearest = d; best = unit; } }); return best;
    }
    nearestEnemyStructureTo(point, raid) {
      var best = null; var nearest = Infinity; raid.enemy.forEach(function (item) { if (!item.alive) return; var p = cellPoint(item.col, item.row); var d = dist(p.x, p.y, point.x, point.y); if (d < nearest) { nearest = d; best = item; } }); return best;
    }
    damageEnemyUnit(unit, amount, raid) {
      if (!unit || !unit.alive) return; unit.hp -= amount; unit.state = 'hurt'; raid.totalDamage += amount; this.spawnDamage(unit.x, unit.y - 14, amount, CSS.gold); if (unit.hp <= 0) this.destroyEnemyUnit(unit, raid);
    }
    damageEnemyStructure(item, amount, raid) {
      if (!item || !item.alive) return; item.hp -= amount; item.hurt = .8; raid.totalDamage += amount; var point = cellPoint(item.col, item.row); this.spawnDamage(point.x, point.y - 16, amount, CSS.gold); if (item.hp <= 0) this.destroyEnemy(item, point, raid);
    }
    enemyCore(raid) { for (var i = 0; i < raid.enemy.length; i++) if (raid.enemy[i].type === 'core') return raid.enemy[i]; return null; }
    homeCore(raid) { for (var i = 0; i < raid.home.length; i++) if (raid.home[i].type === 'core') return raid.home[i]; return null; }
    spawnDamage(x, y, value, color) { for (var i = 0; i < this.damage.length; i++) if (!this.damage[i].active) { var d = this.damage[i]; d.active = true; d.x = x; d.y = y; d.value = Math.max(1, Math.round(value)); d.life = .75; d.color = color; return; } }
    emit(system, point, color, amount) {
      if (!kit.juice.enabled) return;
      var pool = this.particles[system] || this.particles.sparks; var made = 0;
      for (var i = 0; i < pool.length && made < Math.min(amount || 4, 20); i++) { var particle = pool[(this.renderState.particleCursor + i) % pool.length]; if (particle.active) continue; particle.active = true; particle.x = point.x; particle.y = point.y; var angle = (i * 2.399 + this.state.simTime * 2) % TAU; var speed = system === 'trails' ? 32 : system === 'bursts' ? 42 : 22; particle.vx = Math.cos(angle) * speed; particle.vy = Math.sin(angle) * speed; particle.maxLife = system === 'bursts' ? .65 : .4 + (i % 3) * .08; particle.life = particle.maxLife; particle.size = system === 'bursts' ? 3 + i % 3 : 2 + i % 2; particle.color = color || C.white; particle.alpha = 1; made += 1; }
      this.renderState.particleCursor = (this.renderState.particleCursor + made) % pool.length;
    }
    updateParticles() {
      if (!kit.juice.enabled) { Object.keys(this.particles).forEach(function (system) { this.particles[system].forEach(function (particle) { particle.active = false; }, this); }, this); this.damage.forEach(function (d) { d.active = false; }); return; }
      var self = this; Object.keys(this.particles).forEach(function (system) { self.particles[system].forEach(function (particle) { if (!particle.active) return; particle.life -= STEP; particle.x += particle.vx * STEP; particle.y += particle.vy * STEP; particle.vx *= .97; particle.vy *= .97; particle.alpha = clamp(particle.life / particle.maxLife, 0, 1); if (particle.life <= 0) particle.active = false; }); });
      this.damage.forEach(function (d) { if (!d.active) return; d.life -= STEP; d.y -= 12 * STEP; if (d.life <= 0) d.active = false; });
    }
    updateRaid() {
      var raid = this.state.raid; if (!raid) return;
      if (raid.resolve > 0) { raid.resolve -= STEP; raid.collapse = Math.min(1, raid.collapse + STEP * .8); if (raid.resolve <= 0) this.finishRaid(raid.win); return; }
      var self = this;
      raid.enemySlow = Math.max(0, (raid.enemySlow || 0) - STEP); raid.waveTimer -= STEP;
      raid.home.forEach(function (building) { building.abilityCd = Math.max(0, (building.abilityCd || 0) - STEP); building.abilityFlash = Math.max(0, (building.abilityFlash || 0) - STEP); building.hurt = Math.max(0, (building.hurt || 0) - STEP * 3); building.collapse = Math.max(0, (building.collapse || 0) - STEP * 1.6); });
      raid.enemy.forEach(function (building) { building.cooldown = Math.max(0, (building.cooldown || 0) - STEP); building.hurt = Math.max(0, (building.hurt || 0) - STEP * 3); building.collapse = Math.max(0, (building.collapse || 0) - STEP * 1.6); });
      this.updateTelegraphs(raid); this.resolveShots(raid);
      if (raid.waveTimer <= 0 && raid.wave < 8) this.spawnEnemyWave(raid);
      raid.units.forEach(function (unit) {
        if (!unit.alive) return; var troop = safeTroop(unit.slot); if (unit.cooldown > 0) unit.cooldown -= STEP;
        if (troop.role === 'healer') {
          var friend = self.nearestFriend(unit, raid); if (friend) { var fd = dist(unit.x, unit.y, friend.x, friend.y); if (fd > troop.range) { self.moveUnitPath(unit, friend.x, friend.y, troop.speed, self.blockedCells(raid.enemy, -1)); unit.state = 'move'; } else { friend.hp = Math.min(friend.maxHp, friend.hp + 7 * STEP); unit.state = 'attack'; } } else unit.state = 'idle'; return;
        }
        var targetIndex = self.nearestStructure(unit, raid, troop.role === 'breaker'); if (targetIndex < 0) return; var target = raid.enemy[targetIndex]; var targetPoint = cellPoint(target.col, target.row); var range = troop.range + safeBuilding(target.type).size * 8;
        if (dist(unit.x, unit.y, targetPoint.x, targetPoint.y) > range) { self.moveUnitPath(unit, targetPoint.x, targetPoint.y, troop.speed, self.blockedCells(raid.enemy, targetIndex)); unit.state = 'move'; }
        else if (unit.cooldown <= 0) { unit.state = 'attack'; var damage = troop.damage * (troop.role === 'breaker' && target.type === 'wall' ? 2.2 : 1) * (1 + (unit.slot * .025)); self.damageEnemyStructure(target, damage, raid); unit.cooldown = troop.role === 'ranged' ? .72 : troop.role === 'breaker' ? 1.08 : .86; self.emit('sparks', targetPoint, troop.color, 3); kit.audio.sfx('hit', { volume: .16 }); }
      });
      raid.enemyUnits.forEach(function (unit) {
        if (!unit.alive) return; if (unit.cooldown > 0) unit.cooldown -= STEP;
        var target = self.nearestHomeStructure(unit, raid); if (!target) { unit.state = 'idle'; return; }
        var targetPoint = cellPoint(target.col, target.row); var range = unit.range + safeBuilding(target.type).size * 8;
        if (dist(unit.x, unit.y, targetPoint.x, targetPoint.y) > range) { self.moveUnitPath(unit, targetPoint.x, targetPoint.y, unit.speed * (raid.enemySlow > 0 ? .56 : 1), self.blockedCells(raid.home, raid.home.indexOf(target))); unit.state = 'move'; }
        else if (unit.cooldown <= 0) { unit.state = 'attack'; self.damageHomeStructure(target, unit.damage, raid); unit.cooldown = unit.role === 'crusher' ? 1.35 : .82; self.emit('sparks', targetPoint, C.enemy, 3); kit.audio.sfx('hit', { volume: .18 }); }
      });
      this.updateHomeDefenses(raid); this.updateEnemyDefenses(raid);
      var enemyCore = this.enemyCore(raid); var homeCore = this.homeCore(raid);
      if (enemyCore && !enemyCore.alive && !raid.win) { raid.win = true; raid.resolve = 1.35; raid.collapse = .1; this.emit('bursts', cellPoint(enemyCore.col + .5, enemyCore.row + .5), C.enemy, 22); kit.audio.stopMusic(280); this.startMusic('victoryMusic'); kit.audio.sfx('collapse', { volume: .85 }); kit.juice.hitStop(90); kit.juice.shake(4, 130); }
      else if (homeCore && !homeCore.alive && !raid.win) { raid.win = false; raid.resolve = 1.35; raid.collapse = .1; kit.audio.stopMusic(280); kit.audio.sfx('collapse', { volume: .85 }); kit.juice.shake(4, 130); }
    }
    blockedCells(layout, ignoreIndex) {
      var blocked = {}; (layout || []).forEach(function (item, index) { if (index === ignoreIndex || !item.alive) return; planCells(item).forEach(function (cell) { blocked[cell.col + ':' + cell.row] = true; }); }); return blocked;
    }
    pathFor(start, target, blocked) {
      var from = cellFromPoint(start) || { col: 0, row: 0 }; var to = cellFromPoint(target) || { col: 3, row: 3 }; var queue = [{ col: from.col, row: from.row }]; var seen = {}; var parent = {}; var startKey = from.col + ':' + from.row; var endKey = to.col + ':' + to.row; seen[startKey] = true;
      var dirs = [{ col: 1, row: 0 }, { col: -1, row: 0 }, { col: 0, row: 1 }, { col: 0, row: -1 }];
      while (queue.length) { var current = queue.shift(); var currentKey = current.col + ':' + current.row; if (currentKey === endKey) break; dirs.forEach(function (dir) { var col = current.col + dir.col; var row = current.row + dir.row; var key = col + ':' + row; if (col < 0 || row < 0 || col >= BOARD.cols || row >= BOARD.rows || seen[key] || (blocked[key] && key !== endKey)) return; seen[key] = true; parent[key] = currentKey; queue.push({ col: col, row: row }); }); }
      if (!seen[endKey]) return [];
      var cells = []; var key = endKey; while (key !== startKey) { var bits = key.split(':'); cells.unshift({ col: Number(bits[0]), row: Number(bits[1]) }); key = parent[key]; } return cells.map(function (cell) { return cellPoint(cell.col, cell.row); });
    }
    moveUnitPath(unit, x, y, speed, blocked) {
      var targetKey = Math.floor(x / BOARD.cell) + ':' + Math.floor(y / BOARD.cell); if (unit.pathTarget !== targetKey || !unit.path || !unit.path.length) { unit.pathTarget = targetKey; unit.path = this.pathFor({ x: unit.x, y: unit.y }, { x: x, y: y }, blocked); }
      var next = unit.path && unit.path[0]; if (!next) { this.moveUnit(unit, x, y, speed); return; }
      if (dist(unit.x, unit.y, next.x, next.y) < 5) unit.path.shift(); this.moveUnit(unit, next.x, next.y, speed);
    }
    nearestHomeStructure(unit, raid) {
      var best = null; var bestDistance = Infinity; raid.home.forEach(function (item) { if (!item.alive) return; var point = cellPoint(item.col, item.row); var d = dist(unit.x, unit.y, point.x, point.y); if (item.type === 'core') d -= 28; if (d < bestDistance) { bestDistance = d; best = item; } }); return best;
    }
    spawnEnemyWave(raid) {
      raid.wave += 1; raid.waveTimer = Math.max(7, 13 - raid.wave * .55); var count = Math.min(5, 1 + Math.floor((raid.wave + 1) / 2)); var strength = raid.waveStrength * (1 + raid.wave * .1); var self = this;
      for (var i = 0; i < count && raid.enemyUnits.length < MAX_UNITS; i++) { var side = (raid.wave + i) % 4; var point = side === 0 ? { x: BOARD.x + 8, y: BOARD.y + 30 + (i % 4) * 78 } : side === 1 ? { x: BOARD.x + BOARD.cols * BOARD.cell - 8, y: BOARD.y + 48 + (i % 4) * 72 } : side === 2 ? { x: BOARD.x + 48 + (i % 4) * 72, y: BOARD.y + 8 } : { x: BOARD.x + 64 + (i % 4) * 68, y: BOARD.y + BOARD.rows * BOARD.cell - 8 }; var crusher = (raid.wave + i) % 4 === 0; var hp = (crusher ? 110 : 58) * strength; raid.enemyUnits.push({ kind: 'enemy', role: crusher ? 'crusher' : 'raider', x: point.x, y: point.y, hp: hp, maxHp: hp, alive: true, cooldown: .5 + i * .12, speed: crusher ? 15 : 24, range: crusher ? 22 : 18, damage: (crusher ? 17 : 9) * strength, state: 'spawn', phase: i * .6, path: [], pathTarget: '' }); self.addTelegraph(raid, point, C.enemy, .72, crusher ? 18 : 13); }
      kit.audio.sfx('waveWarn', { volume: .55 }); this.showNotice('WAVE ' + raid.wave + ' / THREAT ON THE RIM', 1.1, false); this.advanceTutorial(6, 'WAVE INBOUND  ·  PROTECT THE HOME CORE'); if (raid.wave >= 3 && !raid.dangerMusic) { raid.dangerMusic = true; this.startMusic('dangerMusic'); }
    }
    addTelegraph(raid, point, color, life, radius, from) { if (raid.telegraphs.length >= MAX_TELEGRAPHS) raid.telegraphs.shift(); raid.telegraphs.push({ x: point.x, y: point.y, color: color, life: life, maxLife: life, radius: radius || 15, from: from || null }); }
    queueShot(raid, source, target, damage, color, enemy) { if (raid.shots.length >= MAX_SHOTS) raid.shots.shift(); var targetPoint = target.x != null ? { x: target.x, y: target.y } : cellPoint(target.col, target.row); this.addTelegraph(raid, targetPoint, color, .34, enemy ? 20 : 14, source); raid.shots.push({ source: source, target: target, damage: damage, color: color, enemy: !!enemy, delay: .34 }); }
    updateTelegraphs(raid) { raid.telegraphs.forEach(function (telegraph) { telegraph.life -= STEP; }); raid.telegraphs = raid.telegraphs.filter(function (telegraph) { return telegraph.life > 0; }); }
    resolveShots(raid) {
      var self = this; raid.shots.forEach(function (shot) { shot.delay -= STEP; if (shot.delay > 0) return; shot.done = true; if (!shot.target || !shot.target.alive) return; if (shot.target.kind === 'enemy') self.damageEnemyUnit(shot.target, shot.damage, raid); else if (shot.target.type) self.damageHomeStructure(shot.target, shot.damage, raid); else { shot.target.hp -= shot.damage; shot.target.state = 'hurt'; self.spawnDamage(shot.target.x, shot.target.y - 15, shot.damage, CSS.enemy); if (shot.target.hp <= 0) self.defeatUnit(shot.target, raid); } }); raid.shots = raid.shots.filter(function (shot) { return !shot.done; });
    }
    updateHomeDefenses(raid) {
      var self = this; raid.home.forEach(function (building) { if (!building.alive || (building.type !== 'cannon' && building.type !== 'lookout')) return; if (building.cooldown > 0) return; var source = cellPoint(building.col, building.row); var target = self.nearestEnemyUnit(raid, source); if (!target || dist(source.x, source.y, target.x, target.y) > 210) return; var damage = (building.type === 'cannon' ? 14 : 8) * building.level; building.cooldown = building.type === 'cannon' ? 1.12 : .84; self.queueShot(raid, source, target, damage, C.player, false); self.emit('trails', source, C.player, 3); });
    }
    updateEnemyDefenses(raid) {
      var self = this; raid.enemy.forEach(function (building) { if (!building.alive || (building.type !== 'cannon' && building.type !== 'lookout') || building.cooldown > 0) return; var source = cellPoint(building.col, building.row); var target = null; var nearest = Infinity; raid.units.forEach(function (unit) { if (!unit.alive) return; var d = dist(source.x, source.y, unit.x, unit.y); if (d < nearest && d < 205) { nearest = d; target = unit; } }); if (!target) return; var damage = (building.type === 'cannon' ? 10 : 6) * building.level * (raid.kind === 'endless' ? 1 + profile.endlessWave * .06 : 1); building.cooldown = building.type === 'cannon' ? 1.18 : .92; self.queueShot(raid, source, target, damage, C.enemy, true); self.emit('trails', source, C.enemy, 3); });
    }
    damageHomeStructure(target, amount, raid) { if (!target || !target.alive) return; var damage = target.braced ? amount * .45 : amount; target.hp -= damage; target.hurt = .8; this.spawnDamage(cellPoint(target.col, target.row).x, cellPoint(target.col, target.row).y - 16, damage, CSS.enemy); if (target.hp <= 0) this.destroyHome(target, raid); }
    destroyHome(target, raid) { target.hp = 0; target.alive = false; target.collapse = kit.juice.enabled ? 1 : 0; this.emit(target.type === 'wall' ? 'sparks' : 'bursts', cellPoint(target.col, target.row), target.type === 'wall' ? C.stone : C.enemy, target.type === 'wall' ? 8 : 14); kit.audio.sfx(target.type === 'core' ? 'collapse' : 'hit', { volume: target.type === 'core' ? .7 : .22 }); }
    defeatUnit(unit, raid) { if (!unit.alive) return; unit.hp = 0; unit.alive = false; unit.state = 'defeat'; raid.losses += 1; this.emit('bursts', { x: unit.x, y: unit.y }, C.enemy, 8); kit.audio.sfx('defeat', { volume: .28 }); }
    destroyEnemyUnit(unit, raid) { if (!unit || !unit.alive) return; unit.hp = 0; unit.alive = false; unit.state = 'defeat'; this.emit('bursts', { x: unit.x, y: unit.y }, C.player, 8); }
    moveUnit(unit, x, y, speed) { var dx = x - unit.x; var dy = y - unit.y; var length = Math.sqrt(dx * dx + dy * dy) || 1; var travel = Math.min(length, speed * STEP); unit.x += dx / length * travel; unit.y += dy / length * travel; }
    destroyEnemy(target, point, raid) { target.hp = 0; target.alive = false; target.collapse = kit.juice.enabled ? 1 : 0; this.emit(target.type === 'wall' ? 'sparks' : 'bursts', point, target.type === 'wall' ? C.stone : C.amber, target.type === 'wall' ? 8 : 14); kit.juice.hitStop(target.type === 'core' ? 100 : 55); kit.juice.shake(target.type === 'core' ? 4 : 2, target.type === 'core' ? 120 : 70); kit.audio.sfx(target.type === 'core' ? 'collapse' : 'hit', { volume: target.type === 'core' ? .7 : .24 }); }
    medalData(raid, win) {
      if (!win) return { clear: 0, noLoss: 0, efficiency: 0, overall: 0 };
      var lossMedal = raid.losses === 0 ? 3 : raid.losses <= 2 ? 2 : 1; var ratio = raid.startHp ? raid.totalDamage / raid.startHp : 1; var efficiency = ratio <= .55 ? 3 : ratio <= .82 ? 2 : 1; var clear = raid.losses === 0 && efficiency === 3 ? 3 : raid.losses <= 2 && efficiency >= 2 ? 2 : 1; return { clear: clear, noLoss: lossMedal, efficiency: efficiency, overall: Math.min(3, Math.max(clear, lossMedal, efficiency)) };
    }
    finishRaid(win) {
      var raid = this.state.raid; if (!raid || raid.ended) return; raid.ended = true; var medal = this.medalData(raid, win); var potential = raid.kind === 'scenario' ? safeScenario(raid.index).loot : raid.kind === 'endless' ? [720 + profile.endlessWave * 75, 600 + profile.endlessWave * 60] : safeRival(raid.index).loot; var rewardGold = win ? Math.round(potential[0] * (1 + medal.efficiency * .06)) : 70; var rewardMist = win ? Math.round(potential[1] * (1 + medal.efficiency * .06)) : 55; this.state.gold += rewardGold; this.state.mist += rewardMist;
      if (raid.kind === 'ladder') { var old = profile.rivalMedals[raid.index] || { clear: 0, noLoss: 0, efficiency: 0 }; profile.rivalMedals[raid.index] = { clear: Math.max(old.clear, medal.clear), noLoss: Math.max(old.noLoss, medal.noLoss), efficiency: Math.max(old.efficiency, medal.efficiency) }; this.state.rivalsCleared = this.countCleared(); this.state.crown = this.state.rivalsCleared >= 12; this.state.trophies += win ? 4 + raid.index : 0; }
      if (raid.kind === 'scenario') { profile.scenarioMedals[raid.index] = Math.max(profile.scenarioMedals[raid.index] || 0, medal.overall); if (medal.overall >= 1 && raid.index + 1 < 3) profile.scenarioUnlocked = Math.max(profile.scenarioUnlocked, raid.index + 2); }
      if (raid.kind === 'endless' && win) { profile.endlessWave += 1; profile.endlessBest = Math.max(profile.endlessBest, profile.endlessWave - 1); }
      if (raid.kind !== 'scenario') profile.troops = raid.available.slice(); this.state.troops = profile.troops.slice(); this.state.result = { kind: raid.kind, index: raid.index, win: win, name: raid.name, rewardGold: rewardGold, rewardMist: rewardMist, medal: medal, losses: raid.losses, crown: this.state.crown, wave: raid.kind === 'endless' ? Math.max(1, profile.endlessWave - (win ? 1 : 0)) : raid.wave, age: 0 }; this.state.mode = 'result'; this.state.banner = null; this.state.site = raid.site; this.addLog(raid.name, win ? 'CLEARED' : 'HELD', raid.losses, win ? medalName(medal.overall).toLowerCase() + ' haul' : 'troops spent'); this.saveProfile(); this.setBackground(); kit.audio.stopMusic(250); kit.audio.sfx(win ? 'victoryFanfare' : 'collapse', { volume: .8 }); this.syncHook();
    }
    addLog(rival, result, loss, note) { profile.logs.unshift({ rival: String(rival).slice(0, 24), result: result, loss: Math.max(0, Math.round(loss || 0)), note: String(note).slice(0, 28) }); profile.logs = profile.logs.slice(0, 20); }
    advanceTutorial(step, text) { if (this.state.tutorialStep >= step) return; this.state.tutorialStep = step; this.showNotice(text, 3.2, true); }
    showNotice(text, life, coach) { this.state.notice = { text: String(text).slice(0, 44), life: life || 1, coach: !!coach }; }
    showBoundary(title, subtitle, life) { this.state.banner = { title: String(title).slice(0, 30), subtitle: String(subtitle || '').slice(0, 42), life: life || 1.4, age: 0 }; this.state.notice = null; }
    saveProfile() { profile.gold = Math.max(0, Math.round(this.state.gold)); profile.mist = Math.max(0, Math.round(this.state.mist)); profile.trophies = Math.max(0, Math.round(this.state.trophies)); if (this.state.troops && !(this.state.mode === 'raid' && this.state.raid && this.state.raid.kind === 'scenario')) profile.troops = this.state.troops.slice(); kit.save.set(profile); }
    startMusic(name) { if (this.currentMusic === name) return; this.currentMusic = name; this.musicStarted = true; kit.audio.music(name, 450); }
    openSettings() {
      this.pointerSessions.clear(); this.drags.clear();
      kit.openSettings([function (box) {
        var music = document.createElement('label'); music.style.cssText = 'font:inherit;font-size:16px;color:#e8eef4;display:flex;align-items:center;gap:12px;min-width:min(70vw,280px);'; music.textContent = 'Music volume';
        var musicInput = document.createElement('input'); musicInput.type = 'range'; musicInput.min = '0'; musicInput.max = '1'; musicInput.step = '.05'; musicInput.value = String(kit.audio.prefs.music); musicInput.setAttribute('aria-label', 'Music volume'); musicInput.addEventListener('input', function () { kit.audio.setMusicVolume(Number(musicInput.value)); }); music.appendChild(musicInput); box.appendChild(music);
        var sfx = document.createElement('label'); sfx.style.cssText = music.style.cssText; sfx.textContent = 'SFX volume';
        var sfxInput = document.createElement('input'); sfxInput.type = 'range'; sfxInput.min = '0'; sfxInput.max = '1'; sfxInput.step = '.05'; sfxInput.value = String(kit.audio.prefs.sfx); sfxInput.setAttribute('aria-label', 'SFX volume'); sfxInput.addEventListener('input', function () { kit.audio.setSfxVolume(Number(sfxInput.value)); }); sfx.appendChild(sfxInput); box.appendChild(sfx);
        var full = document.createElement('button'); full.type = 'button'; full.textContent = 'Fullscreen'; full.style.cssText = 'font:inherit;font-size:16px;color:#e8eef4;background:#1b2733;border:1px solid #2e3e4e;border-radius:10px;padding:12px 18px;min-width:min(70vw,280px);'; full.addEventListener('click', function () { kit.requestFullscreen(); }); box.appendChild(full);
      }]);
    }
    pollGamepad() {
      if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
      var pads = navigator.getGamepads(); var pad = null; for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { pad = pads[i]; break; }
      if (!pad) return; var pressed = function (index) { return !!(pad.buttons[index] && pad.buttons[index].pressed); }; var edge = function (index) { var key = 'b' + index; var now = pressed(index); var was = !!this.padPrev[key]; this.padPrev[key] = now; return now && !was; }.bind(this);
      var ax = Math.abs(pad.axes[0] || 0) > .25 ? pad.axes[0] : 0; var ay = Math.abs(pad.axes[1] || 0) > .25 ? pad.axes[1] : 0;
      if (this.state.mode === 'raid' && this.state.raid) { this.state.raid.cursor.x = clamp(this.state.raid.cursor.x + ax * 90 * STEP, BOARD.x + 8, BOARD.x + BOARD.cols * BOARD.cell - 8); this.state.raid.cursor.y = clamp(this.state.raid.cursor.y + ay * 90 * STEP, BOARD.y + 8, BOARD.y + BOARD.rows * BOARD.cell - 8); if (edge(0)) this.deploySelected(this.state.raid.cursor); if (edge(1)) this.activateAbility(this.state.raid.selectedDefense); if (edge(4)) this.state.raid.selectedSlot = Math.max(0, this.state.raid.selectedSlot - 1); if (edge(5)) this.state.raid.selectedSlot = Math.min(4, this.state.raid.selectedSlot + 1); }
      else if (this.state.mode === 'base') { var cursor = this.state.baseCursor; cursor.col = clamp(cursor.col + (ax > 0 ? 1 : ax < 0 ? -1 : 0), 0, BOARD.cols - 1); cursor.row = clamp(cursor.row + (ay > 0 ? 1 : ay < 0 ? -1 : 0), 0, BOARD.rows - 1); this.state.hoverCell = cursor; if (edge(0)) { if (this.state.selectedBuild != null) this.placeBuilding(cursor); else if (this.state.selectedBuilding >= 0) this.upgradeBuilding(this.state.selectedBuilding); } if (edge(1)) this.activateAbility(this.state.selectedBuilding); }
      if (edge(9)) this.openSettings();
    }
    resetProfile() { profile = defaultProfile(); this.state.mode = 'base'; this.state.raid = null; this.state.site = 0; this.state.gold = profile.gold; this.state.mist = profile.mist; this.state.trophies = profile.trophies; this.state.troops = profile.troops.slice(); this.state.rivalsCleared = 0; this.state.crown = false; this.state.buildCooldown = 0; this.state.recruitClock = 0; this.go('base'); this.saveProfile(); }
    keyPressed(code) { return kit.input.keyDown(code) && !this.keyPrev[code]; }
    handleKeys() {
      if (this.keyPressed('KeyO')) this.openSettings();
      if (this.state.mode !== 'raid') { if (this.keyPressed('KeyB')) this.go('base'); else if (this.keyPressed('KeyL')) this.go('ladder'); else if (this.keyPressed('KeyD')) this.go('log'); }
      if (this.state.mode === 'base') {
        if (this.keyPressed('Digit1')) this.state.selectedBuild = 0; if (this.keyPressed('Digit2')) this.state.selectedBuild = 1; if (this.keyPressed('Digit3')) this.state.selectedBuild = 2; if (this.keyPressed('Digit4')) this.state.selectedBuild = 3; if (this.keyPressed('Digit5')) this.state.selectedBuild = 4;
        var baseDelta = 42; if (kit.input.keyDown('ArrowLeft')) this.state.baseCursor.col = clamp(this.state.baseCursor.col - 1, 0, BOARD.cols - 1); if (kit.input.keyDown('ArrowRight')) this.state.baseCursor.col = clamp(this.state.baseCursor.col + 1, 0, BOARD.cols - 1); if (kit.input.keyDown('ArrowUp')) this.state.baseCursor.row = clamp(this.state.baseCursor.row - 1, 0, BOARD.rows - 1); if (kit.input.keyDown('ArrowDown')) this.state.baseCursor.row = clamp(this.state.baseCursor.row + 1, 0, BOARD.rows - 1); this.state.hoverCell = this.state.baseCursor;
        if (this.keyPressed('KeyM')) { this.state.keyboardMove = !this.state.keyboardMove; this.showNotice(this.state.keyboardMove ? 'MOVE MODE / ARROWS THEN SPACE' : 'BUILD MODE', 1.1, false); }
        if (this.keyPressed('KeyQ') || this.keyPressed('KeyE')) { var structures = this.currentLayout(); var next = this.state.selectedBuilding < 0 ? 0 : this.state.selectedBuilding + (this.keyPressed('KeyE') ? 1 : -1); this.state.selectedBuilding = (next + structures.length) % structures.length; this.state.selectedBuild = null; this.state.baseCursor = { col: structures[this.state.selectedBuilding].col, row: structures[this.state.selectedBuilding].row }; }
        if (this.keyPressed('KeyF')) this.activateAbility(this.state.selectedBuilding);
        if (this.keyPressed('Space')) { if (this.state.keyboardMove && this.state.selectedBuilding >= 0) this.moveBuilding(this.state.selectedBuilding, this.state.baseCursor); else if (this.state.selectedBuild != null) this.placeBuilding(this.state.baseCursor); else if (this.state.selectedBuilding >= 0) this.upgradeBuilding(this.state.selectedBuilding); }
        return;
      }
      var raid = this.state.raid; if (this.state.mode !== 'raid' || !raid) return;
      if (this.keyPressed('Digit1')) raid.selectedSlot = 0; if (this.keyPressed('Digit2')) raid.selectedSlot = 1; if (this.keyPressed('Digit3')) raid.selectedSlot = 2; if (this.keyPressed('Digit4')) raid.selectedSlot = 3; if (this.keyPressed('Digit5')) raid.selectedSlot = 4;
      var delta = 42; if (kit.input.keyDown('ArrowLeft')) raid.cursor.x -= delta * STEP * 2; if (kit.input.keyDown('ArrowRight')) raid.cursor.x += delta * STEP * 2; if (kit.input.keyDown('ArrowUp')) raid.cursor.y -= delta * STEP * 2; if (kit.input.keyDown('ArrowDown')) raid.cursor.y += delta * STEP * 2; raid.cursor.x = clamp(raid.cursor.x, BOARD.x + 8, BOARD.x + BOARD.cols * BOARD.cell - 8); raid.cursor.y = clamp(raid.cursor.y, BOARD.y + 8, BOARD.y + BOARD.rows * BOARD.cell - 8); if (this.keyPressed('Space')) this.deploySelected(raid.cursor); if (this.keyPressed('KeyF')) this.activateAbility(raid.selectedDefense);
    }
    applyForces() {
      var forcedMode = readForce('forceMode'); var forcedRival = readForce('forceRival'); var mode = forcedMode == null ? null : String(forcedMode).toLowerCase(); var rival = numberIndex(forcedRival, RIVALS.length, 0); var token = (mode || 'none') + ':' + String(forcedRival == null ? '' : forcedRival);
      if (token === this.appliedForceToken) return; this.appliedForceToken = token; this.state.forceMode = mode; this.state.forceRival = forcedRival;
      if (!mode) return; if (mode === 'base' || mode === 'b') this.go('base'); else if (mode === 'ladder' || mode === 'l') { if (forcedRival != null) this.startRaid('ladder', rival); else this.go('ladder'); } else if (mode === 'log' || mode === 'd') this.go('log'); else if (mode === 'scenario' || mode === 's') this.startRaid('scenario', numberIndex(forcedRival, SCENARIOS.length, 0)); else if (mode === 'endless' || mode === 'e') this.startRaid('endless', 0); else if (mode === 'raid') this.startRaid('ladder', rival);
    }
    fixedTick() {
      this.applyForces(); this.pollGamepad(); this.handleKeys(); this.state.simTime += STEP; if (this.state.result) this.state.result.age += STEP; if (this.state.notice) { this.state.notice.life -= STEP; if (this.state.notice.life <= 0) this.state.notice = null; } if (this.state.banner) { this.state.banner.life -= STEP; this.state.banner.age += STEP; if (this.state.banner.life <= 0) this.state.banner = null; } if (this.state.proxyPulse > 0) { this.state.proxyPulse -= STEP; if (this.state.proxyPulse <= 0) this.state.proxyState = 'idle'; } this.state.buildCooldown = Math.max(0, this.state.buildCooldown - STEP); this.updateEconomy(); this.updateParticles(); if (this.state.mode === 'raid') this.updateRaid(); this.syncHook(); this.keyPrev = {}; ['KeyB', 'KeyL', 'KeyD', 'KeyO', 'Space', 'KeyF', 'KeyM', 'KeyQ', 'KeyE', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].forEach(function (code) { this.keyPrev[code] = kit.input.keyDown(code); }, this);
    }
    syncHook() {
      if (typeof window === 'undefined') return; var h = window.__bw || {}; var fm = readForce('forceMode'); var fr = readForce('forceRival'); var publicState = { mode: this.state.mode, gold: Math.round(this.state.gold), mist: Math.round(this.state.mist), rivalsCleared: this.state.rivalsCleared, trophies: Math.round(this.state.trophies), troops: (this.state.troops || profile.troops).slice(), forceMode: fm, forceRival: fr, site: safeSite(this.state.site).key, scenarioMedals: profile.scenarioMedals.slice(), endlessWave: profile.endlessWave };
      if (this.state.raid) { publicState.wave = this.state.raid.wave; publicState.homeCore = Math.round((this.homeCore(this.state.raid) || { hp: 0 }).hp); publicState.enemyCore = Math.round((this.enemyCore(this.state.raid) || { hp: 0 }).hp); }
      h.state = publicState; h.forceMode = fm; h.forceRival = fr; window.__bw = h;
    }
    setBackground() { var key = this.state.mode === 'raid' ? 'raid-' + safeSite(this.state.site).key : this.state.mode === 'base' ? 'base-' + safeSite(this.state.site).key : 'menu-bg'; this.bg.setTexture(key); }
    update(time, delta) {
      if (!this.state) return; var juice = kit.juice.frame(); if (!kit.paused && !this.pausedByKit) { this.state.accumulator = Math.min(.25, this.state.accumulator + Math.min(.1, (Number(delta) || 16.67) / 1000)); var steps = 0; while (this.state.accumulator >= STEP && steps < 6) { this.fixedTick(); this.state.accumulator -= STEP; steps += 1; } } if (this.cameras && this.cameras.main) this.cameras.main.setScroll(juice.dx, juice.dy); this.render();
    }
    drawRing(g, x, y, radius, color, alpha, width) { var sides = 18; g.lineStyle(width || 2, color, alpha == null ? 1 : alpha); g.beginPath(); for (var i = 0; i <= sides; i++) { var a = i / sides * TAU; var px = x + Math.cos(a) * radius; var py = y + Math.sin(a) * radius; if (i === 0) g.moveTo(px, py); else g.lineTo(px, py); } g.strokePath(); }
    drawGhost(g, type, cell, valid) { if (!cell) return; var meta = safeBuilding(type); var x = BOARD.x + cell.col * BOARD.cell; var y = BOARD.y + cell.row * BOARD.cell; var color = valid ? C.player : C.enemy; g.fillStyle(color, .20); g.fillRect(x + 3, y + 3, BOARD.cell * meta.size - 6, BOARD.cell * meta.size - 6); g.lineStyle(2, color, .9); g.strokeRect(x + 4, y + 4, BOARD.cell * meta.size - 8, BOARD.cell * meta.size - 8); }
    drawStructure(g, item, render, enemy, selected) {
      var meta = safeBuilding(item.type); var point = cellPoint(item.col, item.row); var size = BOARD.cell * meta.size - 8; var x = point.x - 21 + 4; var y = point.y - 21 + 4; var cx = x + size / 2; var cy = y + size / 2; var pulse = render ? render.pulse || 0 : 0; var hurt = Math.max(render ? render.hurt || 0 : 0, item.hurt || 0); var collapse = Math.max(render ? render.collapse || 0 : 0, item.collapse || 0); var body = enemy ? C.enemyDeep : meta.color; g.fillStyle(C.ink, .35); g.fillEllipse(cx, cy + size * .35, size * .92, size * .28); if (!item.alive || collapse > 0) { g.fillStyle(enemy ? C.enemyDeep : C.stone, .55 * (1 - collapse * .4)); g.fillRect(x + 3, y + size * .55, size - 6, Math.max(4, size * .28 * (1 - collapse))); g.lineStyle(2, C.bone, .35); g.lineBetween(x + 8, y + size * .5, x + size - 8, y + size * .68); return; }
      if (selected) { g.lineStyle(2, C.white, .92); g.strokeRect(x - 3, y - 3, size + 6, size + 6); }
      g.fillStyle(body, .96); g.fillRect(x + 2, y + 5 + hurt * 2, size - 4, size - 8); g.fillStyle(C.ink, .28); g.fillRect(x + 5, y + size * .58, size - 10, size * .2);
      if (item.type === 'core') { g.fillStyle(enemy ? C.enemy : C.player, .98); g.fillTriangle(cx, y - 2, x + size + 2, y + 12, x - 2, y + 12); g.fillStyle(enemy ? C.enemyDeep : C.playerDeep, .95); g.fillTriangle(cx, y + 4, x + size - 5, y + 15, x + 5, y + 15); g.fillStyle(C.white, .9); g.fillCircle(cx, cy - 1, 5); g.fillStyle(enemy ? C.enemy : C.teal, .8); g.fillCircle(cx, cy - 1, 2); g.lineStyle(2, enemy ? C.enemy : C.player); g.strokeRect(x + size * .25, y + size * .42, size * .5, size * .34); g.lineStyle(1, C.white, .55); g.lineBetween(x + 8, y + size - 8, x + size - 8, y + size - 8); }
      else if (item.type === 'storehouse') { g.fillStyle(C.bone, .9); g.fillTriangle(cx, y - 1, x + size + 2, y + 13, x - 2, y + 13); g.fillStyle(C.wood, .95); g.fillRect(x + 9, y + 17, size - 18, size - 25); g.fillStyle(C.gold, .8); g.fillRect(cx - 3, y + 24, 6, 7); g.lineStyle(2, C.ink, .8); g.strokeRect(x + 10, y + 17, size - 20, size - 25); g.lineStyle(2, C.wood, .8); g.lineBetween(x + 8, y + 13, x + size - 8, y + 13); }
      else if (item.type === 'mine') { g.fillStyle(C.wood, .95); g.fillRect(cx - 12, y + 12, 5, size - 18); g.fillRect(cx + 7, y + 12, 5, size - 18); g.fillStyle(C.gold, .95); g.fillCircle(cx, cy, size * .23); g.fillStyle(C.white, .55); g.fillTriangle(cx - 4, cy - 4, cx + 2, cy - 8, cx + 5, cy + 2); g.lineStyle(2, C.bone, .8); g.strokeRect(x + 7, y + 10, size - 14, size - 18); }
      else if (item.type === 'vat') { g.fillStyle(C.wood, .95); g.fillRect(cx - 15, y + 13, 5, size - 18); g.fillRect(cx + 10, y + 13, 5, size - 18); g.fillStyle(C.mist, .9); g.fillEllipse(cx, cy, size * .42, size * .53); g.fillStyle(C.white, .6); g.fillCircle(cx - 5, cy - 6, 3); g.fillCircle(cx + 6, cy + 3, 2); g.lineStyle(2, C.white, .55); g.strokeEllipse(cx, cy, size * .42, size * .53); }
      else if (item.type === 'cannon') { g.fillStyle(C.wood, .95); g.fillCircle(cx - 10, cy + 11, 7); g.fillCircle(cx + 10, cy + 11, 7); g.fillStyle(C.amber, .95); g.fillCircle(cx - 2, cy + 3, size * .23); g.fillStyle(C.bone, .95); g.fillRoundedRect(cx - 1, y + 8, size * .47, 7, 3); g.fillStyle(C.gold, .8); g.fillCircle(cx + size * .23, y + 11, 3); g.lineStyle(2, C.ink, .9); g.strokeCircle(cx - 2, cy + 3, size * .23); }
      else if (item.type === 'lookout') { g.fillStyle(C.wood, .95); g.fillRect(cx - 8, y + 8, 5, size - 13); g.fillRect(cx + 3, y + 8, 5, size - 13); g.fillStyle(C.teal, .94); g.fillTriangle(cx, y - 1, cx + 14, y + 13, cx - 14, y + 13); g.fillStyle(C.white, .75); g.fillCircle(cx, y + 13, 4); g.lineStyle(2, C.ink, .75); g.lineBetween(cx - 12, y + 15, cx + 12, y + 15); }
      else { g.fillStyle(C.stone, .95); g.fillRect(x + 4, y + 9, size - 8, size - 18); g.fillStyle(C.bone, .35); g.fillRect(x + 7, y + 12, size - 14, 4); g.fillRect(x + 7, y + size * .48, size - 14, 4); g.lineStyle(1, C.bone, .6); g.lineBetween(x + 6, cy, x + size - 6, cy); g.lineBetween(cx - 4, y + 12, cx - 4, y + size - 10); g.lineBetween(cx + 7, y + 18, cx + 7, y + size - 10); }
      if (hurt > 0) { g.fillStyle(C.white, hurt * .5); g.fillRect(x, y, size, size); }
      var hpRatio = clamp(item.hp / item.maxHp, 0, 1); if (item.type !== 'wall' || hpRatio < .99 || selected) { g.fillStyle(C.ink, .8); g.fillRect(x, y - 6, size, 4); g.fillStyle(enemy ? C.enemy : C.player, .95); g.fillRect(x, y - 6, size * hpRatio, 4); }
      if (item.level > 1) { g.fillStyle(enemy ? C.enemy : C.white, .9); g.fillCircle(x + size - 5, y + 5, 4); g.fillStyle(C.ink, .8); g.fillRect(x + size - 7, y + 3, 4, 4); }
      if (pulse > 0) { this.drawRing(g, cx, cy, size * (.45 + pulse * .18), meta.color, pulse * .7, 2); }
    }
    drawUnit(g, unit, render) {
      var troop = safeTroop(unit.slot); if (!unit.alive && (!render || render.fade <= 0)) return; var bob = kit.juice.enabled ? (unit.state === 'move' ? Math.sin(this.state.simTime * 16 + unit.phase) * 2 : unit.state === 'attack' ? 2 : Math.sin(this.state.simTime * 6 + unit.phase) * 1.1) : 0; var flash = render ? render.flash || 0 : 0; var alpha = unit.alive ? 1 : clamp((render && render.fade) || 0, 0, 1); g.fillStyle(C.ink, .35 * alpha); g.fillEllipse(unit.x, unit.y + 9, troop.role === 'giant' ? 24 : 17, 7); this.drawRing(g, unit.x, unit.y + 5, troop.role === 'giant' ? 13 : 9, troop.color, .78 * alpha, 2); g.fillStyle(troop.color, alpha); var radius = troop.role === 'giant' ? 10 : troop.role === 'breaker' ? 8 : 7; if (unit.alive) g.fillCircle(unit.x, unit.y + bob, radius); else { g.lineStyle(3, C.enemy, alpha); g.lineBetween(unit.x - radius, unit.y - radius, unit.x + radius, unit.y + radius); g.lineBetween(unit.x + radius, unit.y - radius, unit.x - radius, unit.y + radius); } g.fillStyle(C.white, .88 * alpha); g.fillRect(unit.x - 4, unit.y - 5 + bob, 8, 4); g.fillStyle(C.playerDeep, .9 * alpha); g.fillRect(unit.x + 4, unit.y - 1 + bob, troop.role === 'giant' ? 8 : 5, 3); if (troop.role === 'ranged') { g.lineStyle(2, C.bone, alpha); g.lineBetween(unit.x - 8, unit.y - 2 + bob, unit.x - 2, unit.y + 5 + bob); } if (troop.role === 'breaker') { g.lineStyle(3, C.gold, alpha); g.lineBetween(unit.x + 4, unit.y - 7 + bob, unit.x + 10, unit.y + 6 + bob); } if (troop.role === 'healer') { g.lineStyle(2, C.white, alpha); g.lineBetween(unit.x - 4, unit.y + bob, unit.x + 4, unit.y + bob); g.lineBetween(unit.x, unit.y - 4 + bob, unit.x, unit.y + 4 + bob); } if (flash > 0 && kit.juice.enabled) { g.fillStyle(C.white, flash * .65); g.fillCircle(unit.x, unit.y + bob, radius + 3); } if (unit.alive && unit.hp < unit.maxHp * .99) { g.fillStyle(C.ink, .8); g.fillRect(unit.x - 11, unit.y - 17, 22, 3); g.fillStyle(unit.state === 'hurt' ? C.enemy : troop.color, .95); g.fillRect(unit.x - 11, unit.y - 17, 22 * clamp(unit.hp / unit.maxHp, 0, 1), 3); }
    }
    drawEnemyUnit(g, unit) {
      if (!unit.alive && unit.state !== 'defeat') return; var alpha = unit.alive ? 1 : .52; var bob = kit.juice.enabled && unit.alive ? Math.sin(this.state.simTime * 13 + unit.phase) * 1.5 : 0; var radius = unit.role === 'crusher' ? 10 : 7; g.fillStyle(C.ink, .4 * alpha); g.fillEllipse(unit.x, unit.y + 9, radius * 2.3, 7); this.drawRing(g, unit.x, unit.y + 3, radius + 4, C.enemy, .8 * alpha, 2); if (unit.alive) { g.fillStyle(C.enemy, alpha); g.fillCircle(unit.x, unit.y + bob, radius); g.fillStyle(C.enemyDeep, .95 * alpha); g.fillTriangle(unit.x, unit.y - radius - 4 + bob, unit.x + 7, unit.y - 1 + bob, unit.x - 7, unit.y - 1 + bob); } else { g.lineStyle(3, C.enemy, alpha); g.lineBetween(unit.x - radius, unit.y - radius, unit.x + radius, unit.y + radius); g.lineBetween(unit.x + radius, unit.y - radius, unit.x - radius, unit.y + radius); } if (unit.alive && unit.hp < unit.maxHp) { g.fillStyle(C.ink, .85); g.fillRect(unit.x - 11, unit.y - 17, 22, 3); g.fillStyle(C.enemy, 1); g.fillRect(unit.x - 11, unit.y - 17, 22 * clamp(unit.hp / unit.maxHp, 0, 1), 3); }
    }
    drawStandard(g, x, y) { var active = this.state.proxyState === 'command' || this.state.proxyState === 'resolve'; var wave = Math.sin(this.state.simTime * 7) * 2; g.fillStyle(C.ink, .45); g.fillEllipse(x, y + 12, 22, 7); this.drawRing(g, x, y + 6, 11, C.player, .85, 2); g.lineStyle(3, C.bone, .95); g.lineBetween(x, y + 8, x, y - 18 + wave); g.fillStyle(active ? C.player : C.teal, .95); g.fillTriangle(x + 1, y - 18 + wave, x + 18, y - 12 + wave, x + 1, y - 5 + wave); if (this.state.proxyState === 'resolve') { g.fillStyle(C.white, .9); g.fillCircle(x, y - 22 + wave, 3); } }
    renderBaseWorld() {
      var layout = this.currentLayout(); var self = this; layout.forEach(function (item, index) { var rs = self.renderState.buildings[index] || (self.renderState.buildings[index] = { pulse: 0, hurt: 0, collapse: 0 }); rs.pulse = Math.max(0, rs.pulse - STEP); self.drawStructure(self.world, { type: item.type, col: item.col, row: item.row, level: item.level, hp: safeBuilding(item.type).hp * item.level, maxHp: safeBuilding(item.type).hp * item.level, alive: true }, rs, false, self.state.selectedBuilding === index); });
      var site = safeSite(this.state.site); if (!profile.cacheFound[this.state.site]) { var cache = cellPoint(site.cache.col, site.cache.row); this.world.fillStyle(C.amber, .18); this.world.fillCircle(cache.x, cache.y, 16 + Math.sin(this.state.simTime * 5) * 2); this.world.fillStyle(C.gold, .95); this.world.fillTriangle(cache.x, cache.y - 11, cache.x + 10, cache.y + 8, cache.x - 10, cache.y + 8); this.drawRing(this.world, cache.x, cache.y, 17, C.amber, .85, 2); }
      if (this.state.selectedBuild != null && this.state.selectedBuild >= 0) { var type = ['mine', 'vat', 'cannon', 'lookout', 'wall'][this.state.selectedBuild] || 'wall'; var cell = this.state.hoverCell || { col: 3, row: 5 }; this.drawGhost(this.decals, type, cell, validPlacement(layout, type, cell)); }
      if (this.drag && this.drag.hover) this.drawGhost(this.decals, layout[this.drag.index].type, this.drag.hover, validPlacement(layout, layout[this.drag.index].type, this.drag.hover, this.drag.index));
      this.drawStandard(this.world, 342, 511);
    }
    renderRaidWorld() {
      var raid = this.state.raid; if (!raid) return; var self = this; this.decals.lineStyle(2, C.enemy, .42); this.decals.strokeRect(BOARD.x + 2, BOARD.y + 2, BOARD.cols * BOARD.cell - 4, BOARD.rows * BOARD.cell - 4); var target = raid.enemy.find(function (item) { return item.alive && item.type === 'core'; }); if (target) { var tp = cellPoint(target.col, target.row); this.decals.lineStyle(1, C.enemy, .24); this.decals.lineBetween(raid.cursor.x, raid.cursor.y, tp.x, tp.y); }
      raid.enemy.forEach(function (item) { self.drawStructure(self.world, item, { pulse: 0, hurt: item.hurt || 0, collapse: item.collapse || 0 }, true, false); }); raid.home.forEach(function (item, index) { self.drawStructure(self.world, item, { pulse: item.abilityFlash || 0, hurt: item.hurt || 0, collapse: item.collapse || 0 }, false, raid.selectedDefense === index); });
      raid.units.forEach(function (unit, index) { var rs = self.renderState.units[index] || (self.renderState.units[index] = { flash: 0, fade: 1 }); rs.flash = unit.state === 'hurt' && kit.juice.enabled ? .8 : Math.max(0, rs.flash - STEP * 5); rs.fade = unit.alive ? 1 : Math.max(0, rs.fade - STEP * 2); self.drawUnit(self.world, unit, rs); if (unit.alive && raid.selectedSlot === unit.slot) self.drawRing(self.decals, unit.x, unit.y, safeTroop(unit.slot).range, safeTroop(unit.slot).color, .22, 1); }); raid.enemyUnits.forEach(function (unit) { self.drawEnemyUnit(self.world, unit); });
      raid.telegraphs.forEach(function (telegraph) { var alpha = clamp(telegraph.life / telegraph.maxLife, 0, 1); self.drawRing(self.decals, telegraph.x, telegraph.y, telegraph.radius * (1.2 - alpha * .2), telegraph.color, .8, 2); if (telegraph.from) { self.decals.lineStyle(2, telegraph.color, .5); self.decals.lineBetween(telegraph.from.x, telegraph.from.y, telegraph.x, telegraph.y); } });
      raid.home.forEach(function (item) { if (!item.alive || (item.type !== 'cannon' && item.type !== 'lookout')) return; var point = cellPoint(item.col, item.row); self.drawRing(self.decals, point.x, point.y, 205, C.player, .08, 1); }); var rimColor = this.isRaidRim(raid.cursor) ? C.player : C.amber; this.drawRing(this.decals, raid.cursor.x, raid.cursor.y, 15, rimColor, .95, 2); this.decals.lineStyle(2, C.white, .8); this.decals.lineBetween(raid.cursor.x - 6, raid.cursor.y, raid.cursor.x + 6, raid.cursor.y); this.decals.lineBetween(raid.cursor.x, raid.cursor.y - 6, raid.cursor.x, raid.cursor.y + 6); }
    renderEffects() {
      var self = this; Object.keys(this.particles).forEach(function (system) { self.particles[system].forEach(function (particle) { if (!particle.active) return; self.fx.fillStyle(particle.color, particle.alpha * (system === 'trails' ? .7 : 1)); self.fx.fillCircle(particle.x, particle.y, particle.size * (system === 'bursts' ? 1 + particle.alpha : 1)); }); }); this.damageTexts.forEach(function (text) { text.setVisible(false); }); this.damage.forEach(function (d, index) { if (!d.active) return; var text = self.damageTexts[index]; text.setPosition(d.x, d.y); setTextIfChanged(text, String(d.value)); setColorIfChanged(text, d.color); text.setAlpha(clamp(d.life * 2, 0, 1)); text.setVisible(true); });
    }
    render() {
      this.decals.clear(); this.world.clear(); this.fx.clear(); this.uiLayer.clear(); this.renderState.buildings.length = this.state.mode === 'raid' && this.state.raid ? this.state.raid.enemy.length : this.currentLayout().length;
      this.decals.setPosition(0, 0); this.world.setPosition(0, 0); this.fx.setPosition(0, 0); if (this.state.mode === 'base') this.renderBaseWorld(); else if (this.state.mode === 'raid') this.renderRaidWorld(); else if (this.state.mode === 'result') this.renderResultPanel(); this.renderEffects(); this.renderUi();
    }
    drawButton(x, y, w, h, active, accent) { this.uiLayer.fillStyle(active ? accent : C.panel, .94); this.uiLayer.fillRoundedRect(x, y, w, h, 10); this.uiLayer.lineStyle(1, active ? C.white : C.line, .72); this.uiLayer.strokeRoundedRect(x, y, w, h, 10); }
    renderHeader() {
      var mode = this.state.mode; var title = mode === 'base' ? 'BASTION' : mode === 'ladder' ? 'LADDER' : mode === 'log' ? 'LOG' : mode === 'scenario' ? 'SCENARIO' : mode === 'endless' ? 'ENDLESS' : mode === 'raid' ? (this.state.raid ? this.state.raid.name : 'RAID') : 'RUN RESULT'; setTextIfChanged(this.ui.title, title); setTextIfChanged(this.ui.gold, '✦ ' + Math.round(this.state.gold)); setTextIfChanged(this.ui.mist, '◆ ' + Math.round(this.state.mist)); setTextIfChanged(this.ui.trophies, '♛ ' + Math.round(this.state.trophies)); setTextIfChanged(this.ui.settings, '⚙'); this.ui.title.setVisible(true); this.ui.gold.setVisible(true); this.ui.mist.setVisible(true); this.ui.trophies.setVisible(true); this.ui.settings.setVisible(true);
      var tabs = [['tabB', 'B', 'base'], ['tabL', 'L', 'ladder'], ['tabD', 'D', 'log']]; var self = this; tabs.forEach(function (tab) { var text = self.ui[tab[0]]; setTextIfChanged(text, tab[1]); text.setVisible(true); setColorIfChanged(text, mode === tab[2] ? CSS.player : CSS.text); }); this.uiLayer.fillStyle(C.panel, .84); this.uiLayer.fillRoundedRect(174, 62, 192, 46, 11); this.uiLayer.lineStyle(1, C.line, .72); this.uiLayer.strokeRoundedRect(174, 62, 192, 46, 11); this.uiLayer.lineStyle(2, C.player, .9); var tabX = mode === 'base' ? 174 : mode === 'ladder' ? 234 : mode === 'log' ? 294 : 234; this.uiLayer.lineBetween(tabX + 10, 105, tabX + 50, 105);
      if (mode === 'base' || mode === 'raid') { this.ui.site.setVisible(true); setTextIfChanged(this.ui.site, safeSite(this.state.site).name + ' / ' + safeSite(this.state.site).landmark); } else this.ui.site.setVisible(false);
    }
    renderUi() {
      this.renderHeader(); var mode = this.state.mode; var self = this; this.ui.hint.setVisible(false); this.ui.defense.setVisible(false); this.ui.ability.setVisible(false); this.ui.listTitle.setVisible(false); this.ui.listSub.setVisible(false); this.ui.legend.setVisible(false); this.ui.notice.setVisible(false); this.ui.bannerTitle.setVisible(false); this.ui.bannerSub.setVisible(false); this.ui.resultTitle.setVisible(false); this.ui.resultSub.setVisible(false); this.ui.resultMedals.forEach(function (text) { text.setVisible(false); }); this.ui.resultAction.setVisible(false); this.ui.resultRetry.setVisible(false); this.ui.cardLabels.forEach(function (card) { card.icon.setVisible(false); card.label.setVisible(false); card.cost.setVisible(false); }); this.ui.menuActions.forEach(function (text) { text.setVisible(false); }); this.ui.ladder.name.forEach(function (text) { text.setVisible(false); }); this.ui.ladder.sub.forEach(function (text) { text.setVisible(false); }); this.ui.scenario.title.forEach(function (text) { text.setVisible(false); }); this.ui.scenario.site.forEach(function (text) { text.setVisible(false); }); this.ui.scenario.setup.forEach(function (text) { text.setVisible(false); }); this.ui.scenario.medal.forEach(function (text) { text.setVisible(false); }); this.ui.endless.forEach(function (text) { text.setVisible(false); }); this.ui.log.name.forEach(function (text) { text.setVisible(false); }); this.ui.log.result.forEach(function (text) { text.setVisible(false); }); this.ui.log.note.forEach(function (text) { text.setVisible(false); });
      if (mode === 'base') this.renderBaseUi(); else if (mode === 'raid') this.renderRaidUi(); else if (mode === 'result') this.renderResultUi(); else if (mode === 'ladder') this.renderLadderUi(); else if (mode === 'scenario') this.renderScenarioUi(); else if (mode === 'endless') this.renderEndlessUi(); else if (mode === 'log') this.renderLogUi();
      if (this.state.banner && mode === 'raid') { this.uiLayer.fillStyle(C.ink, .92); this.uiLayer.fillRoundedRect(54, 238, 282, 122, 16); this.uiLayer.lineStyle(2, safeSite(this.state.site).accent, .92); this.uiLayer.strokeRoundedRect(54, 238, 282, 122, 16); var overshoot = kit.juice.enabled && this.state.banner.age < .3 ? 1.06 - this.state.banner.age * .2 : 1; this.ui.bannerTitle.setScale(overshoot); setTextIfChanged(this.ui.bannerTitle, this.state.banner.title); setTextIfChanged(this.ui.bannerSub, this.state.banner.subtitle); this.ui.bannerTitle.setVisible(true); this.ui.bannerSub.setVisible(true); }
      if (this.state.notice && !this.state.banner && mode !== 'result') { if (this.state.notice.coach && (mode === 'base' || mode === 'raid')) { this.uiLayer.fillStyle(C.panel, .76); this.uiLayer.fillRoundedRect(22, 108, 346, 26, 8); this.uiLayer.lineStyle(1, C.line, .68); this.uiLayer.strokeRoundedRect(22, 108, 346, 26, 8); setTextIfChanged(this.ui.hint, this.state.notice.text); this.ui.hint.setVisible(true); } else { this.uiLayer.fillStyle(C.ink, .86); this.uiLayer.fillRoundedRect(22, 566, 346, 30, 10); this.uiLayer.lineStyle(1, C.player, .75); this.uiLayer.strokeRoundedRect(22, 566, 346, 30, 10); setTextIfChanged(this.ui.notice, this.state.notice.text); this.ui.notice.setVisible(true); } }
    }
    renderBaseUi() {
      setTextIfChanged(this.ui.hint, this.state.buildCooldown > 0 ? 'BUILD QUEUE  ' + this.state.buildCooldown.toFixed(1) + 'S' : this.state.selectedBuild != null ? 'GHOST: CYAN OPEN / CORAL BLOCKED' : 'TAP UPGRADE  ·  DRAG MOVE  ·  M ARMOR MOVE'); this.ui.hint.setVisible(true); this.uiLayer.fillStyle(C.panel, .92); this.uiLayer.fillRoundedRect(10, 600, 370, 40, 9); this.uiLayer.lineStyle(1, C.line, .72); this.uiLayer.strokeRoundedRect(10, 600, 370, 40, 9); setTextIfChanged(this.ui.ability, this.state.selectedBuilding >= 0 ? 'F  ' + this.abilityName(this.state.selectedBuilding) : 'SELECT A STRUCTURE  ·  F ABILITY IN RAID'); this.ui.ability.setVisible(true); this.drawButton(10, 650, 370, 132, false, C.panel); var types = ['mine', 'vat', 'cannon', 'lookout', 'wall']; var self = this; types.forEach(function (type, index) { var meta = safeBuilding(type); var x = 16 + index * 72; var selected = self.state.selectedBuild === index; self.drawButton(x, 666, 64, 94, selected, selected ? C.playerDeep : C.panel2); var card = self.ui.cardLabels[index]; setTextIfChanged(card.icon, meta.icon); setTextIfChanged(card.label, meta.label); setTextIfChanged(card.cost, meta.costGold ? meta.costGold + 'G' + (meta.costMist ? ' +' + meta.costMist + 'M' : '') : meta.costMist + 'M'); card.icon.setVisible(true); card.label.setVisible(true); card.cost.setVisible(true); setColorIfChanged(card.icon, selected ? CSS.white : index === 0 ? CSS.gold : index === 1 ? CSS.mist : index === 2 ? CSS.amber : index === 3 ? CSS.teal : CSS.muted); setColorIfChanged(card.label, CSS.text); });
    }
    renderRaidUi() {
      var raid = this.state.raid; if (!raid) return; setTextIfChanged(this.ui.hint, 'RIM DROP  ·  1-5 SELECT  ·  ARROWS MOVE  ·  F ABILITY'); this.ui.hint.setVisible(true); var defense = raid.home[raid.selectedDefense]; setTextIfChanged(this.ui.defense, 'HOME CORE ' + Math.ceil(clamp((this.homeCore(raid) || { hp: 0, maxHp: 1 }).hp / (this.homeCore(raid) || { hp: 0, maxHp: 1 }).maxHp, 0, 1) * 100) + '%  ·  WAVE ' + raid.wave); this.ui.defense.setVisible(true); this.uiLayer.fillStyle(C.panel, .92); this.uiLayer.fillRoundedRect(10, 600, 370, 40, 9); this.uiLayer.lineStyle(1, defense && defense.abilityCd > 0 ? C.enemy : C.player, .8); this.uiLayer.strokeRoundedRect(10, 600, 370, 40, 9); setTextIfChanged(this.ui.ability, defense ? 'F  ' + this.abilityName(raid.selectedDefense) : 'SELECT A HOME STRUCTURE'); this.ui.ability.setVisible(true); this.drawButton(10, 650, 370, 132, false, C.panel); var self = this; TROOPS.forEach(function (troop, index) { var x = 16 + index * 72; var selected = raid.selectedSlot === index; self.drawButton(x, 666, 64, 94, selected, selected ? C.playerDeep : C.panel2); var card = self.ui.cardLabels[index]; setTextIfChanged(card.icon, troop.icon); setTextIfChanged(card.label, troop.label); setTextIfChanged(card.cost, 'x' + raid.available[index]); card.icon.setVisible(true); card.label.setVisible(true); card.cost.setVisible(true); setColorIfChanged(card.icon, selected ? CSS.white : troop.color); setColorIfChanged(card.label, CSS.text); }); this.uiLayer.fillStyle(C.ink, .76); this.uiLayer.fillRoundedRect(112, 116, 166, 24, 8); this.uiLayer.lineStyle(1, C.enemy, .75); this.uiLayer.strokeRoundedRect(112, 116, 166, 24, 8); this.uiLayer.fillStyle(C.text, .95); this.uiLayer.fillRect(118, 126, 18, 2); var core = this.enemyCore(raid); var coreRatio = core ? clamp(core.hp / core.maxHp, 0, 1) : 0; this.uiLayer.fillStyle(C.enemy, .9); this.uiLayer.fillRect(140, 126, 132 * coreRatio, 3); }
    renderListFrame(title, subtitle) { setTextIfChanged(this.ui.listTitle, title); setTextIfChanged(this.ui.listSub, subtitle); this.ui.listTitle.setVisible(true); this.ui.listSub.setVisible(true); }
    renderLadderUi() {
      this.renderListFrame('12 RIVALS', this.state.crown ? 'CROWN EARNED / LADDER COMPLETE' : this.state.rivalsCleared + ' CLEARED / OPEN RIVALS GLOW'); var self = this; RIVALS.forEach(function (rival, index) { var col = index >= 6 ? 1 : 0; var row = index % 6; var x = col ? 199 : 19; var y = 207 + row * 60; var open = index === 0 || (profile.rivalMedals[index - 1] && profile.rivalMedals[index - 1].clear > 0); self.drawButton(x, y, 172, 50, open, open ? C.panel2 : C.deep); var medal = profile.rivalMedals[index] || { clear: 0 }; self.uiLayer.fillStyle(open ? safeSite(rival.site).accent : C.muted, .95); self.uiLayer.fillCircle(x + 18, y + 25, 7); self.uiLayer.fillStyle(C.text, .95); self.uiLayer.fillRect(x + 16, y + 20, 4, 10); self.uiLayer.fillRect(x + 13, y + 23, 10, 4); self.ui.ladder.name[index].setPosition(x + 32, y + 8); setTextIfChanged(self.ui.ladder.name[index], (index + 1) + '  ' + rival.name); setColorIfChanged(self.ui.ladder.name[index], open ? CSS.text : CSS.muted); self.ui.ladder.name[index].setVisible(true); self.ui.ladder.sub[index].setPosition(x + 32, y + 29); setTextIfChanged(self.ui.ladder.sub[index], open ? rival.tier + '  ' + starText(medal.clear) : 'LOCKED'); self.ui.ladder.sub[index].setVisible(true); }); this.drawButton(16, 690, 174, 60, false, C.panel2); this.drawButton(200, 690, 174, 60, false, C.panel2); setTextIfChanged(this.ui.menuActions[0], 'S  SCENARIO'); setTextIfChanged(this.ui.menuActions[1], 'E  ENDLESS'); this.ui.menuActions.forEach(function (t) { t.setVisible(true); });
    }
    renderScenarioUi() {
      this.renderListFrame('3 SCENARIOS', 'HAND-AUTHORED STARTS / MEDAL UNLOCK CHAIN'); var self = this; SCENARIOS.forEach(function (scenario, index) { var y = 207 + index * 142; var open = index === 0 || profile.scenarioMedals[index - 1] >= 1; self.drawButton(19, y, 352, 116, open, open ? C.panel2 : C.deep); self.ui.scenario.title[index].setPosition(34, y + 15); setTextIfChanged(self.ui.scenario.title[index], scenario.name); setColorIfChanged(self.ui.scenario.title[index], open ? CSS.text : CSS.muted); self.ui.scenario.title[index].setVisible(true); self.ui.scenario.site[index].setPosition(34, y + 47); setTextIfChanged(self.ui.scenario.site[index], safeSite(scenario.site).name); setColorIfChanged(self.ui.scenario.site[index], safeSite(scenario.site).accent === C.enemy ? CSS.enemy : CSS.teal); self.ui.scenario.site[index].setVisible(true); self.ui.scenario.setup[index].setPosition(34, y + 76); setTextIfChanged(self.ui.scenario.setup[index], open ? scenario.setup + '  ·  ' + scenario.requirement : 'LOCKED  ·  ' + scenario.requirement); self.ui.scenario.setup[index].setVisible(true); self.ui.scenario.medal[index].setPosition(300, y + 42); setTextIfChanged(self.ui.scenario.medal[index], open ? medalName(profile.scenarioMedals[index]) : 'LOCKED'); self.ui.scenario.medal[index].setVisible(true); }); this.drawButton(16, 690, 358, 60, false, C.panel2); setTextIfChanged(this.ui.menuActions[0], 'E  ENDLESS'); this.ui.menuActions[0].setVisible(true);
    }
    renderEndlessUi() {
      this.renderListFrame('ENDLESS SIEGE', 'ESCALATING STRENGTH / GENEROUS HAULS'); this.uiLayer.fillStyle(C.panel2, .94); this.uiLayer.fillRoundedRect(30, 224, 330, 206, 16); this.uiLayer.lineStyle(2, C.enemy, .75); this.uiLayer.strokeRoundedRect(30, 224, 330, 206, 16); var endlessText = this.ui.endless; setTextIfChanged(endlessText[0], 'WAVE ' + profile.endlessWave); endlessText[0].setPosition(54, 250); endlessText[0].setVisible(true); setTextIfChanged(endlessText[1], 'BEST  ' + profile.endlessBest); endlessText[1].setPosition(54, 300); endlessText[1].setVisible(true); setTextIfChanged(endlessText[2], 'Each clear adds armor and loot.'); endlessText[2].setPosition(54, 348); endlessText[2].setVisible(true); setTextIfChanged(endlessText[3], 'Deploy from the rim. No clocks.'); endlessText[3].setPosition(54, 376); endlessText[3].setVisible(true); this.drawButton(16, 690, 358, 64, true, C.playerDeep); setTextIfChanged(this.ui.menuActions[0], 'START WAVE'); this.ui.menuActions[0].setVisible(true);
    }
    renderLogUi() {
      this.renderListFrame('DEFENSE LOG', 'RECENT RAID OUTCOMES / PERSISTED ON DEVICE'); var logs = profile.logs || []; var self = this; for (var i = 0; i < Math.min(7, logs.length); i++) { var log = logs[i]; var y = 207 + i * 54; self.drawButton(19, y, 352, 44, false, C.panel2); self.ui.log.name[i].setPosition(33, y + 7); setTextIfChanged(self.ui.log.name[i], log.rival); self.ui.log.name[i].setVisible(true); self.ui.log.result[i].setPosition(33, y + 25); setTextIfChanged(self.ui.log.result[i], log.result + '  ·  LOSS ' + log.loss); setColorIfChanged(self.ui.log.result[i], log.result === 'CLEARED' ? CSS.teal : CSS.enemy); self.ui.log.result[i].setVisible(true); self.ui.log.note[i].setPosition(216, y + 15); setTextIfChanged(self.ui.log.note[i], log.note); self.ui.log.note[i].setVisible(true); }
    }
    renderResultPanel() {
      var result = this.state.result; if (!result) return; this.uiLayer.fillStyle(C.ink, .94); this.uiLayer.fillRoundedRect(50, 181, 290, 460, 18); this.uiLayer.lineStyle(2, result.win ? C.gold : C.enemy, .92); this.uiLayer.strokeRoundedRect(50, 181, 290, 460, 18); }
    renderResultUi() {
      var result = this.state.result; if (!result) return; setTextIfChanged(this.ui.resultTitle, result.win ? result.crown ? 'CROWN EARNED' : result.kind === 'endless' ? 'WAVE CLEARED' : result.kind === 'scenario' ? 'SCENARIO CLEARED' : 'RIVAL CLEARED' : 'CORE LOST'); setTextIfChanged(this.ui.resultSub, '+' + result.rewardGold + 'G  +' + result.rewardMist + 'M  ·  LOSS ' + result.losses); this.ui.resultTitle.setScale(kit.juice.enabled && result.age < .35 ? 1.08 - result.age * .23 : 1); this.ui.resultTitle.setVisible(true); this.ui.resultSub.setVisible(true); setTextIfChanged(this.ui.resultMedals[0], 'CLEAR       ' + starText(result.medal.clear)); setTextIfChanged(this.ui.resultMedals[1], 'NO-LOSS     ' + starText(result.medal.noLoss)); setTextIfChanged(this.ui.resultMedals[2], 'EFFICIENCY  ' + starText(result.medal.efficiency)); this.ui.resultMedals.forEach(function (text) { text.setVisible(true); }); this.drawButton(81, 484, 228, 54, true, result.win ? C.playerDeep : C.enemyDeep); this.drawButton(81, 552, 228, 54, false, C.panel2); setTextIfChanged(this.ui.resultAction, result.kind === 'scenario' ? 'BACK TO SCENARIO' : result.kind === 'endless' ? 'BACK TO ENDLESS' : 'BACK TO LADDER'); this.ui.resultAction.setVisible(true); setTextIfChanged(this.ui.resultRetry, 'RETRY RAID'); this.ui.resultRetry.setVisible(true); }
  }

  var config = { type: Phaser.AUTO, parent: document.getElementById('gameShell') || document.body, width: W, height: H, backgroundColor: '#07111c', render: { antialias: true, roundPixels: true }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H }, scene: BastionworksScene };
  kit.loader.show('BASTIONWORKS'); kit.loader.progress(.2); Game.phaser = new Phaser.Game(config);
})()
