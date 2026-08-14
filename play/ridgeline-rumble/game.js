/* Ridgeline Rumble: original Phaser 3 lane brawler. */
(function bootRidgelineRumble() {
  'use strict';

  var FIXED_STEP = 1 / 60;
  var VIRTUAL_W = 960;
  var VIRTUAL_H = 540;
  var PLAY_TOP = 86;
  var PLAY_BOTTOM = 408;
  var LANE_Y = 270;
  var MAX_ENTITIES = 72;
  var MAX_PARTICLES = 96;
  var PARTICLE_SYSTEMS = ['dust', 'projectile', 'wave', 'terrain'];
  var PROFILE_DEFAULT = {
    wins: 0, losses: 0, streak: 0, bestStreak: 0, bestTime: 0,
    mastery: {}, trialMedals: [0, 0, 0, 0], ladderProgress: 0, lastHero: 0
  };

  var COLORS = {
    ink: '#07131e', deep: '#0b202b', slate: '#1a3540', bone: '#e9efd4',
    muted: '#9ab8ae', teal: '#43c7f4', tealDeep: '#2364aa', cyan: '#8ff4e0',
    coral: '#ff665c', wine: '#b72e4d', amber: '#e0a34a', gold: '#ffd36c',
    violet: '#c7a5ff', white: '#fff8dd', moss: '#788b5a'
  };

  var HEROES = [
    { id: 'mossjaw', name: 'MOSSJAW', role: 'GUARD', color: '#7fdb91', dark: '#285849', hp: 190, damage: 15, speed: 118, range: 92, abilities: [
      { key: 'J', icon: '⌁', name: 'ANCHOR', cd: 5.5, type: 'hook' },
      { key: 'K', icon: '◈', name: 'BULWARK', cd: 8, type: 'shield' },
      { key: 'L', icon: '✦', name: 'ROOTFALL', cd: 11, type: 'burst' }
    ] },
    { id: 'zip', name: 'ZIP', role: 'DASHER', color: '#ed80c0', dark: '#71385f', hp: 132, damage: 23, speed: 164, range: 105, abilities: [
      { key: 'J', icon: '›', name: 'BLINK', cd: 4.2, type: 'dash' },
      { key: 'K', icon: '×', name: 'CROSSCUT', cd: 6.5, type: 'line' },
      { key: 'L', icon: '✧', name: 'AFTERIMAGE', cd: 10, type: 'burst' }
    ] },
    { id: 'cinder', name: 'CINDER', role: 'ARC CASTER', color: '#ff9d68', dark: '#7a4239', hp: 124, damage: 19, speed: 108, range: 142, abilities: [
      { key: 'J', icon: '○', name: 'SUNFLARE', cd: 5, type: 'burst' },
      { key: 'K', icon: '∿', name: 'EMBERLINE', cd: 7, type: 'line' },
      { key: 'L', icon: '✹', name: 'SOLAR DROP', cd: 12, type: 'burstBig' }
    ] },
    { id: 'velune', name: 'VELUNE', role: 'MARKSMAN', color: '#f1d26e', dark: '#806a37', hp: 126, damage: 27, speed: 116, range: 205, abilities: [
      { key: 'J', icon: '→', name: 'LONG ECHO', cd: 4.8, type: 'shot' },
      { key: 'K', icon: '◇', name: 'PINPOINT', cd: 7, type: 'shotHard' },
      { key: 'L', icon: '⟫', name: 'SUNTHREAD', cd: 11, type: 'line' }
    ] },
    { id: 'halopearl', name: 'HALOPEARL', role: 'WARD SUPPORT', color: '#8cdde3', dark: '#2d6879', hp: 158, damage: 14, speed: 112, range: 125, abilities: [
      { key: 'J', icon: '+', name: 'SOFTWALL', cd: 5.5, type: 'shield' },
      { key: 'K', icon: '⌂', name: 'MEND', cd: 7.5, type: 'heal' },
      { key: 'L', icon: '◎', name: 'TIDELIGHT', cd: 12, type: 'burst' }
    ] },
    { id: 'ridgeback', name: 'RIDGEBACK', role: 'BRUISER', color: '#bd9af4', dark: '#533b80', hp: 178, damage: 21, speed: 126, range: 98, abilities: [
      { key: 'J', icon: '↻', name: 'WHEEL RUSH', cd: 5, type: 'spin' },
      { key: 'K', icon: '▣', name: 'STONE SKIN', cd: 7.5, type: 'shield' },
      { key: 'L', icon: '✦', name: 'RIDGE BREAK', cd: 11, type: 'burstBig' }
    ] }
  ];

  var LANES = {
    main: {
      id: 'main', name: 'RIDGELINE MAIN', place: 'MOSSFALL CAUSEWAY', feature: 'gust bridge',
      kind: 'main', limit: 240, wave: 18, towerHp: 620, goldRate: 2.2, hazard: 'gust',
      bg: '#102c35', mid: '#1c5149', route: '#315b4c', accent: '#9cd7a7'
    },
    tutorial: {
      id: 'tutorial', name: 'TRAINING RIDGE', place: 'MOSSFALL OUTLOOK', feature: 'checkpoint school',
      kind: 'tutorial', limit: 180, wave: 22, towerHp: 360, goldRate: 0, hazard: 'tutorial', heat: 0,
      bg: '#102b39', mid: '#286051', route: '#3c7057', accent: '#a9e2b6'
    },
    trial0: {
      id: 'trial0', name: 'HERO TRIAL I', place: 'QUIET CUT', feature: 'mirror stones',
      kind: 'trial', limit: 100, wave: 0, towerHp: 390, goldRate: 2.5, hazard: 'mirror',
      bg: '#172d3c', mid: '#39515b', route: '#5e6759', accent: '#e0c38a'
    },
    trial1: {
      id: 'trial1', name: 'HERO TRIAL II', place: 'LANTERN DIVIDE', feature: 'lantern gate',
      kind: 'trial', limit: 100, wave: 0, towerHp: 440, goldRate: 2.7, hazard: 'lantern',
      bg: '#2a2739', mid: '#51435a', route: '#6d5d53', accent: '#e89c73'
    },
    trial2: {
      id: 'trial2', name: 'HERO TRIAL III', place: 'SALT SWITCHBACK', feature: 'salt bloom',
      kind: 'trial', limit: 100, wave: 0, towerHp: 500, goldRate: 3, hazard: 'salt',
      bg: '#263643', mid: '#4f6670', route: '#68725f', accent: '#d8e4c0'
    },
    trial3: {
      id: 'trial3', name: 'HERO TRIAL IV', place: 'SUMMIT EYE', feature: 'cold crown',
      kind: 'trial', limit: 100, wave: 0, towerHp: 560, goldRate: 3.2, hazard: 'rime',
      bg: '#17313d', mid: '#426376', route: '#758279', accent: '#bce9e9'
    },
    ladder0: {
      id: 'ladder0', name: 'RUMBLE RUNG 01', place: 'EMBER RUN', feature: 'vent fields',
      kind: 'ladder', limit: 240, wave: 17, towerHp: 570, goldRate: 2.5, hazard: 'vents', heat: 1,
      bg: '#321f28', mid: '#6a3a35', route: '#765043', accent: '#f0a96e'
    },
    ladder1: {
      id: 'ladder1', name: 'RUMBLE RUNG 02', place: 'GLASS PASS', feature: 'shard wind',
      kind: 'ladder', limit: 240, wave: 16, towerHp: 680, goldRate: 2.7, hazard: 'shards', heat: 2,
      bg: '#1e283d', mid: '#405270', route: '#5c6478', accent: '#a9c9e4'
    },
    ladder2: {
      id: 'ladder2', name: 'RUMBLE RUNG 03', place: 'BLACK PINE RISE', feature: 'pine sentries',
      kind: 'ladder', limit: 240, wave: 15, towerHp: 790, goldRate: 2.9, hazard: 'pines', heat: 3,
      bg: '#172933', mid: '#2f564f', route: '#4e6555', accent: '#d0ba79'
    },
    summit: {
      id: 'summit', name: 'RIDGELINE SUMMIT', place: 'THE FAR CROWN', feature: 'storm crown',
      kind: 'summit', limit: 240, wave: 14, towerHp: 940, goldRate: 3.2, hazard: 'storm', heat: 5,
      bg: '#1a253d', mid: '#405273', route: '#5c6c74', accent: '#e2d4a1'
    }
  };

  var TRIALS = [
    { lane: 'trial0', name: 'QUIET CUT', foe: 5, time: '100s', unlock: 'OPEN' },
    { lane: 'trial1', name: 'LANTERN DIVIDE', foe: 2, time: '100s', unlock: 'BRONZE I' },
    { lane: 'trial2', name: 'SALT SWITCHBACK', foe: 3, time: '100s', unlock: 'BRONZE II' },
    { lane: 'trial3', name: 'SUMMIT EYE', foe: 0, time: '100s', unlock: 'BRONZE III' }
  ];

  var SHOP = [
    { id: 'iron', icon: '◆', name: 'BARK', cost: 90, effect: '+60 HP', color: '#e8aa63' },
    { id: 'coil', icon: '»', name: 'COIL', cost: 120, effect: '+18% SPD', color: '#79d9bf' },
    { id: 'lens', icon: '◉', name: 'LENS', cost: 150, effect: '+10 PWR', color: '#f58d8d' }
  ];

  function terrainLayout(hazard) {
    return [
      { id: 'west-ridge', label: 'HIGH RIDGE', x: 182, y: 188, w: 126, h: 78, speed: 1.08, damage: 1.10, defense: 0.92, range: 1.08, color: '#76d6a6', priority: 2 },
      { id: 'north-brush', label: 'BRUSH', x: 282, y: 112, w: 126, h: 58, speed: 0.90, damage: 1.02, defense: 0.82, range: 0.96, color: '#8aaa63', priority: 2 },
      { id: 'checkpoint', label: 'CHECKPOINT', x: 424, y: 216, w: 112, h: 108, speed: 1.00, damage: 1.04, defense: 0.98, range: 1.04, color: '#e0a34a', priority: 5 },
      { id: 'river-cut', label: 'RIVER CUT', x: 398, y: 170, w: 164, h: 198, speed: 0.74, damage: 0.96, defense: 1.04, range: 0.92, color: '#5db7cb', priority: 1 },
      { id: 'south-brush', label: 'BRUSH', x: 598, y: 334, w: 126, h: 58, speed: 0.90, damage: 1.02, defense: 0.82, range: 0.96, color: '#8aaa63', priority: 2 },
      { id: 'east-ridge', label: 'HIGH RIDGE', x: 652, y: 188, w: 126, h: 78, speed: 1.08, damage: 1.10, defense: 0.92, range: 1.08, color: '#76d6a6', priority: 2 },
      { id: hazard + '-field', label: hazard.toUpperCase(), x: hazard === 'gust' ? 420 : 306, y: hazard === 'gust' ? 190 : 274, w: hazard === 'gust' ? 120 : 86, h: hazard === 'gust' ? 154 : 74, speed: hazard === 'rime' || hazard === 'shards' ? 0.78 : 1, damage: hazard === 'salt' || hazard === 'vents' ? 0.92 : 1, defense: 1, range: hazard === 'mirror' ? 1.16 : 1, color: '#d6a45c', priority: 3, hazard: hazard }
    ];
  }

  Object.keys(LANES).forEach(function (key) { LANES[key].terrain = terrainLayout(LANES[key].hazard); });

  var bridgeState = { mode: 'boot', hero: HEROES[0].name, gold: 0, towerHP: 0, clock: 0, lane: 'boot', checkpoint: 'neutral', checkpointProgress: 0 };
  var bridge = window.__rr || {};
  bridge.state = bridgeState;
  bridge.scene = null;
  bridge.forceMode = function (next) {
    bridgeState.requestedMode = String(next || 'menu');
    if (bridge.scene && bridge.scene.applyForcedMode) bridge.scene.applyForcedMode(bridgeState.requestedMode);
  };
  bridge.forceHero = function (hero) {
    bridgeState.requestedHero = hero;
    if (bridge.scene && bridge.scene.applyForcedHero) bridge.scene.applyForcedHero(hero);
  };
  window.__rr = bridge;

  function safeProfile(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    if (!Number.isFinite(obj.wins) || !Number.isFinite(obj.losses)) return false;
    return Array.isArray(obj.trialMedals) && obj.trialMedals.length === 4;
  }

  if (!window.GGKit || !window.Phaser) {
    var fallback = document.getElementById('game-shell');
    if (fallback) fallback.textContent = 'Ridgeline Rumble needs the local Phaser and GGKit engines.';
    return;
  }

  var kit = window.GGKit.create({
    slug: 'ridgeline-rumble', orientation: 'any', validateSave: safeProfile,
    onPause: function () { if (bridge.scene) bridge.scene.simPaused = true; },
    onResume: function () { if (bridge.scene) bridge.scene.simPaused = false; },
    onRestart: function () { if (bridge.scene) bridge.scene.clearClaimedPointers(); }
  });
  /* Keep gamepad reads behind GGKit's input facade so gameplay never owns a second input system. */
  kit.input.gamepadVector = function () {
    if (!navigator.getGamepads) return { x: 0, y: 0 };
    var pads = navigator.getGamepads(), pad = pads && pads[0]; if (!pad || !pad.connected) return { x: 0, y: 0 };
    return { x: Math.abs(pad.axes[0] || 0) > 0.16 ? clamp(pad.axes[0], -1, 1) : 0, y: Math.abs(pad.axes[1] || 0) > 0.16 ? clamp(pad.axes[1], -1, 1) : 0 };
  };
  kit.input.gamepadButton = function (index) {
    if (!navigator.getGamepads) return false;
    var pads = navigator.getGamepads(), pad = pads && pads[0]; return !!(pad && pad.connected && pad.buttons[index] && pad.buttons[index].pressed);
  };
  kit.audio.register({
    select: 'assets/select.mp3', confirm: 'assets/confirm.mp3', cancel: 'assets/cancel.mp3', move: 'assets/move.mp3',
    attack: 'assets/attack.mp3', hit: 'assets/hit.mp3', kill: 'assets/kill.mp3', warning: 'assets/warning.mp3',
    wave: 'assets/wave.mp3', ability: 'assets/ability.mp3', tower: 'assets/tower.mp3', victory: 'assets/victory.mp3',
    defeat: 'assets/defeat.mp3', ridgeBed: 'assets/ridge-bed.mp3'
  });
  kit.registerPWA();
  kit.loader.show('RIDGELINE RUMBLE');
  kit.loader.progress(0.18);
  kit.audio.preload(['select', 'confirm', 'cancel', 'move', 'attack', 'hit', 'kill', 'warning', 'wave', 'ability', 'tower', 'victory', 'defeat', 'ridgeBed']).then(function () {
    kit.loader.progress(1);
    kit.loader.hide();
  });

  var profile = kit.save.get(JSON.parse(JSON.stringify(PROFILE_DEFAULT)));
  function cleanProfile() {
    var clean = JSON.parse(JSON.stringify(PROFILE_DEFAULT));
    clean.wins = Math.max(0, Math.floor(Number(profile.wins) || 0));
    clean.losses = Math.max(0, Math.floor(Number(profile.losses) || 0));
    clean.streak = Math.max(0, Math.floor(Number(profile.streak) || 0));
    clean.bestStreak = Math.max(0, Math.floor(Number(profile.bestStreak) || 0));
    clean.bestTime = Math.max(0, Number(profile.bestTime) || 0);
    clean.ladderProgress = Math.max(0, Math.min(4, Math.floor(Number(profile.ladderProgress) || 0)));
    clean.lastHero = Math.max(0, Math.min(HEROES.length - 1, Math.floor(Number(profile.lastHero) || 0)));
    for (var i = 0; i < HEROES.length; i++) clean.mastery[HEROES[i].id] = Math.max(0, Math.floor(Number(profile.mastery && profile.mastery[HEROES[i].id]) || 0));
    for (var t = 0; t < 4; t++) clean.trialMedals[t] = Math.max(0, Math.min(3, Math.floor(Number(profile.trialMedals[t]) || 0)));
    return clean;
  }
  profile = cleanProfile();

  function laneFor(id) { return LANES[id] || LANES.main; }
  function heroFor(index) { return HEROES[index] || HEROES[0]; }
  function clamp(v, low, high) { return Math.max(low, Math.min(high, v)); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function fmtTime(seconds) {
    var s = Math.max(0, Math.ceil(seconds));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  function hex(color) {
    if (typeof color === 'string' && color.indexOf('rgba(') === 0) {
      var rgba = color.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (rgba) return Phaser.Display.Color.GetColor(Number(rgba[1]), Number(rgba[2]), Number(rgba[3]));
    }
    return Phaser.Display.Color.HexStringToColor(color).color;
  }

  class RumbleScene extends Phaser.Scene {
    constructor() { super({ key: 'RumbleScene' }); }

    create() {
      this.mode = 'menu';
      this.selected = profile.lastHero;
      this.lane = laneFor('main');
      this.trialIndex = 0;
      this.accumulator = 0;
      this.simPaused = false;
      this.simTime = 0;
      this.visualTime = 0;
      this.waveNo = 0;
      this.waveTimer = 0;
      this.result = null;
      this.gold = 0;
      this.player = null;
      this.entities = [];
      this.particlePools = { dust: [], projectile: [], wave: [], terrain: [] };
      this.projectiles = [];
      this.towers = [];
      this.checkpoint = null;
      this.targetId = 0;
      this.targetTowerIndex = -1;
      this.tutorialStep = -1;
      this.dangerTimer = 0;
      this.moveAudioTimer = 0;
      this.renderState = new Map();
      this.claimedPointers = new Map();
      this.stickId = null;
      this.stick = { x: 0, y: 0 };
      this.abilityQueue = [];
      this.keyLatch = {};
      this.buttons = [];
      this.toast = { text: '', color: COLORS.gold, time: 0 };
      this.coach = { text: '', time: 0 };
      this.banner = { title: '', subtitle: '', time: 0, duration: 0 };
      this.burstPulse = 0;
      this.juiceState = { dx: 0, dy: 0, frozen: false };
      this.texts = {};
      this.dynamicTextKeys = [];
      this.buildPools();
      this.buildTextures();
      this.boardImage = this.add.image(VIRTUAL_W / 2, VIRTUAL_H / 2, 'board-main').setDepth(0);
      this.hudImage = this.add.image(VIRTUAL_W / 2, VIRTUAL_H / 2, 'hud-frame').setDepth(34).setVisible(false);
      this.decalLayer = this.add.graphics().setDepth(10);
      this.unitsLayer = this.add.graphics().setDepth(20);
      this.fxLayer = this.add.graphics().setDepth(30);
      this.uiLayer = this.add.graphics().setDepth(40);
      this.input.on('pointerdown', this.claimPointer, this);
      this.input.on('pointermove', this.movePointer, this);
      this.input.on('pointerup', this.releasePointer, this);
      this.input.on('pointerupoutside', this.releasePointer, this);
      this.input.on('pointercancel', this.releasePointer, this);
      bridge.scene = this;
      this.syncBridge();
      this.showCoach('Tap a mode to choose your lane.');
      if (bridgeState.requestedHero !== undefined) this.applyForcedHero(bridgeState.requestedHero);
      if (bridgeState.requestedMode) this.applyForcedMode(bridgeState.requestedMode);
      this.redraw();
    }

    buildPools() {
      for (var i = 0; i < MAX_ENTITIES; i++) {
        this.entities.push({ id: i + 1, active: false, alive: false, kind: '', team: '', x: 0, y: 0, hp: 0, maxHp: 0,
          radius: 10, damage: 0, speed: 0, range: 0, attackCd: 0, abilityCd: [0, 0, 0], respawn: 0,
          heroIndex: 0, role: '', phase: 0, shield: 0, stun: 0, slow: 0, face: 1, lastHitBy: 0, telegraph: 0,
          telegraphType: '', telegraphTarget: 0, telegraphIndex: 0, items: [false, false, false], gold: 0,
          castTimer: 0, castIndex: -1, castTargetId: 0, castTowerIndex: -1, defeat: 0, isPlayer: false });
        this.renderState.set(i + 1, { t: i * 0.37, recoil: 0, hurt: 0, command: 0, pose: 'idle', poseTime: 0 });
      }
      PARTICLE_SYSTEMS.forEach(function (system) {
        for (var p = 0; p < MAX_PARTICLES / PARTICLE_SYSTEMS.length; p++) this.particlePools[system].push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, color: COLORS.white, kind: 'spark', system: system });
      }, this);
    }

    buildTextures() {
      var laneKeys = Object.keys(LANES);
      for (var i = 0; i < laneKeys.length; i++) this.makeBoardTexture(laneKeys[i], LANES[laneKeys[i]]);
      var g = this.make.graphics({ x: 0, y: 0, add: false });
      g.clear();
      g.fillStyle(hex('rgba(5,14,23,0.92)'), 1); g.fillRoundedRect(18, 14, 924, 60, 16);
      g.lineStyle(1, hex('#32505a'), 0.75); g.strokeRoundedRect(18, 14, 924, 60, 16);
      g.fillStyle(hex('rgba(4,12,19,0.94)'), 1); g.fillRoundedRect(18, 420, 924, 104, 20);
      g.lineStyle(1, hex('#284b53'), 0.85); g.strokeRoundedRect(18, 420, 924, 104, 20);
      g.fillStyle(hex('rgba(14,41,46,0.75)'), 1); g.fillRoundedRect(30, 432, 126, 82, 18);
      g.fillStyle(hex('rgba(14,41,46,0.6)'), 1); g.fillRoundedRect(402, 432, 300, 82, 16);
      g.generateTexture('hud-frame', VIRTUAL_W, VIRTUAL_H); g.destroy();
    }

    makeBoardTexture(id, lane) {
      var key = 'board-' + id;
      var g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(hex(lane.bg), 1); g.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);
      g.fillStyle(hex(lane.mid), 0.26); g.fillTriangle(0, 115, 180, 48, 310, 126);
      g.fillTriangle(330, 118, 540, 32, 720, 120); g.fillTriangle(650, 120, 820, 46, 960, 116);
      g.fillStyle(hex(lane.accent), 0.08); g.fillRect(0, 142, VIRTUAL_W, 2);
      g.fillStyle(hex(lane.route), 1); g.fillRoundedRect(52, 170, 856, 198, 88);
      g.fillStyle(hex('#213b43'), 0.78); g.fillRoundedRect(62, 190, 836, 158, 66);
      g.lineStyle(2, hex(lane.accent), 0.20); g.strokeRoundedRect(62, 190, 836, 158, 66);
      g.fillStyle(hex(COLORS.teal), 0.06); g.fillTriangle(64, 342, 174, 188, 302, 342); g.fillStyle(hex(COLORS.coral), 0.06); g.fillTriangle(658, 342, 786, 188, 896, 342);
      g.fillStyle(hex('#4d99a3'), 0.34); g.fillRoundedRect(398, 184, 164, 178, 26); g.lineStyle(2, hex('#8ed8d0'), 0.22); g.lineBetween(414, 190, 414, 356); g.lineBetween(546, 190, 546, 356);
      g.fillStyle(hex('#9ab66f'), 0.18); g.fillRoundedRect(258, 112, 146, 54, 22); g.fillRoundedRect(594, 328, 146, 54, 22);
      g.fillStyle(hex('#b7d39a'), 0.13); g.fillTriangle(180, 254, 228, 188, 308, 254); g.fillTriangle(652, 254, 732, 188, 780, 254);
      g.fillStyle(hex('#d8c38c'), 0.25); g.fillRoundedRect(424, 216, 112, 108, 18); g.lineStyle(2, hex('#f6d879'), 0.50); g.strokeRoundedRect(424, 216, 112, 108, 18);
      g.lineStyle(1, hex('#b8d5ba'), 0.13); g.lineBetween(70, LANE_Y, 890, LANE_Y);
      for (var x = 94; x < 900; x += 68) {
        g.lineStyle(1, hex(lane.accent), 0.10); g.lineBetween(x, 205, x + 25, 220); g.lineBetween(x + 28, 320, x + 54, 305);
      }
      if (lane.kind === 'main') {
        g.fillStyle(hex('#6d8765'), 0.55); g.fillTriangle(0, 154, 80, 93, 188, 155); g.fillTriangle(788, 153, 880, 90, 960, 154);
        g.fillStyle(hex('#c2b27b'), 0.38); g.fillRoundedRect(420, 207, 120, 126, 12);
        g.fillStyle(hex('#587b66'), 0.9); g.fillRoundedRect(434, 222, 92, 94, 8);
        g.lineStyle(2, hex('#e0a34a'), 0.55); g.lineBetween(447, 232, 513, 302); g.lineBetween(513, 232, 447, 302);
      } else if (lane.kind === 'trial') {
        g.fillStyle(hex(lane.accent), 0.10); g.fillCircle(480, LANE_Y, 88); g.lineStyle(2, hex(lane.accent), 0.44); g.strokeCircle(480, LANE_Y, 88);
        g.fillStyle(hex('#d8c38c'), 0.23); g.fillTriangle(108, 164, 132, 124, 158, 164); g.fillTriangle(802, 164, 828, 124, 852, 164);
      } else if (lane.id === 'summit') {
        g.fillStyle(hex('#d8c38c'), 0.26); g.fillTriangle(425, 156, 480, 91, 535, 156);
        g.lineStyle(3, hex('#d8c38c'), 0.30); g.strokeTriangle(425, 156, 480, 91, 535, 156);
        g.fillStyle(hex('#9ac7cf'), 0.13); g.fillRoundedRect(376, 112, 12, 52, 6); g.fillRoundedRect(572, 112, 12, 52, 6);
      } else {
        g.fillStyle(hex('#e0a34a'), 0.18); g.fillCircle(220, 142, 18); g.fillCircle(742, 142, 18);
        g.fillStyle(hex(lane.accent), 0.16); g.fillTriangle(212, 155, 220, 118, 228, 155); g.fillTriangle(734, 155, 742, 118, 750, 155);
      }
      g.fillStyle(hex('#d8c38c'), 0.20); g.fillRoundedRect(26, 174, 18, 188, 9); g.fillRoundedRect(916, 174, 18, 188, 9);
      g.generateTexture(key, VIRTUAL_W, VIRTUAL_H); g.destroy();
    }

    setTextIfChanged(node, value) {
      var next = String(value);
      if (node.text !== next) node.setText(next);
    }

    setColorIfChanged(node, color) {
      if (node._rrColor !== color) { node.setColor(color); node._rrColor = color; }
    }

    uiText(key, value, x, y, size, color, originX, weight) {
      var node = this.texts[key];
      if (!node) {
        node = this.add.text(0, 0, '', { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: size + 'px', fontStyle: weight === 'normal' ? 'normal' : 'bold', color: color, resolution: 1 });
        node.setDepth(50); this.texts[key] = node;
      }
      node.setVisible(true); node.setPosition(x, y); node.setOrigin(originX == null ? 0 : originX, 0.5);
      this.setTextIfChanged(node, value); this.setColorIfChanged(node, color);
      return node;
    }

    hideTexts() { Object.keys(this.texts).forEach(function (key) { this.texts[key].setVisible(false); }, this); }

    clearClaimedPointers() {
      this.claimedPointers.clear(); this.stickId = null; this.stick.x = 0; this.stick.y = 0; this.abilityQueue.length = 0; this.keyLatch = {};
      kit.input.clearAll();
    }

    claimPointer(pointer) {
      if (kit.paused) return;
      var id = pointer.id == null ? pointer.pointerId : pointer.id;
      var hit = this.hitAt(pointer.x, pointer.y);
      if (!hit) { this.selectTargetAt(pointer.x, pointer.y); return; }
      if (this.claimedPointers.size >= 8) this.clearClaimedPointers();
      this.claimedPointers.set(id, hit);
      if (hit.type === 'stick' && this.stickId === null) { this.stickId = id; this.updateStick(pointer.x, pointer.y); }
      else if (hit.type === 'ability') this.abilityQueue.push(hit.index);
      else if (hit.type === 'hero') this.selectHero(hit.index);
      else if (hit.type === 'shop') this.buy(hit.index);
      else if (hit.type === 'mode') this.startMode(hit.mode);
      else if (hit.type === 'trial') this.startTrial(hit.index);
      else if (hit.type === 'ladder') this.startLadder(hit.index);
      else if (hit.type === 'result-rematch') this.rematch();
      else if (hit.type === 'result-hub') this.setMode('menu');
      else if (hit.type === 'result-hero') this.setMode('hero-select');
      else if (hit.type === 'back') this.setMode('menu');
      else if (hit.type === 'drop') this.startMatch('main', 'playing');
      else if (hit.type === 'settings') kit.openSettings();
      this.sound('select');
    }

    movePointer(pointer) {
      var id = pointer.id == null ? pointer.pointerId : pointer.id;
      var claimed = this.claimedPointers.get(id);
      if (claimed && claimed.type === 'stick') this.updateStick(pointer.x, pointer.y);
    }

    releasePointer(pointer) {
      var id = pointer.id == null ? pointer.pointerId : pointer.id;
      var claimed = this.claimedPointers.get(id);
      if (claimed && claimed.type === 'stick' && this.stickId === id) { this.stickId = null; this.stick.x = 0; this.stick.y = 0; }
      this.claimedPointers.delete(id);
    }

    updateStick(x, y) {
      var dx = x - 92, dy = y - 473, mag = Math.hypot(dx, dy);
      if (mag > 43) { dx = dx / mag * 43; dy = dy / mag * 43; }
      this.stick.x = dx / 43; this.stick.y = dy / 43;
    }

    hitAt(x, y) {
      for (var i = this.buttons.length - 1; i >= 0; i--) {
        var b = this.buttons[i]; if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
      }
      return null;
    }

    selectTargetAt(x, y) {
      if (this.mode !== 'playing' && this.mode !== 'trial' && this.mode !== 'ladder') return;
      var best = null, bestDistance = 34;
      for (var i = 0; i < this.entities.length; i++) {
        var e = this.entities[i]; if (!e.active || !e.alive || e.team === 'blue') continue;
        var d = Math.hypot(e.x - x, e.y - y); if (d < bestDistance) { best = e; bestDistance = d; }
      }
      for (var t = 0; t < this.towers.length; t++) {
        var tower = this.towers[t]; if (!tower.alive || tower.team === 'blue') continue;
        var td = Math.hypot(tower.x - x, tower.y - y); if (td < bestDistance + 10) { best = null; this.targetId = 0; this.targetTowerIndex = t; this.showToast(tower.far ? 'FAR TOWER LOCKED' : 'TOWER LOCKED', COLORS.coral); this.sound('select'); return; }
      }
      if (best) { this.targetId = best.id; this.targetTowerIndex = -1; this.showToast(best.kind === 'minion' ? 'MINION LOCKED' : 'HERO LOCKED', COLORS.gold); this.sound('select'); }
    }

    selectedTarget() {
      var target = this.entityById(this.targetId);
      if (target && this.player && target.team !== this.player.team) return { entity: target, tower: null };
      if (this.targetTowerIndex >= 0) {
        var tower = this.towers[this.targetTowerIndex];
        if (tower && tower.alive && tower.team !== this.player.team) return { entity: null, tower: tower };
      }
      return null;
    }

    addButton(x, y, w, h, type, extra) { this.buttons.push(Object.assign({ x: x, y: y, w: w, h: h, type: type }, extra || {})); }

    selectHero(index) {
      this.selected = clamp(Number(index) || 0, 0, HEROES.length - 1); profile.lastHero = this.selected; this.saveProfile();
      if (this.mode === 'hero-select') this.showCoach(heroFor(this.selected).name + ' selected. Choose a drop point.');
      this.sound('confirm');
    }

    applyForcedHero(hero) {
      var index = -1;
      if (typeof hero === 'number') index = hero;
      else { var needle = String(hero || '').toLowerCase(); for (var i = 0; i < HEROES.length; i++) if (HEROES[i].id === needle || HEROES[i].name.toLowerCase() === needle) index = i; }
      if (index >= 0 && index < HEROES.length) { this.selectHero(index); bridgeState.hero = heroFor(index).name; }
    }

    applyForcedMode(next) {
      var value = String(next || 'menu').toLowerCase();
      if (value === 'select' || value === 'hero-select') this.setMode('hero-select');
      else if (value === 'trial-select') this.setMode('trial-select');
      else if (value === 'ladder-select') this.setMode('ladder-select');
      else if (value === 'trial') this.startTrial(this.trialIndex);
      else if (value === 'ladder') this.startLadder(profile.ladderProgress);
      else if (value === 'tutorial') this.startMatch('tutorial', 'playing');
      else if (value === 'playing' || value === 'main') this.startMatch('main', 'playing');
      else this.setMode('menu');
    }

    setMode(next) {
      this.mode = next; this.result = null; this.clearClaimedPointers(); this.boardImage.setTexture('board-main'); this.boardImage.setVisible(next !== 'menu' ? true : true); this.hudImage.setVisible(false);
      this.showCoach(next === 'menu' ? 'Pick a lane. Every drop is generous.' : ''); this.redraw(); this.syncBridge();
    }

    startMode(mode) {
      if (mode === 'main') this.startMatch('main', 'playing');
      else if (mode === 'trial') this.setMode('trial-select');
      else if (mode === 'ladder') this.setMode('ladder-select');
      else if (mode === 'heroes') this.setMode('hero-select');
      else if (mode === 'tutorial') this.startMatch('tutorial', 'playing');
    }

    startTrial(index) {
      var trial = TRIALS[index] || TRIALS[0];
      var unlocked = index === 0 || profile.trialMedals[index - 1] >= 1;
      if (!unlocked) { this.showCoach('Win a bronze medal to open this duel.'); this.sound('warning'); return; }
      this.trialIndex = clamp(index, 0, TRIALS.length - 1); this.startMatch(trial.lane, 'trial');
    }

    startLadder(index) {
      var rung = clamp(Number(index) || 0, 0, 3);
      if (rung > profile.ladderProgress) { this.showCoach('Win the previous rung to climb.'); this.sound('warning'); return; }
      this.startMatch(rung === 3 ? 'summit' : 'ladder' + rung, 'ladder');
    }

    startMatch(laneId, mode) {
      this.mode = mode || 'playing'; this.lane = laneFor(laneId); this.result = null; this.clearClaimedPointers(); this.simTime = 0; this.accumulator = 0; this.waveNo = 0; this.waveTimer = this.lane.wave ? this.lane.wave : 999; this.gold = 220; this.burstPulse = 0; this.toast.time = 0; this.coach.time = 0; this.targetId = 0; this.targetTowerIndex = -1; this.tutorialStep = -1; this.dangerTimer = 0; this.moveAudioTimer = 0; this.hazardTick = -1;
      for (var i = 0; i < MAX_ENTITIES; i++) this.entities[i].active = false;
      PARTICLE_SYSTEMS.forEach(function (system) { this.particlePools[system].forEach(function (p) { p.active = false; }); }, this);
      this.projectiles.length = 0;
      this.renderState.forEach(function (rs) { rs.recoil = 0; rs.hurt = 0; rs.command = 0; rs.pose = 'idle'; rs.poseTime = 0; });
      this.checkpoint = { x: 480, y: LANE_Y, radius: 58, owner: 'neutral', progress: 0, blue: 0, red: 0 };
      this.towers = [
        { team: 'blue', x: 82, y: LANE_Y, hp: this.lane.towerHp * 0.8, maxHp: this.lane.towerHp * 0.8, alive: true, attackCd: 0, far: false, targeted: false },
        { team: 'blue', x: 156, y: LANE_Y, hp: this.lane.towerHp, maxHp: this.lane.towerHp, alive: true, attackCd: 0, far: true, targeted: false },
        { team: 'red', x: 804, y: LANE_Y, hp: this.lane.towerHp, maxHp: this.lane.towerHp, alive: true, attackCd: 0, far: false, targeted: false },
        { team: 'red', x: 878, y: LANE_Y, hp: this.lane.towerHp, maxHp: this.lane.towerHp, alive: true, attackCd: 0, far: true, targeted: false }
      ];
      var h = heroFor(this.selected);
      this.player = this.spawnHero('blue', 208, LANE_Y + 28, this.selected, true);
      this.player.items = [false, false, false]; this.player.gold = this.gold;
      if (this.mode !== 'trial') { this.spawnHero('blue', 180, LANE_Y - 35, 0, false); this.spawnHero('blue', 225, LANE_Y - 68, 4, false); }
      this.spawnHero('red', 720, LANE_Y + 28, this.mode === 'trial' ? (TRIALS[this.trialIndex] || TRIALS[0]).foe : 5, false);
      if (this.mode !== 'trial') { this.spawnHero('red', 770, LANE_Y - 34, 1, false); this.spawnHero('red', 735, LANE_Y - 66, 2, false); this.spawnWave(); }
      this.boardImage.setTexture('board-' + this.lane.id);
      this.hudImage.setVisible(true);
      this.banner = { title: this.mode === 'trial' ? this.lane.name : this.mode === 'ladder' ? 'RUNG ' + ((this.lane.heat || 1)) : 'DROP IN', subtitle: this.lane.place + '  ·  ' + this.lane.feature, time: 1.25, duration: 1.25 };
      this.showCoach(this.lane.kind === 'tutorial' ? 'MOVE to the HIGH RIDGE. It grants speed, range, and damage.' : 'MOVE  ·  target a unit  ·  last-hit marked minions  ·  J K L cast');
      this.sound('confirm'); this.sound('wave'); kit.audio.music('ridgeBed', 500); this.syncBridge(); this.redraw();
    }

    spawnEntity(kind, team, x, y) {
      for (var i = 0; i < this.entities.length; i++) {
        var e = this.entities[i]; if (e.active) continue;
        e.active = true; e.alive = true; e.kind = kind; e.team = team; e.x = x; e.y = y; e.attackCd = 0.25 + Math.random() * 0.3; e.abilityCd = [0.5, 1.2, 2.2]; e.respawn = 0; e.shield = 0; e.stun = 0; e.slow = 0; e.lastHitBy = 0; e.telegraph = 0; e.telegraphType = ''; e.telegraphTarget = 0; e.telegraphIndex = 0; e.phase = Math.random() * 6.28; e.face = team === 'blue' ? 1 : -1; e.items = [false, false, false]; e.castTimer = 0; e.castIndex = -1; e.castTargetId = 0; e.castTowerIndex = -1; e.defeat = 0; e.isPlayer = false;
        return e;
      }
      return null;
    }

    spawnHero(team, x, y, heroIndex, isPlayer) {
      var h = heroFor(heroIndex); var e = this.spawnEntity('hero', team, x, y); if (!e) return null;
      var heat = this.lane.heat || 1; var streakHeat = Math.min(0.24, Math.max(0, profile.streak) * 0.025); var scale = team === 'red' ? 1 + (heat - 1) * 0.08 + streakHeat : 1;
      e.heroIndex = heroIndex; e.role = isPlayer ? 'PLAYER' : h.role; e.maxHp = h.hp * scale; e.hp = e.maxHp; e.damage = h.damage * scale; e.speed = h.speed; e.range = h.range; e.radius = 18; e.isPlayer = !!isPlayer; e.gold = isPlayer ? this.gold : 0;
      return e;
    }

    spawnMinion(team, x, ranged) {
      var e = this.spawnEntity('minion', team, x, LANE_Y + (Math.random() - 0.5) * 68); if (!e) return null;
      var heat = this.lane.heat || 1; var scale = team === 'red' ? 1 + (heat - 1) * 0.07 : 1; e.ranged = ranged; e.maxHp = (ranged ? 58 : 76) * scale; e.hp = e.maxHp; e.damage = (ranged ? 9 : 12) * scale; e.speed = ranged ? 40 : 48; e.range = ranged ? 110 : 36; e.radius = ranged ? 11 : 13; e.isPlayer = false; return e;
    }

    spawnWave() {
      if (this.mode === 'trial' || this.waveNo >= 12) return;
      this.waveNo++;
      this.spawnMinion('blue', 255, false); this.spawnMinion('blue', 240, false); this.spawnMinion('blue', 225, true);
      this.spawnMinion('red', 705, false); this.spawnMinion('red', 720, false); this.spawnMinion('red', 735, true);
      if (this.waveNo % 3 === 0) { this.spawnMinion('blue', 212, false); this.spawnMinion('red', 748, false); }
      this.showToast('WAVE ' + this.waveNo, COLORS.cyan); this.sound('wave');
    }

    terrainAt(x, y) {
      var zones = this.lane.terrain || [], best = null;
      for (var i = 0; i < zones.length; i++) {
        var z = zones[i]; if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h && (!best || z.priority > best.priority)) best = z;
      }
      return best;
    }

    effectsAt(x, y, team) {
      var zone = this.terrainAt(x, y), effect = { speed: 1, damage: 1, defense: 1, range: 1, zone: zone };
      if (zone) { effect.speed *= zone.speed; effect.damage *= zone.damage; effect.defense *= zone.defense; effect.range *= zone.range; }
      if (this.checkpoint && this.checkpoint.owner === team) { effect.speed *= 1.08; effect.damage *= 1.10; effect.defense *= 0.90; effect.range *= 1.06; }
      return effect;
    }

    effectiveRange(e) { return e.range * this.effectsAt(e.x, e.y, e.team).range; }

    setPose(e, pose, duration) {
      var rs = this.renderState.get(e.id); if (!rs) return;
      rs.pose = pose; rs.poseTime = Math.max(rs.poseTime || 0, duration || 0.18);
    }

    updateCheckpoint(dt) {
      if (!this.checkpoint) return;
      var blue = 0, red = 0;
      for (var i = 0; i < this.entities.length; i++) {
        var e = this.entities[i]; if (!e.active || !e.alive || Math.hypot(e.x - this.checkpoint.x, e.y - this.checkpoint.y) > this.checkpoint.radius) continue;
        if (e.team === 'blue') blue += e.kind === 'hero' ? 2 : 1; else red += e.kind === 'hero' ? 2 : 1;
      }
      this.checkpoint.blue = blue; this.checkpoint.red = red;
      if (blue !== red) this.checkpoint.progress = clamp(this.checkpoint.progress + (blue - red) * dt * 15, -100, 100);
      if (this.checkpoint.progress >= 100) this.checkpoint.owner = 'blue';
      else if (this.checkpoint.progress <= -100) this.checkpoint.owner = 'red';
      else if (Math.abs(this.checkpoint.progress) < 20) this.checkpoint.owner = 'neutral';
    }

    applyHazard(dt) {
      if (!this.lane || !this.lane.hazard || this.lane.hazard === 'tutorial') return;
      var tick = Math.floor(this.simTime * 2); if (tick === this.hazardTick) return; this.hazardTick = tick;
      for (var i = 0; i < this.entities.length; i++) {
        var e = this.entities[i]; if (!e.active || !e.alive) continue;
        var zone = this.terrainAt(e.x, e.y); if (!zone || zone.hazard !== this.lane.hazard) continue;
        if (this.lane.hazard === 'vents' || this.lane.hazard === 'salt') this.hurt(e, 4, null, '');
        else if (this.lane.hazard === 'shards' || this.lane.hazard === 'rime') e.slow = Math.max(e.slow, 0.7);
        else if (this.lane.hazard === 'lantern') e.shield = Math.min(45, e.shield + 8);
        else if (this.lane.hazard === 'mirror') e.face *= -1;
        else if (this.lane.hazard === 'pines') e.stun = Math.max(e.stun, 0.12);
      }
      if (this.lane.hazard === 'gust') {
        for (var j = 0; j < this.entities.length; j++) { var gust = this.entities[j]; if (gust.active && gust.alive && gust.x > 420 && gust.x < 540) gust.x = clamp(gust.x + (gust.team === 'blue' ? 10 : -10), 175, 785); }
      }
      if (this.lane.hazard === 'storm') {
        var stormTarget = this.findEnemy({ team: 'red', x: 480, y: LANE_Y }, 210, ['hero', 'minion']); if (stormTarget) this.hurt(stormTarget, 7, null, 'STORM');
      }
    }

    tutorialCoach() {
      if (this.mode !== 'playing' && this.mode !== 'trial' && this.mode !== 'ladder') return;
      var prompts = [
        'MOVE into the HIGH RIDGE for speed, range, and damage.',
        'Hold the CHECKPOINT. Blue and red units contest its capture ring.',
        'Tap a foe to lock it. Auto-fire keeps the lock unless a last-hit is ready.',
        'Wait for the amber telegraph, then dodge. J K L attacks resolve after the wind-up.',
        'LAST HIT marked minions for +35G. Spend gold on the three shop cards.',
        'Push the FAR TOWER while your checkpoint buff is blue.'
      ];
      var step = Math.min(prompts.length - 1, Math.floor(this.simTime / 10));
      if (step !== this.tutorialStep) { this.tutorialStep = step; this.showCoach(prompts[step]); }
    }

    findEnemy(source, range, kinds) {
      var best = null, bestD = range == null ? 99999 : range;
      for (var i = 0; i < this.entities.length; i++) { var e = this.entities[i]; if (!e.active || !e.alive || e.team === source.team || e === source) continue; if (kinds && kinds.indexOf(e.kind) < 0) continue; var d = dist(source, e); if (d < bestD) { best = e; bestD = d; } }
      return best;
    }

    findTower(source, range) {
      var best = null, bestD = range == null ? 99999 : range;
      for (var i = 0; i < this.towers.length; i++) { var t = this.towers[i]; if (!t.alive || t.team === source.team) continue; var d = Math.abs(t.x - source.x); if (d < bestD) { best = t; bestD = d; } }
      return best;
    }

    inputVector() {
      var pad = kit.input.gamepadVector(); var x = this.stick.x || pad.x, y = this.stick.y || pad.y;
      if (kit.input.keyDown('KeyA') || kit.input.keyDown('ArrowLeft')) x -= 1;
      if (kit.input.keyDown('KeyD') || kit.input.keyDown('ArrowRight')) x += 1;
      if (kit.input.keyDown('KeyW') || kit.input.keyDown('ArrowUp')) y -= 1;
      if (kit.input.keyDown('KeyS') || kit.input.keyDown('ArrowDown')) y += 1;
      var m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; } return { x: x, y: y };
    }

    pollAbilityKeys() {
      var codes = ['KeyJ', 'KeyK', 'KeyL'];
      for (var i = 0; i < 3; i++) { var down = kit.input.keyDown(codes[i]) || kit.input.gamepadButton(2 + i); var latchKey = codes[i] + '-pad'; if (down && !this.keyLatch[codes[i]] && !this.keyLatch[latchKey]) this.abilityQueue.push(i); this.keyLatch[codes[i]] = kit.input.keyDown(codes[i]); this.keyLatch[latchKey] = kit.input.gamepadButton(2 + i); }
      if (this.abilityQueue.length > 6) this.abilityQueue.splice(0, this.abilityQueue.length - 6);
    }

    stepSim(dt) {
      if (this.mode !== 'playing' && this.mode !== 'trial' && this.mode !== 'ladder') return;
      if (this.simPaused || kit.paused) return;
      this.simTime += dt; this.banner.time = Math.max(0, this.banner.time - dt); this.toast.time = Math.max(0, this.toast.time - dt); this.coach.time = Math.max(0, this.coach.time - dt); this.burstPulse = Math.max(0, this.burstPulse - dt); this.dangerTimer = Math.max(0, this.dangerTimer - dt); this.moveAudioTimer = Math.max(0, this.moveAudioTimer - dt);
      var p = this.player;
      if (p && p.respawn > 0) { p.respawn -= dt; if (p.respawn <= 0) { p.respawn = 0; p.alive = true; p.hp = p.maxHp; p.x = 208; p.y = LANE_Y + 28; this.showToast('BACK IN', COLORS.cyan); } }
      if (p && p.alive) {
        this.pollAbilityKeys();
        var v = this.inputVector(); var moving = Math.hypot(v.x, v.y) > 0.05; var speed = p.speed * (p.items[1] ? 1.18 : 1) * this.effectsAt(p.x, p.y, p.team).speed; if (p.stun <= 0) { p.x = clamp(p.x + v.x * speed * dt, 185, 775); p.y = clamp(p.y + v.y * speed * dt, PLAY_TOP + 74, PLAY_BOTTOM - 26); if (Math.abs(v.x) > 0.05) p.face = v.x > 0 ? 1 : -1; if (moving) { this.setPose(p, 'move', 0.12); if (this.moveAudioTimer <= 0) { this.sound('move'); this.moveAudioTimer = 0.34; } } }
        if (p.castTimer > 0) { p.castTimer -= dt; if (p.castTimer <= 0) this.resolvePlayerAbility(p); }
        while (this.abilityQueue.length && p.castTimer <= 0) this.castAbility(p, this.abilityQueue.shift());
        this.basicAttack(p);
        this.gold = p.gold;
      }
      if (this.lane.wave && this.simTime >= this.waveTimer) { this.spawnWave(); this.waveTimer = this.simTime + this.lane.wave; }
      for (var i = 0; i < this.entities.length; i++) {
        var e = this.entities[i]; if (!e.active) continue;
        e.attackCd = Math.max(0, e.attackCd - dt); for (var a = 0; a < 3; a++) e.abilityCd[a] = Math.max(0, e.abilityCd[a] - dt); e.stun = Math.max(0, e.stun - dt); e.slow = Math.max(0, e.slow - dt); e.shield = Math.max(0, e.shield - dt * 8);
        var rs = this.renderState.get(e.id); rs.recoil = Math.max(0, rs.recoil - dt * 5); rs.hurt = Math.max(0, rs.hurt - dt * 4); rs.command = Math.max(0, rs.command - dt * 4); rs.poseTime = Math.max(0, (rs.poseTime || 0) - dt); if (rs.poseTime <= 0 && rs.pose !== 'idle') rs.pose = 'idle';
        if (!e.alive) { if (e.defeat > 0) { e.defeat -= dt; if (e.defeat <= 0 && !e.isPlayer) e.active = false; } continue; }
        if (e.respawn > 0) continue;
        if (e.kind === 'minion') this.updateMinion(e, dt); else if (!e.isPlayer) this.updateBot(e, dt);
      }
      this.updateCheckpoint(dt); this.applyHazard(dt); this.updateTowers(dt); this.updateProjectiles(dt); this.updateParticles(dt); this.tutorialCoach();
      if (p && p.alive && (p.hp / p.maxHp < 0.3 || (this.towers[3] && this.towers[3].hp / this.towers[3].maxHp < 0.25)) && this.dangerTimer <= 0) { this.sound('warning'); this.showToast('DANGER', COLORS.coral); this.dangerTimer = 4; }
      var far = this.towers[3];
      if (far && !far.alive) { if (!this.checkpoint || this.checkpoint.owner === 'blue') this.finish(true); else if (this.checkpoint.owner === 'red') this.showCoach('FAR CROWN CONTESTED. Take the checkpoint to convert the break.'); else this.showCoach('FAR CROWN OPEN. Capture the checkpoint to seal the win.'); return; }
      if (this.player && !this.towers[1].alive) { this.finish(false); return; }
      if (this.simTime >= this.lane.limit) { this.finish(false); return; }
      if (this.mode === 'trial' && !this.enemyAlive()) { this.finish(true); return; }
    }

    enemyAlive() { for (var i = 0; i < this.entities.length; i++) if (this.entities[i].active && this.entities[i].alive && this.entities[i].team === 'red' && this.entities[i].kind === 'hero') return true; return false; }

    updateMinion(e, dt) {
      var range = this.effectiveRange(e), target = this.findEnemy(e, range + 5, ['hero', 'minion']);
      if (target) { if (dist(e, target) > range) this.moveEntity(e, target.x, target.y, dt); this.basicAttack(e); return; }
      var tower = this.findTower(e, range + 22); if (tower) { if (Math.abs(e.x - tower.x) > range) this.moveEntity(e, tower.x, LANE_Y, dt); this.basicAttack(e); return; }
      this.moveEntity(e, e.team === 'blue' ? 860 : 100, LANE_Y, dt);
    }

    updateBot(e, dt) {
      var h = heroFor(e.heroIndex); var range = this.effectiveRange(e), target = this.findEnemy(e, range + 105, ['hero', 'minion']); var low = e.hp / e.maxHp < 0.26;
      if (e.telegraph > 0) { e.telegraph -= dt; if (e.telegraph <= 0) { this.resolveBotAbility(e); e.telegraph = 0; } return; }
      if (low) { this.moveEntity(e, e.team === 'red' ? 720 : 220, LANE_Y + 30, dt); return; }
      if (target) {
        var abilityIndex = this.chooseBotAbility(e, target);
        if (abilityIndex >= 0 && dist(e, target) < 220) { e.telegraph = 0.62; e.telegraphType = h.abilities[abilityIndex].type; e.telegraphIndex = abilityIndex; e.telegraphTarget = target.id; this.setPose(e, 'command', 0.68); return; }
        if (dist(e, target) > range * 0.72) this.moveEntity(e, target.x, target.y, dt);
      } else {
        var tower = this.findTower(e, range + 25); if (tower && Math.abs(tower.x - e.x) > range) this.moveEntity(e, tower.x, LANE_Y, dt); else this.moveEntity(e, e.team === 'blue' ? 850 : 110, LANE_Y + (e.role === 'WARD SUPPORT' ? -35 : 26), dt);
      }
      this.basicAttack(e);
    }

    chooseBotAbility(e, target) {
      var h = heroFor(e.heroIndex), preferred = (this.waveNo + Math.floor(this.simTime * 2) + e.id) % 3;
      if (e.hp / e.maxHp < 0.52 && (h.abilities[1].type === 'shield' || h.abilities[1].type === 'heal') && e.abilityCd[1] <= 0) return 1;
      for (var n = 0; n < 3; n++) { var index = (preferred + n) % 3; if (e.abilityCd[index] <= 0 && (dist(e, target) < 190 || h.abilities[index].type === 'shot' || h.abilities[index].type === 'shotHard')) return index; }
      return -1;
    }

    resolveBotAbility(e) {
      var h = heroFor(e.heroIndex), index = clamp(e.telegraphIndex, 0, 2), ability = h.abilities[index], target = this.entityById(e.telegraphTarget) || this.findEnemy(e, 240, ['hero', 'minion']); if (!target && ability.type !== 'shield' && ability.type !== 'heal') return;
      this.resolveAbilityEffect(e, ability, target ? { entity: target, tower: null } : null, COLORS.coral);
      e.abilityCd[index] = ability.cd; this.addBurst(target ? target.x : e.x, target ? target.y : e.y, COLORS.coral, 9, 'wave'); this.sound('ability');
    }

    moveEntity(e, tx, ty, dt) {
      var dx = tx - e.x, dy = ty - e.y, m = Math.hypot(dx, dy) || 1, slow = e.slow > 0 ? 0.56 : 1, terrain = this.effectsAt(e.x, e.y, e.team); e.x = clamp(e.x + dx / m * e.speed * slow * terrain.speed * dt, 175, 785); e.y = clamp(e.y + dy / m * e.speed * slow * terrain.speed * dt, PLAY_TOP + 70, PLAY_BOTTOM - 30); if (Math.abs(dx) > 2) e.face = dx > 0 ? 1 : -1;
      if (this.lane.hazard === 'gust' && e.x > 420 && e.x < 540) e.x = clamp(e.x + (e.team === 'blue' ? 12 : -12) * dt, 175, 785);
      var rs = this.renderState.get(e.id); this.setPose(e, 'move', 0.12); rs.t += dt * 3.2;
    }

    entityById(id) { for (var i = 0; i < this.entities.length; i++) if (this.entities[i].id === id && this.entities[i].active && this.entities[i].alive) return this.entities[i]; return null; }

    targetDistance(source, target) { return target.entity ? dist(source, target.entity) : Math.abs(target.tower.x - source.x); }

    playerAttackTarget() {
      var p = this.player, range = this.effectiveRange(p), last = this.lastHitTarget(); if (last) return { entity: last, tower: null };
      var locked = this.selectedTarget(); if (locked && this.targetDistance(p, locked) <= range + 18) return locked;
      var enemy = this.findEnemy(p, range, ['hero', 'minion']); if (enemy) return { entity: enemy, tower: null };
      var tower = this.findTower(p, range + 20); return tower ? { entity: null, tower: tower } : null;
    }

    combatTarget(source, range) {
      if (source.isPlayer) return this.playerAttackTarget();
      var enemy = this.findEnemy(source, range, ['hero', 'minion']); if (enemy) return { entity: enemy, tower: null };
      var tower = this.findTower(source, range + 20); return tower ? { entity: null, tower: tower } : null;
    }

    damageTower(tower, amount, source) {
      if (!tower || !tower.alive) return;
      var scaled = amount * (source ? this.effectsAt(source.x, source.y, source.team).damage : 1); tower.hp = Math.max(0, tower.hp - scaled); tower.targeted = true; this.addParticle(tower.x, tower.y - 20, COLORS.amber, 3, 'terrain'); if (tower.hp <= 0) this.destroyTower(tower, source);
    }

    basicAttack(e) {
      if (!e.alive || e.attackCd > 0 || e.stun > 0) return;
      var target = this.combatTarget(e, this.effectiveRange(e)); if (!target) return;
      if (target.entity) { if (e.ranged) this.fireProjectile(e, target, e.damage, e.team === 'blue' ? COLORS.cyan : COLORS.coral, 'basic'); else this.hurt(target.entity, e.damage, e, ''); e.attackCd = e.isPlayer ? 0.62 : 0.82; var rs = this.renderState.get(e.id); this.setPose(e, 'attack', 0.22); rs.recoil = 0.13; this.addParticle(target.entity.x, target.entity.y, e.team === 'blue' ? COLORS.cyan : COLORS.coral, 2, 'projectile'); this.sound('attack'); return; }
      if (target.tower) { this.damageTower(target.tower, e.damage, e); e.attackCd = e.isPlayer ? 0.62 : 0.92; this.setPose(e, 'attack', 0.22); this.sound('hit'); }
    }

    hurt(target, amount, source, label) {
      if (!target || !target.active || !target.alive) return;
      var sourceEffects = source ? this.effectsAt(source.x, source.y, source.team) : { damage: 1 }; var targetEffects = this.effectsAt(target.x, target.y, target.team); amount *= sourceEffects.damage * targetEffects.defense;
      var blocked = Math.min(target.shield, amount); target.shield -= blocked; amount -= blocked; if (amount <= 0) { this.showToast('BLOCKED', COLORS.cyan); return; }
      target.lastHitBy = source ? source.id : 0; target.hp = Math.max(0, target.hp - amount); var rs = this.renderState.get(target.id); rs.hurt = 0.18; rs.recoil = 0.12; this.setPose(target, 'hurt', 0.22); this.addParticle(target.x, target.y, target.team === 'blue' ? COLORS.coral : COLORS.cyan, 3, 'dust'); kit.juice.hitStop(48); if (label) this.showToast(label, COLORS.white);
      if (target.hp <= 0) this.killEntity(target, source);
    }

    killEntity(target, source) {
      if (!target.active || !target.alive) return;
      target.alive = false; target.defeat = target.isPlayer ? 0.55 : 0.42; this.addBurst(target.x, target.y, target.team === 'blue' ? COLORS.teal : COLORS.coral, target.kind === 'hero' ? 12 : 6, 'dust'); this.sound(target.kind === 'hero' ? 'kill' : 'hit'); kit.juice.hitStop(target.kind === 'hero' ? 78 : 52);
      if (source && source.isPlayer && target.kind === 'minion') { source.gold = Math.min(9999, source.gold + 35); this.gold = source.gold; this.showToast('+35 LAST HIT', COLORS.gold); this.addBurst(target.x, target.y, COLORS.gold, 4, 'reward'); }
      if (source && source.isPlayer && target.kind === 'hero') { source.gold = Math.min(9999, source.gold + 90); this.gold = source.gold; this.showToast('+90 TAKEDOWN', COLORS.gold); }
      var rs = this.renderState.get(target.id); this.setPose(target, 'defeat', target.defeat);
      if (target.isPlayer) { target.respawn = 5; this.showToast('DOWN 5s', COLORS.coral); }
    }

    destroyTower(tower, source) {
      if (!tower.alive) return; tower.alive = false; tower.hp = 0; tower.targeted = false; this.addBurst(tower.x, tower.y - 12, COLORS.amber, 20, 'tower'); kit.juice.shake(10, 210); kit.juice.hitStop(95); this.sound('tower');
      if (source && source.isPlayer) { source.gold = Math.min(9999, source.gold + 120); this.gold = source.gold; }
      if (tower.team === 'red' && tower.far) this.showToast('TOWER BREAK', COLORS.gold);
    }

    castAbility(player, index) {
      if (!player || !player.alive || player.respawn > 0 || player.stun > 0) return; var h = heroFor(player.heroIndex), ability = h.abilities[index] || h.abilities[0]; if (!ability || player.abilityCd[index] > 0 || player.castTimer > 0) { this.sound('cancel'); return; }
      var targetRange = ability.type === 'shot' || ability.type === 'shotHard' ? 420 : 250, target = this.combatTarget(player, targetRange);
      if (!target && ability.type !== 'shield' && ability.type !== 'heal' && ability.type !== 'dash') { this.sound('cancel'); this.showToast('NO TARGET', COLORS.amber); return; }
      player.abilityCd[index] = ability.cd; player.castTimer = 0.18; player.castIndex = index; player.castTargetId = target && target.entity ? target.entity.id : 0; player.castTowerIndex = target && target.tower ? this.towers.indexOf(target.tower) : -1; var rs = this.renderState.get(player.id); this.setPose(player, 'command', 0.3); rs.command = 0.28; this.burstPulse = 0.22; this.showToast(ability.name, h.color);
    }

    resolvePlayerAbility(player) {
      var h = heroFor(player.heroIndex), ability = h.abilities[player.castIndex] || h.abilities[0], target = this.entityById(player.castTargetId), tower = player.castTowerIndex >= 0 ? this.towers[player.castTowerIndex] : null;
      if (!target && (!tower || !tower.alive)) { var fallback = this.combatTarget(player, ability.type === 'shot' || ability.type === 'shotHard' ? 420 : 250); target = fallback && fallback.entity; tower = fallback && fallback.tower; }
      this.resolveAbilityEffect(player, ability, target || tower ? { entity: target, tower: tower } : null, h.color); player.castTimer = 0; player.castIndex = -1; player.castTargetId = 0; player.castTowerIndex = -1; var rs = this.renderState.get(player.id); rs.command = 0.28; this.burstPulse = 0.22; kit.juice.hitStop(60); this.sound('ability');
    }

    resolveAbilityEffect(source, ability, target, color) {
      var entity = target && target.entity, tower = target && target.tower, point = entity || tower || source;
      if (ability.type === 'shield' || ability.type === 'heal') { source.shield = Math.min(110, source.shield + 60); if (ability.type === 'heal') source.hp = Math.min(source.maxHp, source.hp + 36); this.addBurst(source.x, source.y, color, 12, 'wave'); return; }
      if (!entity && !tower) return;
      if (ability.type === 'dash') { var oldX = source.x; if (entity) { source.x = clamp(entity.x - source.face * 38, 180, 780); source.y = entity.y; this.hurt(entity, source.damage + 18, source, ability.name); } else this.damageTower(tower, source.damage + 18, source); this.addBurst(oldX, source.y, color, 12, 'projectile'); return; }
      if (ability.type === 'hook') { if (entity) { this.hurt(entity, source.damage + 26, source, ability.name); entity.x = clamp(source.x + source.face * 50, 175, 785); entity.y = source.y; entity.stun = Math.max(entity.stun, 0.46); } else this.damageTower(tower, source.damage + 26, source); }
      else if (ability.type === 'burst' || ability.type === 'burstBig') { var burstDamage = source.damage + (ability.type === 'burstBig' ? 38 : 22); this.areaHit(source, point.x, point.y, ability.type === 'burstBig' ? 76 : 52, burstDamage); if (tower) this.damageTower(tower, burstDamage, source); }
      else if (ability.type === 'spin') this.areaHit(source, source.x, source.y, 72, source.damage + 22);
      else if (ability.type === 'line') this.lineHit(source, target, source.damage + 30, 28);
      else if (ability.type === 'shot' || ability.type === 'shotHard') this.fireProjectile(source, target, source.damage + (ability.type === 'shotHard' ? 48 : 28), color, ability.type);
      this.addBurst(point.x, point.y, color, 20, ability.type === 'shot' || ability.type === 'shotHard' ? 'projectile' : 'wave');
    }

    lineHit(source, target, amount, width) {
      var destination = target.entity || target.tower || target, endX = destination.x, endY = destination.y, dx = endX - source.x, dy = endY - source.y, length = Math.hypot(dx, dy) || 1;
      for (var i = 0; i < this.entities.length; i++) { var e = this.entities[i]; if (!e.active || !e.alive || e.team === source.team) continue; var along = ((e.x - source.x) * dx + (e.y - source.y) * dy) / (length * length); var px = source.x + dx * along, py = source.y + dy * along; if (along >= 0 && along <= 1 && Math.hypot(e.x - px, e.y - py) <= width) this.hurt(e, amount, source, 'LINE'); }
      if (target.tower) this.damageTower(target.tower, amount, source);
    }

    fireProjectile(source, target, amount, color, kind) {
      if (!target || (!target.entity && !target.tower)) return;
      var destination = target.entity || target.tower, dx = destination.x - source.x, dy = destination.y - source.y, distance = Math.hypot(dx, dy) || 1, projectile = { active: true, x: source.x, y: source.y, vx: dx / distance * 430, vy: dy / distance * 430, life: 1.1, source: source, target: target, amount: amount, color: color, kind: kind };
      if (this.projectiles.length >= 24) this.projectiles.shift(); this.projectiles.push(projectile); this.addParticle(source.x, source.y, color, 2, 'projectile');
    }

    updateProjectiles(dt) {
      for (var i = this.projectiles.length - 1; i >= 0; i--) { var p = this.projectiles[i]; if (!p.active) { this.projectiles.splice(i, 1); continue; } p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; var target = p.target.entity && p.target.entity.active && p.target.entity.alive ? p.target.entity : p.target.tower && p.target.tower.alive ? p.target.tower : null; if (!target || p.life <= 0) { this.projectiles.splice(i, 1); continue; } if (Math.hypot(target.x - p.x, target.y - p.y) < (target.radius || 22) + 8) { if (p.target.entity) this.hurt(target, p.amount, p.source, p.kind === 'shotHard' ? 'PINPOINT' : 'SHOT'); else this.damageTower(target, p.amount, p.source); this.addBurst(target.x, target.y, p.color, 6, 'projectile'); this.projectiles.splice(i, 1); } }
    }

    areaHit(source, x, y, radius, amount) { for (var i = 0; i < this.entities.length; i++) { var e = this.entities[i]; if (e.active && e.alive && e.team !== source.team && Math.hypot(e.x - x, e.y - y) < radius) this.hurt(e, amount, source, ''); } }

    updateTowers(dt) {
      for (var i = 0; i < this.towers.length; i++) { var t = this.towers[i]; t.targeted = false; if (!t.alive) continue; t.attackCd = Math.max(0, t.attackCd - dt); var target = null, best = 160;
        for (var j = 0; j < this.entities.length; j++) { var e = this.entities[j]; if (!e.active || !e.alive || e.team === t.team) continue; var d = Math.abs(e.x - t.x); if (d < best) { best = d; target = e; } }
        if (target) { t.targeted = true; if (t.attackCd <= 0) { this.hurt(target, 14 + (this.lane.heat || 0) * 2, null, ''); t.attackCd = 1.2; this.sound('warning'); } }
      }
    }

    addParticle(x, y, color, count, kind) {
      var system = kind === 'projectile' || kind === 'trail' ? 'projectile' : kind === 'terrain' || kind === 'tower' ? 'terrain' : kind === 'wave' || kind === 'ability' || kind === 'reward' ? 'wave' : 'dust';
      var pool = this.particlePools[system];
      var made = 0;
      for (var i = 0; i < pool.length && made < count; i++) { var p = pool[i]; if (p.active) continue; var a = Math.random() * Math.PI * 2, speed = kind === 'trail' || kind === 'projectile' ? 90 : 38 + Math.random() * 96; p.active = true; p.x = x; p.y = y; p.vx = Math.cos(a) * speed; p.vy = Math.sin(a) * speed; p.life = p.max = kind === 'tower' || kind === 'terrain' ? 0.8 : 0.42 + Math.random() * 0.26; p.size = kind === 'tower' || kind === 'terrain' ? 3 + Math.random() * 4 : 2 + Math.random() * 3; p.color = color; p.kind = kind; made++; }
    }

    addBurst(x, y, color, count, kind) { this.addParticle(x, y, color, Math.min(count, 24), kind); this.showToast(kind === 'tower' ? 'TOWER DOWN' : kind === 'reward' ? 'LAST HIT' : '', kind === 'tower' ? COLORS.gold : color); }

    updateParticles(dt) { PARTICLE_SYSTEMS.forEach(function (system) { this.particlePools[system].forEach(function (p) { if (!p.active) return; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.965; p.vy = p.vy * 0.965 + (p.kind === 'tower' || p.kind === 'terrain' ? 34 : 12) * dt; if (p.life <= 0) p.active = false; }); }, this); }

    buy(index) {
      var p = this.player, item = SHOP[index]; if (!p || !item || p.items[index] || p.gold < item.cost) { if (p && item) this.showToast('NEED ' + item.cost + 'G', COLORS.amber); return; }
      p.gold -= item.cost; this.gold = p.gold; p.items[index] = true; if (index === 0) { p.maxHp += 60; p.hp += 60; } else if (index === 1) p.speed *= 1.18; else p.damage += 10; this.showToast(item.name, item.color); this.addBurst(p.x, p.y, item.color, 8, 'reward'); this.sound('confirm');
    }

    finish(win) {
      if (this.mode !== 'playing' && this.mode !== 'trial' && this.mode !== 'ladder') return;
      var oldMode = this.mode, seconds = this.simTime; this.result = { win: !!win, oldMode: oldMode, seconds: seconds, lane: this.lane.name, gold: Math.floor(this.gold), medal: 0, medals: { tower: 0, streak: 0, gold: 0 }, message: win ? 'FAR TOWER BROKEN' : 'THE RIDGE HOLDS' };
      if (win) {
        profile.wins++; profile.streak++; profile.bestStreak = Math.max(profile.bestStreak, profile.streak); profile.bestTime = profile.bestTime ? Math.min(profile.bestTime, seconds) : seconds; profile.mastery[heroFor(this.selected).id] = (profile.mastery[heroFor(this.selected).id] || 0) + 1;
        if (oldMode === 'trial') { var medal = seconds < 42 && this.gold >= 360 ? 3 : seconds < 68 ? 2 : 1; this.result.medal = medal; profile.trialMedals[this.trialIndex] = Math.max(profile.trialMedals[this.trialIndex], medal); }
        else { this.result.medals.tower = seconds < 100 ? 3 : seconds < 160 ? 2 : 1; this.result.medals.streak = profile.streak >= 5 ? 3 : profile.streak >= 3 ? 2 : 1; this.result.medals.gold = this.gold >= 700 ? 3 : this.gold >= 480 ? 2 : 1; }
        if (oldMode === 'ladder') profile.ladderProgress = Math.max(profile.ladderProgress, this.lane.id === 'summit' ? 4 : (this.lane.heat || 1));
        this.sound('victory'); this.banner = { title: 'MATCH WIN', subtitle: 'STREAK ' + profile.streak + '  ·  MASTERY +1', time: 1.7, duration: 1.7 };
      } else { profile.losses++; profile.streak = 0; this.sound('defeat'); }
      this.saveProfile(); this.clearClaimedPointers(); this.mode = 'results'; this.hudImage.setVisible(true); this.syncBridge(); this.redraw();
    }

    rematch() { kit.restart(); var r = this.result; if (!r) { this.setMode('menu'); return; } if (r.oldMode === 'trial') this.startTrial(this.trialIndex); else if (r.oldMode === 'ladder') this.startLadder(this.lane.id === 'summit' ? 3 : (this.lane.heat || 1) - 1); else this.startMatch('main', 'playing'); }

    saveProfile() { kit.save.set(profile); }

    showToast(text, color) { if (!text) return; this.toast.text = String(text).slice(0, 22); this.toast.color = color || COLORS.gold; this.toast.time = 1.0; }
    showCoach(text) { this.coach.text = text || ''; this.coach.time = text ? 3.2 : 0; }
    sound(name) { kit.audio.sfx(name); }

    syncBridge() {
      var p = this.player, tower = this.towers[3]; bridgeState.mode = this.mode; bridgeState.hero = heroFor(this.selected).name; bridgeState.heroIndex = this.selected; bridgeState.gold = Math.floor(p ? p.gold : this.gold || 0); bridgeState.towerHP = Math.floor(tower ? tower.hp : 0); bridgeState.clock = Math.max(0, (this.lane && this.lane.limit ? this.lane.limit : 0) - this.simTime); bridgeState.lane = this.lane ? this.lane.id : 'menu'; bridgeState.wave = this.waveNo; bridgeState.heat = this.lane.heat || 0; bridgeState.trialIndex = this.trialIndex; bridgeState.checkpoint = this.checkpoint ? this.checkpoint.owner : 'neutral'; bridgeState.checkpointProgress = this.checkpoint ? Math.round(this.checkpoint.progress) : 0;
    }

    update(time, delta) {
      this.juiceState = kit.juice.frame(); var frameSeconds = Math.max(0, Number(delta) || 0) / 1000; this.accumulator += frameSeconds; var steps = 0;
      while (!kit.paused && !this.juiceState.frozen && this.accumulator >= FIXED_STEP && steps < 120) { this.accumulator -= FIXED_STEP; this.stepSim(FIXED_STEP); steps++; }
      this.visualTime += kit.paused ? 0 : frameSeconds; this.syncBridge(); this.redraw();
    }

    redraw() {
      var dx = this.juiceState ? this.juiceState.dx : 0, dy = this.juiceState ? this.juiceState.dy : 0; if (this.cameras && this.cameras.main) this.cameras.main.setScroll(-dx, -dy);
      this.hideTexts(); this.buttons.length = 0; this.decalLayer.clear(); this.unitsLayer.clear(); this.fxLayer.clear(); this.uiLayer.clear();
      var active = this.mode === 'playing' || this.mode === 'trial' || this.mode === 'ladder' || this.mode === 'results'; this.hudImage.setVisible(active); this.boardImage.setVisible(true);
      if (active) { this.drawArena(); this.drawDecals(); this.drawUnits(); this.drawParticles(); this.drawHud(); if (this.mode !== 'results') this.drawControls(); else this.drawResults(); }
      else if (this.mode === 'hero-select') this.drawHeroSelect();
      else if (this.mode === 'trial-select') this.drawTrialSelect();
      else if (this.mode === 'ladder-select') this.drawLadderSelect();
      else this.drawMenu();
      this.drawToastAndCoach();
    }

    drawArena() {
      var lane = this.lane, cp = this.checkpoint, owner = cp ? cp.owner.toUpperCase() : 'NEUTRAL', cpColor = cp && cp.owner === 'blue' ? COLORS.cyan : cp && cp.owner === 'red' ? COLORS.coral : COLORS.gold; this.uiText('place', lane.place, 36, 104, 20, lane.accent, 0, '700'); this.uiText('checkpoint', 'CHECKPOINT  ' + owner + '  ' + (cp ? Math.round(Math.abs(cp.progress)) : 0) + '%', 480, 104, 16, cpColor, 0.5, '800'); this.uiText('feature', '◈  ' + lane.feature, 924, 104, 20, COLORS.muted, 1, '700');
    }

    ring(g, x, y, radius, width, color, alpha) {
      var steps = 24; g.lineStyle(width, hex(color), alpha); g.beginPath();
      for (var i = 0; i <= steps; i++) { var angle = Math.PI * 2 * i / steps; var px = x + Math.cos(angle) * radius; var py = y + Math.sin(angle) * radius; if (i === 0) g.moveTo(px, py); else g.lineTo(px, py); }
      g.closePath(); g.strokePath();
    }

    drawDecals() {
      var g = this.decalLayer, lane = this.lane, pulse = 0.5 + Math.sin(this.simTime * 4) * 0.5, p = this.player;
      g.lineStyle(2, hex(lane.accent), 0.22); g.lineBetween(70, LANE_Y - 46, 890, LANE_Y - 46); g.lineBetween(70, LANE_Y + 46, 890, LANE_Y + 46);
      var zones = lane.terrain || [];
      for (var z = 0; z < zones.length; z++) { var zone = zones[z]; if (zone.id === 'river-cut') continue; g.fillStyle(hex(zone.color), zone.id === 'checkpoint' ? 0.08 + pulse * 0.04 : 0.055); g.fillRoundedRect(zone.x, zone.y, zone.w, zone.h, 16); g.lineStyle(zone.id === 'checkpoint' ? 2 : 1, hex(zone.color), zone.id === 'checkpoint' ? 0.65 : 0.28); g.strokeRoundedRect(zone.x, zone.y, zone.w, zone.h, 16); }
      if (this.checkpoint) { var cp = this.checkpoint, cpColor = cp.owner === 'blue' ? COLORS.cyan : cp.owner === 'red' ? COLORS.coral : COLORS.gold; this.ring(g, cp.x, cp.y, cp.radius + Math.sin(this.simTime * 5) * 3, 3, cpColor, 0.85); g.fillStyle(hex(cpColor), 0.15); g.fillCircle(cp.x, cp.y, 17 + Math.abs(cp.progress) * 0.12); }
      if (lane.hazard === 'gust') { for (var x = 310 + (this.simTime * 72) % 150; x < 660; x += 80) { g.lineStyle(2, hex(COLORS.cyan), 0.27); g.lineBetween(x, LANE_Y - 72, x + 24, LANE_Y - 72); g.lineBetween(x + 24, LANE_Y - 72, x + 16, LANE_Y - 80); } }
      if (lane.hazard === 'vents' || lane.hazard === 'shards') { g.fillStyle(hex(COLORS.amber), 0.08 + pulse * 0.04); g.fillCircle(320, LANE_Y - 78, 20); g.fillCircle(642, LANE_Y + 76, 20); this.ring(g, 320, LANE_Y - 78, 22, 2, COLORS.amber, 0.35 + pulse * 0.25); this.ring(g, 642, LANE_Y + 76, 22, 2, COLORS.amber, 0.35 + pulse * 0.25); }
      if (lane.hazard === 'storm' || lane.hazard === 'rime') { g.lineStyle(2, hex(COLORS.violet), 0.28); g.lineBetween(470, 138, 505, 154); g.lineBetween(505, 154, 484, 169); g.lineBetween(484, 169, 518, 184); }
      if (lane.hazard === 'mirror') { this.ring(g, 332, 270, 30 + pulse * 3, 2, COLORS.violet, 0.55); this.ring(g, 628, 270, 30 + pulse * 3, 2, COLORS.violet, 0.55); }
      if (lane.hazard === 'lantern') { g.fillStyle(hex(COLORS.amber), 0.16 + pulse * 0.08); g.fillCircle(330, 154, 14); g.fillCircle(630, 154, 14); }
      if (lane.hazard === 'salt') { g.lineStyle(2, hex(COLORS.white), 0.35); g.lineBetween(300, 310, 320, 286); g.lineBetween(320, 286, 340, 310); g.lineBetween(620, 310, 640, 286); g.lineBetween(640, 286, 660, 310); }
      var far = this.towers[3]; if (far && far.alive) { var range = 142, edge = far.x - range; g.fillStyle(hex(COLORS.coral), p && Math.abs(p.x - far.x) < range ? 0.10 : 0.035); g.fillRect(edge, LANE_Y - 64, range, 128); g.lineStyle(2, hex(COLORS.coral), p && Math.abs(p.x - far.x) < range ? 0.65 : 0.25); g.lineBetween(edge, LANE_Y - 64, edge, LANE_Y + 64); g.lineBetween(far.x, LANE_Y - 64, far.x, LANE_Y + 64); }
      for (var i = 0; i < this.entities.length; i++) { var e = this.entities[i]; if (!e.active || !e.alive || e.telegraph <= 0) continue; var t = this.entityById(e.telegraphTarget) || e; var r = 30 + pulse * 5; g.fillStyle(hex(COLORS.amber), 0.07); g.fillCircle(t.x, t.y, r); this.ring(g, t.x, t.y, r, 2, COLORS.amber, 0.75); g.lineBetween(t.x - r - 8, t.y, t.x - r + 2, t.y); g.lineBetween(t.x + r - 2, t.y, t.x + r + 8, t.y); }
      if (p && p.alive) { var last = this.lastHitTarget(); if (last) { this.ring(g, last.x, last.y, last.radius + 8, 2, COLORS.amber, 0.9); this.ring(g, last.x, last.y, last.radius + 12, 1, COLORS.gold, 0.45); } var selected = this.selectedTarget(); if (selected && selected.entity) this.ring(g, selected.entity.x, selected.entity.y, selected.entity.radius + 16, 2, COLORS.white, 0.85); if (selected && selected.tower) this.ring(g, selected.tower.x, selected.tower.y - 8, 44, 2, COLORS.white, 0.85); }
    }

    lastHitTarget() { var p = this.player, best = null, bestDistance = 9999; if (!p || !p.alive) return null; var range = this.effectiveRange(p), damage = p.damage * this.effectsAt(p.x, p.y, p.team).damage; for (var i = 0; i < this.entities.length; i++) { var e = this.entities[i]; if (!e.active || !e.alive || e.team !== 'red' || e.kind !== 'minion') continue; var d = dist(p, e), lethal = damage * this.effectsAt(e.x, e.y, e.team).defense; if (d <= range && e.hp <= lethal * 1.08 && d < bestDistance) { best = e; bestDistance = d; } } return best; }

    drawUnits() {
      var g = this.unitsLayer;
      for (var i = 0; i < this.towers.length; i++) this.drawTower(g, this.towers[i]);
      for (var j = 0; j < this.entities.length; j++) { var e = this.entities[j]; if (e.active && (e.alive || e.defeat > 0) && e.kind === 'minion') this.drawMinion(g, e); }
      for (var k = 0; k < this.entities.length; k++) { var h = this.entities[k]; if (h.active && h.kind === 'hero' && (h.alive || h.respawn > 0 || h.defeat > 0)) this.drawHero(g, h); }
    }

    drawTower(g, t) {
      if (!t.alive) { g.fillStyle(hex('#2c4248'), 0.55); g.fillRoundedRect(t.x - 26, t.y - 18, 52, 34, 8); g.lineStyle(2, hex('#718092'), 0.40); g.strokeRoundedRect(t.x - 26, t.y - 18, 52, 34, 8); return; }
      var c = t.team === 'blue' ? COLORS.teal : COLORS.coral, dark = t.team === 'blue' ? COLORS.tealDeep : COLORS.wine;
      g.fillStyle(hex('rgba(4,12,18,0.65)'), 1); g.fillRoundedRect(t.x - 28, t.y + 18, 56, 12, 5);
      g.fillStyle(hex(dark), 1); g.fillRoundedRect(t.x - 18, t.y - 25, 36, 48, 7); g.lineStyle(2, hex(c), 0.95); g.strokeRoundedRect(t.x - 18, t.y - 25, 36, 48, 7);
      g.fillStyle(hex(c), 1); g.fillTriangle(t.x - 22, t.y - 25, t.x, t.y - 49, t.x + 22, t.y - 25); g.fillStyle(hex(COLORS.bone), 0.9); g.fillRect(t.x - 3, t.y - 42, 6, 22); g.fillStyle(hex(c), 1); g.fillRect(t.x - 7, t.y - 37, 14, 4);
      g.fillStyle(hex('rgba(3,10,15,0.8)'), 1); g.fillRoundedRect(t.x - 32, t.y - 62, 64, 7, 3); g.fillStyle(hex(c), 1); g.fillRect(t.x - 32, t.y - 62, 64 * clamp(t.hp / t.maxHp, 0, 1), 7);
      if (t.team === 'red' && t.far) this.ring(g, t.x, t.y - 8, 36 + (t.targeted ? Math.sin(this.simTime * 8) * 2 : 0), 2, COLORS.amber, t.targeted ? 0.95 : 0.55);
    }

    drawMinion(g, e) {
      var c = e.team === 'blue' ? COLORS.teal : COLORS.coral, dark = e.team === 'blue' ? COLORS.tealDeep : COLORS.wine, rs = this.renderState.get(e.id), step = rs.pose === 'move' ? Math.sin(this.visualTime * 18 + rs.t) * 3 : 0, hit = rs.hurt > 0 ? Math.sin(this.visualTime * 52) * 2 : 0, defeated = !e.alive, alpha = defeated ? clamp(e.defeat / 0.42, 0, 1) : 1, y = e.y + (defeated ? 7 : 0), scale = defeated ? 0.72 : rs.pose === 'attack' ? 1.08 : 1;
      g.save(); g.globalAlpha = alpha; g.fillStyle(hex('rgba(2,8,14,0.48)'), 0.9); g.fillEllipse(e.x, e.y + 12, e.radius * 2.3 * scale, 8);
      g.fillStyle(hex(rs.hurt > 0 ? COLORS.white : dark), 1); if (e.ranged) g.fillTriangle(e.x - 12 * scale + hit, y + 9, e.x + hit, y - 12 * scale, e.x + 12 * scale + hit, y + 9); else g.fillRoundedRect(e.x - e.radius * scale + hit, y - e.radius * scale, e.radius * 2 * scale, e.radius * 2 * scale, 5);
      g.lineStyle(2, hex(c), 0.95); if (e.ranged) g.strokeTriangle(e.x - 12 * scale + hit, y + 9, e.x + hit, y - 12 * scale, e.x + 12 * scale + hit, y + 9); else g.strokeRoundedRect(e.x - e.radius * scale + hit, y - e.radius * scale, e.radius * 2 * scale, e.radius * 2 * scale, 5);
      g.fillStyle(hex(c), 1); g.fillRect(e.x + e.face * 4 - 3 + hit, y - 4, 6, 4); if (e.ranged && rs.pose === 'attack') g.lineBetween(e.x + e.face * 9, y - 2, e.x + e.face * 23, y - 2); if (e.hp < e.maxHp && !defeated) this.drawBar(g, e.x, e.y - 23, 30, e.hp / e.maxHp, c); g.restore();
    }

    drawHero(g, e) {
      var h = heroFor(e.heroIndex), c = e.team === 'blue' ? COLORS.teal : COLORS.coral, rs = this.renderState.get(e.id), bob = Math.sin(this.simTime * 3.2 + rs.t) * (rs.pose === 'move' ? 4 : 2), recoil = rs.recoil * (e.face === 1 ? -1 : 1), defeated = !e.alive, alpha = e.respawn > 0 ? 0.34 : defeated ? clamp(e.defeat / 0.55, 0, 1) : 1, hurt = rs.hurt > 0 ? Math.sin(this.visualTime * 52) * 3 : 0, command = rs.pose === 'command' ? Math.sin(this.visualTime * 20) * 3 : 0, lean = rs.pose === 'attack' ? e.face * 5 : rs.pose === 'defeat' ? e.face * -3 : 0;
      g.save(); g.globalAlpha = alpha; g.fillStyle(hex('rgba(2,8,14,0.58)'), 0.9); g.fillEllipse(e.x, e.y + 17, 42, 10); this.ring(g, e.x, e.y + 2, e.isPlayer ? 28 : 23, e.isPlayer ? 3 : 2, e.isPlayer ? COLORS.white : c, e.isPlayer ? 0.95 : 0.75);
      g.fillStyle(hex(rs.hurt > 0 ? COLORS.white : h.dark), 1); g.fillRoundedRect(e.x - 15 + recoil + hurt + lean, e.y - 15 + bob + command, 30, 31, 9); g.fillStyle(hex(h.color), 1); g.fillCircle(e.x + recoil + hurt + lean, e.y - 18 + bob + command, rs.pose === 'command' ? 14 : 12); g.fillStyle(hex('#102029'), 1); g.fillRect(e.x + e.face * 5 - 3 + recoil + hurt + lean, e.y - 21 + bob + command, 6, 4); g.fillStyle(hex(COLORS.bone), 1); g.fillRect(e.x + e.face * 6 - 1 + recoil + hurt + lean, e.y - 21 + bob + command, 2, 2);
      g.fillStyle(hex(c), 1); g.fillRect(e.x - 20 + lean, e.y - 10 + bob + command, 5, 15); g.fillTriangle(e.x + e.face * 17 + lean, e.y - 29 + bob + command, e.x + e.face * (rs.pose === 'command' ? 34 : 30) + lean, e.y - 22 + bob + command, e.x + e.face * 17 + lean, e.y - 16 + bob + command);
      if (rs.pose === 'attack') { g.lineStyle(3, hex(h.color), 0.85); g.lineBetween(e.x + e.face * 12, e.y - 3, e.x + e.face * 38, e.y - 13); } if (rs.pose === 'hurt') { g.lineStyle(2, hex(COLORS.white), 0.75); g.lineBetween(e.x - 22, e.y - 26, e.x + 22, e.y + 18); } if (rs.pose === 'defeat') { g.lineStyle(2, hex(COLORS.coral), 0.7); g.lineBetween(e.x - 20, e.y - 22, e.x + 20, e.y + 18); }
      if (e.isPlayer) this.ring(g, e.x, e.y + 2, 34 + Math.sin(this.simTime * 5) * 2, 2, h.color, 0.9);
      if (e.shield > 0) this.ring(g, e.x, e.y, 31, 2, COLORS.cyan, 0.9);
      if (rs.pose === 'command') this.ring(g, e.x, e.y, 38 + Math.sin(this.visualTime * 14) * 3, 2, h.color, 0.8);
      g.restore();
      if (e.alive || e.respawn > 0) this.drawBar(g, e.x, e.y - 42, e.isPlayer ? 48 : 40, e.hp / e.maxHp, e.team === 'blue' ? COLORS.teal : COLORS.coral);
      if (e.isPlayer && this.mode !== 'results') this.uiText('player-label', h.name, e.x, e.y - 55, 20, h.color, 0.5, '700');
    }

    drawBar(g, x, y, w, ratio, color) { g.fillStyle(hex('rgba(2,8,13,0.78)'), 1); g.fillRoundedRect(x - w / 2, y, w, 7, 3); g.fillStyle(hex(color), 1); g.fillRoundedRect(x - w / 2, y, w * clamp(ratio, 0, 1), 7, 3); }

    drawParticles() { var g = this.fxLayer; for (var q = 0; q < this.projectiles.length; q++) { var bolt = this.projectiles[q]; g.lineStyle(3, hex(bolt.color), 0.8); g.lineBetween(bolt.x - bolt.vx * 0.04, bolt.y - bolt.vy * 0.04, bolt.x, bolt.y); g.fillStyle(hex(bolt.color), 1); g.fillCircle(bolt.x, bolt.y, 4); } PARTICLE_SYSTEMS.forEach(function (system) { this.particlePools[system].forEach(function (p) { if (!p.active) return; var alpha = clamp(p.life / p.max, 0, 1); g.globalAlpha = alpha; g.fillStyle(hex(p.color), 1); if (system === 'projectile') g.fillTriangle(p.x - p.vx * 0.025, p.y - p.vy * 0.025, p.x + p.vy * 0.025, p.y - p.vx * 0.025, p.x - p.vy * 0.025, p.y + p.vx * 0.025); else if (system === 'wave') { g.lineStyle(2, hex(p.color), alpha); g.strokeCircle(p.x, p.y, p.size + (1 - alpha) * 14); } else if (system === 'terrain') g.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2); else g.fillCircle(p.x, p.y, p.size); }); }, this); g.globalAlpha = 1; }

    drawHud() {
      var p = this.player, h = heroFor(this.selected), far = this.towers[3], timer = fmtTime(this.lane.limit - this.simTime), last = this.lastHitTarget();
      this.uiText('title', 'RIDGELINE', 36, 32, 20, COLORS.cyan, 0, '800'); this.uiText('mode', this.lane.name, 36, 57, 18, COLORS.muted, 0, '700'); this.uiText('timer', timer, 480, 40, 26, timer === '00:00' ? COLORS.coral : COLORS.bone, 0.5, '800');
      this.uiText('heat', (this.mode === 'ladder' ? 'HEAT ' + (this.lane.heat || 1) : 'WAVE ' + this.waveNo) + '  BOT +' + Math.round(Math.min(24, profile.streak * 2.5)) + '%', 924, 32, 16, COLORS.amber, 1, '800'); this.uiText('gold', '◆ ' + Math.floor(p ? p.gold : this.gold) + 'G', 924, 58, 20, COLORS.gold, 1, '800');
      var hpRatio = p ? p.hp / p.maxHp : 0; this.uiText('hero-hp', h.name + '  ' + Math.ceil(Math.max(0, p ? p.hp : 0)), 196, 32, 18, h.color, 0.5, '700'); this.uiLayer.fillStyle(hex('rgba(2,8,13,0.78)'), 1); this.uiLayer.fillRoundedRect(116, 51, 160, 8, 4); this.uiLayer.fillStyle(hex(COLORS.teal), 1); this.uiLayer.fillRoundedRect(116, 51, 160 * clamp(hpRatio, 0, 1), 8, 4);
      this.uiText('tower', 'FAR TOWER', 760, 57, 18, COLORS.muted, 1, '700'); this.uiLayer.fillStyle(hex('rgba(2,8,13,0.78)'), 1); this.uiLayer.fillRoundedRect(642, 51, 102, 8, 4); this.uiLayer.fillStyle(hex(COLORS.coral), 1); this.uiLayer.fillRoundedRect(642, 51, 102 * clamp(far ? far.hp / far.maxHp : 0, 0, 1), 8, 4);
      if (last) this.uiText('last-window', '◎ LAST HIT  +35G', 36, 388, 18, COLORS.gold, 0, '800'); else this.uiText('push', 'PUSH TO THE FAR CROWN  ·  HOLD CHECKPOINT', 36, 388, 18, COLORS.muted, 0, '700');
      this.addButton(900, 14, 44, 44, 'settings');
      this.uiText('settings', '⚙', 922, 36, 20, COLORS.muted, 0.5, '800');
      if (this.banner.time > 0) this.drawBoundaryBanner();
    }

    drawControls() {
      var p = this.player, h = heroFor(this.selected); this.uiLayer.fillStyle(hex('rgba(17,54,60,0.65)'), 1); this.uiLayer.fillCircle(92, 473, 39); this.ring(this.uiLayer, 92, 473, 39, 2, COLORS.cyan, 0.75); this.uiLayer.fillStyle(hex('rgba(112,219,190,0.45)'), 1); this.uiLayer.fillCircle(92 + this.stick.x * 21, 473 + this.stick.y * 21, 20); this.uiText('move-label', 'MOVE  ·  WASD / PAD', 92, 510, 13, COLORS.muted, 0.5, '800'); this.addButton(38, 430, 108, 85, 'stick');
      for (var i = 0; i < 3; i++) { var x = 720 + i * 74, y = 431, a = h.abilities[i], cd = p ? p.abilityCd[i] : 0, ready = cd <= 0 && p && p.respawn <= 0; this.uiLayer.fillStyle(hex(ready ? h.dark : '#22343c'), 1); this.uiLayer.fillRoundedRect(x, y, 64, 78, 14); this.uiLayer.lineStyle(2, hex(ready ? h.color : '#53666b'), ready ? 0.95 : 0.65); this.uiLayer.strokeRoundedRect(x, y, 64, 78, 14); this.uiText('ability-' + i + '-icon', a.icon, x + 32, y + 25, 26, ready ? h.color : COLORS.muted, 0.5, '800'); this.uiText('ability-' + i + '-key', a.key, x + 9, y + 65, 18, COLORS.bone, 0, '800'); this.uiText('ability-' + i + '-cd', ready ? 'READY' : Math.ceil(cd) + 's', x + 55, y + 65, 18, ready ? COLORS.cyan : COLORS.amber, 1, '800'); if (!ready) { this.uiLayer.fillStyle(hex(COLORS.amber), 0.24); this.uiLayer.fillRect(x + 4, y + 69, 56 * clamp(1 - cd / a.cd, 0, 1), 4); } this.addButton(x - 4, y - 4, 72, 86, 'ability', { index: i }); }
      for (var s = 0; s < SHOP.length; s++) { var item = SHOP[s], sx = 414 + s * 96, owned = p && p.items[s], can = p && p.gold >= item.cost; this.uiLayer.fillStyle(hex(owned ? '#274038' : can ? '#173c3c' : '#172832'), 1); this.uiLayer.fillRoundedRect(sx, 438, 86, 68, 10); this.uiLayer.lineStyle(1, hex(owned ? COLORS.muted : can ? item.color : '#42545a'), 0.9); this.uiLayer.strokeRoundedRect(sx, 438, 86, 68, 10); this.uiText('shop-icon-' + s, owned ? '✓' : item.icon, sx + 14, 454, 20, owned ? COLORS.cyan : item.color, 0.5, '800'); this.uiText('shop-cost-' + s, owned ? 'OWN' : item.cost + 'G', sx + 75, 454, 18, owned ? COLORS.cyan : COLORS.gold, 1, '800'); this.uiText('shop-name-' + s, item.name, sx + 8, 480, 18, owned ? COLORS.muted : COLORS.bone, 0, '800'); this.uiText('shop-effect-' + s, item.effect, sx + 8, 498, 18, COLORS.muted, 0, '700'); this.addButton(sx - 4, 432, 94, 80, 'shop', { index: s }); }
    }

    drawBoundaryBanner() {
      var b = this.banner, progress = 1 - b.time / Math.max(0.01, b.duration), overshoot = kit.juice.enabled ? Math.sin(Math.min(1, progress) * Math.PI) * 0.06 : 0, w = 580 * (1 + overshoot); this.uiLayer.fillStyle(hex('rgba(5,14,21,0.95)'), 1); this.uiLayer.fillRoundedRect((VIRTUAL_W - w) / 2, 206, w, 92, 18); this.uiLayer.lineStyle(2, hex(COLORS.gold), 0.88); this.uiLayer.strokeRoundedRect((VIRTUAL_W - w) / 2, 206, w, 92, 18); this.uiText('banner-title', b.title, 480, 235, 28, COLORS.white, 0.5, '800'); this.uiText('banner-sub', b.subtitle, 480, 270, 15, COLORS.gold, 0.5, '700');
    }

    drawToastAndCoach() {
      if (this.banner.time <= 0 && this.coach.time > 0) { var coachAlpha = clamp(this.coach.time < 0.7 ? this.coach.time / 0.7 : 1, 0, 1); this.uiLayer.fillStyle(hex('rgba(4,12,18,0.82)'), coachAlpha * 0.92); this.uiLayer.fillRect(220, 78, 520, 32); this.uiText('coach', this.coach.text, 480, 94, 18, COLORS.muted, 0.5, '700').setAlpha(coachAlpha); }
      if (this.banner.time <= 0 && this.toast.time > 0 && this.mode !== 'menu') { var alpha = clamp(this.toast.time < 0.25 ? this.toast.time / 0.25 : 1, 0, 1); this.uiLayer.fillStyle(hex('rgba(4,12,18,0.90)'), alpha); this.uiLayer.fillRoundedRect(706, 116, 218, 34, 10); this.uiLayer.lineStyle(1, hex(this.toast.color), alpha); this.uiLayer.strokeRoundedRect(706, 116, 218, 34, 10); this.uiText('toast', this.toast.text, 815, 133, 18, this.toast.color, 0.5, '800').setAlpha(alpha); }
    }

    drawMenu() {
      this.boardImage.setTexture('board-main'); this.uiLayer.fillStyle(hex('rgba(4,13,20,0.72)'), 1); this.uiLayer.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H); this.uiText('menu-kicker', 'FLEET F10  ·  SINGLE-LANE 3v3', 480, 64, 16, COLORS.cyan, 0.5, '800'); this.uiText('menu-title', 'RIDGELINE', 480, 116, 44, COLORS.white, 0.5, '800'); this.uiText('menu-title-2', 'RUMBLE', 480, 160, 44, COLORS.gold, 0.5, '800'); this.uiText('menu-sub', 'MOVE  ·  LAST-HIT  ·  BREAK THE FAR CROWN', 480, 193, 15, COLORS.muted, 0.5, '700');
      var cards = [
        { mode: 'main', x: 92, title: 'MAIN RUMBLE', sub: 'RIDGELINE MAIN', icon: '◆', color: COLORS.teal },
        { mode: 'trial', x: 350, title: 'HERO TRIALS', sub: '1v1 MASTERY CHAIN', icon: '◇', color: COLORS.violet },
        { mode: 'ladder', x: 608, title: 'RUMBLE LADDER', sub: 'ESCALATING BOT HEAT', icon: '▲', color: COLORS.coral }
      ];
      for (var i = 0; i < cards.length; i++) { var c = cards[i]; this.uiLayer.fillStyle(hex('#102934'), 1); this.uiLayer.fillRoundedRect(c.x, 235, 230, 92, 16); this.uiLayer.lineStyle(2, hex(c.color), 0.9); this.uiLayer.strokeRoundedRect(c.x, 235, 230, 92, 16); this.uiText('menu-icon-' + i, c.icon, c.x + 29, 270, 28, c.color, 0.5, '800'); this.uiText('menu-card-' + i, c.title, c.x + 56, 264, 17, COLORS.bone, 0, '800'); this.uiText('menu-card-sub-' + i, c.sub, c.x + 56, 293, 13, COLORS.muted, 0, '700'); this.addButton(c.x, 235, 230, 92, 'mode', { mode: c.mode }); }
      var free = this.freeRotation(); this.uiText('rotation', 'FREE ROTATION  ·  ' + free.map(function (i) { return heroFor(i).name; }).join('  '), 480, 363, 14, COLORS.gold, 0.5, '800'); this.uiText('record', 'WINS ' + profile.wins + '   STREAK ' + profile.streak + '   MASTERY ' + (profile.mastery[heroFor(this.selected).id] || 0), 480, 390, 14, COLORS.muted, 0.5, '700');
      this.uiLayer.fillStyle(hex('#285849'), 1); this.uiLayer.fillRoundedRect(74, 421, 220, 56, 16); this.uiText('tutorial-button', 'TRAINING RIDGE', 184, 449, 15, COLORS.cyan, 0.5, '800'); this.addButton(74, 421, 220, 56, 'mode', { mode: 'tutorial' }); this.uiLayer.fillStyle(hex('#43c7f4'), 1); this.uiLayer.fillRoundedRect(326, 421, 308, 56, 16); this.uiText('hero-button', 'HERO SELECT  ·  ' + heroFor(this.selected).name, 480, 449, 16, COLORS.ink, 0.5, '800'); this.addButton(326, 421, 308, 56, 'mode', { mode: 'heroes' }); this.uiText('menu-hint', 'FIRST TOUCH UNLOCKS AUDIO  ·  SETTINGS LIVE IN THE GEAR', 480, 505, 13, COLORS.muted, 0.5, '700'); this.addButton(902, 18, 42, 42, 'settings'); this.uiText('menu-settings', '⚙', 923, 39, 20, COLORS.muted, 0.5, '800');
    }

    freeRotation() { var base = (Math.floor(profile.wins / 2) % HEROES.length); return [base, (base + 2) % HEROES.length, (base + 4) % HEROES.length]; }

    drawHeroSelect() {
      this.uiLayer.fillStyle(hex('rgba(4,13,20,0.78)'), 1); this.uiLayer.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H); this.uiText('select-title', 'CHOOSE YOUR RUNNER', 52, 54, 28, COLORS.white, 0, '800'); this.uiText('select-sub', 'ALL HEROES ARE IN ROTATION  ·  DROP GENEROUSLY', 52, 84, 14, COLORS.gold, 0, '700'); this.addButton(34, 18, 84, 44, 'back'); this.uiText('select-back', '← HUB', 76, 40, 14, COLORS.muted, 0.5, '800');
      var free = this.freeRotation(); var cw = 268, ch = 112; for (var i = 0; i < HEROES.length; i++) { var h = heroFor(i), x = 52 + (i % 3) * 286, y = 120 + Math.floor(i / 3) * 132, active = i === this.selected, isFree = free.indexOf(i) >= 0; this.uiLayer.fillStyle(hex(active ? h.dark : '#122a35'), 1); this.uiLayer.fillRoundedRect(x, y, cw, ch, 16); this.uiLayer.lineStyle(active ? 3 : 1, hex(active ? COLORS.white : h.color), active ? 0.96 : 0.65); this.uiLayer.strokeRoundedRect(x, y, cw, ch, 16); this.uiLayer.fillStyle(hex(h.color), 1); this.uiLayer.fillCircle(x + 36, y + 46, 22); this.uiText('hero-icon-' + i, h.id.slice(0, 1).toUpperCase(), x + 36, y + 47, 19, COLORS.ink, 0.5, '800'); this.uiText('hero-name-' + i, h.name, x + 70, y + 32, 18, h.color, 0, '800'); this.uiText('hero-role-' + i, h.role, x + 70, y + 58, 13, COLORS.bone, 0, '700'); this.uiText('hero-kit-' + i, h.abilities[0].name + '  ·  ' + h.abilities[1].name + '  ·  ' + h.abilities[2].name, x + 70, y + 83, 11, COLORS.muted, 0, '700'); this.uiText('hero-free-' + i, isFree ? 'FREE ROTATION' : 'OPEN DROP', x + 70, y + 103, 11, COLORS.gold, 0, '800'); this.addButton(x, y, cw, ch, 'hero', { index: i }); }
      var hsel = heroFor(this.selected); this.uiLayer.fillStyle(hex(hsel.color), 1); this.uiLayer.fillRoundedRect(318, 407, 324, 58, 15); this.uiText('drop-button', 'DROP IN AS ' + hsel.name, 480, 436, 17, COLORS.ink, 0.5, '800'); this.addButton(318, 407, 324, 58, 'drop');
    }

    medalText(value) { return value >= 3 ? 'GOLD' : value === 2 ? 'SILVER' : value === 1 ? 'BRONZE' : 'LOCKED'; }

    drawTrialSelect() {
      this.uiLayer.fillStyle(hex('rgba(4,13,20,0.78)'), 1); this.uiLayer.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H); this.uiText('trial-title', 'HERO TRIALS', 52, 54, 28, COLORS.white, 0, '800'); this.uiText('trial-sub', 'HAND-AUTHORED 1v1 DUELS  ·  BREAK THE FAR TOWER', 52, 84, 14, COLORS.violet, 0, '700'); this.addButton(34, 18, 84, 44, 'back'); this.uiText('trial-back', '← HUB', 76, 40, 14, COLORS.muted, 0.5, '800');
      for (var i = 0; i < TRIALS.length; i++) { var t = TRIALS[i], l = laneFor(t.lane), medal = profile.trialMedals[i], unlocked = i === 0 || profile.trialMedals[i - 1] >= 1, x = 60 + i * 218, y = 155; this.uiLayer.fillStyle(hex(unlocked ? '#273545' : '#17242d'), 1); this.uiLayer.fillRoundedRect(x, y, 190, 190, 16); this.uiLayer.lineStyle(2, hex(unlocked ? l.accent : '#4b5a5e'), 0.85); this.uiLayer.strokeRoundedRect(x, y, 190, 190, 16); this.uiText('trial-no-' + i, '0' + (i + 1), x + 18, y + 27, 16, l.accent, 0, '800'); this.uiText('trial-name-' + i, t.name, x + 18, y + 58, 15, COLORS.bone, 0, '800'); this.uiText('trial-foe-' + i, 'VS  ' + heroFor(t.foe).name, x + 18, y + 85, 13, COLORS.muted, 0, '700'); this.uiText('trial-medal-' + i, medalText(medal), x + 18, y + 124, 16, medal >= 3 ? COLORS.gold : medal === 2 ? '#d4e4e8' : medal === 1 ? '#d59662' : COLORS.muted, 0, '800'); this.uiText('trial-unlock-' + i, unlocked ? 'TAP TO DUEL' : t.unlock + ' TO OPEN', x + 18, y + 160, 12, unlocked ? COLORS.cyan : COLORS.muted, 0, '800'); this.addButton(x, y, 190, 190, 'trial', { index: i }); }
      this.uiText('trial-chain', 'BRONZE OPENS THE NEXT ARENA  ·  SILVER CUTS TIME  ·  GOLD OWNS THE SUMMIT', 480, 402, 13, COLORS.gold, 0.5, '700'); this.uiText('trial-note', 'Each win adds mastery to the selected hero.', 480, 435, 13, COLORS.muted, 0.5, '700');
    }

    drawLadderSelect() {
      this.uiLayer.fillStyle(hex('rgba(4,13,20,0.78)'), 1); this.uiLayer.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H); this.uiText('ladder-title', 'RUMBLE LADDER', 52, 54, 28, COLORS.white, 0, '800'); this.uiText('ladder-sub', '3v3 BOTS  ·  HEAT RISES WITH YOUR STREAK', 52, 84, 14, COLORS.coral, 0, '700'); this.addButton(34, 18, 84, 44, 'back'); this.uiText('ladder-back', '← HUB', 76, 40, 14, COLORS.muted, 0.5, '800');
      var names = ['EMBER RUN', 'GLASS PASS', 'BLACK PINE', 'RIDGELINE SUMMIT']; for (var i = 0; i < 4; i++) { var unlocked = i <= profile.ladderProgress, x = 74 + i * 220, y = 171, col = i === 3 ? COLORS.gold : i === profile.ladderProgress ? COLORS.coral : COLORS.muted; this.uiLayer.fillStyle(hex(unlocked ? '#3d2931' : '#17242d'), 1); this.uiLayer.fillRoundedRect(x, y, 190, 142, 16); this.uiLayer.lineStyle(2, hex(col), 0.85); this.uiLayer.strokeRoundedRect(x, y, 190, 142, 16); this.uiText('rung-' + i, 'RUNG 0' + (i + 1), x + 18, y + 26, 14, col, 0, '800'); this.uiText('rung-name-' + i, names[i], x + 18, y + 57, 15, COLORS.bone, 0, '800'); this.uiText('rung-heat-' + i, 'HEAT  ' + (i === 3 ? 5 : i + 1), x + 18, y + 88, 13, COLORS.amber, 0, '800'); this.uiText('rung-state-' + i, unlocked ? 'TAP TO DROP' : 'WIN PREVIOUS', x + 18, y + 116, 12, unlocked ? COLORS.cyan : COLORS.muted, 0, '800'); this.addButton(x, y, 190, 142, 'ladder', { index: i }); }
      this.uiText('ladder-record', 'BEST STREAK  ' + profile.bestStreak + '  ·  CURRENT HEAT ' + (Math.max(1, profile.streak + 1)), 480, 384, 15, COLORS.gold, 0.5, '800'); this.uiText('ladder-note', 'Generous gold every wave. Spend it before the next push.', 480, 418, 13, COLORS.muted, 0.5, '700');
    }

    drawResults() {
      var r = this.result || { win: false, oldMode: 'playing', seconds: 0, gold: 0, medal: 0, medals: { tower: 0, streak: 0, gold: 0 }, message: 'RUN ENDED' }, col = r.win ? COLORS.cyan : COLORS.coral; this.uiLayer.fillStyle(hex('rgba(3,10,16,0.80)'), 1); this.uiLayer.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H); this.uiLayer.fillStyle(hex('rgba(5,14,21,0.96)'), 1); this.uiLayer.fillRoundedRect(190, 86, 580, 286, 22); this.uiLayer.lineStyle(2, hex(col), 0.9); this.uiLayer.strokeRoundedRect(190, 86, 580, 286, 22); this.uiText('result-title', r.win ? 'MATCH WIN' : 'LANE LOST', 480, 135, 34, col, 0.5, '800'); this.uiText('result-message', r.message, 480, 171, 16, COLORS.bone, 0.5, '800'); this.uiText('result-line-1', 'TIME  ' + fmtTime(r.seconds) + '     GOLD  ' + r.gold + 'G', 480, 216, 15, COLORS.gold, 0.5, '800'); this.uiText('result-line-2', 'STREAK  ' + profile.streak + '     MASTERY  +' + (r.win ? '1' : '0'), 480, 244, 15, COLORS.muted, 0.5, '700'); if (r.oldMode === 'trial') this.uiText('result-medal', 'MEDAL  ' + this.medalText(r.medal), 480, 278, 18, r.medal >= 3 ? COLORS.gold : r.medal === 2 ? '#d4e4e8' : r.medal === 1 ? '#d59662' : COLORS.muted, 0.5, '800'); else this.uiText('result-medal', 'TOWER ' + this.medalText(r.medals.tower) + '  ·  STREAK ' + this.medalText(r.medals.streak) + '  ·  GOLD ' + this.medalText(r.medals.gold), 480, 278, 16, r.win ? COLORS.gold : COLORS.muted, 0.5, '800');
      this.uiLayer.fillStyle(hex(col), 1); this.uiLayer.fillRoundedRect(238, 404, 190, 56, 15); this.uiText('rematch', 'REMATCH', 333, 432, 16, COLORS.ink, 0.5, '800'); this.addButton(238, 404, 190, 56, 'result-rematch'); this.uiLayer.fillStyle(hex('#1e3944'), 1); this.uiLayer.fillRoundedRect(448, 404, 128, 56, 15); this.uiText('result-hero-button', 'HERO', 512, 432, 15, COLORS.bone, 0.5, '800'); this.addButton(448, 404, 128, 56, 'result-hero'); this.uiLayer.fillStyle(hex('#1e3944'), 1); this.uiLayer.fillRoundedRect(596, 404, 128, 56, 15); this.uiText('hub', 'HUB', 660, 432, 15, COLORS.bone, 0.5, '800'); this.addButton(596, 404, 128, 56, 'result-hub');
    }

    draw() {}
  }

  var config = {
    type: Phaser.AUTO, parent: 'game-shell', backgroundColor: COLORS.ink, width: VIRTUAL_W, height: VIRTUAL_H,
    render: { antialias: true, roundPixels: true, pixelArt: false },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: VIRTUAL_W, height: VIRTUAL_H },
    input: { activePointers: 8 }, scene: [RumbleScene]
  };
  var game = new Phaser.Game(config);
  bridge.game = game;
}());
