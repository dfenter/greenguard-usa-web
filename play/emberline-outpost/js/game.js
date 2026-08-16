/* Emberline Outpost: Phaser presentation, fixed-step tactics, and GGKit adapter. */
(function (root) {
  'use strict';

  var EO = root.EO;
  var P = EO.PAL;
  var STEP = 1 / 60;
  var MAX_STEPS = 5;
  var MAX_ENEMIES = 84;
  var MAX_SHOTS = 72;
  var MAX_PARTS = 96;
  var SAVE_VERSION = 2;
  var TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex(v) { return typeof v === 'number' ? v : parseInt(String(v).replace('#', ''), 16); }
  function dist(ax, ay, bx, by) { var x = ax - bx, y = ay - by; return Math.sqrt(x * x + y * y); }
  function ring(g, x, y, r, n, c, a, start, end) {
    var s = start == null ? 0 : start, e = end == null ? TAU : end, steps = Math.max(8, n || 24), i;
    g.lineStyle(1.6, hex(c), a == null ? 0.8 : a);
    g.beginPath();
    for (i = 0; i <= steps; i++) {
      var t = s + (e - s) * i / steps, px = x + Math.cos(t) * r, py = y + Math.sin(t) * r;
      if (!i) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.strokePath();
  }
  function sector(g, x, y, r, angle, spread, c, a, fill) {
    var steps = 12, i;
    g.lineStyle(1.5, hex(c), a == null ? 0.7 : a);
    if (fill) g.fillStyle(hex(c), fill);
    g.beginPath(); g.moveTo(x, y);
    for (i = 0; i <= steps; i++) {
      var t = angle - spread + spread * 2 * i / steps;
      g.lineTo(x + Math.cos(t) * r, y + Math.sin(t) * r);
    }
    g.closePath();
    if (fill) g.fillPath();
    g.strokePath();
  }
  function setText(t, value) { if (t.text !== value) t.setText(value); }

  function defaultSave() {
    return {
      version: SAVE_VERSION,
      cleared: 0,
      stars: [],
      unlocked: ['barrier', 'pike'],
      promotions: {},
      mats: { scrap: 0, ember: 0, alloy: 0 },
      outpost: { smelter: 0, relay: 0, deck: 0 },
      loadout: ['barrier', 'pike', 'arcer', 'sparker', 'medic', 'scout'],
      trials: {},
      siegeBest: 0
    };
  }
  function validSave(s) {
    if (!s || typeof s !== 'object' || s.version !== SAVE_VERSION) return false;
    if (!Array.isArray(s.stars) || s.stars.length > EO.MISSIONS.length) return false;
    if (!Array.isArray(s.unlocked) || !s.unlocked.length || !s.mats || !s.outpost || !s.promotions) return false;
    for (var i = 0; i < s.unlocked.length; i++) if (!EO.OP_BY_ID[s.unlocked[i]]) return false;
    for (var k in s.promotions) if (Object.prototype.hasOwnProperty.call(s.promotions, k) && (!EO.OP_BY_ID[k] || s.promotions[k] < 0 || s.promotions[k] > 3)) return false;
    return typeof s.cleared === 'number' && s.cleared >= 0 && s.cleared <= EO.MISSIONS.length;
  }
  function sanitizeSave(s) {
    if (!validSave(s)) s = defaultSave();
    s.cleared = clamp(Math.floor(s.cleared), 0, EO.MISSIONS.length);
    s.stars = s.stars.slice(0, EO.MISSIONS.length);
    for (var i = 0; i < s.stars.length; i++) s.stars[i] = clamp(Math.floor(Number(s.stars[i]) || 0), 0, 3);
    s.mats.scrap = clamp(Math.floor(Number(s.mats.scrap) || 0), 0, 99999);
    s.mats.ember = clamp(Math.floor(Number(s.mats.ember) || 0), 0, 99999);
    s.mats.alloy = clamp(Math.floor(Number(s.mats.alloy) || 0), 0, 99999);
    s.outpost.smelter = clamp(Math.floor(Number(s.outpost.smelter) || 0), 0, 3);
    s.outpost.relay = clamp(Math.floor(Number(s.outpost.relay) || 0), 0, 3);
    s.outpost.deck = clamp(Math.floor(Number(s.outpost.deck) || 0), 0, 2);
    s.loadout = Array.isArray(s.loadout) ? s.loadout.slice(0, 6) : [];
    s.loadout = s.loadout.filter(function (id, n, a) { return EO.OP_BY_ID[id] && s.unlocked.indexOf(id) >= 0 && a.indexOf(id) === n; });
    s.unlocked.forEach(function (id) { if (s.loadout.length < 4 && s.loadout.indexOf(id) < 0) s.loadout.push(id); });
    s.siegeBest = Math.max(0, Math.floor(Number(s.siegeBest) || 0));
    return s;
  }

  var hook = root.__eo = root.__eo || {};
  hook.state = hook.state || { mode: 'boot', progress: 0, score: 0, health: 0, currentStage: 1 };
  if (hook.forceMode == null) hook.forceMode = '';
  if (hook.forceStage == null) hook.forceStage = 0;

  var scene = null;
  var save;
  var kit = root.GGKit.create({
    slug: 'emberline-outpost',
    orientation: 'landscape',
    validateSave: validSave,
    onPause: function () { if (scene) { scene.kitPaused = true; scene.drag = null; scene.publicState.paused = true; } },
    onResume: function () { if (scene) { scene.kitPaused = false; scene.publicState.paused = false; } },
    onRestart: function () { if (scene) scene.beginMission(scene.stage, scene.runKind); }
  });
  kit.audio.register({
    ashfall: 'assets/ashfall.mp3', flooded: 'assets/flooded.mp3', cinder: 'assets/cinder.mp3', core: 'assets/core.mp3',
    dangerAsh: 'assets/danger-ash.mp3', dangerFlood: 'assets/danger-flood.mp3', dangerCinder: 'assets/danger-cinder.mp3', dangerCore: 'assets/danger-core.mp3',
    select: 'assets/select.mp3', confirm: 'assets/confirm.mp3', cancel: 'assets/cancel.mp3', place: 'assets/place.mp3', move: 'assets/move.mp3', attack: 'assets/attack.mp3', hit: 'assets/hit.mp3', kill: 'assets/kill.mp3', warning: 'assets/warning.mp3', wave: 'assets/wave.mp3', skill: 'assets/skill.mp3', victory: 'assets/victory.mp3', promote: 'assets/promote.mp3'
  });
  kit.registerPWA();
  save = sanitizeSave(kit.save.get(defaultSave()));
  kit.save.set(save);

  var pointerOwn = new Map();
  root.addEventListener('pointerdown', function (e) {
    if (!scene) return;
    var p = scene.localPoint(e.clientX, e.clientY);
    if (scene.kitPaused) { scene.pausedPointerDown(p); return; }
    var kitPointer = kit.input.pointers.get(e.pointerId);
    if (!kitPointer) return;
    pointerOwn.set(e.pointerId, { x: p.x, y: p.y, startX: p.x, startY: p.y });
    scene.pointerDown(e.pointerId, p);
  }, { passive: true });
  root.addEventListener('pointermove', function (e) {
    if (!scene) return;
    var own = pointerOwn.get(e.pointerId);
    if (!own) return;
    var p = scene.localPoint(e.clientX, e.clientY); own.x = p.x; own.y = p.y;
    scene.pointerMove(e.pointerId, p);
  }, { passive: true });
  root.addEventListener('pointerup', function (e) {
    if (!scene) return;
    var own = pointerOwn.get(e.pointerId);
    if (own) scene.pointerUp(e.pointerId, scene.localPoint(e.clientX, e.clientY));
    pointerOwn.delete(e.pointerId);
  }, { passive: true });
  root.addEventListener('pointercancel', function (e) {
    if (scene) scene.pointerUp(e.pointerId, null);
    pointerOwn.delete(e.pointerId);
  }, { passive: true });
  root.addEventListener('blur', function () { pointerOwn.clear(); if (scene) scene.drag = null; });
  root.addEventListener('keydown', function (e) {
    if (!scene) return;
    var key = e.key;
    if (key === 'p' || key === 'P' || key === 'Escape') { scene.togglePause(); e.preventDefault(); return; }
    if (scene.kitPaused) return;
    if (scene.mode !== 'play') {
      if (key === 'Enter' || key === ' ') scene.primaryAction();
      return;
    }
    if (key.indexOf('Arrow') === 0) { scene.moveCursor(key); e.preventDefault(); return; }
    if (key === 'q' || key === 'Q') { scene.cycleCard(-1); e.preventDefault(); }
    else if (key === 'e' || key === 'E') { scene.cycleCard(1); e.preventDefault(); }
    else if (key === 'r' || key === 'R') { scene.cursorDir = (scene.cursorDir + 1) & 3; kit.audio.sfx('move', { volume: 0.5 }); }
    else if (key === ' ') { scene.keyboardDeploy(); e.preventDefault(); }
    else if (key === 'Enter') { if (scene.selected) scene.activateSkill(scene.selected, 0); e.preventDefault(); }
    else if (key === '2') { if (scene.selected) scene.activateSkill(scene.selected, 1); }
    else if (key === 'f' || key === 'F') { scene.speed = scene.speed === 1 ? 2 : 1; kit.audio.sfx('confirm', { volume: 0.5 }); }
  }, { passive: false });

  function makeEnemy() { return { active: false, type: 'runner', def: null, path: null, pathIndex: 0, seg: 0, u: 0, x: 0, y: 0, hp: 1, maxHp: 1, air: false, dead: false, slow: 0, stun: 0, root: 0, burn: 0, burnT: 0, oil: 0, atk: 0, target: null, flash: 0, phase: 0, threat: 0, hitPulse: 0, marked: 0, blocks: 1, prog: 0, r: 8 };
  }
  function makeShot() { return { active: false, x: 0, y: 0, tx: 0, ty: 0, life: 0, max: 0.16, color: P.cyan, kind: 0 }; }
  function makePart() { return { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0.5, color: P.cyan, size: 3, system: 'contact', gravity: 30, rot: 0 }; }

  class EmberlineScene extends Phaser.Scene {
    constructor() { super({ key: 'EmberlineScene' }); }

    create() {
      scene = this;
      this.mode = 'campaign'; this.runKind = 'campaign'; this.stage = 0; this.trialIndex = 0;
      this.kitPaused = !!kit.paused; this.manualPaused = false; this.speed = 1; this.accumulator = 0; this.simTime = 0;
      this.publicState = hook.state; this.publicState.mode = this.mode; this.publicState.paused = false;
      this.worldRoot = this.add.container(0, 0).setDepth(0);
      this.worldG = this.add.graphics().setDepth(10); this.fxG = this.add.graphics().setDepth(20); this.hudG = this.add.graphics().setDepth(80); this.overlayG = this.add.graphics().setDepth(110);
      this.worldRoot.add(this.worldG); this.worldRoot.add(this.fxG);
      this.textPool = []; this.textCursor = 0; this.buttons = []; this.cardRects = []; this.missionRects = []; this.rosterRects = [];
      this.enemyPool = []; this.shotPool = []; this.partPool = [];
      for (var i = 0; i < MAX_ENEMIES; i++) this.enemyPool.push(makeEnemy());
      for (var s = 0; s < MAX_SHOTS; s++) this.shotPool.push(makeShot());
      for (var p = 0; p < MAX_PARTS; p++) this.partPool.push(makePart());
      this.units = []; this.queue = []; this.paths = []; this.pathSet = {}; this.hazards = [];
      this.selected = null; this.drag = null; this.cursor = { c: 3, r: 4 }; this.cursorDir = 0; this.cardIndex = 0;
      this.transient = null; this.boundary = null; this.coachLife = 0; this.coachText = '';
      this.reducedNotice = false; this.stageScore = 0; this.health = 0; this.wave = 0; this.waveCount = 0; this.playState = 'idle'; this.prep = 0; this.endTimer = 0; this.energy = 0; this.regen = 0; this.leaks = 0; this.leakCap = 0; this.kills = 0; this.activeMap = null; this.boss = false; this.siegeWave = 0;
      this.activeTheatre = EO.THEATRES[0]; this.publicState.health = 0;
      this.layout(this.scale.width || 960, this.scale.height || 540);
      this.scale.on('resize', function (size) { this.layout(size.width, size.height); }, this);
      this.scene.get('EmberlineScene').events.on('shutdown', function () { scene = null; });
      this.rebuildBoardTexture();
      this.enterModeFromHook(true);
      kit.loader.progress(1); kit.loader.hide();
      kit.audio.music('ashfall', 900);
      this.updatePublicState();
    }

    layout(w, h) {
      this.W = Math.max(320, w); this.H = Math.max(240, h);
      var railW = clamp(this.W * 0.29, 226, 286), availW = this.W - railW - 22, boardTop = 72, boardBottom = this.H - 16;
      var tile = Math.max(26, Math.min(availW / EO.COLS, (boardBottom - boardTop) / EO.ROWS));
      var bw = tile * EO.COLS, bh = tile * EO.ROWS;
      this.metrics = { board: { x: Math.max(10, (availW - bw) * 0.5 + 8), y: boardTop + Math.max(0, (boardBottom - boardTop - bh) * 0.5), w: bw, h: bh, tile: tile }, rail: { x: this.W - railW + 6, y: 72, w: railW - 14, h: this.H - 84 }, hudH: 62 };
      if (this.textPool) this.rebuildBoardTexture();
    }

    localPoint(clientX, clientY) {
      var c = this.game.canvas, r = c.getBoundingClientRect();
      return { x: (clientX - r.left) * this.W / r.width, y: (clientY - r.top) * this.H / r.height };
    }

    rebuildBoardTexture() {
      if (!this.metrics || !this.activeMap || !this.textPool) return;
      if (this.textures.exists('eo-board')) this.textures.remove('eo-board');
      var tex = this.textures.createCanvas('eo-board', Math.ceil(this.W), Math.ceil(this.H));
      var c = tex.getContext(), m = this.metrics.board, t = this.activeTheatre, i, j;
      var grad = c.createLinearGradient(0, 0, 0, this.H); grad.addColorStop(0, t.horizon); grad.addColorStop(1, t.ground); c.fillStyle = grad; c.fillRect(0, 0, this.W, this.H);
      var rng = EO.seeded((this.activeMap.seed || 1) + 77);
      c.globalAlpha = 0.18; c.fillStyle = t.accent;
      for (i = 0; i < 34; i++) { var sx = 10 + rng() * (this.W - 300), sy = 72 + rng() * Math.max(20, this.H - 90); c.fillRect(sx, sy, 1 + rng() * 4, 1 + rng() * 2); }
      c.globalAlpha = 1;
      c.fillStyle = 'rgba(2,6,10,.5)'; c.fillRect(m.x - 7, m.y - 7, m.w + 14, m.h + 14);
      c.fillStyle = t.ground; c.fillRect(m.x, m.y, m.w, m.h);
      c.strokeStyle = 'rgba(216,195,140,.18)'; c.lineWidth = 1;
      for (j = 0; j <= EO.ROWS; j++) { c.beginPath(); c.moveTo(m.x, m.y + j * m.tile); c.lineTo(m.x + m.w, m.y + j * m.tile); c.stroke(); }
      for (i = 0; i <= EO.COLS; i++) { c.beginPath(); c.moveTo(m.x + i * m.tile, m.y); c.lineTo(m.x + i * m.tile, m.y + m.h); c.stroke(); }
      var paths = this.paths;
      c.lineCap = 'round'; c.lineJoin = 'round';
      for (i = 0; i < paths.length; i++) {
        c.strokeStyle = t.path; c.lineWidth = m.tile * 0.58; c.beginPath();
        paths[i].forEach(function (cell, n) { var px = m.x + (cell.c + 0.5) * m.tile, py = m.y + (cell.r + 0.5) * m.tile; if (!n) c.moveTo(px, py); else c.lineTo(px, py); }); c.stroke();
        c.strokeStyle = 'rgba(224,163,74,.34)'; c.lineWidth = 2; c.beginPath();
        paths[i].forEach(function (cell, n) { var px = m.x + (cell.c + 0.5) * m.tile, py = m.y + (cell.r + 0.5) * m.tile; if (!n) c.moveTo(px, py); else c.lineTo(px, py); }); c.stroke();
      }
      this.activeMap.elevated.forEach(function (cell) {
        var x = m.x + cell[0] * m.tile + 4, y = m.y + cell[1] * m.tile + 4; c.fillStyle = 'rgba(216,195,140,.16)'; c.fillRect(x, y, m.tile - 8, m.tile - 8); c.strokeStyle = 'rgba(216,195,140,.48)'; c.strokeRect(x, y, m.tile - 8, m.tile - 8); c.strokeStyle = 'rgba(216,195,140,.3)'; c.beginPath(); c.moveTo(x + 4, y + m.tile - 12); c.lineTo(x + m.tile - 12, y + 4); c.stroke();
      });
      /* three landmark families per theatre */
      c.strokeStyle = t.accent; c.globalAlpha = 0.34; c.lineWidth = 2;
      if (this.activeTheatre.life === 'water') { for (i = 0; i < 3; i++) { var wx = m.x + 16 + i * 42; c.beginPath(); c.moveTo(wx, m.y - 16); c.lineTo(wx + 22, m.y - 16); c.lineTo(wx + 34, m.y - 4); c.stroke(); } }
      else if (this.activeTheatre.life === 'sparks') { for (i = 0; i < 3; i++) { var fx = m.x + 16 + i * 48; c.beginPath(); c.moveTo(fx, m.y - 11); c.lineTo(fx + 7, m.y - 26); c.lineTo(fx + 13, m.y - 11); c.stroke(); } }
      else if (this.activeTheatre.life === 'lights') { for (i = 0; i < 3; i++) { var lx = m.x + m.w - 24 - i * 48; c.beginPath(); c.moveTo(lx, m.y + m.h + 3); c.lineTo(lx, m.y + m.h - 18); c.stroke(); c.fillStyle = t.accent; c.globalAlpha = 0.18; c.fillRect(lx - 5, m.y + m.h - 20, 10, 5); c.globalAlpha = 0.34; } }
      else { for (i = 0; i < 3; i++) { var ax = m.x + m.w - 24 - i * 45; c.beginPath(); c.moveTo(ax, m.y + m.h + 2); c.lineTo(ax - 8, m.y + m.h - 18); c.lineTo(ax + 8, m.y + m.h - 18); c.stroke(); } }
      c.globalAlpha = 1; c.strokeStyle = P.coral; c.lineWidth = 3; c.beginPath(); c.moveTo(m.x + m.w * 0.5 - m.tile * 0.42, m.y + m.h + 5); c.lineTo(m.x + m.w * 0.5 + m.tile * 0.42, m.y + m.h + 5); c.stroke();
      tex.refresh();
      if (!this.boardImage) { this.boardImage = this.add.image(0, 0, 'eo-board').setOrigin(0).setDepth(0); this.worldRoot.addAt(this.boardImage, 0); }
      else this.boardImage.setTexture('eo-board');
    }

    text(value, x, y, size, color, originX) {
      var t = this.textPool[this.textCursor];
      if (!t) { t = this.add.text(0, 0, '', { fontFamily: 'Inter,ui-sans-serif,system-ui,sans-serif', resolution: GGKit.hiDpi.dpr(), fontSize: size + 'px', fontStyle: '600', color: color || P.paper, stroke: '#071018', strokeThickness: 3 }); t.setDepth(90); this.textPool.push(t); }
      setText(t, String(value)); t.setFontSize(size); t.setColor(color || P.paper); t.setOrigin(originX == null ? 0 : originX, 0.5); t.setPosition(x, y); t.setVisible(true); this.textCursor++;
      return t;
    }
    beginText() { this.textCursor = 0; for (var i = 0; i < this.textPool.length; i++) this.textPool[i].setVisible(false); }
    button(id, x, y, w, h, label, accent, meta, primary) {
      var b = { id: id, x: x, y: y, w: Math.max(44, w), h: Math.max(44, h), meta: meta, on: true }; this.buttons.push(b);
      var g = this.hudG; g.fillStyle(hex(primary ? '#173b4d' : '#15232f'), 0.96); g.fillRoundedRect(x, y, b.w, b.h, 8); g.lineStyle(1.5, hex(accent || P.slate), 0.9); g.strokeRoundedRect(x, y, b.w, b.h, 8);
      this.text(label, x + b.w * 0.5, y + b.h * 0.5, 14, primary ? P.cyan : P.paper, 0.5); return b;
    }
    chip(value, color, boundary) { this.transient = { value: value, color: color || P.cyan, life: boundary ? 1.8 : 1.0, max: boundary ? 1.8 : 1.0, boundary: !!boundary }; }
    coach(value) { this.coachText = value; this.coachLife = 3.4; }
    syncMusic() { var name = this.activeTheatre.music; kit.audio.music(name, 700); }

    enterModeFromHook(first) {
      var fm = hook.forceMode;
      if (fm === 'play' || fm === 'battle') this.beginMission(clamp(Math.floor(Number(hook.forceStage) || 0), 0, EO.MISSIONS.length - 1), 'campaign');
      else if (fm === 'base') this.enterMode('base');
      else if (fm === 'trials') this.enterMode('trials');
      else if (fm === 'siege') this.enterMode('siege');
      else this.enterMode(first ? 'campaign' : fm || 'campaign');
    }
    enterMode(mode) {
      this.mode = mode; this.runKind = mode; this.drag = null; this.selected = null; this.boundary = null; this.playState = 'idle';
      if (mode === 'campaign') { this.stage = clamp(save.cleared, 0, EO.MISSIONS.length - 1); this.activeMap = null; }
      if (mode === 'base' || mode === 'trials' || mode === 'siege') this.activeMap = null;
      if (mode === 'base') this.selectedRoster = this.selectedRoster || save.unlocked[0];
      this.updatePublicState();
    }

    beginMission(stage, kind, trialIndex) {
      kind = kind || 'campaign';
      this.mode = 'play'; this.runKind = kind; this.stage = stage == null ? 0 : stage; this.trialIndex = trialIndex || 0;
      if (kind === 'campaign') this.activeMap = EO.MISSIONS[clamp(this.stage, 0, EO.MISSIONS.length - 1)];
      else if (kind === 'trial') this.activeMap = EO.MISSIONS[this.trialIndex % EO.MISSIONS.length];
      else this.activeMap = EO.MISSIONS[(this.siegeWave + 7) % EO.MISSIONS.length];
      this.activeTheatre = EO.THEATRES[this.activeMap.theatreIndex];
      this.paths = []; this.pathSet = {};
      for (var p = 0; p < this.activeMap.paths.length; p++) { var cells = EO.expandPath(this.activeMap.paths[p]), path = []; for (var q = 0; q < cells.length; q++) { var cell = { c: cells[q][0], r: cells[q][1] }; path.push(cell); this.pathSet[cell.c + ',' + cell.r] = 1; } this.paths.push(path); }
      this.hazards = this.activeMap.hazards.slice(); this.enemyPool.forEach(function (e) { e.active = false; }); this.shotPool.forEach(function (s) { s.active = false; }); this.partPool.forEach(function (part) { part.active = false; });
      this.units.length = 0; this.queue.length = 0; this.selected = null; this.energy = this.activeMap.energy + save.outpost.relay * 1.2; this.regen = this.activeMap.regen + save.outpost.relay * 0.3; this.leaks = 0; this.leakCap = this.activeMap.leak + save.outpost.deck; this.health = 100; this.wave = 0; this.waveCount = kind === 'siege' ? 5 : this.activeMap.waves; this.kills = 0; this.stageScore = 0; this.siegeWave = kind === 'siege' ? this.siegeWave : 0; this.simTime = 0; this.accumulator = 0; this.prep = 2.4; this.playState = 'prep'; this.endTimer = 0; this.boss = false; this.speed = 1; this.rebuildBoardTexture(); this.syncMusic();
      this.boundary = { title: this.activeMap.name, sub: 'MISSION ' + (kind === 'campaign' ? String(this.stage + 1).padStart(2, '0') : kind === 'trial' ? 'TRIAL ' + (this.trialIndex + 1) : 'SIEGE'), color: this.activeTheatre.accent, life: 1.8, max: 1.8 };
      this.coachLife = save.cleared === 0 && kind === 'campaign' ? 3.4 : 0; this.coachText = 'DRAG A CARD TO A TILE, THEN FLICK TO FACE THE THREAT';
      this.updatePublicState();
    }

    pathCell(c, r) { return !!this.pathSet[c + ',' + r]; }
    cellPoint(c, r) { var m = this.metrics.board; return { x: m.x + (c + 0.5) * m.tile, y: m.y + (r + 0.5) * m.tile }; }
    cellAt(x, y) { var m = this.metrics.board, c = Math.floor((x - m.x) / m.tile), r = Math.floor((y - m.y) / m.tile); return c >= 0 && c < EO.COLS && r >= 0 && r < EO.ROWS ? { c: c, r: r } : null; }
    unitAt(c, r) { for (var i = 0; i < this.units.length; i++) if (this.units[i].c === c && this.units[i].r === r) return this.units[i]; return null; }
    elevated(c, r) { return this.activeMap && this.activeMap.elevated.some(function (a) { return a[0] === c && a[1] === r; }); }
    buildable(c, r) { return c >= 0 && r >= 0 && c < EO.COLS && r < EO.ROWS && !this.pathCell(c, r) && !this.unitAt(c, r); }
    operatorStats(op) { var p = save.promotions[op.id] || 0, hp = op.hp * (1 + p * 0.18), dmg = op.dmg * (1 + p * 0.12), range = op.range + (p >= 3 ? 1 : 0); return { hp: Math.round(hp), dmg: dmg, range: range, promotion: p }; }
    facingDefault(c, r) { for (var d = 0; d < 4; d++) for (var k = 1; k < 4; k++) if (this.pathCell(c + EO.DIRS[d][0] * k, r + EO.DIRS[d][1] * k)) return d; return 2; }
    dirFrom(dx, dy) { return Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 1 : 3 : dy > 0 ? 2 : 0; }
    rotateOffset(f, s, dir) { if (dir === 0) return [s, -f]; if (dir === 1) return [f, s]; if (dir === 2) return [-s, f]; return [-f, -s]; }
    previewCells(op, c, r, dir) { var out = []; for (var i = 0; i < op.fp.length; i++) { var a = this.rotateOffset(op.fp[i][0], op.fp[i][1], dir), cc = c + a[0], rr = r + a[1]; if (cc >= 0 && rr >= 0 && cc < EO.COLS && rr < EO.ROWS) out.push({ c: cc, r: rr }); } return out; }

    deploy(id, c, r, dir) {
      var op = EO.OP_BY_ID[id];
      if (!op || save.unlocked.indexOf(id) < 0 || !this.buildable(c, r) || this.energy < op.cost || this.units.length >= 12) { kit.audio.sfx('cancel', { volume: 0.6 }); this.chip('NO DEPLOY', P.coral); return false; }
      var st = this.operatorStats(op), u = { op: op, c: c, r: r, dir: dir & 3, hp: st.hp, maxHp: st.hp, dmg: st.dmg, range: st.range, cd: 0, skills: [0, 0], brace: 0, shield: 0, riposte: 0, flash: 0, phase: Math.random() * TAU, attackPulse: 0, state: 'command', born: 0.35, downed: false, elevated: this.elevated(c, r) };
      this.energy -= op.cost; this.units.push(u); this.selected = u; this.coachLife = 0; this.chip(op.name + ' ONLINE', op.col); kit.audio.sfx('place', { volume: 0.85 }); this.emitParts(this.cellPoint(c, r).x, this.cellPoint(c, r).y, op.col, 8, 'debris'); kit.juice.shake(2, 90); return true;
    }
    recycle(u) { var i = this.units.indexOf(u); if (i < 0) return; this.energy += Math.floor(u.op.cost * 0.5); this.units.splice(i, 1); this.selected = null; kit.audio.sfx('cancel', { volume: 0.5 }); this.chip('KIT RECOVERED', P.bone); }

    pointerDown(id, p) {
      if (this.mode === 'play') {
        if (this.hit({ x: this.W - 56, y: 8, w: 48, h: 48 }, p.x, p.y)) { this.togglePause(); return; }
        if (this.hit({ x: this.W - 112, y: 8, w: 48, h: 48 }, p.x, p.y)) { this.speed = this.speed === 1 ? 2 : 1; kit.audio.sfx('confirm', { volume: 0.5 }); return; }
        if (this.handleButtons(p)) return;
        if (this.playState !== 'play' && this.playState !== 'prep') return;
        for (var i = 0; i < this.cardRects.length; i++) if (this.hit(this.cardRects[i], p.x, p.y)) { var card = this.cardRects[i]; this.drag = { id: id, card: card.index, x: p.x, y: p.y, cell: null, dir: 0, startX: p.x, startY: p.y }; this.selected = null; kit.audio.sfx('select', { volume: 0.6 }); return; }
        var cell = this.cellAt(p.x, p.y);
        if (cell) { var u = this.unitAt(cell.c, cell.r); this.selected = u || null; if (u) kit.audio.sfx('select', { volume: 0.55 }); }
      } else if (this.handleButtons(p)) return;
      if (this.mode === 'campaign') for (var m = 0; m < this.missionRects.length; m++) if (this.hit(this.missionRects[m], p.x, p.y) && this.missionRects[m].open) { this.beginMission(this.missionRects[m].stage, 'campaign'); return; }
      if (this.mode === 'base') {
        for (var r = 0; r < this.rosterRects.length; r++) if (this.hit(this.rosterRects[r], p.x, p.y)) { this.selectedRoster = this.rosterRects[r].id; kit.audio.sfx('select', { volume: 0.55 }); return; }
      }
    }
    pointerMove(id, p) {
      if (!this.drag || this.drag.id !== id || this.mode !== 'play') return;
      this.drag.x = p.x; this.drag.y = p.y; var cell = this.cellAt(p.x, p.y);
      if (!cell) { this.drag.cell = null; return; }
      if (!this.drag.cell || cell.c !== this.drag.cell.c || cell.r !== this.drag.cell.r) { this.drag.cell = cell; this.drag.dir = this.facingDefault(cell.c, cell.r); }
      var cp = this.cellPoint(cell.c, cell.r), dx = p.x - cp.x, dy = p.y - cp.y;
      if (dx * dx + dy * dy > this.metrics.board.tile * this.metrics.board.tile * 0.07) this.drag.dir = this.dirFrom(dx, dy);
    }
    pointerUp(id, p) {
      var d = this.drag; if (!d || d.id !== id) return;
      if (p && d.cell && this.mode === 'play' && !this.kitPaused) { var ids = this.loadout(); if (ids[d.card]) this.deploy(ids[d.card], d.cell.c, d.cell.r, d.dir); }
      this.drag = null;
    }
    pausedPointerDown(p) { if (this.mode !== 'play') return; if (this.hit({ x: this.W * 0.5 - 106, y: this.H * 0.52, w: 212, h: 48 }, p.x, p.y)) this.togglePause(); else if (this.hit({ x: this.W * 0.5 - 106, y: this.H * 0.52 + 58, w: 212, h: 48 }, p.x, p.y)) { this.manualPaused = false; kit.resume('manual'); this.enterMode('campaign'); } }
    hit(b, x, y) { return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; }
    handleButtons(p) {
      for (var i = this.buttons.length - 1; i >= 0; i--) { var b = this.buttons[i]; if (this.hit(b, p.x, p.y)) { this.activateButton(b); return true; } }
      return false;
    }
    activateButton(b) {
      if (b.id === 'base') { kit.audio.sfx('move', { volume: 0.5 }); this.enterMode('base'); }
      else if (b.id === 'campaign') this.enterMode('campaign');
      else if (b.id === 'trials') this.enterMode('trials');
      else if (b.id === 'siege') this.enterMode('siege');
      else if (b.id === 'deploy') this.beginMission(b.meta, 'campaign');
      else if (b.id === 'trial') this.beginMission(-1, 'trial', b.meta);
      else if (b.id === 'startSiege') this.beginMission(-1, 'siege');
      else if (b.id === 'again') this.beginMission(this.stage, this.runKind, this.trialIndex);
      else if (b.id === 'next') this.beginMission(Math.min(this.stage + 1, EO.MISSIONS.length - 1), 'campaign');
      else if (b.id === 'skillA' && this.selected) this.activateSkill(this.selected, 0);
      else if (b.id === 'skillB' && this.selected) this.activateSkill(this.selected, 1);
      else if (b.id === 'recycle' && this.selected) this.recycle(this.selected);
      else if (b.id === 'upgrade') this.upgradeFacility(b.meta);
      else if (b.id === 'promote') this.promote(b.meta);
    }
    togglePause() { if (this.mode !== 'play') return; if (this.kitPaused && this.manualPaused) { this.manualPaused = false; kit.resume('manual'); } else if (!this.kitPaused) { this.manualPaused = true; kit.pause('manual'); } }
    primaryAction() { if (this.mode === 'campaign') this.beginMission(clamp(save.cleared, 0, EO.MISSIONS.length - 1), 'campaign'); else if (this.mode === 'trials') this.beginMission(-1, 'trial', 0); else if (this.mode === 'siege') this.beginMission(-1, 'siege'); else if (this.mode === 'result') this.beginMission(this.stage, this.runKind, this.trialIndex); }
    moveCursor(k) { if (k === 'ArrowUp') this.cursor.r = clamp(this.cursor.r - 1, 0, EO.ROWS - 1); if (k === 'ArrowDown') this.cursor.r = clamp(this.cursor.r + 1, 0, EO.ROWS - 1); if (k === 'ArrowLeft') this.cursor.c = clamp(this.cursor.c - 1, 0, EO.COLS - 1); if (k === 'ArrowRight') this.cursor.c = clamp(this.cursor.c + 1, 0, EO.COLS - 1); }
    cycleCard(delta) { var l = this.loadout(); if (!l.length) return; this.cardIndex = (this.cardIndex + delta + l.length) % l.length; kit.audio.sfx('select', { volume: 0.4 }); }
    keyboardDeploy() { var l = this.loadout(), id = l[this.cardIndex]; if (id) this.deploy(id, this.cursor.c, this.cursor.r, this.cursorDir); }
    loadout() { var slots = clamp(4 + save.outpost.deck, 4, 6); return save.loadout.slice(0, slots).filter(function (id) { return EO.OP_BY_ID[id] && save.unlocked.indexOf(id) >= 0; }); }

    startWave() {
      var waves = EO.buildWaves(this.activeMap, this.runKind === 'siege', this.runKind === 'trial'), w = waves[this.wave] || waves[waves.length - 1]; this.queue.length = 0;
      for (var i = 0; i < w.groups.length; i++) for (var n = 0; n < w.groups[i].count; n++) this.queue.push({ t: w.groups[i].delay + n * w.groups[i].gap, type: w.groups[i].type, path: w.groups[i].path });
      this.queue.sort(function (a, b) { return a.t - b.t; }); this.playState = 'wave'; this.boss = this.activeMap.boss && this.wave === this.waveCount - 1; if (this.boss) kit.audio.music(this.activeTheatre.danger, 650); this.chip('WAVE ' + (this.wave + 1) + ' / ' + this.waveCount, this.boss ? P.coral : this.activeTheatre.accent); kit.audio.sfx('warning', { volume: 0.5 });
    }
    spawnEnemy(type, pathIndex) {
      var base = EO.ENEMIES[type], e = null, i;
      for (i = 0; i < this.enemyPool.length; i++) if (!this.enemyPool[i].active) { e = this.enemyPool[i]; break; }
      if (!e || !base) return;
      var scale = 1 + (this.stage >= 0 ? this.stage * 0.035 : this.siegeWave * 0.06), pth = this.paths[clamp(pathIndex | 0, 0, this.paths.length - 1)];
      e.active = true; e.type = type; e.def = base; e.path = pth; e.pathIndex = pathIndex; e.seg = 0; e.u = 0; e.air = !!base.air; e.dead = false; e.hp = Math.round(base.hp * scale); e.maxHp = e.hp; e.slow = 0; e.stun = 0; e.root = 0; e.burn = 0; e.burnT = 0; e.oil = 0; e.atk = 0.3; e.target = null; e.flash = 0; e.phase = (i + 1) * 0.8; e.threat = base.threat; e.hitPulse = 0; e.blocks = base.blocks; e.r = base.r; e.marked = 0;
      if (e.air) { e.x = this.metrics.board.x + this.metrics.board.w * (0.12 + (i % 5) * 0.18); e.y = this.metrics.board.y - 20 - (i % 3) * 15; e.gx = this.metrics.board.x + (this.paths[0][this.paths[0].length - 1].c + 0.5) * this.metrics.board.tile; e.gy = this.metrics.board.y + this.metrics.board.h + 2; } else { e.x = this.metrics.board.x + (pth[0].c + 0.5) * this.metrics.board.tile; e.y = this.metrics.board.y - this.metrics.board.tile * 0.5; }
    }
    findTarget(e) {
      if (e.air) return null;
      var near = e.path[Math.min(e.seg + (e.u > 0.55 ? 1 : 0), e.path.length - 1)], choice = null, best = 99;
      for (var i = 0; i < this.units.length; i++) { var u = this.units[i]; if (u.downed || u.hp <= 0) continue; var d = Math.abs(u.c - near.c) + Math.abs(u.r - near.r); if (d <= 1 && d < best) { choice = u; best = d; } }
      return choice;
    }
    enemyHit(e, amount, color, crit) {
      if (!e.active || e.dead) return; var armor = e.def.armor * (e.oil > 0 ? 0.5 : 1), dmg = Math.max(1, amount - armor); if (e.marked > 0) dmg *= 1.2; e.hp -= dmg; e.flash = 0.1; e.hitPulse = 0.25; this.emitParts(e.x, e.y, color || P.paper, crit ? 6 : 3, 'contact'); kit.audio.sfx('hit', { volume: crit ? 0.7 : 0.35 }); if (e.hp <= 0) this.killEnemy(e); }
    killEnemy(e) {
      if (!e.active || e.dead) return; e.dead = true; e.active = false; this.kills++; this.stageScore += e.def.kind === 'boss' ? 1600 : Math.round(e.maxHp * 2); this.energy = clamp(this.energy + (1.4 + e.maxHp / 34) * (1 + save.outpost.smelter * 0.12), 0, 999); this.emitParts(e.x, e.y, e.def.col, e.def.kind === 'boss' ? 18 : 8, e.def.kind === 'boss' ? 'reward' : 'debris'); kit.audio.sfx(e.def.kind === 'boss' ? 'victory' : 'kill', { volume: e.def.kind === 'boss' ? 0.9 : 0.55 }); kit.juice.hitStop(e.def.kind === 'boss' ? 110 : 55); if (e.def.kind === 'boss') { kit.juice.shake(8, 210); this.chip('BOSS CORE BROKEN', P.teal); } }
    leak(e) { if (!e.active) return; e.active = false; this.leaks += e.def.leak; this.health = clamp(100 - this.leaks * (100 / Math.max(1, this.leakCap)), 0, 100); this.stageScore = Math.max(0, this.stageScore - e.def.leak * 80); this.emitParts(e.x, e.y, P.coral, 9, 'contact'); kit.audio.sfx('warning', { volume: 0.75 }); kit.juice.shake(5, 150); this.chip('CORE -' + e.def.leak, P.coral); if (this.leaks >= this.leakCap) this.loseMission(); }
    updateSpawner(dt) {
      if (this.playState === 'prep') { this.prep -= dt; if (this.prep <= 0) this.startWave(); return; }
      if (this.playState !== 'wave') return;
      for (var i = 0; i < this.queue.length; i++) this.queue[i].t -= dt;
      while (this.queue.length && this.queue[0].t <= 0) { var q = this.queue.shift(); this.spawnEnemy(q.type, q.path); }
      if (!this.queue.length && !this.enemyPool.some(function (e) { return e.active; })) { this.wave++; if (this.wave >= this.waveCount) this.winMission(); else { this.playState = 'prep'; this.prep = 2.1; this.energy = clamp(this.energy + 6, 0, 999); this.chip('WAVE CLEAR +6', P.teal); kit.audio.sfx('wave', { volume: 0.75 }); if (this.wave < this.waveCount - 1) this.syncMusic(); } }
    }
    updateEnemies(dt) {
      var m = this.metrics.board, i, e;
      for (i = 0; i < this.enemyPool.length; i++) {
        e = this.enemyPool[i]; if (!e.active) continue; e.flash = Math.max(0, e.flash - dt); e.hitPulse = Math.max(0, e.hitPulse - dt); e.slow = Math.max(0, e.slow - dt); e.stun = Math.max(0, e.stun - dt); e.root = Math.max(0, e.root - dt); e.oil = Math.max(0, e.oil - dt); e.marked = Math.max(0, e.marked - dt);
        if (e.burnT > 0) { e.burnT -= dt; e.hp -= e.burn * dt; if (e.hp <= 0) { this.killEnemy(e); continue; } }
        if (e.stun > 0) continue;
        var slow = e.slow > 0 ? 0.55 : 1, haste = this.runKind === 'trial' && EO.TRIALS[this.trialIndex].modifier === 'rush' ? 1.25 : 1;
        if (e.air) { var dx = e.gx - e.x, dy = e.gy - e.y, dd = Math.max(1, Math.sqrt(dx * dx + dy * dy)); e.phase += dt * 3; e.x += dx / dd * e.def.spd * m.tile * slow * haste * dt + Math.cos(e.phase) * 14 * dt; e.y += dy / dd * e.def.spd * m.tile * slow * haste * dt; e.prog = 1 - dd / 600; if (dd < m.tile * 0.5) this.leak(e); continue; }
        if (!e.target || e.target.hp <= 0 || this.units.indexOf(e.target) < 0) e.target = this.findTarget(e);
        if (e.target && e.def.dmg > 0) { e.atk -= dt; e.threat = e.atk < 0.45 ? Math.min(5, e.def.threat + 1) : e.def.threat; if (e.atk <= 0) { e.atk = 1 / e.def.arate; this.hurtUnit(e.target, e.def.dmg * (1 + (this.stage >= 0 ? this.stage * 0.035 : 0)), e); } continue; }
        if (e.root > 0) continue;
        var move = e.def.spd * m.tile * slow * haste * dt;
        while (move > 0 && e.seg < e.path.length - 1) { var need = (1 - e.u) * m.tile; if (move >= need) { move -= need; e.seg++; e.u = 0; } else { e.u += move / m.tile; move = 0; } }
        if (e.seg >= e.path.length - 1) { this.leak(e); continue; }
        var a = e.path[e.seg], b = e.path[e.seg + 1]; e.x = m.x + (a.c + 0.5 + (b.c - a.c) * e.u) * m.tile; e.y = m.y + (a.r + 0.5 + (b.r - a.r) * e.u) * m.tile; e.prog = (e.seg + e.u) / e.path.length;
      }
    }
    hurtUnit(u, amount, e) { var mul = 1; if (u.brace > 0) mul *= 0.4; if (u.shield > 0) mul *= 0.55; if (u.riposte > 0) { this.enemyHit(e, u.dmg * 2, u.op.col, true); u.riposte = 0; } u.hp -= amount * mul; u.flash = 0.15; e.hitPulse = 0.3; this.emitParts(this.cellPoint(u.c, u.r).x, this.cellPoint(u.c, u.r).y, P.coral, 3, 'contact'); kit.audio.sfx('attack', { volume: 0.45 }); if (u.hp <= 0) { u.hp = 0; u.downed = true; this.emitParts(this.cellPoint(u.c, u.r).x, this.cellPoint(u.c, u.r).y, u.op.col, 10, 'debris'); this.chip(u.op.name + ' DOWN', P.coral); } }
    targets(u) {
      var out = [], cells = this.previewCells(u.op, u.c, u.r, u.dir), elevated = u.elevated || (this.runKind === 'trial' && EO.TRIALS[this.trialIndex].modifier === 'high');
      for (var i = 0; i < this.enemyPool.length; i++) { var e = this.enemyPool[i]; if (!e.active || e.dead) continue; if (u.op.target === 'g' && e.air) continue; if (u.op.target === 'a' && !e.air) continue; var ok = false; for (var j = 0; j < cells.length; j++) { var c = cells[j], d = e.air ? dist(e.x, e.y, this.cellPoint(c.c, c.r).x, this.cellPoint(c.c, c.r).y) : Math.abs(c.c - (e.path[e.seg] ? e.path[e.seg].c : -99)) + Math.abs(c.r - (e.path[e.seg] ? e.path[e.seg].r : -99)); if (d <= (e.air ? this.metrics.board.tile * 0.8 : 1.2)) { ok = true; break; } } if (ok) out.push(e); }
      out.sort(function (a, b) { return b.prog - a.prog; }); if (elevated) u.rangeBoost = true; return out;
    }
    updateUnits(dt) {
      for (var i = this.units.length - 1; i >= 0; i--) {
        var u = this.units[i], op = u.op;
        u.phase += dt; u.flash = Math.max(0, u.flash - dt); u.born = Math.max(0, u.born - dt);
        u.brace = Math.max(0, u.brace - dt); u.shield = Math.max(0, u.shield - dt); u.riposte = Math.max(0, u.riposte - dt);
        u.attackPulse = Math.max(0, u.attackPulse - dt); u.skills[0] = Math.max(0, u.skills[0] - dt); u.skills[1] = Math.max(0, u.skills[1] - dt);
        if (u.downed) continue;
        if (op.id === 'scout') this.energy = clamp(this.energy + 0.45 * dt, 0, 999);
        if (op.id === 'relay') this.energy = clamp(this.energy + 0.18 * dt, 0, 999);
        u.cd -= dt;
        if (op.id === 'medic' || op.id === 'relay') { if (u.cd <= 0) { u.cd = 1 / op.rate; this.healNearby(u, op.id === 'relay' ? 8 : 14); } continue; }
        if (u.cd > 0) continue;
        var tg = this.targets(u); if (!tg.length) { u.cd = 0.08; continue; }
        u.cd = 1 / op.rate; u.attackPulse = 0.16; this.fire(u, tg);
      }
    }
    healNearby(u, amount) { for (var i = 0; i < this.units.length; i++) { var a = this.units[i]; if (!a.downed && Math.abs(a.c - u.c) <= 2 && Math.abs(a.r - u.r) <= 2 && a.hp < a.maxHp) { a.hp = Math.min(a.maxHp, a.hp + amount); this.emitParts(this.cellPoint(a.c, a.r).x, this.cellPoint(a.c, a.r).y - 8, P.teal, 2, 'reward'); } } }
    fire(u, tg) {
      var op = u.op, first = tg[0], p = this.cellPoint(u.c, u.r), i;
      if (op.kind === 'shield' || op.kind === 'spear' || op.kind === 'rail' || op.kind === 'anchor' || op.kind === 'runner') { this.enemyHit(first, u.dmg, op.col); this.shot(p.x, p.y, first.x, first.y, op.col, 1); }
      else if (op.kind === 'lob' || op.kind === 'mine') { var r = this.metrics.board.tile * 0.9; for (i = 0; i < tg.length; i++) if (dist(tg[i].x, tg[i].y, first.x, first.y) <= r) this.enemyHit(tg[i], u.dmg, op.col); this.shot(p.x, p.y, first.x, first.y, op.col, 2); this.emitParts(first.x, first.y, P.amber, 5, 'contact'); }
      else if (op.kind === 'coil') { for (i = 0; i < Math.min(3, tg.length); i++) { this.enemyHit(tg[i], u.dmg, op.col); this.shot(i ? tg[i - 1].x : p.x, i ? tg[i - 1].y : p.y, tg[i].x, tg[i].y, op.col, 3); } }
      else if (op.kind === 'slick') { for (i = 0; i < tg.length; i++) { this.enemyHit(tg[i], u.dmg, op.col); tg[i].slow = 1.2; tg[i].oil = 4; } }
      else if (op.kind === 'bulwark') { for (i = 0; i < tg.length; i++) { this.enemyHit(tg[i], u.dmg, op.col); if (!tg[i].air) { tg[i].u = Math.max(0, tg[i].u - 0.3); } } this.shot(p.x, p.y, first.x, first.y, op.col, 1); }
      kit.audio.sfx('attack', { volume: 0.25 });
    }
    shot(x, y, tx, ty, color, kind) { for (var i = 0; i < this.shotPool.length; i++) if (!this.shotPool[i].active) { var s = this.shotPool[i]; s.active = true; s.x = x; s.y = y; s.tx = tx; s.ty = ty; s.life = s.max = kind === 3 ? 0.2 : 0.14; s.color = color; s.kind = kind; return; } }
    activateSkill(u, index) {
      if (!u || u.downed || u.skills[index] > 0) { kit.audio.sfx('cancel', { volume: 0.5 }); return false; }
      var skill = u.op.skills[index], tg = this.targets(u), i; u.skills[index] = skill.cd * (1 - save.outpost.relay * 0.05); this.selected = u; this.chip(skill.name, u.op.col); kit.audio.sfx('skill', { volume: 0.8 }); kit.juice.hitStop(65); this.emitParts(this.cellPoint(u.c, u.r).x, this.cellPoint(u.c, u.r).y, u.op.col, 12, 'reward');
      switch (skill.kind) {
        case 'brace': u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.4); u.brace = 4; break;
        case 'lock': u.blocks = 3; u.brace = 4; break;
        case 'lunge': for (i = 0; i < tg.length; i++) this.enemyHit(tg[i], u.dmg * 3, u.op.col, true); break;
        case 'riposte': u.riposte = 5; break;
        case 'barrage': for (i = 0; i < Math.min(4, tg.length); i++) this.enemyHit(tg[i], u.dmg * 1.6, u.op.col, true); break;
        case 'meteor': if (tg.length) { var top = tg[0]; for (i = 0; i < this.enemyPool.length; i++) if (this.enemyPool[i].active && dist(this.enemyPool[i].x, this.enemyPool[i].y, top.x, top.y) < this.metrics.board.tile * 1.5) this.enemyHit(this.enemyPool[i], u.dmg * 2, u.op.col, true); } break;
        case 'overload': for (i = 0; i < tg.length; i++) { tg[i].stun = 1.6; this.enemyHit(tg[i], u.dmg * 1.5, u.op.col, true); } break;
        case 'chain': for (i = 0; i < Math.min(3, tg.length); i++) { tg[i].stun = 0.7; this.enemyHit(tg[i], u.dmg * 1.8, u.op.col, true); } break;
        case 'surge': for (i = 0; i < this.units.length; i++) if (!this.units[i].downed) this.units[i].hp = Math.min(this.units[i].maxHp, this.units[i].hp + this.units[i].maxHp * 0.35); break;
        case 'purge': for (i = 0; i < this.units.length; i++) { this.units[i].hp = Math.min(this.units[i].maxHp, this.units[i].hp + 22); this.units[i].downed = false; } break;
        case 'railshot': for (i = 0; i < tg.length; i++) this.enemyHit(tg[i], u.dmg * 4, u.op.col, true); break;
        case 'mark': if (tg.length) tg[0].marked = 5; break;
        case 'ignite': for (i = 0; i < this.enemyPool.length; i++) if (this.enemyPool[i].active && this.enemyPool[i].oil > 0) { this.enemyPool[i].burn = 14; this.enemyPool[i].burnT = 3; } break;
        case 'slip': for (i = 0; i < this.enemyPool.length; i++) if (this.enemyPool[i].active && this.enemyPool[i].oil > 0) this.enemyPool[i].slow = 4; break;
        case 'bulwark': for (i = 0; i < this.units.length; i++) this.units[i].shield = 5; break;
        case 'shove': for (i = 0; i < tg.length; i++) if (!tg[i].air) tg[i].u = Math.max(0, tg[i].u - 0.7); break;
        case 'scan': this.energy = clamp(this.energy + 16, 0, 999); break;
        case 'decoy': for (i = 0; i < this.enemyPool.length; i++) if (this.enemyPool[i].active && !this.enemyPool[i].air) this.enemyPool[i].target = u; break;
        case 'root': for (i = 0; i < tg.length; i++) if (!tg[i].air) tg[i].root = 2.6; break;
        case 'draw': for (i = 0; i < this.enemyPool.length; i++) if (this.enemyPool[i].active && !this.enemyPool[i].air) this.enemyPool[i].target = u; break;
        case 'overcharge': for (i = 0; i < this.units.length; i++) { this.units[i].skills[0] *= 0.45; this.units[i].skills[1] *= 0.45; } break;
        case 'lifeline': for (i = 0; i < this.units.length; i++) { this.units[i].downed = false; this.units[i].hp = Math.max(this.units[i].hp, this.units[i].maxHp * 0.3); } break;
        case 'tripwire': for (i = 0; i < this.enemyPool.length; i++) if (this.enemyPool[i].active && !this.enemyPool[i].air) { this.enemyPool[i].stun = 1; this.enemyHit(this.enemyPool[i], u.dmg * 1.7, u.op.col, true); } break;
        case 'breach': tg.sort(function (a, b) { return b.maxHp - a.maxHp; }); if (tg[0]) this.enemyHit(tg[0], u.dmg * 4, u.op.col, true); break;
      }
      return true;
    }
    updateShotsParts(dt) {
      var i, s, p;
      for (i = 0; i < this.shotPool.length; i++) { s = this.shotPool[i]; if (s.active) { s.life -= dt; if (s.life <= 0) s.active = false; } }
      for (i = 0; i < this.partPool.length; i++) { p = this.partPool[i]; if (!p.active) continue; p.life -= dt; if (p.life <= 0) { p.active = false; continue; } p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.gravity * dt; p.rot += dt * 5; }
      if (this.transient) { this.transient.life -= dt; if (this.transient.life <= 0) this.transient = null; }
      if (this.boundary) { this.boundary.life -= dt; if (this.boundary.life <= 0) this.boundary = null; }
      if (this.coachLife > 0) this.coachLife -= dt;
      for (i = 0; i < this.hazards.length; i++) this.hazards[i].phase += dt;
    }
    emitParts(x, y, color, count, system) { var made = 0; for (var i = 0; i < this.partPool.length && made < Math.min(count, 20); i++) if (!this.partPool[i].active) { var p = this.partPool[i], a = Math.random() * TAU, sp = 35 + Math.random() * 115; p.active = true; p.x = x; p.y = y; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - 24; p.life = p.max = 0.28 + Math.random() * 0.34; p.color = color; p.size = system === 'reward' ? 4 : system === 'trail' ? 2 : 3; p.system = system || 'contact'; p.gravity = system === 'debris' ? 65 : -8; made++; } }

    winMission() {
      if (this.playState === 'won' || this.playState === 'lost') return; this.playState = 'won'; this.health = clamp(100 - this.leaks * (100 / Math.max(1, this.leakCap)), 0, 100); this.stageScore += Math.round(this.health * 10) + this.kills * 12; var stars = this.health >= 80 ? 3 : this.health >= 48 ? 2 : 1;
      if (this.runKind === 'campaign') { var first = !save.stars[this.stage]; save.stars[this.stage] = Math.max(save.stars[this.stage] || 0, stars); save.cleared = Math.max(save.cleared, this.stage + 1); var reward = EO.MISSIONS[this.stage].reward; var mult = 1 + save.outpost.smelter * 0.25; save.mats.scrap += Math.round(reward.scrap * mult); save.mats.ember += Math.round(reward.ember * mult); save.mats.alloy += Math.round(reward.alloy * mult); if (first && EO.UNLOCKS[this.stage]) EO.UNLOCKS[this.stage].forEach(function (id) { if (save.unlocked.indexOf(id) < 0) { save.unlocked.push(id); if (save.loadout.length < 6) save.loadout.push(id); } }); kit.save.set(save); }
      else if (this.runKind === 'trial') { save.trials[String(this.trialIndex)] = Math.max(save.trials[String(this.trialIndex)] || 0, stars); kit.save.set(save); }
      else { save.siegeBest = Math.max(save.siegeBest, this.stageScore); kit.save.set(save); }
      this.endTimer = 0; this.boundary = { title: this.runKind === 'siege' ? 'SIEGE RECORD' : 'LINE HOLDS', sub: stars + ' STAR CLEAR', color: P.teal, life: 1.6, max: 1.6 }; kit.audio.sfx('victory', { volume: 0.9 }); kit.juice.shake(6, 180);
    }
    loseMission() { if (this.playState === 'lost' || this.playState === 'won') return; this.playState = 'lost'; this.endTimer = 0; this.boundary = { title: 'CORE BREACH', sub: 'THE LINE GAVE WAY', color: P.coral, life: 1.6, max: 1.6 }; kit.audio.sfx('warning', { volume: 0.9 }); }
    promote(id) { var op = EO.OP_BY_ID[id], level = save.promotions[id] || 0, costs = [{ scrap: 26, ember: 8, alloy: 0 }, { scrap: 44, ember: 14, alloy: 6 }, { scrap: 68, ember: 22, alloy: 12 }], c = costs[level]; if (!op || save.unlocked.indexOf(id) < 0 || level >= 3 || !c || save.mats.scrap < c.scrap || save.mats.ember < c.ember || save.mats.alloy < c.alloy) { kit.audio.sfx('cancel', { volume: 0.55 }); return; } save.mats.scrap -= c.scrap; save.mats.ember -= c.ember; save.mats.alloy -= c.alloy; save.promotions[id] = level + 1; kit.save.set(save); kit.audio.sfx('promote', { volume: 0.85 }); this.chip(op.name + ' PROMOTED', P.teal); }
    upgradeFacility(id) { var level = save.outpost[id] || 0, costs = { smelter: [{ scrap: 34, ember: 0, alloy: 0 }, { scrap: 58, ember: 8, alloy: 0 }, { scrap: 86, ember: 16, alloy: 6 }], relay: [{ scrap: 28, ember: 6, alloy: 0 }, { scrap: 46, ember: 12, alloy: 4 }, { scrap: 70, ember: 18, alloy: 10 }], deck: [{ scrap: 42, ember: 10, alloy: 2 }, { scrap: 68, ember: 18, alloy: 8 }] }, c = costs[id] && costs[id][level]; if (!c || save.mats.scrap < c.scrap || save.mats.ember < c.ember || save.mats.alloy < c.alloy) { kit.audio.sfx('cancel', { volume: 0.5 }); return; } save.mats.scrap -= c.scrap; save.mats.ember -= c.ember; save.mats.alloy -= c.alloy; save.outpost[id] = level + 1; kit.save.set(save); kit.audio.sfx('confirm', { volume: 0.8 }); this.chip(id.toUpperCase() + ' UPGRADED', P.teal); }

    step() {
      if (this.mode !== 'play' || this.kitPaused) return;
      var dt = STEP; this.simTime += dt; if (this.playState === 'prep' || this.playState === 'wave') { this.energy = clamp(this.energy + this.regen * dt, 0, 999); this.updateSpawner(dt * this.speed); this.updateEnemies(dt * this.speed); this.updateUnits(dt * this.speed); this.updateShotsParts(dt); } else { this.updateShotsParts(dt); if (this.playState === 'won' || this.playState === 'lost') { this.endTimer += dt; if (this.endTimer > 1.35) this.mode = 'result'; } }
      if (this.mode === 'play' && this.playState === 'wave') { for (var h = 0; h < this.hazards.length; h++) { var z = this.hazards[h]; if (Math.floor(z.phase * 2) % 5 === 0 && z.type === 'vent') for (var u = 0; u < this.units.length; u++) if (this.units[u].c === z.c && this.units[u].r === z.r) this.units[u].hp -= dt * 2; } }
    }
    syncHook() { var forced = hook.forceMode, fs = Number(hook.forceStage); if (forced === 'play' || forced === 'battle') { if (this.mode !== 'play' || (Number.isFinite(fs) && fs !== this.stage && this.runKind === 'campaign')) this.beginMission(clamp(Math.floor(fs || 0), 0, EO.MISSIONS.length - 1), 'campaign'); } else if (forced && forced !== this.mode && ['campaign', 'base', 'trials', 'siege'].indexOf(forced) >= 0) this.enterMode(forced); }
    updatePublicState() { var total = 0, got = 0; for (var i = 0; i < save.stars.length; i++) { total += 3; got += save.stars[i] || 0; } this.publicState.mode = this.mode; this.publicState.progress = total ? got / total : 0; this.publicState.score = this.stageScore || 0; this.publicState.health = this.mode === 'play' ? Math.round(this.health) : 100; this.publicState.currentStage = this.stage + 1; this.publicState.wave = this.wave + 1; this.publicState.waveCount = this.waveCount; this.publicState.energy = Math.floor(this.energy || 0); this.publicState.kills = this.kills; this.publicState.unlocked = save.unlocked.length; this.publicState.stars = got; this.publicState.paused = !!this.kitPaused; this.publicState.stage = this.stage; this.publicState.forceMode = hook.forceMode; this.publicState.forceStage = hook.forceStage; hook.state = this.publicState; }
    update(time, delta) {
      this.syncHook();
      if (this.kitPaused) { this.render(); this.updatePublicState(); return; }
      var elapsed = clamp((Number(delta) || 0) / 1000, 0, 0.1); this.accumulator += elapsed; var steps = 0;
      while (this.accumulator >= STEP && steps < MAX_STEPS) { this.step(); this.accumulator -= STEP; steps++; }
      if (steps >= MAX_STEPS && this.accumulator >= STEP) this.accumulator = 0;
      this.render(); this.updatePublicState();
    }

    drawUnit(g, u) {
      var m = this.metrics.board, pt = this.cellPoint(u.c, u.r), op = u.op, r = m.tile * 0.29, col = u.flash > 0 ? P.white : op.col, ang = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5][u.dir], bob = u.born > 0 ? 1 - u.born / 0.35 : 1, pulse = 1 + Math.sin(this.simTime * 4 + u.phase) * 0.04;
      if (this.selected === u) { ring(g, pt.x, pt.y, r + 9 + Math.sin(this.simTime * 5) * 1.5, 24, P.white, 0.9); var cells = this.previewCells(op, u.c, u.r, u.dir); for (var i = 0; i < cells.length; i++) { var cp = this.cellPoint(cells[i].c, cells[i].r); g.fillStyle(hex(P.cyan), 0.08); g.fillRect(cp.x - m.tile * 0.47, cp.y - m.tile * 0.47, m.tile * 0.94, m.tile * 0.94); } }
      g.fillStyle(hex(P.ink), 0.7); g.fillCircle(pt.x + 3, pt.y + 4, r * pulse); g.fillStyle(hex(col), 0.96); g.lineStyle(1.8, hex(P.white), 0.75);
      if (op.kind === 'shield' || op.kind === 'bulwark' || op.kind === 'anchor') { g.beginPath(); for (i = 0; i < 6; i++) { var a = i / 6 * TAU - Math.PI / 6; var x = pt.x + Math.cos(a) * r * bob, y = pt.y + Math.sin(a) * r * bob; if (!i) g.moveTo(x, y); else g.lineTo(x, y); } g.closePath(); g.fillPath(); g.strokePath(); }
      else if (op.kind === 'spear' || op.kind === 'rail') { g.fillTriangle(pt.x, pt.y - r, pt.x + r, pt.y + r, pt.x - r, pt.y + r); g.strokeTriangle(pt.x, pt.y - r, pt.x + r, pt.y + r, pt.x - r, pt.y + r); }
      else if (op.kind === 'medic' || op.kind === 'beacon') { g.fillCircle(pt.x, pt.y, r * bob); g.strokeCircle(pt.x, pt.y, r * bob); g.lineStyle(2, hex(P.ink), 0.9); g.lineBetween(pt.x - 5, pt.y, pt.x + 5, pt.y); g.lineBetween(pt.x, pt.y - 5, pt.x, pt.y + 5); }
      else if (op.kind === 'lob' || op.kind === 'coil') { g.beginPath(); g.moveTo(pt.x, pt.y - r); g.lineTo(pt.x + r * 1.35, pt.y); g.lineTo(pt.x, pt.y + r); g.lineTo(pt.x - r * 1.35, pt.y); g.closePath(); g.fillPath(); g.strokePath(); }
      else { g.fillTriangle(pt.x, pt.y - r, pt.x + r, pt.y + r, pt.x - r, pt.y + r); g.strokeTriangle(pt.x, pt.y - r, pt.x + r, pt.y + r, pt.x - r, pt.y + r); }
      var dx = Math.cos(ang), dy = Math.sin(ang); g.lineStyle(3, hex(P.ink), 0.95); g.lineBetween(pt.x + dx * 3, pt.y + dy * 3, pt.x + dx * (r + 10), pt.y + dy * (r + 10)); g.fillStyle(hex(P.white), 0.9); g.fillTriangle(pt.x + dx * (r + 13), pt.y + dy * (r + 13), pt.x + dx * (r + 5) - dy * 4, pt.y + dy * (r + 5) + dx * 4, pt.x + dx * (r + 5) + dy * 4, pt.y + dy * (r + 5) - dx * 4);
      if (u.hp < u.maxHp || this.selected === u) { g.fillStyle(hex(P.ink), 0.9); g.fillRect(pt.x - r, pt.y + r + 7, r * 2, 4); g.fillStyle(hex(P.teal), 0.95); g.fillRect(pt.x - r, pt.y + r + 7, r * 2 * clamp(u.hp / u.maxHp, 0, 1), 4); }
      for (i = 0; i < 2; i++) { g.fillStyle(hex(u.skills[i] <= 0 ? P.amber : P.slate), 0.95); g.fillCircle(pt.x + r - i * 7, pt.y - r - 3, 2.5); }
    }
    drawEnemy(g, e) {
      var r = Math.max(6, e.r * this.metrics.board.tile / 54), col = e.flash > 0 ? P.white : e.def.col, a = e.def.kind === 'boss' ? 1.1 : 1;
      if (e.air) { g.fillStyle(hex(P.ink), 0.5); g.fillEllipse(e.x + 5, e.y + r, r, r * 0.32); }
      g.fillStyle(hex(col), 0.98); g.lineStyle(e.def.kind === 'boss' ? 2.6 : 1.4, hex(P.coral), 0.88);
      if (e.def.kind === 'runner' || e.def.kind === 'flyer') { g.fillTriangle(e.x, e.y - r * a, e.x + r * a, e.y + r * a, e.x - r * a, e.y + r * a); g.strokeTriangle(e.x, e.y - r * a, e.x + r * a, e.y + r * a, e.x - r * a, e.y + r * a); }
      else if (e.def.kind === 'shell' || e.def.kind === 'brute') { g.fillRoundedRect(e.x - r * a, e.y - r * a, r * 2 * a, r * 2 * a, 5); g.strokeRoundedRect(e.x - r * a, e.y - r * a, r * 2 * a, r * 2 * a, 5); }
      else { g.fillCircle(e.x, e.y, r * a); g.strokeCircle(e.x, e.y, r * a); }
      if (e.def.kind === 'boss') { ring(g, e.x, e.y, r * 1.45 + Math.sin(this.simTime * 4) * 2, 30, P.coral, 0.8); g.lineStyle(2, hex(P.white), 0.7); g.lineBetween(e.x - r * 0.45, e.y, e.x + r * 0.45, e.y); }
      if (e.oil > 0) ring(g, e.x, e.y, r + 4, 20, P.bone, 0.8); if (e.stun > 0 || e.root > 0) { g.fillStyle(hex(P.violet), 0.9); g.fillCircle(e.x + r, e.y - r, 4); }
      var by = e.y - r - 13; g.fillStyle(hex(P.ink), 0.9); g.fillRect(e.x - r, by, r * 2, 3); g.fillStyle(hex(P.coral), 0.95); g.fillRect(e.x - r, by, r * 2 * clamp(e.hp / e.maxHp, 0, 1), 3);
      for (var b = 0; b < Math.min(5, e.blocks); b++) { g.fillStyle(hex(P.coral), 0.92); g.fillRect(e.x - e.blocks * 3 + b * 6, by - 8, 4, 3); }
      for (var q = 0; q < Math.min(5, e.threat); q++) { g.fillStyle(hex(e.atk < 0.45 ? P.amber : P.bone), 0.9); g.fillRect(e.x - e.threat * 3 + q * 6, by - 14, 4, 3); }
      if (e.atk < 0.45 || e.hitPulse > 0) { sector(g, e.x, e.y, r + 8, Math.atan2(this.metrics.board.h, this.metrics.board.w), 0.2, P.amber, 0.8, 0.05); }
    }
    drawWorld() {
      var g = this.worldG, f = this.fxG, m = this.metrics.board, i, e;
      g.clear(); f.clear();
      if (!this.activeMap) return;
      for (i = 0; i < this.hazards.length; i++) { var z = this.hazards[i], zp = this.cellPoint(z.c, z.r), za = 0.16 + Math.sin(z.phase * 5) * 0.05; g.fillStyle(hex(z.type === 'water' ? P.cyan : z.type === 'core' ? P.violet : P.amber), za); g.fillCircle(zp.x, zp.y, m.tile * 0.3); ring(g, zp.x, zp.y, m.tile * 0.25 + Math.sin(z.phase * 3) * 2, 18, z.type === 'water' ? P.cyan : P.amber, 0.45); }
      if (this.drag && this.drag.cell) { var ids = this.loadout(), op = EO.OP_BY_ID[ids[this.drag.card]]; if (op) this.drawPreview(g, op, this.drag.cell.c, this.drag.cell.r, this.drag.dir, true); }
      else if (this.selected && !this.selected.downed) this.drawPreview(g, this.selected.op, this.selected.c, this.selected.r, this.selected.dir, false);
      for (i = 0; i < this.units.length; i++) this.drawUnit(g, this.units[i]);
      for (i = 0; i < this.enemyPool.length; i++) if (this.enemyPool[i].active) this.drawEnemy(g, this.enemyPool[i]);
      for (i = 0; i < this.shotPool.length; i++) { var s = this.shotPool[i]; if (!s.active) continue; var sa = clamp(s.life / s.max, 0, 1); f.lineStyle(s.kind === 2 ? 3 : 2, hex(s.color), sa); f.lineBetween(s.x, s.y, s.tx, s.ty); if (s.kind === 2) ring(f, s.tx, s.ty, 7 + (1 - sa) * 9, 18, P.amber, sa); }
      for (i = 0; i < this.partPool.length; i++) { var part = this.partPool[i]; if (!part.active) continue; var pa = clamp(part.life / part.max, 0, 1); f.fillStyle(hex(part.color), pa); if (part.system === 'reward') ring(f, part.x, part.y, part.size + (1 - pa) * 9, 14, part.color, pa); else f.fillRect(part.x - part.size * 0.5, part.y - part.size * 0.5, part.size, part.size); }
      this.drawDispatch(g);
    }
    drawPreview(g, op, c, r, dir, ghost) { var m = this.metrics.board, cells = this.previewCells(op, c, r, dir), ok = this.buildable(c, r) && this.energy >= op.cost, color = ok ? P.cyan : P.coral, i; for (i = 0; i < cells.length; i++) { var pt = this.cellPoint(cells[i].c, cells[i].r); g.fillStyle(hex(color), ghost ? 0.2 : 0.11); g.fillRect(pt.x - m.tile * 0.46, pt.y - m.tile * 0.46, m.tile * 0.92, m.tile * 0.92); g.lineStyle(1, hex(color), 0.42); g.strokeRect(pt.x - m.tile * 0.46, pt.y - m.tile * 0.46, m.tile * 0.92, m.tile * 0.92); } var center = this.cellPoint(c, r), angle = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][dir], radius = Math.min(m.tile * (op.range + 0.5), m.tile * 3.3); sector(g, center.x, center.y, radius, angle, 0.34, color, ghost ? 0.82 : 0.5, ghost ? 0.08 : 0.035); g.lineStyle(3, hex(color), 0.85); g.lineBetween(center.x, center.y, center.x + Math.cos(angle) * m.tile * 0.72, center.y + Math.sin(angle) * m.tile * 0.72); if (ghost) { g.lineStyle(2, hex(color), 0.9); g.strokeRect(center.x - m.tile * 0.43, center.y - m.tile * 0.43, m.tile * 0.86, m.tile * 0.86); } }
    drawDispatch(g) { var m = this.metrics.board, x = m.x + 18, y = m.y - 12, state = this.drag ? 'command' : this.playState === 'won' ? 'victory' : this.selected && this.selected.attackPulse > 0 ? 'impact' : 'idle', bob = state === 'idle' ? Math.sin(this.simTime * 3) * 2 : state === 'command' ? Math.sin(this.simTime * 10) * 4 : 0; g.fillStyle(hex(P.ink), 0.55); g.fillCircle(x, y + 8, 13); g.fillStyle(hex(P.cyan), 0.9); g.fillRect(x - 6, y - 8 + bob, 12, 15); g.fillStyle(hex(P.white), 0.85); g.fillRect(x - 3, y - 15 + bob, 6, 6); g.lineStyle(2, hex(P.teal), 0.9); g.lineBetween(x + 6, y - 6 + bob, x + 14, y - 14 + bob); if (state === 'impact') ring(g, x, y, 18, 18, P.amber, 0.7); if (state === 'victory') ring(g, x, y, 20 + Math.sin(this.simTime * 5) * 2, 20, P.teal, 0.8); }

    render() {
      this.beginText(); this.buttons.length = 0; this.cardRects.length = 0; this.missionRects.length = 0; this.rosterRects.length = 0; this.hudG.clear(); this.overlayG.clear();
      var j = kit.juice.frame(); this.worldRoot.x = j.dx; this.worldRoot.y = j.dy; this.worldRoot.setVisible(this.mode === 'play'); if (this.boardImage) this.boardImage.setVisible(this.mode === 'play');
      if (this.mode === 'play') this.renderPlay(); else if (this.mode === 'campaign') this.renderCampaign(); else if (this.mode === 'base') this.renderBase(); else if (this.mode === 'trials') this.renderTrials(); else if (this.mode === 'siege') this.renderSiege(); else this.renderResult();
      if (this.mode === 'play' && this.kitPaused) this.renderPause();
    }
    renderPlay() {
      this.drawWorld(); var m = this.metrics, g = this.hudG, rail = m.rail; g.fillStyle(hex(P.ink), 0.94); g.fillRect(0, 0, this.W, 62); g.lineStyle(1, hex(P.slate), 0.9); g.lineBetween(0, 61, this.W, 61);
      this.text(this.activeTheatre.short, 14, 18, 16, this.activeTheatre.accent, 0); this.text('M' + String(this.stage + 1).padStart(2, '0') + '  ' + (this.activeMap ? this.activeMap.name : ''), 14, 42, 14, P.paper, 0);
      this.text('W' + Math.min(this.wave + 1, this.waveCount) + '/' + this.waveCount, this.W * 0.44, 19, 16, P.paper, 0.5); this.text('K ' + this.kills, this.W * 0.44, 43, 14, P.dim, 0.5);
      this.meter(g, this.W * 0.55, 18, 82, this.energy / Math.max(30, this.activeMap.energy + 18), P.amber); this.text('◆ ' + Math.floor(this.energy), this.W * 0.55, 43, 14, P.amber, 0);
      this.meter(g, this.W * 0.70, 18, 72, this.health / 100, this.health < 40 ? P.coral : P.teal); this.text('CORE ' + Math.round(this.health), this.W * 0.70, 43, 14, this.health < 40 ? P.coral : P.teal, 0);
      this.button('speed', this.W - 112, 8, 48, 48, this.speed === 1 ? '1X' : '2X', P.amber, null, false); this.button('pause', this.W - 56, 8, 48, 48, 'II', P.cyan, null, true);
      g.fillStyle(hex(P.ink), 0.92); g.fillRoundedRect(rail.x, rail.y, rail.w, rail.h, 10); g.lineStyle(1, hex(P.slate), 0.9); g.strokeRoundedRect(rail.x, rail.y, rail.w, rail.h, 10);
      this.text('OPERATORS', rail.x + 12, rail.y + 18, 14, P.paper, 0); this.text(this.loadout().length + '/' + (4 + save.outpost.deck), rail.x + rail.w - 12, rail.y + 18, 14, P.dim, 1);
      var l = this.loadout(), cw = (rail.w - 30) / 2, ch = 58;
      for (var i = 0; i < l.length; i++) { var op = EO.OP_BY_ID[l[i]], x = rail.x + 10 + (i % 2) * (cw + 10), y = rail.y + 30 + Math.floor(i / 2) * (ch + 8), afford = this.energy >= op.cost, selected = this.selected && this.selected.op.id === op.id; this.cardRects.push({ x: x, y: y, w: cw, h: ch, index: i }); g.fillStyle(hex(selected ? '#1f4b5c' : '#15232f'), 0.98); g.fillRoundedRect(x, y, cw, ch, 7); g.lineStyle(selected ? 2 : 1.2, hex(selected ? P.white : (afford ? op.col : P.slate)), afford ? 0.95 : 0.5); g.strokeRoundedRect(x, y, cw, ch, 7); this.drawMiniOperator(g, op, x + 22, y + 28); this.text(op.abbr, x + 42, y + 19, 14, op.col, 0); this.text('◆' + op.cost, x + cw - 8, y + 18, 14, afford ? P.amber : P.coral, 1); this.text(op.role, x + 42, y + 39, 12, P.dim, 0); }
      var sy = rail.y + 30 + Math.ceil(l.length / 2) * (ch + 8) + 8; if (this.selected) { var u = this.selected, st = this.operatorStats(u.op); this.text(u.op.name + '  P' + (st.promotion || 0), rail.x + 12, sy + 15, 15, u.op.col, 0); this.text(Math.max(0, Math.round(u.hp)) + '/' + u.maxHp + ' HP', rail.x + 12, sy + 36, 14, P.paper, 0); this.button('skillA', rail.x + 8, sy + 48, rail.w * 0.47, 48, u.op.skills[0] <= 0 ? u.op.skills[0].name : Math.ceil(u.skills[0]) + 's', u.op.skills[0] <= 0 ? P.amber : P.slate, null, u.op.skills[0] <= 0); this.button('skillB', rail.x + rail.w * 0.5 + 2, sy + 48, rail.w * 0.47 - 10, 48, u.op.skills[1] <= 0 ? u.op.skills[1].name : Math.ceil(u.skills[1]) + 's', u.op.skills[1] <= 0 ? P.amber : P.slate, null, u.op.skills[1] <= 0); this.button('recycle', rail.x + 8, sy + 102, rail.w - 16, 44, 'RECYCLE  +' + Math.floor(u.op.cost * 0.5), P.coral, null, false); }
      if (this.drag) { var ids = this.loadout(), op2 = EO.OP_BY_ID[ids[this.drag.card]]; if (op2) { g.fillStyle(hex(op2.col), 0.94); g.fillCircle(this.drag.x, this.drag.y, 20); this.text(op2.abbr, this.drag.x, this.drag.y, 11, P.ink, 0.5); } }
      this.renderTransient();
    }
    drawMiniOperator(g, op, x, y) { g.fillStyle(hex(op.col), 0.95); if (op.kind === 'shield' || op.kind === 'bulwark' || op.kind === 'anchor') g.fillRoundedRect(x - 8, y - 8, 16, 16, 4); else if (op.kind === 'medic' || op.kind === 'beacon') g.fillCircle(x, y, 8); else { g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x + 8, y + 7); g.lineTo(x - 8, y + 7); g.closePath(); g.fillPath(); } g.lineStyle(1.4, hex(P.white), 0.75); g.strokeCircle(x, y, 9); }
    meter(g, x, y, w, ratio, color) { g.fillStyle(hex(P.slate), 0.9); g.fillRoundedRect(x, y, w, 6, 3); g.fillStyle(hex(color), 0.95); g.fillRoundedRect(x, y, w * clamp(ratio, 0, 1), 6, 3); }
    renderTransient() {
      var g = this.overlayG, m = this.metrics, tr = this.transient;
      if (this.coachLife > 0 && !this.kitPaused && !tr && !this.boundary) {
        g.fillStyle(hex(P.ink), 0.82); g.fillRect(12, 64, Math.min(this.W - 24, 600), 28); this.text(this.coachText, 22, 78, 14, P.bone, 0);
      }
      if (tr && !tr.boundary && !this.boundary) {
        var r = m.rail; g.fillStyle(hex(P.ink), 0.92); g.fillRoundedRect(r.x + 10, 46, r.w - 20, 28, 6); g.lineStyle(1.2, hex(tr.color), 0.9); g.strokeRoundedRect(r.x + 10, 46, r.w - 20, 28, 6); this.text(tr.value, r.x + r.w * 0.5, 60, 14, tr.color, 0.5);
      }
      if (this.boundary) {
        var b = this.boundary, alpha = clamp(b.life / 0.28, 0, 1), w = Math.min(this.W * 0.6, 560), y = this.H * 0.44;
        g.fillStyle(hex(b.color), 0.11 * alpha); g.fillRect(this.W * 0.5 - w * 0.5, y - 34, w, 68); g.lineStyle(1.5, hex(b.color), 0.85 * alpha); g.strokeRect(this.W * 0.5 - w * 0.5, y - 34, w, 68); this.text(b.title, this.W * 0.5, y - 8, 24, b.color, 0.5); this.text(b.sub, this.W * 0.5, y + 20, 14, P.paper, 0.5);
      }
    }
    renderPause() { var g = this.overlayG; g.fillStyle(hex(P.ink), 0.84); g.fillRect(0, 62, this.W, this.H - 62); this.text('PAUSED', this.W * 0.5, this.H * 0.42, 28, P.cyan, 0.5); this.button('resume', this.W * 0.5 - 106, this.H * 0.52, 212, 48, 'RESUME', P.cyan, null, true); this.button('campaign', this.W * 0.5 - 106, this.H * 0.52 + 58, 212, 48, 'ABANDON', P.coral, null, false); }

    renderCampaign() {
      var g = this.hudG, w = this.W; g.fillStyle(hex(P.ink), 1); g.fillRect(0, 0, this.W, this.H); g.fillStyle(hex(P.slate), 0.25); g.fillRect(0, 0, this.W, 62); this.text('EMBERLINE OUTPOST', 16, 22, 22, P.amber, 0); this.text('CAMPAIGN  ' + save.cleared + '/24  ·  ' + save.unlocked.length + '/12 OPERATORS', 16, 47, 14, P.dim, 0); this.button('base', w - 286, 10, 82, 44, 'BASE', P.bone); this.button('trials', w - 196, 10, 82, 44, 'TRIALS', P.violet); this.button('siege', w - 106, 10, 94, 44, 'SIEGE', P.coral);
      var panelW = (w - 38) / 2, panelH = Math.min(122, (this.H - 94) / 2), top = 74;
      for (var c = 0; c < EO.CHAPTERS.length; c++) { var ch = EO.CHAPTERS[c], x = 12 + (c % 2) * (panelW + 14), y = top + Math.floor(c / 2) * (panelH + 12), th = EO.THEATRES.find(function (a) { return a.id === ch.theatre; }); g.fillStyle(hex('#14212b'), 0.98); g.fillRoundedRect(x, y, panelW, panelH, 10); g.lineStyle(1.3, hex(th.accent), 0.75); g.strokeRoundedRect(x, y, panelW, panelH, 10); this.text('C' + (c + 1) + '  ' + ch.name, x + 12, y + 18, 15, th.accent, 0); this.text('BOSS  ' + ch.boss, x + panelW - 12, y + 18, 12, P.dim, 1); for (var q = 0; q < 6; q++) { var st = c * 6 + q, bx = x + 10 + q * ((panelW - 20) / 6), by = y + 40, bw = (panelW - 30) / 6; var open = st <= save.cleared, stars = save.stars[st] || 0; this.missionRects.push({ x: bx, y: by, w: bw, h: Math.max(44, panelH - 50), stage: st, open: open }); g.fillStyle(hex(open ? '#1c3541' : '#0d161d'), 1); g.fillRoundedRect(bx, by, bw - 4, Math.max(44, panelH - 50), 6); g.lineStyle(1.2, hex(open ? (st === save.cleared ? P.amber : th.accent) : P.slate), open ? 0.85 : 0.4); g.strokeRoundedRect(bx, by, bw - 4, Math.max(44, panelH - 50), 6); this.text(String(q + 1).padStart(2, '0'), bx + (bw - 4) * 0.5, by + 16, 15, open ? P.paper : P.dim, 0.5); this.text(stars ? '★'.repeat(stars) : open ? '·' : '×', bx + (bw - 4) * 0.5, by + 37, 15, stars ? P.amber : open ? P.cyan : P.dim, 0.5); } }
      var navY = Math.min(this.H - 50, top + 2 * (panelH + 12) + 8); this.button('deploy', 12, navY, 170, 44, 'DEPLOY NEXT', P.cyan, clamp(save.cleared, 0, EO.MISSIONS.length - 1), true); this.text('MATERIALS  ◆ ' + save.mats.scrap + '   ◇ ' + save.mats.ember + '   ▣ ' + save.mats.alloy, w - 16, navY + 22, 14, P.bone, 1);
    }
    renderBase() {
      var g = this.hudG, w = this.W; g.fillStyle(hex(P.ink), 1); g.fillRect(0, 0, w, this.H); this.text('OUTPOST BASE', 16, 22, 22, P.amber, 0); this.text('Earned salvage only  ·  facilities persist', 16, 47, 14, P.dim, 0); this.button('campaign', w - 112, 10, 100, 44, 'CAMPAIGN', P.cyan);
      this.text('◆ ' + save.mats.scrap, w * 0.42, 23, 16, P.bone, 0.5); this.text('◇ ' + save.mats.ember, w * 0.52, 23, 16, P.amber, 0.5); this.text('▣ ' + save.mats.alloy, w * 0.62, 23, 16, P.violet, 0.5);
      var ids = ['smelter', 'relay', 'deck'], names = ['SMELTER', 'RELAY', 'COMMAND DECK'], desc = ['Yield +25% per level', 'Charge regen +0.3', 'Unlock loadout slots'], gY = 70, fw = (w - 36) / 3;
      for (var i = 0; i < 3; i++) { var fx = 12 + i * (fw + 6), level = save.outpost[ids[i]], max = ids[i] === 'deck' ? 2 : 3; g.fillStyle(hex('#14212b'), 0.98); g.fillRoundedRect(fx, gY, fw, 76, 9); g.lineStyle(1.2, hex(i === 1 ? P.teal : i === 2 ? P.violet : P.amber), 0.8); g.strokeRoundedRect(fx, gY, fw, 76, 9); this.text(names[i] + '  ' + level + '/' + max, fx + 10, gY + 19, 15, P.paper, 0); this.text(desc[i], fx + 10, gY + 40, 13, P.dim, 0); this.button('upgrade', fx + 10, gY + 48, fw - 20, 44, level < max ? 'UPGRADE' : 'MAXED', i === 1 ? P.teal : P.amber, ids[i], level < max); }
      this.text('ROSTER  ·  PROMOTIONS', 14, 174, 15, P.paper, 0); var rw = (w - 36) / 6, rh = 48;
      for (i = 0; i < EO.OPERATORS.length; i++) { var op = EO.OPERATORS[i], rx = 12 + (i % 6) * (rw + 4), ry = 184 + Math.floor(i / 6) * (rh + 8), unlocked = save.unlocked.indexOf(op.id) >= 0, sel = this.selectedRoster === op.id; this.rosterRects.push({ x: rx, y: ry, w: rw, h: rh, id: op.id }); g.fillStyle(hex(sel ? '#1d4652' : '#14212b'), 1); g.fillRoundedRect(rx, ry, rw, rh, 6); g.lineStyle(1.2, hex(unlocked ? op.col : P.slate), unlocked ? 0.8 : 0.35); g.strokeRoundedRect(rx, ry, rw, rh, 6); this.text(unlocked ? op.abbr : '???', rx + rw * 0.5, ry + 16, 14, unlocked ? op.col : P.dim, 0.5); this.text(unlocked ? 'P' + (save.promotions[op.id] || 0) : 'LOCK', rx + rw * 0.5, ry + 36, 13, unlocked ? P.paper : P.dim, 0.5); }
      var chosen = EO.OP_BY_ID[this.selectedRoster] || EO.OPERATORS[0], lv = save.promotions[chosen.id] || 0, py = 300; g.fillStyle(hex('#14212b'), 0.98); g.fillRoundedRect(12, py, w - 24, 54, 8); this.text(chosen.name + '  ·  ' + chosen.role, 24, py + 17, 15, chosen.col, 0); this.text('TIER ' + lv + '/3  ·  ' + chosen.skills[0].name + ' / ' + chosen.skills[1].name, 24, py + 39, 13, P.dim, 0); this.button('promote', w - 154, py + 6, 130, 44, lv < 3 ? 'PROMOTE' : 'MAXED', P.teal, chosen.id, save.unlocked.indexOf(chosen.id) >= 0 && lv < 3);
      this.text('LOADOUT SLOTS  ' + this.loadout().length + '/' + (4 + save.outpost.deck), 14, this.H - 28, 14, P.dim, 0);
    }
    renderTrials() {
      var g = this.hudG, w = this.W; g.fillStyle(hex(P.ink), 1); g.fillRect(0, 0, w, this.H); this.text('FIXED-SEED TRIALS', 16, 24, 22, P.violet, 0); this.text('No random draws  ·  records persist', 16, 49, 14, P.dim, 0); this.button('campaign', w - 112, 10, 100, 44, 'CAMPAIGN', P.cyan); for (var i = 0; i < EO.TRIALS.length; i++) { var y = 82 + i * 78, tr = EO.TRIALS[i], stars = save.trials[String(i)] || 0; g.fillStyle(hex('#14212b'), 0.98); g.fillRoundedRect(16, y, w - 32, 62, 9); g.lineStyle(1.2, hex(P.violet), 0.7); g.strokeRoundedRect(16, y, w - 32, 62, 9); this.text('T' + (i + 1) + '  ' + tr.name, 30, y + 19, 16, P.violet, 0); this.text(tr.desc + '  ·  SEED ' + tr.seed, 30, y + 43, 14, P.dim, 0); this.text(stars ? '★'.repeat(stars) : 'UNRUN', w - 180, y + 31, 16, stars ? P.amber : P.dim, 0.5); this.button('trial', w - 108, y + 9, 90, 44, 'RUN', P.cyan, i, true); } }
    renderSiege() { var g = this.hudG, w = this.W; g.fillStyle(hex(P.ink), 1); g.fillRect(0, 0, w, this.H); this.text('ENDLESS SIEGE', 16, 24, 22, P.coral, 0); this.text('Hold the core. The seed never changes.', 16, 49, 14, P.dim, 0); this.button('campaign', w - 112, 10, 100, 44, 'CAMPAIGN', P.cyan); var cx = w * 0.5, cy = this.H * 0.43; ring(g, cx, cy, 86, 44, P.coral, 0.38); ring(g, cx, cy, 56, 30, P.amber, 0.5); g.fillStyle(hex(P.violet), 0.92); g.fillCircle(cx, cy, 22); this.text('CORE', cx, cy, 13, P.ink, 0.5); this.text('BEST  ' + save.siegeBest, cx, cy + 102, 18, P.amber, 0.5); this.button('startSiege', cx - 116, this.H - 66, 232, 48, 'START SIEGE', P.coral, null, true); }
    renderResult() { var g = this.hudG, w = this.W, won = this.playState === 'won', stars = won && this.runKind === 'campaign' ? save.stars[this.stage] || 1 : 0; g.fillStyle(hex(P.ink), 1); g.fillRect(0, 0, w, this.H); this.text(won ? 'LINE HOLDS' : 'CORE BREACH', w * 0.5, 54, 30, won ? P.teal : P.coral, 0.5); this.text(this.runKind === 'campaign' ? 'MISSION ' + String(this.stage + 1).padStart(2, '0') + '  ' + EO.MISSIONS[this.stage].name : this.runKind.toUpperCase(), w * 0.5, 84, 15, P.dim, 0.5); this.text(won ? '★'.repeat(stars) : 'RETRY THE LANE', w * 0.5, 132, 24, won ? P.amber : P.coral, 0.5); this.text('SCORE  ' + this.stageScore, w * 0.5, 174, 20, P.paper, 0.5); this.text('KILLS  ' + this.kills + '    CORE  ' + Math.round(this.health), w * 0.5, 204, 15, P.dim, 0.5); if (won && this.runKind === 'campaign') this.text('SALVAGE  ◆ ' + EO.MISSIONS[this.stage].reward.scrap + '   ◇ ' + EO.MISSIONS[this.stage].reward.ember + '   ▣ ' + EO.MISSIONS[this.stage].reward.alloy, w * 0.5, 236, 15, P.bone, 0.5); this.button('again', w * 0.5 - 170, this.H - 108, 104, 48, 'RETRY', P.coral); if (won && this.runKind === 'campaign' && this.stage < EO.MISSIONS.length - 1) this.button('next', w * 0.5 - 54, this.H - 108, 104, 48, 'NEXT', P.cyan, null, true); this.button('campaign', w * 0.5 + 62, this.H - 108, 108, 48, 'MAPS', P.bone); }
  }

  EmberlineScene.prototype.renderCampaign = EmberlineScene.prototype.renderCampaign;

  function syncHiDpi(game) {
    var cssW = Math.max(1, Math.floor(document.documentElement.clientWidth || window.innerWidth || 1));
    var cssH = Math.max(1, Math.floor(document.documentElement.clientHeight || window.innerHeight || 1));
    GGKit.hiDpi.resize(game, cssW, cssH);
  }

  kit.loader.show('EMBERLINE OUTPOST'); kit.loader.progress(0.22);
  var game = new Phaser.Game({ type: Phaser.AUTO, parent: 'game', backgroundColor: '#0b1118', scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH, width: 960, height: 540 }, render: Object.assign({}, GGKit.renderDefaults), fps: { target: 60, forceSetTimeOut: false }, input: { activePointers: 4 }, scene: [EmberlineScene] });
  syncHiDpi(game);
  window.addEventListener('resize', function () { syncHiDpi(game); });
  window.addEventListener('orientationchange', function () { syncHiDpi(game); });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) syncHiDpi(game);
  });
})(typeof window !== 'undefined' ? window : globalThis);
