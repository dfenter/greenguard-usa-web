/* Gridfall presentation, input, lifecycle, save, audio and Phaser boot. */
(function () {
  'use strict';

  var Sim = window.GridfallSim;
  var FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  var STEP = 1000 / 60;
  var MAX_STEPS = 4;
  var COLOR = {
    ink: 0x182238, board: 0x243453, cell: 0x314567, cellEdge: 0x5d7294, paper: 0xf7fbff,
    coral: 0xf25c68, sun: 0xf7c948, leaf: 0x5bcb77, tide: 0x38a8de, plum: 0x9a7cf3, ember: 0xf29a4a,
    good: 0x7ee49b, warning: 0xffc861, bad: 0xff8a86
  };
  var COLORS = Sim.COLORS;
  var Game = { phaser: null, scene: null };
  var DEBUG = { ready: false, scene: 'boot', phase: 'title', mode: 'marathon', boardId: 'marathon-open', boardName: 'Open Grid', score: 0, movesRemaining: 0, cascades: 0, patternId: 'classic', state: null, board: [] }, DEBUG_VIEW = Object.freeze({});

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function num(n, fallback) { return Number.isFinite(n) ? n : fallback; }
  function textIfChanged(obj, value) { var s = String(value); if (obj && obj.text !== s) obj.setText(s); }
  function colorIfChanged(obj, value) { if (obj && obj.style && obj.style.color !== value) obj.setColor(value); }
  function idOf(pointer) { var e = pointer && pointer.event; return e && e.pointerId != null ? e.pointerId : (pointer && pointer.id != null ? pointer.id : 0); }
  function todayKey() { var d = new Date(), m = d.getMonth() + 1, day = d.getDate(); return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day; }
  function shade(color, amount) { var r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255; return (clamp(Math.round(r * amount), 0, 255) << 16) | (clamp(Math.round(g * amount), 0, 255) << 8) | clamp(Math.round(b * amount), 0, 255); }
  function rounded(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); }
  function titleCase(s) { return String(s || '').replace(/(^|[- ])([a-z])/g, function (_, a, b) { return a + b.toUpperCase(); }); }
  function formatGoal(snap) { return titleCase(snap.goal) + ' ' + snap.target; }
  function formatProgress(snap) { var goal = snap.goal || 'score', current = goal === 'cascades' ? snap.cascades : goal === 'clears' ? snap.clears : snap.score, icon = goal === 'cascades' ? '⛓' : goal === 'clears' ? '▦' : '✦'; return icon + ' ' + current + '/' + snap.target; }
  function knownBoard(id) { if (id === Sim.MASTER.id || id === 'marathon-open' || String(id).indexOf('daily-') === 0) return true; return Sim.CHALLENGES.some(function (c) { return c.id === id; }); }
  function knownPattern(id) { return Sim.PATTERNS.some(function (p) { return p.id === id; }); }

  var DEFAULT_SAVE = {
    v: 2, best: { marathon: 0, daily: 0, challenge: 0, master: 0 }, medals: {}, unlockedChallenge: 1,
    unlockedPatterns: ['classic'], selectedPattern: 'classic', daily: { date: '', score: 0, streak: 0, cascades: 0 }, history: [], motionSet: false, motionEnabled: true
  };
  function cloneDefault() { return JSON.parse(JSON.stringify(DEFAULT_SAVE)); }
  function validDate(value, empty) { return (empty && value === '') || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)); }
  function validSave(o) {
    if (!o || typeof o !== 'object' || o.v !== 2 || !o.best || !o.daily || !o.medals || !Array.isArray(o.history) || !Array.isArray(o.unlockedPatterns)) return false;
    var modes = ['marathon', 'daily', 'challenge', 'master'];
    for (var i = 0; i < modes.length; i++) if (!Number.isInteger(o.best[modes[i]]) || o.best[modes[i]] < 0 || o.best[modes[i]] > 99999999) return false;
    if (!Number.isInteger(o.unlockedChallenge) || o.unlockedChallenge < 1 || o.unlockedChallenge > Sim.CHALLENGES.length + 1) return false;
    if (typeof o.motionSet !== 'boolean' || typeof o.motionEnabled !== 'boolean' || !knownPattern(o.selectedPattern)) return false;
    if (!validDate(o.daily.date, true) || !Number.isInteger(o.daily.score) || o.daily.score < 0 || o.daily.score > 99999999 || !Number.isInteger(o.daily.streak) || o.daily.streak < 0 || o.daily.streak > 9999 || !Number.isInteger(o.daily.cascades) || o.daily.cascades < 0 || o.daily.cascades > 9999) return false;
    if (o.unlockedPatterns.length < 1 || o.unlockedPatterns.length > Sim.PATTERNS.length || o.unlockedPatterns.indexOf('classic') < 0) return false;
    for (i = 0; i < o.unlockedPatterns.length; i++) if (!knownPattern(o.unlockedPatterns[i]) || o.unlockedPatterns.indexOf(o.unlockedPatterns[i]) !== i) return false;
    var medalKeys = Object.keys(o.medals);
    for (i = 0; i < medalKeys.length; i++) if (!knownBoard(medalKeys[i]) || ['bronze', 'silver', 'gold'].indexOf(o.medals[medalKeys[i]]) < 0) return false;
    if (o.history.length > 10) return false;
    for (i = 0; i < o.history.length; i++) {
      var h = o.history[i];
      if (!h || !['marathon', 'daily', 'challenge', 'master'].includes(h.mode) || !knownBoard(h.boardId) || !validDate(h.date, false) || !Number.isInteger(h.score) || h.score < 0 || h.score > 99999999 || !Number.isInteger(h.moves) || h.moves < 0 || h.moves > 999 || typeof h.complete !== 'boolean' || (h.medal !== '' && ['bronze', 'silver', 'gold'].indexOf(h.medal) < 0)) return false;
    }
    return true;
  }

  var kit = GGKit.create({
    slug: 'gridfall', orientation: 'portrait', validateSave: validSave,
    onPause: function () { if (Game.scene) { Game.scene.releaseInputs(); if (Game.scene.scene.isActive()) Game.scene.scene.pause(); } },
    onResume: function () { if (Game.scene) { if (Game.scene.scene.isPaused()) Game.scene.scene.resume(); Game.scene.renderAll(); } },
    onRestart: function () { if (Game.scene) Game.scene.startRun(Game.scene.mode, Game.scene.boardId); }
  });
  kit.input.gamepad = function () { try { var pads = navigator.getGamepads ? navigator.getGamepads() : []; return pads && pads[0] ? pads[0] : null; } catch (e) { return null; } };
  kit.audio.register({
    theme: 'assets/theme.mp3', tap: 'assets/tap.mp3', clear: 'assets/clear.mp3', cascade: 'assets/cascade.mp3', reward: 'assets/reward.mp3', invalid: 'assets/invalid.mp3', ui: 'assets/ui.mp3'
  });
  var profile = kit.save.get(cloneDefault());
  if (!validSave(profile)) profile = cloneDefault();
  if (profile.unlockedPatterns.indexOf(profile.selectedPattern) < 0) profile.selectedPattern = 'classic';
  (function initMotion() { if (profile.motionSet) kit.juice.enabled = profile.motionEnabled !== false; else if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) kit.juice.enabled = false; })();
  function sfx(name, opts) { kit.audio.sfx(name, opts || {}); }
  function saveProfile() { kit.save.set(profile); }
  function seedPointer(pointer, zone) { var id = idOf(pointer), e = pointer && pointer.event, x = num(pointer && pointer.x, e && e.clientX || 0), y = num(pointer && pointer.y, e && e.clientY || 0); kit.input.pointers.set(id, { x: x, y: y, startX: x, startY: y, downAt: performance.now(), zone: zone || null }); return id; }
  function higherMedal(a, b) { var rank = { '': 0, bronze: 1, silver: 2, gold: 3 }; return rank[b] > rank[a] ? b : a; }
  function unlockPattern(id) { if (knownPattern(id) && profile.unlockedPatterns.indexOf(id) < 0) profile.unlockedPatterns.push(id); }
  function persistRun(sim) {
    var snap = Sim.snapshot(sim), official = true, mode = sim.mode;
    profile.best[mode] = Math.max(profile.best[mode] || 0, snap.score);
    if (snap.complete && snap.medal) profile.medals[sim.boardId] = higherMedal(profile.medals[sim.boardId] || '', snap.medal);
    if (mode === 'challenge' && snap.complete) { var ci = Sim.challengeIndex(sim.boardId); profile.unlockedChallenge = Math.min(Sim.CHALLENGES.length + 1, Math.max(profile.unlockedChallenge, ci + 2)); unlockPattern(Sim.challengeAt(sim.boardId).pattern); if (ci + 1 < Sim.CHALLENGES.length) unlockPattern(Sim.CHALLENGES[ci + 1].pattern); }
    if (mode === 'master' && snap.complete) Sim.PATTERNS.forEach(function (p) { unlockPattern(p.id); });
    if (mode === 'daily') { var day = sim.dailyKey || todayKey(); if (!snap.complete || profile.daily.date === day) official = false; else profile.daily = { date: day, score: snap.score, streak: snap.bestStreak, cascades: snap.cascades }; }
    kit.boundedPush(profile.history, { mode: mode, boardId: sim.boardId, date: sim.dailyKey || todayKey(), score: snap.score, moves: snap.moves, complete: !!snap.complete, medal: snap.medal || '' }, 10);
    saveProfile();
    return official;
  }
  function makeTexture(scene, key, w, h, draw) { if (scene.textures.exists(key)) return key; var baked = GGKit.hiDpi.canvas(w, h), tex = scene.textures.addCanvas(key, baked.canvas), ctx = baked.ctx; draw(ctx, w, h); tex.refresh(); return key; }
  function cssViewport() { return { width: document.documentElement.clientWidth || window.innerWidth || 390, height: document.documentElement.clientHeight || window.innerHeight || 844 }; }
  function resizeHiDpi(game, width, height) { var view = width && height ? { width: width, height: height } : cssViewport(); return GGKit.hiDpi.resize(game, view.width, view.height); }
  function bindHiDpiResize(game) { var apply = function () { resizeHiDpi(game); }; window.addEventListener('resize', apply); window.addEventListener('orientationchange', apply); document.addEventListener('visibilitychange', apply); apply(); }
  function setTextDensity(scene) {
    var d = GGKit.hiDpi.dpr();
    function visit(list) { (list || []).forEach(function (child) { if (child && child.setResolution) child.setResolution(d); if (child && child.list) visit(child.list); }); }
    visit(scene.children && scene.children.list);
  }

  class GridfallScene extends Phaser.Scene {
    constructor() { super({ key: 'gridfall' }); }
    init(args) { var a = args || {}; this.mode = this.normalizeMode(a.mode || 'marathon'); this.boardId = this.normalizeBoardId(this.mode, a.boardId || ''); this.pendingMode = this.mode; this.pendingBoardId = this.boardId; }
    normalizeMode(mode) { return ['master', 'daily', 'challenge', 'marathon'].indexOf(mode) >= 0 ? mode : 'marathon'; }
    normalizeBoardId(mode, id) { if (mode === 'master') return Sim.MASTER.id; if (mode === 'challenge') return Sim.challengeAt(id || '').id; return mode === 'daily' ? 'daily-' + todayKey() : 'marathon-open'; }
    create() {
      Game.scene = this; DEBUG.ready = true; DEBUG.scene = 'gridfall';
      this.phase = 'title'; this.sim = null; this.accumulator = 0; this.viewTime = 0; this.viewState = 'ready'; this.viewTimer = 0; this.resultWait = 0; this.notice = null; this.noticeQueue = []; this.clearFlash = []; this.hintCells = null; this.hintTimer = 0; this.hoverCell = null; this.downCell = null; this.activePointerId = null; this.cursorX = 3; this.cursorY = 3; this.padCooldown = 0; this.padState = { a: false, b: false, x: false, y: false, direction: '' };
      this.keyLatch = {}; this.layoutData = { w: 390, h: 844, boardX: 20, boardY: 150, boardSize: 350, cell: 43.75, hintY: 520 };
      this.cellViews = []; this.buildTextures(); this.buildView(); setTextDensity(this); this.bindInput(); this.layout(); this.scale.on('resize', this.layout, this); kit.loader.hide(); kit.registerPWA(); this.showTitle(); setTextDensity(this); this.events.once('shutdown', this.shutdownScene, this);
    }
    buildTextures() {
      this.pixelTexture = makeTexture(this, 'gf-pixel', 4, 4, function (ctx) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 4, 4); });
      this.sparkTexture = makeTexture(this, 'gf-spark', 10, 10, function (ctx) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(10, 5); ctx.lineTo(5, 10); ctx.lineTo(0, 5); ctx.fill(); });
      this.ringTexture = makeTexture(this, 'gf-ring', 16, 16, function (ctx) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(8, 8, 6, 0, Math.PI * 2); ctx.stroke(); });
    }
    buildView() {
      this.background = this.add.image(0, 0, this.pixelTexture).setOrigin(0, 0); this.world = this.add.container(0, 0); this.boardLayer = this.add.container(0, 0); this.world.add(this.boardLayer);
      this.boardImage = this.add.image(0, 0, this.pixelTexture).setOrigin(0, 0); this.boardLayer.add(this.boardImage); this.clearFlashViews = [];
      for (var i = 0; i < 64; i++) { var f = this.add.rectangle(0, 0, 10, 10, COLOR.paper, 0.9).setOrigin(.5).setVisible(false); this.boardLayer.add(f); this.clearFlashViews.push(f); }
      for (i = 0; i < 64; i++) {
        var root = this.add.container(0, 0).setVisible(false), shadow = this.add.ellipse(0, 5, 38, 12, 0x0b1020, .4).setOrigin(.5), orb = this.add.ellipse(0, 0, 38, 34, COLOR.coral, 1).setOrigin(.5), diamond = this.add.polygon(0, 0, [0, -20, 20, 0, 0, 20, -20, 0], COLOR.coral, 1).setOrigin(.5), hex = this.add.polygon(0, 0, [-17, -10, 0, -20, 17, -10, 17, 10, 0, 20, -17, 10], COLOR.coral, 1).setOrigin(.5), shine = this.add.ellipse(-7, -9, 15, 5, 0xffffff, .22).setOrigin(.5), ring = this.add.ellipse(0, 0, 43, 39, COLOR.warning, 0).setOrigin(.5).setVisible(false), glyph = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '16px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(.5);
        root.add([shadow, orb, diamond, hex, shine, ring, glyph]); this.boardLayer.add(root); this.cellViews.push({ root: root, shadow: shadow, orb: orb, diamond: diamond, hex: hex, shine: shine, ring: ring, glyph: glyph, scale: 1, pulse: 0 });
      }
      this.ui = this.add.container(0, 0); this.titleText = this.add.text(0, 0, 'GRIDFALL', { fontFamily: FONT, fontSize: '24px', color: '#f7fbff', fontStyle: 'bold', letterSpacing: 2 }).setOrigin(0, .5); this.modeText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '12px', color: '#b6c4e2', fontStyle: 'bold', letterSpacing: 1 }).setOrigin(0, .5); this.patternText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '19px', color: '#f7c948', fontStyle: 'bold' }).setOrigin(1, .5); this.scoreText = this.add.text(0, 0, '✦ 0', { fontFamily: FONT, fontSize: '20px', color: '#f7fbff', fontStyle: 'bold' }).setOrigin(0, .5); this.movesText = this.add.text(0, 0, '↕ 0/0', { fontFamily: FONT, fontSize: '20px', color: '#f7c948', fontStyle: 'bold' }).setOrigin(.5, .5); this.cascadeText = this.add.text(0, 0, '⛓ 0', { fontFamily: FONT, fontSize: '20px', color: '#f7fbff', fontStyle: 'bold' }).setOrigin(1, .5); this.statLabels = [this.add.text(0, 0, 'SCORE', { fontFamily: FONT, fontSize: '12px', color: '#aebddd', fontStyle: 'bold' }).setOrigin(0, .5), this.add.text(0, 0, 'MOVES', { fontFamily: FONT, fontSize: '12px', color: '#aebddd', fontStyle: 'bold' }).setOrigin(.5, .5), this.add.text(0, 0, 'CASCADES', { fontFamily: FONT, fontSize: '12px', color: '#aebddd', fontStyle: 'bold' }).setOrigin(1, .5)];
      this.boardNameText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '15px', color: '#f7fbff', fontStyle: 'bold' }).setOrigin(0, .5); this.boardSubText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '12px', color: '#b6c4e2' }).setOrigin(0, .5); this.goalText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '14px', color: '#f7c948', fontStyle: 'bold' }).setOrigin(0, .5); this.modeCards = []; this.modeLabels = [];
      for (i = 0; i < 4; i++) { var card = this.add.rectangle(0, 0, 10, 30, COLOR.ink, 1).setOrigin(0, 0), label = this.add.text(0, 0, ['MARATHON', 'DAILY', 'CHALLENGE', 'MASTER'][i], { fontFamily: FONT, fontSize: '11px', color: '#b6c4e2', fontStyle: 'bold', align: 'center' }).setOrigin(.5); this.ui.add([card, label]); this.modeCards.push(card); this.modeLabels.push(label); }
      this.settingsText = this.add.text(0, 0, '⚙', { fontFamily: FONT, fontSize: '18px', color: '#b6c4e2', fontStyle: 'bold' }).setOrigin(1, .5); this.ui.add([this.titleText, this.modeText, this.patternText, this.scoreText, this.movesText, this.cascadeText]); this.ui.add(this.statLabels); this.ui.add([this.boardNameText, this.boardSubText, this.goalText, this.settingsText]);
      this.objectiveCard = this.add.rectangle(0, 0, 10, 10, COLOR.ink, .9).setOrigin(0, 0); this.hintBg = this.add.rectangle(0, 0, 10, 44, COLOR.good, 1).setOrigin(0, 0); this.hintText = this.add.text(0, 0, '?', { fontFamily: FONT, fontSize: '18px', color: '#102018', fontStyle: 'bold', align: 'center' }).setOrigin(.5); this.ui.add([this.objectiveCard, this.hintBg, this.hintText]);
      this.startOverlay = this.makeOverlay('title'); this.resultOverlay = this.makeOverlay('result'); this.fx = { clear: this.add.particles(0, 0, this.pixelTexture, { speed: { min: 70, max: 180 }, angle: { min: 0, max: 360 }, lifespan: 420, scale: { start: 1.2, end: 0 }, alpha: { start: .9, end: 0 }, emitting: false, maxAliveParticles: 28 }), cascade: this.add.particles(0, 0, this.sparkTexture, { speed: { min: 100, max: 260 }, angle: { min: 235, max: 305 }, lifespan: 560, scale: { start: 1, end: 0 }, alpha: { start: .9, end: 0 }, emitting: false, maxAliveParticles: 24 }), reward: this.add.particles(0, 0, this.ringTexture, { speed: { min: 80, max: 220 }, angle: { min: 210, max: 330 }, lifespan: 900, scale: { start: 1.4, end: 0 }, alpha: { start: .8, end: 0 }, emitting: false, maxAliveParticles: 20 }) };
    }
    makeOverlay(kind) {
      var root = this.add.container(0, 0).setVisible(false), dim = this.add.rectangle(0, 0, 10, 10, COLOR.ink, .84).setOrigin(0, 0), card = this.add.rectangle(0, 0, 330, 330, COLOR.board, 1).setOrigin(.5).setStrokeStyle(2, COLOR.cellEdge, 1), title = this.add.text(0, -122, kind === 'title' ? 'GRIDFALL' : 'RUN COMPLETE', { fontFamily: FONT, fontSize: '27px', color: '#f7fbff', fontStyle: 'bold', align: 'center' }).setOrigin(.5), sub = this.add.text(0, -78, '', { fontFamily: FONT, fontSize: '14px', color: '#b6c4e2', align: 'center', wordWrap: { width: 280 } }).setOrigin(.5), details = this.add.text(0, -10, '', { fontFamily: FONT, fontSize: '17px', color: '#f7c948', fontStyle: 'bold', align: 'center', wordWrap: { width: 286 } }).setOrigin(.5), history = this.add.text(0, 62, '', { fontFamily: FONT, fontSize: '12px', color: '#dbe4f7', align: 'center', wordWrap: { width: 286 } }).setOrigin(.5), action = this.add.text(0, 122, kind === 'title' ? 'TAP TO START' : 'TAP TO PLAY AGAIN', { fontFamily: FONT, fontSize: '15px', color: '#182238', backgroundColor: '#f7c948', padding: { left: 18, right: 18, top: 12, bottom: 12 }, fontStyle: 'bold' }).setOrigin(.5); root.add([dim, card, title, sub, details, history, action]); return { root: root, dim: dim, card: card, title: title, sub: sub, details: details, history: history, action: action, kind: kind };
    }
    layout() {
      var w = Math.max(280, this.scale.width || window.innerWidth || 390), h = Math.max(280, this.scale.height || window.innerHeight || 844), landscape = w > h, top = landscape ? 82 : 104, boardLimit = landscape ? h - 146 : h - 270, boardSize = Math.min(w - 24, 360, Math.max(220, boardLimit)); boardSize = Math.max(220, boardSize); var cell = boardSize / 8, hintY = top + boardSize + 14, noticeY = top - 14;
      this.layoutData = { w: w, h: h, boardX: (w - boardSize) / 2, boardY: top, boardSize: boardSize, cell: cell, hintY: hintY, noticeY: noticeY, landscape: landscape };
      var bgKey = 'gf-bg-' + Math.ceil(w / 64) * 64 + 'x' + Math.ceil(h / 64) * 64, boardKey = 'gf-board-' + Math.round(boardSize);
      this.backgroundTexture = makeTexture(this, bgKey, Math.ceil(w / 64) * 64, Math.ceil(h / 64) * 64, function (ctx, bw, bh) { var g = ctx.createLinearGradient(0, 0, bw, bh); g.addColorStop(0, '#121a30'); g.addColorStop(.55, '#1d2947'); g.addColorStop(1, '#111a30'); ctx.fillStyle = g; ctx.fillRect(0, 0, bw, bh); ctx.globalAlpha = .16; ctx.strokeStyle = '#91a4d5'; ctx.lineWidth = 1; for (var x = -bh; x < bw + bh; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + bh, bh); ctx.stroke(); } ctx.globalAlpha = .12; ctx.fillStyle = '#f7c948'; ctx.beginPath(); ctx.arc(bw * .84, bh * .12, Math.min(bw, bh) * .2, 0, Math.PI * 2); ctx.fill(); });
      this.boardTexture = makeTexture(this, boardKey, Math.ceil(boardSize + 20), Math.ceil(boardSize + 20), function (ctx, bw, bh) { ctx.fillStyle = '#10182a'; rounded(ctx, 2, 2, bw - 4, bh - 4, 18); ctx.fill(); ctx.strokeStyle = '#5d7294'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#243453'; rounded(ctx, 10, 10, bw - 20, bh - 20, 13); ctx.fill(); var c = boardSize / 8; for (var yy = 0; yy < 8; yy++) for (var xx = 0; xx < 8; xx++) { ctx.fillStyle = (xx + yy) % 2 ? '#2d4162' : '#314567'; rounded(ctx, 10 + xx * c + c * .06, 10 + yy * c + c * .06, c * .88, c * .88, c * .13); ctx.fill(); ctx.strokeStyle = '#536a8e'; ctx.lineWidth = 1; ctx.stroke(); } });
      this.background.setTexture(this.backgroundTexture).setDisplaySize(w, h).setPosition(0, 0); this.boardImage.setTexture(this.boardTexture).setDisplaySize(boardSize + 20, boardSize + 20).setPosition(this.layoutData.boardX - 10, top - 10);
      this.titleText.setPosition(18, 25); this.modeText.setPosition(18, 51); this.patternText.setPosition(w - 18, 51); this.scoreText.setPosition(18, 26); this.movesText.setPosition(w / 2, 26); this.cascadeText.setPosition(w - 66, 26); this.statLabels[0].setPosition(18, 51); this.statLabels[1].setPosition(w / 2, 51); this.statLabels[2].setPosition(w - 66, 51); this.settingsText.setPosition(w - 18, 25);
      this.boardNameText.setPosition(this.layoutData.boardX, top - 24); this.boardSubText.setPosition(this.layoutData.boardX, top - 7); this.goalText.setPosition(18, hintY + 18); for (var mi = 0; mi < 4; mi++) { var mw = w / 4, mx = mi * mw + 2; this.modeCards[mi].setPosition(mx, 64).setSize(mw - 4, 30); this.modeLabels[mi].setPosition(mx + (mw - 4) / 2, 79); }
      this.objectiveCard.setPosition(12, hintY - 4).setSize(w - 24, 44); this.hintBg.setPosition(w - 104, hintY - 4).setSize(92, 44); this.hintText.setPosition(w - 58, hintY + 18); this.renderOverlayLayout(); this.renderAll();
    }
    renderOverlayLayout() { var l = this.layoutData, centerY = l.h * .45; [this.startOverlay, this.resultOverlay].forEach(function (o) { o.dim.setSize(l.w, l.h); o.card.setPosition(l.w / 2, centerY).setSize(330, 330); o.title.setPosition(l.w / 2, centerY - 122); o.sub.setPosition(l.w / 2, centerY - 78); o.details.setPosition(l.w / 2, centerY - 10); o.history.setPosition(l.w / 2, centerY + 62); o.action.setPosition(l.w / 2, centerY + 122); }); }
    showTitle() { this.sim = null; this.phase = 'title'; this.viewState = 'ready'; this.lastSnap = null; this.notice = null; this.noticeQueue = []; this.pendingMode = this.mode || 'marathon'; this.pendingBoardId = this.boardId; this.syncDebug(); this.syncOverlay(); this.renderAll(); }
    cyclePattern() { var current = profile.unlockedPatterns.indexOf(profile.selectedPattern), next = profile.unlockedPatterns[(current + 1) % profile.unlockedPatterns.length] || 'classic'; profile.selectedPattern = next; saveProfile(); if (this.sim) { this.sim.patternId = next; this.syncDebug(); } sfx('ui'); this.renderAll(); }
    startRun(mode, boardId) {
      kit.input.clearAll(); this.activePointerId = null; this.downCell = null; mode = this.normalizeMode(mode || 'marathon'); if (mode === 'master' && profile.unlockedChallenge <= Sim.CHALLENGES.length) mode = 'challenge'; if (mode === 'challenge') { var requested = Sim.challengeIndex(boardId || ''); if (requested + 1 > profile.unlockedChallenge) boardId = Sim.CHALLENGES[Math.max(0, profile.unlockedChallenge - 1)].id; }
      var date = mode === 'daily' ? todayKey() : '', id = this.normalizeBoardId(mode, boardId || (mode === 'challenge' ? this.pendingBoardId : '')); this.mode = mode; this.boardId = id; this.phase = 'play'; this.sim = Sim.newState(mode, id, Sim.hash('gridfall|' + mode + '|' + id + '|' + date), date, profile.selectedPattern); this.viewState = 'ready'; this.viewTimer = 0; this.hintCells = null; this.hintTimer = 0; this.clearFlash = []; this.notice = null; this.noticeQueue = []; this.resultWait = 0; this.queueNotice('Tap a group of 3+', 'coach', 3.2, COLOR.paper); this.syncDebug(); this.syncOverlay(); this.renderAll(); kit.audio.music('theme', 500); sfx('ui');
    }
    queueNotice(text, kind, duration, color, immediate, replaceCoach) {
      var item = { text: text, kind: kind || 'chip', color: color || COLOR.paper, t: duration || 1, max: duration || 1 };
      if (immediate) { this.notice = item; this.noticeQueue = []; return; }
      if (replaceCoach && this.notice && this.notice.kind === 'coach') this.notice = null;
      if (!this.notice) this.notice = item;
      else if (this.notice.kind !== 'boundary' && this.noticeQueue.length < 4) this.noticeQueue.push(item);
    }
    setPendingMode(mode) { this.pendingMode = this.normalizeMode(mode); if (this.pendingMode === 'challenge') this.pendingBoardId = Sim.challengeAt(this.pendingBoardId || '').id; if (this.pendingMode === 'master') this.pendingBoardId = Sim.MASTER.id; this.syncOverlay(); sfx('ui'); }
    cellAt(x, y) { var l = this.layoutData, cx = Math.floor((x - l.boardX) / l.cell), cy = Math.floor((y - l.boardY) / l.cell); return cx >= 0 && cx < 8 && cy >= 0 && cy < 8 ? [cx, cy] : null; }
    showHint() { if (!this.sim || this.phase !== 'play') return; this.hintCells = Sim.hint(this.sim); this.hintTimer = 2.6; if (this.hintCells) { this.viewState = 'preview'; this.queueNotice('HINT', 'chip', .8, COLOR.good, false, true); sfx('ui'); } else { this.queueNotice('NO GROUP', 'chip', .8, COLOR.bad, false, true); sfx('invalid'); } this.renderAll(); }
    tapCell(x, y) {
      if (!this.sim || this.phase !== 'play') return; var result = Sim.tap(this.sim, x, y); this.hintCells = null; this.hintTimer = 0; if (!result.ok) { this.viewState = 'invalid'; this.viewTimer = .42; this.queueNotice(result.reason === 'need-group' ? 'NEED 3+' : 'BOARD ONLY', 'chip', .8, COLOR.bad, false, true); sfx('invalid', { volume: .7 }); this.syncDebug(); this.renderAll(); return; }
      this.handleMatch(result);
    }
    handleMatch(res) {
      var l = this.layoutData, i; this.viewState = res.cascades ? 'cascade' : 'resolve'; this.viewTimer = res.cascades ? .78 : .4; sfx('clear', { volume: .82, rate: .92 + Math.min(.3, res.group.length * .02) });
      for (i = 0; i < res.removed.length; i++) { var c = res.removed[i]; if (this.clearFlash.length >= 80) this.clearFlash.shift(); this.clearFlash.push({ x: c[0], y: c[1], t: .48, color: COLORS[(c[2] - 1) % COLORS.length] || COLOR.paper }); this.emitClear(l.boardX + c[0] * l.cell + l.cell / 2, l.boardY + c[1] * l.cell + l.cell / 2, COLORS[(c[2] - 1) % COLORS.length] || COLOR.paper); }
      if (res.cascades) { sfx('cascade', { volume: .88, rate: .92 + Math.min(.35, res.cascades * .06) }); this.emitCascade(l.boardX + l.boardSize / 2, l.boardY + l.boardSize * .38); kit.juice.shake(Math.min(7, 2 + res.cascades), 110); kit.juice.hitStop(res.cascades > 1 ? 58 : 36); }
      this.queueNotice(res.cascades ? '⛓ x' + res.cascades + '  +' + res.gain : '✦ +' + res.gain, 'chip', .85, res.cascades ? COLOR.warning : COLOR.paper, false, true);
      if (res.wipe) { sfx('reward', { volume: 1 }); this.emitReward(l.boardX + l.boardSize / 2, l.boardY + l.boardSize * .44); this.queueNotice('BIG CLEAR  +' + res.gain, 'chip', .85, COLOR.good); }
      if (res.complete) { sfx('reward', { volume: 1 }); this.queueNotice('BOARD COMPLETE', 'boundary', .95, COLOR.good, true); this.notice.sub = (res.medal || 'BRONZE').toUpperCase() + ' MEDAL'; this.resultWait = .9; }
      else if (res.over) { sfx('ui', { volume: .8 }); this.queueNotice('RUN ENDED', 'boundary', .8, COLOR.bad, true); this.notice.sub = 'NO MOVES OR GROUPS LEFT'; this.resultWait = .75; }
      this.syncDebug(); this.renderAll();
    }
    emitClear(x, y, color) { this.fx.clear.setParticleTint(color); this.fx.clear.emitParticleAt(x, y, kit.juice.enabled === false ? 2 : 4); }
    emitCascade(x, y) { this.fx.cascade.setParticleTint(COLOR.warning); this.fx.cascade.emitParticleAt(x, y, kit.juice.enabled === false ? 4 : 10); }
    emitReward(x, y) { this.fx.reward.setParticleTint(COLOR.good); this.fx.reward.emitParticleAt(x, y, kit.juice.enabled === false ? 4 : 12); }
    stepSim(dt) {
      this.viewTime += dt; if (this.viewTimer > 0) { this.viewTimer -= dt; if (this.viewTimer <= 0) this.viewState = 'ready'; } if (this.hintTimer > 0) { this.hintTimer -= dt; if (this.hintTimer <= 0) this.hintCells = null; }
      for (var i = this.clearFlash.length - 1; i >= 0; i--) { this.clearFlash[i].t -= dt; if (this.clearFlash[i].t <= 0) this.clearFlash.splice(i, 1); }
      for (i = 0; i < this.cellViews.length; i++) { var cv = this.cellViews[i]; cv.scale += (1 - cv.scale) * Math.min(1, dt * 12); cv.pulse = Math.max(0, cv.pulse - dt * 3); }
      if (this.notice) { this.notice.t -= dt; if (this.notice.t <= 0) this.notice = this.noticeQueue.shift() || null; } if (this.resultWait > 0) { this.resultWait -= dt; if (this.resultWait <= 0) this.showResult(); } if (this.padCooldown > 0) this.padCooldown -= dt;
    }
    restartRun() { kit.restart(); }
    releaseInputs() { this.activePointerId = null; this.downCell = null; this.hoverCell = null; this.keyLatch = {}; kit.input.clearAll(); if (this.input && this.input.setDefaultCursor) this.input.setDefaultCursor('default'); }
    bindInput() { this.input.on('pointerdown', this.onPointerDown, this); this.input.on('pointermove', this.onPointerMove, this); this.input.on('pointerup', this.onPointerUp, this); this.input.on('pointerupoutside', this.onPointerUpOutside, this); this.input.on('pointercancel', this.releaseInputs, this); }
    unbindInput() { this.input.off('pointerdown', this.onPointerDown, this); this.input.off('pointermove', this.onPointerMove, this); this.input.off('pointerup', this.onPointerUp, this); this.input.off('pointerupoutside', this.onPointerUpOutside, this); this.input.off('pointercancel', this.releaseInputs, this); }
    onPointerDown(pointer) {
      var id = seedPointer(pointer, 'canvas'), x = pointer.x, y = pointer.y; if (this.activePointerId != null) { kit.input.pointers.delete(id); return; } if (x > this.layoutData.w - 60 && y < 45) { kit.openSettings(); kit.input.pointers.delete(id); return; }
      if (this.phase === 'title') { this.handleTitleTap(x, y); kit.input.pointers.delete(id); return; } if (this.phase === 'result') { this.handleResultTap(x, y); kit.input.pointers.delete(id); return; } if (x > this.layoutData.w - 150 && y > 36 && y < 62) { this.cyclePattern(); kit.input.pointers.delete(id); return; }
      if (!this.sim || this.sim.phase !== 'play' || kit.paused) { kit.input.pointers.delete(id); return; }
      if (y >= 60 && y <= 98) { var modeIndex = clamp(Math.floor(x / (this.layoutData.w / 4)), 0, 3), modes = ['marathon', 'daily', 'challenge', 'master']; if (modes[modeIndex] !== this.mode) { kit.input.clearAll(); this.startRun(modes[modeIndex], modes[modeIndex] === 'challenge' ? Sim.CHALLENGES[0].id : ''); } kit.input.pointers.delete(id); return; }
      if (x >= this.layoutData.w - 110 && y >= this.layoutData.hintY - 4 && y <= this.layoutData.hintY + 44) { this.showHint(); kit.input.pointers.delete(id); return; }
      var cell = this.cellAt(x, y); if (!cell) { kit.input.pointers.delete(id); return; } this.activePointerId = id; this.downCell = cell; this.hoverCell = cell; sfx('tap', { volume: .38 });
    }
    onPointerMove(pointer) { var id = idOf(pointer); if (this.activePointerId != null && id !== this.activePointerId) return; var cell = this.cellAt(pointer.x, pointer.y); this.hoverCell = cell; if (this.phase === 'play') { this.viewState = cell ? 'preview' : 'ready'; this.renderAll(); } }
    onPointerUp(pointer) { var id = idOf(pointer); if (this.activePointerId == null || id !== this.activePointerId) { kit.input.pointers.delete(id); return; } var cell = this.cellAt(pointer.x, pointer.y), same = cell && this.downCell && cell[0] === this.downCell[0] && cell[1] === this.downCell[1]; this.activePointerId = null; this.downCell = null; kit.input.pointers.delete(id); if (same) this.tapCell(cell[0], cell[1]); else { this.viewState = 'ready'; sfx('invalid', { volume: .45 }); } this.renderAll(); }
    onPointerUpOutside(pointer) { var id = idOf(pointer); if (this.activePointerId === id) { this.activePointerId = null; this.downCell = null; this.hoverCell = null; this.viewState = 'ready'; sfx('invalid', { volume: .45 }); } kit.input.pointers.delete(id); this.renderAll(); }
    handleTitleTap(x, y) { var w = this.layoutData.w; if (y > 58 && y < 100) { this.setPendingMode(['marathon', 'daily', 'challenge', 'master'][clamp(Math.floor(x / (w / 4)), 0, 3)]); return; } if (this.pendingMode === 'challenge' && y > 112 && y < 152 && x > w * .12 && x < w * .88) { var step = x < w / 2 ? -1 : 1, next = clamp(Sim.challengeIndex(this.pendingBoardId) + step, 0, Math.max(0, profile.unlockedChallenge - 1)); this.pendingBoardId = Sim.CHALLENGES[next].id; this.syncOverlay(); return; } if (x > w - 150 && y > 36 && y < 62) { this.cyclePattern(); return; } if (y > this.layoutData.h * .45 + 52 && y < this.layoutData.h * .45 + 150) { if (this.pendingMode === 'master' && profile.unlockedChallenge <= Sim.CHALLENGES.length) { this.queueNotice('FINISH CHALLENGES FIRST', 'coach', 3, COLOR.warning, false, true); this.renderAll(); return; } this.startRun(this.pendingMode, this.pendingBoardId); } }
    handleResultTap(x, y) { var center = this.layoutData.h * .45; if (y > center + 74 && y < center + 165) { if (this.sim.complete && this.mode === 'challenge') { var next = Sim.challengeIndex(this.boardId) + 1; if (next < Sim.CHALLENGES.length && next < profile.unlockedChallenge) { this.startRun('challenge', Sim.CHALLENGES[next].id); return; } } this.restartRun(); } }
    moveCursor(dx, dy) { this.cursorX = clamp((this.cursorX == null ? 3 : this.cursorX) + dx, 0, 7); this.cursorY = clamp((this.cursorY == null ? 3 : this.cursorY) + dy, 0, 7); this.hoverCell = [this.cursorX, this.cursorY]; this.viewState = 'preview'; sfx('tap', { volume: .3 }); this.renderAll(); }
    handleKeyCode(code) {
      if (this.phase === 'title') { if (code === 'KeyP') this.cyclePattern(); else if (code === 'Space' || code === 'Enter') this.startRun(this.pendingMode, this.pendingBoardId); else if ((code === 'ArrowLeft' || code === 'ArrowRight') && this.pendingMode === 'challenge') { var d = code === 'ArrowLeft' ? -1 : 1, n = clamp(Sim.challengeIndex(this.pendingBoardId) + d, 0, Math.max(0, profile.unlockedChallenge - 1)); this.pendingBoardId = Sim.CHALLENGES[n].id; this.syncOverlay(); } return; }
      if (this.phase === 'result') { if (code === 'Space' || code === 'Enter' || code === 'KeyR') this.restartRun(); return; }
      if (!this.sim || this.sim.phase !== 'play') return; if (code === 'KeyR') { this.restartRun(); return; } if (code === 'KeyH' || code === 'Slash') { this.showHint(); return; } if (code === 'KeyP') { this.cyclePattern(); return; }
      if (code === 'ArrowLeft') this.moveCursor(-1, 0); else if (code === 'ArrowRight') this.moveCursor(1, 0); else if (code === 'ArrowUp') this.moveCursor(0, -1); else if (code === 'ArrowDown') this.moveCursor(0, 1); else if (code === 'Space' || code === 'Enter') this.tapCell(this.cursorX, this.cursorY);
    }
    pollKeyboard() {
      var codes = ['KeyP', 'Space', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyR', 'KeyH', 'Slash'];
      for (var i = 0; i < codes.length; i++) { var code = codes[i], down = kit.input.keyDown(code); if (down && !this.keyLatch[code]) this.handleKeyCode(code); this.keyLatch[code] = down; }
    }
    pollGamepad() {
      var pad = kit.input.gamepad(); if (!pad) return; var a = !!(pad.buttons[0] && pad.buttons[0].pressed), b = !!(pad.buttons[1] && pad.buttons[1].pressed), x = !!(pad.buttons[2] && pad.buttons[2].pressed), y = !!(pad.buttons[3] && pad.buttons[3].pressed), dir = '';
      if (pad.buttons[12] && pad.buttons[12].pressed) dir = 'up'; else if (pad.buttons[13] && pad.buttons[13].pressed) dir = 'down'; else if (pad.buttons[14] && pad.buttons[14].pressed) dir = 'left'; else if (pad.buttons[15] && pad.buttons[15].pressed) dir = 'right'; else if (Math.abs(pad.axes[0] || 0) > .55) dir = pad.axes[0] < 0 ? 'left' : 'right'; else if (Math.abs(pad.axes[1] || 0) > .55) dir = pad.axes[1] < 0 ? 'up' : 'down';
      if (dir && (dir !== this.padState.direction || this.padCooldown <= 0)) { this.padCooldown = .16; this.padState.direction = dir; if (dir === 'up') this.moveCursor(0, -1); if (dir === 'down') this.moveCursor(0, 1); if (dir === 'left') this.moveCursor(-1, 0); if (dir === 'right') this.moveCursor(1, 0); } if (!dir) this.padState.direction = '';
      if (a && !this.padState.a) { if (this.phase === 'title') this.startRun(this.pendingMode, this.pendingBoardId); else if (this.phase === 'result') this.restartRun(); else this.tapCell(this.cursorX, this.cursorY); } if (b && !this.padState.b && this.phase === 'play') this.showHint(); if (x && !this.padState.x) this.cyclePattern(); if (y && !this.padState.y && this.phase === 'play') this.restartRun(); this.padState.a = a; this.padState.b = b; this.padState.x = x; this.padState.y = y;
    }
    syncDebug() { var snap = this.sim ? Sim.snapshot(this.sim) : { mode: this.mode, boardId: this.boardId, boardName: 'Open Grid', phase: this.phase, score: 0, movesRemaining: 0, cascades: 0, patternId: profile.selectedPattern, board: [] }; this.lastSnap = snap; DEBUG.mode = snap.mode; DEBUG.boardId = snap.boardId; DEBUG.boardName = snap.boardName; DEBUG.phase = snap.phase; DEBUG.score = snap.score; DEBUG.movesRemaining = snap.movesRemaining; DEBUG.cascades = snap.cascades; DEBUG.patternId = snap.patternId; DEBUG.board = snap.board; DEBUG_VIEW = Object.freeze({ mode: snap.mode, boardId: snap.boardId, boardName: snap.boardName, phase: snap.phase, score: snap.score, movesRemaining: snap.movesRemaining, cascades: snap.cascades, patternId: snap.patternId, board: Object.freeze((snap.board || []).slice()) }); }
    syncOverlay() {
      if (!this.startOverlay || !this.resultOverlay) return; this.startOverlay.root.setVisible(this.phase === 'title'); this.resultOverlay.root.setVisible(this.phase === 'result');
      if (this.phase === 'title') { var def = this.pendingMode === 'master' ? Sim.MASTER : this.pendingMode === 'challenge' ? Sim.challengeAt(this.pendingBoardId) : Sim.boardDefinition(this.pendingMode, this.pendingBoardId); textIfChanged(this.startOverlay.sub, titleCase(this.pendingMode) + '  ·  ' + def.name + '\n' + def.sub); textIfChanged(this.startOverlay.details, (this.pendingMode === 'challenge' ? 'BOARD ' + (Sim.challengeIndex(def.id) + 1) + ' / ' + Sim.CHALLENGES.length + '\n' : '') + 'CLEAR ' + def.goal.toUpperCase() + '  ·  ' + def.moves + ' MOVES\nPATTERN ' + titleCase(profile.selectedPattern)); textIfChanged(this.startOverlay.history, 'Tap a connected group of 3 or more. Gravity refills the gaps and may chain a cascade.\n\nPattern: P cycle  ·  arrows move  ·  Space selects'); textIfChanged(this.startOverlay.action, this.pendingMode === 'master' && profile.unlockedChallenge <= Sim.CHALLENGES.length ? 'FINISH THE CHAPTERS FIRST' : 'TAP TO START'); }
      else if (this.phase === 'result' && this.sim) { var snap = Sim.snapshot(this.sim), official = this.resultOfficial ? 'OFFICIAL DAILY FINISH' : (this.mode === 'daily' ? 'PRACTICE RUN' : 'RUN SUMMARY'); textIfChanged(this.resultOverlay.title, snap.complete ? 'BOARD COMPLETE' : 'RUN ENDED'); textIfChanged(this.resultOverlay.sub, titleCase(this.mode) + '  ·  ' + snap.boardName + '\n' + official); textIfChanged(this.resultOverlay.details, snap.score + ' SCORE  ·  ' + snap.moves + '/' + snap.moveLimit + ' MOVES\n' + snap.clears + ' TILES  ·  ' + snap.cascades + ' CASCADES\n' + (snap.medal ? snap.medal.toUpperCase() + ' MEDAL' : 'KEEP THE GRID MOVING')); var recent = profile.history.slice(-3).reverse().map(function (h) { return titleCase(h.mode) + '  ' + h.score + '  ' + (h.complete ? 'CLEAR' : 'END'); }).join('\n'); textIfChanged(this.resultOverlay.history, recent ? 'LAST RUNS\n' + recent : 'LAST RUNS\nThis is your first logged run.'); textIfChanged(this.resultOverlay.action, snap.complete && this.mode === 'challenge' && Sim.challengeIndex(this.boardId) + 1 < Sim.CHALLENGES.length && Sim.challengeIndex(this.boardId) + 1 < profile.unlockedChallenge ? 'NEXT CHAPTER' : 'PLAY AGAIN'); }
    }
    showResult() { if (this.phase === 'result') return; this.phase = 'result'; this.notice = null; this.noticeQueue = []; this.resultOfficial = persistRun(this.sim); kit.audio.stopMusic(450); this.syncDebug(); this.syncOverlay(); this.renderAll(); }
    renderAll() { if (!this.layoutData || !this.ui) return; var l = this.layoutData, snap = this.lastSnap, inPlay = this.phase === 'play', inTitle = this.phase === 'title'; this.titleText.setVisible(inTitle); this.modeText.setVisible(inTitle); this.patternText.setVisible(inTitle || inPlay); this.settingsText.setVisible(inTitle || inPlay); this.scoreText.setVisible(inPlay); this.movesText.setVisible(inPlay); this.cascadeText.setVisible(inPlay); this.statLabels.forEach(function (label) { label.setVisible(false); }); this.boardNameText.setVisible(false); this.boardSubText.setVisible(false); this.goalText.setVisible(inPlay); this.objectiveCard.setVisible(inPlay); this.hintBg.setVisible(inPlay); this.hintText.setVisible(inPlay); textIfChanged(this.modeText, inTitle ? 'CHOOSE A BOARD IDENTITY' : ''); textIfChanged(this.patternText, inPlay ? Sim.patternAt(this.sim.patternId).mark : 'PATTERN ' + titleCase(this.sim ? this.sim.patternId : profile.selectedPattern)); for (var mi = 0; mi < 4; mi++) { var modeId = ['marathon', 'daily', 'challenge', 'master'][mi], active = this.pendingMode === modeId; this.modeCards[mi].setVisible(inTitle).setFillStyle(active ? 0x2c4773 : COLOR.ink, 1).setStrokeStyle(active ? 2 : 1, active ? COLOR.warning : COLOR.cellEdge, 1); this.modeLabels[mi].setVisible(inTitle); colorIfChanged(this.modeLabels[mi], active ? '#f7fbff' : '#b6c4e2'); }
      var def = this.pendingMode === 'master' ? Sim.MASTER : this.pendingMode === 'challenge' ? Sim.challengeAt(this.pendingBoardId) : Sim.boardDefinition(this.pendingMode, this.pendingBoardId); if (this.sim && snap) { textIfChanged(this.scoreText, '✦ ' + snap.score); textIfChanged(this.movesText, '↕ ' + snap.movesRemaining + '/' + snap.moveLimit); textIfChanged(this.cascadeText, '⛓ ' + snap.cascades); textIfChanged(this.goalText, formatProgress(snap)); } else { textIfChanged(this.scoreText, '✦ 0'); textIfChanged(this.movesText, '↕ ' + def.moves + '/' + def.moves); textIfChanged(this.cascadeText, '⛓ 0'); textIfChanged(this.goalText, formatGoal({ goal: def.goal, target: def.target })); }
      this.renderBoard(); this.renderNotice(); this.syncOverlay();
    }
    renderBoard() {
      var l = this.layoutData, board = this.sim ? this.sim.board : null, pattern = Sim.patternAt(this.sim ? this.sim.patternId : profile.selectedPattern), i, x, y, v, cv, highlighted = {}, cells, hover = this.hoverCell;
      if (this.sim && hover && this.phase === 'play') { cells = Sim.groupAt(this.sim.board, hover[0], hover[1]); if (cells.length >= 3) cells.forEach(function (c) { highlighted[c[1] * 8 + c[0]] = true; }); }
      if (this.hintCells) this.hintCells.forEach(function (c) { highlighted[c[1] * 8 + c[0]] = true; });
      if (this.sim && this.sim.selected) this.sim.selected.forEach(function (c) { highlighted[c[1] * 8 + c[0]] = true; });
      for (i = 0; i < 64; i++) { cv = this.cellViews[i]; v = board ? board[i] : 0; x = i % 8; y = (i / 8) | 0; if (!v) { cv.root.setVisible(false); continue; } var fill = v === Sim.KINDS.hazard ? COLOR.ink : COLORS[(v - 1) % COLORS.length], selected = !!highlighted[i], scale = cv.scale * (selected ? 1.08 : 1); cv.root.setVisible(true).setPosition(l.boardX + x * l.cell + l.cell / 2, l.boardY + y * l.cell + l.cell / 2).setScale(scale); cv.shadow.setScale(l.cell / 44); cv.orb.setVisible(pattern.id === 'classic' || pattern.id === 'leaf' || pattern.id === 'aurora').setScale(l.cell / 44).setFillStyle(fill, 1).setStrokeStyle(selected ? 2.5 : 1.4, shade(fill, .62), 1); cv.diamond.setVisible(pattern.id === 'prism' || pattern.id === 'star').setScale(l.cell / 44).setFillStyle(fill, 1).setStrokeStyle(selected ? 2.5 : 1.4, shade(fill, .62), 1); cv.hex.setVisible(pattern.id === 'gold').setScale(l.cell / 44).setFillStyle(fill, 1).setStrokeStyle(selected ? 2.5 : 1.4, shade(fill, .62), 1); cv.shine.setVisible(v !== Sim.KINDS.hazard).setScale(l.cell / 44); cv.ring.setVisible(selected || (this.viewState === 'invalid' && this.hoverCell && this.hoverCell[0] === x && this.hoverCell[1] === y)).setScale(l.cell / 44).setStrokeStyle(2.5, selected ? COLOR.warning : COLOR.bad, .95); cv.glyph.setText(v === Sim.KINDS.hazard ? '!' : pattern.mark || Sim.GLYPHS[(v - 1) % Sim.GLYPHS.length]).setFontSize(Math.max(14, l.cell * .25)).setColor(v === Sim.KINDS.hazard ? '#f7c948' : '#ffffff'); }
      for (i = 0; i < this.clearFlashViews.length; i++) this.clearFlashViews[i].setVisible(false); for (i = 0; i < this.clearFlash.length; i++) { var f = this.clearFlash[i], a = clamp(f.t / .48, 0, 1), s = l.cell * (1.05 + (1 - a) * .35); this.clearFlashViews[i].setVisible(true).setPosition(l.boardX + f.x * l.cell + l.cell / 2, l.boardY + f.y * l.cell + l.cell / 2).setSize(s, s).setFillStyle(f.color, a * .75); }
    }
    renderNotice() {
      var l = this.layoutData;
      if (!this.notice) { if (this.noticeRoot) this.noticeRoot.setVisible(false); return; }
      if (!this.noticeRoot) {
        this.noticeRoot = this.add.container(0, 0);
        this.noticeBg = this.add.rectangle(0, 0, 100, 28, COLOR.ink, .94).setOrigin(.5);
        this.noticeText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '14px', color: '#f7fbff', fontStyle: 'bold', align: 'center' }).setOrigin(.5);
        this.noticeSub = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '12px', color: '#f7c948', fontStyle: 'bold', align: 'center' }).setOrigin(.5);
        this.noticeRoot.add([this.noticeBg, this.noticeText, this.noticeSub]); this.ui.add(this.noticeRoot);
      }
      var reduce = kit.juice.enabled === false, age = this.notice.max - this.notice.t, fade = this.notice.kind === 'coach' ? clamp(this.notice.t / .9, 0, 1) : clamp(this.notice.t / .16, 0, 1), alpha = reduce ? (this.notice.kind === 'coach' ? .14 + fade * .86 : fade) : Math.min(1, age / .12) * fade;
      if (this.notice.kind === 'boundary') {
        var width = Math.min(l.w * .64, 270), scale = reduce ? 1 : .92 + clamp(age / .16, 0, 1) * .08;
        this.noticeRoot.setVisible(this.phase === 'play').setPosition(l.w / 2, l.boardY + l.boardSize * .43).setScale(scale).setAlpha(alpha); this.noticeBg.setSize(width, 58).setStrokeStyle(1.5, this.notice.color, .9); textIfChanged(this.noticeText, this.notice.text); textIfChanged(this.noticeSub, this.notice.sub || ''); this.noticeText.setPosition(0, -8).setFontSize(18); this.noticeSub.setPosition(0, 16).setVisible(!!this.notice.sub); this.noticeRoot.bringToTop(); return;
      }
      var chip = this.notice.kind !== 'coach', chipWidth; textIfChanged(this.noticeText, this.notice.text); this.noticeText.setFontSize(14); chipWidth = Math.min(l.w - 32, Math.max(76, this.noticeText.width + 24)); this.noticeBg.setSize(chip ? chipWidth : l.w - 24, chip ? 28 : 30).setStrokeStyle(1, this.notice.color, .7); this.noticeRoot.setVisible(true).setPosition(chip ? l.w - chipWidth / 2 - 12 : l.w / 2, l.noticeY).setScale(1).setAlpha(alpha); this.noticeText.setPosition(0, 0); this.noticeSub.setVisible(false); this.noticeRoot.bringToTop();
    }
    update(time, delta) { var juice = kit.juice.frame(); this.world.setPosition(juice.dx, juice.dy); var d = Math.min(50, Math.max(0, num(delta, 0))); this.accumulator += d; var steps = 0; while (this.accumulator >= STEP && steps < MAX_STEPS) { this.accumulator -= STEP; this.stepSim(STEP / 1000); steps++; } if (steps === MAX_STEPS && this.accumulator >= STEP) this.accumulator = Math.min(this.accumulator, STEP * .9); this.pollKeyboard(); this.pollGamepad(); this.renderAll(); }
    shutdownScene() { this.unbindInput(); this.scale.off('resize', this.layout, this); if (Game.scene === this) Game.scene = null; }
  }

  var probe = {}; Object.defineProperty(probe, 'state', { enumerable: true, get: function () { return DEBUG_VIEW; } }); window.__gf = Object.freeze(probe);
  kit.loader.show('GRIDFALL'); kit.loader.progress(.12);
  Game.phaser = new Phaser.Game({ type: Phaser.AUTO, parent: document.body, backgroundColor: '#182238', scale: { mode: Phaser.Scale.RESIZE, width: 390, height: 844 }, render: Object.assign({}, GGKit.renderDefaults, { batchSize: 2048 }), fps: { target: 60, min: 30 }, scene: [GridfallScene] });
  bindHiDpiResize(Game.phaser);
  kit.loader.progress(1);
})();
