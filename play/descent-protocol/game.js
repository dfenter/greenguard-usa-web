/* Descent Protocol - F3 AAA rebuild
 * Phaser 3 is the renderer. GGKit owns lifecycle, input identity, saves,
 * audio buses, pause, reduced motion, and PWA registration.
 *
 * The simulation is fixed-step. A slow device consumes its queued steps and
 * falls into slow motion instead of advancing a clock past the stepped sim.
 * Pools are bounded and render state lives beside, never on, sim entities.
 */
(function () {
  'use strict';

  var STEP = 1 / 60;
  var MAX_STEPS = 5;
  var WORLD_W = 900;
  var WORLD_H = 1380;
  var TAU = Math.PI * 2;
  var MAX_ENEMIES = 48;
  var MAX_BULLETS = 180;
  var MAX_PICKUPS = 64;
  var MAX_RINGS = 24;
  var MAX_POPUPS = 20;
  var MAX_DEATH_ACTORS = 32;
  var SAVE_VERSION = 4;
  var PARTICLE_CAPS = { muzzle: 72, impact: 84, smoke: 48, death: 84, telegraph: 40, pickup: 72, coolant: 64 };
  var PARTICLE_SYSTEMS = ['muzzle', 'impact', 'smoke', 'death', 'telegraph', 'pickup', 'coolant'];

  var PAL = {
    ink: 0x071116, deep: 0x0b1c23, floor: 0x142a31, floor2: 0x19343b,
    wall: 0x3e6470, wallHi: 0x77aab1, white: 0xe8ffff, mist: 0x91bfc0,
    cyan: 0x55e8dc, amber: 0xffc85d, violet: 0xb58cff, rose: 0xff6d85,
    green: 0x77ec9b, orange: 0xff8d56, blue: 0x62b8ff, red: 0xff536d,
    slate: 0x24434c, shadow: 0x061014, gold: 0xffe28a, coolant: 0x8ff7ff,
    alarm: 0xff3f64
  };
  var CSS = {
    white: '#e8ffff', mist: '#91bfc0', cyan: '#55e8dc', amber: '#ffc85d',
    violet: '#b58cff', rose: '#ff6d85', green: '#77ec9b', orange: '#ff8d56',
    blue: '#62b8ff', red: '#ff536d'
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function distance(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function angleDiff(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
  function colorCss(n) { return '#' + ('000000' + n.toString(16)).slice(-6); }
  function fmtInt(n) { return String(Math.max(0, Math.floor(n))).padStart(3, '0'); }
  function fmtTime(value) {
    var t = Math.max(0, Math.floor(value));
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  }
  function setTextIfChanged(obj, value) {
    if (!obj || obj.text === value) return;
    obj.setText(value);
  }
  function makeRng(seed) {
    var value = seed >>> 0;
    return function () {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }
  function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }

  var KEY_COLORS = { amber: PAL.amber, cyan: PAL.cyan, violet: PAL.violet, rose: PAL.rose };
  var ENEMY_STATS = {
    scout: { hp: 34, speed: 94, radius: 14, damage: 14, color: PAL.orange, range: 30 },
    gunner: { hp: 54, speed: 48, radius: 16, damage: 9, color: PAL.red, range: 430 },
    flanker: { hp: 42, speed: 74, radius: 14, damage: 18, color: PAL.violet, range: 36 },
    bruiser: { hp: 118, speed: 34, radius: 22, damage: 22, color: PAL.amber, range: 42 },
    turret: { hp: 86, speed: 0, radius: 20, damage: 13, color: PAL.blue, range: 520 },
    patrol: { hp: 48, speed: 62, radius: 15, damage: 15, color: PAL.cyan, range: 42 },
    hunter: { hp: 72, speed: 92, radius: 17, damage: 19, color: PAL.rose, range: 52 },
    swarm: { hp: 22, speed: 116, radius: 10, damage: 8, color: PAL.violet, range: 28 },
    sentinel: { hp: 760, speed: 32, radius: 46, damage: 22, color: PAL.rose, range: 520 }
  };

  var WEAPONS = [
    { key: 'sidearm', name: 'SIDEARM', short: 'S-9', color: PAL.cyan, mag: 12, reserve: 54,
      cooldown: 0.18, reload: 0.72, damage: 18, speed: 760, pellets: 1, spread: 0.035,
      kick: 0.06, recoil: 0.14, sound: 'weapon_fire_1' },
    { key: 'scatter', name: 'SCATTER', short: 'SG-4', color: PAL.amber, mag: 6, reserve: 24,
      cooldown: 0.68, reload: 1.08, damage: 12, speed: 560, pellets: 7, spread: 0.28,
      kick: 0.17, recoil: 0.26, sound: 'weapon_fire_2' },
    { key: 'rifle', name: 'RIFLE', short: 'AR-7', color: PAL.rose, mag: 24, reserve: 72,
      cooldown: 0.095, reload: 1.52, damage: 10, speed: 900, pellets: 1, spread: 0.018,
      kick: 0.035, recoil: 0.08, sound: 'weapon_fire_3' }
  ];
  var WEAPON_BY_KEY = {};
  for (var wi = 0; wi < WEAPONS.length; wi++) WEAPON_BY_KEY[WEAPONS[wi].key] = WEAPONS[wi];

  var FLOOR_FAMILIES = [
    { key: 'server', label: 'SERVER BLOCK', subtitle: 'Cold storage / packet ghosts', accent: PAL.cyan,
      ambient: 0x10323b, par: 76, seed: 0x71A4, rooms: ['INTAKE', 'AUTH NODE', 'ARCHIVE', 'FIREWALL', 'UPLINK'],
      kinds: ['scout', 'gunner', 'flanker', 'turret', 'bruiser'], signature: 'SIGNATURE: BLACK ICE VAULT',
      mechanic: 'RELAY NETWORK', mechanicText: 'RELAY NODES REVEAL THE NEXT CARD', corridorWidth: 64,
      roomShapes: [[300, 190], [238, 210], [320, 180], [250, 230], [340, 198]], hazardType: 'relay',
      pacing: [[['scout', 3]], [['scout', 2], ['gunner', 1]], [['flanker', 2], ['gunner', 1]], [['turret', 1], ['gunner', 2]], [['bruiser', 1], ['flanker', 2]]],
      positions: [[210, 1160], [650, 980], [230, 750], [650, 520], [410, 250]] },
    { key: 'reactor', label: 'REACTOR RING', subtitle: 'Heat bloom / unstable routing', accent: PAL.amber,
      ambient: 0x362819, par: 84, seed: 0xA29D, rooms: ['COIL ENTRY', 'PUMP HALL', 'CORE RING', 'MELTDOWN', 'LIFT CHAMBER'],
      kinds: ['scout', 'flanker', 'gunner', 'bruiser', 'turret'], signature: 'SIGNATURE: RADIANT CORE',
      mechanic: 'THERMAL RUN', mechanicText: 'HEAT ZONES SURGE IN THE CORE RING', corridorWidth: 58,
      roomShapes: [[260, 220], [300, 170], [240, 240], [300, 190], [260, 220]], hazardType: 'heat',
      pacing: [[['scout', 3]], [['scout', 2], ['flanker', 1]], [['gunner', 2], ['turret', 1]], [['bruiser', 1], ['flanker', 2], ['gunner', 1]], [['turret', 2], ['bruiser', 1]]],
      positions: [[410, 1160], [180, 940], [650, 720], [180, 470], [650, 250]] },
    { key: 'cargo', label: 'CARGO HOLD', subtitle: 'Containers / blind corners', accent: PAL.violet,
      ambient: 0x211d3a, par: 92, seed: 0xC341, rooms: ['DOCK SEVEN', 'STACK ALPHA', 'MANIFEST', 'STACK OMEGA', 'FLIGHT DECK'],
      kinds: ['scout', 'gunner', 'flanker', 'bruiser', 'turret'], signature: 'SIGNATURE: CONTAINER MAZE',
      mechanic: 'CONTAINER MAZE', mechanicText: 'CRATES BREAK SIGHTLINES AND CREATE LANES', corridorWidth: 76,
      roomShapes: [[320, 176], [270, 224], [340, 190], [270, 224], [320, 176]], hazardType: 'cargo',
      pacing: [[['scout', 4]], [['flanker', 2], ['gunner', 1]], [['scout', 2], ['gunner', 2]], [['bruiser', 1], ['flanker', 3]], [['turret', 2], ['gunner', 2]]],
      positions: [[170, 1160], [650, 970], [170, 720], [650, 470], [410, 250]] },
    { key: 'spire', label: 'COMMAND SPIRE', subtitle: 'Open sightlines / counterfire', accent: PAL.rose,
      ambient: 0x351d2a, par: 101, seed: 0xE511, rooms: ['LOWER GATE', 'SIGNAL DECK', 'WAR ROOM', 'CROWN STAIRS', 'COMMAND LIFT'],
      kinds: ['flanker', 'gunner', 'turret', 'bruiser', 'scout'], signature: 'SIGNATURE: CROSSfire BALCONY',
      mechanic: 'CROSSFIRE DECK', mechanicText: 'CROSSFIRE BEAMS PULSE THROUGH OPEN ROOMS', corridorWidth: 62,
      roomShapes: [[280, 188], [280, 188], [360, 170], [280, 188], [320, 214]], hazardType: 'crossfire',
      pacing: [[['scout', 3], ['flanker', 1]], [['gunner', 2], ['flanker', 2]], [['turret', 2], ['gunner', 2]], [['bruiser', 2], ['flanker', 2]], [['turret', 2], ['bruiser', 2], ['gunner', 1]]],
      positions: [[410, 1160], [410, 920], [410, 680], [410, 440], [410, 220]] },
    { key: 'vault', label: 'THE VAULT', subtitle: 'Seals / dormant systems', accent: PAL.gold,
      ambient: 0x332719, par: 118, seed: 0xF0A7, rooms: ['SEAL GATE', 'RELIC STACK', 'BLACK CHAPEL', 'SENTINEL LOCK', 'VAULT HEART'],
      kinds: ['patrol', 'hunter', 'gunner', 'bruiser', 'turret'], signature: 'SIGNATURE: DORMANT VAULT', boss: false,
      mechanic: 'SENTINEL CORE', mechanicText: 'PHASE TELEGRAPHS EXPOSE THE CORE', corridorWidth: 70,
      roomShapes: [[300, 190], [240, 230], [300, 210], [260, 220], [360, 250]], hazardType: 'vault',
      pacing: [[['patrol', 2], ['swarm', 2]], [['hunter', 2], ['gunner', 2]], [['bruiser', 1], ['hunter', 3]], [['turret', 2], ['gunner', 2], ['bruiser', 1]], [['patrol', 2], ['hunter', 2]]],
      positions: [[200, 1160], [650, 950], [200, 710], [650, 470], [410, 210]] },
    { key: 'cryo', label: 'CRYO ARRAY', subtitle: 'Whiteout / frozen alarms', accent: PAL.blue,
      ambient: 0x12283b, par: 128, seed: 0x1B6D, rooms: ['FROST INTAKE', 'COIL VAULT', 'ICE LOCK', 'THAW CHAMBER', 'CRYO LIFT'],
      kinds: ['patrol', 'hunter', 'turret', 'swarm', 'bruiser'], signature: 'SIGNATURE: WHITEOUT LOCK',
      mechanic: 'CRYO VENTS', mechanicText: 'VENTS HIDE OPERATORS FROM CAMERA SWEEPS', corridorWidth: 58,
      roomShapes: [[250, 200], [320, 172], [250, 230], [320, 172], [300, 220]], hazardType: 'cryo',
      pacing: [[['patrol', 3]], [['hunter', 2], ['swarm', 3]], [['turret', 1], ['patrol', 2]], [['bruiser', 1], ['hunter', 2], ['swarm', 3]], [['turret', 2], ['hunter', 2]]],
      positions: [[410, 1160], [180, 930], [650, 710], [190, 465], [650, 235]] },
    { key: 'biolab', label: 'BIOLAB RING', subtitle: 'Glass growth / live circuits', accent: PAL.green,
      ambient: 0x123329, par: 137, seed: 0x2C91, rooms: ['DECON', 'CULTURE', 'OBSERVATORY', 'GENE BANK', 'AIRLOCK'],
      kinds: ['swarm', 'hunter', 'patrol', 'turret', 'bruiser'], signature: 'SIGNATURE: CULTURE MAZE',
      mechanic: 'BIOFLOOD', mechanicText: 'COOLANT POOLS BREAK LINE OF SIGHT', corridorWidth: 66,
      roomShapes: [[280, 180], [300, 210], [340, 180], [280, 220], [320, 210]], hazardType: 'bio',
      pacing: [[['swarm', 5]], [['patrol', 2], ['hunter', 2]], [['turret', 2], ['swarm', 4]], [['bruiser', 1], ['hunter', 3]], [['patrol', 2], ['turret', 2], ['swarm', 3]]],
      positions: [[190, 1160], [660, 950], [180, 700], [650, 460], [410, 220]] },
    { key: 'blacksite', label: 'BLACKSITE', subtitle: 'Redacted / counter-surveillance', accent: PAL.violet,
      ambient: 0x261d3c, par: 148, seed: 0x3DA2, rooms: ['CHECKPOINT', 'SIGNAL BLACK', 'EVIDENCE', 'GHOST FLOOR', 'EXTRACTION'],
      kinds: ['patrol', 'turret', 'hunter', 'swarm', 'bruiser'], signature: 'SIGNATURE: GHOST FLOOR',
      mechanic: 'COUNTER-SURVEILLANCE', mechanicText: 'DISABLE CAMERAS OR CROSS THEIR BLIND SIDES', corridorWidth: 54,
      roomShapes: [[310, 170], [260, 230], [330, 180], [260, 230], [340, 190]], hazardType: 'blacksite',
      pacing: [[['patrol', 3], ['turret', 1]], [['hunter', 2], ['swarm', 4]], [['turret', 2], ['patrol', 2]], [['bruiser', 1], ['hunter', 3], ['patrol', 2]], [['turret', 2], ['hunter', 3], ['swarm', 4]]],
      positions: [[410, 1160], [180, 930], [650, 700], [180, 465], [650, 235]] },
    { key: 'core', label: 'REACTOR CORE', subtitle: 'Overload / final descent', accent: PAL.orange,
      ambient: 0x3a211d, par: 162, seed: 0x4EF4, rooms: ['OUTER RING', 'FUEL BRIDGE', 'CONTROL WELL', 'MELTDOWN', 'SENTINEL CORE'],
      kinds: ['patrol', 'hunter', 'turret', 'swarm', 'sentinel'], signature: 'SIGNATURE: SENTINEL ASCENSION', boss: true,
      mechanic: 'CORE OVERLOAD', mechanicText: 'BREAK LOCKDOWN WINDOWS TO EXPOSE THE SENTINEL', corridorWidth: 72,
      roomShapes: [[290, 190], [330, 180], [280, 240], [330, 190], [380, 260]], hazardType: 'core',
      pacing: [[['patrol', 3], ['swarm', 3]], [['hunter', 3], ['turret', 1]], [['bruiser', 1], ['hunter', 3], ['swarm', 3]], [['turret', 2], ['patrol', 2], ['hunter', 3]], [['sentinel', 1]]],
      positions: [[200, 1160], [660, 950], [200, 700], [650, 460], [410, 220]] }
  ];
  var FAMILY_BY_KEY = {};
  for (var fi = 0; fi < FLOOR_FAMILIES.length; fi++) FAMILY_BY_KEY[FLOOR_FAMILIES[fi].key] = FLOOR_FAMILIES[fi];

  var DP_DEBUG_STATE = {
    mode: 'normal', score: 0, floor: 1, room: 'server-0', weapon: 'sidearm', cards: 0,
    cardsTotal: 4, roomClear: false, bossPhase: 0, forceFloor: 0, forceRoom: ''
  };
  var debugApi = { state: DP_DEBUG_STATE, forceFloor: 0, forceRoom: '' };
  var lastApiForceFloor = 0, lastApiForceRoom = '';
  if (typeof window !== 'undefined') window.__dp = debugApi;

  function defaultProfile() {
    return { version: SAVE_VERSION, bestScore: 0, unlockedFloor: 1, tutorialDone: false,
      medals: {}, bestTimes: {}, bestAccuracy: {}, cards: {}, cameraDisables: {}, stealthClears: {},
      weaponUnlocks: { sidearm: true, scatter: true, rifle: true }, alarmBest: 0, completedRuns: 0 };
  }
  function isRecord(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function validStoredProfile(o) {
    if (!isRecord(o) || (o.version !== 3 && o.version !== SAVE_VERSION)) return false;
    if (!Number.isFinite(o.bestScore) || o.bestScore < 0 || o.bestScore > 99999999) return false;
    if (!Number.isInteger(o.unlockedFloor) || o.unlockedFloor < 1 || o.unlockedFloor > FLOOR_FAMILIES.length) return false;
    if (typeof o.tutorialDone !== 'boolean') return false;
    if (!isRecord(o.medals) || !isRecord(o.bestTimes) || !isRecord(o.bestAccuracy)) return false;
    for (var key in o.medals) if (own(o.medals, key) && (!/^[1-9]$/.test(key) || !Number.isInteger(o.medals[key]) || o.medals[key] < 0 || o.medals[key] > 3)) return false;
    for (var timeKey in o.bestTimes) if (own(o.bestTimes, timeKey) && (!/^[1-9]$/.test(timeKey) || !Number.isFinite(o.bestTimes[timeKey]) || o.bestTimes[timeKey] < 0 || o.bestTimes[timeKey] > 9999)) return false;
    for (var accKey in o.bestAccuracy) if (own(o.bestAccuracy, accKey) && (!/^[1-9]$/.test(accKey) || !Number.isFinite(o.bestAccuracy[accKey]) || o.bestAccuracy[accKey] < 0 || o.bestAccuracy[accKey] > 1)) return false;
    if (o.version === SAVE_VERSION) {
      if (!isRecord(o.cards) || !isRecord(o.cameraDisables) || !isRecord(o.stealthClears) || !isRecord(o.weaponUnlocks)) return false;
      if (typeof o.weaponUnlocks.sidearm !== 'boolean' || typeof o.weaponUnlocks.scatter !== 'boolean' || typeof o.weaponUnlocks.rifle !== 'boolean') return false;
      if (!Number.isFinite(o.alarmBest) || o.alarmBest < 0 || o.alarmBest > 1 || !Number.isInteger(o.completedRuns) || o.completedRuns < 0) return false;
    }
    return true;
  }
  function migrateProfile(raw) {
    var fresh = defaultProfile();
    if (!validStoredProfile(raw)) return fresh;
    fresh.bestScore = raw.bestScore;
    fresh.unlockedFloor = Math.min(FLOOR_FAMILIES.length, raw.unlockedFloor);
    fresh.tutorialDone = raw.tutorialDone;
    for (var key in raw.medals) if (own(raw.medals, key) && Number(key) <= FLOOR_FAMILIES.length) fresh.medals[key] = raw.medals[key];
    for (var timeKey in raw.bestTimes) if (own(raw.bestTimes, timeKey) && Number(timeKey) <= FLOOR_FAMILIES.length) fresh.bestTimes[timeKey] = raw.bestTimes[timeKey];
    for (var accKey in raw.bestAccuracy) if (own(raw.bestAccuracy, accKey) && Number(accKey) <= FLOOR_FAMILIES.length) fresh.bestAccuracy[accKey] = raw.bestAccuracy[accKey];
    if (raw.version === SAVE_VERSION) {
      for (var cardKey in raw.cards) if (own(raw.cards, cardKey)) fresh.cards[cardKey] = raw.cards[cardKey];
      for (var cameraKey in raw.cameraDisables) if (own(raw.cameraDisables, cameraKey)) fresh.cameraDisables[cameraKey] = raw.cameraDisables[cameraKey];
      for (var stealthKey in raw.stealthClears) if (own(raw.stealthClears, stealthKey)) fresh.stealthClears[stealthKey] = raw.stealthClears[stealthKey];
      fresh.weaponUnlocks = { sidearm: raw.weaponUnlocks.sidearm, scatter: raw.weaponUnlocks.scatter, rifle: raw.weaponUnlocks.rifle };
      fresh.alarmBest = raw.alarmBest; fresh.completedRuns = raw.completedRuns;
    }
    return fresh;
  }

  var Game = { phaser: null, scene: null };
  var kit = GGKit.create({
    slug: 'descent-protocol', orientation: 'portrait', validateSave: validStoredProfile,
    onPause: function () { if (Game.scene) Game.scene.setPaused(true); },
    onResume: function () { if (Game.scene) Game.scene.setPaused(false); },
    onRestart: function () { if (Game.scene) Game.scene.hardRestart(); }
  });
  kit.audio.register({
    ambient_hum: 'assets/ambient_hum.mp3', weapon_fire_1: 'assets/weapon_fire_1.mp3',
    weapon_fire_2: 'assets/weapon_fire_2.mp3', weapon_fire_3: 'assets/weapon_fire_3.mp3',
    door_chime: 'assets/door_chime.mp3', keycard_chime: 'assets/keycard_chime.mp3',
    hit_impact: 'assets/hit_impact.mp3', boss_phase: 'assets/boss_phase.mp3', danger_intensity: 'assets/danger_intensity.mp3',
    reload_click: 'assets/reload_click.mp3', pickup_ping: 'assets/pickup_ping.mp3', warning_beep: 'assets/warning_beep.mp3',
    room_clear: 'assets/room_clear.mp3', victory_fanfare: 'assets/victory_fanfare.mp3'
  });
  kit.registerPWA();
  /* Pointer claims live on window and are registered after GGKit's listener.
   * Phaser still renders the canvas, but never owns the identity map. */
  if (typeof window !== 'undefined') {
    window.addEventListener('pointerdown', function (event) { if (Game.scene) Game.scene.handleWindowPointer('down', event); }, { passive: true });
    window.addEventListener('pointermove', function (event) { if (Game.scene) Game.scene.handleWindowPointer('move', event); }, { passive: true });
    window.addEventListener('pointerup', function (event) { if (Game.scene) Game.scene.handleWindowPointer('up', event); }, { passive: true });
    window.addEventListener('pointercancel', function (event) { if (Game.scene) Game.scene.handleWindowPointer('up', event); }, { passive: true });
  }
  kit.loader.show('DESCENT PROTOCOL');
  kit.loader.progress(0.35);

  var profile = migrateProfile(kit.save.get(null));
  var params = new URLSearchParams(location.search);
  if (params.get('mode') === 'speed') DP_DEBUG_STATE.mode = 'speedrun';

  function saveProfile() { kit.save.set(profile); }
  function familyForFloor(no) { return FLOOR_FAMILIES[no - 1] || FLOOR_FAMILIES[0]; }
  function enemyStats(kind) { return ENEMY_STATS[kind] || ENEMY_STATS.scout; }

  function blankEnemy() {
    return { active: false, kind: 'scout', roomIndex: 0, x: 0, y: 0, hp: 0, maxHp: 0, radius: 12,
      speed: 0, damage: 0, color: PAL.orange, facing: 0, cooldown: 0, alert: 0, state: 'patrol',
      coverX: 0, coverY: 0, patrolX: 0, patrolY: 0, flankSide: 1, seed: 0, phase: 1, phaseSeen: 1, boss: false, flash: 0, stun: 0,
      animState: 'idle', animTime: 0, telegraph: 0, anticipation: 0, recovery: 0, tutorial: false };
  }
  function blankBullet() { return { active: false, friendly: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, damage: 0, radius: 3, color: PAL.white, enemyIndex: -1 }; }
  function blankPickup() { return { active: false, type: 'ammo', x: 0, y: 0, amount: 0, roomIndex: 0, bob: 0 }; }
  function blankParticle() { return { active: false, type: 'spark', x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, color: PAL.white, alpha: 1 }; }
  function blankRing() { return { active: false, x: 0, y: 0, radius: 0, life: 0, max: 1, color: PAL.white, width: 2 }; }
  function blankPopup() { return { active: false, x: 0, y: 0, text: '', color: PAL.white, life: 0 }; }
  function blankDeathActor() { return { active: false, kind: 'scout', x: 0, y: 0, radius: 12, color: PAL.white, facing: 0, life: 0, max: 0.42, phase: 0 }; }

  function PlayScene() { Phaser.Scene.call(this, { key: 'play' }); }
  PlayScene.prototype = Object.create(Phaser.Scene.prototype);
  PlayScene.prototype.constructor = PlayScene;

  PlayScene.prototype.init = function () {
    this.pausedByKit = false;
    this.accumulator = 0;
    this.simTime = 0;
    this.floor = null;
    this.player = { x: 0, y: 0, vx: 0, vy: 0, health: 100, maxHealth: 100, armor: 0,
      face: 0, weapon: 0, recoil: 0, invuln: 0, fireFlash: 0, fireRecover: 0, movePhase: 0, animState: 'idle', stealth: false };
    this.run = { mode: DP_DEBUG_STATE.mode, floorNo: 1, score: 0, floorTime: 0, totalTime: 0,
      roomsCleared: 0, cardsFound: 0, shots: 0, hits: 0, floorShots: 0, floorHits: 0, state: 'play', roomIndex: 0,
      banner: { active: false, age: 0, head: '', sub: '', color: PAL.cyan },
      tutorialStep: profile.tutorialDone ? 4 : 0, tutorialFade: 0, tutorialShownStep: -1, light: { active: false, x: 0, y: 0, color: PAL.cyan, age: 0 },
      muzzleLight: { active: false, x: 0, y: 0, angle: 0, color: PAL.cyan, age: 0 },
      alarm: 0, alarmPeak: 0, alarmLatched: false, securityCompromised: false, rewardTier: 0, rewardPulse: 0,
      floorWon: false, bossDefeated: false, hitStop: 0, weaponMods: [0, 0, 0], damagePulse: 0, endReveal: 0,
      tutorialActive: !profile.tutorialDone, tutorialSpawned: false, tutorialEnemyDefeated: false,
      weapons: WEAPONS.map(function (w) { return { mag: w.mag, reserve: w.reserve, reload: 0, cooldown: 0 }; }) };
    this.inputState = { moveId: null, aimId: null, fireId: null, moveX: 0, moveY: 0,
      aimX: 0, aimY: 0, mouseX: 0, mouseY: 0, directAim: false, autoAim: true, aimDX: 0, aimDY: -1, aimRelative: false,
      prevQ: false, prevE: false, prevR: false, prevT: false, prevM: false,
      prevEnter: false, prevFloorKeys: [false, false, false, false, false, false, false, false, false], lastPointerType: 'mouse' };
    this.gamepadState = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, swapLeft: false, swapRight: false, reload: false, restart: false,
      prevSwapLeft: false, prevSwapRight: false, prevReload: false, prevRestart: false };
    this.enemies = [];
    this.bullets = [];
    this.pickups = [];
    this.rings = [];
    this.popups = [];
    this.deathActors = [];
    this.particleSystems = {};
    for (var particleSystemIndex = 0; particleSystemIndex < PARTICLE_SYSTEMS.length; particleSystemIndex++) {
      var particleSystemName = PARTICLE_SYSTEMS[particleSystemIndex], pool = [];
      for (var particleIndex = 0; particleIndex < PARTICLE_CAPS[particleSystemName]; particleIndex++) pool.push(blankParticle());
      this.particleSystems[particleSystemName] = pool;
    }
    this.worldLabels = [];
    this.worldPopupTexts = [];
    this.worldLabelCursor = 0;
    this.worldPopupCursor = 0;
    this.toastText = '';
    this.toastColor = PAL.white;
    this.toastAge = 0;
    this.toastQueue = [];
    for (var i = 0; i < MAX_ENEMIES; i++) this.enemies.push(blankEnemy());
    for (var j = 0; j < MAX_BULLETS; j++) this.bullets.push(blankBullet());
    for (var k = 0; k < MAX_PICKUPS; k++) this.pickups.push(blankPickup());
    for (var r = 0; r < MAX_RINGS; r++) this.rings.push(blankRing());
    for (var q = 0; q < MAX_POPUPS; q++) this.popups.push(blankPopup());
    for (var d = 0; d < MAX_DEATH_ACTORS; d++) this.deathActors.push(blankDeathActor());
    this.audioDanger = false;
    this.audioDangerTimer = 0;
    this.prewarmed = false;
  };

  PlayScene.prototype.preload = function () {
    var images = {
      'floor-panel': 'assets/floor-panel.svg', 'room-panel': 'assets/room-panel.svg', 'cover-crate': 'assets/cover-crate.svg',
      'door-panel': 'assets/door-panel.svg', 'keycard': 'assets/keycard.svg', 'lift-panel': 'assets/lift-panel.svg', 'vent-panel': 'assets/vent-panel.svg',
      'operator-idle': 'assets/operator-idle.svg', 'operator-move': 'assets/operator-move.svg', 'operator-fire': 'assets/operator-fire.svg',
      'enemy-scout': 'assets/enemy-scout.svg', 'enemy-gunner': 'assets/enemy-gunner.svg', 'enemy-flanker': 'assets/enemy-flanker.svg',
      'enemy-bruiser': 'assets/enemy-bruiser.svg', 'enemy-turret': 'assets/enemy-turret.svg', 'enemy-sentinel': 'assets/enemy-sentinel.svg',
      'pickup-health': 'assets/pickup-health.svg', 'pickup-armor': 'assets/pickup-armor.svg', 'pickup-ammo': 'assets/pickup-ammo.svg', 'pickup-mod': 'assets/pickup-mod.svg'
    };
    for (var key in images) this.load.image(key, images[key]);
    this.prewarmEffects();
    kit.loader.progress(0.84);
  };

  PlayScene.prototype.prewarmEffects = function () {
    /* Pools are allocated and touched while GGKit's loading shell is visible. */
    for (var systemIndex = 0; systemIndex < PARTICLE_SYSTEMS.length; systemIndex++) {
      var pool = this.particleSystems[PARTICLE_SYSTEMS[systemIndex]];
      for (var particleIndex = 0; particleIndex < pool.length; particleIndex++) {
        pool[particleIndex].active = false; pool[particleIndex].life = 0; pool[particleIndex].max = 1;
      }
    }
    for (var ringIndex = 0; ringIndex < this.rings.length; ringIndex++) { this.rings[ringIndex].active = false; this.rings[ringIndex].life = 0; }
    this.prewarmed = true;
  };

  PlayScene.prototype.create = function () {
    Game.scene = this;
    this.world = this.add.graphics();
    this.shadows = this.add.graphics().setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.lightGlow = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.entities = this.add.graphics();
    this.fx = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.ui = this.add.graphics().setScrollFactor(0);
    this.uiFx = this.add.graphics().setScrollFactor(0).setBlendMode(Phaser.BlendModes.ADD);
    this.world.setDepth(0.5); this.shadows.setDepth(0.6); this.lightGlow.setDepth(0.7); this.entities.setDepth(1); this.fx.setDepth(3); this.ui.setDepth(90); this.uiFx.setDepth(91);
    this.visual = { roomPanels: [], covers: [], doors: [], cards: [], enemies: [], pickups: [], player: null, floor: null, chrome: null, lift: null, vent: null };
    this.visual.floor = this.add.image(WORLD_W / 2, WORLD_H / 2, 'floor-panel').setDepth(-2).setVisible(false);
    this.visual.chrome = this.add.image(WORLD_W / 2, WORLD_H / 2, 'floor-panel').setDisplaySize(WORLD_W, WORLD_H).setDepth(-1);
    for (var roomVisualIndex = 0; roomVisualIndex < 5; roomVisualIndex++) this.visual.roomPanels.push(this.add.image(0, 0, 'room-panel').setDepth(-1));
    for (var coverVisualIndex = 0; coverVisualIndex < 20; coverVisualIndex++) this.visual.covers.push(this.add.image(0, 0, 'cover-crate').setDepth(0));
    for (var doorVisualIndex = 0; doorVisualIndex < 4; doorVisualIndex++) this.visual.doors.push(this.add.image(0, 0, 'door-panel').setDepth(0));
    for (var cardVisualIndex = 0; cardVisualIndex < 4; cardVisualIndex++) this.visual.cards.push(this.add.image(0, 0, 'keycard').setDepth(0));
    for (var enemyVisualIndex = 0; enemyVisualIndex < MAX_ENEMIES; enemyVisualIndex++) this.visual.enemies.push(this.add.image(0, 0, 'enemy-scout').setDepth(1));
    for (var pickupVisualIndex = 0; pickupVisualIndex < MAX_PICKUPS; pickupVisualIndex++) this.visual.pickups.push(this.add.image(0, 0, 'pickup-ammo').setDepth(1));
    this.visual.player = this.add.image(0, 0, 'operator-idle').setDepth(2);
    this.visual.lift = this.add.image(0, 0, 'lift-panel').setDepth(0);
    this.visual.vent = this.add.image(0, 0, 'vent-panel').setDepth(0);
    this.hideVisuals();
    this.hud = {};
    this.makeHudText();
    this.scale.on('resize', this.relayout, this);
    this.relayout(this.scale.width, this.scale.height);
    this.cameras.main.setBackgroundColor(PAL.ink);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.loadFloor(1, true);
    kit.loader.progress(1);
    kit.loader.hide();
    syncDebug(this);
    if (typeof window !== 'undefined') window.__DP_READY = true;
  };

  PlayScene.prototype.hideVisuals = function () {
    if (!this.visual) return;
    var groups = [this.visual.roomPanels, this.visual.covers, this.visual.doors, this.visual.cards, this.visual.enemies, this.visual.pickups];
    for (var groupIndex = 0; groupIndex < groups.length; groupIndex++) for (var itemIndex = 0; itemIndex < groups[groupIndex].length; itemIndex++) groups[groupIndex][itemIndex].setVisible(false);
    this.visual.player.setVisible(false); this.visual.lift.setVisible(false); this.visual.vent.setVisible(false);
  };

  PlayScene.prototype.makeHudText = function () {
    var style = { fontFamily: 'system-ui, sans-serif', resolution: GGKit.hiDpi.dpr(), fontSize: '12px', color: CSS.white, fontStyle: '700' };
    var names = ['title', 'floor', 'score', 'time', 'room', 'cards', 'weapon', 'ammo', 'hp', 'mode', 'auto', 'alarm', 'tip', 'prompt', 'bannerHead', 'bannerSub', 'bannerTiny'];
    for (var i = 0; i < names.length; i++) {
      this.hud[names[i]] = this.add.text(0, 0, '', style).setScrollFactor(0).setDepth(100).setOrigin(0.5);
    }
    this.hud.title.setVisible(false);
    this.hud.floor.setFontSize('14px').setOrigin(0, 0.5);
    this.hud.score.setFontSize('14px').setFontStyle('800');
    this.hud.time.setFontSize('14px');
    this.hud.room.setFontSize('14px').setOrigin(0, 0.5);
    this.hud.cards.setVisible(false);
    this.hud.weapon.setFontSize('14px').setFontStyle('800').setOrigin(0, 0.5);
    this.hud.ammo.setFontSize('14px').setOrigin(0, 0.5);
    this.hud.hp.setFontSize('14px').setOrigin(1, 0.5);
    this.hud.mode.setFontSize('14px').setOrigin(0.5, 0.5);
    this.hud.auto.setFontSize('14px').setOrigin(0.5, 0.5);
    this.hud.alarm.setFontSize('14px').setOrigin(0.5, 0.5);
    this.hud.tip.setFontSize('14px').setOrigin(0.5, 0.5).setColor(CSS.amber).setVisible(false);
    this.hud.prompt.setFontSize('14px').setOrigin(1, 0.5).setColor(CSS.white).setVisible(false);
    this.hud.bannerHead.setFontSize('22px').setFontStyle('900').setAlpha(0);
    this.hud.bannerSub.setFontSize('14px').setFontStyle('800').setAlpha(0);
    this.hud.bannerTiny.setFontSize('14px').setAlpha(0);
    for (var choiceIndex = 0; choiceIndex < 9; choiceIndex++) this.hud['floorChoice' + choiceIndex] = this.add.text(0, 0, '', { fontFamily: 'system-ui, sans-serif', resolution: GGKit.hiDpi.dpr(), fontSize: '9px', color: CSS.white, fontStyle: '800', align: 'center' }).setOrigin(0.5).setDepth(101).setVisible(false);
  };

  PlayScene.prototype.relayout = function (width, height) {
    var W = width || this.scale.width || 390;
    var H = height || this.scale.height || 700;
    this.layout = { W: W, H: H, stickX: 76, stickY: H - 78, aimX: W - 76, aimY: H - 78,
      fireX: W - 76, fireY: H - 270, weaponY: H - 180,
      fireRect: { x: Math.max(0, W - 140), y: H - 304, w: 128, h: 58 },
      weaponRect: { x: 148, y: H - 204, w: Math.max(1, W - 218), h: 48 },
      moveRect: { x: 0, y: H - 145, w: Math.min(156, W * 0.42), h: 145 },
      aimRect: { x: W * 0.55, y: H - 145, w: W * 0.45, h: 145 } };
    var h = this.hud;
    if (!h) return;
    h.title.setPosition(24, 28); h.floor.setPosition(24, 32);
    h.room.setPosition(82, 32); h.time.setPosition(W * 0.58, 32); h.score.setPosition(W - 24, 32);
    h.weapon.setPosition(24, 61); h.ammo.setPosition(84, 61);
    h.mode.setPosition(W * 0.5 - 52, 61); h.auto.setPosition(W * 0.5 + 18, 61); h.alarm.setPosition(W * 0.5 + 62, 61);
    h.hp.setPosition(W - 24, 61);
    h.tip.setPosition(W * 0.5, 104); h.prompt.setPosition(W - 16, 128);
    h.bannerHead.setPosition(W * 0.5, H * 0.29); h.bannerSub.setPosition(W * 0.5, H * 0.29 + 26);
    h.bannerTiny.setPosition(W * 0.5, H * 0.29 + 45);
  };

  PlayScene.prototype.clearControlState = function () {
    this.inputState.moveId = this.inputState.aimId = this.inputState.fireId = null;
    this.inputState.moveX = this.inputState.moveY = 0;
    this.inputState.aimDX = 0; this.inputState.aimDY = -1; this.inputState.aimRelative = false; this.inputState.directAim = false;
  };
  PlayScene.prototype.setPaused = function (value) {
    this.pausedByKit = !!value;
    if (this.pausedByKit) this.clearControlState();
  };
  PlayScene.prototype.hardRestart = function (floorNo) {
    this.clearControlState();
    this.inputState.prevQ = this.inputState.prevE = this.inputState.prevR = this.inputState.prevT = this.inputState.prevM = false;
    this.inputState.prevEnter = false; this.inputState.prevFloorKeys = [false, false, false, false, false, false, false, false, false];
    this.run.mode = DP_DEBUG_STATE.mode === 'speedrun' ? 'speedrun' : 'normal';
    this.run.score = 0; this.run.roomsCleared = 0; this.run.totalTime = 0; this.run.floorTime = 0; this.simTime = 0;
    this.run.cardsFound = 0; this.run.shots = 0; this.run.hits = 0; this.run.floorShots = 0; this.run.floorHits = 0; this.run.state = 'play';
    this.run.weaponMods = [0, 0, 0]; this.run.floorWon = false; this.run.bossDefeated = false;
    this.run.tutorialStep = profile.tutorialDone ? 4 : 0;
    this.run.tutorialActive = !profile.tutorialDone;
    this.inputState.autoAim = this.run.mode !== 'speedrun';
    var requested = Number.isInteger(floorNo) ? floorNo : 1;
    this.loadFloor(clamp(requested, 1, profile.unlockedFloor), true);
  };

  PlayScene.prototype.claimPointer = function (pointer, zone) {
    var event = pointer.event || {};
    var id = pointer.id != null ? pointer.id : event.pointerId;
    if (id == null) id = 0;
    var record = kit.input.pointers.get(id);
    if (record) { record.x = event.clientX || pointer.x; record.y = event.clientY || pointer.y; record.zone = zone; }
    return id;
  };
  PlayScene.prototype.setPointerZone = function (id, zone) {
    var record = kit.input.pointers.get(id); if (record) record.zone = zone;
  };
  PlayScene.prototype.pointerId = function (pointer) {
    var id = pointer && pointer.id != null ? pointer.id : ((pointer && pointer.event) || {}).pointerId;
    return id == null ? 0 : id;
  };
  PlayScene.prototype.handleWindowPointer = function (type, event) {
    if (!event || this.pausedByKit || !this.game || !this.game.canvas) return;
    if (event.pointerType === 'mouse' && event.button != null && event.button !== 0) return;
    var rect = this.game.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var pointer = { id: event.pointerId, x: (event.clientX - rect.left) * this.scale.width / rect.width,
      y: (event.clientY - rect.top) * this.scale.height / rect.height, event: event };
    if (type === 'down') this.onPointerDown(pointer);
    else if (type === 'move') this.onPointerMove(pointer);
    else this.onPointerUp(pointer);
  };
  PlayScene.prototype.inRect = function (x, y, rect) { return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h; };
  PlayScene.prototype.floorChoiceAt = function (x, y) {
    if (this.run.state !== 'dead' && this.run.state !== 'victory') return 0;
    var W = this.layout.W, top = this.layout.H * 0.63, step = (W - 72) / 3, row = Math.floor((y - top) / 48), col = Math.floor((x - 36) / step), index = row * 3 + col + 1;
    return row >= 0 && row < 3 && col >= 0 && col < 3 && index <= profile.unlockedFloor ? index : 0;
  };
  PlayScene.prototype.onPointerDown = function (pointer) {
    if (this.pausedByKit) return;
    var W = this.layout.W, H = this.layout.H, x = pointer.x, y = pointer.y;
    var pointerType = (pointer.event && pointer.event.pointerType) || 'mouse';
    var id = this.claimPointer(pointer, 'ui');
    this.inputState.lastPointerType = pointerType;
    kit.audio.music('ambient_hum', 500);
    if (this.run.state === 'dead' || this.run.state === 'victory') {
      var selectedFloor = this.floorChoiceAt(x, y);
      this.hardRestart(selectedFloor || 1); return;
    }
    if (y < 68 && x > W - 112) { this.inputState.autoAim = !this.inputState.autoAim; this.toast(this.inputState.autoAim ? 'AUTO AIM' : 'MANUAL AIM', this.inputState.autoAim ? PAL.cyan : PAL.mist); return; }
    if (y >= 68 && y < 112 && x > W - 122) { this.toggleSpeedMode(); return; }
    if (y < 68 && x < 135) { kit.openSettings(); return; }
    if (this.inRect(x, y, this.layout.fireRect)) { this.inputState.fireId = id; this.setPointerZone(id, 'fire'); return; }
    if (this.inRect(x, y, this.layout.weaponRect)) { this.setPointerZone(id, 'weapon'); this.swapWeapon(x < W * 0.5 ? -1 : 1); return; }
    if (this.inRect(x, y, this.layout.moveRect)) { this.inputState.moveId = id; this.setPointerZone(id, 'move'); this.updateMove(pointer); return; }
    if (this.inRect(x, y, this.layout.aimRect)) { this.inputState.aimId = id; this.setPointerZone(id, 'aim'); this.inputState.directAim = true; this.inputState.aimRelative = pointerType !== 'mouse'; this.updateAim(pointer); return; }
    if (pointerType === 'mouse') { this.inputState.mouseX = x; this.inputState.mouseY = y; this.inputState.directAim = true; this.inputState.aimRelative = false; this.updateAim(pointer); }
  };
  PlayScene.prototype.onPointerMove = function (pointer) {
    if (this.pausedByKit) return;
    var id = this.pointerId(pointer);
    if (id === this.inputState.moveId) this.updateMove(pointer);
    if (id === this.inputState.aimId) this.updateAim(pointer);
    if (this.inputState.lastPointerType === 'mouse' && id !== this.inputState.moveId && id !== this.inputState.aimId) {
      this.inputState.mouseX = pointer.x; this.inputState.mouseY = pointer.y; this.inputState.directAim = true;
      this.updateAim(pointer);
    }
  };
  PlayScene.prototype.onPointerUp = function (pointer) {
    var id = this.pointerId(pointer);
    if (id === this.inputState.moveId) { this.inputState.moveId = null; this.inputState.moveX = this.inputState.moveY = 0; }
    if (id === this.inputState.aimId) { this.inputState.aimId = null; this.inputState.directAim = false; this.inputState.aimRelative = false; }
    if (id === this.inputState.fireId) this.inputState.fireId = null;
  };
  PlayScene.prototype.updateMove = function (pointer) {
    var dx = pointer.x - this.layout.stickX, dy = pointer.y - this.layout.stickY, len = Math.hypot(dx, dy);
    if (len > 52) { dx *= 52 / len; dy *= 52 / len; }
    this.inputState.moveX = clamp(dx / 52, -1, 1); this.inputState.moveY = clamp(dy / 52, -1, 1);
  };
  PlayScene.prototype.updateAim = function (pointer) {
    if (this.inputState.aimRelative) {
      var dx = pointer.x - this.layout.aimX, dy = pointer.y - this.layout.aimY, len = Math.hypot(dx, dy);
      if (len > 52) { dx *= 52 / len; dy *= 52 / len; }
      if (Math.hypot(dx, dy) > 5) { this.inputState.aimDX = dx / 52; this.inputState.aimDY = dy / 52; }
    } else { this.inputState.aimX = pointer.x; this.inputState.aimY = pointer.y; }
  };

  PlayScene.prototype.buildFloor = function (floorNo) {
    var family = familyForFloor(floorNo);
    var rng = makeRng((family.seed ^ (floorNo * 2654435761)) >>> 0);
    var floor = { no: floorNo, family: family, rooms: [], corridors: [], doors: [], cards: [], covers: [], cameras: [], hazards: [],
      vent: null, lift: { x: 0, y: 0, active: false }, seed: family.seed, clearedCount: 0, bossDefeated: false,
      corridorWidth: family.corridorWidth || 72, mechanic: family.mechanic, mechanicText: family.mechanicText };
    var positions = family.positions || FLOOR_FAMILIES[0].positions;
    for (var i = 0; i < 5; i++) {
      var pos = positions[i] || positions[0];
      var shape = (family.roomShapes && family.roomShapes[i]) || [260, 172];
      var room = { index: i, id: family.key + '-' + i, label: family.rooms[i] || ('ROOM ' + (i + 1)),
        kind: i === 0 ? 'entry' : i === 4 ? (family.boss ? 'vault' : 'lift') : (i === 2 ? 'signature' : i === 3 ? 'ambush' : 'combat'),
        x: pos[0] - shape[0] / 2, y: pos[1] - shape[1] / 2, w: shape[0], h: shape[1], cx: pos[0], cy: pos[1], entered: false, cleared: false,
        drops: false, tint: (rng() * 3) | 0, enemiesLeft: 0 };
      floor.rooms.push(room);
      floor.cameras.push({ roomIndex: i, x: room.x + 30, y: room.y + 28, angle: i % 2 ? Math.PI * 0.25 : Math.PI * 0.75,
        sweep: i % 2 ? -1 : 1, scan: rng() * TAU, range: 248 + floorNo * 5, spread: 0.44, disabled: !!profile.cameraDisables[floorNo + '-' + i], alert: 0, hp: 34 });
      for (var ci = 0; ci < 4; ci++) {
        var coverX = room.x + 34 + rng() * (room.w - 68), coverY = room.y + 38 + rng() * (room.h - 76), coverAttempts = 0;
        while (coverAttempts < 12 && distance(coverX + 24, coverY + 16, room.cx, room.cy) < 62) { coverX = room.x + 34 + rng() * (room.w - 68); coverY = room.y + 38 + rng() * (room.h - 76); coverAttempts++; }
        floor.covers.push({ roomIndex: i, x: coverX, y: coverY, w: 32 + rng() * 34, h: 18 + rng() * 24, style: ci % 2 });
      }
    }
    for (var ri = 0; ri < floor.rooms.length - 1; ri++) {
      this.connectRooms(floor, floor.rooms[ri], floor.rooms[ri + 1]);
      var a = floor.rooms[ri], b = floor.rooms[ri + 1];
      var cardKey = ['amber', 'cyan', 'violet', 'rose'][ri] || 'amber';
      var cardX = Math.abs(a.cx - b.cx) > 2 ? a.cx + (b.cx - a.cx) * 0.22 : b.cx;
      var cardY = Math.abs(a.cx - b.cx) > 2 ? a.cy : a.cy + (b.cy - a.cy) * 0.22;
      floor.cards.push({ key: cardKey, color: KEY_COLORS[cardKey] || PAL.cyan, got: false,
        roomIndex: ri, x: cardX, y: cardY, bob: rng() * TAU });
      var gate = this.makeGate(a, b, ri, cardKey, floor.corridorWidth);
      floor.doors.push(gate);
    }
    this.addFloorHazards(floor, rng);
    var ventFrom = floorNo === 2 ? 1 : floorNo === 4 ? 0 : 2;
    var ventTo = floorNo === 2 ? 3 : floorNo === 4 ? 2 : 4;
    var ventRoom = floor.rooms[ventFrom] || floor.rooms[0];
    floor.vent = { from: ventFrom, to: ventTo, x: ventRoom.x + 34, y: ventRoom.y + ventRoom.h - 34, discovered: false, used: false };
    floor.lift = { x: floor.rooms[4].cx, y: floor.rooms[4].cy, active: false };
    return floor;
  };
  PlayScene.prototype.addFloorHazards = function (floor, rng) {
    var family = floor.family, specs = [];
    if (family.hazardType === 'relay') {
      specs.push({ type: 'relay', roomIndex: 2, x: floor.rooms[2].cx - 58, y: floor.rooms[2].cy, radius: 24, pulse: 0 });
      specs.push({ type: 'relay', roomIndex: 3, x: floor.rooms[3].cx + 58, y: floor.rooms[3].cy, radius: 24, pulse: 1.4 });
    } else if (family.hazardType === 'heat') {
      specs.push({ type: 'heat', roomIndex: 2, x: floor.rooms[2].cx - 48, y: floor.rooms[2].cy + 18, radius: 42, pulse: rng() * TAU });
      specs.push({ type: 'heat', roomIndex: 3, x: floor.rooms[3].cx + 44, y: floor.rooms[3].cy - 16, radius: 36, pulse: rng() * TAU });
    } else if (family.hazardType === 'crossfire') {
      specs.push({ type: 'crossfire', roomIndex: 1, x: floor.rooms[1].cx, y: floor.rooms[1].cy, w: floor.rooms[1].w - 36, h: 12, pulse: 0, cooldown: 0 });
      specs.push({ type: 'crossfire', roomIndex: 3, x: floor.rooms[3].cx, y: floor.rooms[3].cy, w: 12, h: floor.rooms[3].h - 36, pulse: 1.2, cooldown: 0 });
    } else if (family.hazardType === 'vault') {
      specs.push({ type: 'core', roomIndex: 4, x: floor.rooms[4].cx, y: floor.rooms[4].cy, radius: 74, pulse: 0 });
    } else if (family.hazardType === 'cryo') {
      specs.push({ type: 'cryo', roomIndex: 1, x: floor.rooms[1].cx, y: floor.rooms[1].cy, radius: 48, pulse: rng() * TAU });
      specs.push({ type: 'cryo', roomIndex: 3, x: floor.rooms[3].cx, y: floor.rooms[3].cy, radius: 38, pulse: rng() * TAU });
    } else if (family.hazardType === 'bio') {
      specs.push({ type: 'bio', roomIndex: 2, x: floor.rooms[2].cx - 42, y: floor.rooms[2].cy, radius: 38, pulse: rng() * TAU });
      specs.push({ type: 'bio', roomIndex: 3, x: floor.rooms[3].cx + 40, y: floor.rooms[3].cy + 10, radius: 30, pulse: rng() * TAU });
    } else if (family.hazardType === 'blacksite') {
      specs.push({ type: 'blacksite', roomIndex: 1, x: floor.rooms[1].cx, y: floor.rooms[1].cy, w: floor.rooms[1].w - 38, h: 10, pulse: 0, cooldown: 0 });
      specs.push({ type: 'blacksite', roomIndex: 3, x: floor.rooms[3].cx, y: floor.rooms[3].cy, w: 10, h: floor.rooms[3].h - 36, pulse: 1.4, cooldown: 0 });
    } else if (family.hazardType === 'core') {
      specs.push({ type: 'core', roomIndex: 2, x: floor.rooms[2].cx, y: floor.rooms[2].cy, radius: 52, pulse: 0 });
      specs.push({ type: 'core', roomIndex: 3, x: floor.rooms[3].cx, y: floor.rooms[3].cy, radius: 44, pulse: 1.2 });
    }
    floor.hazards = specs;
  };
  PlayScene.prototype.connectRooms = function (floor, a, b) {
    var width = floor.corridorWidth || 72;
    if (Math.abs(a.cx - b.cx) > 2) {
      floor.corridors.push({ x: Math.min(a.cx, b.cx), y: a.cy - width / 2, w: Math.abs(a.cx - b.cx), h: width, vent: false });
    }
    if (Math.abs(a.cy - b.cy) > 2) {
      floor.corridors.push({ x: b.cx - width / 2, y: Math.min(a.cy, b.cy), w: width, h: Math.abs(a.cy - b.cy), vent: false });
    }
  };
  PlayScene.prototype.makeGate = function (a, b, index, key, corridorWidth) {
    var width = corridorWidth || 72;
    if (Math.abs(a.cx - b.cx) > 2) return { index: index, key: key, open: false, targetOpen: false, openProgress: 0, lockdown: false, x: (a.cx + b.cx) / 2 - 7, y: a.cy - width / 2, w: 14, h: width, color: KEY_COLORS[key] || PAL.cyan };
    return { index: index, key: key, open: false, targetOpen: false, openProgress: 0, lockdown: false, x: b.cx - width / 2, y: (a.cy + b.cy) / 2 - 7, w: width, h: 14, color: KEY_COLORS[key] || PAL.cyan };
  };
  PlayScene.prototype.bakeStaticChrome = function () {
    if (!this.floor || !this.visual || !this.visual.chrome || typeof document === 'undefined') return;
    var canvas = document.createElement('canvas'), ctx = canvas.getContext('2d'), family = this.floor.family;
    canvas.width = WORLD_W; canvas.height = WORLD_H;
    var base = ctx.createLinearGradient(0, 0, WORLD_W, WORLD_H);
    base.addColorStop(0, colorCss(family.ambient)); base.addColorStop(0.48, '#0b1b22'); base.addColorStop(1, '#071116');
    ctx.fillStyle = base; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    var glow = ctx.createRadialGradient(WORLD_W * 0.5, WORLD_H * 0.28, 60, WORLD_W * 0.5, WORLD_H * 0.28, 720);
    glow.addColorStop(0, colorCss(family.accent) + '22'); glow.addColorStop(1, '#00000000'); ctx.fillStyle = glow; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    ctx.lineWidth = 1; ctx.strokeStyle = colorCss(family.ambient) + '55';
    for (var gx = 0; gx < WORLD_W; gx += 36) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, WORLD_H); ctx.stroke(); }
    for (var gy = 0; gy < WORLD_H; gy += 36) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(WORLD_W, gy); ctx.stroke(); }
    for (var corridorIndex = 0; corridorIndex < this.floor.corridors.length; corridorIndex++) {
      var cor = this.floor.corridors[corridorIndex], corridorFill = ctx.createLinearGradient(cor.x, cor.y, cor.x + cor.w, cor.y + cor.h);
      corridorFill.addColorStop(0, '#122a31'); corridorFill.addColorStop(0.5, '#1b3a40'); corridorFill.addColorStop(1, '#102329');
      ctx.fillStyle = corridorFill; ctx.fillRect(cor.x, cor.y, cor.w, cor.h); ctx.strokeStyle = '#6d9ca455'; ctx.lineWidth = 3; ctx.strokeRect(cor.x, cor.y, cor.w, cor.h);
      ctx.strokeStyle = colorCss(family.accent) + '33'; ctx.lineWidth = 1; ctx.strokeRect(cor.x + 8, cor.y + 8, Math.max(1, cor.w - 16), Math.max(1, cor.h - 16));
    }
    for (var roomIndex = 0; roomIndex < this.floor.rooms.length; roomIndex++) {
      var room = this.floor.rooms[roomIndex], roomFill = ctx.createLinearGradient(room.x, room.y, room.x, room.y + room.h);
      roomFill.addColorStop(0, '#1a363d'); roomFill.addColorStop(0.5, '#10272e'); roomFill.addColorStop(1, '#0d2027');
      ctx.fillStyle = roomFill; ctx.fillRect(room.x, room.y, room.w, room.h); ctx.strokeStyle = '#7aa7aa'; ctx.lineWidth = 7; ctx.strokeRect(room.x, room.y, room.w, room.h);
      ctx.strokeStyle = colorCss(family.accent) + '88'; ctx.lineWidth = 2; ctx.strokeRect(room.x + 12, room.y + 12, room.w - 24, room.h - 24);
      ctx.fillStyle = colorCss(family.accent) + '18'; ctx.fillRect(room.x + 18, room.y + 18, room.w - 36, 3);
    }
    if (this.textures.exists('dp-chrome')) this.textures.remove('dp-chrome');
    this.textures.addCanvas('dp-chrome', canvas);
    this.visual.chrome.setTexture('dp-chrome').setDisplaySize(WORLD_W, WORLD_H);
  };
  PlayScene.prototype.loadFloor = function (floorNo, freshRun) {
    var safeNo = Number.isInteger(floorNo) ? clamp(floorNo, 1, FLOOR_FAMILIES.length) : 1;
    this.floor = this.buildFloor(safeNo);
    this.bakeStaticChrome();
    this.run.floorNo = safeNo; this.run.floorTime = 0; this.run.roomIndex = 0; this.run.cardsFound = 0;
    this.run.floorShots = 0; this.run.floorHits = 0; this.run.tutorialActive = safeNo === 1 && !profile.tutorialDone;
    this.run.tutorialSpawned = false; this.run.tutorialEnemyDefeated = false;
    this.run.floorWon = false; this.run.bossDefeated = false; this.run.state = 'play';
    this.run.banner.active = false; this.run.light.active = false; this.run.tutorialFade = 0; this.run.tutorialShownStep = -1;
    this.toastText = ''; this.toastAge = 0; this.toastQueue.length = 0;
    this.clearPools();
    this.run.alarm = 0; this.run.alarmPeak = 0; this.run.alarmLatched = false; this.run.securityCompromised = false; this.run.rewardTier = 0; this.run.rewardPulse = 0; this.run.endReveal = 0;
    var start = this.floor.rooms[0];
    this.player.x = start.cx; this.player.y = start.cy; this.player.vx = this.player.vy = 0;
    this.player.health = 100; this.player.maxHealth = 100; this.player.armor = 0; this.player.invuln = 0.7;
    this.player.face = -Math.PI / 2; this.player.weapon = 0; this.player.recoil = 0;
    for (var wi2 = 0; wi2 < WEAPONS.length; wi2++) { this.run.weapons[wi2].mag = WEAPONS[wi2].mag; this.run.weapons[wi2].reserve = WEAPONS[wi2].reserve; this.run.weapons[wi2].reload = 0; this.run.weapons[wi2].cooldown = 0; }
    for (var roomIndex = 0; roomIndex < this.floor.rooms.length; roomIndex++) this.spawnRoom(roomIndex, this.floor.family.pacing[roomIndex] || []);
    this.floor.tutorialTarget = { x: start.cx + 66, y: start.cy - 4 };
    this.inputState.aimX = this.layout ? this.layout.aimX : 0; this.inputState.aimY = this.layout ? this.layout.aimY : 0;
    if (freshRun && safeNo === 1) this.announce('DESCENT INITIATED', this.floor.family.label, this.floor.family.accent);
    else this.announce('FLOOR ' + String(safeNo).padStart(2, '0'), this.floor.family.label, this.floor.family.accent);
    syncDebug(this);
  };
  PlayScene.prototype.clearPools = function () {
    var i;
    for (i = 0; i < this.enemies.length; i++) this.enemies[i].active = false;
    for (i = 0; i < this.bullets.length; i++) this.bullets[i].active = false;
    for (i = 0; i < this.pickups.length; i++) this.pickups[i].active = false;
    for (var particleSystemIndex = 0; particleSystemIndex < PARTICLE_SYSTEMS.length; particleSystemIndex++) {
      var particlePool = this.particleSystems[PARTICLE_SYSTEMS[particleSystemIndex]];
      for (var particleIndex = 0; particleIndex < particlePool.length; particleIndex++) particlePool[particleIndex].active = false;
    }
    for (i = 0; i < this.rings.length; i++) this.rings[i].active = false;
    for (i = 0; i < this.popups.length; i++) this.popups[i].active = false;
    for (i = 0; i < this.deathActors.length; i++) this.deathActors[i].active = false;
  };
  PlayScene.prototype.spawnRoom = function (roomIndex, rows) {
    var room = this.floor.rooms[roomIndex], rng = makeRng((this.floor.seed + roomIndex * 9137) >>> 0), scale = 1 + (this.run.floorNo - 1) * 0.12;
    if (this.run.tutorialActive && roomIndex === 0) return;
    var list = rows || [];
    for (var i = 0; i < list.length; i++) {
      var row = list[i] || [], kind = own(ENEMY_STATS, row[0]) ? row[0] : 'scout', count = Math.max(0, Number(row[1]) || 0);
      for (var j = 0; j < count; j++) {
        var x = room.cx, y = room.cy, attempts = 0;
        do {
          x = room.x + 38 + rng() * (room.w - 76); y = room.y + 38 + rng() * (room.h - 76); attempts++;
        } while (attempts < 16 && (distance(x, y, room.cx, room.cy) < 50 || this.coverAt(x, y, enemyStats(kind).radius)));
        this.spawnEnemy(kind, roomIndex, x, y, scale, rng());
      }
    }
  };
  PlayScene.prototype.spawnEnemy = function (kind, roomIndex, x, y, scale, seed) {
    var slot = null;
    for (var i = 0; i < this.enemies.length; i++) if (!this.enemies[i].active) { slot = this.enemies[i]; break; }
    if (!slot) return null;
    var s = enemyStats(kind), boss = kind === 'sentinel';
    slot.active = true; slot.kind = kind; slot.roomIndex = roomIndex; slot.x = x; slot.y = y;
    slot.maxHp = s.hp * (boss ? 1 : scale); slot.hp = slot.maxHp; slot.radius = s.radius; slot.speed = s.speed * (boss ? 1 : 1 + Math.min(4, this.run.floorNo - 1) * 0.035);
    slot.damage = s.damage * (1 + (this.run.floorNo - 1) * 0.08); slot.color = s.color; slot.facing = 0;
    slot.cooldown = 0.45 + (seed || 0) * 1.1; slot.alert = 0; slot.state = 'patrol'; slot.coverX = x; slot.coverY = y;
    slot.patrolX = x; slot.patrolY = y;
    slot.flankSide = ((seed || 0) > 0.5 ? 1 : -1); slot.seed = seed || 0; slot.phase = 1; slot.phaseSeen = 1; slot.boss = boss; slot.flash = 0; slot.stun = 0;
    slot.animState = 'idle'; slot.animTime = 0; slot.telegraph = 0; slot.anticipation = 0; slot.recovery = 0; slot.tutorial = false;
    return slot;
  };

  PlayScene.prototype.roomAt = function (x, y) {
    for (var i = 0; i < this.floor.rooms.length; i++) { var r = this.floor.rooms[i]; if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r; }
    return null;
  };
  PlayScene.prototype.coverAt = function (x, y, pad) {
    for (var i = 0; i < this.floor.covers.length; i++) { var c = this.floor.covers[i]; if (x > c.x - pad && x < c.x + c.w + pad && y > c.y - pad && y < c.y + c.h + pad) return c; }
    return null;
  };
  PlayScene.prototype.hazardAt = function (x, y, hazard) {
    if (!hazard) return false;
    if (hazard.radius) return distance(x, y, hazard.x, hazard.y) <= hazard.radius;
    return x >= hazard.x - hazard.w / 2 && x <= hazard.x + hazard.w / 2 && y >= hazard.y - hazard.h / 2 && y <= hazard.y + hazard.h / 2;
  };
  PlayScene.prototype.updateHazards = function () {
    for (var i = 0; i < this.floor.hazards.length; i++) {
      var hazard = this.floor.hazards[i]; hazard.pulse += STEP;
      if ((hazard.type === 'heat' || hazard.type === 'bio') && this.hazardAt(this.player.x, this.player.y, hazard)) this.damagePlayer(7 * STEP);
      if ((hazard.type === 'crossfire' || hazard.type === 'blacksite') && this.hazardAt(this.player.x, this.player.y, hazard)) {
        hazard.cooldown -= STEP;
        if (hazard.cooldown <= 0) { this.damagePlayer(12); hazard.cooldown = 0.72; this.spawnBurst(this.player.x, this.player.y, PAL.rose, 5, 'telegraph'); kit.audio.sfx('warning_beep', { volume: 0.34, rate: 1.1 }); }
      }
    }
  };
  PlayScene.prototype.playerInShadow = function () {
    var hidden = !!this.coverAt(this.player.x, this.player.y, 5);
    var vent = this.floor && this.floor.vent && this.floor.vent.discovered && distance(this.player.x, this.player.y, this.floor.vent.x, this.floor.vent.y) < 28;
    return (hidden || vent) && this.inputState.fireId === null;
  };
  PlayScene.prototype.inCameraCone = function (camera) {
    var dx = this.player.x - camera.x, dy = this.player.y - camera.y, d = Math.hypot(dx, dy);
    if (d > camera.range || d < 1) return false;
    return Math.abs(angleDiff(Math.atan2(dy, dx), camera.angle)) < camera.spread;
  };
  PlayScene.prototype.lockdownDoors = function () {
    for (var i = 0; i < this.floor.doors.length; i++) this.floor.doors[i].lockdown = true;
  };
  PlayScene.prototype.updateDoorFlow = function () {
    for (var i = 0; i < this.floor.doors.length; i++) {
      var door = this.floor.doors[i], card = this.floor.cards[i], room = this.floor.rooms[i];
      door.targetOpen = !!(card && card.got && room && room.cleared && this.run.alarm < 0.42 && !door.lockdown);
      door.openProgress = lerp(door.openProgress, door.targetOpen ? 1 : 0, kit.juice.enabled ? 0.24 : 0.5);
      door.open = door.openProgress > 0.72;
      if (door.open && door.targetOpen) door.lockdown = false;
    }
  };
  PlayScene.prototype.updateSecurity = function () {
    var hidden = this.playerInShadow(), seen = false;
    this.player.stealth = hidden;
    for (var i = 0; i < this.floor.cameras.length; i++) {
      var camera = this.floor.cameras[i];
      camera.scan += STEP * (0.9 + this.run.floorNo * 0.035) * camera.sweep;
      camera.angle += Math.sin(camera.scan) * STEP * 0.45;
      var canSee = !camera.disabled && camera.roomIndex === this.run.roomIndex && !hidden && this.inCameraCone(camera) && this.hasLOS(camera, this.player);
      camera.alert = Math.max(0, camera.alert - STEP * (canSee ? 0.05 : 0.45));
      if (canSee) { camera.alert = Math.min(1, camera.alert + STEP * 1.55); seen = true; }
      if (canSee && camera.alert > 0.55) this.run.alarm = Math.min(1, this.run.alarm + STEP * 0.32);
    }
    if (seen && !hidden) this.run.alarm = Math.min(1, this.run.alarm + STEP * 0.12);
    else this.run.alarm = Math.max(0, this.run.alarm - STEP * (hidden ? 0.32 : 0.08));
    this.run.alarmPeak = Math.max(this.run.alarmPeak, this.run.alarm);
    if (this.run.alarm > 0.54 && !this.run.alarmLatched) {
      this.run.alarmLatched = true; this.run.securityCompromised = true; this.lockdownDoors(); this.toast('LOCKDOWN', PAL.alarm); kit.audio.sfx('warning_beep', { volume: 0.62, rate: 1.35 });
      this.spawnBurst(this.player.x, this.player.y, PAL.alarm, 16, 'telegraph');
    }
    if (this.run.alarm < 0.18) this.run.alarmLatched = false;
    if (this.run.alarm < 0.22 && !seen) for (var doorIndex = 0; doorIndex < this.floor.doors.length; doorIndex++) this.floor.doors[doorIndex].lockdown = false;
    this.updateDoorFlow();
  };
  PlayScene.prototype.cameraAt = function (x, y, pad) {
    for (var i = 0; i < this.floor.cameras.length; i++) {
      var camera = this.floor.cameras[i]; if (!camera.disabled && distance(x, y, camera.x, camera.y) < 22 + (pad || 0)) return camera;
    }
    return null;
  };
  PlayScene.prototype.doorAt = function (x, y, pad) {
    for (var i = 0; i < this.floor.doors.length; i++) { var d = this.floor.doors[i]; if (!d.open && x > d.x - pad && x < d.x + d.w + pad && y > d.y - pad && y < d.y + d.h + pad) return d; }
    return null;
  };
  PlayScene.prototype.floorPoint = function (x, y) {
    if (x < 18 || y < 18 || x > WORLD_W - 18 || y > WORLD_H - 18) return false;
    for (var i = 0; i < this.floor.rooms.length; i++) { var r = this.floor.rooms[i]; if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true; }
    for (var j = 0; j < this.floor.corridors.length; j++) { var c = this.floor.corridors[j]; if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return true; }
    return false;
  };
  PlayScene.prototype.walkable = function (x, y, radius) {
    var r = radius || 0;
    var pts = [[x, y], [x - r, y], [x + r, y], [x, y - r], [x, y + r]];
    for (var i = 0; i < pts.length; i++) if (!this.floorPoint(pts[i][0], pts[i][1]) || this.doorAt(pts[i][0], pts[i][1], 0)) return false;
    return !this.coverAt(x, y, r);
  };
  PlayScene.prototype.hasLOS = function (a, b) {
    var d = distance(a.x, a.y, b.x, b.y), steps = Math.ceil(d / 18);
    for (var i = 1; i < steps; i++) {
      var t = i / steps, x = lerp(a.x, b.x, t), y = lerp(a.y, b.y, t);
      if (!this.floorPoint(x, y) || this.doorAt(x, y, 2) || this.coverAt(x, y, 1)) return false;
    }
    return true;
  };
  PlayScene.prototype.moveBody = function (body, dx, dy, radius) {
    var nx = body.x + dx, ny = body.y + dy;
    if (this.walkable(nx, body.y, radius)) body.x = nx; else body.vx = 0;
    if (this.walkable(body.x, ny, radius)) body.y = ny; else body.vy = 0;
  };

  PlayScene.prototype.currentTarget = function () {
    var best = null, bestD = 600;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i]; if (!e.active || e.roomIndex !== this.run.roomIndex) continue;
      var d = distance(this.player.x, this.player.y, e.x, e.y);
      if (d < bestD && this.hasLOS(this.player, e)) { bestD = d; best = e; }
    }
    return best;
  };
  PlayScene.prototype.aimAngle = function () {
    var target = this.inputState.autoAim ? this.currentTarget() : null;
    if (this.inputState.directAim && (this.inputState.aimId !== null || this.inputState.lastPointerType === 'gamepad')) {
      var direct;
      if (this.inputState.aimRelative) direct = Math.atan2(this.inputState.aimDY, this.inputState.aimDX);
      else {
        var point = this.cameras.main.getWorldPoint(this.inputState.aimX, this.inputState.aimY);
        direct = Math.atan2(point.y - this.player.y, point.x - this.player.x);
      }
      if (!target || Math.abs(angleDiff(direct, Math.atan2(target.y - this.player.y, target.x - this.player.x))) > 0.16) return direct;
    }
    if (target) return Math.atan2(target.y - this.player.y, target.x - this.player.x);
    if (this.inputState.lastPointerType === 'mouse' && this.inputState.directAim) {
      var mouse = this.cameras.main.getWorldPoint(this.inputState.mouseX, this.inputState.mouseY);
      return Math.atan2(mouse.y - this.player.y, mouse.x - this.player.x);
    }
    var move = this.inputState.moveX || this.inputState.moveY ? Math.atan2(this.inputState.moveY, this.inputState.moveX) : this.player.face;
    return move;
  };

  PlayScene.prototype.toggleSpeedMode = function () {
    this.run.mode = this.run.mode === 'speedrun' ? 'normal' : 'speedrun';
    if (this.run.mode === 'speedrun') this.inputState.autoAim = false;
    this.toast(this.run.mode === 'speedrun' ? 'SPD · 75% PAR' : 'STD MODE', this.run.mode === 'speedrun' ? PAL.amber : PAL.mist);
  };

  PlayScene.prototype.readGamepad = function () {
    var state = this.gamepadState, pad = this.input && this.input.gamepad && this.input.gamepad.getPad ? this.input.gamepad.getPad(0) : null;
    var left = pad && pad.leftStick ? pad.leftStick : { x: 0, y: 0 }, right = pad && pad.rightStick ? pad.rightStick : { x: 0, y: 0 };
    function pressed(name, index) {
      if (!pad) return false;
      if (pad[name] && typeof pad[name].pressed === 'boolean') return pad[name].pressed;
      return !!(pad.buttons && pad.buttons[index] && (pad.buttons[index].pressed || pad.buttons[index].value > 0.5));
    }
    var swapLeft = pressed('X', 2), swapRight = pressed('Y', 3), reload = pressed('B', 1), restart = pressed('START', 9);
    state.moveX = Math.abs(left.x || 0) > 0.12 ? left.x : 0; state.moveY = Math.abs(left.y || 0) > 0.12 ? left.y : 0;
    state.aimX = Math.abs(right.x || 0) > 0.12 ? right.x : 0; state.aimY = Math.abs(right.y || 0) > 0.12 ? right.y : 0;
    if (Math.hypot(state.aimX, state.aimY) > 0.12) { this.inputState.lastPointerType = 'gamepad'; this.inputState.aimRelative = true; this.inputState.directAim = true; }
    else if (this.inputState.aimId === null && this.inputState.lastPointerType === 'gamepad') { this.inputState.lastPointerType = 'mouse'; this.inputState.aimRelative = false; this.inputState.directAim = false; }
    state.fire = pressed('A', 0) || pressed('RIGHT_SHOULDER', 5);
    state.swapLeft = swapLeft && !state.prevSwapLeft; state.swapRight = swapRight && !state.prevSwapRight;
    state.reload = reload && !state.prevReload; state.restart = restart && !state.prevRestart;
    state.prevSwapLeft = swapLeft; state.prevSwapRight = swapRight; state.prevReload = reload; state.prevRestart = restart;
    return state;
  };

  PlayScene.prototype.swapWeapon = function (dir) {
    this.player.weapon = (this.player.weapon + dir + WEAPONS.length) % WEAPONS.length;
    var state = this.run.weapons[this.player.weapon]; state.reload = 0; state.cooldown = Math.min(state.cooldown, 0.08);
    this.toast(WEAPONS[this.player.weapon].short + ' READY', WEAPONS[this.player.weapon].color);
    if (!this.run.tutorialActive || this.run.tutorialEnemyDefeated) this.run.tutorialStep = Math.max(this.run.tutorialStep, 2);
    kit.audio.sfx('door_chime', { volume: 0.34, rate: 1.2 });
  };
  PlayScene.prototype.beginReload = function () {
    var weaponState = this.run.weapons[this.player.weapon], weapon = WEAPONS[this.player.weapon];
    if (weaponState.reload > 0 || weaponState.mag >= weapon.mag || weaponState.reserve <= 0) return;
    weaponState.reload = weapon.reload; kit.audio.sfx('reload_click', { volume: 0.42, rate: 0.92 });
  };
  PlayScene.prototype.finishReload = function () {
    var state = this.run.weapons[this.player.weapon], weapon = WEAPONS[this.player.weapon];
    var need = weapon.mag - state.mag, give = Math.min(need, state.reserve);
    state.mag += give; state.reserve -= give; state.reload = 0;
  };

  PlayScene.prototype.ensureTutorialEnemy = function () {
    if (!this.run.tutorialActive || this.run.tutorialStep < 1 || this.run.tutorialSpawned) return;
    var room = this.floor.rooms[0], enemy = this.spawnEnemy('scout', 0, room.cx + 86, room.cy - 20, 1, 0.31);
    if (enemy) { enemy.tutorial = true; this.run.tutorialSpawned = true; }
  };
  PlayScene.prototype.fireWeapon = function () {
    if (this.run.state !== 'play') return;
    var weapon = WEAPONS[this.player.weapon], state = this.run.weapons[this.player.weapon];
    if (state.reload > 0 || state.cooldown > 0) return;
    if (state.mag <= 0) { this.beginReload(); return; }
    var base = this.aimAngle(), pattern = weapon.pellets;
    if (this.freeBulletCount() < pattern) { this.toast('BULLET POOL FULL', PAL.amber); return; }
    state.mag--; state.cooldown = weapon.cooldown; this.player.recoil = weapon.recoil; this.player.fireFlash = 0.09; this.player.fireRecover = 0.18;
    this.run.muzzleLight = { active: true, x: this.player.x + Math.cos(base) * 24, y: this.player.y + Math.sin(base) * 24, angle: base, color: weapon.color, age: 0 };
    this.run.alarm = Math.min(1, this.run.alarm + 0.035);
    for (var i = 0; i < pattern; i++) {
      var centered = i - (pattern - 1) / 2, randomSpread = (Math.random() - 0.5) * weapon.spread * (this.run.floorNo > 3 ? 1.08 : 1);
      var a = base + centered * weapon.spread / Math.max(1, pattern - 1) + randomSpread;
      if (this.spawnBullet(true, this.player.x + Math.cos(a) * 23, this.player.y + Math.sin(a) * 23,
        Math.cos(a) * weapon.speed, Math.sin(a) * weapon.speed, weapon.damage + this.run.weaponMods[this.player.weapon] * 3,
        weapon.color, 1.2, 3)) { this.run.shots++; this.run.floorShots++; }
    }
    this.player.face = base; this.spawnBurst(this.player.x + Math.cos(base) * 22, this.player.y + Math.sin(base) * 22, weapon.color, weapon.pellets > 1 ? 12 : 5, 'muzzle');
    kit.audio.sfx(weapon.sound, { volume: weapon.pellets > 1 ? 0.9 : 0.55, rate: 0.92 + Math.random() * 0.12 });
    if (!this.run.tutorialActive || this.run.tutorialStep >= 1) this.run.tutorialStep = Math.max(this.run.tutorialStep, 1);
    if (state.mag === 0 && state.reserve > 0) this.beginReload();
    for (var i2 = 0; i2 < this.enemies.length; i2++) if (this.enemies[i2].active && distance(this.player.x, this.player.y, this.enemies[i2].x, this.enemies[i2].y) < 650) this.enemies[i2].alert = 5;
  };
  PlayScene.prototype.freeBulletCount = function () { var count = 0; for (var i = 0; i < this.bullets.length; i++) if (!this.bullets[i].active) count++; return count; };
  PlayScene.prototype.spawnBullet = function (friendly, x, y, vx, vy, damage, color, life, radius) {
    for (var i = 0; i < this.bullets.length; i++) if (!this.bullets[i].active) {
      var b = this.bullets[i]; b.active = true; b.friendly = friendly; b.x = x; b.y = y; b.vx = vx; b.vy = vy; b.damage = damage; b.color = color; b.life = life || 2; b.radius = radius || 3; return true;
    }
    return false;
  };

  PlayScene.prototype.updatePlayer = function () {
    var pad = this.gamepadState, moveX = this.inputState.moveX + pad.moveX, moveY = this.inputState.moveY + pad.moveY;
    if (kit.input.keyDown('KeyW') || kit.input.keyDown('ArrowUp')) moveY -= 1;
    if (kit.input.keyDown('KeyS') || kit.input.keyDown('ArrowDown')) moveY += 1;
    if (kit.input.keyDown('KeyA') || kit.input.keyDown('ArrowLeft')) moveX -= 1;
    if (kit.input.keyDown('KeyD') || kit.input.keyDown('ArrowRight')) moveX += 1;
    var len = Math.hypot(moveX, moveY); if (len > 1) { moveX /= len; moveY /= len; len = 1; }
    var speed = 212 * (0.42 + Math.min(1, len) * 0.58);
    this.player.vx = moveX * speed; this.player.vy = moveY * speed;
    if (Math.hypot(pad.aimX, pad.aimY) > 0.12) { this.inputState.aimDX = pad.aimX; this.inputState.aimDY = pad.aimY; this.inputState.aimRelative = true; this.inputState.directAim = true; }
    if (len > 0.04) { this.moveBody(this.player, this.player.vx * STEP, this.player.vy * STEP, 16); this.player.movePhase += STEP * (8 + len * 5); this.run.tutorialStep = Math.max(this.run.tutorialStep, 1); }
    this.ensureTutorialEnemy();
    this.player.face = this.aimAngle(); this.player.recoil = Math.max(0, this.player.recoil - STEP * 1.8); this.player.fireFlash = Math.max(0, this.player.fireFlash - STEP); this.player.fireRecover = Math.max(0, this.player.fireRecover - STEP); this.player.invuln = Math.max(0, this.player.invuln - STEP);
    this.player.animState = this.player.fireFlash > 0 ? 'fire' : len > 0.04 ? 'move' : 'idle';
    for (var wi = 0; wi < this.run.weapons.length; wi++) {
      this.run.weapons[wi].cooldown = Math.max(0, this.run.weapons[wi].cooldown - STEP);
      if (this.run.weapons[wi].reload > 0) { this.run.weapons[wi].reload -= STEP; if (this.run.weapons[wi].reload <= 0 && wi === this.player.weapon) this.finishReload(); }
    }
    if (this.inputState.fireId !== null || pad.fire || kit.input.keyDown('Space')) this.fireWeapon();
    this.collectCards(); this.collectPickups(); this.checkVent();
    var room = this.roomAt(this.player.x, this.player.y);
    if (room) { room.entered = true; this.run.roomIndex = room.index; }
    var q = kit.input.keyDown('KeyQ'), e = kit.input.keyDown('KeyE'), r = kit.input.keyDown('KeyR'), t = kit.input.keyDown('KeyT'), m = kit.input.keyDown('KeyM');
    if ((q && !this.inputState.prevQ) || pad.swapLeft) this.swapWeapon(-1); if ((e && !this.inputState.prevE) || pad.swapRight) this.swapWeapon(1); if ((r && !this.inputState.prevR) || pad.reload) this.beginReload();
    if (t && !this.inputState.prevT) { this.inputState.autoAim = !this.inputState.autoAim; this.toast(this.inputState.autoAim ? 'AUTO AIM' : 'MANUAL AIM', this.inputState.autoAim ? PAL.cyan : PAL.mist); }
    if (m && !this.inputState.prevM) this.toggleSpeedMode();
    this.inputState.prevQ = q; this.inputState.prevE = e; this.inputState.prevR = r; this.inputState.prevT = t; this.inputState.prevM = m;
    if (this.run.tutorialStep >= 3 && !profile.tutorialDone) { profile.tutorialDone = true; this.run.tutorialActive = false; saveProfile(); }
    if (this.floor.lift.active && distance(this.player.x, this.player.y, this.floor.lift.x, this.floor.lift.y) < 58) this.arriveAtLift();
    this.updateHazards();
  };
  PlayScene.prototype.collectCards = function () {
    for (var i = 0; i < this.floor.cards.length; i++) { var card = this.floor.cards[i]; if (this.run.tutorialActive && i === 0 && this.run.tutorialStep < 2) continue; if (!card.got && distance(this.player.x, this.player.y, card.x, card.y) < 30) {
      card.got = true; this.run.cardsFound++; var door = this.floor.doors[i]; if (door) { door.targetOpen = false; this.run.light = { active: true, x: door.x + door.w / 2, y: door.y + door.h / 2, color: door.color, age: 0 }; }
      profile.cards[this.floor.no + '-' + i] = true; saveProfile(); this.addPopup(card.x, card.y - 24, card.key.toUpperCase() + ' CARD', card.color); this.toast('ACCESS · ' + card.key.toUpperCase(), card.color); this.spawnBurst(card.x, card.y, card.color, 22, 'unlock'); this.celebrateReward(card.color, 1); kit.audio.sfx('keycard_chime', { volume: 0.72 }); this.run.tutorialStep = Math.max(this.run.tutorialStep, 3);
    } }
  };
  PlayScene.prototype.collectPickups = function () {
    for (var i = 0; i < this.pickups.length; i++) { var p = this.pickups[i]; if (!p.active || distance(this.player.x, this.player.y, p.x, p.y) > 29) continue;
      p.active = false;
      if (p.type === 'health') { this.player.health = Math.min(this.player.maxHealth, this.player.health + p.amount); this.toast('♥ +' + p.amount, PAL.green); }
      else if (p.type === 'armor') { this.player.armor = Math.min(60, this.player.armor + p.amount); this.toast('ARM +' + p.amount, PAL.blue); }
      else if (p.type === 'ammo') { this.run.weapons[this.player.weapon].reserve += p.amount; this.toast(WEAPONS[this.player.weapon].short + ' AMMO +' + p.amount, PAL.amber); }
      else { this.run.weaponMods[this.player.weapon] = Math.min(8, this.run.weaponMods[this.player.weapon] + 1); this.toast('MOD +' + this.run.weaponMods[this.player.weapon], PAL.violet); }
      kit.audio.sfx('pickup_ping', { volume: 0.42, rate: p.type === 'mod' ? 1.35 : 1.05 });
      this.addPopup(p.x, p.y - 22, p.type === 'mod' ? 'MOD +' : '+' + p.amount, p.type === 'health' ? PAL.green : p.type === 'armor' ? PAL.blue : p.type === 'ammo' ? PAL.amber : PAL.violet);
      this.spawnBurst(p.x, p.y, p.type === 'health' ? PAL.green : p.type === 'armor' ? PAL.blue : p.type === 'mod' ? PAL.violet : PAL.amber, 15, 'pickup');
      this.celebrateReward(p.type === 'health' ? PAL.green : p.type === 'armor' ? PAL.blue : p.type === 'mod' ? PAL.violet : PAL.amber, p.type === 'mod' ? 2 : 1);
    }
  };
  PlayScene.prototype.checkVent = function () {
    var v = this.floor.vent; if (!v) return;
    if (!v.discovered && this.run.roomIndex === v.from && distance(this.player.x, this.player.y, v.x, v.y) < 48) { v.discovered = true; this.toast('VENT FOUND', PAL.cyan); this.run.tutorialStep = Math.max(this.run.tutorialStep, 3); }
    if (v.discovered && distance(this.player.x, this.player.y, v.x, v.y) < 32 && (kit.input.keyDown('KeyF') || kit.input.keyDown('Enter'))) {
      var destination = this.floor.rooms[v.to] || this.floor.rooms[0]; this.player.x = destination.cx; this.player.y = destination.cy; this.run.roomIndex = destination.index; v.used = true; this.toast('VENT TRANSIT', PAL.cyan); kit.audio.sfx('door_chime', { volume: 0.5, rate: 1.4 });
    }
  };
  PlayScene.prototype.damagePlayer = function (amount) {
    if (this.player.invuln > 0 || this.run.state !== 'play') return;
    var armorHit = Math.min(this.player.armor, Math.ceil(amount * 0.55)); this.player.armor -= armorHit; amount -= armorHit; this.player.health -= amount; this.player.invuln = 0.55; this.run.damagePulse = 1;
    this.run.hitStop = kit.juice.enabled ? 0.055 : 0; kit.juice.shake(7, 150); this.spawnBurst(this.player.x, this.player.y, PAL.red, kit.juice.enabled ? 14 : 4, 'impact'); kit.audio.sfx('hit_impact', { volume: 0.58 });
    kit.audio.sfx('warning_beep', { volume: 0.25, rate: 0.82 });
    if (this.player.health <= 0) { this.player.health = 0; this.run.state = 'dead'; this.saveRunScore(); this.announce('OPERATOR DOWN', 'TAP TO RESTART', PAL.red); }
  };

  PlayScene.prototype.updateEnemies = function () {
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i]; if (!e.active) continue;
      e.flash = Math.max(0, e.flash - STEP); e.stun = Math.max(0, e.stun - STEP); e.cooldown -= STEP; e.animTime += STEP;
      e.recovery = Math.max(0, e.recovery - STEP); e.anticipation = Math.max(0, e.anticipation - STEP);
      var d = distance(e.x, e.y, this.player.x, this.player.y), sameRoom = e.roomIndex === this.run.roomIndex;
      if (sameRoom && (d < 620 || this.floor.rooms[e.roomIndex].entered) && this.hasLOS(e, this.player)) e.alert = Math.max(e.alert, 3.4);
      e.alert = Math.max(0, e.alert - STEP);
      if (e.boss) { this.updateBoss(e, d); continue; }
      if (e.stun > 0) continue;
      var s = enemyStats(e.kind);
      if (e.alert <= 0) {
        e.state = 'patrol'; e.animState = e.kind === 'patrol' ? 'move' : 'idle';
        if (e.kind === 'patrol') {
          var patrolAngle = this.simTime * (0.55 + e.seed * 0.18) + e.seed * TAU, patrolX = e.patrolX + Math.cos(patrolAngle) * 24, patrolY = e.patrolY + Math.sin(patrolAngle) * 18;
          e.facing = Math.atan2(patrolY - e.y, patrolX - e.x); this.moveEnemy(e, patrolX, patrolY, s.speed * STEP * 0.32);
        } else e.facing += Math.sin(this.simTime * 1.7 + e.seed * 4) * STEP * 0.7;
        continue;
      }
      e.facing = Math.atan2(this.player.y - e.y, this.player.x - e.x);
      if (e.kind === 'gunner' || e.kind === 'turret') {
        if (e.kind === 'gunner' && (this.hasLOS(e, this.player) || d < 230)) this.seekCover(e);
        if (e.state === 'cover' && distance(e.x, e.y, e.coverX, e.coverY) > 16) { e.animState = 'move'; this.moveEnemy(e, e.coverX, e.coverY, s.speed * STEP); }
        if (this.hasLOS(e, this.player) && d < s.range) { if (e.cooldown <= 0) { e.animState = 'anticipation'; e.animTime = 0; this.enemyShoot(e, 1, s.damage, e.kind === 'turret' ? 290 : 250); e.cooldown = e.kind === 'turret' ? 1.05 : 1.28 - Math.min(0.32, this.run.floorNo * 0.035); } }
      } else if (e.kind === 'flanker') {
        e.state = 'flank'; e.animState = 'move'; var flankAngle = Math.atan2(this.player.y - e.y, this.player.x - e.x) + e.flankSide * (this.run.floorNo >= 3 ? 1.15 : 0.8);
        var tx = this.player.x - Math.cos(flankAngle) * 105, ty = this.player.y - Math.sin(flankAngle) * 105;
        this.moveEnemy(e, tx, ty, s.speed * STEP); if (d < s.range) this.damagePlayer(s.damage * STEP * 0.9);
      } else if (e.kind === 'patrol') {
        e.state = 'intercept'; e.animState = 'move'; this.moveEnemy(e, this.player.x, this.player.y, s.speed * STEP * 0.8); if (d < s.range) this.damagePlayer(s.damage * STEP * 0.85);
      } else if (e.kind === 'hunter') {
        e.state = 'hunt'; e.animState = e.recovery > 0 ? 'recovery' : 'move'; this.moveEnemy(e, this.player.x, this.player.y, s.speed * STEP); if (d < s.range) this.damagePlayer(s.damage * STEP * 0.86);
        if (d < 180 && e.cooldown <= 0) { e.animState = 'anticipation'; e.cooldown = 1.2; this.spawnBurst(e.x, e.y, e.color, 5, 'muzzle'); }
      } else if (e.kind === 'swarm') {
        e.state = 'swarm'; e.animState = 'move'; var swarmAngle = Math.atan2(this.player.y - e.y, this.player.x - e.x) + Math.sin(this.simTime * 5 + e.seed * 9) * 0.75;
        this.moveEnemy(e, this.player.x + Math.cos(swarmAngle) * 14, this.player.y + Math.sin(swarmAngle) * 14, s.speed * STEP); if (d < s.range) this.damagePlayer(s.damage * STEP * 0.8);
      } else {
        e.state = 'hunt'; e.animState = 'move'; this.moveEnemy(e, this.player.x, this.player.y, s.speed * STEP); if (d < s.range) this.damagePlayer(s.damage * STEP * 0.9);
      }
      if (d < e.radius + 17 && e.kind !== 'flanker' && e.kind !== 'hunter' && e.kind !== 'swarm') this.damagePlayer(s.damage * STEP * 0.75);
    }
    for (var ri = 0; ri < this.floor.rooms.length; ri++) {
      var room = this.floor.rooms[ri]; if (!room.entered || room.cleared) continue;
      var left = this.roomEnemyCount(ri); room.enemiesLeft = left;
      if (left === 0 && !(this.run.tutorialActive && ri === 0 && !this.run.tutorialEnemyDefeated)) this.clearRoom(room);
    }
  };
  PlayScene.prototype.seekCover = function (e) {
    if (e.state === 'cover' && distance(e.x, e.y, e.coverX, e.coverY) > 14) return;
    var best = null, bestScore = -Infinity;
    for (var i = 0; i < this.floor.covers.length; i++) { var c = this.floor.covers[i]; if (c.roomIndex !== e.roomIndex) continue;
      var dPlayer = distance(c.x + c.w / 2, c.y + c.h / 2, this.player.x, this.player.y), dSelf = distance(c.x, c.y, e.x, e.y);
      var score = dPlayer - dSelf * 0.25 + (this.hasLOS({ x: c.x, y: c.y }, this.player) ? -90 : 100);
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (best) { e.coverX = best.x + best.w / 2; e.coverY = best.y + best.h / 2; e.state = 'cover'; }
  };
  PlayScene.prototype.moveEnemy = function (e, tx, ty, distanceStep) {
    var dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy); if (d < 1) return;
    dx /= d; dy /= d; e.vx = dx * distanceStep / STEP; e.vy = dy * distanceStep / STEP;
    if (this.walkable(e.x + dx * distanceStep, e.y, e.radius)) e.x += dx * distanceStep;
    if (this.walkable(e.x, e.y + dy * distanceStep, e.radius)) e.y += dy * distanceStep;
  };
  PlayScene.prototype.enemyShoot = function (e, count, damage, speed) {
    e.animState = 'attack'; e.animTime = 0; e.recovery = 0.18;
    var base = Math.atan2(this.player.y - e.y, this.player.x - e.x);
    for (var i = 0; i < count; i++) { var a = base + (Math.random() - 0.5) * (e.boss ? 0.12 : 0.08); this.spawnBullet(false, e.x + Math.cos(a) * (e.radius + 5), e.y + Math.sin(a) * (e.radius + 5), Math.cos(a) * speed, Math.sin(a) * speed, damage, e.color, 3.2, e.boss ? 6 : 4); }
    this.spawnBurst(e.x + Math.cos(base) * (e.radius + 8), e.y + Math.sin(base) * (e.radius + 8), e.color, 4, 'muzzle'); kit.audio.sfx('weapon_fire_3', { volume: 0.22, rate: 0.55 });
  };
  PlayScene.prototype.updateBoss = function (e, d) {
    e.phase = e.hp > e.maxHp * 0.66 ? 1 : e.hp > e.maxHp * 0.33 ? 2 : 3;
    if (e.phase !== e.phaseSeen) { e.phaseSeen = e.phase; this.toast('PHASE ' + e.phase + ' · ' + (e.phase === 2 ? 'BREAK GUARD' : e.phase === 3 ? 'CORE EXPOSED' : 'TARGET LOCK'), e.color); kit.audio.sfx('boss_phase', { volume: 0.8, rate: 0.8 + e.phase * 0.12 }); this.spawnBurst(e.x, e.y, e.color, 32, 'phase'); }
    e.facing += STEP * (e.phase === 3 ? 1.8 : 0.8); if (e.alert <= 0) e.alert = 99;
    if (d > 180) { e.animState = 'move'; this.moveEnemy(e, this.player.x, this.player.y, e.speed * STEP); }
    if (e.telegraph > 0) { e.telegraph -= STEP; e.animState = 'telegraph'; if (e.telegraph <= 0) this.fireBossAttack(e); return; }
    if (e.cooldown <= 0) { e.telegraph = e.phase === 1 ? 0.48 : e.phase === 2 ? 0.68 : 0.38; e.animState = 'telegraph'; this.spawnBurst(e.x, e.y, e.phase === 2 ? PAL.amber : PAL.rose, e.phase === 2 ? 18 : 10, 'telegraph'); kit.audio.sfx('warning_beep', { volume: 0.45, rate: e.phase === 3 ? 1.25 : 0.9 }); }
  };
  PlayScene.prototype.fireBossAttack = function (e) {
    if (e.phase === 1) this.enemyShoot(e, 3, e.damage, 260);
    else if (e.phase === 2) { for (var i = 0; i < 10; i++) { var a = i * TAU / 10 + this.simTime * 0.4; this.spawnBullet(false, e.x, e.y, Math.cos(a) * 220, Math.sin(a) * 220, e.damage * 0.7, PAL.amber, 3.6, 5); } this.spawnEnemy('flanker', e.roomIndex, e.x + 60, e.y, 1.4, 0.77); }
    else { this.enemyShoot(e, 5, e.damage * 0.9, 310); for (var j = 0; j < 5; j++) { var aa = e.facing + j * 0.42 - 0.84; this.spawnBullet(false, e.x, e.y, Math.cos(aa) * 330, Math.sin(aa) * 330, e.damage * 0.5, PAL.rose, 2.7, 5); } }
    e.cooldown = e.phase === 1 ? 1.15 : e.phase === 2 ? 1.7 : 0.92;
  };
  PlayScene.prototype.roomEnemyCount = function (roomIndex) { var count = 0; for (var i = 0; i < this.enemies.length; i++) if (this.enemies[i].active && this.enemies[i].roomIndex === roomIndex) count++; return count; };
  PlayScene.prototype.clearRoom = function (room) {
    if (room.cleared) return; room.cleared = true; this.floor.clearedCount++; this.run.roomsCleared++; this.run.score += 150 + this.run.floorNo * 55;
    if (this.player.stealth) { profile.stealthClears[this.floor.no + '-' + room.index] = true; saveProfile(); }
    this.spawnRoomDrops(room); this.toast('CLEAR · R' + (room.index + 1), PAL.green); this.spawnBurst(room.cx, room.cy, PAL.green, 18, 'clear'); this.celebrateReward(PAL.green, 2); kit.audio.sfx('room_clear', { volume: 0.56, rate: 0.96 + room.index * 0.05 });
    if (room.index === 4) { this.floor.lift.active = this.allRoomsCleared() && (this.run.floorNo !== 9 || this.run.bossDefeated); this.toast(this.floor.lift.active ? 'LIFT READY' : 'MORE ROOMS', this.floor.lift.active ? PAL.green : PAL.amber); }
    else kit.audio.sfx('door_chime', { volume: 0.35, rate: 1 + room.index * 0.06 });
  };
  PlayScene.prototype.spawnRoomDrops = function (room) {
    var specs = [{ type: 'ammo', amount: 9 }, { type: 'armor', amount: 14 }, { type: 'health', amount: 22 }, { type: 'mod', amount: 1 }];
    for (var i = 0; i < specs.length; i++) {
      for (var p = 0; p < this.pickups.length; p++) if (!this.pickups[p].active) { var item = this.pickups[p]; item.active = true; item.type = specs[i].type; item.amount = specs[i].amount; item.roomIndex = room.index; item.x = room.x + 46 + ((i * 49) % (room.w - 80)); item.y = room.y + room.h - 46; item.bob = i * 1.7; break; }
    }
  };
  PlayScene.prototype.updateBullets = function () {
    for (var i = 0; i < this.bullets.length; i++) {
      var b = this.bullets[i]; if (!b.active) continue;
      b.x += b.vx * STEP; b.y += b.vy * STEP; b.life -= STEP;
      if (b.life <= 0 || !this.floorPoint(b.x, b.y) || this.doorAt(b.x, b.y, b.radius) || this.coverAt(b.x, b.y, b.radius)) { b.active = false; continue; }
      if (b.friendly) {
        var hit = false;
        for (var cameraIndex = 0; cameraIndex < this.floor.cameras.length; cameraIndex++) {
          var camera = this.floor.cameras[cameraIndex];
          if (camera.disabled || distance(b.x, b.y, camera.x, camera.y) > 18 + b.radius) continue;
          camera.hp -= b.damage; hit = true; this.spawnImpact(b.x, b.y, PAL.coolant);
          if (camera.hp <= 0) { camera.disabled = true; profile.cameraDisables[this.floor.no + '-' + cameraIndex] = true; saveProfile(); this.run.securityCompromised = false; this.toast('CAMERA OFFLINE', PAL.green); this.spawnBurst(camera.x, camera.y, PAL.coolant, 18, 'coolant'); kit.audio.sfx('door_chime', { volume: 0.34, rate: 1.55 }); }
          break;
        }
        if (hit) { b.active = false; continue; }
        for (var ei = 0; ei < this.enemies.length; ei++) { var e = this.enemies[ei]; if (!e.active || distance(b.x, b.y, e.x, e.y) > e.radius + b.radius) continue;
          hit = true; this.run.hits++; this.run.floorHits++; e.hp -= b.damage; e.flash = 0.08; e.animState = 'hit'; e.animTime = 0; this.spawnImpact(b.x, b.y, b.color); if (e.boss) e.stun = 0.035; if (e.hp <= 0) this.killEnemy(e); break;
        }
        if (hit) b.active = false;
      } else if (distance(b.x, b.y, this.player.x, this.player.y) < 18) { this.damagePlayer(b.damage); this.spawnImpact(b.x, b.y, b.color); b.active = false; }
    }
  };
  PlayScene.prototype.killEnemy = function (e) {
    if (!e.active) return; var wasBoss = e.boss; this.spawnDeathActor(e); if (e.tutorial) { this.run.tutorialEnemyDefeated = true; this.run.tutorialStep = Math.max(this.run.tutorialStep, 2); } e.animState = 'death'; e.active = false; this.run.score += wasBoss ? 2200 : 90 + this.run.floorNo * 18; this.run.hitStop = kit.juice.enabled ? (wasBoss ? 0.11 : 0.045) : 0;
    kit.juice.shake(wasBoss ? 12 : 4, wasBoss ? 260 : 100); if (wasBoss) this.toast('SENTINEL DOWN', PAL.gold); this.spawnBurst(e.x, e.y, wasBoss ? PAL.gold : e.color, wasBoss ? 42 : 18, wasBoss ? 'boss' : 'death'); this.spawnRing(e.x, e.y, wasBoss ? PAL.gold : e.color, wasBoss ? 70 : 32);
    if (wasBoss) { this.run.bossDefeated = true; this.floor.bossDefeated = true; this.floor.lift.active = true; this.celebrateReward(PAL.gold, 4); kit.audio.sfx('boss_phase', { volume: 0.9, rate: 0.55 }); }
  };
  PlayScene.prototype.updateEffects = function () {
    var i;
    for (var particleSystemIndex = 0; particleSystemIndex < PARTICLE_SYSTEMS.length; particleSystemIndex++) {
      var particlePool = this.particleSystems[PARTICLE_SYSTEMS[particleSystemIndex]];
      for (var particleIndex = 0; particleIndex < particlePool.length; particleIndex++) { var p = particlePool[particleIndex]; if (!p.active) continue; p.x += p.vx * STEP; p.y += p.vy * STEP; p.vx *= 0.94; p.vy *= 0.94; p.life -= STEP; if (p.life <= 0) p.active = false; }
    }
    for (i = 0; i < this.rings.length; i++) { var ring = this.rings[i]; if (!ring.active) continue; ring.life -= STEP; ring.radius += (ring.max > 40 ? 220 : 130) * STEP; if (ring.life <= 0) ring.active = false; }
    for (i = 0; i < this.popups.length; i++) { var pop = this.popups[i]; if (!pop.active) continue; pop.y -= 23 * STEP; pop.life -= STEP; if (pop.life <= 0) pop.active = false; }
    for (i = 0; i < this.deathActors.length; i++) { var actor = this.deathActors[i]; if (!actor.active) continue; actor.life -= STEP; actor.phase += STEP * 8; if (actor.life <= 0) actor.active = false; }
    if (this.run.light.active) { this.run.light.age += STEP; if (this.run.light.age > 1.15) this.run.light.active = false; }
    if (this.run.muzzleLight.active) { this.run.muzzleLight.age += STEP; if (this.run.muzzleLight.age > 0.16) this.run.muzzleLight.active = false; }
    this.run.rewardPulse = Math.max(0, this.run.rewardPulse - STEP * 1.8);
    if (this.run.state === 'dead' || this.run.state === 'victory') this.run.endReveal = Math.min(1, this.run.endReveal + STEP * 2.6);
    for (var doorIndex = 0; doorIndex < this.floor.doors.length; doorIndex++) {
      var door = this.floor.doors[doorIndex]; door.openProgress = clamp(door.openProgress, 0, 1);
    }
    if (this.run.banner.active) {
      this.run.banner.age += STEP;
      if (this.run.banner.age > 1.25) this.run.banner.active = false;
    }
    if (this.run.tutorialActive && !profile.tutorialDone) this.run.tutorialFade += STEP;
    if (this.toastAge > 0) {
      this.toastAge -= STEP;
      if (this.toastAge <= 0) {
        this.toastAge = 0; this.toastText = '';
        if (!this.run.banner.active && this.toastQueue.length) {
          var nextToast = this.toastQueue.shift(); this.toast(nextToast.message, nextToast.color);
        }
      }
    } else if (!this.run.banner.active && this.toastQueue.length) {
      var queuedToast = this.toastQueue.shift(); this.toast(queuedToast.message, queuedToast.color);
    }
    this.run.damagePulse = Math.max(0, this.run.damagePulse - STEP * 2.4);
  };
  PlayScene.prototype.particleSystemFor = function (type) {
    if (type === 'muzzle') return 'muzzle';
    if (type === 'impact') return 'impact';
    if (type === 'smoke') return 'smoke';
    if (type === 'death' || type === 'boss') return 'death';
    if (type === 'phase' || type === 'telegraph') return 'telegraph';
    if (type === 'coolant') return 'coolant';
    return 'pickup';
  };
  PlayScene.prototype.spawnBurst = function (x, y, color, count, type) {
    var reduced = !kit.juice.enabled, n = reduced ? Math.min(4, count) : count;
    var system = this.particleSystems[this.particleSystemFor(type)], typeName = type || 'spark';
    for (var i = 0; i < n; i++) {
      var particle = null, oldest = Infinity;
      for (var p = 0; p < system.length; p++) if (!system[p].active) { particle = system[p]; break; }
      if (!particle) for (var q = 0; q < system.length; q++) if (system[q].life < oldest) { oldest = system[q].life; particle = system[q]; }
      if (!particle) continue;
      var a = Math.random() * TAU, speed = typeName === 'smoke' ? 22 + Math.random() * 30 : typeName === 'coolant' ? 18 + Math.random() * 70 : 40 + Math.random() * 150;
      particle.active = true; particle.type = typeName; particle.x = x; particle.y = y; particle.vx = Math.cos(a) * speed; particle.vy = Math.sin(a) * speed; particle.max = typeName === 'coolant' ? 0.36 + Math.random() * 0.3 : 0.24 + Math.random() * 0.38; particle.life = particle.max; particle.size = typeName === 'smoke' ? 5 + Math.random() * 8 : typeName === 'coolant' ? 2 + Math.random() * 4 : 2 + Math.random() * 3; particle.color = color;
    }
  };
  PlayScene.prototype.spawnImpact = function (x, y, color) { this.spawnBurst(x, y, color, 6, 'impact'); this.spawnBurst(x, y, PAL.coolant, 4, 'coolant'); this.spawnRing(x, y, color, 18); kit.audio.sfx('hit_impact', { volume: 0.18, rate: 1.2 }); };
  PlayScene.prototype.spawnRing = function (x, y, color, radius) { var r = null, oldest = Infinity; for (var i = 0; i < this.rings.length; i++) { if (!this.rings[i].active) { r = this.rings[i]; break; } if (this.rings[i].life < oldest) { oldest = this.rings[i].life; r = this.rings[i]; } } if (r) { r.active = true; r.x = x; r.y = y; r.radius = 5; r.max = radius; r.life = 0.34; r.color = color; r.width = radius > 40 ? 5 : 2; } };
  PlayScene.prototype.celebrateReward = function (color, tier) {
    this.run.rewardTier = Math.min(6, this.run.rewardTier + (tier || 1)); this.run.rewardPulse = 1.05;
    var burst = kit.juice.enabled ? 8 + this.run.rewardTier * 3 : 3;
    this.spawnBurst(this.player.x, this.player.y, color || PAL.gold, burst, 'pickup');
    this.spawnRing(this.player.x, this.player.y, color || PAL.gold, 22 + this.run.rewardTier * 8);
  };
  /* World popups were redundant with the score, meter, and single corner notice. */
  PlayScene.prototype.addPopup = function () {};
  PlayScene.prototype.spawnDeathActor = function (e) { for (var i = 0; i < this.deathActors.length; i++) if (!this.deathActors[i].active) { var actor = this.deathActors[i]; actor.active = true; actor.kind = e.kind; actor.x = e.x; actor.y = e.y; actor.radius = e.radius; actor.color = e.color; actor.facing = e.facing; actor.life = actor.max; actor.phase = 0; return; } };
  PlayScene.prototype.toast = function (message, color) {
    if (!message) return;
    var notice = { message: String(message), color: color || PAL.white };
    if (this.run.banner.active || this.toastAge > 0) {
      var last = this.toastQueue.length ? this.toastQueue[this.toastQueue.length - 1] : null;
      if ((last && last.message === notice.message) || this.toastText === notice.message) return;
      if (this.toastQueue.length < 4) this.toastQueue.push(notice);
      return;
    }
    this.toastText = notice.message; this.toastColor = notice.color; this.toastAge = 1;
  };
  PlayScene.prototype.announce = function (head, sub, color) {
    /* Boundary banners have priority; routine events use the queued corner chip. */
    this.toastText = ''; this.toastAge = 0; this.toastQueue.length = 0;
    this.run.banner = { active: true, age: 0, head: head, sub: sub, color: color || PAL.cyan, boundary: true };
  };

  PlayScene.prototype.arriveAtLift = function () {
    if (this.run.floorWon || this.run.state !== 'play') return;
    if (!this.allRoomsCleared()) { this.toast('CLEAR ROOMS FIRST', PAL.amber); return; }
    if (this.run.floorNo === 9 && !this.run.bossDefeated) { this.toast('BOSS ACTIVE', PAL.red); return; }
    this.run.floorWon = true; this.run.score += 500 + this.run.floorNo * 100; this.recordFloor(); this.celebrateReward(this.floor.family.accent, 3);
    this.announce(this.run.floorNo === 9 ? 'PROTOCOL COMPLETE' : 'LIFT ARRIVAL', this.run.floorNo === 9 ? 'CORE CLEARED // EXFIL READY' : 'NEXT FLOOR UNLOCKED', this.floor.family.accent); kit.audio.sfx('door_chime', { volume: 0.8, rate: 1.5 });
    if (this.run.floorNo < FLOOR_FAMILIES.length) { this.run.state = 'between'; }
    else { this.run.state = 'victory'; profile.completedRuns++; profile.alarmBest = Math.max(profile.alarmBest, this.run.alarmPeak); this.saveRunScore(); saveProfile(); kit.audio.sfx('victory_fanfare', { volume: 0.78, rate: 1 }); }
  };
  PlayScene.prototype.allRoomsCleared = function () { for (var i = 0; i < this.floor.rooms.length; i++) if (!this.floor.rooms[i].cleared) return false; return true; };
  PlayScene.prototype.recordFloor = function () {
    var no = this.run.floorNo, par = this.run.mode === 'speedrun' ? this.floor.family.par * 0.75 : this.floor.family.par, accuracy = this.run.floorShots ? this.run.floorHits / this.run.floorShots : 1, medal = 1;
    if (this.run.floorTime <= par) medal++; if (accuracy >= 0.72) medal++; if (this.run.cardsFound >= 3) medal = Math.min(3, medal + 1);
    var key = String(no); profile.medals[key] = Math.max(profile.medals[key] || 0, medal); profile.bestTimes[key] = profile.bestTimes[key] ? Math.min(profile.bestTimes[key], this.run.floorTime) : this.run.floorTime; profile.bestAccuracy[key] = Math.max(profile.bestAccuracy[key] || 0, accuracy);
    profile.unlockedFloor = Math.max(profile.unlockedFloor, Math.min(FLOOR_FAMILIES.length, no + 1)); saveProfile();
  };
  PlayScene.prototype.saveRunScore = function () { profile.bestScore = Math.max(profile.bestScore, Math.floor(this.run.score)); saveProfile(); };
  PlayScene.prototype.nextFloor = function () { if (this.run.floorNo < FLOOR_FAMILIES.length) { this.run.state = 'play'; this.loadFloor(this.run.floorNo + 1, false); } };

  PlayScene.prototype.updateAudioIntensity = function () {
    this.audioDangerTimer -= STEP;
    if (this.audioDangerTimer > 0) return;
    this.audioDangerTimer = 0.22;
    var danger = this.player.health < 48;
    for (var i = 0; i < this.enemies.length; i++) if (this.enemies[i].active && this.enemies[i].roomIndex === this.run.roomIndex && (this.enemies[i].alert > 0 || this.enemies[i].telegraph > 0)) danger = true;
    if (danger !== this.audioDanger) { this.audioDanger = danger; kit.audio.music(danger ? 'danger_intensity' : 'ambient_hum', 520); }
  };

  PlayScene.prototype.readDebugSwitches = function () {
    if (debugApi.forceFloor !== lastApiForceFloor) { DP_DEBUG_STATE.forceFloor = debugApi.forceFloor || 0; lastApiForceFloor = debugApi.forceFloor || 0; }
    if (debugApi.forceRoom !== lastApiForceRoom) { DP_DEBUG_STATE.forceRoom = debugApi.forceRoom || ''; lastApiForceRoom = debugApi.forceRoom || ''; }
    var floorSwitch = Number(debugApi.forceFloor || DP_DEBUG_STATE.forceFloor || 0), roomSwitch = debugApi.forceRoom || DP_DEBUG_STATE.forceRoom || '';
    if (Number.isInteger(floorSwitch) && floorSwitch >= 1 && floorSwitch <= FLOOR_FAMILIES.length && floorSwitch !== this.run.floorNo) { this.loadFloor(floorSwitch, false); return; }
    if (roomSwitch && this.floor) {
      var target = null; for (var i = 0; i < this.floor.rooms.length; i++) if (this.floor.rooms[i].id === roomSwitch || String(this.floor.rooms[i].index) === String(roomSwitch) || this.floor.rooms[i].label.toLowerCase() === String(roomSwitch).toLowerCase()) target = this.floor.rooms[i];
      if (target && target.index !== this.run.roomIndex) { this.player.x = target.cx; this.player.y = target.cy; this.run.roomIndex = target.index; target.entered = true; }
    }
  };
  PlayScene.prototype.step = function () {
    this.readDebugSwitches();
    this.readGamepad();
    if (this.run.hitStop > 0) { this.run.hitStop -= STEP; this.updateEffects(); return; }
    this.simTime += STEP;
    if (this.run.state === 'dead' || this.run.state === 'victory') {
      var enter = kit.input.keyDown('Enter') || kit.input.keyDown('NumpadEnter'), floorKeys = [];
      for (var floorKeyIndex = 0; floorKeyIndex < 9; floorKeyIndex++) floorKeys[floorKeyIndex] = kit.input.keyDown('Digit' + (floorKeyIndex + 1));
      if ((enter && !this.inputState.prevEnter) || this.gamepadState.restart) { this.hardRestart(1); this.inputState.prevEnter = enter; this.updateEffects(); return; }
      for (var selectableIndex = 0; selectableIndex < floorKeys.length; selectableIndex++) if (floorKeys[selectableIndex] && !this.inputState.prevFloorKeys[selectableIndex] && selectableIndex + 1 <= profile.unlockedFloor) { this.hardRestart(selectableIndex + 1); this.inputState.prevFloorKeys[selectableIndex] = true; this.updateEffects(); return; }
      this.inputState.prevEnter = enter; this.inputState.prevFloorKeys = floorKeys; this.updateEffects(); return;
    }
    if (this.run.state === 'between') { if (this.run.banner.age > 0.95) this.nextFloor(); this.updateEffects(); return; }
    if (this.run.state === 'play') {
      this.run.floorTime += STEP; this.run.totalTime += STEP; this.updatePlayer(); this.updateSecurity(); this.updateEnemies(); this.updateBullets();
      this.updateAudioIntensity();
    }
    this.updateEffects();
  };

  PlayScene.prototype.update = function (_time, delta) {
    if (this.pausedByKit) return;
    this.accumulator += clamp((delta || 0) / 1000, 0, 0.05);
    var steps = 0; while (this.accumulator >= STEP && steps < MAX_STEPS) { this.step(); this.accumulator -= STEP; steps++; }
    /* Deliberately retain the excess accumulator. This is slow motion, never a time skip. */
    this.renderFrame(); syncDebug(this);
  };

  PlayScene.prototype.renderFrame = function () {
    var joy = kit.juice.frame(), camera = this.cameras.main;
    camera.centerOn(this.player.x + joy.dx * 0.45, this.player.y + joy.dy * 0.45);
    this.world.clear(); this.shadows.clear(); this.lightGlow.clear(); this.entities.clear(); this.fx.clear(); this.ui.clear(); this.uiFx.clear();
    this.drawWorld(); this.drawLighting(); this.drawEntities(); this.drawEffects(); this.drawHud();
  };
  PlayScene.prototype.drawWorld = function () {
    var g = this.world, family = this.floor.family;
    for (var existingLabelIndex = 0; existingLabelIndex < this.worldLabels.length; existingLabelIndex++) this.worldLabels[existingLabelIndex].setVisible(false);
    this.worldLabelCursor = 0;
    for (var roomPanelIndex = 0; roomPanelIndex < this.visual.roomPanels.length; roomPanelIndex++) this.visual.roomPanels[roomPanelIndex].setVisible(false);
    for (var ci = 0; ci < this.floor.covers.length; ci++) { var cover = this.floor.covers[ci], coverSprite = this.visual.covers[ci]; if (!coverSprite) continue; coverSprite.setVisible(true).setPosition(cover.x + cover.w / 2, cover.y + cover.h / 2).setDisplaySize(cover.w, cover.h); }
    for (var di = 0; di < this.floor.doors.length; di++) {
      var d = this.floor.doors[di], doorSprite = this.visual.doors[di], verticalDoor = d.h > d.w, doorScale = Math.max(0.18, 1 - d.openProgress * 0.72);
      doorSprite.setVisible(true).setPosition(d.x + d.w / 2, d.y + d.h / 2).setDisplaySize(verticalDoor ? d.w * doorScale : d.h * doorScale, verticalDoor ? d.h * doorScale : d.w * doorScale).setRotation(verticalDoor ? 0 : Math.PI / 2).setAlpha(d.open ? 0.28 : 0.94).setTint(d.lockdown ? PAL.alarm : d.color);
      g.lineStyle(2, d.lockdown ? PAL.alarm : d.color, d.lockdown ? 0.9 : 0.72).strokeRect(d.x, d.y, d.w, d.h);
      if (d.lockdown) { g.lineStyle(2, PAL.alarm, 0.7); g.lineBetween(d.x, d.y, d.x + d.w, d.y + d.h); g.lineBetween(d.x + d.w, d.y, d.x, d.y + d.h); }
    }
    var liftPulse = kit.juice.enabled ? 1 + Math.sin(this.simTime * 4) * 0.08 : 1; this.visual.lift.setVisible(true).setPosition(this.floor.lift.x, this.floor.lift.y).setScale(liftPulse).setTint(this.floor.lift.active ? PAL.green : PAL.wallHi);
    for (var cardIndex = 0; cardIndex < this.floor.cards.length; cardIndex++) { var card = this.floor.cards[cardIndex], cardSprite = this.visual.cards[cardIndex], bob = kit.juice.enabled ? Math.sin(this.simTime * 4 + card.bob) * 5 : 0; cardSprite.setVisible(!card.got).setPosition(card.x, card.y + bob).setScale(0.78).setTint(card.color); }
    var vent = this.floor.vent; if (vent) this.visual.vent.setVisible(true).setPosition(vent.x, vent.y).setTint(vent.discovered ? PAL.cyan : PAL.wallHi);
    for (var cameraIndex = 0; cameraIndex < this.floor.cameras.length; cameraIndex++) { var camera = this.floor.cameras[cameraIndex], cameraPulse = 0.6 + Math.sin(this.simTime * 5 + camera.scan) * 0.22; g.fillStyle(camera.disabled ? PAL.slate : camera.alert > 0.55 ? PAL.alarm : PAL.blue, camera.disabled ? 0.5 : 0.22).fillCircle(camera.x, camera.y, 16); g.fillStyle(camera.disabled ? PAL.slate : camera.alert > 0.55 ? PAL.alarm : PAL.blue, 1).fillCircle(camera.x, camera.y, 5 + cameraPulse * 2); g.lineStyle(2, camera.disabled ? PAL.wall : camera.alert > 0.55 ? PAL.alarm : PAL.blue, 0.8).strokeRect(camera.x - 9, camera.y - 7, 18, 14); }
    for (var hazardIndex = 0; hazardIndex < this.floor.hazards.length; hazardIndex++) { var hazard = this.floor.hazards[hazardIndex], pulse = 0.5 + Math.sin(this.simTime * 4 + hazard.pulse) * 0.18; if (hazard.type === 'heat' || hazard.type === 'bio') { g.fillStyle(hazard.type === 'bio' ? PAL.green : PAL.orange, pulse * 0.18).fillCircle(hazard.x, hazard.y, hazard.radius); g.lineStyle(2, hazard.type === 'bio' ? PAL.green : PAL.amber, pulse).strokeCircle(hazard.x, hazard.y, hazard.radius); } else if (hazard.type === 'crossfire' || hazard.type === 'blacksite') { g.fillStyle(PAL.rose, pulse * 0.22).fillRect(hazard.x - hazard.w / 2, hazard.y - hazard.h / 2, hazard.w, hazard.h); g.lineStyle(2, PAL.rose, pulse).strokeRect(hazard.x - hazard.w / 2, hazard.y - hazard.h / 2, hazard.w, hazard.h); } else if (hazard.type === 'relay') { g.lineStyle(2, PAL.cyan, pulse).strokeCircle(hazard.x, hazard.y, hazard.radius); g.fillStyle(PAL.cyan, pulse).fillCircle(hazard.x, hazard.y, 5); } else if (hazard.type === 'core') { g.lineStyle(3, PAL.gold, pulse).strokeCircle(hazard.x, hazard.y, hazard.radius); } }
    if (this.run.tutorialActive && this.run.tutorialStep === 0 && this.floor.tutorialTarget) { var targetPulse = 1 + Math.sin(this.simTime * 5) * 0.12; g.lineStyle(3, PAL.cyan, 0.9).strokeCircle(this.floor.tutorialTarget.x, this.floor.tutorialTarget.y, 18 * targetPulse); g.lineStyle(2, PAL.white, 0.7).lineBetween(this.floor.tutorialTarget.x - 26, this.floor.tutorialTarget.y, this.floor.tutorialTarget.x - 8, this.floor.tutorialTarget.y); }
    /* Room names stay out of live play; the compact R# meter and room borders carry route state. */
  };
  PlayScene.prototype.drawCone = function (g, x, y, angle, length, spread, color, alpha) {
    var segments = kit.juice.enabled ? 8 : 4;
    for (var i = 0; i < segments; i++) {
      var a0 = angle - spread + spread * 2 * i / segments, a1 = angle - spread + spread * 2 * (i + 1) / segments;
      g.fillStyle(color, alpha * (1 - i * 0.035)); g.fillTriangle(x, y, x + Math.cos(a0) * length, y + Math.sin(a0) * length, x + Math.cos(a1) * length, y + Math.sin(a1) * length);
    }
  };
  PlayScene.prototype.drawShadowOcclusion = function (g, cover, lightX, lightY) {
    var corners = [{ x: cover.x, y: cover.y }, { x: cover.x + cover.w, y: cover.y }, { x: cover.x + cover.w, y: cover.y + cover.h }, { x: cover.x, y: cover.y + cover.h }], farA = corners[0], farB = corners[0];
    var farScoreA = -Infinity, farScoreB = -Infinity;
    for (var i = 0; i < corners.length; i++) { var score = distance(corners[i].x, corners[i].y, lightX, lightY); if (score > farScoreA) { farScoreB = farScoreA; farB = farA; farScoreA = score; farA = corners[i]; } else if (score > farScoreB) { farScoreB = score; farB = corners[i]; } }
    var dxA = farA.x - lightX, dyA = farA.y - lightY, dxB = farB.x - lightX, dyB = farB.y - lightY;
    g.fillStyle(PAL.shadow, 0.34).fillTriangle(farA.x, farA.y, farA.x + dxA * 0.8, farA.y + dyA * 0.8, farB.x + dxB * 0.8, farB.y + dyB * 0.8);
    g.fillTriangle(farA.x, farA.y, farB.x, farB.y, farB.x + dxB * 0.8, farB.y + dyB * 0.8);
  };
  PlayScene.prototype.drawLighting = function () {
    var shadows = this.shadows, glow = this.lightGlow, alarm = this.run.alarm;
    shadows.fillStyle(PAL.shadow, 0.2 + alarm * 0.08).fillRect(0, 0, WORLD_W, WORLD_H);
    for (var coverIndex = 0; coverIndex < this.floor.covers.length; coverIndex++) {
      var cover = this.floor.covers[coverIndex]; if (cover.roomIndex !== this.run.roomIndex) continue;
      this.drawShadowOcclusion(shadows, cover, this.player.x, this.player.y);
    }
    this.drawCone(glow, this.player.x, this.player.y, this.player.face, 230, 0.5, this.floor.family.accent, 0.13);
    for (var cameraIndex = 0; cameraIndex < this.floor.cameras.length; cameraIndex++) {
      var camera = this.floor.cameras[cameraIndex]; if (camera.disabled) continue;
      this.drawCone(glow, camera.x, camera.y, camera.angle, camera.range, camera.spread, camera.alert > 0.55 ? PAL.alarm : PAL.blue, camera.alert > 0.55 ? 0.14 : 0.08);
    }
    if (this.run.muzzleLight.active) {
      var flash = this.run.muzzleLight, flashAlpha = clamp(1 - flash.age / 0.16, 0, 1);
      this.drawCone(glow, flash.x, flash.y, flash.angle, 170, 0.3, flash.color, 0.28 * flashAlpha); glow.fillStyle(flash.color, 0.18 * flashAlpha).fillCircle(flash.x, flash.y, 48 * flashAlpha);
    }
    if (this.run.light.active) { var light = this.run.light, fade = clamp(1 - light.age / 1.15, 0, 1); glow.fillStyle(light.color, fade * 0.18).fillCircle(light.x, light.y, 66); }
    if (alarm > 0.18) { glow.fillStyle(PAL.alarm, alarm * 0.045).fillRect(0, 0, WORLD_W, WORLD_H); glow.lineStyle(2, PAL.alarm, alarm * 0.24).strokeRect(20, 20, WORLD_W - 40, WORLD_H - 40); }
  };
  PlayScene.prototype.addWorldLabel = function () {};
  PlayScene.prototype.drawEntities = function () {
    var g = this.entities;
    for (var i = 0; i < this.pickups.length; i++) { var p = this.pickups[i], pickupSprite = this.visual.pickups[i]; if (!p.active) { pickupSprite.setVisible(false); continue; } var bob = kit.juice.enabled ? Math.sin(this.simTime * 3 + p.bob) * 4 : 0, pickupKey = 'pickup-' + p.type; pickupSprite.setTexture(pickupKey).setVisible(true).setPosition(p.x, p.y + bob).setScale(0.72); }
    for (var bi = 0; bi < this.bullets.length; bi++) { var b = this.bullets[bi]; if (!b.active) continue; g.fillStyle(b.color, 0.24).fillCircle(b.x, b.y, b.radius * 3); g.fillStyle(b.color, 1).fillCircle(b.x, b.y, b.radius); }
    for (var ei = 0; ei < this.enemies.length; ei++) { var e = this.enemies[ei]; if (!e.active) { this.visual.enemies[ei].setVisible(false); continue; } this.drawEnemy(g, e, ei); }
    this.drawPlayer(g);
  };
  PlayScene.prototype.drawPlayer = function (g) {
    var p = this.player, alpha = p.invuln > 0 && Math.floor(this.simTime * 18) % 2 ? 0.45 : 1;
    var playerPulse = p.animState === 'move' ? 1 + Math.sin(p.movePhase) * 0.035 : p.animState === 'fire' ? 1.08 : p.fireRecover > 0 ? 0.96 : 1;
    this.visual.player.setTexture('operator-' + p.animState).setVisible(true).setPosition(p.x, p.y).setRotation(p.face).setAlpha(alpha).setScale((0.72 + p.recoil * 0.08) * playerPulse);
    if (p.stealth) { g.lineStyle(2, PAL.cyan, 0.55).strokeCircle(p.x, p.y, 24 + Math.sin(this.simTime * 4) * 2); g.fillStyle(PAL.cyan, 0.08).fillCircle(p.x, p.y, 30); }
  };
  PlayScene.prototype.drawEnemy = function (g, e, index) {
    var sprite = this.visual.enemies[index], textureKey = this.textures.exists('enemy-' + e.kind) ? 'enemy-' + e.kind : e.kind === 'hunter' ? 'enemy-flanker' : e.kind === 'swarm' ? 'enemy-scout' : 'enemy-scout';
    var pulse = e.animState === 'move' ? 1 + Math.sin(e.animTime * 12) * 0.045 : e.animState === 'anticipation' ? 0.88 + Math.sin(e.animTime * 24) * 0.04 : e.animState === 'attack' ? 1.13 : e.animState === 'recovery' ? 1.02 : e.boss && kit.juice.enabled ? 1 + Math.sin(this.simTime * 5) * 0.05 : 1;
    sprite.setTexture(textureKey).setVisible(true).setPosition(e.x, e.y).setRotation(e.facing).setScale((e.radius / 24) * pulse).setAlpha(e.flash > 0 ? 0.55 : 1).setTint(e.color);
    if (e.animState === 'telegraph' && e.telegraph > 0) { var telegraphAlpha = clamp(e.telegraph / 0.68, 0.18, 0.86); g.lineStyle(3, e.phase === 2 ? PAL.amber : PAL.rose, telegraphAlpha).strokeCircle(e.x, e.y, e.radius + 18 + Math.sin(this.simTime * 14) * 4); if (e.phase === 2) for (var ray = 0; ray < 10; ray++) g.lineBetween(e.x, e.y, e.x + Math.cos(ray * TAU / 10 + this.simTime * 0.4) * 120, e.y + Math.sin(ray * TAU / 10 + this.simTime * 0.4) * 120); else g.lineBetween(e.x, e.y, e.x + Math.cos(e.facing) * 180, e.y + Math.sin(e.facing) * 180); }
    if (e.alert > 0 && !e.boss) { var alertPulse = 1 + Math.sin(this.simTime * 12 + e.seed * 7) * 0.16; g.lineStyle(2, PAL.alarm, 0.62).strokeCircle(e.x, e.y, (e.radius + 13) * alertPulse); g.fillStyle(PAL.alarm, 0.9).fillCircle(e.x, e.y - e.radius - 21, 3 + (e.alert > 2 ? 2 : 0)); }
    if (e.hp < e.maxHp) { g.fillStyle(PAL.shadow, 1).fillRect(e.x - e.radius, e.y - e.radius - 12, e.radius * 2, 4); g.fillStyle(e.boss ? PAL.gold : PAL.red, 1).fillRect(e.x - e.radius, e.y - e.radius - 12, e.radius * 2 * clamp(e.hp / e.maxHp, 0, 1), 4); }
  };
  PlayScene.prototype.drawEffects = function () {
    var g = this.fx;
    for (var existingPopupIndex = 0; existingPopupIndex < this.worldPopupTexts.length; existingPopupIndex++) this.worldPopupTexts[existingPopupIndex].setVisible(false);
    for (var particleSystemIndex = 0; particleSystemIndex < PARTICLE_SYSTEMS.length; particleSystemIndex++) { var particlePool = this.particleSystems[PARTICLE_SYSTEMS[particleSystemIndex]]; for (var particleIndex = 0; particleIndex < particlePool.length; particleIndex++) { var p = particlePool[particleIndex]; if (!p.active) continue; var particleAlpha = clamp(p.life / p.max, 0, 1) * 0.9; g.fillStyle(p.color, particleAlpha); if (p.type === 'muzzle') g.fillTriangle(p.x + p.size * 4, p.y, p.x - p.size, p.y - p.size, p.x - p.size, p.y + p.size); else if (p.type === 'smoke') g.fillCircle(p.x, p.y, p.size * 1.35); else if (p.type === 'coolant') { g.fillCircle(p.x, p.y, p.size); g.lineStyle(1, PAL.white, particleAlpha * 0.72).lineBetween(p.x, p.y, p.x - p.vx * 0.06, p.y - p.vy * 0.06); } else if (p.type === 'death' || p.type === 'boss') g.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2); else if (p.type === 'telegraph' || p.type === 'phase') g.lineStyle(2, p.color, particleAlpha).strokeCircle(p.x, p.y, p.size * 3); else g.fillCircle(p.x, p.y, p.size); } }
    for (var r = 0; r < this.rings.length; r++) { var ring = this.rings[r]; if (!ring.active) continue; g.lineStyle(ring.width, ring.color, clamp(ring.life / 0.34, 0, 1)).strokeCircle(ring.x, ring.y, ring.radius); }
    for (var deathIndex = 0; deathIndex < this.deathActors.length; deathIndex++) { var death = this.deathActors[deathIndex]; if (!death.active) continue; var deathAlpha = clamp(death.life / death.max, 0, 1); g.lineStyle(3, death.color, deathAlpha); g.strokeCircle(death.x, death.y, death.radius * (1.2 + death.phase * 0.06)); g.lineBetween(death.x - death.radius, death.y - death.radius, death.x + death.radius, death.y + death.radius); g.lineBetween(death.x + death.radius, death.y - death.radius, death.x - death.radius, death.y + death.radius); }
    this.worldPopupCursor = 0; for (var pidx = 0; pidx < this.popups.length; pidx++) { var pop = this.popups[pidx]; if (!pop.active) continue; this.drawWorldPopup(pop); }
  };
  PlayScene.prototype.drawWorldPopup = function () {};
  PlayScene.prototype.drawHud = function () {
    var W = this.layout.W, H = this.layout.H, g = this.ui, f = this.floor, w = WEAPONS[this.player.weapon], ws = this.run.weapons[this.player.weapon];
    g.fillStyle(PAL.ink, 0.88).fillRoundedRect(12, 12, W - 24, 74, 12); g.lineStyle(1, PAL.wall, 0.82).strokeRoundedRect(12, 12, W - 24, 74, 12);
    g.fillStyle(PAL.wall, 0.7).fillRect(24, 78, W - 48, 3); g.fillStyle(this.player.health > 35 ? PAL.green : PAL.red, 1).fillRect(24, 78, (W - 48) * clamp(this.player.health / this.player.maxHealth, 0, 1), 3);
    var par = this.run.mode === 'speedrun' ? f.family.par * 0.75 : f.family.par;
    setTextIfChanged(this.hud.floor, 'F' + String(this.run.floorNo).padStart(2, '0'));
    setTextIfChanged(this.hud.room, 'R' + (this.run.roomIndex + 1) + '/5  ·  ◆' + this.run.cardsFound + '/4');
    setTextIfChanged(this.hud.score, fmtInt(this.run.score)); setTextIfChanged(this.hud.time, fmtTime(this.run.floorTime));
    setTextIfChanged(this.hud.weapon, w.short); setTextIfChanged(this.hud.ammo, ws.reload > 0 ? 'RLD ' + ws.reload.toFixed(1) : ws.mag + '/' + ws.reserve);
    setTextIfChanged(this.hud.hp, '♥' + Math.ceil(this.player.health) + '  +' + this.player.armor);
    setTextIfChanged(this.hud.mode, this.run.mode === 'speedrun' ? 'SPD' : 'STD'); setTextIfChanged(this.hud.auto, this.inputState.autoAim ? 'AUTO' : 'MAN'); setTextIfChanged(this.hud.alarm, this.run.alarm > 0.35 ? '!' : this.player.stealth ? '◈' : '');
    this.hud.title.setVisible(false); this.hud.cards.setVisible(false);
    this.hud.floor.setColor(colorCss(f.family.accent)); this.hud.score.setColor(CSS.white); this.hud.time.setColor(this.run.floorTime <= par ? CSS.green : CSS.amber);
    this.hud.room.setColor(this.run.cardsFound >= 3 ? CSS.green : CSS.mist); this.hud.weapon.setColor(colorCss(w.color)); this.hud.ammo.setColor(ws.reload > 0 ? CSS.amber : CSS.white);
    this.hud.hp.setColor(this.player.health > 35 ? CSS.green : CSS.red); this.hud.mode.setColor(this.run.mode === 'speedrun' ? CSS.amber : CSS.mist); this.hud.auto.setColor(this.inputState.autoAim ? CSS.cyan : CSS.mist); this.hud.alarm.setColor(this.run.alarm > 0.35 ? CSS.red : CSS.cyan);
    g.fillStyle(PAL.wall, 0.7).fillRect(W - 96, 78, 72, 3); g.fillStyle(this.run.alarm > 0.35 ? PAL.alarm : PAL.cyan, 0.92).fillRect(W - 96, 78, 72 * this.run.alarm, 3);

    var coachStep = Math.min(3, this.run.tutorialStep), tutorial = ['MOVE TO THE CYAN MARKER', 'AIM AND FIRE AT THE SCOUT', 'SWAP WEAPONS', 'TAKE THE CARD TO OPEN ROUTE'][coachStep];
    if (this.run.tutorialShownStep !== coachStep) { this.run.tutorialShownStep = coachStep; this.run.tutorialFade = 0; }
    var coachVisible = this.run.state === 'play' && this.run.tutorialActive && !profile.tutorialDone && !this.run.banner.active && this.toastAge <= 0;
    if (coachVisible) {
      var coachAlpha = kit.juice.enabled ? clamp(1 - Math.max(0, this.run.tutorialFade - 3) / 0.45, 0.18, 1) : (this.run.tutorialFade > 3 ? 0.28 : 0.82);
      g.fillStyle(PAL.deep, 0.62 * coachAlpha).fillRoundedRect(12, 91, W - 24, 26, 8); g.lineStyle(1, PAL.amber, 0.34 * coachAlpha).strokeRoundedRect(12, 91, W - 24, 26, 8);
      setTextIfChanged(this.hud.tip, tutorial); this.hud.tip.setAlpha(coachAlpha).setVisible(true);
    } else this.hud.tip.setAlpha(0).setVisible(false);

    var contextPrompt = this.floor.vent.discovered && distance(this.player.x, this.player.y, this.floor.vent.x, this.floor.vent.y) < 32 ? 'F · VENT' : '';
    var noticeVisible = this.run.state === 'play' && !this.run.banner.active && !coachVisible && (this.toastAge > 0 || !!contextPrompt);
    var noticeText = this.toastAge > 0 ? this.toastText : contextPrompt;
    if (noticeVisible) {
      setTextIfChanged(this.hud.prompt, noticeText); this.hud.prompt.setColor(this.toastAge > 0 ? colorCss(this.toastColor) : CSS.cyan).setVisible(true);
      var noticeProgress = this.toastAge > 0 ? 1 - this.toastAge : 0, noticeAlpha = this.toastAge > 0 && kit.juice.enabled ? clamp(Math.min(noticeProgress / 0.1, (1 - noticeProgress) / 0.12), 0, 1) : 0.82;
      var noticeWidth = Math.min(W - 24, Math.max(88, this.hud.prompt.width + 24));
      g.fillStyle(PAL.deep, 0.82 * noticeAlpha).fillRoundedRect(W - noticeWidth - 12, 114, noticeWidth, 28, 8); g.lineStyle(1, this.toastAge > 0 ? this.toastColor : PAL.cyan, 0.6 * noticeAlpha).strokeRoundedRect(W - noticeWidth - 12, 114, noticeWidth, 28, 8);
      this.hud.prompt.setAlpha(noticeAlpha);
    } else this.hud.prompt.setAlpha(0).setVisible(false);
    this.drawControls(g); this.drawBanner(g); this.drawDamageVignette();
    for (var choiceIndex = 0; choiceIndex < 9; choiceIndex++) this.hud['floorChoice' + choiceIndex].setVisible(false);
    if (this.run.state === 'dead' || this.run.state === 'victory') this.drawEndCard(g);
  };
  PlayScene.prototype.drawDamageVignette = function () {
    if (this.run.damagePulse <= 0) return;
    var W = this.layout.W, H = this.layout.H, g = this.uiFx, alpha = clamp(this.run.damagePulse, 0, 1) * 0.62;
    g.fillStyle(PAL.red, alpha).fillRect(0, 0, W, 24).fillRect(0, H - 24, W, 24).fillRect(0, 0, 24, H).fillRect(W - 24, 0, 24, H);
  };
  PlayScene.prototype.drawControls = function (g) {
    var l = this.layout, moveX = l.stickX + this.inputState.moveX * 30, moveY = l.stickY + this.inputState.moveY * 30;
    var moveFocus = this.run.tutorialActive && this.run.tutorialStep === 0, aimFocus = this.run.tutorialActive && this.run.tutorialStep === 1, swapFocus = this.run.tutorialActive && this.run.tutorialStep === 2;
    g.fillStyle(PAL.floor2, 0.82).fillCircle(l.stickX, l.stickY, 56); g.lineStyle(2, moveFocus ? PAL.cyan : PAL.wallHi, 0.8).strokeCircle(l.stickX, l.stickY, 56); g.fillStyle(this.inputState.moveId !== null ? PAL.cyan : PAL.wallHi, 0.85).fillCircle(moveX, moveY, 22);
    g.fillStyle(PAL.floor2, 0.72).fillCircle(l.aimX, l.aimY, 56); g.lineStyle(2, aimFocus || this.inputState.directAim ? PAL.cyan : PAL.wallHi, 0.8).strokeCircle(l.aimX, l.aimY, 56); g.lineStyle(1, PAL.wallHi, 0.5).lineBetween(l.aimX - 16, l.aimY, l.aimX + 16, l.aimY).lineBetween(l.aimX, l.aimY - 16, l.aimX, l.aimY + 16); g.fillStyle(this.inputState.directAim ? PAL.cyan : PAL.wallHi, 0.86).fillCircle(l.aimX + this.inputState.aimDX * 30, l.aimY + this.inputState.aimDY * 30, 10);
    g.fillStyle(this.inputState.fireId !== null ? PAL.red : PAL.rose, 0.76).fillRoundedRect(l.fireX - 55, l.fireY - 29, 110, 58, 13); g.lineStyle(2, aimFocus ? PAL.cyan : PAL.white, 0.55).strokeRoundedRect(l.fireX - 55, l.fireY - 29, 110, 58, 13);
    for (var i = 0; i < WEAPONS.length; i++) { var x = 158 + i * Math.max(53, (l.W - 318) / 3), active = i === this.player.weapon; g.fillStyle(active ? WEAPONS[i].color : PAL.floor2, active ? 0.35 : 0.86).fillRoundedRect(x, l.weaponY - 18, 49, 36, 8); g.lineStyle(1, swapFocus ? PAL.cyan : active ? WEAPONS[i].color : PAL.wall, 0.9).strokeRoundedRect(x, l.weaponY - 18, 49, 36, 8); }
  };
  PlayScene.prototype.drawBanner = function () {
    var W = this.layout.W, H = this.layout.H, b = this.run.banner, h = this.hud;
    if (!b.active || !b.boundary || this.run.state === 'dead' || this.run.state === 'victory') { h.bannerHead.setAlpha(0); h.bannerSub.setAlpha(0); h.bannerTiny.setAlpha(0); return; }
    var progress = clamp(b.age / 0.28, 0, 1), settle = clamp((b.age - 0.28) / 0.45, 0, 1), scale = kit.juice.enabled ? (progress < 1 ? 0.9 + progress * 0.1 : 1 + Math.sin(settle * Math.PI) * 0.025) : 1, slide = (1 - progress) * W * 0.16, panelX = W * 0.25 + slide, panelW = Math.max(210, W * 0.5);
    this.ui.fillStyle(PAL.ink, 0.95).fillRoundedRect(panelX, H * 0.28 - 28, panelW, 66, 14); this.ui.lineStyle(2, b.color, 0.9).strokeRoundedRect(panelX, H * 0.28 - 28, panelW, 66, 14);
    h.bannerHead.setPosition(W * 0.5 + slide, H * 0.28 - 4).setText(b.head).setColor(colorCss(b.color)).setScale(scale).setAlpha(clamp(1 - Math.max(0, b.age - 0.86) / 0.32, 0, 1)); h.bannerSub.setPosition(W * 0.5 + slide, H * 0.28 + 20).setText(b.sub).setScale(scale).setAlpha(h.bannerHead.alpha); h.bannerTiny.setAlpha(0);
  };
  PlayScene.prototype.drawEndCard = function (g) {
    var W = this.layout.W, H = this.layout.H, dead = this.run.state === 'dead', reveal = kit.juice.enabled ? clamp(this.run.endReveal, 0, 1) : 1;
    g.fillStyle(PAL.ink, 0.86 * reveal).fillRect(0, 0, W, H); g.fillStyle(PAL.deep, 0.98 * reveal).fillRoundedRect(26, H * 0.18 + (1 - reveal) * 30, W - 52, H * 0.65, 18); g.lineStyle(2, dead ? PAL.red : PAL.gold, 0.9 * reveal).strokeRoundedRect(26, H * 0.18 + (1 - reveal) * 30, W - 52, H * 0.65, 18);
    this.hud.bannerHead.setPosition(W * 0.5, H * 0.27).setText(dead ? 'OPERATOR DOWN' : 'VAULT CLEARED').setColor(dead ? CSS.red : CSS.amber).setScale(1).setAlpha(reveal); this.hud.bannerSub.setPosition(W * 0.5, H * 0.34).setText('SCORE ' + fmtInt(this.run.score) + '  //  BEST ' + fmtInt(profile.bestScore)).setAlpha(reveal); this.hud.bannerTiny.setPosition(W * 0.52, H * 0.41).setText('TAP OR ENTER TO RESTART').setAlpha(reveal);
    var step = (W - 72) / 3, choiceY = H * 0.49;
    for (var choiceIndex = 0; choiceIndex < 9; choiceIndex++) { var floorKey = String(choiceIndex + 1), col = choiceIndex % 3, row = Math.floor(choiceIndex / 3), choiceX = 36 + step * (col + 0.5), choiceRowY = choiceY + row * 48, unlocked = choiceIndex + 1 <= profile.unlockedFloor, medal = profile.medals[floorKey] || 0, time = profile.bestTimes[floorKey]; g.fillStyle(unlocked ? PAL.floor2 : PAL.shadow, 0.94 * reveal).fillRoundedRect(choiceX - step / 2 + 3, choiceRowY, step - 6, 42, 8); g.lineStyle(1, unlocked ? (medal > 0 ? PAL.gold : PAL.wallHi) : PAL.wall, 0.8 * reveal).strokeRoundedRect(choiceX - step / 2 + 3, choiceRowY, step - 6, 42, 8); var label = unlocked ? 'F' + (choiceIndex + 1) + '  ' + (medal ? 'M' + medal : 'OPEN') : 'LOCKED'; var timeLabel = time == null ? '' : fmtTime(time); this.hud['floorChoice' + choiceIndex].setPosition(choiceX, choiceRowY + 21).setText(label + (timeLabel ? '\n' + timeLabel : '')).setColor(unlocked ? CSS.white : CSS.mist).setAlpha(reveal).setVisible(true); }
  };

  function syncDebug(scene) {
    if (!scene || !scene.floor) return;
    var room = scene.floor.rooms[scene.run.roomIndex] || scene.floor.rooms[0];
    DP_DEBUG_STATE.mode = scene.run.mode; DP_DEBUG_STATE.score = Math.floor(scene.run.score); DP_DEBUG_STATE.floor = scene.run.floorNo; DP_DEBUG_STATE.room = room ? room.id : ''; DP_DEBUG_STATE.weapon = WEAPONS[scene.player.weapon].key; DP_DEBUG_STATE.cards = scene.run.cardsFound; DP_DEBUG_STATE.cardsTotal = scene.floor.cards.length; DP_DEBUG_STATE.roomClear = !!(room && room.cleared); DP_DEBUG_STATE.bossPhase = scene.enemies.reduce(function (phase, e) { return e.active && e.boss ? e.phase : phase; }, 0);
    DP_DEBUG_STATE.forceFloor = debugApi.forceFloor || DP_DEBUG_STATE.forceFloor || 0;
    DP_DEBUG_STATE.forceRoom = debugApi.forceRoom || DP_DEBUG_STATE.forceRoom || '';
  }

  function syncHiDpi(game) {
    var cssW = Math.max(1, Math.floor(document.documentElement.clientWidth || window.innerWidth || 1));
    var cssH = Math.max(1, Math.floor(document.documentElement.clientHeight || window.innerHeight || 1));
    GGKit.hiDpi.resize(game, cssW, cssH);
  }

  var config = {
    type: Phaser.AUTO, parent: 'game', width: 390, height: 700, backgroundColor: '#071116',
    render: Object.assign({}, GGKit.renderDefaults, { roundPixels: true }), scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { activePointers: 4, gamepad: true }, scene: PlayScene
  };
  Game.phaser = new Phaser.Game(config);
  syncHiDpi(Game.phaser);
  window.addEventListener('resize', function () { syncHiDpi(Game.phaser); });
  window.addEventListener('orientationchange', function () { syncHiDpi(Game.phaser); });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) syncHiDpi(Game.phaser);
  });
  if (typeof window !== 'undefined') window.__DP_SCENE = function () { return Game.scene; };
}());
