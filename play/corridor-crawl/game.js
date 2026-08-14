/* Corridor Crawl - Phaser view over a deterministic, turn-resolved roguelike. */
(function (root) {
  'use strict';
  var Phaser = root.Phaser, CC = root.CC, T = CC.TILE, DIRS = CC.DIRS, ALL_DIRS = CC.ALL_DIRS;
  var MAX_MONSTERS = 28, MAX_ITEMS = 30, MAX_GOLD = 24, MAX_PARTICLES = 84;
  var TAU = Math.PI * 2;
  var Game = { scene: null, phaser: null };
  var oldProbe = root.__cc || {};
  root.__cc = {
    state: oldProbe.state || { mode: 'boot', depth: 0, hp: 0, hunger: 0, score: 0 },
    forceFloor: oldProbe.forceFloor == null ? null : oldProbe.forceFloor,
    forceEvent: oldProbe.forceEvent == null ? null : oldProbe.forceEvent
  };

  var KITS = {
    basic: { name: 'Wayfarer', mark: 'I', hp: 28, atk: [3, 6], hunger: 100, desc: 'balanced first run' },
    scavenger: { name: 'Scavenger', mark: 'II', hp: 24, atk: [2, 5], hunger: 125, desc: 'more pockets, less muscle' },
    ward: { name: 'Ward-Bearer', mark: 'III', hp: 34, atk: [2, 5], hunger: 90, desc: 'survives the forge' },
    echo: { name: 'Echo Runner', mark: 'IV', hp: 25, atk: [4, 7], hunger: 105, desc: 'returns changed' }
  };
  var KIT_KEYS = ['basic', 'scavenger', 'ward', 'echo'];
  var MON = {
    rat: { name: 'Gnaw Rat', hp: 5, dmg: [1, 3], def: 0, xp: 2, col: 0xb98a5a, glyph: 'r' },
    ooze: { name: 'Split Ooze', hp: 11, dmg: [2, 4], def: 1, xp: 6, col: 0x62d18a, glyph: 'o' },
    archer: { name: 'Quill Archer', hp: 8, dmg: [2, 5], def: 0, xp: 7, col: 0xe2c85d, glyph: 'a' },
    stalker: { name: 'Hollow Stalker', hp: 10, dmg: [3, 6], def: 1, xp: 9, col: 0xc574df, glyph: 's' },
    brute: { name: 'Rubble Brute', hp: 22, dmg: [4, 9], def: 2, xp: 14, col: 0xaab0bd, glyph: 'b' },
    thief: { name: 'Ash Cutpurse', hp: 7, dmg: [1, 2], def: 1, xp: 8, col: 0x56d3d4, glyph: 't' }
  };
  var POTIONS = {
    mend: { name: 'Mending', col: 0x50e08d, desc: 'restore 10 health' },
    fury: { name: 'Fury', col: 0xff785e, desc: 'add 3 damage for 5 turns' },
    quick: { name: 'Quickening', col: 0xffd45e, desc: 'enemies lose their next step' },
    bile: { name: 'Bile', col: 0x9c68d8, desc: 'burn every adjacent enemy' },
    sight: { name: 'Clarity', col: 0x5ccdf0, desc: 'reveal this floor' }
  };
  var SCROLLS = {
    blink: { name: 'Displacement', desc: 'jump to a safe floor tile' },
    flame: { name: 'Scorching', desc: 'burn every visible enemy' },
    ward: { name: 'Warding', desc: 'block 3 damage for 5 turns' },
    terror: { name: 'Terror', desc: 'nearby enemies flee' },
    mapping: { name: 'Surveying', desc: 'reveal every corridor' }
  };
  var POTION_SHADES = ['Moss', 'Cinder', 'Brine', 'Honey', 'Violet', 'Silver', 'Ash', 'Teal'];
  var SCROLL_GLYPHS = ['MOR VEL', 'KIRRA', 'OSSE', 'THRAN', 'UMBEL', 'NAAD', 'EKO'];
  var FLOOR_MEDALS = { gold: 5, silver: 3, bronze: 1 };
  var AUDIO = {
    step: 'assets/audio/step.mp3', hit: 'assets/audio/hit.mp3', hurt: 'assets/audio/hurt.mp3',
    pickup: 'assets/audio/pickup.mp3', 'item-use': 'assets/audio/item-use.mp3', stairs: 'assets/audio/stairs.mp3',
    crown: 'assets/audio/crown.mp3', death: 'assets/audio/death.mp3', escape: 'assets/audio/escape.mp3',
    telegraph: 'assets/audio/telegraph.mp3',
    'ambience-warrens': 'assets/audio/ambience-warrens.mp3',
    'ambience-flooded': 'assets/audio/ambience-flooded.mp3',
    'ambience-forge': 'assets/audio/ambience-forge.mp3',
    'ambience-vault': 'assets/audio/ambience-vault.mp3'
  };
  var AUDIO_NAMES = Object.keys(AUDIO);

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex(n) { return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6); }
  function rgb(n) { return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }
  function weightedPick(rng, weights) {
    var total = 0, k;
    for (k in weights) if (Object.prototype.hasOwnProperty.call(weights, k) && MON[k]) total += Math.max(0, weights[k]);
    if (!total) return 'rat';
    var roll = rng.f() * total;
    for (k in weights) if (MON[k]) { roll -= Math.max(0, weights[k]); if (roll <= 0) return k; }
    return 'rat';
  }
  function readForceValue(value, min, max) {
    var n = Number(value);
    return isFinite(n) && Math.floor(n) === n && n >= min && n <= max ? n : null;
  }
  function readProbe() {
    var source = root.__cc || {};
    var query = {};
    try { query = new URLSearchParams(root.location.search); } catch (e) { query = {}; }
    var floor = source.forceFloor;
    if (floor == null) floor = root.__ccForceFloor;
    if (floor == null && query.get) floor = query.get('forceFloor');
    var event = source.forceEvent;
    if (event == null) event = root.__ccForceEvent;
    if (event == null && query.get) event = query.get('forceEvent');
    return { floor: readForceValue(floor, 1, 8), event: event == null ? null : String(event) };
  }
  function validCounter(n, min, max) {
    return typeof n === 'number' && isFinite(n) && Math.floor(n) === n && n >= min && n <= max;
  }
  function validProfile(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    if (o.version !== 1 || !Array.isArray(o.unlockedKits) || !o.unlockedKits.length) return false;
    var seen = Object.create(null);
    for (var i = 0; i < o.unlockedKits.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(KITS, o.unlockedKits[i]) || seen[o.unlockedKits[i]]) return false;
      seen[o.unlockedKits[i]] = true;
    }
    if (!seen.basic || !Object.prototype.hasOwnProperty.call(KITS, o.selectedKit) || !seen[o.selectedKit] || typeof o.tutorialDone !== 'boolean') return false;
    if (!validCounter(o.best, 0, 1000000000) || !validCounter(o.maxDepth, 1, 8) ||
        !validCounter(o.runs, 0, 1000000) || !validCounter(o.escapes, 0, 1000000)) return false;
    if (!o.medals || typeof o.medals !== 'object' || Array.isArray(o.medals)) return false;
    for (var depth in o.medals) {
      if (!Object.prototype.hasOwnProperty.call(o.medals, depth) || !/^[1-8]$/.test(depth) ||
          (o.medals[depth] !== 'gold' && o.medals[depth] !== 'silver' && o.medals[depth] !== 'bronze')) return false;
    }
    return true;
  }
  function defaultProfile() {
    return { version: 1, best: 0, maxDepth: 1, runs: 0, escapes: 0, tutorialDone: false,
      unlockedKits: ['basic'], selectedKit: 'basic', medals: {} };
  }
  var kit;
  function makeKit() {
    kit = root.GGKit.create({
      slug: 'corridor-crawl', orientation: 'portrait', validateSave: validProfile,
      onPause: function () { if (Game.scene) { Game.scene.simPaused = true; Game.scene.clearTouches(); } },
      onResume: function () { if (Game.scene) Game.scene.simPaused = false; },
      onRestart: function () { if (Game.scene) Game.scene.hardRestart(); }
    });
  }
  makeKit();
  kit.audio.register(AUDIO);
  var profile = kit.save.get(null) || defaultProfile();
  if (!validProfile(profile)) profile = defaultProfile();

  function saveProfile() { kit.save.set(profile); }
  function refreshUnlocks() {
    if (profile.maxDepth >= 3 && profile.unlockedKits.indexOf('scavenger') < 0) profile.unlockedKits.push('scavenger');
    if (profile.maxDepth >= 6 && profile.unlockedKits.indexOf('ward') < 0) profile.unlockedKits.push('ward');
    if (profile.escapes >= 1 && profile.unlockedKits.indexOf('echo') < 0) profile.unlockedKits.push('echo');
    if (!KITS[profile.selectedKit] || profile.unlockedKits.indexOf(profile.selectedKit) < 0) profile.selectedKit = profile.unlockedKits[0];
    saveProfile();
  }
  refreshUnlocks();

  function itemKind(key) {
    if (key === 'ration') return 'food';
    if (key === 'crown') return 'crown';
    if (POTIONS[key]) return 'potion';
    return 'scroll';
  }
  function itemName(s, key) {
    var kind = itemKind(key);
    if (kind === 'food') return 'Dry Ration';
    if (kind === 'crown') return 'Crown of Echoes';
    if (kind === 'potion') return s.identified[key] ? 'Potion of ' + POTIONS[key].name : (s.appearance.potion[key] || 'Unknown') + ' Potion';
    return s.identified[key] ? 'Scroll of ' + SCROLLS[key].name : 'Scroll "' + (s.appearance.scroll[key] || '???') + '"';
  }
  function itemShort(s, key) {
    var kind = itemKind(key);
    if (kind === 'food') return 'HUNGER +34';
    if (kind === 'crown') return 'ASCEND';
    if (!s.identified[key]) return 'USE TO IDENTIFY';
    if (key === 'mend') return 'HP +10';
    if (key === 'fury') return 'DAMAGE +3';
    if (key === 'quick') return 'SKIP ENEMY STEP';
    if (key === 'bile') return 'ADJACENT BLAST';
    if (key === 'sight') return 'REVEAL FLOOR';
    if (key === 'blink') return 'SAFE TELEPORT';
    if (key === 'flame') return 'VISIBLE BURN';
    if (key === 'ward') return 'BLOCK 3 DAMAGE';
    if (key === 'terror') return 'ENEMIES FLEE';
    return 'REVEAL CORRIDORS';
  }
  function itemColor(s, key) {
    if (itemKind(key) === 'food') return 0xd1a56b;
    if (itemKind(key) === 'crown') return 0xffd76d;
    return POTIONS[key] ? POTIONS[key].col : 0xd8e7ef;
  }
  function itemKeys() { return Object.keys(POTIONS).concat(Object.keys(SCROLLS)); }

  function makeState(scene, forcedDepth) {
    var seed = (Date.now() ^ ((Math.random() * 0xffffffff) >>> 0)) >>> 0;
    var querySeed = null;
    try { querySeed = new URLSearchParams(root.location.search).get('seed'); } catch (e) {}
    if (querySeed != null && querySeed !== '') seed = CC.hash(0x4c4f4f50, String(querySeed));
    var s = {
      mode: 'play', seed: seed, rng: new CC.RNG(seed), depth: forcedDepth || 1, maxDepth: forcedDepth || 1,
      ascending: false, hasCrown: false, turn: 0, floorTurn: 0, kills: 0, gold: 0, score: 0,
      hp: 1, maxHp: 1, hunger: 100, hungerMax: 100, player: { x: 0, y: 0 },
      level: null, monsters: [], items: [], goldPiles: [], monsterViews: {}, floorCleared: false,
      identified: {}, appearance: { potion: {}, scroll: {} }, inventory: [], buffs: { power: 0, ward: 0, haste: 0 },
      log: [], medals: {}, milestones: {}, banner: null, bannerQueue: [], inspect: null, guide: { step: profile.tutorialDone ? 4 : 0, t: profile.tutorialDone ? 0 : 3.5, max: 3.5 },
      selectedKit: profile.selectedKit, deathBy: '', finalScore: 0, dirty: true, lastAction: '',
      playerAnim: { state: 'idle', t: 0 }
    };
    var kitSpec = KITS[s.selectedKit] || KITS.basic;
    s.maxHp = kitSpec.hp; s.hp = kitSpec.hp; s.hungerMax = kitSpec.hunger; s.hunger = kitSpec.hunger;
    s.atk = kitSpec.atk.slice();
    var shades = s.rng.shuffle(POTION_SHADES.slice()), glyphs = s.rng.shuffle(SCROLL_GLYPHS.slice()), i;
    for (i = 0; i < Object.keys(POTIONS).length; i++) s.appearance.potion[Object.keys(POTIONS)[i]] = shades[i % shades.length];
    for (i = 0; i < Object.keys(SCROLLS).length; i++) s.appearance.scroll[Object.keys(SCROLLS)[i]] = glyphs[i % glyphs.length];
    s.inventory.push({ key: 'ration', n: 2 }, { key: 'mend', n: 1 });
    return s;
  }
  function log(s, text, color) {
    s.log.unshift({ text: text, color: color || '#c5d2dd' });
    if (s.log.length > 3) s.log.length = 3;
    if (s.mode === 'play') queueTransient(s, text, color);
    s.dirty = true;
  }
  function showBanner(s, title, sub, color) {
    queueTransient(s, title + (sub ? ' · ' + sub : ''), color, true);
  }
  function queueTransient(s, text, color, boundary) {
    var item = { text: text, color: typeof color === 'number' ? hex(color) : (color || '#ffd76d'), t: 1, max: 1, boundary: !!boundary };
    if (s.banner && s.banner.t > 0) {
      if (!s.bannerQueue) s.bannerQueue = [];
      if (s.bannerQueue.length < 3) s.bannerQueue.push(item);
    } else {
      s.banner = item;
    }
    s.dirty = true;
  }
  function activeMonster(s, x, y) {
    for (var i = 0; i < s.monsters.length; i++) {
      var m = s.monsters[i]; if (m.hp > 0 && m.x === x && m.y === y) return m;
    }
    return null;
  }
  function occupied(s, x, y) { return activeMonster(s, x, y) || (s.player.x === x && s.player.y === y); }
  function placeFree(s, avoid) {
    for (var i = 0; i < 180; i++) {
      var p = s.level.randomFloor(s.rng, avoid || []);
      if (!occupied(s, p.x, p.y) && s.level.at(p.x, p.y) !== T.PILLAR) return p;
    }
    return { x: s.level.upx, y: s.level.upy };
  }
  function weightedMonsterFor(s) {
    var weights = {}, base = s.level.band.weight || {};
    for (var k in base) weights[k] = base[k];
    if (s.depth >= 4 && !weights.stalker) weights.stalker = 1;
    if (s.depth >= 5 && !weights.brute) weights.brute = 1;
    if (s.ascending) { weights.brute = (weights.brute || 0) + 2; weights.thief = (weights.thief || 0) + 1; }
    return weightedPick(s.rng, weights);
  }
  function spawnMonster(s, key, x, y, hpOverride, elite) {
    var base = MON[key] || MON.rat, hp = hpOverride == null ? base.hp + Math.floor((s.depth - 1) * 1.5) + (s.ascending ? 3 : 0) : hpOverride;
    var m = { id: s.monsters.length + 1 + (s.turn * 31), key: MON[key] ? key : 'rat', x: x, y: y,
      hp: hp, maxHp: hp, def: base.def + (s.depth > 5 ? 1 : 0) + (elite ? 1 : 0),
      dmg: [base.dmg[0] + Math.floor((s.depth - 1) / 3), base.dmg[1] + Math.floor((s.depth - 1) / 2)],
      xp: base.xp + (elite ? 4 : 0), elite: !!elite, fear: 0, dead: false,
      aiState: 'patrol', intent: null, intentT: 0, patrolX: x, patrolY: y };
    s.monsters.push(m); s.monsterViews[m.id] = { state: 'idle', t: 0, flash: 0, bob: 0 };
    return m;
  }
  function randomItem(s) {
    var keys = itemKeys();
    var r = s.rng.f();
    if (r < 0.22) return 'ration';
    if (r < 0.62) return Object.keys(POTIONS)[s.rng.int(0, Object.keys(POTIONS).length - 1)];
    return Object.keys(SCROLLS)[s.rng.int(0, Object.keys(SCROLLS).length - 1)];
  }
  function addItem(s, key) {
    for (var i = 0; i < s.inventory.length; i++) if (s.inventory[i].key === key) { s.inventory[i].n++; return true; }
    if (s.inventory.length >= 6) return false;
    s.inventory.push({ key: key, n: 1 }); return true;
  }
  function compactDead(s) {
    var alive = [];
    for (var i = 0; i < s.monsters.length; i++) {
      var m = s.monsters[i], v = s.monsterViews[m.id];
      if (m.hp > 0 || (v && v.t > 0)) alive.push(m);
    }
    s.monsters = alive;
  }
  function startFloor(s, depth, arrivingAtDown) {
    s.depth = depth; s.floorTurn = 0; s.level = new CC.Level(depth, s.rng, s.ascending);
    s.monsters = []; s.items = []; s.goldPiles = []; s.monsterViews = {}; s.floorCleared = false;
    s.player.x = arrivingAtDown ? s.level.downx : s.level.upx;
    s.player.y = arrivingAtDown ? s.level.downy : s.level.upy;
    var avoid = [{ x: s.player.x, y: s.player.y }];
    // Reserve the first room's cardinal ring for a guaranteed training read.
    // This keeps the first combat encounter deterministic without changing the
    // seeded floor layout or allowing a spawn on top of the player.
    if (depth === 1 && !s.ascending) {
      for (var ring = 0; ring < DIRS.length; ring++) {
        var rx = s.player.x + DIRS[ring][0], ry = s.player.y + DIRS[ring][1];
        if (s.level.walkable(rx, ry)) avoid.push({ x: rx, y: ry });
      }
    }
    var count = 4 + Math.floor(depth * 0.9) + (s.ascending ? 3 : 0);
    if (depth === 8) count = 8;
    for (var i = 0; i < count && s.monsters.length < MAX_MONSTERS; i++) {
      var spot = placeFree(s, avoid); avoid.push(spot);
      spawnMonster(s, weightedMonsterFor(s), spot.x, spot.y, null, depth >= 8 && i < 2);
    }
    if (depth === 1 && !s.ascending) {
      var trainingSpot = null;
      for (var td = 0; td < DIRS.length; td++) {
        var tx = s.player.x + DIRS[td][0], ty = s.player.y + DIRS[td][1];
        if (s.level.walkable(tx, ty) && !occupied(s, tx, ty)) { trainingSpot = { x: tx, y: ty }; break; }
      }
      if (trainingSpot) spawnMonster(s, 'rat', trainingSpot.x, trainingSpot.y, 5, false);
    }
    var special = s.level.special;
    function specialSpawn(key, ox, oy, elite) {
      var x = special.x + ox, y = special.y + oy;
      if (s.level.walkable(x, y) && !occupied(s, x, y)) spawnMonster(s, key, x, y, null, elite);
    }
    if (s.level.band.key === 'warrens') {
      specialSpawn('ooze', 0, 0, false); specialSpawn('rat', -1, 0, false); specialSpawn('rat', 1, 0, false);
      s.items.push({ x: special.x, y: Math.max(0, special.y - 1), key: randomItem(s), picked: false });
    } else if (s.level.band.key === 'flooded') {
      specialSpawn('archer', 0, 0, true); specialSpawn('ooze', -1, 0, false);
      s.goldPiles.push({ x: special.x + 1, y: special.y, amount: 18 + depth * 3 });
    } else if (s.level.band.key === 'forge') {
      specialSpawn('brute', 0, 0, true); specialSpawn('stalker', -1, 0, false);
      s.items.push({ x: special.x + 1, y: special.y, key: randomItem(s), picked: false });
    } else {
      specialSpawn('brute', -2, 0, true); specialSpawn('stalker', 2, 0, true);
      specialSpawn('archer', 0, -2, true); specialSpawn('thief', 0, 2, false);
      if (!s.hasCrown) s.items.push({ x: special.x, y: special.y, key: 'crown', picked: false });
    }
    var itemCount = depth <= 2 ? 6 : depth <= 4 ? 4 : 3;
    for (i = 0; i < itemCount; i++) { var ip = placeFree(s, avoid); avoid.push(ip); s.items.push({ x: ip.x, y: ip.y, key: randomItem(s), picked: false }); }
    var goldCount = depth <= 2 ? 8 : depth <= 4 ? 5 : 4;
    for (i = 0; i < goldCount; i++) { var gp = placeFree(s, avoid); avoid.push(gp); s.goldPiles.push({ x: gp.x, y: gp.y, amount: s.rng.int(5, 12) + depth * 2 }); }
    s.level.computeFov(s.player.x, s.player.y, 7);
    s.dirty = true;
    if (sceneRef()) { sceneRef().playBandAudio(s.level.band.key); sceneRef().beginFloorTransition(); }
    checkFloorClear(s);
  }
  function sceneRef() { return Game.scene; }
  function revealAll(s) {
    for (var i = 0; i < s.level.seen.length; i++) s.level.seen[i] = 1;
    for (var y = 0; y < s.level.h; y++) for (var x = 0; x < s.level.w; x++) s.level.visible[s.level.idx(x, y)] = 1;
    s.dirty = true;
  }
  function collect(s) {
    for (var i = s.goldPiles.length - 1; i >= 0; i--) {
      var g = s.goldPiles[i];
      if (g.x === s.player.x && g.y === s.player.y) {
        s.gold += g.amount; s.score += g.amount;
        s.goldPiles.splice(i, 1); if (sceneRef()) sceneRef().burstAt(s.player.x, s.player.y, 0xffd76d, 10);
        if (sceneRef()) sceneRef().pickupFx('+' + g.amount, 0xffd76d);
        CC.audio(kit, 'pickup');
      }
    }
    for (i = s.items.length - 1; i >= 0; i--) {
      var item = s.items[i]; if (item.x !== s.player.x || item.y !== s.player.y) continue;
      if (item.key === 'crown') {
        s.hasCrown = true; s.ascending = true; s.items.splice(i, 1); s.level.set(s.player.x, s.player.y, T.UP);
        showBanner(s, 'CROWN TAKEN', 'ASCEND', '#ffd76d');
        if (sceneRef()) sceneRef().burstAt(s.player.x, s.player.y, 0xffd76d, 32);
        CC.audio(kit, 'crown');
        continue;
      }
      if (addItem(s, item.key)) {
        s.items.splice(i, 1); if (sceneRef()) sceneRef().burstAt(s.player.x, s.player.y, itemColor(s, item.key), 12);
        if (sceneRef()) sceneRef().pickupFx('PACK +' + item.key.toUpperCase(), itemColor(s, item.key));
        CC.audio(kit, 'pickup');
      } else log(s, 'Pack full. Leave it or use something.', '#ff9a78');
    }
  }
  function setPlayerAnim(s, state, duration) {
    s.playerAnim.state = state;
    s.playerAnim.t = duration || 0;
    s.dirty = true;
  }
  function canMonsterStep(s, m, dx, dy) {
    if (!dx && !dy) return false;
    var nx = m.x + dx, ny = m.y + dy;
    if (!s.level.walkable(nx, ny) || activeMonster(s, nx, ny) || (s.player.x === nx && s.player.y === ny)) return false;
    if (dx && dy && (!s.level.walkable(m.x + dx, m.y) || !s.level.walkable(m.x, m.y + dy))) return false;
    return true;
  }
  function knockbackMonster(s, m) {
    if (!m || m.hp <= 0) return;
    var dx = CC.sign(m.x - s.player.x), dy = CC.sign(m.y - s.player.y);
    if (canMonsterStep(s, m, dx, dy)) moveMonster(s, m, dx, dy);
  }
  function hitMonster(s, m, damage) {
    if (!m || m.hp <= 0) return;
    m.hp -= Math.max(1, damage - (s.rng.int(0, m.def)));
    var v = s.monsterViews[m.id] || (s.monsterViews[m.id] = { state: 'idle', t: 0, flash: 0, bob: 0 });
    v.state = m.hp <= 0 ? 'death' : 'hit'; v.t = m.hp <= 0 ? 0.42 : 0.16; v.flash = 0.16;
    if (m.hp > 0) knockbackMonster(s, m);
    if (sceneRef()) { sceneRef().burstAt(m.x, m.y, MON[m.key].col, m.hp <= 0 ? 20 : 8); sceneRef().enemyFx(m.key, m.x, m.y, m.hp <= 0); sceneRef().hitJolt(); }
    CC.audio(kit, 'hit');
    if (m.key === 'ooze' && m.hp > 1 && !m.split) {
      m.split = true;
      var free = [];
      for (var d = 0; d < ALL_DIRS.length; d++) { var nx = m.x + ALL_DIRS[d][0], ny = m.y + ALL_DIRS[d][1]; if (s.level.walkable(nx, ny) && !occupied(s, nx, ny)) free.push({ x: nx, y: ny }); }
      if (free.length) { var p = s.rng.pick(free); spawnMonster(s, 'ooze', p.x, p.y, Math.max(2, Math.floor(m.hp / 2)), false); log(s, 'OOZE SPLIT', '#71e099'); }
    }
    if (m.hp <= 0) {
      s.kills++; s.score += 3; s.gold += m.elite ? 3 : 0;
      s.level.seen[s.level.idx(m.x, m.y)] = 1;
      if (sceneRef()) sceneRef().burstAt(m.x, m.y, 0xffd76d, 8);
    }
  }
  function hurtPlayer(s, amount, source) {
    var damage = Math.max(1, amount - (s.buffs.ward > 0 ? 3 : 0));
    if (s.buffs.ward > 0) s.buffs.ward--;
    s.hp = Math.max(0, s.hp - damage);
    setPlayerAnim(s, 'hurt', 0.22);
    if (sceneRef()) { sceneRef().burstAt(s.player.x, s.player.y, 0xff716a, 12); sceneRef().hitJolt(); }
    CC.audio(kit, 'hurt');
    if (s.hp <= 0) die(s, source);
  }
  function killMonster(s, m) {
    if (!m || m.hp <= 0) return;
    m.hp = 0;
    var v = s.monsterViews[m.id] || (s.monsterViews[m.id] = { state: 'idle', t: 0, flash: 0, bob: 0 });
    v.state = 'death'; v.t = 0.42;
  }
  function enemyAct(s, m) {
    if (m.hp <= 0) return;
    if (m.fear > 0) { fleeMonster(s, m, 1); m.fear--; m.intent = 'flee'; m.aiState = 'flee'; return; }
    var dx = s.player.x - m.x, dy = s.player.y - m.y, d = Math.max(Math.abs(dx), Math.abs(dy));
    var canSee = s.level.los(m.x, m.y, s.player.x, s.player.y) && d <= 8;
    // Stalkers hunt by sound, so their chase branch runs even when walls hide
    // the player. The previous visibility return made this branch unreachable.
    if (m.key === 'stalker' && d > 1) {
      m.aiState = 'chase'; m.intent = 'chase';
      if (d <= 10) { var stalkDx = CC.sign(dx), stalkDy = CC.sign(dy); if (Math.abs(dx) >= Math.abs(dy)) moveMonster(s, m, stalkDx, 0); else moveMonster(s, m, 0, stalkDy); }
      else wanderMonster(s, m);
      return;
    }
    if (m.key === 'archer' && d >= 2 && d <= 7 && canSee) {
      if (m.intent !== 'volley') { m.intent = 'volley'; m.aiState = 'telegraph'; CC.audio(kit, 'telegraph'); return; }
      hurtPlayer(s, s.rng.int(m.dmg[0], m.dmg[1]), 'a quill volley'); var v = s.monsterViews[m.id]; v.state = 'attack'; v.t = 0.22; m.intent = null; m.aiState = 'attack'; return;
    }
    if (d <= 1) {
      if (m.intent !== 'strike') { m.intent = 'strike'; m.aiState = 'telegraph'; CC.audio(kit, 'telegraph'); return; }
      hurtPlayer(s, s.rng.int(m.dmg[0], m.dmg[1]), MON[m.key].name);
      var av = s.monsterViews[m.id]; av.state = 'attack'; av.t = 0.22;
      m.intent = null; m.aiState = 'attack';
      if (m.key === 'thief' && s.gold > 0 && s.rng.chance(0.65)) { var stolen = Math.min(s.gold, s.rng.int(3, 8)); s.gold -= stolen; s.score = Math.max(0, s.score - stolen); log(s, '-' + stolen + ' GOLD', '#72dfe0'); m.fear = 2; fleeMonster(s, m, 2); }
      return;
    }
    if (!canSee && d > 1) { m.aiState = 'patrol'; m.intent = 'patrol'; if (s.rng.chance(0.45)) wanderMonster(s, m); return; }
    var sx = CC.sign(dx), sy = CC.sign(dy);
    m.aiState = 'chase'; m.intent = 'chase';
    if (Math.abs(dx) >= Math.abs(dy)) moveMonster(s, m, sx, 0); else moveMonster(s, m, 0, sy);
  }
  function wanderMonster(s, m) { var d = DIRS[s.rng.int(0, DIRS.length - 1)]; m.aiState = 'patrol'; m.intent = 'patrol'; moveMonster(s, m, d[0], d[1]); }
  function fleeMonster(s, m, steps) {
    for (var step = 0; step < (steps || 1); step++) {
      var dx = CC.sign(m.x - s.player.x), dy = CC.sign(m.y - s.player.y), choices = [];
      for (var i = 0; i < ALL_DIRS.length; i++) {
        var d = ALL_DIRS[i], nx = m.x + d[0], ny = m.y + d[1];
        if (canMonsterStep(s, m, d[0], d[1]) && CC.dist(nx, ny, s.player.x, s.player.y) > CC.dist(m.x, m.y, s.player.x, s.player.y)) choices.push(d);
      }
      choices.sort(function (a, b) { return (b[0] * dx + b[1] * dy) - (a[0] * dx + a[1] * dy); });
      if (!choices.length) return;
      moveMonster(s, m, choices[0][0], choices[0][1]);
    }
    m.aiState = 'flee'; m.intent = 'flee';
  }
  function moveMonster(s, m, dx, dy) {
    var nx = m.x + dx, ny = m.y + dy;
    if (!canMonsterStep(s, m, dx, dy)) return false;
    m.x = nx; m.y = ny;
    return true;
  }
  function checkFloorClear(s) {
    if (s.mode !== 'play' || s.floorCleared) return;
    var remaining = 0;
    for (var i = 0; i < s.monsters.length; i++) if (s.monsters[i].hp > 0) remaining++;
    if (remaining) return;
    s.floorCleared = true;
    var tier = s.hp > s.maxHp * 0.7 && s.floorTurn < 70 ? 'gold' : s.hp > s.maxHp * 0.35 ? 'silver' : 'bronze';
    s.medals[s.depth] = tier; s.score += FLOOR_MEDALS[tier];
    showBanner(s, 'FLOOR CLEAR', tier.toUpperCase() + ' medal  +' + FLOOR_MEDALS[tier], '#ffd76d');
    profile.medals[s.depth] = tier; saveProfile();
  }
  function milestone(s, depth) {
    if (s.milestones[depth]) return;
    s.milestones[depth] = true;
    var tier = s.hp > s.maxHp * 0.65 && s.hunger > s.hungerMax * 0.45 ? 'gold' : s.hp > s.maxHp * 0.3 ? 'silver' : 'bronze';
    s.score += depth * 2;
    showBanner(s, depth === 8 ? 'THE VAULT' : 'DEPTH ' + depth, tier.toUpperCase() + ' milestone  +' + depth * 2, depth === 8 ? '#ffdd79' : '#9ee6e9');
  }
  function resolveTurn(s) {
    if (s.mode !== 'play') return;
    s.turn++; s.floorTurn++; s.hunger = Math.max(0, s.hunger - 1);
    if (s.buffs.power > 0) s.buffs.power--;
    var skipEnemyPhase = s.buffs.haste > 0;
    if (s.hunger > s.hungerMax * 0.55 && s.turn % 6 === 0) s.hp = Math.min(s.maxHp, s.hp + 1);
    if (s.hunger <= 0 && s.turn % 3 === 0) hurtPlayer(s, 1, 'the hunger clock');
    if (s.mode !== 'play') return;
    if (skipEnemyPhase) s.buffs.haste--;
    else for (var i = 0; i < s.monsters.length && s.mode === 'play'; i++) enemyAct(s, s.monsters[i]);
    compactDead(s);
    s.level.computeFov(s.player.x, s.player.y, 7);
    checkFloorClear(s); s.dirty = true;
  }
  function descend(s) {
    if (s.depth >= 8) return;
    s.score += 1; s.depth++; s.maxDepth = Math.max(s.maxDepth, s.depth); profile.maxDepth = Math.max(profile.maxDepth, s.depth); refreshUnlocks();
    milestone(s, s.depth); CC.audio(kit, 'stairs'); startFloor(s, s.depth, false);
  }
  function ascend(s) {
    if (s.depth === 1) { if (s.hasCrown) win(s); else log(s, 'The exit is sealed. The Crown is below.', '#ff9a78'); return; }
    s.depth--; CC.audio(kit, 'stairs'); startFloor(s, s.depth, true);
  }
  function moveAction(s, dx, dy) {
    if (s.mode !== 'play') return;
    if (dx === 0 && dy === 0) { if (s.guide.step === 2) s.guide.step = 3; resolveTurn(s); return; }
    var nx = s.player.x + dx, ny = s.player.y + dy;
    if (dx !== 0 && dy !== 0 && (!s.level.walkable(s.player.x + dx, s.player.y) || !s.level.walkable(s.player.x, s.player.y + dy))) {
      log(s, 'The corner is too tight for a diagonal step.', '#778b9b'); return;
    }
    var target = activeMonster(s, nx, ny);
    if (target) { var damage = s.rng.int(s.atk[0], s.atk[1]) + (s.buffs.power > 0 ? 3 : 0); hitMonster(s, target, damage); s.lastAction = 'attack'; setPlayerAnim(s, 'attack', 0.22); if (s.guide.step === 1) s.guide.step = 2; resolveTurn(s); return; }
    if (!s.level.walkable(nx, ny)) { log(s, 'Stone refuses that step.', '#778b9b'); return; }
    s.player.x = nx; s.player.y = ny; s.lastAction = 'move'; setPlayerAnim(s, 'walk', 0.2);
    CC.audio(kit, 'footstep'); if (sceneRef()) sceneRef().dustAt(s.player.x, s.player.y);
    collect(s); resolveTurn(s);
    var tile = s.level.at(s.player.x, s.player.y);
    if (tile === T.DOWN && !s.hasCrown) descend(s);
    if (tile === T.UP && s.hasCrown) ascend(s);
    if (s.guide.step === 0) s.guide.step = 1;
  }
  function useItem(s, index) {
    if (s.mode !== 'play') return;
    var slot = s.inventory[index]; if (!slot) return;
    var key = slot.key, kind = itemKind(key), wasUnknown = (kind === 'potion' || kind === 'scroll') && !s.identified[key];
    slot.n--; if (slot.n <= 0) s.inventory.splice(index, 1);
    s.identified[key] = true;
    if (wasUnknown) showBanner(s, 'IDENTIFIED', itemName(s, key), itemColor(s, key));
    if (kind === 'food') { s.hunger = Math.min(s.hungerMax, s.hunger + 34); log(s, 'HUNGER +34', '#d1a56b'); }
    else if (kind === 'potion') {
      if (key === 'mend') { s.hp = Math.min(s.maxHp, s.hp + 10); log(s, 'HP +10', '#50e08d'); }
      if (key === 'fury') { s.buffs.power = 5; log(s, 'FURY 5', '#ff785e'); }
      if (key === 'quick') { s.buffs.haste = 1; log(s, 'HASTE 1', '#ffd45e'); }
      if (key === 'bile') { for (var i = 0; i < ALL_DIRS.length; i++) { var m = activeMonster(s, s.player.x + ALL_DIRS[i][0], s.player.y + ALL_DIRS[i][1]); if (m) hitMonster(s, m, 5); } log(s, 'BILE · ADJACENT', '#b47ce5'); }
      if (key === 'sight') { revealAll(s); log(s, 'REVEAL FLOOR', '#5ccdf0'); }
    } else if (key === 'blink') { var p = placeFree(s, [{ x: s.player.x, y: s.player.y }]); s.player.x = p.x; s.player.y = p.y; log(s, 'BLINK', '#d8e7ef'); }
    else if (key === 'flame') { for (var j = 0; j < s.monsters.length; j++) if (s.monsters[j].hp > 0 && s.level.visible[s.level.idx(s.monsters[j].x, s.monsters[j].y)]) hitMonster(s, s.monsters[j], 4); log(s, 'FLAME · VISIBLE', '#ff9a78'); }
    else if (key === 'ward') { s.buffs.ward = 5; log(s, 'WARD 5', '#a9d8ff'); }
    else if (key === 'terror') { for (var q = 0; q < s.monsters.length; q++) if (CC.dist(s.monsters[q].x, s.monsters[q].y, s.player.x, s.player.y) <= 4) { s.monsters[q].fear = 3; fleeMonster(s, s.monsters[q], 2); } log(s, 'TERROR · FLEE', '#c8a9ff'); }
    else if (key === 'mapping') { revealAll(s); log(s, 'REVEAL CORRIDORS', '#d8e7ef'); }
    CC.audio(kit, 'item-use'); if (sceneRef()) sceneRef().burstAt(s.player.x, s.player.y, itemColor(s, key), 16);
    resolveTurn(s); if (s.guide.step < 4) { s.guide.step = 4; if (!profile.tutorialDone) { profile.tutorialDone = true; saveProfile(); } }
  }
  function die(s, source) { if (s.mode !== 'play') return; s.mode = 'dead'; s.deathBy = source || 'the dark'; s.finalScore = s.score + s.depth * 10; profile.best = Math.max(profile.best, s.finalScore); profile.runs++; refreshUnlocks(); saveProfile(); showBanner(s, 'RUN ENDED', 'lost to ' + s.deathBy, '#ff7d78'); CC.audio(kit, 'death'); }
  function win(s) { if (s.mode !== 'play') return; s.mode = 'won'; s.finalScore = s.score + s.depth * 10 + 100; profile.best = Math.max(profile.best, s.finalScore); profile.escapes++; profile.runs++; refreshUnlocks(); saveProfile(); showBanner(s, 'ESCAPED', 'the Crown makes it into daylight', '#ffd76d'); CC.audio(kit, 'escape'); }

  function createCanvasTexture(scene, key, w, h, draw) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    var tex = scene.textures.createCanvas(key, w, h), src = tex.getSourceImage(), ctx = src.getContext('2d');
    ctx.imageSmoothingEnabled = false; draw(ctx, w, h); tex.refresh(); return tex;
  }
  function drawMonster(ctx, key, state) {
    var base = MON[key] || MON.rat, c = state === 'hit' ? 0xffffff : base.col, col = hex(c), muted = state === 'death';
    ctx.save(); ctx.translate(24, 25); ctx.globalAlpha = muted ? 0.52 : 1; ctx.fillStyle = col; ctx.strokeStyle = '#101521'; ctx.lineWidth = 3;
    if (key === 'rat') { ctx.beginPath(); ctx.ellipse(0, 4, 14, 10, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(-9, -5, 6, 0, TAU); ctx.arc(9, -5, 6, 0, TAU); ctx.fill(); ctx.stroke(); }
    else if (key === 'ooze') { ctx.beginPath(); ctx.arc(0, 2, 15, Math.PI, TAU); ctx.lineTo(15, 12); ctx.quadraticCurveTo(0, 20, -15, 12); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#11222a'; ctx.fillRect(-7, 1, 4, 4); ctx.fillRect(5, 1, 4, 4); }
    else if (key === 'archer') { ctx.beginPath(); ctx.moveTo(-13, 15); ctx.lineTo(-10, -10); ctx.lineTo(0, -17); ctx.lineTo(10, -10); ctx.lineTo(13, 15); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#1a1720'; ctx.fillRect(-5, -3, 10, 5); ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(8, 2, 15, -1.1, 1.1); ctx.stroke(); }
    else if (key === 'stalker') { ctx.beginPath(); ctx.moveTo(0, -19); ctx.lineTo(15, 15); ctx.lineTo(-15, 15); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#f6efff'; ctx.fillRect(-3, 0, 6, 3); }
    else if (key === 'brute') { ctx.fillRect(-14, -13, 28, 27); ctx.strokeRect(-14, -13, 28, 27); ctx.fillStyle = '#202938'; ctx.fillRect(-9, -5, 6, 5); ctx.fillRect(3, -5, 6, 5); ctx.fillStyle = col; ctx.fillRect(-19, -7, 5, 15); ctx.fillRect(14, -7, 5, 15); }
    else { ctx.beginPath(); ctx.moveTo(-12, 17); ctx.lineTo(-9, -10); ctx.lineTo(0, -18); ctx.lineTo(11, -8); ctx.lineTo(13, 17); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#122431'; ctx.fillRect(-5, -3, 10, 4); ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(-15, -2); ctx.lineTo(-24, 10); ctx.stroke(); }
    if (state === 'attack') { ctx.strokeStyle = '#fff1a6'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(14, -15); ctx.lineTo(25, 7); ctx.stroke(); }
    if (state === 'death') { ctx.strokeStyle = '#fff0b0'; ctx.beginPath(); ctx.moveTo(-15, -14); ctx.lineTo(15, 14); ctx.moveTo(15, -14); ctx.lineTo(-15, 14); ctx.stroke(); }
    ctx.restore();
  }
  function drawPlayer(ctx, state) {
    var walking = state === 'walk1' || state === 'walk2', bob = state === 'walk1' ? -2 : state === 'walk2' ? 1 : 0;
    ctx.save(); ctx.translate(24, 24 + bob); ctx.fillStyle = state === 'hurt' ? '#ffffff' : '#7ce7ff'; ctx.strokeStyle = '#0b1d2a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(13, -6); ctx.lineTo(10, 15); ctx.lineTo(-10, 15); ctx.lineTo(-13, -6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0b3141'; ctx.fillRect(-6, -3, 4, 4); ctx.fillRect(2, -3, 4, 4);
    if (state === 'attack') { ctx.strokeStyle = '#ffdf80'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(9, -7); ctx.lineTo(24, -16); ctx.stroke(); }
    if (walking) { ctx.fillStyle = '#2d9fc0'; ctx.fillRect(-10, 13, 6, 5); ctx.fillRect(4, state === 'walk1' ? 11 : 15, 6, 5); }
    if (state === 'hurt') { ctx.strokeStyle = '#ff746e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-18, -18); ctx.lineTo(18, 18); ctx.moveTo(18, -18); ctx.lineTo(-18, 18); ctx.stroke(); }
    ctx.restore();
  }
  function buildTextures(scene) {
    createCanvasTexture(scene, 'cc_particle', 6, 6, function (ctx) { ctx.fillStyle = '#ffffff'; ctx.fillRect(1, 0, 4, 6); ctx.fillRect(0, 1, 6, 4); });
    createCanvasTexture(scene, 'cc_spark', 8, 8, function (ctx) { ctx.fillStyle = '#ffffff'; ctx.fillRect(3, 0, 2, 8); ctx.fillRect(0, 3, 8, 2); });
    createCanvasTexture(scene, 'cc_dust', 8, 5, function (ctx) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 1, 3, 3); ctx.fillRect(5, 0, 3, 4); });
    createCanvasTexture(scene, 'cc_gold', 32, 32, function (ctx) { ctx.fillStyle = '#ffd76d'; ctx.strokeStyle = '#5a3828'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(16, 16, 10, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#6d4930'; ctx.fillRect(13, 10, 6, 12); });
    createCanvasTexture(scene, 'cc_item_unknown', 32, 32, function (ctx) { ctx.fillStyle = '#627588'; ctx.strokeStyle = '#b9d2dc'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(16, 15, 10, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#f5fbff'; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center'; ctx.fillText('?', 16, 21); });
    createCanvasTexture(scene, 'cc_item_food', 32, 32, function (ctx) { ctx.fillStyle = '#d1a56b'; ctx.strokeStyle = '#5d3b2d'; ctx.lineWidth = 2; ctx.fillRect(7, 9, 18, 13); ctx.strokeRect(7, 9, 18, 13); });
    createCanvasTexture(scene, 'cc_item_potion', 32, 32, function (ctx) { ctx.fillStyle = '#6de0b0'; ctx.strokeStyle = '#1c4e56'; ctx.lineWidth = 2; ctx.fillRect(12, 5, 8, 5); ctx.fillStyle = '#56cfe0'; ctx.beginPath(); ctx.moveTo(9, 10); ctx.lineTo(23, 10); ctx.lineTo(26, 24); ctx.lineTo(6, 24); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#d9ffff'; ctx.fillRect(11, 14, 5, 3); });
    createCanvasTexture(scene, 'cc_item_scroll', 32, 32, function (ctx) { ctx.fillStyle = '#e7edf1'; ctx.strokeStyle = '#455366'; ctx.lineWidth = 2; ctx.fillRect(8, 5, 16, 22); ctx.strokeRect(8, 5, 16, 22); ctx.fillStyle = '#718497'; ctx.fillRect(11, 11, 10, 2); ctx.fillRect(11, 16, 7, 2); });
    createCanvasTexture(scene, 'cc_item_crown', 32, 32, function (ctx) { ctx.fillStyle = '#ffd76d'; ctx.strokeStyle = '#603c3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(6, 23); ctx.lineTo(8, 8); ctx.lineTo(15, 15); ctx.lineTo(21, 7); ctx.lineTo(26, 23); ctx.closePath(); ctx.fill(); ctx.stroke(); });
    createCanvasTexture(scene, 'cc_player_idle', 48, 48, function (ctx) { drawPlayer(ctx, 'idle'); });
    createCanvasTexture(scene, 'cc_player_walk1', 48, 48, function (ctx) { drawPlayer(ctx, 'walk1'); });
    createCanvasTexture(scene, 'cc_player_walk2', 48, 48, function (ctx) { drawPlayer(ctx, 'walk2'); });
    createCanvasTexture(scene, 'cc_player_attack', 48, 48, function (ctx) { drawPlayer(ctx, 'attack'); });
    createCanvasTexture(scene, 'cc_player_hurt', 48, 48, function (ctx) { drawPlayer(ctx, 'hurt'); });
    for (var key in MON) for (var st in { idle: 1, attack: 1, hit: 1, death: 1 }) createCanvasTexture(scene, 'cc_' + key + '_' + st, 48, 48, (function (k, state) { return function (ctx) { drawMonster(ctx, k, state); }; })(key, st));
  }

  function CrawlScene() { Phaser.Scene.call(this, { key: 'CrawlScene' }); }
  CrawlScene.prototype = Object.create(Phaser.Scene.prototype);
  CrawlScene.prototype.constructor = CrawlScene;
  CrawlScene.prototype.preload = function () {
    kit.loader.show('CORRIDOR CRAWL');
    this.load.image('cc_atlas', 'assets/corridor-atlas.svg');
    kit.audio.preload(AUDIO_NAMES);
    kit.loader.progress(1);
  };
  CrawlScene.prototype.create = function () {
    Game.scene = this; this.simPaused = false; this.paused = false; this.touch = {}; this.keyLatch = {}; this.lastGamepadCode = null;
    this.metrics = {}; this.dirty = true; this.lastProbe = { floor: null, event: null }; this.particles = []; this.particlePool = [];
    buildTextures(this);
    createCanvasTexture(this, 'cc_chrome', 1, 1, function (ctx) { ctx.fillStyle = '#070b12'; ctx.fillRect(0, 0, 1, 1); });
    createCanvasTexture(this, 'cc_board', 1, 1, function (ctx) { ctx.fillStyle = '#101520'; ctx.fillRect(0, 0, 1, 1); });
    this.buildPools(); this.buildUi(); this.relayout();
    this.hardRestart(readProbe().floor || 1); this.attachInput(); kit.loader.hide(); kit.registerPWA();
    this.scale.on('resize', this.relayout, this);
  };
  CrawlScene.prototype.buildPools = function () {
    this.itemPool = []; this.goldPool = []; this.monPool = []; this.monHpBg = []; this.monHp = []; this.monIntent = []; this.monMark = [];
    for (var i = 0; i < MAX_ITEMS; i++) this.itemPool.push(this.add.image(0, 0, 'cc_item_unknown').setVisible(false).setDepth(8));
    for (i = 0; i < MAX_GOLD; i++) this.goldPool.push(this.add.image(0, 0, 'cc_gold').setVisible(false).setDepth(8));
    this.dustPool = [];
    for (i = 0; i < MAX_PARTICLES; i++) {
      this.particlePool.push(this.add.image(0, 0, 'cc_spark').setVisible(false).setDepth(60));
      this.dustPool.push(this.add.image(0, 0, 'cc_dust').setVisible(false).setDepth(59));
    }
    for (i = 0; i < MAX_MONSTERS; i++) {
      this.monPool.push(this.add.image(0, 0, 'cc_rat_idle').setVisible(false).setDepth(12));
      this.monHpBg.push(this.add.rectangle(0, 0, 24, 3, 0x161923).setOrigin(0.5).setVisible(false).setDepth(13));
      this.monHp.push(this.add.rectangle(0, 0, 22, 2, 0x71e099).setOrigin(0.5).setVisible(false).setDepth(14));
      this.monIntent.push(this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold', color: '#ffcf80' }).setOrigin(0.5).setVisible(false).setDepth(16));
      this.monMark.push(this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '9px', fontStyle: 'bold', color: '#ffd76d' }).setOrigin(0.5).setVisible(false).setDepth(16));
    }
    this.highlightPool = [];
    for (i = 0; i < 8; i++) this.highlightPool.push(this.add.rectangle(0, 0, 10, 10, 0x000000, 0).setOrigin(0).setStrokeStyle(2, 0x9ee6e9, 0.8).setVisible(false).setDepth(6));
    this.playerRing = this.add.rectangle(0, 0, 10, 10, 0x000000, 0).setOrigin(0).setStrokeStyle(2, 0x7ce7ff, 0.95).setDepth(10);
    this.playerImage = this.add.image(0, 0, 'cc_player_idle').setDepth(15);
  };
  CrawlScene.prototype.buildUi = function () {
    this.chromeImage = this.add.image(0, 0, 'cc_chrome').setOrigin(0).setDepth(-30);
    this.boardImage = this.add.image(0, 0, 'cc_board').setOrigin(0).setDepth(0);
    this.depthText = this.add.text(14, 13, '', { fontFamily: 'monospace', fontSize: '14px', color: '#98b7c7' }).setDepth(40);
    this.scoreText = this.add.text(0, 10, '', { fontFamily: 'monospace', fontSize: '14px', color: '#ffd76d' }).setOrigin(1, 0).setDepth(40);
    this.goldText = this.add.text(0, 31, '', { fontFamily: 'monospace', fontSize: '14px', color: '#ffd76d' }).setOrigin(1, 0).setDepth(40);
    this.hpText = this.add.text(0, 52, '', { fontFamily: 'monospace', fontSize: '14px', color: '#ffb2a8' }).setOrigin(1, 0).setDepth(40);
    this.hpBg = this.add.rectangle(0, 0, 100, 8, 0x20242e).setOrigin(0, 0).setDepth(38);
    this.hpFill = this.add.rectangle(0, 0, 100, 8, 0xef746d).setOrigin(0, 0).setDepth(39);
    this.hungerBg = this.add.rectangle(0, 0, 100, 8, 0x20242e).setOrigin(0, 0).setDepth(38);
    this.hungerWarning = this.add.rectangle(0, 0, 25, 8, 0x663334).setOrigin(0, 0).setDepth(37);
    this.hungerFill = this.add.rectangle(0, 0, 100, 8, 0xe7b45f).setOrigin(0, 0).setDepth(39);
    this.hungerText = this.add.text(0, 0, '◒', { fontFamily: 'monospace', fontSize: '14px', color: '#d8e7ef' }).setDepth(40);
    this.buffText = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '14px', color: '#d8e7ef' }).setDepth(40);
    this.guideBg = this.add.rectangle(0, 0, 10, 22, 0x0b141d, 0.92).setOrigin(0, 0).setDepth(45);
    this.guideText = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '14px', color: '#d9eff2' }).setOrigin(0.5).setDepth(46);
    this.inspectBg = this.add.rectangle(0, 0, 10, 22, 0x0b141d, 0.96).setOrigin(0, 0).setDepth(50).setVisible(false);
    this.inspectText = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '14px', color: '#e7f3f5', align: 'center' }).setOrigin(0.5).setDepth(51).setVisible(false);
    this.slotBg = []; this.slotIcon = []; this.slotCount = [];
    for (var i = 0; i < 6; i++) {
      var bg = this.add.rectangle(0, 0, 46, 62, 0x172330).setOrigin(0.5).setStrokeStyle(1, 0x3a5363, 1).setDepth(40);
      var icon = this.add.image(0, 0, 'cc_item_unknown').setDepth(41);
      var count = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(1, 1).setDepth(42);
      bg.setInteractive({ useHandCursor: true });
      (function (scene, index) { bg.on('pointerdown', function (pointer) { if (kit.paused || scene.simPaused || scene.state.mode !== 'play') return; scene.claimPointer(pointer); scene.touch[pointer.id] = { type: 'slot', index: index, x: pointer.x, y: pointer.y, at: performance.now() }; }); })(this, i);
      this.slotBg.push(bg); this.slotIcon.push(icon); this.slotCount.push(count);
    }
    this.settingsText = this.add.text(0, 0, '⚙', { fontFamily: 'monospace', fontSize: '18px', color: '#9ee6e9', backgroundColor: '#172330', padding: { left: 13, right: 13, top: 10, bottom: 10 } }).setDepth(45).setInteractive({ useHandCursor: true });
    this.settingsText.on('pointerdown', function () { if (kit.openSettings) kit.openSettings(); });
    this.boardHit = this.add.rectangle(0, 0, 10, 10, 0x000000, 0).setOrigin(0).setInteractive().setDepth(20);
    this.endShade = this.add.rectangle(0, 0, 10, 10, 0x04070b, 0.88).setOrigin(0).setDepth(80).setVisible(false);
    this.endTitle = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '25px', fontStyle: 'bold', color: '#ffd76d', align: 'center' }).setOrigin(0.5).setDepth(82).setVisible(false);
    this.endText = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '12px', color: '#d7e5eb', align: 'center', lineSpacing: 5, wordWrap: { width: 290 } }).setOrigin(0.5).setDepth(82).setVisible(false);
    this.endHit = this.add.rectangle(0, 0, 10, 10, 0x000000, 0).setOrigin(0).setInteractive().setDepth(85).setVisible(false);
    this.endHit.on('pointerdown', function () { kit.restart(); });
    this.bannerBg = this.add.rectangle(0, 0, 10, 22, 0x0b141d, 0.96).setOrigin(0, 0).setDepth(70).setVisible(false);
    this.bannerTitle = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '14px', fontStyle: 'bold', color: '#ffd76d', align: 'center' }).setOrigin(0.5).setDepth(71).setVisible(false);
    this.transitionShade = this.add.rectangle(0, 0, 10, 10, 0x03050a, 0.92).setOrigin(0).setDepth(75).setVisible(false);
  };
  CrawlScene.prototype.relayout = function () {
    if (!this.metrics || !this.boardImage) return;
    var w = Math.max(280, this.scale.width), h = Math.max(480, this.scale.height), top = h < 600 ? 104 : 96, bottom = h < 600 ? 96 : Math.max(184, Math.min(220, Math.floor(h * 0.28)));
    var available = Math.max(245, h - top - bottom), tile = Math.floor(Math.min((w - 20) / CC.MAPW, available / CC.MAPH));
    tile = clamp(tile, 14, 28);
    var boardW = tile * CC.MAPW, boardH = tile * CC.MAPH, boardX = Math.floor((w - boardW) / 2), boardY = top + Math.max(0, Math.floor((available - boardH) / 2));
    this.metrics = { w: w, h: h, tile: tile, boardW: boardW, boardH: boardH, boardX: boardX, boardY: boardY, barY: boardY + boardH + 8, barH: h - (boardY + boardH + 8) };
    createCanvasTexture(this, 'cc_chrome', w, h, function (ctx, cw, ch) {
      ctx.fillStyle = '#070b12'; ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = '#0e1822'; ctx.fillRect(8, 6, cw - 16, 66); ctx.fillStyle = '#152632'; ctx.fillRect(8, 72, cw - 16, 2);
      ctx.fillStyle = '#0c151e'; ctx.fillRect(boardX - 5, boardY - 5, boardW + 10, boardH + 10);
      ctx.strokeStyle = '#253e4c'; ctx.strokeRect(boardX - 5, boardY - 5, boardW + 10, boardH + 10);
      ctx.fillStyle = '#0e1822'; ctx.fillRect(8, boardY + boardH + 8, cw - 16, ch - boardY - boardH - 16);
      ctx.strokeStyle = '#203845'; ctx.strokeRect(8, boardY + boardH + 8, cw - 16, ch - boardY - boardH - 16);
    });
    this.chromeImage.setTexture('cc_chrome').setDisplaySize(w, h);
    this.boardImage.setPosition(boardX, boardY).setDisplaySize(boardW, boardH);
    this.boardHit.setPosition(boardX, boardY).setSize(boardW, boardH);
    this.playerRing.setSize(tile - 3, tile - 3);
    this.hpBg.setPosition(138, 22).setSize(Math.max(80, w - 236), 8); this.hpFill.setPosition(138, 22);
    this.hungerBg.setPosition(138, 44).setSize(Math.max(80, w - 236), 8); this.hungerFill.setPosition(138, 44); this.hungerWarning.setPosition(138, 44);
    this.scoreText.setPosition(w - 14, 12); this.goldText.setPosition(w - 14, 31); this.hpText.setPosition(w - 14, 50);
    var stripY = Math.max(76, boardY - 27);
    this.hungerText.setPosition(120, 40); this.buffText.setPosition(14, 56); this.settingsText.setPosition(w - 49, 14);
    this.guideBg.setPosition(boardX, stripY).setSize(boardW, 22); this.guideText.setPosition(w / 2, stripY + 11);
    this.inspectBg.setPosition(boardX, stripY).setSize(boardW, 22); this.inspectText.setPosition(w / 2, stripY + 11);
    var gap = 6, slotW = Math.min(52, (w - 28 - gap * 5) / 6), start = (w - (slotW * 6 + gap * 5)) / 2;
    for (var i = 0; i < 6; i++) { var x = start + slotW / 2 + i * (slotW + gap), y = boardY + boardH + 45; this.slotBg[i].setPosition(x, y).setSize(slotW, 62); this.slotIcon[i].setPosition(x, y - 7); this.slotCount[i].setPosition(x + slotW / 2 - 4, y + 23); }
    this.endShade.setSize(w, h); this.endHit.setSize(w, h); this.endTitle.setPosition(w / 2, h * 0.35); this.endText.setPosition(w / 2, h * 0.53); this.transitionShade.setSize(w, h);
    this.bannerBg.setPosition(boardX, stripY).setSize(boardW, 22); this.bannerTitle.setPosition(w / 2, stripY + 11);
    if (this.state) this.state.dirty = true;
  };
  CrawlScene.prototype.drawBoard = function () {
    if (!this.state || !this.state.level) return;
    var s = this.state, m = this.metrics, band = s.level.band;
    createCanvasTexture(this, 'cc_board', m.boardW, m.boardH, function (ctx, bw, bh) {
      var tile = m.tile;
      for (var y = 0; y < s.level.h; y++) for (var x = 0; x < s.level.w; x++) {
        var idx = s.level.idx(x, y), visible = s.level.visible[idx] === 1, seen = s.level.seen[idx] === 1, t = s.level.at(x, y), px = x * tile, py = y * tile;
        var floorColor = t === T.WATER ? band.water : t === T.EMBER ? band.ember : t === T.VAULT ? 0x69508e : band.floor;
        ctx.fillStyle = !seen ? hex(band.fog) : !visible ? '#101520' : t === T.WALL || t === T.PILLAR ? hex(band.wall) : hex(floorColor);
        ctx.fillRect(px, py, tile, tile);
        if (!seen) continue;
        if (t === T.WALL || t === T.PILLAR) {
          ctx.fillStyle = visible ? hex(band.wall) : '#141b24';
          ctx.fillRect(px + 1, py + 1, tile - 2, tile - 2);
          if (visible) { ctx.fillStyle = hex(band.edge); ctx.fillRect(px + 2, py + 2, tile - 4, 2); ctx.fillRect(px + 2, py + 2, 2, tile - 4); }
          ctx.strokeStyle = visible ? hex(band.edge) : '#252b37'; ctx.lineWidth = 1;
          for (var d = 0; d < 4; d++) { var nx = x + DIRS[d][0], ny = y + DIRS[d][1]; if (s.level.walkable(nx, ny)) { ctx.beginPath(); if (d === 0) { ctx.moveTo(px, py + 1); ctx.lineTo(px + tile, py + 1); } if (d === 1) { ctx.moveTo(px + tile - 1, py); ctx.lineTo(px + tile - 1, py + tile); } if (d === 2) { ctx.moveTo(px, py + tile - 1); ctx.lineTo(px + tile, py + tile - 1); } if (d === 3) { ctx.moveTo(px + 1, py); ctx.lineTo(px + 1, py + tile); } ctx.stroke(); } }
          if (t === T.PILLAR) { ctx.fillStyle = hex(band.edge); ctx.fillRect(px + 4, py + 4, Math.max(2, tile - 8), Math.max(2, tile - 8)); ctx.fillStyle = '#c7a4ed'; ctx.fillRect(px + 5, py + 5, 2, Math.max(2, tile - 10)); }
        } else if (visible && t === T.WATER) {
          ctx.strokeStyle = '#8be7ed'; ctx.globalAlpha = 0.48; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px + 2, py + tile * 0.34); ctx.lineTo(px + tile * 0.42, py + tile * 0.34); ctx.lineTo(px + tile * 0.58, py + tile * 0.52); ctx.lineTo(px + tile - 2, py + tile * 0.52); ctx.stroke(); ctx.globalAlpha = 1;
        } else if (visible && t === T.EMBER) {
          ctx.fillStyle = '#ffba67'; ctx.fillRect(px + tile * 0.2, py + tile * 0.28, 2, 2); ctx.fillRect(px + tile * 0.64, py + tile * 0.65, 2, 2);
          ctx.fillStyle = '#702f32'; ctx.fillRect(px + tile * 0.34, py + tile * 0.7, 2, 1);
        } else if (visible && t === T.VAULT) {
          ctx.fillStyle = '#b895e5'; ctx.fillRect(px + tile * 0.45, py + tile * 0.2, 2, Math.max(3, tile * 0.6));
        } else if (visible) {
          // Tiny floor glyphs make rooms read as authored stone rather than
          // a field of flat rectangles while remaining legible at 14px tiles.
          ctx.fillStyle = hex(band.edge); ctx.globalAlpha = 0.28;
          if ((x * 5 + y * 3) % 7 === 0) ctx.fillRect(px + tile * 0.25, py + tile * 0.7, 2, 1);
          if ((x + y * 2) % 11 === 0) ctx.fillRect(px + tile * 0.68, py + tile * 0.25, 1, 2);
          ctx.globalAlpha = 1;
        }
        if (visible && t !== T.WALL && t !== T.PILLAR) {
          ctx.strokeStyle = hex(band.edge); ctx.globalAlpha = 0.38; ctx.lineWidth = 1;
          if (!s.level.walkable(x, y - 1)) { ctx.beginPath(); ctx.moveTo(px, py + 1); ctx.lineTo(px + tile, py + 1); ctx.stroke(); }
          if (!s.level.walkable(x - 1, y)) { ctx.beginPath(); ctx.moveTo(px + 1, py); ctx.lineTo(px + 1, py + tile); ctx.stroke(); }
          ctx.globalAlpha = 1;
        }
        if (visible && t === T.UP) { ctx.strokeStyle = '#8be7ed'; ctx.lineWidth = 2; ctx.strokeRect(px + 4, py + 4, tile - 8, tile - 8); ctx.fillStyle = '#8be7ed'; ctx.fillRect(px + tile * 0.3, py + tile * 0.5, tile * 0.4, 2); }
        if (visible && t === T.DOWN) { ctx.strokeStyle = '#ffd76d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px + tile / 2, py + tile / 2, tile * 0.28, 0, TAU); ctx.stroke(); ctx.fillStyle = '#ffd76d'; ctx.fillRect(px + tile * 0.42, py + tile * 0.42, 3, 3); }
      }
      var light = ctx.createRadialGradient((s.player.x + 0.5) * tile, (s.player.y + 0.5) * tile, tile * 1.5, (s.player.x + 0.5) * tile, (s.player.y + 0.5) * tile, tile * 8);
      light.addColorStop(0, 'rgba(255,231,174,0)'); light.addColorStop(0.55, 'rgba(8,10,18,0.03)'); light.addColorStop(1, 'rgba(4,6,12,0.48)');
      ctx.fillStyle = light; ctx.fillRect(0, 0, bw, bh);
    });
    this.boardImage.setTexture('cc_board').setDisplaySize(m.boardW, m.boardH);
  };
  CrawlScene.prototype.cell = function (x, y) { return { x: this.metrics.boardX + (x + 0.5) * this.metrics.tile, y: this.metrics.boardY + (y + 0.5) * this.metrics.tile }; };
  CrawlScene.prototype.renderWorld = function () {
    var s = this.state, m = this.metrics, i, p;
    for (i = 0; i < this.itemPool.length; i++) this.itemPool[i].setVisible(false);
    for (i = 0; i < this.goldPool.length; i++) this.goldPool[i].setVisible(false);
    for (i = 0; i < this.monPool.length; i++) { this.monPool[i].setVisible(false); this.monHpBg[i].setVisible(false); this.monHp[i].setVisible(false); this.monIntent[i].setVisible(false); this.monMark[i].setVisible(false); }
    for (i = 0; i < s.items.length && i < MAX_ITEMS; i++) {
      var item = s.items[i], idx = s.level.idx(item.x, item.y); if (!s.level.visible[idx]) continue; p = this.cell(item.x, item.y);
      var iconKey = item.key === 'crown' ? 'cc_item_crown' : item.key === 'ration' ? 'cc_item_food' : s.identified[item.key] && itemKind(item.key) === 'scroll' ? 'cc_item_scroll' : s.identified[item.key] && itemKind(item.key) === 'potion' ? 'cc_item_potion' : 'cc_item_unknown';
      this.itemPool[i].setTexture(iconKey).setPosition(p.x, p.y).setVisible(true).setTint(item.key === 'crown' ? 0xffd76d : itemColor(s, item.key));
    }
    for (i = 0; i < s.goldPiles.length && i < MAX_GOLD; i++) { var gp = s.goldPiles[i], gi = s.level.idx(gp.x, gp.y); if (!s.level.visible[gi]) continue; p = this.cell(gp.x, gp.y); this.goldPool[i].setPosition(p.x, p.y).setVisible(true); }
    for (i = 0; i < s.monsters.length && i < MAX_MONSTERS; i++) {
      var mon = s.monsters[i], mi = s.level.idx(mon.x, mon.y), view = s.monsterViews[mon.id];
      if (!view || !s.level.visible[mi]) continue;
      p = this.cell(mon.x, mon.y); var textureState = view.state || 'idle';
      this.monPool[i].setTexture('cc_' + (MON[mon.key] ? mon.key : 'rat') + '_' + textureState).setPosition(p.x, p.y + (view.state === 'idle' ? Math.sin(view.bob) * 1 : 0)).setDisplaySize(m.tile * 0.9, m.tile * 0.9).setVisible(true).setTint(0xffffff).setAlpha(mon.hp <= 0 ? clamp(view.t / 0.42, 0, 1) : 1);
      this.monHpBg[i].setPosition(p.x, p.y - m.tile * 0.42).setVisible(mon.hp > 0);
      this.monHp[i].setPosition(p.x - 1, p.y - m.tile * 0.42).setDisplaySize(Math.max(1, 22 * clamp(mon.hp / mon.maxHp, 0, 1)), 2);
      CC.setColorIfChanged(this.monHp[i], mon.elite ? 0xffd76d : 0x71e099); this.monHp[i].setVisible(mon.hp > 0);
      var intent = mon.intent === 'strike' ? '!' : mon.intent === 'volley' ? '^' : mon.intent === 'flee' ? '<' : mon.intent === 'chase' ? '>' : '';
      if (intent && mon.hp > 0) this.monIntent[i].setText(intent).setPosition(p.x, p.y - m.tile * 0.72).setVisible(true);
      if (mon.elite && mon.hp > 0) this.monMark[i].setText('◆').setPosition(p.x + m.tile * 0.38, p.y - m.tile * 0.38).setVisible(true);
    }
    var pp = this.cell(s.player.x, s.player.y), anim = s.playerAnim || { state: 'idle', t: 0 }, playerState = anim.state === 'attack' ? 'cc_player_attack' : anim.state === 'hurt' ? 'cc_player_hurt' : anim.state === 'walk' ? 'cc_player_' + (Math.floor(anim.t * 30) % 2 ? 'walk1' : 'walk2') : 'cc_player_idle';
    this.playerImage.setTexture(playerState).setPosition(pp.x, pp.y).setDisplaySize(m.tile * 0.92, m.tile * 0.92).setVisible(s.mode === 'play' || s.mode === 'dead');
    this.playerRing.setPosition(m.boardX + s.player.x * m.tile + 1.5, m.boardY + s.player.y * m.tile + 1.5).setSize(m.tile - 3, m.tile - 3).setVisible(s.mode === 'play');
    for (i = 0; i < this.highlightPool.length; i++) this.highlightPool[i].setVisible(false);
    if (s.mode === 'play') {
      var hi = 0;
      for (i = 0; i < ALL_DIRS.length && hi < 8; i++) { var hx = s.player.x + ALL_DIRS[i][0], hy = s.player.y + ALL_DIRS[i][1]; if (!s.level.walkable(hx, hy)) continue; var hp = this.highlightPool[hi++]; hp.setPosition(m.boardX + hx * m.tile + 2, m.boardY + hy * m.tile + 2).setSize(m.tile - 4, m.tile - 4).setStrokeStyle(2, activeMonster(s, hx, hy) ? 0xff8d79 : 0x9ee6e9, activeMonster(s, hx, hy) ? 0.95 : 0.55).setVisible(true); }
    }
  };
  CrawlScene.prototype.renderHud = function () {
    var s = this.state, m = this.metrics, w = m.w;
    CC.setTextIfChanged(this.depthText, (s.ascending ? '↑ ' : '↓ ') + s.depth + ' · ' + s.turn);
    CC.setTextIfChanged(this.scoreText, '★ ' + s.score); CC.setTextIfChanged(this.goldText, '◆ ' + s.gold); CC.setTextIfChanged(this.hpText, '♥ ' + s.hp + '/' + s.maxHp);
    this.hpFill.setDisplaySize(Math.max(1, (m.w - 236) * clamp(s.hp / s.maxHp, 0, 1)), 8); this.hungerFill.setDisplaySize(Math.max(1, (m.w - 236) * clamp(s.hunger / s.hungerMax, 0, 1)), 8);
    this.hungerWarning.setDisplaySize(Math.max(1, (m.w - 236) * 0.24), 8); this.hungerWarning.setFillStyle(s.hunger <= s.hungerMax * 0.24 ? 0xb64c4d : 0x663334);
    var buffs = []; if (s.buffs.power > 0) buffs.push('⚔' + s.buffs.power); if (s.buffs.ward > 0) buffs.push('⛨' + s.buffs.ward); if (s.buffs.haste > 0) buffs.push('⏩' + s.buffs.haste);
    CC.setTextIfChanged(this.buffText, buffs.join('  '));
    for (var i = 0; i < 6; i++) {
      var slot = s.inventory[i]; this.slotBg[i].setVisible(!!slot); this.slotIcon[i].setVisible(!!slot); this.slotCount[i].setVisible(!!slot);
      if (!slot) continue;
      var ik = itemKind(slot.key), known = !!s.identified[slot.key], key = slot.key === 'crown' ? 'cc_item_crown' : slot.key === 'ration' ? 'cc_item_food' : known && ik === 'scroll' ? 'cc_item_scroll' : known && ik === 'potion' ? 'cc_item_potion' : 'cc_item_unknown';
      this.slotIcon[i].setTexture(key).setTint(itemColor(s, slot.key)); this.slotCount[i].setText(String(slot.n));
    }
    var guide = s.guide.step === 0 ? 'TAP HIGHLIGHT TO MOVE · TAP SELF TO WAIT' : s.guide.step === 1 ? 'ENEMY TILE = ATTACK · SELF = WAIT' : s.guide.step === 2 ? 'WAIT PASSES TURN · WATCH THE HUNGER METER' : s.guide.step === 3 ? 'PACK TAP = USE · HOLD TILE = INSPECT' : 'HOLD TILE OR ITEM TO INSPECT';
    var b = s.banner, bannerActive = s.mode === 'play' && b && b.t > 0, inspectActive = !bannerActive && s.mode === 'play' && s.inspect && s.inspect.t > 0, guideActive = !bannerActive && !inspectActive && s.mode === 'play' && s.guide.t > 0;
    this.guideBg.setVisible(guideActive); this.guideText.setVisible(guideActive); CC.setTextIfChanged(this.guideText, guide); var guideAlpha = kit.juice.enabled ? clamp(s.guide.t / 0.6, 0, 1) : 0.86; this.guideText.setAlpha(guideAlpha); this.guideBg.setAlpha(guideAlpha * 0.72);
    this.inspectBg.setVisible(inspectActive); this.inspectText.setVisible(inspectActive); if (inspectActive) { CC.setTextIfChanged(this.inspectText, s.inspect.text); this.inspectText.setColor(s.inspect.color || '#e7f3f5'); var inspectAlpha = kit.juice.enabled ? clamp(s.inspect.t / 0.18, 0, 1) : 0.92; this.inspectText.setAlpha(inspectAlpha); this.inspectBg.setAlpha(inspectAlpha * 0.82); }
    this.bannerBg.setVisible(!!bannerActive); this.bannerTitle.setVisible(!!bannerActive); if (bannerActive) { var bannerAlpha = kit.juice.enabled ? clamp(b.t / 0.18, 0, 1) : 0.92; this.bannerBg.setAlpha(bannerAlpha * 0.86); this.bannerTitle.setAlpha(bannerAlpha); this.bannerTitle.setColor(b.color); CC.setTextIfChanged(this.bannerTitle, b.text); }
    var ended = s.mode === 'dead' || s.mode === 'won'; this.endShade.setVisible(ended); this.endTitle.setVisible(ended); this.endText.setVisible(ended); this.endHit.setVisible(ended); if (ended) this.endHit.setInteractive(); else this.endHit.disableInteractive();
    if (ended) { CC.setTextIfChanged(this.endTitle, s.mode === 'won' ? 'ESCAPED' : 'PERMADEATH'); this.endTitle.setColor(s.mode === 'won' ? '#ffd76d' : '#ff8d79'); var unlock = profile.unlockedKits.map(function (k) { return KITS[k].mark + ' ' + KITS[k].name; }).join('\n'); CC.setTextIfChanged(this.endText, (s.mode === 'won' ? 'The Crown returns to daylight.\n' : 'Lost to ' + s.deathBy + '.\n') + 'FINAL SCORE  ' + s.finalScore + '\nBEST  ' + profile.best + '\n\nUNLOCKED KITS\n' + unlock + '\n\nTAP ANYWHERE TO START AGAIN'); }
  };
  CrawlScene.prototype.updateVisuals = function (dt) {
    var s = this.state;
    if (s.banner) {
      s.banner.t -= dt;
      if (s.banner.t <= 0) s.banner = s.bannerQueue && s.bannerQueue.length ? s.bannerQueue.shift() : null;
    }
    var bannerActive = s.banner && s.banner.t > 0;
    if (!bannerActive && s.inspect && s.inspect.t > 0) s.inspect.t -= dt;
    if (!bannerActive && !(s.inspect && s.inspect.t > 0) && s.guide.t > 0) s.guide.t -= dt;
    if (s.playerAnim && s.playerAnim.t > 0) { s.playerAnim.t -= dt; if (s.playerAnim.t <= 0) s.playerAnim.state = 'idle'; }
    for (var id in s.monsterViews) { var v = s.monsterViews[id]; if (v.t > 0) { v.t -= dt; if (v.t <= 0) v.state = 'idle'; } v.bob += dt * 4; }
    for (var i = this.particles.length - 1; i >= 0; i--) { var p = this.particles[i]; p.t -= dt; if (p.t <= 0) { p.image.setVisible(false); this.particles.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; p.image.setPosition(this.metrics.boardX + (p.x + 0.5) * this.metrics.tile, this.metrics.boardY + (p.y + 0.5) * this.metrics.tile).setAlpha(clamp(p.t / p.max, 0, 1)); }
    compactDead(s);
  };
  CrawlScene.prototype.burstAt = function (x, y, color, count) {
    if (!this.metrics) return;
    var allowed = kit.juice.enabled ? count : Math.ceil(count * 0.35);
    for (var i = 0; i < allowed && this.particles.length < MAX_PARTICLES; i++) {
      var img = null;
      for (var pi = 0; pi < this.particlePool.length; pi++) if (!this.particlePool[pi].visible) { img = this.particlePool[pi]; break; }
      if (!img) break;
      var a = Math.random() * TAU, sp = 1.4 + Math.random() * 2.2;
      img.setTint(color).setVisible(true);
      this.particles.push({ image: img, x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, t: 0.35 + Math.random() * 0.25, max: 0.6 });
    }
  };
  CrawlScene.prototype.emitDust = function (x, y, color, count) {
    if (!this.metrics) return;
    var allowed = kit.juice.enabled ? count : Math.ceil(count * 0.35);
    for (var i = 0; i < allowed && this.particles.length < MAX_PARTICLES; i++) {
      var img = null;
      for (var pi = 0; pi < this.dustPool.length; pi++) if (!this.dustPool[pi].visible) { img = this.dustPool[pi]; break; }
      if (!img) break;
      var a = Math.random() * TAU, sp = 0.5 + Math.random() * 1.2;
      img.setTint(color).setVisible(true);
      this.particles.push({ image: img, x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.4, t: 0.22 + Math.random() * 0.18, max: 0.4 });
    }
  };
  CrawlScene.prototype.dustAt = function (x, y) { this.emitDust(x, y, this.state.level.band.accent, 5); };
  CrawlScene.prototype.enemyFx = function (key, x, y, defeated) {
    var color = MON[key] ? MON[key].col : 0xffffff;
    var secondary = key === 'ooze' ? 8 : key === 'brute' ? 4 : key === 'archer' ? 3 : 5;
    this.emitDust(x, y, color, secondary + (defeated ? 3 : 0));
    if (key === 'stalker' || key === 'thief') this.emitDust(x, y, 0x9ee6e9, 3);
  };
  CrawlScene.prototype.pickupFx = function (label, color) {
    queueTransient(this.state, label, color);
    if (kit.juice.enabled) this.tweens.add({ targets: [this.goldText], scale: 1.08, duration: 90, yoyo: true, ease: 'Quad.Out' });
  };
  CrawlScene.prototype.beginFloorTransition = function () {
    if (!this.transitionShade) return;
    this.transitionShade.setVisible(true).setAlpha(0.92);
    this.tweens.add({ targets: this.transitionShade, alpha: 0, duration: 250, ease: 'Quad.Out', onComplete: function () { this.transitionShade.setVisible(false); }.bind(this) });
  };
  CrawlScene.prototype.hitJolt = function () { if (kit.juice.enabled) { kit.juice.shake(2, 90); kit.juice.hitStop(45); } };
  CrawlScene.prototype.playBandAudio = function (band) { CC.audio(kit, 'ambience-' + band); kit.audio.music('ambience-' + band, 350); };
  CrawlScene.prototype.applyForceEvent = function (event) {
    if (!event || !this.state) return;
    var s = this.state;
    if (event === 'crown') { s.depth = 8; s.maxDepth = 8; s.ascending = false; startFloor(s, 8, false); s.player.x = s.level.special.x; s.player.y = s.level.special.y; collect(s); }
    else if (event === 'floor-clear') { for (var i = 0; i < s.monsters.length; i++) killMonster(s, s.monsters[i]); compactDead(s); checkFloorClear(s); }
    else if (event === 'escape') { s.hasCrown = true; s.depth = 1; s.ascending = true; win(s); }
    else if (event === 'tutorial') { s.guide.step = 0; s.guide.max = 3.5; s.guide.t = 3.5; }
    s.dirty = true;
  };
  CrawlScene.prototype.hardRestart = function (forcedDepth) {
    this.clearTouches(); this.keyLatch = {}; this.particles.forEach(function (p) { p.image.setVisible(false); }); this.particles.length = 0;
    this.state = makeState(this, forcedDepth || 1); root.__cc.state = this.state; startFloor(this.state, forcedDepth || 1, false);
    this.lastProbe = readProbe(); this.state.dirty = true;
    var event = this.lastProbe.event; if (event) this.applyForceEvent(event);
  };
  CrawlScene.prototype.clearTouches = function () {
    this.touch = {};
    if (kit && kit.input) kit.input.clearAll();
  };
  CrawlScene.prototype.claimPointer = function (pointer) {
    var id = pointer.id == null ? 0 : pointer.id, ev = pointer.event || {};
    if (!kit.input.pointers.has(id)) kit.input.pointers.set(id, { x: ev.clientX || pointer.x, y: ev.clientY || pointer.y, startX: ev.clientX || pointer.x, startY: ev.clientY || pointer.y, downAt: performance.now(), zone: null });
    var p = kit.input.pointers.get(id); if (p) p.zone = 'corridor-crawl';
  };
  CrawlScene.prototype.attachInput = function () {
    var self = this;
    this.input.on('pointerdown', function (pointer) { if (self.state.mode !== 'play' || kit.paused || self.simPaused) return; self.claimPointer(pointer); if (pointer.x >= self.metrics.boardX && pointer.x < self.metrics.boardX + self.metrics.boardW && pointer.y >= self.metrics.boardY && pointer.y < self.metrics.boardY + self.metrics.boardH) self.touch[pointer.id] = { type: 'board', x: pointer.x, y: pointer.y, at: performance.now() }; });
    this.input.on('pointerup', function (pointer) { self.releasePointer(pointer); });
    this.input.on('pointerupoutside', function (pointer) { self.releasePointer(pointer); });
  };
  CrawlScene.prototype.releasePointer = function (pointer) {
    var touch = this.touch[pointer.id]; if (!touch) return; delete this.touch[pointer.id]; var elapsed = performance.now() - touch.at;
    if (this.state.mode !== 'play' || kit.paused || this.simPaused) return;
    if (elapsed > 420) { if (touch.type === 'slot') this.inspectSlot(touch.index); else this.inspectTile(touch.x, touch.y); return; }
    if (touch.type === 'slot') { useItem(this.state, touch.index); return; }
    var x = Math.floor((touch.x - this.metrics.boardX) / this.metrics.tile), y = Math.floor((touch.y - this.metrics.boardY) / this.metrics.tile), dx = clamp(x - this.state.player.x, -1, 1), dy = clamp(y - this.state.player.y, -1, 1);
    if (x === this.state.player.x && y === this.state.player.y) moveAction(this.state, 0, 0); else if (CC.dist(x, y, this.state.player.x, this.state.player.y) === 1) moveAction(this.state, dx, dy); else log(this.state, 'Choose one of the adjacent highlights.', '#778b9b');
    this.state.dirty = true;
  };
  CrawlScene.prototype.inspectSlot = function (index) {
    var slot = this.state.inventory[index]; if (!slot) return;
    var kind = itemKind(slot.key), known = !!this.state.identified[slot.key], label = (known || kind === 'food' || kind === 'crown') ? itemName(this.state, slot.key).replace('Potion of ', '').replace('Scroll of ', '') : 'UNKNOWN';
    this.state.inspect = { t: 1, max: 1, text: 'PACK ' + (index + 1) + ' · ' + label + ' · ' + itemShort(this.state, slot.key), color: hex(itemColor(this.state, slot.key)) };
  };
  CrawlScene.prototype.inspectTile = function (x, y) {
    var tx = Math.floor((x - this.metrics.boardX) / this.metrics.tile), ty = Math.floor((y - this.metrics.boardY) / this.metrics.tile), s = this.state;
    if (tx < 0 || ty < 0 || tx >= CC.MAPW || ty >= CC.MAPH) return;
    var idx = s.level.idx(tx, ty); if (!s.level.seen[idx]) { s.inspect = { t: 1, max: 1, text: 'FOG · UNSEEN', color: '#778b9b' }; return; }
    var m = activeMonster(s, tx, ty), item = null;
    for (var i = 0; i < s.items.length; i++) if (s.items[i].x === tx && s.items[i].y === ty) item = s.items[i];
    var tile = s.level.at(tx, ty), text = m ? 'MON · ' + MON[m.key].name + ' · HP ' + m.hp + '/' + m.maxHp : item ? 'ITEM · ' + itemName(s, item.key).replace('Potion of ', '').replace('Scroll of ', '') + ' · ' + itemShort(s, item.key) : tile === T.UP ? '↑ ASCENT STAIRS' : tile === T.DOWN ? '↓ DESCENT STAIRS' : 'FLOOR';
    s.inspect = { t: 1, max: 1, text: text, color: m ? '#ffcf80' : '#e7f3f5' };
  };
  function readGamepadDirection() {
    var nav = root.navigator;
    if (!nav || typeof nav.getGamepads !== 'function') return null;
    var pads = nav.getGamepads(), pad = null;
    for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { pad = pads[i]; break; }
    if (!pad) return null;
    var buttons = pad.buttons || [], dpad = buttons[12] && buttons[12].pressed ? { code: 'pad-up', dx: 0, dy: -1 } : buttons[13] && buttons[13].pressed ? { code: 'pad-down', dx: 0, dy: 1 } : buttons[14] && buttons[14].pressed ? { code: 'pad-left', dx: -1, dy: 0 } : buttons[15] && buttons[15].pressed ? { code: 'pad-right', dx: 1, dy: 0 } : null;
    if (dpad) return dpad;
    var ax = Number(pad.axes && pad.axes[0]) || 0, ay = Number(pad.axes && pad.axes[1]) || 0;
    if (Math.max(Math.abs(ax), Math.abs(ay)) < 0.55) return null;
    if (Math.abs(ax) >= Math.abs(ay)) return ax < 0 ? { code: 'pad-left', dx: -1, dy: 0 } : { code: 'pad-right', dx: 1, dy: 0 };
    return ay < 0 ? { code: 'pad-up', dx: 0, dy: -1 } : { code: 'pad-down', dx: 0, dy: 1 };
  }
  CrawlScene.prototype.consumeKeys = function () {
    if (this.state.mode !== 'play' || kit.paused) return;
    var map = { ArrowUp: [0, -1], KeyW: [0, -1], KeyK: [0, -1], ArrowRight: [1, 0], KeyD: [1, 0], KeyL: [1, 0], ArrowDown: [0, 1], KeyS: [0, 1], KeyJ: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], KeyH: [-1, 0], KeyQ: [-1, -1], KeyE: [1, -1], KeyZ: [-1, 1], KeyC: [1, 1] };
    var chosen = null, code;
    for (code in map) if (kit.input.keyDown(code)) { chosen = { code: code, dx: map[code][0], dy: map[code][1] }; break; }
    var gamepad = readGamepadDirection();
    if (!chosen && gamepad) chosen = gamepad;
    if (gamepad && gamepad.code !== this.lastGamepadCode) this.lastGamepadCode = gamepad.code;
    if (!gamepad) this.lastGamepadCode = null;
    var acted = false;
    if (chosen && !this.keyLatch.move) { moveAction(this.state, chosen.dx, chosen.dy); acted = true; }
    this.keyLatch.move = !!chosen;
    var wait = kit.input.keyDown('Space') || kit.input.keyDown('Period');
    if (!acted && wait && !this.keyLatch.wait) { moveAction(this.state, 0, 0); acted = true; }
    if (!wait) this.keyLatch.wait = false; else this.keyLatch.wait = true;
    var mute = kit.input.keyDown('KeyM'); if (mute && !this.keyLatch.mute) { kit.audio.setMute(!kit.audio.prefs.mute); this.keyLatch.mute = true; } if (!mute) this.keyLatch.mute = false;
    var restart = kit.input.keyDown('KeyR'); if (restart && !this.keyLatch.restart) { kit.restart(); this.keyLatch.restart = true; } if (!restart) this.keyLatch.restart = false;
    if (!acted) for (var i = 1; i <= 6; i++) { var key = 'Digit' + i, pressed = kit.input.keyDown(key); if (pressed && !this.keyLatch[key]) { useItem(this.state, i - 1); acted = true; } if (!pressed) this.keyLatch[key] = false; }
  };
  CrawlScene.prototype.update = function (time, delta) {
    if (!this.state) return;
    var juiceFrame = kit.juice.frame();
    if (this.cameras && this.cameras.main) this.cameras.main.setScroll(juiceFrame.dx, juiceFrame.dy);
    var probe = readProbe();
    if (probe.floor !== this.lastProbe.floor && probe.floor != null) { this.lastProbe = probe; this.hardRestart(probe.floor); return; }
    if (probe.event && probe.event !== this.lastProbe.event) { this.lastProbe.event = probe.event; this.applyForceEvent(probe.event); }
    if (kit.paused || this.simPaused) return;
    if (juiceFrame.frozen) return;
    this.consumeKeys();
    var dt = Math.min(Math.max(delta || 0, 0), 50) / 1000;
    this.updateVisuals(dt);
    if (this.state.dirty) { this.drawBoard(); this.renderWorld(); this.renderHud(); this.state.dirty = false; }
    else { this.renderWorld(); this.renderHud(); }
  };

  var SceneClass = CrawlScene;
  Game.phaser = new Phaser.Game({ type: Phaser.AUTO, parent: document.body, backgroundColor: '#070b12', pixelArt: true,
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%', autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: false, roundPixels: true, powerPreference: 'high-performance' },
    scene: [SceneClass], fps: { min: 30, target: 60, forceSetTimeOut: false }
  });
})(window);
