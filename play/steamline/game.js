'use strict';
/* Steamline - timetable route sim. Phaser is the view and input surface;
 * GGKit owns lifecycle, pointer identity, persistence, settings and audio. */
(function () {
  var R = window.SL_RAIL;
  var STEP = 1 / 60;
  var MAX_STEPS = 2;
  var MAX_TRAINS = 32;
  var MAX_PARTICLES = 180;
  var MAX_SMOKE = 84;
  var MAX_RAIL_SPARKS = 72;
  var MAX_DELIVERY_FX = 72;
  var MAX_TOKEN_FX = 48;
  var MAX_IMPACT_FX = 72;
  var TRAIN_COLLISION_RADIUS = 44;
  var TRAIN_NEAR_MISS_RADIUS = 82;
  var COLORS = ['#f26767', '#55c7e8', '#f2c45e', '#56d6a6', '#b995f1'];
  var COLOR_NAMES = ['RUBY', 'AZURE', 'GOLD', 'MINT', 'VIOLET'];
  var COLOR_SHAPES = ['triangle', 'circle', 'diamond', 'square', 'star'];
  var COLOR_HEX = [0xf26767, 0x55c7e8, 0xf2c45e, 0x56d6a6, 0xb995f1];
  var COLOR_LIGHT = [0xffaaa2, 0xa8efff, 0xffe4a0, 0xa9f5d1, 0xe1cfff];

  var SHIFT_LIST = [
    { key: 'morning-rush', name: 'Morning Rush', strap: 'tutorial pace • civic loop', accent: 0xf2c45e, start: 2, target: 8, patience: 38, base: 5.3, min: 2.8, cargo: 0.12, score: 1.0, next: 'peak-hour' },
    { key: 'peak-hour', name: 'Peak Hour', strap: 'dense traffic • many colours', accent: 0x55c7e8, start: 3, target: 12, patience: 34, base: 4.2, min: 2.0, cargo: 0.22, score: 1.12, next: 'night-freight' },
    { key: 'night-freight', name: 'Night Freight', strap: 'long patience • bonus cargo', accent: 0xb995f1, start: 3, target: 14, patience: 49, base: 4.9, min: 2.35, cargo: 0.48, score: 1.35, next: 'full-network' },
    { key: 'full-network', name: 'Full Network Finale', strap: 'all yards • master timetable', accent: 0xf26767, start: 4, target: 18, patience: 42, base: 3.65, min: 1.65, cargo: 0.58, score: 1.6, next: null }
  ];
  var SHIFT_BY_KEY = {};
  SHIFT_LIST.forEach(function (s) { SHIFT_BY_KEY[s.key] = s; });
  var LAYOUT_KEYS = ['city-loop', 'mountain-switchback', 'coastal-freight', 'night-terminal'];
  var MEDAL_KEYS = {};
  SHIFT_LIST.forEach(function (shift) { LAYOUT_KEYS.forEach(function (layout) { MEDAL_KEYS[shift.key + ':' + layout] = true; }); });

  function hex(v) { return typeof v === 'number' ? v : parseInt(String(v).replace('#', ''), 16) || 0xffffff; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function setTextIfChanged(obj, value) {
    value = String(value);
    if (obj && obj.text !== value) obj.setText(value);
  }
  function shiftFor(key) { return SHIFT_BY_KEY[key] || SHIFT_BY_KEY['morning-rush']; }
  function layoutFor(key) { return R.buildLayout(key || 'city-loop'); }
  function validShift(key) { return !!SHIFT_BY_KEY[key]; }
  function validLayout(key) { return !!(R.defs && R.defs[key]); }
  function shiftKeyFor(key) { if (typeof key === 'number' && Number.isFinite(key)) return SHIFT_LIST[clamp(Math.floor(key), 0, SHIFT_LIST.length - 1)].key; return validShift(key) ? key : 'morning-rush'; }
  function layoutKeyFor(key) { if (typeof key === 'number' && Number.isFinite(key)) return LAYOUT_KEYS[clamp(Math.floor(key), 0, LAYOUT_KEYS.length - 1)]; return validLayout(key) ? key : 'city-loop'; }
  function defaultProfile() {
    return { v: 2, best: 0, runs: 0, unlockedShifts: ['morning-rush'], unlockedLayouts: ['city-loop'], medals: {} };
  }
  function hasKey(list, key) { return Array.isArray(list) && list.indexOf(key) >= 0; }
  function validateProfile(o) {
    if (!o || o.v !== 2 || !Number.isSafeInteger(o.best) || o.best < 0 || o.best > 99999999 ||
      !Number.isSafeInteger(o.runs) || o.runs < 0 || o.runs > 999999) return false;
    if (!Array.isArray(o.unlockedShifts) || !Array.isArray(o.unlockedLayouts) || !o.medals) return false;
    if (!hasKey(o.unlockedShifts, 'morning-rush') || !hasKey(o.unlockedLayouts, 'city-loop')) return false;
    if (o.unlockedShifts.length > SHIFT_LIST.length || o.unlockedLayouts.length > LAYOUT_KEYS.length) return false;
    for (var i = 0; i < o.unlockedShifts.length; i++) {
      if (!validShift(o.unlockedShifts[i]) || o.unlockedShifts.indexOf(o.unlockedShifts[i]) !== i) return false;
    }
    for (var j = 0; j < o.unlockedLayouts.length; j++) {
      if (!validLayout(o.unlockedLayouts[j]) || o.unlockedLayouts.indexOf(o.unlockedLayouts[j]) !== j) return false;
    }
    if (Object.prototype.toString.call(o.medals) !== '[object Object]') return false;
    for (var k in o.medals) if (Object.prototype.hasOwnProperty.call(o.medals, k) &&
      (!MEDAL_KEYS[k] || !Number.isSafeInteger(o.medals[k]) || o.medals[k] < 0 || o.medals[k] > 3)) return false;
    return true;
  }

  var debugState = { mode: 'boot', score: 0, combo: 0, layout: 'city-loop', shift: 'morning-rush', delivered: 0, medals: 0 };
  var pendingShift = null, pendingLayout = null, mainScene = null, kit = null;
  window.__sl = {
    state: debugState,
    forceShift: function (key) {
      pendingShift = shiftKeyFor(key);
      debugState.shift = pendingShift;
      if (mainScene) mainScene.forceShift(pendingShift);
    },
    forceLayout: function (key) {
      pendingLayout = layoutKeyFor(key);
      debugState.layout = pendingLayout;
      if (mainScene) mainScene.forceLayout(pendingLayout);
    }
  };

  function readInsets() {
    var probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;inset:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);pointer-events:none;visibility:hidden;';
    document.body.appendChild(probe);
    var cs = getComputedStyle(probe);
    var out = { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
    probe.remove();
    return out;
  }

  var profile;
  function persist() { if (kit) kit.save.set(profile); }
  function unlockAfter(shift) {
    var beforeLayouts = profile.unlockedLayouts.length;
    if (shift.next && profile.unlockedShifts.indexOf(shift.next) < 0) profile.unlockedShifts.push(shift.next);
    if (shift.key === 'morning-rush' && profile.unlockedLayouts.indexOf('mountain-switchback') < 0) profile.unlockedLayouts.push('mountain-switchback');
    if (shift.key === 'peak-hour' && profile.unlockedLayouts.indexOf('coastal-freight') < 0) profile.unlockedLayouts.push('coastal-freight');
    if (shift.key === 'night-freight' && profile.unlockedLayouts.indexOf('night-terminal') < 0) profile.unlockedLayouts.push('night-terminal');
    if (mainScene) mainScene.newLayoutUnlocked = profile.unlockedLayouts.length > beforeLayouts;
  }

  kit = GGKit.create({
    slug: 'steamline', orientation: 'landscape', validateSave: validateProfile,
    onPause: function () { if (mainScene && mainScene.scene.isActive()) mainScene.scene.pause(); },
    onResume: function () { if (mainScene && mainScene.scene.isPaused()) mainScene.scene.resume(); },
    onRestart: function () { if (mainScene) mainScene.restartToSelect(); }
  });
  profile = kit.save.get(defaultProfile());
  if (!validateProfile(profile)) profile = defaultProfile();
  kit.registerPWA();

  function claimPointer(pointer, zone) {
    var id = pointer && pointer.id != null ? pointer.id : pointer && pointer.pointerId != null ? pointer.pointerId : 0;
    var p = kit.input.pointers.get(id);
    if (!p) {
      p = { x: pointer && pointer.x || 0, y: pointer && pointer.y || 0, startX: pointer && pointer.x || 0, startY: pointer && pointer.y || 0, downAt: performance.now(), zone: null };
      kit.input.pointers.set(id, p);
    }
    p.x = pointer && pointer.x || p.x; p.y = pointer && pointer.y || p.y; p.zone = zone || p.zone; p.claimed = true;
    return { id: id, point: p };
  }
  function pointerEntry(pointer) {
    var id = pointer && pointer.id != null ? pointer.id : pointer && pointer.pointerId != null ? pointer.pointerId : 0;
    if (mainScene && mainScene.gestures[id]) return { id: id, point: mainScene.gestures[id] };
    var p = kit.input.pointers.get(id);
    if (p) return { id: id, point: p };
    var nearest = null, nearestD = 80;
    kit.input.pointers.forEach(function (item, key) {
      var d = Math.hypot((item.x || 0) - pointer.x, (item.y || 0) - pointer.y);
      if (d < nearestD) { nearestD = d; nearest = { id: key, point: item }; }
    });
    return nearest;
  }

  class BootScene extends Phaser.Scene {
    constructor() { super({ key: 'boot' }); }
    preload() {
      kit.loader.show('STEAMLINE');
      kit.loader.progress(0.16);
      this.load.spritesheet('train_states', 'assets/train_states.svg', { frameWidth: 32, frameHeight: 32 });
      this.load.spritesheet('station_states', 'assets/station_states.svg', { frameWidth: 32, frameHeight: 32 });
      this.load.image('yard_tile', 'assets/yard_tile.svg');
    }
    create() {
      var self = this;
      kit.audio.register({
        music_route: 'assets/music_route.mp3',
        steam_chug: 'assets/sfx_steam_chug.mp3',
        whistle: 'assets/sfx_whistle.mp3',
        station_bell: 'assets/sfx_station_bell.mp3',
        crowd_murmur: 'assets/sfx_crowd_murmur.mp3',
        danger: 'assets/sfx_danger.mp3',
        miss: 'assets/sfx_miss.mp3',
        pickup: 'assets/sfx_pickup.mp3',
        ui_select: 'assets/sfx_ui_select.mp3',
        switch_throw: 'assets/sfx_switch_throw.mp3',
        music_danger: 'assets/music_danger.mp3'
      });
      kit.audio.preload(['steam_chug', 'whistle', 'station_bell', 'crowd_murmur', 'danger', 'miss', 'pickup', 'ui_select', 'switch_throw', 'music_route', 'music_danger']).then(function () {
        kit.loader.progress(1);
        kit.loader.hide();
        self.scene.start('main');
      });
    }
  }

  class MainScene extends Phaser.Scene {
    constructor() {
      super({ key: 'main' });
      this.mode = 'title'; this.accum = 0; this.simTime = 0; this.cosmeticTime = 0;
      this.score = 0; this.combo = 0; this.bestCombo = 0; this.delivered = 0; this.missed = 0;
      this.nearMisses = 0; this.over = false; this.selected = -1; this.selectedShift = 'morning-rush'; this.selectedLayout = 'city-loop';
      this.layout = null; this.shift = null; this.activeJunctions = 2; this.nextSpawn = 0; this.shiftElapsed = 0;
      this.clearCountdown = -1; this.tutorialStep = 0; this.bannerT = 0; this.bannerQueue = []; this.bannerKind = 'event'; this.flashT = 0;
      this.rng = R.mulberry32(0x51EA71); this.queueColors = [0, 1, 2, 3]; this.queueCargo = [0, 0, 0, 0]; this.queueTimes = [0, 0, 0, 0];
      this.accidentalTap = false; this.gestures = {}; this.keyPrev = {}; this.pinch = null;
      this.lastTap = { time: -Infinity, x: 0, y: 0 };
      this.selectScroll = 0;
      this.cam = { x: 0, y: 0, zoom: 1, tx: 0, ty: 0, tz: 1, manualUntil: 0 };
      this.switches = new Array(12).fill(false); this.switchPose = new Array(12).fill(0); this.switchPulse = new Array(12).fill(0);
      this.particles = []; this.smoke = []; this.railSparks = []; this.deliveryFx = []; this.tokenFx = []; this.impactFx = [];
      this.tokens = []; this.trains = []; this.poses = []; this.trainViews = []; this.trainMarks = []; this.stationViews = [];
      this.nearMatrix = [];
      this.audioState = 'route'; this.impactT = 0; this.backpressureT = 0;
    }
    create() {
      mainScene = this;
      for (var i = 0; i < MAX_TRAINS; i++) {
        this.trains.push({ active: false });
        this.poses.push({ x: 0, y: 0, tx: 1, ty: 0 });
        this.trainViews.push(this.add.sprite(0, 0, 'train_states', 0).setDepth(60).setVisible(false).setOrigin(0.5));
        this.trainMarks.push(this.add.graphics().setDepth(61).setVisible(false));
        this.nearMatrix.push(new Float32Array(MAX_TRAINS));
      }
      for (var st = 0; st < 12; st++) this.stationViews.push(this.add.sprite(0, 0, 'station_states', 0).setDepth(35).setVisible(false).setOrigin(0.5));
      for (var p = 0; p < MAX_PARTICLES; p++) this.particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, color: 0xffffff, kind: 0 });
      for (var s = 0; s < MAX_SMOKE; s++) this.smoke.push({ active: false, x: 0, y: 0, life: 0, max: 1, size: 3, color: 0xffffff });
      this.railSparks = this.makeFxPool(MAX_RAIL_SPARKS);
      this.deliveryFx = this.makeFxPool(MAX_DELIVERY_FX);
      this.tokenFx = this.makeFxPool(MAX_TOKEN_FX);
      this.impactFx = this.makeFxPool(MAX_IMPACT_FX);
      for (var t = 0; t < 8; t++) this.tokens.push({ active: false, edge: 0, dist: 0, x: 0, y: 0, life: 0 });
      this.world = this.add.container(0, 0).setDepth(0);
      this.yardTile = this.add.tileSprite(0, 0, 64, 64, 'yard_tile').setDepth(-1).setOrigin(0);
      this.base = this.add.graphics(); this.dynamic = this.add.graphics().setDepth(32); this.fx = this.add.graphics().setDepth(70);
      this.world.add([this.yardTile, this.base, this.dynamic, this.fx]);
      this.createUI();
      this.bindInput();
      this.scale.on('resize', this.relayout, this);
      this.relayout(this.scale.gameSize);
      if (pendingShift) this.selectedShift = pendingShift;
      if (pendingLayout) this.selectedLayout = pendingLayout;
      if (pendingShift || pendingLayout) this.beginShift(this.selectedShift, this.selectedLayout); else this.showTitle();
      window.__SL_READY = true;
    }
    createUI() {
      this.ui = this.add.container(0, 0).setDepth(200).setScrollFactor(0);
      this.titleLayer = this.add.container(0, 0).setScrollFactor(0); this.selectLayer = this.add.container(0, 0).setScrollFactor(0);
      this.playLayer = this.add.container(0, 0).setScrollFactor(0); this.resultLayer = this.add.container(0, 0).setScrollFactor(0);
      this.ui.add([this.titleLayer, this.selectLayer, this.playLayer, this.resultLayer]);
      this.uiBg = this.add.graphics().setScrollFactor(0); this.ui.addAt(this.uiBg, 0);

      this.titleLogo = this.add.text(0, 0, 'STEAMLINE', { fontFamily: 'Verdana, sans-serif', fontSize: '46px', fontStyle: 'bold', color: '#e9ffff', letterSpacing: 8, stroke: '#0b1721', strokeThickness: 8 }).setOrigin(0.5);
      this.titleSub = this.add.text(0, 0, 'THE TIMETABLE IS ALIVE', { fontFamily: 'Verdana, sans-serif', fontSize: '12px', fontStyle: 'bold', color: '#7bd8d4', letterSpacing: 3 }).setOrigin(0.5);
      this.titleNote = this.add.text(0, 0, 'Route every livery to its platform before patience runs out.', { fontFamily: 'Verdana, sans-serif', fontSize: '15px', color: '#b4cbd2', align: 'center', wordWrap: { width: 420 } }).setOrigin(0.5);
      this.titleLayer.add([this.titleLogo, this.titleSub, this.titleNote]);
      this.startButton = this.makeButton('DISPATCH MORNING RUSH', 310, 56, function () { this.showSelect(); }.bind(this), 0xf2c45e);
      this.titleLayer.add(this.startButton.root);
      this.titleSettings = this.makeButton('OPTIONS', 132, 42, function () { kit.openSettings(); }, 0x55c7e8);
      this.titleLayer.add(this.titleSettings.root);

      this.selectTitle = this.add.text(0, 0, 'SHIFT BOARD', { fontFamily: 'Verdana, sans-serif', fontSize: '27px', fontStyle: 'bold', color: '#e9ffff', letterSpacing: 4 }).setOrigin(0.5);
      this.selectSub = this.add.text(0, 0, 'Unlock the route, then take the yard.', { fontFamily: 'Verdana, sans-serif', fontSize: '13px', color: '#84a8b4' }).setOrigin(0.5);
      this.selectLayer.add([this.selectTitle, this.selectSub]);
      this.shiftCards = []; this.layoutCards = [];
      for (var i = 0; i < SHIFT_LIST.length; i++) {
        var card = this.makeCard('', 210, 88);
        this.shiftCards.push(card); this.selectLayer.add(card.root);
      }
      for (var j = 0; j < LAYOUT_KEYS.length; j++) {
        var lcard = this.makeCard('', 210, 78);
        this.layoutCards.push(lcard); this.selectLayer.add(lcard.root);
      }
      this.beginButton = this.makeButton('BEGIN SHIFT', 220, 50, function () { this.beginShift(this.selectedShift, this.selectedLayout); }.bind(this), 0x56d6a6);
      this.backButton = this.makeButton('BACK', 110, 42, function () { this.showTitle(); }.bind(this), 0x55c7e8);
      this.selectLayer.add([this.beginButton.root, this.backButton.root]);

      this.playTop = this.add.rectangle(0, 0, 10, 10, 0x0b1721, 0.92).setOrigin(0.5, 0); this.playLayer.add(this.playTop);
      this.scoreText = this.add.text(0, 0, '0', { fontFamily: 'Verdana, sans-serif', fontSize: '25px', fontStyle: 'bold', color: '#f4ffff' }).setOrigin(0, 0);
      this.comboText = this.add.text(0, 0, 'x1.00', { fontFamily: 'Verdana, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#7bd8d4' }).setOrigin(0, 0);
      this.nextIcon = this.add.graphics();
      this.nextText = this.add.text(0, 0, '', { fontFamily: 'Verdana, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#c4dadd' }).setOrigin(1, 0);
      this.targetText = this.add.text(0, 0, '', { fontFamily: 'Verdana, sans-serif', fontSize: '14px', color: '#99b7bf' }).setOrigin(1, 0);
      this.playLayer.add([this.scoreText, this.comboText, this.nextIcon, this.nextText, this.targetText]);
      this.holdButton = this.makeButton('HOLD SIGNAL', 162, 48, function () { this.toggleSelectedHold(); }.bind(this), 0xf26767); this.playLayer.add(this.holdButton.root);
      this.optionsButton = this.makeButton('OPTIONS', 110, 44, function () { kit.openSettings(); }, 0x55c7e8); this.playLayer.add(this.optionsButton.root);

      this.resultShade = this.add.rectangle(0, 0, 10, 10, 0x07121c, 0.86).setOrigin(0.5); this.resultLayer.add(this.resultShade);
      this.resultTitle = this.add.text(0, 0, '', { fontFamily: 'Verdana, sans-serif', fontSize: '33px', fontStyle: 'bold', color: '#f4ffff', letterSpacing: 3 }).setOrigin(0.5);
      this.resultSub = this.add.text(0, 0, '', { fontFamily: 'Verdana, sans-serif', fontSize: '14px', color: '#a8c6cc', align: 'center' }).setOrigin(0.5);
      this.resultScore = this.add.text(0, 0, '', { fontFamily: 'Verdana, sans-serif', fontSize: '48px', fontStyle: 'bold', color: '#f2c45e' }).setOrigin(0.5);
      this.resultMedal = this.add.text(0, 0, '', { fontFamily: 'Verdana, sans-serif', fontSize: '17px', fontStyle: 'bold', color: '#a9f5d1' }).setOrigin(0.5);
      this.resultButton = this.makeButton('NEXT SHIFT', 220, 52, function () { this.showSelect(); }.bind(this), 0x56d6a6);
      this.resultLayer.add([this.resultShade, this.resultTitle, this.resultSub, this.resultScore, this.resultMedal, this.resultButton.root]);
      this.bannerRoot = this.add.container(0, 0).setScrollFactor(0).setDepth(250).setVisible(false);
      this.bannerBg = this.add.rectangle(0, 0, 10, 28, 0x102936, 0.94).setOrigin(1, 0);
      this.bannerRule = this.add.rectangle(0, 0, 4, 28, 0x55c7e8, 1).setOrigin(0, 0);
      this.bannerTitle = this.add.text(0, 0, '', { fontFamily: 'Verdana, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#f2ffff' }).setOrigin(1, 0);
      this.bannerRoot.add([this.bannerBg, this.bannerRule, this.bannerTitle]);
      this.ui.add(this.bannerRoot);
      this.setLayerVisible(this.titleLayer, false); this.setLayerVisible(this.selectLayer, false); this.setLayerVisible(this.playLayer, false); this.setLayerVisible(this.resultLayer, false);
    }
    makeButton(label, w, h, fn, accent) {
      var root = this.add.container(0, 0).setScrollFactor(0);
      var bg = this.add.rectangle(0, 0, w, h, 0x102936, 0.96).setOrigin(0.5);
      var rule = this.add.rectangle(-w * 0.5 + 3, 0, 5, h - 10, accent || 0x55c7e8, 1).setOrigin(0.5);
      var text = this.add.text(0, 0, label, { fontFamily: 'Verdana, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#e6ffff', letterSpacing: 1.2, align: 'center' }).setOrigin(0.5);
      root.add([bg, rule, text]); root.__slButton = { root: root, w: w, h: h, fn: fn, bg: bg, text: text, accent: accent || 0x55c7e8, label: label, hit: { active: false, x: 0, y: 0, w: w, h: h } };
      return { root: root, button: root.__slButton };
    }
    makeCard(label, w, h) {
      var root = this.add.container(0, 0).setScrollFactor(0);
      var bg = this.add.rectangle(0, 0, w, h, 0x102936, 0.93).setOrigin(0.5);
      var line = this.add.rectangle(-w * 0.5 + 3, 0, 5, h - 10, 0x55c7e8, 1).setOrigin(0.5);
      var title = this.add.text(-w * 0.5 + 18, -h * 0.5 + 16, '', { fontFamily: 'Verdana, sans-serif', fontSize: '13px', fontStyle: 'bold', color: '#e9ffff', letterSpacing: 1 }).setOrigin(0, 0);
      var body = this.add.text(-w * 0.5 + 18, -h * 0.5 + 42, '', { fontFamily: 'Verdana, sans-serif', fontSize: '10px', color: '#9bb9c0', lineSpacing: 3, wordWrap: { width: w - 32 } }).setOrigin(0, 0);
      root.add([bg, line, title, body]); root.__slCard = { root: root, w: w, h: h, bg: bg, line: line, title: title, body: body, hit: { active: false, x: 0, y: 0, w: w, h: h }, action: null };
      return { root: root, card: root.__slCard };
    }
    setLayerVisible(layer, visible) { layer.setVisible(visible); }
    makeFxPool(count) {
      var pool = [];
      for (var i = 0; i < count; i++) pool.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, color: 0xffffff, spin: 0 });
      return pool;
    }
    clampSelectScroll() {
      if (this.screenW >= 720) { this.selectScroll = 0; return; }
      var scale = clamp((this.screenW - 28) / 2 / 210, 0.62, 0.9);
      var contentBottom = 104 + 2 * 94 * scale + 26 + 2 * 84 * scale + 78 * scale;
      var viewportBottom = Math.max(154, this.screenH - 82);
      this.selectScroll = clamp(this.selectScroll, -Math.max(0, contentBottom - viewportBottom), 0);
    }
    relayout(size) {
      var w = Math.max(320, (size && size.width) || this.scale.width || window.innerWidth);
      var h = Math.max(240, (size && size.height) || this.scale.height || window.innerHeight);
      this.screenW = w; this.screenH = h; this.insets = readInsets();
      this.uiBg.clear(); this.uiBg.fillStyle(0x07131c, 1); this.uiBg.fillRect(0, 0, w, h);
      this.uiBg.lineStyle(1, 0x25424b, 0.7); for (var gy = 0; gy < h; gy += 28) this.uiBg.lineBetween(0, gy, w, gy);
      this.titleLogo.setPosition(w * 0.5, h * 0.23); this.titleSub.setPosition(w * 0.5, h * 0.23 + 52); this.titleNote.setPosition(w * 0.5, h * 0.23 + 91);
      this.placeButton(this.startButton.button, w * 0.5, h * 0.67); this.placeButton(this.titleSettings.button, w - 86, h - 42);
      this.selectTitle.setPosition(w * 0.5, w < 720 ? 22 : 34); this.selectSub.setPosition(w * 0.5, w < 720 ? 49 : 65);
      this.clampSelectScroll();
      if (w < 720) {
        var cardScale = clamp((w - 28) / 2 / 210, 0.62, 0.9), cell = 210 * cardScale + 8;
        for (var mi = 0; mi < this.shiftCards.length; mi++) this.placeCard(this.shiftCards[mi].card, w * 0.5 + (mi % 2 ? 0.5 : -0.5) * cell, 104 + Math.floor(mi / 2) * 94 * cardScale + this.selectScroll, cardScale);
        var layoutTop = 104 + 2 * 94 * cardScale + 26 + this.selectScroll;
        for (var mj = 0; mj < this.layoutCards.length; mj++) this.placeCard(this.layoutCards[mj].card, w * 0.5 + (mj % 2 ? 0.5 : -0.5) * cell, layoutTop + Math.floor(mj / 2) * 84 * cardScale, cardScale);
      } else {
        for (var i = 0; i < this.shiftCards.length; i++) { var sx = w * 0.5 + (i - 1.5) * 218; this.placeCard(this.shiftCards[i].card, sx, 136, 1); }
        for (var j = 0; j < this.layoutCards.length; j++) { var lx = w * 0.5 + (j - 1.5) * 218; this.placeCard(this.layoutCards[j].card, lx, 266, 1); }
      }
      this.placeButton(this.beginButton.button, w * 0.5 + 70, h - 45); this.placeButton(this.backButton.button, 68, h - 45);
      this.playTop.setPosition(w * 0.5, 0); this.playTop.setSize(w, 66); this.playTop.setDisplaySize(w, 66);
      this.scoreText.setPosition(14, 7); this.comboText.setPosition(18, 39); this.nextIcon.setPosition(w - 70, 8); this.nextText.setPosition(w - 16, 9); this.targetText.setPosition(w - 16, 35);
      var bottom = h - 38 - this.insets.bottom;
      this.placeButton(this.holdButton.button, 92, bottom); this.placeButton(this.optionsButton.button, w - 66, bottom);
      this.resultShade.setPosition(w * 0.5, h * 0.5); this.resultShade.setSize(w, h); this.resultShade.setDisplaySize(w, h); this.resultTitle.setPosition(w * 0.5, h * 0.29); this.resultSub.setPosition(w * 0.5, h * 0.39); this.resultScore.setPosition(w * 0.5, h * 0.5); this.resultMedal.setPosition(w * 0.5, h * 0.62); this.placeButton(this.resultButton.button, w * 0.5, h * 0.76);
      this.layoutBanner(w);
    }
    layoutBanner(w) {
      if (!this.bannerRoot) return;
      var coach = this.bannerKind === 'coach', width = coach ? Math.min(w - 22, 620) : Math.min(w - 32, 300), y = 70 + (this.insets ? this.insets.top : 0);
      this.bannerBg.setOrigin(coach ? 0.5 : 1, 0); this.bannerBg.setSize(width, 28); this.bannerBg.setDisplaySize(width, 28);
      this.bannerRule.setSize(4, 28); this.bannerRule.setDisplaySize(4, 28);
      if (coach) {
        this.bannerRoot.setPosition(w * 0.5, y); this.bannerRule.setPosition(-width * 0.5, 0); this.bannerTitle.setPosition(0, 6).setOrigin(0.5, 0);
      } else {
        this.bannerRoot.setPosition(w - 14, y); this.bannerRule.setPosition(-width, 0); this.bannerTitle.setPosition(-width + 12, 6).setOrigin(0, 0);
      }
      this.bannerTitle.setWordWrapWidth(Math.max(1, width - 24), false);
    }
    placeButton(button, x, y) { button.hit.x = x - button.w * 0.5; button.hit.y = y - button.h * 0.5; button.hit.active = true; button.rootX = x; button.rootY = y; button._root = button._root || null; var root = button.root || null; if (root) root.setPosition(x, y); }
    placeCard(card, x, y, scale) { scale = scale || 1; card.hit.x = x - card.w * scale * 0.5; card.hit.y = y - card.h * scale * 0.5; card.hit.w = card.w * scale; card.hit.h = card.h * scale; card.hit.active = true; card._root = card._root || null; var root = card.root || null; if (root) root.setPosition(x, y).setScale(scale); }
    bindInput() {
      var self = this;
      this.input.on('pointerdown', function (p) { self.pointerDown(p); });
      this.input.on('pointermove', function (p) { self.pointerMove(p); });
      this.input.on('pointerup', function (p) { self.pointerUp(p); });
      this.input.on('pointercancel', function (p) { self.pointerUp(p); });
      this.input.on('wheel', function (p, objects, dx, dy) { self.wheel(p, dy); });
      this.input.keyboard.on('keydown', function () { /* GGKit records keys; the sim consumes its map. */ });
    }
    hitButton(x, y) {
      var list = [];
      if (this.mode === 'title') list = [this.startButton.button, this.titleSettings.button];
      else if (this.mode === 'select') list = [this.beginButton.button, this.backButton.button].concat(this.shiftCards.map(function (c) { return c.card; }), this.layoutCards.map(function (c) { return c.card; }));
      else if (this.mode === 'play') list = [this.holdButton.button, this.optionsButton.button];
      else if (this.mode === 'result') list = [this.resultButton.button];
      for (var i = 0; i < list.length; i++) { var b = list[i].hit; if (b.active && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return list[i]; }
      return null;
    }
    pointerDown(pointer) {
      var e = claimPointer(pointer, '');
      var hit = this.hitButton(pointer.x, pointer.y);
      e.point.zone = hit ? 'ui' : 'board'; e.point.startX = pointer.x; e.point.startY = pointer.y; e.point.lastX = pointer.x; e.point.lastY = pointer.y; e.point.moved = false;
      this.gestures[e.id] = e.point;
      if (hit) { e.point.button = hit; hit.bg.setFillStyle(hit.accent, 0.32); }
      if (this.mode === 'play' && !hit && kit.input.pointers.size >= 2) this.beginPinch();
    }
    pointerMove(pointer) {
      var e = pointerEntry(pointer); if (!e) return;
      var p = e.point, dx = pointer.x - (p.lastX == null ? pointer.x : p.lastX), dy = pointer.y - (p.lastY == null ? pointer.y : p.lastY);
      p.lastX = pointer.x; p.lastY = pointer.y;
      if (p.zone === 'ui') return;
      if (Math.hypot(pointer.x - p.startX, pointer.y - p.startY) > 8) p.moved = true;
      if (this.mode === 'select' && p.moved) { this.selectScroll -= dy; this.clampSelectScroll(); this.relayout(this.scale.gameSize); return; }
      if (this.mode === 'play' && kit.input.pointers.size >= 2) { this.updatePinch(); p.moved = true; return; }
      if (this.mode === 'play' && p.moved) { this.cam.tx -= dx / Math.max(0.35, this.cam.zoom); this.cam.ty -= dy / Math.max(0.35, this.cam.zoom); this.clampCameraTargets(); this.cam.manualUntil = this.simTime + 2.2; }
    }
    pointerUp(pointer) {
      var e = pointerEntry(pointer); if (!e) return;
      var p = e.point, hit = p.button;
      if (hit) { hit.bg.setFillStyle(0x102936, 0.96); if (!p.moved) kit.audio.sfx('ui_select', { volume: 0.24 }); if (!p.moved && hit.fn) hit.fn(); else if (!p.moved && hit.action) hit.action(); }
      else if (!p.moved && p.zone === 'board') {
        var now = performance.now(), doubleTap = this.mode === 'play' && now - this.lastTap.time < 320 && Math.hypot(pointer.x - this.lastTap.x, pointer.y - this.lastTap.y) < 48;
        if (doubleTap) this.doubleTapZoom(pointer.x, pointer.y); else this.tapBoard(pointer.x, pointer.y);
        this.lastTap = { time: now, x: pointer.x, y: pointer.y };
      }
      delete this.gestures[e.id];
      if (this.pinch) this.pinch = null;
    }
    beginPinch() {
      var points = Array.from(kit.input.pointers.values()); if (points.length < 2) return;
      this.pinch = { distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) || 1, zoom: this.cam.zoom };
    }
    updatePinch() {
      var points = Array.from(kit.input.pointers.values()); if (points.length < 2) return;
      if (!this.pinch) this.beginPinch(); if (!this.pinch) return;
      var distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) || 1;
      this.cam.tz = clamp(this.pinch.zoom * distance / this.pinch.distance, 0.42, 1.75); this.clampCameraTargets(); this.cam.manualUntil = this.simTime + 2.2;
    }
    wheel(pointer, dy) {
      if (this.mode === 'select') { this.selectScroll += dy * 0.7; this.clampSelectScroll(); this.relayout(this.scale.gameSize); return; }
      if (this.mode !== 'play') return;
      this.cam.tz = clamp(this.cam.tz * (dy < 0 ? 1.12 : 0.89), 0.42, 1.75); this.clampCameraTargets(); this.cam.manualUntil = this.simTime + 2.2;
    }
    doubleTapZoom(x, y) {
      var world = this.cameras.main.getWorldPoint(x, y);
      this.cam.tz = this.cam.zoom > 1.05 ? clamp(this.cam.zoom * 0.78, 0.42, 1.75) : clamp(this.cam.zoom * 1.28, 0.42, 1.75);
      this.cam.tx += (world.x - this.cam.x) * 0.2; this.cam.ty += (world.y - this.cam.y) * 0.2; this.clampCameraTargets(); this.cam.manualUntil = this.simTime + 2.2;
    }
    tapBoard(x, y) {
      if (this.mode === 'title') { this.showSelect(); return; }
      if (this.mode === 'result') { this.beginShift(this.selectedShift, this.selectedLayout); return; }
      if (this.mode !== 'play' || this.over) return;
      var world = this.cameras.main.getWorldPoint(x, y), best = -1, bestD = 9999;
      for (var i = 0; i < MAX_TRAINS; i++) if (this.trains[i].active) { var pose = this.poses[i], d = Math.hypot(pose.x - world.x, pose.y - world.y); if (d < bestD && d < 58 / Math.max(this.cam.zoom, 0.35)) { bestD = d; best = i; } }
      if (best >= 0) { this.selectTrain(best); this.toggleSelectedHold(); return; }
      for (var j = 0; j < this.activeJunctions; j++) { var nd = this.layout.nodes[j], ndist = Math.hypot(nd.x - world.x, nd.y - world.y); if (ndist < 68 / Math.max(this.cam.zoom, 0.35)) { this.toggleSwitch(j); return; } }
    }
    updateKeys(dt) {
      var codes = ['Enter', 'Space', 'Escape', 'Tab', 'Digit0', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'KeyF', 'KeyQ', 'KeyE', 'KeyR', 'Minus', 'Equal', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
      for (var i = 0; i < codes.length; i++) {
        var code = codes[i], down = kit.input.keyDown(code), was = !!this.keyPrev[code];
        if (down && !was) this.keyPressed(code);
        this.keyPrev[code] = down;
      }
      if (this.mode === 'play') {
        var pan = 8 * (dt || 1 / 60) * 60 / Math.max(0.45, this.cam.zoom);
        if (kit.input.keyDown('ArrowLeft') || kit.input.keyDown('KeyA')) this.cam.tx -= pan;
        if (kit.input.keyDown('ArrowRight') || kit.input.keyDown('KeyD')) this.cam.tx += pan;
        if (kit.input.keyDown('ArrowUp') || kit.input.keyDown('KeyW')) this.cam.ty -= pan;
        if (kit.input.keyDown('ArrowDown') || kit.input.keyDown('KeyS')) this.cam.ty += pan;
        if (kit.input.keyDown('Equal') || kit.input.keyDown('KeyE')) this.cam.tz = clamp(this.cam.tz + 0.012 * (dt || 1 / 60) * 60, 0.42, 1.75);
        if (kit.input.keyDown('Minus') || kit.input.keyDown('KeyQ')) this.cam.tz = clamp(this.cam.tz - 0.012 * (dt || 1 / 60) * 60, 0.42, 1.75);
        this.clampCameraTargets();
      }
    }
    keyPressed(code) {
      if (code === 'Enter') { if (this.mode === 'title') this.showSelect(); else if (this.mode === 'select') this.beginShift(this.selectedShift, this.selectedLayout); else if (this.mode === 'result') this.beginShift(this.selectedShift, this.selectedLayout); }
      if (code === 'KeyR' && (this.mode === 'play' || this.mode === 'result')) this.beginShift(this.selectedShift, this.selectedLayout);
      if ((code === 'Digit0' || code === 'KeyF') && this.mode === 'play') this.fitCamera(true);
      if (code === 'Escape' && this.mode === 'play') kit.openSettings();
      if (code === 'Space' && this.mode === 'play') this.toggleSelectedHold();
      if (code === 'Tab' && this.mode === 'play') { for (var i = 1; i <= MAX_TRAINS; i++) { var n = (this.selected + i) % MAX_TRAINS; if (this.trains[n].active) { this.selectTrain(n); break; } } }
      if (this.mode === 'play' && code.indexOf('Digit') === 0) { var ix = parseInt(code.slice(5), 10) - 1; if (ix >= 0) this.toggleSwitch(ix); }
    }
    showTitle() {
      this.mode = 'title'; this.over = false; this.clearBannerQueue(); this.updateDebug(); this.setLayerVisible(this.titleLayer, true); this.setLayerVisible(this.selectLayer, false); this.setLayerVisible(this.playLayer, false); this.setLayerVisible(this.resultLayer, false);
    }
    showSelect() {
      this.mode = 'select'; this.over = false; this.clearBannerQueue(); this.updateDebug(); this.setLayerVisible(this.titleLayer, false); this.setLayerVisible(this.selectLayer, true); this.setLayerVisible(this.playLayer, false); this.setLayerVisible(this.resultLayer, false); this.paintSelect();
    }
    restartToSelect() { this.accum = 0; this.showSelect(); }
    paintSelect() {
      var self = this;
      this.shiftCards.forEach(function (wrap, i) { var s = SHIFT_LIST[i], unlocked = hasKey(profile.unlockedShifts, s.key), selected = self.selectedShift === s.key, c = wrap.card; setTextIfChanged(c.title, (unlocked ? '' : 'LOCKED • ') + s.name.toUpperCase()); setTextIfChanged(c.body, s.strap + '\n' + (unlocked ? (selected ? 'SELECTED' : 'tap to select') : 'clear the previous shift')); c.line.setFillStyle(selected ? s.accent : 0x365562, 1); c.bg.setFillStyle(selected ? 0x1a3b43 : 0x102936, unlocked ? 0.98 : 0.64); c.action = unlocked ? function () { self.selectedShift = s.key; self.paintSelect(); } : null; });
      this.layoutCards.forEach(function (wrap, i) { var key = LAYOUT_KEYS[i], def = R.defs[key], unlocked = hasKey(profile.unlockedLayouts, key), selected = self.selectedLayout === key, c = wrap.card; setTextIfChanged(c.title, (unlocked ? '' : 'LOCKED • ') + def.name.toUpperCase()); setTextIfChanged(c.body, def.eyebrow + '  •  ' + def.routing + '\n' + (selected ? 'SELECTED' : (unlocked ? 'tap to select' : 'clear its unlock shift'))); c.line.setFillStyle(selected ? hex(def.accent) : 0x365562, 1); c.bg.setFillStyle(selected ? 0x1a3b43 : 0x102936, unlocked ? 0.98 : 0.64); c.action = unlocked ? function () { self.selectedLayout = key; self.paintSelect(); } : null; });
    }
    beginShift(shiftKey, layoutKey) {
      var shift = shiftFor(shiftKey), key = validLayout(layoutKey) ? layoutKey : 'city-loop';
      if (!hasKey(profile.unlockedShifts, shift.key) && !pendingShift) shift = SHIFT_BY_KEY['morning-rush'];
      if (!hasKey(profile.unlockedLayouts, key) && !pendingLayout) key = 'city-loop';
      this.shift = shift; this.layout = layoutFor(key); this.selectedShift = shift.key; this.selectedLayout = this.layout.key; this.mode = 'play'; this.over = false; this.clearBannerQueue(); this.score = 0; this.combo = 0; this.bestCombo = 0; this.delivered = 0; this.missed = 0; this.nearMisses = 0; this.selected = -1; this.simTime = 0; this.shiftElapsed = 0; this.clearCountdown = -1; this.accum = 0; this.rng = R.mulberry32((Date.now() ^ (shift.key.length * 7919) ^ key.length * 104729) >>> 0); this.activeJunctions = shift.start; this.switches.fill(false); this.switchPose.fill(0); this.switchPulse.fill(0); this.resetPools(); this.fillQueue(true); this.nextSpawn = 1.35; this.buildWorld(); this.fitCamera(true); this.tutorialStep = 0; this.setLayerVisible(this.titleLayer, false); this.setLayerVisible(this.selectLayer, false); this.setLayerVisible(this.playLayer, true); this.setLayerVisible(this.resultLayer, false); this.showBanner(shift.name.toUpperCase() + ' · ' + this.layout.name, '', shift.accent, 'boundary'); if (shift.key === 'morning-rush') this.showBanner('Route glow → matching platform', '', 0x55c7e8, 'coach'); kit.audio.music('music_route', 700); kit.audio.sfx('whistle', { volume: 0.65 }); this.updateDebug();
    }
    forceShift(key) { this.selectedShift = shiftKeyFor(key); this.beginShift(this.selectedShift, this.selectedLayout); }
    forceLayout(key) { this.selectedLayout = layoutKeyFor(key); this.beginShift(this.selectedShift, this.selectedLayout); }
    resetPools() {
      for (var i = 0; i < MAX_TRAINS; i++) { this.trains[i].active = false; this.trainViews[i].setVisible(false); this.trainMarks[i].setVisible(false); }
      for (var p = 0; p < MAX_PARTICLES; p++) this.particles[p].active = false;
      for (var s = 0; s < MAX_SMOKE; s++) this.smoke[s].active = false;
      for (var sv = 0; sv < this.stationViews.length; sv++) this.stationViews[sv].setVisible(false);
      [this.railSparks, this.deliveryFx, this.tokenFx, this.impactFx].forEach(function (pool) { for (var i = 0; i < pool.length; i++) pool[i].active = false; });
      for (var t = 0; t < this.tokens.length; t++) this.tokens[t].active = false;
      for (var n = 0; n < MAX_TRAINS; n++) this.nearMatrix[n].fill(0);
      this.audioState = 'route'; this.impactT = 0; this.backpressureT = 0; this.syncHoldButton();
      this.selected = -1;
    }
    fillQueue(initial) {
      if (initial) { this.queueTimes[0] = this.nextSpawn || 1.35; for (var q = 0; q < 4; q++) { this.queueColors[q] = q % 5; this.queueCargo[q] = 0; if (q > 0) this.queueTimes[q] = this.queueTimes[q - 1] + this.shift.base; } }
    }
    popQueue() {
      var color = this.queueColors[0], cargo = !!this.queueCargo[0];
      for (var i = 0; i < 3; i++) { this.queueColors[i] = this.queueColors[i + 1]; this.queueCargo[i] = this.queueCargo[i + 1]; this.queueTimes[i] = this.queueTimes[i + 1]; }
      var interval = this.spawnInterval(); this.queueColors[3] = Math.floor(this.rng() * 5); this.queueCargo[3] = this.rng() < this.shift.cargo ? 1 : 0; this.queueTimes[3] = this.queueTimes[2] + interval;
      return { color: color, cargo: cargo };
    }
    peekQueue() { return { color: this.queueColors[0], cargo: !!this.queueCargo[0] }; }
    spawnInterval() { return Math.max(this.shift.min, this.shift.base - this.delivered * 0.09 - this.shiftElapsed * 0.018); }
    activeTrainCount() { var n = 0; for (var i = 0; i < MAX_TRAINS; i++) if (this.trains[i].active) n++; return n; }
    spawnTrain(color, cargo) {
      var slot = -1; for (var i = 0; i < MAX_TRAINS; i++) if (!this.trains[i].active) { slot = i; break; }
      if (slot < 0) return false;
      var tr = this.trains[slot]; tr.active = true; tr.edge = 0; tr.dist = 0; tr.speed = 0; tr.color = color % 5; tr.cargo = !!cargo; tr.maxPatience = this.shift.patience + (tr.cargo ? 9 : 0); tr.patience = tr.maxPatience; tr.hold = false; tr.signalStopped = false; tr.stationHandled = false; tr.dwell = 0; tr.boundary = -1; tr.age = 0; tr.idle = this.rng() * 6.28; tr.tutorial = this.shift.key === 'morning-rush' && this.delivered === 0 && this.activeTrainCount() === 1;
      this.syncPose(slot); tr.prevX = this.poses[slot].x; tr.prevY = this.poses[slot].y; if (this.selected < 0 || !this.trains[this.selected].active) this.selectTrain(slot);
      this.spawnSmokeAt(slot, 3); kit.audio.sfx('steam_chug', { volume: 0.22, rate: 0.92 + this.rng() * 0.16 }); return true;
    }
    selectTrain(index) { if (index < 0 || index >= MAX_TRAINS || !this.trains[index].active) return; this.selected = index; this.syncHoldButton(); }
    syncHoldButton() {
      var tr = this.selected >= 0 ? this.trains[this.selected] : null, holding = !!(tr && tr.active && tr.hold);
      if (this.holdButton && this.holdButton.button) { this.holdButton.button.text.setText(holding ? 'RELEASE SIGNAL' : 'HOLD SIGNAL'); this.holdButton.button.bg.setFillStyle(holding ? 0x6f3034 : 0x102936, 0.96); }
    }
    syncPose(index) {
      var tr = this.trains[index], pose = this.poses[index]; if (!tr.active || !this.layout) return;
      if (tr.boundary >= 0) { var n = this.layout.nodes[Math.min(tr.boundary, this.layout.nodes.length - 1)]; pose.x = n.x; pose.y = n.y; var prev = this.layout.nodes[Math.max(0, tr.boundary - 1)]; var d = Math.hypot(n.x - prev.x, n.y - prev.y) || 1; pose.tx = (n.x - prev.x) / d; pose.ty = (n.y - prev.y) / d; return; }
      var e = this.layout.edges[tr.edge], p = R.at(e.poly, tr.dist); pose.x = p.x; pose.y = p.y; pose.tx = p.tx; pose.ty = p.ty;
    }
    buildWorld() {
      this.base.clear(); this.dynamic.clear(); this.fx.clear(); this.world.removeAll(false);
      this.world.add([this.yardTile, this.base, this.dynamic, this.fx]);
      var b = this.layout.bounds, def = this.layout.def;
      this.yardTile.setPosition(b.x0, b.y0).setSize(b.x1 - b.x0, b.y1 - b.y0).setTint(hex(def.ground));
      this.base.fillStyle(hex(def.ground), 0.5); this.base.fillEllipse((b.x0 + b.x1) * 0.5, b.y1 - 80, b.x1 - b.x0, 240);
      this.base.lineStyle(1, 0x5d8590, 0.12); for (var gx = Math.ceil(b.x0 / 64) * 64; gx < b.x1; gx += 64) this.base.lineBetween(gx, b.y0, gx, b.y1); for (var gy = Math.ceil(b.y0 / 64) * 64; gy < b.y1; gy += 64) this.base.lineBetween(b.x0, gy, b.x1, gy);
      for (var i = 0; i < this.layout.edges.length; i++) this.drawRail(this.base, this.layout.edges[i].poly.pts, hex(def.rail), i === this.layout.exitIdx ? 0.55 : 0.9);
      this.drawSignature(this.base);
      this.base.lineStyle(2, hex(def.accent), 0.22); this.base.strokeCircle(this.layout.nodes[this.layout.shortcutIndex].x, this.layout.nodes[this.layout.shortcutIndex].y, 68);
    }
    drawRail(g, pts, color, alpha) {
      g.lineStyle(27, 0x07151d, 0.9); this.strokePoints(g, pts); g.lineStyle(16, 0x2a4854, alpha); this.strokePoints(g, pts); g.lineStyle(4, color, alpha); this.strokePoints(g, pts);
      g.lineStyle(2, 0xd9ffff, alpha * 0.22); for (var i = 1; i < pts.length; i++) { var a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.y - a.y) || 1; for (var s = 26; s < d; s += 46) { var t = s / d, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, nx = -(b.y - a.y) / d, ny = (b.x - a.x) / d; g.lineBetween(x - nx * 10, y - ny * 10, x + nx * 10, y + ny * 10); } }
    }
    strokePoints(g, pts) { g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (var i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y); g.strokePath(); }
    drawSignature(g) {
      var sig = this.layout.signature, n = this.layout.nodes[sig.x] || this.layout.nodes[0], x = n.x, y = n.y + sig.y;
      g.fillStyle(0x07151d, 0.86); g.fillCircle(x, y, 62); g.lineStyle(4, hex(this.layout.def.accent), 0.75); g.strokeCircle(x, y, 56);
      if (sig.kind === 'turntable') { for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4; g.lineBetween(x, y, x + Math.cos(a) * 48, y + Math.sin(a) * 48); } g.fillStyle(0xf2c45e, 1); g.fillCircle(x, y, 10); }
      else if (sig.kind === 'drawbridge') { g.fillStyle(0x1e6e78, 0.8); g.fillRect(x - 46, y - 12, 92, 24); g.lineStyle(5, 0xf2c45e, 0.9); g.lineBetween(x - 42, y, x + 42, y); g.lineBetween(x - 42, y, x - 54, y - 20); g.lineBetween(x + 42, y, x + 54, y + 20); }
      else if (sig.kind === 'tunnel') { g.fillStyle(0x364b63, 1); g.fillEllipse(x, y + 4, 78, 58); g.fillStyle(hex(this.layout.def.sky), 1); g.fillEllipse(x, y + 7, 49, 35); g.lineStyle(3, 0xe1cfff, 0.7); g.strokeCircle(x, y + 7, 26); }
      else { g.lineStyle(5, 0xf2c45e, 0.8); g.strokeRect(x - 38, y - 38, 76, 76); g.lineBetween(x - 38, y, x + 38, y); g.lineBetween(x, y - 38, x, y + 38); g.fillStyle(0xf2c45e, 1); g.fillCircle(x, y, 7); }
    }
    fitCamera(instant) {
      if (!this.layout) return; var b = this.layout.bounds, aw = Math.max(240, this.screenW - 32), ah = Math.max(180, this.screenH - 126), z = clamp(Math.min(aw / (b.x1 - b.x0), ah / (b.y1 - b.y0)), 0.42, 1.12); this.cam.tx = (b.x0 + b.x1) * 0.5; this.cam.ty = (b.y0 + b.y1) * 0.5 + 20; this.cam.tz = z; this.clampCameraTargets(); if (instant) { this.cam.x = this.cam.tx; this.cam.y = this.cam.ty; this.cam.zoom = z; this.cameras.main.setZoom(z); this.cameras.main.centerOn(this.cam.x, this.cam.y); } }
    clampCameraTargets() {
      if (!this.layout || !this.screenW || !this.screenH) return;
      var b = this.layout.bounds, z = clamp(this.cam.tz, 0.42, 1.75), halfW = this.screenW / (2 * z), halfH = this.screenH / (2 * z);
      var minX = b.x0 + halfW, maxX = b.x1 - halfW, minY = b.y0 + halfH, maxY = b.y1 - halfH;
      this.cam.tx = minX > maxX ? (b.x0 + b.x1) * 0.5 : clamp(this.cam.tx, minX, maxX);
      this.cam.ty = minY > maxY ? (b.y0 + b.y1) * 0.5 : clamp(this.cam.ty, minY, maxY);
      this.cam.tz = z;
    }
    toggleSwitch(index) {
      if (this.mode !== 'play' || index < 0 || index >= this.activeJunctions) return;
      this.switches[index] = !this.switches[index]; this.switchPulse[index] = 1; this.cam.manualUntil = this.simTime + 1.4; var edge = this.layout.routes[index][this.switches[index] ? 'side' : 'main']; this.highlightEdge = edge; this.highlightT = 0.6; var n = this.layout.nodes[index]; this.burst(n.x, n.y, hex(this.layout.def.accent), 8, 1); this.spawnRailSparks(n.x, n.y, 10); if (this.shift.key === 'morning-rush' && this.tutorialStep === 0 && index === 0) { this.tutorialStep = 1; this.showBanner('Set · watch the shape', '', 0x55c7e8, 'coach'); } kit.audio.sfx('switch_throw', { volume: 0.48, rate: this.switches[index] ? 1.05 : 0.88 }); if (kit.juice.enabled) kit.juice.shake(1.4, 42); }
    toggleSelectedHold() {
      if (this.mode !== 'play') return;
      if (this.selected < 0 || !this.trains[this.selected].active) { for (var i = 0; i < MAX_TRAINS; i++) if (this.trains[i].active) { this.selectTrain(i); break; } }
      if (this.selected < 0) return; var tr = this.trains[this.selected]; tr.hold = !tr.hold; tr.signalStopped = false; this.holdButton.button.text.setText(tr.hold ? 'RELEASE SIGNAL' : 'HOLD SIGNAL'); this.holdButton.button.bg.setFillStyle(tr.hold ? 0x6f3034 : 0x102936, 0.96); kit.audio.sfx(tr.hold ? 'station_bell' : 'whistle', { volume: 0.5, rate: tr.hold ? 0.86 : 1.12 }); if (kit.juice.enabled) kit.juice.shake(1.8, 55);
      this.syncHoldButton(); if (this.tutorialStep === 2) { this.tutorialStep = 3; this.showBanner('Release when clear', '', 0x56d6a6, 'coach'); }
    }
    burst(x, y, color, count, kind) {
      if (!kit.juice.enabled) count = Math.max(1, Math.round(count * 0.36));
      var made = 0, start = Math.floor(this.cosmeticTime * 37) % MAX_PARTICLES;
      for (var n = 0; n < MAX_PARTICLES && made < count; n++) { var i = (start + n) % MAX_PARTICLES, p = this.particles[i]; if (p.active) continue; var a = this.rng() * Math.PI * 2, sp = 30 + this.rng() * 115; p.active = true; p.x = x; p.y = y; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.life = p.max = 0.34 + this.rng() * 0.52; p.size = 1.6 + this.rng() * 3.8; p.color = color; p.kind = kind || 0; made++; }
    }
    spawnFx(pool, x, y, count, color, speed) {
      var made = 0, wanted = kit.juice.enabled ? count : Math.max(1, Math.round(count * 0.4));
      for (var i = 0; i < pool.length && made < wanted; i++) { var p = pool[i]; if (p.active) continue; var a = this.rng() * Math.PI * 2, sp = (speed || 70) * (0.55 + this.rng() * 0.7); p.active = true; p.x = x; p.y = y; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.life = p.max = 0.3 + this.rng() * 0.45; p.size = 1.5 + this.rng() * 3; p.color = color; p.spin = this.rng() * 6.28; made++; }
    }
    updateFxPool(pool, dt, gravity) {
      for (var i = 0; i < pool.length; i++) if (pool[i].active) { var p = pool[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy = p.vy * 0.94 + gravity * dt; p.spin += dt * 5; if (p.life <= 0) p.active = false; }
    }
    spawnRailSparks(x, y, count) { this.spawnFx(this.railSparks, x, y, count || 8, 0x9ff8ef, 130); }
    spawnDeliveryFx(x, y, count, color) { this.spawnFx(this.deliveryFx, x, y, count || 18, color || 0xf2c45e, 100); }
    spawnTokenFx(x, y, count) { this.spawnFx(this.tokenFx, x, y, count || 10, 0xfff0ac, 72); }
    spawnImpactFx(x, y, count) { this.spawnFx(this.impactFx, x, y, count || 26, 0xf26767, 155); }
    spawnSmokeAt(index, count) { var pose = this.poses[index]; for (var n = 0; n < count; n++) { var slot = -1; for (var i = 0; i < MAX_SMOKE; i++) if (!this.smoke[i].active) { slot = i; break; } if (slot < 0) return; var p = this.smoke[slot]; p.active = true; p.x = pose.x - pose.tx * (12 + n * 5); p.y = pose.y - pose.ty * (12 + n * 5); p.life = p.max = 0.45 + this.rng() * 0.36; p.size = 3 + this.rng() * 4; p.color = 0xb9d4d2; } }
    spawnToken() {
      var slot = -1; for (var i = 0; i < this.tokens.length; i++) if (!this.tokens[i].active) { slot = i; break; } if (slot < 0 || this.activeJunctions < 1) return;
      var segment = Math.floor(this.rng() * this.activeJunctions), edge = this.layout.routes[segment][this.rng() < 0.55 ? 'main' : 'side'], e = this.layout.edges[edge], token = this.tokens[slot]; token.active = true; token.edge = edge; token.dist = e.poly.len * (0.32 + this.rng() * 0.42); token.life = 18; var p = R.at(e.poly, token.dist); token.x = p.x; token.y = p.y;
    }
    collectTokens() {
      for (var ti = 0; ti < this.tokens.length; ti++) if (this.tokens[ti].active) for (var trI = 0; trI < MAX_TRAINS; trI++) { var tr = this.trains[trI]; if (!tr.active || tr.edge !== this.tokens[ti].edge || Math.abs(tr.dist - this.tokens[ti].dist) > 27) continue; tr.patience = Math.min(tr.maxPatience, tr.patience + 10); this.score += 18; this.tokens[ti].active = false; this.burst(this.tokens[ti].x, this.tokens[ti].y, 0xf2c45e, 12, 2); this.spawnTokenFx(this.tokens[ti].x, this.tokens[ti].y, 14); this.showBanner('+10 patience', '', 0xf2c45e, 'event'); kit.audio.sfx('pickup', { volume: 0.56, rate: 1.08 }); break; }
    }
    deliver(index, station) {
      var tr = this.trains[index], correct = station.color === tr.color, onTime = tr.patience > 0, points;
      if (correct) { points = Math.round((onTime ? 100 : 45) * this.shift.score * (tr.cargo ? 1.55 : 1) * (1 + Math.min(this.combo, 10) * 0.08)); this.score += points; this.combo = onTime ? this.combo + 1 : 0; this.bestCombo = Math.max(this.bestCombo, this.combo); this.delivered++; this.burst(station.x, station.y, hex(COLORS[tr.color]), tr.cargo ? 24 : 16, 2); this.spawnDeliveryFx(station.x, station.y, tr.cargo ? 28 : 20, hex(COLORS[tr.color])); kit.audio.sfx('station_bell', { volume: 0.62, rate: onTime ? 1.12 : 0.86 }); if (tr.tutorial) { this.tutorialStep = 2; this.showBanner('First delivery · tap a train to hold', '', 0x56d6a6, 'coach'); } if (this.delivered % 2 === 0 && this.activeJunctions < this.layout.junctions) { this.activeJunctions++; this.switchPulse[this.activeJunctions - 1] = 1; var nd = this.layout.nodes[this.activeJunctions - 1]; this.burst(nd.x, nd.y, 0x55c7e8, 18, 1); this.spawnRailSparks(nd.x, nd.y, 16); this.showBanner('Junction ' + this.activeJunctions + ' online', '', 0x55c7e8, 'event'); this.cam.tx = nd.x; this.cam.ty = nd.y; this.clampCameraTargets(); this.cam.manualUntil = this.simTime + 1.2; }
        if (this.delivered % 2 === 0) this.spawnToken();
      } else { this.combo = 0; this.missed++; this.burst(station.x, station.y, 0x788e98, 7, 0); this.spawnImpactFx(station.x, station.y, 12); kit.audio.sfx('miss', { volume: 0.48, rate: 0.72 }); }
      tr.stationHandled = true;
    }
    trainGap(index) {
      var tr = this.trains[index], gap = Infinity;
      for (var i = 0; i < MAX_TRAINS; i++) { var o = this.trains[i]; if (!o.active || i === index) continue; if (o.edge === tr.edge && o.dist > tr.dist) gap = Math.min(gap, o.dist - tr.dist); }
      return gap;
    }
    moveTrain(index, dt) {
      var tr = this.trains[index]; if (!tr.active) return;
      tr.prevX = this.poses[index].x; tr.prevY = this.poses[index].y; tr.age += dt; tr.patience -= dt; if (tr.boundary >= 0) { if (tr.boundary < this.activeJunctions) { tr.edge = this.layout.routes[tr.boundary][tr.tutorial && tr.boundary === 0 ? 'side' : (this.switches[tr.boundary] ? 'side' : 'main')]; tr.boundary = -1; tr.dist = 0; tr.stationHandled = false; } this.syncPose(index); return; }
      if (tr.dwell > 0) { tr.dwell -= dt; if (tr.dwell <= 0) { var st = this.layout.stations[this.layout.edges[tr.edge].segment]; if (st) this.deliver(index, st); } this.syncPose(index); return; }
      var e = this.layout.edges[tr.edge], cap = tr.cargo ? 119 : 106, gap = this.trainGap(index); if (e.kind === 'side') cap *= this.layout.def.speedBias || 1; if (gap < 92) cap = Math.min(cap, Math.sqrt(Math.max(0, gap - 30)) * 8.8);
      var signal = e.poly.len * 0.76;
      if (tr.hold && !tr.signalStopped && tr.dist >= signal - 3) { tr.dist = Math.max(tr.dist, signal); tr.signalStopped = true; kit.audio.sfx('station_bell', { volume: 0.18, rate: 0.7 }); }
      if (!tr.hold) tr.signalStopped = false;
      var wanted = tr.signalStopped ? 0 : cap;
      tr.speed += clamp(wanted - tr.speed, -170 * dt, 145 * dt); if (tr.speed < 0) tr.speed = 0; tr.dist += tr.speed * dt;
      if (e.stationS != null && !tr.stationHandled && tr.dist >= e.stationS) { tr.dist = e.stationS; tr.speed = 0; tr.dwell = 0.62 + (this.layout.def.dwellBonus || 0); }
      if (tr.dist >= e.poly.len && tr.dwell <= 0) { tr.dist -= e.poly.len; if (e.kind === 'exit') { if (!tr.stationHandled) { this.missed++; this.combo = 0; this.burst(this.poses[index].x, this.poses[index].y, 0xf26767, 9, 0); kit.audio.sfx('miss', { volume: 0.5 }); } tr.active = false; this.trainViews[index].setVisible(false); this.trainMarks[index].setVisible(false); if (this.selected === index) { this.selected = -1; this.syncHoldButton(); } return; } var next = e.kind === 'entry' ? 0 : e.segment + 1; if (next >= this.layout.junctions) { tr.edge = this.layout.exitIdx; tr.boundary = -1; tr.dist = 0; tr.stationHandled = false; tr.signalStopped = false; } else if (next >= this.activeJunctions) { tr.boundary = next; tr.dist = 0; } else { tr.edge = this.layout.routes[next][tr.tutorial && next === 0 ? 'side' : (this.switches[next] ? 'side' : 'main')]; tr.stationHandled = false; tr.signalStopped = false; } }
      this.syncPose(index);
    }
    pointSegmentDistance(px, py, ax, ay, bx, by) {
      var dx = bx - ax, dy = by - ay, t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1); t = clamp(t, 0, 1); return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
    }
    segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
      var abx = bx - ax, aby = by - ay, cdx = dx - cx, cdy = dy - cy, den = abx * cdy - aby * cdx;
      if (Math.abs(den) < 0.0001) return false;
      var acx = cx - ax, acy = cy - ay, t = (acx * cdy - acy * cdx) / den, u = (acx * aby - acy * abx) / den;
      return t >= 0 && t <= 1 && u >= 0 && u <= 1;
    }
    sweptTrainDistance(a, b, i, j) {
      var apx = typeof a.prevX === 'number' ? a.prevX : this.poses[i].x, apy = typeof a.prevY === 'number' ? a.prevY : this.poses[i].y;
      var bpx = typeof b.prevX === 'number' ? b.prevX : this.poses[j].x, bpy = typeof b.prevY === 'number' ? b.prevY : this.poses[j].y;
      var ac = this.poses[i], bc = this.poses[j];
      if (this.segmentsIntersect(apx, apy, ac.x, ac.y, bpx, bpy, bc.x, bc.y)) return 0;
      return Math.min(this.pointSegmentDistance(apx, apy, bpx, bpy, bc.x, bc.y), this.pointSegmentDistance(ac.x, ac.y, bpx, bpy, bc.x, bc.y), this.pointSegmentDistance(bpx, bpy, apx, apy, ac.x, ac.y), this.pointSegmentDistance(bc.x, bc.y, apx, apy, ac.x, ac.y));
    }
    checkCollisions() {
      for (var i = 0; i < MAX_TRAINS; i++) { var a = this.trains[i]; if (!a.active) continue; for (var j = i + 1; j < MAX_TRAINS; j++) { var b = this.trains[j]; if (!b.active) continue; var d = this.sweptTrainDistance(a, b, i, j); if (d < TRAIN_COLLISION_RADIUS) { this.crash(i, j); return; } if (d < TRAIN_NEAR_MISS_RADIUS && d >= TRAIN_COLLISION_RADIUS && this.nearMatrix[i][j] <= 0) { this.nearMatrix[i][j] = this.nearMatrix[j][i] = 0.52; this.nearMisses++; this.score += 12; this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo); this.burst((this.poses[i].x + this.poses[j].x) * 0.5, (this.poses[i].y + this.poses[j].y) * 0.5, 0x8cf2dd, 7, 1); this.spawnRailSparks((this.poses[i].x + this.poses[j].x) * 0.5, (this.poses[i].y + this.poses[j].y) * 0.5, 5); kit.audio.sfx('danger', { volume: 0.22, rate: 1.34 }); } } }
      for (var x = 0; x < MAX_TRAINS; x++) for (var y = x + 1; y < MAX_TRAINS; y++) if (this.nearMatrix[x][y] > 0) this.nearMatrix[x][y] = this.nearMatrix[y][x] = Math.max(0, this.nearMatrix[x][y] - STEP);
    }
    crash(a, b) {
      this.over = true; this.mode = 'result'; this.impactT = 0.34; this.score = Math.max(0, this.score); profile.best = Math.max(profile.best, this.score); profile.runs++; persist(); var x = (this.poses[a].x + this.poses[b].x) * 0.5, y = (this.poses[a].y + this.poses[b].y) * 0.5; this.burst(x, y, 0xf26767, 36, 1); this.spawnImpactFx(x, y, 42); kit.juice.shake(9, 260); kit.juice.hitStop(80); kit.audio.sfx('miss', { volume: 0.82, rate: 0.5 }); this.showResult(false, 'COLLISION', 'Two trains met on the same rail. Precise timing earns near-miss credit.', 0); }
    showResult(clear, title, sub, medals) {
      var resultLine = sub;
      if (clear && this.newLayoutUnlocked) { resultLine += ' New yard unlocked.'; this.newLayoutUnlocked = false; }
      this.clearBannerQueue(); this.setLayerVisible(this.playLayer, false); this.setLayerVisible(this.resultLayer, true); this.resultButton.button.text.setText(clear ? 'NEXT SHIFT' : 'REDEPLOY'); this.resultButton.button.fn = clear ? function () { this.showSelect(); }.bind(this) : function () { this.beginShift(this.selectedShift, this.selectedLayout); }.bind(this); setTextIfChanged(this.resultTitle, title); setTextIfChanged(this.resultSub, resultLine); setTextIfChanged(this.resultScore, String(this.score)); setTextIfChanged(this.resultMedal, clear ? ('MEDALS  ' + '◆'.repeat(medals) + '◇'.repeat(3 - medals) + '  •  BEST COMBO x' + this.bestCombo) : ('BEST  ' + profile.best)); this.resultButton.button.bg.setFillStyle(clear ? 0x1d5149 : 0x512d35, 0.96); this.resultShade.setFillStyle(clear ? 0x071c20 : 0x1d0b12, 0.86); this.relayout(this.scale.gameSize); }
    clearShift() {
      if (this.over) return; this.over = true; this.mode = 'result'; var shift = this.shift, medal = 0; if (this.delivered >= shift.target) medal++; if (this.bestCombo >= (shift.key === 'morning-rush' ? 3 : shift.key === 'peak-hour' ? 5 : 7)) medal++; if (this.missed === 0) medal++; var saveKey = shift.key + ':' + this.layout.key; profile.medals[saveKey] = Math.max(profile.medals[saveKey] || 0, medal); unlockAfter(shift); profile.best = Math.max(profile.best, this.score); profile.runs++; persist(); kit.audio.sfx('station_bell', { volume: 0.8, rate: 1.2 }); kit.audio.sfx('crowd_murmur', { volume: 0.28 }); this.showResult(true, 'SHIFT CLEAR', shift.name + ' complete. The next route is now on the board.', medal); }
    updateAudioState() {
      var danger = false;
      for (var i = 0; i < MAX_TRAINS; i++) if (this.trains[i].active && this.trains[i].patience / this.trains[i].maxPatience < 0.28) { danger = true; break; }
      var next = danger ? 'danger' : 'route';
      if (next === this.audioState) return;
      this.audioState = next; kit.audio.music(next === 'danger' ? 'music_danger' : 'music_route', 420); if (danger) kit.audio.sfx('danger', { volume: 0.38, rate: 0.92 });
    }
    freezeActiveTrains() {
      for (var i = 0; i < MAX_TRAINS; i++) if (this.trains[i].active) { this.trains[i].hold = true; this.trains[i].speed = 0; }
      this.syncHoldButton();
    }
    stepSim(dt) {
      if (this.mode !== 'play' || this.over) return;
      this.simTime += dt; this.shiftElapsed += dt; this.backpressureT = Math.max(0, this.backpressureT - dt); this.flashT = Math.max(0, this.flashT - dt);
      for (var i = 0; i < this.activeJunctions; i++) { this.switchPulse[i] = Math.max(0, this.switchPulse[i] - dt * 2.6); var want = this.switches[i] ? 1 : 0; this.switchPose[i] += clamp(want - this.switchPose[i], -dt * 5.8, dt * 5.8); }
      if (this.delivered >= this.shift.target) { this.freezeActiveTrains(); this.clearCountdown = this.clearCountdown < 0 ? 1.2 : this.clearCountdown - dt; if (this.clearCountdown <= 0) this.clearShift(); return; }
      if (this.delivered < this.shift.target && this.simTime >= this.nextSpawn) { if (this.activeTrainCount() < MAX_TRAINS) { var q = this.peekQueue(); if (this.spawnTrain(q.color, q.cargo)) { this.popQueue(); this.nextSpawn = this.simTime + this.spawnInterval(); } } else { if (this.backpressureT <= 0) this.showBanner('Depot full · clear a train', '', 0xf2c45e, 'event'); this.backpressureT = 1; this.nextSpawn = this.simTime + 0.25; } }
      for (var ti = 0; ti < MAX_TRAINS; ti++) if (this.trains[ti].active) { this.moveTrain(ti, dt); if (this.trains[ti].active && this.trains[ti].age > 0.12 && this.trains[ti].speed > 16 && this.rng() < dt * 1.9) this.spawnSmokeAt(ti, 1); if (this.delivered >= this.shift.target) break; }
      if (this.delivered < this.shift.target) { this.collectTokens(); this.checkCollisions(); } else this.freezeActiveTrains();
      this.updateAudioState();
      if (this.delivered >= this.shift.target) { if (this.clearCountdown < 0) this.clearCountdown = 1.2; this.clearCountdown -= dt; if (this.clearCountdown <= 0) this.clearShift(); }
    }
    updateFx(dt) {
      for (var p = 0; p < MAX_PARTICLES; p++) if (this.particles[p].active) { var part = this.particles[p]; part.life -= dt; part.x += part.vx * dt; part.y += part.vy * dt; part.vx *= 0.95; part.vy = part.vy * 0.95 + 25 * dt; if (part.life <= 0) part.active = false; }
      for (var s = 0; s < MAX_SMOKE; s++) if (this.smoke[s].active) { var sm = this.smoke[s]; sm.life -= dt; sm.x -= 3 * dt; sm.y -= 8 * dt; sm.size += dt * 4; if (sm.life <= 0) sm.active = false; }
      for (var tk = 0; tk < this.tokens.length; tk++) if (this.tokens[tk].active) { this.tokens[tk].life -= dt; if (this.tokens[tk].life <= 0) this.tokens[tk].active = false; }
      this.updateFxPool(this.railSparks, dt, 110); this.updateFxPool(this.deliveryFx, dt, 35); this.updateFxPool(this.tokenFx, dt, -12); this.updateFxPool(this.impactFx, dt, 170);
      this.impactT = Math.max(0, this.impactT - dt);
    }
    updateCamera(dt, juice) {
      if (this.mode !== 'play' || !this.layout) return;
      var risk = -1, ratio = 2;
      for (var i = 0; i < MAX_TRAINS; i++) if (this.trains[i].active) { var r = this.trains[i].patience / this.trains[i].maxPatience; if (r < ratio) { ratio = r; risk = i; } }
      if (risk >= 0 && ratio < 0.34 && this.simTime > this.cam.manualUntil) { var pose = this.poses[risk], view = this.cameras.main.getWorldPoint(0, 0), view2 = this.cameras.main.getWorldPoint(this.screenW, this.screenH); if (pose.x < view.x + 95 || pose.x > view2.x - 95 || pose.y < view.y + 105 || pose.y > view2.y - 95) { this.cam.tx = pose.x; this.cam.ty = pose.y; this.cam.tz = Math.max(this.cam.tz, 0.66); } }
      this.clampCameraTargets(); this.cam.x += (this.cam.tx - this.cam.x) * Math.min(1, dt * 5.5); this.cam.y += (this.cam.ty - this.cam.y) * Math.min(1, dt * 5.5); this.cam.zoom += (this.cam.tz - this.cam.zoom) * Math.min(1, dt * 6); this.cameras.main.setZoom(this.cam.zoom); this.cameras.main.centerOn(this.cam.x - ((juice && juice.dx) || 0) / Math.max(this.cam.zoom, 0.42), this.cam.y - ((juice && juice.dy) || 0) / Math.max(this.cam.zoom, 0.42));
    }
    paintWorld() {
      if (!this.layout || this.mode !== 'play') return;
      this.dynamic.clear(); var def = this.layout.def, pulse = 0.5 + 0.5 * Math.sin(this.cosmeticTime * 3.2), i;
      if (this.highlightT > 0) { var he = this.layout.edges[this.highlightEdge]; if (he) { this.dynamic.lineStyle(12, 0x9ff8ef, 0.16); this.strokePoints(this.dynamic, he.poly.pts); this.dynamic.lineStyle(5, 0x9ff8ef, 0.82); this.strokePoints(this.dynamic, he.poly.pts); } }
      if (this.shift.key === 'morning-rush' && this.tutorialStep < 2) { var guide = this.layout.edges[this.layout.routes[0].side]; this.dynamic.lineStyle(14, 0x9ff8ef, 0.18); this.strokePoints(this.dynamic, guide.poly.pts); this.dynamic.lineStyle(5, 0x9ff8ef, 0.92); this.strokePoints(this.dynamic, guide.poly.pts); }
      for (i = 0; i < this.layout.stations.length; i++) { var st = this.layout.stations[i], active = i < this.activeJunctions, col = COLOR_HEX[st.color], stationView = this.stationViews[i]; if (!active) { stationView.setVisible(false); continue; } stationView.setVisible(true).setFrame(Math.floor(this.cosmeticTime * 3 + i) % 3).setTint(col).setPosition(st.x, st.y).setScale(1.55); this.dynamic.fillStyle(0x08151e, 0.96); this.dynamic.fillRect(st.x - 32, st.y - 20, 64, 40); this.dynamic.lineStyle(3, col, 0.92); this.dynamic.strokeRect(st.x - 32, st.y - 20, 64, 40); this.dynamic.fillStyle(col, 0.95); this.drawShape(this.dynamic, st.x, st.y, COLOR_SHAPES[st.color], 9); for (var c = 0; c < 4; c++) { var bob = kit.juice.enabled ? Math.sin(this.cosmeticTime * 1.3 + i * 0.8 + c) * 2 : 0; this.dynamic.fillStyle(0xd7eee8, 0.58); this.dynamic.fillCircle(st.x - 21 + c * 13, st.y + 27 + bob, 3); } }
      for (i = 0; i < this.activeJunctions; i++) { var n = this.layout.nodes[i], route = this.layout.edges[this.layout.routes[i][this.switches[i] ? 'side' : 'main']], r = 14 + this.switchPulse[i] * 9; this.dynamic.fillStyle(0x07151d, 1); this.dynamic.fillCircle(n.x, n.y, r); this.dynamic.lineStyle(3, this.switchPulse[i] > 0 ? 0xf2c45e : 0x8ee8df, 0.95); this.dynamic.strokeCircle(n.x, n.y, r); var dir = R.at(route.poly, 28), throwT = this.switchPose[i], sx = n.x + (dir.x - n.x) * throwT, sy = n.y + (dir.y - n.y) * throwT; this.dynamic.lineStyle(6, this.switchPulse[i] > 0 ? 0xfff0ac : 0x9ff8ef, 1); this.dynamic.lineBetween(n.x, n.y, sx, sy); this.dynamic.fillStyle(0xf3ffff, 1); this.dynamic.fillCircle(n.x, n.y, 3); }
      this.dynamic.fillStyle(0x41e2a5, 0.85); this.dynamic.fillCircle(this.layout.edges[0].poly.pts[0].x, this.layout.edges[0].poly.pts[0].y, 11); this.dynamic.fillStyle(0xf26767, 0.85); var ex = this.layout.edges[this.layout.exitIdx].poly.pts[this.layout.edges[this.layout.exitIdx].poly.pts.length - 1]; this.dynamic.fillCircle(ex.x, ex.y, 12);
      for (i = 0; i < this.tokens.length; i++) if (this.tokens[i].active) { var tk = this.tokens[i], tPulse = 1 + Math.sin(this.cosmeticTime * 5 + i) * 0.12; this.dynamic.lineStyle(3, 0xf2c45e, 0.95); this.drawShape(this.dynamic, tk.x, tk.y, 'diamond', 12 * tPulse); this.dynamic.lineStyle(1, 0xfff0ac, 0.7); this.dynamic.strokeCircle(tk.x, tk.y, 17 * tPulse); }
      this.drawSignature(this.dynamic);
      for (i = 0; i < MAX_TRAINS; i++) this.paintTrain(i);
      this.paintFx();
    }
    drawShape(g, x, y, shape, size) {
      g.beginPath();
      if (shape === 'circle') g.arc(x, y, size, 0, Math.PI * 2);
      else if (shape === 'square') g.rect(x - size, y - size, size * 2, size * 2);
      else if (shape === 'diamond') { g.moveTo(x, y - size); g.lineTo(x + size, y); g.lineTo(x, y + size); g.lineTo(x - size, y); g.closePath(); }
      else if (shape === 'star') { for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? size * 0.45 : size; if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); }
      else { g.moveTo(x, y - size); g.lineTo(x + size, y + size); g.lineTo(x - size, y + size); g.closePath(); }
      g.fillPath();
    }
    paintTrain(index) {
      var tr = this.trains[index], view = this.trainViews[index], pose = this.poses[index]; if (!tr.active) { view.setVisible(false); this.trainMarks[index].setVisible(false); return; }
      var mark = this.trainMarks[index], selected = this.selected === index, patience = clamp(tr.patience / tr.maxPatience, 0, 1), rotation = Math.atan2(pose.ty, pose.tx);
      view.setVisible(true).setFrame(tr.hold ? 1 : (tr.speed > 16 ? 2 : 0)).setTint(COLOR_HEX[tr.color]).setPosition(pose.x, pose.y).setRotation(rotation).setScale(tr.cargo ? 1.35 : 1.25);
      mark.setVisible(true).setPosition(pose.x, pose.y).setRotation(rotation); mark.clear();
      if (selected) { mark.fillStyle(0xbffbf6, 0.18); mark.fillRoundedRect(-30, -22, 60, 44, 14); mark.lineStyle(2, 0xbffbf6, 0.8); mark.strokeRoundedRect(-30, -22, 60, 44, 14); }
      mark.fillStyle(0x07131c, 0.92); mark.fillRoundedRect(-18, -23, 36, 5, 2); mark.fillStyle(patience > 0.48 ? 0x56d6a6 : patience > 0.2 ? 0xf2c45e : 0xf26767, 1); mark.fillRect(-17, -22, 34 * patience, 3);
      mark.fillStyle(tr.hold ? 0xf26767 : 0x9ff8ef, 1); mark.fillCircle(-17, 15, tr.hold ? 4 : 2.4); if (tr.hold) { mark.lineStyle(2, 0xf26767, 0.9); mark.strokeCircle(0, 0, 28 + Math.sin(this.cosmeticTime * 5) * 2); }
      mark.fillStyle(0xf4ffff, 0.92); this.drawShape(mark, 0, 0, COLOR_SHAPES[tr.color], 4.2);
    }
    paintFx() {
      this.fx.clear();
      for (var i = 0; i < MAX_SMOKE; i++) if (this.smoke[i].active) { var sm = this.smoke[i]; this.fx.fillStyle(sm.color, clamp(sm.life / sm.max, 0, 1) * 0.22); this.fx.fillCircle(sm.x, sm.y, sm.size); }
      for (var p = 0; p < MAX_PARTICLES; p++) if (this.particles[p].active) { var part = this.particles[p], al = clamp(part.life / part.max, 0, 1); this.fx.fillStyle(part.color, al * 0.9); if (part.kind === 2) this.drawShape(this.fx, part.x, part.y, 'diamond', part.size * 1.5); else this.fx.fillCircle(part.x, part.y, part.size * (0.5 + al)); }
      this.paintFxPool(this.railSparks, 0.92, 'diamond'); this.paintFxPool(this.deliveryFx, 0.86, 'star'); this.paintFxPool(this.tokenFx, 0.9, 'diamond'); this.paintFxPool(this.impactFx, 0.94, 'triangle');
    }
    paintFxPool(pool, alpha, shape) {
      for (var i = 0; i < pool.length; i++) if (pool[i].active) { var p = pool[i], al = clamp(p.life / p.max, 0, 1); this.fx.fillStyle(p.color, al * alpha); this.drawShape(this.fx, p.x, p.y, shape, p.size * (0.7 + al)); }
    }
    paintHUD() {
      if (!this.shift || this.mode !== 'play') return;
      setTextIfChanged(this.scoreText, '◆ ' + this.score); setTextIfChanged(this.comboText, '×' + (1 + Math.min(this.combo, 10) * 0.08).toFixed(2));
      var qColor = this.queueColors[0], qEta = Math.max(0, this.queueTimes[0] - this.simTime), tokenCount = 0;
      for (var tc = 0; tc < this.tokens.length; tc++) if (this.tokens[tc].active) tokenCount++;
      this.nextIcon.clear(); this.nextIcon.fillStyle(COLOR_HEX[qColor], 1); this.drawShape(this.nextIcon, 0, 11, COLOR_SHAPES[qColor], 8); if (this.queueCargo[0]) { this.nextIcon.lineStyle(2, 0xfff0ac, 1); this.nextIcon.strokeCircle(0, 11, 11); }
      setTextIfChanged(this.nextText, qEta < 0.6 ? 'NOW' : Math.ceil(qEta) + 's'); setTextIfChanged(this.targetText, '● ' + this.delivered + '/' + this.shift.target + '  ◇' + tokenCount);
    }
    updateDebug() { debugState.mode = this.mode; debugState.score = this.score; debugState.combo = this.combo; debugState.layout = this.layout ? this.layout.key : this.selectedLayout; debugState.shift = this.shift ? this.shift.key : this.selectedShift; debugState.delivered = this.delivered; debugState.medals = this.shift && this.layout ? (profile.medals[this.shift.key + ':' + this.layout.key] || 0) : 0; }
    showBanner(title, sub, color, kind) {
      kind = kind || 'event'; if (this.mode !== 'play') return; var message = sub ? title + ' · ' + sub : title, item = { text: message, color: color || 0x55c7e8, kind: kind };
      if (this.bannerRoot.visible || this.bannerQueue.length) { this.bannerQueue.push(item); if (this.bannerQueue.length > 4) this.bannerQueue.shift(); } else this.startBanner(item);
    }
    startBanner(item) {
      this.bannerKind = item.kind; setTextIfChanged(this.bannerTitle, item.text); this.bannerRule.setFillStyle(item.color, 1); this.bannerRoot.setVisible(true); this.bannerRoot.setAlpha(1); this.bannerRoot.setScale(kit.juice.enabled ? 0.96 : 1); this.bannerT = item.kind === 'coach' ? 3.7 : item.kind === 'boundary' ? 1.35 : 1; this.bannerFade = item.kind === 'coach' ? 0.7 : item.kind === 'boundary' ? 0.25 : 0.2; this.bannerNearAlpha = item.kind === 'coach' ? 0.18 : 0; this.layoutBanner(this.screenW || 320); if (this.bannerTween) this.bannerTween.stop(); if (kit.juice.enabled) this.bannerTween = this.tweens.add({ targets: this.bannerRoot, scaleX: 1, scaleY: 1, duration: 140, ease: 'Linear' });
    }
    clearBannerQueue() { this.bannerQueue.length = 0; this.bannerT = 0; this.bannerRoot.setVisible(false).setAlpha(1); if (this.bannerTween) this.bannerTween.stop(); }
    updateBanner(dt) { if (!this.bannerRoot.visible) { if (this.bannerQueue.length && this.mode === 'play') this.startBanner(this.bannerQueue.shift()); return; } this.bannerT -= dt; if (this.bannerT < this.bannerFade) this.bannerRoot.setAlpha(this.bannerNearAlpha + (1 - this.bannerNearAlpha) * clamp(this.bannerT / this.bannerFade, 0, 1)); if (this.bannerT <= 0) { this.bannerRoot.setVisible(false).setAlpha(1); if (this.bannerQueue.length && this.mode === 'play') this.startBanner(this.bannerQueue.shift()); } }
    update(time, delta) {
      var dtReal = clamp((delta || 16) / 1000, 0, 0.05); this.cosmeticTime += dtReal; this.highlightT = Math.max(0, this.highlightT - dtReal); this.updateKeys(dtReal); var juice = kit.juice.frame(); if (this.mode === 'play' && !juice.frozen) { this.accum += dtReal; var steps = 0; while (this.accum >= STEP && steps < MAX_STEPS) { this.stepSim(STEP); this.accum -= STEP; steps++; } if (steps === MAX_STEPS && this.accum >= STEP) this.accum = STEP * 0.5; }
      this.updateFx(juice.frozen ? 0 : dtReal); this.updateCamera(dtReal, juice); this.paintWorld(); this.paintHUD(); this.updateDebug(); this.updateBanner(dtReal); if (this.mode === 'result') this.paintFx();
    }
  }

  var config = {
    type: Phaser.AUTO, parent: document.body, backgroundColor: '#07131c',
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight, autoCenter: Phaser.Scale.CENTER_BOTH }, render: { pixelArt: true, antialias: false, antialiasGL: false, powerPreference: 'high-performance', roundPixels: true },
    input: { activePointers: 4 }, scene: [BootScene, MainScene]
  };
  var game = new Phaser.Game(config);
  window.__SL_GAME = game;
})();
