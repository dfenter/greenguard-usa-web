/* Vanguard Four / fleet F2
 * Phaser is the renderer. GGKit owns lifecycle, input identity, save, audio,
 * pause, reduced motion, and PWA registration. The arena sim is fixed-step.
 */
(function () {
  'use strict';

  var W = 390, H = 844, STEP = 1 / 60, MAX_STEPS = 4, TAU = Math.PI * 2;
  var RETINA_FACTOR = GGKit.hiDpi.factor(W, H);

  var textFactory = Phaser.GameObjects.GameObjectFactory.prototype.text;
  Phaser.GameObjects.GameObjectFactory.prototype.text = function (x, y, text, style) {
    return textFactory.call(this, x, y, text, Object.assign({ resolution: RETINA_FACTOR }, style || {}));
  };
  var ARENA = { x: 16, y: 138, w: 358, h: 510 };
  var MAX_ENEMIES = 34, MAX_PICKUPS = 60, MAX_BOLTS = 42, MAX_PARTICLES = 220;
  var P = {
    ink: 0x070b16, deep: 0x0b1222, board: 0x111c32, board2: 0x182746,
    line: 0x345278, white: 0xf2f7ff, mist: 0x9bb0ce, cyan: 0x64edff,
    mint: 0x79f7bd, amber: 0xffcb67, rose: 0xff6d9f, red: 0xff5873,
    violet: 0xa990ff, orange: 0xff9567, blue: 0x6aa8ff, shadow: 0x050811,
    gold: 0xffe29a
  };
  var C = {
    white: '#f2f7ff', mist: '#9bb0ce', cyan: '#64edff', mint: '#79f7bd',
    amber: '#ffcb67', rose: '#ff6d9f', red: '#ff5873', violet: '#a990ff',
    orange: '#ff9567', blue: '#6aa8ff', gold: '#ffe29a'
  };

  var HEROES = [
    { id: 'blade', name: 'RHEA', title: 'BLADE DASH', color: P.rose, css: C.rose, glyph: 'BLADE', speed: 154, maxHp: 126, meter: 1.2, kind: 'blade', superName: 'VECTOR RUSH' },
    { id: 'gravity', name: 'ORO', title: 'GRAVITY FIST', color: P.violet, css: C.violet, glyph: 'GRAVITY', speed: 112, maxHp: 164, meter: 1.1, kind: 'gravity', superName: 'SINGULARITY' },
    { id: 'lantern', name: 'NIA', title: 'ARC LANTERN', color: P.amber, css: C.amber, glyph: 'LANTERN', speed: 128, maxHp: 118, meter: 1.35, kind: 'lantern', superName: 'SUNLIT ARC' },
    { id: 'storm', name: 'KITO', title: 'STORM CHAIN', color: P.cyan, css: C.cyan, glyph: 'STORM', speed: 142, maxHp: 110, meter: 1.4, kind: 'storm', superName: 'CHAIN REACTION' }
  ];
  var ENEMIES = {
    husk: { hp: 28, speed: 46, r: 14, color: 0x7891ae, score: 35, hit: 10 },
    skitter: { hp: 18, speed: 78, r: 11, color: P.orange, score: 50, hit: 8 },
    lobber: { hp: 34, speed: 32, r: 15, color: P.amber, score: 65, hit: 12 },
    bracer: { hp: 54, speed: 28, r: 17, color: P.violet, score: 90, hit: 17 },
    sapper: { hp: 25, speed: 58, r: 13, color: P.red, score: 75, hit: 22 },
    warden: { hp: 620, speed: 22, r: 37, color: P.rose, score: 1200, hit: 28, boss: true }
  };
  var ROOM_SETS = [
    { id: 'entry', label: 'ENTRY COURTYARD', sub: 'CLEAN LINES / FIRST CONTACT', accent: P.cyan, mix: ['husk', 'husk', 'skitter'], decor: 'entry', signature: 'Open sightlines teach spacing.', obstacles: [] },
    { id: 'foundry', label: 'COLLAPSING FOUNDRY', sub: 'HOT METAL / PRESSURE LANES', accent: P.orange, mix: ['husk', 'lobber', 'sapper', 'skitter'], decor: 'foundry', signature: 'Sappers mark the safe route.', obstacles: [{ x: 72, y: 205, w: 34, h: 250 }, { x: 284, y: 205, w: 34, h: 250 }] },
    { id: 'rampart', label: 'STORM RAMPART', sub: 'WIND SHEAR / CROSS FIRE', accent: P.violet, mix: ['skitter', 'bracer', 'lobber', 'sapper'], decor: 'rampart', signature: 'Bracers reward the rear angle.', obstacles: [{ x: 46, y: 255, w: 100, h: 24 }, { x: 244, y: 405, w: 100, h: 24 }, { x: 154, y: 330, w: 82, h: 24 }] },
    { id: 'warden', label: 'WARDEN ARENA', sub: 'FAIR WARNING / HARD ANSWER', accent: P.rose, mix: ['husk', 'bracer', 'lobber'], decor: 'warden', signature: 'Read the ring. Move on the flash.', obstacles: [{ x: 144, y: 308, w: 102, h: 20 }] },
    { id: 'finale', label: 'FINALE ASSAULT CHAMBER', sub: 'FOUR SIGNALS / ONE EXIT', accent: P.gold, mix: ['skitter', 'bracer', 'sapper', 'lobber'], decor: 'finale', signature: 'The whole roster gets a last stand.', obstacles: [{ x: 66, y: 235, w: 42, h: 190 }, { x: 282, y: 235, w: 42, h: 190 }, { x: 160, y: 350, w: 70, h: 24 }] }
  ];
  var TRIALS = [
    { hero: 0, label: 'EDGE PROTOCOL', set: 0, rooms: 3, goal: 'Chain three blade strikes, then hold for the finisher.' },
    { hero: 1, label: 'WEIGHT OF FOUR', set: 1, rooms: 3, goal: 'Pull the crowd close before the gravity finisher.' },
    { hero: 2, label: 'ARC SCHOOL', set: 2, rooms: 3, goal: 'Build SUPER from generous orbs and heal the line.' },
    { hero: 3, label: 'WEATHER LINE', set: 2, rooms: 3, goal: 'Let the chain bounce through a mixed wave.' }
  ];
  var FORMATIONS = [
    { id: 'line', label: 'LINE', sub: 'Balanced spacing', offsets: [[0, 0], [-48, 24], [48, 24], [0, 58]] },
    { id: 'vanguard', label: 'VANGUARD', sub: 'Front pressure', offsets: [[0, 0], [-44, 14], [44, 14], [0, 72]] },
    { id: 'orbit', label: 'ORBIT', sub: 'Ranged screen', offsets: [[0, 0], [-78, 0], [78, 0], [0, -78]] }
  ];
  var TUTORIAL_STEPS = [
    { until: 5, text: 'MOVE · DRAG LEFT' },
    { until: 10, text: 'STRIKE · TAP / HOLD' },
    { until: 16, text: 'SWAP · TAP A PORTRAIT' },
    { until: 23, text: 'FORMATION · TAP BAND' },
    { until: 31, text: 'ROLES · DASH / PULL / ARC / CHAIN' },
    { until: 42, text: 'SUPER · FILL ✦ THEN PRESS K' }
  ];

  function particleTexture(kind) {
    if (kind === 'strike') return 'fx-slash';
    if (kind === 'hit' || kind === 'death') return 'fx-spark';
    if (kind === 'super') return 'fx-burst';
    if (kind === 'telegraph') return 'fx-ring';
    if (kind === 'revive' || kind === 'formation') return 'fx-link';
    if (kind === 'pickup') return 'fx-pip';
    return 'fx-flare';
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function dist2(a, b) { var x = a.x - b.x, y = a.y - b.y; return x * x + y * y; }
  function setTextIfChanged(obj, value) { if (obj && obj.text !== value) obj.setText(value); }
  function setColorIfChanged(obj, value) { if (obj && obj.color !== value) obj.setColor(value); }
  function colorCss(n) { return '#' + ('000000' + n.toString(16)).slice(-6); }
  function pad(n, len) { return String(n).padStart(len, '0'); }
  function fmt(n) { return Math.max(0, Math.floor(n)).toLocaleString('en-US'); }
  function choose(arr, rng) { return arr[Math.floor(rng() * arr.length)] || arr[0]; }
  function tutorialStepAt(time) {
    for (var i = 0; i < TUTORIAL_STEPS.length; i++) if (time < TUTORIAL_STEPS[i].until) return { step: TUTORIAL_STEPS[i], index: i, start: i ? TUTORIAL_STEPS[i - 1].until : 0 };
    return null;
  }

  function validSave(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    if (o.version !== 1 || !Number.isInteger(o.best) || o.best < 0 || o.best > 999999999) return false;
    if (!Number.isInteger(o.runs) || o.runs < 0 || o.runs > 999999) return false;
    if (!Array.isArray(o.trials) || o.trials.length !== 4) return false;
    for (var i = 0; i < 4; i++) if (!Number.isInteger(o.trials[i]) || o.trials[i] < 0 || o.trials[i] > 3) return false;
    return typeof o.finale === 'boolean';
  }
  function defaultSave() { return { version: 1, best: 0, runs: 0, trials: [0, 0, 0, 0], finale: false }; }

  var debugState = { mode: 'menu', room: 0, activeHero: 0, superMeter: 0, score: 0, forceRoom: '', forceWarden: false };
  var debugApi = { state: debugState, forceRoom: '', forceWarden: false };
  if (typeof window !== 'undefined') {
    window.__vf = debugApi;
    try {
      var qs = new URLSearchParams(window.location.search);
      debugApi.forceRoom = qs.get('forceRoom') || '';
      debugApi.forceWarden = qs.get('forceWarden') === '1';
    } catch (e) {}
  }

  var kit = GGKit.create({
    slug: 'vanguard-four', orientation: 'portrait', validateSave: validSave,
    onPause: function () { if (Game.scene) Game.scene.simPaused = true; },
    onResume: function () { if (Game.scene) Game.scene.simPaused = false; },
    onRestart: function () { if (Game.scene) Game.scene.bootMenu(); }
  });
  var Game = { phaser: null, scene: null };
  var profile = kit.save.get(defaultSave());
  if (!validSave(profile)) profile = defaultSave();

  kit.audio.register({
    'music-base': 'assets/music-base.mp3',
    'music-danger': 'assets/music-danger.mp3',
    'strike-hit': 'assets/strike-hit.mp3',
    'super-charge': 'assets/super-charge.mp3',
    'super-release': 'assets/super-release.mp3',
    'revive-chime': 'assets/revive-chime.mp3',
    'warden-roar': 'assets/warden-roar.mp3',
    'room-clear': 'assets/room-clear.mp3',
    'dash-step': 'assets/dash-step.mp3',
    'gravity-pull': 'assets/gravity-pull.mp3',
    'arc-cast': 'assets/arc-cast.mp3',
    'chain-zap': 'assets/chain-zap.mp3',
    'formation-shift': 'assets/formation-shift.mp3',
    'hero-hurt': 'assets/hero-hurt.mp3',
    'pickup-chime': 'assets/pickup-chime.mp3'
  });

  function makeRng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ s >>> 15, 1 | s);
      t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function readDebug(scene) {
    var root = typeof window !== 'undefined' && window.__vf ? window.__vf : debugApi;
    var st = root.state || debugState;
    var fr = root.forceRoom || st.forceRoom || '';
    var fw = !!(root.forceWarden || st.forceWarden);
    debugApi.forceRoom = fr || '';
    debugApi.forceWarden = !!fw;
    debugState.forceRoom = debugApi.forceRoom;
    debugState.forceWarden = debugApi.forceWarden;
    if (scene && scene.run && scene.run.state === 'play') {
      var target = parseInt(debugApi.forceRoom, 10);
      if (Number.isInteger(target) && target > 0 && target !== scene.run.debugRoom) {
        scene.run.debugRoom = target; scene.startRoom(target, true);
      } else if (debugApi.forceWarden && !scene.run.debugWarden) {
        scene.run.debugWarden = true; scene.startRoom(scene.run.room, true);
      }
    }
  }

  function makeRngSeed() { return ((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0) || 0xF8A4C17; }

  function makeHero(i) {
    var d = HEROES[i];
    return {
      i: i, x: ARENA.x + ARENA.w * (0.23 + i * 0.18), y: ARENA.y + ARENA.h * 0.72,
      vx: 0, vy: 0, a: -Math.PI / 2, hp: d.maxHp, maxHp: d.maxHp, meter: 22,
      downed: false, inv: 0, flash: 0, stun: 0, cd: 0, combo: 0, comboT: 0,
      strike: 0, strikeKind: 0, hold: 0, finisher: false, finisherT: 0, superT: 0, superHit: false,
      reviveTarget: -1, reviveP: 0, hitPulse: 0
    };
  }

  function newRun(mode, trialHero) {
    var scene = Game.scene;
    scene.run = {
      mode: mode, trialHero: trialHero, room: 1, score: 0, kills: 0, time: 0,
      roomsCleared: 0, noWipe: true, roomNoWipe: true, roomCombo: 0, maxCombo: 0,
      combo: 0, comboT: 0, seed: makeRngSeed(), rng: null, state: 'play', stateT: 0,
      roomT: 0, spawnQueue: [], clearing: false, clearT: 0, uiActive: null, uiQueue: [], resultNote: '',
      flash: 0, damageFlash: 0, shake: 0, bossClears: 0, rescueFound: false,
      debugRoom: 0, debugWarden: false, rescue: null, formation: 0, synergyT: 0,
      lastHeroHit: -1, audioDanger: false, tutorialT: 0, terminalAt: 0,
      trialStats: { finisher: false, gravityPulls: 0, superHeal: false, chainHits: 0 }
    };
    scene.run.rng = makeRng(scene.run.seed);
    scene.heroes = [0, 1, 2, 3].map(makeHero);
    scene.activeHero = mode === 'trial' ? trialHero : 0;
    scene.clearPools();
    scene.playerPaused = false;
    scene.startRoom(1, true);
    kit.audio.music('music-base', 500);
    profile.runs += 1;
    kit.save.set(profile);
  }

  function MainScene() { Phaser.Scene.call(this, { key: 'MainScene' }); }
  MainScene.prototype = Object.create(Phaser.Scene.prototype);
  MainScene.prototype.constructor = MainScene;

  MainScene.prototype.preload = function () {
    this.load.image('vf-chrome', 'assets/vf-chrome.svg');
    for (var i = 0; i < HEROES.length; i++) this.load.image('hero-sheet-' + i, 'assets/hero-' + HEROES[i].id + '.svg');
    Object.keys(ENEMIES).forEach(function (type) { this.load.image('enemy-' + type, 'assets/enemy-' + type + '.svg'); }, this);
    ['super', 'health', 'score'].forEach(function (type) { this.load.image('pickup-' + type, 'assets/pickup-' + type + '.svg'); }, this);
    for (var r = 0; r < ROOM_SETS.length; r++) this.load.image('room-' + ROOM_SETS[r].id, 'assets/room-' + ROOM_SETS[r].id + '.svg');
    ['slash', 'spark', 'burst', 'ring', 'link', 'pip', 'flare', 'hazard', 'bolt'].forEach(function (kind) { this.load.image('fx-' + kind, 'assets/fx-' + kind + '.svg'); }, this);
    kit.loader.progress(0.18);
  };

  MainScene.prototype.create = function () {
    this.cameras.main.setZoom(RETINA_FACTOR);
    Game.scene = this;
    this.simPaused = false; this.playerPaused = false; this.acc = 0; this.lastStep = 0; this.lastTap = 0;
    this.mode = 'menu'; this.run = null; this.heroes = []; this.activeHero = 0;
    this.enemies = []; this.pickups = []; this.bolts = []; this.particles = [];
    this.hazards = []; this.renderState = { heroes: [], enemies: [] };
    this.prevStrike = false; this.prevSuper = false; this.prevKeys = {}; this.prevPause = false; this.prevRestart = false; this.prevTerminalKey = false; this.lastTerminalTap = 0; this.lastPauseTap = 0; this.prevGamepadPause = false; this.prevGamepadRestart = false; this.prevGamepadPrev = false; this.prevGamepadNext = false;
    this.inputSnapshot = { moveX: 0, moveY: 0, mag: 0, strike: false, super: false };
    this.buildTextures(); this.buildDisplay(); this.bootMenu();
    kit.loader.progress(0.82);
    kit.audio.preload(['music-base', 'music-danger', 'strike-hit', 'super-charge', 'super-release', 'revive-chime', 'warden-roar', 'room-clear', 'dash-step', 'gravity-pull', 'arc-cast', 'chain-zap', 'formation-shift', 'hero-hurt', 'pickup-chime']);
    kit.registerPWA(); kit.loader.progress(1); kit.loader.hide();
  };

  MainScene.prototype.buildTextures = function () {};

  MainScene.prototype.buildDisplay = function () {
    this.add.image(W / 2, H / 2, 'vf-chrome').setDepth(0);
    this.roomSprite = this.add.image(W / 2, ARENA.y + ARENA.h / 2, 'room-entry').setDisplaySize(358, 510).setDepth(2).setVisible(false);
    this.worldFx = this.add.graphics().setDepth(5);
    this.entityFx = this.add.graphics().setDepth(15);
    this.uiFx = this.add.graphics().setDepth(40);
    this.overlayFx = this.add.graphics().setDepth(90);
    this.heroSprites = HEROES.map(function (d, i) { return this.add.image(0, 0, 'hero-sheet-' + i).setOrigin(0.5).setDisplaySize(62, 62).setDepth(12); }, this);
    this.enemySprites = [];
    for (var i = 0; i < MAX_ENEMIES; i++) this.enemySprites.push(this.add.image(0, 0, 'enemy-husk').setOrigin(0.5).setVisible(false).setDepth(10));
    this.pickupSprites = [];
    for (var j = 0; j < MAX_PICKUPS; j++) this.pickupSprites.push(this.add.image(0, 0, 'pickup-score').setOrigin(0.5).setVisible(false).setDepth(9));
    this.particleSprites = [];
    for (var k = 0; k < MAX_PARTICLES; k++) this.particleSprites.push(this.add.image(0, 0, 'fx-flare').setOrigin(0.5).setVisible(false).setDepth(18));
    this.hazardSprites = [];
    for (var hz = 0; hz < 18; hz++) this.hazardSprites.push(this.add.image(0, 0, 'fx-hazard').setOrigin(0.5).setVisible(false).setDepth(6));
    this.boltSprites = [];
    for (var bl = 0; bl < MAX_BOLTS; bl++) this.boltSprites.push(this.add.image(0, 0, 'fx-bolt').setOrigin(0.5).setVisible(false).setDepth(7));
    this.rosterSprites = HEROES.map(function (d, i) { return this.add.image(0, 0, 'hero-sheet-' + i).setCrop(0, 0, 64, 64).setDisplaySize(28, 28).setOrigin(0.5).setDepth(46).setVisible(false); }, this);
    var f = { fontFamily: 'system-ui, sans-serif', fontSize: '14px', fontStyle: '800', color: C.white };
    var small = { fontFamily: 'system-ui, sans-serif', fontSize: '14px', fontStyle: '700', color: C.mist };
    this.t = {
      logo: this.add.text(20, 18, 'VANGUARD FOUR', { fontFamily: 'system-ui, sans-serif', fontSize: '16px', fontStyle: '900', color: C.white }).setDepth(45),
      fleet: this.add.text(20, 39, 'FLEET F2  /  CO-OP ASSAULT', small).setDepth(45),
      room: this.add.text(18, 16, '', f).setDepth(45), score: this.add.text(18, 40, '', small).setDepth(45),
      mode: this.add.text(W - 20, 20, '', { fontFamily: 'system-ui, sans-serif', fontSize: '11px', fontStyle: '900', color: C.cyan, align: 'right' }).setOrigin(1, 0).setDepth(45),
      roster: this.add.text(20, 120, '', small).setDepth(45),
      coach: this.add.text(18, 132, '', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', fontStyle: '800', color: C.mist, align: 'left' }).setOrigin(0, 1).setDepth(45),
      super: this.add.text(218, 38, '✦', { fontFamily: 'system-ui, sans-serif', fontSize: '18px', fontStyle: '900', color: C.cyan }).setDepth(45),
      strike: this.add.text(W - 67, 730, '⚔', { fontFamily: 'system-ui, sans-serif', fontSize: '24px', fontStyle: '900', color: C.white, align: 'center' }).setOrigin(0.5).setDepth(45),
      finisher: this.add.text(W - 58, 748, '', small).setOrigin(0.5).setDepth(45),
      superBtn: this.add.text(W - 166, 730, '✦', { fontFamily: 'system-ui, sans-serif', fontSize: '24px', fontStyle: '900', color: C.white, align: 'center' }).setOrigin(0.5).setDepth(45),
      move: this.add.text(78, 754, '', small).setOrigin(0.5).setDepth(45),
      formation: this.add.text(W / 2, 662, 'LINE', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', fontStyle: '900', color: C.cyan, align: 'center' }).setOrigin(0.5).setDepth(45),
      pause: this.add.text(W - 43, 26, 'Ⅱ', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', fontStyle: '900', color: C.mist, align: 'center' }).setOrigin(0.5).setDepth(45),
      pauseOverlay: this.add.text(W / 2, 408, 'PAUSED\n\nP / TAP PAUSE TO RESUME\nR TO RETURN TO HANGAR', { fontFamily: 'system-ui, sans-serif', fontSize: '18px', fontStyle: '900', color: C.white, align: 'center', lineSpacing: 10 }).setOrigin(0.5).setDepth(101).setVisible(false),
      banner: this.add.text(W / 2, 390, '', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', fontStyle: '900', color: C.white, align: 'center' }).setOrigin(0.5).setDepth(96),
      bannerSub: this.add.text(W / 2, 414, '', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', fontStyle: '800', color: C.mist, align: 'center' }).setOrigin(0.5).setDepth(96),
      result: this.add.text(W / 2, 390, '', { fontFamily: 'system-ui, sans-serif', fontSize: '16px', fontStyle: '900', color: C.white, align: 'center', lineSpacing: 8 }).setOrigin(0.5).setDepth(98),
      menu: this.add.text(W / 2, 168, '', { fontFamily: 'system-ui, sans-serif', fontSize: '12px', fontStyle: '800', color: C.mist, align: 'center', lineSpacing: 6 }).setOrigin(0.5).setDepth(98),
      menuRun: this.add.text(W / 2, 382, '', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', fontStyle: '900', color: C.cyan, align: 'center' }).setOrigin(0.5).setDepth(98),
      menuTrial: this.add.text(W / 2, 450, '', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', fontStyle: '900', color: C.violet, align: 'center' }).setOrigin(0.5).setDepth(98),
      menuFinale: this.add.text(W / 2, 534, '', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', fontStyle: '900', color: C.gold, align: 'center' }).setOrigin(0.5).setDepth(98),
      menuHint: this.add.text(W / 2, 610, '', { fontFamily: 'system-ui, sans-serif', fontSize: '11px', fontStyle: '800', color: C.mist, align: 'center' }).setOrigin(0.5).setDepth(98),
      menuTitle: this.add.text(W / 2, 83, 'VANGUARD FOUR', { fontFamily: 'system-ui, sans-serif', fontSize: '30px', fontStyle: '900', color: C.white, align: 'center' }).setOrigin(0.5).setDepth(98),
      menuSub: this.add.text(W / 2, 112, 'FOUR SIGNALS. ONE LINE. NO ONE LEFT BEHIND.', { fontFamily: 'system-ui, sans-serif', fontSize: '10px', fontStyle: '800', color: C.cyan, align: 'center' }).setOrigin(0.5).setDepth(98),
      footer: this.add.text(W / 2, 792, 'DRAG LEFT TO MOVE  •  HOLD STRIKE  •  K SUPER  •  P PAUSE', { fontFamily: 'system-ui, sans-serif', fontSize: '10px', fontStyle: '700', color: C.mist, align: 'center' }).setOrigin(0.5).setDepth(98)
    };
    this.cardTexts = HEROES.map(function (d, i) { return this.add.text(0, 0, d.name + '\n' + d.title, { fontFamily: 'system-ui, sans-serif', fontSize: '11px', fontStyle: '900', color: d.css, align: 'center', lineSpacing: 4 }).setOrigin(0.5).setDepth(98).setVisible(false); }, this);
    this.menuHero = 0; this.hidePlayDisplay();
  };

  MainScene.prototype.bootMenu = function () {
    this.mode = 'menu'; this.run = null; this.playerPaused = false; this.clearPools(); this.hidePlayDisplay();
    this.t.logo.setVisible(true); this.t.fleet.setVisible(true);
    setTextIfChanged(this.t.menu, 'SELECT A HERO\nTHEN CHOOSE A DEPLOYMENT BAND');
    setTextIfChanged(this.t.footer, 'DRAG LEFT TO MOVE  •  HOLD STRIKE  •  K SUPER  •  P PAUSE');
    setTextIfChanged(this.t.menuRun, 'VANGUARD RUN  /  ENDLESS');
    setTextIfChanged(this.t.menuTrial, 'HERO TRIAL  /  ' + (this.menuHero === 0 ? 'RHEA' : HEROES[this.menuHero].name));
    setTextIfChanged(this.t.menuFinale, 'FINALE ASSAULT  /  ' + (profile.finale ? 'UNLOCKED' : 'LOCKED'));
    setTextIfChanged(this.t.menuHint, 'TAP HERO CARD  •  TAP A BAND  •  O FOR OPTIONS');
    this.t.menu.setVisible(true); this.t.menuRun.setVisible(true); this.t.menuTrial.setVisible(true); this.t.menuFinale.setVisible(true); this.t.menuHint.setVisible(true); this.t.menuTitle.setVisible(true); this.t.menuSub.setVisible(true); this.t.footer.setVisible(true);
    for (var i = 0; i < 4; i++) {
      var x = 50 + i * 96; this.cardTexts[i].setPosition(x, 292).setVisible(true);
      this.cardTexts[i].setText((i === this.menuHero ? '◆ ' : '') + HEROES[i].name + '\n' + HEROES[i].title + '\n' + (i === 0 || profile.trials[i - 1] >= 3 ? 'TRIAL READY' : 'CHAIN LOCK'));
    }
    kit.audio.stopMusic(180);
  };

  MainScene.prototype.hidePlayDisplay = function () {
    this.heroSprites.forEach(function (s) { s.setVisible(false); });
    this.enemySprites.forEach(function (s) { s.setVisible(false); });
    this.pickupSprites.forEach(function (s) { s.setVisible(false); });
    this.rosterSprites.forEach(function (s) { s.setVisible(false); });
    this.particleSprites.forEach(function (s) { s.setVisible(false); });
    this.hazardSprites.forEach(function (s) { s.setVisible(false); }); this.boltSprites.forEach(function (s) { s.setVisible(false); });
    this.cardTexts.forEach(function (s) { s.setVisible(false); });
    this.roomSprite.setVisible(false);
    this.t.logo.setVisible(false); this.t.fleet.setVisible(false); this.t.room.setVisible(false); this.t.score.setVisible(false); this.t.mode.setVisible(false); this.t.roster.setVisible(false); this.t.coach.setVisible(false); this.t.super.setVisible(false); this.t.strike.setVisible(false); this.t.finisher.setVisible(false); this.t.superBtn.setVisible(false); this.t.move.setVisible(false); this.t.formation.setVisible(false); this.t.pause.setVisible(false); this.t.pauseOverlay.setVisible(false); this.t.banner.setVisible(false); this.t.bannerSub.setVisible(false); this.t.result.setVisible(false); this.t.menuRun.setVisible(false); this.t.menuTrial.setVisible(false); this.t.menuFinale.setVisible(false); this.t.menuHint.setVisible(false);
  };

  MainScene.prototype.startSelected = function (mode, hero) {
    if (mode === 'finale' && !profile.finale) return;
    if (mode === 'trial' && hero > 0 && profile.trials[hero - 1] < 3) return;
    this.mode = mode; this.t.menu.setVisible(false); this.t.menuRun.setVisible(false); this.t.menuTrial.setVisible(false); this.t.menuFinale.setVisible(false); this.t.menuHint.setVisible(false); this.t.menuTitle.setVisible(false); this.t.menuSub.setVisible(false); this.t.footer.setVisible(false); this.cardTexts.forEach(function (s) { s.setVisible(false); });
    this.showPlayDisplay(); newRun(mode, hero);
  };

  MainScene.prototype.showPlayDisplay = function () {
    this.t.logo.setVisible(false); this.t.fleet.setVisible(false); this.t.mode.setVisible(false);
    this.t.room.setVisible(true); this.t.score.setVisible(true); this.t.roster.setVisible(false); this.t.coach.setVisible(true); this.t.super.setVisible(true); this.t.strike.setVisible(true); this.t.finisher.setVisible(false); this.t.superBtn.setVisible(true); this.t.move.setVisible(false); this.t.formation.setVisible(true); this.t.pause.setVisible(true); this.roomSprite.setVisible(true);
  };

  MainScene.prototype.clearPools = function () {
    for (var i = 0; i < this.enemies.length; i++) this.enemies[i].active = false;
    for (var j = 0; j < this.pickups.length; j++) this.pickups[j].active = false;
    for (var k = 0; k < this.bolts.length; k++) this.bolts[k].active = false;
    for (var p = 0; p < this.particles.length; p++) this.particles[p].active = false;
    for (var h = 0; h < this.hazards.length; h++) this.hazards[h].active = false;
  };

  MainScene.prototype.pool = function (arr, max, factory) {
    for (var i = 0; i < arr.length; i++) if (!arr[i].active) { arr[i].active = true; return arr[i]; }
    if (arr.length >= max) return null;
    var o = factory(); o.active = true; arr.push(o); return o;
  };

  MainScene.prototype.pointBlocked = function (x, y, radius) {
    var obstacles = (this.run && this.run.roomSet && this.run.roomSet.obstacles) || [];
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      if (x > o.x - radius && x < o.x + o.w + radius && y > o.y - radius && y < o.y + o.h + radius) return true;
    }
    return false;
  };

  MainScene.prototype.resolveTerrain = function (body, radius) {
    body.x = clamp(body.x, ARENA.x + radius, ARENA.x + ARENA.w - radius);
    body.y = clamp(body.y, ARENA.y + radius, ARENA.y + ARENA.h - radius);
    var obstacles = (this.run && this.run.roomSet && this.run.roomSet.obstacles) || [];
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      if (body.x <= o.x - radius || body.x >= o.x + o.w + radius || body.y <= o.y - radius || body.y >= o.y + o.h + radius) continue;
      var left = Math.abs(body.x - (o.x - radius)), right = Math.abs(body.x - (o.x + o.w + radius));
      var top = Math.abs(body.y - (o.y - radius)), bottom = Math.abs(body.y - (o.y + o.h + radius));
      var edge = Math.min(left, right, top, bottom);
      if (edge === left) body.x = o.x - radius;
      else if (edge === right) body.x = o.x + o.w + radius;
      else if (edge === top) body.y = o.y - radius;
      else body.y = o.y + o.h + radius;
      body.vx *= 0.35; body.vy *= 0.35;
    }
  };

  MainScene.prototype.startRoom = function (room, first) {
    if (!this.run) return;
    var forced = this.run.debugWarden || debugApi.forceWarden;
    this.run.room = Math.max(1, room | 0); this.run.roomT = 0; this.run.clearing = false; this.run.clearT = 0; this.run.spawnQueue.length = 0; this.run.roomNoWipe = true; this.run.roomCombo = 0; this.run.debugWarden = forced;
    for (var i = 0; i < this.enemies.length; i++) this.enemies[i].active = false;
    for (var j = 0; j < this.bolts.length; j++) this.bolts[j].active = false;
    for (var k = 0; k < this.hazards.length; k++) this.hazards[k].active = false;
    var trial = TRIALS[this.run.trialHero] || TRIALS[0];
    var setIndex = this.run.mode === 'finale' ? (this.run.room === 1 ? 0 : this.run.room === 2 ? 2 : 4) : (this.run.room % 5 === 0 || forced ? 3 : (this.run.mode === 'trial' ? trial.set : (this.run.room - 1) % 3));
    this.run.roomSet = ROOM_SETS[setIndex] || ROOM_SETS[0];
    this.roomSprite.setTexture('room-' + this.run.roomSet.id).setVisible(true);
    for (var reset = 0; reset < this.heroes.length; reset++) {
      var hero = this.heroes[reset]; hero.x = ARENA.x + ARENA.w * (0.23 + reset * 0.18); hero.y = ARENA.y + ARENA.h * 0.72; hero.vx = 0; hero.vy = 0; hero.stun = 0;
      this.resolveTerrain(hero, 18);
    }
    var boss = forced || (this.run.mode === 'run' && this.run.room % 5 === 0) || (this.run.mode === 'finale' && this.run.room === 3);
    var mix = this.run.roomSet.mix || ROOM_SETS[0].mix;
    var count = boss ? 7 + Math.min(7, Math.floor(this.run.room / 3)) : Math.min(22, 5 + Math.floor(this.run.room * 1.7));
    for (var n = 0; n < count; n++) {
      var edge = Math.floor(this.run.rng() * 4), sx = ARENA.x + 24 + this.run.rng() * (ARENA.w - 48), sy = ARENA.y + 24 + this.run.rng() * (ARENA.h - 48), tries = 0;
      if (edge === 0) sy = ARENA.y + 22; else if (edge === 1) sx = ARENA.x + ARENA.w - 22; else if (edge === 2) sy = ARENA.y + ARENA.h - 22; else sx = ARENA.x + 22;
      while (this.pointBlocked(sx, sy, 18) && tries++ < 8) { sx = ARENA.x + 24 + this.run.rng() * (ARENA.w - 48); sy = ARENA.y + 24 + this.run.rng() * (ARENA.h - 48); }
      this.run.spawnQueue.push({ t: 0.25 + n * (boss ? 0.18 : 0.22), type: choose(mix, this.run.rng), x: sx, y: sy, active: true });
    }
    if (boss) this.run.spawnQueue.push({ t: boss && count > 9 ? 1.4 : 0.9, type: 'warden', x: ARENA.x + ARENA.w / 2, y: ARENA.y + 80, active: true });
    this.spawnPickup('super', ARENA.x + 55, ARENA.y + ARENA.h * 0.5);
    this.spawnPickup('health', ARENA.x + ARENA.w - 55, ARENA.y + ARENA.h * 0.5);
    this.spawnPickup('score', ARENA.x + ARENA.w * 0.5, ARENA.y + ARENA.h - 70);
    this.run.rescue = this.run.roomSet.id === 'foundry' ? { x: ARENA.x + 45, y: ARENA.y + 58, found: false, p: 0 } : null;
    this.run.uiActive = null; this.run.uiQueue.length = 0;
    if (boss) kit.audio.sfx('warden-roar');
    if (!first) kit.audio.sfx('room-clear');
  };

  MainScene.prototype.queueTransient = function (kind, title, sub, color, duration) {
    if (!this.run) return;
    var item = { kind: kind, title: title, sub: sub || '', color: color || P.white, age: 0, duration: duration || 1.0 };
    if (!this.run.uiActive) this.run.uiActive = item;
    else {
      if (this.run.uiQueue.length >= 4) this.run.uiQueue.shift();
      this.run.uiQueue.push(item);
    }
  };
  MainScene.prototype.sayBoundary = function (title, sub, color, duration) {
    var item = { kind: 'boundary', title: title, sub: sub || '', color: color || P.white, age: 0, duration: duration || 1.2 };
    if (this.run && this.run.uiActive && this.run.uiActive.kind === 'toast') { this.run.uiQueue.unshift(this.run.uiActive); this.run.uiActive = item; }
    else this.queueTransient('boundary', title, sub, color, duration || 1.2);
  };
  MainScene.prototype.sayToast = function (title, color, duration) {
    this.queueTransient('toast', title, '', color, duration || 0.9);
  };
  MainScene.prototype.updateTransient = function (dt) {
    if (!this.run) return;
    if (!this.run.uiActive) { this.run.uiActive = this.run.uiQueue.shift() || null; return; }
    this.run.uiActive.age += dt;
    if (this.run.uiActive.age > this.run.uiActive.duration) this.run.uiActive = this.run.uiQueue.shift() || null;
  };

  MainScene.prototype.spawnEnemy = function (type, x, y) {
    var d = ENEMIES[type] || ENEMIES.husk, e = this.pool(this.enemies, MAX_ENEMIES, function () { return {}; });
    if (!e) return;
    var scale = d.boss ? 1 + Math.max(0, this.run.room - 5) * 0.06 : 1 + Math.max(0, this.run.room - 1) * 0.055;
    e.type = type; e.x = x; e.y = y; e.vx = 0; e.vy = 0; e.hp = d.hp * scale; e.maxHp = e.hp; e.r = d.r; e.a = Math.PI / 2; e.cd = 0.5 + this.run.rng() * 0.9; e.stun = 0; e.flash = 0; e.contact = 0; e.state = 'move'; e.wind = 0; e.activeT = 0; e.attack = ''; e.attackHit = false; e.phase = 0; e.def = d;
    this.emit('telegraph', x, y, d.color, d.boss ? 8 : 4);
  };

  MainScene.prototype.spawnPickup = function (type, x, y) {
    var q = this.pool(this.pickups, MAX_PICKUPS, function () { return {}; });
    if (!q) return; q.type = type; q.x = x; q.y = y; q.life = 18; q.bob = this.run ? this.run.rng() * TAU : 0; q.value = type === 'score' ? 100 : 0;
  };

  MainScene.prototype.spawnBolt = function (x, y, a, speed, damage) {
    var b = this.pool(this.bolts, MAX_BOLTS, function () { return {}; });
    if (!b) return; b.x = x; b.y = y; b.vx = Math.cos(a) * speed; b.vy = Math.sin(a) * speed; b.life = 3; b.damage = damage; b.r = 5;
  };

  MainScene.prototype.emit = function (kind, x, y, color, count) {
    for (var i = 0; i < (count || 4); i++) {
      var p = this.pool(this.particles, MAX_PARTICLES, function () { return {}; });
      if (!p) return; var a = (this.run ? this.run.rng() : Math.random()) * TAU, s = 35 + (this.run ? this.run.rng() : Math.random()) * 150;
      p.kind = kind; p.x = x; p.y = y; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s; p.life = kind === 'super' ? 0.5 : 0.26 + (this.run ? this.run.rng() : Math.random()) * 0.35; p.max = p.life; p.size = kind === 'super' ? 1.45 : kind === 'telegraph' ? 1.2 : 0.72 + (this.run ? this.run.rng() : Math.random()) * 0.55; p.rotation = a; p.color = color || P.white;
    }
  };

  MainScene.prototype.getScreenPoint = function (p) {
    var r = this.game.canvas.getBoundingClientRect();
    return { x: (p.x - r.left) * W / Math.max(1, r.width), y: (p.y - r.top) * H / Math.max(1, r.height) };
  };

  MainScene.prototype.zoneForPoint = function (p) {
    if (p.x >= 302 && p.y >= 10 && p.y < 58) return 'pause';
    if (p.y >= 58 && p.y < 114 && p.x >= 12 && p.x < W - 12) return 'roster';
    if (p.y >= 646 && p.y < 684 && p.x >= 132 && p.x < 258) return 'formation';
    if (p.x >= 270 && p.y >= 680) return 'strike';
    if (p.x >= 154 && p.x < 266 && p.y >= 680) return 'super';
    if (p.x < 266 && p.y >= 140 && p.y < 680) return 'move';
    if (p.x < 154 && p.y >= 680) return 'move';
    return 'none';
  };

  MainScene.prototype.readGamepad = function () {
    var empty = { x: 0, y: 0, strike: false, super: false, prev: false, next: false, pause: false, restart: false };
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return empty;
    var pads = navigator.getGamepads(), padState = pads && pads[0];
    if (!padState) return empty;
    var ax = padState.axes && padState.axes[0] || 0, ay = padState.axes && padState.axes[1] || 0;
    var mag = Math.sqrt(ax * ax + ay * ay);
    if (mag < 0.16) { ax = 0; ay = 0; }
    return {
      x: clamp(ax, -1, 1), y: clamp(ay, -1, 1), strike: !!(padState.buttons[0] && padState.buttons[0].pressed),
      super: !!(padState.buttons[1] && padState.buttons[1].pressed),
      prev: !!(padState.buttons[4] && padState.buttons[4].pressed), next: !!(padState.buttons[5] && padState.buttons[5].pressed),
      pause: !!(padState.buttons[9] && padState.buttons[9].pressed), restart: !!(padState.buttons[8] && padState.buttons[8].pressed)
    };
  };

  MainScene.prototype.togglePlayerPause = function () {
    if (!this.run || this.run.state !== 'play') return;
    this.playerPaused = !this.playerPaused;
    this.t.pauseOverlay.setVisible(this.playerPaused);
    kit.input.clearAll();
    if (this.playerPaused) kit.audio.suspend();
    else { kit.audio.resume(); this.prevStrike = false; this.prevSuper = false; this.prevTerminalKey = false; }
  };

  MainScene.prototype.restartFromPause = function () {
    if (!this.playerPaused || !this.run) return;
    kit.restart();
  };

  MainScene.prototype.cycleFormation = function (direction) {
    if (!this.run || this.run.state !== 'play') return;
    this.run.formation = (this.run.formation + direction + FORMATIONS.length) % FORMATIONS.length;
    var f = FORMATIONS[this.run.formation];
    this.emit('formation', this.heroes[this.activeHero].x, this.heroes[this.activeHero].y, HEROES[this.activeHero].color, 16);
    kit.audio.sfx('formation-shift', { rate: 0.9 + this.run.formation * 0.12 });
    this.sayToast('FORMATION · ' + f.label, HEROES[this.activeHero].color, 0.9);
  };

  MainScene.prototype.readInput = function () {
    var moveX = 0, moveY = 0, moveMag = 0, strike = false, superHeld = false, now = 0, self = this, moveAnchor = { x: 78, y: 754 }, gp = this.readGamepad();
    kit.input.pointers.forEach(function (raw) {
      var p = self.getScreenPoint(raw); raw.vfX = p.x; raw.vfY = p.y;
      now = Math.max(now, raw.downAt || 0);
      if (!raw.zone) { var start = self.getScreenPoint({ x: raw.startX, y: raw.startY }); raw.zone = self.zoneForPoint(start); raw.vfStartX = start.x; raw.vfStartY = start.y; }
      if (raw.zone === 'move') {
        moveAnchor = { x: raw.vfStartX, y: raw.vfStartY };
        if (moveAnchor.y >= 680) moveAnchor = { x: 78, y: 754 };
        var dx = p.x - moveAnchor.x, dy = p.y - moveAnchor.y, m = Math.sqrt(dx * dx + dy * dy), cap = 54;
        if (m > 2) { moveX = clamp(dx / cap, -1, 1); moveY = clamp(dy / cap, -1, 1); moveMag = clamp(m / cap, 0, 1); }
      } else if (raw.zone === 'strike') strike = true;
      else if (raw.zone === 'super') superHeld = true;
      else if (raw.zone === 'formation' && raw.vfActionAt !== raw.downAt) { raw.vfActionAt = raw.downAt; self.cycleFormation(1); }
      else if (raw.zone === 'roster' && raw.vfActionAt !== raw.downAt) { raw.vfActionAt = raw.downAt; var slot = Math.floor((self.getScreenPoint({ x: raw.startX, y: raw.startY }).x - 12) / ((W - 24) / 4)); self.swapHero(slot, false); }
      else if (raw.zone === 'pause' && raw.vfActionAt !== raw.downAt) { raw.vfActionAt = raw.downAt; self.togglePlayerPause(); }
    });
    var keyboardMove = false;
    if (kit.input.keyDown('ArrowLeft') || kit.input.keyDown('KeyA')) { moveX -= 1; keyboardMove = true; }
    if (kit.input.keyDown('ArrowRight') || kit.input.keyDown('KeyD')) { moveX += 1; keyboardMove = true; }
    if (kit.input.keyDown('ArrowUp') || kit.input.keyDown('KeyW')) { moveY -= 1; keyboardMove = true; }
    if (kit.input.keyDown('ArrowDown') || kit.input.keyDown('KeyS')) { moveY += 1; keyboardMove = true; }
    if (gp.x || gp.y) { moveX = gp.x; moveY = gp.y; moveMag = clamp(Math.sqrt(gp.x * gp.x + gp.y * gp.y), 0, 1); }
    if (moveX || moveY) { var len = Math.sqrt(moveX * moveX + moveY * moveY) || 1; moveX /= len; moveY /= len; if (keyboardMove) moveMag = 1; }
    strike = strike || kit.input.keyDown('KeyJ') || kit.input.keyDown('Space') || gp.strike;
    superHeld = superHeld || kit.input.keyDown('KeyK') || gp.super;
    var q = kit.input.keyDown('KeyQ'), e = kit.input.keyDown('KeyE');
    if (q && !this.prevKeys.KeyQ || gp.prev && !this.prevGamepadPrev) this.cycleFormation(-1);
    if (e && !this.prevKeys.KeyE || gp.next && !this.prevGamepadNext) this.cycleFormation(1);
    this.prevKeys.KeyQ = q; this.prevKeys.KeyE = e; this.prevGamepadPrev = gp.prev; this.prevGamepadNext = gp.next;
    if ((kit.input.keyDown('KeyP') && !this.prevPause) || (gp.pause && !this.prevGamepadPause)) this.togglePlayerPause();
    if ((kit.input.keyDown('KeyR') && !this.prevRestart) || (gp.restart && !this.prevGamepadRestart)) this.restartFromPause();
    this.prevPause = kit.input.keyDown('KeyP'); this.prevRestart = kit.input.keyDown('KeyR'); this.prevGamepadPause = gp.pause; this.prevGamepadRestart = gp.restart;
    this.inputSnapshot = { moveX: moveX, moveY: moveY, mag: moveMag, strike: strike, super: superHeld, newest: now, anchorX: moveAnchor.x, anchorY: moveAnchor.y };
  };

  MainScene.prototype.swapHero = function (i, silent) {
    if (!this.heroes[i] || this.heroes[i].downed || i === this.activeHero) return;
    var from = this.activeHero; this.activeHero = i;
    this.emit('swap', this.heroes[i].x, this.heroes[i].y, HEROES[i].color, 10);
    if (!silent) kit.audio.sfx('super-charge', { volume: 0.2, rate: 1.7 });
    this.sayToast('CONTROL · ' + HEROES[from].name + ' → ' + HEROES[i].name, HEROES[i].color, 0.9);
  };

  MainScene.prototype.step = function (dt) {
    if (!this.run || this.simPaused) return;
    readDebug(this);
    if (this.playerPaused) { this.readPauseInput(); this.updateDebugState(); return; }
    this.readInput();
    if (this.playerPaused) { this.updateDebugState(); return; }
    var r = this.run; r.time += dt; r.stateT += dt;
    if (r.state === 'wipe' || r.state === 'result') { this.handleTerminalInput(); this.updateParticles(dt); this.updateDebugState(); return; }
    this.updateTransient(dt);
    if (r.flash > 0) r.flash -= dt; if (r.damageFlash > 0) r.damageFlash -= dt; if (r.synergyT > 0) r.synergyT -= dt;
    if (r.comboT > 0) r.comboT -= dt; else r.combo = 0;
    this.updateTutorial(dt);
    this.updateSpawns(dt); this.updateHeroes(dt); this.updateEnemies(dt); this.updateBolts(dt); this.updatePickups(dt); this.updateHazards(dt); this.updateRescue(dt); this.updateParticles(dt); this.updateAudioLayer();
    if (!r.clearing && this.liveEnemies() === 0 && this.pendingSpawns() === 0) this.beginClear();
    if (r.clearing) { r.clearT += dt; if (r.clearT > 1.25) this.advanceRoom(); }
    this.updateDebugState();
  };

  MainScene.prototype.readPauseInput = function () {
    var pKey = kit.input.keyDown('KeyP'), rKey = kit.input.keyDown('KeyR'), gp = this.readGamepad();
    if ((pKey && !this.prevPause) || (gp.pause && !this.prevGamepadPause)) this.togglePlayerPause();
    if ((rKey && !this.prevRestart) || (gp.restart && !this.prevGamepadRestart)) this.restartFromPause();
    this.prevPause = pKey; this.prevRestart = rKey; this.prevGamepadPause = gp.pause; this.prevGamepadRestart = gp.restart;
    kit.input.pointers.forEach(function (raw) {
      if ((raw.downAt || 0) <= this.lastPauseTap) return;
      this.lastPauseTap = raw.downAt || 0;
      var start = this.getScreenPoint({ x: raw.startX, y: raw.startY });
      if (this.zoneForPoint(start) === 'pause') this.togglePlayerPause();
    }, this);
  };

  MainScene.prototype.updateSpawns = function (dt) {
    var q = this.run.spawnQueue;
    for (var i = 0; i < q.length; i++) if (q[i].active) { q[i].t -= dt; if (q[i].t <= 0) { q[i].active = false; this.spawnEnemy(q[i].type, q[i].x, q[i].y); } }
  };
  MainScene.prototype.updateAudioLayer = function () {
    var danger = this.liveEnemies() >= 8 || this.enemies.some(function (e) { return e.active && e.def && e.def.boss; });
    if (danger === this.run.audioDanger) return;
    this.run.audioDanger = danger;
    kit.audio.music(danger ? 'music-danger' : 'music-base', 650);
  };
  MainScene.prototype.updateTutorial = function (dt) {
    var r = this.run;
    if (r.room !== 1 || r.clearing || r.tutorialT > 42) return;
    r.tutorialT += dt;
    var step = tutorialStepAt(r.tutorialT);
    this.t.coach.setText(step ? step.step.text : '');
  };
  MainScene.prototype.pendingSpawns = function () { var n = 0; for (var i = 0; i < this.run.spawnQueue.length; i++) if (this.run.spawnQueue[i].active) n++; return n; };
  MainScene.prototype.liveEnemies = function () { var n = 0; for (var i = 0; i < this.enemies.length; i++) if (this.enemies[i].active) n++; return n; };

  MainScene.prototype.updateHeroes = function (dt) {
    var input = this.inputSnapshot, strikeEdge = input.strike && !this.prevStrike, superEdge = input.super && !this.prevSuper;
    if (this.run.clearing) { strikeEdge = false; superEdge = false; }
    for (var i = 0; i < this.heroes.length; i++) {
      var h = this.heroes[i], d = HEROES[i]; h.cd -= dt; h.comboT -= dt; h.inv -= dt; h.flash -= dt; h.stun -= dt; h.hitPulse -= dt; if (h.finisherT > 0) h.finisherT -= dt;
      if (h.finisher && h.finisherT <= 0) h.finisher = false;
      if (h.downed) { h.vx *= 0.9; h.vy *= 0.9; h.x += h.vx * dt; h.y += h.vy * dt; continue; }
      if (h.superT > 0) { h.superT -= dt; h.x += h.vx * dt; h.y += h.vy * dt; h.vx *= 0.9; h.vy *= 0.9; continue; }
      var mvx = i === this.activeHero ? input.moveX : 0, mvy = i === this.activeHero ? input.moveY : 0, mag = i === this.activeHero ? input.mag : 0;
      if (i !== this.activeHero) { var bot = this.botMove(h, dt); mvx = bot.x; mvy = bot.y; mag = bot.mag; if (bot.revive && h.cd <= 0) this.botRevive(h, bot.revive); }
      if (i === this.activeHero && strikeEdge) this.startStrike(h);
      if (i === this.activeHero && input.strike) {
        h.hold += dt;
        if (h.combo >= 3 && h.hold > 0.38 && !h.finisher && h.cd <= 0) this.startFinisher(h);
        else if (!h.finisher && h.strike <= 0 && h.cd <= 0 && h.hold > 0.08) this.startStrike(h);
      } else if (i === this.activeHero) h.hold = 0;
      if (i === this.activeHero && superEdge) this.activateSuper(h);
      if (h.strike > 0) h.strike -= dt;
      if (h.cd <= 0 && h.strike <= 0 && i !== this.activeHero && (h.comboT <= 0 || h.combo === 0)) this.startStrike(h);
      if (h.stun > 0) continue;
      var sp = d.speed * (h.finisher ? 0.3 : 1), accel = 1 - Math.pow(0.001, dt);
      h.vx += (mvx * sp * mag - h.vx) * accel; h.vy += (mvy * sp * mag - h.vy) * accel;
      if (mag > 0.1) h.a = Math.atan2(mvy, mvx);
      h.x += h.vx * dt; h.y += h.vy * dt; h.vx *= Math.pow(0.03, dt); h.vy *= Math.pow(0.03, dt);
      this.resolveTerrain(h, 18);
      this.updateReviveTarget(h, dt);
      if (h.strike > 0) this.hitWithStrike(h);
    }
    this.prevStrike = input.strike; this.prevSuper = input.super;
    this.handleKeySwaps();
  };

  MainScene.prototype.handleKeySwaps = function () {
    var keys = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];
    for (var i = 0; i < keys.length; i++) { var down = kit.input.keyDown(keys[i]); if (down && !this.prevKeys[keys[i]]) this.swapHero(i, false); this.prevKeys[keys[i]] = down; }
    var m = kit.input.keyDown('KeyM'); if (m && !this.prevKeys.KeyM) kit.audio.setMute(!kit.audio.prefs.mute); this.prevKeys.KeyM = m;
  };

  MainScene.prototype.botMove = function (h) {
    var down = null, best = 1e9, livingBots = 0;
    for (var i = 0; i < this.heroes.length; i++) { var other = this.heroes[i]; if (other.downed) { var dd = dist2(h, other); if (dd < best) { best = dd; down = other; } } else if (other.i !== this.activeHero) livingBots++; }
    if (down && best < 155 * 155) { var ddx = down.x - h.x, ddy = down.y - h.y, dl = Math.sqrt(ddx * ddx + ddy * ddy) || 1; return { x: ddx / dl, y: ddy / dl, mag: clamp(dl / 70, 0.35, 1), revive: down }; }
    var goal = this.formationGoal(h.i), gx = goal.x - h.x, gy = goal.y - h.y, gd = Math.sqrt(gx * gx + gy * gy) || 1;
    var target = null, bd = 1e9;
    for (var j = 0; j < this.enemies.length; j++) if (this.enemies[j].active) { var de = dist2(h, this.enemies[j]); if (de < bd) { bd = de; target = this.enemies[j]; } }
    var formation = FORMATIONS[this.run.formation];
    if (gd > 48 && (!target || formation.id !== 'vanguard' || bd > 120 * 120)) return { x: gx / gd, y: gy / gd, mag: clamp(gd / 70, 0.35, 1) };
    if (!target) return { x: gx / gd, y: gy / gd, mag: clamp(gd / 70, 0.25, 0.8) };
    var dx = target.x - h.x, dy = target.y - h.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    var desired = h.i === 2 ? 115 : 58;
    if (formation.id === 'orbit') desired = h.i === 2 || h.i === 3 ? 128 : 74;
    if (formation.id === 'vanguard') desired = h.i === 1 ? 48 : h.i === 2 ? 98 : 62;
    if (d < desired) { dx = -dx; dy = -dy; }
    return { x: dx / d, y: dy / d, mag: 0.82 };
  };

  MainScene.prototype.formationGoal = function (heroIndex) {
    var leader = this.heroes[this.activeHero], formation = FORMATIONS[this.run.formation] || FORMATIONS[0];
    if (!leader || heroIndex === this.activeHero) return leader || { x: 195, y: 500 };
    var slot = 1;
    for (var i = 0; i < this.heroes.length; i++) { if (i === this.activeHero) continue; if (i === heroIndex) break; slot++; }
    var off = formation.offsets[slot] || formation.offsets[1], rightX = -Math.sin(leader.a), rightY = Math.cos(leader.a), backX = -Math.cos(leader.a), backY = -Math.sin(leader.a);
    return { x: leader.x + rightX * off[0] + backX * off[1], y: leader.y + rightY * off[0] + backY * off[1] };
  };

  MainScene.prototype.botRevive = function (h, target) { if (dist2(h, target) < 42 * 42) { h.reviveTarget = target.i; h.reviveP += STEP / 1.65; if (h.reviveP >= 1) this.reviveHero(target); } else { h.reviveTarget = -1; h.reviveP = 0; } };
  MainScene.prototype.updateReviveTarget = function (h) {
    if (h.reviveTarget < 0) return;
    var target = this.heroes[h.reviveTarget]; if (!target || !target.downed) { h.reviveTarget = -1; h.reviveP = 0; }
  };
  MainScene.prototype.reviveHero = function (h) {
    if (!h || !h.downed) return; h.downed = false; h.hp = Math.round(h.maxHp * 0.52); h.inv = 1.2; h.reviveP = 0; h.reviveTarget = -1; this.emit('revive', h.x, h.y, HEROES[h.i].color, 18); kit.audio.sfx('revive-chime'); this.sayToast(HEROES[h.i].name + ' REVIVED', HEROES[h.i].color, 0.9);
  };

  MainScene.prototype.startStrike = function (h) {
    if (h.downed || h.superT > 0 || h.cd > 0 || h.stun > 0) return;
    h.hold = 0; h.finisher = false; h.combo = h.comboT > 0 ? (h.combo % 3) + 1 : 1; h.comboT = 0.86; h.strike = h.i === 2 ? 0.18 : 0.13; h.strikeKind = h.combo === 3 ? 2 : 1; h.cd = h.combo === 3 ? 0.34 : 0.22; h.hitPulse = 0.08;
    if (h.i === 0) { h.vx += Math.cos(h.a) * 105; h.vy += Math.sin(h.a) * 105; kit.audio.sfx('dash-step', { rate: 1 + h.combo * 0.08 }); }
    else if (h.i === 1) kit.audio.sfx('gravity-pull', { rate: 0.92 + h.combo * 0.05 });
    else if (h.i === 2) kit.audio.sfx('arc-cast', { rate: 0.9 + h.combo * 0.06 });
    else kit.audio.sfx('chain-zap', { rate: 0.9 + h.combo * 0.06 });
    this.emit('strike', h.x + Math.cos(h.a) * 18, h.y + Math.sin(h.a) * 18, HEROES[h.i].color, 7);
  };
  MainScene.prototype.startFinisher = function (h) { h.finisher = true; h.finisherT = 0.34; h.strike = 0.24; h.strikeKind = 3; h.cd = 0.52; h.combo = 0; h.comboT = 0; h.hold = 0; if (this.run.mode === 'trial' && this.run.trialHero === 0) this.run.trialStats.finisher = true; this.emit('super', h.x, h.y, HEROES[h.i].color, 16); kit.audio.sfx('super-release', { volume: 0.42, rate: 0.65 + h.i * 0.06 }); };
  MainScene.prototype.registerCombatHit = function (h) {
    var r = this.run;
    if (r.synergyT > 0 && r.lastHeroHit !== h.i) { r.score += 30; this.emit('formation', h.x, h.y, P.gold, 8); }
    r.combo = Math.min(99, r.combo + 1); r.comboT = 1.25; r.roomCombo += 1; r.maxCombo = Math.max(r.maxCombo, r.combo); r.lastHeroHit = h.i; r.synergyT = 0.72;
  };
  MainScene.prototype.hitWithStrike = function (h) {
    if (h.hitPulse <= 0) return; h.hitPulse = 0;
    var range = h.strikeKind === 3 ? 96 : 56, damage = h.strikeKind === 3 ? 36 : h.strikeKind === 2 ? 21 : 13, hit = 0, i, e, d, ang;
    if (h.i === 3) {
      var chain = [], first = null, firstD = 1e9;
      for (i = 0; i < this.enemies.length; i++) { e = this.enemies[i]; if (!e.active) continue; d = Math.sqrt(dist2(h, e)); ang = Math.atan2(e.y - h.y, e.x - h.x); if (d < 78 + e.r && Math.abs(this.angleDiff(ang, h.a)) < 1.15 && d < firstD) { first = e; firstD = d; } }
      if (first) chain.push(first);
      while (chain.length > 0 && chain.length < (h.strikeKind === 3 ? 4 : 3)) {
        var from = chain[chain.length - 1], next = null, nextD = 1e9;
        for (i = 0; i < this.enemies.length; i++) { e = this.enemies[i]; if (!e.active || chain.indexOf(e) >= 0) continue; d = Math.sqrt(dist2(from, e)); if (d < 112 && d < nextD) { next = e; nextD = d; } }
        if (!next) break; chain.push(next);
      }
      for (i = 0; i < chain.length; i++) { e = chain[i]; this.damageEnemy(e, damage, h, 95, Math.atan2(e.y - h.y, e.x - h.x)); hit += 1; if (i) this.emit('formation', e.x, e.y, P.cyan, 5); }
      if (this.run.mode === 'trial' && this.run.trialHero === 3) this.run.trialStats.chainHits += chain.length;
    } else {
      for (i = 0; i < this.enemies.length; i++) {
        e = this.enemies[i]; if (!e.active) continue; d = Math.sqrt(dist2(h, e)); ang = Math.atan2(e.y - h.y, e.x - h.x);
        var valid = false, reach = range;
        if (h.i === 0) valid = d < reach + e.r && Math.abs(this.angleDiff(ang, h.a)) < (h.strikeKind === 3 ? 1.6 : 0.9);
        else if (h.i === 1) valid = d < (h.strikeKind === 3 ? 126 : 92) + e.r;
        else if (h.i === 2) { reach = h.strikeKind === 3 ? 172 : 142; valid = d < reach + e.r && Math.abs(this.angleDiff(ang, h.a)) < (h.strikeKind === 3 ? 1.18 : 0.82); }
        if (!valid) continue;
        if (h.i === 1) { e.vx -= Math.cos(ang) * 135; e.vy -= Math.sin(ang) * 135; if (this.run.mode === 'trial' && this.run.trialHero === 1) this.run.trialStats.gravityPulls += 1; }
        this.damageEnemy(e, h.i === 2 ? Math.round(damage * 0.9) : damage, h, h.i === 0 ? 210 : h.i === 1 ? 120 : 80, ang); hit += 1;
      }
    }
    if (hit) { h.meter = clamp(h.meter + (h.strikeKind === 3 ? 15 : 7) + hit * 2, 0, 100); this.registerCombatHit(h); }
  };
  MainScene.prototype.angleDiff = function (a, b) { var d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

  MainScene.prototype.activateSuper = function (h) {
    if (h.meter < 100 || h.superT > 0 || h.downed) return;
    h.meter = 0; h.superT = 1.0; h.superHit = false; h.inv = 1.1; this.run.flash = 0.38; this.run.shake = 10; kit.juice.shake(9, 180); this.sayToast(HEROES[h.i].superName, HEROES[h.i].color, 0.9); kit.audio.sfx('super-charge'); kit.audio.sfx('super-release');
    this.emit('super', h.x, h.y, HEROES[h.i].color, 35);
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i]; if (!e.active) continue; var ea = Math.atan2(e.y - h.y, e.x - h.x), ed = Math.sqrt(dist2(h, e)), dmg = h.i === 1 ? 48 : h.i === 2 ? 36 : h.i === 0 ? 44 : 40;
      if (h.i === 0 && (ed > 210 || Math.abs(this.angleDiff(ea, h.a)) > 1.25)) continue;
      if (h.i === 1) { e.vx -= Math.cos(ea) * 240; e.vy -= Math.sin(ea) * 240; }
      if (h.i === 3 && ed > 250) continue;
      this.damageEnemy(e, dmg, h, h.i === 1 ? 380 : 180, ea);
    }
    for (var j = 0; j < this.heroes.length; j++) if (h.i === 2) this.heroes[j].hp = clamp(this.heroes[j].hp + 32, 0, this.heroes[j].maxHp);
    if (h.i === 2 && this.run.mode === 'trial' && this.run.trialHero === 2) this.run.trialStats.superHeal = true;
    if (h.i === 1) this.emit('formation', ARENA.x + ARENA.w / 2, ARENA.y + ARENA.h / 2, P.violet, 22);
  };

  MainScene.prototype.damageEnemy = function (e, damage, src, knock, ang) {
    if (!e.active) return; if (e.type === 'bracer' && Math.abs(this.angleDiff(ang + Math.PI, e.a)) < 1.0) damage *= 0.35;
    e.hp -= damage; e.flash = 0.1; e.vx += Math.cos(ang) * knock * (e.def.boss ? 0.08 : 0.5); e.vy += Math.sin(ang) * knock * (e.def.boss ? 0.08 : 0.5); e.stun = Math.max(e.stun || 0, e.def.boss ? 0.08 : 0.18); this.emit('hit', e.x, e.y, e.def.color, 5);
    if (e.hp <= 0) this.killEnemy(e, src);
  };
  MainScene.prototype.killEnemy = function (e, src) {
    e.active = false; this.run.kills += 1; var multiplier = 1 + clamp(this.run.combo, 0, 12) * 0.1; var earned = Math.round(e.def.score * multiplier); this.run.score += earned; this.emit(e.def.boss ? 'super' : 'death', e.x, e.y, e.def.color, e.def.boss ? 42 : 18); kit.juice.hitStop(e.def.boss ? 90 : 42); this.spawnPickup(e.def.boss ? 'super' : (this.run.kills % 3 === 0 ? 'health' : this.run.kills % 2 ? 'score' : 'super'), e.x, e.y); this.flushBest();
    if (src) src.meter = clamp(src.meter + (e.def.boss ? 25 : 5) * (HEROES[src.i] || HEROES[0]).meter, 0, 100);
    if (e.def.boss) { this.run.bossClears += 1; profile.finale = true; kit.save.set(profile); kit.audio.sfx('warden-roar', { rate: 0.72 }); this.sayToast('WARDEN DOWN', P.gold, 0.9); this.run.flash = 0.5; this.run.shake = 18; kit.juice.shake(16, 260); }
  };
  MainScene.prototype.flushBest = function () { if (!this.run) return; profile.best = Math.max(profile.best, Math.floor(this.run.score)); kit.save.set(profile); };
  MainScene.prototype.damageHero = function (h, damage, ang, knock) {
    if (h.downed || h.inv > 0 || h.superT > 0) return; h.hp -= damage; h.flash = 0.16; h.inv = 0.58; h.stun = 0.08; h.vx += Math.cos(ang) * knock; h.vy += Math.sin(ang) * knock; h.meter = clamp(h.meter + damage * 1.1, 0, 100); this.emit('hurt', h.x, h.y, P.red, 8); kit.audio.sfx('hero-hurt', { volume: 0.75, rate: 0.9 + h.i * 0.05 });
    if (h.i === this.activeHero) { this.run.damageFlash = 0.24; this.run.shake = 5; kit.juice.shake(4, 100); }
    if (h.hp <= 0) this.downHero(h);
  };
  MainScene.prototype.prepareTerminal = function () { this.run.terminalAt = typeof performance !== 'undefined' ? performance.now() : Date.now(); this.prevTerminalKey = kit.input.keyDown('Enter') || kit.input.keyDown('Space'); kit.input.clearAll(); };
  MainScene.prototype.downHero = function (h) {
    h.hp = 0; h.downed = true; h.vx = 0; h.vy = 0; h.reviveP = 0; h.reviveTarget = -1; this.run.roomNoWipe = false; this.run.noWipe = false; this.run.combo = 0; this.run.comboT = 0; kit.juice.shake(7, 160); this.sayToast(HEROES[h.i].name + ' DOWN', P.red, 0.9); this.emit('hurt', h.x, h.y, P.red, 14);
    if (h.i === this.activeHero) { for (var i = 0; i < this.heroes.length; i++) if (!this.heroes[i].downed) { this.swapHero(i, true); break; } }
    var all = true; for (var j = 0; j < this.heroes.length; j++) if (!this.heroes[j].downed) all = false; if (all) { this.flushBest(); this.run.state = 'wipe'; this.run.stateT = 0; this.prepareTerminal(); kit.audio.sfx('warden-roar', { volume: 0.35, rate: 1.25 }); }
  };

  MainScene.prototype.updateEnemies = function (dt) {
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i]; if (!e.active) continue; var d = e.def; e.cd -= dt; e.stun = Math.max(0, (e.stun || 0) - dt); e.flash -= dt; e.contact -= dt;
      if (e.stun > 0) { e.vx *= Math.pow(0.01, dt); e.vy *= Math.pow(0.01, dt); continue; }
      var target = this.nearestHero(e); if (!target) continue; var dx = target.x - e.x, dy = target.y - e.y, len = Math.sqrt(dx * dx + dy * dy) || 1, a = Math.atan2(dy, dx); e.a = a;
      if (d.boss) { this.updateWarden(e, target, dt); continue; }
      if (e.type === 'lobber') { if (len > 120 && e.cd <= 0) { this.spawnBolt(e.x, e.y, a, 112, d.hit); e.cd = 1.45; this.emit('telegraph', e.x, e.y, d.color, 4); } if (len < 90) { e.vx -= dx / len * d.speed * dt * 1.4; e.vy -= dy / len * d.speed * dt * 1.4; } }
      else if (e.type === 'sapper') { if (len < 44 && e.cd <= 0) { this.spawnHazard(e.x, e.y, 48, 0.62, d.hit); e.active = false; continue; } e.vx += dx / len * d.speed * dt * 1.8; e.vy += dy / len * d.speed * dt * 1.8; }
      else { e.vx += dx / len * d.speed * dt * (e.type === 'skitter' ? 2.2 : 1.5); e.vy += dy / len * d.speed * dt * (e.type === 'skitter' ? 2.2 : 1.5); }
      e.x += e.vx * dt; e.y += e.vy * dt; e.vx *= Math.pow(0.03, dt); e.vy *= Math.pow(0.03, dt); this.resolveTerrain(e, e.r);
      if (len < e.r + 18 && e.contact <= 0) { this.damageHero(target, d.hit, a, 80); e.contact = 0.7; }
    }
  };
  MainScene.prototype.nearestHero = function (e) { var best = null, bd = 1e9; for (var i = 0; i < this.heroes.length; i++) { var h = this.heroes[i]; if (h.downed) continue; var d = dist2(e, h); if (d < bd) { bd = d; best = h; } } return best; };
  MainScene.prototype.updateWarden = function (e, target, dt) {
    if (e.state === 'move') { if (e.cd <= 0) { e.state = 'wind'; e.wind = 0.95; e.attack = e.phase % 2 ? 'sweep' : 'ring'; e.attackHit = false; e.phase += 1; kit.audio.sfx('super-charge', { volume: 0.28, rate: 0.55 }); } else { var dx = target.x - e.x, dy = target.y - e.y, len = Math.sqrt(dx * dx + dy * dy) || 1; e.vx += dx / len * e.def.speed * dt; e.vy += dy / len * e.def.speed * dt; e.x += e.vx * dt; e.y += e.vy * dt; e.vx *= Math.pow(0.02, dt); e.vy *= Math.pow(0.02, dt); this.resolveTerrain(e, 55); } }
    else if (e.state === 'wind') { e.wind -= dt; if (e.wind <= 0) { e.state = 'active'; e.activeT = 0.3; e.attackHit = false; kit.audio.sfx('super-release', { rate: 0.7 }); } }
    else if (e.state === 'active') { e.activeT -= dt; if (!e.attackHit) { e.attackHit = true; if (e.attack === 'ring') { for (var i = 0; i < this.heroes.length; i++) { var h = this.heroes[i], dd = Math.sqrt(dist2(h, e)); if (Math.abs(dd - 126) < 24) this.damageHero(h, e.def.hit, Math.atan2(h.y - e.y, h.x - e.x), 180); } } else { for (var j = 0; j < this.heroes.length; j++) { var hh = this.heroes[j], aa = Math.atan2(hh.y - e.y, hh.x - e.x), dd2 = Math.sqrt(dist2(hh, e)); if (dd2 < 230 && Math.abs(this.angleDiff(aa, e.a)) < 0.48) this.damageHero(hh, e.def.hit, aa, 220); } } } if (e.activeT <= 0) { e.state = 'recover'; e.cd = 1.15; } }
    else { e.cd -= dt; if (e.cd <= 0) e.state = 'move'; }
  };

  MainScene.prototype.spawnHazard = function (x, y, r, life, damage) { var h = this.pool(this.hazards, 18, function () { return {}; }); if (!h) return; h.x = x; h.y = y; h.r = r; h.life = life; h.max = life; h.damage = damage; h.hit = false; this.emit('telegraph', x, y, P.red, 10); };
  MainScene.prototype.updateHazards = function (dt) { for (var i = 0; i < this.hazards.length; i++) { var h = this.hazards[i]; if (!h.active) continue; h.life -= dt; if (!h.hit && h.life < h.max * 0.45) { h.hit = true; for (var j = 0; j < this.heroes.length; j++) if (Math.sqrt(dist2(h, this.heroes[j])) < h.r) this.damageHero(this.heroes[j], h.damage, 0, 90); } if (h.life <= 0) h.active = false; } };
  MainScene.prototype.updateBolts = function (dt) { for (var i = 0; i < this.bolts.length; i++) { var b = this.bolts[i]; if (!b.active) continue; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; if (b.life <= 0 || b.x < ARENA.x || b.x > ARENA.x + ARENA.w || b.y < ARENA.y || b.y > ARENA.y + ARENA.h) { b.active = false; continue; } for (var j = 0; j < this.heroes.length; j++) if (!this.heroes[j].downed && Math.sqrt(dist2(b, this.heroes[j])) < b.r + 13) { this.damageHero(this.heroes[j], b.damage, Math.atan2(b.vy, b.vx), 80); b.active = false; break; } } };
  MainScene.prototype.updatePickups = function (dt) { for (var i = 0; i < this.pickups.length; i++) { var q = this.pickups[i]; if (!q.active) continue; q.life -= dt; q.bob += dt * 3; if (q.life <= 0) { q.active = false; continue; } for (var j = 0; j < this.heroes.length; j++) { var h = this.heroes[j]; if (h.downed) continue; if (Math.sqrt(dist2(q, h)) < 26) { if (q.type === 'super') h.meter = clamp(h.meter + 24, 0, 100); else if (q.type === 'health') h.hp = clamp(h.hp + 30, 0, h.maxHp); else { var pickupScore = Math.round(q.value * (1 + clamp(this.run.combo, 0, 12) * 0.1)); this.run.score += pickupScore; } this.emit('pickup', q.x, q.y, q.type === 'health' ? P.mint : q.type === 'super' ? P.cyan : P.gold, 10); kit.audio.sfx('pickup-chime', { rate: 0.92 + j * 0.04 }); q.active = false; break; } } } };
  MainScene.prototype.updateRescue = function (dt) { var r = this.run.rescue, h = this.heroes[this.activeHero]; if (!r || r.found || !h || h.downed) return; if (dist2(r, h) < 42 * 42) { r.p += dt; if (r.p > 0.5) { r.found = true; this.run.rescueFound = true; this.spawnPickup('health', r.x + 26, r.y); this.spawnPickup('super', r.x + 26, r.y + 35); this.sayToast('CACHE FOUND', P.mint, 0.9); this.emit('revive', r.x, r.y, P.mint, 20); kit.audio.sfx('revive-chime'); } } else r.p = Math.max(0, r.p - dt * 0.5); };
  MainScene.prototype.updateParticles = function (dt) { for (var i = 0; i < this.particles.length; i++) { var p = this.particles[i]; if (!p.active) continue; p.life -= dt; if (p.life <= 0) { p.active = false; continue; } p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(0.05, dt); p.vy *= Math.pow(0.05, dt); } };

  MainScene.prototype.beginClear = function () { if (this.run.clearing) return; this.run.clearing = true; this.run.clearT = 0; this.run.roomsCleared += 1; var medal = this.roomMedal(); this.run.score += medal * 180; profile.best = Math.max(profile.best, Math.floor(this.run.score)); kit.save.set(profile); var label = medal === 3 ? 'GOLD MEDAL' : medal === 2 ? 'SILVER MEDAL' : 'BRONZE MEDAL'; this.sayBoundary('ROOM CLEAR', label + ' · COMBO ' + this.run.roomCombo, medal === 3 ? P.gold : medal === 2 ? P.white : P.orange, 1.2); kit.audio.sfx('room-clear'); this.emit('super', ARENA.x + ARENA.w / 2, ARENA.y + ARENA.h / 2, this.run.roomSet.accent, 18); if (this.run.room % 5 === 0) this.run.bossClears += 0; };
  MainScene.prototype.roomMedal = function () { if (!this.run.roomNoWipe && this.run.roomCombo < 4) return 1; if (this.run.roomNoWipe && this.run.roomCombo >= 8) return 3; if (this.run.roomNoWipe) return 2; return 1; };
  MainScene.prototype.advanceRoom = function () { if (this.run.mode === 'trial' && this.run.room >= TRIALS[this.run.trialHero].rooms) { this.finishTrial(); return; } if (this.run.mode === 'finale' && this.run.room >= 3) { this.finishFinale(); return; } this.startRoom(this.run.room + 1, false); };
  MainScene.prototype.trialGoalMet = function () {
    if (this.run.mode !== 'trial') return true;
    var s = this.run.trialStats;
    return this.run.trialHero === 0 ? s.finisher : this.run.trialHero === 1 ? s.gravityPulls >= 3 : this.run.trialHero === 2 ? s.superHeal : s.chainHits >= 3;
  };
  MainScene.prototype.finishTrial = function () { var i = this.run.trialHero, goal = this.trialGoalMet(), medal = this.roomMedal(); if (!goal) medal = Math.min(medal, 1); profile.trials[i] = Math.max(profile.trials[i], goal ? medal : 0); this.run.resultNote = goal ? (medal === 3 ? 'NEXT HERO UNLOCKED' : 'REPEAT FOR GOLD') : 'GOAL MISSED'; this.flushBest(); this.run.state = 'result'; this.run.stateT = 0; this.prepareTerminal(); };
  MainScene.prototype.finishFinale = function () { this.run.resultNote = 'VANGUARD FOUR HOLDS THE LINE'; this.flushBest(); this.run.state = 'result'; this.run.stateT = 0; this.prepareTerminal(); };
  MainScene.prototype.handleTerminalInput = function () {
    var newTap = false, terminalAt = this.run.terminalAt || 0;
    kit.input.pointers.forEach(function (p) { if ((p.downAt || 0) > terminalAt && (p.downAt || 0) > this.lastTerminalTap) { this.lastTerminalTap = p.downAt || 0; newTap = true; } }, this);
    var enter = kit.input.keyDown('Enter') || kit.input.keyDown('Space'), freshKey = enter && !this.prevTerminalKey; this.prevTerminalKey = enter;
    if (!newTap && !freshKey) return;
    kit.input.clearAll();
    if (this.run.state === 'wipe') newRun(this.run.mode, this.run.trialHero);
    else if (this.run.state === 'result') this.bootMenu();
  };

  MainScene.prototype.updateDebugState = function () {
    debugState.mode = this.run ? (this.run.state === 'play' ? this.run.mode : this.run.state) : this.mode; debugState.room = this.run ? this.run.room : 0; debugState.activeHero = this.activeHero; debugState.superMeter = this.heroes[this.activeHero] ? Math.round(this.heroes[this.activeHero].meter) : 0; debugState.score = this.run ? Math.floor(this.run.score) : 0; debugState.forceRoom = debugApi.forceRoom; debugState.forceWarden = debugApi.forceWarden;
  };

  MainScene.prototype.update = function (_time, delta) {
    if (this.simPaused) return;
    if (kit.juice.frame().frozen) { this.render(); return; }
    this.acc += Math.max(0, Math.min(0.25, delta / 1000));
    var steps = 0;
    while (this.acc >= STEP && steps < MAX_STEPS) { this.step(STEP); this.acc -= STEP; steps++; }
    this.render();
  };

  MainScene.prototype.render = function () {
    this.worldFx.clear(); this.entityFx.clear(); this.uiFx.clear(); this.overlayFx.clear();
    if (this.mode === 'menu') { this.renderMenu(); return; }
    if (!this.run) return;
    this.renderArena(); this.renderEntities(); this.renderHud(); this.renderFlash(); this.renderTransient();
    if (this.run.state === 'wipe' || this.run.state === 'result') this.renderResult();
    if (this.playerPaused) { this.overlayFx.fillStyle(P.ink, 0.9); this.overlayFx.fillRoundedRect(34, 252, W - 68, 312, 18); this.overlayFx.lineStyle(2, P.cyan, 0.8); this.overlayFx.strokeRoundedRect(34, 252, W - 68, 312, 18); }
  };

  MainScene.prototype.renderMenu = function () {
    this.overlayFx.fillStyle(P.ink, 0.48); this.overlayFx.fillRect(26, 140, W - 52, 485); this.overlayFx.lineStyle(2, P.cyan, 0.55); this.overlayFx.strokeRoundedRect(26, 140, W - 52, 485, 18);
    for (var i = 0; i < 4; i++) { var x = 50 + i * 96, d = HEROES[i]; this.uiFx.fillStyle(d.color, i === this.menuHero ? 0.25 : 0.13); this.uiFx.fillRoundedRect(x - 38, 238, 76, 108, 12); this.uiFx.lineStyle(i === this.menuHero ? 2 : 1, d.color, 0.85); this.uiFx.strokeRoundedRect(x - 38, 238, 76, 108, 12); }
    var bands = [{ y: 356, h: 50, color: P.cyan }, { y: 420, h: 50, color: P.violet }, { y: 504, h: 58, color: P.gold }];
    for (var b = 0; b < bands.length; b++) { var band = bands[b]; this.uiFx.fillStyle(band.color, 0.12); this.uiFx.fillRoundedRect(48, band.y, W - 96, band.h, 12); this.uiFx.lineStyle(2, band.color, 0.65); this.uiFx.strokeRoundedRect(48, band.y, W - 96, band.h, 12); }
    this.uiFx.fillStyle(P.board2, 0.75); this.uiFx.fillRoundedRect(64, 695, W - 128, 44, 10); this.uiFx.lineStyle(1, P.line, 0.75); this.uiFx.strokeRoundedRect(64, 695, W - 128, 44, 10);
  };

  MainScene.prototype.renderArena = function () {
    var set = this.run.roomSet || ROOM_SETS[0], pulse = kit.juice.enabled ? 0.5 + Math.sin(this.run.time * 2) * 0.2 : 0.5;
    this.worldFx.lineStyle(2, set.accent, 0.55); this.worldFx.strokeRoundedRect(21, 143, W - 42, 500, 12);
    if (this.run.rescue) { var rr = this.run.rescue, ra = rr.found ? 0.25 : 0.62 + pulse * 0.18; this.worldFx.fillStyle(P.mint, ra * 0.16); this.worldFx.fillRoundedRect(rr.x - 23, rr.y - 23, 46, 46, 9); this.worldFx.lineStyle(2, P.mint, ra); this.worldFx.strokeRoundedRect(rr.x - 23, rr.y - 23, 46, 46, 9); this.worldFx.lineStyle(2, P.white, ra * 0.8); this.worldFx.lineBetween(rr.x - 10, rr.y, rr.x + 10, rr.y); this.worldFx.lineBetween(rr.x, rr.y - 10, rr.x, rr.y + 10); }
    var obstacles = set.obstacles || [];
    for (var oi = 0; oi < obstacles.length; oi++) { var ob = obstacles[oi]; this.worldFx.fillStyle(set.accent, 0.15 + pulse * 0.04); this.worldFx.fillRoundedRect(ob.x, ob.y, ob.w, ob.h, 7); this.worldFx.lineStyle(2, set.accent, 0.62); this.worldFx.strokeRoundedRect(ob.x, ob.y, ob.w, ob.h, 7); }
    for (var k = 0; k < this.hazardSprites.length; k++) { var hs = this.hazardSprites[k], hz = this.hazards[k]; if (!hz || !hz.active) { hs.setVisible(false); continue; } var ha = clamp(hz.life / hz.max, 0.15, 0.85); hs.setTexture('fx-hazard').setPosition(hz.x, hz.y).setScale(hz.r / 32 * (1.05 + Math.sin(this.run.time * 10) * 0.04)).setAlpha(ha).setVisible(true); }
    for (var b = 0; b < this.boltSprites.length; b++) { var bs = this.boltSprites[b], bolt = this.bolts[b]; if (!bolt || !bolt.active) { bs.setVisible(false); continue; } bs.setTexture('fx-bolt').setPosition(bolt.x, bolt.y).setRotation(Math.atan2(bolt.vy, bolt.vx)).setVisible(true); }
    for (var e = 0; e < this.enemies.length; e++) { var en = this.enemies[e]; if (!en.active || !en.def.boss) continue; if (en.state === 'wind') { if (en.attack === 'ring') { this.worldFx.lineStyle(3, P.rose, 0.7); this.worldFx.strokeCircle(en.x, en.y, 126); this.worldFx.lineStyle(1, P.white, 0.45); this.worldFx.strokeCircle(en.x, en.y, 104); this.worldFx.strokeCircle(en.x, en.y, 148); } else { this.worldFx.lineStyle(6, P.rose, 0.34); this.worldFx.lineBetween(en.x, en.y, en.x + Math.cos(en.a) * 230, en.y + Math.sin(en.a) * 230); this.worldFx.lineStyle(2, P.white, 0.75); this.worldFx.lineBetween(en.x, en.y, en.x + Math.cos(en.a) * 190, en.y + Math.sin(en.a) * 190); } } }
  };

  MainScene.prototype.renderEntities = function () {
    for (var i = 0; i < this.pickups.length; i++) { var q = this.pickups[i], qs = this.pickupSprites[i]; if (!q || !q.active) { qs.setVisible(false); continue; } qs.setTexture('pickup-' + q.type).setPosition(q.x, q.y + (kit.juice.enabled ? Math.sin(q.bob) * 4 : 0)).setScale(0.85).setVisible(true); }
    for (var j = 0; j < this.enemySprites.length; j++) { var es = this.enemySprites[j], e = this.enemies[j]; if (!e || !e.active) { es.setVisible(false); continue; } es.setTexture('enemy-' + e.type).setPosition(e.x, e.y).setScale(e.r / 22 * (kit.juice.enabled ? 1 + Math.sin(this.run.time * 5 + j) * 0.035 : 1)).setAlpha(e.flash > 0 ? 0.5 : 1).setVisible(true); this.entityFx.fillStyle(P.shadow, 0.85); this.entityFx.fillRect(e.x - e.r, e.y - e.r - 10, e.r * 2, 4); this.entityFx.fillStyle(e.def.boss ? P.gold : P.red, 1); this.entityFx.fillRect(e.x - e.r, e.y - e.r - 10, e.r * 2 * clamp(e.hp / e.maxHp, 0, 1), 4); }
    for (var h = 0; h < this.heroes.length; h++) { var hero = this.heroes[h], hs = this.heroSprites[h], moving = Math.abs(hero.vx) + Math.abs(hero.vy) > 18, frame = hero.downed ? 5 : hero.flash > 0 ? 4 : hero.superT > 0 ? 3 : hero.strike > 0 ? 2 + Math.floor(this.run.time * 16) % 2 : moving ? 1 + Math.floor(this.run.time * 8 + h) % 2 : 0; hs.setCrop(frame * 64, 0, 64, 64).setPosition(hero.x, hero.y).setRotation(hero.a).setAlpha(hero.downed ? 0.56 : hero.inv > 0 && Math.floor(this.run.time * 18) % 2 ? 0.45 : 1).setVisible(true); if (h === this.activeHero && !hero.downed) { this.entityFx.lineStyle(2, HEROES[h].color, 0.8); this.entityFx.strokeCircle(hero.x, hero.y, 28 + Math.sin(this.run.time * 5) * 2); } if (hero.strike > 0) { this.entityFx.lineStyle(hero.strikeKind === 3 ? 6 : 3, HEROES[h].color, 0.75); this.entityFx.arc(hero.x, hero.y, hero.strikeKind === 3 ? 78 : 54, hero.a - 0.85, hero.a + 0.85); } }
    for (var r = 0; r < this.heroes.length; r++) { var ally = this.heroes[r]; if (ally.reviveTarget >= 0 && ally.reviveP > 0) { var target = this.heroes[ally.reviveTarget]; if (target && target.downed) { this.entityFx.lineStyle(2, HEROES[r].color, 0.8); this.entityFx.strokeCircle(target.x, target.y, 24 + ally.reviveP * 10); this.entityFx.lineStyle(4, P.white, 0.8); this.entityFx.arc(target.x, target.y, 30, -Math.PI / 2, -Math.PI / 2 + ally.reviveP * TAU); } } }
    for (var p = 0; p < this.particles.length; p++) { var pt = this.particles[p], ps = this.particleSprites[p]; if (!pt || !pt.active) { ps.setVisible(false); continue; } var alpha = clamp(pt.life / pt.max, 0, 1); ps.setTexture(particleTexture(pt.kind)).setPosition(pt.x, pt.y).setRotation(pt.rotation || 0).setScale(pt.size * (0.7 + alpha * 0.65)).setTint(pt.color || P.white).setAlpha(alpha).setVisible(true); }
  };

  MainScene.prototype.renderHud = function () {
    var h = this.heroes[this.activeHero], d = HEROES[this.activeHero], r = this.run, set = r.roomSet || ROOM_SETS[0];
    setTextIfChanged(this.t.room, 'R' + pad(r.room, 2)); setColorIfChanged(this.t.room, colorCss(set.accent)); setTextIfChanged(this.t.score, '✦ ' + fmt(r.score)); setTextIfChanged(this.t.super, '✦'); setColorIfChanged(this.t.super, h.meter >= 100 ? C.gold : d.css);
    for (var ri = 0; ri < HEROES.length; ri++) {
      var rx = 78 + ri * 78, rh = this.heroes[ri], down = rh && rh.downed, active = ri === this.activeHero;
      this.uiFx.fillStyle(HEROES[ri].color, active ? 0.2 : 0.07); this.uiFx.fillRoundedRect(rx - 28, 68, 56, 42, 8); this.uiFx.lineStyle(active ? 2 : 1, HEROES[ri].color, down ? 0.28 : 0.72); this.uiFx.strokeRoundedRect(rx - 28, 68, 56, 42, 8);
      this.rosterSprites[ri].setPosition(rx, 87).setAlpha(down ? 0.3 : 1).setVisible(true);
      this.uiFx.fillStyle(P.shadow, 0.9); this.uiFx.fillRoundedRect(rx - 23, 105, 46, 3, 2); this.uiFx.fillStyle(down ? P.red : HEROES[ri].color, down ? 0.55 : 1); this.uiFx.fillRoundedRect(rx - 23, 105, 46 * (down ? 0 : clamp(rh.hp / rh.maxHp, 0, 1)), 3, 2);
      if (down) { this.uiFx.fillStyle(P.red, 0.9); this.uiFx.fillCircle(rx + 16, 77, 7); }
      this.cardTexts[ri].setVisible(false);
    }
    this.uiFx.fillStyle(P.shadow, 0.9); this.uiFx.fillRoundedRect(242, 42, 112, 10, 5); this.uiFx.fillStyle(h.meter >= 100 ? P.gold : d.color, 1); this.uiFx.fillRoundedRect(242, 42, 112 * clamp(h.meter / 100, 0, 1), 10, 5);
    var tutorialStep = r.room === 1 && !r.clearing && r.tutorialT <= 42 ? tutorialStepAt(r.tutorialT) : null, tutorial = !!tutorialStep, uiBusy = !!r.uiActive, coachAlpha = 1;
    if (tutorialStep) { var coachAge = r.tutorialT - tutorialStep.start; coachAlpha = kit.juice.enabled ? clamp(1 - Math.max(0, coachAge - 3) / 0.9, 0.12, 1) : 1; }
    var coachVisible = tutorial && !uiBusy;
    setTextIfChanged(this.t.coach, tutorialStep ? tutorialStep.step.text : ''); this.t.coach.setAlpha(coachVisible ? coachAlpha : 0).setVisible(coachVisible);
    if (coachVisible) { this.uiFx.fillStyle(P.ink, 0.58 * coachAlpha); this.uiFx.fillRoundedRect(14, 115, W - 28, 21, 5); this.uiFx.lineStyle(1, d.color, 0.35 * coachAlpha); this.uiFx.strokeRoundedRect(14, 115, W - 28, 21, 5); }
    setTextIfChanged(this.t.formation, FORMATIONS[r.formation].label); setColorIfChanged(this.t.formation, colorCss(HEROES[this.activeHero].color));
    this.uiFx.fillStyle(P.rose, 0.15); this.uiFx.fillRoundedRect(W - 106, 688, 78, 88, 14); this.uiFx.lineStyle(2, P.rose, this.inputSnapshot.strike ? 1 : 0.75); this.uiFx.strokeRoundedRect(W - 106, 688, 78, 88, 14);
    this.uiFx.fillStyle(h.meter >= 100 ? P.gold : P.violet, 0.14); this.uiFx.fillRoundedRect(W - 214, 688, 78, 88, 14); this.uiFx.lineStyle(2, h.meter >= 100 ? P.gold : P.violet, this.inputSnapshot.super ? 1 : 0.72); this.uiFx.strokeRoundedRect(W - 214, 688, 78, 88, 14);
    var ax = this.inputSnapshot.anchorX || 78, ay = this.inputSnapshot.anchorY || 754; this.uiFx.fillStyle(P.board2, 0.78); this.uiFx.fillCircle(ax, ay, 43); this.uiFx.lineStyle(2, this.inputSnapshot.mag > 0 ? P.cyan : P.line, 0.85); this.uiFx.strokeCircle(ax, ay, 43); this.uiFx.fillStyle(P.cyan, 0.7); this.uiFx.fillCircle(ax + this.inputSnapshot.moveX * 28, ay + this.inputSnapshot.moveY * 28, 13);
    setColorIfChanged(this.t.strike, this.inputSnapshot.strike || h.finisher ? C.rose : C.white); setColorIfChanged(this.t.superBtn, h.meter >= 100 ? C.gold : C.white);
  };

  MainScene.prototype.renderFlash = function () {
    if (!this.run) return;
    if (kit.juice.enabled && this.run.flash > 0) { var d = HEROES[this.activeHero] || HEROES[0], alpha = clamp(this.run.flash / 0.5, 0, 0.16); this.overlayFx.fillStyle(this.run.bossClears > 0 ? P.gold : d.color, alpha); this.overlayFx.fillRect(0, 0, W, H); }
    if (this.run.damageFlash > 0) { var redAlpha = clamp(this.run.damageFlash / 0.24, 0, 0.34); this.overlayFx.fillStyle(P.red, redAlpha); this.overlayFx.fillRect(0, 0, W, 30); this.overlayFx.fillRect(0, H - 175, W, 175); this.overlayFx.fillRect(0, 0, 24, H); this.overlayFx.fillRect(W - 24, 0, 24, H); }
  };

  MainScene.prototype.renderTransient = function () {
    var active = this.run.uiActive;
    if (!active || this.run.state !== 'play') { this.t.banner.setVisible(false); this.t.bannerSub.setVisible(false); return; }
    var inT = clamp(active.age / 0.12, 0, 1), out = clamp((active.duration - active.age) / 0.2, 0, 1), alpha = kit.juice.enabled ? Math.min(inT, out) : 1;
    if (active.kind === 'boundary' && this.run.clearing) {
      var boxW = 216, boxH = 64, bx = (W - boxW) / 2, by = 364;
      this.overlayFx.fillStyle(P.ink, 0.9 * alpha); this.overlayFx.fillRoundedRect(bx, by, boxW, boxH, 12); this.overlayFx.lineStyle(2, active.color, 0.9 * alpha); this.overlayFx.strokeRoundedRect(bx, by, boxW, boxH, 12);
      this.t.banner.setOrigin(0.5).setText(active.title).setPosition(W / 2, 387).setScale(1).setAlpha(alpha).setVisible(true); setColorIfChanged(this.t.banner, colorCss(active.color));
      this.t.bannerSub.setText(active.sub).setPosition(W / 2, 411).setScale(1).setAlpha(alpha).setVisible(true); setColorIfChanged(this.t.bannerSub, C.mist);
      return;
    }
    if (active.kind === 'toast') {
      this.overlayFx.fillStyle(P.ink, 0.86 * alpha); this.overlayFx.fillRoundedRect(14, 115, 242, 21, 5); this.overlayFx.lineStyle(1, active.color, 0.85 * alpha); this.overlayFx.strokeRoundedRect(14, 115, 242, 21, 5);
      this.t.banner.setOrigin(0, 0.5).setText(active.title).setPosition(24, 126).setScale(0.9).setAlpha(alpha).setVisible(true); setColorIfChanged(this.t.banner, colorCss(active.color)); this.t.bannerSub.setVisible(false);
      return;
    }
    this.t.banner.setVisible(false); this.t.bannerSub.setVisible(false);
  };

  MainScene.prototype.renderResult = function () {
    var wipe = this.run.state === 'wipe', medal = this.roomMedal(); this.overlayFx.fillStyle(P.ink, 0.88); this.overlayFx.fillRect(26, 182, W - 52, 360); this.overlayFx.lineStyle(2, wipe ? P.red : P.gold, 0.95); this.overlayFx.strokeRoundedRect(26, 182, W - 52, 360, 18); var title = wipe ? 'ALL SIGNALS LOST' : this.run.mode === 'trial' ? 'TRIAL REPORT' : this.run.mode === 'finale' ? 'ASSAULT REPORT' : 'REDEPLOY REPORT'; var body = wipe ? 'TAP TO REDEPLOY\nTHE RUN IS SEEDED AGAIN\nBEST ' + fmt(profile.best) : 'ROOMS ' + this.run.roomsCleared + '   /   SCORE ' + fmt(this.run.score) + '\nBEST ' + fmt(profile.best) + '\n' + (medal === 3 ? 'GOLD' : medal === 2 ? 'SILVER' : 'BRONZE') + ' ROOM MEDAL' + (this.run.resultNote ? '\n' + this.run.resultNote : '') + '\n' + (this.run.mode === 'run' && this.run.bossClears > 0 ? 'FINALE ASSAULT UNLOCKED' : 'TAP TO RETURN TO HANGAR'); setTextIfChanged(this.t.result, title + '\n\n' + body); setColorIfChanged(this.t.result, wipe ? C.red : C.white); this.t.result.setVisible(true);
  };

  MainScene.prototype.processMenuInput = function () {
    var tap = null, self = this;
    kit.input.pointers.forEach(function (p) { if ((p.downAt || 0) > self.lastTap) { self.lastTap = p.downAt || 0; tap = { x: p.vfX || 0, y: p.vfY || 0 }; } });
    if (!tap && kit.input.keyDown('Enter') && !this.prevKeys.Enter) tap = { x: W / 2, y: 380 };
    this.prevKeys.Enter = kit.input.keyDown('Enter');
    var options = kit.input.keyDown('KeyO') && !this.prevKeys.KeyO; this.prevKeys.KeyO = kit.input.keyDown('KeyO');
    if (options || (tap && tap.y >= 690)) { kit.openSettings(); return; }
    if (!tap) return;
    if (tap.y >= 230 && tap.y < 350) { this.menuHero = clamp(Math.floor((tap.x - 12) / ((W - 24) / 4)), 0, 3); this.bootMenu(); return; }
    if (tap.y >= 350 && tap.y < 412) { this.startSelected('run', this.menuHero); return; }
    if (tap.y >= 416 && tap.y < 480) { this.startSelected('trial', this.menuHero); return; }
    if (tap.y >= 498 && tap.y < 574) { if (profile.finale) this.startSelected('finale', this.menuHero); return; }
  };

  var config = { type: Phaser.AUTO, parent: 'game', width: W, height: H, backgroundColor: '#070b16', render: {}, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, input: { activePointers: 4 }, scene: MainScene };
  config.scale.width = Math.round(W * RETINA_FACTOR);
  config.scale.height = Math.round(H * RETINA_FACTOR);
  config.render = Object.assign({}, GGKit.renderDefaults, config.render || {});
  kit.loader.show('VANGUARD FOUR / FLEET F2');
  Game.phaser = new Phaser.Game(config);
  var oldUpdate = MainScene.prototype.update;
  MainScene.prototype.update = function (time, delta) { if (this.mode === 'menu') { this.readInput(); this.processMenuInput(); this.render(); return; } oldUpdate.call(this, time, delta); };
}());
