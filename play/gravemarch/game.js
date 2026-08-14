/* Gravemarch, fleet F12 dungeon build.
 * Phaser presents an authored room. GGKit owns lifecycle, input, saves, audio,
 * reduced motion, and PWA registration. Simulation records never hold views.
 */
(function () {
  'use strict';

  var Phaser = window.Phaser;
  var W = 390, H = 844, TILE = 32, MAP_X = 19, MAP_Y = 182;
  var STEP = 1 / 60, MAX_STEPS = 4, TAU = Math.PI * 2;
  var ARENA = { left: MAP_X, top: MAP_Y, right: MAP_X + TILE * 11, bottom: MAP_Y + TILE * 16 };
  var MAX_ENEMIES = 16, MAX_HAZARDS = 20, MAX_FX = 140, MAX_NUMBERS = 28;
  var BOSS_FLOORS = [10, 20, 30];
  var BOUNDARY_KEYS = ['boundaryShade', 'boundaryCard', 'boundaryKicker', 'boundaryTitle', 'boundaryBody', 'primaryBg', 'primary', 'secondaryBg', 'secondary'];
  var PAL = {
    ink: 0x080b14, paper: 0xf3eedf, mist: 0xa4afbd, dim: 0x667080,
    teal: 0x62e1d3, cyan: 0x7ed6f4, gold: 0xf2b766, danger: 0xf46f78,
    violet: 0xb092ff, bone: 0xd7d0bc, ember: 0xff7b56, white: 0xffffff,
    moss: 0x7bc89d, smoke: 0x8590a5
  };
  var RARITIES = [
    { name: 'Worn', short: 'WORN', chance: 0.52, color: 0xb4bbc6, mult: 0.86 },
    { name: 'Etched', short: 'ETCHED', chance: 0.30, color: 0x72e1d9, mult: 1.08 },
    { name: 'Radiant', short: 'RADIANT', chance: 0.14, color: 0xf2b766, mult: 1.38 },
    { name: 'Singular', short: 'SINGULAR', chance: 0.04, color: 0xb092ff, mult: 1.86 }
  ];
  var SLOTS = ['weapon', 'armor', 'charm'];
  var SLOT_LABEL = { weapon: 'PIKE', armor: 'COAT', charm: 'KNOT' };
  var SLOT_NAME = { weapon: 'Hollow Pike', armor: 'Mothglass Coat', charm: 'Tide-Eye Knot' };
  var ARTIFACTS = [
    { id: 'bell-eye', name: 'Bell-Eye Reliquary', band: 'crypt', color: PAL.teal, effect: 'pulse +12%' },
    { id: 'bone-key', name: 'Boneway Key', band: 'causeway', color: PAL.gold, effect: 'move +10%' },
    { id: 'ash-heart', name: 'Ashen Heart', band: 'vault', color: PAL.ember, effect: 'max HP +24' },
    { id: 'throne-seal', name: 'Throne Seal', band: 'throne', color: PAL.violet, effect: 'damage +15%' }
  ];
  var ARTIFACT_BY_ID = {};
  ARTIFACTS.forEach(function (a) { ARTIFACT_BY_ID[a.id] = a; });

  var BANDS = {
    crypt: {
      key: 'crypt', name: 'SUNKEN CRYPT', range: '01-10', accent: PAL.teal,
      bg: 0x14252d, floor: 0x1e3940, wall: 0x38575a,
      roster: ['shade', 'bone-crawler', 'bell-ringer'], hazards: ['rune', 'crack'],
      boss: 'drowned-bell', ramp: 'Echo pressure rises toward the Bell Warden.'
    },
    causeway: {
      key: 'causeway', name: 'BONE CAUSEWAY', range: '11-20', accent: PAL.gold,
      bg: 0x2b211e, floor: 0x4b3830, wall: 0x796052,
      roster: ['bone-crawler', 'lancer', 'bone-archer'], hazards: ['spikes', 'lane'],
      boss: 'causeway-king', ramp: 'Crossfire and spike lanes tighten before the King.'
    },
    vault: {
      key: 'vault', name: 'ASHEN VAULT', range: '21-29', accent: PAL.ember,
      bg: 0x301b20, floor: 0x573133, wall: 0x87534b,
      roster: ['ember-wisp', 'ash-brute', 'cinder-knight'], hazards: ['ember', 'crack'],
      boss: 'ashen-warden', ramp: 'Ash fields burn longer and elites hit harder.'
    },
    throne: {
      key: 'throne', name: 'GRAVEMARCH THRONE', range: '30', accent: PAL.violet,
      bg: 0x211a35, floor: 0x3b2d59, wall: 0x6a5487,
      roster: ['cinder-knight', 'throne-sentinel', 'ember-wisp'], hazards: ['ember', 'cross'],
      boss: 'throne-keeper', ramp: 'Every ring is a verdict. The Throne Keeper has three phases.'
    }
  };
  var ROOMS = {
    crypt: [
      '###########', '#...T.....#', '#.###.###.#', '#...C.....#',
      '#.#.#.###.#', '#.#...#...#', '#...#.#.A.#', '###.#.#.###',
      '#...#.....#', '#.#####.#.#', '#.....#...#', '#.T...###.#',
      '#.#.#.....#', '#...#.C.R.#', '#....E....#', '###########'
    ],
    causeway: [
      '###########', '#T..#.....#', '#.#.#.###.#', '#...C.....#',
      '###.###.#.#', '#...#...#.#', '#.A.#.#...#', '#.#.#.###.#',
      '#...#.....#', '#.#####.###', '#.....#...#', '#.T...#.#.#',
      '#.#.#...#.#', '#...#.C.R.#', '#....E....#', '###########'
    ],
    vault: [
      '###########', '#...T.....#', '#.#####.#.#', '#...C...#.#',
      '###.###.#.#', '#...#...#.#', '#.#.#.#.A.#', '#.#...###.#',
      '#...#.....#', '#.###.###.#', '#.....#...#', '#.T...#.#.#',
      '#.#.#...#.#', '#...#.C.R.#', '#....E....#', '###########'
    ],
    throne: [
      '###########', '#T..#.....#', '#.#.#.###.#', '#...C.....#',
      '#.#####.#.#', '#...#...#.#', '#.A.#.#...#', '###.#.###.#',
      '#...#.....#', '#.###.###.#', '#.....#...#', '#.T...#.#.#',
      '#.#.#...#.#', '#...#.C.R.#', '#....E....#', '###########'
    ]
  };
  var ENEMIES = {
    shade: { hp: 30, speed: 39, radius: 17, damage: 6, range: 92, tint: PAL.teal, family: 'shade', behavior: 'melee' },
    'bone-crawler': { hp: 42, speed: 47, radius: 16, damage: 8, range: 86, tint: PAL.bone, family: 'crawler', behavior: 'melee' },
    'bell-ringer': { hp: 56, speed: 29, radius: 19, damage: 11, range: 118, tint: PAL.gold, family: 'ringleader', behavior: 'summon' },
    lancer: { hp: 68, speed: 42, radius: 19, damage: 13, range: 126, tint: PAL.gold, family: 'lancer', behavior: 'charge' },
    'bone-archer': { hp: 54, speed: 25, radius: 18, damage: 12, range: 190, tint: PAL.bone, family: 'archer', behavior: 'ranged' },
    'ember-wisp': { hp: 84, speed: 51, radius: 17, damage: 16, range: 104, tint: PAL.ember, family: 'ember', behavior: 'area' },
    'ash-brute': { hp: 132, speed: 25, radius: 24, damage: 22, range: 118, tint: PAL.ember, family: 'brute', behavior: 'slam' },
    'cinder-knight': { hp: 118, speed: 38, radius: 21, damage: 20, range: 116, tint: PAL.gold, family: 'knight', behavior: 'guard' },
    'throne-sentinel': { hp: 180, speed: 31, radius: 25, damage: 27, range: 135, tint: PAL.violet, family: 'sentinel', behavior: 'guard' },
    'drowned-bell': { hp: 820, speed: 20, radius: 47, damage: 32, range: 190, tint: PAL.teal, family: 'bellboss', boss: true, behavior: 'boss' },
    'causeway-king': { hp: 1160, speed: 23, radius: 49, damage: 40, range: 210, tint: PAL.gold, family: 'kingboss', boss: true, behavior: 'boss' },
    'ashen-warden': { hp: 1640, speed: 26, radius: 52, damage: 48, range: 230, tint: PAL.ember, family: 'ashboss', boss: true, behavior: 'boss' },
    'throne-keeper': { hp: 2350, speed: 29, radius: 56, damage: 58, range: 245, tint: PAL.violet, family: 'throneboss', boss: true, behavior: 'boss' }
  };
  var ENEMY_FAMILY = {
    shade: 'shade', crawler: 'crawler', ringleader: 'ringleader', lancer: 'lancer',
    archer: 'archer', ember: 'ember', brute: 'brute', knight: 'knight', sentinel: 'sentinel',
    bellboss: 'bellboss', kingboss: 'kingboss', ashboss: 'ashboss', throneboss: 'throneboss'
  };

  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function hex(n) { return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6); }
  function fmtTime(seconds) {
    var s = Math.max(0, Math.floor(Number(seconds) || 0));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  function colorCss(n) { return hex(n); }
  function bandFor(floor) { return floor >= 30 ? BANDS.throne : floor >= 21 ? BANDS.vault : floor >= 11 ? BANDS.causeway : BANDS.crypt; }
  function enemyDef(kind) { return ENEMIES[kind] || ENEMIES.shade; }
  function isBoss(kind) { return !!enemyDef(kind).boss; }
  function doorRequirement(floor) { return floor <= 1 ? 0 : 30 + (floor - 1) * 8; }
  function bossFloor(floor) { return BOSS_FLOORS.indexOf(floor) >= 0; }
  function hash32(n) {
    n = Math.imul(n ^ n >>> 16, 0x45d9f3b); n = Math.imul(n ^ n >>> 16, 0x45d9f3b); return (n ^ n >>> 16) >>> 0;
  }
  function makeRng(seed) {
    var s = seed >>> 0;
    return function () { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296; };
  }
  function setTextIfChanged(text, value) { var next = String(value); if (text && text.text !== next) text.setText(next); }
  function setColorIfChanged(text, color) { if (text && text.style && text.style.color !== color) text.setColor(color); }
  function keyPressed(scene, code) { var down = kit.input.keyDown(code), pressed = down && !scene.keyPrev[code]; scene.keyPrev[code] = down; return pressed; }
  function safeInt(v, min, max) { return Number.isSafeInteger(v) && v >= min && v <= max; }
  function defaultItem(slot) { return { slot: slot, score: 10, power: slot === 'charm' ? 4 : 7, rarity: 0, name: SLOT_NAME[slot] }; }
  function defaultProfile() {
    return {
      version: 3, depth: 1, highest: 1, bestTime: 0, deaths: 0, streak: 0, bestStreak: 0,
      tutorialSeen: false,
      gear: { weapon: defaultItem('weapon'), armor: defaultItem('armor'), charm: defaultItem('charm') },
      inventory: [], artifacts: { 'bell-eye': false, 'bone-key': false, 'ash-heart': false, 'throne-seal': false },
      medals: { depth: 0, noDeath: 0, gear: 0 },
      bossRush: { unlocked: false, cleared: 0, bestTime: 0, medals: { ten: 0, twenty: 0, thirty: 0 } }
    };
  }
  function validItem(item, slot) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    var keys = ['slot', 'score', 'power', 'rarity', 'name'];
    return Object.keys(item).every(function (key) { return keys.indexOf(key) >= 0; }) && item.slot === slot && typeof item.name === 'string' && item.name.length > 0 && item.name.length <= 48 &&
      safeInt(item.score, 1, 9999) && safeInt(item.power, 1, 9999) && safeInt(item.rarity, 0, RARITIES.length - 1);
  }
  function validMedals(v) { return v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every(function (key) { return ['depth', 'noDeath', 'gear'].indexOf(key) >= 0; }) && safeInt(v.depth, 0, 3) && safeInt(v.noDeath, 0, 3) && safeInt(v.gear, 0, 3); }
  function validInventory(v) {
    if (!Array.isArray(v) || v.length > 24) return false;
    return v.every(function (item) { return SLOTS.some(function (slot) { return validItem(item, slot); }); });
  }
  function validArtifacts(v) {
    return v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every(function (key) { return own(ARTIFACT_BY_ID, key); }) && ARTIFACTS.every(function (a) { return typeof v[a.id] === 'boolean'; });
  }
  function validBossRush(v) {
    return v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every(function (key) { return ['unlocked', 'cleared', 'bestTime', 'medals'].indexOf(key) >= 0; }) && typeof v.unlocked === 'boolean' && safeInt(v.cleared, 0, 3) &&
      typeof v.bestTime === 'number' && Number.isFinite(v.bestTime) && v.bestTime >= 0 && v.medals && typeof v.medals === 'object' && !Array.isArray(v.medals) &&
      Object.keys(v.medals).every(function (key) { return ['ten', 'twenty', 'thirty'].indexOf(key) >= 0; }) && safeInt(v.medals.ten, 0, 1) && safeInt(v.medals.twenty, 0, 1) && safeInt(v.medals.thirty, 0, 1);
  }
  function validProfile(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 3) return false;
    if (!safeInt(value.depth, 1, 30) || !safeInt(value.highest, 1, 30) || value.highest < value.depth || !safeInt(value.deaths, 0, 1000000) || !safeInt(value.streak, 0, 1000000) || !safeInt(value.bestStreak, 0, 1000000)) return false;
    if (typeof value.tutorialSeen !== 'boolean' || typeof value.bestTime !== 'number' || !Number.isFinite(value.bestTime) || value.bestTime < 0) return false;
    if (!value.gear || !validItem(value.gear.weapon, 'weapon') || !validItem(value.gear.armor, 'armor') || !validItem(value.gear.charm, 'charm')) return false;
    if (!validInventory(value.inventory) || !validArtifacts(value.artifacts) || !validMedals(value.medals) || !validBossRush(value.bossRush)) return false;
    var keys = ['version', 'depth', 'highest', 'bestTime', 'deaths', 'streak', 'bestStreak', 'tutorialSeen', 'gear', 'inventory', 'artifacts', 'medals', 'bossRush'];
    return Object.keys(value).every(function (key) { return keys.indexOf(key) >= 0; });
  }
  function validLegacyProfile(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 2) return false;
    if (!safeInt(value.depth, 1, 30) || !safeInt(value.highest, 1, 30) || value.highest < value.depth || !safeInt(value.deaths, 0, 1000000) || !safeInt(value.streak, 0, 1000000) || !safeInt(value.bestStreak, 0, 1000000)) return false;
    if (typeof value.bestTime !== 'number' || !Number.isFinite(value.bestTime) || value.bestTime < 0) return false;
    return value.gear && validItem(value.gear.weapon, 'weapon') && validItem(value.gear.armor, 'armor') && validItem(value.gear.charm, 'charm') &&
      value.medals && safeInt(value.medals.depth, 0, 3) && safeInt(value.medals.noDeath, 0, 3) && safeInt(value.medals.gear, 0, 3) &&
      value.bossRush && safeInt(value.bossRush.cleared, 0, 3) && typeof value.bossRush.bestTime === 'number' && Number.isFinite(value.bossRush.bestTime);
  }
  function validStoredProfile(value) { return validProfile(value) || validLegacyProfile(value); }
  function migrateProfile(value) {
    var p = defaultProfile(), key;
    if (validProfile(value)) return JSON.parse(JSON.stringify(value));
    if (!validLegacyProfile(value)) return p;
    p.depth = value.depth; p.highest = value.highest; p.bestTime = value.bestTime; p.deaths = value.deaths; p.streak = value.streak; p.bestStreak = value.bestStreak;
    p.gear = JSON.parse(JSON.stringify(value.gear)); p.medals = JSON.parse(JSON.stringify(value.medals));
    p.bossRush.cleared = value.bossRush.cleared; p.bossRush.bestTime = value.bossRush.bestTime; p.bossRush.unlocked = p.highest >= 10;
    for (key in p.gear) if (own(p.gear, key)) p.inventory.push(JSON.parse(JSON.stringify(p.gear[key])));
    return p;
  }

  var boot = window.__gm || {};
  var GM_STATE = boot.state || { mode: 'gauntlet', phase: 'playing', floor: 1, gear: 30, hp: 100, drops: [] };
  GM_STATE.mode = GM_STATE.mode === 'boss-rush' ? 'boss-rush' : 'gauntlet';
  GM_STATE.phase = GM_STATE.phase || 'playing'; GM_STATE.floor = clamp(Number(GM_STATE.floor) || 1, 1, 30);
  GM_STATE.gear = Number(GM_STATE.gear) || 30; GM_STATE.hp = Number(GM_STATE.hp) || 100;
  GM_STATE.drops = Array.isArray(GM_STATE.drops) ? GM_STATE.drops.slice(-8) : [];
  var DEBUG = { state: GM_STATE, forceFloor: Number(boot.forceFloor) || 0, forceGear: Number(boot.forceGear) || 0 };
  window.__gm = DEBUG;
  var App = { game: null, scene: null };
  var kit = GGKit.create({
    slug: 'gravemarch', orientation: 'portrait', validateSave: validStoredProfile,
    onPause: function () { if (App.scene) { App.scene.kitPaused = true; App.scene.keyPrev = {}; App.scene.pointerStates = {}; App.scene.gamepadPrev = {}; App.scene.accumulator = 0; } },
    onResume: function () { if (App.scene) { App.scene.kitPaused = false; App.scene.keyPrev = {}; App.scene.accumulator = 0; } },
    onRestart: function () { if (App.scene) { App.scene.keyPrev = {}; App.scene.pointerStates = {}; App.scene.gamepadPrev = {}; } }
  });
  kit.audio.register({
    crypt: 'assets/music-crypt.mp3', danger: 'assets/music-danger.mp3', pulse: 'assets/pulse-cast.mp3', hook: 'assets/hook-clank.mp3',
    hit: 'assets/hit-impact.mp3', roar: 'assets/boss-roar.mp3', dodge: 'assets/dodge-whoosh.mp3', shot: 'assets/enemy-shot.mp3',
    summon: 'assets/summon-chime.mp3', pickup: 'assets/relic-pickup.mp3', puzzle: 'assets/puzzle-click.mp3', heal: 'assets/altar-heal.mp3',
    clear: 'assets/clear-chime.mp3', door: 'assets/door-open.mp3'
  });
  kit.audio.preload(['crypt', 'danger', 'pulse', 'hook', 'hit', 'roar', 'dodge', 'shot', 'summon', 'pickup', 'puzzle', 'heal', 'clear', 'door']);
  kit.registerPWA(); kit.loader.show('GRAVEMARCH'); kit.loader.progress(0.10);
  var profile = migrateProfile(kit.save.get(null));
  function saveProfile() { kit.save.set(profile); }
  if (profile.version !== 3 || !validProfile(profile)) saveProfile();
  function gearScore(gear) { return SLOTS.reduce(function (sum, slot) { return sum + (gear[slot] ? gear[slot].score : 0); }, 0); }
  function hasArtifact(id) { return !!profile.artifacts[id]; }
  function relicMultiplier(key) {
    var n = 1;
    if (hasArtifact('bell-eye') && key === 'pulse') n *= 1.12;
    if (hasArtifact('bone-key') && key === 'move') n *= 1.10;
    if (hasArtifact('throne-seal') && key === 'damage') n *= 1.15;
    return n;
  }
  function currentDps(gear) {
    var weapon = gear.weapon || defaultItem('weapon'), charm = gear.charm || defaultItem('charm');
    return Math.max(1, weapon.power * (1 + charm.power * 0.035) * relicMultiplier('damage'));
  }
  function maxHpFor(gear) { return 106 + gear.armor.power * 7 + gear.charm.power * 2 + (hasArtifact('ash-heart') ? 24 : 0); }
  function itemImpact(item) {
    if (!item) return 0;
    var weight = item.slot === 'armor' ? 2.25 : item.slot === 'charm' ? 2.75 : 1.65;
    return item.score * 0.4 + item.power * weight;
  }
  function medalFor(score) { return score >= 30 ? 3 : score >= 20 ? 2 : score >= 10 ? 1 : 0; }
  function updateMedals() {
    var totalGear = gearScore(profile.gear), depthTier = profile.highest >= 30 ? 3 : profile.highest >= 20 ? 2 : profile.highest >= 10 ? 1 : 0;
    var streakTier = profile.bestStreak >= 15 ? 3 : profile.bestStreak >= 8 ? 2 : profile.bestStreak >= 3 ? 1 : 0;
    var gearTier = totalGear >= 280 ? 3 : totalGear >= 190 ? 2 : totalGear >= 100 ? 1 : 0;
    profile.medals.depth = Math.max(profile.medals.depth, depthTier); profile.medals.noDeath = Math.max(profile.medals.noDeath, streakTier); profile.medals.gear = Math.max(profile.medals.gear, gearTier);
  }
  function unlockBand(floor) { return floor <= 10 || floor <= 20 ? profile.highest >= 10 : profile.highest >= 20; }
  function bossRushUnlocked() { return profile.highest >= 10; }
  function artifactForFloor(floor) { var band = bandFor(floor).key; return ARTIFACTS.filter(function (a) { return a.band === band; })[0] || ARTIFACTS[0]; }
  function roomForFloor(floor) { return ROOMS[bandFor(floor).key] || ROOMS.crypt; }
  function tileCenter(col, row) { return { x: MAP_X + col * TILE + TILE / 2, y: MAP_Y + row * TILE + TILE / 2 }; }
  function cellAt(x, y) { return { col: Math.floor((x - MAP_X) / TILE), row: Math.floor((y - MAP_Y) / TILE) }; }
  function roomChar(room, col, row) { return row >= 0 && row < room.length && col >= 0 && col < room[row].length ? room[row][col] : '#'; }
  function findChar(room, wanted, fallback) {
    var row, col;
    for (row = 0; row < room.length; row++) for (col = 0; col < room[row].length; col++) if (roomChar(room, col, row) === wanted) return tileCenter(col, row);
    return fallback;
  }
  function makeFloorProfile(floor, mode) {
    var safeFloor = clamp(Math.floor(floor) || 1, 1, 30), band = bandFor(safeFloor), boss = bossFloor(safeFloor), local = ((safeFloor - 1) % 10) + 1;
    var roster = band.roster, count = boss ? 4 + Math.floor(safeFloor / 15) : 3 + Math.floor(local / 3), queue = [], i;
    for (i = 0; i < count; i++) queue.push(roster[(i + safeFloor) % roster.length]);
    if (boss) queue.push(band.boss);
    return { floor: safeFloor, mode: mode, band: band, boss: boss, local: local, queue: queue, enemyHp: 1 + safeFloor * 0.095, enemyDamage: 1 + safeFloor * 0.045, hazardGap: Math.max(2.15, 4.1 - safeFloor * 0.045), name: boss ? band.name + ' / WARDEN' : band.name };
  }

  function drawHero(c, state, frame) {
    var bob = state === 'idle' ? (frame ? 1 : 0) : state === 'walk' ? (frame ? 2 : 0) : state === 'dodge' ? 0 : state === 'attack' ? -2 : 0;
    c.save(); c.translate(24, 25 + bob); c.imageSmoothingEnabled = false;
    if (state === 'dodge') { c.fillStyle = '#73e1d5'; c.fillRect(-21, -4, 42, 8); c.fillStyle = '#e8f5e9'; c.fillRect(-10, -8, 22, 16); }
    else { c.fillStyle = '#182430'; c.fillRect(-10, 7, 20, 11); c.fillStyle = '#d8e9df'; c.fillRect(-9, -6, 18, 19); c.fillStyle = '#72e1d9'; c.fillRect(-7, -15, 14, 11); c.fillStyle = '#192b35'; c.fillRect(2, -12, 4, 4); c.fillStyle = '#f2b766'; c.fillRect(-15, 8, 6, 4); c.fillRect(9, 8, 6, 4); c.strokeStyle = state === 'attack' ? '#f3eedf' : '#f2b766'; c.lineWidth = 3; c.beginPath(); c.moveTo(9, 1); c.lineTo(state === 'attack' ? 23 : 18, state === 'attack' ? -14 : 14); c.stroke(); if (state === 'walk') { c.fillStyle = '#d8e9df'; c.fillRect(-13, 14, 6, 4); c.fillRect(7, 12 + (frame ? 2 : 0), 6, 4); } if (state === 'hurt') { c.fillStyle = '#ffffff'; c.fillRect(-14, -17, 5, 5); c.fillRect(10, -17, 5, 5); } }
    c.restore();
  }
  function drawEnemy(c, family, state, frame) {
    var bob = state === 'float' ? (frame ? -3 : 2) : state === 'idle' ? (frame ? 1 : 0) : state === 'attack' ? -2 : 0;
    c.save(); c.translate(24, 25 + bob); c.imageSmoothingEnabled = false;
    var boss = family.indexOf('boss') >= 0, hurt = state === 'hurt', dodge = state === 'dodge';
    var col = family === 'shade' ? '#345e6a' : family === 'crawler' ? '#a09a87' : family === 'archer' ? '#c6b78d' : family === 'ember' || family === 'brute' ? '#d6604f' : family === 'knight' ? '#d49759' : family.indexOf('throne') >= 0 ? '#9278c8' : '#c2a664';
    if (dodge) { c.fillStyle = col; c.fillRect(-22, -4, 44, 8); }
    else if (boss) { c.fillStyle = col; c.fillRect(-18, -16, 36, 32); c.fillStyle = '#1d1a2b'; c.fillRect(-11, -10, 22, 18); c.fillStyle = family === 'throneboss' ? '#f2b766' : '#72e1d9'; c.fillRect(-5, -5, 10, 5); c.strokeStyle = '#f3eedf'; c.lineWidth = 2; c.strokeRect(-17, -15, 34, 30); c.fillStyle = col; c.fillRect(-23, -20, 8, 8); c.fillRect(15, -20, 8, 8); if (state === 'attack') { c.fillStyle = '#ffffff'; c.fillRect(-22, 10, 44, 4); } }
    else if (family === 'shade') { c.fillStyle = hurt ? '#ffffff' : col; c.fillRect(-10, -11, 20, 22); c.fillRect(-14, 5, 7, 5); c.fillRect(7, 5, 7, 5); c.fillStyle = '#b4fff0'; c.fillRect(2, -5, 5, 5); }
    else if (family === 'crawler') { c.fillStyle = hurt ? '#ffffff' : col; c.fillRect(-15, -7, 30, 14); c.fillRect(-20, 5, 8, 4); c.fillRect(12, 5, 8, 4); c.fillStyle = '#35252b'; c.fillRect(-6, -3, 12, 5); }
    else if (family === 'ringleader') { c.fillStyle = hurt ? '#ffffff' : col; c.fillRect(-13, -13, 26, 26); c.fillStyle = '#35252b'; c.fillRect(-7, -7, 14, 9); c.strokeStyle = '#f2b766'; c.lineWidth = 2; c.beginPath(); c.arc(0, -13, 8, Math.PI, TAU); c.stroke(); }
    else if (family === 'lancer') { c.fillStyle = hurt ? '#ffffff' : col; c.beginPath(); c.moveTo(0, -16); c.lineTo(13, 0); c.lineTo(0, 16); c.lineTo(-13, 0); c.closePath(); c.fill(); c.strokeStyle = '#f3eedf'; c.lineWidth = 2; c.beginPath(); c.moveTo(12, 0); c.lineTo(23, 0); c.stroke(); }
    else if (family === 'archer') { c.fillStyle = hurt ? '#ffffff' : col; c.beginPath(); c.moveTo(0, -15); c.lineTo(14, 0); c.lineTo(0, 15); c.lineTo(-14, 0); c.closePath(); c.fill(); c.fillStyle = '#332b30'; c.fillRect(-4, -4, 8, 8); c.strokeStyle = '#f3eedf'; c.beginPath(); c.arc(0, 0, 15, -1.1, 1.1); c.stroke(); }
    else if (family === 'ember' || family === 'brute') { c.fillStyle = hurt ? '#ffffff' : col; c.fillRect(-13, -13, 26, 26); c.fillStyle = '#4c252b'; c.fillRect(-7, -5, 14, 7); c.fillStyle = '#ffb86b'; c.fillRect(-4, -12, 8, 5); }
    else { c.fillStyle = hurt ? '#ffffff' : col; c.fillRect(-12, -14, 24, 28); c.fillStyle = '#282335'; c.fillRect(-7, -9, 14, 9); c.fillStyle = '#f2b766'; c.fillRect(-3, -5, 6, 4); c.fillRect(-17, 7, 6, 6); c.fillRect(11, 7, 6, 6); }
    if (state === 'attack' && !boss) { c.fillStyle = '#f3eedf'; c.fillRect(-18, -2, 6, 4); c.fillRect(12, -2, 6, 4); }
    c.restore();
  }
  function buildSheet(scene, key, families, draw) {
    var cell = 48, states = ['idle', 'walk', 'float', 'attack', 'hurt', 'dodge'], count = families.length * states.length * 2;
    var canvas = document.createElement('canvas'); canvas.width = cell * count; canvas.height = cell; var c = canvas.getContext('2d'), index = 0, fi, si, fr;
    for (fi = 0; fi < families.length; fi++) for (si = 0; si < states.length; si++) for (fr = 0; fr < 2; fr++) { c.save(); c.translate(index * cell, 0); draw(c, families[fi], states[si], fr); c.restore(); index++; }
    var texture = scene.textures.addCanvas(key, canvas); index = 0;
    for (fi = 0; fi < families.length; fi++) for (si = 0; si < states.length; si++) for (fr = 0; fr < 2; fr++) { texture.add(families[fi] + '-' + states[si] + '-' + fr, 0, index * cell, 0, cell, cell); index++; }
  }
  function buildSmallTexture(scene, key, size, paint) { var canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size; paint(canvas.getContext('2d'), size); scene.textures.addCanvas(key, canvas); }

  function Scene() { Phaser.Scene.call(this, { key: 'gravemarch' }); }
  Scene.prototype = Object.create(Phaser.Scene.prototype); Scene.prototype.constructor = Scene;
  Scene.prototype.create = function () {
    App.scene = this; this.kitPaused = kit.paused; this.accumulator = 0; this.simTime = 0; this.cameraX = 0; this.cameraY = 0;
    this.keyPrev = {}; this.pointerStates = {}; this.gamepadPrev = {}; this.manualOpen = false; this.puzzleOpen = false;
    this.toast = { text: '', color: PAL.teal, time: 0 }; this.profile = profile;
    this.hero = { x: 195, y: 646, hp: 100, maxHp: 100, attack: 0.38, pulse: 0, hook: 0, dodge: 0, dodgeCooldown: 0, invuln: 0, hurt: 0, dx: 0, dy: 0, facing: 1, moving: false, interact: 0 };
    this.enemies = []; this.hazards = []; this.fx = []; this.numbers = []; this.enemyCount = 0; this.hazardClock = 1.8; this.moveX = 0; this.moveY = 0;
    this.allocPools(); this.buildTextures(); this.buildWorld(); this.buildUi(); this.bindInput();
    var startMode = GM_STATE.mode === 'boss-rush' && bossRushUnlocked() ? 'boss-rush' : 'gauntlet';
    var requested = Number(DEBUG.forceFloor) || (startMode === 'boss-rush' ? 10 : profile.depth || 1);
    if (startMode === 'boss-rush') requested = BOSS_FLOORS.indexOf(requested) >= 0 ? requested : 10;
    requested = clamp(requested, 1, 30); this.applyForceGear(); this.startFloor(requested, startMode, true, false); kit.audio.music(startMode === 'boss-rush' ? 'danger' : 'crypt', 650);
    kit.loader.progress(1); kit.loader.hide(); this.updateDebug();
  };
  Scene.prototype.allocPools = function () {
    var i;
    for (i = 0; i < MAX_ENEMIES; i++) this.enemies.push({ alive: false, kind: 'shade', x: 0, y: 0, hp: 0, maxHp: 1, radius: 16, speed: 0, damage: 0, range: 100, attack: 1, stun: 0, hurt: 0, anim: 0, telegraph: 0, telegraphTime: 0, telegraphX: 0, telegraphY: 0, telegraphRadius: 40, telegraphKind: 'arrow', phaseIndex: 0, charge: 0, chargeX: 0, chargeY: 0, summon: 0 });
    for (i = 0; i < MAX_HAZARDS; i++) this.hazards.push({ alive: false, x: 0, y: 0, radius: 30, life: 0, maxLife: 1, warn: 0, damage: 0, hit: 0, kind: 'rune' });
    for (i = 0; i < MAX_FX; i++) this.fx.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: PAL.teal, shape: 'dot' });
    for (i = 0; i < MAX_NUMBERS; i++) this.numbers.push({ alive: false, x: 0, y: 0, value: '', color: PAL.paper, life: 0, maxLife: 1 });
  };
  Scene.prototype.buildTextures = function () {
    var bg = document.createElement('canvas'); bg.width = W; bg.height = H; var c = bg.getContext('2d'), x, y;
    c.fillStyle = '#080b14'; c.fillRect(0, 0, W, H); c.fillStyle = '#0f1723'; c.fillRect(0, 0, W, 124); c.fillStyle = '#0d111c'; c.fillRect(0, 746, W, 98);
    c.fillStyle = '#101923'; c.fillRect(14, 148, 362, 578); c.strokeStyle = 'rgba(215,208,188,.18)'; c.strokeRect(14, 148, 362, 578);
    for (y = 148; y < 726; y += 16) { c.fillStyle = y % 32 ? 'rgba(126,214,244,.025)' : 'rgba(242,183,102,.035)'; c.fillRect(0, y, W, 1); }
    c.fillStyle = 'rgba(126,214,244,.08)'; c.fillRect(0, 123, W, 2); c.fillRect(0, 745, W, 2); this.textures.addCanvas('gm-board', bg);
    buildSmallTexture(this, 'gm-floor', TILE, function (q) { q.fillStyle = '#1a2930'; q.fillRect(0, 0, 32, 32); q.fillStyle = '#203841'; q.fillRect(1, 1, 30, 30); q.fillStyle = 'rgba(126,214,244,.08)'; q.fillRect(4, 4, 24, 1); q.fillRect(4, 27, 24, 1); q.fillStyle = 'rgba(8,11,20,.35)'; q.fillRect(14, 8, 3, 3); q.fillRect(23, 20, 2, 2); });
    buildSmallTexture(this, 'gm-wall', TILE, function (q) { q.fillStyle = '#0c141d'; q.fillRect(0, 0, 32, 32); q.fillStyle = '#38575a'; q.fillRect(2, 2, 28, 28); q.fillStyle = '#1a2c34'; q.fillRect(4, 4, 24, 4); q.fillRect(4, 20, 24, 6); q.strokeStyle = 'rgba(243,238,223,.16)'; q.strokeRect(3, 3, 26, 26); });
    buildSmallTexture(this, 'gm-torch', 32, function (q) { q.fillStyle = '#39241f'; q.fillRect(12, 13, 8, 15); q.fillStyle = '#f2b766'; q.beginPath(); q.arc(16, 10, 7, 0, TAU); q.fill(); q.fillStyle = '#fff1b0'; q.fillRect(14, 5, 4, 9); });
    buildSmallTexture(this, 'gm-chamber', 32, function (q) { q.fillStyle = '#30253d'; q.fillRect(3, 5, 26, 24); q.strokeStyle = '#b092ff'; q.lineWidth = 2; q.strokeRect(5, 7, 22, 20); q.beginPath(); q.arc(16, 17, 6, 0, TAU); q.stroke(); });
    buildSmallTexture(this, 'gm-altar', 32, function (q) { q.fillStyle = '#24423b'; q.fillRect(4, 13, 24, 13); q.fillStyle = '#7bc89d'; q.fillRect(8, 8, 16, 8); q.fillStyle = '#d8f5d1'; q.fillRect(14, 4, 4, 9); });
    buildSmallTexture(this, 'gm-entrance', 32, function (q) { q.fillStyle = '#192332'; q.fillRect(5, 4, 22, 25); q.strokeStyle = '#f2b766'; q.lineWidth = 2; q.strokeRect(7, 6, 18, 21); q.fillStyle = '#f2b766'; q.fillRect(19, 16, 3, 3); });
    buildSmallTexture(this, 'gm-artifact', 32, function (q) { var g = q.createRadialGradient(16, 16, 2, 16, 16, 16); g.addColorStop(0, '#ffffff'); g.addColorStop(.35, '#72e1d9'); g.addColorStop(1, 'rgba(98,225,211,0)'); q.fillStyle = g; q.fillRect(0, 0, 32, 32); q.fillStyle = '#f3eedf'; q.beginPath(); q.moveTo(16, 5); q.lineTo(24, 16); q.lineTo(16, 27); q.lineTo(8, 16); q.closePath(); q.fill(); });
    buildSmallTexture(this, 'gm-light', 128, function (q) { var g = q.createRadialGradient(64, 64, 4, 64, 64, 64); g.addColorStop(0, 'rgba(242,183,102,.55)'); g.addColorStop(.35, 'rgba(242,183,102,.18)'); g.addColorStop(1, 'rgba(242,183,102,0)'); q.fillStyle = g; q.fillRect(0, 0, 128, 128); });
    buildSmallTexture(this, 'gm-shadow', 90, function (q) { q.fillStyle = 'rgba(0,0,0,.48)'; q.beginPath(); q.ellipse(45, 46, 30, 11, 0, 0, TAU); q.fill(); });
    buildSmallTexture(this, 'gm-ring', 128, function (q) { q.strokeStyle = '#ffffff'; q.lineWidth = 4; q.setLineDash([8, 6]); q.beginPath(); q.arc(64, 64, 52, 0, TAU); q.stroke(); });
    buildSmallTexture(this, 'gm-slam', 128, function (q) { q.strokeStyle = '#ffffff'; q.lineWidth = 5; q.beginPath(); q.arc(64, 64, 50, 0, TAU); q.stroke(); q.beginPath(); q.moveTo(64, 10); q.lineTo(64, 118); q.moveTo(10, 64); q.lineTo(118, 64); q.stroke(); });
    buildSmallTexture(this, 'gm-spikes', 128, function (q) { q.fillStyle = '#ffffff'; var i; for (i = 0; i < 8; i++) { q.beginPath(); q.moveTo(64 + Math.cos(i * TAU / 8) * 20, 64 + Math.sin(i * TAU / 8) * 20); q.lineTo(64 + Math.cos(i * TAU / 8 - .18) * 56, 64 + Math.sin(i * TAU / 8 - .18) * 56); q.lineTo(64 + Math.cos(i * TAU / 8 + .18) * 56, 64 + Math.sin(i * TAU / 8 + .18) * 56); q.closePath(); q.fill(); } });
    buildSmallTexture(this, 'gm-lane', 128, function (q) { q.fillStyle = '#ffffff'; q.fillRect(27, 10, 12, 108); q.fillRect(89, 10, 12, 108); q.strokeStyle = '#ffffff'; q.strokeRect(18, 18, 92, 92); });
    buildSmallTexture(this, 'gm-crack', 128, function (q) { q.strokeStyle = '#ffffff'; q.lineWidth = 5; q.beginPath(); q.moveTo(22, 15); q.lineTo(58, 48); q.lineTo(42, 72); q.lineTo(84, 113); q.moveTo(58, 48); q.lineTo(98, 28); q.stroke(); });
    buildSmallTexture(this, 'gm-ember', 128, function (q) { q.fillStyle = '#ffffff'; q.beginPath(); q.arc(64, 64, 42, 0, TAU); q.fill(); q.fillStyle = 'rgba(255,255,255,.45)'; q.beginPath(); q.arc(64, 64, 23, 0, TAU); q.fill(); });
    buildSmallTexture(this, 'gm-arrow', 128, function (q) { q.strokeStyle = '#ffffff'; q.lineWidth = 6; q.beginPath(); q.moveTo(20, 64); q.lineTo(108, 64); q.moveTo(82, 38); q.lineTo(108, 64); q.lineTo(82, 90); q.stroke(); });
    buildSmallTexture(this, 'gm-dot', 12, function (q) { q.fillStyle = '#ffffff'; q.fillRect(2, 2, 8, 8); });
    buildSmallTexture(this, 'gm-spark', 16, function (q) { q.fillStyle = '#ffffff'; q.beginPath(); q.moveTo(8, 0); q.lineTo(11, 5); q.lineTo(16, 8); q.lineTo(11, 11); q.lineTo(8, 16); q.lineTo(5, 11); q.lineTo(0, 8); q.lineTo(5, 5); q.closePath(); q.fill(); });
    buildSheet(this, 'gm-hero', ['hero'], drawHero); buildSheet(this, 'gm-enemy', Object.keys(ENEMY_FAMILY), function (q, family, state, frame) { drawEnemy(q, ENEMY_FAMILY[family] || 'shade', state, frame); });
    kit.loader.progress(0.46);
  };
  Scene.prototype.buildWorld = function () {
    this.boardImage = this.add.image(W / 2, H / 2, 'gm-board').setDepth(0); this.bandTint = this.add.rectangle(W / 2, 438, 350, 558, 0x0b1822, 0.12).setDepth(1);
    this.roomTiles = []; this.roomProps = []; this.lightViews = []; this.artifactViews = [];
    var row, col, tile, image, p;
    for (row = 0; row < 16; row++) for (col = 0; col < 11; col++) { p = tileCenter(col, row); image = this.add.image(p.x, p.y, 'gm-wall').setDepth(2); image.baseX = p.x; image.baseY = p.y; this.roomTiles.push(image); }
    for (row = 0; row < 16; row++) for (col = 0; col < 11; col++) { p = tileCenter(col, row); image = this.add.image(p.x, p.y, 'gm-light').setDepth(3).setAlpha(0).setScale(0.7); image.baseX = p.x; image.baseY = p.y; this.lightViews.push(image); }
    this.torchProps = []; this.chamberProps = []; this.altarProp = this.add.image(0, 0, 'gm-altar').setDepth(5).setVisible(false); this.entranceProp = this.add.image(0, 0, 'gm-entrance').setDepth(5).setVisible(false);
    for (row = 0; row < 16; row++) for (col = 0; col < 11; col++) { p = tileCenter(col, row); image = this.add.image(p.x, p.y, 'gm-torch').setDepth(5).setVisible(false); image.baseX = p.x; image.baseY = p.y; this.torchProps.push(image); image = this.add.image(p.x, p.y, 'gm-chamber').setDepth(5).setVisible(false); image.baseX = p.x; image.baseY = p.y; this.chamberProps.push(image); }
    for (row = 0; row < 2; row++) { image = this.add.image(0, 0, 'gm-artifact').setDepth(8).setVisible(false); this.artifactViews.push(image); }
    this.worldObjects = this.roomTiles.concat(this.torchProps, this.chamberProps, [this.altarProp, this.entranceProp]);
    this.arenaPulse = this.add.image(195, 646, 'gm-ring').setDepth(4).setAlpha(0).setScale(0.5); this.doorImage = this.add.image(328, 384, 'gm-entrance').setDepth(5).setScale(0.72);
    this.doorReq = this.add.text(328, 432, '', { fontFamily: 'monospace', fontSize: '14px', color: '#f2b766', align: 'center' }).setOrigin(0.5).setDepth(6); this.doorNext = this.add.text(328, 449, '', { fontFamily: 'monospace', fontSize: '14px', color: '#a4afbd', align: 'center' }).setOrigin(0.5).setDepth(6);
    this.heroShadow = this.add.image(195, 646, 'gm-shadow').setDepth(6).setAlpha(0.72).setScale(0.75); this.heroLight = this.add.image(195, 646, 'gm-light').setDepth(7).setAlpha(0.5).setScale(0.95); this.heroView = this.add.sprite(195, 646, 'gm-hero', 'hero-idle-0').setDepth(10).setDisplaySize(62, 62);
    this.enemyViews = []; this.hazardViews = []; this.fxViews = []; this.numberViews = [];
    for (row = 0; row < MAX_ENEMIES; row++) this.enemyViews.push({ sprite: this.add.sprite(0, 0, 'gm-enemy', 'shade-idle-0').setDepth(8).setDisplaySize(62, 62).setVisible(false), bar: this.add.rectangle(0, 0, 50, 5, PAL.teal).setOrigin(0.5).setDepth(9).setVisible(false), intent: this.add.image(0, 0, 'gm-ring').setDepth(7).setScale(0.3).setAlpha(0).setVisible(false) });
    for (row = 0; row < MAX_HAZARDS; row++) this.hazardViews.push(this.add.image(0, 0, 'gm-ring').setDepth(4).setScale(0.4).setVisible(false));
    for (row = 0; row < MAX_FX; row++) this.fxViews.push(this.add.image(0, 0, 'gm-dot').setDepth(12).setVisible(false));
    for (row = 0; row < MAX_NUMBERS; row++) this.numberViews.push(this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '15px', fontStyle: 'bold', color: '#f3eedf', stroke: '#080b14', strokeThickness: 3 }).setOrigin(0.5).setDepth(14).setVisible(false));
    kit.loader.progress(0.72);
  };
  Scene.prototype.t = function (x, y, value, size, color, originX, originY) { return this.add.text(x, y, value || '', { fontFamily: 'monospace', fontSize: (size || 14) + 'px', color: colorCss(color || PAL.paper), fontStyle: 'bold', lineSpacing: 2 }).setOrigin(originX == null ? 0 : originX, originY == null ? 0 : originY); };
  Scene.prototype.buildUi = function () {
    this.ui = {}; this.ui.title = this.t(18, 17, 'GRAVEMARCH', 18, PAL.paper); this.ui.title.setDepth(30); this.ui.subtitle = this.t(19, 42, 'BURIAL CHAMBER / ACTIVE DESCENT', 11, PAL.teal); this.ui.subtitle.setDepth(30);
    this.ui.floor = this.t(18, 78, 'FLOOR 01', 16, PAL.paper); this.ui.floor.setDepth(30); this.ui.band = this.t(108, 80, 'SUNKEN CRYPT', 14, PAL.mist); this.ui.band.setDepth(30); this.ui.gear = this.t(274, 78, 'GEAR 030', 15, PAL.gold, 0); this.ui.gear.setDepth(30);
    this.ui.manualButton = this.add.rectangle(356, 42, 38, 38, 0x172534, 0.95).setStrokeStyle(1, PAL.teal, 0.7).setDepth(31); this.ui.manualIcon = this.t(356, 42, '≡', 20, PAL.teal, 0.5, 0.5); this.ui.manualIcon.setDepth(32);
    this.ui.relics = this.t(18, 102, 'RELICS 0 / 4', 11, PAL.violet); this.ui.relics.setDepth(30); this.ui.hpBarBg = this.add.rectangle(48, 122, 220, 10, 0x1d202b, 1).setOrigin(0, 0.5).setDepth(30); this.ui.hpBar = this.add.rectangle(48, 122, 220, 10, PAL.danger, 1).setOrigin(0, 0.5).setDepth(31); this.ui.hp = this.t(276, 115, '100 / 100', 13, PAL.paper); this.ui.hp.setDepth(30);
    this.ui.dps = this.t(20, 134, 'AUTO 000', 14, PAL.cyan); this.ui.dps.setDepth(30); this.ui.door = this.t(270, 134, 'DOOR 038', 14, PAL.gold); this.ui.door.setDepth(30);
    this.ui.coachBg = this.add.rectangle(195, 150, 350, 22, 0x0b131d, 0.9).setDepth(29); this.ui.coach = this.t(195, 150, '', 12, PAL.mist, 0.5, 0.5); this.ui.coach.setDepth(30);
    this.ui.pulseButton = this.add.rectangle(102, 793, 170, 66, 0x172e36, 0.98).setStrokeStyle(2, PAL.teal, 0.72).setDepth(30); this.ui.hookButton = this.add.rectangle(288, 793, 170, 66, 0x27243d, 0.98).setStrokeStyle(2, PAL.violet, 0.72).setDepth(30); this.ui.pulseIcon = this.t(33, 778, '✦', 24, PAL.teal); this.ui.pulseIcon.setDepth(31); this.ui.hookIcon = this.t(219, 778, '⛓', 22, PAL.violet); this.ui.hookIcon.setDepth(31); this.ui.pulse = this.t(56, 778, 'RIFT PULSE\nREADY', 14, PAL.paper); this.ui.pulse.setDepth(31); this.ui.hook = this.t(242, 778, 'GRAVEHOOK\nREADY', 14, PAL.paper); this.ui.hook.setDepth(31);
    this.ui.transientBg = this.add.rectangle(18, 178, 260, 37, 0x0c1720, 0.96).setOrigin(0, 0.5).setStrokeStyle(1, PAL.teal, 0.86).setDepth(40).setVisible(false); this.ui.transient = this.t(30, 178, '', 14, PAL.paper, 0, 0.5); this.ui.transient.setDepth(41).setVisible(false);
    this.ui.puzzleShade = this.add.rectangle(195, 422, 390, 844, 0x05070d, 0.78).setDepth(50).setVisible(false); this.ui.puzzleCard = this.add.rectangle(195, 440, 340, 250, 0x151b2c, .98).setStrokeStyle(1, PAL.violet, .9).setDepth(51).setVisible(false); this.ui.puzzleTitle = this.t(195, 365, 'BURIAL CHAMBER / GLYPH LOCK', 16, PAL.violet, .5); this.ui.puzzleTitle.setDepth(52).setVisible(false); this.ui.puzzleHint = this.t(195, 410, '', 13, PAL.mist, .5); this.ui.puzzleHint.setWordWrapWidth(300); this.ui.puzzleHint.setAlign('center'); this.ui.puzzleHint.setDepth(52).setVisible(false);
    this.ui.runes = []; var i, labels = ['MOON', 'EYE', 'TOOTH']; for (i = 0; i < 3; i++) { this.ui.runes.push({ bg: this.add.rectangle(92 + i * 103, 500, 88, 58, 0x27243d, 1).setStrokeStyle(1, PAL.violet, .8).setDepth(52).setVisible(false), text: this.t(92 + i * 103, 500, labels[i], 12, PAL.paper, .5, .5).setDepth(53).setVisible(false) }); }
    this.ui.puzzleClose = this.t(195, 590, 'Tap a glyph. Wrong order resets the lock.', 12, PAL.dim, .5); this.ui.puzzleClose.setDepth(52).setVisible(false);
    this.buildBoundaryUi(); this.buildManualUi(); kit.loader.progress(0.91);
  };
  Scene.prototype.buildBoundaryUi = function () { this.ui.boundaryShade = this.add.rectangle(195, 422, 390, 844, 0x05070d, .78).setDepth(60).setVisible(false); this.ui.boundaryCard = this.add.rectangle(195, 422, 342, 390, 0x111a29, .98).setStrokeStyle(1, PAL.teal, .7).setDepth(61).setVisible(false); this.ui.boundaryKicker = this.t(44, 264, '', 12, PAL.teal).setDepth(62).setVisible(false); this.ui.boundaryTitle = this.t(44, 291, '', 28, PAL.paper).setDepth(62).setVisible(false); this.ui.boundaryBody = this.t(44, 347, '', 15, PAL.mist).setWordWrapWidth(300).setDepth(62).setVisible(false); this.ui.primaryBg = this.add.rectangle(195, 594, 300, 58, PAL.teal, 1).setDepth(62).setVisible(false); this.ui.primary = this.t(195, 594, '', 15, PAL.ink, .5, .5).setDepth(63).setVisible(false); this.ui.secondaryBg = this.add.rectangle(195, 670, 300, 52, 0x192333, 1).setStrokeStyle(1, PAL.dim, .8).setDepth(62).setVisible(false); this.ui.secondary = this.t(195, 670, '', 14, PAL.paper, .5, .5).setDepth(63).setVisible(false); };
  Scene.prototype.buildManualUi = function () { this.ui.manualShade = this.add.rectangle(195, 422, 390, 844, 0x060912, .97).setDepth(70).setVisible(false); this.ui.manualCard = this.add.rectangle(195, 422, 350, 760, 0x111a29, 1).setStrokeStyle(1, PAL.teal, .7).setDepth(71).setVisible(false); this.ui.manualKicker = this.t(32, 56, 'FIELD MANUAL / RELICS AND ROUTES', 12, PAL.teal).setDepth(72).setVisible(false); this.ui.manualTitle = this.t(32, 82, 'THE DESCENT REMEMBERS', 22, PAL.paper).setDepth(72).setVisible(false); this.ui.closeManual = this.add.rectangle(344, 70, 44, 44, 0x1c2936, 1).setStrokeStyle(1, PAL.dim, 1).setDepth(72).setVisible(false); this.ui.closeManualText = this.t(344, 69, '×', 27, PAL.paper, .5, .5).setDepth(73).setVisible(false); this.ui.manualText = this.t(32, 132, '', 13, PAL.mist).setWordWrapWidth(324).setDepth(72).setVisible(false); this.ui.manualBand = this.t(32, 370, '', 13, PAL.paper).setWordWrapWidth(324).setDepth(72).setVisible(false); this.ui.manualLoot = this.t(32, 490, '', 13, PAL.mist).setWordWrapWidth(324).setDepth(72).setVisible(false); this.ui.manualMedals = this.t(32, 620, '', 13, PAL.mist).setWordWrapWidth(324).setDepth(72).setVisible(false); this.ui.modeButtonBg = this.add.rectangle(195, 730, 300, 56, PAL.violet, 1).setDepth(72).setVisible(false); this.ui.modeButton = this.t(195, 730, '', 14, PAL.ink, .5, .5).setDepth(73).setVisible(false); this.ui.manualHint = this.t(195, 802, 'Tap × to return to the march', 13, PAL.dim, .5, .5).setDepth(72).setVisible(false); };

  Scene.prototype.toBase = function (clientX, clientY) { var canvas = this.game.canvas, rect = canvas.getBoundingClientRect(); return { x: (clientX - rect.left) * W / Math.max(1, rect.width), y: (clientY - rect.top) * H / Math.max(1, rect.height) }; };
  Scene.prototype.zoneAt = function (x, y) {
    if (this.puzzleOpen) { if (x >= 46 && x < 138 && y >= 470 && y < 535) return 'rune-1'; if (x >= 138 && x < 241 && y >= 470 && y < 535) return 'rune-2'; if (x >= 241 && x < 344 && y >= 470 && y < 535) return 'rune-3'; return 'puzzle'; }
    if (this.manualOpen) { if (x >= 320 && y >= 42 && y <= 98) return 'manual-close'; if (x >= 44 && x <= 346 && y >= 700 && y <= 760) return 'mode'; return 'manual'; }
    if (x >= 330 && y >= 18 && y <= 68) return 'manual-open';
    if (this.run && this.run.phase !== 'playing') { if (x >= 40 && x <= 350 && y >= 560 && y <= 630) return 'primary'; if (x >= 40 && x <= 350 && y >= 642 && y <= 700) return 'secondary'; return 'boundary'; }
    if (x >= 12 && x <= 188 && y >= 750) return 'pulse'; if (x >= 198 && x <= 378 && y >= 750) return 'hook'; return 'arena';
  };
  Scene.prototype.bindInput = function () { this.pointerStates = {}; };
  Scene.prototype.pollPointers = function () {
    if (kit.paused) return; var self = this, stamp = (this.pointerStamp || 0) + 1, id;
    this.pointerStamp = stamp;
    kit.input.pointers.forEach(function (p, id) {
      if (performance.now() - p.downAt > 8000) { kit.input.clearAll(); return; }
      var base = self.toBase(p.x, p.y), state = self.pointerStates[id];
      if (!state) { var start = self.toBase(p.startX, p.startY); state = self.pointerStates[id] = { zone: self.zoneAt(start.x, start.y), startX: start.x, startY: start.y, fired: false }; if (state.zone === 'manual-open') self.openManual(); else if (state.zone === 'manual-close') self.closeManual(); else if (state.zone === 'mode') self.toggleMode(); else if (state.zone === 'primary') self.primaryAction(); else if (state.zone === 'secondary') self.secondaryAction(); else if (state.zone === 'pulse') self.usePulse(); else if (state.zone === 'hook') self.useHook(); else if (state.zone === 'rune-1') self.puzzleChoice(1); else if (state.zone === 'rune-2') self.puzzleChoice(2); else if (state.zone === 'rune-3') self.puzzleChoice(3); }
      state.seen = stamp;
      if (!state.fired && state.zone === 'arena' && Math.hypot(base.x - state.startX, base.y - state.startY) >= 28) { state.fired = true; self.dodge(base.x - state.startX, base.y - state.startY); }
    });
    for (id in this.pointerStates) if (own(this.pointerStates, id) && this.pointerStates[id].seen !== stamp) delete this.pointerStates[id];
  };
  Scene.prototype.pollGamepad = function () {
    this.moveX = 0; this.moveY = 0; if (kit.paused || !navigator.getGamepads) return;
    var pads = navigator.getGamepads(), pad = null, i; for (i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { pad = pads[i]; break; }
    if (!pad) { this.gamepadPrev = {}; return; }
    var ax = Number(pad.axes[0]) || 0, ay = Number(pad.axes[1]) || 0, mag = Math.hypot(ax, ay); if (mag < .18) { ax = 0; ay = 0; } else { var scaled = clamp((mag - .18) / .82, 0, 1) / mag; ax *= scaled; ay *= scaled; }
    this.moveX = clamp(ax, -1, 1); this.moveY = clamp(ay, -1, 1);
    var buttons = { pulse: !!(pad.buttons[0] && pad.buttons[0].pressed), hook: !!(pad.buttons[1] && pad.buttons[1].pressed), interact: !!(pad.buttons[2] && pad.buttons[2].pressed), manual: !!(pad.buttons[9] && pad.buttons[9].pressed) };
    if (buttons.pulse && !this.gamepadPrev.pulse) this.usePulse(); if (buttons.hook && !this.gamepadPrev.hook) this.useHook(); if (buttons.interact && !this.gamepadPrev.interact) this.interact(); if (buttons.manual && !this.gamepadPrev.manual) this.openManual(); this.gamepadPrev = buttons;
  };
  Scene.prototype.pollKeyboard = function () {
    var self = this;
    if (keyPressed(self, 'KeyJ')) self.usePulse(); if (keyPressed(self, 'KeyK')) self.useHook(); if (keyPressed(self, 'KeyE')) self.interact();
    if (keyPressed(self, 'Enter')) { if (self.run && self.run.phase !== 'playing') self.primaryAction(); else self.interact(); }
    if (keyPressed(self, 'KeyM')) self.openManual(); if (keyPressed(self, 'Escape')) { if (self.puzzleOpen) self.closePuzzle(); else if (self.manualOpen) self.closeManual(); }
    if (keyPressed(self, 'Digit1')) self.puzzleChoice(1); if (keyPressed(self, 'Digit2')) self.puzzleChoice(2); if (keyPressed(self, 'Digit3')) self.puzzleChoice(3);
    var left = kit.input.keyDown('ArrowLeft') || kit.input.keyDown('KeyA'), right = kit.input.keyDown('ArrowRight') || kit.input.keyDown('KeyD'), up = kit.input.keyDown('ArrowUp') || kit.input.keyDown('KeyW'), down = kit.input.keyDown('ArrowDown') || kit.input.keyDown('KeyS');
    if (left) self.moveX -= 1; if (right) self.moveX += 1; if (up) self.moveY -= 1; if (down) self.moveY += 1;
  };
  Scene.prototype.resetPools = function () { var i; for (i = 0; i < MAX_ENEMIES; i++) this.enemies[i].alive = false; for (i = 0; i < MAX_HAZARDS; i++) this.hazards[i].alive = false; for (i = 0; i < MAX_FX; i++) this.fx[i].alive = false; for (i = 0; i < MAX_NUMBERS; i++) this.numbers[i].alive = false; this.enemyCount = 0; };
  Scene.prototype.setupRoom = function () {
    var room = roomForFloor(this.run.floor), col, row, p, i, a = artifactForFloor(this.run.floor), entrance = findChar(room, 'E', { x: 195, y: 646 }), altar = findChar(room, 'R', { x: 250, y: 614 });
    this.run.room = room; this.run.entrance = entrance; this.run.altar = altar; this.run.restUsed = false; this.run.treasureOpen = false; this.run.puzzles = [];
    for (row = 0; row < 16; row++) for (col = 0; col < 11; col++) { var tile = this.roomTiles[row * 11 + col]; p = tileCenter(col, row); tile.setTexture(roomChar(room, col, row) === '#' ? 'gm-wall' : 'gm-floor').setVisible(true); tile.baseX = p.x; tile.baseY = p.y; }
    this.torchProps.forEach(function (v, index) { col = index % 11; row = Math.floor(index / 11); var ch = roomChar(room, col, row), pos = tileCenter(col, row); v.setVisible(ch === 'T'); v.baseX = pos.x; v.baseY = pos.y; });
    this.chamberProps.forEach(function (v, index) { col = index % 11; row = Math.floor(index / 11); var ch = roomChar(room, col, row), pos = tileCenter(col, row), first = this.run.floor % 2 ? 1 : 2; v.setVisible(ch === 'C'); v.baseX = pos.x; v.baseY = pos.y; if (ch === 'C') this.run.puzzles.push({ x: pos.x, y: pos.y, sequence: [first, first % 3 + 1, (first + 1) % 3 + 1], progress: 0, solved: false, hint: 'The wall remembers: ' + (first === 1 ? 'moon, eye, tooth.' : 'eye, tooth, moon.') }); }, this);
    this.altarProp.setPosition(altar.x, altar.y).setVisible(true); this.altarProp.baseX = altar.x; this.altarProp.baseY = altar.y; this.entranceProp.setPosition(entrance.x, entrance.y).setVisible(true); this.entranceProp.baseX = entrance.x; this.entranceProp.baseY = entrance.y;
    this.run.artifact = { id: a.id, x: findChar(room, 'A', { x: 275, y: 390 }).x, y: findChar(room, 'A', { x: 275, y: 390 }).y, active: false, collected: hasArtifact(a.id) }; this.artifactViews[0].setPosition(this.run.artifact.x, this.run.artifact.y).setTint(a.color).setVisible(false); this.artifactViews[0].baseX = this.run.artifact.x; this.artifactViews[0].baseY = this.run.artifact.y;
    for (i = 1; i < this.artifactViews.length; i++) this.artifactViews[i].setVisible(false);
    for (i = 0; i < 176; i++) { this.lightViews[i].setVisible(false); }
    for (row = 0; row < 16; row++) for (col = 0; col < 11; col++) if (roomChar(room, col, row) === 'T') { p = tileCenter(col, row); this.lightViews[row * 11 + col].setPosition(p.x, p.y).setVisible(true).setAlpha(.64); }
    this.bandTint.setFillStyle(this.run.profile.band.bg, .18); this.doorImage.setTint(this.run.profile.band.accent); this.run.hint = 'Find the chamber. Press E near a glyph lock.';
  };
  Scene.prototype.startFloor = function (floor, mode, initial, continuation) {
    var nextFloor = clamp(Math.floor(floor) || 1, 1, 30), nextMode = mode === 'boss-rush' && bossRushUnlocked() ? 'boss-rush' : 'gauntlet';
    if (nextMode === 'gauntlet' && !unlockBand(nextFloor) && !initial) nextFloor = nextFloor <= 20 ? 10 : 20;
    if (nextMode === 'boss-rush' && BOSS_FLOORS.indexOf(nextFloor) < 0) nextFloor = 10;
    this.resetPools(); this.accumulator = 0; this.simTime = 0; this.rushTime = continuation && this.rushTime ? this.rushTime : nextMode === 'boss-rush' ? 0 : 0;
    var fp = makeFloorProfile(nextFloor, nextMode); this.run = { floor: nextFloor, mode: nextMode, phase: 'playing', floorTime: 0, totalTime: this.rushTime, queue: fp.queue.slice(), profile: fp, spawnTimer: .35, drops: 0, bossPhases: 0, rng: makeRng(hash32(nextFloor * 9973 + (nextMode === 'boss-rush' ? 44 : 11))), noDeath: profile.streak, medal: 0, kills: 0, tutorial: { moved: false, pulse: false, hook: false, chamber: false, artifact: false } };
    this.setupRoom(); var start = this.run.entrance; this.hero.x = start.x; this.hero.y = start.y; this.hero.hp = this.hero.maxHp = maxHpFor(profile.gear); this.hero.attack = .38; this.hero.pulse = 0; this.hero.hook = 0; this.hero.dodge = 0; this.hero.dodgeCooldown = 0; this.hero.invuln = 0; this.hero.hurt = 0; this.hero.moving = false; this.hazardClock = 1.4; this.toast.time = 0; this.pulseStartedAt = -99; this.puzzleOpen = false; this.updateTutorial();
    GM_STATE.mode = nextMode; GM_STATE.phase = 'playing'; GM_STATE.floor = nextFloor; if (!initial) { kit.resume('boundary'); saveProfile(); kit.audio.music(nextMode === 'boss-rush' ? 'danger' : 'crypt', 650); }
    this.updateDebug();
  };
  Scene.prototype.applyForceGear = function () { var requested = DEBUG.forceGear || GM_STATE.forceGear; if (!requested) return; var target = requested === true ? 999 : clamp(Number(requested) || 999, 30, 9999), per = Math.ceil(target / 3), slot; for (slot = 0; slot < SLOTS.length; slot++) { var key = SLOTS[slot]; profile.gear[key] = { slot: key, score: per, power: Math.max(2, Math.round(per * (key === 'charm' ? .4 : .62))), rarity: 3, name: 'SINGULAR ' + SLOT_NAME[key] }; } saveProfile(); DEBUG.forceGear = 0; GM_STATE.forceGear = 0; };
  Scene.prototype.readDebugSwitches = function () { this.applyForceGear(); var forced = Number(DEBUG.forceFloor || GM_STATE.forceFloor) || 0; if (forced >= 1 && forced <= 30 && (!this.run || this.run.floor !== forced)) { DEBUG.forceFloor = 0; GM_STATE.forceFloor = 0; this.startFloor(forced, GM_STATE.mode, false, false); } };
  Scene.prototype.isSolid = function (x, y, radius) { var samples = [[-radius, -radius], [radius, -radius], [-radius, radius], [radius, radius]], room = this.run.room, i, cell; for (i = 0; i < samples.length; i++) { cell = cellAt(x + samples[i][0], y + samples[i][1]); if (roomChar(room, cell.col, cell.row) === '#') return true; } return x < ARENA.left + radius || x > ARENA.right - radius || y < ARENA.top + radius || y > ARENA.bottom - radius; };
  Scene.prototype.moveHero = function (dx, dy) { var speed = 100 * relicMultiplier('move'), nx = this.hero.x + dx * speed * STEP, ny = this.hero.y + dy * speed * STEP; if (!this.isSolid(nx, this.hero.y, 12)) this.hero.x = nx; if (!this.isSolid(this.hero.x, ny, 12)) this.hero.y = ny; };
  Scene.prototype.spawnPoint = function (boss) { var i, angle, radius, p; for (i = 0; i < 12; i++) { angle = this.run.rng() * TAU; radius = boss ? 145 : 120 + this.run.rng() * 65; p = { x: clamp(195 + Math.cos(angle) * radius, ARENA.left + 28, ARENA.right - 28), y: clamp(440 + Math.sin(angle) * radius * .74, ARENA.top + 34, ARENA.bottom - 48) }; if (!this.isSolid(p.x, p.y, 22) && dist(this.hero.x, this.hero.y, p.x, p.y) > 90) return p; } return { x: 195, y: 246 }; };
  Scene.prototype.spawnEnemy = function (kind, force) {
    var i, e, d = enemyDef(kind), profileFloor = this.run.profile, scale = profileFloor.enemyHp;
    for (i = 0; i < MAX_ENEMIES; i++) if (!this.enemies[i].alive) { e = this.enemies[i]; break; }
    if (!e && force) { for (i = 0; i < MAX_ENEMIES; i++) if (this.enemies[i].alive && !isBoss(this.enemies[i].kind)) { this.enemies[i].alive = false; this.enemyCount--; e = this.enemies[i]; break; } }
    if (!e) return false; var boss = !!d.boss, p = this.spawnPoint(boss);
    e.alive = true; e.kind = kind; e.x = p.x; e.y = p.y; e.maxHp = e.hp = d.hp * scale * (boss ? 1 + profileFloor.floor * .04 : 1); e.radius = d.radius; e.speed = d.speed + profileFloor.floor * (boss ? .16 : .28); e.damage = d.damage * profileFloor.enemyDamage; e.range = d.range; e.attack = .7 + this.run.rng() * .9; e.stun = 0; e.hurt = 0; e.anim = 0; e.telegraph = 0; e.telegraphTime = 0; e.telegraphX = 0; e.telegraphY = 0; e.telegraphRadius = 40; e.telegraphKind = 'arrow'; e.phaseIndex = 0; e.charge = 0; e.chargeX = 0; e.chargeY = 0; e.summon = 2.4; this.enemyCount++;
    this.emitFx(e.x, e.y, d.tint, boss ? 28 : 8, boss ? 100 : 50); if (boss) { kit.audio.sfx('roar', { volume: .7 }); kit.audio.music('danger', 500); this.showTransient('WARDEN ARRIVES / READ THE ROOM', d.tint, .9); }
    return true;
  };
  Scene.prototype.spawnHazard = function (x, y, radius, life, damage, kind) { var i, h; for (i = 0; i < MAX_HAZARDS; i++) if (!this.hazards[i].alive) { h = this.hazards[i]; break; } if (!h) return false; h.alive = true; h.x = clamp(x, ARENA.left + radius, ARENA.right - radius); h.y = clamp(y, ARENA.top + radius, ARENA.bottom - radius - 25); h.radius = radius; h.life = h.maxLife = life; h.warn = Math.min(.75, life * .52); h.damage = damage; h.hit = 0; h.kind = kind || 'rune'; return true; };
  Scene.prototype.emitFx = function (x, y, color, count, speed, shape) { var i, f, angle, velocity, rng = this.run && this.run.rng ? this.run.rng : Math.random; for (i = 0; i < MAX_FX && count > 0; i++) if (!this.fx[i].alive) { f = this.fx[i]; angle = rng() * TAU; velocity = (speed || 60) * (.35 + rng() * .65); f.alive = true; f.x = x; f.y = y; f.vx = Math.cos(angle) * velocity; f.vy = Math.sin(angle) * velocity; f.life = f.maxLife = .22 + rng() * .38; f.size = 2 + rng() * 4; f.color = color; f.shape = shape || (count % 2 ? 'spark' : 'dot'); count--; } };
  Scene.prototype.addNumber = function (x, y, value, color) { var i; for (i = 0; i < MAX_NUMBERS; i++) if (!this.numbers[i].alive) { this.numbers[i].alive = true; this.numbers[i].x = x; this.numbers[i].y = y; this.numbers[i].value = String(value); this.numbers[i].color = color; this.numbers[i].life = this.numbers[i].maxLife = .62; return; } };
  Scene.prototype.rollRarity = function () { var value = this.run.rng(), sum = 0, i; for (i = 0; i < RARITIES.length; i++) { sum += RARITIES[i].chance; if (value <= sum) return i; } return 0; };
  Scene.prototype.createLoot = function () { var slot = SLOTS[Math.floor(this.run.rng() * SLOTS.length)], rarityIndex = this.rollRarity(), rarity = RARITIES[rarityIndex], floor = this.run.floor, score = Math.max(5, Math.round((20 + floor * 2 + this.run.rng() * (floor * 1.25 + 8)) * rarity.mult)), power = Math.max(2, Math.round((slot === 'weapon' ? 6 + floor * .66 : slot === 'armor' ? 5 + floor * .78 : 3 + floor * .4) * rarity.mult + this.run.rng() * 3)); return { slot: slot, score: score, power: power, rarity: rarityIndex, name: rarity.short + ' ' + SLOT_NAME[slot] }; };
  Scene.prototype.collectLoot = function (item) {
    var old = profile.gear[item.slot], rarity = RARITIES[item.rarity], upgraded = itemImpact(item) > itemImpact(old), i;
    if (profile.inventory.length >= 24) profile.inventory.shift(); profile.inventory.push(JSON.parse(JSON.stringify(item))); this.run.drops++; GM_STATE.drops.push(item.name + ' ' + item.score); if (GM_STATE.drops.length > 8) GM_STATE.drops.shift();
    if (upgraded) { profile.gear[item.slot] = item; this.showTransient('EQUIP ' + SLOT_LABEL[item.slot] + ' / ' + item.power + ' POWER', rarity.color, 1); this.emitFx(this.hero.x, this.hero.y - 34, rarity.color, 18, 80, 'spark'); kit.audio.sfx('pickup', { volume: .45, rate: item.rarity >= 2 ? 1.25 : 1 }); }
    else this.showTransient('KEEP ' + SLOT_LABEL[item.slot] + ' / BAGGED', rarity.color, .82);
    for (i = 0; i < SLOTS.length; i++) if (!validItem(profile.gear[SLOTS[i]], SLOTS[i])) profile.gear[SLOTS[i]] = defaultItem(SLOTS[i]); if (!this.run || this.run.mode === 'gauntlet') updateMedals(); saveProfile();
  };
  Scene.prototype.grantClearLoot = function () { var count = this.run.profile.boss ? 3 : this.run.floor % 10 >= 7 ? 2 : 1, i; for (i = 0; i < count; i++) this.collectLoot(this.createLoot()); };
  Scene.prototype.nearestEnemy = function () { var nearest = null, best = Infinity, i, e, d; for (i = 0; i < MAX_ENEMIES; i++) if (this.enemies[i].alive) { e = this.enemies[i]; d = dist(this.hero.x, this.hero.y, e.x, e.y); if (d < best) { best = d; nearest = e; } } return nearest; };
  Scene.prototype.damageEnemy = function (enemy, amount, color, stun) { if (!enemy || !enemy.alive || this.run.phase !== 'playing') return; var safe = Math.max(1, Number(amount) || 1); if (enemy.guard > 0) safe *= .68; enemy.hp -= safe; enemy.hurt = .16; enemy.stun = Math.max(enemy.stun, stun || 0); this.addNumber(enemy.x, enemy.y - enemy.radius - 10, '-' + Math.round(safe), color || PAL.paper); this.emitFx(enemy.x, enemy.y, color || PAL.paper, Math.min(8, 3 + Math.floor(safe / 35)), 65, 'spark'); if (isBoss(enemy.kind)) kit.juice.shake(4, 90); if (enemy.hp <= 0) this.defeatEnemy(enemy); };
  Scene.prototype.defeatEnemy = function (enemy) { if (!enemy.alive) return; var boss = isBoss(enemy.kind), def = enemyDef(enemy.kind); enemy.alive = false; this.enemyCount--; this.run.kills++; this.emitFx(enemy.x, enemy.y, def.tint, boss ? 46 : 18, boss ? 150 : 100, 'spark'); this.addNumber(enemy.x, enemy.y - enemy.radius, boss ? 'WARDEN DOWN' : 'CLEARED', boss ? PAL.gold : PAL.teal); kit.juice.shake(boss ? 14 : 4, boss ? 340 : 110); if (boss) { kit.juice.hitStop(65); kit.audio.sfx('roar', { volume: .84, rate: .72 }); } else kit.audio.sfx('hit', { volume: .42 }); if (!boss && this.run.rng() < (.62 + (this.run.floor % 10 >= 7 ? .14 : 0))) this.collectLoot(this.createLoot()); this.updateTutorial(); };
  Scene.prototype.usePulse = function () { if (!this.run || this.run.phase !== 'playing' || kit.paused || this.hero.pulse > 0) return; this.hero.pulse = 7; this.run.tutorial.pulse = true; this.pulseStartedAt = this.simTime; this.arenaPulse.setPosition(this.hero.x, this.hero.y).setScale(.4).setAlpha(.8); var dps = currentDps(profile.gear), hits = 0, i; for (i = 0; i < MAX_ENEMIES; i++) if (this.enemies[i].alive && dist(this.hero.x, this.hero.y, this.enemies[i].x, this.enemies[i].y) <= 142) { this.damageEnemy(this.enemies[i], dps * 2.65 * relicMultiplier('pulse'), PAL.cyan, .35); hits++; } this.emitFx(this.hero.x, this.hero.y, PAL.cyan, 34, 175, 'spark'); kit.audio.sfx('pulse', { volume: .7 }); if (!hits) this.showTransient('PULSE MISSED / KEEP MOVING', PAL.dim, .75); this.updateTutorial(); };
  Scene.prototype.useHook = function () { if (!this.run || this.run.phase !== 'playing' || kit.paused || this.hero.hook > 0) return; var target = this.nearestEnemy(); if (!target) return; this.hero.hook = 11; this.run.tutorial.hook = true; this.damageEnemy(target, currentDps(profile.gear) * 4.2, PAL.violet, 1.6); target.x = clamp(lerp(target.x, this.hero.x, .65), ARENA.left + 28, ARENA.right - 28); target.y = clamp(lerp(target.y, this.hero.y - 118, .65), ARENA.top + 30, ARENA.bottom - 54); this.emitFx(this.hero.x, this.hero.y - 42, PAL.violet, 22, 150, 'spark'); kit.audio.sfx('hook', { volume: .68 }); this.updateTutorial(); };
  Scene.prototype.dodge = function (dx, dy) { if (!this.run || this.run.phase !== 'playing' || kit.paused || this.hero.dodgeCooldown > 0 || this.hero.dodge > 0) return; var len = Math.hypot(dx, dy) || 1; this.hero.dx = dx / len; this.hero.dy = dy / len; this.hero.dodge = .32; this.hero.dodgeCooldown = 1.15; this.hero.invuln = .46; this.hero.facing = this.hero.dx || this.hero.facing; this.emitFx(this.hero.x, this.hero.y, PAL.gold, 18, 120, 'spark'); kit.audio.sfx('dodge', { volume: .54 }); this.run.tutorial.moved = true; this.updateTutorial(); };
  Scene.prototype.takeDamage = function (amount) { if (!this.run || this.hero.invuln > 0 || this.run.phase !== 'playing') return; this.hero.hp = clamp(this.hero.hp - Math.max(1, amount), 0, this.hero.maxHp); this.hero.hurt = .22; this.emitFx(this.hero.x, this.hero.y, PAL.danger, 18, 110, 'spark'); this.addNumber(this.hero.x, this.hero.y - 42, '-' + Math.round(amount), PAL.danger); kit.juice.shake(9, 170); kit.audio.sfx('hit', { volume: .6, rate: .72 }); if (this.hero.hp <= 0) this.enterDeath(); };
  Scene.prototype.startTelegraph = function (enemy, kind) { enemy.telegraph = 1; enemy.telegraphKind = kind || 'arrow'; enemy.telegraphTime = kind === 'arrow' ? .72 : Math.max(.58, .92 - this.run.floor * .004); enemy.telegraphX = clamp(this.hero.x + this.moveX * 24, ARENA.left + 24, ARENA.right - 24); enemy.telegraphY = clamp(this.hero.y + this.moveY * 24, ARENA.top + 24, ARENA.bottom - 50); enemy.telegraphRadius = kind === 'arrow' ? 24 : 54 + enemy.phaseIndex * 12; this.emitFx(enemy.x, enemy.y, enemyDef(enemy.kind).tint, 8, 30); };
  Scene.prototype.resolveTelegraph = function (enemy) { var hit = dist(this.hero.x, this.hero.y, enemy.telegraphX, enemy.telegraphY) <= enemy.telegraphRadius; if (hit) this.takeDamage(enemy.damage * (isBoss(enemy.kind) ? 1 + enemy.phaseIndex * .18 : .8)); var kind = enemy.telegraphKind; this.spawnHazard(enemy.telegraphX, enemy.telegraphY, enemy.telegraphRadius * (kind === 'arrow' ? 1.15 : .9), kind === 'arrow' ? .45 : .72, enemy.damage * .72, kind); enemy.telegraph = 0; enemy.attack = kind === 'arrow' ? 1.75 : 1.2; kit.audio.sfx(kind === 'arrow' ? 'shot' : 'hit', { volume: .48 }); kit.juice.shake(kind === 'arrow' ? 3 : 12, kind === 'arrow' ? 80 : 240); this.emitFx(enemy.telegraphX, enemy.telegraphY, enemyDef(enemy.kind).tint, 24, 130, 'spark'); };
  Scene.prototype.startBossTelegraph = function (enemy) { this.startTelegraph(enemy, 'slam'); enemy.telegraphRadius = 54 + enemy.phaseIndex * 12; };
  Scene.prototype.resolveBossTelegraph = function (enemy) { this.resolveTelegraph(enemy); };
  Scene.prototype.moveEnemy = function (e, dx, dy, speed) { var nx = e.x + dx * speed * STEP, ny = e.y + dy * speed * STEP; if (!this.isSolid(nx, e.y, e.radius)) e.x = nx; if (!this.isSolid(e.x, ny, e.radius)) e.y = ny; };
  Scene.prototype.stepEnemy = function (e, def) {
    var run = this.run, hero = this.hero, d = dist(hero.x, hero.y, e.x, e.y), dx = (hero.x - e.x) / Math.max(1, d), dy = (hero.y - e.y) / Math.max(1, d);
    e.anim += STEP; e.hurt = Math.max(0, e.hurt - STEP); e.stun = Math.max(0, e.stun - STEP); e.guard = e.guard ? Math.max(0, e.guard - STEP) : 0; e.summon = Math.max(0, e.summon - STEP);
    if (isBoss(e.kind) && e.phaseIndex < 3) { var ratio = e.hp / Math.max(1, e.maxHp), expected = ratio < .34 ? 3 : ratio < .68 ? 2 : 1; if (expected > e.phaseIndex) { e.phaseIndex = expected; run.bossPhases++; this.emitFx(e.x, e.y, def.tint, 38, 135, 'spark'); this.spawnHazard(hero.x, hero.y, 72 + expected * 10, .95, e.damage * .62, 'phase'); kit.juice.shake(14, 280); this.showTransient('PHASE ' + expected + ' / TELEGRAPH WIDENS', def.tint, .95); } }
    if (e.stun > 0) return;
    if (e.telegraph) { e.telegraphTime -= STEP; if (e.telegraphTime <= 0) this.resolveTelegraph(e); return; }
    if (e.charge > 0) { e.charge -= STEP; this.moveEnemy(e, (e.chargeX - e.x) / Math.max(1, dist(e.x, e.y, e.chargeX, e.chargeY)), (e.chargeY - e.y) / Math.max(1, dist(e.x, e.y, e.chargeX, e.chargeY)), e.speed * 3.4); if (dist(hero.x, hero.y, e.x, e.y) < e.radius + 18) this.takeDamage(e.damage * 1.35); if (e.charge <= 0) e.attack = 1.6; return; }
    if (def.behavior === 'ranged') { if (d < 135) this.moveEnemy(e, -dx, -dy, e.speed); else if (d > e.range) this.moveEnemy(e, dx, dy, e.speed); e.attack -= STEP; if (e.attack <= 0) this.startTelegraph(e, 'arrow'); return; }
    if (def.behavior === 'charge') { if (d > e.range) this.moveEnemy(e, dx, dy, e.speed); else { e.attack -= STEP; if (e.attack <= 0) { e.charge = .48; e.chargeX = hero.x; e.chargeY = hero.y; e.telegraphX = hero.x; e.telegraphY = hero.y; this.showTransient('LANCER CHARGE / STEP ASIDE', PAL.gold, .48); } } return; }
    if (def.behavior === 'summon') { if (d > e.range) this.moveEnemy(e, dx, dy, e.speed); e.attack -= STEP; if (e.summon <= 0 && this.enemyCount < MAX_ENEMIES - 1) { e.summon = 3.4; this.spawnEnemy('shade', false); kit.audio.sfx('summon', { volume: .42 }); this.showTransient('BELL RINGER / SHADE CALLED', PAL.gold, .7); } if (e.attack <= 0 && d <= e.range) { this.takeDamage(e.damage); e.attack = 1.55; } return; }
    if (def.behavior === 'area') { if (d > e.range) this.moveEnemy(e, dx, dy, e.speed); e.attack -= STEP; if (e.attack <= 0) { this.spawnHazard(e.x, e.y, 34, 1.4, e.damage * .72, 'ember'); e.attack = 1.65; } return; }
    if (def.behavior === 'slam') { if (d > e.range) this.moveEnemy(e, dx, dy, e.speed); e.attack -= STEP; if (e.attack <= 0) this.startTelegraph(e, 'slam'); return; }
    if (def.behavior === 'guard') { e.guard = d < 150 ? .22 : 0; if (d > e.range) this.moveEnemy(e, dx, dy, e.speed); else { e.attack -= STEP; if (e.attack <= 0) { this.takeDamage(e.damage); e.attack = 1.35; } } return; }
    if (def.behavior === 'boss') { if (d > e.range) this.moveEnemy(e, dx, dy, e.speed); else { e.attack -= STEP; if (e.attack <= 0) this.startBossTelegraph(e); } return; }
    if (d > e.range) this.moveEnemy(e, dx, dy, e.speed); else { e.attack -= STEP; if (e.attack <= 0) { this.takeDamage(e.damage); e.attack = 1.35 + run.rng() * .5; } }
  };
  Scene.prototype.interact = function () {
    if (!this.run || this.run.phase !== 'playing' || kit.paused) return; var i, p, a = this.run.artifact;
    if (dist(this.hero.x, this.hero.y, this.run.altar.x, this.run.altar.y) < 42 && !this.run.restUsed) { this.run.restUsed = true; this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + 38); this.emitFx(this.run.altar.x, this.run.altar.y, PAL.moss, 24, 90, 'spark'); this.showTransient('ALTAR RESTORES 38 HP', PAL.moss, .9); kit.audio.sfx('heal', { volume: .58 }); return; }
    for (i = 0; i < this.run.puzzles.length; i++) { p = this.run.puzzles[i]; if (!p.solved && dist(this.hero.x, this.hero.y, p.x, p.y) < 48) { this.run.tutorial.chamber = true; this.openPuzzle(p); return; } }
    if (a && a.active && !a.collected && dist(this.hero.x, this.hero.y, a.x, a.y) < 48) { this.collectArtifact(); return; }
    if (dist(this.hero.x, this.hero.y, this.run.entrance.x, this.run.entrance.y) < 48) this.showTransient(this.run.phase === 'playing' ? 'THE EXIT IS SEALED / CLEAR THE CHAMBER' : 'ENTRANCE READY', PAL.gold, .8);
  };
  Scene.prototype.openPuzzle = function (puzzle) { if (this.puzzleOpen) return; this.activePuzzle = puzzle; this.puzzleOpen = true; this.ui.puzzleHint.setText(puzzle.hint + '\nProgress ' + puzzle.progress + ' / 3'); this.showPuzzleUi(true); kit.audio.sfx('puzzle', { volume: .38 }); this.updateTutorial(); };
  Scene.prototype.showPuzzleUi = function (visible) { var i; var keys = ['puzzleShade', 'puzzleCard', 'puzzleTitle', 'puzzleHint', 'puzzleClose']; for (i = 0; i < keys.length; i++) this.ui[keys[i]].setVisible(visible); for (i = 0; i < this.ui.runes.length; i++) { this.ui.runes[i].bg.setVisible(visible); this.ui.runes[i].text.setVisible(visible); } };
  Scene.prototype.closePuzzle = function () { if (!this.puzzleOpen) return; this.puzzleOpen = false; this.activePuzzle = null; this.showPuzzleUi(false); };
  Scene.prototype.puzzleChoice = function (choice) { if (!this.puzzleOpen || !this.activePuzzle) return; var p = this.activePuzzle; if (p.sequence[p.progress] === choice) { p.progress++; kit.audio.sfx('puzzle', { volume: .32, rate: 1 + p.progress * .08 }); if (p.progress >= p.sequence.length) { p.solved = true; this.run.treasureOpen = true; this.run.artifact.active = true; this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + 22); this.emitFx(p.x, p.y, PAL.violet, 42, 150, 'spark'); this.showTransient('TREASURE UNSEALED / RELIC AWAKENS', PAL.violet, 1.1); kit.audio.sfx('door', { volume: .7 }); this.closePuzzle(); } else this.ui.puzzleHint.setText(p.hint + '\nProgress ' + p.progress + ' / 3'); } else { p.progress = 0; this.ui.puzzleHint.setText('The lock rejects that rhythm. ' + p.hint + '\nProgress 0 / 3'); kit.audio.sfx('hit', { volume: .28, rate: .7 }); } };
  Scene.prototype.collectArtifact = function () { var id = this.run.artifact.id, a = ARTIFACT_BY_ID[id]; if (this.run.artifact.collected) return; this.run.artifact.collected = true; this.run.artifact.active = false; profile.artifacts[id] = true; if (profile.inventory.length < 24) profile.inventory.push({ slot: 'charm', score: 1, power: 1, rarity: 3, name: a.name + ' / RELIC' }); profile.tutorialSeen = true; this.run.tutorial.artifact = true; this.artifactViews[0].setVisible(false); this.emitFx(this.run.artifact.x, this.run.artifact.y, a.color, 48, 170, 'spark'); this.showTransient(a.name + ' / ' + a.effect, a.color, 1.2); kit.audio.sfx('pickup', { volume: .78, rate: 1.22 }); saveProfile(); this.updateTutorial(); };
  Scene.prototype.updateTutorial = function () {
    if (profile.tutorialSeen) { this.ui.coach.setText(this.run && this.run.hint ? this.run.hint : 'EXPLORE THE ROOM / READ EVERY TELEGRAPH'); return; }
    var t = this.run.tutorial, text = !t.moved ? 'MOVE THROUGH THE TOMB / WASD OR ARROWS' : !t.pulse ? 'RIFT PULSE / CLEAR A RING OF SPIRITS' : !t.hook ? 'GRAVEHOOK / PULL THE NEAREST SPIRIT' : !t.chamber ? 'FIND THE VIOLET CHAMBER / PRESS E TO INTERACT' : !t.artifact ? 'SOLVE THE GLYPH LOCK / MOON, EYE, TOOTH' : 'THE RELIC IS YOURS / FIELD MANUAL SHOWS ITS BONUS'; this.ui.coach.setText(text); this.run.hint = text; };
  Scene.prototype.stepSim = function () {
    var run = this.run, hero = this.hero, i, e, d, def, h, f, n;
    if (!run || run.phase !== 'playing' || this.puzzleOpen) return;
    this.simTime += STEP; run.floorTime += STEP; run.totalTime += STEP; this.rushTime = run.totalTime; this.toast.time = Math.max(0, this.toast.time - STEP); hero.pulse = Math.max(0, hero.pulse - STEP); hero.hook = Math.max(0, hero.hook - STEP); hero.dodge = Math.max(0, hero.dodge - STEP); hero.dodgeCooldown = Math.max(0, hero.dodgeCooldown - STEP); hero.invuln = Math.max(0, hero.invuln - STEP); hero.hurt = Math.max(0, hero.hurt - STEP); hero.interact = Math.max(0, hero.interact - STEP);
    var moveLen = Math.hypot(this.moveX, this.moveY); if (moveLen > .01 && hero.dodge <= 0) { this.moveHero(this.moveX / Math.max(1, moveLen), this.moveY / Math.max(1, moveLen)); hero.moving = true; hero.facing = this.moveX < -.1 ? -1 : this.moveX > .1 ? 1 : hero.facing; run.tutorial.moved = true; } else hero.moving = false;
    if (hero.dodge > 0) this.moveHero(hero.dx * 2.8, hero.dy * 2.35);
    if (run.queue.length && run.spawnTimer <= 0 && this.enemyCount < 5) { var nextKind = run.queue[0]; if (this.spawnEnemy(nextKind, isBoss(nextKind))) run.queue.shift(); run.spawnTimer = run.profile.boss && run.queue.length === 0 ? .1 : .68; } else run.spawnTimer -= STEP;
    this.hazardClock -= STEP; if (this.hazardClock <= 0 && !run.profile.boss) { var kinds = run.profile.band.hazards, hazardKind = kinds[Math.floor(run.rng() * kinds.length)] || 'rune'; this.spawnHazard(hero.x + (run.rng() - .5) * 150, hero.y + (run.rng() - .5) * 150, 28 + run.profile.local * 1.2, 1.25, 12 + run.floor * .8, hazardKind); this.hazardClock = run.profile.hazardGap; }
    hero.attack -= STEP; if (hero.attack <= 0) { var target = this.nearestEnemy(); if (target) { var critical = run.rng() < clamp(profile.gear.charm.power * .008, .02, .22), autoDamage = currentDps(profile.gear) * .38 * (critical ? 2 : 1); this.damageEnemy(target, autoDamage, critical ? PAL.gold : PAL.paper); if (critical) this.emitFx(target.x, target.y, PAL.gold, 14, 90, 'spark'); hero.attack = .38; } else hero.attack = .12; }
    for (i = 0; i < MAX_ENEMIES; i++) if ((e = this.enemies[i]).alive) { def = enemyDef(e.kind); this.stepEnemy(e, def); if (run.phase !== 'playing') break; }
    if (run.phase === 'playing') for (i = 0; i < MAX_HAZARDS; i++) if ((h = this.hazards[i]).alive) { h.life -= STEP; h.hit = Math.max(0, h.hit - STEP); if (h.life < h.maxLife - h.warn && h.hit <= 0 && dist(hero.x, hero.y, h.x, h.y) <= h.radius) { this.takeDamage(h.damage); h.hit = .5; } if (h.life <= 0) h.alive = false; }
    for (i = 0; i < MAX_FX; i++) if ((f = this.fx[i]).alive) { f.life -= STEP; f.x += f.vx * STEP; f.y += f.vy * STEP; f.vx *= .94; f.vy *= .94; if (f.life <= 0) f.alive = false; }
    for (i = 0; i < MAX_NUMBERS; i++) if ((n = this.numbers[i]).alive) { n.life -= STEP; n.y -= 25 * STEP; if (n.life <= 0) n.alive = false; }
    if (run.artifact && run.artifact.active && !run.artifact.collected && dist(hero.x, hero.y, run.artifact.x, run.artifact.y) < 32) this.showTransient('RELIC NEARBY / PRESS E TO TAKE IT', ARTIFACT_BY_ID[run.artifact.id].color, .3);
    if (run.phase === 'playing' && !run.queue.length && this.enemyCount === 0 && run.treasureOpen) this.enterClear();
  };
  Scene.prototype.showTransient = function (text, color, seconds) { this.toast.text = String(text); this.toast.color = color || PAL.teal; this.toast.time = seconds || .9; };
  Scene.prototype.enterDeath = function () { if (!this.run || this.run.phase !== 'playing') return; this.run.phase = 'dead'; profile.deaths++; profile.streak = 0; GM_STATE.phase = 'dead'; saveProfile(); this.updateBoundaryUi(); };
  Scene.prototype.enterClear = function () {
    if (!this.run || this.run.phase !== 'playing') return; this.run.phase = this.run.floor === 30 && this.run.mode === 'gauntlet' ? 'win' : 'clear';
    if (this.run.mode === 'gauntlet') { profile.streak++; profile.bestStreak = Math.max(profile.bestStreak, profile.streak); profile.highest = Math.max(profile.highest, this.run.floor); profile.depth = Math.min(30, Math.max(profile.depth, this.run.floor)); profile.bossRush.unlocked = profile.highest >= 10; this.grantClearLoot(); updateMedals(); if (this.run.floor === 30 && (!profile.bestTime || this.run.totalTime < profile.bestTime)) profile.bestTime = this.run.totalTime; }
    else { var rushIndex = BOSS_FLOORS.indexOf(this.run.floor); profile.bossRush.cleared = Math.max(profile.bossRush.cleared, rushIndex + 1); profile.bossRush.medals[['ten', 'twenty', 'thirty'][rushIndex]] = Math.max(profile.bossRush.medals[['ten', 'twenty', 'thirty'][rushIndex]], 1); if (this.run.floor === 30 && (!profile.bossRush.bestTime || this.run.totalTime < profile.bossRush.bestTime)) profile.bossRush.bestTime = this.run.totalTime; this.grantClearLoot(); }
    this.run.medal = this.run.mode === 'boss-rush' ? profile.bossRush.medals[['ten', 'twenty', 'thirty'][BOSS_FLOORS.indexOf(this.run.floor)]] : medalFor(this.run.floor); saveProfile(); GM_STATE.phase = this.run.phase; this.updateBoundaryUi(); kit.audio.sfx('clear', { volume: .72 });
  };
  Scene.prototype.updateBoundaryUi = function () {
    var visible = !!this.run && this.run.phase !== 'playing'; if (!visible) { this.hideBoundary(); return; } var win = this.run.phase === 'win', dead = this.run.phase === 'dead', boss = bossFloor(this.run.floor), required = this.run.floor >= 30 ? 0 : doorRequirement(this.run.floor + 1), enough = this.run.mode === 'boss-rush' || required <= gearScore(profile.gear); var medalName = this.run.medal >= 3 ? 'GOLD' : this.run.medal === 2 ? 'SILVER' : this.run.medal === 1 ? 'BRONZE' : '';
    setTextIfChanged(this.ui.boundaryKicker, dead ? 'RUN BREAK / GEAR KEPT' : win ? 'THRONE FINALE / RUN COMPLETE' : boss ? 'WARDEN DEFEATED / FLOOR ' + String(this.run.floor).padStart(2, '0') + (medalName ? ' / ' + medalName : '') : 'FLOOR CLEAR / ' + this.run.profile.name); setTextIfChanged(this.ui.boundaryTitle, dead ? 'MARCH ENDS' : win ? 'THRONE ANSWERS' : boss ? 'BOSS DEFEAT' : 'FLOOR ' + String(this.run.floor).padStart(2, '0') + ' CLEAR');
    var body = dead ? 'The chamber resets with every equipped item intact. Read the warning, then move through it.' : win ? 'Thirty floors cleared. Best descent ' + fmtTime(profile.bestTime) + '. Relics, gear, and journal entries are saved.' : boss ? 'The burial chamber is open. Best rush ' + (profile.bossRush.bestTime ? fmtTime(profile.bossRush.bestTime) : '--:--') + '. ' + (medalName ? medalName + ' mark earned. ' : '') + 'Next gate: ' + (required ? required + ' gear' : 'the Throne') + '.' : 'Door ' + required + ' gear. You carry ' + gearScore(profile.gear) + '. Relics and inventory stay with the march.';
    setTextIfChanged(this.ui.boundaryBody, body); setTextIfChanged(this.ui.primary, dead ? 'RESTART CHAMBER' : win ? 'DESCEND AGAIN' : enough ? (this.run.mode === 'boss-rush' ? (this.run.floor === 30 ? 'RUN AGAIN' : 'NEXT WARDEN') : 'OPEN ENTRANCE ' + required) : 'REPLAY FOR GEAR'); setColorIfChanged(this.ui.primary, dead || win || enough ? colorCss(PAL.ink) : colorCss(PAL.dim)); this.ui.primaryBg.setFillStyle(dead || win || enough ? PAL.teal : 0x343744, 1); setTextIfChanged(this.ui.secondary, 'FIELD MANUAL');
  };
  Scene.prototype.hideBoundary = function () { var keys = ['boundaryShade', 'boundaryCard', 'boundaryKicker', 'boundaryTitle', 'boundaryBody', 'primaryBg', 'primary', 'secondaryBg', 'secondary']; keys.forEach(function (key) { this.ui[key].setVisible(false); }, this); };
  Scene.prototype.primaryAction = function () {
    if (!this.run) return; if (this.run.phase === 'dead') { this.startFloor(this.run.floor, this.run.mode, false, false); return; } if (this.run.phase === 'win') { this.startFloor(1, 'gauntlet', false, false); return; }
    if (this.run.mode === 'boss-rush') { var rushIndex = BOSS_FLOORS.indexOf(this.run.floor), next = BOSS_FLOORS[rushIndex + 1]; if (next) { this.rushTime = this.run.totalTime; this.startFloor(next, 'boss-rush', false, true); } else this.startFloor(10, 'boss-rush', false, false); return; }
    if (this.run.floor < 30 && gearScore(profile.gear) >= doorRequirement(this.run.floor + 1)) { this.startFloor(this.run.floor + 1, 'gauntlet', false, false); return; } this.startFloor(this.run.floor, this.run.mode, false, false);
  };
  Scene.prototype.secondaryAction = function () { this.openManual(); };
  Scene.prototype.openManual = function () { if (this.manualOpen || this.puzzleOpen) return; this.manualOpen = true; kit.pause('manual'); this.updateManualUi(); };
  Scene.prototype.closeManual = function () { if (!this.manualOpen) return; this.manualOpen = false; this.hideManualUi(); kit.resume('manual'); };
  Scene.prototype.toggleMode = function () { if (!this.manualOpen) return; if (this.run && this.run.mode === 'boss-rush') { this.closeManual(); this.startFloor(profile.depth, 'gauntlet', false, false); return; } if (!bossRushUnlocked()) { this.showTransient('BOSS RUSH LOCKED / CLEAR FLOOR 10', PAL.danger, 1); return; } this.closeManual(); this.startFloor(10, 'boss-rush', false, false); };
  Scene.prototype.updateManualUi = function () {
    var band = bandFor(this.run ? this.run.floor : profile.depth), g = gearScore(profile.gear), m = profile.medals, relicNames = ARTIFACTS.map(function (a) { return (profile.artifacts[a.id] ? '[FOUND] ' : '[????] ') + a.name + ' / ' + a.effect; }).join('\n'), inv = profile.inventory.slice(-8).map(function (item) { return item.name + (item.power ? ' / P' + item.power : ''); }).join('\n') || 'Empty, but the next room is not.';
    var math = 'ROUTE / SURVIVAL\nWASD or arrows move through solid walls. Swipe to dodge. E or Enter interacts with chambers, altars, and relics.\nAuto DPS = weapon power × charm multiplier × relics.\nBest descent: ' + (profile.bestTime ? fmtTime(profile.bestTime) : '--:--') + '\nBest Boss Rush: ' + (profile.bossRush.bestTime ? fmtTime(profile.bossRush.bestTime) : '--:--');
    var bands = 'BANDS / ENTRANCES\n01-10 Sunken Crypt / run start\n11-20 Bone Causeway / clear Floor 10\n21-29 Ashen Vault / clear Floor 20\n30 Gravemarch Throne / final warden\nCurrent: ' + band.name + ' / GEAR ' + g;
    var loot = 'RELIC JOURNAL\n' + relicNames + '\n\nRECENT INVENTORY\n' + inv;
    var medals = 'MEDALS / MAIN DESCENT\nDepth ' + m.depth + '  Streak ' + m.noDeath + '  Gear ' + m.gear + '\nBoss Rush progress: ' + profile.bossRush.cleared + ' / 3' + (bossRushUnlocked() ? ' / UNLOCKED' : ' / LOCKED');
    setTextIfChanged(this.ui.manualText, math); setTextIfChanged(this.ui.manualBand, bands); setTextIfChanged(this.ui.manualLoot, loot); setTextIfChanged(this.ui.manualMedals, medals); setTextIfChanged(this.ui.modeButton, this.run && this.run.mode === 'boss-rush' ? 'RETURN TO GAUNTLET / FLOOR ' + profile.depth : bossRushUnlocked() ? 'ENTER BOSS RUSH / 10 · 20 · 30' : 'BOSS RUSH LOCKED / CLEAR FLOOR 10');
    var keys = ['manualShade', 'manualCard', 'manualKicker', 'manualTitle', 'closeManual', 'closeManualText', 'manualText', 'manualBand', 'manualLoot', 'manualMedals', 'modeButtonBg', 'modeButton', 'manualHint']; keys.forEach(function (key) { this.ui[key].setVisible(true); }, this);
  };
  Scene.prototype.hideManualUi = function () { var keys = ['manualShade', 'manualCard', 'manualKicker', 'manualTitle', 'closeManual', 'closeManualText', 'manualText', 'manualBand', 'manualLoot', 'manualMedals', 'modeButtonBg', 'modeButton', 'manualHint']; keys.forEach(function (key) { this.ui[key].setVisible(false); }, this); };
  Scene.prototype.updateDebug = function () { GM_STATE.mode = this.run ? this.run.mode : GM_STATE.mode; GM_STATE.phase = this.run ? this.run.phase : GM_STATE.phase; GM_STATE.floor = this.run ? this.run.floor : GM_STATE.floor; GM_STATE.gear = gearScore(profile.gear); GM_STATE.hp = Math.max(0, Math.round(this.hero.hp)); GM_STATE.band = this.run && this.run.profile ? this.run.profile.band.key : bandFor(GM_STATE.floor).key; GM_STATE.door = this.run && this.run.floor < 30 ? doorRequirement(this.run.floor + 1) : 0; GM_STATE.drops = GM_STATE.drops.slice(-8); GM_STATE.medals = profile.medals; GM_STATE.relics = profile.artifacts; GM_STATE.forceFloor = DEBUG.forceFloor; GM_STATE.forceGear = DEBUG.forceGear; };
  Scene.prototype.syncHud = function () {
    if (!this.run) return; var band = this.run.profile.band, g = gearScore(profile.gear), door = this.run.floor >= 30 ? 0 : doorRequirement(this.run.floor + 1), hpRatio = clamp(this.hero.hp / Math.max(1, this.hero.maxHp), 0, 1), relicCount = 0, relicIndex;
    for (relicIndex = 0; relicIndex < ARTIFACTS.length; relicIndex++) if (profile.artifacts[ARTIFACTS[relicIndex].id]) relicCount++;
    setTextIfChanged(this.ui.floor, (this.run.mode === 'boss-rush' ? 'RUSH ' : 'FLOOR ') + String(this.run.floor).padStart(2, '0')); setTextIfChanged(this.ui.band, band.name); setTextIfChanged(this.ui.gear, 'GEAR ' + String(g).padStart(3, '0')); setTextIfChanged(this.ui.relics, 'RELICS ' + relicCount + ' / 4'); setTextIfChanged(this.ui.hp, Math.ceil(this.hero.hp) + ' / ' + Math.ceil(this.hero.maxHp)); this.ui.hpBar.width = 220 * hpRatio; setTextIfChanged(this.ui.dps, 'AUTO ' + String(Math.round(currentDps(profile.gear))).padStart(3, '0')); setTextIfChanged(this.ui.door, door ? 'DOOR ' + door : 'FINAL DOOR'); setColorIfChanged(this.ui.door, g >= door || !door ? colorCss(PAL.teal) : colorCss(PAL.danger));
    setTextIfChanged(this.ui.pulse, 'RIFT PULSE\n' + (this.hero.pulse > 0 ? this.hero.pulse.toFixed(1) + 's' : 'READY')); setTextIfChanged(this.ui.hook, 'GRAVEHOOK\n' + (this.hero.hook > 0 ? this.hero.hook.toFixed(1) + 's' : 'READY')); setColorIfChanged(this.ui.pulse, this.hero.pulse > 0 ? colorCss(PAL.dim) : colorCss(PAL.paper)); setColorIfChanged(this.ui.hook, this.hero.hook > 0 ? colorCss(PAL.dim) : colorCss(PAL.paper)); this.bandTint.setFillStyle(band.bg, .18);
    this.ui.transientBg.setVisible(this.toast.time > 0); this.ui.transient.setVisible(this.toast.time > 0); if (this.toast.time > 0) { this.ui.transientBg.setStrokeStyle(1, this.toast.color, .86); setTextIfChanged(this.ui.transient, this.toast.text); setColorIfChanged(this.ui.transient, colorCss(PAL.paper)); }
  };
  Scene.prototype.renderWorldOffset = function () { var i, camX = clamp((this.hero.x - 195) * -.06, -6, 6), camY = clamp((this.hero.y - 470) * -.04, -7, 7); this.cameraX = camX; this.cameraY = camY; this.boardImage.setPosition(W / 2 + camX * .25, H / 2 + camY * .25); this.bandTint.setPosition(W / 2 + camX, 438 + camY); for (i = 0; i < this.worldObjects.length; i++) if (this.worldObjects[i].baseX != null) this.worldObjects[i].setPosition(this.worldObjects[i].baseX + camX, this.worldObjects[i].baseY + camY); for (i = 0; i < this.lightViews.length; i++) if (this.lightViews[i].baseX != null) this.lightViews[i].setPosition(this.lightViews[i].baseX + camX, this.lightViews[i].baseY + camY); };
  Scene.prototype.renderViews = function (juice) {
    var i, e, view, h, f, n, now = this.simTime, d, frame, state, def, sx = juice ? juice.dx : 0, sy = juice ? juice.dy : 0, camX = this.cameraX, camY = this.cameraY;
    this.renderWorldOffset(); this.heroShadow.setPosition(this.hero.x + camX + sx, this.hero.y + 17 + camY + sy); this.heroLight.setPosition(this.hero.x + camX, this.hero.y + camY); this.heroView.setPosition(this.hero.x + camX + sx, this.hero.y + camY + sy); state = this.hero.dodge > 0 ? 'dodge' : this.hero.hurt > 0 ? 'hurt' : this.hero.attack < .12 ? 'attack' : this.hero.moving ? 'walk' : 'idle'; frame = Math.floor(now * 8) % 2; this.heroView.setFrame('hero-' + state + '-' + frame).setAlpha(this.hero.invuln > 0 && Math.floor(now * 20) % 2 === 0 ? .42 : 1).setFlipX(this.hero.facing < 0); this.ui.heroPortrait && this.ui.heroPortrait.setFrame('hero-idle-' + frame);
    var pulseAge = this.simTime - this.pulseStartedAt; this.arenaPulse.setAlpha(pulseAge >= 0 && pulseAge < .72 ? clamp(.8 - pulseAge * 1.2, 0, .8) : 0).setScale(pulseAge >= 0 && pulseAge < .72 ? .4 + pulseAge * 1.2 : .4);
    for (i = 0; i < this.lightViews.length; i++) if (this.lightViews[i].visible) this.lightViews[i].setAlpha(.48 + Math.sin(now * 3 + i) * .08);
    if (this.run && this.run.artifact) { var artifactVisible = this.run.artifact.active && !this.run.artifact.collected; this.artifactViews[0].setVisible(artifactVisible).setPosition(this.run.artifact.x + camX, this.run.artifact.y + camY).setAlpha(artifactVisible ? .75 + Math.sin(now * 5) * .2 : 0); }
    for (i = 0; i < MAX_HAZARDS; i++) { h = this.hazards[i]; view = this.hazardViews[i]; if (!h.alive) { view.setVisible(false); continue; } var hazardTexture = h.kind === 'slam' || h.kind === 'phase' ? 'gm-slam' : h.kind === 'spikes' ? 'gm-spikes' : h.kind === 'lane' || h.kind === 'cross' ? 'gm-lane' : h.kind === 'crack' ? 'gm-crack' : h.kind === 'ember' ? 'gm-ember' : h.kind === 'arrow' ? 'gm-arrow' : 'gm-ring'; view.setTexture(hazardTexture).setVisible(true).setPosition(h.x + camX + sx, h.y + camY + sy).setScale(h.radius / 52).setAlpha(h.life > h.maxLife - h.warn ? .32 + Math.sin(now * 18) * .1 : .72).setTint(h.kind === 'phase' || h.kind === 'slam' ? PAL.violet : h.kind === 'arrow' ? PAL.danger : bandFor(this.run.floor).accent); }
    for (i = 0; i < MAX_ENEMIES; i++) { e = this.enemies[i]; view = this.enemyViews[i]; if (!e.alive) { view.sprite.setVisible(false); view.bar.setVisible(false); view.intent.setVisible(false); continue; } def = enemyDef(e.kind); d = isBoss(e.kind) ? 1.42 : 1.02; state = e.hurt > 0 ? 'hurt' : e.telegraph ? 'attack' : e.stun > 0 ? 'dodge' : (def.behavior === 'area' || def.family === 'shade') ? 'float' : 'idle'; view.sprite.setVisible(true).setPosition(e.x + camX + sx, e.y + camY + sy).setFrame((def.family || 'shade') + '-' + state + '-' + (Math.floor(e.anim * 8) % 2)).setDisplaySize(62 * d, 62 * d).setTint(e.hurt > 0 ? PAL.white : 0xffffff); view.bar.setVisible(true).setPosition(e.x + camX, e.y - e.radius - (isBoss(e.kind) ? 32 : 20) + camY).setSize(isBoss(e.kind) ? 94 : 52, 5).setFillStyle(def.tint, 1); view.bar.width = (isBoss(e.kind) ? 94 : 52) * clamp(e.hp / Math.max(1, e.maxHp), 0, 1); if (e.telegraph) view.intent.setVisible(true).setPosition(e.telegraphX + camX, e.telegraphY + camY).setScale(e.telegraphRadius / 52).setTint(e.telegraphKind === 'arrow' ? PAL.danger : def.tint).setAlpha(.42 + Math.sin(now * 20) * .2); else view.intent.setVisible(false); }
    for (i = 0; i < MAX_FX; i++) { f = this.fx[i]; view = this.fxViews[i]; if (!f.alive) { view.setVisible(false); continue; } view.setTexture(f.shape === 'spark' ? 'gm-spark' : 'gm-dot').setVisible(true).setPosition(f.x + camX + sx, f.y + camY + sy).setDisplaySize(f.size, f.size).setTint(f.color).setAlpha(clamp(f.life / f.maxLife, 0, 1)); }
    for (i = 0; i < MAX_NUMBERS; i++) { n = this.numbers[i]; view = this.numberViews[i]; if (!n.alive) { view.setVisible(false); continue; } view.setVisible(true).setPosition(n.x + camX, n.y + camY); setTextIfChanged(view, n.value); setColorIfChanged(view, colorCss(n.color)); view.setAlpha(clamp(n.life / n.maxLife, 0, 1)); }
    var req = this.run.floor >= 30 ? 0 : doorRequirement(this.run.floor + 1), g = gearScore(profile.gear); this.doorImage.setTint(req && g < req ? PAL.danger : this.run.floor >= 30 ? PAL.violet : PAL.gold); setTextIfChanged(this.doorReq, req ? 'REQ ' + req : 'THRONE'); setTextIfChanged(this.doorNext, req ? 'YOU ' + g : 'FINAL'); setColorIfChanged(this.doorReq, colorCss(req && g < req ? PAL.danger : PAL.gold));
    var boundary = this.run.phase !== 'playing' && !this.manualOpen; for (i = 0; i < BOUNDARY_KEYS.length; i++) this.ui[BOUNDARY_KEYS[i]].setVisible(boundary); this.syncHud(); this.updateDebug();
  };
  Scene.prototype.update = function (time, delta) {
    this.readDebugSwitches(); this.moveX = 0; this.moveY = 0; this.pollPointers(); this.pollGamepad(); this.pollKeyboard(); var juice = kit.juice.frame(), wall = clamp((Number(delta) || 0) / 1000, 0, .1);
    if (!kit.paused && !this.manualOpen && !this.puzzleOpen && !juice.frozen) { this.accumulator = Math.min(this.accumulator + wall, STEP * MAX_STEPS); var steps = 0; while (this.accumulator >= STEP && steps < MAX_STEPS) { this.stepSim(); this.accumulator -= STEP; steps++; } }
    this.renderViews(juice); if (this.manualOpen) this.updateManualUi();
  };

  var config = { type: Phaser.CANVAS, parent: 'game', width: W, height: H, backgroundColor: '#080b14', render: { pixelArt: true, antialias: false, roundPixels: true, clearBeforeRender: true }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H }, fps: { target: 60, min: 30 }, scene: Scene };
  App.game = new Phaser.Game(config); kit.loader.progress(1);
}());
