/* Cube Cascade | falling match cascade
 * Phaser renders the authored view. GGKit owns lifecycle, input, save,
 * audio, pause, settings, restart, reduced-motion juice, and PWA registration.
 * The simulation advances at most one fixed step per frame.
 */
(function () {
  'use strict';

  var STEP = 1 / 60;
  var TAU = Math.PI * 2;
  var MAX_CELLS = 80;
  var MAX_FX = 128;
  var SAVE_VERSION = 3;
  var Game = { play: null, phaser: null };
  var pendingDebug = { level: null, pyramid: null };

  var SKINS = [
    { id: 'dawn', name: 'DAWN GLASS', top: ['#173b50', '#e08a5c', '#74f1d0'], left: ['#102b3d', '#944f4c', '#2d8180'], right: ['#0a1d2d', '#5f3448', '#1d556b'], accent: '#7df4d8', haze: '#123b4f' },
    { id: 'copper', name: 'COPPER RISE', top: ['#3d2839', '#f3a061', '#ffe2a5'], left: ['#291d2c', '#a75549', '#c17c5a'], right: ['#191624', '#693844', '#754853'], accent: '#ffc779', haze: '#4c303b' },
    { id: 'violet', name: 'VIOLET COIL', top: ['#27264c', '#d38dff', '#80f0ff'], left: ['#191a3c', '#7957aa', '#448eaa'], right: ['#10172e', '#4b356f', '#255470'], accent: '#c795ff', haze: '#2d2552' },
    { id: 'lime', name: 'LIME CIRCUIT', top: ['#244037', '#c7ee6b', '#f2ffd1'], left: ['#172f2e', '#729a4d', '#91b66a'], right: ['#102524', '#426540', '#508260'], accent: '#d0f67a', haze: '#2c4937' },
    { id: 'ember', name: 'EMBER VAULT', top: ['#46263a', '#ff776b', '#ffd58f'], left: ['#301a30', '#a84449', '#b76b4e'], right: ['#1b1327', '#6b3040', '#713f43'], accent: '#ff907e', haze: '#542a39' }
  ];
  var PYRAMIDS = [
    { id: 'dawn-quarry', name: 'DAWN QUARRY', skin: 'dawn', accent: '#7df4d8', signature: 'FIRST DROP', pattern: 'A calm six-column lane for learning the stack.' },
    { id: 'rim-forge', name: 'RIM FORGE', skin: 'copper', accent: '#ffc779', signature: 'RIM PRESSURE', pattern: 'The timer tightens and the surge lane arrives.' },
    { id: 'coil-marsh', name: 'COIL MARSH', skin: 'violet', accent: '#c795ff', signature: 'CHAIN REACTION', pattern: 'Cascade depth and danger pulses rise together.' },
    { id: 'mischief-spire', name: 'MISCHIEF SPIRE', skin: 'lime', accent: '#d0f67a', signature: 'STACK TANGLE', pattern: 'Full rows become high-value clear targets.' },
    { id: 'ember-vault', name: 'EMBER VAULT', skin: 'ember', accent: '#ff907e', signature: 'VAULT PULSE', pattern: 'Fast drops, narrow timing, and relentless overflow pressure.' }
  ];
  var PIECE_COLORS = [
    { id: 'aqua', name: 'AQUA', hex: '#6df5dc', tint: 0x6df5dc },
    { id: 'gold', name: 'GOLD', hex: '#ffd477', tint: 0xffd477 },
    { id: 'violet', name: 'VIOLET', hex: '#c28cff', tint: 0xc28cff },
    { id: 'coral', name: 'CORAL', hex: '#ff7e86', tint: 0xff7e86 },
    { id: 'sky', name: 'SKY', hex: '#78cfff', tint: 0x78cfff }
  ];
  var DIRS = {
    left: { label: '◀', hint: 'MOVE LEFT' }, right: { label: '▶', hint: 'MOVE RIGHT' },
    drop: { label: '▼', hint: 'DROP CUBE' }, hold: { label: 'H', hint: 'HOLD COLOR' }
  };
  var ACTIONS = ['left', 'drop', 'right', 'hold'];
  var DEBUG_STATE = { level: 1, lives: 3, score: 0, mode: 'play', theme: 'dawn-quarry', width: 6, rows: 8, cursor: 0, active: 0, next: [], combo: 0, threat: '' };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function key(x, y) { return x + ',' + y; }
  function color(hex) { return Phaser.Display.Color.HexStringToColor(hex).color; }
  function setTextIfChanged(text, value) { var next = String(value); if (text && text.text !== next) text.setText(next); }
  function setColorIfChanged(text, value) { if (text && text._ccColor !== value) { text.setColor(value); text._ccColor = value; } }
  function setFillIfChanged(shape, fill, alpha) { var stamp = fill + '/' + alpha; if (shape && shape._ccFill !== stamp) { if (shape.setFillStyle) { shape.setFillStyle(fill, alpha); } else { shape.setTint(fill); shape.setAlpha(alpha); } shape._ccFill = stamp; } }
  function skinById(id) { for (var i = 0; i < SKINS.length; i++) if (SKINS[i].id === id) return SKINS[i]; return null; }
  function pyramidById(id) { for (var i = 0; i < PYRAMIDS.length; i++) if (PYRAMIDS[i].id === id) return PYRAMIDS[i]; return null; }
  function validLevel(n) { return Number.isSafeInteger(n) ? clamp(n, 1, 99) : 1; }
  function makeRng(seed) { var value = seed >>> 0; return function () { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; }; }
  function safeInset(name) { var value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)); return Number.isFinite(value) ? value : 0; }
  function plainObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function allKnownSkinIds(list) {
    if (!Array.isArray(list) || list.length < 1 || list.length > SKINS.length) return false;
    var seen = Object.create(null);
    for (var i = 0; i < list.length; i++) { if (typeof list[i] !== 'string' || !skinById(list[i]) || seen[list[i]]) return false; seen[list[i]] = true; }
    return seen.dawn === true;
  }
  function defaultSave() { return { v: SAVE_VERSION, best: 0, unlockedSkins: ['dawn'], selectedSkin: 'dawn', medals: {}, tutorialDone: false }; }
  function validateSave(obj) {
    if (!plainObject(obj) || obj.v !== SAVE_VERSION || !Number.isSafeInteger(obj.best) || obj.best < 0 || obj.best > 999999999) return false;
    if (!allKnownSkinIds(obj.unlockedSkins) || typeof obj.selectedSkin !== 'string' || obj.unlockedSkins.indexOf(obj.selectedSkin) < 0) return false;
    if (!plainObject(obj.medals) || typeof obj.tutorialDone !== 'boolean') return false;
    var medalKeys = Object.keys(obj.medals);
    for (var i = 0; i < medalKeys.length; i++) if (!pyramidById(medalKeys[i]) || !Number.isSafeInteger(obj.medals[medalKeys[i]]) || obj.medals[medalKeys[i]] < 0 || obj.medals[medalKeys[i]] > 4) return false;
    return Object.keys(obj).every(function (name) { return ['v', 'best', 'unlockedSkins', 'selectedSkin', 'medals', 'tutorialDone'].indexOf(name) >= 0; });
  }

  var profile = null;
  var kit = GGKit.create({
    slug: 'cube-cascade', orientation: 'portrait', validateSave: validateSave,
    onPause: function (reason) { if (Game.play) Game.play.onKitPause(reason); if (Game.play && Game.play.scene.isActive()) Game.play.scene.pause(); },
    onResume: function () { if (Game.play && Game.play.scene.isPaused()) Game.play.scene.resume(); if (Game.play) Game.play.onKitResume(); },
    onRestart: function () { if (Game.play) Game.play.restartRun(); }
  });
  function persist() { if (profile) kit.save.set(profile); }
  function isUnlocked(id) { return profile && profile.unlockedSkins.indexOf(id) >= 0; }
  function saveSkin(id) { if (!skinById(id)) return false; if (profile.unlockedSkins.indexOf(id) < 0) profile.unlockedSkins.push(id); persist(); return true; }
  function syncDebug(run) {
    if (!run) return;
    DEBUG_STATE.level = run.level; DEBUG_STATE.lives = run.lives; DEBUG_STATE.score = Math.round(run.score); DEBUG_STATE.mode = run.mode; DEBUG_STATE.theme = run.theme.id;
    DEBUG_STATE.width = run.width; DEBUG_STATE.rows = run.rows; DEBUG_STATE.cursor = run.cursor; DEBUG_STATE.active = run.active ? run.active.color : 0; DEBUG_STATE.next = run.next.slice(); DEBUG_STATE.combo = run.combo; DEBUG_STATE.threat = run.threat || '';
  }
  function forceLevel(value) { var level = validLevel(Number(value)); pendingDebug.level = level; DEBUG_STATE.level = level; if (Game.play && Game.play.scene.isActive()) Game.play.startLevel(level, false, null); }
  function forcePyramid(value) { var p = pyramidById(String(value)); if (!p) return; pendingDebug.pyramid = p.id; DEBUG_STATE.theme = p.id; if (Game.play && Game.play.scene.isActive()) Game.play.forcePyramid(p.id); }
  window.__cx = { state: DEBUG_STATE, forceLevel: forceLevel, forcePyramid: forcePyramid };

  function poly(g, points, fill, stroke, lineWidth) {
    g.beginPath(); g.moveTo(points[0][0], points[0][1]); for (var i = 1; i < points.length; i++) g.lineTo(points[i][0], points[i][1]); g.closePath(); g.fillStyle(fill, 1); g.fillPath();
    if (stroke) { g.lineStyle(lineWidth || 2, stroke, 0.72); g.strokePath(); }
  }
  function bakeTexture(scene, name, width, height, draw) {
    if (scene.textures.exists(name)) return; var g = scene.make.graphics({ x: 0, y: 0, add: false }); draw(g, width, height); g.generateTexture(name, width, height); g.destroy();
  }
  function bakeTextures(scene) {
    bakeTexture(scene, 'cc_bg', 640, 1100, function (g, w, h) {
      var bands = ['#050a16', '#071426', '#0a1c30', '#102942', '#0b1d31', '#06101d'];
      for (var i = 0; i < bands.length; i++) g.fillStyle(color(bands[i]), 1).fillRect(0, i * h / bands.length, w, h / bands.length + 3);
      g.fillStyle(0x246177, 0.18).fillEllipse(w * 0.5, h * 0.35, w * 0.95, h * 0.28); g.fillStyle(0x56e9d2, 0.08).fillEllipse(w * 0.5, h * 0.57, w * 0.8, h * 0.2);
      for (var s = 0; s < 92; s++) { var x = (s * 113 + 29) % w, y = (s * 71 + 17) % (h * 0.72); g.fillStyle(s % 3 === 0 ? 0x8ef8e0 : 0x77c9e5, s % 4 === 0 ? 0.65 : 0.25).fillRect(x, y, s % 2 ? 1 : 2, s % 2 ? 1 : 2); }
      g.fillStyle(0x030810, 0.84).fillRect(0, h * 0.78, w, h * 0.22); g.lineStyle(2, 0x4ad5d2, 0.17).strokeEllipse(w * 0.5, h * 0.77, w * 0.86, 125);
    });
    bakeTexture(scene, 'cc_floor', 800, 280, function (g, w, h) { g.fillStyle(0x02060e, 0.66).fillEllipse(w * 0.5, h * 0.5, w * 0.86, h * 0.64); g.lineStyle(3, 0x48c6c6, 0.33).strokeEllipse(w * 0.5, h * 0.4, w * 0.74, h * 0.34); g.lineStyle(1, 0x9bd8ec, 0.2).strokeEllipse(w * 0.5, h * 0.4, w * 0.55, h * 0.2); });
    bakeTexture(scene, 'cc_topChrome', 800, 240, function (g, w, h) { g.fillStyle(0x071421, 0.98).fillRect(0, 0, w, h); g.fillStyle(0x0c2a3a, 0.86).fillRect(0, 136, w, 40); g.fillStyle(0x102e3e, 0.62).fillRect(0, 187, w, 36); g.fillStyle(0x55e7d0, 0.75).fillRect(0, 106, w, 2); g.fillStyle(0x5de6d5, 0.24).fillRect(0, 175, w, 1); });
    bakeTexture(scene, 'cc_bottomChrome', 800, 230, function (g, w, h) { g.fillStyle(0x040a13, 0.94).fillRect(0, 0, w, h); g.fillStyle(0x0b2433, 0.95).fillRect(0, 0, w, 3); g.fillStyle(0x0d3443, 0.35).fillEllipse(w * 0.5, 76, w * 0.76, 128); g.lineStyle(1, 0x72d6d5, 0.18).strokeEllipse(w * 0.5, 73, w * 0.58, 75); });
    bakeTexture(scene, 'cc_tile', 100, 76, function (g, w, h) { g.fillStyle(0x071a29, 0.92).fillRoundedRect(3, 4, w - 6, h - 8, 10); g.lineStyle(2, 0x326276, 0.7).strokeRoundedRect(4, 5, w - 8, h - 10, 9); g.lineStyle(1, 0x9cefe2, 0.13).strokeRoundedRect(12, 12, w - 24, h - 24, 6); g.fillStyle(0x5fdacb, 0.13).fillCircle(w * 0.5, h * 0.52, 4); });
    bakeTexture(scene, 'cc_button', 144, 104, function (g, w, h) { g.fillStyle(0x153a4e, 0.97).fillRoundedRect(3, 3, w - 6, h - 6, 18); g.lineStyle(3, 0x62dfd5, 0.46).strokeRoundedRect(4, 4, w - 8, h - 8, 16); g.lineStyle(1, 0xb4fff0, 0.2).strokeRoundedRect(10, 10, w - 20, h - 20, 11); });
    for (var si = 0; si < SKINS.length; si++) (function (skin) {
      for (var stage = 0; stage < 3; stage++) (function (currentStage) {
        bakeTexture(scene, 'cc_cube_' + skin.id + '_' + currentStage, 136, 100, function (g) {
          var top = color(skin.top[currentStage]), left = color(skin.left[currentStage]), right = color(skin.right[currentStage]);
          if (currentStage === 2) g.fillStyle(color(skin.accent), 0.16).fillEllipse(68, 45, 128, 68);
          poly(g, [[68, 4], [132, 35], [68, 66], [4, 35]], top, 0x99f5e2, currentStage === 2 ? 3 : 2); poly(g, [[4, 35], [68, 66], [68, 96], [4, 65]], left, 0x163c4c, 2); poly(g, [[132, 35], [68, 66], [68, 96], [132, 65]], right, 0x163c4c, 2);
          g.lineStyle(currentStage === 2 ? 4 : 2, color(skin.accent), currentStage === 2 ? 0.9 : 0.55).strokeEllipse(68, 38, 88, 31); if (currentStage > 0) g.fillStyle(color(skin.accent), currentStage === 2 ? 0.54 : 0.24).fillCircle(68, 42, currentStage === 2 ? 8 : 5);
        });
      }(stage));
    }(SKINS[si]));
    bakeTexture(scene, 'cc_cursor', 96, 104, function (g) { g.fillStyle(0x02070d, 0.55).fillEllipse(48, 94, 52, 13); poly(g, [[48, 5], [78, 35], [48, 65], [18, 35]], 0xffca70, 0xfff2b6, 2); poly(g, [[18, 35], [48, 65], [48, 83], [18, 52]], 0xd65c63, 0x713748, 2); poly(g, [[78, 35], [48, 65], [48, 83], [78, 52]], 0x8d3f55, 0x713748, 2); g.fillStyle(0x3c213c, 1).fillCircle(40, 34, 3).fillCircle(56, 34, 3); g.lineStyle(2, 0xffe6a4, 0.7).strokeCircle(48, 37, 36); });
    bakeTexture(scene, 'cc_fx_drop', 30, 30, function (g) { g.fillStyle(0x78dfff, 0.3).fillCircle(15, 15, 14); g.fillStyle(0xbfffee, 0.95).fillTriangle(15, 2, 23, 15, 15, 28); });
    bakeTexture(scene, 'cc_fx_match', 42, 42, function (g) { g.fillStyle(0xffd477, 0.24).fillCircle(21, 21, 19); g.lineStyle(3, 0xfff0b2, 0.9).strokeCircle(21, 21, 13); g.fillStyle(0xffffff, 0.9).fillCircle(21, 21, 4); });
    bakeTexture(scene, 'cc_fx_clear', 70, 70, function (g) { g.lineStyle(4, 0x72f5dd, 0.92).strokeCircle(35, 35, 24); g.lineStyle(2, 0xd4fff5, 0.5).strokeCircle(35, 35, 32); });
    bakeTexture(scene, 'cc_fx_combo', 94, 50, function (g) { g.fillStyle(0xffd477, 0.18).fillEllipse(47, 25, 86, 30); g.lineStyle(3, 0xffe5a3, 0.92).strokeEllipse(47, 25, 62, 20); g.fillStyle(0xffffff, 0.8).fillCircle(23, 25, 4).fillCircle(71, 25, 4); });
    bakeTexture(scene, 'cc_warning', 96, 22, function (g) { g.fillStyle(0x7a2434, 0.92).fillRoundedRect(2, 2, 92, 18, 7); g.lineStyle(2, 0xff8d91, 0.9).strokeRoundedRect(2, 2, 92, 18, 7); });
  }

  function layoutFor(scene) {
    var w = scene.scale.width, h = scene.scale.height, r = scene.run || { width: 6, rows: 8 }, landscape = w > h, safeTop = safeInset('--cc-safe-top'), safeRight = safeInset('--cc-safe-right'), safeBottom = safeInset('--cc-safe-bottom'), safeLeft = safeInset('--cc-safe-left');
    var top = (landscape ? 102 : 136) + safeTop, bottom = (landscape ? 86 : 142) + safeBottom;
    var cellW = clamp((w - 34) / r.width, 42, 58), cellH = clamp((h - top - bottom - 18) / r.rows, landscape ? 23 : 28, landscape ? 35 : 41);
    var row1 = safeTop + (landscape ? 5 : 10), row2 = safeTop + (landscape ? 35 : 45), row3 = safeTop + (landscape ? 66 : 78);
    var meterX = 72 + safeLeft, meterWidth = Math.max(80, w - meterX - 118 - safeRight);
    return { w: w, h: h, landscape: landscape, top: top, bottom: bottom, boardTop: top + 7, cellW: cellW, cellH: cellH, left: (w - cellW * r.width) * 0.5, controlsY: h - bottom * 0.46, row1: row1, row2: row2, row3: row3, transientY: landscape ? top + 2 : top - 28, meterX: meterX, meterWidth: meterWidth, leftHud: 16 + safeLeft, rightHud: w - 17 - safeRight, safeLeft: safeLeft, safeRight: safeRight };
  }
  function gridPoint(scene, x, y, out) { var l = scene.layout, result = out || { x: 0, y: 0 }; result.x = l.left + (x + 0.5) * l.cellW; result.y = l.boardTop + (scene.run.rows - y - 0.5) * l.cellH; return result; }

  class BootScene extends Phaser.Scene {
    constructor() { super({ key: 'boot' }); }
    preload() {
      kit.loader.show('CUBE CASCADE');
      kit.loader.progress(0.72);
    }
    create() {
      kit.audio.register({ move: 'assets/move.mp3', drop: 'assets/drop.mp3', hold: 'assets/hold.mp3', match: 'assets/match.mp3', cascade: 'assets/cascade.mp3', clear: 'assets/clear.mp3', combo: 'assets/combo.mp3', warning: 'assets/warning.mp3', overflow: 'assets/overflow.mp3', musicBase: 'assets/music-base.mp3', musicDanger: 'assets/music-danger.mp3' });
      bakeTextures(this); kit.loader.progress(1); kit.loader.hide(); this.scene.start('play');
    }
  }

  class PlayScene extends Phaser.Scene {
    constructor() {
      super({ key: 'play' });
      this.run = null; this.layout = null; this.accumulator = 0; this.renderClock = 0; this.hud = null; this.controls = [];
      this.cellViews = []; this.gridViews = []; this.nextViews = []; this.fxPools = { drop: [], match: [], clear: [], combo: [] };
      this.pointerStarts = Object.create(null); this.pointerZones = Object.create(null); this.keyLatch = Object.create(null); this.gamepadLatch = Object.create(null); this.gamepadRepeat = 0;
      this.tmp = { x: 0, y: 0 }; this.tmp2 = { x: 0, y: 0 }; this.banner = { active: false, age: 0, duration: 1.35, color: '#70f5d8' }; this.callout = { text: '', color: '#a9d1db', time: 0, kind: 'chip', queue: [] }; this.tutorialStep = 0; this.musicName = '';
    }
    emptyRun() { return { mode: 'play', level: 1, theme: PYRAMIDS[0], skin: SKINS[0], width: 6, rows: 8, lives: 3, score: 0, board: [], cursor: 0, active: null, held: null, holdUsed: false, next: [], queuedAction: null, rng: makeRng(0xCCF600), levelElapsed: 0, roundTime: 60, dropSpeed: 1.35, combo: 0, cascadeDepth: 0, resolveTimer: 0, pendingMatches: null, dropRequested: false, hazard: { timer: 8, column: 0, warning: false, active: 0 }, threat: '', threatTime: 0, damageFlash: 0, noHit: true, medal: 0, totalClears: 0, targetClears: 4 }; }
    create() {
      Game.play = this; this.run = this.emptyRun(); this.layout = layoutFor(this); this.createSurfaces(); this.createPools(); this.createHud(); this.bindInput(); this.bindAccessibleControls();
      this.scale.on('resize', this.onResize, this); this.startLevel(pendingDebug.level || 1, false, pendingDebug.pyramid || null); kit.audio.preload(['move', 'drop', 'hold', 'match', 'cascade', 'clear', 'combo', 'warning', 'overflow', 'musicBase', 'musicDanger']); this.setMusic('musicBase', 700);
    }
    createSurfaces() { this.background = this.add.image(0, 0, 'cc_bg').setOrigin(0, 0).setDepth(-40); this.floor = this.add.image(this.scale.width * 0.5, this.scale.height * 0.59, 'cc_floor').setOrigin(0.5).setDepth(-2).setAlpha(0.82); this.vignette = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0xff3e57, 0).setOrigin(0).setDepth(180); this.hazardMark = this.add.image(0, 0, 'cc_warning').setOrigin(0.5).setVisible(false).setDepth(44); }
    createPools() {
      for (var i = 0; i < MAX_CELLS; i++) { this.gridViews.push(this.add.image(0, 0, 'cc_tile').setOrigin(0.5).setVisible(false).setDepth(3)); this.cellViews.push({ image: this.add.image(0, 0, 'cc_cube_dawn_0').setOrigin(0.5, 1).setVisible(false).setDepth(20), pip: this.add.text(0, 0, '', { fontFamily: 'Verdana, Geneva, sans-serif', resolution: GGKit.hiDpi.dpr(), fontSize: '14px', fontStyle: 'bold', color: '#e8ffff', align: 'center' }).setOrigin(0.5).setVisible(false).setDepth(22), piece: null }); }
      this.activeView = this.add.image(0, 0, 'cc_cube_dawn_1').setOrigin(0.5, 1).setVisible(false).setDepth(70); this.cursorView = this.add.image(0, 0, 'cc_cursor').setOrigin(0.5, 0.85).setVisible(false).setDepth(75);
      for (var n = 0; n < 3; n++) this.nextViews.push(this.add.image(0, 0, 'cc_cube_dawn_0').setOrigin(0.5).setVisible(false).setDepth(112));
      for (var family in this.fxPools) for (var f = 0; f < 32; f++) this.fxPools[family].push({ image: this.add.image(0, 0, 'cc_fx_' + family).setOrigin(0.5).setVisible(false).setBlendMode(Phaser.BlendModes.ADD).setDepth(120), life: 0, max: 0, x: 0, y: 0, vx: 0, vy: 0, spin: 0, scale: 1 });
    }
    createHud() {
      var textStyle = { fontFamily: 'Verdana, Geneva, sans-serif', resolution: GGKit.hiDpi.dpr(), fontStyle: 'bold' }, w = this.scale.width, h = this.scale.height; this.hud = {};
      this.hud.topChrome = this.add.image(0, 0, 'cc_topChrome').setOrigin(0).setDepth(100); this.hud.bottomChrome = this.add.image(0, h, 'cc_bottomChrome').setOrigin(0, 1).setDepth(100);
      this.hud.level = this.add.text(16, 14, 'R01', Object.assign({}, textStyle, { fontSize: '15px', color: '#f1fbff' })).setDepth(102);
      this.hud.score = this.add.text(w - 62, 14, '00000', Object.assign({}, textStyle, { fontSize: '16px', color: '#f1fbff' })).setOrigin(1, 0).setDepth(102);
      this.hud.pause = this.add.rectangle(w - 28, 28, 44, 44, 0x153a4e, 0.9).setDepth(104).setInteractive(); this.hud.pauseIcon = this.add.text(w - 28, 28, 'Ⅱ', Object.assign({}, textStyle, { fontSize: '18px', color: '#d9fbff' })).setOrigin(0.5).setDepth(105); this.hud.pause.on('pointerdown', () => this.pauseGame());
      this.hud.timer = this.add.text(16, 49, '◷ 60', Object.assign({}, textStyle, { fontSize: '14px', color: '#b7d7df' })).setDepth(102);
      this.hud.fillTrack = this.add.rectangle(72, 56, Math.max(80, w - 190), 5, 0x274354, 0.95).setOrigin(0, 0.5).setDepth(102); this.hud.fill = this.add.rectangle(72, 56, 0, 5, 0x65f2d7, 1).setOrigin(0, 0.5).setDepth(103);
      this.hud.lives = this.add.text(w - 17, 49, '♥♥♥', Object.assign({}, textStyle, { fontSize: '15px', color: '#ff9a86' })).setOrigin(1, 0).setDepth(102);
      this.hud.nextMarker = this.add.text(16, 76, '›', Object.assign({}, textStyle, { fontSize: '18px', color: '#7ba3b2' })).setDepth(102);
      this.hud.skinButton = this.add.rectangle(w * 0.5, 88, 44, 44, 0x071522, 0.01).setDepth(104).setInteractive(); this.hud.skin = this.add.rectangle(w * 0.5, 88, 18, 18, 0x70f5d8, 1).setDepth(105); this.hud.skinButton.on('pointerdown', () => this.cycleSkin());
      this.hud.combo = this.add.text(w - 17, 76, '×0', Object.assign({}, textStyle, { fontSize: '15px', color: '#ffd477' })).setOrigin(1, 0).setDepth(102).setVisible(false);
      this.hud.calloutBg = this.add.rectangle(16, 0, Math.max(80, w - 32), 26, 0x071522, 0.92).setOrigin(0).setDepth(108).setVisible(false);
      this.hud.callout = this.add.text(26, 0, '', Object.assign({}, textStyle, { fontSize: '14px', color: '#d9fbff' })).setOrigin(0, 0.5).setDepth(109).setVisible(false);
      this.hud.tutorialBg = this.add.rectangle(0, 0, w, 28, 0x0c2a3a, 0.9).setOrigin(0).setDepth(108).setVisible(false);
      this.hud.tutorial = this.add.text(16, 0, '', Object.assign({}, textStyle, { fontSize: '14px', color: '#f4ce81' })).setOrigin(0, 0.5).setDepth(109).setVisible(false);
      this.hud.banner = this.add.container(w * 0.5, h * 0.43).setDepth(150).setAlpha(0); this.hud.bannerBg = this.add.rectangle(0, 0, Math.min(w * 0.62, 300), 62, 0x071522, 0.97); this.hud.bannerTop = this.add.rectangle(0, -31, Math.min(w * 0.62, 300), 2, 0x70f5d8, 0.9); this.hud.bannerBottom = this.add.rectangle(0, 31, Math.min(w * 0.62, 300), 2, 0x70f5d8, 0.9); this.hud.bannerTitle = this.add.text(0, -11, '', Object.assign({}, textStyle, { fontSize: '18px', color: '#edffff', align: 'center' })).setOrigin(0.5); this.hud.bannerSub = this.add.text(0, 14, '', Object.assign({}, textStyle, { fontSize: '13px', color: '#90d6d7', align: 'center' })).setOrigin(0.5); this.hud.banner.add([this.hud.bannerBg, this.hud.bannerTop, this.hud.bannerBottom, this.hud.bannerTitle, this.hud.bannerSub]);
      this.createControls(); this.positionHud();
    }
    createControls() {
      var self = this; this.controls = []; for (var i = 0; i < ACTIONS.length; i++) (function (action) { var bg = self.add.image(0, 0, 'cc_button').setDisplaySize(76, 50).setDepth(105).setInteractive(); var text = self.add.text(0, 0, DIRS[action].label, { fontFamily: 'Verdana, Geneva, sans-serif', resolution: GGKit.hiDpi.dpr(), fontSize: '24px', fontStyle: 'bold', color: '#d5fbff' }).setOrigin(0.5).setDepth(106); bg.on('pointerdown', function () { self.act(action); }); self.controls.push({ action: action, bg: bg, text: text, cache: '' }); }(ACTIONS[i]));
    }
    bindAccessibleControls() {
      var self = this, buttons = document.querySelectorAll('#accessible-controls [data-cc-action]'); for (var i = 0; i < buttons.length; i++) buttons[i].addEventListener('click', function () { self.act(this.getAttribute('data-cc-action')); });
      var resume = document.getElementById('cc-resume'); if (resume) resume.addEventListener('click', function () { kit.resume('manual'); });
    }
    onKitPause(reason) { if (reason === 'manual') { var overlay = document.getElementById('pause-overlay'); if (overlay) overlay.hidden = false; } }
    onKitResume() { var overlay = document.getElementById('pause-overlay'); if (overlay) overlay.hidden = true; }
    pauseGame() { if (this.run.mode !== 'play' || kit.paused) return; kit.audio.sfx('hold', { volume: 0.25 }); kit.pause('manual'); }
    positionHud() {
      if (!this.hud) return; var w = this.scale.width, h = this.scale.height; this.layout = layoutFor(this); var l = this.layout, bannerWidth = Math.min(w * 0.62, 300);
      this.hud.topChrome.setDisplaySize(w, l.top + 8); this.hud.bottomChrome.setPosition(0, h).setDisplaySize(w, l.bottom + 8);
      this.hud.level.setPosition(l.leftHud, l.row1); this.hud.score.setPosition(l.rightHud - 45, l.row1); this.hud.pause.setPosition(l.rightHud - 11, l.row1 + 14); this.hud.pauseIcon.setPosition(l.rightHud - 11, l.row1 + 14);
      this.hud.timer.setPosition(l.leftHud, l.row2); this.hud.fillTrack.setPosition(l.meterX, l.row2 + 8).setSize(l.meterWidth, 5); this.hud.fill.setPosition(l.meterX, l.row2 + 8);
      this.hud.lives.setPosition(l.rightHud, l.row2); this.hud.nextMarker.setPosition(l.leftHud, l.row3 - 4); this.hud.skinButton.setPosition(w * 0.5, l.row3 + 8); this.hud.skin.setPosition(w * 0.5, l.row3 + 8); this.hud.combo.setPosition(l.rightHud, l.row3 - 4);
      this.hud.calloutBg.setPosition(l.safeLeft + 16, l.transientY).setSize(Math.max(80, w - l.safeLeft - l.safeRight - 32), 26); this.hud.callout.setPosition(l.safeLeft + 26, l.transientY + 13); this.hud.tutorialBg.setPosition(0, l.transientY).setSize(w, 28); this.hud.tutorial.setPosition(l.safeLeft + 16, l.transientY + 14);
      this.hud.banner.setPosition(w * 0.5, h * 0.43); this.hud.bannerBg.setSize(bannerWidth, 62); this.hud.bannerTop.setSize(bannerWidth, 2); this.hud.bannerBottom.setSize(bannerWidth, 2); this.positionControls();
    }
    positionControls() { if (!this.controls) return; var cx = this.scale.width * 0.5, cy = this.layout.controlsY, places = [[cx - 126, cy], [cx - 42, cy], [cx + 42, cy], [cx + 126, cy]]; for (var i = 0; i < this.controls.length; i++) { this.controls[i].bg.setPosition(places[i][0], places[i][1]); this.controls[i].text.setPosition(places[i][0], places[i][1]); } }
    onResize(size) { if (!this.hud) return; this.background.setDisplaySize(size.width, size.height); this.floor.setPosition(size.width * 0.5, size.height * 0.59).setScale(Math.min(1.15, size.width / 390)); this.vignette.setSize(size.width, size.height); this.positionHud(); this.renderAll(); }
    setMusic(name, fade) { if (this.musicName === name) return; this.musicName = name; kit.audio.music(name, fade); }
    startLevel(level, preserveLives, forcedPyramid) {
      level = validLevel(level); var forced = forcedPyramid || pendingDebug.pyramid, theme = forced ? pyramidById(forced) : PYRAMIDS[Math.min(PYRAMIDS.length - 1, Math.floor((level - 1) / 2))]; if (!theme) theme = PYRAMIDS[0];
      var r = this.run, width = clamp(6 + Math.floor((level - 1) / 8), 6, 8), rows = clamp(8 + Math.floor((level - 1) / 4), 8, 10); if (!preserveLives) r.lives = 3;
      r.mode = 'play'; r.level = level; r.theme = theme; r.skin = isUnlocked(profile.selectedSkin) ? skinById(profile.selectedSkin) : SKINS[0]; r.width = width; r.rows = rows; r.board = []; for (var x = 0; x < width; x++) r.board.push([]); r.cursor = Math.floor(width / 2); r.active = null; r.held = null; r.holdUsed = false; r.next = []; r.queuedAction = null; r.levelElapsed = 0; r.roundTime = clamp(62 - level * 1.25, 38, 62); r.dropSpeed = clamp(1.28 + level * 0.035, 1.28, 2.5); r.combo = 0; r.cascadeDepth = 0; r.resolveTimer = 0; r.pendingMatches = null; r.dropRequested = false; r.hazard = { timer: Math.max(4.8, 9.2 - level * 0.12), column: 0, warning: false, active: 0 }; r.threat = ''; r.threatTime = 0; r.damageFlash = 0; r.noHit = true; r.medal = 0; r.totalClears = 0; r.targetClears = 4 + Math.min(8, Math.floor(level / 2));
      for (var n = 0; n < 4; n++) r.next.push(this.randomColor()); this.spawnPiece(); this.layout = layoutFor(this); this.positionControls(); this.tutorialStep = level === 1 && !profile.tutorialDone ? 0 : 3; this.banner.active = false; this.callout.time = 0; this.callout.queue.length = 0; this.callout.text = ''; if (level === 1 && !profile.tutorialDone) this.showTutorial('TUTORIAL 1/4 • AIM + DROP', '#f4ce81', 3);
      if (level > 1 && level % 3 === 0) this.showBanner('ROUND ' + String(level).padStart(2, '0'), theme.name + ' • ' + Math.round(r.roundTime) + 's', theme.accent); pendingDebug.level = null; pendingDebug.pyramid = null; syncDebug(r); this.renderAll();
    }
    forcePyramid(id) { var p = pyramidById(id); if (p) this.startLevel(this.run.level, false, p.id); }
    randomColor() { return Math.floor(this.run.rng() * PIECE_COLORS.length); }
    makePiece(pieceColor) { return { color: pieceColor == null ? this.randomColor() : pieceColor, dropPulse: 0, clearPulse: 0, rotation: 0, settled: 0 }; }
    spawnPiece() {
      var r = this.run, available = []; for (var x = 0; x < r.width; x++) if (r.board[x].length < r.rows) available.push(x); if (!available.length) { this.loseLife('overflow'); return; }
      if (!r.next.length) for (var i = 0; i < 4; i++) r.next.push(this.randomColor()); var pieceColor = r.next.shift(); r.next.push(this.randomColor()); r.cursor = clamp(r.cursor, 0, r.width - 1); r.active = { color: pieceColor, x: r.cursor, y: r.rows + 0.35, dropPulse: 0, clearPulse: 0, rotation: 0, settled: 0 }; r.holdUsed = false; r.dropRequested = false;
    }
    landingY(x) { return this.run.board[x] ? this.run.board[x].length : 0; }
    act(action) {
      var r = this.run; if (!DIRS[action] || kit.paused) return; if (r.mode === 'fail') { if (action === 'drop' || action === 'hold') this.restartRun(); return; } if (r.mode === 'clear') { this.startLevel(r.level + 1, true, null); return; } if (r.mode !== 'play') return;
      if (!r.active) { r.queuedAction = action; return; }
      if (action === 'left' || action === 'right') { var delta = action === 'left' ? -1 : 1; r.cursor = clamp(r.cursor + delta, 0, r.width - 1); r.active.x = r.cursor; kit.audio.sfx('move', { volume: 0.34, rate: action === 'left' ? 0.92 : 1.05 }); return; }
      if (action === 'hold') { if (r.holdUsed) { this.showCallout('HOLD USED', '#ffb6a7', 0.8); return; } var swap = r.held; r.held = r.active.color; r.holdUsed = true; r.active.color = swap == null ? r.next.shift() : swap; if (r.next.length < 4) r.next.push(this.randomColor()); r.active.y = r.rows + 0.35; r.active.x = r.cursor; kit.audio.sfx('hold', { volume: 0.46, rate: 1.08 }); this.spawnFx('combo', r.cursor, r.rows - 0.4, PIECE_COLORS[r.active.color].hex, 1); return; }
      r.dropRequested = true; r.active.y = Math.max(this.landingY(r.active.x), r.active.y - 2.2); if (r.active.y <= this.landingY(r.active.x) + 0.04) this.landActive(); else kit.audio.sfx('drop', { volume: 0.22, rate: 1.15 });
    }
    actionFromSwipe(dx, dy) { if (Math.abs(dy) > Math.abs(dx) && dy > 24) return 'drop'; if (Math.abs(dx) < 20) return null; return dx < 0 ? 'left' : 'right'; }
    browserPointerId(pointer) { return pointer && pointer.event && pointer.event.pointerId != null ? pointer.event.pointerId : pointer && pointer.pointerId != null ? pointer.pointerId : 'mouse'; }
    pointerPosition(pointer, id) {
      var p = id != null ? kit.input.pointers.get(id) : null, canvas = this.game.canvas, rect = canvas.getBoundingClientRect(); if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return { x: (p.x - rect.left) * this.scale.width / Math.max(1, rect.width), y: (p.y - rect.top) * this.scale.height / Math.max(1, rect.height) }; return { x: pointer && Number.isFinite(pointer.x) ? pointer.x : 0, y: pointer && Number.isFinite(pointer.y) ? pointer.y : 0 };
    }
    bindInput() {
      var self = this; this.input.on('pointerdown', function (pointer) { var id = self.browserPointerId(pointer), pos = self.pointerPosition(pointer, id); if (!self.pointerStarts[id]) self.pointerStarts[id] = pos; }); this.input.on('pointerup', function (pointer) { self.releasePointer(pointer); }); this.input.on('pointercancel', function (pointer) { self.clearPointer(pointer); }); this.input.on('gameout', function () { self.pointerStarts = Object.create(null); self.pointerZones = Object.create(null); });
    }
    claimPointer(pointer, action) { var id = this.browserPointerId(pointer), pos = this.pointerPosition(pointer, id); if (!this.pointerStarts[id]) this.pointerStarts[id] = pos; if (action) this.pointerZones[id] = action; }
    clearPointer(pointer) { var id = this.browserPointerId(pointer); delete this.pointerStarts[id]; delete this.pointerZones[id]; }
    releasePointer(pointer) { var id = this.browserPointerId(pointer), start = this.pointerStarts[id]; if (!start) return; var pos = this.pointerPosition(pointer, id), action = this.actionFromSwipe(pos.x - start.x, pos.y - start.y); if (!action && this.pointerZones[id] && Math.hypot(pos.x - start.x, pos.y - start.y) < 38) action = this.pointerZones[id]; this.clearPointer(pointer); if (action) this.act(action); }
    updateKeyboard() {
      var r = this.run, self = this, entries = [['ArrowLeft', 'left'], ['KeyA', 'left'], ['ArrowRight', 'right'], ['KeyD', 'right'], ['ArrowDown', 'drop'], ['KeyS', 'drop'], ['Space', 'drop'], ['Enter', 'drop'], ['KeyH', 'hold'], ['KeyQ', 'left'], ['KeyE', 'right'], ['KeyZ', 'drop'], ['KeyC', 'drop'], ['KeyR', 'drop']];
      for (var i = 0; i < entries.length; i++) { var code = entries[i][0], on = kit.input.keyDown(code); if (on && !this.keyLatch[code]) { if ((code === 'Space' || code === 'Enter' || code === 'KeyR') && r.mode === 'fail') this.restartRun(); else this.act(entries[i][1]); } this.keyLatch[code] = on; }
      var esc = kit.input.keyDown('Escape'); if (esc && !this.keyLatch.Escape) { if (kit.paused) kit.resume('manual'); else this.pauseGame(); } this.keyLatch.Escape = esc; this.pollGamepad();
    }
    pollGamepad() {
      if (!navigator.getGamepads) return; var pads = navigator.getGamepads(), pad = null; for (var i = 0; i < pads.length; i++) if (pads[i]) { pad = pads[i]; break; } if (!pad) return; var axis = Number(pad.axes && pad.axes[0]) || 0, left = axis < -0.55 || !!(pad.buttons[14] && pad.buttons[14].pressed), right = axis > 0.55 || !!(pad.buttons[15] && pad.buttons[15].pressed), drop = !!(pad.buttons[0] && pad.buttons[0].pressed) || !!(pad.buttons[13] && pad.buttons[13].pressed), hold = !!(pad.buttons[1] && pad.buttons[1].pressed), pause = !!(pad.buttons[9] && pad.buttons[9].pressed); this.gamepadRepeat -= STEP; if (left || right) { var action = left ? 'left' : 'right'; if (!this.gamepadLatch[action] || this.gamepadRepeat <= 0) { this.act(action); this.gamepadRepeat = 0.18; } } else this.gamepadRepeat = 0; if (drop && !this.gamepadLatch.drop) this.act('drop'); if (hold && !this.gamepadLatch.hold) this.act('hold'); if (pause && !this.gamepadLatch.pause) { if (kit.paused) kit.resume('manual'); else this.pauseGame(); } this.gamepadLatch.left = left; this.gamepadLatch.right = right; this.gamepadLatch.drop = drop; this.gamepadLatch.hold = hold; this.gamepadLatch.pause = pause;
    }
    createBoardMatches() {
      var r = this.run, visited = Object.create(null), matches = [], groups = [], directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var x = 0; x < r.width; x++) for (var y = 0; y < r.board[x].length; y++) { var origin = r.board[x][y], originKey = key(x, y); if (!origin || visited[originKey]) continue; var queue = [{ x: x, y: y }], group = []; visited[originKey] = true; while (queue.length) { var spot = queue.shift(), piece = r.board[spot.x][spot.y]; group.push({ x: spot.x, y: spot.y, piece: piece }); for (var d = 0; d < directions.length; d++) { var nx = spot.x + directions[d][0], ny = spot.y + directions[d][1], nk = key(nx, ny), neighbor = nx >= 0 && nx < r.width && r.board[nx] && r.board[nx][ny]; if (neighbor && neighbor.color === origin.color && !visited[nk]) { visited[nk] = true; queue.push({ x: nx, y: ny }); } } } if (group.length >= 3) groups.push(group); }
      var unique = Object.create(null); for (var g = 0; g < groups.length; g++) for (var q = 0; q < groups[g].length; q++) { var cell = groups[g][q]; unique[key(cell.x, cell.y)] = cell; }
      var fullRows = []; for (var row = 0; row < r.rows; row++) { var full = true; for (var col = 0; col < r.width; col++) if (!r.board[col][row]) { full = false; break; } if (full) fullRows.push(row); }
      for (var fr = 0; fr < fullRows.length; fr++) for (var fc = 0; fc < r.width; fc++) unique[key(fc, fullRows[fr])] = { x: fc, y: fullRows[fr], piece: r.board[fc][fullRows[fr]] };
      for (var k in unique) matches.push(unique[k]); return { matches: matches, groups: groups.length, rows: fullRows.length };
    }
    landActive() {
      var r = this.run, active = r.active, column = r.board[active.x]; if (!column || column.length >= r.rows) { this.loseLife('overflow'); return; }
      var piece = this.makePiece(active.color); piece.dropPulse = 1; piece.rotation = (active.x % 2 ? 1 : -1) * 0.05; column.push(piece); this.spawnFx('drop', active.x, column.length - 0.5, PIECE_COLORS[piece.color].hex, 8); kit.audio.sfx('drop', { volume: 0.54, rate: 0.94 + r.rng() * 0.12 }); this.addScore(5 + r.level); r.active = null; r.dropRequested = false; this.tutorialAfter('drop'); var found = this.createBoardMatches(); if (found.matches.length >= 3) { r.pendingMatches = found; r.resolveTimer = 0.18; r.cascadeDepth = 0; } else { this.spawnPiece(); this.consumeQueuedAction(); }
    }
    resolveMatches() {
      var r = this.run, result = this.createBoardMatches(); if (result.matches.length < 3) { r.pendingMatches = null; r.cascadeDepth = 0; this.spawnPiece(); this.consumeQueuedAction(); return; }
      var count = result.matches.length, targets = result.matches, removed = Object.create(null); for (var i = 0; i < targets.length; i++) { var target = targets[i]; removed[key(target.x, target.y)] = true; target.piece.clearPulse = 1; gridPoint(this, target.x, target.y, this.tmp); this.spawnFx('match', target.x, target.y, PIECE_COLORS[target.piece.color].hex, 3); }
      for (var x = 0; x < r.width; x++) { var kept = []; for (var y = 0; y < r.board[x].length; y++) if (!removed[key(x, y)]) kept.push(r.board[x][y]); r.board[x] = kept; }
      r.cascadeDepth++; r.combo = Math.min(99, r.combo + 1); r.totalClears += count; var multiplier = Math.max(1, r.combo + r.cascadeDepth - 1), points = count * (20 + r.level * 3) * multiplier + result.rows * 40; this.addScore(points); this.spawnFx('clear', r.cursor, r.rows - 0.4, r.skin.accent, 2); if (r.combo > 1 || r.cascadeDepth > 1) { this.spawnFx('combo', r.cursor, r.rows - 0.9, '#ffd477', 2); kit.audio.sfx('cascade', { volume: 0.72, rate: 0.88 + r.cascadeDepth * 0.03 }); kit.audio.sfx('combo', { volume: 0.7, rate: 0.88 + r.combo * 0.03 }); this.showCallout('CASCADE ×' + multiplier + '  +' + points, '#ffd477', 1); } else { kit.audio.sfx('match', { volume: 0.74, rate: 0.96 }); this.showCallout((result.rows ? 'LINE' : 'MATCH') + ' CLEAR  +' + points, r.skin.accent, 0.9); } this.tutorialAfter('match'); if (r.totalClears >= r.targetClears) { this.clearLevel(); return; } r.pendingMatches = null; r.resolveTimer = 0.2; r.active = null;
    }
    consumeQueuedAction() { var action = this.run.queuedAction; this.run.queuedAction = null; if (action) this.act(action); }
    clearLevel() {
      var r = this.run, medal = r.noHit && r.levelElapsed <= 28 ? 4 : r.noHit ? 3 : r.levelElapsed <= r.roundTime + 20 ? 2 : 1; r.medal = medal; r.mode = 'clear'; this.addScore(r.level * 120 + r.lives * 40 + medal * 55); profile.medals[r.theme.id] = Math.max(profile.medals[r.theme.id] || 0, medal); var nextSkin = SKINS[Math.min(SKINS.length - 1, r.level)]; saveSkin(nextSkin.id); persist(); kit.audio.sfx('clear', { volume: 0.9 }); this.setMusic('musicBase', 700); this.showBanner('ROUND CLEAR', 'MEDAL ' + medal + ' • NEW ' + nextSkin.name, r.skin.accent); r.threat = ''; r.threatTime = 0;
    }
    tutorialAfter(kind) {
      if (this.tutorialStep === 0 && kind === 'drop') { this.tutorialStep = 1; this.showTutorial('TUTORIAL 2/4 • MATCH THREE', '#f4ce81', 3); }
      else if (this.tutorialStep === 1 && kind === 'match') { this.tutorialStep = 2; this.showTutorial('TUTORIAL 3/4 • STACKS FALL', '#f4ce81', 3); }
      else if (this.tutorialStep === 2 && kind === 'drop') { this.tutorialStep = 3; this.showTutorial('TUTORIAL 4/4 • HOLD A COLOR', '#f4ce81', 3); }
      else if (this.tutorialStep === 3 && kind === 'match') { this.tutorialStep = 4; profile.tutorialDone = true; persist(); this.showTutorial('TUTORIAL COMPLETE • BUILD CASCADES', '#82f5d7', 2.5); }
    }
    addScore(points) { this.run.score += Math.max(0, Math.round(points)); if (this.run.score > profile.best) { profile.best = this.run.score; persist(); } }
    loseLife(reason) {
      var r = this.run; if (r.mode !== 'play') return; r.noHit = false; r.lives = Math.max(0, r.lives - 1); r.damageFlash = 1; r.threat = reason === 'overflow' ? 'OVERFLOW' : reason === 'timeout' ? 'TIMEOUT' : 'SURGE HIT'; r.threatTime = 1; this.showCallout(r.threat, '#ff9a91', 1); this.spawnFx('clear', r.cursor, r.rows - 0.4, '#ff7187', 3); kit.audio.sfx(reason === 'overflow' ? 'overflow' : 'warning', { volume: 0.9 }); this.setMusic('musicDanger', 450); if (kit.juice.enabled) { kit.juice.hitStop(75); kit.juice.shake(7, 160); }
      if (r.lives <= 0) { r.mode = 'fail'; this.showBanner('RUN OVER', 'SCORE ' + Math.round(r.score) + ' • DROP TO RETRY', '#ff7187'); this.addScore(0); return; }
      for (var x = 0; x < r.width; x++) if (r.board[x].length) r.board[x].pop(); r.roundTime = clamp(54 - r.level, 30, 54); r.active = null; r.resolveTimer = 0; r.pendingMatches = null; r.hazard.timer = Math.max(3.8, r.hazard.timer); this.spawnPiece();
    }
    updateHazard() {
      var r = this.run, h = r.hazard; h.timer -= STEP; h.active = Math.max(0, h.active - STEP); var danger = false; for (var x = 0; x < r.width; x++) if (r.board[x].length >= r.rows - 1) danger = true;
      if (h.timer <= 1.35 && !h.warning) { h.warning = true; h.column = Math.floor(r.rng() * r.width); r.threat = 'SURGE C' + (h.column + 1); r.threatTime = 1; kit.audio.sfx('warning', { volume: 0.42 }); this.setMusic('musicDanger', 600); this.showCallout(r.threat, '#ff9a9a', 1); }
      if (h.timer <= 0) { h.timer = Math.max(4.2, 8.8 - r.level * 0.12); h.warning = false; h.active = 0.8; var column = r.board[h.column]; if (column.length >= r.rows - 1) this.loseLife('surge'); else { column.push(this.makePiece(this.randomColor())); this.spawnFx('drop', h.column, column.length - 0.5, '#ff7187', 8); r.threat = 'SURGE LANDED'; r.threatTime = 1; this.showCallout(r.threat, '#ff9a9a', 1); } }
      if (!danger && h.timer > 1.5 && !h.warning && r.threatTime <= 0) this.setMusic('musicBase', 700); r.danger = danger || h.warning;
    }
    updateGamepadClear() { if (kit.paused) { this.gamepadLatch = Object.create(null); this.gamepadRepeat = 0; } }
    stepSim() {
      var r = this.run; this.renderClock += STEP; if (this.banner.active) this.banner.age += STEP; if (this.callout.time > 0) { this.callout.time -= STEP; if (this.callout.time <= 0) this.advanceCallout(); } if (r.threatTime > 0) r.threatTime -= STEP; r.damageFlash = Math.max(0, r.damageFlash - STEP * 2.8); this.updateFx();
      if (r.mode === 'fail') { syncDebug(r); return; }
      if (r.mode === 'clear') { if (this.banner.age > this.banner.duration + 0.45) this.startLevel(r.level + 1, true, null); syncDebug(r); return; }
      for (var bx = 0; bx < r.width; bx++) for (var by = 0; by < r.board[bx].length; by++) { var settledPiece = r.board[bx][by]; settledPiece.dropPulse = Math.max(0, settledPiece.dropPulse - STEP * 3.2); settledPiece.clearPulse = Math.max(0, settledPiece.clearPulse - STEP * 4.2); settledPiece.settled = Math.min(1, settledPiece.settled + STEP); }
      r.levelElapsed += STEP; r.roundTime -= STEP; r.combo = r.combo > 0 && r.resolveTimer <= 0 ? Math.max(0, r.combo - STEP * 0.32) : r.combo; if (r.roundTime <= 0) { this.loseLife('timeout'); syncDebug(r); return; }
      if (r.active) { var landing = this.landingY(r.active.x), fallSpeed = r.dropRequested ? r.dropSpeed * 4.2 : r.dropSpeed; r.active.y -= STEP * fallSpeed; r.active.dropPulse = Math.max(0, r.active.dropPulse - STEP * 3.2); r.active.rotation = kit.juice.enabled ? Math.sin(this.renderClock * 9) * 0.04 : 0; if (r.active.y <= landing + 0.02) this.landActive(); }
      else if (r.resolveTimer > 0) { r.resolveTimer -= STEP; if (r.resolveTimer <= 0) this.resolveMatches(); }
      this.updateHazard(); if (r.threatTime <= 0) r.threat = ''; this.updateGamepadClear(); syncDebug(r);
    }
    beginCallout(item) { this.callout.text = item.text; this.callout.color = item.color; this.callout.time = item.duration; this.callout.kind = item.kind; }
    enqueueCallout(item) { if (this.callout.time > 0) { if (this.callout.queue.length < 4) this.callout.queue.push(item); return; } this.beginCallout(item); }
    advanceCallout() { this.callout.time = 0; if (this.callout.queue.length) this.beginCallout(this.callout.queue.shift()); }
    showCallout(text, calloutColor, duration) { this.enqueueCallout({ text: text, color: calloutColor || '#a9d1db', duration: Math.min(duration || 0.9, 1), kind: 'chip' }); }
    showTutorial(text, calloutColor, duration) { this.enqueueCallout({ text: text, color: calloutColor || '#f4ce81', duration: Math.min(duration || 3, 3), kind: 'tutorial' }); }
    showBanner(title, subtitle, bannerColor) { this.callout.time = 0; this.callout.queue.length = 0; this.banner.active = true; this.banner.age = 0; this.banner.duration = 1.35; this.banner.color = bannerColor || '#70f5d8'; setTextIfChanged(this.hud.bannerTitle, title); setTextIfChanged(this.hud.bannerSub, subtitle); setFillIfChanged(this.hud.bannerTop, color(this.banner.color), 0.92); setFillIfChanged(this.hud.bannerBottom, color(this.banner.color), 0.92); }
    cycleSkin() { var unlocked = profile.unlockedSkins, current = unlocked.indexOf(profile.selectedSkin), next = unlocked[(current + 1) % unlocked.length]; profile.selectedSkin = next; persist(); this.run.skin = skinById(next); this.showCallout('SKIN CHANGED', this.run.skin.accent, 0.8); }
    restartRun() { kit.input.clearAll(); this.pointerStarts = Object.create(null); this.pointerZones = Object.create(null); this.keyLatch = Object.create(null); this.gamepadLatch = Object.create(null); this.run.score = 0; this.startLevel(1, false, null); this.setMusic('musicBase', 500); }
    boardDangerX(x) { return this.run.board[x] && this.run.board[x].length >= this.run.rows - 1; }
    spawnFx(family, x, y, tint, count) {
      var pool = this.fxPools[family], point = gridPoint(this, x, y, this.tmp), made = 0; for (var i = 0; i < pool.length && made < (count || 1); i++) { var fx = pool[i]; if (fx.life > 0) continue; var angle = this.run.rng() * TAU, speed = family === 'drop' ? 28 : family === 'combo' ? 15 : 34 + this.run.rng() * 38; fx.life = fx.max = family === 'clear' ? 0.55 : 0.38 + this.run.rng() * 0.28; fx.x = point.x; fx.y = point.y - 24; fx.vx = Math.cos(angle) * speed; fx.vy = Math.sin(angle) * speed - (family === 'drop' ? 20 : 34); fx.spin = (this.run.rng() - 0.5) * 5; fx.scale = family === 'combo' ? 0.72 : 0.45 + this.run.rng() * 0.45; fx.image.setTexture('cc_fx_' + family).setTint(color(tint)).setPosition(fx.x, fx.y).setScale(fx.scale).setRotation(0).setAlpha(0.95).setVisible(true); made++; }
    }
    updateFx() { for (var family in this.fxPools) for (var i = 0; i < this.fxPools[family].length; i++) { var fx = this.fxPools[family][i]; if (fx.life <= 0) continue; fx.life -= STEP; fx.x += fx.vx * STEP; fx.y += fx.vy * STEP; fx.vy += 72 * STEP; fx.image.setPosition(fx.x, fx.y).setRotation(fx.image.rotation + fx.spin * STEP).setAlpha(clamp(fx.life / fx.max, 0, 1)); if (fx.life <= 0) fx.image.setVisible(false); } }
    renderAll() { if (!this.run || !this.layout) return; this.renderBoard(); this.renderActive(); this.renderNext(); this.renderHud(); this.renderBanner(); this.renderDamage(); }
    renderBoard() {
      var r = this.run, used = 0, l = this.layout; for (var x = 0; x < r.width; x++) for (var y = 0; y < r.rows; y++) { var point = gridPoint(this, x, y, this.tmp), tile = this.gridViews[used++]; tile.setVisible(true).setPosition(point.x, point.y).setDisplaySize(l.cellW * 0.97, l.cellH * 0.94).setDepth(3 + y); var piece = r.board[x][y], view = this.cellViews[used - 1]; if (!piece) { view.image.setVisible(false); view.pip.setVisible(false); continue; } var stage = piece.clearPulse > 0 ? 2 : piece.settled > 0.42 ? 1 : 0, texture = 'cc_cube_' + r.skin.id + '_' + stage, bob = kit.juice.enabled ? Math.sin(this.renderClock * 6 + x + y) * 1.2 : 0; view.image.setTexture(texture).setTint(PIECE_COLORS[piece.color].tint).setVisible(true).setPosition(point.x, point.y - bob).setDisplaySize(l.cellW * 0.92, l.cellH * 1.05).setRotation(kit.juice.enabled ? piece.rotation : 0).setDepth(20 + y); view.pip.setVisible(true).setPosition(point.x, point.y - l.cellH * 0.62).setDepth(22 + y); setTextIfChanged(view.pip, PIECE_COLORS[piece.color].name.charAt(0)); setColorIfChanged(view.pip, PIECE_COLORS[piece.color].hex); }
      for (var i = used; i < this.gridViews.length; i++) { this.gridViews[i].setVisible(false); this.cellViews[i].image.setVisible(false); this.cellViews[i].pip.setVisible(false); }
      if (r.hazard.warning) { var hp = gridPoint(this, r.hazard.column, r.rows - 1, this.tmp2); this.hazardMark.setVisible(true).setPosition(hp.x, hp.y - l.cellH * 0.72).setDisplaySize(l.cellW * 0.9, 20).setTint(0xff7187); } else this.hazardMark.setVisible(false);
    }
    renderActive() { var r = this.run, l = this.layout; if (!r.active) { this.activeView.setVisible(false); this.cursorView.setVisible(false); return; } var point = gridPoint(this, r.active.x, r.active.y, this.tmp), tint = PIECE_COLORS[r.active.color].tint; this.activeView.setTexture('cc_cube_' + r.skin.id + '_1').setTint(tint).setVisible(true).setPosition(point.x, point.y).setDisplaySize(l.cellW * 0.92, l.cellH * 1.05).setRotation(r.active.rotation).setDepth(75); var cursorPoint = gridPoint(this, r.cursor, 0, this.tmp2); this.cursorView.setVisible(true).setPosition(cursorPoint.x, this.layout.boardTop + l.cellH * r.rows + 12).setDisplaySize(l.cellW * 0.78, l.cellH * 0.86).setAlpha(kit.juice.enabled ? 0.7 + Math.sin(this.renderClock * 8) * 0.16 : 0.72); }
    renderNext() { var r = this.run, y = this.layout.row3 + 8, x = this.layout.leftHud + 22; for (var i = 0; i < this.nextViews.length; i++) { var p = r.next[i], view = this.nextViews[i]; if (p == null) { view.setVisible(false); continue; } view.setTexture('cc_cube_' + r.skin.id + '_0').setTint(PIECE_COLORS[p].tint).setVisible(true).setPosition(x + i * 27, y).setDisplaySize(24, 22).setDepth(112); } }
    renderHud() {
      var r = this.run, full = 0, total = r.width * r.rows, active = this.callout.time > 0, chip = active && this.callout.kind === 'chip', tutorial = active && this.callout.kind === 'tutorial'; for (var x = 0; x < r.width; x++) full += r.board[x].length;
      setTextIfChanged(this.hud.level, 'R' + String(r.level).padStart(2, '0')); setTextIfChanged(this.hud.score, String(Math.round(r.score)).padStart(5, '0')); setTextIfChanged(this.hud.timer, '◷ ' + Math.ceil(Math.max(0, r.roundTime))); setTextIfChanged(this.hud.lives, r.lives > 0 ? '♥'.repeat(r.lives) : '—'); setTextIfChanged(this.hud.combo, '×' + Math.max(0, Math.floor(r.combo))); this.hud.combo.setVisible(r.combo > 0.05); setFillIfChanged(this.hud.skin, color(r.skin.accent), 1);
      this.hud.calloutBg.setVisible(chip); this.hud.callout.setVisible(chip); setTextIfChanged(this.hud.callout, chip ? this.callout.text : ''); setColorIfChanged(this.hud.callout, this.callout.color); if (chip) this.hud.calloutBg.setSize(Math.min(this.scale.width - this.layout.safeLeft - this.layout.safeRight - 32, Math.max(88, this.hud.callout.width + 20)), 26); setFillIfChanged(this.hud.calloutBg, color(this.callout.color), 0.18);
      this.hud.tutorialBg.setVisible(tutorial); this.hud.tutorial.setVisible(tutorial); setTextIfChanged(this.hud.tutorial, tutorial ? this.callout.text : ''); setColorIfChanged(this.hud.tutorial, this.callout.color); setFillIfChanged(this.hud.tutorialBg, color(this.callout.color), 0.14);
      this.hud.fill.width = this.layout.meterWidth * clamp(full / Math.max(1, total), 0, 1); setFillIfChanged(this.hud.fill, r.danger ? 0xff7187 : 0x65f2d7, 1);
      for (var i = 0; i < this.controls.length; i++) { var c = this.controls[i], expected = this.tutorialStep === 0 && c.action === 'drop', fill = expected ? 0x295f64 : 0x153a4e, alpha = expected ? 1 : 0.94, stamp = fill + '/' + alpha; if (c.cache !== stamp) { setFillIfChanged(c.bg, fill, alpha); c.cache = stamp; } }
    }
    renderDamage() { this.vignette.setAlpha(this.run.damageFlash > 0 ? (kit.juice.enabled ? this.run.damageFlash * 0.28 : 0.18) : 0); }
    renderBanner() { if (!this.banner.active) { this.hud.banner.setAlpha(0); return; } var k = clamp(this.banner.age / this.banner.duration, 0, 1), scale = !kit.juice.enabled ? 1 : k < 0.27 ? lerp(0.72, 1.1, k / 0.27) : lerp(1.1, 1, (k - 0.27) / 0.73); this.hud.banner.setAlpha(k < 0.9 ? 1 : clamp(1 - (k - 0.9) / 0.4, 0, 1)).setScale(scale); if (this.banner.age > this.banner.duration + 0.4) { this.banner.active = false; this.hud.banner.setAlpha(0); } }
    update(time, delta) { var juice = kit.juice.frame(); this.cameras.main.setScroll(-juice.dx, -juice.dy); this.updateKeyboard(); var safeDelta = clamp(Number(delta) || 0, 0, STEP * 1000); if (!juice.frozen) { this.accumulator = Math.min(STEP, this.accumulator + safeDelta / 1000); if (this.accumulator >= STEP) { this.accumulator -= STEP; this.stepSim(); } } this.renderAll(); }
  }

  profile = kit.save.get(defaultSave()); if (!validateSave(profile)) profile = defaultSave();
  // The authored view is made from generated textures. Force Phaser's 2D
  // renderer so headless/software-GL does not silently present a black frame.
  Game.phaser = new Phaser.Game({ type: Phaser.CANVAS, parent: 'game', backgroundColor: '#07111f', render: Object.assign({}, GGKit.renderDefaults, { clearBeforeRender: true }), scale: { mode: Phaser.Scale.RESIZE, width: 390, height: 844, autoCenter: Phaser.Scale.CENTER_BOTH }, input: { activePointers: 4 }, scene: [BootScene, PlayScene] });
  function syncHiDpi(game) {
    var cssW = Math.max(1, Math.floor(document.documentElement.clientWidth || window.innerWidth || 1));
    var cssH = Math.max(1, Math.floor(document.documentElement.clientHeight || window.innerHeight || 1));
    GGKit.hiDpi.resize(game, cssW, cssH);
  }
  syncHiDpi(Game.phaser);
  window.addEventListener('resize', function () { syncHiDpi(Game.phaser); });
  window.addEventListener('orientationchange', function () { syncHiDpi(Game.phaser); });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) syncHiDpi(Game.phaser);
  });
  kit.registerPWA();
}());
