/* Bulwark - Phaser 3 AAA rebuild. GGKit owns lifecycle, input, save, audio. */
'use strict';

(function () {
  var E = window.BulwarkEngine;
  var GAME_W = 1280, GAME_H = 720;
  var STEP = 1 / 60, MAX_STEPS = 5;
  var CELL = 56, BOARD_X = 56, BOARD_Y = 116;
  var BOARD_W = CELL * 14, BOARD_H = CELL * 9;
  var MAX_CREEPS = 88, MAX_BULLETS = 128, MAX_PARTICLES = 96, MAX_PARTICLES_PER_SYSTEM = 24, MAX_FX = 32;
  var TAU = Math.PI * 2;
  var PAL = {
    ink: 0x06111e, panel: 0x0b1a2b, panel2: 0x10253a, line: 0x29445c,
    text: 0xe7f5ff, muted: 0x8fa8bb, cyan: 0x54d6ec, teal: 0x6de0c1,
    coral: 0xff665c, wine: 0xb72e4d, amber: 0xffdf79, white: 0xffffff,
    green: 0x8ff5d2, violet: 0xcda1ff, river: 0x1c526b, rock: 0x3a4857,
    sand: 0x756a56, canyon: 0x6e463e
  };
  var CSS = {
    text: '#e7f5ff', muted: '#8fa8bb', cyan: '#54d6ec', teal: '#6de0c1',
    coral: '#ff665c', amber: '#ffdf79', green: '#8ff5d2', violet: '#cda1ff'
  };
  var AUDIO = {
    build: 'assets/audio/build.mp3', select: 'assets/audio/select.mp3', fire: 'assets/audio/fire.mp3',
    hit: 'assets/audio/hit.mp3', leak: 'assets/audio/leak.mp3', clear: 'assets/audio/wave-clear.mp3',
    boss: 'assets/audio/boss.mp3', victory: 'assets/audio/victory.mp3', ambient: 'assets/audio/ambient.mp3',
    danger: 'assets/audio/danger.mp3', confirm: 'assets/audio/build.mp3', cancel: 'assets/audio/danger.mp3',
    place: 'assets/audio/build.mp3', upgrade: 'assets/audio/wave-clear.mp3', kill: 'assets/audio/wave-clear.mp3',
    warning: 'assets/audio/boss.mp3'
  };

  function readGamepad() {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return { dir: null, confirm: false, cancel: false, go: false };
    var pads = navigator.getGamepads();
    for (var i = 0; i < pads.length; i++) {
      var pad = pads[i]; if (!pad || !pad.connected) continue;
      var ax = Number(pad.axes && pad.axes[0]) || 0, ay = Number(pad.axes && pad.axes[1]) || 0, dir = null;
      if (Math.max(Math.abs(ax), Math.abs(ay)) >= 0.35) dir = Math.abs(ax) >= Math.abs(ay) ? (ax > 0 ? { dx: 1, dy: 0, code: 'right' } : { dx: -1, dy: 0, code: 'left' }) : (ay > 0 ? { dx: 0, dy: 1, code: 'down' } : { dx: 0, dy: -1, code: 'up' });
      else if (pad.buttons && pad.buttons[12] && pad.buttons[12].pressed) dir = { dx: 0, dy: -1, code: 'up' };
      else if (pad.buttons && pad.buttons[13] && pad.buttons[13].pressed) dir = { dx: 0, dy: 1, code: 'down' };
      else if (pad.buttons && pad.buttons[14] && pad.buttons[14].pressed) dir = { dx: -1, dy: 0, code: 'left' };
      else if (pad.buttons && pad.buttons[15] && pad.buttons[15].pressed) dir = { dx: 1, dy: 0, code: 'right' };
      return {
        dir: dir,
        confirm: !!(pad.buttons && pad.buttons[0] && pad.buttons[0].pressed),
        cancel: !!(pad.buttons && pad.buttons[1] && pad.buttons[1].pressed),
        go: !!(pad.buttons && pad.buttons[2] && pad.buttons[2].pressed)
      };
    }
    return { dir: null, confirm: false, cancel: false, go: false };
  }

  /* Boot fallback is deliberately useful before Phaser has created its scene. */
  var hook = window.__bw || {};
  hook.state = hook.state || { wave: 0, gold: 220, lives: 20, map: 'open-plains', score: 0, phase: 'boot' };
  if (hook.forceWave === undefined) hook.forceWave = null;
  if (hook.forceMap === undefined) hook.forceMap = null;
  window.__bw = hook;

  var Game = { phaser: null, scene: null };
  function validSave(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    if (o.v !== 1 || !Number.isInteger(o.best) || o.best < 0 || o.best > 99999999) return false;
    if (!Number.isInteger(o.map) || o.map < 0 || o.map >= E.MAPS.length) return false;
    if (typeof o.tutorialDone !== 'boolean') return false;
    if (!Array.isArray(o.medals) || o.medals.length !== 3) return false;
    for (var i = 0; i < o.medals.length; i++) if (!Number.isInteger(o.medals[i]) || o.medals[i] < 0 || o.medals[i] > 1) return false;
    return true;
  }
  var kit = GGKit.create({
    slug: 'bulwark', orientation: 'landscape', validateSave: validSave,
    onPause: function () {
      if (Game.scene && Game.scene.scene.isActive()) Game.scene.scene.pause();
    },
    onResume: function () {
      if (Game.scene && Game.scene.scene.isPaused()) Game.scene.scene.resume();
    },
    onRestart: function () {
      if (Game.scene) Game.scene.resetRun();
    }
  });
  kit.audio.register(AUDIO);
  var profile = kit.save.get({ v: 1, best: 0, map: 0, medals: [0, 0, 0], tutorialDone: false });
  if (!validSave(profile)) profile = { v: 1, best: 0, map: 0, medals: [0, 0, 0], tutorialDone: false };

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function safeDef(key, fallback) { return E.TOWERS[key] || E.TOWERS[fallback] || E.TOWERS.arrow; }
  function setTextIfChanged(obj, value) {
    value = String(value);
    if (obj.text !== value) obj.setText(value);
  }
  function setColorIfChanged(obj, value) {
    if (obj.__bwColor !== value) { obj.setColor(value); obj.__bwColor = value; }
  }
  function poly(g, points, fill, stroke, lineWidth) {
    if (!points || !points.length) return;
    g.beginPath();
    g.moveTo(points[0][0], points[0][1]);
    for (var i = 1; i < points.length; i++) g.lineTo(points[i][0], points[i][1]);
    g.closePath();
    if (fill !== undefined) { g.fillStyle(fill, 1); g.fillPath(); }
    if (stroke !== undefined) { g.lineStyle(lineWidth || 1, stroke, 1); g.strokePath(); }
  }
  function polygonCircle(g, x, y, r, fill, sides, stroke, lineWidth) {
    var points = [], n = sides || 10;
    for (var i = 0; i < n; i++) {
      var a = i / n * TAU;
      points.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
    poly(g, points, fill, stroke, lineWidth);
  }
  function ring(g, x, y, r, color, alpha, sides, width) {
    var n = sides || 28;
    g.lineStyle(width || 2, color, alpha == null ? 1 : alpha);
    g.beginPath();
    for (var i = 0; i <= n; i++) {
      var a = i / n * TAU, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.strokePath();
  }
  function cellXY(index) {
    return { x: BOARD_X + (index % 14) * CELL + CELL / 2, y: BOARD_Y + ((index / 14) | 0) * CELL + CELL / 2 };
  }

  function BulwarkScene() { Phaser.Scene.call(this, { key: 'Bulwark' }); }
  BulwarkScene.prototype = Object.create(Phaser.Scene.prototype);
  BulwarkScene.prototype.constructor = BulwarkScene;

  BulwarkScene.prototype.create = function () {
    Game.scene = this;
    this.accumulator = 0;
    this.mapIndex = E.mapIndex(hook.forceMap == null ? profile.map : hook.forceMap);
    this.map = new E.Map(E.MAPS[this.mapIndex]);
    this.pathCache = this.map.path();
    this.state = {
      phase: 'play', wave: 0, wavesDone: 0, gold: 220, lives: 20, leaks: 0, score: 0,
      map: E.MAPS[this.mapIndex].id, mapIndex: this.mapIndex, active: false, prep: 7,
      time: 0, kills: 0, message: '', messageT: 0, tutorialStep: profile.tutorialDone ? 4 : 0,
      medal: 0, endless: false, bankCount: 0, bankInterest: 0, earlyBonus: 0
    };
    this.towers = [];
    this.waveQueue = [];
    this.waveCursor = 0;
    this.waveClock = 0;
    this.selectedCell = -1;
    this.selectedTower = null;
    this.previewValid = false;
    this.previewPath = [];
    this.pending = 'arrow';
    this.lastBuiltType = 'wall';
    this.lastTapCell = -1;
    this.lastTapAt = 0;
    this.cursor = { x: 1, y: 1 };
    this.gamepadEdges = { dir: null, confirm: false, cancel: false, go: false };
    this.cursorRepeat = 0;
    this.lastForceWave = null;
    this.lastForceMap = null;
    this.beacon = { state: 'idle', time: 0 };
    this.pointerClaims = {};
    this.keyEdges = {};
    this.occupied = new Int32Array(MAX_CREEPS);
    this.occupiedCount = 0;
    this.creeps = [];
    this.bullets = [];
    this.particleSystems = { contactSparks: [], dustDebris: [], projectileTrails: [], waveBursts: [] };
    this.effects = [];
    this.toastQueue = [];
    this.bannerQueue = [];
    this.banner = null;
    this.coachStep = profile.tutorialDone ? 4 : 0;
    this.coachT = profile.tutorialDone ? 0 : 3.2;
    this.allocPools();
    this.makeTextures();
    this.world = this.add.container(0, 0).setDepth(1);
    this.terrainImage = this.add.image(0, 0, 'bw-terrain').setOrigin(0);
    this.pathGfx = this.add.graphics();
    this.decalGfx = this.add.graphics();
    this.unitGfx = this.add.graphics();
    this.fxGfx = this.add.graphics();
    this.world.add([this.terrainImage, this.pathGfx, this.decalGfx, this.unitGfx, this.fxGfx]);
    this.uiGfx = this.add.graphics().setDepth(20);
    this.makeTextUi();
    this.refreshTerrain();
    this.syncHook();
    kit.loader.progress(1);
    kit.loader.hide();
    kit.registerPWA();
    kit.audio.preload(Object.keys(AUDIO));
    this.safeMusic = false;
    this.juiceFrame = { dx: 0, dy: 0, frozen: false };
  };

  BulwarkScene.prototype.allocPools = function () {
    var i;
    for (i = 0; i < MAX_CREEPS; i++) this.creeps.push({ active: false, stamp: 0, tx: -1, ty: -1 });
    for (i = 0; i < MAX_BULLETS; i++) this.bullets.push({ active: false });
    var particleNames = ['contactSparks', 'dustDebris', 'projectileTrails', 'waveBursts'];
    for (var n = 0; n < particleNames.length; n++) {
      for (i = 0; i < MAX_PARTICLES_PER_SYSTEM; i++) this.particleSystems[particleNames[n]].push({ active: false });
    }
    for (i = 0; i < MAX_FX; i++) this.effects.push({ active: false });
  };

  BulwarkScene.prototype.makeTextures = function () {
    if (!this.textures.exists('bw-chrome')) {
      var chrome = this.textures.createCanvas('bw-chrome', GAME_W, GAME_H);
      var cc = chrome.getContext();
      cc.fillStyle = '#06111e'; cc.fillRect(0, 0, GAME_W, GAME_H);
      var bg = cc.createLinearGradient(0, 0, 0, GAME_H);
      bg.addColorStop(0, '#0a1a2a'); bg.addColorStop(0.58, '#071523'); bg.addColorStop(1, '#06101b');
      cc.fillStyle = bg; cc.fillRect(0, 0, GAME_W, GAME_H);
      cc.fillStyle = '#0b1a2b'; cc.fillRect(0, 0, GAME_W, 86);
      cc.fillStyle = '#102238'; cc.fillRect(0, 84, GAME_W, 2);
      cc.fillStyle = '#0a1928'; cc.fillRect(872, 100, 352, 526);
      cc.strokeStyle = '#29445c'; cc.lineWidth = 2; cc.strokeRect(872, 100, 352, 526);
      cc.fillStyle = '#091827'; cc.fillRect(32, 628, 824, 82);
      cc.strokeStyle = '#29445c'; cc.strokeRect(32, 628, 824, 82);
      cc.fillStyle = '#0e2637'; cc.fillRect(56, 102, BOARD_W, BOARD_H + 28);
      cc.strokeStyle = '#39617a'; cc.lineWidth = 2; cc.strokeRect(48, 106, BOARD_W + 16, BOARD_H + 20);
      cc.fillStyle = '#1a3549'; cc.fillRect(56, 99, 168, 4);
      cc.fillStyle = '#54d6ec'; cc.fillRect(224, 99, 80, 4);
      cc.fillStyle = '#ff665c'; cc.fillRect(304, 99, 54, 4);
      cc.fillStyle = '#10263a'; cc.fillRect(0, 0, 24, GAME_H);
      cc.fillStyle = '#10263a'; cc.fillRect(GAME_W - 24, 0, 24, GAME_H);
      chrome.refresh();
    }
    if (!this.textures.exists('bw-terrain')) this.textures.createCanvas('bw-terrain', GAME_W, GAME_H);
    this.add.image(0, 0, 'bw-chrome').setOrigin(0).setDepth(0);
  };

  BulwarkScene.prototype.refreshTerrain = function () {
    var tex = this.textures.get('bw-terrain'), c = tex.getContext(), map = this.map, def = E.MAPS[this.mapIndex];
    c.clearRect(0, 0, GAME_W, GAME_H);
    var g = c.createLinearGradient(0, BOARD_Y, 0, BOARD_Y + BOARD_H);
    g.addColorStop(0, def.biome === 'canyon' ? '#2a2028' : '#102536');
    g.addColorStop(1, def.biome === 'river' ? '#0b2a3d' : '#122436');
    c.fillStyle = g; c.fillRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H);
    var floorA = def.biome === 'canyon' ? '#3a2b31' : def.biome === 'river' ? '#123649' : def.biome === 'bastion' ? '#263743' : '#1a3440';
    var floorB = def.biome === 'canyon' ? '#32262e' : def.biome === 'river' ? '#0f3042' : def.biome === 'bastion' ? '#22323f' : '#17303b';
    for (var y = 0; y < 9; y++) {
      for (var x = 0; x < 14; x++) {
        var i = y * 14 + x, px = BOARD_X + x * CELL, py = BOARD_Y + y * CELL;
        c.fillStyle = (x + y) % 2 ? floorA : floorB; c.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
        c.strokeStyle = 'rgba(180,212,211,0.08)'; c.lineWidth = 1; c.strokeRect(px + 3.5, py + 3.5, CELL - 7, CELL - 7);
        c.fillStyle = 'rgba(232,220,178,0.08)'; c.fillRect(px + 11 + ((x * 7 + y * 3) % 19), py + 11 + ((y * 5 + x * 2) % 17), 3, 2);
        c.fillStyle = 'rgba(4,13,23,0.16)'; c.fillRect(px + 6, py + CELL - 8, CELL - 12, 2);
        if (map.g[i] === E.ROCK) this.drawTerrainRock(c, def.biome, px, py, x, y);
        else if ((x + y) % 4 === 0) { c.fillStyle = 'rgba(106,156,143,0.11)'; c.fillRect(px + 5, py + 7, 3, 3); c.fillRect(px + 13, py + 4, 2, 5); }
      }
    }
    this.drawLandmarks(c, def.biome);
    this.drawPortCanvas(c, map.entry, '#54d6ec', 'IN');
    this.drawPortCanvas(c, map.exit, '#ff665c', 'OUT');
    c.strokeStyle = 'rgba(231,245,255,0.26)'; c.lineWidth = 2; c.strokeRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H);
    tex.refresh();
  };

  BulwarkScene.prototype.drawTerrainRock = function (c, biome, px, py, x, y) {
    var base = biome === 'canyon' ? '#533a39' : biome === 'river' ? '#153e53' : biome === 'bastion' ? '#35414e' : '#3b4b55';
    c.fillStyle = base; c.beginPath(); c.moveTo(px + 3, py + 7); c.lineTo(px + 12, py + 2); c.lineTo(px + 49, py + 5); c.lineTo(px + 54, py + 19); c.lineTo(px + 47, py + 53); c.lineTo(px + 10, py + 56); c.lineTo(px + 2, py + 39); c.closePath(); c.fill();
    c.fillStyle = biome === 'river' ? '#26647a' : biome === 'canyon' ? '#805247' : '#546474';
    c.fillStyle = biome === 'canyon' ? '#98604f' : '#647687'; c.beginPath(); c.moveTo(px + 8, py + 12); c.lineTo(px + 22, py + 8); c.lineTo(px + 46, py + 11); c.lineTo(px + 38, py + 20); c.lineTo(px + 13, py + 20); c.closePath(); c.fill();
    c.fillStyle = 'rgba(231,245,255,0.16)'; c.fillRect(px + 9, py + 10, CELL - 23, 3);
    c.strokeStyle = 'rgba(4,13,23,0.38)'; c.lineWidth = 2; c.beginPath(); c.moveTo(px + 18, py + 22); c.lineTo(px + 14, py + 49); c.moveTo(px + 37, py + 19); c.lineTo(px + 45, py + 43); c.stroke();
    if (biome === 'river') { c.strokeStyle = 'rgba(114,219,238,0.42)'; c.lineWidth = 2; c.beginPath(); c.moveTo(px + 8, py + 42); c.lineTo(px + 26, py + 36); c.lineTo(px + 46, py + 42); c.stroke(); }
    if (biome === 'bastion') { c.strokeStyle = '#1e2b39'; c.lineWidth = 3; c.strokeRect(px + 9, py + 9, CELL - 18, CELL - 18); c.fillStyle = '#687b88'; c.fillRect(px + 14, py + 29, 26, 4); }
    if (biome === 'canyon' && (x + y) % 2 === 0) { c.fillStyle = '#b87959'; c.fillRect(px + 36, py + 14, 5, 4); c.fillRect(px + 28, py + 38, 8, 3); }
  };

  BulwarkScene.prototype.drawLandmarks = function (c, biome) {
    var x, y;
    if (biome === 'plains') {
      c.fillStyle = 'rgba(126,155,84,0.26)';
      for (x = 0; x < 14; x += 3) { c.fillRect(BOARD_X + x * CELL + 10, BOARD_Y + 4, 4, 22); c.fillRect(BOARD_X + x * CELL + 18, BOARD_Y + 11, 4, 15); }
      c.fillStyle = '#c3a16b'; c.fillRect(BOARD_X + 10 * CELL + 8, BOARD_Y + 7 * CELL + 9, 34, 4); c.fillRect(BOARD_X + 10 * CELL + 12, BOARD_Y + 7 * CELL + 15, 4, 20); c.fillRect(BOARD_X + 10 * CELL + 36, BOARD_Y + 7 * CELL + 15, 4, 20);
      c.fillStyle = '#e0a34a'; c.beginPath(); c.arc(BOARD_X + 10 * CELL + 25, BOARD_Y + 7 * CELL + 9, 6, 0, TAU); c.fill();
    } else if (biome === 'river') {
      c.strokeStyle = 'rgba(83,205,232,0.27)'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(BOARD_X + 5 * CELL, BOARD_Y); c.bezierCurveTo(BOARD_X + 5 * CELL + 20, BOARD_Y + 170, BOARD_X + 7 * CELL - 20, BOARD_Y + 300, BOARD_X + 7 * CELL, BOARD_Y + BOARD_H); c.stroke();
      c.fillStyle = '#b49b69'; c.fillRect(BOARD_X + 7 * CELL - 14, BOARD_Y + 3 * CELL + 18, 28, 9);
      c.fillStyle = '#846f4c'; c.fillRect(BOARD_X + 7 * CELL - 14, BOARD_Y + 3 * CELL + 30, 28, 4);
      c.fillStyle = '#d8c38c'; c.fillRect(BOARD_X + 7 * CELL - 23, BOARD_Y + 3 * CELL + 11, 5, 29); c.fillRect(BOARD_X + 7 * CELL + 18, BOARD_Y + 3 * CELL + 11, 5, 29);
    } else if (biome === 'canyon') {
      c.fillStyle = 'rgba(172,96,69,0.17)';
      c.fillRect(BOARD_X + 5 * CELL + 12, BOARD_Y + 3 * CELL + 9, 30, 4);
      c.fillRect(BOARD_X + 5 * CELL + 18, BOARD_Y + 5 * CELL + 12, 22, 4);
      c.fillStyle = '#b87959'; c.fillRect(BOARD_X + 5 * CELL + 23, BOARD_Y + 4 * CELL + 11, 8, 8); c.fillStyle = '#e0a34a'; c.fillRect(BOARD_X + 5 * CELL + 8, BOARD_Y + 4 * CELL + 23, 5, 20); c.fillRect(BOARD_X + 5 * CELL + 41, BOARD_Y + 4 * CELL + 23, 5, 20);
    } else {
      c.fillStyle = '#253a4b'; c.fillRect(BOARD_X + 5 * CELL + 10, BOARD_Y + 3 * CELL + 8, 3 * CELL - 20, 3 * CELL - 16);
      c.fillStyle = '#c7a766'; c.fillRect(BOARD_X + 6 * CELL + 2, BOARD_Y + 4 * CELL + 18, CELL - 4, 7);
      c.fillStyle = '#5e7b8c'; c.fillRect(BOARD_X + 5 * CELL + 23, BOARD_Y + 3 * CELL + 7, 8, 8);
      c.fillStyle = '#d8c38c'; c.fillRect(BOARD_X + 5 * CELL + 20, BOARD_Y + 3 * CELL + 18, 3, 34); c.fillRect(BOARD_X + 7 * CELL + 20, BOARD_Y + 3 * CELL + 18, 3, 34); c.fillStyle = '#ffdf79'; c.fillRect(BOARD_X + 7 * CELL + 22, BOARD_Y + 3 * CELL + 16, 16, 5);
    }
  };

  BulwarkScene.prototype.drawPortCanvas = function (c, index, color, label) {
    var p = cellXY(index), x = p.x - CELL / 2 + 5, y = p.y - CELL / 2 + 5;
    c.fillStyle = color; c.globalAlpha = 0.14; c.fillRect(x, y, CELL - 10, CELL - 10); c.globalAlpha = 1;
    c.strokeStyle = color; c.lineWidth = 2; c.strokeRect(x, y, CELL - 10, CELL - 10);
    c.fillStyle = color; c.font = 'bold 16px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, p.x, p.y);
  };

  BulwarkScene.prototype.makeTextUi = function () {
    var style = { fontFamily: 'Arial, sans-serif', fontSize: '24px', fontStyle: 'bold', color: CSS.text };
    var small = { fontFamily: 'Arial, sans-serif', fontSize: '19px', color: CSS.muted };
    var label = { fontFamily: 'Arial, sans-serif', fontSize: '20px', fontStyle: 'bold', color: CSS.muted, letterSpacing: 1 };
    this.ui = {};
    this.ui.lives = this.add.text(40, 23, '', style).setDepth(21);
    this.ui.gold = this.add.text(154, 23, '', style).setDepth(21);
    this.ui.wave = this.add.text(288, 23, '', style).setDepth(21);
    this.ui.score = this.add.text(420, 23, '', style).setDepth(21);
    this.ui.map = this.add.text(780, 22, '', { fontFamily: 'Arial, sans-serif', fontSize: '21px', fontStyle: 'bold', color: CSS.cyan }).setOrigin(1, 0).setDepth(21);
    this.ui.go = this.add.text(1130, 20, 'GO', { fontFamily: 'Arial, sans-serif', fontSize: '24px', fontStyle: 'bold', color: CSS.green }).setOrigin(0.5, 0).setDepth(22);
    this.ui.settings = this.add.text(1238, 18, '☰', { fontFamily: 'Arial, sans-serif', fontSize: '29px', fontStyle: 'bold', color: CSS.muted }).setOrigin(0.5, 0).setDepth(22);
    this.ui.path = this.add.text(902, 126, '', { fontFamily: 'Arial, sans-serif', fontSize: '21px', fontStyle: 'bold', color: CSS.green }).setDepth(21);
    this.ui.tower = this.add.text(902, 235, '', { fontFamily: 'Arial, sans-serif', fontSize: '21px', fontStyle: 'bold', color: CSS.cyan }).setDepth(21).setVisible(false);
    this.ui.detail = this.add.text(902, 270, '', small).setWordWrapWidth(295).setDepth(21).setVisible(false);
    this.ui.bank = this.add.text(902, 402, '', { fontFamily: 'Arial, sans-serif', fontSize: '21px', fontStyle: 'bold', color: CSS.amber }).setDepth(21);
    this.ui.bankDetail = this.add.text(902, 435, '', small).setDepth(21);
    this.ui.medals = this.add.text(902, 466, '', { fontFamily: 'Arial, sans-serif', fontSize: '20px', fontStyle: 'bold', color: CSS.amber }).setDepth(21).setVisible(false);
    this.ui.mapButton = this.add.text(902, 516, 'MAP', label).setDepth(21);
    this.ui.message = this.add.text(902, 91, '', { fontFamily: 'Arial, sans-serif', fontSize: '19px', fontStyle: 'bold', color: CSS.amber }).setWordWrapWidth(290).setDepth(24).setVisible(false);
    this.ui.tutorial = this.add.text(70, 90, '', { fontFamily: 'Arial, sans-serif', fontSize: '19px', fontStyle: 'bold', color: CSS.text }).setDepth(22).setVisible(false);
    this.ui.bannerTitle = this.add.text(640, 145, '', { fontFamily: 'Arial, sans-serif', fontSize: '28px', fontStyle: 'bold', color: CSS.text }).setOrigin(0.5).setDepth(30).setVisible(false);
    this.ui.bannerSub = this.add.text(640, 174, '', { fontFamily: 'Arial, sans-serif', fontSize: '18px', color: CSS.muted }).setOrigin(0.5).setDepth(30).setVisible(false);
    this.chipText = [];
    for (var i = 0; i < E.CHIP_ORDER.length; i++) {
      this.chipText.push({
        name: this.add.text(56 + i * 130, 651, '', { fontFamily: 'Arial, sans-serif', fontSize: '18px', fontStyle: 'bold', color: CSS.text }).setDepth(22)
      });
    }
  };

  BulwarkScene.prototype.resetRun = function () {
    this.state.phase = 'play'; this.state.wave = 0; this.state.wavesDone = 0; this.state.gold = 220;
    this.state.lives = 20; this.state.leaks = 0; this.state.score = 0; this.state.active = false;
    this.state.prep = 7; this.state.time = 0; this.state.kills = 0; this.state.medal = 0;
    this.state.endless = false; this.state.bankCount = 0; this.state.bankInterest = 0; this.state.message = ''; this.state.messageT = 0;
    this.state.tutorialStep = profile.tutorialDone ? 4 : 0;
    this.toastQueue.length = 0; this.bannerQueue.length = 0; this.banner = null; this.coachStep = profile.tutorialDone ? 4 : 0; this.coachT = profile.tutorialDone ? 0 : 3.2;
    this.beacon.state = 'idle'; this.beacon.time = 0;
    this.waveQueue.length = 0; this.waveCursor = 0; this.waveClock = 0; this.towers.length = 0;
    this.selectedCell = -1; this.selectedTower = null;
    this.previewValid = false;
    this.previewPath = [];
    this.lastBuiltType = 'wall'; this.lastTapCell = -1; this.lastTapAt = 0;
    this.cursor = { x: 1, y: 1 }; this.cursorRepeat = 0;
    this.clearPools();
    this.map = new E.Map(E.MAPS[this.mapIndex]);
    this.pathCache = this.map.path();
    this.refreshTerrain();
    this.syncHook();
    try { kit.audio.music('ambient', 450); } catch (e) {}
  };

  BulwarkScene.prototype.clearPools = function () {
    var i;
    for (i = 0; i < this.creeps.length; i++) this.creeps[i].active = false;
    for (i = 0; i < this.bullets.length; i++) this.bullets[i].active = false;
    var particleNames = ['contactSparks', 'dustDebris', 'projectileTrails', 'waveBursts'];
    for (var n = 0; n < particleNames.length; n++) for (i = 0; i < this.particleSystems[particleNames[n]].length; i++) this.particleSystems[particleNames[n]][i].active = false;
    for (i = 0; i < this.effects.length; i++) this.effects[i].active = false;
  };

  BulwarkScene.prototype.syncHook = function () {
    this.refreshScore();
    hook.state = this.state;
    hook.state.map = E.MAPS[this.mapIndex].id;
    hook.state.mapIndex = this.mapIndex;
    if (hook.forceWave !== this.lastForceWave && hook.forceWave != null) {
      this.lastForceWave = hook.forceWave;
      var fw = Number(hook.forceWave);
      if (Number.isInteger(fw) && fw >= 0) {
        if (fw === 0) this.resetRun();
        else { this.state.wave = fw - 1; this.state.phase = 'play'; this.state.endless = fw > 30; this.state.active = false; this.state.prep = 0.05; }
      }
    }
    if (hook.forceMap !== this.lastForceMap && hook.forceMap != null) {
      this.lastForceMap = hook.forceMap;
      var fm = E.mapIndex(hook.forceMap);
      if (fm !== this.mapIndex) this.changeMap(fm, true);
    }
  };

  BulwarkScene.prototype.refreshScore = function () {
    this.state.score = Math.max(0, this.state.wavesDone * 100 + this.state.lives * 9 + this.state.kills * 2 + Math.floor(this.state.gold / 10));
    return this.state.score;
  };

  BulwarkScene.prototype.recomputeBankStats = function () {
    var bankCount = 0, bankPct = 0;
    for (var i = 0; i < this.towers.length; i++) if (this.towers[i].type === 'bank') { bankCount += this.towers[i].level; bankPct += 0.012 * this.towers[i].level; }
    this.state.bankCount = bankCount;
    this.state.bankInterest = bankPct;
  };

  BulwarkScene.prototype.changeMap = function (index, preserve) {
    if (preserve && (this.state.wave > 0 || this.state.wavesDone > 0 || this.state.active)) {
      this.toast('MAP LOCKED · RESTART', CSS.coral);
      this.sfx('cancel', 0.35, 0.72);
      return false;
    }
    this.mapIndex = E.mapIndex(index);
    this.map = new E.Map(E.MAPS[this.mapIndex]);
    this.pathCache = this.map.path();
    this.towers.length = 0;
    this.clearPools();
    this.waveQueue.length = 0; this.waveCursor = 0; this.waveClock = 0; this.state.active = false;
    this.state.phase = 'play'; this.state.wave = 0; this.state.wavesDone = 0; this.state.prep = 7; this.state.gold = 220; this.state.lives = 20;
    this.state.leaks = 0; this.state.kills = 0; this.state.score = 0; this.state.time = 0; this.state.medal = 0; this.state.earlyBonus = 0; this.state.endless = false; this.state.bankCount = 0; this.state.bankInterest = 0; this.state.message = ''; this.state.messageT = 0;
    this.state.map = E.MAPS[this.mapIndex].id;
    this.selectedCell = -1; this.selectedTower = null;
    this.previewValid = false;
    this.previewPath = [];
    this.toastQueue.length = 0; this.bannerQueue.length = 0; this.banner = null; this.coachStep = profile.tutorialDone ? 4 : 0; this.coachT = profile.tutorialDone ? 0 : 3.2;
    profile.map = this.mapIndex; kit.save.set(profile);
    this.beacon.state = 'command'; this.beacon.time = 0.7;
    this.refreshTerrain();
    this.sfx('confirm', 0.75);
    return true;
  };

  BulwarkScene.prototype.toast = function (message, color) {
    var item = { text: String(message).slice(0, 42), color: color || CSS.amber };
    if (this.state.messageT > 0 || (this.banner && this.banner.active) || (this.coachT > 0 && this.state.tutorialStep < 4)) {
      if (this.state.message === item.text || (this.toastQueue.length && this.toastQueue[this.toastQueue.length - 1].text === item.text)) return;
      this.toastQueue.push(item);
      if (this.toastQueue.length > 2) this.toastQueue.shift();
      return;
    }
    this.startToast(item);
  };

  BulwarkScene.prototype.startToast = function (item) {
    this.state.message = item.text;
    this.state.messageT = 1;
    this.messageColor = item.color;
  };

  BulwarkScene.prototype.startQueuedToast = function () {
    if (this.banner && this.banner.active) return;
    if (this.coachT > 0 && this.state.tutorialStep < 4) return;
    if (this.state.messageT > 0 || !this.toastQueue.length) return;
    this.startToast(this.toastQueue.shift());
  };

  BulwarkScene.prototype.sfx = function (name, volume, rate) {
    try { kit.audio.sfx(name, { volume: volume == null ? 1 : volume, rate: rate || 1 }); } catch (e) {}
  };

  BulwarkScene.prototype.ensureMusic = function () {
    if (this.safeMusic) return;
    this.safeMusic = true;
    try { kit.audio.music('ambient', 500); } catch (e) {}
  };

  BulwarkScene.prototype.emit = function (x, y, color, count, kind) {
    if (kit.juice.enabled === false) count = Math.max(1, Math.floor(count * 0.35));
    var poolName = kind === 'dust' ? 'dustDebris' : kind === 'trail' ? 'projectileTrails' : kind === 'wave' ? 'waveBursts' : 'contactSparks';
    var pool = this.particleSystems[poolName];
    var made = 0;
    for (var i = 0; i < pool.length && made < count; i++) {
      var p = pool[i];
      if (p.active) continue;
      var a = ((i * 37 + this.state.kills * 11) % 360) / 360 * TAU;
      p.active = true; p.x = x; p.y = y; p.vx = Math.cos(a) * (22 + (i % 5) * 13); p.vy = Math.sin(a) * (22 + (i % 5) * 13);
      p.life = p.max = 0.28 + (i % 4) * 0.07; p.color = typeof color === 'string' ? parseInt(color.replace('#', ''), 16) : color; p.kind = kind || 'contact'; p.size = kind === 'dust' ? 5 : 3 + (i % 3); made++;
    }
  };

  BulwarkScene.prototype.addEffect = function (kind, x1, y1, x2, y2, color, radius) {
    for (var i = 0; i < this.effects.length; i++) {
      var f = this.effects[i];
      if (!f.active) { f.active = true; f.kind = kind; f.x1 = x1; f.y1 = y1; f.x2 = x2; f.y2 = y2; f.color = color; f.radius = radius || 10; f.life = f.max = kind === 'beam' ? 0.13 : 0.32; return f; }
    }
    return null;
  };

  BulwarkScene.prototype.occupiedCells = function () {
    this.occupiedCount = 0;
    for (var i = 0; i < this.creeps.length; i++) {
      var c = this.creeps[i];
      if (!c.active || c.fly || c.cy < 0) continue;
      var x = clamp(Math.floor(c.cx), 0, 13), y = clamp(Math.floor(c.cy), 0, 8);
      this.occupied[this.occupiedCount++] = y * 14 + x;
    }
    return this.occupiedCount ? this.occupied.subarray(0, this.occupiedCount) : null;
  };

  BulwarkScene.prototype.updatePreview = function () {
    this.previewPath = [];
    this.previewValid = this.selectedCell >= 0 && this.map.canPlace(this.selectedCell, this.occupiedCells());
    if (this.selectedCell < 0) return;
    var old = this.map.g[this.selectedCell];
    this.map.g[this.selectedCell] = E.WALL;
    if (this.map.solve()) this.previewPath = this.map.path();
    this.map.g[this.selectedCell] = old;
    this.map.solve();
  };

  BulwarkScene.prototype.tryBuild = function (index, key) {
    var d = safeDef(key, 'arrow');
    if (this.state.phase !== 'play') return false;
    if (!E.isUnlocked(d.key, this.state.wavesDone)) { this.toast('LOCK · WAVE ' + d.unlock); this.sfx('cancel', 0.35, 0.7); return false; }
    if (index < 0 || this.map.g[index] !== E.EMPTY) { this.toast('OCCUPIED'); this.sfx('cancel', 0.35, 0.7); return false; }
    if (this.state.gold < d.cost) { this.toast('NEED ' + d.cost + 'G'); this.sfx('cancel', 0.35, 0.7); return false; }
    if (!this.map.canPlace(index, this.occupiedCells())) { this.toast('PATH SEALED', CSS.coral); this.sfx('leak', 0.2, 0.7); return false; }
    this.state.gold -= d.cost;
    this.map.g[index] = d.key === 'wall' ? E.WALL : E.TOWER;
    this.map.solve();
    this.pathCache = this.map.path();
    for (var i = 0; i < this.creeps.length; i++) if (this.creeps[i].active) this.creeps[i].tx = -1;
    if (d.key !== 'wall') {
      var p = cellXY(index);
      this.towers.push({ i: index, type: d.key, level: 1, spent: d.cost, cd: 0.1, angle: -Math.PI / 2, pulse: 1, attackT: 0, animState: 'active', animT: 0.3, x: p.x, y: p.y });
      this.recomputeBankStats();
      if (this.state.tutorialStep === 1 && d.key === 'arrow') this.state.tutorialStep = 2;
    } else if (this.state.tutorialStep === 0) this.state.tutorialStep = 1;
    this.selectedCell = -1; this.selectedTower = null;
    this.previewValid = false;
    this.previewPath = [];
    this.lastBuiltType = d.key;
    this.beacon.state = 'resolve'; this.beacon.time = 0.55;
    var p2 = cellXY(index); this.emit(p2.x, p2.y, '#' + d.color.toString(16).padStart(6, '0'), 8, 'dust');
    this.sfx('place', 0.82, d.key === 'wall' ? 0.82 : 1.1);
    this.toast(d.name + ' PLACED', CSS.green);
    return true;
  };

  BulwarkScene.prototype.removeWall = function (index) {
    if (this.map.g[index] !== E.WALL) return;
    this.map.g[index] = E.EMPTY; this.map.solve(); this.state.gold += 5;
    this.pathCache = this.map.path();
    this.recomputeBankStats();
    this.previewValid = false;
    for (var i = 0; i < this.creeps.length; i++) if (this.creeps[i].active) this.creeps[i].tx = -1;
    var p = cellXY(index); this.emit(p.x, p.y, '#93a1b4', 6, 'dust');
    this.toast('WALL REMOVED · +5G', CSS.amber); this.sfx('cancel', 0.55, 0.68);
  };

  BulwarkScene.prototype.towerAt = function (index) {
    for (var i = 0; i < this.towers.length; i++) if (this.towers[i].i === index) return this.towers[i];
    return null;
  };
  BulwarkScene.prototype.upCost = function (tower) {
    var d = safeDef(tower.type, 'arrow');
    return Math.round(d.cost * (0.8 + tower.level * 0.62));
  };
  BulwarkScene.prototype.sellValue = function (tower) { return Math.floor(tower.spent * 0.62); };
  BulwarkScene.prototype.upgrade = function (tower) {
    if (!tower) return;
    if (tower.level >= 5) { this.toast('MAX LEVEL'); return; }
    var cost = this.upCost(tower);
    if (this.state.gold < cost) { this.toast('NEED ' + cost + 'G'); return; }
    this.state.gold -= cost; tower.spent += cost; tower.level++;
    tower.pulse = 1; tower.animState = 'active'; tower.animT = 0.3; this.recomputeBankStats();
    this.emit(tower.x, tower.y, '#' + safeDef(tower.type, 'arrow').color.toString(16).padStart(6, '0'), 12, 'wave');
    this.sfx('upgrade', 0.75, 1.05);
    this.toast(safeDef(tower.type, 'arrow').name + ' · LV ' + tower.level, CSS.green);
    if (this.state.tutorialStep === 3) { this.state.tutorialStep = 4; profile.tutorialDone = true; kit.save.set(profile); }
  };
  BulwarkScene.prototype.sellTower = function (tower) {
    if (!tower) return;
    var value = this.sellValue(tower), index = this.towers.indexOf(tower);
    this.state.gold += value; this.map.g[tower.i] = E.EMPTY; this.map.solve();
    this.pathCache = this.map.path();
    for (var i = 0; i < this.creeps.length; i++) if (this.creeps[i].active) this.creeps[i].tx = -1;
    if (index >= 0) this.towers.splice(index, 1);
    this.recomputeBankStats();
    this.selectedTower = null; this.previewValid = false; this.toast('SOLD · +' + value + 'G', CSS.amber); this.sfx('cancel', 0.55, 0.72);
  };

  BulwarkScene.prototype.startWave = function () {
    if (this.state.active || this.state.phase !== 'play') return;
    this.ensureMusic();
    this.state.wave++;
    this.waveQueue = E.makeWave(this.state.wave, 0xB17A4);
    this.waveCursor = 0; this.waveClock = 0; this.state.active = true; this.state.prep = 0;
    if (this.state.wave % 10 === 0) {
      this.toast('BOSS · WARDEN ' + this.state.wave, CSS.coral);
      if (kit.juice.enabled) kit.juice.shake(9, 260);
      this.sfx('warning', 0.9, 0.82);
      try { kit.audio.music('danger', 500); } catch (e) {}
    } else {
      this.sfx('confirm', 0.5, 0.75);
    }
    if (this.state.tutorialStep === 2) this.state.tutorialStep = 3;
  };

  BulwarkScene.prototype.goEarly = function () {
    if (this.state.active || this.state.phase !== 'play') return;
    var bonus = 10 + Math.ceil(Math.max(0, this.state.prep)) * 3;
    if (this.state.wave < 6) bonus += 8;
    this.ensureMusic();
    this.state.gold += bonus; this.state.earlyBonus += bonus;
    this.toast('GO · +' + bonus + 'G', CSS.green); this.sfx('clear', 0.42, 1.25);
    this.state.prep = 0; this.startWave();
  };

  BulwarkScene.prototype.spawnCreep = function (item) {
    var d = E.ENEMIES[item.type], c = null;
    for (var i = 0; i < this.creeps.length; i++) if (!this.creeps[i].active) { c = this.creeps[i]; break; }
    if (!c || !d) return;
    c.active = true; c.stamp++; c.type = item.type; c.fly = !!d.fly; c.boss = !!d.boss; c.armor = d.armor || 0;
    c.hpMax = d.hp * item.scale; c.hp = c.hpMax; c.shMax = d.shield ? d.shield * item.scale : 0; c.sh = c.shMax; c.shT = 0;
    c.speed = d.speed * (1 + Math.min(0.36, this.state.wave * 0.009)); c.gold = d.gold; c.leak = d.leak; c.radius = d.radius; c.color = d.color;
    c.cx = this.map.entryC + 0.5; c.cy = -0.45; c.tx = -1; c.ty = 0.5; c.slowT = 0; c.slowF = 1; c.hitT = 0; c.flash = 0; c.angle = Math.PI / 2;
    c.animState = 'move'; c.animT = 0; c.animPhase = (c.stamp * 0.73) % TAU; c.defeatT = 0;
  };

  BulwarkScene.prototype.findNext = function (c) {
    if (c.cy < 0.5) { c.tx = this.map.entryC + 0.5; c.ty = 0.5; return; }
    var x = clamp(Math.floor(c.cx), 0, 13), y = clamp(Math.floor(c.cy), 0, 8), index = y * 14 + x;
    var next = this.map.next[index];
    if (next < 0 || this.map.g[index] !== E.EMPTY) {
      var best = -1, bestDist = 99999;
      var ns = [index - 1, index + 1, index - 14, index + 14];
      for (var i = 0; i < ns.length; i++) {
        var j = ns[i];
        if (j < 0 || j >= this.map.n || this.map.g[j] !== E.EMPTY || this.map.dist[j] < 0) continue;
        if (this.map.dist[j] < bestDist) { best = j; bestDist = this.map.dist[j]; }
      }
      next = best;
    }
    if (next >= 0) { c.tx = next % 14 + 0.5; c.ty = (next / 14 | 0) + 0.5; }
    else { c.tx = c.cx; c.ty = c.cy; }
  };

  BulwarkScene.prototype.leak = function (c) {
    if (!c.active) return;
    c.active = false; this.state.leaks += c.leak; this.state.lives = Math.max(0, this.state.lives - c.leak);
    c.animState = 'attack'; c.animT = 0.22; this.emit(BOARD_X + c.cx * CELL, BOARD_Y + c.cy * CELL, '#ff665c', 12, 'contact');
    this.toast('BREACH · -' + c.leak + ' ♥', CSS.coral); this.sfx('leak', 0.78, c.boss ? 0.65 : 1);
    if (c.boss && kit.juice.enabled) kit.juice.shake(7, 170);
    this.refreshScore();
    if (this.state.lives <= 0) { this.state.phase = 'lose'; this.state.active = false; this.beacon.state = 'defeat'; this.beacon.time = 999; this.showBanner('LINE BREACHED', '0 ♥ · RUN ENDS', CSS.coral); this.sfx('leak', 0.9, 0.58); profile.best = Math.max(profile.best, this.state.score); kit.save.set(profile); try { kit.audio.stopMusic(550); } catch (e) {} }
  };

  BulwarkScene.prototype.damage = function (c, amount, color) {
    if (!c || !c.active) return;
    var damage = Math.max(1, amount - c.armor);
    if (c.sh > 0) { c.sh -= damage; c.shT = 2.2; if (c.sh < 0) { c.hp += c.sh; c.sh = 0; } }
    else c.hp -= damage;
    c.hitT = 0.1; c.flash = 0.08; c.animState = 'hurt'; c.animT = 0.18;
    try { kit.juice.hitStop(c.boss ? 64 : 46); } catch (e) {}
    this.emit(BOARD_X + c.cx * CELL, BOARD_Y + c.cy * CELL, color || '#ffffff', c.boss ? 4 : 2, 'contact');
    if (c.hp <= 0) this.killCreep(c);
  };

  BulwarkScene.prototype.killCreep = function (c) {
    if (!c.active) return;
    c.active = false; c.animState = 'defeat'; c.defeatT = c.defeatMax = c.boss ? 0.5 : 0.28; this.state.gold += c.gold; this.state.kills++;
    var x = BOARD_X + c.cx * CELL, y = BOARD_Y + c.cy * CELL;
    this.emit(x, y, '#' + c.color.toString(16).padStart(6, '0'), c.boss ? 18 : 6, c.boss ? 'wave' : 'contact');
    this.sfx('kill', c.boss ? 0.8 : 0.24, c.boss ? 0.58 : 1.1);
    try { kit.juice.hitStop(c.boss ? 90 : 52); } catch (e) {}
    if (c.boss) { this.addEffect('blast', c.cx, c.cy, c.cx, c.cy, c.color, 1.2); if (kit.juice.enabled) kit.juice.shake(10, 180); }
  };

  BulwarkScene.prototype.findTarget = function (tower, range) {
    var chosen = null, progress = -999999, r2 = range * range;
    for (var i = 0; i < this.creeps.length; i++) {
      var c = this.creeps[i]; if (!c.active || c.cy < -0.2) continue;
      var dx = c.cx - (tower.x - BOARD_X) / CELL, dy = c.cy - (tower.y - BOARD_Y) / CELL;
      if (dx * dx + dy * dy > r2) continue;
      var p = c.fly ? c.cy * 3 : 1000 - (this.map.dist[clamp(Math.floor(c.cy), 0, 8) * 14 + clamp(Math.floor(c.cx), 0, 13)] || 999);
      if (p > progress) { progress = p; chosen = c; }
    }
    return chosen;
  };

  BulwarkScene.prototype.fireTower = function (tower, dt) {
    var d = safeDef(tower.type, 'arrow');
    if (d.bank) return;
    tower.cd -= dt; tower.pulse = Math.max(0, tower.pulse - dt * 4);
    if (tower.cd > 0) return;
    var stat = { damage: d.damage * Math.pow(1.32, tower.level - 1), rate: d.rate * Math.pow(0.93, tower.level - 1), range: d.range * (1 + (tower.level - 1) * 0.08) };
    var target = this.findTarget(tower, stat.range); if (!target) return;
    var tx = (target.cx * CELL + BOARD_X), ty = (target.cy * CELL + BOARD_Y);
    tower.angle = Math.atan2(ty - tower.y, tx - tower.x); tower.cd = stat.rate; tower.pulse = 1; tower.attackT = 0.18; tower.animState = 'attack';
    this.sfx('fire', d.key === 'zap' ? 0.34 : 0.2, d.key === 'frost' ? 1.26 : d.key === 'splash' ? 0.76 : 1);
    if (d.key === 'frost') {
      this.damage(target, stat.damage, '#8fe7ff'); target.slowT = 1.35; target.slowF = Math.min(target.slowF, d.slow); this.addEffect('beam', tower.x, tower.y, tx, ty, d.color, 0); return;
    }
    if (d.key === 'zap') {
      var current = target, hit = [target], amount = stat.damage, fromX = tower.x, fromY = tower.y, links = d.chains + (tower.level >= 4 ? 1 : 0);
      for (var chain = 0; chain < links && current; chain++) {
        this.damage(current, amount, '#cda1ff');
        var cx = BOARD_X + current.cx * CELL, cy = BOARD_Y + current.cy * CELL;
        this.addEffect('beam', fromX, fromY, cx, cy, d.color, 0); fromX = cx; fromY = cy; amount *= 0.7;
        var next = null, nd = 2.6 * 2.6;
        for (var j = 0; j < this.creeps.length; j++) { var c2 = this.creeps[j]; if (!c2.active || hit.indexOf(c2) >= 0) continue; var dd = E.dist2(c2.cx, c2.cy, current.cx, current.cy); if (dd < nd) { nd = dd; next = c2; } }
        if (!next) break; hit.push(next); current = next;
      }
      return;
    }
    var b = null;
    for (var k = 0; k < this.bullets.length; k++) if (!this.bullets[k].active) { b = this.bullets[k]; break; }
    if (!b) return;
    b.active = true; b.kind = d.key === 'splash' ? 'lob' : 'shot'; b.x = tower.x; b.y = tower.y; b.target = target; b.stamp = target.stamp; b.tx = tx; b.ty = ty; b.speed = d.key === 'splash' ? 360 : 600; b.damage = stat.damage; b.color = d.color; b.aoe = (d.aoe || 0) * (1 + (tower.level - 1) * 0.06);
    this.emit(b.x, b.y, d.color, 2, 'trail');
  };

  BulwarkScene.prototype.updateCreeps = function (dt) {
    var exitX = BOARD_X + (this.map.exitC + 0.5) * CELL, exitY = BOARD_Y + 8.5 * CELL;
    for (var i = 0; i < this.creeps.length; i++) {
      var c = this.creeps[i]; if (!c.active) continue;
      if (c.hitT > 0) c.hitT -= dt; if (c.flash > 0) c.flash -= dt;
      if (c.animT > 0) { c.animT -= dt; if (c.animT <= 0 && c.animState !== 'defeat') c.animState = 'move'; }
      if (c.slowT > 0) { c.slowT -= dt; if (c.slowT <= 0) c.slowF = 1; }
      if (c.shMax > 0) { c.shT -= dt; if (c.shT <= 0 && c.sh < c.shMax) c.sh = Math.min(c.shMax, c.sh + c.shMax * 0.24 * dt); }
      var speed = c.speed * c.slowF;
      if (c.fly) {
        var fx = exitX - (BOARD_X + c.cx * CELL), fy = exitY - (BOARD_Y + c.cy * CELL), fl = Math.sqrt(fx * fx + fy * fy);
        c.angle = Math.atan2(fy, fx); if (fl < speed * CELL * dt + 10) { this.leak(c); continue; }
        c.cx += fx / fl * speed * dt; c.cy += fy / fl * speed * dt;
      } else {
        if (E.dist2(c.cx, c.cy, this.map.exitC + 0.5, 8.5) < 0.07) { this.leak(c); continue; }
        if (c.tx < 0 || Math.sqrt(Math.pow(c.tx - c.cx, 2) + Math.pow(c.ty - c.cy, 2)) < 0.05) this.findNext(c);
        var dx = c.tx - c.cx, dy = c.ty - c.cy, len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0.001) { c.animState = c.animState === 'hurt' || c.animState === 'attack' ? c.animState : 'move'; c.angle = Math.atan2(dy, dx); var move = Math.min(len, speed * dt); c.cx += dx / len * move; c.cy += dy / len * move; }
        else if (c.animState !== 'hurt' && c.animState !== 'attack') c.animState = 'idle';
        if (E.dist2(c.cx, c.cy, this.map.exitC + 0.5, 8.5) < 0.07) { this.leak(c); continue; }
      }
    }
  };

  BulwarkScene.prototype.updateBullets = function (dt) {
    for (var i = 0; i < this.bullets.length; i++) {
      var b = this.bullets[i]; if (!b.active) continue;
      if (b.kind === 'shot') {
        if (!b.target || !b.target.active || b.target.stamp !== b.stamp) { b.active = false; continue; }
        b.tx = BOARD_X + b.target.cx * CELL; b.ty = BOARD_Y + b.target.cy * CELL;
      }
      var dx = b.tx - b.x, dy = b.ty - b.y, dist = Math.sqrt(dx * dx + dy * dy), step = b.speed * dt;
      if (dist <= step + 1) {
        if (b.kind === 'lob') {
          for (var j = 0; j < this.creeps.length; j++) { var c = this.creeps[j]; if (!c.active) continue; var cx = BOARD_X + c.cx * CELL, cy = BOARD_Y + c.cy * CELL; if (E.dist2(cx, cy, b.tx, b.ty) <= (b.aoe * CELL) * (b.aoe * CELL)) this.damage(c, b.damage, '#ffc45d'); }
          this.addEffect('blast', b.tx, b.ty, b.tx, b.ty, b.color, b.aoe); this.emit(b.tx, b.ty, '#ffc45d', 12, 'wave'); this.sfx('hit', 0.42, 0.72);
        } else { this.damage(b.target, b.damage, '#54d6ec'); this.emit(b.tx, b.ty, '#54d6ec', 3, 'contact'); }
        b.active = false; continue;
      }
      b.x += dx / dist * step; b.y += dy / dist * step;
    }
  };

  BulwarkScene.prototype.updateEffects = function (dt) {
    var i;
    var particleNames = ['contactSparks', 'dustDebris', 'projectileTrails', 'waveBursts'];
    for (var n = 0; n < particleNames.length; n++) for (i = 0; i < this.particleSystems[particleNames[n]].length; i++) {
      var p = this.particleSystems[particleNames[n]][i]; if (!p.active) continue; p.life -= dt; if (p.life <= 0) { p.active = false; continue; } p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9;
    }
    for (i = 0; i < this.towers.length; i++) {
      var tower = this.towers[i]; if (tower.attackT > 0) { tower.attackT -= dt; if (tower.attackT <= 0) tower.animState = 'idle'; } if (tower.animT > 0) tower.animT -= dt;
    }
    for (i = 0; i < this.creeps.length; i++) if (this.creeps[i].defeatT > 0) { this.creeps[i].defeatT -= dt; if (this.creeps[i].defeatT <= 0) this.creeps[i].animState = 'idle'; }
    for (i = 0; i < this.effects.length; i++) { var f = this.effects[i]; if (!f.active) continue; f.life -= dt; if (f.life <= 0) f.active = false; }
    if (this.coachT > 0) {
      this.coachT -= dt;
      if (this.coachT <= 0) { this.coachT = 0; this.startQueuedToast(); }
    }
    if (this.state.messageT > 0) {
      this.state.messageT -= dt;
      if (this.state.messageT <= 0) { this.state.messageT = 0; this.state.message = ''; this.startQueuedToast(); }
    }
    if (this.banner && this.banner.active) {
      this.banner.age += dt;
      if (this.banner.age > this.banner.duration) {
        this.banner.active = false;
        if (this.bannerQueue.length) {
          var nextBanner = this.bannerQueue.shift();
          this.banner = { active: true, age: 0, duration: kit.juice.enabled ? 1.6 : 1.2, title: nextBanner.title, sub: nextBanner.sub, color: nextBanner.color };
        } else this.startQueuedToast();
      }
    }
  };

  BulwarkScene.prototype.endWave = function () {
    this.state.active = false; this.state.wavesDone = this.state.wave;
    this.recomputeBankStats();
    var interest = Math.floor(this.state.gold * (0.045 + this.state.bankInterest)) + this.state.bankCount * 3;
    var clear = 24 + this.state.wave * 4, drop = this.state.wave <= 8 ? 18 + (this.state.wave % 3) * 7 : (this.state.wave % 5 === 0 ? 24 : 0);
    this.state.gold += interest + clear + drop;
    var rewardText = '+' + (interest + clear + drop) + 'G · INT +' + interest + (drop ? ' · DROP +' + drop : '');
    this.sfx('clear', 0.82, 0.95);
    var milestone = this.state.wave === 10 || this.state.wave === 20 || this.state.wave === 30;
    if (milestone) this.awardMedal(this.state.wave);
    this.refreshScore();
    if (this.state.wave >= 30 && !this.state.endless) {
      this.state.phase = 'win'; this.state.active = false; this.beacon.state = 'victory'; this.beacon.time = 999; this.showBanner('BULWARK HOLDS', 'W30 · GOLD · ' + rewardText, CSS.amber); this.sfx('victory', 0.9, 1); try { kit.audio.stopMusic(700); } catch (e) {}
      profile.best = Math.max(profile.best, this.state.score); kit.save.set(profile); return;
    }
    if (milestone) {
      var medal = E.MEDALS[this.state.wave === 10 ? 0 : 1];
      this.showBanner(medal.name + ' MEDAL', 'W' + this.state.wave + ' · ' + medal.desc.toUpperCase() + ' · ' + rewardText, '#' + medal.color.toString(16).padStart(6, '0'));
    } else this.showBanner('WAVE ' + this.state.wave + ' CLEAR', rewardText, CSS.green);
    this.state.prep = this.state.endless ? 6 : 8;
    try { kit.audio.music('ambient', 650); } catch (e) {}
    profile.best = Math.max(profile.best, this.state.score); kit.save.set(profile);
  };

  BulwarkScene.prototype.awardMedal = function (wave) {
    var idx = wave === 10 ? 0 : wave === 20 ? 1 : 2;
    if (!profile.medals[idx]) { profile.medals[idx] = 1; kit.save.set(profile); }
    this.state.medal = idx + 1; this.sfx('clear', 0.9, 1.25);
  };

  BulwarkScene.prototype.showBanner = function (title, sub, color) {
    var item = { title: String(title).slice(0, 30), sub: String(sub).slice(0, 86), color: color || CSS.text };
    if (this.banner && this.banner.active) {
      this.bannerQueue.push(item);
      if (this.bannerQueue.length > 1) this.bannerQueue.shift();
      return;
    }
    if (this.state.messageT > 0) {
      this.toastQueue.unshift({ text: this.state.message, color: this.messageColor || CSS.amber });
      this.state.message = ''; this.state.messageT = 0;
    }
    this.banner = { active: true, age: 0, duration: kit.juice.enabled ? 1.6 : 1.2, title: item.title, sub: item.sub, color: item.color };
  };

  BulwarkScene.prototype.stepSim = function () {
    var dt = STEP;
    this.state.time += dt;
    if (this.beacon.time > 0) { this.beacon.time -= dt; if (this.beacon.time <= 0) this.beacon.state = 'idle'; }
    this.syncHook();
    if (this.state.phase !== 'play') { this.updateEffects(dt); return; }
    if (!this.state.active) {
      this.state.prep -= dt;
      if (this.state.prep <= 0) this.startWave();
    } else {
      this.waveClock += dt;
      while (this.waveCursor < this.waveQueue.length && this.waveQueue[this.waveCursor].at <= this.waveClock) { this.spawnCreep(this.waveQueue[this.waveCursor++]); }
      this.updateCreeps(dt);
      if (this.selectedCell >= 0) this.updatePreview();
      for (var i = 0; i < this.towers.length; i++) this.fireTower(this.towers[i], dt);
      this.updateBullets(dt);
      var live = false;
      for (i = 0; i < this.creeps.length; i++) if (this.creeps[i].active) { live = true; break; }
      if (this.waveCursor >= this.waveQueue.length && !live) this.endWave();
    }
    this.updateEffects(dt);
  };

  BulwarkScene.prototype.update = function (time, delta) {
    var frame = clamp(delta / 1000, 0, 0.2);
    this.pollInput();
    this.juiceFrame = kit.juice.frame();
    var steps = 0;
    this.accumulator += frame;
    while (this.accumulator >= STEP && steps < MAX_STEPS) { this.stepSim(); this.accumulator -= STEP; steps++; }
    if (steps === MAX_STEPS && this.accumulator >= STEP) this.accumulator = STEP * 0.9;
    if (!this.juiceFrame.frozen) this.render();
  };

  BulwarkScene.prototype.pollInput = function () {
    var self = this, live = {};
    kit.input.pointers.forEach(function (p, id) {
      live[id] = true;
      if (!self.pointerClaims[id]) { self.pointerClaims[id] = true; var rect = self.game.canvas.getBoundingClientRect(); self.handleTap((p.x - rect.left) * GAME_W / rect.width, (p.y - rect.top) * GAME_H / rect.height); }
    });
    for (var id in this.pointerClaims) if (!live[id]) delete this.pointerClaims[id];
    var moveCodes = [
      { code: 'ArrowLeft', dx: -1, dy: 0 }, { code: 'KeyA', dx: -1, dy: 0 },
      { code: 'ArrowRight', dx: 1, dy: 0 }, { code: 'KeyD', dx: 1, dy: 0 },
      { code: 'ArrowUp', dx: 0, dy: -1 }, { code: 'KeyW', dx: 0, dy: -1 },
      { code: 'ArrowDown', dx: 0, dy: 1 }, { code: 'KeyS', dx: 0, dy: 1 }
    ];
    for (var m = 0; m < moveCodes.length; m++) {
      var mv = moveCodes[m], downMove = kit.input.keyDown(mv.code), wasMove = !!this.keyEdges[mv.code];
      if (downMove && !wasMove) { this.moveCursor(mv.dx, mv.dy); this.cursorRepeat = 0.2; }
      if (downMove && wasMove) { this.cursorRepeat -= STEP; if (this.cursorRepeat <= 0) { this.cursorRepeat = 0.1; this.moveCursor(mv.dx, mv.dy); } }
      this.keyEdges[mv.code] = downMove;
    }
    var gamepad = readGamepad(), previousPad = this.gamepadEdges;
    if (gamepad.dir && (!previousPad.dir || gamepad.dir.code !== previousPad.dir.code)) this.moveCursor(gamepad.dir.dx, gamepad.dir.dy);
    if (gamepad.confirm && !previousPad.confirm) this.handleKey('Space');
    if (gamepad.cancel && !previousPad.cancel) this.handleKey('KeyX');
    if (gamepad.go && !previousPad.go) this.handleKey('KeyG');
    this.gamepadEdges = { dir: gamepad.dir, confirm: gamepad.confirm, cancel: gamepad.cancel, go: gamepad.go };
    var codes = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Space', 'Enter', 'KeyG', 'KeyU', 'KeyX', 'KeyR', 'KeyM'];
    for (var i = 0; i < codes.length; i++) {
      var code = codes[i], down = kit.input.keyDown(code), was = !!this.keyEdges[code];
      if (down && !was) this.handleKey(code);
      this.keyEdges[code] = down;
    }
  };

  BulwarkScene.prototype.moveCursor = function (dx, dy) {
    if (this.state.phase !== 'play') return;
    this.cursor.x = clamp(this.cursor.x + dx, 0, 13);
    this.cursor.y = clamp(this.cursor.y + dy, 0, 8);
    this.selectedTower = null;
    this.selectedCell = this.cursor.y * 14 + this.cursor.x;
    if (this.selectedCell === this.map.entry || this.selectedCell === this.map.exit || this.map.g[this.selectedCell] !== E.EMPTY) this.selectedCell = -1;
    this.updatePreview();
    this.beacon.state = 'command'; this.beacon.time = 0.45;
    this.ensureMusic();
  };

  BulwarkScene.prototype.activateCursorCell = function () {
    var index = this.cursor.y * 14 + this.cursor.x;
    var tower = this.towerAt(index);
    if (tower) { this.selectedTower = tower; this.selectedCell = -1; this.sfx('select', 0.34, 1.05); return; }
    if (this.map.g[index] === E.WALL) { this.removeWall(index); return; }
    if (this.map.g[index] === E.EMPTY && index !== this.map.entry && index !== this.map.exit) {
      this.selectedCell = index; this.updatePreview(); this.beacon.state = 'command'; this.beacon.time = 0.7; this.sfx('select', 0.34, 1.05);
    }
  };

  BulwarkScene.prototype.handleKey = function (code) {
    this.ensureMusic();
    if (code === 'KeyM') { kit.audio.setMute(!kit.audio.prefs.mute); this.toast(kit.audio.prefs.mute ? 'AUDIO MUTED' : 'AUDIO LIVE'); return; }
    if (code === 'KeyR') { kit.restart(); return; }
    if (this.state.phase !== 'play') {
      if (code === 'Enter' && this.state.phase === 'win') { this.state.endless = true; this.state.phase = 'play'; this.state.prep = 5; this.beacon.state = 'command'; this.beacon.time = 0.8; this.toast('ENDLESS', CSS.green); }
      else if (code === 'Space' || code === 'Enter') kit.restart();
      return;
    }
    if (code.indexOf('Digit') === 0) { var n = Number(code.slice(5)) - 1; if (E.CHIP_ORDER[n] && E.isUnlocked(E.CHIP_ORDER[n], this.state.wavesDone)) { this.pending = E.CHIP_ORDER[n]; this.sfx('select', 0.34, 1.1); } return; }
    if (code === 'KeyG') { this.goEarly(); return; }
    if (code === 'KeyU') { this.upgrade(this.selectedTower); return; }
    if (code === 'KeyX') { this.sellTower(this.selectedTower); return; }
    if (code === 'Space' || code === 'Enter') {
      if (this.selectedCell >= 0) this.tryBuild(this.selectedCell, this.pending); else if (this.selectedTower) this.upgrade(this.selectedTower); else this.activateCursorCell();
    }
  };

  BulwarkScene.prototype.handleTap = function (x, y) {
    this.ensureMusic();
    if (this.state.phase !== 'play') {
      if (this.state.phase === 'win' && x > 470 && x < 810 && y > 438 && y < 506) { this.state.endless = true; this.state.phase = 'play'; this.state.prep = 5; this.toast('ENDLESS', CSS.green); }
      else if (x > 470 && x < 810 && y > 520 && y < 588) kit.restart();
      return;
    }
    if (x > 1100 && x < 1230 && y > 4 && y < 86) { this.sfx('confirm', 0.38, 1.05); this.goEarly(); return; }
    if (x > 1210 && y < 86) { this.sfx('select', 0.3, 1.1); kit.openSettings(); return; }
    if (x > 885 && x < 1230 && y > 492 && y < 574) { this.changeMap((this.mapIndex + 1) % E.MAPS.length, true); return; }
    if (y >= 628 && y <= 720 && x >= 32 && x <= 856) {
      var chip = clamp(Math.floor((x - 44) / 130), 0, E.CHIP_ORDER.length - 1), key = E.CHIP_ORDER[chip];
      if (!E.isUnlocked(key, this.state.wavesDone)) { this.sfx('cancel', 0.3, 0.72); this.toast('LOCK · WAVE ' + safeDef(key, 'arrow').unlock); return; }
      this.pending = key; this.sfx('select', 0.34, 1.1); if (this.selectedCell >= 0) this.tryBuild(this.selectedCell, key); return;
    }
    if (x >= BOARD_X && x < BOARD_X + BOARD_W && y >= BOARD_Y && y < BOARD_Y + BOARD_H) {
      var cx = clamp(Math.floor((x - BOARD_X) / CELL), 0, 13), cy = clamp(Math.floor((y - BOARD_Y) / CELL), 0, 8), index = cy * 14 + cx;
      this.handleBoardCell(index);
      return;
    }
    if (this.selectedTower && x > 890 && x < 1220 && y > 284 && y < 374) { this.upgrade(this.selectedTower); return; }
    if (this.selectedTower && x > 890 && x < 1220 && y > 374 && y < 452) { this.sellTower(this.selectedTower); return; }
  };

  BulwarkScene.prototype.handleBoardCell = function (index) {
    var now = performance.now(), doubleTap = index === this.lastTapCell && now - this.lastTapAt < 360;
    this.lastTapCell = index; this.lastTapAt = now;
    var tower = this.towerAt(index);
    if (tower) { this.selectedTower = tower; this.selectedCell = -1; this.sfx('select', 0.34, 1.05); return; }
    this.selectedTower = null;
    if (this.map.g[index] === E.WALL) { this.removeWall(index); return; }
    if (this.map.g[index] === E.EMPTY && index !== this.map.entry && index !== this.map.exit) {
      if (doubleTap && this.lastBuiltType) { this.tryBuild(index, this.lastBuiltType); return; }
      this.selectedCell = this.selectedCell === index ? -1 : index;
      this.beacon.state = 'command'; this.beacon.time = 0.7;
      this.updatePreview(); this.sfx('select', 0.34, 1.05);
    }
  };

  BulwarkScene.prototype.render = function () {
    var juice = this.juiceFrame || kit.juice.frame(), reduced = kit.juice.enabled === false;
    this.world.x = reduced ? 0 : juice.dx; this.world.y = reduced ? 0 : juice.dy;
    this.renderWorld(); this.renderUi();
  };

  BulwarkScene.prototype.renderWorld = function () {
    var i, p, reduced = kit.juice.enabled === false;
    this.pathGfx.clear(); this.decalGfx.clear(); this.unitGfx.clear(); this.fxGfx.clear();
    var path = this.pathCache;
    this.pathGfx.lineStyle(22, PAL.coral, 0.14); this.pathGfx.beginPath();
    for (i = 0; i < path.length; i++) { p = cellXY(path[i]); if (i === 0) this.pathGfx.moveTo(p.x, p.y); else this.pathGfx.lineTo(p.x, p.y); }
    this.pathGfx.strokePath();
    this.pathGfx.lineStyle(3, PAL.coral, 0.52); this.pathGfx.beginPath();
    for (i = 0; i < path.length; i++) { p = cellXY(path[i]); if (i === 0) this.pathGfx.moveTo(p.x, p.y); else this.pathGfx.lineTo(p.x, p.y); }
    this.pathGfx.strokePath();
    for (i = 1; i < path.length - 1; i += 2) { p = cellXY(path[i]); polygonCircle(this.pathGfx, p.x, p.y, 3, PAL.coral, 6); }
    if (this.selectedCell >= 0 && this.previewPath.length > 1 && this.previewValid) {
      this.decalGfx.lineStyle(3, PAL.cyan, reduced ? 0.28 : 0.58); this.decalGfx.beginPath();
      for (i = 0; i < this.previewPath.length; i++) { p = cellXY(this.previewPath[i]); if (i === 0) this.decalGfx.moveTo(p.x, p.y); else this.decalGfx.lineTo(p.x, p.y); }
      this.decalGfx.strokePath();
    }
    if (this.selectedCell >= 0) {
      p = cellXY(this.selectedCell); var valid = this.previewValid, color = valid ? PAL.cyan : PAL.coral;
      this.decalGfx.lineStyle(3, color, 1); this.decalGfx.strokeRect(p.x - CELL / 2 + 4, p.y - CELL / 2 + 4, CELL - 8, CELL - 8);
      var d = safeDef(this.pending, 'arrow'); if (d.range) ring(this.decalGfx, p.x, p.y, d.range * CELL, color, reduced ? 0.16 : 0.38, 32, reduced ? 1 : 2);
      if (d.aoe) ring(this.decalGfx, p.x, p.y, d.aoe * CELL, PAL.amber, reduced ? 0.13 : 0.32, 24, reduced ? 1 : 2);
    }
    if (this.cursor) {
      var cursorIndex = this.cursor.y * 14 + this.cursor.x, cursorPoint = cellXY(cursorIndex);
      this.decalGfx.lineStyle(2, PAL.white, reduced ? 0.35 : 0.78); this.decalGfx.strokeRect(cursorPoint.x - CELL / 2 + 7, cursorPoint.y - CELL / 2 + 7, CELL - 14, CELL - 14);
    }
    this.renderBeacon();
    for (i = 0; i < this.towers.length; i++) this.renderTower(this.towers[i]);
    for (i = 0; i < this.creeps.length; i++) if (this.creeps[i].active || this.creeps[i].defeatT > 0) this.renderCreep(this.creeps[i]);
    for (i = 0; i < this.bullets.length; i++) { var b = this.bullets[i]; if (!b.active) continue; polygonCircle(this.fxGfx, b.x, b.y, b.kind === 'lob' ? 7 : 4, b.color, 8); }
    var particleNames = ['contactSparks', 'dustDebris', 'projectileTrails', 'waveBursts'];
    for (var n = 0; n < particleNames.length; n++) for (i = 0; i < this.particleSystems[particleNames[n]].length; i++) { var q = this.particleSystems[particleNames[n]][i]; if (!q.active) continue; this.fxGfx.fillStyle(q.color, clamp(q.life / q.max, 0, 1) * (reduced ? 0.55 : 1)); this.fxGfx.fillRect(q.x, q.y, q.size, q.size); }
    for (i = 0; i < this.effects.length; i++) { var f = this.effects[i]; if (!f.active) continue; var alpha = clamp(f.life / f.max, 0, 1) * (reduced ? 0.45 : 1); if (f.kind === 'beam') { if (!reduced) { this.fxGfx.lineStyle(4, f.color, alpha); this.fxGfx.beginPath(); this.fxGfx.moveTo(f.x1, f.y1); this.fxGfx.lineTo(f.x2, f.y2); this.fxGfx.strokePath(); } } else { ring(this.fxGfx, f.x1, f.y1, (f.radius * CELL) * (1.2 - alpha * 0.25), f.color, alpha, 26, reduced ? 1 : 3); } }
  };

  /* Player proxy: the lane engineer beacon has idle, command, and resolve poses. */
  BulwarkScene.prototype.renderBeacon = function () {
    var state = this.state.phase === 'win' ? 'victory' : this.state.phase === 'lose' ? 'defeat' : this.beacon.state;
    var reduced = kit.juice.enabled === false, x = BOARD_X - 18, y = BOARD_Y + 38 + Math.sin(this.state.time * 3.2) * (state === 'idle' ? 2 : 0);
    var scale = state === 'resolve' || state === 'victory' ? 1.18 : state === 'command' ? 1.08 : state === 'defeat' ? 0.92 : 1;
    var color = state === 'resolve' || state === 'victory' ? PAL.amber : state === 'defeat' ? PAL.coral : PAL.cyan;
    ring(this.unitGfx, x, y + 17, 18 * scale, color, reduced ? 0.2 : 0.54, 20, reduced ? 1 : 2);
    this.unitGfx.fillStyle(PAL.panel2, 1); this.unitGfx.fillRect(x - 8 * scale, y - 13 * scale, 16 * scale, 28 * scale);
    this.unitGfx.lineStyle(2, color, 1); this.unitGfx.strokeRect(x - 8 * scale, y - 13 * scale, 16 * scale, 28 * scale);
    this.unitGfx.fillStyle(color, 1); this.unitGfx.fillRect(x - 4 * scale, y - 20 * scale, 8 * scale, 7 * scale);
    this.unitGfx.fillRect(x + 8 * scale, y - 16 * scale, 11 * scale, 3 * scale);
    if (state === 'victory') { this.unitGfx.fillStyle(PAL.white, 1); this.unitGfx.fillRect(x + 9 * scale, y - 28 * scale, 2 * scale, 12 * scale); this.unitGfx.fillRect(x + 11 * scale, y - 28 * scale, 10 * scale, 6 * scale); }
    if (state === 'defeat') { this.unitGfx.lineStyle(3, PAL.coral, 0.9); this.unitGfx.beginPath(); this.unitGfx.moveTo(x - 13, y - 26); this.unitGfx.lineTo(x + 13, y + 5); this.unitGfx.strokePath(); }
  };

  BulwarkScene.prototype.renderTower = function (t) {
    var reduced = kit.juice.enabled === false, d = safeDef(t.type, 'arrow'), x = t.x, y = t.y, lv = t.level;
    var attack = t.attackT > 0 && !reduced, r = 15 + (reduced ? 0 : Math.max(0, t.pulse) * 3);
    var recoil = attack ? 5 * (t.attackT / 0.18) : 0, baseY = y + (t.animState === 'active' && !reduced ? Math.sin((0.3 - t.animT) * 18) * 2 : 0);
    this.unitGfx.fillStyle(d.dark, 1); this.unitGfx.fillRect(x - 22, baseY - 22, 44, 44);
    this.unitGfx.lineStyle(2, d.color, 1); this.unitGfx.strokeRect(x - 22, baseY - 22, 44, 44);
    if (t.type === 'wall') {
      this.unitGfx.fillStyle(d.color, 1); this.unitGfx.fillRect(x - 18, baseY - 12, 36, 24);
      this.unitGfx.fillStyle(0xd1dbe5, 0.7); this.unitGfx.fillRect(x - 13, baseY - 7, 8, 3); this.unitGfx.fillRect(x, baseY - 7, 8, 3);
      this.unitGfx.fillStyle(PAL.wine, 1); this.unitGfx.fillRect(x - 20, baseY - 15, 40, 4);
    } else if (t.type === 'bank') {
      this.unitGfx.fillStyle(d.color, 1); this.unitGfx.fillRect(x - 14, baseY - 14, 28, 28); this.unitGfx.fillStyle(d.dark, 1); this.unitGfx.fillRect(x - 5, baseY - 10, 10, 20); this.unitGfx.fillRect(x - 10, baseY - 5, 20, 10);
      this.unitGfx.fillStyle(PAL.amber, 1); this.unitGfx.fillRect(x - 4, baseY - 22, 8, 6);
    } else {
      polygonCircle(this.unitGfx, x, baseY, r, d.color, 8, d.dark, 2);
      this.unitGfx.fillStyle(PAL.white, 1); this.unitGfx.fillRect(x - 5, baseY - r - 7, 10, 5);
      this.unitGfx.save(); this.unitGfx.translateCanvas(x - Math.cos(t.angle) * recoil, baseY - Math.sin(t.angle) * recoil); this.unitGfx.rotateCanvas(t.angle);
      this.unitGfx.fillStyle(PAL.ink, 1); this.unitGfx.fillRect(4, -4, 24, 8); this.unitGfx.restore();
      this.unitGfx.fillStyle(PAL.white, 1); this.unitGfx.fillRect(x - 15, baseY + 16, lv * 5, 3);
    }
    if (this.selectedTower === t) { var s = this.towerStats(t); ring(this.decalGfx, x, baseY, s.range * CELL, d.color, reduced ? 0.14 : 0.34, 34, reduced ? 1 : 2); this.decalGfx.lineStyle(2, d.color, reduced ? 0.3 : 0.6); this.decalGfx.beginPath(); this.decalGfx.moveTo(x, baseY); this.decalGfx.lineTo(x + Math.cos(t.angle) * 26, baseY + Math.sin(t.angle) * 26); this.decalGfx.strokePath(); }
  };

  BulwarkScene.prototype.towerStats = function (t) {
    var d = safeDef(t.type, 'arrow');
    return { damage: (d.damage || 0) * Math.pow(1.32, t.level - 1), range: d.range ? d.range * (1 + (t.level - 1) * 0.08) : 0, rate: d.rate ? d.rate * Math.pow(0.93, t.level - 1) : 0 };
  };

  BulwarkScene.prototype.renderCreep = function (c) {
    var reduced = kit.juice.enabled === false, state = c.animState || 'move', defeat = !c.active && c.defeatT > 0;
    var x = BOARD_X + c.cx * CELL, y = BOARD_Y + c.cy * CELL, r = c.radius * CELL;
    var phase = c.animPhase || 0, breathe = state === 'idle' ? Math.sin(this.state.time * 3.4 + phase) * 1.6 : 0;
    var motion = state === 'move' ? Math.sin(this.state.time * 11 + phase) * 1.7 : 0;
    var recoil = state === 'hurt' ? -4 * clamp(c.animT / 0.18, 0, 1) : state === 'attack' ? 4 * clamp(c.animT / 0.22, 0, 1) : 0;
    var scale = state === 'attack' ? 1.08 : state === 'hurt' ? 0.94 : 1, alpha = defeat ? clamp(c.defeatT / (c.defeatMax || 0.28), 0, 1) : 1;
    y += breathe + motion; x += Math.cos(c.angle || 0) * recoil;
    if (defeat) { scale = 1 + (1 - alpha) * 0.2; y -= (1 - alpha) * 8; }
    var color = c.flash > 0 && !reduced ? PAL.white : c.color;
    this.unitGfx.setAlpha(alpha);
    if (c.fly) { polygonCircle(this.unitGfx, x + 4, y + 7, r * 0.7 * scale, PAL.ink, 8); poly(this.unitGfx, [[x + r * scale, y], [x - r * 0.7 * scale, y - r * 0.8 * scale], [x - r * 0.3 * scale, y], [x - r * 0.7 * scale, y + r * 0.8 * scale]], color, PAL.wine, 2); }
    else if (c.boss) { poly(this.unitGfx, [[x, y - r * scale], [x + r * 0.75 * scale, y - r * 0.4 * scale], [x + r * scale, y + r * 0.45 * scale], [x, y + r * scale], [x - r * scale, y + r * 0.45 * scale], [x - r * 0.75 * scale, y - r * 0.4 * scale]], color, PAL.wine, 3); this.unitGfx.fillStyle(PAL.white, 1); this.unitGfx.fillRect(x - 14 * scale, y - 4 * scale, 28 * scale, 4 * scale); ring(this.decalGfx, x, y, r + 8, PAL.coral, reduced ? 0.2 : 0.58, 22, reduced ? 1 : 2); }
    else if (c.type === 'tank') { this.unitGfx.fillStyle(color, 1); this.unitGfx.fillRect(x - r * scale, y - r * 0.72 * scale, r * 2 * scale, r * 1.44 * scale); this.unitGfx.fillStyle(PAL.wine, 1); this.unitGfx.fillRect(x - r * 0.25 * scale, y - r * 0.98 * scale, r * 0.5 * scale, r * 0.45 * scale); }
    else if (c.type === 'runner') poly(this.unitGfx, [[x + r * scale, y], [x - r * 0.6 * scale, y - r * scale], [x - r * 0.65 * scale, y + r * scale]], color, PAL.wine, 2);
    else if (c.type === 'shield') { polygonCircle(this.unitGfx, x, y, r * scale, color, 8, PAL.wine, 2); ring(this.decalGfx, x, y, r + 5, PAL.coral, reduced ? 0.2 : 0.58, 20, reduced ? 1 : 2); }
    else poly(this.unitGfx, [[x, y - r * scale], [x + r * scale, y], [x, y + r * scale], [x - r * scale, y]], color, PAL.wine, 2);
    this.unitGfx.fillStyle(PAL.coral, 1); this.unitGfx.fillRect(x - 4 * scale, y - r * 0.22 * scale, 8 * scale, 3 * scale);
    if (c.slowF < 1) ring(this.decalGfx, x, y, r + 7, PAL.cyan, reduced ? 0.25 : 0.72, 20, reduced ? 1 : 2);
    if (c.hp < c.hpMax || c.boss) { var bw = Math.max(24, r * 2.4); this.unitGfx.fillStyle(PAL.ink, 0.85); this.unitGfx.fillRect(x - bw / 2, y - r - 10, bw, 5); this.unitGfx.fillStyle(PAL.coral, 1); this.unitGfx.fillRect(x - bw / 2, y - r - 10, bw * clamp(c.hp / c.hpMax, 0, 1), 5); }
    this.unitGfx.setAlpha(1);
  };

  BulwarkScene.prototype.renderUi = function () {
    this.recomputeBankStats();
    var s = this.state, def = E.MAPS[this.mapIndex], pathOk = this.map.dist[this.map.entry] >= 0, nextInterest = Math.floor(s.gold * (0.045 + s.bankInterest)) + s.bankCount * 3;
    setTextIfChanged(this.ui.lives, '♥ ' + s.lives); setColorIfChanged(this.ui.lives, s.lives <= 5 ? CSS.coral : CSS.text);
    setTextIfChanged(this.ui.gold, '◆ ' + Math.floor(s.gold)); setTextIfChanged(this.ui.wave, 'W ' + s.wave + (s.endless ? '' : '/30')); setTextIfChanged(this.ui.score, '★ ' + s.score);
    setTextIfChanged(this.ui.map, def.name + ' · ' + (this.mapIndex + 1) + '/4');
    var canChangeMap = s.wave === 0 && s.wavesDone === 0 && !s.active;
    setTextIfChanged(this.ui.mapButton, 'MAP'); setColorIfChanged(this.ui.mapButton, canChangeMap ? CSS.cyan : CSS.muted); this.ui.mapButton.setVisible(canChangeMap);
    setTextIfChanged(this.ui.go, s.active ? 'LEFT ' + this.waveLeft() : 'GO ' + Math.ceil(Math.max(0, s.prep)) + 's'); setColorIfChanged(this.ui.go, s.active ? CSS.coral : CSS.green);
    setTextIfChanged(this.ui.path, pathOk ? '✓ ' + this.map.dist[this.map.entry] : '× SEALED'); setColorIfChanged(this.ui.path, pathOk ? CSS.green : CSS.coral);
    if (this.selectedTower) {
      var d = safeDef(this.selectedTower.type, 'arrow'), st = this.towerStats(this.selectedTower);
      var ready = d.bank ? '+' + (3 * this.selectedTower.level) + 'G/WAVE' : (this.selectedTower.cd <= 0 ? 'READY' : 'CD ' + this.selectedTower.cd.toFixed(1) + 's');
      setTextIfChanged(this.ui.tower, d.name + ' · LV ' + this.selectedTower.level); setTextIfChanged(this.ui.detail, d.bank ? ready + ' · BANK +' + Math.round(s.bankInterest * 100) + '%' : 'D' + Math.round(st.damage) + ' · R' + st.range.toFixed(1) + ' · ' + (1 / st.rate).toFixed(1) + '/s · ' + ready); setColorIfChanged(this.ui.tower, CSS.cyan);
      this.ui.tower.setVisible(true); this.ui.detail.setVisible(true);
    } else if (this.selectedCell >= 0) {
      var can = this.previewValid, pd = safeDef(this.pending, 'arrow');
      setTextIfChanged(this.ui.tower, 'TILE · ' + pd.name); setTextIfChanged(this.ui.detail, (can ? '✓ ' : '× ') + pd.cost + 'G'); setColorIfChanged(this.ui.tower, can ? CSS.cyan : CSS.coral); this.ui.tower.setVisible(true); this.ui.detail.setVisible(true);
    } else { this.ui.tower.setVisible(false); this.ui.detail.setVisible(false); }
    setTextIfChanged(this.ui.bank, 'BANK ×' + s.bankCount + ' · +' + Math.round((0.045 + s.bankInterest) * 100) + '%'); setTextIfChanged(this.ui.bankDetail, 'NEXT +' + nextInterest + 'G');
    var tut = ['BUILD · TILE + WALL', 'ROUTE · KEEP ✓ OPEN', 'GO · EARLY GOLD', 'UPGRADE · SELECT A TOWER'];
    if (s.tutorialStep !== this.coachStep) { this.coachStep = s.tutorialStep; this.coachT = s.tutorialStep < 4 ? 3.2 : 0; }
    var showCoach = s.tutorialStep < 4 && this.coachT > 0 && !(this.banner && this.banner.active);
    if (showCoach) {
      setTextIfChanged(this.ui.tutorial, tut[clamp(s.tutorialStep, 0, 3)]);
      var coachAlpha = kit.juice.enabled === false ? 1 : clamp(0.16 + this.coachT / 3.2 * 0.84, 0.16, 1);
      this.uiGfx.fillStyle(PAL.panel2, 0.5 * coachAlpha); this.uiGfx.fillRoundedRect(56, 86, 800, 30, 6);
      this.ui.tutorial.setVisible(true).setAlpha(coachAlpha);
    } else this.ui.tutorial.setVisible(false);
    this.drawUiPanels(pathOk, nextInterest);
    var showMessage = s.messageT > 0 && !showCoach && !(this.banner && this.banner.active);
    if (showMessage) {
      setTextIfChanged(this.ui.message, s.message); setColorIfChanged(this.ui.message, this.messageColor || CSS.amber);
      this.ui.message.setVisible(true).setAlpha(kit.juice.enabled === false ? 1 : clamp(Math.min(1, s.messageT * 4), 0.18, 1));
      this.uiGfx.fillStyle(PAL.ink, 0.88); this.uiGfx.fillRoundedRect(894, 86, 310, 30, 7); this.uiGfx.lineStyle(1, this.messageColor || PAL.amber, 0.75); this.uiGfx.strokeRoundedRect(894, 86, 310, 30, 7);
    } else this.ui.message.setVisible(false);
    if (this.banner && this.banner.active && (s.phase !== 'play' || this.banner.age < this.banner.duration)) {
      var b = this.banner, fade = clamp((b.duration - b.age) * 3, 0, 1), scale = kit.juice.enabled === false ? 1 : (b.age < 0.2 ? 0.94 + b.age / 0.2 * 0.06 : 1);
      this.uiGfx.fillStyle(PAL.ink, 0.94 * fade); this.uiGfx.fillRoundedRect(380, 126, 520, 76, 10);
      this.uiGfx.lineStyle(2, b.color, 0.9 * fade); this.uiGfx.strokeRoundedRect(380, 126, 520, 76, 10);
      this.ui.bannerTitle.setVisible(true).setScale(scale); this.ui.bannerSub.setVisible(true).setScale(scale);
      setTextIfChanged(this.ui.bannerTitle, b.title); setTextIfChanged(this.ui.bannerSub, b.sub); setColorIfChanged(this.ui.bannerTitle, b.color); setColorIfChanged(this.ui.bannerSub, CSS.muted); this.ui.bannerTitle.setAlpha(fade); this.ui.bannerSub.setAlpha(fade);
    } else { this.ui.bannerTitle.setVisible(false); this.ui.bannerSub.setVisible(false); }
    if (s.phase !== 'play') this.drawEndUi();
    else if (this.endTitle) { this.endTitle.setVisible(false); this.endDetail.setVisible(false); this.endAction.setVisible(false); this.endRestart.setVisible(false); }
  };

  BulwarkScene.prototype.waveLeft = function () {
    var left = this.waveQueue.length - this.waveCursor;
    for (var i = 0; i < this.creeps.length; i++) if (this.creeps[i].active) left++;
    return left;
  };

  BulwarkScene.prototype.drawUiPanels = function (pathOk, nextInterest) {
    var g = this.uiGfx; g.clear();
    g.fillStyle(pathOk ? PAL.green : PAL.coral, 0.18); g.fillRect(896, 112, 304, 8);
    if (this.state.active) { g.fillStyle(PAL.coral, 0.22); g.fillRoundedRect(1110, 12, 118, 66, 10); g.lineStyle(2, PAL.coral, 0.8); g.strokeRoundedRect(1110, 12, 118, 66, 10); }
    else { g.fillStyle(PAL.green, 0.2); g.fillRoundedRect(1110, 12, 118, 66, 10); g.lineStyle(2, PAL.green, 0.8); g.strokeRoundedRect(1110, 12, 118, 66, 10); }
    if (this.selectedTower || this.selectedCell >= 0) {
      g.fillStyle(PAL.panel2, 1); g.fillRoundedRect(894, 164, 310, 222, 10); g.lineStyle(1, PAL.line, 1); g.strokeRoundedRect(894, 164, 310, 222, 10);
    }
    if (this.selectedTower) {
      var d = safeDef(this.selectedTower.type, 'arrow'), up = this.upCost(this.selectedTower), sell = this.sellValue(this.selectedTower);
      g.fillStyle(PAL.green, this.state.gold >= up ? 0.23 : 0.08); g.fillRoundedRect(902, 284, 142, 82, 8); g.lineStyle(1, PAL.green, 0.7); g.strokeRoundedRect(902, 284, 142, 82, 8);
      g.fillStyle(PAL.coral, 0.18); g.fillRoundedRect(1052, 284, 142, 82, 8); g.lineStyle(1, PAL.coral, 0.6); g.strokeRoundedRect(1052, 284, 142, 82, 8);
      g.fillStyle(PAL.green, 1); g.fillRect(913, 318, 6, 14); g.fillStyle(PAL.coral, 1); g.fillRect(1063, 318, 6, 14);
      this.ensureActionText('UPG ' + (this.selectedTower.level >= 5 ? 'MAX' : up + 'G'), 930, 316, CSS.green);
      this.ensureActionText('SELL +' + sell + 'G', 1078, 316, CSS.coral);
    }
    g.fillStyle(PAL.panel2, 0.9); g.fillRoundedRect(894, 390, 310, 82, 10); g.lineStyle(1, PAL.line, 1); g.strokeRoundedRect(894, 390, 310, 82, 10);
    if (this.ui.mapButton.visible) { g.fillStyle(PAL.cyan, 0.14); g.fillRoundedRect(894, 492, 310, 82, 10); g.lineStyle(1, PAL.cyan, 0.55); g.strokeRoundedRect(894, 492, 310, 82, 10); }
    for (var i = 0; i < E.CHIP_ORDER.length; i++) {
      var key = E.CHIP_ORDER[i], d2 = safeDef(key, 'arrow'), x = 44 + i * 130, locked = !E.isUnlocked(key, this.state.wavesDone), selected = this.pending === key;
      g.fillStyle(locked ? PAL.ink : d2.dark, locked ? 0.78 : (selected ? 0.95 : 0.8)); g.fillRoundedRect(x, 632, 116, 84, 9); g.lineStyle(selected ? 2 : 1, locked ? PAL.line : d2.color, locked ? 0.5 : 0.88); g.strokeRoundedRect(x, 632, 116, 84, 9);
      if (locked) { g.fillStyle(PAL.muted, 0.85); g.fillRect(x + 12, 650, 18, 18); } else { polygonCircle(g, x + 22, 660, 10, d2.color, 8); }
      setTextIfChanged(this.chipText[i].name, locked ? 'LOCK ' + d2.unlock : d2.short + ' · ' + d2.cost + 'G'); setColorIfChanged(this.chipText[i].name, locked ? CSS.muted : (selected ? CSS.text : '#' + d2.color.toString(16).padStart(6, '0')));
    }
    if (this.selectedTower) { this.actionUpgradeText.setVisible(true); this.actionSellText.setVisible(true); } else if (this.actionUpgradeText) { this.actionUpgradeText.setVisible(false); this.actionSellText.setVisible(false); }
  };

  BulwarkScene.prototype.ensureActionText = function (value, x, y, color) {
    if (!this.actionUpgradeText) {
      this.actionUpgradeText = this.add.text(0, 0, '', { fontFamily: 'Arial, sans-serif', fontSize: '20px', fontStyle: 'bold', color: CSS.green }).setDepth(23);
      this.actionSellText = this.add.text(0, 0, '', { fontFamily: 'Arial, sans-serif', fontSize: '20px', fontStyle: 'bold', color: CSS.coral }).setDepth(23);
    }
    var target = color === CSS.coral ? this.actionSellText : this.actionUpgradeText; setTextIfChanged(target, value); setColorIfChanged(target, color); target.setPosition(x, y);
  };

  BulwarkScene.prototype.drawEndUi = function () {
    var win = this.state.phase === 'win';
    this.uiGfx.fillStyle(PAL.ink, 0.86); this.uiGfx.fillRect(256, 254, 768, 342); this.uiGfx.lineStyle(2, win ? PAL.amber : PAL.coral, 0.9); this.uiGfx.strokeRect(256, 254, 768, 342);
    this.uiGfx.fillStyle(win ? PAL.amber : PAL.coral, 0.18); this.uiGfx.fillRect(256, 254, 768, 7);
    if (!this.endTitle) {
      this.endTitle = this.add.text(640, 292, '', { fontFamily: 'Arial, sans-serif', fontSize: '36px', fontStyle: 'bold', color: CSS.text }).setOrigin(0.5).setDepth(31);
      this.endDetail = this.add.text(640, 348, '', { fontFamily: 'Arial, sans-serif', fontSize: '17px', color: CSS.muted, align: 'center' }).setOrigin(0.5).setDepth(31);
      this.endAction = this.add.text(640, 474, '', { fontFamily: 'Arial, sans-serif', fontSize: '17px', fontStyle: 'bold', color: CSS.green }).setOrigin(0.5).setDepth(31);
      this.endRestart = this.add.text(640, 544, 'RESTART RUN', { fontFamily: 'Arial, sans-serif', fontSize: '13px', fontStyle: 'bold', color: CSS.text }).setOrigin(0.5).setDepth(31);
    }
    setTextIfChanged(this.endTitle, win ? 'BULWARK HOLDS' : 'LINE BREACHED'); setColorIfChanged(this.endTitle, win ? CSS.green : CSS.coral);
    setTextIfChanged(this.endDetail, 'WAVES  ' + this.state.wavesDone + '    LIVES  ' + this.state.lives + '    SCORE  ' + this.state.score + '\nBEST  ' + profile.best + '    MAP  ' + E.MAPS[this.mapIndex].name);
    setTextIfChanged(this.endAction, win ? 'CONTINUE ENDLESS  //  TAP HERE' : 'PRESS ENTER OR TAP RESTART');
    this.endTitle.setVisible(true); this.endDetail.setVisible(true); this.endAction.setVisible(true); this.endRestart.setVisible(true);
  };

  var config = {
    type: Phaser.AUTO, parent: 'game', width: GAME_W, height: GAME_H, backgroundColor: '#06111e',
    render: { antialias: true, roundPixels: true, powerPreference: 'high-performance' },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [BulwarkScene]
  };
  kit.loader.show('BULWARK // FLEET F5'); kit.loader.progress(0.2);
  Game.phaser = new Phaser.Game(config);
  kit.loader.progress(0.7);
  window.__BW_READY = true;
}());
