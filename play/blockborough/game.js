/* Blockborough Phaser presentation and input layer. */
(function () {
  'use strict';

  var Sim = window.BlockboroughSim;
  var N = Sim.N, W = Sim.W, H = Sim.H, T = Sim.T;
  var AUDIO = {
    musicDawn: 'assets/audio/city-dawn.mp3', musicRush: 'assets/audio/city-rush.mp3',
    tap: 'assets/audio/select_001.mp3', error: 'assets/audio/error_008.mp3',
    milestone: 'assets/audio/bong_001.mp3', place: 'assets/audio/drop_004.mp3',
    menu: 'assets/audio/open_002.mp3', raze: 'assets/audio/back_004.mp3',
    toggle: 'assets/audio/toggle_002.mp3', scroll: 'assets/audio/scroll_002.mp3'
  };
  var SFX = ['tap', 'error', 'milestone', 'place', 'menu', 'raze', 'toggle', 'scroll'];
  var profile = null;
  var sceneRef = null;
  var audioStarted = false;
  var toastTimer = 0;
  var MAX_FUNDS = 100000000;
  var MAX_MONTH = 1000000;
  var MAX_GROWTH = 64;

  function validCity(city) {
    if (!city || !Array.isArray(city.t) || city.t.length !== N || !Array.isArray(city.d) || city.d.length !== N || !Array.isArray(city.g) || city.g.length !== N) return false;
    var hasCityPiece = false;
    for (var i = 0; i < N; i++) {
      if (!Number.isInteger(city.t[i]) || city.t[i] < T.GRASS || city.t[i] > T.PARK) return false;
      if (!Number.isInteger(city.d[i]) || city.d[i] < 0 || city.d[i] > 2 || (city.t[i] !== T.HOME && city.t[i] !== T.SHOP && city.t[i] !== T.POWER && city.d[i] !== 0) || !Number.isFinite(city.g[i]) || Math.abs(city.g[i]) > MAX_GROWTH) return false;
      if (city.t[i] >= T.ROAD) hasCityPiece = true;
    }
    return Number.isInteger(city.seed) && hasCityPiece && Number.isFinite(city.funds) && city.funds >= 0 && city.funds <= MAX_FUNDS &&
      Number.isInteger(city.pop) && city.pop >= 0 && city.pop <= N * Sim.HOME_POP[2] && Number.isInteger(city.month) && city.month >= 1 && city.month <= MAX_MONTH &&
      Number.isFinite(city.income) && city.income >= -MAX_FUNDS && city.income <= MAX_FUNDS && Number.isFinite(city.upkeep) && city.upkeep >= 0 && city.upkeep <= MAX_FUNDS && Number.isInteger(city.goal) && city.goal >= 0 && city.goal <= Sim.GOALS.length &&
      Number.isInteger(city.best) && city.best >= 0 && city.best <= N * Sim.HOME_POP[2] && (city.tutorialStep == null || (Number.isInteger(city.tutorialStep) && city.tutorialStep >= 0 && city.tutorialStep <= 5));
  }
  function defaultSave() {
    return { version: 2, activeSlot: 0, slots: [null, null, null], meta: { version: 2, tutorialComplete: false, milestones: [], best: 0 } };
  }
  function validateSave(value) {
    if (!value || value.version !== 2 || !Array.isArray(value.slots) || value.slots.length !== 3 || !value.meta) return false;
    for (var i = 0; i < value.slots.length; i++) if (value.slots[i] !== null && !validCity(value.slots[i])) return false;
    return Number.isInteger(value.activeSlot) && value.activeSlot >= 0 && value.activeSlot < 3 && Array.isArray(value.meta.milestones) && value.meta.milestones.every(function (id) { return Sim.MILESTONES.some(function (m) { return m.id === id; }); }) && typeof value.meta.tutorialComplete === 'boolean' && Number.isInteger(value.meta.best) && value.meta.best >= 0 && value.meta.best <= N * Sim.HOME_POP[2];
  }
  var kit = GGKit.create({
    slug: 'blockborough', orientation: 'portrait', validateSave: validateSave,
    onPause: function (reason) {
      if (sceneRef) sceneRef.clearTransientState();
      if (sceneRef && sceneRef.scene.isActive()) sceneRef.scene.pause();
      document.getElementById('pauseOverlay').classList.toggle('hidden', reason !== 'manual');
      document.getElementById('pauseButton').textContent = 'RESUME';
    },
    onResume: function () {
      if (sceneRef && sceneRef.scene.isPaused()) sceneRef.scene.resume();
      if (sceneRef) sceneRef.clearTransientState();
      document.getElementById('pauseOverlay').classList.add('hidden');
      document.getElementById('pauseButton').textContent = 'PAUSE';
    },
    onRestart: function () { if (sceneRef) sceneRef.newCity(); }
  });
  kit.audio.register(AUDIO);
  kit.registerPWA();

  function byId(id) { return document.getElementById(id); }
  function toast(text, tone) {
    var el = byId('toast');
    el.textContent = text;
    el.style.borderColor = tone === 'bad' ? '#a55359' : tone === 'good' ? '#4f9277' : '#4b6b6b';
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2300);
  }
  function money(n) { return '$' + Math.max(0, Math.round(n)).toLocaleString('en-US'); }
  function saveSnapshot() {
    if (!sceneRef || !sceneRef.state) return;
    profile.best = Math.max(profile.best | 0, sceneRef.state.best | 0);
    profile.tutorialComplete = !!profile.tutorialComplete;
    var packet = kit.save.get(defaultSave());
    packet.version = 2; packet.activeSlot = sceneRef.slot | 0; packet.slots = packet.slots || [null, null, null]; packet.slots[sceneRef.slot] = Sim.serialize(sceneRef.state, sceneRef.tutorialStep); packet.meta = profile;
    kit.save.set(packet);
  }
  function startAudio() {
    if (audioStarted) return;
    audioStarted = true;
    kit.audio.music('musicDawn', 550);
    var warm = function () { if (audioStarted) kit.audio.preload(SFX); };
    if (window.requestIdleCallback) window.requestIdleCallback(warm, { timeout: 1200 }); else setTimeout(warm, 180);
  }
  function sfx(name, opts) { if (audioStarted) kit.audio.sfx(name, opts || {}); }
  function pointerIdentity(pointer) {
    var eventId = pointer.event && pointer.event.pointerId;
    if (eventId != null) return eventId;
    if (pointer.identifier != null) return pointer.identifier;
    return pointer.id;
  }

  function CityScene() { Phaser.Scene.call(this, { key: 'CityScene' }); }
  CityScene.prototype = Object.create(Phaser.Scene.prototype);
  CityScene.prototype.constructor = CityScene;

  CityScene.prototype.preload = function () {
    var self = this;
    this.load.on('progress', function (v) {
      var fill = byId('loadingFill'); if (fill) fill.style.width = ((8 + v * 84).toFixed(1)) + '%';
      kit.loader.progress(0.16 + v * 0.78);
    });
    this.load.atlas('blockAtlas', 'assets/blockborough-atlas.svg', 'assets/blockborough-atlas.json');
    this.load.spritesheet('town', 'assets/town-sheet.png', { frameWidth: 16, frameHeight: 16 });
  };

  CityScene.prototype.create = function () {
    sceneRef = this;
    this.running = false;
    this.speed = 1;
    this.tickClock = 0;
    this.waterClock = 0;
    this.stateDirty = true;
    this.slot = 0;
    this.cursor = { x: 8, y: 11 };
    this.activePointer = null;
    this.lastPaint = -1;
    this.lastPaintCell = null;
    this.touchPoints = new Map();
    this.gesture = null;
    this.tutorialStep = 0;
    this.selectedTool = Sim.TOOLS[0];
    this.selectedToolColor = 0x73838b;
    this.roadKeys = [];
    this.powerRoadKeys = [];
    this.flowKeys = [];
    this.roadEdges = [];
    this.waterKeys = [];
    this.parkKeys = [];
    this.litKeys = [];
    this.zoom = 1;
    this.panX = 0; this.panY = 0;
    this.brushKey = -1; this.brushReason = '';
    this.previewKey = -1; this.previewFunds = -1; this.previewTool = null; this.preview = null;
    this.buildEffects = [];
    this.milestoneQueue = [];
    this.milestoneFx = null;
    this.originX = 0; this.originY = 0; this.tileW = 20; this.tileH = 11;
    this.world = this.add.container(0, 0).setDepth(1);
    this.board = this.add.graphics().setDepth(1);
    this.buildings = this.add.graphics().setDepth(3);
    this.dynamic = this.add.graphics().setDepth(7);
    this.selection = this.add.graphics().setDepth(12);
    this.planner = this.add.image(0, 0, 'blockAtlas', 'planner-idle').setDepth(13).setOrigin(.5, .76);
    this.ghost = this.add.image(0, 0, 'blockAtlas', 'grass').setDepth(11).setOrigin(.5, .68).setAlpha(.34);
    this.minimap = this.add.graphics().setDepth(18);
    this.tilePool = [];
    for (i = 0; i < N; i++) this.tilePool.push(this.add.image(0, 0, 'blockAtlas', 'grass').setVisible(false).setDepth(1).setOrigin(.5, .64));
    this.structurePool = [];
    for (i = 0; i < N; i++) this.structurePool.push(this.add.image(0, 0, 'blockAtlas', 'home-0').setVisible(false).setDepth(3).setOrigin(.5, .76));
    this.decorPool = [];
    for (var i = 0; i < 72; i++) this.decorPool.push(this.add.image(0, 0, 'town', 0).setVisible(false).setDepth(4).setOrigin(.5, .9));
    this.trafficPool = [];
    for (i = 0; i < 44; i++) this.trafficPool.push(this.add.circle(0, 0, 1.7, 0xffd47b, 1).setVisible(false).setDepth(9));
    this.fxPool = [];
    for (i = 0; i < 32; i++) this.fxPool.push(this.add.circle(0, 0, 3, 0xffffff, 0).setVisible(false).setDepth(14));
    this.world.add(this.board); this.world.add(this.buildings); this.world.add(this.dynamic); this.world.add(this.selection); this.world.add(this.planner); this.world.add(this.ghost);
    for (i = 0; i < this.tilePool.length; i++) this.world.add(this.tilePool[i]);
    for (i = 0; i < this.structurePool.length; i++) this.world.add(this.structurePool[i]);
    for (i = 0; i < this.decorPool.length; i++) this.world.add(this.decorPool[i]);
    for (i = 0; i < this.trafficPool.length; i++) this.world.add(this.trafficPool[i]);
    for (i = 0; i < this.fxPool.length; i++) this.world.add(this.fxPool[i]);
    this.makeParticleSystems();
    this.world.add(this.placeParticles); this.world.add(this.milestoneParticles);
    this.bindInput();
    this.bindDom();
    this.loadPacket();
    this.resizeBoard();
    this.scale.on('resize', this.resizeBoard, this);
    kit.loader.progress(1); kit.loader.hide();
    byId('loadingFill').style.width = '100%'; byId('loadingOverlay').classList.add('hidden');
    this.renderAll();
    this.updateHud();
  };

  CityScene.prototype.makeParticleSystems = function () {
    var g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1); g.fillCircle(3, 3, 3); g.generateTexture('spark', 6, 6); g.destroy();
    this.placeParticles = this.add.particles(0, 0, 'spark', {
      lifespan: 460, speed: { min: 18, max: 52 }, scale: { start: 1.2, end: 0 }, alpha: { start: .95, end: 0 },
      rotate: { min: -180, max: 180 }, gravityY: 22, emitting: false, quantity: 0, blendMode: Phaser.BlendModes.ADD
    }).setDepth(14);
    this.milestoneParticles = this.add.particles(0, 0, 'spark', {
      lifespan: 900, speed: { min: 48, max: 110 }, scale: { start: 1.8, end: 0 }, alpha: { start: 1, end: 0 },
      rotate: { min: -240, max: 240 }, gravityY: 42, emitting: false, quantity: 0, blendMode: Phaser.BlendModes.ADD
    }).setDepth(15);
  };

  CityScene.prototype.loadPacket = function () {
    var packet = kit.save.get(defaultSave());
    profile = packet.meta || defaultSave().meta;
    this.slot = Math.max(0, Math.min(2, packet.activeSlot | 0));
    byId('slotSelect').value = String(this.slot);
    this.state = packet.slots[this.slot] ? Sim.restore(packet.slots[this.slot]) : Sim.blank(0x31415926);
    if (!this.state) this.state = Sim.blank(0x31415926);
    Sim.analyze(this.state);
    this.tickClock = 0;
    this.tutorialStep = this.state.tutorialStep || 0;
    this.running = false;
    if (packet.slots[this.slot]) byId('startButton').textContent = 'CONTINUE CITY';
    if (profile.tutorialComplete) byId('tutorialPanel').classList.add('hidden');
  };

  CityScene.prototype.bindInput = function () {
    var self = this;
    this.input.on('pointerdown', function (pointer) {
      var id = pointerIdentity(pointer);
      if (pointer.wasTouch) {
        self.touchPoints.set(id, { x: pointer.x, y: pointer.y });
        if (self.touchPoints.size >= 2) { self.activePointer = null; self.lastPaint = -1; self.gesture = self.gesture || { distance: self.touchDistance(), zoom: self.zoom, panX: self.panX, panY: self.panY, center: self.touchCenter() }; return; }
      }
      if (self.activePointer !== null) return;
      self.activePointer = id;
      startAudio(); self.paint(pointer);
    });
    this.input.on('pointermove', function (pointer) {
      var id = pointerIdentity(pointer);
      if (pointer.wasTouch) self.touchPoints.set(id, { x: pointer.x, y: pointer.y });
      if (self.gesture && self.touchPoints.size >= 2) { self.updateGesture(); return; }
      if (self.activePointer !== null && id !== self.activePointer) return;
      if (self.activePointer !== null) self.paint(pointer); else self.moveCursor(pointer);
    });
    function release(pointer) {
      var id = pointerIdentity(pointer);
      if (pointer.wasTouch) self.touchPoints.delete(id);
      if (self.touchPoints.size < 2) self.gesture = null;
      if (id === self.activePointer) { self.activePointer = null; self.lastPaint = -1; self.lastPaintCell = null; }
    }
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
    this.input.on('pointercancel', release);
    this.input.keyboard.on('keydown', function (event) {
      if (kit.paused) return;
      startAudio();
      var key = event.key.toLowerCase();
      var toolIndex = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5 }[key];
      if (toolIndex !== undefined) { self.selectTool(Sim.TOOLS[toolIndex]); return; }
      if (key === 'p' || key === 'escape') { self.togglePause(); return; }
      if (key === 'f') { self.cycleSpeed(); return; }
      if (key === 'n') { self.confirmNewCity(); return; }
      if (key === ' ' || key === 'enter') { event.preventDefault(); self.placeAt(self.cursor.x, self.cursor.y); return; }
      var dx = 0, dy = 0;
      if (key === 'arrowleft' || key === 'a') dx = -1;
      if (key === 'arrowright' || key === 'd') dx = 1;
      if (key === 'arrowup' || key === 'w') dy = -1;
      if (key === 'arrowdown' || key === 's') dy = 1;
      if (dx || dy) { self.cursor.x = Math.max(0, Math.min(W - 1, self.cursor.x + dx)); self.cursor.y = Math.max(0, Math.min(H - 1, self.cursor.y + dy)); }
    });
  };

  CityScene.prototype.bindDom = function () {
    var self = this;
    document.querySelectorAll('.tool').forEach(function (button) { button.addEventListener('pointerdown', function () { startAudio(); self.selectTool(Sim.TOOLS.find(function (t) { return t.id === button.dataset.tool; })); }); });
    byId('startButton').addEventListener('click', function () { self.startRun(); });
    byId('settingsButton').addEventListener('click', function () { startAudio(); self.openSettings(); });
    byId('titleSettings').addEventListener('click', function () { startAudio(); self.openSettings(); });
    byId('pauseButton').addEventListener('click', function () { self.togglePause(); });
    byId('resumeButton').addEventListener('click', function () { kit.resume('manual'); });
    byId('pauseSettings').addEventListener('click', function () { self.openSettings(); });
    byId('speedButton').addEventListener('click', function () { self.cycleSpeed(); });
    byId('zoomOutButton').addEventListener('click', function () { self.setZoom(self.zoom - .25); });
    byId('zoomInButton').addEventListener('click', function () { self.setZoom(self.zoom + .25); });
    byId('overviewButton').addEventListener('click', function () { self.setZoom(1); self.panX = 0; self.panY = 0; self.resizeBoard(); });
    byId('saveButton').addEventListener('click', function () { startAudio(); self.saveCity(); });
    byId('loadButton').addEventListener('click', function () { startAudio(); self.loadCity(); });
    byId('newButton').addEventListener('click', function () { self.confirmNewCity(); });
    byId('slotSelect').addEventListener('change', function () { self.slot = parseInt(this.value, 10) || 0; });
    byId('tutorialSkip').addEventListener('click', function () { profile.tutorialComplete = true; self.tutorialStep = 5; self.state.tutorialStep = 5; byId('tutorialPanel').classList.add('hidden'); saveSnapshot(); toast('Briefing skipped. The city is yours.'); });
    byId('confirmCancel').addEventListener('click', function () { byId('confirmOverlay').classList.add('hidden'); kit.resume('confirm'); });
    byId('confirmReseed').addEventListener('click', function () { byId('confirmOverlay').classList.add('hidden'); kit.resume('confirm'); self.newCity(); });
    byId('settingsClose').addEventListener('click', function () { byId('settingsOverlay').classList.add('hidden'); kit.resume('settings'); });
    byId('musicVolume').addEventListener('input', function () { kit.audio.setMusicVolume(Number(this.value) / 100); });
    byId('sfxVolume').addEventListener('input', function () { kit.audio.setSfxVolume(Number(this.value) / 100); });
    byId('soundToggle').addEventListener('click', function () { kit.audio.setMute(!kit.audio.prefs.mute); self.paintSettings(); });
    byId('motionToggle').addEventListener('click', function () { kit.juice.enabled = !kit.juice.enabled; self.paintSettings(); });
    byId('fullscreenButton').addEventListener('click', function () { kit.requestFullscreen(); });
  };

  CityScene.prototype.openSettings = function () {
    kit.pause('settings');
    this.paintSettings();
    byId('settingsOverlay').classList.remove('hidden');
  };
  CityScene.prototype.paintSettings = function () {
    byId('musicVolume').value = String(Math.round(kit.audio.prefs.music * 100));
    byId('sfxVolume').value = String(Math.round(kit.audio.prefs.sfx * 100));
    byId('soundToggle').textContent = 'Sound: ' + (kit.audio.prefs.mute ? 'Off' : 'On');
    byId('motionToggle').textContent = 'Screen motion: ' + (kit.juice.enabled ? 'On' : 'Reduced');
  };

  CityScene.prototype.startRun = function () {
    this.running = true; startAudio(); byId('titleOverlay').classList.add('hidden');
    if (!profile.tutorialComplete) this.showTutorial();
    sfx('tap', { volume: .65 });
  };
  CityScene.prototype.showTutorial = function () {
    var steps = [
      ['01 / Lay a spine', 'Select ROAD, then place the glowing ghost beside the starter street. Cost: $12.'],
      ['02 / Invite residents', 'Select HOMES and place the ghost beside a road. Homes grow when services connect.'],
      ['03 / Turn on the lights', 'Select PLANT and place the ghost beside the road network. Teal pulses confirm power.'],
      ['04 / Open a market', 'Select SHOPS and place the ghost within five tiles of a powered home.'],
      ['05 / Make room', 'Select PARK and watch the greenbelt lift desirability around the first district.']
    ];
    var targets = [{ x: 11, y: 10 }, { x: 9, y: 9 }, { x: 8, y: 9 }, { x: 10, y: 9 }, { x: 8, y: 11 }];
    var step = steps[this.tutorialStep] || steps[0];
    this.tutorialTarget = targets[this.tutorialStep] || targets[0];
    this.cursor = { x: this.tutorialTarget.x, y: this.tutorialTarget.y };
    this.state.tutorialStep = this.tutorialStep;
    byId('tutorialTitle').textContent = step[0]; byId('tutorialText').textContent = step[1]; byId('tutorialPanel').classList.remove('hidden');
  };
  CityScene.prototype.tutorialPlaced = function (toolId) {
    if (profile.tutorialComplete) return;
    var expected = ['road', 'home', 'power', 'shop', 'park'][this.tutorialStep];
    if (expected !== toolId) { toast('Briefing wants ' + expected.toUpperCase() + ' next.', 'bad'); return; }
    this.tutorialStep++;
    this.state.tutorialStep = this.tutorialStep;
    if (this.tutorialStep >= 5) {
      profile.tutorialComplete = true; byId('tutorialPanel').classList.add('hidden'); toast('First district online. Build toward 5,000 residents.', 'good'); sfx('milestone', { volume: .55 }); saveSnapshot();
    } else this.showTutorial();
  };

  CityScene.prototype.selectTool = function (tool) {
    if (!tool) return;
    this.selectedTool = tool;
    this.selectedToolColor = Phaser.Display.Color.HexStringToColor(tool.col).color;
    document.querySelectorAll('.tool').forEach(function (el) { el.classList.toggle('selected', el.dataset.tool === tool.id); });
    byId('stage').setAttribute('aria-label', tool.name + ' selected. Tap or drag the city board to place. Cost ' + tool.cost + '.');
    byId('brushStatus').textContent = tool.name.toUpperCase() + ' $' + tool.cost + ' · move over a tile';
    byId('brushStatus').className = '';
    sfx('tap', { volume: .45, rate: tool.id === 'raze' ? .9 : 1.05 });
  };
  CityScene.prototype.moveCursor = function (pointer) {
    var cell = this.screenToGrid(pointer.x, pointer.y);
    if (cell) { this.cursor = cell; }
  };
  CityScene.prototype.paint = function (pointer) {
    if (!this.running || kit.paused) return;
    var cell = this.screenToGrid(pointer.x, pointer.y);
    if (!cell) return;
    this.cursor = cell;
    var key = cell.y * W + cell.x;
    if (key === this.lastPaint) return;
    var from = this.lastPaintCell || cell, dx = cell.x - from.x, dy = cell.y - from.y, steps = Math.max(Math.abs(dx), Math.abs(dy));
    var changed = false;
    for (var i = 1; i <= Math.max(1, steps); i++) {
      var x = Math.round(from.x + dx * i / Math.max(1, steps)), y = Math.round(from.y + dy * i / Math.max(1, steps));
      if (this.placeAt(x, y, { defer: true })) changed = true;
    }
    this.lastPaint = key; this.lastPaintCell = cell;
    if (changed) this.commitPlacement(cell.x, cell.y);
  };
  CityScene.prototype.placeAt = function (x, y, options) {
    if (!this.running || kit.paused) return;
    var changed = Sim.place(this.state, x, y, this.selectedTool);
    if (!changed) {
      if (!options || !options.defer) {
        var message = this.state.placeError === 'insufficient-funds' ? 'Treasury is too low for that tile.' : this.state.placeError === 'blocked-terrain' ? 'That terrain is protected.' : this.state.placeError === 'occupied' ? 'That tile is already occupied.' : this.state.placeError === 'duplicate' ? 'That tile already has this zone.' : this.state.placeError === 'core' ? 'Keep one city piece online.' : '';
        if (message) { toast(message, 'bad'); sfx('error', { volume: .65 }); }
      }
      return false;
    }
    this.stateDirty = true; this.queueBuildFx(x, y);
    if (options && options.defer) return true;
    this.commitPlacement(x, y);
    return true;
  };
  CityScene.prototype.commitPlacement = function (x, y) {
    Sim.analyze(this.state); this.renderAll(); this.updateHud(); saveSnapshot();
    if (kit.juice.enabled) { kit.juice.shake(1.3, 80); kit.juice.hitStop(48); }
    sfx(this.selectedTool.id === 'raze' ? 'raze' : 'place', { volume: .48, rate: .92 + ((x + y) % 4) * .05 });
    this.tutorialPlaced(this.selectedTool.id);
  };

  CityScene.prototype.togglePause = function () {
    if (!this.running) return;
    if (kit.paused) kit.resume('manual'); else { startAudio(); kit.pause('manual'); sfx('toggle', { volume: .55 }); }
  };
  CityScene.prototype.cycleSpeed = function () {
    this.speed = this.speed === 1 ? 2 : 1;
    byId('speedButton').textContent = 'SPEED ' + this.speed + '×';
    toast(this.speed === 2 ? 'Two month clock enabled.' : 'Normal month clock enabled.'); sfx('toggle', { volume: .45, rate: this.speed === 2 ? 1.15 : .9 });
  };
  CityScene.prototype.saveCity = function () { saveSnapshot(); toast('City saved to slot ' + (this.slot + 1) + '.', 'good'); sfx('menu', { volume: .5 }); };
  CityScene.prototype.loadCity = function () {
    var packet = kit.save.get(defaultSave()), loaded = packet.slots[this.slot] && Sim.restore(packet.slots[this.slot]);
    if (!loaded) { toast('Slot ' + (this.slot + 1) + ' is empty.', 'bad'); sfx('error', { volume: .5 }); return; }
    this.state = loaded; this.tutorialStep = loaded.tutorialStep || 0; this.tickClock = 0; this.clearTransientState(); Sim.analyze(this.state); this.stateDirty = true; this.renderAll(); this.updateHud(); toast('Slot ' + (this.slot + 1) + ' loaded.', 'good'); sfx('menu', { volume: .5 });
  };
  CityScene.prototype.confirmNewCity = function () {
    kit.pause('confirm');
    byId('confirmSlot').textContent = String(this.slot + 1);
    byId('confirmOverlay').classList.remove('hidden');
  };
  CityScene.prototype.newCity = function () {
    this.state = Sim.blank((Date.now() ^ 0xB10C0) >>> 0); this.running = true; this.tickClock = 0; this.clearTransientState(); this.tutorialStep = profile.tutorialComplete ? 5 : 0; this.state.tutorialStep = this.tutorialStep;
    byId('titleOverlay').classList.add('hidden'); if (profile.tutorialComplete) byId('tutorialPanel').classList.add('hidden'); else this.showTutorial(); this.stateDirty = true; this.renderAll(); this.updateHud(); saveSnapshot(); toast('New terrain seeded. Start with the road.', 'good');
  };

  CityScene.prototype.clearTransientState = function () {
    this.activePointer = null; this.lastPaint = -1; this.lastPaintCell = null; this.touchPoints.clear(); this.gesture = null; this.tickClock = 0;
  };
  CityScene.prototype.touchCenter = function () {
    var sumX = 0, sumY = 0, count = 0;
    this.touchPoints.forEach(function (p) { sumX += p.x; sumY += p.y; count++; });
    return { x: count ? sumX / count : 0, y: count ? sumY / count : 0 };
  };
  CityScene.prototype.touchDistance = function () {
    var points = Array.from(this.touchPoints.values());
    if (points.length < 2) return 0;
    return Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
  };
  CityScene.prototype.updateGesture = function () {
    if (!this.gesture) return;
    var center = this.touchCenter(), distance = this.touchDistance();
    this.setZoom(this.gesture.zoom * distance / Math.max(1, this.gesture.distance), true);
    this.panX = this.gesture.panX + (center.x - this.gesture.center.x);
    this.panY = this.gesture.panY + (center.y - this.gesture.center.y);
    this.resizeBoard();
  };
  CityScene.prototype.setZoom = function (value, quiet) {
    this.zoom = Math.max(1, Math.min(2.25, Number(value) || 1));
    this.resizeBoard();
    if (!quiet) toast(this.zoom === 1 ? 'Full city overview.' : 'City view ' + this.zoom.toFixed(2) + '×. Pinch or drag with two fingers to pan.');
  };

  CityScene.prototype.resizeBoard = function () {
    var w = this.scale.width || byId('stage').clientWidth || 390, h = this.scale.height || byId('stage').clientHeight || 360;
    this.baseTileW = Math.max(17, Math.min(22, (w - 12) / ((W + H) / 2)));
    this.tileW = this.baseTileW * this.zoom;
    this.tileH = this.tileW * .55;
    var boardH = (W + H) * this.tileH / 2;
    this.originX = w / 2 + this.panX; this.originY = Math.max(20, (h - boardH) / 2 + 12) + this.panY;
    var maxPanX = Math.max(0, (boardH * .8 - w) / 2), maxPanY = Math.max(0, (boardH - h) / 2 + 24);
    this.panX = Math.max(-maxPanX, Math.min(maxPanX, this.panX)); this.panY = Math.max(-maxPanY, Math.min(maxPanY, this.panY));
    this.originX = w / 2 + this.panX; this.originY = Math.max(20, (h - boardH) / 2 + 12) + this.panY;
    this.artScale = this.tileW / 54;
    this.drawMinimap();
    if (this.state) { this.stateDirty = true; this.renderAll(); }
  };
  CityScene.prototype.iso = function (x, y) {
    return { x: this.originX + (x - y) * this.tileW / 2, y: this.originY + (x + y) * this.tileH / 2 };
  };
  CityScene.prototype.screenToGrid = function (px, py) {
    var dx = (px - this.originX) / (this.tileW / 2), dy = (py - this.originY) / (this.tileH / 2);
    var x = Math.floor((dx + dy) / 2), y = Math.floor((dy - dx) / 2);
    return x >= 0 && x < W && y >= 0 && y < H ? { x: x, y: y } : null;
  };
  CityScene.prototype.diamond = function (g, x, y, fill, alpha, stroke) {
    var hw = this.tileW / 2, hh = this.tileH / 2;
    g.fillStyle(fill, alpha == null ? 1 : alpha); g.beginPath(); g.moveTo(x, y - hh); g.lineTo(x + hw, y); g.lineTo(x, y + hh); g.lineTo(x - hw, y); g.closePath(); g.fillPath();
    if (stroke) { g.lineStyle(0.65, stroke, .55); g.strokePath(); }
  };
  CityScene.prototype.renderAll = function () {
    if (!this.state || !this.board) return;
    this.previewKey = -1; this.preview = null;
    this.rebuildLists(); this.drawBoard(); this.drawMinimap(); this.stateDirty = false;
  };
  CityScene.prototype.hasNeighbor = function (x, y, type) {
    var offsets = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var i = 0; i < offsets.length; i++) {
      var nx = x + offsets[i][0], ny = y + offsets[i][1];
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && this.state.t[ny * W + nx] === type) return true;
    }
    return false;
  };
  CityScene.prototype.terrainFrame = function (type, x, y) {
    if (type === T.WATER) return 'water';
    if (type === T.HILL) return 'hill';
    if (type === T.ROAD) return this.hasNeighbor(x, y, T.WATER) ? 'road-edge' : 'road';
    if (type === T.PARK) return 'park';
    return this.hasNeighbor(x, y, T.WATER) ? 'grass-water' : 'grass';
  };
  CityScene.prototype.structureFrame = function (type, tier) {
    var name = type === T.HOME ? 'home' : type === T.SHOP ? 'shop' : 'power';
    return name + '-' + Math.max(0, Math.min(2, tier | 0));
  };
  CityScene.prototype.drawBoard = function () {
    var usedStructures = 0;
    for (var d = 0; d < this.decorPool.length; d++) this.decorPool[d].setVisible(false);
    for (var i = 0; i < N; i++) {
      var x = i % W, y = (i / W) | 0, p = this.iso(x, y), type = this.state.t[i], tile = this.tilePool[i];
      tile.setFrame(this.terrainFrame(type, x, y)).setPosition(p.x, p.y).setScale(this.artScale).setVisible(true);
      var structure = this.structurePool[i], isBuilding = type === T.HOME || type === T.SHOP || type === T.POWER;
      if (isBuilding) {
        structure.setFrame(this.structureFrame(type, this.state.d[i])).setPosition(p.x, p.y - this.tileH * .2).setScale(this.artScale * 1.08).setVisible(true);
        if (this.state.d[i] >= 1 && usedStructures < this.litKeys.length) usedStructures++;
      } else structure.setVisible(false);
    }
  };
  CityScene.prototype.rebuildLists = function () {
    this.roadKeys.length = 0; this.powerRoadKeys.length = 0; this.flowKeys.length = 0; this.roadEdges.length = 0; this.waterKeys.length = 0; this.parkKeys.length = 0; this.litKeys.length = 0;
    for (var i = 0; i < N; i++) {
      var x = i % W, y = (i / W) | 0;
      if (this.state.t[i] === T.ROAD) {
        this.roadKeys.push(i); if (this.state.pow[i]) this.powerRoadKeys.push(i);
        if (x < W - 1 && this.state.t[i + 1] === T.ROAD) this.roadEdges.push([i, i + 1]);
        if (y < H - 1 && this.state.t[i + W] === T.ROAD) this.roadEdges.push([i, i + W]);
      }
      if (this.state.t[i] === T.WATER) this.waterKeys.push(i);
      if (this.state.t[i] === T.PARK) this.parkKeys.push(i);
      if ((this.state.t[i] === T.HOME || this.state.t[i] === T.SHOP || this.state.t[i] === T.POWER) && this.state.d[i] >= 1 && this.state.pow[i]) this.litKeys.push(i);
    }
    for (i = 0; i < N; i++) if (this.state.t[i] === T.POWER) this.flowKeys.push(i);
  };
  CityScene.prototype.drawMinimap = function () {
    if (!this.minimap || !this.state) return;
    var w = this.scale.width || 390, x0 = w - 66, y0 = 10, mw = 54, mh = 72, cw = mw / W, ch = mh / H;
    this.minimap.clear(); this.minimap.fillStyle(0x07151a, .76); this.minimap.fillRoundedRect(x0, y0, mw, mh, 6);
    for (var i = 0; i < N; i++) {
      var type = this.state.t[i], color = type === T.WATER ? 0x1d6275 : type === T.HILL ? 0x806f56 : type === T.ROAD ? 0x536b72 : type === T.HOME ? 0x56ae84 : type === T.SHOP ? 0x4da2c4 : type === T.POWER ? 0xc96c5d : type === T.PARK ? 0x4b8b56 : 0x2a594e;
      this.minimap.fillStyle(color, 1); this.minimap.fillRect(x0 + (i % W) * cw, y0 + ((i / W) | 0) * ch, Math.ceil(cw), Math.ceil(ch));
    }
    this.minimap.lineStyle(1, 0x8ce6b3, .7); this.minimap.strokeRect(x0, y0, mw, mh);
  };

  CityScene.prototype.updateDynamic = function (time) {
    var g = this.dynamic; g.clear();
    var i, key, x, y, px, py, nx, ny, p1x, p1y, p2x, p2y;
    for (i = 0; i < this.waterKeys.length; i++) {
      key = this.waterKeys[i]; x = key % W; y = (key / W) | 0; px = this.originX + (x - y) * this.tileW / 2; py = this.originY + (x + y) * this.tileH / 2;
      var wave = Math.sin(this.waterClock * 2 + key * .8) * .45; g.lineStyle(.8, 0x8be7dc, .42); g.lineBetween(px - 4, py + wave, px + 4, py + wave);
    }
    for (i = 0; i < this.parkKeys.length; i++) {
      key = this.parkKeys[i]; x = key % W; y = (key / W) | 0; px = this.originX + (x - y) * this.tileW / 2; py = this.originY + (x + y) * this.tileH / 2 - 3;
      var sway = Math.sin(time * .0025 + key) * .8; g.lineStyle(1, 0xb9e28a, .55); g.lineBetween(px - 4, py + 1, px - 4 + sway, py - 3); g.lineBetween(px + 4, py, px + 4 - sway, py - 4);
    }
    for (i = 0; i < this.roadEdges.length; i++) {
      var edge = this.roadEdges[i], aKey = edge[0], bKey = edge[1], ax = aKey % W, ay = (aKey / W) | 0, bx = bKey % W, by = (bKey / W) | 0;
      p1x = this.originX + (ax - ay) * this.tileW / 2; p1y = this.originY + (ax + ay) * this.tileH / 2 - 2;
      p2x = this.originX + (bx - by) * this.tileW / 2; p2y = this.originY + (bx + by) * this.tileH / 2 - 2;
      var loadRatio = Math.min(1.5, (this.state.load[aKey] + this.state.load[bKey]) / 2 / 26), roadColor = loadRatio >= 1 ? 0xf17d6b : loadRatio >= .62 ? 0xffc86d : 0x75e2df;
      if (loadRatio > .08) { g.lineStyle(loadRatio >= 1 ? 1.8 : 1.3, roadColor, .45 + Math.min(.35, loadRatio * .25)); g.lineBetween(p1x, p1y, p2x, p2y); }
      if (this.state.pow[aKey] && this.state.pow[bKey]) { g.lineStyle(1.1, 0x83e8df, .26 + Math.sin(time * .004 + aKey) * .08); g.lineBetween(p1x, p1y - 1, p2x, p2y - 1); }
    }
    for (i = 0; i < this.litKeys.length; i++) {
      key = this.litKeys[i]; x = key % W; y = (key / W) | 0; px = this.originX + (x - y) * this.tileW / 2; py = this.originY + (x + y) * this.tileH / 2 - this.tileH * .62;
      var glow = .35 + Math.sin(time * .003 + key * .7) * .12 + Math.min(.18, this.state.pop / 30000); g.fillStyle(0xffd47b, glow); g.fillCircle(px, py, 1.6 + this.artScale * .8);
    }
    for (i = 0; i < this.trafficPool.length; i++) {
      var dot = this.trafficPool[i];
      if (!this.roadEdges.length) { dot.setVisible(false); continue; }
      var edgePos = (time * .00045 * this.speed + i * .77) % this.roadEdges.length, edgeIndex = Math.floor(edgePos), mix = edgePos - edgeIndex, trafficEdge = this.roadEdges[edgeIndex], fromKey = i % 2 ? trafficEdge[1] : trafficEdge[0], toKey = i % 2 ? trafficEdge[0] : trafficEdge[1];
      var fromX = fromKey % W, fromY = (fromKey / W) | 0, toX = toKey % W, toY = (toKey / W) | 0;
      p1x = this.originX + (fromX - fromY) * this.tileW / 2; p1y = this.originY + (fromX + fromY) * this.tileH / 2 - 3;
      p2x = this.originX + (toX - toY) * this.tileW / 2; p2y = this.originY + (toX + toY) * this.tileH / 2 - 3;
      var trafficLoad = Math.min(1.5, (this.state.load[fromKey] + this.state.load[toKey]) / 2 / 26), trafficColor = trafficLoad >= 1 ? 0xff866e : trafficLoad >= .62 ? 0xffd47b : i % 3 ? 0xffd47b : 0x75e2df;
      dot.setPosition(Phaser.Math.Linear(p1x, p2x, mix), Phaser.Math.Linear(p1y, p2y, mix)).setVisible(true).setFillStyle(trafficColor, .95);
    }
    this.selection.clear();
    var cellKey = this.cursor.y * W + this.cursor.x;
    if (cellKey !== this.previewKey || this.previewFunds !== this.state.funds || this.previewTool !== this.selectedTool) {
      this.preview = Sim.canPlace(this.state, this.cursor.x, this.cursor.y, this.selectedTool); this.previewKey = cellKey; this.previewFunds = this.state.funds; this.previewTool = this.selectedTool;
    }
    var preview = this.preview, valid = preview.valid, cpX = this.originX + (this.cursor.x - this.cursor.y) * this.tileW / 2, cpY = this.originY + (this.cursor.x + this.cursor.y) * this.tileH / 2;
    this.diamond(this.selection, cpX, cpY, this.selectedToolColor, valid ? .12 : .25, valid ? 0xb9f4d5 : preview.reason === 'insufficient-funds' ? 0xffc86d : 0xef7772);
    this.selection.lineStyle(1.2, valid ? 0xc7f7dd : preview.reason === 'insufficient-funds' ? 0xffc86d : 0xef7772, .8); this.selection.beginPath(); this.selection.moveTo(cpX, cpY - this.tileH / 2); this.selection.lineTo(cpX + this.tileW / 2, cpY); this.selection.lineTo(cpX, cpY + this.tileH / 2); this.selection.lineTo(cpX - this.tileW / 2, cpY); this.selection.closePath(); this.selection.strokePath();
    this.ghost.setFrame(this.toolFrame(this.selectedTool)).setPosition(cpX, cpY - this.tileH * .2).setScale(this.artScale * .98).setAlpha(valid ? .28 + Math.sin(time * .006) * .05 : .12).setTint(valid ? 0xffffff : preview.reason === 'insufficient-funds' ? 0xffc86d : 0xef7777).setVisible(true);
    if (cellKey !== this.brushKey || preview.reason !== this.brushReason) {
      this.brushKey = cellKey; this.brushReason = preview.reason;
      var hint = valid ? this.selectedTool.name.toUpperCase() + ' $' + this.selectedTool.cost + ' · ready to place' : this.selectedTool.name.toUpperCase() + ' · ' + (preview.reason === 'empty' ? 'nothing to raze' : preview.reason === 'blocked-terrain' ? 'blocked terrain' : preview.reason === 'insufficient-funds' ? 'need more funds' : preview.reason === 'occupied' ? 'tile occupied' : preview.reason === 'core' ? 'keep one city piece' : 'already placed');
      byId('brushStatus').textContent = hint; byId('brushStatus').className = valid ? 'good' : preview.reason === 'insufficient-funds' ? 'warn' : 'bad';
    }
    this.updateBuildEffects(time);
    this.updateMilestoneFx(time);
    this.drawPlanner(time);
  };
  CityScene.prototype.drawPlanner = function (time) {
    var plannerX = this.originX + (this.cursor.x - this.cursor.y) * this.tileW / 2, plannerY = this.originY + (this.cursor.x + this.cursor.y) * this.tileH / 2, state = kit.juice.enabled && this.celebrateUntil > time ? 'celebrate' : Math.floor(time / 500) % 2 ? 'walk' : 'idle';
    this.planner.setFrame('planner-' + state).setPosition(plannerX, plannerY - this.tileH * .25).setScale(this.artScale * 1.1).setVisible(true);
  };
  CityScene.prototype.toolFrame = function (tool) {
    if (tool.id === 'home') return 'home-0';
    if (tool.id === 'shop') return 'shop-0';
    if (tool.id === 'power') return 'power-0';
    if (tool.id === 'park') return 'park';
    if (tool.id === 'road') return 'road';
    return 'grass';
  };
  CityScene.prototype.queueBuildFx = function (x, y) {
    if (!kit.juice.enabled) return;
    if (this.buildEffects.length >= 24) this.buildEffects.shift();
    this.buildEffects.push({ x: x, y: y, start: performance.now(), color: this.selectedTool.id === 'raze' ? 0xf17d6b : this.selectedTool.id === 'park' ? 0xa7df66 : this.selectedTool.id === 'road' ? 0x8ca8aa : 0xffd47b });
  };
  CityScene.prototype.queueGrowthFx = function (key) {
    if (!kit.juice.enabled) return;
    if (this.buildEffects.length >= 24) this.buildEffects.shift();
    this.buildEffects.push({ x: key % W, y: (key / W) | 0, start: performance.now(), color: 0xffd47b });
  };
  CityScene.prototype.updateBuildEffects = function (time) {
    var now = performance.now();
    var index = 0;
    for (var i = this.buildEffects.length - 1; i >= 0; i--) {
      var effect = this.buildEffects[i], age = now - effect.start;
      if (age > 560) { this.buildEffects.splice(i, 1); continue; }
      var sprite = this.fxPool[index++]; if (!sprite) break;
      var effectX = this.originX + (effect.x - effect.y) * this.tileW / 2, effectY = this.originY + (effect.x + effect.y) * this.tileH / 2, phase = age < 120 ? age / 120 : age < 260 ? 1 : 1 - (age - 260) / 300;
      sprite.setPosition(effectX, effectY - this.tileH * .25 - Math.max(0, age - 260) * .018).setFillStyle(effect.color, Math.max(0, Math.min(1, phase))).setScale(age < 120 ? .35 + age / 120 * .85 : age < 260 ? 1.15 : .8).setVisible(true);
    }
    while (index < this.fxPool.length) this.fxPool[index++].setVisible(false);
  };
  CityScene.prototype.updateMilestoneFx = function (time) {
    if (!kit.juice.enabled) { this.milestoneQueue.length = 0; this.milestoneFx = null; return; }
    if (!this.milestoneFx && this.milestoneQueue.length) {
      var next = this.milestoneQueue.shift();
      this.milestoneFx = { milestone: next.milestone, start: time, key: this.state.metrics && this.state.metrics.focusKey >= 0 ? this.state.metrics.focusKey : 8 * W + 10, burst: false };
      this.celebrateUntil = time + 1550; kit.juice.shake(2.1, 160); kit.juice.hitStop(62);
      toast(next.milestone.label + ' reached. ' + next.milestone.detail, 'good'); sfx('milestone', { volume: .72, rate: 1 + next.index * .025 });
    }
    if (!this.milestoneFx) return;
    var age = time - this.milestoneFx.start, key = this.milestoneFx.key, x = key % W, y = (key / W) | 0, milestoneX = this.originX + (x - y) * this.tileW / 2, milestoneY = this.originY + (x + y) * this.tileH / 2, ring = 5 + Math.min(11, age * .018), alpha = age < 380 ? .72 - age / 800 : Math.max(0, 1 - age / 1550);
    this.dynamic.lineStyle(1.8, 0xffd47b, alpha); this.dynamic.strokeCircle(milestoneX, milestoneY - this.tileH * .5, ring, 16);
    if (age > 150 && age < 260 && !this.milestoneFx.burst) { this.milestoneFx.burst = true; this.milestoneParticles.explode(16, milestoneX, milestoneY - this.tileH * .85); }
    if (age > 1550) this.milestoneFx = null;
  };

  CityScene.prototype.updateHud = function () {
    if (!this.state) return;
    var pop = this.state.pop, nextIndex = 0;
    while (nextIndex < Sim.MILESTONES.length && profile.milestones.indexOf(Sim.MILESTONES[nextIndex].id) >= 0) nextIndex++;
    var next = Sim.MILESTONES[nextIndex] || Sim.MILESTONES[Sim.MILESTONES.length - 1];
    var pct = nextIndex >= Sim.MILESTONES.length ? 100 : Sim.milestoneProgress(this.state, next) * 100;
    byId('populationValue').textContent = pop.toLocaleString('en-US'); byId('fundsValue').textContent = money(this.state.funds); byId('monthValue').textContent = String(this.state.month).padStart(2, '0');
    byId('fundsValue').className = this.state.funds < 150 ? 'bad' : this.state.funds < 500 ? 'warn' : 'good';
    var flow = this.state.broke ? 'strained' : this.state.load.some(function (n) { return n > 26; }) ? 'jammed' : 'steady';
    byId('flowValue').textContent = flow; byId('flowValue').className = flow === 'jammed' || flow === 'strained' ? 'warn' : 'good';
    byId('goalLabel').textContent = nextIndex >= Sim.MILESTONES.length ? 'Flagship city complete' : 'Next: ' + next.label + ' / ' + next.pop.toLocaleString('en-US'); byId('goalFill').style.width = pct + '%'; byId('phaseLabel').textContent = Math.min(nextIndex + 1, Sim.MILESTONES.length) + ' / ' + Sim.MILESTONES.length;
  };
  CityScene.prototype.checkMilestones = function (time) {
    var changed = false;
    for (var i = 0; i < Sim.MILESTONES.length; i++) {
      var m = Sim.MILESTONES[i];
      if (Sim.milestoneComplete(this.state, m) && profile.milestones.indexOf(m.id) < 0) { profile.milestones.push(m.id); this.milestoneQueue.push({ milestone: m, index: i }); changed = true; }
    }
    if (changed) { saveSnapshot(); if (this.state.pop >= 1200 && audioStarted) kit.audio.music('musicRush', 900); }
  };

  CityScene.prototype.update = function (time, delta) {
    if (this.stateDirty) this.renderAll();
    var juice = kit.juice.frame(); this.world.setPosition(juice.dx, juice.dy);
    if (!this.running || kit.paused) { if (!juice.frozen) this.updateDynamic(time); return; }
    if (juice.frozen) { this.updateDynamic(time); return; }
    var frameDelta = Math.min(50, Math.max(0, Number(delta) || 0));
    this.waterClock += frameDelta * .001; this.tickClock += frameDelta * this.speed;
    while (this.tickClock >= Sim.TICK_MS) {
      this.tickClock -= Sim.TICK_MS; var tickResult = Sim.tick(this.state); for (var growth = 0; growth < tickResult.grew.length; growth++) this.queueGrowthFx(tickResult.grew[growth]); this.stateDirty = true; this.checkMilestones(time); this.updateHud(); saveSnapshot(); sfx('scroll', { volume: .15, rate: .82 + (this.state.month % 5) * .04 });
    }
    this.updateDynamic(time);
  };

  kit.loader.show('Blockborough');
  var sharedLoader = document.body.lastElementChild;
  if (sharedLoader) {
    sharedLoader.style.background = '#07121b'; sharedLoader.style.color = '#ebf4ee'; sharedLoader.style.fontFamily = 'ui-rounded,system-ui,sans-serif';
    if (sharedLoader.firstElementChild) { sharedLoader.firstElementChild.textContent = 'BLOCKBOROUGH'; sharedLoader.firstElementChild.style.letterSpacing = '.16em'; sharedLoader.firstElementChild.style.textTransform = 'uppercase'; }
    if (sharedLoader.firstElementChild && sharedLoader.firstElementChild.nextElementSibling) {
      sharedLoader.firstElementChild.nextElementSibling.style.background = '#193239';
      if (sharedLoader.firstElementChild.nextElementSibling.firstElementChild) sharedLoader.firstElementChild.nextElementSibling.firstElementChild.style.background = 'linear-gradient(90deg,#8ce6b3,#65d5df)';
    }
  }
  function syncHiDpi(game) {
    var stage = byId('stage');
    var cssW = Math.max(1, Math.floor((stage && stage.clientWidth) || document.documentElement.clientWidth || window.innerWidth || 1));
    var cssH = Math.max(1, Math.floor((stage && stage.clientHeight) || document.documentElement.clientHeight || window.innerHeight || 1));
    GGKit.hiDpi.resize(game, cssW, cssH);
  }

  kit.loader.progress(.08);
  var game = new Phaser.Game({ type: Phaser.AUTO, parent: 'stage', width: 390, height: 390, backgroundColor: '#0a1a21', render: Object.assign({}, GGKit.renderDefaults, { pixelArt: true, roundPixels: true }), scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: CityScene });
  syncHiDpi(game);
  window.addEventListener('resize', function () { syncHiDpi(game); });
  window.addEventListener('orientationchange', function () { syncHiDpi(game); });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) syncHiDpi(game);
  });
}());
