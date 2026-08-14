/* game.js - Crossfire Hopper: authored platform waves and readable crossfire. */
(function () {
  'use strict';

  var CH = window.CHDATA;
  var Phaser = window.Phaser;
  var BASE_W = 540;
  var BASE_H = 960;
  var HUD_H = 88;
  var STEP = 1 / 60;
  var MAX_STEPS = 4;
  var SWIPE_PX = 24;
  var PLAYER_W = 28;
  var PLAYER_H = 50;
  var WAVE_H = 760;
  var GRAVITY = 1420;
  var JUMP_VELOCITY = -650;
  var MOVE_SPEED = 245;
  var MAX_ENEMIES = 24;
  var MAX_HOSTILE = 56;
  var MAX_PLAYER_SHOTS = 20;
  var MAX_SPARKS = 72;
  var MAX_DUST = 36;
  var MAX_RINGS = 14;
  var MAX_SHARDS = 32;
  var MAX_TELEGRAPHS = 18;

  var HOOK = window.__ch = window.__ch || {};
  var ST = HOOK.state = HOOK.state || {};
  ST.ready = false; ST.phase = 'boot'; ST.mode = 'menu'; ST.wave = 0; ST.height = 0;
  ST.best = 0; ST.lives = 0; ST.band = ''; ST.bandIndex = 0; ST.score = 0; ST.coins = 0;
  ST.nearMisses = 0; ST.time = 0; ST.skin = 'sprout'; ST.tutorialStep = -1;
  ST.milestones = 0; ST.paused = false; ST.reducedMotion = false; ST.danger = false;
  ST.enemies = 0; ST.projectiles = 0; ST.power = ''; ST.dodge = false; ST.finished = false;
  if (HOOK.forceMode === undefined) HOOK.forceMode = null;
  if (HOOK.forceBand === undefined) HOOK.forceBand = null;
  if (HOOK.forceRow === undefined) HOOK.forceRow = null;
  if (HOOK.forceSkin === undefined) HOOK.forceSkin = null;
  if (HOOK.debug === undefined) HOOK.debug = false;
  HOOK.version = '2.0.0';
  HOOK.hop = function () { return false; };
  HOOK.dodge = function () { return false; };
  HOOK.fire = function () { return false; };
  HOOK.power = function () { return false; };
  HOOK.restart = function () { return false; };
  HOOK.startRun = function () { return false; };
  HOOK.toMenu = function () { return false; };

  var reducedMotion = false;
  try { reducedMotion = !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  ST.reducedMotion = reducedMotion;

  var S = null;
  var scene = null;
  var dom = {};
  var L = {};
  var inputQueue = [];
  var gestures = {};
  var gamepads = {};
  var savePending = false;
  var saveTimer = 0;
  var padHidden = false;
  var lastFrame = 0;
  var coachTimer = 0;

  var kit = GGKit.create({
    slug: 'crossfire-hopper',
    orientation: 'portrait',
    validateSave: CH.validateSave,
    onPause: function () { ST.paused = true; setPadVisible(false); if (savePending) persist(); },
    onResume: function () { ST.paused = false; setPadVisible(!!S && S.phase === 'play'); },
    onRestart: function () { startRun(S ? S.mode : 'run'); },
  });
  if (reducedMotion) kit.juice.enabled = false;

  function normaliseSave(raw) {
    var d = CH.defaultSave();
    if (!CH.validateSave(raw)) return d;
    for (var k in d) if (Object.prototype.hasOwnProperty.call(raw, k)) d[k] = raw[k];
    d.unlocked = CH.unlockedSkins(d.bestHeight);
    if (d.unlocked.indexOf(d.skin) < 0) d.skin = 'sprout';
    return d;
  }
  var save = normaliseSave(kit.save.get(null));
  function persist() { savePending = false; kit.save.set(save); }
  function persistSoon() {
    savePending = true;
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(function () { saveTimer = 0; if (savePending) persist(); }, 1200);
  }

  function css(hex, alpha) {
    var r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    return alpha == null ? 'rgb(' + r + ',' + g + ',' + b + ')' : 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }
  function rr(c, x, y, w, h, radius) {
    var r = Math.min(radius, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function bake(sceneRef, key, w, h, fn) {
    var t = sceneRef.textures.createCanvas(key, w, h);
    var c = t.getContext(); c.clearRect(0, 0, w, h); fn(c, w, h); t.refresh(); return t;
  }
  function drawHopper(c, w, h, skin, pose) {
    var cx = w / 2, cy = h * 0.54, b = 17;
    c.save();
    if (pose === 'jump') { cy -= 4; b = 16; }
    if (pose === 'dodge') { cy += 3; b = 18; c.globalAlpha = 0.86; }
    c.shadowColor = css(skin.body, 0.7); c.shadowBlur = pose === 'hurt' ? 4 : 12; c.shadowOffsetY = 4;
    c.fillStyle = css(pose === 'hurt' ? 0xff5d6c : skin.body);
    rr(c, cx - b, cy - b * 1.15, b * 2, b * 2, 10); c.fill(); c.restore();
    c.fillStyle = css(pose === 'hurt' ? 0xffb0b9 : skin.belly); rr(c, cx - 10, cy + 7, 20, 10, 5); c.fill();
    c.fillStyle = css(skin.dark); rr(c, cx - 17, cy - 11, 34, 10, 4); c.fill();
    for (var side = -1; side <= 1; side += 2) {
      c.fillStyle = css(skin.eye); c.beginPath(); c.ellipse(cx + side * 7, cy - 6, 5, 4.8, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = css(skin.dark); c.beginPath(); c.arc(cx + side * 8, cy - 6, 2, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = css(skin.tuft);
    for (var t = -1; t <= 1; t += 2) { c.beginPath(); c.moveTo(cx + t * 8, cy - 17); c.lineTo(cx + t * 15, cy - 18); c.lineTo(cx + t * 11, cy - 30); c.closePath(); c.fill(); }
    c.fillStyle = css(pose === 'hurt' ? 0xffd2d6 : skin.tuft, 0.9);
    rr(c, cx - 13, cy + 1, 26, 4, 2); c.fill();
    c.fillStyle = css(skin.dark);
    if (pose === 'jump' || pose === 'dodge') { rr(c, cx - 23, cy + 17, 14, 6, 3); c.fill(); rr(c, cx + 9, cy + 17, 14, 6, 3); c.fill(); }
    else { rr(c, cx - 20, cy + 20, 12, 7, 3); c.fill(); rr(c, cx + 8, cy + 20, 12, 7, 3); c.fill(); }
    if (pose === 'hurt') { c.strokeStyle = '#fff4f5'; c.lineWidth = 3; c.beginPath(); c.moveTo(8, 9); c.lineTo(18, 19); c.moveTo(18, 9); c.lineTo(8, 19); c.stroke(); }
  }
  function bakeTextures(sceneRef) {
    for (var i = 0; i < CH.BANDS.length; i++) {
      (function (band) {
        bake(sceneRef, 'sky_' + band.key, 8, BASE_H, function (c, w, h) {
          var g = c.createLinearGradient(0, 0, 0, h);
          g.addColorStop(0, css(band.sky[0])); g.addColorStop(0.54, css(band.sky[1])); g.addColorStop(1, css(band.sky[2]));
          c.fillStyle = g; c.fillRect(0, 0, w, h);
          c.fillStyle = css(band.accent, 0.08); c.fillRect(0, h * 0.13, w, h * 0.5);
        });
      })(CH.BANDS[i]);
    }
    for (var s = 0; s < CH.SKINS.length; s++) {
      (function (skin) {
        ['idle', 'jump', 'hurt', 'dodge'].forEach(function (pose) {
          bake(sceneRef, 'hopper_' + skin.key + '_' + pose, 64, 76, function (c, w, h) { drawHopper(c, w, h, skin, pose); });
        });
      })(CH.SKINS[s]);
    }
    bake(sceneRef, 'red_vignette', 256, 256, function (c, w, h) {
      var g = c.createRadialGradient(w / 2, h / 2, w * 0.18, w / 2, h / 2, w * 0.72);
      g.addColorStop(0, 'rgba(255,45,70,0)'); g.addColorStop(0.58, 'rgba(255,45,70,.08)'); g.addColorStop(1, 'rgba(255,30,55,.9)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    });
    bake(sceneRef, 'white_px', 4, 4, function (c) { c.fillStyle = '#ffffff'; c.fillRect(0, 0, 4, 4); });
  }

  function emptyProjectile() { return { active: false, x: 0, y: 0, vx: 0, vy: 0, ttl: 0, r: 6, color: 0xffffff, hostile: true, kind: 'bolt' }; }
  function makePool(count, fn) { var out = []; for (var i = 0; i < count; i++) out.push(fn()); return out; }
  function makeFx() {
    return {
      sparks: makePool(MAX_SPARKS, function () { return { active: false }; }),
      dust: makePool(MAX_DUST, function () { return { active: false }; }),
      rings: makePool(MAX_RINGS, function () { return { active: false }; }),
      shards: makePool(MAX_SHARDS, function () { return { active: false }; }),
      telegraphs: makePool(MAX_TELEGRAPHS, function () { return { active: false }; }),
    };
  }
  function alloc(pool) {
    for (var i = 0; i < pool.length; i++) if (!pool[i].active) return pool[i];
    return pool[0];
  }
  function fxSpark(x, y, color, count) {
    if (!S || reducedMotion && count > 8) count = reducedMotion ? 4 : count;
    for (var i = 0; i < count; i++) {
      var p = alloc(S.fx.sparks); p.active = true; p.x = x; p.y = y; p.vx = (Math.random() * 2 - 1) * 170; p.vy = (Math.random() * 2 - 1) * 170;
      p.life = p.max = 0.22 + Math.random() * 0.36; p.color = color; p.size = 2 + Math.random() * 3;
    }
  }
  function fxDust(x, y, color, count) {
    for (var i = 0; i < (reducedMotion ? Math.ceil(count * 0.4) : count); i++) {
      var p = alloc(S.fx.dust); p.active = true; p.x = x; p.y = y; p.vx = (Math.random() * 2 - 1) * 80; p.vy = -30 - Math.random() * 70;
      p.life = p.max = 0.25 + Math.random() * 0.25; p.color = color; p.size = 3 + Math.random() * 4;
    }
  }
  function fxRing(x, y, color, max, life) {
    var r = alloc(S.fx.rings); r.active = true; r.x = x; r.y = y; r.radius = 8; r.max = max || 70; r.life = r.maxLife = life || 0.42; r.color = color;
  }
  function fxShards(x, y, color, count) {
    for (var i = 0; i < count; i++) {
      var p = alloc(S.fx.shards); p.active = true; p.x = x; p.y = y; p.vx = (Math.random() * 2 - 1) * 130; p.vy = (Math.random() * 2 - 1) * 150;
      p.life = p.max = 0.35 + Math.random() * 0.4; p.color = color; p.size = 3 + Math.random() * 4; p.spin = Math.random() * 6;
    }
  }
  function fxTelegraph(x, y, color, kind) {
    var t = alloc(S.fx.telegraphs); t.active = true; t.x = x; t.y = y; t.color = color; t.kind = kind; t.life = t.max = 0.7;
  }

  function spawnProjectile(hostile, x, y, vx, vy, color, radius, kind) {
    var pool = hostile ? S.projectiles : S.playerShots;
    var p = null;
    for (var i = 0; i < pool.length; i++) if (!pool[i].active) { p = pool[i]; break; }
    if (!p) return false;
    p.active = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.ttl = hostile ? 5 : 1.8;
    p.color = color; p.r = radius || 6; p.hostile = hostile; p.kind = kind || 'bolt';
    return true;
  }
  function countActive(pool) { var n = 0; for (var i = 0; i < pool.length; i++) if (pool[i].active) n++; return n; }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function newSim(mode, opts) {
    var def = CH.modeDef(mode);
    var seed = opts && opts.seed != null ? opts.seed : (def.seeded ? CH.dailySeedFor(new Date()) : (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)));
    var sim = {
      phase: 'play', mode: def.key, def: def, seed: seed >>> 0, time: 0, wave: 0, height: 0,
      score: 0, coins: 0, dodges: 0, enemiesDefeated: 0, lives: def.lives, maxLives: def.lives,
      checkpointWave: 0, milestones: 0, tutorialStep: save.tutorialDone ? -1 : 0,
      danger: false, damagePulse: 0, flash: 0, banner: null, clearing: 0, waveDamage: 0,
      bandDamage: 0, bandWaves: 0, announcedBest: false, powerInventory: [], shield: 0, dashReady: false,
      player: { x: BASE_W / 2, y: 650, vx: 0, vy: 0, grounded: true, platformIndex: 0, facing: 1, invuln: 0, dodgeCd: 0, dodge: 0, hurt: 0, anim: 'idle' },
      platforms: [], enemies: makePool(MAX_ENEMIES, function () { return { active: false }; }),
      projectiles: makePool(MAX_HOSTILE, emptyProjectile), playerShots: makePool(MAX_PLAYER_SHOTS, emptyProjectile),
      pickups: [], fx: makeFx(), camY: 250, currentMusic: '', result: null, bannerQueue: [],
    };
    loadWave(sim, 0);
    return sim;
  }
  function loadWave(sim, index) {
    var def = CH.waveDef(index);
    sim.wave = Math.max(0, index | 0); sim.platforms = [];
    var base = sim.wave * WAVE_H;
    for (var i = 0; i < def.platforms.length; i++) {
      var p = def.platforms[i]; sim.platforms.push({ x: p.x, y: base + p.y, w: p.w, h: 16, safe: !!p.safe, finish: !!p.finish });
    }
    sim.pickups = [];
    for (var q = 0; q < (def.pickups || []).length; q++) {
      var pu = def.pickups[q], pp = sim.platforms[pu.platform];
      sim.pickups.push({ x: pp.x, y: pp.y - 32, type: pu.type, active: true, bob: q * 1.3 });
    }
    for (var e = 0; e < sim.enemies.length; e++) sim.enemies[e].active = false;
    for (var j = 0; j < (def.enemies || []).length; j++) {
      var spec = def.enemies[j], ep = sim.platforms[spec.platform], ed = CH.enemyDef(spec.kind), enemy = sim.enemies[j];
      enemy.active = true; enemy.kind = spec.kind; enemy.x = spec.x; enemy.y = ep.y - 29; enemy.platform = spec.platform;
      enemy.hp = ed.hp + Math.floor(sim.wave / 6); enemy.maxHp = enemy.hp; enemy.color = ed.color; enemy.fire = ed.fire;
      enemy.cooldown = spec.delay; enemy.telegraph = 0; enemy.stun = 0; enemy.flash = 0; enemy.phase = j * 0.7;
    }
    for (var h = 0; h < sim.projectiles.length; h++) sim.projectiles[h].active = false;
    for (var ps = 0; ps < sim.playerShots.length; ps++) sim.playerShots[ps].active = false;
    var start = sim.platforms[0];
    sim.player.x = start.x; sim.player.y = start.y - PLAYER_H / 2; sim.player.vx = 0; sim.player.vy = 0;
    sim.player.grounded = true; sim.player.platformIndex = 0; sim.player.dodge = 0; sim.player.hurt = 0; sim.player.invuln = 0;
    sim.camY = sim.player.y - 390; sim.clearing = 0; sim.waveDamage = 0;
    var band = CH.bandAt(sim.wave);
    sim.danger = false;
    if (sim.currentMusic !== band.music) { sim.currentMusic = band.music; kit.audio.music(band.music, 700); }
  }

  function currentPlatform() { return S && S.platforms[S.player.platformIndex]; }
  function waveEnemiesLeft() {
    var n = 0; for (var i = 0; i < S.enemies.length; i++) if (S.enemies[i].active) n++; return n;
  }
  function beginJump() {
    var p = S.player;
    if (!p.grounded || S.clearing > 0) return false;
    p.grounded = false; p.vy = JUMP_VELOCITY; p.anim = 'jump';
    fxDust(p.x, p.y + PLAYER_H / 2, CH.bandAt(S.wave).accent, 8); playSfx('sfx_hop', 0.65, 0.96 + Math.random() * 0.1); advanceTutorial('hop');
    return true;
  }
  function beginDodge(dir) {
    var p = S.player;
    if (p.dodgeCd > 0 || p.dodge > 0 || S.clearing > 0) return false;
    var d = dir || p.facing || 1;
    p.facing = d; p.grounded = false; p.dodge = S.dashReady ? 0.38 : 0.24; p.dodgeCd = S.dashReady ? 0.75 : 1.0;
    p.invuln = Math.max(p.invuln, p.dodge + 0.05); p.vx = d * (S.dashReady ? 470 : 370); p.vy = Math.min(p.vy, -150);
    S.dashReady = false; S.dodges++; S.score += CH.SCORE.dodge; fxRing(p.x, p.y, 0xff8fba, 54, 0.25); fxSpark(p.x, p.y, 0xffd0e0, 8);
    kit.juice.shake(4, 100); playSfx('sfx_near', 0.7, 1.12); advanceTutorial('dodge'); return true;
  }
  function firePlayer() {
    if (!S || S.phase !== 'play' || S.clearing > 0) return false;
    var p = S.player, target = null, best = 1e9;
    for (var i = 0; i < S.enemies.length; i++) if (S.enemies[i].active) {
      var d = dist2(p.x, p.y, S.enemies[i].x, S.enemies[i].y); if (d < best) { best = d; target = S.enemies[i]; }
    }
    var tx = target ? target.x : p.x, ty = target ? target.y : p.y - 500;
    var dx = tx - p.x, dy = ty - p.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
    if (!spawnProjectile(false, p.x, p.y - 18, dx / len * 650, dy / len * 650, 0xffe07b, 5, 'pulse')) return false;
    playSfx('sfx_coin', 0.35, 1.35); advanceTutorial('fire'); return true;
  }
  function activatePower() {
    if (!S || !S.powerInventory.length) return false;
    var key = S.powerInventory.shift();
    if (key === 'shield') { S.shield = 6; fxRing(S.player.x, S.player.y, 0x72e8ff, 84, 0.55); }
    else if (key === 'pulse') {
      for (var i = 0; i < S.projectiles.length; i++) S.projectiles[i].active = false;
      for (var e = 0; e < S.enemies.length; e++) if (S.enemies[e].active) S.enemies[e].stun = 2.4;
      fxRing(S.player.x, S.player.y, 0xffd35e, 260, 0.65); fxSpark(S.player.x, S.player.y, 0xfff1b0, 20);
    } else { S.dashReady = true; fxRing(S.player.x, S.player.y, 0xff8fba, 72, 0.42); }
    playSfx('sfx_unlock', 0.75, 1.1); pushBanner(CH.powerDef(key).name.toUpperCase() + ' ON', '', 'warm', 0.9); advanceTutorial('power');
    return true;
  }
  function tryCommand(cmd) {
    if (!S || S.phase !== 'play' || kit.paused) return false;
    var p = S.player, side = 0;
    if (cmd === 'left') side = -1;
    if (cmd === 'right') side = 1;
    if (side) {
      p.facing = side; p.vx = side * MOVE_SPEED;
      if (!p.grounded) { p.vx = side * 300; advanceTutorial('move'); }
      else advanceTutorial('move');
      return true;
    }
    if (cmd === 'up') return beginJump();
    if (cmd === 'down' || cmd === 'dodge') return beginDodge(p.facing);
    if (cmd === 'fire') return firePlayer();
    if (cmd === 'power') return activatePower();
    return false;
  }

  function queue(item) {
    if (inputQueue.length >= 80) inputQueue.shift();
    inputQueue.push(item);
  }
  function isUiTarget(target) {
    return !!(target && target.closest && target.closest('#ui, #pad, #chips'));
  }
  function pointerDown(e) {
    var claimed = isUiTarget(e.target);
    gestures[e.pointerId] = { sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, claimed: claimed, consumed: claimed };
    if (!kit.input.pointers.has(e.pointerId)) kit.input.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, downAt: performance.now(), zone: claimed ? 'ui' : 'field' });
    queue({ type: 'pointerdown', id: e.pointerId });
  }
  function pointerMove(e) {
    var g = gestures[e.pointerId]; if (!g) return;
    g.x = e.clientX; g.y = e.clientY;
    var dx = e.clientX - g.sx, dy = e.clientY - g.sy;
    if (!g.claimed && !g.consumed && Math.sqrt(dx * dx + dy * dy) >= SWIPE_PX) {
      g.consumed = true; queue({ type: 'command', command: Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down') });
    }
  }
  function pointerUp(e) {
    var g = gestures[e.pointerId]; if (!g) return;
    if (!g.claimed && !g.consumed) {
      var dx = e.clientX - g.sx, dy = e.clientY - g.sy;
      if (Math.sqrt(dx * dx + dy * dy) < SWIPE_PX) queue({ type: 'command', command: 'fire' });
    }
    delete gestures[e.pointerId];
  }
  function installInputQueue() {
    window.addEventListener('pointerdown', pointerDown, { passive: true });
    window.addEventListener('pointermove', pointerMove, { passive: true });
    window.addEventListener('pointerup', pointerUp, { passive: true });
    window.addEventListener('pointercancel', pointerUp, { passive: true });
    window.addEventListener('blur', function () { gestures = {}; inputQueue.length = 0; }, { passive: true });
    window.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      var map = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Space: 'dodge', KeyF: 'fire', Enter: 'fire', KeyE: 'power', KeyQ: 'power' };
      if (map[e.code]) { e.preventDefault(); queue({ type: 'command', command: map[e.code] }); }
    }, { passive: false });
  }
  function dispatchPadCommand(command) { queue({ type: 'command', command: command }); }
  function bindActionButton(button, command) {
    if (!button) return;
    button.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); button.classList.add('hit'); dispatchPadCommand(command); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (type) { button.addEventListener(type, function () { button.classList.remove('hit'); }); });
    button.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dispatchPadCommand(command); } });
  }
  function bindPad() {
    var buttons = dom.pad.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) bindActionButton(buttons[i], buttons[i].getAttribute('data-cmd') || 'fire');
    bindActionButton(dom.btnDodge, 'dodge'); bindActionButton(dom.btnFire, 'fire'); bindActionButton(dom.btnPower, 'power');
  }
  function pollGamepad() {
    if (!navigator.getGamepads) return;
    var pads = navigator.getGamepads();
    for (var i = 0; i < 4; i++) {
      var pad = pads && pads[i], state = gamepads[i];
      if (!pad || !pad.connected) { gamepads[i] = null; continue; }
      if (!state) state = gamepads[i] = { x: 0, y: 0, buttons: {} };
      var ax = pad.axes && pad.axes[0] || 0, ay = pad.axes && pad.axes[1] || 0;
      var nx = Math.abs(ax) > 0.55 ? (ax < 0 ? -1 : 1) : 0, ny = Math.abs(ay) > 0.55 ? (ay < 0 ? -1 : 1) : 0;
      if (nx && nx !== state.x) queue({ type: 'command', command: nx < 0 ? 'left' : 'right' });
      if (ny && ny !== state.y) queue({ type: 'command', command: ny < 0 ? 'up' : 'down' });
      state.x = nx; state.y = ny;
      var buttons = pad.buttons || [];
      var pressed = function (n) { return !!(buttons[n] && buttons[n].pressed); };
      var actions = [{ n: 0, c: 'fire' }, { n: 1, c: 'dodge' }, { n: 2, c: 'power' }];
      for (var b = 0; b < actions.length; b++) { var a = actions[b], now = pressed(a.n); if (now && !state.buttons[a.n]) queue({ type: 'command', command: a.c }); state.buttons[a.n] = now; }
    }
  }
  function pollInput() {
    pollGamepad();
    while (inputQueue.length) {
      var item = inputQueue.shift();
      if (item.type === 'command') tryCommand(item.command);
    }
    if (S && !kit.paused) {
      if (kit.input.keyDown('ArrowLeft') || kit.input.keyDown('KeyA')) S.player.vx = -MOVE_SPEED;
      else if (kit.input.keyDown('ArrowRight') || kit.input.keyDown('KeyD')) S.player.vx = MOVE_SPEED;
      else if (S.player.grounded) S.player.vx *= 0.76;
    }
  }

  function updateFx(dt) {
    var groups = [S.fx.sparks, S.fx.dust, S.fx.shards];
    for (var g = 0; g < groups.length; g++) for (var i = 0; i < groups[g].length; i++) {
      var p = groups[g][i]; if (!p.active) continue; p.life -= dt; if (p.life <= 0) { p.active = false; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += g === 1 ? 90 * dt : 250 * dt;
    }
    for (var r = 0; r < S.fx.rings.length; r++) { var ring = S.fx.rings[r]; if (!ring.active) continue; ring.life -= dt; ring.radius += (ring.max - ring.radius) * dt * 8; if (ring.life <= 0) ring.active = false; }
    for (var t = 0; t < S.fx.telegraphs.length; t++) { var tele = S.fx.telegraphs[t]; if (!tele.active) continue; tele.life -= dt; if (tele.life <= 0) tele.active = false; }
  }
  function updatePlayer(dt) {
    var p = S.player, oldBottom = p.y + PLAYER_H / 2;
    p.invuln = Math.max(0, p.invuln - dt); p.dodgeCd = Math.max(0, p.dodgeCd - dt); p.hurt = Math.max(0, p.hurt - dt);
    if (p.dodge > 0) p.dodge = Math.max(0, p.dodge - dt);
    if (p.grounded && !currentPlatform()) p.grounded = false;
    if (!p.grounded) { p.vy += GRAVITY * dt; p.y += p.vy * dt; }
    else { var on = currentPlatform(); p.y = on.y - PLAYER_H / 2; p.y += 0; }
    p.x += p.vx * dt; p.x = clamp(p.x, PLAYER_W / 2, BASE_W - PLAYER_W / 2);
    if (p.grounded) {
      var support = currentPlatform();
      if (!support || Math.abs(p.x - support.x) > support.w / 2 + PLAYER_W / 2) { p.grounded = false; p.vy = 20; }
    }
    if (!p.grounded && p.vy >= 0) {
      var best = null, bestIndex = -1;
      for (var i = 0; i < S.platforms.length; i++) {
        var pl = S.platforms[i];
        if (oldBottom <= pl.y && p.y + PLAYER_H / 2 >= pl.y && Math.abs(p.x - pl.x) <= pl.w / 2 + PLAYER_W / 2) {
          if (!best || pl.y < best.y) { best = pl; bestIndex = i; }
        }
      }
      if (best) {
        p.y = best.y - PLAYER_H / 2; p.vy = 0; p.grounded = true; p.platformIndex = bestIndex;
        fxDust(p.x, best.y, CH.bandAt(S.wave).accent, 5); playSfx('sfx_land', 0.42, 0.96 + Math.random() * 0.12);
        if (bestIndex > 0) advanceTutorial('land');
      }
    }
    if (p.y > S.wave * WAVE_H + 820) takeDamage('fall');
    var targetCam = p.y - 390; S.camY += (targetCam - S.camY) * Math.min(1, dt * 5);
    p.anim = p.hurt > 0 ? 'hurt' : p.dodge > 0 ? 'dodge' : p.grounded ? 'idle' : 'jump';
  }
  function fireEnemy(enemy) {
    var dx = S.player.x - enemy.x, dy = S.player.y - enemy.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
    var base = Math.atan2(dy, dx), speed = 245 + Math.min(130, S.wave * 9), color = CH.enemyDef(enemy.kind).color;
    if (enemy.fire === 'burst') {
      for (var b = -1; b <= 1; b++) spawnProjectile(true, enemy.x, enemy.y, Math.cos(base + b * 0.18) * speed, Math.sin(base + b * 0.18) * speed, color, 7, 'burst');
    } else if (enemy.fire === 'cross') {
      for (var c = 0; c < 4; c++) { var a = c * Math.PI / 2; spawnProjectile(true, enemy.x, enemy.y, Math.cos(a) * speed, Math.sin(a) * speed, color, 7, 'cross'); }
    } else if (enemy.fire === 'line') {
      spawnProjectile(true, enemy.x, enemy.y, Math.cos(base) * (speed + 80), Math.sin(base) * (speed + 80), color, 8, 'line');
    } else {
      for (var r = 0; r < 8; r++) { var ra = r * Math.PI / 4; spawnProjectile(true, enemy.x, enemy.y, Math.cos(ra) * (speed - 15), Math.sin(ra) * (speed - 15), color, 6, 'ring'); }
    }
    playSfx('sfx_warn', 0.34, 0.88 + Math.random() * 0.08); fxSpark(enemy.x, enemy.y, color, 5);
  }
  function updateEnemies(dt) {
    for (var i = 0; i < S.enemies.length; i++) {
      var e = S.enemies[i]; if (!e.active) continue;
      var pl = S.platforms[e.platform]; e.y = pl.y - 29; e.flash = Math.max(0, e.flash - dt); e.stun = Math.max(0, e.stun - dt);
      e.phase += dt; e.x = clamp(e.x + Math.sin(e.phase) * dt * 4, pl.x - pl.w / 2 + 20, pl.x + pl.w / 2 - 20);
      if (e.stun > 0) { e.telegraph = 0; continue; }
      if (e.telegraph > 0) { e.telegraph -= dt; if (e.telegraph <= 0) { fireEnemy(e); e.cooldown = Math.max(0.9, 2.25 - S.wave * 0.06); } }
      else { e.cooldown -= dt; if (e.cooldown <= 0 && !(S.wave === 0 && S.time < 3.2)) { e.telegraph = e.fire === 'line' ? 0.95 : 0.68; fxTelegraph(e.x, e.y, CH.bandAt(S.wave).danger, e.fire); } }
    }
  }
  function updateShots(dt) {
    var p = S.player;
    for (var i = 0; i < S.playerShots.length; i++) {
      var shot = S.playerShots[i]; if (!shot.active) continue; shot.ttl -= dt; shot.x += shot.vx * dt; shot.y += shot.vy * dt;
      if (shot.ttl <= 0 || shot.x < -20 || shot.x > BASE_W + 20 || shot.y < S.camY - 100 || shot.y > S.camY + BASE_H + 100) { shot.active = false; continue; }
      for (var e = 0; e < S.enemies.length; e++) {
        var enemy = S.enemies[e]; if (!enemy.active || dist2(shot.x, shot.y, enemy.x, enemy.y) > (shot.r + 23) * (shot.r + 23)) continue;
        shot.active = false; enemy.hp--; enemy.flash = 0.12; fxSpark(enemy.x, enemy.y, enemy.color, 8); fxRing(enemy.x, enemy.y, enemy.color, 34, 0.2); playSfx('sfx_coin', 0.35, 1.18);
        if (enemy.hp <= 0) { enemy.active = false; S.enemiesDefeated++; S.score += CH.SCORE.enemy; fxShards(enemy.x, enemy.y, enemy.color, 9); kit.juice.hitStop(38); kit.juice.shake(5, 100); }
        break;
      }
    }
    for (var h = 0; h < S.projectiles.length; h++) {
      var bolt = S.projectiles[h]; if (!bolt.active) continue; bolt.ttl -= dt; bolt.x += bolt.vx * dt; bolt.y += bolt.vy * dt;
      if (bolt.ttl <= 0 || bolt.x < -45 || bolt.x > BASE_W + 45 || bolt.y < S.camY - 120 || bolt.y > S.camY + BASE_H + 120) { bolt.active = false; continue; }
      if (S.player.invuln <= 0 && dist2(bolt.x, bolt.y, p.x, p.y) < (bolt.r + 18) * (bolt.r + 18)) { bolt.active = false; takeDamage('crossfire'); }
    }
  }
  function collectPickups() {
    for (var i = 0; i < S.pickups.length; i++) {
      var pu = S.pickups[i]; if (!pu.active || dist2(pu.x, pu.y, S.player.x, S.player.y) > 42 * 42) continue;
      if (S.powerInventory.length >= 2) continue;
      pu.active = false; S.powerInventory.push(pu.type); S.coins++; S.score += CH.SCORE.pickup; save.totalCoins++;
      fxRing(pu.x, pu.y, CH.powerDef(pu.type).color, 48, 0.35); fxSpark(pu.x, pu.y, CH.powerDef(pu.type).color, 10); playSfx('sfx_unlock', 0.6, 1.2); pushBanner(CH.powerDef(pu.type).name.toUpperCase() + ' STORED', '', 'warm', 0.9);
    }
  }
  function updateDangerAudio() {
    var active = countActive(S.projectiles) > 0;
    for (var i = 0; i < S.enemies.length; i++) if (S.enemies[i].active && S.enemies[i].telegraph > 0) active = true;
    if (active === S.danger) return;
    S.danger = active; var band = CH.bandAt(S.wave); kit.audio.music(active ? 'music_storm' : band.music, 420);
  }
  function updateWave(dt) {
    if (S.clearing > 0) { S.clearing -= dt; if (S.clearing <= 0) advanceWave(); return; }
    var last = S.platforms.length - 1;
    if (S.player.grounded && S.player.platformIndex === last && waveEnemiesLeft() === 0) {
      S.clearing = 0.8; S.score += CH.SCORE.wave; pushBanner('WAVE CLEAR', '', 'warm', 0.9); playSfx('sfx_medal', 0.65); fxRing(S.player.x, S.player.y, CH.bandAt(S.wave).accent, 130, 0.5);
    }
  }
  function awardBandIfNeeded(completedWave) {
    if (!S.def.medalsPerBand) return;
    var before = completedWave - 1, band = CH.bandAt(before), nextBand = CH.bandAt(completedWave);
    S.bandWaves++;
    if (band.key !== nextBand.key || completedWave >= S.def.goal && S.def.medalsPerBand !== false) {
      var medal = CH.bandMedal(band, S.bandWaves, S.bandDamage), old = save.runMedals[band.key] || 'none';
      if (CH.medalDef(medal).rank > CH.medalDef(old).rank) save.runMedals[band.key] = medal;
      pushBanner(CH.medalDef(medal).name.toUpperCase() + ' MEDAL', '', 'warm', 0.9); playSfx('sfx_medal', 0.75);
      S.bandWaves = 0; S.bandDamage = 0; persistSoon();
    }
  }
  function advanceWave() {
    var next = S.wave + 1; awardBandIfNeeded(next); S.wave = next; S.height = next; S.milestones = CH.MILESTONES.filter(function (m) { return m <= next; }).length;
    if (S.mode === 'run' && CH.MILESTONES.indexOf(next) >= 0) { S.lives = Math.min(S.maxLives, S.lives + 1); S.checkpointWave = next; pushBanner('CHECKPOINT ' + next, '', 'warm', 0.9); }
    if (S.height > save.bestHeight) { var oldBest = save.bestHeight; save.bestHeight = S.height; save.unlocked = CH.unlockedSkins(save.bestHeight); persistSoon(); if (oldBest > 0 && !S.announcedBest) { S.announcedBest = true; pushBanner('NEW BEST ' + oldBest, '', 'warm', 0.9); } }
    if (S.def.goal > 0 && S.wave >= S.def.goal) { finishRun(true); return; }
    loadWave(S, next);
  }
  function respawn(reason) {
    S.powerInventory.length = 0; S.shield = 0; S.dashReady = false; S.wave = S.checkpointWave; S.height = Math.max(S.height, S.wave);
    loadWave(S, S.checkpointWave); S.player.invuln = 1.6; S.player.hurt = 0.7; S.player.anim = 'hurt'; pushBanner(S.lives + (S.lives === 1 ? ' LIFE LEFT' : ' LIVES LEFT'), '', 'bad', 0.9);
  }
  function takeDamage(reason) {
    if (!S || S.phase !== 'play' || S.player.invuln > 0) return;
    if (S.shield > 0) { S.shield = 0; S.player.invuln = 0.75; fxRing(S.player.x, S.player.y, 0x72e8ff, 96, 0.42); playSfx('sfx_near', 0.7, 0.8); return; }
    S.lives--; S.waveDamage++; S.bandDamage++; S.player.hurt = 0.68; S.player.invuln = 1.2; S.damagePulse = 1; S.flash = 1;
    kit.juice.hitStop(90); kit.juice.shake(reducedMotion ? 0 : 18, 300); fxRing(S.player.x, S.player.y, 0xff3e59, 120, 0.55); fxSpark(S.player.x, S.player.y, 0xff7482, 22); playSfx('sfx_crash', 0.9, 0.88);
    if (S.lives > 0) respawn(reason); else { playSfx('sfx_fail', 0.85); finishRun(false, reason); }
  }
  function simStep(dt) {
    if (!S || kit.paused || S.phase !== 'play') return;
    S.time += dt; S.damagePulse = Math.max(0, S.damagePulse - dt * 2.7); S.flash = Math.max(0, S.flash - dt * 4); S.shield = Math.max(0, S.shield - dt);
    pollInput(); updatePlayer(dt); updateEnemies(dt); updateShots(dt); collectPickups(); updateWave(dt); updateDangerAudio(); updateFx(dt);
    if (S.banner) { S.banner.time -= dt; if (S.banner.time <= 0) { S.banner = null; showNextBanner(); } }
    if (S.player.hurt <= 0 && S.player.invuln < 0.2) S.player.anim = S.player.dodge > 0 ? 'dodge' : S.player.grounded ? 'idle' : 'jump';
  }

  function playSfx(name, volume, rate) { kit.audio.sfx(name, { volume: volume == null ? 1 : volume, rate: rate }); }
  function showNextBanner() {
    if (!S || S.banner || !S.bannerQueue.length) return;
    S.banner = S.bannerQueue.shift(); playSfx('sfx_banner', 0.32, 1.08);
  }
  function pushBanner(title, sub, tone, time) {
    if (!S || S.phase === 'result') return;
    var hold = Math.min(1, Math.max(0.45, Number(time) || 0.9));
    S.bannerQueue.push({ title: title, sub: sub || '', tone: tone || 'mint', time: hold, max: hold });
    if (S.bannerQueue.length > 5) S.bannerQueue.shift();
    showNextBanner();
  }
  function advanceTutorial(key) {
    if (!S || S.tutorialStep < 0 || S.tutorialStep >= CH.TUTORIAL.length) return;
    var want = CH.TUTORIAL[S.tutorialStep].key;
    if ((want === 'move' && (key === 'move' || key === 'land')) || (want === key)) {
      S.tutorialStep++; if (S.tutorialStep >= CH.TUTORIAL.length) { S.tutorialStep = -1; save.tutorialDone = true; persistSoon(); }
    }
  }

  function finishRun(won, reason) {
    if (!S || S.phase === 'result') return;
    S.phase = 'result'; S.finished = true; S.result = { won: !!won, reason: reason || 'complete', wave: S.wave, height: S.height, score: S.score, coins: S.coins, time: S.time };
    save.runs++; save.bestScore = Math.max(save.bestScore, S.score); if (S.mode === 'endless') save.bestEndless = Math.max(save.bestEndless, S.height);
    if (S.mode === 'daily' && won) { var day = CH.dailyLabelFor(new Date()), medal = CH.dailyMedal(S.time), old = save.daily[day]; if (!old || S.time < old.time) save.daily[day] = { time: S.time, medal: medal }; }
    persist(); setPadVisible(false); kit.audio.music('music_calm', 800); showResults();
  }
  function startRun(mode, opts) {
    kit.resume('menu'); kit.input.clearAll(); inputQueue.length = 0; gestures = {};
    if (HOOK.forceSkin && CH.SKIN_BY_KEY[HOOK.forceSkin]) { save.skin = HOOK.forceSkin; HOOK.forceSkin = null; }
    S = newSim(CH.MODES[mode] ? mode : 'run', opts); hideUI(); setPadVisible(true); setChipsVisible(true); syncHook();
  }
  function toAttract() { kit.resume('menu'); S = newSim('endless', { seed: 7 }); S.phase = 'attract'; S.tutorialStep = -1; setPadVisible(false); setChipsVisible(false); syncHook(); }
  function forceWave(index) { var value = Number(index), n = isFinite(value) ? Math.max(0, Math.floor(value)) : 0; S.wave = n; S.height = n; loadWave(S, n); }
  function applyForces() {
    if (!S) return;
    if (HOOK.forceMode && CH.MODES[HOOK.forceMode]) { var m = HOOK.forceMode; HOOK.forceMode = null; startRun(m); return; }
    if (HOOK.forceSkin && CH.SKIN_BY_KEY[HOOK.forceSkin]) { save.skin = HOOK.forceSkin; HOOK.forceSkin = null; }
    if (HOOK.forceBand != null) { var b = Number(HOOK.forceBand); if (!isFinite(b)) for (var i = 0; i < CH.BANDS.length; i++) if (CH.BANDS[i].key === HOOK.forceBand) b = CH.BANDS[i].start; HOOK.forceBand = null; if (isFinite(b)) forceWave(b); }
    if (HOOK.forceRow != null) { var row = Number(HOOK.forceRow); HOOK.forceRow = null; if (isFinite(row)) forceWave(row); }
  }

  function showUI(html) { dom.card.innerHTML = html; dom.ui.classList.add('on'); dom.ui.scrollTop = 0; }
  function hideUI() { dom.ui.classList.remove('on'); }
  function esc(s) { return String(s).replace(/[&<>\"]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[m]; }); }
  function medalCell(key) { var m = CH.medalDef(key); return '<td class="m m-' + m.key + '">' + (m.key === 'none' ? '-' : m.name.toUpperCase()) + '</td>'; }
  function bandTable() {
    var h = '<table class="bands">';
    for (var i = 0; i < CH.BANDS.length; i++) { var b = CH.BANDS[i], range = b.end === Infinity ? b.start + '+' : b.start + ' to ' + b.end; h += '<tr><td class="n">' + esc(b.name) + '<div class="t">' + esc(b.tag) + '</div></td><td class="t" style="width:74px">' + range + '</td>' + medalCell(save.runMedals[b.key]) + '</tr>'; }
    return h + '</table>';
  }
  function skinGrid() {
    var h = '<div class="skins">';
    for (var i = 0; i < CH.SKINS.length; i++) { var s = CH.SKINS[i], unlocked = save.unlocked.indexOf(s.key) >= 0; h += '<button class="skin' + (save.skin === s.key ? ' on' : '') + (unlocked ? '' : ' locked') + '" data-act="skin" data-skin="' + s.key + '"' + (unlocked ? '' : ' disabled') + '><i style="background:linear-gradient(180deg,' + css(s.body) + ',' + css(s.belly) + ')"></i>' + esc(unlocked ? s.name : 'Wave ' + s.need) + '</button>'; }
    return h + '</div>';
  }
  function showTitle() {
    setPadVisible(false); setChipsVisible(false); setCoach('');
    var today = CH.dailyLabelFor(new Date()), d = save.daily[today], dailyLine = d ? CH.formatTime(d.time) + '  |  ' + CH.medalDef(d.medal).name : 'Not run yet today';
    showUI('<div class="kicker">GREENGUARD ARCADE</div><h1 class="title">CROSSFIRE <span class="sp">HOPPER</span></h1><p class="blurb">Hop between authored platforms while enemy fire crosses the arena. Shoot back, dodge the red telegraphs, and bank power-ups before the next wave.</p><div class="grid2" style="margin-bottom:12px"><div class="stat"><div class="k">BEST WAVE</div><div class="v">' + save.bestHeight + '</div></div><div class="stat"><div class="k">BEST SCORE</div><div class="v gold">' + save.bestScore + '</div></div></div><button class="btn" data-act="mode" data-mode="run">Band Run<span class="sub">' + esc(CH.MODES.run.blurb) + '</span></button><button class="btn alt" data-act="mode" data-mode="daily">Daily Time Attack<span class="sub">UTC ' + today + '  |  ' + dailyLine + '</span></button><button class="btn alt" data-act="mode" data-mode="endless">Endless Climb<span class="sub">Best ' + save.bestEndless + '  |  one life, no ceiling</span></button><div class="rowline"></div><div class="kicker">BANDS</div>' + bandTable() + '<div class="rowline"></div><div class="kicker">HOPPER SKINS</div>' + skinGrid() + '<div class="rowline"></div><button class="btn alt sm" data-act="settings">Settings</button><button class="btn alt sm" data-act="howto">How to play</button><div class="foot">Original code-drawn art and licensed MP3 audio. Works offline after the first load.</div>');
  }
  function showHowTo() {
    showUI('<div class="kicker">HOW TO PLAY</div><h1 class="title">Own the crossfire</h1><p class="blurb"><b>Platforms.</b> Move left and right on a shelf, then press up to jump. Land on the next shelf to climb.</p><p class="blurb"><b>Enemy fire.</b> Red lines and rings are telegraphs. Fire with the bolt button or F, then dodge with the wings button, down, space, or Shift.</p><p class="blurb"><b>Power-ups.</b> Collect Aegis, Pulse, or Dash. Store two, then tap the bolt-shaped power button to activate the first one.</p><p class="blurb"><b>Checkpoints.</b> Every three cleared waves restores a life and saves a safe launch shelf. Daily Time Attack rolls over at 00:00 UTC.</p><button class="btn" data-act="title">Back</button>');
  }
  function showPause() {
    showUI('<div class="kicker">PAUSED</div><h1 class="title">' + esc(CH.modeDef(S.mode).name) + '</h1><div class="grid2" style="margin-bottom:12px"><div class="stat"><div class="k">WAVE</div><div class="v">' + S.wave + '</div></div><div class="stat"><div class="k">SCORE</div><div class="v gold">' + S.score + '</div></div></div><button class="btn" data-act="resume">Resume</button><button class="btn alt" data-act="restart">Restart run</button><button class="btn alt" data-act="settings">Settings</button><button class="btn alt" data-act="quit">Back to menu</button>');
  }
  function showResults() {
    if (!S || !S.result) return;
    var r = S.result, headline = r.won ? 'WAVE RUN COMPLETE' : 'RUN ENDED', sub = r.won ? 'The platform circuit is clear.' : (r.reason === 'crossfire' ? 'The crossfire found an opening.' : 'The launch shelf could not hold.');
    var daily = S.mode === 'daily' ? '<div class="stat" style="margin-bottom:9px"><div class="k">DAILY MEDAL</div><div class="v gold">' + CH.medalDef(CH.dailyMedal(r.time)).name + '</div></div>' : '';
    showUI('<div class="kicker">' + esc(CH.modeDef(S.mode).name.toUpperCase()) + '</div><h1 class="title">' + headline + '</h1><p class="blurb">' + sub + '</p><div class="grid2" style="margin-bottom:9px"><div class="stat"><div class="k">WAVE</div><div class="v">' + r.wave + '</div></div><div class="stat"><div class="k">SCORE</div><div class="v gold">' + r.score + '</div></div><div class="stat"><div class="k">POWER-UPS</div><div class="v">' + r.coins + '</div></div><div class="stat"><div class="k">TIME</div><div class="v">' + CH.formatTime(r.time) + '</div></div></div>' + daily + (S.mode === 'run' ? '<div class="kicker" style="margin-top:10px">BAND MEDALS</div>' + bandTable() : '') + '<div class="rowline"></div><button class="btn" data-act="again">Run it again</button><button class="btn alt" data-act="quit">Back to menu</button>');
  }
  function onUIClick(e) {
    var el = e.target; while (el && el !== dom.card && !el.getAttribute('data-act')) el = el.parentNode; if (!el || el === dom.card) return;
    var act = el.getAttribute('data-act'); playSfx('sfx_ui', 0.5);
    if (act === 'mode') startRun(el.getAttribute('data-mode') || 'run');
    else if (act === 'skin') { var key = el.getAttribute('data-skin'); if (save.unlocked.indexOf(key) >= 0) { save.skin = key; persist(); showTitle(); } }
    else if (act === 'settings') kit.openSettings([function (box, row) { row('Arrow pad', function () { return !padHidden; }, function (v) { padHidden = !v; setPadVisible(S && S.phase === 'play'); }); }]);
    else if (act === 'howto') showHowTo(); else if (act === 'title') { kit.resume('menu'); showTitle(); }
    else if (act === 'resume') { hideUI(); kit.resume('menu'); setPadVisible(true); }
    else if (act === 'restart') { kit.resume('menu'); kit.restart(); }
    else if (act === 'again') startRun(S ? S.mode : 'run');
    else if (act === 'quit') { toAttract(); showTitle(); }
  }

  function setPadVisible(on) { if (dom.pad) dom.pad.classList.toggle('on', !!on && !padHidden); }
  function setChipsVisible(on) { if (dom.chips) dom.chips.classList.toggle('on', !!on); }
  function setCoach(text) {
    if (!dom.coach) return;
    if (!text) { dom.coach.textContent = ''; dom.coach.classList.remove('on', 'fresh'); if (coachTimer) { window.clearTimeout(coachTimer); coachTimer = 0; } return; }
    if (S && S.banner) { dom.coach.classList.remove('on', 'fresh'); return; }
    var changed = dom.coach.textContent !== text;
    if (changed) {
      dom.coach.textContent = text; dom.coach.classList.add('on', 'fresh');
      if (coachTimer) window.clearTimeout(coachTimer);
      coachTimer = window.setTimeout(function () { coachTimer = 0; if (dom.coach) dom.coach.classList.remove('fresh'); }, 3000);
    } else dom.coach.classList.add('on');
  }
  function updateText(t, value) { if (t && t.text !== value) t.setText(value); }
  function syncHook() {
    if (!S) return;
    var band = CH.bandAt(S.wave); ST.ready = !!scene; ST.phase = S.phase; ST.mode = S.mode; ST.wave = S.wave; ST.height = S.height; ST.best = save.bestHeight; ST.lives = S.lives; ST.band = band.key; ST.bandIndex = CH.bandIndexAt(S.wave); ST.score = S.score; ST.coins = S.coins; ST.nearMisses = S.dodges; ST.time = S.time; ST.skin = save.skin; ST.tutorialStep = S.tutorialStep; ST.milestones = S.milestones; ST.paused = kit.paused; ST.danger = S.danger; ST.enemies = waveEnemiesLeft(); ST.projectiles = countActive(S.projectiles); ST.power = S.powerInventory.join(','); ST.dodge = S.player.dodge > 0; ST.finished = !!S.finished;
  }

  function screenY(worldY) { return worldY - S.camY; }
  function renderPlatforms(g, band) {
    for (var i = 0; i < S.platforms.length; i++) { var p = S.platforms[i], y = screenY(p.y); if (y < HUD_H - 30 || y > BASE_H + 30) continue; var x = p.x - p.w / 2; g.fillStyle(p.safe ? 0x2e7b69 : band.ground, 0.96); g.fillRoundedRect(x, y, p.w, p.h, 8); g.fillStyle(p.finish ? band.accent : band.platform, 0.95); g.fillRoundedRect(x + 4, y - 4, p.w - 8, 7, 4); g.lineStyle(1.5, band.accent, p.safe || p.finish ? 0.7 : 0.28); g.strokeRoundedRect(x, y - 1, p.w, p.h + 4, 8); if (p.finish) { g.lineStyle(2, band.accent, 0.7); g.lineBetween(x + 16, y - 12, x + p.w - 16, y - 12); } }
  }
  function renderPickups(g) {
    for (var i = 0; i < S.pickups.length; i++) { var p = S.pickups[i]; if (!p.active) continue; var d = CH.powerDef(p.type), y = screenY(p.y) + Math.sin(S.time * 4 + p.bob) * 5; g.fillStyle(d.color, 0.18); g.fillCircle(p.x, y, 24); g.fillStyle(d.color, 0.95); g.fillTriangle(p.x, y - 13, p.x + 13, y, p.x, y + 13); g.fillTriangle(p.x, y - 13, p.x - 13, y, p.x, y + 13); g.lineStyle(2, 0xffffff, 0.65); g.strokeCircle(p.x, y, 13); }
  }
  function renderEnemies(g, glow, band) {
    for (var i = 0; i < S.enemies.length; i++) { var e = S.enemies[i]; if (!e.active) continue; var y = screenY(e.y), c = e.flash > 0 ? 0xffffff : e.color;
      g.fillStyle(c, 0.18); g.fillCircle(e.x, y, 30); g.fillStyle(c, 0.95); if (e.kind === 'sniper') { g.fillTriangle(e.x, y - 20, e.x + 21, y + 16, e.x - 21, y + 16); } else if (e.kind === 'turret') { g.fillRect(e.x - 20, y - 18, 40, 36); g.fillCircle(e.x, y, 12); } else if (e.kind === 'prism') { g.fillTriangle(e.x, y - 23, e.x + 22, y, e.x, y + 23); g.fillTriangle(e.x, y - 23, e.x - 22, y, e.x, y + 23); } else { g.fillCircle(e.x, y, 20); }
      g.fillStyle(0x08111f, 0.9); g.fillRect(e.x - 18, y - 31, 36, 4); g.fillStyle(0xff6b72, 0.9); g.fillRect(e.x - 18, y - 31, 36 * Math.max(0, e.hp / e.maxHp), 4);
      if (e.telegraph > 0) { var progress = 1 - e.telegraph / (e.fire === 'line' ? 0.95 : 0.68), radius = 28 + progress * 92; glow.lineStyle(3, band.danger, 0.7); glow.strokeCircle(e.x, y, radius); glow.lineStyle(2, band.danger, 0.65); if (e.fire === 'line') glow.lineBetween(e.x, y, S.player.x, screenY(S.player.y)); else { glow.lineBetween(e.x - 33, y, e.x + 33, y); glow.lineBetween(e.x, y - 33, e.x, y + 33); } }
    }
  }
  function renderShots(g, glow) {
    for (var i = 0; i < S.projectiles.length; i++) { var p = S.projectiles[i]; if (!p.active) continue; var y = screenY(p.y); glow.lineStyle(8, p.color, 0.22); glow.lineBetween(p.x - p.vx * 0.035, y - p.vy * 0.035, p.x, y); g.fillStyle(p.color, 0.98); g.fillCircle(p.x, y, p.r); }
    for (var j = 0; j < S.playerShots.length; j++) { var shot = S.playerShots[j]; if (!shot.active) continue; var sy = screenY(shot.y); glow.lineStyle(7, shot.color, 0.25); glow.lineBetween(shot.x, sy, shot.x - shot.vx * 0.03, sy - shot.vy * 0.03); g.fillStyle(shot.color, 1); g.fillCircle(shot.x, sy, shot.r); }
  }
  function renderFx(g, glow) {
    var i, p;
    for (i = 0; i < S.fx.dust.length; i++) { p = S.fx.dust[i]; if (!p.active) continue; g.fillStyle(p.color, p.life / p.max); g.fillCircle(p.x, screenY(p.y), p.size * p.life / p.max); }
    for (i = 0; i < S.fx.sparks.length; i++) { p = S.fx.sparks[i]; if (!p.active) continue; glow.fillStyle(p.color, 0.9 * p.life / p.max); glow.fillCircle(p.x, screenY(p.y), p.size); }
    for (i = 0; i < S.fx.shards.length; i++) { p = S.fx.shards[i]; if (!p.active) continue; g.fillStyle(p.color, p.life / p.max); g.fillTriangle(p.x, screenY(p.y) - p.size, p.x + p.size, screenY(p.y) + p.size, p.x - p.size, screenY(p.y) + p.size); }
    for (i = 0; i < S.fx.rings.length; i++) { var r = S.fx.rings[i]; if (!r.active) continue; glow.lineStyle(4, r.color, r.life / r.maxLife); glow.strokeCircle(r.x, screenY(r.y), r.radius); }
    for (i = 0; i < S.fx.telegraphs.length; i++) { var tele = S.fx.telegraphs[i]; if (!tele.active) continue; glow.lineStyle(2, tele.color, tele.life / tele.max); glow.strokeCircle(tele.x, screenY(tele.y), 16 + (1 - tele.life / tele.max) * 26); }
  }
  function powerIcon(key) { return key === 'shield' ? '◇' : key === 'pulse' ? '✦' : '➤'; }
  function renderHud(g) {
    var band = CH.bandAt(S.wave); g.fillStyle(0x071526, 0.94); g.fillRect(0, 0, BASE_W, HUD_H); g.lineStyle(1, band.accent, 0.3); g.lineBetween(0, HUD_H - 1, BASE_W, HUD_H - 1);
    updateText(L.wave, '#' + S.wave); updateText(L.score, '✦ ' + S.score);
    var slots = ['·', '·']; for (var p = 0; p < S.powerInventory.length && p < slots.length; p++) slots[p] = powerIcon(S.powerInventory[p]);
    updateText(L.power, slots.join('  ')); updateText(L.danger, S.danger ? '!' : '·');
    L.danger.setColor(S.danger ? '#ff8b72' : '#7892a7'); L.power.setColor(S.powerInventory.length ? '#ffd35e' : '#7892a7');
    var meterX = BASE_W / 2 - 68, meterW = 136, meter = S.platforms.length > 1 ? S.player.platformIndex / (S.platforms.length - 1) : 0;
    g.fillStyle(0x7892a7, 0.25); g.fillRoundedRect(meterX, 58, meterW, 6, 3); g.fillStyle(band.accent, 0.9); g.fillRoundedRect(meterX, 58, meterW * clamp(meter, 0, 1), 6, 3);
    for (var i = 0; i < L.life.length; i++) L.life[i].setVisible(i < S.lives);
    if (S.tutorialStep >= 0 && S.tutorialStep < CH.TUTORIAL.length) setCoach(CH.TUTORIAL[S.tutorialStep].text); else setCoach('');
  }
  function renderBanner() {
    if (!S.banner) { L.banner.setVisible(false); L.banner.setAlpha(0); return; }
    var fade = reducedMotion ? 1 : Math.min(1, (S.banner.max - S.banner.time) / 0.08, S.banner.time / 0.18);
    L.banner.setVisible(true); L.banner.setAlpha(fade); updateText(L.bannerTitle, S.banner.title); var tint = S.banner.tone === 'bad' ? 0xff6670 : S.banner.tone === 'warm' ? 0xffd35e : 0x74f3b0; L.bannerBg.setFillStyle(0x0b2031, 0.94).setStrokeStyle(1.5, tint, 0.62); L.bannerTitle.setColor(S.banner.tone === 'bad' ? '#ffdfe2' : S.banner.tone === 'warm' ? '#fff0b0' : '#c9ffe6');
  }
  function render() {
    if (!scene || !S) return;
    var band = CH.bandAt(S.wave); L.sky.setTexture('sky_' + band.key); L.sky.setDisplaySize(BASE_W, BASE_H);
    L.g.clear(); L.fx.clear(); L.glow.clear(); renderPlatforms(L.g, band); renderPickups(L.g); renderEnemies(L.g, L.glow, band); renderShots(L.g, L.glow); renderFx(L.g, L.glow);
    var p = S.player, py = screenY(p.y), tex = 'hopper_' + CH.skinDef(save.skin).key + '_' + p.anim; if (L.player.texture.key !== tex) L.player.setTexture(tex); L.player.setPosition(p.x, py); L.player.setAlpha(p.invuln > 0 && Math.floor(S.time * 18) % 2 === 0 ? 0.42 : 1); L.player.setVisible(true);
    if (S.shield > 0) { L.glow.lineStyle(3, 0x72e8ff, 0.82); L.glow.strokeCircle(p.x, py, 37 + Math.sin(S.time * 5) * 3); }
    renderHud(L.g); renderBanner(); L.vignette.setAlpha(S.damagePulse * 0.9); L.flash.setAlpha(S.flash * 0.2); if (HOOK.debug) { L.g.lineStyle(1, 0xffffff, 0.35); L.g.strokeRect(p.x - PLAYER_W / 2, py - PLAYER_H / 2, PLAYER_W, PLAYER_H); }
    syncHook();
  }

  var BootScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function BootScene() { Phaser.Scene.call(this, { key: 'Boot' }); },
    create: function () {
      kit.loader.show('Crossfire Hopper'); kit.loader.progress(0.15); bakeTextures(this); kit.loader.progress(0.56);
      var names = ['sfx_hop', 'sfx_land', 'sfx_coin', 'sfx_crash', 'sfx_fail', 'sfx_near', 'sfx_warn', 'sfx_medal', 'sfx_unlock', 'sfx_ui', 'sfx_banner', 'music_calm', 'music_storm'], reg = {};
      for (var i = 0; i < names.length; i++) reg[names[i]] = 'assets/' + names[i] + '.mp3'; kit.audio.register(reg); kit.audio.preload(names); kit.loader.progress(1); this.scene.start('Play');
    },
  });
  var PlayScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function PlayScene() { Phaser.Scene.call(this, { key: 'Play' }); },
    create: function () {
      scene = this; L.sky = this.add.image(BASE_W / 2, BASE_H / 2, 'sky_meadow').setDisplaySize(BASE_W, BASE_H); L.g = this.add.graphics(); L.glow = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD); L.fx = this.add.graphics();
      L.player = this.add.image(270, 400, 'hopper_sprout_idle').setDisplaySize(58, 68); L.vignette = this.add.image(BASE_W / 2, BASE_H / 2, 'red_vignette').setDisplaySize(BASE_W * 1.3, BASE_H * 1.3).setAlpha(0); L.flash = this.add.image(BASE_W / 2, BASE_H / 2, 'white_px').setDisplaySize(BASE_W, BASE_H).setTint(0xff3048).setAlpha(0);
      var fam = 'Avenir Next, Avenir, Segoe UI, system-ui, sans-serif';
      function text(x, y, size, color, origin) { return this.add.text(x, y, '', { fontFamily: fam, fontSize: size + 'px', color: color, fontStyle: '800', resolution: Math.min(2, window.devicePixelRatio || 1) }).setOrigin(origin == null ? 0 : origin, 0.5); }
      L.wave = text.call(this, 18, 22, 24, '#c9ffe6'); L.score = text.call(this, BASE_W / 2, 22, 20, '#ffd35e', 0.5); L.power = text.call(this, 18, 60, 18, '#7892a7'); L.danger = text.call(this, BASE_W - 18, 60, 22, '#7892a7', 1);
      L.life = []; for (var i = 0; i < 3; i++) { var life = text.call(this, BASE_W - 116 + i * 28, 22, 18, '#ff8b72'); life.setText('♥'); L.life.push(life); }
      L.banner = this.add.container(BASE_W - 14 - 110, HUD_H + 25); L.bannerBg = this.add.rectangle(0, 0, 220, 40, 0x0b2031, 0.94).setStrokeStyle(1.5, 0x74f3b0, 0.6); L.bannerTitle = text.call(this, 0, 0, 20, '#c9ffe6', 0.5); L.banner.add([L.bannerBg, L.bannerTitle]); L.banner.setVisible(false);
      HOOK.hop = function (dir) { var map = { up: 'up', down: 'down', left: 'left', right: 'right' }; queue({ type: 'command', command: map[dir] || 'up' }); return true; }; HOOK.dodge = function () { queue({ type: 'command', command: 'dodge' }); return true; }; HOOK.fire = function () { queue({ type: 'command', command: 'fire' }); return true; }; HOOK.power = function () { queue({ type: 'command', command: 'power' }); return true; }; HOOK.restart = function () { startRun(S ? S.mode : 'run'); return true; }; HOOK.startRun = function (mode, opts) { startRun(mode, opts); return true; }; HOOK.toMenu = function () { toAttract(); showTitle(); return true; }; HOOK.inspectRow = function (index) { var i = Math.max(0, Math.floor(Number(index) || 0)), w = CH.waveDef(i); return { i: i, wave: w.key, name: w.name, platforms: w.platforms.length, enemies: w.enemies.length, pickups: w.pickups.length, safeStart: !!w.platforms[0].safe, finish: !!w.platforms[w.platforms.length - 1].finish }; };
      toAttract(); showTitle(); kit.loader.hide(); ST.ready = true; window.__CROSSFIRE_READY = true;
    },
    update: function (time, delta) {
      applyForces(); if (!S) return; var jf = kit.juice.frame(); if (!kit.paused && !jf.frozen) { var ms = delta > 0 ? Math.min(100, delta) : 16.7; this.acc = (this.acc || 0) + ms / 1000; var steps = 0; while (this.acc >= STEP && steps < MAX_STEPS) { simStep(STEP); this.acc -= STEP; steps++; } if (steps === MAX_STEPS) this.acc = 0; } render();
      if (time - lastFrame > 120) { lastFrame = time; syncHook(); }
    },
  });

  function boot() {
    dom.coach = document.getElementById('coach'); dom.pad = document.getElementById('pad'); dom.chips = document.getElementById('chips'); dom.ui = document.getElementById('ui'); dom.card = document.getElementById('uicard'); dom.btnDodge = document.getElementById('btnDodge'); dom.btnFire = document.getElementById('btnFire'); dom.btnPower = document.getElementById('btnPower');
    bindPad(); installInputQueue(); dom.card.addEventListener('click', onUIClick); document.getElementById('btnPause').addEventListener('click', function () { if (S && S.phase === 'play') { kit.pause('menu'); showPause(); } }); document.getElementById('btnSet').addEventListener('click', function () { kit.openSettings([function (box, row) { row('Arrow pad', function () { return !padHidden; }, function (v) { padHidden = !v; setPadVisible(S && S.phase === 'play'); }); }]); });
    var vw = Math.max(1, window.innerWidth), vh = Math.max(1, window.innerHeight); BASE_H = Math.max(860, Math.min(1320, Math.round(BASE_W * vh / vw))); var canvasCss = Math.min(vw, vh * BASE_W / BASE_H); document.documentElement.style.setProperty('--coachtop', Math.round(HUD_H * canvasCss / BASE_W) + 10 + 'px');
    new Phaser.Game({ type: Phaser.AUTO, parent: document.body, backgroundColor: '#08111f', width: BASE_W, height: BASE_H, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, render: { antialias: true, antialiasGL: false, powerPreference: 'high-performance', roundPixels: false, batchSize: 2048 }, fps: { target: 60, min: 30 }, scene: [BootScene, PlayScene] }); kit.registerPWA();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
