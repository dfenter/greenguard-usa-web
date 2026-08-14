/* Vault Raiders, fleet3 local co-op dungeon raid. */
(function (root) {
  'use strict';

  var Phaser = root.Phaser;
  var W = 720;
  var H = 960;
  var STEP = 1 / 60;
  var MAX_STEPS = 4;
  var SAVE_VERSION = 2;
  var MAX_PARTICLES = 64;
  var FONT = 'Trebuchet MS, Arial, system-ui, sans-serif';

  var C = {
    ink: '#f5fbff', dim: '#9eb4c7', deep: '#071321', wall: '#12263b',
    wall2: '#1b3850', line: '#3b607b', cyan: '#69e7ff', mint: '#7df2be',
    gold: '#ffd477', orange: '#ff9b6d', violet: '#cba1ff', rose: '#ff718b',
    p1: '#65e7ff', p1Dark: '#237f9b', p2: '#ff9c7d', p2Dark: '#a44855',
    boss: '#b78cff', bossDark: '#432f76', floor: '#142b35', safe: '#102f36'
  };

  var CHAMBERS = [
    { name: 'ECHO HALL', landmark: 'twin bells', accent: C.cyan, rune: 'TIDE', rounds: 2, hint: 'P1 anchors the left sigil. P2 anchors the right sigil.' },
    { name: 'BRASS GALLERY', landmark: 'hinged sun', accent: C.gold, rune: 'SUN', rounds: 3, hint: 'The sync window is short. Count down together, then interact.' },
    { name: 'PRISM VAULT', landmark: 'sealed heart', accent: C.violet, rune: 'CROWN', rounds: 4, hint: 'Both runes must glow at once to open the guardian gate.' }
  ];
  var RUNE_GLYPHS = ['TIDE', 'SUN', 'CROWN', 'EMBER'];
  var AUDIO = {
    music: 'assets/reel_spin.mp3', select: 'assets/tap.mp3', puzzle: 'assets/dig_reveal.mp3',
    unlock: 'assets/ladder_fanfare.mp3', swing: 'assets/reel_spin.mp3', hit: 'assets/tap.mp3',
    guardianAttack: 'assets/reel_spin.mp3', guardianHit: 'assets/dig_reveal.mp3',
    down: 'assets/tap.mp3', recovery: 'assets/coin_payout.mp3', victory: 'assets/ladder_fanfare.mp3',
    treasure: 'assets/coin_payout.mp3'
  };

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function num(v, fallback) { return Number.isFinite(v) ? v : fallback; }
  function whole(v, fallback) { return Number.isInteger(v) ? v : fallback; }
  function color(hex) { return Phaser.Display.Color.HexStringToColor(hex).color; }
  function dist(a, b) { var dx = a.x - b.x; var dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  function playerStart(index) { return { x: index ? 560 : 160, y: 690 }; }
  function station(index) { return { x: index ? 585 : 135, y: 520 }; }
  function setText(node, value, colorValue) {
    if (!node) return;
    var next = String(value);
    if (node.text !== next) node.setText(next);
    if (colorValue && node._vrColor !== colorValue) { node.setColor(colorValue); node._vrColor = colorValue; }
  }
  function announce(message) {
    var live = typeof document !== 'undefined' && document.getElementById('sr-status');
    if (live) live.textContent = message;
  }

  function makePlayer(index) {
    var start = playerStart(index);
    return {
      x: start.x, y: start.y, lastX: index ? -1 : 1, lastY: 0, hp: 5, maxHp: 5,
      downed: false, invuln: 0, attackCooldown: 0, dashCooldown: 0, attackFlash: 0, puzzleFlash: 0, bob: index * 1.7,
      puzzleScore: 0, combatScore: 0, treasure: 0, score: 0, choice: 0, claimed: false
    };
  }

  function makeState(rung) {
    var r = clamp(whole(rung, 0), 0, 19);
    var difficulty = clamp(1 + Math.floor(r / 5), 1, 4);
    var effects = makeFx();
    return {
      v: SAVE_VERSION, mode: 'menu', rung: r, difficulty: difficulty, chamber: 0,
      players: [makePlayer(0), makePlayer(1)],
      puzzle: { round: 0, goal: CHAMBERS[0].rounds + difficulty - 1, active: [false, false], window: 0, misses: 0, contributions: [0, 0], flash: 0 },
      guardian: null, recovery: [], treasure: null,
      shared: { score: 0, keys: 0, treasure: 0 },
      notice: 'Two raiders. Three chambers. One vault.', noticeColor: C.cyan, noticeTime: 0,
      transition: null, result: null, rng: (0x4d595df4 + r * 977) >>> 0, runTime: 0,
      fx: effects.particles, rings: effects.rings, ringIndex: effects.ringIndex
    };
  }

  function validPlayer(p) {
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isInteger(p.hp) && p.hp >= 0 && p.hp <= 5 &&
      typeof p.downed === 'boolean' && Number.isFinite(p.score) && Number.isFinite(p.puzzleScore) &&
      Number.isFinite(p.combatScore) && Number.isFinite(p.treasure);
  }
  function validRun(value) {
    if (!value || typeof value !== 'object' || value.v !== SAVE_VERSION || ['chamber', 'guardian', 'vault', 'failed'].indexOf(value.mode) < 0) return false;
    if (!Number.isInteger(value.rung) || value.rung < 0 || value.rung > 19 || !Number.isInteger(value.chamber) || value.chamber < 0 || value.chamber > 2) return false;
    if (!Array.isArray(value.players) || value.players.length !== 2 || !validPlayer(value.players[0]) || !validPlayer(value.players[1])) return false;
    if (!value.puzzle || !Array.isArray(value.puzzle.active) || value.puzzle.active.length !== 2) return false;
    if (!value.shared || !Number.isFinite(value.shared.score)) return false;
    if (value.mode === 'guardian' && (!value.guardian || !Number.isFinite(value.guardian.hp))) return false;
    if (value.mode === 'vault' && (!value.treasure || !Array.isArray(value.treasure.choices))) return false;
    return true;
  }
  function validateProfile(value) {
    return !!(value && typeof value === 'object' && value.v === SAVE_VERSION && Number.isInteger(value.wins) && value.wins >= 0 &&
      Number.isFinite(value.bestScore) && (value.active == null || validRun(value.active)));
  }
  function defaultProfile() { return { v: SAVE_VERSION, wins: 0, bestScore: 0, active: null }; }

  var profile;
  var state = makeState(0);
  var Game = { phaser: null, play: null };
  var keyEdges = {};
  var pointerEdges = {};
  var gamepads = [null, null];
  var padEdges = [{}, {}];
  var padNotice = '';

  var kit = root.GGKit.create({
    slug: 'vault-raiders', orientation: 'portrait', validateSave: validateProfile,
    onPause: function () { keyEdges = {}; pointerEdges = {}; if (Game.play) Game.play.saveActive(); },
    onResume: function () { keyEdges = {}; pointerEdges = {}; },
    onRestart: function () { if (Game.play) Game.play.startNewRun(state.rung); }
  });
  profile = kit.save.get(defaultProfile());
  if (!validateProfile(profile)) profile = defaultProfile();
  kit.audio.register(AUDIO);

  function persist() { kit.save.set(profile); }
  function snapshot() {
    var s = state;
    return {
      v: SAVE_VERSION, mode: s.mode, rung: s.rung, difficulty: s.difficulty, chamber: s.chamber,
      players: copy(s.players), puzzle: copy(s.puzzle), guardian: copy(s.guardian), recovery: copy(s.recovery),
      treasure: copy(s.treasure), shared: copy(s.shared), transition: copy(s.transition), rng: s.rng, runTime: s.runTime
    };
  }
  function sfx(name, options) { kit.audio.sfx(name, options || { volume: 0.8 }); }
  function setNotice(message, tint, seconds) {
    state.notice = message; state.noticeColor = tint || C.ink; state.noticeTime = seconds == null ? 2.4 : seconds; announce(message);
  }

  function keyPressed(code) {
    var down = !!kit.input.keyDown(code);
    var edge = down && !keyEdges[code];
    keyEdges[code] = down;
    return edge;
  }
  function held(code) { return !!kit.input.keyDown(code); }

  function restoreRun(saved) {
    if (!validRun(saved)) return null;
    var restored = makeState(saved.rung);
    var keys;
    for (keys in saved) if (Object.prototype.hasOwnProperty.call(saved, keys)) restored[keys] = copy(saved[keys]);
    restored.notice = 'Raid restored. Reconnect and coordinate.';
    restored.noticeColor = C.mint;
    restored.noticeTime = 2.5;
    restored.transition = null;
    restored.result = null;
    return restored;
  }

  var vr = root.__vr = root.__vr || {};
  vr.state = state;
  vr.forceRung = function (rung) { var next = clamp(whole(rung, 0), 0, 19); if (Game.play) Game.play.startNewRun(next); else { state = makeState(next); state.mode = 'chamber'; vr.state = state; } };
  vr.forceVillage = vr.forceRung;
  vr.forcePhase = function (phase) { if (!Game.play) return; if (phase === 'guardian') Game.play.beginGuardian(); else if (phase === 'vault') Game.play.finishGuardian(); };

  function addText(scene, parent, x, y, value, size, tint, align, style) {
    var node = scene.add.text(x, y, value, { fontFamily: FONT, fontSize: String(size) + 'px', fontStyle: style || 'normal', color: tint || C.ink, resolution: 2 });
    node.setOrigin(align === 'left' ? 0 : align === 'right' ? 1 : 0.5, 0.5);
    parent.add(node);
    return node;
  }
  function box(scene, parent, x, y, w, h, fill, stroke, alpha) {
    var g = scene.add.graphics();
    g.fillStyle(color(fill || C.wall), alpha == null ? 1 : alpha);
    g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 14);
    g.lineStyle(2, color(stroke || C.line), 0.9);
    g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 14);
    parent.add(g);
    return g;
  }
  function line(g, width, tint, alpha, x1, y1, x2, y2) {
    g.lineStyle(width, color(tint), alpha == null ? 1 : alpha);
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokePath();
  }

  function drawDoor(g, x, y, w, h, tint, open) {
    g.fillStyle(color('#081723'), 1); g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 28);
    g.lineStyle(4, color(tint), 0.9); g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 28);
    g.fillStyle(color(tint), 0.12); g.fillEllipse(x, y - 12, w * 0.72, h * 0.72);
    g.fillStyle(color(tint), 0.7); g.fillCircle(x, y - 16, 8);
    line(g, 3, tint, 0.55, x, y - h / 2 + 24, x, y + h / 2 - 20);
    if (open) { line(g, 4, C.gold, 0.7, x - 30, y + 30, x - 10, y + 8); line(g, 4, C.gold, 0.7, x + 30, y + 30, x + 10, y + 8); }
  }
  function drawPlayer(g, p, index, time) {
    var tint = index ? C.p2 : C.p1;
    var dark = index ? C.p2Dark : C.p1Dark;
    var bob = Math.sin(time * 5 + p.bob) * (p.downed ? 0 : 3);
    var x = p.x, y = p.y + bob;
    g.fillStyle(color('#02070d'), 0.55); g.fillEllipse(x, y + 35, 58, 15);
    g.fillStyle(color(dark), 1);
    g.beginPath(); g.moveTo(x - 24, y + 27); g.lineTo(x - 35, y + 50); g.lineTo(x - 4, y + 42); g.lineTo(x + 25, y + 50); g.lineTo(x + 22, y + 25); g.closePath(); g.fillPath();
    g.fillStyle(color(tint), p.downed ? 0.38 : 1); g.fillCircle(x, y - 2, 23); g.fillRoundedRect(x - 20, y + 15, 40, 30, 11);
    g.fillStyle(color('#e8f8ff'), p.downed ? 0.35 : 1); g.fillCircle(x - 8, y - 5, 5); g.fillCircle(x + 8, y - 5, 5);
    g.fillStyle(color('#091827'), 1); g.fillCircle(x - 7, y - 4, 2.5); g.fillCircle(x + 9, y - 4, 2.5);
    line(g, 4, tint, 0.9, x - 22, y - 30, x + 22, y - 30);
    var weaponX = index ? -25 : 25, weaponTip = index ? -52 : 52, weaponY = p.attackFlash > 0 ? y - 34 : y - 21;
    line(g, 5, C.gold, p.downed ? 0.25 : 0.95, x + weaponX, y + 1, x + weaponTip, weaponY);
    if (p.attackFlash > 0 && !p.downed) { g.lineStyle(4, color(C.gold), clamp(p.attackFlash / 0.24, 0, 1)); g.strokeCircle(x + (index ? -30 : 30), y - 4, 30); }
    if (p.puzzleFlash > 0 && !p.downed) { g.lineStyle(3, color(tint), clamp(p.puzzleFlash / 0.6, 0, 1)); g.strokeCircle(x, y + 4, 34); }
    if (p.downed) { line(g, 4, C.rose, 1, x - 12, y - 14, x + 12, y + 10); line(g, 4, C.rose, 1, x + 12, y - 14, x - 12, y + 10); }
  }
  function drawGuardian(g, boss, time) {
    var x = boss.x, y = boss.y + Math.sin(time * 2.5) * 4;
    g.fillStyle(color('#050712'), 0.6); g.fillEllipse(x, y + 92, 154, 28);
    g.fillStyle(color(C.bossDark), 1);
    g.beginPath(); g.moveTo(x - 70, y + 61); g.lineTo(x - 88, y + 18); g.lineTo(x - 62, y - 48); g.lineTo(x - 28, y - 72); g.lineTo(x, y - 57); g.lineTo(x + 28, y - 72); g.lineTo(x + 62, y - 48); g.lineTo(x + 88, y + 18); g.lineTo(x + 70, y + 61); g.closePath(); g.fillPath();
    g.lineStyle(5, color(C.boss), 0.95); g.strokePath();
    g.fillStyle(color(C.boss), 0.95); g.fillCircle(x, y - 13, 44);
    g.fillStyle(color(C.rose), 0.9); g.fillCircle(x - 16, y - 14, 7); g.fillCircle(x + 16, y - 14, 7);
    g.fillStyle(color('#130d2b'), 1); g.fillCircle(x - 16, y - 14, 3); g.fillCircle(x + 16, y - 14, 3);
    line(g, 5, C.gold, 0.9, x - 38, y - 61, x - 55, y - 95); line(g, 5, C.gold, 0.9, x + 38, y - 61, x + 55, y - 95);
    line(g, 4, boss.phase === 'open' ? C.mint : C.violet, 0.9, x - 40, y + 28, x + 40, y + 28);
  }
  function drawChest(g, x, y, tint, selected, claimed) {
    var body = claimed ? '#263746' : tint;
    g.fillStyle(color('#050c12'), 0.6); g.fillEllipse(x, y + 46, 130, 18);
    g.fillStyle(color(body), claimed ? 0.5 : 1); g.fillRoundedRect(x - 52, y - 3, 104, 50, 8);
    g.fillStyle(color(claimed ? '#41505a' : tint), claimed ? 0.5 : 1); g.fillRoundedRect(x - 52, y - 34, 104, 40, 18);
    g.lineStyle(selected ? 5 : 2, color(selected ? C.mint : C.line), selected ? 1 : 0.9); g.strokeRoundedRect(x - 58, y - 40, 116, 92, 12);
    g.fillStyle(color(C.gold), claimed ? 0.2 : 1); g.fillRect(x - 5, y - 2, 10, 23); g.fillCircle(x, y + 10, 7);
    if (claimed) { line(g, 4, C.dim, 0.8, x - 20, y - 10, x + 20, y + 20); }
  }
  function emit(s, x, y, tint, count, kind) {
    var n = count || 10;
    for (var i = 0; i < n; i++) {
      var slot = null;
      for (var k = 0; k < s.fx.length; k++) if (!s.fx[k].active) { slot = s.fx[k]; break; }
      if (!slot) slot = s.fx[i % s.fx.length];
      slot.active = true; slot.x = x; slot.y = y; slot.vx = (Math.random() * 2 - 1) * (kind === 'unlock' ? 120 : 190);
      slot.vy = (Math.random() * 2 - 1) * (kind === 'hit' ? 180 : 120); slot.life = slot.max = 0.35 + Math.random() * 0.45;
      slot.size = 2 + Math.random() * 5; slot.color = tint; slot.kind = kind || 'spark';
    }
    var ring = s.rings[s.ringIndex++ % s.rings.length];
    ring.active = true; ring.x = x; ring.y = y; ring.life = ring.max = kind === 'unlock' ? 0.7 : 0.4; ring.radius = 8; ring.maxRadius = kind === 'unlock' ? 100 : 68; ring.color = tint; ring.kind = kind || 'ring';
  }
  function makeFx() {
    var out = [], rings = [];
    for (var i = 0; i < MAX_PARTICLES; i++) out.push({ active: false });
    for (var j = 0; j < 14; j++) rings.push({ active: false });
    return { particles: out, rings: rings, ringIndex: 0 };
  }

  var BootScene = {
    key: 'boot',
    create: function () {
      kit.loader.show('VAULT RAIDERS'); kit.loader.progress(0.35);
      kit.audio.preload(Object.keys(AUDIO)).then(function () { kit.loader.progress(1); kit.loader.hide(); this.scene.start('play'); }.bind(this));
    }
  };

  var PlayScene = {
    key: 'play',
    create: function () {
      Game.play = this; this.root = this.add.container(0, 0); this.view = null; this.layout = { k: 1, x: 0, y: 0 };
      this.hitZones = []; this.textRefs = {}; this.lastMode = ''; this.acc = 0; this.time = 0;
      this.scale.on('resize', this.layoutScene, this); this.layoutScene();
      var saved = profile.active && validRun(profile.active) ? restoreRun(profile.active) : null;
      state = saved || makeState(0); state.mode = 'menu'; state.resume = !!saved; state.notice = saved ? 'A saved raid is waiting.' : state.notice;
      this.state = state; vr.state = state; this.syncMode(true);
      if (root.addEventListener) {
        root.addEventListener('gamepadconnected', function () { padNotice = 'Controller ready. P1 and P2 may use gamepads.'; setNoticeSafe(padNotice); });
        root.addEventListener('gamepaddisconnected', function () { padNotice = 'Controller disconnected. Keyboard fallback active.'; setNoticeSafe(padNotice); });
      }
    },
    layoutScene: function () {
      var width = this.scale.width || root.innerWidth || W, height = this.scale.height || root.innerHeight || H;
      this.layout.k = Math.min(width / W, height / H); this.layout.x = (width - W * this.layout.k) * 0.5; this.layout.y = (height - H * this.layout.k) * 0.5;
      this.root.setPosition(this.layout.x, this.layout.y).setScale(this.layout.k);
    },
    clearView: function () {
      if (this.view) this.view.destroy(true);
      this.view = this.add.container(0, 0); this.root.add(this.view); this.hitZones = []; this.textRefs = {};
      this.artG = this.add.graphics(); this.actorG = this.add.graphics(); this.fxG = this.add.graphics(); this.uiG = this.add.graphics();
      this.view.add([this.artG, this.fxG, this.actorG, this.uiG]);
    },
    addZone: function (x, y, w, h, action) { this.hitZones.push({ x: x - w / 2, y: y - h / 2, w: w, h: h, action: action }); },
    addButton: function (x, y, w, h, label, tint, action, sub) {
      box(this, this.view, x, y, w, h, C.wall2, tint, 1);
      addText(this, this.view, x, y - (sub ? 10 : 0), label, 18, tint, 'center', 'bold');
      if (sub) addText(this, this.view, x, y + 17, sub, 11, C.dim, 'center', 'normal');
      this.addZone(x, y, w, h, action);
    },
    syncMode: function (force) {
      if (!force && this.lastMode === state.mode) return;
      this.lastMode = state.mode; this.clearView();
      if (state.mode === 'menu') this.renderMenu();
      else if (state.mode === 'chamber') this.renderChamber();
      else if (state.mode === 'guardian') this.renderGuardian();
      else if (state.mode === 'vault') this.renderVault();
      else if (state.mode === 'results') this.renderResults();
      else if (state.mode === 'failed') this.renderFailed();
      this.layoutScene();
    },
    startNewRun: function (rung) {
      state = makeState(rung == null ? 0 : rung); state.mode = 'chamber'; state.resume = false; this.state = state; vr.state = state;
      kit.input.clearAll(); keyEdges = {}; pointerEdges = {}; profile.active = snapshot(); persist();
      kit.audio.music('music', 600); sfx('select', { volume: 0.5 });
      setNotice('CHAMBER 1. P1 left sigil. P2 right sigil. Sync together.', C.cyan, 4);
      this.syncMode(true);
    },
    continueRun: function () {
      var loaded = restoreRun(profile.active); if (!loaded) { this.startNewRun(0); return; }
      state = loaded; this.state = state; vr.state = state; state.resume = false;
      if (state.mode === 'failed') { this.beginGuardian(); return; }
      persist(); kit.audio.music('music', 600); this.syncMode(true);
    },
    saveActive: function () {
      if (state.mode !== 'menu' && state.mode !== 'results') { profile.active = snapshot(); persist(); }
    },
    beginChamber: function () {
      var ch = CHAMBERS[state.chamber]; state.mode = 'chamber'; state.players.forEach(function (p, i) { var start = playerStart(i); p.x = start.x; p.y = start.y; p.downed = false; p.hp = Math.max(2, p.hp); });
      state.puzzle = { round: 0, goal: ch.rounds + state.difficulty - 1, active: [false, false], window: 0, misses: 0, contributions: [0, 0], flash: 0 };
      setNotice(ch.name + ': ' + ch.hint, ch.accent, 3.5); persist(); this.syncMode(true);
    },
    beginGuardian: function () {
      var hp = 18 + state.difficulty * 7; state.mode = 'guardian'; state.guardian = { x: W / 2, y: 430, hp: hp, maxHp: hp, phase: 'windup', timer: 1.8, telegraph: '', telegraphTime: 0, vulnerable: 0, pattern: 0, pulse: 0 };
      state.recovery = []; state.players.forEach(function (p, i) { var start = playerStart(i); p.x = start.x; p.y = start.y; p.hp = Math.max(2, p.hp); p.downed = false; });
      setNotice('VAULT GUARDIAN: read the ring, evade, then strike the open heart.', C.violet, 4); sfx('guardianAttack', { volume: 0.45 }); persist(); this.syncMode(true);
    },
    finishGuardian: function () {
      state.mode = 'vault'; state.guardian = null; state.treasure = { piles: [
        { name: 'EMBER CACHE', value: 90 + state.difficulty * 10, tint: C.orange },
        { name: 'PRISM CACHE', value: 120 + state.difficulty * 12, tint: C.violet },
        { name: 'TWIN CACHE', value: 75 + state.difficulty * 14, tint: C.cyan }
      ], choices: [null, null], locked: [false, false], shared: 0 };
      setNotice('VAULT OPEN. Each raider chooses a cache. Same cache splits its value.', C.gold, 4); sfx('victory', { volume: 0.78 }); persist(); this.syncMode(true);
    },
    failRun: function () { state.mode = 'failed'; profile.active = snapshot(); persist(); setNotice('Both raiders are down. Retry the guardian or return to the lobby.', C.rose, 4); sfx('down', { volume: 0.7 }); this.syncMode(true); },
    chooseTreasure: function (player, index) {
      if (!state.treasure || state.treasure.locked[player]) return;
      var p = state.players[player]; p.choice = clamp(index, 0, 2); sfx('select', { volume: 0.42 }); setNotice('P' + (player + 1) + ' points to ' + state.treasure.piles[p.choice].name + '.', player ? C.p2 : C.p1, 1.2);
    },
    claimTreasure: function (player) {
      if (!state.treasure || state.treasure.locked[player]) return;
      state.treasure.choices[player] = state.players[player].choice; state.treasure.locked[player] = true; state.players[player].claimed = true; sfx('treasure', { volume: 0.68 });
      if (state.treasure.locked[0] && state.treasure.locked[1]) this.resolveTreasure();
      else setNotice('P' + (player + 1) + ' claimed. Waiting for the other raider.', C.gold, 2);
    },
    resolveTreasure: function () {
      var a = state.treasure.choices[0], b = state.treasure.choices[1], av = state.treasure.piles[a].value, bv = state.treasure.piles[b].value;
      var p1 = a === b ? Math.floor(av / 2) : av, p2 = a === b ? av - p1 : bv;
      state.players[0].treasure = p1; state.players[1].treasure = p2; state.players[0].score += p1; state.players[1].score += p2; state.shared.treasure = p1 + p2; state.shared.score += p1 + p2;
      state.result = { p1: p1, p2: p2, shared: p1 + p2, same: a === b, time: Math.round(state.runTime) };
      profile.wins++; profile.bestScore = Math.max(profile.bestScore, state.players[0].score + state.players[1].score); profile.active = null; persist(); state.mode = 'results'; setNotice('Treasure secured. The vault remembers both raiders.', C.gold, 3); this.syncMode(true);
    },
    step: function (dt) {
      state.runTime += dt; if (state.noticeTime > 0) state.noticeTime -= dt; if (state.puzzle.flash > 0) state.puzzle.flash -= dt;
      if (state.transition) { state.transition.timer -= dt; this.updateFx(dt); if (state.transition.timer <= 0) { var kind = state.transition.kind; state.transition = null; if (kind === 'next') { state.chamber++; this.beginChamber(); } else if (kind === 'guardian') this.beginGuardian(); else if (kind === 'vault') this.finishGuardian(); } return; }
      if (state.mode === 'chamber') this.stepChamber(dt); else if (state.mode === 'guardian') this.stepGuardian(dt);
      this.updateFx(dt); this.autosave += dt; if (this.autosave > 1.1) { this.autosave = 0; this.saveActive(); }
    },
    stepChamber: function (dt) {
      this.stepPlayers(dt); var q = state.puzzle; if (q.window > 0) q.window -= dt;
      if (q.window <= 0 && (q.active[0] || q.active[1])) { q.active = [false, false]; q.misses++; setNotice('SYNC MISSED. Return to your sigils and try again.', C.orange, 1.6); }
    },
    stepPlayers: function (dt) {
      for (var i = 0; i < 2; i++) { var p = state.players[i], axis = this.axes[i]; p.invuln = Math.max(0, p.invuln - dt); p.attackCooldown = Math.max(0, p.attackCooldown - dt); p.dashCooldown = Math.max(0, p.dashCooldown - dt); p.attackFlash = Math.max(0, p.attackFlash - dt); p.puzzleFlash = Math.max(0, p.puzzleFlash - dt); if (!p.downed) this.movePlayer(p, axis.x, axis.y, dt); }
    },
    movePlayer: function (p, x, y, dt) {
      var len = Math.sqrt(x * x + y * y); if (len > 1) { x /= len; y /= len; } if (len > 0.08) { p.lastX = x; p.lastY = y; p.x += x * 205 * dt; p.y += y * 205 * dt; }
      p.x = clamp(p.x, 72, W - 72); p.y = clamp(p.y, 285, 745);
    },
    stepGuardian: function (dt) {
      this.stepPlayers(dt); var g = state.guardian;
      for (var i = 0; i < state.recovery.length; i++) { var kitPickup = state.recovery[i]; kitPickup.ttl -= dt; if (kitPickup.ttl <= 0) kitPickup.active = false; }
      for (var pIndex = 0; pIndex < 2; pIndex++) {
        var p = state.players[pIndex]; if (p.downed) continue;
        for (var r = 0; r < state.recovery.length; r++) { var rec = state.recovery[r]; if (rec.active && dist(p, rec) < 42) { var target = state.players[rec.owner]; if (target.downed) { target.downed = false; target.hp = 2; } else target.hp = Math.min(target.maxHp, target.hp + 2); rec.active = false; emit(state, rec.x, rec.y, C.mint, 12, 'recovery'); sfx('recovery', { volume: 0.62 }); setNotice('RECOVERY PICKUP: P' + (rec.owner + 1) + ' is back in the raid.', C.mint, 2); } }
      }
      state.recovery = state.recovery.filter(function (r) { return r.active; });
      if (state.players[0].downed && state.players[1].downed) { this.failRun(); return; }
      if (g.phase === 'windup') { g.timer -= dt; if (g.timer <= 0) { g.phase = 'telegraph'; g.telegraph = g.pattern % 2 ? 'BEAM' : 'RING'; g.telegraphTime = 0.9; g.pattern++; g.pulse = 0.9; setNotice(g.telegraph === 'RING' ? 'RING BLAST: move outside the violet circle.' : 'BEAM SWEEP: move to a side lane.', C.rose, 1.1); emit(state, g.x, g.y, C.rose, 10, 'guardian'); sfx('guardianAttack', { volume: 0.62, rate: g.pattern % 2 ? 1.1 : 0.84 }); } }
      else if (g.phase === 'telegraph') { g.telegraphTime -= dt; g.pulse = g.telegraphTime; if (g.telegraphTime <= 0) { this.resolveGuardianAttack(); } }
      else if (g.phase === 'open') { g.vulnerable -= dt; if (g.vulnerable <= 0) { g.phase = 'windup'; g.timer = Math.max(1.1, 2.5 - state.difficulty * 0.22); setNotice('The heart closes. Read the next attack.', C.dim, 1.2); } }
    },
    resolveGuardianAttack: function () {
      var g = state.guardian; for (var i = 0; i < 2; i++) { var p = state.players[i], safe = p.invuln > 0; if (g.telegraph === 'RING') safe = safe || dist(p, g) > 190; else safe = safe || Math.abs(p.x - g.x) > 130; if (!safe) this.hurtPlayer(i); }
      g.phase = 'open'; g.vulnerable = Math.max(0.9, 1.55 - state.difficulty * 0.1); g.pulse = 0; setNotice('HEART OPEN. Attack now while the core is mint.', C.mint, g.vulnerable); emit(state, g.x, g.y, C.mint, 16, 'open'); sfx('guardianHit', { volume: 0.55 });
    },
    hurtPlayer: function (index) {
      var p = state.players[index]; if (p.invuln > 0 || p.downed) return; p.hp = Math.max(0, p.hp - 1); p.invuln = 1; emit(state, p.x, p.y, C.rose, 9, 'hit'); kit.juice.shake(3, 100); sfx('hit', { volume: 0.6 });
      if (p.hp === 0) { p.downed = true; state.recovery.push({ x: p.x, y: p.y, owner: index, ttl: 9, active: true }); setNotice('P' + (index + 1) + ' is DOWN. Revive nearby or find the recovery spark.', C.rose, 2.5); sfx('down', { volume: 0.68 }); }
    },
    playerAction: function (index, action) {
      if (state.mode === 'chamber' && action === 'interact') { var q = state.puzzle, spot = station(index), p = state.players[index]; if (dist(p, spot) > 82) { setNotice('P' + (index + 1) + ' needs to reach the ' + (index ? 'RIGHT' : 'LEFT') + ' SIGIL.', index ? C.p2 : C.p1, 1.3); return; } if (q.active[index]) return; p.puzzleFlash = 0.6; q.active[index] = true; q.window = 1.25; q.contributions[index]++; emit(state, spot.x, spot.y, index ? C.p2 : C.p1, 11, 'puzzle'); sfx('puzzle', { volume: 0.5 }); setNotice('P' + (index + 1) + ' locked the ' + (index ? 'RIGHT' : 'LEFT') + ' SIGIL. Waiting for partner.', index ? C.p2 : C.p1, 1.4); if (q.active[0] && q.active[1]) this.solvePuzzle(); return; }
      if ((state.mode === 'chamber' || state.mode === 'guardian') && action === 'dash') {
        var dashPlayer = state.players[index]; if (dashPlayer.dashCooldown > 0 || dashPlayer.downed) return;
        dashPlayer.dashCooldown = 1.1; dashPlayer.invuln = 0.42; dashPlayer.x = clamp(dashPlayer.x + dashPlayer.lastX * 105, 72, W - 72); dashPlayer.y = clamp(dashPlayer.y + dashPlayer.lastY * 105, 285, 745);
        emit(state, dashPlayer.x, dashPlayer.y, index ? C.p2 : C.p1, 8, 'dash'); sfx('select', { volume: 0.32, rate: 1.3 }); return;
      }
      if (state.mode === 'guardian') {
        var p2 = state.players[index], g = state.guardian;
        if (action === 'interact') { var other = state.players[1 - index]; if (other.downed && dist(p2, other) < 90) { other.downed = false; other.hp = 2; other.invuln = 1; emit(state, other.x, other.y, C.mint, 18, 'recovery'); sfx('recovery', { volume: 0.7 }); setNotice('P' + (index + 1) + ' revived P' + (2 - index) + '. Stay together.', C.mint, 2); } return; }
        if (action === 'attack') { if (p2.attackCooldown > 0 || p2.downed) return; p2.attackCooldown = 0.46; if (g.phase !== 'open') { setNotice('WAIT FOR OPEN. The guardian is armored.', C.dim, 0.9); return; } if (dist(p2, g) > 190) { setNotice('P' + (index + 1) + ' is out of range. Move toward the open heart.', index ? C.p2 : C.p1, 1); return; } p2.attackFlash = 0.24; g.hp = Math.max(0, g.hp - (2 + (index === 0 ? 0 : 1))); p2.combatScore += 18; p2.score += 18; state.shared.score += 18; emit(state, g.x, g.y, index ? C.p2 : C.p1, 14, 'hit'); kit.juice.hitStop(55); kit.juice.shake(2, 70); sfx('swing', { volume: 0.48, rate: index ? 1.1 : 0.95 }); sfx('guardianHit', { volume: 0.72, rate: index ? 1.1 : 0.95 }); if (g.hp <= 0) { g.phase = 'defeated'; emit(state, g.x, g.y, C.gold, 32, 'defeat'); sfx('victory', { volume: 0.82 }); setNotice('GUARDIAN DEFEATED. The vault is opening.', C.gold, 1.2); state.transition = { kind: 'vault', timer: 1.25 }; } else setNotice('HEART STRUCK. ' + g.hp + ' GUARDIAN HP REMAINS.', C.mint, 0.8); }
      }
    },
    solvePuzzle: function () {
      var q = state.puzzle; q.active = [false, false]; q.window = 0; q.round++; q.flash = 0.8; for (var i = 0; i < 2; i++) { state.players[i].puzzleScore += 25; state.players[i].score += 25; state.shared.score += 25; } emit(state, W / 2, 520, CHAMBERS[state.chamber].accent, 24, 'unlock'); sfx('unlock', { volume: 0.72 });
      if (q.round >= q.goal) { state.shared.keys++; setNotice('CHAMBER UNLOCKED. Gate ' + (state.chamber + 1) + ' opens.', C.gold, 1); state.transition = { kind: state.chamber >= CHAMBERS.length - 1 ? 'guardian' : 'next', timer: 1.15 }; } else setNotice('SYNC ' + q.round + '/' + q.goal + ' COMPLETE. Reset and pair again.', C.mint, 1.4);
    },
    updateFx: function (dt) {
      var f = state.fx; for (var i = 0; i < f.length; i++) if (f[i].active) { f[i].x += f[i].vx * dt; f[i].y += f[i].vy * dt; f[i].vy += 170 * dt; f[i].life -= dt; if (f[i].life <= 0) f[i].active = false; }
      for (var r = 0; r < state.rings.length; r++) if (state.rings[r].active) { state.rings[r].life -= dt; state.rings[r].radius += (state.rings[r].maxRadius - state.rings[r].radius) * dt * 5; if (state.rings[r].life <= 0) state.rings[r].active = false; }
    },
    update: function (time, delta) {
      if (kit.paused) return; var frame = Math.min(0.05, Math.max(0, (delta || 0) / 1000)); this.time += frame; this.pollGamepads(); this.readInput(); this.acc = Math.min(0.2, this.acc + frame); var steps = 0; while (this.acc >= STEP && steps < MAX_STEPS) { this.acc -= STEP; this.step(STEP); steps++; } if (steps === MAX_STEPS) this.acc = 0; this.paint();
    },
    pollGamepads: function () {
      if (!root.navigator || !root.navigator.getGamepads) { this.padAxes = [{ x: 0, y: 0 }, { x: 0, y: 0 }]; return; }
      for (var i = 0; i < 2; i++) { var pad = pads[i] && pads[i].connected ? pads[i] : null; if (pad && !gamepads[i]) padNotice = 'P' + (i + 1) + ' controller ready.'; if (!pad && gamepads[i]) padNotice = 'P' + (i + 1) + ' controller disconnected. Keyboard fallback active.'; gamepads[i] = pad; if (!pad) { padEdges[i] = {}; continue; } var ax = Math.abs(pad.axes[0] || 0) < 0.22 ? 0 : pad.axes[0]; var ay = Math.abs(pad.axes[1] || 0) < 0.22 ? 0 : pad.axes[1]; this.padAxes[i] = { x: ax, y: ay }; if (this.padPressed(i, 9)) { kit.openSettings(); continue; } var primary = this.padPressed(i, 0); if (state.mode === 'vault' && primary) this.claimTreasure(i); else if (primary) this.playerAction(i, state.mode === 'guardian' ? 'attack' : 'interact'); if (this.padPressed(i, 1)) this.playerAction(i, 'dash'); if (this.padPressed(i, 2)) this.playerAction(i, 'interact'); if (state.mode === 'vault') { if (this.padPressed(i, 14)) this.chooseTreasure(i, state.players[i].choice - 1); if (this.padPressed(i, 15)) this.chooseTreasure(i, state.players[i].choice + 1); } }
    },
    padPressed: function (player, button) { var pad = gamepads[player]; if (!pad) return false; var down = !!(pad.buttons[button] && pad.buttons[button].pressed); var edge = down && !padEdges[player][button]; padEdges[player][button] = down; return edge; },
    readInput: function () {
      if (keyPressed('Escape') || keyPressed('KeyP')) { if (state.mode !== 'menu' && state.mode !== 'results' && state.mode !== 'failed') kit.openSettings(); return; }
      if (state.mode === 'menu') { if (keyPressed('Space') || keyPressed('Enter') || keyPressed('KeyF')) { if (state.resume) this.continueRun(); else this.startNewRun(0); } return; }
      if (state.mode === 'results') { if (keyPressed('Space') || keyPressed('Enter')) { this.startNewRun(Math.min(19, state.rung + 1)); } return; }
      if (state.mode === 'failed') { if (keyPressed('Space') || keyPressed('Enter')) { this.beginGuardian(); } if (keyPressed('KeyM')) { state = makeState(0); state.mode = 'menu'; state.resume = false; this.state = state; vr.state = state; profile.active = null; persist(); this.syncMode(true); } return; }
      var a1 = { x: (held('KeyD') ? 1 : 0) - (held('KeyA') ? 1 : 0), y: (held('KeyS') ? 1 : 0) - (held('KeyW') ? 1 : 0) };
      var a2 = { x: (held('ArrowRight') ? 1 : 0) - (held('ArrowLeft') ? 1 : 0), y: (held('ArrowDown') ? 1 : 0) - (held('ArrowUp') ? 1 : 0) };
      if (this.padAxes) { if (this.padAxes[0].x || this.padAxes[0].y) a1 = this.padAxes[0]; if (this.padAxes[1].x || this.padAxes[1].y) a2 = this.padAxes[1]; }
      this.axes = [a1, a2];
      if (state.mode === 'chamber') { if (keyPressed('KeyF')) this.playerAction(0, 'interact'); if (keyPressed('Enter')) this.playerAction(1, 'interact'); if (keyPressed('KeyH')) this.playerAction(0, 'dash'); if (keyPressed('Period')) this.playerAction(1, 'dash'); }
      else if (state.mode === 'guardian') { if (keyPressed('KeyF')) this.playerAction(0, 'interact'); if (keyPressed('KeyG')) this.playerAction(0, 'attack'); if (keyPressed('KeyH')) this.playerAction(0, 'dash'); if (keyPressed('Enter')) this.playerAction(1, 'interact'); if (keyPressed('Slash')) this.playerAction(1, 'attack'); if (keyPressed('Period')) this.playerAction(1, 'dash'); }
      else if (state.mode === 'vault') { if (keyPressed('KeyA')) this.chooseTreasure(0, state.players[0].choice - 1); if (keyPressed('KeyD')) this.chooseTreasure(0, state.players[0].choice + 1); if (keyPressed('KeyF')) this.claimTreasure(0); if (keyPressed('ArrowLeft')) this.chooseTreasure(1, state.players[1].choice - 1); if (keyPressed('ArrowRight')) this.chooseTreasure(1, state.players[1].choice + 1); if (keyPressed('Enter')) this.claimTreasure(1); }
    },
    pointerLocal: function (pointer) { var canvas = this.game.canvas, rect = canvas.getBoundingClientRect(); return { x: clamp((pointer.x - rect.left) / Math.max(1, rect.width) * W, 0, W), y: clamp((pointer.y - rect.top) / Math.max(1, rect.height) * H, 0, H) }; },
    readPointers: function () {
      var live = {}; kit.input.pointers.forEach(function (p, id) { live[id] = true; if (pointerEdges[id] !== p.downAt) { pointerEdges[id] = p.downAt; var local = this.pointerLocal(p); p.zone = state.mode + '-p' + (local.x < W / 2 ? '1' : '2'); this.handlePointer(local.x, local.y); } }, this); for (var id in pointerEdges) if (!live[id]) delete pointerEdges[id];
    },
    handlePointer: function (x, y) {
      for (var i = 0; i < this.hitZones.length; i++) { var z = this.hitZones[i]; if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) { z.action(); return; } }
      if (state.mode === 'chamber' || state.mode === 'guardian') { var p = x < W / 2 ? 0 : 1; this.playerAction(p, y > 720 ? 'dash' : state.mode === 'guardian' && y > 570 ? 'attack' : 'interact'); }
      else if (state.mode === 'vault') { if (y > 360 && y < 650) { var choice = x < W / 3 ? 0 : x < W * 2 / 3 ? 1 : 2; this.chooseTreasure(x < W / 2 ? 0 : 1, choice); } else if (y > 650) this.claimTreasure(x < W / 2 ? 0 : 1); }
    },
    paint: function () {
      this.readPointers(); this.drawFx(); this.drawActors(); this.updateText();
    },
    drawFx: function () {
      var g = this.fxG; if (!g) return; g.clear(); for (var i = 0; i < state.fx.length; i++) { var p = state.fx[i]; if (!p.active) continue; g.fillStyle(color(p.color), clamp(p.life / p.max, 0, 1)); if (p.kind === 'hit' || p.kind === 'defeat') g.fillTriangle(p.x, p.y - p.size, p.x - p.size, p.y + p.size, p.x + p.size, p.y + p.size); else g.fillCircle(p.x, p.y, p.size); } for (var r = 0; r < state.rings.length; r++) { var ring = state.rings[r]; if (!ring.active) continue; g.lineStyle(ring.kind === 'unlock' ? 5 : 3, color(ring.color), clamp(ring.life / ring.max, 0, 1)); g.strokeCircle(ring.x, ring.y, ring.radius); }
    },
    drawActors: function () {
      var g = this.actorG, u = this.uiG; if (!g) return; g.clear(); u.clear(); if (state.mode === 'chamber') { this.drawStations(u); drawPlayer(g, state.players[0], 0, this.time); drawPlayer(g, state.players[1], 1, this.time); } else if (state.mode === 'guardian') { var boss = state.guardian; drawGuardian(g, boss, this.time); drawPlayer(g, state.players[0], 0, this.time); drawPlayer(g, state.players[1], 1, this.time); this.drawRecovery(u); this.drawTelegraph(u); } else if (state.mode === 'vault') { this.drawTreasureChoices(u); }
    },
    drawStations: function (g) {
      for (var i = 0; i < 2; i++) { var s = station(i), active = state.puzzle.active[i], tint = i ? C.p2 : C.p1; g.fillStyle(color(tint), active ? 0.45 : 0.12); g.fillCircle(s.x, s.y, active ? 50 : 39); g.lineStyle(4, color(tint), 0.9); g.strokeCircle(s.x, s.y, 35); g.fillStyle(color(tint), 0.85); g.fillTriangle(s.x, s.y - 19, s.x - 16, s.y + 13, s.x + 16, s.y + 13); if (active) { g.lineStyle(3, color(C.gold), 0.9); g.strokeCircle(s.x, s.y, 52); } }
      if (state.puzzle.flash > 0) { g.lineStyle(5, color(CHAMBERS[state.chamber].accent), state.puzzle.flash); g.strokeCircle(W / 2, 520, 58 + (0.8 - state.puzzle.flash) * 70); }
    },
    drawTelegraph: function (g) {
      var boss = state.guardian; if (!boss || boss.phase !== 'telegraph') return; var a = clamp(boss.telegraphTime / 0.9, 0.2, 1); g.lineStyle(8, color(C.rose), a); if (boss.telegraph === 'RING') { g.strokeCircle(boss.x, boss.y, 190 + (1 - a) * 16); g.lineStyle(2, color(C.orange), a); g.strokeCircle(boss.x, boss.y, 218); } else { g.lineStyle(13, color(C.rose), a * 0.65); g.beginPath(); g.moveTo(44, boss.y - 60); g.lineTo(W - 44, boss.y + 60); g.strokePath(); }
    },
    drawRecovery: function (g) {
      for (var i = 0; i < state.recovery.length; i++) { var r = state.recovery[i]; g.fillStyle(color(C.mint), 0.16 + 0.08 * Math.sin(this.time * 8)); g.fillCircle(r.x, r.y, 25); g.lineStyle(3, color(C.mint), 0.95); g.strokeCircle(r.x, r.y, 16); line(g, 4, C.mint, 1, r.x - 8, r.y, r.x + 8, r.y); line(g, 4, C.mint, 1, r.x, r.y - 8, r.x, r.y + 8); }
    },
    drawTreasureChoices: function (g) {
      if (!state.treasure) return; for (var i = 0; i < 3; i++) { var x = 150 + i * 210, selected = state.players[0].choice === i || state.players[1].choice === i; drawChest(g, x, 485, state.treasure.piles[i].tint, selected, false); if (selected) { g.lineStyle(2, color(C.gold), 0.7); g.strokeCircle(x, 485, 75); } }
    },
    updateText: function () {
      if (state.mode === 'chamber' || state.mode === 'guardian') { var dash1 = state.players[0].dashCooldown <= 0 ? 'DASH OK' : 'DASH ' + state.players[0].dashCooldown.toFixed(1); var dash2 = state.players[1].dashCooldown <= 0 ? 'DASH OK' : 'DASH ' + state.players[1].dashCooldown.toFixed(1); setText(this.textRefs.p1, 'P1  HP ' + state.players[0].hp + '/5  SCORE ' + state.players[0].score + '  ' + dash1, C.p1); setText(this.textRefs.p2, 'P2  HP ' + state.players[1].hp + '/5  SCORE ' + state.players[1].score + '  ' + dash2, C.p2); setText(this.textRefs.notice, state.noticeTime > 0 ? state.notice : 'P1 and P2: move, coordinate, and watch the read.', state.noticeColor); setText(this.textRefs.pad, padNotice || 'KEYBOARD READY', C.dim); if (state.mode === 'chamber') { var q = state.puzzle; setText(this.textRefs.progress, 'SYNC ' + q.round + '/' + q.goal + '  |  KEYS ' + state.shared.keys + '  |  WINDOW ' + (q.active[0] || q.active[1] ? Math.max(0, q.window).toFixed(1) : '--')); setText(this.textRefs.chamberHint, 'MATCH THE ' + CHAMBERS[state.chamber].rune + ' RUNE  |  BOTH SIGILS MUST GLOW'); } else { var boss = state.guardian; setText(this.textRefs.progress, 'GUARDIAN HP ' + Math.max(0, boss.hp) + '/' + boss.maxHp + '  |  ' + (boss.phase === 'open' ? 'OPEN HEART' : boss.phase === 'telegraph' ? boss.telegraph + ' READ' : 'ARMORED')); setText(this.textRefs.chamberHint, 'P1 F INTERACT  G ATTACK  H DASH   |   P2 ENTER INTERACT  / ATTACK  . DASH'); } }
      else if (state.mode === 'vault') { setText(this.textRefs.notice, state.notice, state.noticeColor); if (state.treasure) { setText(this.textRefs.p1choice, state.treasure.locked[0] ? 'P1 CLAIMED' : 'P1 CHOICE: ' + state.treasure.piles[state.players[0].choice].name, C.p1); setText(this.textRefs.p2choice, state.treasure.locked[1] ? 'P2 CLAIMED' : 'P2 CHOICE: ' + state.treasure.piles[state.players[1].choice].name, C.p2); } }
    },
    drawHeader: function (title, subtitle) { addText(this, this.view, 32, 28, title, 25, C.ink, 'left', 'bold'); addText(this, this.view, 32, 58, subtitle, 13, C.dim, 'left', 'normal'); box(this, this.view, 672, 39, 52, 40, C.wall2, C.line, 1); addText(this, this.view, 672, 39, '||', 16, C.cyan, 'center', 'bold'); this.addZone(672, 39, 52, 40, function () { kit.openSettings(); }); },
    drawHud: function () { box(this, this.view, 210, 103, 330, 46, C.wall, C.line, 0.95); this.textRefs.p1 = addText(this, this.view, 34, 103, '', 13, C.p1, 'left', 'bold'); this.textRefs.p2 = addText(this, this.view, W - 34, 103, '', 13, C.p2, 'right', 'bold'); this.textRefs.progress = addText(this, this.view, W / 2, 103, '', 12, C.gold, 'center', 'bold'); this.textRefs.notice = addText(this, this.view, W / 2, 820, '', 15, C.ink, 'center', 'bold'); this.textRefs.pad = addText(this, this.view, W / 2, 850, '', 11, C.dim, 'center', 'normal'); },
    renderMenu: function () {
      this.artG.fillStyle(color(C.deep), 1); this.artG.fillRect(0, 0, W, H); this.artG.fillStyle(color(C.violet), 0.09); this.artG.fillCircle(590, 230, 220); this.artG.fillStyle(color(C.cyan), 0.08); this.artG.fillCircle(100, 700, 260); drawDoor(this.artG, W / 2, 270, 240, 300, C.violet, true); drawChest(this.artG, W / 2, 470, C.gold, false, false);
      addText(this, this.view, W / 2, 76, 'VAULT RAIDERS', 38, C.ink, 'center', 'bold'); addText(this, this.view, W / 2, 120, 'A two-player dungeon raid', 17, C.cyan, 'center', 'bold');
      box(this, this.view, W / 2, 625, 580, 160, C.wall, C.line, 0.98); addText(this, this.view, W / 2, 550, 'OBJECTIVE', 14, C.gold, 'center', 'bold'); addText(this, this.view, W / 2, 585, 'Pair both sigils, break three chambers,', 16, C.ink, 'center', 'normal'); addText(this, this.view, W / 2, 612, 'read the guardian, then split the treasure.', 16, C.ink, 'center', 'normal'); addText(this, this.view, W / 2, 655, 'P1  WASD  F INTERACT  G ATTACK  H DASH', 13, C.p1, 'center', 'bold'); addText(this, this.view, W / 2, 682, 'P2  ARROWS  ENTER INTERACT  / ATTACK  . DASH', 13, C.p2, 'center', 'bold'); addText(this, this.view, W / 2, 717, 'Gamepads 0 and 1 are supported. P1 and P2 can mix inputs.', 12, C.dim, 'center', 'normal');
      if (state.resume) { this.addButton(W / 2, 862, 300, 52, 'CONTINUE RAID', C.mint, this.continueRun.bind(this), 'Saved mid-run progress'); this.addZone(W / 2, 918, 240, 32, this.startNewRun.bind(this, 0)); addText(this, this.view, W / 2, 918, 'START NEW RAID', 12, C.dim, 'center', 'bold'); } else { this.addButton(W / 2, 862, 300, 58, 'START RAID', C.cyan, this.startNewRun.bind(this, 0), 'Press Space or tap'); }
    },
    renderChamber: function () {
      var ch = CHAMBERS[state.chamber]; this.drawHeader('CHAMBER ' + (state.chamber + 1) + ' / 3', ch.name + '  |  ' + ch.landmark + '  |  difficulty ' + state.difficulty); this.drawHud();
      this.artG.fillStyle(color(C.deep), 1); this.artG.fillRect(0, 0, W, H); this.artG.fillStyle(color(ch.accent), 0.08); this.artG.fillCircle(W / 2, 420, 310); this.artG.fillStyle(color(C.floor), 1); this.artG.fillRect(0, 260, W, 550); this.artG.fillStyle(color('#0b1a28'), 1); this.artG.fillRect(30, 290, W - 60, 475);
      for (var i = 0; i < 5; i++) { var px = 58 + i * 151; this.artG.fillStyle(color(C.wall2), 1); this.artG.fillRoundedRect(px, 285, 58, 450, 12); line(this.artG, 2, ch.accent, 0.3, px + 29, 306, px + 29, 715); }
      drawDoor(this.artG, W / 2, 340, 148, 178, ch.accent, false); line(this.artG, 3, ch.accent, 0.35, 70, 260, W - 70, 260); line(this.artG, 3, ch.accent, 0.35, 70, 765, W - 70, 765);
      addText(this, this.view, W / 2, 190, 'CO-OP PUZZLE', 20, ch.accent, 'center', 'bold'); this.textRefs.chamberHint = addText(this, this.view, W / 2, 222, '', 14, C.ink, 'center', 'bold'); addText(this, this.view, W / 2, 252, 'P1 LEFT SIGIL  +  P2 RIGHT SIGIL  |  1.25 SECOND SYNC WINDOW', 11, C.dim, 'center', 'normal');
      addText(this, this.view, 135, 575, 'P1 ANCHOR', 12, C.p1, 'center', 'bold'); addText(this, this.view, 585, 575, 'P2 ANCHOR', 12, C.p2, 'center', 'bold'); addText(this, this.view, W / 2, 765, 'Move close, press your interact key, then wait for your partner.', 13, C.dim, 'center', 'normal'); this.updateText();
    },
    renderGuardian: function () {
      var ch = CHAMBERS[state.chamber]; this.drawHeader('GUARDIAN GATE', ch.name + '  |  ' + state.guardian.maxHp + ' heart armor'); this.drawHud();
      this.artG.fillStyle(color('#0b1021'), 1); this.artG.fillRect(0, 0, W, H); this.artG.fillStyle(color(C.boss), 0.09); this.artG.fillCircle(W / 2, 430, 340); this.artG.fillStyle(color('#172038'), 1); this.artG.fillRect(0, 245, W, 535); this.artG.fillStyle(color('#0d1627'), 1); this.artG.fillRoundedRect(30, 270, W - 60, 480, 24);
      for (var i = 0; i < 6; i++) { var x = 70 + i * 116; this.artG.fillStyle(color(C.bossDark), 0.55); this.artG.fillTriangle(x, 325, x + 48, 250, x + 96, 325); line(this.artG, 2, C.violet, 0.4, x + 48, 285, x + 48, 700); }
      this.artG.lineStyle(3, color(C.violet), 0.42); this.artG.strokeCircle(W / 2, 430, 190); this.artG.strokeCircle(W / 2, 430, 245); addText(this, this.view, W / 2, 190, 'READ AND STRIKE', 20, C.violet, 'center', 'bold'); this.textRefs.chamberHint = addText(this, this.view, W / 2, 220, '', 12, C.ink, 'center', 'bold'); addText(this, this.view, W / 2, 252, 'DASH OUT OF THE TELEGRAPH. ATTACK ONLY THE OPEN HEART.', 11, C.dim, 'center', 'normal'); addText(this, this.view, W / 2, 765, 'Recovery sparks restore health. Interact beside a downed partner to revive.', 13, C.dim, 'center', 'normal'); this.updateText();
    },
    renderVault: function () {
      this.artG.fillStyle(color('#120f23'), 1); this.artG.fillRect(0, 0, W, H); this.artG.fillStyle(color(C.gold), 0.07); this.artG.fillCircle(W / 2, 390, 340); drawDoor(this.artG, W / 2, 230, 180, 210, C.gold, true); this.artG.fillStyle(color(C.floor), 1); this.artG.fillRect(0, 530, W, 300); line(this.artG, 4, C.gold, 0.4, 50, 530, W - 50, 530); addText(this, this.view, W / 2, 62, 'THE OPEN VAULT', 30, C.ink, 'center', 'bold'); addText(this, this.view, W / 2, 104, 'Choose a cache. Different picks maximize the split.', 15, C.gold, 'center', 'bold'); box(this, this.view, W / 2, 230, 560, 90, C.wall, C.gold, 0.95); addText(this, this.view, W / 2, 211, 'TREASURE SPLIT', 15, C.gold, 'center', 'bold'); addText(this, this.view, W / 2, 246, 'Same cache = shared value. Different caches = each keeps a full value.', 12, C.dim, 'center', 'normal'); this.textRefs.notice = addText(this, this.view, W / 2, 755, '', 15, C.ink, 'center', 'bold'); this.textRefs.p1choice = addText(this, this.view, 34, 805, '', 13, C.p1, 'left', 'bold'); this.textRefs.p2choice = addText(this, this.view, W - 34, 805, '', 13, C.p2, 'right', 'bold'); addText(this, this.view, W / 2, 845, 'P1 A/D choose, F claim  |  P2 LEFT/RIGHT choose, ENTER claim', 12, C.dim, 'center', 'normal'); addText(this, this.view, W / 2, 880, 'Tap the left half for P1 or right half for P2.', 12, C.dim, 'center', 'normal'); this.updateText();
    },
    renderResults: function () {
      this.artG.fillStyle(color(C.deep), 1); this.artG.fillRect(0, 0, W, H); drawChest(this.artG, W / 2, 255, C.gold, false, false); this.artG.fillStyle(color(C.gold), 0.08); this.artG.fillCircle(W / 2, 255, 230); addText(this, this.view, W / 2, 90, 'VAULT SECURED', 36, C.gold, 'center', 'bold'); addText(this, this.view, W / 2, 135, 'Both raiders leave with a recorded share.', 16, C.ink, 'center', 'normal'); box(this, this.view, W / 2, 490, 560, 190, C.wall, C.line, 0.98); addText(this, this.view, 110, 425, 'P1 SCORE', 15, C.p1, 'left', 'bold'); addText(this, this.view, W - 110, 425, 'P2 SCORE', 15, C.p2, 'right', 'bold'); addText(this, this.view, 110, 465, String(state.players[0].score), 34, C.p1, 'left', 'bold'); addText(this, this.view, W - 110, 465, String(state.players[1].score), 34, C.p2, 'right', 'bold'); addText(this, this.view, W / 2, 525, 'TREASURE SECURED', 13, C.dim, 'center', 'bold'); addText(this, this.view, W / 2, 560, String(state.result ? state.result.shared : 0) + ' TOTAL', 28, C.gold, 'center', 'bold'); addText(this, this.view, W / 2, 610, state.result && state.result.same ? 'Shared cache split fairly.' : 'Different caches kept the raid rich.', 14, C.mint, 'center', 'normal'); addText(this, this.view, W / 2, 640, 'P1 +' + state.players[0].treasure + '  |  P2 +' + state.players[1].treasure, 14, C.ink, 'center', 'bold'); this.addButton(W / 2, 775, 300, 58, 'RAID AGAIN', C.cyan, this.startNewRun.bind(this, Math.min(19, state.rung + 1)), 'Press Space or Enter'); this.addButton(W / 2, 850, 300, 48, 'LOBBY', C.dim, function () { state = makeState(0); state.mode = 'menu'; this.state = state; vr.state = state; this.syncMode(true); }.bind(this));
    },
    renderFailed: function () {
      this.artG.fillStyle(color('#160e1b'), 1); this.artG.fillRect(0, 0, W, H); this.artG.fillStyle(color(C.rose), 0.08); this.artG.fillCircle(W / 2, 320, 300); drawGuardian(this.artG, { x: W / 2, y: 330, phase: 'defeated' }, this.time); addText(this, this.view, W / 2, 125, 'THE GATE HOLDS', 34, C.rose, 'center', 'bold'); addText(this, this.view, W / 2, 170, 'Both raiders were downed.', 17, C.ink, 'center', 'normal'); box(this, this.view, W / 2, 520, 560, 145, C.wall, C.rose, 0.98); addText(this, this.view, W / 2, 480, 'RECOVERY RULE', 14, C.gold, 'center', 'bold'); addText(this, this.view, W / 2, 520, 'Dash through the read, revive quickly,', 15, C.ink, 'center', 'normal'); addText(this, this.view, W / 2, 548, 'or collect a mint recovery spark.', 15, C.ink, 'center', 'normal'); this.addButton(W / 2, 745, 300, 58, 'RETRY GUARDIAN', C.mint, this.beginGuardian.bind(this), 'Press Space or Enter'); this.addButton(W / 2, 820, 300, 48, 'LOBBY', C.dim, function () { state = makeState(0); state.mode = 'menu'; profile.active = null; persist(); this.state = state; vr.state = state; this.syncMode(true); }.bind(this));
    }
  };

  function setNoticeSafe(message) { if (Game.play && state.mode !== 'menu') setNotice(message, C.mint, 2); }

  PlayScene.axes = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
  PlayScene.padAxes = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
  PlayScene.autosave = 0;

  function toScene(config) {
    var Klass = function () { Phaser.Scene.call(this, { key: config.key }); };
    Klass.prototype = Object.create(Phaser.Scene.prototype); Klass.prototype.constructor = Klass;
    Object.keys(config).forEach(function (key) { Klass.prototype[key] = config[key]; }); return Klass;
  }

  Game.phaser = new Phaser.Game({ type: Phaser.AUTO, parent: 'game', backgroundColor: C.deep, scale: { mode: Phaser.Scale.RESIZE, width: W, height: H }, render: { antialias: true, powerPreference: 'high-performance', roundPixels: false, batchSize: 2048 }, fps: { target: 60, min: 30 }, scene: [toScene(BootScene), toScene(PlayScene)] });
  kit.registerPWA();
  root.__VAULT_RAIDERS_READY = true;
  root.__vr.state = state;
})(typeof window !== 'undefined' ? window : globalThis);
