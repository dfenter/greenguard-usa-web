/* Vector Storm - AAA rebuild
 * Phaser 3 scene with a fixed-step arena simulation. GGKit owns lifecycle,
 * input identity, persistence, audio buses and PWA registration.
 */
(function (root) {
  'use strict';

  var Core = root.VSCore;
  var TAU = Core.TAU;
  var STEP = 1 / 60;
  var MAX_STEPS = 5;
  var MAX_ENEMIES = 96;
  var MAX_BULLETS = 96;
  var MAX_HOSTILE_BULLETS = 192;
  var MAX_TELEGRAPHS = 18;
  var MAX_CRYSTALS = 160;
  var MAX_DROPS = 18;
  var MAX_POPUPS = 28;
  var MAX_RINGS = 18;
  var SAVE_VERSION = 1;
  var DPR = 1;

  var PAL = {
    ice: 0xe9fbff, cyan: 0x61efff, teal: 0x6ce4db, mint: 0x8affe0,
    rose: 0xff6b94, amber: 0xffd166, violet: 0xc992ff, blue: 0x6996ff,
    orange: 0xff925e, white: 0xffffff, ink: 0x060913, dim: 0x7690aa
  };

  var WAVE_SETS = [
    {
      key: 'void', name: 'OPEN VOID', kicker: 'CLEAN LINES / FIRST CONTACT',
      accent: PAL.cyan, accent2: PAL.mint, top: '#050a18', bottom: '#071b2b',
      grammar: 'edge lanes and split rings', boss: 'prism', bossName: 'PRISM WARDEN'
    },
    {
      key: 'debris', name: 'DEBRIS FIELD', kicker: 'BROKEN ORBITS / CROSS TRAFFIC',
      accent: PAL.amber, accent2: PAL.orange, top: '#100b17', bottom: '#241622',
      grammar: 'asteroid clusters and segmented snakes', boss: 'breaker', bossName: 'DEBRIS BREAKER'
    },
    {
      key: 'gravity', name: 'GRAVITY CLUSTER', kicker: 'PULL LINES / NO SAFE ANGLE',
      accent: PAL.violet, accent2: PAL.blue, top: '#080719', bottom: '#15133a',
      grammar: 'well pairs and spiral entries', boss: 'singularity', bossName: 'SINGULARITY HEART'
    },
    {
      key: 'finale', name: 'BOSS-SWARM FINALE', kicker: 'FULL PRESSURE / FLEET F2',
      accent: PAL.rose, accent2: PAL.amber, top: '#140714', bottom: '#2b1023',
      grammar: 'swarm lanes around an elite core', boss: 'swarmcore', bossName: 'CROWN SWARM'
    }
  ];

  var MEDALS = [
    { wave: 3, name: 'BRONZE', color: PAL.amber, unlock: 'AEGIS SHIP SKIN' },
    { wave: 6, name: 'SILVER', color: PAL.ice, unlock: 'PRISM WEAPON' },
    { wave: 9, name: 'GOLD', color: PAL.violet, unlock: 'WRAITH SHIP SKIN' },
    { wave: 12, name: 'DIAMOND', color: PAL.mint, unlock: 'NOVA WEAPON' }
  ];

  var SHIPS = {
    vector: { name: 'VECTOR', tint: PAL.cyan, wing: PAL.ice },
    aegis: { name: 'AEGIS', tint: PAL.mint, wing: PAL.cyan },
    wraith: { name: 'WRAITH', tint: PAL.violet, wing: PAL.ice }
  };
  var WEAPONS = {
    pulse: { name: 'PULSE', fireRate: 0.105, damage: 1, speed: 690, shots: 1, spread: 0.0, pierce: 0 },
    prism: { name: 'PRISM', fireRate: 0.135, damage: 1, speed: 650, shots: 2, spread: 0.11, pierce: 0 },
    lance: { name: 'LANCE', fireRate: 0.145, damage: 2, speed: 820, shots: 1, spread: 0.0, pierce: 1 },
    nova: { name: 'NOVA', fireRate: 0.17, damage: 1, speed: 720, shots: 3, spread: 0.18, pierce: 0 }
  };

  var POWERUPS = {
    bomb: { label: 'BOMB', color: PAL.rose },
    shield: { label: 'SHIELD', color: PAL.cyan },
    overdrive: { label: 'OVERDRIVE', color: PAL.amber },
    weapon: { label: 'WEAPON', color: PAL.violet },
    purge: { label: 'PURGE', color: PAL.mint }
  };

  var FAMILY = {
    drifter: { r: 12, hp: 1, speed: 55, points: 14, color: PAL.rose },
    weaver: { r: 12, hp: 2, speed: 82, points: 28, color: PAL.amber },
    snake: { r: 10, hp: 3, speed: 96, points: 44, color: PAL.mint },
    spawner: { r: 19, hp: 9, speed: 27, points: 130, color: PAL.violet },
    well: { r: 21, hp: 14, speed: 19, points: 180, color: PAL.blue },
    mini: { r: 7, hp: 1, speed: 118, points: 9, color: PAL.orange },
    prism: { r: 26, hp: 20, speed: 34, points: 420, color: PAL.cyan, boss: true },
    breaker: { r: 29, hp: 25, speed: 30, points: 520, color: PAL.orange, boss: true },
    singularity: { r: 31, hp: 34, speed: 14, points: 700, color: PAL.violet, boss: true },
    swarmcore: { r: 33, hp: 42, speed: 25, points: 900, color: PAL.rose, boss: true }
  };

  var BOOT_STATE = {
    wave: 0, lives: 3, multiplier: 1, score: 0, bombs: 2, crystals: 0,
    peakMultiplier: 1, set: 'OPEN VOID', setKey: 'void', enemyCount: 0,
    medal: '', unlocked: ['vector', 'pulse'], tutorialStep: 0,
    forceWave: 0, forceEvent: '', reducedMotion: false
  };
  if (!root.__vs) root.__vs = { state: BOOT_STATE, forceWave: 0, forceEvent: '' };
  if (!root.__vs.state) root.__vs.state = BOOT_STATE;
  var DEBUG = root.__vs.state;

  function safeShip(key) { return SHIPS[key] || SHIPS.vector; }
  function safeWeapon(key) { return WEAPONS[key] || WEAPONS.pulse; }
  function setForWave(wave) {
    var index = Math.floor(Math.max(1, wave) - 1) % WAVE_SETS.length;
    return WAVE_SETS[index] || WAVE_SETS[0];
  }
  function clampWave(value) {
    var n = Number(value);
    return Number.isFinite(n) && n >= 1 ? Math.max(1, Math.min(99, Math.floor(n))) : 0;
  }
  function validateSave(obj) {
    if (!obj || obj.version !== SAVE_VERSION) return false;
    if (!Number.isFinite(obj.bestScore) || obj.bestScore < 0 || obj.bestScore > 999999999) return false;
    if (!Array.isArray(obj.medals) || obj.medals.length !== MEDALS.length) return false;
    if (!Array.isArray(obj.unlocks) || obj.unlocks.length < 2 || obj.unlocks.length > 8) return false;
    for (var i = 0; i < obj.medals.length; i++) {
      if (!Number.isInteger(obj.medals[i]) || obj.medals[i] < 0 || obj.medals[i] > 4) return false;
    }
    for (var j = 0; j < obj.unlocks.length; j++) {
      if (!SHIPS[obj.unlocks[j]] && !WEAPONS[obj.unlocks[j]]) return false;
    }
    return (obj.tutorialDone === true || obj.tutorialDone === false) &&
      !!SHIPS[obj.ship] && !!WEAPONS[obj.weapon] &&
      obj.unlocks.indexOf('vector') >= 0 && obj.unlocks.indexOf('pulse') >= 0 &&
      obj.unlocks.indexOf(obj.ship) >= 0 && obj.unlocks.indexOf(obj.weapon) >= 0;
  }

  var scene = null;
  var kit = root.GGKit.create({
    slug: 'vector-storm',
    orientation: 'landscape',
    validateSave: validateSave,
    onPause: function () { if (scene) { scene.kitPaused = true; scene.clearGamepadState(); scene.updatePauseText(); } },
    onResume: function () { if (scene) { scene.kitPaused = false; scene.updatePauseText(); } },
    onRestart: function () { if (scene) scene.resetRun(); }
  });
  kit.audio.register({
    music: 'assets/void-drive.mp3', intensity: 'assets/void-alert.mp3', fire: 'assets/fire.mp3', explosion: 'assets/explosion.mp3',
    bomb: 'assets/bomb.mp3', crystal: 'assets/crystal.mp3', wave: 'assets/wave-clear.mp3',
    milestone: 'assets/milestone.mp3', boss: 'assets/boss.mp3', damage: 'assets/damage.mp3',
    pickup: 'assets/pickup.mp3', gameover: 'assets/gameover.mp3'
  });
  kit.registerPWA();

  var save = kit.save.get({
    version: SAVE_VERSION, bestScore: 0, medals: [0, 0, 0, 0],
    unlocks: ['vector', 'pulse'], tutorialDone: false, ship: 'vector', weapon: 'pulse'
  });

  function pointerHandler(e) {
    if (!scene || kit.paused) return;
    var pointer = kit.input.pointers.get(e.pointerId);
    if (!pointer) return;
    var point = scene.localPoint(e.clientX, e.clientY), x = point.x, y = point.y, m = scene.metrics;
    scene.pointerAction = true;
    scene.inputModality = 'touch';
    if (scene.state === 'over') scene.restartQueued = true;
    if (scene.inBombButton(x, y)) {
      pointer.zone = 'bomb';
      scene.bombQueued = true;
    } else if (scene.inSettingsButton(x, y)) {
      pointer.zone = 'settings';
      kit.openSettings();
    } else {
      pointer.zone = x < m.W * 0.5 ? 'move' : 'aim';
    }
  }
  root.addEventListener('pointerdown', pointerHandler, { passive: true });

  root.addEventListener('keydown', function (e) {
    if (!scene || kit.paused || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey ||
      e.key === 'Tab' || e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' ||
      e.key === 'Meta' || e.key === 'Escape' || /^F\d+$/.test(e.key)) return;
    scene.inputModality = 'keyboard';
    scene.restartKeyQueued = true;
  }, { passive: true });

  function makeEnemyRecord(id) {
    return {
      id: id, active: false, kind: 'drifter', gfx: null, x: 0, y: 0, vx: 0, vy: 0,
      r: 10, hp: 1, maxHp: 1, points: 0, speed: 0, phase: 0, angle: 0,
      born: 0, hurt: 0, emit: 0, fireClock: 0, pattern: 0, kids: 0, owner: -1, elite: false, segN: 0,
      segX: new Float32Array(10), segY: new Float32Array(10)
    };
  }
  function makeBulletRecord(id) {
    return { id: id, active: false, gfx: null, x: 0, y: 0, vx: 0, vy: 0, life: 0, r: 3, damage: 1, pierce: 0, tint: PAL.ice };
  }
  function makeHostileBulletRecord(id) {
    return { id: id, active: false, gfx: null, x: 0, y: 0, vx: 0, vy: 0, life: 0, r: 5, damage: 1, tint: PAL.rose, grazed: false, age: 0 };
  }
  function makeTelegraphRecord(id) {
    return { id: id, active: false, owner: -1, pattern: '', x: 0, y: 0, angle: 0, color: PAL.rose, life: 0, max: 0 };
  }
  function makeCrystalRecord(id) {
    return { id: id, active: false, gfx: null, x: 0, y: 0, vx: 0, vy: 0, life: 0, phase: 0 };
  }
  function makeDropRecord(id) {
    return { id: id, active: false, gfx: null, x: 0, y: 0, life: 0, phase: 0, type: 'bomb' };
  }
  function makePopupRecord(id) {
    return { id: id, active: false, text: null, x: 0, y: 0, baseY: 0, life: 0, max: 0, age: 0 };
  }
  function makeRingRecord(id) {
    return { id: id, active: false, x: 0, y: 0, age: 0, life: 0.8, r0: 0, r1: 80, color: PAL.cyan };
  }

  function textStyle(size, color, weight) {
    return {
      fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace',
      fontSize: Math.round(size * DPR) + 'px', fontStyle: weight || 'bold', color: color || '#e9fbff', resolution: root.GGKit.hiDpi.dpr(),
      stroke: '#02040a', strokeThickness: 4, shadow: { offsetX: 0, offsetY: 2, color: '#000000', blur: 5, fill: true }
    };
  }

  class VectorStormScene extends Phaser.Scene {
    constructor() { super({ key: 'VectorStormScene' }); }

    create() {
      scene = this;
      this.kitPaused = !!kit.paused;
      this.accumulator = 0;
      this.simTime = 0;
      this.metrics = { W: 0, H: 0, arena: { x: 0, y: 0, w: 0, h: 0 }, bomb: { x: 0, y: 0, r: 25 }, settings: { x: 0, y: 0, r: 16 } };
      this.inputState = { moveX: 0, moveY: 0, moveMag: 0, aimX: 0, aimY: 0, aimMag: 0 };
      this.gamepad = { connected: false, moveX: 0, moveY: 0, moveMag: 0, aimX: 0, aimY: 0, aimMag: 0, bomb: false, any: false };
      this.gamepadPrevButtons = [];
      this.prevKeys = {};
      this.pointerAction = false;
      this.restartQueued = false;
      this.restartKeyQueued = false;
      this.inputModality = 'touch';
      this.bombQueued = false;
      this.runIndex = 0;
      this.enemyPool = [];
      this.bulletPool = [];
      this.hostileBulletPool = [];
      this.telegraphPool = [];
      this.crystalPool = [];
      this.dropPool = [];
      this.popupPool = [];
      this.ringPool = [];
      for (var i = 0; i < MAX_ENEMIES; i++) this.enemyPool.push(makeEnemyRecord(i));
      for (var j = 0; j < MAX_BULLETS; j++) this.bulletPool.push(makeBulletRecord(j));
      for (var h = 0; h < MAX_HOSTILE_BULLETS; h++) this.hostileBulletPool.push(makeHostileBulletRecord(h));
      for (var t = 0; t < MAX_TELEGRAPHS; t++) this.telegraphPool.push(makeTelegraphRecord(t));
      for (var k = 0; k < MAX_CRYSTALS; k++) this.crystalPool.push(makeCrystalRecord(k));
      for (var q = 0; q < MAX_DROPS; q++) this.dropPool.push(makeDropRecord(q));
      for (var p = 0; p < MAX_POPUPS; p++) this.popupPool.push(makePopupRecord(p));
      for (var r = 0; r < MAX_RINGS; r++) this.ringPool.push(makeRingRecord(r));

      this.worldRoot = this.add.container(0, 0).setDepth(0);
      this.worldFx = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
      this.playerG = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
      this.worldRoot.add(this.worldFx);
      this.worldRoot.add(this.playerG);
      this.hudG = this.add.graphics().setDepth(80);
      this.bannerG = this.add.graphics().setDepth(106);
      this.makeParticleTexture();
      this.makeParticleSystems();
      this.makeUi();
      this.rebuildLayout(true);
      this.scale.on('resize', function () { this.rebuildLayout(false); }, this);
      this.resetRun();
      kit.loader.progress(1);
      kit.loader.hide();
      kit.audio.music('music', 900);
    }

    makeParticleTexture() {
      if (this.textures.exists('vs-dot')) return;
      var baked = root.GGKit.hiDpi.canvas(32, 32);
      var t = this.textures.addCanvas('vs-dot', baked.canvas), c = baked.ctx;
      if (!t || !c) return;
      var g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.24, 'rgba(255,255,255,.85)');
      g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 32, 32); t.refresh();
    }

    makeParticleSystems() {
      this.fx = {};
      this.fx.fire = this.add.particles(0, 0, 'vs-dot', {
        lifespan: { min: 90, max: 220 }, speed: { min: 130, max: 360 }, scale: { start: 0.28, end: 0.02 },
        alpha: { start: 0.95, end: 0 }, emitting: false, maxAliveParticles: 120, tint: PAL.white, blendMode: 'ADD'
      });
      this.fx.playerHit = this.add.particles(0, 0, 'vs-dot', {
        lifespan: { min: 260, max: 520 }, speed: { min: 120, max: 330 }, scale: { start: 0.42, end: 0.03 },
        alpha: { start: 0.9, end: 0 }, emitting: false, maxAliveParticles: 130, tint: PAL.rose, blendMode: 'ADD'
      });
      this.fx.powerup = this.add.particles(0, 0, 'vs-dot', {
        lifespan: { min: 300, max: 680 }, speed: { min: 45, max: 190 }, scale: { start: 0.48, end: 0.03 },
        alpha: { start: 0.95, end: 0 }, emitting: false, maxAliveParticles: 130, tint: PAL.mint, blendMode: 'ADD'
      });
      this.fx.enemyHit = this.add.particles(0, 0, 'vs-dot', {
        lifespan: { min: 140, max: 330 }, speed: { min: 80, max: 260 }, scale: { start: 0.3, end: 0.02 },
        alpha: { start: 0.9, end: 0 }, emitting: false, maxAliveParticles: 180, tint: PAL.amber, blendMode: 'ADD'
      });
      this.fx.explosion = this.add.particles(0, 0, 'vs-dot', {
        lifespan: { min: 260, max: 620 }, speed: { min: 100, max: 330 }, scale: { start: 0.54, end: 0.02 },
        alpha: { start: 0.95, end: 0 }, emitting: false, maxAliveParticles: 220, tint: PAL.orange, blendMode: 'ADD'
      });
      this.fx.screenFx = this.add.particles(0, 0, 'vs-dot', {
        lifespan: { min: 240, max: 560 }, speed: { min: 180, max: 460 }, scale: { start: 0.38, end: 0.02 },
        alpha: { start: 0.92, end: 0 }, emitting: false, maxAliveParticles: 180, tint: PAL.rose, blendMode: 'ADD'
      });
      this.fx.crystals = this.add.particles(0, 0, 'vs-dot', {
        lifespan: { min: 350, max: 700 }, speed: { min: 30, max: 150 }, scale: { start: 0.42, end: 0.04 },
        alpha: { start: 0.9, end: 0 }, emitting: false, maxAliveParticles: 150, tint: PAL.mint,
        blendMode: 'ADD'
      });
      this.fx.embers = this.add.particles(0, 0, 'vs-dot', {
        lifespan: { min: 500, max: 980 }, speed: { min: 20, max: 190 }, scale: { start: 0.55, end: 0.03 },
        alpha: { start: 0.8, end: 0 }, emitting: false, maxAliveParticles: 180, tint: PAL.orange,
        blendMode: 'ADD'
      });
      this.fx.smoke = this.add.particles(0, 0, 'vs-dot', {
        lifespan: { min: 600, max: 1100 }, speed: { min: 10, max: 75 }, scale: { start: 0.8, end: 0.12 },
        alpha: { start: 0.3, end: 0 }, emitting: false, maxAliveParticles: 110, tint: PAL.blue,
        blendMode: 'ADD'
      });
      for (var key in this.fx) { this.fx[key].setDepth(24); this.worldRoot.add(this.fx[key]); }
    }

    makeUi() {
      var label = textStyle(10, '#7594ac', 'bold');
      var value = textStyle(18, '#e9fbff', 'bold');
      var small = textStyle(14, '#b9d7e4', 'bold');
      var mid = textStyle(16, '#e9fbff', 'bold');
      this.ui = {};
      this.ui.score = this.add.text(18, 12, '◆ 0', value).setDepth(100);
      this.ui.wave = this.add.text(0, 12, 'W00', mid).setOrigin(0.5, 0).setDepth(100);
      this.ui.mult = this.add.text(0, 12, 'x1', value).setOrigin(1, 0).setDepth(100);
      this.ui.crystals = this.add.text(0, 38, '◇ 00/08', small).setOrigin(1, 0).setDepth(100);
      this.ui.bomb = this.add.text(0, 22, '×2', small).setOrigin(0.5, 0.5).setDepth(101);
      this.ui.settings = this.add.text(0, 0, '', label).setOrigin(0.5, 0.5).setDepth(101).setVisible(false);
      this.ui.coach = this.add.text(0, 0, '', textStyle(14, '#d7f7ff', 'bold')).setOrigin(0.5).setDepth(100);
      this.ui.banner = this.add.text(0, 0, '', textStyle(24, '#e9fbff', 'bold')).setOrigin(0.5).setDepth(100).setVisible(false);
      this.ui.bannerSub = this.add.text(0, 0, '', textStyle(14, '#a9d4e5', 'bold')).setOrigin(0.5).setDepth(100).setVisible(false);
      this.ui.overTitle = this.add.text(0, 0, 'GAME OVER', textStyle(32, '#ff7998', 'bold')).setOrigin(0.5).setDepth(110).setVisible(false);
      this.ui.overScore = this.add.text(0, 0, '', textStyle(18, '#e9fbff', 'bold')).setOrigin(0.5).setDepth(110).setVisible(false);
      this.ui.overDetails = this.add.text(0, 0, '', textStyle(12, '#b7d5df', 'bold')).setOrigin(0.5).setDepth(110).setVisible(false);
      this.ui.overPrompt = this.add.text(0, 0, 'TAP OR PRESS ANY KEY TO REDEPLOY', textStyle(12, '#8affe0', 'bold')).setOrigin(0.5).setDepth(110).setVisible(false);
      this.ui.pause = this.add.text(0, 0, 'PAUSED BY SYSTEM', textStyle(13, '#d7f7ff', 'bold')).setOrigin(0.5).setDepth(120).setVisible(false);
      this.ui.bossBarBg = this.add.rectangle(0, 0, 10, 6, 0x361529, 0.9).setOrigin(0, 0.5).setDepth(100).setVisible(false);
      this.ui.bossBar = this.add.rectangle(0, 0, 10, 6, PAL.rose, 1).setOrigin(0, 0.5).setDepth(101).setVisible(false);
      this.ui.overBackdrop = this.add.rectangle(0, 0, 10, 10, 0x02040a, 0.84).setOrigin(0).setDepth(105).setVisible(false);
    }

    rebuildLayout(force) {
      var W = Math.max(1, Number(this.scale.width) || 900);
      var H = Math.max(1, Number(this.scale.height) || 480);
      var compact = W < 520 || H < 380;
      var margin = compact ? 10 : 18;
      var top = compact ? 88 : 82;
      var bottom = H - (compact ? 16 : 24);
      if (bottom < top + 110) { top = Math.max(64, H - 150); bottom = H - 8; }
      var arena = { x: margin, y: top, w: Math.max(1, W - margin * 2), h: Math.max(1, bottom - top) };
      this.metrics.W = W; this.metrics.H = H; this.metrics.arena = arena;
      this.metrics.compact = compact;
      this.metrics.bomb = compact ? { x: Math.max(28, W - 48), y: 63, r: 22 } : { x: W - 69, y: 43, r: 25 };
      this.metrics.settings = compact ? { x: Math.max(18, W - 18), y: 18, r: 14 } : { x: W - 23, y: 22, r: 15 };
      if (!this.chromeImage || force || this.chromeTheme !== this.currentSetKey) this.rebuildChrome();
      this.layoutUi();
    }

    rebuildChrome() {
      var W = this.metrics.W, H = this.metrics.H, a = this.metrics.arena;
      var set = WAVE_SETS[this.currentSetIndex || 0] || WAVE_SETS[0];
      var key = 'vs-chrome';
      if (this.textures.exists(key)) this.textures.remove(key);
      var texture = this.textures.createCanvas(key, Math.ceil(W), Math.ceil(H));
      var c = texture.getContext();
      var grad = c.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, set.top); grad.addColorStop(1, set.bottom);
      c.fillStyle = grad; c.fillRect(0, 0, W, H);
      var header = this.metrics.compact ? 90 : 76;
      c.fillStyle = 'rgba(2,4,10,.72)'; c.fillRect(0, 0, W, header);
      c.strokeStyle = 'rgba(124,186,214,.12)'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, header - .5); c.lineTo(W, header - .5); c.stroke();
      var rng = Core.makeRng((this.currentSetIndex + 1) * 0x4123 + 77);
      if (set.key === 'void') {
        for (var s = 0; s < 90; s++) {
          var sx = rng() * W, sy = 94 + rng() * (H - 94), al = 0.13 + rng() * 0.3;
          c.fillStyle = 'rgba(173,232,255,' + al.toFixed(3) + ')'; c.fillRect(sx, sy, rng() > 0.8 ? 2 : 1, 1);
        }
      } else if (set.key === 'debris') {
        for (var d = 0; d < 36; d++) {
          var dx = a.x + rng() * a.w, dy = a.y + rng() * a.h, dr = 5 + rng() * 17;
          c.strokeStyle = 'rgba(255,177,106,' + (0.08 + rng() * .12).toFixed(3) + ')'; c.lineWidth = 1;
          c.beginPath(); c.moveTo(dx - dr, dy - dr * .4); c.lineTo(dx + dr, dy + dr * .25); c.lineTo(dx + dr * .4, dy + dr); c.stroke();
        }
      } else if (set.key === 'gravity') {
        for (var o = 0; o < 9; o++) {
          var ox = a.x + rng() * a.w, oy = a.y + rng() * a.h;
          c.strokeStyle = 'rgba(177,145,255,.10)'; c.lineWidth = 1;
          c.beginPath(); c.ellipse(ox, oy, 18 + rng() * 40, 7 + rng() * 20, rng() * TAU, 0, TAU); c.stroke();
        }
      } else {
        for (var b = 0; b < 14; b++) {
          var bx = a.x + rng() * a.w, by = a.y + rng() * a.h;
          c.strokeStyle = 'rgba(255,103,148,.14)'; c.lineWidth = 1;
          c.beginPath(); c.moveTo(bx, a.y); c.lineTo(bx + (rng() - .5) * 80, a.y + a.h); c.stroke();
          c.beginPath(); c.arc(bx, by, 14 + rng() * 20, 0, TAU); c.stroke();
        }
      }
      c.fillStyle = 'rgba(12,29,46,.46)'; c.fillRect(a.x, a.y, a.w, a.h);
      c.save(); c.beginPath(); c.rect(a.x, a.y, a.w, a.h); c.clip();
      c.strokeStyle = set.key === 'debris' ? 'rgba(255,194,116,.13)' : 'rgba(100,194,232,.15)';
      c.lineWidth = 1;
      for (var x = a.x + 12; x < a.x + a.w; x += 44) { c.beginPath(); c.moveTo(x, a.y); c.lineTo(x, a.y + a.h); c.stroke(); }
      for (var y = a.y + 14; y < a.y + a.h; y += 44) { c.beginPath(); c.moveTo(a.x, y); c.lineTo(a.x + a.w, y); c.stroke(); }
      c.restore();
      c.strokeStyle = 'rgba(112,222,250,.18)'; c.lineWidth = 7; c.strokeRect(a.x, a.y, a.w, a.h);
      c.strokeStyle = Core.hex(set.accent); c.globalAlpha = .72; c.lineWidth = 1.5; c.strokeRect(a.x, a.y, a.w, a.h); c.globalAlpha = 1;
      var corner = 23; c.strokeStyle = 'rgba(222,250,255,.72)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(a.x, a.y + corner); c.lineTo(a.x, a.y); c.lineTo(a.x + corner, a.y); c.moveTo(a.x + a.w - corner, a.y); c.lineTo(a.x + a.w, a.y); c.lineTo(a.x + a.w, a.y + corner); c.moveTo(a.x, a.y + a.h - corner); c.lineTo(a.x, a.y + a.h); c.lineTo(a.x + corner, a.y + a.h); c.moveTo(a.x + a.w - corner, a.y + a.h); c.lineTo(a.x + a.w, a.y + a.h); c.lineTo(a.x + a.w, a.y + a.h - corner); c.stroke();
      texture.refresh();
      if (!this.chromeImage) this.chromeImage = this.add.image(0, 0, key).setOrigin(0);
      else this.chromeImage.setTexture(key);
      this.chromeImage.setDepth(-20); this.worldRoot.addAt(this.chromeImage, 0);
      this.chromeTheme = this.currentSetKey;
    }

    layoutUi() {
      var W = this.metrics.W, H = this.metrics.H, a = this.metrics.arena;
      this.ui.wave.setPosition(W * .5, 12);
      var right = this.metrics.compact ? Math.max(88, W - 98) : W - 20;
      this.ui.mult.setPosition(right, 12); this.ui.crystals.setPosition(right, 38);
      this.ui.bomb.setPosition(this.metrics.bomb.x, this.metrics.bomb.y); this.ui.settings.setPosition(this.metrics.settings.x, this.metrics.settings.y);
      this.ui.coach.setPosition(W * .5, a.y - 14);
      this.ui.banner.setPosition(W * .5, a.y + a.h * .42); this.ui.bannerSub.setPosition(W * .5, a.y + a.h * .42 + 27);
      var bossWidth = Math.min(200, Math.max(1, W - 40)); this.ui.bossBarBg.setPosition(W * .5 - bossWidth * .5, a.y - 5); this.ui.bossBar.setPosition(W * .5 - bossWidth * .5, a.y - 5);
      this.ui.overBackdrop.setSize(W, H); this.ui.overTitle.setPosition(W * .5, H * .39); this.ui.overScore.setPosition(W * .5, H * .51); this.ui.overDetails.setPosition(W * .5, H * .58); this.ui.overPrompt.setPosition(W * .5, H * .68); this.ui.pause.setPosition(W * .5, H * .5);
      this.hudG.setPosition(0, 0); this.bannerG.setPosition(0, 0);
    }

    localPoint(x, y) {
      var canvas = this.game && this.game.canvas, rect = canvas && canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
      if (!rect) { var host = root.document && root.document.getElementById('game'); rect = host && host.getBoundingClientRect ? host.getBoundingClientRect() : { left: 0, top: 0 }; }
      return { x: x - (rect.left || 0), y: y - (rect.top || 0) };
    }

    clearGamepadState() {
      this.gamepad = { connected: false, moveX: 0, moveY: 0, moveMag: 0, aimX: 0, aimY: 0, aimMag: 0, bomb: false, any: false };
      this.gamepadPrevButtons = [];
      this.gamepadButtons = [];
    }

    updatePauseText() { this.ui.pause.setVisible(!!this.kitPaused || !!kit.paused); }

    inBombButton(x, y) { var b = this.metrics.bomb; return Core.dist2(x, y, b.x, b.y) <= (b.r + 12) * (b.r + 12); }
    inSettingsButton(x, y) { var s = this.metrics.settings; return Core.dist2(x, y, s.x, s.y) <= (s.r + 10) * (s.r + 10); }

    ensureGfx(record, depth) {
      if (!record.gfx) {
        record.gfx = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setDepth(depth || 24);
        this.worldRoot.add(record.gfx);
      }
      record.gfx.setVisible(true); return record.gfx;
    }

    resetRun() {
      this.runIndex++;
      this.clearPools();
      var seed = (Number(DEBUG.seed) || 0x6a09e667) ^ (this.runIndex * 0x45d9f3b);
      this.rng = Core.makeRng(seed >>> 0);
      this.state = 'play'; this.wave = 0; this.waveTimer = .7; this.waveLive = false; this.clearPending = false;
      this.score = 0; this.lives = 3; this.bombs = 2; this.crystals = 0; this.multiplier = 1; this.peakMultiplier = 1;
      this.powerups = { shield: 0, overdrive: 0, weapon: 0 };
      this.overflow = { enemies: 0, bullets: 0, hostileBullets: 0, telegraphs: 0, crystals: 0, drops: 0, popups: 0, rings: 0 };
      this.killCount = 0; this.currentSetIndex = 0; this.currentSetKey = 'void'; this.milestone = 0; this.runMedal = '';
      this.activeShip = safeShip(save.ship); this.activeWeapon = safeWeapon(save.weapon);
      this.player = { x: 0, y: 0, vx: 0, vy: 0, r: 11, angle: -Math.PI / 2, cooldown: .25, invuln: 1.8, muzzle: 0, hurt: 0, animTime: 0, state: 'idle', thrust: 0 };
      this.player.x = this.metrics.arena.x + this.metrics.arena.w * .5;
      this.player.y = this.metrics.arena.y + this.metrics.arena.h * .62;
      this.bannerTime = 0; this.bannerKind = ''; this.bannerScale = 1; this.bannerColor = PAL.cyan; this.musicMode = 'music';
      this.bombFx = 0; this.flash = 0; this.damageFlash = 0; this.multPulse = 0; this.killFlash = 0; this.respawn = 0; this.overTime = 0;
      this.bannerAge = 0; this.bannerOffset = 0; this.activeTransient = null; this.transientQueue = [];
      this.tutorialStep = save.tutorialDone ? 3 : 0;
      this.coachStep = -1; this.coachModality = ''; this.coachTime = 0;
      this.prevKeys = {}; this.gamepadPrevButtons = []; this.pointerAction = false; this.restartQueued = false; this.restartKeyQueued = false; this.bombQueued = false; this.lastForceWave = 0; this.lastForceEvent = String((root.__vs && root.__vs.forceEvent) || DEBUG.forceEvent || '');
      this.rebuildLayout(false);
      this.syncDebug();
      var forced = this.readForceWave();
      if (forced) this.startWave(forced);
    }

    clearPools() {
      var i;
      for (i = 0; i < this.enemyPool.length; i++) { this.enemyPool[i].active = false; if (this.enemyPool[i].gfx) this.enemyPool[i].gfx.setVisible(false); }
      for (i = 0; i < this.bulletPool.length; i++) { this.bulletPool[i].active = false; if (this.bulletPool[i].gfx) this.bulletPool[i].gfx.setVisible(false); }
      for (i = 0; i < this.hostileBulletPool.length; i++) { this.hostileBulletPool[i].active = false; if (this.hostileBulletPool[i].gfx) this.hostileBulletPool[i].gfx.setVisible(false); }
      for (i = 0; i < this.telegraphPool.length; i++) this.telegraphPool[i].active = false;
      for (i = 0; i < this.crystalPool.length; i++) { this.crystalPool[i].active = false; if (this.crystalPool[i].gfx) this.crystalPool[i].gfx.setVisible(false); }
      for (i = 0; i < this.dropPool.length; i++) { this.dropPool[i].active = false; if (this.dropPool[i].gfx) this.dropPool[i].gfx.setVisible(false); }
      for (i = 0; i < this.popupPool.length; i++) { this.popupPool[i].active = false; if (this.popupPool[i].text) this.popupPool[i].text.setVisible(false); }
      for (i = 0; i < this.ringPool.length; i++) this.ringPool[i].active = false;
      for (var key in this.fx) if (this.fx[key] && this.fx[key].killAll) this.fx[key].killAll();
      if (this.playerG) this.playerG.clear(); if (this.worldFx) this.worldFx.clear();
    }

    takeEnemy(kind, x, y, elite) {
      var e = null, i;
      for (i = 0; i < this.enemyPool.length; i++) if (!this.enemyPool[i].active) { e = this.enemyPool[i]; break; }
      if (!e) { this.overflow.enemies++; return null; }
      var f = FAMILY[kind] || FAMILY.drifter;
      e.active = true; e.kind = kind; e.x = x; e.y = y; e.vx = 0; e.vy = 0; e.r = f.r; e.maxHp = f.hp + (this.wave > 12 ? Math.floor((this.wave - 12) / 4) : 0); e.hp = e.maxHp; e.speed = f.speed * (1 + Math.min(1.0, this.wave * .025)); e.points = f.points; e.phase = this.rng() * TAU; e.angle = this.rng() * TAU; e.born = kind === 'mini' ? .16 : .42; e.hurt = 0; e.emit = 1.3 + this.rng() * .8; e.fireClock = .9 + this.rng() * 1.2; e.pattern = 0; e.kids = 0; e.owner = -1; e.elite = !!elite || !!f.boss; e.segN = 0;
      if (kind === 'snake') { e.segN = 5 + (this.rng() * 4 | 0); for (i = 0; i < e.segN; i++) { e.segX[i] = x - i * 12; e.segY[i] = y; } }
      this.ensureGfx(e, 28);
      return e;
    }
    takeBullet() {
      for (var i = 0; i < this.bulletPool.length; i++) if (!this.bulletPool[i].active) { var b = this.bulletPool[i]; b.active = true; this.ensureGfx(b, 34); return b; }
      var oldest = this.bulletPool[0];
      for (i = 1; i < this.bulletPool.length; i++) if (this.bulletPool[i].life < oldest.life) oldest = this.bulletPool[i];
      this.overflow.bullets++; oldest.active = true; this.ensureGfx(oldest, 34); return oldest;
    }
    takeHostileBullet(x, y, angle, speed, damage, color, radius) {
      var b = null, i;
      for (i = 0; i < this.hostileBulletPool.length; i++) if (!this.hostileBulletPool[i].active) { b = this.hostileBulletPool[i]; break; }
      if (!b) {
        b = this.hostileBulletPool[0];
        for (i = 1; i < this.hostileBulletPool.length; i++) if (this.hostileBulletPool[i].life < b.life) b = this.hostileBulletPool[i];
        this.overflow.hostileBullets++;
      }
      b.active = true; b.x = x; b.y = y; b.vx = Math.cos(angle) * speed; b.vy = Math.sin(angle) * speed;
      b.life = 5.5; b.age = 0; b.r = radius || 5; b.damage = damage || 1; b.tint = color || PAL.rose; b.grazed = false; this.ensureGfx(b, 35); return b;
    }
    takeTelegraph(owner, pattern, delay, color, angle) {
      for (var i = 0; i < this.telegraphPool.length; i++) if (!this.telegraphPool[i].active) {
        var t = this.telegraphPool[i]; t.active = true; t.owner = owner.id; t.pattern = pattern; t.x = owner.x; t.y = owner.y; t.angle = angle == null ? owner.angle : angle; t.color = color || PAL.rose; t.life = delay; t.max = delay; return t;
      }
      this.overflow.telegraphs++; return null;
    }
    takeCrystal(x, y, force) {
      for (var i = 0; i < this.crystalPool.length; i++) if (!this.crystalPool[i].active) { var c = this.crystalPool[i]; c.active = true; c.x = x; c.y = y; var a = this.rng() * TAU; var sp = force || (35 + this.rng() * 100); c.vx = Math.cos(a) * sp; c.vy = Math.sin(a) * sp; c.life = 8.5 + this.rng() * 3.5; c.phase = this.rng() * TAU; this.ensureGfx(c, 30); return c; }
      this.overflow.crystals++; this.collectCrystalReward(true);
      return null;
    }
    takeDrop(x, y, type) {
      var d = null, i;
      for (i = 0; i < this.dropPool.length; i++) if (!this.dropPool[i].active) { d = this.dropPool[i]; break; }
      if (!d) {
        d = this.dropPool[0];
        for (i = 1; i < this.dropPool.length; i++) if (this.dropPool[i].life < d.life) d = this.dropPool[i];
        this.overflow.drops++;
      }
      d.active = true; d.x = x; d.y = y; d.life = 14; d.phase = 0; d.type = type || this.randomPowerup(); this.ensureGfx(d, 31); return d;
    }
    takePopup(text, x, y, color) {
      var message = String(text || '');
      if (!message || message.charAt(0) === '+' || message === 'GRAZE' || message.indexOf('BANK +') === 0) return null;
      this.showChip(message, color || PAL.ice);
      return null;
    }
    queueTransient(kind, title, sub, color) {
      if (!title) return;
      if (!this.transientQueue) this.transientQueue = [];
      var entry = { kind: kind, title: String(title), sub: String(sub || ''), color: color || PAL.cyan };
      if (this.activeTransient && this.activeTransient.title === entry.title) return;
      for (var i = 0; i < this.transientQueue.length; i++) if (this.transientQueue[i].title === entry.title) return;
      if (kind === 'boundary') {
        if (this.transientQueue.length >= 6) {
          var chipIndex = -1;
          for (i = 0; i < this.transientQueue.length; i++) if (this.transientQueue[i].kind === 'chip') { chipIndex = i; break; }
          this.transientQueue.splice(chipIndex >= 0 ? chipIndex : 0, 1);
        }
      } else if (this.transientQueue.length >= 5) return;
      this.transientQueue.push(entry);
      this.startTransient();
    }
    startTransient() {
      if (this.activeTransient || !this.transientQueue.length) return;
      this.activeTransient = this.transientQueue.shift();
      this.bannerTime = this.activeTransient.kind === 'chip' ? 1.0 : .9;
      this.bannerAge = 0;
      this.bannerColor = this.activeTransient.color;
      Core.setTextIfChanged(this.ui.banner, this.activeTransient.title);
      Core.setColorIfChanged(this.ui.banner, Core.hex(this.bannerColor));
      Core.setTextIfChanged(this.ui.bannerSub, this.activeTransient.sub);
      this.ui.banner.setVisible(true).setScale(kit.juice.enabled ? 1.02 : 1);
      this.ui.bannerSub.setVisible(this.activeTransient.kind === 'boundary' && !!this.activeTransient.sub);
      this.ui.coach.setVisible(false);
    }
    finishTransient() {
      this.bannerTime = 0;
      this.activeTransient = null;
      this.ui.banner.setVisible(false);
      this.ui.bannerSub.setVisible(false);
      this.startTransient();
      if (!this.activeTransient && this.tutorialStep < 3) this.showCoach();
    }
    showChip(text, color) {
      this.queueTransient('chip', text, '', color || PAL.cyan);
    }
    showBoundary(title, sub, color) {
      this.queueTransient('boundary', title, sub, color || PAL.cyan);
    }
    takeRing(x, y, color, r1, life) {
      if (!kit.juice.enabled) return null;
      var r = null, i;
      for (i = 0; i < this.ringPool.length; i++) if (!this.ringPool[i].active) { r = this.ringPool[i]; break; }
      if (!r) { r = this.ringPool[0]; for (i = 1; i < this.ringPool.length; i++) if (this.ringPool[i].age / this.ringPool[i].life > r.age / r.life) r = this.ringPool[i]; this.overflow.rings++; }
      r.active = true; r.x = x; r.y = y; r.age = 0; r.r0 = 8; r.r1 = r1 || 74; r.life = life || .72; r.color = color || PAL.cyan; return r;
    }

    randomPowerup() {
      var roll = this.rng();
      if (roll < .24) return 'bomb';
      if (roll < .46) return 'shield';
      if (roll < .68) return 'overdrive';
      if (roll < .88) return 'weapon';
      return 'purge';
    }

    clearHostileProjectiles() {
      for (var i = 0; i < this.hostileBulletPool.length; i++) this.hostileBulletPool[i].active = false;
      for (i = 0; i < this.telegraphPool.length; i++) this.telegraphPool[i].active = false;
    }

    bankPowerup(type, x, y) {
      this.score += 24 * this.multiplier;
      this.emit('powerup', x, y, 8);
    }

    grantPowerup(type, x, y) {
      var changed = false, label = POWERUPS[type] ? POWERUPS[type].label : 'POWER';
      if (type === 'bomb') {
        if (this.bombs < 5) { this.bombs++; changed = true; }
      } else if (type === 'shield') {
        if (this.powerups.shield < 3) { this.powerups.shield++; changed = true; }
      } else if (type === 'overdrive') {
        if (this.powerups.overdrive < 12) { this.powerups.overdrive = Math.min(12, this.powerups.overdrive + 4); changed = true; }
      } else if (type === 'weapon') {
        if (this.powerups.weapon < 12) { this.powerups.weapon = Math.min(12, this.powerups.weapon + 4); changed = true; }
      } else if (type === 'purge') {
        var hadThreats = false, i;
        for (i = 0; i < this.hostileBulletPool.length; i++) if (this.hostileBulletPool[i].active) { hadThreats = true; break; }
        if (!hadThreats) for (i = 0; i < this.telegraphPool.length; i++) if (this.telegraphPool[i].active) { hadThreats = true; break; }
        this.clearHostileProjectiles(); changed = hadThreats;
      }
      if (!changed) { this.bankPowerup(type, x, y); label = 'BANKED ' + label; }
      else this.takePopup(label, x, y - 12, (POWERUPS[type] || POWERUPS.bomb).color);
      this.emit('powerup', x, y, 14); this.takeRing(x, y, (POWERUPS[type] || POWERUPS.bomb).color, 44, .55); kit.audio.sfx('pickup', { volume: .52 });
    }

    collectCrystalReward(fromOverflow) {
      this.crystals++;
      var old = this.multiplier;
      this.multiplier = Math.min(25, 1 + Math.floor(this.crystals / 8));
      this.peakMultiplier = Math.max(this.peakMultiplier, this.multiplier);
      this.score += this.multiplier * 3;
      this.multPulse = .5;
      if (!fromOverflow) this.takePopup('+' + (this.multiplier * 3), this.player.x, this.player.y - 20, PAL.mint);
      if (this.multiplier !== old) kit.audio.sfx('crystal', { volume: .26, rate: 1 + this.multiplier * .018 });
    }

    shake(magnitude, ms) {
      kit.juice.shake(Math.min(magnitude, Math.max(1, this.metrics.H * .02)), ms);
    }

    hurtPlayer() {
      if (this.state !== 'play' || this.player.invuln > 0) return;
      this.player.hurt = .42;
      this.player.invuln = .72;
      if (this.powerups.shield > 0) {
        this.powerups.shield--;
        this.damageFlash = Math.max(this.damageFlash, .38);
        this.emit('playerHit', this.player.x, this.player.y, 18);
        this.takeRing(this.player.x, this.player.y, PAL.cyan, 54, .5);
        this.takePopup('SHIELD', this.player.x, this.player.y - 22, PAL.cyan);
        kit.audio.sfx('pickup', { volume: .44 });
      } else this.playerDie();
    }

    readForceWave() {
      var top = clampWave(root.__vs && root.__vs.forceWave);
      var inState = clampWave(DEBUG.forceWave);
      if (top && top !== this.lastForceWave) return top;
      if (inState && inState !== this.lastForceWave) return inState;
      return this.lastForceWave || top || inState;
    }
    readForceEvent() {
      var top = String((root.__vs && root.__vs.forceEvent) || '');
      var inState = String(DEBUG.forceEvent || '');
      if (top && top !== this.lastForceEvent) return top;
      if (inState && inState !== this.lastForceEvent) return inState;
      return this.lastForceEvent || top || inState;
    }
    applyForces() {
      var forcedWave = this.readForceWave();
      if (forcedWave && forcedWave !== this.lastForceWave) { this.lastForceWave = forcedWave; root.__vs.forceWave = forcedWave; DEBUG.forceWave = forcedWave; if (forcedWave !== this.wave) this.startWave(forcedWave); }
      var event = this.readForceEvent();
      if (event && event !== this.lastForceEvent) {
        this.lastForceEvent = event;
        root.__vs.forceEvent = event; DEBUG.forceEvent = event;
        if (event === 'bomb') this.bombQueued = true;
        else if (event === 'death') this.playerDie();
        else if (event === 'clear') { for (var i = 0; i < this.enemyPool.length; i++) if (this.enemyPool[i].active) this.killEnemy(this.enemyPool[i], true); }
        else if (event === 'boss') this.spawnBoss((WAVE_SETS[this.currentSetIndex] || WAVE_SETS[0]).boss);
        else if (event === 'crystal') { for (var c = 0; c < 12; c++) this.takeCrystal(this.player.x + (this.rng() - .5) * 90, this.player.y + (this.rng() - .5) * 90, 55); }
      }
    }

    startWave(wave) {
      var next = clampWave(wave) || (this.wave + 1);
      this.wave = next; this.waveLive = true; this.clearPending = false; this.waveTimer = 1.05;
      this.currentSetIndex = Math.floor((next - 1) / 3) % WAVE_SETS.length; this.currentSetKey = (WAVE_SETS[this.currentSetIndex] || WAVE_SETS[0]).key;
      var set = WAVE_SETS[this.currentSetIndex] || WAVE_SETS[0];
      if (!this.chromeImage || this.chromeTheme !== this.currentSetKey) this.rebuildChrome();
      kit.audio.sfx('wave', { volume: .82 });
      if (next % 3 === 0) this.checkMilestone(next);
      this.spawnWaveFormation(set, ((next - 1) % 3) + 1);
      if (next === 1 && this.tutorialStep < 3) this.showCoach();
    }

    spawnWaveFormation(set, phase) {
      var a = this.metrics.arena, count, i, x, y, ang;
      var speed = 1 + Math.min(.75, this.wave * .024);
      function edgePoint(arena, random) {
        var side = random() * 4 | 0, t = .12 + random() * .76;
        if (side === 0) return { x: arena.x + arena.w * t, y: arena.y + 18 };
        if (side === 1) return { x: arena.x + arena.w * t, y: arena.y + arena.h - 18 };
        if (side === 2) return { x: arena.x + 18, y: arena.y + arena.h * t };
        return { x: arena.x + arena.w - 18, y: arena.y + arena.h * t };
      }
      if (set.key === 'void') {
        count = 4 + this.wave;
        for (i = 0; i < count; i++) { var ep = edgePoint(a, this.rng); this.takeEnemy(i % 4 === 0 && phase > 1 ? 'weaver' : 'drifter', ep.x, ep.y); }
        if (phase >= 2) for (i = 0; i < 2 + phase; i++) { ang = i / (2 + phase) * TAU; this.takeEnemy('weaver', a.x + a.w * .5 + Math.cos(ang) * (a.w * .36), a.y + a.h * .5 + Math.sin(ang) * (a.h * .30)); }
        if (phase === 3) this.spawnBoss(set.boss);
      } else if (set.key === 'debris') {
        count = 4 + phase * 2;
        for (i = 0; i < count; i++) { x = a.x + 42 + this.rng() * (a.w - 84); y = a.y + 38 + this.rng() * (a.h - 76); this.takeEnemy(i % 3 === 0 ? 'drifter' : 'weaver', x, y); }
        for (i = 0; i < phase; i++) { ep = edgePoint(a, this.rng); this.takeEnemy('snake', ep.x, ep.y); }
        if (phase >= 2) { ep = edgePoint(a, this.rng); this.takeEnemy('spawner', ep.x, ep.y); }
        if (phase === 3) this.spawnBoss(set.boss);
      } else if (set.key === 'gravity') {
        count = 3 + phase * 2;
        for (i = 0; i < phase; i++) { ang = i / Math.max(1, phase) * TAU + .3; this.takeEnemy('well', a.x + a.w * .5 + Math.cos(ang) * a.w * .32, a.y + a.h * .5 + Math.sin(ang) * a.h * .30); }
        for (i = 0; i < count; i++) { ang = i / count * TAU; this.takeEnemy(i % 2 ? 'snake' : 'weaver', a.x + a.w * .5 + Math.cos(ang) * a.w * .42, a.y + a.h * .5 + Math.sin(ang) * a.h * .38); }
        if (phase === 3) this.spawnBoss(set.boss);
      } else {
        count = 7 + phase * 3;
        for (i = 0; i < count; i++) { ep = edgePoint(a, this.rng); this.takeEnemy(i % 3 === 0 ? 'weaver' : 'mini', ep.x, ep.y); }
        this.takeEnemy('spawner', a.x + a.w * .23, a.y + a.h * .22);
        this.takeEnemy('spawner', a.x + a.w * .77, a.y + a.h * .22);
        if (phase >= 2) for (i = 0; i < phase; i++) { ep = edgePoint(a, this.rng); this.takeEnemy('snake', ep.x, ep.y); }
        if (phase === 3) this.spawnBoss(set.boss);
      }
      // Speed is applied through each family record. Keeping the grammar call
      // deterministic makes the same seed produce the same encounter shape.
      if (speed < 0) this.takeEnemy('drifter', a.x, a.y);
    }

    spawnBoss(kind) {
      var set = WAVE_SETS[this.currentSetIndex] || WAVE_SETS[0], a = this.metrics.arena;
      var existing = false;
      for (var i = 0; i < this.enemyPool.length; i++) if (this.enemyPool[i].active && this.enemyPool[i].kind === kind) existing = true;
      if (existing) return;
      var boss = this.takeEnemy(FAMILY[kind] ? kind : set.boss, a.x + a.w * .5, a.y + a.h * .22, true);
      if (!boss) return;
      boss.born = .8; boss.phase = 0; boss.emit = 1.4;
      this.showChip('ELITE · ' + set.bossName, set.accent2);
      kit.audio.sfx('boss', { volume: .9 }); this.takeRing(boss.x, boss.y, set.accent2, 96, 1.0); this.emit('screenFx', boss.x, boss.y, 22);
    }

    readGamepad() {
      var pads = root.navigator && typeof root.navigator.getGamepads === 'function' ? root.navigator.getGamepads() : [];
      var pad = null;
      for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { pad = pads[i]; break; }
      if (!pad) { this.clearGamepadState(); return; }
      function stick(x, y) {
        var dx = Number(pad.axes[x]) || 0, dy = Number(pad.axes[y]) || 0, d = Math.sqrt(dx * dx + dy * dy);
        if (d < .18) return { x: 0, y: 0, mag: 0 };
        var mag = Math.min(1, (d - .12) / .88);
        return { x: dx / d, y: dy / d, mag: mag };
      }
      var move = stick(0, 1), aim = stick(2, 3), buttons = [];
      for (i = 0; i < pad.buttons.length; i++) buttons[i] = !!(pad.buttons[i] && pad.buttons[i].pressed);
      var bombNow = !!(buttons[1] || buttons[3] || buttons[5]);
      var bomb = bombNow && !(this.gamepadPrevButtons[1] || this.gamepadPrevButtons[3] || this.gamepadPrevButtons[5]), any = false;
      for (i = 0; i < buttons.length; i++) if (buttons[i] && !this.gamepadPrevButtons[i]) any = true;
      this.gamepad = { connected: true, moveX: move.x, moveY: move.y, moveMag: move.mag, aimX: aim.x, aimY: aim.y, aimMag: aim.mag, bomb: bomb, any: any };
      this.gamepadButtons = buttons;
    }

    pollInput() {
      var mX = 0, mY = 0, aX = 0, aY = 0, mMag = 0, aMag = 0, map = kit.input.pointers;
      if (map) map.forEach(function (p) {
        if (p.zone !== 'move' && p.zone !== 'aim') return;
        var start = scene.localPoint(p.startX, p.startY), now = scene.localPoint(p.x, p.y);
        var dx = now.x - start.x, dy = now.y - start.y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < 8) return;
        var mag = Math.min(1, d / 72), nx = dx / d, ny = dy / d;
        if (p.zone === 'move' && mMag === 0) { mX = nx; mY = ny; mMag = mag; }
        if (p.zone === 'aim' && aMag === 0) { aX = nx; aY = ny; aMag = mag; }
      });
      var kx = 0, ky = 0, ax = 0, ay = 0;
      if (kit.input.keyDown('KeyA')) kx--; if (kit.input.keyDown('KeyD')) kx++; if (kit.input.keyDown('KeyW')) ky--; if (kit.input.keyDown('KeyS')) ky++;
      if (kx || ky) { var md = Math.sqrt(kx * kx + ky * ky); mX = kx / md; mY = ky / md; mMag = 1; this.inputModality = 'keyboard'; }
      if (kit.input.keyDown('ArrowLeft')) ax--; if (kit.input.keyDown('ArrowRight')) ax++; if (kit.input.keyDown('ArrowUp')) ay--; if (kit.input.keyDown('ArrowDown')) ay++;
      if (ax || ay) { var ad = Math.sqrt(ax * ax + ay * ay); aX = ax / ad; aY = ay / ad; aMag = 1; this.inputModality = 'keyboard'; }
      if (this.gamepad.connected) {
        if (this.gamepad.moveMag > 0) { mX = this.gamepad.moveX; mY = this.gamepad.moveY; mMag = this.gamepad.moveMag; }
        if (this.gamepad.aimMag > 0) { aX = this.gamepad.aimX; aY = this.gamepad.aimY; aMag = this.gamepad.aimMag; }
        if (this.gamepad.moveMag > 0 || this.gamepad.aimMag > 0) this.inputModality = 'gamepad';
      }
      this.inputState.moveX = mX; this.inputState.moveY = mY; this.inputState.moveMag = mMag; this.inputState.aimX = aX; this.inputState.aimY = aY; this.inputState.aimMag = aMag;
    }

    pollEdges() {
      this.readGamepad();
      var codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyB'];
      var any = !!this.restartKeyQueued || !!this.gamepad.any, bomb = !!this.gamepad.bomb;
      for (var i = 0; i < codes.length; i++) {
        var down = kit.input.keyDown(codes[i]), was = !!this.prevKeys[codes[i]];
        if (down && !was) { any = true; if (codes[i] === 'Space' || codes[i] === 'KeyB') bomb = true; }
        this.prevKeys[codes[i]] = down;
      }
      if (this.gamepad.bomb) bomb = true;
      this.gamepadPrevButtons = this.gamepadButtons ? this.gamepadButtons.slice() : [];
      if (bomb) this.bombQueued = true;
      if (this.state === 'over' && (any || this.pointerAction || this.restartQueued)) { this.pointerAction = false; this.restartQueued = false; kit.restart(); return true; }
      this.pointerAction = false; this.restartQueued = false; this.restartKeyQueued = false; return false;
    }

    step() {
      if (this.kitPaused || kit.paused) return;
      if (this.pollEdges()) return;
      this.applyForces();
      this.pollInput();
      if (this.state === 'over') { this.overTime += STEP; this.updatePopups(STEP); this.syncDebug(); return; }
      if (this.bombQueued) { this.bombQueued = false; this.useBomb(); }
      if (this.bannerTime > 0) this.bannerTime -= STEP;
      this.bannerAge += STEP;
      if (this.bannerTime <= 0 && this.activeTransient) this.finishTransient();
      if (this.coachTime > 0) this.coachTime = Math.max(0, this.coachTime - STEP);
      if (this.flash > 0) this.flash = Math.max(0, this.flash - STEP * 2.8);
      if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - STEP * 2.4);
      if (this.killFlash > 0) this.killFlash = Math.max(0, this.killFlash - STEP * 4.5);
      if (this.multPulse > 0) this.multPulse = Math.max(0, this.multPulse - STEP);
      if (this.bombFx > 0) this.bombFx = Math.max(0, this.bombFx - STEP);
      if (this.state === 'dead') { this.stepDead(); this.syncDebug(); return; }
      if (this.player.invuln > 0) this.player.invuln = Math.max(0, this.player.invuln - STEP);
      this.updateTutorial();
      this.updatePlayer();
      this.updateBullets();
      this.updateEnemies();
      this.updateTelegraphs();
      this.updateHostileBullets();
      this.updateMusicLayer();
      this.updateCrystals();
      this.updateDrops();
      this.updatePowerups();
      this.updatePopups(STEP);
      this.updateRings();
      this.flowWaves();
      this.simTime += STEP;
      this.syncDebug();
    }

    updateTutorial() {
      if (this.tutorialStep >= 3) { this.ui.coach.setVisible(false); return; }
      var moved = this.inputState.moveMag > .15, aimed = this.inputState.aimMag > .18;
      if (this.tutorialStep === 0 && moved) this.tutorialStep = 1;
      if (this.tutorialStep === 1 && aimed) this.tutorialStep = 2;
      if (this.tutorialStep === 2 && this.bombs < 2) this.tutorialStep = 3;
      if (this.tutorialStep >= 3) { save.tutorialDone = true; kit.save.set(save); this.ui.coach.setVisible(false); }
      else this.showCoach();
    }
    showCoach() {
      var controls = this.inputModality === 'gamepad' ? ['LEFT STICK MOVE', 'RIGHT STICK AIM + AUTO-FIRE', 'B BUTTON BOMB'] : (this.inputModality === 'keyboard' ? ['WASD MOVE', 'ARROWS AIM + AUTO-FIRE', 'SPACE OR B BOMB'] : ['DRAG LEFT TO MOVE', 'DRAG RIGHT TO AIM + AUTO-FIRE', 'TAP BOMB FOR A SCREEN CLEAR']);
      var text = this.tutorialStep === 0 ? '1 / 3   ' + controls[0] : (this.tutorialStep === 1 ? '2 / 3   ' + controls[1] : '3 / 3   ' + controls[2]);
      if (this.activeTransient) { this.ui.coach.setVisible(false); return; }
      if (this.coachStep !== this.tutorialStep || this.coachModality !== this.inputModality) {
        this.coachStep = this.tutorialStep; this.coachModality = this.inputModality; this.coachTime = 4;
        Core.setTextIfChanged(this.ui.coach, text);
      }
      this.ui.coach.setVisible(true).setAlpha(this.coachTime > 1 ? .78 : .16);
    }

    updatePlayer() {
      var p = this.player, a = this.metrics.arena, inp = this.inputState;
      var acc = 1720, max = 276;
      if (inp.moveMag > 0) { p.vx += inp.moveX * inp.moveMag * acc * STEP; p.vy += inp.moveY * inp.moveMag * acc * STEP; }
      var damp = 1 - Math.min(1, (inp.moveMag > .1 ? 6.2 : 10.5) * STEP); p.vx *= damp; p.vy *= damp;
      var speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy); if (speed > max) { p.vx = p.vx / speed * max; p.vy = p.vy / speed * max; }
      p.x += p.vx * STEP; p.y += p.vy * STEP;
      if (p.x < a.x + p.r) { p.x = a.x + p.r; p.vx = Math.abs(p.vx) * .3; } if (p.x > a.x + a.w - p.r) { p.x = a.x + a.w - p.r; p.vx = -Math.abs(p.vx) * .3; }
      if (p.y < a.y + p.r) { p.y = a.y + p.r; p.vy = Math.abs(p.vy) * .3; } if (p.y > a.y + a.h - p.r) { p.y = a.y + a.h - p.r; p.vy = -Math.abs(p.vy) * .3; }
      if (inp.aimMag > .18) { p.angle = Core.angleLerp(p.angle, Math.atan2(inp.aimY, inp.aimX), .72); if (p.cooldown <= 0) this.fire(); }
      else if (inp.moveMag > .18) p.angle = Core.angleLerp(p.angle, Math.atan2(inp.moveY, inp.moveX), .16);
      p.cooldown = Math.max(0, p.cooldown - STEP); p.muzzle = Math.max(0, p.muzzle - STEP); p.hurt = Math.max(0, p.hurt - STEP); p.animTime += STEP;
      p.state = p.hurt > 0 ? 'hurt' : (speed > 20 || inp.moveMag > .12 ? 'move' : 'idle'); p.thrust = Core.clamp(speed / max, 0, 1);
    }
    fire() {
      var p = this.player, base = this.activeWeapon || WEAPONS.pulse, boost = this.powerups.weapon > 0, w = base, count = w.shots || 1;
      for (var i = 0; i < count; i++) {
        var b = this.takeBullet(); if (!b) break;
        var spread = count === 1 ? 0 : (i - (count - 1) / 2) * w.spread, ang = p.angle + spread;
        b.x = p.x + Math.cos(ang) * 15; b.y = p.y + Math.sin(ang) * 15; b.vx = Math.cos(ang) * w.speed * (boost ? 1.1 : 1); b.vy = Math.sin(ang) * w.speed * (boost ? 1.1 : 1); b.life = 1.25; b.r = w.damage > 1 ? 4.5 : 3.2; b.damage = w.damage + (boost ? 1 : 0); b.pierce = w.pierce; b.tint = boost ? PAL.violet : (w.damage > 1 ? PAL.amber : PAL.ice);
      }
      p.cooldown = w.fireRate * (boost ? .68 : 1); p.muzzle = .075; p.vx -= Math.cos(p.angle) * 12; p.vy -= Math.sin(p.angle) * 12;
      this.emit('fire', p.x + Math.cos(p.angle) * 16, p.y + Math.sin(p.angle) * 16, count + 2); kit.audio.sfx('fire', { volume: .42, rate: .94 + this.rng() * .12 });
    }

    updateBullets() {
      var a = this.metrics.arena;
      for (var i = 0; i < this.bulletPool.length; i++) {
        var b = this.bulletPool[i]; if (!b.active) continue;
        for (var q = 0; q < this.enemyPool.length; q++) { var well = this.enemyPool[q]; if (!well.active || well.kind !== 'well' || well.born > 0) continue; var dx = well.x - b.x, dy = well.y - b.y, d = Math.sqrt(dx * dx + dy * dy) + .1; if (d < 190) { var pull = 9300 / (d * d); b.vx += dx / d * pull * 60 * STEP; b.vy += dy / d * pull * 60 * STEP; } }
        b.x += b.vx * STEP; b.y += b.vy * STEP; b.life -= STEP;
        if (b.life <= 0 || b.x < a.x - 12 || b.x > a.x + a.w + 12 || b.y < a.y - 12 || b.y > a.y + a.h + 12) { b.active = false; continue; }
      }
    }

    queueEnemyPattern(e, pattern, color) {
      var angle = Math.atan2(this.player.y - e.y, this.player.x - e.x), t = this.takeTelegraph(e, pattern, .24, color, angle);
      if (!t) this.firePattern(e, pattern, angle);
    }

    firePattern(e, pattern, angle) {
      if (!e || !e.active) return;
      var speed = 170 + Math.min(120, this.wave * 4), color = (FAMILY[e.kind] || FAMILY.drifter).color, count, spread, i, a;
      if (pattern === 'aim') {
        this.takeHostileBullet(e.x, e.y, angle, speed, 1, color, 5);
      } else if (pattern === 'spread') {
        count = this.wave > 8 ? 5 : 3; spread = .16;
        for (i = 0; i < count; i++) this.takeHostileBullet(e.x, e.y, angle + (i - (count - 1) / 2) * spread, speed + 12, 1, color, 5);
      } else if (pattern === 'radial') {
        count = 8 + Math.min(8, this.wave / 3 | 0);
        for (i = 0; i < count; i++) this.takeHostileBullet(e.x, e.y, e.phase + i / count * TAU, speed - 10, 1, color, 5.5);
      } else {
        count = e.elite ? 7 : 5;
        for (i = 0; i < count; i++) { a = e.phase * .7 + i / count * TAU + (e.pattern & 1) * .18; this.takeHostileBullet(e.x, e.y, a, speed + 20, 1, color, 4.5); }
      }
      this.emit(e.elite ? 'screenFx' : 'enemyHit', e.x, e.y, e.elite ? 7 : 3);
    }

    updateEnemyFire(e) {
      if (e.kind === 'mini' || (this.wave < 2 && !e.elite)) return;
      e.fireClock -= STEP;
      if (e.fireClock > 0) return;
      var pattern, base;
      if (e.elite) {
        pattern = e.kind === 'prism' ? 'spread' : (e.kind === 'breaker' ? 'radial' : (e.kind === 'singularity' ? 'spiral' : 'spread'));
        base = e.kind === 'swarmcore' ? 1.05 : 1.35;
      } else if (e.kind === 'spawner') { pattern = 'radial'; base = 3.4; }
      else if (e.kind === 'weaver') { pattern = 'spread'; base = 2.05; }
      else if (e.kind === 'well') { pattern = 'radial'; base = 3.1; }
      else { pattern = 'aim'; base = 2.7; }
      e.fireClock = Math.max(.82, base - Math.min(.72, this.wave * .025)); e.pattern++;
      this.queueEnemyPattern(e, pattern, e.elite ? PAL.amber : PAL.rose);
    }

    updateTelegraphs() {
      for (var i = 0; i < this.telegraphPool.length; i++) {
        var t = this.telegraphPool[i]; if (!t.active) continue;
        var owner = this.enemyPool[t.owner];
        if (!owner || !owner.active) { t.active = false; continue; }
        t.x = owner.x; t.y = owner.y; t.angle = Math.atan2(this.player.y - owner.y, this.player.x - owner.x); t.life -= STEP;
        if (t.life <= 0) { t.active = false; this.firePattern(owner, t.pattern, t.angle); }
      }
    }

    updateHostileBullets() {
      var a = this.metrics.arena, p = this.player;
      for (var i = 0; i < this.hostileBulletPool.length; i++) {
        var b = this.hostileBulletPool[i]; if (!b.active) continue;
        b.x += b.vx * STEP; b.y += b.vy * STEP; b.age += STEP; b.life -= STEP;
        if (b.life <= 0 || b.x < a.x - 24 || b.x > a.x + a.w + 24 || b.y < a.y - 24 || b.y > a.y + a.h + 24) { b.active = false; continue; }
        if (this.state !== 'play' || p.invuln > 0) continue;
        var d2 = Core.dist2(b.x, b.y, p.x, p.y), hit = (b.r + p.r) * (b.r + p.r), graze = (b.r + p.r + 18) * (b.r + p.r + 18);
        if (d2 < hit) { b.active = false; this.hurtPlayer(); if (this.state !== 'play') return; }
        else if (!b.grazed && d2 < graze) { b.grazed = true; this.score += this.multiplier * 2; this.takePopup('GRAZE', p.x, p.y - 26, PAL.mint); this.takeRing(p.x, p.y, PAL.mint, 28, .28); }
      }
    }

    updateEnemies() {
      var a = this.metrics.arena, p = this.player;
      for (var i = 0; i < this.enemyPool.length; i++) {
        var e = this.enemyPool[i]; if (!e.active) continue;
        if (e.born > 0) { e.born -= STEP; continue; }
        e.phase += STEP; e.hurt = Math.max(0, e.hurt - STEP);
        var dx = p.x - e.x, dy = p.y - e.y, d = Math.sqrt(dx * dx + dy * dy) + .01, tx = dx / d, ty = dy / d;
        if (e.kind === 'drifter' || e.kind === 'mini') { e.vx = Core.lerp(e.vx, tx * e.speed, 2.5 * STEP); e.vy = Core.lerp(e.vy, ty * e.speed, 2.5 * STEP); e.angle += STEP * 2.2; }
        else if (e.kind === 'weaver') { var wob = Math.sin(e.phase * 3.2 + e.id) * .72, wx = tx - ty * wob, wy = ty + tx * wob, wl = Math.sqrt(wx * wx + wy * wy) + .01; e.vx = Core.lerp(e.vx, wx / wl * e.speed, 5.4 * STEP); e.vy = Core.lerp(e.vy, wy / wl * e.speed, 5.4 * STEP); e.angle += STEP * 3.5; }
        else if (e.kind === 'snake') { e.angle = Core.angleLerp(e.angle, Math.atan2(dy, dx), 1.8 * STEP); e.vx = Math.cos(e.angle) * e.speed; e.vy = Math.sin(e.angle) * e.speed; }
        else if (e.kind === 'spawner') { var away = d < 170 ? -1 : 1; e.vx = Core.lerp(e.vx, tx * e.speed * away + Math.cos(e.phase) * 18, 1.8 * STEP); e.vy = Core.lerp(e.vy, ty * e.speed * away + Math.sin(e.phase * .8) * 18, 1.8 * STEP); e.emit -= STEP; if (e.emit <= 0 && e.kids < 5) { e.emit = 1.2 + this.rng() * .8; var mini = this.takeEnemy('mini', e.x + Math.cos(e.phase) * 22, e.y + Math.sin(e.phase) * 22); if (mini) { mini.owner = e.id; e.kids++; this.emit('embers', mini.x, mini.y, 6); } } }
        else if (e.kind === 'well') { e.vx = Core.lerp(e.vx, tx * e.speed, .85 * STEP); e.vy = Core.lerp(e.vy, ty * e.speed, .85 * STEP); e.angle += STEP * 1.2; this.pullPlayer(e, d, tx, ty); }
        else if (e.kind === 'prism') { var orbit = e.phase * .52, px = a.x + a.w * .5 + Math.cos(orbit) * a.w * .31, py = a.y + a.h * .34 + Math.sin(orbit * 1.33) * a.h * .24; e.vx = Core.lerp(e.vx, (px - e.x) * 1.2, 1.8 * STEP); e.vy = Core.lerp(e.vy, (py - e.y) * 1.2, 1.8 * STEP); e.angle += STEP * 1.6; e.emit -= STEP; if (e.emit <= 0) { e.emit = 1.7; this.spawnRadialMinis(e, 3); } }
        else if (e.kind === 'breaker') { var bx = tx - ty * Math.sin(e.phase * 2) * .9, by = ty + tx * Math.sin(e.phase * 2) * .9, bl = Math.sqrt(bx * bx + by * by) + .01; e.vx = Core.lerp(e.vx, bx / bl * e.speed, 2 * STEP); e.vy = Core.lerp(e.vy, by / bl * e.speed, 2 * STEP); e.angle += STEP * 1.5; e.emit -= STEP; if (e.emit <= 0) { e.emit = 2.1; this.spawnRadialMinis(e, 4); } }
        else if (e.kind === 'singularity') { e.vx = Core.lerp(e.vx, tx * e.speed, .5 * STEP); e.vy = Core.lerp(e.vy, ty * e.speed, .5 * STEP); e.angle += STEP * 1.7; this.pullPlayer(e, d, tx, ty, 1.8); e.emit -= STEP; if (e.emit <= 0) { e.emit = 2.5; this.takeEnemy('well', e.x + 75, e.y + 20); } }
        else if (e.kind === 'swarmcore') { e.vx = Core.lerp(e.vx, tx * e.speed + Math.cos(e.phase * 2) * 20, 1.5 * STEP); e.vy = Core.lerp(e.vy, ty * e.speed + Math.sin(e.phase * 2) * 20, 1.5 * STEP); e.angle += STEP * 2; e.emit -= STEP; if (e.emit <= 0) { e.emit = 1.25; this.spawnRadialMinis(e, 5); } }
        e.x += e.vx * STEP; e.y += e.vy * STEP;
        if (e.kind === 'snake') this.updateSnake(e, a); else { e.x = Core.clamp(e.x, a.x + e.r, a.x + a.w - e.r); e.y = Core.clamp(e.y, a.y + e.r, a.y + a.h - e.r); }
        this.updateEnemyFire(e);
        this.resolveBulletHits(e, i);
        if (!e.active) continue;
        if (this.state === 'play' && this.player.invuln <= 0) {
          var hit = Core.dist2(e.x, e.y, p.x, p.y) < (e.r + p.r - 4) * (e.r + p.r - 4);
          if (!hit && e.kind === 'snake') for (var s = 0; s < e.segN; s++) if (Core.dist2(e.segX[s], e.segY[s], p.x, p.y) < (p.r + 7) * (p.r + 7)) { hit = true; break; }
          if (hit) { this.hurtPlayer(); if (this.state !== 'play') return; }
        }
      }
    }
    pullPlayer(e, d, tx, ty, factor) { if (d < 270) { var force = (factor || 1) * 29000 / Math.max(2300, d * d); this.player.vx += tx * force * 60 * STEP; this.player.vy += ty * force * 60 * STEP; } }
    spawnRadialMinis(e, count) { for (var i = 0; i < count; i++) { var a = this.rng() * TAU, m = this.takeEnemy('mini', e.x + Math.cos(a) * 32, e.y + Math.sin(a) * 32); if (m) { m.owner = e.id; e.kids++; } } this.emit('embers', e.x, e.y, count * 2); }
    updateSnake(e, a) {
      if (e.x < a.x + e.r || e.x > a.x + a.w - e.r) { e.angle = Math.PI - e.angle; e.x = Core.clamp(e.x, a.x + e.r, a.x + a.w - e.r); }
      if (e.y < a.y + e.r || e.y > a.y + a.h - e.r) { e.angle = -e.angle; e.y = Core.clamp(e.y, a.y + e.r, a.y + a.h - e.r); }
      var px = e.x, py = e.y;
      for (var i = 0; i < e.segN; i++) { var dx = px - e.segX[i], dy = py - e.segY[i], d = Math.sqrt(dx * dx + dy * dy) + .01, gap = 13; if (d > gap) { e.segX[i] += dx / d * (d - gap); e.segY[i] += dy / d * (d - gap); } px = e.segX[i]; py = e.segY[i]; }
    }
    resolveBulletHits(e, enemyIndex) {
      for (var j = 0; j < this.bulletPool.length; j++) {
        var b = this.bulletPool[j]; if (!b.active) continue;
        var hitIndex = -1;
        if (Core.dist2(b.x, b.y, e.x, e.y) < (e.r + b.r) * (e.r + b.r)) hitIndex = 0;
        else if (e.kind === 'snake') for (var s = 0; s < e.segN; s++) if (Core.dist2(b.x, b.y, e.segX[s], e.segY[s]) < (b.r + 8) * (b.r + 8)) { hitIndex = s + 1; break; }
        if (hitIndex < 0) continue;
        if (e.kind === 'snake' && hitIndex > 0) {
          var lost = e.segN - hitIndex + 1; for (var z = e.segN - 1; z >= hitIndex - 1; z--) { this.takeCrystal(e.segX[z], e.segY[z], 75); this.emit('crystals', e.segX[z], e.segY[z], 3); } e.segN = hitIndex - 1; this.score += Math.round(12 * lost * this.multiplier); this.takePopup('+' + Math.round(12 * lost * this.multiplier), b.x, b.y, PAL.mint); b.active = false; kit.audio.sfx('explosion', { volume: .18 }); if (e.segN <= 0) this.killEnemy(e, false); continue;
        }
        b.active = false; e.hp -= b.damage; e.hurt = .1; this.emit('enemyHit', b.x, b.y, e.elite ? 8 : 4);
        if (e.hp <= 0) { this.killEnemy(e, false); return; }
        if (b.pierce > 0) { b.active = true; b.pierce--; } else break;
      }
    }

    killEnemy(e, byBomb) {
      if (!e || !e.active) return;
      var points = Math.round(e.points * this.multiplier); this.score += points; this.killCount++;
      var n = e.elite ? 14 : (e.kind === 'mini' ? 1 : 3 + Math.min(4, this.wave / 3 | 0));
      for (var i = 0; i < n; i++) this.takeCrystal(e.x + (this.rng() - .5) * 12, e.y + (this.rng() - .5) * 12, e.elite ? 100 : 55 + this.rng() * 40);
      var dropChance = e.elite ? .95 : .13 + Math.min(.16, this.wave * .009);
      if (this.killCount % 8 === 0 || this.rng() < dropChance) this.takeDrop(e.x, e.y, this.randomPowerup());
      this.takePopup('+' + points, e.x, e.y - 14, e.elite ? PAL.amber : PAL.ice);
      var family = FAMILY[e.kind] || FAMILY.drifter;
      this.emit(e.elite ? 'screenFx' : 'explosion', e.x, e.y, e.elite ? 28 : 10); this.emit('smoke', e.x, e.y, e.elite ? 14 : 5); this.takeRing(e.x, e.y, e.elite ? PAL.amber : family.color, e.elite ? 92 : 42, e.elite ? 1.0 : .45);
      if (kit.juice.enabled) this.killFlash = Math.max(this.killFlash, e.elite ? .26 : .13);
      if (e.elite) { this.shake(12, 210); kit.juice.hitStop(46); if (kit.juice.enabled) this.flash = .22; } else if (!byBomb) { this.shake(2.8, 75); kit.juice.hitStop(18); if (kit.juice.enabled) this.flash = Math.max(this.flash, .1); }
      if (e.elite) kit.audio.sfx('explosion', { volume: .84 }); else kit.audio.sfx('explosion', { volume: .22 });
      if (e.owner >= 0) { var owner = this.enemyPool[e.owner]; if (owner) owner.kids = Math.max(0, owner.kids - 1); }
      e.active = false;
    }

    updateCrystals() {
      var p = this.player;
      for (var i = 0; i < this.crystalPool.length; i++) {
        var c = this.crystalPool[i]; if (!c.active) continue; c.life -= STEP; c.phase += STEP * 4; if (c.life <= 0) { c.active = false; continue; }
        var dx = p.x - c.x, dy = p.y - c.y, d = Math.sqrt(dx * dx + dy * dy) + .01;
        if (d < 185) { var pull = 720 / Math.max(28, d); c.vx += dx / d * pull * 7 * STEP; c.vy += dy / d * pull * 7 * STEP; }
        c.vx *= 1 - 1.7 * STEP; c.vy *= 1 - 1.7 * STEP; c.x += c.vx * STEP; c.y += c.vy * STEP;
        if (d < 19) { c.active = false; this.collectCrystalReward(false); this.emit('crystals', p.x, p.y, 4); if (this.crystals % 4 === 0) kit.audio.sfx('crystal', { volume: .26, rate: 1 + this.multiplier * .018 }); }
      }
    }
    updateDrops() {
      var p = this.player;
      for (var i = 0; i < this.dropPool.length; i++) { var d = this.dropPool[i]; if (!d.active) continue; d.life -= STEP; d.phase += STEP * 3; if (d.life <= 0) { d.active = false; continue; } if (Core.dist2(d.x, d.y, p.x, p.y) < 27 * 27) { d.active = false; this.grantPowerup(d.type, d.x, d.y); } }
    }
    updatePowerups() {
      this.powerups.overdrive = Math.max(0, this.powerups.overdrive - STEP);
      this.powerups.weapon = Math.max(0, this.powerups.weapon - STEP);
    }
    updatePopups(dt) {
      for (var i = 0; i < this.popupPool.length; i++) { var p = this.popupPool[i]; if (!p.active) continue; p.age += dt; p.life -= dt; if (p.life <= 0) { p.active = false; p.text.setVisible(false); continue; } var t = Core.clamp(p.age / p.max, 0, 1), u = t - 1, ease = 1 + 2.7 * u * u * u + 1.7 * u * u; p.y = p.baseY - ease * 25; p.text.setPosition(p.x, p.y).setScale(1 + Math.max(0, ease - 1) * .18).setAlpha(Math.min(1, p.life * 3)); }
    }
    updateRings() { for (var i = 0; i < this.ringPool.length; i++) { var r = this.ringPool[i]; if (r.active) { r.age += STEP; if (r.age >= r.life) r.active = false; } } }

    flowWaves() {
      if (this.waveLive && this.countEnemies() === 0 && !this.clearPending) { this.clearPending = true; this.waveLive = false; this.waveTimer = .9; this.showBoundary('WAVE CLEAR', (WAVE_SETS[this.currentSetIndex] || WAVE_SETS[0]).name, PAL.mint); kit.audio.sfx('wave', { volume: .72 }); }
      if (!this.waveLive) { this.waveTimer -= STEP; if (this.waveTimer <= 0) this.startWave(this.wave + 1); }
    }
    countEnemies() { var n = 0; for (var i = 0; i < this.enemyPool.length; i++) if (this.enemyPool[i].active) n++; return n; }
    playerDie() {
      if (this.state !== 'play') return;
      var p = this.player; this.lives--; p.hurt = .62; this.multiplier = 1; this.crystals = 0; this.clearCrystals(); this.clearHostileProjectiles(); this.emit('playerHit', p.x, p.y, 42); this.takeRing(p.x, p.y, PAL.rose, 118, .95); if (kit.juice.enabled) { this.damageFlash = .9; this.flash = .25; } this.shake(18, 260); kit.audio.sfx('damage', { volume: .8 });
      this.showChip('HULL BREAK · x1', PAL.rose);
      if (this.lives <= 0) { this.state = 'over'; this.overTime = 0; if (this.score > save.bestScore) save.bestScore = this.score; save.tutorialDone = this.tutorialStep >= 3; kit.save.set(save); kit.audio.sfx('gameover', { volume: .82 }); }
      else { this.state = 'dead'; this.respawn = 1.05; }
    }
    clearCrystals() { for (var i = 0; i < this.crystalPool.length; i++) this.crystalPool[i].active = false; }
    stepDead() {
      this.respawn -= STEP; this.updateEnemiesNoContact(); this.updateCrystals(); this.updatePopups(STEP); this.updateRings();
      if (this.respawn <= 0) { var a = this.metrics.arena; this.player.x = a.x + a.w * .5; this.player.y = a.y + a.h * .62; this.player.vx = 0; this.player.vy = 0; this.player.invuln = 2.3; this.state = 'play'; this.takeRing(this.player.x, this.player.y, PAL.cyan, 65, .6); }
    }
    updateEnemiesNoContact() {
      for (var i = 0; i < this.enemyPool.length; i++) { var e = this.enemyPool[i]; if (!e.active) continue; e.x += e.vx * STEP; e.y += e.vy * STEP; }
    }
    updateMusicLayer() {
      var danger = false, count = 0;
      for (var i = 0; i < this.enemyPool.length; i++) if (this.enemyPool[i].active) { count++; if (this.enemyPool[i].elite) danger = true; }
      var wanted = danger || count > 16 ? 'intensity' : 'music';
      if (wanted !== this.musicMode) { this.musicMode = wanted; kit.audio.music(wanted, 700); }
    }
    useBomb() {
      if (this.state !== 'play' || this.bombs <= 0) return;
      this.bombs--; this.clearHostileProjectiles(); if (kit.juice.enabled) { this.bombFx = .9; this.flash = .72; } this.takeRing(this.player.x, this.player.y, PAL.rose, Math.max(this.metrics.arena.w, this.metrics.arena.h) * .78, .9); this.emit('screenFx', this.player.x, this.player.y, 80); this.emit('embers', this.player.x, this.player.y, 36); this.shake(26, 340); kit.audio.sfx('bomb', { volume: .9 });
      for (var i = 0; i < this.enemyPool.length; i++) if (this.enemyPool[i].active) this.killEnemy(this.enemyPool[i], true);
      this.showChip('STORMBREAK · ×' + this.bombs, PAL.rose);
    }

    checkMilestone(wave) {
      var index = Math.floor(wave / 3) - 1, medal = MEDALS[index]; if (!medal) return; this.milestone = Math.max(this.milestone, index + 1); this.runMedal = medal.name;
      save.medals[index] = Math.max(save.medals[index], index + 1);
      if (index === 0 && save.unlocks.indexOf('aegis') < 0) save.unlocks.push('aegis');
      if (index === 1 && save.unlocks.indexOf('prism') < 0) save.unlocks.push('prism');
      if (index === 2 && save.unlocks.indexOf('wraith') < 0) save.unlocks.push('wraith');
      if (index === 3 && save.unlocks.indexOf('nova') < 0) save.unlocks.push('nova');
      if (index === 0) save.ship = 'aegis'; if (index === 1) save.weapon = 'prism'; if (index === 2) save.ship = 'wraith'; if (index === 3) save.weapon = 'nova';
      kit.save.set(save); this.activeShip = safeShip(save.ship); this.activeWeapon = safeWeapon(save.weapon); this.showBoundary(medal.name + ' MEDAL', 'UNLOCKED: ' + medal.unlock, medal.color); kit.audio.sfx('milestone', { volume: .86 }); this.emit('screenFx', this.player.x, this.player.y, 32); this.shake(8, 190);
    }

    emit(kind, x, y, count) { if (!kit.juice.enabled) return; var fx = this.fx[kind] || this.fx.explosion; if (fx && fx.emitParticleAt) fx.emitParticleAt(x, y, Math.min(count || 1, 80)); }

    syncDebug() {
      var hostileCount = 0;
      for (var i = 0; i < this.hostileBulletPool.length; i++) if (this.hostileBulletPool[i].active) hostileCount++;
      DEBUG.wave = this.wave; DEBUG.lives = this.lives; DEBUG.multiplier = this.multiplier; DEBUG.score = this.score; DEBUG.bombs = this.bombs; DEBUG.crystals = this.crystals; DEBUG.peakMultiplier = this.peakMultiplier; DEBUG.powerups = { shield: this.powerups.shield, overdrive: this.powerups.overdrive, weapon: this.powerups.weapon }; DEBUG.overflow = this.overflow; DEBUG.set = (WAVE_SETS[this.currentSetIndex] || WAVE_SETS[0]).name; DEBUG.setKey = this.currentSetKey; DEBUG.enemyCount = this.countEnemies(); DEBUG.hostileBulletCount = hostileCount; DEBUG.medal = this.runMedal; DEBUG.unlocked = save.unlocks.slice(); DEBUG.tutorialStep = this.tutorialStep; DEBUG.ship = this.activeShip.name; DEBUG.weapon = this.activeWeapon.name; DEBUG.reducedMotion = !kit.juice.enabled; if (!root.__vs.forceWave) root.__vs.forceWave = DEBUG.forceWave || 0; if (!root.__vs.forceEvent) root.__vs.forceEvent = DEBUG.forceEvent || ''; DEBUG.forceWave = root.__vs.forceWave || DEBUG.forceWave || 0; DEBUG.forceEvent = root.__vs.forceEvent || DEBUG.forceEvent || '';
      root.__vs.state = DEBUG;
    }

    update(time, delta) {
      if (this.kitPaused || kit.paused) { this.render(); return; }
      var elapsed = Math.min(STEP * MAX_STEPS, Math.max(0, (Number(delta) || 0) / 1000));
      this.accumulator += elapsed;
      var steps = 0;
      while (this.accumulator >= STEP && steps < MAX_STEPS) {
        this.step(); this.accumulator -= STEP; steps++;
      }
      // A slow device sheds excess wall time instead of time-skipping the sim.
      if (steps >= MAX_STEPS && this.accumulator >= STEP) this.accumulator = 0;
      this.render();
    }

    render() {
      var j = kit.juice.frame(); if (j.frozen) return; this.worldRoot.x = j.dx; this.worldRoot.y = j.dy;
      this.renderWorldFx(); this.renderEntities(); this.renderPlayer(); this.renderHud(); this.renderTouchSticks(); this.renderBanner();
    }
    renderWorldFx() {
      var g = this.worldFx, a = this.metrics.arena, p = this.player; g.clear(); g.setBlendMode(Phaser.BlendModes.ADD);
      if (this.state === 'play') {
        var aimX = this.inputState.aimMag > .18 ? this.inputState.aimX : Math.cos(p.angle), aimY = this.inputState.aimMag > .18 ? this.inputState.aimY : Math.sin(p.angle);
        var leadX = p.x + aimX * 96, leadY = p.y + aimY * 96;
        g.lineStyle(1, PAL.cyan, this.inputState.aimMag > .18 ? .4 : .18); g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(leadX, leadY); g.strokePath();
        g.lineStyle(1.4, PAL.cyan, this.inputState.aimMag > .18 ? .72 : .32); Core.drawRing(g, leadX, leadY, 7, 12, p.animTime, p.animTime + TAU * .72);
      }
      for (var i = 0; i < this.enemyPool.length; i++) { var e = this.enemyPool[i]; if (!e.active || e.kind !== 'well' || e.born > 0) continue; var rr = 76 + Math.sin(e.phase * 2) * 7, pull = Core.clamp(1 - Math.sqrt(Core.dist2(p.x, p.y, e.x, e.y)) / 270, 0, 1); g.lineStyle(1.4, PAL.blue, .18 + pull * .2); Core.drawRing(g, e.x, e.y, rr, 32, e.phase, e.phase + TAU * .94); Core.drawRing(g, e.x, e.y, 46, 24, -e.phase * 1.4, -e.phase * 1.4 + TAU * .7); if (pull > .08) { g.lineStyle(1, PAL.violet, .24); for (var ar = 0; ar < 8; ar++) { var aa = e.phase + ar / 8 * TAU, ex = e.x + Math.cos(aa) * 90, ey = e.y + Math.sin(aa) * 90; g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex - Math.cos(aa) * 12, ey - Math.sin(aa) * 12); g.strokePath(); } } }
      for (i = 0; i < this.telegraphPool.length; i++) { var tg = this.telegraphPool[i]; if (!tg.active) continue; var warn = kit.juice.enabled ? .22 + (1 - tg.life / tg.max) * .46 : .32; g.lineStyle(1.6, tg.color, warn); if (tg.pattern === 'radial') Core.drawRing(g, tg.x, tg.y, 25 + (1 - tg.life / tg.max) * 25, 20, tg.angle, tg.angle + TAU); else { g.beginPath(); g.moveTo(tg.x, tg.y); g.lineTo(tg.x + Math.cos(tg.angle) * 150, tg.y + Math.sin(tg.angle) * 150); g.strokePath(); } }
      for (i = 0; i < this.hostileBulletPool.length; i++) { var hb = this.hostileBulletPool[i]; if (!hb.active) continue; g.lineStyle(hb.r * 2.7, hb.tint, .15); g.beginPath(); g.moveTo(hb.x - hb.vx * .014, hb.y - hb.vy * .014); g.lineTo(hb.x, hb.y); g.strokePath(); g.fillStyle(hb.tint, .9); g.fillCircle(hb.x, hb.y, hb.r); g.lineStyle(1, PAL.white, .62); Core.drawRing(g, hb.x, hb.y, hb.r + 2, 10, kit.juice.enabled ? hb.age * 4 : 0, kit.juice.enabled ? hb.age * 4 + TAU * .7 : TAU * .7); }
      for (i = 0; i < this.ringPool.length; i++) { var r = this.ringPool[i]; if (!r.active) continue; var t = r.age / r.life; g.lineStyle(2.4, r.color, 1 - t); Core.drawRing(g, r.x, r.y, Core.lerp(r.r0, r.r1, t), 38, r.age * 1.8, r.age * 1.8 + TAU * .96); }
      if (this.bombFx > 0) { var bt = 1 - this.bombFx / .9; g.lineStyle(3, PAL.rose, this.bombFx); Core.drawRing(g, p.x, p.y, Core.lerp(18, Math.max(a.w, a.h) * .82, bt), 64, bt * .4, bt * .4 + TAU * .98); }
    }
    renderEntities() {
      var i, e, b, c, d, g;
      for (i = 0; i < this.enemyPool.length; i++) { e = this.enemyPool[i]; if (!e.active) { if (e.gfx) e.gfx.setVisible(false); continue; } this.renderEnemy(e); }
      for (i = 0; i < this.bulletPool.length; i++) { b = this.bulletPool[i]; if (!b.active) { if (b.gfx) b.gfx.setVisible(false); continue; } g = this.ensureGfx(b, 34); g.clear(); g.lineStyle(b.r * 2.6, b.tint, .16); g.beginPath(); g.moveTo(b.x - b.vx * .018, b.y - b.vy * .018); g.lineTo(b.x, b.y); g.strokePath(); g.lineStyle(b.r, b.tint, .98); g.beginPath(); g.moveTo(b.x - b.vx * .014, b.y - b.vy * .014); g.lineTo(b.x, b.y); g.strokePath(); }
      for (i = 0; i < this.crystalPool.length; i++) { c = this.crystalPool[i]; if (!c.active) { if (c.gfx) c.gfx.setVisible(false); continue; } g = this.ensureGfx(c, 32); g.clear(); var ca = .65 + Math.sin(c.phase) * .2; g.fillStyle(PAL.mint, .13); g.fillCircle(c.x, c.y, 9); g.fillStyle(PAL.mint, ca); g.beginPath(); g.moveTo(c.x, c.y - 6); g.lineTo(c.x + 4, c.y); g.lineTo(c.x, c.y + 6); g.lineTo(c.x - 4, c.y); g.closePath(); g.fillPath(); }
      for (i = 0; i < this.dropPool.length; i++) { d = this.dropPool[i]; if (!d.active) { if (d.gfx) d.gfx.setVisible(false); continue; } var power = POWERUPS[d.type] || POWERUPS.bomb; g = this.ensureGfx(d, 33); g.clear(); var pulse = 10 + Math.sin(d.phase) * 2; g.lineStyle(2, power.color, .9); Core.drawRing(g, d.x, d.y, pulse, 8, d.phase, d.phase + TAU); g.fillStyle(power.color, .2); g.fillCircle(d.x, d.y, 8); g.lineStyle(1, PAL.white, .8); g.beginPath(); if (d.type === 'shield') { g.arc(d.x, d.y, 5, Math.PI, TAU); } else { g.moveTo(d.x - 4, d.y); g.lineTo(d.x + 4, d.y); g.moveTo(d.x, d.y - 4); g.lineTo(d.x, d.y + 4); } g.strokePath(); }
    }
    renderEnemy(e) {
      var g = this.ensureGfx(e, 28), f = FAMILY[e.kind] || FAMILY.drifter, color = e.hurt > 0 ? PAL.white : f.color, alpha = e.born > 0 ? .28 : 1; g.clear(); g.setAlpha(alpha);
      if (e.kind === 'drifter' || e.kind === 'mini') { this.poly(g, e.x, e.y, e.r, e.kind === 'mini' ? 3 : 4, e.angle, color, .16, 2); }
      else if (e.kind === 'weaver') { this.poly(g, e.x, e.y, e.r + 2, 3, e.angle, color, .12, 2); this.poly(g, e.x, e.y, e.r * .52, 3, -e.angle, PAL.white, .22, 1); }
      else if (e.kind === 'snake') { for (var i = e.segN - 1; i >= 0; i--) { var fac = 1 - i / (e.segN + 1) * .48; g.fillStyle(color, .16 + fac * .32); g.fillCircle(e.segX[i], e.segY[i], 7 * fac + 2); g.lineStyle(1.1, color, .86); Core.drawRing(g, e.segX[i], e.segY[i], 7 * fac + 2, 12, 0, TAU); } this.poly(g, e.x, e.y, e.r, 5, e.angle, color, .32, 2); }
      else if (e.kind === 'spawner') { this.poly(g, e.x, e.y, e.r, 6, e.phase * .6, color, .12, 2); this.poly(g, e.x, e.y, e.r * .52 + Math.sin(e.phase * 4) * 2, 6, -e.phase, PAL.white, .28, 1); }
      else if (e.kind === 'well') { g.fillStyle(0x02030a, .86); g.fillCircle(e.x, e.y, e.r * .68); g.lineStyle(2, color, .9); Core.drawRing(g, e.x, e.y, e.r, 20, e.angle, e.angle + TAU); this.poly(g, e.x, e.y, e.r * 1.34, 3, -e.angle * 1.7, color, 0, 1.4); }
      else { var scale = e.kind === 'swarmcore' ? 1.2 : 1; g.fillStyle(color, .14); g.fillCircle(e.x, e.y, e.r * 1.35); this.poly(g, e.x, e.y, e.r * scale, e.kind === 'singularity' ? 8 : 6, e.angle, color, .18, 2.5); this.poly(g, e.x, e.y, e.r * .55, 4, -e.angle * 1.4, PAL.white, .22, 1.4); g.lineStyle(2, color, .65); Core.drawRing(g, e.x, e.y, e.r * 1.6 + Math.sin(e.phase * 3) * 3, 36, e.phase, e.phase + TAU * .78); if (e.maxHp > 0) { g.fillStyle(0x05070e, .82); g.fillRect(e.x - e.r, e.y - e.r - 10, e.r * 2, 3); g.fillStyle(color, .9); g.fillRect(e.x - e.r, e.y - e.r - 10, e.r * 2 * Core.clamp(e.hp / e.maxHp, 0, 1), 3); } }
      g.setAlpha(1);
    }
    poly(g, cx, cy, r, n, rot, color, fillAlpha, width) { g.beginPath(); for (var i = 0; i < n; i++) { var a = rot + i / n * TAU, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.closePath(); if (fillAlpha > 0) { g.fillStyle(color, fillAlpha); g.fillPath(); } g.lineStyle(width || 1.5, color, .9); g.strokePath(); }
    renderPlayer() {
      var p = this.player, g = this.playerG; g.clear(); if (this.state === 'dead' || this.state === 'over') return; if (kit.juice.enabled && p.invuln > 0 && (Math.floor(p.invuln * 14) & 1)) return; var ship = safeShip(this.activeShip.name ? this.activeShip.name.toLowerCase() : save.ship), col = p.state === 'hurt' ? PAL.white : ship.tint, wing = ship.wing; var ca = Math.cos(p.angle), sa = Math.sin(p.angle); function pt(x, y) { return { x: p.x + x * ca - y * sa, y: p.y + x * sa + y * ca }; } var trail = 4 + p.thrust * 10; for (var trI = 0; trI < 3; trI++) { var tx = p.x - ca * (13 + trI * 5), ty = p.y - sa * (13 + trI * 5); g.fillStyle(wing, .22 - trI * .05); g.fillCircle(tx, ty, Math.max(2, trail * (.62 - trI * .12) + Math.sin(p.animTime * 18 + trI) * 1.2)); } g.fillStyle(col, .11); g.fillCircle(p.x, p.y, 25 + Math.sin(p.animTime * 5) * (p.state === 'idle' ? 2 : 0)); if (this.powerups.shield > 0) { g.lineStyle(1.5, PAL.cyan, .6); Core.drawRing(g, p.x, p.y, 19 + Math.sin(p.animTime * 4) * 2, 22, 0, TAU); } var nose = pt(17, 0), tr = pt(-10, 9), mid = pt(-4, 0), tl = pt(-10, -9); g.beginPath(); g.moveTo(nose.x, nose.y); g.lineTo(tr.x, tr.y); g.lineTo(mid.x, mid.y); g.lineTo(tl.x, tl.y); g.closePath(); g.fillStyle(col, .2); g.fillPath(); g.lineStyle(2.6, col, .95); g.strokePath(); g.lineStyle(1.1, wing, .95); var w1 = pt(-3, 0), w2 = pt(-12, 14), w3 = pt(-5, 4); g.beginPath(); g.moveTo(w1.x, w1.y); g.lineTo(w2.x, w2.y); g.lineTo(w3.x, w3.y); g.strokePath(); var v1 = pt(-3, 0), v2 = pt(-12, -14), v3 = pt(-5, -4); g.beginPath(); g.moveTo(v1.x, v1.y); g.lineTo(v2.x, v2.y); g.lineTo(v3.x, v3.y); g.strokePath(); if (p.muzzle > 0) { g.fillStyle(PAL.white, p.muzzle * 9); g.fillCircle(nose.x, nose.y, 9); g.lineStyle(2, PAL.white, .9); g.beginPath(); g.moveTo(nose.x, nose.y); g.lineTo(nose.x + ca * 12 - sa * 4, nose.y + sa * 12 + ca * 4); g.moveTo(nose.x, nose.y); g.lineTo(nose.x + ca * 12 + sa * 4, nose.y + sa * 12 - ca * 4); g.strokePath(); } }
    renderTouchSticks() {
      var g = this.hudG, map = kit.input.pointers, R = 55; if (!map) return;
      var self = this; map.forEach(function (p) { if (p.zone !== 'move' && p.zone !== 'aim') return; var start = self.localPoint(p.startX, p.startY), now = self.localPoint(p.x, p.y), dx = now.x - start.x, dy = now.y - start.y, d = Math.sqrt(dx * dx + dy * dy), m = Math.min(R, d), kx = start.x, ky = start.y; if (d > 0) { kx += dx / d * m; ky += dy / d * m; } var col = p.zone === 'move' ? PAL.cyan : PAL.rose; g.lineStyle(2, col, .28); Core.drawRing(g, start.x, start.y, R, 28, 0, TAU); g.fillStyle(col, .16); g.fillCircle(kx, ky, 19); g.lineStyle(1.5, col, .78); Core.drawRing(g, kx, ky, 19, 22, 0, TAU); });
    }
    renderHud() {
      var W = this.metrics.W, H = this.metrics.H, b = this.metrics.bomb, s = this.metrics.settings, g = this.hudG;
      g.clear(); g.setBlendMode(Phaser.BlendModes.ADD);
      g.fillStyle(PAL.rose, this.bombs > 0 ? .1 : .035); g.fillCircle(b.x, b.y, b.r + 2); g.lineStyle(1.5, PAL.rose, this.bombs > 0 ? .85 : .24); Core.drawRing(g, b.x, b.y, b.r, 28, 0, TAU);
      g.lineStyle(1.2, PAL.dim, .55); Core.drawRing(g, s.x, s.y, s.r, 20, 0, TAU);
      for (var i = 0; i < 3; i++) { var lx = W * .5 - 24 + i * 24, ly = Math.max(50, this.metrics.arena.y - 26); g.lineStyle(1.2, i < this.lives ? PAL.cyan : PAL.dim, i < this.lives ? .9 : .24); this.shipIcon(g, lx, ly, i < this.lives ? PAL.cyan : PAL.dim); }
      for (i = 0; i < 4; i++) { g.fillStyle(i < this.milestone ? (WAVE_SETS[this.currentSetIndex] || WAVE_SETS[0]).accent : PAL.dim, i < this.milestone ? .9 : .22); g.fillCircle(W * .5 - 18 + i * 12, Math.max(50, this.metrics.arena.y - 7), 3); }
      if (this.multPulse > 0) { g.lineStyle(2, PAL.mint, this.multPulse * 1.6); Core.drawRing(g, this.metrics.compact ? Math.max(88, W - 125) : W - 47, 26, 18 + (1 - this.multPulse) * 7, 26, 0, TAU); }
      var powerX = Math.max(110, (this.metrics.compact ? Math.max(88, W - 98) : W - 20) - 134), powerY = Math.max(54, this.metrics.arena.y - 18), powerSlot = 0;
      if (this.powerups.shield > 0) this.powerMeter(g, powerX + powerSlot++ * 42, powerY, PAL.cyan, this.powerups.shield / 3, 'shield');
      if (this.powerups.overdrive > 0) this.powerMeter(g, powerX + powerSlot++ * 42, powerY, PAL.amber, this.powerups.overdrive / 12, 'overdrive');
      if (this.powerups.weapon > 0) this.powerMeter(g, powerX + powerSlot++ * 42, powerY, PAL.violet, this.powerups.weapon / 12, 'weapon');
      var boss = null; for (i = 0; i < this.enemyPool.length; i++) if (this.enemyPool[i].active && this.enemyPool[i].elite) { boss = this.enemyPool[i]; break; }
      var showBoss = !!boss && this.state === 'play', barWidth = Math.min(200, W - 40); this.ui.bossBarBg.setVisible(showBoss); this.ui.bossBar.setVisible(showBoss); if (showBoss) { this.ui.bossBarBg.setDisplaySize(barWidth, 5); this.ui.bossBar.setDisplaySize(barWidth * Core.clamp(boss.hp / boss.maxHp, 0, 1), 5); }
      Core.setTextIfChanged(this.ui.score, '◆ ' + this.score); Core.setTextIfChanged(this.ui.wave, 'W' + String(this.wave).padStart(2, '0')); Core.setTextIfChanged(this.ui.mult, 'x' + this.multiplier); Core.setColorIfChanged(this.ui.mult, Core.hex(this.multiplier > 1 ? PAL.mint : PAL.ice)); Core.setTextIfChanged(this.ui.crystals, '◇ ' + String(this.crystals % 8).padStart(2, '0') + '/08'); Core.setTextIfChanged(this.ui.bomb, '×' + this.bombs);
      if (this.ui.coach.visible && !this.activeTransient) { g.lineStyle(1, PAL.cyan, .12); g.beginPath(); g.moveTo(18, this.metrics.arena.y - 27); g.lineTo(W - 18, this.metrics.arena.y - 27); g.strokePath(); }
      if (this.flash > 0) { g.fillStyle(PAL.white, this.flash * .16); g.fillRect(0, 0, W, H); }
      if (this.damageFlash > 0) for (i = 0; i < 5; i++) { var edge = i * 3, edgeAlpha = this.damageFlash * (.045 - i * .007); g.fillStyle(PAL.rose, edgeAlpha); g.fillRect(edge, edge, W - edge * 2, 2); g.fillRect(edge, H - edge - 2, W - edge * 2, 2); g.fillRect(edge, edge, 2, H - edge * 2); g.fillRect(W - edge - 2, edge, 2, H - edge * 2); }
      if (this.state === 'over') { this.ui.overBackdrop.setVisible(true); this.ui.overTitle.setVisible(true); this.ui.overScore.setVisible(true); this.ui.overDetails.setVisible(true); this.ui.overPrompt.setVisible(this.overTime > .55 && (Math.floor(this.overTime * 2) & 1) === 0); Core.setTextIfChanged(this.ui.overScore, 'SCORE  ' + this.score); Core.setTextIfChanged(this.ui.overDetails, 'WAVE ' + this.wave + '   PEAK x' + this.peakMultiplier + '   BEST ' + save.bestScore); } else { this.ui.overBackdrop.setVisible(false); this.ui.overTitle.setVisible(false); this.ui.overScore.setVisible(false); this.ui.overDetails.setVisible(false); this.ui.overPrompt.setVisible(false); }
    }
    powerMeter(g, x, y, color, ratio, kind) {
      g.lineStyle(2, color, .18); g.beginPath(); g.moveTo(x - 7, y + 9); g.lineTo(x + 23, y + 9); g.strokePath();
      g.lineStyle(2, color, .84); g.beginPath(); g.moveTo(x - 7, y + 9); g.lineTo(x - 7 + 30 * Core.clamp(ratio, 0, 1), y + 9); g.strokePath();
      g.lineStyle(1.4, color, .9); g.beginPath(); if (kind === 'shield') { Core.drawRing(g, x + 2, y, 6, 12, 0, TAU); } else if (kind === 'overdrive') { g.moveTo(x - 2, y - 6); g.lineTo(x + 5, y); g.lineTo(x, y); g.lineTo(x + 6, y + 6); } else { g.moveTo(x + 2, y - 7); g.lineTo(x + 9, y); g.lineTo(x + 2, y + 7); g.lineTo(x - 5, y); g.closePath(); } g.strokePath();
    }
    shipIcon(g, x, y, color) { g.fillStyle(color, .22); g.beginPath(); g.moveTo(x + 8, y); g.lineTo(x - 6, y + 4); g.lineTo(x - 3, y); g.lineTo(x - 6, y - 4); g.closePath(); g.fillPath(); g.lineStyle(1, color, .9); g.strokePath(); }
    renderBanner() {
      var W = this.metrics.W, H = this.metrics.H, a = this.metrics.arena, g = this.bannerG; g.clear();
      if (this.state === 'over') {
        this.ui.banner.setVisible(false); this.ui.bannerSub.setVisible(false);
        var overWidth = Math.min(W * .62, 580), overY = H * .39;
        g.fillStyle(PAL.rose, .09); g.fillRect(W * .5 - overWidth * .5, overY - 34, overWidth, 68); g.lineStyle(1.4, PAL.rose, .74); g.beginPath();
        g.moveTo(W * .5 - overWidth * .5, overY - 34); g.lineTo(W * .5 + overWidth * .5, overY - 34); g.moveTo(W * .5 - overWidth * .5, overY + 34); g.lineTo(W * .5 + overWidth * .5, overY + 34); g.strokePath();
        return;
      }
      if (!this.activeTransient || this.bannerTime <= 0) { this.ui.banner.setVisible(false); this.ui.bannerSub.setVisible(false); return; }
      var alpha = kit.juice.enabled ? Core.clamp(this.bannerTime < .2 ? this.bannerTime / .2 : 1, 0, 1) : 1;
      if (this.activeTransient.kind === 'chip') {
        var chipWidth = Math.min(W - 36, Math.max(120, this.ui.banner.width + 22)), chipX = 18 + chipWidth * .5, chipY = a.y - 14;
        g.fillStyle(this.bannerColor, .08 * alpha); g.fillRect(18, chipY - 13, chipWidth, 26); g.lineStyle(1.1, this.bannerColor, .68 * alpha); g.strokeRect(18, chipY - 13, chipWidth, 26);
        this.ui.banner.setPosition(chipX, chipY).setScale(kit.juice.enabled ? 1.02 : 1).setAlpha(alpha); this.ui.bannerSub.setVisible(false);
      } else {
        var width = Math.min(W * .52, 480), y = a.y + a.h * .42, bx = W * .5;
        g.fillStyle(this.bannerColor, .08 * alpha); g.fillRect(bx - width * .5, y - 29, width, 58); g.lineStyle(1.2, this.bannerColor, .7 * alpha); g.beginPath();
        g.moveTo(bx - width * .5, y - 29); g.lineTo(bx + width * .5, y - 29); g.moveTo(bx - width * .5, y + 29); g.lineTo(bx + width * .5, y + 29); g.strokePath();
        this.ui.banner.setPosition(bx, y).setScale(kit.juice.enabled ? 1.02 : 1).setAlpha(alpha); this.ui.bannerSub.setPosition(bx, y + 25).setAlpha(alpha);
      }
    }
  }

  kit.loader.show('VECTOR STORM');
  kit.loader.progress(.34);
  var cssW = Math.max(1, document.documentElement.clientWidth || document.body.clientWidth || 1);
  var cssH = Math.max(1, document.documentElement.clientHeight || document.body.clientHeight || 1);
  var cfg = root.GGKit.hiDpi.phaser({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#050913',
    scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.CENTER_BOTH, width: cssW, height: cssH },
    render: Object.assign({}, root.GGKit.renderDefaults),
    fps: { target: 60, forceSetTimeOut: false },
    input: { activePointers: 4 },
    scene: [VectorStormScene]
  });
  DPR = cfg.ggDpr;
  var game = new Phaser.Game(cfg);
  root.__vs.game = game;
})(typeof window !== 'undefined' ? window : globalThis);
