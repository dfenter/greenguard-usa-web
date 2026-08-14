/* Deadline Dungeon, fleet F7 AAA rebuild.
 * Phaser is the view. GGKit owns lifecycle, input identity, saves, audio,
 * reduced motion, pause, settings, and PWA registration. The sim is fixed
 * step and every display object is a view of a separate sim record.
 */
(function () {
  'use strict';

  var W = 390, H = 844, STEP = 1 / 60, MAX_STEPS = 5, TAU = Math.PI * 2;
  var ROOM = { left: 24, top: 158, right: 366, bottom: 700, gateX: 350, gateY: 430 };
  var MAX_ENEMIES = 24, MAX_BOLTS = 32, MAX_FX = 120, MAX_PICKUPS = 12;
  var PAL = {
    ink: 0x090c17, paper: 0xf5f1e3, mist: 0xaeb9d5, dim: 0x65718f,
    mint: 0x65e4bf, gold: 0xffd16a, danger: 0xff6f83, violet: 0xc49aff,
    water: 0x5edbe0, forge: 0xff9b4d, white: 0xffffff
  };
  var FLOORS = [
    { id: 'crypt', name: 'CRYPT ENTRY HALLS', short: 'CRYPT', sub: 'Candlelit stone / echoing locks', accent: 0x67d9b5, bg: 0x121827, floor: 0x1d2940, wall: 0x354665, hazard: 0xc95776, par: 82, deadline: 118, rooms: ['CANDLE ENTRY', 'WING OF LOCKS', 'BONE GALLERY', 'TOMB OF BELLS', 'CRYPT HEART'], signature: 'THE BELL TOMB', unlock: 'READY' },
    { id: 'cistern', name: 'FLOODED CISTERN', short: 'CISTERN', sub: 'Rising water / low blue light', accent: 0x5edbe0, bg: 0x0d1c2b, floor: 0x173747, wall: 0x2c6070, hazard: 0x4babbc, par: 92, deadline: 132, rooms: ['LOWER INTAKE', 'DRAIN DETOUR', 'SUMP WALK', 'RESERVOIR RING', 'DROWNED VALVE'], signature: 'THE SUNKEN BELL', unlock: 'BRONZE CRYPT' },
    { id: 'forge', name: 'COLLAPSING FORGE', short: 'FORGE', sub: 'Falling slag / cracked iron', accent: 0xff9b4d, bg: 0x24161a, floor: 0x3a2525, wall: 0x70403a, hazard: 0xed604f, par: 104, deadline: 150, rooms: ['COAL GATE', 'SLAG DETOUR', 'HAMMER LANE', 'MOLTEN WORKS', 'BROKEN ANVIL'], signature: 'THE LAST ANVIL', unlock: 'SILVER CISTERN' },
    { id: 'vault', name: 'THE DEADLINE VAULT', short: 'VAULT', sub: 'Clock wards / final seal', accent: 0xd1a5ff, bg: 0x181127, floor: 0x292044, wall: 0x59477c, hazard: 0xb477ea, par: 118, deadline: 170, rooms: ['SEAL APPROACH', 'CLOCK DETOUR', 'WARD CHAMBER', 'DEADLINE LOCK', 'THE FINAL HOUR'], signature: 'THE DEADLINE HEART', unlock: 'GOLD FORGE' }
  ];
  var FLOOR_BY_ID = {};
  for (var floorIndex = 0; floorIndex < FLOORS.length; floorIndex++) FLOOR_BY_ID[FLOORS[floorIndex].id] = FLOORS[floorIndex];
  var ENEMY = {
    wisp: { hp: 2, speed: 60, radius: 13, color: 0xff668c },
    archer: { hp: 2, speed: 38, radius: 14, color: 0xffc46e },
    brute: { hp: 5, speed: 28, radius: 20, color: 0xff8c57 },
    skitter: { hp: 2, speed: 72, radius: 12, color: 0xdf78ff },
    warden: { hp: 18, speed: 31, radius: 28, color: 0xffd16a }
  };
  var ENEMY_TYPES = ['wisp', 'archer', 'skitter', 'brute'];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function colorCss(n) { return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6); }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function hash32(n) {
    n = Math.imul(n ^ n >>> 16, 0x45d9f3b);
    n = Math.imul(n ^ n >>> 16, 0x45d9f3b);
    return (n ^ n >>> 16) >>> 0;
  }
  function rng(seed) {
    var s = seed >>> 0;
    return function () { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296; };
  }
  function timeStamp() {
    var d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }
  function dailySeed() { return hash32(timeStamp() ^ 0xD3A11F); }
  function fmtTime(s) {
    var ms = Math.max(0, Math.floor(s * 1000));
    return String(Math.floor(ms / 60000)).padStart(2, '0') + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0') + '.' + String(Math.floor(ms / 10) % 100).padStart(2, '0');
  }
  function fmtShort(s) { return String(Math.floor(Math.max(0, s))).padStart(2, '0') + 's'; }
  function seedText(seed) { return (seed >>> 0).toString(36).toUpperCase().slice(-6); }
  function floorFor(no) { return FLOORS[no - 1] || FLOORS[0]; }
  function enemyFor(type) { return ENEMY[type] || ENEMY.wisp; }
  function roomBlocked(room, x, y, r) {
    for (var i = 0; i < room.obstacles.length; i++) { var o = room.obstacles[i], nx = clamp(x, o.x, o.x + o.w), ny = clamp(y, o.y, o.y + o.h); if (dist(x, y, nx, ny) < r) return true; }
    return false;
  }
  function safeRoomSpot(room, x, y, r) {
    return x > ROOM.left + r + 8 && x < ROOM.right - r - 8 && y > ROOM.top + r + 8 && y < ROOM.bottom - r - 8 && x < ROOM.gateX - 28 && !roomBlocked(room, x, y, r) && dist(x, y, 55, ROOM.gateY) > 70;
  }
  function easeOutBack(t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  function activePhase(phase) { return phase === 'explore' || phase === 'solve' || phase === 'escape' || phase === 'transition'; }
  function setTextIfChanged(text, value) { var next = String(value); if (text && text.text !== next) text.setText(next); }
  function setVisible(items, visible) { for (var i = 0; i < items.length; i++) items[i].setVisible(visible); }
  function medalFor(floor, seconds) {
    if (seconds <= floor.par * 0.72) return 3;
    if (seconds <= floor.par) return 2;
    if (seconds <= floor.par * 1.30) return 1;
    return 0;
  }
  function medalText(m) { return m === 3 ? 'GOLD' : m === 2 ? 'SILVER' : m === 1 ? 'BRONZE' : 'NO MEDAL'; }
  function medalColor(m) { return m === 3 ? PAL.gold : m === 2 ? 0xd7e2f1 : m === 1 ? 0xe69c68 : PAL.dim; }

  var boot = window.__dd || { state: {}, forceFloor: 0, forceMode: '' };
  var DD_STATE = boot.state || {};
  DD_STATE.mode = DD_STATE.mode || 'menu';
  DD_STATE.floor = Number(DD_STATE.floor) || 1;
  DD_STATE.room = Number(DD_STATE.room) || 1;
  DD_STATE.keys = Number(DD_STATE.keys) || 0;
  DD_STATE.time = Number(DD_STATE.time) || 0;
  DD_STATE.seed = Number(DD_STATE.seed) || dailySeed();
  DD_STATE.forceFloor = Number(DD_STATE.forceFloor) || 0;
  DD_STATE.forceMode = DD_STATE.forceMode || '';
  var debugApi = { state: DD_STATE, forceFloor: boot.forceFloor || 0, forceMode: boot.forceMode || '' };
  window.__dd = debugApi;

  function defaultProfile() { return { version: 1, medals: {}, bestTimes: {}, dailyBest: {}, gauntletBest: 0, unlockedFloor: 1 }; }
  function validProfile(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o) || o.version !== 1) return false;
    if (own(o, 'tutorialSeen') && typeof o.tutorialSeen !== 'boolean') return false;
    if (!o.medals || typeof o.medals !== 'object' || Array.isArray(o.medals)) return false;
    if (!o.bestTimes || typeof o.bestTimes !== 'object' || Array.isArray(o.bestTimes)) return false;
    if (!o.dailyBest || typeof o.dailyBest !== 'object' || Array.isArray(o.dailyBest)) return false;
    if (!Number.isFinite(o.gauntletBest) || o.gauntletBest < 0 || o.gauntletBest > 99999) return false;
    if (!Number.isInteger(o.unlockedFloor) || o.unlockedFloor < 1 || o.unlockedFloor > FLOORS.length) return false;
    for (var k in o.medals) if (own(o.medals, k) && (!own(FLOOR_BY_ID, k) || !Number.isInteger(o.medals[k]) || o.medals[k] < 0 || o.medals[k] > 3)) return false;
    for (var t in o.bestTimes) if (own(o.bestTimes, t) && (!own(FLOOR_BY_ID, t) || !Number.isFinite(o.bestTimes[t]) || o.bestTimes[t] < 0 || o.bestTimes[t] > 99999)) return false;
    for (var d in o.dailyBest) { var dailyParts = d.split(':'); if (own(o.dailyBest, d) && (!/^\d{8}:[a-z]+$/.test(d) || !own(FLOOR_BY_ID, dailyParts[1]) || !Number.isFinite(o.dailyBest[d]) || o.dailyBest[d] < 0 || o.dailyBest[d] > 99999)) return false; }
    return true;
  }

  var App = { phaser: null, scene: null };
  var kit = GGKit.create({
    slug: 'deadline-dungeon', orientation: 'portrait', validateSave: validProfile,
    onPause: function () { if (App.scene) { App.scene.pausedByKit = true; App.scene.pointerClaims = {}; App.scene.keyPrev = {}; App.scene.gamepadPrev = {}; } },
    onResume: function () { if (App.scene) { App.scene.pausedByKit = false; App.scene.pointerClaims = {}; App.scene.keyPrev = {}; App.scene.gamepadPrev = {}; } },
    onRestart: function () { if (App.scene) { App.scene.restartRequested = true; App.scene.pointerClaims = {}; App.scene.keyPrev = {}; App.scene.gamepadPrev = {}; } }
  });
  kit.audio.register({
    ambient: 'assets/ambient-drone.mp3', cryptTheme: 'assets/crypt-theme.mp3', cisternTheme: 'assets/cistern-theme.mp3',
    forgeTheme: 'assets/forge-theme.mp3', vaultTheme: 'assets/vault-theme.mp3', dangerSting: 'assets/danger-sting.mp3',
    slash: 'assets/slash.mp3', dash: 'assets/dash.mp3', hit: 'assets/hit.mp3', hurt: 'assets/hurt.mp3',
    pickup: 'assets/pickup.mp3', gate: 'assets/gate.mp3', door: 'assets/gate.mp3', medal: 'assets/medal.mp3', step: 'assets/step.mp3',
    secret: 'assets/secret.mp3', ui: 'assets/ui.mp3', danger: 'assets/danger.mp3'
  });
  kit.input.gamepad = function () {
    var pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    var pad = null; for (var pi = 0; pi < pads.length; pi++) if (pads[pi] && pads[pi].connected) { pad = pads[pi]; break; }
    if (!pad) return { x: 0, y: 0, attack: false, dash: false, use: false, pause: false };
    var axis = function (n) { var v = Number(pad.axes[n] || 0); return Math.abs(v) < .18 ? 0 : clamp(v, -1, 1); };
    var button = function (n) { return !!(pad.buttons[n] && pad.buttons[n].pressed); };
    return { x: axis(0), y: axis(1), attack: button(0), dash: button(1), use: button(2), pause: button(9) };
  };
  kit.registerPWA();
  kit.loader.show('DEADLINE DUNGEON');
  kit.loader.progress(0.18);
  var profile = kit.save.get(null) || defaultProfile();
  var practiceCounter = 0;

  if (!own(profile, 'tutorialSeen')) profile.tutorialSeen = false;
  function saveProfile() { kit.save.set(profile); }
  function unlockedFloor(index) {
    if (index <= 1) return true;
    var previous = floorFor(index - 1);
    var required = index === 2 ? 1 : index === 3 ? 2 : 3;
    return Number(profile.medals[previous.id] || 0) >= required;
  }
  function refreshUnlocks() {
    var highest = 1;
    for (var i = 1; i <= FLOORS.length; i++) if (unlockedFloor(i)) highest = i;
    profile.unlockedFloor = highest;
  }

  function canvasRoundRect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  function drawPixelHero(c, ox, state, frame) {
    var bob = state === 'idle' ? frame * 1 : state === 'run' ? (frame ? -1 : 1) : 0;
    var cloak = state === 'dash' ? '#65e4bf' : '#d7f4e8';
    c.save(); c.translate(ox, 16 + bob); c.imageSmoothingEnabled = false;
    if (state === 'dash') { c.fillStyle = '#65e4bf'; c.fillRect(-13, -4, 26, 8); c.fillStyle = '#dbfff4'; c.fillRect(-8, -7, 17, 14); }
    else {
      c.fillStyle = '#162635'; c.fillRect(-9, 4, 18, 9); c.fillStyle = cloak; c.fillRect(-8, -2, 16, 14);
      c.fillStyle = '#9af5d2'; c.fillRect(-6, -10, 12, 9); c.fillStyle = '#173042'; c.fillRect(2, -7, 3, 3);
      c.fillStyle = '#65e4bf'; c.fillRect(-12, 8, 5, 4); c.fillRect(7, 8, 5, 4);
      if (state === 'attack') { c.strokeStyle = '#f5f1e3'; c.lineWidth = 3; c.beginPath(); c.moveTo(8, -2); c.lineTo(15, -10); c.stroke(); }
      if (state === 'hurt') { c.fillStyle = '#ff6f83'; c.fillRect(-12, -12, 4, 4); c.fillRect(8, -12, 4, 4); }
    }
    c.restore();
  }
  function drawPixelEnemy(c, ox, type, state, frame) {
    var def = enemyFor(type), col = colorCss(def.color), bob = state === 'run' ? (frame ? -1 : 1) : 0;
    c.save(); c.translate(ox, 16 + bob); c.imageSmoothingEnabled = false; c.fillStyle = col;
    if (type === 'warden') { c.fillRect(-13, -13, 26, 26); c.fillStyle = '#211a30'; c.fillRect(-8, -8, 16, 16); c.fillStyle = '#ffdc82'; c.fillRect(-3, -4, 6, 4); c.strokeStyle = '#fff0be'; c.lineWidth = 2; c.strokeRect(-12, -12, 24, 24); }
    else if (type === 'brute') { c.fillRect(-12, -10, 24, 20); c.fillStyle = '#4b2730'; c.fillRect(-6, -5, 12, 6); c.fillRect(-15, 6, 6, 5); c.fillRect(9, 6, 6, 5); }
    else if (type === 'archer') { c.beginPath(); c.moveTo(0, -13); c.lineTo(12, 0); c.lineTo(0, 13); c.lineTo(-12, 0); c.closePath(); c.fill(); c.fillStyle = '#3a2a31'; c.fillRect(-4, -4, 8, 8); }
    else if (type === 'skitter') { c.fillRect(-4, -13, 8, 26); c.fillRect(-13, -4, 26, 8); c.fillStyle = '#351c3c'; c.fillRect(-3, -3, 6, 6); }
    else { c.fillRect(-10, -8, 20, 16); c.fillStyle = '#351d36'; c.fillRect(1, -4, 5, 5); c.fillRect(-14, 5, 5, 3); c.fillRect(9, 5, 5, 3); }
    if (state === 'attack') { c.fillStyle = '#ffe8a5'; c.fillRect(-15, -2, 5, 4); c.fillRect(10, -2, 5, 4); }
    if (state === 'hurt') { c.fillStyle = '#ffffff'; c.fillRect(-13, -13, 5, 5); c.fillRect(8, 8, 5, 5); }
    c.restore();
  }

  function Scene() { Phaser.Scene.call(this, { key: 'deadline-dungeon' }); }
  Scene.prototype = Object.create(Phaser.Scene.prototype);
  Scene.prototype.constructor = Scene;

  Scene.prototype.create = function () {
    App.scene = this; this.pausedByKit = false; this.restartRequested = false; this.accumulator = 0; this.simTime = 0; this.uiTime = 0;
    this.selectedFloor = clamp(Number(DD_STATE.floor) || 1, 1, FLOORS.length); this.pointerClaims = {}; this.keyPrev = {}; this.gamepadPrev = {}; this.control = {};
    this.run = null; this.room = null; this.player = null; this.enemies = []; this.bolts = []; this.pickups = []; this.hazards = [];
    this.toastQueue = []; this.toastValue = ''; this.toastTime = 0; this.tutorialAge = 0;
    this.fx = []; this.fxViews = []; this.enemyViews = []; this.pickupViews = []; this.hazardViews = [];
    this.buildTextures(); this.buildWorld(); this.buildUi(); this.buildPools();
    this.updateModeVisibility(); this.updateDebugState(); kit.loader.progress(1); kit.loader.hide();
  };

  Scene.prototype.buildTextures = function () {
    var t = this.textures, c, x, i, states = ['idle', 'run', 'attack', 'dash', 'hurt'];
    c = document.createElement('canvas'); c.width = 32 * 10; c.height = 32; x = c.getContext('2d');
    for (i = 0; i < states.length; i++) for (var f = 0; f < 2; f++) { drawPixelHero(x, i * 64 + f * 32 + 16, states[i], f); }
    this.heroTexture = t.addCanvas('dd-hero-sheet', c);
    for (i = 0; i < states.length; i++) for (var hf = 0; hf < 2; hf++) this.heroTexture.add('hero' + states[i] + hf, 0, i * 64 + hf * 32, 0, 32, 32);
    c = document.createElement('canvas'); c.width = 32 * 50; c.height = 32; x = c.getContext('2d');
    var allTypes = ['wisp', 'archer', 'brute', 'skitter', 'warden'];
    for (var ti = 0; ti < allTypes.length; ti++) for (var si = 0; si < states.length; si++) for (var ef = 0; ef < 2; ef++) {
      drawPixelEnemy(x, (ti * 10 + si * 2 + ef) * 32 + 16, allTypes[ti], states[si], ef);
    }
    this.enemyTexture = t.addCanvas('dd-enemy-sheet', c);
    for (var et = 0; et < allTypes.length; et++) for (var es = 0; es < states.length; es++) for (var efr = 0; efr < 2; efr++) this.enemyTexture.add('enemy' + allTypes[et] + states[es] + efr, 0, (et * 10 + es * 2 + efr) * 32, 0, 32, 32);
    function smallTexture(scene, key, color) {
      var q = document.createElement('canvas'); q.width = 16; q.height = 16; var z = q.getContext('2d'); z.fillStyle = colorCss(color); z.fillRect(2, 2, 12, 12); z.fillStyle = '#ffffff'; z.fillRect(6, 0, 4, 4); z.fillRect(6, 12, 4, 4); z.fillRect(0, 6, 4, 4); z.fillRect(12, 6, 4, 4); return scene.textures.addCanvas(key, q);
    }
    smallTexture(this, 'dd-spark', PAL.white); smallTexture(this, 'dd-dust', 0xb8c4d8); smallTexture(this, 'dd-puzzle', PAL.violet); smallTexture(this, 'dd-escape', PAL.gold); smallTexture(this, 'dd-key', PAL.gold); smallTexture(this, 'dd-potion', 0xff7187); smallTexture(this, 'dd-charge', PAL.mint); smallTexture(this, 'dd-hazard', 0xff6f83);
    var ring = document.createElement('canvas'); ring.width = 96; ring.height = 96; var rc = ring.getContext('2d'); rc.strokeStyle = '#65e4bf'; rc.lineWidth = 4; rc.beginPath(); rc.arc(48, 48, 38, 0, TAU); rc.stroke(); t.addCanvas('dd-ring', ring);
    this.bakeChrome(); this.roomCanvas = document.createElement('canvas'); this.roomCanvas.width = W; this.roomCanvas.height = H; this.roomTexture = t.addCanvas('dd-room-board', this.roomCanvas);
  };

  Scene.prototype.bakeChrome = function () {
    var c = document.createElement('canvas'); c.width = W; c.height = H; var x = c.getContext('2d');
    x.fillStyle = '#090c17'; x.fillRect(0, 0, W, H); x.fillStyle = '#0f1525'; x.fillRect(0, 0, W, 138); x.fillStyle = '#10192a'; x.fillRect(0, 716, W, 128);
    x.strokeStyle = '#273553'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, 136); x.lineTo(W, 136); x.moveTo(0, 714); x.lineTo(W, 714); x.stroke();
    x.strokeStyle = '#1c2944'; x.lineWidth = 1; x.beginPath(); x.moveTo(20, 59); x.lineTo(370, 59); x.moveTo(20, 113); x.lineTo(370, 113); x.stroke();
    x.fillStyle = '#15233b'; canvasRoundRect(x, 20, 740, 108, 79, 16); x.fill(); x.strokeStyle = '#365170'; x.stroke();
    x.fillStyle = '#263655'; canvasRoundRect(x, 205, 751, 90, 70, 16); x.fill(); x.strokeStyle = '#49637e'; x.stroke();
    x.fillStyle = '#263655'; canvasRoundRect(x, 306, 652, 64, 62, 16); x.fill(); x.strokeStyle = '#49637e'; x.stroke();
    x.fillStyle = '#1c2b49'; canvasRoundRect(x, 144, 751, 50, 60, 12); x.fill(); x.strokeStyle = '#365170'; x.stroke();
    this.chromeTexture = this.textures.addCanvas('dd-chrome', c); this.chromeImage = this.add.image(0, 0, 'dd-chrome').setOrigin(0).setDepth(50);
  };

  Scene.prototype.buildWorld = function () {
    this.worldRoot = this.add.container(0, 0).setDepth(2);
    this.roomImage = this.add.image(0, 0, 'dd-room-board').setOrigin(0); this.worldRoot.add(this.roomImage);
    this.keyView = this.add.image(0, 0, 'dd-key').setVisible(false).setScale(1.5); this.worldRoot.add(this.keyView);
    this.shortcutView = this.add.image(0, 0, 'dd-ring').setVisible(false).setScale(0.45); this.worldRoot.add(this.shortcutView);
    this.puzzleView = this.add.image(0, 0, 'dd-ring').setVisible(false).setScale(0.45); this.worldRoot.add(this.puzzleView);
    this.gateGlow = this.add.image(ROOM.gateX, ROOM.gateY, 'dd-ring').setVisible(false).setScale(0.72); this.worldRoot.add(this.gateGlow);
    this.torchViews = [this.add.image(54, 194, 'dd-ring').setScale(.34).setTint(PAL.gold), this.add.image(336, 194, 'dd-ring').setScale(.34).setTint(PAL.gold)]; this.worldRoot.add(this.torchViews);
    this.gateLeft = this.add.rectangle(ROOM.gateX - 10, ROOM.gateY, 8, 106, PAL.dim, 1).setVisible(false); this.gateRight = this.add.rectangle(ROOM.gateX + 10, ROOM.gateY, 8, 106, PAL.dim, 1).setVisible(false); this.worldRoot.add([this.gateLeft, this.gateRight]);
    this.playerView = this.add.image(0, 0, 'dd-hero-sheet', 'heroidle0').setOrigin(0.5).setScale(1.45).setVisible(false); this.worldRoot.add(this.playerView);
  };

  Scene.prototype.buildUi = function () {
    var text = function (scene, x, y, value, style) { return scene.add.text(x, y, value, style).setDepth(60); };
    var base = { fontFamily: 'ui-sans-serif, system-ui, sans-serif', color: '#f5f1e3' };
    this.hudMode = text(this, 20, 12, 'D · EXPLORE', Object.assign({}, base, { fontSize: '14px', color: '#67d9b5', fontStyle: 'bold' }));
    this.hudTime = text(this, 370, 10, '00:00.00', Object.assign({}, base, { fontFamily: 'ui-monospace, monospace', fontSize: '20px', fontStyle: 'bold', align: 'right' })).setOrigin(1, 0);
    this.hudFloor = text(this, 20, 43, 'F01 · R01', Object.assign({}, base, { fontSize: '14px', fontStyle: 'bold' }));
    this.hudKeys = text(this, 150, 43, '◇ 0/0', Object.assign({}, base, { fontSize: '14px', color: '#ffd16a', fontStyle: 'bold' }));
    this.hudMedal = text(this, 370, 43, 'PAR --', Object.assign({}, base, { fontSize: '14px', color: '#aeb9d5', fontStyle: 'bold', align: 'right' })).setOrigin(1, 0);
    this.hpText = text(this, 20, 72, '♥ 3/3 · ◆1', Object.assign({}, base, { fontSize: '14px', color: '#ffb7b9', fontStyle: 'bold' }));
    this.dashText = text(this, 338, 675, '◆', Object.assign({}, base, { fontSize: '18px', color: '#65e4bf', fontStyle: 'bold', align: 'center' })).setOrigin(0.5);
    this.coachBg = this.add.rectangle(195, 125, 350, 24, 0x0d1626, 0.82).setDepth(59).setVisible(false);
    this.coach = text(this, 20, 116, '', Object.assign({}, base, { fontSize: '14px', color: '#8c9bb9', fontStyle: 'bold' }));
    this.controlText = text(this, 259, 780, '✦', Object.assign({}, base, { fontSize: '18px', fontStyle: 'bold', align: 'center' })).setOrigin(0.5);
    this.useText = text(this, 169, 780, '◎', Object.assign({}, base, { fontSize: '18px', color: '#aeb9d5', fontStyle: 'bold', align: 'center' })).setOrigin(0.5);
    this.menuTitle = text(this, 195, 160, 'A DAILY-SEED DUNGEON TIME ATTACK', Object.assign({}, base, { fontSize: '12px', color: '#aeb9d5', fontStyle: 'bold', align: 'center' })).setOrigin(0.5);
    this.menuSeed = text(this, 195, 185, 'TODAY\'S SEED  ------', Object.assign({}, base, { fontSize: '11px', color: '#67d9b5', fontStyle: 'bold', align: 'center' })).setOrigin(0.5);
    this.menuHint = text(this, 195, 576, '1-4 SELECT FLOOR   D DAILY   P PRACTICE   G GAUNTLET   O SETTINGS', Object.assign({}, base, { fontSize: '8px', color: '#65718f', fontStyle: 'bold', align: 'center', wordWrap: { width: 350 } })).setOrigin(0.5);
    this.menuFloorTexts = []; this.menuFloorSub = [];
    for (var i = 0; i < FLOORS.length; i++) { this.menuFloorTexts.push(text(this, 32 + (i % 2) * 177, 241 + Math.floor(i / 2) * 106, '', Object.assign({}, base, { fontSize: '12px', fontStyle: 'bold' }))); this.menuFloorSub.push(text(this, 32 + (i % 2) * 177, 263 + Math.floor(i / 2) * 106, '', Object.assign({}, base, { fontSize: '9px', color: '#aeb9d5' }))); }
    this.menuButtons = [];
    for (var b = 0; b < 3; b++) this.menuButtons.push(this.add.rectangle(0, 0, 1, 1, 0x1b2b44, 1).setDepth(55));
    this.menuDaily = text(this, 105, 644, 'DAILY SPEEDRUN', Object.assign({}, base, { fontSize: '11px', fontStyle: 'bold', align: 'center' })).setOrigin(0.5);
    this.menuPractice = text(this, 284, 644, 'PRACTICE [P]', Object.assign({}, base, { fontSize: '11px', fontStyle: 'bold', align: 'center' })).setOrigin(0.5);
    this.menuGauntlet = text(this, 195, 703, 'START GAUNTLET [G]', Object.assign({}, base, { fontSize: '12px', color: '#ffd16a', fontStyle: 'bold', align: 'center' })).setOrigin(0.5);
    this.resultShade = this.add.rectangle(195, 422, 390, 844, PAL.ink, 0.92).setDepth(70);
    this.resultKicker = text(this, 195, 158, '', Object.assign({}, base, { fontSize: '11px', color: '#65e4bf', fontStyle: 'bold', align: 'center' })).setOrigin(0.5);
    this.resultTitle = text(this, 195, 186, '', Object.assign({}, base, { fontSize: '24px', fontStyle: 'bold', align: 'center', wordWrap: { width: 350 } })).setOrigin(0.5, 0);
    this.resultScore = text(this, 195, 258, '', Object.assign({}, base, { fontFamily: 'ui-monospace, monospace', fontSize: '30px', fontStyle: 'bold', align: 'center' })).setOrigin(0.5);
    this.resultMedal = text(this, 195, 306, '', Object.assign({}, base, { fontSize: '14px', fontStyle: 'bold', align: 'center' })).setOrigin(0.5);
    this.resultCopy = text(this, 195, 338, '', Object.assign({}, base, { fontSize: '10px', color: '#aeb9d5', align: 'center', wordWrap: { width: 320 } })).setOrigin(0.5, 0);
    this.resultButtons = [];
    for (var rb = 0; rb < 3; rb++) this.resultButtons.push(this.add.rectangle(195, 0, 280, 50, rb === 0 ? 0x1c4d47 : 0x1b2b44, 1).setDepth(72));
    this.resultAction = text(this, 195, 405, '', Object.assign({}, base, { fontSize: '12px', fontStyle: 'bold', align: 'center' })).setOrigin(0.5);
    this.resultRetry = text(this, 195, 471, '', Object.assign({}, base, { fontSize: '12px', fontStyle: 'bold', align: 'center' })).setOrigin(0.5);
    this.resultMenu = text(this, 195, 537, 'BACK TO FLOOR SELECT', Object.assign({}, base, { fontSize: '11px', color: '#aeb9d5', fontStyle: 'bold', align: 'center' })).setOrigin(0.5);
    this.resultKicker.setDepth(75); this.resultTitle.setDepth(75); this.resultScore.setDepth(75); this.resultMedal.setDepth(75); this.resultCopy.setDepth(75); this.resultAction.setDepth(75); this.resultRetry.setDepth(75); this.resultMenu.setDepth(75);
    this.damageFlashView = this.add.rectangle(195, 422, 390, 844, PAL.danger, 0).setDepth(86);
    this.transitionShade = this.add.rectangle(195, 422, 390, 844, PAL.ink, 0).setDepth(90).setVisible(false);
    this.menuItems = [this.menuTitle, this.menuSeed, this.menuHint, this.menuDaily, this.menuPractice, this.menuGauntlet].concat(this.menuFloorTexts, this.menuFloorSub, this.menuButtons);
    this.resultItems = [this.resultShade, this.resultKicker, this.resultTitle, this.resultScore, this.resultMedal, this.resultCopy, this.resultAction, this.resultRetry, this.resultMenu].concat(this.resultButtons);
  };

  Scene.prototype.buildPools = function () {
    for (var i = 0; i < MAX_ENEMIES; i++) { var es = this.add.image(0, 0, 'dd-enemy-sheet').setOrigin(0.5).setScale(1.45).setVisible(false).setDepth(15); var eb = this.add.rectangle(0, 0, 30, 3, PAL.danger, 1).setVisible(false).setDepth(16); this.worldRoot.add([es, eb]); this.enemyViews.push({ sprite: es, bar: eb, state: '', frame: 0 }); }
    for (i = 0; i < MAX_PICKUPS; i++) { var ps = this.add.image(0, 0, 'dd-charge').setOrigin(0.5).setScale(1.2).setVisible(false).setDepth(13); this.worldRoot.add(ps); this.pickupViews.push(ps); }
    for (i = 0; i < 8; i++) { var hz = this.add.image(0, 0, 'dd-hazard').setOrigin(0.5).setVisible(false).setDepth(8); this.worldRoot.add(hz); this.hazardViews.push(hz); }
    for (i = 0; i < MAX_BOLTS; i++) this.bolts.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, heavy: false });
    for (i = 0; i < MAX_BOLTS + MAX_FX; i++) { var fx = i < MAX_BOLTS ? null : { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, color: PAL.white, type: 'spark' }; if (fx) this.fx.push(fx); var fv = this.add.image(0, 0, 'dd-spark').setOrigin(0.5).setVisible(false).setDepth(25); this.worldRoot.add(fv); this.fxViews.push(fv); }
  };

  Scene.prototype.makeRoom = function (floor, index, random, gauntletLevel) {
    var difficulty = Math.max(0, Number(gauntletLevel) || 0);
    var room = { number: index + 1, name: floor.rooms[index] || 'UNKNOWN ROOM', kind: index === 4 ? 'boss' : index === 1 || index === 3 ? 'detour' : index === 2 ? 'hazard' : 'entry', obstacles: [], hazards: [], enemies: [], pickups: [], key: null, shortcut: null, puzzle: null, landmark: index === 3 ? floor.signature : '' };
    var layouts = [
      [{ x: 145, y: 258, w: 38, h: 110 }, { x: 246, y: 468, w: 54, h: 36 }],
      [{ x: 124, y: 226, w: 42, h: 160 }, { x: 232, y: 470, w: 84, h: 36 }],
      [{ x: 116, y: 300, w: 72, h: 40 }, { x: 246, y: 230, w: 40, h: 140 }, { x: 216, y: 516, w: 92, h: 34 }],
      [{ x: 102, y: 242, w: 44, h: 120 }, { x: 232, y: 242, w: 44, h: 120 }, { x: 165, y: 488, w: 68, h: 38 }],
      [{ x: 115, y: 245, w: 50, h: 50 }, { x: 225, y: 245, w: 50, h: 50 }, { x: 115, y: 510, w: 50, h: 50 }, { x: 225, y: 510, w: 50, h: 50 }]
    ];
    var source = layouts[index] || layouts[0]; for (var oi = 0; oi < source.length; oi++) room.obstacles.push({ x: source[oi].x, y: source[oi].y, w: source[oi].w, h: source[oi].h });
    var baseTypes = index === 4 ? ['warden', 'wisp', 'archer'] : index === 0 ? ['wisp', 'wisp', 'archer'] : index === 1 ? ['skitter', 'wisp', 'archer', 'skitter'] : index === 2 ? ['brute', 'wisp', 'skitter', 'archer'] : ['archer', 'brute', 'skitter', 'wisp'];
    var count = index === 4 ? 3 + difficulty : 3 + Math.min(2, difficulty) + (index === 2 ? 1 : 0);
    for (var ei = 0; ei < count; ei++) {
      var type = baseTypes[ei % baseTypes.length] || 'wisp', ed = enemyFor(type), ex = 0, ey = 0, valid = false;
      for (var attempt = 0; attempt < 14 && !valid; attempt++) { var a = random() * TAU, radius = 145 + random() * 85; ex = clamp(238 + Math.cos(a) * radius, ROOM.left + ed.radius + 14, ROOM.right - ed.radius - 14); ey = clamp(425 + Math.sin(a) * 195, ROOM.top + ed.radius + 14, ROOM.bottom - ed.radius - 14); valid = safeRoomSpot(room, ex, ey, ed.radius); }
      if (!valid) { ex = type === 'warden' ? 314 : 250; ey = type === 'warden' ? 430 : 560; }
      room.enemies.push({ type: type, x: ex, y: ey, hp: ed.hp + difficulty, maxHp: ed.hp + difficulty, phase: random() * TAU, shotTimer: 1.2 + random(), hurt: 0, knockX: 0, knockY: 0, contact: 0, state: 'idle', anim: 0 });
    }
    if (room.kind === 'detour') { room.key = { x: 300, y: 230 + random() * 260, collected: false, pulse: random() * TAU }; room.shortcut = { x: 70, y: 250 + random() * 230, discovered: false, skip: 2 }; }
    if (index === 3) room.key = { x: 300, y: 540, collected: false, pulse: random() * TAU };
    if (room.key && roomBlocked(room, room.key.x, room.key.y, 18)) room.key.x = 320, room.key.y = 218;
    var puzzleSpots = [{ x: 92, y: 232 }, { x: 86, y: 470 }, { x: 300, y: 210 }, { x: 84, y: 600 }, { x: 300, y: 600 }], puzzleSpot = puzzleSpots[index];
    if (!safeRoomSpot(room, puzzleSpot.x, puzzleSpot.y, 22)) puzzleSpot = { x: index % 2 ? 92 : 300, y: index < 2 ? 210 : 590 };
    var sequences = [[2, 1, 3], [3, 1, 2], [1, 3, 2], [2, 3, 1]];
    room.puzzle = { x: puzzleSpot.x, y: puzzleSpot.y, sequence: sequences[index % sequences.length].slice(), cursor: 1, progress: 0, wrong: 0, active: false, solved: false, pop: 0, label: index === 0 ? 'BELL TONE' : index === 1 ? 'LOCK RUNE' : index === 2 ? 'DRAIN SIGIL' : index === 3 ? 'HEART SEAL' : 'FINAL RUNE' };
    var dropSpots = [{ x: 82, y: 235 }, { x: 82, y: 545 }, { x: 300, y: 350 }, { x: 188, y: 610 }, { x: 306, y: 610 }];
    for (var pi = 0; pi < dropSpots.length; pi++) { var drop = dropSpots[pi]; if (!safeRoomSpot(room, drop.x, drop.y, 14)) drop = { x: 70 + (pi % 3) * 125, y: 600 - Math.floor(pi / 3) * 110 }; room.pickups.push({ type: pi % 2 === 0 ? 'potion' : 'charge', x: drop.x, y: drop.y, active: true, pulse: random() * TAU, pop: 0 }); }
    var hazardCount = floor.id === 'vault' ? 4 : 3;
    for (var hi = 0; hi < hazardCount; hi++) {
      var hw = floor.id === 'vault' ? 86 : 58, hh = floor.id === 'vault' ? 24 : 40, hx = 70 + (hi % 2) * 170 + random() * 30, hy = 235 + Math.floor(hi / 2) * 190 + random() * 28;
      for (var hAttempt = 0; hAttempt < 8 && roomBlocked(room, hx + hw / 2, hy + hh / 2, Math.min(hw, hh) / 2); hAttempt++) { hx = 60 + random() * 240; hy = 220 + random() * 390; }
      room.hazards.push({ x: hx, y: hy, w: hw, h: hh, timer: random() * 2, phase: random() * TAU, active: false, warning: false, type: floor.id, level: difficulty });
    }
    return room;
  };
  Scene.prototype.buildRooms = function (floor, seed, gauntletLevel) {
    var random = rng((seed ^ hash32(floor.seed || 0x9e37) ^ gauntletLevel * 0x51ed) >>> 0), rooms = [];
    for (var i = 0; i < 5; i++) rooms.push(this.makeRoom(floor, i, random, gauntletLevel));
    return rooms;
  };

  Scene.prototype.startRun = function (mode, floorNo) {
    refreshUnlocks(); var no = clamp(Number(floorNo) || this.selectedFloor || 1, 1, FLOORS.length); if (mode !== 'gauntlet' && !unlockedFloor(no) && !(debugApi.forceFloor || DD_STATE.forceFloor)) no = 1;
    var seed = mode === 'daily' ? dailySeed() : mode === 'practice' ? hash32((Date.now() ^ Math.floor(performance.now()) ^ (++practiceCounter * 0x4a39)) >>> 0) : hash32((dailySeed() ^ 0xA77A1E ^ 0x4a39) >>> 0);
    var floor = floorFor(no);
    this.run = { mode: mode, seed: seed, floorNo: no, floorTime: 0, totalTime: 0, roomIndex: 0, keys: 0, skippedKeys: 0, hp: 3, maxHp: 3, dashCharges: 1, damageFlash: 0, phase: 'explore', rooms: [], medal: 0, resultReady: 0, shortcutUsed: false, totalKeys: 0, deadline: floor.deadline, dangerWarned: false, stepTimer: 0, keyTick: 0, timeout: false };
    this.run.rooms = this.buildRooms(floor, seed, mode === 'gauntlet' ? 1 : 0); this.run.totalKeys = this.countKeys(this.run.rooms); this.toastQueue = []; this.toastValue = ''; this.toastTime = 0; this.tutorialActive = !profile.tutorialSeen; this.tutorialAge = 0; this.loadRoom(0, true); DD_STATE.mode = mode; this.playFloorMusic(floor); this.updateModeVisibility(); this.updateDebugState();
  };
  Scene.prototype.playFloorMusic = function (floor) { kit.audio.music(floor.id === 'crypt' ? 'cryptTheme' : floor.id === 'cistern' ? 'cisternTheme' : floor.id === 'forge' ? 'forgeTheme' : 'vaultTheme', 450); };
  Scene.prototype.countKeys = function (rooms) { var n = 0; for (var i = 0; i < rooms.length; i++) if (rooms[i].key) n++; return n; };
  Scene.prototype.loadRoom = function (index, first) {
    var room = this.run.rooms[index] || this.run.rooms[0]; this.room = room; this.run.roomIndex = index; this.run.phase = 'explore'; this.player = { x: 55, y: ROOM.gateY, r: 12, faceX: 1, faceY: 0, attack: 0, attackCooldown: 0, attackHit: false, dash: 0, dashCooldown: 0, invuln: first ? 0.45 : 0.25, hurt: 0, anim: 0, dashX: 1, dashY: 0 };
    this.enemies = []; for (var i = 0; i < room.enemies.length; i++) this.enemies.push(Object.assign({}, room.enemies[i]));
    this.pickups = []; for (i = 0; i < room.pickups.length; i++) this.pickups.push(Object.assign({}, room.pickups[i]));
    this.hazards = []; for (i = 0; i < room.hazards.length; i++) this.hazards.push(Object.assign({}, room.hazards[i]));
    this.key = room.key ? Object.assign({}, room.key) : null; this.puzzle = room.puzzle ? Object.assign({}, room.puzzle, { sequence: room.puzzle.sequence.slice() }) : null; this.gate = { amount: 0, target: false, pulse: 0 }; this.toastQueue = []; this.toastValue = ''; this.toastTime = 0; this.queueToast('ROOM ' + String(room.number).padStart(2, '0') + ' · ' + room.name, .8);
    this.bakeRoom(room); this.renderRoomViews(); for (i = 0; i < 10; i++) this.emitFx(55 + i * 25, ROOM.gateY + (i % 3) * 12, floorFor(this.run.floorNo).accent, 'dust');
  };

  Scene.prototype.bakeRoom = function (room) {
    var floor = floorFor(this.run.floorNo), c = this.roomCanvas.getContext('2d'), hue = colorCss(floor.floor), wall = colorCss(floor.wall);
    c.clearRect(0, 0, W, H); c.fillStyle = colorCss(floor.bg); c.fillRect(0, 0, W, H); c.fillStyle = '#1b2337'; c.fillRect(0, 138, W, 8); c.fillStyle = '#0b101c'; c.fillRect(0, 708, W, 8);
    c.fillStyle = hue; canvasRoundRect(c, ROOM.left, ROOM.top, ROOM.right - ROOM.left, ROOM.bottom - ROOM.top, 18); c.fill();
    c.save(); c.beginPath(); canvasRoundRect(c, ROOM.left, ROOM.top, ROOM.right - ROOM.left, ROOM.bottom - ROOM.top, 18); c.clip();
    for (var gy = ROOM.top; gy < ROOM.bottom; gy += 32) for (var gx = ROOM.left; gx < ROOM.right; gx += 32) {
      var tile = ((gx / 32 + gy / 32 + room.number) % 3 === 0) ? 'rgba(255,255,255,.045)' : 'rgba(0,0,0,.06)';
      c.fillStyle = tile; c.fillRect(gx + 1, gy + 1, 30, 30); c.strokeStyle = 'rgba(255,255,255,.06)'; c.lineWidth = 1; c.strokeRect(gx + 1, gy + 1, 30, 30);
    }
    c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(ROOM.left, ROOM.top + 10, ROOM.right - ROOM.left, 4); c.fillRect(ROOM.left, ROOM.bottom - 14, ROOM.right - ROOM.left, 4); c.fillRect(ROOM.left + 10, ROOM.top, 4, ROOM.bottom - ROOM.top); c.fillRect(ROOM.right - 14, ROOM.top, 4, ROOM.bottom - ROOM.top);
    c.strokeStyle = colorCss(floor.accent); c.globalAlpha = .22; c.lineWidth = 2; for (var edge = ROOM.left + 16; edge < ROOM.right - 12; edge += 32) { c.beginPath(); c.moveTo(edge, ROOM.top + 6); c.lineTo(edge + 12, ROOM.top + 14); c.moveTo(edge, ROOM.bottom - 6); c.lineTo(edge + 12, ROOM.bottom - 14); c.stroke(); } c.globalAlpha = 1;
    c.fillStyle = 'rgba(255,255,255,.05)'; for (var d = 0; d < 22; d++) { var dx = 42 + ((d * 47 + room.number * 13) % 300), dy = 180 + ((d * 61 + room.number * 23) % 485); c.fillRect(dx, dy, 2 + d % 3, 2); if (d % 4 === 0) c.fillRect(dx + 5, dy + 5, 8, 1); }
    if (floor.id === 'cistern') { c.strokeStyle = 'rgba(94,219,224,.28)'; for (var wave = 0; wave < 5; wave++) { c.beginPath(); c.arc(195, 430, 48 + wave * 26, Math.PI * .08, Math.PI * .92); c.stroke(); } }
    if (floor.id === 'forge') { c.strokeStyle = 'rgba(255,155,77,.22)'; for (var plate = 0; plate < 5; plate++) c.strokeRect(55 + plate * 58, 400 + (plate % 2) * 12, 42, 22); }
    if (floor.id === 'vault') { c.strokeStyle = 'rgba(209,165,255,.25)'; c.lineWidth = 2; c.beginPath(); c.arc(195, 430, 98, 0, TAU); c.stroke(); for (var tick = 0; tick < 12; tick++) { var ta = tick * TAU / 12; c.beginPath(); c.moveTo(195 + Math.cos(ta) * 86, 430 + Math.sin(ta) * 86); c.lineTo(195 + Math.cos(ta) * 96, 430 + Math.sin(ta) * 96); c.stroke(); } }
    c.restore(); c.strokeStyle = wall; c.lineWidth = 5; canvasRoundRect(c, ROOM.left, ROOM.top, ROOM.right - ROOM.left, ROOM.bottom - ROOM.top, 18); c.stroke(); c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 1; canvasRoundRect(c, ROOM.left + 7, ROOM.top + 7, ROOM.right - ROOM.left - 14, ROOM.bottom - ROOM.top - 14, 12); c.stroke();
    for (var oi = 0; oi < room.obstacles.length; oi++) { var o = room.obstacles[oi]; c.fillStyle = 'rgba(0,0,0,.3)'; canvasRoundRect(c, o.x + 5, o.y + 7, o.w, o.h, 6); c.fill(); c.fillStyle = wall; canvasRoundRect(c, o.x, o.y, o.w, o.h, 6); c.fill(); c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(o.x + 6, o.y + 6, o.w - 12, 4); c.strokeStyle = 'rgba(0,0,0,.3)'; c.strokeRect(o.x + 5, o.y + 5, o.w - 10, o.h - 10); }
    if (room.landmark) { c.strokeStyle = colorCss(floor.accent); c.lineWidth = 2; c.beginPath(); c.arc(195, 420, 66, 0, TAU); c.stroke(); c.beginPath(); c.arc(195, 420, 54, 0, TAU); c.stroke(); c.fillStyle = colorCss(floor.accent); c.fillRect(190, 350, 10, 3); c.fillRect(188, 487, 14, 3); }
    if (room.puzzle) { c.fillStyle = '#141a2a'; c.strokeStyle = colorCss(floor.accent); c.lineWidth = 2; canvasRoundRect(c, room.puzzle.x - 24, room.puzzle.y - 19, 48, 38, 8); c.fill(); c.stroke(); c.fillStyle = colorCss(floor.accent); c.fillRect(room.puzzle.x - 12, room.puzzle.y - 3, 7, 7); c.fillRect(room.puzzle.x - 2, room.puzzle.y - 3, 7, 7); c.fillRect(room.puzzle.x + 8, room.puzzle.y - 3, 7, 7); }
    c.fillStyle = '#49363b'; c.fillRect(48, 184, 12, 20); c.fillRect(330, 184, 12, 20); c.fillStyle = colorCss(floor.accent); c.fillRect(51, 182, 6, 8); c.fillRect(333, 182, 6, 8);
    var glow = c.createRadialGradient(54, 194, 4, 54, 194, 82); glow.addColorStop(0, 'rgba(255,209,106,.20)'); glow.addColorStop(1, 'rgba(255,209,106,0)'); c.fillStyle = glow; c.fillRect(0, 140, 150, 160); glow = c.createRadialGradient(336, 194, 4, 336, 194, 82); glow.addColorStop(0, 'rgba(255,209,106,.20)'); glow.addColorStop(1, 'rgba(255,209,106,0)'); c.fillStyle = glow; c.fillRect(240, 140, 150, 160);
    if (room.shortcut) { c.strokeStyle = colorCss(floor.accent); c.lineWidth = 4; c.beginPath(); c.arc(room.shortcut.x, room.shortcut.y, 23, Math.PI, TAU); c.stroke(); c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(room.shortcut.x - 19, room.shortcut.y, 38, 27); }
    this.roomTexture.refresh();
  };

  Scene.prototype.renderRoomViews = function () {
    var floor = floorFor(this.run.floorNo); this.roomImage.setVisible(true); this.gateLeft.setVisible(true); this.gateRight.setVisible(true); this.shortcutView.setVisible(!!this.room.shortcut); this.shortcutView.setTint(floor.accent); if (this.room.shortcut) this.shortcutView.setPosition(this.room.shortcut.x, this.room.shortcut.y);
    for (var i = 0; i < this.hazardViews.length; i++) this.hazardViews[i].setVisible(i < this.hazards.length);
    for (i = 0; i < this.pickupViews.length; i++) this.pickupViews[i].setVisible(i < this.pickups.length);
  };

  Scene.prototype.emitFx = function (x, y, color, type) {
    var count = type === 'hit' ? 8 : type === 'dash' ? 3 : 1;
    for (var n = 0; n < count; n++) {
      var slot = null; for (var i = 0; i < this.fx.length; i++) if (!this.fx[i].active) { slot = this.fx[i]; break; }
      if (!slot) slot = this.fx[n % this.fx.length]; var a = Math.random() * TAU, speed = type === 'dust' ? 18 : type === 'dash' ? 36 : 70;
      slot.active = true; slot.x = x; slot.y = y; slot.vx = Math.cos(a) * speed; slot.vy = Math.sin(a) * speed; slot.life = type === 'dust' ? .5 : .34; slot.max = slot.life; slot.size = type === 'hit' ? 1.1 : 0.8; slot.color = color; slot.type = type;
    }
  };
  Scene.prototype.spawnBolt = function (x, y, vx, vy, heavy) {
    for (var i = 0; i < this.bolts.length; i++) if (!this.bolts[i].active) { var b = this.bolts[i]; b.active = true; b.x = x; b.y = y; b.vx = vx; b.vy = vy; b.life = 2.4; b.heavy = !!heavy; return; }
  };

  Scene.prototype.pointerPosition = function (p) {
    var rect = this.game.canvas.getBoundingClientRect(); return { x: (p.x - rect.left) * W / Math.max(1, rect.width), y: (p.y - rect.top) * H / Math.max(1, rect.height) };
  };
  Scene.prototype.pointerZone = function (x, y) {
    if (!this.run) {
      if (y >= 610 && y <= 680 && x < 195) return 'daily'; if (y >= 610 && y <= 680 && x >= 195) return 'practice'; if (y >= 680 && y <= 745) return 'gauntlet';
      for (var i = 0; i < FLOORS.length; i++) { var fx = 22 + (i % 2) * 177, fy = 222 + Math.floor(i / 2) * 106; if (x >= fx && x <= fx + 165 && y >= fy && y <= fy + 82) return 'floor' + (i + 1); } return '';
    }
    if (!activePhase(this.run.phase)) { if (y >= 380 && y <= 438) return 'next'; if (y >= 446 && y <= 504) return 'retry'; if (y >= 512 && y <= 570) return 'menu'; return ''; }
    if (x < 145 && y > 710) return 'move'; if (x >= 305 && y >= 640 && y < 725) return 'dash'; if (x >= 205 && y > 730) return 'attack'; if (x >= 140 && x < 205 && y > 730) return 'use'; if (x >= ROOM.left && x <= ROOM.right && y >= ROOM.top && y <= ROOM.bottom) return 'attack'; return '';
  };
  Scene.prototype.readInput = function () {
    var moveX = 0, moveY = 0, attack = false, attackJust = false, dash = false, use = false, just = {}; this.moveKnob = { x: 74, y: 779 };
    var pointerIds = {};
    this.kitPointers = kit.input.pointers;
    var iterator = this.kitPointers.entries(); var entry;
    while (!(entry = iterator.next()).done) {
      var id = entry.value[0], p = entry.value[1], pos = this.pointerPosition(p), claim = this.pointerClaims[id]; pointerIds[id] = true;
      if (!claim) { claim = { zone: this.pointerZone(pos.x, pos.y), fresh: true }; this.pointerClaims[id] = claim; p.zone = claim.zone; }
      if (claim.zone === 'move') { var dx = pos.x - 74, dy = pos.y - 779, md = Math.hypot(dx, dy), mm = Math.min(42, md) || 1; moveX += dx / mm * Math.min(1, md / 42); moveY += dy / mm * Math.min(1, md / 42); this.moveKnob = { x: 74 + dx / mm * Math.min(42, md), y: 779 + dy / mm * Math.min(42, md) }; }
      if (claim.zone === 'attack') { attack = true; if (claim.fresh) attackJust = true; } if (claim.zone === 'dash' && claim.fresh) dash = true; if (claim.zone === 'use' && claim.fresh) use = true;
      if (claim.fresh && claim.zone) just[claim.zone] = true; claim.fresh = false;
    }
    for (var old in this.pointerClaims) if (own(this.pointerClaims, old) && !pointerIds[old]) delete this.pointerClaims[old];
    if (!this.moveKnob) this.moveKnob = { x: 74, y: 779 };
    var keys = function (code) { return kit.input.keyDown(code); }, keyJust = function (code) { var down = keys(code), was = !!this.keyPrev[code]; this.keyPrev[code] = down; return down && !was; }.bind(this);
    moveX += (keys('KeyA') || keys('ArrowLeft') ? -1 : 0) + (keys('KeyD') || keys('ArrowRight') ? 1 : 0); moveY += (keys('KeyW') || keys('ArrowUp') ? -1 : 0) + (keys('KeyS') || keys('ArrowDown') ? 1 : 0);
    var pad = kit.input.gamepad(), padJust = function (name, down) { var was = !!this.gamepadPrev[name]; this.gamepadPrev[name] = !!down; return !!down && !was; }.bind(this);
    moveX += pad.x; moveY += pad.y; var mag = Math.hypot(moveX, moveY); if (mag > 1) { moveX /= mag; moveY /= mag; mag = 1; }
    var enterJust = keyJust('Enter'), spaceJust = keyJust('Space'), padAttackJust = padJust('attack', pad.attack), padDashJust = padJust('dash', pad.dash), padUseJust = padJust('use', pad.use), padPauseJust = padJust('pause', pad.pause);
    attack = attack || keys('Space') || keys('Enter') || pad.attack; attackJust = attackJust || spaceJust || enterJust || padAttackJust; dash = dash || keyJust('ShiftLeft') || keyJust('ShiftRight') || pad.dash; use = use || keyJust('KeyE') || pad.use;
    this.control = { moveX: moveX, moveY: moveY, moveMag: Math.min(1, mag), attack: attack, attackJust: attackJust, dash: dash, use: use, just: just, keyDaily: keyJust('KeyD'), keyPractice: keyJust('KeyP'), keyGauntlet: keyJust('KeyG'), keyEnter: enterJust, keyRetry: keyJust('KeyR'), key1: keyJust('Digit1'), key2: keyJust('Digit2'), key3: keyJust('Digit3'), key4: keyJust('Digit4'), keyPause: keyJust('KeyP') || padPauseJust, keySettings: keyJust('KeyO'), keyMenu: keyJust('KeyM') || keyJust('Escape'), keyTutorial: keyJust('KeyT') };
  };

  Scene.prototype.openManualPause = function () {
    if (this.manualPause || !this.run) return;
    var scene = this, box = document.createElement('div'); this.manualPause = true; this.pausePanel = box;
    box.style.cssText = 'position:fixed;inset:0;z-index:9100;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(9,12,23,.96);color:#f5f1e3;font:700 16px ui-sans-serif,system-ui,sans-serif;text-align:center;padding:env(safe-area-inset-top) 24px env(safe-area-inset-bottom);';
    var title = document.createElement('div'); title.textContent = 'DEADLINE DUNGEON PAUSED'; title.style.fontSize = '21px'; box.appendChild(title);
    var copy = document.createElement('div'); copy.textContent = 'The clock is held. Choose an action.'; copy.style.color = '#aeb9d5'; box.appendChild(copy);
    function button(label, fn, primary) { var b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.style.cssText = 'font:inherit;color:' + (primary ? '#091827' : '#f5f1e3') + ';background:' + (primary ? '#65e4bf' : '#1b2b44') + ';border:1px solid #49637e;border-radius:10px;padding:12px 22px;min-width:240px;'; b.addEventListener('click', fn); box.appendChild(b); }
    function close() { if (scene.pausePanel) scene.pausePanel.remove(); scene.pausePanel = null; scene.manualPause = false; }
    button('RESUME', function () { close(); kit.resume('manual'); }, true);
    button('RESTART RUN', function () { close(); kit.resume('manual'); kit.restart(); }, false);
    button('SETTINGS', function () { close(); kit.resume('manual'); kit.openSettings(); }, false);
    document.body.appendChild(box); kit.pause('manual');
  };
  Scene.prototype.returnToMenu = function () { kit.audio.stopMusic(260); this.run = null; this.room = null; this.transition = null; this.manualPause = false; this.updateModeVisibility(); };

  Scene.prototype.step = function (dt) {
    this.uiTime += dt; this.tickToast(dt); if (this.tutorialActive) this.tutorialAge = Math.min(9, this.tutorialAge + dt); this.readInput(); if (this.restartRequested) { this.restartRequested = false; kit.audio.stopMusic(160); this.startRun(this.run ? this.run.mode : 'daily', this.run ? this.run.floorNo : this.selectedFloor); }
    this.applyDebugSwitches();
    if (!this.run) this.stepMenu(); else if (this.transition) this.stepTransition(dt); else if (activePhase(this.run.phase)) this.stepRun(dt); else this.stepResult(dt);
    this.stepFx(dt); this.updateDebugState();
  };
  Scene.prototype.stepMenu = function () {
    var c = this.control;
    if (c.keySettings) { kit.openSettings(); return; }
    if (c.key1 && unlockedFloor(1)) this.selectedFloor = 1; if (c.key2 && unlockedFloor(2)) this.selectedFloor = 2; if (c.key3 && unlockedFloor(3)) this.selectedFloor = 3; if (c.key4 && unlockedFloor(4)) this.selectedFloor = 4;
    for (var i = 0; i < 4; i++) if (c.just['floor' + (i + 1)] && (unlockedFloor(i + 1) || debugApi.forceFloor)) this.selectedFloor = i + 1;
    if (c.keyDaily || c.just.daily || (c.keyEnter && !c.keyGauntlet)) this.startRun('daily', this.selectedFloor);
    else if (c.keyPractice || c.just.practice) this.startRun('practice', this.selectedFloor);
    else if (c.keyGauntlet || c.just.gauntlet) this.startRun('gauntlet', 1);
  };
  Scene.prototype.stepResult = function (dt) {
    this.run.resultReady += dt; var c = this.control;
    if (this.run.resultReady < .35) return;
    if (c.keyMenu || c.just.menu) { this.returnToMenu(); return; }
    if (c.just.next || c.keyEnter) {
      if (this.run.phase === 'failed' || this.run.phase === 'gauntletComplete') { kit.audio.stopMusic(160); this.startRun(this.run.mode, this.run.mode === 'gauntlet' ? 1 : this.run.floorNo); return; }
      if (this.run.mode === 'gauntlet' && this.run.floorNo < FLOORS.length) { this.run.floorNo++; this.run.floorTime = 0; this.run.keys = 0; this.run.skippedKeys = 0; this.run.deadline = floorFor(this.run.floorNo).deadline; this.run.dangerWarned = false; this.run.rooms = this.buildRooms(floorFor(this.run.floorNo), this.run.seed ^ hash32(this.run.floorNo * 0x1227), this.run.floorNo); this.run.totalKeys = this.countKeys(this.run.rooms); this.loadRoom(0, false); this.playFloorMusic(floorFor(this.run.floorNo)); return; }
      kit.audio.stopMusic(160); this.startRun(this.run.mode, this.run.floorNo); return;
    }
    if (c.keyRetry || c.just.retry) { kit.audio.stopMusic(160); this.startRun(this.run.mode, this.run.mode === 'gauntlet' ? 1 : this.run.floorNo); }
  };
  Scene.prototype.applyDebugSwitches = function () {
    var requestedMode = debugApi.forceMode || DD_STATE.forceMode || ''; var requestedFloor = Number(debugApi.forceFloor || DD_STATE.forceFloor || 0);
    if (requestedMode && requestedMode !== 'menu' && (!this.run || this.run.mode !== requestedMode || (requestedFloor && this.run.floorNo !== requestedFloor))) { this.startRun(requestedMode === 'gauntlet' ? 'gauntlet' : requestedMode === 'practice' ? 'practice' : 'daily', requestedFloor || this.selectedFloor); }
    if (!requestedMode && requestedFloor && (!this.run || this.run.floorNo !== requestedFloor)) this.startRun('practice', requestedFloor);
  };

  Scene.prototype.stepRun = function (dt) {
    var r = this.run, p = this.player, floor = floorFor(r.floorNo), c = this.control;
    if (c.keyPause) { this.openManualPause(); return; }
    if (c.keySettings) { kit.openSettings(); return; }
    if (c.keyMenu) { this.returnToMenu(); return; }
    p.anim += dt; p.invuln = Math.max(0, p.invuln - dt); p.hurt = Math.max(0, p.hurt - dt); p.attackCooldown = Math.max(0, p.attackCooldown - dt); p.dashCooldown = Math.max(0, p.dashCooldown - dt); p.attack = Math.max(0, p.attack - dt); p.dash = Math.max(0, p.dash - dt); r.damageFlash = Math.max(0, r.damageFlash - dt); r.keyTick = Math.max(0, r.keyTick - dt); r.stepTimer = Math.max(0, r.stepTimer - dt);
    if (r.floorTime >= r.deadline) { this.failRun('THE DEADLINE PASSED', 'The dungeon seals before the final rune.'); return; }
    if (r.deadline - r.floorTime <= 10 && !r.dangerWarned) { r.dangerWarned = true; kit.audio.sfx('dangerSting', { volume: .7 }); kit.audio.sfx('danger', { volume: .6 }); this.queueToast('DEADLINE ≤ 10s', .8); }
    if (p.dashCooldown <= 0 && r.dashCharges < 1) r.dashCharges = 1;
    if (this.tutorialActive && (c.keyTutorial || c.use)) { this.tutorialActive = false; profile.tutorialSeen = true; saveProfile(); this.queueToast('TUTORIAL OFF · FIND RUNE', .8); kit.audio.sfx('ui', { volume: .7 }); c.use = false; }
    var mx = c.moveX, my = c.moveY, mm = c.moveMag;
    if (p.attack <= 0 && mm > .12) { p.faceX = mx; p.faceY = my; }
    if (c.dash && p.dashCooldown <= 0 && r.dashCharges > 0) { r.dashCharges--; p.dash = .17; p.dashCooldown = .88; p.invuln = .27; p.dashX = mm > .12 ? mx : p.faceX; p.dashY = mm > .12 ? my : p.faceY; this.emitFx(p.x, p.y, floor.accent, 'dash'); kit.audio.sfx('dash', { volume: .8 }); }
    if (c.attack && p.attackCooldown <= 0 && p.dash <= 0) { p.attack = .19; p.attackCooldown = .27; p.attackHit = false; kit.audio.sfx('slash', { volume: .7 }); }
    var vx = p.dash > 0 ? p.dashX : mx, vy = p.dash > 0 ? p.dashY : my, speed = p.dash > 0 ? 520 : 145;
    var oldX = p.x, oldY = p.y, moveScale = p.dash <= 0 && p.attack > 0 ? .22 : 1; this.movePlayer(vx * speed * dt * moveScale, vy * speed * dt * moveScale);
    if (p.dash > 0 && Math.hypot(p.x - oldX, p.y - oldY) > 3) this.emitFx(p.x, p.y, floor.accent, 'dash');
    if (mm > .25 && r.stepTimer <= 0) { r.stepTimer = .28; kit.audio.sfx('step', { volume: .25, rate: floor.id === 'forge' ? .85 : 1 }); this.emitFx(p.x, p.y + 12, floor.accent, 'dust'); }
    if (p.attack > 0 && !p.attackHit && p.attack < .12) { p.attackHit = true; this.resolveAttack(); }
    this.updatePuzzle(dt);
    this.updateEnemies(dt); if (r.phase === 'failed') return; this.updateBolts(dt); if (r.phase === 'failed') return; this.updateHazards(dt); if (r.phase === 'failed') return; this.updatePickups(dt);
    if (this.room.shortcut && !this.room.shortcut.discovered && dist(p.x, p.y, this.room.shortcut.x, this.room.shortcut.y) < 34) { this.room.shortcut.discovered = true; this.queueToast('SHORTCUT FOUND · USE', .8); kit.audio.sfx('pickup', { volume: .65 }); }
    if (this.room.shortcut && this.room.shortcut.discovered && c.use && this.roomReady()) { r.shortcutUsed = true; this.queueToast('SHORTCUT · AHEAD', .8); this.advanceRoom(this.room.shortcut.skip); return; }
    var ready = this.roomReady(); if (this.puzzle && !this.puzzle.solved && this.puzzle.active) r.phase = 'solve'; else if (ready) r.phase = 'escape'; else r.phase = 'explore';
    if (ready && !this.gate.target) { this.gate.target = true; this.gate.pulse = .65; this.queueToast('ROOM CLEAR · GATE OPEN', .8); kit.audio.sfx('gate', { volume: .8 }); this.emitFx(ROOM.gateX, ROOM.gateY, PAL.mint, 'escape'); }
    this.gate.amount = lerp(this.gate.amount, this.gate.target ? 1 : 0, Math.min(1, dt * 4)); if (this.gate.pulse > 0) this.gate.pulse -= dt;
    if (this.gate.amount > .94 && p.x > ROOM.gateX - 15 && p.y > ROOM.gateY - 58 && p.y < ROOM.gateY + 58) this.advanceRoom(1);
  };
  Scene.prototype.failRun = function (title, copy) { if (!this.run || !activePhase(this.run.phase)) return; this.transition = null; this.run.timeout = title.indexOf('DEADLINE') >= 0; this.run.phase = 'failed'; this.run.resultReady = 0; kit.audio.stopMusic(280); kit.audio.sfx('dangerSting', { volume: .85 }); };
  Scene.prototype.updatePuzzle = function (dt) {
    var p = this.player, puzzle = this.puzzle, c = this.control; if (!puzzle || puzzle.solved) return;
    puzzle.pop = Math.max(0, puzzle.pop - dt);
    if (!puzzle.active && dist(p.x, p.y, puzzle.x, puzzle.y) < 50 && c.use) { puzzle.active = true; this.run.phase = 'solve'; this.queueToast('RUNE CONSOLE · CYCLE / SLASH', .8); kit.audio.sfx('ui', { volume: .7 }); c.use = false; return; }
    if (!puzzle.active) return;
    if (c.key1 || c.key2 || c.key3) puzzle.cursor = c.key1 ? 1 : c.key2 ? 2 : 3;
    else if (c.use) { puzzle.cursor = puzzle.cursor % 3 + 1; c.use = false; kit.audio.sfx('ui', { volume: .35, rate: 1 + puzzle.cursor * .05 }); }
    if (c.attackJust) {
      if (puzzle.cursor === puzzle.sequence[puzzle.progress]) { puzzle.progress++; puzzle.pop = .28; this.emitFx(puzzle.x, puzzle.y, PAL.violet, 'puzzle'); kit.audio.sfx('ui', { volume: .7, rate: 1.1 }); if (puzzle.progress >= puzzle.sequence.length) { puzzle.solved = true; puzzle.active = false; this.queueToast('RUNE SOLVED · GATE OPEN', .9); kit.audio.sfx('secret', { volume: .85 }); this.emitFx(puzzle.x, puzzle.y, PAL.gold, 'escape'); } else { this.queueToast('RUNE ' + puzzle.progress + '/' + puzzle.sequence.length, .45); } }
      else { puzzle.wrong++; puzzle.progress = 0; puzzle.pop = .2; this.emitFx(puzzle.x, puzzle.y, PAL.danger, 'puzzle'); kit.audio.sfx('danger', { volume: .5 }); this.queueToast(puzzle.wrong >= 2 ? 'PATTERN ' + puzzle.sequence.join('-') : 'WRONG RUNE · RESET', .8); }
    }
  };
  Scene.prototype.roomReady = function () { return this.enemies.length === 0 && (!this.key || this.key.collected) && (!this.puzzle || this.puzzle.solved); };
  Scene.prototype.movePlayer = function (dx, dy) {
    var p = this.player, steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 8)), sx = dx / steps, sy = dy / steps;
    for (var i = 0; i < steps; i++) { var nx = clamp(p.x + sx, ROOM.left + p.r, ROOM.right - p.r), ny = clamp(p.y + sy, ROOM.top + p.r, ROOM.bottom - p.r); if (!this.blocked(nx, p.y, p.r) && !(nx > ROOM.gateX - 18 && this.gate.amount < .92)) p.x = nx; if (!this.blocked(p.x, ny, p.r) && !(p.x > ROOM.gateX - 18 && this.gate.amount < .92)) p.y = ny; }
  };
  Scene.prototype.stepTransition = function (dt) {
    if (!this.transition) return; this.transition.time += dt; if (!this.transition.swapped && this.transition.time >= .13) { this.transition.swapped = true; this.loadRoom(this.transition.next, false); } if (this.transition.time >= .25) this.transition = null;
  };
  Scene.prototype.blocked = function (x, y, r) {
    for (var i = 0; i < this.room.obstacles.length; i++) { var o = this.room.obstacles[i], nx = clamp(x, o.x, o.x + o.w), ny = clamp(y, o.y, o.y + o.h); if (dist(x, y, nx, ny) < r) return true; } return false;
  };
  Scene.prototype.resolveAttack = function () {
    var p = this.player, floor = floorFor(this.run.floorNo), hit = false;
    this.emitFx(p.x + p.faceX * 25, p.y + p.faceY * 25, floor.accent, 'hit');
    for (var i = this.enemies.length - 1; i >= 0; i--) { var e = this.enemies[i], dx = e.x - p.x, dy = e.y - p.y, d = Math.max(1, Math.hypot(dx, dy)), dot = (dx * p.faceX + dy * p.faceY) / d; if (d < (e.type === 'warden' ? 68 : 54) && dot > -.2 && e.hurt <= 0) { e.hp--; e.hurt = .2; e.knockX = dx / d * 150; e.knockY = dy / d * 150; hit = true; this.emitFx(e.x, e.y, PAL.white, 'hit'); kit.juice.hitStop(52); kit.juice.shake(5, 90); kit.audio.sfx('hit', { volume: .72 }); if (e.hp <= 0) { this.emitFx(e.x, e.y, enemyFor(e.type).color, 'hit'); this.enemies.splice(i, 1); } } }
    if (hit) { this.queueToast('CONNECT · KNOCKBACK', .35); }
  };
  Scene.prototype.updateEnemies = function (dt) {
    var p = this.player, floor = floorFor(this.run.floorNo);
    for (var i = this.enemies.length - 1; i >= 0; i--) { var e = this.enemies[i], ed = enemyFor(e.type), dx = p.x - e.x, dy = p.y - e.y, d = Math.max(1, Math.hypot(dx, dy)); e.hurt = Math.max(0, e.hurt - dt); e.contact = Math.max(0, e.contact - dt); e.shotTimer -= dt; e.anim += dt;
      if (e.hurt > 0) { e.x += e.knockX * dt; e.y += e.knockY * dt; e.knockX *= .86; e.knockY *= .86; }
      else if (e.type === 'archer') { if (d > 170) { e.x += dx / d * ed.speed * dt; e.y += dy / d * ed.speed * dt; } else if (d < 120) { e.x -= dx / d * ed.speed * dt; e.y -= dy / d * ed.speed * dt; } if (e.shotTimer <= 0 && d < 320) { e.shotTimer = 1.8; this.spawnBolt(e.x, e.y, dx / d * 128, dy / d * 128, false); } }
      else if (e.type === 'skitter') { e.x += (dx / d * ed.speed + -dy / d * Math.sin(e.anim * 7) * 35) * dt; e.y += (dy / d * ed.speed + dx / d * Math.sin(e.anim * 7) * 35) * dt; }
      else if (e.type === 'warden') { if (d > 140) { e.x += dx / d * ed.speed * dt; e.y += dy / d * ed.speed * dt; } if (e.shotTimer <= 0) { e.shotTimer = 1.55; for (var w = -1; w <= 1; w++) { var a = Math.atan2(dy, dx) + w * .22; this.spawnBolt(e.x, e.y, Math.cos(a) * 145, Math.sin(a) * 145, true); } } }
      else { e.x += dx / d * ed.speed * dt; e.y += dy / d * ed.speed * dt; }
      e.x = clamp(e.x, ROOM.left + ed.radius, ROOM.right - ed.radius); e.y = clamp(e.y, ROOM.top + ed.radius, ROOM.bottom - ed.radius);
      if (d < p.r + ed.radius && e.contact <= 0) { e.contact = .62; this.hurtPlayer(e.x, e.y, e.type === 'warden' ? 2 : 1); }
    }
  };
  Scene.prototype.hurtPlayer = function (fromX, fromY, damage) {
    var p = this.player, r = this.run; if (p.invuln > 0 || p.dash > 0) return; p.invuln = .62; p.hurt = .24; r.hp = Math.max(0, r.hp - damage); r.damageFlash = .22; var dx = p.x - fromX, dy = p.y - fromY, d = Math.max(1, Math.hypot(dx, dy)); this.movePlayer(dx / d * 30, dy / d * 30); this.emitFx(p.x, p.y, PAL.danger, 'hit'); kit.juice.shake(7, 120); kit.audio.sfx('hit', { volume: .75 }); kit.audio.sfx('hurt', { volume: .7 }); if (r.hp <= 0) this.failRun('RUN ENDED', 'The dungeon keeps the clock.'); else { this.queueToast('HIT · KNOCKBACK', .55); }
  };
  Scene.prototype.updateBolts = function (dt) {
    for (var i = 0; i < this.bolts.length; i++) { var b = this.bolts[i]; if (!b.active) continue; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; if (b.life <= 0 || b.x < 15 || b.x > 375 || b.y < 145 || b.y > 710) { b.active = false; continue; } if (dist(b.x, b.y, this.player.x, this.player.y) < this.player.r + (b.heavy ? 9 : 7)) { b.active = false; this.hurtPlayer(b.x, b.y, b.heavy ? 2 : 1); this.emitFx(b.x, b.y, PAL.danger, 'hit'); } }
  };
  Scene.prototype.updateHazards = function (dt) {
    var p = this.player, floor = floorFor(this.run.floorNo), rate = 1 + (this.run.mode === 'gauntlet' ? (this.run.floorNo - 1) * .12 : 0);
    for (var i = 0; i < this.hazards.length; i++) { var h = this.hazards[i], signal, cycle; h.timer += dt; if (floor.id === 'cistern') { signal = Math.sin(h.timer * 2.1 * rate + h.phase); h.warning = signal > -.24; h.active = signal > .24; } else if (floor.id === 'forge') { cycle = Math.max(1.08, 1.7 - (h.level - 1) * .12); h.warning = h.timer % cycle > cycle - .72; h.active = h.timer % cycle > cycle - .42; } else if (floor.id === 'vault') { signal = Math.sin(h.timer * 2.5 * rate + h.phase); h.warning = signal > -.08; h.active = signal > .32; } else { cycle = 1.8; h.warning = h.timer % cycle > cycle - .72; h.active = h.timer % cycle > cycle - .42; } if (h.active && (h.hitCooldown || 0) <= 0 && this.circleRect(p.x, p.y, p.r, h)) { h.hitCooldown = .72; this.hurtPlayer(h.x + h.w / 2, h.y + h.h / 2, 1); } h.hitCooldown = Math.max(0, (h.hitCooldown || 0) - dt); }
  };
  Scene.prototype.circleRect = function (x, y, r, q) { var nx = clamp(x, q.x, q.x + q.w), ny = clamp(y, q.y, q.y + q.h); return dist(x, y, nx, ny) < r; };
  Scene.prototype.updatePickups = function (dt) {
    var p = this.player;
    if (this.key && !this.key.collected) { this.key.pulse += dt; this.key.pop = Math.max(0, this.key.pop || 0); if (dist(p.x, p.y, this.key.x, this.key.y) < 26) { this.key.collected = true; this.key.pop = .34; this.run.keys++; this.run.keyTick = .32; this.queueToast('KEY SECURED', .8); kit.audio.sfx('pickup', { volume: .85 }); this.emitFx(this.key.x, this.key.y, PAL.gold, 'puzzle'); } }
    for (var i = 0; i < this.pickups.length; i++) { var q = this.pickups[i]; q.pop = Math.max(0, q.pop || 0); if (q.active && dist(p.x, p.y, q.x, q.y) < 24) { q.active = false; q.pop = .34; if (q.type === 'potion') { this.run.hp = Math.min(this.run.maxHp, this.run.hp + 1); this.queueToast('♥ +1', .65); } else { this.run.dashCharges = Math.min(2, this.run.dashCharges + 1); this.queueToast('◆ +1', .65); } kit.audio.sfx('pickup', { volume: .7 }); this.emitFx(q.x, q.y, q.type === 'potion' ? 0xff7187 : PAL.mint, 'puzzle'); } }
  };
  Scene.prototype.advanceRoom = function (skip) {
    if (this.transition) return; var next = this.run.roomIndex + (skip || 1); if (next >= this.run.rooms.length) { this.completeFloor(); return; }
    if (this.tutorialActive) { this.tutorialActive = false; profile.tutorialSeen = true; saveProfile(); }
    for (var skipped = this.run.roomIndex + 1; skipped < next; skipped++) if (this.run.rooms[skipped].key) this.run.skippedKeys++;
    this.run.phase = 'transition'; this.transition = { time: 0, next: next, swapped: false }; kit.audio.sfx('door', { volume: .7 });
  };
  Scene.prototype.completeFloor = function () {
    var r = this.run, f = floorFor(r.floorNo); r.medal = medalFor(f, r.floorTime); r.phase = r.mode === 'gauntlet' && r.floorNo === FLOORS.length ? 'gauntletComplete' : 'floorResult'; r.resultReady = 0;
    profile.medals[f.id] = Math.max(Number(profile.medals[f.id] || 0), r.medal); profile.bestTimes[f.id] = profile.bestTimes[f.id] ? Math.min(profile.bestTimes[f.id], r.floorTime) : r.floorTime; if (r.mode === 'daily') { var key = timeStamp() + ':' + f.id; profile.dailyBest[key] = profile.dailyBest[key] ? Math.min(profile.dailyBest[key], r.floorTime) : r.floorTime; } if (r.phase === 'gauntletComplete') profile.gauntletBest = profile.gauntletBest ? Math.min(profile.gauntletBest, r.totalTime) : r.totalTime; refreshUnlocks(); saveProfile();
    kit.audio.stopMusic(420); if (r.phase === 'gauntletComplete') { kit.audio.sfx('medal', { volume: .9 }); } else { kit.audio.sfx('medal', { volume: .75 }); }
  };
  Scene.prototype.queueToast = function (value, hold) {
    var item = { value: String(value), hold: Math.min(1, Math.max(.15, Number(hold) || .8)) };
    if (this.toastTime <= 0 && !this.toastQueue.length) { this.toastValue = item.value; this.toastTime = item.hold; return; }
    var last = this.toastQueue[this.toastQueue.length - 1];
    if ((!last || last.value !== item.value) && this.toastValue !== item.value && this.toastQueue.length < 8) this.toastQueue.push(item);
  };
  Scene.prototype.tickToast = function (dt) {
    if (this.toastTime > 0) this.toastTime = Math.max(0, this.toastTime - dt);
    if (this.toastTime <= 0 && this.toastQueue.length) { var next = this.toastQueue.shift(); this.toastValue = next.value; this.toastTime = next.hold; }
  };
  Scene.prototype.stepFx = function (dt) {
    for (var i = 0; i < this.fx.length; i++) { var p = this.fx[i]; if (!p.active) continue; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .93; p.vy *= .93; p.life -= dt; if (p.life <= 0) p.active = false; }
  };

  Scene.prototype.updateDebugState = function () {
    DD_STATE.mode = this.run ? this.run.mode : 'menu'; DD_STATE.floor = this.run ? this.run.floorNo : this.selectedFloor; DD_STATE.room = this.run ? this.run.roomIndex + 1 : 1; DD_STATE.keys = this.run ? this.run.keys : 0; DD_STATE.time = this.run ? this.run.totalTime : 0; DD_STATE.seed = this.run ? this.run.seed : dailySeed(); DD_STATE.forceFloor = Number(debugApi.forceFloor || DD_STATE.forceFloor || 0); DD_STATE.forceMode = debugApi.forceMode || DD_STATE.forceMode || '';
  };
  Scene.prototype.updateModeVisibility = function () {
    var menu = !this.run, result = !!this.run && !activePhase(this.run.phase), active = !menu && !result; setVisible(this.menuItems, menu); setVisible(this.resultItems, result); setVisible([this.hudMode, this.hudTime, this.hudFloor, this.hudKeys, this.hudMedal, this.coachBg, this.coach, this.hpText, this.dashText, this.controlText, this.useText], active); this.worldRoot.setVisible(!menu); this.chromeImage.setVisible(true); if (this.moveKnobView) this.moveKnobView.setVisible(active); this.transitionShade.setVisible(!!this.run && this.run.phase === 'transition'); this.damageFlashView.setVisible(active);
  };

  Scene.prototype.render = function (shake) {
    this.updateModeVisibility(); this.updateDebugState(); var menu = !this.run, result = !!this.run && !activePhase(this.run.phase);
    if (menu) { this.renderMenu(); return; }
    this.renderHud(); this.renderWorld(); this.renderResult(result); if (this.transition) { var fade = this.transition.time < .13 ? this.transition.time / .13 : (this.transition.time - .13) / .12; this.transitionShade.setVisible(true).setAlpha(this.transition.time < .13 ? clamp(fade, 0, 1) : clamp(1 - fade, 0, 1)); } else this.transitionShade.setVisible(false); this.worldRoot.x = shake ? shake.dx : 0; this.worldRoot.y = shake ? shake.dy : 0;
  };
  Scene.prototype.renderMenu = function () {
    var d = dailySeed(); setTextIfChanged(this.menuSeed, 'TODAY\'S SEED  ' + seedText(d));
    for (var i = 0; i < FLOORS.length; i++) { var f = FLOORS[i], unlocked = unlockedFloor(i + 1) || !!debugApi.forceFloor, selected = this.selectedFloor === i + 1, col = colorCss(f.accent); this.menuFloorTexts[i].setColor(unlocked ? col : '#65718f'); setTextIfChanged(this.menuFloorTexts[i], String(i + 1).padStart(2, '0') + '  ' + f.short + (selected ? '  <' : '')); setTextIfChanged(this.menuFloorSub[i], unlocked ? f.sub + '  /  ' + (profile.medals[f.id] ? medalText(profile.medals[f.id]) : f.unlock) : 'LOCKED  /  ' + f.unlock); this.menuFloorSub[i].setColor(unlocked ? '#aeb9d5' : '#65718f'); }
    this.menuButtons[0].setPosition(105, 644).setSize(166, 50).setFillStyle(this.selectedFloor ? 0x1c4d47 : 0x1b2b44, 1); this.menuButtons[1].setPosition(285, 644).setSize(166, 50).setFillStyle(0x1b2b44, 1); this.menuButtons[2].setPosition(195, 703).setSize(346, 50).setFillStyle(0x3b3021, 1);
  };
  Scene.prototype.renderHud = function () {
    var r = this.run, f = floorFor(r.floorNo), room = this.room, remaining = Math.max(0, r.deadline - r.floorTime), phase = r.phase === 'solve' ? 'SOLVE' : r.phase === 'escape' ? 'ESCAPE' : r.phase === 'transition' ? 'PASSAGE' : 'EXPLORE';
    var mode = r.mode === 'daily' ? 'D' : r.mode === 'practice' ? 'P' : 'G';
    setTextIfChanged(this.hudMode, mode + ' · ' + phase); setTextIfChanged(this.hudTime, fmtTime(remaining)); this.hudTime.setColor(remaining <= 10 ? '#ff6f83' : '#f5f1e3'); setTextIfChanged(this.hudFloor, 'F' + String(r.floorNo).padStart(2, '0') + ' · R' + String(r.roomIndex + 1).padStart(2, '0')); setTextIfChanged(this.hudKeys, '◇ ' + r.keys + '/' + r.totalKeys + (r.skippedKeys ? ' · ↷' + r.skippedKeys : '')); setTextIfChanged(this.hudMedal, 'PAR ' + fmtShort(f.par));
    var coach = '';
    if (this.toastTime > 0) coach = this.toastValue;
    else if (this.tutorialActive && this.tutorialAge < 3.5) coach = 'MOVE · USE RUNE · SLASH · DASH · T SKIP';
    else if (this.puzzle && !this.puzzle.solved && this.puzzle.active) coach = 'RUNE ' + this.puzzle.progress + '/' + this.puzzle.sequence.length + ' · USE CYCLE · 1/2/3 · SLASH' + (this.puzzle.wrong >= 2 ? ' · ' + this.puzzle.sequence.join('-') : '');
    else if (this.puzzle && !this.puzzle.solved && dist(this.player.x, this.player.y, this.puzzle.x, this.puzzle.y) < 72) coach = 'RUNE CONSOLE · USE';
    else if (room.key && !this.key.collected) coach = 'KEY DETOUR';
    else if (room.shortcut && room.shortcut.discovered) coach = 'SHORTCUT READY · USE';
    else if (phase === 'ESCAPE') coach = 'GATE OPEN · EXIT';
    setTextIfChanged(this.coach, coach); var coachVisible = !!coach, coachWidth = Math.min(350, Math.max(120, this.coach.width + 16)); this.coachBg.setSize(coachWidth, 24).setPosition(20 + coachWidth / 2, 125); this.coachBg.setVisible(coachVisible); this.coach.setVisible(coachVisible); var coachAlpha = this.toastTime > 0 ? (kit.juice.enabled ? (this.toastTime < .2 ? this.toastTime / .2 : 1) : 1) : this.tutorialActive && this.tutorialAge > 2.5 ? .24 : 1; this.coach.setAlpha(coachAlpha); this.coachBg.setAlpha(.82 * coachAlpha); this.coach.setColor(this.toastTime > 0 ? (remaining <= 10 ? '#ff6f83' : '#65e4bf') : '#8c9bb9');
    setTextIfChanged(this.hpText, '♥ ' + r.hp + '/' + r.maxHp + ' · ◆' + r.dashCharges); this.dashText.setColor(this.player.dashCooldown <= 0 ? '#65e4bf' : '#65718f'); this.controlText.setColor('#f5f1e3'); this.useText.setColor(this.puzzle && !this.puzzle.solved ? '#c49aff' : room.shortcut && room.shortcut.discovered ? '#65e4bf' : '#aeb9d5'); this.hudKeys.setScale(r.keyTick > 0 ? 1 + easeOutBack(1 - r.keyTick / .32) * .08 : 1);
  };
  Scene.prototype.renderWorld = function () {
    var r = this.run, p = this.player, floor = floorFor(r.floorNo), i;
    var motion = kit.juice.enabled ? 1 : 0; this.playerView.setVisible(true).setPosition(p.x, p.y); var pstate = p.dash > 0 ? 'dash' : p.hurt > 0 ? 'hurt' : p.attack > 0 ? 'attack' : this.control.moveMag > .12 ? 'run' : 'idle'; this.playerView.setFrame('hero' + pstate + (Math.floor(p.anim * 9) % 2)); this.playerView.setAlpha(p.invuln > 0 && Math.floor(p.invuln * 18) % 2 === 0 ? .42 : 1); this.playerView.setTint(p.dash > 0 ? floor.accent : 0xffffff); this.playerView.setRotation(p.attack > 0 ? Math.atan2(p.faceY, p.faceX) : 0); this.playerView.setFlipX(p.attack <= 0 && p.faceX < -.25);
    for (i = 0; i < this.enemyViews.length; i++) { var ev = this.enemyViews[i]; if (i >= this.enemies.length) { ev.sprite.setVisible(false); ev.bar.setVisible(false); continue; } var e = this.enemies[i], telegraph = e.shotTimer < .32 && (e.type === 'archer' || e.type === 'warden'), et = e.hurt > 0 ? 'hurt' : telegraph ? 'attack' : 'run'; ev.sprite.setVisible(true).setPosition(e.x, e.y).setFrame('enemy' + (e.type || 'wisp') + et + (Math.floor(e.anim * 7) % 2)).setTint(e.hurt > 0 ? 0xffffff : telegraph ? PAL.gold : 0xffffff).setAlpha(telegraph ? .78 + (motion ? Math.sin(this.uiTime * 18) * .18 : 0) : 1); ev.sprite.setScale((e.type === 'warden' ? 2.15 : e.type === 'brute' ? 1.75 : 1.45) * (telegraph ? 1.08 : 1)); ev.bar.setVisible(e.hp < e.maxHp).setPosition(e.x, e.y - (e.type === 'warden' ? 32 : 22)).setSize(42, 3).setFillStyle(0x2b2039, 1); ev.bar.setScale(1, 1); ev.bar.setDisplaySize(42 * Math.max(0, e.hp / e.maxHp), 3); }
    for (i = 0; i < this.hazardViews.length; i++) { var hv = this.hazardViews[i]; if (i >= this.hazards.length) { hv.setVisible(false); continue; } var h = this.hazards[i]; hv.setVisible(true).setPosition(h.x + h.w / 2, h.y + h.h / 2).setDisplaySize(h.w, h.h).setAlpha(h.active ? .9 : h.warning ? .62 : .18).setTint(h.warning ? PAL.gold : floor.hazard); }
    for (i = 0; i < this.pickupViews.length; i++) { var pv = this.pickupViews[i], q = this.pickups[i]; if (!q || (!q.active && !q.pop)) { pv.setVisible(false); continue; } var qt = q.active ? 0 : 1 - q.pop / .34, qscale = q.active ? 1 + (motion ? Math.sin(this.uiTime * 3 + q.pulse) * .08 : 0) : motion ? 1 + easeOutBack(clamp(qt, 0, 1)) * 1.25 : 1; pv.setVisible(motion || q.active).setTexture(q.type === 'potion' ? 'dd-potion' : 'dd-charge').setPosition(q.x, q.y + (q.active && motion ? Math.sin(this.uiTime * 3 + q.pulse) * 3 : 0)).setScale(qscale).setAlpha(q.active ? 1 : motion ? clamp(q.pop / .34, 0, 1) : 0).setTint(q.type === 'potion' ? 0xff7187 : PAL.mint); }
    if (this.key && (!this.key.collected || this.key.pop > 0)) { var kt = this.key.collected ? 1 - this.key.pop / .34 : 0; this.keyView.setVisible(!this.key.collected || motion).setPosition(this.key.x, this.key.y + (!this.key.collected && motion ? Math.sin(this.uiTime * 3 + this.key.pulse) * 4 : 0)).setScale(this.key.collected && motion ? 1.5 + easeOutBack(clamp(kt, 0, 1)) * 1.4 : 1.5).setAlpha(this.key.collected ? motion ? clamp(this.key.pop / .34, 0, 1) : 0 : 1); } else this.keyView.setVisible(false);
    this.puzzleView.setVisible(!!this.puzzle && !this.puzzle.solved).setPosition(this.puzzle ? this.puzzle.x : 0, this.puzzle ? this.puzzle.y : 0).setTint(this.puzzle && this.puzzle.active ? PAL.gold : PAL.violet).setAlpha(this.puzzle && this.puzzle.active ? .95 : .48 + (motion ? Math.sin(this.uiTime * 4) * .1 : 0)).setScale(.45 + (motion && this.puzzle && this.puzzle.pop ? easeOutBack(1 - this.puzzle.pop / .28) * .2 : 0));
    this.gateLeft.setVisible(true).setPosition(ROOM.gateX - 10 - this.gate.amount * 22, ROOM.gateY).setFillStyle(this.gate.target ? PAL.mint : PAL.dim, 1); this.gateRight.setVisible(true).setPosition(ROOM.gateX + 10 + this.gate.amount * 22, ROOM.gateY).setFillStyle(this.gate.target ? PAL.mint : PAL.dim, 1); this.gateGlow.setVisible(this.gate.target).setAlpha(.28 + (motion ? Math.sin(this.uiTime * 6) * .08 : 0)).setScale(.72 + this.gate.amount * .12).setTint(PAL.mint);
    this.shortcutView.setAlpha(this.room.shortcut && this.room.shortcut.discovered ? .95 : .38 + (motion ? Math.sin(this.uiTime * 4) * .1 : 0)); for (i = 0; i < this.torchViews.length; i++) this.torchViews[i].setVisible(true).setAlpha(.42 + (motion ? Math.sin(this.uiTime * 5 + i * 2) * .12 : 0)).setScale(.3 + (motion ? Math.sin(this.uiTime * 5 + i * 2) * .025 : 0));
    for (i = 0; i < this.bolts.length; i++) { var b = this.bolts[i]; if (!b.active) continue; var bv = this.fxViews[i]; bv.setVisible(true).setPosition(b.x, b.y).setScale(b.heavy ? 1.15 : .75).setTint(b.heavy ? PAL.danger : PAL.violet); }
    for (i = 0; i < this.bolts.length; i++) if (!this.bolts[i].active && this.fxViews[i].visible) this.fxViews[i].setVisible(false);
    for (i = 0; i < this.fx.length; i++) { var fp = this.fx[i], fv = this.fxViews[i + this.bolts.length], fxTexture = fp.type === 'dust' ? 'dd-dust' : fp.type === 'puzzle' ? 'dd-puzzle' : fp.type === 'escape' ? 'dd-escape' : 'dd-spark'; if (!fv) continue; fv.setVisible(fp.active).setTexture(fxTexture).setPosition(fp.x, fp.y).setScale(fp.size).setAlpha(fp.active ? clamp(fp.life / fp.max, 0, 1) : 0).setTint(fp.color); }
    var flash = r.damageFlash > 0 ? clamp(r.damageFlash / .22, 0, 1) * .22 : 0; this.damageFlashView.setVisible(activePhase(r.phase)).setAlpha(flash);
    var knob = this.moveKnob || { x: 74, y: 779 }; if (!this.moveKnobView) { this.moveKnobView = this.add.image(0, 0, 'dd-charge').setOrigin(.5).setScale(.8).setDepth(61); } this.moveKnobView.setVisible(true).setPosition(knob.x, knob.y).setTint(PAL.mint);
  };
  Scene.prototype.renderResult = function (show) {
    if (!show) return; var r = this.run, f = floorFor(r.floorNo), final = r.phase === 'gauntletComplete', failed = r.phase === 'failed'; this.resultShade.setFillStyle(failed ? 0x190d19 : 0x090c17, .92); setTextIfChanged(this.resultKicker, final ? 'FOUR FLOORS / DEADLINE ROUTE' : failed ? (r.timeout ? 'TIMEOUT / DEADLINE ROUTE' : 'ROOM ' + String(r.roomIndex + 1).padStart(2, '0')) : 'FLOOR ' + String(r.floorNo).padStart(2, '0') + ' / ' + f.short); setTextIfChanged(this.resultTitle, final ? 'GAUNTLET COMPLETE' : failed ? (r.timeout ? 'DEADLINE PASSED' : 'RUN ENDED') : 'FLOOR CLEAR'); setTextIfChanged(this.resultScore, final ? fmtTime(r.totalTime) : fmtTime(r.floorTime)); setTextIfChanged(this.resultMedal, final ? 'DEADLINE VAULT OPENED' : failed ? 'RESTART AND TAKE THE SHORTCUT' : medalText(r.medal)); this.resultMedal.setColor(final ? '#ffd16a' : failed ? '#ff6f83' : colorCss(medalColor(r.medal))); var best = final ? profile.gauntletBest : profile.bestTimes[f.id]; setTextIfChanged(this.resultCopy, final ? (best ? 'BEST GAUNTLET  ' + fmtTime(best) : 'FIRST CLEAR RECORDED') : failed ? (r.timeout ? 'The floor clock reached zero.' : 'Potion and dash charges remain scattered through the halls.') : 'PAR ' + fmtTime(f.par) + '  /  BEST ' + (best ? fmtTime(best) : '--:--.--') + '\n' + (r.mode === 'daily' ? 'DAILY SEED  ' + seedText(r.seed) : 'PRACTICE SEED  ' + seedText(r.seed)));
    var nextText = final || failed ? 'RETRY RUN' : r.mode === 'gauntlet' ? 'NEXT FLOOR' : 'RUN AGAIN'; setTextIfChanged(this.resultAction, nextText); setTextIfChanged(this.resultRetry, r.mode === 'gauntlet' && !final && !failed ? 'RESTART GAUNTLET' : 'RETRY FLOOR'); this.resultAction.setVisible(true); this.resultRetry.setVisible(true); this.resultButtons[0].setPosition(195, 405).setFillStyle(final ? 0x3b3021 : failed ? 0x512b3a : 0x1c4d47, 1); this.resultButtons[1].setPosition(195, 471).setFillStyle(0x1b2b44, 1); this.resultButtons[2].setPosition(195, 537).setFillStyle(0x1b2b44, 1); this.resultMenu.setVisible(true);
  };
  Scene.prototype.update = function (time, delta) {
    if (this.pausedByKit) return; var shake = kit.juice.frame(), frameDelta = clamp(delta / 1000, 0, .15); if (this.run && activePhase(this.run.phase)) { this.run.totalTime += frameDelta; this.run.floorTime += frameDelta; if (this.run.floorTime >= this.run.deadline) this.failRun('THE DEADLINE PASSED', 'The dungeon seals before the final rune.'); } if (shake.frozen) { this.render(shake); return; } this.accumulator += frameDelta; var steps = 0; while (this.accumulator >= STEP && steps < MAX_STEPS) { this.step(STEP); this.accumulator -= STEP; steps++; } if (this.accumulator > STEP * MAX_STEPS) this.accumulator = STEP * MAX_STEPS; this.render(shake);
  };

  // This scene's art pipeline is deliberately CanvasTexture-based. AUTO can
  // select the headless/WebGL path, which accepts the scene but leaves the
  // dynamic canvas/text batches black with no JavaScript error. Keep the
  // first frame on the renderer that owns these sources directly.
  var config = { type: Phaser.CANVAS, parent: 'game', width: W, height: H, backgroundColor: '#090c17', render: { pixelArt: true, antialias: false, roundPixels: true, clearBeforeRender: true }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H }, scene: Scene };
  App.phaser = new Phaser.Game(config); kit.loader.progress(1);
})();
