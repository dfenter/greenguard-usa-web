/* Corridor Crawl - Phaser view over a deterministic, turn-resolved roguelike.
 * Round 2 polish: 12 field creatures with individual AI branches plus two boss
 * actors, a torch economy, coin shrines, class kits, and a shard meta track.
 */
(function (root) {
  'use strict';
  var Phaser = root.Phaser, CC = root.CC, T = CC.TILE, DIRS = CC.DIRS, ALL_DIRS = CC.ALL_DIRS;
  var MON = CC.MON, POTIONS = CC.POTIONS, SCROLLS = CC.SCROLLS, TOOLS = CC.TOOLS;
  var CLASSES = CC.CLASSES, CLASS_KEYS = CC.CLASS_KEYS, TRACK = CC.TRACK;
  var AUDIO = CC.AUDIO, MUSIC = CC.MUSIC, MAX_DEPTH = CC.MAX_DEPTH;
  var MAX_MONSTERS = 30, SUMMON_CAP = 22, MAX_ITEMS = 30, MAX_GOLD = 24, MAX_PARTICLES = 120, MAX_RINGS = 6;
  var TAU = Math.PI * 2;
  var Game = { scene: null, phaser: null };
  var oldProbe = root.__cc || {};
  root.__cc = {
    state: oldProbe.state || { mode: 'boot', depth: 0, hp: 0, hunger: 0, score: 0 },
    forceFloor: oldProbe.forceFloor == null ? null : oldProbe.forceFloor,
    forceEvent: oldProbe.forceEvent == null ? null : oldProbe.forceEvent
  };

  var FLOOR_MEDALS = { gold: 5, silver: 3, bronze: 1 };
  var LEGACY_KITS = { basic: 'wayfarer', scavenger: 'scavenger', ward: 'ward', echo: 'echo' };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  var HEX_CACHE = Object.create(null);
  function hex(n) {
    n = n >>> 0;
    var c = HEX_CACHE[n];
    if (c === undefined) { c = '#' + ('000000' + n.toString(16)).slice(-6); HEX_CACHE[n] = c; }
    return c;
  }
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
    return { floor: readForceValue(floor, 1, MAX_DEPTH), event: event == null ? null : String(event) };
  }

  // --------------------------------------------------------------- profile
  function validCounter(n, min, max) {
    return typeof n === 'number' && isFinite(n) && Math.floor(n) === n && n >= min && n <= max;
  }
  function validMedals(o, maxDepth) {
    if (!o.medals || typeof o.medals !== 'object' || Array.isArray(o.medals)) return false;
    for (var depth in o.medals) {
      if (!Object.prototype.hasOwnProperty.call(o.medals, depth)) continue;
      var n = Number(depth);
      if (!isFinite(n) || Math.floor(n) !== n || n < 1 || n > maxDepth) return false;
      var tier = o.medals[depth];
      if (tier !== 'gold' && tier !== 'silver' && tier !== 'bronze') return false;
    }
    return true;
  }
  function validKitList(o, registry) {
    if (!Array.isArray(o.unlockedKits) || !o.unlockedKits.length) return null;
    var seen = Object.create(null);
    for (var i = 0; i < o.unlockedKits.length; i++) {
      var k = o.unlockedKits[i];
      if (!Object.prototype.hasOwnProperty.call(registry, k) || seen[k]) return null;
      seen[k] = true;
    }
    return seen;
  }
  function validProfileV1(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o) || o.version !== 1) return false;
    var seen = validKitList(o, LEGACY_KITS);
    if (!seen || !seen.basic) return false;
    if (!Object.prototype.hasOwnProperty.call(LEGACY_KITS, o.selectedKit) || !seen[o.selectedKit]) return false;
    if (typeof o.tutorialDone !== 'boolean') return false;
    if (!validCounter(o.best, 0, 1000000000) || !validCounter(o.maxDepth, 1, 8) ||
        !validCounter(o.runs, 0, 1000000) || !validCounter(o.escapes, 0, 1000000)) return false;
    return validMedals(o, 8);
  }
  function validProfileV2(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o) || o.version !== 2) return false;
    var seen = validKitList(o, CLASSES);
    if (!seen || !seen.wayfarer) return false;
    if (!Object.prototype.hasOwnProperty.call(CLASSES, o.selectedKit) || !seen[o.selectedKit]) return false;
    if (typeof o.tutorialDone !== 'boolean') return false;
    if (!validCounter(o.best, 0, 1000000000) || !validCounter(o.maxDepth, 1, MAX_DEPTH) ||
        !validCounter(o.runs, 0, 1000000) || !validCounter(o.escapes, 0, 1000000) ||
        !validCounter(o.shards, 0, 1000000000) || !validCounter(o.kills, 0, 1000000000)) return false;
    if (!o.bosses || typeof o.bosses !== 'object' || Array.isArray(o.bosses)) return false;
    for (var d in o.bosses) {
      if (!Object.prototype.hasOwnProperty.call(o.bosses, d)) continue;
      if (!/^(5|10)$/.test(d) || o.bosses[d] !== true) return false;
    }
    return validMedals(o, MAX_DEPTH);
  }
  // GGKit hands the stored blob to this validator before the game ever sees it,
  // so it must accept BOTH shipped shapes. Anything else degrades to a fresh
  // profile rather than throwing on a player who already has a run history.
  function validStoredProfile(o) { return validProfileV2(o) || validProfileV1(o); }
  function defaultProfile() {
    return { version: 2, best: 0, maxDepth: 1, runs: 0, escapes: 0, tutorialDone: false,
      unlockedKits: ['wayfarer'], selectedKit: 'wayfarer', medals: {}, shards: 0, bosses: {}, kills: 0 };
  }
  function migrateProfile(o) {
    if (validProfileV2(o)) return o;
    if (!validProfileV1(o)) return defaultProfile();
    // v1 -> v2: kit ids were renamed, the descent grew from 8 floors to 10, and
    // three new counters (shards, bosses, kills) default to a clean slate. A
    // veteran keeps best score, medals, unlocks, and tutorial state.
    var next = defaultProfile();
    next.best = o.best; next.maxDepth = clamp(o.maxDepth, 1, MAX_DEPTH);
    next.runs = o.runs; next.escapes = o.escapes; next.tutorialDone = o.tutorialDone;
    next.medals = {};
    for (var d in o.medals) if (Object.prototype.hasOwnProperty.call(o.medals, d)) next.medals[d] = o.medals[d];
    next.unlockedKits = [];
    for (var i = 0; i < o.unlockedKits.length; i++) {
      var mapped = LEGACY_KITS[o.unlockedKits[i]];
      if (mapped && next.unlockedKits.indexOf(mapped) < 0) next.unlockedKits.push(mapped);
    }
    if (next.unlockedKits.indexOf('wayfarer') < 0) next.unlockedKits.unshift('wayfarer');
    next.selectedKit = LEGACY_KITS[o.selectedKit] || 'wayfarer';
    if (next.unlockedKits.indexOf(next.selectedKit) < 0) next.selectedKit = 'wayfarer';
    // Returning players are credited for the ground they already covered so the
    // meta track does not read as empty after the update.
    next.shards = clamp(o.maxDepth * 3 + o.escapes * 20, 0, 1000000000);
    return next;
  }

  var kit;
  function makeKit() {
    kit = root.GGKit.create({
      slug: 'corridor-crawl', orientation: 'portrait', validateSave: validStoredProfile,
      onPause: function () { if (Game.scene) { Game.scene.simPaused = true; Game.scene.clearTouches(); } },
      onResume: function () { if (Game.scene) Game.scene.simPaused = false; },
      onRestart: function () { if (Game.scene) Game.scene.hardRestart(); }
    });
  }
  makeKit();
  kit.audio.register(AUDIO); kit.audio.register(MUSIC);

  // Pointer claims live on a WINDOW listener registered AFTER GGKit init:
  // a canvas-level pointerdown is overwritten by the kit and touch dies.
  root.addEventListener('pointerdown', function (e) {
    if (kit.paused) return;
    var p = kit.input.pointers.get(e.pointerId);
    if (!p) {
      p = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, downAt: performance.now(), zone: null };
      kit.input.pointers.set(e.pointerId, p);
    }
    p.zone = 'corridor-crawl';
  }, { passive: true });

  var profile = migrateProfile(kit.save.get(null));
  function saveProfile() { kit.save.set(profile); }

  // Music is registered up front but never fetched until the player has
  // actually touched the screen, so the first paint is not waiting on beds.
  var musicReady = false, pendingMusic = null;
  function playMusic(name) {
    if (!MUSIC[name]) return;
    pendingMusic = name;
    if (musicReady) kit.audio.music(name, 650);
  }
  function unlockMusic() {
    if (musicReady) return;
    musicReady = true;
    if (pendingMusic) kit.audio.music(pendingMusic, 650);
  }
  root.addEventListener('pointerdown', unlockMusic, { once: true, passive: true });
  root.addEventListener('keydown', unlockMusic, { once: true });

  function perkActive(id) {
    for (var i = 0; i < TRACK.length; i++) if (TRACK[i].id === id) return profile.shards >= TRACK[i].at;
    return false;
  }
  function classUnlocked(key) {
    var spec = CLASSES[key];
    if (!spec) return false;
    if (!spec.unlock) return true;
    if (spec.unlock === 'depth3') return profile.maxDepth >= 3;
    if (spec.unlock === 'depth6') return profile.maxDepth >= 6;
    if (spec.unlock === 'escape') return profile.escapes >= 1;
    if (spec.unlock === 'shards40') return profile.shards >= 40;
    return false;
  }
  function refreshUnlocks() {
    for (var i = 0; i < CLASS_KEYS.length; i++) {
      var k = CLASS_KEYS[i];
      if (classUnlocked(k) && profile.unlockedKits.indexOf(k) < 0) profile.unlockedKits.push(k);
    }
    if (!CLASSES[profile.selectedKit] || profile.unlockedKits.indexOf(profile.selectedKit) < 0) {
      profile.selectedKit = profile.unlockedKits[0] || 'wayfarer';
    }
    saveProfile();
  }
  function nextTrackTier() {
    for (var i = 0; i < TRACK.length; i++) if (profile.shards < TRACK[i].at) return TRACK[i];
    return null;
  }
  refreshUnlocks();

  // ------------------------------------------------------------------ items
  function itemSpec(key) { return POTIONS[key] || SCROLLS[key] || TOOLS[key] || null; }
  function itemKind(key) {
    if (TOOLS[key]) return key === 'crown' ? 'crown' : key === 'torch' ? 'tool' : 'food';
    if (POTIONS[key]) return 'potion';
    if (SCROLLS[key]) return 'scroll';
    return 'tool';
  }
  function itemName(s, key) {
    var kind = itemKind(key), spec = itemSpec(key);
    if (!spec) return 'Oddment';
    if (kind === 'potion') return s.identified[key] ? 'Potion of ' + spec.name : (s.appearance.potion[key] || 'Unknown') + ' Potion';
    if (kind === 'scroll') return s.identified[key] ? 'Scroll of ' + spec.name : 'Scroll "' + (s.appearance.scroll[key] || '???') + '"';
    return spec.name;
  }
  function itemShort(s, key) {
    var kind = itemKind(key), spec = itemSpec(key);
    if (!spec) return 'UNKNOWN';
    if (kind === 'potion' || kind === 'scroll') return s.identified[key] ? spec.tag : 'USE TO IDENTIFY';
    return spec.tag;
  }
  function itemColor(s, key) {
    var spec = itemSpec(key);
    if (!spec) return 0xd8e7ef;
    if ((itemKind(key) === 'potion' || itemKind(key) === 'scroll') && !s.identified[key]) return 0x8496a6;
    return spec.col;
  }
  function itemIconKey(s, key) {
    var kind = itemKind(key);
    if ((kind === 'potion' || kind === 'scroll') && !s.identified[key]) return 'cc_icon_unknown_' + kind;
    return itemSpec(key) ? 'cc_icon_' + key : 'cc_icon_unknown_potion';
  }
  function unknownKeys(s) {
    var out = [], k;
    for (k in POTIONS) if (!s.identified[k]) out.push(k);
    for (k in SCROLLS) if (!s.identified[k]) out.push(k);
    return out;
  }
  function randomItem(s) {
    var r = s.rng.f();
    if (r < 0.16) return 'ration';
    if (r < 0.28) return 'torch';
    if (r < 0.66) { var pk = Object.keys(POTIONS); return pk[s.rng.int(0, pk.length - 1)]; }
    var sk = Object.keys(SCROLLS);
    return sk[s.rng.int(0, sk.length - 1)];
  }

  // ------------------------------------------------------------------ state
  function makeState(scene, forcedDepth) {
    var seed = (Date.now() ^ ((Math.random() * 0xffffffff) >>> 0)) >>> 0;
    var querySeed = null;
    try { querySeed = new URLSearchParams(root.location.search).get('seed'); } catch (e) {}
    if (querySeed != null && querySeed !== '') seed = CC.hash(0x4c4f4f50, String(querySeed));
    var classKey = CLASSES[profile.selectedKit] ? profile.selectedKit : 'wayfarer';
    var spec = CLASSES[classKey];
    var s = {
      mode: 'play', seed: seed, rng: new CC.RNG(seed), depth: forcedDepth || 1, maxDepth: forcedDepth || 1,
      ascending: false, hasCrown: false, turn: 0, floorTurn: 0, kills: 0, gold: 0, score: 0,
      hp: spec.hp, maxHp: spec.hp, hunger: spec.hunger, hungerMax: spec.hunger,
      torch: spec.torch, torchMax: spec.torch, torchWarned: false,
      classKey: classKey, passive: spec.passive, slots: spec.slots + (perkActive('satchel') ? 1 : 0),
      atk: spec.atk.slice(), player: { x: 0, y: 0, ax: 0, ay: 0 },
      level: null, monsters: [], items: [], goldPiles: [], monsterViews: {}, floorCleared: false,
      identified: {}, appearance: { potion: {}, scroll: {} }, inventory: [],
      buffs: { power: 0, ward: 0, haste: 0 }, status: { poison: 0 },
      shrine: null, boss: null, bossKills: 0, runShards: 0,
      log: [], medals: {}, milestones: {}, banner: null, bannerQueue: [], inspect: null,
      guide: { step: profile.tutorialDone ? 4 : 0, t: profile.tutorialDone ? 0 : 3.5, max: 3.5 },
      selectedKit: classKey, deathBy: '', finalScore: 0, dirty: true, lastAction: '',
      playerAnim: { state: 'idle', t: 0, max: 1, dx: 0, dy: 0 }
    };
    var shades = s.rng.shuffle(CC.POTION_SHADES.slice()), glyphs = s.rng.shuffle(CC.SCROLL_GLYPHS.slice()), i;
    var pk = Object.keys(POTIONS), sk = Object.keys(SCROLLS);
    for (i = 0; i < pk.length; i++) s.appearance.potion[pk[i]] = shades[i % shades.length];
    for (i = 0; i < sk.length; i++) s.appearance.scroll[sk[i]] = glyphs[i % glyphs.length];
    // Starting kit: classes differ by what they carry, not only by stat lines.
    for (i = 0; i < spec.start.length; i++) {
      var entry = spec.start[i], key = entry[0], n = entry[1];
      for (var c = 0; c < n; c++) {
        if (key === '?potion') addItem(s, pk[s.rng.int(0, pk.length - 1)]);
        else addItem(s, key);
      }
    }
    if (perkActive('kindling')) addItem(s, 'torch');
    if (perkActive('warded')) addItem(s, 'ward');
    if (perkActive('scholar')) {
      var carried = [];
      for (i = 0; i < s.inventory.length; i++) {
        var ik = itemKind(s.inventory[i].key);
        if ((ik === 'potion' || ik === 'scroll') && !s.identified[s.inventory[i].key]) carried.push(s.inventory[i].key);
      }
      if (carried.length) s.identified[carried[s.rng.int(0, carried.length - 1)]] = true;
    }
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
  function view(s, m) {
    return s.monsterViews[m.id] || (s.monsterViews[m.id] = { state: 'idle', t: 0, flash: 0, bob: Math.random() * 6, ax: m.x, ay: m.y, lunge: 0, ldx: 0, ldy: 0 });
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
    if (s.ascending) { weights.brute = (weights.brute || 0) + 2; weights.thief = (weights.thief || 0) + 1; weights.wraith = (weights.wraith || 0) + 2; }
    return weightedPick(s.rng, weights);
  }
  function livingCount(s) {
    var n = 0;
    for (var i = 0; i < s.monsters.length; i++) if (s.monsters[i].hp > 0) n++;
    return n;
  }
  function spawnMonster(s, key, x, y, hpOverride, elite) {
    if (s.monsters.length >= MAX_MONSTERS) return null;
    var base = MON[key] || MON.rat;
    var safeKey = MON[key] ? key : 'rat';
    var hp = hpOverride == null ? base.hp + Math.floor((s.depth - 1) * 1.5) + (s.ascending ? 3 : 0) : hpOverride;
    var m = { id: s.monsters.length + 1 + (s.turn * 31) + Math.floor(s.rng.f() * 997), key: safeKey, ai: base.ai, x: x, y: y,
      hp: hp, maxHp: hp, def: base.def + (s.depth > 5 ? 1 : 0) + (elite ? 1 : 0),
      dmg: [base.dmg[0] + Math.floor((s.depth - 1) / 3), base.dmg[1] + Math.floor((s.depth - 1) / 2)],
      xp: base.xp + (elite ? 4 : 0), elite: !!elite, boss: !!base.boss, heavy: !!base.boss || safeKey === 'brute' || safeKey === 'bulwark',
      fear: 0, stun: 0, dead: false, tick: 0, cd: 0, summonCd: 2, phase: 1,
      dormant: base.ai === 'ambush', facex: 0, facey: 1, chargeDx: 0, chargeDy: 0,
      aiState: 'patrol', intent: null, intentT: 0, patrolX: x, patrolY: y };
    s.monsters.push(m); view(s, m);
    return m;
  }
  function addItem(s, key) {
    if (!itemSpec(key)) return false;
    for (var i = 0; i < s.inventory.length; i++) if (s.inventory[i].key === key) { s.inventory[i].n++; return true; }
    if (s.inventory.length >= (s.slots || 6)) return false;
    s.inventory.push({ key: key, n: 1 }); return true;
  }
  function compactDead(s) {
    var alive = [];
    for (var i = 0; i < s.monsters.length; i++) {
      var m = s.monsters[i], v = s.monsterViews[m.id];
      if (m.hp > 0 || (v && v.t > 0)) alive.push(m);
      else if (v) delete s.monsterViews[m.id];
    }
    s.monsters = alive;
  }
  function sceneRef() { return Game.scene; }
  function sightRadius(s) {
    var frac = s.torchMax > 0 ? s.torch / s.torchMax : 0;
    var r = s.torch <= 0 ? 3 : 4 + Math.round(clamp(frac, 0, 1) * 4);
    if (s.passive === 'lantern') r += 1;
    return clamp(r, 3, 9);
  }
  function refreshFov(s) { s.level.computeFov(s.player.x, s.player.y, sightRadius(s)); }

  // ------------------------------------------------------------ floor build
  function shrineOffer(s, depth) {
    var roll = s.rng.f(), key;
    if (roll < 0.24) key = 'torch';
    else if (roll < 0.42) key = 'ration';
    else if (roll < 0.74) { var pk = Object.keys(POTIONS); key = pk[s.rng.int(0, pk.length - 1)]; }
    else { var sk = Object.keys(SCROLLS); key = sk[s.rng.int(0, sk.length - 1)]; }
    var price = 14 + depth * 4 + (SCROLLS[key] ? 6 : 0);
    if (s.passive === 'greed') price = Math.round(price * 0.75);
    if (perkActive('haggler')) price = Math.round(price * 0.8);
    return { key: key, price: Math.max(6, price), sold: false };
  }
  function startFloor(s, depth, arrivingAtDown) {
    s.depth = depth; s.floorTurn = 0; s.floorCleared = false;
    s.level = new CC.Level(depth, s.rng, s.ascending);
    s.monsters = []; s.items = []; s.goldPiles = []; s.monsterViews = {}; s.boss = null;
    s.player.x = arrivingAtDown ? s.level.downx : s.level.upx;
    s.player.y = arrivingAtDown ? s.level.downy : s.level.upy;
    s.player.ax = s.player.x; s.player.ay = s.player.y;
    s.shrine = null;
    if (s.level.shrine) {
      var offer = shrineOffer(s, depth);
      s.shrine = { x: s.level.shrine.x, y: s.level.shrine.y, key: offer.key, price: offer.price, sold: false };
    }
    var avoid = [{ x: s.player.x, y: s.player.y }];
    if (s.shrine) avoid.push({ x: s.shrine.x, y: s.shrine.y });
    // Reserve the first room's cardinal ring for a guaranteed training read.
    if (depth === 1 && !s.ascending) {
      for (var ring = 0; ring < DIRS.length; ring++) {
        var rx = s.player.x + DIRS[ring][0], ry = s.player.y + DIRS[ring][1];
        if (s.level.walkable(rx, ry)) avoid.push({ x: rx, y: ry });
      }
    }
    if (s.level.boss) buildBossFloor(s, avoid);
    else buildFieldFloor(s, depth, avoid);
    refreshFov(s);
    s.dirty = true;
    if (sceneRef()) {
      sceneRef().playBandAudio(s.level.boss ? 'boss' : s.level.band.key);
      sceneRef().beginFloorTransition();
      if (s.level.boss) sceneRef().bossIntro(s.level.bossKey);
    }
    checkFloorClear(s);
  }
  function buildFieldFloor(s, depth, avoid) {
    var i, count = 4 + Math.floor(depth * 0.9) + (s.ascending ? 3 : 0);
    for (i = 0; i < count && s.monsters.length < MAX_MONSTERS; i++) {
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
      specialSpawn('ooze', 0, 0, false); specialSpawn('rat', -1, 0, false); specialSpawn('swarm', 1, 0, false);
      s.items.push({ x: special.x, y: Math.max(0, special.y - 1), key: randomItem(s), picked: false });
    } else if (s.level.band.key === 'flooded') {
      specialSpawn('archer', 0, 0, true); specialSpawn('spitter', -1, 0, false);
      s.goldPiles.push({ x: special.x + 1, y: special.y, amount: 18 + depth * 3 });
    } else if (s.level.band.key === 'forge') {
      specialSpawn('brute', 0, 0, true); specialSpawn('bulwark', -1, 0, false);
      s.items.push({ x: special.x + 1, y: special.y, key: randomItem(s), picked: false });
    } else if (s.level.band.key === 'deeps') {
      specialSpawn('warden', 0, 0, true); specialSpawn('wraith', -1, 0, false); specialSpawn('wraith', 1, 0, false);
      s.goldPiles.push({ x: special.x, y: Math.max(0, special.y - 1), amount: 22 + depth * 3 });
    } else {
      specialSpawn('brute', -2, 0, true); specialSpawn('bulwark', 2, 0, true);
      specialSpawn('warden', 0, -2, true); specialSpawn('thief', 0, 2, false);
    }
    // A mimic replaces a real pickup: the loot economy has to be able to bite.
    var itemCount = depth <= 2 ? 6 : depth <= 4 ? 4 : 3;
    for (i = 0; i < itemCount; i++) {
      var ip = placeFree(s, avoid); avoid.push(ip);
      if (depth >= 3 && s.rng.chance(0.14)) spawnMonster(s, 'mimic', ip.x, ip.y, null, false);
      else s.items.push({ x: ip.x, y: ip.y, key: randomItem(s), picked: false });
    }
    var goldCount = depth <= 2 ? 8 : depth <= 4 ? 5 : 4;
    for (i = 0; i < goldCount; i++) {
      var gp = placeFree(s, avoid); avoid.push(gp);
      var amount = s.rng.int(5, 12) + depth * 2;
      if (s.passive === 'greed') amount = Math.round(amount * 1.35);
      s.goldPiles.push({ x: gp.x, y: gp.y, amount: amount });
    }
  }
  function buildBossFloor(s, avoid) {
    var special = s.level.special, key = s.level.bossKey;
    var base = MON[key] || MON.slagmaw;
    var hp = base.hp + s.depth * 4;
    var boss = spawnMonster(s, key, special.x, special.y - 1, hp, true);
    if (boss) { s.boss = boss; boss.def = base.def; boss.dmg = [base.dmg[0], base.dmg[1]]; }
    var minions = key === 'sovereign' ? ['bulwark', 'warden', 'wraith', 'archer'] : ['swarm', 'swarm', 'archer', 'bulwark'];
    var offsets = [[-4, 2], [4, 2], [-3, -3], [3, -3]];
    for (var i = 0; i < minions.length; i++) {
      var x = special.x + offsets[i][0], y = special.y + offsets[i][1];
      if (s.level.walkable(x, y) && !occupied(s, x, y)) spawnMonster(s, minions[i], x, y, null, false);
    }
    for (var g = 0; g < 3; g++) {
      var gp = placeFree(s, avoid); avoid.push(gp);
      s.goldPiles.push({ x: gp.x, y: gp.y, amount: 20 + s.depth * 3 });
    }
    s.items.push({ x: special.x - 2, y: special.y + 3, key: 'ration', picked: false });
    s.items.push({ x: special.x + 2, y: special.y + 3, key: 'torch', picked: false });
  }
  function revealAll(s) {
    for (var i = 0; i < s.level.seen.length; i++) s.level.seen[i] = 1;
    for (var y = 0; y < s.level.h; y++) for (var x = 0; x < s.level.w; x++) {
      var idx = s.level.idx(x, y);
      s.level.visible[idx] = 1;
      if (s.level.light[idx] < 0.42) s.level.light[idx] = 0.42;
    }
    s.dirty = true;
  }

  // ------------------------------------------------------------- collection
  function collect(s) {
    for (var i = s.goldPiles.length - 1; i >= 0; i--) {
      var g = s.goldPiles[i];
      if (g.x === s.player.x && g.y === s.player.y) {
        s.gold += g.amount; s.score += g.amount;
        s.goldPiles.splice(i, 1);
        if (sceneRef()) { sceneRef().burstAt(s.player.x, s.player.y, 0xffd76d, 10); sceneRef().pickupFx('+' + g.amount + ' GOLD', 0xffd76d); }
        CC.audio(kit, 'pickup');
      }
    }
    for (i = s.items.length - 1; i >= 0; i--) {
      var item = s.items[i]; if (item.x !== s.player.x || item.y !== s.player.y) continue;
      if (item.key === 'crown') {
        s.hasCrown = true; s.ascending = true; s.items.splice(i, 1); s.level.set(s.player.x, s.player.y, T.UP);
        showBanner(s, 'CROWN TAKEN', 'CLIMB OUT', '#ffd76d');
        if (sceneRef()) sceneRef().crownCeremony(s.player.x, s.player.y);
        CC.audio(kit, 'crown');
        continue;
      }
      if (addItem(s, item.key)) {
        s.items.splice(i, 1);
        if (sceneRef()) {
          sceneRef().burstAt(s.player.x, s.player.y, itemColor(s, item.key), 12);
          sceneRef().motesAt(s.player.x, s.player.y, itemColor(s, item.key), 5);
          sceneRef().pickupFx('PACK · ' + itemName(s, item.key).toUpperCase(), itemColor(s, item.key));
        }
        CC.audio(kit, 'pickup');
      } else log(s, 'PACK FULL', '#ff9a78');
    }
  }
  function setPlayerAnim(s, state, duration, dx, dy) {
    s.playerAnim.state = state;
    s.playerAnim.t = duration || 0;
    s.playerAnim.max = duration || 1;
    s.playerAnim.dx = dx || 0; s.playerAnim.dy = dy || 0;
    s.dirty = true;
  }

  // ------------------------------------------------------------- combat sim
  function canMonsterStep(s, m, dx, dy) {
    if (!dx && !dy) return false;
    var nx = m.x + dx, ny = m.y + dy;
    if (m.ai === 'phase') {
      if (nx < 1 || ny < 1 || nx >= CC.MAPW - 1 || ny >= CC.MAPH - 1) return false;
      return !activeMonster(s, nx, ny) && !(s.player.x === nx && s.player.y === ny);
    }
    if (!s.level.walkable(nx, ny) || activeMonster(s, nx, ny) || (s.player.x === nx && s.player.y === ny)) return false;
    if (dx && dy && (!s.level.walkable(m.x + dx, m.y) || !s.level.walkable(m.x, m.y + dy))) return false;
    return true;
  }
  function moveMonster(s, m, dx, dy) {
    if (!canMonsterStep(s, m, dx, dy)) return false;
    m.x += dx; m.y += dy;
    return true;
  }
  function knockbackMonster(s, m) {
    if (!m || m.hp <= 0 || m.heavy) return;
    var dx = CC.sign(m.x - s.player.x), dy = CC.sign(m.y - s.player.y);
    if (canMonsterStep(s, m, dx, dy)) moveMonster(s, m, dx, dy);
  }
  function pushPlayer(s, dx, dy) {
    var nx = s.player.x + dx, ny = s.player.y + dy;
    if (!s.level.walkable(nx, ny) || activeMonster(s, nx, ny)) return false;
    s.player.x = nx; s.player.y = ny;
    collect(s);
    return true;
  }
  function hitMonster(s, m, damage, silent) {
    if (!m || m.hp <= 0) return;
    if (m.dormant) m.dormant = false;
    var incoming = damage;
    // A Slate Bulwark eats damage from the side it is facing: flank it or grind.
    if (m.ai === 'guard') {
      var fromX = CC.sign(s.player.x - m.x), fromY = CC.sign(s.player.y - m.y);
      if (fromX === m.facex && fromY === m.facey) incoming = Math.max(1, incoming - 4);
    }
    if (s.passive === 'echo' && m.hp === m.maxHp) incoming += 4;
    m.hp -= Math.max(1, incoming - (s.rng.int(0, m.def)));
    var v = view(s, m);
    v.state = m.hp <= 0 ? 'death' : 'hit'; v.t = m.hp <= 0 ? 0.42 : 0.16; v.flash = 0.16;
    if (m.hp > 0) knockbackMonster(s, m);
    if (sceneRef() && !silent) {
      sceneRef().burstAt(m.x, m.y, MON[m.key] ? MON[m.key].col : 0xffffff, m.hp <= 0 ? 20 : 8);
      sceneRef().enemyFx(m.key, m.x, m.y, m.hp <= 0);
      sceneRef().hitJolt(m.boss ? 4 : 2);
    }
    CC.audio(kit, 'hit', m.boss ? { rate: 0.72, volume: 1 } : undefined);
    if (m.key === 'ooze' && m.hp > 1 && !m.split) {
      m.split = true;
      var free = [];
      for (var d = 0; d < ALL_DIRS.length; d++) {
        var nx = m.x + ALL_DIRS[d][0], ny = m.y + ALL_DIRS[d][1];
        if (s.level.walkable(nx, ny) && !occupied(s, nx, ny)) free.push({ x: nx, y: ny });
      }
      if (free.length) { var p = s.rng.pick(free); spawnMonster(s, 'ooze', p.x, p.y, Math.max(2, Math.floor(m.hp / 2)), false); log(s, 'OOZE SPLIT', '#71e099'); }
    }
    if (m.hp <= 0) onMonsterDeath(s, m);
  }
  function onMonsterDeath(s, m) {
    s.kills++; s.score += m.boss ? 40 : 3; s.gold += m.elite ? 3 : 0;
    profile.kills = clamp((profile.kills || 0) + 1, 0, 1000000000);
    s.level.seen[s.level.idx(m.x, m.y)] = 1;
    if (m.boss) {
      s.bossKills++;
      s.runShards += 12;
      profile.bosses[String(s.depth)] = true;
      saveProfile();
      showBanner(s, (MON[m.key] ? MON[m.key].name : 'BOSS') + ' FELLED', '+12 shards', '#ffd76d');
      CC.audio(kit, 'shard');
      if (sceneRef()) sceneRef().bossDefeat(m.x, m.y, MON[m.key] ? MON[m.key].col : 0xffd76d);
      // The Crown only appears once its keeper is down.
      if (m.key === 'sovereign' && !s.hasCrown) s.items.push({ x: s.level.special.x, y: s.level.special.y, key: 'crown', picked: false });
      else s.items.push({ x: m.x, y: m.y, key: randomItem(s), picked: false });
      s.goldPiles.push({ x: m.x, y: Math.min(CC.MAPH - 1, m.y + 1), amount: 40 + s.depth * 5 });
    } else if (sceneRef()) sceneRef().burstAt(m.x, m.y, 0xffd76d, 8);
  }
  function hurtPlayer(s, amount, source) {
    var damage = Math.max(1, amount - (s.buffs.ward > 0 ? 3 : 0) - (s.passive === 'bulwark' ? 1 : 0));
    if (s.buffs.ward > 0) s.buffs.ward--;
    s.hp = Math.max(0, s.hp - damage);
    setPlayerAnim(s, 'hurt', 0.22);
    if (sceneRef()) { sceneRef().burstAt(s.player.x, s.player.y, 0xff716a, 12); sceneRef().hitJolt(3); }
    CC.audio(kit, 'hurt');
    if (s.hp <= 0) die(s, source);
  }
  function killMonster(s, m) {
    if (!m || m.hp <= 0) return;
    m.hp = 0;
    var v = view(s, m);
    v.state = 'death'; v.t = 0.42;
    onMonsterDeath(s, m);
  }
  function poisonPlayer(s, turns) {
    s.status.poison = Math.min(12, s.status.poison + turns);
    log(s, 'POISONED ' + s.status.poison, '#9fd45c');
  }
  function allyCount(s, m, radius) {
    var n = 0;
    for (var i = 0; i < s.monsters.length; i++) {
      var o = s.monsters[i];
      if (o !== m && o.hp > 0 && !o.dormant && CC.dist(o.x, o.y, m.x, m.y) <= radius) n++;
    }
    return n;
  }
  function stepToward(s, m, dx, dy) {
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (moveMonster(s, m, CC.sign(dx), 0)) return true;
      return moveMonster(s, m, 0, CC.sign(dy));
    }
    if (moveMonster(s, m, 0, CC.sign(dy))) return true;
    return moveMonster(s, m, CC.sign(dx), 0);
  }
  function wanderMonster(s, m) {
    var d = DIRS[s.rng.int(0, DIRS.length - 1)];
    m.aiState = 'patrol'; m.intent = 'patrol';
    moveMonster(s, m, d[0], d[1]);
  }
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
  function strikePlayer(s, m, bonus, source) {
    hurtPlayer(s, s.rng.int(m.dmg[0], m.dmg[1]) + (bonus || 0), source || (MON[m.key] ? MON[m.key].name : 'the dark'));
    var v = view(s, m);
    v.state = 'attack'; v.t = 0.24;
    v.lunge = 0.24; v.ldx = CC.sign(s.player.x - m.x); v.ldy = CC.sign(s.player.y - m.y);
    m.intent = null; m.aiState = 'attack';
  }
  function telegraph(s, m, kind) {
    m.intent = kind; m.aiState = 'telegraph';
    CC.audio(kit, 'telegraph', kind === 'slam' || kind === 'wave' ? { rate: 0.75 } : undefined);
    if (sceneRef()) sceneRef().motesAt(m.x, m.y, MON[m.key] ? MON[m.key].col : 0xffffff, 3);
  }

  // ------------------------------------------------------------ creature AI
  // One branch per creature role. Every branch either moves, telegraphs, or
  // resolves a telegraphed action, so an actor never gets a free double turn.
  function enemyAct(s, m) {
    if (m.hp <= 0) return;
    m.tick++;
    if (m.stun > 0) { m.stun--; m.intent = 'stun'; m.aiState = 'stun'; return; }
    if (m.fear > 0 && !m.boss) { fleeMonster(s, m, 1); m.fear--; m.intent = 'flee'; m.aiState = 'flee'; return; }
    var dx = s.player.x - m.x, dy = s.player.y - m.y;
    var d = Math.max(Math.abs(dx), Math.abs(dy));
    var canSee = s.level.los(m.x, m.y, s.player.x, s.player.y) && d <= 8;
    switch (m.ai) {
      case 'pack': return aiPack(s, m, dx, dy, d, canSee);
      case 'swarm': return aiSwarm(s, m, dx, dy, d, canSee);
      case 'split': return aiSplit(s, m, dx, dy, d, canSee);
      case 'volley': return aiVolley(s, m, dx, dy, d, canSee);
      case 'kite': return aiKite(s, m, dx, dy, d, canSee);
      case 'steal': return aiSteal(s, m, dx, dy, d, canSee);
      case 'sound': return aiSound(s, m, dx, dy, d);
      case 'ambush': return aiAmbush(s, m, d);
      case 'guard': return aiGuard(s, m, dx, dy, d, canSee);
      case 'charge': return aiCharge(s, m, dx, dy, d, canSee);
      case 'support': return aiSupport(s, m, dx, dy, d, canSee);
      case 'phase': return aiPhase(s, m, dx, dy, d);
      case 'boss_slag': return aiSlagmaw(s, m, dx, dy, d);
      case 'boss_echo': return aiSovereign(s, m, dx, dy, d);
      default: return aiBasic(s, m, dx, dy, d, canSee);
    }
  }
  function aiBasic(s, m, dx, dy, d, canSee) {
    if (d <= 1) {
      if (m.intent !== 'strike') return telegraph(s, m, 'strike');
      return strikePlayer(s, m, 0);
    }
    if (!canSee) { m.aiState = 'patrol'; m.intent = 'patrol'; if (s.rng.chance(0.45)) wanderMonster(s, m); return; }
    m.aiState = 'chase'; m.intent = 'chase';
    stepToward(s, m, dx, dy);
  }
  function aiPack(s, m, dx, dy, d, canSee) {
    var pack = allyCount(s, m, 2);
    // A lone rat at low health breaks and runs; a pack presses the attack.
    if (m.hp <= m.maxHp * 0.35 && pack === 0) { fleeMonster(s, m, 1); m.intent = 'flee'; return; }
    if (d <= 1) {
      if (m.intent !== 'strike') return telegraph(s, m, 'strike');
      return strikePlayer(s, m, pack >= 2 ? 2 : 0);
    }
    if (!canSee) { m.aiState = 'patrol'; m.intent = 'patrol'; if (s.rng.chance(0.5)) wanderMonster(s, m); return; }
    m.aiState = 'chase'; m.intent = 'chase';
    stepToward(s, m, dx, dy);
  }
  function aiSwarm(s, m, dx, dy, d, canSee) {
    // Two short steps a turn and no wind-up: swarms punish standing still.
    for (var step = 0; step < 2; step++) {
      dx = s.player.x - m.x; dy = s.player.y - m.y;
      d = Math.max(Math.abs(dx), Math.abs(dy));
      if (d <= 1) { m.aiState = 'attack'; return strikePlayer(s, m, 0); }
      if (!canSee && !s.rng.chance(0.4)) { wanderMonster(s, m); continue; }
      m.aiState = 'chase'; m.intent = 'chase';
      if (s.rng.chance(0.3)) wanderMonster(s, m); else stepToward(s, m, dx, dy);
    }
  }
  function aiSplit(s, m, dx, dy, d, canSee) {
    // Oozes are half-speed: they act on every other turn.
    if (m.tick % 2 === 0 && d > 1) { m.aiState = 'chase'; m.intent = 'chase'; return; }
    aiBasic(s, m, dx, dy, d, canSee);
  }
  function aiVolley(s, m, dx, dy, d, canSee) {
    if (d >= 2 && d <= 7 && canSee) {
      if (m.intent !== 'volley') return telegraph(s, m, 'volley');
      if (sceneRef()) sceneRef().arrowFx(m.x, m.y, s.player.x, s.player.y, MON.archer.col);
      return strikePlayer(s, m, 0, 'a quill volley');
    }
    aiBasic(s, m, dx, dy, d, canSee);
  }
  function aiKite(s, m, dx, dy, d, canSee) {
    if (d <= 1) { m.aiState = 'flee'; m.intent = 'flee'; fleeMonster(s, m, 1); return; }
    if (d <= 6 && canSee) {
      if (m.intent !== 'spit') return telegraph(s, m, 'spit');
      if (sceneRef()) sceneRef().arrowFx(m.x, m.y, s.player.x, s.player.y, MON.spitter.col);
      strikePlayer(s, m, 0, 'a bog spitter');
      if (s.mode === 'play') poisonPlayer(s, 3);
      return;
    }
    aiBasic(s, m, dx, dy, d, canSee);
  }
  function aiSteal(s, m, dx, dy, d, canSee) {
    if (d <= 1) {
      if (m.intent !== 'strike') return telegraph(s, m, 'strike');
      strikePlayer(s, m, 0);
      if (s.mode === 'play' && s.gold > 0 && s.rng.chance(0.65)) {
        var stolen = Math.min(s.gold, s.rng.int(3, 8));
        s.gold -= stolen; s.score = Math.max(0, s.score - stolen);
        log(s, '-' + stolen + ' GOLD STOLEN', '#72dfe0');
        m.fear = 2; fleeMonster(s, m, 2);
      }
      return;
    }
    aiBasic(s, m, dx, dy, d, canSee);
  }
  function aiSound(s, m, dx, dy, d) {
    // Stalkers hunt by sound, so their chase branch runs even behind stone.
    if (d > 1) {
      m.aiState = 'chase'; m.intent = 'chase';
      if (d <= 10) stepToward(s, m, dx, dy); else wanderMonster(s, m);
      return;
    }
    if (m.intent !== 'strike') return telegraph(s, m, 'strike');
    strikePlayer(s, m, 0);
  }
  function aiAmbush(s, m, d) {
    if (m.dormant) {
      if (d > 1) { m.intent = null; m.aiState = 'dormant'; return; }
      m.dormant = false;
      m.aiState = 'attack';
      log(s, 'MIMIC!', '#ffb06a');
      if (sceneRef()) sceneRef().burstAt(m.x, m.y, MON.mimic.col, 16);
      return strikePlayer(s, m, 3, 'a chest mimic');
    }
    aiBasic(s, m, s.player.x - m.x, s.player.y - m.y, d, true);
  }
  function aiGuard(s, m, dx, dy, d, canSee) {
    m.facex = CC.sign(dx); m.facey = CC.sign(dy);
    if (m.tick % 2 === 0 && d > 1) { m.aiState = 'chase'; m.intent = 'guard'; return; }
    if (d <= 1) {
      if (m.intent !== 'strike') return telegraph(s, m, 'strike');
      return strikePlayer(s, m, 0);
    }
    if (!canSee) { m.aiState = 'patrol'; m.intent = 'guard'; return; }
    m.aiState = 'chase'; m.intent = 'chase';
    stepToward(s, m, dx, dy);
  }
  function aiCharge(s, m, dx, dy, d, canSee) {
    if (m.intent === 'charge') {
      // Resolve the wind-up: up to three tiles down the telegraphed line.
      var moved = 0;
      for (var i = 0; i < 3; i++) {
        var nx = m.x + m.chargeDx, ny = m.y + m.chargeDy;
        if (s.player.x === nx && s.player.y === ny) break;
        if (!moveMonster(s, m, m.chargeDx, m.chargeDy)) break;
        moved++;
      }
      m.intent = null; m.aiState = 'attack';
      if (CC.dist(m.x, m.y, s.player.x, s.player.y) <= 1) {
        strikePlayer(s, m, 2, 'a rubble brute charge');
        if (s.mode === 'play') pushPlayer(s, m.chargeDx, m.chargeDy);
        if (sceneRef()) sceneRef().hitJolt(4);
      } else if (moved && sceneRef()) sceneRef().emitDust(m.x, m.y, MON.brute.col, 6);
      return;
    }
    var aligned = (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy));
    if (canSee && aligned && d >= 2 && d <= 4) {
      m.chargeDx = CC.sign(dx); m.chargeDy = CC.sign(dy);
      return telegraph(s, m, 'charge');
    }
    aiBasic(s, m, dx, dy, d, canSee);
  }
  function aiSupport(s, m, dx, dy, d, canSee) {
    // Wardens mend the wounded, then call reinforcements, then keep their range.
    var wounded = null;
    for (var i = 0; i < s.monsters.length; i++) {
      var o = s.monsters[i];
      if (o === m || o.hp <= 0 || o.hp >= o.maxHp) continue;
      if (CC.dist(o.x, o.y, m.x, m.y) > 4) continue;
      if (!wounded || o.hp / o.maxHp < wounded.hp / wounded.maxHp) wounded = o;
    }
    if (m.cd > 0) m.cd--;
    if (wounded && m.cd <= 0) {
      wounded.hp = Math.min(wounded.maxHp, wounded.hp + 5);
      m.cd = 3; m.intent = 'mend'; m.aiState = 'support';
      if (sceneRef()) sceneRef().motesAt(wounded.x, wounded.y, 0xffd88a, 6);
      return;
    }
    if (m.summonCd > 0) m.summonCd--;
    if (m.summonCd <= 0 && allyCount(s, m, 4) < 2 && canSee && livingCount(s) < SUMMON_CAP) {
      for (var dI = 0; dI < ALL_DIRS.length; dI++) {
        var sx = m.x + ALL_DIRS[dI][0], sy = m.y + ALL_DIRS[dI][1];
        if (s.level.walkable(sx, sy) && !occupied(s, sx, sy)) {
          spawnMonster(s, 'swarm', sx, sy, null, false);
          m.summonCd = 5; m.intent = 'summon'; m.aiState = 'support';
          if (sceneRef()) sceneRef().motesAt(sx, sy, 0xffd88a, 6);
          return;
        }
      }
    }
    if (d <= 2) { m.intent = 'flee'; m.aiState = 'flee'; fleeMonster(s, m, 1); return; }
    if (d > 5 && canSee) { m.aiState = 'chase'; m.intent = 'chase'; stepToward(s, m, dx, dy); return; }
    m.intent = 'guard'; m.aiState = 'patrol';
  }
  function aiPhase(s, m, dx, dy, d) {
    // Wraiths ignore walls and line of sight entirely.
    if (d <= 1) {
      if (m.intent !== 'strike') return telegraph(s, m, 'strike');
      strikePlayer(s, m, 0);
      if (s.mode === 'play') {
        s.hunger = Math.max(0, s.hunger - 8);
        log(s, 'HUNGER DRAINED', '#7f8fe0');
      }
      return;
    }
    m.aiState = 'chase'; m.intent = 'chase';
    if (!stepToward(s, m, dx, dy)) wanderMonster(s, m);
  }
  function bossPhase(m) { return m.hp <= m.maxHp * 0.32 ? 3 : m.hp <= m.maxHp * 0.66 ? 2 : 1; }
  function ringDamage(s, m, radius, amount, source) {
    if (CC.dist(m.x, m.y, s.player.x, s.player.y) <= radius) hurtPlayer(s, amount, source);
  }
  function aiSlagmaw(s, m, dx, dy, d) {
    m.phase = bossPhase(m);
    if (m.intent === 'slam') {
      m.intent = null; m.aiState = 'attack';
      if (sceneRef()) sceneRef().shockRing(m.x, m.y, 0xff8a4a, 2.4);
      ringDamage(s, m, 2, s.rng.int(m.dmg[0], m.dmg[1]), 'a slag slam');
      return;
    }
    if (m.intent === 'line') {
      m.intent = null; m.aiState = 'attack';
      if (sceneRef()) sceneRef().arrowFx(m.x, m.y, s.player.x, s.player.y, 0xffb35d);
      if (Math.abs(s.player.x - m.x) <= 1 || Math.abs(s.player.y - m.y) <= 1 || d <= 6) {
        hurtPlayer(s, s.rng.int(m.dmg[0], m.dmg[1]) - 1, 'an ember lash');
      }
      return;
    }
    if (m.cd > 0) m.cd--;
    if (m.phase >= 3 && m.summonCd <= 0 && livingCount(s) < SUMMON_CAP) {
      var made = 0;
      for (var i = 0; i < ALL_DIRS.length && made < 2; i++) {
        var sx = m.x + ALL_DIRS[i][0], sy = m.y + ALL_DIRS[i][1];
        if (s.level.walkable(sx, sy) && !occupied(s, sx, sy)) { spawnMonster(s, 'swarm', sx, sy, null, false); made++; }
      }
      if (made) { m.summonCd = 4; m.intent = 'summon'; m.aiState = 'support'; if (sceneRef()) sceneRef().motesAt(m.x, m.y, 0xff9b57, 8); return; }
    }
    if (m.summonCd > 0) m.summonCd--;
    if (d <= 2 && m.cd <= 0) { m.cd = m.phase >= 3 ? 2 : 3; return telegraph(s, m, 'slam'); }
    if (m.phase >= 2 && d <= 6 && m.cd <= 0) { m.cd = 3; return telegraph(s, m, 'line'); }
    if (d <= 1) return strikePlayer(s, m, 0);
    m.aiState = 'chase'; m.intent = 'chase';
    stepToward(s, m, dx, dy);
    if (m.phase >= 3) stepToward(s, m, s.player.x - m.x, s.player.y - m.y);
  }
  function aiSovereign(s, m, dx, dy, d) {
    m.phase = bossPhase(m);
    if (m.intent === 'wave') {
      m.intent = null; m.aiState = 'attack';
      if (sceneRef()) sceneRef().shockRing(m.x, m.y, 0xc9a6ff, 3.6);
      ringDamage(s, m, 3, s.rng.int(m.dmg[0], m.dmg[1]), 'an echo wave');
      return;
    }
    if (m.cd > 0) m.cd--;
    if (m.summonCd > 0) m.summonCd--;
    if (m.phase >= 2 && m.summonCd <= 0 && livingCount(s) < SUMMON_CAP) {
      var pick = m.phase >= 3 ? 'wraith' : 'bulwark';
      for (var i = 0; i < ALL_DIRS.length; i++) {
        var sx = m.x + ALL_DIRS[i][0], sy = m.y + ALL_DIRS[i][1];
        if (s.level.walkable(sx, sy) && !occupied(s, sx, sy)) {
          spawnMonster(s, pick, sx, sy, null, false);
          m.summonCd = 6; m.intent = 'summon'; m.aiState = 'support';
          if (sceneRef()) sceneRef().motesAt(sx, sy, 0xc9a6ff, 8);
          return;
        }
      }
    }
    if (d > 3 && m.cd <= 0) {
      // Blink: the Sovereign refuses to be kited around the dais.
      for (var t = 0; t < ALL_DIRS.length; t++) {
        var bx = s.player.x + ALL_DIRS[t][0], by = s.player.y + ALL_DIRS[t][1];
        if (s.level.walkable(bx, by) && !occupied(s, bx, by)) {
          if (sceneRef()) { sceneRef().motesAt(m.x, m.y, 0xc9a6ff, 8); sceneRef().motesAt(bx, by, 0xc9a6ff, 8); }
          m.x = bx; m.y = by; m.cd = 4; m.intent = 'blink'; m.aiState = 'chase';
          var v = view(s, m); v.ax = bx; v.ay = by;
          return;
        }
      }
    }
    if (d <= 3 && m.cd <= 0) { m.cd = 3; return telegraph(s, m, 'wave'); }
    if (d <= 1) return strikePlayer(s, m, 0);
    m.aiState = 'chase'; m.intent = 'chase';
    stepToward(s, m, dx, dy);
  }

  // ------------------------------------------------------------- turn loop
  function checkFloorClear(s) {
    if (s.mode !== 'play' || s.floorCleared) return;
    var remaining = 0;
    for (var i = 0; i < s.monsters.length; i++) if (s.monsters[i].hp > 0) remaining++;
    if (remaining) return;
    s.floorCleared = true;
    var tier = s.hp > s.maxHp * 0.7 && s.floorTurn < 70 ? 'gold' : s.hp > s.maxHp * 0.35 ? 'silver' : 'bronze';
    s.medals[s.depth] = tier; s.score += FLOOR_MEDALS[tier];
    s.runShards += tier === 'gold' ? 3 : tier === 'silver' ? 2 : 1;
    if (s.passive === 'steady') s.hp = Math.min(s.maxHp, s.hp + 2);
    if (perkActive('delver')) s.hp = Math.min(s.maxHp, s.hp + 3);
    showBanner(s, 'FLOOR CLEAR', tier.toUpperCase() + ' medal  +' + FLOOR_MEDALS[tier], '#ffd76d');
    if (sceneRef()) sceneRef().medalCelebration(tier);
    profile.medals[s.depth] = tier; saveProfile();
  }
  function milestone(s, depth) {
    if (s.milestones[depth]) return;
    s.milestones[depth] = true;
    var tier = s.hp > s.maxHp * 0.65 && s.hunger > s.hungerMax * 0.45 ? 'gold' : s.hp > s.maxHp * 0.3 ? 'silver' : 'bronze';
    s.score += depth * 2;
    s.runShards += 2;
    showBanner(s, depth === MAX_DEPTH ? 'THE VAULT' : 'DEPTH ' + depth, tier.toUpperCase() + ' milestone  +' + depth * 2,
      depth === MAX_DEPTH ? '#ffdd79' : '#9ee6e9');
  }
  function burnTorch(s) {
    var burn = 1;
    if (s.passive === 'lantern') burn = 0.75;
    if (s.depth >= 8) burn += 0.2;
    if (s.ascending) burn += 0.15;
    s.torch = Math.max(0, s.torch - burn);
    var frac = s.torchMax > 0 ? s.torch / s.torchMax : 0;
    if (frac <= 0.25 && !s.torchWarned) {
      s.torchWarned = true;
      log(s, 'TORCH GUTTERING', '#ffb35d');
      CC.audio(kit, 'torch-low');
    }
    if (frac > 0.3) s.torchWarned = false;
    // A dead torch does not kill outright: it blinds you and starves you faster.
    if (s.torch <= 0 && s.turn % 2 === 0) s.hunger = Math.max(0, s.hunger - 1);
  }
  function resolveTurn(s) {
    if (s.mode !== 'play') return;
    s.turn++; s.floorTurn++; s.hunger = Math.max(0, s.hunger - 1);
    burnTorch(s);
    if (s.buffs.power > 0) s.buffs.power--;
    var skipEnemyPhase = s.buffs.haste > 0;
    if (s.status.poison > 0) {
      s.status.poison--;
      if (s.turn % 2 === 0) hurtPlayer(s, 1, 'creeping poison');
    }
    if (s.mode !== 'play') return;
    if (s.hunger > s.hungerMax * 0.55 && s.turn % 6 === 0) s.hp = Math.min(s.maxHp, s.hp + 1);
    if (s.hunger <= 0 && s.turn % 3 === 0) hurtPlayer(s, 1, 'the hunger clock');
    if (s.mode !== 'play') return;
    if (skipEnemyPhase) s.buffs.haste--;
    else for (var i = 0; i < s.monsters.length && s.mode === 'play'; i++) enemyAct(s, s.monsters[i]);
    compactDead(s);
    refreshFov(s);
    checkFloorClear(s); s.dirty = true;
  }
  function descend(s) {
    if (s.depth >= MAX_DEPTH) return;
    s.score += 1; s.depth++; s.maxDepth = Math.max(s.maxDepth, s.depth);
    profile.maxDepth = Math.max(profile.maxDepth, s.depth); refreshUnlocks();
    milestone(s, s.depth); CC.audio(kit, 'stairs'); startFloor(s, s.depth, false);
  }
  function ascend(s) {
    if (s.depth === 1) { if (s.hasCrown) win(s); else log(s, 'EXIT SEALED · THE CROWN IS BELOW', '#ff9a78'); return; }
    s.depth--; CC.audio(kit, 'stairs'); startFloor(s, s.depth, true);
  }
  function tryShrine(s) {
    var sh = s.shrine;
    if (!sh || sh.sold || s.player.x !== sh.x || s.player.y !== sh.y) return false;
    if (s.gold < sh.price) { log(s, 'SHRINE · NEED ' + (sh.price - s.gold) + ' MORE GOLD', '#ff9a78'); return true; }
    if (s.inventory.length >= s.slots && !hasSlotFor(s, sh.key)) { log(s, 'PACK FULL', '#ff9a78'); return true; }
    s.gold -= sh.price; sh.sold = true;
    addItem(s, sh.key);
    s.level.set(sh.x, sh.y, T.FLOOR);
    log(s, 'BOUGHT · ' + itemName(s, sh.key).toUpperCase(), itemColor(s, sh.key));
    CC.audio(kit, 'shrine');
    if (sceneRef()) { sceneRef().motesAt(sh.x, sh.y, itemColor(s, sh.key), 10); sceneRef().burstAt(sh.x, sh.y, 0xffd76d, 12); }
    s.dirty = true;
    return true;
  }
  function hasSlotFor(s, key) {
    for (var i = 0; i < s.inventory.length; i++) if (s.inventory[i].key === key) return true;
    return false;
  }
  function moveAction(s, dx, dy) {
    if (s.mode !== 'play') return;
    if (dx === 0 && dy === 0) {
      if (s.guide.step === 2) s.guide.step = 3;
      if (tryShrine(s)) { resolveTurn(s); return; }
      resolveTurn(s); return;
    }
    var nx = s.player.x + dx, ny = s.player.y + dy;
    if (dx !== 0 && dy !== 0 && (!s.level.walkable(s.player.x + dx, s.player.y) || !s.level.walkable(s.player.x, s.player.y + dy))) {
      log(s, 'CORNER TOO TIGHT', '#778b9b'); return;
    }
    var target = activeMonster(s, nx, ny);
    if (target) {
      var damage = s.rng.int(s.atk[0], s.atk[1]) + (s.buffs.power > 0 ? 3 : 0);
      hitMonster(s, target, damage);
      s.lastAction = 'attack'; setPlayerAnim(s, 'attack', 0.22, dx, dy);
      if (s.guide.step === 1) s.guide.step = 2;
      resolveTurn(s); return;
    }
    if (!s.level.walkable(nx, ny)) { log(s, 'STONE BLOCKS THAT STEP', '#778b9b'); return; }
    s.player.x = nx; s.player.y = ny; s.lastAction = 'move'; setPlayerAnim(s, 'walk', 0.2, dx, dy);
    CC.audio(kit, 'step');
    if (sceneRef()) sceneRef().dustAt(s.player.x, s.player.y);
    collect(s); resolveTurn(s);
    var tile = s.level.at(s.player.x, s.player.y);
    if (tile === T.DOWN && !s.hasCrown) descend(s);
    if (tile === T.UP && s.hasCrown) ascend(s);
    if (s.guide.step === 0) s.guide.step = 1;
  }
  function identifyOne(s) {
    var carried = [], i;
    for (i = 0; i < s.inventory.length; i++) {
      var k = s.inventory[i].key, kind = itemKind(k);
      if ((kind === 'potion' || kind === 'scroll') && !s.identified[k]) carried.push(k);
    }
    var pool = carried.length ? carried : unknownKeys(s);
    if (!pool.length) { log(s, 'NOTHING LEFT TO NAME', '#d8e7ef'); return; }
    var pick = pool[s.rng.int(0, pool.length - 1)];
    s.identified[pick] = true;
    CC.audio(kit, 'identify');
    showBanner(s, 'IDENTIFIED', itemName(s, pick), itemColor(s, pick));
    if (sceneRef()) sceneRef().motesAt(s.player.x, s.player.y, itemColor(s, pick), 8);
  }
  function useItem(s, index) {
    if (s.mode !== 'play') return;
    var slot = s.inventory[index]; if (!slot) return;
    var key = slot.key, kind = itemKind(key);
    var wasUnknown = (kind === 'potion' || kind === 'scroll') && !s.identified[key];
    slot.n--; if (slot.n <= 0) s.inventory.splice(index, 1);
    s.identified[key] = true;
    if (wasUnknown) { CC.audio(kit, 'identify'); showBanner(s, 'IDENTIFIED', itemName(s, key), itemColor(s, key)); }
    if (key === 'ration') { s.hunger = Math.min(s.hungerMax, s.hunger + 34); log(s, 'HUNGER +34', '#d1a56b'); }
    else if (key === 'torch') { s.torch = Math.min(s.torchMax, s.torch + 70); s.torchWarned = false; log(s, 'TORCH +70', '#ffb35d'); }
    else if (kind === 'potion') {
      if (key === 'mend') { s.hp = Math.min(s.maxHp, s.hp + 12); log(s, 'HP +12', '#50e08d'); }
      if (key === 'fury') { s.buffs.power = 5; log(s, 'FURY 5', '#ff785e'); }
      if (key === 'quick') { s.buffs.haste = 1; log(s, 'HASTE 1', '#ffd45e'); }
      if (key === 'bile') {
        for (var i = 0; i < ALL_DIRS.length; i++) {
          var m = activeMonster(s, s.player.x + ALL_DIRS[i][0], s.player.y + ALL_DIRS[i][1]);
          if (m) hitMonster(s, m, 6);
        }
        log(s, 'BILE · ADJACENT', '#b47ce5');
      }
      if (key === 'sight') { revealAll(s); log(s, 'REVEAL FLOOR', '#5ccdf0'); }
      if (key === 'blight') { log(s, 'BLIGHT · IT BURNS', '#7c8f5a'); poisonPlayer(s, 4); hurtPlayer(s, 6, 'a blighted draught'); }
    }
    else if (key === 'blink') { var p = placeFree(s, [{ x: s.player.x, y: s.player.y }]); s.player.x = p.x; s.player.y = p.y; s.player.ax = p.x; s.player.ay = p.y; log(s, 'BLINK', '#d8e7ef'); }
    else if (key === 'flame') {
      for (var j = 0; j < s.monsters.length; j++) {
        if (s.monsters[j].hp > 0 && s.level.visible[s.level.idx(s.monsters[j].x, s.monsters[j].y)]) hitMonster(s, s.monsters[j], 5);
      }
      log(s, 'FLAME · VISIBLE', '#ff9a78');
    }
    else if (key === 'ward') { s.buffs.ward = 5; log(s, 'WARD 5', '#a9d8ff'); }
    else if (key === 'terror') {
      for (var q = 0; q < s.monsters.length; q++) {
        if (s.monsters[q].boss) continue;
        if (CC.dist(s.monsters[q].x, s.monsters[q].y, s.player.x, s.player.y) <= 4) { s.monsters[q].fear = 3; fleeMonster(s, s.monsters[q], 2); }
      }
      log(s, 'TERROR · FLEE', '#c8a9ff');
    }
    else if (key === 'mapping') { revealAll(s); log(s, 'REVEAL CORRIDORS', '#d8e7ef'); }
    else if (key === 'reading') { identifyOne(s); }
    CC.audio(kit, 'item-use');
    if (sceneRef()) { sceneRef().burstAt(s.player.x, s.player.y, itemColor(s, key), 16); sceneRef().motesAt(s.player.x, s.player.y, itemColor(s, key), 6); }
    if (s.mode !== 'play') return;
    resolveTurn(s);
    if (s.guide.step < 4) { s.guide.step = 4; if (!profile.tutorialDone) { profile.tutorialDone = true; saveProfile(); } }
  }
  function bankShards(s) {
    var earned = s.runShards + s.maxDepth * 2 + (s.mode === 'won' ? 25 : 0);
    var before = profile.shards;
    profile.shards = clamp(profile.shards + earned, 0, 1000000000);
    s.shardsEarned = earned;
    s.trackUnlocked = [];
    for (var i = 0; i < TRACK.length; i++) {
      if (before < TRACK[i].at && profile.shards >= TRACK[i].at) s.trackUnlocked.push(TRACK[i]);
    }
    return earned;
  }
  function die(s, source) {
    if (s.mode !== 'play') return;
    s.mode = 'dead'; s.deathBy = source || 'the dark';
    s.finalScore = s.score + s.depth * 10;
    profile.best = Math.max(profile.best, s.finalScore); profile.runs++;
    bankShards(s); refreshUnlocks(); saveProfile();
    showBanner(s, 'RUN ENDED', 'lost to ' + s.deathBy, '#ff7d78');
    CC.audio(kit, 'death');
    if (sceneRef()) sceneRef().beginEndCeremony(s);
  }
  function win(s) {
    if (s.mode !== 'play') return;
    s.mode = 'won';
    s.finalScore = s.score + s.depth * 10 + 100;
    profile.best = Math.max(profile.best, s.finalScore); profile.escapes++; profile.runs++;
    bankShards(s); refreshUnlocks(); saveProfile();
    showBanner(s, 'ESCAPED', 'the Crown makes it into daylight', '#ffd76d');
    CC.audio(kit, 'escape');
    if (sceneRef()) sceneRef().beginEndCeremony(s);
  }

  // =======================================================================
  // View layer
  // =======================================================================
  var art = CC.art, canvasTexture = art.canvasTexture;
  var SLOTS_MAX = 8;

  function CrawlScene() { Phaser.Scene.call(this, { key: 'CrawlScene' }); }
  CrawlScene.prototype = Object.create(Phaser.Scene.prototype);
  CrawlScene.prototype.constructor = CrawlScene;

  CrawlScene.prototype.preload = function () {
    kit.loader.show('CORRIDOR CRAWL');
    kit.loader.progress(0.08);
    // SFX only: the music beds stay unfetched until the first real interaction.
    kit.audio.preload(Object.keys(AUDIO));
    kit.loader.progress(0.2);
  };
  CrawlScene.prototype.create = function () {
    Game.scene = this;
    this.simPaused = false; this.touch = {}; this.keyLatch = {}; this.lastGamepadCode = null;
    this.metrics = {}; this.lastProbe = { floor: null, event: null };
    this.particles = []; this.particleRecords = []; this.rings = []; this.emberT = 0;
    this.frameAvg = 16; this.quality = 1; this.qualityT = 0;
    this.wipe = null; this.titleT = 0; this.endT = 0; this.flicker = 1;
    var self = this;
    art.buildTextures(this, function (f) { kit.loader.progress(0.2 + f * 0.7); });
    canvasTexture(this, 'cc_chrome', 1, 1, function (c) { c.fillStyle = '#070b12'; c.fillRect(0, 0, 1, 1); });
    canvasTexture(this, 'cc_board', 1, 1, function (c) { c.fillStyle = '#101520'; c.fillRect(0, 0, 1, 1); });
    canvasTexture(this, 'cc_flat', 1, 1, function (c) { c.fillStyle = '#ffffff'; c.fillRect(0, 0, 1, 1); });
    canvasTexture(this, 'cc_titleart', 300, 92, function (c) { c.fillStyle = 'rgba(0,0,0,0)'; c.fillRect(0, 0, 300, 92); });
    canvasTexture(this, 'cc_vignette', 8, 8, function (c) { c.fillStyle = 'rgba(0,0,0,0)'; c.fillRect(0, 0, 8, 8); });
    this.buildPools(); this.buildUi(); this.relayout();
    kit.loader.progress(0.96);
    this.hardRestart(readProbe().floor || 1);
    this.attachInput();
    kit.loader.hide(); kit.registerPWA();
    this.scale.on('resize', this.relayout, this);
    // Probe surface for QA: reports the live hit centres of every menu control
    // so a harness never has to guess at coordinates.
    root.__cc.ui = function () {
      return {
        cards: self.titleCards.map(function (c) { return { x: c.bg.x + c.bg.displayWidth / 2, y: c.bg.y }; }),
        start: { x: self.startBtn.x, y: self.startBtn.y },
        settings: { x: self.settingsText.x + 20, y: self.settingsText.y + 20 },
        classBtn: { x: self.classBtn.x, y: self.classBtn.y },
        slots: self.slotBg.map(function (b) { return { x: b.x, y: b.y }; }),
        board: { x: self.metrics.boardX, y: self.metrics.boardY, tile: self.metrics.tile }
      };
    };
    root.__cc.scene = function () { return self; };
    root.__cc.move = function (dx, dy) { if (self.state) moveAction(self.state, dx, dy); };
    root.__cc.use = function (i) { if (self.state) useItem(self.state, i); };
    root.__cc.spawn = function (key, x, y) { return self.state ? spawnMonster(self.state, key, x, y) : null; };
  };

  CrawlScene.prototype.buildPools = function () {
    var i;
    this.itemPool = []; this.goldPool = []; this.monPool = [];
    this.monHpBg = []; this.monHp = []; this.monIntent = []; this.monMark = [];
    this.particlePool = []; this.dustPool = []; this.motePool = []; this.emberPool = [];
    for (i = 0; i < MAX_PARTICLES; i++) this.particleRecords.push({ image: null, x: 0, y: 0, vx: 0, vy: 0, g: 0, t: 0, max: 0 });
    for (i = 0; i < MAX_ITEMS; i++) this.itemPool.push(this.add.image(0, 0, 'cc_icon_unknown_potion').setVisible(false).setDepth(8));
    for (i = 0; i < MAX_GOLD; i++) this.goldPool.push(this.add.image(0, 0, 'cc_gold').setVisible(false).setDepth(8));
    // Every FX pool is allocated before the loading screen hides: no sprite is
    // ever created during play.
    for (i = 0; i < MAX_PARTICLES; i++) {
      this.particlePool.push(this.add.image(0, 0, 'cc_spark').setVisible(false).setDepth(60));
      this.dustPool.push(this.add.image(0, 0, 'cc_dust').setVisible(false).setDepth(59));
    }
    for (i = 0; i < 48; i++) {
      this.motePool.push(this.add.image(0, 0, 'cc_mote').setVisible(false).setDepth(61));
      this.emberPool.push(this.add.image(0, 0, 'cc_ember').setVisible(false).setDepth(58));
    }
    for (i = 0; i < MAX_RINGS; i++) this.rings.push({ img: this.add.image(0, 0, 'cc_ring').setVisible(false).setDepth(62), t: 0, max: 1, r: 1 });
    for (i = 0; i < MAX_MONSTERS; i++) {
      this.monPool.push(this.add.image(0, 0, 'cc_rat_idle').setVisible(false).setDepth(12));
      this.monHpBg.push(this.add.rectangle(0, 0, 24, 3, 0x161923).setOrigin(0.5).setVisible(false).setDepth(13));
      this.monHp.push(this.add.rectangle(0, 0, 22, 2, 0x71e099).setOrigin(0.5).setVisible(false).setDepth(14));
      this.monIntent.push(this.add.text(0, 0, '', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '13px', fontStyle: 'bold', color: '#ffcf80' }).setOrigin(0.5).setVisible(false).setDepth(16));
      this.monMark.push(this.add.text(0, 0, '', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '10px', fontStyle: 'bold', color: '#ffd76d' }).setOrigin(0.5).setVisible(false).setDepth(16));
    }
    this.highlightPool = [];
    for (i = 0; i < 8; i++) this.highlightPool.push(this.add.rectangle(0, 0, 10, 10, 0x000000, 0).setOrigin(0).setStrokeStyle(2, 0x9ee6e9, 0.8).setVisible(false).setDepth(6));
    this.playerRing = this.add.rectangle(0, 0, 10, 10, 0x000000, 0).setOrigin(0).setStrokeStyle(2, 0x7ce7ff, 0.95).setDepth(10);
    this.playerGlow = this.add.image(0, 0, 'cc_glow').setDepth(9).setTint(0xffd88a).setAlpha(0.4);
    this.playerImage = this.add.image(0, 0, 'cc_player_idle').setDepth(15);
    this.shrineImage = this.add.image(0, 0, 'cc_shrine').setDepth(7).setVisible(false);
    this.shrineIcon = this.add.image(0, 0, 'cc_icon_unknown_potion').setDepth(9).setVisible(false);
    this.shrinePrice = this.add.text(0, 0, '', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '14px', fontStyle: 'bold', color: '#ffd76d' }).setOrigin(0.5, 1).setDepth(17).setVisible(false);
    this.wipeBars = [];
    for (i = 0; i < 9; i++) this.wipeBars.push(this.add.rectangle(0, 0, 10, 10, 0x05070d, 1).setOrigin(0).setVisible(false).setDepth(78));
  };

  CrawlScene.prototype.buildUi = function () {
    var i;
    this.chromeImage = this.add.image(0, 0, 'cc_chrome').setOrigin(0).setDepth(-30);
    this.boardImage = this.add.image(0, 0, 'cc_board').setOrigin(0).setDepth(0);
    this.boardVignette = this.add.image(0, 0, 'cc_vignette').setOrigin(0).setDepth(5).setAlpha(0.85);
    this.depthText = this.add.text(14, 12, '', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '14px', color: '#98b7c7' }).setDepth(40);
    this.scoreText = this.add.text(0, 10, '', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '14px', color: '#ffd76d' }).setOrigin(1, 0).setDepth(40);
    this.goldText = this.add.text(0, 30, '', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '14px', color: '#ffd76d' }).setOrigin(1, 0).setDepth(40);
    this.hpText = this.add.text(0, 50, '', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '14px', color: '#ffb2a8' }).setOrigin(1, 0).setDepth(40);
    this.hpBg = this.add.rectangle(0, 0, 100, 7, 0x20242e).setOrigin(0, 0).setDepth(38);
    this.hpFill = this.add.rectangle(0, 0, 100, 7, 0xef746d).setOrigin(0, 0).setDepth(39);
    this.hungerBg = this.add.rectangle(0, 0, 100, 7, 0x20242e).setOrigin(0, 0).setDepth(38);
    this.hungerWarning = this.add.rectangle(0, 0, 25, 7, 0x663334).setOrigin(0, 0).setDepth(37);
    this.hungerFill = this.add.rectangle(0, 0, 100, 7, 0xe7b45f).setOrigin(0, 0).setDepth(39);
    this.torchBg = this.add.rectangle(0, 0, 100, 7, 0x20242e).setOrigin(0, 0).setDepth(38);
    this.torchFill = this.add.rectangle(0, 0, 100, 7, 0xffb35d).setOrigin(0, 0).setDepth(39);
    this.hungerText = this.add.text(0, 0, '◒', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '13px', color: '#d8e7ef' }).setOrigin(1, 0.5).setDepth(40);
    this.torchText = this.add.text(0, 0, '☼', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '13px', color: '#ffb35d' }).setOrigin(1, 0.5).setDepth(40);
    this.hpIcon = this.add.text(0, 0, '♥', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '13px', color: '#ef746d' }).setOrigin(1, 0.5).setDepth(40);
    this.buffText = this.add.text(0, 0, '', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '14px', color: '#d8e7ef' }).setDepth(40);
    this.bossBg = this.add.rectangle(0, 0, 100, 6, 0x2a1520).setOrigin(0, 0).setDepth(43).setVisible(false);
    this.bossFill = this.add.rectangle(0, 0, 100, 6, 0xff6a3d).setOrigin(0, 0).setDepth(44).setVisible(false);
    this.bossName = this.add.text(0, 0, '', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '12px', fontStyle: 'bold', color: '#ffb9a0' }).setOrigin(0.5, 0.5).setDepth(44).setVisible(false);
    this.guideBg = this.add.rectangle(0, 0, 10, 22, 0x0b141d, 0.92).setOrigin(0, 0).setDepth(45);
    this.guideText = this.add.text(0, 0, '', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '14px', color: '#d9eff2' }).setOrigin(0.5).setDepth(46);
    this.inspectBg = this.add.rectangle(0, 0, 10, 22, 0x0b141d, 0.96).setOrigin(0, 0).setDepth(50).setVisible(false);
    this.inspectText = this.add.text(0, 0, '', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '14px', color: '#e7f3f5', align: 'center' }).setOrigin(0.5).setDepth(51).setVisible(false);
    this.slotBg = []; this.slotIcon = []; this.slotCount = [];
    for (i = 0; i < SLOTS_MAX; i++) {
      var bg = this.add.rectangle(0, 0, 46, 60, 0x172330).setOrigin(0.5).setStrokeStyle(1, 0x3a5363, 1).setDepth(40);
      var icon = this.add.image(0, 0, 'cc_icon_unknown_potion').setDepth(41);
      var count = this.add.text(0, 0, '', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '14px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(1, 1).setDepth(42);
      bg.setInteractive({ useHandCursor: true });
      (function (scene, index) {
        bg.on('pointerdown', function (pointer) {
          if (kit.paused || scene.simPaused || scene.wipe || !scene.state || scene.state.mode !== 'play') return;
          scene.claimPointer(pointer);
          scene.touch[pointer.id] = { type: 'slot', index: index, x: pointer.x, y: pointer.y, at: performance.now() };
        });
      })(this, i);
      this.slotBg.push(bg); this.slotIcon.push(icon); this.slotCount.push(count);
    }
    this.settingsText = this.add.text(0, 0, '⚙', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '18px', color: '#9ee6e9', backgroundColor: '#172330', padding: { left: 13, right: 13, top: 11, bottom: 11 } }).setDepth(45).setInteractive({ useHandCursor: true });
    this.settingsText.on('pointerdown', function () { if (kit.openSettings) kit.openSettings(); });
    this.boardHit = this.add.rectangle(0, 0, 10, 10, 0x000000, 0).setOrigin(0).setInteractive().setDepth(20);
    this.bannerBg = this.add.rectangle(0, 0, 10, 22, 0x0b141d, 0.96).setOrigin(0, 0).setDepth(70).setVisible(false);
    this.bannerTitle = this.add.text(0, 0, '', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '14px', fontStyle: 'bold', color: '#ffd76d', align: 'center' }).setOrigin(0.5).setDepth(71).setVisible(false);
    this.transitionShade = this.add.rectangle(0, 0, 10, 10, 0x03050a, 0.92).setOrigin(0).setDepth(75).setVisible(false);
    this.buildTitleUi();
    this.buildEndUi();
  };

  CrawlScene.prototype.buildTitleUi = function () {
    var self = this, i;
    this.titleShade = this.add.rectangle(0, 0, 10, 10, 0x070b12, 1).setOrigin(0).setDepth(100).setVisible(false);
    this.titleArt = this.add.image(0, 0, 'cc_titleart').setOrigin(0.5).setDepth(102).setVisible(false);
    this.titleSub = this.add.text(0, 0, 'choose a delver', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '14px', color: '#8fb0c2' }).setOrigin(0.5).setDepth(102).setVisible(false);
    this.titleCards = [];
    for (i = 0; i < CLASS_KEYS.length; i++) {
      var card = {
        bg: this.add.rectangle(0, 0, 300, 46, 0x132030, 1).setOrigin(0, 0.5).setStrokeStyle(2, 0x2a4356, 1).setDepth(102).setVisible(false),
        mark: this.add.text(0, 0, '', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '16px', fontStyle: 'bold', color: '#ffd76d' }).setOrigin(0.5).setDepth(103).setVisible(false),
        name: this.add.text(0, 0, '', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '15px', fontStyle: 'bold', color: '#e6f2f6' }).setOrigin(0, 0.5).setDepth(103).setVisible(false),
        line: this.add.text(0, 0, '', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '12px', color: '#8fb0c2' }).setOrigin(0, 0.5).setDepth(103).setVisible(false),
        perk: this.add.text(0, 0, '', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '11px', color: '#6f8a9c' }).setOrigin(0, 0.5).setDepth(103).setVisible(false)
      };
      card.bg.setInteractive({ useHandCursor: true });
      (function (index) {
        card.bg.on('pointerdown', function () { self.pickClass(index); });
      })(i);
      this.titleCards.push(card);
    }
    this.trackBarBg = this.add.rectangle(0, 0, 200, 8, 0x1a2530).setOrigin(0, 0.5).setDepth(102).setVisible(false);
    this.trackBarFill = this.add.rectangle(0, 0, 200, 8, 0xc9a6ff).setOrigin(0, 0.5).setDepth(103).setVisible(false);
    this.trackText = this.add.text(0, 0, '', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '12px', color: '#c9b8e6', align: 'center' }).setOrigin(0.5).setDepth(103).setVisible(false);
    this.startBtn = this.add.rectangle(0, 0, 240, 52, 0x1c6f4a, 1).setOrigin(0.5).setStrokeStyle(2, 0x39d353, 1).setDepth(102).setVisible(false).setInteractive({ useHandCursor: true });
    this.startText = this.add.text(0, 0, 'DESCEND', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '18px', fontStyle: 'bold', color: '#eafff2' }).setOrigin(0.5).setDepth(103).setVisible(false);
    this.startBtn.on('pointerdown', function () { self.startRun(); });
    this.titleBest = this.add.text(0, 0, '', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '12px', color: '#7f97a6' }).setOrigin(0.5).setDepth(102).setVisible(false);
  };

  CrawlScene.prototype.buildEndUi = function () {
    var self = this;
    this.endShade = this.add.rectangle(0, 0, 10, 10, 0x04070b, 0.9).setOrigin(0).setDepth(80).setVisible(false);
    this.endPanel = this.add.rectangle(0, 0, 300, 300, 0x0d1721, 0.96).setOrigin(0.5).setStrokeStyle(2, 0x27404f, 1).setDepth(81).setVisible(false);
    this.endMedal = this.add.image(0, 0, 'cc_medal').setDepth(83).setVisible(false);
    this.endTitle = this.add.text(0, 0, '', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '24px', fontStyle: 'bold', color: '#ffd76d', align: 'center' }).setOrigin(0.5).setDepth(83).setVisible(false);
    this.endText = this.add.text(0, 0, '', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '13px', color: '#d7e5eb', align: 'center', lineSpacing: 5, wordWrap: { width: 280 } }).setOrigin(0.5).setDepth(83).setVisible(false);
    this.endShardText = this.add.text(0, 0, '', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '14px', fontStyle: 'bold', color: '#c9a6ff', align: 'center' }).setOrigin(0.5).setDepth(83).setVisible(false);
    this.endHint = this.add.text(0, 0, 'TAP ANYWHERE TO RUN AGAIN', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '12px', color: '#8fb0c2', align: 'center' }).setOrigin(0.5).setDepth(83).setVisible(false);
    this.endHit = this.add.rectangle(0, 0, 10, 10, 0x000000, 0).setOrigin(0).setInteractive().setDepth(85).setVisible(false);
    this.endHit.on('pointerdown', function () { if (self.endT > 0.55) kit.restart(); });
    this.classBtn = this.add.rectangle(0, 0, 170, 44, 0x172330, 1).setOrigin(0.5).setStrokeStyle(2, 0x3a5363, 1).setDepth(90).setVisible(false).setInteractive({ useHandCursor: true });
    this.classBtnText = this.add.text(0, 0, 'CHANGE CLASS', { fontFamily: 'monospace', resolution: GGKit.hiDpi.dpr(), fontSize: '14px', fontStyle: 'bold', color: '#9ee6e9' }).setOrigin(0.5).setDepth(91).setVisible(false);
    this.classBtn.on('pointerdown', function () { if (self.endT > 0.55) self.openTitle(); });
  };

  CrawlScene.prototype.relayout = function () {
    if (!this.metrics || !this.boardImage) return;
    var w = Math.max(280, this.scale.width), h = Math.max(480, this.scale.height);
    var top = h < 600 ? 86 : 82;
    // The pack bar is sized to its contents rather than to a share of the
    // screen: the leftover space belongs to the board, not to an empty panel.
    var bottom = h < 620 ? 92 : 112;
    var available = Math.max(245, h - top - bottom - 16);
    var tile = Math.floor(Math.min((w - 20) / CC.MAPW, available / CC.MAPH));
    tile = clamp(tile, 14, 30);
    var boardW = tile * CC.MAPW, boardH = tile * CC.MAPH;
    var boardX = Math.floor((w - boardW) / 2);
    var boardY = top + Math.max(0, Math.floor((available - boardH) * 0.36));
    this.metrics = { w: w, h: h, tile: tile, boardW: boardW, boardH: boardH, boardX: boardX, boardY: boardY };
    // Static chrome is baked into one texture: Phaser Graphics would replay the
    // whole panel command list every frame.
    canvasTexture(this, 'cc_chrome', w, h, function (ctx, cw, ch) {
      ctx.fillStyle = '#070b12'; ctx.fillRect(0, 0, cw, ch);
      var g = ctx.createLinearGradient(0, 0, 0, 78);
      g.addColorStop(0, '#12202c'); g.addColorStop(1, '#0c141d');
      ctx.fillStyle = g; ctx.fillRect(8, 6, cw - 16, 66);
      ctx.fillStyle = '#1a3040'; ctx.fillRect(8, 72, cw - 16, 2);
      ctx.fillStyle = '#0c151e'; ctx.fillRect(boardX - 5, boardY - 5, boardW + 10, boardH + 10);
      ctx.strokeStyle = '#2b4757'; ctx.lineWidth = 2;
      ctx.strokeRect(boardX - 5, boardY - 5, boardW + 10, boardH + 10);
      ctx.strokeStyle = 'rgba(158,230,233,0.18)'; ctx.lineWidth = 1;
      ctx.strokeRect(boardX - 2, boardY - 2, boardW + 4, boardH + 4);
      var barY = boardY + boardH + 8, barH = Math.max(84, Math.min(ch - barY - 6, 104));
      var bg2 = ctx.createLinearGradient(0, barY, 0, barY + barH);
      bg2.addColorStop(0, '#0f1a24'); bg2.addColorStop(1, '#0a121a');
      ctx.fillStyle = bg2; ctx.fillRect(8, barY, cw - 16, barH);
      ctx.strokeStyle = '#223a48'; ctx.lineWidth = 2; ctx.strokeRect(8, barY, cw - 16, barH);
    });
    // The board vignette is a one-off bake: rebuilding a radial gradient inside
    // the per-turn board pass cost more than the rest of the tile loop.
    canvasTexture(this, 'cc_vignette', 96, 128, function (ctx, vw, vh) {
      var vg = ctx.createRadialGradient(vw / 2, vh / 2, vw * 0.34, vw / 2, vh / 2, vh * 0.7);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(2,4,8,0.3)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, vw, vh);
    });
    this.chromeImage.setTexture('cc_chrome').setDisplaySize(w, h);
    this.boardImage.setPosition(boardX, boardY).setDisplaySize(boardW, boardH);
    this.boardVignette.setTexture('cc_vignette').setPosition(boardX, boardY).setDisplaySize(boardW, boardH);
    this.boardHit.setPosition(boardX, boardY).setSize(boardW, boardH);
    this.playerRing.setSize(tile - 3, tile - 3);
    var meterX = 96, meterW = Math.max(70, w - meterX - 104);
    this.hpBg.setPosition(meterX, 15).setSize(meterW, 7); this.hpFill.setPosition(meterX, 15);
    this.hungerBg.setPosition(meterX, 33).setSize(meterW, 7); this.hungerFill.setPosition(meterX, 33); this.hungerWarning.setPosition(meterX, 33);
    this.torchBg.setPosition(meterX, 51).setSize(meterW, 7); this.torchFill.setPosition(meterX, 51);
    this.hpIcon.setPosition(meterX - 6, 19); this.hungerText.setPosition(meterX - 6, 37); this.torchText.setPosition(meterX - 6, 55);
    this.scoreText.setPosition(w - 14, 9); this.goldText.setPosition(w - 14, 29); this.hpText.setPosition(w - 14, 49);
    this.buffText.setPosition(14, 32);
    this.settingsText.setPosition(w - 52, boardY + boardH + 52);
    var stripY = Math.max(76, boardY - 26);
    this.guideBg.setPosition(boardX, stripY).setSize(boardW, 22); this.guideText.setPosition(w / 2, stripY + 11);
    this.inspectBg.setPosition(boardX, stripY).setSize(boardW, 22); this.inspectText.setPosition(w / 2, stripY + 11);
    this.bannerBg.setPosition(boardX, stripY).setSize(boardW, 22); this.bannerTitle.setPosition(w / 2, stripY + 11);
    var bossY = Math.max(78, boardY - 48);
    this.bossName.setPosition(w / 2, bossY);
    this.bossBg.setPosition(boardX + 8, bossY + 6).setSize(boardW - 16, 6);
    this.bossFill.setPosition(boardX + 8, bossY + 6);
    // Eight pack slots plus a 44px settings target, all above the thumb line.
    var count = SLOTS_MAX, gap = 5, reserve = 56;
    var slotW = Math.min(48, (w - 22 - reserve - gap * (count - 1)) / count);
    var start = 14;
    for (var i = 0; i < SLOTS_MAX; i++) {
      var x = start + slotW / 2 + i * (slotW + gap), y = boardY + boardH + 52;
      this.slotBg[i].setPosition(x, y).setSize(slotW, Math.max(56, slotW + 12));
      this.slotIcon[i].setPosition(x, y - 7);
      this.slotCount[i].setPosition(x + slotW / 2 - 4, y + 20);
    }
    this.layoutTitle(w, h);
    this.layoutEnd(w, h);
    for (i = 0; i < this.wipeBars.length; i++) this.wipeBars[i].setSize(w, Math.ceil(h / this.wipeBars.length) + 1).setPosition(0, i * (h / this.wipeBars.length));
    this.transitionShade.setSize(w, h);
    if (this.state) this.state.dirty = true;
  };

  CrawlScene.prototype.layoutTitle = function (w, h) {
    var TW = 300, TH = 110;
    canvasTexture(this, 'cc_titleart', TW, TH, function (ctx) {
      ctx.fillStyle = '#ffd76d'; ctx.strokeStyle = '#6b4a1c'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(118, 42); ctx.lineTo(122, 10); ctx.lineTo(136, 26); ctx.lineTo(150, 6);
      ctx.lineTo(164, 26); ctx.lineTo(178, 10); ctx.lineTo(182, 42);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff3c6'; ctx.fillRect(130, 33, 5, 5); ctx.fillRect(147, 33, 5, 5); ctx.fillRect(164, 33, 5, 5);
      ctx.font = 'bold 30px monospace'; ctx.textAlign = 'center';
      ctx.strokeStyle = '#08121a'; ctx.lineWidth = 6;
      ctx.strokeText('CORRIDOR', 150, 74); ctx.strokeText('CRAWL', 150, 100);
      ctx.fillStyle = '#e8f6fb'; ctx.fillText('CORRIDOR', 150, 74);
      ctx.fillStyle = '#9ee6e9'; ctx.fillText('CRAWL', 150, 100);
    });
    this.titleShade.setSize(w, h);
    // The whole menu is measured, then centred: on a tall phone it breathes,
    // on a short one it compresses instead of running off the bottom.
    var artW = Math.min(w - 44, 280), artH = artW * TH / TW;
    var cardW = Math.min(w - 32, 330);
    var cardH = h < 760 ? 48 : 56, gap = h < 760 ? 6 : 8;
    var blockH = artH + 22 + this.titleCards.length * (cardH + gap) + 30 + 74 + 26;
    var top = Math.max(18, (h - blockH) / 2);
    var y = top + artH / 2;
    this.titleArt.setTexture('cc_titleart').setPosition(w / 2, y).setDisplaySize(artW, artH);
    y = top + artH + 6;
    this.titleSub.setPosition(w / 2, y);
    y += 18;
    for (var i = 0; i < this.titleCards.length; i++) {
      var c = this.titleCards[i], cy = y + cardH / 2 + i * (cardH + gap), x = (w - cardW) / 2;
      c.bg.setPosition(x, cy).setSize(cardW, cardH);
      c.__baseX = x;
      c.mark.setPosition(x + 26, cy);
      c.name.setPosition(x + 50, cy - (cardH > 50 ? 16 : 14));
      c.line.setPosition(x + 50, cy);
      c.perk.setPosition(x + 50, cy + (cardH > 50 ? 16 : 14));
      c.__wrap = cardW - 60;
    }
    y += this.titleCards.length * (cardH + gap) + 8;
    var trackW = Math.min(w - 60, 290);
    this.trackBarBg.setPosition((w - trackW) / 2, y).setSize(trackW, 8);
    this.trackBarFill.setPosition((w - trackW) / 2, y);
    this.trackText.setPosition(w / 2, y + 18);
    y += 34;
    var btnY = y + 30;
    this.startBtn.setPosition(w / 2, btnY).setSize(Math.min(w - 56, 270), 54);
    this.startText.setPosition(w / 2, btnY);
    this.titleBest.setPosition(w / 2, btnY + 44);
  };

  CrawlScene.prototype.layoutEnd = function (w, h) {
    // The results card is sized to its rows so the ceremony never opens onto a
    // half-empty box, and it always clears the pack bar underneath.
    var pw = Math.min(w - 32, 320), ph = Math.min(Math.max(240, h - 300), 320);
    var cy = Math.max(ph / 2 + 60, h * 0.40), top = cy - ph / 2;
    this.endShade.setSize(w, h); this.endHit.setSize(w, h);
    this.endPanel.setPosition(w / 2, cy).setSize(pw, ph);
    this.endMedal.setPosition(w / 2, top + 34).setDisplaySize(32, 32);
    this.endTitle.setPosition(w / 2, top + 72);
    this.endShardText.setPosition(w / 2, top + 102);
    this.endText.setPosition(w / 2, top + ph * 0.62);
    this.endText.setWordWrapWidth(pw - 36);
    this.endHint.setPosition(w / 2, cy + ph / 2 - 20);
    var btnY = Math.min(h - 34, cy + ph / 2 + 36);
    this.classBtn.setPosition(w / 2, btnY);
    this.classBtnText.setPosition(w / 2, btnY);
  };

  // -------------------------------------------------------------- board bake
  CrawlScene.prototype.drawBoard = function () {
    if (!this.state || !this.state.level) return;
    var s = this.state, m = this.metrics, band = s.level.band, flick = this.flicker;
    var lightWarm = band.key === 'flooded' ? 0xbfe6ef : band.key === 'vault' ? 0xe7d6ff : 0xffe7ae;
    canvasTexture(this, 'cc_board', m.boardW, m.boardH, function (ctx) {
      var tile = m.tile, x, y;
      for (y = 0; y < s.level.h; y++) {
        for (x = 0; x < s.level.w; x++) {
          var idx = s.level.idx(x, y);
          var seen = s.level.seen[idx] === 1, visible = s.level.visible[idx] === 1;
          var t = s.level.at(x, y), px = x * tile, py = y * tile;
          if (!seen) {
            // Unexplored ground still shows a faint grid so the board reads as
            // a dungeon waiting to be mapped rather than a black void.
            ctx.fillStyle = hex(band.fog); ctx.fillRect(px, py, tile, tile);
            ctx.fillStyle = hex(CC.mix(band.fog, band.edge, 0.1));
            ctx.fillRect(px, py, tile, 1); ctx.fillRect(px, py, 1, tile);
            continue;
          }
          var solid = t === T.WALL || t === T.PILLAR;
          var raw = solid ? band.wall
            : t === T.WATER ? band.water
            : t === T.EMBER ? band.ember
            : t === T.VAULT ? CC.mix(band.floor, band.edge, 0.45)
            : t === T.BONES ? CC.mix(band.floor, 0xd9d4c4, 0.22)
            : band.floor;
          var lit;
          if (visible) {
            // Torchlight: warm at the player, falling off toward the band fog,
            // but never below a floor that keeps threats readable.
            var l = CC.clamp(s.level.light[idx] * flick, 0, 1);
            lit = CC.mix(band.fog, raw, 0.6 + 0.4 * l);
            if (l > 0.5) lit = CC.mix(lit, lightWarm, (l - 0.5) * 0.3);
          } else {
            // Remembered ground reads as a cold blue-grey memory, never as play space.
            lit = CC.mix(CC.mix(raw, band.fog, 0.46), 0x22303c, 0.28);
          }
          ctx.fillStyle = hex(lit);
          ctx.fillRect(px, py, tile, tile);
          if (solid) {
            var edge = visible ? CC.mix(band.edge, band.fog, 1 - CC.clamp(s.level.light[idx] + 0.2, 0, 1)) : 0x232c37;
            ctx.fillStyle = hex(edge);
            ctx.fillRect(px + 1, py + 1, tile - 2, 2);
            ctx.fillRect(px + 1, py + 1, 2, tile - 2);
            ctx.globalAlpha = 0.5; ctx.fillStyle = '#000000';
            ctx.fillRect(px + 1, py + tile - 3, tile - 2, 2);
            ctx.globalAlpha = 1;
            if (t === T.PILLAR) {
              ctx.fillStyle = hex(band.edge); ctx.fillRect(px + 4, py + 4, Math.max(2, tile - 8), Math.max(2, tile - 8));
              ctx.fillStyle = hex(band.accent); ctx.fillRect(px + 5, py + 5, 2, Math.max(2, tile - 10));
            }
            continue;
          }
          // Transition edging under every wall keeps floors from butting into
          // stone with a hard seam.
          ctx.globalAlpha = 0.4; ctx.fillStyle = '#000000';
          if (!s.level.walkable(x, y - 1)) ctx.fillRect(px, py, tile, 2);
          if (!s.level.walkable(x - 1, y)) ctx.fillRect(px, py, 2, tile);
          ctx.globalAlpha = 1;
          if (!visible) continue;
          var a = CC.clamp(s.level.light[idx], 0.12, 1);
          ctx.globalAlpha = a;
          if (t === T.WATER) {
            ctx.strokeStyle = '#8be7ed'; ctx.globalAlpha = a * 0.5; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(px + 2, py + tile * 0.34); ctx.lineTo(px + tile * 0.42, py + tile * 0.34);
            ctx.lineTo(px + tile * 0.58, py + tile * 0.52); ctx.lineTo(px + tile - 2, py + tile * 0.52);
            ctx.stroke();
          } else if (t === T.EMBER) {
            ctx.fillStyle = '#ffba67';
            ctx.fillRect(px + tile * 0.2, py + tile * 0.28, 2, 2);
            ctx.fillRect(px + tile * 0.64, py + tile * 0.65, 2, 2);
            ctx.fillStyle = '#702f32'; ctx.fillRect(px + tile * 0.34, py + tile * 0.7, 3, 1);
          } else if (t === T.VAULT) {
            ctx.fillStyle = '#b895e5';
            ctx.fillRect(px + tile * 0.45, py + tile * 0.2, 2, Math.max(3, tile * 0.6));
            ctx.fillRect(px + tile * 0.28, py + tile * 0.44, Math.max(3, tile * 0.42), 2);
          } else if (t === T.BONES) {
            ctx.fillStyle = '#cfd6cd';
            ctx.fillRect(px + tile * 0.22, py + tile * 0.6, Math.max(3, tile * 0.4), 2);
            ctx.fillRect(px + tile * 0.6, py + tile * 0.3, 2, Math.max(3, tile * 0.28));
          } else if (t === T.UP) {
            ctx.strokeStyle = '#8be7ed'; ctx.lineWidth = 2;
            ctx.strokeRect(px + 4, py + 4, tile - 8, tile - 8);
            ctx.fillStyle = '#8be7ed'; ctx.fillRect(px + tile * 0.3, py + tile * 0.46, tile * 0.4, 2);
            ctx.fillRect(px + tile * 0.44, py + tile * 0.3, 2, tile * 0.32);
          } else if (t === T.DOWN) {
            ctx.strokeStyle = '#ffd76d'; ctx.lineWidth = 2;
            ctx.strokeRect(px + 4, py + 4, tile - 8, tile - 8);
            ctx.fillStyle = '#ffd76d'; ctx.fillRect(px + tile * 0.3, py + tile * 0.46, tile * 0.4, 2);
            ctx.fillRect(px + tile * 0.44, py + tile * 0.44, 2, tile * 0.3);
          } else if (t !== T.SHRINE) {
            // Band-specific floor grain: five vocabularies, one grid.
            ctx.fillStyle = hex(band.edge); ctx.globalAlpha = a * 0.3;
            var deco = band.deco;
            if (deco === 'roots') {
              if ((x * 5 + y * 3) % 7 === 0) ctx.fillRect(px + tile * 0.24, py + tile * 0.68, 3, 1);
              if ((x + y * 2) % 11 === 0) ctx.fillRect(px + tile * 0.68, py + tile * 0.24, 1, 3);
            } else if (deco === 'tide') {
              if ((x + y) % 4 === 0) ctx.fillRect(px + tile * 0.2, py + tile * 0.7, Math.max(3, tile * 0.5), 1);
            } else if (deco === 'slag') {
              if ((x * 3 + y) % 6 === 0) { ctx.fillRect(px + tile * 0.3, py + tile * 0.3, 1, Math.max(3, tile * 0.4)); ctx.fillRect(px + tile * 0.3, py + tile * 0.55, Math.max(2, tile * 0.22), 1); }
            } else if (deco === 'bone') {
              if ((x * 7 + y * 5) % 9 === 0) { ctx.fillRect(px + tile * 0.3, py + tile * 0.6, Math.max(3, tile * 0.34), 1); ctx.fillRect(px + tile * 0.28, py + tile * 0.55, 1, 3); }
            } else {
              if ((x + y) % 5 === 0) { ctx.fillRect(px + tile * 0.42, py + tile * 0.3, 1, Math.max(3, tile * 0.34)); ctx.fillRect(px + tile * 0.32, py + tile * 0.46, Math.max(3, tile * 0.3), 1); }
            }
          }
          ctx.globalAlpha = 1;
        }
      }
    });
    this.boardImage.setTexture('cc_board').setDisplaySize(m.boardW, m.boardH);
  };
  // One shared vector: the render pass reads it immediately, so per-actor
  // allocation (and the GC pauses it caused under CPU throttle) is gone.
  var CELL = { x: 0, y: 0 };
  CrawlScene.prototype.cell = function (x, y) {
    CELL.x = this.metrics.boardX + (x + 0.5) * this.metrics.tile;
    CELL.y = this.metrics.boardY + (y + 0.5) * this.metrics.tile;
    return CELL;
  };
  CrawlScene.prototype.cellF = CrawlScene.prototype.cell;

  var INTENT_MARK = { strike: '!', volley: '^', spit: '~', charge: '»', slam: '◎', line: '=', wave: '◎',
    summon: '+', mend: '+', flee: '<', chase: '>', guard: 'x', stun: 'z', blink: '*' };

  CrawlScene.prototype.renderWorld = function () {
    var s = this.state, m = this.metrics, i, p;
    for (i = 0; i < this.itemPool.length; i++) this.itemPool[i].setVisible(false);
    for (i = 0; i < this.goldPool.length; i++) this.goldPool[i].setVisible(false);
    for (i = 0; i < this.monPool.length; i++) {
      this.monPool[i].setVisible(false); this.monHpBg[i].setVisible(false); this.monHp[i].setVisible(false);
      this.monIntent[i].setVisible(false); this.monMark[i].setVisible(false);
    }
    var showWorld = s.mode !== 'title';
    if (!showWorld) {
      this.playerImage.setVisible(false); this.playerRing.setVisible(false); this.playerGlow.setVisible(false);
      this.shrineImage.setVisible(false); this.shrineIcon.setVisible(false); this.shrinePrice.setVisible(false);
      this.boardVignette.setVisible(false);
      for (i = 0; i < this.highlightPool.length; i++) this.highlightPool[i].setVisible(false);
      return;
    }
    this.boardVignette.setVisible(true);
    for (i = 0; i < s.items.length && i < MAX_ITEMS; i++) {
      var item = s.items[i], idx = s.level.idx(item.x, item.y);
      if (!s.level.visible[idx]) continue;
      p = this.cell(item.x, item.y);
      var bobF = Math.sin((this.titleT * 3) + i) * m.tile * 0.05;
      var itemTex = itemIconKey(s, item.key), img = this.itemPool[i];
      if (img.__texKey !== itemTex) { img.setTexture(itemTex); img.__texKey = itemTex; }
      img.setPosition(p.x, p.y + bobF)
        .setDisplaySize(m.tile * 0.78, m.tile * 0.78).setVisible(true)
        .setAlpha(clamp(s.level.light[idx] + 0.32, 0.35, 1));
    }
    for (i = 0; i < s.goldPiles.length && i < MAX_GOLD; i++) {
      var gp = s.goldPiles[i], gi = s.level.idx(gp.x, gp.y);
      if (!s.level.visible[gi]) continue;
      p = this.cell(gp.x, gp.y);
      this.goldPool[i].setPosition(p.x, p.y).setDisplaySize(m.tile * 0.62, m.tile * 0.62).setVisible(true)
        .setAlpha(clamp(s.level.light[gi] + 0.32, 0.35, 1));
    }
    var boss = null;
    for (i = 0; i < s.monsters.length && i < MAX_MONSTERS; i++) {
      var mon = s.monsters[i], mi = s.level.idx(mon.x, mon.y), v = s.monsterViews[mon.id];
      if (!v) continue;
      if (mon.boss && mon.hp > 0) boss = mon;
      if (!s.level.visible[mi]) continue;
      var lightA = clamp(s.level.light[mi] + 0.3, 0.32, 1);
      var key = MON[mon.key] ? mon.key : 'rat';
      // A dormant mimic wears its disguise: it renders as loot, not a creature.
      if (mon.dormant) {
        var slotIdx = s.items.length + i;
        if (slotIdx < MAX_ITEMS) {
          p = this.cell(v.ax, v.ay);
          this.itemPool[slotIdx].setTexture('cc_icon_unknown_potion').setPosition(p.x, p.y)
            .setDisplaySize(m.tile * 0.78, m.tile * 0.78).setVisible(true).setAlpha(lightA);
        }
        continue;
      }
      p = this.cellF(v.ax, v.ay);
      var st = v.state || 'idle';
      var lunge = v.lunge > 0 ? Math.sin((1 - v.lunge / 0.24) * Math.PI) * m.tile * 0.3 : 0;
      var bob = st === 'idle' ? Math.sin(v.bob) * m.tile * 0.035 : 0;
      var size = m.tile * (mon.boss ? 1.42 : 0.92);
      var squash = st === 'attack' ? 1.08 : st === 'hit' ? 0.9 : 1;
      var texKey = 'cc_' + key + '_' + st, sprite = this.monPool[i];
      if (sprite.__texKey !== texKey) { sprite.setTexture(texKey); sprite.__texKey = texKey; }
      sprite.setPosition(p.x + lunge * v.ldx, p.y + bob + lunge * v.ldy)
        .setDisplaySize(size * squash, size / squash)
        .setVisible(true).setTint(0xffffff)
        .setAlpha(mon.hp <= 0 ? clamp(v.t / 0.42, 0, 1) : lightA);
      if (mon.hp > 0 && !mon.boss) {
        this.monHpBg[i].setPosition(p.x, p.y - m.tile * 0.46).setVisible(true);
        this.monHp[i].setPosition(p.x - 1, p.y - m.tile * 0.46)
          .setDisplaySize(Math.max(1, 22 * clamp(mon.hp / mon.maxHp, 0, 1)), 2);
        CC.setColorIfChanged(this.monHp[i], mon.elite ? 0xffd76d : 0x71e099);
        this.monHp[i].setVisible(true);
      }
      var mark = INTENT_MARK[mon.intent] || '';
      if (mark && mon.hp > 0) {
        this.monIntent[i].setText(mark).setPosition(p.x, p.y - m.tile * 0.76).setVisible(true)
          .setColor(mon.aiState === 'telegraph' ? '#ff9a6a' : '#ffcf80')
          .setScale(mon.aiState === 'telegraph' ? 1 + Math.sin(this.titleT * 14) * 0.12 : 1);
      }
      if (mon.elite && mon.hp > 0 && !mon.boss) this.monMark[i].setText('◆').setPosition(p.x + m.tile * 0.4, p.y - m.tile * 0.4).setVisible(true);
    }
    // Shrine chrome: offer icon plus price above the tile, no extra panel.
    var sh = s.shrine;
    if (sh && !sh.sold && s.level.seen[s.level.idx(sh.x, sh.y)]) {
      var sp = this.cell(sh.x, sh.y), lit = s.level.visible[s.level.idx(sh.x, sh.y)];
      this.shrineImage.setPosition(sp.x, sp.y).setDisplaySize(m.tile * 0.9, m.tile * 0.9).setVisible(true).setAlpha(lit ? 1 : 0.45);
      this.shrineIcon.setTexture(itemIconKey(s, sh.key)).setPosition(sp.x, sp.y - m.tile * 0.55 + Math.sin(this.titleT * 2.4) * 2)
        .setDisplaySize(m.tile * 0.6, m.tile * 0.6).setVisible(lit);
      CC.setTextIfChanged(this.shrinePrice, sh.price + 'g');
      this.shrinePrice.setPosition(sp.x, sp.y - m.tile * 0.82).setVisible(lit)
        .setColor(s.gold >= sh.price ? '#ffd76d' : '#ff9a78');
    } else {
      this.shrineImage.setVisible(false); this.shrineIcon.setVisible(false); this.shrinePrice.setVisible(false);
    }
    var anim = s.playerAnim, pv = s.player;
    var pp = this.cellF(pv.ax, pv.ay);
    var pState = anim.state === 'attack' ? 'cc_player_attack' : anim.state === 'hurt' ? 'cc_player_hurt'
      : anim.state === 'walk' ? 'cc_player_' + (Math.floor(anim.t * 26) % 2 ? 'walk1' : 'walk2') : 'cc_player_idle';
    var ox = 0, oy = 0, pscale = 1;
    if (anim.state === 'attack' && anim.max > 0) {
      // Anticipation, contact, recovery: the strike pulls back before it lands.
      var f = 1 - clamp(anim.t / anim.max, 0, 1);
      var reach = f < 0.3 ? -0.16 * (f / 0.3) : 0.36 * Math.sin(((f - 0.3) / 0.7) * Math.PI);
      ox = anim.dx * reach * m.tile; oy = anim.dy * reach * m.tile;
      pscale = 1 + (f < 0.3 ? -0.06 : 0.08 * Math.sin(((f - 0.3) / 0.7) * Math.PI));
    } else if (anim.state === 'hurt' && anim.max > 0) {
      pscale = 1 - 0.08 * clamp(anim.t / anim.max, 0, 1);
    }
    if (this.playerImage.__texKey !== pState) { this.playerImage.setTexture(pState); this.playerImage.__texKey = pState; }
    this.playerImage.setPosition(pp.x + ox, pp.y + oy)
      .setDisplaySize(m.tile * 0.96 * pscale, m.tile * 0.96 / pscale)
      .setVisible(s.mode === 'play' || s.mode === 'dead' || s.mode === 'won');
    var glowR = m.tile * (2.4 + clamp(s.torch / Math.max(1, s.torchMax), 0, 1) * 2.6);
    this.playerGlow.setPosition(pp.x, pp.y).setDisplaySize(glowR, glowR)
      .setVisible(s.mode === 'play').setAlpha(0.16 + 0.1 * this.flicker);
    this.playerRing.setPosition(m.boardX + pv.ax * m.tile + 1.5, m.boardY + pv.ay * m.tile + 1.5)
      .setSize(m.tile - 3, m.tile - 3).setVisible(s.mode === 'play');
    for (i = 0; i < this.highlightPool.length; i++) this.highlightPool[i].setVisible(false);
    if (s.mode === 'play') {
      var hi = 0;
      for (i = 0; i < ALL_DIRS.length && hi < 8; i++) {
        var hx = s.player.x + ALL_DIRS[i][0], hy = s.player.y + ALL_DIRS[i][1];
        if (!s.level.walkable(hx, hy)) continue;
        var foe = activeMonster(s, hx, hy), hp2 = this.highlightPool[hi++];
        hp2.setPosition(m.boardX + hx * m.tile + 2, m.boardY + hy * m.tile + 2).setSize(m.tile - 4, m.tile - 4)
          .setStrokeStyle(2, foe && !foe.dormant ? 0xff8d79 : 0x9ee6e9, foe && !foe.dormant ? 0.95 : 0.4).setVisible(true);
      }
    }
    if (boss && s.mode === 'play') {
      var bw = m.boardW - 16;
      this.bossBg.setVisible(true); this.bossFill.setVisible(true); this.bossName.setVisible(true);
      this.bossFill.setDisplaySize(Math.max(1, bw * clamp(boss.hp / boss.maxHp, 0, 1)), 6);
      CC.setTextIfChanged(this.bossName, (MON[boss.key] ? MON[boss.key].name : 'BOSS') + '  ·  PHASE ' + boss.phase);
    } else {
      this.bossBg.setVisible(false); this.bossFill.setVisible(false); this.bossName.setVisible(false);
    }
  };

  // ------------------------------------------------------------------- HUD
  CrawlScene.prototype.renderHud = function () {
    var s = this.state, m = this.metrics, i;
    var playing = s.mode === 'play';
    var meterW = Math.max(70, m.w - 118 - 108);
    var hudOn = s.mode !== 'title';
    this.depthText.setVisible(hudOn); this.scoreText.setVisible(hudOn); this.goldText.setVisible(hudOn);
    this.hpText.setVisible(hudOn); this.hpBg.setVisible(hudOn); this.hpFill.setVisible(hudOn);
    this.hungerBg.setVisible(hudOn); this.hungerFill.setVisible(hudOn); this.hungerWarning.setVisible(hudOn);
    this.torchBg.setVisible(hudOn); this.torchFill.setVisible(hudOn);
    this.hpIcon.setVisible(hudOn); this.hungerText.setVisible(hudOn); this.torchText.setVisible(hudOn);
    this.buffText.setVisible(hudOn); this.settingsText.setVisible(hudOn);
    this.chromeImage.setVisible(hudOn); this.boardImage.setVisible(hudOn);
    for (i = 0; i < SLOTS_MAX; i++) {
      var show = hudOn && i < (s.slots || 6) && !!s.inventory[i];
      this.slotBg[i].setVisible(hudOn && i < (s.slots || 6));
      this.slotIcon[i].setVisible(show); this.slotCount[i].setVisible(show);
      if (!show) continue;
      var slot = s.inventory[i];
      this.slotIcon[i].setTexture(itemIconKey(s, slot.key)).setDisplaySize(30, 30);
      CC.setTextIfChanged(this.slotCount[i], String(slot.n));
    }
    // renderTitle owns show AND hide for every menu object, so it runs on every
    // frame: skipping it while playing leaves the title screen painted on top.
    this.renderTitle();
    if (!hudOn) { this.renderTransients(false); this.renderEnd(); return; }
    CC.setTextIfChanged(this.depthText, (s.ascending ? '↑' : '↓') + s.depth + '/' + MAX_DEPTH);
    CC.setTextIfChanged(this.scoreText, '★ ' + s.score);
    CC.setTextIfChanged(this.goldText, '◆ ' + s.gold);
    CC.setTextIfChanged(this.hpText, '♥ ' + s.hp + '/' + s.maxHp);
    this.hpFill.setDisplaySize(Math.max(1, meterW * clamp(s.hp / s.maxHp, 0, 1)), 7);
    this.hungerFill.setDisplaySize(Math.max(1, meterW * clamp(s.hunger / s.hungerMax, 0, 1)), 7);
    this.hungerWarning.setDisplaySize(Math.max(1, meterW * 0.24), 7);
    this.hungerWarning.setFillStyle(s.hunger <= s.hungerMax * 0.24 ? 0xb64c4d : 0x663334);
    var torchFrac = clamp(s.torch / Math.max(1, s.torchMax), 0, 1);
    this.torchFill.setDisplaySize(Math.max(1, meterW * torchFrac), 7);
    this.torchFill.setFillStyle(torchFrac <= 0.25 ? 0xd9702f : 0xffb35d);
    var buffs = [];
    if (s.buffs.power > 0) buffs.push('⚔' + s.buffs.power);
    if (s.buffs.ward > 0) buffs.push('⛨' + s.buffs.ward);
    if (s.buffs.haste > 0) buffs.push('⏩' + s.buffs.haste);
    if (s.status.poison > 0) buffs.push('☠' + s.status.poison);
    CC.setTextIfChanged(this.buffText, buffs.join(' '));
    this.buffText.setColor(s.status.poison > 0 && !buffs.length ? '#9fd45c' : '#d8e7ef');
    this.renderTransients(playing);
    this.renderEnd();
  };
  CrawlScene.prototype.renderTransients = function (playing) {
    var s = this.state;
    var b = s.banner, bannerActive = playing && b && b.t > 0;
    var inspectActive = !bannerActive && playing && s.inspect && s.inspect.t > 0;
    var guideActive = !bannerActive && !inspectActive && playing && s.guide.t > 0;
    this.guideBg.setVisible(guideActive); this.guideText.setVisible(guideActive);
    if (guideActive) {
      var guide = s.guide.step === 0 ? 'TAP HIGHLIGHT TO MOVE · TAP SELF TO WAIT'
        : s.guide.step === 1 ? 'ENEMY TILE = ATTACK · SELF = WAIT'
        : s.guide.step === 2 ? 'WAIT PASSES TURN · WATCH HUNGER AND TORCH'
        : s.guide.step === 3 ? 'PACK TAP = USE · HOLD TILE = INSPECT'
        : 'STAND ON A SHRINE AND WAIT TO BUY';
      CC.setTextIfChanged(this.guideText, guide);
      var ga = kit.juice.enabled ? clamp(s.guide.t / 0.6, 0, 1) : 0.86;
      this.guideText.setAlpha(ga); this.guideBg.setAlpha(ga * 0.72);
    }
    this.inspectBg.setVisible(inspectActive); this.inspectText.setVisible(inspectActive);
    if (inspectActive) {
      CC.setTextIfChanged(this.inspectText, s.inspect.text);
      this.inspectText.setColor(s.inspect.color || '#e7f3f5');
      var ia = kit.juice.enabled ? clamp(s.inspect.t / 0.18, 0, 1) : 0.92;
      this.inspectText.setAlpha(ia); this.inspectBg.setAlpha(ia * 0.82);
    }
    this.bannerBg.setVisible(!!bannerActive); this.bannerTitle.setVisible(!!bannerActive);
    if (bannerActive) {
      var ba = kit.juice.enabled ? clamp(b.t / 0.18, 0, 1) : 0.92;
      this.bannerBg.setAlpha(ba * 0.86); this.bannerTitle.setAlpha(ba);
      this.bannerTitle.setColor(b.color);
      CC.setTextIfChanged(this.bannerTitle, b.text);
      var pop = b.t > b.max - 0.14 ? CC.easeOutBack(clamp((b.max - b.t) / 0.14, 0, 1)) : 1;
      this.bannerTitle.setScale(kit.juice.enabled ? 0.86 + 0.14 * pop : 1);
    }
  };

  // ------------------------------------------------------------ title screen
  CrawlScene.prototype.renderTitle = function () {
    var showing = this.state.mode === 'title', i;
    this.titleShade.setVisible(showing); this.titleArt.setVisible(showing); this.titleSub.setVisible(showing);
    this.trackBarBg.setVisible(showing); this.trackBarFill.setVisible(showing); this.trackText.setVisible(showing);
    this.startBtn.setVisible(showing); this.startText.setVisible(showing); this.titleBest.setVisible(showing);
    for (i = 0; i < this.titleCards.length; i++) {
      var c = this.titleCards[i];
      c.bg.setVisible(showing); c.mark.setVisible(showing); c.name.setVisible(showing);
      c.line.setVisible(showing); c.perk.setVisible(showing);
    }
    // Toggling Phaser interactivity every frame is wasted work: only flip it
    // when the screen actually changes.
    if (this.__titleLive !== showing) {
      this.__titleLive = showing;
      if (showing) this.startBtn.setInteractive(); else this.startBtn.disableInteractive();
    }
    if (!showing) return;
    // Staggered card entry plus a breathing crown: never a static screen.
    var t = this.titleT;
    this.titleArt.setScale((this.titleArt.displayWidth / 300) * (kit.juice.enabled ? 1 + Math.sin(t * 1.8) * 0.012 : 1));
    var toast = this.state.banner && this.state.banner.t > 0 ? this.state.banner : null;
    CC.setTextIfChanged(this.titleSub, toast ? toast.text : 'choose a delver');
    this.titleSub.setColor(toast ? toast.color : '#8fb0c2');
    for (i = 0; i < this.titleCards.length; i++) {
      var card = this.titleCards[i], key = CLASS_KEYS[i], spec = CLASSES[key];
      var unlocked = profile.unlockedKits.indexOf(key) >= 0;
      var selected = profile.selectedKit === key;
      var delay = clamp((t - 0.1 - i * 0.07) / 0.4, 0, 1);
      var slide = kit.juice.enabled ? (1 - CC.easeOutCubic(delay)) * 40 : 0;
      if (card.__baseX == null) card.__baseX = card.bg.x;
      var cardAlpha = kit.juice.enabled ? delay : 1;
      card.bg.setX(card.__baseX + slide).setAlpha(cardAlpha);
      card.mark.setX(card.__baseX + 26 + slide).setAlpha(cardAlpha);
      card.name.setX(card.__baseX + 50 + slide).setAlpha(cardAlpha);
      card.line.setX(card.__baseX + 50 + slide).setAlpha(cardAlpha);
      card.perk.setX(card.__baseX + 50 + slide).setAlpha(cardAlpha);
      card.bg.setFillStyle(selected ? 0x1b3a45 : unlocked ? 0x132030 : 0x0f1620, 1);
      card.bg.setStrokeStyle(2, selected ? 0x9ee6e9 : unlocked ? 0x2a4356 : 0x1d2836, 1);
      CC.setTextIfChanged(card.mark, spec.mark);
      card.mark.setColor(unlocked ? '#ffd76d' : '#4c5a68');
      CC.setTextIfChanged(card.name, unlocked ? spec.name.toUpperCase() : 'LOCKED');
      card.name.setColor(unlocked ? '#e6f2f6' : '#5d6b78');
      CC.setTextIfChanged(card.line, unlocked
        ? ('HP ' + spec.hp + ' · ATK ' + spec.atk[0] + '-' + spec.atk[1] + ' · PACK ' + spec.slots + ' · TORCH ' + spec.torch)
        : spec.unlockText);
      card.line.setColor(unlocked ? '#8fb0c2' : '#55636f');
      // The perk line is the reason to pick a class, so it never gets clipped:
      // it is trimmed to the measured card width instead.
      var perkText = unlocked ? spec.perk : spec.desc;
      var budget = Math.max(10, Math.floor((card.__wrap || 240) / 6.6));
      if (perkText.length > budget) perkText = perkText.slice(0, budget - 1) + '…';
      CC.setTextIfChanged(card.perk, perkText);
      card.perk.setColor(unlocked ? '#6f8a9c' : '#4e5a66');
    }
    var next = nextTrackTier();
    var prev = 0;
    for (i = 0; i < TRACK.length; i++) if (TRACK[i].at <= profile.shards) prev = TRACK[i].at;
    var frac = next ? clamp((profile.shards - prev) / Math.max(1, next.at - prev), 0, 1) : 1;
    this.trackBarFill.setDisplaySize(Math.max(2, this.trackBarBg.displayWidth * frac), 8);
    CC.setTextIfChanged(this.trackText, next
      ? ('◈ ' + profile.shards + ' SHARDS · NEXT ' + next.name.toUpperCase() + ' AT ' + next.at)
      : ('◈ ' + profile.shards + ' SHARDS · TRACK COMPLETE'));
    CC.setTextIfChanged(this.titleBest, 'BEST ' + profile.best + ' · RUNS ' + profile.runs + ' · ESCAPES ' + profile.escapes);
    this.startText.setScale(kit.juice.enabled ? 1 + Math.sin(t * 3.4) * 0.03 : 1);
  };
  CrawlScene.prototype.pickClass = function (index) {
    if (this.state.mode !== 'title' || this.wipe) return;
    var key = CLASS_KEYS[index];
    if (!key || profile.unlockedKits.indexOf(key) < 0) {
      CC.audio(kit, 'hurt', { volume: 0.4 });
      queueTransient(this.state, (CLASSES[key] ? CLASSES[key].unlockText.toUpperCase() : 'LOCKED'), '#ff9a78');
      return;
    }
    profile.selectedKit = key; saveProfile();
    CC.audio(kit, 'pickup');
    this.motesScreen(this.titleCards[index].bg.x + 30, this.titleCards[index].bg.y, 0x9ee6e9, 6);
  };
  CrawlScene.prototype.openTitle = function () {
    var self = this;
    this.beginWipe(function () {
      self.state.mode = 'title';
      self.titleT = 0; self.endT = 0;
      self.state.dirty = true;
      playMusic('theme');
    });
  };
  CrawlScene.prototype.startRun = function () {
    var self = this;
    if (this.wipe) return;
    CC.audio(kit, 'stairs');
    this.beginWipe(function () { self.hardRestart(1, true); });
  };

  // -------------------------------------------------------------- end screen
  CrawlScene.prototype.beginEndCeremony = function (s) {
    this.endT = 0;
    void s;
  };
  CrawlScene.prototype.renderEnd = function () {
    var s = this.state, ended = s.mode === 'dead' || s.mode === 'won';
    this.endShade.setVisible(ended); this.endPanel.setVisible(ended); this.endTitle.setVisible(ended);
    this.endText.setVisible(ended); this.endHint.setVisible(ended); this.endMedal.setVisible(ended);
    this.endShardText.setVisible(ended); this.classBtn.setVisible(ended); this.classBtnText.setVisible(ended);
    if (this.__endLive !== ended) {
      this.__endLive = ended;
      if (ended) { this.endHit.setInteractive(); this.classBtn.setInteractive(); }
      else { this.endHit.disableInteractive(); this.classBtn.disableInteractive(); }
    }
    this.endHit.setVisible(ended);
    if (!ended) return;
    // The ceremony rises rather than cutting: shade, panel, then the numbers.
    var t = clamp(this.endT, 0, 1.4);
    var ease = kit.juice.enabled ? CC.easeOutBack(clamp(t / 0.45, 0, 1)) : 1;
    var fade = kit.juice.enabled ? clamp(t / 0.3, 0, 1) : 1;
    this.endShade.setAlpha(0.9 * fade);
    this.endPanel.setAlpha(0.96 * fade).setScale(0.8 + 0.2 * ease);
    this.endTitle.setAlpha(fade).setScale(0.8 + 0.2 * ease);
    this.endMedal.setAlpha(fade).setTint(s.mode === 'won' ? 0xffd76d : 0x8fa2b8)
      .setAngle(kit.juice.enabled ? Math.sin(this.titleT * 2) * 6 : 0);
    var textFade = kit.juice.enabled ? clamp((t - 0.35) / 0.3, 0, 1) : 1;
    this.endText.setAlpha(textFade); this.endShardText.setAlpha(textFade);
    this.endHint.setAlpha(kit.juice.enabled ? clamp((t - 0.6) / 0.3, 0, 1) * (0.6 + 0.4 * Math.abs(Math.sin(this.titleT * 2))) : 1);
    this.classBtn.setAlpha(textFade); this.classBtnText.setAlpha(textFade);
    CC.setTextIfChanged(this.endTitle, s.mode === 'won' ? 'ESCAPED' : 'PERMADEATH');
    this.endTitle.setColor(s.mode === 'won' ? '#ffd76d' : '#ff8d79');
    var unlockedLines = (s.trackUnlocked || []).map(function (row) { return '◈ ' + row.name.toUpperCase() + ' · ' + row.desc; }).join('\n');
    CC.setTextIfChanged(this.endShardText, '◈ +' + (s.shardsEarned || 0) + ' SHARDS  (' + profile.shards + ' banked)');
    var spec = CLASSES[s.classKey] || CLASSES.wayfarer;
    CC.setTextIfChanged(this.endText,
      (s.mode === 'won' ? 'The Crown returns to daylight.' : 'Lost to ' + s.deathBy + '.') +
      '\n' + spec.name.toUpperCase() + ' · DEPTH ' + s.maxDepth + ' · KILLS ' + s.kills +
      '\nSCORE ' + s.finalScore + '  ·  BEST ' + profile.best +
      (s.bossKills ? '\nBOSSES FELLED ' + s.bossKills : '') +
      (unlockedLines ? '\n\n' + unlockedLines : ''));
  };

  // ------------------------------------------------------------------- FX
  // Five pooled particle systems (sparks, dust, motes, embers, rings) plus a
  // baked shockwave ring. Nothing here allocates a display object at runtime.
  CrawlScene.prototype.takeFrom = function (pool) {
    for (var i = 0; i < pool.length; i++) if (!pool[i].visible) return pool[i];
    return null;
  };
  CrawlScene.prototype.spawnParticle = function (pool, x, y, color, opts) {
    if (this.particles.length >= MAX_PARTICLES) return;
    var img = this.takeFrom(pool);
    if (!img) return;
    img.setTint(color).setVisible(true).setAlpha(1).setScale(opts.scale || 1);
    // Records come from a pre-warmed free list: no object is allocated during
    // play, which is what removed the GC spikes under 4x CPU throttle.
    var rec = this.particleRecords.length ? this.particleRecords.pop() : { image: null, x: 0, y: 0, vx: 0, vy: 0, g: 0, t: 0, max: 0 };
    rec.image = img; rec.x = x; rec.y = y; rec.vx = opts.vx; rec.vy = opts.vy;
    rec.g = opts.g == null ? 60 : opts.g; rec.t = opts.life; rec.max = opts.life;
    this.particles.push(rec);
  };
  CrawlScene.prototype.burstAt = function (x, y, color, count) {
    if (!this.metrics) return;
    var allowed = Math.ceil(count * (kit.juice.enabled ? 1 : 0.35) * (this.quality ? 1 : 0.5));
    for (var i = 0; i < allowed; i++) {
      var a = Math.random() * TAU, sp = 1.4 + Math.random() * 2.2;
      this.spawnParticle(this.particlePool, x, y, color, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 0.35 + Math.random() * 0.25
      });
    }
  };
  CrawlScene.prototype.emitDust = function (x, y, color, count) {
    if (!this.metrics) return;
    var allowed = Math.ceil(count * (kit.juice.enabled ? 1 : 0.35) * (this.quality ? 1 : 0.5));
    for (var i = 0; i < allowed; i++) {
      var a = Math.random() * TAU, sp = 0.5 + Math.random() * 1.2;
      this.spawnParticle(this.dustPool, x, y, color, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.4, g: 20, life: 0.22 + Math.random() * 0.18
      });
    }
  };
  CrawlScene.prototype.motesAt = function (x, y, color, count) {
    if (!this.metrics) return;
    var allowed = Math.ceil(count * (kit.juice.enabled ? 1 : 0.4));
    for (var i = 0; i < allowed; i++) {
      this.spawnParticle(this.motePool, x, y, color, {
        vx: (Math.random() * 2 - 1) * 0.7, vy: -0.8 - Math.random() * 0.9, g: -12,
        life: 0.6 + Math.random() * 0.4, scale: 0.7 + Math.random() * 0.6
      });
    }
  };
  CrawlScene.prototype.motesScreen = function (px, py, color, count) {
    if (!this.metrics) return;
    var m = this.metrics;
    var gx = (px - m.boardX) / m.tile - 0.5, gy = (py - m.boardY) / m.tile - 0.5;
    this.motesAt(gx, gy, color, count);
  };
  CrawlScene.prototype.dustAt = function (x, y) {
    this.emitDust(x, y, this.state.level.band.accent, 5);
  };
  CrawlScene.prototype.enemyFx = function (key, x, y, defeated) {
    var spec = MON[key], color = spec ? spec.col : 0xffffff;
    var family = spec ? spec.family : 'beast';
    var secondary = family === 'ooze' ? 8 : family === 'armour' ? 4 : family === 'ranged' ? 3 : 5;
    this.emitDust(x, y, color, secondary + (defeated ? 3 : 0));
    if (family === 'rogue' || family === 'caster') this.motesAt(x, y, 0x9ee6e9, 3);
    if (defeated) this.motesAt(x, y, color, 4);
  };
  CrawlScene.prototype.arrowFx = function (fx, fy, tx, ty, color) {
    if (!kit.juice.enabled) return;
    var steps = Math.max(2, Math.min(7, Math.round(Math.max(Math.abs(tx - fx), Math.abs(ty - fy)))));
    for (var i = 1; i <= steps; i++) {
      var f = i / (steps + 1);
      this.spawnParticle(this.motePool, fx + (tx - fx) * f, fy + (ty - fy) * f, color, {
        vx: 0, vy: 0, g: 0, life: 0.12 + f * 0.16, scale: 0.9
      });
    }
  };
  CrawlScene.prototype.shockRing = function (x, y, color, radius) {
    for (var i = 0; i < this.rings.length; i++) {
      var r = this.rings[i];
      if (r.t > 0) continue;
      r.t = 0.5; r.max = 0.5; r.r = radius; r.x = x; r.y = y;
      r.img.setTint(color).setVisible(true).setAlpha(0.9);
      return;
    }
  };
  CrawlScene.prototype.ambientEmbers = function (dt) {
    if (!kit.juice.enabled || !this.quality || !this.state || this.state.mode !== 'play') return;
    this.emberT -= dt;
    if (this.emberT > 0) return;
    this.emberT = 0.3;
    if (this.particles.length > MAX_PARTICLES * 0.6) return;
    var s = this.state, r = sightRadius(s);
    var x = s.player.x + (Math.random() * 2 - 1) * r * 0.7;
    var y = s.player.y + (Math.random() * 2 - 1) * r * 0.7;
    var gx = Math.round(x), gy = Math.round(y);
    if (gx < 0 || gy < 0 || gx >= CC.MAPW || gy >= CC.MAPH) return;
    if (!s.level.visible[s.level.idx(gx, gy)]) return;
    this.spawnParticle(this.emberPool, x, y, s.level.band.accent, {
      vx: (Math.random() * 2 - 1) * 0.25, vy: -0.35 - Math.random() * 0.3, g: -6,
      life: 1.1 + Math.random() * 0.7, scale: 0.7 + Math.random() * 0.5
    });
  };
  CrawlScene.prototype.pickupFx = function (label, color) {
    queueTransient(this.state, label, color);
    if (kit.juice.enabled) this.tweens.add({ targets: [this.goldText], scale: 1.1, duration: 90, yoyo: true, ease: 'Quad.Out' });
  };
  CrawlScene.prototype.hitJolt = function (mag) {
    if (!kit.juice.enabled) return;
    kit.juice.shake(mag || 2, 90); kit.juice.hitStop(45);
  };
  CrawlScene.prototype.medalCelebration = function (tier) {
    var s = this.state, color = tier === 'gold' ? 0xffd76d : tier === 'silver' ? 0xd6e2ea : 0xd0965c;
    this.shockRing(s.player.x, s.player.y, color, 2.2);
    this.motesAt(s.player.x, s.player.y, color, tier === 'gold' ? 12 : 8);
    this.burstAt(s.player.x, s.player.y, color, tier === 'gold' ? 16 : 10);
    CC.audio(kit, 'shard', { rate: tier === 'gold' ? 1 : tier === 'silver' ? 0.92 : 0.84 });
  };
  CrawlScene.prototype.bossIntro = function (key) {
    var spec = MON[key] || MON.slagmaw;
    showBanner(this.state, spec.name.toUpperCase(), 'BOSS FLOOR', hex(spec.col));
    CC.audio(kit, 'boss');
    if (kit.juice.enabled) kit.juice.shake(5, 420);
    var sp = this.state.level.special;
    this.shockRing(sp.x, sp.y, spec.col, 4);
  };
  CrawlScene.prototype.bossDefeat = function (x, y, color) {
    // The biggest in-play celebration in the game: three staged rings, a wide
    // burst, and a long shake, all still inside the juice budget.
    this.shockRing(x, y, color, 2.2);
    this.shockRing(x, y, 0xffd76d, 3.4);
    this.shockRing(x, y, 0xffffff, 4.6);
    this.burstAt(x, y, color, 28);
    this.motesAt(x, y, 0xffd76d, 16);
    if (kit.juice.enabled) { kit.juice.shake(7, 480); kit.juice.hitStop(120); }
  };
  CrawlScene.prototype.crownCeremony = function (x, y) {
    this.shockRing(x, y, 0xffd76d, 3.2);
    this.shockRing(x, y, 0xfff3c6, 4.8);
    this.burstAt(x, y, 0xffd76d, 32);
    this.motesAt(x, y, 0xfff3c6, 20);
    if (kit.juice.enabled) kit.juice.shake(6, 520);
  };
  CrawlScene.prototype.beginFloorTransition = function () {
    if (!this.transitionShade) return;
    var dur = kit.juice.enabled ? 260 : 90;
    this.transitionShade.setVisible(true).setAlpha(0.92);
    this.tweens.add({
      targets: this.transitionShade, alpha: 0, duration: dur, ease: 'Quad.Out',
      onComplete: function () { this.transitionShade.setVisible(false); }.bind(this)
    });
  };
  CrawlScene.prototype.playBandAudio = function (band) {
    playMusic('ambience-' + band);
  };
  // Screen-to-screen moves are wiped, never cut: nine bars close, the callback
  // swaps state behind them, then they open again.
  CrawlScene.prototype.beginWipe = function (cb) {
    if (this.wipe) return;
    this.wipe = { t: 0, phase: 'in', cb: cb, dur: kit.juice.enabled ? 0.3 : 0.12 };
    for (var i = 0; i < this.wipeBars.length; i++) this.wipeBars[i].setVisible(true).setScale(0, 1);
  };
  CrawlScene.prototype.updateWipe = function (dt) {
    var wp = this.wipe;
    if (!wp) return false;
    wp.t += dt;
    var n = this.wipeBars.length, i, bar, f;
    var stagger = kit.juice.enabled ? 0.06 : 0;
    for (i = 0; i < n; i++) {
      bar = this.wipeBars[i];
      var d = (i % 2 === 0 ? i : n - 1 - i) * stagger / n;
      f = clamp((wp.t - d) / wp.dur, 0, 1);
      var amount = wp.phase === 'in' ? CC.easeOutCubic(f) : 1 - CC.easeOutCubic(f);
      bar.setOrigin(i % 2 === 0 ? 0 : 1, 0);
      bar.setX(i % 2 === 0 ? 0 : this.metrics.w);
      bar.setScale(amount, 1);
    }
    if (wp.t >= wp.dur + stagger) {
      if (wp.phase === 'in') {
        wp.phase = 'out'; wp.t = 0;
        if (wp.cb) { var cb = wp.cb; wp.cb = null; cb(); }
      } else {
        for (i = 0; i < n; i++) this.wipeBars[i].setVisible(false);
        this.wipe = null;
      }
    }
    return true;
  };

  CrawlScene.prototype.updateVisuals = function (dt) {
    var s = this.state, i;
    this.titleT += dt;
    if (s.mode === 'dead' || s.mode === 'won') this.endT += dt;
    if (s.banner) {
      s.banner.t -= dt;
      if (s.banner.t <= 0) s.banner = s.bannerQueue && s.bannerQueue.length ? s.bannerQueue.shift() : null;
    }
    var bannerActive = s.banner && s.banner.t > 0;
    if (!bannerActive && s.inspect && s.inspect.t > 0) s.inspect.t -= dt;
    if (!bannerActive && !(s.inspect && s.inspect.t > 0) && s.guide.t > 0) s.guide.t -= dt;
    if (s.playerAnim && s.playerAnim.t > 0) {
      s.playerAnim.t -= dt;
      if (s.playerAnim.t <= 0) s.playerAnim.state = 'idle';
    }
    // Tile-step interpolation: actors slide between cells instead of snapping.
    approach(s.player, s.player.x, s.player.y, dt);
    for (i = 0; i < s.monsters.length; i++) {
      var mon = s.monsters[i], v = s.monsterViews[mon.id];
      if (!v) continue;
      approach(v, mon.x, mon.y, dt);
      if (v.t > 0) { v.t -= dt; if (v.t <= 0) v.state = 'idle'; }
      if (v.lunge > 0) v.lunge -= dt;
      v.bob += dt * 3.4;
    }
    for (i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      p.t -= dt;
      if (p.t <= 0) {
        p.image.setVisible(false); p.image = null;
        this.particles.splice(i, 1); this.particleRecords.push(p);
        continue;
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt / 60;
      p.image.setPosition(this.metrics.boardX + (p.x + 0.5) * this.metrics.tile,
        this.metrics.boardY + (p.y + 0.5) * this.metrics.tile).setAlpha(clamp(p.t / p.max, 0, 1));
    }
    for (i = 0; i < this.rings.length; i++) {
      var r = this.rings[i];
      if (r.t <= 0) continue;
      r.t -= dt;
      if (r.t <= 0) { r.img.setVisible(false); continue; }
      var f = 1 - r.t / r.max, size = this.metrics.tile * r.r * 2 * (0.25 + f * 0.95);
      var c = this.cell(r.x, r.y);
      r.img.setPosition(c.x, c.y).setDisplaySize(size, size).setAlpha((1 - f) * 0.9);
    }
    this.ambientEmbers(dt);
    this.flicker = kit.juice.enabled ? 0.94 + Math.random() * 0.06 : 1;
    compactDead(s);
  };
  function approach(v, tx, ty, dt) {
    if (v.ax == null) { v.ax = tx; v.ay = ty; return; }
    if (Math.abs(v.ax - tx) + Math.abs(v.ay - ty) > 2.4) { v.ax = tx; v.ay = ty; return; }
    var k = Math.min(1, dt / 0.085);
    v.ax += (tx - v.ax) * k;
    v.ay += (ty - v.ay) * k;
  }

  // ----------------------------------------------------------------- input
  CrawlScene.prototype.applyForceEvent = function (event) {
    if (!event || !this.state) return;
    var s = this.state;
    if (s.mode === 'title') s.mode = 'play';
    if (event === 'crown') {
      s.depth = MAX_DEPTH; s.maxDepth = MAX_DEPTH; s.ascending = false;
      startFloor(s, MAX_DEPTH, false);
      for (var i = 0; i < s.monsters.length; i++) killMonster(s, s.monsters[i]);
      compactDead(s);
      s.player.x = s.level.special.x; s.player.y = s.level.special.y;
      s.player.ax = s.player.x; s.player.ay = s.player.y;
      collect(s);
    } else if (event === 'boss') {
      s.depth = 5; s.maxDepth = 5; s.ascending = false; startFloor(s, 5, false);
    } else if (event === 'shrine') {
      if (!s.shrine) s.shrine = { x: s.player.x, y: s.player.y, key: 'torch', price: 1, sold: false };
      s.shrine.x = s.player.x; s.shrine.y = s.player.y; s.shrine.sold = false;
      s.level.set(s.player.x, s.player.y, T.SHRINE); s.gold += 200;
    } else if (event === 'floor-clear') {
      for (var j = 0; j < s.monsters.length; j++) killMonster(s, s.monsters[j]);
      compactDead(s); checkFloorClear(s);
    } else if (event === 'escape') {
      s.hasCrown = true; s.depth = 1; s.ascending = true; win(s);
    } else if (event === 'title') {
      s.mode = 'title'; this.titleT = 0;
    } else if (event === 'tutorial') {
      s.guide.step = 0; s.guide.max = 3.5; s.guide.t = 3.5;
    }
    s.dirty = true;
  };
  CrawlScene.prototype.hardRestart = function (forcedDepth, skipTitle) {
    this.clearTouches(); this.keyLatch = {};
    for (var i = 0; i < this.particles.length; i++) {
      this.particles[i].image.setVisible(false); this.particles[i].image = null;
      this.particleRecords.push(this.particles[i]);
    }
    this.particles.length = 0;
    for (i = 0; i < this.rings.length; i++) { this.rings[i].t = 0; this.rings[i].img.setVisible(false); }
    this.endT = 0; this.titleT = 0;
    this.state = makeState(this, forcedDepth || 1);
    root.__cc.state = this.state;
    startFloor(this.state, forcedDepth || 1, false);
    this.lastProbe = readProbe();
    // A first-time player meets the title screen; a restart from the run-end
    // screen drops straight back into a run with the class they already chose.
    var forced = this.lastProbe.floor != null || this.lastProbe.event != null;
    if (!skipTitle && !forced && this.hasBooted) this.state.mode = 'play';
    else if (!skipTitle && !forced) { this.state.mode = 'title'; playMusic('theme'); }
    this.hasBooted = true;
    if (this.state.mode === 'play') this.playBandAudio(this.state.level.boss ? 'boss' : this.state.level.band.key);
    this.state.dirty = true;
    var event = this.lastProbe.event;
    if (event) this.applyForceEvent(event);
  };
  CrawlScene.prototype.clearTouches = function () {
    this.touch = {};
    if (kit && kit.input) kit.input.clearAll();
  };
  CrawlScene.prototype.claimPointer = function (pointer) {
    var id = pointer.id == null ? 0 : pointer.id, ev = pointer.event || {};
    if (!kit.input.pointers.has(id)) {
      kit.input.pointers.set(id, {
        x: ev.clientX || pointer.x, y: ev.clientY || pointer.y,
        startX: ev.clientX || pointer.x, startY: ev.clientY || pointer.y,
        downAt: performance.now(), zone: null
      });
    }
    var p = kit.input.pointers.get(id);
    if (p) p.zone = 'corridor-crawl';
  };
  CrawlScene.prototype.attachInput = function () {
    var self = this;
    this.input.on('pointerdown', function (pointer) {
      if (!self.state || self.state.mode !== 'play' || kit.paused || self.simPaused || self.wipe) return;
      self.claimPointer(pointer);
      var m = self.metrics;
      if (pointer.x >= m.boardX && pointer.x < m.boardX + m.boardW && pointer.y >= m.boardY && pointer.y < m.boardY + m.boardH) {
        self.touch[pointer.id] = { type: 'board', x: pointer.x, y: pointer.y, at: performance.now() };
      }
    });
    this.input.on('pointerup', function (pointer) { self.releasePointer(pointer); });
    this.input.on('pointerupoutside', function (pointer) { self.releasePointer(pointer); });
  };
  CrawlScene.prototype.releasePointer = function (pointer) {
    var touch = this.touch[pointer.id];
    if (!touch) return;
    delete this.touch[pointer.id];
    var elapsed = performance.now() - touch.at;
    if (!this.state || this.state.mode !== 'play' || kit.paused || this.simPaused || this.wipe) return;
    if (elapsed > 420) {
      if (touch.type === 'slot') this.inspectSlot(touch.index); else this.inspectTile(touch.x, touch.y);
      return;
    }
    if (touch.type === 'slot') { useItem(this.state, touch.index); return; }
    var m = this.metrics;
    var x = Math.floor((touch.x - m.boardX) / m.tile), y = Math.floor((touch.y - m.boardY) / m.tile);
    var dx = clamp(x - this.state.player.x, -1, 1), dy = clamp(y - this.state.player.y, -1, 1);
    if (x === this.state.player.x && y === this.state.player.y) moveAction(this.state, 0, 0);
    else if (CC.dist(x, y, this.state.player.x, this.state.player.y) === 1) moveAction(this.state, dx, dy);
    else log(this.state, 'TAP AN ADJACENT HIGHLIGHT', '#778b9b');
    this.state.dirty = true;
  };
  CrawlScene.prototype.inspectSlot = function (index) {
    var s = this.state, slot = s.inventory[index];
    if (!slot) return;
    var kind = itemKind(slot.key), known = !!s.identified[slot.key];
    var label = (known || kind === 'food' || kind === 'tool' || kind === 'crown')
      ? itemName(s, slot.key).replace('Potion of ', '').replace('Scroll of ', '') : 'UNKNOWN';
    s.inspect = { t: 1, max: 1, text: 'PACK ' + (index + 1) + ' · ' + label + ' · ' + itemShort(s, slot.key), color: hex(itemColor(s, slot.key)) };
  };
  CrawlScene.prototype.inspectTile = function (x, y) {
    var s = this.state, m = this.metrics;
    var tx = Math.floor((x - m.boardX) / m.tile), ty = Math.floor((y - m.boardY) / m.tile);
    if (tx < 0 || ty < 0 || tx >= CC.MAPW || ty >= CC.MAPH) return;
    var idx = s.level.idx(tx, ty);
    if (!s.level.seen[idx]) { s.inspect = { t: 1, max: 1, text: 'FOG · UNSEEN', color: '#778b9b' }; return; }
    var mon = activeMonster(s, tx, ty), item = null;
    for (var i = 0; i < s.items.length; i++) if (s.items[i].x === tx && s.items[i].y === ty) item = s.items[i];
    var tile = s.level.at(tx, ty), text;
    if (mon && !mon.dormant) {
      var spec = MON[mon.key] || MON.rat;
      text = spec.name.toUpperCase() + ' · HP ' + mon.hp + '/' + mon.maxHp + ' · ' + spec.tell;
    } else if (s.shrine && !s.shrine.sold && s.shrine.x === tx && s.shrine.y === ty) {
      text = 'SHRINE · ' + itemName(s, s.shrine.key).toUpperCase() + ' · ' + s.shrine.price + 'g · WAIT HERE TO BUY';
    } else if (item) {
      text = 'ITEM · ' + itemName(s, item.key).replace('Potion of ', '').replace('Scroll of ', '') + ' · ' + itemShort(s, item.key);
    } else {
      text = tile === T.UP ? '↑ ASCENT STAIRS' : tile === T.DOWN ? '↓ DESCENT STAIRS'
        : tile === T.WATER ? 'SUMP WATER' : tile === T.EMBER ? 'HOT SLAG' : tile === T.BONES ? 'OLD BONES' : 'FLOOR';
    }
    s.inspect = { t: 1, max: 1, text: text, color: mon && !mon.dormant ? '#ffcf80' : '#e7f3f5' };
  };
  function readGamepadDirection() {
    var nav = root.navigator;
    if (!nav || typeof nav.getGamepads !== 'function') return null;
    var pads = nav.getGamepads(), pad = null;
    for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { pad = pads[i]; break; }
    if (!pad) return null;
    var buttons = pad.buttons || [];
    var dpad = buttons[12] && buttons[12].pressed ? { code: 'pad-up', dx: 0, dy: -1 }
      : buttons[13] && buttons[13].pressed ? { code: 'pad-down', dx: 0, dy: 1 }
      : buttons[14] && buttons[14].pressed ? { code: 'pad-left', dx: -1, dy: 0 }
      : buttons[15] && buttons[15].pressed ? { code: 'pad-right', dx: 1, dy: 0 } : null;
    if (dpad) return dpad;
    var ax = Number(pad.axes && pad.axes[0]) || 0, ay = Number(pad.axes && pad.axes[1]) || 0;
    if (Math.max(Math.abs(ax), Math.abs(ay)) < 0.55) return null;
    if (Math.abs(ax) >= Math.abs(ay)) return ax < 0 ? { code: 'pad-left', dx: -1, dy: 0 } : { code: 'pad-right', dx: 1, dy: 0 };
    return ay < 0 ? { code: 'pad-up', dx: 0, dy: -1 } : { code: 'pad-down', dx: 0, dy: 1 };
  }
  CrawlScene.prototype.consumeTitleKeys = function () {
    var confirm = kit.input.keyDown('Space') || kit.input.keyDown('Enter') || kit.input.keyDown('NumpadEnter');
    if (confirm && !this.keyLatch.confirm) { this.keyLatch.confirm = true; this.startRun(); }
    if (!confirm) this.keyLatch.confirm = false;
    var up = kit.input.keyDown('ArrowUp') || kit.input.keyDown('KeyW');
    var down = kit.input.keyDown('ArrowDown') || kit.input.keyDown('KeyS');
    var moved = up || down;
    if (moved && !this.keyLatch.titleMove) {
      var idx = CLASS_KEYS.indexOf(profile.selectedKit);
      for (var step = 0; step < CLASS_KEYS.length; step++) {
        idx = (idx + (up ? -1 : 1) + CLASS_KEYS.length) % CLASS_KEYS.length;
        if (profile.unlockedKits.indexOf(CLASS_KEYS[idx]) >= 0) break;
      }
      this.pickClass(idx);
    }
    this.keyLatch.titleMove = moved;
  };
  CrawlScene.prototype.consumeKeys = function () {
    if (kit.paused || this.wipe) return;
    if (this.state.mode === 'title') return this.consumeTitleKeys();
    var restartKey = kit.input.keyDown('KeyR');
    if (restartKey && !this.keyLatch.restart) { kit.restart(); this.keyLatch.restart = true; }
    if (!restartKey) this.keyLatch.restart = false;
    var muteKey = kit.input.keyDown('KeyM');
    if (muteKey && !this.keyLatch.mute) { kit.audio.setMute(!kit.audio.prefs.mute); this.keyLatch.mute = true; }
    if (!muteKey) this.keyLatch.mute = false;
    if (this.state.mode !== 'play') return;
    var map = { ArrowUp: [0, -1], KeyW: [0, -1], KeyK: [0, -1], ArrowRight: [1, 0], KeyD: [1, 0], KeyL: [1, 0],
      ArrowDown: [0, 1], KeyS: [0, 1], KeyJ: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], KeyH: [-1, 0],
      KeyQ: [-1, -1], KeyE: [1, -1], KeyZ: [-1, 1], KeyC: [1, 1] };
    var chosen = null, code;
    for (code in map) if (kit.input.keyDown(code)) { chosen = { code: code, dx: map[code][0], dy: map[code][1] }; break; }
    var gamepad = readGamepadDirection();
    if (!chosen && gamepad) chosen = gamepad;
    this.lastGamepadCode = gamepad ? gamepad.code : null;
    var acted = false;
    if (chosen && !this.keyLatch.move) { moveAction(this.state, chosen.dx, chosen.dy); acted = true; }
    this.keyLatch.move = !!chosen;
    var wait = kit.input.keyDown('Space') || kit.input.keyDown('Period');
    if (!acted && wait && !this.keyLatch.wait) { moveAction(this.state, 0, 0); acted = true; }
    this.keyLatch.wait = !!wait;
    if (!acted) {
      for (var i = 1; i <= SLOTS_MAX; i++) {
        var key = 'Digit' + i, pressed = kit.input.keyDown(key);
        if (pressed && !this.keyLatch[key]) { useItem(this.state, i - 1); this.keyLatch[key] = true; acted = true; }
        if (!pressed) this.keyLatch[key] = false;
      }
    }
  };

  CrawlScene.prototype.update = function (time, delta) {
    if (!this.state) return;
    var juiceFrame = kit.juice.frame();
    if (this.cameras && this.cameras.main) this.cameras.main.setScroll(juiceFrame.dx, juiceFrame.dy);
    var dt = Math.min(Math.max(delta || 0, 0), 50) / 1000;
    // Quality tier: heavy ambient FX drop out before the frame budget does.
    this.frameAvg = this.frameAvg * 0.92 + Math.min(delta || 16, 60) * 0.08;
    this.qualityT += dt;
    if (this.qualityT > 1) { this.qualityT = 0; this.quality = this.frameAvg > 21 ? 0 : 1; }
    var probe = readProbe();
    if (probe.floor !== this.lastProbe.floor && probe.floor != null) { this.lastProbe = probe; this.hardRestart(probe.floor, true); return; }
    if (probe.event && probe.event !== this.lastProbe.event) { this.lastProbe.event = probe.event; this.applyForceEvent(probe.event); }
    if (this.updateWipe(dt)) {
      this.updateVisuals(dt);
      this.renderWorld(); this.renderHud();
      return;
    }
    if (kit.paused || this.simPaused) return;
    if (juiceFrame.frozen) return;
    this.consumeKeys();
    this.updateVisuals(dt);
    root.__cc.state = this.state;
    if (this.state.dirty) { this.drawBoard(); this.state.dirty = false; }
    this.renderWorld(); this.renderHud();
  };

  Game.phaser = new Phaser.Game({
    type: Phaser.AUTO, parent: document.body, backgroundColor: '#070b12', pixelArt: true,
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%', autoCenter: Phaser.Scale.CENTER_BOTH },
    render: Object.assign({}, GGKit.renderDefaults, { pixelArt: true, roundPixels: true }),
    scene: [CrawlScene], fps: { min: 30, target: 60, forceSetTimeOut: false }
  });
  function syncHiDpi(game) {
    var cssW = Math.max(1, Math.floor(document.documentElement.clientWidth || window.innerWidth || 1));
    var cssH = Math.max(1, Math.floor(document.documentElement.clientHeight || window.innerHeight || 1));
    GGKit.hiDpi.resize(game, cssW, cssH);
  }
  syncHiDpi(Game.phaser);
  window.addEventListener('resize', function () { syncHiDpi(Game.phaser); });
  window.addEventListener('orientationchange', function () { syncHiDpi(Game.phaser); });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) syncHiDpi(Game.phaser);
  });
})(window);
