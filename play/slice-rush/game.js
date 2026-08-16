(function () {
  'use strict';

  var W = 390;
  var H = 844;
  var RETINA_FACTOR = GGKit.hiDpi.factor(W, H);
  var STEP = 1 / 60;
  var MAX_STEPS = 4;
  var SAVE_VERSION = 4;
  var MAX_PARTICLES = 96;
  var TAU = Math.PI * 2;
  var shell = document.getElementById('game-shell');
  var fallback = document.getElementById('game-fallback');
  var sceneRef = null;
  var phaserGame = null;
  var accumulator = 0;
  var lastFrame = 0;
  var screenMode = 'rush';
  var pendingMode = null;
  var pendingStage = null;
  var gestures = new Map();
  var audioStarted = false;
  var rng = 93271;

  var C = {
    deep: 0x10242a, ink: 0x17343b, ink2: 0x234c50, cream: 0xfff1d2,
    paper: 0xfff8e8, muted: 0x9db9b7, gold: 0xf6c969, coral: 0xee8069,
    mint: 0x7bd3ac, sky: 0x91c6e8, red: 0xe96b6e, white: 0xffffff,
    purple: 0xa993da, shadow: 0x0b171c, darkBar: 0x18343a
  };

  var TOPPINGS = [
    { id: 'sauce', label: 'sauce', color: 0xe96c57, glyph: '●' },
    { id: 'cheese', label: 'cheese', color: 0xf6c969, glyph: '◆' },
    { id: 'basil', label: 'basil', color: 0x7bd3ac, glyph: '✦' },
    { id: 'mushroom', label: 'mushroom', color: 0xb9a58c, glyph: '◒' },
    { id: 'pepper', label: 'pepper', color: 0xee8069, glyph: '✚' },
    { id: 'olive', label: 'olive', color: 0x82966a, glyph: '•' }
  ];
  var TOPPING_BY_ID = {};
  TOPPINGS.forEach(function (item) { TOPPING_BY_ID[item.id] = item; });

  var RECIPES = [
    { id: 'street-sun', name: 'Street Sun', toppings: ['sauce', 'cheese'], reward: 10, hue: 0xf6c969 },
    { id: 'red-cap', name: 'Red Cap', toppings: ['sauce', 'pepper'], reward: 11, hue: 0xee8069 },
    { id: 'green-fold', name: 'Green Fold', toppings: ['sauce', 'basil'], reward: 12, hue: 0x7bd3ac },
    { id: 'market-moon', name: 'Market Moon', toppings: ['sauce', 'cheese', 'basil'], reward: 14, hue: 0xa993da },
    { id: 'mushroom-swing', name: 'Mushroom Swing', toppings: ['sauce', 'cheese', 'mushroom'], reward: 15, hue: 0xb9a58c },
    { id: 'pepper-wake', name: 'Pepper Wake', toppings: ['sauce', 'cheese', 'pepper'], reward: 16, hue: 0xee8069 },
    { id: 'olive-arc', name: 'Olive Arc', toppings: ['sauce', 'basil', 'olive'], reward: 16, hue: 0x82966a },
    { id: 'four-corner', name: 'Four Corner', toppings: ['sauce', 'cheese', 'basil', 'pepper'], reward: 18, hue: 0x91c6e8 },
    { id: 'garden-turn', name: 'Garden Turn', toppings: ['sauce', 'basil', 'mushroom'], reward: 18, hue: 0x7bd3ac },
    { id: 'golden-olive', name: 'Golden Olive', toppings: ['sauce', 'cheese', 'olive'], reward: 19, hue: 0xf6c969 },
    { id: 'red-garden', name: 'Red Garden', toppings: ['sauce', 'pepper', 'basil'], reward: 19, hue: 0xee8069 },
    { id: 'dockside-fold', name: 'Dockside Fold', toppings: ['sauce', 'mushroom', 'olive'], reward: 20, hue: 0x91c6e8 },
    { id: 'plaza-star', name: 'Plaza Star', toppings: ['sauce', 'cheese', 'basil', 'olive'], reward: 22, hue: 0xa993da },
    { id: 'bright-bite', name: 'Bright Bite', toppings: ['sauce', 'cheese', 'pepper', 'olive'], reward: 22, hue: 0xf6c969 },
    { id: 'lantern-loop', name: 'Lantern Loop', toppings: ['sauce', 'mushroom', 'pepper'], reward: 21, hue: 0xee8069 },
    { id: 'seaside-green', name: 'Seaside Green', toppings: ['sauce', 'basil', 'pepper', 'olive'], reward: 23, hue: 0x7bd3ac },
    { id: 'pier-mushroom', name: 'Pier Mushroom', toppings: ['sauce', 'cheese', 'mushroom', 'olive'], reward: 24, hue: 0xb9a58c },
    { id: 'night-chef', name: 'Night Chef', toppings: ['sauce', 'cheese', 'basil', 'mushroom'], reward: 25, hue: 0xa993da },
    { id: 'neon-pepper', name: 'Neon Pepper', toppings: ['sauce', 'cheese', 'basil', 'pepper'], reward: 26, hue: 0xee8069 },
    { id: 'flagship-slice', name: 'Flagship Slice', toppings: ['sauce', 'cheese', 'mushroom', 'pepper'], reward: 28, hue: 0xf6c969 },
    { id: 'chef-table', name: 'Chef Table', toppings: ['sauce', 'basil', 'mushroom', 'olive'], reward: 28, hue: 0x7bd3ac },
    { id: 'gold-room', name: 'Gold Room', toppings: ['sauce', 'cheese', 'pepper', 'olive'], reward: 29, hue: 0xf6c969 },
    { id: 'skyline-fold', name: 'Skyline Fold', toppings: ['sauce', 'cheese', 'basil', 'mushroom', 'olive'], reward: 31, hue: 0x91c6e8 },
    { id: 'red-carpet', name: 'Red Carpet', toppings: ['sauce', 'cheese', 'basil', 'mushroom', 'pepper'], reward: 32, hue: 0xee8069 },
    { id: 'all-hands', name: 'All Hands', toppings: ['sauce', 'cheese', 'basil', 'pepper', 'olive'], reward: 33, hue: 0xa993da },
    { id: 'harbor-crown', name: 'Harbor Crown', toppings: ['sauce', 'cheese', 'mushroom', 'pepper', 'olive'], reward: 34, hue: 0x91c6e8 },
    { id: 'garden-crown', name: 'Garden Crown', toppings: ['sauce', 'basil', 'mushroom', 'pepper', 'olive'], reward: 35, hue: 0x7bd3ac },
    { id: 'five-point', name: 'Five Point', toppings: ['sauce', 'cheese', 'basil', 'mushroom', 'pepper'], reward: 36, hue: 0xf6c969 },
    { id: 'master-fold', name: 'Master Fold', toppings: ['sauce', 'cheese', 'basil', 'mushroom', 'pepper', 'olive'], reward: 40, hue: 0xa993da },
    { id: 'last-call', name: 'Last Call', toppings: ['sauce', 'cheese', 'basil', 'mushroom', 'pepper', 'olive'], reward: 45, hue: 0xffe6a0 }
  ];
  var RECIPE_BY_ID = {};
  RECIPES.forEach(function (recipe) { RECIPE_BY_ID[recipe.id] = recipe; });

  var VENUES = [
    { id: 'street-cart', name: 'Street Cart', short: 'CART', palette: [0x10242a, 0x1b4d4d, 0xf6c969], archetypes: ['skater', 'busker', 'walker'], music: 'musicCart', range: [0, 5], unlock: 0, investCosts: [22, 48, 92] },
    { id: 'corner-shop', name: 'Corner Shop', short: 'SHOP', palette: [0x1c263b, 0x493b63, 0xee8069], archetypes: ['barista', 'courier', 'nurse'], music: 'musicCorner', range: [4, 11], unlock: 4, investCosts: [70, 120, 190] },
    { id: 'plaza-kitchen', name: 'Plaza Kitchen', short: 'PLAZA', palette: [0x263d39, 0x4c6655, 0xf6c969], archetypes: ['teacher', 'maker', 'tourist'], music: 'musicPlaza', range: [10, 17], unlock: 10, investCosts: [150, 240, 360] },
    { id: 'seaside-pier', name: 'Seaside Pier', short: 'PIER', palette: [0x11304a, 0x2b6c7a, 0x91c6e8], archetypes: ['sailor', 'gull', 'surfer'], music: 'musicPier', range: [16, 23], unlock: 18, investCosts: [250, 390, 580] },
    { id: 'flagship-finale', name: 'Flagship Finale', short: 'FINAL', palette: [0x241a36, 0x64405e, 0xa993da], archetypes: ['critic', 'chef', 'founder'], music: 'musicFlagship', range: [22, 29], unlock: 30, investCosts: [420, 620, 900] }
  ];

  var UPGRADES = [
    { id: 'blade', name: 'Bench polish', note: 'hands-on stretch +18%', cost: 18, icon: '✦' },
    { id: 'prep-hand', name: 'Prep hand', note: 'staff stretches mastered dough', cost: 34, icon: '✋' },
    { id: 'proof', name: 'Quick proof', note: 'patience +1.5s', cost: 54, icon: '◌' },
    { id: 'hot-stone', name: 'Hot stone', note: 'hand bakes toppings faster', cost: 78, icon: '◉' },
    { id: 'oven-runner', name: 'Oven runner', note: 'staff seasons mastered tickets', cost: 112, icon: '→' },
    { id: 'second-hand', name: 'Second prep hand', note: 'queue opens one extra slot', cost: 154, icon: '✋' },
    { id: 'counter-runner', name: 'Counter runner', note: 'staff slides mastered pies', cost: 204, icon: '➜' },
    { id: 'order-rail', name: 'Order rail', note: 'one more customer in line', cost: 266, icon: '≡' },
    { id: 'bell', name: 'Bell signal', note: 'danger telegraph lasts longer', cost: 342, icon: '♢' },
    { id: 'roomy-tables', name: 'Roomy tables', note: 'venue decor reaches level 3', cost: 434, icon: '▦' },
    { id: 'captain', name: 'Shift captain', note: 'rush bonus +25%', cost: 548, icon: '★' },
    { id: 'full-service', name: 'Full service', note: 'automation floor complete', cost: 688, icon: '∞' }
  ];

  var AUDIO = {
    musicCart: '/play/slice-rush/assets/music-cart.mp3', musicCorner: '/play/slice-rush/assets/music-corner.mp3',
    musicPlaza: '/play/slice-rush/assets/music-plaza.mp3', musicPier: '/play/slice-rush/assets/music-pier.mp3',
    musicFlagship: '/play/slice-rush/assets/music-flagship.mp3', tap: '/play/slice-rush/assets/sfx-tap.mp3',
    dough: '/play/slice-rush/assets/sfx-dough.mp3', topping: '/play/slice-rush/assets/sfx-topping.mp3',
    reject: '/play/slice-rush/assets/sfx-reject.mp3', serve: '/play/slice-rush/assets/sfx-serve.mp3',
    upgrade: '/play/slice-rush/assets/sfx-upgrade.mp3', unlock: '/play/slice-rush/assets/sfx-unlock.mp3',
    walkout: '/play/slice-rush/assets/sfx-walkout.mp3', reopen: '/play/slice-rush/assets/sfx-reopen.mp3'
  };
  var SFX = ['tap', 'dough', 'topping', 'reject', 'serve', 'upgrade', 'unlock', 'walkout', 'reopen'];

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function finite(value, fallback) { return typeof value === 'number' && isFinite(value) ? value : fallback; }
  function intValue(value, fallback, min, max) { return Math.floor(clamp(finite(value, fallback), min, max)); }
  function choose(list) { rng = (rng * 1664525 + 1013904223) >>> 0; return list[Math.floor((rng / 4294967296) * list.length)] || list[0]; }
  function hasUpgrade(index) { return profile && profile.upgrades >= index + 1; }
  function hex(value) { return Phaser.Display.Color.IntegerToColor(value).rgba; }
  function contains(x, y, rect, pad) { var p = pad || 0; return x >= rect.x - p && x <= rect.x + rect.w + p && y >= rect.y - p && y <= rect.y + rect.h + p; }
  function setTextIfChanged(object, value) { var next = String(value); if (object.text !== next) object.setText(next); }
  function setColorIfChanged(object, value) { if (object._srColor !== value) { object.setColor(hex(value)); object._srColor = value; } }
  function format(value) { return Math.floor(Math.max(0, value)).toLocaleString('en-US'); }

  function defaultProfile() {
    return {
      version: SAVE_VERSION, coins: 0, score: 0, best: 0, totalServed: 0, venue: 0, highestVenue: 0,
      venueInvest: [0, 0, 0, 0, 0], upgrades: 0, recipeMask: RECIPES.map(function (_, i) { return i < 3; }),
      mastery: { dough: false, toppings: false, serve: false }, reopenings: 0, rushWins: [0, 0, 0, 0, 0], lastSeen: Date.now(), clockFlag: false
    };
  }
  function validProfile(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value) && value.version === SAVE_VERSION &&
      Number.isFinite(value.coins) && value.coins >= 0 && value.coins <= 99999999 && Number.isFinite(value.score) && value.score >= 0 && value.score <= 999999999 &&
      Number.isFinite(value.best) && value.best >= 0 && value.best <= 999999999 && Number.isFinite(value.totalServed) && value.totalServed >= 0 && value.totalServed <= 9999999 &&
      Number.isInteger(value.venue) && value.venue >= 0 && value.venue < VENUES.length && Number.isInteger(value.highestVenue) && value.highestVenue >= 0 && value.highestVenue < VENUES.length &&
      Array.isArray(value.venueInvest) && value.venueInvest.length === VENUES.length && value.venueInvest.every(function (v) { return Number.isInteger(v) && v >= 0 && v <= 3; }) &&
      Number.isInteger(value.upgrades) && value.upgrades >= 0 && value.upgrades <= UPGRADES.length && Array.isArray(value.recipeMask) && value.recipeMask.length === RECIPES.length &&
      value.recipeMask.every(function (v) { return typeof v === 'boolean'; }) && value.mastery && typeof value.mastery.dough === 'boolean' && typeof value.mastery.toppings === 'boolean' && typeof value.mastery.serve === 'boolean' &&
      Number.isInteger(value.reopenings) && value.reopenings >= 0 && value.reopenings <= 9999 && Array.isArray(value.rushWins) && value.rushWins.length === VENUES.length && value.rushWins.every(function (v) { return Number.isInteger(v) && v >= 0 && v <= 9999; }) &&
      Number.isFinite(value.lastSeen) && value.lastSeen >= 0 && value.lastSeen <= Date.now() + 86400000;
  }
  function normalizeProfile(raw) {
    var base = defaultProfile();
    if (!validProfile(raw)) return base;
    base.coins = intValue(raw.coins, 0, 0, 99999999);
    base.score = intValue(raw.score, 0, 0, 999999999);
    base.best = intValue(raw.best, 0, 0, 999999999);
    base.totalServed = intValue(raw.totalServed, 0, 0, 9999999);
    base.venue = intValue(raw.venue, 0, 0, VENUES.length - 1);
    base.highestVenue = intValue(raw.highestVenue, 0, 0, VENUES.length - 1);
    base.venueInvest = raw.venueInvest.map(function (v) { return intValue(v, 0, 0, 3); });
    base.upgrades = intValue(raw.upgrades, 0, 0, UPGRADES.length);
    base.recipeMask = raw.recipeMask.map(function (v) { return !!v; });
    base.mastery = { dough: !!raw.mastery.dough, toppings: !!raw.mastery.toppings, serve: !!raw.mastery.serve };
    base.reopenings = intValue(raw.reopenings, 0, 0, 9999);
    base.rushWins = raw.rushWins.map(function (v) { return intValue(v, 0, 0, 9999); });
    base.lastSeen = raw.lastSeen;
    base.clockFlag = !!raw.clockFlag;
    return base;
  }

  var kit = GGKit.create({
    slug: 'slice-rush', orientation: 'portrait', validateSave: validProfile,
    onPause: function () { gestures.clear(); accumulator = 0; lastFrame = 0; if (sceneRef) sceneRef.simPaused = true; },
    onResume: function () { if (sceneRef) sceneRef.simPaused = false; },
    onRestart: function () { if (sceneRef) sceneRef.resetRush(false); }
  });
  kit.audio.register(AUDIO);
  kit.registerPWA();
  var profile = normalizeProfile(kit.save.get(null));
  var offlineReport = applyOffline();
  var debugState = { mode: 'boot', progress: 0, score: profile.score, health: 100, stage: VENUES[profile.venue].id, currentStage: VENUES[profile.venue].id, coins: profile.coins, combo: 0, offline: offlineReport, clockFlag: profile.clockFlag, lastAction: '' };

  function applyOffline() {
    var now = Date.now();
    var elapsed = Math.max(0, (now - finite(profile.lastSeen, now)) / 1000);
    var tampered = now + 120000 < profile.lastSeen;
    if (tampered) elapsed = 0;
    elapsed = Math.min(elapsed, 12 * 60 * 60);
    var venue = VENUES[profile.venue] || VENUES[0];
    var rate = .6 + profile.venueInvest[profile.venue] * .7 + profile.upgrades * .08 + profile.reopenings * .12;
    var payout = tampered ? 0 : Math.floor(elapsed * rate);
    profile.coins = intValue(profile.coins + payout, 0, 0, 99999999);
    profile.lastSeen = now;
    profile.clockFlag = tampered;
    kit.save.set(profile);
    return { seconds: Math.floor(elapsed), coins: payout, rate: rate, venue: venue.id, tampered: tampered };
  }
  function saveProfile() { profile.lastSeen = Date.now(); kit.save.set(profile); }
  window.addEventListener('beforeunload', saveProfile);

  window.__sr = {
    state: debugState,
    forceMode: function (mode) { pendingMode = String(mode || 'rush'); if (sceneRef) sceneRef.setMode(pendingMode); },
    forceStage: function (stage) { pendingStage = stage; if (sceneRef) sceneRef.setStage(stage); },
    forceStretch: function () { if (sceneRef) sceneRef.tapDough(); },
    forceTopping: function (topping, orderIndex) { if (sceneRef) sceneRef.forceTopping(topping, orderIndex); },
    forceServe: function () { if (sceneRef) sceneRef.serveFirst(true); }
  };

  function beginAudio() {
    if (!audioStarted) { audioStarted = true; kit.audio.preload(SFX); }
    kit.audio.music(VENUES[profile.venue].music, 450);
  }
  function sfx(name) { if (audioStarted) kit.audio.sfx(name); }

  function createText(scene, x, y, value, size, color, originX, originY) {
    var object = scene.add.text(x, y, value, { fontFamily: 'Arial, sans-serif', fontSize: size + 'px', fontStyle: 'bold', color: hex(color), resolution: RETINA_FACTOR });
    object.setOrigin(originX == null ? 0 : originX, originY == null ? .5 : originY);
    object.setDepth(80);
    object._srColor = color;
    return object;
  }

  function SliceRushScene() { Phaser.Scene.call(this, { key: 'SliceRushScene' }); }
  SliceRushScene.prototype = Object.create(Phaser.Scene.prototype);
  SliceRushScene.prototype.constructor = SliceRushScene;

  SliceRushScene.prototype.create = function () {
    this.cameras.main.setZoom(RETINA_FACTOR); this.cameras.main.centerOn(W / 2, H / 2);
    sceneRef = this;
    this.simPaused = false;
    this.running = true;
    this.activeVenue = profile.venue;
    this.screen = 'rush';
    this.run = null;
    this.particles = [];
    this.buildVisuals();
    this.bindWindowInput();
    this.setStage(profile.venue);
    this.resetRush(false);
    if (pendingMode) this.setMode(pendingMode);
    if (pendingStage != null) this.setStage(pendingStage);
    kit.loader.progress(1);
    kit.loader.hide();
    fallback.hidden = true;
    this.syncDebug();
  };

  SliceRushScene.prototype.buildVisuals = function () {
    var self = this;
    this.backdrop = this.add.graphics().setDepth(0);
    this.world = this.add.graphics().setDepth(20);
    this.fx = this.add.graphics().setDepth(70);
    this.menu = this.add.graphics().setDepth(60);
    var spark = this.make.graphics({ x: 0, y: 0, add: false });
    spark.fillStyle(C.paper, 1); spark.fillCircle(4, 4, 4); spark.generateTexture('sr-spark', 8, 8); spark.destroy();
    this.impactParticles = this.add.particles(0, 0, 'sr-spark', { lifespan: 420, speed: { min: 28, max: 86 }, scale: { start: .8, end: 0 }, alpha: { start: .9, end: 0 }, gravityY: 80, emitting: false, quantity: 0, blendMode: Phaser.BlendModes.ADD }).setDepth(72);
    this.rewardParticles = this.add.particles(0, 0, 'sr-spark', { lifespan: 760, speed: { min: 40, max: 130 }, scale: { start: 1.2, end: 0 }, alpha: { start: 1, end: 0 }, gravityY: 65, emitting: false, quantity: 0, blendMode: Phaser.BlendModes.ADD }).setDepth(73);

    this.hudVenue = createText(this, 16, 22, 'STREET CART', 16, C.cream);
    this.hudStage = createText(this, 16, 48, 'OPEN 01', 14, C.muted);
    this.hudCoins = createText(this, 232, 22, '0', 19, C.gold, 1);
    this.hudScore = createText(this, 330, 22, '0', 19, C.paper, 1);
    this.hudProgress = createText(this, 232, 48, '0 / 5', 14, C.muted, 1);
    this.hudCombo = createText(this, 330, 48, '', 14, C.mint, 1);
    this.hudPause = createText(this, 370, 22, 'Ⅱ', 21, C.cream, 1);
    this.hudMenu = createText(this, 370, 48, '⌂', 20, C.gold, 1);
    this.queueLabel = createText(this, 14, 83, 'QUEUE', 14, C.muted);
    this.coach = createText(this, 195, 83, '', 14, C.muted, .5);
    this.notice = createText(this, 376, 83, '', 14, C.gold, 1);
    this.stationLabel = createText(this, 28, 298, 'STRETCH', 14, C.cream);
    this.stationStep = createText(this, 178, 298, '0%', 14, C.mint, 1);
    this.trayLabel = createText(this, 28, 560, 'TOPPINGS', 14, C.muted);
    this.counterLabel = createText(this, 30, 654, 'COUNTER', 14, C.cream);
    this.counterHint = createText(this, 360, 654, 'SLIDE READY PIE', 14, C.muted, 1);
    this.toppingGlyphs = TOPPINGS.map(function (item, index) { return createText(self, 43 + index * 60, 604, item.glyph, 17, C.deep, .5); });
    this.upgradeChip = createText(this, 18, 785, '↗ 0 / 12', 16, C.gold);
    this.campaignChip = createText(this, 372, 785, 'MAP', 14, C.muted, 1);

    this.cards = [];
    this.cardBgs = [];
    this.cardAvatars = [];
    this.cardBars = [];
    this.cardNames = [];
    this.cardRecipes = [];
    this.cardToppings = [];
    for (var i = 0; i < 3; i += 1) {
      var x = 10 + i * 125;
      var bg = this.add.graphics().setDepth(35);
      var avatar = this.add.graphics().setDepth(36);
      var bar = this.add.graphics().setDepth(37);
      this.cardBgs.push(bg); this.cardAvatars.push(avatar); this.cardBars.push(bar);
      this.cardNames.push(createText(this, x + 54, 119, '', 14, C.cream));
      this.cardRecipes.push(createText(this, x + 12, 149, '', 14, C.paper));
      this.cardToppings.push(createText(this, x + 12, 178, '', 16, C.muted));
      this.cards.push({ x: x, y: 98, w: 118, h: 154 });
    }
    this.liveTexts = [this.hudVenue, this.hudStage, this.hudCoins, this.hudScore, this.hudProgress, this.hudCombo, this.hudPause, this.hudMenu, this.queueLabel, this.coach, this.notice, this.stationLabel, this.stationStep, this.trayLabel, this.counterLabel, this.counterHint, this.upgradeChip, this.campaignChip].concat(this.cardNames, this.cardRecipes, this.cardToppings);
    this.menuTitle = createText(this, 195, 136, '', 28, C.cream, .5);
    this.menuSub = createText(this, 195, 174, '', 15, C.muted, .5);
    this.menuBody = createText(this, 195, 212, '', 15, C.paper, .5);
    this.menuRows = [];
    for (var row = 0; row < 12; row += 1) this.menuRows.push(createText(this, 34, 285 + row * 37, '', 15, C.paper));
    this.menuButton = createText(this, 195, 722, '', 16, C.deep, .5);
    this.menuBack = createText(this, 195, 778, '', 15, C.muted, .5);
    this.menuTitle.setVisible(false); this.menuSub.setVisible(false); this.menuBody.setVisible(false); this.menuButton.setVisible(false); this.menuBack.setVisible(false);
    this.menuRows.forEach(function (row) { row.setVisible(false); });
    this.refreshBackdrop();
    this.setMenuVisible(false);
  };

  SliceRushScene.prototype.setMenuVisible = function (visible) {
    var list = [this.menuTitle, this.menuSub, this.menuBody, this.menuButton, this.menuBack].concat(this.menuRows);
    list.forEach(function (object) { object.setVisible(visible); });
  };

  SliceRushScene.prototype.bindWindowInput = function () {
    var self = this;
    this.pointerDown = function (event) { event.preventDefault(); beginAudio(); self.handlePointerDown(event); };
    this.pointerMove = function (event) { event.preventDefault(); self.handlePointerMove(event); };
    this.pointerUp = function (event) { event.preventDefault(); self.handlePointerUp(event); };
    this.pointerCancel = function (event) { event.preventDefault(); gestures.delete(event.pointerId); };
    window.addEventListener('pointerdown', this.pointerDown, { passive: false });
    window.addEventListener('pointermove', this.pointerMove, { passive: false });
    window.addEventListener('pointerup', this.pointerUp, { passive: false });
    window.addEventListener('pointercancel', this.pointerCancel, { passive: false });
    this.keyDown = function (event) { self.handleKeyDown(event); };
    window.addEventListener('keydown', this.keyDown, { passive: false });
  };

  SliceRushScene.prototype.worldPoint = function (event) {
    var canvas = this.game.canvas;
    var rect = canvas.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) * W / Math.max(1, rect.width), 0, W), y: clamp((event.clientY - rect.top) * H / Math.max(1, rect.height), 0, H) };
  };

  SliceRushScene.prototype.handlePointerDown = function (event) {
    var p = this.worldPoint(event);
    if (kit.paused) { this.handlePausedTap(p); return; }
    var kitPointer = kit.input.pointers.get(event.pointerId);
    if (!kitPointer) { kitPointer = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, downAt: performance.now(), zone: null }; kit.input.pointers.set(event.pointerId, kitPointer); }
    kitPointer.zone = 'slice-rush';
    gestures.set(event.pointerId, { x: p.x, y: p.y, kind: 'tap', topping: null, order: null });
    if (this.screen !== 'rush' && this.screen !== 'challenge') { this.handleMenuTap(p); return; }
    if (contains(p.x, p.y, { x: 346, y: 8, w: 36, h: 48 }, 6)) { kit.pause('manual'); return; }
    if (contains(p.x, p.y, { x: 334, y: 35, w: 42, h: 34 }, 6)) { this.openCampaign(); return; }
    if (contains(p.x, p.y, { x: 10, y: 760, w: 150, h: 52 }, 8)) { this.openUpgrades(); return; }
    if (contains(p.x, p.y, { x: 230, y: 292, w: 150, h: 190 }, 8)) { this.selectOrder(this.orderAt(p.x, p.y)); return; }
    var orderIndex = this.orderAt(p.x, p.y);
    if (orderIndex >= 0) {
      var order = this.run.customers[orderIndex];
      if (order && order.ready) { gestures.get(event.pointerId).kind = 'plate'; gestures.get(event.pointerId).order = order; }
      else this.selectOrder(orderIndex);
      return;
    }
    if (contains(p.x, p.y, { x: 24, y: 316, w: 170, h: 180 }, 8)) { gestures.get(event.pointerId).kind = 'dough'; this.tapDough(); return; }
    var toppingIndex = this.toppingAt(p.x, p.y);
    if (toppingIndex >= 0) { gestures.get(event.pointerId).kind = 'topping'; gestures.get(event.pointerId).topping = TOPPINGS[toppingIndex].id; return; }
  };

  SliceRushScene.prototype.handlePointerMove = function (event) {
    var gesture = gestures.get(event.pointerId);
    if (!gesture) return;
    var p = this.worldPoint(event); gesture.x = p.x; gesture.y = p.y;
  };

  SliceRushScene.prototype.handlePointerUp = function (event) {
    var gesture = gestures.get(event.pointerId);
    if (!gesture) return;
    var p = this.worldPoint(event);
    if (!kit.paused && (this.screen === 'rush' || this.screen === 'challenge')) {
      if (gesture.kind === 'topping') this.applyToppingAt(gesture.topping, p.x, p.y);
      if (gesture.kind === 'plate') this.serveAt(gesture.order, p.x, p.y);
    }
    gestures.delete(event.pointerId);
  };

  SliceRushScene.prototype.handlePausedTap = function (p) {
    if ((this.screen === 'rush' || this.screen === 'challenge') && contains(p.x, p.y, { x: 70, y: 420, w: 250, h: 56 }, 10)) kit.resume('manual');
  };

  SliceRushScene.prototype.handleKeyDown = function (event) {
    if (['Space', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Digit1', 'Digit2', 'Digit3', 'KeyR', 'Escape'].indexOf(event.code) < 0) return;
    event.preventDefault();
    beginAudio();
    if (kit.paused) { if (event.code === 'Escape' || event.code === 'Enter' || event.code === 'Space') kit.resume('manual'); return; }
    if (this.screen !== 'rush' && this.screen !== 'challenge') {
      if (event.code === 'Escape') this.closeToRush();
      if (event.code === 'Enter') this.activateMenuPrimary();
      return;
    }
    if (event.code === 'Digit1') this.tapDough();
    if (event.code === 'Digit2') this.forceTopping(TOPPINGS[1].id, this.run.activeOrder);
    if (event.code === 'Digit3') this.serveFirst(false);
    if (event.code === 'Space' || event.code === 'Enter') this.tapDough();
    if (event.code === 'Escape') kit.pause('manual');
    if (event.code === 'KeyR' && this.screen === 'result') this.resetRush(false);
  };

  SliceRushScene.prototype.toppingAt = function (x, y) {
    for (var i = 0; i < 6; i += 1) if (contains(x, y, { x: 16 + i * 60, y: 583, w: 54, h: 64 }, 7)) return i;
    return -1;
  };
  SliceRushScene.prototype.orderAt = function (x, y) {
    for (var i = 0; i < this.cards.length; i += 1) if (contains(x, y, this.cards[i], 8)) return i;
    return -1;
  };
  SliceRushScene.prototype.toppingFor = function (value) { return TOPPING_BY_ID[value] || TOPPINGS[0]; };

  SliceRushScene.prototype.setStage = function (stage) {
    var index = typeof stage === 'string' ? VENUES.findIndex(function (venue) { return venue.id === stage; }) : intValue(Number(stage), profile.venue, 0, VENUES.length - 1);
    if (index < 0) index = 0;
    profile.venue = index;
    this.activeVenue = index;
    this.refreshBackdrop();
    if (this.run) this.resetRush(false);
    kit.audio.music(VENUES[index].music, 450);
    saveProfile();
    this.syncDebug();
  };

  SliceRushScene.prototype.setMode = function (mode) {
    if (mode === 'rush' || mode === 'challenge') { this.screen = mode; this.setMenuVisible(false); if (kit.paused) kit.resume('menu'); if (mode === 'challenge') this.resetRush(true); return; }
    if (mode === 'campaign') this.openCampaign();
    else if (mode === 'upgrades') this.openUpgrades();
    else if (mode === 'reopening') this.openReopening();
    else if (mode === 'result') { this.screen = 'result'; this.setMenuVisible(true); kit.pause('menu'); }
    this.syncDebug();
  };

  SliceRushScene.prototype.resetRush = function (challenge) {
    var venue = VENUES[profile.venue] || VENUES[0];
    this.screen = challenge ? 'challenge' : 'rush';
    this.setMenuVisible(false);
    var investment = profile.venueInvest[profile.venue];
    this.run = {
      mode: this.screen, wave: 1, waveLength: challenge ? 30 + profile.venue * 2 : 32 + Math.min(12, profile.venue * 2), remaining: challenge ? 30 + profile.venue * 2 : 32 + Math.min(12, profile.venue * 2),
      target: challenge ? 6 + profile.venue : Math.min(8, 4 + profile.venue + investment), spawned: 0, served: 0, walkouts: 0, combo: 0, comboBest: 0, score: 0,
      customers: [], activeOrder: 0, spawnTimer: 0, doughPulse: 0, autoTimer: 0, autoServeTimer: 0, autoMotion: '',
      noticeText: offlineReport.coins > 0 ? '+' + format(offlineReport.coins) + ' offline coins' : offlineReport.tampered ? 'clock check: offline paused' : '', noticeTimer: offlineReport.coins > 0 || offlineReport.tampered ? 1.5 : 0,
      tutorialTime: profile.totalServed < 2 ? 3.5 : 0, particles: [], floaters: [], shake: 0, flash: 0, banner: venue.short + ' OPEN', bannerTime: 1.3, bannerBoundary: true,
      challenge: !!challenge, challengeRemaining: challenge ? 30 + profile.venue * 2 : 0, lastAction: '', result: null, elapsed: 0
    };
    offlineReport = { seconds: 0, coins: 0, rate: offlineReport.rate, venue: venue.id, tampered: false };
    this.spawnCustomer();
    sfx('tap');
    this.syncDebug();
  };

  SliceRushScene.prototype.spawnCustomer = function () {
    if (!this.run || this.run.spawned >= this.run.target) return;
    var venue = VENUES[profile.venue];
    var visibleLimit = this.queueLimit();
    if (this.run.customers.length >= visibleLimit) return;
    var available = profile.recipeMask.map(function (unlocked, index) { return unlocked ? index : -1; }).filter(function (index) { return index >= venue.range[0] && index <= venue.range[1]; });
    if (!available.length) available = profile.recipeMask.map(function (unlocked, index) { return unlocked ? index : -1; }).filter(function (index) { return index >= 0; });
    var recipe = RECIPES[choose(available)] || RECIPES[0];
    var archetype = venue.archetypes[this.run.spawned % venue.archetypes.length];
    var patience = Math.max(8, 14 - profile.venue * .5 - this.run.wave * .35 + profile.venueInvest[profile.venue] * .7 + (hasUpgrade(2) ? 1.5 : 0));
    this.run.customers.push({ id: this.run.spawned + 1, name: archetype, recipe: recipe, dough: 0, added: [], ready: false, patience: patience, maxPatience: patience, leaving: false, leaveTimer: 0, bob: choose([0, 1, 2, 3]) });
    this.run.spawned += 1;
    this.burst(70 + (this.run.customers.length - 1) * 125, 218, 'impact');
  };
  SliceRushScene.prototype.queueLimit = function () { return Math.min(5, 3 + (profile.venueInvest[profile.venue] >= 1 ? 1 : 0) + (hasUpgrade(7) ? 1 : 0)); };

  SliceRushScene.prototype.selectOrder = function (index) {
    if (!this.run || index < 0 || index >= this.run.customers.length) return;
    this.run.activeOrder = index;
    this.run.noticeText = 'ticket ' + (index + 1) + ' selected';
    this.run.noticeTimer = .8;
    this.run.lastAction = 'select-order';
    sfx('tap');
  };

  SliceRushScene.prototype.tapDough = function () {
    if (!this.run || (this.screen !== 'rush' && this.screen !== 'challenge') || kit.paused) return;
    var order = this.run.customers[this.run.activeOrder] || this.run.customers[0];
    if (!order || order.ready) { this.reject('stretch the next ticket'); return; }
    order.dough += .24 + (hasUpgrade(0) ? .05 : 0);
    profile.mastery.dough = true;
    this.run.doughPulse = .25;
    this.run.lastAction = 'stretch';
    this.run.noticeText = 'stretch ' + Math.min(100, Math.floor(order.dough * 100)) + '%';
    this.run.noticeTimer = .55;
    this.burst(108, 405, 'impact');
    sfx('dough');
    if (order.dough >= 1) { order.dough = 1; this.readyForToppings(order); }
    this.saveProgressSoon();
  };

  SliceRushScene.prototype.readyForToppings = function (order) {
    this.run.noticeText = 'dough ready'; this.run.noticeTimer = 1;
    this.run.lastAction = 'dough-ready'; this.burst(108, 405, 'reward'); sfx('unlock');
  };

  SliceRushScene.prototype.applyToppingAt = function (topping, x, y) {
    var index = this.orderAt(x, y);
    var order = index >= 0 ? this.run.customers[index] : this.run.customers[this.run.activeOrder];
    var centerHit = index >= 0 || contains(x, y, { x: 40, y: 335, w: 135, h: 140 }, 28);
    if (!centerHit) return;
    this.applyTopping(order, topping, false);
  };

  SliceRushScene.prototype.forceTopping = function (topping, orderIndex) {
    if (!this.run) return;
    var order = this.run.customers[intValue(Number(orderIndex), this.run.activeOrder, 0, Math.max(0, this.run.customers.length - 1))];
    if (order && order.dough < 1) { order.dough = 1; this.readyForToppings(order); }
    this.applyTopping(order, String(topping || 'cheese'), true);
  };

  SliceRushScene.prototype.applyTopping = function (order, topping, forced) {
    if (!order || order.leaving) return;
    var item = this.toppingFor(topping);
    if (order.dough < 1) { this.reject('stretch dough first'); return; }
    if (order.recipe.toppings.indexOf(item.id) < 0 || order.added.indexOf(item.id) >= 0) { this.reject('wrong topping'); return; }
    order.added.push(item.id);
    profile.mastery.toppings = true;
    this.run.lastAction = 'topping:' + item.id;
    this.run.noticeText = item.label + ' snapped'; this.run.noticeTimer = .65;
    this.burst(70 + this.run.activeOrder * 125, 182, 'impact');
    sfx('topping');
    if (order.added.length >= order.recipe.toppings.length) {
      order.ready = true;
      this.run.noticeText = 'pie ready: slide to counter'; this.run.noticeTimer = 1;
      this.run.lastAction = 'pie-ready';
      this.burst(70 + this.run.activeOrder * 125, 182, 'reward');
      kit.juice.shake(2, 100); kit.juice.hitStop(35); sfx('unlock');
    }
    if (!forced) this.saveProgressSoon();
  };

  SliceRushScene.prototype.serveAt = function (order, x, y) {
    if (!contains(x, y, { x: 18, y: 635, w: 354, h: 82 }, 18)) { this.reject('slide to the counter'); return; }
    this.serveOrder(order, false);
  };
  SliceRushScene.prototype.serveFirst = function (forced) { if (this.run) this.serveOrder(this.run.customers[0], !!forced); };
  SliceRushScene.prototype.serveOrder = function (order, forced) {
    if (!order) return;
    if (this.run.customers[0] !== order) { this.reject('serve the first ticket'); return; }
    if (!order.ready) { this.reject('finish the pie first'); return; }
    profile.mastery.serve = true;
    var comboBonus = this.run.combo * 2;
    var tip = order.recipe.reward + Math.ceil(order.patience) + comboBonus;
    if (hasUpgrade(10)) tip = Math.floor(tip * 1.25);
    profile.coins = intValue(profile.coins + tip, 0, 0, 99999999);
    profile.score = intValue(profile.score + tip * 10, 0, 0, 999999999);
    profile.best = Math.max(profile.best, profile.score);
    profile.totalServed += 1;
    this.run.score += tip * 10;
    this.run.served += 1;
    this.run.combo += 1;
    this.run.comboBest = Math.max(this.run.comboBest, this.run.combo);
    this.run.customers.shift();
    this.run.activeOrder = 0;
    this.run.lastAction = 'serve';
    this.run.noticeText = '+' + tip + ' coins' + (this.run.combo > 1 ? '  combo ×' + this.run.combo : '');
    this.run.noticeTimer = 1;
    this.run.floaters.push({ text: '+' + tip, x: 195, y: 680, life: 1, color: C.gold });
    this.burst(195, 675, 'reward');
    kit.juice.shake(4, 140); kit.juice.hitStop(55); sfx('serve');
    if (this.run.served >= this.run.target && this.run.spawned >= this.run.target && this.run.customers.length === 0) this.completeRun();
    this.saveProgressSoon();
  };

  SliceRushScene.prototype.reject = function (message) {
    if (!this.run) return;
    this.run.noticeText = message; this.run.noticeTimer = .9; this.run.lastAction = 'reject:' + message; this.run.flash = .14;
    this.burst(195, 405, 'impact'); kit.juice.shake(2, 90); sfx('reject');
  };

  SliceRushScene.prototype.autoWork = function (dt) {
    if (!this.run || this.run.customers.length === 0) return;
    var order = this.run.customers[this.run.activeOrder] || this.run.customers[0];
    this.run.autoMotion = '';
    if (hasUpgrade(1) && profile.mastery.dough && order && order.dough < 1) {
      order.dough += dt * (.58 + (hasUpgrade(3) ? .18 : 0)) * (1 + profile.reopenings * .12);
      this.run.autoMotion = 'stretch';
      if (order.dough >= 1) { order.dough = 1; this.readyForToppings(order); }
    }
    if (hasUpgrade(4) && profile.mastery.toppings && order && order.dough >= 1 && !order.ready) {
      this.run.autoTimer -= dt;
      if (this.run.autoTimer <= 0) {
        this.run.autoTimer = .72 / (hasUpgrade(3) ? 1.25 : 1);
        var next = order.recipe.toppings.filter(function (id) { return order.added.indexOf(id) < 0; })[0];
        if (next) { this.run.autoMotion = 'season'; this.applyTopping(order, next, true); }
      }
    }
    if (hasUpgrade(6) && profile.mastery.serve && this.run.customers[0] && this.run.customers[0].ready) {
      this.run.autoServeTimer -= dt;
      this.run.autoMotion = 'slide';
      if (this.run.autoServeTimer <= 0) { this.run.autoServeTimer = 1.1; this.serveFirst(true); }
    }
  };

  SliceRushScene.prototype.updateSim = function (dt) {
    if (!this.run || (this.screen !== 'rush' && this.screen !== 'challenge') || this.simPaused) return;
    this.run.elapsed += dt;
    this.run.remaining -= dt;
    if (this.run.challenge) this.run.challengeRemaining = Math.max(0, this.run.challengeRemaining - dt);
    this.run.spawnTimer -= dt;
    this.run.noticeTimer = Math.max(0, this.run.noticeTimer - dt);
    this.run.tutorialTime = Math.max(0, this.run.tutorialTime - dt);
    this.run.bannerTime = Math.max(0, this.run.bannerTime - dt);
    this.run.doughPulse = Math.max(0, this.run.doughPulse - dt);
    this.run.flash = Math.max(0, this.run.flash - dt);
    this.run.shake = Math.max(0, this.run.shake - dt * 9);
    this.run.autoMotion = '';
    if (this.run.spawnTimer <= 0 && this.run.spawned < this.run.target) { this.spawnCustomer(); this.run.spawnTimer = Math.max(.8, 2.1 - profile.venue * .08); }
    this.autoWork(dt);
    for (var i = this.run.customers.length - 1; i >= 0; i -= 1) {
      var customer = this.run.customers[i];
      if (customer.leaving) { customer.leaveTimer -= dt; if (customer.leaveTimer <= 0) this.run.customers.splice(i, 1); continue; }
      customer.patience -= dt * (this.run.challenge ? 1.12 : 1);
      if (customer.patience <= 0) {
        customer.patience = 0; customer.leaving = true; customer.leaveTimer = .55; this.run.walkouts += 1; this.run.combo = 0; profile.score = Math.max(0, profile.score - 30); this.run.noticeText = 'walkout'; this.run.noticeTimer = 1; this.run.lastAction = 'walkout'; this.burst(70 + i * 125, 180, 'impact'); kit.juice.shake(5, 180); sfx('walkout');
        if (this.run.walkouts >= 3) { this.failRun(); return; }
      }
    }
    if (this.run.remaining <= 0 && !this.run.challenge && this.run.spawned >= this.run.target && this.run.customers.length === 0) this.completeRun();
    if (this.run.challenge && this.run.challengeRemaining <= 0) { if (this.run.served >= this.run.target) this.completeRun(); else this.failRun(); }
    this.updateParticles(dt);
    this.syncDebug();
  };

  SliceRushScene.prototype.completeRun = function () {
    if (!this.run || this.run.result) return;
    this.run.result = 'clear'; this.screen = 'result'; this.setMenuVisible(true); kit.pause('menu');
    var bonus = Math.floor((this.run.served * 5 + this.run.comboBest * 4) * (hasUpgrade(10) ? 1.25 : 1));
    if (this.run.challenge) { bonus += 30 + profile.venue * 15; profile.rushWins[profile.venue] += 1; }
    profile.coins = intValue(profile.coins + bonus, 0, 0, 99999999);
    profile.totalServed += this.run.challenge ? 1 : 0;
    var oldCount = profile.recipeMask.filter(Boolean).length;
    for (var i = 0; i < RECIPES.length; i += 1) if (profile.totalServed >= 3 + i * 2) profile.recipeMask[i] = true;
    if (profile.totalServed >= VENUES[profile.highestVenue].unlock + 4 && profile.highestVenue < VENUES.length - 1) profile.highestVenue += 1;
    this.run.resultRecipes = profile.recipeMask.filter(Boolean).length - oldCount;
    this.run.resultBonus = bonus;
    this.run.banner = this.run.challenge ? 'RUSH HOUR CLEAR' : 'SHIFT CLEAR'; this.run.bannerTime = 1.5; this.run.bannerBoundary = true;
    sfx('unlock'); kit.juice.shake(3, 160); this.burst(195, 410, 'reward'); saveProfile(); this.syncDebug();
  };

  SliceRushScene.prototype.failRun = function () {
    if (!this.run || this.run.result) return;
    this.run.result = 'fail'; this.screen = 'result'; this.setMenuVisible(true); kit.pause('menu'); this.run.banner = 'SHIFT CLOSED'; this.run.bannerTime = 1.4; this.run.bannerBoundary = true; sfx('walkout'); saveProfile(); this.syncDebug();
  };

  SliceRushScene.prototype.openCampaign = function () { this.screen = 'campaign'; this.setMenuVisible(true); kit.pause('menu'); this.syncDebug(); };
  SliceRushScene.prototype.openUpgrades = function () { this.screen = 'upgrades'; this.setMenuVisible(true); kit.pause('menu'); this.syncDebug(); };
  SliceRushScene.prototype.openReopening = function () { this.screen = 'reopening'; this.setMenuVisible(true); kit.pause('menu'); this.syncDebug(); };
  SliceRushScene.prototype.closeToRush = function () { this.screen = this.run && this.run.challenge ? 'challenge' : 'rush'; this.setMenuVisible(false); if (kit.paused) kit.resume('menu'); this.syncDebug(); };
  SliceRushScene.prototype.startVenue = function (index, challenge) { this.setStage(index); this.screen = challenge ? 'challenge' : 'rush'; if (kit.paused) kit.resume('menu'); this.resetRush(!!challenge); beginAudio(); };

  SliceRushScene.prototype.purchaseUpgrade = function () {
    if (profile.upgrades >= UPGRADES.length) { this.openReopening(); return; }
    var upgrade = UPGRADES[profile.upgrades];
    if (profile.coins < upgrade.cost) { this.run.noticeText = 'serve more tables first'; this.run.noticeTimer = 1; sfx('reject'); return; }
    profile.coins -= upgrade.cost; profile.upgrades += 1; this.run.noticeText = upgrade.name + ' hired'; this.run.noticeTimer = 1; this.run.lastAction = 'upgrade:' + upgrade.id; this.burst(195, 470, 'reward'); sfx('upgrade'); kit.juice.shake(2, 110); saveProfile();
    if (profile.upgrades >= UPGRADES.length) this.openReopening();
  };
  SliceRushScene.prototype.investVenue = function (index) {
    if (index !== profile.venue || profile.venueInvest[index] >= 3) return;
    var venue = VENUES[index]; var level = profile.venueInvest[index]; var cost = venue.investCosts[level];
    if (profile.coins < cost) return;
    profile.coins -= cost; profile.venueInvest[index] += 1; this.activeVenue = index; this.refreshBackdrop(); sfx('upgrade'); this.burst(195, 430, 'reward'); saveProfile();
  };
  SliceRushScene.prototype.reopen = function () {
    if (profile.upgrades < UPGRADES.length) return;
    profile.reopenings += 1; profile.upgrades = 0; profile.coins = 0; profile.score = 0; profile.venue = 0; profile.highestVenue = Math.max(profile.highestVenue, 1); profile.mastery = { dough: false, toppings: false, serve: false }; saveProfile();
    this.setStage(0); this.screen = 'rush'; if (kit.paused) kit.resume('reopening'); this.resetRush(false); this.run.banner = 'REOPENING +' + profile.reopenings; this.run.bannerTime = 1.7; this.run.bannerBoundary = true; sfx('reopen'); this.burst(195, 420, 'reward');
  };

  SliceRushScene.prototype.handleMenuTap = function (p) {
    if (this.screen === 'campaign') {
      if (p.y >= 250 && p.y < 610) this.campaignSelect(Math.floor((p.y - 250) / 72));
      else if (p.y >= 612 && p.y < 686) this.investVenue(profile.venue);
      else if (p.y >= 692 && p.y < 748) this.startVenue(profile.venue, true);
      else if (p.y >= 752) this.closeToRush();
    } else if (this.screen === 'upgrades') {
      if (p.y >= 270 && p.y < 715) this.purchaseUpgrade();
      else if (p.y >= 750) this.closeToRush();
    } else if (this.screen === 'reopening') {
      if (p.y >= 624 && p.y < 724) this.reopen(); else if (p.y >= 750) this.closeToRush();
    } else if (this.screen === 'result') {
      if (p.y >= 610 && p.y < 726) { this.screen = 'rush'; if (kit.paused) kit.resume('menu'); this.resetRush(false); }
      else if (p.y >= 748) this.openCampaign();
    }
  };
  SliceRushScene.prototype.campaignSelect = function (index) {
    var venueIndex = clamp(index, 0, VENUES.length - 1);
    if (venueIndex > profile.highestVenue) return;
    profile.venue = venueIndex; this.activeVenue = venueIndex; this.refreshBackdrop(); kit.audio.music(VENUES[venueIndex].music, 450); saveProfile();
  };
  SliceRushScene.prototype.activateMenuPrimary = function () {
    if (this.screen === 'campaign') this.startVenue(profile.venue, false);
    else if (this.screen === 'upgrades') this.purchaseUpgrade();
    else if (this.screen === 'reopening') this.reopen();
    else if (this.screen === 'result') { this.screen = 'rush'; if (kit.paused) kit.resume('menu'); this.resetRush(false); }
  };

  SliceRushScene.prototype.saveProgressSoon = function () { profile.lastSeen = Date.now(); kit.save.set(profile); };

  SliceRushScene.prototype.burst = function (x, y, kind) {
    if (!this.run) return;
    var color = kind === 'reward' ? C.gold : C.mint;
    var count = kind === 'reward' ? 16 : 7;
    if (!kit.juice.enabled) count = Math.max(3, Math.floor(count / 2));
    if (kind === 'reward') this.rewardParticles.explode(count, x, y); else this.impactParticles.explode(count, x, y);
    for (var i = 0; i < Math.min(count, 18); i += 1) {
      var angle = (i / Math.max(1, count)) * TAU + (rng / 4294967296);
      var speed = 24 + (i % 5) * 12;
      this.run.particles.push({ x: x, y: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 25, life: .45 + (i % 4) * .08, max: .8, size: 2 + i % 3, color: color });
    }
    while (this.run.particles.length > MAX_PARTICLES) this.run.particles.shift();
  };
  SliceRushScene.prototype.updateParticles = function (dt) {
    if (!this.run) return;
    for (var i = this.run.particles.length - 1; i >= 0; i -= 1) {
      var particle = this.run.particles[i]; particle.life -= dt; particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vy += 80 * dt; if (particle.life <= 0) this.run.particles.splice(i, 1);
    }
    for (var j = this.run.floaters.length - 1; j >= 0; j -= 1) { var floater = this.run.floaters[j]; floater.life -= dt; floater.y -= dt * 28; if (floater.life <= 0) this.run.floaters.splice(j, 1); }
  };

  SliceRushScene.prototype.refreshBackdrop = function () {
    if (!this.backdrop) return;
    var venue = VENUES[this.activeVenue == null ? profile.venue : this.activeVenue];
    var invest = profile.venueInvest[this.activeVenue == null ? profile.venue : this.activeVenue];
    this.backdrop.clear();
    this.backdrop.fillStyle(venue.palette[0], 1); this.backdrop.fillRect(0, 0, W, H);
    this.backdrop.fillStyle(venue.palette[1], .3); this.backdrop.fillRect(0, 72, W, 496);
    this.backdrop.fillStyle(C.shadow, .35); this.backdrop.fillRect(0, 730, W, 114);
    this.backdrop.fillStyle(venue.palette[2], .2); this.backdrop.fillRect(0, 72, W, 4);
    if (this.activeVenue === 0) this.drawCartBackdrop(invest, venue);
    if (this.activeVenue === 1) this.drawShopBackdrop(invest, venue);
    if (this.activeVenue === 2) this.drawPlazaBackdrop(invest, venue);
    if (this.activeVenue === 3) this.drawPierBackdrop(invest, venue);
    if (this.activeVenue === 4) this.drawFlagshipBackdrop(invest, venue);
  };
  SliceRushScene.prototype.drawCartBackdrop = function (level, venue) {
    this.backdrop.fillStyle(0x315f5c, 1); this.backdrop.fillRect(18, 70, 354, 12); this.backdrop.fillStyle(venue.palette[2], 1); this.backdrop.fillRect(26, 58, 338, 12);
    this.backdrop.fillStyle(0xe27861, 1); this.backdrop.fillRect(36, 50, 36, 8); this.backdrop.fillRect(116, 50, 36, 8); this.backdrop.fillRect(196, 50, 36, 8); this.backdrop.fillRect(276, 50, 36, 8);
    this.backdrop.fillStyle(0xf6c969, 1); this.backdrop.fillCircle(70, 690, 14); this.backdrop.fillCircle(320, 690, 14); this.backdrop.lineStyle(3, 0x17343b, 1); this.backdrop.strokeCircle(70, 690, 7); this.backdrop.strokeCircle(320, 690, 7);
    if (level >= 1) { this.backdrop.fillStyle(0x7bd3ac, 1); this.backdrop.fillRect(28, 226, 334, 3); }
    if (level >= 2) { this.backdrop.fillStyle(0xf6c969, .8); for (var i = 0; i < 7; i += 1) this.backdrop.fillCircle(42 + i * 52, 82, 4); }
    if (level >= 3) { this.backdrop.fillStyle(0xfff1d2, 1); this.backdrop.fillRect(136, 36, 118, 22); this.backdrop.fillStyle(0x17343b, 1); this.backdrop.fillRect(148, 42, 94, 8); }
  };
  SliceRushScene.prototype.drawShopBackdrop = function (level, venue) {
    this.backdrop.fillStyle(0x574765, 1); this.backdrop.fillRect(18, 55, 354, 60); this.backdrop.fillStyle(0x172a35, 1); for (var x = 38; x < 360; x += 58) this.backdrop.fillRect(x, 69, 34, 34);
    this.backdrop.fillStyle(venue.palette[2], 1); this.backdrop.fillRect(18, 112, 354, 8);
    if (level >= 1) { this.backdrop.fillStyle(0xf6c969, .8); this.backdrop.fillCircle(58, 90, 6); this.backdrop.fillCircle(332, 90, 6); }
    if (level >= 2) { this.backdrop.fillStyle(0x7bd3ac, 1); this.backdrop.fillRect(28, 229, 7, 48); this.backdrop.fillCircle(32, 224, 17); this.backdrop.fillRect(350, 229, 7, 48); this.backdrop.fillCircle(354, 224, 17); }
    if (level >= 3) { this.backdrop.fillStyle(0xa993da, 1); this.backdrop.fillRect(112, 37, 166, 26); this.backdrop.fillStyle(0xfff1d2, 1); this.backdrop.fillRect(125, 44, 140, 10); }
  };
  SliceRushScene.prototype.drawPlazaBackdrop = function (level, venue) {
    this.backdrop.fillStyle(0xd18b69, .22); this.backdrop.fillRect(0, 86, W, 34); this.backdrop.fillStyle(venue.palette[2], .9); for (var i = 0; i < 8; i += 1) this.backdrop.fillTriangle(24 + i * 50, 115, 46 + i * 50, 115, 35 + i * 50, 132);
    this.backdrop.fillStyle(0x45665d, 1); this.backdrop.fillRect(22, 47, 346, 10); this.backdrop.fillRect(58, 48, 8, 56); this.backdrop.fillRect(324, 48, 8, 56);
    if (level >= 1) { this.backdrop.fillStyle(0x7bd3ac, 1); this.backdrop.fillCircle(36, 222, 20); this.backdrop.fillCircle(354, 222, 20); }
    if (level >= 2) { this.backdrop.fillStyle(0xf6c969, 1); this.backdrop.fillCircle(78, 85, 5); this.backdrop.fillCircle(312, 85, 5); }
    if (level >= 3) { this.backdrop.fillStyle(0xfff1d2, 1); this.backdrop.fillRect(120, 32, 150, 26); this.backdrop.fillStyle(0x263d39, 1); this.backdrop.fillRect(134, 39, 122, 10); }
  };
  SliceRushScene.prototype.drawPierBackdrop = function (level, venue) {
    this.backdrop.fillStyle(0x91c6e8, .24); for (var y = 76; y < 255; y += 28) { this.backdrop.lineStyle(2, 0x91c6e8, .45); this.backdrop.beginPath(); this.backdrop.arc(34, y, 50, 0, Math.PI); this.backdrop.stroke(); }
    this.backdrop.fillStyle(0x9c704f, .6); for (var x = 10; x < 390; x += 30) this.backdrop.fillRect(x, 235, 20, 24);
    this.backdrop.fillStyle(venue.palette[2], 1); this.backdrop.fillRect(18, 52, 354, 10);
    if (level >= 1) { this.backdrop.fillStyle(0xfff1d2, .8); this.backdrop.fillTriangle(42, 208, 65, 179, 88, 208); this.backdrop.fillTriangle(302, 208, 325, 179, 348, 208); }
    if (level >= 2) { this.backdrop.fillStyle(0xf6c969, 1); this.backdrop.fillCircle(60, 84, 5); this.backdrop.fillCircle(330, 84, 5); }
    if (level >= 3) { this.backdrop.fillStyle(0xa993da, 1); this.backdrop.fillRect(110, 28, 170, 28); this.backdrop.fillStyle(0xfff1d2, 1); this.backdrop.fillRect(126, 36, 138, 10); }
  };
  SliceRushScene.prototype.drawFlagshipBackdrop = function (level, venue) {
    this.backdrop.fillStyle(0x64405e, .42); for (var i = 0; i < 9; i += 1) this.backdrop.fillCircle(22 + i * 44, 82 + (i % 2) * 10, 3);
    this.backdrop.fillStyle(venue.palette[2], 1); this.backdrop.fillRect(18, 52, 354, 12); this.backdrop.fillStyle(0xfff1d2, .4); this.backdrop.fillRect(38, 72, 314, 2);
    if (level >= 1) { this.backdrop.fillStyle(0xee8069, 1); this.backdrop.fillRect(28, 220, 7, 48); this.backdrop.fillRect(355, 220, 7, 48); this.backdrop.fillCircle(31, 216, 16); this.backdrop.fillCircle(358, 216, 16); }
    if (level >= 2) { this.backdrop.fillStyle(0xf6c969, 1); for (var j = 0; j < 5; j += 1) this.backdrop.fillCircle(64 + j * 66, 90, 6); }
    if (level >= 3) { this.backdrop.fillStyle(0xfff1d2, 1); this.backdrop.fillRect(98, 26, 194, 30); this.backdrop.fillStyle(0x241a36, 1); this.backdrop.fillRect(112, 35, 166, 12); }
  };

  SliceRushScene.prototype.update = function (time, delta) {
    var frame = kit.juice.frame();
    if (!lastFrame) lastFrame = time;
    var real = Math.min(.1, Math.max(0, delta / 1000));
    accumulator += real;
    var steps = 0;
    if (!frame.frozen && !this.simPaused && !kit.paused) while (accumulator >= STEP && steps < MAX_STEPS) { this.updateSim(STEP); accumulator -= STEP; steps += 1; }
    if (this.simPaused || kit.paused) accumulator = 0;
    this.render(frame.dx, frame.dy);
    lastFrame = time;
  };

  SliceRushScene.prototype.render = function (dx, dy) {
    if (!this.run) return;
    this.world.clear(); this.fx.clear(); this.menu.clear();
    if (this.screen === 'rush' || this.screen === 'challenge') this.renderRush(dx, dy); else this.renderMenu();
    if (kit.paused && (this.screen === 'rush' || this.screen === 'challenge')) this.renderPause();
  };
  SliceRushScene.prototype.renderRush = function (dx, dy) {
    var run = this.run; var venue = VENUES[profile.venue]; var old = this.world;
    this.liveTexts.forEach(function (object) { object.setVisible(true); });
    this.menuTitle.setVisible(false); this.menuSub.setVisible(false); this.menuButton.setVisible(false); this.menuBack.setVisible(false); this.menuBody.setVisible(false); this.menuBody.setAlpha(1);
    this.toppingGlyphs.forEach(function (glyph) { glyph.setVisible(true); });
    old.save(); old.translateCanvas(dx || 0, dy || 0);
    old.fillStyle(C.ink, .66); old.fillRect(0, 0, W, 72);
    old.fillStyle(venue.palette[2], 1); old.fillRect(0, 70, W, 3);
    old.fillStyle(C.paper, .06); old.fillRoundedRect(12, 267, 366, 278, 22);
    old.fillStyle(C.deep, .75); old.fillRoundedRect(24, 316, 168, 198, 20);
    old.lineStyle(1, venue.palette[2], .25); old.strokeRoundedRect(24, 316, 168, 198, 20);
    old.fillStyle(C.gold, .15); old.fillCircle(108, 407, 65);
    old.fillStyle(C.deep, .9); old.fillRoundedRect(204, 316, 150, 198, 20);
    old.fillStyle(C.paper, .05); old.fillRoundedRect(20, 570, 354, 86, 22);
    old.fillStyle(venue.palette[1], .95); old.fillRoundedRect(18, 635, 354, 82, 20);
    old.lineStyle(2, venue.palette[2], .55); old.strokeRoundedRect(18, 635, 354, 82, 20);
    this.drawDough(old, run);
    this.drawOrderBench(old, run);
    this.drawToppings(old);
    this.drawCounter(old, run);
    this.drawStaff(old, run);
    old.restore();
    this.renderCards();
    this.renderHud();
    this.renderEffects();
    if (run.bannerTime > 0 && run.bannerBoundary) this.renderBoundaryBanner(run.banner, run.bannerTime);
  };
  SliceRushScene.prototype.drawDough = function (g, run) {
    var order = run.customers[run.activeOrder] || run.customers[0]; var progress = order ? order.dough : 0;
    g.fillStyle(C.paper, .8); g.fillCircle(108, 407, 47 + Math.sin(run.doughPulse * 20) * 2);
    g.fillStyle(order && order.ready ? C.gold : C.coral, 1); g.fillEllipse(108, 407, 34 + progress * 10, 18 + progress * 5);
    g.fillStyle(C.paper, .55); g.fillCircle(95, 402, 4); g.fillCircle(120, 412, 5); g.fillCircle(111, 393, 3);
    g.fillStyle(C.mint, 1); g.fillRoundedRect(44, 472, 128 * clamp(progress, 0, 1), 7, 4);
    g.fillStyle(C.paper, .12); g.fillRoundedRect(44, 472, 128, 7, 4);
    if (run.autoMotion === 'stretch') { g.fillStyle(C.mint, .22); g.fillCircle(108, 407, 60); }
  };
  SliceRushScene.prototype.drawOrderBench = function (g, run) {
    g.fillStyle(C.paper, .05); g.fillRoundedRect(222, 340, 114, 102, 14); g.fillStyle(C.muted, .7); g.fillCircle(250, 370, 5); g.fillCircle(268, 370, 5); g.fillCircle(286, 370, 5); g.fillStyle(C.gold, .8); g.fillRoundedRect(237, 400, 78, 8, 4);
    var order = run.customers[run.activeOrder]; if (!order) return;
    var needed = order.recipe.toppings; for (var i = 0; i < needed.length; i += 1) { var item = this.toppingFor(needed[i]); g.fillStyle(item.color, 1); g.fillCircle(238 + (i % 4) * 22, 424 + Math.floor(i / 4) * 20, 7); if (order.added.indexOf(item.id) < 0) { g.lineStyle(2, C.paper, .35); g.strokeCircle(238 + (i % 4) * 22, 424 + Math.floor(i / 4) * 20, 7); } }
    if (order.ready) { g.fillStyle(C.gold, .14); g.fillRoundedRect(217, 330, 124, 122, 16); g.lineStyle(2, C.gold, .8); g.strokeRoundedRect(217, 330, 124, 122, 16); }
  };
  SliceRushScene.prototype.drawToppings = function (g) {
    for (var i = 0; i < 6; i += 1) { var item = TOPPINGS[i]; var x = 16 + i * 60; g.fillStyle(item.color, .18); g.fillRoundedRect(x, 583, 54, 64, 14); g.lineStyle(1, item.color, .7); g.strokeRoundedRect(x, 583, 54, 64, 14); g.fillStyle(item.color, 1); g.fillCircle(x + 27, 604, 12); }
  };
  SliceRushScene.prototype.drawCounter = function (g, run) {
    g.fillStyle(C.paper, .12); g.fillRoundedRect(34, 669, 322, 28, 14);
    if (run.customers[0] && run.customers[0].ready) { g.fillStyle(C.paper, 1); g.fillEllipse(195, 683, 72, 21); g.fillStyle(run.customers[0].recipe.hue, 1); g.fillEllipse(195, 680, 54, 15); g.fillStyle(C.mint, 1); g.fillCircle(180, 678, 5); g.fillCircle(207, 683, 5); if (hasUpgrade(6) && profile.mastery.serve) { g.lineStyle(2, C.gold, .8); g.strokeEllipse(195, 680, 82, 26); } }
    if (run.autoMotion === 'slide') { g.fillStyle(C.gold, .16); g.fillRoundedRect(246, 670, 92, 26, 12); }
  };
  SliceRushScene.prototype.drawStaff = function (g, run) {
    if (!hasUpgrade(1)) return;
    var x = run.autoMotion === 'season' ? 238 : run.autoMotion === 'slide' ? 300 : 48; var y = run.autoMotion === 'slide' ? 680 : 470; var accent = profile.venue % 2 ? C.purple : C.mint;
    g.fillStyle(accent, 1); g.fillCircle(x, y - 28, 9); g.fillRoundedRect(x - 9, y - 18, 18, 28, 7); g.lineStyle(3, C.paper, 1); g.beginPath(); g.moveTo(x + 7, y - 8); g.lineTo(x + 20, y - 18 + Math.sin(this.run.elapsed * 12) * 4); g.stroke(); g.fillStyle(C.gold, 1); g.fillCircle(x + 21, y - 19 + Math.sin(this.run.elapsed * 12) * 4, 4);
    if (run.autoMotion) { g.fillStyle(accent, .16); g.fillCircle(x, y - 12, 25); }
  };
  SliceRushScene.prototype.renderCards = function () {
    var run = this.run;
    for (var i = 0; i < 3; i += 1) {
      var card = this.cards[i], bg = this.cardBgs[i], avatar = this.cardAvatars[i], bar = this.cardBars[i], order = run.customers[i];
      bg.clear(); avatar.clear(); bar.clear();
      if (!order) { bg.fillStyle(C.paper, .04); bg.fillRoundedRect(card.x, card.y, card.w, card.h, 18); setTextIfChanged(this.cardNames[i], ''); setTextIfChanged(this.cardRecipes[i], ''); setTextIfChanged(this.cardToppings[i], ''); continue; }
      var active = run.activeOrder === i; var danger = order.patience / order.maxPatience < .35; var ready = order.ready;
      bg.fillStyle(ready ? C.gold : active ? C.paper : C.deep, ready ? .18 : active ? .12 : .8); bg.fillRoundedRect(card.x, card.y, card.w, card.h, 18); bg.lineStyle(active || ready ? 2 : 1, ready ? C.gold : danger ? C.red : active ? C.mint : C.paper, active || ready ? .8 : .12); bg.strokeRoundedRect(card.x, card.y, card.w, card.h, 18);
      avatar.fillStyle(order.recipe.hue, 1); avatar.fillCircle(card.x + 27, card.y + 31, 16); avatar.fillStyle(C.deep, 1); avatar.fillCircle(card.x + 22, card.y + 28, 2); avatar.fillCircle(card.x + 32, card.y + 28, 2); avatar.fillStyle(C.paper, 1); avatar.fillEllipse(card.x + 27, card.y + 37, 9, 4);
      var ratio = clamp(order.patience / order.maxPatience, 0, 1); bar.fillStyle(C.paper, .1); bar.fillRoundedRect(card.x + 12, card.y + 124, card.w - 24, 8, 4); bar.fillStyle(danger ? C.red : ratio < .62 ? C.gold : C.mint, 1); bar.fillRoundedRect(card.x + 12, card.y + 124, Math.max(8, (card.w - 24) * ratio), 8, 4);
      setTextIfChanged(this.cardNames[i], order.name); setColorIfChanged(this.cardNames[i], danger ? C.red : C.cream);
      setTextIfChanged(this.cardRecipes[i], order.recipe.name); setColorIfChanged(this.cardRecipes[i], ready ? C.gold : C.paper);
      var dots = order.recipe.toppings.map(function (id) { return order.added.indexOf(id) >= 0 ? '●' : '○'; }).join(' ');
      setTextIfChanged(this.cardToppings[i], ready ? 'READY  →' : dots); setColorIfChanged(this.cardToppings[i], ready ? C.gold : danger ? C.red : C.muted);
      if (danger) { avatar.fillStyle(C.red, .9); avatar.fillCircle(card.x + 101, card.y + 18, 8); setTextIfChanged(this.cardToppings[i], '!' + (ready ? '  READY' : '  ' + dots)); }
    }
    var extra = Math.max(0, run.customers.length - 3); this.world.fillStyle(C.paper, .5); for (var j = 0; j < Math.min(3, extra); j += 1) this.world.fillCircle(362 - j * 12, 244, 4);
  };
  SliceRushScene.prototype.renderHud = function () {
    var run = this.run; var venue = VENUES[profile.venue];
    setTextIfChanged(this.hudVenue, venue.name); setTextIfChanged(this.hudStage, 'OPEN ' + String(profile.venueInvest[profile.venue] + 1).padStart(2, '0')); setTextIfChanged(this.hudCoins, format(profile.coins)); setTextIfChanged(this.hudScore, format(profile.score)); setTextIfChanged(this.hudProgress, run.served + ' / ' + run.target); setTextIfChanged(this.hudCombo, run.combo > 1 ? '×' + run.combo : ''); setTextIfChanged(this.stationStep, Math.floor(((run.customers[run.activeOrder] || { dough: 0 }).dough) * 100) + '%'); setTextIfChanged(this.upgradeChip, '↗ ' + profile.upgrades + ' / 12');
    setColorIfChanged(this.hudProgress, run.challenge ? C.coral : C.muted); setColorIfChanged(this.hudCombo, C.mint); setColorIfChanged(this.stationStep, C.mint);
    var coaching = run.tutorialTime > 0; this.queueLabel.setVisible(!coaching); setTextIfChanged(this.coach, coaching ? 'tap dough  ·  drag a topping  ·  slide a ready pie' : ''); setTextIfChanged(this.notice, run.noticeTimer > 0 ? run.noticeText : ''); setColorIfChanged(this.notice, run.lastAction.indexOf('reject') === 0 ? C.coral : C.gold);
  };
  SliceRushScene.prototype.renderEffects = function () {
    var run = this.run; this.fx.clear();
    for (var i = 0; i < run.particles.length; i += 1) { var p = run.particles[i]; this.fx.fillStyle(p.color, clamp(p.life / p.max, 0, 1)); this.fx.fillCircle(p.x, p.y, p.size); }
    for (var j = 0; j < run.floaters.length; j += 1) { var f = run.floaters[j]; this.fx.fillStyle(f.color, clamp(f.life, 0, 1)); this.fx.fillCircle(f.x, f.y, 3); }
    var dragged = null; gestures.forEach(function (gesture) { if (gesture.kind === 'topping' || gesture.kind === 'plate') dragged = gesture; });
    if (dragged) { this.fx.fillStyle(C.paper, .92); this.fx.fillEllipse(dragged.x, dragged.y, 35, 12); this.fx.fillStyle(dragged.kind === 'topping' ? this.toppingFor(dragged.topping).color : C.gold, 1); this.fx.fillCircle(dragged.x, dragged.y - 2, 8); }
  };
  SliceRushScene.prototype.renderBoundaryBanner = function (value, time) {
    var alpha = clamp(Math.min(time * 2, 1), 0, 1); this.fx.fillStyle(C.deep, .92 * alpha); this.fx.fillRoundedRect(73, 369, 244, 82, 22); this.fx.lineStyle(2, C.gold, .8 * alpha); this.fx.strokeRoundedRect(73, 369, 244, 82, 22); setTextIfChanged(this.menuBody, value); setColorIfChanged(this.menuBody, C.gold); this.menuBody.setPosition(195, 410); this.menuBody.setOrigin(.5, .5); this.menuBody.setVisible(true); this.menuBody.setAlpha(alpha);
  };
  SliceRushScene.prototype.renderPause = function () { this.fx.fillStyle(C.deep, .88); this.fx.fillRect(0, 0, W, H); this.fx.fillStyle(C.paper, .08); this.fx.fillRoundedRect(42, 344, 306, 212, 24); setTextIfChanged(this.menuTitle, 'KITCHEN PAUSED'); this.menuTitle.setPosition(195, 395); this.menuTitle.setOrigin(.5, .5); this.menuTitle.setVisible(true); setTextIfChanged(this.menuSub, 'The line is waiting.'); this.menuSub.setPosition(195, 435); this.menuSub.setOrigin(.5, .5); this.menuSub.setVisible(true); this.fx.fillStyle(C.gold, 1); this.fx.fillRoundedRect(70, 476, 250, 56, 18); setTextIfChanged(this.menuButton, 'RESUME'); this.menuButton.setPosition(195, 504); this.menuButton.setVisible(true); };

  SliceRushScene.prototype.renderMenu = function () {
    var venue = VENUES[profile.venue]; this.menu.fillStyle(C.deep, .97); this.menu.fillRect(0, 0, W, H); this.menu.fillStyle(venue.palette[1], .45); this.menu.fillRect(0, 0, W, 118); this.menu.lineStyle(2, venue.palette[2], .7); this.menu.lineBetween(18, 116, 372, 116);
    this.liveTexts.forEach(function (object) { object.setVisible(false); });
    this.toppingGlyphs.forEach(function (glyph) { glyph.setVisible(false); });
    this.menuRows.forEach(function (row) { row.setVisible(false); });
    this.menuTitle.setPosition(195, 136); this.menuSub.setPosition(195, 174); this.menuBody.setPosition(195, 212); this.menuTitle.setOrigin(.5, .5); this.menuSub.setOrigin(.5, .5); this.menuBody.setOrigin(.5, .5); this.menuButton.setPosition(195, 722); this.menuBack.setPosition(195, 778);
    if (this.screen === 'campaign') this.renderCampaignMenu(); else if (this.screen === 'upgrades') this.renderUpgradeMenu(); else if (this.screen === 'reopening') this.renderReopeningMenu(); else if (this.screen === 'result') this.renderResultMenu();
  };
  SliceRushScene.prototype.renderCampaignMenu = function () {
    setTextIfChanged(this.menuTitle, 'RESTAURANT MAP'); setTextIfChanged(this.menuSub, '5 venues  ·  30 recipes  ·  no ads'); setTextIfChanged(this.menuBody, 'Choose a floor to improve.');
    for (var i = 0; i < 5; i += 1) { var venue = VENUES[i]; var y = 250 + i * 72; this.menu.fillStyle(i <= profile.highestVenue ? venue.palette[1] : C.ink, .8); this.menu.fillRoundedRect(20, y, 350, 58, 16); this.menu.lineStyle(i === profile.venue ? 2 : 1, i === profile.venue ? C.gold : C.paper, i === profile.venue ? .9 : .12); this.menu.strokeRoundedRect(20, y, 350, 58, 16); setTextIfChanged(this.menuRows[i], (i <= profile.highestVenue ? '● ' : '○ ') + venue.name); this.menuRows[i].setPosition(38, y + 20); this.menuRows[i].setVisible(true); setColorIfChanged(this.menuRows[i], i <= profile.highestVenue ? C.paper : C.muted); setTextIfChanged(this.menuRows[i + 5], i <= profile.highestVenue ? 'level ' + (profile.venueInvest[i] + 1) + '  ·  ' + venue.archetypes.join(' / ') : 'mastery ' + venue.unlock + ' serves'); this.menuRows[i + 5].setPosition(38, y + 42); this.menuRows[i + 5].setFontSize('14px'); this.menuRows[i + 5].setVisible(true); setColorIfChanged(this.menuRows[i + 5], C.muted); }
    var level = profile.venueInvest[profile.venue]; var cost = level < 3 ? VENUES[profile.venue].investCosts[level] : 0; this.menu.fillStyle(C.gold, 1); this.menu.fillRoundedRect(54, 612, 282, 56, 18); setTextIfChanged(this.menuButton, level < 3 ? 'INVEST  ' + cost + ' COINS' : 'VENUE MAXED'); setColorIfChanged(this.menuButton, C.deep); this.menuButton.setPosition(195, 640); this.menuButton.setVisible(true); this.menu.fillStyle(C.coral, .9); this.menu.fillRoundedRect(54, 686, 282, 50, 16); setTextIfChanged(this.menuBody, 'RUSH HOUR  ·  ' + profile.rushWins[profile.venue] + ' clears'); this.menuBody.setPosition(195, 711); this.menuBody.setVisible(true); setColorIfChanged(this.menuBody, C.paper); setTextIfChanged(this.menuBack, 'BACK TO SHIFT'); this.menuBack.setVisible(true);
  };
  SliceRushScene.prototype.renderUpgradeMenu = function () {
    setTextIfChanged(this.menuTitle, 'AUTOMATION PATH'); setTextIfChanged(this.menuSub, profile.upgrades + ' / 12 stations hired'); setTextIfChanged(this.menuBody, 'Every hire repeats a motion you mastered.');
    for (var i = 0; i < 12; i += 1) { var y = 264 + i * 37; var done = i < profile.upgrades; this.menu.fillStyle(done ? C.mint : i === profile.upgrades ? C.gold : C.paper, done ? .16 : i === profile.upgrades ? .15 : .05); this.menu.fillRoundedRect(22, y - 15, 346, 30, 10); setTextIfChanged(this.menuRows[i], (done ? '✓ ' : i === profile.upgrades ? '→ ' : '○ ') + UPGRADES[i].name + '  ·  ' + UPGRADES[i].note + (done ? '' : '  ' + UPGRADES[i].cost + '¢')); this.menuRows[i].setPosition(34, y); this.menuRows[i].setVisible(true); setColorIfChanged(this.menuRows[i], done ? C.mint : i === profile.upgrades ? C.gold : C.muted); }
    this.menu.fillStyle(C.gold, 1); this.menu.fillRoundedRect(54, 704, 282, 54, 18); setTextIfChanged(this.menuButton, profile.upgrades >= 12 ? 'REOPEN THE FLOOR' : 'HIRE NEXT STATION'); this.menuButton.setPosition(195, 731); this.menuButton.setVisible(true); setTextIfChanged(this.menuBack, 'BACK TO SHIFT'); this.menuBack.setVisible(true);
  };
  SliceRushScene.prototype.renderReopeningMenu = function () {
    setTextIfChanged(this.menuTitle, 'REOPENING'); setTextIfChanged(this.menuSub, 'A calm prestige reset for a faster floor.'); setTextIfChanged(this.menuBody, 'LEAVES  coins  ·  upgrades  ·  hands-on mastery');
    this.menu.fillStyle(C.gold, .16); this.menu.fillRoundedRect(38, 280, 314, 210, 24); this.menu.lineStyle(1, C.gold, .5); this.menu.strokeRoundedRect(38, 280, 314, 210, 24); setTextIfChanged(this.menuRows[0], 'KEEPS  recipes  ·  venue decor  ·  rush medals'); this.menuRows[0].setPosition(58, 330); this.menuRows[0].setVisible(true); setColorIfChanged(this.menuRows[0], C.mint); setTextIfChanged(this.menuRows[1], 'NEW FLOOR SPEED  ×' + (1 + (profile.reopenings + 1) * .12).toFixed(2)); this.menuRows[1].setPosition(58, 386); this.menuRows[1].setVisible(true); setColorIfChanged(this.menuRows[1], C.gold); setTextIfChanged(this.menuRows[2], 'mastery carried: ' + profile.recipeMask.filter(Boolean).length + ' recipes'); this.menuRows[2].setPosition(58, 442); this.menuRows[2].setVisible(true); setColorIfChanged(this.menuRows[2], C.paper); this.menu.fillStyle(C.gold, 1); this.menu.fillRoundedRect(54, 624, 282, 58, 18); setTextIfChanged(this.menuButton, 'CONFIRM REOPENING'); this.menuButton.setPosition(195, 653); this.menuButton.setVisible(true); setTextIfChanged(this.menuBack, 'KEEP SHIFTING'); this.menuBack.setVisible(true);
  };
  SliceRushScene.prototype.renderResultMenu = function () {
    var clear = this.run && this.run.result === 'clear'; setTextIfChanged(this.menuTitle, clear ? 'SHIFT CLEAR' : 'SHIFT CLOSED'); setColorIfChanged(this.menuTitle, clear ? C.mint : C.coral); setTextIfChanged(this.menuSub, clear ? (this.run.challenge ? 'Rush hour held.' : 'The queue stayed warm.') : 'Three walkouts ended the shift.'); setTextIfChanged(this.menuBody, clear ? '+' + (this.run.resultBonus || 0) + ' coins  ·  ' + (this.run.comboBest || 0) + ' best combo' : 'Your venue and recipes stay safe.');
    this.menu.fillStyle(clear ? C.mint : C.coral, .14); this.menu.fillRoundedRect(38, 294, 314, 168, 24); setTextIfChanged(this.menuRows[0], 'SERVED  ' + (this.run.served || 0)); this.menuRows[0].setPosition(58, 342); this.menuRows[0].setVisible(true); setTextIfChanged(this.menuRows[1], 'SCORE  ' + format(this.run.score || 0)); this.menuRows[1].setPosition(58, 394); this.menuRows[1].setVisible(true); setTextIfChanged(this.menuRows[2], (this.run.resultRecipes || 0) > 0 ? 'RECIPE UNLOCKED  +' + this.run.resultRecipes : 'NEXT: hire a station or invest'); this.menuRows[2].setPosition(58, 446); this.menuRows[2].setVisible(true); setColorIfChanged(this.menuRows[2], C.gold); this.menu.fillStyle(C.gold, 1); this.menu.fillRoundedRect(54, 604, 282, 60, 18); setTextIfChanged(this.menuButton, 'OPEN NEXT SHIFT'); this.menuButton.setPosition(195, 634); this.menuButton.setVisible(true); setTextIfChanged(this.menuBack, 'VIEW RESTAURANT MAP'); this.menuBack.setVisible(true);
  };
  SliceRushScene.prototype.syncDebug = function () {
    if (!debugState || !this.run) return;
    debugState.mode = this.screen; debugState.progress = this.run.challenge ? clamp(1 - this.run.challengeRemaining / Math.max(1, this.run.waveLength), 0, 1) : clamp(this.run.served / Math.max(1, this.run.target), 0, 1); debugState.score = profile.score; debugState.health = clamp(100 - this.run.walkouts * 33, 0, 100); debugState.stage = VENUES[profile.venue].id; debugState.currentStage = VENUES[profile.venue].name; debugState.coins = profile.coins; debugState.combo = this.run.combo; debugState.clockFlag = profile.clockFlag; debugState.lastAction = this.run.lastAction; debugState.queue = this.run.customers.length; debugState.activeOrder = this.run.activeOrder; debugState.firstRecipe = this.run.customers[0] ? { id: this.run.customers[0].recipe.id, toppings: this.run.customers[0].recipe.toppings.slice() } : null; debugState.firstPriority = { dough: !!(this.run.customers[0] && this.run.customers[0].dough >= 1), toppingCount: this.run.customers[0] ? this.run.customers[0].added.length : 0, ready: !!(this.run.customers[0] && this.run.customers[0].ready), canServe: !!(this.run.customers[0] && this.run.customers[0].ready) };
  };

  kit.loader.show('SLICE RUSH'); kit.loader.progress(.25);
  try {
    var config = { type: Phaser.AUTO, parent: shell, width: W, height: H, backgroundColor: '#10242a', render: { antialias: true, antialiasGL: false, powerPreference: 'high-performance', roundPixels: false, batchSize: 2048 }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H }, fps: { target: 60, min: 30 }, scene: [SliceRushScene], banner: false };
    config.scale.width = Math.round(W * RETINA_FACTOR);
    config.scale.height = Math.round(H * RETINA_FACTOR);
    config.width = config.scale.width;
    config.height = config.scale.height;
    config.render = Object.assign({}, GGKit.renderDefaults, config.render || {});
    phaserGame = new Phaser.Game(config);
  } catch (error) {
    fallback.textContent = 'The kitchen could not start.'; debugState.mode = 'error'; debugState.error = String(error && error.message || error);
  }
})();
