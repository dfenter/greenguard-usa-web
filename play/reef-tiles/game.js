/* Reef Tiles AAA rebuild. Phaser renders the view; GGKit owns lifecycle,
 * pointer identity, keyboard state, saves, audio buses, settings and PWA. */
(function () {
  'use strict';

  var FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  var STEP = 1 / 60;
  var COLS = 8;
  var ROWS = 8;
  var CELLS = COLS * ROWS;
  var TAU = Math.PI * 2;
  var COLOR = {
    ink: 0x182238, board: 0x243453, cell: 0x314567, edge: 0x5d7294, paper: 0xf7fbff,
    coral: 0xf25c68, sun: 0xf7c948, leaf: 0x5bcb77, tide: 0x38a8de,
    plum: 0x9a7cf3, ember: 0xf29a4a, good: 0x7ee49b, warning: 0xffc861,
    bad: 0xff8a86, water: 0x0e6b87, sand: 0xe0c58a
  };
  var TILE = [
    { name: 'Coral', color: COLOR.coral, css: '#f25c68', glyph: '●', shape: 'circle' },
    { name: 'Sun', color: COLOR.sun, css: '#f7c948', glyph: '✦', shape: 'star' },
    { name: 'Kelp', color: COLOR.leaf, css: '#5bcb77', glyph: '◆', shape: 'diamond' },
    { name: 'Tide', color: COLOR.tide, css: '#38a8de', glyph: '≈', shape: 'drop' },
    { name: 'Plum', color: COLOR.plum, css: '#9a7cf3', glyph: '⬡', shape: 'hex' },
    { name: 'Ember', color: COLOR.ember, css: '#f29a4a', glyph: '▰', shape: 'square' }
  ];
  var PACKS = [
    { name: 'Starter Tank', comfort: 0, tint: '#277e9c', accent: '#f25c68', levelRange: '1-4' },
    { name: 'Reef Shelf', comfort: 24, tint: '#1b91a0', accent: '#f7c948', levelRange: '5-8' },
    { name: 'Kelp Forest', comfort: 52, tint: '#167d78', accent: '#5bcb77', levelRange: '9-12' },
    { name: 'Coral Sanctuary', comfort: 82, tint: '#795aa4', accent: '#f7c948', levelRange: '13-16' }
  ];
  var POWERUPS = [
    { id: 'pulse', name: 'Current Pulse', icon: '↯', unlock: 12, kind: 'neighbors', desc: 'Clears the selected tile and its neighbours.' },
    { id: 'sweep', name: 'Tidal Sweep', icon: '≋', unlock: 36, kind: 'row', desc: 'Clears the selected row.' },
    { id: 'bloom', name: 'Coral Bloom', icon: '✿', unlock: 72, kind: 'family', desc: 'Clears every tile of the selected family.' }
  ];
  var DECOR = [
    { id: 'anemone', name: 'Anemone', kind: 'plant', icon: '✿', comfort: 7, cost: 18, color: 0xf25c68 },
    { id: 'seagrass', name: 'Seagrass', kind: 'plant', icon: '♒', comfort: 6, cost: 20, color: 0x5bcb77 },
    { id: 'fan-coral', name: 'Fan coral', kind: 'plant', icon: '✺', comfort: 8, cost: 24, color: 0xf29a4a },
    { id: 'kelp-cluster', name: 'Kelp cluster', kind: 'plant', icon: '♣', comfort: 9, cost: 28, color: 0x3fbf83 },
    { id: 'shell-bed', name: 'Shell bed', kind: 'hide', icon: '◒', comfort: 8, cost: 22, color: 0xe8c887 },
    { id: 'reef-arch', name: 'Reef arch', kind: 'hide', icon: '⌒', comfort: 10, cost: 32, color: 0xd77960 },
    { id: 'moon-cave', name: 'Moon cave', kind: 'hide', icon: '◓', comfort: 11, cost: 36, color: 0x7667ad },
    { id: 'bubble-vent', name: 'Bubble vent', kind: 'vent', icon: '◌', comfort: 7, cost: 18, color: 0x9fe9f5 },
    { id: 'double-vent', name: 'Twin vent', kind: 'vent', icon: '◎', comfort: 10, cost: 34, color: 0x77d9ec },
    { id: 'sunken-anchor', name: 'Sunken anchor', kind: 'scenery', icon: '⚓', comfort: 5, cost: 16, color: 0x7d94a2 },
    { id: 'pearl-pedestal', name: 'Pearl pedestal', kind: 'scenery', icon: '♢', comfort: 6, cost: 26, color: 0xf7c948 },
    { id: 'treasure-chest', name: 'Treasure chest', kind: 'hide', icon: '▣', comfort: 9, cost: 30, color: 0xa86f4c },
    { id: 'coral-spire', name: 'Coral spire', kind: 'plant', icon: '▲', comfort: 12, cost: 42, color: 0xef766a },
    { id: 'kelp-bridge', name: 'Kelp bridge', kind: 'hide', icon: '⌁', comfort: 12, cost: 40, color: 0x4f9d69 },
    { id: 'star-shell', name: 'Star shell', kind: 'scenery', icon: '✦', comfort: 8, cost: 32, color: 0xf7c948 },
    { id: 'sanctuary-gate', name: 'Sanctuary gate', kind: 'hide', icon: 'Ω', comfort: 15, cost: 56, color: 0x9a7cf3 }
  ];
  var FISH = [
    { id: 'tetras', name: 'Sun tetras', behavior: 'school', icon: '◉', comfort: 6, cost: 26, color: 0xf7c948, size: 18 },
    { id: 'clownfish', name: 'Clownfish', behavior: 'hide', icon: '◍', comfort: 8, cost: 32, color: 0xf29a4a, size: 22 },
    { id: 'goby', name: 'Sand goby', behavior: 'floor', icon: '●', comfort: 7, cost: 28, color: 0x9a7cf3, size: 18 },
    { id: 'wrasse', name: 'Chase wrasse', behavior: 'chase', icon: '➤', comfort: 9, cost: 38, color: 0x38a8de, size: 22 },
    { id: 'blenny', name: 'Bubble blenny', behavior: 'bubble', icon: '◌', comfort: 10, cost: 42, color: 0x5bcb77, size: 20 },
    { id: 'ray', name: 'Drift ray', behavior: 'glide', icon: '◇', comfort: 12, cost: 52, color: 0xf25c68, size: 28 }
  ];
  var LEVELS = [
    { name: 'First light', pack: 0, comfort: 0, seed: 1101, moves: 24, goals: [[0, 18]], pearls: 30, silver: 7, gold: 12, drop: 1 },
    { name: 'Pebble path', pack: 0, comfort: 0, seed: 1137, moves: 25, goals: [[1, 17]], pearls: 34, silver: 7, gold: 12, drop: 4 },
    { name: 'Little current', pack: 0, comfort: 0, seed: 1199, moves: 26, goals: [[2, 18], [0, 12]], pearls: 38, silver: 8, gold: 13, drop: 7 },
    { name: 'Starter bloom', pack: 0, comfort: 0, seed: 1273, moves: 27, goals: [[3, 18], [1, 15]], pearls: 42, silver: 8, gold: 14, drop: 2 },
    { name: 'Shelf edge', pack: 1, comfort: 24, seed: 2111, moves: 27, goals: [[4, 18], [3, 16]], pearls: 48, silver: 8, gold: 14, drop: 5 },
    { name: 'Glass tide', pack: 1, comfort: 24, seed: 2177, moves: 28, goals: [[0, 19], [5, 17]], pearls: 52, silver: 9, gold: 15, drop: 8 },
    { name: 'Low reef', pack: 1, comfort: 24, seed: 2219, moves: 29, goals: [[2, 20], [4, 18]], pearls: 56, silver: 9, gold: 16, drop: 10 },
    { name: 'Shelf garden', pack: 1, comfort: 24, seed: 2293, moves: 30, goals: [[1, 20], [3, 18], [0, 12]], pearls: 60, silver: 10, gold: 16, drop: 12 },
    { name: 'Kelp trail', pack: 2, comfort: 52, seed: 3103, moves: 30, goals: [[2, 21], [5, 19]], pearls: 68, silver: 10, gold: 17, drop: 13 },
    { name: 'Green shadow', pack: 2, comfort: 52, seed: 3167, moves: 31, goals: [[0, 21], [1, 20], [4, 14]], pearls: 72, silver: 10, gold: 17, drop: 6 },
    { name: 'Forest vents', pack: 2, comfort: 52, seed: 3229, moves: 32, goals: [[3, 22], [2, 20], [5, 16]], pearls: 78, silver: 11, gold: 18, drop: 14 },
    { name: 'Canopy fall', pack: 2, comfort: 52, seed: 3299, moves: 33, goals: [[1, 23], [4, 21], [0, 16]], pearls: 84, silver: 11, gold: 19, drop: 3 },
    { name: 'Sanctuary gate', pack: 3, comfort: 82, seed: 4109, moves: 33, goals: [[5, 24], [3, 22]], pearls: 92, silver: 11, gold: 19, drop: 15 },
    { name: 'Coral choir', pack: 3, comfort: 82, seed: 4171, moves: 34, goals: [[0, 24], [2, 23], [4, 18]], pearls: 100, silver: 12, gold: 20, drop: 9 },
    { name: 'Pearl current', pack: 3, comfort: 82, seed: 4237, moves: 35, goals: [[1, 25], [5, 24], [3, 18]], pearls: 108, silver: 12, gold: 21, drop: 11 },
    { name: 'Coral sanctuary', pack: 3, comfort: 82, seed: 4297, moves: 36, goals: [[2, 26], [0, 25], [4, 20]], pearls: 120, silver: 13, gold: 22, drop: 0 }
  ];
  var LEVEL_VARIANTS = [
    { type: 'open reef', obstacles: 0, hint: 'Build your first current.' },
    { type: 'open reef', obstacles: 0, hint: 'Use a clean three-piece match.' },
    { type: 'dual current', obstacles: 0, hint: 'Split your matches between both goals.' },
    { type: 'dual current', obstacles: 0, hint: 'Finish both goals before the current runs out.' },
    { type: 'reef rocks', obstacles: 2, hint: 'Work around the reef rocks.' },
    { type: 'reef rocks', obstacles: 2, hint: 'The rocks block a straight path.' },
    { type: 'reef rocks', obstacles: 3, hint: 'Open space around the rocks with a power-up.' },
    { type: 'reef rocks', obstacles: 3, hint: 'Match both sides of the shelf.' },
    { type: 'kelp locks', obstacles: 4, hint: 'Kelp locks divide the board into lanes.' },
    { type: 'kelp locks', obstacles: 4, hint: 'Clear a family across the green lanes.' },
    { type: 'kelp locks', obstacles: 5, hint: 'Use the row sweep when a lane is crowded.' },
    { type: 'kelp locks', obstacles: 5, hint: 'A cascade can cross the forest.' },
    { type: 'sanctuary gates', obstacles: 6, hint: 'Choose a safe route through the gates.' },
    { type: 'sanctuary gates', obstacles: 6, hint: 'Pair a coral goal with a broad clear.' },
    { type: 'sanctuary gates', obstacles: 7, hint: 'Save Coral Bloom for the final family goal.' },
    { type: 'sanctuary finale', obstacles: 8, hint: 'Use every learned current to restore the sanctuary.' }
  ];
  LEVELS.forEach(function (level, index) { level.variant = LEVEL_VARIANTS[index]; });

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function int(n, fallback, a, b) { n = Number(n); if (!Number.isFinite(n)) n = fallback; return Math.round(clamp(n, a, b)); }
  function spring(t) { t = clamp(t, 0, 1); return clamp(1 - Math.exp(-6 * t) * Math.cos(10 * t), 0, 1.08); }
  function textIfChanged(obj, value) { var s = String(value); if (obj && obj.text !== s) obj.setText(s); }
  function colorIfChanged(obj, value) { if (obj && obj.style && obj.style.color !== value) obj.setColor(value); }
  function rounded(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function idOf(pointer) { var e = pointer && pointer.event; return e && e.pointerId != null ? e.pointerId : (pointer && pointer.id != null ? pointer.id : 0); }
  function hexCss(n) { return '#' + n.toString(16).padStart(6, '0'); }
  function finiteOr(value, fallback) { return Number.isFinite(Number(value)) ? Number(value) : fallback; }
  function rng(seed) {
    var a = seed | 0; return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function validId(list, value) { return list.some(function (item) { return item.id === value; }); }
  function defaultPowerups() {
    var out = {};
    POWERUPS.forEach(function (power) { out[power.id] = { unlocked: false, charges: 0 }; });
    return out;
  }
  function defaultProfile() {
    return { v: 2, pearls: 120, coral: 0, cleared: [], medals: {}, packs: [0], powerups: defaultPowerups(), textScale: 1, decor: [
      { id: 'seagrass', x: 0.22, y: 0.84 }, { id: 'bubble-vent', x: 0.78, y: 0.88 }
    ], fish: [{ id: 'tetras', feed: 0.52 }, { id: 'tetras', feed: 0.48 }], fed: 0.46 };
  }
  function cloneProfile() { return JSON.parse(JSON.stringify(defaultProfile())); }
  function validSave(o) {
    if (!o || (o.v !== 1 && o.v !== 2) || !Number.isInteger(o.pearls) || o.pearls < 0 || o.pearls > 999999 || (o.coral != null && (!Number.isInteger(o.coral) || o.coral < 0 || o.coral > 999999)) || !Number.isFinite(o.fed) || o.fed < 0 || o.fed > 1 || !Array.isArray(o.cleared) || !Array.isArray(o.decor) || !Array.isArray(o.fish) || !o.medals || typeof o.medals !== 'object' || Array.isArray(o.medals)) return false;
    if (o.cleared.length > LEVELS.length || o.decor.length > 24 || o.fish.length > 12) return false;
    for (var i = 0; i < o.cleared.length; i++) if (!Number.isInteger(o.cleared[i]) || o.cleared[i] < 0 || o.cleared[i] >= LEVELS.length || o.cleared.indexOf(o.cleared[i]) !== i) return false;
    for (i = 0; i < o.decor.length; i++) { var d = o.decor[i]; if (!d || !validId(DECOR, d.id) || !Number.isFinite(d.x) || !Number.isFinite(d.y) || d.x < 0 || d.x > 1 || d.y < 0 || d.y > 1) return false; }
    for (i = 0; i < o.fish.length; i++) { var f = o.fish[i]; if (!f || !validId(FISH, f.id) || !Number.isFinite(f.feed) || f.feed < 0 || f.feed > 1) return false; }
    var medalKeys = Object.keys(o.medals); for (i = 0; i < medalKeys.length; i++) if (!/^\d+$/.test(medalKeys[i]) || Number(medalKeys[i]) >= LEVELS.length || ['bronze', 'silver', 'gold'].indexOf(o.medals[medalKeys[i]]) < 0) return false;
    if (o.v === 2) {
      if (!Array.isArray(o.packs) || o.packs.some(function (pack) { return !Number.isInteger(pack) || pack < 0 || pack >= PACKS.length; }) || !o.powerups || typeof o.powerups !== 'object' || Array.isArray(o.powerups) || ![1, 1.15, 1.3].some(function (scale) { return o.textScale === scale; })) return false;
      for (i = 0; i < POWERUPS.length; i++) { var state = o.powerups[POWERUPS[i].id]; if (!state || typeof state !== 'object' || typeof state.unlocked !== 'boolean' || !Number.isInteger(state.charges) || state.charges < 0 || state.charges > 99) return false; }
    }
    return true;
  }

  function migrateProfile(saved) {
    var out = cloneProfile();
    if (validSave(saved)) {
      out = JSON.parse(JSON.stringify(saved));
      out.v = 2;
      out.coral = int(saved.coral, 0, 0, 999999);
      out.packs = Array.isArray(saved.packs) ? saved.packs.slice() : [0];
      out.powerups = defaultPowerups();
      POWERUPS.forEach(function (power) {
        var old = saved.powerups && saved.powerups[power.id];
        if (old && typeof old === 'object') out.powerups[power.id] = { unlocked: !!old.unlocked, charges: int(old.charges, 0, 0, 99) };
      });
      out.textScale = [1, 1.15, 1.3].indexOf(saved.textScale) >= 0 ? saved.textScale : 1;
    }
    if (out.packs.indexOf(0) < 0) out.packs.unshift(0);
    return out;
  }

  var Game = { phaser: null, scene: null };
  var kit = window.GGKit.create({
    slug: 'reef-tiles', orientation: 'portrait', validateSave: validSave,
    onPause: function () { if (Game.scene) { Game.scene.releaseInputs(); Game.scene.simAccumulator = 0; if (Game.scene.scene.isActive()) Game.scene.scene.pause(); } },
    onResume: function () { if (Game.scene) { Game.scene.simAccumulator = 0; if (Game.scene.scene.isPaused()) Game.scene.scene.resume(); Game.scene.renderAll(); } },
    onRestart: function () { if (Game.scene) Game.scene.restartLevel(); }
  });
  kit.audio.register({
    ambience: 'assets/reef-ambience.mp3', swap: 'assets/swap.mp3', match: 'assets/match.mp3',
    cascade: 'assets/cascade.mp3', feed: 'assets/feed.mp3', ui: 'assets/ui.mp3', reward: 'assets/reward.mp3',
    unlock: 'assets/unlock.mp3', invalid: 'assets/invalid.mp3', select: 'assets/ui.mp3',
    combo: 'assets/cascade.mp3', goal: 'assets/reward.mp3', meta: 'assets/reef-meta.mp3'
  });
  var prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) kit.juice.enabled = false;
  kit.registerPWA();
  kit.loader.show('REEF TILES');
  kit.loader.progress(0.25);
  var profile = migrateProfile(kit.save.get(cloneProfile()));
  function saveProfile() { kit.save.set(profile); }
  kit.input.readGamepads = function () { return window.navigator && navigator.getGamepads ? navigator.getGamepads() : []; };
  /* The old seedPointer() workaround wrote its own entries into
     kit.input.pointers so a canvas-level claim could not be overwritten by
     GGKit's window handler. It is gone: the kit now stores its pointer
     object before any subscriber runs, and this title reads its own
     pointerClaims map for zones, never the kit's. */

  function makeTexture(scene, key, w, h, painter) {
    if (scene.textures.exists(key)) return key;
    var baked = GGKit.hiDpi.canvas(w, h), tex = scene.textures.addCanvas(key, baked.canvas), ctx = baked.ctx; painter(ctx, w, h); tex.refresh(); return key;
  }
  var DESIGN_W = 390, DESIGN_H = 844, DPR = 1;
  function viewWidth(scene) { return scene.scale.width / DPR; }
  function viewHeight(scene) { return scene.scale.height / DPR; }
  function drawStar(ctx, x, y, r, color) {
    ctx.fillStyle = color; ctx.beginPath(); for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); ctx.fill();
  }
  function drawTileGlyph(ctx, type, x, y, s, color) {
    ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, s * 0.08); ctx.beginPath();
    if (type === 0) { ctx.arc(x, y, s * 0.28, 0, TAU); ctx.fill(); ctx.fillStyle = '#182238'; ctx.beginPath(); ctx.arc(x - s * .1, y - s * .1, s * .055, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(x + s * .1, y + s * .1, s * .055, 0, TAU); ctx.fill(); }
    else if (type === 1) drawStar(ctx, x, y, s * .34, color);
    else if (type === 2) { ctx.moveTo(x, y - s * .34); ctx.lineTo(x + s * .34, y); ctx.lineTo(x, y + s * .34); ctx.lineTo(x - s * .34, y); ctx.closePath(); ctx.fill(); }
    else if (type === 3) { ctx.moveTo(x, y - s * .38); ctx.bezierCurveTo(x + s * .34, y - s * .04, x + s * .25, y + s * .32, x, y + s * .36); ctx.bezierCurveTo(x - s * .25, y + s * .32, x - s * .34, y - s * .04, x, y - s * .38); ctx.fill(); }
    else if (type === 4) { for (var i2 = 0; i2 < 6; i2++) { var a2 = i2 * TAU / 6 - Math.PI / 2; ctx.lineTo(x + Math.cos(a2) * s * .34, y + Math.sin(a2) * s * .34); } ctx.closePath(); ctx.fill(); }
    else { rounded(ctx, x - s * .28, y - s * .28, s * .56, s * .56, s * .06); ctx.fill(); ctx.fillStyle = '#182238'; ctx.fillRect(x - s * .08, y - s * .23, s * .16, s * .46); }
  }

  function Scene() { Phaser.Scene.call(this, { key: 'reef-tiles' }); }
  Scene.prototype = Object.create(Phaser.Scene.prototype);
  Scene.prototype.constructor = Scene;

  Scene.prototype.create = function () {
    Game.scene = this;
    this.screen = 'start'; this.levelIndex = 0; this.level = null; this.phase = 'idle'; this.phaseT = 0; this.simAccumulator = 0; this.simClock = 0; this.viewClock = 0;
    this.notice = { text: '', time: 0 }; this.tutorial = { text: '', time: 0 }; this.boundary = null; this.pointerClaims = {}; this.keyLatch = {};
    this.shopTab = 0; this.shopPage = 0; this.selected = -1; this.candidate = -1; this.boardPointer = -1; this.drag = null; this.lastComfort = 0; this.forceLevelApplied = -1;
    this.mapFocus = 0; this.shopFocus = 0; this.keyboardOrigin = -1; this.pressedCell = -1; this.invalidCandidate = -1; this.invalidT = 0; this.selectorState = 'ready'; this.selectorT = 0; this.hintPair = null; this.idleFor = 0; this.feedSaveT = 0; this.juiceFrame = null; this.gamepadLatch = {}; this.duckT = 0; this.duckVolume = null;
    this.profile = profile; this.cells = []; this.goals = []; this.blocked = new Set(); this.rng = null; this.score = 0; this.moves = 0; this.chain = 0; this.runPearls = 0; this.matched = null; this.matchedTypes = {}; this.swapPair = null;
    this.food = []; this.fishModel = []; this.decorModel = []; this.tankRect = { x: 0, y: 0, w: 1, h: 1 };
    this.cameras.main.setZoom(DPR).centerOn(DESIGN_W / 2, DESIGN_H / 2);
    this.buildTextures(); this.buildView(); this.bindInput(); this.scale.on('resize', this.layout, this); this.layout(); this.loadTankModels(); this.applyProbeForces();
    kit.loader.progress(1); kit.loader.hide(); kit.audio.music('ambience', 300); if (this.forcedLevel >= 0) this.showLevelStart(); else this.showStart(); this.events.once('shutdown', this.shutdownScene, this); this.renderAll();
  };

  Scene.prototype.buildTextures = function () {
    this.pixelTexture = makeTexture(this, 'rt-pixel', 4, 4, function (ctx) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 4, 4); });
    this.sparkTexture = makeTexture(this, 'rt-spark', 12, 12, function (ctx) { ctx.fillStyle = '#ffffff'; drawStar(ctx, 6, 6, 6, '#ffffff'); });
    this.ringTexture = makeTexture(this, 'rt-ring', 30, 30, function (ctx) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(15, 15, 11, 0, TAU); ctx.stroke(); });
    this.backdrops = PACKS.map(function (pack, index) { return makeTexture(this, 'rt-backdrop-' + index, 390, 844, function (ctx, w, h) { var g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, index === 3 ? '#34234f' : index === 2 ? '#092f45' : '#092c42'); g.addColorStop(.55, pack.tint); g.addColorStop(1, '#071827'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = .12; ctx.strokeStyle = '#c4f6ff'; ctx.lineWidth = 3; for (var x = -h; x < w + h; x += 74) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + h * .34, h); ctx.stroke(); } ctx.globalAlpha = .14; ctx.fillStyle = pack.accent; for (var b = 0; b < 12; b++) { var bx = (b * 71 + index * 29) % w, by = h * (.16 + (b % 5) * .12); ctx.beginPath(); ctx.arc(bx, by, 8 + (b % 3) * 5, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1; }); }, this);
  };

  Scene.prototype.buildView = function () {
    this.background = this.add.image(0, 0, this.pixelTexture).setOrigin(0, 0).setDepth(0);
    this.mapLayer = this.add.container(0, 0).setDepth(5); this.levelLayer = this.add.container(0, 0).setDepth(10); this.tankLayer = this.add.container(0, 0).setDepth(10); this.shopLayer = this.add.container(0, 0).setDepth(10); this.uiLayer = this.add.container(0, 0).setDepth(50);
    this.boardImage = this.add.image(0, 0, this.pixelTexture).setOrigin(0, 0); this.levelLayer.add(this.boardImage);
    this.boardViews = []; for (var i = 0; i < CELLS; i++) this.boardViews.push(this.makeTileView());
    this.clearFx = this.add.particles(0, 0, 'rt-pixel', { speed: { min: 65, max: 170 }, angle: { min: 0, max: 360 }, lifespan: 380, scale: { start: 1.4, end: 0 }, alpha: { start: .9, end: 0 }, emitting: false, maxAliveParticles: 32 });
    this.cascadeFx = this.add.particles(0, 0, 'rt-spark', { speed: { min: 95, max: 250 }, angle: { min: 220, max: 320 }, lifespan: 560, scale: { start: 1, end: 0 }, alpha: { start: .9, end: 0 }, emitting: false, maxAliveParticles: 28 });
    this.rewardFx = this.add.particles(0, 0, 'rt-ring', { speed: { min: 75, max: 210 }, angle: { min: 200, max: 340 }, lifespan: 900, scale: { start: .8, end: 0 }, alpha: { start: .8, end: 0 }, emitting: false, maxAliveParticles: 24 });
    this.tankFeedFx = this.add.particles(0, 0, 'rt-spark', { speed: { min: 45, max: 120 }, angle: { min: 210, max: 330 }, lifespan: 500, scale: { start: .8, end: 0 }, alpha: { start: .8, end: 0 }, emitting: false, maxAliveParticles: 16 });
    this.clearFx.setDepth(20); this.cascadeFx.setDepth(21); this.rewardFx.setDepth(60);
    this.levelLayer.add([this.clearFx, this.cascadeFx]);
    this.obstacleViews = []; for (i = 0; i < 12; i++) this.obstacleViews.push(this.makeObstacleView());
    this.selectorView = this.makeSelectorView();
    this.previewGhost = this.makePreviewGhost();
    this.tankImage = this.add.image(0, 0, this.pixelTexture).setOrigin(0, 0); this.tankLayer.add(this.tankImage); this.tankLayer.add(this.tankFeedFx); this.shimmers = []; for (i = 0; i < 5; i++) { var shimmer = this.add.rectangle(0, 0, 120, 3, 0xc4f6ff, .12).setOrigin(.5); this.tankLayer.add(shimmer); this.shimmers.push(shimmer); }
    this.tankCoralViews = []; for (i = 0; i < 6; i++) this.tankCoralViews.push(this.makeCoralView());
    this.tankDecorViews = []; for (i = 0; i < 24; i++) this.tankDecorViews.push(this.makeDecorView());
    this.fishViews = []; for (i = 0; i < 12; i++) this.fishViews.push(this.makeFishView());
    this.foodViews = []; for (i = 0; i < 10; i++) { var food = this.add.ellipse(0, 0, 9, 9, COLOR.sun, 1).setVisible(false); this.tankLayer.add(food); this.foodViews.push(food); }
    this.bubbleViews = []; for (i = 0; i < 24; i++) { var bubble = this.add.ellipse(0, 0, 7, 7, 0x9fe9f5, 0).setStrokeStyle(1.5, 0xcff8ff, .6).setVisible(false); this.tankLayer.add(bubble); this.bubbleViews.push(bubble); }
    this.buildUI();
    this.startOverlay = this.makeBoundary('start'); this.resultOverlay = this.makeBoundary('result'); this.levelStartOverlay = this.makeBoundary('level'); this.unlockOverlay = this.makeBoundary('unlock');
    this.mapLayer.setVisible(false); this.levelLayer.setVisible(false); this.tankLayer.setVisible(false); this.shopLayer.setVisible(false);
  };

  Scene.prototype.makeTileView = function () {
    var root = this.add.container(0, 0).setVisible(false), shadow = this.add.ellipse(0, 5, 36, 14, 0x0b1020, .42).setOrigin(.5);
    var circle = this.add.ellipse(0, 0, 38, 38, COLOR.coral, 1).setOrigin(.5); var diamond = this.add.polygon(0, 0, [0, -21, 21, 0, 0, 21, -21, 0], COLOR.leaf, 1).setOrigin(.5); var star = this.add.polygon(0, 0, [0, -22, 6, -7, 21, -7, 10, 3, 14, 19, 0, 10, -14, 19, -10, 3, -21, -7, -6, -7], COLOR.sun, 1).setOrigin(.5); var drop = this.add.polygon(0, 0, [0, -23, 17, -2, 13, 13, 0, 21, -13, 13, -17, -2], COLOR.tide, 1).setOrigin(.5); var hex = this.add.polygon(0, 0, [-16, -10, 0, -20, 16, -10, 16, 10, 0, 20, -16, 10], COLOR.plum, 1).setOrigin(.5); var square = this.add.rectangle(0, 0, 38, 38, COLOR.ember, 1).setOrigin(.5);
    var shapes = [circle, star, diamond, drop, hex, square]; var highlight = this.add.ellipse(-7, -9, 13, 5, COLOR.paper, .25).setOrigin(.5); var ring = this.add.ellipse(0, 0, 48, 48, COLOR.warning, 0).setOrigin(.5).setStrokeStyle(3, COLOR.warning, 1).setVisible(false); var glyph = this.add.text(0, 1, '', { fontFamily: FONT, fontSize: '18px', color: '#182238', fontStyle: 'bold' }).setOrigin(.5);
    root.add([shadow].concat(shapes, [highlight, ring, glyph])); this.levelLayer.add(root); return { root: root, shadow: shadow, shapes: shapes, highlight: highlight, ring: ring, glyph: glyph, pop: 0, dropT: 0, dropFrom: 0 };
  };

  Scene.prototype.makeObstacleView = function () {
    var root = this.add.container(0, 0).setVisible(false), rock = this.add.ellipse(0, 4, 38, 30, 0x53627a, 1).setOrigin(.5), ridge = this.add.polygon(0, -3, [-15, 5, -9, -14, 0, -20, 10, -10, 17, 5, 7, 12, -7, 13], 0x7788a1, 1).setOrigin(.5), mark = this.add.text(0, 1, '×', { fontFamily: FONT, fontSize: '20px', color: '#dbe4f7', fontStyle: 'bold' }).setOrigin(.5);
    root.add([rock, ridge, mark]); this.levelLayer.add(root); return { root: root, rock: rock, ridge: ridge, mark: mark };
  };

  Scene.prototype.makeSelectorView = function () {
    var root = this.add.container(0, 0).setVisible(false), ring = this.add.ellipse(0, 0, 58, 58, COLOR.warning, 0).setOrigin(.5).setStrokeStyle(3, COLOR.warning, 1), arrow = this.add.text(0, -31, '⌄', { fontFamily: FONT, fontSize: '18px', color: '#ffe9a8', fontStyle: 'bold' }).setOrigin(.5), label = this.add.text(0, 31, 'READY', { fontFamily: FONT, fontSize: '9px', color: '#ffe9a8', fontStyle: 'bold' }).setOrigin(.5);
    root.add([ring, arrow, label]); this.levelLayer.add(root); return { root: root, ring: ring, arrow: arrow, label: label };
  };

  Scene.prototype.makePreviewGhost = function () {
    var root = this.add.container(0, 0).setVisible(false), ghost = this.add.ellipse(0, 0, 44, 44, COLOR.good, .18).setOrigin(.5).setStrokeStyle(2, COLOR.good, .95), hatch = this.add.text(0, 0, '///', { fontFamily: FONT, fontSize: '12px', color: '#ff8a86', fontStyle: 'bold' }).setOrigin(.5);
    root.add([ghost, hatch]); this.levelLayer.add(root); return { root: root, ghost: ghost, hatch: hatch };
  };

  Scene.prototype.makeCoralView = function () {
    var root = this.add.container(0, 0).setVisible(false), stem = this.add.rectangle(0, 10, 5, 26, 0xe75e71, 1).setOrigin(.5), left = this.add.polygon(-8, -5, [0, 12, -5, -12, 0, -22, 5, -12], 0xf25c68, 1).setOrigin(.5), right = this.add.polygon(8, -8, [0, 14, -5, -8, 0, -25, 5, -8], 0xef8893, 1).setOrigin(.5);
    root.add([stem, left, right]); this.tankLayer.add(root); return { root: root, stem: stem, left: left, right: right };
  };

  Scene.prototype.makeDecorView = function () {
    var root = this.add.container(0, 0).setVisible(false), glow = this.add.ellipse(0, 0, 50, 30, 0x7ee49b, .1).setOrigin(.5), stem = this.add.rectangle(0, 8, 8, 34, 0x4f9d69, 1).setOrigin(.5), crown = this.add.polygon(0, -12, [0, -30, 12, -10, 27, -16, 17, 3, 30, 9, 7, 10, -5, 28, -12, 7, -29, 12, -16, -4, -28, -10], 0xf25c68, 1).setOrigin(.5), rock = this.add.ellipse(0, 6, 54, 26, 0xa86f4c, 1).setOrigin(.5), arch = this.add.arc(0, 3, 24, 180, 360, false, 0xd77960, 1).setOrigin(.5).setScale(1, .72), vent = this.add.ellipse(0, 0, 28, 15, 0x9fe9f5, .9).setOrigin(.5), icon = this.add.text(0, -29, '', { fontFamily: FONT, fontSize: '18px', color: '#f7fbff', fontStyle: 'bold' }).setOrigin(.5);
    root.add([glow, stem, crown, rock, arch, vent, icon]); this.tankLayer.add(root); return { root: root, glow: glow, stem: stem, crown: crown, rock: rock, arch: arch, vent: vent, icon: icon };
  };

  Scene.prototype.makeFishView = function () {
    var root = this.add.container(0, 0).setVisible(false), shadow = this.add.ellipse(0, 9, 42, 9, 0x061b29, .25).setOrigin(.5), body = this.add.ellipse(0, 0, 42, 24, COLOR.sun, 1).setOrigin(.5), tail = this.add.triangle(-22, 0, 0, -12, 0, 12, -18, 0, COLOR.sun, 1).setOrigin(.5), eye = this.add.ellipse(11, -4, 5, 5, COLOR.ink, 1).setOrigin(.5), stripe = this.add.rectangle(0, 0, 5, 20, COLOR.paper, .55).setOrigin(.5), bubble = this.add.ellipse(24, -19, 7, 7, 0x9fe9f5, 0).setStrokeStyle(1.5, 0xcff8ff, .7).setOrigin(.5);
    root.add([shadow, tail, body, stripe, eye, bubble]); this.tankLayer.add(root); return { root: root, shadow: shadow, body: body, tail: tail, eye: eye, stripe: stripe, bubble: bubble };
  };

  Scene.prototype.buildUI = function () {
    var self = this;
    this.hud = this.add.container(0, 0); this.uiLayer.add(this.hud);
    this.titleText = this.add.text(0, 0, 'REEF TILES', { fontFamily: FONT, fontSize: '20px', color: '#f7fbff', fontStyle: 'bold' }).setOrigin(0, .5); this.hud.add(this.titleText);
    this.pearlText = this.add.text(0, 0, '◈ 120', { fontFamily: FONT, fontSize: '16px', color: '#f7c948', fontStyle: 'bold' }).setOrigin(0, .5); this.hud.add(this.pearlText);
    this.coralText = this.add.text(0, 0, '✿ 0', { fontFamily: FONT, fontSize: '16px', color: '#ff8f9d', fontStyle: 'bold' }).setOrigin(0, .5); this.hud.add(this.coralText);
    this.comfortText = this.add.text(0, 0, '♡ 0', { fontFamily: FONT, fontSize: '16px', color: '#7ee49b', fontStyle: 'bold' }).setOrigin(1, .5); this.hud.add(this.comfortText);
    this.scoreText = this.add.text(0, 0, 'SCORE 0', { fontFamily: FONT, fontSize: '13px', color: '#b9e9f5', fontStyle: 'bold' }).setOrigin(.5); this.hud.add(this.scoreText);
    this.comfortBar = this.add.rectangle(0, 0, 80, 7, COLOR.ink, 1).setOrigin(1, .5); this.comfortFill = this.add.rectangle(0, 0, 2, 5, COLOR.good, 1).setOrigin(1, .5); this.hud.add([this.comfortBar, this.comfortFill]);
    this.noticeText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '14px', color: '#f7fbff', fontStyle: 'bold', align: 'center' }).setOrigin(.5); this.noticeBg = this.add.rectangle(0, 0, 10, 30, COLOR.ink, .92).setOrigin(.5).setStrokeStyle(1, COLOR.edge, .8); this.hud.add([this.noticeBg, this.noticeText]);
    this.tutorialText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '14px', color: '#b9e9f5', align: 'center' }).setOrigin(.5); this.tutorialBg = this.add.rectangle(0, 0, 10, 30, COLOR.board, .75).setOrigin(.5); this.hud.add([this.tutorialBg, this.tutorialText]);
    this.gear = this.add.text(0, 0, '⚙', { fontFamily: FONT, fontSize: '24px', color: '#dbe4f7' }).setOrigin(.5); this.gearHit = this.add.rectangle(0, 0, 48, 48, COLOR.ink, 0).setOrigin(.5).setInteractive(); this.gear.setData('action', function () { self.openSettings(); }); this.gearHit.setData('action', function () { self.openSettings(); }); this.uiLayer.add([this.gearHit, this.gear]);
    this.nav = []; [['◈', 'PLAY', 'map'], ['◉', 'TANK', 'tank'], ['✦', 'SHOP', 'shop']].forEach(function (entry) { var b = self.makeButton(entry[0], entry[1], function () { self.go(entry[2]); }, 78, 70); self.nav.push(b); self.uiLayer.add(b.root); });
    this.mapCards = []; for (var i = 0; i < LEVELS.length; i++) { var card = self.makeMapCard(i); self.mapCards.push(card); self.mapLayer.add(card.root); }
    this.shopTabButtons = [self.makeButton('♢', 'DECOR', function () { self.shopTab = 0; self.shopPage = 0; self.renderAll(); }, 150, 50), self.makeButton('◉', 'FISH', function () { self.shopTab = 1; self.shopPage = 0; self.renderAll(); }, 150, 50)]; this.shopTabButtons.forEach(function (b) { self.shopLayer.add(b.root); });
    this.shopCards = []; for (i = 0; i < 8; i++) { var sc = self.makeShopCard(); self.shopCards.push(sc); self.shopLayer.add(sc.root); }
    this.shopPrev = self.makeButton('‹', 'PREV', function () { self.shopPage = Math.max(0, self.shopPage - 1); self.renderAll(); }, 88, 50); this.shopNext = self.makeButton('›', 'NEXT', function () { self.shopPage += 1; self.renderAll(); }, 88, 50); this.shopLayer.add([this.shopPrev.root, this.shopNext.root]);
    this.feedButton = self.makeButton('●', 'FEED', function () { self.dropFood(.5, .45); }, 92, 54); this.tankLayer.add(this.feedButton.root);
    this.powerButtons = POWERUPS.map(function (power, index) { var b = self.makeButton(power.icon, power.name.toUpperCase(), function () { self.activatePowerup(index); }, 88, 46); self.uiLayer.add(b.root); return b; });
  };

  Scene.prototype.makeButton = function (icon, label, action, w, h) {
    var root = this.add.container(0, 0), bg = this.add.rectangle(0, 0, w, h, COLOR.board, 1).setOrigin(0).setStrokeStyle(2, COLOR.edge, 1).setInteractive();
    var iconText = this.add.text(w / 2, h * .32, icon, { fontFamily: FONT, fontSize: '20px', color: '#f7fbff', fontStyle: 'bold' }).setOrigin(.5); var labelText = this.add.text(w / 2, h * .72, label, { fontFamily: FONT, fontSize: '14px', color: '#dbe4f7', fontStyle: 'bold' }).setOrigin(.5);
    root.add([bg, iconText, labelText]); bg.setData('action', action); bg.setData('root', root); return { root: root, bg: bg, icon: iconText, label: labelText, w: w, h: h };
  };

  Scene.prototype.makeMapCard = function (index) {
    var root = this.add.container(0, 0), bg = this.add.rectangle(0, 0, 84, 62, COLOR.board, 1).setOrigin(0).setStrokeStyle(2, COLOR.edge, 1).setInteractive();
    var number = this.add.text(42, 22, String(index + 1), { fontFamily: FONT, fontSize: '20px', color: '#f7fbff', fontStyle: 'bold' }).setOrigin(.5); var medal = this.add.text(42, 48, '· · ·', { fontFamily: FONT, fontSize: '15px', color: '#657998', fontStyle: 'bold' }).setOrigin(.5); var pack = this.add.text(5, 6, '', { fontFamily: FONT, fontSize: '10px', color: '#b9e9f5', fontStyle: 'bold' }).setOrigin(0);
    root.add([bg, number, medal, pack]); bg.setData('levelIndex', index); bg.setData('root', root); return { root: root, bg: bg, number: number, medal: medal, pack: pack, w: 84, h: 62 };
  };

  Scene.prototype.makeShopCard = function () {
    var root = this.add.container(0, 0), bg = this.add.rectangle(0, 0, 178, 76, COLOR.board, 1).setOrigin(0).setStrokeStyle(2, COLOR.edge, 1).setInteractive(); var icon = this.add.text(27, 38, '', { fontFamily: FONT, fontSize: '25px', color: '#f7c948', fontStyle: 'bold' }).setOrigin(.5); var name = this.add.text(52, 20, '', { fontFamily: FONT, fontSize: '14px', color: '#f7fbff', fontStyle: 'bold' }).setOrigin(0, .5); var meta = this.add.text(52, 48, '', { fontFamily: FONT, fontSize: '14px', color: '#b9e9f5', fontStyle: 'bold' }).setOrigin(0, .5); root.add([bg, icon, name, meta]); bg.setData('shopCard', true); bg.setData('root', root); return { root: root, bg: bg, icon: icon, name: name, meta: meta, w: 178, h: 76, item: null };
  };

  Scene.prototype.makeBoundary = function (kind) {
    var root = this.add.container(0, 0).setDepth(100).setVisible(false), dim = this.add.rectangle(0, 0, 10, 10, COLOR.ink, .86).setOrigin(0), card = this.add.rectangle(0, 0, 330, 260, COLOR.board, 1).setOrigin(.5).setStrokeStyle(2, COLOR.edge, 1), title = this.add.text(0, -82, '', { fontFamily: FONT, fontSize: '25px', color: '#f7fbff', fontStyle: 'bold', align: 'center' }).setOrigin(.5), sub = this.add.text(0, -28, '', { fontFamily: FONT, fontSize: '15px', color: '#b9e9f5', align: 'center', wordWrap: { width: 276 } }).setOrigin(.5), detail = this.add.text(0, 42, '', { fontFamily: FONT, fontSize: '17px', color: '#f7c948', fontStyle: 'bold', align: 'center', wordWrap: { width: 276 } }).setOrigin(.5), action = this.add.rectangle(0, 92, 220, 50, COLOR.sun, 1).setOrigin(.5).setStrokeStyle(2, COLOR.paper, .6).setInteractive(), actionText = this.add.text(0, 92, '', { fontFamily: FONT, fontSize: '16px', color: '#182238', fontStyle: 'bold' }).setOrigin(.5);
    root.add([dim, card, title, sub, detail, action, actionText]); action.setData('boundary', kind); action.setData('root', root); return { root: root, dim: dim, card: card, title: title, sub: sub, detail: detail, action: action, actionText: actionText, kind: kind };
  };

  Scene.prototype.bindInput = function () {
    this.input.on('gameobjectdown', function (pointer, object) {
      var action = object.getData('action'); if (action && !kit.paused) { kit.audio.sfx('ui'); action(); return; }
      var li = object.getData('levelIndex'); if (li !== undefined && !kit.paused) { this.chooseLevel(li); return; }
      var item = object.getData('shopItem'); if (item && !kit.paused) { this.buyItem(item); return; }
      var boundary = object.getData('boundary'); if (boundary && !kit.paused) { this.boundaryAction(boundary); }
    }, this);
    this.input.on('pointerdown', this.onPointerDown, this); this.input.on('pointermove', this.onPointerMove, this); this.input.on('pointerup', this.onPointerUp, this); this.input.on('pointercancel', this.onPointerCancel, this);
  };
  Scene.prototype.point = function (pointer) { return { x: pointer.x, y: pointer.y }; };
  Scene.prototype.onPointerDown = function (pointer) {
    if (kit.paused) return; var id = idOf(pointer), p = this.point(pointer); this.pointerClaims[id] = { zone: 'world', startX: p.x, startY: p.y, x: p.x, y: p.y };
    if (this.screen === 'level' && !this.boundary && this.phase === 'play') { var cell = this.cellAt(p.x, p.y); if (cell >= 0 && this.boardPointer < 0) { this.boardPointer = id; this.pressedCell = cell; this.idleFor = 0; this.hintPair = null; if (this.selected >= 0 && this.adjacent(this.selected, cell)) this.attemptSwap(this.selected, cell); else { this.selected = cell; this.candidate = -1; this.keyboardOrigin = -1; this.selectorState = 'ready'; } } }
    else if (this.screen === 'tank' && !this.boundary && this.inTank(p.x, p.y)) { var d = this.hitDecor(p.x, p.y); if (d) { this.drag = { id: id, decor: d }; } else this.pointerClaims[id].zone = 'tank'; }
  };
  Scene.prototype.onPointerMove = function (pointer) {
    if (kit.paused) return; var id = idOf(pointer), claim = this.pointerClaims[id], p = this.point(pointer); if (!claim) return; claim.x = p.x; claim.y = p.y;
    if (this.screen === 'level' && claim.zone === 'world' && this.boardPointer === id && this.phase === 'play' && this.selected >= 0) { var cell = this.cellAt(p.x, p.y); if (cell >= 0 && this.adjacent(this.selected, cell)) { this.candidate = cell; this.selectorState = this.previewLegal(this.selected, cell) ? 'preview' : 'invalid'; } else { this.candidate = -1; this.selectorState = 'ready'; } }
    if (this.screen === 'tank' && this.drag && this.drag.id === id) { var r = this.tankRect; this.drag.decor.x = clamp((p.x - r.x) / r.w, .06, .94); this.drag.decor.y = clamp((p.y - r.y) / r.h, .38, .95); }
  };
  Scene.prototype.onPointerUp = function (pointer) {
    var id = idOf(pointer), claim = this.pointerClaims[id], p = this.point(pointer); if (!claim) return;
    if (this.screen === 'level' && this.boardPointer === id && this.phase === 'play' && this.candidate >= 0 && this.cellAt(p.x, p.y) >= 0) this.attemptSwap(this.selected, this.candidate);
    if (this.screen === 'tank' && this.drag && this.drag.id === id) { this.drag = null; saveProfile(); }
    delete this.pointerClaims[id]; if (this.boardPointer === id) this.boardPointer = -1; this.pressedCell = -1; if (this.screen === 'level' && this.phase === 'play' && this.candidate >= 0) this.candidate = -1;
  };
  Scene.prototype.onPointerCancel = function (pointer) { var id = idOf(pointer); if (this.drag && this.drag.id === id) this.drag = null; delete this.pointerClaims[id]; if (this.boardPointer === id) this.boardPointer = -1; this.pressedCell = -1; this.candidate = -1; };
  Scene.prototype.releaseInputs = function () { this.pointerClaims = {}; this.boardPointer = -1; this.drag = null; this.selected = -1; this.candidate = -1; this.keyboardOrigin = -1; this.pressedCell = -1; this.keyLatch = {}; kit.input.clearAll(); };

  Scene.prototype.layout = function () {
    var w = Math.max(280, viewWidth(this) || 390), h = Math.max(500, viewHeight(this) || 844), navH = 80, navY = h - navH;
    var boardY = 234, boardSize = Math.min(w - 28, 366, Math.max(160, navY - boardY - 26));
    this.W = w; this.H = h; this.navY = navY; this.boardGeo = { x: (w - boardSize) / 2, y: boardY, size: boardSize, cell: boardSize / COLS };
    this.tankRect = { x: 16, y: 124, w: w - 32, h: Math.max(220, navY - 148) };
    this.background.setDisplaySize(w, h); this.gear.setPosition(w - 28, 28); this.gearHit.setPosition(w - 28, 28); this.comfortBar.setPosition(w - 100, 50); this.comfortFill.setPosition(w - 100, 50); this.comfortText.setPosition(w - 16, 28); this.titleText.setPosition(16, 28);
    this.pearlText.setPosition(Math.min(126, w * .34), 28); this.coralText.setPosition(Math.min(194, w * .54), 28); this.scoreText.setPosition(w / 2, 78);
    this.noticeBg.setPosition(w - Math.min(84, w / 2), 78); this.noticeText.setPosition(w - Math.min(84, w / 2), 78); this.noticeBg.setDisplaySize(Math.min(166, w - 32), 30); this.tutorialBg.setPosition(w / 2, 112); this.tutorialText.setPosition(w / 2, 112); this.tutorialBg.setDisplaySize(Math.min(360, w - 24), 48);
    this.nav.forEach(function (b, i) { var slot = (w - 24) / 3, bw = slot - 8; b.root.setPosition(8 + i * slot, navY + 5); b.bg.setDisplaySize(bw, 70); b.icon.setX(bw / 2); b.label.setX(bw / 2); });
    var cardW = Math.floor((w - 34) / 4), cardH = 62; this.mapCards.forEach(function (c, i) { var col = i % 4, row = Math.floor(i / 4); c.root.setPosition(10 + col * (cardW + 4), 150 + row * 69); c.bg.setDisplaySize(cardW, cardH); c.number.setX(cardW / 2); c.medal.setX(cardW / 2); c.pack.setX(5); });
    this.shopTabButtons[0].root.setPosition(12, 86); this.shopTabButtons[1].root.setPosition(w - 162, 86); this.shopPrev.root.setPosition(12, navY - 58); this.shopNext.root.setPosition(w - 100, navY - 58);
    var shopCardH = Math.min(76, Math.max(44, (navY - 150 - 68 - 18) / 4)); this.shopCards.forEach(function (c, i) { var col = i % 2, row = Math.floor(i / 2), cw = (w - 28) / 2 - 6; c.root.setPosition(10 + col * ((w - 28) / 2), 150 + row * (shopCardH + 6)); c.bg.setDisplaySize(cw, shopCardH); c.icon.setX(Math.min(27, cw * .18)).setY(shopCardH / 2); c.name.setX(Math.min(52, cw * .32)).setY(shopCardH * .28); c.meta.setX(Math.min(52, cw * .32)).setY(shopCardH * .68); });
    this.powerButtons.forEach(function (b, i) { var bw = Math.min(88, (w - 32) / 3 - 4); b.root.setPosition(12 + i * ((w - 24) / 3), 174); b.bg.setDisplaySize(bw, 46); b.icon.setX(bw / 2); b.label.setX(bw / 2); });
    this.feedButton.root.setPosition(w - 108, this.tankRect.y + 14); this.feedButton.bg.setDisplaySize(92, 54);
    var frameKey = 'rt-board-' + Math.round(boardSize), self = this; this.boardImage.setTexture(makeTexture(this, frameKey, Math.ceil(boardSize + 24), Math.ceil(boardSize + 24), function (ctx, bw, bh) { ctx.fillStyle = '#0e1627'; rounded(ctx, 2, 2, bw - 4, bh - 4, 18); ctx.fill(); ctx.strokeStyle = '#e27e68'; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = '#243453'; rounded(ctx, 11, 11, bw - 22, bh - 22, 13); ctx.fill(); var cell = boardSize / 8; for (var yy = 0; yy < 8; yy++) for (var xx = 0; xx < 8; xx++) { ctx.fillStyle = (xx + yy) % 2 ? '#2d4162' : '#314567'; rounded(ctx, 11 + xx * cell + cell * .06, 11 + yy * cell + cell * .06, cell * .88, cell * .88, cell * .12); ctx.fill(); ctx.strokeStyle = '#536a8e'; ctx.lineWidth = 1; ctx.stroke(); } })); this.boardImage.setPosition(this.boardGeo.x - 12, boardY - 12).setDisplaySize(boardSize + 24, boardSize + 24);
    var tankKey = 'rt-tank-' + Math.round(this.tankRect.w) + '-' + Math.round(this.tankRect.h); this.tankImage.setTexture(makeTexture(this, tankKey, Math.ceil(this.tankRect.w), Math.ceil(this.tankRect.h), function (ctx, tw, th) { var g = ctx.createLinearGradient(0, 0, 0, th); g.addColorStop(0, '#177c9e'); g.addColorStop(.55, '#0b4b6d'); g.addColorStop(1, '#082b43'); ctx.fillStyle = g; ctx.fillRect(0, 0, tw, th); ctx.globalAlpha = .12; ctx.strokeStyle = '#c4f6ff'; ctx.lineWidth = 5; for (var x = -th; x < tw + th; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + th * .5, th); ctx.stroke(); } ctx.globalAlpha = 1; ctx.fillStyle = '#e0c58a'; ctx.fillRect(0, th - 34, tw, 34); ctx.strokeStyle = '#a86f4c'; ctx.lineWidth = 3; ctx.strokeRect(1, 1, tw - 2, th - 2); })); this.tankImage.setPosition(this.tankRect.x, this.tankRect.y).setDisplaySize(this.tankRect.w, this.tankRect.h);
    if (this.startOverlay) [this.startOverlay, this.resultOverlay, this.levelStartOverlay, this.unlockOverlay].forEach(function (o) { o.dim.setDisplaySize(w, h); o.root.setPosition(w / 2, h / 2); o.card.setDisplaySize(Math.min(330, w - 24), 280); o.sub.setWordWrapWidth(Math.min(276, w - 42)); o.detail.setWordWrapWidth(Math.min(276, w - 42)); o.action.setDisplaySize(Math.min(220, w - 40), 50); });
    this.applyTextScale(); this.renderAll();
  };

  Scene.prototype.syncScreenVisibility = function () {
    this.background.setVisible(true); this.mapLayer.setVisible(this.screen === 'map'); this.levelLayer.setVisible(this.screen === 'level'); this.tankLayer.setVisible(this.screen === 'tank'); this.shopLayer.setVisible(this.screen === 'shop'); this.hud.setVisible(this.screen !== 'start'); this.gear.setVisible(this.screen !== 'start'); this.gearHit.setVisible(this.screen !== 'start'); this.nav.forEach(function (b) { b.root.setVisible(this.screen !== 'start'); }, this);
    this.startOverlay.root.setVisible(!!this.boundary && this.boundary.overlay === this.startOverlay); this.levelStartOverlay.root.setVisible(!!this.boundary && this.boundary.overlay === this.levelStartOverlay); this.resultOverlay.root.setVisible(!!this.boundary && this.boundary.overlay === this.resultOverlay); this.unlockOverlay.root.setVisible(!!this.boundary && this.boundary.overlay === this.unlockOverlay); this.feedButton.root.setVisible(this.screen === 'tank' && !this.boundary); this.tankFeedFx.setVisible(this.screen === 'tank'); this.powerButtons.forEach(function (b) { b.root.setVisible(this.screen === 'level' && !this.boundary); }, this); this.shopTabButtons.forEach(function (b) { b.root.setVisible(this.screen === 'shop' && !this.boundary); }, this); this.shopPrev.root.setVisible(this.screen === 'shop' && !this.boundary); this.shopNext.root.setVisible(this.screen === 'shop' && !this.boundary);
  };

  Scene.prototype.showStart = function () { this.screen = 'start'; this.boundary = { overlay: this.startOverlay, action: 'start' }; this.startOverlay.title.setText('REEF TILES'); this.startOverlay.sub.setText('Match bright reef pieces, then grow a living tank.'); this.startOverlay.detail.setText('16 seeded levels  •  coral collection  •  all rewards earned'); this.startOverlay.actionText.setText('PLAY'); this.syncScreenVisibility(); };
  Scene.prototype.showLevelStart = function () { var cfg = LEVELS[this.levelIndex], goals = cfg.goals.map(function (g) { return TILE[g[0]].glyph + ' ' + g[1]; }).join('   '); this.boundary = { overlay: this.levelStartOverlay, action: 'begin' }; this.levelStartOverlay.title.setText('LEVEL ' + String(this.levelIndex + 1).padStart(2, '0')); this.levelStartOverlay.sub.setText(PACKS[cfg.pack].name + '  •  ' + cfg.name + '\n' + cfg.variant.type); this.levelStartOverlay.detail.setText(goals + '\n' + cfg.moves + ' moves  •  ' + cfg.variant.hint); this.levelStartOverlay.actionText.setText('START SWAP'); this.syncScreenVisibility(); };
  Scene.prototype.showResult = function (win) { var o = this.resultOverlay, cfg = LEVELS[this.levelIndex], medal = win ? this.medalForRun() : ''; this.boundary = { overlay: o, action: win ? 'win' : 'lose' }; o.title.setText(win ? (this.resultUnlock ? 'PACK UNLOCKED' : 'LEVEL CLEAR') : 'OUT OF MOVES'); o.sub.setText(win ? (medal.toUpperCase() + ' MEDAL  •  ' + cfg.name) : 'The reef is still waiting for this match.'); o.detail.setText(win ? ('+' + this.rewardPearls + ' pearls  •  ' + (this.rewardDecorGranted ? 'free ' + this.rewardDecorName : 'tank full  •  +' + this.rewardFallbackPearls + ' pearls') + '\nSCORE ' + this.score + '  •  ' + (this.resultUnlock ? PACKS[this.unlockPack].name + ' is open' : 'Next level is ready')) : 'Goals remain. Try the same seeded board again.'); o.actionText.setText(win ? (this.resultUnlock ? 'UNLOCK CEREMONY' : 'NEXT LEVEL') : 'RETRY'); this.syncScreenVisibility(); };
  Scene.prototype.showUnlock = function (packIndex) { var o = this.unlockOverlay; this.boundary = { overlay: o, action: 'unlock', pack: packIndex }; o.title.setText(PACKS[packIndex].name.toUpperCase()); o.sub.setText('Comfort ' + PACKS[packIndex].comfort + ' reached.'); o.detail.setText('New levels and richer tank life are open.\nNew power currents appear as coral grows.'); o.actionText.setText('EXPLORE'); this.syncScreenVisibility(); kit.audio.sfx('unlock'); if (kit.juice.enabled) this.rewardFx.explode(12, this.W / 2, this.H / 2); };
  Scene.prototype.boundaryAction = function (kind) { if (kind === 'start') { this.boundary = null; this.go('map'); } else if (kind === 'level') { this.beginLevel(); } else if (kind === 'result') { if (this.boundary.action === 'lose') this.restartLevel(); else if (this.resultUnlock) { this.showUnlock(this.unlockPack); } else if (this.levelIndex + 1 < LEVELS.length && this.levelUnlocked(this.levelIndex + 1)) this.startLevel(this.levelIndex + 1); else { this.boundary = null; this.go('map'); } } else if (kind === 'unlock') { this.boundary = null; this.go('map'); } this.syncScreenVisibility(); };

  Scene.prototype.go = function (screen) { this.releaseInputs(); this.boundary = null; this.screen = screen === 'map' ? 'map' : screen; if (screen === 'tank') { this.loadTankModels(); kit.audio.music('meta', 500); } else if (screen === 'level' || screen === 'map' || screen === 'shop') kit.audio.music('ambience', 500); if (screen === 'map' || screen === 'shop') this.phase = 'idle'; this.syncScreenVisibility(); this.renderAll(); };
  Scene.prototype.chooseLevel = function (index) { if (this.levelUnlocked(index) || this.forcedLevel === index) this.startLevel(index); else { this.setNotice('Comfort ' + LEVELS[index].comfort + ' + prior clear', 1.2); if (LEVELS[index].comfort > this.comfort()) this.go('tank'); } };
  Scene.prototype.startLevel = function (index) { index = int(index, 0, 0, LEVELS.length - 1); if (!this.levelUnlocked(index) && this.forcedLevel !== index) { this.chooseLevel(index); return; } this.releaseInputs(); this.screen = 'level'; this.levelIndex = index; this.level = LEVELS[index]; this.rng = rng(this.level.seed); this.blocked = this.makeObstacles(this.level.variant.obstacles); this.cells = this.makeBoard(); this.goals = this.level.goals.map(function (g) { return { type: g[0], need: g[1], got: 0 }; }); this.moves = this.level.moves; this.score = 0; this.chain = 0; this.runPearls = 0; this.phase = 'boundary'; this.phaseT = 0; this.selected = -1; this.candidate = -1; this.keyboardOrigin = -1; this.invalidCandidate = -1; this.matched = null; this.matchedTypes = {}; this.resultUnlock = false; this.unlockPack = -1; this.hintPair = null; this.idleFor = 0; this.syncScreenVisibility(); this.showLevelStart(); };
  Scene.prototype.beginLevel = function () { this.boundary = null; this.phase = 'play'; this.phaseT = 0; this.selected = Math.floor(CELLS / 2); this.tutorial = { text: 'Match 3+ same symbols to fill the goals.\nSwipe or tap two neighbours. The glowing pair is a legal swap.', time: profile.cleared.length ? 0 : 6 }; this.hintPair = this.findLegalMove(this.cells); this.syncScreenVisibility(); };
  Scene.prototype.restartLevel = function () { this.boundary = null; this.startLevel(this.levelIndex); };

  Scene.prototype.makeBoard = function () {
    var out = new Array(CELLS), r = this.rng;
    for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) {
      var index = y * COLS + x; if (this.blocked.has(index)) { out[index] = -2; continue; }
      var t, guard = 0; do { t = Math.floor(r() * TILE.length); guard++; } while (guard < 30 && ((x > 1 && out[y * COLS + x - 1] === t && out[y * COLS + x - 2] === t) || (y > 1 && out[(y - 1) * COLS + x] === t && out[(y - 2) * COLS + x] === t))); out[index] = t;
    }
    if (!this.hasMoveFor(out)) for (var pass = 0; pass < 12 && !this.hasMoveFor(out); pass++) {
      for (var i = out.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); if (out[i] < 0 || out[j] < 0) continue; var q = out[i]; out[i] = out[j]; out[j] = q; }
    }
    if (!this.hasMoveFor(out)) { for (i = 0; i < CELLS; i++) if (!this.blocked.has(i)) out[i] = (i + Math.floor(i / COLS)) % TILE.length; if (!this.blocked.has(0)) out[0] = 0; if (!this.blocked.has(1)) out[1] = 1; if (!this.blocked.has(2)) out[2] = 0; if (!this.blocked.has(3)) out[3] = 0; }
    return out;
  };
  Scene.prototype.makeObstacles = function (count) { var blocked = new Set(), candidates = [10, 13, 18, 21, 28, 35, 38, 43, 46, 50, 53, 58]; for (var i = 0; i < candidates.length && blocked.size < count; i++) blocked.add(candidates[(i * 3 + this.levelIndex * 2) % candidates.length]); return blocked; };
  Scene.prototype.findLegalMove = function (cells) { var copy = cells.slice(), i, x, y, j, a, b; for (y = 0; y < ROWS; y++) for (x = 0; x < COLS; x++) { i = y * COLS + x; if (cells[i] < 0) continue; if (x < COLS - 1 && cells[i + 1] >= 0) { j = i + 1; a = copy[i]; b = copy[j]; copy[i] = b; copy[j] = a; if (this.findMatches(copy).set.size) return [i, j]; copy[i] = a; copy[j] = b; } if (y < ROWS - 1 && cells[i + COLS] >= 0) { j = i + COLS; a = copy[i]; b = copy[j]; copy[i] = b; copy[j] = a; if (this.findMatches(copy).set.size) return [i, j]; copy[i] = a; copy[j] = b; } } return null; };
  Scene.prototype.findMatches = function (cells) { var set = new Set(), runs = [], x, y, start, i, t; for (y = 0; y < ROWS; y++) { start = 0; for (x = 1; x <= COLS; x++) { t = x < COLS ? cells[y * COLS + x] : -1; if (x === COLS || t !== cells[y * COLS + start]) { if (cells[y * COLS + start] >= 0 && x - start >= 3) { var row = []; for (i = start; i < x; i++) { set.add(y * COLS + i); row.push(y * COLS + i); } runs.push(row); } start = x; } } } for (x = 0; x < COLS; x++) { start = 0; for (y = 1; y <= ROWS; y++) { t = y < ROWS ? cells[y * COLS + x] : -1; if (y === ROWS || t !== cells[start * COLS + x]) { if (cells[start * COLS + x] >= 0 && y - start >= 3) { var col = []; for (i = start; i < y; i++) { set.add(i * COLS + x); col.push(i * COLS + x); } runs.push(col); } start = y; } } } return { set: set, runs: runs }; };
  Scene.prototype.hasMoveFor = function (cells) { var copy = cells.slice(), i, x, y, j, a, b; for (y = 0; y < ROWS; y++) for (x = 0; x < COLS; x++) { i = y * COLS + x; if (cells[i] < 0) continue; if (x < COLS - 1 && cells[i + 1] >= 0) { j = i + 1; a = copy[i]; b = copy[j]; copy[i] = b; copy[j] = a; if (this.findMatches(copy).set.size) return true; copy[i] = a; copy[j] = b; } if (y < ROWS - 1 && cells[i + COLS] >= 0) { j = i + COLS; a = copy[i]; b = copy[j]; copy[i] = b; copy[j] = a; if (this.findMatches(copy).set.size) return true; copy[i] = a; copy[j] = b; } } return false; };
  Scene.prototype.cellAt = function (x, y) { var g = this.boardGeo, cx = Math.floor((x - g.x) / g.cell), cy = Math.floor((y - g.y) / g.cell); return cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS ? cy * COLS + cx : -1; };
  Scene.prototype.adjacent = function (a, b) { return a >= 0 && b >= 0 && ((a % COLS === b % COLS && Math.abs(Math.floor(a / COLS) - Math.floor(b / COLS)) === 1) || (Math.floor(a / COLS) === Math.floor(b / COLS) && Math.abs(a % COLS - b % COLS) === 1)); };
  Scene.prototype.previewLegal = function (a, b) { if (!this.adjacent(a, b) || this.cells[a] < 0 || this.cells[b] < 0) return false; var copy = this.cells.slice(), t = copy[a]; copy[a] = copy[b]; copy[b] = t; return this.findMatches(copy).set.size > 0; };
  Scene.prototype.attemptSwap = function (a, b) { if (this.phase !== 'play' || !this.adjacent(a, b)) return; this.idleFor = 0; this.hintPair = null; if (!this.previewLegal(a, b)) { this.setNotice('No match there. Try a glowing pair.', .85); kit.audio.sfx('invalid'); this.invalidCandidate = b; this.invalidT = .85; this.selectorState = 'invalid'; this.selectorT = 0; this.candidate = b; return; } this.swapPair = { a: a, b: b, typeA: this.cells[a], typeB: this.cells[b] }; var t = this.cells[a]; this.cells[a] = this.cells[b]; this.cells[b] = t; this.moves = Math.max(0, this.moves - 1); this.phase = 'swap'; this.phaseT = 0; this.selectorState = 'resolve'; this.selectorT = 0; this.selected = b; this.candidate = -1; this.keyboardOrigin = -1; kit.audio.sfx('swap'); };
  Scene.prototype.resolveSwap = function () { var hit = this.findMatches(this.cells); if (!hit.set.size) { var sp = this.swapPair, t = this.cells[sp.a]; this.cells[sp.a] = this.cells[sp.b]; this.cells[sp.b] = t; this.moves += 1; this.phase = 'rollback'; this.phaseT = 0; kit.audio.sfx('invalid'); return; } this.swapPair = null; this.consumeMatches(hit); };
  Scene.prototype.consumeMatches = function (hit) {
    var self = this; this.matched = hit.set; this.matchedTypes = {}; this.chain += 1; var count = hit.set.size;
    this.score += count * (90 + this.chain * 22); this.runPearls += Math.max(1, Math.floor(count / 3) + (this.chain > 1 ? 1 : 0));
    hit.set.forEach(function (index) {
      var type = self.cells[index]; self.matchedTypes[index] = type;
      for (var g = 0; g < self.goals.length; g++) if (self.goals[g].type === type) self.goals[g].got += 1;
      if (type === 0) profile.coral = Math.min(999999, profile.coral + 1);
      self.cells[index] = -1; var p = self.center(index); self.clearFx.explode(3, p.x, p.y);
    });
    var newly = this.updateUnlocks(); kit.audio.sfx(this.chain > 1 ? 'cascade' : 'match', { rate: 1 + Math.min(.3, this.chain * .04) });
    if (this.chain > 1 && kit.juice.enabled) this.cascadeFx.explode(Math.min(12, 4 + this.chain * 2), this.boardGeo.x + this.boardGeo.size / 2, this.boardGeo.y + this.boardGeo.size / 2);
    if (this.chain > 1) kit.audio.sfx('combo', { volume: .55, rate: 1 + Math.min(.25, this.chain * .03) });
    if (newly.length) { this.setNotice(newly.map(function (power) { return power.name + ' unlocked'; }).join('  •  '), 1.5); kit.audio.sfx('unlock'); }
    kit.juice.hitStop(this.chain > 2 ? 55 : 38); if (this.chain > 2) kit.juice.shake(3, 90); this.phase = 'clear'; this.phaseT = 0; this.selectorState = 'resolve'; this.selectorT = 0; saveProfile();
  };
  Scene.prototype.collapse = function () {
    var next = new Array(CELLS), r = this.rng, x, y, top, bottom, values, write, i;
    for (x = 0; x < COLS; x++) {
      bottom = ROWS - 1;
      while (bottom >= 0) {
        while (bottom >= 0 && this.blocked.has(bottom * COLS + x)) { next[bottom * COLS + x] = -2; bottom--; }
        if (bottom < 0) break;
        top = bottom; while (top >= 0 && !this.blocked.has(top * COLS + x)) top--; top++;
        values = []; for (y = bottom; y >= top; y--) if (this.cells[y * COLS + x] >= 0) values.push(this.cells[y * COLS + x]);
        write = bottom; for (i = 0; i < values.length; i++) { next[write * COLS + x] = values[i]; this.boardViews[write].dropFrom = bottom - i; this.boardViews[write].dropT = 0; write--; }
        while (write >= top) { next[write * COLS + x] = Math.floor(r() * TILE.length); this.boardViews[write].dropFrom = top - (top - write + 1); this.boardViews[write].dropT = 0; write--; }
        bottom = top - 1;
      }
    }
    this.cells = next; for (i = 0; i < CELLS; i++) if (this.cells[i] === undefined) this.cells[i] = this.blocked.has(i) ? -2 : Math.floor(r() * TILE.length);
    this.phase = 'drop'; this.phaseT = 0; this.matched = null; this.matchedTypes = {};
  };
  Scene.prototype.finishDrop = function () { var hit = this.findMatches(this.cells); if (hit.set.size) this.consumeMatches(hit); else { this.chain = 0; if (this.goals.every(function (g) { return g.got >= g.need; })) this.finishLevel(true); else if (this.moves <= 0) this.finishLevel(false); else if (!this.hasMoveFor(this.cells)) { this.shuffleBoard(); this.setNotice('Fresh current', .8); } else this.phase = 'play'; } };
  Scene.prototype.shuffleBoard = function () { var source = this.cells.slice(), r = this.rng, pass, values, i, j, t; for (pass = 0; pass < 20; pass++) { values = source.slice(); for (i = values.length - 1; i > 0; i--) { j = Math.floor(r() * (i + 1)); t = values[i]; values[i] = values[j]; values[j] = t; } if (!this.findMatches(values).set.size && this.hasMoveFor(values)) { this.cells = values; return; } } this.cells = this.makeBoard(); };
  Scene.prototype.updateUnlocks = function () {
    var newly = [], before = profile.packs.slice();
    for (var i = 0; i < PACKS.length; i++) if (this.comfort() >= PACKS[i].comfort && profile.packs.indexOf(i) < 0) profile.packs.push(i);
    POWERUPS.forEach(function (power) { var state = profile.powerups[power.id]; if (profile.coral >= power.unlock && !state.unlocked) { state.unlocked = true; state.charges = Math.max(1, state.charges); newly.push(power); } });
    if (before.length !== profile.packs.length || newly.length) saveProfile();
    return newly;
  };
  Scene.prototype.updatePackUnlock = function (beforeComfort, afterComfort) {
    var newly = -1;
    for (var i = 1; i < PACKS.length; i++) if (beforeComfort < PACKS[i].comfort && afterComfort >= PACKS[i].comfort) newly = i;
    for (i = 0; i < PACKS.length; i++) if (afterComfort >= PACKS[i].comfort && profile.packs.indexOf(i) < 0) profile.packs.push(i);
    return newly;
  };
  Scene.prototype.finishLevel = function (win) {
    this.phase = win ? 'win' : 'lose'; this.phaseT = 0;
    if (!win) { kit.audio.sfx('invalid'); this.showResult(false); return; }
    var before = this.comfort(), medal = this.medalForRun();
    this.rewardPearls = this.level.pearls + (medal === 'silver' ? 16 : medal === 'gold' ? 30 : 8) + Math.min(20, this.runPearls);
    this.rewardDecor = DECOR[this.level.drop] || DECOR[0]; this.rewardDecorName = this.rewardDecor.name; this.rewardDecorGranted = profile.decor.length < 24; this.rewardFallbackPearls = this.rewardDecorGranted ? 0 : 20;
    if (profile.cleared.indexOf(this.levelIndex) < 0) profile.cleared.push(this.levelIndex);
    var ranks = { bronze: 1, silver: 2, gold: 3 }; if (!profile.medals[this.levelIndex] || ranks[medal] > ranks[profile.medals[this.levelIndex]]) profile.medals[this.levelIndex] = medal;
    profile.pearls = Math.min(999999, profile.pearls + this.rewardPearls);
    if (this.rewardDecorGranted) profile.decor.push({ id: this.rewardDecor.id, x: .2 + (profile.decor.length % 4) * .2, y: .82 + (profile.decor.length % 3) * .035 }); else { profile.pearls = Math.min(999999, profile.pearls + this.rewardFallbackPearls); this.rewardPearls += this.rewardFallbackPearls; }
    this.updateUnlocks(); var rewardPower = POWERUPS[this.levelIndex % POWERUPS.length], rewardState = profile.powerups[rewardPower.id]; if (rewardState.unlocked) rewardState.charges = Math.min(99, rewardState.charges + 1); saveProfile(); this.loadTankModels(); var after = this.comfort(); this.unlockPack = this.updatePackUnlock(before, after); this.resultUnlock = this.unlockPack >= 0;
    if (this.resultUnlock) saveProfile(); kit.audio.sfx(this.resultUnlock ? 'unlock' : 'goal'); this.duckVolume = Number(kit.audio.prefs.music); this.duckT = 1.25; kit.audio.setMusicVolume(this.duckVolume * .38); if (kit.juice.enabled) this.rewardFx.explode(18, this.W / 2, this.H / 2); this.showResult(true);
  };
  Scene.prototype.medalForRun = function () { var remain = this.moves, bonus = this.runPearls, comfort = this.comfort(); if (remain >= this.level.gold || (bonus >= 12 && comfort >= this.level.comfort + 22)) return 'gold'; if (remain >= this.level.silver || bonus >= 8 || comfort >= this.level.comfort + 10) return 'silver'; return 'bronze'; };
  Scene.prototype.activatePowerup = function (index) {
    var power = POWERUPS[index], state = power && profile.powerups[power.id];
    if (!power || !state || !state.unlocked) { this.setNotice('Collect ' + (power ? power.unlock : 0) + ' coral to unlock this current.', 1.1); kit.audio.sfx('invalid'); return; }
    if (state.charges <= 0) { this.setNotice('Clear a level to earn another charge.', 1.1); kit.audio.sfx('invalid'); return; }
    if (this.screen !== 'level' || this.boundary || this.phase !== 'play' || this.selected < 0 || this.cells[this.selected] < 0) { this.setNotice('Select a tile first.', .9); kit.audio.sfx('invalid'); return; }
    var cells = [], row = Math.floor(this.selected / COLS), col = this.selected % COLS, i;
    if (power.kind === 'neighbors') cells = [this.selected, this.selected - 1, this.selected + 1, this.selected - COLS, this.selected + COLS];
    else if (power.kind === 'row') for (i = 0; i < COLS; i++) cells.push(row * COLS + i);
    else for (i = 0; i < CELLS; i++) if (this.cells[i] === this.cells[this.selected]) cells.push(i);
    cells = cells.filter(function (cell, pos, all) { return cell >= 0 && cell < CELLS && all.indexOf(cell) === pos && !this.blocked.has(cell) && this.cells[cell] >= 0; }, this);
    if (!cells.length) return;
    state.charges -= 1; this.keyboardOrigin = -1; this.candidate = -1; this.hintPair = null; this.idleFor = 0; this.selectorState = 'resolve'; this.selectorT = 0; this.setNotice(power.name + '  •  ' + power.desc, 1.2); kit.audio.sfx('goal'); this.consumeMatches({ set: new Set(cells) }); saveProfile();
  };

  Scene.prototype.loadTankModels = function () { this.decorModel = profile.decor.map(function (d) { return { id: validId(DECOR, d.id) ? d.id : 'seagrass', x: clamp(finiteOr(d.x, .5), .06, .94), y: clamp(finiteOr(d.y, .8), .38, .95) }; }); this.fishModel = profile.fish.map(function (f, i) { var def = FISH.find(function (x) { return x.id === f.id; }) || FISH[0]; return { id: def.id, x: .24 + (i % 4) * .18, y: .3 + Math.floor(i / 4) * .14, vx: .01, vy: 0, phase: i * 1.7, feed: clamp(finiteOr(f.feed, .4), 0, 1), bubble: 0, tailFrame: 0, hidden: 0 }; }); this.lastComfort = this.comfort(); this.syncProbe(); };
  Scene.prototype.comfort = function () { var n = 1 + finiteOr(profile.fed, .4) * 5; this.decorModel.forEach(function (d) { var def = DECOR.find(function (x) { return x.id === d.id; }); if (def) n += def.comfort; }); this.fishModel.forEach(function (f) { var def = FISH.find(function (x) { return x.id === f.id; }); if (def) n += def.comfort * .35 + f.feed * 2; }); var forced = Number(window.__rt && window.__rt.forceComfort); if (Number.isFinite(forced) && forced > 0) n = Math.max(n, forced); return int(n, 0, 0, 100); };
  Scene.prototype.inTank = function (x, y) { var r = this.tankRect; return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; };
  Scene.prototype.hitDecor = function (x, y) { var r = this.tankRect, best = null, bd = 999; this.decorModel.forEach(function (d) { var dx = r.x + d.x * r.w, dy = r.y + d.y * r.h, dist = Math.hypot(x - dx, y - dy); if (dist < bd && dist < 44) { bd = dist; best = d; } }); return best; };
  Scene.prototype.dropFood = function (nx, ny) { if (this.screen !== 'tank' || this.boundary || this.food.length >= 10) return; this.food.push({ x: clamp(nx, .08, .92), y: clamp(ny, .2, .72), vy: .06, life: 8 }); kit.audio.sfx('feed'); var r = this.tankRect; if (kit.juice.enabled) this.tankFeedFx.explode(4, r.x + nx * r.w, r.y + ny * r.h); profile.fed = clamp(finiteOr(profile.fed, .4) + .025, 0, 1); saveProfile(); };
  Scene.prototype.syncFishSave = function () { this.fishModel.forEach(function (fish, index) { if (profile.fish[index]) profile.fish[index].feed = clamp(finiteOr(fish.feed, .4), 0, 1); }); };
  Scene.prototype.updateTank = function (dt) {
    var r = this.tankRect, self = this, fedThisStep = false;
    for (var i = this.food.length - 1; i >= 0; i--) {
      var food = this.food[i]; food.y += food.vy * dt; food.vy += .035 * dt; food.life -= dt;
      if (food.life <= 0 || food.y > .92) food.y = Math.min(.92, food.y);
      var eaten = false; this.fishModel.forEach(function (f) { var def = FISH.find(function (x) { return x.id === f.id; }) || FISH[0], dx = f.x - food.x, dy = f.y - food.y;
        if (def.behavior === 'chase' || Math.hypot(dx, dy) < .12) { if (Math.hypot(dx, dy) < .08) { f.feed = clamp(f.feed + .16, 0, 1); profile.fed = clamp(profile.fed + .035, 0, 1); eaten = true; fedThisStep = true; kit.audio.sfx('feed', { rate: 1.2 }); } else { f.x += clamp(dx, -.15 * dt, .15 * dt); f.y += clamp(dy, -.15 * dt, .15 * dt); } }
      }); if (eaten) this.food.splice(i, 1);
    }
    var school = this.fishModel.filter(function (f) { var d = FISH.find(function (x) { return x.id === f.id; }); return d && d.behavior === 'school'; });
    this.fishModel.forEach(function (f, index) {
      var def = FISH.find(function (x) { return x.id === f.id; }) || FISH[0], targetX = .5 + Math.sin(self.simClock * .55 + f.phase) * .24, targetY = .42 + Math.sin(self.simClock * .8 + f.phase * 1.4) * .12;
      if (def.behavior === 'school' && school.length > 1) { targetX = school.reduce(function (s, q) { return s + q.x; }, 0) / school.length + Math.sin(self.simClock + f.phase) * .04; targetY = school.reduce(function (s, q) { return s + q.y; }, 0) / school.length + Math.cos(self.simClock + f.phase) * .035; }
      else if (def.behavior === 'floor') targetY = .78 + Math.sin(self.simClock * .7 + f.phase) * .045;
      else if (def.behavior === 'hide') { var hide = self.decorModel.some(function (d) { var dd = DECOR.find(function (x) { return x.id === d.id; }); return dd && dd.kind === 'hide' && Math.abs(d.x - f.x) < .28; }); targetY = hide ? .72 + Math.sin(self.simClock + f.phase) * .04 : .34 + Math.sin(self.simClock + f.phase) * .1; f.hidden = hide ? .75 : 0; }
      else if (def.behavior === 'chase') targetX += Math.sin(self.simClock * 1.2 + f.phase) * .18;
      else if (def.behavior === 'bubble') { targetY = .55 + Math.sin(self.simClock * .65 + f.phase) * .14; f.bubble += dt; if (f.bubble > 2.2) { f.bubble = 0; self.spawnBubble(f.x, f.y); } }
      f.vx += clamp(targetX - f.x, -.7 * dt, .7 * dt); f.vy += clamp(targetY - f.y, -.7 * dt, .7 * dt); f.vx *= .96; f.vy *= .96; f.x = clamp(f.x + f.vx * dt, .08, .92); f.y = clamp(f.y + f.vy * dt, .18, .9); f.feed = clamp(f.feed - .002 * dt, 0, 1); f.tailFrame = Math.sin(self.viewClock * 9 + f.phase) >= 0 ? 1 : 0;
      if (profile.fish[index]) profile.fish[index].feed = f.feed;
    });
    this.feedSaveT += dt; var comfort = this.comfort(); if (comfort !== this.lastComfort) { if (comfort > this.lastComfort) this.setNotice('Comfort +' + (comfort - this.lastComfort), .8); this.lastComfort = comfort; }
    if (fedThisStep || this.feedSaveT >= .75 || comfort !== this.lastComfort) { this.feedSaveT = 0; this.syncFishSave(); saveProfile(); }
  };
  Scene.prototype.spawnBubble = function (x, y) { for (var i = 0; i < this.bubbleViews.length; i++) if (!this.bubbleViews[i].visible) { this.bubbleViews[i].setVisible(true).setPosition(this.tankRect.x + x * this.tankRect.w, this.tankRect.y + y * this.tankRect.h); this.bubbleViews[i].setData('age', 0); return; } };

  Scene.prototype.updateBoard = function (dt) { if (this.phase === 'swap' || this.phase === 'rollback') { this.phaseT += dt; if (this.phaseT >= .18) { if (this.phase === 'swap') this.resolveSwap(); else { this.swapPair = null; this.phase = 'play'; this.selectorState = 'ready'; } } } else if (this.phase === 'clear') { this.phaseT += dt; if (this.phaseT >= .14) this.collapse(); } else if (this.phase === 'drop') { this.phaseT += dt; if (this.phaseT >= .24) this.finishDrop(); } };
  Scene.prototype.step = function (dt) { this.simClock += dt; if (this.notice.time > 0) this.notice.time = Math.max(0, this.notice.time - dt); if (this.tutorial.time > 0) this.tutorial.time = Math.max(0, this.tutorial.time - dt); if (this.invalidT > 0) this.invalidT = Math.max(0, this.invalidT - dt); if (this.duckT > 0) { this.duckT = Math.max(0, this.duckT - dt); if (this.duckT === 0 && this.duckVolume != null) { kit.audio.setMusicVolume(this.duckVolume); this.duckVolume = null; } } if (this.screen === 'level' && !this.boundary) { if (this.phase === 'play') { this.idleFor += dt; if (this.idleFor > 2.5 && !this.hintPair) this.hintPair = this.findLegalMove(this.cells); } else this.idleFor = 0; this.updateBoard(dt); } if (this.screen === 'tank' && !this.boundary) this.updateTank(dt); this.updateKeys(); this.updateGamepad(); this.updateBubbles(dt); };
  Scene.prototype.updateBubbles = function (dt) { for (var i = 0; i < this.bubbleViews.length; i++) if (this.bubbleViews[i].visible) { var age = Number(this.bubbleViews[i].getData('age') || 0) + dt; this.bubbleViews[i].setData('age', age); this.bubbleViews[i].y -= 10 * dt; this.bubbleViews[i].setAlpha(Math.max(0, 1 - age / 2.2)); if (age > 2.2) this.bubbleViews[i].setVisible(false); } };
  Scene.prototype.moveBoardSelection = function (dx, dy) { if (this.screen !== 'level' || this.boundary || this.phase !== 'play') return; var s = this.selected < 0 ? Math.floor(CELLS / 2) : this.selected, x = clamp(s % COLS + dx, 0, COLS - 1), y = clamp(Math.floor(s / COLS) + dy, 0, ROWS - 1), next = y * COLS + x; if (this.blocked.has(next)) return; this.selected = next; this.idleFor = 0; this.hintPair = null; this.candidate = this.keyboardOrigin >= 0 && this.adjacent(this.keyboardOrigin, next) ? next : -1; this.selectorState = this.candidate >= 0 ? (this.previewLegal(this.keyboardOrigin, next) ? 'preview' : 'invalid') : 'ready'; kit.audio.sfx('select', { volume: .45 }); };
  Scene.prototype.activateBoardSelection = function () { if (this.screen !== 'level' || this.boundary || this.phase !== 'play' || this.selected < 0) return; if (this.keyboardOrigin < 0) { this.keyboardOrigin = this.selected; this.candidate = -1; this.selectorState = 'preview'; this.setNotice('Choose a neighbouring tile, then press Enter.', 1.1); kit.audio.sfx('select'); return; } if (this.adjacent(this.keyboardOrigin, this.selected)) { this.attemptSwap(this.keyboardOrigin, this.selected); return; } this.invalidCandidate = this.selected; this.invalidT = .8; this.selectorState = 'invalid'; this.setNotice('Choose a neighbouring tile.', .8); kit.audio.sfx('invalid'); };
  Scene.prototype.activateFocused = function () { if (this.boundary) { this.boundaryAction(this.boundary.overlay.kind); return; } if (this.screen === 'map') { this.chooseLevel(this.mapFocus); return; } if (this.screen === 'level') { this.activateBoardSelection(); return; } if (this.screen === 'tank') { this.dropFood(.5, .5); return; } if (this.screen === 'shop') { var items = this.shopTab === 0 ? DECOR.map(function (d) { return { kind: 'decor', def: d }; }) : FISH.map(function (f) { return { kind: 'fish', def: f }; }); var item = items[this.shopPage * 8 + this.shopFocus]; if (item) this.buyItem(item); } };
  Scene.prototype.moveFocus = function (direction) { if (this.screen === 'map') { if (direction === 'left') this.mapFocus = Math.max(0, this.mapFocus - 1); if (direction === 'right') this.mapFocus = Math.min(LEVELS.length - 1, this.mapFocus + 1); if (direction === 'up') this.mapFocus = Math.max(0, this.mapFocus - 4); if (direction === 'down') this.mapFocus = Math.min(LEVELS.length - 1, this.mapFocus + 4); } else if (this.screen === 'shop') { if (direction === 'left') this.shopFocus = Math.max(0, this.shopFocus - 1); if (direction === 'right') this.shopFocus = Math.min(7, this.shopFocus + 1); if (direction === 'up') this.shopFocus = Math.max(0, this.shopFocus - 2); if (direction === 'down') this.shopFocus = Math.min(7, this.shopFocus + 2); } else this.moveBoardSelection(direction === 'left' ? -1 : direction === 'right' ? 1 : 0, direction === 'up' ? -1 : direction === 'down' ? 1 : 0); };
  Scene.prototype.updateKeys = function () { var self = this, keys = ['Enter', 'Space', 'KeyR', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']; keys.forEach(function (key) { var down = kit.input.keyDown(key), was = !!self.keyLatch[key]; self.keyLatch[key] = down; if (!down || was) return; if (key === 'KeyR' && self.screen === 'level') { kit.restart(); return; } if (key === 'Escape') { if (self.boundary) return; if (self.screen !== 'map') self.go('map'); return; } if ((key === 'Enter' || key === 'Space') && (self.boundary || self.screen !== 'level' && self.screen !== 'map' && self.screen !== 'shop' || self.screen === 'map' || self.screen === 'shop')) { if (self.screen === 'tank' && key === 'Space' && !self.boundary) self.dropFood(.5, .5); else self.activateFocused(); return; } if (self.screen === 'map') { if (key === 'ArrowLeft') self.mapFocus = Math.max(0, self.mapFocus - 1); if (key === 'ArrowRight') self.mapFocus = Math.min(LEVELS.length - 1, self.mapFocus + 1); if (key === 'ArrowUp') self.mapFocus = Math.max(0, self.mapFocus - 4); if (key === 'ArrowDown') self.mapFocus = Math.min(LEVELS.length - 1, self.mapFocus + 4); return; } if (self.screen === 'shop') { if (key === 'ArrowLeft') self.shopFocus = Math.max(0, self.shopFocus - 1); if (key === 'ArrowRight') self.shopFocus = Math.min(7, self.shopFocus + 1); if (key === 'ArrowUp') self.shopFocus = Math.max(0, self.shopFocus - 2); if (key === 'ArrowDown') self.shopFocus = Math.min(7, self.shopFocus + 2); return; } if (self.screen === 'level' && !self.boundary && self.phase === 'play') { if (key === 'ArrowLeft') self.moveBoardSelection(-1, 0); if (key === 'ArrowRight') self.moveBoardSelection(1, 0); if (key === 'ArrowUp') self.moveBoardSelection(0, -1); if (key === 'ArrowDown') self.moveBoardSelection(0, 1); } }); };
  Scene.prototype.updateGamepad = function () {
    var pads = kit.input.readGamepads(), pad = null; for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { pad = pads[i]; break; } if (!pad) return;
    var self = this, axisX = Math.abs(pad.axes[0] || 0) > .55 ? ((pad.axes[0] < 0) ? 'left' : 'right') : '', axisY = Math.abs(pad.axes[1] || 0) > .55 ? ((pad.axes[1] < 0) ? 'up' : 'down') : '', direction = axisX || axisY;
    if (direction && !this.gamepadLatch[direction]) { this.gamepadLatch[direction] = true; this.moveFocus(direction); }
    if (!direction) this.gamepadLatch.left = this.gamepadLatch.right = this.gamepadLatch.up = this.gamepadLatch.down = false;
    var accept = !!(pad.buttons[0] && pad.buttons[0].pressed) || !!(pad.buttons[9] && pad.buttons[9].pressed); if (accept && !this.gamepadLatch.accept) { this.gamepadLatch.accept = true; this.activateFocused(); } if (!accept) this.gamepadLatch.accept = false;
  };

  Scene.prototype.setNotice = function (text, seconds) { this.notice = { text: text, time: seconds || 1 }; this.tutorial.time = 0; };
  Scene.prototype.applyTextScale = function () { var scale = [1, 1.15, 1.3].indexOf(profile.textScale) >= 0 ? profile.textScale : 1, visit = function (object) { if (!object) return; if (object.type === 'Text') object.setScale(scale); if (object.list) object.list.forEach(visit); }; this.textScale = scale; visit(this.mapLayer); visit(this.levelLayer); visit(this.tankLayer); visit(this.shopLayer); visit(this.uiLayer); this.startOverlay && visit(this.startOverlay.root); this.resultOverlay && visit(this.resultOverlay.root); this.levelStartOverlay && visit(this.levelStartOverlay.root); this.unlockOverlay && visit(this.unlockOverlay.root); };
  Scene.prototype.openSettings = function () { var self = this; kit.openSettings([function (box) { var label = document.createElement('div'); label.textContent = 'Text scale'; label.style.cssText = 'font-size:16px;font-weight:700;margin-top:4px;'; box.appendChild(label); [1, 1.15, 1.3].forEach(function (value) { var button = document.createElement('button'); button.type = 'button'; button.textContent = value.toFixed(2) + 'x'; button.style.cssText = 'font:inherit;font-size:16px;color:#e8eef4;background:#1b2733;border:1px solid #2e3e4e;border-radius:10px;padding:12px 18px;min-width:min(70vw,280px);'; button.addEventListener('click', function () { profile.textScale = value; saveProfile(); self.applyTextScale(); self.layout(); }); box.appendChild(button); }); }]); };
  Scene.prototype.levelUnlocked = function (index) { if (index <= 0) return true; var cfg = LEVELS[index]; return profile.cleared.indexOf(index - 1) >= 0 && profile.packs.indexOf(cfg.pack) >= 0 && this.comfort() >= cfg.comfort; };
  Scene.prototype.applyProbeForces = function () { var force = Number(window.__rt && window.__rt.forceLevel); this.forcedLevel = Number.isFinite(force) && force > 0 ? int(force - 1, 0, 0, LEVELS.length - 1) : -1; var forcedComfort = Number(window.__rt && window.__rt.forceComfort); if (Number.isFinite(forcedComfort) && forcedComfort > 0) { window.__rt.forceComfort = int(forcedComfort, 0, 0, 100); } if (this.forcedLevel >= 0 && this.forceLevelApplied !== this.forcedLevel) { this.forceLevelApplied = this.forcedLevel; this.startLevel(this.forcedLevel); } };
  Scene.prototype.syncProbe = function () { var state = window.__rt.state; state.mode = this.screen; state.level = this.levelIndex + 1; state.pearls = profile.pearls; state.coral = profile.coral; state.comfort = this.comfort(); state.powerups = JSON.parse(JSON.stringify(profile.powerups)); state.tank = { fish: this.fishModel.map(function (f) { return f.id; }), decor: this.decorModel.map(function (d) { return d.id; }), fed: finiteOr(profile.fed, 0), coralGrowth: Math.min(6, Math.floor(profile.coral / 8)), fishCount: this.fishModel.length, decorCount: this.decorModel.length }; state.forceLevel = window.__rt.forceLevel || 0; state.forceComfort = window.__rt.forceComfort || 0; };

  Scene.prototype.pruneFood = function () { this.food = this.food.filter(function (food) { return food.life > 0; }); };
  Scene.prototype.hideGoalHud = function () { if (!this.goalViews) return; this.goalViews.forEach(function (view) { view.bg.setVisible(false); view.text.setVisible(false); }); if (this.movesText) this.movesText.setVisible(false); };
  Scene.prototype.renderShimmer = function () { var active = this.screen === 'tank' && !this.boundary, r = this.tankRect, self = this; this.shimmers.forEach(function (shimmer, i) { shimmer.setVisible(active); if (active) { var x = ((i * 94 + self.simClock * (16 + i * 3)) % (r.w + 160)) - 80; shimmer.setPosition(r.x + x, r.y + 66 + i * 72 + Math.sin(self.simClock * .6 + i) * 8); shimmer.setRotation(-.16 + i * .025); } }); };
  Scene.prototype.renderAll = function () { this.pruneFood(); this.setBackdrop(); this.renderHUD(); this.renderMap(); this.hideGoalHud(); this.renderShimmer(); this.renderLevel(); this.renderTank(); this.renderShop(); this.renderNotice(); this.syncProbe(); };
  Scene.prototype.setBackdrop = function () { var pack = 0; if (this.screen === 'level' && this.level) pack = this.level.pack; else if (this.screen === 'tank') pack = Math.min(3, Math.floor(this.comfort() / 28)); else if (this.screen === 'map') pack = Math.min(3, Math.floor(profile.cleared.length / 4)); else if (this.screen === 'shop') pack = 1; this.background.setTexture(this.backdrops[pack]).setDisplaySize(this.W, this.H); };
  Scene.prototype.renderHUD = function () { var comfort = this.comfort(); textIfChanged(this.pearlText, '◈ ' + profile.pearls); textIfChanged(this.coralText, '✿ ' + profile.coral); textIfChanged(this.scoreText, this.screen === 'level' ? 'SCORE ' + this.score : ''); textIfChanged(this.comfortText, '♡ ' + comfort); this.comfortFill.setDisplaySize(Math.max(2, 80 * comfort / 100), 5); colorIfChanged(this.comfortText, comfort >= 82 ? '#f7c948' : '#7ee49b'); this.comfortBar.setVisible(this.screen !== 'start'); this.comfortFill.setVisible(this.screen !== 'start'); this.scoreText.setVisible(this.screen === 'level'); if (this.screen === 'level' && this.level) textIfChanged(this.titleText, 'LEVEL ' + String(this.levelIndex + 1).padStart(2, '0')); else if (this.screen === 'tank') textIfChanged(this.titleText, 'TANK'); else if (this.screen === 'shop') textIfChanged(this.titleText, 'SHOP'); else textIfChanged(this.titleText, 'REEF TILES'); };
  Scene.prototype.renderNotice = function () { var active = this.notice.time > 0 && this.notice.text && !this.boundary; this.noticeBg.setVisible(!!active && this.screen !== 'start'); this.noticeText.setVisible(!!active && this.screen !== 'start'); if (active) { textIfChanged(this.noticeText, this.notice.text); var a = clamp(this.notice.time * 3, 0, 1); this.noticeBg.setAlpha(a * .92); this.noticeText.setAlpha(a); } var tut = this.tutorial.time > 0 && this.tutorial.text && this.screen === 'level' && !this.boundary; this.tutorialBg.setVisible(!!tut); this.tutorialText.setVisible(!!tut); if (tut) { textIfChanged(this.tutorialText, this.tutorial.text); var ta = clamp(this.tutorial.time / 1.2, .1, 1); this.tutorialBg.setAlpha(ta * .75); this.tutorialText.setAlpha(ta); } };
  Scene.prototype.renderMap = function () { if (this.screen !== 'map') return; var self = this; this.mapCards.forEach(function (c, i) { var open = self.levelUnlocked(i) || self.forcedLevel === i, done = profile.cleared.indexOf(i) >= 0, cfg = LEVELS[i]; c.bg.setFillStyle(open ? (done ? 0x1e6074 : 0x1c7590) : 0x152c42, 1); c.bg.setStrokeStyle(3, i === self.mapFocus ? COLOR.warning : open ? (cfg.pack === 3 ? COLOR.sun : COLOR.edge) : 0x314567, 1); textIfChanged(c.number, open ? String(i + 1) : '•'); colorIfChanged(c.number, open ? '#f7fbff' : '#657998'); textIfChanged(c.medal, done ? (profile.medals[i] === 'gold' ? '★ ★ ★' : profile.medals[i] === 'silver' ? '★ ★ ·' : '★ · ·') : (open ? '○ ○ ○' : 'LOCK')); colorIfChanged(c.medal, done ? '#f7c948' : open ? '#b9e9f5' : '#657998'); textIfChanged(c.pack, i % 4 === 0 ? PACKS[cfg.pack].name : ''); }); };
  Scene.prototype.renderLevel = function () {
    var active = this.screen === 'level'; this.boardImage.setVisible(active); this.clearFx.setVisible(active); this.cascadeFx.setVisible(active); this.selectorView.root.setVisible(active && !this.boundary); this.previewGhost.root.setVisible(active && !this.boundary && (this.candidate >= 0 || this.invalidCandidate >= 0 || this.hintPair));
    this.obstacleViews.forEach(function (view) { view.root.setVisible(false); }); if (!active || !this.level) return;
    var g = this.boardGeo, self = this; this.boardViews.forEach(function (v, i) {
      var type = self.cells[i]; if (self.swapPair && (self.phase === 'swap' || self.phase === 'rollback')) { if (i === self.swapPair.a) type = self.swapPair.typeA; if (i === self.swapPair.b) type = self.swapPair.typeB; }
      var clearing = type < 0 && self.matched && self.matched.has(i), drawType = clearing ? self.matchedTypes[i] : type, visible = drawType !== undefined && drawType >= 0;
      v.root.setVisible(visible); if (!visible) return;
      var x = g.x + (i % COLS + .5) * g.cell, y = g.y + (Math.floor(i / COLS) + .5) * g.cell, scale = clamp(g.cell / 46, .72, 1.05), phase = self.phaseT / .18;
      if (self.swapPair && (self.phase === 'swap' || self.phase === 'rollback')) { var a = self.swapPair.a, b = self.swapPair.b, from = i === a ? a : i === b ? b : i, target = i === a ? b : i === b ? a : i, t = clamp(phase, 0, 1), eased = spring(t), fx = g.x + (from % COLS + .5) * g.cell, fy = g.y + (Math.floor(from / COLS) + .5) * g.cell, tx = g.x + (target % COLS + .5) * g.cell, ty = g.y + (Math.floor(target / COLS) + .5) * g.cell; if (self.phase === 'rollback') { var swapX = fx; fx = tx; tx = swapX; var swapY = fy; fy = ty; ty = swapY; } x = fx + (tx - fx) * eased; y = fy + (ty - fy) * eased; }
      if (self.phase === 'drop' && v.dropT < .24) { var fromY = g.y + (v.dropFrom + .5) * g.cell; y = fromY + (y - fromY) * spring(self.phaseT / .24); }
      var breathe = 1 + Math.sin(self.viewClock * 2.4 + i * .7) * .018, press = self.pressedCell === i ? .96 : 1, pop = clearing ? 1 + Math.sin(clamp(self.phaseT / .14, 0, 1) * Math.PI) * .08 : 1; v.root.setPosition(x, y); v.root.setScale(scale * breathe * press * pop); v.root.setAlpha(clearing ? clamp(1 - self.phaseT / .18, .2, 1) : 1);
      var selected = i === self.selected, candidate = i === self.candidate; v.ring.setVisible(selected || candidate); v.ring.setStrokeStyle(3, candidate && self.previewLegal(self.selected, self.candidate) ? COLOR.good : selected ? COLOR.warning : COLOR.bad, 1); var def = TILE[drawType] || TILE[0]; v.shapes.forEach(function (shape, si) { shape.setVisible(si === drawType); if (si === drawType) shape.setFillStyle(def.color, 1).setStrokeStyle(1.5, COLOR.paper, .4); }); textIfChanged(v.glyph, def.glyph); colorIfChanged(v.glyph, drawType === 1 ? '#182238' : '#f7fbff'); v.highlight.setFillStyle(COLOR.paper, .25);
    });
    this.blocked.forEach(function (index) { var view = self.obstacleViews[index % self.obstacleViews.length], p = self.center(index); view.root.setVisible(true).setPosition(p.x, p.y).setScale(clamp(g.cell / 46, .72, 1)); });
    this.renderSelector(); this.renderGoals();
  };
  Scene.prototype.renderSelector = function () {
    var cell = this.selected >= 0 ? this.selected : (this.swapPair ? this.swapPair.b : -1), target = this.candidate >= 0 ? this.candidate : this.invalidCandidate, pair = this.hintPair, g = this.boardGeo, view = this.selectorView;
    if (cell < 0 || !g) return;
    var p = this.center(cell), pulse = 1 + Math.sin(this.viewClock * 3.2) * .035; view.root.setPosition(p.x, p.y).setScale(pulse); view.ring.setStrokeStyle(3, this.selectorState === 'invalid' ? COLOR.bad : this.selectorState === 'preview' ? COLOR.good : COLOR.warning, 1); view.arrow.setVisible(this.selectorState === 'preview' || this.selectorState === 'invalid' || !!pair); view.label.setText(this.selectorState === 'resolve' ? 'RESOLVE' : this.selectorState === 'preview' ? 'PREVIEW' : this.selectorState === 'invalid' ? 'NO MATCH' : 'READY'); colorIfChanged(view.label, this.selectorState === 'invalid' ? '#ff8a86' : '#ffe9a8');
    if (target >= 0 && this.candidate >= 0) { var tp = this.center(target), legal = this.previewLegal(cell, target); this.previewGhost.root.setPosition(tp.x, tp.y).setAlpha(.72 + Math.sin(this.viewClock * 6) * .12); this.previewGhost.ghost.setFillStyle(legal ? COLOR.good : COLOR.bad, .18); this.previewGhost.ghost.setStrokeStyle(2, legal ? COLOR.good : COLOR.bad, 1); this.previewGhost.hatch.setVisible(!legal); view.arrow.setText(cell % COLS === target % COLS ? (target > cell ? '↓' : '↑') : (target > cell ? '→' : '←')); }
    else if (this.invalidCandidate >= 0) { var ip = this.center(this.invalidCandidate); this.previewGhost.root.setPosition(ip.x, ip.y).setAlpha(.7); this.previewGhost.ghost.setFillStyle(COLOR.bad, .16).setStrokeStyle(2, COLOR.bad, 1); this.previewGhost.hatch.setVisible(true); view.arrow.setText('×'); }
    else if (pair) { var hp = this.center(pair[1]); this.previewGhost.root.setPosition(hp.x, hp.y).setAlpha(.48 + Math.sin(this.viewClock * 4) * .18); this.previewGhost.ghost.setFillStyle(COLOR.good, .16).setStrokeStyle(2, COLOR.good, 1); this.previewGhost.hatch.setVisible(false); view.arrow.setText(pair[1] % COLS === pair[0] % COLS ? (pair[1] > pair[0] ? '↓' : '↑') : (pair[1] > pair[0] ? '→' : '←')); }
    else this.previewGhost.root.setVisible(false);
    if (this.invalidT <= 0 && this.invalidCandidate >= 0) this.invalidCandidate = -1;
  };
  Scene.prototype.renderPowerups = function () { if (!this.powerButtons) return; this.powerButtons.forEach(function (button, i) { var power = POWERUPS[i], state = profile.powerups[power.id], available = state.unlocked && state.charges > 0; button.bg.setFillStyle(available ? 0x1e6074 : 0x152c42, 1).setStrokeStyle(2, available ? COLOR.good : 0x314567, 1); textIfChanged(button.label, power.name.split(' ')[0].toUpperCase() + ' ' + (state.unlocked ? state.charges : power.unlock + '✿')); colorIfChanged(button.label, available ? '#f7fbff' : '#657998'); colorIfChanged(button.icon, available ? '#7ee49b' : '#657998'); }); };
  Scene.prototype.renderGoals = function () { var self = this; if (!this.goalViews) { this.goalViews = []; for (var i = 0; i < 3; i++) { var bg = this.add.rectangle(0, 0, 100, 40, COLOR.board, 1).setOrigin(0).setStrokeStyle(1, COLOR.edge, 1), tx = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '15px', color: '#f7fbff', fontStyle: 'bold' }).setOrigin(.5); this.uiLayer.add([bg, tx]); this.goalViews.push({ bg: bg, text: tx }); } this.movesText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '17px', color: '#f7c948', fontStyle: 'bold' }).setOrigin(1, .5); this.uiLayer.add(this.movesText); } var n = Math.max(1, this.goals.length), goalArea = this.W - 84, goalW = Math.min(100, (goalArea - (n - 1) * 4) / n); this.goals.forEach(function (goal, i) { var x = 12 + i * (goalW + 4); self.goalViews[i].bg.setVisible(true).setPosition(x, 136).setDisplaySize(goalW, 38); self.goalViews[i].text.setVisible(true).setPosition(x + goalW / 2, 155); textIfChanged(self.goalViews[i].text, TILE[goal.type].glyph + ' ' + Math.min(goal.got, goal.need) + '/' + goal.need); colorIfChanged(self.goalViews[i].text, goal.got >= goal.need ? '#7ee49b' : '#f7fbff'); }); for (var j = this.goals.length; j < 3; j++) { this.goalViews[j].bg.setVisible(false); this.goalViews[j].text.setVisible(false); } this.movesText.setVisible(true).setPosition(this.W - 12, 155); textIfChanged(this.movesText, '↕ ' + this.moves); colorIfChanged(this.movesText, this.moves <= 5 ? '#ff8a86' : '#f7c948'); this.renderPowerups(); };
  Scene.prototype.renderTank = function () { var active = this.screen === 'tank'; this.tankImage.setVisible(active); if (!active) { this.tankDecorViews.forEach(function (v) { v.root.setVisible(false); }); this.tankCoralViews.forEach(function (v) { v.root.setVisible(false); }); this.fishViews.forEach(function (v) { v.root.setVisible(false); }); this.foodViews.forEach(function (v) { v.setVisible(false); }); return; } var r = this.tankRect, self = this; this.tankCoralViews.forEach(function (v, i) { var grown = profile.coral >= (i + 1) * 8; v.root.setVisible(grown).setPosition(r.x + r.w * (.13 + i * .15), r.y + r.h * (.88 - (i % 2) * .02)).setScale(.72 + Math.min(.28, profile.coral / 240)); }); this.decorModel.forEach(function (d, i) { var v = self.tankDecorViews[i], def = DECOR.find(function (x) { return x.id === d.id; }) || DECOR[1]; v.root.setVisible(true).setPosition(r.x + d.x * r.w, r.y + d.y * r.h).setScale(self.drag && self.drag.decor === d ? 1.08 : 1); v.stem.setVisible(def.kind === 'plant'); v.crown.setVisible(def.kind === 'plant'); v.rock.setVisible(def.kind === 'scenery' || def.kind === 'hide'); v.arch.setVisible(def.kind === 'hide'); v.vent.setVisible(def.kind === 'vent'); textIfChanged(v.icon, def.icon); colorIfChanged(v.icon, hexCss(def.color)); }); for (var i = this.decorModel.length; i < this.tankDecorViews.length; i++) this.tankDecorViews[i].root.setVisible(false); this.fishModel.forEach(function (f, i2) { var v = self.fishViews[i2], def = FISH.find(function (x) { return x.id === f.id; }) || FISH[0], x = r.x + f.x * r.w, y = r.y + f.y * r.h, scale = def.size / 22; v.root.setVisible(true).setPosition(x, y); v.root.setScaleX((f.hidden ? .72 : 1) * scale * (f.vx < -.001 ? -1 : 1)); v.root.setScaleY(scale); v.root.setAlpha(f.hidden ? .45 : 1); v.body.setFillStyle(def.color, 1); v.tail.setFillStyle(def.color, 1); v.tail.setRotation(f.tailFrame ? .13 : -.13); v.stripe.setVisible(def.behavior === 'hide' || def.behavior === 'school'); v.bubble.setVisible(def.behavior === 'bubble'); }); for (i = this.fishModel.length; i < this.fishViews.length; i++) this.fishViews[i].root.setVisible(false); this.food.forEach(function (food, fi) { var fv = self.foodViews[fi]; fv.setVisible(true).setPosition(r.x + food.x * r.w, r.y + food.y * r.h); }); for (i = this.food.length; i < this.foodViews.length; i++) this.foodViews[i].setVisible(false); };
  Scene.prototype.renderShop = function () { if (this.screen !== 'shop') { this.shopCards.forEach(function (c) { c.root.setVisible(false); }); return; } var items = this.shopTab === 0 ? DECOR.map(function (d) { return { kind: 'decor', def: d }; }) : FISH.map(function (f) { return { kind: 'fish', def: f }; }), pages = Math.max(1, Math.ceil(items.length / 8)); this.shopPage = clamp(this.shopPage, 0, pages - 1); this.shopFocus = clamp(this.shopFocus, 0, Math.min(7, items.length - this.shopPage * 8 - 1)); var start = this.shopPage * 8, self = this; this.shopTabButtons.forEach(function (b, i) { b.bg.setFillStyle(i === self.shopTab ? 0x1e7590 : COLOR.board, 1); b.bg.setStrokeStyle(2, i === self.shopTab ? COLOR.paper : COLOR.edge, 1); }); this.shopCards.forEach(function (c, i) { var item = items[start + i]; c.root.setVisible(!!item); if (!item) return; c.item = item; var def = item.def, owned = item.kind === 'fish' ? self.fishModel.filter(function (f) { return f.id === def.id; }).length : self.decorModel.filter(function (d) { return d.id === def.id; }).length; c.bg.setData('shopItem', item); c.bg.setFillStyle(profile.pearls >= def.cost ? 0x1e6074 : 0x152c42, 1); c.bg.setStrokeStyle(3, i === self.shopFocus ? COLOR.warning : profile.pearls >= def.cost ? COLOR.edge : 0x314567, 1); textIfChanged(c.icon, def.icon); colorIfChanged(c.icon, hexCss(def.color)); textIfChanged(c.name, def.name); textIfChanged(c.meta, '◈ ' + def.cost + '   ' + (owned ? 'owned ' + owned : 'add')); colorIfChanged(c.meta, profile.pearls >= def.cost ? '#f7c948' : '#657998'); }); this.shopPrev.bg.setAlpha(this.shopPage > 0 ? 1 : .4); this.shopNext.bg.setAlpha(this.shopPage < pages - 1 ? 1 : .4); };

  Scene.prototype.center = function (index) { return { x: this.boardGeo.x + (index % COLS + .5) * this.boardGeo.cell, y: this.boardGeo.y + (Math.floor(index / COLS) + .5) * this.boardGeo.cell }; };
  Scene.prototype.buyItem = function (item) { var def = item.def; if (profile.pearls < def.cost) { this.setNotice('Clear levels for more pearls', 1); kit.audio.sfx('invalid'); return; } if (item.kind === 'decor' && profile.decor.length >= 24) { this.setNotice('Tank is full', 1); return; } if (item.kind === 'fish' && profile.fish.length >= 12) { this.setNotice('Fish limit reached', 1); return; } profile.pearls -= def.cost; if (item.kind === 'decor') profile.decor.push({ id: def.id, x: .18 + (profile.decor.length % 5) * .16, y: .74 + (profile.decor.length % 4) * .045 }); else profile.fish.push({ id: def.id, feed: .35 }); saveProfile(); this.loadTankModels(); this.setNotice(def.name + ' added', 1); kit.audio.sfx('reward'); this.renderAll(); };

  Scene.prototype.update = function (time, delta) { if (kit.paused) return; this.applyProbeForces(); var seconds = Math.max(0, Number(delta) / 1000); if (!Number.isFinite(seconds)) seconds = 0; this.viewClock += Math.min(seconds, .1); this.juiceFrame = kit.juice.frame(); this.simAccumulator += seconds; var steps = 0; while (this.simAccumulator >= STEP && steps < 4) { this.step(STEP); this.simAccumulator -= STEP; steps++; } this.renderAll(); };
  Scene.prototype.shutdownScene = function () { this.releaseInputs(); };

  window.__rt = window.__rt || { state: { mode: 'boot', level: 1, pearls: 0, comfort: 0, tank: {} }, forceLevel: 0, forceComfort: 0 };
  window.__rt.state = window.__rt.state || { mode: 'boot', level: 1, pearls: 0, comfort: 0, tank: {} };
  var cfg = GGKit.hiDpi.phaser({ type: Phaser.AUTO, parent: 'game', backgroundColor: '#071827', scale: { mode: Phaser.Scale.NONE, width: DESIGN_W, height: DESIGN_H }, render: Object.assign({}, GGKit.renderDefaults, { batchSize: 2048 }), fps: { target: 60, min: 30 }, scene: [Scene] });
  DPR = cfg.ggDpr;
  Game.phaser = new Phaser.Game(cfg);
})();
