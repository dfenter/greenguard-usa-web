/* Harvest Junction - AAA rebuild, fleet F3.
 * Phaser is the view. GGKit owns lifecycle, input identity, saves, audio and PWA.
 * The simulation is fixed-step and deliberately has no waiting clocks.
 */
(function () {
  'use strict';

  var W = 390;
  var H = 844;
  var RETINA_FACTOR = GGKit.hiDpi.factor(W, H);
  var STEP = 1 / 60;
  var MAX_STEPS = 4;
  var MAX_PARTICLES = 64;
  var SAVE_VERSION = 3;
  var RUN_VERSION = 1;
  var TAU = Math.PI * 2;
  var FARM_COLS = 18;
  var FARM_ROWS = 12;
  var TILE_SIZE = 20;
  var SEASON_LENGTH = 45 * 60;
  var SEASONS = [
    { name: 'SPRING', tint: 0xb8d6aa, rate: 1.0 },
    { name: 'SUMMER', tint: 0xe7c766, rate: 1.12 },
    { name: 'AUTUMN', tint: 0xd98b5f, rate: 0.92 },
    { name: 'WINTER', tint: 0x9bc6c8, rate: 0.76 }
  ];

  var PAL = {
    ink: 0x24352d, deep: 0x1f493b, forest: 0x2b6a4d, leaf: 0x5ca36b,
    mint: 0xd9ead2, paper: 0xf7f0df, cream: 0xfff9ea, sand: 0xe6d1a8,
    soil: 0xb5794d, soilDark: 0x8c583c, sky: 0x9bd5d4, skyDark: 0x5e9da1,
    wheat: 0xf1cf62, berry: 0xc86b8b, root: 0xe88a54, clover: 0x5ca36b,
    flour: 0xf5e6c7, bread: 0xd9824e, cheese: 0xf4c95d, jam: 0xb85172,
    signal: 0xf4a83e, red: 0xc95355, white: 0xffffff, rail: 0x556b72,
    shadow: 0x1c352c
  };

  var CROP_DATA = [
    { id: 'wheat', label: 'Wheat', output: 'wheat', color: PAL.wheat, shape: 'stalk', growthSteps: 150 },
    { id: 'clover', label: 'Clover', output: 'milk', color: PAL.clover, shape: 'clover', growthSteps: 120 },
    { id: 'berries', label: 'Berries', output: 'berries', color: PAL.berry, shape: 'berries', growthSteps: 180 },
    { id: 'sunroot', label: 'Sunroot', output: 'sunroot', color: PAL.root, shape: 'root', growthSteps: 210 }
  ];
  var CROP_BY_ID = {};
  CROP_DATA.forEach(function (c) { CROP_BY_ID[c.id] = c; });

  var RECIPE_DATA = [
    { id: 'mill', name: 'Grain Mill', input: 'wheat', output: 'flour', color: PAL.wheat, icon: 'mill', seconds: 1.4 },
    { id: 'oven', name: 'Stone Oven', input: 'flour', output: 'bread', color: PAL.bread, icon: 'oven', seconds: 1.7 },
    { id: 'dairy', name: 'Dairy Cart', input: 'milk', output: 'cheese', color: PAL.cheese, icon: 'dairy', seconds: 1.5 },
    { id: 'kettle', name: 'Berry Kettle', input: 'berries', output: 'jam', color: PAL.jam, icon: 'kettle', seconds: 1.3 }
  ];
  var RECIPE_BY_ID = {};
  RECIPE_DATA.forEach(function (r) { RECIPE_BY_ID[r.id] = r; });

  var GOOD_DATA = [
    { id: 'wheat', label: 'Wheat', color: PAL.wheat, icon: 'wheat' },
    { id: 'milk', label: 'Milk', color: PAL.sky, icon: 'milk' },
    { id: 'berries', label: 'Berries', color: PAL.berry, icon: 'berries' },
    { id: 'sunroot', label: 'Sunroot', color: PAL.root, icon: 'sunroot' },
    { id: 'flour', label: 'Flour', color: PAL.flour, icon: 'flour' },
    { id: 'bread', label: 'Bread', color: PAL.bread, icon: 'bread' },
    { id: 'cheese', label: 'Cheese', color: PAL.cheese, icon: 'cheese' },
    { id: 'jam', label: 'Jam', color: PAL.jam, icon: 'jam' }
  ];
  var GOOD_BY_ID = {};
  GOOD_DATA.forEach(function (g) { GOOD_BY_ID[g.id] = g; });

  var LAYOUTS = [
    {
      id: 'starter-field', name: 'Starter Field', subtitle: 'Meadow Gate', accent: PAL.leaf,
      activeCrops: ['wheat', 'clover', 'berries'], factories: ['mill', 'oven', 'dairy', 'kettle'],
      plots: ['wheat', 'clover', 'berries', 'wheat', 'clover', 'berries']
    },
    {
      id: 'orchard-row', name: 'Orchard Row', subtitle: 'Sunroot Terrace', accent: PAL.root,
      activeCrops: ['berries', 'sunroot', 'wheat'], factories: ['mill', 'oven', 'kettle'],
      plots: ['berries', 'sunroot', 'wheat', 'sunroot', 'berries', 'sunroot', 'wheat']
    },
    {
      id: 'factory-row', name: 'Factory Row', subtitle: 'Four-Crate Run', accent: PAL.signal,
      activeCrops: ['wheat', 'clover', 'berries', 'sunroot'], factories: ['mill', 'oven', 'dairy', 'kettle'],
      plots: ['wheat', 'clover', 'berries', 'sunroot', 'wheat', 'clover', 'berries', 'sunroot']
    },
    {
      id: 'junction-depot', name: 'Junction Depot', subtitle: 'Finale Platform', accent: PAL.skyDark,
      activeCrops: ['wheat', 'clover', 'berries', 'sunroot'], factories: ['mill', 'oven', 'dairy', 'kettle'],
      plots: ['wheat', 'berries', 'clover', 'sunroot', 'sunroot', 'wheat', 'berries', 'clover']
    }
  ];
  var LAYOUT_BY_ID = {};
  LAYOUTS.forEach(function (l) { LAYOUT_BY_ID[l.id] = l; });

  var CORE_ORDERS = [
    { id: 'sunrise-picnic', title: 'Sunrise Picnic', layout: 'starter-field', goods: { bread: 1, cheese: 1, jam: 1 }, capacity: 3, reward: 14, seeds: 8, speed: 80 },
    { id: 'market-day', title: 'Market Day', layout: 'orchard-row', goods: { bread: 1, jam: 1, sunroot: 1 }, capacity: 3, reward: 17, seeds: 9, speed: 95 },
    { id: 'lantern-supper', title: 'Lantern Supper', layout: 'junction-depot', goods: { bread: 2, cheese: 1, jam: 1 }, capacity: 4, reward: 22, seeds: 12, speed: 125 }
  ];
  var FREE_ORDERS = [
    { id: 'depot-breakfast', title: 'Depot Breakfast', layout: 'factory-row', goods: { bread: 1, cheese: 1, jam: 1, sunroot: 1 }, capacity: 4, reward: 18, seeds: 10, speed: 120 },
    { id: 'orchard-express', title: 'Orchard Express', layout: 'orchard-row', goods: { bread: 1, jam: 2, sunroot: 1 }, capacity: 4, reward: 20, seeds: 10, speed: 120 },
    { id: 'night-market', title: 'Night Market', layout: 'junction-depot', goods: { bread: 2, cheese: 1, jam: 2 }, capacity: 5, reward: 24, seeds: 12, speed: 140 }
  ];

  var BUILDINGS = [
    { id: 'seed-shed', name: 'Seed Shed', effect: '+1 plot', cost: 2, unlock: 0, icon: 'shed' },
    { id: 'orchard-row', name: 'Orchard Row', effect: '+1 plot', cost: 3, unlock: 1, icon: 'orchard' },
    { id: 'loading-spur', name: 'Loading Spur', effect: '+1 rail bay', cost: 4, unlock: 1, icon: 'spur' },
    { id: 'mill-annex', name: 'Mill Annex', effect: '+1 queue slot', cost: 5, unlock: 2, icon: 'mill' },
    { id: 'creamery-bench', name: 'Creamery Bench', effect: 'flow bonus', cost: 6, unlock: 2, icon: 'dairy' },
    { id: 'kettle-house', name: 'Kettle House', effect: '+1 plot', cost: 7, unlock: 3, icon: 'kettle' },
    { id: 'market-plaza', name: 'Market Plaza', effect: '+2 coins/order', cost: 8, unlock: 3, icon: 'market' },
    { id: 'junction-tower', name: 'Junction Tower', effect: 'gold medal boost', cost: 10, unlock: 3, icon: 'tower' }
  ];

  var GOOD_IDS = GOOD_DATA.map(function (g) { return g.id; });
  var CROP_IDS = CROP_DATA.map(function (c) { return c.id; });

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function configureRetinaScene(scene) {
    scene.cameras.main.setZoom(RETINA_FACTOR); scene.cameras.main.centerOn(W / 2, H / 2);
    var addText = scene.add.text;
    scene.add.text = function (x, y, value, style) {
      return addText.call(this, x, y, value, Object.assign({}, style || {}, { resolution: RETINA_FACTOR }));
    };
  }
  function safeNumber(v, fallback, max) { return typeof v === 'number' && isFinite(v) ? clamp(Math.floor(v), 0, max) : fallback; }
  function cropById(id) { return CROP_BY_ID[id] || CROP_DATA[0]; }
  function goodById(id) { return GOOD_BY_ID[id] || GOOD_DATA[0]; }
  function recipeById(id) { return RECIPE_BY_ID[id] || RECIPE_DATA[0]; }
  function layoutById(id) { return LAYOUT_BY_ID[id] || LAYOUTS[0]; }
  function orderFor(index) { return index < CORE_ORDERS.length ? CORE_ORDERS[index] : FREE_ORDERS[(index - CORE_ORDERS.length) % FREE_ORDERS.length] || CORE_ORDERS[0]; }
  function cloneGoods(source) { var out = {}; Object.keys(source || {}).forEach(function (id) { out[id] = safeNumber(source[id], 0, 99); }); return out; }
  function newSeedBank() { return { wheat: 5, clover: 5, berries: 5, sunroot: 4 }; }
  function buildFarmTilemap() {
    var rows = [];
    for (var y = 0; y < FARM_ROWS; y++) {
      var row = [];
      for (var x = 0; x < FARM_COLS; x++) {
        var edge = x === 0 || y === 0 || x === FARM_COLS - 1 || y === FARM_ROWS - 1;
        var path = (x > 7 && x < 10) || (y > 8 && y < 10);
        var pond = x < 3 && y > 3 && y < 8;
        row.push(edge ? 4 : pond ? 3 : path ? 2 : ((x + y) % 2 ? 1 : 0));
      }
      rows.push(row);
    }
    return rows;
  }
  function validCountMap(map, max) {
    return !!map && typeof map === 'object' && !Array.isArray(map) && Object.keys(map).every(function (id) { return GOOD_IDS.indexOf(id) >= 0 && typeof map[id] === 'number' && isFinite(map[id]) && map[id] >= 0 && map[id] <= max; });
  }
  function validRunSnapshot(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== RUN_VERSION) return false;
    if (typeof raw.orderIndex !== 'number' || !isFinite(raw.orderIndex) || raw.orderIndex < 0 || raw.orderIndex > 999999) return false;
    if (!Array.isArray(raw.plots) || raw.plots.length < 1 || raw.plots.length > 8) return false;
    if (!validCountMap(raw.inventory, 99) || !validCountMap(raw.loaded, 99)) return false;
    if (!raw.queues || typeof raw.queues !== 'object' || Array.isArray(raw.queues)) return false;
    if (raw.queues && !RECIPE_DATA.every(function (recipe) { var q = raw.queues[recipe.id]; return Array.isArray(q) && q.length <= 2 && q.every(function (entry) { return entry && typeof entry === 'object' && typeof entry.input === 'string' && recipe.input === entry.input && typeof entry.progress === 'number' && isFinite(entry.progress) && entry.progress >= 0 && entry.progress <= 999 && typeof entry.ready === 'boolean'; }); })) return false;
    return raw.plots.every(function (plot) {
      return plot && typeof plot === 'object' && (plot.crop === null || CROP_IDS.indexOf(plot.crop) >= 0) && typeof plot.stage === 'number' && plot.stage >= 0 && plot.stage <= 3 && typeof plot.water === 'number' && plot.water >= 0 && plot.water <= 100 && typeof plot.health === 'number' && plot.health >= 0 && plot.health <= 100 && typeof plot.growSteps === 'number' && plot.growSteps >= 0 && plot.growSteps <= 99999;
    });
  }
  function normalizeRunSnapshot(raw) {
    if (!validRunSnapshot(raw)) return null;
    var orderIndex = safeNumber(raw.orderIndex, 0, 999999);
    var order = orderFor(orderIndex);
    var layout = layoutById(order.layout);
    var plots = raw.plots.slice(0, 8).map(function (plot, i) {
      var crop = plot.crop && layout.activeCrops.indexOf(plot.crop) >= 0 ? plot.crop : null;
      var stage = crop ? safeNumber(plot.stage, 0, 3) : 0;
      return { identity: layout.plots[i % layout.plots.length] || 'wheat', crop: crop, stage: stage, pulse: 0, water: clamp(plot.water, 0, 100), health: clamp(plot.health, 0, 100), growSteps: clamp(plot.growSteps, 0, 99999) };
    });
    var queues = {};
    RECIPE_DATA.forEach(function (recipe) { queues[recipe.id] = raw.queues[recipe.id].slice(0, factoryCapacity()).map(function (entry) { return { input: recipe.input, progress: clamp(entry.progress, 0, 999), ready: !!entry.ready }; }); });
    return {
      version: RUN_VERSION, orderIndex: orderIndex, order: order, layout: layout, plots: plots, tilemap: buildFarmTilemap(),
      inventory: cloneGoods(raw.inventory), loaded: cloneGoods(raw.loaded), queues: queues,
      simStart: 0, idleSteps: safeNumber(raw.idleSteps, 0, 999999), factoryWasted: safeNumber(raw.factoryWasted, 0, 999999), factoryTouches: safeNumber(raw.factoryTouches, 0, 999999), factoryFinishes: safeNumber(raw.factoryFinishes, 0, 999999),
      phase: 'play', readyFlash: clamp(Number(raw.readyFlash) || 0, 0, 2), railFx: clamp(Number(raw.railFx) || 0, 0, 1), chip: null, banner: null, tutorial: 0, carry: null, tutorialText: '',
      day: safeNumber(raw.day, 1, 999999), season: clamp(safeNumber(raw.season, 0, SEASONS.length - 1), 0, SEASONS.length - 1), seasonSteps: safeNumber(raw.seasonSteps, 0, SEASON_LENGTH), seasonFx: clamp(Number(raw.seasonFx) || 0, 0, 1),
      player: { x: clamp(Number(raw.player && raw.player.x) || 195, 22, 368), y: clamp(Number(raw.player && raw.player.y) || 226, 122, 340), dir: clamp(safeNumber(raw.player && raw.player.dir, 0, 3), 0, 3), step: 0 }
    };
  }
  function validProfile(profile) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return false;
    if (profile.version !== SAVE_VERSION) return false;
    if (typeof profile.coins !== 'number' || !isFinite(profile.coins) || profile.coins < 0 || profile.coins > 999999) return false;
    if (typeof profile.orders !== 'number' || !isFinite(profile.orders) || profile.orders < 0 || profile.orders > 999999) return false;
    if (!Array.isArray(profile.buildings) || profile.buildings.length !== BUILDINGS.length || profile.buildings.some(function (b) { return typeof b !== 'boolean'; })) return false;
    if (!Array.isArray(profile.medals) || profile.medals.length !== CORE_ORDERS.length || profile.medals.some(function (m) { return typeof m !== 'number' || m < 0 || m > 3; })) return false;
    if (!profile.seeds || typeof profile.seeds !== 'object' || Array.isArray(profile.seeds)) return false;
    if (profile.run != null && !validRunSnapshot(profile.run)) return false;
    return CROP_IDS.every(function (id) { return typeof profile.seeds[id] === 'number' && profile.seeds[id] >= 0 && profile.seeds[id] <= 999; });
  }
  function defaultProfile() { return { version: SAVE_VERSION, coins: 5, orders: 0, buildings: BUILDINGS.map(function () { return false; }), medals: [0, 0, 0], seeds: newSeedBank() }; }
  function normalizeProfile(raw) {
    var base = defaultProfile();
    if (!validProfile(raw)) return base;
    return { version: SAVE_VERSION, coins: safeNumber(raw.coins, base.coins, 999999), orders: safeNumber(raw.orders, 0, 999999), buildings: BUILDINGS.map(function (_, i) { return raw.buildings[i] === true; }), medals: CORE_ORDERS.map(function (_, i) { return safeNumber(raw.medals[i], 0, 3); }), seeds: CROP_IDS.reduce(function (out, id) { out[id] = safeNumber(raw.seeds[id], base.seeds[id] || 0, 999); return out; }, {}) };
  }

  var DEBUG_STATE = {
    mode: 'play', orders: 0, coins: 5,
    farm: { layout: 'starter-field', order: 'sunrise-picnic', plots: [], inventory: {}, loaded: {}, ready: false },
    town: { buildings: BUILDINGS.map(function () { return false; }), draft: -1 },
    forceOrder: null, forceTown: null
  };
  var Game = { phaser: null, scene: null };
  var kit = GGKit.create({
    slug: 'harvest-junction', orientation: 'portrait', validateSave: validProfile,
    onPause: function () { if (Game.scene) Game.scene.setKitPaused(true); },
    onResume: function () { if (Game.scene) Game.scene.setKitPaused(false); },
    onRestart: function () { if (Game.scene) Game.scene.resetRun(true); }
  });
  var storedSave = kit.save.get(null);
  var profile = normalizeProfile(storedSave);
  var pendingRun = normalizeRunSnapshot(storedSave && storedSave.run);
  window.__hj = {
    state: DEBUG_STATE,
    forceOrder: function (index) { var n = safeNumber(Number(index), 0, 999999); DEBUG_STATE.forceOrder = n; if (Game.scene) Game.scene.forceOrder(n); },
    forceTown: function (value) { var v = value == null ? true : value; DEBUG_STATE.forceTown = v; if (Game.scene) Game.scene.forceTown(v); }
  };

  function setTextIfChanged(obj, value) { var next = String(value); if (obj.text !== next) obj.setText(next); }
  function setColorIfChanged(obj, value) { if (obj._hjColor !== value) { obj.setColor(value); obj._hjColor = value; } }
  function setVisible(obj, value) { if (obj.visible !== value) obj.setVisible(value); }
  function makeTexture(scene, key, width, height, draw) { if (scene.textures.exists(key)) return key; var g = scene.make.graphics({ x: 0, y: 0, add: false }); draw(g); g.generateTexture(key, width, height); g.destroy(); return key; }
  function drawIcon(g, kind, color) {
    g.clear(); g.lineStyle(2, PAL.ink, 0.65);
    if (kind === 'wheat' || kind === 'stalk') {
      g.lineStyle(3, color, 1); g.lineBetween(18, 30, 19, 7); g.lineBetween(19, 13, 10, 9); g.lineBetween(19, 18, 28, 13); g.lineBetween(19, 23, 11, 19); g.lineBetween(19, 27, 27, 22);
    } else if (kind === 'clover') {
      g.fillStyle(color, 1); [[12, 15], [24, 15], [18, 9], [18, 21]].forEach(function (p) { g.fillCircle(p[0], p[1], 6); }); g.lineStyle(3, color, 1); g.lineBetween(18, 20, 18, 31);
    } else if (kind === 'berries') {
      g.fillStyle(color, 1); g.fillCircle(11, 21, 6); g.fillCircle(21, 24, 6); g.fillCircle(27, 16, 6); g.fillCircle(18, 13, 6); g.lineStyle(3, PAL.leaf, 1); g.lineBetween(18, 9, 23, 4);
    } else if (kind === 'sunroot') {
      g.fillStyle(color, 1); g.fillTriangle(18, 5, 12, 27, 24, 27); g.lineStyle(3, PAL.leaf, 1); g.lineBetween(18, 8, 18, 2); g.lineBetween(18, 9, 12, 5); g.lineBetween(18, 9, 24, 5);
    } else if (kind === 'flour') {
      g.fillStyle(PAL.cream, 1); g.fillRoundedRect(9, 8, 18, 22, 4); g.lineStyle(2, PAL.sand, 1); g.strokeRoundedRect(9, 8, 18, 22, 4); g.lineBetween(12, 17, 24, 17); g.lineBetween(12, 23, 24, 23);
    } else if (kind === 'milk') {
      g.fillStyle(color, 1); g.fillRoundedRect(10, 8, 16, 22, 4); g.lineStyle(2, PAL.deep, 1); g.strokeRoundedRect(10, 8, 16, 22, 4); g.lineBetween(13, 6, 23, 6); g.lineBetween(13, 18, 23, 18);
    } else if (kind === 'bread') {
      g.fillStyle(color, 1); g.fillRoundedRect(7, 14, 24, 13, 6); g.lineStyle(2, PAL.soilDark, 1); g.lineBetween(14, 17, 16, 23); g.lineBetween(22, 17, 24, 22);
    } else if (kind === 'cheese') {
      g.fillStyle(color, 1); g.fillTriangle(7, 26, 29, 26, 23, 9); g.lineStyle(2, PAL.soilDark, 1); g.strokeTriangle(7, 26, 29, 26, 23, 9); g.fillStyle(PAL.soilDark, 1); g.fillCircle(20, 21, 2);
    } else if (kind === 'jam') {
      g.fillStyle(color, 1); g.fillRoundedRect(9, 12, 18, 18, 4); g.fillStyle(PAL.wheat, 1); g.fillRoundedRect(8, 7, 20, 6, 2); g.lineStyle(2, PAL.deep, 1); g.strokeRoundedRect(9, 12, 18, 18, 4);
    } else if (kind === 'mill') {
      g.fillStyle(PAL.wheat, 1); g.fillRect(9, 13, 18, 16); g.fillTriangle(7, 13, 31, 13, 19, 4); g.lineStyle(2, PAL.deep, 1); g.strokeCircle(19, 21, 5); g.lineBetween(19, 17, 19, 25); g.lineBetween(15, 21, 23, 21);
    } else if (kind === 'oven') {
      g.fillStyle(PAL.bread, 1); g.fillRoundedRect(7, 10, 24, 20, 4); g.fillStyle(PAL.ink, 1); g.fillCircle(19, 22, 6); g.fillStyle(PAL.signal, 1); g.fillCircle(19, 22, 3);
    } else if (kind === 'dairy') {
      g.fillStyle(PAL.sky, 1); g.fillRoundedRect(10, 11, 18, 18, 4); g.fillStyle(PAL.cream, 1); g.fillTriangle(10, 11, 28, 11, 19, 4); g.lineStyle(2, PAL.deep, 1); g.strokeRoundedRect(10, 11, 18, 18, 4);
    } else if (kind === 'kettle') {
      g.fillStyle(PAL.jam, 1); g.fillCircle(18, 20, 10); g.lineStyle(3, PAL.jam, 1); g.strokeCircle(18, 20, 14); g.lineStyle(2, PAL.signal, 1); g.lineBetween(20, 7, 24, 2); g.lineBetween(24, 2, 28, 7);
    } else if (kind === 'coin') {
      g.fillStyle(PAL.wheat, 1); g.fillCircle(18, 18, 13); g.lineStyle(2, PAL.signal, 1); g.strokeCircle(18, 18, 10); g.fillStyle(PAL.ink, 1); g.fillCircle(18, 18, 3);
    } else if (kind === 'train') {
      g.fillStyle(PAL.rail, 1); g.fillRoundedRect(6, 10, 24, 17, 3); g.fillStyle(PAL.sky, 1); g.fillRect(19, 13, 8, 7); g.fillStyle(PAL.ink, 1); g.fillCircle(12, 29, 3); g.fillCircle(25, 29, 3);
    } else if (kind === 'shed' || kind === 'orchard' || kind === 'spur' || kind === 'market' || kind === 'tower') {
      g.fillStyle(color || PAL.leaf, 1); g.fillRect(7, 15, 24, 15); g.fillTriangle(5, 15, 19, 4, 33, 15); g.fillStyle(PAL.cream, 1); g.fillRect(17, 21, 5, 9);
      if (kind === 'orchard') { g.fillStyle(PAL.berry, 1); g.fillCircle(10, 10, 4); g.fillCircle(28, 10, 4); }
      if (kind === 'spur') { g.lineStyle(3, PAL.ink, 1); g.lineBetween(5, 32, 33, 32); g.lineBetween(10, 27, 10, 34); g.lineBetween(28, 27, 28, 34); }
      if (kind === 'market') { g.fillStyle(PAL.signal, 1); g.fillRect(9, 12, 20, 4); }
      if (kind === 'tower') { g.fillStyle(PAL.sky, 1); g.fillRect(15, 9, 8, 21); g.fillStyle(PAL.signal, 1); g.fillCircle(19, 8, 4); }
    } else if (kind === 'spark') {
      g.fillStyle(color || PAL.signal, 1); g.fillCircle(4, 4, 4);
    }
  }
  function makeIcon(scene, key, kind, color) { return makeTexture(scene, key, 36, 36, function (g) { drawIcon(g, kind, color); }); }
  function makeCropStage(scene, crop, stage) {
    makeTexture(scene, 'hj-crop-' + crop.id + '-' + stage, 42, 42, function (g) {
      var size = stage === 1 ? 0.62 : stage === 2 ? 1 : 0.72;
      var x = 21, base = 34;
      g.fillStyle(PAL.soilDark, 0.22); g.fillEllipse(x, 35, 26 * size, 6);
      if (stage === 3) { g.lineStyle(3, PAL.soilDark, 1); g.lineBetween(21, 32, 15, 17); g.lineBetween(21, 32, 28, 22); g.lineBetween(15, 17, 10, 20); return; }
      g.lineStyle(stage === 1 ? 2 : 3, crop.color, 1); g.lineBetween(x, base, x, 14 + (1 - size) * 8);
      if (crop.shape === 'clover') { g.fillStyle(crop.color, 1); [[x - 7, 20], [x + 7, 20], [x, 13], [x, 27]].forEach(function (p) { g.fillCircle(p[0], p[1], 5 * size); }); }
      else if (crop.shape === 'berries') { g.fillStyle(crop.color, 1); g.fillCircle(14, 25, 5 * size); g.fillCircle(23, 18, 5 * size); g.fillCircle(28, 27, 5 * size); g.lineStyle(2, PAL.leaf, 1); g.lineBetween(21, 19, 25, 10); }
      else if (crop.shape === 'root') { g.fillStyle(crop.color, 1); g.fillTriangle(21, 12, 13, 31, 29, 31); g.lineStyle(2, PAL.leaf, 1); g.lineBetween(21, 14, 21, 7); }
      else { g.lineStyle(2, crop.color, 1); g.lineBetween(21, 31, 13, 20); g.lineBetween(21, 27, 29, 16); g.fillStyle(crop.color, 1); g.fillRect(11, 17, 6, 4); g.fillRect(26, 13, 6, 4); }
    });
  }
  function makeTileTexture(scene) {
    makeTexture(scene, 'hj-tiles', 100, 20, function (g) {
      g.fillStyle(0xb8d6aa, 1); g.fillRect(0, 0, 20, 20); g.fillStyle(0xc4dfb1, 1); g.fillRect(2, 3, 3, 3); g.fillRect(14, 12, 3, 2);
      g.fillStyle(0x9fca92, 1); g.fillRect(20, 0, 20, 20); g.fillRect(20, 0, 20, 2); g.fillStyle(0x87b77d, 1); g.fillRect(27, 8, 2, 7); g.fillRect(34, 4, 2, 6);
      g.fillStyle(0xe5c98f, 1); g.fillRect(40, 0, 20, 20); g.fillStyle(0xd5b678, 1); g.fillRect(40, 4, 20, 2); g.fillRect(48, 12, 5, 2);
      g.fillStyle(0x78b8bd, 1); g.fillRect(60, 0, 20, 20); g.fillStyle(0x9bd5d4, 1); g.fillRect(62, 4, 12, 2); g.fillRect(68, 13, 9, 2);
      g.fillStyle(0x6b8f62, 1); g.fillRect(80, 0, 20, 20); g.fillStyle(0x9ac18e, 1); g.fillRect(82, 3, 3, 14); g.fillRect(92, 5, 3, 12); g.fillStyle(PAL.sand, 1); g.fillRect(80, 8, 20, 3);
    });
  }
  function makePlayerTexture(scene, key, frame) {
    makeTexture(scene, key, 28, 34, function (g) {
      var bob = frame === 1 ? 1 : frame === 2 ? -1 : 0;
      g.fillStyle(PAL.shadow, 0.25); g.fillEllipse(14, 31, 18, 5); g.fillStyle(PAL.deep, 1); g.fillRect(8, 9 + bob, 12, 16); g.fillStyle(PAL.signal, 1); g.fillRect(6, 8 + bob, 16, 5); g.fillStyle(PAL.ink, 1); g.fillRect(10, 14 + bob, 3, 3); g.fillRect(17, 14 + bob, 3, 3); g.fillStyle(PAL.leaf, 1); g.fillRect(8, 24 + bob, 5, 7); g.fillRect(16, 24 + bob, 5, 7);
    });
  }
  function bakePlayBase(scene) {
    return makeTexture(scene, 'hj-play-base', W, H, function (g) {
      g.fillStyle(PAL.paper, 1); g.fillRect(0, 0, W, H); g.fillStyle(PAL.deep, 1); g.fillRect(0, 0, W, 78); g.fillStyle(PAL.forest, 1); g.fillRect(0, 74, W, 4);
      g.fillStyle(PAL.mint, 1); g.fillRoundedRect(10, 112, 370, 244, 16); g.fillStyle(PAL.cream, 1); g.fillRoundedRect(10, 366, 370, 176, 16); g.fillRoundedRect(10, 550, 370, 93, 16); g.fillStyle(PAL.deep, 1); g.fillRoundedRect(10, 651, 370, 176, 16);
      g.fillStyle(PAL.sky, 0.12); g.fillRect(12, 113, 366, 243);
      g.lineStyle(2, PAL.leaf, 0.38); for (var y = 0; y <= 12; y++) g.lineBetween(15, 115 + y * 20, 375, 115 + y * 20); for (var x = 0; x <= 18; x++) g.lineBetween(15 + x * 20, 115, 15 + x * 20, 355);
      g.fillStyle(PAL.soil, 0.12); for (var fy = 0; fy < 3; fy++) g.fillRoundedRect(18, 160 + fy * 60, 354, 48, 5);
      g.fillStyle(PAL.leaf, 0.48); for (var fence = 20; fence < 374; fence += 28) { g.fillRect(fence, 116, 3, 8); g.fillRect(fence, 347, 3, 8); }
      g.lineStyle(3, PAL.sand, 0.8); g.lineBetween(18, 659, 372, 659); g.lineBetween(18, 818, 372, 818); g.lineStyle(2, PAL.rail, 0.9); g.lineBetween(22, 740, 368, 740); g.lineBetween(22, 777, 368, 777);
      for (var rx = 28; rx < 368; rx += 28) g.lineBetween(rx, 735, rx + 8, 782); g.fillStyle(PAL.signal, 1); g.fillRoundedRect(20, 690, 350, 5, 2);
    });
  }
  function bakeTownBase(scene) {
    return makeTexture(scene, 'hj-town-base', W, H, function (g) {
      g.fillStyle(PAL.paper, 1); g.fillRect(0, 0, W, H); g.fillStyle(PAL.deep, 1); g.fillRect(0, 0, W, 78); g.fillStyle(PAL.forest, 1); g.fillRect(0, 74, W, 4);
      g.fillStyle(0xe7d6b6, 1); g.fillRoundedRect(10, 104, 370, 654, 18); g.fillStyle(PAL.mint, 0.65); g.fillRoundedRect(18, 126, 354, 610, 14);
      g.lineStyle(12, PAL.sand, 0.8); g.lineBetween(195, 120, 195, 744); g.lineBetween(22, 252, 368, 252); g.lineBetween(22, 380, 368, 380); g.lineBetween(22, 508, 368, 508); g.lineBetween(22, 636, 368, 636); g.lineStyle(3, PAL.leaf, 0.65); g.lineBetween(25, 118, 365, 118); g.lineBetween(25, 746, 365, 746);
    });
  }

  function factoryCapacity() { return profile.buildings[3] ? 2 : 1; }
  function plotCapacity(layout) { return Math.min(8, layout.plots.length + (profile.buildings[0] ? 1 : 0) + (profile.buildings[1] ? 1 : 0) + (profile.buildings[5] ? 1 : 0)); }
  function orderCapacity(order) { return Math.min(5, order.capacity + (profile.buildings[2] ? 1 : 0)); }
  function blankPlot(identity) { return { identity: identity, crop: null, stage: 0, pulse: 0, water: 0, health: 100, growSteps: 0 }; }
  function blankInventory() { return GOOD_IDS.reduce(function (out, id) { out[id] = 0; return out; }, {}); }
  function queueEntry(input) { return { input: input, progress: 0, ready: false }; }
  function shortText(value, max) { var text = String(value); return text.length > max ? text.slice(0, Math.max(1, max - 1)) + '...' : text; }

  var PlayScene = function () { Phaser.Scene.call(this, { key: 'harvest-junction' }); };
  PlayScene.prototype = Object.create(Phaser.Scene.prototype);
  PlayScene.prototype.constructor = PlayScene;

  PlayScene.prototype.preload = function () {
    kit.loader.show('Harvest Junction'); kit.loader.progress(0.25);
    kit.audio.register({ plant_rustle: '/play/harvest-junction/assets/plant_rustle.mp3', harvest_chime: '/play/harvest-junction/assets/harvest_chime.mp3', factory_clank: '/play/harvest-junction/assets/factory_clank.mp3', departure_horn: '/play/harvest-junction/assets/departure_horn.mp3', ui_tick: '/play/harvest-junction/assets/ui_tick.mp3', water_splash: '/play/harvest-junction/assets/water_splash.mp3', crop_ready: '/play/harvest-junction/assets/crop_ready.mp3', building_chime: '/play/harvest-junction/assets/building_chime.mp3', farm_theme: '/play/harvest-junction/assets/farm_theme.mp3', town_theme: '/play/harvest-junction/assets/town_theme.mp3' });
    kit.audio.preload(['plant_rustle', 'harvest_chime', 'factory_clank', 'departure_horn', 'ui_tick', 'water_splash', 'crop_ready', 'building_chime', 'farm_theme', 'town_theme']); kit.loader.progress(1);
  };

  PlayScene.prototype.create = function () {
    configureRetinaScene(this);
    kit.loader.hide(); document.getElementById('boot-fallback').hidden = true; this.simSteps = 0; this.acc = 0; this.simPaused = kit.paused; this.mode = 'play';
    this.focus = { zone: 'seed', index: 0 }; this.focusActive = false; this.townFocus = 0; this.townDraft = -1; this.pointerSessions = new Map(); this.gamepad = null; this.gamepadEdges = {}; this.motionReduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.makeTextures();
    this.dragGhost = this.add.image(0, 0, 'hj-icon-wheat').setDepth(40).setVisible(false).setAlpha(0.92);
    this.dropPreview = this.add.rectangle(0, 0, 82, 58, PAL.signal, 0.16).setStrokeStyle(3, PAL.signal, 1).setDepth(18).setVisible(false);
    this.focusRing = this.add.rectangle(0, 0, 10, 10, PAL.signal, 0).setStrokeStyle(2, PAL.signal, 1).setDepth(22).setVisible(false);
    this.playBase = this.add.image(0, 0, bakePlayBase(this)).setOrigin(0, 0).setDepth(-20); this.townBase = this.add.image(0, 0, bakeTownBase(this)).setOrigin(0, 0).setDepth(-20).setVisible(false);
    this.makeViews(); this.makeHud(); this.makeParticles(); this.bindInput(); this.bindAccessibleControls(); this.resetRun(false); this.makeFarmTilemap(); this.updateAllViews(true); this.syncDebug(); Game.scene = this; window.__HJ_READY = true;
    kit.audio.music('farm_theme', 900);
    if (DEBUG_STATE.forceOrder != null) this.forceOrder(DEBUG_STATE.forceOrder); if (DEBUG_STATE.forceTown != null) this.forceTown(DEBUG_STATE.forceTown);
  };

  PlayScene.prototype.makeFarmTilemap = function () {
    if (this.farmLayer) this.farmLayer.destroy();
    this.farmTilemap = this.make.tilemap({ data: this.run.tilemap || buildFarmTilemap(), tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    var tileset = this.farmTilemap.addTilesetImage('hj-tiles', 'hj-tiles', TILE_SIZE, TILE_SIZE, 0, 0);
    this.farmLayer = this.farmTilemap.createLayer(0, tileset, 15, 115).setDepth(-19);
    this.farmTilemap.setLayer(this.farmLayer); this.farmLayer.setCollision([3, 4]);
    this.seasonOverlay = this.add.rectangle(195, 235, 360, 240, SEASONS[this.run.season].tint, 0.06).setDepth(-18);
    this.player = this.add.image(this.run.player.x, this.run.player.y, 'hj-player-idle').setDepth(12);
  };
  PlayScene.prototype.bindAccessibleControls = function () {
    var scene = this; var town = document.getElementById('accessible-town'); var restart = document.getElementById('accessible-restart');
    if (town) town.addEventListener('click', function () { if (!kit.paused) scene.toggleTown(); });
    if (restart) restart.addEventListener('click', function () { if (!kit.paused) kit.restart(); });
  };

  PlayScene.prototype.makeTextures = function () {
    var scene = this;
    CROP_DATA.forEach(function (crop) { makeIcon(scene, 'hj-icon-' + crop.id, crop.shape, crop.color); });
    CROP_DATA.forEach(function (crop) { [1, 2, 3].forEach(function (stage) { makeCropStage(scene, crop, stage); }); });
    GOOD_DATA.forEach(function (good) { makeIcon(scene, 'hj-good-' + good.id, good.icon, good.color); });
    RECIPE_DATA.forEach(function (recipe) { makeIcon(scene, 'hj-icon-' + recipe.icon, recipe.icon, recipe.color); });
    BUILDINGS.forEach(function (building) { makeIcon(scene, 'hj-building-' + building.id, building.icon, PAL.leaf); });
    makeIcon(scene, 'hj-icon-coin', 'coin', PAL.wheat);
    makeIcon(scene, 'hj-icon-train', 'train', PAL.rail);
    makeTexture(scene, 'hj-icon-spark', 8, 8, function (g) { drawIcon(g, 'spark', PAL.signal); });
    makeTileTexture(scene); makePlayerTexture(scene, 'hj-player-idle', 0); makePlayerTexture(scene, 'hj-player-walk-a', 1); makePlayerTexture(scene, 'hj-player-walk-b', 2);
  };

  PlayScene.prototype.makeViews = function () {
    var scene = this; this.plotViews = [];
    for (var pi = 0; pi < 8; pi++) this.plotViews.push({ bg: scene.add.rectangle(0, 0, 82, 58, PAL.mint, 1).setStrokeStyle(2, PAL.sand, 1), icon: scene.add.image(0, 0, 'hj-icon-wheat'), label: scene.add.text(0, 0, '', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '13px', color: '#24352d', fontStyle: 'bold' }).setOrigin(0.5), status: scene.add.text(0, 0, '', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '11px', color: '#2b6a4d', fontStyle: 'bold' }).setOrigin(0.5), mark: scene.add.rectangle(0, 0, 7, 7, PAL.leaf, 1), water: scene.add.rectangle(0, 0, 42, 3, PAL.skyDark, 1) });
    this.seedViews = [];
    for (var si = 0; si < CROP_DATA.length; si++) this.seedViews.push({ bg: scene.add.rectangle(0, 0, 84, 46, PAL.cream, 1).setStrokeStyle(2, PAL.sand, 1), icon: scene.add.image(0, 0, 'hj-icon-' + CROP_DATA[si].id), label: scene.add.text(0, 0, CROP_DATA[si].label, { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '14px', color: '#24352d', fontStyle: 'bold' }).setOrigin(0.5), count: scene.add.text(0, 0, '', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '14px', color: '#1f493b', fontStyle: 'bold' }).setOrigin(0.5) });
    this.factoryViews = [];
    for (var fi = 0; fi < RECIPE_DATA.length; fi++) { var recipe = RECIPE_DATA[fi]; this.factoryViews.push({ bg: scene.add.rectangle(0, 0, 171, 43, PAL.cream, 1).setStrokeStyle(2, recipe.color, 1), icon: scene.add.image(0, 0, 'hj-icon-' + recipe.icon), name: scene.add.text(0, 0, recipe.name, { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '12px', color: '#24352d', fontStyle: 'bold' }).setOrigin(0, 0.5), flow: scene.add.text(0, 0, '', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '11px', color: '#2b6a4d' }).setOrigin(0, 0.5), slot: scene.add.text(0, 0, '', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '11px', color: '#c95355', fontStyle: 'bold' }).setOrigin(1, 0.5) }); }
    this.pantryViews = [];
    for (var gi = 0; gi < GOOD_DATA.length; gi++) { var good = GOOD_DATA[gi]; this.pantryViews.push({ bg: scene.add.rectangle(0, 0, 42, 56, PAL.mint, 1).setStrokeStyle(2, PAL.sand, 1), icon: scene.add.image(0, 0, 'hj-good-' + good.id), count: scene.add.text(0, 0, '0', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '15px', color: '#24352d', fontStyle: 'bold' }).setOrigin(0.5) }); }
    this.carViews = [];
    for (var ci = 0; ci < 5; ci++) this.carViews.push({ bg: scene.add.rectangle(0, 0, 66, 76, PAL.cream, 1).setStrokeStyle(2, PAL.sand, 1), icon: scene.add.image(0, 0, 'hj-good-bread'), count: scene.add.text(0, 0, '', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '15px', color: '#24352d', fontStyle: 'bold' }).setOrigin(0.5), pip: scene.add.rectangle(0, 0, 32, 4, PAL.sand, 1) });
    this.townViews = [];
    for (var bi = 0; bi < BUILDINGS.length; bi++) { var building = BUILDINGS[bi]; this.townViews.push({ bg: scene.add.rectangle(0, 0, 176, 112, PAL.cream, 1).setStrokeStyle(2, PAL.sand, 1), icon: scene.add.image(0, 0, 'hj-building-' + building.id), name: scene.add.text(0, 0, building.name, { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '15px', color: '#24352d', fontStyle: 'bold' }).setOrigin(0, 0.5), effect: scene.add.text(0, 0, building.effect, { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '14px', color: '#2b6a4d' }).setOrigin(0, 0.5), status: scene.add.text(0, 0, '', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '14px', color: '#c95355', fontStyle: 'bold' }).setOrigin(0, 0.5), ghost: scene.add.rectangle(0, 0, 164, 100, PAL.signal, 0.13).setStrokeStyle(3, PAL.signal, 1).setVisible(false) }); }
  };

  PlayScene.prototype.makeHud = function () {
    this.brand = this.add.text(16, 17, 'HARVEST', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '16px', color: '#fff9ea', fontStyle: 'bold' }).setOrigin(0, 0);
    this.brand2 = this.add.text(16, 40, 'JUNCTION', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '16px', color: '#bfe4b6', fontStyle: 'bold' }).setOrigin(0, 0);
    this.coinIcon = this.add.image(189, 38, 'hj-icon-coin').setScale(0.72); this.coinText = this.add.text(209, 38, '0', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '16px', color: '#fff9ea', fontStyle: 'bold' }).setOrigin(0, 0.5);
    this.orderText = this.add.text(252, 20, '1 / 3', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '15px', color: '#fff9ea', fontStyle: 'bold' }).setOrigin(0, 0.5); this.orderIcon = this.add.image(252, 46, 'hj-icon-train').setScale(0.52); this.modeText = this.add.text(270, 46, 'TOWN', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '14px', color: '#bfe4b6', fontStyle: 'bold' }).setOrigin(0, 0.5);
    this.settingsButton = this.add.rectangle(312, 38, 28, 44, PAL.forest, 1).setStrokeStyle(1, PAL.leaf, 0.8); this.settingsText = this.add.text(312, 38, '⚙', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#fff9ea' }).setOrigin(0.5); this.resetButton = this.add.rectangle(350, 38, 28, 44, PAL.forest, 1).setStrokeStyle(1, PAL.leaf, 0.8); this.resetText = this.add.text(350, 38, 'R', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '17px', color: '#fff9ea', fontStyle: 'bold' }).setOrigin(0.5);
    this.tutorialBg = this.add.rectangle(195, 94, 360, 28, PAL.cream, 0.88).setStrokeStyle(1, PAL.sand, 0.6); this.tutorialText = this.add.text(195, 94, '', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '14px', color: '#2b6a4d', fontStyle: 'bold' }).setOrigin(0.5);
    this.chipBg = this.add.rectangle(18, 94, 150, 30, PAL.deep, 0.96).setStrokeStyle(2, PAL.signal, 1).setVisible(false); this.chipText = this.add.text(18, 94, '', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '14px', color: '#fff9ea', fontStyle: 'bold' }).setOrigin(0, 0.5).setVisible(false);
    this.fieldHeader = this.add.text(18, 130, '', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '15px', color: '#1f493b', fontStyle: 'bold' }).setOrigin(0, 0.5);
    this.fieldMeta = this.add.text(372, 130, '', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '14px', color: '#5ca36b', fontStyle: 'bold' }).setOrigin(1, 0.5);
    this.seedHeader = this.add.text(18, 298, 'SEED CART', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '14px', color: '#2b6a4d', fontStyle: 'bold' }).setOrigin(0, 0.5);
    this.factoryHeader = this.add.text(18, 381, 'FACTORIES', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '15px', color: '#1f493b', fontStyle: 'bold' }).setOrigin(0, 0.5);
    this.factoryMeta = this.add.text(372, 381, 'TAP  QUEUE  >  FINISH', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '14px', color: '#5ca36b', fontStyle: 'bold' }).setOrigin(1, 0.5);
    this.pantryHeader = this.add.text(18, 565, 'PANTRY', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '15px', color: '#1f493b', fontStyle: 'bold' }).setOrigin(0, 0.5);
    this.pantryMeta = this.add.text(372, 565, 'DRAG  >  RAIL', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '14px', color: '#5ca36b', fontStyle: 'bold' }).setOrigin(1, 0.5);
    this.railHeader = this.add.text(18, 679, '', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '15px', color: '#fff9ea', fontStyle: 'bold' }).setOrigin(0, 0.5);
    this.railMeta = this.add.text(372, 679, '', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '14px', color: '#bfe4b6', fontStyle: 'bold' }).setOrigin(1, 0.5);
    this.townHeader = this.add.text(18, 96, 'TOWN LEDGER', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '20px', color: '#1f493b', fontStyle: 'bold' }).setOrigin(0, 0.5);
    this.townMeta = this.add.text(372, 96, '', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '14px', color: '#c95355', fontStyle: 'bold' }).setOrigin(1, 0.5);
    this.bannerBg = this.add.rectangle(195, 415, 336, 210, PAL.deep, 0.98).setStrokeStyle(3, PAL.signal, 1).setDepth(60).setVisible(false); this.bannerTitle = this.add.text(195, 345, '', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '21px', color: '#fff9ea', fontStyle: 'bold', align: 'center', wordWrap: { width: 300 } }).setOrigin(0.5).setDepth(61); this.bannerSub = this.add.text(195, 389, '', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '15px', color: '#bfe4b6', fontStyle: 'bold', align: 'center', wordWrap: { width: 300 } }).setOrigin(0.5).setDepth(61); this.bannerDetail = this.add.text(195, 447, '', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '14px', color: '#fff9ea', align: 'center', wordWrap: { width: 296 } }).setOrigin(0.5).setDepth(61); this.bannerPrompt = this.add.text(195, 508, 'Tap or press Space to continue', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '14px', color: '#f1cf62', fontStyle: 'bold', align: 'center' }).setOrigin(0.5).setDepth(61);
    this.hudObjects = [this.brand, this.brand2, this.coinIcon, this.coinText, this.orderText, this.orderIcon, this.modeText, this.settingsButton, this.settingsText, this.resetButton, this.resetText, this.tutorialBg, this.tutorialText, this.chipBg, this.chipText, this.fieldHeader, this.fieldMeta, this.seedHeader, this.factoryHeader, this.factoryMeta, this.pantryHeader, this.pantryMeta, this.railHeader, this.railMeta, this.townHeader, this.townMeta];
  };

  PlayScene.prototype.makeParticles = function () {
    this.particles = [];
    for (var i = 0; i < MAX_PARTICLES; i++) this.particles.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0, size: 1, color: PAL.signal, sprite: this.add.image(0, 0, 'hj-icon-spark').setDepth(45).setVisible(false) });
  };
  PlayScene.prototype.makeRun = function (index) {
    var orderIndex = index == null ? profile.orders : Math.max(0, Math.floor(index)); var order = orderFor(orderIndex); var layout = layoutById(order.layout); var plots = [];
    for (var i = 0; i < plotCapacity(layout); i++) plots.push(blankPlot(layout.plots[i % layout.plots.length] || 'wheat'));
    var queues = {}; RECIPE_DATA.forEach(function (recipe) { queues[recipe.id] = []; });
    return { version: RUN_VERSION, orderIndex: orderIndex, order: order, layout: layout, plots: plots, inventory: blankInventory(), loaded: {}, queues: queues, tilemap: buildFarmTilemap(), simStart: this.simSteps, idleSteps: 0, factoryWasted: 0, factoryTouches: 0, factoryFinishes: 0, phase: 'play', readyFlash: 0, railFx: 0, chip: null, banner: null, tutorial: 4.0, carry: null, tutorialText: '', day: 1, season: 0, seasonSteps: 0, seasonFx: 0, player: { x: 195, y: 226, dir: 0, step: 0 } };
  };
  PlayScene.prototype.serializeRun = function () {
    if (!this.run) return null;
    return { version: RUN_VERSION, orderIndex: this.run.orderIndex, plots: this.run.plots.map(function (p) { return { crop: p.crop, stage: p.stage, water: p.water, health: p.health, growSteps: p.growSteps }; }), inventory: cloneGoods(this.run.inventory), loaded: cloneGoods(this.run.loaded), queues: RECIPE_DATA.reduce(function (out, recipe) { out[recipe.id] = (this.run.queues[recipe.id] || []).map(function (entry) { return { input: entry.input, progress: entry.progress, ready: !!entry.ready }; }); return out; }.bind(this), {}), idleSteps: this.run.idleSteps, factoryWasted: this.run.factoryWasted, factoryTouches: this.run.factoryTouches, factoryFinishes: this.run.factoryFinishes, readyFlash: this.run.readyFlash, railFx: this.run.railFx, day: this.run.day, season: this.run.season, seasonSteps: this.run.seasonSteps, seasonFx: this.run.seasonFx, player: this.run.player };
  };
  PlayScene.prototype.saveGame = function () { kit.save.set({ version: SAVE_VERSION, coins: profile.coins, orders: profile.orders, buildings: profile.buildings.slice(), medals: profile.medals.slice(), seeds: cloneGoods(profile.seeds), run: this.serializeRun() }); };
  PlayScene.prototype.resetRun = function (restart) {
    var restored = !restart && pendingRun && pendingRun.orderIndex === profile.orders ? pendingRun : null; pendingRun = null;
    this.mode = 'play'; this.playBase.setVisible(true); this.townBase.setVisible(false); this.townDraft = -1; this.run = restored || this.makeRun(profile.orders); this.run.simStart = this.simSteps; this.focus = { zone: 'seed', index: 0 }; this.focusActive = false; this.pointerSessions.clear(); this.dragGhost.setVisible(false); this.dropPreview.setVisible(false); this.hideBanner(); if (!restored) this.showTutorial('Drag a seed to a plot, then keep it watered.', 4.0); this.updateAllViews(true); this.syncDebug(); this.saveGame();
  };
  PlayScene.prototype.setKitPaused = function (paused) { this.simPaused = !!paused; if (paused) { this.pointerSessions.clear(); this.dragGhost.setVisible(false); this.dropPreview.setVisible(false); this.saveGame(); } };
  PlayScene.prototype.showTutorial = function (text, ttl) { this.run.tutorial = ttl == null ? 3 : ttl; this.run.tutorialText = String(text || '').slice(0, 72); this.run.chip = null; };
  PlayScene.prototype.showChip = function (text, color) { if (this.run.banner) return; this.run.chip = { text: String(text || '').slice(0, 42), color: color || PAL.signal, life: 1.0 }; this.run.tutorial = 0; };
  PlayScene.prototype.showBanner = function (title, sub, detail) { this.run.banner = { title: title, sub: sub, detail: detail, life: 3.0 }; this.run.chip = null; this.run.tutorial = 0; };
  PlayScene.prototype.hideBanner = function () { if (this.run) this.run.banner = null; if (this.bannerBg) { this.bannerBg.setVisible(false); this.bannerTitle.setVisible(false); this.bannerSub.setVisible(false); this.bannerDetail.setVisible(false); this.bannerPrompt.setVisible(false); } };
  PlayScene.prototype.syncDebug = function () {
    var run = this.run; DEBUG_STATE.mode = this.mode; DEBUG_STATE.orders = profile.orders; DEBUG_STATE.coins = profile.coins; DEBUG_STATE.town = { buildings: profile.buildings.slice(), draft: this.townDraft };
    if (run) DEBUG_STATE.farm = { layout: run.layout.id, order: run.order.id, freePlay: profile.orders >= CORE_ORDERS.length, plots: run.plots.map(function (p) { return { identity: p.identity, crop: p.crop, stage: p.stage }; }), inventory: cloneGoods(run.inventory), loaded: cloneGoods(run.loaded), ready: this.orderReady() };
    window.__hj.state = DEBUG_STATE;
  };
  PlayScene.prototype.updateAccessibleState = function () {
    var live = document.getElementById('accessible-state'); if (!live || !this.run) return;
    var growing = this.run.plots.filter(function (p) { return p.stage === 1; }).length; var ready = this.run.plots.filter(function (p) { return p.stage === 2; }).length;
    var text = this.mode === 'town' ? 'Town ledger. ' + profile.coins + ' route coins. Building ' + (this.townFocus + 1) + ' of ' + BUILDINGS.length + '.' : this.run.order.title + '. ' + ready + ' crops ready, ' + growing + ' growing. Rail order ' + this.filledCount() + ' of ' + orderCapacity(this.run.order) + '. Season ' + SEASONS[this.run.season].name + ', day ' + this.run.day + '.';
    if (live.textContent !== text) live.textContent = text;
  };
  PlayScene.prototype.forceOrder = function (index) { if (!this.run) return; var n = safeNumber(Number(index), profile.orders, 999999); this.mode = 'play'; this.playBase.setVisible(true); this.townBase.setVisible(false); this.run = this.makeRun(n); this.townDraft = -1; this.showChip('Order ' + (n + 1) + ' loaded', PAL.signal); this.updateAllViews(true); this.syncDebug(); };
  PlayScene.prototype.forceTown = function (value) { if (value === false) { this.toggleTown(false); return; } this.toggleTown(true); if (typeof value === 'number') this.townFocus = clamp(Math.floor(value), 0, BUILDINGS.length - 1); this.updateAllViews(true); this.syncDebug(); };
  PlayScene.prototype.toggleTown = function (forceOpen) { var next = forceOpen == null ? this.mode !== 'town' : !!forceOpen; this.mode = next ? 'town' : 'play'; this.playBase.setVisible(!next); this.townBase.setVisible(next); this.pointerSessions.clear(); this.dragGhost.setVisible(false); this.dropPreview.setVisible(false); if (!next) this.townDraft = -1; this.showChip(next ? 'Town ledger' : 'Back to farm', next ? PAL.signal : PAL.leaf); this.updateAllViews(true); this.syncDebug(); kit.audio.sfx('ui_tick', { volume: 0.5 }); kit.audio.music(next ? 'town_theme' : 'farm_theme', 700); this.saveGame(); };

  PlayScene.prototype.plotRect = function (i) { return { x: 18 + (i % 4) * 89, y: 155 + Math.floor(i / 4) * 67, w: 82, h: 58 }; };
  PlayScene.prototype.seedRect = function (i) { return { x: 18 + i * 89, y: 308, w: 84, h: 46 }; };
  PlayScene.prototype.factoryRect = function (i) { return { x: i % 2 ? 201 : 18, y: 395 + Math.floor(i / 2) * 48, w: 171, h: 43 }; };
  PlayScene.prototype.pantryRect = function (i) { return { x: 14 + i * 46, y: 580, w: 42, h: 56 }; };
  PlayScene.prototype.carRect = function () { return { x: 18, y: 706, w: 354, h: 94 }; };
  PlayScene.prototype.townRect = function (i) { return { x: i % 2 ? 202 : 14, y: 138 + Math.floor(i / 2) * 128, w: 176, h: 112 }; };
  PlayScene.prototype.inRect = function (x, y, r, pad) { var p = pad || 0; return x >= r.x - p && x <= r.x + r.w + p && y >= r.y - p && y <= r.y + r.h + p; };
  PlayScene.prototype.activeFactoryIds = function () { return this.run.layout.factories || ['mill']; };
  PlayScene.prototype.factoryIdAt = function (i) { return this.activeFactoryIds()[i] || 'mill'; };
  PlayScene.prototype.seedAllowed = function (id) { return this.run.layout.activeCrops.indexOf(id) >= 0; };
  PlayScene.prototype.hitAt = function (x, y) {
    if (this.mode === 'town') {
      if (this.inRect(x, y, { x: 310, y: 16, w: 30, h: 44 }, 6)) return { kind: 'settings' }; if (this.inRect(x, y, { x: 350, y: 16, w: 30, h: 44 }, 6)) return { kind: 'reset' }; if (this.inRect(x, y, { x: 252, y: 16, w: 48, h: 44 }, 6)) return { kind: 'townToggle' };
      for (var bi = 0; bi < BUILDINGS.length; bi++) if (this.inRect(x, y, this.townRect(bi), 5)) return { kind: 'building', index: bi }; return { kind: 'none' };
    }
    if (this.inRect(x, y, { x: 310, y: 16, w: 30, h: 44 }, 6)) return { kind: 'settings' }; if (this.inRect(x, y, { x: 350, y: 16, w: 30, h: 44 }, 6)) return { kind: 'reset' }; if (this.inRect(x, y, { x: 252, y: 16, w: 48, h: 44 }, 6)) return { kind: 'townToggle' };
    for (var si = 0; si < CROP_DATA.length; si++) if (this.inRect(x, y, this.seedRect(si), 6)) return { kind: 'seed', index: si };
    for (var pi = 0; pi < this.run.plots.length; pi++) if (this.inRect(x, y, this.plotRect(pi), 6)) return { kind: 'plot', index: pi };
    for (var fi = 0; fi < this.activeFactoryIds().length; fi++) if (this.inRect(x, y, this.factoryRect(fi), 5)) return { kind: x < this.factoryRect(fi).x + this.factoryRect(fi).w * 0.58 ? 'factoryQueue' : 'factoryFinish', index: fi };
    for (var gi = 0; gi < GOOD_DATA.length; gi++) if (this.inRect(x, y, this.pantryRect(gi), 6)) return { kind: 'pantry', index: gi };
    if (this.inRect(x, y, this.carRect(), 8)) return { kind: 'car' }; if (this.run.banner && this.inRect(x, y, { x: 27, y: 310, w: 336, h: 210 }, 10)) return { kind: 'banner' }; return { kind: 'none' };
  };
  function pointerKey(p) { return p && p.event && p.event.pointerId != null ? p.event.pointerId : p && p.id; }
  PlayScene.prototype.kitPointer = function (p) {
    var ev = p && p.event; if (!ev) return null; var id = pointerKey(p); var live = kit.input.pointers.get(id); if (!live && p.isDown) { live = { x: ev.clientX, y: ev.clientY, startX: ev.clientX, startY: ev.clientY, downAt: performance.now(), zone: null }; kit.input.pointers.set(id, live); }
    var cx = live ? live.x : ev.clientX; var cy = live ? live.y : ev.clientY; var rect = this.game.canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return null; return { x: (cx - rect.left) * W / rect.width, y: (cy - rect.top) * H / rect.height, id: id };
  };
  PlayScene.prototype.bindInput = function () {
    var scene = this;
    this.input.on('pointerdown', function (p) { if (kit.paused) return; var pos = scene.kitPointer(p); if (!pos) return; var hit = scene.hitAt(pos.x, pos.y); scene.pointerSessions.set(pos.id, { id: pos.id, x: pos.x, y: pos.y, startX: pos.x, startY: pos.y, dragging: false, kind: hit.kind, index: hit.index }); });
    this.input.on('pointermove', function (p) { var s = scene.pointerSessions.get(pointerKey(p)); if (!s) return; var pos = scene.kitPointer(p); if (!pos) return; s.x = pos.x; s.y = pos.y; s.dragging = s.dragging || Math.hypot(pos.x - s.startX, pos.y - s.startY) > 8; scene.updateDragPreview(s); });
    function release(p, cancelled) { var key = pointerKey(p); var s = scene.pointerSessions.get(key); if (!s) return; var ev = p.event || {}; var rect = scene.game.canvas.getBoundingClientRect(); var cx = ev.clientX == null ? p.x : ev.clientX; var cy = ev.clientY == null ? p.y : ev.clientY; s.x = (cx - rect.left) * W / rect.width; s.y = (cy - rect.top) * H / rect.height; scene.pointerSessions.delete(key); scene.dragGhost.setVisible(false); scene.dropPreview.setVisible(false); if (cancelled || kit.paused) return; scene.handlePointerRelease(s); }
    this.input.on('pointerup', function (p) { release(p, false); }); this.input.on('pointerupoutside', function (p) { release(p, false); }); this.input.on('pointercancel', function (p) { release(p, true); });
    window.addEventListener('gamepadconnected', function (event) { scene.gamepad = event.gamepad; window.__hj.gamepadConnected = true; });
    window.addEventListener('gamepaddisconnected', function (event) { if (!scene.gamepad || scene.gamepad.index === event.gamepad.index) scene.gamepad = null; window.__hj.gamepadConnected = false; });
    this.input.keyboard.on('keydown', function (event) { if (kit.paused) return; var code = event.code; if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyR', 'KeyT', 'Escape', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].indexOf(code) < 0) return; event.preventDefault(); scene.focusActive = true; if (code === 'KeyR') { kit.restart(); return; } if (code === 'KeyT') { scene.toggleTown(); return; } if (code === 'Escape' && scene.mode === 'town') { scene.toggleTown(false); return; } if (code === 'KeyW') scene.movePlayer(0, -1); else if (code === 'KeyA') scene.movePlayer(-1, 0); else if (code === 'KeyS') scene.movePlayer(0, 1); else if (code === 'KeyD') scene.movePlayer(1, 0); else if (code === 'ArrowLeft') scene.moveFocus(-1, 0); else if (code === 'ArrowRight') scene.moveFocus(1, 0); else if (code === 'ArrowUp') scene.moveFocus(0, -1); else if (code === 'ArrowDown') scene.moveFocus(0, 1); else if (code === 'Space') scene.keyboardAct(); });
  };
  PlayScene.prototype.updateDragPreview = function (s) {
    var crop = CROP_DATA[s.index] || CROP_DATA[0]; var item = GOOD_DATA[s.index] || GOOD_DATA[0]; var plotCrop = s.kind === 'plot' && this.run.plots[s.index] && this.run.plots[s.index].crop ? cropById(this.run.plots[s.index].crop) : null; var iconKey = s.kind === 'seed' ? 'hj-icon-' + crop.id : s.kind === 'pantry' ? 'hj-good-' + item.id : plotCrop ? 'hj-good-' + plotCrop.output : 'hj-icon-wheat'; if (this.dragGhost.texture.key !== iconKey) this.dragGhost.setTexture(iconKey); this.dragGhost.setPosition(s.x, s.y).setVisible(s.dragging);
    if (s.kind === 'seed' && s.dragging) { var target = -1; for (var i = 0; i < this.run.plots.length; i++) if (this.inRect(s.x, s.y, this.plotRect(i), 8)) { target = i; break; } if (target >= 0) { var r = this.plotRect(target); this.dropPreview.setPosition(r.x + r.w / 2, r.y + r.h / 2).setSize(r.w, r.h).setVisible(true); } else this.dropPreview.setVisible(false); }
    else if (s.kind === 'plot' && s.dragging && this.inRect(s.x, s.y, { x: 10, y: 550, w: 370, h: 93 }, 8)) this.dropPreview.setPosition(195, 596).setSize(360, 84).setVisible(true);
    else if (s.kind === 'pantry' && s.dragging && this.inRect(s.x, s.y, this.carRect(), 8)) this.dropPreview.setPosition(195, 752).setSize(340, 84).setVisible(true); else this.dropPreview.setVisible(false);
  };
  PlayScene.prototype.handlePointerRelease = function (s) {
    var targetPlot = -1; for (var i = 0; i < this.run.plots.length; i++) if (this.inRect(s.x, s.y, this.plotRect(i), 8)) { targetPlot = i; break; }
    if (s.kind === 'banner') { this.dismissBanner(); return; } if (s.kind === 'settings') { kit.openSettings(); return; } if (s.kind === 'reset') { kit.restart(); return; } if (s.kind === 'townToggle') { this.toggleTown(); return; } if (s.kind === 'building' && !s.dragging) { this.selectBuilding(s.index); return; } if (this.mode === 'town') return;
    if (s.kind === 'seed') { if (s.dragging && targetPlot >= 0) this.plant(targetPlot, CROP_DATA[s.index] ? CROP_DATA[s.index].id : 'wheat'); else if (!s.dragging) this.pickSeed(s.index); }
    else if (s.kind === 'plot') { if (s.dragging && this.inRect(s.x, s.y, { x: 10, y: 550, w: 370, h: 93 }, 8)) this.harvest(s.index); else if (!s.dragging) this.activatePlot(s.index); }
    else if ((s.kind === 'factoryQueue' || s.kind === 'factoryFinish') && !s.dragging) this.useFactory(this.factoryIdAt(s.index), s.kind === 'factoryQueue' ? 'queue' : 'finish');
    else if (s.kind === 'pantry') { if (s.dragging && this.inRect(s.x, s.y, this.carRect(), 8)) this.loadGood(GOOD_DATA[s.index] ? GOOD_DATA[s.index].id : 'bread'); else if (!s.dragging) this.pickGood(GOOD_DATA[s.index] ? GOOD_DATA[s.index].id : 'bread'); }
    else if (s.kind === 'car' && !s.dragging) { if (this.run.carry && this.run.carry.kind === 'good') this.loadGood(this.run.carry.id); else this.attemptOrder(); }
  };

  PlayScene.prototype.pickSeed = function (index) { var crop = CROP_DATA[index] || CROP_DATA[0]; if (!this.seedAllowed(crop.id)) { this.showChip('Not in this field', PAL.red); return; } if (!profile.seeds[crop.id]) { this.showChip('No seeds', PAL.red); return; } this.run.carry = { kind: 'seed', id: crop.id }; this.showChip(crop.label + ' seed selected', crop.color); };
  PlayScene.prototype.plant = function (index, cropId) { var plot = this.run.plots[index]; var crop = cropById(cropId); if (!plot || plot.crop) { this.showChip('Plot occupied', PAL.red); return false; } if (!this.seedAllowed(crop.id) || !profile.seeds[crop.id]) { this.showChip('Seed unavailable', PAL.red); return false; } profile.seeds[crop.id] -= 1; plot.crop = crop.id; plot.stage = 1; plot.water = 72; plot.health = 100; plot.growSteps = 0; plot.pulse = 1; this.run.carry = null; this.emitBurst(this.plotRect(index).x + 41, this.plotRect(index).y + 29, crop.color, 9); kit.audio.sfx('plant_rustle', { volume: 0.7 }); this.showChip('Planted. Tap to water.', crop.color); this.updateAllViews(true); this.syncDebug(); this.saveGame(); return true; };
  PlayScene.prototype.waterPlot = function (index) { var plot = this.run.plots[index]; if (!plot || !plot.crop || plot.stage !== 1) return false; plot.water = 100; plot.health = Math.min(100, plot.health + 8); plot.pulse = 1; this.run.readyFlash = 0.2; this.emitBurst(this.plotRect(index).x + 41, this.plotRect(index).y + 29, PAL.skyDark, 7); kit.audio.sfx('water_splash', { volume: 0.72 }); this.showChip('Watered. Growth is on.', PAL.skyDark); this.updateAllViews(true); this.syncDebug(); this.saveGame(); return true; };
  PlayScene.prototype.activatePlot = function (index) { var plot = this.run.plots[index]; if (!plot) return; if (!plot.crop) { this.showChip('Drag a seed here', PAL.leaf); return; } if (plot.stage === 1) { this.waterPlot(index); return; } if (plot.stage === 3) { plot.crop = null; plot.stage = 0; plot.water = 0; plot.health = 100; plot.growSteps = 0; this.showChip('Wilted plot cleared', PAL.red); this.saveGame(); } else { this.run.carry = { kind: 'harvest', plot: index }; this.showChip('Ready crop selected', PAL.signal); } this.updateAllViews(true); this.syncDebug(); };
  PlayScene.prototype.harvest = function (index) { var plot = this.run.plots[index]; if (!plot || !plot.crop || plot.stage !== 2) { this.showChip(plot && plot.stage === 3 ? 'Clear the wilted plot' : 'Crop is still growing', PAL.red); return false; } var crop = cropById(plot.crop); var output = crop.output; this.run.inventory[output] = (this.run.inventory[output] || 0) + 1; plot.crop = null; plot.stage = 0; plot.water = 0; plot.health = 100; plot.growSteps = 0; plot.pulse = 1; this.run.carry = null; this.emitBurst(this.plotRect(index).x + 41, this.plotRect(index).y + 29, crop.color, 14); kit.audio.sfx('harvest_chime', { volume: 0.8 }); kit.juice.shake(2, 90); kit.juice.hitStop(35); this.showChip(goodById(output).label + ' in pantry', PAL.leaf); this.updateAllViews(true); this.syncDebug(); this.saveGame(); return true; };
  PlayScene.prototype.keyboardPlotAct = function (index) { var plot = this.run.plots[index]; if (this.run.carry && this.run.carry.kind === 'seed' && plot && !plot.crop) this.plant(index, this.run.carry.id); else if (plot && plot.stage === 2) this.harvest(index); else this.activatePlot(index); };
  PlayScene.prototype.useFactory = function (id, action) {
    var recipe = recipeById(id); var q = this.run.queues[id] || (this.run.queues[id] = []); this.run.factoryTouches += 1; action = action || (q.length && q[0].ready ? 'finish' : 'queue');
    var fi = this.activeFactoryIds().indexOf(id); var r = this.factoryRect(fi);
    if (action === 'finish') {
      if (!q.length || !q[0].ready) { this.showChip(q.length ? 'Still processing' : 'Nothing queued', PAL.red); return; }
      q.shift(); var amount = profile.buildings[4] && id === 'dairy' ? 2 : 1; this.run.inventory[recipe.output] = (this.run.inventory[recipe.output] || 0) + amount; this.run.factoryFinishes += 1; this.emitBurst(r.x + 136, r.y + 22, recipe.color, 11); kit.audio.sfx('factory_clank', { volume: 0.75 }); kit.juice.shake(1.5, 70); this.showChip(goodById(recipe.output).label + ' finished' + (amount > 1 ? ' with flow bonus' : ''), PAL.signal);
    } else if ((this.run.inventory[recipe.input] || 0) > 0 && q.length < factoryCapacity()) {
      this.run.inventory[recipe.input] -= 1; q.push(queueEntry(recipe.input)); this.emitBurst(r.x + 30, r.y + 22, recipe.color, 7); kit.audio.sfx('factory_clank', { volume: 0.55 }); this.showChip(q.length > 1 ? 'Second batch queued' : 'Queued. Finish when ready.', recipe.color);
    } else { this.run.factoryWasted += 1; this.showChip(q.length >= factoryCapacity() ? 'Queue full' : 'Need ' + goodById(recipe.input).label, PAL.red); }
    this.updateAllViews(true); this.syncDebug(); this.saveGame();
  };
  PlayScene.prototype.pickGood = function (id) { if (!(this.run.inventory[id] > 0)) { this.showChip('Nothing to load', PAL.red); return; } this.run.carry = { kind: 'good', id: id }; this.showChip(goodById(id).label + ' selected', goodById(id).color); this.updateAllViews(true); };
  PlayScene.prototype.filledCount = function () { return Object.keys(this.run.loaded).reduce(function (sum, id) { return sum + (this.run.loaded[id] || 0); }.bind(this), 0); };
  PlayScene.prototype.orderReady = function () { var goods = this.run.order.goods; return Object.keys(goods).every(function (id) { return (this.run.loaded[id] || 0) >= goods[id]; }.bind(this)); };
  PlayScene.prototype.loadGood = function (id) { var required = this.run.order.goods[id] || 0; var have = this.run.loaded[id] || 0; if (!required) { this.showChip('Not on this order', PAL.red); return false; } if (have >= required) { this.showChip('Order bay full', PAL.red); return false; } if (!(this.run.inventory[id] > 0)) { this.showChip('Nothing to load', PAL.red); return false; } if (this.filledCount() >= orderCapacity(this.run.order)) { this.showChip('Rail car full', PAL.red); return false; } this.run.inventory[id] -= 1; this.run.loaded[id] = have + 1; this.run.carry = null; this.emitBurst(195, 748, goodById(id).color, 8); kit.audio.sfx('ui_tick', { volume: 0.7 }); this.showChip(this.orderReady() ? 'Order ready. Tap the car.' : 'Loaded', this.orderReady() ? PAL.signal : PAL.leaf); this.updateAllViews(true); this.syncDebug(); this.saveGame(); return true; };

  PlayScene.prototype.medalData = function () { var elapsed = (this.simSteps - this.run.simStart) / 60; var speed = elapsed <= this.run.order.speed * 0.62 ? 3 : elapsed <= this.run.order.speed ? 2 : 1; var efficiency = this.run.factoryWasted === 0 ? 3 : this.run.factoryWasted <= 1 ? 2 : 1; var idleSeconds = this.run.idleSteps / 60; var noIdle = idleSeconds <= 3 ? 3 : idleSeconds <= 10 ? 2 : 1; var total = Math.max(1, Math.round((speed + efficiency + noIdle) / 3)); if (profile.buildings[7] && total < 3 && speed === 3 && efficiency === 3) total = 3; return { speed: speed, efficiency: efficiency, noIdle: noIdle, total: total, elapsed: elapsed }; };
  PlayScene.prototype.attemptOrder = function () {
    if (!this.orderReady()) { var missing = Object.keys(this.run.order.goods).filter(function (id) { return (this.run.loaded[id] || 0) < this.run.order.goods[id]; }.bind(this)); this.showChip('Need ' + missing.map(function (id) { return goodById(id).label; }).join(' + '), PAL.red); return; }
    var medal = this.medalData(); var order = this.run.order; var reward = order.reward + (profile.buildings[6] ? 2 : 0); profile.coins += reward; profile.orders += 1; CROP_IDS.forEach(function (id) { profile.seeds[id] += Math.ceil(order.seeds / CROP_IDS.length); }); if (this.run.orderIndex < CORE_ORDERS.length) profile.medals[this.run.orderIndex] = Math.max(profile.medals[this.run.orderIndex], medal.total);
    this.run.railFx = 1.0; this.emitBurst(195, 748, PAL.signal, 24); kit.audio.sfx('departure_horn', { volume: 0.9 }); kit.juice.shake(3, 160);
    var medalName = medal.total >= 3 ? 'GOLD' : medal.total === 2 ? 'SILVER' : 'BRONZE'; var detail = 'SPEED ' + medalMark(medal.speed) + '   FLOW ' + medalMark(medal.efficiency) + '   FIELD ' + medalMark(medal.noIdle); var next = orderFor(profile.orders);
    var bannerTitle = profile.orders === CORE_ORDERS.length ? 'FREE PLAY UNLOCKED' : 'ORDER DEPARTED';
    var bannerSub = '+ ' + reward + ' coins   + seeds';
    var bannerDetail = profile.orders === CORE_ORDERS.length ? 'Three orders cleared. Keep shipping through ' + next.title + '.\n' + detail + '  ' + medalName : order.title + '\n' + detail + '  ' + medalName;
    this.run = this.makeRun(profile.orders); this.showBanner(bannerTitle, bannerSub, bannerDetail); this.run.railFx = 1.0; this.syncDebug(); this.updateAllViews(true); this.saveGame();
  };
  function medalMark(level) { return level >= 3 ? '★' : level === 2 ? '◆' : '●'; }
  PlayScene.prototype.dismissBanner = function () { if (!this.run.banner) return; this.hideBanner(); this.run.simStart = this.simSteps; this.updateAllViews(true); this.syncDebug(); };

  PlayScene.prototype.isBuildingUnlocked = function (index) { var b = BUILDINGS[index]; if (!b || profile.orders < b.unlock) return false; return index === 0 || profile.buildings[index - 1] === true; };
  PlayScene.prototype.selectBuilding = function (index) { var b = BUILDINGS[index]; if (!b) return; this.townFocus = index; if (profile.buildings[index]) { this.showChip(b.name + ' built', PAL.leaf); return; } if (!this.isBuildingUnlocked(index)) { this.showChip(index > 0 ? 'Build the chain in order' : 'Clear an order first', PAL.red); return; } if (this.townDraft === index) { this.buildBuilding(index); return; } this.townDraft = index; this.showChip('Footprint preview. Tap again to place.', PAL.signal); this.updateAllViews(true); this.syncDebug(); };
  PlayScene.prototype.buildBuilding = function (index) { var b = BUILDINGS[index]; if (!b || profile.buildings[index] || !this.isBuildingUnlocked(index)) return; if (profile.coins < b.cost) { this.showChip('Need ' + (b.cost - profile.coins) + ' more coins', PAL.red); return; } profile.coins -= b.cost; profile.buildings[index] = true; this.townDraft = -1; this.emitBurst(this.townRect(index).x + 88, this.townRect(index).y + 56, PAL.signal, 18); kit.audio.sfx('building_chime', { volume: 0.8 }); this.showBanner('BUILDING UNLOCKED', b.name, b.effect + '\nThe next footprint is now on the chain.'); this.updateAllViews(true); this.syncDebug(); this.saveGame(); };
  PlayScene.prototype.moveFocus = function (dx, dy) {
    if (this.mode === 'town') { if (dx) this.townFocus = clamp(this.townFocus + dx, 0, BUILDINGS.length - 1); if (dy) this.townFocus = clamp(this.townFocus + dy * 2, 0, BUILDINGS.length - 1); return; }
    var zones = ['seed', 'plot', 'factory', 'pantry', 'car']; var zi = Math.max(0, zones.indexOf(this.focus.zone)); if (dy) zi = clamp(zi + (dy > 0 ? 1 : -1), 0, zones.length - 1); this.focus.zone = zones[zi]; var lengths = { seed: CROP_DATA.length, plot: this.run.plots.length, factory: this.activeFactoryIds().length, pantry: GOOD_DATA.length, car: orderCapacity(this.run.order) }; var len = lengths[this.focus.zone] || 1; if (dx) this.focus.index = clamp(this.focus.index + dx, 0, len - 1); else this.focus.index = clamp(this.focus.index, 0, len - 1); this.updateAllViews(true);
  };
  PlayScene.prototype.keyboardAct = function () { if (this.run.banner) { this.dismissBanner(); return; } if (this.mode === 'town') { this.selectBuilding(this.townFocus); return; } if (this.focus.zone === 'seed') this.pickSeed(this.focus.index); else if (this.focus.zone === 'plot') this.keyboardPlotAct(this.focus.index); else if (this.focus.zone === 'factory') this.useFactory(this.factoryIdAt(this.focus.index)); else if (this.focus.zone === 'pantry') { var id = GOOD_DATA[this.focus.index].id; if (this.run.carry && this.run.carry.kind === 'good') this.loadGood(this.run.carry.id); else this.pickGood(id); } else if (this.focus.zone === 'car') { if (this.run.carry && this.run.carry.kind === 'good') this.loadGood(this.run.carry.id); else this.attemptOrder(); } };

  PlayScene.prototype.movePlayer = function (dx, dy) {
    if (!this.run || !this.player || this.mode !== 'play') return;
    var speed = 12; var nx = clamp(this.run.player.x + dx * speed, 22, 368); var ny = clamp(this.run.player.y + dy * speed, 122, 340);
    var tileX = clamp(Math.floor((nx - 15) / TILE_SIZE), 0, FARM_COLS - 1); var tileY = clamp(Math.floor((ny - 115) / TILE_SIZE), 0, FARM_ROWS - 1); var tile = this.run.tilemap[tileY] && this.run.tilemap[tileY][tileX];
    if (tile !== 3 && tile !== 4) { this.run.player.x = nx; this.run.player.y = ny; this.run.player.dir = dx < 0 ? 1 : dx > 0 ? 3 : dy < 0 ? 2 : 0; this.run.player.step += 1; }
  };
  PlayScene.prototype.pollGamepad = function () {
    if (kit.paused || !navigator.getGamepads) return;
    if (!this.gamepad || !this.gamepad.connected) { var pads = navigator.getGamepads(); for (var pi = 0; pi < pads.length; pi++) if (pads[pi]) { this.gamepad = pads[pi]; break; } }
    var pad = this.gamepad; if (!pad) return;
    function down(button) { return !!(pad.buttons[button] && pad.buttons[button].pressed); }
    function edge(key, value) { var was = !!this.gamepadEdges[key]; this.gamepadEdges[key] = value; return value && !was; }
    var ax = pad.axes && pad.axes.length ? pad.axes[0] : 0; var ay = pad.axes && pad.axes.length > 1 ? pad.axes[1] : 0;
    var left = down(14) || ax < -0.55, right = down(15) || ax > 0.55, up = down(12) || ay < -0.55, downDir = down(13) || ay > 0.55;
    this.focusActive = true;
    if (edge.call(this, 'left', left)) this.moveFocus(-1, 0); if (edge.call(this, 'right', right)) this.moveFocus(1, 0); if (edge.call(this, 'up', up)) this.moveFocus(0, -1); if (edge.call(this, 'down', downDir)) this.moveFocus(0, 1);
    if (edge.call(this, 'a', down(0))) this.keyboardAct(); if (edge.call(this, 'b', down(1))) this.toggleTown(); if (edge.call(this, 'start', down(9))) kit.restart();
  };

  PlayScene.prototype.emitBurst = function (x, y, color, count) { var total = Math.min(count || 8, MAX_PARTICLES); var used = 0; for (var i = 0; i < this.particles.length && used < total; i++) { var p = this.particles[i]; if (p.life > 0) continue; var a = (TAU * used / total) + ((this.simSteps + used * 13) % 7) * 0.04; var speed = 24 + ((this.simSteps + used * 17) % 31); p.x = x; p.y = y; p.vx = Math.cos(a) * speed; p.vy = Math.sin(a) * speed - 20; p.life = p.max = 0.42 + (used % 4) * 0.08; p.size = 2 + (used % 3); p.color = color || PAL.signal; p.sprite.setPosition(x, y).setTint(p.color).setScale(p.size / 4).setAlpha(1).setVisible(true); used++; } };
  PlayScene.prototype.step = function () {
    this.simSteps += 1; this.run.saveTick = (this.run.saveTick || 0) + 1; if (this.run.saveTick >= 60) { this.run.saveTick = 0; this.saveGame(); } if (this.run.banner) { this.run.banner.life = Math.max(0, this.run.banner.life - STEP); if (this.run.banner.life <= 0) { this.run.banner = null; this.run.simStart = this.simSteps; } return; }
    if (this.run.tutorial > 0) this.run.tutorial = Math.max(0, this.run.tutorial - STEP); if (this.run.chip) { this.run.chip.life -= STEP; if (this.run.chip.life <= 0) this.run.chip = null; } if (this.run.readyFlash > 0) this.run.readyFlash = Math.max(0, this.run.readyFlash - STEP); if (this.run.railFx > 0) this.run.railFx = Math.max(0, this.run.railFx - STEP * 0.9); if (this.run.seasonFx > 0) this.run.seasonFx = Math.max(0, this.run.seasonFx - STEP * 0.8);
    var season = SEASONS[this.run.season]; this.run.seasonSteps += 1; if (this.run.seasonSteps >= SEASON_LENGTH) { this.run.seasonSteps = 0; this.run.day += 1; this.run.season = (this.run.season + 1) % SEASONS.length; this.run.seasonFx = 1; this.showChip(SEASONS[this.run.season].name + ' season arrived', SEASONS[this.run.season].tint); kit.audio.sfx('crop_ready', { volume: 0.5 }); this.saveGame(); }
    var moveX = (kit.input.keyDown('KeyD') ? 1 : 0) - (kit.input.keyDown('KeyA') ? 1 : 0); var moveY = (kit.input.keyDown('KeyS') ? 1 : 0) - (kit.input.keyDown('KeyW') ? 1 : 0); if (moveX || moveY) this.movePlayer(moveX, moveY);
    var scene = this; if (this.run.plots.some(function (p) { return p.stage === 2; })) this.run.idleSteps += 1;
    this.run.plots.forEach(function (plot, index) {
      plot.pulse = Math.max(0, plot.pulse - STEP * 2); if (!plot.crop || plot.stage !== 1) return; var crop = cropById(plot.crop); plot.water = Math.max(0, plot.water - STEP * (0.76 + scene.run.season * 0.08)); if (plot.water <= 0) plot.health = Math.max(0, plot.health - STEP * 8);
      if (plot.health <= 0) { plot.stage = 3; plot.pulse = 1; scene.showChip('A crop wilted. Water growing plots.', PAL.red); return; }
      plot.growSteps += STEP * 60 * (plot.water > 10 ? season.rate : 0.24 * season.rate); if (plot.growSteps >= crop.growthSteps) { plot.stage = 2; plot.water = Math.max(plot.water, 22); plot.pulse = 1; scene.run.readyFlash = 0.45; kit.audio.sfx('crop_ready', { volume: 0.58 }); scene.showChip(crop.label + ' is ready', PAL.signal); }
    });
    RECIPE_DATA.forEach(function (recipe) { var q = scene.run.queues[recipe.id] || []; q.forEach(function (entry) { if (entry.ready) return; entry.progress += STEP * (1 + (profile.buildings[4] ? 0.28 : 0)); if (entry.progress >= recipe.seconds) { entry.progress = recipe.seconds; entry.ready = true; scene.run.readyFlash = 0.2; } }); });
    for (var i = 0; i < this.particles.length; i++) { var p = this.particles[i]; if (p.life <= 0) continue; p.life -= STEP; if (!this.motionReduced) { p.x += p.vx * STEP; p.y += p.vy * STEP; p.vy += 85 * STEP; } if (p.life <= 0) p.sprite.setVisible(false); }
  };
  PlayScene.prototype.update = function (time, delta) { if (this.simPaused) return; this.pollGamepad(); var j = kit.juice.frame(); this.cameras.main.setScroll(j.dx, j.dy); if (j.frozen) { this.updateAllViews(false); this.syncDebug(); return; } var dt = clamp(delta / 1000, 0, 0.10); this.acc += dt; var steps = 0; while (this.acc >= STEP && steps < MAX_STEPS) { this.acc -= STEP; this.step(); steps++; } if (steps >= MAX_STEPS && this.acc >= STEP) this.acc = 0; this.updateAllViews(false); this.syncDebug(); };

  PlayScene.prototype.updateAllViews = function () {
    if (!this.run) return; var scene = this; var showPlay = this.mode === 'play'; this.hudObjects.forEach(function (o) { o.setVisible(true); }); if (this.player) this.player.setVisible(showPlay); if (this.seasonOverlay) this.seasonOverlay.setVisible(showPlay);
    this.bannerBg.setVisible(!!this.run.banner); this.bannerTitle.setVisible(!!this.run.banner); this.bannerSub.setVisible(!!this.run.banner); this.bannerDetail.setVisible(!!this.run.banner); this.bannerPrompt.setVisible(!!this.run.banner);
    if (this.run.banner) { setTextIfChanged(this.bannerTitle, this.run.banner.title); setTextIfChanged(this.bannerSub, this.run.banner.sub); setTextIfChanged(this.bannerDetail, this.run.banner.detail); var ba = kit.juice.enabled ? clamp(this.run.banner.life * 2, 0, 1) : 1; [this.bannerBg, this.bannerTitle, this.bannerSub, this.bannerDetail, this.bannerPrompt].forEach(function (o) { o.setAlpha(ba); }); }
    setTextIfChanged(this.coinText, profile.coins); setTextIfChanged(this.orderText, profile.orders < 3 ? (profile.orders + 1) + ' / 3' : 'FREE ' + (profile.orders - 2)); setTextIfChanged(this.modeText, this.mode === 'town' ? 'FARM' : 'TOWN'); setTextIfChanged(this.tutorialText, this.run.tutorial > 0 ? (this.run.tutorialText || 'Keep the rail moving.') : ''); this.tutorialText.setAlpha(this.run.tutorial > 0 ? clamp(this.run.tutorial / 1.4, 0.18, 1) : 0); this.tutorialBg.setAlpha(this.run.tutorial > 0 ? 0.88 : 0);
    setVisible(this.chipBg, !!this.run.chip && showPlay); setVisible(this.chipText, !!this.run.chip && showPlay); if (this.run.chip) { setTextIfChanged(this.chipText, this.run.chip.text); this.chipBg.setStrokeStyle(2, this.run.chip.color, 1); this.chipBg.setPosition(18, 94); this.chipText.setPosition(30, 94); this.chipBg.width = Math.max(150, Math.min(354, this.chipText.width + 28)); }
    setVisible(this.fieldHeader, showPlay); setVisible(this.fieldMeta, showPlay); setVisible(this.seedHeader, showPlay); setVisible(this.factoryHeader, showPlay); setVisible(this.factoryMeta, showPlay); setVisible(this.pantryHeader, showPlay); setVisible(this.pantryMeta, showPlay); setVisible(this.railHeader, showPlay); setVisible(this.railMeta, showPlay); setVisible(this.townHeader, !showPlay); setVisible(this.townMeta, !showPlay);
    if (showPlay) { setTextIfChanged(this.fieldHeader, this.run.layout.name + '  /  ' + this.run.layout.subtitle); setTextIfChanged(this.fieldMeta, SEASONS[this.run.season].name + '  DAY ' + this.run.day); setTextIfChanged(this.railHeader, 'RAIL ORDER  ·  ' + this.run.order.title); setTextIfChanged(this.railMeta, this.filledCount() + ' / ' + orderCapacity(this.run.order)); } else setTextIfChanged(this.townMeta, profile.coins + ' route coins');
    this.updateTownViews(); if (!showPlay) { this.updateFocus(); this.updateAccessibleState(); return; } this.updateFarmViews(); this.updateFocus(); for (var i = 0; i < this.particles.length; i++) { var p = this.particles[i]; if (p.life > 0) p.sprite.setPosition(p.x, p.y).setAlpha(this.motionReduced ? 0.8 : kit.juice.enabled ? clamp(p.life / p.max, 0, 1) : 0.75); } var anyPointer = null; this.pointerSessions.forEach(function (s) { if (!anyPointer) anyPointer = s; }); if (anyPointer) this.updateDragPreview(anyPointer); else { this.dragGhost.setVisible(false); this.dropPreview.setVisible(false); } this.updateAccessibleState();
  };
  PlayScene.prototype.updateFarmViews = function () {
    var scene = this; var plots = this.run.plots;
    this.plotViews.forEach(function (v, i) { var visible = i < plots.length; v.bg.setVisible(visible); v.icon.setVisible(visible); v.label.setVisible(visible); v.status.setVisible(visible); v.mark.setVisible(visible); v.water.setVisible(visible); if (!visible) return; var r = scene.plotRect(i); var p = plots[i]; var crop = p.crop ? cropById(p.crop) : null; var stageKey = crop ? 'hj-crop-' + crop.id + '-' + (p.stage === 3 ? 3 : p.stage === 2 ? 2 : 1) : 'hj-icon-wheat'; var growth = crop && p.stage === 1 ? Math.round(clamp(p.growSteps / crop.growthSteps, 0, 1) * 100) : 0; v.bg.setPosition(r.x + r.w / 2, r.y + r.h / 2).setFillStyle(crop ? crop.color : PAL.mint, crop ? 0.28 : 0.85).setStrokeStyle(p.stage === 2 ? 3 : 2, p.stage === 2 ? PAL.signal : p.stage === 3 ? 2 : PAL.sand, 1); v.icon.setTexture(stageKey).setPosition(r.x + 22, r.y + 28).setVisible(!!crop).setTint(crop ? crop.color : PAL.leaf); var pulse = !scene.motionReduced && p.pulse > 0 ? 1 + p.pulse * 0.08 : 1; v.icon.setScale(pulse); setTextIfChanged(v.label, crop ? crop.label : 'EMPTY'); v.label.setPosition(r.x + 53, r.y + 17); setColorIfChanged(v.label, crop ? '#24352d' : '#5ca36b'); setTextIfChanged(v.status, !crop ? 'SEED' : p.stage === 1 ? 'GROW ' + growth + '%' : p.stage === 2 ? 'READY' : 'WILTED'); v.status.setPosition(r.x + 53, r.y + 38); setColorIfChanged(v.status, p.stage === 2 ? '#c95355' : p.stage === 3 ? '#8c583c' : '#2b6a4d'); v.mark.setPosition(r.x + 9, r.y + 9).setFillStyle(scene.run.layout.accent, 1); v.water.setPosition(r.x + 41, r.y + 52).setSize(Math.max(4, 42 * clamp(p.water / 100, 0, 1)), 3).setFillStyle(p.water > 20 ? PAL.skyDark : PAL.red, 1); });
    this.seedViews.forEach(function (v, i) { var crop = CROP_DATA[i]; var r = scene.seedRect(i); var allowed = scene.seedAllowed(crop.id); v.bg.setPosition(r.x + r.w / 2, r.y + r.h / 2).setFillStyle(allowed ? crop.color : PAL.sand, allowed ? 0.38 : 0.16); v.icon.setPosition(r.x + 18, r.y + 23).setAlpha(allowed ? 1 : 0.28); v.label.setPosition(r.x + 48, r.y + 16); setTextIfChanged(v.count, String(profile.seeds[crop.id] || 0)); v.count.setPosition(r.x + 48, r.y + 34); setColorIfChanged(v.count, allowed ? '#24352d' : '#8c583c'); });
    var active = scene.activeFactoryIds(); this.factoryViews.forEach(function (v, i) { var id = RECIPE_DATA[i].id; var at = active.indexOf(id); var visible = at >= 0; var recipe = recipeById(id); v.bg.setVisible(visible); v.icon.setVisible(visible); v.name.setVisible(visible); v.flow.setVisible(visible); v.slot.setVisible(visible); if (!visible) return; var r = scene.factoryRect(at); var q = scene.run.queues[id] || []; var cap = factoryCapacity(); var state = q.length && q[0].ready ? 'FINISH' : q.length ? 'PROCESS' : scene.run.inventory[recipe.input] > 0 ? 'QUEUE' : 'NEED'; v.bg.setPosition(r.x + r.w / 2, r.y + r.h / 2); v.icon.setPosition(r.x + 19, r.y + 22).setTexture('hj-icon-' + recipe.icon); v.name.setPosition(r.x + 36, r.y + 12); setTextIfChanged(v.name, shortText(recipe.name, 16)); setTextIfChanged(v.flow, shortText(goodById(recipe.input).label + ' > ' + goodById(recipe.output).label, 18)); v.flow.setPosition(r.x + 36, r.y + 30); setTextIfChanged(v.slot, q.length ? state + ' ' + q.length + '/' + cap : state); v.slot.setPosition(r.x + r.w - 8, r.y + 21); setColorIfChanged(v.slot, state === 'FINISH' ? '#f4a83e' : state === 'NEED' ? '#c95355' : '#2b6a4d'); });
    this.pantryViews.forEach(function (v, i) { var good = GOOD_DATA[i]; var r = scene.pantryRect(i); var count = scene.run.inventory[good.id] || 0; v.bg.setPosition(r.x + r.w / 2, r.y + r.h / 2).setFillStyle(scene.run.carry && scene.run.carry.id === good.id ? PAL.signal : PAL.mint, scene.run.carry && scene.run.carry.id === good.id ? 0.55 : 1); v.icon.setPosition(r.x + 21, r.y + 21).setTexture('hj-good-' + good.id).setAlpha(count ? 1 : 0.3); setTextIfChanged(v.count, count); v.count.setPosition(r.x + 21, r.y + 45); });
    var capacity = orderCapacity(this.run.order); var gap = 4; var bw = (340 - gap * (capacity - 1)) / capacity; var required = Object.keys(this.run.order.goods); var carShift = !scene.motionReduced && kit.juice.enabled && this.run.railFx > 0 ? (1 - this.run.railFx) * 460 : 0; this.carViews.forEach(function (v, i) { var visible = i < capacity; v.bg.setVisible(visible); v.icon.setVisible(visible); v.count.setVisible(visible); v.pip.setVisible(visible); if (!visible) return; var id = required[i]; var have = id ? scene.run.loaded[id] || 0 : 0; var need = id ? scene.run.order.goods[id] : 0; var x = 25 + i * (bw + gap) + carShift; v.bg.setPosition(x + bw / 2, 750).setSize(bw, 76).setFillStyle(id ? (have >= need ? PAL.mint : PAL.cream) : PAL.deep, 1).setStrokeStyle(2, have >= need && id ? PAL.leaf : PAL.sand, 1); if (id) { v.icon.setTexture('hj-good-' + id).setPosition(x + bw / 2, 735).setScale(Math.min(0.82, bw / 48)); setTextIfChanged(v.count, have + ' / ' + need); v.count.setPosition(x + bw / 2, 770); v.pip.setPosition(x + bw / 2, 788).setSize(Math.max(16, bw * clamp(have / Math.max(1, need), 0, 1)), 4).setFillStyle(have >= need ? PAL.leaf : PAL.signal, 1); } else { v.icon.setVisible(false); setTextIfChanged(v.count, ''); } });
    if (scene.seasonOverlay) scene.seasonOverlay.setFillStyle(SEASONS[scene.run.season].tint, 0.04 + (scene.run.seasonFx > 0 && !scene.motionReduced ? scene.run.seasonFx * 0.16 : 0)); if (scene.player) { scene.player.setPosition(scene.run.player.x, scene.run.player.y); scene.player.setTexture(scene.motionReduced || scene.run.player.step % 2 === 0 ? 'hj-player-idle' : scene.run.player.step % 4 === 1 ? 'hj-player-walk-a' : 'hj-player-walk-b'); }
  };
  PlayScene.prototype.updateTownViews = function () { var scene = this; var visible = this.mode === 'town'; this.townViews.forEach(function (v, i) { var b = BUILDINGS[i]; var r = scene.townRect(i); v.bg.setVisible(visible); v.icon.setVisible(visible); v.name.setVisible(visible); v.effect.setVisible(visible); v.status.setVisible(visible); v.ghost.setVisible(visible && scene.townDraft === i); if (!visible) return; var built = profile.buildings[i]; var unlocked = scene.isBuildingUnlocked(i); v.bg.setPosition(r.x + r.w / 2, r.y + r.h / 2).setFillStyle(built ? PAL.mint : PAL.cream, 1).setStrokeStyle(scene.townDraft === i ? 3 : 2, built ? PAL.leaf : unlocked ? PAL.signal : PAL.sand, 1); v.icon.setPosition(r.x + 25, r.y + 27).setTexture('hj-building-' + b.id).setTint(built ? PAL.leaf : unlocked ? PAL.signal : PAL.sand); v.name.setPosition(r.x + 48, r.y + 22); v.effect.setPosition(r.x + 48, r.y + 43); setTextIfChanged(v.status, built ? 'BUILT' : unlocked ? 'PLACE  ' + b.cost : 'LOCKED'); v.status.setPosition(r.x + 14, r.y + 88); setColorIfChanged(v.status, built ? '#5ca36b' : unlocked ? '#c95355' : '#8c583c'); v.ghost.setPosition(r.x + r.w / 2, r.y + r.h / 2); }); };
  PlayScene.prototype.updateFocus = function () { if (!this.focusActive) { this.focusRing.setVisible(false); return; } var r = null; if (this.mode === 'town') r = this.townRect(this.townFocus); else if (this.focus.zone === 'seed') r = this.seedRect(this.focus.index); else if (this.focus.zone === 'plot') r = this.plotRect(this.focus.index); else if (this.focus.zone === 'factory') r = this.factoryRect(this.focus.index); else if (this.focus.zone === 'pantry') r = this.pantryRect(this.focus.index); else if (this.focus.zone === 'car') r = this.carRect(); if (!r) { this.focusRing.setVisible(false); return; } this.focusRing.setPosition(r.x + r.w / 2, r.y + r.h / 2).setSize(r.w + 8, r.h + 8).setVisible(true); };

  var config = { type: Phaser.AUTO, parent: 'game-shell', backgroundColor: '#f7f0df', scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H }, render: { antialias: false, antialiasGL: false, powerPreference: 'high-performance', roundPixels: true, batchSize: 2048 }, fps: { target: 60, min: 30 }, scene: [PlayScene] };
  config.scale.width = Math.round(W * RETINA_FACTOR);
  config.scale.height = Math.round(H * RETINA_FACTOR);
  config.render = Object.assign({}, GGKit.renderDefaults, config.render || {});
  Game.phaser = new Phaser.Game(config);
  kit.registerPWA();
})();
